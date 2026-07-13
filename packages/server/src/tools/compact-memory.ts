import { z } from 'zod'
import { query, queryOne, pool } from '../db/client.js'
import { generateEmbedding, generateText, buildEmbeddingText } from '../embeddings/ollama.js'
import { NON_COMPACTABLE_TYPES, COMPACTION_DEFAULTS } from '../types/index.js'
import type { Area, EntryType, MemoryEntry } from '../types/index.js'

export const CompactMemorySchema = z.object({
  project_slug: z.string().describe('Project to compact'),
  area: z.enum(['frontend', 'backend', 'infra', 'general']).optional()
    .describe('Compact only this area. Omit to compact all areas.'),
  types: z.array(z.enum([
    'BUG', 'FIX', 'DECISION', 'INSIGHT', 'PATTERN',
    'ANTI_PATTERN', 'REPOSITORY_NOTE', 'TASK_CONTEXT', 'SUMMARY',
  ])).optional()
    .describe('Entry types to compact. Defaults to all compactable types (excludes SUMMARY and TASK_CONTEXT).'),
  older_than_days: z.number().int().min(1).optional()
    .default(COMPACTION_DEFAULTS.OLDER_THAN_DAYS)
    .describe('Only consider entries not updated in this many days.'),
  max_access_count: z.number().int().min(0).optional()
    .default(COMPACTION_DEFAULTS.MAX_ACCESS_COUNT)
    .describe('Only compact entries with fewer accesses than this threshold.'),
  last_accessed_days: z.number().int().min(1).optional()
    .default(COMPACTION_DEFAULTS.LAST_ACCESSED_DAYS)
    .describe('Only compact entries not accessed in this many days (or never accessed).'),
  max_entries_per_summary: z.number().int().min(5).max(50).optional()
    .default(COMPACTION_DEFAULTS.MAX_ENTRIES_PER_SUMMARY)
    .describe('Max entries per generated SUMMARY.'),
  dry_run: z.boolean().optional().default(true)
    .describe('If true (default), simulate compaction without making changes. Always run dry_run first.'),
})

export type CompactMemoryInput = z.infer<typeof CompactMemorySchema>

// ── Tipos internos ────────────────────────────────────────────────────────────

interface CandidateEntry extends Omit<MemoryEntry, 'embedding'> {
  project_slug: string
}

interface CompactionGroup {
  area: Area
  type: EntryType
  entries: CandidateEntry[]
}

interface SummaryCreated {
  summary_id: string
  area: Area
  type: EntryType
  title: string
  entries_archived: number
  entry_ids: string[]
}

interface CompactResult {
  dry_run: boolean
  project_slug: string
  candidates_found: number
  entries_kept: number        // no cumplen criterios
  groups: number              // cantidad de grupos a compactar
  summaries_created: number
  entries_archived: number
  summaries?: SummaryCreated[]             // solo en dry_run o con detalle
  skipped_types: string[]     // tipos excluidos por política
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function buildCompactionPrompt(
  entries: CandidateEntry[],
  area: Area,
  type: EntryType
): string {
  const entriesText = entries
    .map((e, i) =>
      `--- Entry ${i + 1} ---
ID: ${e.id}
Title: ${e.title}
Date: ${new Date(e.created_at).toISOString().split('T')[0]}
Author: ${e.author}
Tags: ${e.tags.join(', ') || 'none'}
Content:
${e.content}`
    )
    .join('\n\n')

  return `You are a technical knowledge preservation assistant.
Your task is to compact ${entries.length} memory entries of type "${type}" from the "${area}" area into a single structured SUMMARY.

CRITICAL RULES:
- NEVER lose specific technical details: version numbers, exact commands, file paths, package names, error codes
- Preserve the most important insights even if they seem redundant
- Group similar issues/decisions together
- For BUG/FIX entries: always keep the exact fix/solution, not just the problem description
- For DECISION entries: always keep the reasoning, not just the decision
- Reference the original entry IDs for the most critical items

OUTPUT FORMAT (use exactly this structure):

## Executive Summary
[2-3 sentences describing the period and main themes covered]

## Key Knowledge Preserved
[Detailed bullets — each one must be technically specific and actionable]

## Critical Entry IDs
[List of entry IDs that contain details worth consulting directly if needed]
Format: - <id>: <one-line reason why it's critical>

## Coverage
Period: <earliest date> → <latest date>
Entries compacted: ${entries.length}
Area: ${area} | Type: ${type}

---
ENTRIES TO COMPACT:

${entriesText}`
}

// ── Lógica principal ──────────────────────────────────────────────────────────

async function findCandidates(
  projectSlug: string,
  input: CompactMemoryInput
): Promise<CandidateEntry[]> {
  // Tipos permitidos: todos los compactables menos los excluidos por política
  const requestedTypes = input.types
    ? input.types.filter((t) => !NON_COMPACTABLE_TYPES.includes(t as any))
    : undefined

  const typeFilter = requestedTypes && requestedTypes.length > 0
    ? `AND me.type IN (${requestedTypes.map((t) => `'${t}'`).join(',')})`
    : `AND me.type NOT IN (${NON_COMPACTABLE_TYPES.map((t) => `'${t}'`).join(',')})`

  const areaFilter = input.area ? `AND me.area = '${input.area}'` : ''

  return query<CandidateEntry>(
    `SELECT me.id, me.project_id, p.slug AS project_slug,
            me.area, me.type, me.title, me.content,
            me.tags, me.author, me.status,
            me.archived_into, me.access_count, me.last_accessed,
            me.created_at, me.updated_at
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     WHERE p.slug = $1
       AND me.status = 'active'
       ${typeFilter}
       ${areaFilter}
       AND me.updated_at < NOW() - INTERVAL '${input.older_than_days} days'
       AND me.access_count < ${input.max_access_count}
       AND (
         me.last_accessed IS NULL
         OR me.last_accessed < NOW() - INTERVAL '${input.last_accessed_days} days'
       )
     ORDER BY me.area, me.type, me.created_at ASC`,
    [projectSlug]
  )
}

function groupCandidates(
  candidates: CandidateEntry[],
  maxPerGroup: number
): CompactionGroup[] {
  // Agrupar por área + tipo
  const map = new Map<string, CandidateEntry[]>()
  for (const entry of candidates) {
    const key = `${entry.area}:${entry.type}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }

  // Dividir grupos grandes en chunks de max maxPerGroup
  const groups: CompactionGroup[] = []
  for (const [key, entries] of map) {
    const [area, type] = key.split(':') as [Area, EntryType]
    const chunks = chunkArray(entries, maxPerGroup)
    for (const chunk of chunks) {
      groups.push({ area, type, entries: chunk })
    }
  }

  return groups
}

async function compactGroup(
  group: CompactionGroup,
  projectSlug: string
): Promise<SummaryCreated> {
  // 1. Generar texto del SUMMARY con el LLM
  const prompt  = buildCompactionPrompt(group.entries, group.area, group.type)
  const content = await generateText(prompt)

  const dateRange = (() => {
    const dates = group.entries.map((e) => new Date(e.created_at).getTime())
    const from  = new Date(Math.min(...dates)).toISOString().split('T')[0]
    const to    = new Date(Math.max(...dates)).toISOString().split('T')[0]
    return from === to ? from : `${from} → ${to}`
  })()

  const title = `[COMPACTED] ${group.type} · ${group.area} · ${dateRange} (${group.entries.length} entries)`

  // 2. Generar embedding del SUMMARY
  const embeddingText = buildEmbeddingText(title, content, [group.type, group.area, 'compacted'])
  const embedding     = await generateEmbedding(embeddingText)
  const embeddingStr  = `[${embedding.join(',')}]`

  // 3. Resolver project_id
  const project = await queryOne<{ id: string }>(
    'SELECT id FROM projects WHERE slug = $1',
    [projectSlug]
  )
  if (!project) throw new Error(`Project not found: ${projectSlug}`)

  const client = await pool.connect()
  let summaryId: string
  try {
    await client.query('BEGIN')

    // 4. Insertar el SUMMARY
    const summaryRow = await client.query<{ id: string }>(
      `INSERT INTO memory_entries
         (project_id, area, type, title, content, tags, author, status, embedding)
       VALUES ($1, $2, 'SUMMARY', $3, $4, $5, 'system:compact_memory', 'active', $6::vector)
       RETURNING id`,
      [
        project.id,
        group.area,
        title,
        content,
        [group.type.toLowerCase(), group.area, 'compacted'],
        embeddingStr,
      ]
    )
    summaryId = summaryRow.rows[0].id

    // 5. Archivar las entradas originales apuntando al SUMMARY
    const entryIds = group.entries.map((e) => e.id)
    await client.query(
      `UPDATE memory_entries
       SET status       = 'archived',
           archived_into = $1
       WHERE id = ANY($2::uuid[])`,
      [summaryId, entryIds]
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return {
    summary_id:       summaryId,
    area:             group.area,
    type:             group.type,
    title,
    entries_archived: group.entries.length,
    entry_ids:        group.entries.map((e) => e.id),
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function compactMemory(input: CompactMemoryInput): Promise<CompactResult> {
  const { project_slug, dry_run, max_entries_per_summary } = input

  // Tipos que se saltearán por política (no compactables)
  const requestedTypes = input.types ?? []
  const skipped = requestedTypes.filter((t) =>
    NON_COMPACTABLE_TYPES.includes(t as any)
  )

  // 1. Encontrar candidatos
  const candidates = await findCandidates(project_slug, input)

  if (candidates.length === 0) {
    return {
      dry_run,
      project_slug,
      candidates_found: 0,
      entries_kept: 0,
      groups: 0,
      summaries_created: 0,
      entries_archived: 0,
      summaries: [],
      skipped_types: skipped,
    }
  }

  // 2. Agrupar por área + tipo
  const groups = groupCandidates(candidates, max_entries_per_summary!)

  // 3. Si es dry_run, retornar preview sin ejecutar nada
  if (dry_run) {
    return {
      dry_run: true,
      project_slug,
      candidates_found: candidates.length,
      entries_kept: 0,
      groups: groups.length,
      summaries_created: groups.length,
      entries_archived: candidates.length,
      skipped_types: skipped,
      summaries: groups.map((g) => ({
        summary_id:       'dry-run — not created',
        area:             g.area,
        type:             g.type,
        title:            `[COMPACTED] ${g.type} · ${g.area} (${g.entries.length} entries)`,
        entries_archived: g.entries.length,
        entry_ids:        g.entries.map((e) => e.id),
      })),
    }
  }

  // 4. Ejecutar compactación grupo por grupo
  const summaries: SummaryCreated[] = []
  for (const group of groups) {
    const result = await compactGroup(group, project_slug)
    summaries.push(result)
  }

  return {
    dry_run:           false,
    project_slug,
    candidates_found:  candidates.length,
    entries_kept:      0,
    groups:            groups.length,
    summaries_created: summaries.length,
    entries_archived:  summaries.reduce((acc, s) => acc + s.entries_archived, 0),
    summaries,
    skipped_types:     skipped,
  }
}

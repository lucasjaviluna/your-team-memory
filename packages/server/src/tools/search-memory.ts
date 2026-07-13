import { z } from 'zod'
import { query } from '../db/client.js'
import { logAccess } from '../db/access-log.js'
import { generateEmbedding } from '../embeddings/ollama.js'
import { SEARCH_EXCLUDED_TYPES } from '../types/index.js'
import type { SearchResult } from '../types/index.js'

export const SearchMemorySchema = z.object({
  query: z.string().min(2).describe('Natural language search query'),
  project_slug: z.string().optional().describe('Filter by project slug'),
  area: z.enum(['frontend', 'backend', 'infra', 'general']).optional(),
  type: z.enum([
    'BUG', 'FIX', 'DECISION', 'INSIGHT', 'PATTERN',
    'ANTI_PATTERN', 'REPOSITORY_NOTE', 'TASK_CONTEXT', 'SUMMARY',
  ]).optional(),
  limit: z.number().int().min(1).max(20).optional().default(5),
})

export type SearchMemoryInput = z.infer<typeof SearchMemorySchema>

const RRF_K = 60

export async function searchMemory(input: SearchMemoryInput): Promise<SearchResult[]> {
  const { query: searchQuery, project_slug, area, type, limit } = input

  // SUMMARY excluido de búsqueda — solo disponible via get_context
  const excludedTypes = type ? [] : SEARCH_EXCLUDED_TYPES

  const projectFilter = project_slug
    ? `AND p.slug = '${project_slug.replace(/'/g, "''")}'`
    : ''
  const areaFilter  = area ? `AND me.area = '${area}'`   : ''
  const typeFilter  = type
    ? `AND me.type = '${type}'`
    : `AND me.type NOT IN (${excludedTypes.map((t) => `'${t}'`).join(',')})`
  const baseFilters = `me.status = 'active' ${projectFilter} ${areaFilter} ${typeFilter}`

  // 1. Búsqueda vectorial
  const embedding    = await generateEmbedding(searchQuery)
  const embeddingStr = `[${embedding.join(',')}]`

  const vectorResults = await query<{ id: string; rank: number }>(
    `SELECT me.id,
            ROW_NUMBER() OVER (ORDER BY me.embedding <=> $1::vector) AS rank
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     WHERE ${baseFilters}
       AND me.embedding IS NOT NULL
     ORDER BY me.embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit! * 3]
  )

  // 2. Full-Text Search
  const ftsResults = await query<{ id: string; rank: number }>(
    `SELECT me.id,
            ROW_NUMBER() OVER (
              ORDER BY ts_rank(
                to_tsvector('english', me.title || ' ' || me.content),
                plainto_tsquery('english', $1)
              ) DESC
            ) AS rank
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     WHERE ${baseFilters}
       AND to_tsvector('english', me.title || ' ' || me.content)
           @@ plainto_tsquery('english', $1)
     LIMIT $2`,
    [searchQuery, limit! * 3]
  )

  // 3. RRF — combinar rankings
  const scores = new Map<string, number>()
  for (const row of vectorResults) {
    const current = scores.get(row.id) ?? 0
    scores.set(row.id, current + 1 / (RRF_K + Number(row.rank)))
  }
  for (const row of ftsResults) {
    const current = scores.get(row.id) ?? 0
    scores.set(row.id, current + 1 / (RRF_K + Number(row.rank)))
  }

  if (scores.size === 0) return []

  const topIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  if (topIds.length === 0) return []

  // 4. Fetch datos completos
  const placeholders = topIds.map((_, i) => `$${i + 1}`).join(',')
  const entries = await query<Omit<SearchResult, 'score'>>(
    `SELECT me.id, me.project_id, p.slug AS project_slug,
            me.area, me.type, me.title, me.content,
            me.tags, me.author, me.status,
            me.access_count, me.last_accessed,
            me.created_at, me.updated_at
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     WHERE me.id IN (${placeholders})`,
    topIds
  )

  // 5. Registrar accesos en background (no bloquea)
  logAccess(topIds, 'search_memory')

  // 6. Ordenar por score RRF y retornar
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  return topIds
    .map((id) => {
      const entry = entryMap.get(id)
      if (!entry) return null
      return { ...entry, score: scores.get(id)! }
    })
    .filter((e): e is SearchResult => e !== null)
}

import { z } from 'zod'
import { query } from '../db/client.js'
import { logAccess } from '../db/access-log.js'
import { PRIORITY_TYPES } from '../types/index.js'
import type { MemoryEntry } from '../types/index.js'

export const GetContextSchema = z.object({
  project_slug: z.string().describe('Project slug to load context for'),
  area: z.enum(['frontend', 'backend', 'infra', 'general']).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
})

export type GetContextInput = z.infer<typeof GetContextSchema>

interface ContextEntry extends Omit<MemoryEntry, 'embedding'> {
  project_slug: string
  access_count: number
  last_accessed: Date | null
}

interface ContextSummary {
  project_slug: string
  area_filter?: string
  total_entries: number
  entries_by_type: Record<string, number>
  priority_entries: ContextEntry[]   // SUMMARY y TASK_CONTEXT — siempre primero
  entries: ContextEntry[]            // resto del conocimiento activo
  loaded_at: string
}

export async function getContext(input: GetContextInput): Promise<ContextSummary> {
  const { project_slug, area, limit } = input

  const areaFilter  = area ? `AND me.area = $2` : ''
  const params: unknown[] = area
    ? [project_slug, area, limit]
    : [project_slug, limit]
  const limitParam  = `$${area ? 3 : 2}`
  const priorityList = PRIORITY_TYPES.map((t) => `'${t}'`).join(',')

  // 1. SUMMARY y TASK_CONTEXT — siempre, sin filtro de área
  const priorityEntries = await query<ContextEntry>(
    `SELECT me.id, me.project_id, p.slug AS project_slug,
            me.area, me.type, me.title, me.content,
            me.tags, me.author, me.status,
            me.access_count, me.last_accessed,
            me.created_at, me.updated_at
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     WHERE p.slug = $1
       AND me.status = 'active'
       AND me.type IN (${priorityList})
     ORDER BY
       CASE me.type
         WHEN 'SUMMARY'      THEN 1
         WHEN 'TASK_CONTEXT' THEN 2
         ELSE 3
       END,
       me.updated_at DESC
     LIMIT 10`,
    [project_slug]
  )

  // 2. Resto del conocimiento activo (excluye SUMMARY y TASK_CONTEXT)
  const entries = await query<ContextEntry>(
    `SELECT me.id, me.project_id, p.slug AS project_slug,
            me.area, me.type, me.title, me.content,
            me.tags, me.author, me.status,
            me.access_count, me.last_accessed,
            me.created_at, me.updated_at
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     WHERE p.slug = $1
       AND me.status = 'active'
       AND me.type NOT IN (${priorityList})
       ${areaFilter}
     ORDER BY
       CASE me.type
         WHEN 'DECISION'         THEN 1
         WHEN 'REPOSITORY_NOTE'  THEN 2
         WHEN 'PATTERN'          THEN 3
         WHEN 'ANTI_PATTERN'     THEN 4
         WHEN 'INSIGHT'          THEN 5
         WHEN 'FIX'              THEN 6
         WHEN 'BUG'              THEN 7
         ELSE 8
       END,
       me.updated_at DESC
     LIMIT ${limitParam}`,
    params
  )

  // 3. Registrar accesos en background (no bloquea)
  const allIds = [...priorityEntries, ...entries].map((e) => e.id)
  logAccess(allIds, 'get_context')

  const allEntries = [...priorityEntries, ...entries]
  const entries_by_type = allEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {})

  return {
    project_slug,
    area_filter: area,
    total_entries: allEntries.length,
    entries_by_type,
    priority_entries: priorityEntries,
    entries,
    loaded_at: new Date().toISOString(),
  }
}

import { z } from 'zod'
import { query } from '../db/client.js'

export const ListProjectsSchema = z.object({
  include_stats: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include entry count breakdown by area and type'),
})

export type ListProjectsInput = z.infer<typeof ListProjectsSchema>

interface ProjectSummary {
  slug: string
  name: string
  description?: string
  total_entries: number
  created_at: Date
  last_updated: Date | null
  stats?: {
    by_area: Record<string, number>
    by_type: Record<string, number>
    by_status: Record<string, number>
  }
}

export async function listProjects(input: ListProjectsInput): Promise<ProjectSummary[]> {
  // Proyectos que tienen al menos una entrada de memoria
  const rows = await query<{
    slug: string
    name: string
    description: string | null
    created_at: Date
    total_entries: string
    last_updated: Date | null
  }>(
    `SELECT p.slug, p.name, p.description, p.created_at,
            COUNT(me.id)          AS total_entries,
            MAX(me.updated_at)    AS last_updated
     FROM projects p
     INNER JOIN memory_entries me ON me.project_id = p.id
     GROUP BY p.id, p.slug, p.name, p.description, p.created_at
     ORDER BY MAX(me.updated_at) DESC`
  )

  if (rows.length === 0) return []

  // Si no se piden stats, retornamos directo
  if (!input.include_stats) {
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description ?? undefined,
      total_entries: Number(r.total_entries),
      created_at: r.created_at,
      last_updated: r.last_updated,
    }))
  }

  // Con stats: una query adicional para breakdown por proyecto
  const statsRows = await query<{
    slug: string
    area: string
    type: string
    status: string
    count: string
  }>(
    `SELECT p.slug, me.area, me.type, me.status, COUNT(*) AS count
     FROM memory_entries me
     JOIN projects p ON p.id = me.project_id
     GROUP BY p.slug, me.area, me.type, me.status`
  )

  // Agrupar stats por proyecto
  const statsMap = new Map<
    string,
    { by_area: Record<string, number>; by_type: Record<string, number>; by_status: Record<string, number> }
  >()

  for (const s of statsRows) {
    if (!statsMap.has(s.slug)) {
      statsMap.set(s.slug, { by_area: {}, by_type: {}, by_status: {} })
    }
    const entry = statsMap.get(s.slug)!
    entry.by_area[s.area]     = (entry.by_area[s.area] ?? 0)     + Number(s.count)
    entry.by_type[s.type]     = (entry.by_type[s.type] ?? 0)     + Number(s.count)
    entry.by_status[s.status] = (entry.by_status[s.status] ?? 0) + Number(s.count)
  }

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description ?? undefined,
    total_entries: Number(r.total_entries),
    created_at: r.created_at,
    last_updated: r.last_updated,
    stats: statsMap.get(r.slug),
  }))
}

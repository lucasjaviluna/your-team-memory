import { z } from 'zod'
import { pool } from '../db/client.js'
import { COMPACTION_DEFAULTS } from '../types/index.js'

export const GetMemoryStatsSchema = z.object({
  project_slug: z.string().describe('Project to analyze'),

  days: z.number().int().min(1).max(365).optional().default(30)
    .describe('Time window in days for access-based metrics'),

  // ── Filtros de usuario ─────────────────────────────────────────────────────
  // Hoy: author (texto libre, igual que memory_entries.author).
  // Futuro: user_id (verificado, cuando haya autenticación real).
  // Se pueden combinar, pero hoy user_id siempre será ignorado (siempre NULL en DB).
  author: z.string().optional()
    .describe(
      'Filter stats by entry author (text, same as memory_entries.author). ' +
      'Today this is unverified. When user authentication is added, prefer user_id instead.'
    ),
  user_id: z.string().optional()
    .describe(
      'Reserved for future authenticated user filtering. ' +
      'Currently ignored — user_id is always NULL in the DB until auth is implemented.'
    ),

  include_never_accessed: z.boolean().optional().default(true)
    .describe('Include the list of entries that were never accessed'),

  include_compaction_candidates: z.boolean().optional().default(true)
    .describe('Include the count and list of entries that meet compaction criteria'),
})

export type GetMemoryStatsInput = z.infer<typeof GetMemoryStatsSchema>

// ── Tipos de retorno ──────────────────────────────────────────────────────────

interface TypeBreakdown  { type: string;   count: number; avg_access: number }
interface AreaBreakdown  { area: string;   count: number; avg_access: number }
interface StatusBreakdown{ status: string; count: number }

interface TopEntry {
  id: string; title: string; type: string; area: string
  access_count: number; last_accessed: Date | null
  [key: string]: unknown
}

interface AccessTimeline {
  date: string
  search_memory: number
  get_context:   number
  total:         number
  [key: string]: unknown
}

interface AuthorStat {
  author: string
  entries_created: number
  entries_accessed: number
  last_active: Date | null
  [key: string]: unknown
}

interface CompactionCandidate {
  id: string; title: string; type: string; area: string
  access_count: number; last_accessed: Date | null; updated_at: Date
  [key: string]: unknown
}

interface MemoryStats {
  project_slug:   string
  generated_at:   string
  time_window_days: number

  // ── Filtros aplicados ──────────────────────────────────────────────────────
  filters: {
    author:  string | null
    user_id: string | null     // siempre null hasta que haya auth
    user_id_note?: string      // aviso cuando se pasa user_id sin soporte
  }

  // ── Resumen del proyecto ───────────────────────────────────────────────────
  overview: {
    total_entries:    number
    by_status:        StatusBreakdown[]
    by_type:          TypeBreakdown[]
    by_area:          AreaBreakdown[]
    oldest_entry:     Date | null
    newest_entry:     Date | null
  }

  // ── Accesos ───────────────────────────────────────────────────────────────
  access: {
    total_accesses_in_window: number
    unique_entries_accessed:  number
    top_accessed:             TopEntry[]
    never_accessed_count:     number
    never_accessed?:          TopEntry[]   // solo si include_never_accessed
    timeline?:                AccessTimeline[]
  }

  // ── Autores / usuarios ────────────────────────────────────────────────────
  authors: {
    note: string        // describe el estado actual del tracking
    data: AuthorStat[]
  }

  // ── Salud del sistema ─────────────────────────────────────────────────────
  health: {
    compaction_candidates_count: number
    compaction_candidates?:      CompactionCandidate[]
    duplicate_risk_count:        number    // entradas con títulos muy similares
    archived_count:              number
    review_needed_count:         number
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

async function q<T extends Record<string, unknown>>(
  sql: string, params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params)
  return result.rows
}

// ── Implementación ────────────────────────────────────────────────────────────

export async function getMemoryStats(input: GetMemoryStatsInput): Promise<MemoryStats> {
  const { project_slug, days, author, user_id, include_never_accessed, include_compaction_candidates } = input

  // ── Resolver project_id ─────────────────────────────────────────────────
  const [project] = await q<{ id: string }>(
    'SELECT id FROM projects WHERE slug = $1', [project_slug]
  )
  if (!project) {
    throw new Error(`Project not found: ${project_slug}`)
  }
  const pid = project.id

  // Filtro opcional de author en memory_entries
  const authorFilter = author ? `AND me.author = '${author.replace(/'/g,"''")}'` : ''

  // ── Overview ────────────────────────────────────────────────────────────
  const byStatus = await q<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count
     FROM memory_entries WHERE project_id = $1 ${authorFilter}
     GROUP BY status ORDER BY count DESC`,
    [pid]
  )

  const byType = await q<{ type: string; count: string; avg_access: string }>(
    `SELECT type, COUNT(*) as count, ROUND(AVG(access_count), 1) as avg_access
     FROM memory_entries WHERE project_id = $1 AND status = 'active' ${authorFilter}
     GROUP BY type ORDER BY count DESC`,
    [pid]
  )

  const byArea = await q<{ area: string; count: string; avg_access: string }>(
    `SELECT area, COUNT(*) as count, ROUND(AVG(access_count), 1) as avg_access
     FROM memory_entries WHERE project_id = $1 AND status = 'active' ${authorFilter}
     GROUP BY area ORDER BY count DESC`,
    [pid]
  )

  const [dates] = await q<{ oldest: Date | null; newest: Date | null }>(
    `SELECT MIN(created_at) as oldest, MAX(created_at) as newest
     FROM memory_entries WHERE project_id = $1 ${authorFilter}`,
    [pid]
  )

  const [totals] = await q<{ total: string }>(
    `SELECT COUNT(*) as total FROM memory_entries
     WHERE project_id = $1 ${authorFilter}`,
    [pid]
  )

  // ── Access: top accessed ────────────────────────────────────────────────
  // Filtro de author sobre memory_entries para top/never (las entradas guardadas por ese autor)
  const topAccessed = await q<TopEntry>(
    `SELECT me.id, me.title, me.type, me.area, me.access_count, me.last_accessed
     FROM memory_entries me
     WHERE me.project_id = $1 AND me.status = 'active' ${authorFilter}
       AND me.last_accessed > NOW() - INTERVAL '${days} days'
     ORDER BY me.access_count DESC LIMIT 10`,
    [pid]
  )

  const [accessWindow] = await q<{ total: string; unique_entries: string }>(
    `SELECT COUNT(*) as total,
            COUNT(DISTINCT mal.entry_id) as unique_entries
     FROM memory_access_log mal
     JOIN memory_entries me ON me.id = mal.entry_id
     WHERE me.project_id = $1
       AND mal.accessed_at > NOW() - INTERVAL '${days} days'`,
    [pid]
  )

  // Timeline de accesos día a día
  const timeline = await q<{ day: Date; tool: string; count: string }>(
    `SELECT DATE(mal.accessed_at) as day, mal.tool, COUNT(*) as count
     FROM memory_access_log mal
     JOIN memory_entries me ON me.id = mal.entry_id
     WHERE me.project_id = $1
       AND mal.accessed_at > NOW() - INTERVAL '${days} days'
     GROUP BY DATE(mal.accessed_at), mal.tool
     ORDER BY day ASC`,
    [pid]
  )

  // Agrupar timeline por día
  const timelineMap = new Map<string, AccessTimeline>()
  for (const row of timeline) {
    const day = new Date(row.day).toISOString().split('T')[0]
    if (!timelineMap.has(day)) {
      timelineMap.set(day, { date: day, search_memory: 0, get_context: 0, total: 0 })
    }
    const entry = timelineMap.get(day)!
    const n = Number(row.count)
    if (row.tool === 'search_memory') entry.search_memory += n
    else entry.get_context += n
    entry.total += n
  }

  // Never accessed
  const neverAccessed = await q<TopEntry>(
    `SELECT me.id, me.title, me.type, me.area, me.access_count, me.last_accessed
     FROM memory_entries me
     WHERE me.project_id = $1 AND me.status = 'active' ${authorFilter}
       AND me.access_count = 0
       AND me.created_at < NOW() - INTERVAL '30 days'
     ORDER BY me.created_at ASC`,
    [pid]
  )

  // ── Authors / usuarios ──────────────────────────────────────────────────
  // Hoy: stats por author (campo texto, no verificado).
  // Futuro: cuando haya user_id en memory_access_log, esto se reemplaza
  //         por un JOIN a tabla users y se filtra por user_id verificado.
  const authorStats = await q<{
    author: string; entries_created: string
    last_entry: Date | null; accesses_generated: string; last_access: Date | null
  }>(
    `SELECT
       me.author,
       COUNT(DISTINCT me.id)          AS entries_created,
       MAX(me.created_at)             AS last_entry,
       COALESCE(SUM(me.access_count), 0) AS accesses_generated,
       MAX(me.last_accessed)          AS last_access
     FROM memory_entries me
     WHERE me.project_id = $1 AND me.author IS NOT NULL
     GROUP BY me.author
     ORDER BY entries_created DESC`,
    [pid]
  )

  // ── Health: compaction candidates ───────────────────────────────────────
  const { OLDER_THAN_DAYS, MAX_ACCESS_COUNT, LAST_ACCESSED_DAYS } = COMPACTION_DEFAULTS

  const compactionCandidates = await q<CompactionCandidate>(
    `SELECT me.id, me.title, me.type, me.area,
            me.access_count, me.last_accessed, me.updated_at
     FROM memory_entries me
     WHERE me.project_id = $1 AND me.status = 'active'
       AND me.type NOT IN ('SUMMARY', 'TASK_CONTEXT')
       AND me.updated_at    < NOW() - INTERVAL '${OLDER_THAN_DAYS} days'
       AND me.access_count  < ${MAX_ACCESS_COUNT}
       AND (me.last_accessed IS NULL
            OR me.last_accessed < NOW() - INTERVAL '${LAST_ACCESSED_DAYS} days')
     ORDER BY me.updated_at ASC`,
    [pid]
  )

  // Duplicate risk: entradas activas con el mismo título normalizado
  const [dupRisk] = await q<{ count: string }>(
    `SELECT COUNT(*) as count FROM (
       SELECT lower(trim(regexp_replace(title, '\\s+', ' ', 'g'))) as norm_title
       FROM memory_entries
       WHERE project_id = $1 AND status = 'active'
       GROUP BY norm_title
       HAVING COUNT(*) > 1
     ) dupes`,
    [pid]
  )

  const [archived] = await q<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory_entries
     WHERE project_id = $1 AND status = 'archived'`, [pid]
  )

  const [reviewNeeded] = await q<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory_entries
     WHERE project_id = $1 AND status = 'review_needed'`, [pid]
  )

  // ── Armar respuesta ─────────────────────────────────────────────────────
  const filters: MemoryStats['filters'] = {
    author:  author  ?? null,
    user_id: null,   // siempre null — user_id no está implementado aún
  }
  if (user_id) {
    filters.user_id_note =
      'user_id filter is reserved for future authenticated user tracking. ' +
      'It is currently ignored because the auth system is not yet implemented. ' +
      'Use author filter in the meantime.'
  }

  return {
    project_slug,
    generated_at: new Date().toISOString(),
    time_window_days: days!,
    filters,

    overview: {
      total_entries: Number(totals?.total ?? 0),
      by_status: byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
      by_type:   byType.map(r => ({ type: r.type, count: Number(r.count), avg_access: Number(r.avg_access) })),
      by_area:   byArea.map(r => ({ area: r.area, count: Number(r.count), avg_access: Number(r.avg_access) })),
      oldest_entry: dates?.oldest ?? null,
      newest_entry: dates?.newest ?? null,
    },

    access: {
      total_accesses_in_window: Number(accessWindow?.total ?? 0),
      unique_entries_accessed:  Number(accessWindow?.unique_entries ?? 0),
      top_accessed:             topAccessed,
      never_accessed_count:     neverAccessed.length,
      ...(include_never_accessed  ? { never_accessed: neverAccessed }    : {}),
      timeline: [...timelineMap.values()],
    },

    authors: {
      note: author
        ? `Filtered to entries created by author "${author}". ` +
          'When user authentication is implemented, this will reflect verified user identity.'
        : 'Stats show all authors. Author field is unverified text today — ' +
          'it will be replaced by verified user_id when auth is implemented.',
      data: authorStats.map(r => ({
        author:           r.author,
        entries_created:  Number(r.entries_created),
        entries_accessed: Number(r.accesses_generated),
        last_active:      r.last_access ?? r.last_entry,
      })),
    },

    health: {
      compaction_candidates_count: compactionCandidates.length,
      ...(include_compaction_candidates ? { compaction_candidates: compactionCandidates } : {}),
      duplicate_risk_count: Number(dupRisk?.count ?? 0),
      archived_count:       Number(archived?.count ?? 0),
      review_needed_count:  Number(reviewNeeded?.count ?? 0),
    },
  }
}

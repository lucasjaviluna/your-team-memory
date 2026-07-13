import { query } from '../db/client.js'
import { generateEmbedding } from '../embeddings/ollama.js'
import {
  DEDUP_SCORE_THRESHOLD,
  DEDUP_EXCLUDED_TYPES,
  type DuplicateCandidate,
  type Area,
  type EntryType,
} from '../types/index.js'

interface DedupInput {
  project_id: string
  area: Area
  type: EntryType
  title: string
  content: string
  tags: string[]
}

const RRF_K = 60

/**
 * Busca si existe una entrada activa semánticamente muy cercana a la que
 * se está por insertar, dentro del mismo proyecto + área + tipo.
 *
 * Estrategia en dos pasos:
 *
 * Paso A — Exact title match:
 *   Compara el título normalizado (lowercase, trim, collapse spaces).
 *   Si hay coincidencia exacta → duplicado inmediato, sin necesidad de
 *   generar un embedding extra.
 *
 * Paso B — Near-duplicate vectorial + FTS:
 *   Solo si el paso A no encontró nada. Genera el embedding del texto
 *   nuevo y busca con la misma lógica RRF de search_memory, pero con
 *   un umbral de score muy alto (0.030 ≈ top-1 en ambos rankings) y
 *   restringido al mismo project + area + type.
 *
 * Returns null si no hay duplicado. Returns DuplicateCandidate si lo hay.
 */
export async function findNearDuplicate(input: DedupInput): Promise<DuplicateCandidate | null> {

  // Tipos excluidos: SUMMARY y TASK_CONTEXT son acumulativos por naturaleza
  if (DEDUP_EXCLUDED_TYPES.includes(input.type)) return null

  // ── Paso A: exact title match ─────────────────────────────────────────────
  const normalizeTitle = (t: string) =>
    t.toLowerCase().trim().replace(/\s+/g, ' ')

  const exactMatch = await query<{
    id: string; title: string; content: string; type: EntryType; area: Area; created_at: Date
  }>(
    `SELECT id, title, content, type, area, created_at
     FROM memory_entries
     WHERE project_id = $1
       AND area   = $2
       AND type   = $3
       AND status = 'active'
       AND lower(trim(regexp_replace(title, '\\s+', ' ', 'g'))) = $4
     LIMIT 1`,
    [input.project_id, input.area, input.type, normalizeTitle(input.title)]
  )

  if (exactMatch.length > 0) {
    const m = exactMatch[0]
    return {
      id:              m.id,
      title:           m.title,
      content_preview: m.content.slice(0, 200),
      type:            m.type,
      area:            m.area,
      score:           1.0,   // exact match = score máximo
      created_at:      m.created_at,
    }
  }

  // ── Paso B: near-duplicate vectorial + FTS con umbral alto ───────────────

  const embeddingText = `${input.title}\n\n${input.content}\n\nTags: ${input.tags.join(', ')}`
  const embedding = await generateEmbedding(embeddingText)
  const embeddingStr = `[${embedding.join(',')}]`

  // Vectorial — top 5 candidatos dentro del mismo project + area + type
  const vectorResults = await query<{ id: string; rank: number }>(
    `SELECT id,
            ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
     FROM memory_entries
     WHERE project_id = $2
       AND area   = $3
       AND type   = $4
       AND status = 'active'
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT 5`,
    [embeddingStr, input.project_id, input.area, input.type]
  )

  // FTS — top 5 candidatos por keyword
  const ftsResults = await query<{ id: string; rank: number }>(
    `SELECT id,
            ROW_NUMBER() OVER (
              ORDER BY ts_rank(
                to_tsvector('english', title || ' ' || content),
                plainto_tsquery('english', $1)
              ) DESC
            ) AS rank
     FROM memory_entries
     WHERE project_id = $2
       AND area   = $3
       AND type   = $4
       AND status = 'active'
       AND to_tsvector('english', title || ' ' || content)
           @@ plainto_tsquery('english', $1)
     LIMIT 5`,
    [`${input.title} ${input.content.slice(0, 200)}`, input.project_id, input.area, input.type]
  )

  // RRF — combinar rankings
  const scores = new Map<string, number>()
  for (const row of vectorResults) {
    scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (RRF_K + Number(row.rank)))
  }
  for (const row of ftsResults) {
    scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (RRF_K + Number(row.rank)))
  }

  if (scores.size === 0) return null

  const [topId, topScore] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]

  // Solo disparar si supera el umbral conservador
  if (topScore < DEDUP_SCORE_THRESHOLD) return null

  const candidates = await query<{
    id: string; title: string; content: string; type: EntryType; area: Area; created_at: Date
  }>(
    `SELECT id, title, content, type, area, created_at
     FROM memory_entries WHERE id = $1`,
    [topId]
  )

  if (candidates.length === 0) return null
  const c = candidates[0]

  return {
    id:              c.id,
    title:           c.title,
    content_preview: c.content.slice(0, 200),
    type:            c.type,
    area:            c.area,
    score:           topScore,
    created_at:      c.created_at,
  }
}

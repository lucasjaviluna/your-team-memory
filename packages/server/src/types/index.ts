export type Area = 'frontend' | 'backend' | 'infra' | 'general'

export type EntryType =
  | 'BUG'
  | 'FIX'
  | 'DECISION'
  | 'INSIGHT'
  | 'PATTERN'
  | 'ANTI_PATTERN'
  | 'REPOSITORY_NOTE'
  | 'TASK_CONTEXT'
  | 'SUMMARY'

export type EntryStatus = 'active' | 'deprecated' | 'review_needed' | 'archived'

// Cargados siempre primero en get_context
export const PRIORITY_TYPES: EntryType[] = ['SUMMARY', 'TASK_CONTEXT']

// Excluidos de search_memory — solo disponibles via get_context
export const SEARCH_EXCLUDED_TYPES: EntryType[] = ['SUMMARY']

// No compactables automáticamente — requieren acción manual
export const NON_COMPACTABLE_TYPES: EntryType[] = ['SUMMARY', 'TASK_CONTEXT']

// Umbrales para candidatos a compactación
export const COMPACTION_DEFAULTS = {
  OLDER_THAN_DAYS:       90,
  MAX_ACCESS_COUNT:       5,
  LAST_ACCESSED_DAYS:    30,
  MAX_ENTRIES_PER_SUMMARY: 30,
}

// Límites de producto para evitar entradas y prompts que degraden el servicio.
export const INPUT_LIMITS = {
  PROJECT_SLUG: 120,
  QUERY: 2000,
  TITLE: 240,
  CONTENT: 100_000,
  AUTHOR: 120,
  TAGS: 20,
  TAG: 80,
  COMPACTION_PROMPT: 500_000,
} as const

// ── Deduplicación ─────────────────────────────────────────────────────────────

// Score RRF mínimo para considerar una entrada como near-duplicate.
// 0.030 ≈ top-1 en ambos rankings (vectorial + FTS) — umbral conservador
// que solo dispara en casos de alta similitud semántica Y textual.
export const DEDUP_SCORE_THRESHOLD = 0.030

// Tipos que están excluidos del check de near-duplicate.
// SUMMARY y TASK_CONTEXT son por naturaleza acumulativos —
// es legítimo tener varios sobre el mismo tema.
export const DEDUP_EXCLUDED_TYPES: EntryType[] = ['SUMMARY', 'TASK_CONTEXT']

export interface DuplicateCandidate {
  id: string
  title: string
  content_preview: string   // primeros 200 chars del contenido
  type: EntryType
  area: Area
  score: number
  created_at: Date
}

export interface SaveMemoryResult {
  saved: boolean                    // true si se insertó, false si se bloqueó
  entry?: MemoryEntry               // la entrada guardada (cuando saved: true)
  duplicate?: DuplicateCandidate    // el candidato detectado (cuando saved: false)
  suggestion?: string               // qué hacer (cuando saved: false)
}

export interface Project {
  id: string
  slug: string
  name: string
  description?: string
  created_at: Date
}

export interface MemoryEntry {
  id: string
  project_id: string
  area: Area
  type: EntryType
  title: string
  content: string
  tags: string[]
  author: string
  status: EntryStatus
  archived_into?: string | null   // UUID del SUMMARY que la compactó
  access_count: number
  last_accessed: Date | null
  embedding?: number[]
  embedding_model?: string | null
  embedding_dimensions?: number | null
  embedding_version?: string | null
  embedding_generated_at?: Date | null
  created_at: Date
  updated_at: Date
}

export interface SearchResult extends Omit<MemoryEntry, 'embedding'> {
  score: number
  project_slug: string
}

export interface SaveMemoryInput {
  project_slug: string
  area: Area
  type: EntryType
  title: string
  content: string
  tags?: string[]
  author: string
}

export interface SearchMemoryInput {
  query: string
  project_slug?: string
  area?: Area
  type?: EntryType
  limit?: number
}

export interface GetContextInput {
  project_slug: string
  area?: Area
  limit?: number
}

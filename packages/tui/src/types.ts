export type Area   = 'frontend' | 'backend' | 'infra' | 'general'
export type Status = 'active' | 'deprecated' | 'review_needed' | 'archived'
export type EntryType =
  | 'BUG' | 'FIX' | 'DECISION' | 'INSIGHT'
  | 'PATTERN' | 'ANTI_PATTERN' | 'REPOSITORY_NOTE'
  | 'TASK_CONTEXT' | 'SUMMARY'

export interface MemoryEntry {
  id:            string
  project_id:    string
  area:          Area
  type:          EntryType
  title:         string
  content:       string
  tags:          string[]
  author:        string
  status:        Status
  access_count:  number
  last_accessed: string | null
  created_at:    string
  updated_at:    string
  score?:        number
}

export interface Project {
  id:            string
  slug:          string
  name:          string
  description:   string | null
  total_entries: number
  last_updated:  string | null
}

export interface MemoryStats {
  project_slug: string
  generated_at: string
  overview: {
    total_entries: number
    by_type:   Array<{ type: string;   count: number; avg_access: number }>
    by_area:   Array<{ area: string;   count: number; avg_access: number }>
    by_status: Array<{ status: string; count: number }>
  }
  access: {
    total_accesses_in_window: number
    unique_entries_accessed:  number
    top_accessed:             MemoryEntry[]
    never_accessed_count:     number
    timeline:                 Array<{ date: string; total: number }>
  }
  health: {
    compaction_candidates_count: number
    duplicate_risk_count:        number
    archived_count:              number
    review_needed_count:         number
  }
}

export interface CompactResult {
  dry_run:           boolean
  candidates_found:  number
  summaries_created: number
  entries_archived:  number
  summaries?:        Array<{ type: string; area: string; entries_archived: number }>
}

export type Screen =
  | 'dashboard' | 'list' | 'detail' | 'edit' | 'compact' | 'search'

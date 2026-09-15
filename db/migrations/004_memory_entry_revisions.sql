-- ============================================================
-- Team Memory — Migration 004: Memory entry revision history
-- ============================================================

-- Keeps the previous state of an entry before update_memory changes it.
-- This enables TASK_CONTEXT replacement/rotation without losing history.
CREATE TABLE IF NOT EXISTS memory_entry_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL,
  area        TEXT NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  author      TEXT NOT NULL,
  status      TEXT NOT NULL,
  embedding   vector(768),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_memory_entry_revisions_entry
  ON memory_entry_revisions (entry_id, revision DESC);

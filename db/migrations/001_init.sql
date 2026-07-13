-- ============================================================
-- Team Memory — Migration 001: Initial Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Proyectos
CREATE TABLE IF NOT EXISTS projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Entradas de memoria
CREATE TABLE IF NOT EXISTS memory_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area          TEXT        NOT NULL CHECK (area IN ('frontend', 'backend', 'infra', 'general')),
  type          TEXT        NOT NULL CHECK (type IN (
                  'BUG', 'FIX', 'DECISION', 'INSIGHT', 'PATTERN',
                  'ANTI_PATTERN', 'REPOSITORY_NOTE', 'TASK_CONTEXT', 'SUMMARY'
                )),
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL,
  tags          TEXT[]      DEFAULT '{}',
  author        TEXT        NOT NULL,
  status        TEXT        DEFAULT 'active' CHECK (status IN (
                  'active', 'deprecated', 'review_needed', 'archived'
                )),
  archived_into UUID        REFERENCES memory_entries(id),  -- SUMMARY que compactó esta entrada
  access_count  INTEGER     DEFAULT 0,                      -- veces que fue devuelta por search/context
  last_accessed TIMESTAMPTZ DEFAULT NULL,                   -- última vez consultada
  embedding     vector(768),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Tabla de log de accesos por entrada
CREATE TABLE IF NOT EXISTS memory_access_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID        NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
  tool        TEXT        NOT NULL CHECK (tool IN ('search_memory', 'get_context')),
  accessed_at TIMESTAMPTZ DEFAULT now()
);

-- ── Índices memory_entries ────────────────────────────────────────────────────

-- Vectorial (HNSW — coseno)
CREATE INDEX IF NOT EXISTS idx_memory_embedding
  ON memory_entries USING hnsw (embedding vector_cosine_ops);

-- FTS en inglés
CREATE INDEX IF NOT EXISTS idx_memory_fts
  ON memory_entries USING gin (to_tsvector('english', title || ' ' || content));

-- Filtros frecuentes
CREATE INDEX IF NOT EXISTS idx_memory_project      ON memory_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_memory_area         ON memory_entries (area);
CREATE INDEX IF NOT EXISTS idx_memory_type         ON memory_entries (type);
CREATE INDEX IF NOT EXISTS idx_memory_status       ON memory_entries (status);
CREATE INDEX IF NOT EXISTS idx_memory_tags         ON memory_entries USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_memory_archived_into ON memory_entries (archived_into)
  WHERE archived_into IS NOT NULL;

-- Compactación: entradas candidatas (viejas + poco accedidas)
CREATE INDEX IF NOT EXISTS idx_memory_compaction
  ON memory_entries (updated_at, access_count, last_accessed)
  WHERE status = 'active';

-- ── Índices memory_access_log ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_access_entry    ON memory_access_log (entry_id);
CREATE INDEX IF NOT EXISTS idx_access_accessed ON memory_access_log (accessed_at);

-- ── Trigger auto-update updated_at ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_updated_at
  BEFORE UPDATE ON memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

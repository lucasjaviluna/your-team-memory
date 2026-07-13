-- ============================================================
-- Team Memory — Migration 002: User tracking foundation
-- ============================================================
-- Prepara la tabla de access log para tracking futuro por usuario.
-- Hoy: author (texto libre, igual que en memory_entries).
-- Futuro: user_id (FK a tabla users cuando haya autenticación real).
--
-- Aplicar manualmente:
--   docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME < db/migrations/002_user_tracking.sql

-- Agregar author al log — hoy se llena desde el campo author de la entrada
-- o desde el header de la request cuando haya auth
ALTER TABLE memory_access_log
  ADD COLUMN IF NOT EXISTS author   TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_id  TEXT        DEFAULT NULL;
  -- user_id: reservado para cuando haya autenticación real.
  -- Será FK a tabla users en una migración futura.
  -- Por ahora NULL siempre.

-- Índices para filtros por usuario
CREATE INDEX IF NOT EXISTS idx_access_author  ON memory_access_log (author)  WHERE author  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_user_id ON memory_access_log (user_id) WHERE user_id IS NOT NULL;

-- Vista útil para stats: accesos enriquecidos con datos de la entrada
CREATE OR REPLACE VIEW memory_access_enriched AS
  SELECT
    mal.id          AS log_id,
    mal.entry_id,
    mal.tool,
    mal.author,
    mal.user_id,
    mal.accessed_at,
    me.project_id,
    me.type,
    me.area,
    me.title,
    me.status       AS entry_status,
    p.slug          AS project_slug
  FROM memory_access_log  mal
  JOIN memory_entries     me  ON me.id  = mal.entry_id
  JOIN projects           p   ON p.id   = me.project_id;

COMMENT ON COLUMN memory_access_log.author IS
  'Texto libre — mismo valor que memory_entries.author. No verificado. '
  'Reemplazar por user_id cuando haya autenticación real.';

COMMENT ON COLUMN memory_access_log.user_id IS
  'Reservado para autenticación futura. NULL hasta que exista una tabla users '
  'y un mecanismo de identidad verificado por request.';

-- Migration 003: Authentication — users, api_tokens, invite_tokens
-- Apply: docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME < db/migrations/003_auth.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        UNIQUE NOT NULL,
  email       TEXT        UNIQUE,
  role        TEXT        NOT NULL DEFAULT 'writer' CHECK (role IN ('reader','writer','admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT        UNIQUE NOT NULL,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used    TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        UNIQUE NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'writer' CHECK (role IN ('reader','writer','admin')),
  created_by  UUID        NOT NULL REFERENCES users(id),
  used_by     UUID        REFERENCES users(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_token   ON api_tokens   (token)  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id  ON api_tokens   (user_id);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token)  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username      ON users        (username);

CREATE OR REPLACE VIEW active_tokens AS
  SELECT t.id AS token_id, t.token, t.device_name, t.created_at AS token_created,
         t.last_used, u.id AS user_id, u.username, u.role, u.email
  FROM api_tokens t JOIN users u ON u.id = t.user_id
  WHERE t.revoked_at IS NULL AND u.revoked_at IS NULL;

-- Task #330 — Monitor sessions table for the Display Operations API.
-- Idempotent: safe to re-run on any existing database.
-- Raw bootstrap tokens and session secrets are NEVER stored in this table;
-- only their SHA-256 hashes appear in tokenHash and sessionSecretHash.

CREATE TABLE IF NOT EXISTS monitor_sessions (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screen_id           VARCHAR NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  client_id           VARCHAR REFERENCES clients(id) ON DELETE CASCADE,
  token_hash          VARCHAR NOT NULL UNIQUE,
  session_secret_hash VARCHAR,
  bootstrap_used_at   TIMESTAMP,
  expires_at          TIMESTAMP NOT NULL,
  revoked_at          TIMESTAMP,
  last_access_at      TIMESTAMP,
  client_type         TEXT,
  client_name         TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Index for cleanup job (purge by expiry)
CREATE INDEX IF NOT EXISTS monitor_sessions_expires_at_idx ON monitor_sessions (expires_at);
-- Index for revocation / ownership lookups
CREATE INDEX IF NOT EXISTS monitor_sessions_user_id_idx ON monitor_sessions (user_id);
CREATE INDEX IF NOT EXISTS monitor_sessions_screen_id_idx ON monitor_sessions (screen_id);

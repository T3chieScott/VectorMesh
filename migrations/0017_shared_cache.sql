-- Task #290 — PostgreSQL-backed shared (L2) cache.
-- Additive, idempotent. Safe to re-run on a healthy DB.
CREATE TABLE IF NOT EXISTS shared_cache (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL,
  cache_key text NOT NULL,
  value_json jsonb,
  value_text text,
  expires_at timestamp,
  last_updated_at timestamp DEFAULT now(),
  source text,
  status text NOT NULL DEFAULT 'fresh',
  error_message text,
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_cache_namespace_key_unique
  ON shared_cache (namespace, cache_key);
CREATE INDEX IF NOT EXISTS shared_cache_namespace_idx ON shared_cache (namespace);
CREATE INDEX IF NOT EXISTS shared_cache_cache_key_idx ON shared_cache (cache_key);
CREATE INDEX IF NOT EXISTS shared_cache_expires_at_idx ON shared_cache (expires_at);
CREATE INDEX IF NOT EXISTS shared_cache_status_idx ON shared_cache (status);
CREATE INDEX IF NOT EXISTS shared_cache_last_updated_at_idx ON shared_cache (last_updated_at);

-- Task #329 — Operations permissions tables
-- Relational scope model for the Display Operations API.
-- Admins and account_managers pass all scope checks implicitly in application
-- code; these tables grant explicit scopes to site_users and API tokens.

CREATE TABLE IF NOT EXISTS user_operations_scopes (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,
  granted_at  TIMESTAMP DEFAULT NOW(),
  granted_by  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT user_operations_scopes_user_scope_unique UNIQUE (user_id, scope)
);

CREATE TABLE IF NOT EXISTS token_operations_scopes (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    VARCHAR NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,
  granted_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT token_operations_scopes_token_scope_unique UNIQUE (token_id, scope)
);

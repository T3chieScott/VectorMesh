-- Migration 0027 — Task #369: Production Entra OAuth for the Microsoft Graph agenda connector.
--
-- Creates the microsoft_oauth_tokens table which stores exactly ONE encrypted
-- MSAL token cache blob for the system-level integration identity.
-- The table uses a singleton row keyed on id = 'singleton'.
--
-- Design notes:
--   - The entire MSAL serialised token cache (accounts + ATs + RT) is
--     encrypted with AES-256-GCM before persistence.
--   - key_version enables future key rotation without data loss.
--   - connected_by records the admin user ID who triggered the OAuth flow.
--
-- Reversal:
--   DROP TABLE IF EXISTS microsoft_oauth_tokens;

CREATE TABLE IF NOT EXISTS microsoft_oauth_tokens (
  id              VARCHAR     PRIMARY KEY,               -- always 'singleton'
  -- AES-256-GCM encrypted MSAL serialised token cache blob.
  encrypted_cache TEXT        NOT NULL,                  -- base64 ciphertext
  cache_iv        TEXT        NOT NULL,                  -- base64, 12-byte GCM IV (random per write)
  cache_tag       TEXT        NOT NULL,                  -- base64, 16-byte GCM auth tag
  -- Encryption key version for future rotation support.
  key_version     INTEGER     NOT NULL DEFAULT 1,
  -- Scope string from the last successful grant (audit / verification).
  scope           TEXT        NOT NULL,
  -- Admin user ID who triggered the initial connection.
  connected_by    TEXT        NOT NULL,
  connected_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Task #382 — Auto-scroll overflowing agenda descriptions.
-- Adds operator-controlled auto-scroll for Full (no-limit) descriptions.
-- FALSE by default so every existing row continues to render identically.
--
-- Idempotent: safe to re-run on any existing database.
ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS description_auto_scroll BOOLEAN NOT NULL DEFAULT FALSE;

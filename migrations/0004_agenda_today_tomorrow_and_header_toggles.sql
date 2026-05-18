-- 0004_agenda_today_tomorrow_and_header_toggles (Task #240): add two
-- new optional header toggles (show_day_name, show_date) to
-- agenda_widget_configs. Both default to false so the new mode and
-- header chunks stay opt-in for existing configs. The new
-- "today_tomorrow" display_mode value is a plain string enum stored in
-- the existing display_mode text column — no DDL needed for the mode
-- itself, only schema-level enum extension in shared/schema.ts.
-- Run after `npm run db:push` or apply directly. Idempotent.

ALTER TABLE IF EXISTS agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_day_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_date boolean NOT NULL DEFAULT false;

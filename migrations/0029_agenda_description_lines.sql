-- Operator-selectable description line limit for agenda display widgets.
-- NULL means "Full / no clamp"; an integer clamps the description <p> to
-- that many lines. DEFAULT 2 preserves the previous hard-coded behaviour
-- for every existing row so no display changes without operator action.
--
-- Idempotent: safe to re-run on any existing database.
ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS description_lines INTEGER DEFAULT 2;

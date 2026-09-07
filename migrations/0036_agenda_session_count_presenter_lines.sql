-- Task #403: independently hide the session summary and bound presenter
-- viewport lines.  Statements are safe for already-upgraded deployments.
ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_session_count BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS presenter_visible_lines INTEGER NOT NULL DEFAULT 4;

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS.  The catalog guard makes
-- this repeatable without masking a pre-existing valid constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_widget_configs_presenter_visible_lines_check'
  ) THEN
    ALTER TABLE agenda_widget_configs
      ADD CONSTRAINT agenda_widget_configs_presenter_visible_lines_check
      CHECK (presenter_visible_lines BETWEEN 1 AND 20);
  END IF;
END $$;
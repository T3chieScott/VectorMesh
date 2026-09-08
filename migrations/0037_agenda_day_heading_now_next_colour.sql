-- Task #404: optional agenda day heading and Now/Next label colour override.
-- All additions are additive and repeatable for already-upgraded deployments.
ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_agenda_day_heading BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS override_now_next_color BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS now_next_color TEXT;
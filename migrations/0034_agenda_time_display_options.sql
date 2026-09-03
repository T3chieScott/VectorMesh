ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_session_end_time boolean NOT NULL DEFAULT true;

ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS session_duration_prefix text NOT NULL DEFAULT '';
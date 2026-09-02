ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_session_duration boolean NOT NULL DEFAULT false;
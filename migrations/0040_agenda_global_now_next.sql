-- Optional global Now/Next sequence across selected Agenda rooms.
ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS single_global_now_next boolean NOT NULL DEFAULT false;
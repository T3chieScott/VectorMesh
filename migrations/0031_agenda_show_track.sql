-- Allow agenda displays to hide the track line independently of the room.
-- Default true preserves the existing rendering for all current displays.
ALTER TABLE IF EXISTS agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_track boolean NOT NULL DEFAULT true;
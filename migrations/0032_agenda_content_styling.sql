-- Task #394 — additive Agenda Display content styling.
-- Defaults preserve every existing display and make the migration safe to re-run.
ALTER TABLE IF EXISTS agenda_widget_configs
  ADD COLUMN IF NOT EXISTS show_description_divider boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS speaker_marker_style text NOT NULL DEFAULT 'microphone',
  ADD COLUMN IF NOT EXISTS speaker_custom_marker text,
  ADD COLUMN IF NOT EXISTS description_text_align text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS show_now_next_label boolean NOT NULL DEFAULT false;
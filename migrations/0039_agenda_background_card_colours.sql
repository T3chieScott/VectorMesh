-- Task: agenda display background/card and role colours, plus separate company.
ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS display_background_color TEXT,
  ADD COLUMN IF NOT EXISTS card_background_color TEXT,
  ADD COLUMN IF NOT EXISTS session_title_color TEXT,
  ADD COLUMN IF NOT EXISTS description_color TEXT,
  ADD COLUMN IF NOT EXISTS presenter_color TEXT,
  ADD COLUMN IF NOT EXISTS company_color TEXT,
  ADD COLUMN IF NOT EXISTS room_color TEXT,
  ADD COLUMN IF NOT EXISTS track_color TEXT;
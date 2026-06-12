-- Task #284 follow-up: independent header-corner text-size controls for the
-- agenda display widget. Nullable so existing rows keep the historical fixed
-- header sizes (header date 0.9, header clock 1.3) until an operator edits them.
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS header_date_scale real;
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS header_clock_scale real;

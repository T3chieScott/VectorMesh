-- Task #284: per-element text-size controls for the agenda widget.
-- Operators can independently size the Time, Day/Date, Title and Body text
-- on agenda cards. All columns are nullable so existing configs render
-- identically — the renderer falls back to the built-in default multiplier
-- for each role (time 1.15, date 0.6, title 1.15, body 0.75) when NULL.

ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS time_scale real;
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS date_scale real;
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS title_scale real;
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS body_scale real;

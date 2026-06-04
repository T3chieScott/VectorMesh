-- Task: agenda split date/time mapping.
-- When an upstream spreadsheet keeps the calendar date and the clock
-- time in separate columns, the start/end mapped column supplies the
-- DATE and these columns supply the TIME (combined at parse time).
-- dateBaseYear / dateBaseMonth complete a day-only date cell ("12th").
ALTER TABLE agenda_sync_configs ADD COLUMN IF NOT EXISTS start_time_column text;
ALTER TABLE agenda_sync_configs ADD COLUMN IF NOT EXISTS end_time_column text;
ALTER TABLE agenda_sync_configs ADD COLUMN IF NOT EXISTS date_base_year integer;
ALTER TABLE agenda_sync_configs ADD COLUMN IF NOT EXISTS date_base_month integer;

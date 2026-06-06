-- Task: Agenda day filter + room-mode cleanup.
-- (1) Add the manual "What's on" day filter columns to agenda widget
--     configs. day_filter defaults to "all" so existing configs are
--     unchanged; day_filter_date holds a YYYY-MM-DD target only when
--     day_filter = 'specific_date'.
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS day_filter text NOT NULL DEFAULT 'all';
ALTER TABLE agenda_widget_configs ADD COLUMN IF NOT EXISTS day_filter_date text;

-- (2) The redundant "Filter by rooms" display mode has been removed
--     from the enum. Room filtering is handled by the always-applied
--     room_filter array, so any config still on the legacy 'room' mode
--     keeps its rooms and simply renders as a full agenda.
UPDATE agenda_widget_configs SET display_mode = 'full' WHERE display_mode = 'room';

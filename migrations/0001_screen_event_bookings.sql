-- 0001_screen_event_bookings: backfill + no-overlap constraint + drop legacy column.
-- Run after `npm run db:push`. Idempotent.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'screens' AND column_name = 'current_event_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'screen_event_bookings'
  ) THEN
    INSERT INTO screen_event_bookings (id, screen_id, event_id, starts_at, ends_at, created_at, updated_at)
    SELECT gen_random_uuid(), s.id, s.current_event_id, e.start_date, e.end_date, now(), now()
    FROM screens s
    JOIN events e ON e.id = s.current_event_id
    WHERE s.current_event_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM screen_event_bookings b
        WHERE b.screen_id = s.id AND b.event_id = s.current_event_id
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'screen_event_bookings'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'screen_event_bookings_no_overlap'
  ) THEN
    ALTER TABLE screen_event_bookings
      ADD CONSTRAINT screen_event_bookings_no_overlap
      EXCLUDE USING gist (
        screen_id WITH =,
        tsrange(starts_at, ends_at, '[)') WITH &&
      );
  END IF;
END $$;

ALTER TABLE IF EXISTS screens DROP COLUMN IF EXISTS current_event_id;

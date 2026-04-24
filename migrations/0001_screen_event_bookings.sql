-- Migration 0001: screen_event_bookings (Task #129)
--
-- Run AFTER `npm run db:push` so the table exists. Idempotent: safe to
-- re-run. Server boot's ensureBookingMigration() in server/db.ts also
-- applies these steps so this file is mostly for ops visibility.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Backfill any rows still living on the legacy currentEventId column.
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

-- No-overlap constraint. tsrange (not tstzrange) because starts_at /
-- ends_at are timestamp without time zone; '[)' makes back-to-back
-- bookings legal.
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

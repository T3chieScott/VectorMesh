-- 0001_screen_event_bookings: backfill + drop legacy column + drop legacy
-- overlap constraint. Run after `npm run db:push`. Idempotent.
--
-- Booking overlap is now enforced in application code
-- (storage.createScreenEventBooking / updateScreenEventBooking) inside a
-- per-screen advisory-locked transaction. The original GIST exclusion
-- constraint required the `btree_gist` extension, which unprivileged
-- production DB users cannot install. We drop the legacy constraint here
-- (and skip CREATE EXTENSION) so previously-migrated environments
-- converge with fresh installs.

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

ALTER TABLE IF EXISTS screen_event_bookings
  DROP CONSTRAINT IF EXISTS screen_event_bookings_no_overlap;

ALTER TABLE IF EXISTS screens DROP COLUMN IF EXISTS current_event_id;

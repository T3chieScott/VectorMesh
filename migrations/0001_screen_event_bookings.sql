-- Migration 0001: screen_event_bookings
--
-- This migration captures the database changes that ship with Task #129
-- (multi-event screen bookings replacing screens.currentEventId). The
-- table itself is created/maintained by `drizzle-kit push` from
-- shared/schema.ts. Everything else in this file (extension, EXCLUDE
-- constraint, backfill from the legacy column) cannot be expressed in
-- the Drizzle schema, so we ship it here AND re-apply it idempotently
-- on every server boot via ensureBookingConstraints() in server/db.ts.
--
-- Running this file by hand is safe — every statement is a no-op when
-- the target object already exists.

-- 1. Range-overlap exclusion needs btree_gist (uuid + tstzrange).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Backfill any rows still living on screens.currentEventId. This is
--    a one-time copy: each affected screen gets exactly one booking
--    spanning its parent event. ON CONFLICT keeps the migration
--    idempotent if it's run again after the column is dropped (the
--    DO block guards against that case too).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'screens' AND column_name = 'current_event_id'
  ) THEN
    INSERT INTO screen_event_bookings (id, screen_id, event_id, starts_at, ends_at, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      s.id,
      s.current_event_id,
      e.start_date,
      e.end_date,
      now(),
      now()
    FROM screens s
    JOIN events e ON e.id = s.current_event_id
    WHERE s.current_event_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM screen_event_bookings b
        WHERE b.screen_id = s.id AND b.event_id = s.current_event_id
      );
  END IF;
END $$;

-- 3. Hard guarantee that no two bookings on the same screen overlap.
--    Half-open [) semantics so back-to-back bookings (B ends at the
--    same instant A starts) are allowed. Drizzle has no syntax for
--    EXCLUDE, so this is the source of truth for the constraint.
--
--    NOTE: starts_at/ends_at are `timestamp without time zone`, so we
--    use tsrange (not tstzrange). The 3-arg form with an explicit
--    bound text is IMMUTABLE, which is required for an index/EXCLUDE
--    expression.
ALTER TABLE screen_event_bookings
  DROP CONSTRAINT IF EXISTS screen_event_bookings_no_overlap;

ALTER TABLE screen_event_bookings
  ADD CONSTRAINT screen_event_bookings_no_overlap
  EXCLUDE USING gist (
    screen_id WITH =,
    tsrange(starts_at, ends_at, '[)') WITH &&
  );

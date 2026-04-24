import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Idempotently re-applies the database choreography that Drizzle's
// schema cannot describe for migration 0001 (screen_event_bookings):
//   1. CREATE EXTENSION btree_gist (needed for the GIST index)
//   2. Backfill from the legacy screens.current_event_id column if it
//      still exists (one booking per screen, spanning the parent
//      event). Skipped after the column has been dropped, which is
//      the steady state of the application.
//   3. ADD CONSTRAINT screen_event_bookings_no_overlap (EXCLUDE)
//   4. Drop the legacy current_event_id column ONLY after the backfill
//      has been verified to produce no orphan screens.
//
// Deployment ordering:
//   The full ordered migration is in migrations/0001_screen_event_bookings.sql
//   and the recommended deploy choreography is:
//     a) `psql -f migrations/0001_screen_event_bookings.sql`
//     b) `npm run db:push` (Drizzle then sees a no-op for screens.*)
//     c) Boot the new server; this function runs as a final safety net
//        and will SKIP cleanly if step (a) was already applied.
//   On a fresh database that has only ever seen the new schema, step (a)
//   becomes a no-op (no legacy column to read, table already created
//   by db:push) and this function simply re-applies the constraint.
//
// Arbitrary 64-bit constant chosen for pg_advisory_lock. Two concurrent
// boots will serialize on this lock so backfill + constraint creation
// happen atomically across the cluster, not just within one process.
const BOOKING_MIGRATION_LOCK_KEY = 715129_001n;

export async function ensureBookingMigration(): Promise<void> {
  const client = await pool.connect();
  let haveLock = false;
  try {
    // Take a session-scoped advisory lock so two replicas booting at
    // the same time don't race on backfill (the EXCLUDE constraint
    // doesn't exist yet at this point, so duplicate INSERTs would
    // succeed and then poison the subsequent ADD CONSTRAINT).
    await client.query("SELECT pg_advisory_lock($1)", [BOOKING_MIGRATION_LOCK_KEY.toString()]);
    haveLock = true;

    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

    // Defensive guard: bail cleanly if the schema sync hasn't created
    // screen_event_bookings yet. This avoids a hard server-boot crash
    // in an environment where the operator started a new container
    // before running `db:push`. They'll see the warning and re-run
    // db:push; on the next boot we'll do the real work.
    const { rows: bookingTbl } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'screen_event_bookings'
       ) AS exists`,
    );
    if (!bookingTbl[0]?.exists) {
      console.warn(
        "[ensureBookingMigration] screen_event_bookings table is missing; " +
          "run `npm run db:push` (and migrations/0001_screen_event_bookings.sql) before booting.",
      );
      return;
    }

    // Step 2 — Backfill any legacy currentEventId rows. We do this
    // ourselves (not just in the SQL file) so deployments that
    // accidentally skipped the SQL step still get a backfill BEFORE
    // we attempt the column drop in step 4.
    const { rows: legacyCol } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'screens' AND column_name = 'current_event_id'
       ) AS exists`,
    );
    if (legacyCol[0]?.exists) {
      const result = await client.query(
        `INSERT INTO screen_event_bookings (id, screen_id, event_id, starts_at, ends_at, created_at, updated_at)
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
           )`,
      );
      if (result.rowCount && result.rowCount > 0) {
        console.log(
          `[ensureBookingMigration] backfilled ${result.rowCount} screen booking(s) from legacy currentEventId`,
        );
      }

      // Step 4 — Verify backfill is complete BEFORE dropping the
      // column. If any non-null current_event_id row failed to land
      // in screen_event_bookings (e.g. orphaned event id) we abort
      // loudly rather than dropping data on the floor. The reviewer
      // explicitly called this out as a deployment safety blocker.
      const { rows: orphans } = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n
           FROM screens s
          WHERE s.current_event_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM screen_event_bookings b
               WHERE b.screen_id = s.id AND b.event_id = s.current_event_id
            )`,
      );
      const orphanCount = orphans[0]?.n ?? 0;
      if (orphanCount > 0) {
        throw new Error(
          `ensureBookingMigration: refusing to drop screens.current_event_id — ` +
            `${orphanCount} legacy assignment(s) failed to backfill (likely orphaned event ids). ` +
            `Investigate and re-run.`,
        );
      }
      await client.query(
        `ALTER TABLE screens DROP COLUMN IF EXISTS current_event_id`,
      );
      console.log(
        "[ensureBookingMigration] dropped legacy screens.current_event_id after verified backfill",
      );
    }

    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'screen_event_bookings_no_overlap'
       ) AS exists`,
    );
    if (!rows[0]?.exists) {
      // The starts_at/ends_at columns are `timestamp without time zone`
      // so we must use tsrange (not tstzrange). The 3-arg form with
      // an explicit '[)' bound text is IMMUTABLE, which is required
      // for an EXCLUDE/index expression. We FAIL LOUD here: if the
      // constraint can't be installed, app-level overlap rejection in
      // createScreenBooking is no longer backed by a hard guarantee
      // and we'd rather refuse to boot than silently degrade.
      await client.query(
        `ALTER TABLE screen_event_bookings
           ADD CONSTRAINT screen_event_bookings_no_overlap
           EXCLUDE USING gist (
             screen_id WITH =,
             tsrange(starts_at, ends_at, '[)') WITH &&
           )`,
      );
    }
  } finally {
    if (haveLock) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [BOOKING_MIGRATION_LOCK_KEY.toString()]);
      } catch (unlockErr) {
        console.error("ensureBookingMigration: failed to release advisory lock:", unlockErr);
      }
    }
    client.release();
  }
}

// Backwards-compatible alias kept so any in-flight callers don't break.
export const ensureBookingConstraints = ensureBookingMigration;

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

// Applies bookkeeping that Drizzle can't express: btree_gist extension,
// legacy currentEventId backfill, and the no-overlap EXCLUDE constraint.
// `db:push` must have already created the screen_event_bookings table —
// if it hasn't we throw so deploys fail fast instead of half-running.
const BOOKING_MIGRATION_LOCK_KEY = 715129_001n;

export async function ensureBookingMigration(): Promise<void> {
  const client = await pool.connect();
  let haveLock = false;
  try {
    // Serialize concurrent boots so two replicas don't race on backfill.
    await client.query("SELECT pg_advisory_lock($1)", [BOOKING_MIGRATION_LOCK_KEY.toString()]);
    haveLock = true;

    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

    const { rows: bookingTbl } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'screen_event_bookings'
       ) AS exists`,
    );
    if (!bookingTbl[0]?.exists) {
      throw new Error(
        "ensureBookingMigration: screen_event_bookings is missing. Run `npm run db:push` before starting the server.",
      );
    }

    const { rows: legacyCol } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'screens' AND column_name = 'current_event_id'
       ) AS exists`,
    );
    if (legacyCol[0]?.exists) {
      // Backfill, verify nothing was dropped on the floor, then drop
      // the legacy column. We do this here (not just in the SQL file)
      // so the boot path is self-healing.
      const result = await client.query(
        `INSERT INTO screen_event_bookings (id, screen_id, event_id, starts_at, ends_at, created_at, updated_at)
         SELECT gen_random_uuid(), s.id, s.current_event_id, e.start_date, e.end_date, now(), now()
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
          `[ensureBookingMigration] backfilled ${result.rowCount} legacy currentEventId row(s)`,
        );
      }

      const { rows: orphans } = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM screens s
          WHERE s.current_event_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM screen_event_bookings b
               WHERE b.screen_id = s.id AND b.event_id = s.current_event_id
            )`,
      );
      const orphanCount = orphans[0]?.n ?? 0;
      if (orphanCount > 0) {
        throw new Error(
          `ensureBookingMigration: ${orphanCount} legacy assignment(s) failed to backfill; refusing to drop screens.current_event_id`,
        );
      }
      await client.query(`ALTER TABLE screens DROP COLUMN IF EXISTS current_event_id`);
    }

    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'screen_event_bookings_no_overlap'
       ) AS exists`,
    );
    if (!rows[0]?.exists) {
      // tsrange (not tstzrange) because starts_at/ends_at are timestamp
      // without time zone; the 3-arg form is IMMUTABLE as required.
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

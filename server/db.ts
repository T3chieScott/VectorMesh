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

// Idempotently re-applies database objects that Drizzle's schema cannot
// describe — currently the btree_gist extension and the EXCLUDE
// constraint that prevents overlapping screen_event_bookings on the
// same screen. The full migration is documented in
// migrations/0001_screen_event_bookings.sql; this function exists so a
// fresh checkout boots into a working state without anyone having to
// run the SQL by hand.
export async function ensureBookingConstraints(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'screen_event_bookings_no_overlap'
       ) AS exists`,
    );
    if (!rows[0]?.exists) {
      // The starts_at/ends_at columns are `timestamp without time zone`
      // so we must use tsrange (not tstzrange). The ts*range form with
      // an explicit '[)' bound text is IMMUTABLE, which is required
      // for an EXCLUDE/index expression.
      await client.query(
        `ALTER TABLE screen_event_bookings
           ADD CONSTRAINT screen_event_bookings_no_overlap
           EXCLUDE USING gist (
             screen_id WITH =,
             tsrange(starts_at, ends_at, '[)') WITH &&
           )`,
      );
    }
  } catch (err) {
    // Surface but don't crash — the API will still serve, and storage
    // throws a friendly error if a write tries to overlap (the EXCLUDE
    // constraint is the second line of defence behind app-level
    // validation in createScreenBooking / updateScreenBooking).
    console.error("ensureBookingConstraints failed:", err);
  } finally {
    client.release();
  }
}

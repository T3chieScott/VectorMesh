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

const BOOKING_MIGRATION_LOCK_KEY = 715129_001n;

export async function ensureBookingMigration(): Promise<void> {
  const client = await pool.connect();
  let haveLock = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [BOOKING_MIGRATION_LOCK_KEY.toString()]);
    haveLock = true;

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

    // Booking overlap is now enforced in application code (see
    // storage.createScreenEventBooking / updateScreenEventBooking) inside
    // a per-screen advisory-locked transaction. The historical GIST
    // exclusion constraint required the `btree_gist` extension, which
    // unprivileged production DB users cannot install. We drop the
    // legacy constraint here so previously-migrated environments
    // converge with fresh installs. Idempotent.
    await client.query(
      `ALTER TABLE IF EXISTS screen_event_bookings
         DROP CONSTRAINT IF EXISTS screen_event_bookings_no_overlap`,
    );
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

export const ensureBookingConstraints = ensureBookingMigration;

/**
 * Idempotent startup migration for the Display Operations API permission
 * tables (Task #329).  Uses advisory locking so concurrent restarts
 * (e.g. blue/green deploy) can't race.
 *
 * The SQL is deliberately minimal — no foreign key gymnastics — so it can
 * run safely on any environment that already ran `npm run db:push`.
 */
const OPERATIONS_MIGRATION_LOCK_KEY = 715129_002n;
const MONITOR_SESSIONS_MIGRATION_LOCK_KEY = 715129_003n;

export async function ensureOperationsScopesMigration(): Promise<void> {
  const client = await pool.connect();
  let haveLock = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [
      OPERATIONS_MIGRATION_LOCK_KEY.toString(),
    ]);
    haveLock = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_operations_scopes (
        id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope      TEXT NOT NULL,
        granted_at TIMESTAMP DEFAULT NOW(),
        granted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT user_operations_scopes_user_scope_unique UNIQUE (user_id, scope)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS token_operations_scopes (
        id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        token_id   VARCHAR NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
        scope      TEXT NOT NULL,
        granted_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT token_operations_scopes_token_scope_unique UNIQUE (token_id, scope)
      )
    `);

    console.log("[ensureOperationsScopesMigration] operations scope tables ready");
  } finally {
    if (haveLock) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          OPERATIONS_MIGRATION_LOCK_KEY.toString(),
        ]);
      } catch (unlockErr) {
        console.error(
          "ensureOperationsScopesMigration: failed to release advisory lock:",
          unlockErr,
        );
      }
    }
    client.release();
  }
}

/**
 * Idempotent startup migration for the monitor_sessions table (Task #330).
 * Advisory-locked so concurrent restarts can't race. Safe to re-run.
 */
export async function ensureMonitorSessionsMigration(): Promise<void> {
  const client = await pool.connect();
  let haveLock = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [
      MONITOR_SESSIONS_MIGRATION_LOCK_KEY.toString(),
    ]);
    haveLock = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS monitor_sessions (
        id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        screen_id           VARCHAR NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
        client_id           VARCHAR REFERENCES clients(id) ON DELETE CASCADE,
        token_hash          VARCHAR NOT NULL UNIQUE,
        session_secret_hash VARCHAR,
        bootstrap_used_at   TIMESTAMP,
        expires_at          TIMESTAMP NOT NULL,
        revoked_at          TIMESTAMP,
        last_access_at      TIMESTAMP,
        client_type         TEXT,
        client_name         TEXT,
        created_at          TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS monitor_sessions_expires_at_idx ON monitor_sessions (expires_at)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS monitor_sessions_user_id_idx ON monitor_sessions (user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS monitor_sessions_screen_id_idx ON monitor_sessions (screen_id)`,
    );

    console.log("[ensureMonitorSessionsMigration] monitor_sessions table ready");
  } finally {
    if (haveLock) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          MONITOR_SESSIONS_MIGRATION_LOCK_KEY.toString(),
        ]);
      } catch (unlockErr) {
        console.error(
          "ensureMonitorSessionsMigration: failed to release advisory lock:",
          unlockErr,
        );
      }
    }
    client.release();
  }
}

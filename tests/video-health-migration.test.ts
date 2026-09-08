import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { screens } from "../shared/schema";

test("0038 video health recovery timestamp is publish-managed, nullable, and repeatable", () => {
  const sql = readFileSync("migrations/0038_video_health_last_recovery_at.sql", "utf8");
  assert.match(
    sql,
    /ALTER TABLE screens\s+ADD COLUMN IF NOT EXISTS video_stats_last_recovery_at TIMESTAMP;/,
    "the transfer migration must add the nullable timestamp idempotently",
  );
  assert.doesNotMatch(
    sql,
    /NOT NULL|DEFAULT/i,
    "existing production rows must retain NULL rather than inventing a recovery event",
  );

  assert.equal(
    screens.videoStatsLastRecoveryAt.name,
    "video_stats_last_recovery_at",
    "the shared Drizzle schema must map the published column",
  );
  assert.equal(
    screens.videoStatsLastRecoveryAt.notNull,
    false,
    "the event timestamp is nullable for screens with no genuine recovery",
  );

  const db = readFileSync("server/db.ts", "utf8");
  const startup = readFileSync("server/index.ts", "utf8");
  assert.doesNotMatch(
    db,
    /ensureVideoHealthLastRecoveryMigration|video_stats_last_recovery_at/,
    "application startup database helpers must not mutate publish-managed schema",
  );
  assert.doesNotMatch(
    startup,
    /ensureVideoHealthLastRecoveryMigration/,
    "server startup must not add a 0038 DDL hook",
  );
});
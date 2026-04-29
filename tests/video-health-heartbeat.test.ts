// Task #197 — server-side persistence + audit-log decisioning for the
// video keep-alive watchdog stats that piggy-back on every player
// heartbeat. The route layer just thin-wraps these helpers, so
// pinning the helpers covers all the interesting behaviour without
// spinning up an Express server.
//
// Behaviour we lock in:
//   1. Well-formed `errors.video` payloads are extracted.
//   2. Junk payloads (wrong shape, NaN, negatives, fractional) are
//      rejected so they never make it into the integer columns.
//   3. A higher reload count than was previously stored writes a
//      `screen_video_reload` audit_log row AND stamps lastReloadAt.
//   4. An equal-or-lower reload count (e.g. after a fresh page
//      load that reset the watchdog to 0) does NOT write an audit
//      row and does NOT touch lastReloadAt.

import test from "node:test";
import assert from "node:assert/strict";
import {
  decideVideoHealthUpdate,
  extractVideoStats,
} from "../server/videoHealthHeartbeat";
import {
  deriveVideoHealth,
  VIDEO_HEALTH_RECENT_WINDOW_MS,
} from "../shared/video-health";
import type { Screen } from "../shared/schema";

const PREFIX = "__TEST_S197__";

// ─── extractVideoStats ────────────────────────────────────────────

test(`${PREFIX} extractVideoStats: returns stats from a clean payload`, () => {
  const stats = extractVideoStats({ video: { stalls: 1, recoveries: 2, reloads: 3 } });
  assert.deepEqual(stats, { stalls: 1, recoveries: 2, reloads: 3 });
});

test(`${PREFIX} extractVideoStats: floors fractional counters`, () => {
  // The watchdog only ever ticks integers, but be defensive against
  // any client that sends a float — silently floor rather than
  // letting drizzle choke on the integer column.
  const stats = extractVideoStats({ video: { stalls: 1.9, recoveries: 0, reloads: 0 } });
  assert.deepEqual(stats, { stalls: 1, recoveries: 0, reloads: 0 });
});

test(`${PREFIX} extractVideoStats: rejects null / missing / wrong-shape payloads`, () => {
  assert.equal(extractVideoStats(null), null);
  assert.equal(extractVideoStats(undefined), null);
  assert.equal(extractVideoStats("not an object"), null);
  assert.equal(extractVideoStats({}), null);
  assert.equal(extractVideoStats({ video: null }), null);
  assert.equal(extractVideoStats({ video: "string" }), null);
  // Missing field
  assert.equal(extractVideoStats({ video: { stalls: 1, recoveries: 2 } }), null);
});

test(`${PREFIX} extractVideoStats: rejects non-finite or negative numbers`, () => {
  assert.equal(extractVideoStats({ video: { stalls: NaN, recoveries: 0, reloads: 0 } }), null);
  assert.equal(extractVideoStats({ video: { stalls: Infinity, recoveries: 0, reloads: 0 } }), null);
  assert.equal(extractVideoStats({ video: { stalls: -1, recoveries: 0, reloads: 0 } }), null);
  assert.equal(extractVideoStats({ video: { stalls: 0, recoveries: 0, reloads: "5" } }), null);
});

// ─── decideVideoHealthUpdate ──────────────────────────────────────

function makeScreen(overrides: Partial<Screen> = {}): Screen {
  // Only the fields decideVideoHealthUpdate reads matter — cast the
  // rest with `as Screen` rather than dragging in every nullable
  // column the Drizzle schema produces.
  return {
    id: "screen-1",
    videoStatsReloads: 0,
    videoStatsLastReloadAt: null,
    ...overrides,
  } as Screen;
}

test(`${PREFIX} decideVideoHealthUpdate: writes patch + audit row when reloads went up`, () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const decision = decideVideoHealthUpdate(
    makeScreen({ videoStatsReloads: 1 }),
    { stalls: 7, recoveries: 4, reloads: 2 },
    now,
  );

  assert.equal(decision.patch.videoStatsStalls, 7);
  assert.equal(decision.patch.videoStatsRecoveries, 4);
  assert.equal(decision.patch.videoStatsReloads, 2);
  assert.equal(decision.patch.videoStatsUpdatedAt.getTime(), now.getTime());
  assert.equal(decision.patch.videoStatsLastReloadAt?.getTime(), now.getTime());
  assert.ok(decision.auditLog, "expected audit log row");
  assert.equal(decision.auditLog!.action, "screen_video_reload");
  assert.equal(decision.auditLog!.entityType, "screen");
  assert.equal(decision.auditLog!.entityId, "screen-1");
  assert.deepEqual(decision.auditLog!.payload, {
    previousReloads: 1,
    newReloads: 2,
    stalls: 7,
    recoveries: 4,
  });
});

test(`${PREFIX} decideVideoHealthUpdate: equal reloads → no audit row, no lastReloadAt bump`, () => {
  const previous = new Date("2026-04-29T09:00:00Z");
  const now = new Date("2026-04-29T10:00:00Z");
  const decision = decideVideoHealthUpdate(
    makeScreen({ videoStatsReloads: 3, videoStatsLastReloadAt: previous }),
    { stalls: 9, recoveries: 5, reloads: 3 },
    now,
  );

  assert.equal(decision.auditLog, null, "no new reload happened");
  // updatedAt always advances; lastReloadAt should NOT be touched.
  assert.equal(decision.patch.videoStatsUpdatedAt.getTime(), now.getTime());
  assert.equal(decision.patch.videoStatsLastReloadAt, undefined);
});

test(`${PREFIX} decideVideoHealthUpdate: lower reloads (player page-load reset) → no audit row`, () => {
  // The watchdog resets to 0 whenever the player tab itself reloads.
  // Treat a decrease as "fresh page" — overwrite the counters so we
  // don't permanently show stale historical totals, but DO NOT log
  // a phantom reload event.
  const decision = decideVideoHealthUpdate(
    makeScreen({ videoStatsReloads: 5 }),
    { stalls: 0, recoveries: 0, reloads: 0 },
    new Date(),
  );
  assert.equal(decision.auditLog, null);
  assert.equal(decision.patch.videoStatsReloads, 0);
  assert.equal(decision.patch.videoStatsLastReloadAt, undefined);
});

// ─── deriveVideoHealth (UI consumer) ─────────────────────────────

test(`${PREFIX} deriveVideoHealth: unknown when never reported`, () => {
  const v = deriveVideoHealth({
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
    videoStatsLastReloadAt: null,
    videoStatsUpdatedAt: null,
  });
  assert.equal(v.status, "unknown");
});

test(`${PREFIX} deriveVideoHealth: green when reported zeroes`, () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const v = deriveVideoHealth(
    {
      videoStatsStalls: 0,
      videoStatsRecoveries: 0,
      videoStatsReloads: 0,
      videoStatsLastReloadAt: null,
      videoStatsUpdatedAt: now,
    },
    now,
  );
  assert.equal(v.status, "green");
});

test(`${PREFIX} deriveVideoHealth: amber when recoveries > 0 within recency window`, () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const v = deriveVideoHealth(
    {
      videoStatsStalls: 5,
      videoStatsRecoveries: 2,
      videoStatsReloads: 0,
      videoStatsLastReloadAt: null,
      videoStatsUpdatedAt: now,
    },
    now,
  );
  assert.equal(v.status, "amber");
});

test(`${PREFIX} deriveVideoHealth: red when reload landed inside the recency window`, () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const v = deriveVideoHealth(
    {
      videoStatsStalls: 5,
      videoStatsRecoveries: 0,
      videoStatsReloads: 1,
      videoStatsLastReloadAt: new Date(now.getTime() - 5 * 60 * 1000),
      videoStatsUpdatedAt: now,
    },
    now,
  );
  assert.equal(v.status, "red");
});

test(`${PREFIX} deriveVideoHealth: stale reload (outside recency window) falls back to green`, () => {
  // A reload from yesterday shouldn't keep the badge stuck on red
  // forever — it has had hours to be noticed. Once it's outside the
  // window, the badge returns to green so operators aren't fatigued
  // by historical noise.
  const now = new Date("2026-04-29T10:00:00Z");
  const v = deriveVideoHealth(
    {
      videoStatsStalls: 5,
      videoStatsRecoveries: 0,
      videoStatsReloads: 1,
      videoStatsLastReloadAt: new Date(
        now.getTime() - VIDEO_HEALTH_RECENT_WINDOW_MS - 1000,
      ),
      videoStatsUpdatedAt: now,
    },
    now,
  );
  assert.equal(v.status, "green");
});

test(`${PREFIX} deriveVideoHealth: handles ISO string timestamps from JSON wire`, () => {
  // The screens query result deserialises timestamps as ISO strings
  // — make sure the helper accepts them as well as Date objects.
  const now = new Date("2026-04-29T10:00:00Z");
  const v = deriveVideoHealth(
    {
      videoStatsStalls: 0,
      videoStatsRecoveries: 0,
      videoStatsReloads: 1,
      videoStatsLastReloadAt: new Date(now.getTime() - 60_000).toISOString(),
      videoStatsUpdatedAt: now.toISOString(),
    },
    now,
  );
  assert.equal(v.status, "red");
});

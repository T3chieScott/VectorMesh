// Task #139 regression: the heartbeat-based "screen offline" detector
// (storage.markStaleScreensOffline) must classify staleness purely by
// UTC-millisecond elapsed time, never by wall-clock components in any
// client/site timezone. These tests pin that behaviour by injecting an
// explicit `now` Date that lands on real Europe/London DST transition
// instants — both spring-forward (2026-03-29) and fall-back (2026-10-25).
//
// If a future refactor sneaks tz-local logic into the cutoff math, at
// least one of these tests will fail because the wall-clock delta and
// the UTC delta diverge by 60 minutes during the transition window.
//
// We exercise the real DB-backed storage (parity with
// booking-overlap-enforcement.test.ts) so the SQL `lt(lastSeen, cutoff)`
// query is also covered.
//
// Test isolation: we deliberately call `markStaleScreensOffline` with a
// `now` set far in the future (2026), which will also flip ambient
// `isOnline=true` rows in the dev DB. To avoid leaking that side effect
// to other test files we (a) snapshot every currently-online row at
// file start and restore them at file end, and (b) only ever assert on
// rows whose name starts with our PREFIX so ambient state can never
// influence pass/fail.

import test from "node:test";
import assert from "node:assert/strict";
import { eq, like, sql, inArray } from "drizzle-orm";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { clients, screens, type Screen } from "../shared/schema";

const PREFIX = "__TEST_HBOFF__";
let testClientId: string;
let ambientOnlineIds: string[] = [];

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

async function insertScreen(name: string, lastSeen: Date) {
  const [row] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}${name}`,
      clientId: testClientId,
      isPaired: true,
      isOnline: true,
      lastSeen,
    })
    .returning();
  return row;
}

async function refetch(id: string) {
  const [row] = await db
    .select()
    .from(screens)
    .where(sql`${screens.id} = ${id}`);
  return row;
}

/** Restrict to test-prefix rows so ambient DB state can never influence assertions. */
function ours(rows: Screen[]): Screen[] {
  return rows.filter((s) => s.name.startsWith(PREFIX));
}

test.before(async () => {
  await cleanup();
  // Snapshot ambient `isOnline = true` screens so we can restore them
  // after the suite — our future-dated `now` would otherwise flip them.
  const ambient = await db
    .select({ id: screens.id })
    .from(screens)
    .where(eq(screens.isOnline, true));
  ambientOnlineIds = ambient.map((r) => r.id);

  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();
  testClientId = client.id;
});

test.after(async () => {
  // Restore ambient `isOnline` flags before our test rows are removed.
  if (ambientOnlineIds.length > 0) {
    await db
      .update(screens)
      .set({ isOnline: true } as any)
      .where(inArray(screens.id, ambientOnlineIds));
  }
  await cleanup();
});

// ===========================================================================
// Spring-forward: 2026-03-29 in Europe/London — wall jumps 01:00 GMT to
// 02:00 BST.
// ===========================================================================

test("spring-forward: screen last seen at 00:30 GMT is stale at 02:30 BST (UTC delta 2h, threshold 60s)", async () => {
  const lastSeen = new Date("2026-03-29T00:30:00Z"); // 00:30 GMT
  const now = new Date("2026-03-29T02:30:00Z"); // 03:30 BST, 2h later by UTC
  const screen = await insertScreen("springfwd-stale", lastSeen);

  const offline = ours(await storage.markStaleScreensOffline(60_000, now));
  assert.ok(
    offline.some((s) => s.id === screen.id),
    "screen 2h stale across spring-forward must be marked offline",
  );
  const refreshed = await refetch(screen.id);
  assert.equal(refreshed.isOnline, false);
});

test("spring-forward: screen last seen 30s before injected now (across the gap) is FRESH (under 60s threshold)", async () => {
  // lastSeen 00:59:30 GMT; now 02:00:00 BST = 01:00:00 UTC. UTC delta
  // is exactly 30 seconds — under the 60s threshold. A wall-clock
  // subtraction in Europe/London would compute "00:59:30 → 02:00:00" =
  // 1h0m30s, *over* threshold, and incorrectly mark this screen
  // offline. The correct UTC-ms math keeps it online.
  const lastSeen = new Date("2026-03-29T00:59:30Z"); // 00:59:30 GMT
  const now = new Date("2026-03-29T01:00:00Z"); // 02:00:00 BST = 01:00:00 UTC
  const screen = await insertScreen("springfwd-fresh", lastSeen);

  const offline = ours(await storage.markStaleScreensOffline(60_000, now));
  assert.ok(
    !offline.some((s) => s.id === screen.id),
    "30s-fresh screen must NOT be marked offline even when the wall delta crosses spring-forward",
  );
  const refreshed = await refetch(screen.id);
  assert.equal(
    refreshed.isOnline,
    true,
    "isOnline must remain true; wall-clock delta must not be used",
  );
});

// ===========================================================================
// Fall-back: 2026-10-25 in Europe/London — wall jumps 02:00 BST back to
// 01:00 GMT, so 01:30 wall happens twice.
// ===========================================================================

test("fall-back: screen last seen at the FIRST 01:30 wall instance is stale 1h later by UTC ms", async () => {
  const lastSeen = new Date("2026-10-25T00:30:00Z"); // 01:30 BST (first instance)
  const now = new Date("2026-10-25T01:30:00Z"); // 01:30 GMT (second instance)
  const screen = await insertScreen("fallback-stale", lastSeen);

  const offline = ours(await storage.markStaleScreensOffline(60_000, now));
  assert.ok(
    offline.some((s) => s.id === screen.id),
    "1h-stale screen across fall-back must be marked offline (UTC delta 3600s > 60s)",
  );
});

test("fall-back: 30s-fresh screen straddling the 01:30 wall duplication stays online", async () => {
  // lastSeen 00:30:00 UTC = 01:30:00 BST (first 01:30); now 00:30:30 UTC
  // = 01:30:30 BST. UTC delta 30s — fresh. A wall-clock subtraction would
  // see *the same* 01:30 wall time and might report 0 elapsed; either way
  // it must not affect the verdict because the cutoff is purely UTC.
  const lastSeen = new Date("2026-10-25T00:30:00Z");
  const now = new Date("2026-10-25T00:30:30Z");
  const screen = await insertScreen("fallback-fresh", lastSeen);

  const offline = ours(await storage.markStaleScreensOffline(60_000, now));
  assert.ok(
    !offline.some((s) => s.id === screen.id),
    "30s-fresh screen on fall-back day must NOT be marked offline",
  );
  const refreshed = await refetch(screen.id);
  assert.equal(refreshed.isOnline, true);
});

// ===========================================================================
// Sanity baseline (non-DST day) to ensure the injected-now path agrees
// with the default-Date.now() path on a stable day.
// ===========================================================================

test("baseline: explicit `now` 5m after lastSeen marks the screen offline (non-DST day)", async () => {
  const lastSeen = new Date("2026-04-15T10:00:00Z");
  const now = new Date("2026-04-15T10:05:00Z");
  const screen = await insertScreen("baseline-stale", lastSeen);

  const offline = ours(await storage.markStaleScreensOffline(60_000, now));
  assert.ok(offline.some((s) => s.id === screen.id));
});

test("baseline: explicit `now` 10s after lastSeen does NOT mark the screen offline", async () => {
  const lastSeen = new Date("2026-04-15T10:00:00Z");
  const now = new Date("2026-04-15T10:00:10Z");
  const screen = await insertScreen("baseline-fresh", lastSeen);

  const offline = ours(await storage.markStaleScreensOffline(60_000, now));
  assert.ok(!offline.some((s) => s.id === screen.id));
});

// ===========================================================================
// Production-caller documentation: confirm that omitting `now` falls back
// to the wall clock so the existing `setInterval` sweep in routes.ts is
// unaffected by the new optional parameter.
// ===========================================================================

test("default-now path: omitting `now` uses Date.now() — a freshly-inserted screen stays online", async () => {
  // Insert a screen with lastSeen = real-now. Calling without `now`
  // resolves the cutoff against Date.now(), so this screen is fresh and
  // must not be flipped. This pins the production setInterval call site
  // (`storage.markStaleScreensOffline(STALE_THRESHOLD_MS)` with no second
  // arg) to the documented default behaviour.
  const screen = await insertScreen("default-now-fresh", new Date());
  const offline = ours(await storage.markStaleScreensOffline(60_000));
  assert.ok(
    !offline.some((s) => s.id === screen.id),
    "default-now path: a just-inserted screen must remain online",
  );
});

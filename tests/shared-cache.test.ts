// Task #290 — PostgreSQL shared (L2) cache behaviour.
//
// These tests exercise server/sharedCache.ts against the real DB (the same
// pattern as tests/get-current-event-for-screen.test.ts). Every entry lives
// under a unique throwaway namespace prefix so runs never collide and are
// cleaned up afterwards.

import test from "node:test";
import assert from "node:assert/strict";
import { like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { sharedCache } from "../shared/schema";
import {
  get,
  set,
  del,
  clearNamespace,
  getOrSet,
  getStale,
  buildCacheKey,
  isExpired,
  calculateExpiry,
  safeJsonForCache,
  pruneExpired,
  registerRefresher,
  refreshEntry,
  __clearInflight,
} from "../server/sharedCache";

const NS = "__TEST_SC__";
const ns = (suffix: string) => `${NS}${suffix}`;

async function cleanup() {
  await db.delete(sharedCache).where(like(sharedCache.namespace, `${NS}%`));
}

test.before(async () => {
  await cleanup();
});

test.afterEach(() => {
  __clearInflight();
});

test.after(async () => {
  await cleanup();
  await pool.end();
});

// ---------- pure helpers ----------

test("buildCacheKey joins parts and maps empty/nullish to _", () => {
  assert.equal(buildCacheKey("siteA", "cfg1"), "siteA:cfg1");
  assert.equal(buildCacheKey("siteA", null, undefined, ""), "siteA:_:_:_");
  assert.equal(buildCacheKey(1, 2), "1:2");
});

test("calculateExpiry returns null for non-positive/non-finite TTLs", () => {
  assert.equal(calculateExpiry(null), null);
  assert.equal(calculateExpiry(0), null);
  assert.equal(calculateExpiry(-5), null);
  const d = calculateExpiry(1000);
  assert.ok(d instanceof Date && d.getTime() > Date.now());
});

test("isExpired treats null expiry as never-expires", () => {
  assert.equal(isExpired({ expiresAt: null }), false);
  assert.equal(isExpired({ expiresAt: new Date(Date.now() - 1000) }), true);
  assert.equal(isExpired({ expiresAt: new Date(Date.now() + 10_000) }), false);
});

test("safeJsonForCache strips undefined/functions", () => {
  const out = safeJsonForCache({ a: 1, b: undefined, c: () => 1, d: [1, undefined] }) as any;
  assert.deepEqual(out, { a: 1, d: [1, null] });
  assert.equal(safeJsonForCache(undefined), null);
});

// ---------- set / get / delete ----------

test("set then get returns a fresh entry", async () => {
  const namespace = ns("setget");
  await set(namespace, "k1", { hello: "world" }, { ttlMs: 60_000, source: "unit" });
  const out = await get<{ hello: string }>(namespace, "k1");
  assert.ok(out);
  assert.deepEqual(out!.data, { hello: "world" });
  assert.equal(out!.status, "fresh");
  assert.equal(out!.stale, false);
  assert.equal(out!.source, "unit");
});

test("get returns null for a missing entry", async () => {
  const out = await get(ns("missing"), "nope");
  assert.equal(out, null);
});

test("expired entry reads back as stale", async () => {
  const namespace = ns("expiry");
  await set(namespace, "k", { v: 1 }, { ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 10));
  const out = await get<{ v: number }>(namespace, "k");
  assert.ok(out);
  assert.equal(out!.stale, true);
  assert.equal(out!.status, "stale");
  assert.deepEqual(out!.data, { v: 1 });
});

test("del removes an entry", async () => {
  const namespace = ns("del");
  await set(namespace, "k", { v: 1 }, { ttlMs: 60_000 });
  assert.equal(await del(namespace, "k"), true);
  assert.equal(await get(namespace, "k"), null);
});

// ---------- getOrSet ----------

test("getOrSet computes and stores on a cold miss", async () => {
  const namespace = ns("cold");
  let calls = 0;
  const res = await getOrSet({
    namespace,
    key: "k",
    ttlMs: 60_000,
    fetcher: async () => {
      calls++;
      return { n: 42 };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(res.data, { n: 42 });
  assert.equal(res.status, "fresh");
  // Second call is a fresh hit — fetcher not invoked again.
  const res2 = await getOrSet({ namespace, key: "k", ttlMs: 60_000, fetcher: async () => { calls++; return { n: 0 }; } });
  assert.equal(calls, 1);
  assert.deepEqual(res2.data, { n: 42 });
});

test("getOrSet serves stale value when refresh fails (default)", async () => {
  const namespace = ns("stalefail");
  await set(namespace, "k", { good: true }, { ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 10));
  // Blocking refresh (staleWhileRevalidate:false) that throws → falls back to stale.
  const res = await getOrSet({
    namespace,
    key: "k",
    ttlMs: 60_000,
    staleWhileRevalidate: false,
    fetcher: async () => {
      throw new Error("upstream down");
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.stale, true);
  assert.equal(res.status, "stale");
  assert.deepEqual(res.data, { good: true });
});

test("getOrSet surfaces error when refresh fails and no stale value exists", async () => {
  const namespace = ns("hardfail");
  const res = await getOrSet({
    namespace,
    key: "k",
    ttlMs: 60_000,
    fetcher: async () => {
      throw new Error("boom");
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, "error");
  assert.equal(res.data, null);
  // The failure is persisted with status "error" and the stale getter still
  // returns the error marker rather than a value.
  const stale = await getStale(namespace, "k");
  assert.ok(stale);
  assert.equal(stale!.ok, false);
});

test("getOrSet refresh failure does not destroy the last-known-good value", async () => {
  const namespace = ns("preserve");
  await set(namespace, "k", { v: "kept" }, { ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 10));
  await getOrSet({
    namespace,
    key: "k",
    ttlMs: 60_000,
    staleWhileRevalidate: false,
    fetcher: async () => {
      throw new Error("nope");
    },
  });
  // markError keeps valueJson — getStale must still return it.
  const stale = await getStale<{ v: string }>(namespace, "k");
  assert.ok(stale);
  assert.deepEqual(stale!.data, { v: "kept" });
});

// ---------- single-flight ----------

test("concurrent getOrSet on a cold key hits upstream only once", async () => {
  const namespace = ns("singleflight");
  let calls = 0;
  const fetcher = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 30));
    return { n: calls };
  };
  const [a, b, c] = await Promise.all([
    getOrSet({ namespace, key: "k", ttlMs: 60_000, fetcher }),
    getOrSet({ namespace, key: "k", ttlMs: 60_000, fetcher }),
    getOrSet({ namespace, key: "k", ttlMs: 60_000, fetcher }),
  ]);
  assert.equal(calls, 1, "stampede must collapse to a single upstream call");
  assert.deepEqual(a.data, { n: 1 });
  assert.deepEqual(b.data, { n: 1 });
  assert.deepEqual(c.data, { n: 1 });
});

// ---------- tenant isolation ----------

test("clientId-scoped keys isolate tenants", async () => {
  const namespace = ns("tenant");
  const keyA = buildCacheKey("siteA", "cfg1");
  const keyB = buildCacheKey("siteB", "cfg1");
  await set(namespace, keyA, { owner: "A" }, { ttlMs: 60_000, metadata: { clientId: "siteA" } });
  await set(namespace, keyB, { owner: "B" }, { ttlMs: 60_000, metadata: { clientId: "siteB" } });
  const a = await get<{ owner: string }>(namespace, keyA);
  const b = await get<{ owner: string }>(namespace, keyB);
  assert.deepEqual(a!.data, { owner: "A" });
  assert.deepEqual(b!.data, { owner: "B" });
});

// ---------- namespace clear & upsert ----------

test("clearNamespace removes only that namespace", async () => {
  const a = ns("clearA");
  const b = ns("clearB");
  await set(a, "k1", { v: 1 }, { ttlMs: 60_000 });
  await set(a, "k2", { v: 2 }, { ttlMs: 60_000 });
  await set(b, "k1", { v: 3 }, { ttlMs: 60_000 });
  const cleared = await clearNamespace(a);
  assert.equal(cleared, 2);
  assert.equal(await get(a, "k1"), null);
  assert.ok(await get(b, "k1"), "other namespace must survive");
});

test("set upserts (overwrites) an existing key", async () => {
  const namespace = ns("upsert");
  await set(namespace, "k", { v: 1 }, { ttlMs: 60_000 });
  await set(namespace, "k", { v: 2 }, { ttlMs: 60_000 });
  const out = await get<{ v: number }>(namespace, "k");
  assert.deepEqual(out!.data, { v: 2 });
});

// ---------- GC ----------

test("pruneExpired removes rows past the grace window but keeps recent stale", async () => {
  const namespace = ns("gc");
  // An entry expired well beyond the grace window.
  await set(namespace, "old", { v: 1 }, { ttlMs: 60_000 });
  await db
    .update(sharedCache)
    .set({ expiresAt: new Date(Date.now() - 10 * 60_000) })
    .where(sql`${sharedCache.namespace} = ${namespace} AND ${sharedCache.cacheKey} = 'old'`);
  // A recently-expired entry that must survive (serve-stale).
  await set(namespace, "recent", { v: 2 }, { ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 10));

  const pruned = await pruneExpired(5 * 60_000); // 5-minute grace
  assert.ok(pruned >= 1);
  assert.equal(await get(namespace, "old"), null, "old entry GC'd");
  assert.ok(await get(namespace, "recent"), "recently-expired entry kept as stale");
});

// ---------- refresher registry (admin "refresh") ----------

test("refreshEntry returns found:false for a missing entry", async () => {
  const out = await refreshEntry(ns("refresh-missing"), "nope");
  assert.equal(out.found, false);
  assert.equal(out.refreshed, false);
});

test("refreshEntry purges when the namespace has no registered refresher", async () => {
  const namespace = ns("refresh-purge");
  await set(namespace, "k", { v: 1 }, { ttlMs: 60_000 });
  const out = await refreshEntry(namespace, "k");
  assert.equal(out.found, true);
  assert.equal(out.refreshed, true);
  assert.equal(out.purged, true);
  assert.equal(await get(namespace, "k"), null, "purged entry is gone");
});

test("refreshEntry recomputes via a registered refresher even when fresh", async () => {
  const namespace = ns("refresh-recompute");
  registerRefresher(namespace, async (entry) => {
    await set(namespace, entry.cacheKey, { v: "recomputed" }, { ttlMs: 60_000, source: "test" });
    return { data: { v: "recomputed" }, status: "fresh", stale: false, ok: true, updatedAt: new Date(), source: "test" };
  });
  // Seed a still-fresh value; refresh must overwrite it anyway.
  await set(namespace, "k", { v: "old" }, { ttlMs: 60_000 });
  const out = await refreshEntry(namespace, "k");
  assert.equal(out.found, true);
  assert.equal(out.refreshed, true);
  assert.equal(out.purged, false);
  const after = await get<{ v: string }>(namespace, "k");
  assert.deepEqual(after!.data, { v: "recomputed" });
});

test("refreshEntry preserves last-known-good when a refresher throws", async () => {
  const namespace = ns("refresh-throw");
  registerRefresher(namespace, async () => {
    throw new Error("recompute boom");
  });
  await set(namespace, "k", { v: "kept" }, { ttlMs: 60_000 });
  const out = await refreshEntry(namespace, "k");
  assert.equal(out.found, true);
  assert.equal(out.refreshed, false);
  assert.equal(out.status, "error");
  // markError keeps the previous value as stale.
  const stale = await getStale<{ v: string }>(namespace, "k");
  assert.ok(stale);
  assert.deepEqual(stale!.data, { v: "kept" });
});

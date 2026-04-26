// Task #173 regression: pairing is canvas-aware. One tile per
// (clientId, canvasWidth, canvasHeight) canvas owns the pairing
// state; siblings inherit it. These tests pin both the pure
// `pickCanvasPairingWinner` selector and the DB-backed storage
// helpers (`getCanvasMembers`, `setCanvasPairingState`,
// `backfillCanvasPairingState`) that the route layer calls when
// a player pairs / heartbeats / regenerates / unpairs / boots.
//
// We exercise the real DB-backed storage (parity with
// heartbeat-offline-dst.test.ts and booking-overlap-enforcement.test.ts)
// so SQL semantics — including the `clientId IS NULL` branch — are
// covered.
//
// Test isolation: every row this file inserts is namespaced with
// PREFIX so we can clean up at file start AND end without touching
// ambient dev data.

import test from "node:test";
import assert from "node:assert/strict";
import { like } from "drizzle-orm";
import { storage, pickCanvasPairingWinner } from "../server/storage";
import { db } from "../server/db";
import { clients, screens, type Screen } from "../shared/schema";
import {
  groupScreensByCanvas,
  siblingsOnCanvas,
  isCanvasWallGroup,
} from "../shared/canvas-groups";

const PREFIX = "__TEST_CVPAIR__";

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

async function makeClient(label: string): Promise<string> {
  const [c] = await db
    .insert(clients)
    .values({ name: `${PREFIX}${label}` })
    .returning();
  return c.id;
}

interface MakeScreenOpts {
  name: string;
  clientId: string | null;
  createdAt: Date;
  canvasEnabled?: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  canvasX?: number;
  canvasY?: number;
  isPaired?: boolean;
  isOnline?: boolean;
  pairingCode?: string | null;
  deviceToken?: string | null;
  lastSeen?: Date | null;
  ipAddress?: string | null;
  hostname?: string | null;
  hardwareClass?: string | null;
}

async function makeScreen(opts: MakeScreenOpts): Promise<Screen> {
  const [row] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}${opts.name}`,
      clientId: opts.clientId,
      canvasEnabled: opts.canvasEnabled ?? false,
      canvasWidth: opts.canvasWidth ?? null,
      canvasHeight: opts.canvasHeight ?? null,
      canvasX: opts.canvasX ?? 0,
      canvasY: opts.canvasY ?? 0,
      isPaired: opts.isPaired ?? false,
      isOnline: opts.isOnline ?? false,
      pairingCode: opts.pairingCode ?? null,
      deviceToken: opts.deviceToken ?? null,
      lastSeen: opts.lastSeen ?? null,
      ipAddress: opts.ipAddress ?? null,
      hostname: opts.hostname ?? null,
      hardwareClass: opts.hardwareClass ?? null,
      createdAt: opts.createdAt,
    } as any)
    .returning();
  return row;
}

test.before(cleanup);
test.after(cleanup);

// ─── pickCanvasPairingWinner (pure function, no DB) ────────────────

test("pickCanvasPairingWinner: paired tile beats unpaired tiles", () => {
  const a: Screen = {
    id: "a", name: "a", clientId: null,
    isPaired: false, deviceToken: null, lastSeen: null,
    createdAt: new Date("2026-01-01"),
  } as any;
  const b: Screen = {
    id: "b", name: "b", clientId: null,
    isPaired: true, deviceToken: "tok-b", lastSeen: new Date("2026-04-01"),
    createdAt: new Date("2026-02-01"),
  } as any;
  const c: Screen = {
    id: "c", name: "c", clientId: null,
    isPaired: false, deviceToken: null, lastSeen: null,
    createdAt: new Date("2026-03-01"),
  } as any;
  const winner = pickCanvasPairingWinner([a, b, c]);
  assert.equal(winner.id, "b");
});

test("pickCanvasPairingWinner: most-recently-seen paired tile wins", () => {
  const a: Screen = {
    id: "a", name: "a", clientId: null,
    isPaired: true, deviceToken: "tok-a", lastSeen: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
  } as any;
  const b: Screen = {
    id: "b", name: "b", clientId: null,
    isPaired: true, deviceToken: "tok-b", lastSeen: new Date("2026-04-01"),
    createdAt: new Date("2026-02-01"),
  } as any;
  const c: Screen = {
    id: "c", name: "c", clientId: null,
    isPaired: true, deviceToken: "tok-c", lastSeen: new Date("2026-03-01"),
    createdAt: new Date("2026-03-01"),
  } as any;
  const winner = pickCanvasPairingWinner([a, b, c]);
  assert.equal(winner.id, "b");
});

test("pickCanvasPairingWinner: falls back to earliest-created when none paired", () => {
  // Members are passed in createdAt-asc order (the order
  // getCanvasMembers / backfillCanvasPairingState already produce).
  const a: Screen = {
    id: "a", name: "a", clientId: null,
    isPaired: false, deviceToken: null, lastSeen: null,
    createdAt: new Date("2026-01-01"),
  } as any;
  const b: Screen = {
    id: "b", name: "b", clientId: null,
    isPaired: false, deviceToken: null, lastSeen: null,
    createdAt: new Date("2026-02-01"),
  } as any;
  const winner = pickCanvasPairingWinner([a, b]);
  assert.equal(winner.id, "a");
});

test("pickCanvasPairingWinner: a paired tile with a NULL deviceToken does not count as paired", () => {
  // Defensive: isPaired=true with deviceToken=null is a corrupt half-state.
  // Treat it as unpaired so a real paired sibling still wins.
  const halfState: Screen = {
    id: "half", name: "half", clientId: null,
    isPaired: true, deviceToken: null, lastSeen: new Date("2026-04-01"),
    createdAt: new Date("2026-01-01"),
  } as any;
  const real: Screen = {
    id: "real", name: "real", clientId: null,
    isPaired: true, deviceToken: "tok", lastSeen: new Date("2026-03-01"),
    createdAt: new Date("2026-02-01"),
  } as any;
  const winner = pickCanvasPairingWinner([halfState, real]);
  assert.equal(winner.id, "real");
});

// ─── getCanvasMembers (DB-backed) ──────────────────────────────────

test("getCanvasMembers: returns only screens that share clientId+canvasWidth+canvasHeight+canvasEnabled", async () => {
  const clientA = await makeClient("members-A");
  const clientB = await makeClient("members-B");
  const t0 = new Date("2026-01-01T00:00:00Z");
  // Three tiles on client A's 3840x1080 canvas:
  const a1 = await makeScreen({
    name: "memA1", clientId: clientA, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
  });
  const a2 = await makeScreen({
    name: "memA2", clientId: clientA, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920,
  });
  const a3 = await makeScreen({
    name: "memA3", clientId: clientA, createdAt: new Date(t0.getTime() + 2000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 3840,
  });
  // Same client, DIFFERENT canvas size — must NOT be a member.
  await makeScreen({
    name: "memAOther", clientId: clientA, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
  });
  // Same client + same dims but canvas DISABLED — must NOT be a member.
  await makeScreen({
    name: "memADisabled", clientId: clientA, createdAt: t0,
    canvasEnabled: false, canvasWidth: 3840, canvasHeight: 1080,
  });
  // Different client, same dims — must NOT be a member (walls don't span clients).
  await makeScreen({
    name: "memBSame", clientId: clientB, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
  });

  const members = await storage.getCanvasMembers(a1);
  const ids = members.map((m) => m.id).sort();
  assert.deepEqual(ids, [a1.id, a2.id, a3.id].sort());
  // Order is createdAt asc — the canonical owner is members[0].
  assert.equal(members[0].id, a1.id);
});

test("getCanvasMembers: non-canvas screen returns [self]", async () => {
  const clientId = await makeClient("nocanvas");
  const s = await makeScreen({
    name: "soloNoCanvas", clientId, createdAt: new Date("2026-02-01"),
    canvasEnabled: false,
  });
  const members = await storage.getCanvasMembers(s);
  assert.equal(members.length, 1);
  assert.equal(members[0].id, s.id);
});

test("getCanvasMembers: groups screens with NULL clientId together (and excludes clientful screens with same dims)", async () => {
  const clientId = await makeClient("nullClient-Other");
  const t0 = new Date("2026-03-01T00:00:00Z");
  // Distinct positions so the bucket forms a real wall under the
  // Task #176 position-distinctness rule.
  const n1 = await makeScreen({
    name: "nullA", clientId: null, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
  });
  const n2 = await makeScreen({
    name: "nullB", clientId: null, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 1920,
  });
  // A clientful screen with the same dims must NOT be considered a sibling.
  await makeScreen({
    name: "clientSameDims", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
  });

  const members = await storage.getCanvasMembers(n1);
  const ids = members.map((m) => m.id).sort();
  assert.deepEqual(ids, [n1.id, n2.id].sort());
});

// ─── setCanvasPairingState (DB-backed) ─────────────────────────────

test("setCanvasPairingState: updates every member atomically and is a no-op for an empty id list", async () => {
  const clientId = await makeClient("setState");
  const t0 = new Date("2026-04-01T00:00:00Z");
  const m1 = await makeScreen({
    name: "setA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
    pairingCode: "OLD123", isPaired: false,
  });
  const m2 = await makeScreen({
    name: "setB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
    pairingCode: "OLD123", isPaired: false,
  });

  const updated = await storage.setCanvasPairingState([m1.id, m2.id], {
    pairingCode: "NEW456",
    deviceToken: "tok-shared",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-04-15T10:00:00Z"),
    ipAddress: "10.0.0.5",
    hostname: "wall-pi",
    hardwareClass: "rpi5",
  });
  assert.equal(updated, 2);

  const after1 = await storage.getCanvasMembers(m1);
  for (const m of after1) {
    assert.equal(m.pairingCode, "NEW456");
    assert.equal(m.deviceToken, "tok-shared");
    assert.equal(m.isPaired, true);
    assert.equal(m.isOnline, true);
    assert.equal(m.ipAddress, "10.0.0.5");
    assert.equal(m.hostname, "wall-pi");
    assert.equal(m.hardwareClass, "rpi5");
  }

  // Empty id list / empty fields are no-ops, never throw.
  assert.equal(await storage.setCanvasPairingState([], { pairingCode: "X" }), 0);
  assert.equal(await storage.setCanvasPairingState([m1.id], {}), 0);
});

// ─── backfillCanvasPairingState (DB-backed) ────────────────────────

test("backfillCanvasPairingState: forces mismatched canvas group to share one PAIRING IDENTITY but preserves per-tile presence (Task #176)", async () => {
  const clientId = await makeClient("backfill");
  const t0 = new Date("2026-05-01T00:00:00Z");
  // Three tiles at distinct positions — a real wall under Task #176.
  // Different pairing snapshots simulate the pre-Task-#173 world where
  // each Pi paired itself.
  const winner = await makeScreen({
    name: "bfWinner", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 0,
    pairingCode: "WIN001", deviceToken: "tok-winner",
    isPaired: true, isOnline: true,
    lastSeen: new Date("2026-05-20T10:00:00Z"),
    ipAddress: "10.0.0.10", hostname: "winner-pi", hardwareClass: "rpi5",
  });
  const stale = await makeScreen({
    name: "bfStale", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 1920,
    pairingCode: "STALE2", deviceToken: "tok-stale",
    isPaired: true, isOnline: false,
    lastSeen: new Date("2026-05-10T10:00:00Z"),
    ipAddress: "10.0.0.11", hostname: "stale-pi", hardwareClass: "rpi4",
  });
  const unpaired = await makeScreen({
    name: "bfUnpaired", clientId, createdAt: new Date(t0.getTime() + 2000),
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 3840,
    pairingCode: "FREE03", deviceToken: null,
    isPaired: false, isOnline: false,
  });

  const normalised = await storage.backfillCanvasPairingState();
  // We may have other ambient mismatched groups in dev — but ours
  // must be one of them, so the count is at least 1.
  assert.ok(normalised >= 1, `expected ≥1 normalised group, got ${normalised}`);

  const after = await storage.getCanvasMembers(winner);
  assert.equal(after.length, 3);
  // PAIRING IDENTITY is shared across the wall.
  for (const m of after) {
    assert.equal(m.pairingCode, "WIN001");
    assert.equal(m.deviceToken, "tok-winner");
    assert.equal(m.isPaired, true);
  }
  // PRESENCE fields are NOT shared — each tile keeps its own snapshot
  // (Task #176). Find the originally-stale tile and assert its
  // per-tile presence survived the backfill.
  const staleAfter = after.find((m) => m.id === stale.id)!;
  assert.equal(staleAfter.isOnline, false);
  assert.equal(staleAfter.ipAddress, "10.0.0.11");
  assert.equal(staleAfter.hostname, "stale-pi");
  assert.equal(staleAfter.hardwareClass, "rpi4");
  assert.equal(
    staleAfter.lastSeen?.toISOString(),
    new Date("2026-05-10T10:00:00Z").toISOString(),
  );
  const unpairedAfter = after.find((m) => m.id === unpaired.id)!;
  assert.equal(unpairedAfter.isOnline, false);
  assert.equal(unpairedAfter.ipAddress, null);
  assert.equal(unpairedAfter.lastSeen, null);

  // Idempotent: running again shouldn't touch this group.
  const before2 = await storage.getCanvasMembers(winner);
  await storage.backfillCanvasPairingState();
  const after2 = await storage.getCanvasMembers(winner);
  for (let i = 0; i < before2.length; i++) {
    assert.equal(after2[i].updatedAt?.getTime(), before2[i].updatedAt?.getTime());
  }
});

test("backfillCanvasPairingState: skips buckets that aren't a real wall (Task #176)", async () => {
  // Two screens sharing (clientId, w, h) but BOTH at (0, 0) — these
  // are independent authoring screens, not a wall. Backfill must not
  // converge their pairing state.
  const clientId = await makeClient("backfill-falseGroup");
  const t0 = new Date("2026-05-25T00:00:00Z");
  const a = await makeScreen({
    name: "bfFalseA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1280, canvasHeight: 720, canvasX: 0,
    pairingCode: "AAA111", deviceToken: "tok-A", isPaired: true,
  });
  const b = await makeScreen({
    name: "bfFalseB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1280, canvasHeight: 720, canvasX: 0,
    pairingCode: "BBB222", deviceToken: "tok-B", isPaired: false,
  });
  await storage.backfillCanvasPairingState();
  const aAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}bfFalseA`)))[0];
  const bAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}bfFalseB`)))[0];
  assert.equal(aAfter.pairingCode, "AAA111");
  assert.equal(aAfter.deviceToken, "tok-A");
  assert.equal(aAfter.isPaired, true);
  assert.equal(bAfter.pairingCode, "BBB222");
  assert.equal(bAfter.deviceToken, "tok-B");
  assert.equal(bAfter.isPaired, false);
  void a; void b;
});

test("backfillCanvasPairingState: leaves non-canvas screens untouched", async () => {
  const clientId = await makeClient("backfill-noop");
  const a = await makeScreen({
    name: "bfNoCanvasA", clientId, createdAt: new Date("2026-06-01"),
    canvasEnabled: false,
    pairingCode: "AAA111", deviceToken: "tok-a", isPaired: true,
  });
  const b = await makeScreen({
    name: "bfNoCanvasB", clientId, createdAt: new Date("2026-06-02"),
    canvasEnabled: false,
    pairingCode: "BBB222", deviceToken: "tok-b", isPaired: true,
  });
  await storage.backfillCanvasPairingState();
  const aAfter = await storage.getCanvasMembers(a);
  const bAfter = await storage.getCanvasMembers(b);
  assert.equal(aAfter.length, 1);
  assert.equal(aAfter[0].pairingCode, "AAA111");
  assert.equal(bAfter.length, 1);
  assert.equal(bAfter[0].pairingCode, "BBB222");
});

// ─── Task #176: position-distinctness rule ─────────────────────────

test("getCanvasMembers: same dims at the same (canvasX, canvasY) returns [self] only (Task #176)", async () => {
  const clientId = await makeClient("falsePair");
  const t0 = new Date("2026-07-01T00:00:00Z");
  // Two screens accidentally sharing dims AND both at the default
  // (0, 0). Pre-Task #176 they would be treated as a wall.
  const a = await makeScreen({
    name: "fpA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0, canvasY: 0,
  });
  const b = await makeScreen({
    name: "fpB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0, canvasY: 0,
  });
  const aMembers = await storage.getCanvasMembers(a);
  const bMembers = await storage.getCanvasMembers(b);
  assert.equal(aMembers.length, 1);
  assert.equal(aMembers[0].id, a.id);
  assert.equal(bMembers.length, 1);
  assert.equal(bMembers[0].id, b.id);
});

test("getCanvasMembers: two screens at the same position plus one at a distinct position still form a wall (Task #176)", async () => {
  const clientId = await makeClient("mixedWall");
  const t0 = new Date("2026-07-02T00:00:00Z");
  const a = await makeScreen({
    name: "mwA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
  });
  const b = await makeScreen({
    name: "mwB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
  });
  const c = await makeScreen({
    name: "mwC", clientId, createdAt: new Date(t0.getTime() + 2000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920,
  });
  // The bucket has 2 distinct positions ({0, 1920}) → real wall.
  // All three rows are members, including the duplicate at (0, 0).
  const members = await storage.getCanvasMembers(a);
  const ids = members.map((m) => m.id).sort();
  assert.deepEqual(ids, [a.id, b.id, c.id].sort());
});

test("setCanvasPairingState fan-out is gated by getCanvasMembers — heartbeat doesn't bleed across falsely-grouped tiles (Task #176)", async () => {
  // Simulates a heartbeat: routes look up members via getCanvasMembers
  // and call setCanvasPairingState over the returned ids. With the
  // tightened rule, two same-position tiles now resolve to solo
  // member sets, so the heartbeat from one only updates that one.
  const clientId = await makeClient("hbBleed");
  const t0 = new Date("2026-07-03T00:00:00Z");
  const a = await makeScreen({
    name: "hbA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "AAA111", deviceToken: "tok-A",
  });
  const b = await makeScreen({
    name: "hbB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "BBB222", deviceToken: "tok-B",
  });
  // Heartbeat for tile A — routes resolve members and fan out.
  const aMembers = await storage.getCanvasMembers(a);
  await storage.setCanvasPairingState(
    aMembers.map((m) => m.id),
    {
      isOnline: true,
      lastSeen: new Date("2026-07-03T12:00:00Z"),
      ipAddress: "10.0.0.50",
      hostname: "tile-a-pi",
    },
  );
  const aAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}hbA`)))[0];
  const bAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}hbB`)))[0];
  assert.equal(aAfter.isOnline, true);
  assert.equal(aAfter.ipAddress, "10.0.0.50");
  assert.equal(aAfter.hostname, "tile-a-pi");
  // B is untouched — no bleed.
  assert.equal(bAfter.isOnline, false);
  assert.equal(bAfter.ipAddress, null);
  assert.equal(bAfter.hostname, null);
  assert.equal(bAfter.pairingCode, "BBB222");
  assert.equal(bAfter.deviceToken, "tok-B");
});

test("repairFalseCanvasPairings: resets paired-by-inheritance tile and assigns fresh pairingCode (Task #176)", async () => {
  // Simulate the inheritance damage: two screens at (0, 0) that share
  // the same deviceToken because an earlier boot picked one as winner
  // and stamped the other.
  const clientId = await makeClient("repair");
  const t0 = new Date("2026-08-01T00:00:00Z");
  const a = await makeScreen({
    name: "repairA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "SHARED", deviceToken: "tok-shared",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.99", hostname: "wall-pi", hardwareClass: "rpi5",
  });
  const b = await makeScreen({
    name: "repairB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "SHARED", deviceToken: "tok-shared",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.99", hostname: "wall-pi", hardwareClass: "rpi5",
  });
  // A real wall on a different dim — must NOT be touched.
  const wallA = await makeScreen({
    name: "repairWallA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "WALL01", deviceToken: "tok-wall",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.10", hostname: "wallA-pi", hardwareClass: "rpi5",
  });
  const wallB = await makeScreen({
    name: "repairWallB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 1920,
    isPaired: true, pairingCode: "WALL01", deviceToken: "tok-wall",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.10", hostname: "wallA-pi", hardwareClass: "rpi5",
  });

  const repaired = await storage.repairFalseCanvasPairings();
  assert.ok(repaired >= 1, `expected ≥1 repaired row, got ${repaired}`);

  // The two false-pair tiles: exactly ONE should be reset (the second
  // sibling becomes the legitimate token owner), but in our fixture
  // both share the token with the *other* inheritance victim, so the
  // first reset is enough — the second sibling is then the lone owner
  // of `tok-shared`. We assert: at least one tile was reset, and no
  // two tiles still share `tok-shared`.
  const aAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairA`)))[0];
  const bAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairB`)))[0];
  const tokensStillShared =
    [aAfter, bAfter].filter((m) => m.deviceToken === "tok-shared").length;
  assert.ok(
    tokensStillShared <= 1,
    `expected ≤1 tile to keep tok-shared after repair, got ${tokensStillShared}`,
  );
  // The reset tile (whichever it is) has presence cleared and a new code.
  const resetTile = [aAfter, bAfter].find((m) => m.deviceToken === null);
  assert.ok(resetTile, "expected one tile to be reset");
  assert.equal(resetTile!.isPaired, false);
  assert.equal(resetTile!.isOnline, false);
  assert.equal(resetTile!.lastSeen, null);
  assert.equal(resetTile!.ipAddress, null);
  assert.equal(resetTile!.hostname, null);
  assert.equal(resetTile!.hardwareClass, null);
  assert.notEqual(resetTile!.pairingCode, "SHARED");
  assert.ok(resetTile!.pairingCode && resetTile!.pairingCode.length === 6);

  // The real wall is left alone — both members still share token,
  // pairingCode, isPaired, and presence.
  const wallAAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairWallA`)))[0];
  const wallBAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairWallB`)))[0];
  for (const m of [wallAAfter, wallBAfter]) {
    assert.equal(m.pairingCode, "WALL01");
    assert.equal(m.deviceToken, "tok-wall");
    assert.equal(m.isPaired, true);
    assert.equal(m.isOnline, true);
  }

  // Idempotent: a second pass repairs nothing more in our group.
  const before2 = (await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}repair%`))).map((m) => m.updatedAt?.getTime());
  await storage.repairFalseCanvasPairings();
  const after2 = (await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}repair%`))).map((m) => m.updatedAt?.getTime());
  assert.deepEqual(after2.sort(), before2.sort());

  void wallA; void wallB;
});

// ─── shared/canvas-groups: position-distinctness gate ──────────────

test("siblingsOnCanvas: same dims at same (canvasX, canvasY) → no siblings (Task #176)", () => {
  const a = {
    id: "a", clientId: "c1",
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
    canvasX: 0, canvasY: 0,
  } as unknown as Screen;
  const b = {
    id: "b", clientId: "c1",
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
    canvasX: 0, canvasY: 0,
  } as unknown as Screen;
  const groups = groupScreensByCanvas([a, b]);
  // Bucket exists but isn't a wall.
  const group = [...groups.values()][0];
  assert.equal(group.screens.length, 2);
  assert.equal(isCanvasWallGroup(group), false);
  // Sibling lookup returns [] for both.
  assert.deepEqual(siblingsOnCanvas(a, groups).map((s) => s.id), []);
  assert.deepEqual(siblingsOnCanvas(b, groups).map((s) => s.id), []);
});

test("siblingsOnCanvas: distinct positions → siblings returned (Task #176 pin)", () => {
  const a = {
    id: "a", clientId: "c1",
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
    canvasX: 0, canvasY: 0,
  } as unknown as Screen;
  const b = {
    id: "b", clientId: "c1",
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
    canvasX: 1920, canvasY: 0,
  } as unknown as Screen;
  const groups = groupScreensByCanvas([a, b]);
  const group = [...groups.values()][0];
  assert.equal(isCanvasWallGroup(group), true);
  assert.deepEqual(siblingsOnCanvas(a, groups).map((s) => s.id), ["b"]);
  assert.deepEqual(siblingsOnCanvas(b, groups).map((s) => s.id), ["a"]);
});

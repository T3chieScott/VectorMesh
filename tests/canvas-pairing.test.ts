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
  siblingsForCanvasParams,
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
  assert.ok(repaired >= 2, `expected ≥2 repaired rows, got ${repaired}`);

  // BOTH false-pair tiles must be reset (we don't know which one was
  // the "real" pair; both are equally suspect under the inheritance
  // bug, so the safe behavior is to force re-pairing on both).
  const aAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairA`)))[0];
  const bAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairB`)))[0];
  for (const resetTile of [aAfter, bAfter]) {
    assert.equal(resetTile.deviceToken, null, `${resetTile.name} deviceToken cleared`);
    assert.equal(resetTile.isPaired, false);
    assert.equal(resetTile.isOnline, false);
    assert.equal(resetTile.lastSeen, null);
    assert.equal(resetTile.ipAddress, null);
    assert.equal(resetTile.hostname, null);
    assert.equal(resetTile.hardwareClass, null);
    assert.notEqual(resetTile.pairingCode, "SHARED");
    // Exactly 6 chars — the screens.pairing_code column is varchar(6)
    // so a longer fallback would silently truncate or fail to insert.
    assert.equal(
      resetTile.pairingCode?.length,
      6,
      `${resetTile.name} got fresh 6-char pairingCode (was ${resetTile.pairingCode})`,
    );
  }
  // Each tile got its OWN unique pairing code — repair must not
  // hand out the same code to both reset tiles, otherwise re-pairing
  // would be ambiguous.
  assert.notEqual(
    aAfter.pairingCode,
    bAfter.pairingCode,
    "reset tiles got distinct pairing codes",
  );

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

test("repairFalseCanvasPairings: resets a paired solo screen even when its sibling has been deleted (Task #176)", async () => {
  // Regression for the "deleted-sibling" hole: under the old token-
  // duplication heuristic, a single paired screen whose former
  // false-sibling was deleted (so its deviceToken now appears in
  // exactly one row) would survive the repair, leaving it paired by
  // inheritance. The Task #176 spec mandates resetting EVERY paired
  // canvas-enabled screen that resolves to a solo group, regardless
  // of token duplication.
  const clientId = await makeClient("orphan");
  const t0 = new Date("2026-10-01T00:00:00Z");
  // Lone canvas-enabled paired screen with a unique deviceToken — no
  // other row holds the same token. The pre-#176 backfill could
  // still have stamped its `isPaired = true` if a now-deleted
  // sibling was the original pair winner.
  const orphan = await makeScreen({
    name: "orphanSolo", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "OLDORP",
    deviceToken: "tok-orphan-unique-no-other-row-holds-this",
    isOnline: true, lastSeen: new Date("2026-10-01T01:00:00Z"),
    ipAddress: "10.1.1.1", hostname: "orphan-pi", hardwareClass: "rpi5",
  });

  const repaired = await storage.repairFalseCanvasPairings();
  assert.ok(repaired >= 1, `expected ≥1 repaired, got ${repaired}`);

  const after = (await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}orphanSolo`)))[0];
  assert.equal(after.isPaired, false, "orphan must be unpaired");
  assert.equal(after.deviceToken, null, "orphan deviceToken cleared");
  assert.equal(after.isOnline, false, "orphan online state cleared");
  assert.equal(after.lastSeen, null);
  assert.equal(after.ipAddress, null);
  assert.equal(after.hostname, null);
  assert.equal(after.hardwareClass, null);
  assert.notEqual(after.pairingCode, "OLDORP", "fresh code minted");
  assert.equal(after.pairingCode?.length, 6, "fresh code is 6 chars");

  // Idempotent — second pass finds nothing more to repair on this row.
  const repaired2 = await storage.repairFalseCanvasPairings();
  // Other rows in the DB may exist from earlier tests, but our orphan
  // row must NOT be touched again — its updatedAt should be stable.
  const after2 = (await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}orphanSolo`)))[0];
  assert.equal(after2.updatedAt?.getTime(), after.updatedAt?.getTime());
  void repaired2;
  void orphan;
});

test("repairFalseCanvasPairings: every assigned pairingCode is exactly 6 chars and globally unique (Task #176)", async () => {
  // Stress the unique-code generator: stage many independent
  // false-pair groups so the repair loop has to mint many fresh
  // codes back-to-back. A length>6 result would silently violate
  // the varchar(6) column; a duplicate would re-introduce the
  // ambiguity the repair is meant to fix.
  const clientId = await makeClient("ucode");
  const t0 = new Date("2026-09-01T00:00:00Z");
  const groups = 6;
  for (let i = 0; i < groups; i++) {
    // Distinct dims per pair so each pair forms its OWN bucket
    // (same dim across pairs would collapse them into one big bucket
    // with multiple positions, which the repair correctly treats as
    // a real wall and skips).
    const w = 1280 + i;
    const h = 720 + i;
    const sharedToken = `tok-ucode-${i}`;
    const sharedCode = `UCD${(i + 100).toString(36).toUpperCase()}`.slice(0, 6);
    await makeScreen({
      name: `ucodeA${i}`, clientId, createdAt: t0,
      canvasEnabled: true, canvasWidth: w, canvasHeight: h, canvasX: 0,
      isPaired: true, pairingCode: sharedCode, deviceToken: sharedToken,
      isOnline: true, lastSeen: new Date("2026-09-01T01:00:00Z"),
    });
    await makeScreen({
      name: `ucodeB${i}`, clientId, createdAt: new Date(t0.getTime() + i * 1000 + 1),
      canvasEnabled: true, canvasWidth: w, canvasHeight: h, canvasX: 0,
      isPaired: true, pairingCode: sharedCode, deviceToken: sharedToken,
      isOnline: true, lastSeen: new Date("2026-09-01T01:00:00Z"),
    });
  }

  const repaired = await storage.repairFalseCanvasPairings();
  assert.ok(repaired >= groups * 2, `expected ≥${groups * 2} repaired, got ${repaired}`);

  const after = await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}ucode%`));
  assert.equal(after.length, groups * 2);

  const codes: string[] = [];
  for (const row of after) {
    assert.ok(row.pairingCode, `${row.name} should have a pairingCode after repair`);
    assert.equal(
      row.pairingCode!.length,
      6,
      `${row.name} pairingCode must be exactly 6 chars (got ${JSON.stringify(row.pairingCode)})`,
    );
    assert.equal(row.deviceToken, null);
    assert.equal(row.isPaired, false);
    codes.push(row.pairingCode!);
  }
  // Globally unique across the freshly-repaired set.
  assert.equal(
    new Set(codes).size,
    codes.length,
    `all ${codes.length} repaired codes must be unique; got ${JSON.stringify(codes)}`,
  );
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
  // Bucket is split into two single-member non-wall groups.
  assert.equal(groups.size, 2);
  for (const g of groups.values()) {
    assert.equal(g.screens.length, 1);
    assert.equal(g.isWall, false);
    assert.equal(isCanvasWallGroup(g), false);
  }
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

test("groupScreensByCanvas: same dims at same position → buckets are SPLIT into per-screen groups (Task #176)", () => {
  // Two screens with identical dims and both at (0, 0) — historically
  // bucketed under one dim key. After Task #176 the bucket must be
  // split into two single-member non-wall groups.
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
  // Two distinct entries, each a single-member non-wall group.
  assert.equal(groups.size, 2);
  for (const g of groups.values()) {
    assert.equal(g.screens.length, 1);
    assert.equal(g.isWall, false);
    assert.ok(
      g.keyString.includes("#"),
      `non-wall group key should be position-suffixed, got ${g.keyString}`,
    );
  }
  // Wall lookup at the dim-only key returns nothing — no consumer
  // iterating values can mistake these for wall siblings.
  assert.equal(groups.get("c1|1920x1080"), undefined);
});

test("groupScreensByCanvas: real wall stays under single dim key with isWall: true (Task #176)", () => {
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
  assert.equal(groups.size, 1);
  const wall = groups.get("c1|3840x1080");
  assert.ok(wall, "wall stays at dim-only key");
  assert.equal(wall!.isWall, true);
  assert.equal(wall!.screens.length, 2);
});

test("siblingsForCanvasParams: still returns ALL same-dim screens across split buckets (form-preview ghosts) (Task #176)", () => {
  // Form preview wants ghost rectangles for every dim-matching tile,
  // even when those tiles are currently at the same position. After
  // splitting, the dim-only Map lookup misses — the helper must walk
  // group values and filter.
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
  const matches = siblingsForCanvasParams(
    {
      excludeScreenId: "a",
      clientId: "c1",
      canvasWidth: 1920,
      canvasHeight: 1080,
    },
    groups,
  );
  assert.deepEqual(matches.map((s) => s.id), ["b"]);
});

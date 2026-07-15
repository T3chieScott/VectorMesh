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
import { eq, like } from "drizzle-orm";
import {
  storage,
  pickCanvasPairingWinner,
  CANVAS_PAIRING_REPAIR_176_MARKER_KEY,
} from "../server/storage";
import { db } from "../server/db";
import {
  canvasGroups,
  clients,
  screens,
  systemSettings,
  type Screen,
} from "../shared/schema";

const PREFIX = "__TEST_CVPAIR__";

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(canvasGroups).where(like(canvasGroups.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
  // Task #179: the one-shot marker is a single global row; clear it
  // after this file's tests run so other test files (and subsequent
  // boots) see the same starting state they expected before this file
  // ran. Avoids cross-file isolation surprises in parallel test mode.
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, CANVAS_PAIRING_REPAIR_176_MARKER_KEY));
}

// Task #189 — explicit canvas grouping. A canvas-enabled screen must
// belong to a `canvas_groups` row. Tests that want a real wall mint
// ONE group up front and pass its id to every member; tests that want
// independent same-dim screens omit `canvasGroupId` (or pass distinct
// ids) so each screen sits in its own group via the auto-mint below.
async function makeCanvasGroup(
  clientId: string | null,
  width: number,
  height: number,
  label: string,
): Promise<string> {
  const [g] = await db
    .insert(canvasGroups)
    .values({
      clientId,
      name: `${PREFIX}${label}`,
      canvasWidth: width,
      canvasHeight: height,
    })
    .returning();
  return g.id;
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
  // Task #189 — explicit canvas grouping. Pass an explicit
  // `canvasGroupId` to put this screen into a specific (possibly
  // shared) group. If omitted on a canvas-enabled screen, the helper
  // auto-mints a per-screen group so the row always has a valid FK.
  canvasGroupId?: string | null;
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
  let canvasGroupId: string | null = opts.canvasGroupId ?? null;
  if (
    opts.canvasEnabled &&
    !canvasGroupId &&
    typeof opts.canvasWidth === "number" &&
    typeof opts.canvasHeight === "number"
  ) {
    canvasGroupId = await makeCanvasGroup(
      opts.clientId,
      opts.canvasWidth,
      opts.canvasHeight,
      `auto-${opts.name}`,
    );
  }
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
      canvasGroupId,
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
  // Three tiles on client A's 3840x1080 canvas — explicitly grouped
  // under one canvas_group (Task #189).
  const wallGroup = await makeCanvasGroup(clientA, 3840, 1080, "memA-wall");
  const a1 = await makeScreen({
    name: "memA1", clientId: clientA, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: wallGroup,
  });
  const a2 = await makeScreen({
    name: "memA2", clientId: clientA, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: wallGroup,
  });
  const a3 = await makeScreen({
    name: "memA3", clientId: clientA, createdAt: new Date(t0.getTime() + 2000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 3840,
    canvasGroupId: wallGroup,
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
  // Task #189 — explicit shared group (null clientId is allowed for
  // canvas_groups too). Distinct positions just match real-wall
  // semantics; the FK is what makes them members.
  const nullWallGroup = await makeCanvasGroup(null, 1920, 1080, "null-wall");
  const n1 = await makeScreen({
    name: "nullA", clientId: null, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: nullWallGroup,
  });
  const n2 = await makeScreen({
    name: "nullB", clientId: null, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: nullWallGroup,
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
  // Distinct per-member pairing codes — Task #180 enforces UNIQUE
  // at the DB layer so two screens may NEVER share a pairingCode.
  // Task #189 — explicit shared group makes m1 + m2 a real wall.
  const setStateGroup = await makeCanvasGroup(clientId, 1920, 1080, "setState-wall");
  const m1 = await makeScreen({
    name: "setA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: setStateGroup,
    pairingCode: "S8AAA1", isPaired: false,
  });
  const m2 = await makeScreen({
    name: "setB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: setStateGroup,
    pairingCode: "S8BBB2", isPaired: false,
  });

  // Task #180: setCanvasPairingState NO LONGER accepts pairingCode.
  // The wall's identity is shared via deviceToken only; each tile
  // keeps its own unique pairingCode (rotated by
  // rotateScreenPairingIdentity when the wall dissolves).
  const updated = await storage.setCanvasPairingState([m1.id, m2.id], {
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
    // pairingCode stays per-tile (Task #180); only runtime fans out.
    assert.notEqual(m.pairingCode, null);
    assert.equal(m.deviceToken, "tok-shared");
    assert.equal(m.isPaired, true);
    assert.equal(m.isOnline, true);
    assert.equal(m.ipAddress, "10.0.0.5");
    assert.equal(m.hostname, "wall-pi");
    assert.equal(m.hardwareClass, "rpi5");
  }
  // Each tile's original code is preserved.
  const codes = after1.map((m) => m.pairingCode).sort();
  assert.deepEqual(codes, ["S8AAA1", "S8BBB2"]);

  // Empty id list / empty fields are no-ops, never throw.
  assert.equal(
    await storage.setCanvasPairingState([], { deviceToken: "X" }),
    0,
  );
  assert.equal(await storage.setCanvasPairingState([m1.id], {}), 0);
});

// ─── backfillCanvasPairingState (DB-backed) ────────────────────────

test("backfillCanvasPairingState: forces mismatched canvas group to share one PAIRING IDENTITY but preserves per-tile presence (Task #176)", async () => {
  const clientId = await makeClient("backfill");
  const t0 = new Date("2026-05-01T00:00:00Z");
  // Three tiles in one explicit canvas group — a real wall (Task #189).
  // Different pairing snapshots simulate the pre-Task-#173 world where
  // each Pi paired itself.
  const bfGroup = await makeCanvasGroup(clientId, 5760, 1080, "bf-wall");
  const winner = await makeScreen({
    name: "bfWinner", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: bfGroup,
    pairingCode: "W9WIN1", deviceToken: "tok-winner",
    isPaired: true, isOnline: true,
    lastSeen: new Date("2026-05-20T10:00:00Z"),
    ipAddress: "10.0.0.10", hostname: "winner-pi", hardwareClass: "rpi5",
  });
  const stale = await makeScreen({
    name: "bfStale", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: bfGroup,
    pairingCode: "W9STL2", deviceToken: "tok-stale",
    isPaired: true, isOnline: false,
    lastSeen: new Date("2026-05-10T10:00:00Z"),
    ipAddress: "10.0.0.11", hostname: "stale-pi", hardwareClass: "rpi4",
  });
  const unpaired = await makeScreen({
    name: "bfUnpaired", clientId, createdAt: new Date(t0.getTime() + 2000),
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 3840,
    canvasGroupId: bfGroup,
    pairingCode: "W9FRE3", deviceToken: null,
    isPaired: false, isOnline: false,
  });

  const normalised = await storage.backfillCanvasPairingState();
  // We may have other ambient mismatched groups in dev — but ours
  // must be one of them, so the count is at least 1.
  assert.ok(normalised >= 1, `expected ≥1 normalised group, got ${normalised}`);

  const after = await storage.getCanvasMembers(winner);
  assert.equal(after.length, 3);
  // Task #180: pairingCode is per-tile and is NEVER fanned out by
  // the backfill. The shared identity is `deviceToken` + `isPaired`.
  for (const m of after) {
    assert.equal(m.deviceToken, "tok-winner");
    assert.equal(m.isPaired, true);
  }
  const codes = after.map((m) => m.pairingCode).sort();
  assert.deepEqual(
    codes,
    ["W9FRE3", "W9STL2", "W9WIN1"],
    "each tile keeps its own per-tile pairingCode",
  );
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
    pairingCode: "T10AA1", deviceToken: "tok-A", isPaired: true,
  });
  const b = await makeScreen({
    name: "bfFalseB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1280, canvasHeight: 720, canvasX: 0,
    pairingCode: "T10BB2", deviceToken: "tok-B", isPaired: false,
  });
  await storage.backfillCanvasPairingState();
  const aAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}bfFalseA`)))[0];
  const bAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}bfFalseB`)))[0];
  assert.equal(aAfter.pairingCode, "T10AA1");
  assert.equal(aAfter.deviceToken, "tok-A");
  assert.equal(aAfter.isPaired, true);
  assert.equal(bAfter.pairingCode, "T10BB2");
  assert.equal(bAfter.deviceToken, "tok-B");
  assert.equal(bAfter.isPaired, false);
  void a; void b;
});

test("backfillCanvasPairingState: leaves non-canvas screens untouched", async () => {
  const clientId = await makeClient("backfill-noop");
  const a = await makeScreen({
    name: "bfNoCanvasA", clientId, createdAt: new Date("2026-06-01"),
    canvasEnabled: false,
    pairingCode: "T11AA1", deviceToken: "tok-a", isPaired: true,
  });
  const b = await makeScreen({
    name: "bfNoCanvasB", clientId, createdAt: new Date("2026-06-02"),
    canvasEnabled: false,
    pairingCode: "T11BB2", deviceToken: "tok-b", isPaired: true,
  });
  await storage.backfillCanvasPairingState();
  const aAfter = await storage.getCanvasMembers(a);
  const bAfter = await storage.getCanvasMembers(b);
  assert.equal(aAfter.length, 1);
  assert.equal(aAfter[0].pairingCode, "T11AA1");
  assert.equal(bAfter.length, 1);
  assert.equal(bAfter[0].pairingCode, "T11BB2");
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
  // Task #189 — explicit shared group: all three tiles belong to the
  // same canvas_group, so they're members regardless of position
  // overlap. (Position-distinctness is no longer the gate.)
  const mwGroup = await makeCanvasGroup(clientId, 3840, 1080, "mw-wall");
  const a = await makeScreen({
    name: "mwA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: mwGroup,
  });
  const b = await makeScreen({
    name: "mwB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: mwGroup,
  });
  const c = await makeScreen({
    name: "mwC", clientId, createdAt: new Date(t0.getTime() + 2000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: mwGroup,
  });
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
    isPaired: true, pairingCode: "T14AA1", deviceToken: "tok-A",
  });
  const b = await makeScreen({
    name: "hbB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "T14BB2", deviceToken: "tok-B",
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
  assert.equal(bAfter.pairingCode, "T14BB2");
  assert.equal(bAfter.deviceToken, "tok-B");
});

test("repairFalseCanvasPairings: resets paired-by-inheritance tile and assigns fresh pairingCode (Task #176)", async () => {
  // Simulate the inheritance damage: two paired canvas screens that
  // each sit in their OWN single-member group (Task #189 — independent
  // canvases that pre-#189 would have falsely fanned a single Pi
  // token across each other). The repair's trigger is "any paired
  // canvas screen in a lone-member group" — both rows here qualify.
  const clientId = await makeClient("repair");
  const t0 = new Date("2026-08-01T00:00:00Z");
  // Each "false-pair" tile gets its own group (auto-mint via
  // makeScreen). Shared deviceToken still simulates the inheritance.
  const a = await makeScreen({
    name: "repairA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "T15RA1", deviceToken: "tok-shared",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.99", hostname: "wall-pi", hardwareClass: "rpi5",
  });
  const b = await makeScreen({
    name: "repairB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0,
    isPaired: true, pairingCode: "T15RB2", deviceToken: "tok-shared",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.99", hostname: "wall-pi", hardwareClass: "rpi5",
  });
  // A real wall on a different dim — explicitly grouped so both
  // tiles are members. Must NOT be touched by the repair.
  const wallGroup = await makeCanvasGroup(clientId, 5760, 1080, "repair-real-wall");
  const wallA = await makeScreen({
    name: "repairWallA", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: wallGroup,
    isPaired: true, pairingCode: "T15WA1", deviceToken: "tok-wall",
    isOnline: true, lastSeen: new Date("2026-08-05T10:00:00Z"),
    ipAddress: "10.0.0.10", hostname: "wallA-pi", hardwareClass: "rpi5",
  });
  const wallB = await makeScreen({
    name: "repairWallB", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: wallGroup,
    isPaired: true, pairingCode: "T15WB2", deviceToken: "tok-wall",
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

  // The real wall is left alone — both members still share the
  // (Pi-side) deviceToken and pairing/online state. Per Task #180
  // pairingCode is per-tile and not shared, so we just verify it's
  // unchanged from the seeded values.
  const wallAAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairWallA`)))[0];
  const wallBAfter = (await db.select().from(screens).where(like(screens.name, `${PREFIX}repairWallB`)))[0];
  assert.equal(wallAAfter.pairingCode, "T15WA1");
  assert.equal(wallBAfter.pairingCode, "T15WB2");
  for (const m of [wallAAfter, wallBAfter]) {
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
    // Task #180: pairingCodes are globally UNIQUE — give each
    // member of each pair its own distinct code. The repair still
    // triggers on the position-distinctness gate (both at canvasX:0
    // → solo bucket of paired tiles); shared deviceToken still
    // simulates the inheritance damage.
    const tag = (i + 10).toString(36).toUpperCase();
    const codeA = `T17A${tag}`.slice(0, 6).padEnd(6, "X");
    const codeB = `T17B${tag}`.slice(0, 6).padEnd(6, "X");
    await makeScreen({
      name: `ucodeA${i}`, clientId, createdAt: t0,
      canvasEnabled: true, canvasWidth: w, canvasHeight: h, canvasX: 0,
      isPaired: true, pairingCode: codeA, deviceToken: sharedToken,
      isOnline: true, lastSeen: new Date("2026-09-01T01:00:00Z"),
    });
    await makeScreen({
      name: `ucodeB${i}`, clientId, createdAt: new Date(t0.getTime() + i * 1000 + 1),
      canvasEnabled: true, canvasWidth: w, canvasHeight: h, canvasX: 0,
      isPaired: true, pairingCode: codeB, deviceToken: sharedToken,
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

// Task #189 — pure-function coverage for `groupScreensByCanvas`,
// `siblingsOnCanvas`, `siblingsForCanvasParams`, `isCanvasWallGroup`
// has moved into `tests/canvas-groups.test.ts` (which exercises the
// new explicit-grouping contract directly). The DB-backed branches of
// those helpers are still covered above via storage round-trips.

// ─── Task #179 — one-shot wrapper around repairFalseCanvasPairings ─

test("repairFalseCanvasPairingsOnce: runs the repair on first call, sets the marker, and skips on subsequent calls (Task #179)", async () => {
  // Plant a paired solo canvas screen — exactly the kind of row the
  // repair would normally clobber. We assert that exactly ONE call
  // hits the row, and a second call leaves it (and its fresh state)
  // untouched.
  const clientId = await makeClient("oneShotRepair");
  const t0 = new Date("2026-09-15T00:00:00Z");
  const victim = await makeScreen({
    name: "oneShotVictim",
    clientId,
    createdAt: t0,
    canvasEnabled: true,
    canvasWidth: 1280,
    canvasHeight: 720,
    canvasX: 0,
    canvasY: 0,
    isPaired: true,
    pairingCode: "OSDIRT",
    deviceToken: "tok-os-dirty",
    isOnline: true,
    lastSeen: new Date("2026-09-14T23:00:00Z"),
    ipAddress: "10.0.1.50",
    hostname: "victim-pi",
  });
  // Clear any pre-existing marker so we start from a clean slate.
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, CANVAS_PAIRING_REPAIR_176_MARKER_KEY));

  // First call — repair runs.
  const first = await storage.repairFalseCanvasPairingsOnce();
  assert.equal(first.skipped, false, "first call must run the repair");
  assert.ok(first.repaired >= 1, "victim row must have been repaired");

  // Marker now exists.
  const marker = await storage.getSystemSetting(
    CANVAS_PAIRING_REPAIR_176_MARKER_KEY,
  );
  assert.ok(marker, "marker must be written after the first call");
  const parsed = JSON.parse(marker!.value);
  assert.equal(typeof parsed.ranAt, "string");
  assert.equal(typeof parsed.repaired, "number");

  // Capture victim's repaired state.
  const afterFirst = (await db
    .select()
    .from(screens)
    .where(eq(screens.id, victim.id)))[0];
  assert.equal(afterFirst.isPaired, false);
  assert.equal(afterFirst.deviceToken, null);
  assert.notEqual(afterFirst.pairingCode, "OSDIRT",
    "repaired row must carry a fresh pairingCode");

  // Now plant ANOTHER paired solo screen — the kind of row that
  // would have been wiped on every restart pre-#179. The second
  // `…Once` call must leave it alone.
  const survivor = await makeScreen({
    name: "oneShotSurvivor",
    clientId,
    createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true,
    canvasWidth: 1280,
    canvasHeight: 720,
    canvasX: 0,
    canvasY: 0,
    isPaired: true,
    pairingCode: "GOODOK",
    deviceToken: "tok-survivor",
    isOnline: true,
    lastSeen: new Date("2026-09-15T01:00:00Z"),
    ipAddress: "10.0.1.51",
    hostname: "survivor-pi",
  });

  const second = await storage.repairFalseCanvasPairingsOnce();
  assert.equal(second.skipped, true,
    "second call must short-circuit on the marker");
  assert.equal(second.repaired, 0,
    "second call must report zero repaired rows");

  // Survivor still paired.
  const survivorAfter = (await db
    .select()
    .from(screens)
    .where(eq(screens.id, survivor.id)))[0];
  assert.equal(survivorAfter.isPaired, true,
    "Task #179 protects legitimately-paired solo canvas screens from re-repair");
  assert.equal(survivorAfter.deviceToken, "tok-survivor");
  assert.equal(survivorAfter.pairingCode, "GOODOK");
  assert.equal(survivorAfter.isOnline, true);
  assert.equal(survivorAfter.ipAddress, "10.0.1.51");

  // The first row's repaired state is unchanged too.
  const afterSecond = (await db
    .select()
    .from(screens)
    .where(eq(screens.id, victim.id)))[0];
  assert.equal(afterSecond.pairingCode, afterFirst.pairingCode,
    "skipped second call must not regenerate the repaired row's pairing code");
  assert.equal(
    afterSecond.updatedAt?.getTime(),
    afterFirst.updatedAt?.getTime(),
    "skipped second call must not touch the repaired row's updatedAt",
  );
});

test("repairFalseCanvasPairingsOnce: re-runs after the marker is cleared (operational escape hatch) (Task #179)", async () => {
  // Operators can manually clear the marker via SQL when they need
  // the repair to run again. Pin that contract so future refactors
  // don't accidentally make the gate immutable.
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, CANVAS_PAIRING_REPAIR_176_MARKER_KEY));

  // Marker absent → first call runs.
  const a = await storage.repairFalseCanvasPairingsOnce();
  assert.equal(a.skipped, false);

  // Marker present → second call short-circuits.
  const b = await storage.repairFalseCanvasPairingsOnce();
  assert.equal(b.skipped, true);

  // Operator clears marker → next call runs again.
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, CANVAS_PAIRING_REPAIR_176_MARKER_KEY));
  const c = await storage.repairFalseCanvasPairingsOnce();
  assert.equal(c.skipped, false,
    "after clearing the marker the repair must run again");
});

// ─── Task #180 — pairing-code uniqueness & wall-membership reconciliation

test("schema: screens.pairing_code carries a UNIQUE constraint at the DB layer (Task #180)", async () => {
  // Pin the wire-level guarantee: even if every code-path bug above
  // sneaks back, the DB itself rejects a second screen with the same
  // pairingCode. This is the last line of defence against the
  // "different screen, same code, same Pi inheritance" class of bugs
  // that Task #180 is closing out.
  const clientId = await makeClient("uniq");
  const code = "U180A1";
  await makeScreen({
    name: "uniqA", clientId, pairingCode: code,
    canvasEnabled: false, canvasX: 0, canvasY: 0,
  });
  let threw: unknown = null;
  try {
    await makeScreen({
      name: "uniqB", clientId, pairingCode: code,
      canvasEnabled: false, canvasX: 0, canvasY: 0,
    });
  } catch (err) {
    threw = err;
  }
  assert.ok(
    threw,
    "second insert with duplicate pairing_code must violate UNIQUE",
  );
  // drizzle-orm ≥0.45 wraps the raw PG error under .cause; check the
  // full chain so the assertion survives future error-format changes.
  const err = threw as Error & { cause?: unknown };
  const causeMsg = err.cause instanceof Error ? err.cause.message : "";
  const msg = [String(err.message ?? threw), causeMsg].join(" ");
  assert.match(
    msg,
    /unique|duplicate/i,
    `error must mention uniqueness; got ${msg}`,
  );
});

test("generateUniquePairingCode: returns 6-char codes and avoids existing rows (Task #180)", async () => {
  // The centralized generator is the only sanctioned source of new
  // codes. It must (a) return exactly 6 chars to satisfy the
  // varchar(6) column, and (b) not hand out a code that already
  // belongs to another screen — otherwise the new UNIQUE constraint
  // would reject the subsequent insert.
  const clientId = await makeClient("genU");
  // Plant a known code so we can verify the generator avoids it.
  const planted = "PLANT1";
  await makeScreen({
    name: "genUExisting", clientId, pairingCode: planted,
    canvasEnabled: false, canvasX: 0, canvasY: 0,
  });
  const codes = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const code = await storage.generateUniquePairingCode();
    assert.equal(code.length, 6, `code #${i} must be 6 chars (got ${code})`);
    assert.notEqual(code, planted, `code #${i} must avoid planted code`);
    codes.add(code);
  }
  // The generator may return the same code across calls in theory
  // (it doesn't "reserve"), but the chance of collision in 25 draws
  // from a 36^6 space is vanishingly small. Catch a regression where
  // it's accidentally hardcoded to one value.
  assert.ok(codes.size >= 20, `expected high entropy, got ${codes.size}/25`);
});

test("createScreen: auto-mints a unique pairingCode when caller omits one (Task #180)", async () => {
  // The route handler stripped client-provided pairingCode in the
  // create path. The storage layer must therefore mint a fresh
  // unique code itself; otherwise we'd insert NULL and any later
  // pairing attempt would have nothing to match against.
  const clientId = await makeClient("autoMint");
  const a = await storage.createScreen({
    name: `${PREFIX}autoMintA`,
    clientId,
    canvasEnabled: false,
  } as InsertScreen);
  const b = await storage.createScreen({
    name: `${PREFIX}autoMintB`,
    clientId,
    canvasEnabled: false,
  } as InsertScreen);
  assert.equal(a.pairingCode?.length, 6, "A got 6-char code");
  assert.equal(b.pairingCode?.length, 6, "B got 6-char code");
  assert.notEqual(a.pairingCode, b.pairingCode,
    "auto-minted codes must differ across createScreen calls");
  assert.equal(a.isPaired, false, "auto-minted screen starts unpaired");
  assert.equal(a.deviceToken, null, "auto-minted screen has no deviceToken");
  assert.equal(b.isPaired, false);
  assert.equal(b.deviceToken, null);
});

test("rotateScreenPairingIdentity: rotates pairingCode + clears device/online state (Task #180)", async () => {
  // Rotation is the building block the reconciler uses when a screen
  // leaves a wall: the old code is potentially compromised (its Pi
  // could try to re-pair), so we mint a fresh code AND scrub all
  // device-side state to force a clean re-pair.
  const clientId = await makeClient("rotate");
  const s = await makeScreen({
    name: "rotateA", clientId, pairingCode: "ROT001",
    deviceToken: "tok-rot", isPaired: true, isOnline: true,
    lastSeen: new Date("2026-09-01T00:00:00Z"),
    ipAddress: "10.0.0.5", hostname: "rot-pi", hardwareClass: "rpi5",
    canvasEnabled: false, canvasX: 0, canvasY: 0,
  });
  await storage.rotateScreenPairingIdentity(s.id);
  const after = (await db.select().from(screens).where(eq(screens.id, s.id)))[0];
  assert.equal(after.pairingCode?.length, 6, "fresh 6-char code minted");
  assert.notEqual(after.pairingCode, "ROT001", "old code rotated away");
  assert.equal(after.deviceToken, null, "deviceToken scrubbed");
  assert.equal(after.isPaired, false, "marked unpaired");
  assert.equal(after.isOnline, false, "marked offline");
  assert.equal(after.lastSeen, null);
  assert.equal(after.ipAddress, null);
  assert.equal(after.hostname, null);
  assert.equal(after.hardwareClass, null);
});

test("reconcileWallPairingAfterChange: no-op when screen was never on a wall (Task #180)", async () => {
  // Solo screens (canvasEnabled=false or canvas group of size 1)
  // must NOT trigger any rotation — a normal PATCH on a kiosk
  // screen has nothing to do with pairing identity.
  const clientId = await makeClient("recNoop");
  const solo = await makeScreen({
    name: "recNoopSolo", clientId, pairingCode: "SOLO01",
    deviceToken: "tok-solo", isPaired: true, isOnline: true,
    canvasEnabled: false, canvasX: 0, canvasY: 0,
  });
  // beforeMembers is just [self] for solo screens.
  await storage.reconcileWallPairingAfterChange(solo.id, [solo]);
  const after = (await db.select().from(screens).where(eq(screens.id, solo.id)))[0];
  assert.equal(after.pairingCode, "SOLO01", "solo PATCH must not rotate code");
  assert.equal(after.deviceToken, "tok-solo", "solo PATCH must not scrub token");
  assert.equal(after.isPaired, true);
});

test("reconcileWallPairingAfterChange: dissolved 2-tile wall rotates BOTH survivors so they don't share a Pi token (Task #180)", async () => {
  // The killer scenario: two tiles paired as a wall (shared
  // deviceToken). One tile is patched off-canvas. After the change,
  // the wall no longer exists — but the leaver AND the surviving
  // sibling were both stamped with the same Pi token. If we only
  // rotate the leaver, the surviving sibling is left paired to the
  // wall's Pi — which from the Pi's perspective is now ambiguous.
  // The reconciler must rotate every surviving member that still
  // carries the wall's deviceToken.
  const clientId = await makeClient("dissolve");
  const sharedToken = "tok-dissolve-shared";
  // Task #189 — explicit shared group makes A + B a real wall.
  const dissolveGroup = await makeCanvasGroup(clientId, 3840, 1080, "dissolve-wall");
  const a = await makeScreen({
    name: "dissolveA", clientId, pairingCode: "DSV0AA",
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    lastSeen: new Date("2026-09-10T00:00:00Z"),
    ipAddress: "10.0.0.20", hostname: "dsv-pi", hardwareClass: "rpi5",
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
    canvasX: 0, canvasY: 0,
    canvasGroupId: dissolveGroup,
  });
  const b = await makeScreen({
    name: "dissolveB", clientId, pairingCode: "DSV0BB",
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    lastSeen: new Date("2026-09-10T00:00:00Z"),
    ipAddress: "10.0.0.20", hostname: "dsv-pi", hardwareClass: "rpi5",
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
    canvasX: 1920, canvasY: 0,
    canvasGroupId: dissolveGroup,
  });
  // Snapshot wall membership BEFORE the change (route layer does this).
  const beforeMembers = await storage.getCanvasMembers(a);
  assert.equal(beforeMembers.length, 2, "snapshot captured both wall members");

  // Simulate "A leaves the wall" — flip canvasEnabled off.
  await storage.updateScreen(a.id, {
    canvasEnabled: false,
    canvasWidth: null,
    canvasHeight: null,
    canvasX: 0,
    canvasY: 0,
  });
  await storage.reconcileWallPairingAfterChange(a.id, beforeMembers);

  const aAfter = (await db.select().from(screens).where(eq(screens.id, a.id)))[0];
  const bAfter = (await db.select().from(screens).where(eq(screens.id, b.id)))[0];
  // Leaver fully scrubbed.
  assert.equal(aAfter.deviceToken, null, "leaver token cleared");
  assert.equal(aAfter.isPaired, false, "leaver unpaired");
  assert.notEqual(aAfter.pairingCode, "DSV0AA", "leaver code rotated");
  // Survivor — wall dissolved, so it must also be scrubbed.
  assert.equal(bAfter.deviceToken, null,
    "survivor token cleared (shared Pi token would be ambiguous)");
  assert.equal(bAfter.isPaired, false, "survivor unpaired");
  assert.notEqual(bAfter.pairingCode, "DSV0BB", "survivor code rotated");
  assert.notEqual(aAfter.pairingCode, bAfter.pairingCode,
    "leaver and survivor get distinct fresh codes");
});

test("reconcileWallPairingAfterChange: 3-tile wall losing one tile keeps remaining 2-tile wall intact (Task #180)", async () => {
  // When the surviving members STILL form a wall after the leaver
  // departs, the wall lives on — only the leaver is scrubbed. The
  // surviving 2-tile wall keeps its shared deviceToken and codes.
  const clientId = await makeClient("trio");
  const sharedToken = "tok-trio";
  const sharedCode = "TRIOX1";
  // Task #189 — explicit shared group makes A + B + C a real wall.
  const trioGroup = await makeCanvasGroup(clientId, 5760, 1080, "trio-wall");
  const a = await makeScreen({
    name: "trioA", clientId, pairingCode: sharedCode,
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080,
    canvasX: 0, canvasY: 0,
    canvasGroupId: trioGroup,
  });
  const b = await makeScreen({
    name: "trioB", clientId, pairingCode: "TRIOB2",
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080,
    canvasX: 1920, canvasY: 0,
    canvasGroupId: trioGroup,
  });
  const c = await makeScreen({
    name: "trioC", clientId, pairingCode: "TRIOC3",
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080,
    canvasX: 3840, canvasY: 0,
    canvasGroupId: trioGroup,
  });
  const beforeMembers = await storage.getCanvasMembers(a);
  assert.equal(beforeMembers.length, 3, "wall snapshot captured all 3 tiles");

  // A leaves the wall.
  await storage.updateScreen(a.id, {
    canvasEnabled: false,
    canvasWidth: null,
    canvasHeight: null,
    canvasX: 0,
    canvasY: 0,
  });
  await storage.reconcileWallPairingAfterChange(a.id, beforeMembers);

  const aAfter = (await db.select().from(screens).where(eq(screens.id, a.id)))[0];
  const bAfter = (await db.select().from(screens).where(eq(screens.id, b.id)))[0];
  const cAfter = (await db.select().from(screens).where(eq(screens.id, c.id)))[0];
  // Leaver scrubbed.
  assert.equal(aAfter.deviceToken, null);
  assert.equal(aAfter.isPaired, false);
  assert.notEqual(aAfter.pairingCode, sharedCode);
  // Surviving 2-tile wall is intact — codes & token unchanged.
  assert.equal(bAfter.deviceToken, sharedToken,
    "B still on wall, retains shared Pi token");
  assert.equal(bAfter.pairingCode, "TRIOB2");
  assert.equal(bAfter.isPaired, true);
  assert.equal(cAfter.deviceToken, sharedToken);
  assert.equal(cAfter.pairingCode, "TRIOC3");
  assert.equal(cAfter.isPaired, true);
  void c;
});

test("reconcileWallPairingAfterChange: handles deleted-screen path via changedScreenDeleted flag (Task #180)", async () => {
  // DELETE handler captures beforeMembers, deletes the row, then
  // calls the reconciler with changedScreenDeleted=true. The
  // reconciler must NOT try to rotate the deleted row (it's gone)
  // but MUST still fan rotations across the survivors when the
  // wall dissolves to a single tile.
  const clientId = await makeClient("delWall");
  const sharedToken = "tok-del-wall";
  // Task #189 — explicit shared group makes A + B a real wall.
  const delWallGroup = await makeCanvasGroup(clientId, 3840, 1080, "delWall-wall");
  const a = await makeScreen({
    name: "delWallA", clientId, pairingCode: "DELWAA",
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
    canvasX: 0, canvasY: 0,
    canvasGroupId: delWallGroup,
  });
  const b = await makeScreen({
    name: "delWallB", clientId, pairingCode: "DELWBB",
    deviceToken: sharedToken, isPaired: true, isOnline: true,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080,
    canvasX: 1920, canvasY: 0,
    canvasGroupId: delWallGroup,
  });
  const beforeMembers = await storage.getCanvasMembers(a);
  // Delete A first (real DELETE flow), then call reconciler.
  await storage.deleteScreen(a.id);
  await storage.reconcileWallPairingAfterChange(a.id, beforeMembers, {
    changedScreenDeleted: true,
  });
  // A is gone — verify.
  const aAfter = await db.select().from(screens).where(eq(screens.id, a.id));
  assert.equal(aAfter.length, 0, "deleted screen stays deleted");
  // B (survivor) was the wall's other tile holding the shared Pi
  // token. With the wall dissolved into a single tile, B must be
  // scrubbed so its lone Pi token doesn't outlive the wall ambiguously.
  const bAfter = (await db.select().from(screens).where(eq(screens.id, b.id)))[0];
  assert.equal(bAfter.deviceToken, null,
    "lone survivor's shared Pi token is cleared");
  assert.equal(bAfter.isPaired, false);
  assert.notEqual(bAfter.pairingCode, "DELWBB",
    "lone survivor's pairingCode rotated");
});

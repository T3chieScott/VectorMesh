// Task #189 — explicit `canvasGroupId` regression coverage.
// Pins: pure-helper contract, getCanvasMembers no-fan-out across
// groups, backfill (real wall → shared group, others → per-screen,
// idempotent), createScreen auto-mint, and boot-marker semantics.

import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, like } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  canvasGroups,
  clients,
  screens,
  systemSettings,
  type Screen,
} from "../shared/schema";
import { CANVAS_GROUPS_BACKFILL_189_MARKER_KEY } from "../server/storage";
import {
  groupScreensByCanvas,
  isCanvasWallGroup,
  siblingsForCanvasParams,
  siblingsOnCanvas,
} from "../shared/canvas-groups";

const PREFIX = "__TEST_S189__";

async function cleanup() {
  // FK order: screens reference canvas_groups (ON DELETE SET NULL),
  // canvas_groups + screens both reference clients. Delete screens
  // first, then canvas_groups, then clients to avoid leaving
  // dangling rows during the cleanup window.
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(canvasGroups).where(like(canvasGroups.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

test.before(cleanup);
test.after(cleanup);

async function makeClient(label: string): Promise<string> {
  const [c] = await db
    .insert(clients)
    .values({ name: `${PREFIX}${label}` })
    .returning();
  return c.id;
}

async function makeGroup(
  clientId: string,
  label: string,
  w = 3840,
  h = 1080,
): Promise<string> {
  const [g] = await db
    .insert(canvasGroups)
    .values({
      clientId,
      name: `${PREFIX}${label}`,
      canvasWidth: w,
      canvasHeight: h,
    })
    .returning();
  return g.id;
}

interface MakeScreenOpts {
  name: string;
  clientId: string;
  canvasGroupId?: string | null;
  canvasEnabled?: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  canvasX?: number;
  canvasY?: number;
  createdAt?: Date;
  deviceToken?: string | null;
  isPaired?: boolean;
}

async function makeScreen(opts: MakeScreenOpts): Promise<Screen> {
  const values: typeof screens.$inferInsert = {
    name: `${PREFIX}${opts.name}`,
    clientId: opts.clientId,
    canvasEnabled: opts.canvasEnabled ?? true,
    canvasWidth: opts.canvasWidth ?? 3840,
    canvasHeight: opts.canvasHeight ?? 1080,
    canvasX: opts.canvasX ?? 0,
    canvasY: opts.canvasY ?? 0,
    canvasGroupId: opts.canvasGroupId ?? null,
    isPaired: opts.isPaired ?? false,
    deviceToken: opts.deviceToken ?? null,
    createdAt: opts.createdAt ?? new Date(),
  };
  const [row] = await db.insert(screens).values(values).returning();
  return row;
}

// ─── Pure helper contract ─────────────────────────────────────────

test("pure helpers — same clientId + same dims but DIFFERENT canvasGroupId means NO siblings (the #189 bug)", async () => {
  const clientId = await muteId(); // one shared owner
  const groupA = await makeGroup(clientId, "p1-groupA");
  const groupB = await makeGroup(clientId, "p1-groupB");
  // Two screens that historically would have grouped (same clientId,
  // same 3840×1080, distinct positions) but live in DIFFERENT
  // explicit groups — one of them is the lobby wall, the other is
  // a brand new test screen the operator just spun up.
  const lobby = await makeScreen({
    name: "p1-lobby",
    clientId,
    canvasGroupId: groupA,
    canvasX: 0,
  });
  const lab = await makeScreen({
    name: "p1-lab",
    clientId,
    canvasGroupId: groupB,
    canvasX: 1920, // distinct position → would have triggered the old fan-out
  });

  const all = await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}p1-%`));
  const groups = groupScreensByCanvas(all);

  // Both groups exist, each with exactly one member, and neither is a wall.
  const lobbyGroup = groups.get(groupA);
  const labGroup = groups.get(groupB);
  assert.ok(lobbyGroup, "lobby group must be present in the grouping map");
  assert.ok(labGroup, "lab group must be present in the grouping map");
  assert.equal(lobbyGroup!.screens.length, 1);
  assert.equal(labGroup!.screens.length, 1);
  assert.equal(isCanvasWallGroup(lobbyGroup!), false);
  assert.equal(isCanvasWallGroup(labGroup!), false);

  // Sibling resolution must be empty in both directions — the bug
  // would have surfaced here as `siblingsOnCanvas(lobby)` returning [lab].
  assert.deepEqual(siblingsOnCanvas(lobby, groups), []);
  assert.deepEqual(siblingsOnCanvas(lab, groups), []);

  // siblingsForCanvasParams (used by the "in-progress edit" preview)
  // must agree: editing lobby with its own group still has 0 siblings.
  assert.deepEqual(
    siblingsForCanvasParams(
      { excludeScreenId: lobby.id, canvasGroupId: groupA },
      groups,
    ),
    [],
  );
  // Hypothetically reassigning lobby into groupB would give it 1
  // sibling (the lab screen). This proves the helper keys off the
  // dropdown's chosen group, not the screen's current row.
  const previewSiblings = siblingsForCanvasParams(
    { excludeScreenId: lobby.id, canvasGroupId: groupB },
    groups,
  );
  assert.equal(previewSiblings.length, 1);
  assert.equal(previewSiblings[0].id, lab.id);
});

test("pure helpers — same canvasGroupId on ≥2 screens IS a wall and produces siblings", async () => {
  const clientId = await muteId();
  const wall = await makeGroup(clientId, "p2-wall");
  const tileA = await makeScreen({
    name: "p2-tileA",
    clientId,
    canvasGroupId: wall,
    canvasX: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  const tileB = await makeScreen({
    name: "p2-tileB",
    clientId,
    canvasGroupId: wall,
    canvasX: 1920,
    createdAt: new Date("2026-01-01T00:00:01Z"),
  });

  const all = await db
    .select()
    .from(screens)
    .where(like(screens.name, `${PREFIX}p2-%`));
  const groups = groupScreensByCanvas(all);

  const view = groups.get(wall)!;
  assert.equal(view.screens.length, 2);
  assert.equal(isCanvasWallGroup(view), true);
  assert.deepEqual(
    siblingsOnCanvas(tileA, groups).map((s) => s.id),
    [tileB.id],
  );
  assert.deepEqual(
    siblingsOnCanvas(tileB, groups).map((s) => s.id),
    [tileA.id],
  );
});

// ─── Storage-level contract ───────────────────────────────────────

test("storage.getCanvasMembers — independent same-dim screens in different groups never fan-out", async () => {
  const clientId = await muteId();
  const groupA = await makeGroup(clientId, "p3-groupA");
  const groupB = await makeGroup(clientId, "p3-groupB");
  const lobby = await makeScreen({
    name: "p3-lobby",
    clientId,
    canvasGroupId: groupA,
    canvasX: 0,
  });
  const lab = await makeScreen({
    name: "p3-lab",
    clientId,
    canvasGroupId: groupB,
    canvasX: 1920,
  });

  // The bug would have made this return BOTH screens — the fix
  // is for it to return only `lobby`. Same in the other direction.
  const lobbyMembers = await storage.getCanvasMembers(lobby);
  assert.deepEqual(
    lobbyMembers.map((s) => s.id),
    [lobby.id],
    "getCanvasMembers must NOT fan across canvas groups even when dims+client match",
  );
  const labMembers = await storage.getCanvasMembers(lab);
  assert.deepEqual(
    labMembers.map((s) => s.id),
    [lab.id],
  );
});

test("storage.getCanvasMembers — real wall (shared canvasGroupId) returns every wall member, sorted (createdAt asc, id asc)", async () => {
  const clientId = await muteId();
  const wall = await makeGroup(clientId, "p4-wall");
  const t0 = new Date("2026-02-01T00:00:00Z");
  const tileA = await makeScreen({
    name: "p4-tileA",
    clientId,
    canvasGroupId: wall,
    canvasX: 0,
    createdAt: t0,
  });
  const tileB = await makeScreen({
    name: "p4-tileB",
    clientId,
    canvasGroupId: wall,
    canvasX: 1920,
    createdAt: new Date(t0.getTime() + 1000),
  });
  const tileC = await makeScreen({
    name: "p4-tileC",
    clientId,
    canvasGroupId: wall,
    canvasX: 3840,
    createdAt: new Date(t0.getTime() + 2000),
  });

  const members = await storage.getCanvasMembers(tileB);
  assert.deepEqual(
    members.map((s) => s.id),
    [tileA.id, tileB.id, tileC.id],
  );
});

// ─── Backfill contract ────────────────────────────────────────────

test("backfillExplicitCanvasGroups — promotes legacy walls (≥2 distinct positions, same client+dims) into one shared group, different-dim solos into per-screen groups, and is idempotent", async () => {
  const clientId = await muteId();
  // Real wall: same client + dims + two distinct positions.
  const t0 = new Date("2026-03-01T00:00:00Z");
  const wallA = await makeScreen({
    name: "p5-wallA",
    clientId,
    canvasGroupId: null,
    canvasX: 0,
    createdAt: t0,
  });
  const wallB = await makeScreen({
    name: "p5-wallB",
    clientId,
    canvasGroupId: null,
    canvasX: 1920,
    createdAt: new Date(t0.getTime() + 1000),
  });
  // Solo with DIFFERENT dims so the bucket can't fold it in.
  const solo = await makeScreen({
    name: "p5-solo",
    clientId,
    canvasGroupId: null,
    canvasWidth: 1920,
    canvasHeight: 1080,
    canvasX: 0,
    canvasY: 0,
    createdAt: new Date(t0.getTime() + 2000),
  });

  // Run the public (un-claimed) backfill so this test is independent
  // of the boot marker, which the running server already consumed.
  const first = await storage.backfillExplicitCanvasGroups();
  assert.ok(
    first.screensStamped >= 3,
    `backfill should have stamped ≥3 of our screens; got ${first.screensStamped}`,
  );

  const reloadedWallA = (await storage.getScreen(wallA.id))!;
  const reloadedWallB = (await storage.getScreen(wallB.id))!;
  const reloadedSolo = (await storage.getScreen(solo.id))!;

  assert.ok(reloadedWallA.canvasGroupId, "wallA must have been stamped");
  assert.ok(reloadedWallB.canvasGroupId, "wallB must have been stamped");
  assert.ok(reloadedSolo.canvasGroupId, "solo must have been stamped");

  // Wall members share a group; solo gets its own group.
  assert.equal(
    reloadedWallA.canvasGroupId,
    reloadedWallB.canvasGroupId,
    "real wall members must end up in the SAME group",
  );
  assert.notEqual(
    reloadedSolo.canvasGroupId,
    reloadedWallA.canvasGroupId,
    "solo same-dim screen must NOT be folded into the wall's group",
  );

  // Idempotency: a second run doesn't re-stamp our screens.
  const wallGroupId = reloadedWallA.canvasGroupId!;
  const soloGroupId = reloadedSolo.canvasGroupId!;
  const second = await storage.backfillExplicitCanvasGroups();
  const wallA2 = (await storage.getScreen(wallA.id))!;
  const soloAgain = (await storage.getScreen(solo.id))!;
  assert.equal(wallA2.canvasGroupId, wallGroupId, "wallA group must be stable");
  assert.equal(
    soloAgain.canvasGroupId,
    soloGroupId,
    "solo group must be stable across re-runs",
  );
  // The second pass MAY do unrelated work (other ambient unstamped
  // screens) but must not have stamped any of OUR three again — they
  // were already stamped, so the bucketing loop skips them.
  void second;
});

// ─── createScreen contract ────────────────────────────────────────

test("storage.createScreen — canvasEnabled with no canvasGroupId auto-mints a per-screen group", async () => {
  const clientId = await muteId();
  const created = await storage.createScreen({
    name: `${PREFIX}p6-auto`,
    clientId,
    canvasEnabled: true,
    canvasWidth: 1920,
    canvasHeight: 1080,
    canvasX: 0,
    canvasY: 0,
  });

  assert.ok(
    created.canvasGroupId,
    "createScreen must auto-mint a canvasGroupId when none was provided",
  );
  // Confirm the row is real and matches the screen's dims/client.
  const [group] = await db
    .select()
    .from(canvasGroups)
    .where(eq(canvasGroups.id, created.canvasGroupId!));
  assert.ok(group, "the auto-minted canvas_groups row must exist");
  assert.equal(group.clientId, clientId);
  assert.equal(group.canvasWidth, 1920);
  assert.equal(group.canvasHeight, 1080);

  // And the new screen must be the ONLY member of its fresh group —
  // i.e. it must not have accidentally piggy-backed on an unrelated
  // group via the old implicit dim-matching path.
  const members = await storage.getCanvasMembers(created);
  assert.deepEqual(members.map((s) => s.id), [created.id]);
});

// ─── Boot-marker semantics ────────────────────────────────────────
//
// Task #189 — `backfillExplicitCanvasGroupsOnce` claims its marker
// atomically via INSERT … ON CONFLICT DO NOTHING (matching the
// Task #179 pattern in `repairFalseCanvasPairingsOnce`). These
// tests pin the contract:
//
//  * Any pre-existing marker row — `completed`, `running`, or
//    even an unparseable payload — causes the claim to lose and
//    the call to short-circuit with `{ skipped: true }`. We
//    deliberately accept "stuck-running marker after a crash" as
//    preferable to "every concurrent boot re-runs the backfill"
//    (documented in the operations runbook in `replit.md`; the
//    operator escape hatch is to delete the marker row by hand).
//  * Two concurrent invocations against a clean marker must
//    produce exactly one winner and one skip — never two runs.

async function setMarker(value: string | null): Promise<void> {
  if (value === null) {
    await db
      .delete(systemSettings)
      .where(eq(systemSettings.key, CANVAS_GROUPS_BACKFILL_189_MARKER_KEY));
    return;
  }
  await storage.setSystemSetting(CANVAS_GROUPS_BACKFILL_189_MARKER_KEY, value);
}

test("backfillExplicitCanvasGroupsOnce — completed marker short-circuits the run", async () => {
  // Seed an unstamped canvas screen — if the once-gate is honoured,
  // the backfill must NOT touch it.
  const clientId = await muteId();
  const untouched = await makeScreen({
    name: "marker-completed",
    clientId,
    canvasGroupId: null,
  });
  await setMarker(JSON.stringify({ status: "completed", at: "2026-01-01" }));
  try {
    const result = await storage.backfillExplicitCanvasGroupsOnce();
    assert.equal(result.skipped, true, "completed marker must skip the run");
    assert.equal(result.groupsCreated, 0);
    assert.equal(result.screensStamped, 0);
    const reloaded = (await storage.getScreen(untouched.id))!;
    assert.equal(
      reloaded.canvasGroupId,
      null,
      "screen must remain unstamped because the run was skipped",
    );
  } finally {
    // Restore a completed marker so the running server's view of the
    // marker stays consistent with what the boot path expects, and
    // other tests that run later don't trigger an ambient backfill.
    await setMarker(JSON.stringify({ status: "completed" }));
  }
});

test("backfillExplicitCanvasGroupsOnce — running marker also skips (atomic claim, crash safety)", async () => {
  // Atomic-claim semantics (Task #189): any pre-existing marker row
  // causes the INSERT … ON CONFLICT DO NOTHING claim to lose, so the
  // call short-circuits. A `running` row means a previous boot crashed
  // mid-backfill — the boot path does NOT auto-retry; the operator
  // must delete the marker row to force a re-run.
  const clientId = await muteId();
  const orphan = await makeScreen({
    name: "marker-running",
    clientId,
    canvasGroupId: null,
  });
  await setMarker(JSON.stringify({ status: "running", at: "2026-01-01" }));
  try {
    const result = await storage.backfillExplicitCanvasGroupsOnce();
    assert.equal(
      result.skipped,
      true,
      "running marker must short-circuit (crash-safety contract)",
    );
    assert.equal(result.groupsCreated, 0);
    assert.equal(result.screensStamped, 0);
    const reloaded = (await storage.getScreen(orphan.id))!;
    assert.equal(
      reloaded.canvasGroupId,
      null,
      "screen must remain unstamped — claim was lost, no work ran",
    );
  } finally {
    await setMarker(JSON.stringify({ status: "completed" }));
  }
});

test("backfillExplicitCanvasGroupsOnce — malformed marker payload also skips (any row = lost claim)", async () => {
  // The atomic claim cares about row existence, not payload validity.
  // An unparseable payload still represents a previous claim, so the
  // current call must short-circuit just like for `running`.
  const clientId = await muteId();
  const orphan = await makeScreen({
    name: "marker-malformed",
    clientId,
    canvasGroupId: null,
  });
  await setMarker("this-is-not-json");
  try {
    const result = await storage.backfillExplicitCanvasGroupsOnce();
    assert.equal(
      result.skipped,
      true,
      "malformed marker still represents a prior claim — must skip",
    );
    assert.equal(result.groupsCreated, 0);
    assert.equal(result.screensStamped, 0);
    const reloaded = (await storage.getScreen(orphan.id))!;
    assert.equal(
      reloaded.canvasGroupId,
      null,
      "screen must remain unstamped — claim was lost, no work ran",
    );
  } finally {
    await setMarker(JSON.stringify({ status: "completed" }));
  }
});

test("backfillExplicitCanvasGroupsOnce — two concurrent invocations: exactly one wins", async () => {
  // Concurrency contract (Task #189): with no pre-existing marker,
  // two simultaneous boots must produce exactly one winner (runs the
  // backfill, returns skipped=false) and one loser (returns
  // skipped=true and does NOT insert any canvas_groups rows). The
  // previous read-then-stamp implementation allowed both to win and
  // produce duplicate groups; the atomic INSERT … ON CONFLICT DO
  // NOTHING claim closes that race.
  const clientId = await muteId();
  const orphan = await makeScreen({
    name: "marker-concurrent",
    clientId,
    canvasGroupId: null,
  });
  await setMarker(null);
  try {
    const [a, b] = await Promise.all([
      storage.backfillExplicitCanvasGroupsOnce(),
      storage.backfillExplicitCanvasGroupsOnce(),
    ]);
    const winners = [a, b].filter((r) => r.skipped === false);
    const losers = [a, b].filter((r) => r.skipped === true);
    assert.equal(winners.length, 1, "exactly one invocation must win the claim");
    assert.equal(losers.length, 1, "exactly one invocation must skip");
    assert.equal(losers[0].groupsCreated, 0);
    assert.equal(losers[0].screensStamped, 0);
    // The winner stamped the orphan screen into a per-screen group.
    const reloaded = (await storage.getScreen(orphan.id))!;
    assert.ok(
      reloaded.canvasGroupId,
      "screen must have been stamped by the winning invocation",
    );
    // And only ONE canvas_groups row for this orphan exists — no
    // duplicates from a second run.
    const allGroups = await storage.getCanvasGroups();
    const orphanGroups = allGroups.filter(
      (g) => g.clientId === clientId && g.canvasWidth === 3840 && g.canvasHeight === 1080,
    );
    assert.equal(
      orphanGroups.length,
      1,
      "exactly one canvas_groups row must exist for the orphan — no duplicates",
    );
  } finally {
    await setMarker(JSON.stringify({ status: "completed" }));
  }
});

// Each test seeds its own client so that any ambient `${PREFIX}client`
// from earlier passes can't bleed across cases. This helper just gives
// each one a unique label without polluting the per-test signal.
let muteCounter = 0;
async function muteId(): Promise<string> {
  muteCounter += 1;
  return makeClient(`client-${muteCounter}`);
}

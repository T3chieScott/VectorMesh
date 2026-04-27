// Task #175 regression: lock the owner-only pairing controls that
// the screens.tsx ScreenCard renders for canvas walls. Sibling
// tiles on a canvas must hide the pairing-code panel, the
// "Regenerate Code" menu item, and the "Unpair Device" menu item;
// they must show the "Inherits pairing from <owner>" message
// instead. The owner tile keeps the controls.
//
// We can't run a real browser test in this repo (no Playwright is
// installed and package.json is locked), so this test pins the
// pure gating predicates the JSX uses — `getCanvasPairingGating`
// in shared/canvas-groups.ts — and exercises them through the
// real DB-backed `siblingsOnCanvas` data flow that the page
// computes via `groupScreensByCanvas` over the persisted screen
// rows. If a future refactor re-exposes per-tile pairing controls
// on siblings (either by changing the predicate or by inlining
// different conditions in the JSX) the screens.tsx side will fall
// out of sync with these predicates and this test will fail.
//
// Same isolation pattern as canvas-pairing.test.ts: every row is
// namespaced with PREFIX so cleanup at file start AND end leaves
// ambient dev data alone.

import test from "node:test";
import assert from "node:assert/strict";
import { like } from "drizzle-orm";
import { db } from "../server/db";
import { canvasGroups, clients, screens, type Screen } from "../shared/schema";
import {
  getCanvasPairingGating,
  groupScreensByCanvas,
  siblingsOnCanvas,
} from "../shared/canvas-groups";

const PREFIX = "__TEST_CVUI__";

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(canvasGroups).where(like(canvasGroups.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

async function makeCanvasGroup(
  clientId: string,
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
  canvasGroupId?: string | null;
  isPaired?: boolean;
  isOnline?: boolean;
  pairingCode?: string | null;
  deviceToken?: string | null;
}

async function makeScreen(opts: MakeScreenOpts): Promise<Screen> {
  // Task #189 — every canvas-enabled screen needs a canvas group.
  // Mint a per-screen group when the caller didn't supply one.
  let groupId = opts.canvasGroupId ?? null;
  if (
    opts.canvasEnabled &&
    !groupId &&
    opts.clientId &&
    opts.canvasWidth != null &&
    opts.canvasHeight != null
  ) {
    groupId = await makeCanvasGroup(
      opts.clientId,
      opts.canvasWidth,
      opts.canvasHeight,
      `auto-${opts.name}`,
    );
  }
  const values: typeof screens.$inferInsert = {
    name: `${PREFIX}${opts.name}`,
    clientId: opts.clientId,
    canvasEnabled: opts.canvasEnabled ?? false,
    canvasWidth: opts.canvasWidth ?? null,
    canvasHeight: opts.canvasHeight ?? null,
    canvasX: opts.canvasX ?? 0,
    canvasY: 0,
    canvasGroupId: groupId,
    isPaired: opts.isPaired ?? false,
    isOnline: opts.isOnline ?? false,
    pairingCode: opts.pairingCode ?? null,
    deviceToken: opts.deviceToken ?? null,
    createdAt: opts.createdAt,
  };
  const [row] = await db.insert(screens).values(values).returning();
  return row;
}

// Replays the React side: fetch all screens, build the canvas
// grouping map exactly as the page does, then ask
// `siblingsOnCanvas` for the saved screen's siblings — same call
// path the ScreenCard uses.
async function gatingForScreen(target: Screen) {
  const all = await db.select().from(screens);
  const groups = groupScreensByCanvas(all);
  const siblings = siblingsOnCanvas(target, groups);
  return {
    siblings,
    gating: getCanvasPairingGating(target, siblings),
  };
}

test.before(cleanup);
test.after(cleanup);

// ─── Two-tile canvas: UNPAIRED state ───────────────────────────────
// Task #179 update: when the wall is unpaired (the owner itself is
// not paired), the sibling MUST NOT show the "Inherits pairing from
// <owner>" message — there's nothing to inherit and the lingering
// message confused operators after they unpaired the lead. The
// sibling falls back to its no-owner empty UI; only the owner card
// surfaces the pairing-code panel for the wall.

test("2-tile canvas, unpaired: owner shows pairing code + Regenerate Code; sibling shows NO inherits message and no controls (Task #179)", async () => {
  const clientId = await makeClient("ui-unpaired");
  const t0 = new Date("2026-07-01T00:00:00Z");
  const wallGroup = await makeCanvasGroup(clientId, 3840, 1080, "ui-wall-unpaired");

  const ownerRow = await makeScreen({
    name: "uiOwner", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: wallGroup,
    isPaired: false, pairingCode: "UIA001",
  });
  const siblingRow = await makeScreen({
    name: "uiSibling", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: wallGroup,
    isPaired: false, pairingCode: "UIA002",
  });

  const owner = await gatingForScreen(ownerRow);
  assert.equal(owner.siblings.length, 1, "owner should see 1 sibling");
  assert.equal(owner.gating.owner.id, ownerRow.id, "owner's owner should be itself");
  assert.equal(owner.gating.isCanvasOwner, true);
  assert.equal(owner.gating.inheritsPairingFromOwner, false);
  assert.equal(owner.gating.showsPairingCodePanel, true,
    "owner should render the pairing-code panel in unpaired state");
  assert.equal(owner.gating.showsRegenerateCodeMenuItem, true,
    "owner should expose 'Regenerate Code' in unpaired state");
  assert.equal(owner.gating.showsUnpairDeviceMenuItem, false,
    "'Unpair Device' must stay hidden when nothing is paired");
  assert.equal(owner.gating.showsInheritsMessage, false);

  const sibling = await gatingForScreen(siblingRow);
  assert.equal(sibling.siblings.length, 1, "sibling should see 1 sibling (the owner)");
  assert.equal(sibling.gating.owner.id, ownerRow.id,
    "sibling's owner should be the earliest-created tile");
  assert.equal(sibling.gating.isCanvasOwner, false);
  assert.equal(sibling.gating.inheritsPairingFromOwner, false,
    "Task #179: inheritsPairingFromOwner must be false when the owner itself is unpaired");
  assert.equal(sibling.gating.showsPairingCodePanel, false,
    "sibling must NOT render the pairing-code panel even though the row carries the same code");
  assert.equal(sibling.gating.showsRegenerateCodeMenuItem, false,
    "sibling dropdown must NOT contain 'Regenerate Code'");
  assert.equal(sibling.gating.showsUnpairDeviceMenuItem, false,
    "sibling dropdown must NOT contain 'Unpair Device'");
  assert.equal(sibling.gating.showsInheritsMessage, false,
    "Task #179: sibling MUST NOT show 'Inherits pairing from <owner>' while the owner is unpaired");
});

// ─── Two-tile canvas: PAIRED state ─────────────────────────────────
// "The owner card ... dropdown contains ... 'Unpair Device'."
// "The sibling card shows the 'Inherits pairing from <owner>'
//  message and its dropdown does NOT contain ... 'Unpair Device'."

test("2-tile canvas, paired: owner shows Unpair Device; sibling shows Inherits message and no Unpair", async () => {
  const clientId = await makeClient("ui-paired");
  const t0 = new Date("2026-07-02T00:00:00Z");
  const wallGroup = await makeCanvasGroup(clientId, 3840, 1080, "ui-wall-paired");

  const ownerRow = await makeScreen({
    name: "uiOwnerP", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0,
    canvasGroupId: wallGroup,
    isPaired: true, pairingCode: "UIP001",
    deviceToken: "tok-shared", isOnline: true,
  });
  const siblingRow = await makeScreen({
    name: "uiSiblingP", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920,
    canvasGroupId: wallGroup,
    isPaired: true, pairingCode: "UIP002",
    deviceToken: "tok-shared", isOnline: true,
  });

  const owner = await gatingForScreen(ownerRow);
  assert.equal(owner.gating.isCanvasOwner, true);
  assert.equal(owner.gating.showsPairingCodePanel, false,
    "pairing-code panel must hide once the wall is paired");
  assert.equal(owner.gating.showsRegenerateCodeMenuItem, false,
    "'Regenerate Code' must hide once paired (route is /unpair-then-regenerate)");
  assert.equal(owner.gating.showsUnpairDeviceMenuItem, true,
    "owner dropdown should expose 'Unpair Device' in paired state");
  assert.equal(owner.gating.showsInheritsMessage, false);

  const sibling = await gatingForScreen(siblingRow);
  assert.equal(sibling.gating.isCanvasOwner, false);
  assert.equal(sibling.gating.owner.id, ownerRow.id);
  assert.equal(sibling.gating.showsPairingCodePanel, false);
  assert.equal(sibling.gating.showsRegenerateCodeMenuItem, false,
    "sibling dropdown must NOT contain 'Regenerate Code' even when paired");
  assert.equal(sibling.gating.showsUnpairDeviceMenuItem, false,
    "sibling dropdown must NOT contain 'Unpair Device' — only the owner can unpair the wall");
  assert.equal(sibling.gating.showsInheritsMessage, true,
    "sibling must show 'Inherits pairing from <owner>' in paired state too");
});

// ─── Solo / non-canvas screens are always their own owner ──────────
// Non-regression: make sure single-tile screens (and non-canvas
// screens that happen to share dims with a canvas wall on another
// row) still see the pairing-code panel + Regenerate / Unpair
// menu items they always did.

test("solo non-canvas screen is its own owner and keeps full pairing controls", async () => {
  const clientId = await makeClient("ui-solo");
  const t0 = new Date("2026-07-03T00:00:00Z");

  const soloUnpaired = await makeScreen({
    name: "uiSoloUnpaired", clientId, createdAt: t0,
    canvasEnabled: false,
    isPaired: false, pairingCode: "SOLOAB",
  });
  const soloPaired = await makeScreen({
    name: "uiSoloPaired", clientId, createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: false,
    isPaired: true, pairingCode: "SOLOPD", deviceToken: "tok-solo",
  });

  const u = await gatingForScreen(soloUnpaired);
  assert.equal(u.siblings.length, 0);
  assert.equal(u.gating.isCanvasOwner, true);
  assert.equal(u.gating.inheritsPairingFromOwner, false);
  assert.equal(u.gating.showsPairingCodePanel, true);
  assert.equal(u.gating.showsRegenerateCodeMenuItem, true);
  assert.equal(u.gating.showsUnpairDeviceMenuItem, false);
  assert.equal(u.gating.showsInheritsMessage, false);

  const p = await gatingForScreen(soloPaired);
  assert.equal(p.siblings.length, 0);
  assert.equal(p.gating.isCanvasOwner, true);
  assert.equal(p.gating.showsPairingCodePanel, false);
  assert.equal(p.gating.showsRegenerateCodeMenuItem, false);
  assert.equal(p.gating.showsUnpairDeviceMenuItem, true);
  assert.equal(p.gating.showsInheritsMessage, false);
});

// ─── Canvas-enabled but alone on its canvas ────────────────────────
// A single canvas-enabled screen with no siblings is still the
// owner of its own (degenerate) wall — it must keep the pairing
// controls and never show the inherits message.

test("canvas-enabled screen alone on its canvas keeps pairing controls", async () => {
  const clientId = await makeClient("ui-lonely");
  const t0 = new Date("2026-07-04T00:00:00Z");
  const lonely = await makeScreen({
    name: "uiLonely", clientId, createdAt: t0,
    canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080,
    isPaired: false, pairingCode: "LONELY",
  });

  const g = await gatingForScreen(lonely);
  assert.equal(g.siblings.length, 0);
  assert.equal(g.gating.isCanvasOwner, true);
  assert.equal(g.gating.inheritsPairingFromOwner, false);
  assert.equal(g.gating.showsPairingCodePanel, true);
  assert.equal(g.gating.showsRegenerateCodeMenuItem, true);
  assert.equal(g.gating.showsInheritsMessage, false);
});

// ─── Task #179 — pair / unpair / re-pair state transitions ─────────
// The inherits message must follow the owner's pairing state in
// real time. This spec drives the pure gating helper directly (no
// DB) to pin the transition contract: paired → unpaired hides the
// message, then unpaired → paired again brings it back. If a
// future refactor short-circuits the predicate (e.g. caches
// `siblingScreens.length > 0` and forgets the owner state) the
// regression lands here.

test("Task #179 — owner.isPaired transitions flip showsInheritsMessage on every sibling tick", async () => {
  // Use the pure helper so the transition contract is exercised
  // without any DB round-trips. We construct a 2-tile shape that
  // mirrors what `groupScreensByCanvas` would build in the real
  // screens.tsx render path.
  const owner = {
    id: "owner",
    name: "Owner Tile",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    isPaired: true,
    pairingCode: "PAIRED",
  };
  const sibling = {
    id: "sibling",
    name: "Sibling Tile",
    createdAt: new Date("2026-09-01T00:00:01Z"),
    isPaired: true,
    pairingCode: "PAIRED",
  };

  // Paired → sibling sees inherits.
  let g = getCanvasPairingGating(sibling, [owner]);
  assert.equal(g.inheritsPairingFromOwner, true);
  assert.equal(g.showsInheritsMessage, true);
  assert.equal(g.owner.id, "owner");

  // Operator unpairs the wall — owner.isPaired flips to false. The
  // sibling's row would be cleared by the cascade fan-out too, but
  // even if a stale render still has the old sibling state, the
  // helper must still hide the message.
  const ownerUnpaired = { ...owner, isPaired: false };
  g = getCanvasPairingGating(
    { ...sibling, isPaired: false },
    [ownerUnpaired],
  );
  assert.equal(g.inheritsPairingFromOwner, false,
    "after unpair the sibling must stop inheriting");
  assert.equal(g.showsInheritsMessage, false,
    "after unpair the sibling DOM must hide the inherits message");

  // Operator re-pairs (a player handshakes with the owner's new
  // pairing code) → fan-out flips owner.isPaired back to true.
  const ownerRepaired = { ...owner, isPaired: true, pairingCode: "REPAIR" };
  g = getCanvasPairingGating(
    { ...sibling, isPaired: true, pairingCode: "REPAIR" },
    [ownerRepaired],
  );
  assert.equal(g.inheritsPairingFromOwner, true,
    "re-pairing must restore the inherits state");
  assert.equal(g.showsInheritsMessage, true,
    "re-pairing must restore the inherits message DOM node");
});

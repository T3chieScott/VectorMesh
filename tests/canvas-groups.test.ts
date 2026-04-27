import test from "node:test";
import assert from "node:assert/strict";
import {
  groupScreensByCanvas,
  siblingsOnCanvas,
  siblingsForCanvasParams,
  isCanvasWallGroup,
  rectIntersection,
  nextFreeOffsetForRects,
} from "../shared/canvas-groups";
import type { Screen, CanvasGroup as CanvasGroupRow } from "../shared/schema";

// Task #189 — explicit canvas grouping. The grouping helpers no
// longer infer wall membership from (clientId, dims, position-distinctness);
// they key strictly off `canvasGroupId`. These tests pin the new
// contract so a regression to the implicit rule fails loudly.

// Minimal Screen factory — only the fields the helper reads matter.
// Other Screen fields are stubbed with safe placeholder values so we
// don't need a full DB row.
function makeScreen(overrides: Partial<Screen> & { id: string }): Screen {
  const base: Screen = {
    id: overrides.id,
    clientId: null,
    name: `Screen ${overrides.id}`,
    location: null,
    displayProfileId: null,
    pairingCode: null,
    deviceToken: null,
    isPaired: false,
    isOnline: false,
    lastSeen: null,
    ipAddress: null,
    hostname: null,
    hardwareClass: null,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasWidth: null,
    canvasHeight: null,
    canvasX: 0,
    canvasY: 0,
    canvasGroupId: null,
    locked: false,
    screenshotEnabled: false,
    lastScreenshot: null,
    lastScreenshotAt: null,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    roomCapacity: null,
    weatherLat: null,
    weatherLng: null,
    weatherPlaceName: null,
    weatherUnit: "celsius",
    displayOrder: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  };
  return { ...base, ...overrides };
}

function makeGroupRow(overrides: Partial<CanvasGroupRow> & { id: string }): CanvasGroupRow {
  const base: CanvasGroupRow = {
    id: overrides.id,
    clientId: null,
    name: `Group ${overrides.id}`,
    canvasWidth: 1920,
    canvasHeight: 1080,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  };
  return { ...base, ...overrides };
}

test("groupScreensByCanvas excludes screens with canvas disabled", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: false,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g1",
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasX: 0,
      canvasGroupId: "g1",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 1);
  const only = groups.get("g1")!;
  assert.equal(only.screens.length, 1);
  assert.equal(only.screens[0]!.id, "b");
  assert.equal(only.isWall, false);
});

test("groupScreensByCanvas excludes canvas-enabled screens with no group id", () => {
  const screens = [
    // Canvas enabled but no group id stamped (shouldn't happen post-backfill,
    // but the helper must defensively skip rather than crash).
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: null,
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g2",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 1);
  assert.deepEqual(groups.get("g2")!.screens.map((s) => s.id), ["b"]);
});

test("groupScreensByCanvas: same dims, same client, DIFFERENT groups stay separate", () => {
  // The key Task #189 regression: two single screens with identical
  // dims and the same client used to false-group into one wall under
  // the old (clientId, dims) key. With explicit canvasGroupId they
  // now stay isolated.
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g-a",
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g-b",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 2);
  assert.equal(groups.get("g-a")!.screens.length, 1);
  assert.equal(groups.get("g-b")!.screens.length, 1);
  assert.equal(groups.get("g-a")!.isWall, false);
  assert.equal(groups.get("g-b")!.isWall, false);
});

test("groupScreensByCanvas groups multiple screens that share a canvasGroupId", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 0,
      canvasGroupId: "wall-1",
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasGroupId: "wall-1",
    }),
    makeScreen({
      id: "c",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "lone-c",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 2);
  assert.deepEqual(
    groups.get("wall-1")!.screens.map((s) => s.id).sort(),
    ["a", "b"],
  );
  assert.equal(groups.get("wall-1")!.isWall, true);
  assert.equal(groups.get("lone-c")!.isWall, false);
});

test("groupScreensByCanvas attaches the persisted row when groupRows is supplied", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: "wall-1",
    }),
  ];
  const rows = [makeGroupRow({ id: "wall-1", name: "North Lobby" })];
  const groups = groupScreensByCanvas(screens, rows);
  assert.equal(groups.get("wall-1")!.group?.name, "North Lobby");
});

test("isCanvasWallGroup is true only when ≥2 members", () => {
  const screens = [
    makeScreen({ id: "a", canvasEnabled: true, canvasGroupId: "lone" }),
    makeScreen({ id: "b", canvasEnabled: true, canvasGroupId: "wall" }),
    makeScreen({ id: "c", canvasEnabled: true, canvasGroupId: "wall" }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(isCanvasWallGroup(groups.get("lone")!), false);
  assert.equal(isCanvasWallGroup(groups.get("wall")!), true);
});

test("siblingsOnCanvas excludes the screen itself", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 0,
      canvasGroupId: "wall-1",
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasGroupId: "wall-1",
    }),
    makeScreen({
      id: "c",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 3840,
      canvasGroupId: "wall-1",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  const siblings = siblingsOnCanvas(screens[0]!, groups);
  assert.deepEqual(siblings.map((s) => s.id).sort(), ["b", "c"]);
});

test("siblingsOnCanvas returns [] for canvas-disabled screen", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: false,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g1",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.deepEqual(siblingsOnCanvas(screens[0]!, groups), []);
});

test("siblingsOnCanvas returns [] when screen has no group", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: null,
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g2",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.deepEqual(siblingsOnCanvas(screens[0]!, groups), []);
});

test("siblingsForCanvasParams returns members of the named group", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: "wall-1",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  const siblings = siblingsForCanvasParams(
    { canvasGroupId: "wall-1" },
    groups,
  );
  assert.deepEqual(siblings.map((s) => s.id), ["a"]);
});

test("siblingsForCanvasParams excludes given id", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: "wall-1",
    }),
    makeScreen({
      id: "b",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: "wall-1",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  const siblings = siblingsForCanvasParams(
    { excludeScreenId: "a", canvasGroupId: "wall-1" },
    groups,
  );
  assert.deepEqual(siblings.map((s) => s.id), ["b"]);
});

test("siblingsForCanvasParams returns [] for null/missing group", () => {
  const screens = [
    makeScreen({
      id: "a",
      clientId: "c1",
      canvasEnabled: true,
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasGroupId: "g1",
    }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.deepEqual(siblingsForCanvasParams({ canvasGroupId: null }, groups), []);
  assert.deepEqual(siblingsForCanvasParams({ canvasGroupId: undefined }, groups), []);
  assert.deepEqual(
    siblingsForCanvasParams({ canvasGroupId: "does-not-exist" }, groups),
    [],
  );
});

test("rectIntersection returns null when rects don't overlap", () => {
  assert.equal(
    rectIntersection(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
    ),
    null,
  );
  // Edge-touching is NOT overlap.
  assert.equal(
    rectIntersection(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 100, y: 0, width: 100, height: 100 },
    ),
    null,
  );
});

test("rectIntersection returns the overlapping region", () => {
  const r = rectIntersection(
    { x: 0, y: 0, width: 200, height: 100 },
    { x: 100, y: 0, width: 200, height: 100 },
  );
  assert.deepEqual(r, { x: 100, y: 0, width: 100, height: 100 });
});

test("nextFreeOffsetForRects places at 0 on empty canvas", () => {
  const r = nextFreeOffsetForRects([], 1920, 1080);
  assert.deepEqual(r, { x: 0, y: 0 });
});

test("nextFreeOffsetForRects places to the right of an occupied left edge", () => {
  const r = nextFreeOffsetForRects(
    [{ x: 0, y: 0, width: 1920, height: 1080 }],
    1920,
    1080,
  );
  assert.deepEqual(r, { x: 1920, y: 0 });
});

test("nextFreeOffsetForRects fills a gap between two existing screens", () => {
  // Two screens at 0 and 3840, with a 1920-wide gap in the middle.
  const r = nextFreeOffsetForRects(
    [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 3840, y: 0, width: 1920, height: 1080 },
    ],
    1920,
    1080,
  );
  assert.deepEqual(r, { x: 1920, y: 0 });
});

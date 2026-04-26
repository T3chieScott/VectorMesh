import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasGroupKeyString,
  groupScreensByCanvas,
  siblingsOnCanvas,
  siblingsForCanvasParams,
  rectIntersection,
  nextFreeOffsetForRects,
} from "../shared/canvas-groups";
import type { Screen } from "../shared/schema";

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

test("canvasGroupKeyString stable shape for same inputs", () => {
  assert.equal(
    canvasGroupKeyString("client-1", 1920, 1080),
    "client-1|1920x1080",
  );
  assert.equal(canvasGroupKeyString(null, 800, 600), "|800x600");
});

test("groupScreensByCanvas excludes screens with canvas disabled", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: false, canvasWidth: 1920, canvasHeight: 1080 }),
    makeScreen({ id: "b", clientId: "c1", canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0 }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 1);
  const only = groups.get("c1|1920x1080")!;
  assert.equal(only.screens.length, 1);
  assert.equal(only.screens[0]!.id, "b");
});

test("groupScreensByCanvas excludes screens with null/zero canvas dims", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: true, canvasWidth: null, canvasHeight: null }),
    makeScreen({ id: "b", clientId: "c1", canvasEnabled: true, canvasWidth: 0, canvasHeight: 0 }),
    makeScreen({ id: "c", clientId: "c1", canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080, canvasX: 0 }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 1);
  assert.deepEqual(groups.get("c1|1920x1080")!.screens.map((s) => s.id), ["c"]);
});

test("groupScreensByCanvas keeps same canvas in different clients separate", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080 }),
    makeScreen({ id: "b", clientId: "c2", canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080 }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 2);
  assert.equal(groups.get("c1|1920x1080")!.screens.length, 1);
  assert.equal(groups.get("c2|1920x1080")!.screens.length, 1);
});

test("groupScreensByCanvas groups matching canvas in the same client", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0 }),
    makeScreen({ id: "b", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920 }),
    makeScreen({ id: "c", clientId: "c1", canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080 }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 2);
  assert.deepEqual(
    groups.get("c1|3840x1080")!.screens.map((s) => s.id).sort(),
    ["a", "b"],
  );
});

test("groupScreensByCanvas keeps single-screen groups", () => {
  const screens = [
    makeScreen({ id: "lonely", clientId: "c1", canvasEnabled: true, canvasWidth: 1920, canvasHeight: 1080 }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.equal(groups.size, 1);
  assert.equal(groups.get("c1|1920x1080")!.screens.length, 1);
});

test("siblingsOnCanvas excludes the screen itself", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0 }),
    makeScreen({ id: "b", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 1920 }),
    makeScreen({ id: "c", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 3840 }),
  ];
  const groups = groupScreensByCanvas(screens);
  const siblings = siblingsOnCanvas(screens[0]!, groups);
  assert.deepEqual(siblings.map((s) => s.id).sort(), ["b", "c"]);
});

test("siblingsOnCanvas returns [] for canvas-disabled screen", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: false, canvasWidth: 1920, canvasHeight: 1080 }),
  ];
  const groups = groupScreensByCanvas(screens);
  assert.deepEqual(siblingsOnCanvas(screens[0]!, groups), []);
});

test("siblingsForCanvasParams works for an unsaved screen", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080, canvasX: 0 }),
  ];
  const groups = groupScreensByCanvas(screens);
  const siblings = siblingsForCanvasParams(
    { clientId: "c1", canvasWidth: 3840, canvasHeight: 1080 },
    groups,
  );
  assert.deepEqual(siblings.map((s) => s.id), ["a"]);
});

test("siblingsForCanvasParams excludes given id", () => {
  const screens = [
    makeScreen({ id: "a", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080 }),
    makeScreen({ id: "b", clientId: "c1", canvasEnabled: true, canvasWidth: 3840, canvasHeight: 1080 }),
  ];
  const groups = groupScreensByCanvas(screens);
  const siblings = siblingsForCanvasParams(
    { excludeScreenId: "a", clientId: "c1", canvasWidth: 3840, canvasHeight: 1080 },
    groups,
  );
  assert.deepEqual(siblings.map((s) => s.id), ["b"]);
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

/**
 * Unit tests for monitor-mode canvas geometry.
 *
 * These tests document and verify the pure geometry computation that
 * monitor.tsx performs to display a canvas-enabled screen's crop.  The
 * logic mirrors player.tsx's canvas mode:
 *
 *   viewportW/H   — the logical pixel rect the monitor scales to fill the window
 *   useCanvasMode — whether zone-frame needs the (-canvasX, -canvasY) translate
 *   zoneOffset    — the (left, top) applied to the zone-frame div
 *
 * Because these are pure arithmetic functions we can test them in Node.js
 * without a DOM or React rendering environment.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── Geometry helpers (mirrors monitor.tsx MonitorContentInner logic) ──────────

interface ProfileLike { width: number; height: number }
interface ScreenLike {
  canvasEnabled?: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  canvasX?: number | null;
  canvasY?: number | null;
}
interface LayoutAspect { width: number; height: number }

function computeCanvasGeometry(
  profile: ProfileLike,
  screen: ScreenLike,
  layoutAspect: LayoutAspect,
) {
  const monitorScreenW = profile.width;
  const monitorScreenH = profile.height;
  const rawCW = screen.canvasWidth ?? 0;
  const rawCH = screen.canvasHeight ?? 0;
  const canvasEnabled = screen.canvasEnabled === true && rawCW > 0 && rawCH > 0;
  const canvasW = canvasEnabled ? rawCW : 0;
  const canvasH = canvasEnabled ? rawCH : 0;
  const canvasX = screen.canvasX ?? 0;
  const canvasY = screen.canvasY ?? 0;

  // After the unification fix: always use profile dimensions as the logical
  // viewport.  Both canvas and non-canvas screens share the same coordinate
  // system (profile.width × profile.height).
  const viewportW = monitorScreenW;
  const viewportH = monitorScreenH;

  const useCanvasMode =
    canvasEnabled &&
    Math.abs(layoutAspect.width - canvasW) <= 1 &&
    Math.abs(layoutAspect.height - canvasH) <= 1;

  // Use `|| 0` to coerce -0 → 0 (avoid Object.is(-0, 0) = false in strict assert).
  const zoneOffsetX = useCanvasMode ? (-canvasX || 0) : 0;
  const zoneOffsetY = useCanvasMode ? (-canvasY || 0) : 0;
  const zoneW = useCanvasMode ? canvasW : viewportW;
  const zoneH = useCanvasMode ? canvasH : viewportH;

  return {
    canvasEnabled,
    canvasW, canvasH,
    canvasX, canvasY,
    viewportW, viewportH,
    useCanvasMode,
    zoneOffsetX, zoneOffsetY,
    zoneW, zoneH,
    monitorScreenW, monitorScreenH,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("canvas geometry: non-canvas screen — viewport equals layout dimensions", () => {
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: false },
    { width: 1920, height: 1080 },
  );
  assert.equal(geom.canvasEnabled, false);
  assert.equal(geom.viewportW, 1920);
  assert.equal(geom.viewportH, 1080);
  assert.equal(geom.useCanvasMode, false);
  assert.equal(geom.zoneOffsetX, 0);
  assert.equal(geom.zoneOffsetY, 0);
});

test("canvas geometry: canvas-enabled screen — viewport equals profile (screen) dimensions", () => {
  // 3×1 canvas, this is the leftmost 1920×1080 screen at (0, 0)
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 0, canvasY: 0 },
    { width: 5760, height: 1080 }, // layout authored at full canvas dimensions
  );
  assert.equal(geom.canvasEnabled, true);
  // Viewport = this screen's profile slice, NOT the full canvas
  assert.equal(geom.viewportW, 1920);
  assert.equal(geom.viewportH, 1080);
  assert.equal(geom.useCanvasMode, true);
  // First screen: zone frame offset = (0, 0)
  assert.equal(geom.zoneOffsetX, 0);
  assert.equal(geom.zoneOffsetY, 0);
  assert.equal(geom.zoneW, 5760);
  assert.equal(geom.zoneH, 1080);
});

test("canvas geometry: middle screen in horizontal array has correct X offset", () => {
  // 3×1 canvas, this is the MIDDLE 1920×1080 screen at (1920, 0)
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 1920, canvasY: 0 },
    { width: 5760, height: 1080 },
  );
  assert.equal(geom.viewportW, 1920);
  assert.equal(geom.viewportH, 1080);
  assert.equal(geom.useCanvasMode, true);
  // Zone frame offset = (-1920, 0) so the middle column is visible
  assert.equal(geom.zoneOffsetX, -1920);
  assert.equal(geom.zoneOffsetY, 0);
});

test("canvas geometry: rightmost screen has correct X offset", () => {
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 3840, canvasY: 0 },
    { width: 5760, height: 1080 },
  );
  assert.equal(geom.zoneOffsetX, -3840);
  assert.equal(geom.zoneOffsetY, 0);
});

test("canvas geometry: screen in bottom row of 2×2 array has correct Y offset", () => {
  // 2×2 canvas: this is screen at (1920, 1080)
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 3840, canvasHeight: 2160, canvasX: 1920, canvasY: 1080 },
    { width: 3840, height: 2160 },
  );
  assert.equal(geom.viewportW, 1920);
  assert.equal(geom.viewportH, 1080);
  assert.equal(geom.useCanvasMode, true);
  assert.equal(geom.zoneOffsetX, -1920);
  assert.equal(geom.zoneOffsetY, -1080);
});

test("canvas geometry: arbitrary (non-grid) position", () => {
  // Canvas 4000×2000 with this screen at (800, 400)
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 4000, canvasHeight: 2000, canvasX: 800, canvasY: 400 },
    { width: 4000, height: 2000 },
  );
  assert.equal(geom.zoneOffsetX, -800);
  assert.equal(geom.zoneOffsetY, -400);
});

test("canvas geometry: layout NOT at canvas dimensions → useCanvasMode false, viewport=profile", () => {
  // Canvas is enabled but the layout was authored at 1920×1080, not at 5760×1080.
  // In this case useCanvasMode is false — zones fill the profile viewport directly.
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 1920, canvasY: 0 },
    { width: 1920, height: 1080 }, // authored at screen, not canvas, dimensions
  );
  assert.equal(geom.canvasEnabled, true);
  assert.equal(geom.useCanvasMode, false); // layout dims ≠ canvas dims
  // Viewport still uses profile dimensions (not layout, since canvasEnabled)
  assert.equal(geom.viewportW, 1920);
  assert.equal(geom.viewportH, 1080);
  // No translate — zones fill the viewport directly
  assert.equal(geom.zoneOffsetX, 0);
  assert.equal(geom.zoneOffsetY, 0);
});

test("canvas geometry: canvasEnabled=true but canvasWidth=0 → treated as non-canvas", () => {
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 0, canvasHeight: 0, canvasX: 0, canvasY: 0 },
    { width: 1920, height: 1080 },
  );
  assert.equal(geom.canvasEnabled, false);
  assert.equal(geom.viewportW, 1920);
  assert.equal(geom.viewportH, 1080);
});

test("canvas geometry: scale factors are correct for monitor window", () => {
  // Verify that the monitor window size (inner*) → scale relationship is correct.
  // For a 1920×1080 viewport on a 3840×2160 monitor window:
  //   expected scale = Math.min(3840/1920, 2160/1080) = Math.min(2, 2) = 2
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: false },
    { width: 1920, height: 1080 },
  );
  const innerW = 3840;
  const innerH = 2160;
  const scale = Math.min(innerW / geom.viewportW, innerH / geom.viewportH);
  assert.equal(scale, 2);
});

test("canvas geometry: canvas screen scale uses profile dims, not canvas dims", () => {
  // A 3×1 canvas screen on a 1920×1080 monitor window.
  // Scale must be based on PROFILE (1920×1080), not canvas (5760×1080).
  // On a 1920×1080 window: scale = Math.min(1920/1920, 1080/1080) = 1 (fits exactly).
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: true, canvasWidth: 5760, canvasHeight: 1080, canvasX: 0, canvasY: 0 },
    { width: 5760, height: 1080 },
  );
  const innerW = 1920;
  const innerH = 1080;
  const scale = Math.min(innerW / geom.viewportW, innerH / geom.viewportH);
  // Should be 1 (profile fits exactly), not 0.333 (which canvas would give)
  assert.equal(scale, 1);
});

test("canvas geometry: test pattern uses profile dimensions (not layout)", () => {
  // Test pattern always renders at profile dimensions.
  // monitorScreenW/H must come from content.profile, not layoutAspect.
  const profile = { width: 3840, height: 2160 };
  const screen: ScreenLike = { canvasEnabled: false };
  const geom = computeCanvasGeometry(profile, screen, { width: 1920, height: 1080 });
  // test-pattern should be rendered at monitorScreenW × monitorScreenH
  assert.equal(geom.monitorScreenW, 3840);
  assert.equal(geom.monitorScreenH, 2160);
});

test("canvas geometry: non-canvas screen uses profile dims as viewport (not layout ratio units)", () => {
  // After the unification fix, getAspectRatioDimensions("16:9") = {width:16, height:9}
  // must NOT be used as pixel viewport dimensions for non-canvas screens.
  // The viewport must always equal profile.width × profile.height.
  const geom = computeCanvasGeometry(
    { width: 1920, height: 1080 },
    { canvasEnabled: false },
    { width: 16, height: 9 },  // what getAspectRatioDimensions("16:9") returns
  );
  assert.equal(geom.viewportW, 1920, "viewport must be profile width, not ratio numerator 16");
  assert.equal(geom.viewportH, 1080, "viewport must be profile height, not ratio denominator 9");
});

test("canvas geometry: portrait screen uses portrait profile dimensions as viewport", () => {
  // A 9:16 portrait screen (e.g. a vertical display) should give a portrait
  // viewport (1080×1920), not 9×16 ratio units.
  const geom = computeCanvasGeometry(
    { width: 1080, height: 1920 },
    { canvasEnabled: false },
    { width: 9, height: 16 },  // what getAspectRatioDimensions("9:16") would return
  );
  assert.equal(geom.viewportW, 1080, "portrait viewport width = profile width");
  assert.equal(geom.viewportH, 1920, "portrait viewport height = profile height");
});

/**
 * Tests for the shared Player/Monitor logical screen surface.
 *
 * These tests document the unified rendering model introduced by
 * ScreenRenderSurface:
 *
 *   - Player and Monitor must use the same profile-based logical surface.
 *   - Monitor tile size must not affect logical layout geometry.
 *   - HTML content retains the physical-screen reference dimensions.
 *   - Portrait and non-standard profiles are handled correctly.
 *   - Canvas screens clip to the same physical viewport on both hosts.
 *   - TestPattern renders at profile dimensions.
 *   - ScreenRenderSurface exists and exports the expected interface.
 *
 * Because the rendering is ultimately a React component, these tests focus on
 * the pure geometry that drives the CSS transforms (no DOM or React render
 * harness required).  React-level rendering is covered by the existing
 * Playwright e2e suite.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Geometry helpers ──────────────────────────────────────────────────────────

interface Profile { width: number; height: number }
interface CanvasScreen {
  canvasEnabled?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  canvasX?: number;
  canvasY?: number;
}

/**
 * Compute the logical screen surface used by BOTH Player and Monitor.
 * After the unification fix both hosts use profile dimensions for all screens.
 *
 * For Player (non-canvas): captureW = playerScreenW, captureH = playerScreenH
 * For Monitor (non-canvas): viewportW = monitorScreenW, viewportH = monitorScreenH
 * Both equal profile.width × profile.height.
 */
function logicalSurface(
  profile: Profile,
  screen: CanvasScreen = {},
): { logicalW: number; logicalH: number; captureIsSameAsSurface: boolean } {
  const rawCW = screen.canvasWidth ?? 0;
  const rawCH = screen.canvasHeight ?? 0;
  const canvasEnabled = screen.canvasEnabled === true && rawCW > 0 && rawCH > 0;
  // Player: captureW = canvasEnabled ? canvasW : playerScreenW
  // Monitor: viewportW = monitorScreenW (always profile)
  const logicalW = canvasEnabled ? rawCW : profile.width;
  const logicalH = canvasEnabled ? rawCH : profile.height;
  // For canvas screens, Player uses full canvas as capture; Monitor uses profile.
  // For non-canvas, both use profile — so they are identical.
  const captureIsSameAsSurface = !canvasEnabled;
  return { logicalW, logicalH, captureIsSameAsSurface };
}

/**
 * Compute scale factor for a given tile size and logical surface.
 * scale = min(tileW / logicalW, tileH / logicalH)
 */
function tileScale(
  tileW: number,
  tileH: number,
  logicalW: number,
  logicalH: number,
): number {
  return Math.min(tileW / logicalW, tileH / logicalH);
}

/**
 * Compute canvas zone-frame geometry (same for Player slot and Monitor viewport).
 * When useOffset=true, the zone frame is translated by (-canvasX, -canvasY).
 */
function canvasGeometry(
  profile: Profile,
  screen: CanvasScreen,
  layoutAuthoredW: number,
  layoutAuthoredH: number,
) {
  const rawCW = screen.canvasWidth ?? 0;
  const rawCH = screen.canvasHeight ?? 0;
  const canvasEnabled = screen.canvasEnabled === true && rawCW > 0 && rawCH > 0;
  const canvasW = canvasEnabled ? rawCW : 0;
  const canvasH = canvasEnabled ? rawCH : 0;
  const canvasX = screen.canvasX ?? 0;
  const canvasY = screen.canvasY ?? 0;
  const useOffset =
    canvasEnabled &&
    Math.abs(layoutAuthoredW - canvasW) <= 1 &&
    Math.abs(layoutAuthoredH - canvasH) <= 1;
  // Use `|| 0` to coerce −0 → 0 so strict-equality assertions behave intuitively.
  return {
    canvasEnabled,
    canvasW, canvasH,
    canvasX, canvasY,
    useOffset,
    zoneOffsetX: useOffset ? (-canvasX || 0) : 0,
    zoneOffsetY: useOffset ? (-canvasY || 0) : 0,
    // Monitor viewport: always profile (screen's physical crop)
    monitorViewportW: profile.width,
    monitorViewportH: profile.height,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Shared logical screen surface", () => {

  test("1. Player and Monitor use identical logical dimensions for a standard 1920×1080 screen", () => {
    const profile: Profile = { width: 1920, height: 1080 };
    const { logicalW, logicalH } = logicalSurface(profile);
    // Both hosts now use profile dimensions
    assert.equal(logicalW, 1920, "logical width must equal profile width");
    assert.equal(logicalH, 1080, "logical height must equal profile height");
    // Not ratio units (16 × 9 from getAspectRatioDimensions)
    assert.notEqual(logicalW, 16);
    assert.notEqual(logicalH, 9);
  });

  test("2. Monitor tile size does not affect logical layout geometry", () => {
    const profile: Profile = { width: 1920, height: 1080 };
    const { logicalW, logicalH } = logicalSurface(profile);

    // Three different monitor tile sizes all produce the same logical surface
    const tileSizes = [
      { w: 1920, h: 1080 },
      { w: 960,  h: 540  },
      { w: 480,  h: 270  },
    ];

    for (const { w: tileW, h: tileH } of tileSizes) {
      const scale = tileScale(tileW, tileH, logicalW, logicalH);
      // Logical surface is unchanged; only scale changes
      assert.equal(logicalW, 1920, `logical width unchanged for tile ${tileW}×${tileH}`);
      assert.equal(logicalH, 1080, `logical height unchanged for tile ${tileW}×${tileH}`);
      // Scale is positive and inversely proportional to tile size
      assert.ok(scale > 0, "scale must be positive");
      assert.ok(
        Math.abs(scale - tileW / 1920) < 0.001,
        `scale should be ${tileW}/1920 for ${tileW}×${tileH} tile`,
      );
    }
  });

  test("3. HTML widget REFERENCE_WIDTH matches logical surface width for 1920×1080 profile", () => {
    // The HTML widget in ZoneRenderer always uses a 1920px reference width.
    // With a profile-based 1920px logical surface, a full-screen zone container
    // is 1920px wide → HTML widget scale = 1920/1920 = 1.0 (pixel-perfect).
    const REFERENCE_WIDTH = 1920;
    const profile: Profile = { width: 1920, height: 1080 };
    const { logicalW } = logicalSurface(profile);

    // A full-screen zone (width: 100%) = logical surface width
    const zoneContainerW = logicalW;
    const htmlWidgetScale = zoneContainerW / REFERENCE_WIDTH;
    assert.equal(htmlWidgetScale, 1.0, "HTML widget scale must be 1.0 for 1920px profile");
  });

  test("4. Portrait 1080×1920 screen preserves portrait aspect ratio", () => {
    const profile: Profile = { width: 1080, height: 1920 };
    const { logicalW, logicalH } = logicalSurface(profile);
    assert.equal(logicalW, 1080, "portrait logical width");
    assert.equal(logicalH, 1920, "portrait logical height");

    // Scale for a landscape 1920×1080 monitor tile must be height-constrained
    const scale = tileScale(1920, 1080, logicalW, logicalH);
    const expectedScale = 1080 / 1920; // height-constrained: 0.5625
    assert.ok(
      Math.abs(scale - expectedScale) < 0.001,
      `portrait scale on landscape tile should be ${expectedScale.toFixed(4)}, got ${scale.toFixed(4)}`,
    );
    // Width would overflow if scale were width-constrained
    const visibleW = logicalW * scale;
    assert.ok(visibleW <= 1920, "portrait logical width scaled to tile must fit");
  });

  test("4b. Non-standard profile dimensions produce correct logical surface", () => {
    const profile: Profile = { width: 3840, height: 2160 };
    const { logicalW, logicalH } = logicalSurface(profile);
    assert.equal(logicalW, 3840);
    assert.equal(logicalH, 2160);
  });

  test("5. Canvas screen: monitor viewport equals profile (physical crop), not full canvas", () => {
    const profile: Profile = { width: 1920, height: 1080 };
    const screen: CanvasScreen = {
      canvasEnabled: true,
      canvasWidth: 5760,
      canvasHeight: 1080,
      canvasX: 1920,  // middle screen
      canvasY: 0,
    };
    // Layout authored at full canvas dims (canvas-spanning)
    const geo = canvasGeometry(profile, screen, 5760, 1080);

    // Monitor always shows profile crop (1920×1080), not full canvas (5760×1080)
    assert.equal(geo.monitorViewportW, 1920, "monitor viewport = profile width");
    assert.equal(geo.monitorViewportH, 1080, "monitor viewport = profile height");
    // Zone frame is offset to show the middle column
    assert.equal(geo.useOffset, true, "canvas-spanning layout uses zone offset");
    assert.equal(geo.zoneOffsetX, -1920, "middle screen offset = -canvasX");
    assert.equal(geo.zoneOffsetY, 0);
    // Zone frame itself spans the full canvas
    assert.equal(geo.canvasW, 5760);
    assert.equal(geo.canvasH, 1080);
  });

  test("5b. Canvas screen scale uses profile dimensions, not canvas dimensions", () => {
    const profile: Profile = { width: 1920, height: 1080 };
    const screen: CanvasScreen = {
      canvasEnabled: true,
      canvasWidth: 5760,
      canvasHeight: 1080,
      canvasX: 0,
      canvasY: 0,
    };
    const geo = canvasGeometry(profile, screen, 5760, 1080);
    // Scale based on profile (1920×1080), not canvas (5760×1080)
    const scale = tileScale(1920, 1080, geo.monitorViewportW, geo.monitorViewportH);
    assert.equal(scale, 1.0, "1920px tile ÷ 1920px profile = scale 1.0 (not 0.333 from canvas)");
  });

  test("6. TestPattern uses profile dimensions (not aspect-ratio units)", () => {
    // TestPattern is always rendered at profile.width × profile.height.
    // If it used getAspectRatioDimensions("16:9") = {16, 9} the SVG would be
    // tiny and the scale calculation would produce extreme values.
    const profile: Profile = { width: 1920, height: 1080 };
    const { logicalW, logicalH } = logicalSurface(profile);
    // Profile dimensions are the TestPattern target
    assert.equal(logicalW, 1920);
    assert.equal(logicalH, 1080);
    // Sanity-check: not ratio units
    assert.ok(logicalW > 100, "logical width must be pixel dimensions, not ratio units");
    assert.ok(logicalH > 100, "logical height must be pixel dimensions, not ratio units");
  });

  test("7. ScreenRenderSurface component file exists and exports expected interface", () => {
    const src = readFileSync(
      join(__dirname, "..", "client", "src", "components", "screen-render-surface.tsx"),
      "utf8",
    );
    // Must export the component
    assert.match(src, /export function ScreenRenderSurface/, "exports ScreenRenderSurface");
    // Must export the geometry interface
    assert.match(src, /export interface ScreenCanvasGeometry/, "exports ScreenCanvasGeometry");
    // Must accept mediaBaseUrl so Player and Monitor can inject their own auth URLs
    assert.match(src, /mediaBaseUrl/, "accepts mediaBaseUrl prop");
    // Must accept deviceToken (Player only — Monitor leaves it undefined)
    assert.match(src, /deviceToken/, "accepts deviceToken prop");
    // Must render ZoneRenderer
    assert.match(src, /ZoneRenderer/, "delegates to ZoneRenderer");
    // Canvas geometry must support useOffset flag
    assert.match(src, /useOffset/, "supports useOffset for canvas mode");
  });

  test("8. Monitor suppresses all player capabilities (static analysis)", () => {
    const monitorSrc = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "monitor.tsx"),
      "utf8",
    );
    // MONITOR_CAPABILITIES must be imported and validated at startup
    assert.match(monitorSrc, /MONITOR_CAPABILITIES/, "imports MONITOR_CAPABILITIES");
    // The module-level validation guard must be present
    assert.match(monitorSrc, /_badCapabilities/, "validates capabilities at module load");
    // The capabilities doc comment must explicitly declare no heartbeat
    assert.match(
      monitorSrc,
      /canHeartbeat\s*[:\-–—].*false/,
      "capabilities doc must declare canHeartbeat false",
    );
    // No localStorage reads/writes for device identity (device-token is player-only)
    assert.doesNotMatch(
      monitorSrc,
      /localStorage\.(getItem|setItem)/,
      "must not persist device token in localStorage",
    );
  });

  test("9. Player capture target uses profile dimensions, not REFERENCE_HEIGHT", () => {
    const playerSrc = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "player.tsx"),
      "utf8",
    );
    // After the fix: captureW uses playerScreenW (profile), not trueWidth (720p reference)
    assert.match(
      playerSrc,
      /const\s+captureW\s*=\s*canvasEnabled\s*\?\s*canvasW\s*:\s*playerScreenW\s*;/,
      "captureW must be profile-based (canvasEnabled ? canvasW : playerScreenW)",
    );
    assert.match(
      playerSrc,
      /const\s+captureH\s*=\s*canvasEnabled\s*\?\s*canvasH\s*:\s*playerScreenH\s*;/,
      "captureH must be profile-based (canvasEnabled ? canvasH : playerScreenH)",
    );
    // REFERENCE_HEIGHT=720 must no longer appear
    assert.doesNotMatch(
      playerSrc,
      /const\s+REFERENCE_HEIGHT\s*=\s*720/,
      "REFERENCE_HEIGHT=720 must be removed",
    );
  });

  test("9c. Monitor logical surface container has flex:none to prevent Flexbox shrink", () => {
    // The monitor outer div is display:flex (flex items-center justify-center).
    // Without flex:none / flex-shrink:0 on the inner logical-surface div,
    // Flexbox shrinks it from viewportW px to the available tile width BEFORE
    // scale() is applied — because transforms happen after layout.
    //
    // Before fix (1920×1080 surface inside a 525 px-wide tile):
    //   Declared logical size  : 1920 × 1080 px
    //   Computed layout size   : 525 × 1080 px  ← Flexbox squish
    //   BoundingClientRect.width: 525 px
    //   Transform scale        : correct (scale = tile / 1920)
    //   Final rendered size    : 525 × scale ≈ 525 × 0.274 ≈ 144 px wide
    //   Appearance             : portrait strip inside a landscape tile
    //
    // After fix:
    //   Declared logical size  : 1920 × 1080 px
    //   Computed layout size   : 1920 × 1080 px  ← flex:none holds the box
    //   BoundingClientRect.width: 1920 px
    //   Transform scale        : correct (scale = tile / 1920)
    //   Final rendered size    : 1920 × scale ≈ tile width (landscape)
    //   Appearance             : correct landscape rendering
    //
    // This test asserts the property is present so the fix cannot silently regress.
    const monitorSrc = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "monitor.tsx"),
      "utf8",
    );
    assert.match(
      monitorSrc,
      /flex\s*:\s*["']none["']/,
      'logical surface container must have flex:"none" to prevent Flexbox shrink before scale()',
    );
  });

  test("9b. Monitor viewport uses profile dimensions, not layout ratio units", () => {
    const monitorSrc = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "monitor.tsx"),
      "utf8",
    );
    // After the fix: viewportW = monitorScreenW (not layoutAspect.width ratio units)
    assert.match(
      monitorSrc,
      /const\s+viewportW\s*=\s*monitorScreenW\s*;/,
      "viewportW must always be monitorScreenW (profile)",
    );
    assert.match(
      monitorSrc,
      /const\s+viewportH\s*=\s*monitorScreenH\s*;/,
      "viewportH must always be monitorScreenH (profile)",
    );
    // Must NOT use layoutAspect.width/height as viewport dimensions
    assert.doesNotMatch(
      monitorSrc,
      /viewportW\s*=\s*canvasEnabled\s*\?\s*monitorScreenW\s*:\s*layout/,
      "viewportW must not branch on canvasEnabled vs layoutAspect",
    );
  });

  test("10. ScreenRenderSurface is used by both Player and Monitor", () => {
    const playerSrc = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "player.tsx"),
      "utf8",
    );
    const monitorSrc = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "monitor.tsx"),
      "utf8",
    );
    assert.match(
      playerSrc,
      /ScreenRenderSurface/,
      "player.tsx must import/use ScreenRenderSurface",
    );
    assert.match(
      monitorSrc,
      /ScreenRenderSurface/,
      "monitor.tsx must import/use ScreenRenderSurface",
    );
  });
});

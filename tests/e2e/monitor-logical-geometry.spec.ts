/**
 * Browser-level logical screen geometry regression test.
 *
 * Renders the Monitor logical surface structure in a real Chromium browser and
 * measures layout dimensions using the DOM APIs that the layout engine computes:
 *
 *   offsetWidth / offsetHeight   — element size in CSS pixels, BEFORE transform.
 *   getBoundingClientRect()      — element size AFTER all transforms are applied.
 *   getComputedStyle()           — resolved CSS property values.
 *
 * ── What is being tested ─────────────────────────────────────────────────────
 * The Monitor logical surface is a flex item inside a `display:flex` parent.
 * Without `flex: none` (or `flex-shrink: 0`), the Flexbox algorithm shrinks
 * the item from its declared 1920 px width down to the available tile width
 * BEFORE `transform: scale()` is applied.  Because transforms happen after
 * layout, the scale then operates on the shrunken width instead of the
 * declared logical width, producing portrait rendering inside a landscape tile.
 *
 * The test:
 *   1. Injects the exact same CSS structure as monitor.tsx's logical surface.
 *   2. Measures offsetWidth/offsetHeight — these must always equal the profile
 *      dimensions regardless of how small the viewport/tile is.
 *   3. Explicitly removes `flex: none` and asserts that offsetWidth then
 *      collapses to the viewport width, proving the fix is load-bearing.
 *   4. Exercises resize: verifies scale changes but logical dims stay fixed.
 *
 * ── No server required ───────────────────────────────────────────────────────
 * The test uses page.setContent() to inject self-contained HTML.  No dev
 * server, database, or monitor session is needed.  This isolates the CSS
 * layout engine behaviour from the rest of the application stack.
 *
 * ── Profiles tested ──────────────────────────────────────────────────────────
 *   - 1920 × 1080  (standard landscape HD)
 *   - 1080 × 1920  (portrait)
 *   - 1080 × 1080  (square)
 *   - 3840 × 1080  (ultra-wide)
 *
 * ── Viewport sizes tested (per profile) ─────────────────────────────────────
 *   - 1920 × 1080  (full tile — scale 1.0)
 *   - 960  × 540   (half-size tile — scale 0.5)
 *   - 525  × 268   (~12-screen Multiview grid tile)
 *   - 320  × 180   (~50-screen Multiview grid tile — extreme density)
 */

import { test, expect, type Page } from "@playwright/test";

// ── Profile definitions ───────────────────────────────────────────────────────

interface Profile {
  name: string;
  width: number;
  height: number;
}

const PROFILES: Profile[] = [
  { name: "1920×1080 landscape",  width: 1920, height: 1080 },
  { name: "1080×1920 portrait",   width: 1080, height: 1920 },
  { name: "1080×1080 square",     width: 1080, height: 1080 },
  { name: "3840×1080 ultra-wide", width: 3840, height: 1080 },
];

interface ViewportSize { width: number; height: number; label: string }

const VIEWPORTS: ViewportSize[] = [
  { width: 1920, height: 1080, label: "full-HD tile (scale≈1.0)" },
  { width: 960,  height: 540,  label: "half-size tile (scale≈0.5)" },
  { width: 525,  height: 268,  label: "12-screen grid tile" },
  { width: 320,  height: 180,  label: "50-screen grid tile" },
];

// ── HTML fixture ──────────────────────────────────────────────────────────────

/**
 * Build a minimal self-contained HTML page that replicates the Monitor
 * logical surface structure from monitor.tsx verbatim:
 *
 *   <div id="host" style="display:flex; align-items:center; justify-content:center; position:fixed; inset:0;">
 *     <div id="surface" style="flex:none; width:{W}px; height:{H}px; transform:scale({s}); ...">
 *       ...
 *     </div>
 *   </div>
 *
 * An inline script mirrors the monitor.tsx scale computation:
 *   scale = Math.min(window.innerWidth / profileW, window.innerHeight / profileH)
 * and re-applies it on every resize event.  The computed scale is stored in
 * `data-scale` on #surface so Playwright can observe it without parsing CSS.
 *
 * `opts.withFlexNone` defaults to true (correct state). Pass false to
 * reproduce the original bug (element shrinks to viewport width).
 */
function buildMonitorHtml(
  profileW: number,
  profileH: number,
  opts: { withFlexNone?: boolean } = {},
): string {
  const { withFlexNone = true } = opts;

  // Mirror the exact inline-style properties from monitor.tsx lines 464–482.
  const surfaceFlexProp = withFlexNone ? "flex: none;" : "/* flex:none removed — bug reproduction */";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Reset — same as Tailwind's preflight base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <!--
    #host mirrors:
      className="fixed inset-0 bg-black overflow-hidden flex items-center justify-content-center"
    This is the flex parent that causes Flexbox shrink without flex:none on #surface.
  -->
  <div id="host" style="
    position: fixed;
    inset: 0;
    background: #000;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: none;
  ">
    <!--
      #surface mirrors the inner logical-surface div from monitor.tsx:
        style={{ flex:"none", width: viewportW+"px", height: viewportH+"px",
                 transform: "scale("+scale+")", transformOrigin: "center center",
                 position: "relative", overflow: "hidden" }}

      The critical property is flex:none / flex-shrink:0.  Without it, the
      Flexbox algorithm shrinks #surface from profileW px to the available
      container width before transform:scale() runs.
    -->
    <div id="surface" style="
      ${surfaceFlexProp}
      width: ${profileW}px;
      height: ${profileH}px;
      transform-origin: center center;
      position: relative;
      overflow: hidden;
      background: #000820;
    ">
      <!-- Minimal zone-like content so the element is non-empty -->
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff44;font-family:monospace;font-size:1px">
          ${profileW}×${profileH}
        </span>
      </div>
    </div>
  </div>

  <script>
    const surface = document.getElementById('surface');
    const PROFILE_W = ${profileW};
    const PROFILE_H = ${profileH};

    /**
     * Mirrors monitor.tsx MonitorContentInner updateScale (lines 337-344):
     *   const sx = window.innerWidth  / viewportW;
     *   const sy = window.innerHeight / viewportH;
     *   setScale(Math.min(sx, sy));
     */
    function updateScale() {
      const sx = window.innerWidth  / PROFILE_W;
      const sy = window.innerHeight / PROFILE_H;
      const scale = Math.min(sx, sy);
      surface.style.transform = 'scale(' + scale + ')';
      // Store computed scale for Playwright to observe without CSS parsing
      surface.dataset.scale = String(scale);
    }

    updateScale();
    window.addEventListener('resize', updateScale);
  </script>
</body>
</html>`;
}

// ── Measurement helpers ───────────────────────────────────────────────────────

interface SurfaceMeasurement {
  /** CSS layout width in px — pre-transform.  Must equal profile.width. */
  offsetWidth: number;
  /** CSS layout height in px — pre-transform.  Must equal profile.height. */
  offsetHeight: number;
  /** getComputedStyle().flexShrink — must be "0" when flex:none is set. */
  flexShrink: string;
  /** Resolved flex shorthand value — e.g. "0 0 auto" for flex:none. */
  flexValue: string;
  /** Horizontal scale factor extracted from the CSS transform matrix. */
  scaleX: number;
  /** Vertical scale factor extracted from the CSS transform matrix. */
  scaleY: number;
  /** getBoundingClientRect().width — post-transform rendered width. */
  rectWidth: number;
  /** getBoundingClientRect().height — post-transform rendered height. */
  rectHeight: number;
  /** Scale stored in data-scale by the inline script for easy access. */
  dataScale: number;
}

async function measureSurface(page: Page): Promise<SurfaceMeasurement> {
  return page.evaluate(() => {
    const el = document.getElementById("surface")!;
    const style = getComputedStyle(el);
    const transform = style.transform;

    // Parse CSS matrix: matrix(scaleX, skewY, skewX, scaleY, tx, ty)
    // transform:scale(s) → matrix(s, 0, 0, s, 0, 0)
    let scaleX = 1, scaleY = 1;
    const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/);
    if (matrixMatch) {
      const parts = matrixMatch[1].split(",").map((s) => parseFloat(s.trim()));
      scaleX = parts[0];   // a — horizontal scale
      scaleY = parts[3];   // d — vertical scale
    }

    const rect = el.getBoundingClientRect();
    return {
      offsetWidth:  el.offsetWidth,
      offsetHeight: el.offsetHeight,
      flexShrink:   style.flexShrink,
      flexValue:    style.flex,
      scaleX,
      scaleY,
      rectWidth:    rect.width,
      rectHeight:   rect.height,
      dataScale:    parseFloat((el as HTMLElement).dataset["scale"] || "1"),
    };
  });
}

// ── Core assertions ───────────────────────────────────────────────────────────

function assertLogicalGeometry(
  m: SurfaceMeasurement,
  profile: Profile,
  label: string,
) {
  // 1. Pre-transform layout dimensions equal profile dims exactly.
  //    If flex-shrink is enabled, offsetWidth collapses to viewport width.
  expect(m.offsetWidth,  `[${label}] offsetWidth must equal profile.width`).toBe(profile.width);
  expect(m.offsetHeight, `[${label}] offsetHeight must equal profile.height`).toBe(profile.height);

  // 2. flex-shrink must be "0" (flex:none expands to flex-grow:0 flex-shrink:0 flex-basis:auto)
  expect(m.flexShrink, `[${label}] flexShrink must be "0" — flex:none must be applied`).toBe("0");

  // 3. Scale must be uniform (scaleX === scaleY within float rounding)
  expect(Math.abs(m.scaleX - m.scaleY)).toBeLessThan(
    0.001,
    `[${label}] transform must be uniform scale — scaleX (${m.scaleX.toFixed(6)}) ≠ scaleY (${m.scaleY.toFixed(6)})`,
  );

  // 4. Post-transform bounding rect must preserve the profile's aspect ratio
  //    (within 0.5 % — browser sub-pixel rounding)
  if (m.rectWidth > 0 && m.rectHeight > 0) {
    const renderedRatio = m.rectWidth  / m.rectHeight;
    const profileRatio  = profile.width / profile.height;
    expect(Math.abs(renderedRatio - profileRatio)).toBeLessThan(
      0.005,
      `[${label}] rendered aspect ratio ${renderedRatio.toFixed(4)} must match profile ratio ${profileRatio.toFixed(4)}`,
    );
  }

  // 5. Scale stored in data-scale is consistent with what CSS reports
  expect(Math.abs(m.dataScale - m.scaleX)).toBeLessThan(
    0.001,
    `[${label}] data-scale (${m.dataScale}) must match CSS scaleX (${m.scaleX})`,
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe("Monitor logical surface geometry — real browser", () => {

  // ── Profile × viewport matrix ──────────────────────────────────────────────

  for (const profile of PROFILES) {
    test.describe(profile.name, () => {
      for (const vp of VIEWPORTS) {
        const label = `${profile.name} @ ${vp.label}`;

        test(`${vp.label}: offsetW=${profile.width} offsetH=${profile.height}, flex-shrink=0, uniform scale, correct aspect ratio`, async ({ page }) => {
          // Set viewport before setContent so the inline script measures the
          // correct window.innerWidth/innerHeight from the start.
          await page.setViewportSize({ width: vp.width, height: vp.height });

          const html = buildMonitorHtml(profile.width, profile.height);
          await page.setContent(html, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("#surface");

          const m = await measureSurface(page);
          assertLogicalGeometry(m, profile, label);

          // Additional: scale must be ≤ 1.0 when tile is smaller than profile.
          //   (If the viewport is larger than the profile, scale > 1.0 is valid.)
          const expectedScale = Math.min(vp.width / profile.width, vp.height / profile.height);
          expect(Math.abs(m.dataScale - expectedScale)).toBeLessThan(
            0.001,
            `[${label}] scale must be min(vpW/profW, vpH/profH) = ${expectedScale.toFixed(4)}, got ${m.dataScale.toFixed(4)}`,
          );
        });
      }
    });
  }

  // ── Bug regression: without flex:none the surface IS shrunk ───────────────

  test.describe("BUG REGRESSION: flex:none is load-bearing", () => {

    test("with flex:none: 1920px surface fits inside 525px tile without shrinking", async ({ page }) => {
      await page.setViewportSize({ width: 525, height: 268 });
      const html = buildMonitorHtml(1920, 1080, { withFlexNone: true });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#surface");

      const m = await measureSurface(page);

      // Logical dims preserved — flex:none holds the 1920px declaration
      expect(m.offsetWidth).toBe(1920);
      expect(m.offsetHeight).toBe(1080);
      expect(m.flexShrink).toBe("0");
    });

    test("WITHOUT flex:none: layout engine shrinks 1920px surface to viewport width (original bug)", async ({ page }) => {
      // This test intentionally uses the broken CSS to prove that flex:none
      // is not redundant — remove it and the bug immediately reappears.
      await page.setViewportSize({ width: 525, height: 268 });
      const html = buildMonitorHtml(1920, 1080, { withFlexNone: false });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#surface");

      const m = await measureSurface(page);

      // Without flex:none, Flexbox shrinks the 1920px item to the container width.
      // The element must be narrower than its declared 1920px.
      expect(m.offsetWidth).toBeLessThan(
        1920,
        `Without flex:none, offsetWidth (${m.offsetWidth}) should be less than 1920 — the bug must be reproducible`,
      );
      // The shrunk width should be ≤ the viewport width (Flexbox clamps to container)
      expect(m.offsetWidth).toBeLessThanOrEqual(
        525,
        `Without flex:none, offsetWidth should be ≤ viewport width (525 px), got ${m.offsetWidth}`,
      );
      // flexShrink must NOT be "0" in this case
      expect(m.flexShrink).not.toBe(
        "0",
        `Without flex:none, flexShrink should be "1" (default), not "0"`,
      );
    });

    test("portrait 1080×1920 without flex:none: portrait surface shrinks in landscape 525×268 tile", async ({ page }) => {
      await page.setViewportSize({ width: 525, height: 268 });
      const html = buildMonitorHtml(1080, 1920, { withFlexNone: false });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#surface");

      const m = await measureSurface(page);

      // Portrait surface (1080px wide) is also shrunk without flex:none
      expect(m.offsetWidth).toBeLessThan(
        1080,
        `Without flex:none, portrait offsetWidth (${m.offsetWidth}) should be less than 1080`,
      );
    });
  });

  // ── Resize: only scale changes, logical dims stay fixed ───────────────────

  test.describe("Window resize — scale changes, logical dims stay fixed", () => {

    test("1920×1080 profile: resize from 1920×1080 to 960×540 halves scale, keeps logical dims", async ({ page }) => {
      // Start at full-HD viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      const html = buildMonitorHtml(1920, 1080);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#surface");

      const before = await measureSurface(page);
      // At full-HD, scale ≈ 1.0
      expect(before.offsetWidth).toBe(1920);
      expect(before.offsetHeight).toBe(1080);
      const initialScale = before.dataScale;
      expect(Math.abs(initialScale - 1.0)).toBeLessThan(0.001);

      // Resize to half (simulates Multiview tile shrinking on window resize)
      await page.setViewportSize({ width: 960, height: 540 });

      // Wait for the resize listener to fire and update data-scale
      await page.waitForFunction(
        (prevScale: number) => {
          const el = document.getElementById("surface");
          if (!el) return false;
          const s = parseFloat((el as HTMLElement).dataset["scale"] || "1");
          return Math.abs(s - prevScale) > 0.1; // scale must have changed noticeably
        },
        initialScale,
        { timeout: 2000 },
      );

      const after = await measureSurface(page);

      // Logical dims unchanged after resize
      expect(after.offsetWidth,  "offsetWidth unchanged after resize").toBe(1920);
      expect(after.offsetHeight, "offsetHeight unchanged after resize").toBe(1080);

      // Scale halved
      expect(Math.abs(after.dataScale - 0.5)).toBeLessThan(
        0.002,
        `Scale after halving viewport should be ≈ 0.5, got ${after.dataScale}`,
      );

      // flex-shrink still "0" after resize
      expect(after.flexShrink).toBe("0");
    });

    test("portrait 1080×1920: resize from 1920×1080 to 525×268 — portrait dims survive extreme shrink", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      const html = buildMonitorHtml(1080, 1920);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#surface");

      const before = await measureSurface(page);
      expect(before.offsetWidth).toBe(1080);
      expect(before.offsetHeight).toBe(1920);
      const initialScale = before.dataScale;

      // Resize to extreme small tile
      await page.setViewportSize({ width: 525, height: 268 });
      await page.waitForFunction(
        (prev: number) => {
          const el = document.getElementById("surface");
          if (!el) return false;
          return Math.abs(parseFloat((el as HTMLElement).dataset["scale"] || "1") - prev) > 0.05;
        },
        initialScale,
        { timeout: 2000 },
      );

      const after = await measureSurface(page);
      expect(after.offsetWidth,  "portrait offsetWidth unchanged").toBe(1080);
      expect(after.offsetHeight, "portrait offsetHeight unchanged").toBe(1920);

      // Expected scale after shrink: min(525/1080, 268/1920) ≈ min(0.486, 0.140) = 0.140
      const expectedScale = Math.min(525 / 1080, 268 / 1920);
      expect(Math.abs(after.dataScale - expectedScale)).toBeLessThan(
        0.002,
        `Portrait scale after small tile resize should be ≈ ${expectedScale.toFixed(3)}, got ${after.dataScale.toFixed(3)}`,
      );
    });

    test("canvas profile 3840×1080: resize from 1920×1080 to 320×180 — ultra-wide dims survive", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      const html = buildMonitorHtml(3840, 1080);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#surface");

      const before = await measureSurface(page);
      expect(before.offsetWidth).toBe(3840);
      expect(before.offsetHeight).toBe(1080);
      const initialScale = before.dataScale;

      await page.setViewportSize({ width: 320, height: 180 });
      await page.waitForFunction(
        (prev: number) => {
          const el = document.getElementById("surface");
          if (!el) return false;
          return Math.abs(parseFloat((el as HTMLElement).dataset["scale"] || "1") - prev) > 0.05;
        },
        initialScale,
        { timeout: 2000 },
      );

      const after = await measureSurface(page);
      expect(after.offsetWidth,  "ultra-wide offsetWidth unchanged").toBe(3840);
      expect(after.offsetHeight, "ultra-wide offsetHeight unchanged").toBe(1080);

      // scale = min(320/3840, 180/1080) ≈ min(0.083, 0.167) = 0.083
      const expectedScale = Math.min(320 / 3840, 180 / 1080);
      expect(Math.abs(after.dataScale - expectedScale)).toBeLessThan(
        0.002,
        `Ultra-wide scale should be ≈ ${expectedScale.toFixed(4)}, got ${after.dataScale.toFixed(4)}`,
      );
    });
  });

  // ── Aspect ratio preservation at all densities ────────────────────────────

  test.describe("Aspect ratio preserved at all densities", () => {
    const RATIO_PROFILES = [
      { name: "16:9 landscape",  width: 1920, height: 1080, expectedRatio: 16 / 9 },
      { name: "9:16 portrait",   width: 1080, height: 1920, expectedRatio: 9  / 16 },
      { name: "1:1 square",      width: 1080, height: 1080, expectedRatio: 1 },
      { name: "32:9 ultra-wide", width: 3840, height: 1080, expectedRatio: 32 / 9 },
    ];

    for (const rp of RATIO_PROFILES) {
      // Test at a tile size that requires shrinking — the pre-transform dims
      // must still yield the correct aspect ratio via getBoundingClientRect().
      test(`${rp.name}: rendered bounding rect preserves ${rp.name} ratio at 525×268 tile`, async ({ page }) => {
        await page.setViewportSize({ width: 525, height: 268 });
        const html = buildMonitorHtml(rp.width, rp.height);
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#surface");

        const m = await measureSurface(page);

        // Pre-transform dims correct
        expect(m.offsetWidth).toBe(rp.width);
        expect(m.offsetHeight).toBe(rp.height);

        // Post-transform bounding rect preserves ratio (within 0.5% rounding)
        if (m.rectWidth > 0 && m.rectHeight > 0) {
          const renderedRatio = m.rectWidth / m.rectHeight;
          expect(Math.abs(renderedRatio - rp.expectedRatio)).toBeLessThan(
            0.005,
            `${rp.name}: rendered ratio ${renderedRatio.toFixed(4)} should match expected ${rp.expectedRatio.toFixed(4)}`,
          );
        }
      });
    }
  });
});

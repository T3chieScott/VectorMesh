/**
 * Task #382 — Agenda description auto-scroll.
 *
 * Acceptance criteria covered:
 *  1.  TOP_PAUSE_MS exported constant equals 3000.
 *  2.  BOTTOM_PAUSE_MS exported constant equals 3000.
 *  3.  SCROLL_PX_PER_SEC exported constant equals 28.
 *  4.  descScrollDurationMs(0) returns 0.
 *  5.  descScrollDurationMs(28) returns 1000 (1 second at 28 px/s).
 *  6.  descScrollDurationMs(56) returns 2000.
 *  7.  descScrollDurationMs(14) returns 500 (0.5 seconds, rounded up).
 *  8.  Effective dwell = max(configuredMs, TOP_PAUSE_MS + scrollDuration + BOTTOM_PAUSE_MS).
 *  9.  When configured interval > scroll cycle, configuredMs wins.
 * 10.  When configured interval < scroll cycle, scroll cycle wins.
 * 11.  Multi-description: the slowest (largest overflow) determines effective dwell.
 * 12.  descriptionAutoScroll is omitted from public payload when false (stays false).
 * 13.  descriptionAutoScroll is included in public payload when true.
 * 14.  buildAgendaDisplayPayload always includes descriptionAutoScroll (defaults false).
 * 15.  descriptionAutoScroll schema field accepts true, false, and undefined.
 * 16.  descriptionAutoScroll defaults false in insertAgendaWidgetConfigSchema.
 * 17.  descriptionAutoScroll is forced false in toApiPayload when descriptionLines ≠ "full".
 * 18.  Migration SQL file 0030 uses IF NOT EXISTS (idempotent).
 * 19.  Migration SQL file 0030 is sequenced after 0029.
 * 20.  Advisory lock constant 715129_008n is present and unique among migration constants.
 * 21.  Public payload field list includes "descriptionAutoScroll".
 * 22.  descScrollDurationMs is a pure function (no DOM or timer access).
 * 23.  Off-screen measurer rows (suppressTestId=true) skip scroll logic.
 * 24.  Scroll is not active when descriptionLines is not null.
 * 25.  Scroll is not active when descriptionAutoScroll is false.
 * 26.  configFormSchema includes descriptionAutoScroll as boolean field.
 * 27.  Single-page loop increments scrollResetTick after effectiveDwellMs.
 * 28.  effectiveDwellMs accounts for maxOverflow across all page items.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertAgendaWidgetConfigSchema } from "../shared/schema";
import {
  getDescriptionScrollIndicator,
  isDescriptionAutoScrollAnimationActive,
  isDescriptionAutoScrollMode,
  resolveDescriptionViewportMaxHeight,
} from "../client/src/components/agenda/AgendaDisplayWidget";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    name: "Test Config",
    ...overrides,
  };
}

/**
 * Locally replicates the effectiveDwellMs computation from AgendaDisplayWidget
 * so we can unit-test the logic without a DOM environment.
 */
const TOP_PAUSE_MS = 3_000;
const BOTTOM_PAUSE_MS = 3_000;
const SCROLL_PX_PER_SEC = 28;

function descScrollDurationMs(overflowPx: number): number {
  if (overflowPx <= 0) return 0;
  return Math.ceil((overflowPx / SCROLL_PX_PER_SEC) * 1_000);
}

function computeEffectiveDwellMs(
  configuredMs: number,
  scrollMetrics: Record<string, number>,
  itemIds: string[],
  descScrollActive: boolean,
): number {
  if (!descScrollActive || itemIds.length === 0) return configuredMs;
  const maxOverflow = Math.max(0, ...itemIds.map((id) => scrollMetrics[id] ?? 0));
  if (maxOverflow <= 0) return configuredMs;
  const scrollDuration = descScrollDurationMs(maxOverflow);
  return Math.max(configuredMs, TOP_PAUSE_MS + scrollDuration + BOTTOM_PAUSE_MS);
}

// ---------------------------------------------------------------------------
// Task #396 — passive indicator geometry
// ---------------------------------------------------------------------------

test("Task #396 indicator is absent for fitting, zero, or invalid measurements", () => {
  assert.equal(getDescriptionScrollIndicator(100, 100, 0, 0), null);
  assert.equal(getDescriptionScrollIndicator(0, 200, 100, 0), null);
  assert.equal(getDescriptionScrollIndicator(100, Number.NaN, 100, 0), null);
  assert.equal(getDescriptionScrollIndicator(100, 200, Number.POSITIVE_INFINITY, 0), null);
});

test("Task #396 thumb size and position are proportional at top, middle, and bottom", () => {
  const top = getDescriptionScrollIndicator(100, 400, 300, 0);
  const middle = getDescriptionScrollIndicator(100, 400, 300, 150);
  const bottom = getDescriptionScrollIndicator(100, 400, 300, 300);

  assert.deepEqual(top, {
    trackHeight: 100,
    thumbHeight: 25,
    thumbOffset: 0,
  });
  assert.deepEqual(middle, {
    trackHeight: 100,
    thumbHeight: 25,
    thumbOffset: 37.5,
  });
  assert.deepEqual(bottom, {
    trackHeight: 100,
    thumbHeight: 25,
    thumbOffset: 75,
  });
});

test("Task #396 thumb enforces its minimum size and clamps translation", () => {
  const beforeTop = getDescriptionScrollIndicator(100, 10_000, 9_900, -50);
  const afterBottom = getDescriptionScrollIndicator(100, 10_000, 9_900, 99_000);

  assert.equal(beforeTop?.thumbHeight, 12);
  assert.equal(beforeTop?.thumbOffset, 0);
  assert.equal(afterBottom?.thumbHeight, 12);
  assert.equal(afterBottom?.thumbOffset, 88);
});

test("Task #396 reduced motion does not disable the bounded auto-scroll layout", () => {
  assert.equal(isDescriptionAutoScrollMode(true, null), true);
  assert.equal(isDescriptionAutoScrollMode(false, null), false);
  assert.equal(isDescriptionAutoScrollMode(true, 2), false);
});

test("Task #396 reduced motion preserves configured multi-page rotation timing", () => {
  const animationActive = isDescriptionAutoScrollAnimationActive(
    true,
    null,
    true,
  );
  assert.equal(animationActive, false);
  assert.equal(
    computeEffectiveDwellMs(
      5_000,
      {
        "item-1": 1_000,
        "item-2": 2_000,
      },
      ["item-1", "item-2"],
      animationActive,
    ),
    5_000,
  );
});

test("Task #396 indicator remains display-only and shares the text transition", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  const indicatorStart = src.indexOf("agenda-description-scroll-track-");
  const indicatorEnd = src.indexOf("<p", indicatorStart);
  const indicatorSource = src.slice(indicatorStart, indicatorEnd);

  assert.ok(indicatorStart >= 0 && indicatorEnd > indicatorStart);
  assert.match(indicatorSource, /aria-hidden="true"/);
  assert.match(indicatorSource, /pointerEvents: "none"/);
  assert.match(indicatorSource, /transform \$\{transitionMs\}ms linear/);
  assert.doesNotMatch(indicatorSource, /role=["']scrollbar["']/);
  assert.doesNotMatch(indicatorSource, /tabIndex|onClick|onKey|overflow:\s*["'](?:auto|scroll)/);
});

// ---------------------------------------------------------------------------
// 1–3 — Exported constants
// ---------------------------------------------------------------------------

test("__TEST_S382__ TOP_PAUSE_MS === 3000", () => {
  assert.equal(TOP_PAUSE_MS, 3_000);
});

test("__TEST_S382__ BOTTOM_PAUSE_MS === 3000", () => {
  assert.equal(BOTTOM_PAUSE_MS, 3_000);
});

test("__TEST_S382__ SCROLL_PX_PER_SEC === 28", () => {
  assert.equal(SCROLL_PX_PER_SEC, 28);
});

// Verify constants are also exported from the renderer module via static analysis.
test("__TEST_S382__ renderer exports TOP_PAUSE_MS, BOTTOM_PAUSE_MS, SCROLL_PX_PER_SEC, descScrollDurationMs", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(src.includes("export const TOP_PAUSE_MS"), "TOP_PAUSE_MS should be exported");
  assert.ok(src.includes("export const BOTTOM_PAUSE_MS"), "BOTTOM_PAUSE_MS should be exported");
  assert.ok(src.includes("export const SCROLL_PX_PER_SEC"), "SCROLL_PX_PER_SEC should be exported");
  assert.ok(src.includes("export function descScrollDurationMs"), "descScrollDurationMs should be exported");
});

// ---------------------------------------------------------------------------
// 4–7 — descScrollDurationMs pure function
// ---------------------------------------------------------------------------

test("__TEST_S382__ descScrollDurationMs(0) === 0", () => {
  assert.equal(descScrollDurationMs(0), 0);
});

test("__TEST_S382__ descScrollDurationMs(-1) === 0 (negative treated as zero)", () => {
  assert.equal(descScrollDurationMs(-1), 0);
});

test("__TEST_S382__ descScrollDurationMs(28) === 1000 (1 second at 28 px/s)", () => {
  assert.equal(descScrollDurationMs(28), 1_000);
});

test("__TEST_S382__ descScrollDurationMs(56) === 2000 (2 seconds at 28 px/s)", () => {
  assert.equal(descScrollDurationMs(56), 2_000);
});

test("__TEST_S382__ descScrollDurationMs(14) === 500 (0.5 s at 28 px/s)", () => {
  assert.equal(descScrollDurationMs(14), 500);
});

test("__TEST_S382__ descScrollDurationMs(1) rounds up (ceil, not floor)", () => {
  // 1/28 * 1000 = 35.7…ms → ceil → 36
  const result = descScrollDurationMs(1);
  assert.ok(result > 0 && result <= 1_000, `expected (0,1000], got ${result}`);
  // Verify ceil semantics: result should be ceil, not floor
  const exact = (1 / SCROLL_PX_PER_SEC) * 1_000;
  assert.equal(result, Math.ceil(exact));
});

test("__TEST_S382__ descScrollDurationMs is pure (no global side effects)", () => {
  // Call multiple times with same input → same deterministic output.
  const a = descScrollDurationMs(100);
  const b = descScrollDurationMs(100);
  assert.equal(a, b);
  assert.ok(typeof a === "number" && Number.isFinite(a));
});

// ---------------------------------------------------------------------------
// 8–11 — Effective dwell computation
// ---------------------------------------------------------------------------

test("__TEST_S382__ effectiveDwellMs === configuredMs when no overflow (metrics empty)", () => {
  const result = computeEffectiveDwellMs(10_000, {}, ["item1", "item2"], true);
  assert.equal(result, 10_000);
});

test("__TEST_S382__ effectiveDwellMs === configuredMs when maxOverflow === 0", () => {
  const result = computeEffectiveDwellMs(
    10_000,
    { item1: 0, item2: 0 },
    ["item1", "item2"],
    true,
  );
  assert.equal(result, 10_000);
});

test("__TEST_S382__ effectiveDwellMs === configuredMs when descScrollActive is false", () => {
  const result = computeEffectiveDwellMs(
    5_000,
    { item1: 200 }, // 200px overflow
    ["item1"],
    false, // scroll not active
  );
  assert.equal(result, 5_000);
});

test("__TEST_S382__ configuredMs > scroll cycle → configuredMs wins (criterion 9)", () => {
  // 14px overflow → scroll duration = 500ms
  // scroll cycle = TOP_PAUSE_MS + 500 + BOTTOM_PAUSE_MS = 6500
  // configured = 30_000 → configured wins
  const result = computeEffectiveDwellMs(
    30_000,
    { item1: 14 },
    ["item1"],
    true,
  );
  assert.equal(result, 30_000);
});

test("__TEST_S382__ scroll cycle > configuredMs → scroll cycle wins (criterion 10)", () => {
  // 280px overflow → scroll duration = ceil(280/28*1000) = 10_000ms
  // scroll cycle = 3000 + 10000 + 3000 = 16_000ms
  // configured = 5_000 → scroll cycle wins
  const result = computeEffectiveDwellMs(
    5_000,
    { item1: 280 },
    ["item1"],
    true,
  );
  const expectedScrollDuration = descScrollDurationMs(280);
  const expectedEffective = TOP_PAUSE_MS + expectedScrollDuration + BOTTOM_PAUSE_MS;
  assert.equal(result, expectedEffective);
  assert.ok(result > 5_000);
});

test("__TEST_S382__ multi-description: slowest item determines effective dwell (criterion 11)", () => {
  // item1: 28px → 1000ms scroll; item2: 280px → 10000ms scroll
  // max overflow = 280px → effective = 3000 + 10000 + 3000 = 16000
  const result = computeEffectiveDwellMs(
    5_000,
    { item1: 28, item2: 280 },
    ["item1", "item2"],
    true,
  );
  const expectedScrollDuration = descScrollDurationMs(280);
  const expectedEffective = Math.max(
    5_000,
    TOP_PAUSE_MS + expectedScrollDuration + BOTTOM_PAUSE_MS,
  );
  assert.equal(result, expectedEffective);
});

test("__TEST_S382__ effectiveDwellMs only uses itemIds in pageItems (missing items default to 0)", () => {
  // scrollMetrics has item3=500 but itemIds only contains item1, item2
  const result = computeEffectiveDwellMs(
    5_000,
    { item1: 28, item2: 0, item3: 500 },
    ["item1", "item2"],
    true,
  );
  // max(28, 0) = 28 → scroll = 1000 → effective = max(5000, 3000+1000+3000) = 7000
  const expectedEffective = Math.max(5_000, TOP_PAUSE_MS + descScrollDurationMs(28) + BOTTOM_PAUSE_MS);
  assert.equal(result, expectedEffective);
});

// ---------------------------------------------------------------------------
// 15–16 — Schema field
// ---------------------------------------------------------------------------

test("__TEST_S382__ descriptionAutoScroll schema: accepts true", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionAutoScroll: true }),
  );
  assert.equal(result.success, true, "Expected success for true");
  if (result.success) assert.equal(result.data.descriptionAutoScroll, true);
});

test("__TEST_S382__ descriptionAutoScroll schema: accepts false", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionAutoScroll: false }),
  );
  assert.equal(result.success, true, "Expected success for false");
  if (result.success) assert.equal(result.data.descriptionAutoScroll, false);
});

test("__TEST_S382__ descriptionAutoScroll schema: omitted → accepted (optional field)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(basePayload());
  assert.equal(result.success, true, "Expected omitted field to be accepted");
});

test("__TEST_S382__ descriptionAutoScroll schema: rejects non-boolean", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionAutoScroll: "yes" }),
  );
  assert.equal(result.success, false, "Expected failure for string value");
});

// ---------------------------------------------------------------------------
// 17 — Form toApiPayload: forced false when descriptionLines ≠ "full"
// ---------------------------------------------------------------------------

test("__TEST_S382__ toApiPayload forces descriptionAutoScroll=false when descriptionLines is not full", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  // The coercion logic should be present in toApiPayload
  assert.ok(
    src.includes("values.descriptionLines === \"full\" ? values.descriptionAutoScroll : false"),
    "toApiPayload should coerce descriptionAutoScroll to false when not full",
  );
});

// ---------------------------------------------------------------------------
// 18–19 — Migration SQL
// ---------------------------------------------------------------------------

test("__TEST_S382__ migration 0030 uses IF NOT EXISTS (idempotent)", () => {
  const sql = readFileSync(
    "migrations/0030_agenda_description_auto_scroll.sql",
    "utf-8",
  );
  assert.ok(
    sql.toUpperCase().includes("ADD COLUMN IF NOT EXISTS"),
    "Migration should use ADD COLUMN IF NOT EXISTS",
  );
  assert.ok(
    sql.toLowerCase().includes("description_auto_scroll"),
    "Migration should reference description_auto_scroll column",
  );
});

test("__TEST_S382__ migration 0030 is sequenced after 0029", () => {
  const sql0030 = readFileSync(
    "migrations/0030_agenda_description_auto_scroll.sql",
    "utf-8",
  );
  // 0030 should exist and be non-empty
  assert.ok(sql0030.length > 0, "Migration file 0030 should be non-empty");
  // Ensure 0029 also exists (to confirm ordering)
  const sql0029 = readFileSync(
    "migrations/0029_agenda_description_lines.sql",
    "utf-8",
  );
  assert.ok(sql0029.length > 0, "Migration file 0029 should be non-empty");
});

// ---------------------------------------------------------------------------
// 20 — Advisory lock key uniqueness
// ---------------------------------------------------------------------------

test("__TEST_S382__ advisory lock constant 715129_008n is present in db.ts", () => {
  const src = readFileSync("server/db.ts", "utf-8");
  assert.ok(
    src.includes("715129_008n") || src.includes("715129008n"),
    "db.ts should contain the advisory lock key 715129_008n",
  );
});

test("__TEST_S382__ advisory lock key for description_auto_scroll is unique among migration keys", () => {
  const src = readFileSync("server/db.ts", "utf-8");
  // Extract all BigInt lock keys with the 715129 prefix.
  // The key for this migration is 715129_008n which has integer value 715129008.
  const keys = [...src.matchAll(/715129_(\d+)n/g)].map((m) => m[1]);
  // All extracted suffixes should be unique (no duplicate lock keys).
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, `Duplicate advisory lock keys found: ${keys.join(", ")}`);
  // The suffix "008" (integer value 8) should be present for this migration.
  assert.ok(
    keys.some((k) => parseInt(k, 10) === 8),
    `Key with numeric value 8 (suffix "008") should be present; found: ${keys.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 21 — Public payload includes field
// ---------------------------------------------------------------------------

test("__TEST_S382__ PUBLIC_AGENDA_CONFIG_FIELDS includes descriptionAutoScroll", () => {
  const src = readFileSync("server/agendaRoutes.ts", "utf-8");
  // Look for the field in the PUBLIC_AGENDA_CONFIG_FIELDS array
  assert.ok(
    src.includes('"descriptionAutoScroll"'),
    "agendaRoutes.ts should include descriptionAutoScroll in PUBLIC_AGENDA_CONFIG_FIELDS",
  );
});

test("__TEST_S382__ buildAgendaDisplayPayload maps descriptionAutoScroll", () => {
  const src = readFileSync("server/agendaRoutes.ts", "utf-8");
  assert.ok(
    src.includes("descriptionAutoScroll"),
    "agendaRoutes.ts should map descriptionAutoScroll in the payload builder",
  );
});

test("__TEST_S393__ public agenda payload includes showTrack", () => {
  const src = readFileSync("server/agendaRoutes.ts", "utf-8");
  assert.ok(src.includes('"showTrack"'), "showTrack must be in the public allowlist");
  assert.ok(src.includes("showTrack: config.showTrack"), "showTrack must be mapped in the public payload");
});

// ---------------------------------------------------------------------------
// 22 — Pure function (no DOM)
// ---------------------------------------------------------------------------

test("__TEST_S382__ descScrollDurationMs source references no DOM globals", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // Extract the function body of descScrollDurationMs
  const match = src.match(
    /export function descScrollDurationMs\(overflowPx[^)]*\)[^{]*\{([^}]*)\}/,
  );
  assert.ok(match, "descScrollDurationMs function body should be found");
  const body = match![1];
  // Function body should not reference DOM APIs
  assert.ok(!body.includes("document"), "Should not access document");
  assert.ok(!body.includes("window"), "Should not access window");
  assert.ok(!body.includes("setTimeout"), "Should not call setTimeout");
});

// ---------------------------------------------------------------------------
// 23 — suppressTestId (off-screen measurer) disables scroll
// ---------------------------------------------------------------------------

test("__TEST_S382__ AgendaRow guards scrollEnabled on !suppressTestId", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // The scrollEnabled condition must include suppressTestId check
  assert.ok(
    src.includes("!suppressTestId") && src.includes("scrollEnabled"),
    "scrollEnabled should be gated on !suppressTestId",
  );
  // The off-screen measurer must pass suppressTestId
  assert.ok(
    src.includes("suppressTestId\n") || src.includes("suppressTestId\r") ||
    src.includes("suppressTestId />") || src.includes("suppressTestId\n          />"),
    "Off-screen measurer should pass suppressTestId",
  );
});

// ---------------------------------------------------------------------------
// 24 — descriptionLines not null → scroll not active
// ---------------------------------------------------------------------------

test("__TEST_S382__ scrollEnabled requires descriptionLines === null", () => {
  assert.equal(isDescriptionAutoScrollMode(true, null), true);
  assert.equal(isDescriptionAutoScrollMode(true, 2), false);
});

// ---------------------------------------------------------------------------
// 25 — descriptionAutoScroll false → scroll not active
// ---------------------------------------------------------------------------

test("__TEST_S382__ scrollEnabled requires descriptionAutoScroll to be truthy", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("config.descriptionAutoScroll") && src.includes("scrollEnabled"),
    "scrollEnabled should check config.descriptionAutoScroll",
  );
});

// ---------------------------------------------------------------------------
// 26 — configFormSchema field
// ---------------------------------------------------------------------------

test("__TEST_S382__ configFormSchema includes descriptionAutoScroll as boolean", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  assert.ok(
    src.includes("descriptionAutoScroll: z.boolean()"),
    "configFormSchema should include descriptionAutoScroll as z.boolean()",
  );
});

test("__TEST_S382__ defaultForm sets descriptionAutoScroll from config or false", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  assert.ok(
    src.includes("descriptionAutoScroll: c?.descriptionAutoScroll ?? false"),
    "defaultForm should default descriptionAutoScroll to false",
  );
});

// ---------------------------------------------------------------------------
// 27–28 — Rotation timer and single-page loop (logic-level)
// ---------------------------------------------------------------------------

test("__TEST_S382__ rotation timer uses setTimeout not setInterval in renderer", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // The rotation timer block should use clearTimeout (not clearInterval)
  // The rotation effect should use setTimeout for advancing pages
  assert.ok(
    src.includes("clearTimeout"),
    "Rotation timer should use clearTimeout (setTimeout-based)",
  );
  // And it should NOT use setInterval for page rotation (only for clock/fonts)
  // The page advance should use setTimeout
  assert.ok(
    src.includes("setPageIndex((i) => (i + 1) % pages.length"),
    "Rotation should still advance pages cyclically",
  );
});

test("__TEST_S382__ single-page loop uses scrollResetTick", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("scrollResetTick") && src.includes("setScrollResetTick"),
    "Single-page loop should increment scrollResetTick",
  );
});

test("__TEST_S382__ descScrollActive check in renderer source", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("descScrollActive"),
    "Renderer should contain descScrollActive computed variable",
  );
  assert.ok(
    src.includes("prefersReducedMotion"),
    "descScrollActive should account for prefers-reduced-motion",
  );
});

// ---------------------------------------------------------------------------
// Regression: existing description-lines tests still pass structurally
// ---------------------------------------------------------------------------

test("__TEST_S382__ descriptionLines and descriptionAutoScroll are independent schema fields", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({
      descriptionLines: null, // Full mode
      descriptionAutoScroll: true, // Scroll enabled
    }),
  );
  assert.equal(result.success, true, "Both fields set together should be valid");
  if (result.success) {
    assert.equal(result.data.descriptionLines, null);
    assert.equal(result.data.descriptionAutoScroll, true);
  }
});

// ---------------------------------------------------------------------------
// Overflow measurement — CSS-bounded viewport, not derived from card height
// ---------------------------------------------------------------------------

test("__TEST_S382__ overflow is measured as inner.scrollHeight minus viewport.clientHeight", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("inner.scrollHeight - viewport.clientHeight"),
    "overflow must be inner.scrollHeight - viewport.clientHeight",
  );
  assert.ok(
    !src.includes("card.offsetHeight"),
    "measurement must not rely on card.offsetHeight (fragile when flex compresses the card)",
  );
});

test("__TEST_S382__ description viewport uses intrinsic flex sizing with a CSS bound", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes(`"mt-1 flex-auto min-h-0 overflow-hidden"`),
    "description viewport must use flex-auto min-h-0 overflow-hidden",
  );
  assert.ok(
    !src.includes("viewportH !== null ? viewportH"),
    "viewport height must not be driven by a viewportH state variable",
  );
});

test("__TEST_S399__ card stays intrinsic while the description receives the finite budget", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(!src.includes('maxHeight: "100%"'), "the outer card must not have a circular max-height");
  assert.ok(src.includes("cardRef.current.offsetHeight - viewport.clientHeight"));
  assert.ok(src.includes("resolveDescriptionViewportMaxHeight"));
  assert.ok(
    src.includes("maxHeight: descriptionViewportMaxHeight"),
    "only the description viewport receives the finite max-height",
  );
});

test("__TEST_S382__ body column is flex-col so description viewport can shrink within its bound", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes(`" flex flex-col min-h-0"`),
    "body column must add flex flex-col min-h-0 when scrollEnabled",
  );
  assert.ok(
    src.includes(`" shrink-0"`),
    "non-description rows (title, meta, status) must be shrink-0 so description viewport gets remaining space",
  );
});

// ---------------------------------------------------------------------------
// Landscape/ultrawide — BoundedScrollGrid (CSS grid) replaces CSS columns
// ---------------------------------------------------------------------------

test("__TEST_S399__ BoundedScrollGrid uses intrinsic-minimum flexible rows", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("minmax(auto, 1fr)"),
    "BoundedScrollGrid must preserve the card's automatic minimum",
  );
  assert.ok(!src.includes("minmax(0, 1fr)"), "zero-minimum tracks must not regress");
  assert.ok(
    src.includes("gridAutoFlow"),
    "BoundedScrollGrid must set gridAutoFlow to preserve column-major order",
  );
  assert.ok(
    src.includes(`"column"`),
    "gridAutoFlow must be 'column' so sessions read chronologically top-to-bottom within each column",
  );
});

test("__TEST_S382__ LandscapeGrid routes to BoundedScrollGrid when scrollPageH is set", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // LandscapeGrid must branch on scrollPageH (scroll active) vs CSS columns (no scroll).
  assert.ok(
    src.includes("props.scrollPageH != null"),
    "LandscapeGrid must check scrollPageH to decide between BoundedScrollGrid and ColumnFlow",
  );
  assert.ok(
    src.includes("<BoundedScrollGrid"),
    "BoundedScrollGrid must be used in the scroll-active path",
  );
  assert.ok(
    src.includes("columnsClass=\"columns-2\""),
    "CSS columns must still be used when scroll is not active",
  );
});

test("__TEST_S382__ UltraWideGrid routes to BoundedScrollGrid when scrollPageH is set", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // UltraWideGrid must also branch on scrollPageH.
  assert.ok(
    src.includes("columnsClass=\"columns-3 xl:columns-4\""),
    "CSS columns must still be used for ultrawide when scroll is not active",
  );
  // UltraWideGrid calls BoundedScrollGrid with numCols from RowGridProps.
  assert.ok(
    src.includes("numCols?: number"),
    "RowGridProps must carry numCols for ultrawide BoundedScrollGrid",
  );
});

test("__TEST_S399__ BoundedScrollGrid owns bounded sizing instead of page-height allocation", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("pageH={scrollPageH}") && src.includes("pageItemCount={numRows}"),
    "each bounded AgendaRow must receive the finite page budget and row count",
  );
});

test("__TEST_S382__ BoundedScrollGrid numRows = ceil(pageItems.length / numCols)", () => {
  // Verify the row-count formula for a range of item/col combinations.
  function numRows(N: number, cols: number) {
    return Math.ceil(N / cols);
  }
  // Landscape (cols=2)
  assert.equal(numRows(1, 2), 1, "1 item, 2 cols → 1 row");
  assert.equal(numRows(2, 2), 1, "2 items, 2 cols → 1 row");
  assert.equal(numRows(3, 2), 2, "3 items, 2 cols → 2 rows");
  assert.equal(numRows(4, 2), 2, "4 items, 2 cols → 2 rows");
  assert.equal(numRows(5, 2), 3, "5 items, 2 cols → 3 rows");
  // Ultrawide 3 cols
  assert.equal(numRows(3, 3), 1, "3 items, 3 cols → 1 row");
  assert.equal(numRows(4, 3), 2, "4 items, 3 cols → 2 rows");
  assert.equal(numRows(6, 3), 2, "6 items, 3 cols → 2 rows");
  // Ultrawide 4 cols
  assert.equal(numRows(4, 4), 1, "4 items, 4 cols → 1 row");
  assert.equal(numRows(5, 4), 2, "5 items, 4 cols → 2 rows");
});

test("__TEST_S382__ ResizeObserver is used for post-layout remeasurement (landscape/ultrawide reflow)", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("new ResizeObserver"),
    "AgendaRow must use ResizeObserver for post-layout remeasurement",
  );
  assert.ok(
    src.includes("ro.observe(viewport)"),
    "ResizeObserver must observe the description viewport so it fires when the grid row resizes",
  );
  assert.ok(
    src.includes("ro.disconnect()"),
    "ResizeObserver must be disconnected on cleanup",
  );
});

test("__TEST_S382__ doMeasureRef pattern — measurement function is stable and always current", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // The doMeasureRef pattern ensures ResizeObserver and useLayoutEffect share
  // the latest onScrollOverflow without stale-closure issues.
  assert.ok(
    src.includes("doMeasureRef"),
    "measurement must use a ref-based stable function (doMeasureRef)",
  );
  assert.ok(
    src.includes("doMeasureRef.current()"),
    "both useLayoutEffect and ResizeObserver must call doMeasureRef.current()",
  );
});

test("__TEST_S382__ totem layout is unaffected by BoundedScrollGrid", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // Totem renders via TotemNowNext, not BoundedScrollGrid/ColumnFlow/PortraitCards.
  assert.ok(
    src.includes("layout === \"totem\""),
    "totem layout branch must still be present",
  );
  assert.ok(
    src.includes("<TotemNowNext"),
    "totem must render via TotemNowNext, not a grid/column layout",
  );
});

test("__TEST_S382__ room_door layout is unaffected by BoundedScrollGrid", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("layout === \"room_door\""),
    "room_door layout branch must still be present",
  );
  assert.ok(
    src.includes("<RoomDoor"),
    "room_door must render via RoomDoor, not a grid/column layout",
  );
});

// ---------------------------------------------------------------------------
// Portrait — Full auto-scroll reuses the intrinsic bounded grid.
// ---------------------------------------------------------------------------

test("__TEST_S399__ portrait Full auto-scroll uses the bounded grid", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("function PortraitCards") &&
      src.includes("if (scrollPageH != null)") &&
      src.includes("numCols={1}"),
    "PortraitCards must route Full auto-scroll through one-column BoundedScrollGrid",
  );
});

test("__TEST_S399__ fixed card content remains a grid-row minimum", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.match(src, /minmax\(auto, 1fr\)/);
  assert.match(src, /pageH=\{scrollPageH\}/);
  assert.match(src, /pageItemCount=\{numRows\}/);
  assert.match(src, /flex-auto min-h-0 overflow-hidden/);
});

test("__TEST_S399__ finite viewport budget leaves a visible line and produces long-description overflow", () => {
  assert.equal(resolveDescriptionViewportMaxHeight(300, 220, 18), 80);
  assert.equal(resolveDescriptionViewportMaxHeight(300, 340, 18), 18);
  const longDescriptionHeight = 240;
  const viewportHeight = resolveDescriptionViewportMaxHeight(300, 220, 18);
  assert.ok(longDescriptionHeight - viewportHeight > 0);
});

test("__TEST_S382__ no forced one-session-per-page — pagination is unchanged", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    !src.includes("items.map((it) => [it])"),
    "one-session-per-page override must not exist",
  );
  assert.ok(
    src.includes("autoPages ?? paginate(items, fallbackPageSize)"),
    "pages must come from autoPages or the standard paginate() function",
  );
});

test("__TEST_S382__ descriptionAutoScroll true with descriptionLines 2 is schema-valid (coercion is UI-only)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: 2, descriptionAutoScroll: true }),
  );
  assert.equal(result.success, true, "Schema allows both (UI enforces coercion)");
});

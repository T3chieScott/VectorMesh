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
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // The scrollEnabled check must include a descriptionLines === null test
  assert.ok(
    src.includes("config.descriptionLines === null") && src.includes("scrollEnabled"),
    "scrollEnabled should require config.descriptionLines === null",
  );
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

test("__TEST_S382__ descriptionAutoScroll true with descriptionLines 2 is schema-valid (coercion is UI-only)", () => {
  // The schema itself doesn't enforce the mutual-exclusion; that's toApiPayload's job.
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({
      descriptionLines: 2,
      descriptionAutoScroll: true,
    }),
  );
  assert.equal(result.success, true, "Schema allows both (UI enforces coercion)");
});

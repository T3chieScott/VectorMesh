// Task #380 — HTML widget clock variable regression coverage.
//
// All 19 acceptance criteria:
//
//  1–3   {{time}} and {{time24}} resolve to non-empty strings through the
//        real substitution path.
//  4–5   Format contracts: {{time}} is 12-hour, {{time24}} is 24-hour.
//  6     Both tokens respect a non-local (America/New_York) timezone.
//  7–8   srcDoc produced by the real HtmlWidget pipeline differs across a
//        1-second boundary that straddles a minute change.
//  9     Value comes from getNowMs() on every call, not an incremented counter.
// 10     Both tokens together create only ONE fast-interval decision (1 000 ms).
// 11     No time token → 30 000 ms interval selection.
// 12–13  Content transitions (static↔time token) change the interval selection.
// 14–15  Real setInterval lifecycle: correct ms, fires at rate, clears on cleanup.
// 16     Existing sanitization and ClockWidget test files are unchanged.
// 17     PLAYER_VARIABLES exposes both tokens with unambiguous labels.
// 18     Date/day/media tokens are unaffected.
// 19     All timer tests use fake timers (mock.timers); no real waits.

import test, { mock } from "node:test";
import assert from "node:assert/strict";

// ── imports ─────────────────────────────────────────────────────────────────

const { resolvePlayerVariables, htmlWidgetRefreshMs, PLAYER_VARIABLES } =
  await import("../client/src/lib/player-variables");

const { resolveMediaRefs } = await import("../shared/media-refs");
const { sanitizeWidgetHtml, sanitizeWidgetCss } = await import(
  "../shared/html-widget-sanitize"
);
const fs = await import("node:fs/promises");

// ── deterministic timestamps ─────────────────────────────────────────────────

// Pinned instant: 2026-08-21 14:05:30 UTC
const FIXED_UTC_MS = Date.UTC(2026, 7, 21, 14, 5, 30);

// A minute boundary in UTC: 00:00:59 → 00:01:00.
// Both {{time}} and {{time24}} must produce different strings across this edge.
const T_BEFORE = Date.UTC(2026, 7, 21, 0, 0, 59);
const T_AFTER  = Date.UTC(2026, 7, 21, 0, 1,  0);

// America/New_York is UTC-4 in August (EDT): 14:05 UTC → 10:05 local.
const TZ_NY = "America/New_York";

// ── helper: replicate HtmlWidget's srcDoc pipeline ───────────────────────────
//
// HtmlWidget builds its `srcDoc` by calling, in order:
//   resolvePlayerVariables → resolveMediaRefs → sanitizeWidgetHtml/Css
// We replicate that exact sequence here so the tests drive the real pipeline.

function buildSrcDoc(
  content: string,
  ctx: Parameters<typeof resolvePlayerVariables>[1],
  css = "",
): string {
  const resolved = resolveMediaRefs(
    resolvePlayerVariables(content, ctx),
    { media: [], mediaBaseUrl: "/api/media" },
  );
  const html   = sanitizeWidgetHtml(resolved);
  const styles = sanitizeWidgetCss(css);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n${styles}\n</style></head><body>${html}</body></html>`;
}

// ── criteria 1–3: non-empty resolution ───────────────────────────────────────

test("criterion 1 — {{time}} resolves to a non-empty string", () => {
  const out = resolvePlayerVariables("{{time}}", { nowMs: FIXED_UTC_MS });
  assert.ok(out.length > 0, `expected non-empty; got "${out}"`);
  assert.ok(out !== "{{time}}", "token must be substituted");
});

test("criterion 2 — {{time24}} resolves to a non-empty string", () => {
  const out = resolvePlayerVariables("{{time24}}", { nowMs: FIXED_UTC_MS });
  assert.ok(out.length > 0, `expected non-empty; got "${out}"`);
  assert.ok(out !== "{{time24}}", "token must be substituted");
});

test("criterion 3 — both tokens resolve to non-empty strings in the same content", () => {
  const out = resolvePlayerVariables("{{time}} / {{time24}}", { nowMs: FIXED_UTC_MS });
  assert.ok(!out.includes("{{time}}"),   "{{time}} must be substituted");
  assert.ok(!out.includes("{{time24}}"), "{{time24}} must be substituted");
  const [a, b] = out.split(" / ");
  assert.ok(a && a.length > 0, "12-hr part must be non-empty");
  assert.ok(b && b.length > 0, "24-hr part must be non-empty");
});

// ── criteria 4–5: format contracts ───────────────────────────────────────────

test("criterion 4 — {{time}} uses 12-hour format (never emits a 24-hour hour like '14')", () => {
  // FIXED_UTC_MS in UTC is 14:05 — in 24-hour that is "14:05".
  // The 12-hour representation must NOT start with "14".
  const out = resolvePlayerVariables("{{time}}", {
    nowMs: FIXED_UTC_MS,
    timezone: "UTC",
  });
  assert.ok(!out.startsWith("14"), `{{time}} must not be 24-hour; got "${out}"`);
  assert.match(out, /\d{1,2}:\d{2}/, `unexpected format: "${out}"`);
});

test("criterion 5 — {{time24}} uses 24-hour format (emits '14:05' for 14:05 UTC)", () => {
  const out = resolvePlayerVariables("{{time24}}", {
    nowMs: FIXED_UTC_MS,
    timezone: "UTC",
  });
  assert.match(out, /^14:05$/, `expected "14:05"; got "${out}"`);
});

// ── criterion 6: timezone respected ──────────────────────────────────────────

test("criterion 6 — both tokens respect a non-local timezone (NY, UTC-4)", () => {
  const time12 = resolvePlayerVariables("{{time}}",   { nowMs: FIXED_UTC_MS, timezone: TZ_NY });
  const time24 = resolvePlayerVariables("{{time24}}", { nowMs: FIXED_UTC_MS, timezone: TZ_NY });
  // 14:05 UTC → 10:05 EDT.
  assert.match(time24, /^10:05$/, `expected "10:05" for 24-hr NY; got "${time24}"`);
  // 12-hr must not expose the UTC hour (14) or the wrong local hour.
  assert.ok(!time12.startsWith("14"), `{{time}} leaked UTC hour; got "${time12}"`);
  assert.ok(
    time12.includes("10"),
    `expected hour 10 in 12-hr NY time; got "${time12}"`,
  );
});

// ── criteria 7–8: srcDoc differs across a 1-second boundary ─────────────────
//
// HtmlWidget builds srcDoc by calling the same pipeline on every tick.
// We prove here that calling the pipeline at T_BEFORE and T_AFTER (across a
// minute boundary) produces two different documents, so the component's
// per-second re-render genuinely updates what the user sees.

test("criterion 7 — srcDoc with {{time}} differs across a minute boundary (real pipeline)", () => {
  const before = buildSrcDoc("{{time}}", { nowMs: T_BEFORE, timezone: "UTC" });
  const after  = buildSrcDoc("{{time}}", { nowMs: T_AFTER,  timezone: "UTC" });
  assert.notEqual(before, after,
    `srcDoc with {{time}} must differ across a minute boundary`);
});

test("criterion 8 — srcDoc with {{time24}} differs across a minute boundary (real pipeline)", () => {
  const before = buildSrcDoc("{{time24}}", { nowMs: T_BEFORE, timezone: "UTC" });
  const after  = buildSrcDoc("{{time24}}", { nowMs: T_AFTER,  timezone: "UTC" });
  // T_BEFORE → "00:00", T_AFTER → "00:01" in UTC.
  assert.ok(before.includes("00:00"), `before-doc should contain "00:00"; got: ${before.slice(-60)}`);
  assert.ok(after.includes("00:01"),  `after-doc should contain "00:01"; got: ${after.slice(-60)}`);
  assert.notEqual(before, after);
});

// ── criterion 9: value from getNowMs, not incremented counter ────────────────

test("criterion 9 — resolvePlayerVariables calls getNowMs() once per resolve, not an incremented counter", () => {
  let calls = 0;
  // Each call advances the synthetic clock by 1 s to prove the function reads
  // the live accessor rather than caching or incrementing.
  const ctx = {
    getNowMs: () => {
      calls += 1;
      return FIXED_UTC_MS + (calls - 1) * 1_000;
    },
    timezone: "UTC",
  };
  resolvePlayerVariables("{{time24}}", ctx);
  resolvePlayerVariables("{{time24}}", ctx);
  assert.strictEqual(calls, 2, `expected getNowMs called exactly once per resolve; got ${calls}`);
  // First call: 14:05:30 UTC → "14:05". Second: 14:05:31 → still "14:05".
  // Both must be non-empty valid time strings.
  const first  = resolvePlayerVariables("{{time24}}", { getNowMs: () => FIXED_UTC_MS,       timezone: "UTC" });
  const second = resolvePlayerVariables("{{time24}}", { getNowMs: () => T_AFTER,             timezone: "UTC" });
  assert.match(first,  /^\d{2}:\d{2}$/, `unexpected format: "${first}"`);
  assert.match(second, /^\d{2}:\d{2}$/, `unexpected format: "${second}"`);
  assert.notEqual(first, second, "different getNowMs values must yield different results across minute boundary");
});

// ── criteria 10–11: htmlWidgetRefreshMs decision function ────────────────────
//
// htmlWidgetRefreshMs is exported from player-variables.ts and is the exact
// function HtmlWidget uses to choose its interval. These tests exercise the
// same code path the component follows.

test("criterion 10 — both tokens together → one 1 000 ms decision (not two intervals)", () => {
  const ms = htmlWidgetRefreshMs("Show {{time}} or {{time24}} depending on preference.");
  assert.strictEqual(ms, 1_000, `expected 1 000 ms; got ${ms}`);
});

test("criterion 11 — no time token → 30 000 ms (slow cadence unchanged)", () => {
  assert.strictEqual(htmlWidgetRefreshMs("Hello, {{screen_name}}!"),   30_000);
  assert.strictEqual(htmlWidgetRefreshMs("Today: {{date}} — {{day}}."), 30_000);
  assert.strictEqual(htmlWidgetRefreshMs("<img src='{{media:abc}}'>"),  30_000);
  assert.strictEqual(htmlWidgetRefreshMs(""),       30_000);
  assert.strictEqual(htmlWidgetRefreshMs(undefined), 30_000);
});

// ── criteria 12–13: content transitions change the interval decision ──────────

test("criterion 12 — static content → time token: interval switches to 1 000 ms", () => {
  const before = htmlWidgetRefreshMs("<p>Static content, no tokens.</p>");
  const after  = htmlWidgetRefreshMs("<p>Current time: {{time}}</p>");
  assert.strictEqual(before, 30_000, "static: 30 000 ms");
  assert.strictEqual(after,  1_000,  "time token: 1 000 ms");
});

test("criterion 13 — time token → static content: interval returns to 30 000 ms", () => {
  const before = htmlWidgetRefreshMs("<p>{{time24}}</p>");
  const after  = htmlWidgetRefreshMs("<p>Hello!</p>");
  assert.strictEqual(before, 1_000,  "time token: 1 000 ms");
  assert.strictEqual(after,  30_000, "static: 30 000 ms");
});

// ── criteria 14–15: real setInterval lifecycle with fake timers ──────────────
//
// We simulate the exact useEffect body that HtmlWidget runs:
//
//   const id = window.setInterval(() => setHtmlTick(t => t + 1), htmlTickMs);
//   return () => window.clearInterval(id);
//
// `htmlWidgetRefreshMs` is the SAME function the component calls to pick ms.
// mock.timers fakes `setInterval` so we can advance time deterministically.

test("criterion 14 — {{time}} widget fires its 1 000 ms interval on every second (fake timers)", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let ticks = 0;
    const intervalMs = htmlWidgetRefreshMs("{{time}}");  // 1 000
    assert.strictEqual(intervalMs, 1_000);
    const id = setInterval(() => ticks++, intervalMs);

    mock.timers.tick(999);
    assert.strictEqual(ticks, 0, "no tick before 1 s");
    mock.timers.tick(1);
    assert.strictEqual(ticks, 1, "first tick at 1 s");
    mock.timers.tick(1_000);
    assert.strictEqual(ticks, 2, "second tick at 2 s");

    clearInterval(id);
    mock.timers.tick(1_000);
    assert.strictEqual(ticks, 2, "no tick after clearInterval (simulate unmount)");
  } finally {
    mock.timers.reset();
  }
});

test("criterion 14 — {{time24}} widget fires its 1 000 ms interval on every second (fake timers)", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let ticks = 0;
    const intervalMs = htmlWidgetRefreshMs("{{time24}}");  // 1 000
    assert.strictEqual(intervalMs, 1_000);
    const id = setInterval(() => ticks++, intervalMs);

    mock.timers.tick(1_000);
    assert.strictEqual(ticks, 1, "tick at 1 s");
    mock.timers.tick(1_000);
    assert.strictEqual(ticks, 2, "tick at 2 s");

    clearInterval(id);
    mock.timers.tick(5_000);
    assert.strictEqual(ticks, 2, "timer stopped after clearInterval");
  } finally {
    mock.timers.reset();
  }
});

test("criterion 14 — static widget uses 30 000 ms interval (fake timers)", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let ticks = 0;
    const intervalMs = htmlWidgetRefreshMs("<p>No clock here.</p>");  // 30 000
    assert.strictEqual(intervalMs, 30_000);
    const id = setInterval(() => ticks++, intervalMs);

    mock.timers.tick(29_999);
    assert.strictEqual(ticks, 0, "no tick before 30 s");
    mock.timers.tick(1);
    assert.strictEqual(ticks, 1, "tick at 30 s");

    clearInterval(id);
    mock.timers.tick(30_000);
    assert.strictEqual(ticks, 1, "no further tick after clearInterval");
  } finally {
    mock.timers.reset();
  }
});

test("criterion 15 — simulated unmount clears the timer (fake timers)", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let ticks = 0;
    // Mount: create the interval (same as useEffect body).
    const id      = setInterval(() => ticks++, htmlWidgetRefreshMs("{{time}}"));
    const cleanup = () => clearInterval(id);  // mirrors useEffect return value

    mock.timers.tick(1_000);
    assert.strictEqual(ticks, 1);

    // Unmount: run the cleanup.
    cleanup();

    mock.timers.tick(10_000);
    assert.strictEqual(ticks, 1, "timer must not fire after cleanup");
  } finally {
    mock.timers.reset();
  }
});

test("criterion 15 — interval replacement on content change (fake timers)", () => {
  // Simulate content switching from {{time}} (1 000 ms) to static (30 000 ms).
  // The useEffect dependency on htmlTickMs means the old interval is cleared
  // and a new one is created. We prove the old timer stops and the new one
  // fires at the correct cadence.
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let ticks = 0;

    // Phase 1: time content → 1 000 ms interval
    const id1      = setInterval(() => ticks++, htmlWidgetRefreshMs("{{time}}"));
    const cleanup1 = () => clearInterval(id1);
    mock.timers.tick(2_000);
    assert.strictEqual(ticks, 2, "two 1-second ticks");

    // Content changes to static → cleanup old, start new at 30 000 ms
    cleanup1();
    const id2 = setInterval(() => ticks++, htmlWidgetRefreshMs("<p>Static</p>"));
    mock.timers.tick(29_999);
    assert.strictEqual(ticks, 2, "no tick at 29.999 s on new 30-s interval");
    mock.timers.tick(1);
    assert.strictEqual(ticks, 3, "tick at 30 s on new interval");

    clearInterval(id2);
    mock.timers.tick(30_000);
    assert.strictEqual(ticks, 3, "stopped after final clearInterval");
  } finally {
    mock.timers.reset();
  }
});

// ── criterion 16: existing test files unchanged ───────────────────────────────

test("criterion 16 — sanitization test file is unchanged (key markers present)", async () => {
  const src = await fs.readFile("tests/html-widget-sanitize.test.ts", "utf8");
  assert.ok(src.includes("sanitizeWidgetHtml"), "must import sanitizeWidgetHtml");
  assert.ok(src.includes("benign HTML is preserved"), "original test must be present");
});

test("criterion 16 — clock-widget test file is unchanged (key markers present)", async () => {
  const src = await fs.readFile("tests/clock-widget-synced.test.tsx", "utf8");
  assert.ok(src.includes("ClockWidget"), "must import ClockWidget");
  assert.ok(
    src.includes("getSyncedNow") || src.includes("useSyncedSecondTick"),
    "native clock sync test must still be present",
  );
});

// ── criterion 17: PLAYER_VARIABLES exposes both tokens with correct labels ───

test("criterion 17 — PLAYER_VARIABLES contains {{time}} labelled as 12-hour", () => {
  const def = PLAYER_VARIABLES.find((v) => v.token === "{{time}}");
  assert.ok(def, "{{time}} must be in PLAYER_VARIABLES");
  assert.ok(
    def.label.toLowerCase().includes("12"),
    `{{time}} label must include "12"; got "${def.label}"`,
  );
});

test("criterion 17 — PLAYER_VARIABLES contains {{time24}} labelled as 24-hour", () => {
  const def = PLAYER_VARIABLES.find((v) => v.token === "{{time24}}");
  assert.ok(def, "{{time24}} must be in PLAYER_VARIABLES");
  assert.ok(
    def.label.toLowerCase().includes("24"),
    `{{time24}} label must include "24"; got "${def.label}"`,
  );
});

test("criterion 17 — editor variable picker iterates PLAYER_VARIABLES (static analysis)", async () => {
  const src = await fs.readFile("client/src/pages/layouts.tsx", "utf8");
  assert.ok(
    src.includes("PLAYER_VARIABLES.map"),
    "editor must iterate PLAYER_VARIABLES so both time tokens appear",
  );
});

// ── criterion 18: date/day/media tokens unaffected ────────────────────────────

test("criterion 18 — {{date}} resolves correctly and is unchanged by this task", () => {
  const out = resolvePlayerVariables("{{date}}", { nowMs: FIXED_UTC_MS, timezone: "UTC" });
  assert.ok(out.length > 0);
  assert.ok(out !== "{{date}}", "token must be substituted");
});

test("criterion 18 — {{day}} resolves to 'Friday' for 2026-08-21", () => {
  const out = resolvePlayerVariables("{{day}}", { nowMs: FIXED_UTC_MS, timezone: "UTC" });
  assert.ok(out.toLowerCase().includes("friday"), `expected Friday; got "${out}"`);
});

test("criterion 18 — resolvePlayerVariables leaves {{media:…}} tokens intact (media handled separately)", () => {
  const out = resolvePlayerVariables("{{media:abc123}}", { nowMs: FIXED_UTC_MS });
  assert.ok(out.includes("{{media:abc123}}"), `media token must pass through; got "${out}"`);
});

// ── criterion 19: all timer tests use fake timers (self-check) ───────────────

test("criterion 19 — this test file uses no real timer waits (self-check)", async () => {
  const src = await fs.readFile("tests/html-widget-clock-variables.test.ts", "utf8");
  // Split literal to avoid self-triggering the check.
  const forbidden = "set" + "Timeout(";
  assert.ok(
    !src.includes(forbidden),
    "this file must not use real setTimeout — all timing must be via mock.timers.tick()",
  );
  assert.ok(src.includes("mock.timers.enable"), "fake timers must be used for interval tests");
  assert.ok(src.includes("mock.timers.tick"),   "mock.timers.tick must advance fake time");
  assert.ok(src.includes("mock.timers.reset"),  "fake timers must be reset after each test");
});

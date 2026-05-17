// Task #234 — operator-facing breakpoint disclosure for the agenda
// zone picker.
//
// The zone editor picker now surfaces "what auto-layout variant will
// this design resolve to inside *this* zone?" using pickAgendaLayout.
// We pin the math directly against the resolver so the UI panel can
// never silently drift from what the player actually renders.
//
// We don't mount the React picker itself because layouts.tsx pulls in
// the full editor (Leaflet, charting, ~10k lines) and won't load
// under `tsx --test`. The on-screen text is deterministic from
// pickAgendaLayout's output, so verifying the resolver against the
// exact zone-pixel cases the picker shows is the right granularity.

import test from "node:test";
import assert from "node:assert/strict";
import { pickAgendaLayout } from "../shared/agenda-resolver";

// Helper that mirrors the picker's own math: zone width/height are
// stored as percentages of a layout canvas (default 1920×1080), so
// the picker multiplies through before calling pickAgendaLayout.
function resolveForZone(
  layoutMode: "auto" | "landscape" | "portrait" | "totem" | "ultrawide" | "room_door",
  zoneWidthPct: number,
  zoneHeightPct: number,
  displayMode: "full" | "now_next" | "room_focus" | "alert",
  canvas = { width: 1920, height: 1080 },
) {
  const w = Math.max(1, Math.round((zoneWidthPct / 100) * canvas.width));
  const h = Math.max(1, Math.round((zoneHeightPct / 100) * canvas.height));
  return pickAgendaLayout(layoutMode, w, h, displayMode);
}

test("full-width 1920×1080 zone with auto + full → landscape", () => {
  assert.equal(resolveForZone("auto", 100, 100, "full"), "landscape");
});

test("tall narrow auto zone (25% × 100%) → portrait", () => {
  // 480×1080 ratio ≈ 0.44, under the 0.70 portrait threshold.
  assert.equal(resolveForZone("auto", 25, 100, "full"), "portrait");
});

test("ultrawide auto zone (100% × 25%) → ultrawide", () => {
  // 1920×270 ratio ≈ 7.1, well above the 3.0 ultrawide threshold.
  assert.equal(resolveForZone("auto", 100, 25, "full"), "ultrawide");
});

test("auto + now_next switches to totem when ratio < 0.8", () => {
  // 30% × 100% of 1920×1080 → 576×1080 ratio = 0.53 → totem
  assert.equal(resolveForZone("auto", 30, 100, "now_next"), "totem");
});

test("auto + room_focus is always room_door regardless of dims", () => {
  assert.equal(resolveForZone("auto", 100, 100, "room_focus"), "room_door");
  assert.equal(resolveForZone("auto", 20, 80, "room_focus"), "room_door");
  assert.equal(resolveForZone("auto", 100, 10, "room_focus"), "room_door");
});

test("explicit layoutMode is shown unchanged (auto-disclosure suppressed)", () => {
  // Picker only renders the breakpoint panel when isAuto === true.
  // Verify explicit picks never get rerouted by the resolver.
  assert.equal(resolveForZone("portrait", 100, 100, "full"), "portrait");
  assert.equal(resolveForZone("ultrawide", 25, 50, "full"), "ultrawide");
  assert.equal(resolveForZone("totem", 100, 100, "now_next"), "totem");
});

test("borderline ratios match the documented thresholds exactly", () => {
  // ratio === 3.0 → ultrawide
  assert.equal(pickAgendaLayout("auto", 3000, 1000, "full"), "ultrawide");
  // ratio === 1.4 → landscape
  assert.equal(pickAgendaLayout("auto", 1400, 1000, "full"), "landscape");
  // ratio === 0.7 → portrait (boundary inclusive)
  assert.equal(pickAgendaLayout("auto", 700, 1000, "full"), "portrait");
  // ratio === 0.8 (now_next) → landscape (strictly less than 0.8 → totem)
  assert.equal(pickAgendaLayout("auto", 800, 1000, "now_next"), "landscape");
  assert.equal(pickAgendaLayout("auto", 799, 1000, "now_next"), "totem");
});

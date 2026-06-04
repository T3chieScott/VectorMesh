import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReadableAgendaDate } from "../shared/spreadsheet-mapping";

test("formats an ISO timestamp into a readable date + time (London winter, GMT)", () => {
  const out = formatReadableAgendaDate("2026-01-15T09:30:00Z", { timezone: "Europe/London" });
  assert.equal(out, "15 Jan 2026, 09:30");
});

test("shifts the displayed wall time into the configured timezone (London summer, BST)", () => {
  // 08:30Z in BST is 09:30 local.
  const out = formatReadableAgendaDate("2026-06-15T08:30:00Z", { timezone: "Europe/London" });
  assert.equal(out, "15 Jun 2026, 09:30");
});

test("omits the clock time for a date-only (local-midnight) value", () => {
  const out = formatReadableAgendaDate("2026-06-15", { timezone: "Europe/London" });
  assert.equal(out, "15 Jun 2026");
});

test("date-only value during DST is still treated as midnight in the target tz (not UTC)", () => {
  // London local midnight on a summer date is 23:00Z the previous day.
  // Checking UTC hours would wrongly show a time; the tz-aware check must not.
  const out = formatReadableAgendaDate("2026-07-01", { timezone: "Europe/London" });
  assert.equal(out, "1 Jul 2026");
});

test("converts an Excel serial number to a readable date", () => {
  // 45838 = 2025-06-30 (Excel serial, midnight).
  const out = formatReadableAgendaDate("45838", { timezone: "Europe/London" });
  assert.equal(out, "30 Jun 2025");
});

test("returns the raw text unchanged when the value isn't a date", () => {
  assert.equal(formatReadableAgendaDate("Keynote Hall", { timezone: "Europe/London" }), "Keynote Hall");
});

test("returns an empty string for blank input", () => {
  assert.equal(formatReadableAgendaDate("   ", { timezone: "Europe/London" }), "");
});

test("falls back to the default timezone when given an invalid one", () => {
  const out = formatReadableAgendaDate("2026-01-15T09:30:00Z", { timezone: "Not/AZone" });
  assert.equal(out, "15 Jan 2026, 09:30");
});

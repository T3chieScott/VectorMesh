import test from "node:test";
import assert from "node:assert/strict";
import {
  describeTzOffset,
  endOfDayInTz,
  getTzOffsetMinutes,
  getWallPartsInTz,
  isValidTimezone,
  parseHHMMString,
  startOfDayInTz,
  wallTimeOnDateInTz,
} from "../shared/timezone-utils";

// ===== isValidTimezone ====================================================

test("isValidTimezone accepts well-known IANA zones", () => {
  assert.equal(isValidTimezone("Europe/London"), true);
  assert.equal(isValidTimezone("America/New_York"), true);
  assert.equal(isValidTimezone("UTC"), true);
});

test("isValidTimezone rejects garbage and empty input", () => {
  assert.equal(isValidTimezone(""), false);
  assert.equal(isValidTimezone("Not/A_Zone"), false);
  // @ts-expect-error - explicit nonsense
  assert.equal(isValidTimezone(null), false);
});

// ===== parseHHMMString ====================================================

test("parseHHMMString parses well-formed times", () => {
  assert.deepEqual(parseHHMMString("09:00"), { hours: 9, minutes: 0 });
  assert.deepEqual(parseHHMMString("23:59"), { hours: 23, minutes: 59 });
  assert.deepEqual(parseHHMMString("9:30"), { hours: 9, minutes: 30 });
});

test("parseHHMMString rejects malformed input", () => {
  assert.equal(parseHHMMString(""), null);
  assert.equal(parseHHMMString("24:00"), null);
  assert.equal(parseHHMMString("12:60"), null);
  assert.equal(parseHHMMString("12-30"), null);
  assert.equal(parseHHMMString(null), null);
});

// ===== getWallPartsInTz ===================================================

test("getWallPartsInTz: London winter (GMT) at 14:00 UTC -> 14:00 wall", () => {
  // 2026-01-15 is mid-winter; London = GMT (UTC+0).
  const wall = getWallPartsInTz(new Date("2026-01-15T14:00:00Z"), "Europe/London");
  assert.equal(wall.year, 2026);
  assert.equal(wall.month, 1);
  assert.equal(wall.day, 15);
  assert.equal(wall.hour, 14);
  assert.equal(wall.minute, 0);
  // 2026-01-15 is a Thursday => dayOfWeek 4.
  assert.equal(wall.dayOfWeek, 4);
});

test("getWallPartsInTz: London summer (BST) at 13:00 UTC -> 14:00 wall", () => {
  // 2026-07-15 is mid-summer; London = BST (UTC+1).
  const wall = getWallPartsInTz(new Date("2026-07-15T13:00:00Z"), "Europe/London");
  assert.equal(wall.hour, 14);
  assert.equal(wall.minute, 0);
});

test("getWallPartsInTz: New York summer at 13:30 UTC -> 09:30 EDT wall", () => {
  // 2026-07-15: America/New_York is on EDT (UTC-4).
  const wall = getWallPartsInTz(new Date("2026-07-15T13:30:00Z"), "America/New_York");
  assert.equal(wall.hour, 9);
  assert.equal(wall.minute, 30);
});

// ===== getTzOffsetMinutes ================================================

test("getTzOffsetMinutes: London winter is UTC+0", () => {
  assert.equal(
    getTzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/London"),
    0,
  );
});

test("getTzOffsetMinutes: London summer is UTC+60", () => {
  assert.equal(
    getTzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/London"),
    60,
  );
});

test("getTzOffsetMinutes: New York winter is UTC-300", () => {
  assert.equal(
    getTzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York"),
    -300,
  );
});

// ===== wallTimeOnDateInTz =================================================

test("wallTimeOnDateInTz: London 14:00 in winter is 14:00 UTC", () => {
  const anchor = new Date("2026-01-15T12:00:00Z");
  const out = wallTimeOnDateInTz(anchor, "Europe/London", 14, 0);
  assert.equal(out.toISOString(), "2026-01-15T14:00:00.000Z");
});

test("wallTimeOnDateInTz: London 14:00 in summer is 13:00 UTC (BST)", () => {
  // Critical regression for Task #136: a 14:00 London block in summer must
  // resolve to 13:00 UTC, not 14:00 UTC.
  const anchor = new Date("2026-07-15T12:00:00Z");
  const out = wallTimeOnDateInTz(anchor, "Europe/London", 14, 0);
  assert.equal(out.toISOString(), "2026-07-15T13:00:00.000Z");
});

test("wallTimeOnDateInTz: New York 09:00 in summer is 13:00 UTC (EDT)", () => {
  const anchor = new Date("2026-07-15T12:00:00Z");
  const out = wallTimeOnDateInTz(anchor, "America/New_York", 9, 0);
  assert.equal(out.toISOString(), "2026-07-15T13:00:00.000Z");
});

test("wallTimeOnDateInTz: London spring-forward — 01:30 on transition day snaps forward", () => {
  // 2026-03-29 is the UK spring-forward Sunday; clocks jump 01:00 GMT
  // straight to 02:00 BST. 01:30 doesn't exist; we snap forward by an
  // hour to 02:30 BST (= 01:30 UTC).
  const anchor = new Date("2026-03-29T12:00:00Z");
  const out = wallTimeOnDateInTz(anchor, "Europe/London", 1, 30);
  const verify = getWallPartsInTz(out, "Europe/London");
  assert.equal(verify.day, 29);
  // The invariant is that the result is past the gap (>= 02:00 wall) on
  // the same day. We snap to the same minute one hour later, so 02:30 BST.
  assert.equal(verify.hour, 2, `expected 02:xx wall, got ${verify.hour}:${verify.minute}`);
  assert.equal(verify.minute, 30);
});

test("wallTimeOnDateInTz: London fall-back — 01:30 resolves deterministically", () => {
  // 2026-10-25 is the UK fall-back Sunday; clocks go 02:00 BST -> 01:00 GMT.
  // 01:30 happens twice; we pick the first (still-BST) instance.
  const anchor = new Date("2026-10-25T12:00:00Z");
  const out = wallTimeOnDateInTz(anchor, "Europe/London", 1, 30);
  // First 01:30 is BST (UTC+1) => 00:30 UTC.
  assert.equal(out.toISOString(), "2026-10-25T00:30:00.000Z");
});

// ===== startOfDayInTz / endOfDayInTz ======================================

test("startOfDayInTz: London 2026-07-15 starts at 23:00 UTC the previous day", () => {
  // BST = UTC+1, so 00:00 BST on 15 Jul == 23:00 UTC on 14 Jul.
  const out = startOfDayInTz("2026-07-15", "Europe/London");
  assert.ok(out);
  assert.equal(out!.toISOString(), "2026-07-14T23:00:00.000Z");
});

test("endOfDayInTz: London 2026-01-15 ends at 23:59:59.999 UTC same day", () => {
  // GMT = UTC+0, so end-of-day is 23:59:59.999 UTC same calendar day.
  const out = endOfDayInTz("2026-01-15", "Europe/London");
  assert.ok(out);
  assert.equal(out!.toISOString(), "2026-01-15T23:59:59.999Z");
});

test("endOfDayInTz: rejects malformed date string", () => {
  assert.equal(endOfDayInTz("not-a-date", "Europe/London"), null);
});

test("startOfDayInTz: Pacific/Kiritimati (UTC+14) anchors on the right calendar day", () => {
  // Kiritimati is UTC+14 with no DST; 12:00 UTC on 2026-01-15 is 02:00 on
  // 16 Jan local. The helper must still return the start of the requested
  // local day (15 Jan 00:00 +14 == 14 Jan 10:00 UTC).
  const out = startOfDayInTz("2026-01-15", "Pacific/Kiritimati");
  assert.ok(out);
  assert.equal(out!.toISOString(), "2026-01-14T10:00:00.000Z");
});

test("endOfDayInTz: Pacific/Kiritimati ends just before 14 Jan 10:00 UTC", () => {
  const out = endOfDayInTz("2026-01-15", "Pacific/Kiritimati");
  assert.ok(out);
  // 16 Jan 00:00 +14 == 15 Jan 10:00 UTC; minus 1 ms for end-of-day.
  assert.equal(out!.toISOString(), "2026-01-15T09:59:59.999Z");
});

test("startOfDayInTz: Etc/GMT+12 (UTC-12) anchors on the right calendar day", () => {
  // Etc/GMT+12 is UTC-12 (POSIX-style sign inversion). 00:00 there on
  // 2026-01-15 is 12:00 UTC same day.
  const out = startOfDayInTz("2026-01-15", "Etc/GMT+12");
  assert.ok(out);
  assert.equal(out!.toISOString(), "2026-01-15T12:00:00.000Z");
});

test("endOfDayInTz: New York handles DST (24h+1h on spring-forward day)", () => {
  // 2026-03-08 is the US spring-forward Sunday; the "day" is 23 hours
  // wall-clock. End-of-day must still be just before next 00:00 EDT.
  const out = endOfDayInTz("2026-03-08", "America/New_York");
  assert.ok(out);
  // 00:00 EDT on 2026-03-09 == 04:00 UTC; minus 1 ms.
  assert.equal(out!.toISOString(), "2026-03-09T03:59:59.999Z");
});

// ===== describeTzOffset ===================================================

test("describeTzOffset returns BST + UTC+1 for London summer", () => {
  const out = describeTzOffset(new Date("2026-07-15T12:00:00Z"), "Europe/London");
  assert.match(out, /BST/);
  assert.match(out, /UTC\+1/);
});

test("describeTzOffset returns the raw zone for an invalid input", () => {
  assert.equal(describeTzOffset(new Date(), "Not/A_Zone"), "Not/A_Zone");
});

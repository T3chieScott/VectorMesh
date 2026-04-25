import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBlockPlayabilityInWindow,
  getBlockEffectiveEndDate,
  getRuleForDay,
  hasBookingCoveringBlock,
  hasBookingCoveringWindow,
  normaliseRuleDates,
} from "../shared/schedule-diagnostics";
import type {
  ScheduleBlock,
  ScreenEventBooking,
  TimeRule,
} from "../shared/schema";

// All tests run against UTC so the underlying day arithmetic is
// deterministic regardless of where the test runner is executed.
const TZ = "UTC";

// Build a minimal ScheduleBlock fixture. Only the fields the diagnostic
// helpers read are populated — everything else is left at sensible
// defaults so tests stay focused on the rule/booking logic.
function buildBlock(rule: Partial<TimeRule> | null): ScheduleBlock {
  const rules: TimeRule[] = rule
    ? [
        {
          startTime: "09:00",
          endTime: "17:00",
          ...rule,
        } as TimeRule,
      ]
    : [];
  return {
    id: "block-1",
    programmeVersionId: "ver-1",
    name: "Block",
    targets: [],
    layoutTemplateId: null,
    primaryPlaylistId: null,
    fallbackPlaylistId: null,
    zoneSources: null,
    timeRules: rules,
    priority: 0,
    createdAt: new Date(),
  } as unknown as ScheduleBlock;
}

function buildBooking(
  screenId: string,
  eventId: string,
  startsAt: string,
  endsAt: string,
): ScreenEventBooking {
  return {
    id: `booking-${screenId}-${startsAt}`,
    screenId,
    eventId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ScreenEventBooking;
}

test("normaliseRuleDates fills in missing endDate from startDate", () => {
  const rule = { startTime: "09:00", endTime: "17:00", startDate: "2026-05-01" } as TimeRule;
  const out = normaliseRuleDates(rule);
  assert.equal(out.endDate, "2026-05-01");
});

test("normaliseRuleDates fills in missing startDate from endDate", () => {
  const rule = { startTime: "09:00", endTime: "17:00", endDate: "2026-05-10" } as TimeRule;
  const out = normaliseRuleDates(rule);
  assert.equal(out.startDate, "2026-05-10");
});

test("getRuleForDay returns rule when day-of-week matches", () => {
  // 2026-05-04 is a Monday (dayOfWeek 1).
  const rules: TimeRule[] = [
    { startTime: "09:00", endTime: "17:00", daysOfWeek: [1] } as TimeRule,
  ];
  const monday = new Date("2026-05-04T12:00:00Z");
  assert.notEqual(getRuleForDay(rules, monday, TZ), null);
});

test("getRuleForDay returns null when day-of-week does not match", () => {
  const rules: TimeRule[] = [
    { startTime: "09:00", endTime: "17:00", daysOfWeek: [1] } as TimeRule,
  ];
  // 2026-05-05 is a Tuesday (dayOfWeek 2).
  const tuesday = new Date("2026-05-05T12:00:00Z");
  assert.equal(getRuleForDay(rules, tuesday, TZ), null);
});

test("getRuleForDay respects rule date range", () => {
  const rules: TimeRule[] = [
    {
      startTime: "09:00",
      endTime: "17:00",
      startDate: "2026-05-01",
      endDate: "2026-05-07",
    } as TimeRule,
  ];
  assert.equal(getRuleForDay(rules, new Date("2026-04-30T12:00:00Z"), TZ), null);
  assert.notEqual(getRuleForDay(rules, new Date("2026-05-03T12:00:00Z"), TZ), null);
  assert.equal(getRuleForDay(rules, new Date("2026-05-08T12:00:00Z"), TZ), null);
});

test("getBlockEffectiveEndDate returns endOfDay of rule.endDate", () => {
  const block = buildBlock({ endDate: "2026-05-10" });
  const end = getBlockEffectiveEndDate(block, TZ);
  assert.notEqual(end, null);
  assert.equal(end!.getUTCHours(), 23);
});

test("getBlockEffectiveEndDate returns null for open-ended rule", () => {
  const block = buildBlock({});
  assert.equal(getBlockEffectiveEndDate(block, TZ), null);
});

test("hasBookingCoveringWindow detects partial overlap on the same screen", () => {
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-01", "2026-05-05")]],
  ]);
  const overlaps = hasBookingCoveringWindow(
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04"),
    new Date("2026-05-08"),
  );
  assert.equal(overlaps, true);
});

test("hasBookingCoveringWindow ignores bookings for a different event", () => {
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-OTHER", "2026-05-01", "2026-05-05")]],
  ]);
  const overlaps = hasBookingCoveringWindow(
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-01"),
    new Date("2026-05-05"),
  );
  assert.equal(overlaps, false);
});

test("hasBookingCoveringWindow treats touching intervals as no overlap", () => {
  // Half-open semantics: a booking ending exactly when the window starts
  // does NOT cover any of the window.
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-01", "2026-05-04")]],
  ]);
  const overlaps = hasBookingCoveringWindow(
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04"),
    new Date("2026-05-08"),
  );
  assert.equal(overlaps, false);
});

test("hasBookingCoveringBlock falls back to today+30 when rule has no dates", () => {
  const block = buildBlock({});
  const now = new Date("2026-05-01T12:00:00Z");
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-15", "2026-05-20")]],
  ]);
  assert.equal(
    hasBookingCoveringBlock(block, ["screen-1"], map, "ev-1", now, TZ),
    true,
  );
});

test("hasBookingCoveringBlock honours rule end date as the upper bound", () => {
  const block = buildBlock({ startDate: "2026-05-01", endDate: "2026-05-05" });
  const now = new Date("2026-05-01T00:00:00Z");
  // Booking sits entirely after the block's firing window.
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-10", "2026-05-15")]],
  ]);
  assert.equal(
    hasBookingCoveringBlock(block, ["screen-1"], map, "ev-1", now, TZ),
    false,
  );
});

// --- evaluateBlockPlayabilityInWindow ---------------------------------
// These cover the "block fires AND a booking covers the SAME day" rule
// that backs the schedule top-of-page banner. The previous version of
// the diagnostic checked the two conditions independently, so a block
// could be marked playable when the firing days and the booking days
// did not actually intersect.

test("playability: block fires Mon and booking covers Mon -> playable", () => {
  const block = buildBlock({ daysOfWeek: [1] }); // Monday only
  // 2026-05-04 is a Monday; this booking covers it.
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-04", "2026-05-05")]],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04T00:00:00Z"),
    new Date("2026-05-10T23:59:59Z"),
    TZ,
  );
  assert.equal(result.kind, "playable");
});

test("playability: block fires only Mon but booking only covers Tue -> no-booking-covers-block", () => {
  // Regression: this is the exact scenario that the cycle-5 review
  // flagged. The block fires on Monday and a booking exists in the
  // same week, but the booking sits on Tuesday only — so the block
  // can never play. The old per-day-independent check would have
  // marked this playable.
  const block = buildBlock({ daysOfWeek: [1] }); // Monday only
  // 2026-05-05 is a Tuesday; booking covers Tue only.
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-05", "2026-05-06")]],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04T00:00:00Z"),
    new Date("2026-05-10T23:59:59Z"),
    TZ,
  );
  assert.equal(result.kind, "no-booking-covers-block");
});

test("playability: block has no firing day in window -> no-firing-day", () => {
  const block = buildBlock({ daysOfWeek: [0] }); // Sunday only
  // Booking covers the whole week but Sunday is outside the window.
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-04", "2026-05-10")]],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04T00:00:00Z"), // Mon
    new Date("2026-05-09T23:59:59Z"), // Sat
    TZ,
  );
  assert.equal(result.kind, "no-firing-day");
});

test("playability: block fires Mon+Tue, booking only Tue -> playable on Tue", () => {
  const block = buildBlock({ daysOfWeek: [1, 2] }); // Mon + Tue
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-1", "2026-05-05", "2026-05-06")]],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04T00:00:00Z"),
    new Date("2026-05-10T23:59:59Z"),
    TZ,
  );
  assert.equal(result.kind, "playable");
});

test("playability: block fires every day, multiple screens, only one screen booked", () => {
  const block = buildBlock({}); // no day restriction => fires daily
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-2", [buildBooking("screen-2", "ev-1", "2026-05-06", "2026-05-07")]],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1", "screen-2"],
    map,
    "ev-1",
    new Date("2026-05-04T00:00:00Z"),
    new Date("2026-05-10T23:59:59Z"),
    TZ,
  );
  assert.equal(result.kind, "playable");
});

test("playability: window crossing US spring-forward DST boundary still detects coverage", () => {
  // 2026-03-08 is the US spring-forward Sunday. The day-enumeration
  // loop must produce Sat/Sun/Mon as three distinct calendar days in
  // the target tz so the rule fires once per day even though one is a
  // 23-hour day in wall-clock terms.
  const block = buildBlock({});
  const map = new Map<string, ScreenEventBooking[]>([
    [
      "screen-1",
      [buildBooking("screen-1", "ev-1", "2026-03-07T00:00:00Z", "2026-03-10T00:00:00Z")],
    ],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-03-07T00:00:00Z"),
    new Date("2026-03-09T23:59:59Z"),
    "America/New_York",
  );
  assert.equal(result.kind, "playable");
});

test("playability: window crossing US fall-back DST boundary still detects coverage", () => {
  // 2026-11-01 is the US fall-back Sunday. Same regression guard as the
  // spring-forward test — Sat/Sun/Mon must enumerate as three distinct
  // tz-days even though one of them is a 25-hour wall-clock day.
  const block = buildBlock({});
  const map = new Map<string, ScreenEventBooking[]>([
    [
      "screen-1",
      [buildBooking("screen-1", "ev-1", "2026-10-31T00:00:00Z", "2026-11-03T00:00:00Z")],
    ],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-10-31T00:00:00Z"),
    new Date("2026-11-02T23:59:59Z"),
    "America/New_York",
  );
  assert.equal(result.kind, "playable");
});

test("playability: block fires daily but bookings are for the wrong event", () => {
  const block = buildBlock({});
  const map = new Map<string, ScreenEventBooking[]>([
    ["screen-1", [buildBooking("screen-1", "ev-OTHER", "2026-05-04", "2026-05-10")]],
  ]);
  const result = evaluateBlockPlayabilityInWindow(
    block,
    ["screen-1"],
    map,
    "ev-1",
    new Date("2026-05-04T00:00:00Z"),
    new Date("2026-05-10T23:59:59Z"),
    TZ,
  );
  assert.equal(result.kind, "no-booking-covers-block");
});

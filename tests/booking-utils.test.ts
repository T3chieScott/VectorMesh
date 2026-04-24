import test from "node:test";
import assert from "node:assert/strict";
import {
  rangesOverlap,
  isValidRange,
  pickActiveBooking,
} from "../shared/booking-utils";

test("rangesOverlap detects fully-contained interval", () => {
  const outer = { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-10") };
  const inner = { startsAt: new Date("2026-01-03"), endsAt: new Date("2026-01-05") };
  assert.equal(rangesOverlap(outer, inner), true);
  assert.equal(rangesOverlap(inner, outer), true);
});

test("rangesOverlap detects partially overlapping intervals", () => {
  const a = { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-05") };
  const b = { startsAt: new Date("2026-01-04"), endsAt: new Date("2026-01-08") };
  assert.equal(rangesOverlap(a, b), true);
});

test("rangesOverlap returns false for adjacent (touching) intervals", () => {
  // Half-open semantics: a.end == b.start should NOT overlap so back-to-back
  // bookings on the same screen are allowed.
  const a = { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-05") };
  const b = { startsAt: new Date("2026-01-05"), endsAt: new Date("2026-01-08") };
  assert.equal(rangesOverlap(a, b), false);
  assert.equal(rangesOverlap(b, a), false);
});

test("rangesOverlap returns false for fully-disjoint intervals", () => {
  const a = { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-05") };
  const b = { startsAt: new Date("2026-02-01"), endsAt: new Date("2026-02-05") };
  assert.equal(rangesOverlap(a, b), false);
});

test("isValidRange requires end strictly after start", () => {
  assert.equal(
    isValidRange({ startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-02") }),
    true,
  );
  assert.equal(
    isValidRange({ startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-01") }),
    false,
  );
  assert.equal(
    isValidRange({ startsAt: new Date("2026-01-02"), endsAt: new Date("2026-01-01") }),
    false,
  );
});

test("pickActiveBooking returns undefined when no booking covers now", () => {
  const bookings = [
    { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-05") },
    { startsAt: new Date("2026-02-01"), endsAt: new Date("2026-02-05") },
  ];
  const now = new Date("2026-01-15");
  assert.equal(pickActiveBooking(bookings, now), undefined);
});

test("pickActiveBooking returns the booking that contains now", () => {
  const target = { startsAt: new Date("2026-01-10"), endsAt: new Date("2026-01-20") };
  const bookings = [
    { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-05") },
    target,
    { startsAt: new Date("2026-02-01"), endsAt: new Date("2026-02-05") },
  ];
  const now = new Date("2026-01-15");
  assert.equal(pickActiveBooking(bookings, now), target);
});

test("pickActiveBooking treats start-inclusive / end-exclusive correctly", () => {
  const bookings = [
    { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-01-02T00:00:00Z") },
  ];
  // exactly at the start -> active
  assert.equal(
    pickActiveBooking(bookings, new Date("2026-01-01T00:00:00Z")),
    bookings[0],
  );
  // exactly at the end -> NOT active (end is exclusive)
  assert.equal(
    pickActiveBooking(bookings, new Date("2026-01-02T00:00:00Z")),
    undefined,
  );
});

test("pickActiveBooking prefers most-recently-started booking on overlap", () => {
  // Legacy / corrupt data: two bookings sit on top of `now`. The hand-over
  // semantics should report the newer event, not the older lingering one.
  const older = { startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-20"), id: "old" };
  const newer = { startsAt: new Date("2026-01-10"), endsAt: new Date("2026-01-15"), id: "new" };
  const now = new Date("2026-01-12");
  assert.equal(pickActiveBooking([older, newer], now)?.id, "new");
  assert.equal(pickActiveBooking([newer, older], now)?.id, "new");
});

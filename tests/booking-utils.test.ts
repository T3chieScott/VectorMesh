import test from "node:test";
import assert from "node:assert/strict";
import {
  rangesOverlap,
  isValidRange,
  pickActiveBooking,
  canAccessBooking,
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

test("canAccessBooking: unrestricted caller (allowed=null) sees everything", () => {
  // Admins / site operators have no allowedClientIds restriction.
  assert.equal(canAccessBooking("client-a", "client-b", null), true);
  assert.equal(canAccessBooking(null, null, null), true);
  assert.equal(canAccessBooking("client-x", null, null), true);
});

test("canAccessBooking: matching client on both sides allows access", () => {
  assert.equal(canAccessBooking("client-a", "client-a", ["client-a"]), true);
  assert.equal(canAccessBooking("client-a", "client-a", ["client-a", "client-b"]), true);
});

test("canAccessBooking: shared screen + own client event is accessible", () => {
  // Shared screen (clientId == null) booked into your own event.
  assert.equal(canAccessBooking(null, "client-a", ["client-a"]), true);
});

test("canAccessBooking: own screen + site-level event is accessible", () => {
  assert.equal(canAccessBooking("client-a", null, ["client-a"]), true);
});

test("canAccessBooking: both sides null is accessible to any restricted caller", () => {
  // A booking on a shared screen for a site-level event has no tenant
  // boundary to enforce, so a restricted caller may still view it.
  assert.equal(canAccessBooking(null, null, ["client-a"]), true);
});

test("canAccessBooking: cross-tenant event on shared screen is BLOCKED", () => {
  // Regression: shared screen leaks if we only check the screen side.
  // client-a user must NOT touch a booking pointing at a client-b event.
  assert.equal(canAccessBooking(null, "client-b", ["client-a"]), false);
});

test("canAccessBooking: cross-tenant screen + own event is BLOCKED", () => {
  // Mirror case: client-a user can't touch a booking on a client-b
  // screen even if the event is one of theirs.
  assert.equal(canAccessBooking("client-b", "client-a", ["client-a"]), false);
});

test("canAccessBooking: empty allowed list denies everything client-scoped", () => {
  assert.equal(canAccessBooking("client-a", "client-a", []), false);
  assert.equal(canAccessBooking(null, "client-a", []), false);
  assert.equal(canAccessBooking("client-a", null, []), false);
  // Both null still has no tenant boundary -> accessible.
  assert.equal(canAccessBooking(null, null, []), true);
});

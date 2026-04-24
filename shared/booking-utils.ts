/**
 * Shared booking range utilities used by both server-side overlap validation
 * and any client-side preflight checks.
 *
 * A booking spans the half-open interval [startsAt, endsAt) — start is
 * inclusive, end is exclusive. Two intervals overlap iff
 *   a.start < b.end AND b.start < a.end
 * Touching intervals (a.end == b.start) do NOT overlap.
 */

export interface BookingRange {
  startsAt: Date;
  endsAt: Date;
}

export function rangesOverlap(a: BookingRange, b: BookingRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function isValidRange(r: BookingRange): boolean {
  return r.endsAt > r.startsAt;
}

/**
 * Picks the booking that is "active right now" — its [start,end) interval
 * contains `now`. If multiple bookings overlap `now` (legacy data), prefer
 * the one that started most recently so a hand-over reads as "the new event
 * has started" rather than "the old one is still going".
 */
export function pickActiveBooking<T extends BookingRange>(
  bookings: T[],
  now: Date,
): T | undefined {
  const active = bookings.filter(b => b.startsAt <= now && b.endsAt > now);
  if (active.length === 0) return undefined;
  active.sort((x, y) => y.startsAt.getTime() - x.startsAt.getTime());
  return active[0];
}

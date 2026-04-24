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

/**
 * Tenant access check for a single booking. Strict AND: the caller
 * must be able to access BOTH the booking's screen client and its
 * event client.
 *
 * `allowed === null` means the caller is unrestricted (admin / no
 * client scoping) and the check short-circuits to true.
 *
 * The two-sided check matters because shared screens have
 * `screenClientId === null` (visible to everyone) and would let any
 * authenticated user read or mutate bookings into other clients'
 * events if we only checked the screen side. Conversely, site-level
 * events (`eventClientId === null`) shouldn't grant access to a
 * client-restricted screen unless that screen's client is allowed.
 *
 * A `null` clientId on a side means "site-level" and is treated as
 * accessible to everyone — the OTHER side's check is what actually
 * gates the booking in that case. When BOTH sides are null there is
 * no tenant boundary to enforce, so any authenticated caller passes.
 */
export function canAccessBooking(
  screenClientId: string | null,
  eventClientId: string | null,
  allowed: readonly string[] | null,
): boolean {
  if (allowed === null) return true;
  const allowedSet = new Set(allowed);
  const screenOk = screenClientId === null || allowedSet.has(screenClientId);
  const eventOk = eventClientId === null || allowedSet.has(eventClientId);
  return screenOk && eventOk;
}

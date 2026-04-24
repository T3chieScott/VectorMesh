import { addDays, endOfDay, parseISO, startOfDay } from "date-fns";
import type { ScheduleBlock, ScreenEventBooking, TimeRule } from "./schema";

export function normaliseRuleDates(rule: TimeRule): TimeRule {
  if (rule.startDate && !rule.endDate) return { ...rule, endDate: rule.startDate };
  if (rule.endDate && !rule.startDate) return { ...rule, startDate: rule.endDate };
  return rule;
}

// Returns the effective TimeRule for `date` if the block fires that day,
// or null if it does not. Mirrors the player's day-of-week + date-range
// gating: if `daysOfWeek` is set we require membership; if a startDate
// or endDate is set the date must fall within `[start, endOfDay(end)]`.
export function getRuleForDay(timeRules: TimeRule[], date: Date): TimeRule | null {
  const dayOfWeek = date.getDay();
  const rule = timeRules.length > 0 ? normaliseRuleDates(timeRules[0]) : null;
  if (!rule) return null;
  const days = rule.daysOfWeek;
  if (days && days.length > 0 && !days.includes(dayOfWeek)) return null;
  if (rule.startDate) {
    const sd = parseISO(rule.startDate);
    if (date < startOfDay(sd)) return null;
  }
  if (rule.endDate) {
    const ed = parseISO(rule.endDate);
    if (date > endOfDay(ed)) return null;
  }
  return rule;
}

// Returns the latest possible firing date for a block, or null if it
// repeats indefinitely (no endDate set on its rule).
export function getBlockEffectiveEndDate(block: ScheduleBlock): Date | null {
  const rules = (block.timeRules as TimeRule[]) || [];
  if (rules.length === 0) return null;
  const rule = normaliseRuleDates(rules[0]);
  if (!rule.endDate) return null;
  return endOfDay(parseISO(rule.endDate));
}

// Returns true if any booking for one of `screenIds` covers any part of
// the supplied window. Bookings are stored as half-open intervals
// `[startsAt, endsAt)` and the window we evaluate here is also treated
// as half-open: two intervals overlap iff `b.start < window.end &&
// b.end > window.start`. Adjacent (touching) intervals do NOT count as
// coverage.
export function hasBookingCoveringWindow(
  screenIds: string[],
  bookingsByScreen: Map<string, ScreenEventBooking[]>,
  eventId: string,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  for (const id of screenIds) {
    const list = bookingsByScreen.get(id) || [];
    for (const b of list) {
      if (b.eventId !== eventId) continue;
      const bs = new Date(b.startsAt);
      const be = new Date(b.endsAt);
      if (bs < windowEnd && be > windowStart) return true;
    }
  }
  return false;
}

// Returns true if any booking for one of `screenIds` overlaps the
// block's firing window (rule date range or "today + next 30 days" if
// open-ended).
export function hasBookingCoveringBlock(
  block: ScheduleBlock,
  screenIds: string[],
  bookingsByScreen: Map<string, ScreenEventBooking[]>,
  eventId: string,
  now: Date,
): boolean {
  const rules = (block.timeRules as TimeRule[]) || [];
  const rule = rules.length > 0 ? normaliseRuleDates(rules[0]) : null;
  const rangeStart = rule?.startDate ? startOfDay(parseISO(rule.startDate)) : startOfDay(now);
  const ruleEnd = rule?.endDate ? endOfDay(parseISO(rule.endDate)) : endOfDay(addDays(now, 30));
  // Add 1ms so the half-open `<` comparison still catches a booking
  // that begins at the very last moment of the last firing day.
  const rangeEnd = new Date(ruleEnd.getTime() + 1);
  return hasBookingCoveringWindow(screenIds, bookingsByScreen, eventId, rangeStart, rangeEnd);
}

export type PlayabilityResult =
  | { kind: "playable" }
  | { kind: "no-firing-day" }
  | { kind: "no-booking-covers-block" };

// Walks each day in `[windowStart, windowEnd]` and returns whether the
// block has at least one day on which BOTH (a) its time rule fires AND
// (b) a booking for `eventId` on one of `screenIds` covers that day.
//
// This is the core diagnostic the schedule banner uses to call out
// blocks that look scheduled but will never play because the bookings
// sit on different days from the firing days.
export function evaluateBlockPlayabilityInWindow(
  block: ScheduleBlock,
  screenIds: string[],
  bookingsByScreen: Map<string, ScreenEventBooking[]>,
  eventId: string,
  windowStart: Date,
  windowEnd: Date,
): PlayabilityResult {
  const rules = (block.timeRules as TimeRule[]) || [];
  let firesAnyDay = false;
  for (let d = new Date(windowStart); d <= windowEnd; d = addDays(d, 1)) {
    if (!getRuleForDay(rules, d)) continue;
    firesAnyDay = true;
    const dayStart = startOfDay(d);
    const dayEndExclusive = new Date(endOfDay(d).getTime() + 1);
    if (
      hasBookingCoveringWindow(
        screenIds,
        bookingsByScreen,
        eventId,
        dayStart,
        dayEndExclusive,
      )
    ) {
      return { kind: "playable" };
    }
  }
  if (!firesAnyDay) return { kind: "no-firing-day" };
  return { kind: "no-booking-covers-block" };
}

import { addDays, parseISO } from "date-fns";
import type { ScheduleBlock, ScreenEventBooking, TimeRule } from "./schema";
import {
  endOfDayInTz,
  getWallPartsInTz,
  startOfDayInTz,
} from "./timezone-utils";

export function normaliseRuleDates(rule: TimeRule): TimeRule {
  if (rule.startDate && !rule.endDate) return { ...rule, endDate: rule.startDate };
  if (rule.endDate && !rule.startDate) return { ...rule, startDate: rule.endDate };
  return rule;
}

/**
 * Returns the rule that applies to the calendar day containing `date`
 * (interpreted in `tz`), or null if no rule fires that day. Day-of-week,
 * startDate and endDate are all evaluated against the wall clock in `tz`.
 */
export function getRuleForDay(timeRules: TimeRule[], date: Date, tz: string): TimeRule | null {
  const wall = getWallPartsInTz(date, tz);
  const rule = timeRules.length > 0 ? normaliseRuleDates(timeRules[0]) : null;
  if (!rule) return null;
  const days = rule.daysOfWeek;
  if (days && days.length > 0 && !days.includes(wall.dayOfWeek)) return null;
  if (rule.startDate) {
    const sd = startOfDayInTz(rule.startDate, tz);
    if (sd && date < sd) return null;
  }
  if (rule.endDate) {
    const ed = endOfDayInTz(rule.endDate, tz);
    if (ed && date > ed) return null;
  }
  return rule;
}

export function getBlockEffectiveEndDate(block: ScheduleBlock, tz: string): Date | null {
  const rules = (block.timeRules as TimeRule[]) || [];
  if (rules.length === 0) return null;
  const rule = normaliseRuleDates(rules[0]);
  if (!rule.endDate) return null;
  return endOfDayInTz(rule.endDate, tz);
}

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

export function hasBookingCoveringBlock(
  block: ScheduleBlock,
  screenIds: string[],
  bookingsByScreen: Map<string, ScreenEventBooking[]>,
  eventId: string,
  now: Date,
  tz: string,
): boolean {
  const rules = (block.timeRules as TimeRule[]) || [];
  const rule = rules.length > 0 ? normaliseRuleDates(rules[0]) : null;
  // Date range is bounded by the client/site timezone wall-clock day.
  const rangeStart = rule?.startDate
    ? startOfDayInTz(rule.startDate, tz) ?? parseISO(rule.startDate)
    : startOfDayInTz(formatYmdInTz(now, tz), tz) ?? now;
  // Open-ended blocks (no endDate) use a 30-day rolling horizon so the
  // diagnostic stays actionable; bookings beyond that window will not silence
  // the warning until they fall inside the rolling window.
  const ruleEnd = rule?.endDate
    ? endOfDayInTz(rule.endDate, tz) ?? parseISO(rule.endDate)
    : endOfDayInTz(formatYmdInTz(addDays(now, 30), tz), tz) ?? addDays(now, 30);
  const rangeEnd = new Date(ruleEnd.getTime() + 1);
  return hasBookingCoveringWindow(screenIds, bookingsByScreen, eventId, rangeStart, rangeEnd);
}

export type PlayabilityResult =
  | { kind: "playable" }
  | { kind: "no-firing-day" }
  | { kind: "no-booking-covers-block" };

export function evaluateBlockPlayabilityInWindow(
  block: ScheduleBlock,
  screenIds: string[],
  bookingsByScreen: Map<string, ScreenEventBooking[]>,
  eventId: string,
  windowStart: Date,
  windowEnd: Date,
  tz: string,
): PlayabilityResult {
  const rules = (block.timeRules as TimeRule[]) || [];
  let firesAnyDay = false;
  for (let d = new Date(windowStart); d <= windowEnd; d = addDays(d, 1)) {
    if (!getRuleForDay(rules, d, tz)) continue;
    firesAnyDay = true;
    const ymd = formatYmdInTz(d, tz);
    const dayStart = startOfDayInTz(ymd, tz);
    const dayEnd = endOfDayInTz(ymd, tz);
    if (!dayStart || !dayEnd) continue;
    const dayEndExclusive = new Date(dayEnd.getTime() + 1);
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

function formatYmdInTz(d: Date, tz: string): string {
  const w = getWallPartsInTz(d, tz);
  const yyyy = String(w.year).padStart(4, "0");
  const mm = String(w.month).padStart(2, "0");
  const dd = String(w.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

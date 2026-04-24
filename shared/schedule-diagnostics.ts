import { addDays, endOfDay, parseISO, startOfDay } from "date-fns";
import type { ScheduleBlock, ScreenEventBooking, TimeRule } from "./schema";

export function normaliseRuleDates(rule: TimeRule): TimeRule {
  if (rule.startDate && !rule.endDate) return { ...rule, endDate: rule.startDate };
  if (rule.endDate && !rule.startDate) return { ...rule, startDate: rule.endDate };
  return rule;
}

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

export function getBlockEffectiveEndDate(block: ScheduleBlock): Date | null {
  const rules = (block.timeRules as TimeRule[]) || [];
  if (rules.length === 0) return null;
  const rule = normaliseRuleDates(rules[0]);
  if (!rule.endDate) return null;
  return endOfDay(parseISO(rule.endDate));
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
): boolean {
  const rules = (block.timeRules as TimeRule[]) || [];
  const rule = rules.length > 0 ? normaliseRuleDates(rules[0]) : null;
  const rangeStart = rule?.startDate ? startOfDay(parseISO(rule.startDate)) : startOfDay(now);
  // Open-ended blocks (no endDate) use a 30-day rolling horizon so the
  // diagnostic stays actionable; bookings beyond that window will not silence
  // the warning until they fall inside the rolling window.
  const ruleEnd = rule?.endDate ? endOfDay(parseISO(rule.endDate)) : endOfDay(addDays(now, 30));
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

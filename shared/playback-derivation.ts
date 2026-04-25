import type { TimeRule } from "./schema";
import {
  getWallPartsInTz,
  parseHHMMString,
  startOfDayInTz,
  endOfDayInTz,
  wallTimeOnDateInTz,
} from "./timezone-utils";

export interface PlaybackBlock {
  id: string;
  name: string;
  timeRules: TimeRule[] | null;
  priority?: number | null;
}

export type PlaybackStatus =
  | { kind: "playing"; blockId: string; blockName: string; endsAt: Date }
  | { kind: "playsNext"; blockId: string; blockName: string; startsAt: Date }
  | { kind: "noBlockToday" }
  | { kind: "noEvent" };

/**
 * Returns true when `rule`'s daysOfWeek + startDate/endDate gates allow
 * the supplied calendar day (interpreted in `tz`) to fire.
 *
 * Day-of-week and date comparisons are evaluated against the wall-clock
 * day in `tz` — so e.g. a Sunday-only block in Europe/London does NOT
 * fire late Saturday UTC.
 */
export function ruleAdmitsDay(rule: TimeRule, date: Date, tz: string): boolean {
  const wall = getWallPartsInTz(date, tz);
  const days = rule.daysOfWeek;
  if (days && days.length > 0 && !days.includes(wall.dayOfWeek)) return false;
  if (rule.startDate) {
    const sd = startOfDayInTz(rule.startDate, tz);
    if (sd && date < sd) return false;
  }
  if (rule.endDate) {
    const ed = endOfDayInTz(rule.endDate, tz);
    if (ed && date > ed) return false;
  }
  return true;
}

/**
 * Resolves the firing window for a block on the calendar day that contains
 * `date` (interpreted in `tz`). The returned start/end are UTC instants.
 */
export function blockFiringWindowForDay(
  block: PlaybackBlock,
  date: Date,
  tz: string,
): { start: Date; end: Date } | null {
  const rules = block.timeRules || [];
  if (rules.length === 0) return null;
  const rule = rules[0];
  if (!ruleAdmitsDay(rule, date, tz)) return null;
  const startHM = parseHHMMString(rule.startTime);
  const endHM = parseHHMMString(rule.endTime);
  if (!startHM || !endHM) return null;
  const start = wallTimeOnDateInTz(date, tz, startHM.hours, startHM.minutes);
  const end = wallTimeOnDateInTz(date, tz, endHM.hours, endHM.minutes);
  if (!(end > start)) return null;
  return { start, end };
}

export function derivePlaybackStatus(
  blocks: PlaybackBlock[],
  hasActiveEvent: boolean,
  now: Date,
  tz: string,
): PlaybackStatus {
  if (!hasActiveEvent && blocks.length === 0) return { kind: "noEvent" };

  let nowFiring: { block: PlaybackBlock; end: Date; priority: number } | null = null;
  let nextToday: { block: PlaybackBlock; start: Date } | null = null;

  for (const block of blocks) {
    const window = blockFiringWindowForDay(block, now, tz);
    if (!window) continue;
    const priority = block.priority ?? 0;
    if (window.start <= now && window.end > now) {
      // Match the player resolver's priority-based selection (see
      // /api/player/content): the highest-priority currently-firing
      // block wins, so the operator sees what the player is actually
      // serving. On equal priority prefer the longer remaining window
      // as a stable tiebreaker.
      if (
        !nowFiring ||
        priority > nowFiring.priority ||
        (priority === nowFiring.priority && window.end > nowFiring.end)
      ) {
        nowFiring = { block, end: window.end, priority };
      }
    } else if (window.start > now) {
      if (!nextToday || window.start < nextToday.start) {
        nextToday = { block, start: window.start };
      }
    }
  }

  if (nowFiring) {
    return {
      kind: "playing",
      blockId: nowFiring.block.id,
      blockName: nowFiring.block.name,
      endsAt: nowFiring.end,
    };
  }
  if (nextToday) {
    return {
      kind: "playsNext",
      blockId: nextToday.block.id,
      blockName: nextToday.block.name,
      startsAt: nextToday.start,
    };
  }
  return hasActiveEvent ? { kind: "noBlockToday" } : { kind: "noEvent" };
}

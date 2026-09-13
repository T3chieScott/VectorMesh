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

export interface PlaybackSchedule {
  current: { block: PlaybackBlock; endsAt: Date | null } | null;
  next: { block: PlaybackBlock; startsAt: Date } | null;
}

export type TimeRuleFailure =
  | "start-date"
  | "end-date"
  | "day-of-week"
  | "time-of-day";

export type TimeRuleMatch =
  | { ok: true }
  | { ok: false; failure: TimeRuleFailure };

export interface FiringWindow {
  /** Null means that the rule has no lower bound. */
  start: Date | null;
  /** Null means that the rule has no upper bound. */
  end: Date | null;
}

/**
 * This is the one implementation of schedule-rule admission.  The player
 * resolver and reporting both use it; in particular, the minute-exclusive
 * end and the date/weekday gate ordering must not drift between them.
 */
export function evaluateTimeRule(
  rule: TimeRule | undefined,
  now: Date,
  tz: string,
): TimeRuleMatch {
  if (!rule) return { ok: true };
  const wall = getWallPartsInTz(now, tz);

  if (rule.startDate) {
    const start = startOfDayInTz(rule.startDate, tz);
    if (start && now < start) return { ok: false, failure: "start-date" };
  }
  if (rule.endDate) {
    const end = endOfDayInTz(rule.endDate, tz);
    if (end && now > end) return { ok: false, failure: "end-date" };
  }
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 &&
      !rule.daysOfWeek.includes(wall.dayOfWeek)) {
    return { ok: false, failure: "day-of-week" };
  }

  if (rule.startTime && rule.endTime) {
    const start = parseHHMMString(rule.startTime);
    const end = parseHHMMString(rule.endTime);
    if (start && end) {
      const startMinutes = start.hours * 60 + start.minutes;
      const endMinutes = end.hours * 60 + end.minutes;
      const nowMinutes = wall.minuteOfDay;
      const inside = endMinutes <= startMinutes
        ? nowMinutes >= startMinutes || nowMinutes < endMinutes
        : nowMinutes >= startMinutes && nowMinutes < endMinutes;
      if (!inside) return { ok: false, failure: "time-of-day" };
    }
  } else {
    if (rule.startTime) {
      const start = parseHHMMString(rule.startTime);
      if (start && wall.minuteOfDay < start.hours * 60 + start.minutes) {
        return { ok: false, failure: "time-of-day" };
      }
    }
    if (rule.endTime) {
      const end = parseHHMMString(rule.endTime);
      if (end && wall.minuteOfDay >= end.hours * 60 + end.minutes) {
        return { ok: false, failure: "time-of-day" };
      }
    }
  }
  return { ok: true };
}

/** The date and weekday portion of evaluateTimeRule, for future candidates. */
export function ruleAdmitsDay(rule: TimeRule, date: Date, tz: string): boolean {
  const wall = getWallPartsInTz(date, tz);
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 &&
      !rule.daysOfWeek.includes(wall.dayOfWeek)) return false;
  if (rule.startDate) {
    const start = startOfDayInTz(rule.startDate, tz);
    if (start && date < start) return false;
  }
  if (rule.endDate) {
    const end = endOfDayInTz(rule.endDate, tz);
    if (end && date > end) return false;
  }
  return true;
}

function calendarDate(wall: ReturnType<typeof getWallPartsInTz>, offset: number): string {
  const value = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + offset));
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${String(
    value.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function dayAnchor(date: string, tz: string): Date | null {
  return startOfDayInTz(date, tz);
}

function capEndByDate(end: Date | null, rule: TimeRule, tz: string): Date | null {
  if (!rule.endDate) return end;
  const dateEnd = endOfDayInTz(rule.endDate, tz);
  if (!dateEnd) return end;
  // Resolver date gates are inclusive through endOfDayInTz. Represent that
  // inclusive instant as an exclusive window boundary.
  const exclusiveDateEnd = new Date(dateEnd.getTime() + 1);
  return !end || exclusiveDateEnd < end ? exclusiveDateEnd : end;
}

/**
 * Return the canonical window containing `date`, if the resolver would admit
 * the rule at that instant. Overnight windows deliberately look at the
 * previous calendar day when the current wall time is in the post-midnight
 * portion, while weekday/date admission remains anchored to `date` exactly
 * as it is in the resolver.
 */
export function timeRuleWindowAt(
  rule: TimeRule | undefined,
  date: Date,
  tz: string,
): FiringWindow | null {
  if (!rule) return { start: null, end: null };
  if (!evaluateTimeRule(rule, date, tz).ok) return null;

  const wall = getWallPartsInTz(date, tz);
  const startHM = parseHHMMString(rule.startTime);
  const endHM = parseHHMMString(rule.endTime);
  const hasBoth = Boolean(rule.startTime && rule.endTime && startHM && endHM);
  const currentDate = calendarDate(wall, 0);
  const previousDate = calendarDate(wall, -1);
  const nextDate = calendarDate(wall, 1);
  const openEnd = (end: Date | null) => {
    const capped = capEndByDate(end, rule, tz);
    // A weekday gate is itself an effective upper boundary: the resolver
    // re-evaluates the rule against the next wall-clock day at midnight.
    const nextMidnight = rule.daysOfWeek && rule.daysOfWeek.length > 0
      ? dayAnchor(nextDate, tz)
      : null;
    if (capped && nextMidnight) {
      return capped < nextMidnight ? capped : nextMidnight;
    }
    return capped || nextMidnight;
  };

  // As in the resolver, malformed paired values are ignored rather than
  // becoming an accidental empty window.
  if (!hasBoth && rule.startTime && rule.endTime) {
    return { start: null, end: openEnd(null) };
  }
  if (hasBoth) {
    const startMinutes = startHM!.hours * 60 + startHM!.minutes;
    const endMinutes = endHM!.hours * 60 + endHM!.minutes;
    if (startMinutes === endMinutes) return { start: null, end: openEnd(null) };

    const overnight = endMinutes < startMinutes;
    const postMidnight = overnight && wall.minuteOfDay < endMinutes;
    const startDate = postMidnight ? previousDate : currentDate;
    const endDate = postMidnight || !overnight ? currentDate : nextDate;
    const startAnchor = dayAnchor(startDate, tz);
    const endAnchor = dayAnchor(endDate, tz);
    if (!startAnchor || !endAnchor) return null;
    return {
      start: wallTimeOnDateInTz(startAnchor, tz, startHM!.hours, startHM!.minutes),
      end: capEndByDate(
        wallTimeOnDateInTz(endAnchor, tz, endHM!.hours, endHM!.minutes),
        rule,
        tz,
      ),
    };
  }

  if (startHM) {
    if (wall.minuteOfDay < startHM.hours * 60 + startHM.minutes) return null;
    const startAnchor = dayAnchor(currentDate, tz);
    const endAnchor = dayAnchor(nextDate, tz);
    if (!startAnchor || !endAnchor) return null;
    return {
      start: wallTimeOnDateInTz(startAnchor, tz, startHM.hours, startHM.minutes),
      end: capEndByDate(endAnchor, rule, tz),
    };
  }
  if (endHM) {
    const startAnchor = dayAnchor(currentDate, tz);
    const endAnchor = dayAnchor(currentDate, tz);
    if (!startAnchor || !endAnchor) return null;
    return {
      start: startAnchor,
      end: capEndByDate(
        wallTimeOnDateInTz(endAnchor, tz, endHM.hours, endHM.minutes),
        rule,
        tz,
      ),
    };
  }
  return { start: null, end: openEnd(null) };
}

/** Window beginning on a candidate calendar day, used for independent next. */
function timeRuleWindowStartingOn(
  rule: TimeRule,
  date: Date,
  tz: string,
): FiringWindow | null {
  if (!ruleAdmitsDay(rule, date, tz)) return null;
  const wall = getWallPartsInTz(date, tz);
  const currentDate = calendarDate(wall, 0);
  const nextDate = calendarDate(wall, 1);
  const startHM = parseHHMMString(rule.startTime);
  const endHM = parseHHMMString(rule.endTime);
  if (rule.startTime && rule.endTime && (!startHM || !endHM)) {
    return null;
  }
  if (startHM && endHM) {
    if (startHM.hours === endHM.hours && startHM.minutes === endHM.minutes) return null;
    const endDate = endHM.hours * 60 + endHM.minutes <= startHM.hours * 60 + startHM.minutes
      ? nextDate : currentDate;
    const endAnchor = dayAnchor(endDate, tz);
    if (!endAnchor) return null;
    return {
      start: wallTimeOnDateInTz(date, tz, startHM.hours, startHM.minutes),
      end: capEndByDate(wallTimeOnDateInTz(endAnchor, tz, endHM.hours, endHM.minutes), rule, tz),
    };
  }
  if (startHM) {
    const endAnchor = dayAnchor(nextDate, tz);
    if (!endAnchor) return null;
    return {
      start: wallTimeOnDateInTz(date, tz, startHM.hours, startHM.minutes),
      end: capEndByDate(endAnchor, rule, tz),
    };
  }
  if (endHM) {
    return {
      start: dayAnchor(currentDate, tz),
      end: capEndByDate(wallTimeOnDateInTz(date, tz, endHM.hours, endHM.minutes), rule, tz),
    };
  }
  // A date-only rule without weekdays describes one continuous range. Its
  // start date is the sole possible future start; after that start, the
  // current interval is already active and must not reappear as "next" every
  // midnight. End-date-only and completely unbounded rules likewise have no
  // future start to invent.
  if (rule.startDate && !rule.daysOfWeek?.length) {
    if (currentDate !== rule.startDate) return null;
    return {
      start: dayAnchor(currentDate, tz),
      end: capEndByDate(null, rule, tz),
    };
  }
  if (rule.daysOfWeek?.length) {
    const nextMidnight = dayAnchor(nextDate, tz);
    const dateCap = capEndByDate(null, rule, tz);
    return {
      start: dayAnchor(currentDate, tz),
      end: dateCap && nextMidnight
        ? (dateCap < nextMidnight ? dateCap : nextMidnight)
        : dateCap || nextMidnight,
    };
  }
  return null;
}

/**
 * Derive both sides of the schedule independently. Unlike
 * derivePlaybackStatus (kept for the legacy wire field), this does not stop
 * looking for a future block when one is currently firing. A supplied
 * resolvedBlockId pins `current` to the canonical resolver winner so the
 * reporting summary can never disagree with rendered content.
 */
export function derivePlaybackSchedule(
  blocks: PlaybackBlock[],
  now: Date,
  tz: string,
  resolvedBlockId?: string | null,
): PlaybackSchedule {
  const currentBlock = resolvedBlockId
    ? blocks.find((block) => block.id === resolvedBlockId)
    : undefined;
  const currentWindow = currentBlock
    ? blockWindowAt(currentBlock, now, tz)
    : null;
  const current =
    currentWindow &&
    (currentWindow.start === null || currentWindow.start <= now) &&
    (currentWindow.end === null || currentWindow.end > now)
      ? { block: currentBlock!, endsAt: currentWindow.end }
      : null;

  let next: PlaybackSchedule["next"] = null;
  const nowWall = getWallPartsInTz(now, tz);
  for (const [index, block] of blocks.entries()) {
    const rule = block.timeRules?.[0];
    if (!rule) continue;
    const candidateDates = new Map<string, Date>();
    for (let dayOffset = 0; dayOffset <= 370; dayOffset++) {
      const date = dayAnchor(calendarDate(nowWall, dayOffset), tz);
      if (date) candidateDates.set(date.toISOString(), date);
    }
    // A bounded rule may begin beyond the recurring look-ahead horizon.
    if (rule.startDate) {
      const date = dayAnchor(rule.startDate, tz);
      if (date) candidateDates.set(date.toISOString(), date);
    }
    for (const date of [...candidateDates.values()].sort(
      (a, b) => a.getTime() - b.getTime(),
    )) {
      const window = timeRuleWindowStartingOn(rule, date, tz);
      if (!window?.start || window.start <= now) continue;
      if (
        !next ||
        window.start < next.startsAt ||
        (window.start.getTime() === next.startsAt.getTime() &&
          ((block.priority ?? 0) > (next.block.priority ?? 0) ||
            ((block.priority ?? 0) === (next.block.priority ?? 0) &&
              index < blocks.indexOf(next.block))))
      ) {
        next = { block, startsAt: window.start };
      }
      break;
    }
  }
  return { current, next };
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
  let window = blockWindowAt(block, date, tz);
  if (!window) {
    const rule = block.timeRules?.[0];
    if (rule) {
      const wall = getWallPartsInTz(date, tz);
      const anchor = dayAnchor(calendarDate(wall, 0), tz);
      window = anchor ? timeRuleWindowStartingOn(rule, anchor, tz) : null;
    }
  }
  return window?.start && window.end ? { start: window.start, end: window.end } : null;
}

function blockWindowAt(
  block: PlaybackBlock,
  date: Date,
  tz: string,
): FiringWindow | null {
  const rule = block.timeRules?.[0];
  // An absent rule is the resolver's unbounded schedule case.
  if (!rule) return { start: null, end: null };
  return timeRuleWindowAt(rule, date, tz);
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
    if (!window || !window.start || !window.end) continue;
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

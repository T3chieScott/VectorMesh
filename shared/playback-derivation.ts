/**
 * Pure helpers that turn a screen's published schedule blocks into a
 * human-readable "what's playing now / what's up next" status. The logic
 * is shared so both the server (for the /api/screens/:id/playback
 * endpoint) and any future cross-checks (tests, simulators) compute
 * identical answers.
 *
 * A block fires when its `timeRules[0]` admits today's day-of-week and
 * today is within the rule's [startDate, endDate] range. Within a
 * matching day the block fires from `startTime` to `endTime` (HH:MM
 * in the operator's local time).
 *
 * If a block has no time rule it never fires — the operator must add
 * one. We deliberately ignore additional rules beyond the first to
 * stay consistent with the rest of the codebase (see
 * client/src/pages/schedule.tsx getRuleForDay).
 */
import type { TimeRule } from "./schema";

export interface PlaybackBlock {
  id: string;
  name: string;
  timeRules: TimeRule[] | null;
  // Priority mirrors the field on the schedule_blocks table: when two
  // blocks fire concurrently the one with the higher priority wins,
  // matching the player content resolver in /api/player/content.
  priority?: number | null;
}

export type PlaybackStatus =
  | { kind: "playing"; blockId: string; blockName: string; endsAt: Date }
  | { kind: "playsNext"; blockId: string; blockName: string; startsAt: Date }
  | { kind: "noBlockToday" }
  | { kind: "noEvent" };

function parseHHMM(value: string | undefined, base: Date): Date | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const out = new Date(base);
  out.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

// Returns true when `date` falls within `rule`'s recurring window:
// matches one of `daysOfWeek` (or daysOfWeek is empty) and lies between
// startDate and endDate (inclusive at both ends).
export function ruleAdmitsDay(rule: TimeRule, date: Date): boolean {
  const days = rule.daysOfWeek;
  if (days && days.length > 0 && !days.includes(date.getDay())) return false;
  if (rule.startDate) {
    const sd = new Date(rule.startDate);
    if (date < startOfDay(sd)) return false;
  }
  if (rule.endDate) {
    const ed = new Date(rule.endDate);
    if (date > endOfDay(ed)) return false;
  }
  return true;
}

// Returns the [start, end) firing window of `block` on `date`'s day,
// or null if the block doesn't fire that day or has no time rule.
export function blockFiringWindowForDay(
  block: PlaybackBlock,
  date: Date,
): { start: Date; end: Date } | null {
  const rules = block.timeRules || [];
  if (rules.length === 0) return null;
  const rule = rules[0];
  if (!ruleAdmitsDay(rule, date)) return null;
  const start = parseHHMM(rule.startTime, date);
  const end = parseHHMM(rule.endTime, date);
  if (!start || !end) return null;
  if (!(end > start)) return null;
  return { start, end };
}

/**
 * Computes the playback status of a screen. Caller is responsible for
 * filtering `blocks` to those targeting this specific screen and
 * belonging to the screen's *currently-active event's* published
 * programme version. If `hasActiveEvent` is false we don't even look
 * at the blocks — the screen has nothing on for today by definition.
 */
export function derivePlaybackStatus(
  blocks: PlaybackBlock[],
  hasActiveEvent: boolean,
  now: Date,
): PlaybackStatus {
  if (!hasActiveEvent && blocks.length === 0) return { kind: "noEvent" };

  let nowFiring: { block: PlaybackBlock; end: Date; priority: number } | null = null;
  let nextToday: { block: PlaybackBlock; start: Date } | null = null;

  for (const block of blocks) {
    const window = blockFiringWindowForDay(block, now);
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

// Timezone-aware helpers used by both server and client.
//
// All schedule time math (block firing, day-of-week checks, "today at HH:MM",
// next-session calculations) MUST funnel through these helpers so we never
// silently fall back to the runtime's local clock. The runtime is typically
// the server's UTC clock, which means a wall-clock "14:00" block stored
// against a London site fires at 15:00 BST without these helpers.
//
// Implementation note: we use `Intl.DateTimeFormat` with `timeZone` so we
// don't pull in another runtime dependency. The math gets a little gnarly
// for the "DST-correct date for HH:MM in tz" case — `wallTimeOnDateInTz`
// handles the spring-forward / fall-back edge cases by walking the offset.

export const DEFAULT_SCHEDULE_TIMEZONE_FALLBACK = "Europe/London";

// We validate timezones by attempting to construct an Intl.DateTimeFormat
// with the given timeZone option and treating any thrown RangeError as
// "unsupported". This is more robust than relying on
// `Intl.supportedValuesOf("timeZone")` because some Node runtimes return
// the list in a non-canonical case or omit aliases that the formatter
// itself accepts.
const validTimezoneCache = new Map<string, boolean>();
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  const cached = validTimezoneCache.get(tz);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date(0));
    validTimezoneCache.set(tz, true);
    return true;
  } catch {
    validTimezoneCache.set(tz, false);
    return false;
  }
}

export interface TzWallParts {
  /** 0 = Sun … 6 = Sat, in the target timezone. */
  dayOfWeek: number;
  /** 0..1439 — minutes since wall-clock midnight in the target timezone. */
  minuteOfDay: number;
  year: number;
  /** 1..12 (calendar month). */
  month: number;
  /** 1..31 (calendar day-of-month). */
  day: number;
  hour: number;
  minute: number;
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const wallPartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
function getWallPartsFormatter(tz: string): Intl.DateTimeFormat {
  let f = wallPartsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    wallPartsFormatterCache.set(tz, f);
  }
  return f;
}

/** Decompose `now` into wall-clock parts as observed in `tz`. */
export function getWallPartsInTz(now: Date, tz: string): TzWallParts {
  const parts = getWallPartsFormatter(tz).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // `Intl.DateTimeFormat` with hour12:false can yield "24" for midnight in
  // some Node versions — normalise to 0.
  let hour = parseInt(map.hour ?? "0", 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute ?? "0", 10);
  return {
    dayOfWeek: DAY_INDEX[map.weekday ?? "Sun"] ?? 0,
    minuteOfDay: hour * 60 + minute,
    year: parseInt(map.year ?? "1970", 10),
    month: parseInt(map.month ?? "1", 10),
    day: parseInt(map.day ?? "1", 10),
    hour,
    minute,
  };
}

/** Parse "HH:MM" or "H:MM" into {hours, minutes}, or null if malformed. */
export function parseHHMMString(value: string | undefined | null): { hours: number; minutes: number } | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

// === Wall-time-on-date arithmetic =========================================
// We need: given a UTC instant (or a Date representing a "day"), return the
// UTC instant that corresponds to "that calendar day at HH:MM in tz". This
// has to handle DST transitions:
//   - On spring-forward day (e.g. 2026-03-29 in Europe/London) the wall
//     clock jumps from 01:00 GMT to 02:00 BST; "01:30" on that day does
//     not exist. We resolve by snapping forward to 02:00.
//   - On fall-back day the 01:30 wall time happens twice; we pick the
//     first (still-DST) instance for predictability.
//
// Algorithm: get the tz offset (in minutes) at a guess instant using
// `Intl.DateTimeFormat` with `timeZoneName: "shortOffset"`, iterate up to
// twice to converge on the correct UTC instant for the target wall time.

const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();
function getOffsetFormatter(tz: string): Intl.DateTimeFormat {
  let f = offsetFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      timeZoneName: "shortOffset",
    });
    offsetFormatterCache.set(tz, f);
  }
  return f;
}

/** Returns the offset (in minutes east of UTC) that `tz` is observing at the given instant. */
export function getTzOffsetMinutes(instant: Date, tz: string): number {
  const parts = getOffsetFormatter(tz).formatToParts(instant);
  const tn = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // Format is "GMT", "GMT+1", "GMT-5", "GMT+5:30", etc.
  const m = /GMT([+-]?)(\d{1,2})(?::(\d{2}))?/.exec(tn);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = parseInt(m[2] || "0", 10);
  const mins = parseInt(m[3] || "0", 10);
  return sign * (hours * 60 + mins);
}

/**
 * Return a Date representing "the calendar day that contains `dayAnchor`
 * (interpreted in `tz`), at wall-clock HH:MM in `tz`".
 *
 * `dayAnchor` is a UTC instant; we use its tz-local calendar day as the
 * day to anchor on. If the requested HH:MM doesn't exist on that day
 * (spring-forward gap), we snap forward by an hour. If it exists twice
 * (fall-back), we return the FIRST occurrence (the still-DST instance)
 * for predictability — schedules should fire as early as the wall clock
 * permits, not as late.
 *
 * Algorithm: probe the offset at several candidate instants spanning the
 * day, build candidate UTC instants for each distinct offset, then keep
 * only those that actually round-trip back to the requested wall time.
 * If multiple survive (fall-back) we pick the earliest UTC instant. If
 * none survive (spring-forward gap) we recurse one hour later.
 */
export function wallTimeOnDateInTz(
  dayAnchor: Date,
  tz: string,
  hours: number,
  minutes: number,
): Date {
  return wallTimeOnDateInTzImpl(dayAnchor, tz, hours, minutes, 0);
}

function wallTimeOnDateInTzImpl(
  dayAnchor: Date,
  tz: string,
  hours: number,
  minutes: number,
  recursionDepth: number,
): Date {
  const parts = getWallPartsInTz(dayAnchor, tz);
  const targetWallMs = Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0);

  // Sample offsets at several instants around the target so we capture
  // the offsets observed both before and after any DST transition that
  // happens during the day. We bracket the target by ±12h plus a couple
  // of nearby checks so a midnight transition doesn't fool us.
  const sampleInstants = [
    targetWallMs - 12 * 3600_000,
    targetWallMs,
    targetWallMs + 12 * 3600_000,
  ];
  const candidateUtcMs: number[] = [];
  for (const inst of sampleInstants) {
    const off = getTzOffsetMinutes(new Date(inst), tz);
    const cand = targetWallMs - off * 60_000;
    if (!candidateUtcMs.includes(cand)) candidateUtcMs.push(cand);
  }

  // Keep only candidates whose wall-time round-trips to the requested
  // HH:MM on the same calendar day.
  const valid: number[] = [];
  for (const cand of candidateUtcMs) {
    const v = getWallPartsInTz(new Date(cand), tz);
    if (
      v.year === parts.year &&
      v.month === parts.month &&
      v.day === parts.day &&
      v.hour === hours &&
      v.minute === minutes
    ) {
      valid.push(cand);
    }
  }
  if (valid.length > 0) {
    // Fall-back day: prefer the earliest UTC instant (the first
    // occurrence of the wall time, still in DST).
    return new Date(Math.min(...valid));
  }
  // Spring-forward gap: requested wall time doesn't exist this day.
  // Snap forward by an hour. Cap recursion in case of pathological zones.
  if (recursionDepth < 2 && hours < 23) {
    return wallTimeOnDateInTzImpl(dayAnchor, tz, hours + 1, minutes, recursionDepth + 1);
  }
  // Last-resort fallback: just trust the offset observed at the target
  // instant. Better to be off by an hour than to throw.
  const off = getTzOffsetMinutes(new Date(targetWallMs), tz);
  return new Date(targetWallMs - off * 60_000);
}

/** Parse a YYYY-MM-DD date string and return the UTC instant for 00:00 wall-clock in tz. */
export function startOfDayInTz(yyyymmdd: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  // Sample offsets at several instants around the requested date so we
  // capture both pre/post-DST offsets *and* extreme zones (UTC+14 like
  // Pacific/Kiritimati, UTC-12 like Etc/GMT+12) where 12:00 UTC on the
  // requested date can land on the wrong tz-local calendar day.
  const targetWallMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const sampleInstants = [
    targetWallMs - 24 * 3600_000,
    targetWallMs - 12 * 3600_000,
    targetWallMs,
    targetWallMs + 12 * 3600_000,
    targetWallMs + 24 * 3600_000,
  ];
  const candidateUtcMs: number[] = [];
  for (const inst of sampleInstants) {
    const off = getTzOffsetMinutes(new Date(inst), tz);
    const cand = targetWallMs - off * 60_000;
    if (!candidateUtcMs.includes(cand)) candidateUtcMs.push(cand);
  }
  // Keep candidates whose tz-local wall time really is YYYY-MM-DD 00:00.
  const valid: number[] = [];
  for (const cand of candidateUtcMs) {
    const v = getWallPartsInTz(new Date(cand), tz);
    if (
      v.year === year && v.month === month && v.day === day &&
      v.hour === 0 && v.minute === 0
    ) {
      valid.push(cand);
    }
  }
  if (valid.length > 0) {
    // Fall-back day: prefer the earliest UTC instant.
    return new Date(Math.min(...valid));
  }
  // Spring-forward right at midnight (very rare — e.g. America/Havana). Snap
  // forward by an hour so we still return an instant on the correct
  // calendar day.
  const off = getTzOffsetMinutes(new Date(targetWallMs + 3600_000), tz);
  return new Date(targetWallMs + 3600_000 - off * 60_000);
}

/** Same as `startOfDayInTz` but returns the instant just after 23:59:59.999 wall-clock. */
export function endOfDayInTz(yyyymmdd: string, tz: string): Date | null {
  const start = startOfDayInTz(yyyymmdd, tz);
  if (!start) return null;
  // Compute the start of the *next* calendar day in tz, then back off 1ms.
  // We add 26h (more than any DST transition) and recompute the wall date
  // from there so DST contractions/expansions don't shift us off the
  // correct day boundary.
  const nextDayParts = getWallPartsInTz(new Date(start.getTime() + 26 * 3600_000), tz);
  const nextDayString = `${nextDayParts.year.toString().padStart(4, "0")}-${
    nextDayParts.month.toString().padStart(2, "0")
  }-${nextDayParts.day.toString().padStart(2, "0")}`;
  const nextStart = startOfDayInTz(nextDayString, tz);
  if (!nextStart) return null;
  return new Date(nextStart.getTime() - 1);
}

/**
 * Return just the short timezone abbreviation (e.g. "BST", "EST", "GMT") if
 * one can be extracted, falling back to a "UTC±H[:MM]" offset string when
 * the runtime only offers GMT-based names. Useful for compact in-place
 * labels like "14:00 (BST)".
 *
 * Different ICU locales spell these abbreviations differently — `en-US`
 * returns "GMT+1" for London summer, while `en-GB` returns "BST". Try
 * `en-GB` first because that surfaces the canonical regional abbreviations
 * operators expect.
 */
export function getTzAbbreviation(now: Date, tz: string): string {
  if (!isValidTimezone(tz)) return tz;
  // Accept any short name that isn't a synthetic offset placeholder like
  // "GMT+1" or "UTC-5". Bare "GMT" / "UTC" *are* the canonical names for
  // some zones (e.g. Europe/London in winter) so we keep them.
  const isOffsetPlaceholder = (s: string) => /^(GMT|UTC)[+-]/.test(s);
  for (const locale of ["en-GB", "en-US"]) {
    try {
      const parts = new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        timeZoneName: "short",
      }).formatToParts(now);
      const candidate = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
      if (candidate && !isOffsetPlaceholder(candidate)) {
        return candidate;
      }
    } catch {
      // try the next locale
    }
  }
  // Fall back to the numeric UTC offset.
  const offsetMin = getTzOffsetMinutes(now, tz);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return mm === 0 ? `UTC${sign}${hh}` : `UTC${sign}${hh}:${String(mm).padStart(2, "0")}`;
}

/** Format a tz like "BST, UTC+1" for human display. */
export function describeTzOffset(now: Date, tz: string): string {
  if (!isValidTimezone(tz)) return tz;
  const offsetMin = getTzOffsetMinutes(now, tz);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  const offsetStr = mm === 0 ? `UTC${sign}${hh}` : `UTC${sign}${hh}:${String(mm).padStart(2, "0")}`;
  const abbrev = getTzAbbreviation(now, tz);
  // If the abbreviation is just the numeric fallback we already produced,
  // don't double it up.
  if (abbrev && !abbrev.startsWith("UTC")) {
    return `${abbrev}, ${offsetStr}`;
  }
  return offsetStr;
}

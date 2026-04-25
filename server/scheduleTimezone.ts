import { DEFAULT_SCHEDULE_TIMEZONE_FALLBACK, isValidTimezone } from "@shared/timezone-utils";

let cached: string | null = null;

/**
 * Resolve the install-wide default IANA timezone for newly-created sites.
 *
 * Reads `DEFAULT_SCHEDULE_TIMEZONE` from the environment (validated against
 * `Intl.DateTimeFormat`). Falls back to `Europe/London` when the env var
 * is missing or names a zone the runtime doesn't recognize. The result is
 * cached for the life of the process; tests that need to override it
 * should call `resetDefaultScheduleTimezoneCache()` between cases.
 */
export function getDefaultScheduleTimezone(): string {
  if (cached !== null) return cached;
  const envValue = (process.env.DEFAULT_SCHEDULE_TIMEZONE ?? "").trim();
  if (envValue && isValidTimezone(envValue)) {
    cached = envValue;
    return cached;
  }
  if (envValue) {
    console.warn(
      `[scheduleTimezone] Ignoring invalid DEFAULT_SCHEDULE_TIMEZONE='${envValue}', falling back to ${DEFAULT_SCHEDULE_TIMEZONE_FALLBACK}.`,
    );
  }
  cached = DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
  return cached;
}

/** Test-only: clear the memoized value so the next call re-reads env. */
export function resetDefaultScheduleTimezoneCache(): void {
  cached = null;
}

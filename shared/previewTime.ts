/**
 * Preview-time helpers shared between the player and monitor preview-at paths.
 *
 * A preview anchor is a naïve local wall-clock string "YYYY-MM-DDTHH:mm:ss":
 *   - No Z suffix.
 *   - No numeric UTC offset.
 *   - Seconds are required.
 *
 * Server-side: call naiveWallClockToAbsolute() to convert to an absolute Date
 * in the screen's configured timezone, independent of the production server's
 * own local timezone.
 *
 * Advancing preview clock: the client tracks elapsed real time since page load
 * and sends it on each poll (?elapsed_ms=N). The server adds it to the anchor
 * so the preview clock continues advancing rather than freezing.
 *
 *   effectiveNow = naiveWallClockToAbsolute(at, screenTz) + elapsedMs
 */

import { startOfDayInTz, wallTimeOnDateInTz } from "./timezone-utils";

/**
 * Regex for the accepted ?at= format: "YYYY-MM-DDTHH:mm:ss".
 * No Z suffix, no UTC offset, seconds required.
 */
export const PREVIEW_AT_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Returns `raw` if it matches the YYYY-MM-DDTHH:mm:ss format exactly, or
 * `undefined` otherwise.  Rejects Z suffixes, numeric UTC offsets, date-only
 * strings, and any other timezone designator — the caller must supply the
 * screen's IANA timezone separately.
 *
 * Designed to be safe on untrusted input: never throws.
 */
export function validatePreviewAtFormat(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return PREVIEW_AT_REGEX.test(raw) ? raw : undefined;
}

/**
 * Convert a naïve "YYYY-MM-DDTHH:mm:ss" wall-clock string to an absolute Date,
 * interpreted in `tz`.
 *
 * Returns `null` for malformed input.  Never throws.
 *
 * DST policy (inherited from wallTimeOnDateInTz / startOfDayInTz):
 *   - Spring-forward gap: snaps forward by one hour so the result always
 *     falls on the requested calendar day.
 *   - Fall-back duplicate: picks the FIRST (still-DST) occurrence.
 *
 * The result is independent of the production server's local timezone; only
 * the explicitly supplied `tz` argument is used for conversion.
 */
export function naiveWallClockToAbsolute(naiveStr: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(naiveStr);
  if (!m) return null;

  const hours   = parseInt(m[4], 10);
  const minutes = parseInt(m[5], 10);
  const seconds = parseInt(m[6], 10);

  // Basic range sanity — avoid feeding nonsense to the Intl machinery.
  if (
    hours   < 0 || hours   > 23 ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59
  ) return null;

  const dayStr    = naiveStr.slice(0, 10); // "YYYY-MM-DD"
  const dayAnchor = startOfDayInTz(dayStr, tz);
  if (!dayAnchor) return null;

  // wallTimeOnDateInTz correctly resolves HH:MM in `tz` with DST edge-case
  // handling (spring-forward / fall-back).  Add the seconds component on top.
  const withMinutes = wallTimeOnDateInTz(dayAnchor, tz, hours, minutes);
  return new Date(withMinutes.getTime() + seconds * 1_000);
}

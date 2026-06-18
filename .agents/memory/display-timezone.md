---
name: Display wall-clock times use the site timezone
description: Player-facing displays must format times in the site's IANA tz, not the device clock.
---

# Display wall-clock times use the site timezone

Any player-facing display that shows wall-clock times (kick-off times, agenda
slots, schedules) must format them in the owning site's configured IANA
timezone (`clients.timezone`, default `Europe/London`) using the DST-aware
helpers in `shared/timezone-utils.ts` (`getWallPartsInTz`, `isValidTimezone`,
etc.). Never rely on the browser/device local clock.

**Why:** Displays run on Raspberry Pi nodes whose OS clock is frequently wrong
(e.g. left on UTC instead of BST), so device-local `Date` formatting shows
times that are off by the device's tz offset. A user in BST saw kick-off times
1 hour behind. The fix is a real tz conversion, NOT a blanket +1h.

**How to apply:** The server stamps the resolved tz onto the display payload
(resolve with `isValidTimezone` + `DEFAULT_SCHEDULE_TIMEZONE_FALLBACK`); the
client reads `payload.timezone` and passes it (with a `Europe/London` fallback
for old cached payloads) into every Intl `timeZone` call and same-day
comparison. When adding a new storage dependency (e.g. `getClient`) to a routes
module that has its own storage interface, also add it to that interface AND to
every test mock, or the route will 500 at runtime under tests.

## Per-screen timezone override

A site has ONE timezone, but a screen can be physically elsewhere (e.g. a
France-located display on a London-default site). Screens carry a nullable
`timezone` column (null = inherit the site tz) that overrides the payload tz
for that screen only. The override reaches the display as a `timezoneOverride`
prop folded into the effective `data.timezone` at a single chokepoint.

**Why:** Match data is in UTC and correct; only the per-location wall-clock
formatting was wrong. The user explicitly chose a centrally-controlled
per-screen setting over auto-detecting the device clock (Pi clocks are
unreliable — see above).

**How to apply:** ALWAYS validate an override timezone with `isValidTimezone`
before it reaches any Intl `timeZone` call — an operator typo or a bad `?tz=`
query param on the unauthenticated public display URL throws `RangeError` and
blanks the screen. Invalid → fall back to the payload/site tz. Keep the
override prop SEPARATE from the zone-renderer's existing `timezone` prop, which
drives the weather/clock zones, not time-formatting widgets.

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

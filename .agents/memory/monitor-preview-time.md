---
name: Monitor preview-time support
description: How ?at=YYYY-MM-DDTHH:mm:ss preview-time works in the monitor content endpoint, and the advancing-clock protocol.
---

## Rule
Monitor preview-time uses a naïve wall-clock anchor + elapsed_ms protocol, not a UTC ISO timestamp.

## How it works
- `validatePreviewAtFormat` (shared/previewTime.ts) accepts only `YYYY-MM-DDTHH:mm:ss` — no Z, no offset.
- `naiveWallClockToAbsolute(naiveStr, screenTz)` converts using the **screen's** `clients.timezone` via existing `startOfDayInTz` + `wallTimeOnDateInTz` (DST-safe).
- Client sends `?at=<naiveStr>&elapsed_ms=<Date.now()-pageLoadMs>` on every content poll.
- Server returns `previewAnchorEpoch` (epoch ms of resolved anchor) in the response body.
- Client computes `agendaTestAt = new Date(previewAnchorEpoch + elapsed).toISOString()` on each render so agenda zones advance in real time between polls.
- Preview requests **bypass** `playerContentCache` (never pollute real-time cache).
- Auth check (`validateMonitorCookie`) runs before `?at=` is ever read — adding `?at=` cannot bypass the cookie gate.

**Why:** The server must own the timezone conversion because the monitor client has no knowledge of the screen's IANA timezone. The elapsed_ms protocol keeps the preview clock advancing rather than freezing at the anchor.

**How to apply:** Any future change to the monitor content path that touches `resolveMonitorContent` must preserve the `atRaw`/`elapsedMs` parameters and the cache-bypass guard.

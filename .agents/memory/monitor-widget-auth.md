---
name: Monitor widget auth
description: How widget data fetches are routed for Monitor sessions vs Player vs admin — the widgetBaseUrl pattern.
---

# Monitor widget auth

## The rule
Monitor clients have no `deviceToken` and no user login session. Widget fetches must go to `/api/monitor/widgets/…` (session-cookie auth), not `/api/widgets/…` (requireAuth = user login) and not `/api/player/widgets/…` (device token).

## How to apply
`ZoneRenderer` derives `widgetBaseUrl` from `mediaBaseUrl` at render time:
```
"/api/player/media"  → "/api/player"  → /api/player/widgets/…  (device token in ?token= param)
"/api/monitor/media" → "/api/monitor" → /api/monitor/widgets/… (session cookie, no token)
undefined            → "/api"         → /api/widgets/…         (user session, admin/simulator)
```
All backend-fetching widgets receive this as a `widgetBaseUrl` prop and form their endpoint as `${widgetBaseUrl}/widgets/<path>`.

Server-side, each monitor route uses the `requireMonitorSession` middleware (wraps `validateMonitorCookie`) and the same handler as the player/admin variants.

## Why
`requireAuth` checks for an authenticated Passport user session. Monitor sessions are a separate concept (cookie holding `monitorSessionId:rawSecret`, validated by `validateMonitorCookie` in `server/operations/index.ts`). The two are never interchangeable.

## Affected widgets (as of fix)
news, weather-forecast, heathrow/arrivals, heathrow/departures, earthquakes/recent, aircraft/overhead, spacex/next-launch, football/premier-league/table, football/premier-league/fixtures.

Premier League table/fixtures widget *implementations* were not verified — see task #354.

## Key files
- `client/src/components/zone-renderer.tsx` — `widgetBaseUrl` computation + prop threading
- `server/routes.ts` — `requireMonitorSession` middleware + `/api/monitor/widgets/…` registrations (~line 4140)
- `server/operations/index.ts` — `validateMonitorCookie` export

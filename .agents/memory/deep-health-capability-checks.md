---
name: Deep health capability checks
description: Safety boundary for reporting readiness of authentication and screen-management flows.
---

Capability checks for mutating application flows must validate only fixed,
read-only prerequisites and explicitly state that the route was not executed.
Authentication readiness includes configuration and the base-table/column
metadata required by password, 2FA, and session behavior; screen readiness
includes real base-table and required screen metadata rather than accepting
views as substitutes.

**Why:** Recurring health probes must not create sessions, audit records,
screens, pairing state, notifications, or provider traffic. A false-green
result is also harmful when schema drift breaks a mutating route.

**How to apply:** Keep capability results grouped separately from ordinary
dependencies while retaining the complete flat result list. Database probes
must use a bounded isolated client and destroy it when the health abort signal
or query error wins, so abandoned catalog work cannot accumulate in the shared
pool.
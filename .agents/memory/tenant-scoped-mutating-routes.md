---
name: Tenant-scoped mutating routes invariant
description: Rule every site-scoped create/update/delete HTTP route in this app must follow to avoid cross-tenant writes.
---
Every mutating route over a site-scoped resource (media assets, layouts,
agenda, programmes, etc.) MUST: run `loadUserContext`, then check
`canAccessClient(req, existing.clientId)` on the row being changed, AND —
when the body carries a `clientId` that differs from the current owner —
check `canAccessClient(req, body.clientId)` too (reject cross-site moves
with a `/target site/` error). Reads must filter by `getAllowedClientIds`.

**Why:** A `PATCH /api/media/:id` handler once shipped with only
`requireAuth` — no `loadUserContext`, no ownership check, no body
validation — so any authenticated user (incl. single-site users) could
edit or reassign any client's media. It was invisible because the UI
never exercised the hole. The same class of gap is easy to reintroduce
when adding a new route quickly.

**How to apply:** When adding/reviewing any `app.post/patch/delete` on a
site-scoped path, confirm the load-context + dual canAccessClient checks
are present. The media/layout routes now live in
`server/mediaLayoutRoutes.ts` (extracted like `server/agendaRoutes.ts`)
specifically so these boundaries can be exercised with HTTP-level stub
tests; keep new tenant routes testable the same way.

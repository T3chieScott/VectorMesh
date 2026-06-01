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

**Indirectly-scoped resources:** some rows have no direct `clientId` and
must resolve it through a chain. Schedule blocks resolve via
programme version → programme → event → `event.clientId`; live overrides
resolve via nullable `eventId` → `event.clientId`. Mirror the programme
pattern: when the chain yields an event, enforce `canAccessClient` on it;
a missing/absent link is treated as accessible (so orphans aren't bricked),
EXCEPT enforce a target check when a mutation sets a new `eventId`.
Handlers that take an OPTIONAL `canAccessClient` param (e.g.
`buildScreenPatchHandler`, `buildScreenRegeneratePairingHandler`) only
enforce when the route passes it in — so the production route MUST also
mount `loadUserContext` and pass `canAccessClient`, or the check silently
no-ops.

**Two easy-to-miss move/bulk gaps (don't reintroduce):**
- A patchable owning FK is a move vector. If a PATCH body can change the
  field that resolves the site (e.g. a schedule block's
  `programmeVersionId`, a playlist's `clientId`/`eventId`), you must
  authorize BOTH the current owner AND the target — checking only the
  existing owner still lets a one-site user push a row into another site.
- A bulk/series delete keyed by a shared id (e.g.
  `deleteScheduleBlocksBySeries`) can span multiple sites. Authorize
  EVERY distinct owning resource the set touches before deleting, not
  just `rows[0]` — and refresh all touched versions, not just the first.

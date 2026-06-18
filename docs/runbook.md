# VectorMesh Operations Runbook

Operational recovery notes for one-shot boot tasks and tenant-scoping invariants.

## Canvas pairing — one-shot repair marker (Task #179)

The boot path runs `repairFalseCanvasPairingsOnce()` which gates the
Task #176 false-canvas-pairing repair behind a `system_settings` marker
keyed `canvas_pairing_repair_176_completed`. The marker is claimed
*atomically* (insert with `ON CONFLICT DO NOTHING`) **before** the
repair runs, then stamped with the final outcome on success.

Boot log lines:
- `[canvas-pairing] one-shot repair already completed for this DB; skipping` — marker present, no work done.
- `[canvas-pairing] one-shot repair ran with nothing to fix` — marker absent, repair ran, found no damaged rows, marker now written.
- `[canvas-pairing] one-shot repair fixed N false-canvas-pairing row(s)` — marker absent, repair fixed N rows, marker now written.

**Recovery — marker stuck in `running` state**: if the server crashes
between the marker claim and the completion stamp, the marker stays at
`status: "running"` and every subsequent boot will skip the repair.
To force a re-run, delete the row by hand:

```sql
DELETE FROM system_settings WHERE key = 'canvas_pairing_repair_176_completed';
```

The next boot will re-claim the marker and run the repair. The
underlying repair is idempotent against clean data, so re-running on a
healthy DB is a safe no-op.

## Canvas groups — explicit-grouping backfill marker (Task #189)

The boot path runs `backfillExplicitCanvasGroupsOnce()` which gates the
Task #189 explicit-grouping backfill behind a `system_settings` marker
keyed `canvas_groups_backfill_189_completed`. The marker is claimed
*atomically* (insert with `ON CONFLICT DO NOTHING`) **before** the
backfill runs, so concurrent boots cannot both produce `canvas_groups`
rows; only the winner runs and the loser returns `{ skipped: true }`.
On success the marker is stamped with `status: "completed"` plus
`groupsCreated` / `screensStamped` counts for forensics.

Boot log lines:
- `[canvas-groups] explicit-grouping backfill already completed for this DB; skipping` — marker present, no work done.
- `[canvas-groups] explicit-grouping backfill: created N group(s), stamped M screen(s)` — marker absent, backfill ran and stamped completion.

**Recovery — marker stuck in `running` state**: if the server crashes
between the marker claim and the completion stamp, the marker stays at
`status: "running"` and every subsequent boot will skip the backfill,
leaving any unstamped canvas screens without a `canvasGroupId`. To
force a re-run, delete the row by hand:

```sql
DELETE FROM system_settings WHERE key = 'canvas_groups_backfill_189_completed';
```

The next boot will re-claim the marker and run the backfill. The
backfill only touches screens with `canvasGroupId IS NULL`, so
re-running on a healthy (fully-stamped) DB is a safe no-op.

## Player media payload — per-screen site scope (Task #239)

`GET /api/player/:screenId/content` site-scopes `content.media` through
`server/playerMediaFilter.ts → filterMediaAssetsForScreen()`. The
response only contains media assets that are either owned by the
screen's `clientId` or explicitly shared with that client via the
`media_shares` table — mirroring the admin `GET /api/media` filter. A
screen with no `clientId` (orphan row) gets an empty list, never the
whole estate.

This invariant matters because the player's zone-renderer falls back
to `zone.mediaId ? filter : media` for media zones with no specific
asset selected. Without server-side scoping, that fallback rotated
through every uploaded file across all clients — a cross-tenant data
leak. Don't reintroduce an unfiltered `storage.getMediaAssets()` call
in any player-facing endpoint.

Defensive client check: `client/src/components/zone-renderer.tsx`
logs a one-shot `[player-content]` warning when a media zone's
`mediaId` references an asset that isn't in the site-scoped payload
(stale cross-site reference or since-deleted asset), instead of
silently rendering empty.

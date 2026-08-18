# SharePoint Excel Connector — Production Deployment Checklist

Use this checklist before enabling the SharePoint Excel agenda connector
in a production environment.

---

## Database migration

- [ ] Migration `0026_agenda_snapshots.sql` has been applied.
  ```sql
  -- Verify tables exist:
  SELECT to_regclass('agenda_item_snapshots');  -- must not be null
  SELECT column_name FROM information_schema.columns
    WHERE table_name = 'agenda_sync_configs'
      AND column_name IN ('last_ctag','last_good_snapshot_id');
  -- Must return 2 rows.
  ```
- [ ] `ensureAgendaSnapshotsMigration()` ran successfully at server startup.
  Check logs for:
  ```
  [ensureAgendaSnapshotsMigration] agenda_item_snapshots table ready
  ```
- [ ] No outstanding `ALTER TABLE` errors in the startup log.

---

## Microsoft integration

- [ ] Microsoft OneDrive integration is **Connected** in Settings → Integrations.
- [ ] The service account / delegated user has at least **Read** permission on
  the target SharePoint site and Excel workbook.
- [ ] OAuth token refresh is working (check that syncs succeed after > 1 hour).

---

## Environment variables / secrets

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Express session signing |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| OneDrive OAuth credentials | Yes | Managed by the Replit OneDrive integration |

No additional environment variables are required for the SharePoint Excel
connector itself — all Graph API access flows through the shared OneDrive
integration credential.

---

## Sync config validation

- [ ] At least one SharePoint Excel sync config has been created and saved.
- [ ] The config shows **Microsoft sign-in enabled** in the edit dialog.
- [ ] A manual **Refresh now** completes successfully before enabling
  automatic sync.
- [ ] The sync row shows **Snapshot active** after the first successful sync.

---

## Performance gate

Run a one-time performance check with your largest expected workbook:

1. Upload or point to the largest Excel file the connector will process.
2. Click **Refresh now** and observe the server log timing.
3. Confirm the sync completes in under 30 seconds.
4. Confirm heap usage stays below the `NODE_OPTIONS=--max-old-space-size=4096`
   limit (monitor with `process.memoryUsage()` or your APM tool).

The connector uses a streaming XLSX reader (ExcelJS `WorkbookReader`) to
avoid materialising the entire workbook in memory.

---

## Display continuity verification

Before go-live, simulate a source outage to confirm displays remain live:

1. Trigger a successful sync — confirm **Snapshot active** badge.
2. Temporarily revoke the Microsoft token or point the source URL at a
  non-existent file.
3. Click **Refresh now** — verify the sync fails but existing displays still
  show the schedule (served from the last-good snapshot).
4. Restore the connection and re-sync — confirm displays update.

---

## Monitoring

| Metric | Alert threshold |
|---|---|
| `consecutiveFailureCount` on any sync config | ≥ 3 consecutive failures |
| Snapshot age | > 2 × sync interval with no new snapshot |
| Server heap | > 3 GB sustained |

The feed-failing alerter (Task #220) automatically emails nominated
recipients when a feed exceeds the consecutive-failure threshold. Confirm
alert recipients are configured in **Settings → Alerts**.

---

## Rollback plan

If the migration or connector causes issues:

1. Stop the server.
2. Run:
   ```sql
   ALTER TABLE agenda_sync_configs
     DROP COLUMN IF EXISTS last_ctag,
     DROP COLUMN IF EXISTS last_good_snapshot_id;
   DROP TABLE IF EXISTS agenda_item_snapshots;
   ```
3. Revert to the previous server build.
4. Restart the server — existing live-row agenda items are unaffected.

> **Note:** Rolling back removes all snapshots. Displays for MS-backed
> sources will fall back to live `agenda_items` rows, which remain intact.

---

## Sign-off

| Check | Owner | Date |
|---|---|---|
| Database migration verified | | |
| Microsoft connection tested | | |
| Manual sync end-to-end verified | | |
| Display continuity verified | | |
| Performance gate passed | | |
| Alert recipients configured | | |

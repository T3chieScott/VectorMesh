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

## Microsoft integration (Entra OAuth — Task #369)

> **Changed in Task #369.** The connector now uses a first-party
> Microsoft Entra (Azure AD) application instead of the Replit connector
> proxy. The Replit OneDrive/SharePoint connectors are **no longer required**
> in production. They are only used as a development fallback in Replit
> when `NODE_ENV` is not `production`.

### Entra app registration (one-time)

1. Register a new **single-tenant** application in Entra (or Azure Portal →
   App registrations → New registration).
2. Add a **Web** redirect URI: the value of `MICROSOFT_REDIRECT_URI` below.
3. Generate a **Client secret** and note the Application (client) ID,
   Directory (tenant) ID and the secret value.
4. Grant **API permissions** (Microsoft Graph, Delegated):
   - `openid`, `profile`, `offline_access`
   - `User.Read`
   - `Files.Read.All`
   No write scopes must appear. Admin consent is required for `Files.Read.All`.

### First-time connection

After deploying with the environment variables set, a **system administrator**
must visit **Agenda → Sync Sources → (any Microsoft source) → Edit** and click
**Connect Microsoft account**. This triggers the Entra OAuth flow in the browser
and persists the encrypted credential to the database.

### Verification

- [ ] Server log shows `[ensureMicrosoftOAuthMigration] microsoft_oauth_tokens table ready`.
- [ ] A system administrator has completed the connect flow (status shows
  "Microsoft account connected" in the sync-source dialog).
- [ ] A manual **Refresh now** succeeds on at least one Microsoft-backed
  sync config.
- [ ] OAuth token refresh is working (check that syncs succeed after > 1 hour).

### Disconnect / revoke

A system administrator can disconnect the account from the sync-source dialog.
This deletes only the encrypted credential row; no agenda data is affected.
To fully revoke access, also remove the app's delegated permissions in Entra.

---

## Environment variables / secrets

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Express session signing |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `MICROSOFT_TENANT_ID` | Yes | Entra tenant ID (or `organizations` for multi-tenant work accounts) |
| `MICROSOFT_CLIENT_ID` | Yes | Entra app Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Yes | Entra app client secret |
| `MICROSOFT_REDIRECT_URI` | Yes | Full callback URL, e.g. `https://your-domain.com/api/agenda/microsoft/callback` |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | Yes | 32-byte key as 64-char hex string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> **Never log or commit these values.** The server performs strict startup
> validation and will throw if any of the five Microsoft env vars are absent
> in production.

### Rollback for Microsoft OAuth migration

```sql
-- Remove the credential table only. No agenda data is affected.
DROP TABLE IF EXISTS microsoft_oauth_tokens;
```

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

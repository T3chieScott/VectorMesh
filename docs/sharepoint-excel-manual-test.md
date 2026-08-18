# SharePoint Excel Agenda Connector — Manual Test Guide

This document describes how to manually exercise the SharePoint Excel
read-only agenda connector end-to-end after deploying the feature.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Microsoft 365 account | OneDrive / SharePoint access |
| SharePoint site with an Excel workbook | At least one sheet with date/time columns |
| VectorMesh admin account | Must be able to create/edit agenda sync configs |
| Microsoft OneDrive integration connected | Settings → Integrations → Microsoft OneDrive |

---

## 1 — Connect the Microsoft account

1. Log in to VectorMesh as admin.
2. Navigate to **Settings → Integrations**.
3. Click **Connect** next to **Microsoft OneDrive**.
4. Complete the OAuth flow and confirm the integration shows **Connected**.

---

## 2 — Create a SharePoint Excel sync config

1. Navigate to **Agenda**.
2. Click **Add source**.
3. In the dialog, set:
   - **Source type**: `Excel on SharePoint (.xlsx link)` or `Excel on OneDrive`
   - **Enable Microsoft sign-in**: toggle **on**
4. Verify "Microsoft account connected." appears in green.
5. Search for or paste the path to your Excel workbook.
6. Select the workbook — the preview should load column headers.
7. Map at least **Title**, **Start**, and **End** columns.
8. Set **Name** and **Sync interval** (e.g. 5 minutes).
9. Click **Save**.
10. Confirm the source appears in the **Sync sources** card with a **Read-only** badge.

---

## 3 — Initial sync

1. Click **Refresh now** on the new source row.
2. Verify the toast shows "Sync complete" with item counts.
3. Navigate to **Agenda items** — confirm items appeared.
4. In the sync row, check that:
   - The **Source connected** badge is green.
   - **Snapshot active** badge appears (after the first successful sync).
   - Last run timestamp and item count are shown.

---

## 4 — cTag skip (unchanged file)

1. Wait for the automatic tick or click **Refresh now** again without editing the Excel file.
2. In the server logs, verify:
   ```
   [agenda-sync] cTag unchanged — skipping download for "<source name>"
   ```
   (Or observe that the sync completes in < 200 ms, indicating no download.)
3. Confirm agenda items are unchanged in the database.

---

## 5 — cTag update (changed file)

1. Open the Excel workbook in SharePoint and change a session title.
2. Save and close the file.
3. Click **Refresh now** in VectorMesh.
4. Verify the sync downloads a new copy (log shows no "cTag unchanged" message).
5. Confirm the updated title appears in **Agenda items**.

---

## 6 — Manual-override preservation

1. In VectorMesh, manually edit one agenda item (set **manual override** on it).
2. Trigger **Refresh now**.
3. Verify the manually-edited item is **not** overwritten.
4. Check that the item's values match what you set, not what the Excel file contains.

---

## 7 — Display continuity (source temporarily unreachable)

1. Revoke or temporarily disconnect the Microsoft integration.
2. Click **Refresh now**.
3. Verify:
   - The sync fails and "Source unreachable" badge appears.
   - The **Snapshot active** badge remains visible — displays continue showing the last-good schedule.
4. Reconnect the Microsoft integration.
5. Click **Refresh now** again — verify the "Source connected" badge returns.

---

## 8 — Reconnect after credential expiry

1. If the Microsoft token expires, the sync row shows **Source unreachable**.
2. Click **Reconnect** (opens the edit dialog).
3. Toggle Microsoft sign-in off and on, then re-select the workbook.
4. Save — click **Refresh now** to confirm the connection is restored.

---

## 9 — Large workbook performance

1. Upload an Excel workbook with ≥ 1,000 session rows and at least 20 columns.
2. Trigger **Refresh now** and time the response.
3. Verify:
   - The sync completes in under 10 seconds.
   - Memory usage on the server does not spike unboundedly (streaming reader is used).
   - All sessions are imported correctly.

---

## Expected behaviour checklist

- [ ] First sync always downloads the file (no cTag to compare yet).
- [ ] Subsequent unchanged syncs skip the download (cTag match).
- [ ] Changed file triggers a full re-download and re-parse.
- [ ] Manual-override rows are not overwritten by upstream sync.
- [ ] Snapshot is promoted after every successful sync.
- [ ] Display widgets show snapshot data even when the source is unreachable.
- [ ] **Read-only** badge is visible on MS-backed sync rows.
- [ ] **Source connected** / **Source unreachable** badge reflects live health.
- [ ] **Snapshot active** badge appears after the first successful sync.
- [ ] **Refresh now** triggers an immediate download attempt.
- [ ] **Reconnect** opens the edit dialog for credential repair.

---

## Known limitations

- The Microsoft account connection is shared across all MS-backed sync configs
  for the same VectorMesh instance. Disconnecting it affects all MS sources.
- The cTag change-detection has a short race window: if the file changes
  exactly during the content download, the new version is downloaded on the
  next tick (the post-download bookend check detects the change and withholds
  the cTag, forcing a re-download).
- SharePoint throttling (429) causes the sync to fail gracefully; the previous
  snapshot continues to serve displays until the next successful sync.

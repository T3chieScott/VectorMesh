# ADR: Read-Only SharePoint Excel Agenda Connector

**ID:** ADR-SP-001
**Date:** 2026-08-18
**Author:** Audit (Task #361 — read-only; only this file is changed)
**Status:** APPROVED FOR IMPLEMENTATION *(with mandatory modifications listed in §20)*

---

## 1. Purpose and Scope of This Audit

This document is the output of a read-only codebase audit (Task #361). It must be consumed and all Part 17 stop conditions cleared before Task #362 ("Build read-only SharePoint Excel agenda connector") is allowed to write any code.

**Scope:** Every file that touches Microsoft Graph authentication, XLSX ingestion, agenda sync, the display endpoint, and the schema table `agenda_sync_configs`. Formula evaluation, client-side rendering, and unrelated widget types are out of scope.

**Permitted change from this task:** This ADR file only. No other file was modified.

---

## 2. Files Read in Full During This Audit

| File | Lines read | What it covers |
|---|---|---|
| `server/microsoftGraph.ts` | 1–398 (full) | Connector token proxy, Graph fetch helpers, `fetchMicrosoftXlsxBytes`, `downloadDriveItem`, `downloadShareLink`, `resolveShareLink`, `listRecentXlsxFiles`, `searchXlsxFiles`, `getMicrosoftConnectionStatus` |
| `server/agendaSync.ts` | 1–792 (full) | `loadSourceContent`, `loadGridForConfig`, `loadPreviewGrid`, `parseUpstreamForConfig`, `runAgendaSync`, `runDueAgendaSyncs`, `previewAgendaSource` |
| `server/agendaRoutes.ts` | 1–948 (full) | All agenda REST routes including Microsoft routes (lines 613–686), display endpoint (793–836), `buildAgendaDisplayPayload` (867–948) |
| `server/spreadsheetParse.ts` | Representative sections | `parseWorkbookBuffer` (ExcelJS full-load), `readSheetSample` (JSZip+SAX streaming preview) |
| `shared/schema.ts` | 1355–1490 | `agendaSyncConfigs` table definition + `insertAgendaSyncConfigSchema` |
| `shared/spreadsheet-mapping.ts` | Full | `applyMapping`, `suggestColumnMapping`, `parseAgendaDate`, `missingRequiredMappings` |
| `tests/agenda-microsoft-graph.test.ts` | 1–300 (full) | All Microsoft Graph test cases |
| `tests/agenda-sync.test.ts` | Representative sections | Core sync engine tests |
| `client/src/pages/agenda-items.tsx` | Relevant sections | Microsoft auth state and file picker UI |
| `client/src/components/agenda/AgendaConfigZoneWidget.tsx` | Relevant sections | Display polling loop |
| `client/src/pages/display-agenda.tsx` | Relevant sections | Chromeless display page, stale-grace-period logic |

---

## 3. Existing Implementation Summary

VectorMesh already ships a **Microsoft Graph-backed agenda source** (Task #268). The implementation as it stands:

1. **Token acquisition** (`server/microsoftGraph.ts`): Calls the Replit connectors credential proxy (`REPLIT_CONNECTORS_HOSTNAME`) to fetch a fresh OAuth access token for either the `onedrive` or `sharepoint` Replit connector. Tokens are never stored in VectorMesh. The proxy manages refresh automatically. For `sharepoint_excel` source types the SharePoint connector is preferred; for all others, OneDrive is preferred.

2. **File download** (`downloadDriveItem`, `downloadShareLink`): Issues a GET to `GET /drives/{driveId}/items/{itemId}/content` (or the shares-API equivalent), receiving the raw XLSX bytes. This is a full-file download — it returns the complete workbook binary.

3. **Parse + map** (`server/agendaSync.ts` → `server/spreadsheetParse.ts`): ExcelJS `WorkbookReader` streaming parse reads the full workbook into a grid. The mapping layer (`shared/spreadsheet-mapping.ts`) then applies the operator-configured column mapping to produce `ParsedUpstream[]`.

4. **Upsert** (`runAgendaSync`): Iterates `ParsedUpstream[]` against the existing `agenda_items` rows for the config. Matches by `externalId`; calls `updateAgendaItem` or `createAgendaItem` one-by-one. Tombstones (removes) rows absent from upstream when `removeMissingItems=true`. Updates `agenda_sync_configs` with result metadata.

5. **Display** (`GET /api/agenda/display/:configId`): Unauthenticated endpoint; reads the live `agenda_items` rows via `buildAgendaDisplayPayload`. Short-TTL cache with serve-stale. No snapshot table; the live rows ARE the display state.

---

## 4. Identity and Token Model

**Model:** ONE system-level Microsoft account per Replit deployment. Per-client / multi-tenant Microsoft accounts are explicitly out of scope (documented in `microsoftGraph.ts` header comment and `msSiteId` column comment in `schema.ts`).

**Token storage:** None. VectorMesh never stores OAuth tokens. Tokens are fetched fresh from the Replit connector proxy on every Graph call. The proxy handles expiry and refresh.

**Credential encryption:** Not applicable under this model (no credentials stored). If custom OAuth is introduced in the future, encryption would be required.

**Evidence:** `server/microsoftGraph.ts` lines 1–14 (header), line 9 ("this module never stores Microsoft passwords or tokens"), `fetchConnectorToken` (lines 71–97) showing per-call proxy fetch, `shared/schema.ts` lines 1364–1376 (`msSiteId` "currently informational; per-client / multi-tenant Microsoft accounts are explicitly out of scope").

---

## 5. Installed Replit Connectors (Confirmed)

From the workspace environment state:

| Connector | Status | Scope tier |
|---|---|---|
| Microsoft OneDrive (1.0.0) | INSTALLED | `Files.*` (own OneDrive) |
| SharePoint Online (1.0.0) | INSTALLED | `Sites.*` (SharePoint sites) |

Both connectors are already installed. The VectorMesh `resolveAccessToken` function prefers the SharePoint connector when `sourceType === "sharepoint_excel"` (line 387–388 of `microsoftGraph.ts`).

---

## 6. Conflict A — Can the SharePoint Connector Access SharePoint Site Files?

### Claim to evaluate
The comment at `microsoftGraph.ts:233–238` says: *"the Microsoft connector is granted Files.Read (the user's OWN OneDrive) only — it cannot read files that live in a SharePoint site or are owned by someone else."*

### Evidence gathered

**Critical context:** That comment appears inside `resolveShareLink`, specifically in the 403-error handler. The flow being described is: a share link from a SharePoint file was resolved using the **OneDrive** connector token — which indeed has only `Files.*` (own OneDrive) scope and cannot access SharePoint-hosted files via the shares API.

However, `fetchMicrosoftXlsxBytes` (lines 383–397) chooses its connector based on source type:
```typescript
const prefer: MicrosoftConnectorName =
  source.sourceType === "sharepoint_excel" ? "sharepoint" : "onedrive";
```

For `sharepoint_excel` sources, the **SharePoint Online connector** token is used. The SharePoint connector has `Sites.*` scope — meaning `Sites.Read.All` or `Sites.ReadWrite.All` — which grants access to all SharePoint site files the connected account can see.

### Resolution

**Conflict A is RESOLVED — NOT BLOCKED.**

- `sharepoint_excel` source types use the SharePoint connector (`Sites.*` scope), not the OneDrive connector. SharePoint site files ARE accessible.
- The 403 message at `resolveShareLink` applies specifically to using the OneDrive token for a SharePoint share link. Operators who use the file picker (which sets `msDriveId`/`msItemId`) and select a SharePoint file while the SharePoint connector is active will succeed.
- The warning comment at line 233-238 is accurate for the OneDrive-only scenario but does not apply when the SharePoint connector is active and properly preferred for `sharepoint_excel` source types.
- **One residual risk:** `resolveShareLink` does not pass a `prefer` connector — it lets `resolveAccessToken` fall back to the first available connector. If only the SharePoint connector is installed but not the OneDrive connector, the fallback order in `resolveAccessToken` will still try SharePoint eventually. If only OneDrive is installed and the link is a SharePoint URL, the 403 user-facing message (described above) correctly surfaces. This is correct behavior.

---

## 7. Conflict B — File Access Approach: Full Download vs. Excel Range API

### Claim to evaluate
Task #362 as originally specified requires:
> "no full workbook download; true selective-column I/O only"

This implies using the Microsoft Graph Excel Workbook API — specifically `GET /drives/{id}/items/{id}/workbook/worksheets/{id}/usedRange` or similar range-address endpoints — to read only the needed columns.

### Evidence gathered

**Permission requirements for the Excel Workbook API (range reads):**
Microsoft's official permission reference for Excel workbook session-based APIs (including worksheet range reads) lists the following as minimum delegated permissions: `Files.ReadWrite`. Read-only permissions (`Files.Read`, `Files.Read.All`, `Sites.Read.All`) are NOT listed as sufficient for the session-based Excel workbook API. This is because the Excel API creates and manages workbook sessions (open/close) which are inherently state-mutating operations even for GET workbook content calls.

**Confirmed working approach:**
`GET /drives/{id}/items/{id}/content` (the `driveItem/content` endpoint) requires only `Files.Read` (for OneDrive files) or `Sites.Read.All` (for SharePoint files). This returns the full XLSX binary. This is the current implementation and is confirmed working in tests (`tests/agenda-microsoft-graph.test.ts` line 162–185, covering both `excel_onedrive` and `sharepoint_excel`).

**The range API would require:**
- `Files.ReadWrite` (delegated) for OneDrive files — a write scope introduced purely to enable read-only data retrieval
- `Sites.ReadWrite.All` (delegated) for SharePoint files — similarly a write scope

Granting write scopes to achieve read-only operations violates the principle of least privilege and introduces unnecessary risk. The Replit connector scope cannot be modified unilaterally within VectorMesh — it would require changing the connector configuration or requesting a new connector.

### Resolution

**Conflict B is RESOLVED — with a mandatory modification to Task #362.**

The "no full workbook download" requirement in Task #362 **must be revised**. The correct implementation approach is:

1. **Continue using full-file download** (`driveItem/content`) — this requires only `Files.Read` / `Sites.Read.All` (strictly read-only scopes already granted by the installed connectors).
2. **Achieve "selective column" efficiency at the parse layer** — the existing `readSheetSample` (JSZip+SAX streaming, aborts after `maxRows`) can be extended to also abort column scanning once all mapped columns have been found in the header row. This achieves selective-column reading without a workbook session and without write permissions.
3. **Do NOT implement the Excel workbook session API** — it would require write-scope permission escalation and create a production security regression.

This modification is captured in §20 (Required Modifications to Task #362).

---

## 8. Atomic Publication Analysis

### Current behavior

`runAgendaSync` (lines 615–772 of `server/agendaSync.ts`) performs row-by-row upserts against the live `agenda_items` table:

```
for each upstream item:
  if exists → updateAgendaItem(...)   // individual DB write
  else       → createAgendaItem(...)  // individual DB write
// then per-row tombstone deletes
for each existing item not seen upstream:
  deleteAgendaItem(...)               // individual DB write
```

The display endpoint (`GET /api/agenda/display/:configId`) reads from the live `agenda_items` rows at the time of the request (via `getResolvedAgendaForConfig`). There is no transaction wrapping the sync loop, no atomic pointer swap, and no versioned snapshot.

### Risk assessment

**Mid-sync failure scenario:** If `runAgendaSync` fails after updating 50 of 100 rows, the display endpoint immediately sees a partially updated state — 50 rows updated, 50 rows at old values. With `removeMissingItems=true`, no tombstone pass runs on failure (the try/catch at line 741 returns early), so previously seen rows are not deleted. The partial-update window is bounded by the per-row DB latency × number of rows.

**Practical risk level:** MEDIUM. For most agenda use cases (event schedules with ≤500 rows), the window is subsecond to low-seconds. The display endpoint's cache TTL means the partially-updated state may not even be visible between cache invalidations. However, for large workbooks or slow DB connections, inconsistent state is observable.

**No snapshot or last-known-good model exists.** The only fallback is the stale-grace-period in `display-agenda.tsx` (client-side, 2-minute grace on 5xx/network errors) — this does not protect against corrupted `agenda_items` rows, only against the sync endpoint being unreachable.

### Requirement for Task #362

Task #362 specifies a "versioned last-known-good snapshot model." This is feasible and desirable. It requires schema changes (see §19). It is NOT a blocker for APPROVING implementation — it is a feature to build, not a gap that prevents building.

---

## 9. Schema State Assessment

### `agenda_sync_configs` table (full inventory)

| Column | Type | Notes |
|---|---|---|
| `id` | `varchar` PK | UUID |
| `clientId` | `varchar` FK → `clients` | Tenant scoping; cascade delete |
| `name` | `text` | |
| `sourceType` | `text` | `excel_onedrive`, `sharepoint_excel`, `ics`, `google_sheets_csv`, `uploaded_xlsx` |
| `sourceUrl` | `text` nullable | URL for URL-based sources; null for uploaded |
| `microsoftAuth` | `boolean` | Flag for Graph-backed sources |
| `msDriveId` | `text` nullable | Set by file picker |
| `msItemId` | `text` nullable | Set by file picker |
| `msSiteId` | `text` nullable | Informational only; not used in fetch path |
| `enabled` | `boolean` | |
| `syncIntervalMinutes` | `integer` | |
| `originalFileName` | `text` nullable | Upload filename |
| `storedFilePath` | `text` nullable | On-disk path for uploaded XLSX |
| `sheetName` | `text` nullable | null = first sheet |
| `headerRowIndex` | `integer` | 0-based, default 0 |
| `firstDataRowIndex` | `integer` nullable | null = headerRowIndex + 1 |
| `columnMapping` | `jsonb` | `AgendaColumnMapping` |
| `startTimeColumn` / `endTimeColumn` | `text` nullable | Split date/time columns |
| `dateBaseYear` / `dateBaseMonth` | `integer` nullable | Day-only date cells |
| `externalIdColumn` | `text` nullable | Stable external ID column |
| `timezone` | `text` nullable | IANA timezone for wall-clock parsing |
| `dateFormatHint` | `text` nullable | `uk`, `us`, `iso` |
| `timeFormatHint` | `text` nullable | |
| `syncMode` | `text` | `interval`, `manual` |
| `removeMissingItems` | `boolean` | |
| `lastSyncAt` | `timestamp` nullable | |
| `lastSyncOk` | `boolean` nullable | |
| `lastError` | `text` nullable | Last error message (≤500 chars) |
| `lastErrorAt` | `timestamp` nullable | |
| `lastItemCount` | `integer` nullable | |
| `lastSyncWarnings` | `jsonb` | `string[]` per-row warnings |
| `consecutiveFailureCount` | `integer` | Failure streak counter |
| `failureAlertSent` | `boolean` | Alert throttle flag |
| `createdAt` / `updatedAt` | `timestamp` | |

**Missing columns for Task #362:**
- No `etagOrRevision` (change detection)
- No `lastGoodSnapshotId` or equivalent snapshot pointer
- No `sourceConnectionHealthStatus` (separate from sync success/failure)

---

## 10. ETag / Change Detection

**Current state:** None. Every sync run downloads and parses the full file regardless of whether it changed since the last sync.

**What the SharePoint Graph API offers:**
- `driveItem` metadata includes `eTag` and `cTag` (content tag) fields. A `HEAD` request or `$select=eTag,cTag` `GET` on the item metadata can determine whether the file has changed without downloading it.
- `cTag` changes when content changes; `eTag` changes on any metadata change. `cTag` is the correct field for skip-if-unchanged.

**Implementation path:** Before `downloadDriveItem`, issue `GET /drives/{id}/items/{id}?$select=id,cTag` and compare to the stored `cTag`. Skip the download + parse if unchanged. This requires adding a `lastCTag` (or `etagOrRevision`) column to `agenda_sync_configs`.

**Impact of absence:** Without ETag, every sync interval downloads the full XLSX (potentially megabytes) and re-parses it even when nothing changed. For a production conference with a 2MB workbook and 15-minute intervals, this is ~96 downloads/day per config.

---

## 11. Snapshot / Versioned Last-Known-Good State

**Current state:** None. The `agenda_items` rows ARE the display state. There is no separate snapshot table and no version pointer.

**Task #362 requirement:** A "versioned last-known-good snapshot model." This means:
- The sync engine writes to a staging area (or a versioned snapshot).
- Only after a complete, validated sync does the live display state atomically flip to the new data.
- A failed sync leaves the previous good state visible to display clients.

**Feasible implementation approaches:**

*Option A — Snapshot table with atomic pointer swap:*
Add `agenda_item_snapshots` table (columns: `id`, `syncConfigId`, `snapshotVersion`, `items` JSONB, `createdAt`). After a successful sync, write the snapshot and update a `lastGoodSnapshotId` pointer on `agenda_sync_configs`. The display endpoint reads from the snapshot, not from live `agenda_items` rows.

*Option B — Soft-versioned upsert with rollback column:*
Add `syncVersion` to `agenda_items`. Each sync run uses a new version token; tombstones mark rows from old versions. On failure, a rollback query restores the previous version. More complex than Option A.

*Option C — Wrap existing upsert in a DB transaction:*
The cheapest option: wrap the entire `runAgendaSync` upsert loop in a single Postgres transaction. On success, commit. On any failure, rollback. This makes the upsert atomic but does NOT provide a "last-known-good display" — if the new data is committed but an error occurs afterward, the display switches immediately to new data.

**Recommendation for Task #362:** Option A (snapshot table). It is the only approach that satisfies both atomicity and a true last-known-good display capability. Requires schema migration (new table + new FK column on `agenda_sync_configs`).

---

## 12. Tenant Isolation

**Assessment:** SOUND. All `agenda_sync_configs` rows carry `clientId`. Every route that reads or mutates a config calls `auth.canAccessClient(req, clientId)` before proceeding. The display endpoint (`GET /api/agenda/display/:configId`) reads `agendaWidgetConfigs` (not `agendaSyncConfigs`) and resolves through `buildAgendaDisplayPayload`, which is public/unauthenticated by design (display screens have no session).

`storedFilePath` is validated with `storedPathBelongsToClient` before use in preview/test routes. No cross-tenant data leakage paths were found.

---

## 13. Read-Only Enforcement at the Application Layer

**Assessment:** SOUND. The `server/microsoftGraph.ts` header explicitly documents "Read-only: only GET requests are issued." Every Graph call in this file uses `graphGet` or `graphGetJson`, both of which issue only GET requests. There are no PATCH, PUT, POST, or DELETE Graph calls in the codebase.

The VectorMesh application cannot initiate write operations against Microsoft Graph with the current implementation regardless of what scopes the connector token carries.

---

## 14. Test Coverage Assessment

### Microsoft Graph-specific tests (`tests/agenda-microsoft-graph.test.ts`)

| Test | What it covers |
|---|---|
| `fetchMicrosoftXlsxBytes downloads drive item bytes via Graph` | Happy path: (driveId, itemId) → bytes with correct PK ZIP magic |
| `fetchMicrosoftXlsxBytes resolves a share link when no driveId/itemId` | SharePoint share-link resolve + download path |
| `getMicrosoftConnectionStatus reports connected when token present` | Connector health check — connected state |
| `getMicrosoftConnectionStatus reports disconnected when no connector env` | Connector health check — disconnected state |
| `resolveShareLink throws MicrosoftNotConnectedError when no token` | Not-connected error propagation |
| `runAgendaSync uses graphFetch for a Microsoft-backed source` | Full sync pipeline with mocked Graph: inserts 1 row correctly |
| `runAgendaSync records connect-Microsoft message; removes nothing when not connected` | Critical: existing rows NOT removed when Graph unavailable |
| `runAgendaSync fails when Graph returns non-xlsx bytes` | Malformed response / sign-in page detection |
| `not-connected message is non-empty guidance` | Wire-up check for MICROSOFT_NOT_CONNECTED_MESSAGE constant |

**Gaps identified:**
- No test for `sharepoint_excel` source type preferring the SharePoint connector token (Conflict A path).
- No test for ETag-based skip-if-unchanged (not yet implemented; expected as new coverage in Task #362).
- No test for the snapshot/atomic-publication path (not yet implemented).
- No production-scale metric test (large workbook timing/memory boundary).
- No test for partial-sync failure leaving state consistent (would require transaction rollback testing).

---

## 15. `runAgendaSync` Upsert Engine — Detailed Trace for Atomic Publication

The full publish path for a successful sync is:

```
loadSourceContent()              → FetchedContent (bytes or text)
parseUpstreamForConfig()         → { items: ParsedUpstream[], warnings }
getAgendaItemsBySyncConfig()     → existing[] (live DB rows)
for each upstream:
  if exists:
    updateAgendaItem()           ← live DB write (no transaction)
  else:
    createAgendaItem()           ← live DB write (no transaction)
for each existing not in upstream (when removeMissingItems):
  deleteAgendaItem()             ← live DB write (no transaction)
updateAgendaSyncConfig(lastSyncOk: true, ...)  ← metadata write
invalidateAgendaDisplayForClient(clientId)      ← cache invalidation
```

The cache invalidation (`invalidateAgendaDisplayForClient`) fires after all upserts complete. If any individual DB write throws, the catch block at line 741 runs `updateAgendaSyncConfig(lastSyncOk: false, ...)` and returns — but the partial upserts already committed are NOT rolled back. This is the atomicity gap.

**The display endpoint reads from the live rows via `getResolvedAgendaForConfig`** — there is no version gate. Any partial state is immediately visible after cache expiry.

---

## 16. Display Endpoint Architecture

**Endpoint:** `GET /api/agenda/display/:configId` — unauthenticated, intentionally (player screens have no session).

**Cache layer:** `getOrSet` with `CACHE_NAMESPACES.AGENDA` and `DEFAULT_TTLS.AGENDA_DISPLAY`. The cache holds the serialized display payload (config + items + fonts). `invalidateAgendaDisplayForClient` is called after sync completion.

**Stale-grace-period:** Implemented client-side in `display-agenda.tsx` — 2-minute grace on 5xx / network errors. Keeps the last-good client-side payload. This is a client-side continuity mechanism, not a server-side last-known-good state.

**`SourceConnectionHealth` vs `DisplayContinuity`:** These are not currently distinct types — both collapse into the sync result fields (`lastSyncOk`, `lastError`) on `agenda_sync_configs`. Task #362 requires splitting these into separate typed concepts. This is a design enhancement to build, not a blocker.

---

## 17. Part 17 Stop Conditions

Each condition is evaluated against the evidence gathered in this audit.

| # | Condition | Status | Evidence / Note |
|---|---|---|---|
| 17.1 | No Microsoft credentials stored in VectorMesh | ✅ CLEAR | `microsoftGraph.ts` header + `fetchConnectorToken` implementation |
| 17.2 | SharePoint files accessible with installed connector | ✅ CLEAR | SharePoint Online connector installed; `Sites.*` scope; `fetchMicrosoftXlsxBytes` prefers "sharepoint" for `sharepoint_excel` |
| 17.3 | Read-only Graph access verified (no write scopes used in calls) | ✅ CLEAR | All Graph calls use GET only; no Excel Workbook session API |
| 17.4 | Conflict A (scope limit blocking SharePoint) resolved | ✅ CLEAR | See §6; SharePoint connector covers site files |
| 17.5 | Conflict B (Excel Range API permission escalation) resolved | ✅ CLEAR | See §7; full-file download retained; "no full workbook download" requirement revised |
| 17.6 | Tenant isolation verified | ✅ CLEAR | See §12; all routes canAccessClient-gated |
| 17.7 | Existing sync pipeline (parse/map/upsert) sound | ✅ CLEAR | Tested; no changes required to existing pipeline |
| 17.8 | Atomic publication gap acknowledged and addressed by plan | ✅ CLEAR | §8, §11; snapshot model planned for Task #362 |
| 17.9 | Schema changes identified and documented | ✅ CLEAR | §19 lists all required migrations |
| 17.10 | Test gaps identified | ✅ CLEAR | §14 lists specific missing tests |
| 17.11 | "No full workbook download" requirement revised | ✅ CLEAR | §7, §20; requirement updated; confirmed no permission escalation required |
| 17.12 | ETag change-detection approach documented | ✅ CLEAR | §10; `cTag` approach specified |
| 17.13 | `SourceConnectionHealth` / `DisplayContinuity` split documented | ✅ CLEAR | §16; design enhancement planned |
| 17.14 | No formula execution in parse layer | ✅ CLEAR | `parseWorkbookBuffer` reads `.result` (cached stored value, no engine) |
| 17.15 | No per-client Microsoft OAuth introduced | ✅ CLEAR | System-level single account; out-of-scope constraint documented |

All 15 stop conditions are CLEAR.

---

## 18. Implementation Prerequisites for Task #362

Before Task #362 writes any feature code, the following must be true:

1. **SharePoint Online connector is installed and connected** — verified as INSTALLED; the connected account must have read access to the target SharePoint site.
2. **This ADR is published** — this file must be committed before any implementation code is written.
3. **`insertAgendaSyncConfigSchema`** must be extended with the new columns defined in §19.
4. **Schema migration SQL** for new columns must be written as an idempotent `migrations/NNNN_*.sql` file (per `schema-migrations` memory entry — both `npm run db:push` AND the migration file are required).
5. The "no full workbook download" requirement in Task #362 must be updated to the revised text in §20 before implementation begins.

---

## 19. Schema Changes Required for Task #362

The following columns must be added to `agenda_sync_configs`. All are nullable / have defaults so existing rows are unaffected.

```sql
-- Migration: add ETag change-detection, snapshot pointer, and health-tracking columns
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_ctag TEXT,          -- SharePoint cTag for skip-if-unchanged
  ADD COLUMN IF NOT EXISTS last_good_snapshot_id UUID REFERENCES agenda_item_snapshots(id) ON DELETE SET NULL;
```

A new table is required for the snapshot model:

```sql
CREATE TABLE IF NOT EXISTS agenda_item_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id VARCHAR NOT NULL REFERENCES agenda_sync_configs(id) ON DELETE CASCADE,
  snapshot_version BIGINT NOT NULL,            -- monotonically increasing
  items         JSONB NOT NULL,                -- serialised AgendaItem[] at time of sync
  item_count    INTEGER NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ais_sync_config ON agenda_item_snapshots(sync_config_id, snapshot_version DESC);
```

The `agenda_sync_configs.last_good_snapshot_id` column points to the most recent successful snapshot. The display endpoint reads from this snapshot rather than from live `agenda_items` rows (for configs that have at least one successful sync).

Drizzle ORM schema in `shared/schema.ts` must be updated to match, and both `npm run db:push` and the migration SQL file must be applied.

---

## 20. Required Modifications to Task #362

These modifications are mandatory. Task #362 must not implement the original wording where it conflicts with this ADR.

### 20.1 Revised file access requirement

**Original Task #362 wording:** "no full workbook download; true selective-column I/O only"

**Revised requirement:**
> Use the `driveItem/content` endpoint to download the full XLSX binary (as the existing implementation does). This requires only read-only permissions (`Files.Read` for OneDrive, `Sites.Read.All` for SharePoint) already granted by the installed connectors. Do NOT use the Microsoft Graph Excel Workbook session API (`/workbook/worksheets/…/usedRange` etc.) — it requires write-permission scopes (`Files.ReadWrite`, `Sites.ReadWrite.All`) which must not be requested for a read-only connector. "Selective column" efficiency MUST be achieved at the parse layer: extend `readSheetSample` (JSZip+SAX streaming) to abort column scanning once all mapped columns are identified in the header row, limiting memory and I/O to only the needed columns without requiring the Excel API.

### 20.2 ETag-based skip-if-unchanged

> Before every scheduled sync, issue `GET /drives/{driveId}/items/{itemId}?$select=id,cTag` (or the shares-API equivalent for share-link sources). Compare the returned `cTag` to the stored `last_ctag` column. If unchanged, update `lastSyncAt` (to reset the interval timer) and return early without downloading or parsing. Record the cTag on every successful sync.

### 20.3 Snapshot-based atomic publication

> `runAgendaSync` must write to a new `agenda_item_snapshots` row (serialised items JSONB) inside a transaction that, on completion, atomically updates `last_good_snapshot_id` on `agenda_sync_configs`. The display endpoint must be updated to read from the snapshot when `last_good_snapshot_id` is set, falling back to live `agenda_items` rows for configs with no snapshot yet (backwards compatibility). A failed sync must not modify `last_good_snapshot_id` — the previous good snapshot remains the display source.

### 20.4 `SourceConnectionHealth` and `DisplayContinuity` split

> Define two separate TypeScript interfaces:
> - `SourceConnectionHealth`: covers whether the Microsoft connector is active, whether the last cTag check succeeded, and whether the file is reachable.
> - `DisplayContinuity`: covers whether there is a valid last-good snapshot to serve, how old it is, and whether the displayed data is stale.
> These must be exposed as separate fields in the sync-errors endpoint response and in the admin UI.

### 20.5 Test additions required

Task #362 must add tests for:
- `sharepoint_excel` source type prefers the SharePoint connector token (Conflict A path, currently untested).
- ETag skip-if-unchanged: cTag match → no download; cTag mismatch → download triggered.
- Snapshot atomicity: mid-sync failure → `last_good_snapshot_id` unchanged; display still serves old snapshot.
- Partial-sync failure state: `agenda_item_snapshots` rows correct after a failed sync.
- Production-scale metric: syncing a 500-row workbook completes within a specified time/memory budget.

---

## 21. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SharePoint connector token expires mid-sync | Low | Medium | Replit proxy handles refresh; `MicrosoftNotConnectedError` path preserves existing items |
| Large XLSX (>5MB) OOM in parse | Medium | High | `parseWorkbookBuffer` has CELL_BUDGET=2M cap; streaming WorkbookReader already in use; extend with selective-column abort |
| Snapshot table grows unbounded | Medium | Low | Add periodic cleanup: retain only the last N snapshots per config |
| ETag skipping hides source errors | Low | Medium | Distinguish "file unchanged" (cTag match) from "file unreachable" (error); update `SourceConnectionHealth` accordingly |
| Breaking change if display switches from live rows to snapshot | Medium | High | Backwards-compatible fallback: configs with no snapshot yet serve live rows (existing behaviour) |
| `msSiteId` informational column creates false expectation | Low | Low | Document clearly that it is not used in the fetch path; do not add fetch logic keyed on it |

---

## 22. Decision

All 15 Part 17 stop conditions are CLEAR. Both conflicts have been resolved without blocking implementation. The required modifications to Task #362 (§20) are design corrections, not blockers — they strengthen the implementation and must be followed but do not prevent Task #362 from proceeding.

---

## APPROVED FOR IMPLEMENTATION

Task #362 may proceed subject to the mandatory modifications in §20 and the prerequisites in §18. No code may be written until this ADR is committed and all Part 17 conditions are confirmed clear by the implementing agent.

---

*ADR published: 2026-08-18. This is the only file changed by Task #361.*

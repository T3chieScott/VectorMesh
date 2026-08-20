// Agenda sync engine (Task #210).
//
// Pulls upstream session schedules (ICS URLs, Google Sheets CSV
// publish links) into the local agenda_items pool, on a per-site
// timer. The merge strategy is upsert-by-(syncConfigId, externalId)
// with one rule: if a row's `manualOverride` flag is true, the sync
// leaves it alone. That preserves on-site fixes (a presenter
// changes, a room swaps last minute, a status note gets added)
// against future pulls that would otherwise overwrite them.
//
// Errors are recorded on the sync config row (lastError/lastErrorAt)
// instead of being silently swallowed, so the UI can surface them.

import { readFile } from "fs/promises";
import { createHash } from "node:crypto";
import { parseIcs } from "@shared/agenda-ics";
import { parseAgendaCsv } from "@shared/agenda-csv";
import {
  parseCsvToGrid,
  extractGrid,
  applyMapping,
  suggestColumnMapping,
  missingRequiredMappings,
  cellToString,
  type Grid,
} from "@shared/spreadsheet-mapping";
import { DEFAULT_SCHEDULE_TIMEZONE_FALLBACK } from "@shared/timezone-utils";
import { parseWorkbookBuffer, readSheetSample } from "./spreadsheetParse";
import { safeFetch, type SafeFetchOptions } from "./safeFetch";
import type {
  AgendaItem,
  AgendaSyncConfig,
  Client,
  InsertAgendaItem,
} from "@shared/schema";
import { AGENDA_XLSX_SOURCE_TYPES } from "@shared/schema";

// ===== Snapshot / atomic-sync types (Task #362) =====
//
// These types are defined here (close to AgendaSyncStorage) so storage.ts
// can implement atomicMicrosoftSync without importing from agendaSync.ts
// and creating a circular dependency.
export interface AtomicMicrosoftSyncParams {
  configId: string;
  clientId: string;
  /** Full InsertAgendaItem rows to upsert, built from the upstream parse. */
  newItems: InsertAgendaItem[];
  /** Current DB rows for this sync config (used for update/tombstone logic). */
  existingItems: AgendaItem[];
  removeMissingItems: boolean;
  /** External IDs present in the upstream — used to compute tombstones. */
  seenExternalIds: Set<string>;
  /**
   * cTag fetched just before the download; null when unavailable.
   * The snapshot payload is computed by storage from the effective
   * post-sync rows (not passed in), ensuring manualOverride rows and
   * retained-missing rows are captured accurately.
   */
  newCTag: string | null;
  /** Fingerprint of the parsing/merge settings used for this successful sync. */
  configFingerprint: string;
  /** Task #362 health contract — when items were committed. Set by caller. */
  lastPublishedAt?: Date | null;
  /** Task #362 health contract — when the cTag last changed; null = no update. */
  lastCTagChangedAt?: Date | null;
}

export interface AtomicMicrosoftSyncResult {
  inserted: number;
  updated: number;
  skippedManual: number;
  removed: number;
  /** ID of the newly created agenda_item_snapshots row. */
  snapshotId: string;
  /** Snapshot version number (1-based, increments per successful sync). */
  snapshotVersion: number;
}

export interface AgendaSyncStorage {
  getAgendaSyncConfigs(clientId?: string): Promise<AgendaSyncConfig[]>;
  getAgendaSyncConfig(id: string): Promise<AgendaSyncConfig | undefined>;
  updateAgendaSyncConfig(
    id: string,
    data: Partial<AgendaSyncConfig>,
  ): Promise<AgendaSyncConfig | undefined>;
  getAgendaItemsBySyncConfig(syncConfigId: string): Promise<AgendaItem[]>;
  createAgendaItem(data: InsertAgendaItem): Promise<AgendaItem>;
  updateAgendaItem(
    id: string,
    data: Partial<InsertAgendaItem>,
  ): Promise<AgendaItem | undefined>;
  deleteAgendaItem(id: string): Promise<boolean>;
  // Task #267 — used to resolve the wall-clock timezone for mapped
  // spreadsheet date parsing (config tz → client tz → fallback).
  // Optional so legacy ics/google_sheets_csv stubs don't need it.
  getClient?(id: string): Promise<Client | undefined>;
  // Task #362 — atomic snapshot promotion for Microsoft-backed sources.
  // When present, the sync engine performs the upsert + snapshot write
  // inside a single DB transaction for true atomicity. When absent the
  // legacy per-row upsert path is used instead (backwards compatible
  // with all existing test stubs that don't implement it).
  atomicMicrosoftSync?(
    params: AtomicMicrosoftSyncParams,
  ): Promise<AtomicMicrosoftSyncResult>;
  // Optional: prune old snapshots for a config after a successful sync.
  pruneOldAgendaSnapshots?(configId: string, keepLast: number): Promise<void>;
}

// Shown when an Excel/OneDrive/SharePoint link can't be fetched as a
// real XLSX (it served an HTML sign-in / preview page instead). The UI
// surfaces this verbatim so operators know their options.
export const ONEDRIVE_CANNOT_READ_MESSAGE =
  "This Excel/OneDrive/SharePoint link can't be read directly. Use a direct-download link to the .xlsx file, export the sheet to CSV and use a CSV URL, upload the .xlsx file here instead, or wait for Microsoft sign-in support.";

const XLSX_SOURCE_SET = new Set<string>(AGENDA_XLSX_SOURCE_TYPES);

export interface AgendaSyncResult {
  ok: boolean;
  inserted: number;
  updated: number;
  skippedManual: number;
  removed: number;
  totalUpstream: number;
  error?: string;
  parseWarnings?: string[];
  /**
   * True when the Microsoft file's cTag matched the stored cTag and the
   * download was skipped entirely. DB counts are all zero; `ok` is true.
   * Also set when a sync for the same config is already in progress
   * (in-flight de-duplication).
   */
  noChange?: boolean;
}

type AgendaParsingConfig = Pick<
  AgendaSyncConfig,
  | "sheetName"
  | "headerRowIndex"
  | "firstDataRowIndex"
  | "columnMapping"
  | "externalIdColumn"
  | "timezone"
  | "dateFormatHint"
  | "startTimeColumn"
  | "endTimeColumn"
  | "dateBaseMonth"
  | "dateBaseYear"
  | "removeMissingItems"
>;

/**
 * Produces a restart-safe fingerprint for the settings that affect how a
 * workbook is interpreted or merged. It deliberately excludes source URLs,
 * Microsoft identifiers, and any credential-bearing data.
 */
export function computeAgendaParsingConfigFingerprint(
  config: AgendaParsingConfig,
  effectiveTimezone?: string,
): string {
  const mapping = config.columnMapping
    ? Object.fromEntries(
        Object.entries(config.columnMapping).sort(([left], [right]) => {
          if (left < right) return -1;
          if (left > right) return 1;
          return 0;
        }),
      )
    : null;
  const canonical = JSON.stringify({
    sheetName: config.sheetName ?? null,
    headerRowIndex: config.headerRowIndex ?? 0,
    firstDataRowIndex: config.firstDataRowIndex ?? null,
    columnMapping: mapping,
    externalIdColumn: config.externalIdColumn ?? null,
    // When the source inherits its site's timezone, this records the resolved
    // value that the mapper actually used rather than the nullable override.
    timezone: effectiveTimezone ?? config.timezone ?? null,
    dateFormatHint: config.dateFormatHint ?? null,
    startTimeColumn: config.startTimeColumn ?? null,
    endTimeColumn: config.endTimeColumn ?? null,
    dateBaseMonth: config.dateBaseMonth ?? null,
    dateBaseYear: config.dateBaseYear ?? null,
    removeMissingItems: config.removeMissingItems !== false,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ===== Health status types (Task #362) =====
//
// SourceConnectionHealth describes whether the upstream source is
// reachable and parsing correctly. DisplayContinuity describes whether
// the last-known-good snapshot is available to serve players if the
// live source is temporarily unreachable. The two are intentionally
// separate: a source can fail (connection unhealthy) while the display
// stays live (continuity maintained via snapshot).

/** Authoritative source-health states shown in the admin health panel. */
export type SourceHealthState =
  | "Healthy"            // last sync OK, no warnings, content changed or initial
  | "Checking"           // in-flight: fetching cTag before deciding to download
  | "Workbook unchanged" // last sync OK, cTag matched, no bytes transferred
  | "Updating"           // in-flight: cTag changed, currently downloading
  | "Validation warning" // last sync OK but row-level parse warnings exist
  | "Authentication required" // last sync failed with an auth/token error
  | "Access revoked"     // last sync failed with a permissions/forbidden error
  | "Source unavailable"; // last sync failed for any other reason (network, etc.)

/** Authoritative display-continuity states shown in the admin health panel. */
export type DisplayContinuityState =
  | "Current"              // serving live synced data (lastSyncOk true + snapshot)
  | "Using last-known-good" // live source unavailable but last-good snapshot is serving
  | "No valid snapshot";   // never synced successfully or snapshot was pruned

// ===== In-process per-source phase tracking (production only) =====
//
// Tracks which phase of the sync cycle a config is currently in so the
// health status endpoint can return "Checking" / "Updating" rather than
// the previous DB-persisted state. Only updated for production syncs
// (not test-injected lock paths). Multi-process deployments that share
// no in-process state should use an external store.
const IN_FLIGHT_PHASES = new Map<string, "checking" | "updating">();

/**
 * Returns the current in-flight phase for a sync config, or null when no
 * sync is running. Used by the health status endpoint to surface live state
 * without an additional round-trip.
 */
export function getConfigSyncPhase(id: string): "checking" | "updating" | null {
  return IN_FLIGHT_PHASES.get(id) ?? null;
}

/**
 * Derives the authoritative SourceHealthState from persisted DB fields and
 * the optional in-flight phase (from getConfigSyncPhase). Exported for unit
 * tests.
 */
export function computeSourceHealthState(
  config: Pick<
    AgendaSyncConfig,
    "lastSyncOk" | "lastSyncWarnings" | "consecutiveFailureCount" | "lastError"
  >,
  syncPhase: "checking" | "updating" | null = null,
): SourceHealthState {
  if (syncPhase === "checking") return "Checking";
  if (syncPhase === "updating") return "Updating";

  if (config.lastSyncOk === null || config.lastSyncOk === undefined) {
    // Never synced.
    return "Source unavailable";
  }

  if (config.lastSyncOk === false) {
    const err = (config.lastError ?? "").toLowerCase();
    // Auth/token errors — operator must reconnect.
    if (/auth|token|401|unauthorized|unauthenticated|credential|login|sign.?in/.test(err)) {
      return "Authentication required";
    }
    // Access/permission errors — the account lacks read access to the file.
    if (/access|permission|forbidden|403|not found|no permission|revoked/.test(err)) {
      return "Access revoked";
    }
    // Any other failure.
    return "Source unavailable";
  }

  // lastSyncOk === true
  if (Array.isArray(config.lastSyncWarnings) && config.lastSyncWarnings.length > 0) {
    return "Validation warning";
  }
  return "Healthy";
}

/**
 * Like computeSourceHealthState but also signals when the last sync was a
 * cTag-skip (no bytes transferred). This requires the extra persisted
 * `lastCTagChangedAt` / `lastPublishedAt` timestamps to distinguish a genuine
 * "no content change" tick from an ordinary successful download.
 */
export function computeSourceHealthStateWithTimestamps(
  config: Pick<
    AgendaSyncConfig,
    | "lastSyncOk"
    | "lastSyncWarnings"
    | "consecutiveFailureCount"
    | "lastError"
    | "lastSyncAt"
    | "lastPublishedAt"
    | "lastCTagChangedAt"
  >,
  syncPhase: "checking" | "updating" | null = null,
): SourceHealthState {
  const base = computeSourceHealthState(config, syncPhase);
  if (base !== "Healthy") return base;

  // If the last sync time is strictly AFTER the last time the cTag changed
  // (or the cTag has never changed — lastCTagChangedAt is null while
  // lastSyncAt is not), the most recent tick was a cTag-skip.
  const lastSyncTs = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : null;
  const lastChangedTs = config.lastCTagChangedAt
    ? new Date(config.lastCTagChangedAt).getTime()
    : null;
  const lastPublishedTs = config.lastPublishedAt
    ? new Date(config.lastPublishedAt).getTime()
    : null;

  if (
    lastSyncTs !== null &&
    (lastPublishedTs === null || lastSyncTs > lastPublishedTs) &&
    (lastChangedTs === null || lastSyncTs > lastChangedTs)
  ) {
    return "Workbook unchanged";
  }
  return "Healthy";
}

/**
 * Derives the authoritative DisplayContinuityState from persisted DB fields.
 * Exported for unit tests.
 */
export function computeDisplayContinuityState(
  config: Pick<AgendaSyncConfig, "lastSyncOk" | "lastGoodSnapshotId">,
): DisplayContinuityState {
  if (config.lastSyncOk === true && config.lastGoodSnapshotId) return "Current";
  if (config.lastGoodSnapshotId) return "Using last-known-good";
  return "No valid snapshot";
}

// ===== Legacy compatibility wrappers (used by existing routes/tests) =====

export interface SourceConnectionHealth {
  configId: string;
  configName: string;
  sourceType: string;
  /** null = never synced */
  ok: boolean | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: Date | null;
}

export interface DisplayContinuity {
  configId: string;
  configName: string;
  /** True when a last-good snapshot exists for this config. */
  hasLastGoodSnapshot: boolean;
  /** Item count from the last successful sync, or null if never synced. */
  lastItemCount: number | null;
  lastSyncOk: boolean | null;
}

export function extractSourceConnectionHealth(
  config: AgendaSyncConfig,
): SourceConnectionHealth {
  return {
    configId: config.id,
    configName: config.name,
    sourceType: config.sourceType,
    ok: config.lastSyncOk ?? null,
    consecutiveFailures: config.consecutiveFailureCount ?? 0,
    lastError: config.lastError ?? null,
    lastErrorAt: config.lastErrorAt ?? null,
  };
}

export function extractDisplayContinuity(
  config: AgendaSyncConfig,
): DisplayContinuity {
  return {
    configId: config.id,
    configName: config.name,
    hasLastGoodSnapshot: !!config.lastGoodSnapshotId,
    lastItemCount: config.lastItemCount ?? null,
    lastSyncOk: config.lastSyncOk ?? null,
  };
}

/**
 * Notification hook for persistent feed failures / recoveries (Task #220).
 *
 * The engine owns the *decision* (it tracks the consecutive-failure
 * count and the one-shot "already alerted" flag on the config row);
 * the alerter owns *delivery* — resolving the site's alert recipients
 * and sending the email. Splitting it this way keeps runAgendaSync
 * testable (tests inject a recording alerter) while the real
 * implementation (server/routes.ts) reuses the same per-client alert
 * routing as the screen-status alerts.
 */
export interface AgendaSyncAlerter {
  /** A feed has just crossed the consecutive-failure threshold. */
  notifyFeedFailing(
    config: AgendaSyncConfig,
    failureCount: number,
    error: string,
    erroredAt: Date,
  ): Promise<void>;
  /** A previously-alerting feed has synced successfully again. */
  notifyFeedRecovered(config: AgendaSyncConfig): Promise<void>;
}

export interface AgendaSyncDeps {
  storage: AgendaSyncStorage;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Optional overrides forwarded to safeFetch (DNS lookup, caps). Used by tests. */
  safeFetchOptions?: Pick<SafeFetchOptions, "lookupImpl" | "maxBytes" | "timeoutMs">;
  /** Delivers persistent-failure / recovery notifications (Task #220). */
  alerter?: AgendaSyncAlerter;
  /**
   * Number of consecutive failed syncs before the first "feed failing"
   * alert fires. Defaults to AGENDA_FAILURE_ALERT_THRESHOLD (3).
   */
  failureAlertThreshold?: number;
  /**
   * Task #267 — resolves an uploaded_xlsx `storedFilePath` (a path
   * relative to the upload root) into an absolute, root-contained path
   * before the engine reads it. Supplied by the route layer
   * (fileStorage.getAbsolutePath) so the engine stays decoupled from
   * file storage. When absent the stored path is read verbatim.
   */
  resolveStoredPath?: (storedPath: string) => Promise<string>;
  /**
   * Task #268 — fetches the .xlsx bytes for a Microsoft-backed source
   * (excel_onedrive / sharepoint_excel with `microsoftAuth`) via
   * Microsoft Graph. Supplied by the route layer (server/microsoftGraph)
   * so the engine stays decoupled from the connector plumbing and tests
   * can inject a mock. When the source is Microsoft-backed but this is
   * absent, the engine falls back to the public-link path. The impl
   * throws when no Microsoft account is connected so the caller surfaces
   * the connect-Microsoft guidance instead of the generic message.
   */
  graphFetch?: (config: AgendaSyncConfig) => Promise<Uint8Array>;
  /**
   * Task #362 — fetches the Microsoft Graph cTag (change tag) for the
   * source file without downloading its bytes. When the cTag matches the
   * stored `lastCTag`, the sync is skipped (no download, no parse, no DB
   * write). When absent or when cTag is unavailable, a full download is
   * always performed. Supplied by the route layer (fetchMicrosoftCTag from
   * server/microsoftGraph.ts). Returns null on any error so the caller
   * treats it as "unknown → always download" rather than surfacing an error.
   */
  graphCTagFetch?: (config: AgendaSyncConfig) => Promise<string | null>;
  /**
   * Task #362 — injectable in-process sync lock. Defaults to the module-global
   * IN_FLIGHT_SYNCS set (correct for production). Tests that exercise concurrent
   * runAgendaSync calls should inject a fresh `new Set<string>()` to avoid
   * cross-test pollution of the shared global.
   */
  inFlightLock?: Set<string>;
}

// ===== In-process per-source lock (Task #362) =====
//
// Prevents two concurrent runAgendaSync calls for the same Microsoft-backed
// config (e.g. two scheduler ticks overlapping during a slow download).
// A Set is sufficient because this is a single-process deployment.
// Multi-process deployments should use pg_try_advisory_xact_lock instead.
const IN_FLIGHT_SYNCS = new Set<string>();
// Rate-limit map for manual /run requests (production only, per config).
// Prevents an operator from hammering Refresh Now faster than the cooldown.
export const MANUAL_RUN_COOLDOWN_MS = 30_000;
const lastManualRunAt = new Map<string, number>();

/**
 * Returns the remaining milliseconds of the rate-limit window for a manual
 * /run trigger, or 0 if the next manual run is allowed. Used by the route
 * layer to enforce the cooldown without knowledge of the map internals.
 */
export function manualRunCooldownRemainingMs(configId: string): number {
  const last = lastManualRunAt.get(configId);
  if (last === undefined) return 0;
  const elapsed = Date.now() - last;
  return elapsed >= MANUAL_RUN_COOLDOWN_MS ? 0 : MANUAL_RUN_COOLDOWN_MS - elapsed;
}

/**
 * Records a manual /run trigger for rate-limiting purposes.
 * Call immediately before dispatching the sync so the cooldown starts
 * at the trigger moment, not after the (potentially slow) sync completes.
 */
export function recordManualRun(configId: string): void {
  lastManualRunAt.set(configId, Date.now());
}

// True when a config is a Microsoft Graph-backed OneDrive/SharePoint
// Excel source (operator opted into Microsoft sign-in). Only these two
// source types support it.
export function isMicrosoftBackedSource(
  config: Pick<AgendaSyncConfig, "sourceType" | "microsoftAuth">,
): boolean {
  return (
    config.microsoftAuth === true &&
    (config.sourceType === "excel_onedrive" || config.sourceType === "sharepoint_excel")
  );
}

/** Consecutive failed syncs before a feed-failing alert is sent. */
export const AGENDA_FAILURE_ALERT_THRESHOLD = 3;

interface ParsedUpstream {
  externalId: string;
  data: Omit<InsertAgendaItem, "clientId" | "externalSyncConfigId">;
}

/**
 * Rewrite a Google Sheets URL into its CSV-export form.
 *
 * Operators almost always paste the URL from the browser address bar
 * (e.g. ".../edit?gid=997501812#gid=997501812" or ".../edit?usp=sharing"),
 * which serves the HTML editor, not CSV. Fetching those URLs returns
 * HTML that the parser then treats as garbage rows — which is why
 * syncs were reporting `ok:true` with `totalUpstream:0` and a wall of
 * "Invalid startsAt or endsAt" warnings.
 *
 * Strategy:
 *   - If the URL matches `docs.google.com/spreadsheets/d/{id}/...`,
 *     extract the spreadsheet id, pull the gid from `?gid=` or
 *     `#gid=` if present, and emit
 *     `https://docs.google.com/spreadsheets/d/{id}/export?format=csv[&gid={gid}]`.
 *   - Anything that isn't a recognised Google Sheets URL (or already
 *     points at `/export`, `/pub`, or `gviz/tq`) is returned unchanged.
 *
 * Exported for unit tests.
 */
export function normalizeGoogleSheetsCsvUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!/(^|\.)docs\.google\.com$/i.test(parsed.hostname)) return rawUrl;
  if (!/^\/spreadsheets\//i.test(parsed.pathname)) return rawUrl;
  // Already a CSV / published / gviz export — leave it alone.
  if (/\/(export|pub|gviz)\b/i.test(parsed.pathname)) return rawUrl;
  const idMatch = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return rawUrl;
  const sheetId = idMatch[1];
  // gid can live in `?gid=` or the `#gid=` fragment (browser address
  // bar form). Prefer the query string when both are present.
  let gid: string | null = parsed.searchParams.get("gid");
  if (!gid && parsed.hash) {
    const hashMatch = parsed.hash.match(/gid=([0-9]+)/);
    if (hashMatch) gid = hashMatch[1];
  }
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  return gid ? `${base}&gid=${encodeURIComponent(gid)}` : base;
}

/**
 * Best-effort rewrite of a OneDrive / SharePoint *share* link into a
 * direct-download form by appending `download=1`. This works for many
 * SharePoint/OneDrive-for-Business links; personal `1drv.ms` shorteners
 * and sign-in-gated files won't transform and will surface the
 * ONEDRIVE_CANNOT_READ_MESSAGE guidance instead. Exported for tests.
 */
export function normalizeOneDriveSharePointUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const host = parsed.hostname.toLowerCase();
  const isMs =
    host.endsWith("sharepoint.com") ||
    host.endsWith("onedrive.live.com") ||
    host.endsWith("1drv.ms");
  if (!isMs) return rawUrl;
  if (parsed.searchParams.get("download") === "1") return rawUrl;
  parsed.searchParams.set("download", "1");
  return parsed.toString();
}

interface FetchedContent {
  text?: string;
  bytes?: Uint8Array;
}

// Load the raw source content for a config. URL-based types go through
// the SSRF-hardened safeFetch; uploaded_xlsx reads the stored file from
// disk. XLSX types return bytes; text types return text.
async function loadSourceContent(
  config: AgendaSyncConfig,
  fetchImpl: typeof fetch,
  extra?: AgendaSyncDeps["safeFetchOptions"],
  resolveStoredPath?: AgendaSyncDeps["resolveStoredPath"],
  graphFetch?: AgendaSyncDeps["graphFetch"],
): Promise<FetchedContent> {
  const isXlsx = XLSX_SOURCE_SET.has(config.sourceType);

  if (config.sourceType === "uploaded_xlsx") {
    if (!config.storedFilePath) {
      throw new Error("No uploaded file is attached to this source.");
    }
    const abs = resolveStoredPath
      ? await resolveStoredPath(config.storedFilePath)
      : config.storedFilePath;
    const buf = await readFile(abs);
    return { bytes: new Uint8Array(buf) };
  }

  // Task #268 — Microsoft Graph-backed OneDrive/SharePoint Excel. When
  // the operator opted into Microsoft sign-in we pull the .xlsx bytes
  // through Graph (private files supported) instead of the public-link
  // path. graphFetch throws a connect-Microsoft error when nothing is
  // bound — surfaced verbatim to the operator. We still validate the
  // ZIP magic so a non-xlsx response fails loudly.
  if (isMicrosoftBackedSource(config)) {
    if (!graphFetch) {
      throw new Error(
        "Microsoft sign-in support is unavailable in this context. Use a public direct-download link instead.",
      );
    }
    const bytes = await graphFetch(config);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error(
        "Microsoft returned a file that isn't a valid .xlsx workbook. Make sure the selected file is an Excel .xlsx.",
      );
    }
    return { bytes };
  }

  // Resolve the effective URL per source type.
  let effectiveUrl = config.sourceUrl ?? "";
  if (!effectiveUrl) throw new Error("Source URL is not set.");
  if (config.sourceType === "google_sheets_csv" || config.sourceType === "google_sheets") {
    effectiveUrl = normalizeGoogleSheetsCsvUrl(effectiveUrl);
  } else if (config.sourceType === "excel_onedrive" || config.sourceType === "sharepoint_excel") {
    effectiveUrl = normalizeOneDriveSharePointUrl(effectiveUrl);
  }

  // SSRF-hardened fetch: only http/https, blocks private/reserved
  // ranges, re-validates each redirect hop, caps body size, 15s budget.
  const res = await safeFetch(effectiveUrl, {
    fetchImpl,
    timeoutMs: extra?.timeoutMs ?? 15_000,
    maxBytes: extra?.maxBytes,
    lookupImpl: extra?.lookupImpl,
  });
  if (res.status < 200 || res.status >= 300) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `The source rejected our request (HTTP ${res.status}). This usually means the link isn't publicly readable. ` +
          `For Google Sheets, use File → Share → Publish to web (or set "Anyone with the link can view"). ` +
          `For OneDrive/SharePoint, the file must be shared so "anyone with the link" can access it. ` +
          `Private files that need a sign-in can't be read directly.`,
      );
    }
    if (res.status === 404) {
      throw new Error(`The source URL returned "Not Found" (HTTP 404). Double-check the link.`);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  if (isXlsx) {
    // A real XLSX is a ZIP — magic bytes "PK" (0x50 0x4B). Anything
    // else (an HTML sign-in / preview page) means the link can't be
    // read directly; surface the operator-facing guidance.
    const b = res.bytes;
    if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b) {
      throw new Error(ONEDRIVE_CANNOT_READ_MESSAGE);
    }
    return { bytes: b };
  }
  return { text: res.text };
}

// Resolve the wall-clock timezone for mapped date parsing:
// config.timezone → client.timezone → fallback.
async function resolveTimezone(
  config: AgendaSyncConfig,
  storage: AgendaSyncStorage,
): Promise<string> {
  if (config.timezone) return config.timezone;
  if (storage.getClient) {
    try {
      const client = await storage.getClient(config.clientId);
      if (client?.timezone) return client.timezone;
    } catch {
      /* fall through to default */
    }
  }
  return DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
}

// Build the Cell[][] grid (and sheet names for XLSX) from fetched
// content for a mapped source type.
async function loadGridForConfig(
  config: Pick<AgendaSyncConfig, "sourceType" | "sheetName">,
  content: FetchedContent,
): Promise<{ grid: Grid; sheetNames: string[] }> {
  if (XLSX_SOURCE_SET.has(config.sourceType)) {
    if (!content.bytes) throw new Error("No spreadsheet data was fetched.");
    const wb = await parseWorkbookBuffer(content.bytes);
    return { grid: wb.getGrid(config.sheetName), sheetNames: wb.sheetNames };
  }
  return { grid: parseCsvToGrid(content.text ?? ""), sheetNames: [] };
}

// Fast preview grid loader (Task #267 optimisation). Test/Preview only
// need the header row plus a handful of sample rows, so for XLSX sources
// we stream just the target sheet and abort after `maxRows` instead of
// materialising the whole (possibly huge) workbook via parseWorkbookBuffer.
// `truncated` is true when the sheet has more rows below the sampled
// window. CSV content is already in memory, so it is parsed in full.
async function loadPreviewGrid(
  config: Pick<AgendaSyncConfig, "sourceType" | "sheetName">,
  content: FetchedContent,
  maxRows: number,
): Promise<{ grid: Grid; sheetNames: string[]; truncated: boolean }> {
  if (XLSX_SOURCE_SET.has(config.sourceType)) {
    if (!content.bytes) throw new Error("No spreadsheet data was fetched.");
    const sample = await readSheetSample(content.bytes, {
      sheetName: config.sheetName,
      maxRows,
    });
    return {
      grid: sample.grid,
      sheetNames: sample.sheetNames,
      truncated: sample.truncated,
    };
  }
  return {
    grid: parseCsvToGrid(content.text ?? ""),
    sheetNames: [],
    truncated: false,
  };
}

// The fields a preview / test request supplies. A subset of a full
// AgendaSyncConfig — enough to fetch + parse + map without persisting.
export type AgendaSourceDraft = Pick<
  AgendaSyncConfig,
  | "clientId"
  | "sourceType"
  | "sourceUrl"
  | "storedFilePath"
  | "sheetName"
  | "headerRowIndex"
  | "firstDataRowIndex"
  | "columnMapping"
  | "externalIdColumn"
  | "timezone"
  | "dateFormatHint"
  | "startTimeColumn"
  | "endTimeColumn"
  | "dateBaseYear"
  | "dateBaseMonth"
  // Task #268 — Microsoft Graph-backed source addressing.
  | "microsoftAuth"
  | "msDriveId"
  | "msItemId"
>;

export interface AgendaSourcePreview {
  sheetNames: string[];
  headers: string[];
  /** First N data rows, stringified for display. */
  sampleRows: string[][];
  totalDataRows: number;
  /**
   * True when the source was only partially read for speed, so
   * `totalDataRows` is the sampled count, not the true total. The full
   * row set is processed at sync time.
   */
  totalDataRowsTruncated: boolean;
  suggestedMapping: ReturnType<typeof suggestColumnMapping>;
  /** Required fields still missing from the supplied mapping. */
  missingRequired: string[];
  /** Per-row mapping outcome for the sample (only when a mapping is supplied). */
  mapped?: {
    okCount: number;
    errorCount: number;
    skippedCount: number;
    rows: Array<{
      rowNumber: number;
      status: "ok" | "error" | "skipped";
      error?: string;
      title?: string;
      startsAt?: string;
      endsAt?: string;
      status_?: string;
    }>;
  };
}

// Fetch + parse a (possibly unsaved) mapped source and return a preview:
// detected sheet names, headers, sample rows, an auto-suggested mapping,
// and — when a mapping is supplied — the per-row mapping outcome. Powers
// the admin "Test connection" / mapping panel. Never used for ics /
// google_sheets_csv (those keep their fixed-column flow).
export async function previewAgendaSource(
  draft: AgendaSourceDraft,
  deps: {
    storage: AgendaSyncStorage;
    fetchImpl?: typeof fetch;
    safeFetchOptions?: AgendaSyncDeps["safeFetchOptions"];
    resolveStoredPath?: AgendaSyncDeps["resolveStoredPath"];
    graphFetch?: AgendaSyncDeps["graphFetch"];
  },
  opts: { sampleLimit?: number } = {},
): Promise<AgendaSourcePreview> {
  const sampleLimit = opts.sampleLimit ?? 20;
  const fetchImpl = deps.fetchImpl ?? fetch;
  // loadSourceContent only reads sourceType / sourceUrl / storedFilePath
  // / sheetName / microsoftAuth / msDriveId / msItemId — safe to pass the
  // draft cast to a full config.
  const content = await loadSourceContent(
    draft as AgendaSyncConfig,
    fetchImpl,
    deps.safeFetchOptions,
    deps.resolveStoredPath,
    deps.graphFetch,
  );
  // Read only as far as we need: the header row plus `sampleLimit` data
  // rows (with a small buffer for blank/header-offset rows).
  const headerRowIndex = draft.headerRowIndex ?? 0;
  const firstDataRowIndex = draft.firstDataRowIndex ?? headerRowIndex + 1;
  const maxRows = firstDataRowIndex + sampleLimit + 5;
  const { grid, sheetNames, truncated } = await loadPreviewGrid(
    draft,
    content,
    maxRows,
  );
  const { headers, dataRows } = extractGrid(
    grid,
    draft.headerRowIndex ?? 0,
    draft.firstDataRowIndex,
  );
  const suggestedMapping = suggestColumnMapping(headers);
  const sampleRows = dataRows
    .slice(0, sampleLimit)
    .map((row) => headers.map((_, i) => cellToString(row[i])));

  const preview: AgendaSourcePreview = {
    sheetNames,
    headers,
    sampleRows,
    totalDataRows: dataRows.length,
    totalDataRowsTruncated: truncated,
    suggestedMapping,
    missingRequired: [],
  };

  const mapping = draft.columnMapping;
  if (mapping && Object.keys(mapping).length > 0) {
    preview.missingRequired = missingRequiredMappings(mapping);
    const timezone = await resolveTimezone(draft as AgendaSyncConfig, deps.storage);
    const mapped = applyMapping(dataRows.slice(0, sampleLimit), {
      headers,
      mapping,
      externalIdColumn: draft.externalIdColumn,
      timezone,
      dateFormatHint: draft.dateFormatHint,
      startTimeColumn: draft.startTimeColumn,
      endTimeColumn: draft.endTimeColumn,
      dateBaseYear: draft.dateBaseYear,
      dateBaseMonth: draft.dateBaseMonth,
    });
    let okCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const rows = mapped.map((r) => {
      if (r.status === "ok") okCount++;
      else if (r.status === "error") errorCount++;
      else skippedCount++;
      return {
        rowNumber: r.rowNumber,
        status: r.status,
        error: r.error,
        title: r.item?.title,
        startsAt: r.item?.startsAt?.toISOString(),
        endsAt: r.item?.endsAt?.toISOString(),
        status_: r.item?.status,
      };
    });
    preview.mapped = { okCount, errorCount, skippedCount, rows };
  }

  return preview;
}

// Turn a fetched content payload into parsed upstream rows. ics and
// google_sheets_csv keep their original fixed-column behaviour; all
// other (mapped) types run through the shared column-mapping layer.
async function parseUpstreamForConfig(
  config: AgendaSyncConfig,
  content: FetchedContent,
  storage: AgendaSyncStorage,
): Promise<{ items: ParsedUpstream[]; warnings: string[] }> {
  const sourceType = config.sourceType;

  if (sourceType === "ics") {
    const { items, errors } = parseIcs(content.text ?? "");
    return {
      items: items.map((i) => ({ externalId: i.externalId, data: i.item })),
      warnings: errors,
    };
  }

  if (sourceType === "google_sheets_csv") {
    const rows = parseAgendaCsv(content.text ?? "");
    const warnings: string[] = [];
    const items: ParsedUpstream[] = [];
    for (const row of rows) {
      if (row.status === "error") {
        warnings.push(`Row ${row.index + 1}: ${row.error}`);
        continue;
      }
      if (!row.item) continue;
      // Synthesise a stable id from title+startsAt when the CSV doesn't
      // carry one (Google Sheets exports rarely include a UID column).
      const externalId = `${row.item.title}__${row.item.startsAt.toISOString()}`;
      items.push({ externalId, data: row.item });
    }
    return { items, warnings };
  }

  // ===== Mapped spreadsheet types (Task #267) =====
  if (!config.columnMapping) {
    throw new Error("This source has no column mapping configured yet.");
  }
  // Guard against a half-configured mapping (e.g. created directly via the
  // API). Running with a required field unmapped would produce zero ok
  // rows and — with removeMissingItems=true — tombstone every previously
  // synced item. Fail loudly instead so the catch path records the error
  // and skips removal entirely.
  const missing = missingRequiredMappings(config.columnMapping);
  if (missing.length > 0) {
    throw new Error(
      `Column mapping is incomplete — these required fields are unmapped: ${missing.join(", ")}.`,
    );
  }
  const { grid } = await loadGridForConfig(config, content);

  const { headers, dataRows } = extractGrid(
    grid,
    config.headerRowIndex ?? 0,
    config.firstDataRowIndex,
  );
  const timezone = await resolveTimezone(config, storage);
  const mapped = applyMapping(dataRows, {
    headers,
    mapping: config.columnMapping,
    externalIdColumn: config.externalIdColumn,
    timezone,
    dateFormatHint: config.dateFormatHint,
    startTimeColumn: config.startTimeColumn,
    endTimeColumn: config.endTimeColumn,
    dateBaseYear: config.dateBaseYear,
    dateBaseMonth: config.dateBaseMonth,
  });

  const items: ParsedUpstream[] = [];
  const warnings: string[] = [];
  for (const r of mapped) {
    if (r.status === "ok" && r.item && r.externalId) {
      items.push({ externalId: r.externalId, data: r.item });
    } else if (r.status === "error") {
      warnings.push(`Row ${r.rowNumber + 1}: ${r.error}`);
    }
  }
  return { items, warnings };
}

export async function runAgendaSync(
  config: AgendaSyncConfig,
  deps: AgendaSyncDeps,
): Promise<AgendaSyncResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ? deps.now() : new Date();
  const result: AgendaSyncResult = {
    ok: false,
    inserted: 0,
    updated: 0,
    skippedManual: 0,
    removed: 0,
    totalUpstream: 0,
  };

  const isMsBacked = isMicrosoftBackedSource(config);
  // A null source timezone inherits the site's timezone. Resolve it before
  // the cTag check so changing the site timezone also safely triggers a
  // reparse rather than reusing instants interpreted under the old timezone.
  const effectiveTimezone = isMsBacked
    ? await resolveTimezone(config, deps.storage)
    : undefined;
  const configFingerprint = computeAgendaParsingConfigFingerprint(
    config,
    effectiveTimezone,
  );

  // Task #362 — in-process lock. Prevent a slow Microsoft download from
  // overlapping with the next scheduler tick for the same config.
  // Use the caller-injected lock set when provided (test isolation); fall
  // back to the module-global for production.
  const lockSet = deps.inFlightLock ?? IN_FLIGHT_SYNCS;
  // Track in-flight phase via the production-global map only when the caller
  // is NOT injecting their own lock (i.e. this is a production run, not a
  // test). Tests use injected locks for isolation; phases aren't meaningful
  // in test-controlled environments.
  const trackPhase = isMsBacked && !deps.inFlightLock;
  if (isMsBacked) {
    if (lockSet.has(config.id)) {
      result.ok = true;
      result.noChange = true;
      return result;
    }
    lockSet.add(config.id);
  }
  if (trackPhase) IN_FLIGHT_PHASES.set(config.id, "checking");

  try {
    // Task #362 — cTag pre-check. Fetch the file's metadata-level change
    // tag BEFORE downloading bytes. If the cTag matches the one we stored
    // after the last successful sync, the file hasn't changed and we can
    // record the check time without transferring any bytes.
    let prefetchedCTag: string | null = null;
    if (isMsBacked && deps.graphCTagFetch) {
      prefetchedCTag = await deps.graphCTagFetch(config);
      if (
        prefetchedCTag !== null &&
        config.lastCTag !== null &&
        config.lastCTag !== undefined &&
        prefetchedCTag === config.lastCTag &&
        config.lastProcessedConfigFingerprint === configFingerprint
      ) {
        // The file and the parsing/merge configuration are unchanged — record
        // the check time and return without downloading.
        await deps.storage.updateAgendaSyncConfig(config.id, {
          lastSyncAt: now,
          lastSyncOk: true,
          consecutiveFailureCount: 0,
          failureAlertSent: false,
        });
        result.ok = true;
        result.noChange = true;
        return result;
      }
    }
    // cTag changed (or unavailable) — we are about to download bytes.
    if (trackPhase) IN_FLIGHT_PHASES.set(config.id, "updating");

    // Load + parse the source. URL normalisation (Google Sheets,
    // OneDrive/SharePoint) and XLSX-vs-text handling live in
    // loadSourceContent; column mapping for the generic spreadsheet
    // types lives in parseUpstreamForConfig. ics / google_sheets_csv
    // keep their original fixed-column behaviour.
    const content = await loadSourceContent(
      config,
      fetchImpl,
      deps.safeFetchOptions,
      deps.resolveStoredPath,
      deps.graphFetch,
    );
    const { items: upstream, warnings } = await parseUpstreamForConfig(
      config,
      content,
      deps.storage,
    );
    result.totalUpstream = upstream.length;
    const trimmedWarnings = warnings.slice(0, 50);
    if (trimmedWarnings.length > 0) result.parseWarnings = trimmedWarnings;

    // A workbook that produced only validation errors must never replace the
    // last-known-good snapshot with an empty one or tombstone its existing
    // rows. We deliberately do not record the current fingerprint here, so a
    // corrected configuration retries even if the workbook cTag is unchanged.
    if (isMsBacked && upstream.length === 0 && trimmedWarnings.length > 0) {
      await deps.storage.updateAgendaSyncConfig(config.id, {
        lastSyncAt: now,
        lastSyncOk: true,
        lastError: null,
        lastErrorAt: null,
        lastItemCount: 0,
        lastSyncWarnings: trimmedWarnings,
        consecutiveFailureCount: 0,
        failureAlertSent: false,
      });
      result.ok = true;
      return result;
    }

    const existing = await deps.storage.getAgendaItemsBySyncConfig(config.id);

    // Task #362 — atomic promotion path for Microsoft-backed sources.
    // When storage provides atomicMicrosoftSync, the entire upsert +
    // tombstone + snapshot write + cTag record happens in one DB
    // transaction. A failure leaves the previous snapshot serving players
    // untouched. When not provided, fall back to the legacy per-row path.
    if (isMsBacked && deps.storage.atomicMicrosoftSync) {
      const seenExternalIds = new Set(upstream.map((u) => u.externalId));
      const newItems: InsertAgendaItem[] = upstream.map((up) => ({
        clientId: config.clientId,
        title: up.data.title,
        description: up.data.description ?? null,
        room: up.data.room ?? null,
        track: up.data.track ?? null,
        presenter: up.data.presenter ?? null,
        startsAt: up.data.startsAt,
        endsAt: up.data.endsAt,
        status: up.data.status ?? "scheduled",
        statusMessage: up.data.statusMessage ?? null,
        externalSyncConfigId: config.id,
        externalId: up.externalId,
        manualOverride: false,
      }));
      // Task #362 — bookend cTag: fetch the metadata cTag again AFTER the
      // download+parse succeed. Only store the cTag when pre == post, which
      // demonstrates the file was stable across the entire download window.
      // If the file changed during our download (pre != post), we pass null
      // so the stored lastCTag is NOT updated — the next tick will detect the
      // new cTag and re-download. This prevents permanently serving stale data
      // when a file changes exactly between our cTag fetch and content fetch.
      let cTagToStore: string | null = null;
      if (isMsBacked && deps.graphCTagFetch && prefetchedCTag !== null) {
        const postDownloadCTag = await deps.graphCTagFetch(config).catch(() => null);
        if (postDownloadCTag !== null && postDownloadCTag === prefetchedCTag) {
          // File was stable across the whole download window — the stored cTag
          // is demonstrably for the data we are about to commit.
          cTagToStore = postDownloadCTag;
        }
        // If postDownloadCTag !== prefetchedCTag: file changed during download.
        // Leave cTagToStore = null so lastCTag is not updated, forcing a
        // re-download on the next tick against the newer file version.
      }

      // lastCTagChangedAt: set when a new cTag is being stored (the file's
      // content changed relative to the last stored cTag). Also set on the
      // very first download (no stored cTag to compare against).
      const cTagChanged = cTagToStore !== null && cTagToStore !== config.lastCTag;
      const atomicResult = await deps.storage.atomicMicrosoftSync({
        configId: config.id,
        clientId: config.clientId,
        newItems,
        existingItems: existing,
        removeMissingItems: config.removeMissingItems !== false,
        seenExternalIds,
        newCTag: cTagToStore,
        configFingerprint,
        lastPublishedAt: now,
        lastCTagChangedAt: cTagChanged ? now : null,
      });
      result.inserted = atomicResult.inserted;
      result.updated = atomicResult.updated;
      result.skippedManual = atomicResult.skippedManual;
      result.removed = atomicResult.removed;

      // Prune old snapshots in the background (keep last 5).
      if (deps.storage.pruneOldAgendaSnapshots) {
        deps.storage.pruneOldAgendaSnapshots(config.id, 5).catch((err) => {
          console.error(`[agenda-sync] snapshot prune failed for ${config.id}:`, err);
        });
      }
    } else {
      // Legacy per-row upsert path (non-MS sources and test stubs).
      const existingByExt = new Map<string, AgendaItem>();
      for (const row of existing) {
        if (row.externalId) existingByExt.set(row.externalId, row);
      }
      const seenExt = new Set<string>();

      for (const up of upstream) {
        seenExt.add(up.externalId);
        const prev = existingByExt.get(up.externalId);
        if (prev) {
          if (prev.manualOverride) {
            result.skippedManual++;
            continue;
          }
          await deps.storage.updateAgendaItem(prev.id, {
            title: up.data.title,
            description: up.data.description ?? null,
            room: up.data.room ?? null,
            track: up.data.track ?? null,
            presenter: up.data.presenter ?? null,
            startsAt: up.data.startsAt,
            endsAt: up.data.endsAt,
            status: up.data.status ?? "scheduled",
            statusMessage: up.data.statusMessage ?? null,
          });
          result.updated++;
        } else {
          await deps.storage.createAgendaItem({
            clientId: config.clientId,
            title: up.data.title,
            description: up.data.description ?? null,
            room: up.data.room ?? null,
            track: up.data.track ?? null,
            presenter: up.data.presenter ?? null,
            startsAt: up.data.startsAt,
            endsAt: up.data.endsAt,
            status: up.data.status ?? "scheduled",
            statusMessage: up.data.statusMessage ?? null,
            externalSyncConfigId: config.id,
            externalId: up.externalId,
            manualOverride: false,
          });
          result.inserted++;
        }
      }

      // Tombstone removal: anything we used to own that no longer
      // appears upstream is dropped, unless the operator marked it
      // manualOverride (in which case we treat it as locally owned).
      // When removeMissingItems is false the operator wants to keep
      // previously-synced rows even when they drop out of the source, so
      // we skip removal entirely. (Default true preserves legacy
      // behaviour for ics / google_sheets_csv feeds.)
      if (config.removeMissingItems !== false) {
        for (const row of existing) {
          if (!row.externalId) continue;
          if (seenExt.has(row.externalId)) continue;
          if (row.manualOverride) continue;
          await deps.storage.deleteAgendaItem(row.id);
          result.removed++;
        }
      }
    }

    // Task #220 — a successful sync clears the failure streak. If we'd
    // previously alerted that this feed was failing, fire a one-shot
    // "recovered" notification and reset the flag.
    const wasAlerting = config.failureAlertSent === true;
    await deps.storage.updateAgendaSyncConfig(config.id, {
      lastSyncAt: now,
      lastSyncOk: true,
      lastError: null,
      lastErrorAt: null,
      lastItemCount: upstream.length,
      lastSyncWarnings: trimmedWarnings.length > 0 ? trimmedWarnings : null,
      consecutiveFailureCount: 0,
      failureAlertSent: false,
      ...(isMsBacked ? { lastProcessedConfigFingerprint: configFingerprint } : {}),
    });
    result.ok = true;
    if (wasAlerting && deps.alerter) {
      try {
        await deps.alerter.notifyFeedRecovered(config);
      } catch (alertErr) {
        console.error(
          `[agenda-sync] recovery alert failed for config ${config.id}:`,
          alertErr,
        );
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    // Task #220 — bump the consecutive-failure streak and decide whether
    // this is the moment to notify. We alert exactly once per outage:
    // the first failure that reaches the threshold while no alert has
    // been sent yet flips `failureAlertSent`, which a later success
    // resets.
    const threshold = deps.failureAlertThreshold ?? AGENDA_FAILURE_ALERT_THRESHOLD;
    const newCount = (config.consecutiveFailureCount ?? 0) + 1;
    const shouldAlert = newCount >= threshold && config.failureAlertSent !== true;
    await deps.storage.updateAgendaSyncConfig(config.id, {
      lastSyncAt: now,
      lastSyncOk: false,
      lastError: message.slice(0, 500),
      lastErrorAt: now,
      consecutiveFailureCount: newCount,
      failureAlertSent: shouldAlert ? true : config.failureAlertSent === true,
    });
    if (shouldAlert && deps.alerter) {
      try {
        await deps.alerter.notifyFeedFailing(config, newCount, message, now);
      } catch (alertErr) {
        console.error(
          `[agenda-sync] failure alert failed for config ${config.id}:`,
          alertErr,
        );
      }
    }
    return result;
  } finally {
    // Release in-process lock and clear phase so the next scheduler tick can run.
    if (isMsBacked) {
      lockSet.delete(config.id);
    }
    if (trackPhase) IN_FLIGHT_PHASES.delete(config.id);
  }
}

export async function runDueAgendaSyncs(
  deps: AgendaSyncDeps,
): Promise<{ ran: number; results: Array<{ configId: string; result: AgendaSyncResult }> }> {
  const now = deps.now ? deps.now() : new Date();
  const configs = await deps.storage.getAgendaSyncConfigs();
  const results: Array<{ configId: string; result: AgendaSyncResult }> = [];
  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    // Manual-mode feeds only sync when an operator triggers them, so the
    // scheduler skips them (null/"interval" run on the timer).
    if (cfg.syncMode === "manual") continue;
    const intervalMs = (cfg.syncIntervalMinutes || 60) * 60_000;
    const lastMs = cfg.lastSyncAt ? new Date(cfg.lastSyncAt).getTime() : 0;
    if (now.getTime() - lastMs < intervalMs) continue;
    const result = await runAgendaSync(cfg, deps);
    results.push({ configId: cfg.id, result });
  }
  return { ran: results.length, results };
}

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
import { parseWorkbookBuffer } from "./spreadsheetParse";
import { safeFetch, type SafeFetchOptions } from "./safeFetch";
import type {
  AgendaItem,
  AgendaSyncConfig,
  Client,
  InsertAgendaItem,
} from "@shared/schema";
import { AGENDA_XLSX_SOURCE_TYPES } from "@shared/schema";

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
>;

export interface AgendaSourcePreview {
  sheetNames: string[];
  headers: string[];
  /** First N data rows, stringified for display. */
  sampleRows: string[][];
  totalDataRows: number;
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
  },
  opts: { sampleLimit?: number } = {},
): Promise<AgendaSourcePreview> {
  const sampleLimit = opts.sampleLimit ?? 20;
  const fetchImpl = deps.fetchImpl ?? fetch;
  // loadSourceContent only reads sourceType / sourceUrl / storedFilePath
  // / sheetName — safe to pass the draft cast to a full config.
  const content = await loadSourceContent(
    draft as AgendaSyncConfig,
    fetchImpl,
    deps.safeFetchOptions,
    deps.resolveStoredPath,
  );
  const { grid, sheetNames } = await loadGridForConfig(draft, content);
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
  try {
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
    );
    const { items: upstream, warnings } = await parseUpstreamForConfig(
      config,
      content,
      deps.storage,
    );
    result.totalUpstream = upstream.length;
    const trimmedWarnings = warnings.slice(0, 50);
    if (trimmedWarnings.length > 0) result.parseWarnings = trimmedWarnings;

    const existing = await deps.storage.getAgendaItemsBySyncConfig(config.id);
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

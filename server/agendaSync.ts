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

import { parseIcs } from "@shared/agenda-ics";
import { parseAgendaCsv } from "@shared/agenda-csv";
import { safeFetch, type SafeFetchOptions } from "./safeFetch";
import type {
  AgendaItem,
  AgendaSyncConfig,
  InsertAgendaItem,
} from "@shared/schema";

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
}

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

async function fetchSource(
  url: string,
  fetchImpl: typeof fetch,
  extra?: AgendaSyncDeps["safeFetchOptions"],
): Promise<string> {
  // SSRF-hardened fetch: only http/https, blocks private / loopback /
  // link-local / cloud-metadata / multicast / reserved ranges, follows
  // redirects manually (re-validating each hop), and caps body size.
  // 15s budget — anything longer is almost certainly hung and should
  // fail fast so the next tick gets another shot.
  const res = await safeFetch(url, {
    fetchImpl,
    timeoutMs: extra?.timeoutMs ?? 15_000,
    maxBytes: extra?.maxBytes,
    lookupImpl: extra?.lookupImpl,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.text;
}

function parseUpstream(
  sourceType: AgendaSyncConfig["sourceType"],
  text: string,
): { items: ParsedUpstream[]; warnings: string[] } {
  if (sourceType === "ics") {
    const { items, errors } = parseIcs(text);
    return {
      items: items.map((i) => ({ externalId: i.externalId, data: i.item })),
      warnings: errors,
    };
  }
  if (sourceType === "google_sheets_csv") {
    const rows = parseAgendaCsv(text);
    const warnings: string[] = [];
    const items: ParsedUpstream[] = [];
    for (const row of rows) {
      if (row.status === "error") {
        warnings.push(`Row ${row.index + 1}: ${row.error}`);
        continue;
      }
      if (!row.item) continue;
      // Synthesise a stable id from title+startsAt when the CSV
      // doesn't carry one. Google Sheets exports rarely include a
      // dedicated UID column, but title+start is stable enough as
      // long as operators don't reuse the same title in the same
      // minute.
      const externalId = `${row.item.title}__${row.item.startsAt.toISOString()}`;
      items.push({ externalId, data: row.item });
    }
    return { items, warnings };
  }
  throw new Error(`Unsupported source type: ${sourceType}`);
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
    // Rewrite browser-address-bar Google Sheets URLs (".../edit?gid=...")
    // into the CSV-export form before fetching. Other source types
    // (ICS) pass through unchanged.
    const effectiveUrl =
      config.sourceType === "google_sheets_csv"
        ? normalizeGoogleSheetsCsvUrl(config.sourceUrl)
        : config.sourceUrl;
    const text = await fetchSource(effectiveUrl, fetchImpl, deps.safeFetchOptions);
    const { items: upstream, warnings } = parseUpstream(
      config.sourceType as AgendaSyncConfig["sourceType"],
      text,
    );
    result.totalUpstream = upstream.length;
    if (warnings.length > 0) result.parseWarnings = warnings.slice(0, 50);

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
    for (const row of existing) {
      if (!row.externalId) continue;
      if (seenExt.has(row.externalId)) continue;
      if (row.manualOverride) continue;
      await deps.storage.deleteAgendaItem(row.id);
      result.removed++;
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
    const intervalMs = (cfg.syncIntervalMinutes || 60) * 60_000;
    const lastMs = cfg.lastSyncAt ? new Date(cfg.lastSyncAt).getTime() : 0;
    if (now.getTime() - lastMs < intervalMs) continue;
    const result = await runAgendaSync(cfg, deps);
    results.push({ configId: cfg.id, result });
  }
  return { ran: results.length, results };
}

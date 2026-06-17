// Task #290 — PostgreSQL-backed shared (L2) cache.
//
// This module is the single entry point for the cross-process shared cache.
// It sits BEHIND the existing in-memory (L1) caches that individual features
// already keep (e.g. server/sportmonksLive.ts). The contract:
//
//   L1 (in-memory, per-process)  →  L2 (this module, Postgres)  →  upstream
//
// Design guarantees (see .local/tasks/postgres-shared-cache.md):
//   - Single-flight: concurrent refreshes for the same (namespace,key) are
//     de-duplicated in-process so a stampede hits upstream only once.
//   - Serve-stale-without-blocking: when an entry is expired but present,
//     getOrSet returns the stale value immediately and refreshes in the
//     background (stale-while-revalidate). Displays never block on a slow
//     or failing provider.
//   - Tenant isolation: any per-site payload MUST encode its clientId /
//     configId in the cache key via buildCacheKey so a cached row can never
//     be read by another tenant.
//   - Secret hygiene: never persist tokens, signed URLs or credentials into
//     value_json / value_text / source / error_message / metadata. Callers
//     sanitise their payloads; safeJsonForCache only strips undefined/functions.

import { storage } from "./storage";
import type { SharedCacheEntry, SharedCacheStatus, InsertSharedCacheEntry } from "@shared/schema";

// ---------- Namespaces & default TTLs ----------

export const CACHE_NAMESPACES = {
  SPORTMONKS: "sportmonks",
  SWEEPSTAKE_DISPLAY: "sweepstake_display",
  AGENDA: "agenda",
  SPREADSHEET: "spreadsheet",
} as const;

export type CacheNamespace = (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];

// Sensible default TTLs (ms). Callers may override per call.
export const DEFAULT_TTLS = {
  SPORTMONKS_INPLAY: 12_000,
  SPORTMONKS_STANDINGS: 60_000,
  SPORTMONKS_FIXTURES: 5 * 60_000,
  SWEEPSTAKE_DISPLAY: 30_000,
  AGENDA_DISPLAY: 30_000,
  SPREADSHEET_SNAPSHOT: 10 * 60_000,
} as const;

// How long an expired row survives as last-known-good before GC removes it.
export const STALE_GRACE_MS = 24 * 60 * 60_000;

// ---------- Result shapes ----------

export interface GetOrSetResult<T> {
  data: T | null;
  status: SharedCacheStatus; // "fresh" | "stale" | "error"
  stale: boolean;
  ok: boolean;
  updatedAt: Date | null;
  source: string | null;
  error?: string;
}

export interface GetOrSetOptions<T> {
  namespace: string;
  key: string;
  ttlMs: number;
  fetcher: () => Promise<T>;
  source?: string;
  // Return a stale value if the refresh fails (default true).
  serveStaleOnError?: boolean;
  // Return stale immediately and refresh in the background (default true).
  // When false, getOrSet awaits the refresh even when a stale value exists.
  staleWhileRevalidate?: boolean;
  // Optional small, sanitised metadata bag to store alongside the value.
  metadata?: Record<string, unknown>;
}

// ---------- Helpers ----------

// Build a tenant-safe cache key. Parts are joined with ":"; null/undefined
// become "_". Always lead per-site keys with the owning clientId/configId.
export function buildCacheKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => (p === null || p === undefined || p === "" ? "_" : String(p)))
    .join(":");
}

export function calculateExpiry(ttlMs: number | null): Date | null {
  if (ttlMs === null || !Number.isFinite(ttlMs) || ttlMs <= 0) return null;
  return new Date(Date.now() + ttlMs);
}

export function isExpired(entry: Pick<SharedCacheEntry, "expiresAt">, now: number = Date.now()): boolean {
  if (!entry.expiresAt) return false; // null = never expires
  return entry.expiresAt.getTime() <= now;
}

// Strip undefined/functions and any non-JSON values via a round-trip. This is
// NOT a secret scrubber — callers must not hand us tokens/credentials.
export function safeJsonForCache<T>(value: T): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Defence in depth: drop anything that looks like a query string carrying a
  // token, so a leaky upstream error can never persist a credential.
  return msg.replace(/([?&](api_?token|token|key|access_token|sig|signature)=)[^&\s]+/gi, "$1[redacted]").slice(0, 1000);
}

// ---------- Single-flight registry ----------

const inflight = new Map<string, Promise<GetOrSetResult<any>>>();

function flightId(namespace: string, key: string): string {
  return `${namespace}::${key}`;
}

// ---------- Core operations ----------

export async function get<T>(namespace: string, key: string): Promise<GetOrSetResult<T> | null> {
  const entry = await storage.getSharedCacheEntry(namespace, key);
  if (!entry) return null;
  const stale = isExpired(entry);
  return {
    data: (entry.valueJson as T) ?? null,
    status: entry.status === "error" ? "error" : stale ? "stale" : "fresh",
    stale,
    ok: entry.status !== "error",
    updatedAt: entry.lastUpdatedAt ?? null,
    source: entry.source ?? null,
    error: entry.errorMessage ?? undefined,
  };
}

// Return last-known-good regardless of expiry (never null-checks freshness).
export async function getStale<T>(namespace: string, key: string): Promise<GetOrSetResult<T> | null> {
  return get<T>(namespace, key);
}

export async function set<T>(
  namespace: string,
  key: string,
  data: T,
  opts: { ttlMs?: number | null; source?: string; metadata?: Record<string, unknown>; valueText?: string } = {},
): Promise<void> {
  const payload: InsertSharedCacheEntry = {
    namespace,
    cacheKey: key,
    valueJson: opts.valueText !== undefined ? null : (safeJsonForCache(data) as any),
    valueText: opts.valueText ?? null,
    expiresAt: calculateExpiry(opts.ttlMs ?? null),
    lastUpdatedAt: new Date(),
    source: opts.source ?? null,
    status: "fresh",
    errorMessage: null,
    metadata: opts.metadata ? (safeJsonForCache(opts.metadata) as any) : null,
  };
  await storage.upsertSharedCacheEntry(payload);
}

export async function del(namespace: string, key: string): Promise<boolean> {
  return storage.deleteSharedCacheEntry(namespace, key);
}

export async function clearNamespace(namespace: string): Promise<number> {
  return storage.clearSharedCacheNamespace(namespace);
}

// Record a refresh failure while preserving any existing value as stale.
export async function markError(
  namespace: string,
  key: string,
  error: unknown,
  opts: { source?: string } = {},
): Promise<void> {
  const existing = await storage.getSharedCacheEntry(namespace, key);
  await storage.upsertSharedCacheEntry({
    namespace,
    cacheKey: key,
    // Preserve the last-known-good value so getStale still serves it.
    valueJson: (existing?.valueJson as any) ?? null,
    valueText: existing?.valueText ?? null,
    // Keep the previous expiry; do not extend freshness on a failure.
    expiresAt: existing?.expiresAt ?? null,
    lastUpdatedAt: existing?.lastUpdatedAt ?? null,
    source: opts.source ?? existing?.source ?? null,
    status: "error",
    errorMessage: sanitizeError(error),
    metadata: (existing?.metadata as any) ?? null,
  });
}

// Run the fetcher, persist a fresh entry on success, and on failure either
// serve the supplied stale value or surface the error. De-duplicated by the
// single-flight registry so concurrent callers share one upstream hit.
function refresh<T>(opts: GetOrSetOptions<T>, existing: SharedCacheEntry | undefined): Promise<GetOrSetResult<T>> {
  const id = flightId(opts.namespace, opts.key);
  const existingFlight = inflight.get(id) as Promise<GetOrSetResult<T>> | undefined;
  if (existingFlight) return existingFlight;

  const serveStaleOnError = opts.serveStaleOnError !== false;
  const p = (async (): Promise<GetOrSetResult<T>> => {
    try {
      const data = await opts.fetcher();
      const now = new Date();
      await storage.upsertSharedCacheEntry({
        namespace: opts.namespace,
        cacheKey: opts.key,
        valueJson: safeJsonForCache(data) as any,
        valueText: null,
        expiresAt: calculateExpiry(opts.ttlMs),
        lastUpdatedAt: now,
        source: opts.source ?? null,
        status: "fresh",
        errorMessage: null,
        metadata: opts.metadata ? (safeJsonForCache(opts.metadata) as any) : null,
      });
      return { data, status: "fresh", stale: false, ok: true, updatedAt: now, source: opts.source ?? null };
    } catch (err) {
      const message = sanitizeError(err);
      console.error(`[shared-cache] refresh failed for ${id}:`, message);
      try {
        await markError(opts.namespace, opts.key, err, { source: opts.source });
      } catch (markErr) {
        console.error(`[shared-cache] markError failed for ${id}:`, markErr);
      }
      if (existing && serveStaleOnError) {
        return {
          data: (existing.valueJson as T) ?? null,
          status: "stale",
          stale: true,
          ok: true,
          updatedAt: existing.lastUpdatedAt ?? null,
          source: existing.source ?? null,
          error: message,
        };
      }
      return {
        data: (existing?.valueJson as T) ?? null,
        status: "error",
        stale: false,
        ok: false,
        updatedAt: existing?.lastUpdatedAt ?? null,
        source: existing?.source ?? null,
        error: message,
      };
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, p);
  return p;
}

export async function getOrSet<T>(opts: GetOrSetOptions<T>): Promise<GetOrSetResult<T>> {
  const staleWhileRevalidate = opts.staleWhileRevalidate !== false;
  const entry = await storage.getSharedCacheEntry(opts.namespace, opts.key);

  // Fresh hit.
  if (entry && entry.status !== "error" && !isExpired(entry)) {
    return {
      data: (entry.valueJson as T) ?? null,
      status: "fresh",
      stale: false,
      ok: true,
      updatedAt: entry.lastUpdatedAt ?? null,
      source: entry.source ?? null,
    };
  }

  // Expired-but-present, and we have a usable value → serve stale.
  if (entry && entry.valueJson != null) {
    if (staleWhileRevalidate) {
      // Kick a background refresh (deduped) but DO NOT block on it.
      void refresh(opts, entry).catch((e) =>
        console.error(`[shared-cache] background refresh error for ${flightId(opts.namespace, opts.key)}:`, e),
      );
      return {
        data: entry.valueJson as T,
        status: "stale",
        stale: true,
        ok: true,
        updatedAt: entry.lastUpdatedAt ?? null,
        source: entry.source ?? null,
      };
    }
    // Blocking refresh, but fall back to this stale value on failure.
    return refresh(opts, entry);
  }

  // No usable value → must block on a refresh.
  return refresh(opts, entry ?? undefined);
}

// ---------- Refresher registry (admin "refresh") ----------
//
// A refresher actively recomputes a single cache entry and writes the fresh
// value back, even when the entry is still fresh — this is what the admin
// "Refresh" button calls. Each namespace registers one via registerRefresher;
// namespaces with no registered refresher fall back to a purge (delete) so the
// next display request recomputes lazily. Refreshers parse any tenant ids they
// need out of the entry's cacheKey (built with buildCacheKey) and must NOT
// persist secrets — same contract as every other write into this module.

export type CacheRefresher = (entry: SharedCacheEntry) => Promise<GetOrSetResult<unknown> | null>;

const refreshers = new Map<string, CacheRefresher>();

export function registerRefresher(namespace: string, fn: CacheRefresher): void {
  refreshers.set(namespace, fn);
}

export interface RefreshOutcome {
  found: boolean;
  refreshed: boolean;
  purged: boolean;
  status?: SharedCacheStatus;
  error?: string;
}

// Force-recompute one entry. Returns found:false when the row is gone. When the
// namespace has a registered refresher it is run (recompute + set); otherwise
// the entry is purged so the next request rebuilds it. On a recompute failure
// the existing value is preserved as stale (markError) and ok is false.
export async function refreshEntry(namespace: string, key: string): Promise<RefreshOutcome> {
  const entry = await storage.getSharedCacheEntry(namespace, key);
  if (!entry) return { found: false, refreshed: false, purged: false };

  const fn = refreshers.get(namespace);
  if (!fn) {
    await del(namespace, key);
    return { found: true, refreshed: true, purged: true };
  }

  try {
    const result = await fn(entry);
    // A null result means the underlying config disappeared and the refresher
    // purged the row.
    if (!result) return { found: true, refreshed: true, purged: true };
    return { found: true, refreshed: result.ok, purged: false, status: result.status, error: result.error };
  } catch (err) {
    try {
      await markError(namespace, key, err);
    } catch (markErr) {
      console.error(`[shared-cache] markError during refresh failed for ${flightId(namespace, key)}:`, markErr);
    }
    return { found: true, refreshed: false, purged: false, status: "error", error: sanitizeError(err) };
  }
}

// ---------- Garbage collection ----------

export async function pruneExpired(gracePeriodMs: number = STALE_GRACE_MS): Promise<number> {
  return storage.pruneExpiredSharedCache(new Date(), gracePeriodMs);
}

// Test helper — clears the in-process single-flight registry.
export function __clearInflight(): void {
  inflight.clear();
}

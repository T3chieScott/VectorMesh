import type { Screen, InsertAuditLog } from "@shared/schema";

// Task #197 — pure helpers for the player video keep-alive stats
// that piggy-back on every heartbeat. Extracted from the heartbeat
// route so the persistence/audit decision can be unit-tested
// without spinning up an Express server or a real DB.
//
// The watchdog (`use-video-keep-alive`) keeps three running totals
// per player tab — stalls, recoveries, reloads — and exposes them
// on `window.__vmPlayerVideoStats`. The player serialises them into
// `errors.video` on every heartbeat. Counters are cumulative for
// the lifetime of a player page; a full page reload (whether
// triggered by the watchdog itself or anything else) resets them
// to 0. We therefore treat a *decrease* in any counter as "fresh
// page" and just overwrite — only an *increase* in `reloads`
// counts as a real reload event worth auditing.

export interface VideoStatsPayload {
  stalls: number;
  recoveries: number;
  reloads: number;
}

/**
 * Pull the video stats sub-object out of an arbitrary heartbeat
 * `errors` payload. Returns null when the payload is missing,
 * malformed, or carries non-finite numbers (which would otherwise
 * crash the SQL update).
 */
export function extractVideoStats(errors: unknown): VideoStatsPayload | null {
  if (!errors || typeof errors !== "object") return null;
  const video = (errors as { video?: unknown }).video;
  if (!video || typeof video !== "object") return null;
  const v = video as { stalls?: unknown; recoveries?: unknown; reloads?: unknown };
  const stalls = toCount(v.stalls);
  const recoveries = toCount(v.recoveries);
  const reloads = toCount(v.reloads);
  if (stalls === null || recoveries === null || reloads === null) return null;
  return { stalls, recoveries, reloads };
}

function toCount(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  // Counters arrive as integers from the watchdog. Any fractional
  // value indicates a tampered or malformed payload — drop it
  // rather than letting it through to the integer column.
  return Math.floor(value);
}

export interface VideoHealthDecision {
  /** Fields to merge into the screen update used by the heartbeat. */
  patch: {
    videoStatsStalls: number;
    videoStatsRecoveries: number;
    videoStatsReloads: number;
    videoStatsUpdatedAt: Date;
    videoStatsLastReloadAt?: Date;
  };
  /**
   * Set when the new heartbeat reports more reloads than were
   * previously stored — the operator-visible "the player just
   * refreshed itself" event.
   */
  auditLog: InsertAuditLog | null;
}

/**
 * Turn an incoming video stats payload into:
 *   1. the screen patch we should write back, and
 *   2. an audit_log row IFF the reload counter went up since the
 *      last heartbeat (i.e. the watchdog actually reloaded the
 *      page; a player page reload that resets counters to zero
 *      does NOT trigger an audit row by design).
 *
 * `now` is injectable for deterministic tests.
 */
export function decideVideoHealthUpdate(
  screen: Pick<Screen, "id" | "videoStatsReloads" | "videoStatsLastReloadAt">,
  stats: VideoStatsPayload,
  now: Date = new Date(),
): VideoHealthDecision {
  const previousReloads = screen.videoStatsReloads ?? 0;
  const reloadIncreased = stats.reloads > previousReloads;

  const patch: VideoHealthDecision["patch"] = {
    videoStatsStalls: stats.stalls,
    videoStatsRecoveries: stats.recoveries,
    videoStatsReloads: stats.reloads,
    videoStatsUpdatedAt: now,
  };
  if (reloadIncreased) {
    patch.videoStatsLastReloadAt = now;
  }

  const auditLog: InsertAuditLog | null = reloadIncreased
    ? {
        userId: null,
        action: "screen_video_reload",
        entityType: "screen",
        entityId: screen.id,
        payload: {
          previousReloads,
          newReloads: stats.reloads,
          stalls: stats.stalls,
          recoveries: stats.recoveries,
        },
      }
    : null;

  return { patch, auditLog };
}

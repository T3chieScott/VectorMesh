// Task #197 — derive the per-screen "Video health" status the
// Screens dashboard surfaces from the keep-alive watchdog counters
// stored on the screen row. Pure & framework-free so it can be
// unit-tested without React.
//
// Status semantics:
//   - "unknown": no heartbeat with video stats has been received
//     yet. Rendered as a muted dot — operators can't yet tell
//     anything about the player's video health.
//   - "green":  no recoveries, no recent reloads. Quiet & happy.
//   - "amber":  the watchdog has fired at least one recovery but no
//     reload has happened in the recency window. Worth keeping an
//     eye on.
//   - "red":    a reload happened inside the recency window. The
//     player has been forcibly refreshed at least once recently.
//
// Recency is required for the red state because the watchdog reset
// to 0 on its own reload — without a time-based gate we'd have no
// way to differentiate "just reloaded" from "reloaded last month".
// Recoveries fall through the same recency gate too: a player tab
// that's been up for weeks shouldn't sit on amber forever just
// because it once fired a single recovery.

export interface VideoHealthInput {
  videoStatsStalls: number | null;
  videoStatsRecoveries: number | null;
  videoStatsReloads: number | null;
  videoStatsLastReloadAt: Date | string | null;
  videoStatsUpdatedAt: Date | string | null;
}

export type VideoHealthStatus = "unknown" | "green" | "amber" | "red";

export interface VideoHealthVerdict {
  status: VideoHealthStatus;
  stalls: number;
  recoveries: number;
  reloads: number;
  lastReloadAt: Date | null;
  updatedAt: Date | null;
}

// One hour. A reload that happened more than an hour ago is no
// longer "recent" — the operator has had ample time to notice it
// and the player is back to running steady.
export const VIDEO_HEALTH_RECENT_WINDOW_MS = 60 * 60 * 1000;

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function deriveVideoHealth(
  screen: VideoHealthInput,
  now: Date = new Date(),
): VideoHealthVerdict {
  const stalls = screen.videoStatsStalls ?? 0;
  const recoveries = screen.videoStatsRecoveries ?? 0;
  const reloads = screen.videoStatsReloads ?? 0;
  const lastReloadAt = toDate(screen.videoStatsLastReloadAt);
  const updatedAt = toDate(screen.videoStatsUpdatedAt);

  if (!updatedAt) {
    return { status: "unknown", stalls, recoveries, reloads, lastReloadAt, updatedAt };
  }

  const reloadIsRecent =
    lastReloadAt !== null &&
    now.getTime() - lastReloadAt.getTime() <= VIDEO_HEALTH_RECENT_WINDOW_MS;
  if (reloadIsRecent) {
    return { status: "red", stalls, recoveries, reloads, lastReloadAt, updatedAt };
  }

  const recoveryIsRecent =
    recoveries > 0 &&
    now.getTime() - updatedAt.getTime() <= VIDEO_HEALTH_RECENT_WINDOW_MS;
  if (recoveryIsRecent) {
    return { status: "amber", stalls, recoveries, reloads, lastReloadAt, updatedAt };
  }

  return { status: "green", stalls, recoveries, reloads, lastReloadAt, updatedAt };
}

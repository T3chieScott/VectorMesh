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

// Task #200 — bucket per-heartbeat watchdog samples into a series of
// fixed-width time buckets so the Screens UI can render a sparkline
// of reload (and recovery / stall) events over time.
//
// The watchdog counters are cumulative for the lifetime of a player
// page; a full page reload resets them to 0. So to turn a stream of
// cumulative snapshots into per-bucket *event counts* we look at
// consecutive samples and either:
//   - take the positive delta (counter went up — N new events), or
//   - take the new absolute value (counter dropped — the page just
//     reloaded and we lost whatever the old top was; the new value
//     is the count of events that have happened since the reset).
// Events are credited to the bucket containing the *later* sample's
// timestamp, which is where they actually occurred.

export interface VideoHealthSampleLike {
  timestamp: Date | string;
  stalls: number;
  recoveries: number;
  reloads: number;
}

export interface VideoHealthBucket {
  /** Inclusive start of the bucket, as ms since epoch. */
  bucketStart: number;
  stalls: number;
  recoveries: number;
  reloads: number;
}

export interface BucketOptions {
  /** Total window covered by the returned buckets, in ms. Default 24h. */
  windowMs?: number;
  /** Bucket width in ms. Default 1h. */
  bucketMs?: number;
  /** "Now" for deterministic tests. */
  now?: Date;
}

export function bucketVideoHealthSamples(
  samples: VideoHealthSampleLike[],
  options: BucketOptions = {},
): VideoHealthBucket[] {
  const windowMs = options.windowMs ?? 24 * 60 * 60 * 1000;
  const bucketMs = options.bucketMs ?? 60 * 60 * 1000;
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  // Align "now" to the end of its bucket so the most recent bucket
  // is the one currently being filled. windowEnd is exclusive.
  const windowEnd = Math.floor(nowMs / bucketMs) * bucketMs + bucketMs;
  const bucketCount = Math.max(1, Math.ceil(windowMs / bucketMs));
  const windowStart = windowEnd - bucketCount * bucketMs;

  const buckets: VideoHealthBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      bucketStart: windowStart + i * bucketMs,
      stalls: 0,
      recoveries: 0,
      reloads: 0,
    });
  }
  if (samples.length === 0) return buckets;

  // Defensive sort — server already returns oldest-first but callers
  // may concatenate or hand-build arrays for tests.
  const sorted = [...samples].sort((a, b) => {
    const ta = toDate(a.timestamp)?.getTime() ?? 0;
    const tb = toDate(b.timestamp)?.getTime() ?? 0;
    return ta - tb;
  });

  let prev: VideoHealthSampleLike | null = null;
  for (const curr of sorted) {
    const currTs = toDate(curr.timestamp);
    if (!currTs) {
      prev = curr;
      continue;
    }
    const currMs = currTs.getTime();
    let dStalls = 0;
    let dRecoveries = 0;
    let dReloads = 0;
    if (prev === null) {
      // The first sample on its own can't be a delta — we don't
      // know how much of its counter is "new" vs pre-window. Drop
      // it as a baseline; it'll seed subsequent diffs.
    } else {
      dStalls = curr.stalls >= prev.stalls ? curr.stalls - prev.stalls : curr.stalls;
      dRecoveries =
        curr.recoveries >= prev.recoveries ? curr.recoveries - prev.recoveries : curr.recoveries;
      dReloads = curr.reloads >= prev.reloads ? curr.reloads - prev.reloads : curr.reloads;
    }
    prev = curr;
    if (currMs < windowStart || currMs >= windowEnd) continue;
    const idx = Math.floor((currMs - windowStart) / bucketMs);
    const b = buckets[idx];
    if (!b) continue;
    b.stalls += dStalls;
    b.recoveries += dRecoveries;
    b.reloads += dReloads;
  }
  return buckets;
}

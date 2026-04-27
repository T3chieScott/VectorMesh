// NTP/SNTP single-sample estimator for the player. Each sample is a
// (t1, serverTime, t2) triplet captured around a fetch:
//
//   offset = serverTime - (t1 + t2) / 2     // add to Date.now()
//   rtt    = t2 - t1                         // for outlier rejection
//
// `getOffset()` returns the median of accepted samples in a small
// rolling buffer. Samples whose RTT exceeds 3× the rolling median
// (after warmup) are dropped, since high RTT breaks the symmetric-
// latency assumption. The latest accepted offset is mirrored to
// localStorage so a controlled reload / TV reboot starts close to
// correct rather than waiting for the first content poll.

const STORAGE_KEY = "vectormesh_player_clock_offset";
const MAX_SAMPLES = 8;
// RTT samples above (median × this multiplier) are discarded as
// having unreliable symmetric-latency assumptions. Generous so we
// don't reject everything on a slow link; the median already does
// most of the outlier suppression.
const RTT_REJECT_MULTIPLIER = 3;
// Hard ceiling — anything slower than this is almost certainly a
// stalled fetch and would skew the offset by hundreds of ms even if
// it passed the median check.
const RTT_HARD_CAP_MS = 5000;

export interface TimeSyncSample {
  /** offset in ms to ADD to local Date.now() to get server time */
  offset: number;
  /** round-trip-time of the request that produced this sample */
  rttMs: number;
}

export interface TimeSyncState {
  samples: TimeSyncSample[];
  /** Median offset across accepted samples, or null if no samples yet. */
  offset: number | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute the median offset of an accepted-sample buffer.
 * Exported for tests; not used directly outside this file.
 */
export function computeOffset(samples: TimeSyncSample[]): number | null {
  if (samples.length === 0) return null;
  return median(samples.map((s) => s.offset));
}

export interface AddSampleInput {
  /** local Date.now() captured immediately before the request was sent */
  t1: number;
  /** local Date.now() captured immediately after the response was parsed */
  t2: number;
  /** server's Date.now() at the moment the response was generated */
  serverTime: number;
}

/**
 * Pure, side-effect-free state transition. Given the current sample
 * buffer and a new (t1, serverTime, t2) triplet, returns the new
 * buffer + median offset, or `null` for the new sample if it was
 * rejected (high RTT, malformed, etc.). Tests drive this directly.
 */
export function addSample(
  prev: TimeSyncState,
  input: AddSampleInput,
): { state: TimeSyncState; accepted: boolean } {
  const { t1, t2, serverTime } = input;
  if (
    !Number.isFinite(t1) ||
    !Number.isFinite(t2) ||
    !Number.isFinite(serverTime) ||
    t2 < t1
  ) {
    return { state: prev, accepted: false };
  }
  const rttMs = t2 - t1;
  if (rttMs > RTT_HARD_CAP_MS) {
    return { state: prev, accepted: false };
  }
  const midpoint = (t1 + t2) / 2;
  const offset = serverTime - midpoint;
  // Reject samples whose RTT is much worse than the rolling median.
  // The first few samples (before we have a stable median) are always
  // accepted so we can't lock ourselves out of ever getting a sample.
  if (prev.samples.length >= 3) {
    const rttMedian = median(prev.samples.map((s) => s.rttMs));
    if (rttMedian > 0 && rttMs > rttMedian * RTT_REJECT_MULTIPLIER) {
      return { state: prev, accepted: false };
    }
  }
  const samples = [...prev.samples, { offset, rttMs }].slice(-MAX_SAMPLES);
  return {
    state: { samples, offset: computeOffset(samples) },
    accepted: true,
  };
}

/**
 * Read the last persisted offset from localStorage, if any. Used by
 * the React provider to seed the very first frame after a page load,
 * before the first sample lands.
 */
export function loadPersistedOffset(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.offset === "number" && Number.isFinite(parsed.offset)) {
      return parsed.offset;
    }
  } catch {}
  return null;
}

/**
 * Mirror the latest accepted offset to localStorage so the very next
 * page load renders a close-to-correct clock from frame 0.
 */
export function persistOffset(
  offset: number,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ offset }));
  } catch {}
}

export const __TIME_SYNC_TEST_HOOKS__ = {
  STORAGE_KEY,
  MAX_SAMPLES,
  RTT_REJECT_MULTIPLIER,
  RTT_HARD_CAP_MS,
};

export const initialTimeSyncState: TimeSyncState = {
  samples: [],
  offset: null,
};

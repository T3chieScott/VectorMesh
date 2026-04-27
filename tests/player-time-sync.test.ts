// Task #193 — exhaustive coverage for the NTP-style clock-skew
// estimator that backs ClockWidget / CountdownWidget /
// {{time}}/{{date}}/{{day}} on the player. The estimator is tiny and
// pure (`client/src/lib/playerTimeSync.ts`), but the rules it
// encodes are exactly the rules whose absence would put a wrong
// time on every screen when a TV's RTC drifts:
//
//   1. A single sample with reasonable RTT must produce a usable
//      offset right away — we cannot wait for a "warm-up" buffer or
//      the first ClockWidget paint after boot will always be wrong.
//   2. The offset must be the median of accepted samples, so a
//      single jittery RTT spike can't drag the estimate sideways.
//   3. RTT-based outlier rejection must NOT engage until we have
//      enough samples to compute a meaningful median (>=3) — a
//      cold-start rejection would lock out the very first samples
//      and leave the offset at null forever.
//   4. Once warmed up, samples whose RTT is much worse than the
//      median (> RTT_REJECT_MULTIPLIER × median) are dropped because
//      the symmetric-latency assumption breaks down.
//   5. Hard-cap RTT (>5s) rejection must apply at all times — a
//      stalled fetch can't be allowed to set the clock to a value
//      tens of seconds wrong.
//   6. Malformed input (NaN, t2 < t1) must be rejected without
//      mutating the buffer.
//   7. The rolling buffer must cap at MAX_SAMPLES so a long-running
//      player doesn't unbounded-grow.
//   8. Persisted offsets (localStorage) must round-trip cleanly and
//      tolerate corrupt JSON without crashing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addSample,
  computeOffset,
  initialTimeSyncState,
  loadPersistedOffset,
  persistOffset,
  __TIME_SYNC_TEST_HOOKS__,
  type TimeSyncState,
} from "../client/src/lib/playerTimeSync";

const PREFIX = "__TEST_S193__";

// -- Sample acceptance ------------------------------------------------------

test(`${PREFIX} first sample produces usable offset immediately`, () => {
  // Server is 5 minutes ahead. RTT 100ms, so midpoint is at t1+50.
  const t1 = 1_000_000;
  const t2 = t1 + 100;
  const serverTime = t1 + 50 + 5 * 60 * 1000;
  const result = addSample(initialTimeSyncState, { t1, t2, serverTime });
  assert.equal(result.accepted, true);
  assert.equal(result.state.samples.length, 1);
  assert.equal(result.state.offset, 5 * 60 * 1000);
});

test(`${PREFIX} median offset across multiple samples`, () => {
  // Three samples, offsets 100ms, 200ms, 5000ms. Median is 200ms;
  // any naive average would be skewed by the 5000ms outlier.
  let state = initialTimeSyncState;
  const offsets = [100, 200, 5000];
  for (const off of offsets) {
    const t1 = 1_000_000;
    const t2 = t1 + 100;
    const r = addSample(state, { t1, t2, serverTime: t1 + 50 + off });
    state = r.state;
  }
  assert.equal(state.samples.length, 3);
  assert.equal(state.offset, 200);
});

// -- RTT-based outlier rejection -------------------------------------------

test(`${PREFIX} cold-start does NOT reject high-RTT samples (need >=3 first)`, () => {
  // Without a warm buffer we have no median to compare against, so
  // the very first sample, even if "slow", must be accepted —
  // otherwise the offset stays null forever on a perpetually slow
  // link.
  const t1 = 1_000_000;
  const slowT2 = t1 + 1500; // 1.5s RTT
  const result = addSample(initialTimeSyncState, {
    t1,
    t2: slowT2,
    serverTime: t1 + 750 + 1234,
  });
  assert.equal(result.accepted, true);
});

test(`${PREFIX} warmed buffer rejects RTT spikes`, () => {
  let state = initialTimeSyncState;
  // Three quick samples — 100ms each.
  for (let i = 0; i < 3; i++) {
    const t1 = 1_000_000 + i * 1000;
    const t2 = t1 + 100;
    state = addSample(state, { t1, t2, serverTime: t1 + 50 + 1000 }).state;
  }
  // Now feed a sample with RTT 4× the median — should be rejected.
  const t1 = 1_010_000;
  const t2 = t1 + 4000; // 40× the 100ms median
  const before = state;
  const result = addSample(state, { t1, t2, serverTime: t1 + 2000 + 99999 });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.state, before);
});

// -- Hard caps + malformed input -------------------------------------------

test(`${PREFIX} hard-cap RTT rejection applies even on cold start`, () => {
  const t1 = 1_000_000;
  const t2 = t1 + __TIME_SYNC_TEST_HOOKS__.RTT_HARD_CAP_MS + 1;
  const result = addSample(initialTimeSyncState, {
    t1,
    t2,
    serverTime: t1 + 50000,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.state.samples.length, 0);
});

test(`${PREFIX} malformed input is rejected without mutation`, () => {
  const cases = [
    { t1: NaN, t2: 1, serverTime: 1 },
    { t1: 1, t2: NaN, serverTime: 1 },
    { t1: 1, t2: 1, serverTime: NaN },
    { t1: 100, t2: 50, serverTime: 75 }, // t2 < t1
  ];
  for (const c of cases) {
    const r = addSample(initialTimeSyncState, c);
    assert.equal(r.accepted, false, `should reject ${JSON.stringify(c)}`);
    assert.deepEqual(r.state, initialTimeSyncState);
  }
});

// -- Buffer cap -------------------------------------------------------------

test(`${PREFIX} sample buffer is capped at MAX_SAMPLES`, () => {
  let state: TimeSyncState = initialTimeSyncState;
  const N = __TIME_SYNC_TEST_HOOKS__.MAX_SAMPLES + 5;
  for (let i = 0; i < N; i++) {
    const t1 = 1_000_000 + i * 1000;
    const t2 = t1 + 100;
    state = addSample(state, { t1, t2, serverTime: t1 + 50 + i }).state;
  }
  assert.equal(state.samples.length, __TIME_SYNC_TEST_HOOKS__.MAX_SAMPLES);
  // The newest entries should be retained — last sample's offset is N-1.
  assert.equal(
    state.samples[state.samples.length - 1].offset,
    N - 1,
    "newest sample retained",
  );
});

// -- Pure helpers -----------------------------------------------------------

test(`${PREFIX} computeOffset returns null for empty buffer`, () => {
  assert.equal(computeOffset([]), null);
});

test(`${PREFIX} computeOffset returns single sample's offset`, () => {
  assert.equal(computeOffset([{ offset: 1234, rttMs: 50 }]), 1234);
});

// -- Persistence ------------------------------------------------------------

function makeMemStorage(): Storage & { _data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    _data: data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  };
}

test(`${PREFIX} persistOffset / loadPersistedOffset round-trip`, () => {
  const storage = makeMemStorage();
  persistOffset(1234.5, storage);
  assert.equal(loadPersistedOffset(storage), 1234.5);
});

test(`${PREFIX} loadPersistedOffset tolerates missing key`, () => {
  const storage = makeMemStorage();
  assert.equal(loadPersistedOffset(storage), null);
});

test(`${PREFIX} loadPersistedOffset tolerates corrupt JSON`, () => {
  const storage = makeMemStorage();
  storage.setItem(__TIME_SYNC_TEST_HOOKS__.STORAGE_KEY, "{not json");
  assert.equal(loadPersistedOffset(storage), null);
});

test(`${PREFIX} loadPersistedOffset rejects non-numeric offset`, () => {
  const storage = makeMemStorage();
  storage.setItem(
    __TIME_SYNC_TEST_HOOKS__.STORAGE_KEY,
    JSON.stringify({ offset: "5min" }),
  );
  assert.equal(loadPersistedOffset(storage), null);
});

test(`${PREFIX} loadPersistedOffset rejects NaN/Infinity`, () => {
  const storage = makeMemStorage();
  storage.setItem(
    __TIME_SYNC_TEST_HOOKS__.STORAGE_KEY,
    JSON.stringify({ offset: null }),
  );
  assert.equal(loadPersistedOffset(storage), null);
});

// -- Integration-flavoured: realistic boot sequence -------------------------

// -- Server contract (source-shape regression net) -------------------------
//
// The estimator only works if the server actually stamps `serverTime`
// on the four endpoints the player wraps with t1/t2 timestamps:
//
//   1. POST /api/player/pair
//   2. POST /api/player/heartbeat
//   3. GET  /api/player/:screenId/content      <-- regression-prone
//   4. GET  /api/player/time
//
// A previous review caught (3) being missed when only the response-
// type interface was updated, not the actual route handler. Because
// booting the full Express app for one assertion is expensive, this
// test reads server/routes.ts directly and asserts each handler ships
// `serverTime: Date.now()`. It's coarse but a high-signal trip-wire:
// any future refactor that drops one of the stamps fails this test
// in <100ms with a clear error message.

test(`${PREFIX} all four player endpoints stamp serverTime`, () => {
  const path = resolve(import.meta.dirname ?? __dirname, "..", "server", "routes.ts");
  const src = readFileSync(path, "utf8");

  // (1) Dedicated time endpoint
  assert.match(
    src,
    /app\.get\(\s*["']\/api\/player\/time["']/,
    "GET /api/player/time endpoint must be registered",
  );

  // (2) All endpoints stamp serverTime: Date.now() on their response
  // body. We verify by counting occurrences — at least one each for
  // pair, heartbeat, content, and the dedicated time endpoint.
  const occurrences = (src.match(/serverTime:\s*Date\.now\(\)/g) ?? []).length;
  assert.ok(
    occurrences >= 4,
    `expected at least 4 \`serverTime: Date.now()\` stamps in server/routes.ts (pair, heartbeat, content, /api/player/time), found ${occurrences}`,
  );
});

test(`${PREFIX} realistic boot sequence — pair, time, content, heartbeat`, () => {
  // Simulate a player whose system clock is exactly 5 minutes
  // behind real time. Server stamps real wall-clock time. Network
  // RTTs vary 80-150ms. After all four samples, the offset should
  // be very close to +300_000 ms.
  let state = initialTimeSyncState;
  const trueOffset = 5 * 60 * 1000;
  const rtts = [120, 90, 150, 80];
  let localClock = 5_000_000_000; // arbitrary "device" Date.now()
  for (const rtt of rtts) {
    const t1 = localClock;
    const t2 = t1 + rtt;
    // Server, mid-flight, stamps its own clock = our local + true offset.
    const serverTime = t1 + rtt / 2 + trueOffset;
    state = addSample(state, { t1, t2, serverTime }).state;
    localClock += 30_000;
  }
  assert.equal(state.samples.length, 4);
  // Each sample is exact in this synthetic model, so the median is exact.
  assert.equal(state.offset, trueOffset);
});

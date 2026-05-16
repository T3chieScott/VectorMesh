// Task #200 — locks in the per-bucket reload accounting that the
// Screens UI uses to render its 24h sparkline. The bucketing helper
// has to handle three real-world wrinkles:
//   1. Strictly increasing counters → take the positive delta.
//   2. Counter reset to 0 mid-window (player page reload wiped the
//      watchdog's running totals) → take the new absolute value
//      rather than producing a misleading negative delta.
//   3. The very first sample seeds the diff but doesn't itself
//      contribute events — we can't tell whether its counter is
//      pre-window history or fresh.

import test from "node:test";
import assert from "node:assert/strict";
import { bucketVideoHealthSamples } from "../shared/video-health";

const PREFIX = "__TEST_S200__";
const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-05-16T12:30:00.000Z");

test(`${PREFIX} bucketVideoHealthSamples: empty input → zeroed 24 buckets`, () => {
  const buckets = bucketVideoHealthSamples([], { now: NOW });
  assert.equal(buckets.length, 24);
  assert.ok(buckets.every((b) => b.reloads === 0 && b.stalls === 0 && b.recoveries === 0));
});

test(`${PREFIX} bucketVideoHealthSamples: monotonic counters credit positive deltas to the later bucket`, () => {
  const buckets = bucketVideoHealthSamples(
    [
      { timestamp: new Date(NOW.getTime() - 3.5 * HOUR), stalls: 0, recoveries: 0, reloads: 0 },
      { timestamp: new Date(NOW.getTime() - 2.5 * HOUR), stalls: 1, recoveries: 1, reloads: 1 },
      { timestamp: new Date(NOW.getTime() - 1.5 * HOUR), stalls: 3, recoveries: 2, reloads: 2 },
    ],
    { now: NOW },
  );
  const sumReloads = buckets.reduce((s, b) => s + b.reloads, 0);
  const sumStalls = buckets.reduce((s, b) => s + b.stalls, 0);
  assert.equal(sumReloads, 2, "two reload events recorded across the diffs");
  assert.equal(sumStalls, 3, "1 + 2 stall events across the diffs");
});

test(`${PREFIX} bucketVideoHealthSamples: counter reset is treated as new events, never negative`, () => {
  const buckets = bucketVideoHealthSamples(
    [
      { timestamp: new Date(NOW.getTime() - 2.5 * HOUR), stalls: 5, recoveries: 5, reloads: 7 },
      // Page reload — watchdog totals dropped back to small numbers.
      { timestamp: new Date(NOW.getTime() - 1.5 * HOUR), stalls: 2, recoveries: 1, reloads: 1 },
    ],
    { now: NOW },
  );
  const totals = buckets.reduce(
    (acc, b) => ({
      stalls: acc.stalls + b.stalls,
      recoveries: acc.recoveries + b.recoveries,
      reloads: acc.reloads + b.reloads,
    }),
    { stalls: 0, recoveries: 0, reloads: 0 },
  );
  assert.equal(totals.reloads, 1);
  assert.equal(totals.stalls, 2);
  assert.equal(totals.recoveries, 1);
});

test(`${PREFIX} bucketVideoHealthSamples: first sample seeds the diff and does not itself contribute`, () => {
  const buckets = bucketVideoHealthSamples(
    [{ timestamp: new Date(NOW.getTime() - 2 * HOUR), stalls: 99, recoveries: 99, reloads: 99 }],
    { now: NOW },
  );
  const totals = buckets.reduce((s, b) => s + b.reloads + b.stalls + b.recoveries, 0);
  assert.equal(totals, 0, "lone sample has nothing to diff against");
});

test(`${PREFIX} bucketVideoHealthSamples: samples outside the window are ignored`, () => {
  const buckets = bucketVideoHealthSamples(
    [
      { timestamp: new Date(NOW.getTime() - 48 * HOUR), stalls: 0, recoveries: 0, reloads: 0 },
      { timestamp: new Date(NOW.getTime() - 47 * HOUR), stalls: 5, recoveries: 5, reloads: 5 },
    ],
    { now: NOW },
  );
  assert.ok(buckets.every((b) => b.reloads === 0));
});

test(`${PREFIX} bucketVideoHealthSamples: accepts ISO string timestamps from the JSON wire`, () => {
  const buckets = bucketVideoHealthSamples(
    [
      { timestamp: new Date(NOW.getTime() - 2 * HOUR).toISOString(), stalls: 0, recoveries: 0, reloads: 0 },
      { timestamp: new Date(NOW.getTime() - 1 * HOUR).toISOString(), stalls: 0, recoveries: 0, reloads: 4 },
    ],
    { now: NOW },
  );
  assert.equal(buckets.reduce((s, b) => s + b.reloads, 0), 4);
});

test(`${PREFIX} bucketVideoHealthSamples: custom window / bucket sizes produce the right bucket count`, () => {
  const buckets = bucketVideoHealthSamples([], {
    now: NOW,
    windowMs: 6 * HOUR,
    bucketMs: 30 * 60 * 1000,
  });
  assert.equal(buckets.length, 12);
});

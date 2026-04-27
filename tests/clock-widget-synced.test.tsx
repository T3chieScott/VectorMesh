// Task #193 — render-level coverage for the real ClockWidget under
// a skewed device clock. The estimator math is fully covered by
// tests/player-time-sync.test.ts; this file pins the *integration*
// rule end-to-end:
//
//   1. ClockWidget rendered inside PlayerClockProvider with a
//      persisted offset shows server-corrected wall-clock time
//      (not local Date.now()).
//   2. ClockWidget rendered inside PlayerClockProvider that has
//      received exactly one fresh (t1, serverTime, t2) sample shows
//      the time the server reported (not local Date.now()).
//   3. ClockWidget rendered WITHOUT a provider falls back to local
//      Date.now() unchanged.
//
// We can't override `Date.now()` cleanly in node:test, so we drive
// the offset through the public seams: localStorage (case 1) and
// the provider's `feedSample` ref (case 2). `renderToStaticMarkup`
// doesn't run useEffect, so what we read back is exactly the
// initial useState value — perfect for asserting "the offset really
// did flow through the provider into the widget at first paint".

import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const PREFIX = "__TEST_S193__";

// node:test has no `window` / `localStorage`. Stub a Storage-shaped
// in-memory backing on globalThis BEFORE importing any player-clock
// modules, since `loadPersistedOffset` reads `window.localStorage`
// at module-import time via its default argument.
interface MutableStorage extends Storage {
  _data: Record<string, string>;
}
function makeMemStorage(): MutableStorage {
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

const memStorage = makeMemStorage();
(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.localStorage = memStorage;
(globalThis as any).localStorage = memStorage;

// Now safe to import — `window.localStorage` default arg is bound.
const { PlayerClockProvider, usePlayerClock } = await import(
  "../client/src/lib/playerClock"
);
const { ClockWidget } = await import(
  "../client/src/components/widgets/clock-widget"
);
const { __TIME_SYNC_TEST_HOOKS__ } = await import(
  "../client/src/lib/playerTimeSync"
);

const ONE_HOUR_MS = 60 * 60 * 1000;

function parseHHMMSS(text: string): number {
  const m = text.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`unexpected time format: ${text}`);
  return (
    parseInt(m[1], 10) * 3600 +
    parseInt(m[2], 10) * 60 +
    parseInt(m[3], 10)
  );
}

function extractClockTime(html: string): string {
  const m = html.match(
    /data-testid="clock-widget-time"[^>]*>([^<]+)</,
  );
  if (!m) throw new Error(`could not find clock-widget-time in ${html}`);
  return m[1];
}

function localHHMMSS(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Compute the wraparound-safe distance, in seconds, between two
// HH:MM:SS strings, treating them as same-day modulo 24h.
function deltaSeconds(a: string, b: string): number {
  const av = parseHHMMSS(a);
  const bv = parseHHMMSS(b);
  const fwd = av >= bv ? av - bv : av + 86400 - bv;
  return fwd > 43200 ? 86400 - fwd : fwd;
}

test(`${PREFIX} ClockWidget shows SERVER-corrected time when provider has a persisted offset`, () => {
  // Persist a +1 hour offset BEFORE the provider mounts so its
  // `useState(() => loadPersistedOffset())` initialiser picks it up.
  memStorage.setItem(
    __TIME_SYNC_TEST_HOOKS__.STORAGE_KEY,
    JSON.stringify({ offset: ONE_HOUR_MS }),
  );

  const html = renderToStaticMarkup(
    React.createElement(
      PlayerClockProvider,
      null,
      React.createElement(ClockWidget, { showDate: false }),
    ),
  );
  const synced = extractClockTime(html);
  const local = localHHMMSS();

  // Synced clock should be ~3600s ahead of local; allow ±2s for the
  // two `Date.now()` captures happening on different lines.
  const fwd =
    parseHHMMSS(synced) >= parseHHMMSS(local)
      ? parseHHMMSS(synced) - parseHHMMSS(local)
      : parseHHMMSS(synced) + 86400 - parseHHMMSS(local);
  assert.ok(
    Math.abs(fwd - 3600) <= 2,
    `expected synced ~3600s ahead of local; got synced=${synced}, local=${local}, fwd=${fwd}s`,
  );

  // Tidy up so case 3 doesn't pick up the persisted offset.
  memStorage.clear();
});

test(`${PREFIX} ClockWidget shows server time after one live (t1, serverTime, t2) sample`, () => {
  // Unlike case 1 (which seeds via persisted storage and renders
  // immediately), this case mounts the provider with NO offset,
  // then a child consumer calls feedSample synchronously during
  // render with a (t1, serverTime, t2) triple where serverTime is
  // exactly +90 minutes ahead of "now". Because feedSample updates
  // state synchronously and React renders children in order, the
  // ClockWidget mounted AFTER the feeder will see the new offset
  // on its first paint.
  memStorage.clear();

  const NINETY_MIN_MS = 90 * 60 * 1000;
  const t1 = Date.now();
  // Simulate a 50ms one-way RTT. serverTime is what the (lying)
  // server said its clock was at the midpoint of t1..t2.
  const t2 = t1 + 100;
  const serverTime = (t1 + t2) / 2 + NINETY_MIN_MS;

  function SampleFeeder(): React.ReactElement | null {
    const { feedSample } = usePlayerClock();
    // Seed exactly once during render — useRef ensures we don't
    // loop.  React will commit this state update before the sibling
    // ClockWidget below it gets its first render in this same tree.
    const fed = React.useRef(false);
    if (!fed.current) {
      fed.current = true;
      feedSample(t1, serverTime, t2);
    }
    return null;
  }

  const html = renderToStaticMarkup(
    React.createElement(
      PlayerClockProvider,
      null,
      React.createElement(React.Fragment, null,
        React.createElement(SampleFeeder),
        React.createElement(ClockWidget, { showDate: false }),
      ),
    ),
  );
  const synced = extractClockTime(html);
  const local = localHHMMSS();

  const delta = deltaSeconds(synced, local);
  // 90 minutes = 5400 seconds. Allow ±2s tolerance.
  assert.ok(
    Math.abs(delta - 5400) <= 2,
    `expected synced ~5400s ahead of local; got synced=${synced}, local=${local}, delta=${delta}s`,
  );
});

test(`${PREFIX} ClockWidget falls back to LOCAL time without provider`, () => {
  memStorage.clear();
  const html = renderToStaticMarkup(
    React.createElement(ClockWidget, { showDate: false }),
  );
  const fallback = extractClockTime(html);
  const local = localHHMMSS();
  const delta = deltaSeconds(fallback, local);
  assert.ok(
    delta <= 2,
    `expected fallback ~equal to local; got fallback=${fallback}, local=${local}, delta=${delta}s`,
  );
});

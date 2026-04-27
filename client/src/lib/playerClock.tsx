// React namespace import keeps node:test (esbuild classic JSX) happy;
// Vite tree-shakes it in production.
import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  addSample,
  computeOffset,
  initialTimeSyncState,
  loadPersistedOffset,
  persistOffset,
  type TimeSyncState,
} from "./playerTimeSync";

// React glue around the pure estimator in `playerTimeSync`.
// Provider owns the rolling sample buffer; `getSyncedNow()` is a
// ref-backed accessor (not a state value) so reading it doesn't
// trigger re-renders.

interface PlayerClockApi {
  feedSample: (t1: number, serverTime: number, t2: number) => void;
  getSyncedNow: () => number;
  /** Current median offset in ms, or `null` if no sample has landed. */
  offsetMs: number | null;
}

const PlayerClockContext = createContext<PlayerClockApi | null>(null);

export function PlayerClockProvider({ children }: { children: React.ReactNode }) {
  const stateRef = useRef<TimeSyncState>(initialTimeSyncState);
  // Seed from localStorage so widgets are roughly correct on the very
  // first frame after a page load. We synthesize a one-element sample
  // buffer (no rttMs to compare against), but mark it as the "boot
  // offset" — the first real sample replaces it cleanly because the
  // rolling buffer keeps the last MAX_SAMPLES entries.
  const [offsetMs, setOffsetMs] = useState<number | null>(() => {
    const persisted = loadPersistedOffset();
    if (persisted !== null) {
      stateRef.current = {
        samples: [{ offset: persisted, rttMs: 0 }],
        offset: persisted,
      };
      return persisted;
    }
    return null;
  });

  const feedSample = useCallback(
    (t1: number, serverTime: number, t2: number) => {
      const result = addSample(stateRef.current, { t1, t2, serverTime });
      if (!result.accepted) return;
      stateRef.current = result.state;
      const newOffset = result.state.offset;
      if (newOffset !== null) {
        persistOffset(newOffset);
        setOffsetMs((prev) => {
          // Avoid spurious re-renders for sub-millisecond noise — but
          // ANY real change is forwarded so consumers can re-render
          // their next-tick alignment timer.
          if (prev !== null && Math.abs(prev - newOffset) < 1) return prev;
          return newOffset;
        });
      }
    },
    [],
  );

  const getSyncedNow = useCallback(() => {
    return Date.now() + (stateRef.current.offset ?? 0);
  }, []);

  const api = useMemo<PlayerClockApi>(
    () => ({ feedSample, getSyncedNow, offsetMs }),
    [feedSample, getSyncedNow, offsetMs],
  );

  return <PlayerClockContext.Provider value={api}>{children}</PlayerClockContext.Provider>;
}

/**
 * Always returns a usable API. Outside a `PlayerClockProvider`
 * (admin pages, layout previews, tests that don't mount the
 * provider), `getSyncedNow` falls back to plain `Date.now()` and
 * `feedSample` is a no-op so we never crash and never render blank.
 */
export function usePlayerClock(): PlayerClockApi {
  const ctx = useContext(PlayerClockContext);
  if (ctx) return ctx;
  return FALLBACK_API;
}

const FALLBACK_API: PlayerClockApi = {
  feedSample: () => {},
  getSyncedNow: () => Date.now(),
  offsetMs: null,
};

/**
 * Convenience hook for widgets that need to re-render every tick at
 * the server-time second boundary (ClockWidget). Returns the synced
 * `Date` object and re-fires aligned to (server-time second + 1).
 *
 * Re-aligns whenever the offset changes meaningfully so the seconds
 * never tick at the wrong moment after a clock-skew correction.
 */
export function useSyncedSecondTick(): Date {
  const { getSyncedNow, offsetMs } = usePlayerClock();
  const [now, setNow] = useState<Date>(() => new Date(getSyncedNow()));

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(new Date(getSyncedNow()));
    const scheduleAligned = () => {
      const synced = getSyncedNow();
      const msUntilNextSecond = 1000 - (synced % 1000);
      timeout = setTimeout(() => {
        tick();
        interval = setInterval(tick, 1000);
      }, msUntilNextSecond);
    };
    // First, fire an immediate update so a stale `now` from the
    // initial render is replaced by the latest synced value.
    tick();
    scheduleAligned();
    return () => {
      if (timeout) clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
    // Re-align whenever the offset changes — otherwise the seconds
    // would keep ticking on the OLD second-boundary cadence after a
    // clock-skew correction lands.
  }, [getSyncedNow, offsetMs]);

  return now;
}

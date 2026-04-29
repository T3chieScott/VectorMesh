import { useEffect, type RefObject } from "react";

// Task #196 — Watchdog for player-side <video> elements.
//
// On long-running signage tabs a <video> can quietly stop looping:
// a transient decode/network blip pauses it, the browser fires
// `pause`/`stalled`/`error`, React never notices, and only a
// manual refresh resumes playback. This hook attaches lightweight
// listeners that try to resume play(), counts failures inside a
// rolling window, and as a last resort issues a full page reload.
//
// It also re-issues play() when the tab returns to the foreground
// (page-lifecycle thaw / Memory Saver wake), which on its own
// fixes the most common stall mode without needing the reload
// fallback at all.
//
// Counters are exposed on `window.__vmPlayerVideoStats` so an
// operator can read them from devtools to confirm whether stalls
// are happening silently. They're best-effort only — never thrown.

export interface VideoKeepAliveOptions {
  /**
   * When false the hook is inert. Used by MediaPlayerWidget so the
   * inactive (offscreen) layer doesn't get auto-resumed and steal
   * cycles from the active layer.
   */
  enabled?: boolean;
}

export interface VmPlayerVideoStats {
  stalls: number;
  recoveries: number;
  reloads: number;
}

const STAT_KEY = "__vmPlayerVideoStats";
export const FAILURE_WINDOW_MS = 60_000;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const RESUME_DELAY_MS = 250;

function bumpStat(key: keyof VmPlayerVideoStats) {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, VmPlayerVideoStats>;
  if (!w[STAT_KEY]) {
    w[STAT_KEY] = { stalls: 0, recoveries: 0, reloads: 0 };
  }
  w[STAT_KEY][key] = (w[STAT_KEY][key] || 0) + 1;
}

export function getVideoStats(): VmPlayerVideoStats {
  if (typeof window === "undefined") {
    return { stalls: 0, recoveries: 0, reloads: 0 };
  }
  const w = window as unknown as Record<string, VmPlayerVideoStats>;
  return w[STAT_KEY] || { stalls: 0, recoveries: 0, reloads: 0 };
}

// Minimal subset of HTMLVideoElement we actually call. Lets the
// node:test suite drive the watchdog with a fake video without
// pulling in jsdom.
export interface KeepAliveVideoLike {
  paused: boolean;
  ended: boolean;
  loop: boolean;
  play(): Promise<void> | void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface KeepAliveDeps {
  /** When omitted, falls back to globalThis `document`. */
  doc?: {
    visibilityState?: string;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  } | null;
  /** When omitted, falls back to globalThis `window`. */
  win?: {
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
    location?: { reload: () => void };
  } | null;
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  nowFn?: () => number;
  bump?: (key: keyof VmPlayerVideoStats) => void;
}

/**
 * Attaches the keep-alive listeners to `video` and returns a cleanup
 * function. Used by `useVideoKeepAlive` from inside useEffect; also
 * directly callable from tests with a fake video + injected deps.
 */
export function attachVideoKeepAlive(
  video: KeepAliveVideoLike,
  deps: KeepAliveDeps = {},
): () => void {
  const doc =
    deps.doc !== undefined
      ? deps.doc
      : typeof document !== "undefined"
        ? (document as unknown as KeepAliveDeps["doc"])
        : null;
  const win =
    deps.win !== undefined
      ? deps.win
      : typeof window !== "undefined"
        ? (window as unknown as KeepAliveDeps["win"])
        : null;
  const setTimer = deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = deps.nowFn ?? (() => Date.now());
  const bump = deps.bump ?? bumpStat;

  let cancelled = false;
  let failures = 0;
  let lastFailureAt = 0;
  let resumeTimer: unknown = null;

  const tryPlay = async (): Promise<boolean> => {
    if (cancelled) return false;
    if (!video.paused) return false;
    if (video.ended && !video.loop) return false;
    try {
      const promise = video.play();
      if (promise && typeof (promise as Promise<void>).then === "function") {
        await promise;
        return true;
      }
      // Older browsers return undefined synchronously. Trust the
      // call and let onPlaying clear the failure counter.
      return true;
    } catch {
      handleFailure();
      return false;
    }
  };

  const scheduleResume = () => {
    if (resumeTimer) clearTimer(resumeTimer);
    resumeTimer = setTimer(() => {
      resumeTimer = null;
      if (cancelled) return;
      if (video.paused && !(video.ended && !video.loop)) {
        // Recovery counter only ticks on a play() that actually
        // resolves — counting attempts would over-report and mask
        // chronically failing streams.
        void tryPlay().then((ok) => {
          if (ok && !cancelled) bump("recoveries");
        });
      }
    }, RESUME_DELAY_MS);
  };

  const handleFailure = () => {
    const t = now();
    if (t - lastFailureAt > FAILURE_WINDOW_MS) failures = 0;
    lastFailureAt = t;
    failures += 1;
    bump("stalls");
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      failures = 0;
      bump("reloads");
      try {
        win?.location?.reload();
      } catch {
        // best effort
      }
    }
  };

  const onPause = () => {
    if (video.ended && !video.loop) return;
    scheduleResume();
  };
  const onStalled = () => {
    handleFailure();
    scheduleResume();
  };
  const onError = () => {
    handleFailure();
    scheduleResume();
  };
  // `suspend` is benign and fires often during normal buffering — we
  // do NOT treat it as a stall, but it is a useful prompt to verify
  // we're still playing. If we are, scheduleResume short-circuits as
  // a no-op; if we silently stalled, this kicks us back to life.
  const onSuspend = () => {
    if (!video.paused) return;
    if (video.ended && !video.loop) return;
    scheduleResume();
  };
  const onPlaying = () => {
    failures = 0;
  };
  const onVisibility = () => {
    if (!doc) return;
    if (doc.visibilityState !== "visible") return;
    if (video.paused && !(video.ended && !video.loop)) {
      void tryPlay().then((ok) => {
        if (ok && !cancelled) bump("recoveries");
      });
    }
  };
  const onPageShow = () => {
    if (video.paused && !(video.ended && !video.loop)) {
      void tryPlay().then((ok) => {
        if (ok && !cancelled) bump("recoveries");
      });
    }
  };

  video.addEventListener("pause", onPause);
  video.addEventListener("stalled", onStalled);
  video.addEventListener("error", onError);
  video.addEventListener("suspend", onSuspend);
  video.addEventListener("playing", onPlaying);
  doc?.addEventListener("visibilitychange", onVisibility);
  win?.addEventListener("pageshow", onPageShow);

  return () => {
    cancelled = true;
    if (resumeTimer) clearTimer(resumeTimer);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("stalled", onStalled);
    video.removeEventListener("error", onError);
    video.removeEventListener("suspend", onSuspend);
    video.removeEventListener("playing", onPlaying);
    doc?.removeEventListener("visibilitychange", onVisibility);
    win?.removeEventListener("pageshow", onPageShow);
  };
}

export function useVideoKeepAlive(
  ref: RefObject<HTMLVideoElement | null>,
  options: VideoKeepAliveOptions = {},
): void {
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const v = ref.current;
    if (!v) return;
    return attachVideoKeepAlive(v as unknown as KeepAliveVideoLike);
  }, [enabled, ref]);
}

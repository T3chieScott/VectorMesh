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
  /**
   * Playback is deliberately wanted by the owning player.  This is separate
   * from `enabled`: an attached, active video can be preparing, stopped, or
   * otherwise intentionally paused and must never be started by the
   * watchdog.
   */
  intendedPlaying?: boolean;
  /**
   * Task #199 — desired `muted` state for the element. When set
   * (the player passes `true` for every video unless an operator
   * explicitly opts in to audio) the hook imperatively enforces
   * `video.muted` and re-asserts it on every interaction.
   *
   * Why this matters: modern Chromium auto-pauses a *playing,
   * unmuted* background <video> when another tab claims audio focus
   * (e.g. a YouTube ad). A muted element never participates in audio
   * focus arbitration, so it is never the one that gets paused. The
   * watchdog would eventually recover the pause, but the player
   * visibly stutters in the meantime — keeping the element muted
   * pre-empts the pause entirely.
   *
   * It also defends against React's long-standing `muted`-attribute
   * bug: the `muted` prop on a server-rendered/hydrated <video> is
   * not always reflected onto the DOM property, leaving the element
   * audibly unmuted. Asserting the property via the ref guarantees
   * the intended state. Leave undefined to skip enforcement.
   */
  muted?: boolean;
}

export interface VmPlayerVideoStats {
  stalls: number;
  recoveries: number;
  reloads: number;
  /** Wall-clock time of the latest successful watchdog recovery. */
  lastRecoveryAt?: number;
}

const STAT_KEY = "__vmPlayerVideoStats";
// Task #197 — counters are mirrored to sessionStorage so the
// `reloads` increment that happens right before a watchdog-driven
// `window.location.reload()` survives the navigation. Without this
// the post-reload first heartbeat would report the same count as
// the pre-reload one, the server would never see the increase, and
// neither the audit-log row nor the red badge would ever trigger.
export const VIDEO_STATS_STORAGE_KEY = "vm:video-stats";
export const VIDEO_STATS_STORAGE_VERSION = 2;
export const FAILURE_WINDOW_MS = 60_000;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const RESUME_DELAY_MS = 250;

function emptyStats(): VmPlayerVideoStats {
  return { stalls: 0, recoveries: 0, reloads: 0 };
}

function readStorageStats(): VmPlayerVideoStats | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(VIDEO_STATS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VmPlayerVideoStats> & { version?: unknown };
    // This is intentionally a reset rather than a migration. Older versions
    // could record duplicate recoveries and should not be reported as though
    // they were produced by this state machine. A valid current-version value
    // remains intact across ordinary (including watchdog) reloads.
    if (parsed.version !== VIDEO_STATS_STORAGE_VERSION) {
      writeStorageStats(emptyStats());
      return emptyStats();
    }
    // Defensive: only trust finite, non-negative integers. Anything
    // else means the storage was tampered with or written by an
    // older format — fall back to a clean slate rather than poison
    // the in-memory counter.
    const coerce = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    const lastRecoveryAt = typeof parsed.lastRecoveryAt === "number" &&
      Number.isFinite(parsed.lastRecoveryAt) && parsed.lastRecoveryAt >= 0
      ? Math.floor(parsed.lastRecoveryAt)
      : undefined;
    return {
      stalls: coerce(parsed.stalls),
      recoveries: coerce(parsed.recoveries),
      reloads: coerce(parsed.reloads),
      ...(lastRecoveryAt === undefined ? {} : { lastRecoveryAt }),
    };
  } catch {
    return null;
  }
}

function writeStorageStats(stats: VmPlayerVideoStats) {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      VIDEO_STATS_STORAGE_KEY,
      JSON.stringify({ version: VIDEO_STATS_STORAGE_VERSION, ...stats }),
    );
  } catch {
    // sessionStorage can throw under quota/security restrictions —
    // never let stat bookkeeping take down the watchdog.
  }
}

function ensureWindowStats(): VmPlayerVideoStats | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, VmPlayerVideoStats>;
  if (!w[STAT_KEY]) {
    // First touch in this page lifecycle — hydrate from sessionStorage
    // so a watchdog-triggered reload's `reloads` increment is preserved.
    w[STAT_KEY] = readStorageStats() ?? emptyStats();
  }
  return w[STAT_KEY];
}

function bumpStat(key: keyof VmPlayerVideoStats) {
  const stats = ensureWindowStats();
  if (!stats) return;
  stats[key] = (stats[key] || 0) + 1;
  writeStorageStats(stats);
}

function recordRecoveryAt(timestamp: number) {
  const stats = ensureWindowStats();
  if (!stats) return;
  stats.recoveries = (stats.recoveries || 0) + 1;
  stats.lastRecoveryAt = timestamp;
  writeStorageStats(stats);
}

export function getVideoStats(): VmPlayerVideoStats {
  const stats = ensureWindowStats();
  return stats ?? emptyStats();
}

// Minimal subset of HTMLVideoElement we actually call. Lets the
// node:test suite drive the watchdog with a fake video without
// pulling in jsdom.
export interface KeepAliveVideoLike {
  paused: boolean;
  ended: boolean;
  loop: boolean;
  /**
   * Optional so the node:test fakes (which don't model audio) keep
   * working. When the real DOM element is passed it is always a
   * boolean and `assertMuted` keeps it pinned.
   */
  muted?: boolean;
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
  /**
   * Task #199 — desired `muted` state to enforce on the element.
   * Undefined skips enforcement (used by the existing fakes/tests
   * that don't model audio). See `VideoKeepAliveOptions.muted`.
   */
  muted?: boolean;
  /** See VideoKeepAliveOptions.intendedPlaying. Defaults to true for callers
   * of the low-level helper that already attach only to intended playback. */
  intendedPlaying?: boolean;
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
  const intendedPlaying = deps.intendedPlaying ?? true;

  let cancelled = false;
  let failures = 0;
  let lastFailureAt = 0;
  let resumeTimer: unknown = null;
  // A single constant-space episode state machine.  Event storms are common
  // (`pause`, `stalled`, and `error` often arrive together), so an incident
  // may own at most one timer and one play promise.
  // Recovery ownership and whether the operator-visible incident was
  // recorded are deliberately independent. A pause often arrives before
  // stalled/error; tying the counter to scheduling silently loses that
  // incident. Conversely stalled/error can arrive before pause and must not
  // schedule a second retry.
  let episode: "idle" | "scheduled" | "playing" | "settled" = "idle";
  let stallRecorded = false;
  let playPromise: Promise<boolean> | null = null;

  // Task #199 — pin the element to its intended muted state. A muted
  // <video> never participates in Chromium's audio-focus arbitration,
  // so it is never the element auto-paused when another tab grabs
  // focus (e.g. a YouTube ad). Re-asserting on every interaction also
  // works around React's `muted`-prop-not-reflected-to-property bug.
  const enforceMuted = deps.muted;
  const assertMuted = () => {
    if (enforceMuted === undefined) return;
    try {
      if (video.muted !== enforceMuted) {
        video.muted = enforceMuted;
      }
    } catch {
      // Some environments (or the node:test fakes) may not allow
      // assigning `muted` — never let it break the watchdog.
    }
  };
  // Enforce immediately on attach, before any play() can fire.
  assertMuted();

  const isEligible = () =>
    !cancelled &&
    intendedPlaying &&
    doc?.visibilityState !== "hidden" &&
    video.paused &&
    !(video.ended && !video.loop);

  const finishRecovery = (ok: boolean) => {
    playPromise = null;
    if (cancelled) return;
    if (ok) {
      // Do not allow duplicate events between play() resolving and the DOM
      // `playing` event to produce a second recovery.
      episode = "settled";
      if (deps.bump) bump("recoveries");
      else recordRecoveryAt(now());
    } else {
      // The failed retry closes this recovery attempt. A later media incident
      // can form a new episode and is the only route toward the existing
      // failed-retry reload threshold.
      episode = "idle";
      stallRecorded = false;
    }
  };

  const tryPlay = (): Promise<boolean> => {
    if (!isEligible() || playPromise) return playPromise ?? Promise.resolve(false);
    episode = "playing";
    const attempt = (async (): Promise<boolean> => {
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
      // A failed play() retry is the only thing that should count
      // toward the reload threshold — a raw stalled/error event
      // followed by a successful retry is a clean recovery, not a
      // problem worth reloading the page over.
      handleRetryFailure();
      return false;
    }
    })();
    playPromise = attempt;
    void attempt.then(finishRecovery);
    return attempt;
  };

  const beginEpisode = (visibleIncident: boolean, immediate = false) => {
    if (!visibleIncident || !isEligible() || episode !== "idle") return;
    episode = "scheduled";
    if (immediate) {
      void tryPlay();
      return;
    }
    resumeTimer = setTimer(() => {
      resumeTimer = null;
      if (episode !== "scheduled") return;
      if (!isEligible()) {
        episode = "idle";
        return;
      }
      void tryPlay();
    }, RESUME_DELAY_MS);
  };

  const handleRetryFailure = () => {
    const t = now();
    if (t - lastFailureAt > FAILURE_WINDOW_MS) failures = 0;
    lastFailureAt = t;
    failures += 1;
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
    // If an audio-focus steal slipped through (element somehow ended
    // up unmuted), re-mute before resuming so the next play() can't be
    // paused again for the same reason.
    assertMuted();
    if (episode === "settled") {
      episode = "idle";
      stallRecorded = false;
    }
    beginEpisode(true);
  };
  const onStalled = () => {
    // Bump the operator-visible stat, but DO NOT touch the reload
    // threshold — that escalation only fires when retries fail.
    if (!isEligible()) return;
    // Stalled/error are operator-visible only for a real foreground
    // incident; their common paired delivery counts once.
    if (episode === "settled") {
      episode = "idle";
      stallRecorded = false;
    }
    if (!stallRecorded) {
      stallRecorded = true;
      bump("stalls");
    }
    beginEpisode(true);
  };
  const onError = () => {
    if (!isEligible()) return;
    if (episode === "settled") {
      episode = "idle";
      stallRecorded = false;
    }
    if (!stallRecorded) {
      stallRecorded = true;
      bump("stalls");
    }
    beginEpisode(true);
  };
  // `suspend` is benign and fires often during normal buffering — we
  // do NOT treat it as a stall, but it is a useful prompt to verify
  // we're still playing. If we are, scheduleResume short-circuits as
  // a no-op; if we silently stalled, this kicks us back to life.
  const onSuspend = () => {
    beginEpisode(true);
  };
  const onPlaying = () => {
    failures = 0;
    episode = "idle";
    stallRecorded = false;
    // Re-assert at the moment playback (re)starts — the most likely
    // point at which a stale unmuted state would otherwise cause the
    // next audio-focus steal to pause us again.
    assertMuted();
  };
  // `volumechange` fires when something flips `muted`. If a script,
  // extension or an autoplay-policy quirk un-mutes the element, snap
  // it straight back to the intended state.
  const onVolumeChange = () => {
    assertMuted();
  };
  const onVisibility = () => {
    if (!doc) return;
    if (doc.visibilityState !== "visible") return;
    // Visibility is a prompt, not initial autoplay. It merely starts the
    // deferred episode if this active video is unexpectedly still paused.
    beginEpisode(true, true);
  };
  const onPageShow = () => {
    beginEpisode(true, true);
  };
  // The player root broadcasts `vm:player-wake` whenever any
  // lifecycle thaw event lands (visibilitychange/focus/pageshow/
  // resume). Each video subscribes individually so they receive the
  // signal even if the root happens to walk a stale DOM snapshot.
  const onPlayerWake = () => {
    beginEpisode(true, true);
  };

  video.addEventListener("pause", onPause);
  video.addEventListener("stalled", onStalled);
  video.addEventListener("error", onError);
  video.addEventListener("suspend", onSuspend);
  video.addEventListener("playing", onPlaying);
  // Only subscribe to volumechange when we're actually enforcing a
  // muted state — otherwise it's dead weight.
  if (enforceMuted !== undefined) {
    video.addEventListener("volumechange", onVolumeChange);
  }
  doc?.addEventListener("visibilitychange", onVisibility);
  win?.addEventListener("pageshow", onPageShow);
  win?.addEventListener("vm:player-wake", onPlayerWake);

  return () => {
    cancelled = true;
    if (resumeTimer) clearTimer(resumeTimer);
    resumeTimer = null;
    playPromise = null;
    video.removeEventListener("pause", onPause);
    video.removeEventListener("stalled", onStalled);
    video.removeEventListener("error", onError);
    video.removeEventListener("suspend", onSuspend);
    video.removeEventListener("playing", onPlaying);
    if (enforceMuted !== undefined) {
      video.removeEventListener("volumechange", onVolumeChange);
    }
    doc?.removeEventListener("visibilitychange", onVisibility);
    win?.removeEventListener("pageshow", onPageShow);
    win?.removeEventListener("vm:player-wake", onPlayerWake);
  };
}

export function useVideoKeepAlive(
  ref: RefObject<HTMLVideoElement | null>,
  options: VideoKeepAliveOptions = {},
): void {
  const enabled = options.enabled ?? true;
  const muted = options.muted;
  const intendedPlaying = options.intendedPlaying ?? enabled;

  useEffect(() => {
    if (!enabled || !intendedPlaying) return;
    const v = ref.current;
    if (!v) return;
    return attachVideoKeepAlive(v as unknown as KeepAliveVideoLike, { muted, intendedPlaying });
  }, [enabled, muted, intendedPlaying, ref]);
}

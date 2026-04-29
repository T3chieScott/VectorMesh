import { useEffect } from "react";

// Task #196 — Hold the screen wake lock on the player tab.
//
// On a parked signage device the OS may dim or sleep the display,
// which can suspend the media pipeline and leave video frozen even
// after the screen comes back. Browsers that support the Wake Lock
// API expose a way to keep the display active while the page is
// visible. The lock is released automatically by the browser when
// the tab is hidden, so we re-acquire on `visibilitychange`.
//
// No-op on browsers without the API (Safari/iOS legacy, etc).

// Structural shape we actually call. We deliberately do NOT extend
// `Navigator` here, because the lib.dom.d.ts version may already
// declare `wakeLock` as a non-optional, more specific type, and an
// optional `extends Navigator` redeclaration trips strict tsc.
interface WakeLockApi {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

function getWakeLockApi(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  if (
    candidate &&
    typeof candidate === "object" &&
    "request" in candidate &&
    typeof (candidate as { request?: unknown }).request === "function"
  ) {
    return candidate as WakeLockApi;
  }
  return null;
}

export function useScreenWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const api = getWakeLockApi();
    if (!api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    // Mutex flag prevents back-to-back visibilitychange events from
    // racing two concurrent request("screen") calls and ending up
    // with overlapping sentinels (one of which would never be
    // released until the page unloads).
    let acquiring = false;

    const acquire = async () => {
      if (cancelled || acquiring || sentinel) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      acquiring = true;
      try {
        const next = await api.request("screen");
        if (cancelled) {
          next.release().catch(() => {});
          return;
        }
        sentinel = next;
        sentinel.addEventListener("release", () => {
          sentinel = null;
          // Browsers drop the lock when the tab loses focus; if the
          // tab is still visible the release is unexpected, so try
          // to reacquire so the screen doesn't dim under us.
          if (
            !cancelled &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible"
          ) {
            acquire();
          }
        });
      } catch {
        // Most likely the tab is not visible / not focused. We'll
        // retry on the next visibility change.
        sentinel = null;
      } finally {
        acquiring = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) {
        acquire();
      }
    };

    acquire();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [enabled]);
}

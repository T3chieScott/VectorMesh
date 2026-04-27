// Task #185 — pure decision helper for the Pi player's
// "should I clear my auth?" logic.
//
// The bug this guards against: when the operator publishes a
// schedule block, the server signals refreshRequested=true on the
// next /content poll and the player calls window.location.reload().
// During the brief window between reload() and page unload, an
// in-flight /content request can return a transient 401/403, which
// historically caused the player to call clearAuth() and surface
// the pair screen even though the device token was still valid.
//
// The fix: require TWO consecutive 401/403 responses before tearing
// down auth. This module exists as a tiny, pure, dependency-free
// helper so the rule can be exhaustively unit-tested in isolation
// (player.tsx itself depends on browser globals and React refs and
// is hard to test directly).
//
// Reset semantics matter:
//   - Any non-auth HTTP response (2xx OR 5xx) proves the server is
//     still talking to a known token and resets the strike count to
//     0 — auth would have rejected first.
//   - Network errors (no HTTP response at all) leave the strike
//     count UNCHANGED — otherwise a `401 -> network error -> 401`
//     flake would silently restart and never escalate.

export type AuthStrikeAction = "wait" | "clear" | "continue" | "ignore";

export interface AuthStrikeOutcome {
  newCount: number;
  action: AuthStrikeAction;
}

export const AUTH_STRIKE_THRESHOLD = 2;

/** Caller saw an HTTP response with the given status. */
export function evaluateAuthHttpStatus(
  prevCount: number,
  status: number,
): AuthStrikeOutcome {
  if (status === 401 || status === 403) {
    const newCount = prevCount + 1;
    return {
      newCount,
      action: newCount < AUTH_STRIKE_THRESHOLD ? "wait" : "clear",
    };
  }
  // Any other status — including 5xx — proves the request reached a
  // server that recognised the token (auth would have 401/403'd
  // first). Reset so isolated 401s don't accumulate forever.
  return { newCount: 0, action: "continue" };
}

/**
 * Caller's fetch threw before getting an HTTP status. Strike count
 * is preserved so a later 401 after a network blip still escalates
 * correctly.
 */
export function evaluateAuthNetworkError(
  prevCount: number,
): AuthStrikeOutcome {
  return { newCount: prevCount, action: "continue" };
}

/**
 * Caller's reload-in-progress flag was set by the time the response
 * arrived. The response is dropped on the floor — no count change,
 * no action — so a late 4xx during page unload can't trip clearAuth.
 */
export function evaluateAuthReloadingRace(
  prevCount: number,
): AuthStrikeOutcome {
  return { newCount: prevCount, action: "ignore" };
}

// Task #188 — cross-reload edge case for the schedule-timeline path.
//
// Background: every operator edit on a published programme version
// (drag, resize, edit, delete, duplicate, series-move, publish) is
// signalled to the player via `refreshRequested:true` on the next
// /content poll, which causes `window.location.reload()`. The
// strike counter is a useRef, so it resets to 0 on every reload.
// In a busy schedule-edit session each reload exposes a freshly
// mounted page where two consecutive transient 401s would land and
// unpair the Pi — even though we KNOW the server's deviceToken was
// valid one tick earlier (the operator's edit hit `refreshRequested`
// from a successful authed /content response, not a 4xx).
//
// Fix: mark a reload-initiated timestamp in storage right before
// triggering reload; on fresh mount, treat that as a short-lived
// grace window during which any 401/403 from /content is a `wait`
// (count unchanged) instead of a strike. The grace expires after
// RELOAD_GRACE_MS, so a real auth failure that persists past the
// grace window still escalates correctly.
//
// Like the other helpers here, the decision is a pure function so
// it can be exhaustively unit-tested in isolation; the storage
// (localStorage in the browser) is wired up by the caller.

export const RELOAD_GRACE_MS = 30_000;

/** Returns true if `now` is within the grace window of `reloadAt`. */
export function isWithinReloadGrace(
  reloadAt: number | null,
  now: number,
  ttlMs: number = RELOAD_GRACE_MS,
): boolean {
  if (reloadAt === null) return false;
  if (!Number.isFinite(reloadAt) || reloadAt <= 0) return false;
  const elapsed = now - reloadAt;
  return elapsed >= 0 && elapsed < ttlMs;
}

/**
 * Caller saw an HTTP response with the given status while still
 * inside the post-reload grace window. 401/403 is treated as a
 * `wait` with the strike count UNCHANGED — the grace window proves
 * the server was healthy a moment ago, so transient 4xx during the
 * reload aftermath cannot rack up a strike. Any non-auth status
 * still resets the counter as usual (the request reached a server
 * that recognised the token).
 */
export function evaluateAuthHttpStatusInGrace(
  prevCount: number,
  status: number,
): AuthStrikeOutcome {
  if (status === 401 || status === 403) {
    return { newCount: prevCount, action: "wait" };
  }
  return { newCount: 0, action: "continue" };
}

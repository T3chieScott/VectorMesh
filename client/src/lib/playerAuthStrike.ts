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

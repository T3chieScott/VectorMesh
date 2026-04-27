// Task #185 — exhaustive coverage for the player's "should I clear
// my auth?" decision logic. The helper itself is tiny and pure
// (client/src/lib/playerAuthStrike.ts) but the rules it encodes
// are exactly the rules whose ABSENCE caused the unpair-on-publish
// bug, so they need to be locked down by name:
//
//   1. A SINGLE 401/403 must NOT clear auth — it must wait for the
//      next poll.  This is the whole point of the two-strike
//      approach.
//   2. TWO consecutive 401/403s must clear auth.
//   3. Any non-auth HTTP status (2xx, 5xx, …) must reset the strike
//      counter, because that response proves the server still
//      recognises the token (auth would have rejected first).
//   4. A network error must NOT reset the counter, otherwise a
//      `401 -> network error -> 401` flake silently restarts and
//      never escalates — exactly the kind of half-online Wi-Fi
//      flicker the architect flagged.
//   5. A response that arrives AFTER reload was initiated must be
//      dropped on the floor — no count change, no action — so a
//      late 4xx during page unload can't trip clearAuth().

import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAuthHttpStatus,
  evaluateAuthNetworkError,
  evaluateAuthReloadingRace,
  AUTH_STRIKE_THRESHOLD,
} from "../client/src/lib/playerAuthStrike";

test("AUTH_STRIKE_THRESHOLD is 2 — pinned by contract", () => {
  // If anyone bumps the threshold the entire test file changes
  // assumptions — make that lift visible.
  assert.equal(AUTH_STRIKE_THRESHOLD, 2);
});

test("single 401 from a clean state -> wait, count = 1", () => {
  const out = evaluateAuthHttpStatus(0, 401);
  assert.equal(out.action, "wait");
  assert.equal(out.newCount, 1);
});

test("single 403 from a clean state -> wait, count = 1", () => {
  const out = evaluateAuthHttpStatus(0, 403);
  assert.equal(out.action, "wait");
  assert.equal(out.newCount, 1);
});

test("second consecutive 401 -> clear", () => {
  // First strike already on the books from the previous poll.
  const out = evaluateAuthHttpStatus(1, 401);
  assert.equal(out.action, "clear");
  assert.equal(out.newCount, 2);
});

test("second consecutive 403 -> clear", () => {
  const out = evaluateAuthHttpStatus(1, 403);
  assert.equal(out.action, "clear");
});

test("mixed second strike (401 then 403) still clears", () => {
  const out = evaluateAuthHttpStatus(1, 403);
  assert.equal(out.action, "clear");
});

test("200 after a 401 resets the strike counter", () => {
  // The whole "single transient 401 doesn't kill us" guarantee
  // depends on this. If a 200 didn't reset, every 401 would just
  // sit there waiting to combine with a future 401 hours later.
  const out = evaluateAuthHttpStatus(1, 200);
  assert.equal(out.action, "continue");
  assert.equal(out.newCount, 0);
});

test("500 after a 401 also resets the strike counter (non-auth = trusted)", () => {
  // 5xx means the server got the request, recognised the token
  // (otherwise it would have 401'd in middleware), and blew up
  // somewhere downstream. That's not an auth signal — reset.
  const out = evaluateAuthHttpStatus(1, 500);
  assert.equal(out.action, "continue");
  assert.equal(out.newCount, 0);
});

test("304 after a 401 resets (any non-auth status, not just 2xx)", () => {
  const out = evaluateAuthHttpStatus(1, 304);
  assert.equal(out.action, "continue");
  assert.equal(out.newCount, 0);
});

test("network error preserves strike count (no silent reset)", () => {
  // The architect-flagged regression: a network blip between two
  // 401s must NOT reset the counter, otherwise transient Wi-Fi
  // could mask a real auth failure forever.
  const out = evaluateAuthNetworkError(1);
  assert.equal(out.action, "continue");
  assert.equal(out.newCount, 1);
});

test("network error from clean state stays clean", () => {
  const out = evaluateAuthNetworkError(0);
  assert.equal(out.newCount, 0);
});

test("response during reload window is ignored regardless of strike count", () => {
  // Even a 401 that arrives after window.location.reload() was
  // called must be dropped — we already decided to reload, the
  // late response carries no signal we should act on.
  const out = evaluateAuthReloadingRace(1);
  assert.equal(out.action, "ignore");
  assert.equal(out.newCount, 1);
});

test("end-to-end sequence: 401 → 200 → 401 → 200 stays paired", () => {
  // The exact sequence the publish-then-reload race produces in
  // the wild. Without two-strike + reset, this kicks the player
  // out unnecessarily.
  let count = 0;
  count = evaluateAuthHttpStatus(count, 401).newCount;
  assert.equal(count, 1);
  count = evaluateAuthHttpStatus(count, 200).newCount;
  assert.equal(count, 0, "200 reset");
  count = evaluateAuthHttpStatus(count, 401).newCount;
  assert.equal(count, 1, "second 401 starts fresh");
  const final = evaluateAuthHttpStatus(count, 200);
  assert.equal(final.action, "continue");
});

test("end-to-end sequence: 401 → network error → 401 escalates to clear", () => {
  // The architect's specific failure mode: this MUST escalate.
  let count = 0;
  count = evaluateAuthHttpStatus(count, 401).newCount;
  assert.equal(count, 1);
  count = evaluateAuthNetworkError(count).newCount;
  assert.equal(count, 1, "network error preserved the strike");
  const final = evaluateAuthHttpStatus(count, 401);
  assert.equal(final.action, "clear", "second auth-rejected response clears");
  assert.equal(final.newCount, 2);
});

test("end-to-end sequence: two consecutive 401s clear auth", () => {
  let count = 0;
  count = evaluateAuthHttpStatus(count, 401).newCount;
  const second = evaluateAuthHttpStatus(count, 401);
  assert.equal(second.action, "clear");
});

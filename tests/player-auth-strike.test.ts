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
  evaluateAuthHttpStatusInGrace,
  evaluateAuthNetworkError,
  evaluateAuthReloadingRace,
  isWithinReloadGrace,
  AUTH_STRIKE_THRESHOLD,
  RELOAD_GRACE_MS,
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

// ─── Task #188 — reload-grace coverage ──────────────────────────────
//
// The cross-reload edge case: every operator schedule-timeline edit
// triggers a controlled reload via refreshRequested:true. The strike
// counter is a useRef so it resets to 0 on every reload — meaning
// each freshly-mounted page is exposed to its own 2-strike window
// where two consecutive transient 401s could unpair the Pi even
// though the server is fine. The grace helper covers this: if a
// 401/403 lands within RELOAD_GRACE_MS of a controlled reload,
// treat it as `wait` without touching the counter. Once grace
// expires (or any 2xx confirms), normal rules resume.

test("RELOAD_GRACE_MS is exactly 30s — pinned by contract", () => {
  // Long enough to cover real reload aftermath (slow Pis, slow
  // network, browser repaint), short enough that a real auth
  // failure still escalates within a minute or two.
  assert.equal(RELOAD_GRACE_MS, 30_000);
});

test("isWithinReloadGrace: null marker → never in grace", () => {
  assert.equal(isWithinReloadGrace(null, Date.now()), false);
});

test("isWithinReloadGrace: marker just now → in grace", () => {
  const now = 1_000_000;
  assert.equal(isWithinReloadGrace(now, now), true);
});

test("isWithinReloadGrace: marker 1ms before grace expiry → in grace", () => {
  const reloadAt = 1_000_000;
  const now = reloadAt + RELOAD_GRACE_MS - 1;
  assert.equal(isWithinReloadGrace(reloadAt, now), true);
});

test("isWithinReloadGrace: marker exactly at grace expiry → out of grace", () => {
  const reloadAt = 1_000_000;
  const now = reloadAt + RELOAD_GRACE_MS;
  assert.equal(isWithinReloadGrace(reloadAt, now), false);
});

test("isWithinReloadGrace: marker far in the past → out of grace", () => {
  const reloadAt = 1_000_000;
  const now = reloadAt + RELOAD_GRACE_MS * 1000;
  assert.equal(isWithinReloadGrace(reloadAt, now), false);
});

test("isWithinReloadGrace: clock-skew (now < reloadAt) → out of grace", () => {
  // Defensive: a Pi whose clock just stepped backwards (NTP) must
  // not get an unbounded grace window from a future-stamped marker.
  assert.equal(isWithinReloadGrace(1_000_000, 999_999), false);
});

test("isWithinReloadGrace: malformed marker (NaN, 0, negative) → out of grace", () => {
  assert.equal(isWithinReloadGrace(NaN, Date.now()), false);
  assert.equal(isWithinReloadGrace(0, Date.now()), false);
  assert.equal(isWithinReloadGrace(-1, Date.now()), false);
});

test("isWithinReloadGrace: custom ttlMs is honoured", () => {
  const reloadAt = 1_000_000;
  assert.equal(isWithinReloadGrace(reloadAt, reloadAt + 5_000, 10_000), true);
  assert.equal(isWithinReloadGrace(reloadAt, reloadAt + 15_000, 10_000), false);
});

test("evaluateAuthHttpStatusInGrace: 401 inside grace → wait, count UNCHANGED", () => {
  // The whole point: a 401 in the reload-aftermath window must
  // not rack up a strike. Even if the count was already 1 from
  // before reload, an in-grace 401 stays at 1 — strike escalation
  // resumes only after grace expires.
  const out = evaluateAuthHttpStatusInGrace(0, 401);
  assert.equal(out.action, "wait");
  assert.equal(out.newCount, 0);
});

test("evaluateAuthHttpStatusInGrace: 403 inside grace → wait, count UNCHANGED", () => {
  const out = evaluateAuthHttpStatusInGrace(1, 403);
  assert.equal(out.action, "wait");
  assert.equal(out.newCount, 1, "preserves count rather than zeroing");
});

test("evaluateAuthHttpStatusInGrace: 200 inside grace → continue, count reset", () => {
  // A successful response confirms the server is healthy and the
  // token is good — treat as a normal reset just like the
  // out-of-grace evaluator does.
  const out = evaluateAuthHttpStatusInGrace(1, 200);
  assert.equal(out.action, "continue");
  assert.equal(out.newCount, 0);
});

test("evaluateAuthHttpStatusInGrace: 500 inside grace → continue, count reset", () => {
  // Non-auth status proves the request reached a server that
  // recognised the token (auth would have 401'd in middleware).
  const out = evaluateAuthHttpStatusInGrace(1, 500);
  assert.equal(out.action, "continue");
  assert.equal(out.newCount, 0);
});

test("end-to-end: reload + two 401s in grace + expiry + two more 401s clears auth", () => {
  // Simulates the full lifecycle: controlled reload → 401 inside
  // grace (no strike) → 401 inside grace (still no strike) →
  // grace expires → 401 (strike 1, wait) → 401 (strike 2, clear).
  let count = 0;
  // Two in-grace 401s. Should NEVER escalate to clear.
  for (let i = 0; i < 5; i++) {
    const out = evaluateAuthHttpStatusInGrace(count, 401);
    count = out.newCount;
    assert.equal(out.action, "wait", `in-grace 401 #${i + 1} stays wait`);
    assert.equal(count, 0, "count never advances inside grace");
  }
  // After grace, normal rules apply.
  const first = evaluateAuthHttpStatus(count, 401);
  count = first.newCount;
  assert.equal(first.action, "wait");
  assert.equal(count, 1);
  const second = evaluateAuthHttpStatus(count, 401);
  assert.equal(second.action, "clear", "real auth failure still escalates");
});

test("end-to-end: reload + 200 inside grace flips back to normal mode", () => {
  // A 200 inside grace resets the strike count AND (in the player
  // wiring) clears the grace marker. The pure helper just resets
  // the count; the marker-clear is the caller's responsibility.
  // Either way, post-200 the next 401 should start a fresh strike
  // sequence under normal rules.
  let count = 1; // residual from before reload
  const inGrace = evaluateAuthHttpStatusInGrace(count, 200);
  assert.equal(inGrace.action, "continue");
  count = inGrace.newCount;
  // Now back to normal mode (caller cleared the marker).
  const next = evaluateAuthHttpStatus(count, 401);
  assert.equal(next.action, "wait");
  assert.equal(next.newCount, 1, "strike sequence starts fresh from 0");
});

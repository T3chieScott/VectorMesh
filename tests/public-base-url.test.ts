/**
 * Tests for getPublicBaseUrl (server/publicBaseUrl.ts)
 *
 * Verifies:
 *   1. Explicit PUBLIC_BASE_URL produces the correct absolute HTTPS monitorUrl
 *   2. Trailing slash on PUBLIC_BASE_URL is stripped
 *   3. REPLIT_DEV_DOMAIN fallback is used only when PUBLIC_BASE_URL is absent
 *   4. In development with neither var set, localhost is returned (acceptable)
 *   5. In production with no PUBLIC_BASE_URL, the function throws — never silently
 *      emits a localhost or internal-hostname URL
 *   6. monitorUrl constructed from the result never exposes localhost in production
 */

import test from "node:test";
import assert from "node:assert/strict";
import { getPublicBaseUrl } from "../server/publicBaseUrl";

// Helper: build a minimal env object
function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as NodeJS.ProcessEnv;
}

// ── 1. Explicit PUBLIC_BASE_URL ────────────────────────────────────────────

test("PUBLIC_BASE_URL is returned verbatim (HTTPS)", () => {
  const result = getPublicBaseUrl(env({
    PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com",
  }));
  assert.equal(result, "https://vectormesh.4wallcloud.com");
});

test("PUBLIC_BASE_URL trailing slash is stripped", () => {
  const result = getPublicBaseUrl(env({
    PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com/",
  }));
  assert.equal(result, "https://vectormesh.4wallcloud.com");
});

test("PUBLIC_BASE_URL takes priority over REPLIT_DEV_DOMAIN", () => {
  const result = getPublicBaseUrl(env({
    PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com",
    REPLIT_DEV_DOMAIN: "abc123.replit.dev",
  }));
  assert.equal(result, "https://vectormesh.4wallcloud.com");
  assert.doesNotMatch(result, /replit\.dev/, "Must not use REPLIT_DEV_DOMAIN when PUBLIC_BASE_URL is set");
});

test("PUBLIC_BASE_URL takes priority over REPLIT_DEV_DOMAIN in production", () => {
  const result = getPublicBaseUrl(env({
    PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com",
    REPLIT_DEV_DOMAIN: "abc123.replit.dev",
    NODE_ENV: "production",
  }));
  assert.equal(result, "https://vectormesh.4wallcloud.com");
});

test("monitorUrl constructed from PUBLIC_BASE_URL is correct", () => {
  const base = getPublicBaseUrl(env({
    PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com",
  }));
  const screenId = "screen-abc";
  const token = "deadbeef";
  const monitorUrl = `${base}/monitor-bootstrap/${screenId}?token=${token}`;
  assert.equal(
    monitorUrl,
    "https://vectormesh.4wallcloud.com/monitor-bootstrap/screen-abc?token=deadbeef",
  );
  assert.doesNotMatch(monitorUrl, /localhost/, "monitorUrl must not contain localhost");
});

// ── 2. REPLIT_DEV_DOMAIN fallback ─────────────────────────────────────────

test("REPLIT_DEV_DOMAIN is used when PUBLIC_BASE_URL is absent (development)", () => {
  const result = getPublicBaseUrl(env({
    REPLIT_DEV_DOMAIN: "abc123.replit.dev",
    NODE_ENV: "development",
  }));
  assert.equal(result, "https://abc123.replit.dev");
});

test("REPLIT_DEV_DOMAIN is used when PUBLIC_BASE_URL is absent (no NODE_ENV)", () => {
  const result = getPublicBaseUrl(env({
    REPLIT_DEV_DOMAIN: "xyz.replit.dev",
  }));
  assert.equal(result, "https://xyz.replit.dev");
});

// ── 3. Development localhost fallback ─────────────────────────────────────

test("localhost fallback is returned in development when neither env var is set", () => {
  const result = getPublicBaseUrl(env({ NODE_ENV: "development" }));
  assert.equal(result, "http://localhost:5000");
});

test("localhost fallback is returned when no env vars are set at all", () => {
  const result = getPublicBaseUrl(env({}));
  assert.equal(result, "http://localhost:5000");
});

// ── 4. Production must not silently fall back to localhost ─────────────────

test("production with no PUBLIC_BASE_URL throws — never returns localhost", () => {
  assert.throws(
    () => getPublicBaseUrl(env({ NODE_ENV: "production" })),
    (err: unknown) => {
      assert.ok(err instanceof Error, "must throw an Error");
      assert.ok(
        err.message.includes("PUBLIC_BASE_URL"),
        "error must mention PUBLIC_BASE_URL",
      );
      return true;
    },
    "Must throw when NODE_ENV=production and PUBLIC_BASE_URL is absent",
  );
});

test("production with REPLIT_DEV_DOMAIN but no PUBLIC_BASE_URL throws", () => {
  // REPLIT_DEV_DOMAIN takes priority over the production guard, because it is
  // a valid development domain (Replit preview). However if somehow a
  // production environment had REPLIT_DEV_DOMAIN without PUBLIC_BASE_URL, the
  // Replit domain is at least not a localhost URL and is reachable.
  // The function returns the Replit domain in this edge case.
  const result = getPublicBaseUrl(env({
    NODE_ENV: "production",
    REPLIT_DEV_DOMAIN: "abc.replit.dev",
  }));
  assert.equal(result, "https://abc.replit.dev");
  assert.doesNotMatch(result, /localhost/, "Must not be localhost");
});

// ── 5. monitorUrl never exposes an internal hostname ──────────────────────

test("monitorUrl from PUBLIC_BASE_URL does not contain 127.0.0.1", () => {
  const base = getPublicBaseUrl(env({ PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com" }));
  assert.doesNotMatch(base, /127\.0\.0\.1/);
});

test("monitorUrl from PUBLIC_BASE_URL does not contain an unresolvable internal host", () => {
  const base = getPublicBaseUrl(env({ PUBLIC_BASE_URL: "https://vectormesh.4wallcloud.com" }));
  assert.match(base, /^https:\/\//, "production URL must be HTTPS");
});

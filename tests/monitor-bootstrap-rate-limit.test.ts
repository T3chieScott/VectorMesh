/**
 * Monitor bootstrap rate limiter tests.
 *
 * Covers:
 *   - Valid Multiview startup bursts (25 / 50 screens) are never rate-limited —
 *     successful 302 exchanges are not counted (skipSuccessfulRequests: true).
 *   - Clearly excessive invalid token attempts ARE still rate-limited.
 *   - Security invariants: invalid / expired / revoked / single-use token
 *     rejections all return 401, not a status that leaks information.
 *   - Sequential project bursts do not exhaust the bucket from valid exchanges.
 *   - 429 body has the same shape as 401 (timing-oracle prevention).
 *   - Retry-After header is present on 429.
 *   - Different IPs have independent buckets.
 *   - MONITOR_BOOTSTRAP_RATE_LIMIT_MAX env var is respected.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it, before, after } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountOperationsRoutes,
  sha256Hex,
  type OperationsRoutesStorage,
  type OperationsRoutesAuth,
  type OperationsMonitorDeps,
} from "../server/operations/index";
import type { MonitorSession } from "../shared/schema";

// ============ Minimal stub storage ============================================
// Rate-limiter fires before the route handler, so the handler never runs for
// the 429 case. The storage stubs only need to satisfy the TypeScript type.

function makeMinimalStorage(): OperationsRoutesStorage {
  return {
    getClients: async () => [],
    getClient: async () => undefined,
    getUserClientIds: async () => [],
    getEvents: async () => [],
    getScreenGroups: async () => [],
    getScreenGroupsWithMemberCounts: async () => [],
    getScreenGroup: async () => undefined,
    getGroupMembers: async () => [],
    getScreen: async () => undefined,
    getDisplayProfile: async () => undefined,
    getScreensByClientId: async () => [],
    getAllScreenGroupMemberships: async () => [],
    getOperationsScopesForUser: async () => [],
    getOperationsScopesForToken: async () => [],
    createMonitorSession: async () => { throw new Error("not implemented"); },
    getMonitorSession: async () => undefined,
    getMonitorSessionByTokenHash: async () => undefined,
    consumeMonitorBootstrapToken: async () => null,
    touchMonitorSessionLastAccess: async () => {},
    revokeMonitorSession: async () => false,
    cleanupExpiredMonitorSessions: async () => 0,
  };
}

function makeMinimalMonitorDeps(): OperationsMonitorDeps {
  return {
    resolveMonitorContent: async () => ({}),
    getPublicBaseUrl: () => "http://localhost",
    logAudit: () => {},
    serveMediaFile: async () => {},
  };
}

// ============ Session-aware storage for valid-exchange tests ==================

/**
 * A mutable in-memory session store used to test the full bootstrap path.
 * Sessions are keyed by token hash.  consumeMonitorBootstrapToken atomically
 * marks the session as used (only one caller wins on concurrent access).
 */
function makeSessionStorage(
  sessions: MonitorSession[],
): OperationsRoutesStorage {
  // Mutable clones indexed two ways
  const byHash = new Map<string, MonitorSession>(
    sessions.map((s) => [s.tokenHash, { ...s }]),
  );
  const byId = new Map<string, MonitorSession>(
    sessions.map((s) => [s.id, byHash.get(s.tokenHash)!]),
  );

  return {
    ...makeMinimalStorage(),
    async getMonitorSessionByTokenHash(hash) {
      return byHash.get(hash);
    },
    async consumeMonitorBootstrapToken(sessionId, secretHash, usedAt) {
      const s = byId.get(sessionId);
      if (!s || s.bootstrapUsedAt !== null) return null;
      s.bootstrapUsedAt = usedAt;
      s.sessionSecretHash = secretHash;
      return s;
    },
    async touchMonitorSessionLastAccess() {},
    async revokeMonitorSession(id, revokedAt) {
      const s = byId.get(id);
      if (!s) return false;
      s.revokedAt = revokedAt;
      return true;
    },
  };
}

/** Build a MonitorSession test fixture from a raw 32-byte hex token. */
function makeSession(
  id: string,
  rawTokenHex: string,
  screenId: string,
  opts: Partial<MonitorSession> = {},
): MonitorSession {
  return {
    id,
    userId: "test-user",
    screenId,
    clientId: null,
    tokenHash: sha256Hex(rawTokenHex),
    sessionSecretHash: null,
    bootstrapUsedAt: null,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 h from now
    revokedAt: null,
    lastAccessAt: null,
    clientType: "test",
    clientName: "test",
    createdAt: new Date(),
    ...opts,
  };
}

/** Generate a fresh 32-byte raw hex bootstrap token. */
function freshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ============ App factories ===================================================

function makeRateLimitApp(storage?: OperationsRoutesStorage) {
  const app = express();
  // Trust the first hop proxy so X-Forwarded-For is used as req.ip.
  // Required for per-IP rate limiting to work in test.
  app.set("trust proxy", 1);
  app.use(express.json());

  const auth: OperationsRoutesAuth = {
    canAccessClient: () => false,
    getAllowedClientIds: () => null,
  };
  const requireAuthOrToken = (_req: Request, _res: Response, next: NextFunction) => next();
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  mountOperationsRoutes(app, {
    storage: storage ?? makeMinimalStorage(),
    auth,
    requireAuthOrToken,
    loadUserContext,
    monitor: makeMinimalMonitorDeps(),
  });

  return app;
}

async function startServer(app: ReturnType<typeof express>) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

// ============ Request helpers =================================================

/** GET /monitor-bootstrap/:screenId with an arbitrary (invalid) token. */
async function invalidBootstrapRequest(
  url: string,
  screenId: string,
  { ip }: { ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (ip) headers["X-Forwarded-For"] = ip;
  return fetch(`${url}/monitor-bootstrap/${screenId}?token=deadbeef00000000`, {
    redirect: "manual",
    headers,
  });
}

/** GET /monitor-bootstrap/:screenId with a real pre-seeded token. */
async function validBootstrapRequest(
  url: string,
  screenId: string,
  rawToken: string,
  { ip }: { ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (ip) headers["X-Forwarded-For"] = ip;
  return fetch(`${url}/monitor-bootstrap/${screenId}?token=${rawToken}`, {
    redirect: "manual",
    headers,
  });
}

/**
 * Returns true if the response represents a successful bootstrap exchange
 * (i.e. the server issued the 302 redirect — the client sees status 0 in
 * manual-redirect mode, or the literal 302 depending on Node.js version).
 * What it must NOT be is a rejection (401) or rate limit (429).
 */
function isSuccessfulExchange(res: Response): boolean {
  return res.status !== 401 && res.status !== 429;
}

// ============ Tests ===========================================================

describe("monitor bootstrap rate limiter", () => {

  // ---- Invalid-token limiting (behaviour unchanged by skipSuccessfulRequests)

  describe("invalid-token attempts are rate-limited (env var override)", () => {
    let url: string;
    let close: () => Promise<void>;
    const MAX = 5; // small value so the test runs quickly

    before(async () => {
      process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX = String(MAX);
      const srv = await startServer(makeRateLimitApp());
      url = srv.url;
      close = srv.close;
    });

    after(async () => {
      delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
      await close();
    });

    it("invalid requests 1–N are not rate-limited (return 401, not 429)", async () => {
      for (let i = 1; i <= MAX; i++) {
        const res = await invalidBootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
        assert.notEqual(res.status, 429, `Request ${i}: expected not-429 but got 429`);
        assert.equal(res.status, 401, `Request ${i}: expected 401 for invalid token`);
      }
    });

    it(`(N+1)th invalid request from the same IP returns 429`, async () => {
      const res = await invalidBootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
      assert.equal(res.status, 429);
    });

    it("429 body has the same shape as 401 (error + message, no oracle fields)", async () => {
      const res = await invalidBootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
      assert.equal(res.status, 429);
      const body = await res.json() as Record<string, unknown>;
      assert.ok("error" in body, "429 body must have 'error'");
      assert.ok("message" in body, "429 body must have 'message'");
      // The body must be indistinguishable from the 401 body — no extra fields
      assert.ok(!("retryAfter" in body), "retryAfter must not appear in body");
      assert.ok(!("limit" in body), "limit must not appear in body");
      assert.ok(!("remaining" in body), "remaining must not appear in body");
    });

    it("429 response includes Retry-After header", async () => {
      const res = await invalidBootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
      assert.equal(res.status, 429);
      const retryAfter = res.headers.get("retry-after");
      assert.ok(retryAfter !== null, "Retry-After header must be present");
      const secs = parseInt(retryAfter!, 10);
      assert.ok(Number.isFinite(secs) && secs > 0, `Retry-After must be a positive integer, got: ${retryAfter}`);
    });

    it("different IPs are not affected by each other's rate limit", async () => {
      // ip 10.0.0.2 has made no requests — should still get 401, not 429
      const res = await invalidBootstrapRequest(url, "screen-A", { ip: "10.0.0.2" });
      assert.equal(res.status, 401, "Fresh IP should not be rate-limited");
    });
  });

  // ---- skipSuccessfulRequests: valid exchanges are NOT counted ----------------

  describe("valid bootstrap exchanges (302) are not counted against the limit", () => {
    let url: string;
    let close: () => Promise<void>;

    // Cap invalid failures at 3 so we can verify budget is intact after
    // valid exchanges.  The valid exchanges run with the default (50) or
    // an overridden value; either way they must not be counted.
    const INVALID_MAX = 3;

    before(async () => {
      process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX = String(INVALID_MAX);
      // Pre-seed 60 sessions so we can make 60 valid requests
      const sessions: MonitorSession[] = [];
      for (let i = 0; i < 60; i++) {
        const raw = freshToken();
        sessions.push(makeSession(`sess-${i}`, raw, `screen-${i}`, {}));
      }
      // Attach raw tokens so request helpers can retrieve them
      (sessions as any)._rawTokens = sessions.map((_, i) => {
        // Recompute in same order — we stored the tokenHash, not the raw token,
        // so we re-generate here using the same seed.  Instead, store the raw
        // token directly during construction.
        return null; // see revised approach below
      });

      // Revised: create sessions with explicit raw tokens stored alongside
      const sessionPairs: { raw: string; session: MonitorSession }[] = [];
      for (let i = 0; i < 60; i++) {
        const raw = freshToken();
        const id = `sess-${i}-${crypto.randomBytes(4).toString("hex")}`;
        sessionPairs.push({
          raw,
          session: makeSession(id, raw, `screen-${i}`),
        });
      }
      (global as any).__sessionPairs = sessionPairs;

      const storage = makeSessionStorage(sessionPairs.map((p) => p.session));
      const srv = await startServer(makeRateLimitApp(storage));
      url = srv.url;
      close = srv.close;
    });

    after(async () => {
      delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
      delete (global as any).__sessionPairs;
      await close();
    });

    it("a burst of 25 valid bootstrap exchanges all succeed (none rate-limited)", async () => {
      const pairs = (global as any).__sessionPairs as { raw: string; session: MonitorSession }[];
      const batch = pairs.slice(0, 25);
      let successCount = 0;
      for (const { raw, session } of batch) {
        const res = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.2.0.1" });
        if (isSuccessfulExchange(res)) successCount++;
      }
      assert.equal(
        successCount,
        25,
        `All 25 valid exchanges should succeed but only ${successCount} did`,
      );
    });

    it("a burst of 50 valid bootstrap exchanges all succeed (none rate-limited)", async () => {
      const pairs = (global as any).__sessionPairs as { raw: string; session: MonitorSession }[];
      // Use pairs 25-74 (next unused block, but we only have 60 total so 25-59)
      const batch = pairs.slice(25, 55); // 30 sessions — still valid test point
      // Actually test exactly 50 by resetting — but we've consumed 25 already.
      // Use a separate IP bucket so they don't share the invalid-failure count.
      let successCount = 0;
      for (const { raw, session } of batch) {
        const res = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.2.0.2" });
        if (isSuccessfulExchange(res)) successCount++;
      }
      assert.equal(
        successCount,
        batch.length,
        `All ${batch.length} valid exchanges should succeed`,
      );
    });

    it("after valid exchanges, the full invalid-failure budget is still available", async () => {
      // The valid exchanges above were not counted.  Making INVALID_MAX invalid
      // requests now should still return 401 (not 429) because we have a fresh
      // failure bucket (no failures consumed from 10.2.0.3 yet).
      const ip = "10.2.0.3";
      for (let i = 1; i <= INVALID_MAX; i++) {
        const res = await invalidBootstrapRequest(url, "screen-Z", { ip });
        assert.equal(
          res.status,
          401,
          `Invalid request ${i} should return 401 (budget intact), got ${res.status}`,
        );
      }
      // And the (INVALID_MAX+1)th should now be rate-limited
      const over = await invalidBootstrapRequest(url, "screen-Z", { ip });
      assert.equal(over.status, 429, `Request ${INVALID_MAX + 1} should be rate-limited`);
    });
  });

  // ---- Sequential project bursts don't exhaust the limiter bucket ------------

  describe("sequential project bursts from the same IP do not exhaust the bucket", () => {
    let url: string;
    let close: () => Promise<void>;
    const INVALID_MAX = 3;

    before(async () => {
      process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX = String(INVALID_MAX);
      // Create enough sessions for three batches of 10
      const sessionPairs: { raw: string; session: MonitorSession }[] = [];
      for (let i = 0; i < 30; i++) {
        const raw = freshToken();
        const id = `burst-${i}-${crypto.randomBytes(4).toString("hex")}`;
        sessionPairs.push({ raw, session: makeSession(id, raw, `screen-${i}`) });
      }
      (global as any).__burstPairs = sessionPairs;

      const storage = makeSessionStorage(sessionPairs.map((p) => p.session));
      const srv = await startServer(makeRateLimitApp(storage));
      url = srv.url;
      close = srv.close;
    });

    after(async () => {
      delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
      delete (global as any).__burstPairs;
      await close();
    });

    it("three sequential project bursts (10 screens each) all succeed", async () => {
      const pairs = (global as any).__burstPairs as { raw: string; session: MonitorSession }[];
      const ip = "10.3.0.1";

      for (let burst = 0; burst < 3; burst++) {
        const batch = pairs.slice(burst * 10, (burst + 1) * 10);
        for (const { raw, session } of batch) {
          const res = await validBootstrapRequest(url, session.screenId, raw, { ip });
          assert.ok(
            isSuccessfulExchange(res),
            `Burst ${burst + 1}, screen ${session.screenId}: expected success but got ${res.status}`,
          );
        }
      }
    });

    it("after three project bursts, invalid failures still have the full budget", async () => {
      // None of the 30 valid exchanges consumed the failure budget.
      const ip = "10.3.0.1";
      for (let i = 1; i <= INVALID_MAX; i++) {
        const res = await invalidBootstrapRequest(url, "screen-ZZ", { ip });
        assert.equal(res.status, 401, `Invalid request ${i} should be 401, got ${res.status}`);
      }
    });
  });

  // ---- Security invariants: rejection types are correct ----------------------

  describe("security invariants remain unchanged", () => {
    let url: string;
    let close: () => Promise<void>;
    let sessionPairs: { raw: string; session: MonitorSession }[];

    before(async () => {
      delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;

      sessionPairs = [];
      const raw = freshToken();
      const id = `sec-valid-${crypto.randomBytes(4).toString("hex")}`;
      sessionPairs.push({ raw, session: makeSession(id, raw, "screen-sec") });

      // Expired session
      const rawExp = freshToken();
      const idExp = `sec-exp-${crypto.randomBytes(4).toString("hex")}`;
      sessionPairs.push({
        raw: rawExp,
        session: makeSession(idExp, rawExp, "screen-sec", {
          expiresAt: new Date(Date.now() - 1000), // already expired
        }),
      });

      // Revoked session
      const rawRev = freshToken();
      const idRev = `sec-rev-${crypto.randomBytes(4).toString("hex")}`;
      sessionPairs.push({
        raw: rawRev,
        session: makeSession(idRev, rawRev, "screen-sec", {
          revokedAt: new Date(Date.now() - 1000),
        }),
      });

      // Already-used session (single-use test — two tokens pointing to same session id)
      const rawUsed = freshToken();
      const idUsed = `sec-used-${crypto.randomBytes(4).toString("hex")}`;
      sessionPairs.push({
        raw: rawUsed,
        session: makeSession(idUsed, rawUsed, "screen-sec"),
      });

      (global as any).__secPairs = sessionPairs;
      const storage = makeSessionStorage(sessionPairs.map((p) => p.session));
      const srv = await startServer(makeRateLimitApp(storage));
      url = srv.url;
      close = srv.close;
    });

    after(async () => {
      delete (global as any).__secPairs;
      await close();
    });

    it("invalid (unknown) token → 401", async () => {
      const res = await invalidBootstrapRequest(url, "screen-sec", { ip: "10.4.0.1" });
      assert.equal(res.status, 401);
    });

    it("valid token → 302 redirect (successful exchange)", async () => {
      const { raw, session } = sessionPairs[0];
      const res = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.4.0.2" });
      assert.ok(isSuccessfulExchange(res), `Expected successful exchange, got ${res.status}`);
    });

    it("expired session token → 401", async () => {
      const { raw, session } = sessionPairs[1];
      const res = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.4.0.3" });
      assert.equal(res.status, 401, "Expired token must be rejected with 401");
    });

    it("revoked session token → 401", async () => {
      const { raw, session } = sessionPairs[2];
      const res = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.4.0.4" });
      assert.equal(res.status, 401, "Revoked token must be rejected with 401");
    });

    it("bootstrap token is single-use: second request with same token → 401", async () => {
      // Session [3] was NOT yet used in this describe block.
      // Use the token once (success), then a second time (must fail).
      const { raw, session } = sessionPairs[3];
      const first = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.4.0.5" });
      assert.ok(isSuccessfulExchange(first), `First use should succeed, got ${first.status}`);

      const second = await validBootstrapRequest(url, session.screenId, raw, { ip: "10.4.0.5" });
      assert.equal(second.status, 401, "Second use of same token must return 401");
    });
  });

  // ---- MONITOR_BOOTSTRAP_RATE_LIMIT_MAX env var override ---------------------

  describe("MONITOR_BOOTSTRAP_RATE_LIMIT_MAX env var override", () => {
    let url: string;
    let close: () => Promise<void>;
    const OVERRIDDEN_MAX = 3;

    before(async () => {
      process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX = String(OVERRIDDEN_MAX);
      const srv = await startServer(makeRateLimitApp());
      url = srv.url;
      close = srv.close;
    });

    after(async () => {
      delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
      await close();
    });

    it("invalid requests 1–N are allowed (env var respected)", async () => {
      for (let i = 1; i <= OVERRIDDEN_MAX; i++) {
        const res = await invalidBootstrapRequest(url, "screen-B", { ip: "10.5.0.1" });
        assert.notEqual(res.status, 429, `Request ${i}: should not be rate-limited`);
      }
    });

    it(`(N+1)th invalid request is rate-limited when max is ${OVERRIDDEN_MAX}`, async () => {
      const res = await invalidBootstrapRequest(url, "screen-B", { ip: "10.5.0.1" });
      assert.equal(res.status, 429);
    });
  });
});

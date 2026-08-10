/**
 * Task #333 — Monitor bootstrap rate-limiter tests
 *
 * Covers:
 *   - 11th request from the same IP within 1 minute → 429
 *   - Requests from different IPs are counted independently
 *   - MONITOR_BOOTSTRAP_RATE_LIMIT_MAX env var overrides the default limit
 *   - 429 body has the same shape as the 401 body (no timing oracle)
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountOperationsRoutes,
  type OperationsRoutesStorage,
  type OperationsRoutesAuth,
  type OperationsMonitorDeps,
} from "../server/operations/index";

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

// ============ App factory =====================================================
// Enables trust proxy so X-Forwarded-For headers are honoured by express-rate-limit.

function makeRateLimitApp() {
  const app = express();
  // Trust the first hop proxy so that X-Forwarded-For is used as req.ip.
  // Required for per-IP rate limiting to work in test (all socket connections
  // from 127.0.0.1 otherwise share the same IP).
  app.set("trust proxy", 1);
  app.use(express.json());

  const auth: OperationsRoutesAuth = {
    canAccessClient: () => false,
    getAllowedClientIds: () => null,
  };

  const requireAuthOrToken = (_req: Request, _res: Response, next: NextFunction) => next();
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  mountOperationsRoutes(app, {
    storage: makeMinimalStorage(),
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

// ============ Helpers =========================================================

/** GET /monitor-bootstrap/:screenId with optional X-Forwarded-For override. */
async function bootstrapRequest(
  url: string,
  screenId: string,
  { ip }: { ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (ip) headers["X-Forwarded-For"] = ip;
  return fetch(`${url}/monitor-bootstrap/${screenId}?token=deadbeef`, {
    redirect: "manual",
    headers,
  });
}

// ============ Tests ===========================================================

describe("monitor bootstrap rate limiter", () => {
  // ---- Default limit (10) --------------------------------------------------

  describe("default limit (10 per IP per minute)", () => {
    let url: string;
    let close: () => Promise<void>;

    before(async () => {
      // Ensure no override is in effect
      delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
      const srv = await startServer(makeRateLimitApp());
      url = srv.url;
      close = srv.close;
    });

    after(async () => {
      await close();
    });

    it("requests 1–10 from the same IP are not rate-limited (return 401, not 429)", async () => {
      // All 10 allowed requests should receive a non-429 response.
      // The route returns 401 because no valid bootstrap token is supplied.
      for (let i = 1; i <= 10; i++) {
        const res = await bootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
        assert.notEqual(
          res.status,
          429,
          `Request ${i}: expected non-429 but got 429`,
        );
      }
    });

    it("11th request from the same IP returns 429", async () => {
      // The 10 allowed slots were consumed above. This is the 11th.
      const res = await bootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
      assert.equal(res.status, 429, "11th request should be rate-limited (429)");
    });

    it("429 body has the same shape as 401 (error + message, no extra oracle fields)", async () => {
      // An extra request well beyond the limit to get a stable 429 body.
      const res = await bootstrapRequest(url, "screen-A", { ip: "10.0.0.1" });
      assert.equal(res.status, 429);

      const body = await res.json() as Record<string, unknown>;
      assert.ok("error" in body, "429 body must have an 'error' key");
      assert.ok("message" in body, "429 body must have a 'message' key");
      // Must NOT include status-differentiating fields that would let a caller
      // tell 429 apart from 401 through the body alone.
      assert.ok(!("retryAfter" in body), "429 body must not include retryAfter (oracle)");
      assert.ok(!("limit" in body), "429 body must not expose limit (oracle)");
    });

    it("a different IP is not affected by the first IP's rate limit", async () => {
      // IP 10.0.0.2 has not made any requests yet — should still get 401 not 429.
      const res = await bootstrapRequest(url, "screen-A", { ip: "10.0.0.2" });
      assert.notEqual(res.status, 429, "Fresh IP should not be rate-limited");
    });
  });

  // ---- Configurable limit via env var --------------------------------------

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

    it("requests 1–3 are allowed (env var respected)", async () => {
      for (let i = 1; i <= OVERRIDDEN_MAX; i++) {
        const res = await bootstrapRequest(url, "screen-B", { ip: "10.1.0.1" });
        assert.notEqual(res.status, 429, `Request ${i}: should not be rate-limited`);
      }
    });

    it("4th request is rate-limited when max is overridden to 3", async () => {
      const res = await bootstrapRequest(url, "screen-B", { ip: "10.1.0.1" });
      assert.equal(res.status, 429, `Request ${OVERRIDDEN_MAX + 1}: should be rate-limited`);
    });
  });
});

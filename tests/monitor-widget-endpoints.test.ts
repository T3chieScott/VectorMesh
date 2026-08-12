/**
 * Task #353 — Monitor widget endpoint authentication tests
 *
 * Verifies that the actual production route-registration function
 * (`mountMonitorWidgetRoutes`) wires every one of the 9
 * /api/monitor/widgets/... routes behind the real `requireMonitorSession`
 * auth gate (built from `createRequireMonitorSession`).
 *
 * Strategy: call `mountMonitorWidgetRoutes` — the exact same function used
 * by `registerRoutes` in production — with:
 *   • a real `createRequireMonitorSession(stubStorage)` middleware (so the
 *     auth logic is identical to production, not a copy of it), and
 *   • stub "ok" handlers (we are testing the auth chain, not widget logic).
 *
 * If someone removes `requireMonitorSession` from any route in
 * `mountMonitorWidgetRoutes`, the corresponding 401 test will fail.
 * If someone renames or removes a route, the 200 test for that path will fail.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { Request, Response, AddressInfo } from "express";
import type { Server } from "node:http";

// ── Production code under test ────────────────────────────────────────────────
import {
  createRequireMonitorSession,
  sha256Hex,
  MONITOR_COOKIE_NAME,
  MONITOR_COOKIE_PATH,
} from "../server/operations/index";
import type { OperationsRoutesStorage } from "../server/operations/index";
import {
  mountMonitorWidgetRoutes,
  type MonitorWidgetHandlers,
} from "../server/monitorWidgetRoutes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fully-bootstrapped monitor session. */
function makeValidSession(overrides: Record<string, unknown> = {}) {
  const rawSecret = crypto.randomBytes(32).toString("hex"); // 64-char hex
  const secretHash = sha256Hex(rawSecret);
  const sessionId = `sess-${crypto.randomBytes(6).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 h from now

  const session = {
    id: sessionId,
    userId: "user-001",
    screenId: "screen-001",
    clientId: "client-001",
    tokenHash: sha256Hex("bootstrap-tok"),
    sessionSecretHash: secretHash,
    bootstrapUsedAt: new Date(Date.now() - 5000),
    expiresAt,
    revokedAt: null,
    lastAccessAt: null,
    clientType: "multiview",
    clientName: "VectorMesh Multiview",
    createdAt: new Date(),
    ...overrides,
  };

  return { session, rawSecret, sessionId };
}

/** Minimal stub storage — only `getMonitorSession` is called by validateMonitorCookie. */
function makeStubStorage(
  session: ReturnType<typeof makeValidSession>["session"] | null,
): OperationsRoutesStorage {
  return {
    getMonitorSession: async (id: string) => {
      if (session && id === session.id) return session as any;
      return undefined;
    },
    // Remaining methods satisfy the interface but are never called here.
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
    createMonitorSession: async () => { throw new Error("not used in this test"); },
    getMonitorSessionByTokenHash: async () => undefined,
    consumeMonitorBootstrapToken: async () => null,
    touchMonitorSessionLastAccess: async () => {},
    revokeMonitorSession: async () => false,
    cleanupExpiredMonitorSessions: async () => 0,
    getMonitorSessionsForScreen: async () => [],
  } as any;
}

/** Stub handlers — prove the auth gate let the request through. */
function makeStubHandlers(): MonitorWidgetHandlers {
  const stub = (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  };
  return {
    news: stub,
    weatherForecast: stub,
    heathrowArrivals: stub,
    heathrowDepartures: stub,
    earthquakes: stub,
    aircraftOverhead: stub,
    spacexNextLaunch: stub,
    premierLeagueTable: stub,
    premierLeagueFixtures: stub,
  };
}

/** Cookie header value for the given session + raw secret. */
function buildCookieHeader(sessionId: string, rawSecret: string): string {
  return `${MONITOR_COOKIE_NAME}=${sessionId}:${rawSecret}`;
}

/** Spin up a real Express app via the production mount function, run tests, tear down. */
async function withTestServer(
  storage: OperationsRoutesStorage,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();

  // Use the REAL createRequireMonitorSession — same factory as routes.ts.
  const authMiddleware = createRequireMonitorSession(storage);

  // Use the REAL mountMonitorWidgetRoutes — same function as routes.ts.
  mountMonitorWidgetRoutes(app, authMiddleware, makeStubHandlers());

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((res, rej) =>
      server.close((err) => (err ? rej(err) : res())),
    );
  }
}

// ─── Route list matches production ──────────────────────────────────────────
// Keep this list in sync with mountMonitorWidgetRoutes. If a route is removed
// from the mount function, the 200-path test for that path will fail.
const WIDGET_ROUTES = [
  "/api/monitor/widgets/news",
  "/api/monitor/widgets/weather-forecast",
  "/api/monitor/widgets/heathrow/arrivals",
  "/api/monitor/widgets/heathrow/departures",
  "/api/monitor/widgets/earthquakes/recent",
  "/api/monitor/widgets/aircraft/overhead",
  "/api/monitor/widgets/spacex/next-launch",
  "/api/monitor/widgets/football/premier-league/table",
  "/api/monitor/widgets/football/premier-league/fixtures",
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Monitor widget endpoints — authentication gate (production routes)", () => {
  const { session, rawSecret, sessionId } = makeValidSession();
  const validStorage = makeStubStorage(session);

  it("MONITOR_COOKIE_PATH is '/' (covers both /monitor/* and /api/monitor/*)", () => {
    assert.equal(MONITOR_COOKIE_PATH, "/");
  });

  it("covers all 9 expected routes", () => {
    assert.equal(WIDGET_ROUTES.length, 9);
  });

  // ── Per-route: happy path + rejection ─────────────────────────────────────

  for (const route of WIDGET_ROUTES) {
    describe(route, () => {
      it("200 with valid monitor-session cookie", async () => {
        await withTestServer(validStorage, async (base) => {
          const res = await fetch(`${base}${route}`, {
            headers: { Cookie: buildCookieHeader(sessionId, rawSecret) },
          });
          assert.equal(res.status, 200, `${route}: expected 200 with valid cookie`);
          const body = await res.json() as any;
          assert.equal(body.ok, true);
        });
      });

      it("401 with no cookie", async () => {
        await withTestServer(validStorage, async (base) => {
          const res = await fetch(`${base}${route}`);
          assert.equal(res.status, 401, `${route}: expected 401 with no cookie`);
          const body = await res.json() as any;
          assert.equal(body.error, "Monitor session required");
        });
      });

      it("401 with wrong secret", async () => {
        await withTestServer(validStorage, async (base) => {
          const wrongSecret = "z".repeat(64);
          const res = await fetch(`${base}${route}`, {
            headers: { Cookie: buildCookieHeader(sessionId, wrongSecret) },
          });
          assert.equal(res.status, 401, `${route}: expected 401 with wrong secret`);
        });
      });

      it("401 with unknown session ID", async () => {
        await withTestServer(validStorage, async (base) => {
          const res = await fetch(`${base}${route}`, {
            headers: { Cookie: buildCookieHeader("nonexistent-id", rawSecret) },
          });
          assert.equal(res.status, 401, `${route}: expected 401 for unknown session`);
        });
      });
    });
  }

  // ── Edge cases on session state ────────────────────────────────────────────

  describe("revoked session", () => {
    it("returns 401 on all routes", async () => {
      const { session: rev, rawSecret: rs, sessionId: sid } = makeValidSession({
        revokedAt: new Date(Date.now() - 1000),
      });
      await withTestServer(makeStubStorage(rev), async (base) => {
        for (const route of WIDGET_ROUTES) {
          const res = await fetch(`${base}${route}`, {
            headers: { Cookie: buildCookieHeader(sid, rs) },
          });
          assert.equal(res.status, 401, `${route}: revoked session must be rejected`);
        }
      });
    });
  });

  describe("expired session", () => {
    it("returns 401 on all routes", async () => {
      const { session: exp, rawSecret: rs, sessionId: sid } = makeValidSession({
        expiresAt: new Date(Date.now() - 1),
      });
      await withTestServer(makeStubStorage(exp), async (base) => {
        for (const route of WIDGET_ROUTES) {
          const res = await fetch(`${base}${route}`, {
            headers: { Cookie: buildCookieHeader(sid, rs) },
          });
          assert.equal(res.status, 401, `${route}: expired session must be rejected`);
        }
      });
    });
  });

  describe("bootstrap not completed (no sessionSecretHash)", () => {
    it("returns 401 on widget routes", async () => {
      const { session: pre, rawSecret: rs, sessionId: sid } = makeValidSession({
        sessionSecretHash: null,
        bootstrapUsedAt: null,
      });
      await withTestServer(makeStubStorage(pre), async (base) => {
        const res = await fetch(`${base}${WIDGET_ROUTES[0]}`, {
          headers: { Cookie: buildCookieHeader(sid, rs) },
        });
        assert.equal(res.status, 401, "pre-bootstrap session must be rejected");
      });
    });
  });

  // ── Batch smoke-test ───────────────────────────────────────────────────────

  describe("all 9 routes batch check", () => {
    it("every route returns 200 with valid cookie", async () => {
      await withTestServer(validStorage, async (base) => {
        const results = await Promise.all(
          WIDGET_ROUTES.map(async (route) => {
            const res = await fetch(`${base}${route}`, {
              headers: { Cookie: buildCookieHeader(sessionId, rawSecret) },
            });
            return { route, status: res.status };
          }),
        );
        for (const { route, status } of results) {
          assert.equal(status, 200, `${route}: expected 200`);
        }
      });
    });

    it("every route returns 401 without a cookie", async () => {
      await withTestServer(validStorage, async (base) => {
        const results = await Promise.all(
          WIDGET_ROUTES.map(async (route) => {
            const res = await fetch(`${base}${route}`);
            return { route, status: res.status };
          }),
        );
        for (const { route, status } of results) {
          assert.equal(status, 401, `${route}: expected 401`);
        }
      });
    });
  });
});

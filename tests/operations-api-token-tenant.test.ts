/**
 * Task #345 — Fix Operations API tenant visibility for API tokens
 *
 * Root cause:
 *   resolveEffectiveClientIds previously had a bearer-token split that called
 *   st.getUserClientIds(user.id) for all token requests. Admin users have no
 *   user_sites rows, so admin-owned tokens received [] and all Operations
 *   endpoints returned empty/403 despite the same token working on /api/screens.
 *
 * Fix:
 *   resolveEffectiveClientIds now always uses auth.getAllowedClientIds(req),
 *   which reads req.allowedClientIds set by loadUserContext — the same
 *   role-aware value used by /api/screens and all other token-enabled routes.
 *
 * These tests exercise:
 *   1. Admin-owned token receives its tenant's projects (not empty)
 *   2. Admin-owned token walks the full project → venue → screen chain
 *   3. Admin-owned token can create a monitor session
 *   4. Cross-tenant token is denied on projects, venues, and screens
 *   5. Removing operations.view causes /projects to return 403
 *   6. Removing operations.multiview causes monitor-session creation to return 403
 *   7. Session-user path (admin) continues to work
 *   8. Session-user path (non-admin with explicit user_sites) continues to work
 *   9. Non-admin token with explicit user_sites sees only its own clients
 */

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:dist/net";
import type { Request, Response, NextFunction } from "express";
import {
  mountOperationsRoutes,
  OPERATIONS_SCOPES,
} from "../server/operations/index";
import type {
  Client,
  Event,
  ScreenGroup,
  Screen,
  DisplayProfile,
  MonitorSession,
  InsertMonitorSession,
} from "../shared/schema";

// ── Stub helpers ──────────────────────────────────────────────────────────

type RoleType = "admin" | "account_manager" | "site_user";

interface FakeUser { id: string; role: RoleType }
interface FakeToken { id: string; userId: string }

function makeClient(id: string, name = `Client ${id}`): Client {
  return {
    id,
    name,
    status: "active",
    startDate: null,
    endDate: null,
    timezone: "UTC",
    logoUrl: null,
    themeColor: null,
    createdAt: new Date(),
  } as unknown as Client;
}

function makeGroup(id: string, clientId: string): ScreenGroup {
  return {
    id,
    name: `Group ${id}`,
    clientId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ScreenGroup;
}

function makeScreen(id: string, clientId: string, groupId: string): Screen {
  return {
    id,
    name: `Screen ${id}`,
    clientId,
    groupId,
    displayProfileId: null,
    deviceToken: null,
    pairingCode: null,
    isOnline: false,
    lastSeen: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Screen;
}

function makeSession(id: string, screenId: string, clientId: string): MonitorSession {
  return {
    id,
    screenId,
    clientId,
    userId: "user-admin",
    tokenHash: "hash",
    sessionSecretHash: null,
    bootstrapUsedAt: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    lastAccessAt: null,
    createdAt: new Date(),
    clientType: "multiview",
    clientName: null,
  } as unknown as MonitorSession;
}

interface StorageInit {
  clients?: Client[];
  events?: Event[];
  groups?: ScreenGroup[];
  screens?: Screen[];
  tokenScopes?: Record<string, string[]>;    // tokenId → scopes
  userClientIds?: Record<string, string[]>;  // userId → clientIds
}

function makeStorage(init: StorageInit) {
  const sessions: MonitorSession[] = [];
  return {
    getClients: async () => init.clients ?? [],
    getClient: async (id: string) => (init.clients ?? []).find(c => c.id === id),
    getEvents: async () => init.events ?? [],
    getScreenGroups: async () => init.groups ?? [],
    getScreenGroupsWithMemberCounts: async () =>
      (init.groups ?? []).map(g => ({ ...g, memberCount: (init.screens ?? []).filter(s => s.groupId === g.id).length })),
    getScreenGroup: async (id: string) => (init.groups ?? []).find(g => g.id === id),
    getGroupMembers: async (groupId: string) =>
      (init.screens ?? []).filter(s => s.groupId === groupId),
    getScreen: async (id: string) => (init.screens ?? []).find(s => s.id === id),
    getDisplayProfile: async (_id: string): Promise<DisplayProfile | undefined> => undefined,
    getUserClientIds: async (userId: string) => (init.userClientIds ?? {})[userId] ?? [],
    getOperationsScopesForUser: async (_userId: string) => [],
    getOperationsScopesForToken: async (tokenId: string) =>
      (init.tokenScopes ?? {})[tokenId] ?? [],
    createMonitorSession: async (data: InsertMonitorSession): Promise<MonitorSession> => {
      const s = makeSession(`sess-${sessions.length + 1}`, data.screenId, data.clientId ?? "");
      sessions.push(s);
      return s;
    },
    getMonitorSession: async (id: string) => sessions.find(s => s.id === id),
    getMonitorSessionByTokenHash: async (_hash: string) => undefined,
    consumeMonitorBootstrapToken: async () => null,
    revokeMonitorSession: async () => false,
    getMonitorSessionsForScreen: async (_screenId: string) => [],
    cleanupExpiredMonitorSessions: async (_before: Date) => 0,
    sessions, // expose for assertions
  };
}

/** Mount operations routes on a throwaway Express app with injected auth context. */
function makeApp(opts: {
  user: FakeUser | null;
  token: FakeToken | null;
  /** allowedClientIds for this user: null = admin (unrestricted), string[] = scoped */
  allowedClientIds: string[] | null;
  storage: ReturnType<typeof makeStorage>;
}) {
  const app = express();
  app.use(express.json());

  // Inject auth context (simulates requireAuthOrToken + loadUserContext)
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.dbUser = opts.user;
    req.apiToken = opts.token;
    req.allowedClientIds = opts.allowedClientIds;
    next();
  });

  const requireAuthOrToken = (req: any, res: Response, next: NextFunction) => {
    if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
    next();
  };
  const loadUserContext = (_req: any, _res: Response, next: NextFunction) => next(); // already set above

  mountOperationsRoutes(app, {
    storage: opts.storage as any,
    auth: {
      canAccessClient: (req: any, clientId: string) => {
        const ids: string[] | null = req.allowedClientIds;
        if (ids === null) return true;
        return ids.includes(clientId);
      },
      getAllowedClientIds: (req: any) => req.allowedClientIds,
    },
    requireAuthOrToken,
    loadUserContext,
    monitor: {
      resolveMonitorContent: async () => ({}),
      getPublicBaseUrl: () => "https://example.com",
      logAudit: () => {},
      serveMediaFile: async () => {},
    } as any,
  });

  return app;
}

async function httpReq(
  app: ReturnType<typeof makeApp>,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const url = `http://127.0.0.1:${port}${path}`;
      fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
        .then(async r => {
          let parsed: unknown;
          try { parsed = await r.json(); } catch { parsed = null; }
          resolve({ status: r.status, body: parsed });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const clientA = makeClient("client-a", "Acme");
const clientB = makeClient("client-b", "Rival Corp");
const groupA = makeGroup("group-a", "client-a");
const groupB = makeGroup("group-b", "client-b");
const screenA = makeScreen("screen-a", "client-a", "group-a");
const screenB = makeScreen("screen-b", "client-b", "group-b");

const adminUser: FakeUser = { id: "user-admin", role: "admin" };
const siteUser: FakeUser = { id: "user-site", role: "site_user" };
const adminToken: FakeToken = { id: "tok-admin", userId: "user-admin" };
const siteToken: FakeToken = { id: "tok-site", userId: "user-site" };

// ── 1. Admin-owned token receives projects ────────────────────────────────

describe("Admin-owned token — /api/operations/projects", () => {
  it("returns projects when token has operations.view (not empty [])", async () => {
    const storage = makeStorage({
      clients: [clientA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp({
      user: adminUser,
      token: adminToken,
      allowedClientIds: null, // admin = unrestricted
      storage,
    });
    const { status, body } = await httpReq(app, "GET", "/api/operations/projects");
    assert.equal(status, 200);
    const projects = body as Array<{ id: string }>;
    assert.ok(Array.isArray(projects), "body should be an array");
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, "client-a");
  });

  it("returns 403 when token lacks operations.view", async () => {
    const storage = makeStorage({
      clients: [clientA],
      tokenScopes: { "tok-admin": [] }, // no scope
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status } = await httpReq(app, "GET", "/api/operations/projects");
    assert.equal(status, 403);
  });
});

// ── 2. Admin-owned token — full chain ────────────────────────────────────

describe("Admin-owned token — project → venue → screen chain", () => {
  it("GET /api/operations/projects/:id/venues returns venues", async () => {
    const storage = makeStorage({
      clients: [clientA],
      groups: [groupA],
      screens: [screenA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status, body } = await httpReq(app, "GET", "/api/operations/projects/client-a/venues");
    assert.equal(status, 200);
    const venues = body as Array<{ id: string }>;
    assert.equal(venues.length, 1);
    assert.equal(venues[0].id, "group-a");
  });

  it("GET /api/operations/venues/:id/screens returns screens", async () => {
    const storage = makeStorage({
      clients: [clientA],
      groups: [groupA],
      screens: [screenA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.SCREEN_READ] },
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status, body } = await httpReq(app, "GET", "/api/operations/venues/group-a/screens");
    assert.equal(status, 200);
    const screens = body as Array<{ id: string }>;
    assert.equal(screens.length, 1);
    assert.equal(screens[0].id, "screen-a");
  });

  it("GET /api/operations/screens/:id returns screen summary", async () => {
    const storage = makeStorage({
      clients: [clientA],
      screens: [screenA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.SCREEN_READ] },
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status, body } = await httpReq(app, "GET", "/api/operations/screens/screen-a");
    assert.equal(status, 200);
    assert.equal((body as any).id, "screen-a");
  });
});

// ── 3. Admin-owned token — monitor session creation ───────────────────────

describe("Admin-owned token — monitor-session creation", () => {
  it("POST /api/operations/screens/:id/monitor-session returns 201 with monitorUrl", async () => {
    const storage = makeStorage({
      clients: [clientA],
      screens: [screenA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.MULTIVIEW] },
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status, body } = await httpReq(
      app, "POST", "/api/operations/screens/screen-a/monitor-session",
      { clientType: "multiview" },
    );
    assert.equal(status, 201);
    assert.ok((body as any).monitorUrl, "monitorUrl should be present");
    assert.ok((body as any).monitorSessionId, "monitorSessionId should be present");
  });

  it("returns 403 when token lacks operations.multiview", async () => {
    const storage = makeStorage({
      clients: [clientA],
      screens: [screenA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.VIEW] }, // view but not multiview
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status } = await httpReq(
      app, "POST", "/api/operations/screens/screen-a/monitor-session", {},
    );
    assert.equal(status, 403);
  });
});

// ── 4. Cross-tenant denial ────────────────────────────────────────────────

describe("Cross-tenant denial — scoped token cannot access other tenant", () => {
  it("GET /projects/:id/venues for wrong client returns 403", async () => {
    // siteToken has access only to client-a, tries to access client-b
    const storage = makeStorage({
      clients: [clientA, clientB],
      groups: [groupA, groupB],
      tokenScopes: { "tok-site": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp({
      user: siteUser,
      token: siteToken,
      allowedClientIds: ["client-a"], // siteUser only has client-a
      storage,
    });
    const { status } = await httpReq(app, "GET", "/api/operations/projects/client-b/venues");
    assert.equal(status, 403);
  });

  it("GET /venues/:id/screens for wrong tenant venue returns 403", async () => {
    const storage = makeStorage({
      clients: [clientA, clientB],
      groups: [groupA, groupB],
      screens: [screenA, screenB],
      tokenScopes: { "tok-site": [OPERATIONS_SCOPES.SCREEN_READ] },
    });
    const app = makeApp({
      user: siteUser,
      token: siteToken,
      allowedClientIds: ["client-a"],
      storage,
    });
    const { status } = await httpReq(app, "GET", "/api/operations/venues/group-b/screens");
    assert.equal(status, 403);
  });

  it("GET /screens/:id for wrong tenant screen returns 403", async () => {
    const storage = makeStorage({
      clients: [clientA, clientB],
      screens: [screenA, screenB],
      tokenScopes: { "tok-site": [OPERATIONS_SCOPES.SCREEN_READ] },
    });
    const app = makeApp({
      user: siteUser,
      token: siteToken,
      allowedClientIds: ["client-a"],
      storage,
    });
    const { status } = await httpReq(app, "GET", "/api/operations/screens/screen-b");
    assert.equal(status, 403);
  });

  it("POST monitor-session for wrong tenant screen returns 403", async () => {
    const storage = makeStorage({
      clients: [clientA, clientB],
      screens: [screenA, screenB],
      tokenScopes: { "tok-site": [OPERATIONS_SCOPES.MULTIVIEW] },
    });
    const app = makeApp({
      user: siteUser,
      token: siteToken,
      allowedClientIds: ["client-a"],
      storage,
    });
    const { status } = await httpReq(
      app, "POST", "/api/operations/screens/screen-b/monitor-session", {},
    );
    assert.equal(status, 403);
  });

  it("scoped token still sees its own client in /projects", async () => {
    const storage = makeStorage({
      clients: [clientA, clientB],
      tokenScopes: { "tok-site": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp({
      user: siteUser,
      token: siteToken,
      allowedClientIds: ["client-a"],
      storage,
    });
    const { status, body } = await httpReq(app, "GET", "/api/operations/projects");
    assert.equal(status, 200);
    const projects = body as Array<{ id: string }>;
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, "client-a");
  });
});

// ── 5. Scope removal still enforced ──────────────────────────────────────

describe("Scope enforcement after scope removal", () => {
  it("operations.view removed → /projects returns 403", async () => {
    const storage = makeStorage({
      clients: [clientA],
      tokenScopes: { "tok-admin": [] }, // scope revoked
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status } = await httpReq(app, "GET", "/api/operations/projects");
    assert.equal(status, 403);
  });

  it("operations.multiview removed → monitor-session returns 403", async () => {
    const storage = makeStorage({
      clients: [clientA],
      screens: [screenA],
      tokenScopes: { "tok-admin": [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.SCREEN_READ] }, // multiview removed
    });
    const app = makeApp({ user: adminUser, token: adminToken, allowedClientIds: null, storage });
    const { status } = await httpReq(
      app, "POST", "/api/operations/screens/screen-a/monitor-session", {},
    );
    assert.equal(status, 403);
  });
});

// ── 6. Session-user path unchanged ────────────────────────────────────────

describe("Session-user path — behaviour unchanged", () => {
  it("admin session (no token) sees all projects", async () => {
    const storage = makeStorage({ clients: [clientA, clientB] });
    const app = makeApp({
      user: adminUser,
      token: null, // session, not bearer token
      allowedClientIds: null, // admin
      storage,
    });
    const { status, body } = await httpReq(app, "GET", "/api/operations/projects");
    assert.equal(status, 200);
    // admin session: scope check for admin implicitly passes, sees all clients
    const projects = body as Array<{ id: string }>;
    assert.equal(projects.length, 2);
  });

  it("account_manager session with explicit client list sees only assigned projects", async () => {
    // account_managers pass scope checks implicitly (no explicit scope row needed)
    const amUser: FakeUser = { id: "user-am", role: "account_manager" };
    const storage = makeStorage({
      clients: [clientA, clientB],
      // allowedClientIds is set to ["client-a"] in makeApp below
    });
    const app = makeApp({
      user: amUser,
      token: null, // session
      allowedClientIds: ["client-a"],
      storage,
    });
    const { status, body } = await httpReq(app, "GET", "/api/operations/projects");
    assert.equal(status, 200);
    const projects = body as Array<{ id: string }>;
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, "client-a");
  });
});

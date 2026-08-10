/**
 * Task #329 — Display Operations API unit tests.
 *
 * Tests the /api/operations/ route handlers against a stub storage and
 * injectable current-user, following the pattern established in
 * tests/agenda-routes-tenant-scoping.test.ts.  No real DB or session
 * flow is required.
 */

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountOperationsRoutes,
  OPERATIONS_SCOPES,
  type OperationsRoutesStorage,
  type OperationsRoutesAuth,
} from "../server/operations/index";
import type { Client, Event, ScreenGroup, Screen, DisplayProfile } from "../shared/schema";

// ============ Fake user / auth helpers ============

interface FakeUser {
  id: string;
  role: "admin" | "account_manager" | "site_user";
}

function makeAuthMiddleware(user: FakeUser | null, allowedClientIds: string[] | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbUser = user;
    (req as any).allowedClientIds = allowedClientIds;
    (req as any).apiToken = null;
    next();
  };
}

// ============ Seed data helpers ============

function makeClient(id: string, name = `Client ${id}`): Client {
  return {
    id,
    name,
    description: null,
    logoUrl: null,
    locked: false,
    maxUploadSizeMb: 100,
    timezone: "Europe/London",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

function makeEvent(id: string, clientId: string, opts: Partial<Event> = {}): Event {
  return {
    id,
    clientId,
    name: `Event ${id}`,
    description: null,
    startDate: new Date("2026-08-10"),
    endDate: new Date("2026-08-14"),
    isActive: true,
    colorPalette: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...opts,
  };
}

function makeScreenGroup(
  id: string,
  clientId: string,
  name = `Group ${id}`,
): ScreenGroup {
  return {
    id,
    clientId,
    name,
    description: null,
    createdAt: new Date("2024-01-01"),
  };
}

function makeScreen(id: string, clientId: string, opts: Partial<Screen> = {}): Screen {
  return {
    id,
    clientId,
    name: `Screen ${id}`,
    location: null,
    timezone: null,
    displayProfileId: null,
    pairingCode: "ABC123",
    kioskModeEnabled: false,
    deviceToken: "super-secret-device-token",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-10T14:00:00Z"),
    ipAddress: "192.168.1.10",
    hostname: "vm-screen-001",
    hardwareClass: "raspberry-pi-4",
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasWidth: null,
    canvasHeight: null,
    canvasX: 0,
    canvasY: 0,
    canvasGroupId: null,
    locked: false,
    screenshotEnabled: false,
    lastScreenshot: null,
    lastScreenshotAt: null,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    roomCapacity: null,
    weatherLat: null,
    weatherLng: null,
    weatherPlaceName: null,
    weatherUnit: "celsius",
    displayOrder: null,
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
    videoStatsLastReloadAt: null,
    videoStatsUpdatedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...opts,
  };
}

function makeDisplayProfile(id: string, width = 1920, height = 1080): DisplayProfile {
  return {
    id,
    clientId: null,
    name: `Profile ${id}`,
    width,
    height,
    orientation: "landscape",
    safePadding: 0,
    screenType: "standard",
    refreshRate: 60,
    createdAt: new Date("2024-01-01"),
  };
}

// ============ Fake storage factory ============

function makeFakeStorage(seed: {
  clients?: Client[];
  events?: Event[];
  groups?: (ScreenGroup & { memberCount: number })[];
  screens?: Screen[];
  profiles?: DisplayProfile[];
  userScopes?: Record<string, string[]>;
  tokenScopes?: Record<string, string[]>;
  /** Explicit per-user DB client grants used by bearer-token tenant isolation. Default: empty. */
  userClientIds?: Record<string, string[]>;
}): OperationsRoutesStorage {
  const clients = seed.clients ?? [];
  const events = seed.events ?? [];
  const groups = seed.groups ?? [];
  const screens = seed.screens ?? [];
  const profiles = seed.profiles ?? [];
  const userScopes = seed.userScopes ?? {};
  const tokenScopes = seed.tokenScopes ?? {};
  const userClientIds = seed.userClientIds ?? {};

  return {
    async getClients() { return clients; },
    async getClient(id) { return clients.find((c) => c.id === id); },
    // Returns only explicit DB grants — never based on role.
    // The test can pass userClientIds to simulate grants; otherwise returns [].
    async getUserClientIds(userId) { return userClientIds[userId] ?? []; },
    async getEvents() { return events; },
    async getScreenGroups() { return groups; },
    async getScreenGroupsWithMemberCounts() { return groups; },
    async getScreenGroup(id) { return groups.find((g) => g.id === id); },
    async getGroupMembers(groupId) {
      return screens.filter((s) =>
        // In fake storage, we encode membership via a convention
        (s as any)._groupId === groupId,
      );
    },
    async getScreen(id) { return screens.find((s) => s.id === id); },
    async getDisplayProfile(id) { return profiles.find((p) => p.id === id); },
    async getOperationsScopesForUser(userId) { return userScopes[userId] ?? []; },
    async getOperationsScopesForToken(tokenId) { return tokenScopes[tokenId] ?? []; },
  };
}

// ============ App factory ============

function makeApp(
  storage: OperationsRoutesStorage,
  user: FakeUser | null,
  allowedClientIds: string[] | null,
  apiToken: { id: string } | null = null,
) {
  const app = express();
  app.use(express.json());

  // Inject fake auth
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbUser = user;
    (req as any).allowedClientIds = allowedClientIds;
    (req as any).apiToken = apiToken;
    next();
  });

  const auth: OperationsRoutesAuth = {
    canAccessClient: (req, clientId) => {
      const allowed = (req as any).allowedClientIds as string[] | null;
      if (allowed === null) return true; // admin
      return allowed.includes(clientId);
    },
    getAllowedClientIds: (req) => (req as any).allowedClientIds,
  };

  // Fake requireAuthOrToken — already injected above, just check user present
  const requireAuthOrToken = (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).dbUser) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHENTICATED" });
    next();
  };

  // Fake loadUserContext — no-op (user already on req)
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  mountOperationsRoutes(app, { storage, auth, requireAuthOrToken, loadUserContext });
  return app;
}

async function startServer(app: ReturnType<typeof express>) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

// ============================================================
// Tests
// ============================================================

// ---- Auth / unauthenticated ----

test("GET /api/operations/projects — unauthenticated → 401", async () => {
  const storage = makeFakeStorage({ clients: [makeClient("c1")] });
  const app = makeApp(storage, null, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/venues — unauthenticated → 401", async () => {
  const storage = makeFakeStorage({});
  const app = makeApp(storage, null, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/venues`);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test("GET /api/operations/venues/:id/screens — unauthenticated → 401", async () => {
  const storage = makeFakeStorage({});
  const app = makeApp(storage, null, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/venues/v1/screens`);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

// ---- Scope enforcement ----

test("site_user without operations scope → 403", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    userScopes: {}, // no scopes granted
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 403);
    const body = await res.json() as any;
    assert.equal(body.code, "FORBIDDEN");
  } finally {
    await close();
  }
});

test("site_user with operations.view scope → 200 on /projects", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [makeEvent("e1", "c1")],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test("admin implicitly passes scope check without DB rows", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    userScopes: {}, // no explicit scopes
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null); // admin → null allowed list
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test("account_manager implicitly passes scope check", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-am", role: "account_manager" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

// ---- Projects endpoint ----

test("GET /api/operations/projects — returns only accessible projects", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1", "Alpha"), makeClient("c2", "Beta")],
    events: [makeEvent("e1", "c1")],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  // user can only access c1
  const app = makeApp(storage, user, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "c1");
    assert.equal(body[0].name, "Alpha");
    // Internal terminology must not leak
    for (const key of Object.keys(body[0])) {
      assert.ok(!key.toLowerCase().includes("client"), `Leaked internal name in key: ${key}`);
    }
  } finally {
    await close();
  }
});

test("GET /api/operations/projects — admin sees all projects", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1"), makeClient("c2")],
    events: [],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 2);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects — active event produces status:active", async () => {
  const now = new Date();
  const start = new Date(now.getTime() - 86400000); // yesterday
  const end = new Date(now.getTime() + 86400000);   // tomorrow
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [makeEvent("e1", "c1", { startDate: start, endDate: end, isActive: true })],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    const body = await res.json() as any[];
    assert.equal(body[0].status, "active");
    assert.ok(body[0].startDate !== null);
    assert.ok(body[0].endDate !== null);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects — no events → status:unscheduled", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    const body = await res.json() as any[];
    assert.equal(body[0].status, "unscheduled");
    assert.equal(body[0].startDate, null);
  } finally {
    await close();
  }
});

// ---- Venues endpoint ----

test("GET /api/operations/projects/:id/venues — wrong tenant → 403", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1"), makeClient("c2")],
    events: [],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  // user can only access c1, asks for c2's venues
  const app = makeApp(storage, user, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c2/venues`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/venues — unknown project → 404", async () => {
  const storage = makeFakeStorage({
    clients: [],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/nonexistent/venues`);
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/venues — returns venues with screenCount", async () => {
  const group: ScreenGroup & { memberCount: number } = {
    ...makeScreenGroup("g1", "c1", "Hall 1"),
    memberCount: 18,
  };
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    groups: [group],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/venues`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "g1");
    assert.equal(body[0].name, "Hall 1");
    assert.equal(body[0].screenCount, 18);
    // Internal terminology must not leak
    for (const key of Object.keys(body[0])) {
      assert.ok(!key.toLowerCase().includes("group"), `Leaked internal name in key: ${key}`);
      assert.ok(!key.toLowerCase().includes("client"), `Leaked internal name in key: ${key}`);
    }
  } finally {
    await close();
  }
});

// ---- Screens endpoint ----

test("GET /api/operations/venues/:id/screens — wrong tenant → 403", async () => {
  const group: ScreenGroup & { memberCount: number } = {
    ...makeScreenGroup("g2", "c2"),
    memberCount: 0,
  };
  const storage = makeFakeStorage({
    clients: [makeClient("c1"), makeClient("c2")],
    groups: [group],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.SCREEN_READ] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]); // user cannot access c2
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/venues/g2/screens`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test("GET /api/operations/venues/:id/screens — missing scope → 403", async () => {
  const group: ScreenGroup & { memberCount: number } = {
    ...makeScreenGroup("g1", "c1"),
    memberCount: 0,
  };
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    groups: [group],
    // user has VIEW but not SCREEN_READ
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/venues/g1/screens`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test("GET /api/operations/venues/:id/screens — deviceToken absent from response", async () => {
  const screen = makeScreen("s1", "c1", { displayProfileId: "dp1" });
  (screen as any)._groupId = "g1"; // membership convention for fake storage
  const profile = makeDisplayProfile("dp1", 1920, 1080);
  const group: ScreenGroup & { memberCount: number } = {
    ...makeScreenGroup("g1", "c1"),
    memberCount: 1,
  };
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    groups: [group],
    screens: [screen],
    profiles: [profile],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/venues/g1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 1);
    const s = body[0];
    // Credential fields must be absent
    assert.ok(!("deviceToken" in s), "deviceToken must not appear in response");
    assert.ok(!("pairingCode" in s), "pairingCode must not appear in response");
    assert.ok(!("kioskModeEnabled" in s), "kioskModeEnabled must not appear in response");
    // Safe fields must be present
    assert.equal(s.id, "s1");
    assert.equal(s.status.online, true);
    assert.equal(s.display.width, 1920);
    assert.equal(s.display.height, 1080);
    assert.equal(s.player.hostname, "vm-screen-001");
    assert.equal(s.player.ipAddress, "192.168.1.10");
    assert.equal(s.player.hardwareClass, "raspberry-pi-4");
  } finally {
    await close();
  }
});

// ---- Screen summary endpoint ----

test("GET /api/operations/screens/:id — unknown screen → 404", async () => {
  const storage = makeFakeStorage({ userScopes: {} });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/screens/nonexistent`);
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test("GET /api/operations/screens/:id — wrong tenant → 403", async () => {
  const screen = makeScreen("s1", "c2");
  const storage = makeFakeStorage({
    clients: [makeClient("c1"), makeClient("c2")],
    screens: [screen],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.SCREEN_READ] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]); // user cannot access c2
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/screens/s1`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test("GET /api/operations/screens/:id — deviceToken absent, safe fields present", async () => {
  const screen = makeScreen("s1", "c1", { displayProfileId: "dp1" });
  const profile = makeDisplayProfile("dp1", 3840, 2160);
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    screens: [screen],
    profiles: [profile],
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/screens/s1`);
    assert.equal(res.status, 200);
    const s = await res.json() as any;
    assert.ok(!("deviceToken" in s));
    assert.ok(!("pairingCode" in s));
    assert.equal(s.id, "s1");
    assert.equal(s.display.width, 3840);
    assert.equal(s.display.height, 2160);
    assert.equal(s.status.online, true);
    assert.ok(s.status.lastHeartbeat !== undefined);
  } finally {
    await close();
  }
});

// ---- Null-clientId fail-closed (unowned resources) ----

test("GET /api/operations/venues/:id/screens — null clientId denies site_user (fail-closed)", async () => {
  // Group has no tenant owner (clientId = null)
  const group: ScreenGroup & { memberCount: number } = {
    id: "g-orphan",
    clientId: null,
    name: "Orphan Group",
    description: null,
    createdAt: new Date(),
    memberCount: 0,
  };
  const storage = makeFakeStorage({
    groups: [group],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.SCREEN_READ] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]); // site_user: allowedClientIds is non-null
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/venues/g-orphan/screens`);
    assert.equal(res.status, 403, "site_user must not access unowned venue");
  } finally {
    await close();
  }
});

test("GET /api/operations/venues/:id/screens — null clientId allows admin (fail-closed for non-admins only)", async () => {
  const group: ScreenGroup & { memberCount: number } = {
    id: "g-orphan",
    clientId: null,
    name: "Orphan Group",
    description: null,
    createdAt: new Date(),
    memberCount: 0,
  };
  const storage = makeFakeStorage({ groups: [group], userScopes: {} });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null); // admin: allowedClientIds is null
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/venues/g-orphan/screens`);
    assert.equal(res.status, 200, "admin should access unowned venue");
  } finally {
    await close();
  }
});

test("GET /api/operations/screens/:id — null clientId denies site_user (fail-closed)", async () => {
  const screen = makeScreen("s-orphan", "placeholder");
  // Override clientId to null
  (screen as any).clientId = null;
  const storage = makeFakeStorage({
    screens: [screen],
    userScopes: { u1: [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.SCREEN_READ] },
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/screens/s-orphan`);
    assert.equal(res.status, 403, "site_user must not access unowned screen");
  } finally {
    await close();
  }
});

test("GET /api/operations/screens/:id — null clientId allows admin (fail-closed for non-admins only)", async () => {
  const screen = makeScreen("s-orphan", "placeholder");
  (screen as any).clientId = null;
  const storage = makeFakeStorage({ screens: [screen], userScopes: {} });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/screens/s-orphan`);
    assert.equal(res.status, 200, "admin should access unowned screen");
  } finally {
    await close();
  }
});

// ---- API-token-based access ----

test("API token with operations scope passes scope check", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    tokenScopes: { "tok-1": [OPERATIONS_SCOPES.VIEW] },
    userScopes: {},
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  // simulate isAuthenticatedOrToken having resolved the token
  const app = makeApp(storage, user, ["c1"], { id: "tok-1" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test("API token without operations scope → 403", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    tokenScopes: {}, // no scopes
    userScopes: {},
  });
  const user: FakeUser = { id: "u1", role: "site_user" };
  const app = makeApp(storage, user, ["c1"], { id: "tok-noscope" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

// ---- Bearer tokens never inherit owner's elevated role ----
// Even admin/account_manager-owned tokens require explicit token_operations_scopes.

test("Admin-owned API token WITHOUT scope grant → 403 (no role bypass for tokens)", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    tokenScopes: {}, // no grant on the token
    userScopes: {},
  });
  // Owner is admin but token has no grant
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null, { id: "tok-admin-nogrant" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 403, "admin-owned token without scope must be denied");
    const body = await res.json() as any;
    assert.equal(body.code, "FORBIDDEN");
  } finally {
    await close();
  }
});

test("Account-manager-owned API token WITHOUT scope grant → 403 (no role bypass for tokens)", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    tokenScopes: {},
    userScopes: {},
  });
  const user: FakeUser = { id: "u-am", role: "account_manager" };
  const app = makeApp(storage, user, null, { id: "tok-am-nogrant" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 403, "account_manager-owned token without scope must be denied");
  } finally {
    await close();
  }
});

test("Admin-owned API token WITH scope grant → 200", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    events: [],
    tokenScopes: { "tok-admin-granted": [OPERATIONS_SCOPES.VIEW] },
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  const app = makeApp(storage, user, null, { id: "tok-admin-granted" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects`);
    assert.equal(res.status, 200, "admin-owned token with explicit grant must succeed");
  } finally {
    await close();
  }
});

// ---- Token tenant isolation — admin-owned tokens inherit role-based access ----
// The Operations API now uses auth.getAllowedClientIds(req) for all requests
// (session and bearer-token alike), matching /api/screens behaviour.  An
// admin-owned token therefore inherits allowedClientIds=null (unrestricted)
// from loadUserContext, just as an admin session does.

test("Admin-owned token with scope → 200 on /projects/:id/venues (admin = unrestricted)", async () => {
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    groups: [{ ...makeScreenGroup("g1", "c1"), memberCount: 0 }],
    tokenScopes: { "tok-admin-granted": [OPERATIONS_SCOPES.VIEW] },
    userScopes: {},
  });
  const user: FakeUser = { id: "u-admin", role: "admin" };
  // allowedClientIds=null mirrors what loadUserContext sets for admin callers;
  // the Operations API must honour this regardless of whether a token is present.
  const app = makeApp(storage, user, null, { id: "tok-admin-granted" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/venues`);
    assert.equal(
      res.status,
      200,
      "Admin-owned token must access tenant venues via role-based allowedClientIds=null",
    );
  } finally {
    await close();
  }
});

test("Non-admin token scoped to a client → 200 on /projects/:id/venues for that client", async () => {
  const group: ScreenGroup & { memberCount: number } = {
    ...makeScreenGroup("g1", "c1"),
    memberCount: 3,
  };
  // site_user token is scoped to c1 via allowedClientIds (what loadUserContext returns)
  const storage = makeFakeStorage({
    clients: [makeClient("c1")],
    groups: [group],
    tokenScopes: { "tok-site": [OPERATIONS_SCOPES.VIEW] },
    userScopes: {},
  });
  const user: FakeUser = { id: "u-site", role: "site_user" };
  const app = makeApp(storage, user, ["c1"], { id: "tok-site" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/venues`);
    assert.equal(res.status, 200, "Scoped token for c1 must access c1 venues");
  } finally {
    await close();
  }
});

/**
 * Tests for GET /api/operations/projects/:projectId/screens
 *
 * The endpoint returns every screen belonging to a project, regardless of group
 * membership.  Each screen item carries a `groups` array (empty = ungrouped).
 * Scope required: operations.screen.read
 * Credentials (deviceToken, pairingCode) must never appear in the response.
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

// ── Seed helpers ─────────────────────────────────────────────────────────────

function makeClient(id: string): Client {
  return {
    id,
    name: `Client ${id}`,
    description: null,
    logoUrl: null,
    locked: false,
    maxUploadSizeMb: 100,
    timezone: "Europe/London",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

function makeGroup(id: string, clientId: string, name = `Group ${id}`): ScreenGroup {
  return { id, clientId, name, description: null, createdAt: new Date("2024-01-01") };
}

function makeScreen(id: string, clientId: string, opts: Partial<Screen> = {}): Screen {
  return {
    id,
    clientId,
    name: `Screen ${id}`,
    location: null,
    timezone: null,
    displayProfileId: null,
    pairingCode: "SECRET-PAIR",
    kioskModeEnabled: false,
    deviceToken: "super-secret-device-token",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-10T14:00:00Z"),
    ipAddress: "192.168.1.10",
    hostname: `host-${id}`,
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

function makeProfile(id: string, w = 1920, h = 1080): DisplayProfile {
  return {
    id,
    clientId: null,
    name: `Profile ${id}`,
    width: w,
    height: h,
    orientation: "landscape",
    safePadding: 0,
    screenType: "standard",
    refreshRate: 60,
    createdAt: new Date("2024-01-01"),
  };
}

// ── Fake storage factory ──────────────────────────────────────────────────────

function makeFakeStorage(seed: {
  clients?: Client[];
  groups?: ScreenGroup[];
  screens?: Screen[];
  memberships?: { screenId: string; groupId: string }[];
  profiles?: DisplayProfile[];
  tokenScopes?: Record<string, string[]>;
}): OperationsRoutesStorage {
  const clients = seed.clients ?? [];
  const groups = seed.groups ?? [];
  const screens = seed.screens ?? [];
  const memberships = seed.memberships ?? [];
  const profiles = seed.profiles ?? [];
  const tokenScopes = seed.tokenScopes ?? {};

  return {
    async getClients() { return clients; },
    async getClient(id) { return clients.find((c) => c.id === id); },
    async getUserClientIds() { return []; },
    async getEvents() { return []; },
    async getScreenGroups() { return groups; },
    async getScreenGroupsWithMemberCounts() { return groups.map((g) => ({ ...g, memberCount: 0 })); },
    async getScreenGroup(id) { return groups.find((g) => g.id === id); },
    async getGroupMembers(groupId) {
      const memberIds = memberships.filter((m) => m.groupId === groupId).map((m) => m.screenId);
      return screens.filter((s) => memberIds.includes(s.id));
    },
    async getScreen(id) { return screens.find((s) => s.id === id); },
    async getDisplayProfile(id) { return profiles.find((p) => p.id === id); },
    async getScreensByClientId(clientId) { return screens.filter((s) => s.clientId === clientId); },
    async getAllScreenGroupMemberships() { return memberships; },
    async getOperationsScopesForUser() { return []; },
    async getOperationsScopesForToken(tokenId) { return tokenScopes[tokenId] ?? []; },
  };
}

// ── App factory ───────────────────────────────────────────────────────────────

function makeApp(
  storage: OperationsRoutesStorage,
  user: { id: string; role: "admin" | "account_manager" | "site_user" } | null,
  allowedClientIds: string[] | null,
  apiToken: { id: string } | null = null,
) {
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbUser = user;
    (req as any).allowedClientIds = allowedClientIds;
    (req as any).apiToken = apiToken;
    next();
  });

  const auth: OperationsRoutesAuth = {
    canAccessClient: (req, clientId) => {
      const allowed = (req as any).allowedClientIds as string[] | null;
      if (allowed === null) return true;
      return allowed.includes(clientId);
    },
    getAllowedClientIds: (req) => (req as any).allowedClientIds,
  };

  const requireAuthOrToken = (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).dbUser) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHENTICATED" });
    next();
  };
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  mountOperationsRoutes(app, { storage, auth, requireAuthOrToken, loadUserContext });
  return app;
}

function startServer(app: ReturnType<typeof express>) {
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

const admin = { id: "admin-1", role: "admin" as const };

// ── Tests ─────────────────────────────────────────────────────────────────────

test("GET /api/operations/projects/:id/screens — grouped screen returned with group info", async () => {
  const client = makeClient("c1");
  const group = makeGroup("g1", "c1", "Hall A");
  const screen = makeScreen("s1", "c1");
  const storage = makeFakeStorage({
    clients: [client],
    groups: [group],
    screens: [screen],
    memberships: [{ screenId: "s1", groupId: "g1" }],
  });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`, {
      headers: { "X-Operations-Scope": OPERATIONS_SCOPES.SCREEN_READ },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "s1");
    assert.equal(body[0].groups.length, 1);
    assert.equal(body[0].groups[0].id, "g1");
    assert.equal(body[0].groups[0].name, "Hall A");
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — ungrouped screen has empty groups array", async () => {
  const client = makeClient("c1");
  const screen = makeScreen("s1", "c1");
  const storage = makeFakeStorage({
    clients: [client],
    screens: [screen],
    memberships: [],
  });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "s1");
    assert.deepEqual(body[0].groups, []);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — screen in two groups listed twice in groups array", async () => {
  const client = makeClient("c1");
  const g1 = makeGroup("g1", "c1", "Hall A");
  const g2 = makeGroup("g2", "c1", "Hall B");
  const screen = makeScreen("s1", "c1");
  const storage = makeFakeStorage({
    clients: [client],
    groups: [g1, g2],
    screens: [screen],
    memberships: [
      { screenId: "s1", groupId: "g1" },
      { screenId: "s1", groupId: "g2" },
    ],
  });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    // Screen appears once in the result
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "s1");
    // But it carries both group memberships
    const groupIds = body[0].groups.map((g: any) => g.id).sort();
    assert.deepEqual(groupIds, ["g1", "g2"]);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — mix of grouped and ungrouped all returned", async () => {
  const client = makeClient("c1");
  const group = makeGroup("g1", "c1");
  const s1 = makeScreen("s1", "c1");  // grouped
  const s2 = makeScreen("s2", "c1");  // ungrouped
  const storage = makeFakeStorage({
    clients: [client],
    groups: [group],
    screens: [s1, s2],
    memberships: [{ screenId: "s1", groupId: "g1" }],
  });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body.length, 2);
    const byId = Object.fromEntries(body.map((s: any) => [s.id, s]));
    assert.equal(byId["s1"].groups.length, 1);
    assert.deepEqual(byId["s2"].groups, []);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — cross-tenant screens excluded", async () => {
  const c1 = makeClient("c1");
  const c2 = makeClient("c2");
  // Screens for c1 and c2; caller only has access to c1
  const s1 = makeScreen("s1", "c1");
  const s2 = makeScreen("s2", "c2");
  const storage = makeFakeStorage({
    clients: [c1, c2],
    screens: [s1, s2],
  });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    // Only c1's screen
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "s1");
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — site_user blocked from other tenant", async () => {
  const c1 = makeClient("c1");
  const c2 = makeClient("c2");
  const screen = makeScreen("s1", "c2");
  const storage = makeFakeStorage({ clients: [c1, c2], screens: [screen] });
  const siteUser = { id: "u1", role: "site_user" as const };
  // siteUser has access only to c1
  const app = makeApp(storage, siteUser, ["c1"]);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c2/screens`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — 404 for unknown project", async () => {
  const storage = makeFakeStorage({ clients: [] });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/nonexistent/screens`);
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — 401 when unauthenticated", async () => {
  const storage = makeFakeStorage({ clients: [makeClient("c1")] });
  const app = makeApp(storage, null, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — 403 when API token lacks screen.read scope", async () => {
  const client = makeClient("c1");
  const screen = makeScreen("s1", "c1");
  const storage = makeFakeStorage({
    clients: [client],
    screens: [screen],
    // token has no scopes
    tokenScopes: { "tok-1": [] },
  });
  const app = makeApp(storage, admin, null, { id: "tok-1" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 403);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — 200 when API token has screen.read scope", async () => {
  const client = makeClient("c1");
  const screen = makeScreen("s1", "c1");
  const storage = makeFakeStorage({
    clients: [client],
    screens: [screen],
    tokenScopes: { "tok-1": [OPERATIONS_SCOPES.SCREEN_READ] },
  });
  // allowedClientIds = ["c1"] — this token is allowed to see c1
  const app = makeApp(storage, admin, ["c1"], { id: "tok-1" });
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — deviceToken absent from response", async () => {
  const client = makeClient("c1");
  const screen = makeScreen("s1", "c1", { deviceToken: "super-secret" });
  const storage = makeFakeStorage({ clients: [client], screens: [screen] });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    const raw = JSON.stringify(body);
    assert.ok(
      !raw.includes("super-secret"),
      `deviceToken must never appear in the response body`,
    );
    assert.ok(!("deviceToken" in body[0]), "deviceToken field must be absent");
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — pairingCode absent from response", async () => {
  const client = makeClient("c1");
  const screen = makeScreen("s1", "c1", { pairingCode: "SECRET-PAIR-CODE" });
  const storage = makeFakeStorage({ clients: [client], screens: [screen] });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.ok(
      !JSON.stringify(body).includes("SECRET-PAIR-CODE"),
      `pairingCode must never appear in the response body`,
    );
    assert.ok(!("pairingCode" in body[0]), "pairingCode field must be absent");
  } finally {
    await close();
  }
});

test("GET /api/operations/projects/:id/screens — display profile width/height attached when present", async () => {
  const client = makeClient("c1");
  const profile = makeProfile("p1", 3840, 2160);
  const screen = makeScreen("s1", "c1", { displayProfileId: "p1" });
  const storage = makeFakeStorage({
    clients: [client],
    screens: [screen],
    profiles: [profile],
  });
  const app = makeApp(storage, admin, null);
  const { url, close } = await startServer(app);
  try {
    const res = await fetch(`${url}/api/operations/projects/c1/screens`);
    assert.equal(res.status, 200);
    const body = await res.json() as any[];
    assert.equal(body[0].display.width, 3840);
    assert.equal(body[0].display.height, 2160);
  } finally {
    await close();
  }
});

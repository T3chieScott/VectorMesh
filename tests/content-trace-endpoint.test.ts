import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { buildContentTraceHandler } from "../server/contentTraceHandler";
import type { Request, Response, NextFunction } from "express";
import type { Screen } from "../shared/schema";

function makeScreen(overrides: Partial<Screen> = {}): Screen {
  return {
    id: "screen-1",
    name: "S1",
    clientId: "client-A",
    isPaired: true,
    pairingCode: null,
    deviceTokenHash: null,
    deviceFingerprint: null,
    lastSeen: null,
    locationLat: null,
    locationLng: null,
    timezone: null,
    weatherCity: null,
    location: null,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    displayProfileId: null,
    rotation: 0,
    screenshotEnabled: false,
    presetId: null,
    refreshRequestedAt: null,
    screenshotRequestedAt: null,
    lastRefreshFulfilledAt: null,
    lastScreenshotFulfilledAt: null,
    notes: null,
    createdAt: new Date(),
    ...overrides,
  } as Screen;
}

interface TestUser {
  role: "admin" | "account_manager" | "editor" | null;
  allowedClientIds?: string[] | null;
}

function injectUser(user: TestUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (user) {
      (req as any).dbUser = { role: user.role };
      (req as any).allowedClientIds =
        user.allowedClientIds === undefined ? null : user.allowedClientIds;
    }
    next();
  };
}

function makeStubDeps(screen: Screen | null) {
  return {
    getScreen: async (id: string) => (screen && screen.id === id ? screen : undefined),
    getLiveOverrides: async () => [],
    getCurrentEventForScreen: async () => undefined,
    getProgrammes: async () => [],
    getProgrammeVersions: async () => [],
    getScheduleBlocks: async () => [],
    getLayoutTemplate: async () => undefined,
    getScreenGroupIds: async () => [],
    getPlaylist: async () => undefined,
  };
}

function isAdminFn(req: Request): boolean {
  return (req as any).dbUser?.role === "admin";
}

function canAccessClientFn(req: Request, clientId: string): boolean {
  if (isAdminFn(req)) return true;
  const allowed = (req as any).allowedClientIds as string[] | null;
  return allowed ? allowed.includes(clientId) : false;
}

async function withTestServer(
  user: TestUser | null,
  screen: Screen | null,
  call: (port: number) => Promise<{ status: number; body: any }>,
) {
  const app = express();
  app.use(injectUser(user));
  app.get(
    "/api/admin/screens/:id/content-trace",
    buildContentTraceHandler(makeStubDeps(screen) as any, {
      isAdmin: isAdminFn,
      canAccessClient: canAccessClientFn,
    }),
  );
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    return await call(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function get(port: number, id: string) {
  const res = await fetch(`http://127.0.0.1:${port}/api/admin/screens/${id}/content-trace`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test("admin user gets 200 + trace for any screen", async () => {
  const screen = makeScreen({ clientId: "client-A" });
  const r = await withTestServer(
    { role: "admin", allowedClientIds: null },
    screen,
    (port) => get(port, screen.id),
  );
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.trace));
  assert.equal(r.body.screen.id, screen.id);
  assert.ok(r.body.outcome);
});

test("account-manager in scope gets 200", async () => {
  const screen = makeScreen({ clientId: "client-A" });
  const r = await withTestServer(
    { role: "account_manager", allowedClientIds: ["client-A"] },
    screen,
    (port) => get(port, screen.id),
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.screen.id, screen.id);
});

test("account-manager OUT of scope gets 403", async () => {
  const screen = makeScreen({ clientId: "client-A" });
  const r = await withTestServer(
    { role: "account_manager", allowedClientIds: ["client-B"] },
    screen,
    (port) => get(port, screen.id),
  );
  assert.equal(r.status, 403);
  assert.match(r.body.error, /scope/i);
});

test("account-manager on screen with no client (orphan) gets 403", async () => {
  const screen = makeScreen({ clientId: null });
  const r = await withTestServer(
    { role: "account_manager", allowedClientIds: ["client-A"] },
    screen,
    (port) => get(port, screen.id),
  );
  assert.equal(r.status, 403);
});

test("admin can read screen with no client", async () => {
  const screen = makeScreen({ clientId: null });
  const r = await withTestServer(
    { role: "admin", allowedClientIds: null },
    screen,
    (port) => get(port, screen.id),
  );
  assert.equal(r.status, 200);
});

test("missing screen returns 404 even for admin", async () => {
  const r = await withTestServer(
    { role: "admin", allowedClientIds: null },
    null,
    (port) => get(port, "does-not-exist"),
  );
  assert.equal(r.status, 404);
});

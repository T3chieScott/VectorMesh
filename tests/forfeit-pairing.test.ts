// Task #185 — regression coverage for the Pi-side "I'm walking
// away" flow that fixes the unpair-on-block-publish bug.
//
// Two bugs are in scope; this file pins both:
//
//   1. The Pi historically unpaired itself the moment any /content
//      response returned 401/403, and the screens page kept saying
//      "Offline" because the DB still had `isPaired=true`. The new
//      `forfeitWallPairing` storage method + the
//      `/api/player/:screenId/forfeit-pairing` endpoint let the Pi
//      tell the server "I just dropped my token", so the screens
//      page flips to "Unpaired" within one refetch instead of
//      lying as "Offline".
//
//   2. The forfeit path must NOT rotate `pairingCode` — every tile
//      keeps its existing code so the operator can re-pair using
//      the code already shown on the screens page (rotation is the
//      job of the regenerate / wall-leave / dedupe paths, all of
//      which keep their own coverage in canvas-pairing.test.ts and
//      screens-create-regenerate-flow.test.ts).
//
// Test isolation: every row this file inserts is namespaced with
// PREFIX so we can clean up at file start AND end without touching
// ambient dev data, matching the convention in
// canvas-pairing.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction, Express } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { like } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { clients, screens, type Screen } from "../shared/schema";

const PREFIX = "__TEST_S185__";

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

test.before(cleanup);
test.after(cleanup);

async function makeClient(label: string): Promise<string> {
  const [c] = await db
    .insert(clients)
    .values({ name: `${PREFIX}${label}` })
    .returning();
  return c.id;
}

interface MakeScreenOpts {
  name: string;
  clientId: string | null;
  createdAt: Date;
  canvasEnabled?: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  canvasX?: number;
  canvasY?: number;
  isPaired?: boolean;
  isOnline?: boolean;
  pairingCode?: string | null;
  deviceToken?: string | null;
  lastSeen?: Date | null;
  ipAddress?: string | null;
  hostname?: string | null;
  hardwareClass?: string | null;
}

async function makeScreen(opts: MakeScreenOpts): Promise<Screen> {
  const [row] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}${opts.name}`,
      clientId: opts.clientId,
      canvasEnabled: opts.canvasEnabled ?? false,
      canvasWidth: opts.canvasWidth ?? null,
      canvasHeight: opts.canvasHeight ?? null,
      canvasX: opts.canvasX ?? 0,
      canvasY: opts.canvasY ?? 0,
      isPaired: opts.isPaired ?? false,
      isOnline: opts.isOnline ?? false,
      pairingCode: opts.pairingCode ?? null,
      deviceToken: opts.deviceToken ?? null,
      lastSeen: opts.lastSeen ?? null,
      ipAddress: opts.ipAddress ?? null,
      hostname: opts.hostname ?? null,
      hardwareClass: opts.hardwareClass ?? null,
      createdAt: opts.createdAt,
    } as any)
    .returning();
  return row;
}

// ─── Storage-level: forfeitWallPairing ─────────────────────────────

test("forfeitWallPairing: solo paired screen — clears device + presence, keeps pairingCode", async () => {
  const clientId = await makeClient("solo");
  const s = await makeScreen({
    name: "soloPi",
    clientId,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    pairingCode: "U5SOL1",
    deviceToken: "tok-solo",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-01T01:00:00Z"),
    ipAddress: "10.1.0.1",
    hostname: "solo-pi",
    hardwareClass: "rpi5",
  });

  await storage.forfeitWallPairing(s.id);

  const after = await storage.getScreen(s.id);
  assert.ok(after, "screen still exists");
  assert.equal(after!.deviceToken, null, "deviceToken cleared");
  assert.equal(after!.isPaired, false, "isPaired flipped");
  assert.equal(after!.isOnline, false, "isOnline flipped");
  assert.equal(after!.lastSeen, null, "lastSeen scrubbed");
  assert.equal(after!.ipAddress, null, "ipAddress scrubbed");
  assert.equal(after!.hostname, null, "hostname scrubbed");
  assert.equal(after!.hardwareClass, null, "hardwareClass scrubbed");
  // The whole point of forfeit (vs rotate) is that the existing
  // pairingCode still works — operator types it on the Pi to
  // re-pair without ever touching the screens page.
  assert.equal(after!.pairingCode, "U5SOL1", "pairingCode preserved");
});

test("forfeitWallPairing: paired wall — clears every member, keeps each tile's own pairingCode", async () => {
  const clientId = await makeClient("wall");
  const t0 = new Date("2026-08-05T00:00:00Z");
  // A real 2-tile wall (≥2 distinct positions) so getCanvasMembers
  // returns both rows.
  const a = await makeScreen({
    name: "wallA",
    clientId,
    createdAt: t0,
    canvasEnabled: true,
    canvasWidth: 3840,
    canvasHeight: 1080,
    canvasX: 0,
    pairingCode: "U5WAL1",
    deviceToken: "tok-wall",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-05T01:00:00Z"),
    ipAddress: "10.1.1.1",
    hostname: "wall-pi",
    hardwareClass: "rpi5",
  });
  const b = await makeScreen({
    name: "wallB",
    clientId,
    createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true,
    canvasWidth: 3840,
    canvasHeight: 1080,
    canvasX: 1920,
    pairingCode: "U5WAL2",
    deviceToken: "tok-wall",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-05T01:00:00Z"),
    ipAddress: "10.1.1.1",
    hostname: "wall-pi",
    hardwareClass: "rpi5",
  });

  // Pi was driving tile A and dropped its token. Forfeiting via A
  // must clear pairing on B as well — they share one Pi.
  await storage.forfeitWallPairing(a.id);

  const aAfter = await storage.getScreen(a.id);
  const bAfter = await storage.getScreen(b.id);
  assert.ok(aAfter && bAfter);
  for (const m of [aAfter!, bAfter!]) {
    assert.equal(m.deviceToken, null, `deviceToken cleared on ${m.name}`);
    assert.equal(m.isPaired, false, `isPaired flipped on ${m.name}`);
    assert.equal(m.isOnline, false, `isOnline flipped on ${m.name}`);
    assert.equal(m.lastSeen, null, `lastSeen scrubbed on ${m.name}`);
    assert.equal(m.ipAddress, null, `ipAddress scrubbed on ${m.name}`);
    assert.equal(m.hostname, null, `hostname scrubbed on ${m.name}`);
    assert.equal(m.hardwareClass, null, `hardwareClass scrubbed on ${m.name}`);
  }
  // Each tile's own per-tile code is preserved (Task #180 — codes
  // are per-row unique and never fanned out).
  assert.equal(aAfter!.pairingCode, "U5WAL1", "tile A keeps its own code");
  assert.equal(bAfter!.pairingCode, "U5WAL2", "tile B keeps its own code");
});

test("forfeitWallPairing: missing screen is a no-op (doesn't throw)", async () => {
  await assert.doesNotReject(() =>
    storage.forfeitWallPairing("nonexistent-screen-id-zzz"),
  );
});

test("forfeitWallPairing: idempotent — safe to call twice in a row", async () => {
  const clientId = await makeClient("idem");
  const s = await makeScreen({
    name: "idemPi",
    clientId,
    createdAt: new Date("2026-08-10T00:00:00Z"),
    pairingCode: "U5IDM1",
    deviceToken: "tok-idem",
    isPaired: true,
  });
  await storage.forfeitWallPairing(s.id);
  await assert.doesNotReject(() => storage.forfeitWallPairing(s.id));
  const after = await storage.getScreen(s.id);
  assert.equal(after!.deviceToken, null);
  assert.equal(after!.isPaired, false);
  assert.equal(after!.pairingCode, "U5IDM1", "pairingCode still preserved");
});

// ─── HTTP-level: /api/player/:screenId/forfeit-pairing ─────────────
//
// The handler in server/routes.ts is small and is mounted behind the
// real validateDeviceToken middleware, so a fair test needs a real
// HTTP roundtrip. We re-create the validateDeviceToken contract
// inline (matching server/routes.ts:343-401 — a header/query token
// must match the screen's deviceToken, otherwise 401/403). This is
// the same shape the production middleware enforces, just inlined
// so the test doesn't pull the entire registerRoutes() side effect.

function realValidateDeviceToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const headerToken = req.headers["x-device-token"];
  const token =
    typeof headerToken === "string" && headerToken
      ? headerToken
      : typeof req.query.token === "string" && req.query.token
        ? req.query.token
        : undefined;
  if (!token) {
    res.status(401).json({ error: "Device token required" });
    return;
  }
  void (async () => {
    const screenId = String(req.params.screenId ?? "");
    const screen = screenId ? await storage.getScreen(screenId) : undefined;
    if (!screen || screen.deviceToken !== token) {
      res.status(403).json({ error: "Invalid device token" });
      return;
    }
    next();
  })();
}

async function startForfeitTestApp(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app: Express = express();
  app.use(express.json());
  app.post(
    "/api/player/:screenId/forfeit-pairing",
    realValidateDeviceToken,
    async (req, res) => {
      try {
        await storage.forfeitWallPairing(String(req.params.screenId));
        res.json({ success: true });
      } catch (err) {
        console.error("forfeit error:", err);
        res.status(500).json({ error: "Failed to forfeit pairing" });
      }
    },
  );
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("POST /forfeit-pairing — wrong token rejected with 403, DB untouched", async () => {
  const clientId = await makeClient("http-403");
  const s = await makeScreen({
    name: "http403",
    clientId,
    createdAt: new Date("2026-08-15T00:00:00Z"),
    pairingCode: "U5H401",
    deviceToken: "real-token",
    isPaired: true,
  });
  const { baseUrl, close } = await startForfeitTestApp();
  try {
    const res = await fetch(
      `${baseUrl}/api/player/${s.id}/forfeit-pairing`,
      {
        method: "POST",
        headers: { "x-device-token": "wrong-token" },
      },
    );
    assert.equal(res.status, 403);
    const after = await storage.getScreen(s.id);
    assert.equal(after!.deviceToken, "real-token", "DB token untouched");
    assert.equal(after!.isPaired, true, "still paired in DB");
  } finally {
    await close();
  }
});

test("POST /forfeit-pairing — missing token rejected with 401", async () => {
  const clientId = await makeClient("http-401");
  const s = await makeScreen({
    name: "http401",
    clientId,
    createdAt: new Date("2026-08-16T00:00:00Z"),
    pairingCode: "U5H402",
    deviceToken: "tok",
    isPaired: true,
  });
  const { baseUrl, close } = await startForfeitTestApp();
  try {
    const res = await fetch(
      `${baseUrl}/api/player/${s.id}/forfeit-pairing`,
      { method: "POST" },
    );
    assert.equal(res.status, 401);
    const after = await storage.getScreen(s.id);
    assert.equal(after!.deviceToken, "tok");
    assert.equal(after!.isPaired, true);
  } finally {
    await close();
  }
});

test("POST /forfeit-pairing — correct token clears wall pairing, preserves pairingCode", async () => {
  const clientId = await makeClient("http-ok");
  const t0 = new Date("2026-08-20T00:00:00Z");
  const a = await makeScreen({
    name: "httpOkA",
    clientId,
    createdAt: t0,
    canvasEnabled: true,
    canvasWidth: 3840,
    canvasHeight: 1080,
    canvasX: 0,
    pairingCode: "U5HOK1",
    deviceToken: "wall-tok",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-20T01:00:00Z"),
    ipAddress: "10.2.0.1",
    hostname: "ok-pi",
  });
  const b = await makeScreen({
    name: "httpOkB",
    clientId,
    createdAt: new Date(t0.getTime() + 1000),
    canvasEnabled: true,
    canvasWidth: 3840,
    canvasHeight: 1080,
    canvasX: 1920,
    pairingCode: "U5HOK2",
    deviceToken: "wall-tok",
    isPaired: true,
    isOnline: true,
    lastSeen: new Date("2026-08-20T01:00:00Z"),
    ipAddress: "10.2.0.1",
    hostname: "ok-pi",
  });
  const { baseUrl, close } = await startForfeitTestApp();
  try {
    const res = await fetch(
      `${baseUrl}/api/player/${a.id}/forfeit-pairing`,
      {
        method: "POST",
        headers: { "x-device-token": "wall-tok" },
      },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const aAfter = await storage.getScreen(a.id);
    const bAfter = await storage.getScreen(b.id);
    for (const m of [aAfter!, bAfter!]) {
      assert.equal(m.deviceToken, null);
      assert.equal(m.isPaired, false);
      assert.equal(m.isOnline, false);
      assert.equal(m.lastSeen, null);
      assert.equal(m.ipAddress, null);
      assert.equal(m.hostname, null);
    }
    assert.equal(aAfter!.pairingCode, "U5HOK1");
    assert.equal(bAfter!.pairingCode, "U5HOK2");
  } finally {
    await close();
  }
});

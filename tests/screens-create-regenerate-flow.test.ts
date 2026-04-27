// Task #182: UI-flow regression coverage for the screens create +
// regenerate path. The Replit dev login flow blocks a real headless
// browser from authenticating (see task notes), so we cover the same
// happy-path the React `screens.tsx` createMutation /
// regeneratePairingCodeMutation exercise by driving the extracted
// route handlers (server/screenCreateHandler.ts,
// server/screenRegeneratePairingHandler.ts) through a tiny Express
// app, with a fake auth middleware standing in for the session
// cookie. The handlers ARE the production code path — routes.ts
// mounts the same factories.
//
// Coverage:
//   1. Pure helper buildCreateScreenRequestBody (the body-builder
//      lifted out of screens.tsx) — pin that the wire payload NEVER
//      includes a `pairingCode` field, regardless of input shape.
//      Catches "future edit accidentally re-adds a client-side
//      pairing-code generator and resends it to the server".
//   2. End-to-end happy path against a real DB:
//        a) POST /api/screens twice with canvas-enabled ⇒ each tile
//           gets its OWN unique server-minted 6-char pairingCode.
//        b) Even if the client tries to spoof a pairingCode in the
//           body, the server strips it and mints its own.
//        c) POST /api/screens/:id/regenerate-pairing on either tile
//           rotates EVERY wall member onto a fresh unique code, AND
//           clears the shared deviceToken — wall converges cleanly.
//
// Test isolation: every row this file inserts is namespaced with
// PREFIX so cleanup at file start AND end leaves ambient dev data
// alone, matching the convention in canvas-pairing.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction, Express } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, like } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { clients, screens, type Screen } from "../shared/schema";
import { buildScreenCreateHandler } from "../server/screenCreateHandler";
import {
  buildScreenRegeneratePairingHandler,
} from "../server/screenRegeneratePairingHandler";
import {
  buildCreateScreenRequestBody,
  type ScreenCreateFormInput,
} from "../client/src/lib/screensCreateBody";

const PREFIX = "__TEST_S182__";

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

// ─── Test-only auth fixture ────────────────────────────────────────
// The "test-only auth path" the task description calls out: a tiny
// middleware that stamps `req.dbUser` and `req.allowedClientIds` so
// the real route handlers think they're talking to a logged-in admin.
// Future browser tests (when Playwright lands) can swap this out for
// a seeded session cookie; the route handlers themselves don't care.
function fakeAuthAsAdmin(userId: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbUser = { id: userId, role: "admin" };
    (req as any).allowedClientIds = null;
    next();
  };
}

function fakeCanAccessClient(req: Request, _clientId: string): boolean {
  return (req as any).dbUser?.role === "admin";
}

// Spin up the same route surface the React `screens.tsx` page calls
// against, mounted at the real paths. Returns a `fetch`-friendly base
// URL plus a teardown callback.
async function startTestApp(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app: Express = express();
  app.use(express.json());
  app.use(fakeAuthAsAdmin("test-user-182"));
  app.post(
    "/api/screens",
    buildScreenCreateHandler(storage, fakeCanAccessClient),
  );
  app.post(
    "/api/screens/:id/regenerate-pairing",
    buildScreenRegeneratePairingHandler(storage),
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

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function readScreen(id: string): Promise<Screen | undefined> {
  const rows = await db.select().from(screens).where(eq(screens.id, id));
  return rows[0];
}

// ─── 1. Pure body-builder pins ─────────────────────────────────────

test("buildCreateScreenRequestBody never emits a pairingCode field (Task #182)", () => {
  // The whole point of Task #180 → #182 is that the client never
  // invents pairing codes. If a future edit re-adds a client-side
  // generator and threads it through the body, this assertion fails
  // even before the request hits the server.
  const inputs: ScreenCreateFormInput[] = [
    { name: "kiosk", canvasEnabled: false },
    {
      name: "wall-tile",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasY: 0,
      clientId: "site-1",
    },
    {
      name: "weather",
      weatherLat: " 51.5 ",
      weatherLng: " -0.12 ",
      weatherPlaceName: " London ",
      weatherUnit: "fahrenheit",
      roomCapacity: 12,
    },
  ];
  for (const input of inputs) {
    const body = buildCreateScreenRequestBody(input);
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, "pairingCode"),
      false,
      `body must not include pairingCode for input ${JSON.stringify(input)}`,
    );
  }
});

test("buildCreateScreenRequestBody nulls out canvas fields when disabled (Task #182)", () => {
  const body = buildCreateScreenRequestBody({
    name: "kiosk",
    canvasEnabled: false,
    canvasWidth: 3840,
    canvasHeight: 1080,
    canvasX: 100,
    canvasY: 200,
  });
  assert.equal(body.canvasEnabled, false);
  assert.equal(body.canvasWidth, null);
  assert.equal(body.canvasHeight, null);
  assert.equal(body.canvasX, 0);
  assert.equal(body.canvasY, 0);
});

test("buildCreateScreenRequestBody trims weather strings and applies defaults (Task #182)", () => {
  const body = buildCreateScreenRequestBody({
    name: "weather",
    weatherLat: "  ",
    weatherLng: "",
    weatherPlaceName: "  Paris  ",
  });
  // Whitespace-only strings collapse to null so the server doesn't
  // store empty placeholders.
  assert.equal(body.weatherLat, null);
  assert.equal(body.weatherLng, null);
  assert.equal(body.weatherPlaceName, "Paris");
  assert.equal(body.weatherUnit, "celsius");
});

// ─── 2. End-to-end happy path: create + regenerate ─────────────────

test("happy path: two canvas tiles get unique server-minted codes; regenerate rotates the whole wall (Task #182)", async () => {
  const clientId = await makeClient("happy");
  const { baseUrl, close } = await startTestApp();
  try {
    // The same body shape `screens.tsx` sends via
    // buildCreateScreenRequestBody, expanded inline so the assertion
    // captures both the body builder AND the server's minting path.
    const tileBody = (name: string, canvasX: number) =>
      buildCreateScreenRequestBody({
        name: `${PREFIX}${name}`,
        clientId,
        canvasEnabled: true,
        canvasWidth: 3840,
        canvasHeight: 1080,
        canvasX,
        canvasY: 0,
      });

    const a = await postJson(baseUrl, "/api/screens", tileBody("happyA", 0));
    assert.equal(a.status, 201, `tile A create should 201; got ${a.status}`);
    const b = await postJson(
      baseUrl,
      "/api/screens",
      tileBody("happyB", 1920),
    );
    assert.equal(b.status, 201, `tile B create should 201; got ${b.status}`);

    const aRow = a.body as Screen;
    const bRow = b.body as Screen;

    // Each tile gets a unique server-minted 6-char code.
    assert.equal(
      aRow.pairingCode?.length,
      6,
      "tile A must have a 6-char server-minted pairingCode",
    );
    assert.equal(
      bRow.pairingCode?.length,
      6,
      "tile B must have a 6-char server-minted pairingCode",
    );
    assert.notEqual(
      aRow.pairingCode,
      bRow.pairingCode,
      "two tiles on the same canvas must NOT share a pairingCode",
    );
    assert.equal(aRow.isPaired, false);
    assert.equal(bRow.isPaired, false);
    assert.equal(aRow.deviceToken, null);
    assert.equal(bRow.deviceToken, null);

    // Regenerate from tile A — the whole wall must rotate, both
    // codes must be brand-new and still unique.
    const regen = await postJson(
      baseUrl,
      `/api/screens/${aRow.id}/regenerate-pairing`,
      {},
    );
    assert.equal(
      regen.status,
      200,
      `regenerate should 200; got ${regen.status}`,
    );

    const aAfter = await readScreen(aRow.id);
    const bAfter = await readScreen(bRow.id);
    assert.ok(aAfter, "tile A still exists after regenerate");
    assert.ok(bAfter, "tile B still exists after regenerate");
    assert.equal(
      aAfter!.pairingCode?.length,
      6,
      "tile A retains a 6-char code post-rotation",
    );
    assert.equal(
      bAfter!.pairingCode?.length,
      6,
      "tile B retains a 6-char code post-rotation",
    );
    assert.notEqual(
      aAfter!.pairingCode,
      aRow.pairingCode,
      "tile A's code must change after regenerate",
    );
    assert.notEqual(
      bAfter!.pairingCode,
      bRow.pairingCode,
      "tile B's code must change after regenerate (whole wall rotates)",
    );
    assert.notEqual(
      aAfter!.pairingCode,
      bAfter!.pairingCode,
      "post-rotation codes must remain unique across tiles",
    );
    // Wall stays consistent: both tiles unpaired, no stale token.
    assert.equal(aAfter!.isPaired, false);
    assert.equal(bAfter!.isPaired, false);
    assert.equal(aAfter!.deviceToken, null);
    assert.equal(bAfter!.deviceToken, null);
  } finally {
    await close();
  }
});

test("server strips client-supplied pairingCode and mints its own (Task #182)", async () => {
  // Defence-in-depth: even if a future regression in
  // buildCreateScreenRequestBody (or a third-party caller) sends a
  // pairingCode in the request body, the server must ignore it and
  // mint its own unique code. Pins the route's strip-and-replace
  // behaviour from Task #180.
  const clientId = await makeClient("strip");
  const { baseUrl, close } = await startTestApp();
  try {
    const spoofed = "ZZZZZZ"; // 6 chars so it would otherwise pass schema
    const created = await postJson(baseUrl, "/api/screens", {
      name: `${PREFIX}stripA`,
      clientId,
      canvasEnabled: false,
      pairingCode: spoofed,
    });
    assert.equal(created.status, 201);
    const row = created.body as Screen;
    assert.equal(
      row.pairingCode?.length,
      6,
      "server must mint a 6-char code regardless of caller input",
    );
    assert.notEqual(
      row.pairingCode,
      spoofed,
      "caller-supplied pairingCode must be ignored",
    );
  } finally {
    await close();
  }
});

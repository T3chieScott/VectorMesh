import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Screen as DbScreen, InsertScreen } from "../shared/schema";
import {
  normalizeScreenPatchBody,
  buildScreenPatchHandler,
} from "../server/screenPatchHandler";

function makeScreen(overrides: Partial<DbScreen> & { id: string }): DbScreen {
  const base: DbScreen = {
    id: overrides.id,
    clientId: null,
    name: "Test Screen",
    location: null,
    displayProfileId: null,
    pairingCode: null,
    deviceToken: null,
    isPaired: false,
    isOnline: false,
    lastSeen: null,
    ipAddress: null,
    hostname: null,
    hardwareClass: null,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasWidth: null,
    canvasHeight: null,
    canvasX: 0,
    canvasY: 0,
    locked: false,
    screenshotEnabled: false,
    lastScreenshot: null,
    lastScreenshotAt: null,
    testPatternEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...overrides };
}

interface FakeStorage {
  getScreen(id: string): Promise<DbScreen | undefined>;
  updateScreen(
    id: string,
    data: Partial<InsertScreen>,
  ): Promise<DbScreen | undefined>;
  // Task #180: PATCH handler now also calls these to detect wall
  // membership changes and rotate pairing identities to keep
  // screens.pairing_code globally unique.
  getCanvasMembers(screen: DbScreen): Promise<DbScreen[]>;
  reconcileWallPairingAfterChange(
    id: string,
    beforeMembers: DbScreen[],
    opts?: { changedScreenDeleted?: boolean },
  ): Promise<void>;
}

function makeFakeStorage(
  initial: DbScreen,
  opts: {
    membersFor?: (row: DbScreen) => DbScreen[];
    onReconcile?: (
      id: string,
      beforeMembers: DbScreen[],
      opts?: { changedScreenDeleted?: boolean },
    ) => void;
  } = {},
) {
  let row: DbScreen = { ...initial };
  let lastUpdateArg: Partial<InsertScreen> | null = null;
  const reconcileCalls: Array<{
    id: string;
    beforeMembers: DbScreen[];
    opts?: { changedScreenDeleted?: boolean };
  }> = [];
  const storage: FakeStorage = {
    async getScreen(id: string) {
      return row.id === id ? { ...row } : undefined;
    },
    async updateScreen(id: string, data: Partial<InsertScreen>) {
      lastUpdateArg = data;
      row = { ...row, ...(data as Partial<DbScreen>) };
      return { ...row };
    },
    async getCanvasMembers(screen: DbScreen) {
      return opts.membersFor ? opts.membersFor(screen) : [screen];
    },
    async reconcileWallPairingAfterChange(id, beforeMembers, reconcileOpts) {
      reconcileCalls.push({ id, beforeMembers, opts: reconcileOpts });
      opts.onReconcile?.(id, beforeMembers, reconcileOpts);
    },
  };
  return {
    storage,
    getRow: () => row,
    getLastUpdateArg: () => lastUpdateArg,
    getReconcileCalls: () => reconcileCalls,
  };
}

async function withTestServer(
  storage: FakeStorage,
  body: unknown,
  screenId = "screen-1",
) {
  const app = express();
  app.use(express.json());
  app.patch(
    "/api/screens/:id",
    buildScreenPatchHandler(storage, () => {}),
  );
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/screens/${screenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("normalizeScreenPatchBody leaves absent ref keys absent", () => {
  const out = normalizeScreenPatchBody({ screenshotEnabled: true });
  assert.equal(
    "displayProfileId" in out,
    false,
    "displayProfileId must not appear when not in input",
  );
  assert.equal("clientId" in out, false);
  assert.equal("fallbackLayoutId" in out, false);
  assert.equal("fallbackPlaylistId" in out, false);
  assert.equal(out.screenshotEnabled, true);
});

test("normalizeScreenPatchBody coerces empty string to null for ref fields", () => {
  const out = normalizeScreenPatchBody({
    displayProfileId: "",
    clientId: "",
    fallbackLayoutId: "",
    fallbackPlaylistId: "",
  });
  assert.equal(out.displayProfileId, null);
  assert.equal(out.clientId, null);
  assert.equal(out.fallbackLayoutId, null);
  assert.equal(out.fallbackPlaylistId, null);
});

test("normalizeScreenPatchBody passes explicit null through for ref fields", () => {
  const out = normalizeScreenPatchBody({ displayProfileId: null });
  assert.equal("displayProfileId" in out, true);
  assert.equal(out.displayProfileId, null);
});

test("normalizeScreenPatchBody preserves real ref ids", () => {
  const out = normalizeScreenPatchBody({
    displayProfileId: "dp-123",
    fallbackLayoutId: "layout-456",
  });
  assert.equal(out.displayProfileId, "dp-123");
  assert.equal(out.fallbackLayoutId, "layout-456");
});

test("PATCH /api/screens/:id with only screenshotEnabled does NOT clobber displayProfileId or fallbackLayoutId", async () => {
  const fake = makeFakeStorage(makeScreen({
    id: "screen-1",
    locked: false,
    displayProfileId: "dp-existing",
    fallbackLayoutId: "layout-existing",
    screenshotEnabled: false,
    name: "Lobby",
  }));

  const { status } = await withTestServer(fake.storage, {
    screenshotEnabled: true,
  });

  assert.equal(status, 200);

  const arg = fake.getLastUpdateArg();
  assert.ok(arg, "updateScreen should have been called");
  assert.equal(
    "displayProfileId" in arg!,
    false,
    "regression: PATCH must not send displayProfileId when caller did not include it",
  );
  assert.equal(
    "fallbackLayoutId" in arg!,
    false,
    "regression: PATCH must not send fallbackLayoutId when caller did not include it",
  );
  assert.equal(arg!.screenshotEnabled, true);

  const row = fake.getRow();
  assert.equal(row.displayProfileId, "dp-existing");
  assert.equal(row.fallbackLayoutId, "layout-existing");
});

test("PATCH /api/screens/:id with only testPatternEnabled does NOT clobber displayProfileId or fallbackLayoutId", async () => {
  const fake = makeFakeStorage(makeScreen({
    id: "screen-1",
    locked: false,
    displayProfileId: "dp-existing",
    fallbackLayoutId: "layout-existing",
    testPatternEnabled: false,
    name: "Lobby",
  }));

  const { status } = await withTestServer(fake.storage, {
    testPatternEnabled: true,
  });

  assert.equal(status, 200);
  const row = fake.getRow();
  assert.equal(row.displayProfileId, "dp-existing");
  assert.equal(row.fallbackLayoutId, "layout-existing");
});

test("PATCH /api/screens/:id with explicit null displayProfileId clears the column", async () => {
  const fake = makeFakeStorage(makeScreen({
    id: "screen-1",
    locked: false,
    displayProfileId: "dp-existing",
    fallbackLayoutId: "layout-existing",
    name: "Lobby",
  }));

  const { status } = await withTestServer(fake.storage, {
    displayProfileId: null,
  });

  assert.equal(status, 200);
  const row = fake.getRow();
  assert.equal(row.displayProfileId, null);
  assert.equal(
    row.fallbackLayoutId,
    "layout-existing",
    "fallbackLayoutId should be untouched when not in body",
  );
});

test("PATCH /api/screens/:id with empty-string displayProfileId clears the column", async () => {
  const fake = makeFakeStorage(makeScreen({
    id: "screen-1",
    locked: false,
    displayProfileId: "dp-existing",
    fallbackLayoutId: "layout-existing",
    name: "Lobby",
  }));

  const { status } = await withTestServer(fake.storage, {
    displayProfileId: "",
  });

  assert.equal(status, 200);
  const row = fake.getRow();
  assert.equal(row.displayProfileId, null);
  assert.equal(row.fallbackLayoutId, "layout-existing");
});

test("PATCH /api/screens/:id refuses to mutate a locked screen", async () => {
  const fake = makeFakeStorage(makeScreen({
    id: "screen-1",
    locked: true,
    displayProfileId: "dp-existing",
    fallbackLayoutId: "layout-existing",
    name: "Lobby",
  }));

  const { status } = await withTestServer(fake.storage, {
    screenshotEnabled: true,
  });

  assert.equal(status, 403);
  assert.equal(fake.getLastUpdateArg(), null);
});

test("PATCH /api/screens/:id returns 404 for unknown screen", async () => {
  const fake = makeFakeStorage(makeScreen({
    id: "screen-1",
    locked: false,
    displayProfileId: null,
    fallbackLayoutId: null,
    name: "Lobby",
  }));

  const { status } = await withTestServer(
    fake.storage,
    { screenshotEnabled: true },
    "does-not-exist",
  );

  assert.equal(status, 404);
});

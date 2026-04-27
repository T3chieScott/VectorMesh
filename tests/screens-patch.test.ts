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
    canvasGroupId: null,
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

// ─── Task #189 — PATCH guards around `canvasGroupId` ──────────────
//
// These tests pin three behaviours the architect review flagged as
// gaps:
//   1. A patch that changes `canvasWidth`/`canvasHeight` (or
//      `clientId`) without re-asserting `canvasGroupId` must still
//      validate the EXISTING binding against the post-patch dims and
//      reject if it no longer fits — a stale FK that "looked safe"
//      because the payload didn't touch it should not be persisted.
//   2. An explicit `canvasGroupId: null` while canvas remains enabled
//      is rejected — the explicit-FK invariant requires every
//      canvas-enabled screen to carry a group binding.
//   3. Disabling canvas (`canvasEnabled: false`) must clear any
//      lingering `canvasGroupId`, even if the patch payload didn't
//      mention it — otherwise the screen ends up canvas-disabled
//      while still pointing at a group.
//
// We extend the `FakeStorage` shape with a tiny `getCanvasGroup`
// stub so the handler's effective-state validation can resolve
// (or fail to resolve) the FK without needing the full DB.

interface FakeCanvasGroup {
  id: string;
  clientId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  name: string;
}

function makeFakeStorageWithGroups(
  initial: DbScreen,
  groups: FakeCanvasGroup[],
) {
  const base = makeFakeStorage(initial);
  const byId = new Map(groups.map((g) => [g.id, g]));
  const created: FakeCanvasGroup[] = [];
  let nextId = 1;
  return {
    ...base,
    getCreatedGroups: () => created,
    storage: {
      ...base.storage,
      async getCanvasGroup(id: string) {
        return byId.get(id);
      },
      async createCanvasGroup(data: {
        clientId: string | null;
        name: string;
        canvasWidth: number;
        canvasHeight: number;
      }) {
        const fresh: FakeCanvasGroup = {
          id: `auto-group-${nextId++}`,
          clientId: data.clientId,
          name: data.name,
          canvasWidth: data.canvasWidth,
          canvasHeight: data.canvasHeight,
        };
        byId.set(fresh.id, fresh);
        created.push(fresh);
        return fresh;
      },
    } as unknown as FakeStorage,
  };
}

test("PATCH /api/screens/:id — Task #189: changing canvas dims invalidates the existing canvasGroupId binding even when the patch didn't touch it", async () => {
  const groupId = "group-3840x1080";
  const fake = makeFakeStorageWithGroups(
    makeScreen({
      id: "screen-1",
      clientId: "client-A",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: groupId,
      name: "WallTile",
    }),
    [
      {
        id: groupId,
        clientId: "client-A",
        canvasWidth: 3840,
        canvasHeight: 1080,
        name: "Lobby Wall",
      },
    ],
  );

  // Patch only changes the dims — canvasGroupId is untouched in the
  // payload. The handler must STILL validate the existing binding
  // against the new dims and reject the mismatch.
  const { status, body } = await withTestServer(fake.storage, {
    canvasWidth: 1920,
    canvasHeight: 1080,
  });
  assert.equal(status, 400);
  assert.match(
    String((body as { error?: string }).error ?? ""),
    /canvas group dimensions/i,
  );
  assert.equal(
    fake.getLastUpdateArg(),
    null,
    "no DB write should happen when validation rejects the patch",
  );
});

test("PATCH /api/screens/:id — Task #189: explicit canvasGroupId:null while canvasEnabled stays true auto-mints a fresh per-screen group (leave-group → solo screen)", async () => {
  // Operators "leave the wall to go solo" by selecting (none) in the
  // group picker. Rather than reject (which would block a legitimate
  // workflow), the handler mints a fresh per-screen group server-side
  // so the screen is independent immediately and the wall is left
  // alone.
  const groupId = "group-3840x1080";
  const fake = makeFakeStorageWithGroups(
    makeScreen({
      id: "screen-1",
      clientId: "client-A",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: groupId,
      name: "WallTile",
    }),
    [
      {
        id: groupId,
        clientId: "client-A",
        canvasWidth: 3840,
        canvasHeight: 1080,
        name: "Lobby Wall",
      },
    ],
  );

  const { status } = await withTestServer(fake.storage, {
    canvasGroupId: null,
  });
  assert.equal(status, 200, "leave-group should succeed, not 400");
  const updateArg = fake.getLastUpdateArg() as
    | { canvasGroupId?: string | null }
    | null;
  assert.ok(updateArg, "the handler must call updateScreen");
  assert.ok(
    updateArg!.canvasGroupId,
    "the auto-minted group's id must be persisted as the new canvasGroupId",
  );
  assert.notEqual(
    updateArg!.canvasGroupId,
    groupId,
    "the auto-minted group must be NEW, not the wall's group id",
  );
  assert.ok(
    fake.getCreatedGroups().some((g) => g.id === updateArg!.canvasGroupId),
    "the new canvasGroupId must correspond to a freshly-created group",
  );
});

test("PATCH /api/screens/:id — Task #189: disabling canvas clears canvasGroupId automatically", async () => {
  const groupId = "group-3840x1080";
  const fake = makeFakeStorageWithGroups(
    makeScreen({
      id: "screen-1",
      clientId: "client-A",
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasGroupId: groupId,
      name: "WallTile",
    }),
    [
      {
        id: groupId,
        clientId: "client-A",
        canvasWidth: 3840,
        canvasHeight: 1080,
        name: "Lobby Wall",
      },
    ],
  );

  const { status } = await withTestServer(fake.storage, {
    canvasEnabled: false,
  });
  assert.equal(status, 200);
  const persisted = fake.getLastUpdateArg();
  assert.ok(persisted, "PATCH should have produced a storage update");
  assert.equal(
    (persisted as { canvasGroupId?: string | null }).canvasGroupId,
    null,
    "disabling canvas must drop the group binding so no stale FK survives",
  );
  assert.equal(fake.getRow().canvasGroupId, null);
});

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountMediaLayoutRoutes,
  type MediaLayoutRoutesStorage,
} from "../server/mediaLayoutRoutes";
import type {
  Client,
  Event,
  MediaAsset,
  InsertMediaAsset,
  MediaFolder,
  MediaShare,
  InsertMediaShare,
  LayoutTemplate,
  InsertLayoutTemplate,
} from "../shared/schema";

// Task #256 — integration coverage for the media-asset and layout-template
// HTTP routes, mirroring tests/agenda-routes-tenant-scoping.test.ts.
//
// Mounts the extracted media/layout router (server/mediaLayoutRoutes.ts) on
// a throwaway Express app with a stub storage + an injectable "current
// user" so the tenant boundary (site A/C vs site B) is exercised end to end
// without a real DB or session/2FA flow. Exercises all three access levels:
// site_user (single site), account_manager (subset of sites), and admin
// (all sites).

interface FakeUser {
  role: "admin" | "account_manager" | "site_user";
  allowedClientIds: string[] | null; // null = admin (all)
}

// An account_manager granted siteA + siteC, but NOT siteB.
const MANAGER: FakeUser = {
  role: "account_manager",
  allowedClientIds: ["siteA", "siteC"],
};

function makeAsset(
  over: Partial<MediaAsset> & { id: string; clientId: string | null },
): MediaAsset {
  return {
    id: over.id,
    clientId: over.clientId,
    eventId: over.eventId ?? null,
    name: over.name ?? `Asset ${over.id}`,
    originalPath: over.originalPath ?? `/uploads/${over.id}.png`,
    thumbnailPath: over.thumbnailPath ?? null,
    mediaType: (over.mediaType ?? "image") as MediaAsset["mediaType"],
    mimeType: over.mimeType ?? "image/png",
    width: over.width ?? null,
    height: over.height ?? null,
    duration: over.duration ?? null,
    fileSize: over.fileSize ?? 1,
    checksum: over.checksum ?? null,
    tags: over.tags ?? null,
    displayMode: (over.displayMode ?? "cover") as MediaAsset["displayMode"],
    folderId: over.folderId ?? null,
    createdAt: over.createdAt ?? new Date("2026-05-01T00:00:00Z"),
  };
}

function makeLayout(
  over: Partial<LayoutTemplate> & { id: string; clientId: string | null },
): LayoutTemplate {
  return {
    id: over.id,
    clientId: over.clientId,
    eventId: over.eventId ?? null,
    name: over.name ?? `Layout ${over.id}`,
    version: over.version ?? 1,
    aspectRatio: over.aspectRatio ?? "16:9",
    customWidth: over.customWidth ?? null,
    customHeight: over.customHeight ?? null,
    zones: over.zones ?? [],
    profileOverrides: over.profileOverrides ?? null,
    locked: over.locked ?? false,
    createdAt: over.createdAt ?? new Date("2026-05-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-05-01T00:00:00Z"),
  };
}

function makeShare(mediaAssetId: string, clientId: string): MediaShare {
  return {
    id: `share-${mediaAssetId}-${clientId}`,
    mediaAssetId,
    clientId,
    sharedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

function makeFakeStorage(initial: {
  assets?: MediaAsset[];
  layouts?: LayoutTemplate[];
  shares?: MediaShare[];
  clients?: Client[];
  events?: Event[];
  folders?: MediaFolder[];
}): MediaLayoutRoutesStorage & {
  assets: MediaAsset[];
  layouts: LayoutTemplate[];
  shares: MediaShare[];
  folders: MediaFolder[];
} {
  const assets: MediaAsset[] = [...(initial.assets ?? [])];
  const layouts: LayoutTemplate[] = [...(initial.layouts ?? [])];
  const shares: MediaShare[] = [...(initial.shares ?? [])];
  const clients: Client[] = [...(initial.clients ?? [])];
  const events: Event[] = [...(initial.events ?? [])];
  const folders: MediaFolder[] = [...(initial.folders ?? [])];

  return {
    assets,
    layouts,
    shares,
    folders,
    async getMediaAssets() {
      return assets.slice();
    },
    async getMediaAsset(id) {
      return assets.find((a) => a.id === id);
    },
    async createMediaAsset(data: InsertMediaAsset) {
      const row = makeAsset({
        ...(data as any),
        id: `asset-${assets.length + 1}`,
        clientId: data.clientId ?? null,
      });
      assets.push(row);
      return row;
    },
    async updateMediaAsset(id, data) {
      const idx = assets.findIndex((a) => a.id === id);
      if (idx === -1) return undefined;
      assets[idx] = { ...assets[idx], ...(data as Partial<MediaAsset>) };
      return assets[idx];
    },
    async deleteMediaAsset(id) {
      const before = assets.length;
      const idx = assets.findIndex((a) => a.id === id);
      if (idx >= 0) assets.splice(idx, 1);
      return assets.length < before;
    },
    async getMediaFolders(clientId?: string) {
      return clientId ? folders.filter((f) => f.clientId === clientId) : folders.slice();
    },
    async getMediaFolder(id) {
      return folders.find((f) => f.id === id);
    },
    async createMediaFolder(data) {
      const row: MediaFolder = {
        id: `folder-${folders.length + 1}`,
        clientId: data.clientId,
        name: data.name,
        createdAt: new Date("2026-05-01T00:00:00Z"),
      };
      folders.push(row);
      return row;
    },
    async updateMediaFolder(id, data) {
      const idx = folders.findIndex((f) => f.id === id);
      if (idx === -1) return undefined;
      folders[idx] = { ...folders[idx], ...(data as Partial<MediaFolder>) };
      return folders[idx];
    },
    async deleteMediaFolder(id) {
      const before = folders.length;
      const idx = folders.findIndex((f) => f.id === id);
      if (idx >= 0) folders.splice(idx, 1);
      return folders.length < before;
    },
    async getMediaSharesForAsset(mediaAssetId) {
      return shares.filter((s) => s.mediaAssetId === mediaAssetId);
    },
    async getMediaSharesForClient(clientId) {
      return shares.filter((s) => s.clientId === clientId);
    },
    async createMediaShare(data: InsertMediaShare) {
      const row = makeShare(data.mediaAssetId, data.clientId);
      shares.push(row);
      return row;
    },
    async deleteMediaShare(mediaAssetId, clientId) {
      const before = shares.length;
      for (let i = shares.length - 1; i >= 0; i--) {
        if (shares[i].mediaAssetId === mediaAssetId && shares[i].clientId === clientId) {
          shares.splice(i, 1);
        }
      }
      return shares.length < before;
    },
    async getClient(id) {
      return clients.find((c) => c.id === id);
    },
    async getEvent(id) {
      return events.find((e) => e.id === id);
    },
    async getLayoutTemplates() {
      return layouts.slice();
    },
    async getLayoutTemplate(id) {
      return layouts.find((l) => l.id === id);
    },
    async createLayoutTemplate(data: InsertLayoutTemplate) {
      const row = makeLayout({
        ...(data as any),
        id: `layout-${layouts.length + 1}`,
        clientId: data.clientId ?? null,
      });
      layouts.push(row);
      return row;
    },
    async updateLayoutTemplate(id, data) {
      const idx = layouts.findIndex((l) => l.id === id);
      if (idx === -1) return undefined;
      layouts[idx] = { ...layouts[idx], ...(data as Partial<LayoutTemplate>) };
      return layouts[idx];
    },
    async deleteLayoutTemplate(id) {
      const before = layouts.length;
      const idx = layouts.findIndex((l) => l.id === id);
      if (idx >= 0) layouts.splice(idx, 1);
      return layouts.length < before;
    },
  };
}

async function startTestServer(opts: {
  storage: MediaLayoutRoutesStorage;
  user: FakeUser | null;
}) {
  const app = express();
  app.use(express.json());

  const inject = (req: Request, _res: Response, next: NextFunction) => {
    if (opts.user) {
      (req as any).dbUser = { id: "u-test", role: opts.user.role };
      (req as any).allowedClientIds =
        opts.user.role === "admin" ? null : opts.user.allowedClientIds;
    }
    next();
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!opts.user) return res.status(401).json({ error: "unauth" });
    next();
  };
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).dbUser;
    if (!u || u.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  app.use(inject);

  mountMediaLayoutRoutes(app, {
    storage: opts.storage,
    auth: {
      canAccessClient: (req, clientId) => {
        const u = (req as any).dbUser;
        if (!u) return false;
        if (u.role === "admin") return true;
        const allowed = (req as any).allowedClientIds as string[] | null;
        return allowed ? allowed.includes(clientId) : false;
      },
      getAllowedClientIds: (req) => (req as any).allowedClientIds ?? null,
    },
    requireAuth,
    requireAdmin,
    loadUserContext,
    fileStorage: {
      streamFile: () => {},
      saveFileFromDisk: async () => "stub/path.jpg",
      deleteFile: async () => true,
    },
    uploadSingle: (_req: any, _res: any, next: any) => next(),
    generateVideoThumbnail: async () => null,
    getVideoDuration: async () => null,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

// ============ MEDIA — site_user ============

test("media — site A user reads only site A assets and is denied site B", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA" });
  const b1 = makeAsset({ id: "b1", clientId: "siteB" });
  const storage = makeFakeStorage({ assets: [a1, b1] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const list = (await (await fetch(`${srv.base}/api/media`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((a) => a.id).sort(), ["a1"]);

    assert.equal((await fetch(`${srv.base}/api/media?clientId=siteB`)).status, 403);
    assert.equal((await fetch(`${srv.base}/api/media?clientId=siteA`)).status, 200);
  } finally {
    await srv.close();
  }
});

test("media — PATCH is tenant-scoped (Task #256 regression: site A user cannot edit a site B asset)", async () => {
  const b1 = makeAsset({ id: "b1", clientId: "siteB", name: "Original" });
  const storage = makeFakeStorage({ assets: [b1] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/media/b1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(res.status, 403);
    assert.equal(storage.assets[0].name, "Original", "site B asset must be untouched");
  } finally {
    await srv.close();
  }
});

test("media — PATCH cannot reassign an owned asset to a disallowed site (target check)", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA", name: "Original" });
  const storage = makeFakeStorage({ assets: [a1] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/media/a1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /target site/i);
    assert.equal(storage.assets[0].clientId, "siteA", "asset must not be moved");
  } finally {
    await srv.close();
  }
});

// ============ MEDIA — account_manager ============

test("account_manager — media: reads only allowed sites, scoped query 403 on disallowed", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA" });
  const b1 = makeAsset({ id: "b1", clientId: "siteB" });
  const c1 = makeAsset({ id: "c1", clientId: "siteC" });
  const storage = makeFakeStorage({ assets: [a1, b1, c1] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/media`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((a) => a.id).sort(), ["a1", "c1"]);

    assert.equal((await fetch(`${srv.base}/api/media?clientId=siteA`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/media?clientId=siteC`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/media?clientId=siteB`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("account_manager — media: shared asset surfaces in the unfiltered list", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA" });
  const b1 = makeAsset({ id: "b1", clientId: "siteB" });
  const b2 = makeAsset({ id: "b2", clientId: "siteB" });
  // siteC has explicit access to b1 via media_shares, but not b2.
  const storage = makeFakeStorage({
    assets: [a1, b1, b2],
    shares: [makeShare("b1", "siteC")],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/media`)).json()) as Array<{ id: string }>;
    assert.deepEqual(
      list.map((a) => a.id).sort(),
      ["a1", "b1"],
      "manager sees own-site assets plus the explicitly shared b1, never b2",
    );
  } finally {
    await srv.close();
  }
});

test("account_manager — media: create allowed in granted site, denied in disallowed", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const ok = await fetch(`${srv.base}/api/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteC",
        name: "New C asset",
        originalPath: "/uploads/new-c.png",
        mediaType: "image",
      }),
    });
    assert.equal(ok.status, 201);
    assert.equal(storage.assets.length, 1);
    assert.equal(storage.assets[0].clientId, "siteC");

    const denied = await fetch(`${srv.base}/api/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteB",
        name: "Injected B asset",
        originalPath: "/uploads/inject-b.png",
        mediaType: "image",
      }),
    });
    assert.equal(denied.status, 403);
    assert.equal(storage.assets.length, 1, "no siteB asset may be created");
  } finally {
    await srv.close();
  }
});

test("account_manager — media: edit/delete scoped, disallowed site rejected, cross-site move rejected", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA", name: "A" });
  const b1 = makeAsset({ id: "b1", clientId: "siteB", name: "B" });
  const c1 = makeAsset({ id: "c1", clientId: "siteC", name: "C" });
  const storage = makeFakeStorage({ assets: [a1, b1, c1] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    // Edit in an allowed site → 200.
    const patchC = await fetch(`${srv.base}/api/media/c1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed C" }),
    });
    assert.equal(patchC.status, 200);
    assert.equal(storage.assets.find((a) => a.id === "c1")?.name, "Renamed C");

    // Edit on the disallowed site → 403, row untouched.
    const patchB = await fetch(`${srv.base}/api/media/b1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(patchB.status, 403);
    assert.equal(storage.assets.find((a) => a.id === "b1")?.name, "B");

    // Cross-site move of an owned asset to a disallowed site → 403.
    const move = await fetch(`${srv.base}/api/media/a1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(move.status, 403);
    assert.equal(storage.assets.find((a) => a.id === "a1")?.clientId, "siteA");

    // Delete on the disallowed site → 403; delete in an allowed site → 204.
    const delB = await fetch(`${srv.base}/api/media/b1`, { method: "DELETE" });
    assert.equal(delB.status, 403);
    assert.ok(storage.assets.find((a) => a.id === "b1"), "siteB asset must survive");

    const delA = await fetch(`${srv.base}/api/media/a1`, { method: "DELETE" });
    assert.equal(delA.status, 204);
    assert.equal(storage.assets.find((a) => a.id === "a1"), undefined);
  } finally {
    await srv.close();
  }
});

// ============ LAYOUTS — account_manager ============

test("account_manager — layouts: reads only allowed sites (plus global), scoped query 403 on disallowed", async () => {
  const a1 = makeLayout({ id: "la", clientId: "siteA" });
  const b1 = makeLayout({ id: "lb", clientId: "siteB" });
  const c1 = makeLayout({ id: "lc", clientId: "siteC" });
  const global = makeLayout({ id: "lg", clientId: null });
  const storage = makeFakeStorage({ layouts: [a1, b1, c1, global] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/layouts`)).json()) as Array<{ id: string }>;
    assert.deepEqual(
      list.map((l) => l.id).sort(),
      ["la", "lc", "lg"],
      "manager sees own sites plus client-less (global) layouts, never siteB",
    );

    assert.equal((await fetch(`${srv.base}/api/layouts?clientId=siteA`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/layouts?clientId=siteB`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("account_manager — layouts: create allowed in granted site, denied in disallowed", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const ok = await fetch(`${srv.base}/api/layouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteC",
        name: "New C layout",
        aspectRatio: "16:9",
        zones: [],
      }),
    });
    assert.equal(ok.status, 201);
    assert.equal(storage.layouts.length, 1);
    assert.equal(storage.layouts[0].clientId, "siteC");

    const denied = await fetch(`${srv.base}/api/layouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteB",
        name: "Injected B layout",
        aspectRatio: "16:9",
        zones: [],
      }),
    });
    assert.equal(denied.status, 403);
    assert.equal(storage.layouts.length, 1, "no siteB layout may be created");
  } finally {
    await srv.close();
  }
});

test("account_manager — layouts: edit/delete scoped, disallowed site rejected, cross-site move rejected", async () => {
  const a1 = makeLayout({ id: "la", clientId: "siteA", name: "A" });
  const b1 = makeLayout({ id: "lb", clientId: "siteB", name: "B" });
  const c1 = makeLayout({ id: "lc", clientId: "siteC", name: "C" });
  const storage = makeFakeStorage({ layouts: [a1, b1, c1] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    // Edit in an allowed site → 200.
    const patchC = await fetch(`${srv.base}/api/layouts/lc`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed C" }),
    });
    assert.equal(patchC.status, 200);
    assert.equal(storage.layouts.find((l) => l.id === "lc")?.name, "Renamed C");

    // Edit on the disallowed site → 403, row untouched.
    const patchB = await fetch(`${srv.base}/api/layouts/lb`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(patchB.status, 403);
    assert.equal(storage.layouts.find((l) => l.id === "lb")?.name, "B");

    // Cross-site move of an owned layout to a disallowed site → 403.
    const move = await fetch(`${srv.base}/api/layouts/la`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(move.status, 403);
    assert.equal(storage.layouts.find((l) => l.id === "la")?.clientId, "siteA");

    // Delete on the disallowed site → 403; delete in an allowed site → 204.
    const delB = await fetch(`${srv.base}/api/layouts/lb`, { method: "DELETE" });
    assert.equal(delB.status, 403);
    assert.ok(storage.layouts.find((l) => l.id === "lb"), "siteB layout must survive");

    const delA = await fetch(`${srv.base}/api/layouts/la`, { method: "DELETE" });
    assert.equal(delA.status, 204);
    assert.equal(storage.layouts.find((l) => l.id === "la"), undefined);
  } finally {
    await srv.close();
  }
});

test("account_manager — layout admin-only moves (copy/move-to-site) are forbidden for non-admins", async () => {
  const a1 = makeLayout({ id: "la", clientId: "siteA" });
  const storage = makeFakeStorage({
    layouts: [a1],
    clients: [{ id: "siteC", name: "Site C" } as Client],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const copy = await fetch(`${srv.base}/api/layouts/la/copy-to-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetClientId: "siteC" }),
    });
    assert.equal(copy.status, 403);

    const move = await fetch(`${srv.base}/api/layouts/la/move-to-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetClientId: "siteC" }),
    });
    assert.equal(move.status, 403);
    assert.equal(storage.layouts.length, 1, "no copy created, original not moved");
    assert.equal(storage.layouts[0].clientId, "siteA");
  } finally {
    await srv.close();
  }
});

// ============ ADMIN ============

test("admin — can read, edit, and delete media/layouts across any site", async () => {
  const b1 = makeAsset({ id: "b1", clientId: "siteB", name: "B asset" });
  const lb = makeLayout({ id: "lb", clientId: "siteB", name: "B layout" });
  const storage = makeFakeStorage({ assets: [b1], layouts: [lb] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    // Reads are unfiltered for admin.
    const media = (await (await fetch(`${srv.base}/api/media`)).json()) as Array<{ id: string }>;
    assert.deepEqual(media.map((a) => a.id), ["b1"]);
    assert.equal((await fetch(`${srv.base}/api/media?clientId=siteB`)).status, 200);

    // Admin can edit a site B asset.
    const patchAsset = await fetch(`${srv.base}/api/media/b1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed by admin" }),
    });
    assert.equal(patchAsset.status, 200);
    assert.equal(storage.assets[0].name, "Renamed by admin");

    // Admin can edit a site B layout.
    const patchLayout = await fetch(`${srv.base}/api/layouts/lb`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Layout renamed by admin" }),
    });
    assert.equal(patchLayout.status, 200);
    assert.equal(storage.layouts[0].name, "Layout renamed by admin");

    // Admin delete works across sites.
    assert.equal((await fetch(`${srv.base}/api/media/b1`, { method: "DELETE" })).status, 204);
    assert.equal((await fetch(`${srv.base}/api/layouts/lb`, { method: "DELETE" })).status, 204);
  } finally {
    await srv.close();
  }
});

// ============ MEDIA FOLDERS — Task #265 ============

function makeFolder(id: string, clientId: string, name?: string): MediaFolder {
  return {
    id,
    clientId,
    name: name ?? `Folder ${id}`,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  };
}

test("folders — list is tenant-scoped (manager sees own sites only), scoped query 403 on disallowed", async () => {
  const fa = makeFolder("fa", "siteA");
  const fb = makeFolder("fb", "siteB");
  const fc = makeFolder("fc", "siteC");
  const storage = makeFakeStorage({ folders: [fa, fb, fc] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/media-folders`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((f) => f.id).sort(), ["fa", "fc"], "manager never sees siteB folder");

    assert.equal((await fetch(`${srv.base}/api/media-folders?clientId=siteA`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/media-folders?clientId=siteB`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("folders — create allowed in granted site, denied in disallowed", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const ok = await fetch(`${srv.base}/api/media-folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteC", name: "Promotions" }),
    });
    assert.equal(ok.status, 201);
    assert.equal(storage.folders.length, 1);
    assert.equal(storage.folders[0].clientId, "siteC");

    const denied = await fetch(`${srv.base}/api/media-folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB", name: "Injected" }),
    });
    assert.equal(denied.status, 403);
    assert.equal(storage.folders.length, 1, "no siteB folder may be created");
  } finally {
    await srv.close();
  }
});

test("folders — rename scoped to allowed site; disallowed rejected; site cannot change", async () => {
  const fc = makeFolder("fc", "siteC", "Old name");
  const fb = makeFolder("fb", "siteB", "B name");
  const storage = makeFakeStorage({ folders: [fc, fb] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const ok = await fetch(`${srv.base}/api/media-folders/fc`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New name", clientId: "siteA" }),
    });
    assert.equal(ok.status, 200);
    const updated = storage.folders.find((f) => f.id === "fc")!;
    assert.equal(updated.name, "New name");
    assert.equal(updated.clientId, "siteC", "clientId is omitted server-side — folder can't move sites");

    const denied = await fetch(`${srv.base}/api/media-folders/fb`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(denied.status, 403);
    assert.equal(storage.folders.find((f) => f.id === "fb")?.name, "B name");
  } finally {
    await srv.close();
  }
});

test("folders — delete scoped; disallowed rejected; does NOT delete assets", async () => {
  const fc = makeFolder("fc", "siteC");
  const fb = makeFolder("fb", "siteB");
  const inFolder = makeAsset({ id: "c1", clientId: "siteC", folderId: "fc" });
  const storage = makeFakeStorage({ folders: [fc, fb], assets: [inFolder] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const denied = await fetch(`${srv.base}/api/media-folders/fb`, { method: "DELETE" });
    assert.equal(denied.status, 403);
    assert.ok(storage.folders.find((f) => f.id === "fb"), "siteB folder must survive");

    const ok = await fetch(`${srv.base}/api/media-folders/fc`, { method: "DELETE" });
    assert.equal(ok.status, 204);
    assert.equal(storage.folders.find((f) => f.id === "fc"), undefined);
    assert.ok(
      storage.assets.find((a) => a.id === "c1"),
      "deleting a folder must NOT delete the assets inside it",
    );
  } finally {
    await srv.close();
  }
});

test("media create/patch — folderId must belong to the asset's site", async () => {
  const fa = makeFolder("fa", "siteA");
  const fc = makeFolder("fc", "siteC");
  const c1 = makeAsset({ id: "c1", clientId: "siteC" });
  const storage = makeFakeStorage({ folders: [fa, fc], assets: [c1] });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    // Create with a folder from a different site → 400.
    const badCreate = await fetch(`${srv.base}/api/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteC",
        name: "Mismatched",
        originalPath: "/uploads/x.png",
        mediaType: "image",
        folderId: "fa",
      }),
    });
    assert.equal(badCreate.status, 400);

    // Create with a matching folder → 201.
    const okCreate = await fetch(`${srv.base}/api/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteC",
        name: "Matched",
        originalPath: "/uploads/y.png",
        mediaType: "image",
        folderId: "fc",
      }),
    });
    assert.equal(okCreate.status, 201);

    // PATCH move into a same-site folder → 200.
    const okMove = await fetch(`${srv.base}/api/media/c1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: "fc" }),
    });
    assert.equal(okMove.status, 200);
    assert.equal(storage.assets.find((a) => a.id === "c1")?.folderId, "fc");

    // PATCH move into a cross-site folder → 400.
    const badMove = await fetch(`${srv.base}/api/media/c1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: "fa" }),
    });
    assert.equal(badMove.status, 400);
  } finally {
    await srv.close();
  }
});

test("media PATCH — moving an asset to a new site without a folderId drops its stale folder", async () => {
  // Admin can move assets across sites. The asset starts in siteA's folder
  // "fa"; moving it to siteB without naming a folder must clear folderId so
  // it can't dangle cross-site.
  const fa = makeFolder("fa", "siteA");
  const a1 = makeAsset({ id: "a1", clientId: "siteA", folderId: "fa" });
  const storage = makeFakeStorage({ folders: [fa], assets: [a1] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const res = await fetch(`${srv.base}/api/media/a1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(res.status, 200);
    const moved = storage.assets.find((a) => a.id === "a1")!;
    assert.equal(moved.clientId, "siteB");
    assert.equal(moved.folderId, null, "stale siteA folder must be cleared on cross-site move");
  } finally {
    await srv.close();
  }
});

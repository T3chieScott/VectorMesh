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
  LayoutFolder,
  LayoutTemplate,
  InsertLayoutTemplate,
} from "../shared/schema";

// Task #312 — route-level regression tests locking in tenant scoping for
// scene (layout) folders, mirroring tests/media-layout-routes-tenant-scoping.test.ts.
//
// Covers:
//  - site users cannot list/create/rename/delete folders on other sites
//  - PATCH /api/layout-folders/:id rejects clientId changes (folders never move sites)
//  - POST/PATCH /api/layouts reject a folderId from a different site
//  - moving a scene to another site (PATCH clientId or admin move-to-site)
//    nulls its folderId

interface FakeUser {
  role: "admin" | "account_manager" | "site_user";
  allowedClientIds: string[] | null;
}

const SITE_A_USER: FakeUser = { role: "site_user", allowedClientIds: ["siteA"] };

function makeFolder(over: Partial<LayoutFolder> & { id: string; clientId: string }): LayoutFolder {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? `Folder ${over.id}`,
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
    folderId: over.folderId ?? null,
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

function makeFakeStorage(initial: {
  layouts?: LayoutTemplate[];
  layoutFolders?: LayoutFolder[];
  clients?: Client[];
  events?: Event[];
}): MediaLayoutRoutesStorage & {
  layouts: LayoutTemplate[];
  layoutFolders: LayoutFolder[];
} {
  const layouts: LayoutTemplate[] = [...(initial.layouts ?? [])];
  const layoutFolders: LayoutFolder[] = [...(initial.layoutFolders ?? [])];
  const clients: Client[] = [...(initial.clients ?? [])];
  const events: Event[] = [...(initial.events ?? [])];

  return {
    layouts,
    layoutFolders,
    async getMediaAssets() {
      return [];
    },
    async getMediaAsset() {
      return undefined;
    },
    async createMediaAsset() {
      throw new Error("not used");
    },
    async updateMediaAsset() {
      return undefined;
    },
    async deleteMediaAsset() {
      return false;
    },
    async getMediaFolders() {
      return [];
    },
    async getMediaFolder() {
      return undefined;
    },
    async createMediaFolder() {
      throw new Error("not used");
    },
    async updateMediaFolder() {
      return undefined;
    },
    async deleteMediaFolder() {
      return false;
    },
    async getMediaSharesForAsset() {
      return [];
    },
    async getMediaSharesForClient() {
      return [];
    },
    async createMediaShare() {
      throw new Error("not used");
    },
    async deleteMediaShare() {
      return false;
    },
    async getClient(id) {
      return clients.find((c) => c.id === id);
    },
    async getEvent(id) {
      return events.find((e) => e.id === id);
    },
    async getLayoutFolders(clientId?: string) {
      return clientId
        ? layoutFolders.filter((f) => f.clientId === clientId)
        : layoutFolders.slice();
    },
    async getLayoutFolder(id) {
      return layoutFolders.find((f) => f.id === id);
    },
    async createLayoutFolder(data) {
      const row = makeFolder({
        id: `folder-${layoutFolders.length + 1}`,
        clientId: data.clientId,
        name: data.name,
      });
      layoutFolders.push(row);
      return row;
    },
    async updateLayoutFolder(id, data) {
      const idx = layoutFolders.findIndex((f) => f.id === id);
      if (idx === -1) return undefined;
      layoutFolders[idx] = { ...layoutFolders[idx], ...(data as Partial<LayoutFolder>) };
      return layoutFolders[idx];
    },
    async deleteLayoutFolder(id) {
      const before = layoutFolders.length;
      const idx = layoutFolders.findIndex((f) => f.id === id);
      if (idx >= 0) layoutFolders.splice(idx, 1);
      return layoutFolders.length < before;
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

const JSON_HEADERS = { "Content-Type": "application/json" };

// ============ FOLDER LIST ============

test("folders — site A user lists only site A folders; scoped query to site B is 403", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const fb = makeFolder({ id: "fb", clientId: "siteB" });
  const storage = makeFakeStorage({ layoutFolders: [fa, fb] });
  const srv = await startTestServer({ storage, user: SITE_A_USER });
  try {
    const list = (await (await fetch(`${srv.base}/api/layout-folders`)).json()) as Array<{
      id: string;
    }>;
    assert.deepEqual(list.map((f) => f.id), ["fa"], "site B folder must never appear");

    assert.equal((await fetch(`${srv.base}/api/layout-folders?clientId=siteB`)).status, 403);
    assert.equal((await fetch(`${srv.base}/api/layout-folders?clientId=siteA`)).status, 200);
  } finally {
    await srv.close();
  }
});

test("folders — admin lists all folders across sites", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const fb = makeFolder({ id: "fb", clientId: "siteB" });
  const storage = makeFakeStorage({ layoutFolders: [fa, fb] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const list = (await (await fetch(`${srv.base}/api/layout-folders`)).json()) as Array<{
      id: string;
    }>;
    assert.deepEqual(list.map((f) => f.id).sort(), ["fa", "fb"]);
  } finally {
    await srv.close();
  }
});

// ============ FOLDER CREATE ============

test("folders — site A user can create in site A but not site B", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({ storage, user: SITE_A_USER });
  try {
    const ok = await fetch(`${srv.base}/api/layout-folders`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ clientId: "siteA", name: "A folder" }),
    });
    assert.equal(ok.status, 201);
    assert.equal(storage.layoutFolders.length, 1);
    assert.equal(storage.layoutFolders[0].clientId, "siteA");

    const denied = await fetch(`${srv.base}/api/layout-folders`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ clientId: "siteB", name: "Injected B folder" }),
    });
    assert.equal(denied.status, 403);
    assert.equal(storage.layoutFolders.length, 1, "no siteB folder may be created");
  } finally {
    await srv.close();
  }
});

// ============ FOLDER RENAME / DELETE ============

test("folders — site A user cannot rename or delete a site B folder", async () => {
  const fb = makeFolder({ id: "fb", clientId: "siteB", name: "B folder" });
  const storage = makeFakeStorage({ layoutFolders: [fb] });
  const srv = await startTestServer({ storage, user: SITE_A_USER });
  try {
    const rename = await fetch(`${srv.base}/api/layout-folders/fb`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(rename.status, 403);
    assert.equal(storage.layoutFolders[0].name, "B folder", "site B folder must be untouched");

    const del = await fetch(`${srv.base}/api/layout-folders/fb`, { method: "DELETE" });
    assert.equal(del.status, 403);
    assert.equal(storage.layoutFolders.length, 1, "site B folder must survive");
  } finally {
    await srv.close();
  }
});

test("folders — rename works within own site; clientId in PATCH body is ignored (folders never move sites)", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA", name: "Old name" });
  const storage = makeFakeStorage({ layoutFolders: [fa] });
  const srv = await startTestServer({ storage, user: SITE_A_USER });
  try {
    const res = await fetch(`${srv.base}/api/layout-folders/fa`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "New name", clientId: "siteB" }),
    });
    assert.equal(res.status, 200);
    assert.equal(storage.layoutFolders[0].name, "New name");
    assert.equal(
      storage.layoutFolders[0].clientId,
      "siteA",
      "clientId must be stripped — a folder can never change site",
    );
  } finally {
    await srv.close();
  }
});

test("folders — even an admin cannot move a folder to another site via PATCH", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const storage = makeFakeStorage({ layoutFolders: [fa] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const res = await fetch(`${srv.base}/api/layout-folders/fa`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(res.status, 200);
    assert.equal(storage.layoutFolders[0].clientId, "siteA", "clientId change must be ignored");
  } finally {
    await srv.close();
  }
});

// ============ SCENE folderId VALIDATION ============

test("scenes — POST /api/layouts rejects a folderId from a different site", async () => {
  const fb = makeFolder({ id: "fb", clientId: "siteB" });
  const storage = makeFakeStorage({ layoutFolders: [fb] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const res = await fetch(`${srv.base}/api/layouts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        clientId: "siteA",
        name: "Bad folder ref",
        aspectRatio: "16:9",
        zones: [],
        folderId: "fb",
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(String(body.error), /folder/i);
    assert.equal(storage.layouts.length, 0, "layout must not be created");
  } finally {
    await srv.close();
  }
});

test("scenes — POST /api/layouts rejects a nonexistent folderId, accepts a same-site one", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const storage = makeFakeStorage({ layoutFolders: [fa] });
  const srv = await startTestServer({ storage, user: SITE_A_USER });
  try {
    const missing = await fetch(`${srv.base}/api/layouts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        clientId: "siteA",
        name: "Missing folder",
        aspectRatio: "16:9",
        zones: [],
        folderId: "does-not-exist",
      }),
    });
    assert.equal(missing.status, 400);

    const ok = await fetch(`${srv.base}/api/layouts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        clientId: "siteA",
        name: "Good folder",
        aspectRatio: "16:9",
        zones: [],
        folderId: "fa",
      }),
    });
    assert.equal(ok.status, 201);
    assert.equal(storage.layouts.length, 1);
    assert.equal(storage.layouts[0].folderId, "fa");
  } finally {
    await srv.close();
  }
});

test("scenes — PATCH /api/layouts rejects a folderId from a different site", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const fb = makeFolder({ id: "fb", clientId: "siteB" });
  const la = makeLayout({ id: "la", clientId: "siteA" });
  const storage = makeFakeStorage({ layoutFolders: [fa, fb], layouts: [la] });
  const srv = await startTestServer({ storage, user: SITE_A_USER });
  try {
    const bad = await fetch(`${srv.base}/api/layouts/la`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ folderId: "fb" }),
    });
    assert.equal(bad.status, 400);
    assert.equal(storage.layouts[0].folderId, null, "cross-site folder must be rejected");

    const ok = await fetch(`${srv.base}/api/layouts/la`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ folderId: "fa" }),
    });
    assert.equal(ok.status, 200);
    assert.equal(storage.layouts[0].folderId, "fa");
  } finally {
    await srv.close();
  }
});

test("scenes — PATCH validates folderId against the NEW clientId when both change", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const fb = makeFolder({ id: "fb", clientId: "siteB" });
  const la = makeLayout({ id: "la", clientId: "siteA", folderId: "fa" });
  const storage = makeFakeStorage({ layoutFolders: [fa, fb], layouts: [la] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    // Moving to siteB while keeping the siteA folder must fail.
    const bad = await fetch(`${srv.base}/api/layouts/la`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ clientId: "siteB", folderId: "fa" }),
    });
    assert.equal(bad.status, 400);
    assert.equal(storage.layouts[0].clientId, "siteA", "move must be rejected wholesale");

    // Moving to siteB with a siteB folder is fine.
    const ok = await fetch(`${srv.base}/api/layouts/la`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ clientId: "siteB", folderId: "fb" }),
    });
    assert.equal(ok.status, 200);
    assert.equal(storage.layouts[0].clientId, "siteB");
    assert.equal(storage.layouts[0].folderId, "fb");
  } finally {
    await srv.close();
  }
});

// ============ MOVING A SCENE NULLS folderId ============

test("scenes — PATCH moving a scene to another site without folderId nulls the old folder", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const la = makeLayout({ id: "la", clientId: "siteA", folderId: "fa" });
  const storage = makeFakeStorage({ layoutFolders: [fa], layouts: [la] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const res = await fetch(`${srv.base}/api/layouts/la`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(res.status, 200);
    assert.equal(storage.layouts[0].clientId, "siteB");
    assert.equal(
      storage.layouts[0].folderId,
      null,
      "old-site folder must be dropped when the scene moves site",
    );
  } finally {
    await srv.close();
  }
});

test("scenes — admin move-to-site nulls the folderId", async () => {
  const fa = makeFolder({ id: "fa", clientId: "siteA" });
  const la = makeLayout({ id: "la", clientId: "siteA", folderId: "fa" });
  const storage = makeFakeStorage({
    layoutFolders: [fa],
    layouts: [la],
    clients: [{ id: "siteB", name: "Site B" } as Client],
  });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const res = await fetch(`${srv.base}/api/layouts/la/move-to-site`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ targetClientId: "siteB" }),
    });
    assert.equal(res.status, 200);
    assert.equal(storage.layouts[0].clientId, "siteB");
    assert.equal(
      storage.layouts[0].folderId,
      null,
      "move-to-site must not leave the scene pointing at the old site's folder",
    );
  } finally {
    await srv.close();
  }
});

// ============ UNAUTHENTICATED ============

test("folders — unauthenticated requests are rejected", async () => {
  const storage = makeFakeStorage({ layoutFolders: [makeFolder({ id: "fa", clientId: "siteA" })] });
  const srv = await startTestServer({ storage, user: null });
  try {
    assert.equal((await fetch(`${srv.base}/api/layout-folders`)).status, 401);
    assert.equal(
      (
        await fetch(`${srv.base}/api/layout-folders`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ clientId: "siteA", name: "x" }),
        })
      ).status,
      401,
    );
  } finally {
    await srv.close();
  }
});

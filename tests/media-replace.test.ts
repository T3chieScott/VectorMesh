import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
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

// Integration tests for POST /api/media/:id/replace (Task #321).
//
// Uses real multer disk storage on a temp directory so that req.file is
// actually populated — the same way the production server works. File-system
// side-effects (saveFileFromDisk, deleteFile) are tracked via stubs so we can
// assert the right paths were touched without touching the real upload root.

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

function makeFakeStorage(initial: {
  assets?: MediaAsset[];
}): MediaLayoutRoutesStorage & { assets: MediaAsset[] } {
  const assets: MediaAsset[] = [...(initial.assets ?? [])];
  const noop = async () => undefined as any;
  return {
    assets,
    async getMediaAssets() { return assets.slice(); },
    async getMediaAsset(id) { return assets.find((a) => a.id === id); },
    async createMediaAsset(data: InsertMediaAsset) {
      const row = makeAsset({ ...(data as any), id: `asset-new`, clientId: data.clientId ?? null });
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
    async getMediaFolders() { return []; },
    async getMediaFolder() { return undefined; },
    async createMediaFolder(data) {
      return { id: "f1", clientId: data.clientId, name: data.name, createdAt: new Date() };
    },
    async updateMediaFolder() { return undefined; },
    async deleteMediaFolder() { return false; },
    async getMediaSharesForAsset() { return []; },
    async getMediaSharesForClient() { return []; },
    async createMediaShare(data: InsertMediaShare) {
      return { id: "s1", mediaAssetId: data.mediaAssetId, clientId: data.clientId, sharedAt: new Date() };
    },
    async deleteMediaShare() { return false; },
    async getClient() { return undefined; },
    async getEvent() { return undefined; },
    async getLayoutFolders() { return []; },
    async getLayoutFolder() { return undefined; },
    async createLayoutFolder(data) {
      return { id: "lf1", clientId: data.clientId, name: data.name, createdAt: new Date() };
    },
    async updateLayoutFolder() { return undefined; },
    async deleteLayoutFolder() { return false; },
    async getLayoutTemplates() { return []; },
    async getLayoutTemplate() { return undefined; },
    async createLayoutTemplate(data: InsertLayoutTemplate) {
      return {
        id: "lt1", clientId: data.clientId ?? null, eventId: null,
        name: data.name, version: 1, aspectRatio: "16:9",
        customWidth: null, customHeight: null, zones: [], profileOverrides: null,
        locked: false, createdAt: new Date(), updatedAt: new Date(),
      };
    },
    async updateLayoutTemplate() { return undefined; },
    async deleteLayoutTemplate() { return false; },
  };
}

interface TestServerOpts {
  storage: MediaLayoutRoutesStorage;
  role?: "admin" | "account_manager" | "site_user";
  allowedClientIds?: string[] | null;
  savedPaths?: string[];
  deletedPaths?: string[];
  tmpDir?: string;
}

async function startReplaceServer(opts: TestServerOpts) {
  const tmpDir = opts.tmpDir ?? (await fsp.mkdtemp(path.join(os.tmpdir(), "vm-replace-test-")));
  const savedPaths = opts.savedPaths ?? [];
  const deletedPaths = opts.deletedPaths ?? [];

  const app = express();
  app.use(express.json());

  const role = opts.role ?? "admin";
  const allowedClientIds = opts.allowedClientIds ?? null;

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbUser = { id: "u-test", role };
    (req as any).allowedClientIds = allowedClientIds;
    next();
  });

  const requireAuth = (_req: Request, _res: Response, next: NextFunction) => next();
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).dbUser;
    if (!u || u.role !== "admin") return res.status(403).json({ error: "forbidden" });
    next();
  };
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  // Use real multer disk storage so req.file is populated from multipart data.
  const upload = multer({ storage: multer.diskStorage({ destination: tmpDir }) });
  const uploadSingle = upload.single("file");

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
    uploadSingle,
    fileStorage: {
      streamFile: () => {},
      saveFileFromDisk: async (tempPath, originalName, contentType, clientId) => {
        const newPath = `/uploads/${clientId}/${Date.now()}-${originalName}`;
        savedPaths.push(newPath);
        return newPath;
      },
      deleteFile: async (storagePath) => {
        deletedPaths.push(storagePath);
        return true;
      },
    },
    generateVideoThumbnail: async () => null,
    getVideoDuration: async () => null,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    base: `http://127.0.0.1:${port}`,
    tmpDir,
    savedPaths,
    deletedPaths,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await fsp.rm(tmpDir, { recursive: true, force: true });
    },
  };
}

function makeFormData(filename: string, mimeType: string, content: string): FormData {
  const fd = new FormData();
  fd.append("file", new Blob([content], { type: mimeType }), filename);
  return fd;
}

// ============ REPLACE — happy path ============

test("replace — uploads a new image over an existing image asset and updates DB record", async () => {
  const oldPath = "/uploads/siteA/old-image.png";
  const a1 = makeAsset({ id: "a1", clientId: "siteA", originalPath: oldPath, mediaType: "image", mimeType: "image/png" });
  const storage = makeFakeStorage({ assets: [a1] });
  const savedPaths: string[] = [];
  const deletedPaths: string[] = [];

  const srv = await startReplaceServer({ storage, role: "admin", savedPaths, deletedPaths });
  try {
    const res = await fetch(`${srv.base}/api/media/a1/replace`, {
      method: "POST",
      body: makeFormData("new-image.png", "image/png", "fake-png-bytes"),
    });
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);

    const body = await res.json() as MediaAsset;

    // DB record must have a new originalPath (the stub returns a new UUID path).
    assert.notEqual(body.originalPath, oldPath, "originalPath must have changed");
    assert.equal(savedPaths.length, 1, "saveFileFromDisk must be called once");
    assert.equal(body.originalPath, savedPaths[0], "DB record must reflect the newly saved path");

    // Old file must have been queued for deletion.
    assert.ok(
      deletedPaths.includes(oldPath),
      `old file ${oldPath} must appear in deletedPaths (got: ${JSON.stringify(deletedPaths)})`,
    );

    // In-memory asset must also be updated.
    const inMem = storage.assets.find((a) => a.id === "a1")!;
    assert.equal(inMem.originalPath, savedPaths[0]);
    assert.equal(inMem.name, "new-image.png");
  } finally {
    await srv.close();
  }
});

// ============ REPLACE — media-type mismatch ============

test("replace — returns 400 when uploading a video over an image asset", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA", mediaType: "image", mimeType: "image/png" });
  const storage = makeFakeStorage({ assets: [a1] });
  const savedPaths: string[] = [];
  const deletedPaths: string[] = [];

  const srv = await startReplaceServer({ storage, role: "admin", savedPaths, deletedPaths });
  try {
    const res = await fetch(`${srv.base}/api/media/a1/replace`, {
      method: "POST",
      body: makeFormData("clip.mp4", "video/mp4", "fake-video-bytes"),
    });
    assert.equal(res.status, 400, `expected 400 type-mismatch, got ${res.status}`);

    const body = await res.json() as { error: string };
    assert.match(body.error, /cannot replace/i);

    // No file must have been saved and the original must be untouched.
    assert.equal(savedPaths.length, 0, "saveFileFromDisk must not be called on mismatch");
    assert.equal(deletedPaths.length, 0, "deleteFile must not be called on mismatch");
    assert.equal(
      storage.assets.find((a) => a.id === "a1")?.originalPath,
      `/uploads/a1.png`,
      "original asset must be unchanged",
    );
  } finally {
    await srv.close();
  }
});

// ============ REPLACE — tenant access control ============

test("replace — returns 403 when a site-user targets an asset on a different site", async () => {
  const b1 = makeAsset({ id: "b1", clientId: "siteB", mediaType: "image", mimeType: "image/png" });
  const storage = makeFakeStorage({ assets: [b1] });
  const savedPaths: string[] = [];

  const srv = await startReplaceServer({
    storage,
    role: "site_user",
    allowedClientIds: ["siteA"],
    savedPaths,
  });
  try {
    const res = await fetch(`${srv.base}/api/media/b1/replace`, {
      method: "POST",
      body: makeFormData("new.png", "image/png", "fake-png-bytes"),
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    assert.equal(savedPaths.length, 0, "saveFileFromDisk must not be called on denied request");
  } finally {
    await srv.close();
  }
});

// ============ REPLACE — asset not found ============

test("replace — returns 404 when the target asset does not exist", async () => {
  const storage = makeFakeStorage({ assets: [] });
  const srv = await startReplaceServer({ storage, role: "admin" });
  try {
    const res = await fetch(`${srv.base}/api/media/nonexistent/replace`, {
      method: "POST",
      body: makeFormData("img.png", "image/png", "fake-png-bytes"),
    });
    assert.equal(res.status, 404, `expected 404, got ${res.status}`);
  } finally {
    await srv.close();
  }
});

// ============ REPLACE — no file ============

test("replace — returns 400 when no file is included in the request", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA", mediaType: "image", mimeType: "image/png" });
  const storage = makeFakeStorage({ assets: [a1] });
  const srv = await startReplaceServer({ storage, role: "admin" });
  try {
    // Send a multipart body with a non-file text field so multer runs but
    // doesn't populate req.file.
    const fd = new FormData();
    fd.append("notafile", "hello");
    const res = await fetch(`${srv.base}/api/media/a1/replace`, {
      method: "POST",
      body: fd,
    });
    assert.equal(res.status, 400, `expected 400 (no file), got ${res.status}`);
    const body = await res.json() as { error: string };
    assert.match(body.error, /no file/i);
  } finally {
    await srv.close();
  }
});

// ============ REPLACE — GIF type is preserved ============

test("replace — GIF-to-GIF replacement succeeds and preserves media type", async () => {
  const a1 = makeAsset({ id: "a1", clientId: "siteA", mediaType: "gif", mimeType: "image/gif", originalPath: "/uploads/siteA/old.gif" });
  const storage = makeFakeStorage({ assets: [a1] });
  const savedPaths: string[] = [];

  const srv = await startReplaceServer({ storage, role: "admin", savedPaths });
  try {
    const res = await fetch(`${srv.base}/api/media/a1/replace`, {
      method: "POST",
      body: makeFormData("new.gif", "image/gif", "fake-gif-bytes"),
    });
    assert.equal(res.status, 200, `expected 200 for GIF-to-GIF, got ${res.status}`);
    assert.equal(savedPaths.length, 1);
    const updated = storage.assets.find((a) => a.id === "a1")!;
    assert.equal(updated.mediaType, "gif");
    assert.equal(updated.originalPath, savedPaths[0]);
  } finally {
    await srv.close();
  }
});

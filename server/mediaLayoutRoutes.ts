import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import {
  insertMediaAssetSchema,
  insertMediaFolderSchema,
  insertLayoutTemplateSchema,
  insertLayoutFolderSchema,
  type Client,
  type Event,
  type MediaAsset,
  type InsertMediaAsset,
  type MediaFolder,
  type InsertMediaFolder,
  type MediaShare,
  type InsertMediaShare,
  type LayoutTemplate,
  type InsertLayoutTemplate,
  type LayoutFolder,
  type InsertLayoutFolder,
} from "@shared/schema";
import { sanitizeHtmlZones } from "@shared/html-widget-sanitize";
import { getPathParam, getQueryString } from "./requestParams";

export interface MediaLayoutRoutesStorage {
  getMediaAssets(): Promise<MediaAsset[]>;
  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  createMediaAsset(data: InsertMediaAsset): Promise<MediaAsset>;
  updateMediaAsset(
    id: string,
    data: Partial<InsertMediaAsset>,
  ): Promise<MediaAsset | undefined>;
  deleteMediaAsset(id: string): Promise<boolean>;
  getMediaFolders(clientId?: string): Promise<MediaFolder[]>;
  getMediaFolder(id: string): Promise<MediaFolder | undefined>;
  createMediaFolder(data: InsertMediaFolder): Promise<MediaFolder>;
  updateMediaFolder(id: string, data: Partial<InsertMediaFolder>): Promise<MediaFolder | undefined>;
  deleteMediaFolder(id: string): Promise<boolean>;
  getMediaSharesForAsset(mediaAssetId: string): Promise<MediaShare[]>;
  getMediaSharesForClient(clientId: string): Promise<MediaShare[]>;
  createMediaShare(data: InsertMediaShare): Promise<MediaShare>;
  deleteMediaShare(mediaAssetId: string, clientId: string): Promise<boolean>;
  getClient(id: string): Promise<Client | undefined>;
  getEvent(id: string): Promise<Event | undefined>;
  getLayoutFolders(clientId?: string): Promise<LayoutFolder[]>;
  getLayoutFolder(id: string): Promise<LayoutFolder | undefined>;
  createLayoutFolder(data: InsertLayoutFolder): Promise<LayoutFolder>;
  updateLayoutFolder(id: string, data: Partial<InsertLayoutFolder>): Promise<LayoutFolder | undefined>;
  deleteLayoutFolder(id: string): Promise<boolean>;
  getLayoutTemplates(): Promise<LayoutTemplate[]>;
  getLayoutTemplate(id: string): Promise<LayoutTemplate | undefined>;
  createLayoutTemplate(data: InsertLayoutTemplate): Promise<LayoutTemplate>;
  updateLayoutTemplate(
    id: string,
    data: Partial<InsertLayoutTemplate>,
  ): Promise<LayoutTemplate | undefined>;
  deleteLayoutTemplate(id: string): Promise<boolean>;
}

export interface MediaLayoutRoutesAuth {
  canAccessClient(req: Request, clientId: string): boolean;
  getAllowedClientIds(req: Request): string[] | null;
}

export interface MediaLayoutFileStorage {
  streamFile(path: string, res: Response, req: Request): Promise<void> | void;
}

export interface MediaLayoutRoutesDeps {
  storage: MediaLayoutRoutesStorage;
  auth: MediaLayoutRoutesAuth;
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  loadUserContext: (req: Request, res: Response, next: NextFunction) => any;
  logAudit?: (
    req: Request,
    action: string,
    entityType: string,
    entityId?: string,
    payload?: any,
  ) => void;
  fileStorage: MediaLayoutFileStorage;
  generateVideoThumbnail: (
    originalPath: string,
    clientId: string,
  ) => Promise<string | null | undefined>;
  getVideoDuration: (originalPath: string) => Promise<number | null | undefined>;
}

/**
 * Mounts the Media Asset and Layout Template routes on the given Express
 * app. Extracted from server/routes.ts (Task #256) so the tenant-scoping
 * behaviour for every access level (site_user, account_manager, admin) can
 * be exercised in isolation with a stub storage and an injected
 * auth/user context (see tests/media-layout-routes-tenant-scoping.test.ts).
 */
export function mountMediaLayoutRoutes(app: Express, deps: MediaLayoutRoutesDeps) {
  const {
    storage,
    auth,
    requireAuth,
    requireAdmin,
    loadUserContext,
    fileStorage,
    generateVideoThumbnail,
    getVideoDuration,
  } = deps;
  const canAccessClient = (req: Request, clientId: string) =>
    auth.canAccessClient(req, clientId);
  const getAllowedClientIds = (req: Request) => auth.getAllowedClientIds(req);
  const logAudit = deps.logAudit ?? (() => {});

  // ============ MEDIA ASSETS ============
  app.get("/api/media", requireAuth, loadUserContext, async (req, res) => {
    try {
      const assets = await storage.getMediaAssets();
      const allowed = getAllowedClientIds(req);
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;

      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const sharedToSite = await storage.getMediaSharesForClient(clientId);
        const sharedAssetIds = new Set(sharedToSite.map(s => s.mediaAssetId));
        const filtered = assets.filter(a => a.clientId === clientId || sharedAssetIds.has(a.id));
        return res.json(filtered);
      }

      let filtered = assets;
      if (allowed) {
        const allowedSet = new Set(allowed);
        const allSharedAssetIds = new Set<string>();
        for (const cid of allowed) {
          const shares = await storage.getMediaSharesForClient(cid);
          shares.forEach(s => allSharedAssetIds.add(s.mediaAssetId));
        }
        filtered = assets.filter(a =>
          (a.clientId && allowedSet.has(a.clientId)) || allSharedAssetIds.has(a.id)
        );
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching media assets:", error);
      res.status(500).json({ error: "Failed to fetch media assets" });
    }
  });

  app.post("/api/media", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertMediaAssetSchema.parse(req.body);
      if (!data.clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }
      if (!canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && event.clientId !== data.clientId) {
          return res.status(400).json({ error: "Event does not belong to the specified site" });
        }
      }
      if (data.folderId) {
        const folder = await storage.getMediaFolder(data.folderId);
        if (!folder || folder.clientId !== data.clientId) {
          return res.status(400).json({ error: "Folder does not belong to the specified site" });
        }
      }
      const asset = await storage.createMediaAsset(data);
      logAudit(req, "create", "media", asset.id, { name: asset.name, clientId: data.clientId });
      res.status(201).json(asset);

      if (data.mediaType === "video" && data.originalPath) {
        try {
          const [thumbnailPath, videoDuration] = await Promise.all([
            generateVideoThumbnail(data.originalPath, data.clientId),
            getVideoDuration(data.originalPath),
          ]);
          const updates: Record<string, any> = {};
          if (thumbnailPath) updates.thumbnailPath = thumbnailPath;
          if (videoDuration) updates.duration = videoDuration;
          if (Object.keys(updates).length > 0) {
            await storage.updateMediaAsset(asset.id, updates);
          }
        } catch (thumbErr) {
          console.error("Background video processing failed:", thumbErr);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating media asset:", error);
      res.status(500).json({ error: "Failed to create media asset" });
    }
  });

  app.delete("/api/media/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const asset = await storage.getMediaAsset(id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (asset.clientId && !canAccessClient(req, asset.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteMediaAsset(id);
      if (!deleted) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      logAudit(req, "delete", "media", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting media asset:", error);
      res.status(500).json({ error: "Failed to delete media asset" });
    }
  });

  // Media sharing (admin only)
  app.get("/api/media/:id/shares", requireAuth, requireAdmin, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      const shares = await storage.getMediaSharesForAsset(getPathParam(req, "id"));
      res.json(shares);
    } catch (error) {
      console.error("Error fetching media shares:", error);
      res.status(500).json({ error: "Failed to fetch media shares" });
    }
  });

  app.post("/api/media/:id/share", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const asset = await storage.getMediaAsset(id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }
      const targetClient = await storage.getClient(clientId);
      if (!targetClient) {
        return res.status(404).json({ error: "Target site not found" });
      }
      if (asset.clientId === clientId) {
        return res.status(400).json({ error: "Cannot share media to its owning site" });
      }
      const existingShares = await storage.getMediaSharesForAsset(id);
      if (existingShares.some(s => s.clientId === clientId)) {
        return res.status(400).json({ error: "Media is already shared to this site" });
      }
      const share = await storage.createMediaShare({ mediaAssetId: id, clientId });
      logAudit(req, "create", "media_share", share.id, { mediaAssetId: id, clientId });
      res.status(201).json(share);
    } catch (error) {
      console.error("Error sharing media:", error);
      res.status(500).json({ error: "Failed to share media" });
    }
  });

  app.delete("/api/media/:id/share/:clientId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteMediaShare(getPathParam(req, "id"), getPathParam(req, "clientId"));
      if (!deleted) {
        return res.status(404).json({ error: "Share not found" });
      }
      logAudit(req, "delete", "media_share", getPathParam(req, "id"), { clientId: getPathParam(req, "clientId") });
      res.status(204).send();
    } catch (error) {
      console.error("Error unsharing media:", error);
      res.status(500).json({ error: "Failed to unshare media" });
    }
  });

  // Task #256: PATCH /api/media/:id previously ran with no loadUserContext,
  // no ownership check, and no body validation — any authenticated user
  // could edit ANY media asset (and even reassign its clientId to move it
  // across sites). Bring it in line with the other tenant-scoped mutating
  // routes: load the user context, verify access to the owning site,
  // reject cross-site moves, and validate the body.
  app.patch("/api/media/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getMediaAsset(id);
      if (!existing) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = insertMediaAssetSchema.partial().parse(req.body);
      if (
        data.clientId &&
        data.clientId !== existing.clientId &&
        !canAccessClient(req, data.clientId)
      ) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const effectiveClientId = data.clientId ?? existing.clientId;
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && effectiveClientId && event.clientId !== effectiveClientId) {
          return res.status(400).json({ error: "Event does not belong to the specified site" });
        }
      }
      if (data.folderId) {
        const folder = await storage.getMediaFolder(data.folderId);
        if (!folder || folder.clientId !== effectiveClientId) {
          return res.status(400).json({ error: "Folder does not belong to the specified site" });
        }
      } else if (
        data.folderId === undefined &&
        data.clientId &&
        data.clientId !== existing.clientId &&
        existing.folderId
      ) {
        // The asset is moving sites without specifying a folder. A folder
        // belongs to exactly one site, so the carried-over folder from the
        // old site would dangle cross-site — drop it back to Uncategorised.
        (data as Partial<typeof data> & { folderId: string | null }).folderId = null;
      }
      const updated = await storage.updateMediaAsset(id, data);
      if (!updated) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      logAudit(req, "update", "media", updated.id, { name: updated.name });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating media asset:", error);
      res.status(500).json({ error: "Failed to update media asset" });
    }
  });

  // Serve media files from object storage
  app.get("/api/media/:id/file", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }

      if (asset.originalPath.startsWith("http")) {
        res.redirect(asset.originalPath);
      } else {
        await fileStorage.streamFile(asset.originalPath, res, req);
      }
    } catch (error) {
      console.error("Error serving media file:", error);
      res.status(500).json({ error: "Failed to serve media file" });
    }
  });

  app.get("/api/media/:id/thumbnail", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
      if (!asset || !asset.thumbnailPath) {
        return res.status(404).json({ error: "Thumbnail not found" });
      }

      if (asset.thumbnailPath.startsWith("http")) {
        res.redirect(asset.thumbnailPath);
      } else {
        await fileStorage.streamFile(asset.thumbnailPath, res, req);
      }
    } catch (error) {
      console.error("Error serving thumbnail:", error);
      res.status(500).json({ error: "Failed to serve thumbnail" });
    }
  });

  app.post("/api/media/:id/generate-thumbnail", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (asset.mediaType !== "video") {
        return res.status(400).json({ error: "Thumbnails can only be generated for video assets" });
      }

      if (!asset.clientId) {
        return res.status(400).json({ error: "Asset is not assigned to a site" });
      }
      const thumbnailPath = await generateVideoThumbnail(asset.originalPath, asset.clientId);
      if (!thumbnailPath) {
        return res.status(500).json({ error: "Failed to generate thumbnail" });
      }

      await storage.updateMediaAsset(asset.id, { thumbnailPath });
      res.json({ thumbnailPath });
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      res.status(500).json({ error: "Failed to generate thumbnail" });
    }
  });

  app.post("/api/media/backfill-durations", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const allAssets = await storage.getMediaAssets();
      const videos = allAssets.filter(a => a.mediaType === "video" && !a.duration && a.originalPath && !a.originalPath.startsWith("http"));
      let updated = 0;
      let failed = 0;
      for (const asset of videos) {
        try {
          const dur = await getVideoDuration(asset.originalPath);
          if (dur) {
            await storage.updateMediaAsset(asset.id, { duration: dur });
            updated++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      res.json({ total: videos.length, updated, failed });
    } catch (error) {
      console.error("Error backfilling durations:", error);
      res.status(500).json({ error: "Failed to backfill durations" });
    }
  });

  // ============ MEDIA FOLDERS (Task #265) ============
  // Per-site flat folders. Tenant-scoped exactly like media assets:
  // list returns only folders in the requesting user's allowed sites
  // (optionally narrowed by ?clientId=), and create/rename/delete all
  // verify access to the folder's owning site. Deleting a folder never
  // deletes its assets — the DB FK (onDelete:"set null") un-sets their
  // folderId so they fall back to the uncategorised view.
  app.get("/api/media-folders", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allowed = getAllowedClientIds(req);
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        return res.json(await storage.getMediaFolders(clientId));
      }
      const folders = await storage.getMediaFolders();
      const filtered = allowed
        ? folders.filter((f) => allowed.includes(f.clientId))
        : folders;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching media folders:", error);
      res.status(500).json({ error: "Failed to fetch media folders" });
    }
  });

  app.post("/api/media-folders", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertMediaFolderSchema.parse(req.body);
      if (!canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const folder = await storage.createMediaFolder(data);
      logAudit(req, "create", "media_folder", folder.id, { name: folder.name, clientId: data.clientId });
      res.status(201).json(folder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating media folder:", error);
      res.status(500).json({ error: "Failed to create media folder" });
    }
  });

  app.patch("/api/media-folders/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getMediaFolder(id);
      if (!existing) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (!canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Only the name is editable — a folder can't move sites.
      const data = insertMediaFolderSchema.partial().omit({ clientId: true }).parse(req.body);
      const updated = await storage.updateMediaFolder(id, data);
      if (!updated) {
        return res.status(404).json({ error: "Folder not found" });
      }
      logAudit(req, "update", "media_folder", updated.id, { name: updated.name });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating media folder:", error);
      res.status(500).json({ error: "Failed to update media folder" });
    }
  });

  app.delete("/api/media-folders/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getMediaFolder(id);
      if (!existing) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (!canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteMediaFolder(id);
      if (!deleted) {
        return res.status(404).json({ error: "Folder not found" });
      }
      logAudit(req, "delete", "media_folder", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting media folder:", error);
      res.status(500).json({ error: "Failed to delete media folder" });
    }
  });

  // ============ LAYOUT FOLDERS (Task #311) ============
  // Per-site folders for scenes, mirroring the media-folder routes.
  // Deleting a folder never deletes scenes — the FK nulls their
  // folderId so they fall back to the uncategorised view.
  app.get("/api/layout-folders", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allowed = getAllowedClientIds(req);
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        return res.json(await storage.getLayoutFolders(clientId));
      }
      const folders = await storage.getLayoutFolders();
      const filtered = allowed
        ? folders.filter((f) => allowed.includes(f.clientId))
        : folders;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching layout folders:", error);
      res.status(500).json({ error: "Failed to fetch layout folders" });
    }
  });

  app.post("/api/layout-folders", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertLayoutFolderSchema.parse(req.body);
      if (!canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const folder = await storage.createLayoutFolder(data);
      logAudit(req, "create", "layout_folder", folder.id, { name: folder.name, clientId: data.clientId });
      res.status(201).json(folder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating layout folder:", error);
      res.status(500).json({ error: "Failed to create layout folder" });
    }
  });

  app.patch("/api/layout-folders/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getLayoutFolder(id);
      if (!existing) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (!canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Only the name is editable — a folder can't move sites.
      const data = insertLayoutFolderSchema.partial().omit({ clientId: true }).parse(req.body);
      const updated = await storage.updateLayoutFolder(id, data);
      if (!updated) {
        return res.status(404).json({ error: "Folder not found" });
      }
      logAudit(req, "update", "layout_folder", updated.id, { name: updated.name });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating layout folder:", error);
      res.status(500).json({ error: "Failed to update layout folder" });
    }
  });

  app.delete("/api/layout-folders/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getLayoutFolder(id);
      if (!existing) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (!canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteLayoutFolder(id);
      if (!deleted) {
        return res.status(404).json({ error: "Folder not found" });
      }
      logAudit(req, "delete", "layout_folder", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting layout folder:", error);
      res.status(500).json({ error: "Failed to delete layout folder" });
    }
  });

  // ============ LAYOUT TEMPLATES ============
  app.get("/api/layouts", requireAuth, loadUserContext, async (req, res) => {
    try {
      const layouts = await storage.getLayoutTemplates();
      const allowed = getAllowedClientIds(req);
      let filtered = layouts;
      if (allowed) {
        filtered = layouts.filter(l => !l.clientId || allowed.includes(l.clientId));
      }
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(l => !l.clientId || l.clientId === clientId);
      }
      // Attach folderName so clients can group by folder without a
      // separate /api/layout-folders fetch (avoids timing races).
      const allFolders = await storage.getLayoutFolders();
      const folderNameMap = new Map(allFolders.map((f) => [f.id, f.name]));
      // Task #244: sanitise HTML-widget zone bodies on read so the layout
      // editor and simulator (which both load layouts via this endpoint) see
      // the same script-free payload a real player receives.
      const sanitized = filtered.map((l) => ({
        ...l,
        zones: sanitizeHtmlZones(l.zones as any),
        folderName: l.folderId ? (folderNameMap.get(l.folderId) ?? null) : null,
      }));
      res.json(sanitized);
    } catch (error) {
      console.error("Error fetching layouts:", error);
      res.status(500).json({ error: "Failed to fetch layouts" });
    }
  });

  app.post("/api/layouts", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertLayoutTemplateSchema.parse(req.body);
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (event && !data.clientId) {
          data.clientId = event.clientId;
        }
      }
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      if (data.eventId && data.clientId) {
        const event = await storage.getEvent(data.eventId);
        if (event && event.clientId !== data.clientId) {
          return res.status(400).json({ error: "Event does not belong to the specified site" });
        }
      }
      // Task #311: a folder must exist and belong to the scene's site.
      if (data.folderId) {
        const folder = await storage.getLayoutFolder(data.folderId);
        if (!folder || folder.clientId !== data.clientId) {
          return res.status(400).json({ error: "Folder does not belong to the specified site" });
        }
      }
      const layout = await storage.createLayoutTemplate(data);
      logAudit(req, "create", "layout", layout.id, { name: layout.name });
      res.status(201).json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating layout:", error);
      res.status(500).json({ error: "Failed to create layout" });
    }
  });

  app.patch("/api/layouts/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getLayoutTemplate(getPathParam(req, "id"));
      if (!existing) {
        return res.status(404).json({ error: "Layout not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This layout is locked and cannot be modified. Unlock it first." });
      }
      const data = insertLayoutTemplateSchema.partial().parse(req.body);
      if (
        data.clientId &&
        data.clientId !== existing.clientId &&
        !canAccessClient(req, data.clientId)
      ) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      // Task #311: a folder must exist and belong to the scene's site.
      if (data.folderId) {
        const folder = await storage.getLayoutFolder(data.folderId);
        const effectiveClientId = data.clientId ?? existing.clientId;
        if (!folder || folder.clientId !== effectiveClientId) {
          return res.status(400).json({ error: "Folder does not belong to the scene's site" });
        }
      }
      // If the scene moves site without an explicit folderId, drop the
      // old folder so it can't keep pointing at another site's folder.
      if (
        data.clientId &&
        data.clientId !== existing.clientId &&
        data.folderId === undefined &&
        existing.folderId
      ) {
        (data as Partial<typeof data> & { folderId: string | null }).folderId = null;
      }
      const layout = await storage.updateLayoutTemplate(getPathParam(req, "id"), data);
      logAudit(req, "update", "layout", layout!.id, { name: layout!.name });
      res.json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating layout:", error);
      res.status(500).json({ error: "Failed to update layout" });
    }
  });

  app.post("/api/layouts/:id/copy-to-site", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { targetClientId } = req.body;
      if (!targetClientId) {
        return res.status(400).json({ error: "targetClientId is required" });
      }
      const targetClient = await storage.getClient(targetClientId);
      if (!targetClient) {
        return res.status(400).json({ error: "Target site not found" });
      }
      const source = await storage.getLayoutTemplate(getPathParam(req, "id"));
      if (!source) {
        return res.status(404).json({ error: "Layout not found" });
      }
      const copy = await storage.createLayoutTemplate({
        clientId: targetClientId,
        eventId: null,
        name: source.name,
        version: source.version,
        aspectRatio: source.aspectRatio,
        customWidth: source.customWidth,
        customHeight: source.customHeight,
        zones: source.zones,
        profileOverrides: source.profileOverrides as InsertLayoutTemplate["profileOverrides"],
      });
      logAudit(req, "copy", "layout", copy.id, { sourceId: source.id, targetClientId, name: copy.name });
      res.status(201).json(copy);
    } catch (error) {
      console.error("Error copying layout:", error);
      res.status(500).json({ error: "Failed to copy layout" });
    }
  });

  app.post("/api/layouts/:id/move-to-site", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const { targetClientId } = req.body;
      if (!targetClientId) {
        return res.status(400).json({ error: "targetClientId is required" });
      }
      const targetClient = await storage.getClient(targetClientId);
      if (!targetClient) {
        return res.status(400).json({ error: "Target site not found" });
      }
      const source = await storage.getLayoutTemplate(id);
      if (!source) {
        return res.status(404).json({ error: "Layout not found" });
      }
      let clearEvent = false;
      if (source.eventId) {
        const event = await storage.getEvent(source.eventId);
        if (event && event.clientId !== targetClientId) {
          clearEvent = true;
        }
      }
      // Task #312: the old folder belongs to the old site — never let a
      // moved scene keep pointing at another site's folder.
      const updated = await storage.updateLayoutTemplate(id, {
        clientId: targetClientId,
        ...(clearEvent ? { eventId: null } : {}),
        ...(source.clientId !== targetClientId && source.folderId
          ? { folderId: null }
          : {}),
      });
      logAudit(req, "move", "layout", id, { targetClientId, name: source.name });
      res.json(updated);
    } catch (error) {
      console.error("Error moving layout:", error);
      res.status(500).json({ error: "Failed to move layout" });
    }
  });

  app.post("/api/layouts/:id/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locked } = req.body;
      const layout = await storage.updateLayoutTemplate(getPathParam(req, "id"), { locked: !!locked });
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      logAudit(req, locked ? "lock" : "unlock", "layout", layout.id, { name: layout.name });
      res.json(layout);
    } catch (error) {
      console.error("Error toggling layout lock:", error);
      res.status(500).json({ error: "Failed to toggle lock" });
    }
  });

  app.delete("/api/layouts/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getLayoutTemplate(id);
      if (!existing) {
        return res.status(404).json({ error: "Layout not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This layout is locked and cannot be deleted. Unlock it first." });
      }
      await storage.deleteLayoutTemplate(id);
      logAudit(req, "delete", "layout", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting layout:", error);
      res.status(500).json({ error: "Failed to delete layout" });
    }
  });
}

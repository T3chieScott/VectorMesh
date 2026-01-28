import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertClientSchema, insertEventSchema, insertScreenSchema, insertDisplayProfileSchema, insertScreenGroupSchema, insertMediaAssetSchema, insertLayoutTemplateSchema, insertProgrammeSchema, insertPlaylistSchema, insertPlaylistItemSchema, insertScheduleBlockSchema, insertLiveOverrideSchema, insertPlayerHeartbeatSchema, insertBrandPackSchema } from "@shared/schema";
import { getSignedUploadUrl, getPublicUrl, objectStorageService } from "./objectStorage";
import { isAuthenticated } from "./replit_integrations/auth";

const requireAuth = isAuthenticated;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication
  const { setupAuth, registerAuthRoutes } = await import("./replit_integrations/auth");
  await setupAuth(app);
  registerAuthRoutes(app);

  // Note: Object storage routes are handled via /api/uploads/request-url endpoint below

  // ============ HEALTH CHECK ============
  app.get("/api/health", async (req, res) => {
    try {
      const [screens, overrides] = await Promise.all([
        storage.getScreens(),
        storage.getLiveOverrides(),
      ]);
      
      const onlineScreens = screens.filter(s => s.isOnline).length;
      const activeOverrides = overrides.filter(o => o.isActive && new Date(o.endTime) > new Date()).length;
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        screensOnline: onlineScreens,
        totalScreens: screens.length,
        activeOverrides,
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "unhealthy", error: "Database connection failed" });
    }
  });

  // ============ CLIENTS ============
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    try {
      const data = insertClientSchema.parse(req.body);
      const client = await storage.createClient(data);
      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const data = insertClientSchema.partial().parse(req.body);
      const client = await storage.updateClient(req.params.id, data);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteClient(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  // ============ EVENTS ============
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.post("/api/events", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const data = insertEventSchema.parse(body);
      const event = await storage.createEvent(data);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const data = insertEventSchema.partial().parse(body);
      const event = await storage.updateEvent(req.params.id, data);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteEvent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // ============ DISPLAY PROFILES ============
  app.get("/api/display-profiles", requireAuth, async (req, res) => {
    try {
      const profiles = await storage.getDisplayProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching display profiles:", error);
      res.status(500).json({ error: "Failed to fetch display profiles" });
    }
  });

  app.post("/api/display-profiles", requireAuth, async (req, res) => {
    try {
      const data = insertDisplayProfileSchema.parse(req.body);
      const profile = await storage.createDisplayProfile(data);
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating display profile:", error);
      res.status(500).json({ error: "Failed to create display profile" });
    }
  });

  app.patch("/api/display-profiles/:id", requireAuth, async (req, res) => {
    try {
      const data = insertDisplayProfileSchema.partial().parse(req.body);
      const profile = await storage.updateDisplayProfile(req.params.id, data);
      if (!profile) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating display profile:", error);
      res.status(500).json({ error: "Failed to update display profile" });
    }
  });

  app.delete("/api/display-profiles/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteDisplayProfile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting display profile:", error);
      res.status(500).json({ error: "Failed to delete display profile" });
    }
  });

  // ============ SCREEN GROUPS ============
  app.get("/api/screen-groups", requireAuth, async (req, res) => {
    try {
      const groups = await storage.getScreenGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching screen groups:", error);
      res.status(500).json({ error: "Failed to fetch screen groups" });
    }
  });

  app.post("/api/screen-groups", requireAuth, async (req, res) => {
    try {
      const data = insertScreenGroupSchema.parse(req.body);
      const group = await storage.createScreenGroup(data);
      res.status(201).json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating screen group:", error);
      res.status(500).json({ error: "Failed to create screen group" });
    }
  });

  app.patch("/api/screen-groups/:id", requireAuth, async (req, res) => {
    try {
      const data = insertScreenGroupSchema.partial().parse(req.body);
      const group = await storage.updateScreenGroup(req.params.id, data);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      res.json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen group:", error);
      res.status(500).json({ error: "Failed to update screen group" });
    }
  });

  app.delete("/api/screen-groups/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteScreenGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen group:", error);
      res.status(500).json({ error: "Failed to delete screen group" });
    }
  });

  // ============ SCREENS ============
  app.get("/api/screens", requireAuth, async (req, res) => {
    try {
      const screens = await storage.getScreens();
      res.json(screens);
    } catch (error) {
      console.error("Error fetching screens:", error);
      res.status(500).json({ error: "Failed to fetch screens" });
    }
  });

  app.get("/api/screens/:id", requireAuth, async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.id);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      res.json(screen);
    } catch (error) {
      console.error("Error fetching screen:", error);
      res.status(500).json({ error: "Failed to fetch screen" });
    }
  });

  app.post("/api/screens", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        displayProfileId: req.body.displayProfileId || null,
        currentEventId: req.body.currentEventId || null,
      };
      const data = insertScreenSchema.parse(body);
      const screen = await storage.createScreen(data);
      res.status(201).json(screen);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating screen:", error);
      res.status(500).json({ error: "Failed to create screen" });
    }
  });

  app.patch("/api/screens/:id", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        displayProfileId: req.body.displayProfileId || null,
        currentEventId: req.body.currentEventId || null,
      };
      const data = insertScreenSchema.partial().parse(body);
      const screen = await storage.updateScreen(req.params.id, data);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      res.json(screen);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen:", error);
      res.status(500).json({ error: "Failed to update screen" });
    }
  });

  app.post("/api/screens/:id/regenerate-pairing", requireAuth, async (req, res) => {
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const screen = await storage.updateScreen(req.params.id, { pairingCode: newCode, isPaired: false });
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      res.json(screen);
    } catch (error) {
      console.error("Error regenerating pairing code:", error);
      res.status(500).json({ error: "Failed to regenerate pairing code" });
    }
  });

  app.delete("/api/screens/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteScreen(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Screen not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen:", error);
      res.status(500).json({ error: "Failed to delete screen" });
    }
  });

  app.get("/api/screens/:id/heartbeats", requireAuth, async (req, res) => {
    try {
      const heartbeats = await storage.getPlayerHeartbeats(req.params.id);
      res.json(heartbeats);
    } catch (error) {
      console.error("Error fetching heartbeats:", error);
      res.status(500).json({ error: "Failed to fetch heartbeats" });
    }
  });

  // ============ MEDIA ASSETS ============
  app.get("/api/media", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getMediaAssets();
      res.json(assets);
    } catch (error) {
      console.error("Error fetching media assets:", error);
      res.status(500).json({ error: "Failed to fetch media assets" });
    }
  });

  app.post("/api/media", requireAuth, async (req, res) => {
    try {
      const data = insertMediaAssetSchema.parse(req.body);
      const asset = await storage.createMediaAsset(data);
      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating media asset:", error);
      res.status(500).json({ error: "Failed to create media asset" });
    }
  });

  app.delete("/api/media/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteMediaAsset(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting media asset:", error);
      res.status(500).json({ error: "Failed to delete media asset" });
    }
  });

  // Serve media files from object storage
  app.get("/api/media/:id/file", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }

      // Get the normalized path and serve the file
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(asset.originalPath);
      if (normalizedPath.startsWith("/objects/")) {
        const file = await objectStorageService.getObjectEntityFile(normalizedPath);
        await objectStorageService.downloadObject(file, res);
      } else {
        // For external URLs, redirect
        res.redirect(asset.originalPath);
      }
    } catch (error) {
      console.error("Error serving media file:", error);
      res.status(500).json({ error: "Failed to serve media file" });
    }
  });

  // ============ UPLOAD URL ============
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    try {
      const { name, contentType } = req.body;
      if (!name || !contentType) {
        return res.status(400).json({ error: "name and contentType are required" });
      }
      const uploadURL = await getSignedUploadUrl(name, contentType);
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // ============ LAYOUT TEMPLATES ============
  app.get("/api/layouts", requireAuth, async (req, res) => {
    try {
      const layouts = await storage.getLayoutTemplates();
      res.json(layouts);
    } catch (error) {
      console.error("Error fetching layouts:", error);
      res.status(500).json({ error: "Failed to fetch layouts" });
    }
  });

  app.post("/api/layouts", requireAuth, async (req, res) => {
    try {
      const data = insertLayoutTemplateSchema.parse(req.body);
      const layout = await storage.createLayoutTemplate(data);
      res.status(201).json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating layout:", error);
      res.status(500).json({ error: "Failed to create layout" });
    }
  });

  app.patch("/api/layouts/:id", requireAuth, async (req, res) => {
    try {
      const data = insertLayoutTemplateSchema.partial().parse(req.body);
      const layout = await storage.updateLayoutTemplate(req.params.id, data);
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating layout:", error);
      res.status(500).json({ error: "Failed to update layout" });
    }
  });

  app.delete("/api/layouts/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteLayoutTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting layout:", error);
      res.status(500).json({ error: "Failed to delete layout" });
    }
  });

  // ============ PROGRAMMES ============
  app.get("/api/programmes", requireAuth, async (req, res) => {
    try {
      const programmes = await storage.getProgrammes();
      res.json(programmes);
    } catch (error) {
      console.error("Error fetching programmes:", error);
      res.status(500).json({ error: "Failed to fetch programmes" });
    }
  });

  app.post("/api/programmes", requireAuth, async (req, res) => {
    try {
      const data = insertProgrammeSchema.parse(req.body);
      const programme = await storage.createProgramme(data);
      await storage.createProgrammeVersion({ programmeId: programme.id, versionNumber: 1, status: "draft" });
      res.status(201).json(programme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating programme:", error);
      res.status(500).json({ error: "Failed to create programme" });
    }
  });

  app.patch("/api/programmes/:id", requireAuth, async (req, res) => {
    try {
      const data = insertProgrammeSchema.partial().parse(req.body);
      const programme = await storage.updateProgramme(req.params.id, data);
      if (!programme) {
        return res.status(404).json({ error: "Programme not found" });
      }
      res.json(programme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating programme:", error);
      res.status(500).json({ error: "Failed to update programme" });
    }
  });

  app.post("/api/programmes/:id/publish", requireAuth, async (req, res) => {
    try {
      const versions = await storage.getProgrammeVersions();
      const programmeVersions = versions.filter(v => v.programmeId === req.params.id);
      const draftVersion = programmeVersions.find(v => v.status === "draft");
      
      if (draftVersion) {
        await storage.updateProgrammeVersion(draftVersion.id, { status: "published", publishedAt: new Date() });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error publishing programme:", error);
      res.status(500).json({ error: "Failed to publish programme" });
    }
  });

  app.delete("/api/programmes/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteProgramme(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Programme not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting programme:", error);
      res.status(500).json({ error: "Failed to delete programme" });
    }
  });

  // ============ PROGRAMME VERSIONS ============
  app.get("/api/programme-versions", requireAuth, async (req, res) => {
    try {
      const versions = await storage.getProgrammeVersions();
      res.json(versions);
    } catch (error) {
      console.error("Error fetching programme versions:", error);
      res.status(500).json({ error: "Failed to fetch programme versions" });
    }
  });

  // ============ PLAYLISTS ============
  app.get("/api/playlists", requireAuth, async (req, res) => {
    try {
      const playlists = await storage.getPlaylists();
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  app.post("/api/playlists", requireAuth, async (req, res) => {
    try {
      const data = insertPlaylistSchema.parse(req.body);
      const playlist = await storage.createPlaylist(data);
      res.status(201).json(playlist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating playlist:", error);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  app.patch("/api/playlists/:id", requireAuth, async (req, res) => {
    try {
      const data = insertPlaylistSchema.partial().parse(req.body);
      const playlist = await storage.updatePlaylist(req.params.id, data);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      res.json(playlist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating playlist:", error);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });

  app.delete("/api/playlists/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deletePlaylist(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  // ============ PLAYLIST ITEMS ============
  app.get("/api/playlists/:playlistId/items", requireAuth, async (req, res) => {
    try {
      const items = await storage.getPlaylistItems(req.params.playlistId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      res.status(500).json({ error: "Failed to fetch playlist items" });
    }
  });

  app.post("/api/playlists/:playlistId/items", requireAuth, async (req, res) => {
    try {
      const data = insertPlaylistItemSchema.parse({
        ...req.body,
        playlistId: req.params.playlistId,
      });
      const item = await storage.createPlaylistItem(data);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating playlist item:", error);
      res.status(500).json({ error: "Failed to create playlist item" });
    }
  });

  app.patch("/api/playlist-items/:id", requireAuth, async (req, res) => {
    try {
      const data = insertPlaylistItemSchema.partial().parse(req.body);
      const item = await storage.updatePlaylistItem(req.params.id, data);
      if (!item) {
        return res.status(404).json({ error: "Playlist item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating playlist item:", error);
      res.status(500).json({ error: "Failed to update playlist item" });
    }
  });

  app.delete("/api/playlist-items/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deletePlaylistItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Playlist item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting playlist item:", error);
      res.status(500).json({ error: "Failed to delete playlist item" });
    }
  });

  // ============ SCHEDULE BLOCKS ============
  app.get("/api/programme-versions/:versionId/blocks", requireAuth, async (req, res) => {
    try {
      const blocks = await storage.getScheduleBlocks(req.params.versionId);
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching schedule blocks:", error);
      res.status(500).json({ error: "Failed to fetch schedule blocks" });
    }
  });

  app.post("/api/programme-versions/:versionId/blocks", requireAuth, async (req, res) => {
    try {
      const data = insertScheduleBlockSchema.parse({
        ...req.body,
        programmeVersionId: req.params.versionId,
      });
      const block = await storage.createScheduleBlock(data);
      res.status(201).json(block);
    } catch (error) {
      console.error("Error creating schedule block:", error);
      res.status(500).json({ error: "Failed to create schedule block" });
    }
  });

  app.patch("/api/schedule-blocks/:id", requireAuth, async (req, res) => {
    try {
      const data = insertScheduleBlockSchema.partial().parse(req.body);
      const block = await storage.updateScheduleBlock(req.params.id, data);
      if (!block) {
        return res.status(404).json({ error: "Schedule block not found" });
      }
      res.json(block);
    } catch (error) {
      console.error("Error updating schedule block:", error);
      res.status(500).json({ error: "Failed to update schedule block" });
    }
  });

  app.delete("/api/schedule-blocks/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteScheduleBlock(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Schedule block not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule block:", error);
      res.status(500).json({ error: "Failed to delete schedule block" });
    }
  });

  // ============ LIVE OVERRIDES ============
  app.get("/api/live-overrides", requireAuth, async (req, res) => {
    try {
      const overrides = await storage.getLiveOverrides();
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching live overrides:", error);
      res.status(500).json({ error: "Failed to fetch live overrides" });
    }
  });

  app.post("/api/live-overrides", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      };
      const data = insertLiveOverrideSchema.parse(body);
      const override = await storage.createLiveOverride(data);
      res.status(201).json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating live override:", error);
      res.status(500).json({ error: "Failed to create live override" });
    }
  });

  app.patch("/api/live-overrides/:id", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        ...(req.body.startTime && { startTime: new Date(req.body.startTime) }),
        ...(req.body.endTime && { endTime: new Date(req.body.endTime) }),
      };
      const data = insertLiveOverrideSchema.partial().parse(body);
      const override = await storage.updateLiveOverride(req.params.id, data);
      if (!override) {
        return res.status(404).json({ error: "Live override not found" });
      }
      res.json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating live override:", error);
      res.status(500).json({ error: "Failed to update live override" });
    }
  });

  app.delete("/api/live-overrides/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteLiveOverride(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Live override not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting live override:", error);
      res.status(500).json({ error: "Failed to delete live override" });
    }
  });

  // ============ PLAYER API (for Raspberry Pi nodes) ============
  app.post("/api/player/pair", async (req, res) => {
    try {
      const { pairingCode, hardwareInfo } = req.body;
      const screen = await storage.getScreenByPairingCode(pairingCode);
      
      if (!screen) {
        return res.status(404).json({ error: "Invalid pairing code" });
      }
      
      await storage.updateScreen(screen.id, {
        isPaired: true,
        isOnline: true,
        lastSeen: new Date(),
        hardwareClass: hardwareInfo?.class || "raspberry_pi",
        ipAddress: req.ip,
      });
      
      res.json({ screenId: screen.id, name: screen.name });
    } catch (error) {
      console.error("Error pairing screen:", error);
      res.status(500).json({ error: "Failed to pair screen" });
    }
  });

  app.post("/api/player/heartbeat", async (req, res) => {
    try {
      const data = insertPlayerHeartbeatSchema.parse(req.body);
      await storage.createPlayerHeartbeat(data);
      await storage.updateScreen(data.screenId, { isOnline: true, lastSeen: new Date() });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error recording heartbeat:", error);
      res.status(500).json({ error: "Failed to record heartbeat" });
    }
  });

  app.get("/api/player/:screenId/manifest", async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.screenId);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      const overrides = await storage.getLiveOverrides();
      const now = new Date();
      const activeOverrides = overrides.filter(o => 
        o.isActive && 
        new Date(o.startTime) <= now && 
        new Date(o.endTime) >= now
      );

      res.json({
        screen,
        activeOverrides,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching manifest:", error);
      res.status(500).json({ error: "Failed to fetch manifest" });
    }
  });

  return httpServer;
}

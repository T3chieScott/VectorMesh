import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import {
  insertAgendaItemSchema,
  insertAgendaWidgetConfigSchema,
  type AgendaItem,
  type AgendaWidgetConfig,
  type Client,
  type InsertAgendaItem,
  type InsertAgendaWidgetConfig,
} from "@shared/schema";
import { parseAgendaCsv } from "@shared/agenda-csv";
import { getPathParam, getQueryString } from "./requestParams";

export interface AgendaRoutesStorage {
  getAgendaItems(clientId?: string): Promise<AgendaItem[]>;
  getAgendaItem(id: string): Promise<AgendaItem | undefined>;
  createAgendaItem(data: InsertAgendaItem): Promise<AgendaItem>;
  createAgendaItemsBulk(rows: InsertAgendaItem[]): Promise<AgendaItem[]>;
  updateAgendaItem(
    id: string,
    data: Partial<InsertAgendaItem>,
  ): Promise<AgendaItem | undefined>;
  deleteAgendaItem(id: string): Promise<boolean>;
  deleteAgendaItemsForClient(clientId: string): Promise<number>;
  getAgendaWidgetConfigs(clientId?: string): Promise<AgendaWidgetConfig[]>;
  getAgendaWidgetConfig(id: string): Promise<AgendaWidgetConfig | undefined>;
  createAgendaWidgetConfig(
    data: InsertAgendaWidgetConfig,
  ): Promise<AgendaWidgetConfig>;
  updateAgendaWidgetConfig(
    id: string,
    data: Partial<InsertAgendaWidgetConfig>,
  ): Promise<AgendaWidgetConfig | undefined>;
  deleteAgendaWidgetConfig(id: string): Promise<boolean>;
  getResolvedAgendaForConfig(
    configId: string,
    now: Date,
  ): Promise<{ config: AgendaWidgetConfig; items: AgendaItem[] } | undefined>;
  getClient(id: string): Promise<Client | undefined>;
}

export interface AgendaRoutesAuth {
  canAccessClient(req: Request, clientId: string): boolean;
  getAllowedClientIds(req: Request): string[] | null;
}

export interface AgendaRoutesDeps {
  storage: AgendaRoutesStorage;
  auth: AgendaRoutesAuth;
  requireAuth: RequestHandler;
  requireAuthOrToken: RequestHandler;
  loadUserContext: (req: Request, res: Response, next: NextFunction) => any;
  logAudit?: (
    req: Request,
    action: string,
    entityType: string,
    entityId?: string,
    payload?: any,
  ) => void;
  now?: () => Date;
}

// Shape of the public payload returned by GET /api/agenda/display/:configId.
// Declared so tests can assert no admin-only fields (clientId, timestamps,
// timeWindowMinutes, etc.) leak out of the public endpoint.
export const PUBLIC_AGENDA_CONFIG_FIELDS = [
  "id",
  "name",
  "eventName",
  "backgroundUrl",
  "accentColor",
  "displayMode",
  "layoutMode",
  "fontScale",
  "density",
  "theme",
  "roomFilter",
  "trackFilter",
  "statusFilter",
  "refreshIntervalSeconds",
  "rotationIntervalSeconds",
  "maxItemsPerPage",
  "showDescription",
  "showPresenter",
  "showRoom",
  "showStatus",
  "showCurrentTime",
  "showEventName",
] as const;

export const PUBLIC_AGENDA_ITEM_FIELDS = [
  "id",
  "title",
  "description",
  "room",
  "track",
  "presenter",
  "startsAt",
  "endsAt",
  "status",
  "statusMessage",
] as const;

/**
 * Mounts the Agenda Display Widget routes (Task #208) on the given Express
 * app. Extracted from server/routes.ts so the tenant-scoping and public
 * payload behaviour can be exercised in isolation with a stub storage and
 * an injected auth/user context (see tests/agenda-routes-tenant-scoping.test.ts).
 */
export function mountAgendaRoutes(app: Express, deps: AgendaRoutesDeps) {
  const {
    storage,
    auth,
    requireAuth,
    requireAuthOrToken,
    loadUserContext,
    logAudit,
  } = deps;
  const now = deps.now ?? (() => new Date());
  const audit: NonNullable<typeof logAudit> = logAudit ?? (() => {});

  app.get("/api/agenda", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const clientIdParam = getQueryString(req, "clientId", res);
      if (clientIdParam === null) return;
      const allowed = auth.getAllowedClientIds(req);
      if (clientIdParam) {
        if (!auth.canAccessClient(req, clientIdParam)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const items = await storage.getAgendaItems(clientIdParam);
        return res.json(items);
      }
      const all = await storage.getAgendaItems();
      const filtered = allowed ? all.filter((i) => allowed.includes(i.clientId)) : all;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching agenda items:", error);
      res.status(500).json({ error: "Failed to fetch agenda items" });
    }
  });

  app.post("/api/agenda", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertAgendaItemSchema.parse(req.body);
      if (!auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      if (!(data.endsAt > data.startsAt)) {
        return res.status(400).json({ error: "endsAt must be after startsAt" });
      }
      const item = await storage.createAgendaItem(data);
      audit(req, "create", "agenda_item", item.id, {
        title: item.title,
        clientId: item.clientId,
      });
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating agenda item:", error);
      res.status(500).json({ error: "Failed to create agenda item" });
    }
  });

  app.patch("/api/agenda/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaItem(id);
      if (!existing) return res.status(404).json({ error: "Agenda item not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      const data = insertAgendaItemSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const start = data.startsAt ?? existing.startsAt;
      const end = data.endsAt ?? existing.endsAt;
      if (!(end > start)) {
        return res.status(400).json({ error: "endsAt must be after startsAt" });
      }
      const item = await storage.updateAgendaItem(id, data);
      audit(req, "update", "agenda_item", id, { title: item?.title });
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating agenda item:", error);
      res.status(500).json({ error: "Failed to update agenda item" });
    }
  });

  app.delete("/api/agenda/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaItem(id);
      if (!existing) return res.status(404).json({ error: "Agenda item not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      await storage.deleteAgendaItem(id);
      audit(req, "delete", "agenda_item", id, { title: existing.title });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agenda item:", error);
      res.status(500).json({ error: "Failed to delete agenda item" });
    }
  });

  app.post("/api/agenda/import", requireAuth, loadUserContext, async (req, res) => {
    try {
      const clientId = String(req.body?.clientId || "");
      const csv = String(req.body?.csv || "");
      const replace = Boolean(req.body?.replace);
      if (!clientId || !csv) {
        return res.status(400).json({ error: "clientId and csv are required" });
      }
      if (!auth.canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const parsed = parseAgendaCsv(csv);
      const errors = parsed.filter((r) => r.status === "error");
      if (errors.length > 0) {
        return res.status(400).json({ error: "csv_parse_error", results: parsed });
      }
      const okRows = parsed.filter((r) => r.status === "ok");
      const toInsert: InsertAgendaItem[] = okRows.map((r) => ({
        clientId,
        title: r.item!.title,
        description: r.item!.description ?? null,
        room: r.item!.room ?? null,
        track: r.item!.track ?? null,
        presenter: r.item!.presenter ?? null,
        startsAt: r.item!.startsAt,
        endsAt: r.item!.endsAt,
        status: r.item!.status ?? "scheduled",
        statusMessage: r.item!.statusMessage ?? null,
      }));
      if (replace) {
        await storage.deleteAgendaItemsForClient(clientId);
      }
      const inserted = await storage.createAgendaItemsBulk(toInsert);
      audit(req, "import", "agenda_item", clientId, {
        count: inserted.length,
        replace,
      });
      res.json({ inserted: inserted.length, results: parsed });
    } catch (error) {
      console.error("Error importing agenda CSV:", error);
      res.status(500).json({ error: "Failed to import CSV" });
    }
  });

  app.get("/api/agenda/configs", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const clientIdParam = getQueryString(req, "clientId", res);
      if (clientIdParam === null) return;
      const allowed = auth.getAllowedClientIds(req);
      if (clientIdParam) {
        if (!auth.canAccessClient(req, clientIdParam)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const configs = await storage.getAgendaWidgetConfigs(clientIdParam);
        return res.json(configs);
      }
      const all = await storage.getAgendaWidgetConfigs();
      const filtered = allowed ? all.filter((c) => allowed.includes(c.clientId)) : all;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching agenda configs:", error);
      res.status(500).json({ error: "Failed to fetch agenda configs" });
    }
  });

  app.post("/api/agenda/configs", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertAgendaWidgetConfigSchema.parse(req.body);
      if (!auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const config = await storage.createAgendaWidgetConfig(data);
      audit(req, "create", "agenda_widget_config", config.id, { name: config.name });
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating agenda config:", error);
      res.status(500).json({ error: "Failed to create agenda config" });
    }
  });

  app.patch("/api/agenda/configs/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaWidgetConfig(id);
      if (!existing) return res.status(404).json({ error: "Config not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      const data = insertAgendaWidgetConfigSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const config = await storage.updateAgendaWidgetConfig(id, data);
      audit(req, "update", "agenda_widget_config", id, { name: config?.name });
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating agenda config:", error);
      res.status(500).json({ error: "Failed to update agenda config" });
    }
  });

  app.delete("/api/agenda/configs/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaWidgetConfig(id);
      if (!existing) return res.status(404).json({ error: "Config not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      await storage.deleteAgendaWidgetConfig(id);
      audit(req, "delete", "agenda_widget_config", id, { name: existing.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agenda config:", error);
      res.status(500).json({ error: "Failed to delete agenda config" });
    }
  });

  app.get("/api/agenda/display/:configId", async (req, res) => {
    try {
      const resolved = await storage.getResolvedAgendaForConfig(
        getPathParam(req, "configId"),
        now(),
      );
      if (!resolved) return res.status(404).json({ error: "Config not found" });
      const { config, items } = resolved;
      const client = await storage.getClient(config.clientId);
      const publicConfig = {
        id: config.id,
        name: config.name,
        eventName: config.eventName,
        backgroundUrl: config.backgroundUrl,
        accentColor: config.accentColor,
        displayMode: config.displayMode,
        layoutMode: config.layoutMode,
        fontScale: config.fontScale,
        density: config.density,
        theme: config.theme,
        roomFilter: config.roomFilter ?? [],
        trackFilter: config.trackFilter ?? [],
        statusFilter: config.statusFilter ?? [],
        refreshIntervalSeconds: config.refreshIntervalSeconds,
        rotationIntervalSeconds: config.rotationIntervalSeconds,
        maxItemsPerPage: config.maxItemsPerPage,
        showDescription: config.showDescription,
        showPresenter: config.showPresenter,
        showRoom: config.showRoom,
        showStatus: config.showStatus,
        showCurrentTime: config.showCurrentTime,
        showEventName: config.showEventName,
      };
      const publicItems = items.map((it) => ({
        id: it.id,
        title: it.title,
        description: it.description,
        room: it.room,
        track: it.track,
        presenter: it.presenter,
        startsAt: it.startsAt,
        endsAt: it.endsAt,
        status: it.status,
        statusMessage: it.statusMessage,
      }));
      res.setHeader("Cache-Control", "no-store");
      res.json({
        config: publicConfig,
        items: publicItems,
        client: client ? { name: client.name, timezone: client.timezone } : null,
        serverTime: Date.now(),
      });
    } catch (error) {
      console.error("Error serving agenda display:", error);
      res.status(500).json({ error: "Failed to serve agenda" });
    }
  });
}

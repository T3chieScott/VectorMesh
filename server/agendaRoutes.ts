import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import {
  insertAgendaItemSchema,
  insertAgendaWidgetConfigSchema,
  insertAgendaSyncConfigSchema,
  AGENDA_MAPPED_SOURCE_TYPES,
  AGENDA_MAPPABLE_FIELDS,
  AGENDA_REQUIRED_MAPPABLE_FIELDS,
  type AgendaItem,
  type AgendaWidgetConfig,
  type AgendaSyncConfig,
  type Client,
  type CustomFont,
  type InsertAgendaItem,
  type InsertAgendaWidgetConfig,
  type InsertAgendaSyncConfig,
} from "@shared/schema";
import { parseAgendaCsv } from "@shared/agenda-csv";
import {
  runAgendaSync,
  previewAgendaSource,
  type AgendaSyncStorage,
} from "./agendaSync";
import {
  getMicrosoftConnectionStatus,
  listRecentXlsxFiles,
  searchXlsxFiles,
  resolveShareLink,
  MicrosoftNotConnectedError,
  MICROSOFT_NOT_CONNECTED_MESSAGE,
} from "./microsoftGraph";
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
  // Task #210 — sync configs and the helper used by the merge engine.
  getAgendaSyncConfigs(clientId?: string): Promise<AgendaSyncConfig[]>;
  getAgendaSyncConfig(id: string): Promise<AgendaSyncConfig | undefined>;
  createAgendaSyncConfig(data: InsertAgendaSyncConfig): Promise<AgendaSyncConfig>;
  updateAgendaSyncConfig(id: string, data: Partial<AgendaSyncConfig>): Promise<AgendaSyncConfig | undefined>;
  deleteAgendaSyncConfig(id: string): Promise<boolean>;
  getAgendaItemsBySyncConfig(syncConfigId: string): Promise<AgendaItem[]>;
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
  getCustomFonts(clientId: string): Promise<CustomFont[]>;
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
  /**
   * Task #267 — resolves an uploaded_xlsx storedFilePath (relative to
   * the upload root) into an absolute path the sync engine can read.
   * Wired to fileStorage.getAbsolutePath in server/routes.ts.
   */
  resolveStoredPath?: (storedPath: string) => Promise<string>;
  /**
   * Task #268 — fetches .xlsx bytes for a Microsoft-backed source via
   * Microsoft Graph. Wired to microsoftGraph.fetchMicrosoftXlsxBytes in
   * server/routes.ts. When absent, Microsoft-backed sources fall back to
   * the public-link path.
   */
  graphFetch?: (config: AgendaSyncConfig) => Promise<Uint8Array>;
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
  "showDayName",
  "showDate",
  // Task #231 — optional typography & role-colour overrides. All
  // nullable; widget renders identically when they are null.
  "fontFamily",
  "titleColor",
  "bodyColor",
  "timeColor",
  "statusColor",
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
  const resolveStoredPath = deps.resolveStoredPath;
  const graphFetch = deps.graphFetch;

  // A mapped source (Task #267) must carry either a URL (URL types) or a
  // storedFilePath (uploaded_xlsx) before it can be saved. Returns an
  // error string, or null when the shape is valid. Legacy ics /
  // google_sheets_csv types are unaffected.
  function validateSourceShape(
    sourceType: string,
    sourceUrl: unknown,
    storedFilePath: unknown,
    ms?: { microsoftAuth?: unknown; msDriveId?: unknown; msItemId?: unknown },
  ): string | null {
    if (sourceType === "uploaded_xlsx") {
      if (!storedFilePath) return "An uploaded .xlsx file is required for this source type.";
      return null;
    }
    // Task #268 — Microsoft-backed OneDrive/SharePoint Excel sources are
    // addressed either by a picked file (driveId + itemId) or a pasted
    // share link (sourceUrl). Either satisfies the shape.
    if (
      ms?.microsoftAuth === true &&
      (sourceType === "excel_onedrive" || sourceType === "sharepoint_excel")
    ) {
      if ((ms.msDriveId && ms.msItemId) || sourceUrl) return null;
      return "Select a Microsoft file or paste a share link for this source type.";
    }
    // All other types (legacy + mapped URL types) need a URL.
    if (!sourceUrl) return "A source URL is required for this source type.";
    return null;
  }

  // Guards against pointing an uploaded_xlsx config at another site's
  // file: the storedFilePath must live under the config's own clientId
  // directory (fileStorage stores files at `${clientId}/uploads/...`).
  function storedPathBelongsToClient(storedPath: string, clientId: string): boolean {
    const norm = storedPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (norm.includes("..")) return false;
    return norm === clientId || norm.startsWith(`${clientId}/`);
  }

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
      // Task #210 — operator edits freeze the row against future
      // agenda-sync passes so hand-tweaks are never clobbered. The
      // sync engine reads manualOverride and skips matching rows.
      const item = await storage.updateAgendaItem(id, { ...data, manualOverride: true });
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

  // ============ AGENDA SYNC CONFIGS (Task #210) ============
  // CRUD + manual-trigger for the agenda-sync engine. The background
  // tick (server/routes.ts) calls runDueAgendaSyncs() periodically;
  // these routes let an operator create / edit a source and force a
  // pull-now to verify the connection.

  app.get("/api/agenda/sync-configs", requireAuth, loadUserContext, async (req, res) => {
    try {
      const clientIdParam = getQueryString(req, "clientId", res);
      if (clientIdParam === null) return;
      const allowed = auth.getAllowedClientIds(req);
      const all = clientIdParam
        ? auth.canAccessClient(req, clientIdParam)
          ? await storage.getAgendaSyncConfigs(clientIdParam)
          : (() => { res.status(403).json({ error: "Access denied to requested site" }); return null; })()
        : await storage.getAgendaSyncConfigs();
      if (all === null) return;
      const filtered = allowed && !clientIdParam ? all.filter((c) => allowed.includes(c.clientId)) : all;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching agenda sync configs:", error);
      res.status(500).json({ error: "Failed to fetch agenda sync configs" });
    }
  });

  app.post("/api/agenda/sync-configs", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertAgendaSyncConfigSchema.parse(req.body);
      if (!auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const shapeError = validateSourceShape(data.sourceType, data.sourceUrl, data.storedFilePath, {
        microsoftAuth: data.microsoftAuth,
        msDriveId: data.msDriveId,
        msItemId: data.msItemId,
      });
      if (shapeError) return res.status(400).json({ error: shapeError });
      if (data.storedFilePath && !storedPathBelongsToClient(data.storedFilePath, data.clientId)) {
        return res.status(403).json({ error: "Uploaded file does not belong to this site" });
      }
      const cfg = await storage.createAgendaSyncConfig(data);
      audit(req, "create", "agenda_sync_config", cfg.id, { name: cfg.name, sourceType: cfg.sourceType });
      res.status(201).json(cfg);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating agenda sync config:", error);
      res.status(500).json({ error: "Failed to create agenda sync config" });
    }
  });

  app.patch("/api/agenda/sync-configs/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaSyncConfig(id);
      if (!existing) return res.status(404).json({ error: "Sync config not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      const data = insertAgendaSyncConfigSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      // Validate the merged shape so a PATCH can't leave a config in an
      // unfetchable state (e.g. switching to uploaded_xlsx without a file).
      const mergedType = data.sourceType ?? existing.sourceType;
      const mergedUrl = data.sourceUrl !== undefined ? data.sourceUrl : existing.sourceUrl;
      const mergedFile = data.storedFilePath !== undefined ? data.storedFilePath : existing.storedFilePath;
      const mergedClient = data.clientId ?? existing.clientId;
      const mergedMsAuth = data.microsoftAuth !== undefined ? data.microsoftAuth : existing.microsoftAuth;
      const mergedDriveId = data.msDriveId !== undefined ? data.msDriveId : existing.msDriveId;
      const mergedItemId = data.msItemId !== undefined ? data.msItemId : existing.msItemId;
      const shapeError = validateSourceShape(mergedType, mergedUrl, mergedFile, {
        microsoftAuth: mergedMsAuth,
        msDriveId: mergedDriveId,
        msItemId: mergedItemId,
      });
      if (shapeError) return res.status(400).json({ error: shapeError });
      if (mergedFile && !storedPathBelongsToClient(mergedFile, mergedClient)) {
        return res.status(403).json({ error: "Uploaded file does not belong to this site" });
      }
      const cfg = await storage.updateAgendaSyncConfig(id, data);
      audit(req, "update", "agenda_sync_config", id, { name: cfg?.name });
      res.json(cfg);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating agenda sync config:", error);
      res.status(500).json({ error: "Failed to update agenda sync config" });
    }
  });

  app.delete("/api/agenda/sync-configs/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaSyncConfig(id);
      if (!existing) return res.status(404).json({ error: "Sync config not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      await storage.deleteAgendaSyncConfig(id);
      audit(req, "delete", "agenda_sync_config", id, { name: existing.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agenda sync config:", error);
      res.status(500).json({ error: "Failed to delete agenda sync config" });
    }
  });

  app.post("/api/agenda/sync-configs/:id/run", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaSyncConfig(id);
      if (!existing) return res.status(404).json({ error: "Sync config not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      // AgendaRoutesStorage is structurally a superset of AgendaSyncStorage
      // (both reference identical method signatures from the @shared/schema
      // types), so this pass-through is type-safe.
      const result = await runAgendaSync(existing, { storage, now, resolveStoredPath, graphFetch });
      audit(req, "run", "agenda_sync_config", id, {
        ok: result.ok,
        inserted: result.inserted,
        updated: result.updated,
        removed: result.removed,
        skippedManual: result.skippedManual,
      });
      res.json(result);
    } catch (error) {
      console.error("Error running agenda sync:", error);
      res.status(500).json({ error: "Failed to run agenda sync" });
    }
  });

  // ----- Mapped-source preview / test (Task #267) -----
  // Body shape shared by /preview and /test: a draft (unsaved) mapped
  // source. /test omits the mapping (just verifies the connection +
  // returns headers / sheet names); /preview includes the mapping and
  // returns the per-row mapping outcome for a sample.
  const previewBodySchema = z.object({
    clientId: z.string().min(1),
    sourceType: z.enum(AGENDA_MAPPED_SOURCE_TYPES),
    sourceUrl: z.string().url().optional().nullable(),
    storedFilePath: z.string().optional().nullable(),
    sheetName: z.string().optional().nullable(),
    headerRowIndex: z.number().int().min(0).optional(),
    firstDataRowIndex: z.number().int().min(0).optional().nullable(),
    columnMapping: z
      .record(z.enum(AGENDA_MAPPABLE_FIELDS), z.string())
      .optional()
      .nullable(),
    externalIdColumn: z.string().optional().nullable(),
    timezone: z.string().optional().nullable(),
    dateFormatHint: z.string().optional().nullable(),
    startTimeColumn: z.string().optional().nullable(),
    endTimeColumn: z.string().optional().nullable(),
    dateBaseYear: z.number().int().min(1970).max(2200).optional().nullable(),
    dateBaseMonth: z.number().int().min(1).max(12).optional().nullable(),
    // Task #268 — Microsoft-backed source addressing for preview/test.
    microsoftAuth: z.boolean().optional(),
    msDriveId: z.string().optional().nullable(),
    msItemId: z.string().optional().nullable(),
  });

  async function handlePreview(req: Request, res: Response, includeMapping: boolean) {
    let body: z.infer<typeof previewBodySchema>;
    try {
      body = previewBodySchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      throw error;
    }
    if (!auth.canAccessClient(req, body.clientId)) {
      return res.status(403).json({ error: "Access denied to requested site" });
    }
    const shapeError = validateSourceShape(body.sourceType, body.sourceUrl, body.storedFilePath, {
      microsoftAuth: body.microsoftAuth,
      msDriveId: body.msDriveId,
      msItemId: body.msItemId,
    });
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (body.storedFilePath && !storedPathBelongsToClient(body.storedFilePath, body.clientId)) {
      return res.status(403).json({ error: "Uploaded file does not belong to this site" });
    }
    try {
      const preview = await previewAgendaSource(
        {
          clientId: body.clientId,
          sourceType: body.sourceType,
          sourceUrl: body.sourceUrl ?? null,
          storedFilePath: body.storedFilePath ?? null,
          sheetName: body.sheetName ?? null,
          headerRowIndex: body.headerRowIndex ?? 0,
          firstDataRowIndex: body.firstDataRowIndex ?? null,
          columnMapping: includeMapping ? (body.columnMapping ?? null) : null,
          externalIdColumn: body.externalIdColumn ?? null,
          timezone: body.timezone ?? null,
          dateFormatHint: body.dateFormatHint ?? null,
          startTimeColumn: body.startTimeColumn ?? null,
          endTimeColumn: body.endTimeColumn ?? null,
          dateBaseYear: body.dateBaseYear ?? null,
          dateBaseMonth: body.dateBaseMonth ?? null,
          microsoftAuth: body.microsoftAuth ?? false,
          msDriveId: body.msDriveId ?? null,
          msItemId: body.msItemId ?? null,
        },
        { storage, resolveStoredPath, graphFetch },
      );
      res.json(preview);
    } catch (error) {
      // Source-side failures (bad URL, OneDrive sign-in page, unreadable
      // file) are operator-facing, not server bugs — return 400 with the
      // message so the UI can show it inline.
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  }

  app.post("/api/agenda/sync-configs/preview", requireAuth, loadUserContext, (req, res) =>
    handlePreview(req, res, true),
  );

  app.post("/api/agenda/sync-configs/test", requireAuth, loadUserContext, (req, res) =>
    handlePreview(req, res, false),
  );

  // ----- Microsoft sign-in (Task #268) -----
  // Read-only Graph-backed endpoints for the SyncConfigDialog. All three
  // require auth + a site the caller can access (canAccessClient on the
  // ?clientId query). Tokens are never returned to the client; the
  // connector proxy holds them.

  // Is a system-level Microsoft account connected? Drives the
  // "Connect Microsoft" UI state and whether the can't-read fallback
  // message is shown.
  app.get("/api/agenda/microsoft/status", requireAuth, loadUserContext, async (req, res) => {
    try {
      const clientId = getQueryString(req, "clientId", res);
      if (clientId === null) return;
      if (clientId && !auth.canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const status = await getMicrosoftConnectionStatus();
      res.json(status);
    } catch (error) {
      console.error("Error checking Microsoft connection status:", error);
      res.status(500).json({ error: "Failed to check Microsoft connection status" });
    }
  });

  // List recent Excel files, or search when ?q= is supplied. Powers the
  // file picker.
  app.get("/api/agenda/microsoft/files", requireAuth, loadUserContext, async (req, res) => {
    try {
      const clientId = getQueryString(req, "clientId", res);
      if (clientId === null) return;
      if (clientId && !auth.canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const q = getQueryString(req, "q", res);
      if (q === null) return;
      const files = q ? await searchXlsxFiles(q) : await listRecentXlsxFiles();
      res.json(files);
    } catch (error) {
      if (error instanceof MicrosoftNotConnectedError) {
        return res.status(409).json({ error: MICROSOFT_NOT_CONNECTED_MESSAGE });
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  // Resolve a pasted OneDrive/SharePoint share link to (driveId, itemId,
  // name) so the config can store a concrete addressing pair.
  const resolveShareBodySchema = z.object({
    clientId: z.string().min(1),
    shareUrl: z.string().url(),
  });
  app.post("/api/agenda/microsoft/resolve-share", requireAuth, loadUserContext, async (req, res) => {
    let body: z.infer<typeof resolveShareBodySchema>;
    try {
      body = resolveShareBodySchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      throw error;
    }
    if (!auth.canAccessClient(req, body.clientId)) {
      return res.status(403).json({ error: "Access denied to requested site" });
    }
    try {
      const item = await resolveShareLink(body.shareUrl);
      res.json(item);
    } catch (error) {
      if (error instanceof MicrosoftNotConnectedError) {
        return res.status(409).json({ error: MICROSOFT_NOT_CONNECTED_MESSAGE });
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  // Surface the most recent sync warnings / error for a config so the UI
  // can show per-row parse problems without re-running the sync.
  app.get("/api/agenda/sync-configs/:id/errors", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getAgendaSyncConfig(id);
      if (!existing) return res.status(404).json({ error: "Sync config not found" });
      if (!auth.canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
      res.json({
        lastError: existing.lastError ?? null,
        lastErrorAt: existing.lastErrorAt ?? null,
        lastSyncOk: existing.lastSyncOk ?? null,
        lastSyncAt: existing.lastSyncAt ?? null,
        lastItemCount: existing.lastItemCount ?? null,
        warnings: existing.lastSyncWarnings ?? [],
      });
    } catch (error) {
      console.error("Error fetching agenda sync errors:", error);
      res.status(500).json({ error: "Failed to fetch sync errors" });
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
      // Optional ?at=<ISO instant> test-date override so operators can
      // preview a screen as if "now" were a chosen moment. Invalid or
      // missing values fall back to the real server clock.
      const atRaw = typeof req.query.at === "string" ? req.query.at : null;
      const parsedAt = atRaw ? new Date(atRaw) : null;
      const resolveAt =
        parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt : now();
      const resolved = await storage.getResolvedAgendaForConfig(
        getPathParam(req, "configId"),
        resolveAt,
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
        // Coerce ?? false so the keys are always present in the public
        // payload contract (JSON.stringify drops undefined-valued keys
        // and PUBLIC_AGENDA_CONFIG_FIELDS asserts both are emitted).
        showDayName: config.showDayName ?? false,
        showDate: config.showDate ?? false,
        // Task #231 — typography & role-colour overrides (all nullable).
        // Coerce undefined → null so the keys are always present in the
        // public payload, matching PUBLIC_AGENDA_CONFIG_FIELDS exactly
        // (JSON.stringify silently drops undefined-valued keys).
        fontFamily: config.fontFamily ?? null,
        titleColor: config.titleColor ?? null,
        bodyColor: config.bodyColor ?? null,
        timeColor: config.timeColor ?? null,
        statusColor: config.statusColor ?? null,
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
      // Task #281: include the site's custom fonts so the chromeless
      // display page (and agenda zones inside layouts) can inject the
      // @font-face needed to render a `custom:<id>` fontFamily.
      const fonts = await storage.getCustomFonts(config.clientId);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        config: publicConfig,
        items: publicItems,
        client: client ? { name: client.name, timezone: client.timezone } : null,
        fonts: fonts.map((f) => ({ id: f.id, name: f.name, format: f.format })),
        serverTime: Date.now(),
      });
    } catch (error) {
      console.error("Error serving agenda display:", error);
      res.status(500).json({ error: "Failed to serve agenda" });
    }
  });
}

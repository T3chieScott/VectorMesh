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
  extractSourceConnectionHealth,
  extractDisplayContinuity,
  computeSourceHealthState,
  computeSourceHealthStateWithTimestamps,
  computeDisplayContinuityState,
  getConfigSyncPhase,
  manualRunCooldownRemainingMs,
  recordManualRun,
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
import {
  buildConnectUrl,
  generateOAuthInitParams,
  handleOAuthCallback,
  disconnectEntraOAuth,
  sanitizeReturnTo,
  validateOAuthCallbackParams,
  OAUTH_STATE_TTL_MS,
  type MsOAuthSessionState,
} from "./microsoftOAuth";
import { getPathParam, getQueryString } from "./requestParams";
import { getOrSet, set, del, buildCacheKey, registerRefresher, CACHE_NAMESPACES, DEFAULT_TTLS } from "./sharedCache";

// Task #290 — drop the cached computed agenda display payload for a single
// widget config (tenant-scoped key). Best effort: never let a cache failure
// break a write.
async function invalidateAgendaDisplayCache(clientId: string, configId: string): Promise<void> {
  try {
    await del(CACHE_NAMESPACES.AGENDA, buildCacheKey(clientId, configId));
  } catch (err) {
    console.error("[agenda] display cache invalidation failed:", err instanceof Error ? err.message : err);
  }
}

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
  /**
   * Returns true when userId refers to a user whose role is currently "admin".
   * Used by the OAuth callback to verify the initiating admin has not been
   * demoted or deleted between connect-initiation and callback arrival.
   */
  isAdminById(userId: string): Promise<boolean>;
}

export interface AgendaRoutesDeps {
  storage: AgendaRoutesStorage;
  auth: AgendaRoutesAuth;
  requireAuth: RequestHandler;
  requireAuthOrToken: RequestHandler;
  loadUserContext: (req: Request, res: Response, next: NextFunction) => any;
  /** Gates the Microsoft connect/disconnect routes to system administrators. */
  requireAdmin?: RequestHandler;
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
  /**
   * Task #362 — fetches the Microsoft Graph cTag for a source file without
   * downloading its bytes. Used by runAgendaSync to skip downloads when the
   * file is unchanged. Returns null when unavailable.
   */
  graphCTagFetch?: (config: AgendaSyncConfig) => Promise<string | null>;
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
  // Task #284 — per-element text-size multipliers (all nullable; widget
  // falls back to its built-in defaults when null so untouched displays
  // render identically).
  "timeScale",
  "dateScale",
  "titleScale",
  "bodyScale",
  "headerDateScale",
  "headerClockScale",
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
  const graphCTagFetch = deps.graphCTagFetch;
  // Fail closed: if requireAdmin is not injected, every admin-only route
  // returns 403 rather than silently passing. routes.ts always provides it.
  const requireAdmin: RequestHandler =
    deps.requireAdmin ??
    ((_req, res) => {
      res.status(403).json({ error: "Administrator access required" });
    });

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

  // Task #290 — an agenda *item* change affects every display config of that
  // site (each config resolves a filtered view of the same items), so drop the
  // cached payload for all of the client's widget configs. Best effort.
  async function invalidateAgendaDisplayForClient(clientId: string): Promise<void> {
    try {
      const configs = await storage.getAgendaWidgetConfigs(clientId);
      await Promise.all(configs.map((c) => invalidateAgendaDisplayCache(clientId, c.id)));
    } catch (err) {
      console.error("[agenda] per-client cache invalidation failed:", err instanceof Error ? err.message : err);
    }
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
      await invalidateAgendaDisplayForClient(item.clientId);
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
      await invalidateAgendaDisplayForClient(existing.clientId);
      if (data.clientId && data.clientId !== existing.clientId) {
        await invalidateAgendaDisplayForClient(data.clientId);
      }
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
      await invalidateAgendaDisplayForClient(existing.clientId);
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
      await invalidateAgendaDisplayForClient(clientId);
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

      // Task #362 — rate-limit manual Refresh Now to 30 s per config so an
      // operator cannot hammer the Microsoft Graph API or the DB by clicking
      // repeatedly.  Applies only to manual triggers, not background ticks.
      const cooldownMs = manualRunCooldownRemainingMs(id);
      if (cooldownMs > 0) {
        return res.status(429).json({
          error: "Please wait before refreshing again",
          retryAfterMs: cooldownMs,
        });
      }

      // Task #362 — surface an explicit conflict when a background tick is
      // already in flight for this config, rather than silently returning
      // noChange:true from the lock-skip path.
      const phase = getConfigSyncPhase(id);
      if (phase) {
        return res.status(409).json({
          error: "A sync is already in progress for this source",
          phase,
        });
      }

      // Record the trigger time before dispatching so the cooldown starts at
      // the moment the operator clicks, not after the (potentially slow) sync.
      recordManualRun(id);

      // AgendaRoutesStorage is structurally a superset of AgendaSyncStorage
      // (both reference identical method signatures from the @shared/schema
      // types), so this pass-through is type-safe.
      const result = await runAgendaSync(existing, { storage, now, resolveStoredPath, graphFetch, graphCTagFetch });
      await invalidateAgendaDisplayForClient(existing.clientId);
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
      // canConnect: true only for system admins — used by the client to decide
      // whether to show the Connect / Disconnect controls.
      const isAdmin = (req as any).dbUser?.role === "admin";
      res.json({ ...status, canConnect: isAdmin });
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

  // ----- Microsoft Entra OAuth connect / disconnect (Task #369) -----
  //
  // These routes implement the authorisation-code + PKCE flow via
  // @azure/msal-node. Only system administrators may connect or disconnect
  // (requireAdmin guard). The callback is unguarded (Microsoft redirects to
  // it without a session cookie) but validates the cryptographic state from
  // the initiating session.

  // GET /api/agenda/microsoft/connect?returnTo=/agenda
  // Generates PKCE, stores state in session, redirects to Microsoft.
  app.get(
    "/api/agenda/microsoft/connect",
    requireAuth,
    loadUserContext,
    requireAdmin,
    async (req, res) => {
      try {
        const rawReturn = typeof req.query.returnTo === "string" ? req.query.returnTo : "";
        const returnTo = sanitizeReturnTo(rawReturn);
        const params = generateOAuthInitParams();
        // initiatedBy must never be blank: if the session user cannot be
        // identified here, the callback has no way to enforce session binding.
        const initiatedBy = ((req as any).dbUser?.id as string | undefined) ?? "";
        if (!initiatedBy) {
          return res.status(403).json({
            error: "Session user cannot be determined. Please sign in again.",
          });
        }
        const sessionState: MsOAuthSessionState = {
          state: params.state,
          nonce: params.nonce,
          codeVerifier: params.codeVerifier,
          initiatedBy,
          returnTo,
          expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
        };
        (req.session as any).msOauthState = sessionState;
        await new Promise<void>((resolve, reject) =>
          req.session.save((err) => (err ? reject(err) : resolve())),
        );
        const authUrl = await buildConnectUrl({
          state: params.state,
          nonce: params.nonce,
          codeChallenge: params.codeChallenge,
        });
        res.redirect(authUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[agenda] Microsoft connect error:", msg);
        res.status(500).json({ error: `Failed to start Microsoft connection: ${msg}` });
      }
    },
  );

  // GET /api/agenda/microsoft/callback
  // Handles the redirect from Microsoft. Validates state / nonce / expiry,
  // exchanges the code, persists the encrypted MSAL cache, then redirects
  // back to returnTo.  No auth middleware — the browser is arriving from
  // login.microsoftonline.com and will not carry the session auth cookie
  // automatically in some configurations; session state is sufficient.
  app.get("/api/agenda/microsoft/callback", async (req, res) => {
    const oauthError = req.query.error;
    if (oauthError) {
      const desc = req.query.error_description ?? oauthError;
      console.error("[agenda] Microsoft OAuth error from Microsoft:", String(desc));
      return res.status(400).send(
        `<!DOCTYPE html><html><body><p>Microsoft sign-in failed: <strong>${String(oauthError)}</strong>. ` +
          `<a href="/">Return to VectorMesh</a></p></body></html>`,
      );
    }

    const sessionState = (req.session as any)?.msOauthState as MsOAuthSessionState | undefined;
    // currentUserId is populated when the browser has an active authenticated session.
    // When it is defined, it must match the admin who initiated the flow (session binding).
    const currentUserId: string | undefined = (req.session as any)?.userId;

    // Validate all callback parameters via the pure helper.
    let validatedState: MsOAuthSessionState;
    try {
      validatedState = validateOAuthCallbackParams({
        sessionState,
        returnedState: req.query.state as string | undefined,
        code: req.query.code as string | undefined,
        currentUserId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Consume state on ALL validation failures — not just expiry.
      // Prevents any replay window regardless of which check fired.
      if (sessionState) {
        delete (req.session as any).msOauthState;
        await new Promise<void>((resolve) => req.session.save(() => resolve()));
      }
      return res.status(400).send(
        `<!DOCTYPE html><html><body><p>${msg}. ` +
          '<a href="/">Start the connection again</a></p></body></html>',
      );
    }

    // Consume the state token immediately after successful validation —
    // before any further async work so that failures in subsequent checks
    // cannot be replayed.
    delete (req.session as any).msOauthState;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );

    // Verify the initiating admin still holds the admin role.  Catches the
    // case where an account is demoted or deleted between initiation and
    // callback arrival.
    const isStillAdmin = await auth.isAdminById(validatedState.initiatedBy);
    if (!isStillAdmin) {
      return res.status(403).send(
        `<!DOCTYPE html><html><body>` +
          `<p>Microsoft connection failed: the initiating account no longer ` +
          `has administrator access. ` +
          `<a href="/">Return to VectorMesh</a></p></body></html>`,
      );
    }

    try {
      await handleOAuthCallback({
        code: req.query.code as string,
        codeVerifier: validatedState.codeVerifier,
        nonce: validatedState.nonce,
        connectedBy: validatedState.initiatedBy,
      });
      const dest = validatedState.returnTo || "/";
      const sep = dest.includes("?") ? "&" : "?";
      res.redirect(`${dest}${sep}msConnected=1`);
    } catch (err) {
      // State already consumed — a failed token exchange cannot be replayed.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[agenda] Microsoft OAuth callback failed:", msg);
      res.status(400).send(
        `<!DOCTYPE html><html><body><p>Microsoft connection failed: ${msg}. ` +
          '<a href="/">Return to VectorMesh</a></p></body></html>',
      );
    }
  });

  // POST /api/agenda/microsoft/disconnect
  // Deletes the encrypted credential row and resets the MSAL singleton.
  // Only the Microsoft OAuth credentials are removed; agenda sync configs,
  // snapshots and items are untouched.
  app.post(
    "/api/agenda/microsoft/disconnect",
    requireAuth,
    loadUserContext,
    requireAdmin,
    async (req, res) => {
      try {
        await disconnectEntraOAuth();
        res.json({ disconnected: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[agenda] Microsoft disconnect error:", msg);
        res.status(500).json({ error: msg });
      }
    },
  );

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

      // Task #362 — authoritative health contract.
      // Compute states server-side so the UI never derives health from
      // temporary React state alone.
      const syncPhase = getConfigSyncPhase(id);
      const sourceHealthState = computeSourceHealthStateWithTimestamps(existing, syncPhase);
      const displayContinuityState = computeDisplayContinuityState(existing);

      // Safe details object: never includes the raw sourceUrl, msDriveId,
      // msItemId, or any pre-authenticated download URL / token.
      const details = {
        // Connected account — we expose only a static string; the actual
        // Microsoft account email is not stored in VectorMesh.
        msAccountConnected: existing.microsoftAuth === true,
        isReadOnly: existing.microsoftAuth === true,
        // Workbook display name (set by the file picker; never a URL).
        msFileName: existing.msFileName ?? null,
        // Worksheet name as configured by the operator; null = first sheet.
        msConfiguredSheetName: existing.sheetName ?? null,
        // Timestamps
        lastCheckedAt: existing.lastSyncAt ?? null,
        lastCTagChangedAt: existing.lastCTagChangedAt ?? null,
        lastPublishedAt: existing.lastPublishedAt ?? null,
        // Snapshot details
        snapshotVersion: existing.lastSnapshotVersion ?? null,
        itemCount: existing.lastItemCount ?? null,
        // Config
        syncIntervalMinutes: existing.syncIntervalMinutes,
        consecutiveFailures: existing.consecutiveFailureCount ?? 0,
        // Last actionable warning (first entry; up to 50 are stored).
        lastActionableWarning:
          Array.isArray(existing.lastSyncWarnings) && existing.lastSyncWarnings.length > 0
            ? existing.lastSyncWarnings[0]
            : null,
      };

      res.json({
        // ── Existing fields (preserved for backward compatibility) ──────
        lastError: existing.lastError ?? null,
        lastErrorAt: existing.lastErrorAt ?? null,
        lastSyncOk: existing.lastSyncOk ?? null,
        lastSyncAt: existing.lastSyncAt ?? null,
        lastItemCount: existing.lastItemCount ?? null,
        warnings: existing.lastSyncWarnings ?? [],
        // ── Task #362 authoritative health contract ──────────────────────
        sourceHealthState,
        displayContinuityState,
        details,
        // Legacy shape kept for any existing callers.
        sourceConnectionHealth: extractSourceConnectionHealth(existing),
        displayContinuity: extractDisplayContinuity(existing),
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
      await invalidateAgendaDisplayCache(existing.clientId, id);
      if (data.clientId && data.clientId !== existing.clientId) {
        await invalidateAgendaDisplayCache(data.clientId, id);
      }
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
      await invalidateAgendaDisplayCache(existing.clientId, id);
      audit(req, "delete", "agenda_widget_config", id, { name: existing.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agenda config:", error);
      res.status(500).json({ error: "Failed to delete agenda config" });
    }
  });

  app.get("/api/agenda/display/:configId", async (req, res) => {
    try {
      const configId = getPathParam(req, "configId");
      // Optional ?at=<ISO instant> test-date override so operators can
      // preview a screen as if "now" were a chosen moment. Invalid or
      // missing values fall back to the real server clock.
      const atRaw = typeof req.query.at === "string" ? req.query.at : null;
      const parsedAt = atRaw ? new Date(atRaw) : null;
      const hasOverride = !!(parsedAt && !Number.isNaN(parsedAt.getTime()));
      const resolveAt = hasOverride ? parsedAt! : now();

      let payload: Awaited<ReturnType<typeof buildAgendaDisplayPayload>> = null;
      if (hasOverride) {
        // Task #290 — a ?at preview resolves "now" to an arbitrary instant,
        // so it must NEVER be cached (every preview is a one-off).
        payload = await buildAgendaDisplayPayload(storage, configId, resolveAt);
      } else {
        // Cache the computed display payload (short TTL, serve-stale) keyed
        // per tenant. Look up the config's clientId cheaply first so the key
        // is tenant-scoped and the admin viewer can site-scope by metadata.
        const cfg = await storage.getAgendaWidgetConfig(configId);
        if (!cfg) return res.status(404).json({ error: "Config not found" });
        const result = await getOrSet({
          namespace: CACHE_NAMESPACES.AGENDA,
          key: buildCacheKey(cfg.clientId, configId),
          ttlMs: DEFAULT_TTLS.AGENDA_DISPLAY,
          source: "agenda:display",
          metadata: { clientId: cfg.clientId },
          fetcher: async () => {
            const built = await buildAgendaDisplayPayload(storage, configId, resolveAt);
            if (!built) throw new Error("Config not found");
            return built;
          },
        });
        payload = result.data;
      }
      if (!payload) return res.status(404).json({ error: "Config not found" });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...payload, serverTime: Date.now() });
    } catch (error) {
      console.error("Error serving agenda display:", error);
      res.status(500).json({ error: "Failed to serve agenda" });
    }
  });

  // Task #290 — admin "refresh" for an agenda display cache entry. Recomputes
  // the payload for "now" and writes it back even when still fresh. The cacheKey
  // is buildCacheKey(clientId, configId); we re-derive the configId from it.
  registerRefresher(CACHE_NAMESPACES.AGENDA, async (entry) => {
    const parts = entry.cacheKey.split(":");
    const configId = parts.length > 1 ? parts[1] : parts[0];
    const cfg = await storage.getAgendaWidgetConfig(configId);
    if (!cfg) {
      await del(CACHE_NAMESPACES.AGENDA, entry.cacheKey);
      return null;
    }
    const built = await buildAgendaDisplayPayload(storage, configId, now());
    if (!built) {
      await del(CACHE_NAMESPACES.AGENDA, entry.cacheKey);
      return null;
    }
    await set(CACHE_NAMESPACES.AGENDA, entry.cacheKey, built, {
      ttlMs: DEFAULT_TTLS.AGENDA_DISPLAY,
      source: "agenda:display",
      metadata: { clientId: cfg.clientId },
    });
    return { data: built, status: "fresh", stale: false, ok: true, updatedAt: new Date(), source: "agenda:display" };
  });
}

// Assemble the scrubbed public agenda display payload (without serverTime,
// which is always stamped fresh after any cache read). Extracted to module
// scope (Task #290) so both the display route and the admin cache refresher
// can recompute it. Returns null when the config doesn't exist.
async function buildAgendaDisplayPayload(
  storage: AgendaRoutesStorage,
  configId: string,
  resolveAt: Date,
) {
      const resolved = await storage.getResolvedAgendaForConfig(
        configId,
        resolveAt,
      );
      if (!resolved) return null;
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
        // Task #284 — per-element text-size multipliers. Coerce undefined
        // → null so the keys are always present in the public payload,
        // matching PUBLIC_AGENDA_CONFIG_FIELDS exactly.
        timeScale: config.timeScale ?? null,
        dateScale: config.dateScale ?? null,
        titleScale: config.titleScale ?? null,
        bodyScale: config.bodyScale ?? null,
        headerDateScale: config.headerDateScale ?? null,
        headerClockScale: config.headerClockScale ?? null,
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
      return {
        config: publicConfig,
        items: publicItems,
        client: client ? { name: client.name, timezone: client.timezone } : null,
        fonts: fonts.map((f) => ({ id: f.id, familyId: f.familyId, name: f.name, weight: f.weight, style: f.style, format: f.format })),
      };
}

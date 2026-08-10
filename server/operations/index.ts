/**
 * Task #329 — Display Operations API
 * Task #330 — Monitor Sessions & Rendering
 *
 * Provides a clean, stable API namespace for external operational clients
 * (initially VectorMesh Multiview). All internal model names (clients,
 * screen_groups, etc.) are mapped to public Operations API terminology
 * (projects, venues, screens) at the boundary layer in this file.
 *
 * Authentication: reuses the existing session cookie + vm_... bearer-token
 * mechanism via the caller-supplied middleware — no second auth system.
 * Permissions: relational scope tables (user_operations_scopes,
 * token_operations_scopes) gate each endpoint; admins and account_managers
 * pass all scope checks implicitly.
 *
 * Monitor session security model:
 *   Bootstrap token: 32-byte random, hex-encoded, single-use; ONLY its
 *     SHA-256 hash is stored in monitor_sessions.token_hash.
 *   Session secret: separate 32-byte random generated at bootstrap exchange;
 *     stored only as SHA-256(secret) in monitor_sessions.session_secret_hash.
 *     The raw secret travels exclusively in an HttpOnly SameSite=Strict cookie.
 *   No raw token, device token, or pairing code is ever stored or forwarded
 *   to the monitor client.
 */

import crypto from "crypto";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import type { Client, Event, ScreenGroup, Screen, DisplayProfile, MonitorSession, InsertMonitorSession } from "@shared/schema";
import { getPathParam } from "../requestParams";

// ============ Scope constants ============

export const OPERATIONS_SCOPES = {
  VIEW: "operations.view",
  MULTIVIEW: "operations.multiview",
  SCREEN_READ: "operations.screen.read",
  DIAGNOSTICS_READ: "operations.diagnostics.read",
  // Future:
  // PLAYER_REFRESH: "operations.player.refresh",
  // PLAYER_RESTART: "operations.player.restart",
  // PLAYER_REBOOT:  "operations.player.reboot",
  // LOGS_READ:      "operations.logs.read",
  // CONTENT_CONTROL:"operations.content.control",
} as const;

export type OperationsScope = typeof OPERATIONS_SCOPES[keyof typeof OPERATIONS_SCOPES];

/** All scope values in a flat array, for validation. */
export const ALL_OPERATIONS_SCOPE_VALUES: readonly string[] = Object.values(OPERATIONS_SCOPES);

/**
 * Administrator-visible scope definitions for the scope-management UI.
 * Add a new entry here (alongside the OPERATIONS_SCOPES constant above)
 * when a new scope should be surfaced to administrators.
 */
export const ADMIN_VISIBLE_SCOPES: ReadonlyArray<{
  scope: OperationsScope;
  label: string;
  description: string;
}> = [
  {
    scope: OPERATIONS_SCOPES.VIEW,
    label: "View Projects & Venues",
    description: "Allows discovery of accessible projects and venues via the Operations API.",
  },
  {
    scope: OPERATIONS_SCOPES.SCREEN_READ,
    label: "Read Screens",
    description: "Allows listing screens and reading screen status information.",
  },
  {
    scope: OPERATIONS_SCOPES.MULTIVIEW,
    label: "Multiview",
    description: "Allows creation of read-only live monitor sessions for screens.",
  },
  {
    scope: OPERATIONS_SCOPES.DIAGNOSTICS_READ,
    label: "Read Diagnostics",
    description: "Allows access to operational diagnostics.",
  },
];

/**
 * The three scopes bundled by the "Grant Multiview Access" preset.
 * Removing multiview access removes exactly these three scopes.
 */
export const MULTIVIEW_PRESET_SCOPES: readonly OperationsScope[] = [
  OPERATIONS_SCOPES.VIEW,
  OPERATIONS_SCOPES.SCREEN_READ,
  OPERATIONS_SCOPES.MULTIVIEW,
];

// ============ Storage interface (dependency-injected, testable) ============

export interface OperationsRoutesStorage {
  // Projects (clients)
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  /**
   * Returns the explicit DB-stored client IDs for a given user.
   * Used for bearer-token tenant isolation: token callers always use this
   * list regardless of the token owner's role (no role-based bypass).
   */
  getUserClientIds(userId: string): Promise<string[]>;
  getEvents(): Promise<Event[]>;

  // Venues (screen groups)
  getScreenGroups(): Promise<ScreenGroup[]>;
  getScreenGroupsWithMemberCounts(): Promise<(ScreenGroup & { memberCount: number })[]>;
  getScreenGroup(id: string): Promise<ScreenGroup | undefined>;

  // Screens
  getGroupMembers(groupId: string): Promise<Screen[]>;
  getScreen(id: string): Promise<Screen | undefined>;
  getDisplayProfile(id: string): Promise<DisplayProfile | undefined>;

  // Operations permissions
  getOperationsScopesForUser(userId: string): Promise<string[]>;
  getOperationsScopesForToken(tokenId: string): Promise<string[]>;

  // Monitor sessions (Task #330)
  createMonitorSession(data: InsertMonitorSession): Promise<MonitorSession>;
  getMonitorSession(id: string): Promise<MonitorSession | undefined>;
  getMonitorSessionByTokenHash(tokenHash: string): Promise<MonitorSession | undefined>;
  consumeMonitorBootstrapToken(
    id: string,
    sessionSecretHash: string,
    now: Date,
  ): Promise<MonitorSession | null>;
  touchMonitorSessionLastAccess(id: string, now: Date): Promise<void>;
  revokeMonitorSession(id: string, revokedAt: Date): Promise<boolean>;
  cleanupExpiredMonitorSessions(retentionDays: number, now: Date): Promise<number>;
  getMonitorSessionsForScreen(screenId: string, now?: Date): Promise<MonitorSession[]>;
}

// ============ Auth helpers (dependency-injected, testable) ============

export interface OperationsRoutesAuth {
  /** Returns true when the requesting user (or token's owner) can access the given clientId. */
  canAccessClient(req: Request, clientId: string): boolean;
  /** Returns null for admin (all), or the list of accessible clientIds. */
  getAllowedClientIds(req: Request): string[] | null;
}

// ============ Monitor session deps ============

export interface OperationsMonitorDeps {
  /**
   * Resolves screen content for the monitor (same as player content but with
   * side-effect signals (refreshRequested, screenshotRequested) stripped and
   * device credentials (deviceToken, pairingCode, kioskModeEnabled) removed).
   * Implemented in routes.ts using the full resolveScreenContent pipeline.
   */
  resolveMonitorContent(screenId: string): Promise<Record<string, unknown>>;
  /**
   * Returns the absolute public base URL (no trailing slash) used to
   * construct `monitorUrl` in POST monitor-session responses.
   * Falls back to REPLIT_DEV_DOMAIN in development.
   */
  getPublicBaseUrl(): string;
  /**
   * Writes an audit log entry. Wrapper around the project's logAudit helper.
   */
  logAudit(
    action: string,
    entityType: string,
    entityId?: string,
    payload?: Record<string, unknown>,
  ): void;
  /**
   * Serves a media asset file for a monitor client.
   * Authenticated upstream by validateMonitorCookie. Authorization is enforced
   * here: `clientId` is the monitor session's tenant; only assets owned by
   * or explicitly shared with that client are served (mirrors filterMediaAssetsForScreen).
   * A null clientId means the session's screen is unowned — access is denied.
   */
  serveMediaFile(
    mediaId: string,
    clientId: string | null | undefined,
    req: Request,
    res: Response,
  ): Promise<void>;
}

// ============ Cookie helpers (exported for use in monitor page route) ============

export const MONITOR_COOKIE_NAME = "vm_monitor_session";
// Cookie must be scoped to "/" so it is sent to BOTH the monitor page
// (/monitor/:screenId) AND the content endpoint (/api/monitor/:screenId/content).
// A narrower path like "/monitor" would silently block content polls.
export const MONITOR_COOKIE_PATH = "/";

/**
 * Returns a hex string of the SHA-256 hash of the given buffer or string.
 * Used for both bootstrap tokens and session secrets so that no raw value
 * ever reaches persistent storage.
 */
export function sha256Hex(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Parses the monitor session cookie from the raw `Cookie` request header.
 *
 * IMPORTANT: This application does not register cookie-parser middleware —
 * only express-session's own session cookie is handled automatically.
 * Arbitrary cookies (including vm_monitor_session) never appear in
 * `req.cookies`, so we must parse the raw header ourselves.
 */
export function parseMonitorCookie(
  req: Request,
): { monitorSessionId: string; rawSecret: string } | null {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;

  // Minimal RFC-6265 cookie string parser (name=value; name=value ...)
  let raw: string | undefined;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 0) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name === MONITOR_COOKIE_NAME) {
      raw = part.slice(eqIdx + 1).trim();
      break;
    }
  }
  if (typeof raw !== "string") return null;

  // Express's res.cookie() URL-encodes the value by default (`:` → `%3A`).
  // Decode before parsing so both the encoded and unencoded forms are handled.
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* leave as-is */ }

  const sep = decoded.indexOf(":");
  if (sep < 1) return null;
  const monitorSessionId = decoded.slice(0, sep);
  const rawSecret = decoded.slice(sep + 1);
  if (!monitorSessionId || !rawSecret) return null;
  return { monitorSessionId, rawSecret };
}

/**
 * Validates a monitor session cookie against the database row.
 * All rejection reasons return null (no oracle — same response regardless of why).
 */
export async function validateMonitorCookie(
  req: Request,
  st: OperationsRoutesStorage,
  screenId?: string,
): Promise<MonitorSession | null> {
  const parsed = parseMonitorCookie(req);
  if (!parsed) return null;
  const { monitorSessionId, rawSecret } = parsed;

  const session = await st.getMonitorSession(monitorSessionId);
  if (!session) return null;

  const now = new Date();
  if (session.revokedAt !== null && session.revokedAt !== undefined) return null;
  if (session.expiresAt < now) return null;
  if (!session.sessionSecretHash) return null; // bootstrap not yet completed
  if (session.bootstrapUsedAt === null || session.bootstrapUsedAt === undefined) return null;

  // Constant-time comparison to prevent timing oracle attacks
  const expectedHash = sha256Hex(rawSecret);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(session.sessionSecretHash, "hex"),
      Buffer.from(expectedHash, "hex"),
    )
  )
    return null;

  if (screenId && session.screenId !== screenId) return null;

  return session;
}

/** Generic 401 body — same text for ALL monitor auth failures (no oracle). */
const MONITOR_401_JSON = JSON.stringify({
  error: "UNAUTHORIZED",
  message: "Monitor session invalid, expired, or revoked. Create a new monitor session.",
});

/** Set the monitor session cookie (HttpOnly, SameSite=Strict, Secure in prod). */
function setMonitorCookie(
  res: Response,
  monitorSessionId: string,
  rawSecret: string,
  expiresAt: Date,
): void {
  const cookieValue = `${monitorSessionId}:${rawSecret}`;
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(MONITOR_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    expires: expiresAt,
    path: MONITOR_COOKIE_PATH,
  });
}

/** Clear the monitor session cookie. */
function clearMonitorCookie(res: Response): void {
  res.clearCookie(MONITOR_COOKIE_NAME, { path: MONITOR_COOKIE_PATH });
}

// ============ Public response shapes (stable API contract) ============

interface OperationsProject {
  id: string;
  name: string;
  status: "active" | "inactive" | "unscheduled";
  startDate: string | null;
  endDate: string | null;
}

interface OperationsVenue {
  id: string;
  name: string;
  screenCount: number;
}

interface OperationsScreen {
  id: string;
  name: string;
  status: {
    online: boolean;
    lastHeartbeat: string | null;
  };
  display: {
    width: number | null;
    height: number | null;
  };
  player: {
    hostname: string | null;
    ipAddress: string | null;
    hardwareClass: string | null;
  };
}

// ============ Mapping helpers ============

/** Derive project status from associated events. */
function deriveProjectStatus(
  events: Event[],
): { status: OperationsProject["status"]; startDate: string | null; endDate: string | null } {
  const now = Date.now();
  // Prefer an event that is currently active
  const active = events.find(
    (e) => e.isActive && e.startDate.getTime() <= now && e.endDate.getTime() >= now,
  );
  if (active) {
    return {
      status: "active",
      startDate: active.startDate.toISOString(),
      endDate: active.endDate.toISOString(),
    };
  }
  // Fall back to the next upcoming event
  const upcoming = events
    .filter((e) => e.isActive && e.startDate.getTime() > now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  if (upcoming) {
    return {
      status: "inactive",
      startDate: upcoming.startDate.toISOString(),
      endDate: upcoming.endDate.toISOString(),
    };
  }
  return { status: "unscheduled", startDate: null, endDate: null };
}

function mapProject(client: Client, clientEvents: Event[]): OperationsProject {
  const { status, startDate, endDate } = deriveProjectStatus(clientEvents);
  return { id: client.id, name: client.name, status, startDate, endDate };
}

function mapVenue(group: ScreenGroup, screenCount: number): OperationsVenue {
  return { id: group.id, name: group.name, screenCount };
}

/**
 * Maps a screen row to the safe public Operations API shape.
 * Credential fields (deviceToken, pairingCode, kioskModeEnabled) are
 * explicitly excluded at this mapping layer, not by caller convention.
 */
function mapScreen(screen: Screen, profile: DisplayProfile | null): OperationsScreen {
  return {
    id: screen.id,
    name: screen.name,
    status: {
      online: screen.isOnline ?? false,
      lastHeartbeat: screen.lastSeen?.toISOString() ?? null,
    },
    display: {
      width: profile?.width ?? null,
      height: profile?.height ?? null,
    },
    player: {
      hostname: screen.hostname ?? null,
      ipAddress: screen.ipAddress ?? null,
      hardwareClass: screen.hardwareClass ?? null,
    },
    // Explicitly NOT included: deviceToken, pairingCode, kioskModeEnabled,
    // fallbackLayoutId, fallbackPlaylistId, canvasGroupId, etc.
  };
}

// ============ Monitor bootstrap rate limiter ============

const DEFAULT_MONITOR_BOOTSTRAP_RATE_LIMIT_MAX = 10;

function getMonitorBootstrapRateLimitMax(): number {
  const env = process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;
}

/**
 * Generic 429 body — same shape as the 401 body to prevent timing oracles.
 * The 429 status itself is safe to reveal (RFC 6585); only the body must
 * not disclose whether a given token was valid.
 */
const MONITOR_429_JSON = JSON.stringify({
  error: "UNAUTHORIZED",
  message: "Monitor session invalid, expired, or revoked. Create a new monitor session.",
});

/**
 * IP-based rate limiter for the monitor bootstrap endpoint.
 * Built lazily on first mount so the env var is read at runtime.
 */
function createMonitorBootstrapRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: getMonitorBootstrapRateLimitMax(),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).type("application/json").send(MONITOR_429_JSON);
    },
    // Use the library's built-in IP key handling (IPv6-safe normalization).
    // Do NOT supply a custom keyGenerator — express-rate-limit v8+ warns
    // about raw req.ip keys on IPv6 because callers can cycle subnet addresses
    // to evade limits; the library default handles this correctly.
  });
}

// ============ Monitor session TTL ============

const DEFAULT_MONITOR_SESSION_TTL_HOURS = 4;
const DEFAULT_MONITOR_RETENTION_DAYS = 30;
const MONITOR_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function getMonitorTtlHours(): number {
  const env = process.env.MONITOR_SESSION_TTL_HOURS;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MONITOR_SESSION_TTL_HOURS;
}

function getMonitorRetentionDays(): number {
  const env = process.env.MONITOR_SESSION_RETENTION_DAYS;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MONITOR_RETENTION_DAYS;
}

// ============ Standard error response ============

function apiError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({ error: message, code });
}

// ============ Mount function ============

// ============ Cleanup job (exported so index.ts can schedule it) ============

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the periodic cleanup job for expired monitor sessions.
 * Safe to call multiple times — only one interval is ever active.
 * Runs immediately on start, then every MONITOR_CLEANUP_INTERVAL_MS.
 */
export function startMonitorSessionCleanup(
  st: Pick<OperationsRoutesStorage, "cleanupExpiredMonitorSessions">,
): void {
  if (cleanupInterval) return; // already running

  const run = async () => {
    try {
      const retentionDays = getMonitorRetentionDays();
      const count = await st.cleanupExpiredMonitorSessions(retentionDays, new Date());
      if (count > 0) {
        console.log(
          `[monitor-cleanup] Purged ${count} expired monitor session(s) (retention=${retentionDays}d)`,
        );
      }
    } catch (err) {
      console.error("[monitor-cleanup] Cleanup job error:", err);
    }
  };

  run(); // run immediately at startup
  cleanupInterval = setInterval(run, MONITOR_CLEANUP_INTERVAL_MS);
}

export function mountOperationsRoutes(
  app: Express,
  deps: {
    storage: OperationsRoutesStorage;
    auth: OperationsRoutesAuth;
    requireAuthOrToken: RequestHandler;
    loadUserContext: RequestHandler;
    monitor: OperationsMonitorDeps;
  },
): void {
  const { storage: st, auth, requireAuthOrToken, loadUserContext, monitor } = deps;

  // ---- Scope middleware factory ----
  //
  // Authorization model:
  //   Session-authenticated (no apiToken on req):
  //     - admin / account_manager → implicit grant for all operations scopes
  //     - site_user → must have an explicit row in user_operations_scopes
  //
  //   Bearer-token-authenticated (apiToken present on req):
  //     - Always checked against token_operations_scopes, regardless of the
  //       token owner's role. Even an admin-owned token requires an explicit
  //       grant. This gives operators fine-grained per-token control.
  function requireScope(scope: OperationsScope): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).dbUser;
      if (!user) return apiError(res, 401, "UNAUTHENTICATED", "Unauthorized");

      const token = (req as any).apiToken;

      try {
        if (token) {
          // Bearer-token path: always require an explicit token scope grant.
          const grantedScopes = await st.getOperationsScopesForToken(token.id);
          if (!grantedScopes.includes(scope)) {
            return apiError(res, 403, "FORBIDDEN", "Insufficient permissions");
          }
        } else {
          // Session path: elevated roles pass implicitly; site_users need a row.
          if (user.role === "admin" || user.role === "account_manager") {
            return next();
          }
          const grantedScopes = await st.getOperationsScopesForUser(user.id);
          if (!grantedScopes.includes(scope)) {
            return apiError(res, 403, "FORBIDDEN", "Insufficient permissions");
          }
        }
      } catch (err) {
        console.error("[operations] scope check error:", err);
        return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }

      next();
    };
  }

  // ---- Tenant-access resolution for Operations API ----
  //
  // Uses req.allowedClientIds populated by loadUserContext, which applies the
  // same role-aware logic for both session and bearer-token requests:
  //   admin (session or token) → null (unrestricted access)
  //   non-admin               → explicit user_sites list from getUserClientIds
  //
  // This matches the behaviour of GET /api/screens and every other
  // token-enabled route. The previous split (bearer-token path always called
  // getUserClientIds directly) incorrectly returned [] for admin-owned tokens
  // because admins have no user_sites rows, causing all Operations endpoints to
  // return empty results while /api/screens continued to work correctly.
  //
  // Operations scopes (operations.view, operations.multiview, etc.) gate what
  // actions a token may perform; the owner's role/tenant association determines
  // which data it may see. These two concerns remain separate.
  async function resolveEffectiveClientIds(req: Request): Promise<string[] | null> {
    return auth.getAllowedClientIds(req);
  }

  async function canAccessClientForOps(req: Request, clientId: string): Promise<boolean> {
    const effective = await resolveEffectiveClientIds(req);
    if (effective === null) return true; // admin session: unrestricted
    return effective.includes(clientId);
  }

  // All operations routes require authentication + user context
  const baseMiddleware: RequestHandler[] = [requireAuthOrToken, loadUserContext];

  // ---- GET /api/operations/projects ----
  // Returns projects (clients) the authenticated user can access.
  app.get(
    "/api/operations/projects",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.VIEW),
    async (req: Request, res: Response) => {
      try {
        const allowedIds = await resolveEffectiveClientIds(req); // null = all (admin session)
        const [allClients, allEvents] = await Promise.all([
          st.getClients(),
          st.getEvents(),
        ]);

        const accessible = allowedIds === null
          ? allClients
          : allClients.filter((c) => allowedIds.includes(c.id));

        const eventsByClient = new Map<string, Event[]>();
        for (const evt of allEvents) {
          if (!eventsByClient.has(evt.clientId)) eventsByClient.set(evt.clientId, []);
          eventsByClient.get(evt.clientId)!.push(evt);
        }

        const projects: OperationsProject[] = accessible.map((c) =>
          mapProject(c, eventsByClient.get(c.id) ?? []),
        );

        res.json(projects);
      } catch (err) {
        console.error("[operations] GET /projects error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ---- GET /api/operations/projects/:projectId/venues ----
  // Returns venues (screen_groups) for the given project.
  app.get(
    "/api/operations/projects/:projectId/venues",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.VIEW),
    async (req: Request, res: Response) => {
      try {
        const projectId = getPathParam(req, "projectId");

        // Validate the project exists and the user can access it
        const client = await st.getClient(projectId);
        if (!client) return apiError(res, 404, "NOT_FOUND", "Project not found");
        if (!(await canAccessClientForOps(req, projectId))) {
          return apiError(res, 403, "FORBIDDEN", "Access denied");
        }

        // Get all groups for this client with member counts
        const allGroupsWithCounts = await st.getScreenGroupsWithMemberCounts();
        const clientGroups = allGroupsWithCounts.filter(
          (g) => g.clientId === projectId,
        );

        const venues: OperationsVenue[] = clientGroups.map((g) =>
          mapVenue(g, g.memberCount),
        );

        res.json(venues);
      } catch (err) {
        console.error("[operations] GET /projects/:id/venues error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ---- GET /api/operations/venues/:venueId/screens ----
  // Returns screens (physical displays) in the given venue.
  app.get(
    "/api/operations/venues/:venueId/screens",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.SCREEN_READ),
    async (req: Request, res: Response) => {
      try {
        const venueId = getPathParam(req, "venueId");

        const group = await st.getScreenGroup(venueId);
        if (!group) return apiError(res, 404, "NOT_FOUND", "Venue not found");

        // Fail-closed: resources without a tenant owner are denied to
        // non-admin callers. null clientId means the venue is unowned;
        // only admin sessions (effective IDs = null) may see it.
        if (group.clientId === null || group.clientId === undefined) {
          const effectiveIds = await resolveEffectiveClientIds(req);
          if (effectiveIds !== null) {
            return apiError(res, 403, "FORBIDDEN", "Access denied");
          }
        } else if (!(await canAccessClientForOps(req, group.clientId))) {
          return apiError(res, 403, "FORBIDDEN", "Access denied");
        }

        const members = await st.getGroupMembers(venueId);

        // Batch-fetch display profiles (deduplicated by profileId)
        const profileIds = [
          ...new Set(members.map((s) => s.displayProfileId).filter(Boolean) as string[]),
        ];
        const profileMap = new Map<string, DisplayProfile>();
        await Promise.all(
          profileIds.map(async (pid) => {
            const p = await st.getDisplayProfile(pid);
            if (p) profileMap.set(pid, p);
          }),
        );

        const screens: OperationsScreen[] = members.map((s) =>
          mapScreen(s, s.displayProfileId ? (profileMap.get(s.displayProfileId) ?? null) : null),
        );

        res.json(screens);
      } catch (err) {
        console.error("[operations] GET /venues/:id/screens error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ---- GET /api/operations/screens/:screenId ----
  // Returns the single-screen operations summary.
  app.get(
    "/api/operations/screens/:screenId",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.SCREEN_READ),
    async (req: Request, res: Response) => {
      try {
        const screenId = getPathParam(req, "screenId");

        const screen = await st.getScreen(screenId);
        if (!screen) return apiError(res, 404, "NOT_FOUND", "Screen not found");

        // Fail-closed: screens without a tenant owner are denied to
        // non-admin callers. null clientId means the screen is unowned;
        // only admin sessions (effective IDs = null) may see it.
        if (screen.clientId === null || screen.clientId === undefined) {
          const effectiveIds = await resolveEffectiveClientIds(req);
          if (effectiveIds !== null) {
            return apiError(res, 403, "FORBIDDEN", "Access denied");
          }
        } else if (!(await canAccessClientForOps(req, screen.clientId))) {
          return apiError(res, 403, "FORBIDDEN", "Access denied");
        }

        const profile = screen.displayProfileId
          ? (await st.getDisplayProfile(screen.displayProfileId)) ?? null
          : null;

        res.json(mapScreen(screen, profile));
      } catch (err) {
        console.error("[operations] GET /screens/:id error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ============ MONITOR SESSION ENDPOINTS (Task #330 + #331) ============

  // ---- GET /api/operations/screens/:screenId/monitor-sessions ----
  // Returns active (non-expired, non-revoked) monitor sessions for the given
  // screen. Intended for the admin "Monitor Sessions" panel. Requires the
  // operations.multiview scope (admins and account_managers pass implicitly).
  app.get(
    "/api/operations/screens/:screenId/monitor-sessions",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.MULTIVIEW),
    async (req: Request, res: Response) => {
      try {
        const screenId = getPathParam(req, "screenId");

        const screen = await st.getScreen(screenId);
        if (!screen) return apiError(res, 404, "NOT_FOUND", "Screen not found");

        // Tenant isolation: verify the requesting user/token can access this screen
        if (screen.clientId === null || screen.clientId === undefined) {
          const effectiveIds = await resolveEffectiveClientIds(req);
          if (effectiveIds !== null) {
            return apiError(res, 403, "FORBIDDEN", "Access denied");
          }
        } else if (!(await canAccessClientForOps(req, screen.clientId))) {
          return apiError(res, 403, "FORBIDDEN", "Access denied");
        }

        const sessions = await st.getMonitorSessionsForScreen(screenId);

        // Strip internal-only fields (token_hash, session_secret_hash) before
        // returning. The client only needs display-safe fields.
        const safe = sessions.map((s) => ({
          id: s.id,
          screenId: s.screenId,
          clientId: s.clientId,
          clientType: s.clientType,
          clientName: s.clientName,
          bootstrapUsedAt: s.bootstrapUsedAt?.toISOString() ?? null,
          expiresAt: s.expiresAt.toISOString(),
          lastAccessAt: s.lastAccessAt?.toISOString() ?? null,
          createdAt: s.createdAt?.toISOString() ?? null,
          // ipAddress is not stored on the session row — not included.
        }));

        res.json(safe);
      } catch (err) {
        console.error("[operations] GET /screens/:id/monitor-sessions error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ---- POST /api/operations/screens/:screenId/monitor-session ----
  // Creates a new monitor session for the given screen.
  // Requires operations.multiview scope.
  // Returns: { screenId, monitorSessionId, monitorUrl, expiresAt }
  // The monitorUrl is a single-use bootstrap URL that the Multiview Electron
  // app loads directly. It sets an HttpOnly cookie and redirects to the monitor
  // page. Never returns: deviceToken, pairingCode, or any device credential.
  app.post(
    "/api/operations/screens/:screenId/monitor-session",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.MULTIVIEW),
    async (req: Request, res: Response) => {
      try {
        const screenId = getPathParam(req, "screenId");
        const user = (req as any).dbUser;

        const screen = await st.getScreen(screenId);
        if (!screen) return apiError(res, 404, "NOT_FOUND", "Screen not found");

        // Tenant isolation: verify the requesting user/token can access this screen
        if (screen.clientId === null || screen.clientId === undefined) {
          const effectiveIds = await resolveEffectiveClientIds(req);
          if (effectiveIds !== null) {
            return apiError(res, 403, "FORBIDDEN", "Access denied");
          }
        } else if (!(await canAccessClientForOps(req, screen.clientId))) {
          return apiError(res, 403, "FORBIDDEN", "Access denied");
        }

        // Generate 32-byte bootstrap token; store only its SHA-256 hash.
        // IMPORTANT: hash the hex-encoded string (not the raw Buffer) because
        // the bootstrap route also receives and hashes the hex string from the
        // URL query parameter. Both sides must hash the same representation.
        const bootstrapTokenBytes = crypto.randomBytes(32);
        const bootstrapTokenHex = bootstrapTokenBytes.toString("hex");
        const tokenHash = sha256Hex(bootstrapTokenHex);

        const ttlHours = getMonitorTtlHours();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

        const clientType =
          typeof req.body?.clientType === "string" ? req.body.clientType : "multiview";
        const clientName =
          typeof req.body?.clientName === "string" ? req.body.clientName : null;

        const session = await st.createMonitorSession({
          userId: user.id,
          screenId,
          clientId: screen.clientId ?? null,
          tokenHash,
          expiresAt,
          clientType,
          clientName,
        });

        const baseUrl = monitor.getPublicBaseUrl();
        const monitorUrl = `${baseUrl}/monitor-bootstrap/${screenId}?token=${bootstrapTokenHex}`;

        monitor.logAudit("monitor_session.created", "monitor_session", session.id, {
          screenId,
          clientType,
          clientName,
          expiresAt: expiresAt.toISOString(),
        });

        res.status(201).json({
          screenId,
          monitorSessionId: session.id,
          monitorUrl,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (err) {
        console.error("[operations] POST /screens/:id/monitor-session error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ---- DELETE /api/operations/monitor-sessions/:sessionId ----
  // Revokes a monitor session immediately. The session becomes invalid on the
  // next request — no grace period. Writes an audit event.
  app.delete(
    "/api/operations/monitor-sessions/:sessionId",
    ...baseMiddleware,
    requireScope(OPERATIONS_SCOPES.MULTIVIEW),
    async (req: Request, res: Response) => {
      try {
        const sessionId = getPathParam(req, "sessionId");
        const user = (req as any).dbUser;

        const session = await st.getMonitorSession(sessionId);
        if (!session) return apiError(res, 404, "NOT_FOUND", "Monitor session not found");

        // Tenant isolation: only allow revocation of sessions in accessible sites
        if (session.clientId !== null && session.clientId !== undefined) {
          if (!(await canAccessClientForOps(req, session.clientId))) {
            return apiError(res, 403, "FORBIDDEN", "Access denied");
          }
        } else {
          const effectiveIds = await resolveEffectiveClientIds(req);
          if (effectiveIds !== null) {
            return apiError(res, 403, "FORBIDDEN", "Access denied");
          }
        }

        const revoked = await st.revokeMonitorSession(sessionId, new Date());

        monitor.logAudit("monitor_session.revoked", "monitor_session", sessionId, {
          alreadyRevoked: !revoked,
          revokedBy: user.id,
        });

        res.json({ revoked: true });
      } catch (err) {
        console.error("[operations] DELETE /monitor-sessions/:id error:", err);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ---- GET /monitor-bootstrap/:screenId?token=<bootstrapToken> ----
  // Single-use bootstrap exchange. Validates the bootstrap token, generates
  // the session secret, sets the HttpOnly cookie, and redirects to the
  // monitor page. All rejection reasons return the same generic 401 to
  // prevent oracle attacks — no information about why it failed.
  //
  // Headers: Referrer-Policy: no-referrer, Cache-Control: no-store
  //
  // This route is NOT behind requireAuthOrToken — it authenticates itself
  // via the single-use bootstrap token in the query string.
  //
  // Rate-limited: max MONITOR_BOOTSTRAP_RATE_LIMIT_MAX (default 10) attempts
  // per IP per minute. 429 returns the same body shape as 401 so it cannot
  // be used as a timing oracle.
  app.get(
    "/monitor-bootstrap/:screenId",
    createMonitorBootstrapRateLimiter(),
    async (req: Request, res: Response) => {
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

      try {
        const screenId = getPathParam(req, "screenId");
        const tokenParam =
          typeof req.query?.token === "string" ? req.query.token : null;

        // Generic 401 helper — same body for ALL rejection reasons
        const reject = () =>
          res.status(401).type("application/json").send(MONITOR_401_JSON);

        if (!tokenParam) return reject();

        // Hash the provided token and look up by hash (never by raw value)
        const tokenHash = sha256Hex(tokenParam);
        const session = await st.getMonitorSessionByTokenHash(tokenHash);
        if (!session) return reject();
        if (session.screenId !== screenId) return reject();

        const now = new Date();
        if (session.expiresAt < now) return reject();
        if (session.revokedAt !== null && session.revokedAt !== undefined) return reject();
        // Token already used: reject immediately (single-use guarantee)
        if (session.bootstrapUsedAt !== null && session.bootstrapUsedAt !== undefined)
          return reject();

        // Generate the session secret (never stored raw).
        // Hash the hex-encoded string so validateMonitorCookie can reproduce
        // the same hash from the hex value it reads back from the cookie.
        const secretBytes = crypto.randomBytes(32);
        const rawSecretHex = secretBytes.toString("hex");
        const sessionSecretHash = sha256Hex(rawSecretHex);

        // Atomically claim the bootstrap token + store the secret hash
        const updated = await st.consumeMonitorBootstrapToken(
          session.id,
          sessionSecretHash,
          now,
        );
        if (!updated) return reject(); // race: another request beat us to it

        setMonitorCookie(res, session.id, rawSecretHex, session.expiresAt);

        monitor.logAudit("monitor_session.bootstrap", "monitor_session", session.id, {
          screenId,
          ip: req.ip,
        });

        return res.redirect(302, `/monitor/${screenId}`);
      } catch (err) {
        console.error("[operations] GET /monitor-bootstrap error:", err);
        // Return 401 even on server errors to prevent information leakage
        return res.status(401).type("application/json").send(MONITOR_401_JSON);
      }
    },
  );

  // ---- GET /monitor/:screenId ----
  // Validates the monitor session cookie, updates lastAccessAt, and passes
  // control to the SPA catch-all which serves index.html. The React app
  // detects the /monitor/ path and renders MonitorPage (all PlayerCapabilities
  // set to false — no heartbeat, no pairing, no device-identity writes).
  //
  // Injecting window.__VM_MONITOR__ via a <script> tag requires reading and
  // transforming the HTML file. Instead we rely on path-detection in the
  // React app (window.location.pathname.startsWith('/monitor/')), keeping
  // the server side simple and uniform between dev (vite) and prod (static).
  app.get(
    "/monitor/:screenId",
    async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

      try {
        const screenId = getPathParam(req, "screenId");

        const session = await validateMonitorCookie(req, st, screenId);
        if (!session) {
          // If cookie is present but session is revoked, clear stale cookie
          if (req.cookies?.[MONITOR_COOKIE_NAME]) {
            clearMonitorCookie(res);
          }
          return res.status(401).type("application/json").send(MONITOR_401_JSON);
        }

        const now = new Date();
        await st.touchMonitorSessionLastAccess(session.id, now);

        monitor.logAudit("monitor_session.access", "monitor_session", session.id, {
          screenId,
          ip: req.ip,
        });

        // Pass to the SPA catch-all (vite in dev, static in prod)
        next();
      } catch (err) {
        console.error("[operations] GET /monitor/:screenId error:", err);
        return res.status(401).type("application/json").send(MONITOR_401_JSON);
      }
    },
  );

  // ---- GET /api/monitor/media/:mediaId/file ----
  // Cookie-authenticated media file delivery for monitor clients.
  // Mirrors GET /api/player/media/:id/file but requires no device token —
  // only a valid monitor session cookie (for any screen).  Restricting to
  // the specific screenId in the cookie is intentional: if the operator has
  // a valid session for any screen in their tenant, they may fetch media
  // belonging to that tenant (the same scope as the player content endpoint).
  app.get(
    "/api/monitor/media/:mediaId/file",
    async (req: Request, res: Response) => {
      try {
        // Any valid (non-expired, non-revoked, bootstrapped) monitor session grants access.
        const session = await validateMonitorCookie(req, st);
        if (!session) {
          return res.status(401).type("application/json").send(MONITOR_401_JSON);
        }
        const mediaId = getPathParam(req, "mediaId");
        // Pass session.clientId so serveMediaFile can enforce tenant isolation.
        await monitor.serveMediaFile(mediaId, session.clientId, req, res);
      } catch (err) {
        console.error("[operations] GET /api/monitor/media error:", err);
        res.status(500).json({ error: "Failed to serve monitor media file" });
      }
    },
  );

  // ---- GET /api/monitor/:screenId/content ----
  // Cookie-authenticated content endpoint for the monitor page.
  // Returns the same content payload as /api/player/:screenId/content but
  // with all side-effect signals stripped:
  //   - refreshRequested always false (playerCommandsEnabled = false)
  //   - screenshotRequested always false
  //   - screenshotEnabled always false
  // Device credentials are never included (no deviceToken, pairingCode).
  app.get(
    "/api/monitor/:screenId/content",
    async (req: Request, res: Response) => {
      try {
        const screenId = getPathParam(req, "screenId");

        const session = await validateMonitorCookie(req, st, screenId);
        if (!session) {
          return res.status(401).type("application/json").send(MONITOR_401_JSON);
        }

        const content = await monitor.resolveMonitorContent(screenId);
        res.json(content);
      } catch (err) {
        console.error("[operations] GET /api/monitor/:screenId/content error:", err);
        res.status(500).json({ error: "Failed to resolve monitor content" });
      }
    },
  );
}

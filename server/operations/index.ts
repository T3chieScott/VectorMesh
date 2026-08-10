/**
 * Task #329 — Display Operations API
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
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import type { Client, Event, ScreenGroup, Screen, DisplayProfile } from "@shared/schema";
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
}

// ============ Auth helpers (dependency-injected, testable) ============

export interface OperationsRoutesAuth {
  /** Returns true when the requesting user (or token's owner) can access the given clientId. */
  canAccessClient(req: Request, clientId: string): boolean;
  /** Returns null for admin (all), or the list of accessible clientIds. */
  getAllowedClientIds(req: Request): string[] | null;
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

export function mountOperationsRoutes(
  app: Express,
  deps: {
    storage: OperationsRoutesStorage;
    auth: OperationsRoutesAuth;
    requireAuthOrToken: RequestHandler;
    loadUserContext: RequestHandler;
  },
): void {
  const { storage: st, auth, requireAuthOrToken, loadUserContext } = deps;

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
  // Session auth (no apiToken on req):
  //   Uses role-based resolution from auth.getAllowedClientIds — admins get null
  //   (unrestricted), site_users get their explicit DB client list.
  //
  // Bearer-token auth (apiToken present on req):
  //   ALWAYS uses the token owner's explicit DB client grants from
  //   getUserClientIds, regardless of their role.  This means admin-owned
  //   tokens with no explicit client grants correctly receive an empty list and
  //   are denied all tenant access — preventing the role-based bypass.
  async function resolveEffectiveClientIds(req: Request): Promise<string[] | null> {
    const token = (req as any).apiToken;
    if (!token) {
      // Session path: role-based (null = admin = all)
      return auth.getAllowedClientIds(req);
    }
    // Bearer-token path: explicit DB grants only, never role-based
    const user = (req as any).dbUser;
    return st.getUserClientIds(user.id);
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
}

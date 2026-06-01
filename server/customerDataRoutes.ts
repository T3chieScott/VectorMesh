import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import {
  insertDisplayProfileSchema,
  insertScreenGroupSchema,
  insertProgrammeSchema,
  insertScreenPresetSchema,
} from "@shared/schema";
import type { IStorage } from "./storage";
import { getPathParam, getQueryString } from "./requestParams";

/**
 * Storage surface used by the customer-data routes. Picked from IStorage so
 * the method signatures stay in lockstep with the real implementation.
 */
export type CustomerDataRoutesStorage = Pick<
  IStorage,
  // Display profiles
  | "getDisplayProfiles"
  | "getDisplayProfile"
  | "createDisplayProfile"
  | "updateDisplayProfile"
  | "deleteDisplayProfile"
  // Screen groups
  | "getScreenGroupsWithMemberCounts"
  | "getScreenGroups"
  | "getScreenGroup"
  | "createScreenGroup"
  | "updateScreenGroup"
  | "deleteScreenGroup"
  | "getGroupMembers"
  | "addScreenToGroup"
  | "removeScreenFromGroup"
  | "getAllScreenGroupMemberships"
  // Screens (used by group membership + preset resolution)
  | "getScreens"
  | "getScreen"
  // Programmes
  | "getProgrammes"
  | "getProgramme"
  | "createProgramme"
  | "updateProgramme"
  | "deleteProgramme"
  | "reorderProgrammes"
  | "getProgrammeVersions"
  | "createProgrammeVersion"
  | "updateProgrammeVersion"
  // Events (programme client resolution)
  | "getEvents"
  | "getEvent"
  // Screen presets
  | "getScreenPresets"
  | "getScreenPreset"
  | "createScreenPreset"
  | "updateScreenPreset"
  | "deleteScreenPreset"
  | "reorderScreenPresets"
  // Live overrides (preset activation)
  | "getLiveOverrides"
  | "createLiveOverride"
  | "deleteLiveOverride"
>;

export interface CustomerDataRoutesAuth {
  canAccessClient(req: Request, clientId: string): boolean;
  getAllowedClientIds(req: Request): string[] | null;
  isAdmin(req: Request): boolean;
}

export interface CustomerDataRoutesDeps {
  storage: CustomerDataRoutesStorage;
  auth: CustomerDataRoutesAuth;
  requireAuth: RequestHandler;
  requireAuthOrToken: RequestHandler;
  requireAdminOrAccountManager: RequestHandler;
  loadUserContext: (req: Request, res: Response, next: NextFunction) => any;
  logAudit?: (
    req: Request,
    action: string,
    entityType: string,
    entityId?: string,
    payload?: any,
  ) => void;
  refreshScreensForVersion: (versionId: string) => void | Promise<void>;
}

/**
 * Mounts the remaining site-scoped "customer data" admin routes — display
 * profiles, screen groups, programmes, and screen presets — on the given
 * Express app. Extracted from server/routes.ts (Task #258) so the tenant
 * boundary for every access level (site_user, account_manager, admin) can be
 * exercised in isolation with a stub storage and an injected auth/user
 * context (see tests/customer-data-routes-tenant-scoping.test.ts).
 *
 * Behaviour is a verbatim move of the inline handlers; the only change is
 * that storage, auth helpers, and middleware arrive via deps.
 */
export function mountCustomerDataRoutes(app: Express, deps: CustomerDataRoutesDeps) {
  const {
    storage,
    auth,
    requireAuth,
    requireAuthOrToken,
    requireAdminOrAccountManager,
    loadUserContext,
    refreshScreensForVersion,
  } = deps;
  const canAccessClient = (req: Request, clientId: string) =>
    auth.canAccessClient(req, clientId);
  const getAllowedClientIds = (req: Request) => auth.getAllowedClientIds(req);
  const isAdmin = (req: Request) => auth.isAdmin(req);
  const logAudit = deps.logAudit ?? (() => {});

  // ============ DISPLAY PROFILES ============
  app.get("/api/display-profiles", requireAuth, loadUserContext, async (req, res) => {
    try {
      const profiles = await storage.getDisplayProfiles();
      const allowed = getAllowedClientIds(req);
      let filtered = profiles;
      if (allowed) {
        filtered = profiles.filter(p => !p.clientId || allowed.includes(p.clientId));
      }
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(p => p.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching display profiles:", error);
      res.status(500).json({ error: "Failed to fetch display profiles" });
    }
  });

  app.post("/api/display-profiles", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertDisplayProfileSchema.parse({ ...req.body, clientId: req.body.clientId || null });
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const profile = await storage.createDisplayProfile(data);
      logAudit(req, "create", "display_profile", profile.id, { name: profile.name, clientId: profile.clientId });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating display profile:", error);
      res.status(500).json({ error: "Failed to create display profile" });
    }
  });

  app.patch("/api/display-profiles/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getDisplayProfile(getPathParam(req, "id"));
      if (!existing) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this profile's site" });
      }
      const data = insertDisplayProfileSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const profile = await storage.updateDisplayProfile(getPathParam(req, "id"), data);
      logAudit(req, "update", "display_profile", profile!.id, { name: profile!.name });
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating display profile:", error);
      res.status(500).json({ error: "Failed to update display profile" });
    }
  });

  app.delete("/api/display-profiles/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getDisplayProfile(id);
      if (!existing) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this profile's site" });
      }
      await storage.deleteDisplayProfile(id);
      logAudit(req, "delete", "display_profile", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting display profile:", error);
      res.status(500).json({ error: "Failed to delete display profile" });
    }
  });

  // ============ SCREEN GROUPS ============
  app.get("/api/screen-groups", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const groups = await storage.getScreenGroupsWithMemberCounts();
      const allowed = getAllowedClientIds(req);
      let filtered = groups;
      if (allowed) {
        filtered = groups.filter(g => !g.clientId || allowed.includes(g.clientId));
      }
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(g => g.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching screen groups:", error);
      res.status(500).json({ error: "Failed to fetch screen groups" });
    }
  });

  app.post("/api/screen-groups", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertScreenGroupSchema.parse({ ...req.body, clientId: req.body.clientId || null });
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const group = await storage.createScreenGroup(data);
      logAudit(req, "create", "screen_group", group.id, { name: group.name, clientId: group.clientId });
      res.status(201).json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating screen group:", error);
      res.status(500).json({ error: "Failed to create screen group" });
    }
  });

  app.patch("/api/screen-groups/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreenGroup(getPathParam(req, "id"));
      if (!existing) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const data = insertScreenGroupSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const group = await storage.updateScreenGroup(getPathParam(req, "id"), data);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      logAudit(req, "update", "screen_group", group.id, { name: group.name });
      res.json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen group:", error);
      res.status(500).json({ error: "Failed to update screen group" });
    }
  });

  app.delete("/api/screen-groups/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreenGroup(getPathParam(req, "id"));
      if (!existing) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const deleted = await storage.deleteScreenGroup(getPathParam(req, "id"));
      if (!deleted) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      logAudit(req, "delete", "screen_group", getPathParam(req, "id"));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen group:", error);
      res.status(500).json({ error: "Failed to delete screen group" });
    }
  });

  // Screen Group Memberships
  app.get("/api/screen-groups/:id/members", requireAuth, loadUserContext, async (req, res) => {
    try {
      const group = await storage.getScreenGroup(getPathParam(req, "id"));
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const members = await storage.getGroupMembers(getPathParam(req, "id"));
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ error: "Failed to fetch group members" });
    }
  });

  app.post("/api/screen-groups/:id/members", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const { screenId } = req.body;
      if (!screenId) {
        return res.status(400).json({ error: "screenId is required" });
      }
      const group = await storage.getScreenGroup(id);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const screen = await storage.getScreen(screenId);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (group.clientId && screen.clientId && group.clientId !== screen.clientId) {
        return res.status(400).json({ error: "Screen must belong to the same site as the group" });
      }
      await storage.addScreenToGroup(id, screenId);
      logAudit(req, "create", "screen_group_membership", id, { screenId, screenName: screen.name, groupName: group.name });
      res.status(201).json({ success: true });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Screen is already in this group" });
      }
      console.error("Error adding screen to group:", error);
      res.status(500).json({ error: "Failed to add screen to group" });
    }
  });

  // Flat membership list for clients that need to resolve "which screens are
  // in which groups" without round-tripping every group. Site-filtered: only
  // memberships whose screen is in an accessible site are returned.
  app.get("/api/screen-group-memberships", requireAuth, loadUserContext, async (req, res) => {
    try {
      const memberships = await storage.getAllScreenGroupMemberships();
      const allScreens = await storage.getScreens();
      const allowed = getAllowedClientIds(req);
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const screenAllowed = new Set<string>();
      for (const s of allScreens) {
        if (clientId && s.clientId !== clientId) continue;
        if (allowed && s.clientId && !allowed.includes(s.clientId)) continue;
        screenAllowed.add(s.id);
      }
      const filtered = memberships.filter(m => screenAllowed.has(m.screenId));
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching screen group memberships:", error);
      res.status(500).json({ error: "Failed to fetch memberships" });
    }
  });

  app.delete("/api/screen-groups/:id/members/:screenId", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const group = await storage.getScreenGroup(id);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const removed = await storage.removeScreenFromGroup(id, getPathParam(req, "screenId"));
      if (!removed) {
        return res.status(404).json({ error: "Membership not found" });
      }
      logAudit(req, "delete", "screen_group_membership", id, { screenId: getPathParam(req, "screenId") });
      res.status(204).send();
    } catch (error) {
      console.error("Error removing screen from group:", error);
      res.status(500).json({ error: "Failed to remove screen from group" });
    }
  });

  // ============ PROGRAMMES ============
  // Reorder must be defined before /:id routes so the literal path wins.
  app.patch("/api/programmes/reorder", requireAuth, loadUserContext, async (req, res) => {
    try {
      const { orderedIds } = req.body as { orderedIds: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds array is required" });
      }
      if (!orderedIds.every(id => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ error: "orderedIds must be non-empty strings" });
      }
      if (new Set(orderedIds).size !== orderedIds.length) {
        return res.status(400).json({ error: "orderedIds must not contain duplicates" });
      }
      // Authorise: every programme must be visible to this user (via its event's client).
      const allEventsForReorder = await storage.getEvents();
      const eventById = new Map(allEventsForReorder.map(e => [e.id, e] as const));
      for (const id of orderedIds) {
        const programme = await storage.getProgramme(id);
        if (!programme) return res.status(404).json({ error: `Programme ${id} not found` });
        const event = eventById.get(programme.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      await storage.reorderProgrammes(orderedIds);
      logAudit(req, "reorder", "programme", orderedIds[0], { count: orderedIds.length });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering programmes:", error);
      res.status(500).json({ error: "Failed to reorder programmes" });
    }
  });

  app.get("/api/programmes", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmes = await storage.getProgrammes();
      const allowed = getAllowedClientIds(req);
      const allEventsForProgrammes = await storage.getEvents();
      let filtered = programmes;
      if (allowed) {
        const allowedEventIds = new Set(allEventsForProgrammes.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        filtered = programmes.filter(p => allowedEventIds.has(p.eventId));
      }
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEventIds = new Set(allEventsForProgrammes.filter(e => e.clientId === clientId).map(e => e.id));
        filtered = filtered.filter(p => clientEventIds.has(p.eventId));
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching programmes:", error);
      res.status(500).json({ error: "Failed to fetch programmes" });
    }
  });

  // Programmes are write-protected via the per-route checks below. We strip
  // `displayOrder` from any incoming write payload so reorder can only
  // happen via PATCH /api/programmes/reorder (which is the single chokepoint
  // that holds the necessary cross-row authz + transactional rewrite).
  const programmeWriteSchema = insertProgrammeSchema.omit({ displayOrder: true });

  app.post("/api/programmes", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = programmeWriteSchema.parse(req.body);
      const event = await storage.getEvent(data.eventId);
      if (event && !canAccessClient(req, event.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const programme = await storage.createProgramme(data);
      await storage.createProgrammeVersion({ programmeId: programme.id, versionNumber: 1, status: "draft" });
      logAudit(req, "create", "programme", programme.id, { name: programme.name });
      res.status(201).json(programme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating programme:", error);
      res.status(500).json({ error: "Failed to create programme" });
    }
  });

  // Helper: load a programme + its event to enforce client-scoped authz
  // on the per-id mutation routes below (PATCH / publish / DELETE).
  async function authorizeProgrammeMutation(req: any, res: any, programmeId: string) {
    const existing = await storage.getProgramme(programmeId);
    if (!existing) {
      res.status(404).json({ error: "Programme not found" });
      return null;
    }
    const event = await storage.getEvent(existing.eventId);
    if (event && !canAccessClient(req, event.clientId)) {
      res.status(403).json({ error: "Access denied" });
      return null;
    }
    return existing;
  }

  app.patch("/api/programmes/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmeId = getPathParam(req, "id");
      const existing = await authorizeProgrammeMutation(req, res, programmeId);
      if (!existing) return;
      const data = programmeWriteSchema.partial().parse(req.body);
      // If the eventId is being changed, also enforce access to the target client
      if (data.eventId && data.eventId !== existing.eventId) {
        const targetEvent = await storage.getEvent(data.eventId);
        if (targetEvent && !canAccessClient(req, targetEvent.clientId)) {
          return res.status(403).json({ error: "Access denied to target event" });
        }
      }
      const programme = await storage.updateProgramme(programmeId, data);
      if (!programme) {
        return res.status(404).json({ error: "Programme not found" });
      }
      logAudit(req, "update", "programme", programme.id, { name: programme.name });
      res.json(programme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating programme:", error);
      res.status(500).json({ error: "Failed to update programme" });
    }
  });

  app.post("/api/programmes/:id/publish", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmeId = getPathParam(req, "id");
      const existing = await authorizeProgrammeMutation(req, res, programmeId);
      if (!existing) return;
      const versions = await storage.getProgrammeVersions();
      const programmeVersions = versions.filter(v => v.programmeId === programmeId);
      const draftVersion = programmeVersions.find(v => v.status === "draft");

      if (draftVersion) {
        await storage.updateProgrammeVersion(draftVersion.id, { status: "published", publishedAt: new Date() });
        refreshScreensForVersion(draftVersion.id);
      }
      logAudit(req, "publish", "programme", programmeId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error publishing programme:", error);
      res.status(500).json({ error: "Failed to publish programme" });
    }
  });

  app.delete("/api/programmes/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmeId = getPathParam(req, "id");
      const existing = await authorizeProgrammeMutation(req, res, programmeId);
      if (!existing) return;
      const deleted = await storage.deleteProgramme(programmeId);
      if (!deleted) {
        return res.status(404).json({ error: "Programme not found" });
      }
      logAudit(req, "delete", "programme", programmeId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting programme:", error);
      res.status(500).json({ error: "Failed to delete programme" });
    }
  });

  // ============ SCREEN PRESETS ============
  async function resolvePresetClientId(preset: { screenId: string | null; groupId: string | null }): Promise<string | null> {
    if (preset.screenId) {
      const screen = await storage.getScreen(preset.screenId);
      return screen?.clientId || null;
    }
    if (preset.groupId) {
      const group = await storage.getScreenGroup(preset.groupId);
      return group?.clientId || null;
    }
    return null;
  }

  async function deleteAllOverridesForPreset(presetId: string) {
    const allOverrides = await storage.getLiveOverrides();
    const matching = allOverrides.filter(o => o.presetId === presetId);
    for (const o of matching) {
      await storage.deleteLiveOverride(o.id);
    }
  }

  app.get("/api/screen-presets", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const screenId = getQueryString(req, "screenId", res); if (screenId === null) return;
      const groupId = getQueryString(req, "groupId", res); if (groupId === null) return;
      if (screenId) {
        const screen = await storage.getScreen(screenId);
        if (!screen) return res.status(404).json({ error: "Screen not found" });
        if (screen.clientId && !canAccessClient(req, screen.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      if (groupId) {
        const group = await storage.getScreenGroup(groupId);
        if (!group) return res.status(404).json({ error: "Screen group not found" });
        if (group.clientId && !canAccessClient(req, group.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      let presets = await storage.getScreenPresets({ screenId, groupId });
      if (!screenId && !groupId && !isAdmin(req)) {
        const allowed = getAllowedClientIds(req) ?? [];
        const allowedSet = new Set(allowed);
        const [allScreens, allGroups] = await Promise.all([
          storage.getScreens(),
          storage.getScreenGroups(),
        ]);
        const accessibleScreenIds = new Set(
          allScreens.filter(s => s.clientId && allowedSet.has(s.clientId)).map(s => s.id)
        );
        const accessibleGroupIds = new Set(
          allGroups.filter(g => g.clientId && allowedSet.has(g.clientId)).map(g => g.id)
        );
        presets = presets.filter(p =>
          (p.screenId && accessibleScreenIds.has(p.screenId)) ||
          (p.groupId && accessibleGroupIds.has(p.groupId))
        );
      }
      const overrides = await storage.getLiveOverrides();
      const activePresetIds = new Set(
        overrides
          .filter(o => o.presetId && o.isActive && new Date(o.startTime) <= new Date() && new Date(o.endTime) >= new Date())
          .map(o => o.presetId)
      );
      const presetsWithStatus = presets.map(p => ({
        ...p,
        isActive: activePresetIds.has(p.id),
      }));
      res.json(presetsWithStatus);
    } catch (error) {
      console.error("Error fetching screen presets:", error);
      res.status(500).json({ error: "Failed to fetch screen presets" });
    }
  });

  app.get("/api/screen-presets/active", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const [overrides, allPresets, allScreens, allGroups] = await Promise.all([
        storage.getLiveOverrides(),
        storage.getScreenPresets(),
        storage.getScreens(),
        storage.getScreenGroups(),
      ]);
      const presetById = new Map(allPresets.map(p => [p.id, p]));
      const screenClientById = new Map(allScreens.map(s => [s.id, s.clientId]));
      const groupClientById = new Map(allGroups.map(g => [g.id, g.clientId]));
      const now = new Date();
      const result: Array<{ presetId: string; presetName: string; screenIds: string[]; since: Date | null }> = [];
      for (const o of overrides) {
        if (!o.presetId || !o.isActive) continue;
        if (new Date(o.startTime) > now || new Date(o.endTime) < now) continue;
        const preset = presetById.get(o.presetId);
        if (!preset) continue;
        const clientId = preset.screenId
          ? screenClientById.get(preset.screenId) || null
          : preset.groupId
            ? groupClientById.get(preset.groupId) || null
            : null;
        if (clientId) {
          if (!canAccessClient(req, clientId)) continue;
        } else if (!isAdmin(req)) {
          continue;
        }
        const targets = (o.targets as Array<{ type: string; id: string }>) || [];
        const screenIds = targets.filter(t => t.type === "screen").map(t => t.id);
        result.push({
          presetId: preset.id,
          presetName: preset.name,
          screenIds,
          since: o.startTime,
        });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching active presets:", error);
      res.status(500).json({ error: "Failed to fetch active presets" });
    }
  });

  app.get("/api/screen-presets/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const preset = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(preset);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(preset);
    } catch (error) {
      console.error("Error fetching preset:", error);
      res.status(500).json({ error: "Failed to fetch preset" });
    }
  });

  app.post("/api/screen-presets", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const data = insertScreenPresetSchema.parse(req.body);
      if (!data.screenId && !data.groupId) {
        return res.status(400).json({ error: "Either screenId or groupId is required" });
      }
      const clientId = await resolvePresetClientId({
        screenId: data.screenId ?? null,
        groupId: data.groupId ?? null,
      });
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const preset = await storage.createScreenPreset(data);
      logAudit(req, "create", "screen_preset", preset.id, { name: preset.name });
      res.status(201).json(preset);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating screen preset:", error);
      res.status(500).json({ error: "Failed to create screen preset" });
    }
  });

  app.patch("/api/screen-presets/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(existing);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { screenId, groupId, ...allowedUpdates } = insertScreenPresetSchema.partial().parse(req.body);
      const preset = await storage.updateScreenPreset(getPathParam(req, "id"), allowedUpdates);
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      logAudit(req, "update", "screen_preset", preset.id, { name: preset.name });
      res.json(preset);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating screen preset:", error);
      res.status(500).json({ error: "Failed to update screen preset" });
    }
  });

  app.delete("/api/screen-presets/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getScreenPreset(id);
      if (!existing) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(existing);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      await deleteAllOverridesForPreset(id);
      const deleted = await storage.deleteScreenPreset(id);
      if (!deleted) return res.status(404).json({ error: "Preset not found" });
      logAudit(req, "delete", "screen_preset", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen preset:", error);
      res.status(500).json({ error: "Failed to delete screen preset" });
    }
  });

  app.post("/api/screen-presets/reorder", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const { orderedIds } = req.body as { orderedIds: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds array is required" });
      }
      let commonScreenId: string | null = null;
      let commonGroupId: string | null = null;
      for (const id of orderedIds) {
        const preset = await storage.getScreenPreset(id);
        if (!preset) return res.status(404).json({ error: `Preset ${id} not found` });
        const clientId = await resolvePresetClientId(preset);
        if (clientId && !canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (commonScreenId === null && commonGroupId === null) {
          commonScreenId = preset.screenId;
          commonGroupId = preset.groupId;
        } else {
          if (preset.screenId !== commonScreenId || preset.groupId !== commonGroupId) {
            return res.status(400).json({ error: "All presets must belong to the same screen or group" });
          }
        }
      }
      await storage.reorderScreenPresets(orderedIds);
      logAudit(req, "reorder", "screen_preset", orderedIds[0], { count: orderedIds.length });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering presets:", error);
      res.status(500).json({ error: "Failed to reorder presets" });
    }
  });

  app.post("/api/screen-presets/:id/activate", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const preset = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(preset);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await deleteAllOverridesForPreset(preset.id);

      const targets: Array<{ type: "screen" | "group"; id: string }> = [];
      if (preset.screenId) {
        targets.push({ type: "screen", id: preset.screenId });
      } else if (preset.groupId) {
        const members = await storage.getGroupMembers(preset.groupId);
        for (const m of members) {
          targets.push({ type: "screen", id: m.id });
        }
      }

      if (targets.length === 0) {
        return res.status(400).json({ error: "Cannot activate: no target screens found (empty group or missing screen)" });
      }

      const targetScreenIds = new Set(targets.map(t => t.id));
      const allOverrides = await storage.getLiveOverrides();
      for (const o of allOverrides) {
        if (!o.presetId || !o.isActive) continue;
        const oTargets = (o.targets as Array<{ type: string; id: string }>) || [];
        const hasOverlap = oTargets.some(t => targetScreenIds.has(t.id));
        if (hasOverlap) {
          await storage.deleteLiveOverride(o.id);
        }
      }

      const now = new Date();
      const endTime = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const override = await storage.createLiveOverride({
        name: `Preset: ${preset.name}`,
        priority: 200,
        targets,
        layoutTemplateId: preset.layoutTemplateId,
        zoneSources: preset.zoneSources,
        startTime: now,
        endTime,
        isActive: true,
        presetId: preset.id,
      });

      logAudit(req, "activate", "screen_preset", preset.id, { name: preset.name, overrideId: override.id });
      res.json({ preset, override });
    } catch (error) {
      console.error("Error activating preset:", error);
      res.status(500).json({ error: "Failed to activate preset" });
    }
  });

  app.post("/api/screen-presets/:id/deactivate", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const preset = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(preset);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await deleteAllOverridesForPreset(preset.id);

      logAudit(req, "deactivate", "screen_preset", preset.id, { name: preset.name });
      res.json({ preset, deactivated: true });
    } catch (error) {
      console.error("Error deactivating preset:", error);
      res.status(500).json({ error: "Failed to deactivate preset" });
    }
  });
}

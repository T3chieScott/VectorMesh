import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import {
  insertSweepstakeWidgetConfigSchema,
  insertTournamentTeamSchema,
  insertSweepstakeParticipantSchema,
  SWEEPSTAKE_PROVIDERS,
  type SweepstakeWidgetConfig,
  type InsertSweepstakeWidgetConfig,
  type TournamentTeam,
  type InsertTournamentTeam,
  type TournamentMatch,
  type InsertTournamentMatch,
  type TournamentStanding,
  type InsertTournamentStanding,
  type SweepstakeParticipant,
  type InsertSweepstakeParticipant,
} from "@shared/schema";
import { getPathParam } from "./requestParams";
import { fetchTournament, isProviderKeyConfigured, ProviderError } from "./sweepstakeProviders";
import {
  computeAssignments,
  computeParticipantStatuses,
  detectWinnerTeamName,
  buildDisplayData,
} from "./sweepstakeLogic";

export interface SweepstakeRoutesStorage {
  getSweepstakeConfigs(clientId?: string): Promise<SweepstakeWidgetConfig[]>;
  getSweepstakeConfig(id: string): Promise<SweepstakeWidgetConfig | undefined>;
  createSweepstakeConfig(data: InsertSweepstakeWidgetConfig): Promise<SweepstakeWidgetConfig>;
  updateSweepstakeConfig(
    id: string,
    data: Partial<InsertSweepstakeWidgetConfig> & { lastSyncedAt?: Date | null; lastSyncError?: string | null },
  ): Promise<SweepstakeWidgetConfig | undefined>;
  deleteSweepstakeConfig(id: string): Promise<boolean>;
  getTournamentTeams(configId: string): Promise<TournamentTeam[]>;
  getTournamentTeam(id: string): Promise<TournamentTeam | undefined>;
  createTournamentTeam(data: InsertTournamentTeam): Promise<TournamentTeam>;
  updateTournamentTeam(
    id: string,
    data: Partial<InsertTournamentTeam> & { eliminatedAt?: Date | null },
  ): Promise<TournamentTeam | undefined>;
  setTournamentWinner(configId: string, teamId: string | null): Promise<void>;
  replaceTournamentTeams(configId: string, teams: InsertTournamentTeam[]): Promise<TournamentTeam[]>;
  getTournamentMatches(configId: string): Promise<TournamentMatch[]>;
  replaceTournamentMatches(configId: string, matches: InsertTournamentMatch[]): Promise<TournamentMatch[]>;
  getTournamentStandings(configId: string): Promise<TournamentStanding[]>;
  replaceTournamentStandings(configId: string, standings: InsertTournamentStanding[]): Promise<TournamentStanding[]>;
  getSweepstakeParticipants(configId: string): Promise<SweepstakeParticipant[]>;
  getSweepstakeParticipant(id: string): Promise<SweepstakeParticipant | undefined>;
  createSweepstakeParticipant(data: InsertSweepstakeParticipant): Promise<SweepstakeParticipant>;
  updateSweepstakeParticipant(id: string, data: Partial<InsertSweepstakeParticipant>): Promise<SweepstakeParticipant | undefined>;
  deleteSweepstakeParticipant(id: string): Promise<boolean>;
}

export interface SweepstakeRoutesAuth {
  canAccessClient(req: Request, clientId: string): boolean;
  getAllowedClientIds(req: Request): string[] | null;
}

export interface SweepstakeRoutesDeps {
  storage: SweepstakeRoutesStorage;
  auth: SweepstakeRoutesAuth;
  requireAuth: RequestHandler;
  loadUserContext: (req: Request, res: Response, next: NextFunction) => any;
  logAudit?: (req: Request, action: string, entityType: string, entityId?: string, payload?: any) => void;
}

// Fields the public display endpoint is allowed to emit from a config. The
// public payload must NEVER include clientId, provider, competitionCode,
// season or any internal timestamps beyond lastSyncedAt.
export const PUBLIC_SWEEPSTAKE_CONFIG_FIELDS = [
  "tournamentName",
  "theme",
  "accentColor",
  "layoutMode",
  "rotationIntervalSeconds",
  "refreshIntervalSeconds",
  "slides",
  "kickoffAt",
  "lastSyncedAt",
] as const;

export function mountSweepstakeRoutes(app: Express, deps: SweepstakeRoutesDeps) {
  const { storage, auth, requireAuth, loadUserContext } = deps;
  const audit: NonNullable<typeof deps.logAudit> = deps.logAudit ?? (() => {});

  // Load a config and confirm the caller can access its site. Returns the
  // config, or null after sending the appropriate error response.
  async function loadOwnedConfig(req: Request, res: Response, id: string): Promise<SweepstakeWidgetConfig | null> {
    const config = await storage.getSweepstakeConfig(id);
    if (!config) {
      res.status(404).json({ error: "Sweepstake not found" });
      return null;
    }
    if (!auth.canAccessClient(req, config.clientId)) {
      res.status(403).json({ error: "Access denied to this site" });
      return null;
    }
    return config;
  }

  // Recompute every team's winner flag (from finished matches) and cascade
  // team fate onto participant statuses. Idempotent.
  async function recomputeProgress(configId: string): Promise<void> {
    const [teams, matches, participants] = await Promise.all([
      storage.getTournamentTeams(configId),
      storage.getTournamentMatches(configId),
      storage.getSweepstakeParticipants(configId),
    ]);
    const winnerName = detectWinnerTeamName(matches);
    if (winnerName) {
      const winnerTeam = teams.find((t) => t.name.toLowerCase() === winnerName.toLowerCase());
      if (winnerTeam) {
        // Canonicalize winner state: flag this team and clear every other,
        // collapsing any pre-existing multi-winner drift to exactly one.
        await storage.setTournamentWinner(configId, winnerTeam.id);
        for (const t of teams) {
          t.isWinner = t.id === winnerTeam.id;
          if (t.id === winnerTeam.id) t.eliminated = false;
        }
      }
    }
    const updates = computeParticipantStatuses(participants, teams);
    for (const u of updates) {
      await storage.updateSweepstakeParticipant(u.participantId, { status: u.status });
    }
  }

  // ----- Configs -----
  app.get("/api/sweepstake/configs", requireAuth, loadUserContext, async (req, res) => {
    try {
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const allowed = auth.getAllowedClientIds(req);
      if (clientId) {
        if (!auth.canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        return res.json(await storage.getSweepstakeConfigs(clientId));
      }
      const all = await storage.getSweepstakeConfigs();
      res.json(allowed ? all.filter((c) => allowed.includes(c.clientId)) : all);
    } catch (error) {
      console.error("Error fetching sweepstake configs:", error);
      res.status(500).json({ error: "Failed to fetch sweepstakes" });
    }
  });

  app.get("/api/sweepstake/provider-status", requireAuth, loadUserContext, (_req, res) => {
    const status: Record<string, boolean> = {};
    for (const p of SWEEPSTAKE_PROVIDERS) status[p] = isProviderKeyConfigured(p);
    res.json(status);
  });

  app.post("/api/sweepstake/configs", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertSweepstakeWidgetConfigSchema.parse(req.body);
      if (!auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const config = await storage.createSweepstakeConfig(data);
      audit(req, "create", "sweepstake_config", config.id, { name: config.name });
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating sweepstake:", error);
      res.status(500).json({ error: "Failed to create sweepstake" });
    }
  });

  app.patch("/api/sweepstake/configs/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await loadOwnedConfig(req, res, id);
      if (!existing) return;
      const data = insertSweepstakeWidgetConfigSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !auth.canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const config = await storage.updateSweepstakeConfig(id, data);
      audit(req, "update", "sweepstake_config", id, { name: config?.name });
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating sweepstake:", error);
      res.status(500).json({ error: "Failed to update sweepstake" });
    }
  });

  app.delete("/api/sweepstake/configs/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await loadOwnedConfig(req, res, id);
      if (!existing) return;
      await storage.deleteSweepstakeConfig(id);
      audit(req, "delete", "sweepstake_config", id, { name: existing.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sweepstake:", error);
      res.status(500).json({ error: "Failed to delete sweepstake" });
    }
  });

  // ----- Teams -----
  app.get("/api/sweepstake/configs/:id/teams", requireAuth, loadUserContext, async (req, res) => {
    const config = await loadOwnedConfig(req, res, getPathParam(req, "id"));
    if (!config) return;
    res.json(await storage.getTournamentTeams(config.id));
  });

  app.post("/api/sweepstake/configs/:id/teams", requireAuth, loadUserContext, async (req, res) => {
    try {
      const config = await loadOwnedConfig(req, res, getPathParam(req, "id"));
      if (!config) return;
      const data = insertTournamentTeamSchema.parse({ ...req.body, configId: config.id });
      const team = await storage.createTournamentTeam({ ...data, configId: config.id });
      // Enforce the single-winner invariant: a team created as the winner
      // clears any existing winner in the same config.
      if (data.isWinner) {
        await storage.setTournamentWinner(config.id, team.id);
        team.isWinner = true;
        team.eliminated = false;
      }
      audit(req, "create", "sweepstake_team", team.id, { name: team.name });
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating team:", error);
      res.status(500).json({ error: "Failed to create team" });
    }
  });

  app.patch("/api/sweepstake/teams/:teamId", requireAuth, loadUserContext, async (req, res) => {
    try {
      const team = await storage.getTournamentTeam(getPathParam(req, "teamId"));
      if (!team) return res.status(404).json({ error: "Team not found" });
      const config = await loadOwnedConfig(req, res, team.configId);
      if (!config) return;
      const patch = insertTournamentTeamSchema.partial().omit({ configId: true }).parse(req.body);
      const data: Partial<InsertTournamentTeam> & { eliminatedAt?: Date | null } = { ...patch };
      if (typeof patch.eliminated === "boolean") {
        data.eliminatedAt = patch.eliminated ? new Date() : null;
      }
      let updated: TournamentTeam | undefined;
      if (patch.isWinner === true) {
        // Setting a winner: enforce single-winner invariant (clear others),
        // then apply any remaining field changes.
        await storage.setTournamentWinner(config.id, team.id);
        const { isWinner: _w, eliminated: _e, ...rest } = data;
        updated = Object.keys(rest).length > 0
          ? await storage.updateTournamentTeam(team.id, rest)
          : await storage.getTournamentTeam(team.id);
      } else {
        updated = await storage.updateTournamentTeam(team.id, data);
      }
      await recomputeProgress(config.id);
      audit(req, "update", "sweepstake_team", team.id, { name: updated?.name });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating team:", error);
      res.status(500).json({ error: "Failed to update team" });
    }
  });

  // ----- Sync from provider -----
  app.post("/api/sweepstake/configs/:id/sync", requireAuth, loadUserContext, async (req, res) => {
    const config = await loadOwnedConfig(req, res, getPathParam(req, "id"));
    if (!config) return;
    if (config.provider === "manual") {
      return res.status(400).json({ error: "Manual sweepstakes are edited by hand and cannot sync." });
    }
    try {
      const data = await fetchTournament(config.provider as any, {
        competitionCode: config.competitionCode,
        season: config.season,
      });
      await storage.replaceTournamentTeams(
        config.id,
        data.teams.map((t) => ({ ...t, configId: config.id })),
      );
      await storage.replaceTournamentMatches(
        config.id,
        data.matches.map((m) => ({ ...m, configId: config.id })),
      );
      await storage.replaceTournamentStandings(
        config.id,
        data.standings.map((s) => ({ ...s, configId: config.id })),
      );
      await recomputeProgress(config.id);
      await storage.updateSweepstakeConfig(config.id, { lastSyncedAt: new Date(), lastSyncError: null });
      audit(req, "sync", "sweepstake_config", config.id, {
        teams: data.teams.length,
        matches: data.matches.length,
      });
      res.json({
        ok: true,
        teams: data.teams.length,
        matches: data.matches.length,
        standings: data.standings.length,
      });
    } catch (error) {
      const message = error instanceof ProviderError ? error.message : "Sync failed. Check the competition settings and API key.";
      await storage.updateSweepstakeConfig(config.id, { lastSyncError: message });
      console.error("Sweepstake sync failed:", error);
      res.status(400).json({ error: message });
    }
  });

  // ----- Participants -----
  app.get("/api/sweepstake/configs/:id/participants", requireAuth, loadUserContext, async (req, res) => {
    const config = await loadOwnedConfig(req, res, getPathParam(req, "id"));
    if (!config) return;
    res.json(await storage.getSweepstakeParticipants(config.id));
  });

  app.post("/api/sweepstake/configs/:id/participants", requireAuth, loadUserContext, async (req, res) => {
    try {
      const config = await loadOwnedConfig(req, res, getPathParam(req, "id"));
      if (!config) return;
      const data = insertSweepstakeParticipantSchema.parse({
        ...req.body,
        configId: config.id,
        clientId: config.clientId,
      });
      const participant = await storage.createSweepstakeParticipant({
        ...data,
        configId: config.id,
        clientId: config.clientId,
      });
      audit(req, "create", "sweepstake_participant", participant.id, { name: participant.name });
      res.status(201).json(participant);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating participant:", error);
      res.status(500).json({ error: "Failed to add participant" });
    }
  });

  app.patch("/api/sweepstake/participants/:participantId", requireAuth, loadUserContext, async (req, res) => {
    try {
      const participant = await storage.getSweepstakeParticipant(getPathParam(req, "participantId"));
      if (!participant) return res.status(404).json({ error: "Participant not found" });
      const config = await loadOwnedConfig(req, res, participant.configId);
      if (!config) return;
      // clientId/configId are immutable from the client.
      const patch = insertSweepstakeParticipantSchema.partial().omit({ configId: true, clientId: true }).parse(req.body);
      const updated = await storage.updateSweepstakeParticipant(participant.id, patch);
      audit(req, "update", "sweepstake_participant", participant.id, { name: updated?.name });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating participant:", error);
      res.status(500).json({ error: "Failed to update participant" });
    }
  });

  app.delete("/api/sweepstake/participants/:participantId", requireAuth, loadUserContext, async (req, res) => {
    try {
      const participant = await storage.getSweepstakeParticipant(getPathParam(req, "participantId"));
      if (!participant) return res.status(404).json({ error: "Participant not found" });
      const config = await loadOwnedConfig(req, res, participant.configId);
      if (!config) return;
      await storage.deleteSweepstakeParticipant(participant.id);
      audit(req, "delete", "sweepstake_participant", participant.id, { name: participant.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting participant:", error);
      res.status(500).json({ error: "Failed to delete participant" });
    }
  });

  // ----- Draw / assignment -----
  app.post("/api/sweepstake/configs/:id/assign", requireAuth, loadUserContext, async (req, res) => {
    try {
      const config = await loadOwnedConfig(req, res, getPathParam(req, "id"));
      if (!config) return;
      const includeEliminated = req.body?.includeEliminated === true;
      const [participants, teams] = await Promise.all([
        storage.getSweepstakeParticipants(config.id),
        storage.getTournamentTeams(config.id),
      ]);
      const assignments = computeAssignments({ participants, teams, includeEliminated });
      for (const a of assignments) {
        await storage.updateSweepstakeParticipant(a.participantId, { teamId: a.teamId });
      }
      await recomputeProgress(config.id);
      audit(req, "assign", "sweepstake_config", config.id, { assigned: assignments.length });
      res.json({ ok: true, assigned: assignments.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Draw failed.";
      console.error("Sweepstake draw failed:", error);
      res.status(400).json({ error: message });
    }
  });

  // ----- Public display payload (no auth, scrubbed) -----
  app.get("/api/sweepstake/display/:configId", async (req, res) => {
    try {
      const config = await storage.getSweepstakeConfig(getPathParam(req, "configId"));
      if (!config) return res.status(404).json({ error: "Sweepstake not found" });
      const [teams, matches, standings, participants] = await Promise.all([
        storage.getTournamentTeams(config.id),
        storage.getTournamentMatches(config.id),
        storage.getTournamentStandings(config.id),
        storage.getSweepstakeParticipants(config.id),
      ]);
      const data = buildDisplayData({ config, teams, matches, standings, participants });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...data, serverTime: Date.now() });
    } catch (error) {
      console.error("Error serving sweepstake display:", error);
      res.status(500).json({ error: "Failed to serve sweepstake" });
    }
  });
}

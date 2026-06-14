import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountSweepstakeRoutes,
  type SweepstakeRoutesStorage,
} from "../server/sweepstakeRoutes";
import type {
  SweepstakeWidgetConfig,
  TournamentTeam,
  TournamentMatch,
  TournamentStanding,
  SweepstakeParticipant,
  InsertTournamentTeam,
} from "../shared/schema";

// Task #286 — regression cover for the single-winner invariant. Setting a
// team as winner (manual toggle) must clear isWinner on every other team in
// the same config, so a sweepstake never persists two simultaneous winners
// and the public display shows one canonical winner.

function team(o: Partial<TournamentTeam> & { id: string; name: string }): TournamentTeam {
  return {
    id: o.id,
    configId: o.configId ?? "cfg",
    externalId: o.externalId ?? null,
    name: o.name,
    shortName: o.shortName ?? null,
    countryCode: o.countryCode ?? null,
    groupName: o.groupName ?? null,
    crestUrl: o.crestUrl ?? null,
    eliminated: o.eliminated ?? false,
    eliminatedAt: o.eliminatedAt ?? null,
    isWinner: o.isWinner ?? false,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function match(o: Partial<TournamentMatch> & { id: string }): TournamentMatch {
  return {
    id: o.id,
    configId: o.configId ?? "cfg",
    externalId: o.externalId ?? null,
    stage: o.stage ?? null,
    groupName: o.groupName ?? null,
    homeTeamId: o.homeTeamId ?? null,
    awayTeamId: o.awayTeamId ?? null,
    homeTeamName: o.homeTeamName ?? null,
    awayTeamName: o.awayTeamName ?? null,
    homeScore: o.homeScore ?? null,
    awayScore: o.awayScore ?? null,
    status: (o.status as any) ?? "scheduled",
    kickoffAt: o.kickoffAt ?? null,
    winnerTeamId: o.winnerTeamId ?? null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function config(): SweepstakeWidgetConfig {
  return {
    id: "cfg",
    clientId: "c1",
    name: "Test",
    tournamentName: "World Football Sweepstake",
    provider: "manual",
    competitionCode: null,
    season: null,
    kickoffAt: null,
    layoutMode: "auto",
    theme: "bright",
    accentColor: "#16a34a",
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 12,
    slideTypes: [],
    lastSyncedAt: null,
    lastSyncError: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function makeStorage(teams: TournamentTeam[], matches: TournamentMatch[] = []): SweepstakeRoutesStorage & { teams: TournamentTeam[] } {
  const cfg = config();
  const standings: TournamentStanding[] = [];
  const participants: SweepstakeParticipant[] = [];
  const store = {
    teams,
    async getSweepstakeConfigs() { return [cfg]; },
    async getSweepstakeConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async createSweepstakeConfig() { throw new Error("nyi"); },
    async updateSweepstakeConfig() { return cfg; },
    async deleteSweepstakeConfig() { return true; },
    async getTournamentTeams() { return teams.slice(); },
    async getTournamentTeam(id: string) { return teams.find((t) => t.id === id); },
    async createTournamentTeam(data: any) {
      const t = team({ ...data, id: data.id ?? `t${teams.length + 1}` });
      teams.push(t);
      return t;
    },
    async updateTournamentTeam(id: string, data: Partial<InsertTournamentTeam> & { eliminatedAt?: Date | null }) {
      const t = teams.find((x) => x.id === id);
      if (!t) return undefined;
      Object.assign(t, data);
      return t;
    },
    async setTournamentWinner(configId: string, teamId: string | null) {
      for (const t of teams) {
        if (t.configId !== configId) continue;
        if (t.id === teamId) { t.isWinner = true; t.eliminated = false; t.eliminatedAt = null; }
        else t.isWinner = false;
      }
    },
    async replaceTournamentTeams() { return teams.slice(); },
    async getTournamentMatches() { return matches.slice(); },
    async replaceTournamentMatches() { return []; },
    async getTournamentStandings() { return standings.slice(); },
    async replaceTournamentStandings() { return []; },
    async getSweepstakeParticipants() { return participants.slice(); },
    async getSweepstakeParticipant() { return undefined; },
    async createSweepstakeParticipant() { throw new Error("nyi"); },
    async updateSweepstakeParticipant() { return undefined; },
    async deleteSweepstakeParticipant() { return true; },
  } as unknown as SweepstakeRoutesStorage & { teams: TournamentTeam[] };
  return store;
}

async function withServer(storage: SweepstakeRoutesStorage, fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  mountSweepstakeRoutes(app, {
    storage,
    auth: { canAccessClient: () => true, getAllowedClientIds: () => null },
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
    loadUserContext: (_req: Request, _res: Response, next: NextFunction) => next(),
  });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("PATCH team isWinner=true clears any previous winner (single-winner invariant)", async () => {
  const teams = [
    team({ id: "t1", name: "A", isWinner: true }),
    team({ id: "t2", name: "B" }),
    team({ id: "t3", name: "C" }),
  ];
  const storage = makeStorage(teams);
  await withServer(storage, async (base) => {
    const res = await fetch(`${base}/api/sweepstake/teams/t2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isWinner: true }),
    });
    assert.equal(res.status, 200);
    const winners = storage.teams.filter((t) => t.isWinner);
    assert.equal(winners.length, 1, "exactly one winner persists");
    assert.equal(winners[0].id, "t2", "the newly-set team is the winner");
  });
});

test("PATCH winner also un-eliminates the new winner team", async () => {
  const teams = [team({ id: "t1", name: "A", eliminated: true, eliminatedAt: new Date() })];
  const storage = makeStorage(teams);
  await withServer(storage, async (base) => {
    const res = await fetch(`${base}/api/sweepstake/teams/t1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isWinner: true }),
    });
    assert.equal(res.status, 200);
    assert.equal(storage.teams[0].isWinner, true);
    assert.equal(storage.teams[0].eliminated, false, "winner is no longer eliminated");
  });
});

test("POST team with isWinner=true clears any existing winner", async () => {
  const teams = [team({ id: "t1", name: "A", isWinner: true })];
  const storage = makeStorage(teams);
  await withServer(storage, async (base) => {
    const res = await fetch(`${base}/api/sweepstake/configs/cfg/teams`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "B", isWinner: true }),
    });
    assert.equal(res.status, 201);
    const winners = storage.teams.filter((t) => t.isWinner);
    assert.equal(winners.length, 1, "exactly one winner after create");
    assert.equal(winners[0].name, "B", "the newly-created team is the winner");
  });
});

test("recomputeProgress collapses pre-existing multi-winner state to the detected final winner", async () => {
  // Two teams already (wrongly) flagged winner; a finished final names C.
  const teams = [
    team({ id: "t1", name: "A", isWinner: true }),
    team({ id: "t2", name: "B", isWinner: true }),
    team({ id: "t3", name: "C" }),
  ];
  const matches = [
    match({ id: "m1", stage: "FINAL", status: "finished", homeTeamName: "C", awayTeamName: "A", homeScore: 2, awayScore: 0 }),
  ];
  const storage = makeStorage(teams, matches);
  await withServer(storage, async (base) => {
    // Any team PATCH triggers recomputeProgress, which canonicalizes winners.
    const res = await fetch(`${base}/api/sweepstake/teams/t3`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shortName: "C" }),
    });
    assert.equal(res.status, 200);
    const winners = storage.teams.filter((t) => t.isWinner);
    assert.equal(winners.length, 1, "exactly one winner after recompute");
    assert.equal(winners[0].name, "C", "the detected final winner wins");
  });
});

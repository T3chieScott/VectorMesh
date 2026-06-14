// Task #286 — World Football Sweepstake Wall: data-provider layer.
//
// Each provider adapter fetches a tournament's teams, fixtures and group
// standings and normalises them into a single shape the rest of the widget
// consumes. API keys live ONLY in server-side env vars (see
// SWEEPSTAKE_PROVIDER_ENV_VARS) and are never returned to the frontend or
// stored in the DB. All outbound HTTP goes through the SSRF-hardened
// safeFetch so a misconfigured competition code can't be used to reach
// internal hosts.

import { safeFetch } from "./safeFetch";
import {
  SWEEPSTAKE_PROVIDER_ENV_VARS,
  type SweepstakeProvider,
  type InsertTournamentTeam,
  type InsertTournamentMatch,
  type InsertTournamentStanding,
} from "@shared/schema";

export interface NormalizedTournament {
  teams: Omit<InsertTournamentTeam, "configId">[];
  matches: Omit<InsertTournamentMatch, "configId">[];
  standings: Omit<InsertTournamentStanding, "configId">[];
}

export interface ProviderFetchParams {
  competitionCode: string | null;
  season: string | null;
}

export class ProviderError extends Error {}

function requireKey(provider: SweepstakeProvider): string {
  const envVar = SWEEPSTAKE_PROVIDER_ENV_VARS[provider];
  if (!envVar) {
    throw new ProviderError(`Provider "${provider}" does not use an API key.`);
  }
  const key = process.env[envVar];
  if (!key) {
    throw new ProviderError(
      `Missing API key. Set the ${envVar} environment variable to use ${provider}.`,
    );
  }
  return key;
}

function toStatus(raw: string | null | undefined): "scheduled" | "in_play" | "finished" {
  const s = (raw ?? "").toUpperCase();
  if (["FINISHED", "FT", "AET", "PEN", "AWARDED"].includes(s)) return "finished";
  if (["IN_PLAY", "PAUSED", "LIVE", "1H", "2H", "HT", "ET", "BT", "P"].includes(s)) return "in_play";
  return "scheduled";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- football-data.org ----------
async function fetchFootballData(params: ProviderFetchParams): Promise<NormalizedTournament> {
  const key = requireKey("football_data");
  const code = params.competitionCode?.trim();
  if (!code) throw new ProviderError("football-data.org needs a competition code (e.g. WC, EC, CL).");
  const base = `https://api.football-data.org/v4/competitions/${encodeURIComponent(code)}`;
  const headers = { "X-Auth-Token": key };
  const seasonQs = params.season ? `?season=${encodeURIComponent(params.season)}` : "";

  const teamsRes = await safeFetch(`${base}/teams${seasonQs}`, { headers });
  if (teamsRes.status !== 200) {
    throw new ProviderError(`football-data.org teams request failed (HTTP ${teamsRes.status}).`);
  }
  const teamsJson = JSON.parse(teamsRes.text);
  const teams: Omit<InsertTournamentTeam, "configId">[] = (teamsJson.teams ?? []).map((t: any) => ({
    externalId: String(t.id),
    name: t.name ?? t.shortName ?? "Unknown",
    shortName: t.tla ?? t.shortName ?? null,
    countryCode: null,
    groupName: null,
    crestUrl: t.crest ?? null,
  }));

  const matchesRes = await safeFetch(`${base}/matches${seasonQs}`, { headers });
  const matches: Omit<InsertTournamentMatch, "configId">[] = [];
  const standings: Omit<InsertTournamentStanding, "configId">[] = [];
  if (matchesRes.status === 200) {
    const mj = JSON.parse(matchesRes.text);
    for (const m of mj.matches ?? []) {
      matches.push({
        externalId: String(m.id),
        stage: m.stage ?? null,
        groupName: m.group ?? null,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamName: m.homeTeam?.name ?? null,
        awayTeamName: m.awayTeam?.name ?? null,
        homeScore: num(m.score?.fullTime?.home),
        awayScore: num(m.score?.fullTime?.away),
        status: toStatus(m.status),
        kickoffAt: m.utcDate ? new Date(m.utcDate) : null,
        winnerTeamId: null,
      });
    }
  }

  const standingsRes = await safeFetch(`${base}/standings${seasonQs}`, { headers });
  if (standingsRes.status === 200) {
    const sj = JSON.parse(standingsRes.text);
    for (const group of sj.standings ?? []) {
      const groupName = group.group ?? null;
      for (const row of group.table ?? []) {
        standings.push({
          teamId: null,
          teamName: row.team?.name ?? "Unknown",
          groupName,
          position: num(row.position),
          played: num(row.playedGames) ?? 0,
          won: num(row.won) ?? 0,
          draw: num(row.draw) ?? 0,
          lost: num(row.lost) ?? 0,
          goalsFor: num(row.goalsFor) ?? 0,
          goalsAgainst: num(row.goalsAgainst) ?? 0,
          goalDifference: num(row.goalDifference) ?? 0,
          points: num(row.points) ?? 0,
        });
      }
    }
  }

  // Backfill team group names from the standings tables.
  const groupByName = new Map(standings.filter((s) => s.groupName).map((s) => [s.teamName.toLowerCase(), s.groupName!]));
  for (const t of teams) {
    const g = groupByName.get(t.name.toLowerCase());
    if (g) t.groupName = g;
  }

  return { teams, matches, standings };
}

// ---------- API-Football (API-Sports) ----------
async function fetchApiFootball(params: ProviderFetchParams): Promise<NormalizedTournament> {
  const key = requireKey("api_football");
  const league = params.competitionCode?.trim();
  const season = params.season?.trim();
  if (!league || !season) {
    throw new ProviderError("API-Football needs a league id (competition code) and a season year.");
  }
  const headers = { "x-apisports-key": key };
  const base = "https://v3.football.api-sports.io";

  const teamsRes = await safeFetch(`${base}/teams?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, { headers });
  if (teamsRes.status !== 200) {
    throw new ProviderError(`API-Football teams request failed (HTTP ${teamsRes.status}).`);
  }
  const tj = JSON.parse(teamsRes.text);
  const teams: Omit<InsertTournamentTeam, "configId">[] = (tj.response ?? []).map((r: any) => ({
    externalId: String(r.team?.id),
    name: r.team?.name ?? "Unknown",
    shortName: r.team?.code ?? null,
    countryCode: null,
    groupName: null,
    crestUrl: r.team?.logo ?? null,
  }));

  const fixturesRes = await safeFetch(`${base}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, { headers });
  const matches: Omit<InsertTournamentMatch, "configId">[] = [];
  if (fixturesRes.status === 200) {
    const fj = JSON.parse(fixturesRes.text);
    for (const r of fj.response ?? []) {
      matches.push({
        externalId: String(r.fixture?.id),
        stage: r.league?.round ?? null,
        groupName: null,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamName: r.teams?.home?.name ?? null,
        awayTeamName: r.teams?.away?.name ?? null,
        homeScore: num(r.goals?.home),
        awayScore: num(r.goals?.away),
        status: toStatus(r.fixture?.status?.short),
        kickoffAt: r.fixture?.date ? new Date(r.fixture.date) : null,
        winnerTeamId: null,
      });
    }
  }

  const standingsRes = await safeFetch(`${base}/standings?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, { headers });
  const standings: Omit<InsertTournamentStanding, "configId">[] = [];
  if (standingsRes.status === 200) {
    const sj = JSON.parse(standingsRes.text);
    for (const entry of sj.response ?? []) {
      for (const groupTable of entry.league?.standings ?? []) {
        for (const row of groupTable) {
          standings.push({
            teamId: null,
            teamName: row.team?.name ?? "Unknown",
            groupName: row.group ?? null,
            position: num(row.rank),
            played: num(row.all?.played) ?? 0,
            won: num(row.all?.win) ?? 0,
            draw: num(row.all?.draw) ?? 0,
            lost: num(row.all?.lose) ?? 0,
            goalsFor: num(row.all?.goals?.for) ?? 0,
            goalsAgainst: num(row.all?.goals?.against) ?? 0,
            goalDifference: num(row.goalsDiff) ?? 0,
            points: num(row.points) ?? 0,
          });
        }
      }
    }
  }

  const groupByName = new Map(standings.filter((s) => s.groupName).map((s) => [s.teamName.toLowerCase(), s.groupName!]));
  for (const t of teams) {
    const g = groupByName.get(t.name.toLowerCase());
    if (g) t.groupName = g;
  }

  return { teams, matches, standings };
}

// ---------- Sportmonks ----------
async function fetchSportmonks(params: ProviderFetchParams): Promise<NormalizedTournament> {
  const token = requireKey("sportmonks");
  const seasonId = params.competitionCode?.trim();
  if (!seasonId) {
    throw new ProviderError("Sportmonks needs a season id in the competition code field.");
  }
  const base = "https://api.sportmonks.com/v3/football";
  const auth = `api_token=${encodeURIComponent(token)}`;

  const teamsRes = await safeFetch(`${base}/teams/seasons/${encodeURIComponent(seasonId)}?${auth}`);
  if (teamsRes.status !== 200) {
    throw new ProviderError(`Sportmonks teams request failed (HTTP ${teamsRes.status}).`);
  }
  const tj = JSON.parse(teamsRes.text);
  const teams: Omit<InsertTournamentTeam, "configId">[] = (tj.data ?? []).map((t: any) => ({
    externalId: String(t.id),
    name: t.name ?? "Unknown",
    shortName: t.short_code ?? null,
    countryCode: null,
    groupName: null,
    crestUrl: t.image_path ?? null,
  }));

  const fixturesRes = await safeFetch(`${base}/fixtures/seasons/${encodeURIComponent(seasonId)}?${auth}`);
  const matches: Omit<InsertTournamentMatch, "configId">[] = [];
  if (fixturesRes.status === 200) {
    const fj = JSON.parse(fixturesRes.text);
    for (const f of fj.data ?? []) {
      matches.push({
        externalId: String(f.id),
        stage: f.stage?.name ?? null,
        groupName: f.group?.name ?? null,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamName: null,
        awayTeamName: null,
        homeScore: null,
        awayScore: null,
        status: toStatus(f.state?.state),
        kickoffAt: f.starting_at ? new Date(f.starting_at) : null,
        winnerTeamId: null,
      });
    }
  }

  return { teams, matches, standings: [] };
}

export async function fetchTournament(
  provider: SweepstakeProvider,
  params: ProviderFetchParams,
): Promise<NormalizedTournament> {
  switch (provider) {
    case "football_data":
      return fetchFootballData(params);
    case "api_football":
      return fetchApiFootball(params);
    case "sportmonks":
      return fetchSportmonks(params);
    case "manual":
      throw new ProviderError("Manual configs are edited by hand and cannot be synced from a provider.");
    default:
      throw new ProviderError(`Unknown provider: ${provider}`);
  }
}

// Whether the provider's API key env var is currently set. Used by the admin
// UI to warn operators without ever exposing the key value itself.
export function isProviderKeyConfigured(provider: SweepstakeProvider): boolean {
  const envVar = SWEEPSTAKE_PROVIDER_ENV_VARS[provider];
  if (!envVar) return true;
  return Boolean(process.env[envVar]);
}

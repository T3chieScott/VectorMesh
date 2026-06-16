// Task #286 — World Football Sweepstake Wall: core logic.
//
// Pure, side-effect-free helpers so the assignment fairness, elimination
// cascade, winner detection and display-data shaping can be unit-tested
// without a database. The routes layer wires these to storage.

import type {
  SweepstakeWidgetConfig,
  SweepstakeParticipant,
  TournamentTeam,
  TournamentMatch,
  TournamentStanding,
  SweepstakeSlideType,
  SweepstakeLivePanel,
} from "@shared/schema";
import { SWEEPSTAKE_SLIDE_TYPES, SWEEPSTAKE_LIVE_PANELS } from "@shared/schema";
import type {
  NormLiveMatch,
  NormLiveEvent,
  NormLiveTeam,
  NormStandingRow,
} from "./sportmonksLive";

export type Rng = () => number;

// Fisher–Yates shuffle on a copy, using an injectable RNG for deterministic
// tests.
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface AssignmentInput {
  participants: Pick<SweepstakeParticipant, "id" | "manualOverride" | "teamId">[];
  teams: Pick<TournamentTeam, "id" | "eliminated">[];
  /** Include knocked-out teams in the draw. Default false. */
  includeEliminated?: boolean;
  rng?: Rng;
}

/**
 * Fairly assign teams to participants.
 *
 * - Participants flagged `manualOverride` keep their existing team and are
 *   left out of the random draw.
 * - Teams are distributed as evenly as possible: with P people and T teams
 *   every team gets either floor(P/T) or ceil(P/T) people. When there are
 *   more teams than people, each person gets a distinct team and some teams
 *   go unassigned.
 *
 * Returns the assignments to persist as `{ participantId, teamId }`.
 * Throws if there are no eligible teams.
 */
export function computeAssignments(input: AssignmentInput): { participantId: string; teamId: string }[] {
  const rng = input.rng ?? Math.random;
  const pool = input.teams.filter((t) => input.includeEliminated || !t.eliminated);
  const drawParticipants = input.participants.filter((p) => !p.manualOverride);

  if (drawParticipants.length === 0) return [];
  if (pool.length === 0) {
    throw new Error("No teams available to assign. Add or sync teams first.");
  }

  // Build a balanced multiset of team ids covering every participant.
  const slots: string[] = [];
  while (slots.length < drawParticipants.length) {
    for (const t of shuffle(pool, rng)) {
      slots.push(t.id);
      if (slots.length >= drawParticipants.length) break;
    }
  }
  const shuffledSlots = shuffle(slots, rng);
  const shuffledPeople = shuffle(drawParticipants, rng);

  return shuffledPeople.map((p, i) => ({ participantId: p.id, teamId: shuffledSlots[i] }));
}

/**
 * Given the current teams, compute the status each participant should have.
 * A participant inherits their team's fate: winner if the team won the
 * tournament, eliminated if the team is knocked out, otherwise active.
 * Participants with no team are left active.
 */
export function computeParticipantStatuses(
  participants: Pick<SweepstakeParticipant, "id" | "teamId" | "status">[],
  teams: Pick<TournamentTeam, "id" | "eliminated" | "isWinner">[],
): { participantId: string; status: "active" | "eliminated" | "winner" }[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const updates: { participantId: string; status: "active" | "eliminated" | "winner" }[] = [];
  for (const p of participants) {
    const team = p.teamId ? byId.get(p.teamId) : undefined;
    let status: "active" | "eliminated" | "winner" = "active";
    if (team) {
      if (team.isWinner) status = "winner";
      else if (team.eliminated) status = "eliminated";
    }
    if (status !== p.status) {
      updates.push({ participantId: p.id, status });
    }
  }
  return updates;
}

/**
 * Detect a tournament winner from a finished final/decider match. Returns the
 * winning team name, or null if no decisive final is found. Used as a hint;
 * operators can always set the winner by hand.
 */
export function detectWinnerTeamName(matches: Pick<TournamentMatch, "stage" | "status" | "homeTeamName" | "awayTeamName" | "homeScore" | "awayScore">[]): string | null {
  const finals = matches.filter(
    (m) => m.status === "finished" && /final/i.test(m.stage ?? "") && !/semi|quarter/i.test(m.stage ?? ""),
  );
  if (finals.length === 0) return null;
  const f = finals[finals.length - 1];
  if (f.homeScore == null || f.awayScore == null || f.homeScore === f.awayScore) return null;
  return f.homeScore > f.awayScore ? f.homeTeamName ?? null : f.awayTeamName ?? null;
}

// ---------- Display payload (scrubbed for public consumption) ----------

export interface DisplayTeam {
  id: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
  groupName: string | null;
  crestUrl: string | null;
  eliminated: boolean;
  isWinner: boolean;
}

export interface DisplayParticipant {
  id: string;
  name: string;
  department: string | null;
  teamId: string | null;
  teamName: string | null;
  status: "active" | "eliminated" | "winner";
}

export interface DisplayMatch {
  id: string;
  stage: string | null;
  groupName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "in_play" | "finished";
  kickoffAt: string | null;
}

export interface DisplayStanding {
  teamName: string;
  groupName: string | null;
  position: number | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalDifference: number;
  points: number;
}

export interface SweepstakeDisplayData {
  tournamentName: string;
  theme: string;
  accentColor: string;
  layoutMode: string;
  rotationIntervalSeconds: number;
  refreshIntervalSeconds: number;
  slides: SweepstakeSlideType[];
  kickoffAt: string | null;
  lastSyncedAt: string | null;
  teams: DisplayTeam[];
  participants: DisplayParticipant[];
  matches: DisplayMatch[];
  standings: DisplayStanding[];
  winner: { teamName: string; participants: string[] } | null;
}

export interface BuildDisplayInput {
  config: SweepstakeWidgetConfig;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  standings: TournamentStanding[];
  participants: SweepstakeParticipant[];
}

/**
 * Build the public display payload. Critically this NEVER includes
 * participant emails — only the data needed to render the wall. Slides are
 * filtered to those that actually have content so the rotation never shows an
 * empty screen.
 */
export function buildDisplayData(input: BuildDisplayInput): SweepstakeDisplayData {
  const { config } = input;
  const teamById = new Map(input.teams.map((t) => [t.id, t]));

  const teams: DisplayTeam[] = input.teams.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    countryCode: t.countryCode,
    groupName: t.groupName,
    crestUrl: t.crestUrl,
    eliminated: t.eliminated,
    isWinner: t.isWinner,
  }));

  const participants: DisplayParticipant[] = input.participants.map((p) => ({
    id: p.id,
    name: p.name,
    department: p.department,
    teamId: p.teamId,
    teamName: p.teamId ? teamById.get(p.teamId)?.name ?? null : null,
    status: p.status as DisplayParticipant["status"],
  }));

  const matches: DisplayMatch[] = input.matches.map((m) => ({
    id: m.id,
    stage: m.stage,
    groupName: m.groupName,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status as DisplayMatch["status"],
    kickoffAt: m.kickoffAt ? m.kickoffAt.toISOString() : null,
  }));

  const standings: DisplayStanding[] = input.standings.map((s) => ({
    teamName: s.teamName,
    groupName: s.groupName,
    position: s.position,
    played: s.played,
    won: s.won,
    draw: s.draw,
    lost: s.lost,
    goalDifference: s.goalDifference,
    points: s.points,
  }));

  const winnerTeam = input.teams.find((t) => t.isWinner) ?? null;
  const winner = winnerTeam
    ? {
        teamName: winnerTeam.name,
        participants: participants.filter((p) => p.teamId === winnerTeam.id).map((p) => p.name),
      }
    : null;

  // Determine which slides have content.
  const requested = (config.slideTypes && config.slideTypes.length > 0
    ? config.slideTypes
    : SWEEPSTAKE_SLIDE_TYPES) as SweepstakeSlideType[];
  const now = Date.now();
  const hasUpcomingFixtures = matches.some((m) => m.status !== "finished");
  const hasResults = matches.some((m) => m.status === "finished");
  // Office rivalries: any upcoming match where both sides have drawn staff.
  const teamNameToStaffCount = new Map<string, number>();
  for (const p of participants) {
    if (!p.teamName) continue;
    const key = p.teamName.toLowerCase();
    teamNameToStaffCount.set(key, (teamNameToStaffCount.get(key) ?? 0) + 1);
  }
  const hasRivalries = matches.some(
    (m) =>
      m.status !== "finished" &&
      (m.homeTeamName ? (teamNameToStaffCount.get(m.homeTeamName.toLowerCase()) ?? 0) > 0 : false) &&
      (m.awayTeamName ? (teamNameToStaffCount.get(m.awayTeamName.toLowerCase()) ?? 0) > 0 : false),
  );
  const hasContent: Record<SweepstakeSlideType, boolean> = {
    countdown: Boolean(config.kickoffAt && config.kickoffAt.getTime() > now),
    fixtures: hasUpcomingFixtures,
    results: hasResults,
    standings: standings.length > 0,
    sweepstake: participants.length > 0,
    rivalries: hasRivalries,
    survivors: participants.some((p) => p.teamName),
    eliminations: participants.some((p) => p.status !== "active") || teams.some((t) => t.eliminated),
    spotlight: teams.length > 0,
    winner: winner !== null,
  };
  const slides = requested.filter((s) => hasContent[s]);

  return {
    tournamentName: config.tournamentName,
    theme: config.theme,
    accentColor: config.accentColor,
    layoutMode: config.layoutMode,
    rotationIntervalSeconds: config.rotationIntervalSeconds,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    slides: slides.length > 0 ? slides : (["sweepstake"] as SweepstakeSlideType[]),
    kickoffAt: config.kickoffAt ? config.kickoffAt.toISOString() : null,
    lastSyncedAt: config.lastSyncedAt ? config.lastSyncedAt.toISOString() : null,
    teams,
    participants,
    matches,
    standings,
    winner,
  };
}

// ---------- Live World Cup panels (Task #287) ----------
//
// Joins the normalised Sportmonks live data to the sweepstake's persisted
// teams + participant assignments so every team is always shown next to the
// colleague(s) who drew it. Pure — the routes layer supplies fetched data.

export interface LiveTeamView {
  /** Persisted tournament_teams.id, if the live team matched one. */
  teamId: string | null;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  countryCode: string | null;
  /** Names of the staff who drew this team. */
  participants: string[];
  eliminated: boolean;
  isWinner: boolean;
}

export interface LiveEventView {
  minute: number | null;
  kind: NormLiveEvent["kind"];
  side: "home" | "away" | null;
  teamName: string | null;
  playerName: string | null;
  detail: string | null;
  /** Staff linked to the team involved in the event. */
  participants: string[];
}

export interface LiveMatchView {
  id: string;
  stateLabel: string;
  isLive: boolean;
  finished: boolean;
  minute: number | null;
  groupName: string | null;
  stage: string | null;
  startingAt: string | null;
  home: LiveTeamView | null;
  away: LiveTeamView | null;
  homeScore: number | null;
  awayScore: number | null;
  events: LiveEventView[];
}

export interface LiveStandingView {
  team: LiveTeamView;
  groupName: string | null;
  position: number | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface SweepstakeLiveData {
  enabled: boolean;
  /** False → the widget shows "Data temporarily unavailable". */
  available: boolean;
  /** True → serving last-known-good cached data after an upstream failure. */
  stale: boolean;
  updatedAt: string | null;
  /** How often the display should re-poll while live mode is on (seconds). */
  refreshSeconds: number;
  panels: SweepstakeLivePanel[];
  liveMatches: LiveMatchView[];
  nextMatch: LiveMatchView | null;
  standings: LiveStandingView[];
}

export interface BuildLiveInput {
  /** Requested panels; empty = all live panels. */
  panels: SweepstakeLivePanel[];
  refreshSeconds: number;
  teams: Pick<TournamentTeam, "id" | "externalId" | "name" | "shortName" | "countryCode" | "crestUrl" | "eliminated" | "isWinner">[];
  participants: Pick<SweepstakeParticipant, "name" | "teamId">[];
  inplay: NormLiveMatch[];
  fixtures: NormLiveMatch[];
  standings: NormStandingRow[];
  available: boolean;
  stale: boolean;
  updatedAt: number | null;
}

export function buildLiveData(input: BuildLiveInput): SweepstakeLiveData {
  const panels = (input.panels.length > 0 ? input.panels : SWEEPSTAKE_LIVE_PANELS) as SweepstakeLivePanel[];

  // Match live teams to persisted teams by the stored Sportmonks external id,
  // then attach the staff assigned to each persisted team.
  const teamByExternal = new Map<string, BuildLiveInput["teams"][number]>();
  for (const t of input.teams) {
    if (t.externalId) teamByExternal.set(String(t.externalId), t);
  }
  const participantsByTeam = new Map<string, string[]>();
  for (const p of input.participants) {
    if (!p.teamId) continue;
    const list = participantsByTeam.get(p.teamId) ?? [];
    list.push(p.name);
    participantsByTeam.set(p.teamId, list);
  }

  function resolveTeam(norm: NormLiveTeam | null): LiveTeamView | null {
    if (!norm) return null;
    const persisted = teamByExternal.get(norm.sportmonksId);
    return {
      teamId: persisted?.id ?? null,
      name: persisted?.name ?? norm.name,
      shortName: norm.shortName ?? persisted?.shortName ?? null,
      crestUrl: norm.crestUrl ?? persisted?.crestUrl ?? null,
      countryCode: persisted?.countryCode ?? null,
      participants: persisted ? participantsByTeam.get(persisted.id) ?? [] : [],
      eliminated: persisted?.eliminated ?? false,
      isWinner: persisted?.isWinner ?? false,
    };
  }

  function toMatchView(m: NormLiveMatch): LiveMatchView {
    const home = resolveTeam(m.home);
    const away = resolveTeam(m.away);
    const events: LiveEventView[] = m.events.map((e) => {
      const team = e.side === "home" ? home : e.side === "away" ? away : null;
      return {
        minute: e.minute,
        kind: e.kind,
        side: e.side,
        teamName: team?.name ?? null,
        playerName: e.playerName,
        detail: e.detail,
        participants: team?.participants ?? [],
      };
    });
    return {
      id: m.id,
      stateLabel: m.stateLabel,
      isLive: m.isLive,
      finished: m.finished,
      minute: m.minute,
      groupName: m.groupName,
      stage: m.stage,
      startingAt: m.startingAt,
      home,
      away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      events,
    };
  }

  const wantNowNext = panels.includes("now_next");
  const wantScore = panels.includes("live_score");
  const wantStandings = panels.includes("live_standings");

  // Currently in-play World Cup matches, live first.
  const liveMatches = (wantNowNext || wantScore)
    ? input.inplay
        .filter((m) => m.isLive || (!m.finished && m.homeScore != null))
        .map(toMatchView)
    : [];

  // Soonest upcoming fixture for the "Next" half of the now/next panel.
  let nextMatch: LiveMatchView | null = null;
  if (wantNowNext) {
    const nowTs = (input.updatedAt ?? Date.now());
    const upcoming = input.fixtures
      .filter((m) => !m.isLive && !m.finished && (m.startingAtTs == null || m.startingAtTs * 1000 >= nowTs - 60_000))
      .sort((a, b) => (a.startingAtTs ?? Infinity) - (b.startingAtTs ?? Infinity));
    nextMatch = upcoming.length > 0 ? toMatchView(upcoming[0]) : null;
  }

  const standings: LiveStandingView[] = wantStandings
    ? input.standings
        .map((s): LiveStandingView => {
          const team = resolveTeam({
            sportmonksId: s.sportmonksTeamId,
            name: s.teamName,
            shortName: s.teamShortName,
            crestUrl: s.teamCrestUrl,
          });
          return {
            team: team as LiveTeamView,
            groupName: s.groupName,
            position: s.position,
            played: s.played,
            won: s.won,
            draw: s.draw,
            lost: s.lost,
            goalsFor: s.goalsFor,
            goalsAgainst: s.goalsAgainst,
            goalDifference: s.goalDifference,
            points: s.points,
          };
        })
        .sort((a, b) => {
          const g = (a.groupName ?? "").localeCompare(b.groupName ?? "");
          if (g !== 0) return g;
          return (a.position ?? 99) - (b.position ?? 99);
        })
    : [];

  return {
    enabled: true,
    available: input.available,
    stale: input.stale,
    updatedAt: input.updatedAt ? new Date(input.updatedAt).toISOString() : null,
    refreshSeconds: input.refreshSeconds,
    panels,
    liveMatches,
    nextMatch,
    standings,
  };
}

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
} from "@shared/schema";
import { SWEEPSTAKE_SLIDE_TYPES } from "@shared/schema";

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
  const hasContent: Record<SweepstakeSlideType, boolean> = {
    countdown: Boolean(config.kickoffAt && config.kickoffAt.getTime() > now),
    fixtures: hasUpcomingFixtures,
    results: hasResults,
    standings: standings.length > 0,
    sweepstake: participants.length > 0,
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

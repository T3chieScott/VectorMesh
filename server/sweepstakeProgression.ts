// World Cup progression engine.
//
// Pure, side-effect-free derivation of tournament progress from the stored
// teams + matches: group standings, who advances / is eliminated, resolution
// of knockout draw placeholders ("1st Group C") into real teams, and the
// knockout bracket shown on the wall. The routes layer persists the derived
// standings + elimination flags; the display layer uses the resolver + bracket
// builder at render time (so a later provider sync never fights local writes).
//
// Deliberately conservative: a team is only marked out when results PROVE it
// (bottom of a completed group, a losing knockout side, or one of the worst
// third-placed teams once every group is done). Nothing is eliminated mid-group.

import type { TournamentMatch } from "@shared/schema";
import {
  THIRD_PLACE_ALLOCATION,
  THIRD_PLACE_SLOT_GROUPS,
  THIRD_PLACE_WINNER_COLUMNS,
} from "./thirdPlaceAllocation";

export type MatchLike = Pick<
  TournamentMatch,
  "stage" | "groupName" | "homeTeamName" | "awayTeamName" | "homeScore" | "awayScore" | "status"
>;

export interface DerivedStanding {
  teamName: string;
  groupName: string;
  position: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface DerivedProgression {
  /** Ranked group tables computed from finished group-stage matches. */
  standings: DerivedStanding[];
  /** Lower-cased names of teams that results prove are knocked out. */
  eliminatedTeamNames: Set<string>;
  /** Group labels whose every group match has finished (positions are final). */
  completeGroups: Set<string>;
  /** True once every group has finished all its matches. */
  groupStageComplete: boolean;
  /**
   * The group letters (e.g. ["B","D","E",…], sorted) whose third-placed team
   * qualified for the first knockout round, when — and only when — the 48-team
   * FIFA format (12 groups, 8 advancing thirds) is detected and the knockout
   * capacity is trustworthy. `null` in every other case (partial data,
   * untrusted capacity, or a non-12-group tournament), so the Annex C
   * placeholder resolution stays disabled unless it can be proven.
   */
  qualifyingThirdGroups: string[] | null;
}

// A group match carries a real group label; knockout fixtures don't (their
// draw slots live in the placeholder team names instead).
function isGroupStageMatch(m: MatchLike): boolean {
  if (m.groupName && m.groupName.trim()) return true;
  return /group/i.test(m.stage ?? "");
}

// Draw placeholders like "1st Group C", "3rd Group A/B/C/D/F", "Winner Match
// 73", "Runner-up …" — anything that names a slot rather than a real country.
export function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  if (!n) return true;
  if (/^(winner|loser|runner[- ]?up)\b/i.test(n)) return true;
  if (/\b\d(st|nd|rd|th)\b/i.test(n)) return true; // "1st Group C", "3rd Group A/B"
  if (/\bgroup\s+[a-z](\s*\/\s*[a-z])+/i.test(n)) return true; // "Group A/B/C/D"
  return false;
}

export function isRealTeamName(name: string | null | undefined): boolean {
  return !!name && !isPlaceholderName(name);
}

interface Stat {
  name: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
}

/** Compute ranked group tables from finished group-stage matches. */
export function computeGroupStandings(matches: MatchLike[]): DerivedStanding[] {
  const groups = new Map<string, Map<string, Stat>>();
  const ensure = (group: string, name: string): Stat => {
    let gm = groups.get(group);
    if (!gm) {
      gm = new Map();
      groups.set(group, gm);
    }
    const key = name.toLowerCase();
    let s = gm.get(key);
    if (!s) {
      s = { name, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
      gm.set(key, s);
    }
    return s;
  };

  for (const m of matches) {
    if (!isGroupStageMatch(m)) continue;
    const group = (m.groupName ?? "").trim();
    if (!group || !m.homeTeamName || !m.awayTeamName) continue;
    // Register both sides so a not-yet-played group still shows all four teams
    // at zero rather than an empty table.
    const home = ensure(group, m.homeTeamName);
    const away = ensure(group, m.awayTeamName);
    if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) continue;
    home.played++;
    away.played++;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.won++;
      away.lost++;
      home.pts += 3;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      home.lost++;
      away.pts += 3;
    } else {
      home.draw++;
      away.draw++;
      home.pts++;
      away.pts++;
    }
  }

  const out: DerivedStanding[] = [];
  for (const [group, gm] of groups) {
    const rows = [...gm.values()].sort(
      (a, b) =>
        b.pts - a.pts ||
        b.gf - b.ga - (a.gf - a.ga) ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name),
    );
    rows.forEach((s, i) =>
      out.push({
        teamName: s.name,
        groupName: group,
        position: i + 1,
        played: s.played,
        won: s.won,
        draw: s.draw,
        lost: s.lost,
        goalsFor: s.gf,
        goalsAgainst: s.ga,
        goalDifference: s.gf - s.ga,
        points: s.pts,
      }),
    );
  }
  return out;
}

// A group is complete once every one of its group matches has finished.
function groupIsComplete(matches: MatchLike[], group: string): boolean {
  const gm = matches.filter(
    (m) => isGroupStageMatch(m) && (m.groupName ?? "").trim() === group,
  );
  return gm.length > 0 && gm.every((m) => m.status === "finished" && m.homeScore != null && m.awayScore != null);
}

// Slots in the first knockout round = 2 × (matches in the biggest knockout
// round). For the 48-team format that's the Round of 32 (16 matches → 32
// slots); for a 32-team cup it's the Round of 16 (8 matches → 16 slots).
function firstKnockoutSlots(matches: MatchLike[]): number {
  const byStage = new Map<string, number>();
  for (const m of matches) {
    if (isGroupStageMatch(m)) continue;
    const s = (m.stage ?? "knockout").trim();
    byStage.set(s, (byStage.get(s) ?? 0) + 1);
  }
  if (byStage.size === 0) return 0;
  return Math.max(...byStage.values()) * 2;
}

/**
 * Derive standings, completed-group set and the set of eliminated teams from
 * the stored matches. Elimination is additive/provable only:
 *  - bottom place(s) of any COMPLETED group are out,
 *  - once every group is complete, the worst third-placed teams that miss the
 *    knockout cut are out (ranked points → GD → GF; a documented simplification
 *    that omits the exact FIFA third-place allocation table),
 *  - the losing side of any finished knockout match is out.
 */
export function computeProgression(matches: MatchLike[]): DerivedProgression {
  const standings = computeGroupStandings(matches);
  const eliminated = new Set<string>();

  const byGroup = new Map<string, DerivedStanding[]>();
  for (const s of standings) {
    if (!byGroup.has(s.groupName)) byGroup.set(s.groupName, []);
    byGroup.get(s.groupName)!.push(s);
  }
  const groupNames = [...byGroup.keys()];
  const completeGroups = new Set(groupNames.filter((g) => groupIsComplete(matches, g)));
  const groupStageComplete = groupNames.length > 0 && completeGroups.size === groupNames.length;

  // Bottom of every completed group (4th place in a 4-team group, and anything
  // below) is eliminated.
  for (const g of completeGroups) {
    for (const r of byGroup.get(g)!) {
      if (r.position >= 4) eliminated.add(r.teamName.toLowerCase());
    }
  }

  // Best-third cut, only once the whole group stage is done and positions are
  // final everywhere — AND only when the knockout capacity is trustworthy.
  //
  // We infer the first-round slot count from the stored knockout fixtures. If
  // that feed is missing or partial (e.g. the provider hasn't published every
  // Round-of-32 fixture yet) the inferred count is too small and we'd wrongly
  // eliminate qualifying third-placed teams — permanently, since eliminations
  // persist additively. Guard against that: a real first knockout round is a
  // power of two, must seat every group's two automatic qualifiers, and can't
  // seat more thirds than there are groups. If any of those don't hold we can't
  // prove which thirds are out, so we leave them all in.
  const autoQualifiers = 2 * groupNames.length;
  const advSlots = firstKnockoutSlots(matches);
  const isPowerOfTwo = advSlots > 0 && (advSlots & (advSlots - 1)) === 0;
  const capacityTrusted =
    isPowerOfTwo && advSlots >= autoQualifiers && advSlots - autoQualifiers <= groupNames.length;
  let qualifyingThirdGroups: string[] | null = null;
  if (groupStageComplete && groupNames.length > 0 && capacityTrusted) {
    const advancingThirds = Math.max(0, advSlots - autoQualifiers);
    const thirds = groupNames
      .map((g) => byGroup.get(g)!.find((r) => r.position === 3))
      .filter((r): r is DerivedStanding => !!r);
    const ranked = thirds.slice().sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.teamName.localeCompare(b.teamName),
    );
    for (const r of ranked.slice(advancingThirds)) {
      eliminated.add(r.teamName.toLowerCase());
    }
    // Record which groups' thirds advanced, but only for the exact 48-team FIFA
    // format the Annex C table describes (12 groups, 8 advancing thirds) and
    // only when every advancing group maps to a clean "Group X" letter. Any
    // other shape leaves this null so the placeholder resolver stays off.
    if (groupNames.length === 12 && advancingThirds === 8) {
      const letters = ranked
        .slice(0, advancingThirds)
        .map((r) => groupLetter(r.groupName));
      if (letters.every((l): l is string => l !== null)) {
        qualifyingThirdGroups = letters.slice().sort();
      }
    }
  }

  // Losing side of any decided knockout match.
  for (const m of matches) {
    if (isGroupStageMatch(m)) continue;
    if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) continue;
    if (m.homeScore === m.awayScore) continue; // shoot-out result unknown → skip
    const loser = m.homeScore > m.awayScore ? m.awayTeamName : m.homeTeamName;
    if (isRealTeamName(loser)) eliminated.add(loser!.toLowerCase());
  }

  return { standings, eliminatedTeamNames: eliminated, completeGroups, groupStageComplete, qualifyingThirdGroups };
}

// Extract the single-letter group id ("B") from a "Group B" label, or null if
// the label isn't the expected "Group X" (X ∈ A–L) shape.
function groupLetter(groupName: string): string | null {
  const m = /^\s*group\s+([a-l])\s*$/i.exec(groupName);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Resolve a single group-slot placeholder ("1st Group C", "2nd Group A") to a
 * real team once that group's positions are final. Returns null for anything
 * that can't (yet) be resolved — including "3rd Group A/B/C…" cross-group slots
 * and "Winner Match NN" slots, which are filled by the upstream provider as the
 * bracket plays out.
 */
export function resolveGroupSlot(
  name: string | null | undefined,
  prog: Pick<DerivedProgression, "standings" | "completeGroups">,
): string | null {
  if (!name) return null;
  const m = /^\s*(\d)(?:st|nd|rd|th)\s+group\s+([a-z])\s*$/i.exec(name);
  if (!m) return null;
  const pos = Number(m[1]);
  const group = `Group ${m[2].toUpperCase()}`;
  const complete = [...prog.completeGroups].some((g) => g.toLowerCase() === group.toLowerCase());
  if (!complete) return null;
  const row = prog.standings.find(
    (s) => s.groupName.toLowerCase() === group.toLowerCase() && s.position === pos,
  );
  return row ? row.teamName : null;
}

// Parse a cross-group third-place placeholder ("3rd Group A/B/C/D/F",
// "Third-place Group A/B/C/D/F") into its sorted set of candidate group
// letters. Returns null for anything that isn't such a slot.
function parseThirdPlaceSlotGroups(name: string): string[] | null {
  if (!/\b(3rd|third)/i.test(name)) return null;
  const m = /group\s+([a-l](?:\s*\/\s*[a-l])+)/i.exec(name);
  if (!m) return null;
  const letters = m[1]
    .split("/")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-L]$/.test(s));
  return letters.length >= 2 ? letters.slice().sort() : null;
}

/**
 * Resolve a cross-group third-place placeholder ("3rd Group A/B/C/D/F") into a
 * real team using the official FIFA World Cup 2026 Annex C allocation table.
 *
 * The slot's own candidate-group set uniquely identifies which Round-of-32
 * fixture (group-winner column) it is; the set of eight qualifying third-place
 * groups selects the Annex C combination; together they name the exact group
 * whose third-placed team fills the slot.
 *
 * Returns null — leaving the placeholder for the upstream provider — unless the
 * 48-team format is proven (`qualifyingThirdGroups` populated, meaning 12 groups
 * with 8 advancing thirds and trustworthy capacity) and the resolved group is
 * complete. Resolution is display-only and only ever replaces a placeholder, so
 * a later provider sync (which writes real names) is never overwritten.
 */
export function resolveThirdPlaceSlot(
  name: string | null | undefined,
  prog: Pick<DerivedProgression, "standings" | "completeGroups" | "qualifyingThirdGroups">,
): string | null {
  if (!name) return null;
  const qualifying = prog.qualifyingThirdGroups;
  if (!qualifying || qualifying.length !== 8) return null;

  const slotGroups = parseThirdPlaceSlotGroups(name);
  if (!slotGroups) return null;

  // Identify the winner column whose allowed-group set matches this slot.
  const slotKey = slotGroups.join("");
  let winnerColumn: string | null = null;
  for (const [col, groups] of Object.entries(THIRD_PLACE_SLOT_GROUPS)) {
    if (groups.slice().sort().join("") === slotKey) {
      winnerColumn = col;
      break;
    }
  }
  if (!winnerColumn) return null;

  const assigns = THIRD_PLACE_ALLOCATION[qualifying.join("")];
  if (!assigns) return null;
  const colIdx = THIRD_PLACE_WINNER_COLUMNS.indexOf(winnerColumn as (typeof THIRD_PLACE_WINNER_COLUMNS)[number]);
  if (colIdx < 0) return null;
  const thirdGroupLetter = assigns[colIdx];
  if (!thirdGroupLetter) return null;

  const group = `Group ${thirdGroupLetter}`;
  const complete = [...prog.completeGroups].some((g) => g.toLowerCase() === group.toLowerCase());
  if (!complete) return null;
  const row = prog.standings.find(
    (s) => s.groupName.toLowerCase() === group.toLowerCase() && s.position === 3,
  );
  return row ? row.teamName : null;
}

// ---------- Knockout bracket ----------

export interface BracketMatch {
  id: string;
  stage: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "in_play" | "finished";
  /** Winner's name for a decided match; null while undecided/level. */
  winnerName: string | null;
  kickoffAt: string | null;
}

export interface BracketRound {
  name: string;
  matches: BracketMatch[];
}

export interface BracketInputMatch {
  id: string;
  stage: string | null;
  /** Present for group-stage fixtures; used to keep them out of the bracket. */
  groupName?: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "in_play" | "finished";
  kickoffAt: string | null;
}

function isGroupStageStage(stage: string | null, groupName: string | null): boolean {
  if (groupName && groupName.trim()) return true;
  return /group/i.test(stage ?? "");
}

// Order knockout rounds from earliest to the final; the 3rd-place play-off sits
// just before the final.
function koRoundRank(stage: string | null): number {
  const s = (stage ?? "").toLowerCase();
  if (/round of 32|1\/16/.test(s)) return 1;
  if (/round of 16|1\/8/.test(s)) return 2;
  if (/quarter|1\/4/.test(s)) return 3;
  if (/semi|1\/2/.test(s)) return 4;
  if (/(3rd|third)\b|place/.test(s)) return 5;
  if (/final/.test(s)) return 6;
  return 99;
}

/**
 * Build the knockout bracket (rounds earliest → final) from the display
 * matches. Group-stage fixtures are excluded. Each match reports its computed
 * winner when the result is decisive.
 */
export function buildBracket(matches: BracketInputMatch[]): BracketRound[] {
  const ko = matches.filter((m) => !isGroupStageStage(m.stage, m.groupName ?? null));
  if (ko.length === 0) return [];

  const byStage = new Map<string, BracketInputMatch[]>();
  for (const m of ko) {
    const key = (m.stage ?? "Knockout").trim() || "Knockout";
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key)!.push(m);
  }

  const rounds: BracketRound[] = [];
  for (const [name, list] of byStage) {
    const sorted = list.slice().sort((a, b) => {
      const ka = a.kickoffAt ?? "";
      const kb = b.kickoffAt ?? "";
      return ka.localeCompare(kb) || a.id.localeCompare(b.id);
    });
    rounds.push({
      name,
      matches: sorted.map((m) => ({
        id: m.id,
        stage: m.stage,
        homeTeamName: m.homeTeamName,
        awayTeamName: m.awayTeamName,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: m.status,
        winnerName:
          m.status === "finished" && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore
            ? m.homeScore > m.awayScore
              ? m.homeTeamName
              : m.awayTeamName
            : null,
        kickoffAt: m.kickoffAt,
      })),
    });
  }

  rounds.sort((a, b) => koRoundRank(a.matches[0]?.stage ?? a.name) - koRoundRank(b.matches[0]?.stage ?? b.name));
  return rounds;
}

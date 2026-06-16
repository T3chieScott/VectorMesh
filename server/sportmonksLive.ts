// Task #287 — World Cup Live + Sweepstake Hype Wall.
//
// Server-side live data service for the Sportmonks Football API v3. This wraps
// the in-play livescores, season fixtures and live group standings, normalising
// the raw provider shapes into stable, frontend-agnostic view models.
//
// Security & resilience:
//  - The API token comes ONLY from server-side env vars (SPORTMONKS_TOKEN,
//    falling back to the legacy SPORTMONKS_API_TOKEN). It never appears in any
//    payload returned to the browser and is never written to logs.
//  - Every outbound call goes through the SSRF-hardened safeFetch.
//  - Each fetcher caches its result in-memory with a short TTL and keeps the
//    last-known-good value so a transient upstream failure serves slightly
//    stale data instead of an error (mirroring server/premierLeague.ts).

import { safeFetch } from "./safeFetch";

export const WORLD_CUP_LEAGUE_ID = 732;
const BASE = "https://api.sportmonks.com/v3/football";

// TTLs tuned per the task: in-play fast, standings ~1m, fixtures ~5m.
const INPLAY_TTL = 12_000;
const STANDINGS_TTL = 60_000;
const FIXTURES_TTL = 5 * 60_000;
const FETCH_TIMEOUT = 12_000;

// ---------- Normalised view models (no staff join — that lives in logic) ----------

export interface NormLiveTeam {
  sportmonksId: string;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
}

export type NormLiveEventKind =
  | "goal"
  | "own_goal"
  | "penalty"
  | "missed_penalty"
  | "substitution"
  | "yellowcard"
  | "redcard"
  | "yellowred"
  | "var"
  | "other";

export interface NormLiveEvent {
  minute: number | null;
  kind: NormLiveEventKind;
  side: "home" | "away" | null;
  sportmonksTeamId: string | null;
  playerName: string | null;
  detail: string | null;
}

export interface NormLiveMatch {
  id: string;
  leagueId: number | null;
  seasonId: number | null;
  state: string;
  stateLabel: string;
  isLive: boolean;
  finished: boolean;
  minute: number | null;
  groupName: string | null;
  stage: string | null;
  startingAt: string | null;
  startingAtTs: number | null;
  home: NormLiveTeam | null;
  away: NormLiveTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  events: NormLiveEvent[];
}

export interface NormStandingRow {
  sportmonksTeamId: string;
  teamName: string;
  teamShortName: string | null;
  teamCrestUrl: string | null;
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

// ---------- Pure normalisers (exported for unit tests) ----------

// Sportmonks event type ids → our coarse event kinds. (Stable provider ids.)
const EVENT_TYPE_KIND: Record<number, NormLiveEventKind> = {
  14: "goal",
  15: "own_goal",
  16: "penalty",
  17: "missed_penalty",
  18: "substitution",
  19: "yellowcard",
  20: "redcard",
  21: "yellowred",
};

function eventKind(typeId: unknown): NormLiveEventKind {
  const k = EVENT_TYPE_KIND[Number(typeId)];
  return k ?? "other";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stateLabel(state: any): { label: string; isLive: boolean; finished: boolean } {
  const code = String(state?.state ?? state?.developer_name ?? "").toUpperCase();
  const short = state?.short_name ? String(state.short_name) : null;
  const finished = ["FT", "AET", "FT_PEN", "AWARDED", "FINISHED"].includes(code);
  const live =
    code.startsWith("INPLAY") ||
    ["HT", "BREAK", "ET", "PEN_LIVE", "EXTRA_TIME", "PENALTIES"].includes(code);
  let label: string;
  if (finished) label = "Full time";
  else if (code === "HT") label = "Half time";
  else if (code === "INPLAY_1ST_HALF") label = "1st half";
  else if (code === "INPLAY_2ND_HALF") label = "2nd half";
  else if (code.includes("ET") || code === "BREAK") label = short ?? "Live";
  else if (live) label = short ?? "Live";
  else label = state?.name ? String(state.name) : "Upcoming";
  return { label, isLive: live, finished };
}

function teamFromParticipant(p: any): NormLiveTeam | null {
  if (!p || p.id == null) return null;
  return {
    sportmonksId: String(p.id),
    name: p.name ?? "Unknown",
    shortName: p.short_code ?? null,
    crestUrl: p.image_path ?? null,
  };
}

// Extract the two teams keyed by their meta.location ("home"/"away").
function splitParticipants(participants: any[]): { home: NormLiveTeam | null; away: NormLiveTeam | null; byId: Map<string, "home" | "away"> } {
  let home: NormLiveTeam | null = null;
  let away: NormLiveTeam | null = null;
  const byId = new Map<string, "home" | "away">();
  for (const p of participants ?? []) {
    const loc = p?.meta?.location === "away" ? "away" : p?.meta?.location === "home" ? "home" : null;
    const team = teamFromParticipant(p);
    if (!team) continue;
    if (loc === "home") home = team;
    else if (loc === "away") away = team;
    if (loc) byId.set(team.sportmonksId, loc);
  }
  return { home, away, byId };
}

// Current score from the "CURRENT" score rows, picked by the score.participant
// side ("home"/"away") which is independent of include ordering.
function currentScores(scores: any[]): { home: number | null; away: number | null } {
  let home: number | null = null;
  let away: number | null = null;
  for (const s of scores ?? []) {
    if (String(s?.description ?? "").toUpperCase() !== "CURRENT") continue;
    const side = s?.score?.participant;
    const goals = num(s?.score?.goals);
    if (side === "home") home = goals;
    else if (side === "away") away = goals;
  }
  return { home, away };
}

function currentMinute(fx: any): number | null {
  const periods = Array.isArray(fx?.periods) ? fx.periods : [];
  const ticking = periods.find((p: any) => p?.ticking);
  if (ticking && num(ticking.minutes) != null) return num(ticking.minutes);
  // Fall back to the latest event minute so the panel still shows progress.
  const events = Array.isArray(fx?.events) ? fx.events : [];
  let max: number | null = null;
  for (const e of events) {
    const m = num(e?.minute);
    if (m != null && (max == null || m > max)) max = m;
  }
  return max;
}

export function normalizeLiveFixture(fx: any): NormLiveMatch {
  const { home, away, byId } = splitParticipants(fx?.participants ?? []);
  const score = currentScores(fx?.scores ?? []);
  const st = stateLabel(fx?.state ?? {});
  const events: NormLiveEvent[] = (Array.isArray(fx?.events) ? fx.events : [])
    .map((e: any): NormLiveEvent => {
      const teamId = e?.participant_id != null ? String(e.participant_id) : null;
      const side = teamId ? byId.get(teamId) ?? null : null;
      const detailParts = [e?.info, e?.addition].filter((x: any) => typeof x === "string" && x.trim().length > 0);
      return {
        minute: num(e?.minute),
        kind: eventKind(e?.type_id),
        side,
        sportmonksTeamId: teamId,
        playerName: typeof e?.player_name === "string" ? e.player_name : null,
        detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
      };
    })
    // Keep only the meaningful match events for a hype ticker.
    .filter((e: NormLiveEvent) => e.kind !== "other")
    .sort((a: NormLiveEvent, b: NormLiveEvent) => (a.minute ?? 0) - (b.minute ?? 0));

  return {
    id: String(fx?.id ?? ""),
    leagueId: num(fx?.league_id),
    seasonId: num(fx?.season_id),
    state: String(fx?.state?.state ?? ""),
    stateLabel: st.label,
    isLive: st.isLive,
    finished: st.finished,
    minute: st.isLive ? currentMinute(fx) : null,
    groupName: fx?.group?.name ?? null,
    stage: fx?.stage?.name ?? null,
    startingAt: typeof fx?.starting_at === "string" ? fx.starting_at : null,
    startingAtTs: num(fx?.starting_at_timestamp),
    home,
    away,
    homeScore: score.home,
    awayScore: score.away,
    events,
  };
}

// Map a standings detail code → our field. Codes are stable Sportmonks codes.
const STANDING_DETAIL_FIELD: Record<string, keyof Pick<NormStandingRow, "played" | "won" | "draw" | "lost" | "goalsFor" | "goalsAgainst" | "goalDifference">> = {
  "overall-matches-played": "played",
  "overall-won": "won",
  "overall-draw": "draw",
  "overall-lost": "lost",
  "overall-goals-for": "goalsFor",
  "overall-goals-against": "goalsAgainst",
  "goal-difference": "goalDifference",
};

export function normalizeStandingRow(row: any): NormStandingRow {
  const out: NormStandingRow = {
    sportmonksTeamId: row?.participant_id != null ? String(row.participant_id) : "",
    teamName: row?.participant?.name ?? "Unknown",
    teamShortName: row?.participant?.short_code ?? null,
    teamCrestUrl: row?.participant?.image_path ?? null,
    groupName: row?.group?.name ?? null,
    position: num(row?.position),
    played: 0,
    won: 0,
    draw: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: num(row?.points) ?? 0,
  };
  for (const d of Array.isArray(row?.details) ? row.details : []) {
    const code = d?.type?.code;
    const field = code ? STANDING_DETAIL_FIELD[code] : undefined;
    if (field) out[field] = num(d?.value) ?? 0;
    if (code === "overall-points") out.points = num(d?.value) ?? out.points;
  }
  return out;
}

export function normalizeLiveFixtures(raw: any): NormLiveMatch[] {
  const data = Array.isArray(raw?.data) ? raw.data : [];
  return data
    .map(normalizeLiveFixture)
    .filter((m: NormLiveMatch) => m.leagueId == null || m.leagueId === WORLD_CUP_LEAGUE_ID);
}

export function normalizeStandings(raw: any): NormStandingRow[] {
  const data = Array.isArray(raw?.data) ? raw.data : [];
  return data
    .map(normalizeStandingRow)
    .filter((r: NormStandingRow) => r.sportmonksTeamId !== "");
}

// ---------- Token + fetch with TTL cache + last-known-good ----------

export function getSportmonksToken(): string | null {
  return process.env.SPORTMONKS_TOKEN || process.env.SPORTMONKS_API_TOKEN || null;
}

export function getWorldCupSeasonId(): string | null {
  const v = process.env.WORLD_CUP_SEASON_ID;
  return v && v.trim() ? v.trim() : null;
}

export function isSportmonksLiveConfigured(): boolean {
  // Live mode needs both the API token and the World Cup season id. The
  // season drives the fixtures + standings calls, so without it the live
  // panels cannot work and the widget must degrade to "unavailable".
  return Boolean(getSportmonksToken()) && Boolean(getWorldCupSeasonId());
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface LiveResult<T> {
  data: T;
  stale: boolean;
  updatedAt: number | null;
  ok: boolean;
}

const caches = new Map<string, CacheEntry<any>>();

// Build a Sportmonks URL. The token is appended here and never logged.
function buildUrl(path: string, params: Record<string, string>): string {
  const token = getSportmonksToken();
  if (!token) throw new Error("Sportmonks token not configured");
  const qs = new URLSearchParams({ ...params, api_token: token }).toString();
  return `${BASE}${path}?${qs}`;
}

async function fetchJson(url: string): Promise<any> {
  const res = await safeFetch(url, { timeoutMs: FETCH_TIMEOUT });
  if (res.status !== 200) {
    // Deliberately omit the URL (carries the token) from the error.
    throw new Error(`Sportmonks request failed (HTTP ${res.status})`);
  }
  return JSON.parse(res.text);
}

async function cachedFetch<T>(
  key: string,
  ttl: number,
  url: string,
  normalise: (raw: any) => T,
): Promise<LiveResult<T>> {
  const cached = caches.get(key) as CacheEntry<T> | undefined;
  if (cached && Date.now() - cached.timestamp < ttl) {
    return { data: cached.data, stale: false, updatedAt: cached.timestamp, ok: true };
  }
  try {
    const raw = await fetchJson(url);
    const data = normalise(raw);
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    caches.set(key, entry);
    return { data, stale: false, updatedAt: entry.timestamp, ok: true };
  } catch (err) {
    console.error(`[sportmonks-live] ${key} fetch failed:`, err instanceof Error ? err.message : err);
    if (cached) {
      return { data: cached.data, stale: true, updatedAt: cached.timestamp, ok: true };
    }
    return { data: normalise({}), stale: false, updatedAt: null, ok: false };
  }
}

export async function getLiveInplayMatches(): Promise<LiveResult<NormLiveMatch[]>> {
  const url = buildUrl("/livescores/inplay", {
    include: "participants;scores;state;events;league;group;stage;periods",
    filters: `fixtureLeagues:${WORLD_CUP_LEAGUE_ID}`,
  });
  return cachedFetch("inplay", INPLAY_TTL, url, normalizeLiveFixtures);
}

export async function getSeasonFixtures(): Promise<LiveResult<NormLiveMatch[]>> {
  const season = getWorldCupSeasonId();
  if (!season) return { data: [], stale: false, updatedAt: null, ok: false };
  // Sportmonks v3 has no /fixtures/seasons/:id path; list the league's fixtures
  // in a rolling date window (yesterday → +14 days) so the now/next panel always
  // has the soonest upcoming games. The window is kept small so the soonest
  // fixtures fall on the first page of results.
  const day = 86_400_000;
  const start = new Date(Date.now() - day).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 14 * day).toISOString().slice(0, 10);
  const url = buildUrl(`/fixtures/between/${start}/${end}`, {
    filters: `fixtureLeagues:${WORLD_CUP_LEAGUE_ID}`,
    include: "participants;scores;state;group;stage",
    per_page: "50",
  });
  return cachedFetch("fixtures", FIXTURES_TTL, url, normalizeLiveFixtures);
}

export async function getLiveStandings(): Promise<LiveResult<NormStandingRow[]>> {
  const season = getWorldCupSeasonId();
  if (!season) return { data: [], stale: false, updatedAt: null, ok: false };
  const url = buildUrl(`/standings/seasons/${encodeURIComponent(season)}`, {
    include: "participant;details.type;group;stage",
  });
  return cachedFetch("standings", STANDINGS_TTL, url, normalizeStandings);
}

// Test helper.
export function __clearSportmonksLiveCache(): void {
  caches.clear();
}

import type { Request, Response } from "express";

const STANDINGS_BASE_URL =
  "https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v5/competitions/8/seasons";

const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT = 10_000;

interface CacheEntry {
  data: NormalisedStandings;
  timestamp: number;
}

const cache = new Map<number, CacheEntry>();

interface NormalisedStandings {
  source: {
    provider: string;
    documentedApi: boolean;
    page: string;
  };
  competition: { id: number; name: string };
  season: { yearStart: number; label: string };
  matchweek: number;
  live: boolean;
  updatedAt: string;
  table: NormalisedEntry[];
  cache: { hit: boolean; stale: boolean; seasonKey: number };
}

interface NormalisedEntry {
  position: number;
  team: {
    id: number;
    name: string;
    shortName: string;
    abbr: string;
    slug: string | null;
    badge: string | null;
    badgeMeta: { code: string; slug: string | null };
  };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
  qualification: { band: string; label: string };
}

const TEAM_BADGES: Record<string, string> = {
  ARS: "/assets/football/badges/arsenal.png",
  AVL: "/assets/football/badges/aston-villa.png",
  BOU: "/assets/football/badges/bournemouth.png",
  BRE: "/assets/football/badges/brentford.png",
  BHA: "/assets/football/badges/brighton.png",
  CHE: "/assets/football/badges/chelsea.png",
  CRY: "/assets/football/badges/crystal-palace.png",
  EVE: "/assets/football/badges/everton.png",
  FUL: "/assets/football/badges/fulham.png",
  IPS: "/assets/football/badges/ipswich.png",
  LEI: "/assets/football/badges/leicester.png",
  LIV: "/assets/football/badges/liverpool.png",
  MCI: "/assets/football/badges/man-city.png",
  MUN: "/assets/football/badges/man-united.png",
  NEW: "/assets/football/badges/newcastle.png",
  NFO: "/assets/football/badges/nottm-forest.png",
  SOU: "/assets/football/badges/southampton.png",
  TOT: "/assets/football/badges/tottenham.png",
  WHU: "/assets/football/badges/west-ham.png",
  WOL: "/assets/football/badges/wolves.png",
};

export function inferPremierLeagueSeasonYear(now = new Date()): number {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 8 ? year : year - 1;
}

function buildStandingsUrl(seasonYear: number): string {
  return `${STANDINGS_BASE_URL}/${seasonYear}/standings`;
}

function buildTablePageUrl(seasonYear: number): string {
  return `https://www.premierleague.com/en/tables/premier-league/${seasonYear}-${(seasonYear + 1).toString().slice(2)}/all-matchweeks`;
}

function safeNumber(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function classifyPosition(pos: number): { band: string; label: string } {
  if (pos >= 1 && pos <= 4) return { band: "champions-league", label: "UEFA Champions League" };
  if (pos === 5) return { band: "europa-league", label: "UEFA Europa League" };
  if (pos === 6) return { band: "conference-league", label: "UEFA Conference League" };
  if (pos >= 18 && pos <= 20) return { band: "relegation", label: "Relegation" };
  return { band: "none", label: "" };
}

function normaliseEntry(raw: any, position: number): NormalisedEntry {
  const team = raw.team || {};
  const abbr = (team.abbr || team.abbreviation || "").toUpperCase();
  const slug = team.altIds?.opta || null;
  const gf = safeNumber(raw.overall?.goalsFor);
  const ga = safeNumber(raw.overall?.goalsAgainst);

  return {
    position,
    team: {
      id: safeNumber(team.id),
      name: team.name || team.club?.name || "Unknown",
      shortName: team.shortName || team.name || "Unknown",
      abbr,
      slug,
      badge: TEAM_BADGES[abbr] || null,
      badgeMeta: { code: abbr.toLowerCase(), slug },
    },
    played: safeNumber(raw.overall?.played),
    won: safeNumber(raw.overall?.won),
    drawn: safeNumber(raw.overall?.drawn),
    lost: safeNumber(raw.overall?.lost),
    goalsFor: gf,
    goalsAgainst: ga,
    goalDifference: raw.overall?.goalDifference != null ? safeNumber(raw.overall.goalDifference) : gf - ga,
    points: safeNumber(raw.overall?.points),
    form: Array.isArray(raw.form)
      ? raw.form.map((f: any) => {
          if (typeof f === "string") return f;
          const r = f.result || f;
          if (r === "W" || r === "D" || r === "L") return r;
          return "?";
        }).slice(-5).join("")
      : "",
    qualification: classifyPosition(position),
  };
}

function normaliseStandingsPayload(
  raw: any,
  seasonYear: number,
  cacheInfo: { hit: boolean; stale: boolean }
): NormalisedStandings {
  const tables = raw.tables || [];
  const overall = tables.find((t: any) => t.gameweekPhase === "Overall") || tables[0] || {};
  const entries: any[] = overall.entries || [];

  const sorted = [...entries].sort(
    (a, b) => safeNumber(a.overall?.position) - safeNumber(b.overall?.position)
  );

  return {
    source: {
      provider: "Premier League site data",
      documentedApi: false,
      page: buildTablePageUrl(seasonYear),
    },
    competition: { id: 8, name: "Premier League" },
    season: {
      yearStart: seasonYear,
      label: `${seasonYear}/${(seasonYear + 1).toString().slice(2)}`,
    },
    matchweek: safeNumber(raw.gameweek || overall.gameweek || 0),
    live: Boolean(raw.live),
    updatedAt: new Date().toISOString(),
    table: sorted.map((entry, i) => normaliseEntry(entry, i + 1)),
    cache: { ...cacheInfo, seasonKey: seasonYear },
  };
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "VectorMesh/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getPremierLeagueTable(
  season: number | "auto" = "auto"
): Promise<NormalisedStandings> {
  const seasonYear = season === "auto" ? inferPremierLeagueSeasonYear() : season;
  const url = buildStandingsUrl(seasonYear);

  const cached = cache.get(seasonYear);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data, cache: { hit: true, stale: false, seasonKey: seasonYear } };
  }

  try {
    const raw = await fetchJson(url);
    const normalised = normaliseStandingsPayload(raw, seasonYear, { hit: false, stale: false });
    cache.set(seasonYear, { data: normalised, timestamp: Date.now() });
    return normalised;
  } catch (err) {
    if (cached) {
      return { ...cached.data, cache: { hit: true, stale: true, seasonKey: seasonYear } };
    }
    throw err;
  }
}

export function clearPremierLeagueCache(): void {
  cache.clear();
}

export function createPremierLeagueTableHandler() {
  return async (req: Request, res: Response) => {
    try {
      const seasonParam = req.query.season as string | undefined;
      const season: number | "auto" =
        seasonParam && seasonParam !== "auto" ? parseInt(seasonParam, 10) : "auto";

      if (typeof season === "number" && (isNaN(season) || season < 1992 || season > 2100)) {
        return res.status(400).json({ error: "Invalid season parameter" });
      }

      const data = await getPremierLeagueTable(season);
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json(data);
    } catch (err) {
      console.error("[PremierLeague] Upstream fetch failed:", err);
      res.status(502).json({
        error: "Failed to fetch Premier League standings",
        message: "Upstream data source unavailable and no cached data available",
      });
    }
  };
}

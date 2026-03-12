import type { Request, Response } from "express";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard";

const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT = 10_000;

const TEAM_BADGES: Record<string, string> = {
  ARS: "/assets/football/badges/arsenal",
  AVL: "/assets/football/badges/aston-villa",
  BOU: "/assets/football/badges/bournemouth",
  BRE: "/assets/football/badges/brentford",
  BHA: "/assets/football/badges/brighton",
  CHE: "/assets/football/badges/chelsea",
  CRY: "/assets/football/badges/crystal-palace",
  EVE: "/assets/football/badges/everton",
  FUL: "/assets/football/badges/fulham",
  IPS: "/assets/football/badges/ipswich",
  LEI: "/assets/football/badges/leicester",
  LIV: "/assets/football/badges/liverpool",
  MCI: "/assets/football/badges/man-city",
  MAN: "/assets/football/badges/man-city",
  MUN: "/assets/football/badges/man-united",
  NEW: "/assets/football/badges/newcastle",
  NFO: "/assets/football/badges/nottm-forest",
  SOU: "/assets/football/badges/southampton",
  TOT: "/assets/football/badges/tottenham",
  WHU: "/assets/football/badges/west-ham",
  WOL: "/assets/football/badges/wolves",
  SUN: "/assets/football/badges/sunderland",
  LEE: "/assets/football/badges/leeds",
  BUR: "/assets/football/badges/burnley",
};

interface NormalisedFixture {
  id: string;
  date: string;
  status: "scheduled" | "live" | "completed" | "postponed" | "cancelled";
  matchMinute?: string;
  venue?: string;
  home: {
    name: string;
    shortName: string;
    abbr: string;
    badge: string | null;
    espnLogo: string | null;
    score?: number;
  };
  away: {
    name: string;
    shortName: string;
    abbr: string;
    badge: string | null;
    espnLogo: string | null;
    score?: number;
  };
}

interface NormalisedFixtures {
  source: { provider: string };
  competition: string;
  updatedAt: string;
  fixtures: NormalisedFixture[];
  cache: { hit: boolean; stale: boolean };
}

interface CacheEntry {
  data: NormalisedFixtures;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function formatDateRange(daysAhead: number): string {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + daysAhead);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(now)}-${fmt(end)}`;
}

function mapStatus(espnStatus: string): NormalisedFixture["status"] {
  switch (espnStatus) {
    case "STATUS_SCHEDULED":
    case "STATUS_FIRST_HALF":
    case "STATUS_SECOND_HALF":
    case "STATUS_HALFTIME":
    case "STATUS_IN_PROGRESS":
      if (
        espnStatus === "STATUS_FIRST_HALF" ||
        espnStatus === "STATUS_SECOND_HALF" ||
        espnStatus === "STATUS_HALFTIME" ||
        espnStatus === "STATUS_IN_PROGRESS"
      )
        return "live";
      return "scheduled";
    case "STATUS_FULL_TIME":
    case "STATUS_FINAL":
    case "STATUS_FINAL_AET":
    case "STATUS_FINAL_PEN":
      return "completed";
    case "STATUS_POSTPONED":
      return "postponed";
    case "STATUS_CANCELLED":
    case "STATUS_ABANDONED":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function normaliseFixtures(
  raw: any,
  cacheInfo: { hit: boolean; stale: boolean }
): NormalisedFixtures {
  const events = raw.events || [];

  const fixtures: NormalisedFixture[] = events.map((event: any) => {
    const comp = event.competitions?.[0] || {};
    const competitors = comp.competitors || [];
    const homeTeam = competitors.find((c: any) => c.homeAway === "home") || competitors[0];
    const awayTeam = competitors.find((c: any) => c.homeAway === "away") || competitors[1];
    const statusType = event.status?.type?.name || "STATUS_SCHEDULED";
    const status = mapStatus(statusType);

    const mapTeam = (team: any) => {
      const t = team?.team || {};
      const abbr = (t.abbreviation || "").toUpperCase();
      return {
        name: t.displayName || t.name || "TBD",
        shortName: t.shortDisplayName || t.name || "TBD",
        abbr,
        badge: TEAM_BADGES[abbr] || null,
        espnLogo: t.logo || null,
        ...(status === "live" || status === "completed"
          ? { score: parseInt(team?.score || "0", 10) }
          : {}),
      };
    };

    return {
      id: event.id || event.uid || "",
      date: event.date || "",
      status,
      matchMinute:
        status === "live"
          ? event.status?.displayClock || event.status?.type?.detail || undefined
          : undefined,
      venue: comp.venue?.fullName || undefined,
      home: mapTeam(homeTeam),
      away: mapTeam(awayTeam),
    };
  });

  fixtures.sort(
    (a: NormalisedFixture, b: NormalisedFixture) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return {
    source: { provider: "ESPN" },
    competition: "Premier League",
    updatedAt: new Date().toISOString(),
    fixtures,
    cache: cacheInfo,
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

export async function getPremierLeagueFixtures(
  daysAhead: number = 30
): Promise<NormalisedFixtures> {
  const dateRange = formatDateRange(daysAhead);
  const cacheKey = dateRange;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data, cache: { hit: true, stale: false } };
  }

  try {
    const url = `${ESPN_SCOREBOARD_URL}?dates=${dateRange}`;
    const raw = await fetchJson(url);
    const normalised = normaliseFixtures(raw, { hit: false, stale: false });
    cache.set(cacheKey, { data: normalised, timestamp: Date.now() });

    if (cache.size > 10) {
      const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      while (cache.size > 5) {
        const oldest = entries.shift();
        if (oldest) cache.delete(oldest[0]);
      }
    }

    return normalised;
  } catch (err) {
    if (cached) {
      return { ...cached.data, cache: { hit: true, stale: true } };
    }
    throw err;
  }
}

export function createPremierLeagueFixturesHandler() {
  return async (req: Request, res: Response) => {
    try {
      const daysParam = req.query.days as string | undefined;
      const days = daysParam ? parseInt(daysParam, 10) : 30;

      if (isNaN(days) || days < 1 || days > 90) {
        return res.status(400).json({ error: "Invalid days parameter (1-90)" });
      }

      const data = await getPremierLeagueFixtures(days);
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json(data);
    } catch (err) {
      console.error("[PremierLeagueFixtures] Upstream fetch failed:", err);
      res.status(502).json({
        error: "Failed to fetch Premier League fixtures",
        message: "Upstream data source unavailable and no cached data available",
      });
    }
  };
}

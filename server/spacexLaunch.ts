import type { Request, Response } from "express";

const LL2_BASE_URL = "https://ll.thespacedevs.com/2.2.0";
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

function getConfig() {
  return {
    baseUrl: process.env.LL2_BASE_URL || LL2_BASE_URL,
    timeout: parseInt(process.env.SPACEX_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
    cacheTtl: parseInt(process.env.SPACEX_CACHE_TTL_MS || "", 10) || DEFAULT_CACHE_TTL,
  };
}

interface LaunchLinks {
  webcast: string | null;
  wikipedia: string | null;
  article: string | null;
  patchSmall: string | null;
  patchLarge: string | null;
}

interface NormalisedLaunch {
  id: string;
  name: string;
  net: string | null;
  upcoming: boolean;
  flightNumber: number | null;
  details: string | null;
  success: boolean | null;
  rocketId: string | null;
  launchpadId: string | null;
  rocketName: string | null;
  launchpadName: string | null;
  links: LaunchLinks;
  status: string | null;
  probability: number | null;
  missionType: string | null;
  orbit: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}

interface SpaceXPayload {
  source: { provider: string; documentedApi: boolean };
  updatedAt: string;
  launch: NormalisedLaunch | null;
  cache: { hit: boolean; stale: boolean };
}

interface CacheEntry {
  data: SpaceXPayload;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Launch Library 2 API returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normaliseLL2Launch(raw: any): NormalisedLaunch {
  const mission = raw?.mission;
  const pad = raw?.pad;
  const rocket = raw?.rocket?.configuration;

  let webcast: string | null = null;
  if (raw?.vidURLs && raw.vidURLs.length > 0) {
    webcast = raw.vidURLs[0]?.url || null;
  }

  let article: string | null = null;
  if (raw?.infoURLs && raw.infoURLs.length > 0) {
    article = raw.infoURLs[0]?.url || null;
  }

  let wikipedia: string | null = null;
  if (rocket?.wiki_url) {
    wikipedia = rocket.wiki_url;
  }

  let patchSmall: string | null = null;
  let patchLarge: string | null = null;
  if (raw?.mission_patches && raw.mission_patches.length > 0) {
    patchSmall = raw.mission_patches[0]?.image_url || null;
    patchLarge = patchSmall;
  } else if (raw?.image?.image_url) {
    patchSmall = raw.image.image_url;
    patchLarge = patchSmall;
  } else if (raw?.image) {
    patchSmall = typeof raw.image === "string" ? raw.image : null;
    patchLarge = patchSmall;
  }

  return {
    id: raw?.id?.toString() || "unknown",
    name: raw?.name || "Unknown Mission",
    net: raw?.net || null,
    upcoming: raw?.status?.id !== 3 && raw?.status?.id !== 4 && raw?.status?.id !== 7,
    flightNumber: null,
    details: mission?.description || raw?.status?.description || null,
    success: raw?.status?.id === 3 ? true : raw?.status?.id === 4 ? false : null,
    rocketId: rocket?.id?.toString() || null,
    launchpadId: pad?.id?.toString() || null,
    rocketName: rocket?.full_name || rocket?.name || null,
    launchpadName: pad?.name || pad?.location?.name || null,
    links: {
      webcast,
      wikipedia,
      article,
      patchSmall,
      patchLarge,
    },
    status: raw?.status?.name || raw?.status?.abbrev || null,
    probability: raw?.probability != null && raw.probability >= 0 ? raw.probability : null,
    missionType: mission?.type || null,
    orbit: mission?.orbit?.name || mission?.orbit?.abbrev || null,
    windowStart: raw?.window_start || null,
    windowEnd: raw?.window_end || null,
  };
}

function buildPayload(
  launch: NormalisedLaunch | null,
  cacheInfo: { hit: boolean; stale: boolean }
): SpaceXPayload {
  return {
    source: { provider: "Launch Library 2 (thespacedevs.com)", documentedApi: true },
    updatedAt: new Date().toISOString(),
    launch,
    cache: cacheInfo,
  };
}

export function clearSpaceXCache(): void {
  cache.clear();
}

export async function getNextSpaceXLaunch(): Promise<SpaceXPayload> {
  const cfg = getConfig();
  const cacheKey = "spacex-next-launch";
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp) < cfg.cacheTtl) {
    return { ...cached.data, cache: { hit: true, stale: false } };
  }

  try {
    const url = `${cfg.baseUrl}/launch/upcoming/?mode=detailed&lsp__name=SpaceX&limit=1&ordering=net`;
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);

    let launch: NormalisedLaunch | null = null;
    if (raw?.results && raw.results.length > 0) {
      launch = normaliseLL2Launch(raw.results[0]);
    }

    const payload = buildPayload(launch, { hit: false, stale: false });
    cache.set(cacheKey, { data: payload, timestamp: now });
    return payload;
  } catch (err) {
    if (cached) {
      return { ...cached.data, cache: { hit: true, stale: true } };
    }
    throw err;
  }
}

export function createNextSpaceXLaunchHandler() {
  return async (_req: Request, res: Response) => {
    try {
      const result = await getNextSpaceXLaunch();
      res.set("Cache-Control", "public, max-age=60");
      res.json(result);
    } catch (err: any) {
      res.status(502).json({
        error: err.message || "Failed to fetch SpaceX launch data",
      });
    }
  };
}

import type { Request, Response } from "express";

const DEFAULT_BASE_URL = "https://api.spacexdata.com/v4";
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_CACHE_TTL = 60 * 1000;

function getConfig() {
  return {
    baseUrl: process.env.SPACEX_BASE_URL || DEFAULT_BASE_URL,
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

function buildSpaceXUrl(path: string): string {
  const cfg = getConfig();
  return `${cfg.baseUrl}${path}`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`SpaceX API returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normaliseNextLaunch(raw: any): NormalisedLaunch {
  return {
    id: raw?.id || "unknown",
    name: raw?.name || "Unknown Mission",
    net: raw?.date_utc || raw?.date_local || null,
    upcoming: raw?.upcoming ?? true,
    flightNumber: raw?.flight_number ?? null,
    details: raw?.details || null,
    success: raw?.success ?? null,
    rocketId: raw?.rocket || null,
    launchpadId: raw?.launchpad || null,
    rocketName: null,
    launchpadName: null,
    links: {
      webcast: raw?.links?.webcast || null,
      wikipedia: raw?.links?.wikipedia || null,
      article: raw?.links?.article || null,
      patchSmall: raw?.links?.patch?.small || null,
      patchLarge: raw?.links?.patch?.large || null,
    },
  };
}

async function enrichLaunch(launch: NormalisedLaunch, timeoutMs: number): Promise<NormalisedLaunch> {
  const enriched = { ...launch };

  const promises: Promise<void>[] = [];

  if (launch.rocketId) {
    promises.push(
      fetchJsonWithTimeout(buildSpaceXUrl(`/rockets/${launch.rocketId}`), timeoutMs)
        .then((r) => { enriched.rocketName = r?.name || null; })
        .catch(() => {})
    );
  }

  if (launch.launchpadId) {
    promises.push(
      fetchJsonWithTimeout(buildSpaceXUrl(`/launchpads/${launch.launchpadId}`), timeoutMs)
        .then((p) => { enriched.launchpadName = p?.full_name || p?.name || null; })
        .catch(() => {})
    );
  }

  await Promise.all(promises);
  return enriched;
}

function normaliseSpaceXPayload(
  launch: NormalisedLaunch | null,
  cacheInfo: { hit: boolean; stale: boolean }
): SpaceXPayload {
  return {
    source: { provider: "SpaceX API", documentedApi: true },
    updatedAt: new Date().toISOString(),
    launch,
    cache: cacheInfo,
  };
}

function createCacheKey(): string {
  return "next-launch";
}

export function clearSpaceXCache(): void {
  cache.clear();
}

export async function getNextSpaceXLaunch(): Promise<SpaceXPayload> {
  const cfg = getConfig();
  const cacheKey = createCacheKey();
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp) < cfg.cacheTtl) {
    return { ...cached.data, cache: { hit: true, stale: false } };
  }

  try {
    const url = buildSpaceXUrl("/launches/next");
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);

    let launch = normaliseNextLaunch(raw);
    launch = await enrichLaunch(launch, cfg.timeout);

    const payload = normaliseSpaceXPayload(launch, { hit: false, stale: false });
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
      res.set("Cache-Control", "public, max-age=30");
      res.json(result);
    } catch (err: any) {
      res.status(502).json({
        error: err.message || "Failed to fetch SpaceX launch data",
      });
    }
  };
}

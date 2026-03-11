import type { Request, Response } from "express";

const DEFAULT_BASE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_CACHE_TTL = 60 * 1000;

function getConfig() {
  return {
    baseUrl: process.env.USGS_EARTHQUAKE_BASE_URL || DEFAULT_BASE_URL,
    timeout: parseInt(process.env.USGS_EARTHQUAKE_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
    cacheTtl: parseInt(process.env.USGS_EARTHQUAKE_CACHE_TTL_MS || "", 10) || DEFAULT_CACHE_TTL,
  };
}

const VALID_FEEDS = ["all_hour", "all_day", "significant_hour", "significant_day"] as const;
type FeedType = (typeof VALID_FEEDS)[number];

interface NormalisedEarthquake {
  id: string;
  place: string;
  magnitude: number | null;
  time: string | null;
  updated: string | null;
  url: string | null;
  longitude: number | null;
  latitude: number | null;
  depthKm: number | null;
  tsunami: boolean;
  feltReports: number | null;
  alert: string | null;
}

interface EarthquakesPayload {
  source: { provider: string; documentedApi: boolean };
  feed: string;
  updatedAt: string;
  earthquakes: NormalisedEarthquake[];
  cache: { hit: boolean; stale: boolean };
}

interface CacheEntry {
  data: EarthquakesPayload;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function buildUsgsFeedUrl(feed: FeedType): string {
  const cfg = getConfig();
  return `${cfg.baseUrl}/${feed}.geojson`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`USGS API returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Maps a single USGS GeoJSON feature into our normalised shape.
// USGS properties reference: https://earthquake.usgs.gov/data/comcat/data-eventterms.php
// - properties.time and properties.updated are epoch milliseconds
// - geometry.coordinates is [longitude, latitude, depth_km]
// - properties.mag can be null for unreviewed events
// - properties.place can be null for ocean events
function normaliseEarthquakeFeature(feature: any): NormalisedEarthquake {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates; // [lon, lat, depth]

  return {
    id: feature?.id?.toString() || `unknown-${Date.now()}`,
    place: props.place || "Unknown location",
    magnitude: typeof props.mag === "number" ? props.mag : null,
    time: typeof props.time === "number" ? new Date(props.time).toISOString() : null,
    updated: typeof props.updated === "number" ? new Date(props.updated).toISOString() : null,
    url: props.url || null,
    longitude: Array.isArray(coords) && typeof coords[0] === "number" ? coords[0] : null,
    latitude: Array.isArray(coords) && typeof coords[1] === "number" ? coords[1] : null,
    depthKm: Array.isArray(coords) && typeof coords[2] === "number" ? Math.round(coords[2] * 10) / 10 : null,
    tsunami: props.tsunami === 1 || props.tsunami === true,
    feltReports: typeof props.felt === "number" ? props.felt : null,
    alert: props.alert || null,
  };
}

function normaliseEarthquakesPayload(
  features: any[],
  feed: string,
  cacheInfo: { hit: boolean; stale: boolean }
): EarthquakesPayload {
  const earthquakes = (features || [])
    .map(normaliseEarthquakeFeature)
    .sort((a, b) => {
      const timeA = a.time ? new Date(a.time).getTime() : 0;
      const timeB = b.time ? new Date(b.time).getTime() : 0;
      return timeB - timeA;
    });

  return {
    source: { provider: "USGS", documentedApi: true },
    feed,
    updatedAt: new Date().toISOString(),
    earthquakes,
    cache: cacheInfo,
  };
}

function createCacheKey(feed: string): string {
  return `earthquakes-${feed}`;
}

export function clearEarthquakesCache(): void {
  cache.clear();
}

export async function getRecentEarthquakes(
  feed: FeedType = "all_hour",
  minMagnitude?: number,
  limit?: number
): Promise<EarthquakesPayload> {
  const cfg = getConfig();
  const cacheKey = createCacheKey(feed);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp) < cfg.cacheTtl) {
    let result = { ...cached.data, cache: { hit: true, stale: false } };
    result = applyFilters(result, minMagnitude, limit);
    return result;
  }

  try {
    const url = buildUsgsFeedUrl(feed);
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);

    const features = raw?.features || [];
    const payload = normaliseEarthquakesPayload(features, feed, { hit: false, stale: false });
    cache.set(cacheKey, { data: payload, timestamp: now });

    return applyFilters(payload, minMagnitude, limit);
  } catch (err) {
    if (cached) {
      let result = { ...cached.data, cache: { hit: true, stale: true } };
      result = applyFilters(result, minMagnitude, limit);
      return result;
    }
    throw err;
  }
}

function applyFilters(
  payload: EarthquakesPayload,
  minMagnitude?: number,
  limit?: number
): EarthquakesPayload {
  let earthquakes = [...payload.earthquakes];

  if (minMagnitude != null && !isNaN(minMagnitude)) {
    earthquakes = earthquakes.filter(
      (eq) => eq.magnitude != null && eq.magnitude >= minMagnitude
    );
  }

  if (limit != null && limit > 0) {
    earthquakes = earthquakes.slice(0, limit);
  }

  return { ...payload, earthquakes };
}

function parseFeed(raw: string | undefined): FeedType {
  if (raw && VALID_FEEDS.includes(raw as FeedType)) {
    return raw as FeedType;
  }
  return "all_hour";
}

export function createEarthquakesHandler() {
  return async (req: Request, res: Response) => {
    try {
      const feed = parseFeed(req.query.feed as string | undefined);
      let minMagnitude: number | undefined;
      if (req.query.minMagnitude) {
        const parsed = parseFloat(req.query.minMagnitude as string);
        if (isNaN(parsed) || parsed < 0 || parsed > 10) {
          res.status(400).json({ error: "minMagnitude must be between 0 and 10" });
          return;
        }
        minMagnitude = parsed;
      }
      let limit: number | undefined;
      if (req.query.limit) {
        const parsed = parseInt(req.query.limit as string, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 100) {
          res.status(400).json({ error: "limit must be between 1 and 100" });
          return;
        }
        limit = parsed;
      }

      const result = await getRecentEarthquakes(feed, minMagnitude, limit);
      res.set("Cache-Control", "public, max-age=30");
      res.json(result);
    } catch (err: any) {
      res.status(502).json({
        error: err.message || "Failed to fetch earthquake data",
      });
    }
  };
}

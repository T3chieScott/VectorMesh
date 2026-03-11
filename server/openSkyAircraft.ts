import type { Request, Response } from "express";

const DEFAULT_BASE_URL = "https://opensky-network.org/api";
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_CACHE_TTL = 15_000;

const DEFAULT_BOUNDS = {
  lamin: 51.2,
  lomin: -0.9,
  lamax: 51.8,
  lomax: 0.3,
};

function getConfig() {
  return {
    baseUrl: process.env.OPENSKY_BASE_URL || DEFAULT_BASE_URL,
    username: process.env.OPENSKY_USERNAME || "",
    password: process.env.OPENSKY_PASSWORD || "",
    timeout: parseInt(process.env.OPENSKY_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
    cacheTtl: parseInt(process.env.OPENSKY_CACHE_TTL_MS || "", 10) || DEFAULT_CACHE_TTL,
  };
}

interface NormalisedAircraft {
  id: string;
  icao24: string;
  callsign: string | null;
  originCountry: string;
  timePosition: number | null;
  lastContact: number | null;
  longitude: number | null;
  latitude: number | null;
  baroAltitude: number | null;
  onGround: boolean;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
  geoAltitude: number | null;
  squawk: string | null;
  spi: boolean;
  positionSource: number | null;
  category: number | null;
}

interface AircraftPayload {
  source: { provider: string; documentedApi: boolean };
  updatedAt: string;
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number };
  aircraft: NormalisedAircraft[];
  summary: { count: number; airborne: number; onGround: number };
  cache: { hit: boolean; stale: boolean };
}

interface CacheEntry {
  data: AircraftPayload;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function buildOpenSkyUrl(bounds: { lamin: number; lomin: number; lamax: number; lomax: number }): string {
  const cfg = getConfig();
  const url = new URL(`${cfg.baseUrl}/states/all`);
  url.searchParams.set("lamin", String(bounds.lamin));
  url.searchParams.set("lomin", String(bounds.lomin));
  url.searchParams.set("lamax", String(bounds.lamax));
  url.searchParams.set("lomax", String(bounds.lomax));
  return url.toString();
}

function buildOpenSkyHeaders(): Record<string, string> {
  const cfg = getConfig();
  const headers: Record<string, string> = {
    "Accept": "application/json",
  };
  if (cfg.username && cfg.password) {
    const encoded = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }
  return headers;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: buildOpenSkyHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenSky API returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// OpenSky state vector array indices:
// 0  = icao24 (string)
// 1  = callsign (string, may have trailing spaces)
// 2  = origin_country (string)
// 3  = time_position (int, unix seconds)
// 4  = last_contact (int, unix seconds)
// 5  = longitude (float)
// 6  = latitude (float)
// 7  = baro_altitude (float, meters)
// 8  = on_ground (boolean)
// 9  = velocity (float, m/s)
// 10 = true_track (float, degrees clockwise from north)
// 11 = vertical_rate (float, m/s)
// 12 = sensors (array of int)
// 13 = geo_altitude (float, meters)
// 14 = squawk (string)
// 15 = spi (boolean)
// 16 = position_source (int: 0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM)
// 17 = category (int, only with extended=1)
function normaliseAircraftState(state: any[]): NormalisedAircraft | null {
  if (!Array.isArray(state) || state.length < 17) return null;

  const icao24 = typeof state[0] === "string" ? state[0] : null;
  if (!icao24) return null;

  return {
    id: icao24,
    icao24,
    callsign: typeof state[1] === "string" ? state[1].trim() || null : null,
    originCountry: typeof state[2] === "string" ? state[2] : "Unknown",
    timePosition: typeof state[3] === "number" ? state[3] : null,
    lastContact: typeof state[4] === "number" ? state[4] : null,
    longitude: typeof state[5] === "number" ? state[5] : null,
    latitude: typeof state[6] === "number" ? state[6] : null,
    baroAltitude: typeof state[7] === "number" ? Math.round(state[7]) : null,
    onGround: state[8] === true,
    velocity: typeof state[9] === "number" ? Math.round(state[9] * 10) / 10 : null,
    heading: typeof state[10] === "number" ? Math.round(state[10] * 10) / 10 : null,
    verticalRate: typeof state[11] === "number" ? Math.round(state[11] * 10) / 10 : null,
    geoAltitude: typeof state[13] === "number" ? Math.round(state[13]) : null,
    squawk: typeof state[14] === "string" ? state[14] : null,
    spi: state[15] === true,
    positionSource: typeof state[16] === "number" ? state[16] : null,
    category: state.length > 17 && typeof state[17] === "number" ? state[17] : null,
  };
}

function normaliseAircraftPayload(
  raw: any,
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number },
  cacheInfo: { hit: boolean; stale: boolean }
): AircraftPayload {
  const states: any[][] = Array.isArray(raw?.states) ? raw.states : [];

  const aircraft = states
    .map(normaliseAircraftState)
    .filter((a): a is NormalisedAircraft => a !== null);

  const airborne = aircraft.filter(a => !a.onGround).length;

  return {
    source: { provider: "OpenSky Network", documentedApi: true },
    updatedAt: new Date().toISOString(),
    bounds,
    aircraft,
    summary: {
      count: aircraft.length,
      airborne,
      onGround: aircraft.length - airborne,
    },
    cache: cacheInfo,
  };
}

function createCacheKey(bounds: { lamin: number; lomin: number; lamax: number; lomax: number }): string {
  return `aircraft-${bounds.lamin}-${bounds.lomin}-${bounds.lamax}-${bounds.lomax}`;
}

export function clearOpenSkyCache(): void {
  cache.clear();
}

export async function getAircraftOverhead(
  bounds?: { lamin: number; lomin: number; lamax: number; lomax: number },
  limit?: number
): Promise<AircraftPayload> {
  const cfg = getConfig();
  const effectiveBounds = bounds || DEFAULT_BOUNDS;
  const cacheKey = createCacheKey(effectiveBounds);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp) < cfg.cacheTtl) {
    let result = { ...cached.data, cache: { hit: true, stale: false } };
    if (limit && limit > 0) {
      result = { ...result, aircraft: result.aircraft.slice(0, limit) };
      result.summary = {
        count: result.aircraft.length,
        airborne: result.aircraft.filter(a => !a.onGround).length,
        onGround: result.aircraft.filter(a => a.onGround).length,
      };
    }
    return result;
  }

  try {
    const url = buildOpenSkyUrl(effectiveBounds);
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);
    const payload = normaliseAircraftPayload(raw, effectiveBounds, { hit: false, stale: false });
    cache.set(cacheKey, { data: payload, timestamp: now });

    if (limit && limit > 0) {
      const limited = { ...payload, aircraft: payload.aircraft.slice(0, limit) };
      limited.summary = {
        count: limited.aircraft.length,
        airborne: limited.aircraft.filter(a => !a.onGround).length,
        onGround: limited.aircraft.filter(a => a.onGround).length,
      };
      return limited;
    }

    return payload;
  } catch (err) {
    if (cached) {
      let result = { ...cached.data, cache: { hit: true, stale: true } };
      if (limit && limit > 0) {
        result = { ...result, aircraft: result.aircraft.slice(0, limit) };
        result.summary = {
          count: result.aircraft.length,
          airborne: result.aircraft.filter(a => !a.onGround).length,
          onGround: result.aircraft.filter(a => a.onGround).length,
        };
      }
      return result;
    }
    throw err;
  }
}

function parseOptionalFloat(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? undefined : parsed;
}

export function createAircraftOverheadHandler() {
  return async (req: Request, res: Response) => {
    try {
      const lamin = parseOptionalFloat(req.query.lamin as string);
      const lomin = parseOptionalFloat(req.query.lomin as string);
      const lamax = parseOptionalFloat(req.query.lamax as string);
      const lomax = parseOptionalFloat(req.query.lomax as string);

      let bounds: { lamin: number; lomin: number; lamax: number; lomax: number } | undefined;
      if (lamin !== undefined && lomin !== undefined && lamax !== undefined && lomax !== undefined) {
        if (lamin < -90 || lamin > 90 || lamax < -90 || lamax > 90) {
          res.status(400).json({ error: "Latitude bounds must be between -90 and 90" });
          return;
        }
        if (lomin < -180 || lomin > 180 || lomax < -180 || lomax > 180) {
          res.status(400).json({ error: "Longitude bounds must be between -180 and 180" });
          return;
        }
        bounds = { lamin, lomin, lamax, lomax };
      }

      let limit: number | undefined;
      if (req.query.limit) {
        const parsed = parseInt(req.query.limit as string, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 500) {
          res.status(400).json({ error: "limit must be between 1 and 500" });
          return;
        }
        limit = parsed;
      }

      const result = await getAircraftOverhead(bounds, limit);
      res.set("Cache-Control", "public, max-age=10");
      res.json(result);
    } catch (err: any) {
      res.status(502).json({
        error: err.message || "Failed to fetch aircraft data",
      });
    }
  };
}

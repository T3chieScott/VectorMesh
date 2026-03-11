import type { Request, Response } from "express";

const DEFAULT_BASE_URL = "https://opensky-network.org/api";
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_CACHE_TTL = 15_000;
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const TOKEN_REFRESH_MARGIN = 30;

const DEFAULT_BOUNDS = {
  lamin: 51.2,
  lomin: -0.9,
  lamax: 51.8,
  lomax: 0.3,
};

function getConfig() {
  return {
    baseUrl: process.env.OPENSKY_BASE_URL || DEFAULT_BASE_URL,
    clientId: process.env.OPENSKY_CLIENT_ID || "",
    clientSecret: process.env.OPENSKY_CLIENT_SECRET || "",
    timeout: parseInt(process.env.OPENSKY_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
    cacheTtl: parseInt(process.env.OPENSKY_CACHE_TTL_MS || "", 10) || DEFAULT_CACHE_TTL,
  };
}

let oauthToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getAccessToken(): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.clientId || !cfg.clientSecret) return null;

  const now = Date.now();
  if (oauthToken && now < tokenExpiresAt) return oauthToken;

  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.error(`[OpenSky] Token request failed: ${response.status} ${response.statusText}`);
      return oauthToken;
    }

    const data = await response.json() as { access_token: string; expires_in?: number };
    oauthToken = data.access_token;
    const expiresIn = data.expires_in || 1800;
    tokenExpiresAt = now + (expiresIn - TOKEN_REFRESH_MARGIN) * 1000;
    console.log(`[OpenSky] OAuth2 token obtained, expires in ${expiresIn}s`);
    return oauthToken;
  } catch (err: any) {
    console.error(`[OpenSky] Failed to obtain OAuth2 token: ${err.message}`);
    return oauthToken;
  }
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

async function buildOpenSkyHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
  };
  const token = await getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = await buildOpenSkyHeaders();
    const response = await fetch(url, {
      headers,
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

function createEmptyPayload(
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number }
): AircraftPayload {
  return {
    source: { provider: "OpenSky Network", documentedApi: true },
    updatedAt: new Date().toISOString(),
    bounds,
    aircraft: [],
    summary: { count: 0, airborne: 0, onGround: 0 },
    cache: { hit: false, stale: false },
  };
}

function createCacheKey(bounds: { lamin: number; lomin: number; lamax: number; lomax: number }): string {
  return `aircraft-${bounds.lamin}-${bounds.lomin}-${bounds.lamax}-${bounds.lomax}`;
}

export function clearOpenSkyCache(): void {
  cache.clear();
}

function applyLimit(payload: AircraftPayload, limit?: number): AircraftPayload {
  if (!limit || limit <= 0 || payload.aircraft.length <= limit) return payload;
  const sliced = payload.aircraft.slice(0, limit);
  return {
    ...payload,
    aircraft: sliced,
    summary: {
      count: sliced.length,
      airborne: sliced.filter(a => !a.onGround).length,
      onGround: sliced.filter(a => a.onGround).length,
    },
  };
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
    return applyLimit({ ...cached.data, cache: { hit: true, stale: false } }, limit);
  }

  try {
    const url = buildOpenSkyUrl(effectiveBounds);
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);
    const payload = normaliseAircraftPayload(raw, effectiveBounds, { hit: false, stale: false });
    cache.set(cacheKey, { data: payload, timestamp: now });
    return applyLimit(payload, limit);
  } catch (err: any) {
    console.error(`[OpenSky] API fetch failed: ${err.message}`);

    if (cached) {
      return applyLimit({ ...cached.data, cache: { hit: true, stale: true } }, limit);
    }

    return createEmptyPayload(effectiveBounds);
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
      console.error(`[OpenSky] Handler error: ${err.message}`);
      res.status(502).json({
        error: err.message || "Failed to fetch aircraft data",
      });
    }
  };
}

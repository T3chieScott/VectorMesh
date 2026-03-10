import type { Request, Response } from "express";

// ============ AeroDataBox Configuration ============
// Set these in Replit Secrets (or environment variables on the remote server):
//   AERODATABOX_RAPIDAPI_KEY   — Required. Your RapidAPI key for AeroDataBox.
//   AERODATABOX_RAPIDAPI_HOST  — Optional. Defaults to "aerodatabox.p.rapidapi.com".
//   AERODATABOX_BASE_URL       — Optional. Defaults to "https://aerodatabox.p.rapidapi.com".
//   AERODATABOX_TIMEOUT_MS     — Optional. Fetch timeout in ms (default 10000).

const AIRPORT_IATA = "LHR";
const CACHE_TTL = 2 * 60 * 1000;
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_LIMIT = 50;
// Default FIDS-style time window: 2 hours before now to 10 hours ahead (max 12h total for AeroDataBox)
const DEFAULT_WINDOW_BACK_HOURS = 2;
const DEFAULT_WINDOW_AHEAD_HOURS = 10;

function getConfig() {
  return {
    baseUrl: process.env.AERODATABOX_BASE_URL || "https://aerodatabox.p.rapidapi.com",
    rapidApiKey: process.env.AERODATABOX_RAPIDAPI_KEY || "",
    rapidApiHost: process.env.AERODATABOX_RAPIDAPI_HOST || "aerodatabox.p.rapidapi.com",
    timeout: parseInt(process.env.AERODATABOX_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
  };
}

function credentialsPresent(): boolean {
  const cfg = getConfig();
  return !!cfg.rapidApiKey;
}

// ============ Types ============

interface FlightStatus {
  code: string;
  label: string;
}

interface FlightAirport {
  code: string;
  name: string;
}

interface FlightAirline {
  name: string;
  code: string;
  logo: string | null;
}

interface NormalisedFlight {
  id: string;
  flightNumber: string;
  iata: string;
  icao: string | null;
  direction: "arrival" | "departure";
  airline: FlightAirline;
  terminal: string | null;
  gate: string | null;
  belt: string | null;
  origin: FlightAirport;
  destination: FlightAirport;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
  status: FlightStatus;
  rawStatus: string | null;
  remarks: string | null;
}

interface NormalisedFlightsPayload {
  source: {
    provider: string;
    documentedApi: boolean;
  };
  direction: "arrival" | "departure";
  airport: string;
  updatedAt: string;
  filters: {
    terminal: string | null;
    airline: string | null;
    date: string | null;
  };
  flights: NormalisedFlight[];
  cache: {
    hit: boolean;
    stale: boolean;
  };
}

interface CacheEntry {
  data: NormalisedFlightsPayload;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// ============ Status Normalisation ============
// AeroDataBox returns status strings like "Expected", "Departed", "Landed", "Canceled", etc.
// Map them to our consistent internal codes.
const STATUS_MAP: Record<string, FlightStatus> = {
  "scheduled": { code: "scheduled", label: "Scheduled" },
  "on time": { code: "scheduled", label: "On Time" },
  "expected": { code: "scheduled", label: "Expected" },
  "en route": { code: "departed", label: "En Route" },
  "boarding": { code: "boarding", label: "Boarding" },
  "gate open": { code: "gate-open", label: "Gate Open" },
  "gate-open": { code: "gate-open", label: "Gate Open" },
  "gateopen": { code: "gate-open", label: "Gate Open" },
  "final call": { code: "final-call", label: "Final Call" },
  "final-call": { code: "final-call", label: "Final Call" },
  "last call": { code: "final-call", label: "Final Call" },
  "departed": { code: "departed", label: "Departed" },
  "in flight": { code: "departed", label: "In Flight" },
  "airborne": { code: "departed", label: "Airborne" },
  "arrived": { code: "arrived", label: "Arrived" },
  "landed": { code: "arrived", label: "Landed" },
  "delayed": { code: "delayed", label: "Delayed" },
  "cancelled": { code: "cancelled", label: "Cancelled" },
  "canceled": { code: "cancelled", label: "Cancelled" },
  "diverted": { code: "diverted", label: "Diverted" },
  "unknown": { code: "unknown", label: "Unknown" },
};

function normaliseStatus(rawStatus: string | null | undefined): FlightStatus {
  if (!rawStatus) return { code: "unknown", label: "Unknown" };
  const key = rawStatus.trim().toLowerCase();
  return STATUS_MAP[key] || { code: "unknown", label: rawStatus.trim() };
}

function safeString(val: unknown): string | null {
  if (val === undefined || val === null || val === "") return null;
  return String(val);
}

// ============ AeroDataBox Request Building ============

function buildAeroDataBoxHeaders(): Record<string, string> {
  const cfg = getConfig();
  return {
    "x-rapidapi-key": cfg.rapidApiKey,
    "x-rapidapi-host": cfg.rapidApiHost,
    "Accept": "application/json",
  };
}

// AeroDataBox airport flights endpoint:
// GET /flights/airports/iata/{code}/{fromLocal}/{toLocal}
// Times are local airport times in ISO 8601 format (YYYY-MM-DDTHH:mm)
// Params: direction=Arrival|Departure, withCancelled=true, withCodeshared=true, withPrivate=false, withCargo=false
function buildAirportFlightsUrl(
  direction: "arrival" | "departure",
  fromLocal: string,
  toLocal: string
): string {
  const cfg = getConfig();
  const dirParam = direction === "arrival" ? "Arrival" : "Departure";
  const base = `${cfg.baseUrl}/flights/airports/iata/${AIRPORT_IATA}/${fromLocal}/${toLocal}`;
  const url = new URL(base);
  url.searchParams.set("direction", dirParam);
  url.searchParams.set("withCancelled", "true");
  url.searchParams.set("withCodeshared", "false");
  url.searchParams.set("withPrivate", "false");
  url.searchParams.set("withCargo", "false");
  return url.toString();
}

function buildDefaultTimeWindow(): { fromLocal: string; toLocal: string } {
  const now = new Date();
  const from = new Date(now.getTime() - DEFAULT_WINDOW_BACK_HOURS * 60 * 60 * 1000);
  const to = new Date(now.getTime() + DEFAULT_WINDOW_AHEAD_HOURS * 60 * 60 * 1000);
  return {
    fromLocal: from.toISOString().slice(0, 16),
    toLocal: to.toISOString().slice(0, 16),
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: buildAeroDataBoxHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AeroDataBox API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ============ AeroDataBox Flight Normalisation ============
// AeroDataBox flight record shape (actual observed structure):
//   number: "MS 779"
//   callSign: "MSR779"
//   status: "Arrived" | "Expected" | "Departed" | "Canceled" | ...
//   airline: { name: "EgyptAir", iata: "MS", icao: "MSR" }
//   movement: {
//     airport: { iata: "CAI", name: "Cairo", icao: "HECA" },
//     scheduledTime: { utc: "2026-03-10 21:00Z", local: "2026-03-10 21:00+00:00" },
//     revisedTime: { utc: "...", local: "..." },
//     runwayTime: { utc: "...", local: "..." },
//     terminal: "2",
//     gate: "A10",
//     baggageBelt: "8"
//   }
//
// The "movement" object represents the remote airport and LHR-side details:
// - For arrivals: movement.airport = origin, terminal/belt = LHR arrival info
// - For departures: movement.airport = destination, terminal/gate = LHR departure info
//
// Important mapping notes:
// - "revisedTime" is the estimated/revised time (not "estimatedTime" or "actualTimeUtc")
// - "runwayTime" is the actual touchdown/takeoff time when available
// - If revisedTime differs from scheduledTime, it indicates a delay or update
// - Adjust field names here if AeroDataBox changes their payload schema

function extractTimeUtc(timeObj: any): string | null {
  if (!timeObj) return null;
  if (typeof timeObj === "string") return timeObj;
  return safeString(timeObj.utc) || safeString(timeObj.local) || null;
}

function normaliseAeroDataBoxFlight(raw: any, direction: "arrival" | "departure"): NormalisedFlight {
  const flightNumber = safeString(raw.number)?.replace(/\s/g, "") || "Unknown";
  const airlineIata = safeString(raw.airline?.iata) || flightNumber.replace(/\d+/g, "") || "";
  const airlineName = safeString(raw.airline?.name) || airlineIata;

  // AeroDataBox uses a single "movement" object for the remote airport and LHR-side info
  const mov = raw.movement || {};
  const remoteAirport = mov.airport || {};

  // For arrivals: movement.airport is the origin (where the flight came from)
  // For departures: movement.airport is the destination (where the flight is going)
  const originCode = direction === "arrival"
    ? (safeString(remoteAirport.iata) || "")
    : AIRPORT_IATA;
  const originName = direction === "arrival"
    ? (safeString(remoteAirport.name) || originCode)
    : "London Heathrow";

  const destCode = direction === "departure"
    ? (safeString(remoteAirport.iata) || "")
    : AIRPORT_IATA;
  const destName = direction === "departure"
    ? (safeString(remoteAirport.name) || destCode)
    : "London Heathrow";

  const scheduledTime = extractTimeUtc(mov.scheduledTime);
  // revisedTime is AeroDataBox's estimated/updated time field
  const revisedTime = extractTimeUtc(mov.revisedTime);
  // runwayTime is the actual touchdown/takeoff time
  const actualTime = extractTimeUtc(mov.runwayTime);
  // Only show estimatedTime if it differs from scheduled
  const estimatedTime = revisedTime && revisedTime !== scheduledTime ? revisedTime : null;

  const terminal = safeString(mov.terminal);
  const gate = safeString(mov.gate);
  const belt = safeString(mov.baggageBelt);

  const rawStatus = safeString(raw.status);

  return {
    id: `${flightNumber}-${scheduledTime || Date.now()}`,
    flightNumber,
    iata: flightNumber,
    icao: safeString(raw.callSign) || null,
    direction,
    airline: {
      name: airlineName,
      code: airlineIata,
      logo: null,
    },
    terminal,
    gate,
    belt,
    origin: { code: originCode, name: originName },
    destination: { code: destCode, name: destName },
    scheduledTime,
    estimatedTime,
    actualTime,
    status: normaliseStatus(rawStatus),
    rawStatus,
    remarks: null,
  };
}

function normaliseFlightsPayload(
  raw: any,
  direction: "arrival" | "departure",
  filters: { terminal: string | null; airline: string | null; date: string | null },
  cacheInfo: { hit: boolean; stale: boolean }
): NormalisedFlightsPayload {
  // AeroDataBox returns: { departures: [...] } or { arrivals: [...] }
  // Also handle array root or other shapes defensively
  const flightsArray: any[] =
    Array.isArray(raw) ? raw :
    Array.isArray(raw.departures) ? raw.departures :
    Array.isArray(raw.arrivals) ? raw.arrivals :
    Array.isArray(raw.flights) ? raw.flights :
    Array.isArray(raw.data) ? raw.data :
    [];

  const flights = flightsArray
    .map((f: any) => {
      try {
        return normaliseAeroDataBoxFlight(f, direction);
      } catch {
        return null;
      }
    })
    .filter((f): f is NormalisedFlight => f !== null);

  flights.sort((a, b) => {
    if (!a.scheduledTime) return 1;
    if (!b.scheduledTime) return -1;
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  return {
    source: {
      provider: "AeroDataBox",
      documentedApi: true,
    },
    direction,
    airport: AIRPORT_IATA,
    updatedAt: new Date().toISOString(),
    filters,
    flights,
    cache: cacheInfo,
  };
}

// ============ Filtering ============

function applyFlightFilters(
  payload: NormalisedFlightsPayload,
  params: { terminal?: string; airline?: string; flight?: string; limit?: number }
): NormalisedFlightsPayload {
  let flights = [...payload.flights];

  if (params.terminal) {
    const term = params.terminal.toUpperCase().replace(/^T/, "");
    flights = flights.filter(f =>
      f.terminal && f.terminal.toUpperCase().replace(/^T/, "") === term
    );
  }
  if (params.airline) {
    const al = params.airline.toUpperCase();
    flights = flights.filter(f =>
      f.airline.code.toUpperCase() === al ||
      f.airline.name.toUpperCase().includes(al)
    );
  }
  if (params.flight) {
    const fl = params.flight.toUpperCase().replace(/\s/g, "");
    flights = flights.filter(f =>
      f.flightNumber.toUpperCase().replace(/\s/g, "").includes(fl) ||
      f.iata.toUpperCase().replace(/\s/g, "").includes(fl)
    );
  }

  const limit = params.limit || DEFAULT_LIMIT;
  flights = flights.slice(0, limit);

  return { ...payload, flights };
}

// ============ Cache ============

function createCacheKey(direction: "arrival" | "departure", fromLocal: string): string {
  return `${direction}:${fromLocal}`;
}

// ============ Core Fetch ============

async function fetchHeathrowFlights(
  direction: "arrival" | "departure",
  params: { terminal?: string; airline?: string; date?: string; from?: string; to?: string }
): Promise<NormalisedFlightsPayload> {
  let fromLocal: string;
  let toLocal: string;

  if (params.from && params.to) {
    fromLocal = params.from;
    toLocal = params.to;
  } else {
    const window = buildDefaultTimeWindow();
    fromLocal = window.fromLocal;
    toLocal = window.toLocal;
  }

  const dateKey = params.date || fromLocal.slice(0, 10);
  const cacheKey = createCacheKey(direction, fromLocal);

  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return {
      ...cached.data,
      cache: { hit: true, stale: false },
    };
  }

  if (!credentialsPresent()) {
    if (cached) {
      return {
        ...cached.data,
        cache: { hit: true, stale: true },
      };
    }
    throw new Error("AeroDataBox credentials not configured. Set AERODATABOX_RAPIDAPI_KEY in environment variables.");
  }

  try {
    const cfg = getConfig();
    const url = buildAirportFlightsUrl(direction, fromLocal, toLocal);
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);

    const filters = {
      terminal: params.terminal || null,
      airline: params.airline || null,
      date: dateKey,
    };

    const normalised = normaliseFlightsPayload(raw, direction, filters, { hit: false, stale: false });

    cache.set(cacheKey, {
      data: normalised,
      timestamp: now,
    });

    return normalised;
  } catch (err) {
    if (cached) {
      return {
        ...cached.data,
        cache: { hit: true, stale: true },
      };
    }
    throw err;
  }
}

// ============ Public API ============

export async function getHeathrowArrivals(params: {
  terminal?: string;
  airline?: string;
  flight?: string;
  date?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<NormalisedFlightsPayload> {
  const raw = await fetchHeathrowFlights("arrival", params);
  return applyFlightFilters(raw, params);
}

export async function getHeathrowDepartures(params: {
  terminal?: string;
  airline?: string;
  flight?: string;
  date?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<NormalisedFlightsPayload> {
  const raw = await fetchHeathrowFlights("departure", params);
  return applyFlightFilters(raw, params);
}

export async function searchHeathrowFlights(flightNumber: string): Promise<NormalisedFlightsPayload> {
  const arrivals = await getHeathrowArrivals({ flight: flightNumber });
  const departures = await getHeathrowDepartures({ flight: flightNumber });
  return {
    ...arrivals,
    direction: "arrival",
    flights: [...arrivals.flights, ...departures.flights],
  };
}

export function clearHeathrowFlightsCache(): void {
  cache.clear();
}

// ============ Route Handlers ============

function parseQueryParams(query: any): {
  terminal?: string;
  airline?: string;
  flight?: string;
  date?: string;
  from?: string;
  to?: string;
  limit?: number;
  error?: string;
} {
  const terminal = query.terminal ? String(query.terminal) : undefined;
  const airline = query.airline ? String(query.airline) : undefined;
  const flight = query.flight ? String(query.flight) : undefined;
  const date = query.date ? String(query.date) : undefined;
  const from = query.from ? String(query.from) : undefined;
  const to = query.to ? String(query.to) : undefined;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Invalid date format. Use YYYY-MM-DD." };
  }

  let limit: number | undefined;
  if (query.limit) {
    limit = parseInt(String(query.limit), 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
      return { error: "Limit must be between 1 and 200." };
    }
  }

  return { terminal, airline, flight, date, from, to, limit };
}

export function createHeathrowArrivalsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const params = parseQueryParams(req.query);
      if (params.error) {
        res.status(400).json({ error: params.error, flights: [] });
        return;
      }
      const result = await getHeathrowArrivals(params);
      res.set("Cache-Control", "public, max-age=60");
      res.json(result);
    } catch (err: any) {
      const status = err.message?.includes("credentials") ? 503 : 502;
      res.status(status).json({
        error: err.message || "Failed to fetch Heathrow arrivals",
        flights: [],
      });
    }
  };
}

export function createHeathrowDeparturesHandler() {
  return async (req: Request, res: Response) => {
    try {
      const params = parseQueryParams(req.query);
      if (params.error) {
        res.status(400).json({ error: params.error, flights: [] });
        return;
      }
      const result = await getHeathrowDepartures(params);
      res.set("Cache-Control", "public, max-age=60");
      res.json(result);
    } catch (err: any) {
      const status = err.message?.includes("credentials") ? 503 : 502;
      res.status(status).json({
        error: err.message || "Failed to fetch Heathrow departures",
        flights: [],
      });
    }
  };
}

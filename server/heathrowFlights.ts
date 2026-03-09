import type { Request, Response } from "express";

// Heathrow API configuration — set these in Replit Secrets
// HEATHROW_API_BASE_URL: Base URL for Heathrow flights API (e.g. https://api-dp-prod.dp.heathrow.com)
// HEATHROW_API_KEY: API key from Heathrow Developer Portal
// HEATHROW_API_SUBSCRIPTION_KEY: Subscription key (Ocp-Apim-Subscription-Key header)
// HEATHROW_API_TIMEOUT_MS: Fetch timeout in ms (optional, default 10000)

const CACHE_TTL = 2 * 60 * 1000;
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_LIMIT = 50;

function getConfig() {
  return {
    baseUrl: process.env.HEATHROW_API_BASE_URL || "",
    apiKey: process.env.HEATHROW_API_KEY || "",
    subscriptionKey: process.env.HEATHROW_API_SUBSCRIPTION_KEY || "",
    timeout: parseInt(process.env.HEATHROW_API_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
  };
}

function credentialsPresent(): boolean {
  const cfg = getConfig();
  return !!(cfg.baseUrl && (cfg.apiKey || cfg.subscriptionKey));
}

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

// Status normalisation mapping
// Adjust these mappings if Heathrow returns different status strings
const STATUS_MAP: Record<string, FlightStatus> = {
  "scheduled": { code: "scheduled", label: "Scheduled" },
  "on time": { code: "scheduled", label: "On Time" },
  "boarding": { code: "boarding", label: "Boarding" },
  "gate open": { code: "gate-open", label: "Gate Open" },
  "gate-open": { code: "gate-open", label: "Gate Open" },
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
  "expected": { code: "scheduled", label: "Expected" },
  "estimatedtime": { code: "scheduled", label: "Estimated" },
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

function buildHeathrowHeaders(): Record<string, string> {
  const cfg = getConfig();
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "VectorMesh/1.0",
  };
  if (cfg.apiKey) {
    headers["x-api-key"] = cfg.apiKey;
  }
  if (cfg.subscriptionKey) {
    headers["Ocp-Apim-Subscription-Key"] = cfg.subscriptionKey;
  }
  return headers;
}

function buildHeathrowRequestUrl(
  direction: "arrival" | "departure",
  params: { terminal?: string; airline?: string; date?: string }
): string {
  const cfg = getConfig();
  // Heathrow API endpoint pattern — adjust path if the actual API differs
  // Common patterns: /flights/arrivals, /flights/departures, /api/flights
  const directionPath = direction === "arrival" ? "arrivals" : "departures";
  const url = new URL(`${cfg.baseUrl}/flights/${directionPath}`);

  if (params.date) {
    url.searchParams.set("date", params.date);
  }
  if (params.terminal) {
    url.searchParams.set("terminal", params.terminal);
  }
  if (params.airline) {
    url.searchParams.set("airline", params.airline);
  }

  return url.toString();
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: buildHeathrowHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Heathrow API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Normalise a single flight record from upstream payload
// Adjust field mappings here if the Heathrow API returns different field names
function normaliseFlightRecord(raw: any, direction: "arrival" | "departure"): NormalisedFlight {
  const flightNumber = safeString(raw.flightNumber) || safeString(raw.flight) || safeString(raw.iata) || "Unknown";
  const airlineCode = safeString(raw.airlineCode) || safeString(raw.airline?.code) || flightNumber.replace(/\d+/g, "") || "";
  const airlineName = safeString(raw.airlineName) || safeString(raw.airline?.name) || safeString(raw.carrier) || airlineCode;

  const originCode = direction === "arrival"
    ? (safeString(raw.originCode) || safeString(raw.origin?.code) || safeString(raw.from) || "")
    : "LHR";
  const originName = direction === "arrival"
    ? (safeString(raw.originName) || safeString(raw.origin?.name) || safeString(raw.originAirport) || originCode)
    : "London Heathrow";

  const destCode = direction === "departure"
    ? (safeString(raw.destinationCode) || safeString(raw.destination?.code) || safeString(raw.to) || "")
    : "LHR";
  const destName = direction === "departure"
    ? (safeString(raw.destinationName) || safeString(raw.destination?.name) || safeString(raw.destinationAirport) || destCode)
    : "London Heathrow";

  return {
    id: safeString(raw.id) || safeString(raw.flightId) || `${flightNumber}-${raw.scheduledTime || Date.now()}`,
    flightNumber,
    iata: safeString(raw.iata) || flightNumber,
    icao: safeString(raw.icao) || null,
    direction,
    airline: {
      name: airlineName,
      code: airlineCode,
      logo: safeString(raw.airlineLogo) || safeString(raw.airline?.logo) || null,
    },
    terminal: safeString(raw.terminal),
    gate: safeString(raw.gate) || safeString(raw.stand),
    belt: safeString(raw.belt) || safeString(raw.carousel) || safeString(raw.baggageBelt),
    origin: { code: originCode, name: originName },
    destination: { code: destCode, name: destName },
    scheduledTime: safeString(raw.scheduledTime) || safeString(raw.scheduled) || safeString(raw.scheduledDateTime),
    estimatedTime: safeString(raw.estimatedTime) || safeString(raw.estimated) || safeString(raw.estimatedDateTime),
    actualTime: safeString(raw.actualTime) || safeString(raw.actual) || safeString(raw.actualDateTime),
    status: normaliseStatus(raw.status || raw.flightStatus),
    rawStatus: safeString(raw.status) || safeString(raw.flightStatus),
    remarks: safeString(raw.remarks) || safeString(raw.comment),
  };
}

function normaliseFlightsPayload(
  raw: any,
  direction: "arrival" | "departure",
  filters: { terminal: string | null; airline: string | null; date: string | null },
  cacheInfo: { hit: boolean; stale: boolean }
): NormalisedFlightsPayload {
  // Adapt to actual Heathrow payload shape — look for flights array at these common paths
  const flightsArray: any[] =
    Array.isArray(raw) ? raw :
    Array.isArray(raw.flights) ? raw.flights :
    Array.isArray(raw.flightList) ? raw.flightList :
    Array.isArray(raw.data) ? raw.data :
    Array.isArray(raw.results) ? raw.results :
    [];

  const flights = flightsArray.map((f: any) => normaliseFlightRecord(f, direction));

  // Sort by scheduled time
  flights.sort((a, b) => {
    if (!a.scheduledTime) return 1;
    if (!b.scheduledTime) return -1;
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  return {
    source: {
      provider: "Heathrow Flights API",
      documentedApi: true,
    },
    direction,
    airport: "LHR",
    updatedAt: new Date().toISOString(),
    filters,
    flights,
    cache: cacheInfo,
  };
}

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

function createCacheKey(direction: "arrival" | "departure", date: string | null): string {
  return `${direction}:${date || "today"}`;
}

async function fetchHeathrowFlights(
  direction: "arrival" | "departure",
  params: { terminal?: string; airline?: string; date?: string }
): Promise<NormalisedFlightsPayload> {
  const dateKey = params.date || new Date().toISOString().split("T")[0];
  const cacheKey = createCacheKey(direction, dateKey);

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
    throw new Error("Heathrow API credentials not configured. Set HEATHROW_API_BASE_URL and HEATHROW_API_KEY or HEATHROW_API_SUBSCRIPTION_KEY in environment variables.");
  }

  try {
    const cfg = getConfig();
    const url = buildHeathrowRequestUrl(direction, { date: dateKey });
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

export async function getHeathrowArrivals(params: {
  terminal?: string;
  airline?: string;
  flight?: string;
  date?: string;
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

function parseQueryParams(query: any): {
  terminal?: string;
  airline?: string;
  flight?: string;
  date?: string;
  limit?: number;
  error?: string;
} {
  const terminal = query.terminal ? String(query.terminal) : undefined;
  const airline = query.airline ? String(query.airline) : undefined;
  const flight = query.flight ? String(query.flight) : undefined;
  const date = query.date ? String(query.date) : undefined;

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

  return { terminal, airline, flight, date, limit };
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

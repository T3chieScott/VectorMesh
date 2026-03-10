import type { Request, Response } from "express";

const DEFAULT_BASE_URL = "https://api.open-meteo.com/v1";
const DEFAULT_LAT = 51.5072;
const DEFAULT_LON = -0.1276;
const DEFAULT_NAME = "London";
const DEFAULT_TIMEOUT = 10_000;
const CACHE_TTL = 10 * 60 * 1000;

function getConfig() {
  return {
    baseUrl: process.env.OPEN_METEO_BASE_URL || DEFAULT_BASE_URL,
    defaultLat: parseFloat(process.env.WEATHER_DEFAULT_LAT || "") || DEFAULT_LAT,
    defaultLon: parseFloat(process.env.WEATHER_DEFAULT_LON || "") || DEFAULT_LON,
    defaultName: process.env.WEATHER_DEFAULT_NAME || DEFAULT_NAME,
    timeout: parseInt(process.env.WEATHER_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
  };
}

interface CurrentWeather {
  temperature: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  condition: string;
  icon: string;
  isDay: boolean;
}

interface DailyForecast {
  date: string;
  dayName: string;
  weatherCode: number | null;
  condition: string;
  icon: string;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationSum: number | null;
  windSpeedMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

interface HourlyForecast {
  time: string;
  temperature: number | null;
  weatherCode: number | null;
  condition: string;
  icon: string;
  precipitationProbability: number | null;
  windSpeed: number | null;
  humidity: number | null;
}

interface WeatherPayload {
  source: { provider: string };
  location: { name: string; lat: number; lon: number };
  unit: "celsius" | "fahrenheit";
  current: CurrentWeather;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  updatedAt: string;
  cache: { hit: boolean; stale: boolean };
}

interface CacheEntry {
  data: WeatherPayload;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

const WEATHER_CODES: Record<number, { condition: string; icon: string }> = {
  0: { condition: "Clear sky", icon: "sun" },
  1: { condition: "Mainly clear", icon: "sun" },
  2: { condition: "Partly cloudy", icon: "cloud-sun" },
  3: { condition: "Overcast", icon: "cloud" },
  45: { condition: "Fog", icon: "cloud-fog" },
  48: { condition: "Depositing rime fog", icon: "cloud-fog" },
  51: { condition: "Light drizzle", icon: "cloud-drizzle" },
  53: { condition: "Moderate drizzle", icon: "cloud-drizzle" },
  55: { condition: "Dense drizzle", icon: "cloud-drizzle" },
  56: { condition: "Light freezing drizzle", icon: "cloud-drizzle" },
  57: { condition: "Dense freezing drizzle", icon: "cloud-drizzle" },
  61: { condition: "Slight rain", icon: "cloud-rain" },
  63: { condition: "Moderate rain", icon: "cloud-rain" },
  65: { condition: "Heavy rain", icon: "cloud-rain" },
  66: { condition: "Light freezing rain", icon: "cloud-rain" },
  67: { condition: "Heavy freezing rain", icon: "cloud-rain" },
  71: { condition: "Slight snow", icon: "snowflake" },
  73: { condition: "Moderate snow", icon: "snowflake" },
  75: { condition: "Heavy snow", icon: "snowflake" },
  77: { condition: "Snow grains", icon: "snowflake" },
  80: { condition: "Slight rain showers", icon: "cloud-rain" },
  81: { condition: "Moderate rain showers", icon: "cloud-rain" },
  82: { condition: "Violent rain showers", icon: "cloud-rain" },
  85: { condition: "Slight snow showers", icon: "snowflake" },
  86: { condition: "Heavy snow showers", icon: "snowflake" },
  95: { condition: "Thunderstorm", icon: "cloud-lightning" },
  96: { condition: "Thunderstorm with slight hail", icon: "cloud-lightning" },
  99: { condition: "Thunderstorm with heavy hail", icon: "cloud-lightning" },
};

function weatherCodeInfo(code: number | null | undefined): { condition: string; icon: string } {
  if (code == null) return { condition: "Unknown", icon: "cloud" };
  return WEATHER_CODES[code] || { condition: "Unknown", icon: "cloud" };
}

function getDayName(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "short" });
  } catch {
    return "";
  }
}

function buildWeatherUrl(lat: number, lon: number, unit: "celsius" | "fahrenheit", days: number): string {
  const cfg = getConfig();
  const tempUnit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
  const windUnit = unit === "fahrenheit" ? "mph" : "kmh";
  const url = new URL(`${cfg.baseUrl}/forecast`);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,is_day");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset");
  url.searchParams.set("hourly", "temperature_2m,weather_code,precipitation_probability,wind_speed_10m,relative_humidity_2m");
  url.searchParams.set("temperature_unit", tempUnit);
  url.searchParams.set("wind_speed_unit", windUnit);
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("timezone", "auto");
  return url.toString();
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Open-Meteo API returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normaliseCurrentWeather(raw: any): CurrentWeather {
  const current = raw?.current || {};
  const code = current.weather_code ?? null;
  const info = weatherCodeInfo(code);
  return {
    temperature: current.temperature_2m ?? null,
    windSpeed: current.wind_speed_10m ?? null,
    weatherCode: code,
    condition: info.condition,
    icon: info.icon,
    isDay: current.is_day === 1,
  };
}

function normaliseDailyForecast(raw: any): DailyForecast[] {
  const daily = raw?.daily || {};
  const dates: string[] = daily.time || [];
  return dates.map((date: string, i: number) => {
    const code = daily.weather_code?.[i] ?? null;
    const info = weatherCodeInfo(code);
    return {
      date,
      dayName: getDayName(date),
      weatherCode: code,
      condition: info.condition,
      icon: info.icon,
      temperatureMax: daily.temperature_2m_max?.[i] ?? null,
      temperatureMin: daily.temperature_2m_min?.[i] ?? null,
      precipitationSum: daily.precipitation_sum?.[i] ?? null,
      windSpeedMax: daily.wind_speed_10m_max?.[i] ?? null,
      sunrise: daily.sunrise?.[i] ?? null,
      sunset: daily.sunset?.[i] ?? null,
    };
  });
}

function normaliseHourlyForecast(raw: any): HourlyForecast[] {
  const hourly = raw?.hourly || {};
  const times: string[] = hourly.time || [];
  return times.map((time: string, i: number) => {
    const code = hourly.weather_code?.[i] ?? null;
    const info = weatherCodeInfo(code);
    return {
      time,
      temperature: hourly.temperature_2m?.[i] ?? null,
      weatherCode: code,
      condition: info.condition,
      icon: info.icon,
      precipitationProbability: hourly.precipitation_probability?.[i] ?? null,
      windSpeed: hourly.wind_speed_10m?.[i] ?? null,
      humidity: hourly.relative_humidity_2m?.[i] ?? null,
    };
  });
}

function normaliseWeatherPayload(
  raw: any,
  location: { name: string; lat: number; lon: number },
  unit: "celsius" | "fahrenheit",
  cacheInfo: { hit: boolean; stale: boolean }
): WeatherPayload {
  return {
    source: { provider: "Open-Meteo" },
    location,
    unit,
    current: normaliseCurrentWeather(raw),
    daily: normaliseDailyForecast(raw),
    hourly: normaliseHourlyForecast(raw),
    updatedAt: new Date().toISOString(),
    cache: cacheInfo,
  };
}

function createCacheKey(lat: number, lon: number, unit: string, days: number): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${unit}:${days}`;
}

export function clearWeatherCache(): void {
  cache.clear();
}

export async function getWeatherForecast(params: {
  lat?: number;
  lon?: number;
  name?: string;
  unit?: "celsius" | "fahrenheit";
  days?: number;
} = {}): Promise<WeatherPayload> {
  const cfg = getConfig();
  const lat = params.lat ?? cfg.defaultLat;
  const lon = params.lon ?? cfg.defaultLon;
  const name = params.name || cfg.defaultName;
  const unit = params.unit || "celsius";
  const days = Math.min(Math.max(params.days || 7, 1), 14);

  const cacheKey = createCacheKey(lat, lon, unit, days);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return { ...cached.data, cache: { hit: true, stale: false } };
  }

  try {
    const url = buildWeatherUrl(lat, lon, unit, days);
    const raw = await fetchJsonWithTimeout(url, cfg.timeout);
    const location = { name, lat, lon };
    const payload = normaliseWeatherPayload(raw, location, unit, { hit: false, stale: false });

    cache.set(cacheKey, { data: payload, timestamp: now });
    return payload;
  } catch (err) {
    if (cached) {
      return { ...cached.data, cache: { hit: true, stale: true } };
    }
    throw err;
  }
}

export function createWeatherForecastHandler() {
  return async (req: Request, res: Response) => {
    try {
      const lat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
      const lon = req.query.lon ? parseFloat(String(req.query.lon)) : undefined;
      const name = req.query.name ? String(req.query.name) : undefined;
      const unit = req.query.unit === "fahrenheit" ? "fahrenheit" as const : "celsius" as const;
      const days = req.query.days ? parseInt(String(req.query.days), 10) : undefined;

      if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
        res.status(400).json({ error: "Invalid latitude. Must be between -90 and 90." });
        return;
      }
      if (lon !== undefined && (isNaN(lon) || lon < -180 || lon > 180)) {
        res.status(400).json({ error: "Invalid longitude. Must be between -180 and 180." });
        return;
      }

      const result = await getWeatherForecast({ lat, lon, name, unit, days });
      res.set("Cache-Control", "public, max-age=300");
      res.json(result);
    } catch (err: any) {
      res.status(502).json({
        error: err.message || "Failed to fetch weather forecast",
      });
    }
  };
}

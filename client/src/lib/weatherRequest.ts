/**
 * Identity for the weather-timezone lookup used by Player and Monitor.
 *
 * The old effects depended on zones.length/layout.id, which misses a
 * same-layout coordinate edit and permits a deferred response for the old
 * location to win. Keep URL construction and its complete input identity in
 * one pure helper so both hosts have the same ordering contract.
 */

export interface WeatherZoneInput {
  type?: string;
  weatherLat?: number | string | null;
  weatherLng?: number | string | null;
  weatherUnit?: string | null;
  weatherLocation?: string | null;
}

export interface WeatherRequest {
  url: string;
  identity: string;
}

function hasCoordinate(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function buildWeatherRequest(
  endpoint: string,
  zones: readonly WeatherZoneInput[],
  screenTimezone?: string | null,
): WeatherRequest | null {
  const zone = zones.find((candidate) =>
    candidate.type === "weather" &&
    hasCoordinate(candidate.weatherLat) &&
    hasCoordinate(candidate.weatherLng),
  );
  if (!zone) return null;

  const lat = String(zone.weatherLat);
  const lng = String(zone.weatherLng);
  const unit = zone.weatherUnit || "celsius";
  const url = `${endpoint}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&unit=${encodeURIComponent(unit)}`;
  // Include all inputs that can identify the rendered weather context, even
  // when a particular endpoint currently derives its timezone from coords.
  // This makes a future place/timezone-aware endpoint safe without changing
  // the effect dependency contract.
  const identity = JSON.stringify({
    url,
    lat,
    lng,
    unit,
    place: zone.weatherLocation ?? null,
    timezone: screenTimezone ?? null,
  });
  return { url, identity };
}

export function getWeatherRequestIdentity(
  endpoint: string,
  zones: readonly WeatherZoneInput[],
  screenTimezone?: string | null,
): string | null {
  return buildWeatherRequest(endpoint, zones, screenTimezone)?.identity ?? null;
}

/** Guard a deferred response before it writes the timezone state. */
export function isCurrentWeatherGeneration(
  currentGeneration: number,
  responseGeneration: number,
  aborted = false,
): boolean {
  return !aborted && currentGeneration === responseGeneration;
}

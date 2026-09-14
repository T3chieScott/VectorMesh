import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildWeatherRequest,
  getWeatherRequestIdentity,
  isCurrentWeatherGeneration,
} from "../client/src/lib/weatherRequest";

const zone = (overrides: Record<string, unknown> = {}) => ({
  type: "weather",
  weatherLat: 51.5,
  weatherLng: -0.12,
  weatherUnit: "celsius",
  weatherLocation: "London",
  ...overrides,
});

test("weather request identity is complete and exact URL is deterministic", () => {
  const first = buildWeatherRequest(
    "/api/player/widgets/weather",
    [zone()],
    "Europe/London",
  )!;
  const second = buildWeatherRequest(
    "/api/player/widgets/weather",
    [zone()],
    "Europe/London",
  )!;
  assert.deepEqual(first, second);
  assert.match(first.url, /lat=51\.5/);
  assert.match(first.url, /lng=-0\.12/);
  assert.match(first.url, /unit=celsius/);
  assert.equal(
    getWeatherRequestIdentity("/api/player/widgets/weather", [zone()], "Europe/London"),
    first.identity,
  );
});

test("same layout coordinate/place/unit/timezone changes each invalidate identity", () => {
  const identity = (overrides: Record<string, unknown> = {}, timezone = "Europe/London") =>
    getWeatherRequestIdentity(
      "/api/monitor/widgets/weather",
      [zone(overrides)],
      timezone,
    );
  const baseline = identity();
  assert.notEqual(identity({ weatherLat: 40.7 }), baseline);
  assert.notEqual(identity({ weatherLng: -74 }), baseline);
  assert.notEqual(identity({ weatherUnit: "fahrenheit" }), baseline);
  assert.notEqual(identity({ weatherLocation: "New York" }), baseline);
  assert.notEqual(identity({}, "America/New_York"), baseline);
});

test("deferred old weather responses cannot win after a newer generation", () => {
  let currentGeneration = 1;
  const oldGeneration = 1;
  currentGeneration = 2;
  assert.equal(isCurrentWeatherGeneration(currentGeneration, oldGeneration), false);
  assert.equal(isCurrentWeatherGeneration(currentGeneration, 2), true);
  assert.equal(isCurrentWeatherGeneration(currentGeneration, 2, true), false);
});

test("weather effects use cancellation and generation guards on both hosts", () => {
  const player = fs.readFileSync("client/src/pages/player.tsx", "utf8");
  const monitor = fs.readFileSync("client/src/pages/monitor.tsx", "utf8");
  for (const source of [player, monitor]) {
    assert.match(source, /buildWeatherRequest/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /signal:\s*controller\.signal/);
    assert.match(source, /isCurrentWeatherGeneration/);
    assert.match(source, /return \(\) => controller\.abort\(\)/);
  }
  assert.doesNotMatch(player, /\[zones\.length, layout\?\.id, token\]/);
  assert.doesNotMatch(monitor, /\[zones\.length, layout\?\.id\]/);
});

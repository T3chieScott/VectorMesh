import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  normalizeLiveFixture,
  normalizeLiveFixtures,
  normalizeStandingRow,
  normalizeStandings,
  isSportmonksLiveConfigured,
  WORLD_CUP_LEAGUE_ID,
} from "../server/sportmonksLive";
import { buildLiveData, type BuildLiveInput } from "../server/sweepstakeLogic";
import {
  mountSweepstakeRoutes,
  type SweepstakeRoutesStorage,
} from "../server/sweepstakeRoutes";
import type { SweepstakeWidgetConfig } from "../shared/schema";

// Task #287 — World Cup Live + Sweepstake Hype Wall. Pin the pure data
// shaping: Sportmonks fixture/standings normalisation and the buildLiveData
// resolver that joins live teams to drawn staff. No network is touched here.

// ---------- normalizeLiveFixture ----------

test("normalizeLiveFixture: scores keyed by participant side, not include order", () => {
  const fx = {
    id: 101,
    league_id: WORLD_CUP_LEAGUE_ID,
    season_id: 555,
    state: { state: "INPLAY_2ND_HALF", short_name: "2H", developer_name: "INPLAY_2ND_HALF" },
    participants: [
      { id: 1, name: "England", short_code: "ENG", image_path: "eng.png", meta: { location: "home" } },
      { id: 2, name: "Brazil", short_code: "BRA", image_path: "bra.png", meta: { location: "away" } },
    ],
    // Deliberately list away first to prove ordering doesn't decide home/away.
    scores: [
      { description: "CURRENT", score: { participant: "away", goals: 2 } },
      { description: "CURRENT", score: { participant: "home", goals: 1 } },
      { description: "1ST_HALF", score: { participant: "home", goals: 5 } },
    ],
    periods: [{ ticking: true, minutes: 67 }],
    events: [],
  };
  const m = normalizeLiveFixture(fx);
  assert.equal(m.id, "101");
  assert.equal(m.home?.name, "England");
  assert.equal(m.away?.name, "Brazil");
  assert.equal(m.homeScore, 1);
  assert.equal(m.awayScore, 2);
  assert.equal(m.isLive, true);
  assert.equal(m.finished, false);
  assert.equal(m.minute, 67);
  assert.equal(m.stateLabel, "2nd half");
});

test("normalizeLiveFixture: maps event type ids and sides, drops noise, sorts by minute", () => {
  const fx = {
    id: 7,
    league_id: WORLD_CUP_LEAGUE_ID,
    state: { state: "INPLAY_1ST_HALF" },
    participants: [
      { id: 10, name: "Home", meta: { location: "home" } },
      { id: 20, name: "Away", meta: { location: "away" } },
    ],
    scores: [],
    events: [
      { minute: 35, type_id: 14, participant_id: 10, player_name: "Striker" }, // goal home
      { minute: 5, type_id: 19, participant_id: 20, player_name: "Defender" }, // yellow away
      { minute: 50, type_id: 999, participant_id: 10 }, // unknown -> "other" -> dropped
    ],
  };
  const m = normalizeLiveFixture(fx);
  assert.equal(m.events.length, 2);
  assert.deepEqual(
    m.events.map((e) => [e.minute, e.kind, e.side]),
    [
      [5, "yellowcard", "away"],
      [35, "goal", "home"],
    ],
  );
});

test("normalizeLiveFixture: finished match exposes no live minute", () => {
  const m = normalizeLiveFixture({
    id: 9,
    league_id: WORLD_CUP_LEAGUE_ID,
    state: { state: "FT" },
    participants: [],
    scores: [{ description: "CURRENT", score: { participant: "home", goals: 0 } }],
    periods: [{ ticking: true, minutes: 90 }],
    events: [],
  });
  assert.equal(m.finished, true);
  assert.equal(m.isLive, false);
  assert.equal(m.minute, null);
  assert.equal(m.stateLabel, "Full time");
});

test("normalizeLiveFixtures: filters out non-World-Cup leagues", () => {
  const raw = {
    data: [
      { id: 1, league_id: WORLD_CUP_LEAGUE_ID, state: { state: "FT" }, participants: [], scores: [], events: [] },
      { id: 2, league_id: 99, state: { state: "FT" }, participants: [], scores: [], events: [] },
      { id: 3, state: { state: "FT" }, participants: [], scores: [], events: [] }, // null league passes
    ],
  };
  const out = normalizeLiveFixtures(raw);
  assert.deepEqual(out.map((m) => m.id).sort(), ["1", "3"]);
});

// ---------- normalizeStandingRow ----------

test("normalizeStandingRow: reads detail codes and points", () => {
  const row = {
    participant_id: 10,
    participant: { name: "England", short_code: "ENG", image_path: "eng.png" },
    group: { name: "Group A" },
    position: 1,
    points: 0,
    details: [
      { type: { code: "overall-matches-played" }, value: 3 },
      { type: { code: "overall-won" }, value: 2 },
      { type: { code: "overall-draw" }, value: 1 },
      { type: { code: "overall-lost" }, value: 0 },
      { type: { code: "overall-goals-for" }, value: 7 },
      { type: { code: "overall-goals-against" }, value: 2 },
      { type: { code: "goal-difference" }, value: 5 },
      { type: { code: "overall-points" }, value: 7 },
    ],
  };
  const r = normalizeStandingRow(row);
  assert.equal(r.sportmonksTeamId, "10");
  assert.equal(r.teamName, "England");
  assert.equal(r.groupName, "Group A");
  assert.equal(r.position, 1);
  assert.equal(r.played, 3);
  assert.equal(r.won, 2);
  assert.equal(r.draw, 1);
  assert.equal(r.lost, 0);
  assert.equal(r.goalsFor, 7);
  assert.equal(r.goalsAgainst, 2);
  assert.equal(r.goalDifference, 5);
  assert.equal(r.points, 7);
});

test("normalizeStandings: drops rows with no participant id", () => {
  const out = normalizeStandings({
    data: [
      { participant_id: 10, participant: { name: "A" }, details: [] },
      { participant: { name: "B" }, details: [] },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].sportmonksTeamId, "10");
});

// ---------- buildLiveData ----------

function baseInput(overrides: Partial<BuildLiveInput> = {}): BuildLiveInput {
  return {
    panels: [],
    refreshSeconds: 15,
    teams: [],
    participants: [],
    inplay: [],
    fixtures: [],
    standings: [],
    available: true,
    stale: false,
    updatedAt: null,
    ...overrides,
  };
}

test("buildLiveData: joins live team to persisted team and attaches staff names", () => {
  const out = buildLiveData(
    baseInput({
      panels: ["live_score"],
      teams: [
        { id: "t1", externalId: "10", name: "England", shortName: "ENG", countryCode: "GB", crestUrl: null, eliminated: false, isWinner: false },
      ],
      participants: [
        { name: "Alice", teamId: "t1" },
        { name: "Bob", teamId: "t1" },
        { name: "Carol", teamId: "t2" },
      ],
      inplay: [
        {
          id: "m1",
          leagueId: WORLD_CUP_LEAGUE_ID,
          seasonId: null,
          state: "INPLAY_2ND_HALF",
          stateLabel: "2nd half",
          isLive: true,
          finished: false,
          minute: 70,
          groupName: null,
          stage: null,
          startingAt: null,
          startingAtTs: null,
          home: { sportmonksId: "10", name: "England", shortName: "ENG", crestUrl: null },
          away: { sportmonksId: "20", name: "Brazil", shortName: "BRA", crestUrl: null },
          homeScore: 1,
          awayScore: 0,
          events: [],
        },
      ],
    }),
  );
  assert.equal(out.enabled, true);
  assert.equal(out.available, true);
  assert.equal(out.refreshSeconds, 15);
  assert.equal(out.liveMatches.length, 1);
  const home = out.liveMatches[0].home!;
  assert.equal(home.teamId, "t1");
  assert.deepEqual(home.participants.sort(), ["Alice", "Bob"]);
  // Unmatched live team falls back to live name, no staff.
  const away = out.liveMatches[0].away!;
  assert.equal(away.teamId, null);
  assert.deepEqual(away.participants, []);
});

test("buildLiveData: empty panels selects all live panels", () => {
  const out = buildLiveData(baseInput({ panels: [] }));
  assert.ok(out.panels.length >= 3);
  assert.ok(out.panels.includes("now_next"));
  assert.ok(out.panels.includes("live_score"));
  assert.ok(out.panels.includes("live_standings"));
});

test("buildLiveData: only computes data for requested panels", () => {
  const inplayMatch = {
    id: "m1",
    leagueId: WORLD_CUP_LEAGUE_ID,
    seasonId: null,
    state: "INPLAY",
    stateLabel: "Live",
    isLive: true,
    finished: false,
    minute: 10,
    groupName: null,
    stage: null,
    startingAt: null,
    startingAtTs: null,
    home: { sportmonksId: "10", name: "A", shortName: null, crestUrl: null },
    away: { sportmonksId: "20", name: "B", shortName: null, crestUrl: null },
    homeScore: 0,
    awayScore: 0,
    events: [],
  };
  const out = buildLiveData(
    baseInput({
      panels: ["live_standings"],
      inplay: [inplayMatch],
      standings: [
        {
          sportmonksTeamId: "10",
          teamName: "A",
          teamShortName: null,
          teamCrestUrl: null,
          groupName: "Group A",
          position: 1,
          played: 1,
          won: 1,
          draw: 0,
          lost: 0,
          goalsFor: 2,
          goalsAgainst: 0,
          goalDifference: 2,
          points: 3,
        },
      ],
    }),
  );
  // live_score not requested -> no live matches computed.
  assert.equal(out.liveMatches.length, 0);
  assert.equal(out.standings.length, 1);
  assert.equal(out.standings[0].points, 3);
});

test("buildLiveData: standings sorted by group then position", () => {
  const mk = (id: string, group: string, pos: number) => ({
    sportmonksTeamId: id,
    teamName: id,
    teamShortName: null,
    teamCrestUrl: null,
    groupName: group,
    position: pos,
    played: 0,
    won: 0,
    draw: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  });
  const out = buildLiveData(
    baseInput({
      panels: ["live_standings"],
      standings: [mk("x", "Group B", 1), mk("y", "Group A", 2), mk("z", "Group A", 1)],
    }),
  );
  assert.deepEqual(
    out.standings.map((s) => [s.groupName, s.position]),
    [
      ["Group A", 1],
      ["Group A", 2],
      ["Group B", 1],
    ],
  );
});

test("buildLiveData: passes through availability/stale flags and updatedAt", () => {
  const ts = Date.parse("2026-06-15T12:00:00Z");
  const out = buildLiveData(baseInput({ available: false, stale: true, updatedAt: ts }));
  assert.equal(out.available, false);
  assert.equal(out.stale, true);
  assert.equal(out.updatedAt, new Date(ts).toISOString());
});

// ---------- isSportmonksLiveConfigured env gating ----------

test("isSportmonksLiveConfigured requires BOTH token and season id", () => {
  const prevToken = process.env.SPORTMONKS_TOKEN;
  const prevAlt = process.env.SPORTMONKS_API_TOKEN;
  const prevSeason = process.env.WORLD_CUP_SEASON_ID;
  try {
    delete process.env.SPORTMONKS_TOKEN;
    delete process.env.SPORTMONKS_API_TOKEN;
    delete process.env.WORLD_CUP_SEASON_ID;
    assert.equal(isSportmonksLiveConfigured(), false, "neither set");

    process.env.SPORTMONKS_TOKEN = "x";
    assert.equal(isSportmonksLiveConfigured(), false, "token but no season");

    delete process.env.SPORTMONKS_TOKEN;
    process.env.WORLD_CUP_SEASON_ID = "555";
    assert.equal(isSportmonksLiveConfigured(), false, "season but no token");

    process.env.SPORTMONKS_TOKEN = "x";
    assert.equal(isSportmonksLiveConfigured(), true, "both set");
  } finally {
    if (prevToken === undefined) delete process.env.SPORTMONKS_TOKEN;
    else process.env.SPORTMONKS_TOKEN = prevToken;
    if (prevAlt === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = prevAlt;
    if (prevSeason === undefined) delete process.env.WORLD_CUP_SEASON_ID;
    else process.env.WORLD_CUP_SEASON_ID = prevSeason;
  }
});

// ---------- Public display endpoint live-field invariants ----------

function liveConfig(overrides: Partial<SweepstakeWidgetConfig> = {}): SweepstakeWidgetConfig {
  return {
    id: "cfg",
    clientId: "c1",
    name: "Test",
    tournamentName: "World Cup Football Sweepstake",
    provider: "manual",
    competitionCode: null,
    season: null,
    kickoffAt: null,
    layoutMode: "auto",
    theme: "bright",
    accentColor: "#16a34a",
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 12,
    slideTypes: [],
    liveEnabled: false,
    livePanels: [],
    liveRefreshSeconds: 15,
    lastSyncedAt: null,
    lastSyncError: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

function makeDisplayStorage(cfg: SweepstakeWidgetConfig): SweepstakeRoutesStorage {
  return {
    async getSweepstakeConfigs() { return [cfg]; },
    async getSweepstakeConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async getTournamentTeams() { return []; },
    async getTournamentMatches() { return []; },
    async getTournamentStandings() { return []; },
    async getSweepstakeParticipants() { return []; },
  } as unknown as SweepstakeRoutesStorage;
}

async function withServer(storage: SweepstakeRoutesStorage, fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  mountSweepstakeRoutes(app, {
    storage,
    auth: { canAccessClient: () => true, getAllowedClientIds: () => null },
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
    loadUserContext: (_req: Request, _res: Response, next: NextFunction) => next(),
  });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("display payload omits `live` key entirely when live mode is off", async () => {
  const storage = makeDisplayStorage(liveConfig({ liveEnabled: false }));
  await withServer(storage, async (base) => {
    const res = await fetch(`${base}/api/sweepstake/display/cfg`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal("live" in payload, false, "no live key for live-off configs");
    assert.ok("tournamentName" in payload);
  });
});

test("display payload degrades to available:false when live on but not configured", async () => {
  const prevToken = process.env.SPORTMONKS_TOKEN;
  const prevAlt = process.env.SPORTMONKS_API_TOKEN;
  const prevSeason = process.env.WORLD_CUP_SEASON_ID;
  // Force "not configured" so no network call happens.
  delete process.env.SPORTMONKS_TOKEN;
  delete process.env.SPORTMONKS_API_TOKEN;
  delete process.env.WORLD_CUP_SEASON_ID;
  try {
    const storage = makeDisplayStorage(
      liveConfig({ liveEnabled: true, provider: "sportmonks", livePanels: ["live_score"] }),
    );
    await withServer(storage, async (base) => {
      const res = await fetch(`${base}/api/sweepstake/display/cfg`);
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.ok(payload.live, "live present when enabled");
      assert.equal(payload.live.enabled, true);
      assert.equal(payload.live.available, false, "unavailable without config");
      assert.equal(payload.live.refreshSeconds, 15);
    });
  } finally {
    if (prevToken === undefined) delete process.env.SPORTMONKS_TOKEN;
    else process.env.SPORTMONKS_TOKEN = prevToken;
    if (prevAlt === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = prevAlt;
    if (prevSeason === undefined) delete process.env.WORLD_CUP_SEASON_ID;
    else process.env.WORLD_CUP_SEASON_ID = prevSeason;
  }
});

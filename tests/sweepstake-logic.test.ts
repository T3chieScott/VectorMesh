import test from "node:test";
import assert from "node:assert/strict";
import {
  shuffle,
  computeAssignments,
  computeParticipantStatuses,
  detectWinnerTeamName,
  buildDisplayData,
} from "../server/sweepstakeLogic";
import type {
  SweepstakeWidgetConfig,
  SweepstakeParticipant,
  TournamentTeam,
  TournamentMatch,
  TournamentStanding,
} from "../shared/schema";

// Task #286 — World Football Sweepstake Wall. Pin the pure logic:
// fair assignment, elimination cascade, winner detection and the scrubbed
// public display payload (no emails ever leak).

// Deterministic RNG (mulberry32) so shuffle/assignment results are repeatable.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function team(o: Partial<TournamentTeam> & { id: string; name: string }): TournamentTeam {
  return {
    id: o.id,
    configId: o.configId ?? "cfg",
    externalId: o.externalId ?? null,
    name: o.name,
    shortName: o.shortName ?? null,
    countryCode: o.countryCode ?? null,
    groupName: o.groupName ?? null,
    crestUrl: o.crestUrl ?? null,
    eliminated: o.eliminated ?? false,
    eliminatedAt: o.eliminatedAt ?? null,
    isWinner: o.isWinner ?? false,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function person(o: Partial<SweepstakeParticipant> & { id: string; name: string }): SweepstakeParticipant {
  return {
    id: o.id,
    configId: o.configId ?? "cfg",
    clientId: o.clientId ?? "c1",
    name: o.name,
    email: o.email ?? null,
    department: o.department ?? null,
    teamId: o.teamId ?? null,
    status: (o.status as any) ?? "active",
    manualOverride: o.manualOverride ?? false,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function match(o: Partial<TournamentMatch> & { id: string }): TournamentMatch {
  return {
    id: o.id,
    configId: o.configId ?? "cfg",
    externalId: o.externalId ?? null,
    stage: o.stage ?? null,
    groupName: o.groupName ?? null,
    homeTeamId: o.homeTeamId ?? null,
    awayTeamId: o.awayTeamId ?? null,
    homeTeamName: o.homeTeamName ?? null,
    awayTeamName: o.awayTeamName ?? null,
    homeScore: o.homeScore ?? null,
    awayScore: o.awayScore ?? null,
    status: (o.status as any) ?? "scheduled",
    kickoffAt: o.kickoffAt ?? null,
    winnerTeamId: o.winnerTeamId ?? null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function standing(o: Partial<TournamentStanding> & { id: string; teamName: string }): TournamentStanding {
  return {
    id: o.id,
    configId: o.configId ?? "cfg",
    teamId: o.teamId ?? null,
    teamName: o.teamName,
    groupName: o.groupName ?? null,
    position: o.position ?? null,
    played: o.played ?? 0,
    won: o.won ?? 0,
    draw: o.draw ?? 0,
    lost: o.lost ?? 0,
    goalsFor: o.goalsFor ?? 0,
    goalsAgainst: o.goalsAgainst ?? 0,
    goalDifference: o.goalDifference ?? 0,
    points: o.points ?? 0,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
}

function config(o: Partial<SweepstakeWidgetConfig> = {}): SweepstakeWidgetConfig {
  return {
    id: "cfg",
    clientId: "c1",
    name: "Test",
    tournamentName: "World Football Sweepstake",
    provider: "manual",
    competitionCode: null,
    season: null,
    kickoffAt: o.kickoffAt ?? null,
    layoutMode: "auto",
    theme: "bright",
    accentColor: "#16a34a",
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 12,
    slideTypes: o.slideTypes ?? [],
    lastSyncedAt: null,
    lastSyncError: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...o,
  };
}

// ---------- shuffle ----------
test("shuffle preserves all elements and does not mutate input", () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(input, rng(42));
  assert.deepEqual([...input], [1, 2, 3, 4, 5], "input untouched");
  assert.deepEqual([...out].sort((a, b) => a - b), [1, 2, 3, 4, 5], "same multiset");
});

// ---------- assignment fairness ----------
test("assignment: equal people and teams gives one team each", () => {
  const teams = [team({ id: "t1", name: "A" }), team({ id: "t2", name: "B" }), team({ id: "t3", name: "C" })];
  const people = [person({ id: "p1", name: "P1" }), person({ id: "p2", name: "P2" }), person({ id: "p3", name: "P3" })];
  const result = computeAssignments({ participants: people, teams, rng: rng(1) });
  assert.equal(result.length, 3);
  const used = new Set(result.map((r) => r.teamId));
  assert.equal(used.size, 3, "every team used exactly once");
});

test("assignment: more people than teams stays balanced (max diff 1)", () => {
  const teams = [team({ id: "t1", name: "A" }), team({ id: "t2", name: "B" }), team({ id: "t3", name: "C" })];
  const people = Array.from({ length: 10 }, (_, i) => person({ id: `p${i}`, name: `P${i}` }));
  const result = computeAssignments({ participants: people, teams, rng: rng(7) });
  assert.equal(result.length, 10, "everyone assigned");
  const counts = new Map<string, number>();
  for (const r of result) counts.set(r.teamId, (counts.get(r.teamId) ?? 0) + 1);
  const values = Array.from(counts.values());
  assert.equal(Math.max(...values) - Math.min(...values) <= 1, true, "team counts differ by at most one");
});

test("assignment: more teams than people gives each person a distinct team", () => {
  const teams = Array.from({ length: 8 }, (_, i) => team({ id: `t${i}`, name: `T${i}` }));
  const people = [person({ id: "p1", name: "P1" }), person({ id: "p2", name: "P2" })];
  const result = computeAssignments({ participants: people, teams, rng: rng(3) });
  assert.equal(result.length, 2);
  assert.equal(new Set(result.map((r) => r.teamId)).size, 2, "distinct teams, no duplicate");
});

test("assignment: manual-override people are excluded from the draw", () => {
  const teams = [team({ id: "t1", name: "A" }), team({ id: "t2", name: "B" })];
  const people = [
    person({ id: "p1", name: "P1", manualOverride: true, teamId: "t1" }),
    person({ id: "p2", name: "P2" }),
  ];
  const result = computeAssignments({ participants: people, teams, rng: rng(9) });
  assert.equal(result.length, 1, "only the non-override person is drawn");
  assert.equal(result[0].participantId, "p2");
});

test("assignment: eliminated teams excluded unless includeEliminated", () => {
  const teams = [team({ id: "t1", name: "A", eliminated: true }), team({ id: "t2", name: "B" })];
  const people = [person({ id: "p1", name: "P1" }), person({ id: "p2", name: "P2" })];
  const drawn = computeAssignments({ participants: people, teams, rng: rng(2) });
  assert.equal(drawn.every((r) => r.teamId === "t2"), true, "eliminated team never drawn");
  const withElim = computeAssignments({ participants: people, teams, includeEliminated: true, rng: rng(2) });
  assert.equal(new Set(withElim.map((r) => r.teamId)).size, 2, "eliminated team included when asked");
});

test("assignment: throws when no eligible teams remain", () => {
  const teams = [team({ id: "t1", name: "A", eliminated: true })];
  const people = [person({ id: "p1", name: "P1" })];
  assert.throws(() => computeAssignments({ participants: people, teams, rng: rng(1) }), /No teams available/);
});

test("assignment: no draw participants returns empty", () => {
  const teams = [team({ id: "t1", name: "A" })];
  const result = computeAssignments({ participants: [], teams, rng: rng(1) });
  assert.deepEqual(result, []);
});

// ---------- elimination cascade ----------
test("status cascade: participant inherits eliminated team fate", () => {
  const teams = [team({ id: "t1", name: "A", eliminated: true }), team({ id: "t2", name: "B" })];
  const people = [
    person({ id: "p1", name: "P1", teamId: "t1", status: "active" }),
    person({ id: "p2", name: "P2", teamId: "t2", status: "active" }),
  ];
  const updates = computeParticipantStatuses(people, teams);
  assert.deepEqual(updates, [{ participantId: "p1", status: "eliminated" }]);
});

test("status cascade: winner team makes participant a winner", () => {
  const teams = [team({ id: "t1", name: "A", isWinner: true })];
  const people = [person({ id: "p1", name: "P1", teamId: "t1", status: "active" })];
  const updates = computeParticipantStatuses(people, teams);
  assert.deepEqual(updates, [{ participantId: "p1", status: "winner" }]);
});

test("status cascade: no change produces no update", () => {
  const teams = [team({ id: "t1", name: "A", eliminated: true })];
  const people = [person({ id: "p1", name: "P1", teamId: "t1", status: "eliminated" })];
  assert.deepEqual(computeParticipantStatuses(people, teams), []);
});

test("status cascade: participant with no team stays active", () => {
  const teams = [team({ id: "t1", name: "A", eliminated: true })];
  const people = [person({ id: "p1", name: "P1", teamId: null, status: "active" })];
  assert.deepEqual(computeParticipantStatuses(people, teams), []);
});

// ---------- winner detection ----------
test("winner detection: decisive final returns the higher-scoring team", () => {
  const matches = [
    match({ id: "m1", stage: "SEMI_FINALS", status: "finished", homeTeamName: "A", awayTeamName: "B", homeScore: 1, awayScore: 0 }),
    match({ id: "m2", stage: "FINAL", status: "finished", homeTeamName: "A", awayTeamName: "C", homeScore: 2, awayScore: 1 }),
  ];
  assert.equal(detectWinnerTeamName(matches), "A");
});

test("winner detection: away win is detected", () => {
  const matches = [match({ id: "m1", stage: "Final", status: "finished", homeTeamName: "A", awayTeamName: "B", homeScore: 0, awayScore: 3 })];
  assert.equal(detectWinnerTeamName(matches), "B");
});

test("winner detection: ignores semi/quarter finals", () => {
  const matches = [match({ id: "m1", stage: "SEMI_FINAL", status: "finished", homeTeamName: "A", awayTeamName: "B", homeScore: 2, awayScore: 0 })];
  assert.equal(detectWinnerTeamName(matches), null);
});

test("winner detection: unfinished or drawn final returns null", () => {
  assert.equal(detectWinnerTeamName([match({ id: "m1", stage: "FINAL", status: "scheduled", homeTeamName: "A", awayTeamName: "B" })]), null);
  assert.equal(
    detectWinnerTeamName([match({ id: "m2", stage: "FINAL", status: "finished", homeTeamName: "A", awayTeamName: "B", homeScore: 1, awayScore: 1 })]),
    null,
  );
});

test("winner detection: penalty final (level score) uses recorded winnerTeamId", () => {
  const finalMatch = match({ id: "f", stage: "FINAL", status: "finished", homeTeamName: "A", awayTeamName: "B", homeScore: 1, awayScore: 1, winnerTeamId: "b-id" });
  // With the name map the recorded shoot-out winner becomes champion.
  assert.equal(detectWinnerTeamName([finalMatch], new Map([["b-id", "B"]])), "B");
  // Without the map we never guess a champion from a draw.
  assert.equal(detectWinnerTeamName([finalMatch]), null);
});

// ---------- display data (scrubbed) ----------
test("buildDisplayData never leaks participant emails", () => {
  const teams = [team({ id: "t1", name: "A" })];
  const people = [person({ id: "p1", name: "P1", email: "secret@example.com", teamId: "t1" })];
  const data = buildDisplayData({ config: config(), teams, matches: [], standings: [], participants: people });
  const json = JSON.stringify(data);
  assert.equal(json.includes("secret@example.com"), false, "no email in payload");
  assert.equal(data.participants[0].teamName, "A", "team name resolved");
  assert.equal("email" in (data.participants[0] as any), false, "no email field at all");
});

test("buildDisplayData only includes slides that have content", () => {
  const teams = [team({ id: "t1", name: "A" })];
  const people = [person({ id: "p1", name: "P1", teamId: "t1" })];
  const data = buildDisplayData({ config: config(), teams, matches: [], standings: [], participants: people });
  // No matches/standings/winner — fixtures/results/standings/winner excluded.
  assert.equal(data.slides.includes("fixtures" as any), false);
  assert.equal(data.slides.includes("results" as any), false);
  assert.equal(data.slides.includes("standings" as any), false);
  assert.equal(data.slides.includes("winner" as any), false);
  // Sweepstake + spotlight have content.
  assert.equal(data.slides.includes("sweepstake" as any), true);
  assert.equal(data.slides.includes("spotlight" as any), true);
});

test("buildDisplayData surfaces winner with their participants", () => {
  const teams = [team({ id: "t1", name: "A", isWinner: true }), team({ id: "t2", name: "B", eliminated: true })];
  const people = [
    person({ id: "p1", name: "Alice", teamId: "t1", status: "winner" }),
    person({ id: "p2", name: "Bob", teamId: "t2", status: "eliminated" }),
  ];
  const standings = [standing({ id: "s1", teamName: "A", groupName: "A", points: 9 })];
  const matches = [match({ id: "m1", stage: "FINAL", status: "finished", homeTeamName: "A", awayTeamName: "B", homeScore: 2, awayScore: 1 })];
  const data = buildDisplayData({ config: config({ slideTypes: [] }), teams, matches, standings, participants: people });
  assert.ok(data.winner);
  assert.equal(data.winner?.teamName, "A");
  assert.deepEqual(data.winner?.participants, ["Alice"]);
  assert.equal(data.slides.includes("winner" as any), true);
  assert.equal(data.slides.includes("eliminations" as any), true);
});

test("buildDisplayData honours an explicit slide subset (still content-filtered)", () => {
  const teams = [team({ id: "t1", name: "A" })];
  const people = [person({ id: "p1", name: "P1", teamId: "t1" })];
  const data = buildDisplayData({
    config: config({ slideTypes: ["sweepstake", "results"] }),
    teams,
    matches: [],
    standings: [],
    participants: people,
  });
  assert.deepEqual(data.slides, ["sweepstake"], "results dropped — no finished matches");
});

test("buildDisplayData falls back to sweepstake when nothing has content", () => {
  const data = buildDisplayData({ config: config(), teams: [], matches: [], standings: [], participants: [] });
  assert.deepEqual(data.slides, ["sweepstake"]);
});

// Task #295 — kick-off times must render in the site's configured timezone, not
// each player device's OS clock. The server stamps the resolved IANA zone onto
// the payload so the client formats consistently everywhere.
test("buildDisplayData passes through a valid site timezone", () => {
  const data = buildDisplayData({
    config: config(),
    teams: [],
    matches: [],
    standings: [],
    participants: [],
    timezone: "America/New_York",
  });
  assert.equal(data.timezone, "America/New_York");
});

test("buildDisplayData falls back to Europe/London for missing or invalid timezone", () => {
  const missing = buildDisplayData({ config: config(), teams: [], matches: [], standings: [], participants: [] });
  assert.equal(missing.timezone, "Europe/London");

  const invalid = buildDisplayData({
    config: config(),
    teams: [],
    matches: [],
    standings: [],
    participants: [],
    timezone: "Not/AZone",
  });
  assert.equal(invalid.timezone, "Europe/London");
});

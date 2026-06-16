// Coverage for the lightweight results-only periodic refresh.
//
// The periodic scheduler no longer re-pulls the whole season on every
// tick. For an already-synced Sportmonks config it fetches just a small
// date window of fixtures and MERGES their scores/state into the stored
// matches by externalId. storage.mergeTournamentMatches() must:
//   - update an existing match's result in place (keeping its row id),
//   - insert a genuinely new fixture, and
//   - never delete matches that fall outside the merged set.
//
// Test isolation: every row is namespaced with PREFIX so cleanup at
// file start AND end never touches ambient dev data.

import test from "node:test";
import assert from "node:assert/strict";
import { like } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  clients,
  sweepstakeWidgetConfigs,
  type InsertTournamentMatch,
} from "../shared/schema";

const PREFIX = "__TEST_SWEEP_MERGE__";

async function cleanup() {
  await db.delete(sweepstakeWidgetConfigs).where(like(sweepstakeWidgetConfigs.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

async function makeConfig() {
  const [client] = await db.insert(clients).values({ name: `${PREFIX}client` }).returning();
  const config = await storage.createSweepstakeConfig({
    clientId: client.id,
    name: `${PREFIX}config`,
    provider: "sportmonks",
  } as any);
  return { configId: config.id };
}

function match(externalId: string, partial: Partial<InsertTournamentMatch> = {}): InsertTournamentMatch {
  return {
    externalId,
    homeTeamName: "Home",
    awayTeamName: "Away",
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    configId: "",
    ...partial,
  } as InsertTournamentMatch;
}

test.before(cleanup);
test.after(cleanup);

test("merge updates an existing match in place and keeps its row id", async () => {
  const { configId } = await makeConfig();

  // Initial full sync seeds two scheduled matches.
  await storage.replaceTournamentMatches(configId, [
    match("900", { homeTeamName: "Belgium", awayTeamName: "Egypt" }),
    match("901", { homeTeamName: "Spain", awayTeamName: "Cape Verde Islands" }),
  ]);
  const seeded = await storage.getTournamentMatches(configId);
  const belgium = seeded.find((m) => m.externalId === "900")!;

  // A results-only window pull reports the Belgium game finished 1-1.
  const merged = await storage.mergeTournamentMatches(configId, [
    match("900", { homeTeamName: "Belgium", awayTeamName: "Egypt", homeScore: 1, awayScore: 1, status: "finished" }),
  ]);

  // Still exactly two matches — the out-of-window Spain game is untouched.
  assert.equal(merged.length, 2);

  const belgiumAfter = merged.find((m) => m.id === belgium.id);
  assert.ok(belgiumAfter, "match row id must be preserved across a merge");
  assert.equal(belgiumAfter!.homeScore, 1);
  assert.equal(belgiumAfter!.awayScore, 1);
  assert.equal(belgiumAfter!.status, "finished");

  const spainAfter = merged.find((m) => m.externalId === "901");
  assert.ok(spainAfter, "out-of-window match must NOT be deleted by a results merge");
  assert.equal(spainAfter!.status, "scheduled");
});

test("merge inserts a fixture that wasn't synced before", async () => {
  const { configId } = await makeConfig();

  await storage.replaceTournamentMatches(configId, [match("800", { homeTeamName: "Italy", awayTeamName: "Spain" })]);

  const merged = await storage.mergeTournamentMatches(configId, [
    match("800", { homeTeamName: "Italy", awayTeamName: "Spain", homeScore: 2, awayScore: 0, status: "finished" }),
    match("801", { homeTeamName: "France", awayTeamName: "Germany", status: "in_play" }),
  ]);

  assert.equal(merged.length, 2);
  const fresh = merged.find((m) => m.externalId === "801");
  assert.ok(fresh, "a brand-new fixture in the window must be inserted");
  assert.equal(fresh!.status, "in_play");
});

// Regression coverage for the bug where a provider sync wiped the
// sweepstake draw (every staff -> team pairing).
//
// Root cause: storage.replaceTournamentTeams() used to delete every
// team and re-insert with fresh uuids on each sync. Because
// sweepstake_participants.team_id references tournament_teams.id with
// ON DELETE SET NULL, that delete nulled every drawn pairing. A
// periodic auto-sync turned this into a repeating, silent data loss.
//
// The fix reconciles teams in place: matching teams (by externalId
// first, else case-insensitive name) keep their existing row id, so
// participant pairings survive. Only teams that genuinely left the
// tournament are deleted (which correctly nulls those pairings).
//
// Test isolation: every row is namespaced with PREFIX so cleanup at
// file start AND end never touches ambient dev data, matching the
// convention in forfeit-pairing.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { like } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  clients,
  sweepstakeWidgetConfigs,
  type InsertTournamentTeam,
} from "../shared/schema";

const PREFIX = "__TEST_SWEEP_SYNC__";

async function cleanup() {
  await db.delete(sweepstakeWidgetConfigs).where(like(sweepstakeWidgetConfigs.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

async function makeConfig() {
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();
  const config = await storage.createSweepstakeConfig({
    clientId: client.id,
    name: `${PREFIX}config`,
    provider: "manual",
  } as any);
  return { clientId: client.id, configId: config.id };
}

function team(externalId: string | null, name: string): InsertTournamentTeam {
  return { externalId, name, configId: "" } as InsertTournamentTeam;
}

test.before(cleanup);
test.after(cleanup);

test("sync keeps the draw: matched teams keep their id so participant.teamId survives", async () => {
  const { clientId, configId } = await makeConfig();

  // Seed three teams as a provider sync would.
  await storage.replaceTournamentTeams(configId, [
    team("100", "Argentina"),
    team("200", "Brazil"),
    team("300", "France"),
  ]);
  const seeded = await storage.getTournamentTeams(configId);
  const brazil = seeded.find((t) => t.name === "Brazil")!;
  const france = seeded.find((t) => t.name === "France")!;

  // Draw: a participant is assigned to Brazil.
  const person = await storage.createSweepstakeParticipant({
    configId,
    clientId,
    name: `${PREFIX}Alice`,
    teamId: brazil.id,
  } as any);

  // Re-sync with: Brazil renamed (same externalId), France's externalId
  // dropped (same name), Argentina unchanged, plus a brand-new team.
  await storage.replaceTournamentTeams(configId, [
    team("100", "Argentina"),
    team("200", "Brazil (Selecao)"),
    team(null, "France"),
    team("400", "Spain"),
  ]);

  const after = await storage.getTournamentTeams(configId);
  // Same four teams remain (3 reconciled + 1 new), no duplicates.
  assert.equal(after.length, 4);

  // Brazil kept its row id despite the rename.
  const brazilAfter = after.find((t) => t.id === brazil.id);
  assert.ok(brazilAfter, "Brazil row id must be preserved across rename");
  assert.equal(brazilAfter!.name, "Brazil (Selecao)");

  // France kept its row id despite losing its externalId.
  const franceAfter = after.find((t) => t.id === france.id);
  assert.ok(franceAfter, "France row id must be preserved when externalId drops");

  // The draw survived: the participant is still paired to the same team id.
  const participants = await storage.getSweepstakeParticipants(configId);
  const aliceAfter = participants.find((p) => p.id === person.id)!;
  assert.equal(aliceAfter.teamId, brazil.id, "participant pairing must survive a sync");
});

test("sync nulls pairings only for teams that genuinely left the tournament", async () => {
  const { clientId, configId } = await makeConfig();

  await storage.replaceTournamentTeams(configId, [
    team("10", "Italy"),
    team("20", "Spain"),
  ]);
  const seeded = await storage.getTournamentTeams(configId);
  const italy = seeded.find((t) => t.name === "Italy")!;

  const person = await storage.createSweepstakeParticipant({
    configId,
    clientId,
    name: `${PREFIX}Bob`,
    teamId: italy.id,
  } as any);

  // Italy is removed from the provider list.
  await storage.replaceTournamentTeams(configId, [team("20", "Spain")]);

  const after = await storage.getTournamentTeams(configId);
  assert.equal(after.length, 1);
  assert.equal(after[0].name, "Spain");

  // Bob was drawn to Italy, which no longer exists -> pairing correctly nulled.
  const participants = await storage.getSweepstakeParticipants(configId);
  const bobAfter = participants.find((p) => p.id === person.id)!;
  assert.equal(bobAfter.teamId, null, "pairing to a removed team is nulled");
});

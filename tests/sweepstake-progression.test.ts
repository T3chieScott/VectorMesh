import test from "node:test";
import assert from "node:assert/strict";
import {
  computeGroupStandings,
  computeProgression,
  resolveGroupSlot,
  buildBracket,
  isPlaceholderName,
  isRealTeamName,
  type MatchLike,
  type BracketInputMatch,
} from "../server/sweepstakeProgression";

// Task #297 — pin the World Cup progression engine: group tables, provable
// (additive) eliminations, knockout-slot resolution and the bracket builder.

function gm(o: Partial<MatchLike> & { groupName: string; homeTeamName: string; awayTeamName: string }): MatchLike {
  return {
    stage: o.stage ?? "Group stage",
    groupName: o.groupName,
    homeTeamName: o.homeTeamName,
    awayTeamName: o.awayTeamName,
    homeScore: o.homeScore ?? null,
    awayScore: o.awayScore ?? null,
    status: o.status ?? "scheduled",
  };
}

function ko(o: Partial<MatchLike> & { homeTeamName: string; awayTeamName: string }): MatchLike {
  return {
    stage: o.stage ?? "Round of 16",
    groupName: o.groupName ?? null,
    homeTeamName: o.homeTeamName,
    awayTeamName: o.awayTeamName,
    homeScore: o.homeScore ?? null,
    awayScore: o.awayScore ?? null,
    status: o.status ?? "scheduled",
  };
}

test("placeholder detection distinguishes slots from real teams", () => {
  assert.equal(isPlaceholderName("1st Group C"), true);
  assert.equal(isPlaceholderName("2nd Group A"), true);
  assert.equal(isPlaceholderName("3rd Group A/B/C/D/F"), true);
  assert.equal(isPlaceholderName("Winner Match 73"), true);
  assert.equal(isPlaceholderName("Runner-up Group B"), true);
  assert.equal(isPlaceholderName(""), true);
  assert.equal(isPlaceholderName(null), true);
  assert.equal(isRealTeamName("Brazil"), true);
  assert.equal(isRealTeamName("Côte d'Ivoire"), true);
  assert.equal(isRealTeamName("1st Group C"), false);
});

test("group standings rank by points then goal difference then goals for", () => {
  const matches: MatchLike[] = [
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 3, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Gamma", awayTeamName: "Delta", homeScore: 1, awayScore: 1, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Gamma", homeScore: 2, awayScore: 1, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Beta", awayTeamName: "Delta", homeScore: 0, awayScore: 0, status: "finished" }),
  ];
  const table = computeGroupStandings(matches);
  const byPos = table.slice().sort((a, b) => a.position - b.position);
  assert.equal(byPos[0].teamName, "Alpha");
  assert.equal(byPos[0].points, 6);
  assert.equal(byPos[0].goalDifference, 4);
  // All four teams present even though Delta lost/drew.
  assert.equal(table.length, 4);
});

test("no eliminations while a group is still in progress", () => {
  const matches: MatchLike[] = [
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 3, awayScore: 0, status: "finished" }),
    // Gamma/Delta not yet played, so the group isn't complete.
    gm({ groupName: "Group A", homeTeamName: "Gamma", awayTeamName: "Delta" }),
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Gamma" }),
    gm({ groupName: "Group A", homeTeamName: "Beta", awayTeamName: "Delta" }),
  ];
  const prog = computeProgression(matches);
  assert.equal(prog.eliminatedTeamNames.size, 0);
  assert.equal(prog.completeGroups.size, 0);
  assert.equal(prog.groupStageComplete, false);
});

test("bottom of a completed group is eliminated", () => {
  const matches: MatchLike[] = [
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 3, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Gamma", awayTeamName: "Delta", homeScore: 2, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Gamma", homeScore: 1, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Beta", awayTeamName: "Delta", homeScore: 1, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Delta", homeScore: 4, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group A", homeTeamName: "Beta", awayTeamName: "Gamma", homeScore: 0, awayScore: 0, status: "finished" }),
  ];
  const prog = computeProgression(matches);
  assert.equal(prog.groupStageComplete, true);
  // Delta lost every game → 4th → out.
  assert.equal(prog.eliminatedTeamNames.has("delta"), true);
  assert.equal(prog.eliminatedTeamNames.has("alpha"), false);
});

test("losing side of a decided knockout match is eliminated; draws are not", () => {
  const matches: MatchLike[] = [
    ko({ stage: "Round of 16", homeTeamName: "Brazil", awayTeamName: "Ghana", homeScore: 2, awayScore: 1, status: "finished" }),
    ko({ stage: "Round of 16", homeTeamName: "Spain", awayTeamName: "Japan", homeScore: 1, awayScore: 1, status: "finished" }),
  ];
  const prog = computeProgression(matches);
  assert.equal(prog.eliminatedTeamNames.has("ghana"), true);
  assert.equal(prog.eliminatedTeamNames.has("brazil"), false);
  // A level score (penalty shoot-out) can't be resolved here → nobody out.
  assert.equal(prog.eliminatedTeamNames.has("spain"), false);
  assert.equal(prog.eliminatedTeamNames.has("japan"), false);
});

test("no third-place eliminations when knockout capacity can't be trusted", () => {
  // Two complete 4-team groups, but NO knockout fixtures stored yet, so the
  // engine can't prove which third-placed teams miss the cut → none go out
  // beyond the group's bottom side.
  const finished = (group: string, home: string, away: string, hs: number, as: number) =>
    gm({ groupName: group, homeTeamName: home, awayTeamName: away, homeScore: hs, awayScore: as, status: "finished" });
  const groupMatches = (g: string, t: [string, string, string, string]) => [
    finished(g, t[0], t[1], 1, 0),
    finished(g, t[2], t[3], 1, 0),
    finished(g, t[0], t[2], 1, 0),
    finished(g, t[1], t[3], 1, 0),
    finished(g, t[0], t[3], 1, 0),
    finished(g, t[1], t[2], 1, 0),
  ];
  const matches: MatchLike[] = [
    ...groupMatches("Group A", ["A1", "A2", "A3", "A4"]),
    ...groupMatches("Group B", ["B1", "B2", "B3", "B4"]),
  ];
  const prog = computeProgression(matches);
  assert.equal(prog.groupStageComplete, true);
  // Bottom side of each completed group is out…
  assert.equal(prog.eliminatedTeamNames.has("a4"), true);
  assert.equal(prog.eliminatedTeamNames.has("b4"), true);
  // …but the third-placed teams are NOT eliminated (capacity unknown).
  assert.equal(prog.eliminatedTeamNames.has("a3"), false);
  assert.equal(prog.eliminatedTeamNames.has("b3"), false);
});

test("resolveGroupSlot fills a placeholder only once the group is complete", () => {
  const completeMatches: MatchLike[] = [
    gm({ groupName: "Group C", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 2, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group C", homeTeamName: "Gamma", awayTeamName: "Delta", homeScore: 1, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group C", homeTeamName: "Alpha", awayTeamName: "Gamma", homeScore: 1, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group C", homeTeamName: "Beta", awayTeamName: "Delta", homeScore: 3, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group C", homeTeamName: "Alpha", awayTeamName: "Delta", homeScore: 2, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group C", homeTeamName: "Beta", awayTeamName: "Gamma", homeScore: 1, awayScore: 0, status: "finished" }),
  ];
  const prog = computeProgression(completeMatches);
  assert.equal(resolveGroupSlot("1st Group C", prog), "Alpha");
  assert.equal(resolveGroupSlot("2nd Group C", prog), "Beta");
  // Cross-group and match-winner slots are left for the provider.
  assert.equal(resolveGroupSlot("3rd Group A/B/C", prog), null);
  assert.equal(resolveGroupSlot("Winner Match 73", prog), null);

  // Incomplete group → cannot resolve.
  const partial = computeProgression([
    gm({ groupName: "Group C", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 2, awayScore: 0, status: "finished" }),
    gm({ groupName: "Group C", homeTeamName: "Gamma", awayTeamName: "Delta" }),
  ]);
  assert.equal(resolveGroupSlot("1st Group C", partial), null);
});

test("buildBracket orders rounds earliest to final and computes winners", () => {
  const input: BracketInputMatch[] = [
    { id: "f", stage: "Final", homeTeamName: "Brazil", awayTeamName: "France", homeScore: null, awayScore: null, status: "scheduled", kickoffAt: "2026-07-19T18:00:00Z" },
    { id: "r16a", stage: "Round of 16", homeTeamName: "Brazil", awayTeamName: "Ghana", homeScore: 2, awayScore: 1, status: "finished", kickoffAt: "2026-06-30T18:00:00Z" },
    { id: "qf1", stage: "Quarter-finals", homeTeamName: "Brazil", awayTeamName: "Spain", homeScore: 3, awayScore: 0, status: "finished", kickoffAt: "2026-07-05T18:00:00Z" },
  ];
  const rounds = buildBracket(input);
  assert.deepEqual(rounds.map((r) => r.name), ["Round of 16", "Quarter-finals", "Final"]);
  const r16 = rounds[0].matches[0];
  assert.equal(r16.winnerName, "Brazil");
  const final = rounds[2].matches[0];
  assert.equal(final.winnerName, null);
});

test("buildBracket excludes group-stage fixtures", () => {
  const input: BracketInputMatch[] = [
    { id: "g1", stage: "Group A", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 1, awayScore: 0, status: "finished", kickoffAt: null },
    { id: "k1", stage: "Round of 16", homeTeamName: "Brazil", awayTeamName: "Ghana", homeScore: 2, awayScore: 1, status: "finished", kickoffAt: null },
  ];
  const rounds = buildBracket(input);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].matches[0].id, "k1");
});

test("buildBracket excludes group matches identified by groupName even when stage lacks 'group'", () => {
  const input: BracketInputMatch[] = [
    // A group fixture whose stage text doesn't say "group" — only groupName does.
    { id: "g1", stage: "Matchday 1", groupName: "Group A", homeTeamName: "Alpha", awayTeamName: "Beta", homeScore: 1, awayScore: 0, status: "finished", kickoffAt: null },
    { id: "k1", stage: "Round of 16", groupName: null, homeTeamName: "Brazil", awayTeamName: "Ghana", homeScore: 2, awayScore: 1, status: "finished", kickoffAt: null },
  ];
  const rounds = buildBracket(input);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].matches[0].id, "k1");
});

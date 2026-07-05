import test from "node:test";
import assert from "node:assert/strict";
import {
  computeGroupStandings,
  computeProgression,
  resolveGroupSlot,
  resolveThirdPlaceSlot,
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

// Build a strict 1>2>3>4 four-team group. Points are always 9/6/3/0 so
// positions are fixed regardless of margins; scorelines only tune the
// third-placed team's goal difference so we can control which thirds rank best.
// `strongThird` → the 3rd team posts a strong GD (advances); otherwise a poor
// GD (misses the cut).
function fifaGroup(letter: string, strongThird: boolean): MatchLike[] {
  const t = [`${letter}1`, `${letter}2`, `${letter}3`, `${letter}4`];
  const fin = (home: string, away: string, hs: number, as: number): MatchLike =>
    gm({ groupName: `Group ${letter}`, homeTeamName: home, awayTeamName: away, homeScore: hs, awayScore: as, status: "finished" });
  return [
    fin(t[0], t[1], 1, 0),
    fin(t[0], t[3], 1, 0),
    fin(t[1], t[3], 1, 0),
    // These three decide the 3rd team's goal difference.
    fin(t[0], t[2], strongThird ? 1 : 5, 0),
    fin(t[1], t[2], strongThird ? 1 : 5, 0),
    fin(t[2], t[3], strongThird ? 5 : 1, 0),
  ];
}

// A full 48-team World Cup group stage where groups B,D,E,F,I,J,K,L produce the
// eight best third-placed teams (matching the confirmed 2026 Annex C row), plus
// the 16 Round-of-32 fixtures needed for the engine to trust the capacity.
function worldCupMatches(): MatchLike[] {
  const qualifying = new Set(["B", "D", "E", "F", "I", "J", "K", "L"]);
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const matches: MatchLike[] = [];
  for (const g of groups) matches.push(...fifaGroup(g, qualifying.has(g)));
  for (let i = 0; i < 16; i++) {
    matches.push({
      stage: "Round of 32",
      groupName: null,
      homeTeamName: `Winner slot ${i}`,
      awayTeamName: `Runner-up slot ${i}`,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
    });
  }
  return matches;
}

test("computeProgression records the qualifying third-place groups for the 48-team format", () => {
  const prog = computeProgression(worldCupMatches());
  assert.equal(prog.groupStageComplete, true);
  assert.deepEqual(prog.qualifyingThirdGroups, ["B", "D", "E", "F", "I", "J", "K", "L"]);
  // The four worst thirds are out; the eight qualifiers are not.
  for (const g of ["A", "C", "G", "H"]) assert.equal(prog.eliminatedTeamNames.has(`${g.toLowerCase()}3`), true);
  for (const g of ["B", "D", "E", "F", "I", "J", "K", "L"]) assert.equal(prog.eliminatedTeamNames.has(`${g.toLowerCase()}3`), false);
});

test("resolveThirdPlaceSlot fills cross-group placeholders via the FIFA Annex C table", () => {
  const prog = computeProgression(worldCupMatches());
  // Confirmed 2026 mapping for the B,D,E,F,I,J,K,L combination:
  //   1A vs 3E, 1B vs 3J, 1D vs 3B, 1E vs 3D, 1G vs 3I, 1I vs 3F, 1K vs 3L, 1L vs 3K.
  // Each slot's candidate-group set names the winner column it belongs to.
  assert.equal(resolveThirdPlaceSlot("Third-place Group C/E/F/H/I", prog), "E3"); // winner A → 3E
  assert.equal(resolveThirdPlaceSlot("Third-place Group E/F/G/I/J", prog), "J3"); // winner B → 3J
  assert.equal(resolveThirdPlaceSlot("Third-place Group B/E/F/I/J", prog), "B3"); // winner D → 3B
  assert.equal(resolveThirdPlaceSlot("Third-place Group A/B/C/D/F", prog), "D3"); // winner E → 3D
  assert.equal(resolveThirdPlaceSlot("Third-place Group A/E/H/I/J", prog), "I3"); // winner G → 3I
  assert.equal(resolveThirdPlaceSlot("Third-place Group C/D/F/G/H", prog), "F3"); // winner I → 3F
  assert.equal(resolveThirdPlaceSlot("Third-place Group D/E/I/J/L", prog), "L3"); // winner K → 3L
  assert.equal(resolveThirdPlaceSlot("Third-place Group E/H/I/J/K", prog), "K3"); // winner L → 3K
  // Alternate placeholder spelling ("3rd") resolves the same way.
  assert.equal(resolveThirdPlaceSlot("3rd Group A/B/C/D/F", prog), "D3");
});

test("resolveThirdPlaceSlot stays off until the qualifying thirds are proven", () => {
  // No knockout fixtures yet → capacity untrusted → qualifyingThirdGroups null.
  const qualifying = new Set(["B", "D", "E", "F", "I", "J", "K", "L"]);
  const noKo: MatchLike[] = [];
  for (const g of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
    noKo.push(...fifaGroup(g, qualifying.has(g)));
  }
  const prog = computeProgression(noKo);
  assert.equal(prog.qualifyingThirdGroups, null);
  assert.equal(resolveThirdPlaceSlot("Third-place Group A/B/C/D/F", prog), null);
});

test("resolveThirdPlaceSlot leaves single-group and unknown slots for the provider", () => {
  const prog = computeProgression(worldCupMatches());
  // A single-group placeholder isn't a cross-group third slot — resolveGroupSlot's job.
  assert.equal(resolveThirdPlaceSlot("3rd Group C", prog), null);
  // A group-set that matches no Round-of-32 fixture can't be placed.
  assert.equal(resolveThirdPlaceSlot("Third-place Group A/B", prog), null);
  // Real team names and non-third placeholders are untouched.
  assert.equal(resolveThirdPlaceSlot("Brazil", prog), null);
  assert.equal(resolveThirdPlaceSlot("Winner Match 73", prog), null);
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

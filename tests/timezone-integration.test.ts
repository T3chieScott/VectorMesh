// Integration test for Task #136: a 14:00 London block scheduled in summer
// must fire at 13:00 UTC (BST = UTC+1), not 14:00 UTC.
//
// This exercises the *real* contentResolver end-to-end with a stub deps
// object that mirrors what the database would return. Before the tz fix,
// `evaluateTimeRule` compared "14:00" to the server's UTC clock, so a
// 14:00 BST block "fired" only at 14:00 UTC = 15:00 BST — an hour late.

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScreenContent,
  type ResolverDeps,
} from "../server/contentResolver";
import type {
  Event,
  LayoutTemplate,
  LiveOverride,
  Playlist,
  Programme,
  ProgrammeVersion,
  ScheduleBlock,
  Screen,
  TimeRule,
} from "../shared/schema";

function makeScreen(): Screen {
  return {
    id: "screen-london",
    name: "London Foyer",
    clientId: "client-london",
    isPaired: true,
    pairingCode: null,
    deviceTokenHash: null,
    deviceFingerprint: null,
    lastSeen: null,
    locationLat: null,
    locationLng: null,
    timezone: null,
    weatherCity: null,
    location: null,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    displayProfileId: null,
    rotation: 0,
    screenshotEnabled: false,
    presetId: null,
    refreshRequestedAt: null,
    screenshotRequestedAt: null,
    lastRefreshFulfilledAt: null,
    lastScreenshotFulfilledAt: null,
    notes: null,
    createdAt: new Date(),
  } as Screen;
}

function makeLayout(): LayoutTemplate {
  return {
    id: "layout-1",
    name: "Foyer Layout",
    width: 1920,
    height: 1080,
    zones: [],
    background: null,
    clientId: null,
    isShared: true,
    createdById: null,
    createdAt: new Date(),
  } as unknown as LayoutTemplate;
}

function makeEvent(): Event {
  return {
    id: "evt-conf",
    name: "Conference 2026",
    clientId: "client-london",
    startDate: new Date("2026-07-01"),
    endDate: new Date("2026-07-31"),
    notes: null,
    createdAt: new Date(),
  } as Event;
}

function makeProgramme(): Programme {
  return {
    id: "prog-1",
    name: "Day 1",
    eventId: "evt-conf",
    createdAt: new Date(),
  } as Programme;
}

function makeVersion(): ProgrammeVersion {
  return {
    id: "ver-1",
    programmeId: "prog-1",
    versionNumber: 1,
    status: "published",
    publishedAt: new Date(),
    publishedById: null,
    createdById: null,
    createdAt: new Date(),
  } as ProgrammeVersion;
}

function makeBlock(rule: TimeRule): ScheduleBlock {
  return {
    id: "block-1",
    programmeVersionId: "ver-1",
    name: "Afternoon block",
    priority: 0,
    layoutTemplateId: "layout-1",
    targets: [],
    timeRules: [rule],
    zoneSources: [],
    seriesId: null,
    createdAt: new Date(),
  } as unknown as ScheduleBlock;
}

function makeDeps(block: ScheduleBlock): ResolverDeps {
  const layout = makeLayout();
  const programme = makeProgramme();
  const version = makeVersion();
  const event = makeEvent();
  return {
    getLiveOverrides: async () => [],
    getCurrentEventForScreen: async () => event,
    getProgrammes: async () => [programme],
    getProgrammeVersions: async () => [version],
    getScheduleBlocks: async () => [block],
    getLayoutTemplate: async () => layout,
    getScreenGroupIds: async () => [],
    getPlaylist: async () => undefined,
  };
}

// 2026-07-15 is mid-summer; London = BST = UTC+1.
// "14:00" wall-clock in London == 13:00 UTC.
// Our test instant is 13:30 UTC == 14:30 BST — squarely inside a 14:00..15:00
// London block.

const BST_MID_BLOCK_UTC = new Date("2026-07-15T13:30:00Z");
const BST_BEFORE_BLOCK_UTC = new Date("2026-07-15T12:30:00Z"); // 13:30 BST — before the 14:00 BST block
const BST_AFTER_BLOCK_UTC = new Date("2026-07-15T14:30:00Z"); // 15:30 BST — after the 15:00 BST end

test("Europe/London 14:00 block fires at 13:30 UTC (= 14:30 BST) in summer", async () => {
  const block = makeBlock({
    daysOfWeek: [3], // Wednesday — 2026-07-15 is a Wednesday in London tz
    startTime: "14:00",
    endTime: "15:00",
  } as TimeRule);
  const result = await resolveScreenContent(
    makeScreen(),
    BST_MID_BLOCK_UTC,
    makeDeps(block),
    "Europe/London",
  );
  assert.equal(result.layout?.id, "layout-1", "expected the 14:00 London block to fire");
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "block");
});

test("Europe/London 14:00 block does NOT fire at 12:30 UTC (= 13:30 BST, before start) in summer", async () => {
  const block = makeBlock({
    daysOfWeek: [3],
    startTime: "14:00",
    endTime: "15:00",
  } as TimeRule);
  const result = await resolveScreenContent(
    makeScreen(),
    BST_BEFORE_BLOCK_UTC,
    makeDeps(block),
    "Europe/London",
  );
  assert.equal(result.layout, null, "block must not fire before its 14:00 BST start");
});

test("Europe/London 14:00 block does NOT fire at 14:30 UTC (= 15:30 BST, after end) in summer", async () => {
  const block = makeBlock({
    daysOfWeek: [3],
    startTime: "14:00",
    endTime: "15:00",
  } as TimeRule);
  const result = await resolveScreenContent(
    makeScreen(),
    BST_AFTER_BLOCK_UTC,
    makeDeps(block),
    "Europe/London",
  );
  assert.equal(result.layout, null, "block must not fire after its 15:00 BST end");
});

test("Europe/London serverTz trace describes the evaluation tz with offset", async () => {
  const block = makeBlock({
    daysOfWeek: [3],
    startTime: "14:00",
    endTime: "15:00",
  } as TimeRule);
  const result = await resolveScreenContent(
    makeScreen(),
    BST_MID_BLOCK_UTC,
    makeDeps(block),
    "Europe/London",
  );
  const screenInfo = result.trace.find((s) => s.kind === "screen-info");
  assert.ok(screenInfo);
  const tzText = screenInfo!.kind === "screen-info" ? screenInfo.serverTz : "";
  assert.match(tzText, /Europe\/London/);
  assert.match(tzText, /BST|UTC\+1/);
});

test("Europe/London winter: 14:00 block fires at 14:00 UTC (= 14:00 GMT)", async () => {
  // Mirror test for the GMT half of the year so we know we haven't broken
  // winter-time scheduling. 2026-01-15 is a Thursday in London.
  const block = makeBlock({
    daysOfWeek: [4],
    startTime: "14:00",
    endTime: "15:00",
  } as TimeRule);
  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-01-15T14:30:00Z"),
    makeDeps(block),
    "Europe/London",
  );
  assert.equal(result.layout?.id, "layout-1");
});

// =============================================================================
// Task #139: DST coverage for the live-override branch and fallback playlists.
//
// The override branch in `resolveScreenContent` compares `now` against the
// override's stored startTime / endTime — both are absolute UTC instants in
// the DB schema, so the comparison is intrinsically tz-agnostic. These tests
// pin that behaviour by exercising real Europe/London DST transitions:
//
//   * Spring-forward (2026-03-29): the wall clock jumps from 01:00 GMT to
//     02:00 BST. Wall times in [01:00, 02:00) on that calendar day do not
//     exist. An override authored to span that gap must still fire by UTC
//     instant rather than wall time.
//   * Fall-back (2026-10-25): the wall clock jumps from 02:00 BST back to
//     01:00 GMT. Wall times in [01:00, 02:00) happen twice. An override that
//     is "active" at either occurrence must fire.
// =============================================================================

function makeOverrideDeps(opts: {
  override: LiveOverride;
  layouts?: Record<string, LayoutTemplate>;
}): ResolverDeps {
  return {
    getLiveOverrides: async () => [opts.override],
    getCurrentEventForScreen: async () => undefined,
    getProgrammes: async () => [],
    getProgrammeVersions: async () => [],
    getScheduleBlocks: async () => [],
    getLayoutTemplate: async (id: string) => opts.layouts?.[id],
    getScreenGroupIds: async () => [],
    getPlaylist: async () => undefined,
  };
}

function makeOverride(
  startUtc: string,
  endUtc: string,
  layoutTemplateId: string | null = "layout-1",
): LiveOverride {
  return {
    id: "ov-dst",
    eventId: null,
    name: "DST coverage override",
    priority: 100,
    targets: [],
    layoutTemplateId,
    zoneSources: [],
    startTime: new Date(startUtc),
    endTime: new Date(endUtc),
    isActive: true,
    presetId: null,
    createdById: null,
    createdAt: new Date(),
  } as LiveOverride;
}

test("live override spanning the London spring-forward gap fires inside the gap", async () => {
  // 2026-03-29 in London: wall jumps 01:00 GMT → 02:00 BST.
  // Override window: 00:30 GMT (00:30 UTC) → 03:30 BST (02:30 UTC).
  // Test instant: 02:00 UTC = 03:00 BST — inside the override.
  const layout = makeLayout();
  const override = makeOverride(
    "2026-03-29T00:30:00Z",
    "2026-03-29T02:30:00Z",
  );
  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-03-29T02:00:00Z"),
    makeOverrideDeps({ override, layouts: { [layout.id]: layout } }),
    "Europe/London",
  );
  assert.equal(result.layout?.id, layout.id, "override must fire across the gap");
  assert.equal(result.liveOverride?.id, override.id);
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "live-override");
});

test("live override does NOT fire after its UTC endTime on a spring-forward day", async () => {
  // Same window as above. Test instant: 02:31 UTC = 03:31 BST — one minute
  // past the override's 02:30 UTC end. Must not fire.
  const layout = makeLayout();
  const override = makeOverride(
    "2026-03-29T00:30:00Z",
    "2026-03-29T02:30:00Z",
  );
  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-03-29T02:31:00Z"),
    makeOverrideDeps({ override, layouts: { [layout.id]: layout } }),
    "Europe/London",
  );
  assert.equal(result.layout, null, "override must end at its UTC endTime, not its wall time");
  assert.equal(result.liveOverride, null);
});

test("live override fires at the FIRST occurrence of duplicated wall time on London fall-back day", async () => {
  // 2026-10-25 in London: wall jumps 02:00 BST → 01:00 GMT.
  // Override window: 00:00 BST 2026-10-25 (= 2026-10-24 23:00 UTC) →
  //                  02:00 GMT 2026-10-25 (= 2026-10-25 02:00 UTC).
  // Test instant: 00:30 UTC = 01:30 BST (FIRST 01:30 occurrence).
  const layout = makeLayout();
  const override = makeOverride(
    "2026-10-24T23:00:00Z",
    "2026-10-25T02:00:00Z",
  );
  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-10-25T00:30:00Z"),
    makeOverrideDeps({ override, layouts: { [layout.id]: layout } }),
    "Europe/London",
  );
  assert.equal(result.layout?.id, layout.id, "override must fire at the first 01:30 wall instance");
});

test("live override fires at the SECOND occurrence of duplicated wall time on London fall-back day", async () => {
  // Same override window. Test instant: 01:30 UTC = 01:30 GMT (SECOND
  // 01:30 occurrence after the fall-back). The override's UTC endTime
  // (02:00 UTC) is still in the future, so it must still fire.
  const layout = makeLayout();
  const override = makeOverride(
    "2026-10-24T23:00:00Z",
    "2026-10-25T02:00:00Z",
  );
  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-10-25T01:30:00Z"),
    makeOverrideDeps({ override, layouts: { [layout.id]: layout } }),
    "Europe/London",
  );
  assert.equal(
    result.layout?.id,
    layout.id,
    "override must keep firing through the duplicated wall hour",
  );
});

test("live override does NOT fire after fall-back end (post-02:00 GMT)", async () => {
  // Same override. Test instant: 02:01 UTC = 02:01 GMT — past end.
  const layout = makeLayout();
  const override = makeOverride(
    "2026-10-24T23:00:00Z",
    "2026-10-25T02:00:00Z",
  );
  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-10-25T02:01:00Z"),
    makeOverrideDeps({ override, layouts: { [layout.id]: layout } }),
    "Europe/London",
  );
  assert.equal(result.layout, null);
});

// =============================================================================
// Fallback playlists at local-day boundaries
//
// Schedule blocks bound by `startDate` / `endDate` use local-day boundaries
// in the screen's tz (via `startOfDayInTz` / `endOfDayInTz`). After a block's
// local end-of-day, the screen-level fallback playlist must take over — even
// when "after" the local end-of-day means before the corresponding UTC date
// boundary because of a DST jump.
// =============================================================================

function makePlaylist(): Playlist {
  return {
    id: "fb-playlist",
    name: "After-hours playlist",
    eventId: null,
    clientId: "client-london",
    createdAt: new Date(),
  } as unknown as Playlist;
}

function makeFallbackPlaylistDeps(opts: {
  block: ScheduleBlock;
  screen: Screen;
  layout: LayoutTemplate;
  playlist: Playlist;
}): ResolverDeps {
  const programme = makeProgramme();
  const version = makeVersion();
  const event = makeEvent();
  return {
    getLiveOverrides: async () => [],
    getCurrentEventForScreen: async () => event,
    getProgrammes: async () => [programme],
    getProgrammeVersions: async () => [version],
    getScheduleBlocks: async () => [opts.block],
    getLayoutTemplate: async (id: string) =>
      id === opts.layout.id ? opts.layout : undefined,
    getScreenGroupIds: async () => [],
    getPlaylist: async (id: string) =>
      id === opts.playlist.id ? opts.playlist : undefined,
  };
}

test("fallback playlist takes over after a date-bounded block ends at the London local-day boundary (spring-forward day)", async () => {
  // Block runs only on 2026-03-29 (London spring-forward Sunday — the local
  // day is only 23 hours long because wall jumps 01:00 GMT → 02:00 BST).
  // The local day ends at 2026-03-30 00:00 BST, which is 2026-03-29 23:00
  // UTC. The DST trap: a naive UTC midnight check would keep the block
  // "alive" until 2026-03-30 00:00 UTC, an extra hour past its local-day end.
  const layout = makeLayout();
  const playlist = makePlaylist();
  const screen = { ...makeScreen(), fallbackPlaylistId: playlist.id } as Screen;
  const block = makeBlock({
    startDate: "2026-03-29",
    endDate: "2026-03-29",
  } as TimeRule);
  const deps = makeFallbackPlaylistDeps({ block, screen, layout, playlist });
  // 2026-03-29 23:30 UTC = 2026-03-30 00:30 BST — past local end-of-day.
  const result = await resolveScreenContent(
    screen,
    new Date("2026-03-29T23:30:00Z"),
    deps,
    "Europe/London",
  );
  assert.equal(result.layout, null, "block must not fire past its local end-of-day");
  assert.equal(result.activeZoneSources.length, 1);
  assert.equal(result.activeZoneSources[0].playlistId, playlist.id);
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "fallback-playlist");
});

test("date-bounded block STILL fires inside its 23-hour spring-forward local day (block authored for 2026-03-29)", async () => {
  // Companion to above: block ending 2026-03-29 must fire at 22:30 UTC =
  // 23:30 BST — still inside the (shortened) local day. Confirms we don't
  // truncate the block early.
  const layout = makeLayout();
  const playlist = makePlaylist();
  const screen = { ...makeScreen(), fallbackPlaylistId: playlist.id } as Screen;
  const block = makeBlock({
    startDate: "2026-03-29",
    endDate: "2026-03-29",
  } as TimeRule);
  const deps = makeFallbackPlaylistDeps({ block, screen, layout, playlist });
  const result = await resolveScreenContent(
    screen,
    new Date("2026-03-29T22:30:00Z"),
    deps,
    "Europe/London",
  );
  assert.equal(
    result.layout?.id,
    layout.id,
    "block must fire at 23:30 BST on the spring-forward day",
  );
});

test("date-bounded block STILL fires inside its London local day even when UTC clock has rolled over", async () => {
  // Inverse: a block bound to 2026-10-24 (BST) must keep firing until
  // 2026-10-25 00:00 BST (= 2026-10-24 23:00 UTC). Test at 22:30 UTC =
  // 23:30 BST — still inside the local day. Cross-checks `endOfDayInTz`.
  const layout = makeLayout();
  const playlist = makePlaylist();
  const screen = { ...makeScreen(), fallbackPlaylistId: playlist.id } as Screen;
  const block = makeBlock({
    startDate: "2026-10-24",
    endDate: "2026-10-24",
  } as TimeRule);
  const deps = makeFallbackPlaylistDeps({ block, screen, layout, playlist });
  const result = await resolveScreenContent(
    screen,
    new Date("2026-10-24T22:30:00Z"),
    deps,
    "Europe/London",
  );
  assert.equal(
    result.layout?.id,
    layout.id,
    "block must still fire until its London local end-of-day",
  );
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "block");
});

test("fallback playlist takes over once block ends at the London local-day boundary (fall-back day)", async () => {
  // Same block as above. At 2026-10-24 23:30 UTC = 2026-10-25 00:30 BST,
  // the local day has rolled over. (Fall-back is at 02:00 BST on the 25th,
  // which is well after this instant — but the same evaluator must still
  // pick the right local boundary.)
  const layout = makeLayout();
  const playlist = makePlaylist();
  const screen = { ...makeScreen(), fallbackPlaylistId: playlist.id } as Screen;
  const block = makeBlock({
    startDate: "2026-10-24",
    endDate: "2026-10-24",
  } as TimeRule);
  const deps = makeFallbackPlaylistDeps({ block, screen, layout, playlist });
  const result = await resolveScreenContent(
    screen,
    new Date("2026-10-24T23:30:00Z"),
    deps,
    "Europe/London",
  );
  assert.equal(result.layout, null, "block must end at its local end-of-day");
  assert.equal(result.activeZoneSources[0]?.playlistId, playlist.id);
});

test("scheduled wall-time block on a London fall-back day fires once (not twice) at the requested wall time", async () => {
  // Schedule a 14:00–15:00 block on 2026-10-25 (Sun) — long after the 02:00
  // BST→GMT fall-back. There's only one 14:00 wall instance that day, and
  // it lands at 14:00 UTC because by then we've rolled into GMT.
  const layout = makeLayout();
  const playlist = makePlaylist();
  const screen = { ...makeScreen(), fallbackPlaylistId: playlist.id } as Screen;
  const block = makeBlock({
    daysOfWeek: [0], // Sunday — 2026-10-25 is Sun in London.
    startTime: "14:00",
    endTime: "15:00",
  } as TimeRule);
  const deps = makeFallbackPlaylistDeps({ block, screen, layout, playlist });

  const inside = await resolveScreenContent(
    screen,
    new Date("2026-10-25T14:30:00Z"),
    deps,
    "Europe/London",
  );
  assert.equal(inside.layout?.id, layout.id, "block must fire at 14:30 GMT after fall-back");

  // 13:30 UTC = 13:30 GMT (still pre-block) — must NOT fire; fallback playlist takes over.
  const before = await resolveScreenContent(
    screen,
    new Date("2026-10-25T13:30:00Z"),
    deps,
    "Europe/London",
  );
  assert.equal(before.layout, null);
  assert.equal(before.activeZoneSources[0]?.playlistId, playlist.id);
});

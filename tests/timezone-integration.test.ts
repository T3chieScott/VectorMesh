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

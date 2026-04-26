import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScreenContent,
  type ResolverDeps,
} from "../server/contentResolver";
import {
  resolveSimulatorContent,
  summariseForSimulator,
  withSimulatorClientScope,
} from "../server/simulatorContent";
import type {
  Event,
  LayoutTemplate,
  LiveOverride,
  Playlist,
  Programme,
  ProgrammeVersion,
  ScheduleBlock,
  Screen,
} from "../shared/schema";

function makeScreen(overrides: Partial<Screen> = {}): Screen {
  return {
    id: "screen-1",
    name: "Test Screen",
    clientId: "client-1",
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
    ...overrides,
  } as Screen;
}

function makeBlock(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: "block-1",
    programmeVersionId: "version-1",
    name: "Test Block",
    priority: 0,
    layoutTemplateId: null,
    targets: [],
    timeRules: [],
    zoneSources: [],
    seriesId: null,
    createdAt: new Date(),
    ...overrides,
  } as ScheduleBlock;
}

function makeLayout(id: string, name: string): LayoutTemplate {
  return {
    id,
    name,
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

function makeProgramme(id: string, eventId: string): Programme {
  return {
    id,
    name: `Programme ${id}`,
    eventId,
    createdAt: new Date(),
  } as Programme;
}

function makeVersion(
  id: string,
  programmeId: string,
  status: "draft" | "published" = "published",
  versionNumber = 1,
): ProgrammeVersion {
  return {
    id,
    programmeId,
    versionNumber,
    status,
    publishedAt: status === "published" ? new Date() : null,
    publishedById: null,
    createdById: null,
    createdAt: new Date(),
  } as ProgrammeVersion;
}

function makeEvent(id: string, clientId: string = "client-1"): Event {
  return {
    id,
    name: `Event ${id}`,
    clientId,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2027-01-01"),
    notes: null,
    createdAt: new Date(),
  } as Event;
}

interface DepBuilderOptions {
  overrides?: LiveOverride[];
  event?: Event | null;
  programmes?: Programme[];
  versions?: ProgrammeVersion[];
  blocksByVersion?: Record<string, ScheduleBlock[]>;
  layouts?: Record<string, LayoutTemplate>;
  screenGroupIds?: string[];
  playlists?: Record<string, Playlist>;
}

function makeDeps(opts: DepBuilderOptions = {}): ResolverDeps {
  return {
    getLiveOverrides: async () => opts.overrides ?? [],
    getCurrentEventForScreen: async () => opts.event ?? undefined,
    getProgrammes: async () => opts.programmes ?? [],
    getProgrammeVersions: async () => opts.versions ?? [],
    getScheduleBlocks: async (versionId: string) =>
      opts.blocksByVersion?.[versionId] ?? [],
    getLayoutTemplate: async (id: string) => opts.layouts?.[id],
    getScreenGroupIds: async () => opts.screenGroupIds ?? [],
    getPlaylist: async (id: string) => opts.playlists?.[id],
  };
}

// --- Parity ---

test("simulator and player resolve the same layout for the same screen at the same instant", async () => {
  const event = makeEvent("evt-1", "client-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "Scheduled Layout");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    name: "Morning Block",
  });

  const deps = makeDeps({
    event,
    programmes: [programme],
    versions: [version],
    blocksByVersion: { [version.id]: [block] },
    layouts: { [layout.id]: layout },
  });

  const screen = makeScreen({ clientId: "client-1" });
  const now = new Date("2026-04-25T12:00:00Z");

  const playerResult = await resolveScreenContent(screen, now, deps);
  // `allowed = null` mirrors an admin / system caller — no client-scope
  // restriction. In this case the simulator must resolve identically to
  // the player.
  const sim = await resolveSimulatorContent(screen, now, deps, null);

  assert.equal(sim.result.layout?.id, playerResult.layout?.id);
  assert.equal(sim.summary.layoutId, playerResult.layout?.id ?? null);
  assert.equal(sim.summary.layoutSource, "scheduled");
  assert.equal(sim.summary.layoutSourceDetail, "Morning Block");
  assert.equal(sim.summary.fallbackPlaylistId, null);
});

test("simulator parity: live override wins for both player and simulator", async () => {
  const layout = makeLayout("layout-ovr", "Override Layout");
  const override: LiveOverride = {
    id: "ovr-1",
    eventId: null,
    name: "Halftime Override",
    priority: 100,
    targets: [],
    layoutTemplateId: layout.id,
    zoneSources: [],
    startTime: new Date("2026-04-25T00:00:00Z"),
    endTime: new Date("2026-04-26T00:00:00Z"),
    isActive: true,
    presetId: null,
    createdById: null,
    createdAt: new Date(),
  } as LiveOverride;

  const deps = makeDeps({
    overrides: [override],
    layouts: { [layout.id]: layout },
  });

  const screen = makeScreen();
  const now = new Date("2026-04-25T12:00:00Z");

  const playerResult = await resolveScreenContent(screen, now, deps);
  const sim = await resolveSimulatorContent(screen, now, deps, null);

  assert.equal(playerResult.layout?.id, layout.id);
  assert.equal(sim.summary.layoutId, layout.id);
  assert.equal(sim.summary.layoutSource, "live_override");
  assert.equal(sim.summary.layoutSourceDetail, "Live Override");
});

test("simulator parity: fallback layout maps to layoutSource='fallback' / 'Fallback Layout'", async () => {
  const fbLayout = makeLayout("layout-fb", "Fallback");
  const screen = makeScreen({ fallbackLayoutId: fbLayout.id });
  const deps = makeDeps({ layouts: { [fbLayout.id]: fbLayout } });
  const now = new Date("2026-04-25T12:00:00Z");

  const playerResult = await resolveScreenContent(screen, now, deps);
  const sim = await resolveSimulatorContent(screen, now, deps, null);

  assert.equal(playerResult.layout?.id, fbLayout.id);
  assert.equal(sim.summary.layoutId, fbLayout.id);
  assert.equal(sim.summary.layoutSource, "fallback");
  assert.equal(sim.summary.layoutSourceDetail, "Fallback Layout");
  assert.equal(sim.summary.fallbackPlaylistId, null);
});

test("simulator parity: fallback playlist maps to layoutSource='fallback' / 'Fallback Playlist'", async () => {
  const playlist: Playlist = {
    id: "pl-1",
    name: "Fallback Playlist",
    description: null,
    clientId: null,
    isShared: true,
    createdById: null,
    createdAt: new Date(),
  } as unknown as Playlist;
  const screen = makeScreen({ fallbackPlaylistId: playlist.id });
  const deps = makeDeps({ playlists: { [playlist.id]: playlist } });
  const now = new Date("2026-04-25T12:00:00Z");

  const playerResult = await resolveScreenContent(screen, now, deps);
  const sim = await resolveSimulatorContent(screen, now, deps, null);

  assert.equal(playerResult.layout, null);
  assert.equal(sim.summary.layoutId, null);
  assert.equal(sim.summary.layoutSource, "fallback");
  assert.equal(sim.summary.layoutSourceDetail, "Fallback Playlist");
  assert.equal(sim.summary.fallbackPlaylistId, playlist.id);
});

test("simulator parity: nothing resolved → layoutSource='none'", async () => {
  const screen = makeScreen();
  const deps = makeDeps({});
  const now = new Date("2026-04-25T12:00:00Z");

  const playerResult = await resolveScreenContent(screen, now, deps);
  const sim = await resolveSimulatorContent(screen, now, deps, null);

  assert.equal(playerResult.layout, null);
  assert.equal(sim.summary.layoutId, null);
  assert.equal(sim.summary.layoutSource, "none");
  assert.equal(sim.summary.layoutSourceDetail, null);
  assert.equal(sim.summary.fallbackPlaylistId, null);
});

// --- Client-scope filtering (simulator-specific concern) ---

test("simulator hides scheduled content from events whose client is outside the requester's allow-list", async () => {
  // Event lives on client-2 but the requester can only see client-1.
  // The player would still resolve to the scheduled layout (no client
  // filtering on the device side), but the simulator preview must hide it.
  const event = makeEvent("evt-2", "client-2");
  const programme = makeProgramme("prog-2", event.id);
  const version = makeVersion("v-2", programme.id);
  const layout = makeLayout("layout-2", "Scheduled");
  const block = makeBlock({
    id: "block-2",
    programmeVersionId: version.id,
    layoutTemplateId: layout.id,
    name: "Scheduled Block",
  });

  // The screen also lives on client-2 (cross-tenant booking is allowed).
  const screen = makeScreen({ clientId: "client-2" });
  const deps = makeDeps({
    event,
    programmes: [programme],
    versions: [version],
    blocksByVersion: { [version.id]: [block] },
    layouts: { [layout.id]: layout },
  });
  const now = new Date("2026-04-25T12:00:00Z");

  // Player resolves the scheduled layout normally.
  const playerResult = await resolveScreenContent(screen, now, deps);
  assert.equal(playerResult.layout?.id, layout.id);

  // Simulator with allowed=[client-1] should NOT see the block (event
  // hidden by client-scope filtering) and falls through to "nothing".
  const restricted = await resolveSimulatorContent(screen, now, deps, [
    "client-1",
  ]);
  assert.equal(restricted.summary.layoutId, null);
  assert.equal(restricted.summary.layoutSource, "none");

  // Sanity: with the requester allowed to see client-2, parity is restored.
  const allowed = await resolveSimulatorContent(screen, now, deps, [
    "client-1",
    "client-2",
  ]);
  assert.equal(allowed.summary.layoutId, layout.id);
  assert.equal(allowed.summary.layoutSource, "scheduled");
});

test("simulator client-scope filtering does not affect live overrides or fallbacks", async () => {
  // An override or screen-level fallback should still apply for the
  // simulator preview even when the requester cannot see the booked event.
  const event = makeEvent("evt-3", "client-2"); // hidden from requester
  const programme = makeProgramme("prog-3", event.id);
  const version = makeVersion("v-3", programme.id);
  const blockLayout = makeLayout("layout-block", "Scheduled");
  const block = makeBlock({
    programmeVersionId: version.id,
    layoutTemplateId: blockLayout.id,
  });

  const fbLayout = makeLayout("layout-fb", "Fallback");
  const screen = makeScreen({
    clientId: "client-2",
    fallbackLayoutId: fbLayout.id,
  });
  const deps = makeDeps({
    event,
    programmes: [programme],
    versions: [version],
    blocksByVersion: { [version.id]: [block] },
    layouts: { [blockLayout.id]: blockLayout, [fbLayout.id]: fbLayout },
  });
  const now = new Date("2026-04-25T12:00:00Z");

  const sim = await resolveSimulatorContent(screen, now, deps, ["client-1"]);
  assert.equal(sim.summary.layoutId, fbLayout.id);
  assert.equal(sim.summary.layoutSource, "fallback");
  assert.equal(sim.summary.layoutSourceDetail, "Fallback Layout");
});

// --- Helper unit coverage ---

test("withSimulatorClientScope returns undefined when event client is forbidden", async () => {
  const event = makeEvent("evt-x", "client-X");
  const baseDeps = makeDeps({ event });
  const screen = makeScreen({ clientId: "client-X" });

  // allowed restricted to a different client.
  const scoped = withSimulatorClientScope(baseDeps, screen, ["client-Y"]);
  const result = await scoped.getCurrentEventForScreen(screen.id, new Date());
  assert.equal(result, undefined);

  // allowed=null = no restriction.
  const scopedOpen = withSimulatorClientScope(baseDeps, screen, null);
  const openResult = await scopedOpen.getCurrentEventForScreen(
    screen.id,
    new Date(),
  );
  assert.equal(openResult?.id, event.id);
});

test("summariseForSimulator carries blockName for scheduled outcomes", async () => {
  const event = makeEvent("evt-1", "client-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "Scheduled");
  const block = makeBlock({
    name: "Lunchtime",
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
  });

  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-04-25T12:00:00Z"),
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [block] },
      layouts: { [layout.id]: layout },
    }),
  );
  const summary = summariseForSimulator(result, makeScreen());
  assert.equal(summary.layoutSource, "scheduled");
  assert.equal(summary.layoutSourceDetail, "Lunchtime");
});

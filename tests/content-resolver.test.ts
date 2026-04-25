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

function makeEvent(id: string): Event {
  return {
    id,
    name: `Event ${id}`,
    clientId: "client-1",
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

test("no booking, no fallback → outcome is nothing and trace explains why", async () => {
  const screen = makeScreen();
  const deps = makeDeps({ event: null });
  const result = await resolveScreenContent(screen, new Date("2026-04-25T12:00:00Z"), deps);

  assert.equal(result.layout, null);
  assert.equal(result.activeZoneSources.length, 0);
  const eventStep = result.trace.find((s) => s.kind === "active-event");
  assert.ok(eventStep);
  assert.equal(eventStep!.kind === "active-event" && eventStep.matched, false);
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "nothing");
});

test("only-draft versions → block never even considered", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const draftVersion = makeVersion("v-draft", programme.id, "draft");
  const layout = makeLayout("layout-1", "L1");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: draftVersion.id,
  });

  const deps = makeDeps({
    event,
    programmes: [programme],
    versions: [draftVersion],
    blocksByVersion: { [draftVersion.id]: [block] },
    layouts: { [layout.id]: layout },
  });

  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-04-25T12:00:00Z"),
    deps,
  );

  assert.equal(result.layout, null);
  const versionStep = result.trace.find((s) => s.kind === "version-considered");
  assert.ok(versionStep);
  assert.equal(versionStep!.kind === "version-considered" && versionStep.included, false);
  const blockStep = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(blockStep, undefined);
});

test("target mismatch (different screen) → trace records target-mismatch", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    targets: [{ type: "screen", id: "some-other-screen" }],
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

  assert.equal(result.layout, null);
  const blockStep = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    blockStep?.kind === "block-evaluated" && blockStep.decision,
    "target-mismatch",
  );
});

test("group target match wins via screen group membership", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    targets: [{ type: "group", id: "grp-A" }],
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
      screenGroupIds: ["grp-A"],
    }),
  );

  assert.equal(result.layout?.id, layout.id);
});

test("outside date range → outside-date-range decision", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ startDate: "2027-01-01" }],
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

  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
    "outside-date-range",
  );
});

test("wrong day-of-week → wrong-day-of-week decision", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  // Saturday 2026-04-25 is day 6. Match only Mon-Fri.
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ daysOfWeek: [1, 2, 3, 4, 5] }],
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

  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
    "wrong-day-of-week",
  );
});

test("outside time-of-day window → outside-time-of-day decision (real POS02 case)", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  // Block plays 01:00-02:00 (server local). Server time stubbed at 00:36.
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ startTime: "01:00", endTime: "02:00" }],
  });

  const now = new Date();
  now.setHours(0, 36, 0, 0);

  const result = await resolveScreenContent(
    makeScreen(),
    now,
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [block] },
      layouts: { [layout.id]: layout },
    }),
  );

  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
    "outside-time-of-day",
  );
  assert.match(
    (step?.kind === "block-evaluated" && step.detail) || "",
    /01:00.*02:00/,
  );
});

test("overnight wrap window matches when 'now' is before midnight inside the window", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  // Window 22:00 → 02:00 (overnight wrap).
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ startTime: "22:00", endTime: "02:00" }],
  });

  const now = new Date();
  now.setHours(23, 30, 0, 0);

  const result = await resolveScreenContent(
    makeScreen(),
    now,
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [block] },
      layouts: { [layout.id]: layout },
    }),
  );

  assert.equal(result.layout?.id, layout.id);
});

test("missing layout (deleted) → layout-deleted, keep scanning", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const goodLayout = makeLayout("layout-good", "Good");
  const dead = makeBlock({
    id: "block-dead",
    name: "Dead Block",
    priority: 100,
    layoutTemplateId: "layout-missing",
    programmeVersionId: version.id,
  });
  const live = makeBlock({
    id: "block-live",
    name: "Live Block",
    priority: 50,
    layoutTemplateId: goodLayout.id,
    programmeVersionId: version.id,
  });

  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-04-25T12:00:00Z"),
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [dead, live] },
      layouts: { [goodLayout.id]: goodLayout },
    }),
  );

  assert.equal(result.layout?.id, goodLayout.id);
  const decisions = result.trace
    .filter((s) => s.kind === "block-evaluated")
    .map((s) => s.kind === "block-evaluated" && s.decision);
  assert.deepEqual(decisions, ["layout-deleted", "matched"]);
});

test("happy path: highest-priority matching block wins, others marked not-considered", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layoutHi = makeLayout("layout-hi", "Hi");
  const layoutLo = makeLayout("layout-lo", "Lo");
  const hi = makeBlock({
    id: "hi",
    priority: 100,
    layoutTemplateId: layoutHi.id,
    programmeVersionId: version.id,
  });
  const lo = makeBlock({
    id: "lo",
    priority: 1,
    layoutTemplateId: layoutLo.id,
    programmeVersionId: version.id,
  });

  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-04-25T12:00:00Z"),
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [lo, hi] },
      layouts: { [layoutHi.id]: layoutHi, [layoutLo.id]: layoutLo },
    }),
  );

  assert.equal(result.layout?.id, layoutHi.id);
  const decisions = result.trace
    .filter((s) => s.kind === "block-evaluated")
    .map((s) => s.kind === "block-evaluated" && { id: s.blockId, d: s.decision });
  assert.deepEqual(decisions, [
    { id: "hi", d: "matched" },
    { id: "lo", d: "not-considered" },
  ]);
});

test("screen-level fallback layout used when no booking", async () => {
  const fallback = makeLayout("layout-fb", "Fallback");
  const screen = makeScreen({ fallbackLayoutId: fallback.id });
  const result = await resolveScreenContent(
    screen,
    new Date("2026-04-25T12:00:00Z"),
    makeDeps({ event: null, layouts: { [fallback.id]: fallback } }),
  );
  assert.equal(result.layout?.id, fallback.id);
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "fallback-layout");
});

test("screen-level fallback playlist used when no layout anywhere", async () => {
  const playlist: Playlist = {
    id: "pl-1",
    name: "FB Playlist",
    clientId: "client-1",
    eventId: null,
    createdById: null,
    createdAt: new Date(),
  } as Playlist;
  const screen = makeScreen({ fallbackPlaylistId: playlist.id });
  const result = await resolveScreenContent(
    screen,
    new Date("2026-04-25T12:00:00Z"),
    makeDeps({ event: null, playlists: { [playlist.id]: playlist } }),
  );
  assert.equal(result.layout, null);
  assert.equal(result.activeZoneSources.length, 1);
  assert.equal(result.activeZoneSources[0].playlistId, playlist.id);
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(
    outcome?.kind === "outcome" && outcome.source,
    "fallback-playlist",
  );
});

test("live override layout wins over everything else", async () => {
  const layoutOv = makeLayout("layout-ov", "Override");
  const layoutBlock = makeLayout("layout-block", "Block");
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const block = makeBlock({
    layoutTemplateId: layoutBlock.id,
    programmeVersionId: version.id,
    priority: 100,
  });

  const now = new Date("2026-04-25T12:00:00Z");
  const override: LiveOverride = {
    id: "ov-1",
    eventId: event.id,
    name: "Emergency",
    priority: 100,
    targets: [],
    layoutTemplateId: layoutOv.id,
    zoneSources: [],
    startTime: new Date(now.getTime() - 60_000),
    endTime: new Date(now.getTime() + 60_000),
    isActive: true,
    presetId: null,
    createdById: null,
    createdAt: new Date(),
  } as LiveOverride;

  const result = await resolveScreenContent(
    makeScreen(),
    now,
    makeDeps({
      overrides: [override],
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [block] },
      layouts: { [layoutOv.id]: layoutOv, [layoutBlock.id]: layoutBlock },
    }),
  );

  assert.equal(result.layout?.id, layoutOv.id);
  assert.equal(result.liveOverride?.id, "ov-1");
  const overrideStep = result.trace.find((s) => s.kind === "live-override-check");
  assert.equal(
    overrideStep?.kind === "live-override-check" && overrideStep.matched,
    true,
  );
});

test("live override with deleted layout still applies zone sources (parity with legacy resolver)", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);

  const now = new Date("2026-04-25T12:00:00Z");
  const override: LiveOverride = {
    id: "ov-deleted",
    eventId: event.id,
    name: "Emergency",
    priority: 100,
    targets: [],
    layoutTemplateId: "layout-gone",
    zoneSources: [
      { zoneId: "__fallback__", type: "playlist", playlistId: "pl-7" },
    ],
    startTime: new Date(now.getTime() - 60_000),
    endTime: new Date(now.getTime() + 60_000),
    isActive: true,
    presetId: null,
    createdById: null,
    createdAt: new Date(),
  } as LiveOverride;

  const result = await resolveScreenContent(
    makeScreen(),
    now,
    makeDeps({
      overrides: [override],
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [] },
      // Deliberately omit "layout-gone" — simulate deletion.
    }),
  );

  // Parity: liveOverride + zoneSources must still be set even though layout is null.
  assert.equal(result.layout, null);
  assert.equal(result.liveOverride?.id, "ov-deleted");
  assert.equal(result.activeZoneSources.length, 1);
  assert.equal(result.activeZoneSources[0].playlistId, "pl-7");
});

test("block with no layout but a __fallback__ playlist zone source matches", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const block = makeBlock({
    programmeVersionId: version.id,
    zoneSources: [
      { zoneId: "__fallback__", type: "playlist", playlistId: "pl-99" },
    ],
  });

  const result = await resolveScreenContent(
    makeScreen(),
    new Date("2026-04-25T12:00:00Z"),
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [block] },
    }),
  );

  assert.equal(result.layout, null);
  assert.equal(result.activeZoneSources[0].playlistId, "pl-99");
  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
    "matched-block-fallback-playlist",
  );
});

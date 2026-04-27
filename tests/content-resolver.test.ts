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

test("group target mismatch → target-mismatch (screen not in group)", async () => {
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
      // Screen is in a different group than the block targets.
      screenGroupIds: ["grp-OTHER"],
    }),
  );

  assert.equal(result.layout, null);
  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
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
  now.setUTCHours(0, 36, 0, 0);

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
    "UTC",
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
  now.setUTCHours(23, 30, 0, 0);

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
    "UTC",
  );

  assert.equal(result.layout?.id, layout.id);
});

test("overnight wrap window REJECTS when 'now' falls in the gap between end and start", async () => {
  // Negative twin of the test above: the same wrap window 22:00 → 02:00
  // must explicitly reject 'now' values that sit in the gap between the
  // end of one cycle and the start of the next (e.g. 12:00 mid-day).
  // Locks the wrap-aware comparison branch so a future refactor that
  // accidentally treats startTime>endTime as an empty interval would
  // surface here.
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L1");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ startTime: "22:00", endTime: "02:00" }],
  });

  const now = new Date();
  now.setUTCHours(12, 0, 0, 0);

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
    "UTC",
  );

  assert.equal(result.layout, null);
  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
    "outside-time-of-day",
  );
  assert.match(
    (step?.kind === "block-evaluated" && step.detail) || "",
    /22:00.*02:00/,
  );
});

// Task #195 — pin the boundary-minute behaviour. Adjacent blocks
// (A: 10:00–10:05, B: 10:05–10:10) must hand off cleanly at exactly
// 10:05:00. Previously `nowMins > endMins` made the end minute
// inclusive, so A kept firing through 10:05:59; combined with the
// player's ~7s poll, operators saw a ~66s delay before B took over.
// End time is now exclusive at minute granularity.
test("__TEST_S195__ adjacent blocks hand off at exact boundary minute (10:05:00 → B fires, A does not)", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layoutA = makeLayout("layout-a", "A");
  const layoutB = makeLayout("layout-b", "B");
  // A and B share priority — without the fix the priority sort would
  // keep A winning through 10:05:59. The fix kicks A out at 10:05:00.
  const blockA = makeBlock({
    id: "block-a",
    name: "A",
    layoutTemplateId: layoutA.id,
    programmeVersionId: version.id,
    priority: 10,
    timeRules: [{ startTime: "10:00", endTime: "10:05" }],
  });
  const blockB = makeBlock({
    id: "block-b",
    name: "B",
    layoutTemplateId: layoutB.id,
    programmeVersionId: version.id,
    priority: 10,
    timeRules: [{ startTime: "10:05", endTime: "10:10" }],
  });

  const now = new Date();
  now.setUTCHours(10, 5, 0, 0);

  const result = await resolveScreenContent(
    makeScreen(),
    now,
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [blockA, blockB] },
      layouts: { [layoutA.id]: layoutA, [layoutB.id]: layoutB },
    }),
    "UTC",
  );

  assert.equal(result.layout?.id, layoutB.id, "B should win at 10:05:00");
});

test("__TEST_S195__ prior block still fires at the very last second of its minute (10:04:59)", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layoutA = makeLayout("layout-a", "A");
  const blockA = makeBlock({
    layoutTemplateId: layoutA.id,
    programmeVersionId: version.id,
    timeRules: [{ startTime: "10:00", endTime: "10:05" }],
  });

  const now = new Date();
  now.setUTCHours(10, 4, 59, 999);

  const result = await resolveScreenContent(
    makeScreen(),
    now,
    makeDeps({
      event,
      programmes: [programme],
      versions: [version],
      blocksByVersion: { [version.id]: [blockA] },
      layouts: { [layoutA.id]: layoutA },
    }),
    "UTC",
  );

  assert.equal(result.layout?.id, layoutA.id);
});

test("__TEST_S195__ overnight-wrap window stops firing at exact end boundary (02:00:00)", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ startTime: "22:00", endTime: "02:00" }],
  });

  const now = new Date();
  now.setUTCHours(2, 0, 0, 0);

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
    "UTC",
  );

  assert.equal(result.layout, null, "wrap window must end at exactly 02:00:00");
  const step = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    step?.kind === "block-evaluated" && step.decision,
    "outside-time-of-day",
  );
});

// Pin the pre-existing `startTime === endTime` behaviour so the
// minute-exclusive end-time refactor doesn't accidentally flip it.
// Today the resolver treats equal start/end as a 24h always-on
// window (it falls into the overnight-wrap branch where
// `endMins <= startMins`, and `now < start && now >= end` is never
// true at any minute). If a future task wants to redefine this as
// an empty/never-firing window instead, this test will fail loudly.
test("__TEST_S195__ startTime === endTime keeps existing 24h-always-on semantics", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ startTime: "10:00", endTime: "10:00" }],
  });

  for (const [h, m] of [
    [9, 59],
    [10, 0],
    [10, 30],
    [23, 59],
  ] as const) {
    const now = new Date();
    now.setUTCHours(h, m, 0, 0);
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
      "UTC",
    );
    assert.equal(
      result.layout?.id,
      layout.id,
      `expected always-on match at ${h}:${m}`,
    );
  }
});

test("__TEST_S195__ standalone endTime (no startTime) is also exclusive at the boundary", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = makeLayout("layout-1", "L");
  const block = makeBlock({
    layoutTemplateId: layout.id,
    programmeVersionId: version.id,
    timeRules: [{ endTime: "10:05" }],
  });

  const now = new Date();
  now.setUTCHours(10, 5, 0, 0);

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
    "UTC",
  );

  assert.equal(result.layout, null);
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

test("live override with deleted layout + matching active block: parity allows block to take over layout/zoneSources but liveOverride still reported", async () => {
  // Locks in the byte-for-byte parity with the legacy inline player code:
  // when an active live override references a deleted layout, the override's
  // liveOverride field is still reported (so admins can see it was active)
  // but a matching scheduled block can replace `layout` and
  // `activeZoneSources`. If we ever change that precedence, this test fails
  // and forces us to update T002's "player payload identical" claim.
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const blockLayout = makeLayout("layout-block", "Block Layout");
  const block = makeBlock({
    layoutTemplateId: blockLayout.id,
    programmeVersionId: version.id,
    zoneSources: [{ zoneId: "z1", type: "playlist", playlistId: "pl-block" }],
  });

  const now = new Date("2026-04-25T12:00:00Z");
  const override: LiveOverride = {
    id: "ov-deleted-layout",
    eventId: event.id,
    name: "Emergency",
    priority: 100,
    targets: [],
    layoutTemplateId: "layout-gone",
    zoneSources: [
      { zoneId: "__fallback__", type: "playlist", playlistId: "pl-override" },
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
      blocksByVersion: { [version.id]: [block] },
      layouts: { [blockLayout.id]: blockLayout },
      // "layout-gone" intentionally omitted to simulate deletion.
    }),
  );

  // Override is still reported on the response.
  assert.equal(result.liveOverride?.id, "ov-deleted-layout");
  // Block wins layout + zoneSources because the legacy code falls through.
  assert.equal(result.layout?.id, blockLayout.id);
  assert.equal(result.activeZoneSources[0].playlistId, "pl-block");
  // Outcome trace ends with the block, not the override.
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.equal(outcome?.kind === "outcome" && outcome.source, "block");
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

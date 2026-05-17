// Task #214 — pin the agenda-block resolver branch and the
// mutually-exclusive UI rules in the BlockEditorDialog.
//
// The resolver in server/contentResolver.ts (Task #209) synthesises a
// fullscreen "__fallback__" zone source of type "agenda" when a
// matched schedule block has agendaConfigId set and no layout. The
// dialog enforces three rules so operators can't save contradictory
// blocks:
//   1. Picking a layout clears the agenda selection.
//   2. Picking an agenda disables the fallback playlist picker.
//   3. Picking a fallback playlist disables the agenda picker.
//
// Without coverage a regression in either side would only surface on
// a live screen at run time — this file locks both down.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveScreenContent, type ResolverDeps } from "../server/contentResolver";
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

// ---------- shared fixture helpers (mirroring content-resolver.test.ts) ----------

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

function makeProgramme(id: string, eventId: string): Programme {
  return { id, name: `Programme ${id}`, eventId, createdAt: new Date() } as Programme;
}

function makeVersion(id: string, programmeId: string): ProgrammeVersion {
  return {
    id,
    programmeId,
    versionNumber: 1,
    status: "published",
    publishedAt: new Date(),
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

function makeDeps(opts: {
  event?: Event | null;
  programmes?: Programme[];
  versions?: ProgrammeVersion[];
  blocksByVersion?: Record<string, ScheduleBlock[]>;
  layouts?: Record<string, LayoutTemplate>;
  overrides?: LiveOverride[];
  playlists?: Record<string, Playlist>;
  screenGroupIds?: string[];
} = {}): ResolverDeps {
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

// ==================== resolver coverage ====================

test("__TEST_S214__ block with agendaConfigId and no layout → synthetic fullscreen agenda zone source, outcome 'block'", async () => {
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const AGENDA_ID = "agenda-cfg-xyz";
  const block = makeBlock({
    id: "block-agenda",
    name: "Agenda Block",
    programmeVersionId: version.id,
    layoutTemplateId: null,
    zoneSources: [],
    agendaConfigId: AGENDA_ID,
  } as Partial<ScheduleBlock> & { agendaConfigId: string });

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

  // Single synthetic fullscreen agenda zone source carrying the id.
  assert.equal(result.layout, null, "agenda blocks resolve without a layout");
  assert.equal(result.activeZoneSources.length, 1);
  const zs = result.activeZoneSources[0] as {
    zoneId: string;
    type: string;
    agendaConfigId?: string;
  };
  assert.equal(zs.zoneId, "__fallback__");
  assert.equal(zs.type, "agenda");
  assert.equal(zs.agendaConfigId, AGENDA_ID);

  // Outcome must record this as a block hit (not fallback-layout /
  // fallback-playlist), so heartbeats and the trace UI attribute the
  // content to the right programme.
  const outcome = result.trace.find((s) => s.kind === "outcome");
  assert.ok(outcome && outcome.kind === "outcome");
  assert.equal(outcome.kind === "outcome" && outcome.source, "block");
  assert.equal(
    outcome.kind === "outcome" && outcome.blockId,
    "block-agenda",
  );

  // The block-evaluated trace entry must use the dedicated decision
  // string so the schedule diagnostics panel can surface it.
  const blockStep = result.trace.find((s) => s.kind === "block-evaluated");
  assert.ok(blockStep && blockStep.kind === "block-evaluated");
  assert.equal(
    blockStep.kind === "block-evaluated" && blockStep.decision,
    "matched-block-fallback-agenda",
  );
});

test("__TEST_S214__ layout wins over agendaConfigId when both are set on the same block", async () => {
  // Defensive: even though the UI prevents this combo, the resolver
  // must prefer the layout branch so a stale-data block doesn't fall
  // through to the synthetic agenda source.
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const layout = {
    id: "layout-1",
    name: "L1",
    width: 1920,
    height: 1080,
    zones: [],
    background: null,
    clientId: null,
    isShared: true,
    createdById: null,
    createdAt: new Date(),
  } as unknown as LayoutTemplate;

  const block = makeBlock({
    programmeVersionId: version.id,
    layoutTemplateId: layout.id,
    agendaConfigId: "agenda-cfg-xyz",
  } as Partial<ScheduleBlock> & { agendaConfigId: string });

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

  assert.equal(result.layout?.id, layout.id);
  // No synthetic agenda zone source should leak out.
  const synth = result.activeZoneSources.find(
    (zs: any) => zs.type === "agenda",
  );
  assert.equal(synth, undefined);
});

test("__TEST_S214__ block with neither layout nor agendaConfigId nor fallback playlist → 'no-layout-no-fallback'", async () => {
  // Negative twin of the happy path: without agendaConfigId the
  // resolver must fall back through to the no-layout-no-fallback
  // branch instead of synthesising anything.
  const event = makeEvent("evt-1");
  const programme = makeProgramme("prog-1", event.id);
  const version = makeVersion("v-1", programme.id);
  const block = makeBlock({
    programmeVersionId: version.id,
    layoutTemplateId: null,
    zoneSources: [],
    agendaConfigId: null,
  } as Partial<ScheduleBlock> & { agendaConfigId: null });

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
  assert.equal(result.activeZoneSources.length, 0);
  const blockStep = result.trace.find((s) => s.kind === "block-evaluated");
  assert.equal(
    blockStep?.kind === "block-evaluated" && blockStep.decision,
    "no-layout-no-fallback",
  );
});

// ==================== UI mutual-exclusivity rules ====================
//
// There is no React testing harness wired up in this project (no
// jsdom / @testing-library), so we lock down the BlockEditorDialog
// rules by asserting on the JSX source. This is intentionally narrow:
// each assertion targets a single committed line, so a refactor that
// preserves the rule wording will still pass, and one that drops the
// rule will fail loudly.

const PROGRAMMES_SRC = readFileSync(
  new URL("../client/src/pages/programmes.tsx", import.meta.url),
  "utf8",
);

test("__TEST_S214__ UI rule: picking a layout clears the agenda selection", () => {
  // Inside the useEffect that runs on selectedLayoutId change.
  assert.match(
    PROGRAMMES_SRC,
    /if \(selectedLayout && agendaConfigId\) \{\s*setAgendaConfigId\(""\);\s*\}/,
    "expected useEffect to clear agendaConfigId when a layout becomes selected",
  );
});

test("__TEST_S214__ UI rule: picking an agenda disables the fallback playlist picker", () => {
  // The fallback playlist <Select> must be disabled while an agenda
  // config is selected, and choosing an agenda must clear any
  // already-picked fallback playlist.
  assert.match(
    PROGRAMMES_SRC,
    /data-testid="select-fallback-playlist"[\s\S]{0,400}disabled=\{!!agendaConfigId\}|disabled=\{!!agendaConfigId\}[\s\S]{0,400}data-testid="select-fallback-playlist"/,
    "fallback playlist <Select> must carry disabled={!!agendaConfigId}",
  );
  assert.match(
    PROGRAMMES_SRC,
    /setAgendaConfigId\(next\);\s*if \(next && fallbackPlaylistId\) setFallbackPlaylistId\(""\);/,
    "picking an agenda must also clear any pre-existing fallback playlist",
  );
});

test("__TEST_S214__ UI rule: picking a fallback playlist disables the agenda picker (reverse direction)", () => {
  assert.match(
    PROGRAMMES_SRC,
    /data-testid="select-block-agenda-config"[\s\S]{0,400}disabled=\{!!fallbackPlaylistId\}|disabled=\{!!fallbackPlaylistId\}[\s\S]{0,400}data-testid="select-block-agenda-config"/,
    "agenda <Select> must carry disabled={!!fallbackPlaylistId}",
  );
  assert.match(
    PROGRAMMES_SRC,
    /setFallbackPlaylistId\(next\);\s*if \(next && agendaConfigId\) setAgendaConfigId\(""\);/,
    "picking a fallback playlist must also clear any pre-existing agenda",
  );
});

test("__TEST_S214__ UI rule: agendaConfigId is only sent on save when no layout is picked", () => {
  // The save payload must null out agendaConfigId when a layout is
  // selected — otherwise the resolver's defensive layout-wins branch
  // becomes load-bearing.
  assert.match(
    PROGRAMMES_SRC,
    /agendaConfigId:\s*!data\.layoutTemplateId \|\| data\.layoutTemplateId === "none"\s*\?\s*\(agendaConfigId \|\| null\)\s*:\s*null,/,
    "save mutation must clear agendaConfigId in the payload when a layout is selected",
  );
});

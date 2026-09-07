import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptPlayerPresentationReport,
  readFreshPresentationState,
  scopeMonitorContentBody,
} from "../server/routes";
import {
  buildContentPresentation,
  claimPlayerProcessGeneration,
  playerProcessGenerationKey,
} from "../client/src/lib/contentPresentation";

const report = (processId: string, sequence: number, sceneGeneration = 1, processGeneration = 1) => ({
  processId, processGeneration, sequence, sceneGeneration, revision: "r", activationEpoch: 0,
  sceneId: `scene-${sceneGeneration}`, sceneActivationEpoch: sceneGeneration * 1000,
  agenda: [{ zoneId: "agenda", stage: "full", page: 1, cycle: 2 }],
});

test("higher process generation supersedes immediately and delayed lower generations never reclaim", () => {
  const screen = "lease-order";
  assert.equal(acceptPlayerPresentationReport(screen, report("old", 1), 1_000), true);
  assert.equal(acceptPlayerPresentationReport(screen, report("new", 1, 1, 2), 2_000), true);
  assert.equal(acceptPlayerPresentationReport(screen, report("old", 99, 9, 1), 10_000), false);
});

test("equal generation requires process identity and monotonic report/scene generations", () => {
  const screen = "lease-restart";
  assert.equal(acceptPlayerPresentationReport(screen, report("one", 1), 0), true);
  assert.equal(acceptPlayerPresentationReport(screen, report("collision", 2), 1), false);
  assert.equal(acceptPlayerPresentationReport(screen, report("one", 1), 1), false);
  assert.equal(acceptPlayerPresentationReport(screen, { ...report("one", 2), sceneId: "other" }, 1), false);
  assert.equal(acceptPlayerPresentationReport(screen, report("one", 2, 2), 2), true);
});

test("after a server restart lower may arrive first, then higher permanently wins", () => {
  const screen = "restart-first-report";
  assert.equal(acceptPlayerPresentationReport(screen, report("old", 20, 5, 4), 1), true);
  assert.equal(acceptPlayerPresentationReport(screen, report("new", 1, 1, 5), 2), true);
  assert.equal(acceptPlayerPresentationReport(screen, report("old", 21, 6, 4), 10_000), false);
});

test("expired presentation lease is removed before generation checks and accepts a fresh Player", () => {
  const screen = "expired-lease";
  const now = Date.now();
  assert.equal(acceptPlayerPresentationReport(screen, report("old", 9, 4, 9), now - 45_001), true);
  // The same lower generation is rejected while a prior report is fresh.
  assert.equal(acceptPlayerPresentationReport(screen, report("fresh-low", 1, 1, 1), now - 45_000), false);
  assert.equal(readFreshPresentationState(screen, { revision: "r", activationEpoch: 0 }), undefined);
  // Once expired, it is deleted before comparison and the cleared-browser
  // generation can establish a new authoritative state.
  assert.equal(acceptPlayerPresentationReport(screen, report("fresh-low", 1, 1, 1), now), true);
  const replacement = readFreshPresentationState(screen, { revision: "r", activationEpoch: 0 });
  assert.equal(replacement?.processId, "fresh-low");
  assert.equal(replacement?.processGeneration, 1);
});

test("Agenda state is exposed from the latest reload generation immediately", () => {
  const screen = "agenda-mid-join-reload";
  const first = {
    ...report("before-reload", 1, 1, 20),
    agenda: [{ zoneId: "__fallback__", stage: "page", page: 0, cycle: 0 }],
  };
  const afterReload = {
    ...report("after-reload", 1, 1, 21),
    agenda: [{ zoneId: "__fallback__", stage: "page", page: 1, cycle: 0 }],
  };
  assert.equal(acceptPlayerPresentationReport(screen, first), true);
  assert.equal(acceptPlayerPresentationReport(screen, afterReload), true);
  const state = readFreshPresentationState(screen, {
    revision: "r",
    activationEpoch: 0,
  });
  assert.equal(state?.processGeneration, 21);
  assert.deepEqual(state?.agenda, afterReload.agenda);
  assert.equal(acceptPlayerPresentationReport(screen, { ...first, sequence: 2 }), false);
});

test("browser generation is screen-scoped monotonic metadata, not a secret", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(claimPlayerProcessGeneration("screen-a", storage, 10), 1);
  assert.equal(claimPlayerProcessGeneration("screen-a", storage, 10), 2);
  assert.equal(claimPlayerProcessGeneration("screen-b", storage, 10), 1);
  assert.equal([...values.keys()].every((key) => key.startsWith("vm_player_process_generation_")), true);
  assert.equal(playerProcessGenerationKey("screen-a").includes("token"), false);
});

test("monitor graph includes only resolved playlist/layout/media reachability", () => {
  const scoped = scopeMonitorContentBody({
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "a" }],
    playlists: [{ id: "a" }, { id: "tenant-b" }],
    playlistItems: {
      a: [{ id: "a1", order: 1, layoutTemplateId: "layout-a", mediaAssetId: "media-a" }],
      "tenant-b": [{ id: "b1", layoutTemplateId: "layout-b", mediaAssetId: "media-b" }],
    },
    layoutTemplates: {
      "layout-a": { id: "layout-a", zones: [] },
      "layout-b": { id: "layout-b", zones: [{ mediaId: "media-b" }] },
    },
    media: [{ id: "media-a" }, { id: "media-b" }],
  });
  assert.deepEqual(scoped.playlists.map((p: any) => p.id), ["a"]);
  assert.deepEqual(Object.keys(scoped.playlistItems), ["a"]);
  assert.deepEqual(Object.keys(scoped.layoutTemplates), ["layout-a"]);
  assert.deepEqual(scoped.media.map((m: any) => m.id), ["media-a"]);
});

test("scheduled fallback graph is retained identically for Player and Monitor presentation", () => {
  const canonical = {
    presentation: { revision: "scheduled-fallback-revision", activationEpoch: 0 },
    layout: null,
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "scheduled" }],
    playlists: [{ id: "scheduled" }],
    playlistItems: { scheduled: [
      { id: "a", order: 1, layoutTemplateId: "marker-a", duration: 2 },
      { id: "b", order: 2, layoutTemplateId: "marker-b", duration: 2 },
    ] },
    layoutTemplates: {
      "marker-a": { id: "marker-a", zones: [] },
      "marker-b": { id: "marker-b", zones: [] },
    },
    media: [],
  };
  const playerPayload = scopeMonitorContentBody(canonical);
  const monitorPayload = scopeMonitorContentBody(canonical, "screen-1");
  assert.equal(playerPayload.presentation.revision, monitorPayload.presentation.revision);
  assert.deepEqual(Object.keys(playerPayload.playlistItems), ["scheduled"]);
  assert.deepEqual(Object.keys(monitorPayload.layoutTemplates).sort(), ["marker-a", "marker-b"]);
  assert.equal(buildContentPresentation(playerPayload, 0).layout?.id, "marker-a");
  assert.equal(buildContentPresentation(monitorPayload, 1).layout?.id, "marker-b");
});

test("direct zone-source media survives reachable scoping while unrelated assets are removed", () => {
  const canonical = {
    zoneSources: [{
      zoneId: "hero",
      type: "widget",
      mediaAssetIds: ["direct-media", "also-direct"],
    }],
    playlists: [],
    playlistItems: {},
    layoutTemplates: {},
    media: [{ id: "direct-media" }, { id: "also-direct" }, { id: "unrelated-media" }],
  };
  const playerPayload = scopeMonitorContentBody(canonical);
  const monitorPayload = scopeMonitorContentBody(canonical, "screen-1");
  assert.deepEqual(playerPayload.media.map((media: any) => media.id).sort(), ["also-direct", "direct-media"]);
  assert.deepEqual(monitorPayload.media.map((media: any) => media.id).sort(), ["also-direct", "direct-media"]);
});

test("canvas sibling direct source media is physical-Player-only", () => {
  const canonical = {
    zoneSources: [{ zoneId: "owner", type: "widget", mediaAssetIds: ["owner-media"] }],
    playlists: [],
    playlistItems: {},
    layoutTemplates: {},
    media: [{ id: "owner-media" }, { id: "sibling-media" }, { id: "unrelated-media" }],
    canvas: {
      tiles: [{
        screenId: "sibling-screen",
        zoneSources: [{ zoneId: "sibling", type: "widget", mediaAssetIds: ["sibling-media"] }],
        layout: null,
      }],
    },
  };
  const playerPayload = scopeMonitorContentBody(canonical);
  const monitorPayload = scopeMonitorContentBody(canonical, "owner-screen");
  assert.deepEqual(playerPayload.media.map((media: any) => media.id).sort(), ["owner-media", "sibling-media"]);
  assert.deepEqual(monitorPayload.media.map((media: any) => media.id), ["owner-media"]);
  assert.equal(monitorPayload.canvas.tiles.length, 0);
});

test("physical player content scope excludes unrelated cross-tenant playlist items", () => {
  const scoped = scopeMonitorContentBody({
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "resolved" }],
    playlists: [{ id: "resolved" }, { id: "other-tenant" }],
    playlistItems: {
      resolved: [{ id: "expected-item", layoutTemplateId: "resolved-layout", mediaAssetId: "resolved-media" }],
      "other-tenant": [{ id: "unexpected-third-global-item", layoutTemplateId: "other-layout", mediaAssetId: "other-media" }],
    },
    layoutTemplates: {
      "resolved-layout": { id: "resolved-layout", zones: [] },
      "other-layout": { id: "other-layout", zones: [] },
    },
    media: [{ id: "resolved-media" }, { id: "other-media" }],
  });
  assert.deepEqual(scoped.playlists.map((p: any) => p.id), ["resolved"]);
  assert.deepEqual(Object.keys(scoped.playlistItems), ["resolved"]);
  assert.deepEqual(scoped.playlistItems.resolved.map((item: any) => item.id), ["expected-item"]);
  assert.deepEqual(Object.keys(scoped.layoutTemplates), ["resolved-layout"]);
  assert.deepEqual(scoped.media.map((media: any) => media.id), ["resolved-media"]);
});
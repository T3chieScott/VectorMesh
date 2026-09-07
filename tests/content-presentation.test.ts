import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContentPresentation,
  getNextPresentationRotationIndex,
  getPresentationRotationIndex,
  getPresentationSceneDurationMs,
  getPresentationSequenceIdentity,
  scheduleDebouncedPresentationHeartbeat,
  shouldSchedulePresentationDwell,
} from "../client/src/lib/contentPresentation";

const layout = (id: string) => ({
  id, aspectRatio: "16:9",
  zones: [{ id: `${id}-zone`, type: "html", x: 0, y: 0, width: 100, height: 100, zIndex: 1 }],
});

test("presentation treats a fallback playlist with layouts as a rotation (black-screen regression)", () => {
  const payload = {
    layout: null,
    presentation: { revision: "fallback-layouts", activationEpoch: 0 },
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "fallback" }],
    playlistItems: {
      fallback: [
        { id: "second", order: 2, layoutTemplateId: "two", duration: 10 },
        { id: "first", order: 1, layoutTemplateId: "one", duration: 10 },
      ],
    },
    layoutTemplates: { one: layout("one"), two: layout("two") },
  };
  const player = buildContentPresentation(payload, getPresentationRotationIndex(buildContentPresentation(payload), 10_001));
  const monitor = buildContentPresentation(payload, getPresentationRotationIndex(buildContentPresentation(payload), 10_001));
  assert.equal(player.isLayoutRotation, true);
  assert.equal(player.layout?.id, "two");
  assert.deepEqual(monitor, player);
});

test("null-layout schedule fallback rotates authored templates and keeps Monitor report-following stable", () => {
  // This is the canonical resolver shape for an active schedule block with
  // layoutTemplateId:null. An incidental playlist source is included to prove
  // the synthetic __fallback__ schedule source remains authoritative.
  const scheduled = {
    layout: null,
    layoutTemplateId: null,
    presentation: { revision: "schedule-fallback-r1", activationEpoch: 0 },
    zoneSources: [
      { zoneId: "incidental", type: "playlist", playlistId: "other" },
      { zoneId: "__fallback__", type: "playlist", playlistId: "scheduled-layouts" },
    ],
    playlistItems: {
      other: [{ id: "shared-item", layoutTemplateId: "other-template", duration: 99 }],
      "scheduled-layouts": [
        { id: "shared-item", order: 1, layoutTemplateId: "marker-a", duration: 2 },
        { id: "marker-b-item", order: 2, layoutTemplateId: "marker-b", duration: 2 },
      ],
    },
    layoutTemplates: {
      "other-template": layout("other-template"),
      "marker-a": layout("marker-a"),
      "marker-b": layout("marker-b"),
    },
  };
  const first = buildContentPresentation(scheduled, 0);
  const equivalentPoll = buildContentPresentation(JSON.parse(JSON.stringify(scheduled)), 0);
  assert.equal(first.isLayoutRotation, true);
  assert.equal(first.rotationPlaylistId, "scheduled-layouts");
  assert.equal(first.layout?.id, "marker-a");
  assert.equal(getPresentationSceneDurationMs(first, 0), 2_000);
  assert.equal(shouldSchedulePresentationDwell(first, false), true);
  assert.equal(getPresentationSequenceIdentity(equivalentPoll), getPresentationSequenceIdentity(first));

  // One Player-owned dwell advances A -> B, and the next returns B -> A.
  const secondIndex = getNextPresentationRotationIndex(first, 0);
  const second = buildContentPresentation(scheduled, secondIndex);
  assert.equal(second.layout?.id, "marker-b");
  assert.equal(getPresentationSceneDurationMs(second, secondIndex), 2_000);
  assert.equal(getNextPresentationRotationIndex(second, secondIndex), 0);

  // A fresh matching physical report identifies the same scene Monitor uses.
  const playerReport = {
    revision: scheduled.presentation.revision,
    activationEpoch: scheduled.presentation.activationEpoch,
    playlistId: first.rotationPlaylistId,
    sceneId: second.rotationItems[secondIndex]?.layoutTemplateId,
  };
  assert.equal(playerReport.playlistId, "scheduled-layouts");
  assert.equal(second.rotationItems.findIndex(
    (item) => item.layoutTemplateId === playerReport.sceneId,
  ), secondIndex);

  const agendaScheduled = {
    ...scheduled,
    layoutTemplates: {
      ...scheduled.layoutTemplates,
      "marker-a": { ...layout("marker-a"), zones: [{ id: "agenda", type: "agenda" }] },
    },
  };
  assert.equal(
    shouldSchedulePresentationDwell(buildContentPresentation(agendaScheduled, 0), true),
    false,
  );
});

test("presentation preserves media-only fallback and safely ignores deleted layout items", () => {
  const mediaFallback = buildContentPresentation({
    layout: null,
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "fallback" }],
    playlistItems: { fallback: [{ id: "media", order: 1, mediaAssetId: "asset" }] },
    layoutTemplates: {},
  });
  assert.equal(mediaFallback.isLayoutRotation, false);
  assert.equal(mediaFallback.zones[0]?.type, "media_player");

  const deleted = buildContentPresentation({
    layout: null,
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "fallback" }],
    playlistItems: { fallback: [{ id: "gone", layoutTemplateId: "deleted" }] },
    layoutTemplates: {},
  });
  assert.equal(deleted.zones.length, 0);
});

test("shared epoch produces identical ordered scenes for late hosts and restart", () => {
  const payload = {
    layout: null, presentation: { revision: "r2", activationEpoch: 0 },
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "p" }],
    playlistItems: { p: [
      { id: "a", order: 1, layoutTemplateId: "a", duration: 5 },
      { id: "b", order: 2, layoutTemplateId: "b", duration: 7 },
    ] },
    layoutTemplates: { a: layout("a"), b: layout("b") },
  };
  const presentation = buildContentPresentation(payload);
  assert.equal(getPresentationRotationIndex(presentation, 4_999), 0);
  assert.equal(getPresentationRotationIndex(presentation, 5_000), 1);
  assert.equal(getPresentationRotationIndex(presentation, 12_000), 0);
});

test("local layout rotation keeps its authored dwell through equivalent polls and never schedules an Agenda scene", () => {
  const payload = {
    layout: null, presentation: { revision: "r-local", activationEpoch: 0 },
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId: "p" }],
    playlistItems: { p: [
      { id: "one", order: 1, layoutTemplateId: "one", duration: 2 },
      { id: "two", order: 2, layoutTemplateId: "two", duration: 2 },
    ] },
    layoutTemplates: { one: layout("one"), two: layout("two") },
  };
  const initial = buildContentPresentation(payload, 1);
  // This mirrors a fresh-but-equivalent /content poll: no object identity is
  // shared, but it must not restart the Player dwell sequence.
  const equivalentPoll = buildContentPresentation(JSON.parse(JSON.stringify(payload)), 1);
  assert.equal(getPresentationSequenceIdentity(equivalentPoll), getPresentationSequenceIdentity(initial));
  assert.equal(getPresentationSceneDurationMs(initial, 1), 2_000);
  assert.equal(shouldSchedulePresentationDwell(initial, false), true);
  assert.equal(getNextPresentationRotationIndex(initial, 1), 0);
  assert.equal(getNextPresentationRotationIndex(initial, 0), 1);

  const agendaPayload = {
    ...payload,
    layoutTemplates: {
      ...payload.layoutTemplates,
      two: { ...layout("two"), zones: [{ id: "agenda", type: "agenda" }] },
    },
  };
  assert.equal(
    shouldSchedulePresentationDwell(buildContentPresentation(agendaPayload, 1), true),
    false,
  );
});

test("scheduled/override resolved layouts still receive playlist zone media in the shared path", () => {
  const resolved = buildContentPresentation({
    // The server resolver has already chosen this layout (whether schedule or
    // override); presentation must not reinterpret precedence.
    layout: {
      ...layout("scheduled"),
      zones: [{ id: "hero", type: "media_player", x: 0, y: 0, width: 100, height: 100, zIndex: 1 }],
    },
    zoneSources: [{ zoneId: "hero", type: "playlist", playlistId: "priority-playlist" }],
    playlistItems: { "priority-playlist": [
      { id: "later", order: 2, mediaAssetId: "b" },
      { id: "first", order: 1, mediaAssetId: "a" },
    ] },
  });
  assert.equal(resolved.layout?.id, "scheduled");
  assert.deepEqual(
    (resolved.zones[0] as any).mediaPlayerItems.map((item: any) => item.mediaAssetId),
    ["a", "b"],
  );
});

test("presentation heartbeat scheduler promptly coalesces initial, static, and Agenda reports", () => {
  const timerRef: { current: number | null } = { current: null };
  const pending = new Map<number, () => void>();
  const delays: number[] = [];
  let nextTimer = 1;
  const sent: Array<{ sceneId: string; agenda: Array<{ page: number }> }> = [];
  const report = { sceneId: "marker-a", agenda: [] as Array<{ page: number }> };
  const schedule = (callback: () => void, delayMs: number) => {
    const id = nextTimer++;
    pending.set(id, callback);
    delays.push(delayMs);
    return id;
  };
  const queue = () => scheduleDebouncedPresentationHeartbeat(
    timerRef,
    () => sent.push({ sceneId: report.sceneId, agenda: [...report.agenda] }),
    schedule,
  );
  const fire = () => {
    const id = timerRef.current!;
    pending.get(id)!();
    pending.delete(id);
  };

  // Initial semantic scene queues immediately once a sender exists; an
  // equivalent render/poll cannot add a second timer.
  assert.equal(queue(), true);
  assert.equal(queue(), false);
  assert.equal(pending.size, 1);
  fire();
  assert.deepEqual(sent.map((entry) => entry.sceneId), ["marker-a"]);

  // Two authored static transitions each queue one <=250ms send.
  report.sceneId = "marker-b";
  assert.equal(queue(), true);
  assert.equal(queue(), false);
  fire();
  report.sceneId = "marker-a";
  assert.equal(queue(), true);
  fire();
  assert.deepEqual(sent.map((entry) => entry.sceneId), ["marker-a", "marker-b", "marker-a"]);
  assert.equal(delays.every((delay) => delay <= 250), true);

  // An Agenda callback updates the mutable report while the shared scene timer
  // is pending; the single eventual send retains the latest page state.
  report.sceneId = "agenda-scene";
  assert.equal(queue(), true);
  report.agenda = [{ page: 2 }];
  assert.equal(queue(), false);
  fire();
  assert.deepEqual(sent.at(-1), { sceneId: "agenda-scene", agenda: [{ page: 2 }] });
});
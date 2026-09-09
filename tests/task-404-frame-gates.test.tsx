import "./setup-jsdom";
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { LayoutZone } from "../shared/schema";
import { ScreenRenderSurface } from "../client/src/components/screen-render-surface";
import {
  StableMediaVideoRenderer,
  StableResolvedMediaVideo,
  canonicalPlaybackOrder,
  getMediaPlaybackIdentity,
  reconcileCanonicalPlaybackOrder,
  pruneRetainedMediaAssets,
  computeScreenRenderFingerprint,
  resolveStableMediaUrl,
} from "../client/src/components/stable-media-video";
import {
  buildMonitorFrameIdentity,
  nextMonitorCandidateRetryKey,
  type MonitorCandidateRetryKey,
} from "../client/src/lib/monitor-authority";
import {
  acceptsCommittedFrame,
  committedIdentityAfterReport,
  observedRotationSelection,
  shouldAdvanceSkippedRotation,
  visiblePresentationEmission,
  createVisiblePresentationEmission,
  buildHeartbeatErrorsPayload,
  claimPresentationRebase,
  committedSequenceAfterFrame,
  createPresentationRebaseState,
  isCompletePresentationReport,
} from "../client/src/lib/frame-transition";
import { useCommitGatedPresentationRebase } from "../client/src/hooks/use-commit-gated-presentation-rebase";

type PlaylistLifecycleControls = {
  commit: () => void;
  completeAgendaPage: () => void;
};

/**
 * This mirrors the Player's commit-gated wall-clock rebase effect. A is an
 * NOW/NEXT agenda scene (only NEXT completes it); B is a three-page agenda
 * scene.  Keeping the effect mounted makes the wrap failure observable rather
 * than merely testing index arithmetic.
 */
function PlaylistLifecycleHarness({
  wallClockIndex,
  expose,
}: {
  wallClockIndex: number;
  expose: (controls: PlaylistLifecycleControls) => void;
}) {
  const sequenceIdentity = "agenda-playlist-r1";
  const [index, setIndex] = React.useState(0);
  const [committed, setCommitted] = React.useState(false);
  const [bPage, setBPage] = React.useState(0);
  useCommitGatedPresentationRebase(sequenceIdentity, committed, () => {
    setIndex(wallClockIndex);
  });

  React.useEffect(() => {
    expose({
      commit: () => setCommitted(true),
      completeAgendaPage: () => {
        if (!committed) return;
        if (index === 0) {
          setIndex(1);
          setCommitted(false);
          return;
        }
        if (bPage < 2) setBPage((page) => page + 1);
        else {
          setIndex(0);
          setCommitted(false);
          setBPage(0);
        }
      },
    });
  }, [bPage, committed, expose, index]);

  return <div data-testid="playlist-lifecycle">{index === 0 ? "A:next" : `B:${bPage}`}</div>;
}

test("heartbeat errors omit presentation before a committed emission without allocating sequence", () => {
  let sequences = 0;
  const beforeCommit = createVisiblePresentationEmission("A", null, () => ({ sequence: ++sequences }));
  const errors = buildHeartbeatErrorsPayload({ reloads: 0 }, beforeCommit);
  assert.equal(sequences, 0);
  assert.equal(Object.hasOwn(errors, "presentation"), false);
  assert.deepEqual(errors.video, { reloads: 0 });
  assert.equal(isCompletePresentationReport({ revision: "r" }), false);
});

test("heartbeat emission preserves committed A through pending B and emits C only after commit", () => {
  let sequence = 0;
  const emit = (committed: string | null, reported: string | null) =>
    createVisiblePresentationEmission(committed, reported, () => ({ sceneId: reported, sequence: ++sequence }));
  const a1 = emit("A", "A");
  const pendingB = emit("A", "B");
  const a2 = emit("A", "A");
  const staleB = emit("C", "B");
  const c = emit("C", "C");
  assert.deepEqual([a1?.sceneId, pendingB, a2?.sceneId, staleB, c?.sceneId], ["A", undefined, "A", undefined, "C"]);
  assert.deepEqual([a1?.sequence, a2?.sequence, c?.sequence], [1, 2, 3]);
  assert.equal(sequence, 3);
  assert.equal(Object.hasOwn(buildHeartbeatErrorsPayload({ ok: true }, pendingB), "presentation"), false);
});

type Outcome = "visible-ready" | "empty-ready" | "failed";
type RenderedZone = {
  zone: LayoutZone;
  media?: any[];
  agendaPreparing?: boolean;
  onAgendaPreparationOutcome?: (zoneId: string, outcome: Outcome) => void;
};

function SynchronousMediaPlayerRenderer({ zone, media = [] }: RenderedZone) {
  const items = (zone as any).mediaPlayerItems as Array<{ mediaAssetId: string }> | undefined;
  const assets = (items ?? [])
    .map((item) => media.find((asset: any) => asset.id === item.mediaAssetId))
    .filter(Boolean) as any[];
  return (
    <div data-testid="production-media-player-layers">
      {assets.slice(0, 2).map((asset, index) => (
        <StableResolvedMediaVideo
          key={index}
          asset={asset}
          identityConfig={{ fitMode: "contain", muted: true }}
          autoPlay={false}
          intendedPlaying={false}
          keepAliveEnabled={false}
          data-active-layer={index === 0 ? "true" : "false"}
          data-screen-render-readiness-exempt={index === 0 ? undefined : "true"}
        />
      ))}
    </div>
  );
}

const reports: RenderedZone[] = [];
function ControlledZoneRenderer(props: RenderedZone) {
  reports.push(props);
  return <div data-testid={`zone-${props.zone.id}`}>{props.zone.id}</div>;
}

const agenda = (id: string) => ({
  id, type: "agenda", x: 0, y: 0, width: 100, height: 100, zIndex: 1,
} as LayoutZone);
const html = (id: string) => ({
  id, type: "html", x: 0, y: 0, width: 100, height: 100, zIndex: 1,
} as LayoutZone);
function surface(frameKey: string, zones: LayoutZone[], committed: string[], skipped: string[]) {
  return <ScreenRenderSurface
    frameKey={frameKey}
    zones={zones}
    media={[]}
    zoneMediaIndices={{}}
    playerContext={{} as any}
    canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
    onFrameCommitted={(identity) => committed.push(identity)}
    onFrameSkipped={(identity) => skipped.push(identity)}
    emptyAgendaPolicy="skip"
    ZoneRendererComponent={ControlledZoneRenderer as any}
  />;
}

function PlayerRotationHarness({
  committed,
  skipped,
  emissions,
}: {
  committed: string[];
  skipped: string[];
  emissions: string[];
}) {
  const identities = ["A", "B", "C"];
  const [index, setIndex] = React.useState(0);
  const visibleIdentity = React.useRef<string | null>(null);
  React.useEffect(() => {
    setIndex(1);
  }, [emissions]);
  const identity = identities[index];
  const zones = identity === "A" ? [html("a")] : [agenda(identity.toLowerCase())];
  return <ScreenRenderSurface
    frameKey={identity}
    zones={zones}
    media={[]}
    zoneMediaIndices={{}}
    playerContext={{} as any}
    canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
    onFrameCommitted={(next) => {
      visibleIdentity.current = next;
      committed.push(next);
      const emission = visiblePresentationEmission(visibleIdentity.current, next, next);
      if (emission) emissions.push(emission);
    }}
    onFrameSkipped={(next) => {
      skipped.push(next);
      if (shouldAdvanceSkippedRotation({
        rotating: true,
        desiredIdentity: identity,
        skippedIdentity: next,
        alreadyCommitted: false,
        itemCount: identities.length,
      })) setIndex((current) => current + 1);
    }}
    emptyAgendaPolicy="skip"
    ZoneRendererComponent={ControlledZoneRenderer as any}
  />;
}

function MonitorObservationHarness({
  committed,
  exposeObservation,
}: {
  committed: string[];
  exposeObservation: (observe: (sceneId: string) => void) => void;
}) {
  const identities = ["A", "B", "C"];
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(1), []);
  React.useEffect(() => exposeObservation((sceneId) => {
    const selected = observedRotationSelection(sceneId, identities);
    if (selected !== null) setIndex(selected);
  }), [exposeObservation]);
  const identity = identities[index];
  return <ScreenRenderSurface
    frameKey={identity}
    zones={identity === "A" ? [html("a")] : [agenda(identity.toLowerCase())]}
    media={[]}
    zoneMediaIndices={{}}
    playerContext={{} as any}
    canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
    onFrameCommitted={(next) => committed.push(next)}
    emptyAgendaPolicy="retain"
    ZoneRendererComponent={ControlledZoneRenderer as any}
  />;
}

async function candidate(zoneId: string): Promise<RenderedZone> {
  await waitFor(() => assert.ok(reports.some((entry) =>
    entry.zone.id === zoneId && entry.agendaPreparing)));
  return reports.filter((entry) => entry.zone.id === zoneId && entry.agendaPreparing).at(-1)!;
}

describe("Task404 ScreenRenderSurface real DOM frame gate", () => {
  test("production MediaPlayer identity never becomes playback data", () => {
    const assets = [
      { id: "local-row", mediaType: "video", originalPath: "/uploads/local.webm", updatedAt: null },
    ] as any;
    const items = [{ id: "playlist-row", mediaAssetId: "local-row", duration: 9 }];
    const identity = getMediaPlaybackIdentity(items, assets);
    const order = canonicalPlaybackOrder(items);
    assert.equal(order[0].mediaAssetId, "local-row");
    assert.equal(order[0].id, "playlist-row");
    assert.ok(resolveStableMediaUrl(assets[0], "/api/player/media", "token").includes("/local-row/file"));
    assert.ok(!identity.includes("playlist-row"), "comparison identity excludes playlist row identity");
  });

  test("canonical refresh preserves shuffled source order and matching durations", () => {
    const media = [
      { id: "a1", mediaType: "video", originalPath: "/a.webm" },
      { id: "b1", mediaType: "video", originalPath: "/b.webm" },
      { id: "a2", mediaType: "video", originalPath: "/a.webm" },
      { id: "b2", mediaType: "video", originalPath: "/b.webm" },
    ] as any;
    const shuffled = [
      { id: "old-b", mediaAssetId: "b1", duration: 20 },
      { id: "old-a", mediaAssetId: "a1", duration: 10 },
    ];
    const refreshed = [
      { id: "new-a", mediaAssetId: "a2", duration: 10 },
      { id: "new-b", mediaAssetId: "b2", duration: 20 },
    ];
    assert.deepEqual(
      reconcileCanonicalPlaybackOrder(shuffled, refreshed, media)
        .map(({ mediaAssetId, duration }) => [mediaAssetId, duration]),
      [["b2", 20], ["a2", 10]],
    );
  });

  test("retained MediaPlayer assets stay bounded across equivalent publications", () => {
    const retained = new Map<string, any>();
    let order = [
      { id: "old-b", mediaAssetId: "b-0", duration: 20 },
      { id: "old-a", mediaAssetId: "a-0", duration: 10 },
    ];
    retained.set("a-0", { id: "a-0", originalPath: "/a.webm", mediaType: "video" });
    retained.set("b-0", { id: "b-0", originalPath: "/b.webm", mediaType: "video" });
    for (let publication = 1; publication <= 50; publication++) {
      const current = [
        { id: `a-${publication}`, originalPath: "/a.webm", mediaType: "video" },
        { id: `b-${publication}`, originalPath: "/b.webm", mediaType: "video" },
      ] as any;
      current.forEach((asset: any) => retained.set(asset.id, asset));
      const canonical = [
        { id: `item-a-${publication}`, mediaAssetId: `a-${publication}`, duration: 10 },
        { id: `item-b-${publication}`, mediaAssetId: `b-${publication}`, duration: 20 },
      ];
      order = reconcileCanonicalPlaybackOrder(order, canonical, Array.from(retained.values()));
      pruneRetainedMediaAssets(retained, current, order.map((item) => item.mediaAssetId));
      assert.ok(retained.size <= current.length + order.length);
    }
    assert.deepEqual(order.map(({ mediaAssetId, duration }) => [mediaAssetId, duration]), [
      ["b-50", 20],
      ["a-50", 10],
    ]);
    assert.deepEqual(
      order.map((item) => retained.get(item.mediaAssetId)?.originalPath),
      ["/b.webm", "/a.webm"],
    );
  });
  test("initial populated Agenda stays hidden until ready and commits exactly once", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(<React.StrictMode>{surface("initial-agenda", [agenda("initial")], committed, skipped)}</React.StrictMode>);
    const initial = await candidate("initial");
    assert.deepEqual(committed, []);
    assert.ok(view.getByTestId("screen-render-preparing-frame"));
    assert.equal(view.queryByTestId("screen-render-committed-frame"), null);
    await act(async () => initial.onAgendaPreparationOutcome!("initial", "visible-ready"));
    await waitFor(() => assert.deepEqual(committed, ["initial-agenda"]));
    assert.ok(view.getByTestId("screen-render-committed-frame"));
    cleanup();
  });

  test("initial empty rotating Agenda skips exactly once without committing", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(<React.StrictMode>{surface("initial-empty", [agenda("empty")], committed, skipped)}</React.StrictMode>);
    const initial = await candidate("empty");
    await act(async () => {
      initial.onAgendaPreparationOutcome!("empty", "empty-ready");
      initial.onAgendaPreparationOutcome!("empty", "empty-ready");
    });
    assert.deepEqual(skipped, ["initial-empty"]);
    assert.deepEqual(committed, []);
    assert.equal(view.queryByTestId("screen-render-committed-frame"), null);
    cleanup();
  });

  test("initial non-Agenda frame commits exactly once", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const view = render(<React.StrictMode>{surface("initial-html", [html("initial")], committed, [])}</React.StrictMode>);
    await waitFor(() => assert.deepEqual(committed, ["initial-html"]));
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("initial"));
    cleanup();
  });

  test("initial mixed Agenda and text frame is immediately visible and commits once", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(<React.StrictMode>{
      surface("initial-mixed", [agenda("empty"), html("message")], committed, skipped)
    }</React.StrictMode>);
    await waitFor(() => assert.deepEqual(committed, ["initial-mixed"]));
    assert.deepEqual(skipped, []);
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("message"));
    assert.equal(reports.find((entry) => entry.zone.id === "empty")?.agendaPreparing, false);
    cleanup();
  });

  test("prepared candidate keeps its exact DOM instance when promoted", async () => {
    const committed: string[] = [];
    const MediaGateRenderer = ({ zone }: RenderedZone) =>
      zone.id === "a" ? <div>A</div> : <video data-testid="prepared-node" />;
    const props = (frameKey: string, zones: LayoutZone[]) => (
      <ScreenRenderSurface
        frameKey={frameKey}
        renderKey={frameKey}
        zones={zones}
        media={[]}
        zoneMediaIndices={{}}
        playerContext={{} as any}
        canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
        onFrameCommitted={(identity) => committed.push(identity)}
        emptyAgendaPolicy="commit-no-content"
        ZoneRendererComponent={MediaGateRenderer as any}
      />
    );
    const view = render(props("A", [html("a")]));
    view.rerender(props("B", [html("b")]));
    const prepared = await view.findByTestId("prepared-node") as HTMLVideoElement;
    assert.ok(prepared.closest("[data-testid='screen-render-preparing-frame']"));
    Object.defineProperty(prepared, "readyState", { configurable: true, value: 2 });
    await act(async () => prepared.dispatchEvent(new Event("loadeddata")));
    await waitFor(() => assert.deepEqual(committed, ["A", "B"]));
    const promoted = view.getByTestId("prepared-node");
    assert.strictEqual(promoted, prepared, "promotion must not remount the prepared subtree");
    assert.ok(promoted.closest("[data-testid='screen-render-committed-frame']"));
    cleanup();
  });

  test("synchronous MediaPlayer active video and fonts both gate promotion", async () => {
    const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
    let resolveFonts!: () => void;
    const fontsReady = new Promise<void>((resolve) => { resolveFonts = resolve; });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: fontsReady },
    });
    const commits: string[] = [];
    const media = [
      { id: "active", mediaType: "video", originalPath: "/active.webm" },
      { id: "preload", mediaType: "video", originalPath: "/preload.webm" },
    ] as any;
    const mediaZone = {
      ...html("player"),
      type: "mediaPlayer",
      mediaPlayerItems: [
        { id: "active-item", mediaAssetId: "active" },
        { id: "preload-item", mediaAssetId: "preload" },
      ],
    } as any;
    const surface = (key: string, zones: LayoutZone[]) => <ScreenRenderSurface
      frameKey={key}
      renderKey={key}
      zones={zones}
      media={media}
      zoneMediaIndices={{}}
      playerContext={{} as any}
      canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
      onFrameCommitted={(identity) => commits.push(identity)}
      emptyAgendaPolicy="commit-no-content"
      ZoneRendererComponent={SynchronousMediaPlayerRenderer as any}
    />;
    const view = render(surface("A", [html("a")]));
    const committedA = view.getByTestId("screen-render-committed-frame");
    view.rerender(surface("B", [mediaZone]));
    const preparing = view.getByTestId("screen-render-preparing-frame");
    const active = preparing.querySelector("[data-active-layer='true']") as HTMLVideoElement;
    assert.ok(active, "the intended active video must exist during the mount scan");
    assert.equal(active.readyState, 0);
    assert.ok(preparing.querySelector("[data-active-layer='false']"));
    resolveFonts();
    await act(async () => { await fontsReady; });
    assert.deepEqual(commits, ["A"], "fonts alone cannot bypass unresolved active media");
    assert.strictEqual(view.getByTestId("screen-render-committed-frame"), committedA);
    Object.defineProperty(active, "readyState", { configurable: true, value: 2 });
    await act(async () => active.dispatchEvent(new Event("canplay")));
    await waitFor(() => assert.deepEqual(commits, ["A", "B"]));
    assert.strictEqual(view.container.querySelector("[data-active-layer='true']"), active);
    cleanup();
    if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
    else delete (document as any).fonts;
  });

  test("MediaPlayer still waits for media when fonts are already ready", async () => {
    const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    const commits: string[] = [];
    const asset = { id: "active", mediaType: "video", originalPath: "/active.webm" } as any;
    const playerZone = {
      ...html("player"),
      type: "mediaPlayer",
      mediaPlayerItems: [{ id: "item", mediaAssetId: "active" }],
    } as any;
    const common = {
      media: [asset],
      zoneMediaIndices: {},
      playerContext: {} as any,
      canvasGeometry: { useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 },
      onFrameCommitted: (identity: string) => commits.push(identity),
      emptyAgendaPolicy: "commit-no-content" as const,
      ZoneRendererComponent: SynchronousMediaPlayerRenderer as any,
    };
    const view = render(<ScreenRenderSurface {...common} frameKey="A" renderKey="A" zones={[html("a")]} />);
    view.rerender(<ScreenRenderSurface {...common} frameKey="B" renderKey="B" zones={[playerZone]} />);
    await act(async () => { await Promise.resolve(); });
    assert.deepEqual(commits, ["A"]);
    const active = view.getByTestId("screen-render-preparing-frame")
      .querySelector("[data-active-layer='true']") as HTMLVideoElement;
    Object.defineProperty(active, "readyState", { configurable: true, value: 2 });
    await act(async () => active.dispatchEvent(new Event("loadeddata")));
    await waitFor(() => assert.deepEqual(commits, ["A", "B"]));
    assert.strictEqual(view.container.querySelector("[data-active-layer='true']"), active);
    cleanup();
    if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
    else delete (document as any).fonts;
  });

  test("MediaPlayer empty and invalid collections terminate without a media deadlock", async () => {
    const commits: string[] = [];
    const common = {
      media: [] as any[],
      zoneMediaIndices: {},
      playerContext: {} as any,
      canvasGeometry: { useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 },
      onFrameCommitted: (identity: string) => commits.push(identity),
      emptyAgendaPolicy: "commit-no-content" as const,
      ZoneRendererComponent: SynchronousMediaPlayerRenderer as any,
    };
    const empty = { ...html("empty"), type: "mediaPlayer", mediaPlayerItems: [] } as any;
    const invalid = {
      ...html("invalid"),
      type: "mediaPlayer",
      mediaPlayerItems: [{ id: "missing-item", mediaAssetId: "missing-asset" }],
    } as any;
    const view = render(<ScreenRenderSurface {...common} frameKey="empty" renderKey="empty" zones={[empty]} />);
    await waitFor(() => assert.deepEqual(commits, ["empty"]));
    view.rerender(<ScreenRenderSurface {...common} frameKey="invalid" renderKey="invalid" zones={[invalid]} />);
    await waitFor(() => assert.deepEqual(commits, ["empty", "invalid"]));
    assert.equal(view.container.querySelector("video"), null);
    cleanup();
  });

  test("late readiness from replaced same-visual candidate cannot promote", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const renderSurface = (frameKey: string, preparationKey: string, zones: LayoutZone[]) => (
      <ScreenRenderSurface
        frameKey={frameKey}
        renderKey={frameKey === "A" ? "visual-a" : "visual-b"}
        preparationKey={preparationKey}
        zones={zones}
        media={[]}
        zoneMediaIndices={{}}
        playerContext={{} as any}
        canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
        onFrameCommitted={(identity) => committed.push(identity)}
        emptyAgendaPolicy="commit-no-content"
        ZoneRendererComponent={ControlledZoneRenderer as any}
      />
    );
    const view = render(renderSurface("A", "a", [html("a")]));
    view.rerender(renderSurface("B", "b-v1", [agenda("b")]));
    const stale = await candidate("b");
    const staleSlot = view.getByTestId("screen-render-preparing-frame");
    view.rerender(renderSurface("B", "b-v2", [agenda("b")]));
    await waitFor(() => assert.notStrictEqual(
      view.getByTestId("screen-render-preparing-frame"),
      staleSlot,
      "replacement must allocate and mount a fresh candidate instance",
    ));
    const current = reports.filter((entry) =>
      entry.zone.id === "b" && entry.agendaPreparing).at(-1)!;
    await act(async () => stale.onAgendaPreparationOutcome!("b", "visible-ready"));
    assert.deepEqual(committed, ["A"], "replaced instance callback is inert");
    assert.ok(view.getByTestId("screen-render-preparing-frame"));
    await act(async () => current.onAgendaPreparationOutcome!("b", "visible-ready"));
    await waitFor(() => assert.deepEqual(committed, ["A", "B"]));
    cleanup();
  });

  test("late empty outcome cannot skip a replaced same-visual candidate", async () => {
    reports.length = 0;
    const skipped: string[] = [];
    const renderSurface = (preparationKey: string) => (
      <ScreenRenderSurface
        frameKey="B"
        renderKey="visual-b"
        preparationKey={preparationKey}
        zones={[agenda("b")]}
        media={[]}
        zoneMediaIndices={{}}
        playerContext={{} as any}
        canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
        onFrameSkipped={(identity) => skipped.push(identity)}
        emptyAgendaPolicy="skip"
        ZoneRendererComponent={ControlledZoneRenderer as any}
      />
    );
    const view = render(renderSurface("b-v1"));
    const stale = await candidate("b");
    const staleSlot = view.getByTestId("screen-render-preparing-frame");
    view.rerender(renderSurface("b-v2"));
    await waitFor(() => assert.notStrictEqual(
      view.getByTestId("screen-render-preparing-frame"),
      staleSlot,
    ));
    await act(async () => stale.onAgendaPreparationOutcome!("b", "empty-ready"));
    assert.deepEqual(skipped, []);
    assert.ok(view.getByTestId("screen-render-preparing-frame"));
    cleanup();
  });

  test("agenda-only empty B retains A, skips once, then commits C without a blank", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const emissions: string[] = [];
    const view = render(<PlayerRotationHarness
      committed={committed}
      skipped={skipped}
      emissions={emissions}
    />);
    const b = await candidate("b");
    await act(async () => {
      b.onAgendaPreparationOutcome!("b", "empty-ready");
      b.onAgendaPreparationOutcome!("b", "empty-ready");
    });
    assert.deepEqual(skipped, ["B"]);
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("a"));
    assert.equal(view.getByTestId("screen-render-committed-frame").textContent?.includes("b"), false);

    const c = await candidate("c");
    await act(async () => c.onAgendaPreparationOutcome!("c", "visible-ready"));
    await waitFor(() => assert.ok(committed.includes("C")));
    assert.deepEqual(committed, ["A", "C"]);
    assert.deepEqual(emissions, ["A", "C"]);
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("c"));
    cleanup();
  });

  test("Monitor authenticated C observation supersedes pending empty B and commits no visible B", async () => {
    reports.length = 0;
    const committed: string[] = [];
    let observe = (_sceneId: string) => {};
    const exposeObservation = (next: (sceneId: string) => void) => { observe = next; };
    const view = render(<MonitorObservationHarness
      committed={committed}
      exposeObservation={exposeObservation}
    />);
    const b = await candidate("b");
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("a"));
    await act(async () => b.onAgendaPreparationOutcome!("b", "empty-ready"));
    assert.deepEqual(committed, ["A"]);
    assert.ok(view.getByTestId("screen-render-preparing-frame").textContent?.includes("b"));
    assert.equal(view.getByTestId("screen-render-committed-frame").textContent?.includes("b"), false);
    await act(async () => observe("C"));
    const c = await candidate("c");
    await act(async () => c.onAgendaPreparationOutcome!("c", "visible-ready"));
    await waitFor(() => assert.deepEqual(committed, ["A", "C"]));
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("c"));
    cleanup();
  });

  test("stale B outcome is inert after desired A reversal or desired C", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(surface("A", [html("a")], committed, skipped));
    view.rerender(surface("B", [agenda("b")], committed, skipped));
    const b = await candidate("b");
    view.rerender(surface("A", [html("a")], committed, skipped));
    await act(async () => b.onAgendaPreparationOutcome!("b", "empty-ready"));
    assert.deepEqual(skipped, []);
    view.rerender(surface("C", [agenda("c")], committed, skipped));
    const c = await candidate("c");
    await act(async () => b.onAgendaPreparationOutcome!("b", "empty-ready"));
    assert.deepEqual(skipped, []);
    await act(async () => c.onAgendaPreparationOutcome!("c", "visible-ready"));
    await waitFor(() => assert.deepEqual(committed, ["A", "C"]));
    cleanup();
  });

  test("rapid A to empty B to A remains stable", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(surface("A", [html("a")], committed, skipped));
    view.rerender(surface("B", [agenda("b")], committed, skipped));
    const b = await candidate("b");
    await act(async () => b.onAgendaPreparationOutcome!("b", "empty-ready"));
    assert.deepEqual(skipped, ["B"]);
    view.rerender(surface("A", [html("a")], committed, skipped));
    await act(async () => b.onAgendaPreparationOutcome!("b", "empty-ready"));
    await waitFor(() => assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("a")));
    assert.deepEqual(committed, ["A"]);
    assert.deepEqual(skipped, ["B"]);
    cleanup();
  });

  test("empty Agenda plus visible non-Agenda promotes", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(surface("A", [html("a")], committed, skipped));
    view.rerender(surface("B", [agenda("agenda-b"), html("html-b")], committed, skipped));
    const b = await candidate("agenda-b");
    await act(async () => b.onAgendaPreparationOutcome!("agenda-b", "empty-ready"));
    await waitFor(() => assert.deepEqual(committed, ["A", "B"]));
    assert.deepEqual(skipped, []);
    cleanup();
  });

  test("two Agenda zones promote when populated and empty outcomes arrive in either order", async () => {
    for (const order of [["one", "two"], ["two", "one"]] as const) {
      reports.length = 0;
      const committed: string[] = [];
      const skipped: string[] = [];
      const view = render(surface("A", [html("a")], committed, skipped));
      view.rerender(surface("B", [agenda("one"), agenda("two")], committed, skipped));
      const one = await candidate("one");
      const two = await candidate("two");
      await act(async () => {
        const lookup = { one, two };
        for (const zoneId of order) {
          lookup[zoneId].onAgendaPreparationOutcome!(
            zoneId,
            zoneId === "one" ? "visible-ready" : "empty-ready",
          );
        }
      });
      await waitFor(() => assert.deepEqual(committed, ["A", "B"]));
      assert.deepEqual(skipped, []);
      cleanup();
    }
  });

  test("failed Agenda candidate retains A and neither skips nor promotes", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const skipped: string[] = [];
    const view = render(surface("A", [html("a")], committed, skipped));
    view.rerender(surface("B", [agenda("b")], committed, skipped));
    const b = await candidate("b");
    await act(async () => b.onAgendaPreparationOutcome!("b", "failed"));
    assert.deepEqual(committed, ["A"]);
    assert.deepEqual(skipped, []);
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("a"));
    cleanup();
  });

  test("nonrotating resolved empty commits configured transparent no-content instead of stale A", async () => {
    reports.length = 0;
    const committed: string[] = [];
    const view = render(<ScreenRenderSurface
      frameKey="A"
      zones={[html("a")]}
      media={[]}
      zoneMediaIndices={{}}
      playerContext={{} as any}
      canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
      onFrameCommitted={(identity) => committed.push(identity)}
      emptyAgendaPolicy="commit-no-content"
      ZoneRendererComponent={ControlledZoneRenderer as any}
    />);
    view.rerender(<ScreenRenderSurface
      frameKey="no-content"
      zones={[agenda("empty-fallback")]}
      media={[]}
      zoneMediaIndices={{}}
      playerContext={{} as any}
      canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
      onFrameCommitted={(identity) => committed.push(identity)}
      emptyAgendaPolicy="commit-no-content"
      ZoneRendererComponent={ControlledZoneRenderer as any}
    />);
    const empty = await candidate("empty-fallback");
    await act(async () => empty.onAgendaPreparationOutcome!("empty-fallback", "empty-ready"));
    await waitFor(() => assert.deepEqual(committed, ["A", "no-content"]));
    assert.equal(view.getByTestId("screen-render-committed-frame").querySelector("[data-testid='zone-a']"), null);
    assert.ok(view.getByTestId("screen-render-committed-frame").textContent?.includes("empty-fallback"));
    cleanup();
  });

  test("equivalent A → B → A scenes retain one mounted video and its playback state", async () => {
    const commits: string[] = [];
    const media = [
      { id: "row-a", name: "different persisted row A", mediaType: "video", originalPath: "/uploads/identical.webm", mimeType: "video/webm", updatedAt: null },
      { id: "row-b", name: "different persisted row B", mediaType: "video", originalPath: "/uploads/identical.webm", mimeType: "video/webm", updatedAt: null },
      { id: "row-c", name: "changed source", mediaType: "video", originalPath: "/uploads/changed.webm", mimeType: "video/webm", updatedAt: null },
    ] as any;
    const equivalent = (
      logicalKey: string,
      zoneId: string,
      mediaId: string,
      retryKey: MonitorCandidateRetryKey = "retry-a",
      fit = "contain",
    ) => {
      const zones = [{ ...html(zoneId), type: "media", mediaId, mediaFitMode: fit } as LayoutZone];
      return <ScreenRenderSurface
        frameKey={buildMonitorFrameIdentity(logicalKey, retryKey)}
        renderKey={computeScreenRenderFingerprint(zones, media)}
        // Actual Monitor host contract: this bounded key is stable during
        // ordinary physical A → B → A progression and only toggles to restart
        // an unresolved same-scene candidate.
        preparationKey={retryKey}
        zones={zones}
        zoneKey={() => "same-video-zone"}
        media={media}
        zoneMediaIndices={{}}
        playerContext={{} as any}
        canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
        onFrameCommitted={(identity) => commits.push(identity)}
        emptyAgendaPolicy="commit-no-content"
        ZoneRendererComponent={StableMediaVideoRenderer}
      />;
    };
    assert.equal(nextMonitorCandidateRetryKey(nextMonitorCandidateRetryKey("retry-a")), "retry-a");
    (window as any).__vmPlayerVideoStats = { stalls: 0, recoveries: 0, reloads: 0 };
    const view = render(equivalent("A", "persisted-zone-a", "row-a"));
    const video = view.container.querySelector("video") as HTMLVideoElement;
    assert.ok(video, "production ZoneRenderer MediaWidget must mount a video");
    const originalSrc = video.getAttribute("src");
    let plays = 0;
    let pauses = 0;
    let loads = 0;
    Object.defineProperties(video, {
      currentTime: { configurable: true, writable: true, value: 12.5 },
      play: { configurable: true, value: () => { plays += 1; return Promise.resolve(); } },
      pause: { configurable: true, value: () => { pauses += 1; } },
      load: { configurable: true, value: () => { loads += 1; } },
    });

    view.rerender(equivalent("B", "persisted-zone-b", "row-b"));
    view.rerender(equivalent("A-again", "persisted-zone-a-again", "row-a"));
    view.rerender(equivalent("B-again", "persisted-zone-b-again", "row-b"));
    view.rerender(equivalent("A-third", "persisted-zone-a-third", "row-a"));
    const after = view.container.querySelector("video") as HTMLVideoElement;
    assert.strictEqual(after, video, "equivalent scenes must retain the exact video DOM node");
    assert.equal(after.getAttribute("src"), originalSrc, "equivalent local rows retain canonical initial src");
    assert.equal(after.currentTime, 12.5);
    assert.deepEqual({ plays, pauses, loads }, { plays: 0, pauses: 0, loads: 0 });
    assert.deepEqual((window as any).__vmPlayerVideoStats, { stalls: 0, recoveries: 0, reloads: 0 });
    await waitFor(() => assert.deepEqual(
      commits,
      ["A:retry-a", "B:retry-a", "A-again:retry-a", "B-again:retry-a", "A-third:retry-a"],
    ));

    view.rerender(equivalent("changed-source", "changed-source-zone", "row-c"));
    const preparingSource = view.getByTestId("screen-render-preparing-frame")
      .querySelector("video") as HTMLVideoElement;
    Object.defineProperty(preparingSource, "readyState", { configurable: true, value: 2 });
    await act(async () => preparingSource.dispatchEvent(new Event("loadeddata")));
    await waitFor(() => assert.equal(
      view.queryByTestId("screen-render-preparing-frame"),
      null,
    ));
    const changedSource = view.container.querySelector("video") as HTMLVideoElement;
    assert.notStrictEqual(changedSource, video, "a changed resolved asset source replaces the video");
    view.rerender(equivalent("changed-config", "changed-config-zone", "row-c", "retry-a", "cover"));
    const preparingConfig = view.getByTestId("screen-render-preparing-frame")
      .querySelector("video") as HTMLVideoElement;
    Object.defineProperty(preparingConfig, "readyState", { configurable: true, value: 2 });
    await act(async () => preparingConfig.dispatchEvent(new Event("loadeddata")));
    await waitFor(() => assert.equal(
      view.queryByTestId("screen-render-preparing-frame"),
      null,
    ));
    assert.notStrictEqual(
      view.container.querySelector("video"),
      changedSource,
      "changed render-significant playback/fit config replaces the video",
    );
    cleanup();
  });

  test("surface ownership survives a differing non-video frame and replaces only a changed source", async () => {
    const commits: string[] = [];
    const media = [
      { id: "same-a", mediaType: "video", originalPath: "/persistent.webm", mimeType: "video/webm" },
      { id: "same-b", mediaType: "video", originalPath: "/persistent.webm", mimeType: "video/webm" },
      { id: "changed", mediaType: "video", originalPath: "/replacement.webm", mimeType: "video/webm" },
    ] as any;
    const Renderer = (props: any) => props.zone.type === "media"
      ? <StableMediaVideoRenderer {...props} />
      : <div data-testid="non-video-zone">{props.zone.x}</div>;
    const scene = (frameKey: string, mediaId: string, nonVideoX: number) => {
      const zones = [
        { ...html(`video-${frameKey}`), type: "media", mediaId, mediaFitMode: "contain" },
        { ...html(`non-video-${frameKey}`), x: nonVideoX, width: 100 - nonVideoX },
      ] as LayoutZone[];
      return <ScreenRenderSurface
        frameKey={frameKey}
        renderKey={computeScreenRenderFingerprint(zones, media)}
        zones={zones}
        media={media}
        zoneMediaIndices={{}}
        playerContext={{} as any}
        canvasGeometry={{ useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }}
        onFrameCommitted={(identity) => commits.push(identity)}
        emptyAgendaPolicy="commit-no-content"
        ZoneRendererComponent={Renderer}
      />;
    };

    const view = render(scene("NOW-NEXT", "same-a", 0));
    await waitFor(() => assert.deepEqual(commits, ["NOW-NEXT"]));
    const authoritative = view.container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(authoritative, "currentTime", {
      configurable: true, writable: true, value: 37.25,
    });

    view.rerender(scene("FULL-AGENDA", "same-b", 11));
    await waitFor(() => assert.deepEqual(commits, ["NOW-NEXT", "FULL-AGENDA"]));
    const promoted = view.container.querySelector("video") as HTMLVideoElement;
    assert.strictEqual(promoted, authoritative);
    assert.equal(promoted.currentTime, 37.25);
    assert.equal(view.getByTestId("non-video-zone").textContent, "11");

    view.rerender(scene("CHANGED-SOURCE", "changed", 22));
    const replacementCandidate = await waitFor(() => {
      const element = view.getByTestId("screen-render-preparing-frame")
        .querySelector("video") as HTMLVideoElement | null;
      assert.ok(element);
      return element;
    });
    assert.notStrictEqual(replacementCandidate, authoritative);
    Object.defineProperty(replacementCandidate, "readyState", { configurable: true, value: 2 });
    await act(async () => replacementCandidate.dispatchEvent(new Event("loadeddata")));
    await waitFor(() => assert.deepEqual(
      commits,
      ["NOW-NEXT", "FULL-AGENDA", "CHANGED-SOURCE"],
    ));
    assert.strictEqual(view.container.querySelector("video"), replacementCandidate);
    cleanup();
  });
});

describe("Task404 Player and Monitor transition protocol", () => {
  test("mounted A NEXT and B three-page agenda cycle does not wall-clock rebase after wrapping to A", async () => {
    let controls: PlaylistLifecycleControls | null = null;
    const expose = (next: PlaylistLifecycleControls) => { controls = next; };
    const view = render(<PlaylistLifecycleHarness wallClockIndex={0} expose={expose} />);
    try {
      await waitFor(() => assert.ok(controls));
      await act(async () => controls!.commit());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "A:next"));

      // A begins at its NEXT semantic page; its one controlled completion
      // advances the scene to B.
      await act(async () => controls!.completeAgendaPage());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "B:0"));
      // B is the shared-clock selection while its own visible frame commits.
      view.rerender(<PlaylistLifecycleHarness wallClockIndex={1} expose={expose} />);
      await act(async () => controls!.commit());

      // B advances its three controlled pages before it wraps.
      await act(async () => controls!.completeAgendaPage());
      assert.equal(view.getByTestId("playlist-lifecycle").textContent, "B:1");
      await act(async () => controls!.completeAgendaPage());
      assert.equal(view.getByTestId("playlist-lifecycle").textContent, "B:2");
      await act(async () => controls!.completeAgendaPage());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "A:next"));

      // The shared epoch still points at B.  Committing wrapped A must retain
      // Player-owned progression, not rebase it back to B.
      view.rerender(<PlaylistLifecycleHarness wallClockIndex={1} expose={expose} />);
      await act(async () => controls!.commit());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "A:next"));

      // A second complete local cycle remains Player-owned too.
      await act(async () => controls!.completeAgendaPage());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "B:0"));
      await act(async () => controls!.commit());
      await act(async () => controls!.completeAgendaPage());
      await act(async () => controls!.completeAgendaPage());
      await act(async () => controls!.completeAgendaPage());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "A:next"));
      await act(async () => controls!.commit());
      await waitFor(() => assert.equal(view.getByTestId("playlist-lifecycle").textContent, "A:next"));
    } finally {
      cleanup();
    }
  });

  test("rebase permission waits for a visible commit and is spent once per sequence identity", () => {
    const state = createPresentationRebaseState();
    // Initial join cannot run while the candidate is preparing, skipped, or
    // stale. None of these outcomes consumes its eventual visible commit.
    assert.equal(claimPresentationRebase(state, "r1", false), false);
    assert.equal(claimPresentationRebase(state, "r1", false), false);
    assert.deepEqual(state, { sequenceIdentity: "r1", claimed: false });
    assert.equal(claimPresentationRebase(state, "r1", true), true);

    // Equivalent polls/rerenders and ordinary false -> true scene handoffs
    // (including an A -> B -> A wrap) do not rebase local playback again.
    assert.equal(claimPresentationRebase(state, "r1", true), false);
    assert.equal(claimPresentationRebase(state, "r1", false), false);
    assert.equal(claimPresentationRebase(state, "r1", true), false);
    assert.equal(claimPresentationRebase(state, "r1", false), false);
    assert.equal(claimPresentationRebase(state, "r1", true), false);

    // A new revision, activation epoch, playlist, or meaningful item sequence
    // has a new identity and earns one new rebase only after it visibly commits.
    for (const identity of ["r2", "epoch-2", "playlist-2", "sequence-2"]) {
      assert.equal(claimPresentationRebase(state, identity, false), false);
      assert.equal(claimPresentationRebase(state, identity, true), true);
      assert.equal(claimPresentationRebase(state, identity, true), false);
    }
    // Returning after another sequence begins a fresh occurrence and earns
    // exactly one new rebase without historical identity storage.
    assert.equal(claimPresentationRebase(state, "r1", true), true);
    assert.deepEqual(state, { sequenceIdentity: "r1", claimed: true });
  });

  test("stale frame reports cannot stamp a newer presentation sequence", () => {
    assert.equal(
      committedSequenceAfterFrame("r1", "frame-r2", "frame-r1", "r2"),
      "r1",
    );
    assert.equal(
      committedSequenceAfterFrame("r1", "frame-r2", "frame-r2", "r2"),
      "r2",
    );
  });

  test("rotating empty B advances once toward C; stale B and nonrotating skips are no-ops", () => {
    assert.equal(shouldAdvanceSkippedRotation({
      rotating: true, desiredIdentity: "B", skippedIdentity: "B", alreadyCommitted: false, itemCount: 3,
    }), true);
    assert.equal(shouldAdvanceSkippedRotation({
      rotating: true, desiredIdentity: "C", skippedIdentity: "B", alreadyCommitted: false, itemCount: 3,
    }), false);
    assert.equal(shouldAdvanceSkippedRotation({
      rotating: false, desiredIdentity: "B", skippedIdentity: "B", alreadyCommitted: false, itemCount: 3,
    }), false);
  });

  test("only committed Player identities feed report, heartbeat, and Monitor follower sequence", () => {
    let playerCommitted: string | null = "A";
    playerCommitted = committedIdentityAfterReport(playerCommitted, "C", "B");
    assert.equal(playerCommitted, "A", "skipped/stale B cannot become the Player report or heartbeat input");
    assert.equal(visiblePresentationEmission(playerCommitted, "B", { identity: "B" }), null);
    assert.deepEqual(visiblePresentationEmission(playerCommitted, "A", { identity: "A" }), { identity: "A" });
    playerCommitted = committedIdentityAfterReport(playerCommitted, "C", "C");
    assert.deepEqual(visiblePresentationEmission(playerCommitted, "C", { identity: "C" }), { identity: "C" });
    const reportAndHeartbeatInputs = ["A", playerCommitted];
    let monitorCommitted: string | null = "A";
    monitorCommitted = committedIdentityAfterReport(monitorCommitted, "C", "B");
    monitorCommitted = committedIdentityAfterReport(monitorCommitted, "C", "C");
    const monitorFollowerFrames = ["A", monitorCommitted];
    const committed = ["A", playerCommitted];
    assert.deepEqual(committed, ["A", "C"]);
    assert.deepEqual(reportAndHeartbeatInputs, ["A", "C"]);
    assert.deepEqual(monitorFollowerFrames, ["A", "C"]);
    assert.equal(acceptsCommittedFrame("C", "B"), false);
  });
});
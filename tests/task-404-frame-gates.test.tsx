import "./setup-jsdom";
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { LayoutZone } from "../shared/schema";
import { ScreenRenderSurface } from "../client/src/components/screen-render-surface";
import {
  acceptsCommittedFrame,
  committedIdentityAfterReport,
  observedRotationSelection,
  shouldAdvanceSkippedRotation,
  visiblePresentationEmission,
  createVisiblePresentationEmission,
  buildHeartbeatErrorsPayload,
  isCompletePresentationReport,
} from "../client/src/lib/frame-transition";

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
  agendaPreparing?: boolean;
  onAgendaPreparationOutcome?: (zoneId: string, outcome: Outcome) => void;
};

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
});

describe("Task404 Player and Monitor transition protocol", () => {
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
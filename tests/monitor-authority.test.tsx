import "./setup-jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { act, render } from "@testing-library/react";
import {
  MONITOR_AUTHORITY_TTL_MS,
  buildMonitorFrameIdentity,
  createMonitorAuthorityState,
  nextMonitorCandidateRetryKey,
  observeMonitorAuthority,
  readFreshMonitorAuthority,
  type MonitorAuthorityReport,
} from "../client/src/lib/monitor-authority";

const report = (
  sceneId: string,
  processGeneration = 1,
  sequence = 1,
): MonitorAuthorityReport => ({
  processId: "physical-player",
  processGeneration,
  sequence,
  sceneGeneration: sequence,
  revision: "revision",
  activationEpoch: 100,
  sceneId,
  reportedAt: 1_000,
  agenda: [{ zoneId: "agenda", stage: "page", page: sequence, cycle: 0 }],
});

test("fresh lease alone remains monitor authority through duplicate, null, and stale polls", () => {
  const t0 = 1_000;
  let state = createMonitorAuthorityState();
  state = observeMonitorAuthority(state, { ...report("B", 2, 4), reportedAt: t0 }, t0);
  state = observeMonitorAuthority(state, report("A", 1, 99), t0 + 1);
  state = observeMonitorAuthority(state, null, t0 + 2);
  assert.equal(readFreshMonitorAuthority(state, t0 + 3)?.sceneId, "B");
  assert.equal(readFreshMonitorAuthority(state, t0 + MONITOR_AUTHORITY_TTL_MS)?.sceneId, "B");
  assert.equal(readFreshMonitorAuthority(state, t0 + MONITOR_AUTHORITY_TTL_MS + 1), undefined);
});

test("duplicate polls never extend the first-receipt TTL and null falls back after it", () => {
  const t0 = 10_000;
  let state = createMonitorAuthorityState();
  const current = { ...report("B", 3, 8), reportedAt: t0 };
  state = observeMonitorAuthority(state, current, t0);
  // A delayed duplicate arrives immediately before expiry. It must neither
  // shift receivedAt nor let the later null response re-establish authority.
  state = observeMonitorAuthority(
    state,
    current,
    t0 + MONITOR_AUTHORITY_TTL_MS - 1,
  );
  assert.equal(state.receivedAt, t0);
  assert.equal(readFreshMonitorAuthority(state, t0 + MONITOR_AUTHORITY_TTL_MS)?.sceneId, "B");
  state = observeMonitorAuthority(state, null, t0 + MONITOR_AUTHORITY_TTL_MS + 1);
  assert.equal(readFreshMonitorAuthority(state, t0 + MONITOR_AUTHORITY_TTL_MS + 1), undefined);
  assert.deepEqual(state, createMonitorAuthorityState());
});

test("aged report receives only remaining server lease and lower generation reacquires after expiry", () => {
  const localReceipt = 5_000;
  const serverReceipt = 100_000;
  let state = createMonitorAuthorityState();
  state = observeMonitorAuthority(
    state,
    { ...report("B", 8, 20), reportedAt: serverReceipt - 44_000 },
    localReceipt,
    serverReceipt,
  );
  assert.equal(state.expiresAt, localReceipt + 1_000);
  assert.equal(readFreshMonitorAuthority(state, localReceipt + 1_000)?.sceneId, "B");
  assert.equal(readFreshMonitorAuthority(state, localReceipt + 1_001), undefined);

  state = observeMonitorAuthority(
    state,
    { ...report("A", 1, 1), reportedAt: serverReceipt + 2_000 },
    localReceipt + 2_000,
    serverReceipt + 2_000,
  );
  assert.equal(readFreshMonitorAuthority(state, localReceipt + 2_000)?.sceneId, "A");
  assert.equal(state.report?.processGeneration, 1);
});

test("newer authenticated scene supersedes an unresolved candidate without accepting delayed reversion", () => {
  let state = createMonitorAuthorityState();
  state = observeMonitorAuthority(state, report("B", 1, 2), 10);
  state = observeMonitorAuthority(state, report("C", 1, 3), 11);
  state = observeMonitorAuthority(state, report("B", 1, 2), 12);
  const authority = readFreshMonitorAuthority(state, 13);
  assert.equal(authority?.sceneId, "C");
  assert.equal(authority?.agenda?.[0]?.page, 3);
});

test("candidate retry identity is bounded and independent of report sequence", () => {
  let key = nextMonitorCandidateRetryKey("retry-a");
  assert.equal(key, "retry-b");
  key = nextMonitorCandidateRetryKey(key);
  assert.equal(key, "retry-a");
  for (let sequence = 1; sequence <= 100; sequence += 1) {
    // Sequences order authority state; they are deliberately absent from this
    // two-value preparation/supersession key.
    if (sequence % 10 === 0) key = nextMonitorCandidateRetryKey(key);
  }
  assert.ok(key === "retry-a" || key === "retry-b");
});

test("same-scene page reports advance exact authoritative state without a scene key change", () => {
  let state = createMonitorAuthorityState();
  const sceneKey = (value: MonitorAuthorityReport) =>
    `${value.revision}:${value.activationEpoch}:${value.sceneId}:${value.sceneGeneration}`;
  const pages: number[] = [];
  const committedIdentity = buildMonitorFrameIdentity(
    sceneKey({ ...report("B", 4, 10), sceneGeneration: 7 }),
    "retry-a",
  );
  for (const [offset, page] of [0, 1, 3, 2].entries()) {
    const next = {
      ...report("B", 4, offset + 10),
      sceneGeneration: 7,
      agenda: [{ zoneId: "agenda", stage: "page", page, cycle: 2 }],
    };
    const previousSceneKey = state.report ? sceneKey(state.report) : sceneKey(next);
    state = observeMonitorAuthority(state, next, 1_000 + offset);
    assert.equal(sceneKey(state.report!), previousSceneKey);
    assert.equal(
      buildMonitorFrameIdentity(sceneKey(state.report!), "retry-a"),
      committedIdentity,
      "page sequence must not create a new committed frame",
    );
    pages.push(state.report!.agenda![0].page);
  }
  assert.deepEqual(pages, [0, 1, 3, 2]);
});

test("expired authority cleanly reacquires a lower new physical generation", () => {
  let state = createMonitorAuthorityState();
  state = observeMonitorAuthority(state, report("C", 8, 20), 10);
  state = observeMonitorAuthority(
    state,
    report("A", 1, 1),
    10 + MONITOR_AUTHORITY_TTL_MS + 1,
  );
  assert.equal(readFreshMonitorAuthority(state, 10 + MONITOR_AUTHORITY_TTL_MS + 1)?.sceneId, "A");
});

test("mounted follower never lets a duplicate/null poll replace a fresh physical scene", () => {
  function Harness({ observation }: { observation: MonitorAuthorityReport | null }) {
    const state = React.useRef(createMonitorAuthorityState());
    const [, rerender] = React.useState(0);
    React.useEffect(() => {
      state.current = observeMonitorAuthority(state.current, observation, 1_000);
      rerender((version) => version + 1);
    }, [observation]);
    return <output>{readFreshMonitorAuthority(state.current, 1_001)?.sceneId ?? "clock"}</output>;
  }
  const view = render(<Harness observation={report("B", 2, 2)} />);
  assert.equal(view.container.textContent, "B");
  act(() => view.rerender(<Harness observation={null} />));
  assert.equal(view.container.textContent, "B");
  act(() => view.rerender(<Harness observation={report("A", 1, 99)} />));
  assert.equal(view.container.textContent, "B");
});

test("mounted follower reacquires lower generation after an aged server lease expires", () => {
  function Harness({
    observation,
    receivedAt,
    serverTime,
    now,
  }: {
    observation: MonitorAuthorityReport;
    receivedAt: number;
    serverTime: number;
    now: number;
  }) {
    const state = React.useRef(createMonitorAuthorityState());
    const [, update] = React.useState(0);
    React.useEffect(() => {
      state.current = observeMonitorAuthority(
        state.current,
        observation,
        receivedAt,
        serverTime,
      );
      update((version) => version + 1);
    }, [observation, receivedAt, serverTime]);
    return <output>{readFreshMonitorAuthority(state.current, now)?.sceneId ?? "clock"}</output>;
  }
  const old = { ...report("B", 9, 30), reportedAt: 56_000 };
  const freshLower = { ...report("A", 1, 1), reportedAt: 102_000 };
  const view = render(
    <Harness observation={old} receivedAt={5_000} serverTime={100_000} now={5_000} />,
  );
  assert.equal(view.container.textContent, "B");
  act(() => view.rerender(
    <Harness observation={freshLower} receivedAt={7_000} serverTime={102_000} now={7_000} />,
  ));
  assert.equal(view.container.textContent, "A");
});
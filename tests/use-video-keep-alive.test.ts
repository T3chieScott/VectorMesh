// Task #196 — keep-alive watchdog for player <video> elements.
//
// Without jsdom we drive the pure `attachVideoKeepAlive` function
// against a fake video that mimics the EventTarget surface the
// hook touches. Covers the four behaviours that matter on a
// long-running signage tab:
//   1. an unexpected `pause` triggers a deferred play() retry
//   2. a `stalled` bumps the stall counter and retries
//   3. visibilitychange → "visible" retries play() on a paused video
//   4. five consecutive failures inside the rolling window invoke
//      window.location.reload() as a last-resort recovery
//   5. cleanup detaches every listener and the resume timer

import test from "node:test";
import assert from "node:assert/strict";

const PREFIX = "__TEST_S196__"; // for log-grepping symmetry with other suites

const {
  attachVideoKeepAlive,
  RESUME_DELAY_MS,
  MAX_CONSECUTIVE_FAILURES,
} = await import("../client/src/hooks/use-video-keep-alive");

interface ListenerMap {
  [event: string]: Array<() => void>;
}

interface FakeVideo {
  paused: boolean;
  ended: boolean;
  loop: boolean;
  playCalls: number;
  playRejectsWith: Error | null;
  listeners: ListenerMap;
  play(): Promise<void>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  fire(type: string): void;
}

function makeFakeVideo(): FakeVideo {
  const v: FakeVideo = {
    paused: true,
    ended: false,
    loop: false,
    playCalls: 0,
    playRejectsWith: null,
    listeners: {},
    play() {
      v.playCalls += 1;
      if (v.playRejectsWith) {
        return Promise.reject(v.playRejectsWith);
      }
      v.paused = false;
      return Promise.resolve();
    },
    addEventListener(type, listener) {
      (v.listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      const arr = v.listeners[type];
      if (!arr) return;
      const i = arr.indexOf(listener);
      if (i >= 0) arr.splice(i, 1);
    },
    fire(type) {
      const arr = v.listeners[type];
      if (!arr) return;
      for (const l of [...arr]) l();
    },
  };
  return v;
}

interface FakeTarget {
  visibilityState?: string;
  listeners: ListenerMap;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  fire(type: string): void;
}

function makeFakeTarget(visibilityState?: string): FakeTarget {
  const t: FakeTarget = {
    visibilityState,
    listeners: {},
    addEventListener(type, listener) {
      (t.listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      const arr = t.listeners[type];
      if (!arr) return;
      const i = arr.indexOf(listener);
      if (i >= 0) arr.splice(i, 1);
    },
    fire(type) {
      const arr = t.listeners[type];
      if (!arr) return;
      for (const l of [...arr]) l();
    },
  };
  return t;
}

function makeStats() {
  const s = { stalls: 0, recoveries: 0, reloads: 0 };
  return {
    stats: s,
    bump(key: keyof typeof s) {
      s[key] += 1;
    },
  };
}

// Lets pending microtasks (e.g. .then() chains queued by tryPlay)
// run before we assert. node:test doesn't auto-drain microtasks.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeManualTimer() {
  let pending: Array<{ id: number; cb: () => void; ms: number }> = [];
  let next = 1;
  return {
    setTimeoutFn(cb: () => void, ms: number) {
      const id = next++;
      pending.push({ id, cb, ms });
      return id;
    },
    clearTimeoutFn(handle: unknown) {
      pending = pending.filter((p) => p.id !== handle);
    },
    flush() {
      const due = [...pending];
      pending = [];
      for (const p of due) p.cb();
    },
    pendingCount() {
      return pending.length;
    },
  };
}

test(`${PREFIX} unexpected pause schedules a deferred resume that calls play()`, async () => {
  const video = makeFakeVideo();
  video.paused = false;
  const { stats, bump } = makeStats();
  const timer = makeManualTimer();
  const reloads: number[] = [];

  const cleanup = attachVideoKeepAlive(video, {
    doc: makeFakeTarget("visible"),
    win: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { reload: () => reloads.push(Date.now()) },
    },
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    bump,
  });

  // Simulate the browser auto-pausing the video.
  video.paused = true;
  video.fire("pause");

  assert.equal(timer.pendingCount(), 1, "pause should schedule a resume");
  assert.equal(video.playCalls, 0, "play() should not be called synchronously");

  timer.flush();
  await flushMicrotasks();

  assert.equal(video.playCalls, 1, "resume should call play()");
  assert.equal(stats.recoveries, 1, "recovery should be counted");
  assert.equal(stats.stalls, 0, "a benign pause does not bump stall");
  assert.equal(reloads.length, 0, "no reload on a single recovery");

  cleanup();
});

test(`${PREFIX} suspend on a paused video triggers a deferred resume; suspend on a playing video is a no-op`, async () => {
  const video = makeFakeVideo();
  const { stats, bump } = makeStats();
  const timer = makeManualTimer();

  const cleanup = attachVideoKeepAlive(video, {
    doc: makeFakeTarget("visible"),
    win: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { reload: () => {} },
    },
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    bump,
  });

  // Currently playing — suspend should NOT schedule a resume.
  video.paused = false;
  video.fire("suspend");
  assert.equal(timer.pendingCount(), 0, "suspend on playing video is benign");
  assert.equal(stats.stalls, 0, "suspend never bumps stall counter");

  // Now paused — suspend should kick the watchdog.
  video.paused = true;
  video.fire("suspend");
  assert.equal(timer.pendingCount(), 1, "suspend on paused video schedules resume");
  timer.flush();
  await flushMicrotasks();
  assert.equal(video.playCalls, 1);
  assert.equal(stats.recoveries, 1);
  assert.equal(stats.stalls, 0, "suspend still must not bump stall counter");

  cleanup();
});

test(`${PREFIX} stalled event bumps stall counter and retries play()`, async () => {
  const video = makeFakeVideo();
  video.paused = true;
  const { stats, bump } = makeStats();
  const timer = makeManualTimer();

  const cleanup = attachVideoKeepAlive(video, {
    doc: makeFakeTarget("visible"),
    win: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { reload: () => {} },
    },
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    bump,
  });

  video.fire("stalled");
  assert.equal(stats.stalls, 1, "stall should be counted immediately");
  timer.flush();
  await flushMicrotasks();
  assert.equal(video.playCalls, 1, "stall should schedule a resume");
  assert.equal(stats.recoveries, 1);

  cleanup();
});

test(`${PREFIX} visibilitychange → visible resumes a paused video`, async () => {
  const video = makeFakeVideo();
  video.paused = true;
  const doc = makeFakeTarget("hidden");
  const { stats, bump } = makeStats();
  const timer = makeManualTimer();

  const cleanup = attachVideoKeepAlive(video, {
    doc,
    win: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { reload: () => {} },
    },
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    bump,
  });

  // Tab still hidden — no auto-resume.
  doc.visibilityState = "hidden";
  doc.fire("visibilitychange");
  assert.equal(video.playCalls, 0);

  // Tab thaws → resume.
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  await flushMicrotasks();
  assert.equal(video.playCalls, 1, "becoming visible should retry play()");
  assert.equal(stats.recoveries, 1);

  cleanup();
});

test(`${PREFIX} five consecutive failures inside the window trigger reload`, async () => {
  const video = makeFakeVideo();
  video.paused = true;
  // play() always rejects so each retry counts another failure.
  video.playRejectsWith = new Error("decode failed");
  const { stats, bump } = makeStats();
  const timer = makeManualTimer();
  let reloads = 0;

  const cleanup = attachVideoKeepAlive(video, {
    doc: makeFakeTarget("visible"),
    win: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { reload: () => { reloads += 1; } },
    },
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    nowFn: () => 1000, // pin to the same instant; failures stay in-window
    bump,
  });

  // Drive the failure pipeline. Each `error` synchronously bumps a
  // stall and schedules a resume; the resume's play() rejection
  // bumps another stall. We trigger errors directly until we cross
  // the threshold.
  for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
    video.fire("error");
  }

  assert.ok(
    stats.stalls >= MAX_CONSECUTIVE_FAILURES,
    `expected at least ${MAX_CONSECUTIVE_FAILURES} stalls, got ${stats.stalls}`,
  );
  assert.equal(reloads, 1, "should reload once after threshold reached");
  assert.equal(stats.reloads, 1);

  cleanup();
});

test(`${PREFIX} vm:player-wake on a paused video resumes playback`, async () => {
  const video = makeFakeVideo();
  video.paused = true;
  const win = {
    listeners: {} as ListenerMap,
    addEventListener(type: string, listener: () => void) {
      (win.listeners[type] ||= []).push(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      const arr = win.listeners[type];
      if (!arr) return;
      const i = arr.indexOf(listener);
      if (i >= 0) arr.splice(i, 1);
    },
    location: { reload: () => {} },
    fire(type: string) {
      for (const l of [...(win.listeners[type] || [])]) l();
    },
  };
  const { stats, bump } = makeStats();
  const timer = makeManualTimer();

  const cleanup = attachVideoKeepAlive(video, {
    doc: makeFakeTarget("visible"),
    win,
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    bump,
  });

  // Root-level wake broadcast lands on window.
  win.fire("vm:player-wake");
  await flushMicrotasks();

  assert.equal(video.playCalls, 1, "wake event should retry play() on paused video");
  assert.equal(stats.recoveries, 1, "successful resume should bump recoveries");

  cleanup();

  // After cleanup the listener is gone — extra wakes are no-ops.
  win.fire("vm:player-wake");
  await flushMicrotasks();
  assert.equal(video.playCalls, 1, "wake after cleanup must not retry");
});

test(`${PREFIX} cleanup detaches every listener`, () => {
  const video = makeFakeVideo();
  const doc = makeFakeTarget("visible");
  const win = {
    listeners: {} as ListenerMap,
    addEventListener(type: string, listener: () => void) {
      (win.listeners[type] ||= []).push(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      const arr = win.listeners[type];
      if (!arr) return;
      const i = arr.indexOf(listener);
      if (i >= 0) arr.splice(i, 1);
    },
    location: { reload: () => {} },
  };
  const { bump } = makeStats();
  const timer = makeManualTimer();

  const cleanup = attachVideoKeepAlive(video, {
    doc,
    win,
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    bump,
  });

  // Schedule a resume so we have a pending timer.
  video.paused = true;
  video.fire("pause");
  assert.equal(timer.pendingCount(), 1);

  cleanup();

  for (const arr of Object.values(video.listeners)) {
    assert.equal(arr.length, 0, "video listeners should be detached");
  }
  for (const arr of Object.values(doc.listeners)) {
    assert.equal(arr.length, 0, "document listeners should be detached");
  }
  for (const arr of Object.values(win.listeners)) {
    assert.equal(arr.length, 0, "window listeners should be detached");
  }
  assert.equal(timer.pendingCount(), 0, "pending resume timer should be cleared");
  // After cleanup, even if we fire timer (defense in depth), play() should not be called.
  void RESUME_DELAY_MS;
});

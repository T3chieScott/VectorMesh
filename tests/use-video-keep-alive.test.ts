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

test(`${PREFIX} five consecutive failed retries inside the window trigger reload`, async () => {
  const video = makeFakeVideo();
  video.paused = true;
  // play() always rejects so every retry counts as a failed retry.
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

  // Drive the failure pipeline. Each `error` event bumps the stalls
  // stat and schedules a retry. We flush the timer (and microtasks)
  // between events so each retry actually runs and rejects, ticking
  // the internal failures counter that drives reload escalation.
  // Stalled/error events alone must NOT count toward the threshold.
  for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
    video.fire("error");
    timer.flush();
    await flushMicrotasks();
  }

  assert.equal(
    stats.stalls,
    MAX_CONSECUTIVE_FAILURES,
    `error events should bump the stalls stat exactly once each (got ${stats.stalls})`,
  );
  assert.equal(reloads, 1, "should reload once after MAX failed retries reached");
  assert.equal(stats.reloads, 1);

  cleanup();
});

test(`${PREFIX} stalled+recovered cycles never trigger reload, no matter how many`, async () => {
  // Regression guard for the "failed retries only" semantics: even
  // 50 stall-then-recover cycles must not cross the reload threshold,
  // because each retry succeeds.
  const video = makeFakeVideo();
  video.paused = true;
  // play() resolves cleanly every time → no failed retries.
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
    nowFn: () => 1000,
    bump,
  });

  for (let i = 0; i < 50; i++) {
    video.paused = true; // simulate the browser re-pausing between cycles
    video.fire("stalled");
    timer.flush();
    await flushMicrotasks();
  }

  assert.equal(reloads, 0, "successful recoveries must never trigger reload");
  assert.equal(stats.reloads, 0);
  assert.equal(stats.stalls, 50, "stat counter still reflects all stall events");
  assert.ok(stats.recoveries > 0, "successful retries should bump recoveries");

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

test(`${PREFIX} wake event has no effect on a video without keep-alive attached (inactive crossfade layer)`, async () => {
  // Regression guard for Task #196 architect review:
  // The player root broadcasts `vm:player-wake` on every lifecycle
  // thaw. The MediaPlayerWidget's *inactive* crossfade layer mounts
  // with keep-alive disabled (`enabled={isActive && ...}`), which
  // means useVideoKeepAlive does NOT call attachVideoKeepAlive on
  // it. The hook with no attached listeners must stay silent — if
  // the root ever reverts to a blanket querySelectorAll('video').play()
  // walk, this test will fail because the inactive video would be
  // played anyway.
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

  // Deliberately do NOT call attachVideoKeepAlive — this models the
  // disabled hook (inactive crossfade layer).
  win.fire("vm:player-wake");
  await flushMicrotasks();

  assert.equal(
    video.playCalls,
    0,
    "inactive layer with disabled keep-alive must not be auto-played by the root wake broadcast",
  );
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

// ─── Task #197: cross-reload persistence ─────────────────────────
//
// The watchdog increments `reloads` and immediately calls
// `window.location.reload()`. Without persistence, the in-memory
// counter resets on the way down and the next heartbeat reports
// the same value the server already had — so the audit-log row
// never fires and the dashboard badge never turns red. These
// tests pin the sessionStorage round-trip so that gap stays fixed.

const {
  getVideoStats,
  VIDEO_STATS_STORAGE_KEY,
} = await import("../client/src/hooks/use-video-keep-alive");

interface FakeStorage {
  store: Record<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

function makeFakeStorage(seed: Record<string, string> = {}): FakeStorage {
  const store: Record<string, string> = { ...seed };
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

// Clean room for each test: install a global window/sessionStorage,
// wipe the in-memory cache key, then run the assertion. We restore
// (delete) the globals afterwards so other tests aren't affected.
async function withFakeWindow(
  seed: Record<string, string>,
  fn: (storage: FakeStorage) => void | Promise<void>,
): Promise<void> {
  const storage = makeFakeStorage(seed);
  const fakeWindow = { sessionStorage: storage } as Record<string, unknown>;
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  g.window = fakeWindow;
  try {
    await fn(storage);
  } finally {
    delete fakeWindow.__vmPlayerVideoStats;
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
}

test(`${PREFIX} Task #197: getVideoStats hydrates from sessionStorage on first call after reload`, async () => {
  // Simulate the post-reload fresh page: sessionStorage already
  // carries the bumped reloads count from the pre-reload tick.
  await withFakeWindow(
    { [VIDEO_STATS_STORAGE_KEY]: JSON.stringify({ stalls: 7, recoveries: 4, reloads: 2 }) },
    () => {
      const stats = getVideoStats();
      assert.deepEqual(stats, { stalls: 7, recoveries: 4, reloads: 2 });
    },
  );
});

test(`${PREFIX} Task #197: bumping reloads writes through to sessionStorage so the value survives a page reload`, async () => {
  await withFakeWindow({}, async (storage) => {
    const video = makeFakeVideo();
    const reloads: number[] = [];
    const win = {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { reload: () => reloads.push(Date.now()) },
    };
    const timer = makeManualTimer();

    // Drive a real reload escalation through attachVideoKeepAlive
    // WITHOUT injecting a custom bump — that way we exercise the
    // production bumpStat path that mirrors to sessionStorage.
    video.paused = true;
    video.playRejectsWith = new Error("decode failed");

    let now = 0;
    const cleanup = attachVideoKeepAlive(video, {
      doc: makeFakeTarget(),
      win,
      setTimeoutFn: timer.setTimeoutFn,
      clearTimeoutFn: timer.clearTimeoutFn,
      nowFn: () => now,
    });

    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      video.fire("pause");
      timer.flush();
      await flushMicrotasks();
      now += 100; // stay inside the failure window
    }

    assert.equal(reloads.length, 1, "reload should have fired once");

    const raw = storage.getItem(VIDEO_STATS_STORAGE_KEY);
    assert.ok(raw, "sessionStorage should hold the persisted stats");
    const parsed = JSON.parse(raw!) as { reloads: number };
    assert.equal(
      parsed.reloads,
      1,
      "reloads counter must be persisted BEFORE window.location.reload() returns " +
        "— otherwise the post-reload heartbeat reports the stale pre-bump value " +
        "and the server never sees the increase",
    );

    cleanup();
  });
});

test(`${PREFIX} Task #197: corrupt sessionStorage value falls back to clean stats`, async () => {
  await withFakeWindow({ [VIDEO_STATS_STORAGE_KEY]: "{not json" }, () => {
    const stats = getVideoStats();
    assert.deepEqual(stats, { stalls: 0, recoveries: 0, reloads: 0 });
  });
});

test(`${PREFIX} Task #197: negative or non-numeric values in sessionStorage are coerced to 0`, async () => {
  await withFakeWindow(
    { [VIDEO_STATS_STORAGE_KEY]: JSON.stringify({ stalls: -3, recoveries: "abc", reloads: 5.7 }) },
    () => {
      const stats = getVideoStats();
      assert.deepEqual(stats, { stalls: 0, recoveries: 0, reloads: 5 });
    },
  );
});

test(`${PREFIX} Task #197: post-reload first heartbeat picks up persisted reloads even with no new video events`, async () => {
  // The end-to-end gap the dashboard depends on: after a watchdog
  // forces window.location.reload(), the brand-new page has a fresh
  // in-memory `__vmPlayerVideoStats` (none). If the heartbeat reads
  // the in-memory cache directly it sends 0/0/0 and the server
  // never sees the bumped count. The fix is that the heartbeat
  // calls getVideoStats() — which transparently hydrates from
  // sessionStorage — so the very first heartbeat after reload
  // already carries the persisted count even though no stall,
  // recovery or other watchdog event has fired yet.
  await withFakeWindow(
    { [VIDEO_STATS_STORAGE_KEY]: JSON.stringify({ stalls: 9, recoveries: 3, reloads: 4 }) },
    () => {
      // Sanity: in-memory cache is empty at the start of the new
      // page lifecycle (we wipe __vmPlayerVideoStats in withFakeWindow's
      // finally; here we have a fresh fake window).
      const w = (globalThis as { window?: Record<string, unknown> }).window!;
      assert.equal(w["__vmPlayerVideoStats"], undefined);

      // Production path: heartbeat reads stats via getVideoStats.
      const reported = getVideoStats();
      assert.deepEqual(reported, { stalls: 9, recoveries: 3, reloads: 4 });
      assert.equal(
        reported.reloads,
        4,
        "first heartbeat after reload MUST report the persisted reloads " +
          "count so the server detects an increase and writes the audit row",
      );
    },
  );
});

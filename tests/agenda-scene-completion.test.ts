import assert from "node:assert/strict";
import test from "node:test";
import {
  activationId, AgendaSceneCompletionCoordinator, calculateAgendaSafetyTimeoutMs, MAX_AGENDA_SAFETY_TIMEOUT_MS,
  playerId, sceneId, zoneId,
} from "../client/src/lib/agenda-scene-completion";
import {
  resolveAgendaActivationInputs,
  resolveSceneDurationMs,
} from "../client/src/hooks/use-agenda-scene-completion";
import type { LayoutZone, MediaAsset } from "../shared/schema";

class FakeTimer {
  time = 0;
  private nextId = 0;
  private timers = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  setTimeout = (callback: () => void, delay: number) => {
    const id = ++this.nextId; this.timers.set(id, { due: this.time + delay, callback }); return id;
  };
  clearTimeout = (id: unknown) => { this.timers.delete(id as number); };
  tick(ms: number) {
    const end = this.time + ms;
    while (true) {
      const entry = [...this.timers.entries()].filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry) break;
      this.time = entry[1].due; this.timers.delete(entry[0]); entry[1].callback();
    }
    this.time = end;
  }
}

const p = playerId("player"), s = sceneId("scene"), a = activationId("activation");
const z1 = zoneId("one"), z2 = zoneId("two");
function setup() {
  const timer = new FakeTimer(); const advanced: string[] = [];
  const coordinator = new AgendaSceneCompletionCoordinator({
    timer, onAdvance: (activation) => advanced.push(activation.activationId),
  });
  return { timer, advanced, coordinator };
}
function agenda(ids: readonly typeof z1[] | readonly (typeof z1 | typeof z2)[], minimumDurationMs = 100) {
  return { kind: "agenda" as const, playerId: p, sceneId: s, activationId: a, minimumDurationMs, expectedAgendaZoneIds: ids };
}

test("static scenes preserve and advance at their existing duration", () => {
  const { coordinator, timer, advanced } = setup();
  coordinator.begin({ kind: "static", playerId: p, sceneId: s, activationId: a, durationMs: 123 });
  assert.equal(coordinator.snapshot()?.activation.kind, "static");
  assert.equal((coordinator.snapshot()?.activation as { durationMs: number }).durationMs, 123);
  timer.tick(122); assert.deepEqual(advanced, []);
  timer.tick(1); assert.deepEqual(advanced, ["activation"]);
});

test("equivalent polled media/layout arrays preserve value-based activation inputs", () => {
  const item = { id: "item", layoutTemplateId: "scene", mediaAssetId: "asset", duration: null };
  const mediaA = [{ id: "asset", duration: 42 }] as MediaAsset[];
  const mediaB = [{ id: "asset", duration: 42 }] as MediaAsset[];
  const zonesA = [{ id: "agenda-zone", type: "agenda" }] as LayoutZone[];
  const zonesB = [{ id: "agenda-zone", type: "agenda" }] as LayoutZone[];
  assert.notEqual(mediaA, mediaB);
  assert.notEqual(zonesA, zonesB);
  assert.deepEqual(
    resolveAgendaActivationInputs(item, mediaA, zonesA),
    resolveAgendaActivationInputs(item, mediaB, zonesB),
  );
  assert.equal(resolveSceneDurationMs({ ...item, duration: 7 }, mediaB), 7_000);
  assert.equal(resolveSceneDurationMs(item, mediaB), 42_000);
  assert.equal(resolveSceneDurationMs({ ...item, mediaAssetId: "gone" }, mediaB), 30_000);
});

test("early Agenda completion waits for the minimum duration", () => {
  const { coordinator, timer, advanced } = setup(); coordinator.begin(agenda([z1]));
  assert.equal(coordinator.registerZone(a, z1, 50), true); coordinator.markZoneReady(a, z1); coordinator.completeZone(a, z1);
  timer.tick(99); assert.deepEqual(advanced, []);
  timer.tick(1); assert.deepEqual(advanced, ["activation"]);
});

test("late completion advances immediately after the minimum", () => {
  const { coordinator, timer, advanced } = setup(); coordinator.begin(agenda([z1]));
  coordinator.registerZone(a, z1); coordinator.markZoneReady(a, z1); timer.tick(100);
  assert.deepEqual(advanced, []); coordinator.completeZone(a, z1); assert.deepEqual(advanced, ["activation"]);
});

test("all viable Agenda zones must complete", () => {
  const { coordinator, timer, advanced } = setup(); coordinator.begin(agenda([z1, z2]));
  for (const id of [z1, z2]) { coordinator.registerZone(a, id); coordinator.markZoneReady(a, id); }
  coordinator.completeZone(a, z1); timer.tick(100); assert.deepEqual(advanced, []);
  coordinator.completeZone(a, z2); assert.deepEqual(advanced, ["activation"]);
});

test("failed and unmounted zones settle and cannot deadlock", () => {
  const { coordinator, timer, advanced } = setup(); coordinator.begin(agenda([z1, z2]));
  coordinator.failZone(a, z1); coordinator.registerZone(a, z2); coordinator.markZoneReady(a, z2); coordinator.unregisterZone(a, z2);
  timer.tick(100); assert.deepEqual(advanced, ["activation"]);
});

test("safety timeout uses zone plan plus grace and eventually advances", () => {
  assert.equal(calculateAgendaSafetyTimeoutMs(100, [40_000]), 50_000);
  assert.equal(calculateAgendaSafetyTimeoutMs(100, []), 30_000);
  assert.equal(calculateAgendaSafetyTimeoutMs(700_000, []), 700_000, "never cuts short a scene minimum");
  const { coordinator, timer, advanced } = setup(); coordinator.begin(agenda([z1]));
  coordinator.registerZone(a, z1, 40_000);
  timer.tick(MAX_AGENDA_SAFETY_TIMEOUT_MS - 1); assert.deepEqual(advanced, []);
  timer.tick(1); assert.deepEqual(advanced, ["activation"]);
});

test("a ready zone can extend its high-water plan without shortening safety", () => {
  const { coordinator, timer, advanced } = setup();
  coordinator.begin(agenda([z1], 1_000));
  coordinator.registerZone(a, z1, 3_000);
  coordinator.markZoneReady(a, z1);
  // Initial deadline is max(30s floor, 3s + 10s grace). A later credible
  // cycle estimate extends it from the same presentation start.
  timer.tick(500);
  coordinator.registerZone(a, z1, 60_000);
  timer.tick(29_500); assert.deepEqual(advanced, []);
  coordinator.completeZone(a, z1);
  assert.deepEqual(advanced, ["activation"]);
});

test("a mounted loading zone is not cut off by missing-zone safety", () => {
  const { coordinator, timer, advanced } = setup();
  coordinator.begin(agenda([z1], 10_000));
  coordinator.registerZone(a, z1);
  timer.tick(31_000);
  assert.deepEqual(advanced, []);
  coordinator.markZoneReady(a, z1);
  coordinator.completeZone(a, z1);
  timer.tick(9_999); assert.deepEqual(advanced, []);
  timer.tick(1); assert.deepEqual(advanced, ["activation"]);
});

test("stale activation signals are ignored and a repeated scene is fresh", () => {
  const { coordinator, timer, advanced } = setup(); const old = activationId("old"), fresh = activationId("fresh");
  coordinator.begin({ ...agenda([z1]), activationId: old }); coordinator.begin({ ...agenda([z1]), activationId: fresh });
  assert.equal(coordinator.registerZone(old, z1), false);
  assert.equal(coordinator.registerZone(fresh, z1), true); coordinator.markZoneReady(fresh, z1); coordinator.completeZone(fresh, z1);
  timer.tick(100); assert.deepEqual(advanced, ["fresh"]);
});

test("late registration cannot reopen a terminal zone or restart armed dwell", () => {
  const { coordinator, timer, advanced } = setup();
  coordinator.begin(agenda([z1]));
  coordinator.failZone(a, z1);
  assert.equal(coordinator.registerZone(a, z1, 99_999), true);
  timer.tick(100);
  assert.deepEqual(advanced, ["activation"]);
});

test("readiness settling is required, while no expected zones needs only the minimum", () => {
  const { coordinator, timer, advanced } = setup(); coordinator.begin(agenda([z1]));
  coordinator.registerZone(a, z1); timer.tick(100); assert.deepEqual(advanced, []);
  coordinator.failZone(a, z1); timer.tick(99); assert.deepEqual(advanced, []);
  timer.tick(1); assert.deepEqual(advanced, ["activation"]);
  const next = activationId("no-zones"); coordinator.begin({ ...agenda([]), activationId: next });
  timer.tick(99); assert.deepEqual(advanced, ["activation"]);
  timer.tick(1); assert.deepEqual(advanced, ["activation", "no-zones"]);
});

test("Agenda minimum starts after delayed readiness, while a missing zone safety-advances", () => {
  const { coordinator, timer, advanced } = setup();
  coordinator.begin(agenda([z1], 10_000));
  timer.tick(5_000);
  coordinator.markZoneReady(a, z1);
  coordinator.completeZone(a, z1);
  timer.tick(9_999); assert.deepEqual(advanced, []);
  timer.tick(1); assert.deepEqual(advanced, ["activation"]);

  const missing = activationId("missing");
  coordinator.begin({ ...agenda([z1]), activationId: missing });
  timer.tick(29_999);
  assert.deepEqual(advanced, ["activation"]);
  timer.tick(1); assert.deepEqual(advanced, ["activation", "missing"]);
});
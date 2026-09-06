import test from "node:test";
import assert from "node:assert/strict";
import type { AgendaItem } from "../shared/schema";
import {
  BOTTOM_PAUSE_MS,
  buildControlledNowNextPages,
  nextControlledPageIndex,
  resolveAgendaPresentationDwellMs,
  TOP_PAUSE_MS,
} from "../client/src/components/agenda/AgendaDisplayWidget";

const now = new Date("2030-01-01T10:00:00Z");
function item(id: string, start: string, end: string): AgendaItem {
  return { id, startsAt: new Date(start), endsAt: new Date(end), status: "scheduled" } as AgendaItem;
}

test("controlled Now/Next freezes Now only, Next only, and Now then Next", () => {
  const current = item("now", "2030-01-01T09:00:00Z", "2030-01-01T11:00:00Z");
  const next = item("next", "2030-01-01T12:00:00Z", "2030-01-01T13:00:00Z");
  assert.deepEqual(buildControlledNowNextPages([current], now).map(p => p.map(i => i.id)), [["now"]]);
  assert.deepEqual(buildControlledNowNextPages([next], now).map(p => p.map(i => i.id)), [["next"]]);
  assert.deepEqual(buildControlledNowNextPages([current, next], now).map(p => p.map(i => i.id)), [["now"], ["next"]]);
  assert.deepEqual(buildControlledNowNextPages([], now), [[]]);
});

test("controlled dwell is readable for natural fit/reduced motion and extends only genuine overflow", () => {
  assert.equal(resolveAgendaPresentationDwellMs(12_000, ["a"], { a: 0 }, true), 12_000);
  assert.equal(resolveAgendaPresentationDwellMs(12_000, ["a"], { a: 560 }, false), 12_000);
  assert.equal(
    resolveAgendaPresentationDwellMs(3_000, ["a"], { a: 56 }, true),
    TOP_PAUSE_MS + 2_000 + BOTTOM_PAUSE_MS,
  );
});

test("finite controller visits five pages, one page, and empty exactly once", () => {
  const visited: number[] = [0];
  let page = 0;
  while ((page = nextControlledPageIndex(page, 5) ?? -1) >= 0) visited.push(page);
  assert.deepEqual(visited, [0, 1, 2, 3, 4]);
  assert.equal(nextControlledPageIndex(4, 5), null);
  assert.equal(nextControlledPageIndex(0, 1), null);
  assert.equal(nextControlledPageIndex(0, 0), null);
});
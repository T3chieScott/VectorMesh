import test from "node:test";
import assert from "node:assert/strict";
import type { AgendaItem } from "../shared/schema";
import {
  BOTTOM_PAUSE_MS,
  buildControlledNowNextPages,
  nextControlledPageIndex,
  resolveAgendaPresentationDwellMs,
  SCROLL_PX_PER_SEC,
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

test("page dwell takes the longest presenter or description reveal, never their sum", () => {
  const configured = 3_000;
  const presenterLong = TOP_PAUSE_MS + Math.ceil(280 / SCROLL_PX_PER_SEC * 1_000) + BOTTOM_PAUSE_MS;
  const descriptionLong = TOP_PAUSE_MS + Math.ceil(560 / SCROLL_PX_PER_SEC * 1_000) + BOTTOM_PAUSE_MS;
  assert.equal(
    resolveAgendaPresentationDwellMs(configured, ["card"], {
      "description:card": 56,
      "presenter:card": 280,
    }, true),
    presenterLong,
  );
  assert.equal(
    resolveAgendaPresentationDwellMs(configured, ["card"], {
      "description:card": 560,
      "presenter:card": 56,
    }, true),
    descriptionLong,
  );
  assert.equal(
    resolveAgendaPresentationDwellMs(configured, ["card"], {
      "description:card": 280,
      "presenter:card": 280,
    }, true),
    presenterLong,
    "concurrent card viewports share the page clock",
  );
});

test("page dwell uses the longest reveal across cards and remains finite under reduced motion", () => {
  const configured = 3_000;
  const expected = TOP_PAUSE_MS + Math.ceil(336 / SCROLL_PX_PER_SEC * 1_000) + BOTTOM_PAUSE_MS;
  assert.equal(
    resolveAgendaPresentationDwellMs(configured, ["first", "second"], {
      "presenter:first": 28,
      "description:second": 336,
    }, true),
    expected,
  );
  assert.equal(
    resolveAgendaPresentationDwellMs(configured, ["first", "second"], {
      "presenter:first": 999,
      "description:second": 999,
    }, false),
    configured,
    "reduced motion uses the configured finite dwell",
  );
});

test("Now/Next stages use the same page dwell calculation", () => {
  const expected = TOP_PAUSE_MS + Math.ceil(84 / SCROLL_PX_PER_SEC * 1_000) + BOTTOM_PAUSE_MS;
  assert.equal(
    resolveAgendaPresentationDwellMs(3_000, ["now-stage"], {
      "presenter:now-stage": 84,
    }, true),
    expected,
  );
  assert.equal(
    resolveAgendaPresentationDwellMs(3_000, ["next-stage"], {
      "description:next-stage": 84,
    }, true),
    expected,
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
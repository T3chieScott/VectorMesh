import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePlaybackStatus,
  blockFiringWindowForDay,
  ruleAdmitsDay,
  type PlaybackBlock,
} from "../shared/playback-derivation";
import type { TimeRule } from "../shared/schema";

// Helper: build a block with one TimeRule covering daysOfWeek between
// startTime/endTime, optionally bounded by start/end dates.
function block(
  id: string,
  rule: Partial<TimeRule>,
  name = `Block ${id}`,
): PlaybackBlock {
  const filled: TimeRule = {
    daysOfWeek: rule.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    startTime: rule.startTime ?? "00:00",
    endTime: rule.endTime ?? "23:59",
    startDate: rule.startDate,
    endDate: rule.endDate,
  } as TimeRule;
  return { id, name, timeRules: [filled] };
}

const FRIDAY_2PM = new Date("2026-04-24T14:00:00"); // local time, getDay=5

test("ruleAdmitsDay matches when day-of-week is in the list", () => {
  const r: TimeRule = { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM), true);
});

test("ruleAdmitsDay rejects when day-of-week is not in the list", () => {
  const r: TimeRule = { daysOfWeek: [0, 6], startTime: "09:00", endTime: "17:00" } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM), false);
});

test("ruleAdmitsDay rejects when date is before startDate", () => {
  const r: TimeRule = {
    daysOfWeek: [],
    startTime: "09:00",
    endTime: "17:00",
    startDate: "2026-05-01",
  } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM), false);
});

test("ruleAdmitsDay rejects when date is after endDate", () => {
  const r: TimeRule = {
    daysOfWeek: [],
    startTime: "09:00",
    endTime: "17:00",
    endDate: "2026-04-23",
  } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM), false);
});

test("blockFiringWindowForDay returns null for a block with no time rules", () => {
  const b: PlaybackBlock = { id: "x", name: "x", timeRules: [] };
  assert.equal(blockFiringWindowForDay(b, FRIDAY_2PM), null);
});

test("blockFiringWindowForDay returns null when end <= start (invalid)", () => {
  const b = block("a", { startTime: "17:00", endTime: "09:00" });
  assert.equal(blockFiringWindowForDay(b, FRIDAY_2PM), null);
});

test("blockFiringWindowForDay returns the parsed [start,end) window on a matching day", () => {
  const b = block("a", { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" });
  const w = blockFiringWindowForDay(b, FRIDAY_2PM);
  assert.ok(w);
  assert.equal(w!.start.getHours(), 9);
  assert.equal(w!.start.getMinutes(), 0);
  assert.equal(w!.end.getHours(), 17);
});

test("derivePlaybackStatus returns noEvent when there's no booking and no blocks", () => {
  const status = derivePlaybackStatus([], false, FRIDAY_2PM);
  assert.equal(status.kind, "noEvent");
});

test("derivePlaybackStatus returns noBlockToday when an event is booked but no block fires", () => {
  // Block fires only on Sunday (day 0); today is Friday.
  const b = block("a", { daysOfWeek: [0], startTime: "09:00", endTime: "17:00" });
  const status = derivePlaybackStatus([b], true, FRIDAY_2PM);
  assert.equal(status.kind, "noBlockToday");
});

test("derivePlaybackStatus reports the currently-playing block", () => {
  const b = block("a", { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" });
  const status = derivePlaybackStatus([b], true, FRIDAY_2PM);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "a");
    assert.equal(status.endsAt.getHours(), 17);
  }
});

test("derivePlaybackStatus prefers the block that ends latest when two are concurrent at equal priority", () => {
  const shorter = block("short", { daysOfWeek: [5], startTime: "09:00", endTime: "15:00" });
  const longer = block("long", { daysOfWeek: [5], startTime: "10:00", endTime: "18:00" });
  const status = derivePlaybackStatus([shorter, longer], true, FRIDAY_2PM);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "long");
  }
});

test("derivePlaybackStatus picks the higher-priority block even if its window is shorter", () => {
  // The player's content resolver sorts blocks by priority desc; the
  // operator UI must show the same answer or it'll lie about what's
  // actually on screen.
  const lowPrioLong: PlaybackBlock = {
    id: "long",
    name: "Long, low priority",
    timeRules: [
      { daysOfWeek: [5], startTime: "10:00", endTime: "20:00" } as TimeRule,
    ],
    priority: 0,
  };
  const highPrioShort: PlaybackBlock = {
    id: "short",
    name: "Short, high priority",
    timeRules: [
      { daysOfWeek: [5], startTime: "13:00", endTime: "15:00" } as TimeRule,
    ],
    priority: 100,
  };
  const status = derivePlaybackStatus([lowPrioLong, highPrioShort], true, FRIDAY_2PM);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "short");
  }
});

test("derivePlaybackStatus treats missing priority as zero", () => {
  // Make sure a block without an explicit priority doesn't accidentally
  // outrank one with a positive priority.
  const noPrio: PlaybackBlock = {
    id: "noprio",
    name: "No priority",
    timeRules: [
      { daysOfWeek: [5], startTime: "12:00", endTime: "18:00" } as TimeRule,
    ],
  };
  const withPrio: PlaybackBlock = {
    id: "prio",
    name: "Has priority",
    timeRules: [
      { daysOfWeek: [5], startTime: "13:00", endTime: "15:00" } as TimeRule,
    ],
    priority: 5,
  };
  const status = derivePlaybackStatus([noPrio, withPrio], true, FRIDAY_2PM);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "prio");
  }
});

test("derivePlaybackStatus returns playsNext when a block fires later today", () => {
  const later = block("evening", { daysOfWeek: [5], startTime: "18:00", endTime: "20:00" });
  const status = derivePlaybackStatus([later], true, FRIDAY_2PM);
  assert.equal(status.kind, "playsNext");
  if (status.kind === "playsNext") {
    assert.equal(status.blockId, "evening");
    assert.equal(status.startsAt.getHours(), 18);
  }
});

test("derivePlaybackStatus picks the earliest upcoming block among many", () => {
  const a = block("a", { daysOfWeek: [5], startTime: "20:00", endTime: "21:00" });
  const b = block("b", { daysOfWeek: [5], startTime: "16:00", endTime: "17:00" });
  const c = block("c", { daysOfWeek: [5], startTime: "18:00", endTime: "19:00" });
  const status = derivePlaybackStatus([a, b, c], true, FRIDAY_2PM);
  assert.equal(status.kind, "playsNext");
  if (status.kind === "playsNext") {
    assert.equal(status.blockId, "b");
  }
});

test("derivePlaybackStatus prefers playing over playsNext when both apply", () => {
  const now = block("now", { daysOfWeek: [5], startTime: "13:00", endTime: "15:00" });
  const later = block("later", { daysOfWeek: [5], startTime: "18:00", endTime: "20:00" });
  const status = derivePlaybackStatus([now, later], true, FRIDAY_2PM);
  assert.equal(status.kind, "playing");
});

test("derivePlaybackStatus ignores blocks whose startDate hasn't been reached yet", () => {
  const future = block("future", {
    daysOfWeek: [5],
    startTime: "09:00",
    endTime: "17:00",
    startDate: "2026-05-01",
  });
  const status = derivePlaybackStatus([future], true, FRIDAY_2PM);
  assert.equal(status.kind, "noBlockToday");
});

test("derivePlaybackStatus ignores blocks whose endDate has already passed", () => {
  const past = block("past", {
    daysOfWeek: [5],
    startTime: "09:00",
    endTime: "17:00",
    endDate: "2026-04-23",
  });
  const status = derivePlaybackStatus([past], true, FRIDAY_2PM);
  assert.equal(status.kind, "noBlockToday");
});

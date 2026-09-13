import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePlaybackStatus,
  derivePlaybackSchedule,
  blockFiringWindowForDay,
  ruleAdmitsDay,
  timeRuleWindowAt,
  type PlaybackBlock,
} from "../shared/playback-derivation";
import type { TimeRule } from "../shared/schema";

// All tests run in UTC so day arithmetic is deterministic regardless of
// where node is executed.
const TZ = "UTC";

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

const FRIDAY_2PM = new Date("2026-04-24T14:00:00Z"); // UTC, getDay=5 in UTC

test("ruleAdmitsDay matches when day-of-week is in the list", () => {
  const r: TimeRule = { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM, TZ), true);
});

test("ruleAdmitsDay rejects when day-of-week is not in the list", () => {
  const r: TimeRule = { daysOfWeek: [0, 6], startTime: "09:00", endTime: "17:00" } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM, TZ), false);
});

test("ruleAdmitsDay rejects when date is before startDate", () => {
  const r: TimeRule = {
    daysOfWeek: [],
    startTime: "09:00",
    endTime: "17:00",
    startDate: "2026-05-01",
  } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM, TZ), false);
});

test("ruleAdmitsDay rejects when date is after endDate", () => {
  const r: TimeRule = {
    daysOfWeek: [],
    startTime: "09:00",
    endTime: "17:00",
    endDate: "2026-04-23",
  } as TimeRule;
  assert.equal(ruleAdmitsDay(r, FRIDAY_2PM, TZ), false);
});

test("blockFiringWindowForDay returns null for a block with no time rules", () => {
  const b: PlaybackBlock = { id: "x", name: "x", timeRules: [] };
  assert.equal(blockFiringWindowForDay(b, FRIDAY_2PM, TZ), null);
});

test("blockFiringWindowForDay resolves an overnight window when end is before start", () => {
  const b = block("a", { startTime: "17:00", endTime: "09:00" });
  const window = blockFiringWindowForDay(b, new Date("2026-04-24T18:00:00Z"), TZ);
  assert.ok(window);
  assert.equal(window!.start.toISOString(), "2026-04-24T17:00:00.000Z");
  assert.equal(window!.end.toISOString(), "2026-04-25T09:00:00.000Z");
});

test("blockFiringWindowForDay returns the parsed [start,end) window on a matching day", () => {
  const b = block("a", { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" });
  const w = blockFiringWindowForDay(b, FRIDAY_2PM, TZ);
  assert.ok(w);
  assert.equal(w!.start.getUTCHours(), 9);
  assert.equal(w!.start.getUTCMinutes(), 0);
  assert.equal(w!.end.getUTCHours(), 17);
});

test("derivePlaybackStatus returns noEvent when there's no booking and no blocks", () => {
  const status = derivePlaybackStatus([], false, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "noEvent");
});

test("derivePlaybackStatus returns noBlockToday when an event is booked but no block fires", () => {
  // Block fires only on Sunday (day 0); today is Friday.
  const b = block("a", { daysOfWeek: [0], startTime: "09:00", endTime: "17:00" });
  const status = derivePlaybackStatus([b], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "noBlockToday");
});

test("derivePlaybackStatus reports the currently-playing block", () => {
  const b = block("a", { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" });
  const status = derivePlaybackStatus([b], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "a");
    assert.equal(status.endsAt.getUTCHours(), 17);
  }
});

test("derivePlaybackStatus prefers the block that ends latest when two are concurrent at equal priority", () => {
  const shorter = block("short", { daysOfWeek: [5], startTime: "09:00", endTime: "15:00" });
  const longer = block("long", { daysOfWeek: [5], startTime: "10:00", endTime: "18:00" });
  const status = derivePlaybackStatus([shorter, longer], true, FRIDAY_2PM, TZ);
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
  const status = derivePlaybackStatus([lowPrioLong, highPrioShort], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "short");
  }
});

test("derivePlaybackSchedule keeps the resolver winner and a future block simultaneously", () => {
  const current = {
    ...block("current", { daysOfWeek: [5], startTime: "09:00", endTime: "17:00" }),
    priority: 10,
  };
  const next = {
    ...block("next", { daysOfWeek: [5], startTime: "18:00", endTime: "20:00" }),
    priority: 1,
  };
  const schedule = derivePlaybackSchedule(
    [current, next],
    FRIDAY_2PM,
    TZ,
    "current",
  );
  assert.equal(schedule.current?.block.id, "current");
  assert.equal(schedule.next?.block.id, "next");
});

test("derivePlaybackSchedule resolves equal-start future blocks by priority then storage order", () => {
  const lower = {
    ...block("lower", { daysOfWeek: [5], startTime: "18:00", endTime: "19:00" }),
    priority: 1,
  };
  const higher = {
    ...block("higher", { daysOfWeek: [5], startTime: "18:00", endTime: "20:00" }),
    priority: 5,
  };
  const equalLater = {
    ...block("equal-later", { daysOfWeek: [5], startTime: "18:00", endTime: "21:00" }),
    priority: 5,
  };
  const schedule = derivePlaybackSchedule(
    [lower, higher, equalLater],
    FRIDAY_2PM,
    TZ,
  );
  assert.equal(schedule.next?.block.id, "higher");
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
  const status = derivePlaybackStatus([noPrio, withPrio], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "playing");
  if (status.kind === "playing") {
    assert.equal(status.blockId, "prio");
  }
});

test("derivePlaybackStatus returns playsNext when a block fires later today", () => {
  const later = block("evening", { daysOfWeek: [5], startTime: "18:00", endTime: "20:00" });
  const status = derivePlaybackStatus([later], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "playsNext");
  if (status.kind === "playsNext") {
    assert.equal(status.blockId, "evening");
    assert.equal(status.startsAt.getUTCHours(), 18);
  }
});

test("derivePlaybackStatus picks the earliest upcoming block among many", () => {
  const a = block("a", { daysOfWeek: [5], startTime: "20:00", endTime: "21:00" });
  const b = block("b", { daysOfWeek: [5], startTime: "16:00", endTime: "17:00" });
  const c = block("c", { daysOfWeek: [5], startTime: "18:00", endTime: "19:00" });
  const status = derivePlaybackStatus([a, b, c], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "playsNext");
  if (status.kind === "playsNext") {
    assert.equal(status.blockId, "b");
  }
});

test("derivePlaybackStatus prefers playing over playsNext when both apply", () => {
  const now = block("now", { daysOfWeek: [5], startTime: "13:00", endTime: "15:00" });
  const later = block("later", { daysOfWeek: [5], startTime: "18:00", endTime: "20:00" });
  const status = derivePlaybackStatus([now, later], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "playing");
});

test("derivePlaybackStatus ignores blocks whose startDate hasn't been reached yet", () => {
  const future = block("future", {
    daysOfWeek: [5],
    startTime: "09:00",
    endTime: "17:00",
    startDate: "2026-05-01",
  });
  const status = derivePlaybackStatus([future], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "noBlockToday");
});

test("derivePlaybackStatus ignores blocks whose endDate has already passed", () => {
  const past = block("past", {
    daysOfWeek: [5],
    startTime: "09:00",
    endTime: "17:00",
    endDate: "2026-04-23",
  });
  const status = derivePlaybackStatus([past], true, FRIDAY_2PM, TZ);
  assert.equal(status.kind, "noBlockToday");
});

test("canonical windows cover overnight, partial, and unbounded rules", () => {
  const cases = [
    {
      name: "overnight before midnight",
      rule: { startTime: "22:00", endTime: "02:00" } as TimeRule,
      now: new Date("2026-04-24T23:30:00Z"),
      start: "2026-04-24T22:00:00.000Z",
      end: "2026-04-25T02:00:00.000Z",
    },
    {
      name: "overnight after midnight",
      rule: { startTime: "22:00", endTime: "02:00" } as TimeRule,
      now: new Date("2026-04-25T01:30:00Z"),
      start: "2026-04-24T22:00:00.000Z",
      end: "2026-04-25T02:00:00.000Z",
    },
    {
      name: "start only",
      rule: { startTime: "09:00" } as TimeRule,
      now: new Date("2026-04-24T14:00:00Z"),
      start: "2026-04-24T09:00:00.000Z",
      end: "2026-04-25T00:00:00.000Z",
    },
    {
      name: "end only",
      rule: { endTime: "17:00" } as TimeRule,
      now: new Date("2026-04-24T14:00:00Z"),
      start: "2026-04-24T00:00:00.000Z",
      end: "2026-04-24T17:00:00.000Z",
    },
  ];

  for (const item of cases) {
    const window = timeRuleWindowAt(item.rule, item.now, TZ);
    assert.ok(window, item.name);
    assert.equal(window!.start?.toISOString(), item.start, item.name);
    assert.equal(window!.end?.toISOString(), item.end, item.name);
  }
  const unbounded = timeRuleWindowAt({} as TimeRule, FRIDAY_2PM, TZ);
  assert.deepEqual(unbounded, { start: null, end: null });
});

test("canonical schedule reports an overnight end and finds an independent next block", () => {
  const overnight = {
    ...block("overnight", { startTime: "22:00", endTime: "02:00" }),
    priority: 10,
  };
  const afterMidnight = {
    ...block("next", { startTime: "01:00", endTime: "03:00" }),
    priority: 1,
  };
  const schedule = derivePlaybackSchedule(
    [overnight, afterMidnight],
    new Date("2026-04-24T21:00:00Z"),
    TZ,
    null,
  );
  assert.equal(schedule.current, null);
  assert.equal(schedule.next?.block.id, "overnight");
  assert.equal(schedule.next?.startsAt.toISOString(), "2026-04-24T22:00:00.000Z");

  const during = derivePlaybackSchedule(
    [overnight, afterMidnight],
    new Date("2026-04-24T23:00:00Z"),
    TZ,
    "overnight",
  );
  assert.equal(during.current?.block.id, "overnight");
  assert.equal(during.current?.endsAt?.toISOString(), "2026-04-25T02:00:00.000Z");
  assert.equal(during.next?.block.id, "next");
  assert.equal(during.next?.startsAt.toISOString(), "2026-04-25T01:00:00.000Z");
});

test("date-only rules have one start, while weekday-only rules recur", () => {
  const dateRange = {
    id: "date-range",
    name: "Date range",
    timeRules: [{
      startDate: "2026-04-25",
      endDate: "2026-04-26",
    }] as TimeRule[],
  };
  const before = derivePlaybackSchedule(
    [dateRange],
    new Date("2026-04-24T23:59:00Z"),
    TZ,
  );
  assert.equal(before.next?.block.id, "date-range");
  assert.equal(before.next?.startsAt.toISOString(), "2026-04-25T00:00:00.000Z");

  const during = derivePlaybackSchedule(
    [dateRange],
    new Date("2026-04-25T23:59:00Z"),
    TZ,
    "date-range",
  );
  assert.equal(during.current?.block.id, "date-range");
  assert.equal(during.next, null, "the same date-only block must not recur at midnight");

  const afterMidnight = derivePlaybackSchedule(
    [dateRange],
    new Date("2026-04-26T00:01:00Z"),
    TZ,
    "date-range",
  );
  assert.equal(afterMidnight.current?.block.id, "date-range");
  assert.equal(afterMidnight.next, null, "date-only range remains one interval across midnight");

  const after = derivePlaybackSchedule(
    [dateRange],
    new Date("2026-04-27T00:01:00Z"),
    TZ,
  );
  assert.equal(after.current, null);
  assert.equal(after.next, null);

  const endOnly = {
    id: "end-only-date",
    name: "End only",
    timeRules: [{ endDate: "2026-04-26" }] as TimeRule[],
  };
  assert.equal(
    derivePlaybackSchedule([endOnly], new Date("2026-04-24T23:59:00Z"), TZ).next,
    null,
  );

  const recurring = {
    id: "weekday",
    name: "Saturday recurrence",
    timeRules: [{ daysOfWeek: [6] }] as TimeRule[],
  };
  const friday = derivePlaybackSchedule(
    [recurring],
    new Date("2026-04-24T23:59:00Z"),
    TZ,
  );
  assert.equal(friday.next?.startsAt.toISOString(), "2026-04-25T00:00:00.000Z");
  const saturday = derivePlaybackSchedule(
    [recurring],
    new Date("2026-04-25T12:00:00Z"),
    TZ,
    "weekday",
  );
  assert.equal(saturday.current?.block.id, "weekday");
  assert.equal(saturday.next?.startsAt.toISOString(), "2026-05-02T00:00:00.000Z");
});

test("bounded weekday recurrence ends at midnight and exhausts at endDate", () => {
  const recurring = {
    id: "bounded-weekday",
    name: "Friday and Sunday",
    timeRules: [{
      startDate: "2026-04-24",
      endDate: "2026-04-26",
      daysOfWeek: [5, 0],
    }] as TimeRule[],
  };

  const friday = derivePlaybackSchedule(
    [recurring],
    new Date("2026-04-24T12:00:00Z"),
    TZ,
    "bounded-weekday",
  );
  assert.equal(friday.current?.endsAt?.toISOString(), "2026-04-25T00:00:00.000Z");
  assert.equal(friday.next?.startsAt.toISOString(), "2026-04-26T00:00:00.000Z");
  const fridayEnd = friday.current?.endsAt;
  const nextStart = friday.next?.startsAt;
  assert.ok(fridayEnd && nextStart && fridayEnd <= nextStart);

  const finalDay = derivePlaybackSchedule(
    [recurring],
    new Date("2026-04-26T12:00:00Z"),
    TZ,
    "bounded-weekday",
  );
  assert.equal(finalDay.current?.endsAt?.toISOString(), "2026-04-27T00:00:00.000Z");
  assert.equal(finalDay.next, null);

  const exhausted = derivePlaybackSchedule(
    [recurring],
    new Date("2026-04-27T00:01:00Z"),
    TZ,
  );
  assert.equal(exhausted.current, null);
  assert.equal(exhausted.next, null);
});

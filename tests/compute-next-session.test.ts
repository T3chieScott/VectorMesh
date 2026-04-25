import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNextSession } from "../server/routes";

const SCREEN = "screen-1";

test("computeNextSession finds a block firing on the spring-forward day even when 'now' is just before midnight the night before (London)", () => {
  // 2026-03-29 is the UK spring-forward Sunday (clocks 01:00 GMT -> 02:00 BST).
  // 'now' is 2026-03-28T23:30 GMT = 23:30Z. Naively adding 24h of UTC would
  // land at 2026-03-29T23:30Z — which is 00:30 BST on 2026-03-30, skipping
  // the spring-forward day entirely.
  const now = new Date("2026-03-28T23:30:00Z");
  const blocks = [
    {
      name: "Spring forward block",
      targets: [{ type: "screen", id: SCREEN }],
      timeRules: [
        {
          startTime: "10:00",
          // No daysOfWeek restriction so this block can fire any day.
        },
      ],
    },
  ];
  const out = computeNextSession(blocks, SCREEN, now, "Europe/London");
  assert.ok(out, "expected a next-session result");
  // The next 10:00 BST after 23:30 GMT on 28 Mar is on 29 Mar at 10:00 BST = 09:00Z.
  assert.equal(out!.title, "Spring forward block");
  assert.equal(out!.time, "10:00");
});

test("computeNextSession picks up the next-day session across a fall-back boundary (London)", () => {
  // 2026-10-25 is the UK fall-back Sunday (02:00 BST -> 01:00 GMT). 'now' is
  // 2026-10-25T23:30Z (23:30 GMT, day=25). Next-day 09:00 should resolve to
  // 09:00 GMT on 26 Oct = 09:00Z, not duplicate the same calendar day.
  const now = new Date("2026-10-25T23:30:00Z");
  const blocks = [
    {
      name: "Morning briefing",
      targets: [{ type: "screen", id: SCREEN }],
      timeRules: [{ startTime: "09:00" }],
    },
  ];
  const out = computeNextSession(blocks, SCREEN, now, "Europe/London");
  assert.ok(out);
  assert.equal(out!.title, "Morning briefing");
  assert.equal(out!.time, "09:00");
});

test("computeNextSession respects daysOfWeek across DST boundaries (London)", () => {
  // 'now' on Saturday 28 Mar 2026 23:00 GMT. Block fires only on Sunday at 10:00.
  // The next Sunday is the spring-forward day (29 Mar), which the function must
  // not skip.
  const now = new Date("2026-03-28T23:00:00Z");
  const blocks = [
    {
      name: "Sunday only",
      targets: [{ type: "screen", id: SCREEN }],
      timeRules: [{ startTime: "10:00", daysOfWeek: [0] }],
    },
  ];
  const out = computeNextSession(blocks, SCREEN, now, "Europe/London");
  assert.ok(out);
  assert.equal(out!.title, "Sunday only");
});

test("computeNextSession returns null when no block fires within 7 days", () => {
  const now = new Date("2026-03-28T23:00:00Z");
  const blocks = [
    {
      name: "Wednesday only — no match within 7 days that satisfies an empty list",
      targets: [{ type: "screen", id: SCREEN }],
      timeRules: [{ startTime: "10:00", daysOfWeek: [] as number[], startDate: "2027-01-01" }],
    },
  ];
  const out = computeNextSession(blocks, SCREEN, now, "Europe/London");
  assert.equal(out, null);
});

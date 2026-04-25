import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shiftHHMMByMinutes,
  formatOffset,
  synthesizeSuspects,
  type CandidateBlockRow,
} from "../server/scheduleTzAudit";

// ---------- shiftHHMMByMinutes ----------

test("shiftHHMMByMinutes - +60 (London BST) recovers operator's intended local time", () => {
  // Operator typed 13:00 to compensate for BST. The authoring-time tz
  // offset was +60. Adding the offset back yields the intended 14:00.
  assert.equal(shiftHHMMByMinutes("13:00", 60), "14:00");
  assert.equal(shiftHHMMByMinutes("11:00", 60), "12:00");
});

test("shiftHHMMByMinutes - negative offset (e.g. New York EDT, -240)", () => {
  assert.equal(shiftHHMMByMinutes("18:00", -240), "14:00");
});

test("shiftHHMMByMinutes - wraps across midnight in both directions", () => {
  assert.equal(shiftHHMMByMinutes("23:30", 60), "00:30");
  assert.equal(shiftHHMMByMinutes("00:30", -60), "23:30");
});

test("shiftHHMMByMinutes - tolerates single-digit hour input", () => {
  assert.equal(shiftHHMMByMinutes("9:00", 60), "10:00");
});

test("shiftHHMMByMinutes - rejects malformed input by returning null", () => {
  assert.equal(shiftHHMMByMinutes("not-a-time", 60), null);
  assert.equal(shiftHHMMByMinutes("25:00", 60), null);
  assert.equal(shiftHHMMByMinutes("12:99", 60), null);
  assert.equal(shiftHHMMByMinutes("", 60), null);
});

test("shiftHHMMByMinutes - zero offset is a no-op", () => {
  assert.equal(shiftHHMMByMinutes("13:00", 0), "13:00");
});

test("shiftHHMMByMinutes - half-hour offset (e.g. India IST, +330)", () => {
  assert.equal(shiftHHMMByMinutes("09:00", 330), "14:30");
});

test("formatOffset - positive, negative, zero, half-hour zones render readably", () => {
  assert.equal(formatOffset(0), "UTC+00:00");
  assert.equal(formatOffset(60), "UTC+01:00");
  assert.equal(formatOffset(-300), "UTC-05:00");
  assert.equal(formatOffset(330), "UTC+05:30");
  assert.equal(formatOffset(-30), "UTC-00:30");
});

// ---------- synthesizeSuspects ----------

function row(overrides: Partial<CandidateBlockRow>): CandidateBlockRow {
  return {
    blockId: "blk-1",
    blockName: "Lunch loop",
    blockTimeRules: [{ startTime: "13:00", endTime: "14:00" }],
    blockCreatedAt: new Date("2025-08-15T10:00:00Z"), // London BST = +60
    programmeVersionId: "pv-1",
    programmeName: "Main programme",
    clientId: "client-A",
    clientName: "Site A",
    clientTimezone: "Europe/London",
    ...overrides,
  };
}

test("synthesizeSuspects flags a London-BST-authored block and suggests +1h shift", () => {
  const out = synthesizeSuspects([row({})]);
  assert.equal(out.length, 1);
  assert.equal(out[0].offsetMinutes, 60);
  assert.equal(out[0].rules[0].suggestedStartTime, "14:00");
  assert.equal(out[0].rules[0].suggestedEndTime, "15:00");
});

test("synthesizeSuspects uses authoring-time offset, NOT current offset (year-round correctness)", () => {
  // The block was authored in summer (BST = +60). Even if we re-run
  // the audit in winter (when London is UTC+0), the suggestion must
  // still use the authoring-time +60 offset — otherwise we'd silently
  // drop genuinely-affected blocks during the off-DST half of the
  // year.
  const winterEvalRow = row({ blockCreatedAt: new Date("2025-08-15T10:00:00Z") });
  const out = synthesizeSuspects([winterEvalRow], {
    fallbackInstant: new Date("2026-01-15T10:00:00Z"), // London winter
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].offsetMinutes, 60); // authoring-time, not eval-time
});

test("synthesizeSuspects skips blocks whose authoring-time offset was zero", () => {
  // Authored in London winter (GMT == UTC). Operator was typing local
  // wall-clock directly, no compensation, so nothing to shift.
  const out = synthesizeSuspects([
    row({ blockCreatedAt: new Date("2025-12-15T10:00:00Z") }),
  ]);
  assert.equal(out.length, 0);
});

test("synthesizeSuspects skips UTC clients (the fix didn't change their behaviour)", () => {
  const out = synthesizeSuspects([row({ clientTimezone: "UTC" })]);
  assert.equal(out.length, 0);
});

test("synthesizeSuspects skips clients with invalid/missing timezone", () => {
  const out = synthesizeSuspects([
    row({ clientTimezone: null }),
    row({ blockId: "blk-2", clientTimezone: "Mars/Olympus" }),
  ]);
  assert.equal(out.length, 0);
});

test("synthesizeSuspects skips blocks whose time_rules have no HH:MM (date-only or DOW-only)", () => {
  const out = synthesizeSuspects([
    row({ blockTimeRules: [{ daysOfWeek: [1, 2, 3] }] }),
    row({
      blockId: "blk-2",
      blockTimeRules: [{ startDate: "2025-08-01", endDate: "2025-08-31" }],
    }),
  ]);
  assert.equal(out.length, 0);
});

test("synthesizeSuspects tolerates malformed time_rules JSON (non-array)", () => {
  const out = synthesizeSuspects([
    row({ blockTimeRules: { not: "an array" } }),
    row({ blockId: "blk-2", blockTimeRules: null }),
  ]);
  assert.equal(out.length, 0);
});

test("synthesizeSuspects scopes to allowedClientIds when provided (account-manager case)", () => {
  // Two suspect blocks on different clients; account manager only sees
  // client-A. Ensures the admin endpoint never reveals blocks the
  // caller can't access in the rest of the app.
  const out = synthesizeSuspects(
    [
      row({ blockId: "blk-1", clientId: "client-A" }),
      row({ blockId: "blk-2", clientId: "client-B" }),
    ],
    { allowedClientIds: ["client-A"] },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].blockId, "blk-1");
});

test("synthesizeSuspects with allowedClientIds=[] returns nothing (caller has no access)", () => {
  const out = synthesizeSuspects([row({})], { allowedClientIds: [] });
  assert.equal(out.length, 0);
});

test("synthesizeSuspects with allowedClientIds=null applies no scoping (admin case)", () => {
  const out = synthesizeSuspects(
    [
      row({ blockId: "blk-1", clientId: "client-A" }),
      row({ blockId: "blk-2", clientId: "client-B" }),
    ],
    { allowedClientIds: null },
  );
  assert.equal(out.length, 2);
});

test("synthesizeSuspects falls back to fallbackInstant when createdAt is missing", () => {
  // Defensive: createdAt has a DB default so this shouldn't happen in
  // prod, but if it does we use the fallback so we don't crash.
  const out = synthesizeSuspects(
    [row({ blockCreatedAt: null })],
    { fallbackInstant: new Date("2025-08-15T10:00:00Z") }, // BST
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].offsetMinutes, 60);
  assert.equal(out[0].createdAt, null);
});

test("synthesizeSuspects handles a New-York-summer block (-240 offset)", () => {
  const out = synthesizeSuspects([
    row({
      clientTimezone: "America/New_York",
      blockCreatedAt: new Date("2025-08-15T10:00:00Z"),
      blockTimeRules: [{ startTime: "18:00", endTime: "19:00" }],
    }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].offsetMinutes, -240);
  assert.equal(out[0].rules[0].suggestedStartTime, "14:00");
  assert.equal(out[0].rules[0].suggestedEndTime, "15:00");
});

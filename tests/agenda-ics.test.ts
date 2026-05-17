import test from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "../shared/agenda-ics";

// Task #210 — minimal ICS parser used by the agenda-sync engine.

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:keynote-001@example.com",
  "SUMMARY:Opening Keynote",
  "DESCRIPTION:Welcome and intro",
  "LOCATION:Main Hall",
  "CATEGORIES:Keynote,Main",
  "ORGANIZER:mailto:jane@example.com",
  "DTSTART:20260601T090000Z",
  "DTEND:20260601T100000Z",
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelled-1@example.com",
  "SUMMARY:Cancelled Session",
  "DTSTART:20260601T110000Z",
  "DTEND:20260601T120000Z",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("parseIcs extracts VEVENTs", () => {
  const r = parseIcs(SAMPLE);
  assert.equal(r.items.length, 2);
  assert.equal(r.errors.length, 0);
  const k = r.items[0];
  assert.equal(k.externalId, "keynote-001@example.com");
  assert.equal(k.item.title, "Opening Keynote");
  assert.equal(k.item.room, "Main Hall");
  assert.equal(k.item.track, "Keynote");
  assert.equal(k.item.presenter, "jane@example.com");
  assert.equal(k.item.status, "scheduled");
  assert.equal(k.item.startsAt.toISOString(), "2026-06-01T09:00:00.000Z");
});

test("parseIcs maps CANCELLED -> cancelled", () => {
  const r = parseIcs(SAMPLE);
  assert.equal(r.items[1].item.status, "cancelled");
});

test("parseIcs handles line folding", () => {
  const folded = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:fold-1",
    "SUMMARY:A really long",
    "  title continued",
    "DTSTART:20260601T090000Z",
    "DTEND:20260601T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = parseIcs(folded);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].item.title, "A really long title continued");
});

test("parseIcs unescapes \\n / \\, / \\;", () => {
  const ev = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:esc",
    "SUMMARY:Line1\\nLine2\\, with comma\\; and semi",
    "DTSTART:20260601T090000Z",
    "DTEND:20260601T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = parseIcs(ev);
  assert.equal(r.items[0].item.title, "Line1\nLine2, with comma; and semi");
});

test("parseIcs rejects VEVENT with endsAt <= startsAt", () => {
  const bad = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:bad",
    "SUMMARY:Bad event",
    "DTSTART:20260601T100000Z",
    "DTEND:20260601T090000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = parseIcs(bad);
  assert.equal(r.items.length, 0);
  assert.equal(r.errors.length, 1);
});

test("parseIcs defaults missing DTEND to +1h", () => {
  const noEnd = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:noend",
    "SUMMARY:No end",
    "DTSTART:20260601T090000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = parseIcs(noEnd);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].item.endsAt.toISOString(), "2026-06-01T10:00:00.000Z");
});

test("parseIcs synthesises externalId when UID missing", () => {
  const noUid = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "SUMMARY:Anon",
    "DTSTART:20260601T090000Z",
    "DTEND:20260601T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = parseIcs(noUid);
  assert.equal(r.items.length, 1);
  assert.ok(r.items[0].externalId.startsWith("Anon__"));
});

test("parseIcs returns error for empty document", () => {
  const r = parseIcs("");
  assert.equal(r.items.length, 0);
  assert.equal(r.errors.length, 1);
});

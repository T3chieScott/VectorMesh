import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAgendaCsv,
  serializeAgendaCsv,
  splitCsvLine,
  AGENDA_CSV_HEADER,
} from "../shared/agenda-csv";

// Task #208 — CSV import/export round-trip + parser quirks.

test("splitCsvLine handles plain fields", () => {
  assert.deepEqual(splitCsvLine("a,b,c"), ["a", "b", "c"]);
});

test("splitCsvLine handles quoted fields with commas", () => {
  assert.deepEqual(splitCsvLine(`"hello, world",x,y`), ["hello, world", "x", "y"]);
});

test("splitCsvLine handles escaped double quotes", () => {
  assert.deepEqual(splitCsvLine(`"she said ""hi""",ok`), [`she said "hi"`, "ok"]);
});

test("parseAgendaCsv parses valid header + rows", () => {
  const csv = [
    AGENDA_CSV_HEADER,
    `Keynote,Welcome,Main Hall,,Jane Doe,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z,scheduled,`,
    `Workshop,"AI, basics",Room B,Tech,Acme,2026-06-01T10:30:00Z,2026-06-01T12:00:00Z,delayed,starts at 10:45`,
  ].join("\n");
  const out = parseAgendaCsv(csv);
  assert.equal(out.length, 2);
  assert.equal(out[0].status, "ok");
  assert.equal(out[0].item?.title, "Keynote");
  assert.equal(out[0].item?.room, "Main Hall");
  assert.equal(out[0].item?.status, "scheduled");
  assert.equal(out[1].item?.title, "Workshop");
  assert.equal(out[1].item?.description, "AI, basics");
  assert.equal(out[1].item?.status, "delayed");
  assert.equal(out[1].item?.statusMessage, "starts at 10:45");
});

test("parseAgendaCsv works without a header line", () => {
  const csv = `Keynote,,Main Hall,,,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z,,`;
  const out = parseAgendaCsv(csv);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "ok");
  assert.equal(out[0].item?.status, "scheduled"); // default
});

test("parseAgendaCsv flags missing required fields", () => {
  const csv = [
    AGENDA_CSV_HEADER,
    `,,Main Hall,,,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z,scheduled,`,
  ].join("\n");
  const out = parseAgendaCsv(csv);
  assert.equal(out[0].status, "error");
});

test("parseAgendaCsv rejects rows with missing room", () => {
  const csv = [
    AGENDA_CSV_HEADER,
    `Orphan Session,,,Tech,,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z,scheduled,`,
  ].join("\n");
  const out = parseAgendaCsv(csv);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "error");
  assert.match(out[0].error ?? "", /room/i);
});

test("parseAgendaCsv flags invalid timestamps", () => {
  const csv = [
    AGENDA_CSV_HEADER,
    `Talk,,Main Hall,,,not-a-date,also-not-a-date,scheduled,`,
  ].join("\n");
  const out = parseAgendaCsv(csv);
  assert.equal(out[0].status, "error");
  assert.match(out[0].error || "", /ISO 8601/);
});

test("parseAgendaCsv flags endsAt <= startsAt", () => {
  const csv = [
    AGENDA_CSV_HEADER,
    `Talk,,Main Hall,,,2026-06-01T10:00:00Z,2026-06-01T10:00:00Z,scheduled,`,
  ].join("\n");
  const out = parseAgendaCsv(csv);
  assert.equal(out[0].status, "error");
  assert.match(out[0].error || "", /endsAt/);
});

test("parseAgendaCsv falls back to scheduled for unknown status", () => {
  const csv = [
    AGENDA_CSV_HEADER,
    `Talk,,Main Hall,,,2026-06-01T10:00:00Z,2026-06-01T11:00:00Z,bogus,`,
  ].join("\n");
  const out = parseAgendaCsv(csv);
  assert.equal(out[0].status, "ok");
  assert.equal(out[0].item?.status, "scheduled");
});

test("serializeAgendaCsv produces a header + escaped rows", () => {
  const csv = serializeAgendaCsv([
    {
      title: "Keynote, with comma",
      description: "say \"hi\"",
      room: null,
      track: null,
      presenter: null,
      startsAt: new Date("2026-06-01T09:00:00Z"),
      endsAt: new Date("2026-06-01T10:00:00Z"),
      status: "scheduled",
      statusMessage: null,
    },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines[0], AGENDA_CSV_HEADER);
  assert.match(lines[1], /^"Keynote, with comma","say ""hi""",,,,/);
});

test("round-trip: serialize then parse yields the same data", () => {
  const original = [
    {
      title: "Talk 1",
      description: "Intro",
      room: "Main Hall",
      track: "Keynote",
      presenter: "Jane",
      startsAt: new Date("2026-06-01T09:00:00Z"),
      endsAt: new Date("2026-06-01T10:00:00Z"),
      status: "scheduled" as const,
      statusMessage: null,
    },
  ];
  const csv = serializeAgendaCsv(original);
  const parsed = parseAgendaCsv(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].status, "ok");
  assert.equal(parsed[0].item?.title, "Talk 1");
  assert.equal(parsed[0].item?.room, "Main Hall");
  assert.equal(parsed[0].item?.presenter, "Jane");
  assert.equal(parsed[0].item?.startsAt.toISOString(), "2026-06-01T09:00:00.000Z");
});

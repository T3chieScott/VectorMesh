import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsvToGrid,
  buildHeaderLabels,
  extractGrid,
  suggestColumnMapping,
  normalizeStatus,
  parseAgendaDate,
  applyMapping,
  buildExternalId,
  missingRequiredMappings,
  cellToString,
  type Grid,
} from "../shared/spreadsheet-mapping";

// Task #267 — the generic spreadsheet → agenda mapping layer. Pure
// functions, so the same code drives preview, live sync, and these tests.

const TZ = "Europe/London";

// ============ CSV → grid ============

test("parseCsvToGrid splits rows and drops blank lines", () => {
  const grid = parseCsvToGrid("a,b,c\n\n1,2,3\n4,5,6\n");
  assert.deepEqual(grid, [
    ["a", "b", "c"],
    ["1", "2", "3"],
    ["4", "5", "6"],
  ]);
});

test("parseCsvToGrid honours quoted commas", () => {
  const grid = parseCsvToGrid('title,room\n"Hello, world",Hall A\n');
  assert.deepEqual(grid, [
    ["title", "room"],
    ["Hello, world", "Hall A"],
  ]);
});

// ============ Header labels ============

test("buildHeaderLabels fills blanks and disambiguates duplicates", () => {
  const labels = buildHeaderLabels(["Title", "", "Room", "Room"]);
  assert.deepEqual(labels, ["Title", "Column 2", "Room", "Room (2)"]);
});

test("extractGrid honours headerRowIndex and firstDataRowIndex", () => {
  const grid: Grid = [
    ["meta", "ignore"],
    ["Title", "Start"],
    ["Session A", "2026-06-02 09:00"],
  ];
  const { headers, dataRows } = extractGrid(grid, 1);
  assert.deepEqual(headers, ["Title", "Start"]);
  assert.equal(dataRows.length, 1);
  assert.equal(dataRows[0][0], "Session A");
});

// ============ Auto-suggest mapping ============

test("suggestColumnMapping maps common headers fuzzily", () => {
  const m = suggestColumnMapping([
    "Session Title",
    "Speaker",
    "Room",
    "Start Time",
    "End Time",
    "Status",
  ]);
  assert.equal(m.title, "Session Title");
  assert.equal(m.presenter, "Speaker");
  assert.equal(m.room, "Room");
  assert.equal(m.startsAt, "Start Time");
  assert.equal(m.endsAt, "End Time");
  assert.equal(m.status, "Status");
});

test("suggestColumnMapping does not reuse the same header twice", () => {
  const m = suggestColumnMapping(["Start Time", "End Time", "Name"]);
  const used = Object.values(m);
  assert.equal(new Set(used).size, used.length);
});

// ============ Status normalization ============

test("normalizeStatus maps aliases and defaults to scheduled", () => {
  assert.equal(normalizeStatus("Confirmed"), "scheduled");
  assert.equal(normalizeStatus("LIVE"), "in_progress");
  assert.equal(normalizeStatus("running late"), "delayed");
  assert.equal(normalizeStatus("Canceled"), "cancelled");
  assert.equal(normalizeStatus("room change"), "moved");
  assert.equal(normalizeStatus(""), "scheduled");
  assert.equal(normalizeStatus(null), "scheduled");
  assert.equal(normalizeStatus("something unknown"), "scheduled");
});

test("normalizeStatus accepts canonical enum values", () => {
  assert.equal(normalizeStatus("in_progress"), "in_progress");
  assert.equal(normalizeStatus("in progress"), "in_progress");
});

// ============ Date parsing ============

test("parseAgendaDate handles ISO local in the configured tz", () => {
  // 2026-06-02 is BST (UTC+1), so 09:00 local = 08:00 UTC.
  const d = parseAgendaDate("2026-06-02 09:00", { timezone: TZ });
  assert.ok(d);
  assert.equal(d!.toISOString(), "2026-06-02T08:00:00.000Z");
});

test("parseAgendaDate respects an explicit ISO offset", () => {
  const d = parseAgendaDate("2026-06-02T09:00:00+02:00", { timezone: TZ });
  assert.ok(d);
  assert.equal(d!.toISOString(), "2026-06-02T07:00:00.000Z");
});

test("parseAgendaDate defaults to UK day/month order", () => {
  // 03/06/2026 = 3 June (BST → 08:00 UTC for 09:00 local).
  const d = parseAgendaDate("03/06/2026 09:00", { timezone: TZ });
  assert.ok(d);
  assert.equal(d!.toISOString(), "2026-06-03T08:00:00.000Z");
});

test("parseAgendaDate honours the US hint", () => {
  // 03/06/2026 with us hint = March 6 (GMT in March before DST? DST 2026
  // starts 29 Mar, so 6 Mar is GMT → 09:00 local = 09:00 UTC).
  const d = parseAgendaDate("03/06/2026 09:00", { timezone: TZ, dateFormatHint: "us" });
  assert.ok(d);
  assert.equal(d!.toISOString(), "2026-03-06T09:00:00.000Z");
});

test("parseAgendaDate auto-detects day/month when one part > 12", () => {
  const d = parseAgendaDate("13/06/2026 10:00", { timezone: TZ });
  assert.ok(d);
  // 13 must be the day → 13 June.
  assert.equal(d!.toISOString(), "2026-06-13T09:00:00.000Z");
});

test("parseAgendaDate reads Excel serial numbers", () => {
  // Serial 45809 = 2025-05-15 (date-only, midnight wall clock).
  const d = parseAgendaDate(45809, { timezone: TZ });
  assert.ok(d);
  assert.equal(d!.getUTCFullYear(), 2025);
  assert.equal(d!.getUTCMonth(), 4); // May
});

test("parseAgendaDate accepts a JS Date cell as wall-clock in tz", () => {
  const cell = new Date(Date.UTC(2026, 5, 2, 9, 0, 0));
  const d = parseAgendaDate(cell, { timezone: TZ });
  assert.ok(d);
  // Wall clock 09:00 in BST → 08:00 UTC.
  assert.equal(d!.toISOString(), "2026-06-02T08:00:00.000Z");
});

test("parseAgendaDate returns null for junk", () => {
  assert.equal(parseAgendaDate("not a date", { timezone: TZ }), null);
  assert.equal(parseAgendaDate("", { timezone: TZ }), null);
  assert.equal(parseAgendaDate(null, { timezone: TZ }), null);
});

// ============ External id ============

test("buildExternalId prefers the mapped column value", () => {
  const id = buildExternalId("EVT-123", 4, {
    title: "x",
    startsAt: new Date(),
    room: null,
  });
  assert.equal(id, "EVT-123");
});

test("buildExternalId falls back to row number", () => {
  const id = buildExternalId("", 7, { title: "x", startsAt: new Date(), room: null });
  assert.equal(id, "row-7");
});

// ============ applyMapping ============

const HEADERS = ["Title", "Start", "End", "Room", "Status"];
const MAPPING = {
  title: "Title",
  startsAt: "Start",
  endsAt: "End",
  room: "Room",
  status: "Status",
} as const;

test("applyMapping produces ok rows for valid data", () => {
  const rows: Grid = [
    ["Keynote", "2026-06-02 09:00", "2026-06-02 10:00", "Hall A", "confirmed"],
  ];
  const out = applyMapping(rows, { headers: HEADERS, mapping: { ...MAPPING }, timezone: TZ });
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "ok");
  assert.equal(out[0].item!.title, "Keynote");
  assert.equal(out[0].item!.room, "Hall A");
  assert.equal(out[0].item!.status, "scheduled");
  assert.equal(out[0].externalId, "row-0");
});

test("applyMapping skips fully-empty rows", () => {
  const rows: Grid = [["", "", "", "", ""]];
  const out = applyMapping(rows, { headers: HEADERS, mapping: { ...MAPPING }, timezone: TZ });
  assert.equal(out[0].status, "skipped");
});

test("applyMapping errors when a required field is missing", () => {
  const rows: Grid = [["", "2026-06-02 09:00", "2026-06-02 10:00", "Hall A", ""]];
  const out = applyMapping(rows, { headers: HEADERS, mapping: { ...MAPPING }, timezone: TZ });
  assert.equal(out[0].status, "error");
});

test("applyMapping errors when end is not after start", () => {
  const rows: Grid = [["Talk", "2026-06-02 10:00", "2026-06-02 09:00", "Hall A", ""]];
  const out = applyMapping(rows, { headers: HEADERS, mapping: { ...MAPPING }, timezone: TZ });
  assert.equal(out[0].status, "error");
});

test("applyMapping errors on unparseable dates", () => {
  const rows: Grid = [["Talk", "nope", "also nope", "Hall A", ""]];
  const out = applyMapping(rows, { headers: HEADERS, mapping: { ...MAPPING }, timezone: TZ });
  assert.equal(out[0].status, "error");
});

test("applyMapping uses the external-id column when provided", () => {
  const headers = [...HEADERS, "Id"];
  const rows: Grid = [
    ["Keynote", "2026-06-02 09:00", "2026-06-02 10:00", "Hall A", "ok", "ABC"],
  ];
  const out = applyMapping(rows, {
    headers,
    mapping: { ...MAPPING },
    externalIdColumn: "Id",
    timezone: TZ,
  });
  assert.equal(out[0].externalId, "ABC");
});

// ============ missingRequiredMappings ============

test("missingRequiredMappings lists unmapped required fields", () => {
  assert.deepEqual(missingRequiredMappings({ title: "T" }), ["startsAt", "endsAt"]);
  assert.deepEqual(
    missingRequiredMappings({ title: "T", startsAt: "S", endsAt: "E" }),
    [],
  );
});

// ============ cellToString ============

test("cellToString stringifies cell variants", () => {
  assert.equal(cellToString(null), "");
  assert.equal(cellToString(42), "42");
  assert.equal(cellToString(true), "true");
  assert.equal(cellToString("hi"), "hi");
  assert.equal(cellToString(new Date("2026-06-02T00:00:00Z")), "2026-06-02T00:00:00.000Z");
});

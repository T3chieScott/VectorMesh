import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgendaCsvSample, parseAgendaCsv, AGENDA_CSV_HEADER } from "../shared/agenda-csv";

test("buildAgendaCsvSample emits the canonical header line", () => {
  const csv = buildAgendaCsvSample(new Date("2026-06-01T00:00:00Z"));
  const firstLine = csv.split("\n")[0];
  assert.equal(firstLine, AGENDA_CSV_HEADER);
});

test("buildAgendaCsvSample round-trips cleanly through parseAgendaCsv", () => {
  const csv = buildAgendaCsvSample(new Date("2026-06-01T00:00:00Z"));
  const results = parseAgendaCsv(csv);
  assert.equal(results.length, 4, "sample should contain 4 rows");
  for (const r of results) {
    assert.equal(r.status, "ok", `row ${r.index} should parse cleanly, got: ${r.error ?? "ok"}`);
    assert.ok(r.item, "row should produce an item");
    assert.ok(r.item!.title.length > 0, "title must be non-empty");
    assert.ok(r.item!.room && r.item!.room.length > 0, "room must be non-empty");
    assert.ok(r.item!.endsAt.getTime() > r.item!.startsAt.getTime(), "endsAt > startsAt");
  }
});

test("buildAgendaCsvSample preserves comma-in-title via quoting", () => {
  const csv = buildAgendaCsvSample(new Date("2026-06-01T00:00:00Z"));
  const results = parseAgendaCsv(csv);
  const commaRow = results.find((r) => r.item?.title.includes(","));
  assert.ok(commaRow, "sample should include a row with a comma in the title");
  assert.equal(commaRow!.item!.title, "Coffee, Tea & Networking");
});

test("buildAgendaCsvSample dates are two days into the future relative to now", () => {
  const now = new Date("2026-06-01T12:34:56Z");
  const csv = buildAgendaCsvSample(now);
  const results = parseAgendaCsv(csv);
  const first = results[0].item!;
  // Base day is now + 2 days at 09:00 UTC, so first row starts 2026-06-03T09:00:00Z.
  assert.equal(first.startsAt.toISOString(), "2026-06-03T09:00:00.000Z");
});

test("buildAgendaCsvSample includes a non-default status with a message", () => {
  const csv = buildAgendaCsvSample(new Date("2026-06-01T00:00:00Z"));
  const results = parseAgendaCsv(csv);
  const delayed = results.find((r) => r.item?.status === "delayed");
  assert.ok(delayed, "sample should include a delayed row");
  assert.ok(
    delayed!.item!.statusMessage && delayed!.item!.statusMessage.length > 0,
    "delayed row should carry a status message",
  );
});

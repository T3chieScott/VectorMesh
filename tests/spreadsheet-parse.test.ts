import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbookBuffer } from "../server/spreadsheetParse";
import { extractGrid, applyMapping } from "../shared/spreadsheet-mapping";

// Task #267 — server XLSX reader. Build a workbook in memory, round-trip
// it through the reader, and confirm it converges on the same grid the
// shared mapping layer consumes.

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  ws.addRow(["Title", "Start", "End", "Room", "Status"]);
  ws.addRow(["Keynote", new Date(Date.UTC(2026, 5, 2, 9, 0)), new Date(Date.UTC(2026, 5, 2, 10, 0)), "Hall A", "confirmed"]);
  ws.addRow(["Workshop", new Date(Date.UTC(2026, 5, 2, 11, 0)), new Date(Date.UTC(2026, 5, 2, 12, 0)), "Room 2", "live"]);
  wb.addWorksheet("Notes");
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

test("parseWorkbookBuffer exposes all sheet names", async () => {
  const buf = await buildWorkbook();
  const parsed = await parseWorkbookBuffer(buf);
  assert.deepEqual(parsed.sheetNames, ["Agenda", "Notes"]);
});

test("parseWorkbookBuffer grid feeds applyMapping end-to-end", async () => {
  const buf = await buildWorkbook();
  const parsed = await parseWorkbookBuffer(buf);
  const grid = parsed.getGrid("Agenda");
  const { headers, dataRows } = extractGrid(grid, 0);
  assert.deepEqual(headers, ["Title", "Start", "End", "Room", "Status"]);

  const out = applyMapping(dataRows, {
    headers,
    mapping: {
      title: "Title",
      startsAt: "Start",
      endsAt: "End",
      room: "Room",
      status: "Status",
    },
    timezone: "Europe/London",
  });
  const ok = out.filter((r) => r.status === "ok");
  assert.equal(ok.length, 2);
  assert.equal(ok[0].item!.title, "Keynote");
  assert.equal(ok[0].item!.status, "scheduled");
  assert.equal(ok[1].item!.status, "in_progress");
});

test("parseWorkbookBuffer defaults to the first sheet", async () => {
  const buf = await buildWorkbook();
  const parsed = await parseWorkbookBuffer(buf);
  const grid = parsed.getGrid();
  assert.equal(grid[0][0], "Title");
});

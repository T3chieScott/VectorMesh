import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbookBuffer, SpreadsheetTooLargeError } from "../server/spreadsheetParse";
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

// Regression: some .xlsx files carry styling/phantom cells across a hugely
// inflated used-range, so exceljs `columnCount` over-reports (out to XFD).
// getGrid must bound to the ACTUAL populated width, not the phantom one, or
// it allocates billions of cells and OOMs the process.
test("parseWorkbookBuffer bounds grid width to populated columns despite a phantom used-range", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Wide");
  ws.addRow(["Title", "Start", "End"]);
  ws.addRow(["Keynote", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]);
  // Apply a style to a far-out column to inflate the declared dimension the
  // way real-world files do, without adding real data there.
  ws.getColumn(8000).width = 12;
  ws.getCell(1, 8000).style = { font: { bold: true } };
  const ab = await wb.xlsx.writeBuffer();
  const parsed = await parseWorkbookBuffer(Buffer.from(ab as ArrayBuffer));

  const grid = parsed.getGrid("Wide");
  // exceljs counts a styled-but-empty cell toward the row's last-cell
  // index, so the phantom column at 8000 would otherwise widen every row
  // to 8000. The COL_CAP hard-bounds it to 1024 (well under 8000), while
  // the real header data stays intact at the front of the row.
  assert.ok(
    grid[0].length <= 1024,
    `expected width bounded by COL_CAP, got ${grid[0].length}`,
  );
  const { headers } = extractGrid(grid, 0);
  assert.equal(headers[0], "Title");
  assert.equal(headers[1], "Start");
  assert.equal(headers[2], "End");
});

test("parseWorkbookBuffer aborts (does not OOM) when a file blows past the total-cell budget", async () => {
  // Simulate a pathological file: thousands of full-width rows. Each row has
  // a value at column 1024, so its last-cell index (cellCount) is 1024 and it
  // contributes COL_CAP cells to the running budget. ~2100 * 1024 > the 2M
  // CELL_BUDGET, so the reader must early-abort instead of accumulating the
  // grid into the heap.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Huge");
  for (let r = 1; r <= 2100; r++) {
    ws.getCell(r, 1024).value = "x";
  }
  const ab = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(ab as ArrayBuffer);

  await assert.rejects(
    () => parseWorkbookBuffer(buf),
    (err: unknown) => err instanceof SpreadsheetTooLargeError,
  );
});

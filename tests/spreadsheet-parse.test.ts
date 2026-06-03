import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  parseWorkbookBuffer,
  SpreadsheetTooLargeError,
  readSheetNames,
  readSheetSample,
} from "../server/spreadsheetParse";
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

// ===== Fast readers (Task #267 optimisation) =====

test("readSheetNames lists all sheet names", async () => {
  const buf = await buildWorkbook();
  const names = await readSheetNames(buf);
  assert.deepEqual(names, ["Agenda", "Notes"]);
});

test("readSheetSample matches parseWorkbookBuffer headers + applyMapping output", async () => {
  const buf = await buildWorkbook();

  const full = await parseWorkbookBuffer(buf);
  const fullGrid = full.getGrid("Agenda");
  const fullExtract = extractGrid(fullGrid, 0);

  const sample = await readSheetSample(buf, { sheetName: "Agenda", maxRows: 50 });
  assert.deepEqual(sample.sheetNames, ["Agenda", "Notes"]);
  const sampleExtract = extractGrid(sample.grid, 0);

  // Same headers from both paths.
  assert.deepEqual(sampleExtract.headers, fullExtract.headers);

  const mapping = {
    title: "Title",
    startsAt: "Start",
    endsAt: "End",
    room: "Room",
    status: "Status",
  };
  const fullMapped = applyMapping(fullExtract.dataRows, {
    headers: fullExtract.headers,
    mapping,
    timezone: "Europe/London",
  });
  const sampleMapped = applyMapping(sampleExtract.dataRows, {
    headers: sampleExtract.headers,
    mapping,
    timezone: "Europe/London",
  });

  const norm = (rows: typeof fullMapped) =>
    rows.map((r) => ({
      status: r.status,
      title: r.item?.title,
      startsAt: r.item?.startsAt?.toISOString(),
      endsAt: r.item?.endsAt?.toISOString(),
      st: r.item?.status,
    }));
  assert.deepEqual(norm(sampleMapped), norm(fullMapped));
});

test("readSheetSample honours maxRows and reports truncation", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Big");
  ws.addRow(["Title", "Start"]);
  for (let i = 0; i < 100; i++) {
    ws.addRow([`Item ${i}`, "2026-06-02T09:00:00Z"]);
  }
  const ab = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(ab as ArrayBuffer);

  const sample = await readSheetSample(buf, { sheetName: "Big", maxRows: 10 });
  assert.equal(sample.grid.length, 10);
  assert.equal(sample.truncated, true);
  assert.equal(sample.grid[0][0], "Title");
  assert.equal(sample.grid[1][0], "Item 0");

  // Reading past the end is not truncated.
  const whole = await readSheetSample(buf, { sheetName: "Big", maxRows: 1000 });
  assert.equal(whole.grid.length, 101);
  assert.equal(whole.truncated, false);
});

test("readSheetSample matches parseWorkbookBuffer row width for a styled trailing blank column", async () => {
  // A styled-but-empty cell counts toward exceljs row.cellCount, so
  // parseWorkbookBuffer pads that row with trailing nulls out to it. The
  // fast reader must do the same or preview/sync row shapes diverge.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Styled");
  ws.addRow(["Title", "Start"]);
  ws.addRow(["Keynote", "2026-06-02T09:00:00Z"]);
  // Style a blank cell two columns past the data on the header row.
  ws.getCell(1, 5).style = { font: { bold: true } };
  const ab = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(ab as ArrayBuffer);

  const full = await parseWorkbookBuffer(buf);
  const fullGrid = full.getGrid("Styled");
  const sample = await readSheetSample(buf, { sheetName: "Styled", maxRows: 50 });

  assert.deepEqual(
    sample.grid.map((r) => r.length),
    fullGrid.map((r) => r.length),
    "per-row widths must match between the fast reader and parseWorkbookBuffer",
  );
  assert.deepEqual(sample.grid, fullGrid);
});

test("readSheetSample reports truncated=false when the sheet has exactly maxRows rows", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Exact");
  ws.addRow(["Title", "Start"]);
  for (let i = 0; i < 9; i++) ws.addRow([`Item ${i}`, "2026-06-02T09:00:00Z"]);
  const ab = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(ab as ArrayBuffer);

  // 10 total rows, maxRows = 10 → not truncated.
  const exact = await readSheetSample(buf, { sheetName: "Exact", maxRows: 10 });
  assert.equal(exact.grid.length, 10);
  assert.equal(exact.truncated, false);

  // maxRows = 9 → there IS a row beyond the window → truncated.
  const over = await readSheetSample(buf, { sheetName: "Exact", maxRows: 9 });
  assert.equal(over.grid.length, 9);
  assert.equal(over.truncated, true);
});

test("readSheetSample picks the requested sheet, defaulting to the first", async () => {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("First");
  a.addRow(["A1", "A2"]);
  const b = wb.addWorksheet("Second");
  b.addRow(["B1", "B2"]);
  const ab = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(ab as ArrayBuffer);

  const second = await readSheetSample(buf, { sheetName: "Second", maxRows: 10 });
  assert.equal(second.grid[0][0], "B1");

  const def = await readSheetSample(buf, { maxRows: 10 });
  assert.equal(def.grid[0][0], "A1");
});

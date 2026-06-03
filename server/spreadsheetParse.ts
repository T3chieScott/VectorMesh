// Task #267 — server-side XLSX reader. Turns a workbook buffer into the
// same `Cell[][]` grid the shared mapping layer consumes, so XLSX and
// CSV converge on one code path after this point.
//
// We use exceljs (maintained, npm-native) rather than SheetJS. exceljs
// returns date cells as JS Dates whose UTC components equal the stored
// wall-clock value, and numeric cells as numbers — both of which
// shared/spreadsheet-mapping.ts already understands.
//
// IMPORTANT — memory: we read with the STREAMING reader
// (`ExcelJS.stream.xlsx.WorkbookReader`), not `Workbook.xlsx.load()`.
// Real-world files can carry a "Confirmed speakers"-style sheet whose
// XML is ~180MB because every one of its ~650 rows is padded with junk
// cells out to column ~12,500 (8M+ cells total). The non-streaming
// loader materialises a JS object for every one of those cells at load
// time — multiple GB of *live* heap — and OOM-kills the process before
// any cap downstream can help. The streaming reader parses one row at a
// time (peak ~one row of cells), so we only ever retain the BOUNDED grid
// we build. Measured: the same file streams in <250MB RSS vs OOM at 4GB.

import ExcelJS from "exceljs";
import { Readable } from "stream";
import type { Cell, Grid } from "@shared/spreadsheet-mapping";

// Bounds applied while materialising a sheet into a grid. They protect
// against pathological used-ranges (styling/junk across the full XFD x
// 1,048,576 address space). Real agendas sit far inside these.
const COL_CAP = 1024;
const ROW_CAP = 200_000;

// Aggregate ceiling across ALL sheets we cache. Per-axis caps alone still
// allow a worst-case ROW_CAP * COL_CAP (~204M) grid to accumulate in heap,
// so we early-abort with a clear error once total materialised cells cross
// this budget. Real agendas are orders of magnitude under it (a few
// hundred rows x a handful of columns).
const CELL_BUDGET = 2_000_000;

export class SpreadsheetTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetTooLargeError";
  }
}

export interface ParsedWorkbook {
  sheetNames: string[];
  /** Read the grid for a given sheet (defaults to the first sheet). */
  getGrid(sheetName?: string | null): Grid;
}

// exceljs cell values can be rich objects (formulas, hyperlinks, rich
// text, errors). Flatten them to the primitive the mapping layer wants.
function flattenCellValue(value: unknown): Cell {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value as Cell;
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    // Formula cell: prefer the computed result.
    if ("result" in obj) return flattenCellValue(obj.result);
    if ("text" in obj) return String(obj.text);
    if ("hyperlink" in obj && "text" in obj) return String(obj.text);
    // Rich text: concatenate runs.
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if ("error" in obj) return null;
  }
  return String(value);
}

function toBuffer(buffer: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (buffer instanceof Buffer) return buffer;
  if (buffer instanceof Uint8Array) return Buffer.from(buffer);
  return Buffer.from(new Uint8Array(buffer));
}

// Trim trailing fully-empty rows so header/data indices line up with what
// the operator sees in the preview.
function trimTrailingEmptyRows(grid: Grid): void {
  while (grid.length > 0 && grid[grid.length - 1].every((c) => c == null || c === "")) {
    grid.pop();
  }
}

export async function parseWorkbookBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParsedWorkbook> {
  const buf = toBuffer(buffer);

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buf), {
    worksheets: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    entries: "ignore",
  });

  const sheetNames: string[] = [];
  const grids = new Map<string, Grid>();
  let totalCells = 0;

  // Single pass over the file: build a BOUNDED grid for every sheet. The
  // bounded grids are small (≤ ROW_CAP x COL_CAP, and in practice tiny),
  // so caching them all is far cheaper than re-streaming per getGrid call.
  for await (const ws of reader as AsyncIterable<any>) {
    const name: string = ws.name ?? `Sheet${ws.id}`;
    sheetNames.push(name);
    const grid: Grid = [];
    for await (const row of ws as AsyncIterable<any>) {
      if ((row.number ?? 0) > ROW_CAP) continue;
      // exceljs `row.cellCount` is the index of the last cell that has a
      // value (1-based), so iterating 1..cellCount reads every populated
      // cell while skipping a phantom tail. Cap it so a junk row can't
      // blow up the width.
      const lastCol = Math.min(row.cellCount || 0, COL_CAP);
      totalCells += lastCol;
      if (totalCells > CELL_BUDGET) {
        throw new SpreadsheetTooLargeError(
          "This spreadsheet is too large to process. Please remove unused columns/rows or split it into a smaller file.",
        );
      }
      const cells: Cell[] = [];
      for (let c = 1; c <= lastCol; c++) {
        cells.push(flattenCellValue(row.getCell(c).value));
      }
      grid.push(cells);
    }
    trimTrailingEmptyRows(grid);
    grids.set(name, grid);
  }

  return {
    sheetNames,
    getGrid(sheetName?: string | null): Grid {
      if (sheetName && grids.has(sheetName)) return grids.get(sheetName)!;
      const first = sheetNames[0];
      return (first ? grids.get(first) : undefined) ?? [];
    },
  };
}

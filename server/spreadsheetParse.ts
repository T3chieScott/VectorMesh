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
import JSZip from "jszip";
import { SaxesParser } from "saxes";
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

// ============ Fast "header-only" / sample reader (Task #267 optimisation) ============
//
// The full streaming read above must scan the ENTIRE file (every sheet,
// every row) to materialise complete grids — for a pathological
// "Confirmed speakers"-style file that is ~12s just to reach EOF, even
// though upload only needs the SHEET NAMES and Test/Preview only need the
// header row plus a handful of sample rows.
//
// These helpers read only what those steps need by going straight to the
// zip with jszip and a SAX parser:
//   - readSheetNames: parse just `xl/workbook.xml` (a few KB) → instant.
//   - readSheetSample: parse `xl/sharedStrings.xml` (small) once, then
//     stream only the target sheet's XML and ABORT after `maxRows` rows,
//     so jszip never inflates the rest of a huge sheet.
// Both produce the SAME `Cell[][]` shape (row-major, 0-based columns,
// COL_CAP-bounded, ragged rows, styles ignored so dates arrive as serial
// numbers) as parseWorkbookBuffer, so a mapping picked from a preview
// lines up exactly with what the full sync read produces.
//
// The FULL sync path keeps using parseWorkbookBuffer — these fast readers
// only feed the upload/Test/Preview UI surfaces.

interface SheetEntry {
  name: string;
  rId: string;
}

// Parse `xl/workbook.xml` for the ordered (name, r:id) sheet entries.
function parseWorkbookSheets(xml: string): SheetEntry[] {
  const sheets: SheetEntry[] = [];
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    if (node.name !== "sheet") return;
    const name = (node.attributes["name"] as string) ?? "";
    const rId =
      (node.attributes["r:id"] as string) ??
      (node.attributes["id"] as string) ??
      "";
    sheets.push({ name, rId });
  });
  parser.write(xml).close();
  return sheets;
}

// Parse `xl/_rels/workbook.xml.rels` for a relationship-id → target map.
function parseWorkbookRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    if (node.name !== "Relationship") return;
    const id = node.attributes["Id"] as string | undefined;
    const target = node.attributes["Target"] as string | undefined;
    if (id && target) map.set(id, target);
  });
  parser.write(xml).close();
  return map;
}

// A relationship target ("worksheets/sheet1.xml" or "/xl/worksheets/...")
// resolved to a zip entry path under `xl/`.
function resolveSheetPath(target: string | undefined): string | null {
  if (!target) return null;
  let t = target.replace(/^\//, "");
  if (!t.startsWith("xl/")) t = `xl/${t}`;
  return t;
}

// Parse `xl/sharedStrings.xml` into an index → string table. Rich-text
// runs (multiple <t> inside one <si>) are concatenated, matching how a
// cell's displayed value reads.
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const parser = new SaxesParser();
  let inSi = false;
  let inT = false;
  let cur = "";
  parser.on("opentag", (node) => {
    if (node.name === "si") {
      inSi = true;
      cur = "";
    } else if (node.name === "t" && inSi) {
      inT = true;
    }
  });
  parser.on("text", (t) => {
    if (inT) cur += t;
  });
  parser.on("closetag", (node) => {
    if (node.name === "t") inT = false;
    else if (node.name === "si") {
      out.push(cur);
      inSi = false;
    }
  });
  parser.write(xml).close();
  return out;
}

// Leading-letter cell ref ("B12") → 0-based column index. Returns -1 when
// the ref has no column letters.
function colIndexFromRef(ref: string): number {
  let i = 0;
  let col = 0;
  while (i < ref.length) {
    const ch = ref.charCodeAt(i);
    if (ch >= 65 && ch <= 90) col = col * 26 + (ch - 64);
    else if (ch >= 97 && ch <= 122) col = col * 26 + (ch - 96);
    else break;
    i++;
  }
  return col > 0 ? col - 1 : -1;
}

// Resolve a raw sheet cell (its `t` attribute + captured text) to the same
// primitive parseWorkbookBuffer's flattenCellValue would yield. Dates are
// left as serial numbers (styles are not read), exactly as the full reader
// returns them with styles:"ignore".
function resolveRawCell(type: string, text: string, shared: string[]): Cell {
  if (text === "") return null;
  switch (type) {
    case "s": {
      const i = Number(text);
      return Number.isInteger(i) && i >= 0 && i < shared.length
        ? shared[i] ?? null
        : null;
    }
    case "inlineStr":
    case "str":
      return text;
    case "b":
      return text !== "0";
    case "e":
      return null;
    case "d": {
      const d = new Date(text);
      return Number.isNaN(d.getTime()) ? text : d;
    }
    default: {
      const n = Number(text);
      return Number.isNaN(n) ? text : n;
    }
  }
}

// Stream a single sheet's XML, building grid rows in document order (NOT by
// the row's `r` attribute — exceljs compacts skipped rows the same way),
// and abort once `maxRows` rows are collected so jszip stops inflating.
function streamSheetGrid(
  zipFile: JSZip.JSZipObject,
  shared: string[],
  maxRows: number,
): Promise<{ grid: Grid; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const grid: Grid = [];
    const parser = new SaxesParser();
    const stream = zipFile.nodeStream();

    let curRow: Cell[] | null = null;
    let curRowMaxIdx = -1;
    let colCursor = 0;
    let cellRef = "";
    let cellType = "";
    let inV = false;
    let inT = false;
    let textBuf = "";
    let done = false;
    let settled = false;

    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      // `truncated` is true only if a row beyond the window actually
      // existed; the over-read row is dropped from the returned grid.
      else resolve({ grid: grid.slice(0, maxRows), truncated: grid.length > maxRows });
    };
    const stop = () => {
      try {
        (stream as { destroy?: () => void }).destroy?.();
      } catch {
        /* noop */
      }
      finish();
    };

    parser.on("opentag", (node) => {
      if (done) return;
      switch (node.name) {
        case "row":
          curRow = [];
          curRowMaxIdx = -1;
          colCursor = 0;
          break;
        case "c":
          cellRef = (node.attributes["r"] as string) ?? "";
          cellType = (node.attributes["t"] as string) ?? "";
          textBuf = "";
          inV = false;
          inT = false;
          break;
        case "v":
          inV = true;
          break;
        case "t":
          inT = true;
          break;
      }
    });
    parser.on("text", (t) => {
      if (done) return;
      if (inV || inT) textBuf += t;
    });
    parser.on("closetag", (node) => {
      if (done) return;
      switch (node.name) {
        case "v":
          inV = false;
          break;
        case "t":
          inT = false;
          break;
        case "c": {
          if (!curRow) break;
          const refIdx = cellRef ? colIndexFromRef(cellRef) : -1;
          const idx = refIdx >= 0 ? refIdx : colCursor;
          colCursor = idx + 1;
          if (idx >= 0 && idx < COL_CAP) {
            const val = resolveRawCell(cellType, textBuf, shared);
            // Any cell that physically appears in the row XML with a
            // reference — including a styled-but-empty `<c r=".." s=".."/>`
            // — counts toward the row's width, mirroring exceljs
            // `row.cellCount` which parseWorkbookBuffer uses. This keeps a
            // preview row's trailing-null width identical to the full read.
            if ((refIdx >= 0 || val !== null) && idx > curRowMaxIdx) {
              curRowMaxIdx = idx;
            }
            if (val !== null) {
              for (let k = curRow.length; k < idx; k++) curRow.push(null);
              curRow[idx] = val;
            }
          }
          break;
        }
        case "row": {
          if (curRow) {
            for (let k = curRow.length; k <= curRowMaxIdx; k++) curRow.push(null);
            grid.push(curRow);
          }
          curRow = null;
          // Read ONE row past the requested window so we can tell "exactly
          // maxRows rows" (not truncated) from "there is more below"
          // (truncated). The extra row is dropped before returning.
          if (grid.length > maxRows) {
            done = true;
            stop();
          }
          break;
        }
      }
    });

    stream.on("data", (chunk: Buffer) => {
      if (done || settled) return;
      try {
        parser.write(chunk.toString("utf8"));
      } catch (e) {
        finish(e);
        return;
      }
      if (done) stop();
    });
    stream.on("end", () => {
      if (done || settled) return;
      try {
        parser.close();
      } catch {
        /* noop */
      }
      finish();
    });
    stream.on("error", (e) => finish(e));
  });
}

// Fast: list a workbook's sheet names by reading only `xl/workbook.xml`.
// Used by the upload endpoint, which needs nothing else.
export async function readSheetNames(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(toBuffer(buffer));
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) throw new Error("Not a valid .xlsx workbook (missing workbook.xml).");
  const xml = await wbFile.async("string");
  return parseWorkbookSheets(xml).map((s) => s.name);
}

export interface SheetSample {
  sheetNames: string[];
  grid: Grid;
  /** True when reading stopped at `maxRows` (more rows exist below). */
  truncated: boolean;
}

// Fast: read all sheet names plus the first `maxRows` rows of one sheet
// (the named sheet, or the first). Streams only the target sheet and
// aborts early, so a huge file's unread rows are never inflated.
export async function readSheetSample(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  opts: { sheetName?: string | null; maxRows: number },
): Promise<SheetSample> {
  const zip = await JSZip.loadAsync(toBuffer(buffer));
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) throw new Error("Not a valid .xlsx workbook (missing workbook.xml).");

  const sheets = parseWorkbookSheets(await wbFile.async("string"));
  const sheetNames = sheets.map((s) => s.name);

  const target =
    (opts.sheetName ? sheets.find((s) => s.name === opts.sheetName) : undefined) ??
    sheets[0];
  if (!target) return { sheetNames, grid: [], truncated: false };

  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  const rels = relsFile ? parseWorkbookRels(await relsFile.async("string")) : new Map();
  const sheetPath = resolveSheetPath(rels.get(target.rId));
  const sheetFile = sheetPath ? zip.file(sheetPath) : null;
  if (!sheetFile) return { sheetNames, grid: [], truncated: false };

  const ssFile = zip.file("xl/sharedStrings.xml");
  const shared = ssFile ? parseSharedStrings(await ssFile.async("string")) : [];

  const { grid, truncated } = await streamSheetGrid(
    sheetFile,
    shared,
    Math.max(1, opts.maxRows),
  );
  trimTrailingEmptyRows(grid);
  return { sheetNames, grid, truncated };
}

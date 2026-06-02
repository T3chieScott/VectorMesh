// Task #267 — server-side XLSX reader. Turns a workbook buffer into the
// same `Cell[][]` grid the shared mapping layer consumes, so XLSX and
// CSV converge on one code path after this point.
//
// We use exceljs (maintained, npm-native) rather than SheetJS. exceljs
// returns date cells as JS Dates whose UTC components equal the stored
// wall-clock value, and numeric cells as numbers — both of which
// shared/spreadsheet-mapping.ts already understands.

import ExcelJS from "exceljs";
import type { Cell, Grid } from "@shared/spreadsheet-mapping";

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

export async function parseWorkbookBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  const ab =
    buffer instanceof Buffer
      ? buffer
      : buffer instanceof Uint8Array
        ? Buffer.from(buffer)
        : Buffer.from(new Uint8Array(buffer));
  await wb.xlsx.load(ab as any);

  const sheetNames = wb.worksheets.map((ws) => ws.name);

  return {
    sheetNames,
    getGrid(sheetName?: string | null): Grid {
      const ws =
        (sheetName ? wb.getWorksheet(sheetName) : undefined) ?? wb.worksheets[0];
      if (!ws) return [];
      const grid: Grid = [];
      // rowCount/columnCount can over-report; we trust eachRow + the
      // row's own cell span. exceljs is 1-indexed for both rows and
      // columns, and `values` is a 1-based sparse array.
      const maxCol = ws.columnCount || 0;
      ws.eachRow({ includeEmpty: true }, (excelRow) => {
        const cells: Cell[] = [];
        for (let c = 1; c <= maxCol; c++) {
          cells.push(flattenCellValue(excelRow.getCell(c).value));
        }
        grid.push(cells);
      });
      // Trim trailing fully-empty rows so header/data indices line up
      // with what the operator sees.
      while (grid.length > 0 && grid[grid.length - 1].every((c) => c == null || c === "")) {
        grid.pop();
      }
      return grid;
    },
  };
}

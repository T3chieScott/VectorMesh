---
name: Dev server OOM — XLSX full-model load
description: Why "Start application" crashed with "JavaScript heap out of memory" parsing a real agenda XLSX, and why the fix is the exceljs streaming reader (not a bigger heap or downstream caps).
---

# Dev server OOM — root cause was exceljs full-model load, not a generic leak

The dev workflow crashed with `FATAL ERROR: ... JavaScript heap out of memory`
shortly after uploading/previewing a real agenda spreadsheet. It looked like a
generic heap ceiling but the trigger was the XLSX parse path.

## Real root cause
A single real-world `.xlsx` can be tiny on disk yet explode in memory. Example:
a 22MB file whose first sheet has only ~650 real rows but is padded with junk
cells out to column ~12,500 — ~8 million cells total, ~180MB of sheet XML.

`exceljs`'s document loader (`Workbook.xlsx.load(...)`) materialises a JS object
for *every* cell at load time, so it built multiple GB of **live** heap before
any downstream code ran. Tell-tale signs:
- the failing GC is `Mark-Compact (reduce)` that frees almost nothing → the
  memory is reachable/live, not garbage;
- the heap pins at the limit during a parse, not gradually over time;
- bounding the *grid* you build afterwards does nothing, because the blow-up is
  inside `load()` itself, before your code sees a single cell.

**Why downstream caps are not enough:** any approach that lets `load()` build the
full model first (then trims columns/rows) has already paid the multi-GB cost.
exceljs `columnCount`/`rowCount` (and even `actualColumnCount`) over-report a
phantom used-range, so you cannot pre-size from them either.

## Fix — stream, never full-load
Read with the **streaming reader** `ExcelJS.stream.xlsx.WorkbookReader` instead
of `Workbook.xlsx.load`. It parses one row at a time via SAX, so peak retention
is ~one row of cells plus the bounded grid you choose to keep. Same 22MB file:
~40MB heap / ~230MB RSS under a 1GB cap, vs OOM at 4GB.

Practical notes for the streaming path:
- Build one bounded grid per sheet in a single pass and cache them (bounded grids
  are tiny), so a synchronous `getGrid(name)` API still works for callers.
- Bound BOTH axes with hard caps (e.g. COL_CAP≈1024, ROW_CAP≈200k). `row.cellCount`
  is the *last cell index with content* (1-based) — iterate `1..cellCount` to read
  populated cells while skipping the phantom tail, then cap it. Note `cellCount`
  counts styled-but-empty cells too, so the cap (not cellCount) is the real
  width guard for junk-styled files.
- exceljs cell values can be rich objects (formula `{result}`, hyperlink/`{text}`,
  `{richText}`, `{error}`) — flatten to a primitive for the mapping layer.
- Convert the upload Buffer to a stream with `Readable.from(buf)`.

## Heap-limit stopgap (cushion only, not the fix)
The dev workflow runs `NODE_OPTIONS=--max-old-space-size=4096 npm run dev` (set
via `configureWorkflow`, NOT by editing `package.json`, which is forbidden). The
parse blew past 4GB anyway, so a bigger heap is only a cushion for heavy-but-
bounded loads — never a substitute for not loading the whole model.

**How to apply:** any feature that parses user-supplied spreadsheets must stream
rather than full-load, and bound the grid it materialises. Pinned by a regression
test (`tests/spreadsheet-parse.test.ts`) where a phantom far-out styled column
must not inflate the grid width.

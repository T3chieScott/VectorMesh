import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packAgendaPages } from "../shared/agenda-resolver";
import {
  buildMeasuredNowNextPages,
  getCanonicalAgendaPaginationDimensions,
} from "../client/src/components/agenda/AgendaDisplayWidget";
import type { AgendaItem } from "../shared/schema";

test("canonical Agenda pagination geometry uses a 720px reference height", () => {
  assert.deepEqual(getCanonicalAgendaPaginationDimensions(1080, 1920), {
    width: 405,
    height: 720,
  });
  assert.deepEqual(getCanonicalAgendaPaginationDimensions(1920, 1080), {
    width: 1280,
    height: 720,
  });
  assert.deepEqual(getCanonicalAgendaPaginationDimensions(1080, 1080), {
    width: 720,
    height: 720,
  });
});

test("canonical geometry is isolated to measurement and measured NOW/NEXT packing", () => {
  const source = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf8",
  );

  assert.match(
    source,
    /buildMeasuredNowNextPages\([\s\S]*?cardHeights,\s*canonicalContentBox\.h,/,
    "measured NOW/NEXT pages must use the canonical height budget",
  );
  assert.match(
    source,
    /<UltraWideGrid[\s\S]*?scale=\{scale\}/,
    "visible UltraWide rendering must retain the physical render scale",
  );
  assert.match(
    source,
    /data-measure-id=\{it\.id\}[\s\S]*?<AgendaRow[\s\S]*?scale=\{paginationScale\}/,
    "only the hidden Agenda card measurer must use canonical typography",
  );
  assert.match(
    source,
    /data-measure-id=\{it\.id\}[\s\S]*?<AgendaRow[\s\S]*?item=\{it\}/,
    "the hidden measurer must render the complete item, including company content",
  );
});

// Helper: assert no page's column overflows the available height, using the
// same conservative model the packer uses (every card reserves a trailing
// gap). Oversized single cards are allowed to occupy a column alone.
function assertNoOverflow(
  pages: string[][],
  heightOf: (id: string) => number,
  available: number,
  numCols: number,
  rowGap: number,
) {
  for (const page of pages) {
    // Re-fill columns the same way the packer does and check each column.
    let idx = 0;
    for (let col = 0; col < numCols && idx < page.length; col++) {
      let colH = 0;
      let placedInCol = 0;
      while (idx < page.length) {
        const slot = heightOf(page[idx]) + rowGap;
        if (colH + slot <= available) {
          colH += slot;
          idx++;
          placedInCol++;
        } else if (placedInCol === 0) {
          // oversized lone card — allowed
          idx++;
          placedInCol++;
          break;
        } else {
          break;
        }
      }
    }
    assert.equal(idx, page.length, "every card on the page maps to a column");
  }
}

test("packs a single column without clipping", () => {
  const items = ["a", "b", "c", "d", "e"];
  const h: Record<string, number> = { a: 100, b: 100, c: 100, d: 100, e: 100 };
  const rowGap = 12;
  // Available 360 -> each slot is 112, so 3 per page (3*112=336 <= 360, 4 would be 448).
  const pages = packAgendaPages(items, items.map((i) => h[i]), 360, 1, rowGap);
  assert.deepEqual(pages, [["a", "b", "c"], ["d", "e"]]);
  assertNoOverflow(pages, (id) => h[id], 360, 1, rowGap);
});

test("respects variable card heights", () => {
  const items = ["a", "b", "c"];
  const h: Record<string, number> = { a: 300, b: 50, c: 50 };
  const rowGap = 12;
  // a slot = 312 (fits in 360). adding b (62) -> 374 > 360, so b/c go next page.
  const pages = packAgendaPages(items, items.map((i) => h[i]), 360, 1, rowGap);
  assert.deepEqual(pages, [["a"], ["b", "c"]]);
  assertNoOverflow(pages, (id) => h[id], 360, 1, rowGap);
});

test("treats max items per page as a cap after variable-height fitting", () => {
  const items = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11"];
  const heights = [540, 420, 610, 500, 440, 570, 390, 620, 400, 450, 450];
  const pages = packAgendaPages(items, heights, 1_380, 1, 12, 3);

  assert.deepEqual(pages, [
    ["s1", "s2"],
    ["s3", "s4"],
    ["s5", "s6"],
    ["s7", "s8"],
    ["s9", "s10", "s11"],
  ]);
  assert.equal(pages.length, 5);
  assert.ok(pages.every((page) => page.length <= 3));
  assertNoOverflow(pages, (id) => heights[items.indexOf(id)], 1_380, 1, 12);
});

test("the item cap is independent of a larger available height", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const pages = packAgendaPages(items, items.map(() => 50), 10_000, 2, 12, 3);
  assert.deepEqual(pages, [["a", "b", "c"], ["d", "e", "f"], ["g"]]);
});

test("measured NOW/NEXT pages preserve their boundary and cap in multiple columns", () => {
  const now = new Date("2031-07-04T10:00:00Z");
  const makeItem = (id: string, running: boolean) => ({
    id,
    startsAt: new Date(running ? "2031-07-04T09:00:00Z" : "2031-07-04T11:00:00Z"),
    endsAt: new Date(running ? "2031-07-04T10:30:00Z" : "2031-07-04T12:00:00Z"),
    status: "scheduled",
  } as AgendaItem);
  const entries = [
    makeItem("next-early", false),
    makeItem("now-1", true),
    makeItem("now-2", true),
    makeItem("next-2", false),
    makeItem("next-3", false),
  ];
  const heights = Object.fromEntries(entries.map((item) => [item.id, 100]));
  const pages = buildMeasuredNowNextPages(entries, now, heights, 10_000, 4, 12, 2);
  assert.deepEqual(pages.map((page) => page.map((item) => item.id)), [
    ["now-1", "now-2"],
    ["next-early", "next-2"],
    ["next-3"],
  ]);
  assert.ok(pages.every((page) => page.length <= 2));
});

test("fills multiple columns top-to-bottom then left-to-right", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const h: Record<string, number> = {
    a: 100, b: 100, c: 100, d: 100, e: 100, f: 100, g: 100,
  };
  const rowGap = 12;
  // 2 columns, available 240 -> 2 cards per column (2*112=224), 4 per page.
  const pages = packAgendaPages(items, items.map((i) => h[i]), 240, 2, rowGap);
  assert.deepEqual(pages, [["a", "b", "c", "d"], ["e", "f", "g"]]);
  assertNoOverflow(pages, (id) => h[id], 240, 2, rowGap);
});

test("an oversized single card is shown alone instead of dropped", () => {
  const items = ["a", "b"];
  const h: Record<string, number> = { a: 999, b: 50 };
  const rowGap = 12;
  const pages = packAgendaPages(items, items.map((i) => h[i]), 300, 1, rowGap);
  // a is taller than the column; it gets its own page, b follows.
  assert.deepEqual(pages, [["a"], ["b"]]);
});

test("never loses or duplicates items", () => {
  const items = Array.from({ length: 137 }, (_, i) => `item-${i}`);
  const heights = items.map((_, i) => 40 + (i % 5) * 30); // 40..160
  const rowGap = 12;
  const pages = packAgendaPages(items, heights, 500, 3, rowGap);
  const flat = pages.flat();
  assert.equal(flat.length, items.length);
  assert.deepEqual(flat, items, "order preserved, no gaps or repeats");
  assertNoOverflow(pages, (id) => heights[items.indexOf(id)], 500, 3, rowGap);
});

test("returns a single page when height budget is unknown", () => {
  const items = ["a", "b", "c"];
  const heights = [100, 100, 100];
  assert.deepEqual(packAgendaPages(items, heights, 0, 1, 12), [items]);
  assert.deepEqual(packAgendaPages(items, heights, -5, 1, 12), [items]);
});

test("empty input yields no pages", () => {
  assert.deepEqual(packAgendaPages([], [], 500, 2, 12), []);
});

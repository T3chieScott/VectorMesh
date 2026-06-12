import { test } from "node:test";
import assert from "node:assert/strict";
import { packAgendaPages } from "../shared/agenda-resolver";

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

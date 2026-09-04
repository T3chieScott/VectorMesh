import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const layoutsSource = readFileSync(
  join(process.cwd(), "client/src/pages/layouts.tsx"),
  "utf8",
);

function between(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, `missing source marker: ${start}`);
  assert.notEqual(endAt, -1, `missing source marker: ${end}`);
  return source.slice(startAt, endAt);
}

test("Scenes uses a compact full-width folder row instead of a permanent folder aside", () => {
  assert.doesNotMatch(layoutsSource, /<aside[^>]*aria-label="Scene folders"/);
  assert.doesNotMatch(layoutsSource, /className="w-32[^"]*"/);

  const selectorAndList = between(
    layoutsSource,
    'className="flex min-h-12 shrink-0 items-center gap-1.5 overflow-x-auto',
    '<ScrollArea className="flex-1 min-w-0">',
  );

  assert.match(selectorAndList, /className="[^"]*min-h-12[^"]*shrink-0[^"]*overflow-x-auto/);
  assert.match(selectorAndList, /role="group"/);
  assert.match(selectorAndList, /aria-label="Scene folder selector"/);
  assert.match(selectorAndList, /data-testid="button-scene-folder-all"/);
  assert.match(selectorAndList, /data-testid="button-scene-folder-unfiled"/);
  assert.match(selectorAndList, /data-testid=\{`button-scene-folder-\$\{folder\.id\}`\}/);
  assert.match(selectorAndList, /aria-label=\{`All scenes, \$\{layouts\.length\} scenes`\}/);
  assert.match(selectorAndList, /aria-label=\{`Unfiled scenes, \$\{unfiledCount\} scenes`\}/);
  assert.match(
    selectorAndList,
    /aria-label=\{`\$\{folder\.name\}, \$\{layouts\.filter\(\(layout\) => layout\.folderId === folder\.id\)\.length\} scenes`\}/,
  );
  assert.match(selectorAndList, /data-testid=\{`button-scene-folder-menu-\$\{folder\.id\}`\}/);
  assert.match(selectorAndList, /data-testid=\{`button-rename-scene-folder-\$\{folder\.id\}`\}/);
  assert.match(selectorAndList, /data-testid=\{`button-delete-scene-folder-\$\{folder\.id\}`\}/);
});

test("Scenes keeps the existing list as a flexing, shrink-safe region", () => {
  const listRegion = between(
    layoutsSource,
    '<ScrollArea className="flex-1 min-w-0">',
    '<Dialog open={folderDialogOpen}',
  );

  assert.match(listRegion, /<ScrollArea className="flex-1 min-w-0">/);
  assert.match(listRegion, /<LayoutListItem/);
  assert.match(layoutsSource, /data-testid=\{`layout-list-item-\$\{layout\.id\}`\}/);
});
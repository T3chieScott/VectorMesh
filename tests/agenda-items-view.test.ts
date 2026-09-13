import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/agenda-items.tsx", "utf8");

test("Agenda Items has an independent persisted card/table preference", () => {
  assert.match(source, /type AgendaItemsView = "cards" \| "table"/);
  assert.match(source, /vectormesh:agenda-items-view/);
  assert.match(source, /agendaItemsViewStorageKey/);
  assert.match(source, /loadAgendaItemsViewPreference/);
  assert.match(source, /localStorage\.setItem\(agendaItemsViewStorageKey\(userId\), view\)/);
  assert.doesNotMatch(source, /vectormesh:\$\{userId\}:screens-view/);
});

test("Agenda Items exposes accessible view controls and renders both views from sorted results", () => {
  assert.match(source, /data-testid="button-agenda-view-cards"/);
  assert.match(source, /data-testid="button-agenda-view-table"/);
  assert.match(source, /aria-pressed=\{view === "cards"\}/);
  assert.match(source, /aria-pressed=\{view === "table"\}/);
  assert.match(source, /view === "table" \?/);
  assert.match(source, /data-testid="agenda-items-table-view"/);
  assert.match(source, /data-testid="agenda-items-card-view"/);
  assert.equal((source.match(/\{sorted\.map\(\(item\) =>/g) ?? []).length, 2);
  assert.match(source, /data-testid=\{`button-edit-\$\{item\.id\}`\}/);
  assert.match(source, /data-testid=\{`button-delete-\$\{item\.id\}`\}/);
});
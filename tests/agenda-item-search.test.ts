import assert from "node:assert/strict";
import test from "node:test";
import type { AgendaItem } from "../shared/schema";
import {
  AGENDA_SEARCH_MAX_LENGTH,
  filterAgendaItemsBySearch,
  normalizeAgendaSearchText,
} from "../shared/agenda-item-search";

function item(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    id: overrides.id ?? "item-1",
    clientId: "client-1",
    title: "Keynote",
    description: null,
    room: null,
    track: null,
    presenter: null,
    presenterCompany: null,
    company: null,
    startsAt: new Date("2026-06-01T09:00:00.000Z"),
    endsAt: new Date("2026-06-01T10:00:00.000Z"),
    sourceOrdinal: null,
    status: "scheduled",
    statusMessage: null,
    externalSyncConfigId: null,
    externalId: null,
    manualOverride: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

test("agenda search normalizes whitespace and case without regex semantics", () => {
  assert.equal(normalizeAgendaSearchText("  Main\t HALL  "), "main hall");
  const rows = [
    item({ id: "one", title: "Main (Hall)" }),
    item({ id: "two", title: "Main Hall", description: "Doors open" }),
  ];
  assert.deepEqual(
    filterAgendaItemsBySearch(rows, "  MAIN   (hall) "),
    [rows[0]],
  );
});

test("agenda search requires every term and preserves input order", () => {
  const rows = [
    item({ id: "first", description: "Acme presenter company" }),
    item({ id: "second", presenterCompany: "Acme", statusMessage: "Delayed 10 minutes" }),
    item({ id: "third", description: "Acme has a presenter" }),
  ];
  assert.deepEqual(
    filterAgendaItemsBySearch(rows, "acme presenter"),
    [rows[0], rows[2]],
  );
});

test("agenda search includes editable fields, page-formatted dates, and available external ids only", () => {
  const row = item({
    description: "Accessibility briefing",
    presenterCompany: "Example Ltd",
    statusMessage: "Doors open",
    externalId: "upstream-42",
  });
  assert.deepEqual(filterAgendaItemsBySearch([row], "ACCESSIBILITY EXAMPLE DOORS"), [row]);
  assert.deepEqual(filterAgendaItemsBySearch([row], "upstream-42"), [row]);
  assert.deepEqual(
    filterAgendaItemsBySearch([row], new Date(row.startsAt).toLocaleString()),
    [row],
  );
  assert.deepEqual(filterAgendaItemsBySearch([row], "not-authorized"), []);
});

test("agenda search is bounded even when called without the input", () => {
  const row = item({ title: "a".repeat(AGENDA_SEARCH_MAX_LENGTH) });
  assert.deepEqual(
    filterAgendaItemsBySearch([row], `${"a".repeat(AGENDA_SEARCH_MAX_LENGTH)}b`),
    [row],
  );
});
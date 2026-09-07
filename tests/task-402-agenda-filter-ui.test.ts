import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  agendaFilterValueKey,
  deriveAgendaFilterOptions,
} from "../shared/agenda-filter-values";

test("Task #402 derives stable persisted facet options and retains stale selections", () => {
  assert.deepEqual(
    deriveAgendaFilterOptions([" Main Hall ", "main hall", "Room 10", "", null], ["Old Room"]),
    ["Main Hall", "Old Room", "Room 10"],
  );
  assert.equal(agendaFilterValueKey("  CUSTOM Status "), agendaFilterValueKey("custom status"));
});

test("Task #402 agenda forms use data-driven controls and custom statuses", () => {
  const configs = readFileSync("client/src/pages/agenda-configs.tsx", "utf8");
  const items = readFileSync("client/src/pages/agenda-items.tsx", "utf8");

  assert.ok(configs.includes("deriveAgendaFilterOptions(persistedValues, value)"));
  assert.ok(configs.includes("roomFilter: agendaFilterValuesSchema.default([])"));
  assert.ok(configs.includes("trackFilter: agendaFilterValuesSchema.default([])"));
  assert.ok(configs.includes("buildSampleAgendaItems(clientId)"));
  assert.ok(configs.includes("items: items.length ? items : buildSampleAgendaItems(clientId)"));
  assert.ok(configs.includes('label="Filter by tracks"'));
  assert.ok(configs.includes('label="Status filter"'));
  assert.equal(configs.includes('placeholder="Keynote, Workshop"'), false);
  assert.ok(configs.includes("No values available."));
  assert.ok(configs.includes("parseAgendaSettingsClipboardPayload(raw)"));

  assert.ok(items.includes("input-agenda-custom-status"));
  assert.ok(items.includes('value="__custom__"'));
  assert.equal(items.includes("<SelectItem value={field.value}"), false);
  assert.ok(items.includes("AGENDA_FILTER_VALUE_MAX_LENGTH"));
  assert.ok(items.includes("agendaFilterValueKey(it.status)"));
  assert.ok(items.includes("deriveAgendaFilterOptions(items.map((item) => item.status)"));
  assert.ok(items.includes("serializeAgendaCsv(sorted)"));
});
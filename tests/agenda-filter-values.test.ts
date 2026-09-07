import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENDA_FILTER_MAX_VALUES,
  AGENDA_FILTER_VALUE_MAX_LENGTH,
  deriveAgendaFilterOptions,
} from "../shared/agenda-filter-values";
import {
  insertAgendaItemSchema,
  insertAgendaWidgetConfigSchema,
} from "../shared/schema";
import { normalizeStatus, applyMapping } from "../shared/spreadsheet-mapping";
import {
  AGENDA_SETTINGS_CLIPBOARD_TYPE,
  AGENDA_SETTINGS_CLIPBOARD_VERSION,
  parseAgendaSettingsClipboardPayload,
} from "../shared/agenda-settings-clipboard";

test("agenda filter option derivation excludes blanks and preserves first spelling", () => {
  assert.deepEqual(
    deriveAgendaFilterOptions([" Main Hall ", "", "main hall", "Zebra"], ["MAIN HALL", "Alpha"]),
    ["Alpha", "Main Hall", "Zebra"],
  );
});

test("agenda schemas preserve custom statuses and canonicalize built-ins", () => {
  const item = insertAgendaItemSchema.parse({
    clientId: "client-1",
    title: "Talk",
    startsAt: "2026-01-01T10:00:00Z",
    endsAt: "2026-01-01T11:00:00Z",
    status: "SCHEDULED",
  });
  assert.equal(item.status, "scheduled");
  assert.equal(
    insertAgendaItemSchema.parse({ ...item, status: "  Awaiting sponsor  " }).status,
    "Awaiting sponsor",
  );
  assert.equal(
    insertAgendaWidgetConfigSchema.safeParse({
      clientId: "client-1",
      name: "Agenda",
      statusFilter: Array.from({ length: AGENDA_FILTER_MAX_VALUES + 1 }, () => "custom"),
    }).success,
    false,
  );
  assert.equal(
    insertAgendaItemSchema.safeParse({ ...item, status: "x".repeat(AGENDA_FILTER_VALUE_MAX_LENGTH + 1) }).success,
    false,
  );
});

test("spreadsheet mapping retains custom status and reports over-limit row errors", () => {
  assert.equal(normalizeStatus("LIVE"), "in_progress");
  const opts = {
    headers: ["Title", "Room", "Start", "End", "Status"],
    mapping: { title: "Title", room: "Room", startsAt: "Start", endsAt: "End", status: "Status" },
    timezone: "UTC",
  };
  const [custom, tooLong] = applyMapping([
    ["Talk", "Hall", "2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z", "  Doors open  "],
    ["Talk", "Hall", "2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z", "x".repeat(101)],
  ], opts);
  assert.equal(custom.item?.status, "Doors open");
  assert.equal(tooLong.status, "error");
  assert.match(tooLong.error ?? "", /100 characters/i);
});

test("agenda settings clipboard accepts bounded custom status filters", () => {
  const payload = JSON.stringify({
    type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
    version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
    settings: { statusFilter: ["  Doors open  "] },
  });
  assert.deepEqual(parseAgendaSettingsClipboardPayload(payload).statusFilter, ["Doors open"]);
  const canonical = JSON.stringify({
    type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
    version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
    settings: { statusFilter: ["SCHEDULED"] },
  });
  assert.deepEqual(parseAgendaSettingsClipboardPayload(canonical).statusFilter, ["scheduled"]);
  const tooMany = JSON.stringify({
    type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
    version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
    settings: { statusFilter: Array.from({ length: AGENDA_FILTER_MAX_VALUES + 1 }, () => "custom") },
  });
  assert.throws(() => parseAgendaSettingsClipboardPayload(tooMany), /At most 100/);
});

test("agenda settings clipboard converts legacy facet text to bounded arrays", () => {
  const legacy = JSON.stringify({
    type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
    version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
    settings: { roomFilter: " Main Hall, Room A ", trackFilter: ["Keynote", "Workshop"] },
  });
  assert.deepEqual(parseAgendaSettingsClipboardPayload(legacy).roomFilter, ["Main Hall", "Room A"]);
  assert.deepEqual(parseAgendaSettingsClipboardPayload(legacy).trackFilter, ["Keynote", "Workshop"]);
});
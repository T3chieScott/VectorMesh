import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  insertAgendaItemSchema,
  insertAgendaWidgetConfigSchema,
} from "../shared/schema";
import { parseAgendaCsv, serializeAgendaCsv } from "../shared/agenda-csv";
import { applyMapping } from "../shared/spreadsheet-mapping";
import {
  PUBLIC_AGENDA_CONFIG_FIELDS,
  PUBLIC_AGENDA_ITEM_FIELDS,
} from "../server/agendaRoutes";

test("0039 is additive, idempotent, and does not reinterpret body_color", () => {
  const sql = readFileSync("migrations/0039_agenda_background_card_colours.sql", "utf8");
  for (const column of [
    "company",
    "display_background_color",
    "card_background_color",
    "session_title_color",
    "description_color",
    "presenter_color",
    "company_color",
    "room_color",
    "track_color",
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
  }
  assert.doesNotMatch(sql, /body_color/);
  assert.match(readFileSync("server/db.ts", "utf8"), /ensureAgendaCustomisationMigration/);
  assert.match(readFileSync("server/index.ts", "utf8"), /ensureAgendaCustomisationMigration/);
});

test("agenda customisation colours accept null and valid hex, reject invalid values", () => {
  const base = { clientId: "site", name: "Display" };
  const valid = insertAgendaWidgetConfigSchema.parse({
    ...base,
    displayBackgroundColor: "#123",
    cardBackgroundColor: "#abcdef",
    sessionTitleColor: null,
    descriptionColor: null,
    presenterColor: "#ABCDEF",
    companyColor: null,
    roomColor: "#fff",
    trackColor: "#000000",
  });
  assert.equal(valid.displayBackgroundColor, "#123");
  assert.equal(valid.sessionTitleColor, null);
  for (const field of [
    "displayBackgroundColor",
    "cardBackgroundColor",
    "sessionTitleColor",
    "descriptionColor",
    "presenterColor",
    "companyColor",
    "roomColor",
    "trackColor",
  ]) {
    assert.equal(
      insertAgendaWidgetConfigSchema.safeParse({ ...base, [field]: "red" }).success,
      false,
      `${field} should reject non-hex colours`,
    );
  }
});

test("spreadsheet mapping preserves presenter and company separately, including company-only rows", () => {
  const headers = ["Title", "Room", "Presenter", "Presenter Last Name", "Company", "Starts", "Ends"];
  const mapping = {
    title: "Title",
    room: "Room",
    presenter: "Presenter",
    presenterLastName: "Presenter Last Name",
    company: "Company",
    startsAt: "Starts",
    endsAt: "Ends",
  } as const;
  const options = { headers, mapping, timezone: "UTC" };
  const rows = applyMapping(
    [
      ["Talk", "Hall", "Ada", "Lovelace", "Analytical Engines", "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"],
      ["Talk 2", "Hall", "", "", "Independent Research", "2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z"],
    ],
    options,
  );
  assert.equal(rows[0].item?.presenter, "Ada Lovelace");
  assert.equal(rows[0].item?.company, "Analytical Engines");
  assert.equal(rows[1].item?.presenter, null);
  assert.equal(rows[1].item?.company, "Independent Research");
});

test("CSV import/export round-trips presenter and company as distinct fields", () => {
  const csv = serializeAgendaCsv([{
    title: "Session",
    description: null,
    room: "Room A",
    track: null,
    presenter: "Ada Lovelace",
    company: "Analytical Engines",
    startsAt: "2026-01-01T09:00:00Z",
    endsAt: "2026-01-01T10:00:00Z",
    status: "scheduled",
    statusMessage: null,
  }]);
  const parsed = parseAgendaCsv(csv);
  assert.equal(parsed[0].item?.presenter, "Ada Lovelace");
  assert.equal(parsed[0].item?.company, "Analytical Engines");
});

test("agenda item persistence shape and public payload expose company and colour fields", () => {
  const item = insertAgendaItemSchema.parse({
    clientId: "site",
    title: "Session",
    company: "Company",
    startsAt: "2026-01-01T09:00:00Z",
    endsAt: "2026-01-01T10:00:00Z",
  });
  assert.equal(item.company, "Company");
  assert.ok(PUBLIC_AGENDA_ITEM_FIELDS.includes("company"));
  for (const field of [
    "displayBackgroundColor",
    "cardBackgroundColor",
    "sessionTitleColor",
    "descriptionColor",
    "presenterColor",
    "companyColor",
    "roomColor",
    "trackColor",
  ]) {
    assert.ok(PUBLIC_AGENDA_CONFIG_FIELDS.includes(field as never), field);
  }
});
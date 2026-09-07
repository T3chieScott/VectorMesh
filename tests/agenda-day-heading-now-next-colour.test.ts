import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertAgendaWidgetConfigSchema } from "../shared/schema";
import {
  buildAgendaSettingsClipboardPayload,
  mergeAgendaSettingsClipboardValues,
  parseAgendaSettingsClipboardPayload,
} from "../shared/agenda-settings-clipboard";
import { PUBLIC_AGENDA_CONFIG_FIELDS } from "../server/agendaRoutes";

test("0037 adds repeatable defaults and is included in startup migration", () => {
  const sql = readFileSync(
    "migrations/0037_agenda_day_heading_now_next_colour.sql",
    "utf8",
  );
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS show_agenda_day_heading BOOLEAN NOT NULL DEFAULT FALSE/,
  );
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS override_now_next_color BOOLEAN NOT NULL DEFAULT FALSE/,
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS now_next_color TEXT/);

  const db = readFileSync("server/db.ts", "utf8");
  const startup = readFileSync("server/index.ts", "utf8");
  assert.match(db, /ensureAgendaDayHeadingNowNextColourMigration/);
  assert.match(db, /pg_advisory_lock/);
  assert.match(startup, /ensureAgendaDayHeadingNowNextColourMigration/);
});

test("agenda config schema defaults flags and accepts only six-digit Now/Next colours", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({
    clientId: "site",
    name: "Agenda",
  });
  assert.equal(parsed.showAgendaDayHeading, false);
  assert.equal(parsed.overrideNowNextColor, false);
  assert.equal(parsed.nowNextColor, undefined);
  assert.equal(
    insertAgendaWidgetConfigSchema.safeParse({
      clientId: "site",
      name: "Agenda",
      nowNextColor: "#0ea5e9",
    }).success,
    true,
  );
  for (const nowNextColor of ["#fff", "0ea5e9", "#abcdex", "red"]) {
    assert.equal(
      insertAgendaWidgetConfigSchema.safeParse({
        clientId: "site",
        name: "Agenda",
        nowNextColor,
      }).success,
      false,
    );
  }
});

test("public and clipboard presentation contracts carry Task 404 settings", () => {
  assert.ok(PUBLIC_AGENDA_CONFIG_FIELDS.includes("showAgendaDayHeading"));
  assert.ok(PUBLIC_AGENDA_CONFIG_FIELDS.includes("overrideNowNextColor"));
  assert.ok(PUBLIC_AGENDA_CONFIG_FIELDS.includes("nowNextColor"));

  const payload = buildAgendaSettingsClipboardPayload({
    showAgendaDayHeading: true,
    overrideNowNextColor: true,
    nowNextColor: "#0EA5E9",
  });
  assert.deepEqual(parseAgendaSettingsClipboardPayload(JSON.stringify(payload)), {
    // The established clipboard builder normalizes this independent setting
    // even when callers omit it.
    presenterVisibleLines: 4,
    showAgendaDayHeading: true,
    overrideNowNextColor: true,
    nowNextColor: "#0EA5E9",
  });
  assert.throws(
    () =>
      parseAgendaSettingsClipboardPayload(
        JSON.stringify({ ...payload, settings: { nowNextColor: "#fff" } }),
      ),
    /nowNextColor/,
  );
});

test("legacy empty Task 404 clipboard placeholders do not overwrite a destination", () => {
  const payload = buildAgendaSettingsClipboardPayload({
    showAgendaDayHeading: "",
    overrideNowNextColor: "",
    nowNextColor: "",
  });
  const settings = parseAgendaSettingsClipboardPayload(JSON.stringify(payload));
  assert.deepEqual(settings, { presenterVisibleLines: 4 });
  const merged = mergeAgendaSettingsClipboardValues(
    {
      showAgendaDayHeading: true,
      overrideNowNextColor: true,
      nowNextColor: "#0ea5e9",
    },
    settings,
  );
  assert.deepEqual(merged, {
    showAgendaDayHeading: true,
    overrideNowNextColor: true,
    nowNextColor: "#0ea5e9",
    presenterVisibleLines: 4,
  });
});

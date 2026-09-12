import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGENDA_SETTINGS_CLIPBOARD_KEYS,
  buildAgendaSettingsClipboardPayload,
  parseAgendaSettingsClipboardPayload,
} from "../shared/agenda-settings-clipboard";
import { insertAgendaWidgetConfigSchema } from "../shared/schema";

test("global Now/Next persistence and clipboard default to disabled", () => {
  const legacy = insertAgendaWidgetConfigSchema.parse({
    clientId: "site-a",
    name: "Legacy",
  });
  assert.equal(legacy.singleGlobalNowNext, false);
  assert.ok(AGENDA_SETTINGS_CLIPBOARD_KEYS.includes("singleGlobalNowNext"));

  const copied = buildAgendaSettingsClipboardPayload({
    singleGlobalNowNext: true,
  });
  assert.equal(
    parseAgendaSettingsClipboardPayload(JSON.stringify(copied)).singleGlobalNowNext,
    true,
  );
});

test("Agenda config UI exposes exact global Now/Next copy and blocks invalid saves", () => {
  const source = readFileSync(
    new URL("../client/src/pages/agenda-configs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Single Now &amp; Next across selected rooms/);
  assert.match(
    source,
    /Combines sessions from all selected rooms into one chronological sequence, showing only one current session and one next session\./,
  );
  assert.match(source, /data-testid="warning-global-now-next-conflict"/);
  assert.match(
    source,
    /disabled=\{mutation\.isPending \|\| !globalNowNextValidation\.valid\}/,
  );
  assert.match(source, /validateGlobalNowNextSequence\(\{/);
});
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAgendaCsv } from "../shared/agenda-csv";

test("Task #403 fixed CSV status ingestion preserves confirmed and custom statuses", () => {
  const rows = parseAgendaCsv(
    "title,description,room,track,presenter,startsAt,endsAt,status,statusMessage\n" +
      "Confirmed,,Hall,,,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z, confirmed ,\n" +
      "Custom,,Hall,,,2026-06-01T11:00:00Z,2026-06-01T12:00:00Z,Not a session,\n" +
      "Cancelled,,Hall,,,2026-06-01T13:00:00Z,2026-06-01T14:00:00Z,CANCELLED,\n",
  );
  assert.deepEqual(rows.map((row) => row.item?.status), [
    "confirmed",
    "Not a session",
    "cancelled",
  ]);
});

test("Agenda Item dialog resets per open while status refetches only update choices", () => {
  const source = readFileSync("client/src/pages/agenda-items.tsx", "utf8");
  assert.match(source, /if \(open && !wasOpen\.current\)/);
  assert.match(source, /form\.reset\(buildItemFormDefaults\(initial, persistedStatusOptions\)\)/);
  assert.match(source, /setCustomStatusMode\(false\)/);
  assert.match(source, /status: normalizeAgendaStatus\(initial\.status, AGENDA_STATUSES\) \?\? initial\.status/);
  assert.match(source, /persistedStatusOptions[\s\S]*\[current\]/);
  assert.match(source, /\}, \[open\]\);/);
  assert.doesNotMatch(source, /\}, \[open, persistedStatusOptions\]\);/);
});
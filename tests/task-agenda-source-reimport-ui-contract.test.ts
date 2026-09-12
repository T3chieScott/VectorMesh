import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/agenda-items.tsx", "utf8");

test("Agenda source re-import keeps the destructive UI contract", () => {
  assert.ok(
    source.includes(
      "This will permanently discard all VectorMesh edits to items imported by ${config.name} and replace them with the current spreadsheet data. It will not modify the spreadsheet.",
    ),
  );
  assert.ok(
    source.includes(
      "This connection identifies rows by spreadsheet position. Inserting, deleting, moving or sorting rows can change session identities. Configure a stable unique ID column for reliable synchronisation.",
    ),
  );
  assert.match(source, /reimport\/preflight/);
  assert.match(source, /reimport`/);
  assert.match(source, /preflightToken: preflight\?\.preflightToken,\s*confirmation: "RESET"/);
  assert.match(source, /preflight\.ok === true/);
  assert.match(source, /confirmation === "RESET"/);
  assert.match(source, /import \{ useAuth \} from "@\/hooks\/use-auth";/);
  assert.match(source, /const isAdmin = user\?\.role === "admin";/);
  assert.match(source, /\{isAdmin && isSpreadsheetSource\(cfg\) && \(/);
  assert.doesNotMatch(source, /user\?\.role === "account_manager"/);
  assert.match(source, /data-testid="button-confirm-reimport"/);
  assert.match(source, /data-testid="reimport-diagnostics"/);
  assert.match(source, /data-testid="reimport-completion-counts"/);
  assert.match(source, /max-h-\[calc\(100dvh-2rem\)\][\s\S]*overflow-y-auto/);
});
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { executeAgendaSourceReset, preflightAgendaSourceReset, runAgendaSync } from "../server/agendaSync";
import type { AgendaItem, AgendaSyncConfig, InsertAgendaItem } from "../shared/schema";

process.env.SESSION_SECRET ||= "agenda-reset-test-secret";

async function workbook(sheet: string, rows: Array<[string, string, string, string]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(["ID", "Title", "Start", "End"]);
  for (const [id, title, start, end] of rows) ws.addRow([id, title, new Date(start), new Date(end)]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function config(overrides: Partial<AgendaSyncConfig> = {}): AgendaSyncConfig {
  return {
    id: "reset-config", clientId: "site-a", name: "Source", sourceType: "excel_onedrive",
    sourceUrl: "https://example.test/source.xlsx", storedFilePath: null, sheetName: "Agenda",
    headerRowIndex: 0, firstDataRowIndex: null,
    columnMapping: { title: "Title", startsAt: "Start", endsAt: "End" },
    externalIdColumn: "ID", timezone: "UTC", dateFormatHint: null, syncMode: "interval",
    removeMissingItems: false, enabled: true, syncIntervalMinutes: 60, lastSyncAt: null,
    lastSyncOk: null, lastError: null, lastErrorAt: null, lastItemCount: null,
    lastSyncWarnings: null, consecutiveFailureCount: 0, failureAlertSent: false, microsoftAuth: true,
    msDriveId: "drive", msItemId: "item", msSiteId: null, lastCTag: null,
    lastProcessedConfigFingerprint: null, lastGoodSnapshotId: null, lastPublishedAt: null,
    lastCTagChangedAt: null, lastSnapshotVersion: null, msFileName: null, createdAt: new Date(),
    updatedAt: new Date(), startTimeColumn: null, endTimeColumn: null, dateBaseMonth: null,
    dateBaseYear: null, ...overrides,
  } as AgendaSyncConfig;
}

function deps(cfg: AgendaSyncConfig, bytes: () => Uint8Array | Promise<Uint8Array>) {
  const items: AgendaItem[] = [];
  const calls = { reset: 0 };
  const storage: any = {
    async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async getAgendaItemsBySyncConfig(id: string) { return items.filter((row) => row.externalSyncConfigId === id); },
    async getClient() { return { id: cfg.clientId, timezone: "UTC" }; },
    async updateAgendaSyncConfig() { return cfg; },
    async createAgendaItem(data: InsertAgendaItem) { const row = { ...data, id: `new-${items.length + 1}`, createdAt: new Date(), updatedAt: new Date() } as AgendaItem; items.push(row); return row; },
    async updateAgendaItem(id: string, data: Partial<InsertAgendaItem>) { const row = items.find((item) => item.id === id); if (row) Object.assign(row, data); return row; },
    async deleteAgendaItem(id: string) { const i = items.findIndex((row) => row.id === id); if (i < 0) return false; items.splice(i, 1); return true; },
    async atomicAgendaSourceReset(params: any) {
      calls.reset++;
      if ((cfg.lastGoodSnapshotId ?? null) !== params.expectedSnapshotId || (cfg.lastSnapshotVersion ?? null) !== params.expectedSnapshotVersion) throw new Error("generation changed");
      cfg.lastGoodSnapshotId = "snapshot-1"; cfg.lastSnapshotVersion = 1;
      return { inserted: params.newItems.length, updated: 0, removed: 0, snapshotId: "snapshot-1", snapshotVersion: 1, preResetSnapshotId: "before-1", preResetSnapshotVersion: 0, preResetItemCount: 0, itemCount: params.newItems.length };
    },
  };
  return { storage, calls, graphFetch: async () => bytes() };
}

test("preflight requires exact worksheet and returns safe coherent counts", async () => {
  const bytes = await workbook("Agenda", [["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  const cfg = config({ sheetName: "Missing" });
  const d = deps(cfg, () => bytes);
  const missing = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch });
  assert.equal(missing.ok, false);
  assert.match(missing.blockers[0], /Configured worksheet "Missing"/);

  const validCfg = config();
  const validDeps = deps(validCfg, () => bytes);
  const valid = await preflightAgendaSourceReset(validCfg, { storage: validDeps.storage, graphFetch: validDeps.graphFetch });
  assert.equal(valid.ok, true);
  assert.equal(valid.counts.validSessions, 1);
  assert.equal(valid.plannedCounts.toInsert, 1);
  assert.equal(valid.preflightToken!.includes("sourceDigest"), false);
  assert.equal("sourceDigest" in valid, false);
  assert.equal("configFingerprint" in valid, false);
});

test("preflight reports safe blank/duplicate row diagnostics", async () => {
  const cfg = config();
  const blank = deps(cfg, () => workbook("Agenda", [["", "Blank", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]] as any));
  const result = await preflightAgendaSourceReset(cfg, { storage: blank.storage, graphFetch: blank.graphFetch });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.rows[0]?.rowNumber, 2);
  assert.match(result.diagnostics.rows[0]?.reason ?? "", /blank/);

  const duplicate = deps(cfg, () => workbook("Agenda", [
    ["same", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"],
    ["same", "Two", "2026-06-02T11:00:00Z", "2026-06-02T12:00:00Z"],
  ]));
  const duplicateResult = await preflightAgendaSourceReset(cfg, { storage: duplicate.storage, graphFetch: duplicate.graphFetch });
  assert.equal(duplicateResult.counts.duplicateSourceIds, 1);
});

test("signed token rejects tamper/expiry and successful generation makes replay fail", async () => {
  const bytes = await workbook("Agenda", [["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  const cfg = config();
  const d = deps(cfg, () => bytes);
  const preflight = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch });
  const tampered = `${preflight.preflightToken!.slice(0, -1)}A`;
  await assert.rejects(() => executeAgendaSourceReset(cfg.id, tampered, { storage: d.storage, graphFetch: d.graphFetch }), /Invalid or expired/);
  const expired = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch, now: () => new Date(Date.now() - 11 * 60_000) });
  await assert.rejects(() => executeAgendaSourceReset(cfg.id, expired.preflightToken!, { storage: d.storage, graphFetch: d.graphFetch }), /Invalid or expired/);
  const result = await executeAgendaSourceReset(cfg.id, preflight.preflightToken!, { storage: d.storage, graphFetch: d.graphFetch });
  assert.equal(result.counts.imported, 1);
  assert.equal(result.preResetSnapshot?.id, "before-1");
  await assert.rejects(() => executeAgendaSourceReset(cfg.id, preflight.preflightToken!, { storage: d.storage, graphFetch: d.graphFetch }), /generation changed/);
});

test("opaque HMAC reset token executes across independent workers without process-local authorization state", async () => {
  const bytes = await workbook("Agenda", [["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  const cfg = config();
  const workerA = deps(cfg, () => bytes);
  const preflight = await preflightAgendaSourceReset(cfg, {
    storage: workerA.storage,
    graphFetch: workerA.graphFetch,
  });
  assert.equal(preflight.ok, true);
  const token = preflight.preflightToken!;
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(token, /Agenda|One|example\.test|source\.xlsx/);

  // A second worker has a separate storage/dependency object and has never
  // seen the preflight call. The signed token itself must carry authorization
  // state; execution cannot depend on a process-local token registry.
  const workerB = deps(cfg, () => bytes);
  const result = await executeAgendaSourceReset(cfg.id, token, {
    storage: workerB.storage,
    graphFetch: workerB.graphFetch,
  });
  assert.equal(result.ok, true);
  assert.equal(workerA.calls.reset, 0);
  assert.equal(workerB.calls.reset, 1);

  // Keep this contract explicit: only in-flight serialization state is
  // process-local; no preflight-token authorization map may be introduced.
  const source = readFileSync("server/agendaSync.ts", "utf8");
  assert.doesNotMatch(source, /RESET_PREFLIGHT_TOKENS|PREFLIGHT_TOKEN_STORE|preflightTokenStore/);
});

test("stale workbook/config binding and exact worksheet protect execute", async () => {
  let current = await workbook("Agenda", [["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  const cfg = config();
  const d = deps(cfg, () => current);
  const preflight = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch });
  current = await workbook("Agenda", [["one", "Changed", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  await assert.rejects(() => executeAgendaSourceReset(cfg.id, preflight.preflightToken!, { storage: d.storage, graphFetch: d.graphFetch }), /changed after preflight/);
  assert.equal(d.calls.reset, 0);
});

test("ordinary sync rejects missing worksheet rather than silently selecting first sheet", async () => {
  const bytes = await workbook("Agenda", [["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  const cfg = config({ sheetName: "Other" });
  const d = deps(cfg, () => bytes);
  const result = await runAgendaSync(cfg, { storage: d.storage, graphFetch: d.graphFetch });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Configured worksheet "Other"/);
});

test("storage transaction contract locks config/items before validation", () => {
  const source = readFileSync("server/storage.ts", "utf8");
  const reset = source.slice(source.indexOf("async atomicAgendaSourceReset"));
  const normal = source.slice(source.indexOf("async atomicMicrosoftSync"));
  assert.match(reset, /agendaSyncConfigs\)[\s\S]{0,240}\.for\("update"\)/);
  assert.match(reset, /agendaItems\)[\s\S]{0,240}\.for\("update"\)/);
  assert.match(reset, /expectedItemStateDigest/);
  assert.match(normal, /agendaSyncConfigs\)[\s\S]{0,240}\.for\("update"\)/);
});
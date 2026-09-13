import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import {
  executeAgendaSourceReset,
  getAgendaSourceResetDiagnostics,
  paginateAgendaResetDiagnostics,
  preflightAgendaSourceReset,
  runAgendaSync,
} from "../server/agendaSync";
import type { AgendaItem, AgendaSyncConfig, InsertAgendaItem } from "../shared/schema";

process.env.SESSION_SECRET ||= "agenda-reset-test-secret";

async function workbook(sheet: string, rows: Array<[string, string, string, string]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(["ID", "Title", "Start", "End"]);
  for (const [id, title, start, end] of rows) ws.addRow([id, title, new Date(start), new Date(end)]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function workbookWithPresenterFields(rows: Array<{
  id: string;
  title: string;
  start: string;
  end: string;
  presenter: string;
  presenterCompany: string;
  company: string;
}>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  ws.addRow(["ID", "Title", "Start", "End", "Presenter", "Presenter Company", "Company"]);
  for (const row of rows) {
    ws.addRow([
      row.id,
      row.title,
      new Date(row.start),
      new Date(row.end),
      row.presenter,
      row.presenterCompany,
      row.company,
    ]);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function diagnosticWorkbook(rows: Array<Array<string>>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  ws.addRow(["ID", "Title", "Start", "End", "Status"]);
  for (const row of rows) ws.addRow(row);
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
  const calls: { reset: number; resetParams?: any } = { reset: 0 };
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
      calls.resetParams = params;
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
  assert.equal(duplicateResult.diagnostics.rows.length, 2);
  assert.ok(duplicateResult.diagnostics.rows.every((row) =>
    row.cells.find((cell) => cell.column === "ID")?.messages.some((message) => /duplicated/i.test(message)),
  ));
});

test("preflight exposes canonical mapped cell diagnostics and safe paged search", async () => {
  const longStatus = "invalid-status-".repeat(12);
  const rows: string[][] = [
    ["dup", "", "not-a-date", "2026-06-02T10:00:00Z", longStatus],
    ["dup", "Ends first", "2026-06-02T12:00:00Z", "2026-06-02T11:00:00Z", "scheduled"],
    ["dup", "Ends first too", "2026-06-02T12:00:00Z", "2026-06-02T11:00:00Z", "scheduled"],
    ["", "<script>alert(1)</script>", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z", longStatus],
    ["formula", "=HYPERLINK(\"javascript:alert(1)\")", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z", longStatus],
  ];
  for (let i = 0; i < 30; i++) {
    rows.push([`row-${i}`, "", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z", "scheduled"]);
  }
  const cfg = config({
    columnMapping: { title: "Title", startsAt: "Start", endsAt: "End", status: "Status" },
  });
  const bytes = await diagnosticWorkbook(rows);
  const d = deps(cfg, () => bytes);
  const result = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch });
  assert.equal(result.ok, false);
  assert.ok(result.preflightToken);
  assert.ok((result.counts.invalidSkippedRows ?? 0) >= 34);
  assert.deepEqual(result.diagnostics.columns, ["Title", "Start", "End", "Status", "ID"]);
  assert.equal(result.diagnostics.page, 1);
  assert.equal(result.diagnostics.pageSize, 25);
  assert.equal(result.diagnostics.hasMore, true);

  const first = result.diagnostics.rows.find((row) => row.rowNumber === 2)!;
  assert.ok(first.cells.find((cell) => cell.column === "Title")?.messages.some((message) => /required/i.test(message)));
  assert.ok(first.cells.find((cell) => cell.column === "Start")?.messages.length);
  assert.ok(first.cells.find((cell) => cell.column === "Status")?.messages.some((message) => /invalid status/i.test(message)));
  const joint = result.diagnostics.rows.find((row) => row.rowNumber === 3)!;
  assert.ok(joint.cells.find((cell) => cell.column === "Start")?.messages.some((message) => /after/i.test(message)));
  assert.ok(joint.cells.find((cell) => cell.column === "End")?.messages.some((message) => /after/i.test(message)));
  const malicious = result.diagnostics.rows.find((row) => row.rowNumber === 5)!;
  assert.match(malicious.cells.find((cell) => cell.column === "Title")?.value ?? "", /&lt;script&gt;/);
  const formula = result.diagnostics.rows.find((row) => row.rowNumber === 6)!;
  assert.match(formula.cells.find((cell) => cell.column === "Title")?.value ?? "", /^'/);
  assert.equal(result.diagnostics.rows.some((row) => row.cells.some((cell) => cell.column === "ID")), true);

  const pageTwo = await getAgendaSourceResetDiagnostics(cfg.id, result.preflightToken!, {
    storage: d.storage,
    graphFetch: d.graphFetch,
  }, { page: 2, pageSize: 25 });
  assert.equal(pageTwo.diagnostics.page, 2);
  assert.equal(pageTwo.diagnostics.rows[0]?.rowNumber, 27);
  const search = await getAgendaSourceResetDiagnostics(cfg.id, result.preflightToken!, {
    storage: d.storage,
    graphFetch: d.graphFetch,
  }, { search: "row-29", pageSize: 25 });
  assert.equal(search.diagnostics.totalRows, 1);
  assert.equal(search.diagnostics.rows[0]?.rowNumber, 36);

  const deterministic = paginateAgendaResetDiagnostics(result.diagnostics.rows, { page: 1, pageSize: 1 });
  assert.equal(deterministic.rows[0]?.rowNumber, 2);
  assert.ok(deterministic.rows[0]?.errors.length);
  await assert.rejects(
    () => executeAgendaSourceReset(cfg.id, result.preflightToken!, { storage: d.storage, graphFetch: d.graphFetch }),
    /invalid rows/i,
  );
  assert.equal(d.calls.reset, 0);
});

test("split clock diagnostics include clock columns and joint ordering marks all four cells", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Agenda");
  sheet.addRow(["ID", "Title", "Start", "End", "Start clock", "End clock"]);
  sheet.addRow(["blank-clock", "Blank clock", "2026-06-02", "2026-06-02", "", "10:00"]);
  sheet.addRow(["ordered", "Wrong order", "2026-06-02", "2026-06-02", "12:00", "11:00"]);
  const cfg = config({
    columnMapping: { title: "Title", startsAt: "Start", endsAt: "End" },
    startTimeColumn: "Start clock",
    endTimeColumn: "End clock",
  });
  // Keep the source byte identity stable across preflight/revalidation.
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  const stable = deps(cfg, () => bytes);
  const result = await preflightAgendaSourceReset(cfg, { storage: stable.storage, graphFetch: stable.graphFetch });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.columns, ["Title", "Start", "End", "Start clock", "End clock", "ID"]);
  const blank = result.diagnostics.rows.find((row) => row.rowNumber === 2)!;
  assert.ok(blank.cells.find((cell) => cell.column === "Start clock")?.messages.some((message) => /required/i.test(message)));
  assert.equal(blank.cells.find((cell) => cell.column === "Start")?.messages.length, 0);
  const ordered = result.diagnostics.rows.find((row) => row.rowNumber === 3)!;
  for (const column of ["Start", "End", "Start clock", "End clock"]) {
    assert.ok(ordered.cells.find((cell) => cell.column === column)?.messages.some((message) => /after/i.test(message)), column);
  }
});

test("diagnostics reject stale Agenda item, snapshot, and config revisions", async () => {
  const bytes = await diagnosticWorkbook([["one", "", "not-a-date", "2026-06-02T10:00:00Z", "scheduled"]]);
  const expectStale = async (mutate: (cfg: AgendaSyncConfig, d: ReturnType<typeof deps>) => void, message: RegExp) => {
    const cfg = config();
    const d = deps(cfg, () => bytes);
    const preflight = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch });
    assert.ok(preflight.preflightToken);
    mutate(cfg, d);
    await assert.rejects(
      () => getAgendaSourceResetDiagnostics(cfg.id, preflight.preflightToken!, { storage: d.storage, graphFetch: d.graphFetch }),
      message,
    );
  };
  await expectStale((cfg, d) => {
    d.storage.getAgendaItemsBySyncConfig = async () => [{
      id: "new-item", externalSyncConfigId: cfg.id, externalId: "new", sourceOrdinal: 1,
    }] as AgendaItem[];
  }, /Agenda items changed/);
  await expectStale((cfg) => {
    cfg.lastGoodSnapshotId = "new-snapshot";
    cfg.lastSnapshotVersion = 7;
  }, /snapshot changed/);
  await expectStale((cfg) => {
    cfg.updatedAt = new Date("2026-02-01T00:00:00Z");
  }, /configuration changed/);
});

test("byte-safe diagnostics pages expose every oversized row exactly once", () => {
  const sourceRows = Array.from({ length: 40 }, (_, index) => ({
    rowNumber: index + 2,
    status: "error" as const,
    errors: ["invalid value ".repeat(20)],
    cells: Array.from({ length: 20 }, (_, column) => ({
      column: `Column ${column}`,
      value: `${index}-`.padEnd(600, "x"),
      messages: ["invalid value ".repeat(20)],
    })),
  }));
  const seen: number[] = [];
  let page = 1;
  let pageCount = 0;
  while (true) {
    const result = paginateAgendaResetDiagnostics(sourceRows, { page, pageSize: 25 });
    pageCount = result.pageCount;
    assert.ok(Buffer.byteLength(JSON.stringify({ rows: result.rows }), "utf8") <= 100_000);
    seen.push(...result.rows.map((row) => row.rowNumber));
    if (!result.hasMore) break;
    page++;
    assert.ok(page <= 100);
  }
  assert.ok(pageCount > 2, "fixture must exercise byte packing rather than only requested count");
  assert.deepEqual(seen, sourceRows.map((row) => row.rowNumber));
  assert.equal(new Set(seen).size, sourceRows.length);
});

test("signed token rejects tamper/expiry and successful generation makes replay fail", async () => {
  const bytes = await workbook("Agenda", [["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"]]);
  const cfg = config();
  const d = deps(cfg, () => bytes);
  const preflight = await preflightAgendaSourceReset(cfg, { storage: d.storage, graphFetch: d.graphFetch });
  const finalCharacter = preflight.preflightToken!.slice(-1);
  const tampered = `${preflight.preflightToken!.slice(0, -1)}${finalCharacter === "A" ? "B" : "A"}`;
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

test("hard reset passes sponsor and presenter-company fields into the replacement snapshot", async () => {
  const bytes = await workbookWithPresenterFields([{
    id: "row-1",
    title: "Panel",
    start: "2026-06-02T09:00:00Z",
    end: "2026-06-02T10:00:00Z",
    presenter: "Ada Lovelace",
    presenterCompany: "Analytical Engines",
    company: "Session Sponsor",
  }]);
  const cfg = config({
    columnMapping: {
      title: "Title",
      startsAt: "Start",
      endsAt: "End",
      presenter: "Presenter",
      presenterCompany: "Presenter Company",
      company: "Company",
    },
  });
  const d = deps(cfg, () => bytes);
  const preflight = await preflightAgendaSourceReset(cfg, {
    storage: d.storage,
    graphFetch: d.graphFetch,
  });
  assert.equal(preflight.ok, true);
  const result = await executeAgendaSourceReset(cfg.id, preflight.preflightToken!, {
    storage: d.storage,
    graphFetch: d.graphFetch,
  });
  assert.equal(result.ok, true);
  assert.equal(d.calls.resetParams?.newItems[0]?.presenter, "Ada Lovelace");
  assert.equal(d.calls.resetParams?.newItems[0]?.presenterCompany, "Analytical Engines");
  assert.equal(d.calls.resetParams?.newItems[0]?.company, "Session Sponsor");
  assert.equal(d.calls.resetParams?.newItems[0]?.sourceOrdinal, 0);
});

test("storage transaction contract locks config/items before validation", () => {
  const source = readFileSync("server/storage.ts", "utf8");
  const reset = source.slice(source.indexOf("async atomicAgendaSourceReset"));
  const normal = source.slice(source.indexOf("async atomicMicrosoftSync"));
  assert.match(reset, /agendaSyncConfigs\)[\s\S]{0,240}\.for\("update"\)/);
  assert.match(reset, /agendaItems\)[\s\S]{0,240}\.for\("update"\)/);
  assert.match(reset, /sourceOrdinal:\s*item\.sourceOrdinal\s*\?\?\s*null/);
  assert.match(reset, /expectedItemStateDigest/);
  assert.match(normal, /agendaSyncConfigs\)[\s\S]{0,240}\.for\("update"\)/);
});
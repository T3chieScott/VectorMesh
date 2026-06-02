import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { runAgendaSync, runDueAgendaSyncs } from "../server/agendaSync";
import type {
  AgendaItem,
  AgendaSyncConfig,
  InsertAgendaItem,
} from "../shared/schema";

// Task #267 — guards on the mapped spreadsheet path:
//  1. A half-configured mapping (required field unmapped) must FAIL the
//     sync instead of producing zero rows and tombstoning everything.
//  2. Interval sync (runDueAgendaSyncs) must thread resolveStoredPath so
//     uploaded_xlsx feeds resolve their on-disk file in background mode.

function makeStubStorage(configRow: AgendaSyncConfig, initial: AgendaItem[] = []) {
  const items: AgendaItem[] = [...initial];
  const configUpdates: any[] = [];
  let cfg = configRow;
  let nextId = items.length + 1;
  return {
    items,
    configUpdates,
    storage: {
      async getAgendaSyncConfigs() { return [cfg]; },
      async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
      async updateAgendaSyncConfig(id: string, data: any) {
        cfg = { ...cfg, ...data };
        configUpdates.push(data);
        return cfg;
      },
      async getClient() { return { id: cfg.clientId, timezone: "Europe/London" } as any; },
      async getAgendaItemsBySyncConfig(syncConfigId: string) {
        return items.filter((i) => i.externalSyncConfigId === syncConfigId);
      },
      async createAgendaItem(data: InsertAgendaItem) {
        const row: AgendaItem = {
          id: `item-${nextId++}`,
          clientId: data.clientId,
          title: data.title,
          description: data.description ?? null,
          room: data.room ?? null,
          track: data.track ?? null,
          presenter: data.presenter ?? null,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          status: (data.status ?? "scheduled") as AgendaItem["status"],
          statusMessage: data.statusMessage ?? null,
          externalSyncConfigId: data.externalSyncConfigId ?? null,
          externalId: data.externalId ?? null,
          manualOverride: data.manualOverride ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        items.push(row);
        return row;
      },
      async updateAgendaItem(id: string, data: Partial<InsertAgendaItem>) {
        const idx = items.findIndex((i) => i.id === id);
        if (idx === -1) return undefined;
        items[idx] = { ...items[idx], ...(data as any), updatedAt: new Date() };
        return items[idx];
      },
      async deleteAgendaItem(id: string) {
        const idx = items.findIndex((i) => i.id === id);
        if (idx === -1) return false;
        items.splice(idx, 1);
        return true;
      },
    },
    get config() { return cfg; },
  };
}

function baseMappedConfig(overrides: Partial<AgendaSyncConfig> = {}): AgendaSyncConfig {
  return {
    id: "cfg-mapped",
    clientId: "client-A",
    name: "CSV mapped",
    sourceType: "csv_url",
    sourceUrl: "https://example.com/agenda.csv",
    storedFilePath: null,
    sheetName: null,
    headerRowIndex: 0,
    firstDataRowIndex: null,
    columnMapping: null,
    externalIdColumn: null,
    timezone: "Europe/London",
    dateFormatHint: null,
    syncMode: "scheduled",
    removeMissingItems: true,
    enabled: true,
    syncIntervalMinutes: 60,
    lastSyncAt: null,
    lastSyncOk: null,
    lastError: null,
    lastErrorAt: null,
    lastItemCount: null,
    lastSyncWarnings: null,
    consecutiveFailureCount: 0,
    failureAlertSent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgendaSyncConfig;
}

function existingItem(externalId: string): AgendaItem {
  return {
    id: `existing-${externalId}`,
    clientId: "client-A",
    title: `Existing ${externalId}`,
    description: null,
    room: null,
    track: null,
    presenter: null,
    startsAt: new Date("2026-06-02T09:00:00Z"),
    endsAt: new Date("2026-06-02T10:00:00Z"),
    status: "scheduled",
    statusMessage: null,
    externalSyncConfigId: "cfg-mapped",
    externalId,
    manualOverride: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const CSV_BODY = "Title,Start,End\nKeynote,2026-06-02 09:00,2026-06-02 10:00\n";
function mockFetch(body: string): typeof fetch {
  return (async () => new Response(body, { status: 200, statusText: "OK" })) as unknown as typeof fetch;
}
const safeOpts = { lookupImpl: async () => [{ address: "93.184.216.34", family: 4 as const }] };

test("incomplete mapping fails the sync and does NOT tombstone existing rows", async () => {
  // startsAt + endsAt mapped, title MISSING — required field gap.
  const cfg = baseMappedConfig({
    columnMapping: { startsAt: "Start", endsAt: "End" } as any,
  });
  const s = makeStubStorage(cfg, [existingItem("keep-1"), existingItem("keep-2")]);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    fetchImpl: mockFetch(CSV_BODY),
    safeFetchOptions: safeOpts,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /required fields are unmapped/i);
  assert.match(r.error ?? "", /title/);
  // Critical: nothing removed despite removeMissingItems=true.
  assert.equal(r.removed, 0);
  assert.equal(s.items.length, 2);
  assert.equal(s.config.lastSyncOk, false);
});

test("complete mapping syncs the CSV upstream normally", async () => {
  const cfg = baseMappedConfig({
    columnMapping: { title: "Title", startsAt: "Start", endsAt: "End" } as any,
  });
  const s = makeStubStorage(cfg);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    fetchImpl: mockFetch(CSV_BODY),
    safeFetchOptions: safeOpts,
  });
  assert.equal(r.ok, true);
  assert.equal(r.inserted, 1);
  assert.equal(s.items[0].title, "Keynote");
});

test("interval sync threads resolveStoredPath for uploaded_xlsx", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "agenda-xlsx-"));
  const abs = path.join(dir, "book.xlsx");
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Agenda");
    ws.addRow(["Title", "Start", "End"]);
    ws.addRow(["Opening", new Date(Date.UTC(2026, 5, 2, 9, 0)), new Date(Date.UTC(2026, 5, 2, 10, 0))]);
    const ab = await wb.xlsx.writeBuffer();
    await writeFile(abs, Buffer.from(ab as ArrayBuffer));

    const cfg = baseMappedConfig({
      id: "cfg-xlsx",
      sourceType: "uploaded_xlsx",
      sourceUrl: null,
      storedFilePath: "client-A/uploads/book.xlsx",
      columnMapping: { title: "Title", startsAt: "Start", endsAt: "End" } as any,
    });
    const s = makeStubStorage(cfg);

    let resolverCalledWith: string | null = null;
    const { ran, results } = await runDueAgendaSyncs({
      storage: s.storage as any,
      resolveStoredPath: async (p: string) => {
        resolverCalledWith = p;
        return abs;
      },
    });
    assert.equal(ran, 1);
    assert.equal(resolverCalledWith, "client-A/uploads/book.xlsx");
    assert.equal(results[0].result.ok, true);
    assert.equal(results[0].result.inserted, 1);
    assert.equal(s.items[0].title, "Opening");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

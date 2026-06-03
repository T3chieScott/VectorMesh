import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { runAgendaSync } from "../server/agendaSync";
import {
  fetchMicrosoftXlsxBytes,
  getMicrosoftConnectionStatus,
  resolveShareLink,
  MicrosoftNotConnectedError,
  MICROSOFT_NOT_CONNECTED_MESSAGE,
} from "../server/microsoftGraph";
import type {
  AgendaItem,
  AgendaSyncConfig,
  InsertAgendaItem,
} from "../shared/schema";

// Task #268 — Microsoft Graph-backed agenda source. Only the FETCH step
// changes; the #267 parse/map/upsert pipeline is reused. These tests
// mock Graph entirely (no network): a fetchImpl that returns a connector
// token from the credential proxy and .xlsx bytes from Graph, plus a
// direct graphFetch dep injected into runAgendaSync.

// ----- shared stubs (mirrors agenda-sync-mapped-guards.test.ts) -----

function makeStubStorage(configRow: AgendaSyncConfig, initial: AgendaItem[] = []) {
  const items: AgendaItem[] = [...initial];
  let cfg = configRow;
  let nextId = items.length + 1;
  return {
    items,
    storage: {
      async getAgendaSyncConfigs() { return [cfg]; },
      async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
      async updateAgendaSyncConfig(id: string, data: any) {
        cfg = { ...cfg, ...data };
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

function msConfig(overrides: Partial<AgendaSyncConfig> = {}): AgendaSyncConfig {
  return {
    id: "cfg-ms",
    clientId: "client-A",
    name: "OneDrive Excel",
    sourceType: "excel_onedrive",
    sourceUrl: null,
    storedFilePath: null,
    sheetName: null,
    headerRowIndex: 0,
    firstDataRowIndex: null,
    columnMapping: { title: "Title", startsAt: "Start", endsAt: "End" } as any,
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
    microsoftAuth: true,
    msDriveId: "drive-123",
    msItemId: "item-456",
    msSiteId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgendaSyncConfig;
}

async function buildXlsxBytes(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  ws.addRow(["Title", "Start", "End"]);
  ws.addRow(["Keynote", new Date(Date.UTC(2026, 5, 2, 9, 0)), new Date(Date.UTC(2026, 5, 2, 10, 0))]);
  const ab = await wb.xlsx.writeBuffer();
  return new Uint8Array(ab as ArrayBuffer);
}

// A fetchImpl that mocks BOTH the connector credential proxy (token) and
// the Graph content endpoint (xlsx bytes).
function makeGraphFetch(xlsx: Uint8Array): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/v2/connection")) {
      return new Response(
        JSON.stringify({ items: [{ settings: { access_token: "fake-token" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("graph.microsoft.com")) {
      return new Response(xlsx, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

// Restore connector env after each test that mutates it.
function withConnectorEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevHost = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const prevId = process.env.REPL_IDENTITY;
  process.env.REPLIT_CONNECTORS_HOSTNAME = "connectors.example.com";
  process.env.REPL_IDENTITY = "test-identity";
  return fn().finally(() => {
    if (prevHost === undefined) delete process.env.REPLIT_CONNECTORS_HOSTNAME;
    else process.env.REPLIT_CONNECTORS_HOSTNAME = prevHost;
    if (prevId === undefined) delete process.env.REPL_IDENTITY;
    else process.env.REPL_IDENTITY = prevId;
  });
}

// ----- tests -----

test("fetchMicrosoftXlsxBytes downloads drive item bytes via Graph", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    const bytes = await fetchMicrosoftXlsxBytes(
      { sourceType: "excel_onedrive", microsoftAuth: true, msDriveId: "d1", msItemId: "i1" },
      makeGraphFetch(xlsx),
    );
    // PK zip magic for a real .xlsx.
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });
});

test("fetchMicrosoftXlsxBytes resolves a share link when no driveId/itemId", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    const bytes = await fetchMicrosoftXlsxBytes(
      { sourceType: "sharepoint_excel", microsoftAuth: true, sourceUrl: "https://contoso.sharepoint.com/x" },
      makeGraphFetch(xlsx),
    );
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });
});

test("getMicrosoftConnectionStatus reports connected when a token is present", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    const status = await getMicrosoftConnectionStatus(makeGraphFetch(xlsx));
    assert.equal(status.connected, true);
    assert.ok(status.connectors.length > 0);
  });
});

test("getMicrosoftConnectionStatus reports disconnected when no connector env", async () => {
  const prevHost = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const prevId = process.env.REPL_IDENTITY;
  const prevRenew = process.env.WEB_REPL_RENEWAL;
  delete process.env.REPLIT_CONNECTORS_HOSTNAME;
  delete process.env.REPL_IDENTITY;
  delete process.env.WEB_REPL_RENEWAL;
  try {
    const status = await getMicrosoftConnectionStatus();
    assert.equal(status.connected, false);
    assert.equal(status.connectors.length, 0);
  } finally {
    if (prevHost !== undefined) process.env.REPLIT_CONNECTORS_HOSTNAME = prevHost;
    if (prevId !== undefined) process.env.REPL_IDENTITY = prevId;
    if (prevRenew !== undefined) process.env.WEB_REPL_RENEWAL = prevRenew;
  }
});

test("resolveShareLink throws MicrosoftNotConnectedError when no token", async () => {
  const prevHost = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const prevId = process.env.REPL_IDENTITY;
  const prevRenew = process.env.WEB_REPL_RENEWAL;
  delete process.env.REPLIT_CONNECTORS_HOSTNAME;
  delete process.env.REPL_IDENTITY;
  delete process.env.WEB_REPL_RENEWAL;
  try {
    await assert.rejects(
      () => resolveShareLink("https://contoso.sharepoint.com/x"),
      (err: unknown) => err instanceof MicrosoftNotConnectedError,
    );
  } finally {
    if (prevHost !== undefined) process.env.REPLIT_CONNECTORS_HOSTNAME = prevHost;
    if (prevId !== undefined) process.env.REPL_IDENTITY = prevId;
    if (prevRenew !== undefined) process.env.WEB_REPL_RENEWAL = prevRenew;
  }
});

test("runAgendaSync uses graphFetch for a Microsoft-backed source", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig();
  const s = makeStubStorage(cfg);
  let graphCalled = false;
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => {
      graphCalled = true;
      return xlsx;
    },
  });
  assert.equal(graphCalled, true);
  assert.equal(r.ok, true);
  assert.equal(r.inserted, 1);
  assert.equal(s.items[0].title, "Keynote");
});

test("runAgendaSync records the connect-Microsoft message and removes nothing when not connected", async () => {
  const cfg = msConfig();
  const existing: AgendaItem = {
    id: "existing-1",
    clientId: "client-A",
    title: "Existing",
    description: null,
    room: null,
    track: null,
    presenter: null,
    startsAt: new Date("2026-06-02T09:00:00Z"),
    endsAt: new Date("2026-06-02T10:00:00Z"),
    status: "scheduled",
    statusMessage: null,
    externalSyncConfigId: "cfg-ms",
    externalId: "keep-1",
    manualOverride: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const s = makeStubStorage(cfg, [existing]);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => {
      throw new MicrosoftNotConnectedError();
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /Microsoft isn't connected/i);
  // Critical: nothing removed despite removeMissingItems=true.
  assert.equal(r.removed, 0);
  assert.equal(s.items.length, 1);
});

test("runAgendaSync fails when Graph returns non-xlsx bytes (no PK magic)", async () => {
  const cfg = msConfig();
  const s = makeStubStorage(cfg, []);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => new TextEncoder().encode("<html>sign in</html>"),
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /valid \.xlsx/i);
});

// Keep MICROSOFT_NOT_CONNECTED_MESSAGE referenced so its wording stays
// stable alongside the not-connected assertions above.
test("not-connected message is non-empty guidance", () => {
  assert.ok(MICROSOFT_NOT_CONNECTED_MESSAGE.length > 20);
});

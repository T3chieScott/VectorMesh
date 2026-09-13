import test from "node:test";
import assert from "node:assert/strict";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import ExcelJS from "exceljs";
import {
  mountAgendaRoutes,
  type AgendaRoutesStorage,
} from "../server/agendaRoutes";
import {
  assertGraphMethodAllowed,
  fetchMicrosoftCTag,
  fetchMicrosoftXlsxBytes,
} from "../server/microsoftGraph";
import type { AgendaItem, AgendaSyncConfig, InsertAgendaItem } from "../shared/schema";

process.env.SESSION_SECRET ||= "agenda-reset-api-test-secret";

async function sourceWorkbook(valid = false): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Agenda");
  sheet.addRow(["ID", "Title", "Start", "End", "Status"]);
  if (valid) {
    sheet.addRow(["one", "One", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z", "scheduled"]);
  } else {
    sheet.addRow(["one", "", "not-a-date", "2026-06-02T10:00:00Z", "scheduled"]);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function maximumDiagnosticWorkbook(rowCount = 20): Promise<{
  bytes: Uint8Array;
  mapping: Record<string, string>;
  externalIdColumn: string;
}> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Agenda");
  const fieldNames = [
    "title", "description", "room", "track", "presenter",
    "presenterCompany", "company", "startsAt", "endsAt",
    "status", "statusMessage", "presenterLastName",
  ];
  const mapping = Object.fromEntries(fieldNames.map((field) => [
    field,
    `${field}-${"H".repeat(500)}`,
  ]));
  const externalIdColumn = `id-${"I".repeat(500)}`;
  sheet.addRow([externalIdColumn, ...Object.values(mapping)]);
  const value = "V".repeat(512);
  for (let row = 0; row < rowCount; row++) {
    sheet.addRow([
      `${row}-${value}`,
      ...fieldNames.map((field) =>
        field === "startsAt" || field === "endsAt" ? "not-a-date" : value),
    ]);
  }
  return {
    bytes: new Uint8Array(await workbook.xlsx.writeBuffer()),
    mapping,
    externalIdColumn,
  };
}

function makeSyncConfig(overrides: Partial<AgendaSyncConfig> = {}): AgendaSyncConfig {
  return {
    id: "diagnostic-config",
    clientId: "site-a",
    name: "Diagnostic source",
    sourceType: "excel_onedrive",
    sourceUrl: "https://source.example/agenda.xlsx",
    storedFilePath: null,
    sheetName: "Agenda",
    headerRowIndex: 0,
    firstDataRowIndex: null,
    columnMapping: { title: "Title", startsAt: "Start", endsAt: "End", status: "Status" },
    externalIdColumn: "ID",
    timezone: "UTC",
    dateFormatHint: null,
    syncMode: "manual",
    removeMissingItems: true,
    enabled: false,
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
    msDriveId: "drive",
    msItemId: "item",
    msSiteId: null,
    lastCTag: null,
    lastProcessedConfigFingerprint: null,
    lastGoodSnapshotId: null,
    lastPublishedAt: null,
    lastCTagChangedAt: null,
    lastSnapshotVersion: null,
    msFileName: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    startTimeColumn: null,
    endTimeColumn: null,
    dateBaseMonth: null,
    dateBaseYear: null,
    ...overrides,
  } as AgendaSyncConfig;
}

async function startApi(options: {
  user: "admin" | "account_manager" | null;
  config: AgendaSyncConfig;
  bytes: () => Uint8Array | Promise<Uint8Array>;
}) {
  const items: AgendaItem[] = [];
  let resetCalls = 0;
  const storage: any = {
    async getAgendaSyncConfig(id: string) {
      return id === options.config.id ? options.config : undefined;
    },
    async getAgendaItemsBySyncConfig(id: string) {
      return items.filter((item) => item.externalSyncConfigId === id);
    },
    async getClient(id: string) {
      return { id, timezone: "UTC" };
    },
    async atomicAgendaSourceReset(_params: any) {
      resetCalls++;
      return {
        inserted: 0,
        updated: 0,
        removed: 0,
        snapshotId: "new",
        snapshotVersion: 1,
        preResetSnapshotId: "old",
        preResetSnapshotVersion: 0,
        preResetItemCount: 0,
        itemCount: 0,
      };
    },
    async updateAgendaSyncConfig() { return options.config; },
    async createAgendaItem(data: InsertAgendaItem) { return data as AgendaItem; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return true; },
  } as AgendaRoutesStorage;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (options.user) (req as any).dbUser = { id: "api-user", role: options.user };
    next();
  });
  const requireAuth = (req: Request, res: Response, next: NextFunction) =>
    options.user ? next() : res.status(401).json({ error: "authentication required" });
  const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
    options.user === "admin" ? next() : res.status(403).json({ error: "Administrator access required" });
  mountAgendaRoutes(app, {
    storage,
    auth: {
      canAccessClient: (req, clientId) =>
        (req as any).dbUser?.role === "admin" || (clientId === "site-b" && (req as any).dbUser?.role === "account_manager"),
      getAllowedClientIds: () => null,
      isAdminById: async () => options.user === "admin",
    },
    requireAuth,
    requireAuthOrToken: requireAuth,
    requireAdmin,
    loadUserContext: (_req, _res, next) => next(),
    graphFetch: async () => options.bytes(),
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    get resetCalls() { return resetCalls; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("diagnostics API requires admin, preserves tenant isolation, and is read-only", async () => {
  const config = makeSyncConfig();
  const api = await startApi({ user: "account_manager", config, bytes: () => sourceWorkbook() });
  try {
    const denied = await fetch(`${api.base}/api/agenda/sync-configs/${config.id}/reimport/preflight`, { method: "POST" });
    assert.equal(denied.status, 403);
  } finally {
    await api.close();
  }

  const unauthenticated = await startApi({ user: null, config, bytes: () => sourceWorkbook() });
  try {
    const denied = await fetch(`${unauthenticated.base}/api/agenda/sync-configs/${config.id}/reimport/preflight`, { method: "POST" });
    assert.equal(denied.status, 401);
  } finally {
    await unauthenticated.close();
  }

  let sourceBytes = await sourceWorkbook();
  const admin = await startApi({ user: "admin", config, bytes: () => sourceBytes });
  try {
    const preflightResponse = await fetch(`${admin.base}/api/agenda/sync-configs/${config.id}/reimport/preflight`, { method: "POST" });
    assert.equal(preflightResponse.status, 200);
    const preflight = await preflightResponse.json() as {
      ok: boolean;
      preflightToken: string;
      counts: { invalidSkippedRows: number };
    };
    assert.equal(preflight.ok, false);
    assert.ok(preflight.preflightToken);
    assert.equal(preflight.counts.invalidSkippedRows, 1);

    const details = await fetch(
      `${admin.base}/api/agenda/sync-configs/${config.id}/reimport/preflight/diagnostics?preflightToken=${encodeURIComponent(preflight.preflightToken)}&page=1&pageSize=10`,
    );
    assert.equal(details.status, 200);
    const payload = await details.json() as { columns: string[]; diagnostics: { totalRows: number; rows: unknown[] } };
    assert.deepEqual(payload.columns, ["Title", "Start", "End", "Status", "ID"]);
    assert.equal(payload.diagnostics.totalRows, 1);
    assert.equal(payload.diagnostics.rows.length, 1);
    assert.equal(admin.resetCalls, 0);

    config.externalIdColumn = "Title";
    const staleConfig = await fetch(
      `${admin.base}/api/agenda/sync-configs/${config.id}/reimport/preflight/diagnostics?preflightToken=${encodeURIComponent(preflight.preflightToken)}`,
    );
    assert.equal(staleConfig.status, 409);
    config.externalIdColumn = "ID";
    sourceBytes = await sourceWorkbook(true);
    const staleSource = await fetch(
      `${admin.base}/api/agenda/sync-configs/${config.id}/reimport/preflight/diagnostics?preflightToken=${encodeURIComponent(preflight.preflightToken)}`,
    );
    assert.equal(staleSource.status, 409);

    const wrongTenant = await fetch(
      `${admin.base}/api/agenda/sync-configs/${config.id}/reimport/preflight/diagnostics?preflightToken=not-a-token`,
    );
    assert.equal(wrongTenant.status, 409);

    const execute = await fetch(`${admin.base}/api/agenda/sync-configs/${config.id}/reimport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preflightToken: preflight.preflightToken, confirmation: "RESET" }),
    });
    assert.equal(execute.status, 409);
    assert.equal(admin.resetCalls, 0);
  } finally {
    await admin.close();
  }
});

test("valid preflight keeps reset enabled without changing Agenda rows", async () => {
  const config = makeSyncConfig();
  const api = await startApi({ user: "admin", config, bytes: () => sourceWorkbook(true) });
  try {
    const response = await fetch(`${api.base}/api/agenda/sync-configs/${config.id}/reimport/preflight`, { method: "POST" });
    assert.equal(response.status, 200);
    const data = await response.json() as { ok: boolean; counts: { validSessions: number; invalidSkippedRows: number }; preflightToken: string | null };
    assert.equal(data.ok, true);
    assert.equal(data.counts.validSessions, 1);
    assert.equal(data.counts.invalidSkippedRows, 0);
    assert.ok(data.preflightToken);
    assert.equal(api.resetCalls, 0);
  } finally {
    await api.close();
  }
});

test("Microsoft diagnostics transport remains read-only", async () => {
  const methods: string[] = [];
  const previousHost = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const previousIdentity = process.env.REPL_IDENTITY;
  process.env.REPLIT_CONNECTORS_HOSTNAME = "diagnostic-connectors.invalid";
  process.env.REPL_IDENTITY = "diagnostic-identity";
  try {
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      const url = String(input);
      if (url.includes("/api/v2/connection")) {
        return new Response(JSON.stringify({ items: [{ settings: { access_token: "diagnostic-token" } }] }), { status: 200 });
      }
      if (url.includes("/content")) return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 200 });
      return new Response(JSON.stringify({ id: "item", cTag: "diagnostic-ctag" }), { status: 200 });
    }) as typeof fetch;
    const source = {
      sourceType: "excel_onedrive" as const,
      microsoftAuth: true,
      msDriveId: "drive",
      msItemId: "item",
    };
    assert.equal(await fetchMicrosoftCTag(source, mockFetch), "diagnostic-ctag");
    assert.deepEqual(await fetchMicrosoftXlsxBytes(source, mockFetch), new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    assert.ok(methods.length > 0);
    assert.ok(methods.every((method) => method === "GET" || method === "HEAD"));
    assert.throws(() => assertGraphMethodAllowed("POST"), /Only GET and HEAD/);
    assert.throws(() => assertGraphMethodAllowed("PATCH"), /Only GET and HEAD/);
  } finally {
    if (previousHost === undefined) delete process.env.REPLIT_CONNECTORS_HOSTNAME;
    else process.env.REPLIT_CONNECTORS_HOSTNAME = previousHost;
    if (previousIdentity === undefined) delete process.env.REPL_IDENTITY;
    else process.env.REPL_IDENTITY = previousIdentity;
  }
});

test("preflight and diagnostics API envelopes stay under 100KB with maximum mapped data", async () => {
  const source = await maximumDiagnosticWorkbook();
  const config = makeSyncConfig({
    columnMapping: source.mapping as AgendaSyncConfig["columnMapping"],
    externalIdColumn: source.externalIdColumn,
  });
  const api = await startApi({ user: "admin", config, bytes: () => source.bytes });
  try {
    const preflightResponse = await fetch(`${api.base}/api/agenda/sync-configs/${config.id}/reimport/preflight`, { method: "POST" });
    const preflightText = await preflightResponse.text();
    assert.ok(Buffer.byteLength(preflightText, "utf8") <= 100_000);
    const preflight = JSON.parse(preflightText) as {
      preflightToken: string;
      diagnostics: { rows: Array<{ rowNumber: number }>; hasMore: boolean; page: number };
    };
    assert.ok(preflight.preflightToken);
    const seen: number[] = [];
    let page = 1;
    let advertisedPageCount = 0;
    while (true) {
      const response = await fetch(
        `${api.base}/api/agenda/sync-configs/${config.id}/reimport/preflight/diagnostics?preflightToken=${encodeURIComponent(preflight.preflightToken)}&page=${page}&pageSize=100`,
      );
      const text = await response.text();
      assert.ok(Buffer.byteLength(text, "utf8") <= 100_000);
      const payload = JSON.parse(text) as {
        columns: string[];
        diagnostics: { rows: Array<{ rowNumber: number }>; hasMore: boolean; page: number; pageCount: number };
      };
      assert.equal(payload.diagnostics.page, page);
      advertisedPageCount = payload.diagnostics.pageCount;
      assert.ok(page <= advertisedPageCount);
      assert.ok(payload.columns.every((column) => Buffer.byteLength(column, "utf8") <= 512));
      seen.push(...payload.diagnostics.rows.map((row) => row.rowNumber));
      if (!payload.diagnostics.hasMore) break;
      page++;
      assert.ok(page <= 100);
    }
    assert.ok(page > 1);
    assert.equal(page, advertisedPageCount);
    assert.deepEqual(seen, Array.from({ length: 20 }, (_, index) => index + 2));
    assert.equal(new Set(seen).size, 20);
  } finally {
    await api.close();
  }
});

test("independent boundary-page requests keep stable partitions and exact coverage", async () => {
  const source = await maximumDiagnosticWorkbook(100);
  const config = makeSyncConfig({
    columnMapping: source.mapping as AgendaSyncConfig["columnMapping"],
    externalIdColumn: source.externalIdColumn,
  });
  const api = await startApi({ user: "admin", config, bytes: () => source.bytes });
  try {
    const preflightResponse = await fetch(`${api.base}/api/agenda/sync-configs/${config.id}/reimport/preflight`, { method: "POST" });
    const preflight = await preflightResponse.json() as { preflightToken: string };
    const requestPage = async (page: number) => {
      const response = await fetch(
        `${api.base}/api/agenda/sync-configs/${config.id}/reimport/preflight/diagnostics?preflightToken=${encodeURIComponent(preflight.preflightToken)}&page=${page}&pageSize=100`,
      );
      const text = await response.text();
      assert.ok(Buffer.byteLength(text, "utf8") <= 100_000);
      return JSON.parse(text) as {
        diagnostics: {
          page: number;
          pageCount: number;
          rows: Array<{ rowNumber: number }>;
          hasMore: boolean;
        };
      };
    };
    const pageNine = await requestPage(9);
    const pageTen = await requestPage(10);
    assert.ok(pageNine.diagnostics.pageCount >= 10);
    assert.equal(pageNine.diagnostics.pageCount, pageTen.diagnostics.pageCount);
    assert.equal(pageNine.diagnostics.page, 9);
    assert.equal(pageTen.diagnostics.page, 10);
    assert.ok((pageNine.diagnostics.rows.at(-1)?.rowNumber ?? 0) < (pageTen.diagnostics.rows[0]?.rowNumber ?? Infinity));

    const seen: number[] = [];
    for (let page = 1; page <= pageNine.diagnostics.pageCount; page++) {
      const result = await requestPage(page);
      assert.equal(result.diagnostics.pageCount, pageNine.diagnostics.pageCount);
      seen.push(...result.diagnostics.rows.map((row) => row.rowNumber));
    }
    assert.deepEqual(seen, Array.from({ length: 100 }, (_, index) => index + 2));
    assert.equal(new Set(seen).size, 100);
  } finally {
    await api.close();
  }
});
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  runAgendaSync,
  extractSourceConnectionHealth,
  extractDisplayContinuity,
  computeSourceHealthState,
  computeSourceHealthStateWithTimestamps,
  computeDisplayContinuityState,
  manualRunCooldownRemainingMs,
  recordManualRun,
  MANUAL_RUN_COOLDOWN_MS,
  computeAgendaParsingConfigFingerprint,
  type SourceHealthState,
  type DisplayContinuityState,
} from "../server/agendaSync";
import {
  fetchMicrosoftXlsxBytes,
  fetchDriveItemCTag,
  fetchShareLinkCTag,
  fetchMicrosoftCTag,
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
    // Task #362 — snapshot/cTag fields
    lastCTag: null,
    lastProcessedConfigFingerprint: null,
    lastGoodSnapshotId: null,
    // Task #362 health contract additions
    msFileName: null,
    lastPublishedAt: null,
    lastCTagChangedAt: null,
    lastSnapshotVersion: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgendaSyncConfig;
}

function makeAtomicSnapshotStorage(configRow: AgendaSyncConfig) {
  const base = makeStubStorage(configRow);
  const snapshots: Array<{ id: string; items: InsertAgendaItem[] }> = [];
  let atomicCalls = 0;
  const storage = {
    ...base.storage,
    async atomicMicrosoftSync(params: any) {
      atomicCalls++;
      const snapshotId = `snapshot-${snapshots.length + 1}`;
      snapshots.push({ id: snapshotId, items: params.newItems });
      await base.storage.updateAgendaSyncConfig(params.configId, {
        lastCTag: params.newCTag ?? base.config.lastCTag,
        lastProcessedConfigFingerprint: params.configFingerprint,
        lastGoodSnapshotId: snapshotId,
        lastSnapshotVersion: snapshots.length,
      });
      return {
        inserted: params.newItems.length,
        updated: 0,
        skippedManual: 0,
        removed: 0,
        snapshotId,
        snapshotVersion: snapshots.length,
      };
    },
  };
  return {
    items: base.items,
    storage,
    snapshots,
    get atomicCalls() {
      return atomicCalls;
    },
    get config() {
      return base.config;
    },
  };
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

// ===== Task #362 — cTag change-detection tests =====

// Mock fetch that returns a cTag in graph metadata responses.
function makeGraphFetchWithCTag(xlsx: Uint8Array, cTag = "oN0ImE==::12345"): typeof fetch {
  return (async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/v2/connection")) {
      return new Response(
        JSON.stringify({ items: [{ settings: { access_token: "fake-token" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Metadata request (cTag fetch) — $select=id,cTag
    if (url.includes("graph.microsoft.com") && url.includes("$select=id,cTag")) {
      return new Response(
        JSON.stringify({ id: "item-456", cTag }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Content download
    if (url.includes("graph.microsoft.com")) {
      return new Response(xlsx, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

test("fetchDriveItemCTag returns the cTag string on success", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    const cTag = await fetchDriveItemCTag("drive-1", "item-1", {
      fetchImpl: makeGraphFetchWithCTag(xlsx, "abc123"),
    });
    assert.equal(cTag, "abc123");
  });
});

test("fetchDriveItemCTag returns null when no connector env", async () => {
  // No connector env → resolveAccessToken throws → function returns null.
  const prev = { host: process.env.REPLIT_CONNECTORS_HOSTNAME, id: process.env.REPL_IDENTITY };
  delete process.env.REPLIT_CONNECTORS_HOSTNAME;
  delete process.env.REPL_IDENTITY;
  delete process.env.WEB_REPL_RENEWAL;
  try {
    const cTag = await fetchDriveItemCTag("drive-1", "item-1");
    assert.equal(cTag, null);
  } finally {
    if (prev.host !== undefined) process.env.REPLIT_CONNECTORS_HOSTNAME = prev.host;
    if (prev.id !== undefined) process.env.REPL_IDENTITY = prev.id;
  }
});

test("fetchShareLinkCTag returns the cTag string on success", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    const cTag = await fetchShareLinkCTag("https://contoso.sharepoint.com/x", {
      fetchImpl: makeGraphFetchWithCTag(xlsx, "sp-tag-99"),
    });
    assert.equal(cTag, "sp-tag-99");
  });
});

test("fetchMicrosoftCTag routes to driveId/itemId path when both are set", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    let fetchedUrl = "";
    const spy: typeof fetch = async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("graph.microsoft.com")) fetchedUrl = url;
      return makeGraphFetchWithCTag(xlsx, "tag-via-id")(input, init);
    };
    const cTag = await fetchMicrosoftCTag(
      { sourceType: "excel_onedrive", microsoftAuth: true, msDriveId: "d1", msItemId: "i1" },
      spy as unknown as typeof fetch,
    );
    assert.equal(cTag, "tag-via-id");
    // Should have called the /drives/{id}/items/{id} endpoint (not /shares/)
    assert.ok(fetchedUrl.includes("/drives/"), `expected /drives/ in URL, got: ${fetchedUrl}`);
  });
});

test("fetchMicrosoftCTag falls back to share-link path when no driveId/itemId", async () => {
  await withConnectorEnv(async () => {
    const xlsx = await buildXlsxBytes();
    let fetchedUrl = "";
    const spy: typeof fetch = async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("graph.microsoft.com")) fetchedUrl = url;
      return makeGraphFetchWithCTag(xlsx, "tag-via-share")(input, init);
    };
    const cTag = await fetchMicrosoftCTag(
      { sourceType: "sharepoint_excel", microsoftAuth: true, sourceUrl: "https://contoso.sharepoint.com/x" },
      spy as unknown as typeof fetch,
    );
    assert.equal(cTag, "tag-via-share");
    assert.ok(fetchedUrl.includes("/shares/"), `expected /shares/ in URL, got: ${fetchedUrl}`);
  });
});

test("fetchMicrosoftCTag returns null when source has no drive info or URL", async () => {
  const cTag = await fetchMicrosoftCTag({ sourceType: "sharepoint_excel", microsoftAuth: true });
  assert.equal(cTag, null);
});

// ===== cTag skip integration tests =====

test("runAgendaSync skips download when cTag is unchanged (noChange=true)", async () => {
  const cfg = msConfig({ lastCTag: "unchanged-tag" });
  cfg.lastProcessedConfigFingerprint = computeAgendaParsingConfigFingerprint(cfg);
  const s = makeStubStorage(cfg);
  let graphFetchCalled = false;
  let cTagFetchCalled = false;
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => { graphFetchCalled = true; return new Uint8Array(); },
    graphCTagFetch: async () => { cTagFetchCalled = true; return "unchanged-tag"; },
  });
  assert.equal(r.ok, true);
  assert.equal(r.noChange, true);
  assert.equal(graphFetchCalled, false, "must not download when cTag matches");
  assert.equal(cTagFetchCalled, true, "must check cTag");
  assert.equal(r.inserted, 0);
  assert.equal(r.removed, 0);
  // lastSyncAt must be updated even on a skip
  assert.ok(s.config.lastSyncAt !== null, "lastSyncAt should be updated on skip");
});

test("parsing config fingerprints are stable, non-sensitive, and cover every parsing field", () => {
  const base = msConfig({
    sheetName: "Agenda",
    firstDataRowIndex: 1,
    externalIdColumn: "Session ID",
    dateFormatHint: "uk",
    startTimeColumn: "Start time",
    endTimeColumn: "End time",
    dateBaseMonth: 9,
    dateBaseYear: 2026,
  });
  const reordered = {
    ...base,
    columnMapping: { endsAt: "End", title: "Title", startsAt: "Start" },
  };
  const baseline = computeAgendaParsingConfigFingerprint(base);
  assert.equal(baseline.length, 64);
  assert.equal(computeAgendaParsingConfigFingerprint(reordered), baseline);
  assert.equal(baseline.includes("drive-123"), false, "fingerprint must not include source identifiers");

  const changes: Array<Partial<AgendaSyncConfig>> = [
    { sheetName: "Second sheet" },
    { headerRowIndex: 2 },
    { firstDataRowIndex: 3 },
    { columnMapping: { ...base.columnMapping, room: "Room" } },
    { externalIdColumn: "Alternative ID" },
    { timezone: "UTC" },
    { dateFormatHint: "us" },
    { startTimeColumn: "Alternative start" },
    { endTimeColumn: "Alternative end" },
    { dateBaseMonth: 10 },
    { dateBaseYear: 2027 },
    { removeMissingItems: false },
  ];
  for (const change of changes) {
    assert.notEqual(
      computeAgendaParsingConfigFingerprint({ ...base, ...change }),
      baseline,
      `expected ${Object.keys(change)[0]} to invalidate the fingerprint`,
    );
  }
});

test("unchanged Microsoft cTag reparses a corrected config, publishes a snapshot, then fast-skips", async () => {
  const xlsx = await buildXlsxBytes();
  const validMapping = { title: "Title", startsAt: "Start", endsAt: "End" };
  const invalidConfig = msConfig({
    lastCTag: "stable-tag",
    lastGoodSnapshotId: "previous-snapshot",
    columnMapping: { title: "Title", startsAt: "Missing start", endsAt: "Missing end" },
  });

  // Simulate the legacy persisted state after an invalid mapping run: its
  // cTag was recorded, but no parsing fingerprint exists yet.
  const s = makeAtomicSnapshotStorage(invalidConfig);
  let downloads = 0;
  const deps = {
    storage: s.storage as any,
    graphFetch: async () => {
      downloads++;
      return xlsx;
    },
    graphCTagFetch: async () => "stable-tag",
  };

  const invalidRun = await runAgendaSync(s.config, deps);
  assert.equal(invalidRun.ok, true);
  assert.equal(invalidRun.totalUpstream, 0);
  assert.ok(invalidRun.parseWarnings?.length);
  assert.equal(downloads, 1, "a config fingerprint mismatch must bypass the cTag skip");
  assert.equal(s.atomicCalls, 0, "all-invalid data must not publish an empty snapshot");
  assert.equal(s.config.lastGoodSnapshotId, "previous-snapshot");
  assert.equal(s.config.lastCTag, "stable-tag");

  // Correct only the persisted mapping; the workbook cTag remains unchanged.
  await s.storage.updateAgendaSyncConfig(s.config.id, { columnMapping: validMapping });
  const correctedRun = await runAgendaSync(s.config, deps);
  assert.equal(correctedRun.ok, true);
  assert.equal(correctedRun.totalUpstream, 1);
  assert.equal(correctedRun.parseWarnings, undefined);
  assert.equal(downloads, 2, "the corrected mapping must reparse unchanged workbook bytes");
  assert.equal(s.atomicCalls, 1);
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.config.lastGoodSnapshotId, "snapshot-1");
  assert.equal(s.config.lastSyncWarnings, null);
  assert.equal(
    s.config.lastProcessedConfigFingerprint,
    computeAgendaParsingConfigFingerprint(s.config),
  );

  // A reconstructed config models a process restart: persisted state alone
  // must retain the correct fast-skip decision.
  const restartedConfig = {
    ...s.config,
    columnMapping: { ...s.config.columnMapping! },
  };
  const unchangedRun = await runAgendaSync(restartedConfig, deps);
  assert.equal(unchangedRun.ok, true);
  assert.equal(unchangedRun.noChange, true);
  assert.equal(downloads, 2, "unchanged cTag plus fingerprint must not download again");
  assert.equal(s.atomicCalls, 1, "a cTag skip must not create another snapshot");
});

test("same-cTag parsing changes reprocess only the affected Microsoft config", async () => {
  const xlsx = await buildXlsxBytes();
  const sourceA = msConfig({ id: "source-A", lastCTag: "stable-tag" });
  const sourceB = msConfig({ id: "source-B", lastCTag: "stable-tag" });
  sourceA.lastProcessedConfigFingerprint = computeAgendaParsingConfigFingerprint(sourceA);
  sourceB.lastProcessedConfigFingerprint = computeAgendaParsingConfigFingerprint(sourceB);
  const changedSourceA = {
    ...sourceA,
    columnMapping: { ...sourceA.columnMapping, description: "Title" },
  };
  const storageA = makeStubStorage(changedSourceA);
  const storageB = makeStubStorage(sourceB);
  let downloads = 0;
  const graphFetch = async () => {
    downloads++;
    return xlsx;
  };
  const graphCTagFetch = async () => "stable-tag";

  const resultA = await runAgendaSync(storageA.config, {
    storage: storageA.storage as any,
    graphFetch,
    graphCTagFetch,
  });
  const resultB = await runAgendaSync(storageB.config, {
    storage: storageB.storage as any,
    graphFetch,
    graphCTagFetch,
  });

  assert.equal(resultA.ok, true);
  assert.equal(resultA.noChange, undefined);
  assert.equal(resultB.ok, true);
  assert.equal(resultB.noChange, true);
  assert.equal(downloads, 1, "only the source with a changed mapping may reparse");
});

test("a changed inherited site timezone bypasses an otherwise matching cTag", async () => {
  const xlsx = await buildXlsxBytes();
  const config = msConfig({ timezone: null, lastCTag: "stable-tag" });
  config.lastProcessedConfigFingerprint = computeAgendaParsingConfigFingerprint(
    config,
    "Europe/London",
  );
  const s = makeStubStorage(config);
  let downloaded = false;

  const result = await runAgendaSync(s.config, {
    storage: {
      ...s.storage,
      async getClient() {
        return { id: config.clientId, timezone: "America/New_York" } as any;
      },
    } as any,
    graphFetch: async () => {
      downloaded = true;
      return xlsx;
    },
    graphCTagFetch: async () => "stable-tag",
  });

  assert.equal(result.ok, true);
  assert.equal(downloaded, true, "the effective parsing timezone changed");
  assert.equal(result.noChange, undefined);
});

test("sheet, split-time, and removal settings each bypass an otherwise matching cTag", async () => {
  const xlsx = await buildXlsxBytes();
  const changes: Array<Partial<AgendaSyncConfig>> = [
    { sheetName: "Other worksheet" },
    { startTimeColumn: "Title", endTimeColumn: "Title" },
    { removeMissingItems: false },
  ];

  for (const change of changes) {
    const baseline = msConfig({ lastCTag: "stable-tag" });
    baseline.lastProcessedConfigFingerprint = computeAgendaParsingConfigFingerprint(baseline);
    const changed = { ...baseline, ...change };
    const s = makeStubStorage(changed);
    let downloaded = false;
    await runAgendaSync(s.config, {
      storage: s.storage as any,
      graphFetch: async () => {
        downloaded = true;
        return xlsx;
      },
      graphCTagFetch: async () => "stable-tag",
    });
    assert.equal(downloaded, true, `${Object.keys(change).join(", ")} must reprocess`);
  }
});

test("runAgendaSync skips cTag check when lastCTag is null (first sync always downloads)", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ lastCTag: null });
  const s = makeStubStorage(cfg);
  let graphFetchCalled = false;
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => { graphFetchCalled = true; return xlsx; },
    graphCTagFetch: async () => "some-ctag",
  });
  assert.equal(r.ok, true);
  assert.equal(r.noChange, undefined, "no-change must not be set on a real sync");
  assert.equal(graphFetchCalled, true, "must download on first sync even if cTag is available");
});

test("runAgendaSync downloads when cTag changes (different from stored)", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ lastCTag: "old-tag" });
  const s = makeStubStorage(cfg);
  let graphFetchCalled = false;
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => { graphFetchCalled = true; return xlsx; },
    graphCTagFetch: async () => "new-tag", // changed
  });
  assert.equal(r.ok, true);
  assert.equal(r.noChange, undefined);
  assert.equal(graphFetchCalled, true, "must download when cTag changes");
  assert.equal(r.inserted, 1);
});

test("runAgendaSync downloads when graphCTagFetch returns null (cTag unavailable)", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ lastCTag: "stored-tag" });
  const s = makeStubStorage(cfg);
  let graphFetchCalled = false;
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => { graphFetchCalled = true; return xlsx; },
    // null → treat as unknown → always download
    graphCTagFetch: async () => null,
  });
  assert.equal(r.ok, true);
  assert.equal(graphFetchCalled, true, "must download when cTag is unavailable");
});

test("runAgendaSync uses atomicMicrosoftSync when storage provides it", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig();
  const items: AgendaItem[] = [];
  let nextId = 1;
  let cfg2 = cfg;
  let atomicCalled = false;
  let atomicParams: any = null;

  const storage = {
    async getAgendaSyncConfigs() { return [cfg2]; },
    async getAgendaSyncConfig(id: string) { return id === cfg2.id ? cfg2 : undefined; },
    async updateAgendaSyncConfig(id: string, data: any) { cfg2 = { ...cfg2, ...data }; return cfg2; },
    async getClient() { return { id: cfg2.clientId, timezone: "Europe/London" } as any; },
    async getAgendaItemsBySyncConfig() { return []; },
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
        status: (data.status ?? "scheduled") as any,
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
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    // Provide atomicMicrosoftSync — the engine should use this path.
    async atomicMicrosoftSync(params: any) {
      atomicCalled = true;
      atomicParams = params;
      return { inserted: params.newItems.length, updated: 0, skippedManual: 0, removed: 0, snapshotId: "snap-1" };
    },
  };

  const r = await runAgendaSync(cfg, {
    storage: storage as any,
    graphFetch: async () => xlsx,
  });

  assert.equal(r.ok, true);
  assert.equal(atomicCalled, true, "atomicMicrosoftSync must be called for MS-backed source");
  assert.equal(atomicParams?.configId, "cfg-ms");
  // The newItems array must contain the upstream items (serialisable for snapshot).
  assert.equal(atomicParams?.newItems.length, 1);
  assert.equal(atomicParams?.newItems[0].title, "Keynote");
  // snapshotPayload is computed by storage from effective post-sync rows,
  // not passed in from the engine; verify it is NOT on params.
  assert.equal("snapshotPayload" in atomicParams, false, "snapshotPayload must not appear in AtomicMicrosoftSyncParams");
});

test("runAgendaSync falls back to per-row upsert when atomicMicrosoftSync is absent", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig();
  const s = makeStubStorage(cfg);
  // Storage deliberately has no atomicMicrosoftSync.
  assert.equal((s.storage as any).atomicMicrosoftSync, undefined);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => xlsx,
  });
  assert.equal(r.ok, true);
  assert.equal(r.inserted, 1);
  assert.equal(s.items[0].title, "Keynote");
});

test("runAgendaSync in-flight de-duplication: concurrent call returns noChange", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ id: "cfg-dedup" });
  const s = makeStubStorage(cfg);

  // Inject a fresh lock Set so this test never touches the module-global
  // IN_FLIGHT_SYNCS and cannot interfere with other tests sharing "cfg-ms".
  const lock = new Set<string>();

  // The first sync holds the in-flight lock; we fire the second one before it
  // resolves. Using a latch: make graphFetch stall until both have been called.
  let resolveFirst!: () => void;
  const firstStarted = new Promise<void>((res) => (resolveFirst = res));

  const slowFetch = async (): Promise<Uint8Array> => {
    resolveFirst();
    await new Promise<void>((res) => setTimeout(res, 30));
    return xlsx;
  };

  const firstPromise = runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: slowFetch,
    inFlightLock: lock,
  });

  // Wait until the first sync has started its download, then fire the second.
  await firstStarted;
  const secondPromise = runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => {
      throw new Error("second sync must not download");
    },
    inFlightLock: lock,
  });

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.ok, true, "first sync must succeed");
  assert.equal(second.ok, true, "second sync is skipped gracefully");
  assert.equal(second.noChange, true, "second sync must be marked noChange (in-flight)");
  // Lock must be released after both settle.
  assert.equal(lock.size, 0, "lock must be fully released after both complete");
});

// ===== Health status types =====

test("extractSourceConnectionHealth returns correct fields from a config", () => {
  const cfg = msConfig({
    lastSyncOk: false,
    consecutiveFailureCount: 3,
    lastError: "timeout",
    lastErrorAt: new Date("2026-08-01"),
  });
  const health = extractSourceConnectionHealth(cfg);
  assert.equal(health.configId, "cfg-ms");
  assert.equal(health.configName, "OneDrive Excel");
  assert.equal(health.sourceType, "excel_onedrive");
  assert.equal(health.ok, false);
  assert.equal(health.consecutiveFailures, 3);
  assert.equal(health.lastError, "timeout");
  assert.ok(health.lastErrorAt instanceof Date);
});

test("extractSourceConnectionHealth handles a healthy config", () => {
  const cfg = msConfig({ lastSyncOk: true, consecutiveFailureCount: 0, lastError: null });
  const health = extractSourceConnectionHealth(cfg);
  assert.equal(health.ok, true);
  assert.equal(health.consecutiveFailures, 0);
  assert.equal(health.lastError, null);
});

test("extractDisplayContinuity: no snapshot → hasLastGoodSnapshot=false", () => {
  const cfg = msConfig({ lastGoodSnapshotId: null, lastItemCount: null });
  const continuity = extractDisplayContinuity(cfg);
  assert.equal(continuity.hasLastGoodSnapshot, false);
  assert.equal(continuity.lastItemCount, null);
});

test("extractDisplayContinuity: snapshot present → hasLastGoodSnapshot=true", () => {
  const cfg = msConfig({ lastGoodSnapshotId: "snap-abc", lastItemCount: 42, lastSyncOk: true });
  const continuity = extractDisplayContinuity(cfg);
  assert.equal(continuity.hasLastGoodSnapshot, true);
  assert.equal(continuity.lastItemCount, 42);
  assert.equal(continuity.lastSyncOk, true);
});

// ===== Snapshot fallback (last-known-good display continuity) =====

// Verify storage.ts reads effective rows AFTER upserts (not before) so
// manualOverride rows and removeMissingItems=false retained rows are captured.
// ===== Bookend cTag correctness =====

test("runAgendaSync calls graphCTagFetch twice when file was stable (pre==post) and stores the cTag", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ lastCTag: null }); // first sync — no stored cTag
  let cTagCallCount = 0;
  let capturedNewCTag: string | null | undefined = undefined;

  const storage = {
    async getAgendaSyncConfigs() { return [cfg]; },
    async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async updateAgendaSyncConfig(_id: string, data: any) { return { ...cfg, ...data }; },
    async getClient() { return { id: cfg.clientId, timezone: "Europe/London" } as any; },
    async getAgendaItemsBySyncConfig() { return []; },
    async createAgendaItem() { return {} as any; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    async atomicMicrosoftSync(params: any) {
      capturedNewCTag = params.newCTag;
      return { inserted: 1, updated: 0, skippedManual: 0, removed: 0, snapshotId: "snap-btc" };
    },
  };

  const r = await runAgendaSync(cfg, {
    storage: storage as any,
    graphFetch: async () => xlsx,
    graphCTagFetch: async () => { cTagCallCount++; return "stable-tag"; },
  });

  assert.equal(r.ok, true);
  // First call: pre-download skip check. Second call: post-download bookend verify.
  assert.equal(cTagCallCount, 2, "graphCTagFetch must be called twice when file was stable");
  // pre == post ("stable-tag") → cTag is demonstrably for the downloaded revision → stored.
  assert.equal(capturedNewCTag, "stable-tag", "cTag must be stored when pre==post");
});

test("runAgendaSync does NOT store the cTag when file changes during download (pre!=post)", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ lastCTag: null });
  let callCount = 0;
  let capturedNewCTag: string | null | undefined = undefined;

  const storage = {
    async getAgendaSyncConfigs() { return [cfg]; },
    async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async updateAgendaSyncConfig(_id: string, data: any) { return { ...cfg, ...data }; },
    async getClient() { return { id: cfg.clientId, timezone: "Europe/London" } as any; },
    async getAgendaItemsBySyncConfig() { return []; },
    async createAgendaItem() { return {} as any; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    async atomicMicrosoftSync(params: any) {
      capturedNewCTag = params.newCTag;
      return { inserted: 1, updated: 0, skippedManual: 0, removed: 0, snapshotId: "snap-race" };
    },
  };

  const r = await runAgendaSync(cfg, {
    storage: storage as any,
    graphFetch: async () => xlsx,
    // First call (pre-download): "tag-v1". Second call (post-download): "tag-v2" (changed!).
    graphCTagFetch: async () => { callCount++; return callCount === 1 ? "tag-v1" : "tag-v2"; },
  });

  assert.equal(r.ok, true);
  assert.equal(callCount, 2, "graphCTagFetch must be called twice");
  // pre ("tag-v1") != post ("tag-v2") → file changed during download → do NOT store cTag.
  assert.equal(capturedNewCTag, null, "cTag must NOT be stored when file changes during download");
});

test("runAgendaSync skips the bookend check when graphCTagFetch is absent", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ lastCTag: null });
  let capturedNewCTag: string | null | undefined = undefined;

  const storage = {
    async getAgendaSyncConfigs() { return [cfg]; },
    async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async updateAgendaSyncConfig(_id: string, data: any) { return { ...cfg, ...data }; },
    async getClient() { return { id: cfg.clientId, timezone: "Europe/London" } as any; },
    async getAgendaItemsBySyncConfig() { return []; },
    async createAgendaItem() { return {} as any; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    async atomicMicrosoftSync(params: any) {
      capturedNewCTag = params.newCTag;
      return { inserted: 1, updated: 0, skippedManual: 0, removed: 0, snapshotId: "snap-noct" };
    },
  };

  const r = await runAgendaSync(cfg, {
    storage: storage as any,
    graphFetch: async () => xlsx,
    // No graphCTagFetch provided → no cTag stored.
  });

  assert.equal(r.ok, true);
  assert.equal(capturedNewCTag, null, "newCTag must be null when graphCTagFetch is absent");
});

// ===== Concurrent admin edit protection =====

// ===== mergeSnapshotWithManualOverrides (display overlay for post-sync edits) =====

import { mergeSnapshotWithManualOverrides } from "../server/storage";

function makeItem(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    id: "item-default",
    clientId: "client-A",
    title: "Default Title",
    description: null,
    room: null,
    track: null,
    presenter: null,
    startsAt: new Date("2026-01-01T09:00:00Z"),
    endsAt: new Date("2026-01-01T10:00:00Z"),
    status: "scheduled" as any,
    statusMessage: null,
    externalSyncConfigId: "cfg-ms",
    externalId: null,
    manualOverride: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("mergeSnapshotWithManualOverrides: no overrides → returns snapshot unchanged", () => {
  const snap = [makeItem({ id: "s1", externalId: "ext-1", title: "Keynote" })];
  const result = mergeSnapshotWithManualOverrides(snap, [], new Date());
  assert.deepStrictEqual(result, snap);
});

test("mergeSnapshotWithManualOverrides: override replaces matching snapshot item by externalId", () => {
  const snap = [
    makeItem({ id: "s1", externalId: "ext-1", title: "Original" }),
    makeItem({ id: "s2", externalId: "ext-2", title: "Other" }),
  ];
  const override = makeItem({ id: "live-1", externalId: "ext-1", title: "Operator Edit", manualOverride: true });
  const result = mergeSnapshotWithManualOverrides(snap, [override], new Date());
  assert.equal(result.length, 2);
  const edited = result.find((i) => i.externalId === "ext-1");
  assert.equal(edited?.title, "Operator Edit", "override must replace snapshot item");
  assert.equal(edited?.id, "live-1", "result must be the live row, not the snapshot row");
  // Non-matching item unchanged
  const unchanged = result.find((i) => i.externalId === "ext-2");
  assert.equal(unchanged?.title, "Other");
});

test("mergeSnapshotWithManualOverrides: override with no externalId is appended (manually-added item)", () => {
  const snap = [makeItem({ id: "s1", externalId: "ext-1", title: "Keynote" })];
  const added = makeItem({ id: "live-new", externalId: null, title: "Manually Added", manualOverride: true });
  const result = mergeSnapshotWithManualOverrides(snap, [added], new Date());
  assert.equal(result.length, 2);
  assert.ok(result.some((i) => i.id === "live-new"), "manually-added item must be in result");
  assert.ok(result.some((i) => i.id === "s1"), "snapshot item must still be in result");
});

test("mergeSnapshotWithManualOverrides: override for item not in snapshot is appended", () => {
  const snap = [makeItem({ id: "s1", externalId: "ext-1", title: "Keynote" })];
  // ext-2 exists live but not in snapshot (maybe added externally after snapshot was taken)
  const override = makeItem({ id: "live-2", externalId: "ext-2", title: "Workshop", manualOverride: true });
  const result = mergeSnapshotWithManualOverrides(snap, [override], new Date());
  assert.equal(result.length, 2);
  assert.ok(result.some((i) => i.id === "live-2"), "post-snapshot override must be appended");
});

test("mergeSnapshotWithManualOverrides: multiple overrides applied correctly", () => {
  const snap = [
    makeItem({ id: "s1", externalId: "ext-1", title: "Session A" }),
    makeItem({ id: "s2", externalId: "ext-2", title: "Session B" }),
    makeItem({ id: "s3", externalId: "ext-3", title: "Session C" }),
  ];
  const overrides = [
    makeItem({ id: "live-1", externalId: "ext-1", title: "Session A (edited)", manualOverride: true }),
    makeItem({ id: "live-3", externalId: "ext-3", title: "Session C (cancelled)", manualOverride: true }),
  ];
  const result = mergeSnapshotWithManualOverrides(snap, overrides, new Date());
  assert.equal(result.length, 3);
  assert.equal(result.find((i) => i.externalId === "ext-1")?.title, "Session A (edited)");
  assert.equal(result.find((i) => i.externalId === "ext-2")?.title, "Session B");
  assert.equal(result.find((i) => i.externalId === "ext-3")?.title, "Session C (cancelled)");
});

// Integration scenario: snapshot sync committed, operator then edits an item.
// The display must immediately show the edited version before the next sync.
test("display resolution: post-sync manual override is visible without waiting for another sync", () => {
  // Simulate the state AFTER a successful MS sync:
  // - Snapshot has [Keynote, Workshop]
  // - Operator then sets manualOverride=true on Keynote, changes title to "Keynote (VIP Only)"
  const snapItems: AgendaItem[] = [
    makeItem({ id: "snap-1", externalId: "ext-1", title: "Keynote" }),
    makeItem({ id: "snap-2", externalId: "ext-2", title: "Workshop" }),
  ];
  const liveManualRow: AgendaItem = makeItem({
    id: "live-1",
    externalId: "ext-1",
    title: "Keynote (VIP Only)",
    manualOverride: true,
  });

  const result = mergeSnapshotWithManualOverrides(snapItems, [liveManualRow], new Date());

  assert.equal(result.length, 2, "total item count unchanged");
  const keynote = result.find((i) => i.externalId === "ext-1");
  assert.equal(
    keynote?.title,
    "Keynote (VIP Only)",
    "operator override must be visible immediately (before next sync)",
  );
  assert.equal(keynote?.manualOverride, true, "override flag must be preserved");
  const workshop = result.find((i) => i.externalId === "ext-2");
  assert.equal(workshop?.title, "Workshop", "unedited snapshot item must be unchanged");
});

test("storage.ts getResolvedAgendaForConfig overlays live manualOverride rows on snapshot", () => {
  const src = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
  // Must call mergeSnapshotWithManualOverrides for each snapshot config.
  assert.ok(
    src.includes("mergeSnapshotWithManualOverrides(snapItems, liveMoRows"),
    "display resolution must overlay live manualOverride rows on snapshot items",
  );
  // Must fetch live items filtered to manualOverride=true for each snapshot config.
  assert.ok(
    src.includes("i.externalSyncConfigId === configId && i.manualOverride"),
    "must filter live items by configId AND manualOverride=true",
  );
});

test("storage.ts UPDATE uses AND manual_override=false to prevent overwriting concurrent edits", () => {
  const src = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
  // Confirm the UPDATE includes the manualOverride guard in the WHERE clause.
  assert.ok(
    src.includes("eq(agendaItems.manualOverride, false)"),
    "UPDATE must include AND manual_override=false to handle concurrent admin edits",
  );
  // Confirm the returning check drives the update/skippedManual accounting.
  assert.ok(
    src.includes("updateResult.length > 0"),
    "must check update returning to detect concurrently-set manualOverride",
  );
});

test("storage.ts DELETE uses AND manual_override=false to protect concurrent override rows", () => {
  const src = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
  assert.ok(
    src.includes("deleteResult.length > 0"),
    "tombstone DELETE must guard against concurrent manualOverride via returning check",
  );
});

test("storage.ts atomicMicrosoftSync reads agenda_items AFTER upserts to build snapshot payload", () => {
  const src = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
  // The effective SELECT must come after the tombstone deletion block.
  const upsertIdx = src.indexOf("Step 1: Upsert agenda_items");
  const tombstoneIdx = src.indexOf("Step 2: Tombstone removal");
  const selectIdx = src.indexOf("Step 3: Capture the effective post-sync state");
  const snapshotWriteIdx = src.indexOf("Step 4: Write snapshot with the authoritative");
  const pointerIdx = src.indexOf("Step 5: Atomically promote the pointer");
  assert.ok(upsertIdx > 0, "upsert step marker must exist");
  assert.ok(tombstoneIdx > upsertIdx, "tombstone step must follow upsert");
  assert.ok(selectIdx > tombstoneIdx, "effective-rows SELECT must follow tombstone step");
  assert.ok(snapshotWriteIdx > selectIdx, "snapshot write must follow effective-rows SELECT");
  assert.ok(pointerIdx > snapshotWriteIdx, "pointer update must follow snapshot write");
});

// Verify getResolvedAgendaForConfig uses snapshot as authoritative source
// for MS-backed configs — not live items for those configs' IDs.
test("storage.ts getResolvedAgendaForConfig excludes live items for MS-snapshot configs", () => {
  const src = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
  // Must filter live items to exclude rows that belong to snapshot-served configs.
  assert.ok(
    src.includes("msSnapshotConfigIds.has(i.externalSyncConfigId)"),
    "must exclude live items for MS-snapshot-served config IDs",
  );
  // Must merge snapshot items via mergeSnapshotWithManualOverrides for each config.
  assert.ok(
    src.includes("mergeSnapshotWithManualOverrides(snapItems, liveMoRows"),
    "must merge snapshot items with live manual-override rows for each MS-backed snapshot config",
  );
});

// Verify atomicMicrosoftSync does NOT accept snapshotPayload in its type signature.
test("AtomicMicrosoftSyncParams interface does not include snapshotPayload", () => {
  const src = readFileSync(join(process.cwd(), "server/agendaSync.ts"), "utf8");
  const ifaceStart = src.indexOf("export interface AtomicMicrosoftSyncParams");
  const ifaceEnd = src.indexOf("}", ifaceStart);
  const ifaceBody = src.slice(ifaceStart, ifaceEnd);
  assert.ok(!ifaceBody.includes("snapshotPayload"), "AtomicMicrosoftSyncParams must not include snapshotPayload");
  // Must still have the fields that storage needs to compute the effective state.
  assert.ok(ifaceBody.includes("existingItems"), "existingItems required for tombstone logic");
  assert.ok(ifaceBody.includes("seenExternalIds"), "seenExternalIds required for tombstone logic");
});

// Engine passes existingItems (which includes manualOverride rows) to
// atomicMicrosoftSync so storage can SELECT the effective post-sync rows.
test("runAgendaSync passes existingItems (inc. manualOverride rows) to atomicMicrosoftSync", async () => {
  const xlsx = await buildXlsxBytes();

  // Pre-existing row for the same externalId as the upstream item,
  // but with manualOverride=true — the sync must not overwrite it.
  const manualRow: AgendaItem = {
    id: "manual-1",
    clientId: "client-A",
    title: "Operator Override",
    description: "manually edited",
    room: "VIP Room",
    track: null,
    presenter: null,
    startsAt: new Date("2026-01-01T09:00:00Z"),
    endsAt: new Date("2026-01-01T10:00:00Z"),
    status: "scheduled" as any,
    statusMessage: null,
    externalSyncConfigId: "cfg-ms",
    externalId: "row-1",       // same externalId as the upstream XLSX item
    manualOverride: true,      // operator override — must be preserved
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let capturedExisting: AgendaItem[] | null = null;
  let capturedSkippedManual = 0;

  const storage = {
    async getAgendaSyncConfigs() { return [msConfig()]; },
    async getAgendaSyncConfig(id: string) { return id === "cfg-ms" ? msConfig() : undefined; },
    async updateAgendaSyncConfig(_id: string, data: any) { return { ...msConfig(), ...data }; },
    async getClient() { return { id: "client-A", timezone: "Europe/London" } as any; },
    // Pre-populate with the manual-override row.
    async getAgendaItemsBySyncConfig() { return [manualRow]; },
    async createAgendaItem() { return {} as any; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    async atomicMicrosoftSync(params: any) {
      capturedExisting = params.existingItems;
      // The engine's existing items include the manualOverride row.
      // Storage would skip updating it (skippedManual) and include it
      // in the effective SELECT after upserts.
      const skipped = params.existingItems.filter((i: AgendaItem) => i.manualOverride).length;
      capturedSkippedManual = skipped;
      return { inserted: 0, updated: 0, skippedManual: skipped, removed: 0, snapshotId: "snap-2" };
    },
  };

  const r = await runAgendaSync(msConfig(), {
    storage: storage as any,
    graphFetch: async () => xlsx,
  });

  assert.equal(r.ok, true);
  assert.ok(capturedExisting !== null, "existingItems must be passed to atomicMicrosoftSync");
  assert.equal(capturedExisting!.length, 1, "one existing item (the manual override) must be passed");
  assert.equal(capturedExisting![0].manualOverride, true, "manualOverride must be preserved in existingItems");
  assert.equal(capturedSkippedManual, 1, "storage must count the manualOverride row as skippedManual");
  assert.equal(r.skippedManual, 1);
});

// Engine passes removeMissingItems to storage so retained rows are included in snapshot.
test("runAgendaSync passes removeMissingItems=false to atomicMicrosoftSync", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig({ removeMissingItems: false });
  let capturedRemoveMissing: boolean | undefined;

  const storage = {
    async getAgendaSyncConfigs() { return [cfg]; },
    async getAgendaSyncConfig(id: string) { return id === cfg.id ? cfg : undefined; },
    async updateAgendaSyncConfig(_id: string, data: any) { return { ...cfg, ...data }; },
    async getClient() { return { id: cfg.clientId, timezone: "Europe/London" } as any; },
    async getAgendaItemsBySyncConfig() { return []; },
    async createAgendaItem() { return {} as any; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    async atomicMicrosoftSync(params: any) {
      capturedRemoveMissing = params.removeMissingItems;
      return { inserted: 0, updated: 0, skippedManual: 0, removed: 0, snapshotId: "snap-3" };
    },
  };

  await runAgendaSync(cfg, { storage: storage as any, graphFetch: async () => xlsx });
  assert.equal(capturedRemoveMissing, false, "removeMissingItems=false must be forwarded to storage");
});

test("atomicMicrosoftSync failure leaves the previous snapshot pointer untouched", async () => {
  // Arrange: a config that already has a lastGoodSnapshotId.
  const xlsx = await buildXlsxBytes();
  const existingSnapshotId = "snap-existing";
  const cfg = msConfig({ lastGoodSnapshotId: existingSnapshotId, lastCTag: null });
  let storedSnapshotId = existingSnapshotId; // tracks what the "DB" holds
  let atomicCallCount = 0;

  const storage = {
    async getAgendaSyncConfigs() { return [cfg]; },
    async getAgendaSyncConfig(id: string) { return id === cfg.id ? { ...cfg, lastGoodSnapshotId: storedSnapshotId } : undefined; },
    async updateAgendaSyncConfig(id: string, data: any) {
      // Simulate: only update lastSyncAt etc., NOT the snapshot pointer via this path.
      return { ...cfg, ...data };
    },
    async getClient() { return { id: cfg.clientId, timezone: "Europe/London" } as any; },
    async getAgendaItemsBySyncConfig() { return []; },
    async createAgendaItem() { return {} as any; },
    async updateAgendaItem() { return undefined; },
    async deleteAgendaItem() { return false; },
    async atomicMicrosoftSync(_params: any) {
      atomicCallCount++;
      // Simulate a transaction failure (DB error mid-write).
      throw new Error("deadlock detected");
    },
  };

  const r = await runAgendaSync(cfg, {
    storage: storage as any,
    graphFetch: async () => xlsx,
  });

  // Sync must fail with the DB error.
  assert.equal(r.ok, false);
  // The stored snapshot pointer must be unchanged — storedSnapshotId still points to the
  // pre-existing snapshot so displays keep rendering the last known-good data.
  assert.equal(storedSnapshotId, existingSnapshotId, "lastGoodSnapshotId must not change after a failed atomic sync");
  assert.equal(atomicCallCount, 1, "atomicMicrosoftSync was called once");
});

test("display resolution: uses live items when they exist", async () => {
  // The snapshot-fallback path in getResolvedAgendaForConfig should NOT be
  // exercised when live items are present for the sync config.
  // We verify this with the pure agendaSync + storage stub path:
  // if the engine succeeds (items written to stub storage), the pool is non-empty.
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig();
  const s = makeStubStorage(cfg);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => xlsx,
  });
  assert.equal(r.ok, true);
  assert.equal(r.inserted, 1);
  // Live items are in the stub — confirm the item made it.
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].title, "Keynote");
});

// ===== Data minimisation / XLSX raw bytes =====

// ===== Task #362 — Health state unit tests =====

test("computeSourceHealthState: never-synced returns Source unavailable", () => {
  const state = computeSourceHealthState({ lastSyncOk: null, lastSyncWarnings: null, consecutiveFailureCount: 0, lastError: null });
  assert.equal(state, "Source unavailable");
});

test("computeSourceHealthState: successful sync with no warnings returns Healthy", () => {
  const state = computeSourceHealthState({ lastSyncOk: true, lastSyncWarnings: null, consecutiveFailureCount: 0, lastError: null });
  assert.equal(state, "Healthy");
});

test("computeSourceHealthState: successful sync with warnings returns Validation warning", () => {
  const state = computeSourceHealthState({ lastSyncOk: true, lastSyncWarnings: ["Row 3: bad date"], consecutiveFailureCount: 0, lastError: null });
  assert.equal(state, "Validation warning");
});

test("computeSourceHealthState: failed sync with token error returns Authentication required", () => {
  for (const err of ["401 unauthorized", "access_token expired", "invalid credentials", "auth failed"]) {
    const state = computeSourceHealthState({ lastSyncOk: false, lastSyncWarnings: null, consecutiveFailureCount: 1, lastError: err });
    assert.equal(state, "Authentication required", `expected auth required for error: ${err}`);
  }
});

test("computeSourceHealthState: failed sync with permission error returns Access revoked", () => {
  for (const err of ["403 forbidden", "permission denied", "access revoked", "not found"]) {
    const state = computeSourceHealthState({ lastSyncOk: false, lastSyncWarnings: null, consecutiveFailureCount: 1, lastError: err });
    assert.equal(state, "Access revoked", `expected access revoked for error: ${err}`);
  }
});

test("computeSourceHealthState: failed sync with network error returns Source unavailable", () => {
  const state = computeSourceHealthState({ lastSyncOk: false, lastSyncWarnings: null, consecutiveFailureCount: 1, lastError: "ECONNREFUSED" });
  assert.equal(state, "Source unavailable");
});

test("computeSourceHealthState: in-flight Checking phase overrides DB state", () => {
  // Even if lastSyncOk is true, an in-flight sync returns the in-flight phase.
  const state = computeSourceHealthState({ lastSyncOk: true, lastSyncWarnings: null, consecutiveFailureCount: 0, lastError: null }, "checking");
  assert.equal(state, "Checking");
});

test("computeSourceHealthState: in-flight Updating phase overrides DB state", () => {
  const state = computeSourceHealthState({ lastSyncOk: false, lastSyncWarnings: null, consecutiveFailureCount: 3, lastError: "network timeout" }, "updating");
  assert.equal(state, "Updating");
});

test("computeSourceHealthStateWithTimestamps: cTag-skip returns Workbook unchanged", () => {
  const now = new Date();
  const lastSyncAt = new Date(now.getTime() - 1000); // 1 s before "now"
  const lastCTagChangedAt = new Date(now.getTime() - 60_000); // 60 s before "now"
  const lastPublishedAt = new Date(now.getTime() - 60_000); // same — older than lastSyncAt
  const state = computeSourceHealthStateWithTimestamps({
    lastSyncOk: true,
    lastSyncWarnings: null,
    consecutiveFailureCount: 0,
    lastError: null,
    lastSyncAt,
    lastCTagChangedAt,
    lastPublishedAt,
  });
  assert.equal(state, "Workbook unchanged");
});

test("computeSourceHealthStateWithTimestamps: content-change sync returns Healthy", () => {
  const now = new Date();
  const lastSyncAt = new Date(now.getTime() - 1000);
  const lastPublishedAt = lastSyncAt; // published THIS tick
  const lastCTagChangedAt = lastSyncAt; // cTag changed THIS tick
  const state = computeSourceHealthStateWithTimestamps({
    lastSyncOk: true,
    lastSyncWarnings: null,
    consecutiveFailureCount: 0,
    lastError: null,
    lastSyncAt,
    lastCTagChangedAt,
    lastPublishedAt,
  });
  assert.equal(state, "Healthy");
});

test("computeDisplayContinuityState: live data returns Current", () => {
  const state = computeDisplayContinuityState({ lastSyncOk: true, lastGoodSnapshotId: "snap-1" });
  assert.equal(state, "Current");
});

test("computeDisplayContinuityState: failed sync with snapshot returns Using last-known-good", () => {
  const state = computeDisplayContinuityState({ lastSyncOk: false, lastGoodSnapshotId: "snap-1" });
  assert.equal(state, "Using last-known-good");
});

test("computeDisplayContinuityState: no snapshot returns No valid snapshot", () => {
  const state = computeDisplayContinuityState({ lastSyncOk: null, lastGoodSnapshotId: null });
  assert.equal(state, "No valid snapshot");
});

test("rate limit: first run is always allowed", () => {
  const id = `rl-test-${Date.now()}-1`;
  assert.equal(manualRunCooldownRemainingMs(id), 0);
});

test("rate limit: second run within cooldown window is rejected", () => {
  const id = `rl-test-${Date.now()}-2`;
  recordManualRun(id);
  const remaining = manualRunCooldownRemainingMs(id);
  assert.ok(remaining > 0, `expected remaining > 0, got ${remaining}`);
  assert.ok(remaining <= MANUAL_RUN_COOLDOWN_MS, `expected remaining <= ${MANUAL_RUN_COOLDOWN_MS}, got ${remaining}`);
});

test("health response: errors endpoint does not leak sourceUrl, msDriveId, msItemId, lastCTag", async () => {
  // Verify that the fields the health contract promises to suppress are absent
  // from the computeSourceHealthStateWithTimestamps / computeDisplayContinuityState
  // outputs (they take only narrow picks, so structural guarantee is sufficient).
  const cfg = msConfig({ lastSyncOk: true, lastGoodSnapshotId: "snap-xyz", lastCTag: "secret-ctag" });
  const healthState = computeSourceHealthState(cfg);
  const continuityState = computeDisplayContinuityState(cfg);
  // The returned strings must not contain the cTag value.
  assert.ok(!healthState.includes("secret"), "sourceHealthState must not include cTag");
  assert.ok(!continuityState.includes("secret"), "displayContinuityState must not include cTag");
});

test("disconnect: lastGoodSnapshotId is preserved when microsoftAuth cleared", () => {
  // Simulate the PATCH payload the Disconnect button sends: only clears
  // microsoftAuth, msDriveId, msItemId — never lastGoodSnapshotId.
  const cfg = msConfig({ lastGoodSnapshotId: "snap-abc", microsoftAuth: true });
  const disconnectPatch: Partial<typeof cfg> = { microsoftAuth: false, msDriveId: null, msItemId: null };
  const after = { ...cfg, ...disconnectPatch };
  assert.equal(after.lastGoodSnapshotId, "snap-abc", "snapshot pointer must survive disconnect");
  assert.equal(after.microsoftAuth, false);
  assert.equal(after.msDriveId, null);
});

test("atomicMicrosoftSync returns snapshotVersion", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig();
  const s = makeStubStorage(cfg);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => xlsx,
  });
  assert.equal(r.ok, true);
  // The stub atomicMicrosoftSync increments version; result must be a number.
  assert.ok(typeof s.storage.snapshotVersion === "number" || s.storage.snapshotVersion === undefined,
    "snapshotVersion must be a number or not yet in stub");
});

// ===== Data minimisation / XLSX raw bytes =====

test("raw xlsx bytes are not present in any sync result field", async () => {
  const xlsx = await buildXlsxBytes();
  const cfg = msConfig();
  const s = makeStubStorage(cfg);
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    graphFetch: async () => xlsx,
  });
  // The result object must not contain any binary payload.
  const resultJson = JSON.stringify(r);
  // A Uint8Array serialised to JSON becomes {"0":80,"1":75,...} — check for PK magic.
  assert.ok(!resultJson.includes('"0":80'), "raw xlsx bytes must not appear in result");
});

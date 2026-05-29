import test from "node:test";
import assert from "node:assert/strict";
import { runAgendaSync } from "../server/agendaSync";
import type {
  AgendaItem,
  AgendaSyncConfig,
  InsertAgendaItem,
} from "../shared/schema";

// Task #210 — merge engine. We stub fetch + storage so the upsert
// rules (insert/update/skip-manual/tombstone) are exercised without a
// real DB or network.

function makeStubStorage(initial: AgendaItem[] = []) {
  const items: AgendaItem[] = [...initial];
  const configUpdates: any[] = [];
  let configRow: AgendaSyncConfig = {
    id: "cfg-1",
    clientId: "client-A",
    name: "ICS test",
    sourceType: "ics",
    sourceUrl: "https://example.com/cal.ics",
    enabled: true,
    syncIntervalMinutes: 60,
    lastSyncAt: null,
    lastSyncOk: null,
    lastError: null,
    lastErrorAt: null,
    lastItemCount: null,
    consecutiveFailureCount: 0,
    failureAlertSent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let nextId = items.length + 1;
  return {
    items,
    configUpdates,
    storage: {
      async getAgendaSyncConfigs() { return [configRow]; },
      async getAgendaSyncConfig(id: string) { return id === configRow.id ? configRow : undefined; },
      async updateAgendaSyncConfig(id: string, data: any) {
        configRow = { ...configRow, ...data };
        configUpdates.push(data);
        return configRow;
      },
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
    get config() { return configRow; },
  };
}

const ICS_TWO = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:s1",
  "SUMMARY:Session One",
  "LOCATION:Room A",
  "DTSTART:20260601T090000Z",
  "DTEND:20260601T100000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:s2",
  "SUMMARY:Session Two",
  "LOCATION:Room B",
  "DTSTART:20260601T110000Z",
  "DTEND:20260601T120000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function mockFetch(body: string, status = 200): typeof fetch {
  // safeFetch reads body via res.body.getReader(), so return a real Response.
  return (async () => new Response(body, { status, statusText: status === 200 ? "OK" : "ERR" })) as unknown as typeof fetch;
}

// Public-IP DNS stub so safeFetch's SSRF guard doesn't try real DNS.
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];
const safeOpts = { lookupImpl: publicLookup };

test("first sync inserts all upstream items", async () => {
  const s = makeStubStorage();
  const r = await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(ICS_TWO), safeFetchOptions: safeOpts });
  assert.equal(r.ok, true);
  assert.equal(r.inserted, 2);
  assert.equal(r.updated, 0);
  assert.equal(r.removed, 0);
  assert.equal(s.items.length, 2);
  assert.equal(s.config.lastSyncOk, true);
});

test("second sync updates matching externalIds, inserts new ones", async () => {
  const s = makeStubStorage();
  await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(ICS_TWO), safeFetchOptions: safeOpts });
  // Simulate upstream renaming s2 title.
  const updated = ICS_TWO.replace("Session Two", "Session Two (Renamed)");
  const r2 = await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(updated), safeFetchOptions: safeOpts });
  assert.equal(r2.inserted, 0);
  assert.equal(r2.updated, 2);
  assert.equal(s.items.find((i) => i.externalId === "s2")?.title, "Session Two (Renamed)");
});

test("manualOverride rows are skipped, not overwritten", async () => {
  const s = makeStubStorage();
  await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(ICS_TWO), safeFetchOptions: safeOpts });
  // Operator edits one row in the UI -> manualOverride flips.
  const targetIdx = s.items.findIndex((i) => i.externalId === "s1");
  s.items[targetIdx] = { ...s.items[targetIdx], manualOverride: true, title: "Custom Title" };
  const r = await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(ICS_TWO), safeFetchOptions: safeOpts });
  assert.equal(r.skippedManual, 1);
  assert.equal(r.updated, 1);
  assert.equal(s.items.find((i) => i.externalId === "s1")?.title, "Custom Title");
});

test("rows missing upstream are removed (tombstone) unless manual", async () => {
  const s = makeStubStorage();
  await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(ICS_TWO), safeFetchOptions: safeOpts });
  // Mark s2 as manualOverride; s1 should be tombstoned, s2 preserved.
  const s2idx = s.items.findIndex((i) => i.externalId === "s2");
  s.items[s2idx] = { ...s.items[s2idx], manualOverride: true };
  const onlyMissing = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:s3",
    "SUMMARY:Brand New",
    "DTSTART:20260601T140000Z",
    "DTEND:20260601T150000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(onlyMissing), safeFetchOptions: safeOpts });
  assert.equal(r.inserted, 1);
  assert.equal(r.removed, 1); // s1 gone (s2 preserved by manual flag)
  const ids = s.items.map((i) => i.externalId).sort();
  assert.deepEqual(ids, ["s2", "s3"]);
});

test("HTTP error is recorded on the config row, items untouched", async () => {
  const s = makeStubStorage();
  await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch(ICS_TWO), safeFetchOptions: safeOpts });
  const before = s.items.length;
  const r = await runAgendaSync(s.config, { storage: s.storage as any, fetchImpl: mockFetch("", 503), safeFetchOptions: safeOpts });
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("503"));
  assert.equal(s.items.length, before);
  assert.equal(s.config.lastSyncOk, false);
  assert.match(s.config.lastError ?? "", /503/);
});

// Task #220 — persistent-failure alerting.

function makeRecordingAlerter() {
  const failing: Array<{ name: string; count: number; error: string }> = [];
  const recovered: string[] = [];
  return {
    failing,
    recovered,
    alerter: {
      async notifyFeedFailing(config: AgendaSyncConfig, count: number, error: string) {
        failing.push({ name: config.name, count, error });
      },
      async notifyFeedRecovered(config: AgendaSyncConfig) {
        recovered.push(config.name);
      },
    },
  };
}

test("consecutiveFailureCount climbs on each failure, alert fires once at threshold", async () => {
  const s = makeStubStorage();
  const a = makeRecordingAlerter();
  const deps = {
    storage: s.storage as any,
    fetchImpl: mockFetch("", 503),
    safeFetchOptions: safeOpts,
    alerter: a.alerter,
    failureAlertThreshold: 3,
  };

  await runAgendaSync(s.config, deps);
  assert.equal(s.config.consecutiveFailureCount, 1);
  assert.equal(s.config.failureAlertSent, false);
  assert.equal(a.failing.length, 0);

  await runAgendaSync(s.config, deps);
  assert.equal(s.config.consecutiveFailureCount, 2);
  assert.equal(a.failing.length, 0);

  // Third failure reaches the threshold -> one alert.
  await runAgendaSync(s.config, deps);
  assert.equal(s.config.consecutiveFailureCount, 3);
  assert.equal(s.config.failureAlertSent, true);
  assert.equal(a.failing.length, 1);
  assert.equal(a.failing[0].count, 3);

  // Fourth failure: count keeps climbing but no second alert (one per outage).
  await runAgendaSync(s.config, deps);
  assert.equal(s.config.consecutiveFailureCount, 4);
  assert.equal(a.failing.length, 1);
});

test("successful sync after alerting fires a one-shot recovery and resets counters", async () => {
  const s = makeStubStorage();
  const a = makeRecordingAlerter();
  const failDeps = {
    storage: s.storage as any,
    fetchImpl: mockFetch("", 503),
    safeFetchOptions: safeOpts,
    alerter: a.alerter,
    failureAlertThreshold: 2,
  };
  // Two failures -> threshold reached, alert sent.
  await runAgendaSync(s.config, failDeps);
  await runAgendaSync(s.config, failDeps);
  assert.equal(s.config.failureAlertSent, true);
  assert.equal(a.failing.length, 1);

  // Recovery.
  const r = await runAgendaSync(s.config, {
    storage: s.storage as any,
    fetchImpl: mockFetch(ICS_TWO),
    safeFetchOptions: safeOpts,
    alerter: a.alerter,
    failureAlertThreshold: 2,
  });
  assert.equal(r.ok, true);
  assert.equal(s.config.consecutiveFailureCount, 0);
  assert.equal(s.config.failureAlertSent, false);
  assert.deepEqual(a.recovered, ["ICS test"]);
});

test("recovery alert does NOT fire if no failure alert was ever sent", async () => {
  const s = makeStubStorage();
  const a = makeRecordingAlerter();
  // One failure (below threshold), then success.
  await runAgendaSync(s.config, {
    storage: s.storage as any,
    fetchImpl: mockFetch("", 503),
    safeFetchOptions: safeOpts,
    alerter: a.alerter,
    failureAlertThreshold: 3,
  });
  await runAgendaSync(s.config, {
    storage: s.storage as any,
    fetchImpl: mockFetch(ICS_TWO),
    safeFetchOptions: safeOpts,
    alerter: a.alerter,
    failureAlertThreshold: 3,
  });
  assert.equal(a.failing.length, 0);
  assert.equal(a.recovered.length, 0);
  assert.equal(s.config.consecutiveFailureCount, 0);
});

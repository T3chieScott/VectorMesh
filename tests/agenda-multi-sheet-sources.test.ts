import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  runAgendaSync,
  type AtomicMicrosoftSyncParams,
} from "../server/agendaSync";
import { DatabaseStorage } from "../server/storage";
import type {
  AgendaItem,
  AgendaSyncConfig,
  AgendaWidgetConfig,
  InsertAgendaItem,
} from "../shared/schema";

const CLIENT_ID = "client-multi-sheet";
const WORKBOOK_DRIVE_ID = "drive-shared";
const WORKBOOK_ITEM_ID = "item-shared";
const NOW = new Date("2026-09-01T08:00:00.000Z");

function makeSource(
  id: string,
  overrides: Partial<AgendaSyncConfig>,
): AgendaSyncConfig {
  return {
    id,
    clientId: CLIENT_ID,
    name: id === "source-conference" ? "SSoT2026 – Conference" : "SSoT2026 – Additional Agenda",
    sourceType: "sharepoint_excel",
    sourceUrl: null,
    storedFilePath: null,
    microsoftAuth: true,
    msDriveId: WORKBOOK_DRIVE_ID,
    msItemId: WORKBOOK_ITEM_ID,
    msSiteId: null,
    sheetName: id === "source-conference" ? "Conference" : "Additional agenda",
    headerRowIndex: 0,
    firstDataRowIndex: null,
    columnMapping: id === "source-conference"
      ? { title: "Conference session", startsAt: "Starts", endsAt: "Ends" }
      : { title: "Session", startsAt: "Begins", endsAt: "Finishes", track: "Stream" },
    externalIdColumn: id === "source-conference" ? "Agenda ID" : "Row key",
    timezone: "Europe/London",
    dateFormatHint: null,
    timeFormatHint: null,
    startTimeColumn: null,
    endTimeColumn: null,
    dateBaseMonth: null,
    dateBaseYear: null,
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
    lastCTag: null,
    lastProcessedConfigFingerprint: null,
    lastGoodSnapshotId: null,
    msFileName: "Confirmed speakers TEST.xlsx",
    lastPublishedAt: null,
    lastCTagChangedAt: null,
    lastSnapshotVersion: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as AgendaSyncConfig;
}

function toAgendaItem(id: string, data: InsertAgendaItem): AgendaItem {
  return {
    id,
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
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function buildWorkbook(includeRemovedConferenceRow: boolean): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const conference = workbook.addWorksheet("Conference");
  conference.addRow(["Conference session", "Starts", "Ends", "Agenda ID", "Room"]);
  conference.addRow([
    "Opening keynote",
    new Date(Date.UTC(2026, 8, 15, 9, 0)),
    new Date(Date.UTC(2026, 8, 15, 10, 0)),
    "shared-external-id",
    "Main Hall",
  ]);
  if (includeRemovedConferenceRow) {
    conference.addRow([
      "Conference-only session",
      new Date(Date.UTC(2026, 8, 15, 10, 15)),
      new Date(Date.UTC(2026, 8, 15, 11, 0)),
      "conference-removed-later",
      "Main Hall",
    ]);
  }

  const additional = workbook.addWorksheet("Additional agenda");
  additional.addRow(["Session", "Begins", "Finishes", "Row key", "Stream"]);
  additional.addRow([
    "Additional worksheet session",
    new Date(Date.UTC(2026, 8, 15, 11, 0)),
    new Date(Date.UTC(2026, 8, 15, 12, 0)),
    "shared-external-id",
    "Workshops",
  ]);
  additional.addRow([
    "Additional-only session",
    new Date(Date.UTC(2026, 8, 15, 13, 0)),
    new Date(Date.UTC(2026, 8, 15, 14, 0)),
    "additional-only",
    "Workshops",
  ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function makeWidget(): AgendaWidgetConfig {
  return {
    id: "agenda-widget",
    clientId: CLIENT_ID,
    name: "Combined agenda",
    displayMode: "full",
    roomFilter: [],
    trackFilter: [],
    statusFilter: [],
    timeWindowMinutes: null,
    dayFilter: "all",
    dayFilterDate: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as AgendaWidgetConfig;
}

function makeMultiSourceStorage(
  configRows: AgendaSyncConfig[],
  initialItems: AgendaItem[],
) {
  const configs = new Map(configRows.map((config) => [config.id, config]));
  const items = [...initialItems];
  const snapshots = new Map<string, { id: string; syncConfigId: string; items: AgendaItem[] }>();
  let nextItemId = 1;
  let nextSnapshotId = 1;
  const widget = makeWidget();

  const storage = {
    async getAgendaSyncConfigs(clientId?: string) {
      return [...configs.values()].filter((config) => !clientId || config.clientId === clientId);
    },
    async getAgendaSyncConfig(id: string) {
      return configs.get(id);
    },
    async updateAgendaSyncConfig(id: string, data: Partial<AgendaSyncConfig>) {
      const existing = configs.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...data, updatedAt: NOW };
      configs.set(id, updated);
      return updated;
    },
    async getClient() {
      return { id: CLIENT_ID, timezone: "Europe/London" } as any;
    },
    async getAgendaItems(clientId?: string) {
      return items.filter((item) => !clientId || item.clientId === clientId);
    },
    async getAgendaItemsBySyncConfig(syncConfigId: string) {
      return items.filter((item) => item.externalSyncConfigId === syncConfigId);
    },
    async createAgendaItem(data: InsertAgendaItem) {
      const item = toAgendaItem(`item-${nextItemId++}`, data);
      items.push(item);
      return item;
    },
    async updateAgendaItem(id: string, data: Partial<InsertAgendaItem>) {
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return undefined;
      items[index] = { ...items[index], ...data, updatedAt: NOW };
      return items[index];
    },
    async deleteAgendaItem(id: string) {
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return false;
      items.splice(index, 1);
      return true;
    },
    async atomicMicrosoftSync(params: AtomicMicrosoftSyncParams) {
      let inserted = 0;
      let updated = 0;
      let skippedManual = 0;
      let removed = 0;

      for (const data of params.newItems) {
        const existing = items.find(
          (item) =>
            item.externalSyncConfigId === params.configId &&
            item.externalId === data.externalId,
        );
        if (existing) {
          if (existing.manualOverride) {
            skippedManual++;
            continue;
          }
          Object.assign(existing, data, { updatedAt: NOW });
          updated++;
        } else {
          items.push(toAgendaItem(`item-${nextItemId++}`, data));
          inserted++;
        }
      }

      if (params.removeMissingItems) {
        for (let index = items.length - 1; index >= 0; index--) {
          const item = items[index];
          if (
            item.externalSyncConfigId === params.configId &&
            item.externalId &&
            !item.manualOverride &&
            !params.seenExternalIds.has(item.externalId)
          ) {
            items.splice(index, 1);
            removed++;
          }
        }
      }

      const snapshotId = `snapshot-${nextSnapshotId++}`;
      snapshots.set(snapshotId, {
        id: snapshotId,
        syncConfigId: params.configId,
        items: items
          .filter((item) => item.externalSyncConfigId === params.configId)
          .map((item) => ({ ...item })),
      });
      const config = configs.get(params.configId)!;
      configs.set(params.configId, {
        ...config,
        lastCTag: params.newCTag ?? config.lastCTag,
        lastProcessedConfigFingerprint: params.configFingerprint,
        lastGoodSnapshotId: snapshotId,
        lastSnapshotVersion: nextSnapshotId - 1,
        lastPublishedAt: params.lastPublishedAt ?? null,
        lastCTagChangedAt: params.lastCTagChangedAt ?? config.lastCTagChangedAt,
      });
      return { inserted, updated, skippedManual, removed, snapshotId, snapshotVersion: nextSnapshotId - 1 };
    },
    async getAgendaWidgetConfig(id: string) {
      return id === widget.id ? widget : undefined;
    },
    async getAgendaSnapshot(id: string) {
      return snapshots.get(id) as any;
    },
  };

  return {
    storage,
    items,
    snapshots,
    getConfig(id: string) {
      return configs.get(id)!;
    },
  };
}

test("two independently mapped worksheets share one client agenda pool without crossing source boundaries", async () => {
  const conference = makeSource("source-conference", {});
  const additional = makeSource("source-additional", {});
  const manualItem = toAgendaItem("manual-item", {
    clientId: CLIENT_ID,
    title: "Manual / unlinked item",
    startsAt: new Date(Date.UTC(2026, 8, 15, 14, 0)),
    endsAt: new Date(Date.UTC(2026, 8, 15, 15, 0)),
    status: "scheduled",
  });
  const harness = makeMultiSourceStorage([conference, additional], [manualItem]);
  let workbook = await buildWorkbook(true);
  let cTag = "workbook-v1";
  const downloads = new Map<string, number>();
  const deps = {
    storage: harness.storage as any,
    now: () => NOW,
    graphFetch: async (config: AgendaSyncConfig) => {
      downloads.set(config.id, (downloads.get(config.id) ?? 0) + 1);
      return workbook;
    },
    graphCTagFetch: async () => cTag,
  };

  // Both first syncs must run even though the workbook has one shared cTag.
  assert.equal((await runAgendaSync(harness.getConfig(conference.id), deps)).ok, true);
  assert.equal((await runAgendaSync(harness.getConfig(additional.id), deps)).ok, true);
  assert.equal(downloads.get(conference.id), 1);
  assert.equal(downloads.get(additional.id), 1);

  const sharedExternalRows = harness.items.filter((item) => item.externalId === "shared-external-id");
  assert.equal(sharedExternalRows.length, 2, "external IDs are namespaced by their sync config");
  assert.deepEqual(
    new Set(sharedExternalRows.map((item) => item.externalSyncConfigId)),
    new Set([conference.id, additional.id]),
  );
  assert.equal(harness.getConfig(conference.id).sheetName, "Conference");
  assert.equal(harness.getConfig(additional.id).sheetName, "Additional agenda");
  assert.notDeepEqual(
    harness.getConfig(conference.id).columnMapping,
    harness.getConfig(additional.id).columnMapping,
  );

  // Invoke the real DatabaseStorage display method against the in-memory
  // storage contract so the widget path is proven to receive the union.
  const resolved = await (DatabaseStorage.prototype.getResolvedAgendaForConfig as any).call(
    harness.storage,
    "agenda-widget",
    NOW,
  );
  assert.ok(resolved);
  assert.deepEqual(
    new Set(resolved.items.map((item: AgendaItem) => item.title)),
    new Set([
      "Opening keynote",
      "Conference-only session",
      "Additional worksheet session",
      "Additional-only session",
      "Manual / unlinked item",
    ]),
  );

  const conferenceFirstSnapshot = harness.getConfig(conference.id).lastGoodSnapshotId;
  const additionalFirstSnapshot = harness.getConfig(additional.id).lastGoodSnapshotId;
  assert.ok(conferenceFirstSnapshot);
  assert.ok(additionalFirstSnapshot);
  assert.notEqual(conferenceFirstSnapshot, additionalFirstSnapshot);
  assert.equal(harness.snapshots.get(conferenceFirstSnapshot!)?.syncConfigId, conference.id);
  assert.equal(harness.snapshots.get(additionalFirstSnapshot!)?.syncConfigId, additional.id);

  // A mapping change reparses only its own source when the workbook cTag is unchanged.
  await harness.storage.updateAgendaSyncConfig(conference.id, {
    columnMapping: {
      ...harness.getConfig(conference.id).columnMapping,
      room: "Room",
    },
  });
  assert.equal((await runAgendaSync(harness.getConfig(conference.id), deps)).noChange, undefined);
  assert.equal((await runAgendaSync(harness.getConfig(additional.id), deps)).noChange, true);
  assert.equal(downloads.get(conference.id), 2);
  assert.equal(downloads.get(additional.id), 1);

  // A workbook change removes only the row owned by Conference. The second
  // worksheet and a manual/unlinked item remain intact; both sources are now
  // eligible to process the changed workbook revision.
  cTag = "workbook-v2";
  workbook = await buildWorkbook(false);
  const removeConference = await runAgendaSync(harness.getConfig(conference.id), deps);
  assert.equal(removeConference.removed, 1);
  assert.equal((await runAgendaSync(harness.getConfig(additional.id), deps)).ok, true);
  assert.equal(downloads.get(conference.id), 3);
  assert.equal(downloads.get(additional.id), 2);
  assert.equal(
    harness.items.some((item) => item.externalId === "conference-removed-later"),
    false,
  );
  assert.ok(
    harness.items.some(
      (item) =>
        item.externalSyncConfigId === additional.id &&
        item.externalId === "additional-only",
    ),
    "removing from one sheet must not touch the other source",
  );
  assert.ok(harness.items.some((item) => item.id === "manual-item"));

  // A validation failure on Conference retains its own last-known-good
  // snapshot and cannot alter Additional's independent health or snapshot.
  const conferenceSnapshotBeforeFailure = harness.getConfig(conference.id).lastGoodSnapshotId;
  const additionalSnapshotBeforeFailure = harness.getConfig(additional.id).lastGoodSnapshotId;
  await harness.storage.updateAgendaSyncConfig(conference.id, {
    columnMapping: { title: "Conference session", startsAt: "Missing", endsAt: "Also missing" },
  });
  const validationFailure = await runAgendaSync(harness.getConfig(conference.id), deps);
  assert.equal(validationFailure.ok, true);
  assert.ok(validationFailure.parseWarnings?.length);
  assert.equal(harness.getConfig(conference.id).lastGoodSnapshotId, conferenceSnapshotBeforeFailure);
  assert.equal(harness.getConfig(additional.id).lastGoodSnapshotId, additionalSnapshotBeforeFailure);
  assert.equal(harness.getConfig(additional.id).lastSyncOk, true);
  assert.ok(
    harness.items.some(
      (item) =>
        item.externalSyncConfigId === conference.id &&
        item.externalId === "shared-external-id",
    ),
    "validation failure must retain Conference's last-known-good live rows",
  );
});
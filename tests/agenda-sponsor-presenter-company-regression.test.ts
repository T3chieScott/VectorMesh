import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import {
  dedupeAgendaSessions,
  resolveAgendaItems,
  resolveAgendaPresenterPairs,
} from "../shared/agenda-resolver";
import {
  insertAgendaItemSchema,
  insertAgendaWidgetConfigSchema,
  type AgendaItem,
  type AgendaSyncConfig,
  type InsertAgendaItem,
} from "../shared/schema";
import {
  AGENDA_SETTINGS_CLIPBOARD_KEYS,
  buildAgendaSettingsClipboardPayload,
  mergeAgendaSettingsClipboardValues,
  parseAgendaSettingsClipboardPayload,
} from "../shared/agenda-settings-clipboard";
import {
  AGENDA_CSV_HEADER,
  parseAgendaCsv,
  serializeAgendaCsv,
} from "../shared/agenda-csv";
import {
  applyMapping,
  suggestColumnMapping,
} from "../shared/spreadsheet-mapping";
import { digestAgendaConnectionItems } from "../server/agendaItemDigest";
import { mergeSnapshotWithManualOverrides } from "../server/storage";
import { runAgendaSync } from "../server/agendaSync";
import { AgendaDisplayWidget } from "../client/src/components/agenda/AgendaDisplayWidget";

process.env.SESSION_SECRET ||= "agenda-sponsor-presenter-company-test-secret";

const NOW = new Date("2026-06-01T09:30:00Z");
const START = new Date("2026-06-01T10:00:00Z");
const END = new Date("2026-06-01T11:00:00Z");

function item(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: overrides.id ?? "item",
    clientId: overrides.clientId ?? "site-a",
    title: overrides.title ?? "Panel",
    description: overrides.description ?? null,
    room: overrides.room ?? "Main Hall",
    track: overrides.track ?? null,
    presenter: overrides.presenter ?? null,
    presenterCompany: overrides.presenterCompany ?? null,
    company: overrides.company ?? null,
    startsAt: overrides.startsAt ?? START,
    endsAt: overrides.endsAt ?? END,
    status: overrides.status ?? "scheduled",
    statusMessage: overrides.statusMessage ?? null,
    externalSyncConfigId: overrides.externalSyncConfigId ?? null,
    externalId: overrides.externalId ?? null,
    manualOverride: overrides.manualOverride ?? false,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function widgetConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "widget",
    clientId: "site-a",
    name: "Display",
    displayMode: "full",
    layoutMode: "landscape",
    roomFilter: [],
    trackFilter: [],
    statusFilter: [],
    dayFilter: "all",
    dayFilterDate: null,
    timeWindowMinutes: null,
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 10,
    maxItemsPerPage: 8,
    fontScale: "normal",
    density: "normal",
    theme: "dark",
    accentColor: "#0ea5e9",
    backgroundUrl: null,
    eventName: null,
    showDescription: false,
    showPresenter: true,
    showCompany: true,
    showPresenterCompany: true,
    presenterVisibleLines: 4,
    showRoom: true,
    showTrack: false,
    showStatus: true,
    showCurrentTime: false,
    showEventName: false,
    showDayName: false,
    showDate: false,
    showAgendaDayHeading: false,
    showDescriptionDivider: false,
    descriptionLines: 2,
    descriptionAutoScroll: false,
    descriptionTextAlign: "left",
    speakerMarkerStyle: "microphone",
    speakerCustomMarker: null,
    showNowNextLabel: false,
    singleGlobalNowNext: false,
    overrideNowNextColor: false,
    nowNextColor: null,
    showSessionDuration: false,
    showSessionCount: false,
    showSessionEndTime: true,
    sessionDurationPrefix: "",
    fontFamily: null,
    titleColor: null,
    bodyColor: null,
    timeColor: null,
    statusColor: null,
    presenterColor: null,
    presenterCompanyColor: null,
    companyColor: null,
    roomColor: null,
    trackColor: null,
    displayBackgroundColor: null,
    cardBackgroundColor: null,
    sessionTitleColor: null,
    descriptionColor: null,
    timeScale: null,
    dateScale: null,
    titleScale: null,
    bodyScale: null,
    headerDateScale: null,
    headerClockScale: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as any;
}

function renderItem(
  overrides: Record<string, unknown>,
  itemOverrides: Partial<AgendaItem> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: widgetConfig(overrides),
      items: [item(itemOverrides)],
      width: 1920,
      height: 1080,
      timezone: "UTC",
      now: NOW,
    }),
  );
}

test("sponsor/presenter-company matrix is independent on the shared renderer", () => {
  const cases = [
    { showCompany: true, showPresenterCompany: false, sponsor: true, affiliation: false },
    { showCompany: false, showPresenterCompany: true, sponsor: false, affiliation: true },
    { showCompany: true, showPresenterCompany: true, sponsor: true, affiliation: true },
    { showCompany: false, showPresenterCompany: false, sponsor: false, affiliation: false },
  ] as const;
  for (const scenario of cases) {
    const html = renderItem(
      {
        showCompany: scenario.showCompany,
        showPresenterCompany: scenario.showPresenterCompany,
      },
      {
        company: "Session Sponsor",
        presenter: "Ada Lovelace",
        presenterCompany: "Analytical Engines",
      },
    );
    assert.equal(html.includes("Session Sponsor"), scenario.sponsor);
    assert.equal(html.includes("Analytical Engines"), scenario.affiliation);
    assert.equal(html.includes("Ada Lovelace"), true);
  }
});

test("dedupe preserves ordered presenter/company pairs and removes only exact duplicate pairs", () => {
  const rows = [
    item({ id: "a", presenter: "Ada", presenterCompany: "Engine Co", company: "Sponsor B" }),
    item({ id: "b", presenter: "Grace", presenterCompany: "Compiler Co", company: "Sponsor A" }),
    item({ id: "c", presenter: "ada", presenterCompany: "Engine Co", company: "Sponsor B" }),
    item({ id: "d", presenter: "Ada", presenterCompany: "Different Co", company: "Sponsor B" }),
  ];
  const [merged] = dedupeAgendaSessions(rows);
  assert.equal(merged.presenter, "Ada\nGrace\nada\nAda");
  assert.equal(merged.presenterCompany, "Engine Co\nCompiler Co\nEngine Co\nDifferent Co");
  assert.equal(merged.company, "Sponsor B, Sponsor A");
  assert.deepEqual(resolveAgendaPresenterPairs(merged), [
    { presenter: "Ada", presenterCompany: "Engine Co" },
    { presenter: "Grace", presenterCompany: "Compiler Co" },
    { presenter: "ada", presenterCompany: "Engine Co" },
    { presenter: "Ada", presenterCompany: "Different Co" },
  ]);
});

test("a multi-name cell remains one presenter value and affiliation-only rows stay aligned", () => {
  const merged = dedupeAgendaSessions([
    item({ id: "one", presenter: "Ada Lovelace; Grace Hopper", presenterCompany: "Research Lab" }),
    item({ id: "two", presenter: null, presenterCompany: "Independent Lab" }),
  ])[0];
  // An affiliation-only duplicate occupies an empty presenter slot so the
  // newline-separated pair arrays stay aligned.
  assert.equal(merged.presenter, "Ada Lovelace; Grace Hopper\n");
  assert.equal(merged.presenterCompany, "Research Lab\nIndependent Lab");
  assert.deepEqual(resolveAgendaPresenterPairs(merged), [
    { presenter: "Ada Lovelace; Grace Hopper", presenterCompany: "Research Lab" },
    { presenter: null, presenterCompany: "Independent Lab" },
  ]);
});

test("conflicting sponsors retain deterministic first-seen order while status precedence remains canonical", () => {
  const merged = dedupeAgendaSessions([
    item({ id: "first", company: "Sponsor Z", status: "scheduled" }),
    item({ id: "second", company: "Sponsor A", status: "delayed" }),
    item({ id: "third", company: "Sponsor Z", status: "in_progress" }),
  ])[0];
  assert.equal(merged.company, "Sponsor Z, Sponsor A");
  assert.equal(merged.status, "delayed");
  assert.equal(resolveAgendaItems({
    items: [merged],
    config: {
      displayMode: "alert",
      roomFilter: [],
      trackFilter: [],
      statusFilter: [],
      timeWindowMinutes: null,
      dayFilter: "all",
      dayFilterDate: null,
      singleGlobalNowNext: false,
    },
    now: NOW,
  })[0].company, "Sponsor Z, Sponsor A");
});

test("NOW/NEXT resolution retains sponsor and paired presenter affiliation fields", () => {
  const current = item({
    id: "now",
    title: "Current",
    startsAt: new Date("2026-06-01T09:00:00Z"),
    endsAt: new Date("2026-06-01T10:00:00Z"),
    status: "in_progress",
    presenter: "Ada",
    presenterCompany: "Engine Co",
    company: "Current Sponsor",
  });
  const next = item({
    id: "next",
    title: "Next",
    startsAt: new Date("2026-06-01T10:30:00Z"),
    endsAt: new Date("2026-06-01T11:30:00Z"),
    presenter: "Grace",
    presenterCompany: "Compiler Co",
    company: "Next Sponsor",
  });
  const resolved = resolveAgendaItems({
    items: [next, current],
    config: {
      displayMode: "now_next",
      roomFilter: [],
      trackFilter: [],
      statusFilter: [],
      timeWindowMinutes: null,
      dayFilter: "all",
      dayFilterDate: null,
      singleGlobalNowNext: true,
    },
    now: NOW,
  });
  assert.deepEqual(resolved.map((entry) => entry.id), ["now", "next"]);
  assert.equal(resolved[0].presenterCompany, "Engine Co");
  assert.equal(resolved[0].company, "Current Sponsor");
  assert.equal(resolved[1].presenterCompany, "Compiler Co");
  assert.equal(resolved[1].company, "Next Sponsor");
});

test("mapped spreadsheet synonyms keep session sponsor separate from presenter affiliation", () => {
  const headers = [
    "Session title",
    "Start",
    "End",
    "Speaker",
    "Presenter organisation",
    "Session sponsor",
    "Room",
  ];
  const suggested = suggestColumnMapping(headers);
  assert.equal(suggested.presenter, "Speaker");
  assert.equal(suggested.presenterCompany, "Presenter organisation");
  assert.equal(suggested.company, "Session sponsor");
  const mapped = applyMapping(
    [[
      "Keynote",
      "2026-06-01 10:00",
      "2026-06-01 11:00",
      "Ada Lovelace",
      "Analytical Engines",
      "Sponsor Ltd",
      "Hall A",
    ]],
    {
      headers,
      mapping: {
        title: "Session title",
        startsAt: "Start",
        endsAt: "End",
        presenter: "Speaker",
        presenterCompany: "Presenter organisation",
        company: "Session sponsor",
        room: "Room",
      },
      timezone: "UTC",
    },
  );
  assert.equal(mapped[0].item?.presenterCompany, "Analytical Engines");
  assert.equal(mapped[0].item?.company, "Sponsor Ltd");
});

test("CSV export/import preserves both fields, while legacy and sponsor-labelled CSV remain readable", () => {
  const source = {
    title: "Panel",
    description: null,
    room: "Hall A",
    track: null,
    presenter: "Ada Lovelace; Grace Hopper",
    presenterCompany: "Engine Co",
    company: "Sponsor, Ltd",
    startsAt: START,
    endsAt: END,
    status: "scheduled",
    statusMessage: null,
  };
  const roundTrip = parseAgendaCsv(serializeAgendaCsv([source]));
  assert.equal(roundTrip[0].item?.presenterCompany, source.presenterCompany);
  assert.equal(roundTrip[0].item?.company, source.company);

  const oldHeader = "title,description,room,track,presenter,startsAt,endsAt,status,statusMessage";
  const old = parseAgendaCsv([
    oldHeader,
    "Legacy,,Hall A,,Ada,2026-06-01T10:00:00Z,2026-06-01T11:00:00Z,scheduled,",
  ].join("\n"));
  assert.equal(old[0].status, "ok");
  assert.equal(old[0].item?.company, null);
  assert.equal(old[0].item?.presenterCompany, null);

  const sponsorHeader = `${AGENDA_CSV_HEADER.split(",").slice(0, 9).join(",")},sponsor,presenterCompany`;
  const labelled = parseAgendaCsv([
    sponsorHeader,
    "Labelled,,Hall A,,Ada,2026-06-01T10:00:00Z,2026-06-01T11:00:00Z,scheduled,,Sponsor Ltd,Engine Co",
  ].join("\n"));
  assert.equal(labelled[0].item?.company, "Sponsor Ltd");
  assert.equal(labelled[0].item?.presenterCompany, "Engine Co");
});

test("config defaults, migration backfill guard, validation and colours are explicit", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({ clientId: "site-a", name: "Legacy" });
  assert.equal(parsed.showCompany, true);
  assert.equal(parsed.showPresenterCompany, false);
  const coloured = insertAgendaWidgetConfigSchema.parse({
    clientId: "site-a",
    name: "Colours",
    companyColor: "#123",
    presenterCompanyColor: "#abcdef",
  });
  assert.equal(coloured.companyColor, "#123");
  assert.equal(coloured.presenterCompanyColor, "#abcdef");
  assert.equal(insertAgendaWidgetConfigSchema.safeParse({
    clientId: "site-a",
    name: "Bad",
    presenterCompanyColor: "red",
  }).success, false);

  const migration = readFileSync("migrations/0041_agenda_presenter_company.sql", "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS presenter_company/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS show_company BOOLEAN NOT NULL DEFAULT TRUE/i);
  assert.match(migration, /UPDATE agenda_widget_configs[\s\S]*show_company = COALESCE\(show_presenter, TRUE\)/i);
  assert.match(migration, /IF NOT had_show_company/i);
  assert.doesNotMatch(migration, /DROP COLUMN|TRUNCATE|DELETE FROM/i);
});

test("manual item schema and snapshot/digest paths carry both semantic fields", () => {
  const inserted = insertAgendaItemSchema.parse({
    clientId: "site-a",
    title: "Session",
    room: "Hall A",
    presenter: "Ada",
    presenterCompany: "Engine Co",
    company: "Sponsor Ltd",
    startsAt: START,
    endsAt: END,
  });
  assert.equal(inserted.presenterCompany, "Engine Co");
  assert.equal(inserted.company, "Sponsor Ltd");

  const base = item({
    id: "external-1",
    externalId: "row-1",
    presenter: "Ada",
    presenterCompany: "Engine Co",
    company: "Sponsor Ltd",
  });
  const override = item({
    ...base,
    id: "override",
    presenterCompany: "Engine Research",
    company: "Updated Sponsor",
    manualOverride: true,
  });
  const merged = mergeSnapshotWithManualOverrides([base], [override], NOW);
  assert.equal(merged[0].presenterCompany, "Engine Research");
  assert.equal(merged[0].company, "Updated Sponsor");
  assert.notEqual(
    digestAgendaConnectionItems([base]),
    digestAgendaConnectionItems([{ ...base, company: "Different Sponsor" }]),
  );
  assert.equal(
    digestAgendaConnectionItems([base, { ...base, id: "external-2" }]),
    digestAgendaConnectionItems([{ ...base, id: "external-2" }, base]),
  );
});

test("clipboard propagation includes independent visibility and colour settings without identity leakage", () => {
  for (const key of [
    "showCompany",
    "showPresenterCompany",
    "companyColor",
    "presenterCompanyColor",
  ]) {
    assert.ok(AGENDA_SETTINGS_CLIPBOARD_KEYS.includes(key as never), key);
  }
  const payload = buildAgendaSettingsClipboardPayload({
    showCompany: false,
    showPresenterCompany: true,
    companyColor: "#123456",
    presenterCompanyColor: "#abcdef",
    id: "must-not-copy",
    clientId: "must-not-copy",
  });
  const settings = parseAgendaSettingsClipboardPayload(JSON.stringify(payload));
  const merged = mergeAgendaSettingsClipboardValues({
    id: "destination",
    clientId: "site-a",
    showCompany: true,
    showPresenterCompany: false,
    companyColor: "#ffffff",
    presenterCompanyColor: "#ffffff",
  }, settings);
  assert.equal(merged.showCompany, false);
  assert.equal(merged.showPresenterCompany, true);
  assert.equal(merged.companyColor, "#123456");
  assert.equal(merged.presenterCompanyColor, "#abcdef");
  assert.equal(merged.id, "destination");
  assert.equal(merged.clientId, "site-a");
});

function syncConfig(overrides: Partial<AgendaSyncConfig> = {}): AgendaSyncConfig {
  return {
    id: "csv-source",
    clientId: "site-a",
    name: "CSV source",
    sourceType: "google_sheets_csv",
    sourceUrl: "https://example.test/agenda.csv",
    storedFilePath: null,
    sheetName: null,
    headerRowIndex: 0,
    firstDataRowIndex: null,
    columnMapping: null,
    externalIdColumn: null,
    timezone: "UTC",
    dateFormatHint: null,
    syncMode: "interval",
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
    microsoftAuth: false,
    msDriveId: null,
    msItemId: null,
    msSiteId: null,
    lastCTag: null,
    lastProcessedConfigFingerprint: null,
    lastGoodSnapshotId: null,
    lastPublishedAt: null,
    lastCTagChangedAt: null,
    lastSnapshotVersion: null,
    msFileName: null,
    createdAt: NOW,
    updatedAt: NOW,
    startTimeColumn: null,
    endTimeColumn: null,
    dateBaseMonth: null,
    dateBaseYear: null,
    ...overrides,
  } as AgendaSyncConfig;
}

test("scheduled CSV sync upserts sponsor and presenter-company fields", async () => {
  const config = syncConfig();
  const items: AgendaItem[] = [];
  const csv = serializeAgendaCsv([{
    title: "Synced panel",
    description: null,
    room: "Hall A",
    track: null,
    presenter: "Ada",
    presenterCompany: "Engine Co",
    company: "Sponsor Ltd",
    startsAt: START,
    endsAt: END,
    status: "scheduled",
    statusMessage: null,
  }]);
  const storage = {
    async getAgendaItemsBySyncConfig() { return items; },
    async updateAgendaSyncConfig(_id: string, values: Partial<AgendaSyncConfig>) {
      Object.assign(config, values);
      return config;
    },
    async createAgendaItem(data: InsertAgendaItem) {
      const row = item({ ...data, id: "synced-1" });
      items.push(row);
      return row;
    },
    async updateAgendaItem(id: string, values: Partial<InsertAgendaItem>) {
      const row = items.find((candidate) => candidate.id === id);
      if (row) Object.assign(row, values);
      return row;
    },
    async deleteAgendaItem() { return true; },
  };
  const fetchImpl = (async () => new Response(csv, { status: 200 })) as typeof fetch;
  const result = await runAgendaSync(config, {
    storage: storage as any,
    fetchImpl,
    safeFetchOptions: {
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 as const }],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(items[0].presenterCompany, "Engine Co");
  assert.equal(items[0].company, "Sponsor Ltd");
});

test("hard-reset implementation constructs new items from mapped row data and snapshot contract includes fields", () => {
  const source = readFileSync("server/agendaSync.ts", "utf8");
  const reset = source.slice(source.indexOf("async function executeAgendaSourceResetUnlocked"));
  assert.match(reset, /const newItems: InsertAgendaItem\[\] = parsed\.upstream\.map[\s\S]*row\.data/);
  const storage = readFileSync("server/storage.ts", "utf8");
  const atomic = storage.slice(storage.indexOf("async atomicMicrosoftSync"));
  assert.match(atomic, /presenterCompany: item\.presenterCompany \?\? null/);
  assert.match(atomic, /company: item\.company \?\? null/);
});

test("Player, Monitor and shared render use the canonical agenda payload and renderer", () => {
  const routes = readFileSync("server/agendaRoutes.ts", "utf8");
  const monitor = readFileSync("client/src/pages/monitor.tsx", "utf8");
  const surface = readFileSync("client/src/components/screen-render-surface.tsx", "utf8");
  assert.match(routes, /presenterCompany: it\.presenterCompany \?\? null/);
  assert.match(routes, /company: it\.company \?\? null/);
  assert.match(monitor, /agendaPresentationActivationKey=\{frameSceneIdentity\}/);
  assert.match(surface, /AgendaConfigZoneWidget|agendaPresentationActivationKey/);
});
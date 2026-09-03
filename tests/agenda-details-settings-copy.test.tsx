// Task #397 — Agenda time details, scroll-indicator gutter/colour, and
// versioned settings clipboard behavior.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AgendaDisplayWidget,
  DESCRIPTION_SCROLL_GUTTER_PX,
  DESCRIPTION_SCROLL_TRACK_COLOR,
  formatSessionDuration,
} from "../client/src/components/agenda/AgendaDisplayWidget";
import {
  AGENDA_SETTINGS_CLIPBOARD_KEYS,
  AGENDA_SETTINGS_CLIPBOARD_TYPE,
  AGENDA_SETTINGS_CLIPBOARD_VERSION,
  buildAgendaSettingsClipboardPayload,
  mergeAgendaSettingsClipboardValues,
  parseAgendaSettingsClipboardPayload,
} from "../shared/agenda-settings-clipboard";
import {
  insertAgendaWidgetConfigSchema,
  type AgendaItem,
  type AgendaWidgetConfig,
} from "../shared/schema";

const NOW = new Date("2026-09-02T12:00:00Z");

function config(overrides: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: "cfg-397",
    clientId: "client-1",
    name: "Destination display",
    displayMode: "full",
    layoutMode: "landscape",
    roomFilter: [],
    trackFilter: [],
    statusFilter: [],
    dayFilter: "all",
    dayFilterDate: null,
    timeWindowMinutes: null,
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 12,
    maxItemsPerPage: 8,
    fontScale: "normal",
    density: "normal",
    theme: "dark",
    accentColor: "#0ea5e9",
    fontFamily: null,
    titleColor: null,
    bodyColor: null,
    timeColor: null,
    statusColor: null,
    timeScale: null,
    dateScale: null,
    titleScale: null,
    bodyScale: null,
    headerDateScale: null,
    headerClockScale: null,
    backgroundUrl: null,
    eventName: "Conference",
    showDescription: true,
    showPresenter: true,
    speakerMarkerStyle: "microphone",
    speakerCustomMarker: null,
    showRoom: true,
    showTrack: true,
    showStatus: true,
    showSessionDuration: true,
    showSessionEndTime: true,
    sessionDurationPrefix: "",
    showCurrentTime: false,
    showEventName: true,
    showDayName: false,
    showDate: false,
    descriptionLines: 2,
    descriptionAutoScroll: false,
    showDescriptionDivider: false,
    descriptionTextAlign: "left",
    showNowNextLabel: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function item(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "session",
    clientId: "client-1",
    title: "Agenda refinements",
    description: "A session description that can be measured and scrolled.",
    room: "Hall A",
    track: "Main",
    presenter: "Ada Lovelace",
    startsAt: new Date("2026-09-02T11:30:00Z"),
    endsAt: new Date("2026-09-02T13:00:00Z"),
    status: "in_progress",
    statusMessage: null,
    sortOrder: 0,
    externalId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as AgendaItem;
}

function render(
  overrides: Partial<AgendaWidgetConfig> = {},
  agendaItems: AgendaItem[] = [item()],
): string {
  return renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: config(overrides),
      items: agendaItems,
      width: 1920,
      height: 1080,
      timezone: "UTC",
      now: NOW,
    }),
  );
}

function clipboardValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of AGENDA_SETTINGS_CLIPBOARD_KEYS) values[key] = "";
  return {
    ...values,
    displayMode: "now_next",
    layoutMode: "portrait",
    fontScale: "large",
    density: "spacious",
    theme: "light",
    timeScale: 1.2,
    dateScale: 0.75,
    titleScale: 1.15,
    bodyScale: 0.8,
    headerDateScale: 0.9,
    headerClockScale: 1.3,
    statusFilter: ["scheduled"],
    dayFilter: "all",
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 12,
    maxItemsPerPage: 8,
    showDescription: true,
    descriptionLines: "full",
    descriptionAutoScroll: true,
    showDescriptionDivider: true,
    descriptionTextAlign: "left",
    showPresenter: true,
    speakerMarkerStyle: "square",
    showRoom: true,
    showTrack: true,
    showStatus: true,
    showSessionDuration: true,
    showSessionEndTime: false,
    sessionDurationPrefix: "Dur.",
    showCurrentTime: true,
    showEventName: true,
    showDayName: true,
    showDate: true,
    showNowNextLabel: true,
    name: "Must not copy",
    accentColor: "#ff0000",
    clientId: "must-not-copy",
    id: "must-not-copy",
  };
}

test("Task #397 schema defaults preserve visible end times and no duration prefix", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({
    clientId: "client-1",
    name: "Legacy",
  });
  assert.equal(parsed.showSessionEndTime, true);
  assert.equal(parsed.sessionDurationPrefix, "");
});

test("Task #397 schema trims duration prefix and enforces its limit", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({
    clientId: "client-1",
    name: "Prefix",
    sessionDurationPrefix: "  Dur.  ",
  });
  assert.equal(parsed.sessionDurationPrefix, "Dur.");
  assert.equal(
    insertAgendaWidgetConfigSchema.safeParse({
      clientId: "client-1",
      name: "Long prefix",
      sessionDurationPrefix: "x".repeat(25),
    }).success,
    false,
  );
});

test("Task #397 duration prefix is trimmed and separated exactly once", () => {
  assert.equal(
    formatSessionDuration(
      new Date("2026-09-02T11:30:00Z"),
      new Date("2026-09-02T12:10:00Z"),
      "  Dur.  ",
    ),
    "Dur. 40 min",
  );
  assert.equal(
    formatSessionDuration(
      new Date("2026-09-02T11:30:00Z"),
      new Date("2026-09-02T12:10:00Z"),
      "",
    ),
    "40 min",
  );
  assert.equal(formatSessionDuration(NOW, NOW, "Dur."), null);
});

test("Task #397 end-time toggle works across supported layouts", () => {
  for (const layoutMode of [
    "landscape",
    "portrait",
    "ultrawide",
    "totem",
    "room_door",
  ] as const) {
    assert.ok(render({ layoutMode, showSessionEndTime: true }).includes("13:00"));
    const hidden = render({
      layoutMode,
      showSessionEndTime: false,
      sessionDurationPrefix: "Dur.",
    });
    assert.equal(hidden.includes("13:00"), false, `${layoutMode} still shows end time`);
    assert.match(hidden, />Dur\. 1 hr 30 min</);
  }
});

test("Task #397 omitted end-time setting keeps the legacy visible end time", () => {
  const cfg = config();
  delete (cfg as Partial<AgendaWidgetConfig>).showSessionEndTime;
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: cfg,
      items: [item()],
      width: 1920,
      height: 1080,
      timezone: "UTC",
      now: NOW,
    }),
  );
  assert.match(html, />13:00</);
});

test("Task #397 Full-scroll text reserves a stable right gutter only in that path", () => {
  assert.equal(DESCRIPTION_SCROLL_GUTTER_PX, 8);
  const full = render({
    descriptionLines: null,
    descriptionAutoScroll: true,
  });
  assert.match(
    full,
    /style="[^"]*padding-right:8px[^"]*"[^>]*data-testid="agenda-description-session"/,
  );
  const fixed = render({ descriptionLines: 2, descriptionAutoScroll: true });
  assert.doesNotMatch(
    fixed,
    /style="[^"]*padding-right[^"]*"[^>]*data-testid="agenda-description-session"/,
  );
});

test("Task #397 passive track is black while the thumb remains accent-coloured", () => {
  assert.equal(DESCRIPTION_SCROLL_TRACK_COLOR, "rgba(0, 0, 0, 0.24)");
  const source = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf8",
  );
  const trackStart = source.indexOf("agenda-description-scroll-track-");
  const trackEnd = source.indexOf("<p", trackStart);
  const trackSource = source.slice(trackStart, trackEnd);
  assert.match(trackSource, /backgroundColor: DESCRIPTION_SCROLL_TRACK_COLOR/);
  assert.match(trackSource, /backgroundColor: descriptionAccent/);
  assert.doesNotMatch(
    trackSource,
    /color-mix\(in srgb, \$\{descriptionAccent\}/,
  );
  assert.match(trackSource, /pointerEvents: "none"/);
  assert.doesNotMatch(trackSource, /role=["']scrollbar["']|tabIndex/);
});

test("Task #397 copied settings use the complete explicit allowlist", () => {
  const payload = buildAgendaSettingsClipboardPayload(clipboardValues());
  assert.equal(payload.type, AGENDA_SETTINGS_CLIPBOARD_TYPE);
  assert.equal(payload.version, AGENDA_SETTINGS_CLIPBOARD_VERSION);
  assert.deepEqual(
    Object.keys(payload.settings).sort(),
    [...AGENDA_SETTINGS_CLIPBOARD_KEYS].sort(),
  );
  assert.equal("accentColor" in payload.settings, false);
  assert.equal("name" in payload.settings, false);
  assert.equal("id" in payload.settings, false);
  assert.equal("clientId" in payload.settings, false);
});

test("Task #397 paste preserves destination identity and accent", () => {
  const payload = buildAgendaSettingsClipboardPayload(clipboardValues());
  const settings = parseAgendaSettingsClipboardPayload(JSON.stringify(payload));
  const destination = {
    ...clipboardValues(),
    id: "destination-id",
    name: "Destination display",
    clientId: "destination-client",
    accentColor: "#00ff00",
    showSessionEndTime: true,
  };
  const merged = mergeAgendaSettingsClipboardValues(destination, settings);
  assert.equal(merged.id, "destination-id");
  assert.equal(merged.name, "Destination display");
  assert.equal(merged.clientId, "destination-client");
  assert.equal(merged.accentColor, "#00ff00");
  assert.equal(merged.showSessionEndTime, false);
  assert.equal(merged.sessionDurationPrefix, "Dur.");
});

test("Task #397 missing settings retain destination values", () => {
  const settings = parseAgendaSettingsClipboardPayload(
    JSON.stringify({
      type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
      version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
      settings: { showSessionDuration: true },
    }),
  );
  const merged = mergeAgendaSettingsClipboardValues(
    {
      accentColor: "#00ff00",
      showSessionDuration: false,
      showSessionEndTime: true,
      eventName: "Keep me",
    },
    settings,
  );
  assert.equal(merged.showSessionDuration, true);
  assert.equal(merged.showSessionEndTime, true);
  assert.equal(merged.eventName, "Keep me");
});

test("Task #397 malformed, incompatible, crafted, and invalid payloads are rejected", () => {
  assert.throws(() => parseAgendaSettingsClipboardPayload("{"));
  assert.throws(() =>
    parseAgendaSettingsClipboardPayload(
      JSON.stringify({ type: "other", version: 1, settings: {} }),
    ),
  );
  assert.throws(() =>
    parseAgendaSettingsClipboardPayload(
      JSON.stringify({
        type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
        version: 2,
        settings: {},
      }),
    ),
  );
  for (const settings of [
    { accentColor: "#ff0000" },
    { id: "crafted" },
    { futureSetting: true },
    { showSessionEndTime: "yes" },
    { descriptionLines: "invalid" },
  ]) {
    assert.throws(() =>
      parseAgendaSettingsClipboardPayload(
        JSON.stringify({
          type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
          version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
          settings,
        }),
      ),
    );
  }
});

test("Task #397 editor, public payload, and migration carry both new settings", () => {
  const editor = readFileSync("client/src/pages/agenda-configs.tsx", "utf8");
  const routes = readFileSync("server/agendaRoutes.ts", "utf8");
  const migration = readFileSync(
    "migrations/0034_agenda_time_display_options.sql",
    "utf8",
  );
  for (const field of ["showSessionEndTime", "sessionDurationPrefix"]) {
    assert.ok(editor.includes(`${field}: values.${field}`));
    assert.ok(routes.includes(`"${field}"`));
    assert.ok(routes.includes(`${field}: config.${field}`));
  }
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS show_session_end_time boolean NOT NULL DEFAULT true/i,
  );
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS session_duration_prefix text NOT NULL DEFAULT ''/i,
  );
  assert.doesNotMatch(migration, /\b(DROP|RENAME|TRUNCATE|DELETE)\b/i);
});
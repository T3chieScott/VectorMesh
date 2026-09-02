// Task #395 — live header dates, future NEXT dates, calculated duration,
// and fixed-column presenter alignment.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  insertAgendaWidgetConfigSchema,
  type AgendaItem,
  type AgendaWidgetConfig,
} from "../shared/schema";
import {
  AgendaDisplayWidget,
  formatSessionDuration,
} from "../client/src/components/agenda/AgendaDisplayWidget";

const NOW = new Date("2026-09-02T12:00:00Z");

function config(overrides: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: "cfg-395",
    clientId: "client-1",
    name: "Agenda dates",
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
    showSessionDuration: false,
    showCurrentTime: true,
    showEventName: true,
    showDayName: true,
    showDate: true,
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
    title: "Future session",
    description: "Description",
    room: "Hall A",
    track: "Main",
    presenter: "Ada Lovelace, Grace Hopper",
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
  configOverrides: Partial<AgendaWidgetConfig> = {},
  items: AgendaItem[] = [item()],
  now = NOW,
  timezone = "Europe/London",
): string {
  return renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: config(configOverrides),
      items,
      width: 1920,
      height: 1080,
      now,
      timezone,
    }),
  );
}

test("Task #395 schema keeps duration disabled for legacy configs", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({
    clientId: "client-1",
    name: "Legacy",
  });
  assert.equal(parsed.showSessionDuration, false);
});

test("Task #395 header weekday and date use now rather than the first future session", () => {
  const now = new Date("2026-12-31T23:30:00Z");
  const html = render(
    {},
    [
      item({
        startsAt: new Date("2027-01-01T10:00:00Z"),
        endsAt: new Date("2027-01-01T11:00:00Z"),
        status: "scheduled",
      }),
    ],
    now,
    "Europe/London",
  );
  assert.match(html, /data-testid="agenda-day-name"[^>]*>Thursday</);
  assert.match(html, /data-testid="agenda-date"[^>]*>December 31, 2026</);
  assert.doesNotMatch(html, /data-testid="agenda-date"[^>]*>January 1, 2027</);
});

test("Task #395 NEXT date uses the display-timezone calendar day", () => {
  const now = new Date("2026-09-03T00:30:00Z"); // Sep 2 in Los Angeles
  const html = render(
    { displayMode: "now_next", showNowNextLabel: true },
    [
      item({
        id: "later-local-day",
        startsAt: new Date("2026-09-03T08:30:00Z"), // Sep 3 in Los Angeles
        endsAt: new Date("2026-09-03T09:30:00Z"),
        status: "scheduled",
      }),
    ],
    now,
    "America/Los_Angeles",
  );
  assert.match(html, /agenda-now-next-label-later-local-day"[^>]*>NEXT</);
  assert.match(
    html,
    /agenda-now-next-date-later-local-day"[^>]*>September 3, 2026</,
  );
});

test("Task #395 same display-timezone day suppresses a redundant NEXT date", () => {
  const now = new Date("2026-09-03T00:30:00Z"); // Sep 2 in Los Angeles
  const html = render(
    { displayMode: "now_next", showNowNextLabel: true },
    [
      item({
        id: "same-local-day",
        startsAt: new Date("2026-09-03T06:00:00Z"), // Sep 2 in Los Angeles
        endsAt: new Date("2026-09-03T07:00:00Z"),
        status: "scheduled",
      }),
    ],
    now,
    "America/Los_Angeles",
  );
  assert.match(html, /agenda-now-next-label-same-local-day"[^>]*>NEXT</);
  assert.equal(html.includes("agenda-now-next-date-same-local-day"), false);
});

test("Task #395 formats compact elapsed durations", () => {
  const start = new Date("2026-03-29T00:30:00Z");
  assert.equal(formatSessionDuration(start, new Date(start.getTime() + 30 * 60_000)), "30 min");
  assert.equal(formatSessionDuration(start, new Date(start.getTime() + 60 * 60_000)), "1 hr");
  assert.equal(formatSessionDuration(start, new Date(start.getTime() + 90 * 60_000)), "1 hr 30 min");
  assert.equal(formatSessionDuration(start, new Date(start.getTime() + 120 * 60_000)), "2 hrs");
});

test("Task #395 hides missing, invalid, and non-positive durations", () => {
  assert.equal(formatSessionDuration(null, new Date()), null);
  assert.equal(formatSessionDuration("invalid", new Date()), null);
  assert.equal(formatSessionDuration(NOW, NOW), null);
  assert.equal(
    formatSessionDuration(NOW, new Date(NOW.getTime() - 60_000)),
    null,
  );
});

test("Task #395 duration is optional and renders across agenda layouts", () => {
  assert.equal(render().includes("agenda-session-duration-session"), false);
  for (const layoutMode of [
    "landscape",
    "portrait",
    "ultrawide",
    "totem",
    "room_door",
  ] as const) {
    const html = render({ layoutMode, showSessionDuration: true });
    assert.match(
      html,
      /data-testid="agenda-session-duration-session"[^>]*>1 hr 30 min</,
      `duration missing from ${layoutMode}`,
    );
  }
});

test("Task #395 presenter marker has a fixed column and does not split names", () => {
  const html = render({ speakerMarkerStyle: "square" });
  assert.match(
    html,
    /data-testid="agenda-presenter-session"[^>]*><span class="flex-none" style="width:[^"]+">/,
  );
  assert.match(html, /<span class="min-w-0 whitespace-pre-line">Ada Lovelace, Grace Hopper<\/span>/);
  assert.equal((html.match(/agenda-speaker-marker-session/g) ?? []).length, 1);
});

test("Task #395 None removes the marker column and spacing", () => {
  const html = render({ speakerMarkerStyle: "none" });
  const presenterStart = html.indexOf('data-testid="agenda-presenter-session"');
  const presenterEnd = html.indexOf("</div>", presenterStart);
  const presenter = html.slice(presenterStart, presenterEnd);
  assert.equal(presenter.includes("agenda-speaker-marker-session"), false);
  assert.equal(presenter.includes('class="flex-none"'), false);
  assert.match(presenter, /<span class="min-w-0 whitespace-pre-line">/);
});

test("Task #395 editor, public payload, and additive migration carry duration", () => {
  const routes = readFileSync("server/agendaRoutes.ts", "utf8");
  const editor = readFileSync("client/src/pages/agenda-configs.tsx", "utf8");
  const migration = readFileSync(
    "migrations/0033_agenda_session_duration.sql",
    "utf8",
  );
  assert.ok(routes.includes('"showSessionDuration"'));
  assert.ok(routes.includes("showSessionDuration: config.showSessionDuration"));
  assert.ok(editor.includes("showSessionDuration: values.showSessionDuration"));
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS show_session_duration boolean NOT NULL DEFAULT false/i,
  );
  assert.doesNotMatch(migration, /\b(DROP|RENAME|TRUNCATE|DELETE)\b/i);
});
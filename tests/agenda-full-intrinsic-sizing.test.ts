/**
 * Task #399 — Full Agenda intrinsic sizing regression coverage.
 *
 * These assertions intentionally stay close to the renderer contract. The
 * browser test harness does not provide reliable grid geometry, but the
 * sizing decisions are deterministic and are easy to regress during a
 * refactor.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgendaItem, AgendaWidgetConfig } from "../shared/schema";
import { AgendaDisplayWidget } from "../client/src/components/agenda/AgendaDisplayWidget";

const source = readFileSync(
  "client/src/components/agenda/AgendaDisplayWidget.tsx",
  "utf8",
);

const NOW = new Date("2026-09-02T12:00:00Z");
const SIX_PRESENTERS = [
  "Ada Lovelace",
  "Grace Hopper",
  "Katherine Johnson",
  "Evelyn Boyd Granville",
  "Dorothy Vaughan",
  "Mary Jackson",
].join("\n");

function config(
  overrides: Partial<AgendaWidgetConfig> = {},
): AgendaWidgetConfig {
  return {
    id: "cfg-399",
    clientId: "client-1",
    name: "Intrinsic agenda",
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
    speakerMarkerStyle: "square",
    speakerCustomMarker: null,
    showRoom: true,
    showTrack: true,
    showStatus: true,
    showSessionDuration: false,
    showCurrentTime: true,
    showEventName: true,
    showDayName: true,
    showDate: true,
    descriptionLines: null,
    descriptionAutoScroll: true,
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
    id: "session-399",
    clientId: "client-1",
    title: "A session with a deliberately stable title",
    description: "A description that remains in the scroll viewport.",
    room: "Hall A",
    track: "Main",
    presenter: SIX_PRESENTERS,
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
  agendaItem: AgendaItem = item(),
): string {
  return renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: config(overrides),
      items: [agendaItem],
      width: 1920,
      height: 1080,
      now: NOW,
      timezone: "UTC",
    }),
  );
}

test("Task #399 renders all six newline-separated presenters with one first-line marker", () => {
  const html = render();
  assert.ok(html.includes(SIX_PRESENTERS));
  assert.equal((html.match(/agenda-speaker-marker-session-399/g) ?? []).length, 1);
  assert.match(
    html,
    /agenda-presenter-session-399[\s\S]*<span class="flex-none" style="width:[^"]+">[\s\S]*<span class="min-w-0 whitespace-pre-line">Ada Lovelace\nGrace Hopper/,
  );
});

test("Task #399 preserves compact single-presenter markup", () => {
  const html = render(
    { descriptionLines: 2, descriptionAutoScroll: false },
    item({ presenter: "Ada Lovelace" }),
  );
  assert.match(html, /class="min-w-0 whitespace-pre-line">Ada Lovelace<\/span>/);
  assert.equal((html.match(/agenda-speaker-marker-session-399/g) ?? []).length, 1);
  assert.equal(html.includes("agenda-description-scroll-track-session-399"), false);
});

test("Task #399 preserves Now/Next labels while Full sizing changes", () => {
  const html = render(
    { displayMode: "now_next", showNowNextLabel: true },
    item({ status: "scheduled", startsAt: new Date("2026-09-02T14:00:00Z") }),
  );
  assert.match(html, /agenda-now-next-label-session-399/);
  assert.match(html, />NEXT</);
});

test("Task #399 preserves newline-separated presenters and first-line marker layout", () => {
  assert.match(source, /className="flex items-start break-words"/);
  assert.match(source, /className="min-w-0 whitespace-pre-line"/);
  assert.match(
    source,
    /speakerMarker[\s\S]{0,1200}className="flex-none"[\s\S]{0,300}width: scale \* 1\.35/,
  );
});

test("Task #399 applies emergency wrapping to title, presenter, description, and status", () => {
  assert.match(source, /className="font-semibold leading-tight break-words"/);
  assert.match(source, /className="opacity-75 break-words"/);
  assert.match(source, /className={`mt-1 italic opacity-90/);
  assert.match(source, /overflowWrap: "anywhere"/);
});

test("Task #399 bounded rows retain an intrinsic minimum while remaining flexible", () => {
  assert.match(
    source,
    /gridTemplateRows:\s*`repeat\(\$\{numRows\}, minmax\(auto, 1fr\)\)`/,
  );
  assert.doesNotMatch(source, /maxHeight: "100%"/);
  assert.match(source, /cardRef\.current\.offsetHeight - viewport\.clientHeight/);
  assert.match(source, /flex-auto min-h-0 overflow-hidden/);
  assert.match(source, /ro\.observe\(viewport\)/);
  assert.match(source, /ro\.observe\(card\)/);
  assert.match(source, /ro\.observe\(inner\)/);
});

test("Task #399 portrait Full auto-scroll uses the same bounded grid path", () => {
  const portraitStart = source.indexOf("function PortraitCards");
  const portraitEnd = source.indexOf("function UltraWideGrid");
  assert.ok(portraitStart >= 0 && portraitEnd > portraitStart);
  const portrait = source.slice(portraitStart, portraitEnd);
  assert.match(portrait, /if \(scrollPageH != null\)/);
  assert.match(portrait, /<BoundedScrollGrid/);
  assert.match(portrait, /numCols=\{1\}/);
  assert.match(portrait, /scrollPageH=\{scrollPageH\}/);
});

test("Task #399 leaves compact cards and Now/Next rendering on their established paths", () => {
  assert.match(source, /isDescriptionAutoScrollMode\(/);
  assert.match(source, /nowNextLabel\?: NowNextItemLabel/);
  assert.match(source, /data-testid=\{tid\(`agenda-now-next-label-\$\{item\.id\}`\)\}/);
  assert.match(source, /columnsClass="columns-2"/);
});
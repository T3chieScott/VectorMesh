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
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgendaItem, AgendaWidgetConfig } from "../shared/schema";
import {
  AgendaDisplayWidget,
  resolveDescriptionViewportSizing,
} from "../client/src/components/agenda/AgendaDisplayWidget";

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
  dimensions = { width: 1920, height: 1080 },
): string {
  return renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: config(overrides),
      items: [agendaItem],
      width: dimensions.width,
      height: dimensions.height,
      now: NOW,
      timezone: "UTC",
    }),
  );
}

function openTag(html: string, testId: string): string {
  const match = html.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`));
  assert.ok(match, `expected ${testId} element`);
  return match[0];
}

test("Task #399 renders all six newline-separated presenters with one first-line marker", () => {
  const html = render();
  assert.ok(html.includes(SIX_PRESENTERS));
  assert.equal((html.match(/agenda-speaker-marker-session-399/g) ?? []).length, 1);
  assert.match(
    html,
    /agenda-presenter-session-399[\s\S]*<span class="flex-none" style="width:[^"]+">[\s\S]*agenda-presenter-viewport-session-399[\s\S]*Ada Lovelace\nGrace Hopper/,
  );
});

test("Task #399 preserves compact single-presenter markup", () => {
  const html = render(
    { descriptionLines: 2, descriptionAutoScroll: false },
    item({ presenter: "Ada Lovelace" }),
  );
  assert.match(html, /agenda-presenter-viewport-session-399[\s\S]*Ada Lovelace<\/span>/);
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

test("Task #400 short NOW/NEXT cards begin intrinsic with auto-scroll enabled", () => {
  const html = render(
    { displayMode: "now_next", showNowNextLabel: true },
    item({
      status: "scheduled",
      presenter: null,
      startsAt: new Date("2026-09-02T14:00:00Z"),
    }),
  );
  assert.match(html, /agenda-now-next-label-session-399/);
  assert.match(html, />NEXT</);
  const card = openTag(html, "agenda-row-session-399");
  const viewport = openTag(html, "agenda-description-viewport-session-399");
  assert.doesNotMatch(card, /height:100%|max-height:/);
  assert.doesNotMatch(viewport, /max-height:/);
});

test("Task #400 Full Agenda retains its existing intrinsic-card first paint", () => {
  const html = render(
    { displayMode: "full", showPresenter: false },
    item({ presenter: null }),
  );
  const card = openTag(html, "agenda-row-session-399");
  const viewport = openTag(html, "agenda-description-viewport-session-399");
  // Full's finite budget remains description-only after browser measurement;
  // no card maximum is emitted during intrinsic SSR first paint.
  assert.doesNotMatch(card, /max-height:/);
  assert.doesNotMatch(viewport, /max-height:/);
});

test("Task #400 only bounds a card after measured description overflow", () => {
  const fitting = resolveDescriptionViewportSizing({
    allocatedCardHeight: 600,
    naturalCardHeight: 220,
    fixedCardHeight: 120,
    descriptionContentHeight: 100,
    minimumViewportHeight: 18,
  });
  assert.deepEqual(fitting, { shouldBound: false, viewportMaxHeight: null });

  const overflowing = resolveDescriptionViewportSizing({
    allocatedCardHeight: 300,
    naturalCardHeight: 520,
    fixedCardHeight: 160,
    descriptionContentHeight: 360,
    minimumViewportHeight: 18,
  });
  assert.deepEqual(overflowing, { shouldBound: true, viewportMaxHeight: 140 });
});

test("Task #400 portrait 1080x1920 preserves semantic NEXT and intrinsic first paint", () => {
  const html = render(
    { displayMode: "now_next", layoutMode: "portrait", showNowNextLabel: true },
    item({ status: "scheduled", startsAt: new Date("2026-09-02T14:00:00Z") }),
    { width: 1080, height: 1920 },
  );
  assert.match(html, /agenda-row-session-399/);
  assert.match(html, /agenda-now-next-label-session-399/);
  assert.doesNotMatch(openTag(html, "agenda-row-session-399"), /height:100%/);
});
// Task #394 — Agenda description, speaker-marker, and NOW/NEXT styling.
// Uses the shared renderer directly, which is the surface used by editor
// preview, public agenda display, and player zones.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS,
  insertAgendaWidgetConfigSchema,
  isAgendaNowNextLabelApplicable,
  type AgendaItem,
  type AgendaWidgetConfig,
} from "../shared/schema";
import {
  AgendaDisplayWidget,
  BOTTOM_PAUSE_MS,
  resolveAgendaPresentationDwellMs,
  TOP_PAUSE_MS,
} from "../client/src/components/agenda/AgendaDisplayWidget";

const NOW = new Date("2026-09-02T12:00:00Z");

function config(overrides: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: "cfg-394",
    clientId: "client-1",
    name: "Agenda styling",
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
    accentColor: "#c026d3",
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
    id: "item-1",
    clientId: "client-1",
    title: "Accessible agendas",
    description: "A useful session description.",
    room: "Hall A",
    track: "Design",
    presenter: "Dr. Example",
    startsAt: new Date("2026-09-02T11:30:00Z"),
    endsAt: new Date("2026-09-02T12:30:00Z"),
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
): string {
  return renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: config(configOverrides),
      items,
      width: 1920,
      height: 1080,
      now: NOW,
    }),
  );
}

test("Task #394 schema preserves all legacy styling defaults", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({
    clientId: "client-1",
    name: "Legacy config",
  });
  assert.equal(parsed.showDescriptionDivider, false);
  assert.equal(parsed.speakerMarkerStyle, "microphone");
  assert.equal(parsed.descriptionTextAlign, "left");
  assert.equal(parsed.showNowNextLabel, false);
});

test("Task #394 schema rejects invalid marker and alignment values", () => {
  assert.equal(
    insertAgendaWidgetConfigSchema.safeParse({
      clientId: "client-1",
      name: "Invalid marker",
      speakerMarkerStyle: "triangle",
    }).success,
    false,
  );
  assert.equal(
    insertAgendaWidgetConfigSchema.safeParse({
      clientId: "client-1",
      name: "Invalid alignment",
      descriptionTextAlign: "center",
    }).success,
    false,
  );
});

test("Task #394 schema trims custom markers and enforces the glyph limit", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({
    clientId: "client-1",
    name: "Custom marker",
    speakerMarkerStyle: "custom",
    speakerCustomMarker: "  ✦  ",
  });
  assert.equal(parsed.speakerCustomMarker, "✦");
  assert.equal(
    insertAgendaWidgetConfigSchema.safeParse({
      clientId: "client-1",
      name: "Too long",
      speakerMarkerStyle: "custom",
      speakerCustomMarker: "x".repeat(
        AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS + 1,
      ),
    }).success,
    false,
  );
});

test("Task #394 description divider is hidden by default", () => {
  assert.equal(render().includes("agenda-description-divider-item-1"), false);
});

test("Task #394 description divider uses the accent and requires a description", () => {
  const withDescription = render({ showDescriptionDivider: true });
  assert.ok(withDescription.includes("agenda-description-divider-item-1"));
  assert.ok(withDescription.includes("background-color:#c026d3"));

  const withoutDescription = render(
    { showDescriptionDivider: true },
    [item({ description: null })],
  );
  assert.equal(withoutDescription.includes("agenda-description-divider-item-1"), false);
});

test("Task #394 divider remains outside the scrolling description viewport", () => {
  const html = render({
    showDescriptionDivider: true,
    descriptionLines: null,
    descriptionAutoScroll: true,
  });
  const divider = html.indexOf("agenda-description-divider-item-1");
  const viewport = html.indexOf("agenda-description-viewport-item-1");
  assert.ok(divider >= 0 && viewport > divider);
});

test("Task #396 scrolling divider is the viewport boundary and its breathing room moves with content", () => {
  const html = render({
    showDescriptionDivider: true,
    descriptionLines: null,
    descriptionAutoScroll: true,
  });
  const dividerTag = html.match(
    /<div[^>]*class="[^"]*mb-0[^"]*"[^>]*data-testid="agenda-description-divider-item-1"[^>]*>/,
  );
  const viewportTag = html.match(
    /<div[^>]*class="([^"]*)"[^>]*data-testid="agenda-description-viewport-item-1"[^>]*>/,
  );
  const descriptionTag = html.match(
    /<p[^>]*style="([^"]*)"[^>]*data-testid="agenda-description-item-1"[^>]*>/,
  );

  assert.ok(dividerTag, "scrolling divider should have no margin below it");
  assert.ok(viewportTag, "scrolling viewport should render");
  assert.equal(viewportTag[1].split(/\s+/).includes("mt-1"), false);
  assert.match(descriptionTag?.[1] ?? "", /padding-top:0\.5rem/);
});

test("Task #396 divider-off and fixed-line description spacing remain unchanged", () => {
  const scrollingWithoutDivider = render({
    showDescriptionDivider: false,
    descriptionLines: null,
    descriptionAutoScroll: true,
  });
  assert.match(
    scrollingWithoutDivider,
    /class="[^"]*mt-1[^"]*"[^>]*data-testid="agenda-description-viewport-item-1"/,
  );
  assert.doesNotMatch(
    scrollingWithoutDivider,
    /padding-top:0\.5rem[^"]*"[^>]*data-testid="agenda-description-item-1"/,
  );

  const fixed = render({
    showDescriptionDivider: true,
    descriptionLines: 2,
    descriptionAutoScroll: false,
  });
  assert.match(
    fixed,
    /class="[^"]*mb-1[^"]*"[^>]*data-testid="agenda-description-divider-item-1"/,
  );
  assert.match(
    fixed,
    /class="mt-1 opacity-75 break-words"[^>]*data-testid="agenda-description-item-1"/,
  );
});

test("Task #394 omitted speaker marker keeps the legacy microphone", () => {
  const cfg = config();
  delete (cfg as Partial<AgendaWidgetConfig>).speakerMarkerStyle;
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: cfg,
      items: [item()],
      width: 1920,
      height: 1080,
      now: NOW,
    }),
  );
  assert.ok(html.includes("🎤"));
  assert.ok(html.includes("Dr. Example"));
});

test("Task #394 renders microphone, circle, square, custom, and none markers", () => {
  assert.ok(render({ speakerMarkerStyle: "microphone" }).includes("🎤"));

  const circle = render({ speakerMarkerStyle: "circle" });
  assert.ok(circle.includes("●"));
  assert.ok(circle.includes("color:#c026d3"));

  const square = render({ speakerMarkerStyle: "square" });
  assert.ok(square.includes("■"));
  assert.ok(square.includes("color:#c026d3"));

  const custom = render({
    speakerMarkerStyle: "custom",
    speakerCustomMarker: "✦",
  });
  assert.ok(custom.includes("✦"));

  const none = render({ speakerMarkerStyle: "none" });
  assert.equal(none.includes("agenda-speaker-marker-item-1"), false);
  assert.ok(none.includes("Dr. Example"));
});

test("Task #394 custom speaker markers render as escaped text", () => {
  const html = render({
    speakerMarkerStyle: "custom",
    speakerCustomMarker: "<&",
  });
  assert.ok(html.includes("&lt;&amp;"));
  assert.equal(html.includes("<&"), false);
  assert.ok(html.includes("Dr. Example"));
});

test("Task #394 empty or overlong stored custom markers safely fall back to microphone", () => {
  assert.ok(
    render({
      speakerMarkerStyle: "custom",
      speakerCustomMarker: "   ",
    }).includes("🎤"),
  );
  assert.ok(
    render({
      speakerMarkerStyle: "custom",
      speakerCustomMarker: "x".repeat(
        AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS + 1,
      ),
    }).includes("🎤"),
  );
});

test("Task #394 description alignment applies to fixed and scrolling descriptions only", () => {
  const fixed = render({ descriptionTextAlign: "justify", descriptionLines: 2 });
  assert.match(
    fixed,
    /style="[^"]*text-align:justify[^"]*"[^>]*data-testid="agenda-description-item-1"/,
  );
  assert.doesNotMatch(
    fixed,
    /style="[^"]*text-align:justify[^"]*"[^>]*data-testid="agenda-title-item-1"/,
  );

  const scrolling = render({
    descriptionTextAlign: "justify",
    descriptionLines: null,
    descriptionAutoScroll: true,
  });
  assert.match(
    scrolling,
    /style="[^"]*text-align:justify[^"]*"[^>]*data-testid="agenda-description-item-1"/,
  );
});

test("Task #394 omitted description alignment remains left aligned", () => {
  const cfg = config();
  delete (cfg as Partial<AgendaWidgetConfig>).descriptionTextAlign;
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: cfg,
      items: [item()],
      width: 1920,
      height: 1080,
      now: NOW,
    }),
  );
  assert.match(
    html,
    /style="[^"]*text-align:left[^"]*"[^>]*data-testid="agenda-description-item-1"/,
  );
});

test("Task #394 NOW/NEXT control applicability excludes unrelated and purpose-built layouts", () => {
  assert.equal(isAgendaNowNextLabelApplicable("full", "landscape"), false);
  assert.equal(isAgendaNowNextLabelApplicable("now_next", "landscape"), true);
  assert.equal(isAgendaNowNextLabelApplicable("now_next", "auto"), true);
  assert.equal(isAgendaNowNextLabelApplicable("now_next", "totem"), false);
  assert.equal(isAgendaNowNextLabelApplicable("now_next", "room_door"), false);
});

test("Task #394 enabled NOW/NEXT labels identify current and upcoming cards", () => {
  const html = render(
    {
      displayMode: "now_next",
      showNowNextLabel: true,
    },
    [
      item({ id: "current" }),
      item({
        id: "upcoming",
        startsAt: new Date("2026-09-02T13:00:00Z"),
        endsAt: new Date("2026-09-02T14:00:00Z"),
        status: "scheduled",
      }),
    ],
  );
  assert.match(html, /data-testid="agenda-now-next-label-current"[^>]*>NOW</);
  assert.match(html, /data-testid="agenda-now-next-label-upcoming"[^>]*>NEXT</);
});

test("Task #394 disabled NOW/NEXT labels preserve the existing card output", () => {
  const html = render({
    displayMode: "now_next",
    showNowNextLabel: false,
  });
  assert.equal(html.includes("agenda-now-next-label-item-1"), false);
});

test("Task #394 purpose-built totem layout does not receive duplicate card labels", () => {
  const html = render({
    displayMode: "now_next",
    layoutMode: "totem",
    showNowNextLabel: true,
  });
  assert.equal(html.includes("agenda-now-next-label-item-1"), false);
});

test("Task #394 public payload and editor carry every additive field", () => {
  const routes = readFileSync("server/agendaRoutes.ts", "utf8");
  const editor = readFileSync("client/src/pages/agenda-configs.tsx", "utf8");
  for (const field of [
    "showDescriptionDivider",
    "speakerMarkerStyle",
    "speakerCustomMarker",
    "descriptionTextAlign",
    "showNowNextLabel",
  ]) {
    assert.ok(routes.includes(`"${field}"`), `${field} missing from public allowlist`);
    assert.ok(routes.includes(`${field}: config.${field}`), `${field} missing from public payload`);
    assert.ok(editor.includes(`${field}: values.${field}`) || editor.includes(`values.${field}`));
  }
});

test("Task #394 migration is additive, idempotent, and non-destructive", () => {
  const sql = readFileSync(
    "migrations/0032_agenda_content_styling.sql",
    "utf8",
  );
  for (const column of [
    "show_description_divider",
    "speaker_marker_style",
    "speaker_custom_marker",
    "description_text_align",
    "show_now_next_label",
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, "i"),
    );
  }
  assert.doesNotMatch(sql, /\b(DROP|RENAME|ALTER\s+COLUMN|TRUNCATE|DELETE)\b/i);
});

test("Task #394 recent agenda safeguards remain present", () => {
  const renderer = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf8",
  );
  assert.match(
    renderer,
    /const rowTrack = nowNextMode\s*\?\s*"minmax\(0, 1fr\)"\s*:\s*"max-content"/,
  );
  assert.ok(renderer.includes('className={`flex ${nowNextMode && scrollEnabled ? "items-stretch" : "items-start"}'));
  assert.ok(renderer.includes('nowNextMode && scrollEnabled ? " h-full self-stretch" : ""'));
  assert.equal(renderer.includes("minmax(auto, 1fr)"), false);
  assert.equal(renderer.includes('maxHeight: "100%"'), false);
  assert.ok(renderer.includes("cardRef.current.offsetHeight - viewport.clientHeight"));
  assert.ok(renderer.includes("maxHeight: descriptionViewportMaxHeight"));
  assert.ok(renderer.includes("pageItemCount={numRows}"));
  assert.ok(renderer.includes("flex-auto min-h-0 overflow-hidden"));
  assert.ok(renderer.includes("new ResizeObserver"));
  assert.ok(renderer.includes("inner.scrollHeight - viewport.clientHeight"));
  // Rotation semantics are intentionally exercised through the exported
  // helper, rather than coupling this safeguard to an implementation string.
  assert.equal(
    resolveAgendaPresentationDwellMs(12_000, ["page-a"], {}, true),
    12_000,
  );
  assert.equal(
    resolveAgendaPresentationDwellMs(3_000, ["page-a"], { "page-a": 56 }, true),
    TOP_PAUSE_MS + 2_000 + BOTTOM_PAUSE_MS,
  );
  // Only IDs on the active page contribute to that page's timer.
  assert.equal(
    resolveAgendaPresentationDwellMs(5_000, ["page-b"], { "page-a": 560 }, true),
    5_000,
  );
});

test("Task #394 room remains visible when Track is disabled", () => {
  const html = render({ showTrack: false });
  assert.ok(html.includes("Hall A"));
  assert.equal(html.includes("Design"), false);
});
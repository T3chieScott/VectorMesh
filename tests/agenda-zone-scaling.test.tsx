// Task #234 — agenda renders identically inside layout zones.
//
// Pins three behaviours so the "in-zone render must look like the
// /display/agenda/:configId page" guarantee can't silently drift:
//
//   1. pickAgendaLayout honours an explicit layoutMode regardless of
//      container aspect ratio — operators get the variant they picked.
//   2. fontScale + density are container-relative multipliers,
//      calibrated so a 1920×1080 container at "normal/normal" still
//      produces the legacy 18 px font / 12 px gap.
//   3. The widget threads the resolved scale into the rendered DOM
//      (event title is 1.5× the resolved scale).

import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pickAgendaLayout } from "../shared/agenda-resolver";
import {
  AgendaDisplayWidget,
  AGENDA_FONT_SCALE_RATIO,
  AGENDA_DENSITY_GAP_RATIO,
  resolveAgendaFontPx,
  resolveAgendaGapPx,
} from "../client/src/components/agenda/AgendaDisplayWidget";
import type { AgendaItem, AgendaWidgetConfig } from "../shared/schema";

function buildConfig(over: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: "cfg1",
    clientId: "c1",
    name: "T234 cfg",
    displayMode: "full",
    layoutMode: "landscape",
    fontScale: "normal",
    density: "normal",
    theme: "dark",
    accentColor: "#0ea5e9",
    fontFamily: null,
    titleColor: null,
    bodyColor: null,
    timeColor: null,
    statusColor: null,
    backgroundUrl: null,
    eventName: "Conference",
    showEventName: true,
    showCurrentTime: true,
    showDescription: true,
    showPresenter: true,
    showRoom: true,
    showStatus: true,
    maxItemsPerPage: 8,
    pageRotationSeconds: 30,
    timeWindowMinutes: null,
    roomFilter: [],
    trackFilter: [],
    statusFilter: [],
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...over,
  } as AgendaWidgetConfig;
}

function buildItem(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "i1",
    clientId: "c1",
    title: "Opening keynote",
    description: "Kickoff talk",
    room: "Hall A",
    track: "Main",
    presenter: "Dr. Example",
    startsAt: new Date(Date.now() - 5 * 60_000),
    endsAt: new Date(Date.now() + 55 * 60_000),
    status: "scheduled",
    statusMessage: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...over,
  } as AgendaItem;
}

// ---------- 1. pickAgendaLayout honours explicit mode ----------------

test("pickAgendaLayout returns explicit layout regardless of container ratio", () => {
  // 1920×1080 (landscape) but operator wants portrait → portrait wins
  assert.equal(
    pickAgendaLayout("portrait", 1920, 1080, "full"),
    "portrait",
  );
  // 1080×1920 (portrait) but operator wants ultrawide → ultrawide wins
  assert.equal(
    pickAgendaLayout("ultrawide", 1080, 1920, "full"),
    "ultrawide",
  );
  // Operator wants totem → totem wins even in landscape now_next
  assert.equal(
    pickAgendaLayout("totem", 1920, 1080, "now_next"),
    "totem",
  );
});

test("pickAgendaLayout auto still consults aspect ratio + display mode", () => {
  assert.equal(pickAgendaLayout("auto", 3840, 1080, "full"), "ultrawide");
  assert.equal(pickAgendaLayout("auto", 1920, 1080, "full"), "landscape");
  assert.equal(pickAgendaLayout("auto", 1080, 1920, "full"), "portrait");
  assert.equal(pickAgendaLayout("auto", 1920, 1080, "room_focus"), "room_door");
});

// ---------- 2. Container-relative scaling calibration ---------------

test("scale/gap at 1920×1080 normal exactly match the legacy pixel values", () => {
  // The whole point of the multiplier tables: existing 1080p displays
  // must not visually shift. min(1920,1080) === 1080, so:
  //   18/1080 * 1080 === 18, and 12/1080 * 1080 === 12.
  assert.equal(resolveAgendaFontPx("normal", 1920, 1080), 18);
  assert.equal(resolveAgendaGapPx("normal", 1920, 1080), 12);
});

test("scale/gap at 1080×1920 portrait normal also match the legacy pixel values", () => {
  // Architect-requested parity check: a portrait 1080×1920 screen has
  // min(1080,1920) === 1080, so the same calibration must hold — an
  // operator rotating a landscape screen to portrait should not see
  // their typography jump. Same min-dim, same px.
  assert.equal(resolveAgendaFontPx("normal", 1080, 1920), 18);
  assert.equal(resolveAgendaGapPx("normal", 1080, 1920), 12);
});

test("scale/gap respond to container size (smaller zones → smaller text)", () => {
  // Half-size zone (e.g. 960×540 inside a 1080p layout) → half the
  // resolved font/gap.
  assert.equal(resolveAgendaFontPx("normal", 960, 540), 9);
  assert.equal(resolveAgendaGapPx("normal", 960, 540), 6);
  // Larger LED-wall zone (e.g. 3840×2160) → proportionally larger.
  assert.equal(resolveAgendaFontPx("normal", 3840, 2160), 36);
  assert.equal(resolveAgendaGapPx("normal", 3840, 2160), 24);
});

test("scale/gap honour the explicit fontScale + density tiers", () => {
  // At 1080p min-dim each tier maps to its calibrated pixel size.
  assert.equal(resolveAgendaFontPx("small", 1920, 1080), 14);
  assert.equal(resolveAgendaFontPx("large", 1920, 1080), 22);
  assert.equal(resolveAgendaFontPx("xlarge", 1920, 1080), 28);
  assert.equal(resolveAgendaGapPx("compact", 1920, 1080), 6);
  assert.equal(resolveAgendaGapPx("spacious", 1920, 1080), 20);
});

test("ratio tables are exposed for cross-tool reuse", () => {
  assert.equal(AGENDA_FONT_SCALE_RATIO.normal, 18 / 1080);
  assert.equal(AGENDA_DENSITY_GAP_RATIO.normal, 12 / 1080);
});

test("tiny container clamps to legible minimum (no zero-px text)", () => {
  // A 40×30 thumbnail in the picker would otherwise resolve to ~0.5 px.
  const px = resolveAgendaFontPx("normal", 40, 30);
  assert.ok(px >= 6, `expected floor of 6 px, got ${px}`);
});

// ---------- 3. Resolved scale threads into the rendered DOM ---------

function eventTitleFontSize(html: string): number | null {
  // React SSR emits the open tag with `style` before `data-testid`, so
  // pull the tag for the event-title testid and sniff its font-size.
  const tag = html.match(/<[^>]*data-testid="agenda-event-title"[^>]*>/);
  if (!tag) return null;
  const m = tag[0].match(/font-size:([0-9.]+)px/);
  return m ? Number(m[1]) : null;
}

test("widget at 1920×1080 normal renders the 27 px event title (1.5×18)", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig(),
      items: [buildItem()],
      width: 1920,
      height: 1080,
    }),
  );
  assert.equal(eventTitleFontSize(html), 27);
});

test("widget inside a small zone shrinks the event title proportionally", () => {
  // 480×320 zone: min=320 → scale = 320 * 18/1080 = 5.33; widget floor
  // bumps it to 6 px, so event title = 6 * 1.5 = 9 px. Either way, it
  // must be < the 1080p value (27 px). This is the whole point of #234.
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig(),
      items: [buildItem()],
      width: 480,
      height: 320,
    }),
  );
  const size = eventTitleFontSize(html);
  assert.ok(size !== null, "event title font-size missing");
  assert.ok(size! < 27, `expected scaled font-size < 27, got ${size}`);
});

test("widget honours explicit layoutMode via data-layout attribute", () => {
  // Landscape container but config asks for portrait → DOM must say
  // data-layout="portrait", proving the layout pick wasn't overridden
  // by the aspect ratio when operator picked a specific variant.
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ layoutMode: "portrait" }),
      items: [buildItem()],
      width: 1920,
      height: 1080,
    }),
  );
  assert.match(html, /data-layout="portrait"/);
});

test("widget with layoutMode='auto' picks landscape for 1920×1080", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ layoutMode: "auto" }),
      items: [buildItem()],
      width: 1920,
      height: 1080,
    }),
  );
  assert.match(html, /data-layout="landscape"/);
});

// Task #231 — agenda widget text formatting (system-font picker
// + 4 role-based colour overrides). This suite pins three things:
//   1. insertAgendaWidgetConfigSchema accepts the new fields when
//      blank/null/valid, and rejects bad hex / unknown font keys.
//   2. AgendaDisplayWidget renders the curated CSS font stack for
//      each known fontFamily key, and falls back to the default
//      Inter stack when the key is null/unknown — so existing
//      configs render identically.
//   3. The four role colours actually thread down to the right
//      elements in the DOM (title → event title, time → clock +
//      time chips, body → session title, status → badge text).
//
// No DB writes, no Playwright — renderToStaticMarkup is enough.

import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  insertAgendaWidgetConfigSchema,
  AGENDA_FONT_FAMILY_STACKS,
  AGENDA_DEFAULT_FONT_STACK,
  type AgendaItem,
  type AgendaWidgetConfig,
} from "../shared/schema";
import { AgendaDisplayWidget } from "../client/src/components/agenda/AgendaDisplayWidget";

// ---------- helpers ----------------------------------------------------

const BASE_INSERT = {
  clientId: "c1",
  name: "T231 cfg",
  displayMode: "full" as const,
  layoutMode: "landscape" as const,
  fontScale: "normal" as const,
  density: "normal" as const,
  theme: "dark" as const,
};

function buildConfig(over: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: "cfg1",
    clientId: "c1",
    name: "T231 render cfg",
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
    eventName: "Conference 2026",
    showEventName: true,
    showCurrentTime: true,
    showDescription: true,
    showPresenter: true,
    showRoom: true,
    showStatus: true,
    showDayName: false,
    showDate: false,
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

// ---------- 1. schema validation --------------------------------------

test("insertAgendaWidgetConfigSchema: all new fields are optional", () => {
  const r = insertAgendaWidgetConfigSchema.safeParse(BASE_INSERT);
  assert.equal(r.success, true, JSON.stringify(r));
});

test("insertAgendaWidgetConfigSchema: null is accepted for every new field", () => {
  const r = insertAgendaWidgetConfigSchema.safeParse({
    ...BASE_INSERT,
    fontFamily: null,
    titleColor: null,
    bodyColor: null,
    timeColor: null,
    statusColor: null,
  });
  assert.equal(r.success, true, JSON.stringify(r));
});

test("insertAgendaWidgetConfigSchema: valid font + 6-char hex colours accepted", () => {
  const r = insertAgendaWidgetConfigSchema.safeParse({
    ...BASE_INSERT,
    fontFamily: "serif",
    titleColor: "#ff8800",
    bodyColor: "#fff",
    timeColor: "#00FFAA",
    statusColor: "#abc",
  });
  assert.equal(r.success, true, JSON.stringify(r));
});

test("insertAgendaWidgetConfigSchema: rejects unknown font family key", () => {
  const r = insertAgendaWidgetConfigSchema.safeParse({
    ...BASE_INSERT,
    fontFamily: "comic-sans" as any,
  });
  assert.equal(r.success, false);
});

test("insertAgendaWidgetConfigSchema: rejects non-hex colour strings", () => {
  for (const bad of ["red", "rgb(255,0,0)", "ff0000", "#1234", "#xyzxyz", ""]) {
    const r = insertAgendaWidgetConfigSchema.safeParse({
      ...BASE_INSERT,
      titleColor: bad,
    });
    assert.equal(r.success, false, `expected reject for ${JSON.stringify(bad)}`);
  }
});

// ---------- 2. font-family stack threading ----------------------------

test("renderer: omitted fontFamily falls back to the default Inter stack", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ fontFamily: null }),
      items: [buildItem()],
      width: 1920,
      height: 1080,
    }),
  );
  assert.ok(
    html.includes(`font-family:${AGENDA_DEFAULT_FONT_STACK}`),
    "expected default Inter stack in rendered style",
  );
});

test("renderer: known fontFamily keys emit their curated CSS stack", () => {
  // React SSR HTML-encodes double quotes inside style attrs, so
  // compare against the encoded form for stacks that contain
  // multi-word font names like `"Segoe UI"`.
  const encode = (s: string) => s.replace(/"/g, "&quot;");
  for (const key of Object.keys(AGENDA_FONT_FAMILY_STACKS) as Array<
    keyof typeof AGENDA_FONT_FAMILY_STACKS
  >) {
    const html = renderToStaticMarkup(
      React.createElement(AgendaDisplayWidget, {
        config: buildConfig({ fontFamily: key }),
        items: [buildItem()],
        width: 1920,
        height: 1080,
      }),
    );
    const stack = AGENDA_FONT_FAMILY_STACKS[key];
    assert.ok(
      html.includes(`font-family:${encode(stack)}`),
      `expected stack for "${key}" (${stack}) in rendered style`,
    );
  }
});

test("renderer: unknown fontFamily key in DB falls back to default", () => {
  // Defends against future renames — a stale row with a key we no
  // longer recognise must NOT break the page.
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ fontFamily: "retired-key" as any }),
      items: [buildItem()],
      width: 1920,
      height: 1080,
    }),
  );
  assert.ok(html.includes(`font-family:${AGENDA_DEFAULT_FONT_STACK}`));
});

// ---------- 3. role-colour threading ----------------------------------

function attrOn(html: string, testid: string): string {
  // Pull the open tag for a given data-testid so we can sniff its
  // inline `style="..."` attribute.
  const re = new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`);
  const m = html.match(re);
  return m ? m[0] : "";
}

test("renderer: with no overrides, no inline colour is forced on role elements", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig(),
      items: [buildItem({ id: "row" })],
      width: 1920,
      height: 1080,
    }),
  );
  // Sanity: clock + event title + row exist
  assert.ok(attrOn(html, "agenda-clock").length > 0, "clock present");
  assert.ok(attrOn(html, "agenda-event-title").length > 0, "event title present");
  // No `color:` inline style on these (theme classes drive colour).
  assert.ok(!/color:/i.test(attrOn(html, "agenda-clock")));
  assert.ok(!/color:/i.test(attrOn(html, "agenda-event-title")));
  assert.ok(!/color:/i.test(attrOn(html, "agenda-title-row")));
});

test("renderer: titleColor applies to event title, timeColor to clock + time chips", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({
        titleColor: "#ff0000",
        timeColor: "#00ff00",
      }),
      items: [buildItem({ id: "row" })],
      width: 1920,
      height: 1080,
    }),
  );
  assert.match(attrOn(html, "agenda-event-title"), /color:#ff0000/i);
  assert.match(attrOn(html, "agenda-clock"), /color:#00ff00/i);
  assert.match(attrOn(html, "agenda-time-start-row"), /color:#00ff00/i);
  assert.match(attrOn(html, "agenda-time-end-row"), /color:#00ff00/i);
  // Body untouched (no bodyColor set)
  assert.ok(!/color:/i.test(attrOn(html, "agenda-title-row")));
});

test("renderer: bodyColor applies to session title + room/presenter line", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ bodyColor: "#123456" }),
      items: [buildItem({ id: "row" })],
      width: 1920,
      height: 1080,
    }),
  );
  assert.match(attrOn(html, "agenda-title-row"), /color:#123456/i);
});

test("renderer: statusColor overrides badge text colour, keeps per-status tint background", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ statusColor: "#abcdef" }),
      items: [buildItem({ id: "row", status: "in_progress" as any })],
      width: 1920,
      height: 1080,
    }),
  );
  const badge = attrOn(html, "agenda-status-in_progress");
  assert.match(badge, /color:#abcdef/i, "status text colour override applied");
  // Per-status tint class survives (background semantic stays).
  assert.match(badge, /bg-emerald-/, "expected emerald background tint for in_progress badge");
  assert.match(badge, /border-emerald-/);
});

// ---------- 3b. light-theme card chrome ------------------------------

test("renderer: light theme applies theme-aware card chrome vars (no white-on-white)", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ theme: "light" }),
      items: [buildItem({ id: "row" })],
      width: 1920,
      height: 1080,
    }),
  );
  // Root exposes the light-mode chrome variables…
  assert.match(html, /--ag-card-bg:\s*rgba\(15,23,42/);
  assert.match(html, /--ag-border:\s*rgba\(15,23,42/);
  // …and the card row consumes them instead of hardcoded white utilities.
  const row = attrOn(html, "agenda-row-row");
  assert.match(row, /var\(--ag-card-bg\)/, "card bg should read the theme var");
  assert.match(row, /var\(--ag-border\)/, "card border should read the theme var");
  // The legacy white-on-white classes must be gone.
  assert.ok(!/bg-white\/5|border-white\/10/.test(row));
});

test("renderer: status badge omits forced light text so it reads on light theme", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ theme: "light" }),
      items: [buildItem({ id: "row", status: "in_progress" as any })],
      width: 1920,
      height: 1080,
    }),
  );
  const badge = attrOn(html, "agenda-status-in_progress");
  assert.ok(badge.length > 0, "status badge present");
  // Per-status tint stays, but baked-in light text classes are gone so
  // the label inherits the dark theme text colour on a white background.
  assert.match(badge, /bg-emerald-/);
  assert.ok(!/text-emerald-100|text-slate-100/.test(badge));
});

// ---------- 4. Task #240 — day/date header chunks ---------------------

test("renderer: agenda-day-date is omitted when both showDayName and showDate are false", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ showDayName: false, showDate: false }),
      items: [buildItem({ id: "row", startsAt: new Date("2026-06-15T09:00:00Z"), endsAt: new Date("2026-06-15T10:00:00Z") })],
      width: 1920,
      height: 1080,
      timezone: "UTC",
    }),
  );
  assert.equal(attrOn(html, "agenda-day-date").length, 0, "header day/date block should be absent by default");
});

test("renderer: showDayName renders the weekday derived from the first item's startsAt in the given tz", () => {
  // 2026-06-15 09:00 UTC = Monday. In London (BST, UTC+1) it's still Monday.
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ showDayName: true, showDate: false }),
      items: [buildItem({ id: "row", startsAt: new Date("2026-06-15T09:00:00Z"), endsAt: new Date("2026-06-15T10:00:00Z") })],
      width: 1920,
      height: 1080,
      timezone: "Europe/London",
    }),
  );
  assert.ok(attrOn(html, "agenda-day-name").length > 0, "day-name chunk should render");
  assert.match(html, />Monday</, "weekday should be Monday");
  // Date chunk should not be rendered when only showDayName is on.
  assert.equal(attrOn(html, "agenda-date").length, 0);
});

test("renderer: showDate renders a long-form date in the given tz", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgendaDisplayWidget, {
      config: buildConfig({ showDayName: false, showDate: true }),
      items: [buildItem({ id: "row", startsAt: new Date("2026-06-15T09:00:00Z"), endsAt: new Date("2026-06-15T10:00:00Z") })],
      width: 1920,
      height: 1080,
      timezone: "Europe/London",
    }),
  );
  assert.ok(attrOn(html, "agenda-date").length > 0, "date chunk should render");
  assert.match(html, /June/, "long-form month name should be rendered");
  assert.match(html, /2026/, "year should be rendered");
});

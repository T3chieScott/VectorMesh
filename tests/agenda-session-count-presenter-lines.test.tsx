import "./setup-jsdom";

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
  buildAgendaSettingsClipboardPayload,
  parseAgendaSettingsClipboardPayload,
} from "../shared/agenda-settings-clipboard";
import {
  AgendaDisplayWidget,
  measurePresenterOverflow,
  resolveAgendaPresentationDwellMs,
  resolvePresenterVisibleLines,
  sanitizeAgendaPresentationState,
} from "../client/src/components/agenda/AgendaDisplayWidget";
import { PUBLIC_AGENDA_CONFIG_FIELDS } from "../server/agendaRoutes";

const now = new Date("2026-09-02T12:00:00Z");
function config(overrides: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    ...insertAgendaWidgetConfigSchema.parse({ clientId: "site", name: "Agenda" }),
    showPresenter: true,
    showSessionCount: true,
    id: "config", createdAt: now, updatedAt: now, ...overrides,
  } as AgendaWidgetConfig;
}
const item: AgendaItem = {
  id: "one", clientId: "site", title: "One", description: null, room: null,
  track: null, presenter: "Avery\nBlake\nCasey\nDevon\nEmery", startsAt: now,
  endsAt: new Date("2026-09-02T13:00:00Z"), status: "scheduled",
  statusMessage: null, sortOrder: 0, externalId: null, createdAt: now, updatedAt: now,
};

test("0036 has idempotent defaults and presenter bounds", () => {
  const sql = readFileSync("migrations/0036_agenda_session_count_presenter_lines.sql", "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS show_session_count BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(sql, /presenter_visible_lines INTEGER NOT NULL DEFAULT 4/);
  assert.match(sql, /BETWEEN 1 AND 20/);
  const startup = readFileSync("server/index.ts", "utf8");
  assert.match(startup, /ensureAgendaSessionCountPresenterLinesMigration/);
  assert.ok(PUBLIC_AGENDA_CONFIG_FIELDS.includes("showSessionCount"));
  assert.ok(PUBLIC_AGENDA_CONFIG_FIELDS.includes("presenterVisibleLines"));
});

test("schema defaults and rejects invalid presenter line values", () => {
  const parsed = insertAgendaWidgetConfigSchema.parse({ clientId: "site", name: "A" });
  assert.equal(parsed.showSessionCount, true);
  assert.equal(parsed.presenterVisibleLines, 4);
  assert.equal(insertAgendaWidgetConfigSchema.safeParse({ clientId: "site", name: "A", presenterVisibleLines: 0 }).success, false);
  assert.equal(insertAgendaWidgetConfigSchema.safeParse({ clientId: "site", name: "A", presenterVisibleLines: 21 }).success, false);
  assert.equal(insertAgendaWidgetConfigSchema.safeParse({ clientId: "site", name: "A", presenterVisibleLines: 1.5 }).success, false);
});

test("clipboard carries bounded new presentation settings", () => {
  const payload = buildAgendaSettingsClipboardPayload({ presenterVisibleLines: 20, showSessionCount: false });
  assert.deepEqual(parseAgendaSettingsClipboardPayload(JSON.stringify(payload)), { presenterVisibleLines: 20, showSessionCount: false });
  assert.deepEqual(parseAgendaSettingsClipboardPayload(JSON.stringify({
    ...payload, settings: { presenterVisibleLines: "7" },
  })), { presenterVisibleLines: 7 });
  assert.equal(buildAgendaSettingsClipboardPayload({ presenterVisibleLines: "9" }).settings.presenterVisibleLines, 9);
  assert.throws(() => parseAgendaSettingsClipboardPayload(JSON.stringify({
    ...payload, settings: { presenterVisibleLines: 21 },
  })), /presenterVisibleLines/);
});

test("editor exposes session count and disabled speaker-line explanation", () => {
  const editor = readFileSync("client/src/pages/agenda-configs.tsx", "utf8");
  assert.match(editor, /showSessionCount/);
  assert.match(editor, /Visible speaker lines before scrolling/);
  assert.match(editor, /Enable Presenter to apply this limit/);
  assert.match(editor, /min=\{1\}/);
  assert.match(editor, /max=\{20\}/);
});

test("session count can be removed without changing singular/plural wording", () => {
  const single = renderToStaticMarkup(<AgendaDisplayWidget config={config()} items={[item]} width={800} height={500} now={now} timezone="UTC" />);
  assert.match(single, /1 session/);
  assert.match(single, /agenda-session-count/);
  const hidden = renderToStaticMarkup(<AgendaDisplayWidget config={config({ showSessionCount: false })} items={[item]} width={800} height={500} now={now} timezone="UTC" />);
  assert.doesNotMatch(hidden, /agenda-session-count|1 session/);
  const noHeader = renderToStaticMarkup(<AgendaDisplayWidget config={config({
    showSessionCount: false,
    showEventName: false,
    showCurrentTime: false,
    showDate: false,
  })} items={[item]} width={800} height={500} now={now} timezone="UTC" />);
  assert.doesNotMatch(noHeader, /<header|agenda-header-primary|padding-bottom/);
});

test("presenter viewport clamps to configured line range and overflow extends dwell", () => {
  assert.equal(resolvePresenterVisibleLines(1), 1);
  assert.equal(resolvePresenterVisibleLines(20), 20);
  assert.equal(resolvePresenterVisibleLines(0), 4);
  assert.equal(resolvePresenterVisibleLines(21), 4);
  const markup = renderToStaticMarkup(<AgendaDisplayWidget config={config({ presenterVisibleLines: 1 })} items={[item]} width={800} height={500} now={now} timezone="UTC" />);
  assert.match(markup, /agenda-presenter-viewport-one/);
  assert.match(markup, /max-height:1.25em/);
  assert.equal(
    resolveAgendaPresentationDwellMs(3000, ["one"], {
      "description:one": 100,
      "presenter:one": 160,
    }, true),
    3000 + 3000 + Math.ceil(160 / 28 * 1000),
  );
});

test("presenter overflow uses natural Range geometry when scrollHeight is clipped", () => {
  const measure = (text: string, naturalHeight: number) => {
    const viewport = document.createElement("span");
    const content = document.createElement("span");
    content.textContent = text;
    viewport.appendChild(content);
    document.body.appendChild(viewport);
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 40 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ top: 0, bottom: 40, height: 40 }),
      },
    });
    // Reproduce the browser failure: both ordinary element measurements are
    // clipped to the viewport despite the text having taller natural layout.
    Object.defineProperties(content, {
      scrollHeight: { configurable: true, value: 40 },
      offsetHeight: { configurable: true, value: 40 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ top: 0, bottom: 40, height: 40 }),
      },
    });
    const originalCreateRange = document.createRange.bind(document);
    document.createRange = (() => ({
      selectNodeContents: () => {},
      getClientRects: () => [
        { top: 10, bottom: 10 + naturalHeight, height: naturalHeight },
      ],
      getBoundingClientRect: () => ({
        top: 10,
        bottom: 10 + naturalHeight,
        height: naturalHeight,
      }),
      detach: () => {},
    })) as typeof document.createRange;
    try {
      return measurePresenterOverflow(viewport, content);
    } finally {
      document.createRange = originalCreateRange;
      viewport.remove();
    }
  };

  assert.equal(measure("Ada\nGrace\nKatherine\nMargaret\nRadia", 100), 60);
  assert.equal(
    measure("A presenter name long enough to wrap across several rendered lines", 75),
    35,
  );
});

test("presenter reveal has stable gutter, active rail, and explicit timing phases", () => {
  const source = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf8",
  );
  const start = source.indexOf("function PresenterViewport");
  const end = source.indexOf("function AgendaRow", start);
  const presenter = source.slice(start, end);

  assert.match(
    presenter,
    /paddingRight: overflow \? DESCRIPTION_SCROLL_GUTTER_PX : 0/,
  );
  assert.doesNotMatch(presenter, /overflow \? " pr-/);
  assert.match(presenter, /boxSizing: "border-box"/);
  assert.match(presenter, /agenda-presenter-scroll-rail-/);
  assert.match(presenter, /backgroundColor: DESCRIPTION_SCROLL_TRACK_COLOR/);
  assert.match(presenter, /agenda-presenter-scroll-thumb-/);
  assert.match(presenter, /backgroundColor: accentColor \|\| "#22c55e"/);
  assert.match(presenter, /setTransitionMs\(duration\)[\s\S]*setOffset\(overflow\)/);
  assert.match(presenter, /TOP_PAUSE_MS/);
  assert.match(presenter, /setTransitionMs\(0\)/);
  assert.match(
    presenter,
    /Math\.abs\(lastReportedOverflowRef\.current - next\) >= 1/,
  );
  assert.match(
    presenter,
    /Math\.abs\(previous - next\) < 1 \? previous : next/,
  );
});

test("header date prefixes weekday and clock remains time only", () => {
  const markup = renderToStaticMarkup(<AgendaDisplayWidget config={config({ showDate: true, showDayName: true })} items={[item]} width={800} height={500} now={now} timezone="America/New_York" />);
  assert.match(markup, /Wednesday/);
  assert.match(markup, /September/);
  const clock = markup.match(/data-testid="agenda-clock"[^>]*>([^<]+)/)?.[1] ?? "";
  assert.doesNotMatch(clock, /Wednesday|Wed/);
  const noDate = renderToStaticMarkup(<AgendaDisplayWidget config={config({ showDate: false, showDayName: true })} items={[item]} width={800} height={500} now={now} timezone="UTC" />);
  assert.doesNotMatch(noDate, /agenda-day-name/);
});

test("presentation state sanitizes invalid follower positions", () => {
  assert.deepEqual(sanitizeAgendaPresentationState({ stage: "page", page: 1, cycle: 2 }, 2), { stage: "page", page: 1, cycle: 2 });
  assert.equal(sanitizeAgendaPresentationState({ stage: "page", page: 2, cycle: 0 }, 2), null);
  assert.equal(sanitizeAgendaPresentationState({ stage: "", page: 0, cycle: 0 }, 2), null);
  assert.equal(sanitizeAgendaPresentationState({ stage: "now", page: -1, cycle: 0 }, 2), null);
});

test("follower renders the exact requested Full and Now/Next page", () => {
  const two = { ...item, id: "two", title: "Second session" };
  const full = renderToStaticMarkup(
    <AgendaDisplayWidget
      config={config({ maxItemsPerPage: 1 })}
      items={[item, two]}
      width={800} height={500} now={now} timezone="UTC"
      followedPresentationState={{ stage: "page", page: 1, cycle: 3 }}
    />,
  );
  assert.match(full, /Second session/);
  assert.doesNotMatch(full, /data-testid="agenda-title-one"/);
  const nowNext = renderToStaticMarkup(
    <AgendaDisplayWidget
      config={config({ displayMode: "now_next", maxItemsPerPage: 1 })}
      items={[item, two]}
      width={800} height={500} now={now} timezone="UTC"
      followedPresentationState={{ stage: "next", page: 1, cycle: 0 }}
    />,
  );
  assert.match(nowNext, /Second session/);
});

test("follower keeps six-item Full page IDs and indicator on one effective state", () => {
  const six = Array.from({ length: 6 }, (_, index) => ({
    ...item,
    id: `item-${index}`,
    title: `Item ${index}`,
    sortOrder: index,
  }));
  const renderFollowed = (page: number) => renderToStaticMarkup(
    <AgendaDisplayWidget
      config={config({ maxItemsPerPage: 2 })}
      items={six}
      width={800} height={500} now={now} timezone="UTC"
      followedPresentationState={{ stage: "page", page, cycle: 0 }}
    />,
  );
  const first = renderFollowed(0);
  assert.match(first, /Item 0/);
  assert.match(first, /Item 1/);
  assert.doesNotMatch(first, /Item 2/);
  assert.match(first, /page 1\/3/);

  // This is the Monitor mid-join/reload state: its local page remains zero,
  // but the Player's fresh report must drive both the visible IDs and label.
  const second = renderFollowed(1);
  assert.match(second, /Item 2/);
  assert.match(second, /Item 3/);
  assert.doesNotMatch(second, /Item 0/);
  assert.match(second, /page 2\/3/);

  // No report uses the same local deterministic page for rows and indicator.
  const missing = renderToStaticMarkup(
    <AgendaDisplayWidget
      config={config({ maxItemsPerPage: 2 })}
      items={six}
      width={800} height={500} now={now} timezone="UTC"
    />,
  );
  assert.match(missing, /Item 0/);
  assert.match(missing, /Item 1/);
  assert.match(missing, /page 1\/3/);
});

test("follower Now/Next stage renders the Player-reported item title", () => {
  const current = { ...item, id: "current", title: "Current" };
  const next = { ...item, id: "next", title: "Next", sortOrder: 1 };
  const markup = renderToStaticMarkup(
    <AgendaDisplayWidget
      config={config({ displayMode: "now_next", maxItemsPerPage: 1 })}
      items={[current, next]}
      width={800} height={500} now={now} timezone="UTC"
      followedPresentationState={{ stage: "next", page: 1, cycle: 0 }}
    />,
  );
  assert.match(markup, /Next/);
  assert.doesNotMatch(markup, /data-testid="agenda-title-current"/);
});
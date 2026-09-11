import "./setup-jsdom";

import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  AgendaDisplayWidget,
  type AgendaDisplayWidgetProps,
  type AgendaPaginationSnapshot,
  type AgendaPresentationState,
} from "../client/src/components/agenda/AgendaDisplayWidget";
import type { AgendaZoneBinding } from "../client/src/lib/agenda-scene-completion";
import {
  insertAgendaWidgetConfigSchema,
  type AgendaItem,
  type AgendaWidgetConfig,
} from "../shared/schema";
import { packAgendaPages } from "../shared/agenda-resolver";

const NOW = new Date("2031-07-04T09:00:00Z");
const IDS = Array.from({ length: 11 }, (_, index) => `portrait-${index + 1}`);
const HEIGHTS: Record<string, number> = Object.fromEntries(
  IDS.map((id, index) => [id, [540, 420, 610, 500, 440, 570, 390, 620, 400, 450, 450][index]]),
);
const CANONICAL_HEIGHTS: Record<string, number> = Object.fromEntries(
  IDS.map((id) => [id, HEIGHTS[id] * (720 / 1920)]),
);
const EXPECTED_PAGES = [
  ["portrait-1", "portrait-2"],
  ["portrait-3", "portrait-4"],
  ["portrait-5", "portrait-6"],
  ["portrait-7", "portrait-8"],
  ["portrait-9", "portrait-10", "portrait-11"],
];
const FALLBACK_FONT_HEIGHTS: Record<string, number> = Object.fromEntries(
  IDS.map((id, index) => [id, [600, 600, 1000, 900, 600, 600, 1000, 900, 600, 600, 1000][index]]),
);
const CANONICAL_FALLBACK_FONT_HEIGHTS: Record<string, number> = Object.fromEntries(
  IDS.map((id) => [id, FALLBACK_FONT_HEIGHTS[id] * (720 / 1920)]),
);
const ERRONEOUS_FALLBACK_PAGES = [
  ["portrait-1", "portrait-2"],
  ["portrait-3"],
  ["portrait-4"],
  ["portrait-5", "portrait-6"],
  ["portrait-7"],
  ["portrait-8"],
  ["portrait-9", "portrait-10"],
  ["portrait-11"],
];

function config(): AgendaWidgetConfig {
  return {
    ...insertAgendaWidgetConfigSchema.parse({
      clientId: "portrait-client",
      name: "Portrait production fixture",
    }),
    id: "portrait-config",
    clientId: "portrait-client",
    name: "Portrait production fixture",
    layoutMode: "portrait",
    displayMode: "full",
    maxItemsPerPage: 3,
    rotationIntervalSeconds: 3,
    showPresenter: true,
    showSessionCount: true,
    showDescription: false,
    showRoom: false,
    showTrack: false,
    showStatus: false,
    showDuration: false,
    createdAt: NOW,
    updatedAt: NOW,
  } as AgendaWidgetConfig;
}

function items(): AgendaItem[] {
  return IDS.map((id, index) => ({
    id,
    clientId: "portrait-client",
    title: `Variable-height portrait session ${index + 1}`,
    description: null,
    presenter: `Presenter ${index + 1}`,
    room: null,
    track: null,
    startsAt: new Date(NOW.getTime() + index * 60 * 60 * 1_000),
    endsAt: new Date(NOW.getTime() + (index + 1) * 60 * 60 * 1_000),
    status: "scheduled",
    statusMessage: null,
    sortOrder: index,
    externalId: null,
    createdAt: NOW,
    updatedAt: NOW,
  })) as AgendaItem[];
}

test("portrait activation publishes one font-settled five-page model and uses it atomically", async () => {
  const originalObserver = (globalThis as any).ResizeObserver;
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
  const observers: Array<(entries: any[]) => void> = [];
  class MeasuringObserver {
    constructor(callback: (entries: any[]) => void) { observers.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = MeasuringObserver;
  (window as any).ResizeObserver = MeasuringObserver;
  let fontsLoaded = false;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      const id = (this as HTMLElement).dataset.measureId;
      return id
        ? (fontsLoaded ? CANONICAL_HEIGHTS : CANONICAL_FALLBACK_FONT_HEIGHTS)[id] ?? 0
        : 0;
    },
  });

  let settleFonts!: () => void;
  const fontsReady = new Promise<void>((resolve) => { settleFonts = resolve; });
  const fontListeners = new Map<string, Set<() => void>>();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: fontsReady,
      status: "loading",
      addEventListener: (name: string, callback: () => void) => {
        const callbacks = fontListeners.get(name) ?? new Set();
        callbacks.add(callback);
        fontListeners.set(name, callbacks);
      },
      removeEventListener: (name: string, callback: () => void) => {
        fontListeners.get(name)?.delete(callback);
      },
    },
  });

  let clock = 0;
  let timerSerial = 0;
  const timers = new Map<number, { callback: () => void; due: number; cancelled: boolean; fired: boolean }>();
  const setTimeout = (callback: () => void, delay: number) => {
    const id = ++timerSerial;
    timers.set(id, { callback, due: clock + delay, cancelled: false, fired: false });
    return id;
  };
  const clearTimeout = (handle: unknown) => {
    const timer = timers.get(Number(handle));
    if (timer) timer.cancelled = true;
  };

  const snapshots: AgendaPaginationSnapshot[] = [];
  const reports: AgendaPresentationState[] = [];
  const readyDurations: number[] = [];
  let completions = 0;
  const binding: AgendaZoneBinding = {
    playerId: "player" as any,
    sceneId: "scene" as any,
    zoneId: "agenda" as any,
    activationId: "portrait-activation" as any,
    register: () => true,
    ready: (duration) => { readyDurations.push(duration ?? -1); return true; },
    complete: () => { completions += 1; return true; },
    fail: () => true,
    unregister: () => true,
  };
  const baseProps: AgendaDisplayWidgetProps = {
    config: config(),
    items: items(),
    width: 1080,
    height: 1920,
    timezone: "UTC",
    now: NOW,
    onPaginationReady: (snapshot) => snapshots.push(snapshot),
    onPresentationState: (state) => reports.push(state),
    testPresentationTiming: {
      metrics: {},
      now: () => clock,
      setTimeout,
      clearTimeout,
    },
  };
  const rendered = render(
    <div style={{ transform: "scale(0.25)", transformOrigin: "top left" }}>
      <AgendaDisplayWidget {...baseProps} completionBinding={binding} />
    </div>,
  );

  const visibleIds = () =>
    [...rendered.container.querySelectorAll<HTMLElement>("[data-testid^='agenda-title-portrait-']")]
      .map((element) => element.dataset.testid!.replace("agenda-title-", ""));
  const runDwell = async () => {
    let timer: (typeof timers extends Map<any, infer T> ? T : never) | undefined;
    await waitFor(() => {
      const active = [...timers.values()].filter((candidate) => !candidate.cancelled && !candidate.fired);
      assert.equal(active.length, 1);
      timer = active[0];
    });
    timer!.fired = true;
    clock = timer!.due;
    await act(async () => timer!.callback());
  };

  try {
    assert.deepEqual(
      packAgendaPages(
        IDS,
        IDS.map((id) => CANONICAL_FALLBACK_FONT_HEIGHTS[id]),
        525,
        1,
        12,
        3,
      ),
      ERRONEOUS_FALLBACK_PAGES,
      "the production-shaped fallback-font measurement reproduces eight pages",
    );
    await act(async () => {
      for (const observer of observers) {
        observer([{ contentRect: { width: 1080, height: 1400 } }]);
      }
    });
    assert.deepEqual(snapshots, [], "fallback-font pagination must not publish");
    assert.deepEqual(readyDurations, [], "controlled activation must not freeze fallback-font pages");

    await act(async () => {
      fontsLoaded = true;
      (document.fonts as any).status = "loaded";
      settleFonts();
      await fontsReady;
    });
    await waitFor(() => assert.equal(snapshots.length, 1));
    assert.deepEqual(snapshots[0], {
      pageItemIds: EXPECTED_PAGES,
      totalPages: 5,
    });
    await waitFor(() => assert.deepEqual(readyDurations, [15_000]));
    await waitFor(() => assert.ok(reports.length > 0));
    assert.ok(reports.every((state) => state.page === 0));
    assert.deepEqual(visibleIds(), EXPECTED_PAGES[0]);
    assert.match(rendered.getByTestId("agenda-session-count").textContent ?? "", /page 1\/5/);

    for (let page = 1; page < EXPECTED_PAGES.length; page += 1) {
      await runDwell();
      await waitFor(() => assert.equal(reports.at(-1)?.page, page));
      assert.deepEqual(visibleIds(), EXPECTED_PAGES[page]);
      assert.match(
        rendered.getByTestId("agenda-session-count").textContent ?? "",
        new RegExp(`page ${page + 1}/5`),
      );
    }
    assert.ok(reports.every((state) => state.page >= 0 && state.page < 5));
    assert.equal(completions, 0);
    await runDwell();
    await waitFor(() => assert.equal(completions, 1));
    assert.equal(reports.at(-1)?.page, 4);
  } finally {
    cleanup();
    (globalThis as any).ResizeObserver = originalObserver;
    (window as any).ResizeObserver = originalObserver;
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
    else delete (HTMLElement.prototype as any).offsetHeight;
    if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
    else delete (document as any).fonts;
  }
});

test("simulator uses authored logical dimensions before scaling to its panel", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile("client/src/pages/simulator.tsx", "utf8"),
  );
  assert.ok(source.includes("const trueWidth = isFullCanvasMode ? canvasW : screenW;"));
  assert.ok(source.includes("const trueHeight = isFullCanvasMode ? canvasH : screenH;"));
  assert.ok(!source.includes("REFERENCE_HEIGHT = 720"));
});
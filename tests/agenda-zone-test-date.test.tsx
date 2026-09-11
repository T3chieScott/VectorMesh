// Task #279 — the agenda "test date" override (?at=) must reach every
// surface that renders an agenda config.
//
// Task #278 threaded an optional `atIso` test-date override through
// AgendaConfigZoneWidget so the layout preview, the player simulator,
// and the real player all resolve the agenda "as if now were that
// instant". The wiring is two linked promises:
//
//   1. the public display fetch URL must carry `?at=<UTC ISO>`, and
//   2. the AgendaDisplayWidget must receive a matching frozen `now`.
//
// A future refactor could silently drop the override on just one of
// those legs (e.g. keep the fetch param but stop passing `now`, or
// vice-versa). This suite mounts the REAL component against a stubbed
// fetch and asserts both legs move together, plus that a garbage
// `atIso` falls back to live (no `?at=` param, no frozen `now`).

import "./setup-jsdom";
import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";
import { AgendaConfigZoneWidget } from "../client/src/components/agenda/AgendaConfigZoneWidget";
import { AgendaDisplayWidget } from "../client/src/components/agenda/AgendaDisplayWidget";
import type { AgendaItem, AgendaWidgetConfig, LayoutZone } from "../shared/schema";
import type { AgendaZoneBinding } from "../client/src/lib/agenda-scene-completion";
import { useAgendaSceneCompletion } from "../client/src/hooks/use-agenda-scene-completion";

const CONFIG_ID = "cfg-279";

function buildConfig(over: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: CONFIG_ID,
    clientId: "c1",
    name: "T279 cfg",
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
    refreshIntervalSeconds: 30,
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
    startsAt: new Date("2031-07-04T09:00:00Z"),
    endsAt: new Date("2031-07-04T10:00:00Z"),
    status: "scheduled",
    statusMessage: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...over,
  } as AgendaItem;
}

// formatNow mirror — the widget renders the resolved `now` into the
// agenda-clock <p> via this exact Intl shape (time only in the
// site timezone). We reuse it to read the frozen instant back out.
function formatNow(tz: string, d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(d);
}

function stubFetch(payloadConfig: AgendaWidgetConfig, tz: string) {
  const calls: string[] = [];
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        config: payloadConfig,
        items: [buildItem()],
        client: { id: "c1", name: "Acme", timezone: tz },
        serverTime: Date.now(),
      }),
    } as unknown as Response;
  };
  return {
    calls,
    restore() {
      (globalThis as any).fetch = original;
    },
  };
}

function clockText(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="agenda-clock"]')?.textContent ?? null;
}

function forceAgendaIndicatorOverflow() {
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      const element = this as HTMLElement;
      return element.dataset.testid?.startsWith("agenda-description-viewport-") ||
        element.dataset.testid?.startsWith("agenda-presenter-viewport-")
        ? 40
        : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      const element = this as HTMLElement;
      return element.dataset.testid?.startsWith("agenda-description-") ||
        element.classList.contains("whitespace-pre-line")
        ? 120
        : 0;
    },
  });
  return () => {
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    else delete (HTMLElement.prototype as any).clientHeight;
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
    else delete (HTMLElement.prototype as any).scrollHeight;
  };
}

function indicatorColor(container: HTMLElement, testId: string, property: "color" | "backgroundColor") {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  assert.ok(element, `${testId} should render`);
  return element.style[property];
}

test("valid atIso forwards ?at=<UTC ISO> to the fetch AND freezes the widget clock", async () => {
  const tz = "UTC";
  const fetchStub = stubFetch(buildConfig(), tz);
  // A Friday far in the future so the frozen weekday + HH:MM can never
  // coincide with the live test-run clock.
  const atIso = "2031-07-04T09:15:00.000Z";

  const { container } = render(
    React.createElement(AgendaConfigZoneWidget, { configId: CONFIG_ID, atIso }),
  );

  try {
    await waitFor(() => {
      assert.ok(clockText(container), "agenda-clock not yet rendered");
    });

    // Leg 1: the fetch URL carries the override plus a unique cache buster.
    assert.equal(fetchStub.calls.length >= 1, true, "expected at least one fetch");
    const url = new URL(fetchStub.calls[0], "https://display.test");
    assert.equal(url.pathname, `/api/agenda/display/${CONFIG_ID}`);
    assert.equal(url.searchParams.get("at"), new Date(atIso).toISOString());
    assert.ok(url.searchParams.get("_vmr"), "cache-buster must be present");

    // Leg 2: the widget's clock reflects the frozen instant, proving
    // AgendaDisplayWidget received `now` === the override.
    const expected = formatNow(tz, new Date(atIso));
    assert.equal(
      clockText(container),
      expected,
      `agenda-clock should show the frozen instant ${expected}`,
    );
    assert.match(clockText(container) ?? "", /09:15/);
  } finally {
    cleanup();
    fetchStub.restore();
  }
});

test("persisted Now/Next colour override reaches the standalone zone's indicator surfaces", async () => {
  // This is the same public payload consumed by both a standalone agenda zone
  // and the player. Keep this mounted assertion so the fetch-to-widget path
  // cannot silently discard the persisted Task 404 settings.
  const accent = "#0ea5e9";
  const override = "#c026d3";
  const fetchStub = stubFetch(buildConfig({
    displayMode: "now_next",
    accentColor: accent,
    overrideNowNextColor: true,
    nowNextColor: override,
    showNowNextLabel: true,
    showDescriptionDivider: true,
    speakerMarkerStyle: "circle",
  }), "UTC");
  const atIso = "2031-07-04T09:15:00.000Z";
  const { container } = render(
    React.createElement(AgendaConfigZoneWidget, { configId: CONFIG_ID, atIso }),
  );

  try {
    await waitFor(() => {
      assert.ok(
        container.querySelector('[data-testid="agenda-now-next-label-i1"]'),
        "agenda payload has not rendered",
      );
    });
    assert.equal(
      (container.querySelector('[data-testid="agenda-now-next-label-i1"]') as HTMLElement).style.color,
      "rgb(192, 38, 211)",
    );
    assert.equal(
      (container.querySelector('[data-testid="agenda-now-next-divider-i1"]') as HTMLElement).style.backgroundColor,
      "rgb(192, 38, 211)",
    );
    assert.equal(
      (container.querySelector('[data-testid="agenda-speaker-marker-i1"]') as HTMLElement).style.color,
      "rgb(192, 38, 211)",
    );
    assert.equal(
      (container.querySelector('[data-testid="agenda-description-divider-i1"]') as HTMLElement).style.backgroundColor,
      "rgb(192, 38, 211)",
    );
  } finally {
    cleanup();
    fetchStub.restore();
  }
});

test("mounted Now/Next applies its override only to all six indicator targets", async () => {
  const restoreMetrics = forceAgendaIndicatorOverflow();
  const accent = "rgb(14, 165, 233)";
  const override = "rgb(192, 38, 211)";
  const view = render(<AgendaDisplayWidget
    config={buildConfig({
      displayMode: "now_next", accentColor: "#0ea5e9",
      overrideNowNextColor: true, nowNextColor: "#c026d3",
      showNowNextLabel: true, showDescriptionDivider: true,
      descriptionLines: null, descriptionAutoScroll: true,
      speakerMarkerStyle: "square", titleColor: "#f97316", bodyColor: "#a3e635",
    })}
    items={[buildItem({ startsAt: new Date("2031-07-04T09:00:00Z"), endsAt: new Date("2031-07-04T10:00:00Z") })]}
    timezone="UTC" now={new Date("2031-07-04T09:15:00Z")} width={800} height={500}
  />);
  try {
    await waitFor(() => assert.ok(view.queryByTestId("agenda-description-scroll-thumb-i1")));
    for (const [id, property] of [
      ["agenda-now-next-label-i1", "color"],
      ["agenda-now-next-divider-i1", "backgroundColor"],
      ["agenda-speaker-marker-i1", "color"],
      ["agenda-description-divider-i1", "backgroundColor"],
      ["agenda-presenter-scroll-thumb-i1", "backgroundColor"],
      ["agenda-description-scroll-thumb-i1", "backgroundColor"],
    ] as const) assert.equal(indicatorColor(view.container, id, property), override, id);
    assert.equal(indicatorColor(view.container, "agenda-presenter-scroll-rail-i1", "backgroundColor"), "rgba(0, 0, 0, 0.24)");
    assert.equal(indicatorColor(view.container, "agenda-description-scroll-track-i1", "backgroundColor"), "rgba(0, 0, 0, 0.24)");
    const row = view.getByTestId("agenda-row-i1");
    assert.equal(row.style.borderLeftColor, accent);
    assert.equal(row.style.background, "var(--ag-card-bg-current)");
    assert.equal(
      (view.getByTestId("agenda-display-root").firstElementChild as HTMLElement).style.backgroundColor,
      accent,
    );
    assert.equal(view.getByTestId("agenda-event-title").style.color, "rgb(249, 115, 22)");
    assert.equal(view.getByTestId("agenda-title-i1").style.color, "rgb(163, 230, 53)");
    assert.equal(view.getByTestId("agenda-description-i1").style.color, "rgb(163, 230, 53)");
  } finally {
    cleanup();
    restoreMetrics();
  }
});

test("mounted Full Agenda restricts the override to its square speaker marker", async () => {
  const restoreMetrics = forceAgendaIndicatorOverflow();
  const accent = "rgb(14, 165, 233)";
  const override = "rgb(192, 38, 211)";
  const view = render(<AgendaDisplayWidget
    config={buildConfig({
      displayMode: "full", accentColor: "#0ea5e9",
      overrideNowNextColor: true, nowNextColor: "#c026d3",
      showDescriptionDivider: true, descriptionLines: null,
      descriptionAutoScroll: true, speakerMarkerStyle: "square",
    })}
    items={[buildItem()]} timezone="UTC" now={new Date("2031-07-04T09:15:00Z")} width={800} height={500}
  />);
  try {
    await waitFor(() => assert.ok(view.queryByTestId("agenda-description-scroll-thumb-i1")));
    assert.equal(indicatorColor(view.container, "agenda-speaker-marker-i1", "color"), override);
    for (const [id, property] of [
      ["agenda-description-divider-i1", "backgroundColor"],
      ["agenda-presenter-scroll-thumb-i1", "backgroundColor"],
      ["agenda-description-scroll-thumb-i1", "backgroundColor"],
    ] as const) assert.equal(indicatorColor(view.container, id, property), accent, id);
    assert.equal(indicatorColor(view.container, "agenda-presenter-scroll-rail-i1", "backgroundColor"), "rgba(0, 0, 0, 0.24)");
    assert.equal(indicatorColor(view.container, "agenda-description-scroll-track-i1", "backgroundColor"), "rgba(0, 0, 0, 0.24)");
  } finally {
    cleanup();
    restoreMetrics();
  }
});

test("a non-UTC site timezone freezes the clock at the override's local wall time", async () => {
  // Same UTC instant, but the site is New York (UTC-4 in July/DST) so
  // the frozen clock must read 05:15, not 09:15 — proving the override
  // and the timezone both reach the widget intact.
  const tz = "America/New_York";
  const fetchStub = stubFetch(buildConfig(), tz);
  const atIso = "2031-07-04T09:15:00.000Z";

  const { container } = render(
    React.createElement(AgendaConfigZoneWidget, { configId: CONFIG_ID, atIso }),
  );

  try {
    await waitFor(() => {
      assert.ok(clockText(container), "agenda-clock not yet rendered");
    });
    const expected = formatNow(tz, new Date(atIso));
    assert.equal(clockText(container), expected);
    assert.match(clockText(container) ?? "", /05:15/);
  } finally {
    cleanup();
    fetchStub.restore();
  }
});

test("garbage atIso falls back to live (no ?at= param, no frozen now)", async () => {
  const tz = "UTC";
  const fetchStub = stubFetch(buildConfig(), tz);

  const { container } = render(
    React.createElement(AgendaConfigZoneWidget, {
      configId: CONFIG_ID,
      atIso: "not-a-real-date",
    }),
  );

  try {
    await waitFor(() => {
      assert.ok(clockText(container), "agenda-clock not yet rendered");
    });

    // Leg 1: garbage does not produce an `at` parameter, but every poll
    // remains cache-busted so an intermediary cannot serve a stale agenda.
    const url = new URL(fetchStub.calls[0], "https://display.test");
    assert.equal(url.pathname, `/api/agenda/display/${CONFIG_ID}`);
    assert.equal(url.searchParams.has("at"), false);
    assert.ok(url.searchParams.get("_vmr"), "cache-buster must be present");

    // Leg 2: no frozen `now` — the widget ticks live. Accept the
    // minute the assertion runs in plus the two neighbours so a clock
    // rollover between mount and read can't flake the test.
    const rendered = clockText(container);
    const now = Date.now();
    const allowed = new Set([
      formatNow(tz, new Date(now - 60_000)),
      formatNow(tz, new Date(now)),
      formatNow(tz, new Date(now + 60_000)),
    ]);
    assert.equal(
      allowed.has(rendered ?? ""),
      true,
      `expected live clock (one of ${[...allowed].join(", ")}), got ${rendered}`,
    );
  } finally {
    cleanup();
    fetchStub.restore();
  }
});

test("a new controlled activation cannot render or ready a previous payload before its fetch", async () => {
  const original = (globalThis as any).fetch;
  let calls = 0;
  const config = buildConfig({ displayMode: "now_next", layoutMode: "totem" });
  (globalThis as any).fetch = () => {
    calls += 1;
    if (calls > 1) return new Promise<Response>(() => {});
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({
        config,
        items: [buildItem({
          startsAt: new Date("2031-07-04T09:00:00Z"),
          endsAt: new Date("2031-07-04T10:00:00Z"),
        })],
        client: { id: "c1", name: "Acme", timezone: "UTC" },
        serverTime: 0,
      }),
    } as Response);
  };
  const readyA: number[] = [];
  const readyB: number[] = [];
  const binding = (activationId: string, ready: number[]): AgendaZoneBinding => ({
    playerId: "p" as any, sceneId: "s" as any, zoneId: "z" as any, activationId: activationId as any,
    register: () => true, ready: (duration) => { ready.push(duration ?? 0); return true; },
    complete: () => true, fail: () => true, unregister: () => true,
  });
  const first = binding("activation-a", readyA);
  const second = binding("activation-b", readyB);
  const rendered = render(React.createElement(AgendaConfigZoneWidget, {
    configId: CONFIG_ID, atIso: "2031-07-04T09:15:00.000Z", completionBinding: first,
  }));
  try {
    await waitFor(() => assert.equal(readyA.length, 1));
    rendered.rerender(React.createElement(AgendaConfigZoneWidget, {
      configId: CONFIG_ID, atIso: "2031-07-04T09:15:00.000Z", completionBinding: second,
    }));
    assert.ok(rendered.container.querySelector('[data-testid="agenda-zone-loading"]'));
    assert.equal(readyB.length, 0);
  } finally {
    cleanup();
    (globalThis as any).fetch = original;
  }
});

test("player activation fetches and renders changed persisted agenda colour config", async () => {
  const original = globalThis.fetch;
  const originalObserver = (globalThis as any).ResizeObserver;
  class PlayerSizeObserver {
    constructor(private callback: (entries: any[]) => void) {}
    observe() { this.callback([{ contentRect: { width: 800, height: 500 } }]); }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = PlayerSizeObserver;
  (window as any).ResizeObserver = PlayerSizeObserver;
  const first = buildConfig({
    displayMode: "now_next", overrideNowNextColor: true, nowNextColor: "#c026d3",
    showNowNextLabel: true, speakerMarkerStyle: "circle",
  });
  const second = { ...first, nowNextColor: "#f97316" };
  let calls = 0;
  globalThis.fetch = async () => {
    const config = calls++ === 0 ? first : second;
    return {
      ok: true, status: 200,
      json: async () => ({
        config,
        items: [buildItem({
          startsAt: new Date("2031-07-04T09:00:00Z"),
          endsAt: new Date("2031-07-04T10:00:00Z"),
        })],
        client: { id: "c1", name: "Acme", timezone: "UTC" },
        serverTime: 0,
      }),
    } as Response;
  };
  function PlayerActivation({ activationKey }: { activationKey: number }) {
    const bindings = useAgendaSceneCompletion({
      enabled: true, active: true, playerInstanceId: "player-colour",
      sceneIdValue: "scene-colour", activationKey,
      item: { id: "scene-colour", layoutTemplateId: "scene-colour", duration: 300 },
      media: [], zones: [{ id: "agenda-colour", type: "agenda", agendaConfigId: CONFIG_ID } as LayoutZone],
      onAdvance: () => {},
    });
    return <AgendaConfigZoneWidget
      configId={CONFIG_ID}
      atIso="2031-07-04T09:15:00.000Z"
      completionBinding={bindings.get("agenda-colour")}
    />;
  }
  const view = render(<PlayerActivation activationKey={0} />);
  try {
    await waitFor(() => assert.equal(
      indicatorColor(view.container, "agenda-speaker-marker-i1", "color"),
      "rgb(192, 38, 211)",
    ));
    view.rerender(<PlayerActivation activationKey={1} />);
    await waitFor(() => {
      assert.ok(calls >= 2, "next player activation must fetch a fresh payload");
      assert.equal(
        indicatorColor(view.container, "agenda-speaker-marker-i1", "color"),
        "rgb(249, 115, 22)",
      );
    });
  } finally {
    cleanup();
    globalThis.fetch = original;
    (globalThis as any).ResizeObserver = originalObserver;
    (window as any).ResizeObserver = originalObserver;
  }
});

test("prepared activation becomes active without clearing data or refetching", async () => {
  const original = (globalThis as any).fetch;
  let fetchCount = 0;
  (globalThis as any).fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        config: buildConfig(),
        items: [],
        client: { id: "c1", name: "Acme", timezone: "UTC" },
        serverTime: 0,
      }),
    } as Response;
  };
  let registrations = 0;
  const binding: AgendaZoneBinding = {
    playerId: "p" as any,
    sceneId: "s" as any,
    zoneId: "z" as any,
    activationId: "activation-prepared" as any,
    register: () => { registrations += 1; return true; },
    ready: () => true,
    complete: () => true,
    fail: () => true,
    unregister: () => true,
  };
  let emptyReady = 0;
  const rendered = render(React.createElement(AgendaConfigZoneWidget, {
    configId: CONFIG_ID,
    completionBinding: binding,
    agendaPreparing: true,
    onPreparationOutcome: (outcome) => { if (outcome === "empty-ready") emptyReady += 1; },
  }));
  try {
    await waitFor(() => assert.equal(emptyReady, 1));
    assert.equal(fetchCount, 1);
    assert.equal(registrations, 0);
    assert.equal(rendered.container.querySelector('[data-testid="agenda-zone-loading"]'), null);

    rendered.rerender(React.createElement(AgendaConfigZoneWidget, {
      configId: CONFIG_ID,
      completionBinding: binding,
      agendaPreparing: false,
      onPreparationOutcome: (outcome) => { if (outcome === "empty-ready") emptyReady += 1; },
    }));
    await waitFor(() => assert.ok(registrations >= 1));
    assert.equal(fetchCount, 1, "activation must reuse its hidden prepared payload");
    assert.equal(rendered.container.querySelector('[data-testid="agenda-zone-loading"]'), null);
  } finally {
    cleanup();
    (globalThis as any).fetch = original;
  }
});

test("controlled empty Agenda is transparent and immediately reports ready(0) then complete", async () => {
  const calls: string[] = [];
  const binding: AgendaZoneBinding = {
    playerId: "p" as any, sceneId: "s" as any, zoneId: "z" as any, activationId: "empty" as any,
    register: () => true,
    ready: (duration) => { calls.push(`ready:${duration}`); return true; },
    complete: () => { calls.push("complete"); return true; },
    fail: () => true, unregister: () => true,
  };
  const rendered = render(React.createElement(AgendaDisplayWidget, {
    config: buildConfig(), items: [], timezone: "UTC", now: new Date("2031-07-04T09:15:00Z"),
    width: 800, height: 500, completionBinding: binding,
  }));
  try {
    await waitFor(() => assert.deepEqual(calls, ["ready:0", "complete"]));
    assert.equal(rendered.container.querySelector('[data-testid="agenda-display-root"]'), null);
    assert.equal(rendered.container.textContent, "");
  } finally {
    cleanup();
  }
});

test("measured Full Agenda pages keep local days separate and followers receive matching headings", async () => {
  const originalObserver = (globalThis as any).ResizeObserver;
  const observers: any[] = [];
  class MeasuringObserver {
    callback: any;
    constructor(callback: any) { this.callback = callback; observers.push(this); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = MeasuringObserver;
  (window as any).ResizeObserver = MeasuringObserver;
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  let nowMs = 0;
  let nextTimer = 0;
  const agendaTimers = new Map<number, {
    callback: () => void;
    due: number;
    cancelled: boolean;
    fired: boolean;
  }>();
  const setAgendaTimeout = (callback: () => void, delay: number) => {
    const id = ++nextTimer;
    agendaTimers.set(id, {
      callback,
      due: nowMs + delay,
      cancelled: false,
      fired: false,
    });
    return id;
  };
  const clearAgendaTimeout = (handle: unknown) => {
    const timer = agendaTimers.get(Number(handle));
    if (timer) timer.cancelled = true;
  };
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() { return (this as HTMLElement).dataset.measureId ? 110 : 0; },
  });
  const calls: string[] = [];
  const reports: number[] = [];
  const binding: AgendaZoneBinding = {
    playerId: "p" as any, sceneId: "s" as any, zoneId: "z" as any, activationId: "days" as any,
    register: () => { calls.push("register"); return true; },
    ready: (duration) => { calls.push(`ready:${duration}`); return true; },
    complete: () => { calls.push("complete"); return true; },
    fail: () => true, unregister: () => true,
  };
  const entries = [
    buildItem({ id: "today", startsAt: new Date("2031-07-04T10:00:00Z"), endsAt: new Date("2031-07-04T11:00:00Z") }),
    buildItem({ id: "tomorrow", startsAt: new Date("2031-07-05T10:00:00Z"), endsAt: new Date("2031-07-05T11:00:00Z") }),
    buildItem({ id: "sunday", startsAt: new Date("2031-07-06T10:00:00Z"), endsAt: new Date("2031-07-06T11:00:00Z") }),
  ];
  const props = {
    config: buildConfig({ showAgendaDayHeading: true, layoutMode: "portrait", maxItemsPerPage: 8, rotationIntervalSeconds: 3 }),
    items: entries, timezone: "UTC", now: new Date("2031-07-04T09:00:00Z"),
    width: 800, height: 300, completionBinding: binding,
    onPresentationState: (state: any) => reports.push(state.page),
    testPresentationTiming: {
      metrics: {},
      now: () => nowMs,
      setTimeout: setAgendaTimeout,
      clearTimeout: clearAgendaTimeout,
    },
  };
  const rendered = render(React.createElement(AgendaDisplayWidget, props));
  try {
    // Drive the real ResizeObserver content-box path, then the offscreen
    // measurement pass uses the mocked intrinsic card heights above.
    await act(async () => {
      for (const observer of observers) {
        observer.callback([{ contentRect: { width: 800, height: 150 } }]);
      }
    });
    await waitFor(() => assert.ok(calls.includes("ready:9000")));
    // The measured controlled plan is actively registered before any dwell
    // callback is allowed to advance it.
    await waitFor(() => assert.ok(calls.includes("register")));
    assert.equal(rendered.getByTestId("agenda-day-heading").textContent, "Today’s Agenda");
    assert.ok(rendered.queryByTestId("agenda-title-today"));
    assert.equal(rendered.queryByTestId("agenda-title-tomorrow"), null);

    rendered.rerender(React.createElement(AgendaDisplayWidget, { ...props, followedPresentationState: { stage: "page", page: 1, cycle: 0 } }));
    await waitFor(() => assert.equal(rendered.getByTestId("agenda-day-heading").textContent, "Tomorrow’s Agenda"));
    assert.ok(rendered.queryByTestId("agenda-title-tomorrow"));
    assert.equal(rendered.queryByTestId("agenda-title-sunday"), null);
    rendered.rerender(React.createElement(AgendaDisplayWidget, { ...props, followedPresentationState: { stage: "page", page: 2, cycle: 0 } }));
    await waitFor(() => assert.match(rendered.getByTestId("agenda-day-heading").textContent ?? "", /Sunday/));
    assert.ok(reports.includes(0) && reports.includes(1) && reports.includes(2));
    assert.equal(calls.filter((call) => call === "complete").length, 0);

    // Return to the production-controlled local pager and fire its captured
    // dwell callbacks. This proves the same measured plan visits all pages
    // before issuing exactly one completion.
    rendered.rerender(React.createElement(AgendaDisplayWidget, props));
    for (let page = 0; page < 3; page += 1) {
      let active: (typeof agendaTimers extends Map<any, infer T> ? T : never) | undefined;
      await waitFor(() => {
        const candidates = [...agendaTimers.values()].filter((timer) => !timer.cancelled && !timer.fired);
        assert.equal(candidates.length, 1);
        active = candidates[0];
      });
      active!.fired = true;
      nowMs = active!.due;
      await act(async () => active!.callback());
      if (page < 2) assert.equal(calls.filter((call) => call === "complete").length, 0);
    }
    await waitFor(() => assert.equal(calls.filter((call) => call === "complete").length, 1));
  } finally {
    cleanup();
    (globalThis as any).ResizeObserver = originalObserver;
    (window as any).ResizeObserver = originalObserver;
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
    else delete (HTMLElement.prototype as any).offsetHeight;
  }
});

test("StrictMode replay keeps the initial visible Agenda coordinator active", async () => {
  const agendaZone = { id: "agenda", type: "agenda" } as LayoutZone;
  let advances = 0;
  const observedBindings: AgendaZoneBinding[] = [];
  function LifecycleProbe({ binding, run }: { binding?: AgendaZoneBinding; run: boolean }) {
    React.useEffect(() => {
      if (!binding || !run) return;
      binding.register(1);
      binding.ready(1);
      binding.complete();
    }, [binding, run]);
    return null;
  }
  function Harness({ activationKey, active, run }: { activationKey: number; active: boolean; run: boolean }) {
    const bindings = useAgendaSceneCompletion({
      enabled: true,
      active,
      playerInstanceId: "player",
      sceneIdValue: "layout-a",
      activationKey,
      item: { id: "a", layoutTemplateId: "layout-a", duration: 0.001 },
      media: [],
      zones: [agendaZone],
      onAdvance: () => { advances += 1; },
    });
    const binding = bindings.get("agenda");
    if (binding) observedBindings.push(binding);
    return React.createElement(LifecycleProbe, { binding, run });
  }
  const rendered = render(React.createElement(React.StrictMode, null,
    React.createElement(Harness, { activationKey: 0, active: false, run: false })));
  try {
    const initialBinding = observedBindings.at(-1)!;
    rendered.rerender(React.createElement(React.StrictMode, null,
      React.createElement(Harness, { activationKey: 0, active: false, run: false })));
    const equivalentBinding = observedBindings.at(-1)!;
    assert.equal(equivalentBinding.activationId, initialBinding.activationId);
    assert.equal(equivalentBinding.register(1), false, "prepared binding remains inert before visible commit");
    rendered.rerender(React.createElement(React.StrictMode, null,
      React.createElement(Harness, { activationKey: 0, active: true, run: true })));
    const activatedBinding = observedBindings.at(-1)!;
    assert.equal(activatedBinding.activationId, initialBinding.activationId);
    await waitFor(() => assert.equal(advances, 1));
    assert.equal(advances, 1, "StrictMode must not double-begin or double-advance");

    rendered.rerender(React.createElement(React.StrictMode, null,
      React.createElement(Harness, { activationKey: 1, active: true, run: false })));
    const nextBinding = observedBindings.at(-1)!;
    assert.notEqual(nextBinding.activationId, equivalentBinding.activationId);
    assert.equal(equivalentBinding.register(1), false, "retired activation must be inert");
  } finally {
    cleanup();
  }
  assert.equal(observedBindings.at(-1)!.register(1), false, "unmount must dispose the coordinator");
});

test("mounted NOW/NEXT presenter dwell uses the production timer and advances only at its high-water deadline", async () => {
  let nowMs = 0;
  let serial = 0;
  const timers = new Map<number, { callback: () => void; due: number; cancelled: boolean }>();
  const fakeTimeout = (callback: () => void, delay = 0) => {
    const id = ++serial;
    timers.set(id, { callback, due: nowMs + delay, cancelled: false });
    return id;
  };
  const fakeClear = (id: unknown) => {
    const timer = timers.get(Number(id));
    if (timer) timer.cancelled = true;
  };
  const advance = async (ms: number) => {
    const target = nowMs + ms;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => !timer.cancelled && timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      timers.delete(next[0]);
      nowMs = next[1].due;
      await act(async () => next[1].callback());
    }
    nowMs = target;
  };
  const states: Array<{ stage: string; page: number }> = [];
  const current = buildItem({
    id: "now-dwell", presenter: "A very long presenter", startsAt: new Date("2030-01-01T09:00:00Z"),
    endsAt: new Date("2030-01-01T11:00:00Z"),
  });
  const next = buildItem({
    id: "next-dwell", presenter: "Next", startsAt: new Date("2030-01-01T12:00:00Z"),
    endsAt: new Date("2030-01-01T13:00:00Z"),
  });
  const metrics = { "presenter:now-dwell": 280 };
  const expected = 3_000 + Math.ceil(280 / 28 * 1_000) + 3_000;
  try {
    render(<AgendaDisplayWidget
      config={buildConfig({ displayMode: "now_next", rotationIntervalSeconds: 3, showPresenter: true })}
      items={[current, next]} now={new Date("2030-01-01T10:00:00Z")} timezone="UTC"
      onPresentationState={(state) => states.push({ stage: state.stage, page: state.page })}
      testPresentationTiming={{ metrics, now: () => nowMs, setTimeout: fakeTimeout, clearTimeout: fakeClear }}
    />);
    await waitFor(() => assert.ok(states.some((state) => state.stage === "now")));
    await advance(expected - 1);
    assert.equal(states.at(-1)?.stage, "now");
    await advance(1);
    await waitFor(() => assert.equal(states.at(-1)?.stage, "next"));
  } finally {
    cleanup();
  }
});

test("StrictMode production Agenda widget completes its initial measured one-page activation", async () => {
  const originalFetch = globalThis.fetch;
  const originalObserver = (globalThis as any).ResizeObserver;
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  class LiveMeasuringObserver {
    constructor(private callback: any) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = LiveMeasuringObserver;
  (window as any).ResizeObserver = LiveMeasuringObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() { return (this as HTMLElement).dataset.measureId ? 100 : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true, get() { return 800; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true, get() { return (this as HTMLElement).dataset.measureId ? 100 : 400; },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true, get() { return (this as HTMLElement).dataset.measureId ? 100 : 400; },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    // Deliberately conflicting transformed coordinates: pagination must use
    // the 800×400 client layout metrics above, not this scale(0.5)-like rect.
    const height = this.dataset.measureId ? 50 : 200;
    return { x: 0, y: 0, top: 0, left: 0, right: 400, bottom: height,
      width: 400, height, toJSON() { return {}; } } as DOMRect;
  };
  const config = buildConfig({
    layoutMode: "portrait",
    rotationIntervalSeconds: 3,
    maxItemsPerPage: 8,
  });
  (globalThis as any).fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({
      config,
      items: [buildItem({
        id: "initial-a",
        startsAt: new Date("2031-07-04T09:00:00Z"),
        endsAt: new Date("2031-07-04T10:00:00Z"),
      })],
      client: { id: "c1", name: "Acme", timezone: "UTC" },
      serverTime: 0,
    }),
  } as Response);
  let advances = 0;
  const reports: number[] = [];
  const accepted = { register: 0, ready: 0, complete: 0 };
  function Harness() {
    const bindings = useAgendaSceneCompletion({
      enabled: true, active: true, playerInstanceId: "player",
      sceneIdValue: "layout-a", activationKey: 0,
      item: { id: "a", layoutTemplateId: "layout-a", duration: 0.001 },
      media: [], zones: [{ id: "agenda", type: "agenda" } as LayoutZone],
      onAdvance: () => { advances += 1; },
    });
    const original = bindings.get("agenda");
    const binding = React.useMemo<AgendaZoneBinding | undefined>(() => original && ({
      ...original,
      register: (duration) => { const result = original.register(duration); if (result) accepted.register += 1; return result; },
      ready: (duration) => { const result = original.ready(duration); if (result) accepted.ready += 1; return result; },
      complete: () => { const result = original.complete(); if (result) accepted.complete += 1; return result; },
    }), [original]);
    return React.createElement(AgendaConfigZoneWidget, {
      configId: CONFIG_ID,
      completionBinding: binding,
      agendaPreparing: false,
      onPresentationState: (state) => reports.push(state.page),
    });
  }
  render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
  try {
    await waitFor(() => assert.ok(accepted.ready >= 1), { timeout: 2_000 });
    assert.ok(accepted.ready >= 1);
    await waitFor(() => assert.ok(reports.includes(0)), { timeout: 2_000 });
    await waitFor(() => assert.equal(advances, 1), { timeout: 5_000 });
    assert.ok(accepted.register >= 1);
    assert.equal(accepted.complete, 1);
  } finally {
    cleanup();
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).ResizeObserver = originalObserver;
    (window as any).ResizeObserver = originalObserver;
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
    if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

test("StrictMode scaled production chain freezes intrinsic multi-page plan before delayed ResizeObserver", async () => {
  const originalFetch = globalThis.fetch;
  const originalObserver = (globalThis as any).ResizeObserver;
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const originalRect = HTMLElement.prototype.getBoundingClientRect;

  const observers: Array<{ callback: (entries: any[]) => void; active: boolean }> = [];
  class SilentObserver {
    record: { callback: (entries: any[]) => void; active: boolean };
    constructor(callback: (entries: any[]) => void) {
      this.record = { callback, active: true };
      observers.push(this.record);
    }
    observe() {}
    unobserve() {}
    disconnect() { this.record.active = false; }
  }
  (globalThis as any).ResizeObserver = SilentObserver;
  (window as any).ResizeObserver = SilentObserver;

  const intrinsicHeights: Record<string, number> = {
    "scaled-1": 140,
    "scaled-2": 150,
    "scaled-3": 120,
    "scaled-4": 160,
  };
  const intrinsicHeight = (element: HTMLElement) =>
    element.dataset.measureId ? intrinsicHeights[element.dataset.measureId] ?? 0 : 0;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() { return intrinsicHeight(this as HTMLElement); },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return intrinsicHeight(this as HTMLElement); },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() { return (this as HTMLElement).dataset.measureId ? 394 : 800; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() { return (this as HTMLElement).dataset.measureId ? intrinsicHeight(this as HTMLElement) : 260; },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    const height = this.dataset.measureId ? intrinsicHeight(this) / 2 : 130;
    return {
      x: 0, y: 0, top: 0, left: 0, right: 400, bottom: height,
      width: 400, height, toJSON() { return {}; },
    } as DOMRect;
  };

  let nowMs = 0;
  let timerId = 0;
  const timers = new Map<number, {
    callback: () => void;
    due: number;
    cancelled: boolean;
    fired: boolean;
  }>();
  const fakeTimeout = (callback: () => void, delay = 0) => {
    const id = ++timerId;
    timers.set(id, {
      callback,
      due: nowMs + delay,
      cancelled: false,
      fired: false,
    });
    return id;
  };
  const fakeClear = (handle: unknown) => {
    const timer = timers.get(Number(handle));
    if (timer) timer.cancelled = true;
  };

  const config = buildConfig({
    displayMode: "full",
    layoutMode: "landscape",
    showAgendaDayHeading: true,
    maxItemsPerPage: 8,
    rotationIntervalSeconds: 3,
  });
  const items = [1, 2, 3, 4].map((number) => buildItem({
    id: `scaled-${number}`,
    title: `Width-sensitive session ${number} with a deliberately long title that wraps at the calculated column width`,
    description: `Long description ${number} that produces a distinct intrinsic card measurement at 394 CSS pixels`,
    startsAt: new Date(`2031-07-04T${String(8 + number).padStart(2, "0")}:00:00Z`),
    endsAt: new Date(`2031-07-04T${String(9 + number).padStart(2, "0")}:00:00Z`),
  }));
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      config,
      items,
      client: { id: "c1", name: "Acme", timezone: "UTC" },
      serverTime: 0,
    }),
  } as Response);

  const readyDurations: number[] = [];
  let completed = 0;
  let advances = 0;
  const reports: number[] = [];
  function Harness() {
    const bindings = useAgendaSceneCompletion({
      enabled: true,
      active: true,
      playerInstanceId: "scaled-player",
      sceneIdValue: "scaled-layout",
      activationKey: 0,
      item: { id: "scene", layoutTemplateId: "scaled-layout", duration: 0.001 },
      media: [],
      zones: [{ id: "agenda", type: "agenda" } as LayoutZone],
      onAdvance: () => { advances += 1; },
    });
    const original = bindings.get("agenda");
    const binding = React.useMemo<AgendaZoneBinding | undefined>(() => original && ({
      ...original,
      ready: (duration) => {
        const accepted = original.ready(duration);
        if (accepted) readyDurations.push(duration ?? -1);
        return accepted;
      },
      complete: () => {
        const accepted = original.complete();
        if (accepted) completed += 1;
        return accepted;
      },
    }), [original]);
    return React.createElement("div", { style: { transform: "scale(.5)", transformOrigin: "top left" } },
      React.createElement(AgendaConfigZoneWidget, {
        configId: CONFIG_ID,
        completionBinding: binding,
        agendaPreparing: false,
        onPresentationState: (state) => reports.push(state.page),
        testPresentationTiming: {
          metrics: {},
          now: () => nowMs,
          setTimeout: fakeTimeout,
          clearTimeout: fakeClear,
        },
      }));
  }

  const rendered = render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
  const expectedPageCount = 2;
  const seenIds: string[] = [];
  const visibleIds = () => [...rendered.container.querySelectorAll<HTMLElement>("[data-testid^='agenda-title-scaled-']")]
    .map((element) => element.dataset.testid!.replace("agenda-title-", ""));
  const runDwell = async () => {
    let timer: (typeof timers extends Map<any, infer T> ? T : never) | undefined;
    await waitFor(() => {
      const active = [...timers.values()].filter((candidate) => !candidate.cancelled && !candidate.fired);
      assert.equal(active.length, 1);
      timer = active[0];
    });
    timer!.fired = true;
    nowMs = timer!.due;
    await act(async () => timer!.callback());
  };

  try {
    await waitFor(() => assert.deepEqual(readyDurations, [expectedPageCount * 3_000]));
    await waitFor(() => assert.deepEqual(reports, [0]));
    assert.deepEqual(visibleIds(), ["scaled-1", "scaled-2"]);
    seenIds.push(...visibleIds());
    const measureRoot = rendered.container.querySelector<HTMLElement>("[data-measure-id='scaled-1']")?.parentElement;
    assert.equal(
      measureRoot?.style.width,
      "260.66666666666663px",
      "the canonical 1280×720 geometry, not physical or transformed width, must determine columns",
    );
    assert.equal(completed, 0);
    assert.equal(advances, 0);

    // The initially-silent observer reports a valid but conflicting box only
    // after the intrinsic client-metric plan has frozen.
    const liveObserver = observers.findLast((observer) => observer.active)!;
    await act(async () => liveObserver.callback([{ contentRect: { width: 400, height: 600 } }]));
    await waitFor(() => assert.deepEqual(readyDurations, [expectedPageCount * 3_000]));
    assert.deepEqual(visibleIds(), ["scaled-1", "scaled-2"]);
    assert.deepEqual(reports, [0]);

    await runDwell();
    await waitFor(() => assert.deepEqual(reports, [0, 1]));
    assert.deepEqual(visibleIds(), ["scaled-3", "scaled-4"]);
    seenIds.push(...visibleIds());
    assert.equal(completed, 0);
    assert.equal(advances, 0);

    await runDwell();
    await waitFor(() => assert.equal(completed, 1));
    await waitFor(() => assert.equal(advances, 1));
    assert.deepEqual(reports, [0, 1]);
    assert.deepEqual(seenIds, ["scaled-1", "scaled-2", "scaled-3", "scaled-4"]);

    // Flush any remaining captured callback: a frozen activation cannot ready,
    // reset, complete, or advance a second time.
    for (const timer of [...timers.values()].filter((candidate) => !candidate.cancelled && !candidate.fired)) {
      timer.fired = true;
      await act(async () => timer.callback());
    }
    assert.deepEqual(readyDurations, [expectedPageCount * 3_000]);
    assert.deepEqual(reports, [0, 1]);
    assert.equal(completed, 1);
    assert.equal(advances, 1);
  } finally {
    cleanup();
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).ResizeObserver = originalObserver;
    (window as any).ResizeObserver = originalObserver;
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
    else delete (HTMLElement.prototype as any).offsetHeight;
    if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    else delete (HTMLElement.prototype as any).clientWidth;
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    else delete (HTMLElement.prototype as any).clientHeight;
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
    else delete (HTMLElement.prototype as any).scrollHeight;
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

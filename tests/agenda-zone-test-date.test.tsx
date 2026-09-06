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
import { render, waitFor, cleanup } from "@testing-library/react";
import { AgendaConfigZoneWidget } from "../client/src/components/agenda/AgendaConfigZoneWidget";
import type { AgendaItem, AgendaWidgetConfig } from "../shared/schema";
import type { AgendaZoneBinding } from "../client/src/lib/agenda-scene-completion";

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
// agenda-clock <p> via this exact Intl shape (weekday + HH:MM in the
// site timezone). We reuse it to read the frozen instant back out.
function formatNow(tz: string, d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
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

    // Leg 1: the fetch URL carries the override as an encoded UTC ISO.
    assert.equal(fetchStub.calls.length >= 1, true, "expected at least one fetch");
    const url = fetchStub.calls[0];
    assert.equal(
      url,
      `/api/agenda/display/${CONFIG_ID}?at=${encodeURIComponent(atIso)}`,
      `unexpected fetch url: ${url}`,
    );

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

    // Leg 1: no override param — the live display URL is used verbatim.
    const url = fetchStub.calls[0];
    assert.equal(url, `/api/agenda/display/${CONFIG_ID}`, `unexpected url: ${url}`);
    assert.equal(url.includes("?at="), false);

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

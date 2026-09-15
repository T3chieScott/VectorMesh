import "./setup-jsdom";

import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  AgendaDisplayWidget,
  BOTTOM_PAUSE_MS,
  SCROLL_PX_PER_SEC,
  TOP_PAUSE_MS,
  type AgendaPresentationState,
  type AgendaDisplayWidgetProps,
} from "../client/src/components/agenda/AgendaDisplayWidget";
import type { AgendaZoneBinding } from "../client/src/lib/agenda-scene-completion";
import { insertAgendaWidgetConfigSchema, type AgendaItem, type AgendaWidgetConfig } from "../shared/schema";
import type { CustomFontRef } from "../shared/fonts";

const instant = new Date("2030-01-01T10:00:00Z");
const reveal = (px: number) =>
  TOP_PAUSE_MS + Math.ceil(px / SCROLL_PX_PER_SEC * 1_000) + BOTTOM_PAUSE_MS;

function config(overrides: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    ...insertAgendaWidgetConfigSchema.parse({ clientId: "mounted", name: "Mounted timing" }),
    id: "mounted-config",
    clientId: "mounted",
    name: "Mounted timing",
    layoutMode: "room_door",
    displayMode: "full",
    rotationIntervalSeconds: 3,
    maxItemsPerPage: 1,
    showPresenter: true,
    showDescription: true,
    descriptionLines: null,
    descriptionAutoScroll: true,
    createdAt: instant,
    updatedAt: instant,
    ...overrides,
  } as AgendaWidgetConfig;
}

function item(id: string, overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id,
    clientId: "mounted",
    title: `Session ${id}`,
    description: `Description ${id}`,
    presenter: `Presenter ${id}`,
    room: null,
    track: null,
    startsAt: new Date("2030-01-01T09:00:00Z"),
    endsAt: new Date("2030-01-01T11:00:00Z"),
    status: "scheduled",
    statusMessage: null,
    sortOrder: 0,
    externalId: null,
    createdAt: instant,
    updatedAt: instant,
    ...overrides,
  } as AgendaItem;
}

type Timer = {
  id: number;
  callback: () => void;
  due: number;
  cancelled: boolean;
  fired: boolean;
};

function scheduler() {
  let clock = 0;
  let serial = 0;
  const timers: Timer[] = [];
  const setTimeout = (callback: () => void, delayMs: number) => {
    const timer = { id: ++serial, callback, due: clock + delayMs, cancelled: false, fired: false };
    timers.push(timer);
    return timer.id;
  };
  const clearTimeout = (handle: unknown) => {
    const timer = timers.find((entry) => entry.id === Number(handle));
    if (timer) timer.cancelled = true;
  };
  const advanceDue = async (target: number) => {
    assert.ok(target >= clock, "scheduler cannot move backwards");
    while (true) {
      const next = timers
        .filter((timer) => !timer.cancelled && !timer.fired && timer.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next) break;
      clock = next.due;
      next.fired = true;
      await act(async () => {
        next.callback();
      });
    }
    clock = target;
  };
  const invokeCancelled = async (timer: Timer) => {
    assert.equal(timer.cancelled, true, "debug invocation requires a cancelled timer");
    await act(async () => {
      timer.callback();
    });
  };
  return {
    now: () => clock,
    setTimeout,
    clearTimeout,
    advanceDue,
    invokeCancelled,
    timers,
    active: () => timers.filter((timer) => !timer.cancelled && !timer.fired),
  };
}

function binding(activation: string, timing: ReturnType<typeof scheduler>) {
  const ready: Array<{ at: number; value: number | undefined }> = [];
  const registered: Array<{ at: number; value: number | undefined }> = [];
  const completed: number[] = [];
  const value: AgendaZoneBinding = {
    playerId: "player" as any,
    sceneId: "scene" as any,
    zoneId: "zone" as any,
    activationId: activation as any,
    ready: (duration) => { ready.push({ at: timing.now(), value: duration }); return true; },
    register: (duration) => { registered.push({ at: timing.now(), value: duration }); return true; },
    complete: () => { completed.push(timing.now()); return true; },
    fail: () => true,
    unregister: () => true,
  };
  return { value, ready, registered, completed };
}

function props(
  timing: ReturnType<typeof scheduler>,
  metrics: Record<string, number>,
  overrides: Partial<AgendaDisplayWidgetProps> = {},
): AgendaDisplayWidgetProps {
  return {
    config: config(),
    items: [item("one")],
    width: 800,
    height: 500,
    timezone: "UTC",
    now: instant,
    testPresentationTiming: {
      metrics,
      now: timing.now,
      setTimeout: timing.setTimeout,
      clearTimeout: timing.clearTimeout,
    },
    ...overrides,
  };
}

test("mounted controlled one-page dwell retains metric high-water and completes at the matching registered deadline", async () => {
  const timing = scheduler();
  const completion = binding("growth", timing);
  const rendered = render(<AgendaDisplayWidget {...props(timing, { "presenter:one": 28 }, {
    completionBinding: completion.value,
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active().length, 1));
    const shortTimer = timing.active()[0];
    assert.equal(shortTimer.due, reveal(28));
    assert.deepEqual(completion.ready.map((call) => call.value), [3_000]);

    await timing.advanceDue(1_000);
    rendered.rerender(<AgendaDisplayWidget {...props(timing, { "presenter:one": 280 }, {
      completionBinding: completion.value,
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 1_000 + reveal(280)));
    const longTimer = timing.active()[0];
    assert.equal(shortTimer.cancelled, true, "shorter timer is cancelled after growth");

    await timing.advanceDue(2_000);
    rendered.rerender(<AgendaDisplayWidget {...props(timing, { "presenter:one": 280 }, {
      completionBinding: completion.value,
    })} />);
    await waitFor(() => assert.notEqual(timing.active()[0]?.id, longTimer.id));
    const unchangedMetricTimer = timing.active()[0];
    assert.equal(longTimer.cancelled, true);
    assert.equal(
      unchangedMetricTimer.due,
      1_000 + reveal(280),
      "an unchanged metric rerender does not restart or extend the reveal",
    );

    await timing.advanceDue(12_000);
    rendered.rerender(<AgendaDisplayWidget {...props(timing, { "presenter:one": 56 }, {
      completionBinding: completion.value,
    })} />);
    await waitFor(() => assert.notEqual(timing.active()[0]?.id, longTimer.id));
    assert.equal(unchangedMetricTimer.cancelled, true, "superseded longer timer is cancelled");
    const absoluteDeadline = 12_000 + reveal(56);
    assert.equal(
      timing.active()[0].due,
      absoluteDeadline,
      "positive shrink restarts its reveal without lowering the retained deadline",
    );
    assert.equal(completion.registered.at(-1)?.value, absoluteDeadline);

    await timing.advanceDue(absoluteDeadline - 1);
    assert.deepEqual(completion.completed, []);
    await timing.advanceDue(absoluteDeadline);
    assert.deepEqual(completion.completed, [absoluteDeadline]);
    assert.equal(completion.registered.at(-1)?.value, completion.completed[0]);
  } finally {
    cleanup();
  }
});

test("mounted page dwell uses the longest visible presenter or description across one or many cards, never their sum", async () => {
  const cases = [
    {
      name: "presenter wins on same card",
      ids: ["one"],
      metrics: { "presenter:one": 84, "description:one": 28 },
      expected: reveal(84),
    },
    {
      name: "description wins on same card",
      ids: ["one"],
      metrics: { "presenter:one": 28, "description:one": 112 },
      expected: reveal(112),
    },
    {
      name: "maximum across cards",
      ids: ["one", "two"],
      metrics: { "presenter:one": 56, "description:two": 112 },
      expected: reveal(112),
    },
    {
      name: "off-page IDs are ignored",
      ids: ["one", "two"],
      metrics: { "description:one": 56, "presenter:two": 999 },
      expected: reveal(56),
      pageSize: 1,
    },
  ];
  for (const row of cases) {
    const timing = scheduler();
    const completion = binding(`table-${row.name}`, timing);
    render(<AgendaDisplayWidget {...props(timing, row.metrics, {
      config: config({ maxItemsPerPage: row.pageSize ?? row.ids.length }),
      items: row.ids.map((id) => item(id)),
      completionBinding: completion.value,
    })} />);
    try {
      await waitFor(() => assert.equal(timing.active().length, 1));
      assert.equal(timing.active()[0].due, row.expected, row.name);
      const pageCount = row.pageSize === 1 ? 2 : 1;
      assert.equal(completion.registered.at(-1)?.value, row.expected + (pageCount - 1) * 3_000, row.name);
    } finally {
      cleanup();
    }
  }
});

test("mounted no-overflow page completes at the configured deadline", async () => {
  const timing = scheduler();
  const completion = binding("no-overflow", timing);
  render(<AgendaDisplayWidget {...props(timing, {
    "presenter:one": 0,
    "description:one": 0,
  }, { completionBinding: completion.value })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, 3_000));
    assert.equal(completion.registered.at(-1)?.value, 3_000);
    await timing.advanceDue(2_999);
    assert.deepEqual(completion.completed, []);
    await timing.advanceDue(3_000);
    assert.deepEqual(completion.completed, [3_000]);
  } finally {
    cleanup();
  }
});

test("mounted card overflow extends the deadline even when inner animation is inactive", async () => {
  const timing = scheduler();
  const completion = binding("card-only", timing);
  const rendered = render(<AgendaDisplayWidget {...props(timing, { "card:one": 56 }, {
    config: config({
      descriptionAutoScroll: false,
      showPresenter: false,
    }),
    completionBinding: completion.value,
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    assert.equal(completion.registered.at(-1)?.value, reveal(56));
    const initialTimer = timing.active()[0];
    await timing.advanceDue(1_000);
    // A post-layout/font remeasurement with the same card overflow must not
    // restart or re-block the already scheduled outer reveal.
    rendered.rerender(<AgendaDisplayWidget {...props(timing, { "card:one": 56 }, {
      config: config({
        descriptionAutoScroll: false,
        showPresenter: false,
      }),
      completionBinding: completion.value,
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    assert.equal(initialTimer.cancelled, true);
    assert.equal(
      timing.active()[0]?.due,
      reveal(56),
      "equivalent card remeasurement preserves the absolute dwell deadline",
    );
    await timing.advanceDue(reveal(56) - 1);
    assert.deepEqual(completion.completed, []);
    await timing.advanceDue(reveal(56));
    assert.deepEqual(completion.completed, [reveal(56)]);
  } finally {
    cleanup();
  }
});

test("mounted card-only overflow replays from the top on a single-page cycle", async () => {
  const timing = scheduler();
  const rendered = render(<AgendaDisplayWidget {...props(timing, {
    "card:one": 56,
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    const firstDeadline = reveal(56);
    await timing.advanceDue(firstDeadline);
    await waitFor(() => assert.equal(timing.active().length, 1));
    assert.equal(
      timing.active()[0].due,
      firstDeadline + reveal(56),
      "the card-only cycle gets a fresh outer reveal deadline",
    );
    // Keep the mounted instance alive through the replay so its row receives
    // the reset tick even though no inner viewport reports overflow.
    assert.ok(rendered.container.querySelector("[data-testid]"));
  } finally {
    cleanup();
  }
});

test("mounted card reveal precedes inner reveal while cards on a page remain concurrent", async () => {
  const timing = scheduler();
  const completion = binding("staged-card", timing);
  render(<AgendaDisplayWidget {...props(timing, {
    "card:one": 56,
    "description:one": 28,
  }, {
    completionBinding: completion.value,
  })} />);
  try {
    await waitFor(() =>
      assert.equal(timing.active()[0]?.due, reveal(56) + reveal(28)),
    );
    assert.equal(completion.registered.at(-1)?.value, reveal(56) + reveal(28));
  } finally {
    cleanup();
  }
});

test("mounted reduced-motion page ignores large metrics and completes at the configured finite deadline", async () => {
  const original = window.matchMedia;
  window.matchMedia = (() => ({
    matches: true,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  })) as typeof window.matchMedia;
  const timing = scheduler();
  const completion = binding("reduced", timing);
  try {
    render(<AgendaDisplayWidget {...props(timing, {
      "presenter:one": 50_000,
      "description:one": 75_000,
    }, { completionBinding: completion.value })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 3_000));
    assert.equal(completion.registered.at(-1)?.value, 3_000);
    await timing.advanceDue(3_000);
    assert.deepEqual(completion.completed, [3_000]);
  } finally {
    cleanup();
    window.matchMedia = original;
  }
});

test("mounted controlled NOW/NEXT gives each semantic page a fresh metric origin and aligned total", async () => {
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get() { return (this as HTMLElement).dataset.measureId ? 100 : 0; } },
    clientWidth: { configurable: true, get() { return 800; } },
    clientHeight: { configurable: true, get() { return (this as HTMLElement).dataset.measureId ? 100 : 400; } },
    scrollHeight: { configurable: true, get() { return (this as HTMLElement).dataset.measureId ? 100 : 0; } },
  });
  const timing = scheduler();
  const completion = binding("now-next", timing);
  const reports: Array<AgendaPresentationState & { at: number }> = [];
  const current = item("now");
  const next = item("next", {
    startsAt: new Date("2030-01-01T12:00:00Z"),
    endsAt: new Date("2030-01-01T13:00:00Z"),
  });
  try {
    render(<AgendaDisplayWidget {...props(timing, {
      "presenter:now": 56,
      "presenter:next": 112,
    }, {
      config: config({ layoutMode: "landscape", displayMode: "now_next" }),
      items: [current, next],
      completionBinding: completion.value,
      onPresentationState: (state) => reports.push({ ...state, at: timing.now() }),
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    assert.equal(reports.at(-1)?.stage, "now");
    assert.equal(completion.ready.at(-1)?.value, 6_000);
    assert.equal(completion.registered.at(-1)?.value, reveal(56) + 3_000);

    await timing.advanceDue(reveal(56) - 1);
    assert.equal(reports.at(-1)?.stage, "now");
    await timing.advanceDue(reveal(56));
    await waitFor(() => assert.equal(reports.at(-1)?.stage, "next"));
    assert.equal(reports.at(-1)?.at, reveal(56));
    assert.equal(timing.active()[0]?.due, reveal(56) + reveal(112));
    assert.equal(completion.registered.at(-1)?.value, reveal(56) + reveal(112));
    await timing.advanceDue(reveal(56) + reveal(112));
    assert.deepEqual(completion.completed, [reveal(56) + reveal(112)]);
  } finally {
    cleanup();
    if (offsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
    else delete (HTMLElement.prototype as any).offsetHeight;
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
    else delete (HTMLElement.prototype as any).clientWidth;
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
    else delete (HTMLElement.prototype as any).clientHeight;
    if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
    else delete (HTMLElement.prototype as any).scrollHeight;
  }
});

test("mounted follower owns no local timer, follows leader transitions, and starts a fresh dwell when detached", async () => {
  const timing = scheduler();
  const reports: AgendaPresentationState[] = [];
  const base = props(timing, { "presenter:one": 56, "presenter:two": 112 }, {
    items: [item("one"), item("two")],
    onPresentationState: (state) => reports.push(state),
  });
  const rendered = render(<AgendaDisplayWidget {...base}
    followedPresentationState={{ stage: "page", page: 0, cycle: 4 }} />);
  try {
    await waitFor(() => assert.equal(reports.at(-1)?.page, 0));
    assert.equal(timing.timers.length, 0);
    rendered.rerender(<AgendaDisplayWidget {...base}
      followedPresentationState={{ stage: "page", page: 1, cycle: 5 }} />);
    await waitFor(() => assert.equal(reports.at(-1)?.page, 1));
    await timing.advanceDue(100_000);
    assert.equal(reports.at(-1)?.page, 1);
    assert.equal(reports.at(-1)?.cycle, 5);
    assert.equal(timing.timers.length, 0, "follower never schedules local dwell");

    rendered.rerender(<AgendaDisplayWidget {...base} followedPresentationState={null} />);
    await waitFor(() => assert.equal(timing.active().length, 1));
    assert.equal(reports.at(-1)?.page, 0);
    assert.equal(timing.active()[0].due, 100_000 + reveal(56));
    await timing.advanceDue(100_000 + reveal(56) - 1);
    assert.equal(reports.at(-1)?.page, 0);
    await timing.advanceDue(100_000 + reveal(56));
    await waitFor(() => assert.equal(reports.at(-1)?.page, 1));
  } finally {
    cleanup();
  }
});

test("mounted single-page reset loop gives concurrent metrics a fresh origin and rejects its cancelled callback", async () => {
  const timing = scheduler();
  const initial = props(timing, {
    "presenter:one": 28,
    "description:one": 56,
  });
  const rendered = render(<AgendaDisplayWidget {...initial} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    const cancelled = timing.active()[0];
    await timing.advanceDue(1_000);
    rendered.rerender(<AgendaDisplayWidget {...props(timing, {
      "presenter:one": 84,
      "description:one": 112,
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 1_000 + reveal(112)));
    assert.equal(cancelled.cancelled, true);
    const currentId = timing.active()[0].id;
    await timing.invokeCancelled(cancelled);
    assert.equal(timing.active()[0].id, currentId, "cancelled callback cannot reset the loop");

    const firstDeadline = 1_000 + reveal(112);
    await timing.advanceDue(firstDeadline);
    await waitFor(() => assert.equal(timing.active().length, 1));
    assert.notEqual(timing.active()[0].id, currentId);
    assert.equal(
      timing.active()[0].due,
      firstDeadline + reveal(112),
      "both unchanged metrics are newly observed after reset and share one maximum deadline",
    );
  } finally {
    cleanup();
  }
});

test("mounted stale lifecycle callbacks cannot advance a reused activation or an uncontrolled page after follow mode", async () => {
  const timing = scheduler();
  const a = binding("A", timing);
  const b = binding("B", timing);
  const reports: AgendaPresentationState[] = [];
  const make = (completionBinding?: AgendaZoneBinding, followedPresentationState?: AgendaPresentationState | null) =>
    props(timing, { "presenter:one": 56, "presenter:two": 56 }, {
      items: [item("one"), item("two")],
      completionBinding,
      followedPresentationState,
      onPresentationState: (state) => reports.push(state),
    });
  const rendered = render(<AgendaDisplayWidget {...make(a.value)} />);
  try {
    await waitFor(() => assert.equal(timing.active().length, 1));
    const oldControlledA = timing.active()[0];
    await timing.advanceDue(100);
    rendered.rerender(<AgendaDisplayWidget {...make(b.value)} />);
    await waitFor(() => assert.equal(oldControlledA.cancelled, true));
    rendered.rerender(<AgendaDisplayWidget {...make(a.value)} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 100 + reveal(56)));
    const reportCount = reports.length;
    await timing.invokeCancelled(oldControlledA);
    assert.equal(reports.length, reportCount);
    assert.deepEqual(a.completed, []);
    assert.deepEqual(b.completed, []);
    assert.equal(reports.at(-1)?.page, 0);

    rendered.rerender(<AgendaDisplayWidget {...make(undefined)} />);
    await waitFor(() => assert.equal(timing.active().length, 1));
    const oldUncontrolledA = timing.active()[0];
    await timing.advanceDue(200);
    rendered.rerender(<AgendaDisplayWidget {...make(undefined, { stage: "page", page: 1, cycle: 9 })} />);
    await waitFor(() => assert.equal(oldUncontrolledA.cancelled, true));
    await timing.advanceDue(50_000);
    assert.equal(reports.at(-1)?.page, 1);
    rendered.rerender(<AgendaDisplayWidget {...make(undefined, null)} />);
    await waitFor(() => assert.equal(timing.active().length, 1));
    assert.equal(timing.active()[0].due, 50_000 + reveal(56));
    const detachedCount = reports.length;
    await timing.invokeCancelled(oldUncontrolledA);
    assert.equal(reports.length, detachedCount);
    assert.equal(reports.at(-1)?.page, 0);
    await timing.advanceDue(50_000 + reveal(56) - 1);
    assert.equal(reports.at(-1)?.page, 0);
    await timing.advanceDue(50_000 + reveal(56));
    await waitFor(() => assert.equal(reports.at(-1)?.page, 1));
  } finally {
    cleanup();
  }
});

test("mounted uncontrolled equivalent refresh preserves page, cycle, deadline, and scroll origin", async () => {
  const timing = scheduler();
  const metrics = { "presenter:one": 56, "presenter:two": 56 };
  const baseConfig = config({ maxItemsPerPage: 1 });
  const firstItems = [item("one"), item("two")];
  const reports: AgendaPresentationState[] = [];
  const rendered = render(<AgendaDisplayWidget {...props(timing, metrics, {
    config: baseConfig,
    items: firstItems,
    onPresentationState: (state) => reports.push(state),
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    await timing.advanceDue(1_000);
    const firstDeadline = timing.active()[0];
    assert.deepEqual(reports.at(-1), { stage: "page", page: 0, cycle: 0 });

    // Fresh objects from a polling response are semantically equivalent.
    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig },
      items: [item("one"), item("two")],
      onPresentationState: (state) => reports.push(state),
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, firstDeadline.due));
    assert.equal(timing.active()[0].id, firstDeadline.id, "equivalent refresh retains the active timer");
    assert.deepEqual(reports.at(-1), { stage: "page", page: 0, cycle: 0 });

    await timing.advanceDue(firstDeadline.due);
    await waitFor(() => assert.deepEqual(reports.at(-1), { stage: "page", page: 1, cycle: 0 }));
    const secondDeadline = timing.active()[0];
    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig },
      items: [item("one"), item("two")],
      onPresentationState: (state) => reports.push(state),
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, secondDeadline.due));
    assert.equal(timing.active()[0].id, secondDeadline.id, "equivalent refresh retains page-two dwell");
    assert.deepEqual(reports.at(-1), { stage: "page", page: 1, cycle: 0 });
  } finally {
    cleanup();
  }
});

test("mounted mid-cycle fallback heading rename resets the agenda lifecycle", async () => {
  const timing = scheduler();
  const baseConfig = config({
    maxItemsPerPage: 1,
    showEventName: true,
    eventName: null,
    name: "Original fallback heading",
  });
  const rendered = render(<AgendaDisplayWidget {...props(timing, {}, {
    config: baseConfig,
    items: [item("one"), item("two")],
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, 3_000));
    await timing.advanceDue(1_000);
    const cancelled = timing.active()[0];

    rendered.rerender(<AgendaDisplayWidget {...props(timing, {}, {
      config: { ...baseConfig, name: "Renamed fallback heading" },
      items: [item("one"), item("two")],
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 4_000));
    assert.equal(cancelled.cancelled, true);
    assert.equal(rendered.container.querySelector("[data-testid=agenda-event-title]")?.textContent,
      "Renamed fallback heading");
  } finally {
    cleanup();
  }
});

test("mounted uncontrolled same-count content and membership changes reset page zero and reject stale callbacks", async () => {
  const timing = scheduler();
  const metrics = { "presenter:one": 56, "presenter:two": 56 };
  const baseConfig = config({ maxItemsPerPage: 1 });
  const rendered = render(<AgendaDisplayWidget {...props(timing, metrics, {
    config: baseConfig,
    items: [item("one"), item("two")],
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    await timing.advanceDue(1_000);
    const cancelled = timing.active()[0];

    // Same count, but both rendered content and canonical order changed.
    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig },
      items: [item("two", { title: "Changed session" }), item("one")],
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 1_000 + reveal(56)));
    assert.equal(cancelled.cancelled, true);
    assert.equal(timing.active()[0].id === cancelled.id, false);
    await timing.invokeCancelled(cancelled);
    assert.equal(timing.active()[0]?.due, 1_000 + reveal(56));
  } finally {
    cleanup();
  }
});

test("mounted same-ID equal-height content replacement gets a fresh presentation generation", async () => {
  const timing = scheduler();
  const metrics = { "presenter:one": 56 };
  const baseConfig = config({ maxItemsPerPage: 1 });
  const rendered = render(<AgendaDisplayWidget {...props(timing, metrics, {
    config: baseConfig,
    items: [item("one", { title: "Original title" })],
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, reveal(56)));
    await timing.advanceDue(1_000);
    const cancelled = timing.active()[0];

    // The replacement deliberately keeps the same ID and measured overflow;
    // lifecycle generation must still advance from rendered content.
    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig },
      items: [item("one", { title: "Replacement title" })],
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 1_000 + reveal(56)));
    assert.equal(cancelled.cancelled, true);
    await timing.invokeCancelled(cancelled);
    assert.equal(timing.active()[0]?.due, 1_000 + reveal(56));
  } finally {
    cleanup();
  }
});

test("mounted uncontrolled final page gets a full dwell before wrapping across two cycles", async () => {
  const timing = scheduler();
  const reports: AgendaPresentationState[] = [];
  const rendered = render(<AgendaDisplayWidget {...props(timing, {}, {
    config: config({ maxItemsPerPage: 1 }),
    items: [item("one"), item("two")],
    onPresentationState: (state) => reports.push(state),
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, 3_000));
    await timing.advanceDue(3_000);
    await waitFor(() => assert.deepEqual(reports.at(-1), { stage: "page", page: 1, cycle: 0 }));
    assert.equal(timing.active()[0].due, 6_000);

    await timing.advanceDue(5_999);
    assert.deepEqual(reports.at(-1), { stage: "page", page: 1, cycle: 0 });
    await timing.advanceDue(6_000);
    await waitFor(() => assert.deepEqual(reports.at(-1), { stage: "page", page: 0, cycle: 1 }));

    await timing.advanceDue(9_000);
    await waitFor(() => assert.deepEqual(reports.at(-1), { stage: "page", page: 1, cycle: 1 }));
    await timing.advanceDue(12_000);
    await waitFor(() => assert.deepEqual(reports.at(-1), { stage: "page", page: 0, cycle: 2 }));
  } finally {
    cleanup();
    void rendered;
  }
});

test("mounted equivalent font rerender preserves pagination while a font or presentation change resets it", async () => {
  const timing = scheduler();
  const metrics = {};
  const reports: AgendaPresentationState[] = [];
  const selectedFont: CustomFontRef = {
    id: "font-a",
    familyId: "family-a",
    name: "Family A",
    weight: 400,
    style: "normal",
    format: "woff2",
  };
  const unrelatedFont: CustomFontRef = {
    id: "font-unrelated",
    familyId: "family-unrelated",
    name: "Unrelated",
    weight: 400,
    style: "normal",
    format: "woff2",
  };
  const baseConfig = config({ maxItemsPerPage: 1, fontFamily: "custom:family-a" });
  const rendered = render(<AgendaDisplayWidget {...props(timing, metrics, {
    config: baseConfig,
    items: [item("one"), item("two")],
    presentationRevision: "stable-presentation",
    customFonts: [selectedFont, unrelatedFont],
    onPresentationState: (state) => reports.push(state),
  })} />);
  try {
    await waitFor(() => assert.equal(timing.active()[0]?.due, 3_000));
    await timing.advanceDue(3_000);
    assert.equal(timing.active()[0]?.due, 6_000);
    const pageOneTimer = timing.active()[0];

    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig },
      items: [item("one"), item("two")],
      presentationRevision: "stable-presentation",
      customFonts: [selectedFont, unrelatedFont, {
        ...unrelatedFont,
        id: "font-unrelated-2",
      }],
      onPresentationState: (state) => reports.push(state),
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 6_000));
    assert.equal(timing.active()[0]?.id, pageOneTimer.id, "equivalent font-loaded refresh preserves dwell");

    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig, fontFamily: "custom:family-b" },
      items: [item("one"), item("two")],
      presentationRevision: "stable-presentation",
      customFonts: [selectedFont, unrelatedFont],
      onPresentationState: (state) => reports.push(state),
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 6_000));
    assert.equal(pageOneTimer.cancelled, true);
    assert.notEqual(timing.active()[0]?.id, pageOneTimer.id);
    assert.deepEqual(reports.at(-1), { stage: "page", page: 0, cycle: 0 });

    // A selected resource metadata change resets even if the parent revision
    // is stale, while unrelated resources remain outside pixel identity.
    const selectedResourceTimer = timing.active()[0];
    rendered.rerender(<AgendaDisplayWidget {...props(timing, metrics, {
      config: { ...baseConfig },
      items: [item("one"), item("two")],
      presentationRevision: "stable-presentation",
      customFonts: [{ ...selectedFont, weight: 700 }, unrelatedFont],
      onPresentationState: (state) => reports.push(state),
    })} />);
    await waitFor(() => assert.equal(timing.active()[0]?.due, 6_000));
    assert.equal(selectedResourceTimer.cancelled, true);
    assert.notEqual(timing.active()[0]?.id, selectedResourceTimer.id);
    assert.deepEqual(reports.at(-1), { stage: "page", page: 0, cycle: 0 });
  } finally {
    cleanup();
  }
});
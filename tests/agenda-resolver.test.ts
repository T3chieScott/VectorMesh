import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAgendaItems,
  splitCurrentNext,
  pickAgendaLayout,
  paginate,
} from "../shared/agenda-resolver";
import type { AgendaItem, AgendaWidgetConfig } from "../shared/schema";

// Task #208 — Agenda Display Widget. Pin the filter/sort/layout
// rules so regressions in the resolver fall over immediately.

function item(o: Partial<AgendaItem> & { id: string; startsAt: Date; endsAt: Date }): AgendaItem {
  return {
    id: o.id,
    clientId: o.clientId ?? "c1",
    title: o.title ?? `Session ${o.id}`,
    description: o.description ?? null,
    room: o.room ?? null,
    track: o.track ?? null,
    presenter: o.presenter ?? null,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    status: (o.status as any) ?? "scheduled",
    statusMessage: o.statusMessage ?? null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

function cfg(over: Partial<AgendaWidgetConfig> = {}): AgendaWidgetConfig {
  return {
    id: "cfg",
    clientId: "c1",
    name: "Test",
    eventName: null,
    backgroundUrl: null,
    accentColor: "#0ea5e9",
    displayMode: "full",
    layoutMode: "auto",
    fontScale: "normal",
    density: "normal",
    theme: "dark",
    roomFilter: [],
    trackFilter: [],
    statusFilter: [],
    timeWindowMinutes: null,
    refreshIntervalSeconds: 30,
    rotationIntervalSeconds: 10,
    maxItemsPerPage: 8,
    showDescription: true,
    showPresenter: true,
    showRoom: true,
    showStatus: true,
    showCurrentTime: true,
    showEventName: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as AgendaWidgetConfig;
}

const NOW = new Date("2026-06-01T12:00:00Z");

test("resolveAgendaItems drops items that ended >15 min ago in full mode", () => {
  const items = [
    item({ id: "past", startsAt: new Date("2026-06-01T10:00:00Z"), endsAt: new Date("2026-06-01T11:00:00Z") }),
    item({ id: "now", startsAt: new Date("2026-06-01T11:30:00Z"), endsAt: new Date("2026-06-01T12:30:00Z") }),
    item({ id: "later", startsAt: new Date("2026-06-01T14:00:00Z"), endsAt: new Date("2026-06-01T15:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg(), now: NOW });
  assert.deepEqual(got.map((i) => i.id), ["now", "later"]);
});

test("resolveAgendaItems keeps recently-ended items within 15min trailing window", () => {
  const items = [
    item({ id: "just_ended", startsAt: new Date("2026-06-01T11:00:00Z"), endsAt: new Date("2026-06-01T11:50:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg(), now: NOW });
  assert.equal(got.length, 1);
});

test("resolveAgendaItems filters by room (case-insensitive)", () => {
  const items = [
    item({ id: "a", room: "Main Hall", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
    item({ id: "b", room: "Room B", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ roomFilter: ["main hall"] }), now: NOW });
  assert.deepEqual(got.map((i) => i.id), ["a"]);
});

test("resolveAgendaItems filters by track", () => {
  const items = [
    item({ id: "a", track: "Keynote", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
    item({ id: "b", track: "Workshop", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ trackFilter: ["keynote"] }), now: NOW });
  assert.deepEqual(got.map((i) => i.id), ["a"]);
});

test("resolveAgendaItems alert mode keeps only delayed/cancelled/moved", () => {
  const items = [
    item({ id: "ok", status: "scheduled", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
    item({ id: "delayed", status: "delayed", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
    item({ id: "cancelled", status: "cancelled", startsAt: NOW, endsAt: new Date(NOW.getTime() + 3600_000) }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "alert" }), now: NOW });
  assert.deepEqual(got.map((i) => i.id).sort(), ["cancelled", "delayed"]);
});

test("resolveAgendaItems sorts by start asc", () => {
  const items = [
    item({ id: "late", startsAt: new Date("2026-06-01T13:00:00Z"), endsAt: new Date("2026-06-01T14:00:00Z") }),
    item({ id: "early", startsAt: new Date("2026-06-01T12:30:00Z"), endsAt: new Date("2026-06-01T13:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg(), now: NOW });
  assert.deepEqual(got.map((i) => i.id), ["early", "late"]);
});

test("resolveAgendaItems applies timeWindowMinutes", () => {
  const items = [
    item({ id: "soon", startsAt: new Date("2026-06-01T12:30:00Z"), endsAt: new Date("2026-06-01T13:00:00Z") }),
    item({ id: "far", startsAt: new Date("2026-06-01T18:00:00Z"), endsAt: new Date("2026-06-01T19:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ timeWindowMinutes: 120 }), now: NOW });
  assert.deepEqual(got.map((i) => i.id), ["soon"]);
});

test("splitCurrentNext finds in-flight item and upcoming ones", () => {
  const items = [
    item({ id: "running", startsAt: new Date("2026-06-01T11:30:00Z"), endsAt: new Date("2026-06-01T12:30:00Z") }),
    item({ id: "next", startsAt: new Date("2026-06-01T13:00:00Z"), endsAt: new Date("2026-06-01T14:00:00Z") }),
  ];
  const { current, upcoming } = splitCurrentNext(items, NOW);
  assert.deepEqual(current.map((i) => i.id), ["running"]);
  assert.deepEqual(upcoming.map((i) => i.id), ["next"]);
});

test("splitCurrentNext excludes cancelled from current", () => {
  const items = [
    item({ id: "cancel", status: "cancelled", startsAt: new Date("2026-06-01T11:30:00Z"), endsAt: new Date("2026-06-01T12:30:00Z") }),
  ];
  const { current } = splitCurrentNext(items, NOW);
  assert.equal(current.length, 0);
});

test("pickAgendaLayout honours non-auto config", () => {
  assert.equal(pickAgendaLayout("ultrawide", 1920, 1080, "full"), "ultrawide");
  assert.equal(pickAgendaLayout("portrait", 1920, 1080, "full"), "portrait");
});

test("pickAgendaLayout auto picks ultrawide >= 3:1", () => {
  assert.equal(pickAgendaLayout("auto", 3840, 1080, "full"), "ultrawide");
});

test("pickAgendaLayout auto picks portrait for narrow", () => {
  assert.equal(pickAgendaLayout("auto", 1080, 1920, "full"), "portrait");
});

test("pickAgendaLayout auto picks room_door for room_focus mode", () => {
  assert.equal(pickAgendaLayout("auto", 1280, 800, "room_focus"), "room_door");
});

test("pickAgendaLayout auto picks totem for narrow now_next", () => {
  assert.equal(pickAgendaLayout("auto", 720, 1920, "now_next"), "totem");
});

test("paginate splits items into pages of size n", () => {
  const pages = paginate([1, 2, 3, 4, 5], 2);
  assert.deepEqual(pages, [[1, 2], [3, 4], [5]]);
});

test("paginate returns [] for empty input", () => {
  assert.deepEqual(paginate([], 3), []);
});

test("paginate returns single page when pageSize is 0", () => {
  assert.deepEqual(paginate([1, 2, 3], 0), [[1, 2, 3]]);
});

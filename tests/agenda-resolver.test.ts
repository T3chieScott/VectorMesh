import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAgendaItems,
  splitCurrentNext,
  pickAgendaLayout,
  paginate,
  tzCalendarDayKey,
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
    showDayName: false,
    showDate: false,
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

test("resolveAgendaItems now_next mode keeps current + one upcoming per room", () => {
  const items = [
    item({ id: "live_main", room: "Main Hall", startsAt: new Date("2026-06-01T11:30:00Z"), endsAt: new Date("2026-06-01T12:30:00Z") }),
    item({ id: "live_b", room: "Room B", startsAt: new Date("2026-06-01T11:45:00Z"), endsAt: new Date("2026-06-01T12:45:00Z") }),
    item({ id: "next_main", room: "Main Hall", startsAt: new Date("2026-06-01T13:00:00Z"), endsAt: new Date("2026-06-01T14:00:00Z") }),
    item({ id: "later_main", room: "Main Hall", startsAt: new Date("2026-06-01T15:00:00Z"), endsAt: new Date("2026-06-01T16:00:00Z") }),
    item({ id: "next_b", room: "Room B", startsAt: new Date("2026-06-01T13:30:00Z"), endsAt: new Date("2026-06-01T14:30:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "now_next" }), now: NOW });
  assert.deepEqual(got.map((i) => i.id), ["live_main", "live_b", "next_main", "next_b"]);
});

test("today_tomorrow keeps only today's items while today still has live/upcoming", () => {
  const items = [
    item({ id: "today_am", startsAt: new Date("2026-06-01T11:30:00Z"), endsAt: new Date("2026-06-01T12:30:00Z") }),
    item({ id: "today_pm", startsAt: new Date("2026-06-01T15:00:00Z"), endsAt: new Date("2026-06-01T16:00:00Z") }),
    item({ id: "tomorrow", startsAt: new Date("2026-06-02T09:00:00Z"), endsAt: new Date("2026-06-02T10:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "today_tomorrow" }), now: NOW, tz: "UTC" });
  assert.deepEqual(got.map((i) => i.id), ["today_am", "today_pm"]);
});

test("today_tomorrow auto-rolls to tomorrow's items once today is exhausted", () => {
  const lateNow = new Date("2026-06-01T23:30:00Z");
  const items = [
    item({ id: "today_done", startsAt: new Date("2026-06-01T09:00:00Z"), endsAt: new Date("2026-06-01T10:00:00Z") }),
    item({ id: "tomorrow", startsAt: new Date("2026-06-02T09:00:00Z"), endsAt: new Date("2026-06-02T10:00:00Z") }),
    item({ id: "later", startsAt: new Date("2026-06-04T09:00:00Z"), endsAt: new Date("2026-06-04T10:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "today_tomorrow" }), now: lateNow, tz: "UTC" });
  assert.deepEqual(got.map((i) => i.id), ["tomorrow"]);
});

test("today_tomorrow stays empty when today is exhausted and tomorrow has no sessions", () => {
  const lateNow = new Date("2026-06-01T23:30:00Z");
  const items = [
    item({ id: "today_done", startsAt: new Date("2026-06-01T09:00:00Z"), endsAt: new Date("2026-06-01T10:00:00Z") }),
    // Skip-day: nothing scheduled on Jun 2; next session not until Jun 4.
    item({ id: "much_later", startsAt: new Date("2026-06-04T09:00:00Z"), endsAt: new Date("2026-06-04T10:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "today_tomorrow" }), now: lateNow, tz: "UTC" });
  assert.deepEqual(got, []);
});

test("today_tomorrow respects DST spring-forward in Europe/London when rolling to tomorrow", () => {
  // BST starts 2026-03-29 01:00 UTC (clocks jump 01:00→02:00 local).
  // "Now" is 23:30 UTC on Mar 28 → 23:30 local in London (still GMT).
  // Today's only session has already ended; auto-roll must pick Mar 29 local,
  // not Mar 30 (which would be the case if naive UTC arithmetic skewed
  // by the lost hour pushed "tomorrow" into the wrong bucket).
  const lateNow = new Date("2026-03-28T23:30:00Z");
  const items = [
    item({ id: "sat_done", startsAt: new Date("2026-03-28T18:00:00Z"), endsAt: new Date("2026-03-28T19:00:00Z") }),
    // Sunday Mar 29 10:00 BST = 09:00 UTC
    item({ id: "sun_bst_morning", startsAt: new Date("2026-03-29T09:00:00Z"), endsAt: new Date("2026-03-29T10:00:00Z") }),
    item({ id: "mon_later", startsAt: new Date("2026-03-30T09:00:00Z"), endsAt: new Date("2026-03-30T10:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "today_tomorrow" }), now: lateNow, tz: "Europe/London" });
  assert.deepEqual(got.map((i) => i.id), ["sun_bst_morning"]);
});

test("today_tomorrow respects DST fall-back in America/Los_Angeles when bucketing today", () => {
  // PDT→PST ends 2026-11-01 09:00 UTC (clocks fall back 02:00→01:00 local).
  // "Now" is 06:00 UTC Nov 1 → 23:00 local Oct 31 (still PDT).
  // Two events on Nov 1 local must bucket into "tomorrow", not "today".
  const now = new Date("2026-11-01T06:00:00Z");
  const items = [
    // Oct 31 22:50 PDT = Nov 1 05:50 UTC (today local, still inside
    // the 15-min trailing window relative to now=06:00 UTC).
    item({ id: "sat_late", startsAt: new Date("2026-11-01T05:00:00Z"), endsAt: new Date("2026-11-01T05:50:00Z") }),
    // Nov 1 10:00 PST = Nov 1 18:00 UTC (tomorrow local)
    item({ id: "sun_morning", startsAt: new Date("2026-11-01T18:00:00Z"), endsAt: new Date("2026-11-01T19:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "today_tomorrow" }), now, tz: "America/Los_Angeles" });
  // Today (Oct 31 PDT) still has an in-progress/recent session, so we
  // return today's only item and don't roll forward yet.
  assert.deepEqual(got.map((i) => i.id), ["sat_late"]);
});

test("today_tomorrow buckets by tz-local calendar day, not UTC", () => {
  const earlyMorningUtc = new Date("2026-06-02T03:00:00Z");
  const items = [
    item({ id: "hnl_today_evening", startsAt: new Date("2026-06-02T04:00:00Z"), endsAt: new Date("2026-06-02T05:00:00Z") }),
    item({ id: "hnl_tomorrow", startsAt: new Date("2026-06-02T20:00:00Z"), endsAt: new Date("2026-06-02T21:00:00Z") }),
  ];
  const got = resolveAgendaItems({ items, config: cfg({ displayMode: "today_tomorrow" }), now: earlyMorningUtc, tz: "Pacific/Honolulu" });
  assert.deepEqual(got.map((i) => i.id), ["hnl_today_evening"]);
});

test("tzCalendarDayKey returns YYYY-MM-DD in the given tz", () => {
  assert.equal(tzCalendarDayKey(new Date("2026-05-31T23:30:00Z"), "Asia/Tokyo"), "2026-06-01");
  assert.equal(tzCalendarDayKey(new Date("2026-05-31T23:30:00Z"), "UTC"), "2026-05-31");
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

test("dedupeAgendaSessions collapses per-speaker rows into one session, merging presenters", () => {
  const start = new Date("2026-06-01T10:45:00Z");
  const end = new Date("2026-06-01T11:05:00Z");
  const rows = [
    item({ id: "a", title: "Behind the Partnership", room: "Future Tech Stage", presenter: "Moderator", startsAt: start, endsAt: end }),
    item({ id: "b", title: "Behind the Partnership", room: "Future Tech Stage", presenter: "Speaker", startsAt: start, endsAt: end }),
    item({ id: "c", title: "Other Talk", room: "Hall A", presenter: "Keynote", startsAt: start, endsAt: end }),
  ];
  const out = resolveAgendaItems({ items: rows, config: cfg(), now: new Date("2026-06-01T10:50:00Z") });
  assert.equal(out.length, 2, "the two duplicate session rows collapse to one");
  const merged = out.find((i) => i.title === "Behind the Partnership")!;
  assert.equal(merged.presenter, "Moderator\nSpeaker");
});

test("dedupeAgendaSessions dedupes identical presenter roles and surfaces an urgent status", () => {
  const start = new Date("2026-06-01T10:45:00Z");
  const end = new Date("2026-06-01T11:05:00Z");
  const rows = [
    item({ id: "a", title: "Panel", room: "CR1", presenter: "Panellist", status: "scheduled", startsAt: start, endsAt: end }),
    item({ id: "b", title: "Panel", room: "CR1", presenter: "Panellist", status: "cancelled", startsAt: start, endsAt: end }),
    item({ id: "c", title: "Panel", room: "CR1", presenter: "Moderator", status: "scheduled", startsAt: start, endsAt: end }),
  ];
  const out = resolveAgendaItems({ items: rows, config: cfg({ displayMode: "alert" }), now: new Date("2026-06-01T10:50:00Z") });
  assert.equal(out.length, 1);
  assert.equal(out[0].presenter, "Panellist\nModerator");
  assert.equal(out[0].status, "cancelled", "merged session keeps the most urgent status");
});

test("dedupeAgendaSessions keeps a live session live (in_progress beats scheduled)", () => {
  const start = new Date("2026-06-01T10:45:00Z");
  const end = new Date("2026-06-01T11:05:00Z");
  const rows = [
    item({ id: "a", title: "Panel", room: "CR1", presenter: "Speaker", status: "scheduled", startsAt: start, endsAt: end }),
    item({ id: "b", title: "Panel", room: "CR1", presenter: "Moderator", status: "in_progress", startsAt: start, endsAt: end }),
  ];
  const out = resolveAgendaItems({ items: rows, config: cfg(), now: new Date("2026-06-01T10:50:00Z") });
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "in_progress", "a live participant row must not be downgraded to scheduled");
});

test("dedupeAgendaSessions keeps same title+time in different rooms as distinct sessions", () => {
  const start = new Date("2026-06-01T10:45:00Z");
  const end = new Date("2026-06-01T11:05:00Z");
  const rows = [
    item({ id: "a", title: "Workshop", room: "Room A", presenter: "Alice", startsAt: start, endsAt: end }),
    item({ id: "b", title: "Workshop", room: "Room B", presenter: "Bob", startsAt: start, endsAt: end }),
  ];
  const out = resolveAgendaItems({ items: rows, config: cfg(), now: new Date("2026-06-01T10:50:00Z") });
  assert.equal(out.length, 2, "different rooms are different sessions and must not merge");
});

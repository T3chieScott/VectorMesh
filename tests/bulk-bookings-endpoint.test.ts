import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import { buildBulkBookingsHandler } from "../server/bulkBookingsHandler";
import type { Event, ScreenEventBooking, InsertScreenEventBooking } from "../shared/schema";

// Stand-in for storage. Tracks created rows and lets each test wire up
// the failure modes (overlap, missing event, etc.) it cares about.
function makeDeps(opts: {
  screen: { id: string; clientId: string | null };
  events: Event[];
  // When a booking comes in for a screenId+startsAt key in this set,
  // throw an overlap error to mimic the real advisory-lock contention.
  overlapKeys?: Set<string>;
}) {
  const created: ScreenEventBooking[] = [];
  return {
    created,
    deps: {
      getScreen: async (id: string) =>
        id === opts.screen.id ? opts.screen : undefined,
      getEvent: async (id: string) =>
        opts.events.find((e) => e.id === id),
      createScreenEventBooking: async (data: InsertScreenEventBooking) => {
        const startsAt = data.startsAt instanceof Date ? data.startsAt : new Date(data.startsAt as any);
        const endsAt = data.endsAt instanceof Date ? data.endsAt : new Date(data.endsAt as any);
        const key = `${data.screenId}|${startsAt.toISOString()}`;
        if (opts.overlapKeys?.has(key)) {
          throw new Error("Booking overlaps with an existing booking on this screen");
        }
        const row: ScreenEventBooking = {
          id: `b-${created.length + 1}`,
          screenId: data.screenId,
          eventId: data.eventId,
          startsAt,
          endsAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        created.push(row);
        return row;
      },
    },
  };
}

interface TestUser {
  allowedClientIds?: string[] | null;
  isAdmin?: boolean;
}

function injectUser(user: TestUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (user) {
      (req as any).dbUser = { role: user.isAdmin ? "admin" : "editor" };
      (req as any).allowedClientIds =
        user.allowedClientIds === undefined ? null : user.allowedClientIds;
    }
    next();
  };
}

function canAccessClientFn(req: Request, clientId: string): boolean {
  if ((req as any).dbUser?.role === "admin") return true;
  const allowed = (req as any).allowedClientIds as string[] | null | undefined;
  return Array.isArray(allowed) ? allowed.includes(clientId) : false;
}

async function withTestServer(
  user: TestUser | null,
  deps: ReturnType<typeof makeDeps>["deps"],
  call: (port: number) => Promise<{ status: number; body: any }>,
) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.post(
    "/api/screens/:screenId/bookings/bulk",
    buildBulkBookingsHandler(deps as any, { canAccessClient: canAccessClientFn }),
  );
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    return await call(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function postBulk(port: number, screenId: string, body: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}/api/screens/${screenId}/bookings/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const event = (id: string, clientId: string | null = "client-A"): Event =>
  ({
    id,
    name: id,
    clientId,
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-12-31T00:00:00Z"),
    description: null,
    locationLat: null,
    locationLng: null,
    timezone: null,
    weatherCity: null,
    location: null,
    createdAt: new Date(),
  } as unknown as Event);

test("bulk: all-success returns one created result per row", async () => {
  const { deps, created } = makeDeps({
    screen: { id: "S1", clientId: "client-A" },
    events: [event("E1"), event("E2")],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "S1", {
        bookings: [
          { eventId: "E1", startsAt: "2026-07-01T10:00:00Z", endsAt: "2026-07-01T12:00:00Z" },
          { eventId: "E2", startsAt: "2026-07-02T10:00:00Z", endsAt: "2026-07-02T12:00:00Z" },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results.length, 2);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "created");
  assert.equal(out.body.results[0].booking.eventId, "E1");
  assert.equal(created.length, 2);
});

test("bulk: mixed overlap + success — partial-failure does not abort remaining rows", async () => {
  // Mark the second row's start instant as a conflict to mimic the
  // advisory-locked overlap path. The third row should still succeed.
  const conflictKey = `S1|${new Date("2026-07-02T10:00:00Z").toISOString()}`;
  const { deps, created } = makeDeps({
    screen: { id: "S1", clientId: "client-A" },
    events: [event("E1")],
    overlapKeys: new Set([conflictKey]),
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "S1", {
        bookings: [
          { eventId: "E1", startsAt: "2026-07-01T10:00:00Z", endsAt: "2026-07-01T12:00:00Z" },
          { eventId: "E1", startsAt: "2026-07-02T10:00:00Z", endsAt: "2026-07-02T12:00:00Z" },
          { eventId: "E1", startsAt: "2026-07-03T10:00:00Z", endsAt: "2026-07-03T12:00:00Z" },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results.length, 3);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "error");
  assert.equal(out.body.results[1].code, "overlap");
  assert.equal(out.body.results[2].status, "created");
  // Indexes preserved so the client can pair results back to its preview rows.
  assert.deepEqual(
    out.body.results.map((r: any) => r.index),
    [0, 1, 2],
  );
  assert.equal(created.length, 2);
});

test("bulk: forbidden event — caller can write to the screen but not the event", async () => {
  const { deps, created } = makeDeps({
    screen: { id: "S1", clientId: "client-A" },
    events: [event("E1", "client-A"), event("E2", "client-B")],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "S1", {
        bookings: [
          { eventId: "E1", startsAt: "2026-07-01T10:00:00Z", endsAt: "2026-07-01T12:00:00Z" },
          { eventId: "E2", startsAt: "2026-07-02T10:00:00Z", endsAt: "2026-07-02T12:00:00Z" },
          { eventId: "E_MISSING", startsAt: "2026-07-03T10:00:00Z", endsAt: "2026-07-03T12:00:00Z" },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results.length, 3);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "error");
  assert.equal(out.body.results[1].code, "forbidden");
  assert.equal(out.body.results[2].status, "error");
  assert.equal(out.body.results[2].code, "event_not_found");
  assert.equal(created.length, 1);
});

test("bulk: bad input — empty body and out-of-range dates rejected up front", async () => {
  const { deps } = makeDeps({
    screen: { id: "S1", clientId: "client-A" },
    events: [event("E1")],
  });
  // Empty body: schema requires bookings.length >= 1.
  const empty = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) => postBulk(port, "S1", { bookings: [] }),
  );
  assert.equal(empty.status, 400);

  // End before start: per-row bad_request, not a top-level 400.
  const bad = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "S1", {
        bookings: [
          { eventId: "E1", startsAt: "2026-07-01T12:00:00Z", endsAt: "2026-07-01T10:00:00Z" },
        ],
      }),
  );
  assert.equal(bad.status, 200);
  assert.equal(bad.body.results[0].status, "error");
  assert.equal(bad.body.results[0].code, "bad_request");
});

test("bulk: 403 when caller can't access the target screen's client", async () => {
  const { deps } = makeDeps({
    screen: { id: "S1", clientId: "client-A" },
    events: [event("E1")],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-B"] },
    deps,
    (port) =>
      postBulk(port, "S1", {
        bookings: [
          { eventId: "E1", startsAt: "2026-07-01T10:00:00Z", endsAt: "2026-07-01T12:00:00Z" },
        ],
      }),
  );
  assert.equal(out.status, 403);
});

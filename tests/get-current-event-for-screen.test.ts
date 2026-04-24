import test from "node:test";
import assert from "node:assert/strict";
import { eq, like, sql } from "drizzle-orm";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import { clients, events, screens, screenEventBookings } from "../shared/schema";

const PREFIX = "__TEST_GCEFS__";
let testClientId: string;

async function makeScreen(name: string) {
  const [row] = await db
    .insert(screens)
    .values({ name: `${PREFIX}${name}`, clientId: testClientId, isPaired: false })
    .returning();
  return row;
}

async function makeEvent(name: string) {
  const [row] = await db
    .insert(events)
    .values({
      name: `${PREFIX}${name}`,
      clientId: testClientId,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    })
    .returning();
  return row;
}

async function makeBooking(
  screenId: string,
  eventId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const [row] = await db
    .insert(screenEventBookings)
    .values({ screenId, eventId, startsAt, endsAt })
    .returning();
  return row;
}

async function cleanup() {
  await db.execute(sql`
    DELETE FROM ${screenEventBookings}
    WHERE screen_id IN (SELECT id FROM ${screens} WHERE name LIKE ${PREFIX + "%"})
       OR event_id  IN (SELECT id FROM ${events}  WHERE name LIKE ${PREFIX + "%"})
  `);
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(events).where(like(events.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

test.before(async () => {
  // The legacy GIST exclusion constraint (which required `btree_gist`)
  // is no longer created by the app, but a previously-migrated dev DB
  // may still have it. The startup migration in server/db.ts drops it
  // for the running server; tests bypass that path, so drop it here too.
  await db.execute(sql`
    ALTER TABLE IF EXISTS screen_event_bookings
    DROP CONSTRAINT IF EXISTS screen_event_bookings_no_overlap
  `);
  await cleanup();
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();
  testClientId = client.id;
});

test.after(async () => {
  await cleanup();
  await pool.end();
});

test("returns undefined when the screen has no bookings", async () => {
  const screen = await makeScreen("no-bookings");
  const out = await storage.getCurrentEventForScreen(
    screen.id,
    new Date("2026-06-01T12:00:00Z"),
  );
  assert.equal(out, undefined);
});

test("returns the active booking's event", async () => {
  const screen = await makeScreen("active");
  const event = await makeEvent("active-event");
  await makeBooking(
    screen.id,
    event.id,
    new Date("2026-06-01T00:00:00Z"),
    new Date("2026-06-10T00:00:00Z"),
  );
  const out = await storage.getCurrentEventForScreen(
    screen.id,
    new Date("2026-06-05T12:00:00Z"),
  );
  assert.equal(out?.id, event.id);
});

test("returns undefined for a future-only booking", async () => {
  const screen = await makeScreen("future");
  const event = await makeEvent("future-event");
  await makeBooking(
    screen.id,
    event.id,
    new Date("2026-07-01T00:00:00Z"),
    new Date("2026-07-10T00:00:00Z"),
  );
  const out = await storage.getCurrentEventForScreen(
    screen.id,
    new Date("2026-06-15T00:00:00Z"),
  );
  assert.equal(out, undefined);
});

test("treats endsAt as exclusive", async () => {
  const screen = await makeScreen("exclusive-end");
  const event = await makeEvent("exclusive-event");
  await makeBooking(
    screen.id,
    event.id,
    new Date("2026-06-01T00:00:00Z"),
    new Date("2026-06-10T00:00:00Z"),
  );
  const out = await storage.getCurrentEventForScreen(
    screen.id,
    new Date("2026-06-10T00:00:00Z"),
  );
  assert.equal(out, undefined);
});

test("prefers the most-recently-started booking on overlap", async () => {
  // Overlap prevention is now enforced in application code by
  // storage.createScreenEventBooking, not by a DB constraint, so we can
  // bypass it for this test by inserting directly via the raw drizzle
  // client. This exercises the read path's tie-breaking when two
  // bookings happen to overlap (e.g. data imported from outside the app).
  const screen = await makeScreen("overlap");
  const oldEvent = await makeEvent("old-event");
  const newEvent = await makeEvent("new-event");

  try {
    await makeBooking(
      screen.id,
      oldEvent.id,
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-30T00:00:00Z"),
    );
    await makeBooking(
      screen.id,
      newEvent.id,
      new Date("2026-06-15T00:00:00Z"),
      new Date("2026-07-15T00:00:00Z"),
    );
    const out = await storage.getCurrentEventForScreen(
      screen.id,
      new Date("2026-06-20T12:00:00Z"),
    );
    assert.equal(out?.id, newEvent.id);
  } finally {
    await db
      .delete(screenEventBookings)
      .where(eq(screenEventBookings.screenId, screen.id));
  }
});

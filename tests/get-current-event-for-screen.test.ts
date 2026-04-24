import test from "node:test";
import assert from "node:assert/strict";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import { clients, events, screens, screenEventBookings } from "../shared/schema";
import { eq } from "drizzle-orm";

// Integration tests for storage.getCurrentEventForScreen. They write
// real rows into the dev DB under a recognizable prefix and clean up
// after themselves so they're safe to re-run.
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
  // Order matters: bookings reference screens + events.
  await db.execute(
    `DELETE FROM screen_event_bookings
       WHERE screen_id IN (SELECT id FROM screens WHERE name LIKE '${PREFIX}%')
          OR event_id IN (SELECT id FROM events WHERE name LIKE '${PREFIX}%')` as any,
  );
  await db.delete(screens).where(eq(screens.name, `${PREFIX}solo`));
  // Use ILIKE-style cleanup for any remaining test-prefixed rows.
  await db.execute(
    `DELETE FROM screens WHERE name LIKE '${PREFIX}%'` as any,
  );
  await db.execute(
    `DELETE FROM events WHERE name LIKE '${PREFIX}%'` as any,
  );
}

test.before(async () => {
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

test("getCurrentEventForScreen returns undefined when the screen has no bookings", async () => {
  const screen = await makeScreen("no-bookings");
  const out = await storage.getCurrentEventForScreen(
    screen.id,
    new Date("2026-06-01T12:00:00Z"),
  );
  assert.equal(out, undefined);
});

test("getCurrentEventForScreen returns the active booking's event", async () => {
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
  assert.notEqual(out, undefined);
  assert.equal(out?.id, event.id);
});

test("getCurrentEventForScreen returns undefined for a future-only booking", async () => {
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

test("getCurrentEventForScreen treats endsAt as exclusive", async () => {
  // Booking is [June 1, June 10). At exactly June 10 00:00 the booking
  // is over and should not match.
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

test("getCurrentEventForScreen prefers the most-recently-started booking on overlap", async () => {
  // The EXCLUDE constraint normally prevents overlapping bookings on
  // the same screen, but legacy/imported data could violate it. The
  // helper should still pick the most-recently-started booking so a
  // hand-over reads as "the new event has started".
  const screen = await makeScreen("overlap");
  const oldEvent = await makeEvent("old-event");
  const newEvent = await makeEvent("new-event");

  // Bypass the no-overlap guard so we can verify the helper's
  // tie-breaker on legacy data. Clean up the rows before re-enabling
  // the constraint so it can be created again.
  await db.execute(
    `ALTER TABLE screen_event_bookings DROP CONSTRAINT IF EXISTS screen_event_bookings_no_overlap` as any,
  );
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
    await db.execute(
      `ALTER TABLE screen_event_bookings
         ADD CONSTRAINT screen_event_bookings_no_overlap
         EXCLUDE USING gist (
           screen_id WITH =,
           tsrange(starts_at, ends_at, '[)') WITH &&
         )` as any,
    );
  }
});

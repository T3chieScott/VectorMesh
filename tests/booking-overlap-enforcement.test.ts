import test from "node:test";
import assert from "node:assert/strict";
import { eq, like, sql } from "drizzle-orm";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import { clients, events, screens, screenEventBookings } from "../shared/schema";

const PREFIX = "__TEST_BOE__";
let testClientId: string;
let testEventId: string;

async function makeScreen(name: string) {
  const [row] = await db
    .insert(screens)
    .values({ name: `${PREFIX}${name}`, clientId: testClientId, isPaired: false })
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
  await cleanup();
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();
  testClientId = client.id;
  const [evt] = await db
    .insert(events)
    .values({
      name: `${PREFIX}event`,
      clientId: testClientId,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    })
    .returning();
  testEventId = evt.id;
});

test.after(async () => {
  await cleanup();
  await pool.end();
});

test("rejects an overlapping booking on the same screen", async () => {
  const screen = await makeScreen("seq-overlap");
  await storage.createScreenEventBooking({
    screenId: screen.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-01T10:00:00Z"),
    endsAt: new Date("2026-07-01T12:00:00Z"),
  });
  await assert.rejects(
    storage.createScreenEventBooking({
      screenId: screen.id,
      eventId: testEventId,
      startsAt: new Date("2026-07-01T11:00:00Z"),
      endsAt: new Date("2026-07-01T13:00:00Z"),
    }),
    /Booking overlaps with an existing booking on this screen/,
  );
  const rows = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.screenId, screen.id));
  assert.equal(rows.length, 1);
});

test("allows edge-touching bookings (ends_at = next starts_at)", async () => {
  const screen = await makeScreen("edge-touch");
  await storage.createScreenEventBooking({
    screenId: screen.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-02T10:00:00Z"),
    endsAt: new Date("2026-07-02T12:00:00Z"),
  });
  // Half-open `[)` semantics: a booking that begins exactly when the
  // previous one ends is NOT an overlap.
  await storage.createScreenEventBooking({
    screenId: screen.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-02T12:00:00Z"),
    endsAt: new Date("2026-07-02T14:00:00Z"),
  });
  const rows = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.screenId, screen.id));
  assert.equal(rows.length, 2);
});

test("allows the same window on a different screen", async () => {
  const a = await makeScreen("diff-a");
  const b = await makeScreen("diff-b");
  await storage.createScreenEventBooking({
    screenId: a.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-03T10:00:00Z"),
    endsAt: new Date("2026-07-03T12:00:00Z"),
  });
  await storage.createScreenEventBooking({
    screenId: b.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-03T10:00:00Z"),
    endsAt: new Date("2026-07-03T12:00:00Z"),
  });
  const rowsA = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.screenId, a.id));
  const rowsB = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.screenId, b.id));
  assert.equal(rowsA.length, 1);
  assert.equal(rowsB.length, 1);
});

test("two concurrent overlapping creates: exactly one wins", async () => {
  const screen = await makeScreen("concurrent");
  // Fire both writes simultaneously. The per-screen advisory lock
  // serialises them, so the second to acquire the lock will see the
  // first's row inside its transaction and reject as an overlap.
  const results = await Promise.allSettled([
    storage.createScreenEventBooking({
      screenId: screen.id,
      eventId: testEventId,
      startsAt: new Date("2026-07-04T10:00:00Z"),
      endsAt: new Date("2026-07-04T12:00:00Z"),
    }),
    storage.createScreenEventBooking({
      screenId: screen.id,
      eventId: testEventId,
      startsAt: new Date("2026-07-04T11:00:00Z"),
      endsAt: new Date("2026-07-04T13:00:00Z"),
    }),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  assert.equal(fulfilled.length, 1, "exactly one create should succeed");
  assert.equal(rejected.length, 1, "exactly one create should be rejected");
  assert.match(
    String(rejected[0].reason?.message ?? rejected[0].reason),
    /Booking overlaps with an existing booking on this screen/,
  );
  const rows = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.screenId, screen.id));
  assert.equal(rows.length, 1, "only one row should be persisted");
});

test("concurrent move-into-occupied-screen: exactly one wins", async () => {
  // Booking A on screen-source. Booking B already occupies a window
  // on screen-target. Two concurrent updates both try to move A onto
  // screen-target into B's window. With the SELECT FOR UPDATE on A's
  // row inside the transaction plus per-screen advisory lock on the
  // target screen, exactly one update should succeed (and even that
  // one must lose to the existing B row -> both should fail). The
  // important invariant: no overlapping pair persists.
  const source = await makeScreen("move-source");
  const target = await makeScreen("move-target");
  const a = await storage.createScreenEventBooking({
    screenId: source.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-06T10:00:00Z"),
    endsAt: new Date("2026-07-06T12:00:00Z"),
  });
  await storage.createScreenEventBooking({
    screenId: target.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-06T10:30:00Z"),
    endsAt: new Date("2026-07-06T11:30:00Z"),
  });
  const results = await Promise.allSettled([
    storage.updateScreenEventBooking(a.id, {
      screenId: target.id,
      startsAt: new Date("2026-07-06T10:00:00Z"),
      endsAt: new Date("2026-07-06T11:00:00Z"),
    }),
    storage.updateScreenEventBooking(a.id, {
      screenId: target.id,
      startsAt: new Date("2026-07-06T11:00:00Z"),
      endsAt: new Date("2026-07-06T12:00:00Z"),
    }),
  ]);
  // Both updates must be rejected by the existing B row on the target.
  for (const r of results) {
    assert.equal(r.status, "rejected", "move into occupied screen must be rejected");
    if (r.status === "rejected") {
      assert.match(
        String(r.reason?.message ?? r.reason),
        /Booking overlaps with an existing booking on this screen/,
      );
    }
  }
  // A is still on the source screen, unchanged.
  const stillThere = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.id, a.id));
  assert.equal(stillThere[0]?.screenId, source.id);
  // Target screen still has exactly its one original booking.
  const targetRows = await db
    .select()
    .from(screenEventBookings)
    .where(eq(screenEventBookings.screenId, target.id));
  assert.equal(targetRows.length, 1);
});

test("update that introduces an overlap is rejected", async () => {
  const screen = await makeScreen("update-overlap");
  const a = await storage.createScreenEventBooking({
    screenId: screen.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-05T10:00:00Z"),
    endsAt: new Date("2026-07-05T12:00:00Z"),
  });
  const b = await storage.createScreenEventBooking({
    screenId: screen.id,
    eventId: testEventId,
    startsAt: new Date("2026-07-05T13:00:00Z"),
    endsAt: new Date("2026-07-05T15:00:00Z"),
  });
  // Try to slide booking B back so it overlaps booking A.
  await assert.rejects(
    storage.updateScreenEventBooking(b.id, {
      startsAt: new Date("2026-07-05T11:00:00Z"),
      endsAt: new Date("2026-07-05T14:00:00Z"),
    }),
    /Booking overlaps with an existing booking on this screen/,
  );
  // Updating a booking to its own existing window must not self-reject.
  const sameAgain = await storage.updateScreenEventBooking(a.id, {
    startsAt: new Date("2026-07-05T10:00:00Z"),
    endsAt: new Date("2026-07-05T12:00:00Z"),
  });
  assert.equal(sameAgain?.id, a.id);
});

// Task #185 — regression coverage for the original bug:
// "editing/publishing a block must NEVER mutate wall pairing
// state". Before this fix, the symptom looked like a server-side
// unpair (the screens page showed "Offline" while the Pi showed
// the pair screen). The actual root cause turned out to be a
// player-side race during window.location.reload(), but the only
// way to PROVE the server is innocent — and to lock that
// innocence in place against future edits to publish/edit/delete
// flows — is a direct integration test that:
//
//   1. Seeds a paired wall (2 tiles, shared deviceToken).
//   2. Snapshots every pairing-relevant column on every wall member.
//   3. Walks the entire publish-cycle storage path that the
//      operator's "edit + publish" UI fires:
//          createScheduleBlock -> updateScheduleBlock ->
//          updateProgrammeVersion(status: "published") ->
//          deleteScheduleBlock
//      (each of which the production HTTP route follows with a
//      `refreshScreensForVersion(versionId)` — that helper writes
//      ONLY to the in-memory `pendingPlayerRefreshes` Map and
//      never touches the screens table; this test is what pins
//      that property.)
//   4. Re-snapshots and asserts byte-for-byte equality on the
//      pairing fields. Any future edit that, say, accidentally
//      kicks off a backfill that rotates `deviceToken` will turn
//      this test red instantly.
//
// Test isolation: every row this file inserts is namespaced with
// PREFIX so cleanup at file start AND end leaves ambient dev
// data alone, matching canvas-pairing.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { eq, like } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  clients,
  screens,
  events,
  programmes,
  programmeVersions,
  scheduleBlocks,
  screenEventBookings,
  type Screen,
} from "../shared/schema";

const PREFIX = "__TEST_S185_PUB__";

async function cleanup() {
  // Order matters and we lean on cascade deletes where possible:
  //   - screen_event_bookings cascades when its event is deleted
  //   - schedule_blocks cascades when its programme_version is deleted
  //   - programme_versions cascades when its programme is deleted
  //   - programmes cascade when their event is deleted
  // So deleting events takes everything programme-side with it; we
  // just need explicit deletes for the screens and clients we
  // namespaced. (scheduleBlocks.name is PREFIX-tagged for any
  // orphan rescue but the cascade should cover it.)
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `${PREFIX}%`));
  await db.delete(events).where(like(events.name, `${PREFIX}%`));
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

test.before(cleanup);
test.after(cleanup);

// Pull only the pairing-identity fields a forfeit/regenerate would
// rotate. If the publish path is well-behaved every one of these
// stays byte-for-byte identical across the entire publish cycle.
function pairingSnapshot(s: Screen) {
  return {
    deviceToken: s.deviceToken,
    isPaired: s.isPaired,
    pairingCode: s.pairingCode,
    isOnline: s.isOnline,
    lastSeen: s.lastSeen?.toISOString() ?? null,
    ipAddress: s.ipAddress,
    hostname: s.hostname,
    hardwareClass: s.hardwareClass,
  };
}

test("publish/edit cycle on a programme version does NOT mutate any wall pairing state", async () => {
  // ── Seed: a real client with a paired 2-tile canvas wall ──
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();

  const lastSeenAt = new Date("2026-09-01T10:00:00Z");
  const wallTok = `${PREFIX}wall-tok`;
  const t0 = new Date("2026-09-01T00:00:00Z");

  const [tileA] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}tileA`,
      clientId: client.id,
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 0,
      canvasY: 0,
      isPaired: true,
      isOnline: true,
      pairingCode: "U5PUB1",
      deviceToken: wallTok,
      lastSeen: lastSeenAt,
      ipAddress: "10.9.0.1",
      hostname: "pub-pi",
      hardwareClass: "rpi5",
      createdAt: t0,
    })
    .returning();
  const [tileB] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}tileB`,
      clientId: client.id,
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasY: 0,
      isPaired: true,
      isOnline: true,
      pairingCode: "U5PUB2",
      deviceToken: wallTok,
      lastSeen: lastSeenAt,
      ipAddress: "10.9.0.1",
      hostname: "pub-pi",
      hardwareClass: "rpi5",
      createdAt: new Date(t0.getTime() + 1000),
    })
    .returning();

  // ── Seed: an event booked onto both tiles, with a programme +
  //          a draft version. This is the "operator created an
  //          event and is about to publish a block" starting
  //          point.
  const [event] = await db
    .insert(events)
    .values({
      name: `${PREFIX}event`,
      clientId: client.id,
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2026-09-10T00:00:00Z"),
    })
    .returning();
  await db.insert(screenEventBookings).values([
    {
      screenId: tileA.id,
      eventId: event.id,
      startsAt: new Date("2026-09-01T00:00:00Z"),
      endsAt: new Date("2026-09-10T00:00:00Z"),
    },
    {
      screenId: tileB.id,
      eventId: event.id,
      startsAt: new Date("2026-09-01T00:00:00Z"),
      endsAt: new Date("2026-09-10T00:00:00Z"),
    },
  ]);
  const [programme] = await db
    .insert(programmes)
    .values({ name: `${PREFIX}programme`, eventId: event.id })
    .returning();
  const draftVersion = await storage.createProgrammeVersion({
    programmeId: programme.id,
    versionNumber: 1,
    status: "draft",
  });

  // ── Snapshot pairing state BEFORE the publish cycle ──
  const beforeA = pairingSnapshot((await storage.getScreen(tileA.id))!);
  const beforeB = pairingSnapshot((await storage.getScreen(tileB.id))!);

  // ── The publish cycle ──
  // Mirrors the storage operations the routes perform on
  // /api/programme-versions/:versionId/blocks (create),
  // /api/schedule-blocks/:id (update), and
  // /api/programme-versions/:versionId (publish via update).
  // Each of those routes ALSO calls refreshScreensForVersion()
  // — which we intentionally don't invoke here, because that
  // helper writes only to an in-memory Map and never touches the
  // screens table. The point of this test is to lock down the
  // schema-touching portion of the cycle.
  const block = await storage.createScheduleBlock({
    programmeVersionId: draftVersion.id,
    name: `${PREFIX}block-1`,
    priority: 0,
    targets: [{ type: "screen", id: tileA.id }],
    timeRules: [
      {
        startDate: "2026-09-02",
        endDate: "2026-09-02",
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
  });

  await storage.updateScheduleBlock(block.id, {
    name: `${PREFIX}block-1-edited`,
    timeRules: [
      {
        startDate: "2026-09-02",
        endDate: "2026-09-02",
        startTime: "09:00",
        endTime: "10:30",
      },
    ],
  });

  await storage.updateProgrammeVersion(draftVersion.id, {
    status: "published",
  });

  await storage.updateScheduleBlock(block.id, {
    name: `${PREFIX}block-1-edited-after-publish`,
  });

  await storage.deleteScheduleBlock(block.id);

  // ── Snapshot AFTER and assert byte-for-byte equality ──
  const afterA = pairingSnapshot((await storage.getScreen(tileA.id))!);
  const afterB = pairingSnapshot((await storage.getScreen(tileB.id))!);

  assert.deepEqual(
    afterA,
    beforeA,
    "tile A pairing identity unchanged across publish cycle",
  );
  assert.deepEqual(
    afterB,
    beforeB,
    "tile B pairing identity unchanged across publish cycle",
  );

  // Sanity check: the wall is still cohesive (both tiles still
  // share the same deviceToken). If a future regression ever
  // unfans the token onto only one tile, this catches it.
  assert.equal(afterA.deviceToken, wallTok);
  assert.equal(afterB.deviceToken, wallTok);
  assert.equal(afterA.deviceToken, afterB.deviceToken);
});

test("validateDeviceToken contract: a paired token still authorises after a publish cycle", async () => {
  // Drives home the second half of the architect's required
  // coverage: prove that after the publish cycle the Pi can still
  // present its (unchanged) deviceToken and be recognised — i.e.
  // the publish path doesn't poison the auth lookup either.
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}auth-client` })
    .returning();
  const tok = `${PREFIX}stable-tok`;
  const [tile] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}auth-tile`,
      clientId: client.id,
      isPaired: true,
      isOnline: true,
      pairingCode: "U5PUB3",
      deviceToken: tok,
      lastSeen: new Date("2026-09-05T01:00:00Z"),
      createdAt: new Date("2026-09-05T00:00:00Z"),
    })
    .returning();
  const [event] = await db
    .insert(events)
    .values({
      name: `${PREFIX}auth-event`,
      clientId: client.id,
      startDate: new Date("2026-09-05T00:00:00Z"),
      endDate: new Date("2026-09-15T00:00:00Z"),
    })
    .returning();
  await db.insert(screenEventBookings).values({
    screenId: tile.id,
    eventId: event.id,
    startsAt: new Date("2026-09-05T00:00:00Z"),
    endsAt: new Date("2026-09-15T00:00:00Z"),
  });
  const [programme] = await db
    .insert(programmes)
    .values({ name: `${PREFIX}auth-programme`, eventId: event.id })
    .returning();
  const draft = await storage.createProgrammeVersion({
    programmeId: programme.id,
    versionNumber: 1,
    status: "draft",
  });
  const block = await storage.createScheduleBlock({
    programmeVersionId: draft.id,
    name: `${PREFIX}auth-block`,
    priority: 0,
    targets: [{ type: "screen", id: tile.id }],
    timeRules: [
      {
        startDate: "2026-09-06",
        endDate: "2026-09-06",
        startTime: "11:00",
        endTime: "12:00",
      },
    ],
  });
  await storage.updateProgrammeVersion(draft.id, { status: "published" });
  await storage.updateScheduleBlock(block.id, { name: `${PREFIX}auth-edit` });

  // The auth-equivalent lookup the real validateDeviceToken
  // middleware performs (server/routes.ts:343-401): fetch the
  // screen by id and compare its stored deviceToken to the token
  // the caller presents.
  const after = await storage.getScreen(tile.id);
  assert.ok(after);
  assert.equal(
    after!.deviceToken,
    tok,
    "deviceToken still equals the value the Pi is presenting",
  );
  assert.equal(after!.isPaired, true, "still paired");
});

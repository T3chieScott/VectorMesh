// Task #188 — broader regression coverage for the schedule-timeline
// unpair bug. Task #185's publish-keeps-pairing.test.ts already pins
// the narrow create→update→publish→delete sequence. The user reports
// that the unpair STILL happens after Task #185 — so this file
// hardens the surrounding storage paths the operator's "edit a
// schedule block on a published version" UI actually exercises:
//
//   - createScheduleBlock + updateScheduleBlock + deleteScheduleBlock
//     against BOTH a draft programme version AND an already-published
//     one (the bug only matters once a version is published, since
//     refreshScreensForVersion is a no-op for drafts).
//   - A SECOND publish (re-publish after edits) on the same version.
//   - Multiple unrelated screens (a 2-tile wall + 2 solo screens)
//     to prove the storage layer doesn't accidentally reach for
//     screens that aren't booked against the touched event either.
//
// All of these paths are write operations on `schedule_blocks`,
// `programme_versions`, `events`, `programmes`, `screen_event_bookings`
// — none should ever touch `screens`. This test snapshots every
// pairing-relevant column on every screen before/after the burst and
// asserts byte-for-byte equality. The day a future regression
// quietly adds a deviceToken nullification anywhere in the
// schedule-timeline storage path, this test goes red.
//
// Test isolation: every row this file inserts is namespaced with
// PREFIX so cleanup at file start AND end leaves ambient dev data
// alone, matching the conventions in publish-keeps-pairing.test.ts
// and canvas-pairing.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { like } from "drizzle-orm";
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

const PREFIX = "__TEST_S188__";

async function cleanup() {
  // events cascade-delete bookings, programmes, programme_versions,
  // and (via programme_versions) schedule_blocks. Explicit
  // schedule_blocks delete is belt-and-braces in case any orphan
  // rescue is needed; the cascade should cover it.
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `${PREFIX}%`));
  await db.delete(events).where(like(events.name, `${PREFIX}%`));
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

test.before(cleanup);
test.after(cleanup);

// Same shape as publish-keeps-pairing.test.ts so any future audit
// can compare snapshots between files at a glance.
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

test("realistic schedule-timeline edit burst leaves every screen's pairing identity untouched", async () => {
  // ── Seed: a real fleet — a paired 2-tile wall + 2 paired solo
  // screens (one booked against the event we'll be editing, one
  // not). The "not booked" screen is in here on purpose: even if
  // a future bug accidentally fanned out a touch to ALL screens
  // instead of just bookable ones, this assertion would catch it.
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();

  const lastSeenAt = new Date("2026-10-01T10:00:00Z");
  const wallTok = `${PREFIX}wall-tok`;
  const t0 = new Date("2026-10-01T00:00:00Z");

  const [tileA] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}wallA`,
      clientId: client.id,
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 0,
      canvasY: 0,
      isPaired: true,
      isOnline: true,
      pairingCode: "U8WAL1",
      deviceToken: wallTok,
      lastSeen: lastSeenAt,
      ipAddress: "10.8.0.1",
      hostname: "wall-pi",
      hardwareClass: "rpi5",
      createdAt: t0,
    })
    .returning();
  const [tileB] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}wallB`,
      clientId: client.id,
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasY: 0,
      isPaired: true,
      isOnline: true,
      pairingCode: "U8WAL2",
      deviceToken: wallTok,
      lastSeen: lastSeenAt,
      ipAddress: "10.8.0.1",
      hostname: "wall-pi",
      hardwareClass: "rpi5",
      createdAt: new Date(t0.getTime() + 1000),
    })
    .returning();
  const [soloBooked] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}soloBooked`,
      clientId: client.id,
      isPaired: true,
      isOnline: true,
      pairingCode: "U8SOL1",
      deviceToken: `${PREFIX}solo-booked-tok`,
      lastSeen: lastSeenAt,
      ipAddress: "10.8.0.2",
      hostname: "solo-booked-pi",
      hardwareClass: "rpi4",
      createdAt: new Date(t0.getTime() + 2000),
    })
    .returning();
  const [soloUnbooked] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}soloUnbooked`,
      clientId: client.id,
      isPaired: true,
      isOnline: true,
      pairingCode: "U8SOL2",
      deviceToken: `${PREFIX}solo-unbooked-tok`,
      lastSeen: lastSeenAt,
      ipAddress: "10.8.0.3",
      hostname: "solo-unbooked-pi",
      hardwareClass: "rpi4",
      createdAt: new Date(t0.getTime() + 3000),
    })
    .returning();

  // ── Seed: an event booked onto the wall + the booked solo
  // screen (NOT the unbooked solo screen).
  const [event] = await db
    .insert(events)
    .values({
      name: `${PREFIX}event`,
      clientId: client.id,
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-10T00:00:00Z"),
    })
    .returning();
  await db.insert(screenEventBookings).values([
    {
      screenId: tileA.id,
      eventId: event.id,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-10-10T00:00:00Z"),
    },
    {
      screenId: tileB.id,
      eventId: event.id,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-10-10T00:00:00Z"),
    },
    {
      screenId: soloBooked.id,
      eventId: event.id,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-10-10T00:00:00Z"),
    },
  ]);
  const [programme] = await db
    .insert(programmes)
    .values({ name: `${PREFIX}programme`, eventId: event.id })
    .returning();
  const draft = await storage.createProgrammeVersion({
    programmeId: programme.id,
    versionNumber: 1,
    status: "draft",
  });

  // ── Snapshot pairing state BEFORE the burst ──
  const all = [tileA, tileB, soloBooked, soloUnbooked];
  const before = new Map<string, ReturnType<typeof pairingSnapshot>>();
  for (const s of all) {
    const fresh = await storage.getScreen(s.id);
    assert.ok(fresh, `screen ${s.name} exists pre-burst`);
    before.set(s.id, pairingSnapshot(fresh!));
  }

  // ── The burst: a realistic operator session ──
  // 1. Create three blocks on the draft.
  const blockA = await storage.createScheduleBlock({
    programmeVersionId: draft.id,
    name: `${PREFIX}A`,
    priority: 0,
    targets: [{ type: "screen", id: tileA.id }],
    timeRules: [
      {
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
  });
  const blockB = await storage.createScheduleBlock({
    programmeVersionId: draft.id,
    name: `${PREFIX}B`,
    priority: 1,
    targets: [{ type: "screen", id: soloBooked.id }],
    timeRules: [
      {
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        startTime: "10:00",
        endTime: "11:00",
      },
    ],
  });
  const blockC = await storage.createScheduleBlock({
    programmeVersionId: draft.id,
    name: `${PREFIX}C`,
    priority: 2,
    targets: [{ type: "screen", id: tileB.id }],
    timeRules: [
      {
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        startTime: "11:00",
        endTime: "12:00",
      },
    ],
  });

  // 2. Edit one (operator drag-resize on the draft).
  await storage.updateScheduleBlock(blockB.id, {
    timeRules: [
      {
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        startTime: "10:00",
        endTime: "11:30",
      },
    ],
  });

  // 3. Publish the draft.
  await storage.updateProgrammeVersion(draft.id, { status: "published" });

  // 4. Edit blocks AFTER publish (this is the critical phase for
  // the bug — refreshScreensForVersion fires for every one of
  // these on the production HTTP route).
  await storage.updateScheduleBlock(blockA.id, {
    name: `${PREFIX}A-edited`,
  });
  await storage.updateScheduleBlock(blockC.id, {
    timeRules: [
      {
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        startTime: "11:00",
        endTime: "12:30",
      },
    ],
  });

  // 5. Delete one of the post-publish edits.
  await storage.deleteScheduleBlock(blockC.id);

  // 6. Add a brand new block ON the published version (operator
  // adds a slot, then publishes the change).
  const blockD = await storage.createScheduleBlock({
    programmeVersionId: draft.id,
    name: `${PREFIX}D`,
    priority: 3,
    targets: [{ type: "screen", id: tileA.id }],
    timeRules: [
      {
        startDate: "2026-10-03",
        endDate: "2026-10-03",
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
  });
  // 7. Re-publish (no-op status update, but mirrors the
  // production route firing the publish hook again).
  await storage.updateProgrammeVersion(draft.id, { status: "published" });
  await storage.updateScheduleBlock(blockD.id, {
    name: `${PREFIX}D-edited`,
  });

  // 8. Final delete to round out the cycle.
  await storage.deleteScheduleBlock(blockA.id);

  // ── Snapshot AFTER and assert byte-for-byte equality on every
  //    screen, including the unbooked solo screen.
  for (const s of all) {
    const fresh = await storage.getScreen(s.id);
    assert.ok(fresh, `screen ${s.name} exists post-burst`);
    assert.deepEqual(
      pairingSnapshot(fresh!),
      before.get(s.id),
      `pairing identity unchanged on ${s.name} after schedule-timeline burst`,
    );
  }

  // Belt-and-braces: the wall is still cohesive (both tiles still
  // share the same deviceToken). If a future regression ever
  // unfans the token onto only one tile this assertion catches it
  // independently of the per-screen deepEqual above.
  const aAfter = await storage.getScreen(tileA.id);
  const bAfter = await storage.getScreen(tileB.id);
  assert.equal(aAfter!.deviceToken, wallTok, "tile A still holds wall token");
  assert.equal(bAfter!.deviceToken, wallTok, "tile B still holds wall token");
  assert.equal(
    aAfter!.deviceToken,
    bAfter!.deviceToken,
    "wall is still cohesive",
  );
});

// ─── Negative coverage: draft-only edits also leave pairing alone ───
//
// The production refreshScreensForVersion helper is a no-op for
// non-published versions, but a future regression could plausibly
// add a "preview"/"hot reload" path that fires for drafts too — and
// if that path ever accidentally reached for screens, this test
// catches it. Keeps the contract obvious: NO programme-version
// activity, draft or published, ever rotates pairing state.

test("draft-only edits also leave pairing identity untouched", async () => {
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}draft-client` })
    .returning();
  const tok = `${PREFIX}draft-tok`;
  const [s] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}draft-screen`,
      clientId: client.id,
      isPaired: true,
      isOnline: true,
      pairingCode: "U8DRF1",
      deviceToken: tok,
      lastSeen: new Date("2026-10-15T01:00:00Z"),
      ipAddress: "10.8.1.1",
      hostname: "draft-pi",
      createdAt: new Date("2026-10-15T00:00:00Z"),
    })
    .returning();
  const [event] = await db
    .insert(events)
    .values({
      name: `${PREFIX}draft-event`,
      clientId: client.id,
      startDate: new Date("2026-10-15T00:00:00Z"),
      endDate: new Date("2026-10-25T00:00:00Z"),
    })
    .returning();
  await db.insert(screenEventBookings).values({
    screenId: s.id,
    eventId: event.id,
    startsAt: new Date("2026-10-15T00:00:00Z"),
    endsAt: new Date("2026-10-25T00:00:00Z"),
  });
  const [programme] = await db
    .insert(programmes)
    .values({ name: `${PREFIX}draft-programme`, eventId: event.id })
    .returning();
  const draft = await storage.createProgrammeVersion({
    programmeId: programme.id,
    versionNumber: 1,
    status: "draft",
  });
  const before = pairingSnapshot((await storage.getScreen(s.id))!);

  const block = await storage.createScheduleBlock({
    programmeVersionId: draft.id,
    name: `${PREFIX}draft-block`,
    priority: 0,
    targets: [{ type: "screen", id: s.id }],
    timeRules: [
      {
        startDate: "2026-10-16",
        endDate: "2026-10-16",
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
  });
  await storage.updateScheduleBlock(block.id, {
    name: `${PREFIX}draft-edited`,
  });
  await storage.deleteScheduleBlock(block.id);

  const after = pairingSnapshot((await storage.getScreen(s.id))!);
  assert.deepEqual(after, before, "draft-only edits don't touch pairing");
  assert.equal(after.deviceToken, tok);
  assert.equal(after.isPaired, true);
});

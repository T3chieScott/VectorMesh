// Task #190 — end-to-end browser regression for the
// "schedule-timeline edits must NEVER unpair a paired player"
// guarantee that Tasks #185/#188 introduced.
//
// Task #188 added the cross-reload grace window (a localStorage
// marker dropped by the player right before window.location.reload(),
// then read back on fresh mount to treat any 401/403 within
// RELOAD_GRACE_MS as a `wait` instead of a strike). Task #188 ships
// with strong unit and storage-level coverage (tests/player-auth-
// strike.test.ts, tests/schedule-timeline-keeps-pairing.test.ts,
// tests/publish-keeps-pairing.test.ts) but until now there was no
// end-to-end browser test that walked the actual operator flow:
// open the player page on a paired screen, drive a burst of real
// schedule edits, and assert the player never falls back to the
// pair / re-pair prompt at the level the user actually sees.
//
// This file fills that gap. The shape is:
//
//   1. Seed a published programme / event / booking / screen
//      directly in the DB (admin email is taken from an existing
//      active admin row).
//   2. Open the /player page in a real browser with the seeded
//      device token preloaded into localStorage so the player
//      boots straight into PlayerContent (not PairingScreen).
//   3. Drive a sequence of schedule-block edits from a SEPARATE
//      authenticated admin browser context — the production
//      `/api/programme-versions/:id/blocks` POST/PATCH/DELETE
//      routes are the exact ones the schedule timeline UI calls
//      (see client/src/pages/schedule.tsx ~lines 1193, 2336,
//      2408 etc.). Each of these routes calls
//      `refreshScreensForVersion`, which queues the player's
//      next /content poll to return `refreshRequested:true` →
//      the player reloads. The cross-reload sequence is exactly
//      the flow the Task #188 grace window protects.
//   4. To deterministically reproduce the original bug in the
//      absence of the fix, the player page intercepts the FIRST
//      TWO /content polls after EACH reload (i.e. inside the
//      grace window) and returns 401. With the Task #188 fix in
//      place those two 401s are absorbed as `wait` (count
//      unchanged) and the player carries on; without the fix
//      each reload exposes a fresh 2-strike window that the two
//      injected 401s exhaust → clearAuth() → "Device Unpaired"
//      surface (and on its "Re-pair Display" click, the actual
//      `pairing-screen` PairingScreen). The test asserts neither
//      of those testids ever appears.
//
// Reverting the fix to verify the test catches it: comment out the
// `inGrace` branch in client/src/pages/player.tsx so every 401
// status takes the normal evaluateAuthHttpStatus path. The test
// will then go red on the very first edit cycle, because two
// intercepted 401s land back-to-back on the freshly-mounted page
// after the reload and clearAuth fires.
//
// Test isolation: every row this file inserts is namespaced with
// PREFIX so cleanup at file start AND end leaves ambient dev
// data alone, matching the convention in publish-keeps-pairing.test.ts
// (ZZ-prefix avoids the `_` SQL wildcard cross-file delete race).

import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, like } from "drizzle-orm";
import {
  screens,
  clients,
  events,
  programmes,
  programmeVersions,
  scheduleBlocks,
  screenEventBookings,
  displayProfiles,
  layoutTemplates,
  type LayoutZone,
  users,
} from "../../shared/schema";

const PREFIX = `ZZTEST190-${Math.random().toString(36).slice(2, 8)}-`;

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: {
    screens,
    clients,
    events,
    programmes,
    programmeVersions,
    scheduleBlocks,
    screenEventBookings,
    displayProfiles,
    users,
  },
});

async function cleanup() {
  // events cascade-delete bookings + programmes + programme_versions
  // (+ schedule_blocks via programme_versions). Explicit
  // schedule_blocks delete is belt-and-braces.
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `ZZTEST190-%`));
  await db.delete(events).where(like(events.name, `ZZTEST190-%`));
  await db.delete(screens).where(like(screens.name, `ZZTEST190-%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `ZZTEST190-%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `ZZTEST190-%`));
  await db.delete(clients).where(like(clients.name, `ZZTEST190-%`));
}

interface Seed {
  publishedVersionId: string;
  draftVersionId: string;
  draftProgrammeId: string;
  layoutId: string;
  screenId: string;
  screenName: string;
  deviceToken: string;
}

async function seed(): Promise<Seed> {
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();

  const [profile] = await db
    .insert(displayProfiles)
    .values({
      clientId: client.id,
      name: `${PREFIX}profile`,
      width: 1920,
      height: 1080,
    })
    .returning();

  const screenName = `${PREFIX}screen`;
  const deviceToken = `${PREFIX}devtok`;
  const [screen] = await db
    .insert(screens)
    .values({
      name: screenName,
      clientId: client.id,
      displayProfileId: profile.id,
      isPaired: true,
      isOnline: true,
      pairingCode: "ZZ9TST",
      deviceToken,
    })
    .returning();

  // Minimal layout — required as a selectable option in the schedule
  // editor's layout dropdown when the admin creates blocks via the UI.
  const [layout] = await db
    .insert(layoutTemplates)
    .values({
      clientId: client.id,
      name: `${PREFIX}layout`,
      aspectRatio: "16:9",
      zones: [
        {
          id: "z1",
          name: "Main",
          type: "media",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ] satisfies LayoutZone[],
    })
    .returning();

  // Event window is wide enough to span "now" so the screen booking
  // resolves to this event for refreshScreensForVersion's
  // getCurrentEventForScreen check.
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [event] = await db
    .insert(events)
    .values({
      name: `${PREFIX}event`,
      clientId: client.id,
      startDate: start,
      endDate: end,
    })
    .returning();
  await db.insert(screenEventBookings).values({
    screenId: screen.id,
    eventId: event.id,
    startsAt: start,
    endsAt: end,
  });

  const [programme] = await db
    .insert(programmes)
    .values({ name: `${PREFIX}programme`, eventId: event.id })
    .returning();
  // Published version is required for refreshScreensForVersion to
  // actually queue a refresh — it short-circuits on drafts.
  const [publishedVersion] = await db
    .insert(programmeVersions)
    .values({
      programmeId: programme.id,
      versionNumber: 1,
      status: "published",
      publishedAt: new Date(),
    })
    .returning();

  // Separate programme + draft version for the UI publish flow
  // (button-publish-from-toast only renders when the active
  // version is a draft — see client/src/pages/schedule.tsx ~L1291).
  // Putting the draft on its own programme keeps the published
  // version untouched so the rest of the cycles still target it.
  const [draftProgramme] = await db
    .insert(programmes)
    .values({ name: `${PREFIX}programme-draft`, eventId: event.id })
    .returning();
  const [draftVersion] = await db
    .insert(programmeVersions)
    .values({
      programmeId: draftProgramme.id,
      versionNumber: 1,
      status: "draft",
    })
    .returning();

  return {
    publishedVersionId: publishedVersion.id,
    draftVersionId: draftVersion.id,
    draftProgrammeId: draftProgramme.id,
    layoutId: layout.id,
    screenId: screen.id,
    screenName,
    deviceToken,
  };
}

async function pickAdminEmail(): Promise<string> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`)
    .limit(1);
  if (rows.length === 0) {
    throw new Error(
      "Task #190 e2e: no active admin user found in DB; seed one before running.",
    );
  }
  return rows[0].email;
}

test.describe("Task #190: player stays paired through real schedule edits", () => {
  let adminEmail = "";
  let s: Seed;

  test.beforeAll(async () => {
    await cleanup();
    adminEmail = await pickAdminEmail();
    s = await seed();
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("schedule create/edit/delete bursts with reload-race 401s never unpair the player", async ({
    browser,
  }) => {
    // Multiple edit cycles × (~15s to observe reload + 16s grace wait)
    // plus setup overhead easily exceeds the default 30s test budget.
    test.setTimeout(240_000);
    // ── Admin context: drives schedule-block edits via the same
    //    HTTP routes the schedule timeline UI uses internally.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const loginRes = await adminPage.request.post("/api/auth/test-login", {
      data: { email: adminEmail },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginRes.status(), `test-login failed: ${await loginRes.text()}`).toBe(
      200,
    );

    // ── Player context: independent cookie jar so the admin
    //    session can't accidentally satisfy any auth check the
    //    player page makes.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    // Surface page-side console output to the Playwright reporter
    // so failures inside the long waits are diagnosable from CI logs.
    playerPage.on("console", (msg) => {
      const t = msg.text();
      if (
        t.includes("[player]") ||
        t.includes("auth") ||
        t.includes("refresh") ||
        msg.type() === "error"
      ) {
        // eslint-disable-next-line no-console
        console.log(`[player-page:${msg.type()}] ${t}`);
      }
    });
    playerPage.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log(`[player-page:pageerror] ${err.message}`);
    });

    // Seed the device-token + screen id into localStorage BEFORE
    // navigation so the player boots straight into PlayerContent.
    await playerPage.addInitScript(
      ({ token, screenId }: { token: string; screenId: string }) => {
        try {
          localStorage.setItem("signage_device_token", token);
          localStorage.setItem("signage_screen_id", screenId);
        } catch {}
      },
      { token: s.deviceToken, screenId: s.screenId },
    );

    // Per-mount poll counter. Resets on every main-frame
    // navigation (initial goto AND every window.location.reload()
    // triggered by refreshRequested:true).
    let navCount = 0;
    let pollsThisLoad = 0;
    playerPage.on("framenavigated", (frame) => {
      if (frame === playerPage.mainFrame()) {
        navCount++;
        pollsThisLoad = 0;
      }
    });

    // The reproduction: AFTER the first reload, return 401 on the
    // next two /content polls (they land inside the Task #188
    // RELOAD_GRACE_MS window). On the initial fresh mount we let
    // polls pass through so the player can authenticate and boot
    // normally — the bug we're regression-testing only manifests
    // across reloads.
    await playerPage.route(
      `**/api/player/${s.screenId}/content`,
      async (route) => {
        pollsThisLoad++;
        if (navCount >= 2 && pollsThisLoad <= 2) {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "simulated reload-race auth blip (Task #190 e2e)",
            }),
          });
          return;
        }
        await route.continue();
      },
    );

    // The player page registers a Service Worker and starts a 7s
    // poll loop on mount — the `load` event can take a while to
    // settle on a slow CI box. `domcontentloaded` is sufficient
    // because everything we assert on (testids, localStorage)
    // depends only on React having mounted, not on every poll
    // having completed.
    await playerPage.goto("/player", { waitUntil: "domcontentloaded" });

    // Initial mount: the player should NOT show the pair / re-pair
    // surface even before any /content poll completes. (PlayerContent
    // mounts immediately because localStorage has a token; the
    // initial render is the "Connecting to VectorMesh..." spinner
    // until the first poll returns.)
    const assertStillPaired = async (label: string) => {
      // Both surfaces are gated behind clearAuth() / setAuthError —
      // either appearing means the regression has fired.
      await expect(
        playerPage.getByTestId("pairing-screen"),
        `${label}: pairing-screen must not be visible`,
      ).toHaveCount(0);
      await expect(
        playerPage.getByTestId("re-pair-button"),
        `${label}: Device Unpaired / re-pair surface must not be visible`,
      ).toHaveCount(0);
      // localStorage proves the player still considers itself paired.
      const stillAuthed = await playerPage.evaluate(() => {
        return (
          !!localStorage.getItem("signage_device_token") &&
          !!localStorage.getItem("signage_screen_id")
        );
      });
      expect(stillAuthed, `${label}: localStorage auth must still be present`).toBe(
        true,
      );
    };

    await assertStillPaired("initial mount");

    // Helper: trigger one schedule edit, wait for the player to
    // reload (refreshRequested:true → window.location.reload()),
    // then wait for the post-reload grace window's intercepted
    // 401 polls to land, then assert the player survived.
    //
    // The player polls /content every 7s; we wait up to 20s for
    // the reload, then 18s for the two intercepted 401 polls to
    // come and go on the fresh page (1st immediate on mount, 2nd
    // ~7s later) plus a buffer for the third poll that will
    // confirm 200 and reset the strike counter.
    const driveEditAndWaitForRecovery = async (
      label: string,
      doEdit: () => Promise<void>,
    ) => {
      const navBefore = navCount;
      await doEdit();
      // Wait for our framenavigated counter to tick (reload fires
      // on player's next /content poll, which is at most ~7s after
      // refreshScreensForVersion queues the refresh server-side).
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && navCount <= navBefore) {
        await playerPage.waitForTimeout(250);
      }
      expect(
        navCount,
        `${label}: player did not reload after schedule edit (navCount=${navCount}, navBefore=${navBefore})`,
      ).toBeGreaterThan(navBefore);

      // Let the two intercepted 401 polls land inside the grace
      // window (immediate + 7s) and the third (passthrough) poll
      // confirm the player is still healthy.
      await playerPage.waitForTimeout(18_000);
      await assertStillPaired(label);
    };

    // ── Burst of schedule edits, each one signals
    //    refreshRequested:true on the player's next /content
    //    response → reload → intercepted 401 polls inside the
    //    grace window.
    //
    // We exercise BOTH the schedule-timeline UI (real operator
    // interactions: navigate /schedule, open the add-block dialog,
    // type a name, save; later: switch programme, save, publish via
    // toast) AND a few direct API mutations that mirror what the
    // same UI shapes hit under the hood (PATCH rename, second-block
    // create, DELETE). The API cycles cover edit shapes that don't
    // have a one-click affordance in the timeline but still need to
    // round-trip through refreshScreensForVersion.

    // ── UI Phase A: drive a real create-block through the
    //    schedule-timeline page on the already-published version.
    //    The schedule page auto-selects the published version on
    //    mount, so we only need to land on /schedule and click
    //    button-add-block.
    await driveEditAndWaitForRecovery("UI: create block in published version", async () => {
      await adminPage.goto("/schedule", { waitUntil: "domcontentloaded" });
      // Wait for the version picker to settle on the published
      // version (auto-select effect at schedule.tsx ~L2123).
      await expect(adminPage.getByTestId("button-add-block")).toBeEnabled({
        timeout: 15_000,
      });
      await adminPage.getByTestId("button-add-block").click();
      const nameInput = adminPage.getByTestId("input-block-name");
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(`${PREFIX}ui-block-A`);
      await adminPage.getByTestId("button-save-block").click();
      // Dialog closes on success; if the mutation errors, the
      // dialog stays open and this expect surfaces a clear failure.
      await expect(adminPage.getByTestId("input-block-name")).toHaveCount(0, {
        timeout: 15_000,
      });
    });

    // ── UI Phase B: switch the schedule page to the DRAFT
    //    programme, create a block, then click button-publish-from-toast
    //    to fire the real publish flow. publishing transitions the
    //    draft → published which calls refreshScreensForVersion and
    //    must keep the player paired across the resulting reload.
    await driveEditAndWaitForRecovery("UI: create + publish from draft", async () => {
      // The Phase A run already landed the admin on /schedule, but
      // re-navigate defensively so this phase is independent.
      await adminPage.goto("/schedule", { waitUntil: "domcontentloaded" });
      // Wait for the version dropdown to be populated before
      // opening it (Radix Select needs the trigger enabled).
      const versionSelect = adminPage.getByTestId("select-programme-version");
      await expect(versionSelect).toBeEnabled({ timeout: 15_000 });
      await versionSelect.click();
      // Each version row renders as "<programme> (v1) - draft".
      // Our seeded draft programme name is unique (PREFIX-).
      await adminPage
        .getByRole("option", { name: new RegExp(`${PREFIX}programme-draft.*draft`) })
        .click();
      await expect(adminPage.getByTestId("button-add-block")).toBeEnabled({
        timeout: 15_000,
      });
      await adminPage.getByTestId("button-add-block").click();
      const nameInput = adminPage.getByTestId("input-block-name");
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(`${PREFIX}ui-block-B`);
      await adminPage.getByTestId("button-save-block").click();
      await expect(adminPage.getByTestId("input-block-name")).toHaveCount(0, {
        timeout: 15_000,
      });
      // The post-save toast offers a one-click publish for drafts.
      const publishBtn = adminPage.getByTestId("button-publish-from-toast");
      await expect(publishBtn).toBeVisible({ timeout: 10_000 });
      await publishBtn.click();
      // Toast dismisses once the publish mutation resolves.
      await expect(publishBtn).toHaveCount(0, { timeout: 15_000 });
    });

    // The remaining cycles cover the API shapes (PATCH rename,
    // second-block create, DELETE x2) that real operator edits also
    // hit but that don't have a single-click affordance to drive
    // via the timeline UI without dragging on the canvas.

    // Edit #1: create a block. POST mirrors
    // client/src/pages/schedule.tsx createBlockMutation.
    let block1Id = "";
    await driveEditAndWaitForRecovery("create block", async () => {
      const r = await adminPage.request.post(
        `/api/programme-versions/${s.publishedVersionId}/blocks`,
        {
          data: {
            name: `${PREFIX}block-1`,
            priority: 0,
            targets: [{ type: "screen", id: s.screenId }],
            timeRules: [
              {
                startDate: "2099-01-01",
                endDate: "2099-01-01",
                startTime: "09:00",
                endTime: "10:00",
              },
            ],
          },
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(r.status(), `create block: ${await r.text()}`).toBe(201);
      const body = await r.json();
      block1Id = body.id;
    });

    // Edit #2: update the block. PATCH mirrors the schedule UI's
    // updateBlockMutation (drag-resize / inline rename).
    await driveEditAndWaitForRecovery("update block", async () => {
      const r = await adminPage.request.patch(
        `/api/schedule-blocks/${block1Id}`,
        {
          data: { name: `${PREFIX}block-1-edited` },
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(r.status(), `update block: ${await r.text()}`).toBe(200);
    });

    // Edit #3: create another block (operator adding a slot to the
    // already-published version).
    let block2Id = "";
    await driveEditAndWaitForRecovery("create second block", async () => {
      const r = await adminPage.request.post(
        `/api/programme-versions/${s.publishedVersionId}/blocks`,
        {
          data: {
            name: `${PREFIX}block-2`,
            priority: 1,
            targets: [{ type: "screen", id: s.screenId }],
            timeRules: [
              {
                startDate: "2099-01-02",
                endDate: "2099-01-02",
                startTime: "11:00",
                endTime: "12:00",
              },
            ],
          },
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(r.status(), `create second block: ${await r.text()}`).toBe(201);
      const body = await r.json();
      block2Id = body.id;
    });

    // Edit #4: delete the first block. DELETE mirrors the schedule
    // UI's deleteBlockMutation.
    await driveEditAndWaitForRecovery("delete first block", async () => {
      const r = await adminPage.request.delete(
        `/api/schedule-blocks/${block1Id}`,
      );
      expect(r.status(), `delete first block: status=${r.status()}`).toBe(204);
    });

    // Edit #5: delete the second block. Round out the cycle.
    await driveEditAndWaitForRecovery("delete second block", async () => {
      const r = await adminPage.request.delete(
        `/api/schedule-blocks/${block2Id}`,
      );
      expect(r.status(), `delete second block: status=${r.status()}`).toBe(204);
    });

    // ── Final DB-level assertion: the screen's deviceToken column
    //    is still exactly what we seeded — proving no server-side
    //    code path quietly rotated it during the burst.
    const finalRows = await db
      .select({
        deviceToken: screens.deviceToken,
        isPaired: screens.isPaired,
      })
      .from(screens)
      .where(sql`${screens.id} = ${s.screenId}`);
    expect(finalRows[0].deviceToken, "deviceToken survived burst").toBe(
      s.deviceToken,
    );
    expect(finalRows[0].isPaired, "isPaired survived burst").toBe(true);

    await playerCtx.close();
    await adminCtx.close();
  });
});

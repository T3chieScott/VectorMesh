import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { inArray, like } from "drizzle-orm";
import {
  agendaItems,
  agendaWidgetConfigs,
  auditLogs,
  clients,
  users,
} from "../../shared/schema";

// Task #211 — Playwright E2E for the public agenda display page.
//
// Seeds a config + two agenda items directly via the DB, opens the
// chromeless /display/agenda/:configId page, asserts both items render,
// then mutates one item's title in the DB and waits for the page's own
// polling loop to pick the change up (proves the refresh cycle works
// end-to-end against the live HTTP route).
//
// Prereqs (same as Task #182 spec): dev server on localhost:5000 with
// ENABLE_TEST_AUTH_BYPASS=1 and DATABASE_URL pointing at the dev DB.

const PREFIX = `__TEST_T211_E2E_${Math.random().toString(36).slice(2, 8)}__`;
const ADMIN_EMAIL = `${PREFIX.toLowerCase()}admin@example.test`;
const USER_PREFIX = PREFIX.toLowerCase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { agendaItems, agendaWidgetConfigs, auditLogs, clients, users },
});

async function cleanup() {
  const ownedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${USER_PREFIX}%`));
  if (ownedUsers.length) {
    await db.delete(auditLogs).where(
      inArray(auditLogs.userId, ownedUsers.map((row) => row.id)),
    );
  }
  // Drop our seeded config, items, and isolated client.
  await db.delete(agendaItems).where(like(agendaItems.title, `${PREFIX}%`));
  await db
    .delete(agendaWidgetConfigs)
    .where(like(agendaWidgetConfigs.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%`));
}

async function loginAsTestUser(page: Page, email: string) {
  // Route through page.request so the session cookie lands in the page's
  // own context, authenticating subsequent page.request mutations.
  const res = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `test-login failed: ${await res.text()}`).toBe(200);
}

test.describe("Task #211: /display/agenda/:configId end-to-end", () => {
  let clientId = "";
  let configId = "";
  let itemBeforeId = "";
  let itemNowId = "";
  let adminEmail = "";
  let overflowClientId = "";
  let overflowConfigId = "";
  let overflowCardId = "";
  let overflowNextId = "";

  test.beforeAll(async () => {
    await cleanup();
    const [admin] = await db.insert(users).values({
      email: ADMIN_EMAIL,
      firstName: "Display Agenda",
      lastName: "Acceptance",
      role: "admin",
      isActive: true,
      mustChangePassword: false,
      passwordHash: `${PREFIX}test-only-password-hash`,
      twoFactorEnabled: true,
      twoFactorSecret: `${PREFIX}test-only-two-factor-secret`,
    }).returning({ email: users.email });
    adminEmail = admin.email!;
    const [client] = await db
      .insert(clients)
      .values({ name: `${PREFIX}client` })
      .returning({ id: clients.id });
    clientId = client.id;
    // Short refresh interval so the test doesn't sit waiting 30s for a
    // poll. The route schema clamps to >= 5s; we use the minimum.
    const [cfg] = await db
      .insert(agendaWidgetConfigs)
      .values({
        clientId,
        name: `${PREFIX}config`,
        displayMode: "full",
        layoutMode: "auto",
        refreshIntervalSeconds: 5,
      })
      .returning({ id: agendaWidgetConfigs.id });
    configId = cfg.id;

    const now = Date.now();
    const [iNow] = await db
      .insert(agendaItems)
      .values({
        clientId,
        title: `${PREFIX}LIVE Keynote`,
        startsAt: new Date(now - 10 * 60_000),
        endsAt: new Date(now + 50 * 60_000),
        status: "in_progress",
        room: "Hall A",
      })
      .returning({ id: agendaItems.id });
    const [iBefore] = await db
      .insert(agendaItems)
      .values({
        clientId,
        title: `${PREFIX}NEXT Workshop`,
        startsAt: new Date(now + 60 * 60_000),
        endsAt: new Date(now + 120 * 60_000),
        status: "scheduled",
        room: "Hall B",
      })
      .returning({ id: agendaItems.id });
    itemNowId = iNow.id;
    itemBeforeId = iBefore.id;

    // A separate, deliberately overflowing card keeps the transition
    // assertion isolated from the polling/rename fixture above.  It lives
    // on its own client so the display API cannot mix the two fixture pools.
    const [overflowClient] = await db
      .insert(clients)
      .values({ name: `${PREFIX}overflow-client` })
      .returning({ id: clients.id });
    overflowClientId = overflowClient.id;
    // The room
    // marker is after the very tall title, so it becomes readable only once
    // the card-level reveal has reached its final scroll position.
    const [overflowConfig] = await db
      .insert(agendaWidgetConfigs)
      .values({
        clientId: overflowClientId,
        name: `${PREFIX}overflow-config`,
        displayMode: "full",
        layoutMode: "landscape",
        titleScale: 2,
        refreshIntervalSeconds: 5,
        rotationIntervalSeconds: 3,
        maxItemsPerPage: 1,
        showSessionCount: false,
        showSessionEndTime: false,
        showRoom: true,
        showTrack: false,
        showCompany: false,
        showPresenter: false,
        showPresenterCompany: false,
        showDescription: false,
        showStatus: false,
      })
      .returning({ id: agendaWidgetConfigs.id });
    overflowConfigId = overflowConfig.id;
    const nowTitle = [
      `${PREFIX}OVERFLOW_CARD_START`,
      "long title content ".repeat(64),
      `${PREFIX}OVERFLOW_CARD_FINAL_TITLE`,
    ].join(" ");
    const [overflowCard] = await db
      .insert(agendaItems)
      .values({
        clientId: overflowClientId,
        title: nowTitle,
        startsAt: new Date(now - 10 * 60_000),
        endsAt: new Date(now + 50 * 60_000),
        status: "in_progress",
        room: `${PREFIX}OVERFLOW_CARD_FINAL_ROOM`,
      })
      .returning({ id: agendaItems.id });
    const [overflowNext] = await db
      .insert(agendaItems)
      .values({
        clientId: overflowClientId,
        title: `${PREFIX}OVERFLOW_NEXT_CARD`,
        startsAt: new Date(now + 60 * 60_000),
        endsAt: new Date(now + 120 * 60_000),
        status: "scheduled",
        room: "Next room",
      })
      .returning({ id: agendaItems.id });
    overflowCardId = overflowCard.id;
    overflowNextId = overflowNext.id;
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("seeded items render and the page picks up DB changes on its next poll", async ({ page }) => {
    // 1) Sanity check: public route returns 200 and our items.
    const apiRes = await page.request.get(`/api/agenda/display/${configId}`);
    expect(apiRes.status(), await apiRes.text()).toBe(200);
    const apiBody = await apiRes.json();
    expect(apiBody.config.id).toBe(configId);
    // Public payload must not leak the owning site id.
    expect(apiBody.config.clientId).toBeUndefined();
    expect(
      apiBody.items.map((i: { id: string }) => i.id).sort(),
    ).toEqual([itemBeforeId, itemNowId].sort());

    // 2) Visit the chromeless display page — no auth required.
    await page.goto(`/display/agenda/${configId}`);

    const root = page.getByTestId("agenda-display-root");
    await expect(root).toBeVisible({ timeout: 15_000 });

    // Both rows should render (display mode "full" shows everything).
    await expect(page.getByTestId(`agenda-row-${itemNowId}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-row-${itemBeforeId}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-title-${itemNowId}`)).toContainText(
      "LIVE Keynote",
    );

    // 3) Rename the item through the authenticated API and wait for the
    //    page's polling loop (5s refresh interval) to pick up the change
    //    without a reload. We go through PATCH /api/agenda/:id rather than a
    //    raw DB write because the public display route caches the computed
    //    payload (Task #290, 30s TTL); only an API write invalidates that
    //    cache, which is the real operator path a poll must reflect.
    await loginAsTestUser(page, adminEmail);
    const newTitle = `${PREFIX}LIVE Keynote RENAMED`;
    const patchRes = await page.request.patch(`/api/agenda/${itemNowId}`, {
      data: { title: newTitle },
      headers: { "Content-Type": "application/json" },
    });
    expect(patchRes.status(), await patchRes.text()).toBe(200);

    await expect(page.getByTestId(`agenda-title-${itemNowId}`)).toContainText(
      "RENAMED",
      { timeout: 20_000 },
    );
  });

  test("standalone rotation waits for the overflowing card reveal before advancing", async ({ page }) => {
    test.setTimeout(100_000);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`/display/agenda/${overflowConfigId}`, { waitUntil: "commit" });

    const root = page.getByTestId("agenda-display-root");
    await expect(root).toBeVisible({ timeout: 20_000 });
    const overflowingCard = page.getByTestId(`agenda-row-${overflowCardId}`);
    const nextCard = page.getByTestId(`agenda-row-${overflowNextId}`);
    await expect(overflowingCard).toBeVisible({ timeout: 20_000 });

    type RevealState = {
      overflowPx: number;
      scrollTop: number;
      maxScrollTop: number;
      finalRoomReadable: boolean;
    };
    const readRevealState = async (): Promise<RevealState | null> =>
      overflowingCard.evaluate((node) => {
        const card = node as HTMLElement;
        const finalRoom = card.querySelector(
          "[data-testid^='agenda-room-']",
        ) as HTMLElement | null;
        const cardRect = card.getBoundingClientRect();
        const roomRect = finalRoom?.getBoundingClientRect();
        const readable =
          Boolean(finalRoom && roomRect) &&
          roomRect!.height > 0 &&
          roomRect!.right > cardRect.left &&
          roomRect!.left < cardRect.right &&
          roomRect!.top >= cardRect.top - 1 &&
          roomRect!.bottom <= cardRect.bottom + 1 &&
          getComputedStyle(finalRoom!).visibility !== "hidden" &&
          getComputedStyle(finalRoom!).display !== "none";
        return {
          overflowPx: Math.max(0, card.scrollHeight - card.clientHeight),
          scrollTop: card.scrollTop,
          maxScrollTop: Math.max(0, card.scrollHeight - card.clientHeight),
          finalRoomReadable: readable,
        };
      }).catch(() => null);

    // Measure the actual overflow first, then derive the observation deadline
    // from production's 3s top pause + 28px/s + 3s bottom pause contract.
    // This is a browser-observed reveal boundary, not a fixed sleep.
    let measuredMaxScrollTop = 0;
    await expect.poll(async () => {
      const state = await readRevealState();
      measuredMaxScrollTop = state?.maxScrollTop ?? 0;
      return measuredMaxScrollTop;
    }, {
      timeout: 20_000,
      intervals: [25, 50, 100, 200],
      message: "standalone fixture must expose a measurable overflowing Agenda card",
    }).toBeGreaterThan(0);
    const productionRevealMs =
      3_000 + Math.ceil(measuredMaxScrollTop / 28 * 1_000) + 3_000;
    const revealObservationTimeoutMs = productionRevealMs + 10_000;

    // Keep sampling until the actual scroll container reaches its final
    // position; disappearance of the overflowing row before that point is
    // the failure under test.
    let sawOverflow = false;
    let sawScrollMovement = false;
    const revealStartedAt = Date.now();
    let revealCompletedAt: number | null = null;
    await expect.poll(async () => {
      const state = await readRevealState();
      if (!state) return "overflow-card-disappeared-before-reveal";
      sawOverflow ||= state.overflowPx > 0;
      sawScrollMovement ||= state.scrollTop > 1;
      if (state.finalRoomReadable && state.maxScrollTop > 0) {
        revealCompletedAt = Date.now();
        return "readable-at-final-scroll-position";
      }
      return "reveal-in-progress";
    }, {
      timeout: revealObservationTimeoutMs,
      intervals: [25, 50, 100, 200],
      message: "standalone Agenda must keep the overflowing card mounted until its final content is readable",
    }).toBe("readable-at-final-scroll-position");

    expect(sawOverflow, "fixture must exercise a real card overflow").toBe(true);
    expect(sawScrollMovement, "card reveal must move the real browser scroll container").toBe(true);
    expect(revealCompletedAt).not.toBeNull();
    const revealElapsed = revealCompletedAt! - revealStartedAt;
    expect(revealElapsed, "reveal boundary must be measured from browser state").toBeGreaterThan(1_000);
    expect(
      revealElapsed,
      "reveal must complete within the measured production reveal budget",
    ).toBeLessThanOrEqual(revealObservationTimeoutMs);

    // The next card may only become visible after the measured final reveal
    // boundary above.  This assertion is deliberately transition-driven,
    // rather than replacing the effective dwell with a sleep.
    const nextVisibleAt = await (async () => {
      await expect(nextCard).toBeVisible({ timeout: 20_000 });
      return Date.now();
    })();
    expect(nextVisibleAt).toBeGreaterThanOrEqual(revealCompletedAt!);
    await expect(nextCard).toContainText("OVERFLOW_NEXT_CARD");
  });
});

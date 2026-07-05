import { test, expect } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like } from "drizzle-orm";
import {
  agendaItems,
  agendaWidgetConfigs,
  clients,
} from "../../shared/schema";

// Task #216 — Playwright E2E for the public agenda display page's
// error branches.
//
// Covers:
//  1) A 404 (unknown / deleted config id) shows the calm "retired"
//     branded message, NOT the generic "HTTP 404" card.
//  2) A transient 5xx after a successful first poll keeps the
//     last-good payload visible instead of wiping the screen.
//
// Prereqs: dev server on localhost:5000 with ENABLE_TEST_AUTH_BYPASS=1
// and DATABASE_URL pointing at the dev DB.

const PREFIX = `__TEST_T216_E2E_${Math.random().toString(36).slice(2, 8)}__`;

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { agendaItems, agendaWidgetConfigs, clients },
});

async function pickClientId(): Promise<string> {
  const rows = await db.select({ id: clients.id }).from(clients).limit(1);
  if (rows.length === 0) {
    throw new Error(
      "No client/site row in DB; seed one before running this E2E test.",
    );
  }
  return rows[0].id;
}

async function cleanup() {
  await db.delete(agendaItems).where(like(agendaItems.title, `${PREFIX}%`));
  await db
    .delete(agendaWidgetConfigs)
    .where(like(agendaWidgetConfigs.name, `${PREFIX}%`));
}

test.describe("Task #216: /display/agenda/:configId error branches", () => {
  test.beforeAll(async () => {
    await cleanup();
  });
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("unknown config id renders the retired/deleted branded message", async ({
    page,
  }) => {
    // A well-formed UUID that definitely does not exist in the DB.
    const missingId = "00000000-0000-4000-8000-000000000216";

    // Sanity-check the route really returns 404 for this id. Give the
    // request a generous timeout: this is the first hit against a freshly
    // (re)started dev server under the full E2E poll load, so the very
    // first response can be slow even though the route itself is fast.
    const apiRes = await page.request.get(`/api/agenda/display/${missingId}`, {
      timeout: 30_000,
    });
    expect(apiRes.status()).toBe(404);

    // `domcontentloaded` (not the default `load`) — under full-suite
    // poll load the `load` event can lag past the nav timeout, and the
    // assertions below only need React to have mounted.
    await page.goto(`/display/agenda/${missingId}`, {
      waitUntil: "domcontentloaded",
    });

    const retired = page.getByTestId("agenda-display-retired");
    await expect(retired).toBeVisible({ timeout: 10_000 });
    await expect(retired).toContainText("This display has been retired");
    // Generic HTTP error card must NOT appear.
    await expect(page.getByTestId("agenda-display-error")).toHaveCount(0);
  });

  test("transient 5xx after a good poll keeps the last-good payload visible", async ({
    page,
  }) => {
    const clientId = await pickClientId();
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
    const configId = cfg.id;

    const now = Date.now();
    const [it] = await db
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

    // Let the first poll succeed and render, then start failing
    // subsequent polls with a 503. The page must keep the last-good
    // payload visible (no error card, no loading state).
    let pollCount = 0;
    await page.route(`**/api/agenda/display/${configId}`, async (route) => {
      pollCount += 1;
      if (pollCount === 1) {
        await route.continue();
      } else {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom" }),
        });
      }
    });

    await page.goto(`/display/agenda/${configId}`, {
      waitUntil: "domcontentloaded",
    });

    // First load succeeded — row is visible.
    await expect(page.getByTestId(`agenda-row-${it.id}`)).toBeVisible({
      timeout: 15_000,
    });

    // Wait long enough for at least one polling cycle to fail (refresh
    // interval is 5s + a buffer).
    await page.waitForTimeout(8_000);

    // We must have seen at least one failing poll by now.
    expect(pollCount).toBeGreaterThanOrEqual(2);

    // Row must still be visible — no error/loading screens.
    await expect(page.getByTestId(`agenda-row-${it.id}`)).toBeVisible();
    await expect(page.getByTestId("agenda-display-error")).toHaveCount(0);
    await expect(page.getByTestId("agenda-display-loading")).toHaveCount(0);
  });
});

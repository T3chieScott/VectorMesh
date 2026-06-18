import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, like } from "drizzle-orm";
import {
  agendaItems,
  agendaWidgetConfigs,
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

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { agendaItems, agendaWidgetConfigs, clients, users },
});

async function pickClientId(): Promise<string> {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .limit(1);
  if (rows.length === 0) {
    throw new Error(
      "No client/site row in DB; seed one before running this E2E test.",
    );
  }
  return rows[0].id;
}

async function cleanup() {
  // Drop our seeded config & items; items also cascade if the client
  // is deleted but we never touch the shared client row.
  await db.delete(agendaItems).where(like(agendaItems.title, `${PREFIX}%`));
  await db
    .delete(agendaWidgetConfigs)
    .where(like(agendaWidgetConfigs.name, `${PREFIX}%`));
}

async function findOrPickAdminEmail(): Promise<string> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`)
    .limit(1);
  if (rows.length === 0) {
    throw new Error(
      "No active admin user found in DB; seed one before running this E2E test.",
    );
  }
  return rows[0].email;
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

  test.beforeAll(async () => {
    await cleanup();
    adminEmail = await findOrPickAdminEmail();
    clientId = await pickClientId();
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
});

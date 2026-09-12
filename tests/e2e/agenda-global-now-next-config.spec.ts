import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like, sql } from "drizzle-orm";
import {
  agendaItems,
  agendaWidgetConfigs,
  clients,
  users,
} from "../../shared/schema";

const MARK = "ZZTEST-GLOBAL-NOW-NEXT-CONFIG-";
const RUN = Math.random().toString(36).slice(2, 9);
const SITE_NAME = `${MARK}${RUN}-site`;
const DISPLAY_NAME = `${MARK}${RUN}-display`;
const ROOM_A = `${MARK}${RUN}-Room-A`;
const ROOM_B = `${MARK}${RUN}-Room-B`;
const ROOM_C = `${MARK}${RUN}-Room-C`;
const OVERLAP_A = `${MARK}${RUN}-Opening keynote`;
const OVERLAP_B = `${MARK}${RUN}-Parallel workshop`;
const ADJACENT = `${MARK}${RUN}-Adjacent follow-up`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { agendaItems, agendaWidgetConfigs, clients, users },
});

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  expect(response.status(), `test-login failed: ${await response.text()}`).toBe(200);
}

async function selectRoom(page: Page, room: string) {
  await page.getByTestId("button-room-filter").click();
  const option = page.getByTestId(`option-room-${room}`);
  await expect(option).toBeVisible();
  await option.click();
  await page.keyboard.press("Escape");
}

test.describe("global NOW/NEXT Agenda configuration", () => {
  let adminEmail = "";
  let clientId = "";

  test.beforeAll(async () => {
    await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${MARK}%`));
    await db.delete(agendaItems).where(like(agendaItems.title, `${MARK}%`));
    await db.delete(clients).where(like(clients.name, `${MARK}%`));

    const admins = await db.select({ email: users.email }).from(users)
      .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`).limit(1);
    expect(admins, "an active admin is required for test auth").toHaveLength(1);
    adminEmail = admins[0].email;

    const inserted = await db.insert(clients).values({
      name: SITE_NAME,
      timezone: "Europe/Amsterdam",
    }).returning({ id: clients.id });
    clientId = inserted[0].id;

    await db.insert(agendaItems).values([
      {
        clientId,
        title: OVERLAP_A,
        room: ROOM_A,
        startsAt: new Date("2031-07-04T10:00:00Z"),
        endsAt: new Date("2031-07-04T11:00:00Z"),
        status: "scheduled",
        sortOrder: 0,
      },
      {
        clientId,
        title: OVERLAP_B,
        room: ROOM_B,
        startsAt: new Date("2031-07-04T10:30:00Z"),
        endsAt: new Date("2031-07-04T11:30:00Z"),
        status: "scheduled",
        sortOrder: 1,
      },
      {
        clientId,
        title: ADJACENT,
        room: ROOM_C,
        startsAt: new Date("2031-07-04T11:00:00Z"),
        endsAt: new Date("2031-07-04T12:00:00Z"),
        status: "scheduled",
        sortOrder: 2,
      },
    ]);
  });

  test.afterAll(async () => {
    try {
      await db.delete(agendaWidgetConfigs).where(eq(agendaWidgetConfigs.clientId, clientId));
      await db.delete(agendaItems).where(eq(agendaItems.clientId, clientId));
      await db.delete(clients).where(eq(clients.id, clientId));
    } finally {
      await pool.end();
    }
  });

  test("rejects overlap immediately, accepts adjacency, and persists the option", async ({ page }) => {
    await login(page, adminEmail);
    await page.addInitScript((id) => {
      localStorage.setItem("vectormesh_selected_client_id", id);
    }, clientId);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/agenda/displays", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("text-agenda-configs-title")).toBeVisible();
    await page.getByTestId("button-create-config").click();
    await expect(page.getByRole("dialog")).toContainText("New Widget Config");
    await page.getByTestId("input-config-name").fill(DISPLAY_NAME);

    await page.getByTestId("select-display-mode").click();
    await page.getByRole("option", { name: "Now / next", exact: true }).click();
    await selectRoom(page, ROOM_A);
    await selectRoom(page, ROOM_B);
    await page.getByTestId("switch-single-global-now-next").click();

    const warning = page.getByTestId("warning-global-now-next-conflict");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(
      "Overlapping sessions cannot be used with “Single Now & Next across selected rooms”.",
    );
    await expect(warning).toContainText(OVERLAP_A);
    await expect(warning).toContainText(ROOM_A);
    await expect(warning).toContainText(OVERLAP_B);
    await expect(warning).toContainText(ROOM_B);
    await expect(page.getByTestId("button-save-config")).toBeDisabled();

    await selectRoom(page, ROOM_B);
    await expect(warning).toBeHidden();
    await expect(page.getByTestId("button-save-config")).toBeEnabled();

    await selectRoom(page, ROOM_C);
    await expect(page.getByTestId("button-room-filter")).toContainText("2 selected");
    await expect(warning).toBeHidden();
    await expect(page.getByTestId("button-save-config")).toBeEnabled();

    await page.getByTestId("button-save-config").click();
    await expect(page.getByText("Config created", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const rows = await db.select({
      id: agendaWidgetConfigs.id,
      singleGlobalNowNext: agendaWidgetConfigs.singleGlobalNowNext,
      roomFilter: agendaWidgetConfigs.roomFilter,
    }).from(agendaWidgetConfigs)
      .where(eq(agendaWidgetConfigs.name, DISPLAY_NAME));
    expect(rows).toHaveLength(1);
    expect(rows[0].singleGlobalNowNext).toBe(true);
    expect(rows[0].roomFilter).toEqual([ROOM_A, ROOM_C]);

    await page.getByTestId(`button-edit-config-${rows[0].id}`).click();
    await expect(page.getByRole("dialog")).toContainText("Edit Widget Config");
    await expect(page.getByTestId("select-display-mode")).toContainText("Now / next");
    await expect(page.getByTestId("button-room-filter")).toContainText("2 selected");
    await expect(page.getByTestId("switch-single-global-now-next")).toHaveAttribute(
      "data-state",
      "checked",
    );
    await expect(warning).toBeHidden();
    await expect(page.getByTestId("button-save-config")).toBeEnabled();
  });
});
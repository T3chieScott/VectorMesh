import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import {
  agendaFolders,
  agendaWidgetConfigs,
  clients,
  users,
} from "../../shared/schema";
import { buildAgendaSettingsClipboardPayload } from "../../shared/agenda-settings-clipboard";

// Task #398 — Agenda Displays folders. This follows the scene-folder E2E
// convention: seed only uniquely named records, synchronize database checks on
// successful UI toasts, and remove both configs and folders on every run.
const PREFIX = "__TEST_T398_AGENDA_E2E_";
const RUN = Math.random().toString(36).slice(2, 8);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { agendaFolders, agendaWidgetConfigs, clients, users },
});

async function cleanup() {
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${PREFIX}%`));
  await db.delete(agendaFolders).where(like(agendaFolders.name, `${PREFIX}%`));
  const remainingConfigs = await db.select({ id: agendaWidgetConfigs.id }).from(agendaWidgetConfigs)
    .where(like(agendaWidgetConfigs.name, `${PREFIX}%`));
  const remainingFolders = await db.select({ id: agendaFolders.id }).from(agendaFolders)
    .where(like(agendaFolders.name, `${PREFIX}%`));
  console.log(`Task #398 cleanup: configs=${remainingConfigs.length}, folders=${remainingFolders.length}`);
  expect(remainingConfigs, "Task #398 config cleanup").toHaveLength(0);
  expect(remainingFolders, "Task #398 folder cleanup").toHaveLength(0);
}

async function loginAsTestUser(page: Page, email: string) {
  const res = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `test-login failed: ${await res.text()}`).toBe(200);
}

async function moveDisplay(
  page: Page,
  configId: string,
  destinationTestId: string,
  expectedToast: string,
) {
  // Radix keeps a closed menu mounted briefly for its exit animation. Waiting
  // for detachment prevents a rapid second click from reopening and then being
  // closed by the previous menu's animation completion.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTestId(`button-move-config-${configId}`).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const destination = page.getByTestId(destinationTestId);
  await expect(destination).toBeVisible();
  await destination.click();
  await expect(page.getByText(expectedToast, { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(menu).toHaveCount(0);
}

test.describe("Task #398: Agenda Displays folders", () => {
  let adminEmail = "";
  let clientId = "";
  let configId = "";
  let baselineUnfiledCount = 0;
  const displayName = `${PREFIX}${RUN}_UnfiledDisplay`;
  const firstFolderName = `${PREFIX}${RUN}_First`;
  const renamedFirstFolderName = `${PREFIX}${RUN}_RenamedFirst`;
  const secondFolderName = `${PREFIX}${RUN}_Second`;

  test.beforeAll(async () => {
    await cleanup();
    const admins = await db.select({ email: users.email }).from(users)
      .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`).limit(1);
    if (!admins[0]) throw new Error("No active admin user found in DB.");
    adminEmail = admins[0].email;
    const site = await db.select({ id: clients.id }).from(clients).limit(1);
    if (!site[0]) throw new Error("No site found in DB.");
    clientId = site[0].id;
    const existingUnfiled = await db
      .select({ id: agendaWidgetConfigs.id })
      .from(agendaWidgetConfigs)
      .where(
        and(
          eq(agendaWidgetConfigs.clientId, clientId),
          isNull(agendaWidgetConfigs.folderId),
        ),
      );
    baselineUnfiledCount = existingUnfiled.length;
    const inserted = await db.insert(agendaWidgetConfigs)
      .values({ clientId, name: displayName })
      .returning({ id: agendaWidgetConfigs.id });
    configId = inserted[0].id;
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("organizes displays safely without altering display identity", async ({ page }) => {
    await loginAsTestUser(page, adminEmail);
    await page.addInitScript((id) => localStorage.setItem("vectormesh_selected_client_id", id), clientId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/agenda/displays");
    await expect(page.getByTestId("text-agenda-configs-title")).toBeVisible();
    await expect(page.getByTestId(`config-card-${configId}`)).toBeVisible();
    await expect(page.getByTestId("button-agenda-folder-unfiled")).toContainText(
      String(baselineUnfiledCount + 1),
    );

    // The settings clipboard is presentation-only; organizational folderId
    // must never become part of the Task #397 settings contract.
    const clipboard = buildAgendaSettingsClipboardPayload({
      name: displayName, folderId: "must-not-copy", displayMode: "full",
    });
    expect(clipboard.settings).not.toHaveProperty("folderId");

    // Create two folders, using the server-success toast as the persistence
    // boundary before locating each newly assigned ID.
    for (const name of [firstFolderName, secondFolderName]) {
      await page.getByTestId("button-create-agenda-folder").click();
      await page.getByTestId("input-agenda-folder-name").fill(name);
      await page.getByRole("button", { name: "Create folder" }).click();
      await expect(page.getByText("Folder created", { exact: true })).toBeVisible({ timeout: 10_000 });
    }
    const folderRows = await db.select({ id: agendaFolders.id, name: agendaFolders.name, clientId: agendaFolders.clientId })
      .from(agendaFolders).where(like(agendaFolders.name, `${PREFIX}${RUN}_%`));
    expect(folderRows).toHaveLength(2);
    expect(folderRows.every((folder) => folder.clientId === clientId)).toBe(true);
    const firstFolderId = folderRows.find((folder) => folder.name === firstFolderName)!.id;
    const secondFolderId = folderRows.find((folder) => folder.name === secondFolderName)!.id;
    await expect(page.getByTestId(`agenda-folder-item-${firstFolderId}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-folder-item-${secondFolderId}`)).toBeVisible();

    // Selected controls have an explicit non-colour state and filtering is
    // preserved while searching.
    await page.getByTestId(`button-agenda-folder-${firstFolderId}`).click();
    await expect(page.getByTestId(`button-agenda-folder-${firstFolderId}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("This folder is empty")).toBeVisible();
    await page.getByTestId("input-agenda-display-search").fill("no-match");
    await expect(page.getByText("No displays match your search")).toBeVisible();
    await page.getByTestId("input-agenda-display-search").fill("");
    await page.getByTestId("button-agenda-folder-all").click();

    // Move from Unfiled to folder one, then to folder two, then back.
    for (const [folderId, folderName] of [
      [firstFolderId, firstFolderName],
      [secondFolderId, secondFolderName],
    ] as const) {
      await moveDisplay(
        page,
        configId,
        `button-move-config-${configId}-${folderId}`,
        `Moved to "${folderName}"`,
      );
      const row = await db.select({ folderId: agendaWidgetConfigs.folderId }).from(agendaWidgetConfigs)
        .where(eq(agendaWidgetConfigs.id, configId));
      expect(row[0].folderId).toBe(folderId);
      await expect(page.getByTestId(`agenda-folder-item-${folderId}`)).toContainText("1");
    }
    await moveDisplay(
      page,
      configId,
      `button-move-config-unfiled-${configId}`,
      "Moved to Unfiled",
    );
    await expect(page.getByTestId("button-agenda-folder-unfiled")).toContainText(
      String(baselineUnfiledCount + 1),
    );

    // All and Unfiled also expose their selected state.
    await page.getByTestId("button-agenda-folder-all").click();
    await expect(page.getByTestId("button-agenda-folder-all")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("button-agenda-folder-unfiled").click();
    await expect(page.getByTestId("button-agenda-folder-unfiled")).toHaveAttribute("aria-pressed", "true");

    // Rename then delete the currently empty first folder.
    await page.getByTestId(`button-agenda-folder-menu-${firstFolderId}`).click();
    await page.getByTestId(`button-rename-agenda-folder-${firstFolderId}`).click();
    await page.getByTestId("input-agenda-folder-name").fill(renamedFirstFolderName);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Folder renamed", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`button-agenda-folder-menu-${firstFolderId}`).click();
    await page.getByTestId(`button-delete-agenda-folder-${firstFolderId}`).click();
    await page.getByTestId("button-confirm-delete-agenda-folder").click();
    await expect(page.getByText("Folder deleted", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Invalid cross-folder IDs are rejected by the API rather than accepted.
    const invalidMove = await page.request.patch(`/api/agenda/configs/${configId}`, {
      data: { folderId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(invalidMove.status()).toBeGreaterThanOrEqual(400);

    // Delete a non-empty folder: FK set-null must preserve identity, name and URL.
    await moveDisplay(
      page,
      configId,
      `button-move-config-${configId}-${secondFolderId}`,
      `Moved to "${secondFolderName}"`,
    );
    await page.getByTestId(`button-agenda-folder-menu-${secondFolderId}`).click();
    await page.getByTestId(`button-delete-agenda-folder-${secondFolderId}`).click();
    await expect(page.getByText("displays themselves will not be deleted")).toBeVisible();
    await page.getByTestId("button-confirm-delete-agenda-folder").click();
    await expect(page.getByText("Folder deleted", { exact: true })).toBeVisible({ timeout: 10_000 });
    const afterDelete = await db.select({ id: agendaWidgetConfigs.id, name: agendaWidgetConfigs.name, folderId: agendaWidgetConfigs.folderId })
      .from(agendaWidgetConfigs).where(eq(agendaWidgetConfigs.id, configId));
    expect(afterDelete).toEqual([{ id: configId, name: displayName, folderId: null }]);
    await expect(page.getByTestId(`config-card-${configId}`)).toBeVisible();
    await expect(page.getByTestId(`link-open-${configId}`)).toHaveAttribute("href", `/display/agenda/${configId}`);

    // Tablet retains the keyboard-accessible sidebar controls.
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.getByTestId("agenda-folder-sidebar")).toBeVisible();
    await expect(page.getByTestId("button-agenda-folder-unfiled")).toBeVisible();
  });
});
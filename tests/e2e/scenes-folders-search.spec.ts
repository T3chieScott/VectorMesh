import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, like, eq, inArray } from "drizzle-orm";
import { layoutTemplates, layoutFolders, users, clients } from "../../shared/schema";

// Task #313: committed Playwright E2E test for the Scenes sidebar
// folder grouping + name search (Task #311 feature).
//
// Flow covered:
//   1. Create a folder via the sidebar "New folder" button.
//   2. Move a scene into it via the per-scene "Move to folder" menu.
//   3. Collapse the folder — the scene hides.
//   4. Search by name — sections force-open, non-matching scenes/sections hide.
//   5. Rename the folder via the folder "..." menu.
//   6. Delete the folder — the scene returns to Uncategorised (folderId
//      nulled by the onDelete:"set null" FK).
//
// Prerequisites (same as the other committed E2E specs):
//   - Dev server running on http://127.0.0.1:5000 (`npm run dev`).
//   - ENABLE_TEST_AUTH_BYPASS=1 so POST /api/auth/test-login is mounted.
//   - DATABASE_URL points at the dev DB.
//
// Isolation: scenes/folders are namespaced with __TEST_S313_E2E_ and
// cleaned up in afterAll (plus leftovers from prior crashed runs).

const PREFIX = `__TEST_S313_E2E_`;
const RUN = Math.random().toString(36).slice(2, 8);

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: { layoutTemplates, layoutFolders, users, clients } });

async function findAdminEmail(): Promise<string> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`)
    .limit(1);
  if (rows.length === 0) throw new Error("No active admin user found in DB.");
  return rows[0].email;
}

async function cleanup() {
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${PREFIX}%`));
  await db.delete(layoutFolders).where(like(layoutFolders.name, `${PREFIX}%`));
}

async function loginAsTestUser(page: Page, email: string) {
  const res = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `test-login failed: ${await res.text()}`).toBe(200);
}

test.describe("Task #313: Scenes sidebar folders + search", () => {
  let adminEmail = "";
  let clientId = "";
  let sceneAId = "";
  let sceneBId = "";
  const sceneAName = `${PREFIX}${RUN}_AlphaScene`;
  const sceneBName = `${PREFIX}${RUN}_BetaScene`;
  const folderName = `${PREFIX}${RUN}_Folder`;
  const renamedFolderName = `${PREFIX}${RUN}_Renamed`;

  test.beforeAll(async () => {
    await cleanup();
    adminEmail = await findAdminEmail();

    const clientRows = await db
      .select({ id: clients.id })
      .from(clients)
      .limit(1);
    if (clientRows.length === 0) throw new Error("No client/site found in dev DB.");
    clientId = clientRows[0].id;

    // Seed two scenes on that site directly in the DB — the folder UI is
    // what we're testing, not scene creation.
    const inserted = await db
      .insert(layoutTemplates)
      .values([
        { clientId, name: sceneAName, zones: [] },
        { clientId, name: sceneBName, zones: [] },
      ])
      .returning({ id: layoutTemplates.id, name: layoutTemplates.name });
    sceneAId = inserted.find((r) => r.name === sceneAName)!.id;
    sceneBId = inserted.find((r) => r.name === sceneBName)!.id;
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("create folder, move scene, search, rename, delete", async ({ page }) => {
    await loginAsTestUser(page, adminEmail);

    // Pin the site selector to the seeded client so the folder-create
    // button has a folderClientId even in multi-site dev DBs.
    await page.addInitScript(
      (id) => localStorage.setItem("vectormesh_selected_client_id", id),
      clientId,
    );

    await page.goto("/layouts");
    await expect(page.getByTestId("text-layouts-title")).toBeVisible();
    await expect(page.getByTestId(`layout-list-item-${sceneAId}`)).toBeVisible();
    await expect(page.getByTestId(`layout-list-item-${sceneBId}`)).toBeVisible();

    // 1) Create a folder.
    await page.getByTestId("button-create-scene-folder").click();
    await page.getByTestId("input-scene-folder-name").fill(folderName);
    await page.getByTestId("button-save-scene-folder").click();

    // Wait for the mutation's onSuccess toast before reading the DB.
    // The toast fires only after the server returns HTTP 201, which means
    // the INSERT is committed.  Without this, the DB assertion races the
    // async POST and fails intermittently.
    // Use exact:true so Playwright matches only the visual toast title element
    // ("Folder created") and not the toast library's ARIA live-region
    // ("Notification Folder created"), which contains the title as a substring.
    // Without exact:true the strict-mode assertion fails intermittently when
    // Playwright evaluates the locator at the brief moment both elements are
    // present in the DOM simultaneously.
    await expect(page.getByText("Folder created", { exact: true })).toBeVisible({ timeout: 10_000 });

    // The new (empty) folder section shows even with no scenes inside.
    const folderRows = await db
      .select({ id: layoutFolders.id, clientId: layoutFolders.clientId })
      .from(layoutFolders)
      .where(eq(layoutFolders.name, folderName));
    expect(folderRows, "folder row must exist in DB").toHaveLength(1);
    const folderId = folderRows[0].id;
    expect(folderRows[0].clientId, "folder must be scoped to the selected site").toBe(clientId);
    await expect(page.getByTestId(`button-scene-folder-${folderId}`)).toBeVisible();
    await expect(page.getByTestId(`button-scene-folder-${folderId}`)).toContainText(folderName);

    // 2) Move scene A into the folder via the per-scene menu.
    await page.getByTestId(`button-scene-menu-${sceneAId}`).click();
    await page.getByTestId(`button-move-scene-folder-${sceneAId}`).click();
    await page.getByTestId(`button-move-scene-folder-${folderId}-${sceneAId}`).click();
    await expect(page.getByText(new RegExp(`Moved to "`)).first()).toBeVisible({ timeout: 10_000 });

    const movedRow = await db
      .select({ folderId: layoutTemplates.folderId })
      .from(layoutTemplates)
      .where(eq(layoutTemplates.id, sceneAId));
    expect(movedRow[0].folderId, "scene A must carry the folderId").toBe(folderId);

    // Folder header count shows 1; scene A still visible (folder open by default).
    await expect(page.getByTestId(`button-scene-folder-${folderId}`)).toContainText("1");
    await expect(page.getByTestId(`layout-list-item-${sceneAId}`)).toBeVisible();

    // 3) Collapse the folder — scene A hides, scene B (Uncategorised) stays.
    await page.getByTestId(`button-scene-folder-${folderId}`).click();
    await expect(page.getByTestId(`layout-list-item-${sceneAId}`)).toBeHidden();
    await expect(page.getByTestId(`layout-list-item-${sceneBId}`)).toBeVisible();

    // 4) Search by scene A's name — the collapsed folder is forced open
    //    and scene A shows; scene B (no match) hides, and so does its
    //    now-empty Uncategorised section.
    await page.getByTestId("input-scene-search").fill("AlphaScene");
    await expect(page.getByTestId(`layout-list-item-${sceneAId}`)).toBeVisible();
    await expect(page.getByTestId(`layout-list-item-${sceneBId}`)).toBeHidden();
    await expect(page.getByText("Uncategorised")).toBeHidden();

    // A search with no matches shows the empty state.
    await page.getByTestId("input-scene-search").fill(`${PREFIX}${RUN}_nomatch`);
    await expect(page.getByTestId("text-no-scenes-match")).toBeVisible();

    // Clear the search — sections return; the folder stays collapsed from
    // step 3, so re-open it for the rest of the flow.
    await page.getByTestId("input-scene-search").fill("");
    await expect(page.getByTestId(`layout-list-item-${sceneBId}`)).toBeVisible();
    await page.getByTestId(`button-scene-folder-${folderId}`).click();
    await expect(page.getByTestId(`layout-list-item-${sceneAId}`)).toBeVisible();

    // 5) Rename the folder via its "..." menu.
    await page.getByTestId(`button-scene-folder-menu-${folderId}`).click();
    await page.getByTestId(`button-rename-scene-folder-${folderId}`).click();
    await page.getByTestId("input-scene-folder-name").fill(renamedFolderName);
    await page.getByTestId("button-save-scene-folder").click();
    await expect(page.getByTestId(`button-scene-folder-${folderId}`)).toContainText(
      renamedFolderName,
      { timeout: 10_000 },
    );

    // 6) Delete the folder — scene A must survive and return to Uncategorised.
    await page.getByTestId(`button-scene-folder-menu-${folderId}`).click();
    await page.getByTestId(`button-delete-scene-folder-${folderId}`).click();
    await page.getByTestId("button-confirm-delete-scene-folder").click();

    await expect(page.getByTestId(`button-scene-folder-${folderId}`)).toHaveCount(0, {
      timeout: 10_000,
    });
    // Scene A is back in the list (Uncategorised or flat).
    await expect(page.getByTestId(`layout-list-item-${sceneAId}`)).toBeVisible();

    const afterDelete = await db
      .select({ id: layoutTemplates.id, folderId: layoutTemplates.folderId })
      .from(layoutTemplates)
      .where(inArray(layoutTemplates.id, [sceneAId, sceneBId]));
    expect(afterDelete, "both scenes must survive folder deletion").toHaveLength(2);
    for (const row of afterDelete) {
      expect(row.folderId, "folderId must be nulled on folder delete").toBeNull();
    }
  });
});

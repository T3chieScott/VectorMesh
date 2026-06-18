import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, like, inArray } from "drizzle-orm";
import { screens, displayProfiles, users, canvasGroups, clients } from "../../shared/schema";

// Task #182: committed Playwright UI/E2E test for the
// /screens "create two canvas-enabled screens, regenerate from one,
// assert the wall stays consistent" flow.
//
// Prerequisites (mirrored in replit.md):
//   - Dev server is running on http://localhost:5000 (the "Start
//     application" workflow / `npm run dev`).
//   - ENABLE_TEST_AUTH_BYPASS=1 is set in the dev env so the
//     test-only POST /api/auth/test-login route is mounted (see
//     server/testAuthRoute.ts). The route is double-gated by
//     NODE_ENV !== "production" so it can never run in production.
//   - DATABASE_URL points at the dev DB.
//
// Test isolation: every screen this test creates is namespaced with a
// random __TEST_S182_E2E_<random>__ prefix, and the rows are deleted
// in test.afterAll, so the dev DB is not polluted.

const PREFIX = `__TEST_S182_E2E_${Math.random().toString(36).slice(2, 8)}__`;

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: { screens, displayProfiles, users, canvasGroups, clients } });

async function findOrPickAdminEmail(): Promise<string> {
  const rows = await db
    .select({ email: users.email, isActive: users.isActive, role: users.role })
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

async function findCanvasFriendlyClientAndProfile(): Promise<{
  client: { id: string; name: string };
  profile: { id: string; name: string };
}> {
  // Pick a 1920x1080 landscape profile (or fall back to any landscape one)
  // so the two test tiles can sit side-by-side on a 3840x1080 wall.
  const rows = await db
    .select({
      id: displayProfiles.id,
      name: displayProfiles.name,
      clientId: displayProfiles.clientId,
      w: displayProfiles.width,
      h: displayProfiles.height,
    })
    .from(displayProfiles)
    .where(sql`${displayProfiles.width} = 1920 AND ${displayProfiles.height} = 1080`)
    .limit(1);
  let prof = rows[0];
  if (!prof) {
    const fallback = await db
      .select({
        id: displayProfiles.id,
        name: displayProfiles.name,
        clientId: displayProfiles.clientId,
      })
      .from(displayProfiles)
      .where(sql`${displayProfiles.width} >= ${displayProfiles.height}`)
      .limit(1);
    if (fallback.length === 0) {
      throw new Error("No display profile found; seed one before running this E2E test.");
    }
    prof = fallback[0] as typeof prof;
  }

  // A canvas group requires a non-null clientId (Task #189), so both tiles
  // must share a site. Use the profile's own site if it is scoped to one;
  // otherwise (a global profile) any site works.
  let clientRow: { id: string; name: string } | undefined;
  if (prof.clientId) {
    const scoped = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(sql`${clients.id} = ${prof.clientId}`)
      .limit(1);
    clientRow = scoped[0];
  }
  if (!clientRow) {
    const any = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .limit(1);
    if (any.length === 0) {
      throw new Error("No client/site found; seed one before running this E2E test.");
    }
    clientRow = any[0];
  }

  return { client: clientRow, profile: { id: prof.id, name: prof.name } };
}

async function cleanup() {
  // Delete any rows from this run AND any leftover rows from a prior
  // crashed run of the same test family (same __TEST_S182_E2E_*
  // namespace). Screens carry a canvasGroupId FK into canvas_groups, so
  // drop the screens first, then the namespaced canvas group rows.
  await db.delete(screens).where(like(screens.name, `__TEST_S182_E2E_%`));
  await db.delete(canvasGroups).where(like(canvasGroups.name, `__TEST_S182_E2E_%`));
}

async function loginAsTestUser(page: Page, email: string) {
  // Use the same browser context's cookie jar by routing through
  // page.request — that way the connect.sid Set-Cookie lands in the
  // page's context and the subsequent page.goto() is authenticated.
  const res = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `test-login failed: ${await res.text()}`).toBe(200);
}

async function readScreenRowsByName(prefix: string) {
  return db
    .select({
      id: screens.id,
      name: screens.name,
      pairingCode: screens.pairingCode,
      deviceToken: screens.deviceToken,
      canvasWidth: screens.canvasWidth,
      canvasHeight: screens.canvasHeight,
      canvasX: screens.canvasX,
      canvasY: screens.canvasY,
      canvasGroupId: screens.canvasGroupId,
      createdAt: screens.createdAt,
    })
    .from(screens)
    .where(like(screens.name, `${prefix}%`))
    .orderBy(screens.createdAt);
}

test.describe("Task #182: /screens create + regenerate flow", () => {
  let adminEmail = "";
  let profile: { id: string; name: string } = { id: "", name: "" };
  let client: { id: string; name: string } = { id: "", name: "" };

  test.beforeAll(async () => {
    await cleanup();
    adminEmail = await findOrPickAdminEmail();
    ({ client, profile } = await findCanvasFriendlyClientAndProfile());
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("creates two canvas tiles, regenerate rotates the whole wall, owner UI updates", async ({ page }) => {
    await loginAsTestUser(page, adminEmail);

    // 1) Land on /screens (no redirect to /login).
    await page.goto("/screens");
    await expect(page.getByTestId("text-screens-title")).toBeVisible();
    await expect(page.getByTestId("button-create-screen").first()).toBeVisible();

    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Task #189: two tiles only form one wall (one shared device pairing,
    // one owner) when they share an explicit `canvasGroupId`. The first
    // tile mints the group via the "+ New group" button (which prompts for
    // a name); the second tile picks that same group from the dropdown. A
    // namespaced group name lets cleanup() drop the row afterwards.
    const groupName = `${PREFIX}wall`;

    // Helper: walk the create dialog and submit one tile.
    const createTile = async (
      name: string,
      canvasX: number,
      group: { create: true } | { select: true },
    ): Promise<void> => {
      await page.getByTestId("button-create-screen").first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.getByTestId("input-screen-name").fill(name);

      // Assign a site first — a canvas group requires a non-null clientId
      // (Task #189), and the group dropdown only lists groups for the
      // currently-selected site.
      await dialog.getByTestId("select-screen-client").click();
      await page
        .getByRole("option", { name: new RegExp(`^${escapeRe(client.name)}$`, "i") })
        .first()
        .click();

      // Display profile is a Radix Select — open + pick by visible label.
      await dialog.getByTestId("select-screen-profile").click();
      await page
        .getByRole("option", { name: new RegExp(escapeRe(profile.name), "i") })
        .first()
        .click();

      // Enable canvas, set 3840x1080 with the per-tile X offset.
      await dialog.getByTestId("create-canvas-toggle").click();
      const widthInput = dialog.getByTestId("create-canvas-width");
      await widthInput.fill("3840");
      const heightInput = dialog.getByTestId("create-canvas-height");
      await heightInput.fill("1080");
      const xInput = dialog.getByTestId("create-canvas-x");
      await xInput.fill(String(canvasX));
      const yInput = dialog.getByTestId("create-canvas-y");
      await yInput.fill("0");

      if ("create" in group) {
        // The "+ New group" button opens a window.prompt for the name, then
        // POSTs /api/canvas-groups and auto-selects the new group on success.
        const groupCreated = page.waitForResponse(
          (r) =>
            r.url().includes("/api/canvas-groups") &&
            r.request().method() === "POST",
        );
        page.once("dialog", (d) => d.accept(groupName));
        await dialog.getByTestId("create-canvas-group-new").click();
        const resp = await groupCreated;
        expect(
          resp.ok(),
          `create canvas group failed: ${resp.status()}`,
        ).toBeTruthy();
        // onSuccess sets the form's canvasGroupId *before* showing this toast.
        await expect(page.getByText(/Created canvas group/i).first()).toBeVisible({
          timeout: 10_000,
        });
        // Wait until the picker trigger actually reflects the freshly-created
        // group. The group's <SelectItem> only appears once the /api/canvas-groups
        // query refetches, and the trigger only shows the group name once the
        // form value resolves against that list. Submitting before this settles
        // races the value and the screen ends up auto-minted into its own group
        // instead of joining the wall.
        await expect(
          dialog.getByTestId("create-canvas-group-select"),
        ).toContainText(groupName, { timeout: 10_000 });
      } else {
        await dialog.getByTestId("create-canvas-group-select").click();
        const option = page.getByRole("option", {
          name: new RegExp(escapeRe(groupName), "i"),
        });
        await expect(option).toBeVisible({ timeout: 10_000 });
        await option.first().click();
        await expect(
          dialog.getByTestId("create-canvas-group-select"),
        ).toContainText(groupName, { timeout: 10_000 });
      }

      await dialog.getByTestId("button-submit-screen").click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    };

    const nameA = `${PREFIX}A`;
    const nameB = `${PREFIX}B`;

    await createTile(nameA, 0, { create: true });
    await createTile(nameB, 1920, { select: true });

    // 2) DB is the source of truth for unique pairing codes.
    const rows = await readScreenRowsByName(PREFIX);
    expect(rows, `expected exactly 2 screens, got ${rows.length}`).toHaveLength(2);
    const [rowA, rowB] = rows;
    // Both tiles must land in the SAME canvas group (one tile created the
    // group via "+ New group", the other selected it). If the create branch
    // drops the group, the server auto-mints a solo group per screen and the
    // wall never forms — guard against that regression explicitly.
    expect(rowA.canvasGroupId).toBeTruthy();
    expect(rowB.canvasGroupId).toBe(rowA.canvasGroupId);
    expect(rowA.name).toBe(nameA);
    expect(rowB.name).toBe(nameB);
    expect(rowA.canvasWidth).toBe(3840);
    expect(rowA.canvasHeight).toBe(1080);
    expect(rowB.canvasWidth).toBe(3840);
    expect(rowB.canvasHeight).toBe(1080);
    expect(rowA.canvasX).toBe(0);
    expect(rowB.canvasX).toBe(1920);

    expect(rowA.pairingCode).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(rowB.pairingCode).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(
      rowA.pairingCode,
      "Task #180: server must mint a UNIQUE pairing code per tile",
    ).not.toBe(rowB.pairingCode);

    const originalCodeA = rowA.pairingCode!;
    const originalCodeB = rowB.pairingCode!;

    // 3) Owner UI shows the owner's pairing code panel.
    //    Sibling card never renders its own pairing-code panel —
    //    when the wall is unpaired (as is the case immediately after
    //    creation, isPaired=false), the sibling also doesn't render
    //    the inherits message (gated on owner.isPaired in
    //    shared/canvas-groups.ts so we don't lie about an inherited
    //    pairing that doesn't exist yet). So we just lock that the
    //    sibling card has no text-pairing-code element of its own.
    await expect(page.getByTestId(`text-pairing-code-${rowA.id}`)).toContainText(originalCodeA);
    await expect(page.getByTestId(`text-pairing-code-${rowB.id}`)).toHaveCount(0);

    // 4) Regenerate from the OWNER tile via its card's "..." menu.
    //    The menu trigger has a stable per-row testid in screens.tsx
    //    (button-screen-menu-<id>) so we can target it directly.
    await page.getByTestId(`button-screen-menu-${rowA.id}`).click();
    await page.getByTestId(`button-regenerate-pairing-${rowA.id}`).click();

    // 5) Wait for the toast that confirms the regenerate succeeded.
    await expect(page.getByText(/pairing code regenerated/i).first()).toBeVisible({ timeout: 10_000 });

    // 6) DB assertion: both tiles rotated; deviceToken cleared; codes still unique.
    const rotated = await db
      .select({
        id: screens.id,
        pairingCode: screens.pairingCode,
        deviceToken: screens.deviceToken,
      })
      .from(screens)
      .where(inArray(screens.id, [rowA.id, rowB.id]));
    const newA = rotated.find((r) => r.id === rowA.id)!;
    const newB = rotated.find((r) => r.id === rowB.id)!;

    expect(newA.pairingCode).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(newB.pairingCode).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(newA.pairingCode, "owner code must rotate").not.toBe(originalCodeA);
    expect(
      newB.pairingCode,
      "Task #180: regenerate from any tile rotates the WHOLE wall",
    ).not.toBe(originalCodeB);
    expect(newA.pairingCode, "each tile keeps its own unique code").not.toBe(newB.pairingCode);
    expect(newA.deviceToken, "regenerate clears device token").toBeNull();
    expect(newB.deviceToken, "regenerate clears device token on every wall member").toBeNull();

    // 7) Owner card UI reflects the rotation (no longer shows the original code).
    await expect(page.getByTestId(`text-pairing-code-${rowA.id}`)).toContainText(newA.pairingCode!);
    await expect(page.getByTestId(`text-pairing-code-${rowA.id}`)).not.toContainText(originalCodeA);
  });
});

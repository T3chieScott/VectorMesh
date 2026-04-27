import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, like, inArray } from "drizzle-orm";
import { screens, displayProfiles, users } from "../../shared/schema";

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
const db = drizzle(pool, { schema: { screens, displayProfiles, users } });

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

async function findCanvasFriendlyProfile(): Promise<{ id: string; name: string }> {
  // Pick a 1920x1080 landscape profile (or fall back to any landscape one)
  // so the two test tiles can sit side-by-side on a 3840x1080 wall.
  const rows = await db
    .select({ id: displayProfiles.id, name: displayProfiles.name, w: displayProfiles.width, h: displayProfiles.height })
    .from(displayProfiles)
    .where(sql`${displayProfiles.width} = 1920 AND ${displayProfiles.height} = 1080`)
    .limit(1);
  if (rows.length > 0) return { id: rows[0].id, name: rows[0].name };
  const fallback = await db
    .select({ id: displayProfiles.id, name: displayProfiles.name })
    .from(displayProfiles)
    .where(sql`${displayProfiles.width} >= ${displayProfiles.height}`)
    .limit(1);
  if (fallback.length === 0) {
    throw new Error("No display profile found; seed one before running this E2E test.");
  }
  return fallback[0];
}

async function cleanup() {
  // Delete any rows from this run AND any leftover rows from a prior
  // crashed run of the same test family (same __TEST_S182_E2E_*
  // namespace). Done in two steps so the unique pairing_code constraint
  // never blocks a re-run.
  await db.delete(screens).where(like(screens.name, `__TEST_S182_E2E_%`));
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
      createdAt: screens.createdAt,
    })
    .from(screens)
    .where(like(screens.name, `${prefix}%`))
    .orderBy(screens.createdAt);
}

test.describe("Task #182: /screens create + regenerate flow", () => {
  let adminEmail = "";
  let profile: { id: string; name: string } = { id: "", name: "" };

  test.beforeAll(async () => {
    await cleanup();
    adminEmail = await findOrPickAdminEmail();
    profile = await findCanvasFriendlyProfile();
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

    // Helper: walk the create dialog and submit one tile.
    const createTile = async (
      name: string,
      canvasX: number,
    ): Promise<void> => {
      await page.getByTestId("button-create-screen").first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.getByTestId("input-screen-name").fill(name);

      // Display profile is a Radix Select — open + pick by visible label.
      await dialog.getByTestId("select-screen-profile").click();
      await page
        .getByRole("option", { name: new RegExp(profile.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
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

      await dialog.getByTestId("button-submit-screen").click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    };

    const nameA = `${PREFIX}A`;
    const nameB = `${PREFIX}B`;

    await createTile(nameA, 0);
    await createTile(nameB, 1920);

    // 2) DB is the source of truth for unique pairing codes.
    const rows = await readScreenRowsByName(PREFIX);
    expect(rows, `expected exactly 2 screens, got ${rows.length}`).toHaveLength(2);
    const [rowA, rowB] = rows;
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

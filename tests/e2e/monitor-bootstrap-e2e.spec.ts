/**
 * Task #332 — Multiview bootstrap flow end-to-end test
 *
 * Exercises the full browser path:
 *   POST create monitor session → navigate to monitorUrl (GET /monitor-bootstrap/:screenId?token=...)
 *   → server validates token, sets HttpOnly cookie → 302 redirect → /monitor/:screenId
 *   → React MonitorPage renders
 *
 * Invariants verified:
 *   1. vm_monitor_session cookie is set after the bootstrap exchange
 *   2. Browser lands on /monitor/:screenId (not an error page)
 *   3. MonitorPage renders content or spinner — NOT the "session expired" auth error
 *   4. /api/player/heartbeat is NEVER requested during a monitor session
 *   5. localStorage does NOT contain a deviceToken (vm_player_token) after the session
 *
 * Prerequisites (same as other e2e tests):
 *   - Dev server running on http://127.0.0.1:5000
 *   - ENABLE_TEST_AUTH_BYPASS=1 set in the dev env
 *   - DATABASE_URL points at the dev DB with at least one screen row
 */

import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { screens, users, monitorSessions } from "../../shared/schema";
import { like } from "drizzle-orm";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: { screens, users, monitorSessions } });

// The player's localStorage key for the device token (from player.tsx)
const PLAYER_TOKEN_KEY = "vm_player_token";

async function findAdminEmail(): Promise<string> {
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

async function findAnyScreen(): Promise<{ id: string; name: string }> {
  const rows = await db
    .select({ id: screens.id, name: screens.name })
    .from(screens)
    .limit(1);
  if (rows.length === 0) {
    throw new Error(
      "No screen found in DB; create one before running this E2E test.",
    );
  }
  return rows[0];
}

async function loginAsTestUser(page: Page, email: string): Promise<void> {
  const res = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `test-login failed: ${await res.text()}`).toBe(200);
}

async function cleanupTestMonitorSessions(screenId: string): Promise<void> {
  // Delete any monitor sessions created during this test run for the screen.
  // Filter by screenId — revokedAt IS NULL covers only active ones, but we
  // clean regardless so we don't pollute the DB across runs.
  await pool.query(
    `DELETE FROM monitor_sessions WHERE screen_id = $1`,
    [screenId],
  );
}

test.describe("Task #332: Multiview bootstrap flow (end-to-end browser)", () => {
  let adminEmail = "";
  let screen: { id: string; name: string } = { id: "", name: "" };

  test.beforeAll(async () => {
    adminEmail = await findAdminEmail();
    screen = await findAnyScreen();
  });

  test.afterAll(async () => {
    try {
      if (screen.id) {
        await cleanupTestMonitorSessions(screen.id);
      }
    } finally {
      await pool.end();
    }
  });

  test(
    "bootstrap sets HttpOnly cookie, redirects to /monitor/:screenId, " +
      "content renders, no heartbeat, no deviceToken in localStorage",
    async ({ page, context }) => {
      // ── Track /api/player/heartbeat calls ─────────────────────────────────
      const heartbeatCalls: string[] = [];
      await page.route("**/api/player/heartbeat", (route) => {
        heartbeatCalls.push(route.request().url());
        route.continue();
      });

      // ── Step 1: authenticate the test browser ─────────────────────────────
      await loginAsTestUser(page, adminEmail);

      // ── Step 2: create a monitor session via the API ──────────────────────
      const createRes = await page.request.post(
        `/api/operations/screens/${screen.id}/monitor-session`,
        {
          data: {
            clientType: "multiview",
            clientName: "Playwright e2e test",
          },
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(
        createRes.status(),
        `POST monitor-session failed: ${await createRes.text()}`,
      ).toBe(201);

      const sessionData = await createRes.json();
      expect(sessionData.monitorUrl, "monitorUrl must be present").toBeTruthy();
      expect(
        sessionData.monitorSessionId,
        "monitorSessionId must be present",
      ).toBeTruthy();
      expect(sessionData.screenId).toBe(screen.id);

      const { monitorUrl, monitorSessionId } = sessionData as {
        monitorUrl: string;
        monitorSessionId: string;
        screenId: string;
      };

      // ── Step 3: navigate to the bootstrap URL ─────────────────────────────
      // The server may return a monitorUrl on the Replit public domain
      // (getPublicBaseUrl) but Playwright must navigate via 127.0.0.1:5000 so
      // cookies land on the same origin as subsequent page requests and
      // page.route() intercepts work. Rewrite the origin to the local base URL.
      const E2E_BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
      const parsedMonitorUrl = new URL(monitorUrl);
      const localBootstrapUrl = `${E2E_BASE}${parsedMonitorUrl.pathname}${parsedMonitorUrl.search}`;

      // The server validates the token, sets the HttpOnly cookie, and issues
      // a 302 → /monitor/:screenId. Playwright follows the redirect.
      // Use "commit" (first response headers received) to avoid timing out
      // while the Vite dev server compiles the React module graph; we wait
      // for the React mount separately below.
      await page.goto(localBootstrapUrl, { waitUntil: "commit", timeout: 30_000 });

      // ── Step 4: verify the redirect landed on /monitor/:screenId ──────────
      const finalUrl = new URL(page.url());
      expect(
        finalUrl.pathname,
        "browser must land on /monitor/:screenId after bootstrap redirect",
      ).toBe(`/monitor/${screen.id}`);

      // ── Step 5: verify the monitor session cookie is set ──────────────────
      const cookies = await context.cookies();
      const monitorCookie = cookies.find((c) => c.name === "vm_monitor_session");
      expect(
        monitorCookie,
        "vm_monitor_session cookie must be set after bootstrap exchange",
      ).toBeTruthy();
      // Cookie value is <sessionId>:<rawSecretHex> — may be URL-encoded by the
      // browser (e.g. ":" → "%3A"). Decode before asserting the format.
      const decodedCookieValue = decodeURIComponent(monitorCookie!.value);
      expect(decodedCookieValue).toMatch(
        new RegExp(`^${monitorSessionId}:`),
      );
      // HttpOnly: cannot be directly verified by JS (by design); Playwright
      // surfaces it on the cookie object.
      expect(
        monitorCookie!.httpOnly,
        "vm_monitor_session must be HttpOnly",
      ).toBe(true);

      // ── Step 6: wait for the React MonitorPage to mount ───────────────────
      // The SPA renders after the redirect. Wait for a recognisable element:
      //   • the "Monitor session expired" heading (auth error — bad)
      //   • the loading spinner (good — cookie is valid, content pending)
      //   • any zone content div (good — content arrived)
      //   • the black "no zones" fallback div (good — screen has no layout)
      // We wait for one of these four states to appear and assert it is NOT
      // the auth error state.
      await page.waitForFunction(
        () => {
          // Auth error: h1 with specific text
          const h1 = document.querySelector("h1");
          if (h1?.textContent?.includes("Monitor session expired")) return true;
          // Spinner: animate-spin class
          if (document.querySelector(".animate-spin")) return true;
          // Content or black fallback: fixed inset-0 bg-black div
          if (document.querySelector(".fixed.inset-0.bg-black")) return true;
          return false;
        },
        undefined,
        { timeout: 15_000 },
      );

      // The auth error ("Monitor session expired") must NOT appear.
      const authErrorHeading = page.getByText("Monitor session expired");
      await expect(
        authErrorHeading,
        "MonitorPage must NOT show the auth error — cookie was not set or is invalid",
      ).toHaveCount(0);

      // ── Step 7: wait for first content fetch to complete ─────────────────
      // The MonitorPage fetches /api/monitor/:screenId/content once it mounts.
      // Wait for the response so we can assert the page stayed in a valid state.
      const contentResponseP = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/monitor/${screen.id}/content`) &&
          r.request().method() === "GET",
        { timeout: 15_000 },
      );

      const contentRes = await contentResponseP;
      expect(
        contentRes.status(),
        "/api/monitor/:screenId/content must return 200 (cookie is valid)",
      ).toBe(200);

      // ── Step 8: auth error still absent after content fetch ───────────────
      await expect(
        authErrorHeading,
        "MonitorPage must not show auth error even after content fetch",
      ).toHaveCount(0);

      // ── Step 9: /api/player/heartbeat must NEVER have been called ─────────
      // Wait a brief moment so any delayed heartbeat interval would have fired.
      await page.waitForTimeout(2_000);
      expect(
        heartbeatCalls,
        "/api/player/heartbeat must not be called during a monitor session",
      ).toHaveLength(0);

      // ── Step 10: localStorage must NOT contain a deviceToken ──────────────
      const storedToken = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        PLAYER_TOKEN_KEY,
      );
      expect(
        storedToken,
        "localStorage must not contain a deviceToken (vm_player_token) in monitor mode",
      ).toBeNull();

      // ── Step 11: also check no screen ID persisted ────────────────────────
      const storedScreenId = await page.evaluate(() =>
        window.localStorage.getItem("vm_player_screen"),
      );
      expect(
        storedScreenId,
        "localStorage must not contain vm_player_screen in monitor mode",
      ).toBeNull();
    },
  );

  test("second navigation to bootstrap URL with spent token is rejected (single-use)", async ({
    page,
  }) => {
    await loginAsTestUser(page, adminEmail);

    // Create a fresh session for this sub-test
    const createRes = await page.request.post(
      `/api/operations/screens/${screen.id}/monitor-session`,
      {
        data: { clientType: "multiview", clientName: "Playwright reuse-test" },
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(createRes.status()).toBe(201);
    const { monitorUrl } = (await createRes.json()) as { monitorUrl: string };

    // Rewrite to local base URL so cookies land on the right origin
    const E2E_BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
    const parsedUrl = new URL(monitorUrl);
    const localUrl = `${E2E_BASE}${parsedUrl.pathname}${parsedUrl.search}`;

    // First visit — valid: should redirect to /monitor/:screenId
    await page.goto(localUrl, { waitUntil: "commit", timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(`/monitor/${screen.id}`);

    // Second visit with the SAME (now spent) token — must be rejected with 401
    const secondRes = await page.request.get(localUrl);
    expect(
      secondRes.status(),
      "spent bootstrap token must return 401 on second use",
    ).toBe(401);
    const body = await secondRes.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });
});

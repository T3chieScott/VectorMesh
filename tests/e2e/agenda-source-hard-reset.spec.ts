/**
 * Production-shaped Agenda source hard-reset coverage.
 *
 * This spec uses a freshly-created site, an uploaded_xlsx source, and an
 * in-memory workbook uploaded through the real upload route.  It never uses
 * a production tenant or a real Microsoft account.  The separate transport
 * test at the bottom keeps the Microsoft Graph read-only contract covered
 * without requiring an external OAuth browser flow.
 *
 * Pagination, typography, and status-filter parity intentionally remain
 * separate regressions:
 *   - agenda-pagination-consistency.spec.ts
 *   - agenda-status-filter-monitor-parity.spec.ts
 *   - agenda-autofit-pack.test.ts / scene-text-size-consistency.test.ts
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like, sql } from "drizzle-orm";
import {
  agendaItems,
  agendaSyncConfigs,
  agendaWidgetConfigs,
  clients,
  displayProfiles,
  events,
  layoutTemplates,
  monitorSessions,
  playlistItems,
  playlists,
  programmeVersions,
  programmes,
  scheduleBlocks,
  screenEventBookings,
  screens,
  users,
} from "../../shared/schema";
import {
  assertGraphMethodAllowed,
  fetchMicrosoftCTag,
  fetchMicrosoftXlsxBytes,
} from "../../server/microsoftGraph";

const MARK = "ZZTEST-AGENDA-HARD-RESET-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const READINESS_TIMEOUT_MS = 60_000;
const READINESS_POLL_MS = 250;
const COLD_VITE_NAVIGATION_TIMEOUT_MS = 60_000;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: {
    agendaItems,
    agendaSyncConfigs,
    agendaWidgetConfigs,
    clients,
    displayProfiles,
    events,
    layoutTemplates,
    monitorSessions,
    playlistItems,
    playlists,
    programmeVersions,
    programmes,
    scheduleBlocks,
    screenEventBookings,
    screens,
    users,
  },
});

async function waitForServerReady(request: APIRequestContext) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastResult = "no response";
  while (Date.now() < deadline) {
    try {
      const [health, agenda] = await Promise.all([
        request.get("/api/health"),
        request.get("/agenda"),
      ]);
      lastResult = `/api/health=${health.status()} /agenda=${agenda.status()}`;
      if (health.ok() && agenda.ok()) return;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_POLL_MS));
  }
  throw new Error(
    `Server readiness timed out after ${READINESS_TIMEOUT_MS}ms (${lastResult})`,
  );
}

type Seed = {
  clientId: string;
  sourceId: string;
  otherSourceId: string;
  agendaConfigId: string;
  screenId: string;
  deviceToken: string;
  adminUserId: string;
  adminEmail: string;
  fixtureTitles: string[];
  manualTitle: string;
  otherTitle: string;
  obsoleteTitle: string;
  workbook: Buffer;
};

async function gotoWithColdViteTimeout(
  page: Page,
  url: string,
  waitUntil: "commit" | "domcontentloaded",
) {
  await page.goto(url, {
    waitUntil,
    timeout: COLD_VITE_NAVIGATION_TIMEOUT_MS,
  });
}

async function cleanup() {
  // The stable marker also cleans up rows left behind by an interrupted
  // disposable run.  Nothing outside this test's marker is touched.
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `${MARK}%`));
  await db.delete(agendaItems).where(like(agendaItems.title, `${MARK}%`));
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${MARK}%`));
  await db.delete(playlistItems).where(sql`${playlistItems.playlistId} in
    (select id from playlists where name like ${`${MARK}%`})`);
  await db.delete(playlists).where(like(playlists.name, `${MARK}%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${MARK}%`));
  await db.delete(screenEventBookings).where(sql`${screenEventBookings.screenId} in
    (select id from screens where name like ${`${MARK}%`})`);
  await db.delete(events).where(like(events.name, `${MARK}%`));
  await db.delete(monitorSessions).where(like(monitorSessions.clientName, `${MARK}%`));
  await db.delete(screens).where(like(screens.name, `${MARK}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${MARK}%`));
  await db.delete(agendaSyncConfigs).where(like(agendaSyncConfigs.name, `${MARK}%`));
  await db.delete(clients).where(like(clients.name, `${MARK}%`));
}

async function admin(): Promise<{ id: string; email: string }> {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`)
    .limit(1);
  if (!row) throw new Error("An active admin is required for test auth.");
  return row;
}

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  expect(response.status(), `test-login failed: ${await response.text()}`).toBe(200);
}

async function buildWorkbook(
  rows: Array<{ title: string; startsAt: Date; endsAt: Date }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Agenda");
  sheet.addRow(["Title", "Start", "End"]);
  for (const row of rows) {
    sheet.addRow([row.title, row.startsAt, row.endsAt]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function createUploadedSource(
  page: Page,
  clientId: string,
  workbook: Buffer,
  name: string,
) {
  const upload = await page.request.post("/api/agenda/sync-configs/upload-xlsx", {
    multipart: {
      clientId,
      file: {
        name: `${name}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: workbook,
      },
    },
  });
  expect(upload.status(), `xlsx upload failed: ${await upload.text()}`).toBe(200);
  const uploaded = await upload.json() as {
    storedFilePath: string;
    originalFileName: string;
    sheetNames: string[];
  };
  expect(uploaded.sheetNames).toContain("Agenda");

  const response = await page.request.post("/api/agenda/sync-configs", {
    data: {
      clientId,
      name,
      sourceType: "uploaded_xlsx",
      sourceUrl: null,
      storedFilePath: uploaded.storedFilePath,
      originalFileName: uploaded.originalFileName,
      sheetName: "Agenda",
      headerRowIndex: 0,
      columnMapping: { title: "Title", startsAt: "Start", endsAt: "End" },
      // Deliberately absent: the UI must show the exact row-position warning.
      externalIdColumn: null,
      timezone: "UTC",
      syncMode: "manual",
      syncIntervalMinutes: 60,
      removeMissingItems: true,
      enabled: false,
    },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  expect(response.status(), `source creation failed: ${await response.text()}`).toBe(201);
  return await response.json() as { id: string };
}

async function seedDisplay(
  clientId: string,
  agendaConfigId: string,
): Promise<{ screenId: string; deviceToken: string }> {
  const [{ id: profileId }] = await db.insert(displayProfiles).values({
    clientId,
    name: `${PREFIX}profile`,
    width: 1920,
    height: 1080,
  }).returning({ id: displayProfiles.id });
  const [{ id: playlistId }] = await db.insert(playlists).values({
    clientId,
    name: `${PREFIX}fallback`,
  }).returning({ id: playlists.id });
  const [{ id: layoutId }] = await db.insert(layoutTemplates).values({
    clientId,
    name: `${PREFIX}agenda-layout`,
    aspectRatio: "16:9",
    zones: [{
      id: "agenda",
      name: "Agenda",
      type: "agenda",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      zIndex: 1,
      agendaConfigId,
    }] as any,
  }).returning({ id: layoutTemplates.id });
  await db.insert(playlistItems).values({
    playlistId,
    layoutTemplateId: layoutId,
    order: 0,
    duration: 60,
  });
  const now = new Date();
  const [{ id: eventId }] = await db.insert(events).values({
    clientId,
    name: `${PREFIX}event`,
    startDate: new Date(now.getTime() - 86_400_000),
    endDate: new Date(now.getTime() + 86_400_000),
  }).returning({ id: events.id });
  const [{ id: programmeId }] = await db.insert(programmes).values({
    eventId,
    name: `${PREFIX}programme`,
  }).returning({ id: programmes.id });
  const [{ id: versionId }] = await db.insert(programmeVersions).values({
    programmeId,
    versionNumber: 1,
    status: "published",
    publishedAt: now,
  }).returning({ id: programmeVersions.id });
  const deviceToken = `${PREFIX}device`;
  const [{ id: screenId }] = await db.insert(screens).values({
    clientId,
    name: `${PREFIX}screen`,
    displayProfileId: profileId,
    deviceToken,
    isPaired: true,
    isOnline: true,
    fallbackPlaylistId: playlistId,
  }).returning({ id: screens.id });
  await db.insert(screenEventBookings).values({
    screenId,
    eventId,
    startsAt: new Date(now.getTime() - 86_400_000),
    endsAt: new Date(now.getTime() + 86_400_000),
  });
  await db.insert(scheduleBlocks).values({
    programmeVersionId: versionId,
    name: `${PREFIX}agenda-block`,
    layoutTemplateId: null,
    targets: [{ type: "screen", id: screenId }],
    timeRules: [{
      startDate: new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10),
      endDate: new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10),
    }],
    zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId }],
  });
  return { screenId, deviceToken };
}

async function orderedTitles(page: Page): Promise<string[]> {
  const frame = page.getByTestId("screen-render-committed-frame");
  return frame.locator("[data-testid^='agenda-title-']").allTextContents();
}

test.describe("Agenda source hard reset", () => {
  test.beforeAll(async ({ playwright }) => {
    // Run readiness before the browser fixture is created, so the first
    // navigation does not race server startup or cold Vite compilation.
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    try {
      await waitForServerReady(request);
    } finally {
      await request.dispose();
    }
  });

  test.afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  test("preflights exact impact, requires RESET, then replaces only the selected source", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await cleanup();
    const { id: adminUserId, email: adminEmail } = await admin();
    await login(page, adminEmail);

    const [{ id: clientId }] = await db.insert(clients).values({
      name: `${PREFIX}site`,
      timezone: "UTC",
    }).returning({ id: clients.id });
    await page.addInitScript((id) => {
      localStorage.setItem("vectormesh_selected_client_id", id);
    }, clientId);

    const base = Date.now();
    const fixtureTitles = [
      `${PREFIX}spreadsheet-one`,
      `${PREFIX}spreadsheet-two`,
      `${PREFIX}spreadsheet-three`,
    ];
    const fixtureRows = fixtureTitles.map((title, index) => ({
      title,
      startsAt: new Date(base + (index + 1) * 10 * 60_000),
      endsAt: new Date(base + (index + 1) * 10 * 60_000 + 30 * 60_000),
    }));
    const workbook = await buildWorkbook(fixtureRows);
    const source = await createUploadedSource(
      page,
      clientId,
      workbook,
      `${PREFIX}workbook`,
    );
    const otherSource = await createUploadedSource(
      page,
      clientId,
      workbook,
      `${PREFIX}other-workbook`,
    );

    const manualTitle = `${PREFIX}manual-retained`;
    const otherTitle = `${PREFIX}other-connection-retained`;
    const obsoleteTitle = `${PREFIX}obsolete`;
    await db.insert(agendaItems).values([
      ...fixtureRows.map((row, index) => ({
        clientId,
        title: index === 1 ? `${PREFIX}manual-override` : row.title,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: "scheduled",
        externalSyncConfigId: source.id,
        externalId: `row-${index}`,
        manualOverride: index === 1,
      })),
      {
        clientId,
        title: obsoleteTitle,
        startsAt: new Date(base + 45 * 60_000),
        endsAt: new Date(base + 75 * 60_000),
        status: "scheduled",
        externalSyncConfigId: source.id,
        externalId: "obsolete-id",
        manualOverride: false,
      },
      {
        clientId,
        title: manualTitle,
        startsAt: new Date(base + 50 * 60_000),
        endsAt: new Date(base + 80 * 60_000),
        status: "scheduled",
        manualOverride: true,
      },
      {
        clientId,
        title: otherTitle,
        startsAt: new Date(base + 60 * 60_000),
        endsAt: new Date(base + 90 * 60_000),
        status: "scheduled",
        externalSyncConfigId: otherSource.id,
        externalId: "other-row-0",
        manualOverride: false,
      },
    ]);

    const [{ id: agendaConfigId }] = await db.insert(agendaWidgetConfigs).values({
      clientId,
      name: `${PREFIX}display-agenda`,
      displayMode: "full",
      layoutMode: "card",
      maxItemsPerPage: 20,
      timeWindowMinutes: 180,
      refreshIntervalSeconds: 5,
      showEventName: false,
      showDescription: true,
      showPresenter: true,
      showRoom: true,
      showTrack: true,
    }).returning({ id: agendaWidgetConfigs.id });
    const display = await seedDisplay(clientId, agendaConfigId);

    // The page is the production operator surface: source rows are loaded
    // with the selected site, and the reset request is initiated by the UI.
    await gotoWithColdViteTimeout(page, "/agenda", "domcontentloaded");
    await expect(page.getByTestId(`sync-row-${source.id}`)).toContainText(`${PREFIX}workbook`);
    await expect(page.getByTestId(`sync-row-${otherSource.id}`)).toContainText(`${PREFIX}other-workbook`);
    await page.getByTestId(`button-reimport-source-${source.id}`).click();
    const dialog = page.getByTestId(`dialog-reimport-${source.id}`);
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("reimport-preflight")).toBeVisible({ timeout: 20_000 });

    const sourceCounts = page.getByTestId("reimport-preflight-counts");
    const currentCounts = page.getByTestId("reimport-preflight-counts-1-details");
    const plannedCounts = page.getByTestId("reimport-preflight-counts-2-details");
    await expect(sourceCounts).toContainText(/Remote Rows Read\s*3/);
    await expect(sourceCounts).toContainText(/Valid Sessions\s*3/);
    await expect(currentCounts).toContainText(/Existing Connection Items\s*4/);
    await expect(currentCounts).toContainText(/Manual Overrides To Discard\s*1/);
    await expect(plannedCounts).toContainText(/To Insert\s*0/);
    await expect(plannedCounts).toContainText(/To Update\s*3/);
    await expect(plannedCounts).toContainText(/To Remove\s*1/);
    await expect(page.getByTestId("reimport-no-stable-id-warning")).toHaveText(
      "This connection identifies rows by spreadsheet position. Inserting, deleting, moving or sorting rows can change session identities. Configure a stable unique ID column for reliable synchronisation.",
    );
    await expect(page.getByTestId("button-confirm-reimport")).toBeDisabled();
    await page.getByTestId("input-reimport-confirmation").fill("reset");
    await expect(page.getByTestId("button-confirm-reimport")).toBeDisabled();

    let executePayload: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes(`/api/agenda/sync-configs/${source.id}/reimport`)
      ) {
        executePayload = JSON.parse(request.postData() || "{}");
      }
    });
    await page.getByTestId("input-reimport-confirmation").fill("RESET");
    await expect(page.getByTestId("button-confirm-reimport")).toBeEnabled();
    await page.getByTestId("button-confirm-reimport").click();
    await expect(page.getByTestId("reimport-completion")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reimport-completion-counts")).toContainText("Removed");
    await expect(page.getByTestId("reimport-completion-counts")).toContainText("Manual overrides discarded");
    expect(executePayload).toEqual(expect.objectContaining({
      confirmation: "RESET",
    }));

    const rowsResponse = await page.request.get(`/api/agenda?clientId=${clientId}`);
    expect(rowsResponse.status()).toBe(200);
    const rows = await rowsResponse.json() as Array<{
      title: string;
      externalSyncConfigId: string | null;
      externalId: string | null;
      manualOverride: boolean;
    }>;
    expect(rows.some((row) => row.title === obsoleteTitle)).toBe(false);
    expect(rows.filter((row) => row.externalSyncConfigId === source.id).map((row) => row.title))
      .toEqual(fixtureTitles);
    expect(rows.filter((row) => row.externalSyncConfigId === source.id).every((row) => !row.manualOverride))
      .toBe(true);
    expect(rows.some((row) => row.title === manualTitle)).toBe(true);
    expect(rows.some((row) => row.title === otherTitle && row.externalSyncConfigId === otherSource.id))
      .toBe(true);

    const expectedTitles = [...fixtureTitles, manualTitle, otherTitle];
    const publicDisplay = await page.request.get(`/api/agenda/display/${agendaConfigId}`);
    expect(publicDisplay.status()).toBe(200);
    const publicPayload = await publicDisplay.json() as { items: Array<{ title: string }> };
    expect(publicPayload.items.map((item) => item.title)).toEqual(expectedTitles);

    // Keep Player and Monitor on their real content and render routes.  Only
    // monitor bootstrap is seeded, exactly as the admin UI's monitor action
    // does; no content endpoint is mocked.
    const rawToken = crypto.randomBytes(32).toString("hex");
    await db.insert(monitorSessions).values({
      userId: adminUserId,
      screenId: display.screenId,
      clientId,
      tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      clientType: "multiview",
      clientName: `${MARK}reset-parity`,
    });
    const context = await browser.newContext();
    const player = await context.newPage();
    const monitor = await context.newPage();
    await player.addInitScript(({ screenId, deviceToken }) => {
      localStorage.setItem("signage_device_token", deviceToken);
      localStorage.setItem("signage_screen_id", screenId);
    }, { screenId: display.screenId, deviceToken: display.deviceToken });
    await gotoWithColdViteTimeout(player, "/player", "domcontentloaded");
    await gotoWithColdViteTimeout(
      monitor,
      `${BASE_URL}/monitor-bootstrap/${display.screenId}?token=${rawToken}`,
      "commit",
    );
    await expect(player.getByTestId("screen-render-committed-frame")).toBeVisible({ timeout: 30_000 });
    await expect(monitor.getByTestId("screen-render-committed-frame")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => orderedTitles(player), { timeout: 30_000 }).toEqual(expectedTitles);
    await expect.poll(() => orderedTitles(monitor), { timeout: 30_000 }).toEqual(expectedTitles);
    expect(await orderedTitles(monitor)).toEqual(await orderedTitles(player));
    await context.close();
  });

  test("Microsoft Graph transport accepts mocked reads and rejects writes", async () => {
    const workbook = await buildWorkbook([{
      title: `${PREFIX}graph-read`,
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
    }]);
    const methods: string[] = [];
    const previousHost = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const previousIdentity = process.env.REPL_IDENTITY;
    process.env.REPLIT_CONNECTORS_HOSTNAME = "disposable-connectors.invalid";
    process.env.REPLIT_IDENTITY = "disposable-test-identity";
    try {
      const mockGraphFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        methods.push(init?.method ?? "GET");
        const url = String(input);
        if (url.includes("/api/v2/connection")) {
          return new Response(
            JSON.stringify({ items: [{ settings: { access_token: "disposable-token" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/content")) return new Response(workbook, { status: 200 });
        return new Response(JSON.stringify({ id: "item", cTag: "disposable-ctag" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;
      const source = {
        sourceType: "excel_onedrive" as const,
        microsoftAuth: true,
        msDriveId: "disposable-drive",
        msItemId: "disposable-item",
      };
      expect(await fetchMicrosoftCTag(source, mockGraphFetch)).toBe("disposable-ctag");
      expect(await fetchMicrosoftXlsxBytes(source, mockGraphFetch)).toEqual(new Uint8Array(workbook));
      expect(methods.length).toBeGreaterThan(0);
      expect(methods.every((method) => method === "GET" || method === "HEAD")).toBe(true);
      expect(() => assertGraphMethodAllowed("POST")).toThrow(/Only GET and HEAD/);
      expect(() => assertGraphMethodAllowed("PUT")).toThrow(/Only GET and HEAD/);
    } finally {
      if (previousHost === undefined) delete process.env.REPLIT_CONNECTORS_HOSTNAME;
      else process.env.REPLIT_CONNECTORS_HOSTNAME = previousHost;
      if (previousIdentity === undefined) delete process.env.REPLIT_IDENTITY;
      else process.env.REPLIT_IDENTITY = previousIdentity;
    }
  });
});
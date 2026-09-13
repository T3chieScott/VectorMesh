import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { users } from "../../shared/schema";

/**
 * Focused UI coverage for the operator-facing search and reporting surfaces.
 *
 * The content APIs are intercepted with an in-memory fixture.  This keeps the
 * test read-only and makes the resolver outcomes (scheduled scene and
 * playlist, both fallbacks, and live override) independent of whatever
 * disposable DB rows happen to be present.  Auth still uses the repository's
 * test-login convention.
 */

const SITE_ID = "e2e-reporting-site";
const ADMIN_SITE = {
  id: SITE_ID,
  name: "Reporting Test Site",
  description: null,
  logoUrl: null,
  locked: false,
  maxUploadSizeMb: 100,
  timezone: "UTC",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const AGENDA_ITEMS = [
  {
    id: "agenda-search-room",
    clientId: SITE_ID,
    title: "Workshop Logistics",
    description: "A practical briefing for event operations.",
    room: "Atrium",
    track: "Operations",
    presenter: "Morgan Reed",
    presenterCompany: "Venue Works",
    company: "Event Co",
    startsAt: "2026-06-01T09:00:00.000Z",
    endsAt: "2026-06-01T10:00:00.000Z",
    status: "scheduled",
    statusMessage: null,
    externalSyncConfigId: null,
    externalId: null,
    manualOverride: false,
  },
  {
    id: "agenda-search-cells",
    clientId: SITE_ID,
    title: "Platform Strategy",
    description: "A multi-cell search fixture.",
    room: "Blue Hall",
    track: "Product",
    presenter: "Ada Lovelace",
    presenterCompany: "Analytical Engines",
    company: "Event Co",
    startsAt: "2026-06-01T11:00:00.000Z",
    endsAt: "2026-06-01T12:00:00.000Z",
    status: "scheduled",
    statusMessage: null,
    externalSyncConfigId: null,
    externalId: null,
    manualOverride: false,
  },
  {
    id: "agenda-search-other",
    clientId: SITE_ID,
    title: "Closing Reception",
    description: "Networking and final announcements.",
    room: "Garden",
    track: "Community",
    presenter: "Taylor Kim",
    presenterCompany: "Gatherings",
    company: "Event Co",
    startsAt: "2026-06-01T15:00:00.000Z",
    endsAt: "2026-06-01T16:00:00.000Z",
    status: "scheduled",
    statusMessage: null,
    externalSyncConfigId: null,
    externalId: null,
    manualOverride: false,
  },
];

const NOW = new Date();
const ACTIVE_START = new Date(NOW.getTime() - 10 * 60_000).toISOString();
const ACTIVE_END = new Date(NOW.getTime() + 50 * 60_000).toISOString();

const SCREEN_FIXTURES = [
  {
    id: "screen-scheduled",
    clientId: SITE_ID,
    name: "Scheduled Report Screen",
    location: "Main Lobby",
    timezone: "UTC",
    displayProfileId: "profile-16x9",
    pairingCode: null,
    kioskModeEnabled: false,
    deviceToken: null,
    isPaired: true,
    isOnline: true,
    lastSeen: ACTIVE_START,
    ipAddress: null,
    hostname: null,
    hardwareClass: null,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasWidth: null,
    canvasHeight: null,
    canvasX: 0,
    canvasY: 0,
    canvasGroupId: null,
    locked: false,
    screenshotEnabled: false,
    lastScreenshot: null,
    lastScreenshotAt: null,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    roomCapacity: null,
    weatherLat: null,
    weatherLng: null,
    weatherPlaceName: null,
    weatherUnit: "celsius",
    displayOrder: 0,
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
    videoStatsLastRecoveryAt: null,
    videoStatsUpdatedAt: null,
    createdAt: ACTIVE_START,
    updatedAt: ACTIVE_START,
  },
  {
    id: "screen-fallback-playlist",
    clientId: SITE_ID,
    name: "Fallback Playlist Screen",
    location: "Side Lobby",
    timezone: "UTC",
    displayProfileId: "profile-16x9",
    pairingCode: null,
    kioskModeEnabled: false,
    deviceToken: null,
    isPaired: true,
    isOnline: true,
    lastSeen: ACTIVE_START,
    fallbackLayoutId: null,
    fallbackPlaylistId: "playlist-fallback",
    canvasEnabled: false,
    canvasX: 0,
    canvasY: 0,
    locked: false,
    screenshotEnabled: false,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
  },
  {
    id: "screen-scheduled-playlist",
    clientId: SITE_ID,
    name: "Scheduled Playlist Screen",
    location: "Upper Lobby",
    timezone: "UTC",
    displayProfileId: "profile-16x9",
    pairingCode: null,
    kioskModeEnabled: false,
    deviceToken: null,
    isPaired: true,
    isOnline: true,
    lastSeen: ACTIVE_START,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasX: 0,
    canvasY: 0,
    locked: false,
    screenshotEnabled: false,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
  },
  {
    id: "screen-fallback-scene",
    clientId: SITE_ID,
    name: "Fallback Scene Screen",
    location: "Registration",
    timezone: "UTC",
    displayProfileId: "profile-16x9",
    pairingCode: null,
    kioskModeEnabled: false,
    deviceToken: null,
    isPaired: true,
    isOnline: true,
    lastSeen: ACTIVE_START,
    fallbackLayoutId: "layout-fallback-scene",
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasX: 0,
    canvasY: 0,
    locked: false,
    screenshotEnabled: false,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
  },
  {
    id: "screen-live-override",
    clientId: SITE_ID,
    name: "Live Override Screen",
    location: "Stage",
    timezone: "UTC",
    displayProfileId: "profile-16x9",
    pairingCode: null,
    kioskModeEnabled: false,
    deviceToken: null,
    isPaired: true,
    isOnline: true,
    lastSeen: ACTIVE_START,
    fallbackLayoutId: null,
    fallbackPlaylistId: null,
    canvasEnabled: false,
    canvasX: 0,
    canvasY: 0,
    locked: false,
    screenshotEnabled: false,
    testPatternEnabled: false,
    showLiveBanner: false,
    hideNoContentMessage: false,
    videoStatsStalls: 0,
    videoStatsRecoveries: 0,
    videoStatsReloads: 0,
  },
];

const PLAYBACK_FIXTURES: Record<string, unknown> = {
  "screen-scheduled": {
    now: NOW.toISOString(),
    activeEvent: { id: "event-conference", name: "Conference Event" },
    block: {
      kind: "playing",
      blockId: "block-schedule-timeline",
      blockName: "Schedule Timeline",
      endsAt: ACTIVE_END,
    },
    nextBooking: null,
    resolvedContent: {
      source: "block",
      type: "layout",
      id: "layout-scheduled-scene",
      name: "Scheduled Scene",
      activeEvent: { id: "event-conference", name: "Conference Event" },
      programme: { id: "programme-main", name: "Main Programme" },
      version: { id: "version-main", versionNumber: 1 },
      block: { id: "block-schedule-timeline", name: "Schedule Timeline" },
      activeProgramme: { id: "programme-main", name: "Main Programme" },
      activeVersion: { id: "version-main", versionNumber: 1 },
      activeBlock: { id: "block-schedule-timeline", name: "Schedule Timeline" },
      currentEffectiveEnd: ACTIVE_END,
      nextBlock: null,
      nextStart: null,
    },
  },
  "screen-fallback-playlist": {
    now: NOW.toISOString(),
    activeEvent: null,
    block: { kind: "noEvent" },
    nextBooking: null,
    resolvedContent: {
      source: "fallback-playlist",
      type: "playlist",
      id: "playlist-fallback",
      name: "Lobby Fallback Playlist",
      activeEvent: null,
      programme: null,
      version: null,
      block: null,
      activeProgramme: null,
      activeVersion: null,
      activeBlock: null,
      currentEffectiveEnd: null,
      nextBlock: null,
      nextStart: null,
    },
  },
  "screen-scheduled-playlist": {
    now: NOW.toISOString(),
    activeEvent: { id: "event-conference", name: "Conference Event" },
    block: {
      kind: "playing",
      blockId: "block-scheduled-playlist",
      blockName: "Schedule Playlist Timeline",
      endsAt: ACTIVE_END,
    },
    nextBooking: null,
    resolvedContent: {
      source: "block",
      type: "playlist",
      id: "playlist-scheduled",
      name: "Scheduled Playlist",
      activeEvent: { id: "event-conference", name: "Conference Event" },
      programme: { id: "programme-main", name: "Main Programme" },
      version: { id: "version-main", versionNumber: 1 },
      block: { id: "block-scheduled-playlist", name: "Schedule Playlist Timeline" },
      activeProgramme: { id: "programme-main", name: "Main Programme" },
      activeVersion: { id: "version-main", versionNumber: 1 },
      activeBlock: { id: "block-scheduled-playlist", name: "Schedule Playlist Timeline" },
      currentEffectiveEnd: ACTIVE_END,
      nextBlock: null,
      nextStart: null,
    },
  },
  "screen-fallback-scene": {
    now: NOW.toISOString(),
    activeEvent: null,
    block: { kind: "noEvent" },
    nextBooking: null,
    resolvedContent: {
      source: "fallback-layout",
      type: "layout",
      id: "layout-fallback-scene",
      name: "Fallback Scene",
      activeEvent: null,
      programme: null,
      version: null,
      block: null,
      activeProgramme: null,
      activeVersion: null,
      activeBlock: null,
      currentEffectiveEnd: null,
      nextBlock: null,
      nextStart: null,
    },
  },
  "screen-live-override": {
    now: NOW.toISOString(),
    activeEvent: { id: "event-conference", name: "Conference Event" },
    block: {
      kind: "playing",
      blockId: "block-live",
      blockName: "Live Override Block",
      endsAt: ACTIVE_END,
    },
    nextBooking: null,
    resolvedContent: {
      source: "live-override",
      type: "layout",
      id: "layout-live-override",
      name: "Live Override Scene",
      activeEvent: { id: "event-conference", name: "Conference Event" },
      programme: null,
      version: null,
      block: { id: "block-live", name: "Live Override Block" },
      activeProgramme: null,
      activeVersion: null,
      activeBlock: { id: "block-live", name: "Live Override Block" },
      currentEffectiveEnd: ACTIVE_END,
      nextBlock: null,
      nextStart: null,
    },
  },
};

const LIVE_OVERRIDE = {
  id: "override-live",
  eventId: "event-conference",
  name: "Live Override Scene",
  priority: 100,
  targets: [{ type: "screen", id: "screen-live-override" }],
  layoutTemplateId: "layout-live-override",
  zoneSources: [],
  startTime: ACTIVE_START,
  endTime: ACTIVE_END,
  isActive: true,
  presetId: null,
  createdById: "test-admin",
  createdAt: ACTIVE_START,
};

async function json(route: Route, body: unknown, delayMs = 0) {
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installReadOnlyFixtures(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.continue();
    const url = new URL(request.url());

    if (url.pathname === "/api/agenda") {
      return json(route, AGENDA_ITEMS, 80);
    }
    if (url.pathname === "/api/agenda/sync-configs") {
      return json(route, []);
    }
    if (url.pathname === "/api/clients") {
      return json(route, [ADMIN_SITE]);
    }
    if (url.pathname === "/api/screens") {
      return json(route, SCREEN_FIXTURES);
    }
    const playbackMatch = url.pathname.match(/^\/api\/screens\/([^/]+)\/playback$/);
    if (playbackMatch) {
      return json(route, PLAYBACK_FIXTURES[playbackMatch[1]]);
    }
    if (url.pathname === "/api/display-profiles") {
      return json(route, [{
        id: "profile-16x9",
        clientId: SITE_ID,
        name: "Full HD",
        width: 1920,
        height: 1080,
        orientation: "landscape",
        safePadding: 0,
        screenType: "standard",
        refreshRate: 60,
        createdAt: ACTIVE_START,
      }]);
    }
    if (url.pathname === "/api/canvas-groups") return json(route, []);
    if (url.pathname === "/api/events") {
      return json(route, [{
        id: "event-conference",
        clientId: SITE_ID,
        name: "Conference Event",
        startDate: ACTIVE_START,
        endDate: ACTIVE_END,
      }]);
    }
    if (url.pathname === "/api/layouts") {
      return json(route, [
        { id: "layout-scheduled-scene", clientId: SITE_ID, name: "Scheduled Scene", zones: [] },
        { id: "layout-fallback-scene", clientId: SITE_ID, name: "Fallback Scene", zones: [] },
        { id: "layout-live-override", clientId: SITE_ID, name: "Live Override Scene", zones: [] },
      ]);
    }
    if (url.pathname === "/api/playlists") {
      return json(route, [{
        id: "playlist-fallback",
        clientId: SITE_ID,
        name: "Lobby Fallback Playlist",
        description: null,
      }]);
    }
    if (url.pathname === "/api/live-overrides") return json(route, [LIVE_OVERRIDE]);
    if (url.pathname === "/api/player-display-settings") {
      return json(route, { globalHideNoContentMessage: false });
    }
    return route.continue();
  });
}

async function findAdminEmail(): Promise<string> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
  try {
    const db = drizzle(pool, { schema: { users } });
    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`)
      .limit(1);
    if (!row) throw new Error("No active admin user found in DB.");
    return row.email;
  } finally {
    await pool.end();
  }
}

async function loginAsTestUser(page: Page, email: string) {
  const response = await page.request.post("/api/auth/test-login", {
    data: { email },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  expect(response.status(), `test-login failed: ${await response.text()}`).toBe(200);
}

test.describe("Agenda search and Screens playback reporting", () => {
  test("searches Agenda and keeps Screens playback reports identical across views", async ({ page }) => {
    const adminEmail = await findAdminEmail();
    await loginAsTestUser(page, adminEmail);
    await page.addInitScript((siteId) => {
      localStorage.setItem("vectormesh_selected_client_id", siteId);
      localStorage.removeItem("vectormesh:screens-view");
    }, SITE_ID);
    await installReadOnlyFixtures(page);

    await page.goto("/agenda", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("agenda-search-count")).toContainText("Showing 3 of 3");
    await expect(page.getByTestId("input-agenda-search")).toBeVisible();
    await page.getByTestId("button-agenda-view-cards").click();
    await expect(page.getByTestId("agenda-items-card-view")).toBeVisible();

    const agendaIds = async (rowPrefix: "agenda-item-row-" | "agenda-item-table-row-") =>
      page.locator(`[data-testid^="${rowPrefix}"]`).evaluateAll((rows, prefix: string) =>
        rows.map((row) => row.getAttribute("data-testid")!.slice(prefix.length)),
      rowPrefix);
    const allAgendaIds = [
      "agenda-search-room",
      "agenda-search-cells",
      "agenda-search-other",
    ];

    // Non-title match: "Atrium" exists only in the room cell.
    await page.getByTestId("input-agenda-search").fill("Atrium");
    await expect(page.getByTestId("agenda-search-count")).toHaveText("1 matching item(s)");
    await expect(page.getByTestId("agenda-item-row-agenda-search-room")).toBeVisible();
    await expect(page.getByTestId("agenda-item-row-agenda-search-cells")).toBeHidden();
    const nonTitleCardIds = await agendaIds("agenda-item-row-");
    expect(nonTitleCardIds).toEqual(["agenda-search-room"]);

    // Switching to the new table view preserves the query and the exact
    // filtered item identity/order, then switching back does the same.
    await page.getByTestId("button-agenda-view-table").click();
    await expect(page.getByTestId("agenda-items-table-view")).toBeVisible();
    await expect(page.getByTestId("input-agenda-search")).toHaveValue("Atrium");
    const nonTitleTableIds = await agendaIds("agenda-item-table-row-");
    expect(nonTitleTableIds).toEqual(nonTitleCardIds);
    await page.getByTestId("button-agenda-view-cards").click();
    await expect(page.getByTestId("agenda-items-card-view")).toBeVisible();
    await expect(page.getByTestId("input-agenda-search")).toHaveValue("Atrium");
    expect(await agendaIds("agenda-item-row-")).toEqual(nonTitleCardIds);

    // Every term must match somewhere in the row, not necessarily in title.
    await page.getByTestId("input-agenda-search").fill("Ada Blue");
    await expect(page.getByTestId("agenda-search-count")).toHaveText("1 matching item(s)");
    await expect(page.getByTestId("agenda-item-row-agenda-search-cells")).toBeVisible();
    await expect(page.getByTestId("agenda-item-row-agenda-search-room")).toBeHidden();
    const multiTermCardIds = await agendaIds("agenda-item-row-");
    expect(multiTermCardIds).toEqual(["agenda-search-cells"]);

    await page.getByTestId("button-agenda-view-table").click();
    await expect(page.getByTestId("agenda-items-table-view")).toBeVisible();
    await expect(page.getByTestId("input-agenda-search")).toHaveValue("Ada Blue");
    const multiTermTableIds = await agendaIds("agenda-item-table-row-");
    expect(multiTermTableIds).toEqual(multiTermCardIds);

    // With no matching rows the shared empty state is used regardless of the
    // selected view; clearing from table mode restores the table rows.
    await page.getByTestId("input-agenda-search").fill("definitely-no-agenda-match");
    await expect(page.getByTestId("agenda-search-count")).toHaveText("0 matching item(s)");
    await expect(page.getByText("No agenda items match your search")).toBeVisible();
    await expect(page.getByTestId("agenda-items-table-view")).toHaveCount(0);
    await expect(page.getByTestId("button-agenda-view-table")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("button-clear-agenda-search").click();
    await expect(page.getByTestId("agenda-search-count")).toHaveText("Showing 3 of 3 item(s)");
    await expect(page.getByTestId("agenda-items-table-view")).toBeVisible();
    expect(await agendaIds("agenda-item-table-row-")).toEqual(allAgendaIds);

    // Repeat the empty/clear path in card mode as well.
    await page.getByTestId("button-agenda-view-cards").click();
    await page.getByTestId("input-agenda-search").fill("definitely-no-agenda-match");
    await expect(page.getByTestId("agenda-search-count")).toHaveText("0 matching item(s)");
    await expect(page.getByText("No agenda items match your search")).toBeVisible();
    await expect(page.getByTestId("agenda-items-card-view")).toHaveCount(0);
    await expect(page.getByTestId("button-agenda-view-cards")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("button-clear-agenda-search").click();
    await expect(page.getByTestId("agenda-search-count")).toHaveText("Showing 3 of 3 item(s)");
    await expect(page.getByTestId("agenda-items-card-view")).toBeVisible();
    expect(await agendaIds("agenda-item-row-")).toEqual(allAgendaIds);

    await page.goto("/screens", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("text-screens-title")).toBeVisible();
    await expect(page.getByTestId("grid-screen-cards")).toBeVisible();

    const playbackReports = [
      { id: "screen-scheduled", name: "Scheduled Scene", type: "Scene", source: "Scheduled" },
      {
        id: "screen-scheduled-playlist",
        name: "Scheduled Playlist",
        type: "Playlist",
        source: "Scheduled",
      },
      {
        id: "screen-fallback-playlist",
        name: "Lobby Fallback Playlist",
        type: "Playlist",
        source: "Fallback",
      },
      { id: "screen-fallback-scene", name: "Fallback Scene", type: "Scene", source: "Fallback" },
      {
        id: "screen-live-override",
        name: "Live Override Scene",
        type: "Scene",
        source: "Live Override",
      },
    ] as const;

    const assertPlaybackReport = async (
      scope: Page | Locator,
      report: (typeof playbackReports)[number],
    ) => {
      await expect(scope.getByTestId(`text-screen-now-displaying-${report.id}`))
        .toContainText(report.name);
      await expect(scope.getByTestId(`text-screen-content-type-${report.id}`))
        .toBeVisible();
      await expect(scope.getByTestId(`text-screen-content-type-${report.id}`))
        .toHaveText(`Type: ${report.type}`, { exact: true });
      await expect(scope.getByTestId(`text-screen-content-source-${report.id}`))
        .toBeVisible();
      await expect(scope.getByTestId(`text-screen-content-source-${report.id}`))
        .toHaveText(`Source: ${report.source}`, { exact: true });
    };

    for (const report of playbackReports) {
      await assertPlaybackReport(page, report);
    }
    await expect(page.getByTestId("text-screen-now-playing-screen-scheduled"))
      .toContainText("Schedule Timeline");
    await expect(page.getByTestId("text-screen-now-playing-screen-scheduled"))
      .toContainText("Conference Event");

    await page.getByTestId("button-view-table").click();
    await expect(page.getByTestId("table-screens")).toBeVisible();
    for (const report of playbackReports) {
      const row = page.getByTestId(`row-screen-${report.id}`);
      await assertPlaybackReport(row, report);
    }
    await expect(page.getByText(/Unable to load playback/)).toHaveCount(0);

    // The same server-derived values are present after the existing view
    // switch, rather than cards and table deriving different reports.
    await expect(page.getByTestId("row-screen-screen-scheduled")
      .getByTestId("text-screen-now-displaying-screen-scheduled"))
      .toContainText("Scheduled Scene");
    await expect(page.getByTestId("row-screen-screen-scheduled")
      .getByTestId("text-screen-now-playing-screen-scheduled"))
      .toContainText("Schedule Timeline");
  });
});
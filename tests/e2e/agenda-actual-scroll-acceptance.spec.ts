/**
 * Browser acceptance coverage for the actual Agenda reveal, rather than only
 * its pagination model.  This intentionally observes production transforms
 * and Range geometry; it never writes offsets, disables transitions, or
 * substitutes a fake ResizeObserver.
 *
 * The fixture uses a single intentionally overlong card.  Keeping one card
 * active makes timing diagnostics useful: if the reveal starts over, the
 * transform visibly returns to zero while the normal content poll continues.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray, like, sql } from "drizzle-orm";
import {
  agendaItems, agendaWidgetConfigs, auditLogs, clients, displayProfiles, events,
  layoutTemplates, mediaAssets, playlistItems, playlists, programmeVersions,
  programmes, scheduleBlocks, screens, screenEventBookings, users,
} from "../../shared/schema";
import { readFileSync } from "node:fs";
import path from "node:path";

const MARK = "ZZTEST-ACTUAL-SCROLL-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const ADMIN_EMAIL = `${PREFIX.toLowerCase()}admin@example.test`;
const now = new Date("2031-07-04T09:00:00Z");
const descriptionFinal = `${MARK}DESCRIPTION-FINAL-LINE`;
const presenterFinal = `${MARK}PRESENTER-COMPANY-FINAL-LINE`;
const video = readFileSync(path.resolve("tests/e2e/fixtures/tiny-loop.webm"));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: {
    agendaItems, agendaWidgetConfigs, auditLogs, clients, displayProfiles, events,
    layoutTemplates, mediaAssets, playlistItems, playlists, programmeVersions,
    programmes, scheduleBlocks, screens, screenEventBookings, users,
  },
});

type Seed = {
  clientId: string;
  configId: string;
  sceneId: string;
  playlistId: string;
  screenId: string;
  token: string;
  assetId: string;
  sceneName: string;
};

async function cleanup() {
  const ownedUsers = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, ADMIN_EMAIL));
  if (ownedUsers.length) {
    await db.delete(auditLogs).where(
      inArray(auditLogs.userId, ownedUsers.map((row) => row.id)),
    );
  }
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `${MARK}%`));
  await db.delete(agendaItems).where(like(agendaItems.title, `${MARK}%`));
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${MARK}%`));
  await db.delete(playlistItems).where(sql`${playlistItems.playlistId} in
    (select id from playlists where name like ${`${MARK}%`})`);
  await db.delete(playlists).where(like(playlists.name, `${MARK}%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${MARK}%`));
  await db.delete(mediaAssets).where(like(mediaAssets.name, `${MARK}%`));
  await db.delete(screenEventBookings).where(sql`${screenEventBookings.screenId} in
    (select id from screens where name like ${`${MARK}%`})`);
  await db.delete(events).where(like(events.name, `${MARK}%`));
  await db.delete(screens).where(like(screens.name, `${MARK}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${MARK}%`));
  await db.delete(clients).where(like(clients.name, `${MARK}%`));
  await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
}

function repeatedLines(label: string, count: number, suffix: string) {
  return Array.from({ length: count }, (_, index) =>
    `${label} ${index + 1}: deliberately overflowing browser acceptance content ` +
    "keeps its authored order and must remain observable while it reveals",
  ).concat(suffix).join("\n");
}

async function seed(): Promise<Seed> {
  const [{ id: clientId }] = await db.insert(clients)
    .values({ name: `${PREFIX}site` })
    .returning({ id: clients.id });
  const [{ id: profileId }] = await db.insert(displayProfiles)
    .values({
      clientId, name: `${PREFIX}portrait`, width: 1080, height: 1920,
    })
    .returning({ id: displayProfiles.id });
  const [{ id: configId }] = await db.insert(agendaWidgetConfigs)
    .values({
      clientId,
      name: `${PREFIX}scroll-agenda`,
      displayMode: "full",
      layoutMode: "portrait",
      maxItemsPerPage: 1,
      rotationIntervalSeconds: 3,
      refreshIntervalSeconds: 5,
      showEventName: true,
      eventName: `${PREFIX}event`,
      showPresenter: true,
      showPresenterCompany: true,
      presenterVisibleLines: 2,
      showDescription: true,
      descriptionLines: null,
      descriptionAutoScroll: true,
      showSessionCount: true,
      showRoom: false,
      showTrack: false,
      showStatus: false,
      showDuration: false,
    })
    .returning({ id: agendaWidgetConfigs.id });
  await db.insert(agendaItems).values({
    id: `${PREFIX}scroll-item`,
    clientId,
    title: `${MARK}Overlong session`,
    description: repeatedLines("Description", 80, descriptionFinal),
    presenter: repeatedLines("Presenter", 4, presenterFinal),
    presenterCompany: repeatedLines("Company affiliation", 3, presenterFinal),
    startsAt: new Date(now.getTime() - 3_600_000),
    endsAt: new Date(now.getTime() + 3_600_000),
    status: "scheduled",
    sortOrder: 0,
  });
  const [{ id: sceneId }] = await db.insert(layoutTemplates)
    .values({
      clientId,
      name: `${PREFIX}portrait-scroll-scene`,
      aspectRatio: "9:16",
      zones: [{
        id: "agenda",
        name: "Scrolling Agenda",
        type: "agenda",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 1,
        agendaConfigId: configId,
      }],
    })
    .returning({ id: layoutTemplates.id });
  const [{ id: assetId }] = await db.insert(mediaAssets)
    .values({
      clientId,
      name: `${PREFIX}video`,
      originalPath: `${PREFIX}.webm`,
      mediaType: "video",
      mimeType: "video/webm",
      duration: 1,
    })
    .returning({ id: mediaAssets.id });
  const [{ id: playlistId }] = await db.insert(playlists)
    .values({ clientId, name: `${PREFIX}playlist` })
    .returning({ id: playlists.id });
  await db.insert(playlistItems).values({
    playlistId, layoutTemplateId: sceneId, order: 0, duration: 120,
  });
  const [{ id: eventId }] = await db.insert(events)
    .values({
      clientId,
      name: `${PREFIX}event`,
      startDate: new Date(now.getTime() - 86_400_000),
      endDate: new Date(now.getTime() + 86_400_000),
    })
    .returning({ id: events.id });
  const [{ id: programmeId }] = await db.insert(programmes)
    .values({ eventId, name: `${PREFIX}programme` })
    .returning({ id: programmes.id });
  const [{ id: versionId }] = await db.insert(programmeVersions)
    .values({
      programmeId, versionNumber: 1, status: "published", publishedAt: new Date(),
    })
    .returning({ id: programmeVersions.id });
  const token = `${PREFIX}device`;
  const [{ id: screenId }] = await db.insert(screens)
    .values({
      clientId,
      name: `${PREFIX}screen`,
      displayProfileId: profileId,
      deviceToken: token,
      isPaired: true,
      isOnline: true,
      fallbackPlaylistId: playlistId,
    })
    .returning({ id: screens.id });
  await db.insert(screenEventBookings).values({
    screenId,
    eventId,
    startsAt: new Date(now.getTime() - 86_400_000),
    endsAt: new Date(now.getTime() + 86_400_000),
  });
  await db.insert(scheduleBlocks).values({
    programmeVersionId: versionId,
    name: `${PREFIX}scheduled-scene`,
    layoutTemplateId: sceneId,
    targets: [{ type: "screen", id: screenId }],
    timeRules: [{ startDate: "2031-07-03", endDate: "2031-07-05" }],
    zoneSources: [],
  });
  return {
    clientId, configId, sceneId, playlistId, screenId, token, assetId,
    sceneName: `${PREFIX}portrait-scroll-scene`,
  };
}

async function seedAdmin() {
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    firstName: "Actual Scroll",
    lastName: "Acceptance",
    role: "admin",
    isActive: true,
    mustChangePassword: false,
    twoFactorEnabled: true,
    // Test-only nonempty marker: the test-login route accepts this seeded
    // account without needing a real credential.
    passwordHash: `${PREFIX}test-only-password-hash`,
  });
}

async function login(page: Page) {
  const response = await page.request.post("/api/auth/test-login", {
    data: { email: ADMIN_EMAIL },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  const body = await response.text();
  expect(response.status(), `test-login failed: ${body}`).toBe(200);
  expect(response.headers()["content-type"] || "").toContain("application/json");
  expect(await page.context().cookies()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "connect.sid" }),
  ]));
}

type ScrollSnapshot = {
  id: string;
  descriptionElementTestId: string;
  descriptionViewportHeight: number;
  descriptionContentHeight: number;
  descriptionViewportMaxHeight: string;
  descriptionOverflow: number;
  presenterOverflow: number;
  descriptionOffset: number;
  presenterOffset: number;
  descriptionLastLineVisible: boolean;
  presenterLastLineVisible: boolean;
  authoredWidth: string;
  authoredHeight: string;
};

/**
 * The final-line Range check catches a clipped transform even when textContent
 * still contains the sentinel. It is also a useful diagnostic for a fixture
 * that loaded too early (overflow is zero, not an application scroll failure).
 */
async function readScrollSnapshot(page: Page, rootTestId: string): Promise<ScrollSnapshot | null> {
  return page.getByTestId(rootTestId).evaluate((root) => {
    const findVisible = (selector: string) =>
      [...root.querySelectorAll<HTMLElement>(selector)].find((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" &&
          element.getClientRects().length > 0;
      }) ?? null;
    const translateY = (element: HTMLElement | null) => {
      if (!element) return 0;
      const value = getComputedStyle(element).transform;
      if (value === "none") return 0;
      try {
        return new DOMMatrixReadOnly(value).m42;
      } catch {
        return 0;
      }
    };
    const finalLineVisible = (content: HTMLElement | null, viewport: HTMLElement | null) => {
      if (!content || !viewport) return false;
      let node: Node | null = content;
      while (node?.lastChild) node = node.lastChild;
      if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
      const range = document.createRange();
      const end = node.textContent.length;
      range.setStart(node, Math.max(0, end - 24));
      range.setEnd(node, end);
      const text = [...range.getClientRects()].at(-1);
      if (!text) return false;
      const box = viewport.getBoundingClientRect();
      return text.bottom > box.top + 1 && text.top < box.bottom - 1;
    };
    const descViewport = findVisible("[data-testid^='agenda-description-viewport-']");
    // The passive indicator is rendered before the paragraph and its
    // data-testid also starts with agenda-description-. A prefix selector
    // therefore reads the track (whose scrollHeight equals the viewport) and
    // falsely reports zero overflow. Select the actual paragraph explicitly.
    const desc = descViewport
      ? [...descViewport.querySelectorAll<HTMLElement>("[data-testid]")]
        .find((element) => {
          const id = element.dataset.testid ?? "";
          return id.startsWith("agenda-description-") &&
            !id.startsWith("agenda-description-viewport-") &&
            !id.startsWith("agenda-description-scroll-");
        }) ?? null
      : null;
    const presenterViewport = findVisible("[data-testid^='agenda-presenter-viewport-']");
    const presenter = presenterViewport?.firstElementChild as HTMLElement | null;
    const title = findVisible("[data-testid^='agenda-title-']");
    if (!descViewport || !desc || !presenterViewport || !presenter || !title) return null;
    const ancestors: HTMLElement[] = [];
    let parent = root.parentElement;
    while (parent && ancestors.length < 8) {
      ancestors.push(parent);
      parent = parent.parentElement;
    }
    const logicalSurface = [
      root as HTMLElement,
      ...root.querySelectorAll<HTMLElement>("*"),
      ...ancestors,
    ].find((element) =>
      element.style.width === "1080px" && element.style.height === "1920px"
    );
    const descOverflow = Math.max(0, desc.scrollHeight - descViewport.clientHeight);
    const presenterOverflow = Math.max(0, presenter.scrollHeight - presenterViewport.clientHeight);
    // The production measurers use client/offset geometry after fonts and the
    // ResizeObserver pass settle. These values are diagnostics, not a second
    // pagination implementation in the test.
    return {
      id: title.dataset.testid?.replace("agenda-title-", "") ?? "",
      descriptionElementTestId: desc.dataset.testid ?? "",
      descriptionViewportHeight: descViewport.clientHeight,
      descriptionContentHeight: desc.scrollHeight,
      descriptionViewportMaxHeight: getComputedStyle(descViewport).maxHeight,
      descriptionOverflow: descOverflow,
      presenterOverflow,
      descriptionOffset: translateY(desc),
      presenterOffset: translateY(presenter),
      descriptionLastLineVisible: finalLineVisible(desc, descViewport),
      presenterLastLineVisible: finalLineVisible(presenter, presenterViewport),
      authoredWidth: logicalSurface?.style.width ?? "",
      authoredHeight: logicalSurface?.style.height ?? "",
    };
  });
}

async function waitForActualOverflow(page: Page, label: string, rootTestId: string) {
  await page.evaluate(() => document.fonts.ready);
  let last: ScrollSnapshot | null = null;
  try {
    await expect.poll(
      async () => {
        last = await readScrollSnapshot(page, rootTestId);
        return Boolean(
          last &&
          last.descriptionOverflow > 1 &&
          last.presenterOverflow > 1,
        );
      },
      {
        timeout: 30_000,
        intervals: [100, 250, 500, 1_000],
        message: `${label} must report font/layout/ResizeObserver overflow readiness`,
      },
    ).toBe(true);
  } catch (error) {
    throw new Error(
      `${label} overflow readiness failed; this is fixture timing only if fonts/layout ` +
      `were not settled. Last snapshot=${JSON.stringify(last)}`,
      { cause: error },
    );
  }
}

async function waitForRevealEnd(page: Page, label: string, rootTestId: string) {
  let last: ScrollSnapshot | null = null;
  try {
    await expect.poll(
      async () => {
        last = await readScrollSnapshot(page, rootTestId);
        if (!last) return false;
        return (
          last.descriptionOffset < -Math.max(1, last.descriptionOverflow - 3) &&
          last.presenterOffset < -Math.max(1, last.presenterOverflow - 3) &&
          last.descriptionLastLineVisible &&
          last.presenterLastLineVisible
        );
      },
      {
        timeout: 60_000,
        intervals: [100, 250, 500, 1_000],
        message: `${label} must reveal the final description and presenter/company lines`,
      },
    ).toBe(true);
  } catch (error) {
    throw new Error(`${label} reveal diagnostics: ${JSON.stringify(last)}`, { cause: error });
  }
}

async function waitForMovement(page: Page, label: string, rootTestId: string) {
  let last: ScrollSnapshot | null = null;
  await expect.poll(
    async () => {
      last = await readScrollSnapshot(page, rootTestId);
      return Boolean(
        last &&
        last.descriptionOffset < -1 &&
        last.presenterOffset < -1,
      );
    },
    {
      timeout: 20_000,
      intervals: [100, 250, 500],
      message: `${label} must observe both production transforms leaving the top`,
    },
  ).toBe(true);
  return last!;
}

async function assertRefreshDoesNotRestartReveal(
  page: Page,
  label: string,
  rootTestId: string,
  polls: () => number,
) {
  const pollBaseline = polls();
  const samples: ScrollSnapshot[] = [];
  await expect.poll(
    async () => {
      const snapshot = await readScrollSnapshot(page, rootTestId);
      if (snapshot) samples.push(snapshot);
      return polls() > pollBaseline && samples.length >= 2;
    },
    {
      timeout: 20_000,
      intervals: [100, 250, 500, 1_000],
      message: `${label} must observe an equivalent production refresh after movement`,
    },
  ).toBe(true);
  // This is the browser-level counterpart to the mounted lifecycle checks:
  // while an equivalent content poll arrives, neither active reveal may jump
  // back to its origin. A timeout above is a fixture/server timing failure;
  // a zero transform after a successful poll is an application defect.
  expect(
    samples.every((sample) =>
      sample.descriptionOffset < -1 && sample.presenterOffset < -1),
    `${label} equivalent refresh must not restart either reveal`,
  ).toBe(true);
}

function trackPolls(page: Page) {
  let count = 0;
  page.on("response", (response) => {
    const url = response.url();
    if (
      (response.status() === 200 || response.status() === 304) &&
      (/\/api\/player\/[^/]+\/content/.test(url) ||
        /\/api\/monitor\/[^/]+\/(?:content|presentation)/.test(url))
    ) count += 1;
  });
  return () => count;
}

async function openPlayer(browser: Browser, s: Seed) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const polls = trackPolls(page);
  await page.addInitScript(({ token, screenId }) => {
    localStorage.setItem("signage_device_token", token);
    localStorage.setItem("signage_screen_id", screenId);
  }, { token: s.token, screenId: s.screenId });
  await page.route(`**/api/player/media/${s.assetId}/file*`, (route) =>
    route.fulfill({ status: 200, contentType: "video/webm", body: video }));
  await page.goto(`/player?at=${encodeURIComponent(now.toISOString())}`, { waitUntil: "commit" });
  await expect(page.getByTestId("screen-render-committed-frame")).toBeVisible({ timeout: 30_000 });
  return { context, page, polls };
}

async function openMonitor(browser: Browser, s: Seed) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await login(page);
  const polls = trackPolls(page);
  const create = await page.request.post(`/api/operations/screens/${s.screenId}/monitor-session`, {
    data: { clientType: "multiview", clientName: `${MARK}monitor` },
  });
  expect(create.status(), await create.text()).toBe(201);
  const monitorUrl = new URL((await create.json()).monitorUrl);
  monitorUrl.searchParams.set("at", now.toISOString());
  await page.goto(
    `${process.env.E2E_BASE_URL || "http://127.0.0.1:5000"}${monitorUrl.pathname}${monitorUrl.search}`,
    { waitUntil: "commit" },
  );
  await expect(page.getByTestId("screen-render-committed-frame")).toBeVisible({ timeout: 30_000 });
  return { context, page, polls };
}

async function openSimulator(browser: Browser, s: Seed) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await login(page);
  await page.goto(`/simulator?at=${now.toISOString()}`, { waitUntil: "commit" });
  const screenSelect = page.getByTestId("select-simulator-screen");
  await expect(screenSelect).toBeVisible({ timeout: 30_000 });
  await screenSelect.click();
  await page.getByRole("option", { name: `${PREFIX}screen`, exact: false }).click();
  await page.getByTestId("select-simulator-layout").click();
  await page.getByRole("option", { name: `${s.sceneName} (1 zones)`, exact: true }).click();
  await expect(page.getByTestId("player-display")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

type CardRevealSnapshot = {
  cardScrollTop: number;
  cardOverflow: number;
  cardClientHeight: number;
  cardScrollHeight: number;
  cardMaxHeight: string;
  cardOverflowY: string;
  cardContained: boolean;
  cardTransformY: number;
  innerViewportCount: number;
  nonIdentityTransforms: string[];
  presenterOverflow: number;
  presenterOffset: number;
  presenterTransformY: number;
  presenterFirstReadable: boolean;
  presenterIntermediateReadable: boolean;
  presenterFinalReadable: boolean;
  statusFinalReadable: boolean;
};

/**
 * Read the two independent reveal surfaces without changing either one. The
 * row's own scrollTop is the whole-card contract; the presenter offset is the
 * nested contract. Range geometry is used for readability because textContent
 * remains present while an ancestor clips it.
 */
async function readCardRevealSnapshot(
  page: Page,
  itemId: string,
): Promise<CardRevealSnapshot> {
  return page.getByTestId(`agenda-row-${itemId}`).evaluate((card) => {
    const element = card as HTMLElement;
    const root = element.closest<HTMLElement>("[data-testid='agenda-display-root']");
    const transformY = (node: HTMLElement | null) => {
      if (!node) return 0;
      const value = getComputedStyle(node).transform;
      if (value === "none") return 0;
      try {
        return new DOMMatrixReadOnly(value).m42;
      } catch {
        return 0;
      }
    };
    const nonIdentityTransforms = [element, ...element.querySelectorAll<HTMLElement>("*")]
      .map((node) => {
        const value = getComputedStyle(node).transform;
        if (value === "none") return null;
        try {
          const matrix = new DOMMatrixReadOnly(value);
          return Math.abs(matrix.a - 1) < 0.001 &&
            Math.abs(matrix.d - 1) < 0.001 &&
            Math.abs(matrix.b) < 0.001 &&
            Math.abs(matrix.c) < 0.001 &&
            Math.abs(matrix.e) < 0.001 &&
            Math.abs(matrix.f) < 0.001
            ? null
            : value;
        } catch {
          return value;
        }
      })
      .filter((value): value is string => value != null);
    const cardRect = element.getBoundingClientRect();
    const readable = (node: HTMLElement | null, viewport: HTMLElement | null) => {
      if (!node || !viewport) return false;
      const rect = node.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      return rect.top >= viewportRect.top - 1.5 &&
        rect.bottom <= viewportRect.bottom + 1.5 &&
        rect.top >= cardRect.top - 1.5 &&
        rect.bottom <= cardRect.bottom + 1.5;
    };
    const presenterViewport = element.querySelector<HTMLElement>(
      "[data-testid^='agenda-presenter-viewport-']",
    );
    const presenter = presenterViewport?.firstElementChild as HTMLElement | null;
    const presenterRows = presenter
      ? [...presenter.querySelectorAll<HTMLElement>("[data-agenda-presenter-row]")]
      : [];
    const presenterOverflow = presenter && presenterViewport
      ? Math.max(0, presenter.scrollHeight - presenterViewport.clientHeight)
      : 0;
    const status = element.querySelector<HTMLElement>("[data-testid^='agenda-status-msg-']");
    const statusText = status?.lastChild;
    let statusFinalReadable = false;
    if (status && statusText?.nodeType === Node.TEXT_NODE && statusText.textContent) {
      const range = document.createRange();
      range.selectNodeContents(statusText);
      const finalLine = [...range.getClientRects()].at(-1);
      statusFinalReadable = Boolean(
        finalLine &&
        finalLine.top >= cardRect.top - 1.5 &&
        finalLine.bottom <= cardRect.bottom + 1.5,
      );
    }
    return {
      cardScrollTop: element.scrollTop,
      cardOverflow: Math.max(0, element.scrollHeight - element.clientHeight),
      cardClientHeight: element.clientHeight,
      cardScrollHeight: element.scrollHeight,
      cardMaxHeight: getComputedStyle(element).maxHeight,
      cardOverflowY: getComputedStyle(element).overflowY,
      cardContained: Boolean(
        root &&
        cardRect.bottom <= root.getBoundingClientRect().bottom + 1.5,
      ),
      cardTransformY: transformY(element),
      innerViewportCount: element.querySelectorAll(
        "[data-testid^='agenda-description-viewport-'], " +
        "[data-testid^='agenda-presenter-viewport-']",
      ).length,
      nonIdentityTransforms,
      presenterOverflow,
      presenterOffset: transformY(presenter),
      presenterTransformY: transformY(presenter),
      presenterFirstReadable: readable(presenterRows[0] ?? null, presenterViewport),
      presenterIntermediateReadable: readable(
        presenterRows[Math.floor(presenterRows.length / 2)] ?? null,
        presenterViewport,
      ),
      presenterFinalReadable: readable(presenterRows.at(-1) ?? null, presenterViewport),
      statusFinalReadable,
    };
  });
}

test.describe("actual Agenda scrolling acceptance", () => {
  let s: Seed;
  test.beforeAll(async () => {
    await cleanup();
    await seedAdmin();
    s = await seed();
  });
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("real Player and authenticated Monitor move identical description and presenter/company content", async ({ browser }) => {
    test.setTimeout(240_000);
    const player = await openPlayer(browser, s);
    const monitor = await openMonitor(browser, s);
    try {
      const surfaces = [
        ["Player", player.page, "screen-render-committed-frame", player.polls],
        ["Monitor", monitor.page, "screen-render-committed-frame", monitor.polls],
      ] as const;
      // Player is deliberately first: Monitor is authenticated and must
      // consume the same production screen payload, not a test-only widget.
      for (const [label, page, root, polls] of surfaces) {
        await waitForActualOverflow(page, label, root);
        const start = await waitForMovement(page, label, root);
        expect(start.id).toContain("scroll-item");
        expect(start.descriptionOffset).toBeLessThan(-1);
        expect(start.presenterOffset).toBeLessThan(-1);
        await assertRefreshDoesNotRestartReveal(page, label, root, polls);
        await waitForRevealEnd(page, label, root);
        const finish = await readScrollSnapshot(page, root);
        expect(finish, `${label} final snapshot`).not.toBeNull();
        expect(finish!.id).toBe(start.id);
        expect(finish!.descriptionLastLineVisible).toBe(true);
        expect(finish!.presenterLastLineVisible).toBe(true);
        expect(await page.locator("body").innerText()).toContain(descriptionFinal);
        expect(await page.locator("body").innerText()).toContain(presenterFinal);
        expect(polls(), `${label} must continue its production content polling`).toBeGreaterThan(1);
      }
      const playerFinal = await readScrollSnapshot(player.page, "screen-render-committed-frame");
      const monitorFinal = await readScrollSnapshot(monitor.page, "screen-render-committed-frame");
      expect(playerFinal).not.toBeNull();
      expect(monitorFinal).not.toBeNull();
      expect(monitorFinal!.id).toBe(playerFinal!.id);
      expect(monitorFinal!.descriptionOverflow).toBeCloseTo(playerFinal!.descriptionOverflow, 0);
      expect(monitorFinal!.presenterOverflow).toBeCloseTo(playerFinal!.presenterOverflow, 0);
      expect(monitorFinal!.descriptionOffset).toBeCloseTo(playerFinal!.descriptionOffset, 0);
      expect(monitorFinal!.presenterOffset).toBeCloseTo(playerFinal!.presenterOffset, 0);
      await expect(monitor.page.locator("body")).not.toContainText("Monitor session expired");
    } finally {
      await Promise.all([player.context.close(), monitor.context.close()]);
    }
  });

  test("Builder, direct Simulator, and playlist Simulator preserve the scroll lifecycle through an outer resize", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const builder = await context.newPage();
      await login(builder);
      await builder.goto("/layouts", { waitUntil: "commit" });
      await expect.poll(
        async () => (await builder.locator("h1,h2").allTextContents()).includes(s.sceneName),
        { timeout: 30_000, message: "Builder fixture scene must be available" },
      ).toBe(true);
      await builder.getByTestId("input-layout-preview-test-date").fill("2031-07-04T09:00");
      await expect(builder.getByTestId("interactive-layout-preview")).toBeVisible({ timeout: 20_000 });

      const simulator = await context.newPage();
      await login(simulator);
      await simulator.goto(`/simulator?at=${now.toISOString()}`, { waitUntil: "commit" });
      await simulator.getByTestId("select-simulator-screen").click();
      await simulator.getByRole("option", { name: `${PREFIX}screen`, exact: false }).click();
      await simulator.getByTestId("select-simulator-layout").click();
      await simulator.getByRole("option", { name: `${s.sceneName} (1 zones)`, exact: true }).click();
      await expect(simulator.getByTestId("player-display")).toBeVisible({ timeout: 20_000 });

      const playlist = await context.newPage();
      await login(playlist);
      await playlist.goto(
        `/simulator?playlistId=${s.playlistId}&at=${now.toISOString()}`,
        { waitUntil: "commit" },
      );
      await expect(playlist.getByTestId("player-display")).toBeVisible({ timeout: 20_000 });

      const surfaces = [
        ["Direct Simulator", simulator, "player-display"],
        ["Scene Builder", builder, "interactive-layout-preview"],
        ["Playlist Simulator", playlist, "player-display"],
      ] as const;
      const initial: Array<ScrollSnapshot> = [];
      let resizedId = "";
      for (const [label, page, root] of surfaces) {
        await waitForActualOverflow(page, label, root);
        const start = await waitForMovement(page, label, root);
        initial.push(start);
        if (label === "Direct Simulator") {
          // Resize immediately after movement so this assertion covers an
          // active lifecycle, rather than merely preserving a finished frame.
          const beforeResize = await readScrollSnapshot(simulator, root);
          expect(beforeResize).not.toBeNull();
          await simulator.setViewportSize({ width: 1_100, height: 800 });
          await expect.poll(
            async () => {
              const snapshot = await readScrollSnapshot(simulator, root);
              return snapshot && snapshot.authoredWidth === "1080px" &&
                snapshot.authoredHeight === "1920px" &&
                snapshot.id === beforeResize!.id &&
                snapshot.descriptionOffset < -1 &&
                snapshot.presenterOffset < -1;
            },
            {
              timeout: 20_000,
              intervals: [100, 250, 500],
              message: "Simulator resize must preserve logical scene and active scroll lifecycle",
            },
          ).toBeTruthy();
          const afterResize = await readScrollSnapshot(simulator, root);
          expect(afterResize!.descriptionOffset).toBeLessThan(-1);
          expect(afterResize!.presenterOffset).toBeLessThan(-1);
          resizedId = afterResize!.id;
          await waitForRevealEnd(simulator, "Resized Direct Simulator", root);
          const resizedFinish = await readScrollSnapshot(simulator, root);
          expect(resizedFinish!.descriptionLastLineVisible).toBe(true);
          expect(resizedFinish!.presenterLastLineVisible).toBe(true);
          continue;
        }
        await waitForRevealEnd(page, label, root);
        const finish = await readScrollSnapshot(page, root);
        expect(finish, `${label} final snapshot`).not.toBeNull();
        expect(finish!.id).toBe(start.id);
        expect(finish!.descriptionLastLineVisible).toBe(true);
        expect(finish!.presenterLastLineVisible).toBe(true);
      }

      await expect(simulator.locator("body")).not.toContainText(/fallback|invalid|error/i);
      // A normal content refresh may have occurred during the long reveal.
      // It must not reset the active page/transform: all equivalent surfaces
      // retained the same item and reached its final lines above.
      expect(resizedId).toBeTruthy();
      expect(initial.every((snapshot) => snapshot.id === resizedId)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("oversized Full card stays contained and reveals its bottom without description auto-scroll", async ({ browser }) => {
    test.setTimeout(120_000);
    await db.update(agendaWidgetConfigs).set({
      descriptionAutoScroll: false,
      showDescription: false,
      presenterVisibleLines: 20,
    }).where(eq(agendaWidgetConfigs.id, s.configId));
    await db.update(agendaItems).set({
      title: `${MARK}${" Oversized title content".repeat(60)}`,
      description: null,
      presenter: Array.from({ length: 30 }, (_, index) =>
        `Presenter ${index + 1}: ${"deliberately wide wrapped speaker name ".repeat(28)}`,
      ).join("\n"),
      presenterCompany: null,
    }).where(eq(agendaItems.id, `${PREFIX}scroll-item`));

    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      await login(page);
      await page.goto(`/simulator?at=${now.toISOString()}`, { waitUntil: "commit" });
      await page.getByTestId("select-simulator-screen").click();
      await page.getByRole("option", { name: `${PREFIX}screen`, exact: false }).click();
      await page.getByTestId("select-simulator-layout").click();
      await page.getByRole("option", { name: `${s.sceneName} (1 zones)`, exact: true }).click();

      const root = page.getByTestId("player-display");
      const card = page.getByTestId(`agenda-row-${PREFIX}scroll-item`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => card.evaluate((element) => {
        const rootElement = element.closest<HTMLElement>(
          "[data-testid='agenda-display-root']",
        );
        return Boolean(
          rootElement &&
          element.scrollHeight - element.clientHeight > 1 &&
          element.getBoundingClientRect().bottom <=
            rootElement.getBoundingClientRect().bottom + 1,
        );
      }), { timeout: 30_000 }).toBe(true);
      const ready = await card.evaluate((element) => ({
        overflow: element.scrollHeight - element.clientHeight,
        maxHeight: getComputedStyle(element).maxHeight,
      }));
      expect(ready.overflow).toBeGreaterThan(1);
      expect(ready.maxHeight).not.toBe("none");

      const settledHeights = new Set<number>();
      for (let index = 0; index < 8; index += 1) {
        settledHeights.add(await card.evaluate((element) => element.clientHeight));
        await page.waitForTimeout(250);
      }
      expect(settledHeights.size).toBe(1);
      await expect.poll(
        async () => card.evaluate((element) => element.scrollTop),
        { timeout: 20_000 },
      ).toBeGreaterThan(1);
      await expect.poll(
        async () => card.evaluate((element) =>
          element.scrollTop >= element.scrollHeight - element.clientHeight - 3),
        { timeout: 20_000 },
      ).toBe(true);
      await expect(root).not.toContainText(/invalid|error/i);
    } finally {
      await context.close();
    }
  });

  test("title/status-only card uses finite whole-card scrolling with no inner mechanism", async ({ browser }) => {
    test.setTimeout(120_000);
    await db.update(agendaWidgetConfigs).set({
      descriptionAutoScroll: false,
      showDescription: false,
      showPresenter: false,
      showPresenterCompany: false,
      showStatus: true,
      presenterVisibleLines: 2,
      titleScale: 2,
      bodyScale: 2,
    }).where(eq(agendaWidgetConfigs.id, s.configId));
    await db.update(agendaItems).set({
      // The portrait simulator's logical card is tall, so keep this fixture
      // deliberately beyond that finite allocation.  The authored fields are
      // still only title/status; the extra length is what makes the outer
      // scroll path measurable instead of relying on an inactive inner mode.
      title: `${MARK}TITLE-ONLY ${"long title content ".repeat(280)}${MARK}TITLE-FINAL`,
      description: null,
      presenter: null,
      presenterCompany: null,
      status: "delayed",
      statusMessage: `${MARK}STATUS-BEGIN ${"status detail ".repeat(120)}${MARK}STATUS-FINAL`,
    }).where(eq(agendaItems.id, `${PREFIX}scroll-item`));

    const { context, page } = await openSimulator(browser, s);
    try {
      const root = page.getByTestId("player-display");
      const card = page.getByTestId(`agenda-row-${PREFIX}scroll-item`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(root).toContainText(`${MARK}TITLE-FINAL`);
      await expect(root).toContainText(`${MARK}STATUS-FINAL`);
      await expect.poll(
        () => readCardRevealSnapshot(page, `${PREFIX}scroll-item`),
        {
          timeout: 30_000,
          intervals: [100, 250, 500, 1_000],
          message: "title/status-only card must settle into finite whole-card overflow",
        },
      ).toMatchObject({
        cardContained: true,
        innerViewportCount: 0,
        cardOverflowY: "auto",
      });
      const ready = await readCardRevealSnapshot(page, `${PREFIX}scroll-item`);
      expect(ready.cardOverflow).toBeGreaterThan(1);
      expect(ready.cardMaxHeight).not.toBe("none");
      expect(ready.nonIdentityTransforms).toEqual([]);

      const settledHeights = new Set<number>();
      for (let index = 0; index < 8; index += 1) {
        const snapshot = await readCardRevealSnapshot(page, `${PREFIX}scroll-item`);
        settledHeights.add(snapshot.cardClientHeight);
        expect(snapshot.cardContained).toBe(true);
        expect(snapshot.innerViewportCount).toBe(0);
        expect(snapshot.nonIdentityTransforms).toEqual([]);
        await page.waitForTimeout(250);
      }
      expect(settledHeights.size).toBe(1);
      await expect.poll(
        () => readCardRevealSnapshot(page, `${PREFIX}scroll-item`).then((snapshot) =>
          snapshot.cardScrollTop,
        ),
        { timeout: 30_000, intervals: [100, 250, 500, 1_000] },
      ).toBeGreaterThan(1);
      await expect.poll(
        () => readCardRevealSnapshot(page, `${PREFIX}scroll-item`).then((snapshot) =>
          snapshot.cardScrollTop >= snapshot.cardOverflow - 3 &&
          snapshot.statusFinalReadable,
        ),
        {
          timeout: 30_000,
          intervals: [100, 250, 500, 1_000],
          message: "whole-card scrollTop must advance to the bottom and reveal status",
        },
      ).toBe(true);
      const finish = await readCardRevealSnapshot(page, `${PREFIX}scroll-item`);
      expect(finish.cardScrollTop).toBeGreaterThanOrEqual(finish.cardOverflow - 3);
      expect(finish.cardContained).toBe(true);
      expect(finish.innerViewportCount).toBe(0);
      expect(finish.nonIdentityTransforms).toEqual([]);
      expect(finish.cardTransformY).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("whole-card reveal precedes the nested presenter reveal", async ({ browser }) => {
    test.setTimeout(240_000);
    await db.update(agendaWidgetConfigs).set({
      descriptionAutoScroll: false,
      showDescription: false,
      showPresenter: true,
      showPresenterCompany: false,
      showStatus: true,
      presenterVisibleLines: 2,
      titleScale: 2,
      bodyScale: null,
    }).where(eq(agendaWidgetConfigs.id, s.configId));
    await db.update(agendaItems).set({
      // The title is intentionally large enough to overflow the card's finite
      // share independently of the nested presenter viewport.
      title: `${MARK}OUTER-FIRST ${"title chrome that must reveal before presenters ".repeat(260)}${MARK}OUTER-FINAL`,
      description: null,
      presenter: Array.from({ length: 14 }, (_, index) =>
        `${MARK}INNER-${index === 0 ? "FIRST" : index === 13 ? "FINAL" : `ROW-${index + 1}`} ` +
        "presenter content remains readable in authored order",
      ).join("\n"),
      presenterCompany: null,
      status: "delayed",
      statusMessage: `${MARK}OUTER-STATUS`,
    }).where(eq(agendaItems.id, `${PREFIX}scroll-item`));

    const { context, page } = await openSimulator(browser, s);
    try {
      const root = page.getByTestId("player-display");
      const itemId = `${PREFIX}scroll-item`;
      const card = page.getByTestId(`agenda-row-${itemId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(root).toContainText(`${MARK}OUTER-FINAL`);
      await expect(root).toContainText(`${MARK}INNER-FINAL`);
      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) =>
          snapshot.cardOverflow > 1 &&
          snapshot.presenterOverflow > 1 &&
          snapshot.cardContained &&
          snapshot.cardMaxHeight !== "none",
        ),
        {
          timeout: 30_000,
          intervals: [100, 250, 500, 1_000],
          message: "presenter and card overflow must both settle after resize measurement",
        },
      ).toBe(true);

      // The first readable intermediate frame is intentionally outer-only:
      // the card has completed its own reveal before the nested presenter is
      // allowed to move. This encodes the production contract (card, then
      // presenter), not the earlier explorer ordering.
      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) =>
          snapshot.cardScrollTop >= snapshot.cardOverflow - 3 &&
          snapshot.presenterOffset > -1 &&
          snapshot.presenterFirstReadable &&
          !snapshot.presenterFinalReadable &&
          snapshot.cardTransformY === 0,
        ),
        {
          timeout: 90_000,
          intervals: [100, 250, 500, 1_000],
          message: "outer card reveal must produce an intermediate readable frame first",
        },
      ).toBe(true);
      const intermediate = await readCardRevealSnapshot(page, itemId);
      expect(intermediate.cardScrollTop).toBeGreaterThanOrEqual(intermediate.cardOverflow - 3);
      expect(intermediate.presenterOffset).toBeGreaterThan(-1);
      expect(intermediate.presenterFirstReadable).toBe(true);
      expect(intermediate.presenterFinalReadable).toBe(false);
      expect(intermediate.cardTransformY).toBe(0);

      // Replace the same item ID with deliberately equal-length content while
      // the staged reveal is active. The semantic generation must reset the
      // outer scrollTop and nested presenter transform immediately rather
      // than treating this as an equivalent poll.
      await db.update(agendaItems).set({
        title: `${MARK}RESET-FIRST ${"title chrome that must reveal before presenters ".repeat(260)}${MARK}RESET-FINAL`,
        presenter: Array.from({ length: 14 }, (_, index) =>
          `${MARK}RESET-${index === 0 ? "FIRST" : index === 13 ? "FINAL" : `ROW-${index + 1}`} ` +
          "presenter content remains readable in authored order",
        ).join("\n"),
      }).where(eq(agendaItems.id, `${PREFIX}scroll-item`));
      await expect(root).toContainText(`${MARK}RESET-FINAL`, { timeout: 30_000 });
      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) =>
          snapshot.cardScrollTop <= 1 &&
          snapshot.presenterOffset > -1 &&
          !snapshot.presenterFinalReadable,
        ),
        {
          timeout: 30_000,
          intervals: [100, 250, 500],
          message: "same-ID equal-height content must reset card and presenter to the top",
        },
      ).toBe(true);

      const finalSamples: CardRevealSnapshot[] = [];
      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) => {
          finalSamples.push(snapshot);
          return snapshot.presenterOffset < -1 &&
            snapshot.presenterFinalReadable &&
            snapshot.cardTransformY === 0;
        }),
        {
          timeout: 120_000,
          intervals: [100, 250, 500, 1_000],
          message: "presenter must eventually reach a readable final frame after outer reveal",
        },
      ).toBe(true);
      const finish = await readCardRevealSnapshot(page, itemId);
      expect(finish.presenterOffset).toBeLessThan(-1);
      expect(finish.presenterFinalReadable).toBe(true);
      expect(finish.cardTransformY).toBe(0);
      // Card scrollTop is a DOM scroll phase and may reset as the production
      // lifecycle hands control to the nested phase. The ordering proof above
      // is the completed outer snapshot followed by this eventual inner
      // snapshot; no CSS transform may be active on the card in either phase.
      expect(finalSamples.every((snapshot) => snapshot.cardTransformY === 0)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("reduced motion reveals an intermediate presenter frame before its final frame", async ({ browser }) => {
    test.setTimeout(120_000);
    await db.update(agendaWidgetConfigs).set({
      descriptionAutoScroll: false,
      showDescription: false,
      showPresenter: true,
      showPresenterCompany: false,
      showStatus: false,
      presenterVisibleLines: 2,
      titleScale: null,
      bodyScale: null,
    }).where(eq(agendaWidgetConfigs.id, s.configId));
    await db.update(agendaItems).set({
      title: `${MARK}REDUCED-MOTION-TITLE`,
      description: null,
      presenter: Array.from({ length: 20 }, (_, index) =>
        `${MARK}REDUCED-${index === 0 ? "FIRST" : index === 19 ? "FINAL" : `ROW-${index + 1}`} ` +
        "presenter text remains readable while reduced motion stages",
      ).join("\n"),
      presenterCompany: null,
      status: "scheduled",
      statusMessage: null,
    }).where(eq(agendaItems.id, `${PREFIX}scroll-item`));

    const { context, page } = await openSimulator(browser, s);
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "commit" });
      // Reload is deliberate: the preference must be observed by the mounted
      // production widget, rather than only by a test-side media override.
      await page.getByTestId("select-simulator-screen").click();
      await page.getByRole("option", { name: `${PREFIX}screen`, exact: false }).click();
      await page.getByTestId("select-simulator-layout").click();
      await page.getByRole("option", { name: `${s.sceneName} (1 zones)`, exact: true }).click();
      const itemId = `${PREFIX}scroll-item`;
      const card = page.getByTestId(`agenda-row-${itemId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) =>
          snapshot.cardOverflow <= 1 &&
          snapshot.presenterOverflow > 1 &&
          snapshot.presenterOffset > -1 &&
          snapshot.presenterFirstReadable,
        ),
        {
          timeout: 30_000,
          intervals: [100, 250, 500, 1_000],
          message: "reduced-motion presenter geometry must settle after resize measurement",
        },
      ).toBe(true);
      const initial = await readCardRevealSnapshot(page, itemId);
      expect(initial.cardOverflow).toBeLessThanOrEqual(1);
      expect(initial.presenterOffset).toBeGreaterThan(-1);

      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) =>
          snapshot.presenterOffset < -1 &&
          snapshot.presenterOffset > -(snapshot.presenterOverflow - 3) &&
          snapshot.presenterIntermediateReadable &&
          !snapshot.presenterFinalReadable &&
          snapshot.cardScrollTop === 0 &&
          snapshot.cardTransformY === 0,
        ),
        {
          timeout: 30_000,
          intervals: [100, 250, 500, 1_000],
          message: "reduced motion must expose staged intermediate presenter content",
        },
      ).toBe(true);
      const intermediate = await readCardRevealSnapshot(page, itemId);
      expect(intermediate.presenterFinalReadable).toBe(false);
      expect(intermediate.presenterIntermediateReadable).toBe(true);
      expect(intermediate.presenterOffset).toBeLessThan(-1);
      expect(intermediate.presenterOffset).toBeGreaterThan(
        -(intermediate.presenterOverflow - 3),
      );

      await expect.poll(
        () => readCardRevealSnapshot(page, itemId).then((snapshot) =>
          snapshot.presenterOffset <= -(snapshot.presenterOverflow - 3) &&
          snapshot.presenterFinalReadable &&
          snapshot.cardScrollTop === 0 &&
          snapshot.cardTransformY === 0,
        ),
        {
          timeout: 30_000,
          intervals: [100, 250, 500, 1_000],
          message: "reduced motion must eventually reveal the final presenter content",
        },
      ).toBe(true);
      const finish = await readCardRevealSnapshot(page, itemId);
      expect(finish.presenterFinalReadable).toBe(true);
      expect(finish.presenterOffset).toBeLessThanOrEqual(-(finish.presenterOverflow - 3));
      expect(finish.cardScrollTop).toBe(0);
      expect(finish.cardTransformY).toBe(0);
    } finally {
      await context.close();
    }
  });
});
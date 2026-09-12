/**
 * Acceptance coverage for the portrait Agenda pagination contract.
 *
 * This intentionally uses the same production routes as an operator: the
 * Scene Builder preview, Simulator scene and playlist modes, /player, and
 * the cookie-authenticated /monitor surface.  Only the media bytes are
 * intercepted; content and Agenda responses remain real.
 */
import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like, sql } from "drizzle-orm";
import {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, layoutTemplates,
  mediaAssets, playlistItems, playlists, programmeVersions, programmes,
  events, scheduleBlocks, screens, screenEventBookings, users,
} from "../../shared/schema";
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MARK = "ZZTEST-PAGINATION-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, layoutTemplates,
  mediaAssets, playlistItems, playlists, programmeVersions, programmes,
  events, scheduleBlocks, screens, screenEventBookings, users,
} });
const video = readFileSync(path.resolve("tests/e2e/fixtures/tiny-loop.webm"));
const titleWordCounts = [34, 50, 39, 39, 38, 42, 45, 75, 7, 9, 8];
const presenterWordCounts = [12, 8, 14, 10, 9, 13, 7, 15, 2, 3, 2];
const expected = [
  ["portrait-1", "portrait-2"], ["portrait-3", "portrait-4"],
  ["portrait-5", "portrait-6"], ["portrait-7", "portrait-8"],
  ["portrait-9", "portrait-10", "portrait-11"],
];
const globalPhaseOnly = process.env.AGENDA_GLOBAL_PHASE_ONLY === "1";

type Seed = {
  clientId: string; configId: string; sceneId: string; playlistId: string;
  screenId: string; token: string; assetId: string; sceneName: string;
  mismatchSceneName: string;
};

async function cleanup() {
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
}

async function seed(): Promise<Seed> {
  const [{ id: clientId }] = await db.insert(clients).values({ name: `${PREFIX}site` }).returning({ id: clients.id });
  const [{ id: profileId }] = await db.insert(displayProfiles).values({
    clientId, name: `${PREFIX}portrait`, width: 1080, height: 1920,
  }).returning({ id: displayProfiles.id });
  const [{ id: configId }] = await db.insert(agendaWidgetConfigs).values({
    clientId, name: `${PREFIX}agenda`, displayMode: "full", layoutMode: "portrait",
    maxItemsPerPage: 3, rotationIntervalSeconds: 3, refreshIntervalSeconds: 5,
    eventName: `${PREFIX}event`, showEventName: true, showPresenter: true,
    showSessionCount: true, showDescription: false,
    showRoom: false, showTrack: false,
    showStatus: false, showDuration: false,
  }).returning({ id: agendaWidgetConfigs.id });
  const now = new Date("2031-07-04T09:00:00Z");
  await db.insert(agendaItems).values(titleWordCounts.map((wordCount, index) => ({
    id: `${PREFIX}portrait-${index + 1}`, clientId,
    title: `${MARK}portrait-${index + 1} ${"conference programme session ".repeat(wordCount)}`,
    description: null,
    presenter: `Presenter ${index + 1} ${"with professional credentials ".repeat(presenterWordCounts[index])}`,
    startsAt: new Date(now.getTime() + index * 3_600_000),
    endsAt: new Date(now.getTime() + (index + 1) * 3_600_000),
    status: "scheduled", sortOrder: index,
  })));
  await db.insert(layoutTemplates).values({
    clientId, name: `${PREFIX}landscape-mismatch`, aspectRatio: "16:9", zones: [],
  });
  const [{ id: sceneId }] = await db.insert(layoutTemplates).values({
    clientId, name: `${PREFIX}portrait-scene`, aspectRatio: "9:16",
    zones: [
      { id: "agenda", name: "Portrait Agenda", type: "agenda",
        x: 0, y: 0, width: 100, height: 100, zIndex: 1, agendaConfigId: configId },
      { id: "text", name: "Scale Reference", type: "text",
        x: 0, y: 0, width: 100, height: 8, zIndex: 2,
        textContent: `${PREFIX}scale-reference`, textFontSize: 36,
        textAlign: "center", textVerticalAlign: "middle" },
    ],
  }).returning({ id: layoutTemplates.id });
  const [{ id: assetId }] = await db.insert(mediaAssets).values({
    clientId, name: `${PREFIX}video`, originalPath: `${PREFIX}.webm`,
    mediaType: "video", mimeType: "video/webm", duration: 1,
  }).returning({ id: mediaAssets.id });
  const [{ id: playlistId }] = await db.insert(playlists).values({
    clientId, name: `${PREFIX}playlist`,
  }).returning({ id: playlists.id });
  await db.insert(playlistItems).values([
    { playlistId, layoutTemplateId: sceneId, order: 0, duration: 15 },
  ]);
  const [{ id: eventId }] = await db.insert(events).values({
    clientId, name: `${PREFIX}event`, startDate: new Date(now.getTime() - 86_400_000),
    endDate: new Date(now.getTime() + 86_400_000),
  }).returning({ id: events.id });
  const [{ id: programmeId }] = await db.insert(programmes).values({ eventId, name: `${PREFIX}programme` }).returning({ id: programmes.id });
  const [{ id: versionId }] = await db.insert(programmeVersions).values({
    programmeId, versionNumber: 1, status: "published", publishedAt: new Date(),
  }).returning({ id: programmeVersions.id });
  const token = `${PREFIX}device`;
  const [{ id: screenId }] = await db.insert(screens).values({
    clientId, name: `${PREFIX}screen`, displayProfileId: profileId, deviceToken: token,
    isPaired: true, isOnline: true, fallbackPlaylistId: playlistId,
  }).returning({ id: screens.id });
  await db.insert(screenEventBookings).values({
    screenId, eventId, startsAt: new Date(now.getTime() - 86_400_000),
    endsAt: new Date(now.getTime() + 86_400_000),
  });
  await db.insert(scheduleBlocks).values({
    programmeVersionId: versionId, name: `${PREFIX}scheduled-scene`, layoutTemplateId: sceneId,
    targets: [{ type: "screen", id: screenId }],
    timeRules: [{ startDate: "2031-07-03", endDate: "2031-07-05" }],
    zoneSources: [],
  });
  return { clientId, configId, sceneId, playlistId, screenId, token, assetId,
    sceneName: `${PREFIX}portrait-scene`,
    mismatchSceneName: `${PREFIX}landscape-mismatch` };
}

async function login(page: Page) {
  const rows = await db.select({ email: users.email }).from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`).limit(1);
  expect(rows.length, "an active admin is required for test auth").toBe(1);
  const response = await page.request.post("/api/auth/test-login", {
    data: { email: rows[0].email },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  const contentType = response.headers()["content-type"] || "";
  const body = await response.text();
  expect(response.status(), `test-login failed: ${body}`).toBe(200);
  expect(contentType, `test-login must return JSON, got ${contentType}: ${body}`)
    .toContain("application/json");
  expect(() => JSON.parse(body), `test-login returned non-JSON: ${body}`).not.toThrow();

  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === "connect.sid"),
    `test-login did not set connect.sid; response=${body}`,
  ).toBe(true);
  const authenticated = await page.request.get("/api/auth/user", {
    headers: { Accept: "application/json" },
  });
  const authenticatedBody = await authenticated.text();
  expect(
    authenticated.status(),
    `test-login returned 200 but /api/auth/user was ${authenticated.status()}: ${authenticatedBody}`,
  ).toBe(200);
  expect(authenticated.headers()["content-type"] || "").toContain("application/json");
  const user = JSON.parse(authenticatedBody);
  expect(user.email).toBe(rows[0].email);
}

async function observe(page: Page, label: string, rootTestId: string): Promise<string[][]> {
  const frame = page.getByTestId(rootTestId);
  const seen: string[][] = [];
  const indicators: string[] = [];
  let previous = "";
  let armed = false;
  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline && seen.length < expected.length * 2) {
    const ids = await frame.locator("[data-testid^='agenda-title-']").evaluateAll((nodes) =>
      nodes.map((node) => {
        const id = (node as HTMLElement).dataset.testid!.replace("agenda-title-", "");
        return id.match(/portrait-\d+$/)?.[0] ?? id;
      }),
    ).catch(() => []);
    const normalized = ids;
    if (normalized.length) {
      const key = normalized.join(",");
      if (normalized.some((id) => !/^portrait-[1-9]$|^portrait-10$|^portrait-11$/.test(id))) {
        throw new Error(`${label}: unexpected Agenda card id ${key}`);
      }
      if (!armed && key === expected[0].join(",")) {
        armed = true;
        previous = "";
      }
      if (armed && key !== previous) {
        seen.push(normalized);
        previous = key;
      }
    }
    const count = await frame.getByTestId("agenda-session-count").textContent().catch(() => null);
    if (count) indicators.push(count);
    await page.waitForTimeout(250);
  }
  expect(seen, `${label} pagination`).toEqual(expected.concat(expected));
  expect(
    indicators.every((text) => /^11 sessions · page [1-5]\/5$/.test(text.trim())),
    `${label} indicators`,
  ).toBe(true);
  expect(indicators.some((text) => /8\/5|0\/5|6\/5|7\/5/.test(text)), `${label} invalid indicators`).toBe(false);
  expect(await page.locator("body").innerText()).not.toMatch(/fallback|invalid|error/i);
  return seen;
}

async function visibleAgendaIds(page: Page, rootTestId?: string): Promise<string[]> {
  const root = rootTestId ? page.getByTestId(rootTestId) : page;
  return root.locator("[data-testid^='agenda-title-']").evaluateAll((nodes) =>
    Array.from(new Set(nodes.flatMap((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.getClientRects().length === 0
      ) return [];
      return [element.dataset.testid!.replace("agenda-title-", "")];
    }))),
  );
}

async function collectAgendaIds(
  page: Page,
  rootTestId: string | undefined,
): Promise<string[]> {
  const seen = new Set<string>();
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    for (const id of await visibleAgendaIds(page, rootTestId)) seen.add(id);
    await page.waitForTimeout(250);
  }
  return [...seen].sort();
}

async function waitForAgendaCount(
  label: string,
  page: Page,
  rootTestId: string | undefined,
  count: number,
): Promise<void> {
  const root = rootTestId ? page.getByTestId(rootTestId) : page;
  await expect.poll(
    () => root.getByTestId("agenda-session-count").textContent().catch(() => null),
    { timeout: 20_000, message: `${label} must report ${count} resolved sessions` },
  ).toMatch(new RegExp(`^${count} session(?:s)?`));
}

async function expectAuthoredPortraitSurface(page: Page, rootTestId: string) {
  const dimensions = await page.getByTestId(rootTestId).evaluate((root) => {
    const ancestors: HTMLElement[] = [];
    let parent = root.parentElement;
    while (parent && ancestors.length < 8) {
      ancestors.push(parent);
      parent = parent.parentElement;
    }
    const nodes = [root, ...root.querySelectorAll<HTMLElement>("*"), ...ancestors];
    return nodes
      .map((node) => `${node.style.width}x${node.style.height}`)
      .find((value) => value === "1080pxx1920px");
  });
  expect(dimensions, `${rootTestId} must retain authored 1080x1920 logical dimensions`).toBe("1080pxx1920px");
}

type TextScaleSnapshot = {
  rawFontSize: number;
  logicalHeight: number;
  outerScale: number;
  normalizedFontProportion: number;
};

async function captureTextScale(
  page: Page,
  label: string,
  rootTestId: string,
): Promise<TextScaleSnapshot> {
  const snapshot = await page.getByTestId(rootTestId).evaluate((root) => {
    const text = root.querySelector<HTMLElement>("[data-testid='text-widget']");
    if (!text) throw new Error("text-widget not found");
    let current: HTMLElement | null = text;
    let logicalSurface: HTMLElement | null = null;
    let depth = 0;
    while (current && depth < 16) {
      if (
        /^\d+(?:\.\d+)?px$/.test(current.style.height) &&
        current.style.transform.includes("scale(")
      ) {
        logicalSurface = current;
        break;
      }
      current = current.parentElement;
      depth += 1;
    }
    if (!logicalSurface || logicalSurface.offsetHeight <= 0) {
      throw new Error("logical scene surface not found");
    }
    const rawFontSize = Number.parseFloat(getComputedStyle(text).fontSize);
    const outerScale =
      logicalSurface.getBoundingClientRect().height / logicalSurface.offsetHeight;
    return {
      rawFontSize,
      logicalHeight: logicalSurface.offsetHeight,
      outerScale,
      normalizedFontProportion: rawFontSize / logicalSurface.offsetHeight,
    };
  });
  console.log(`${label} text scale ${JSON.stringify(snapshot)}`);
  expect(snapshot.normalizedFontProportion, `${label} normalized font proportion`)
    .toBeCloseTo(36 / 720, 5);
  return snapshot;
}

async function logSurfaceSnapshot(page: Page, label: string, rootTestId: string) {
  const snapshot = await page.getByTestId(rootTestId).evaluate((root) => {
    const display = root.querySelector<HTMLElement>("[data-testid='agenda-display-root']");
    const content = display
      ? [...display.children].find((child) =>
          child instanceof HTMLElement &&
          child.classList.contains("flex-1") &&
          child.classList.contains("min-h-0"),
        ) as HTMLElement | undefined
      : undefined;
    const count = root.querySelector<HTMLElement>("[data-testid='agenda-session-count']");
    const rows = [...root.querySelectorAll<HTMLElement>("[data-testid^='agenda-row-']")];
    const title = root.querySelector<HTMLElement>("[data-testid^='agenda-title-']");
    const presenter = root.querySelector<HTMLElement>("[data-testid^='agenda-presenter-']");
    const logicalSurface = display?.parentElement?.closest<HTMLElement>(
      "[style*='1080px'][style*='1920px']",
    );
    const rect = (element: Element | null) => {
      const box = element?.getBoundingClientRect();
      return box ? { width: box.width, height: box.height } : null;
    };
    return {
      indicator: count?.textContent?.trim() ?? null,
      root: rect(root),
      rootStyle: {
        width: (root as HTMLElement).style.width,
        height: (root as HTMLElement).style.height,
        transform: (root as HTMLElement).style.transform,
      },
      display: rect(display),
      content: content ? {
        clientWidth: content.clientWidth,
        clientHeight: content.clientHeight,
        offsetWidth: content.offsetWidth,
        offsetHeight: content.offsetHeight,
        ...rect(content),
      } : null,
      effectiveScale: display && display.offsetWidth > 0
        ? rect(display)!.width / display.offsetWidth
        : null,
      logicalSurface: logicalSurface ? {
        offsetWidth: logicalSurface.offsetWidth,
        offsetHeight: logicalSurface.offsetHeight,
        style: {
          width: logicalSurface.style.width,
          height: logicalSurface.style.height,
          transform: logicalSurface.style.transform,
        },
        ...rect(logicalSurface),
      } : null,
      authoredScene: { width: 1080, height: 1920 },
      rows: rows.map((row) => ({
        id: row.dataset.testid?.match(/portrait-\d+$/)?.[0] ?? row.dataset.testid,
        offsetWidth: row.offsetWidth,
        offsetHeight: row.offsetHeight,
        padding: {
          top: getComputedStyle(row).paddingTop,
          right: getComputedStyle(row).paddingRight,
          bottom: getComputedStyle(row).paddingBottom,
          left: getComputedStyle(row).paddingLeft,
        },
        ...rect(row),
      })),
      measuredCards: [...root.querySelectorAll<HTMLElement>("[data-measure-id]")].map((card) => ({
        id: card.dataset.measureId?.match(/portrait-\d+$/)?.[0] ?? card.dataset.measureId,
        offsetWidth: card.offsetWidth,
        offsetHeight: card.offsetHeight,
        ...rect(card),
      })),
      title: title ? {
        fontSize: getComputedStyle(title).fontSize,
        lineHeight: getComputedStyle(title).lineHeight,
        fontFamily: getComputedStyle(title).fontFamily,
        offsetWidth: title.offsetWidth,
        offsetHeight: title.offsetHeight,
        ...rect(title),
      } : null,
      presenter: presenter ? {
        fontSize: getComputedStyle(presenter).fontSize,
        lineHeight: getComputedStyle(presenter).lineHeight,
        fontFamily: getComputedStyle(presenter).fontFamily,
        offsetWidth: presenter.offsetWidth,
        offsetHeight: presenter.offsetHeight,
        ...rect(presenter),
      } : null,
      displayStyle: display ? {
        padding: getComputedStyle(display).padding,
        gap: getComputedStyle(display).gap,
        visibility: getComputedStyle(display).visibility,
        display: getComputedStyle(display).display,
      } : null,
      devicePixelRatio,
      fonts: { status: document.fonts.status },
    };
  });
  console.log(`${label} snapshot ${JSON.stringify(snapshot)}`);
}

async function capturePageModel(page: Page, label: string, rootTestId: string): Promise<string[][]> {
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByTestId(rootTestId);
  const pages = new Map<number, string[]>();
  let totalPages = 0;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const sample = await frame.evaluate((root) => {
      const indicator = root.querySelector<HTMLElement>("[data-testid='agenda-session-count']")
        ?.textContent?.trim() ?? "";
      const match = indicator.match(/page\s+(\d+)\/(\d+)/i);
      const ids = [...root.querySelectorAll<HTMLElement>("[data-testid^='agenda-title-']")]
        .map((node) => {
          const id = node.dataset.testid?.replace("agenda-title-", "") ?? "";
          return id.match(/portrait-\d+$/)?.[0] ?? id;
        });
      return { page: Number(match?.[1] ?? 0), total: Number(match?.[2] ?? 0), ids };
    });
    if (sample.page > 0 && sample.total > 0 && sample.ids.length > 0) {
      totalPages = sample.total;
      pages.set(sample.page, sample.ids);
      if (pages.size === totalPages) break;
    }
    await page.waitForTimeout(200);
  }
  const model = Array.from({ length: totalPages }, (_, index) => pages.get(index + 1) ?? []);
  console.log(`${label} page model ${JSON.stringify(model)}`);
  expect(model.every((ids) => ids.length > 0), `${label} must expose every settled page`).toBe(true);
  return model;
}

test.describe("portrait Agenda pagination consistency", () => {
  let s: Seed;
  test.beforeAll(async () => { await cleanup(); s = await seed(); });
  test.afterAll(async () => { try { await cleanup(); } finally { await pool.end(); } });

  test("Scene Builder, Simulator, Player, and Monitor show identical two-cycle pages", async ({ browser }) => {
    // This production-shaped check observes the complete settled sequence in
    // Scene Builder, direct Simulator, playlist Simulator, Player, and Monitor.
    test.setTimeout(360_000);
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const sceneBuilder = await ctx.newPage();
    await login(sceneBuilder);
    await sceneBuilder.goto("/layouts", { waitUntil: "commit" });
    try {
      await expect.poll(
        async () => (await sceneBuilder.locator("h1,h2").allTextContents()).includes(s.sceneName),
        { timeout: 30_000 },
      ).toBe(true);
    } catch (error) {
      await sceneBuilder.screenshot({ path: test.info().outputPath("layouts-readiness-failure.png"), fullPage: true });
      throw new Error(
        `Scene Builder readiness failed: path=${new URL(sceneBuilder.url()).pathname} ` +
        `heading=${await sceneBuilder.locator("h1,h2").allTextContents()} ` +
        `title=${await sceneBuilder.title()}`,
        { cause: error },
      );
    }
    await sceneBuilder.getByTestId("input-layout-preview-test-date")
      .fill("2031-07-04T09:00");
    await expect(sceneBuilder.getByTestId("interactive-layout-preview")).toBeVisible({ timeout: 20_000 });
    await sceneBuilder.waitForTimeout(5_000);
    const sceneBuilderText = await captureTextScale(
      sceneBuilder, "Scene Builder", "interactive-layout-preview",
    );
    expect(sceneBuilderText.rawFontSize).toBe(36);
    expect(sceneBuilderText.logicalHeight).toBe(720);
    await logSurfaceSnapshot(sceneBuilder, "Scene Builder", "interactive-layout-preview");
    const sceneBuilderBaseline = await capturePageModel(
      sceneBuilder, "Scene Builder", "interactive-layout-preview",
    );
    expect(sceneBuilderBaseline, "Scene Builder must establish the canonical fixture")
      .toEqual(expected);
    if (!globalPhaseOnly) {
      await observe(sceneBuilder, "Scene Builder", "interactive-layout-preview");
    }

    const simulator = await ctx.newPage();
    await login(simulator);
    await simulator.goto(`/simulator?at=2031-07-04T09:00:00Z`, { waitUntil: "commit" });
    await simulator.getByTestId("select-simulator-screen").click();
    await simulator.getByRole("option", { name: `${PREFIX}screen`, exact: false }).click();
    await simulator.getByTestId("select-simulator-layout").click();
    await simulator.getByRole("option", { name: `${s.sceneName} (2 zones)`, exact: true }).click();
    await expect(simulator.getByTestId("player-display")).toBeVisible({ timeout: 20_000 });
    await expectAuthoredPortraitSurface(simulator, "player-display");
    await expect(simulator.getByTestId("warning-layout-size-mismatch")).toHaveCount(0);
    await simulator.waitForTimeout(5_000);
    const simulatorText = await captureTextScale(
      simulator, "Simulator scene", "player-display",
    );
    expect(simulatorText.rawFontSize).toBe(96);
    expect(simulatorText.logicalHeight).toBe(1920);
    console.log(`Fixture IDs ${JSON.stringify({ configId: s.configId, sceneId: s.sceneId })}`);
    await logSurfaceSnapshot(simulator, "Simulator scene", "player-display");
    const simulatorBaseline = await capturePageModel(
      simulator, "Simulator scene", "player-display",
    );
    expect(simulatorBaseline, "Simulator must match the real Scene Builder page model")
      .toEqual(sceneBuilderBaseline);
    await simulator.setViewportSize({ width: 1_100, height: 800 });
    await simulator.waitForTimeout(2_000);
    const resizedSimulatorText = await captureTextScale(
      simulator, "Resized Simulator scene", "player-display",
    );
    expect(resizedSimulatorText.rawFontSize).toBe(simulatorText.rawFontSize);
    expect(resizedSimulatorText.logicalHeight).toBe(simulatorText.logicalHeight);
    expect(resizedSimulatorText.outerScale).not.toBeCloseTo(simulatorText.outerScale, 3);
    const resizedSimulatorBaseline = await capturePageModel(
      simulator, "Resized Simulator scene", "player-display",
    );
    expect(
      resizedSimulatorBaseline,
      "resizing the Simulator panel must not change canonical page membership",
    ).toEqual(sceneBuilderBaseline);
    if (!globalPhaseOnly) {
      await observe(simulator, "Simulator scene", "player-display");
    }

    const playlist = await ctx.newPage();
    await login(playlist);
    await playlist.goto(`/simulator?playlistId=${s.playlistId}&at=2031-07-04T09:00:00Z`, { waitUntil: "commit" });
    await expect(playlist.getByTestId("player-display")).toBeVisible({ timeout: 20_000 });
    const playlistText = await captureTextScale(
      playlist, "Simulator playlist", "player-display",
    );
    expect(playlistText.normalizedFontProportion)
      .toBeCloseTo(sceneBuilderText.normalizedFontProportion, 5);
    if (!globalPhaseOnly) {
      await observe(playlist, "Simulator playlist", "player-display");
    }

    const player = await ctx.newPage();
    await player.addInitScript(({ token, screenId }) => {
      localStorage.setItem("signage_device_token", token);
      localStorage.setItem("signage_screen_id", screenId);
    }, { token: s.token, screenId: s.screenId });
    await player.route(`**/api/player/media/${s.assetId}/file*`, (route) =>
      route.fulfill({ status: 200, contentType: "video/webm", body: video }));
    await player.goto(`/player?at=2031-07-04T09:00:00Z`, { waitUntil: "commit" });
    await expect(player.getByTestId("screen-render-committed-frame")).toBeVisible({ timeout: 30_000 });
    await expectAuthoredPortraitSurface(player, "screen-render-committed-frame");
    const playerText = await captureTextScale(
      player, "Player", "screen-render-committed-frame",
    );
    expect(playerText.normalizedFontProportion)
      .toBeCloseTo(sceneBuilderText.normalizedFontProportion, 5);
    const playerPages = globalPhaseOnly
      ? []
      : await observe(player, "Player", "screen-render-committed-frame");

    const monitor = await ctx.newPage();
    await login(monitor);
    const create = await monitor.request.post(`/api/operations/screens/${s.screenId}/monitor-session`, {
      data: { clientType: "multiview", clientName: `${MARK}monitor` },
    });
    expect(create.status(), await create.text()).toBe(201);
    const monitorUrl = new URL((await create.json()).monitorUrl);
    monitorUrl.searchParams.set("at", "2031-07-04T09:00");
    await monitor.goto(`${process.env.E2E_BASE_URL || "http://127.0.0.1:5000"}${monitorUrl.pathname}${monitorUrl.search}`, { waitUntil: "commit" });
    await expect(monitor.getByTestId("screen-render-committed-frame")).toBeVisible({ timeout: 30_000 });
    await expectAuthoredPortraitSurface(monitor, "screen-render-committed-frame");
    const monitorText = await captureTextScale(
      monitor, "Monitor", "screen-render-committed-frame",
    );
    expect(monitorText.normalizedFontProportion)
      .toBeCloseTo(sceneBuilderText.normalizedFontProportion, 5);
    const monitorPages = globalPhaseOnly
      ? []
      : await observe(monitor, "Monitor", "screen-render-committed-frame");
    if (!globalPhaseOnly) {
      expect(monitorPages, "Monitor must follow the Player's ordered page sequence").toEqual(playerPages);
    }
    await expect(monitor.locator("body")).not.toContainText("Monitor session expired");

    // Reuse the same production surfaces for the optional cross-room mode.
    // The first three adjacent sessions alternate rooms, so legacy mode keeps
    // one current plus one upcoming per room, while global mode keeps one of
    // each across the combined sequence.
    await pool.query(
      `UPDATE agenda_items
       SET room = CASE WHEN id = ANY($2::text[]) THEN 'Room A' ELSE 'Room B' END,
           title = CASE WHEN id = ANY($3::text[]) THEN id ELSE title END
       WHERE client_id = $1`,
      [
        s.clientId,
        titleWordCounts.flatMap((_, index) =>
          index % 2 === 0 ? [`${PREFIX}portrait-${index + 1}`] : []),
        [`${PREFIX}portrait-1`, `${PREFIX}portrait-2`, `${PREFIX}portrait-3`],
      ],
    );
    const setLegacy = await sceneBuilder.request.patch(`/api/agenda/configs/${s.configId}`, {
      data: {
        displayMode: "now_next",
        roomFilter: ["Room A", "Room B"],
        singleGlobalNowNext: false,
        showPresenter: false,
      },
    });
    expect(setLegacy.status(), await setLegacy.text()).toBe(200);

    const standalone = await ctx.newPage();
    await standalone.goto(`/display/agenda/${s.configId}?at=2031-07-04T09:00:00Z`, { waitUntil: "commit" });
    await expect(standalone.getByTestId("agenda-display-root")).toBeVisible({ timeout: 20_000 });
    const surfaces: Array<[string, Page, string | undefined]> = [
      ["Scene Builder", sceneBuilder, "interactive-layout-preview"],
      ["Direct Simulator", simulator, "player-display"],
      ["Playlist Simulator", playlist, "player-display"],
      ["Player", player, "screen-render-committed-frame"],
      ["Standalone Agenda", standalone, undefined],
    ];
    const monitorSurface: [string, Page, string] = [
      "Monitor",
      monitor,
      "screen-render-committed-frame",
    ];
    const legacyIds = [
      `${PREFIX}portrait-1`,
      `${PREFIX}portrait-2`,
      `${PREFIX}portrait-3`,
    ];
    await Promise.all(
      surfaces.map(([label, surface, root]) =>
        waitForAgendaCount(label, surface, root, legacyIds.length)),
    );
    const legacySurfaceIds = await Promise.all(
      surfaces.map(([, surface, root]) => collectAgendaIds(surface, root)),
    );
    for (let index = 0; index < surfaces.length; index++) {
      expect(
        legacySurfaceIds[index],
        `${surfaces[index][0]} must preserve per-room Now/Next`,
      ).toEqual(legacyIds);
    }
    await waitForAgendaCount(...monitorSurface, 2);
    expect(await collectAgendaIds(monitorSurface[1], monitorSurface[2]))
      .toEqual([`${PREFIX}portrait-1`, `${PREFIX}portrait-2`]);

    const setGlobal = await sceneBuilder.request.patch(`/api/agenda/configs/${s.configId}`, {
      data: { singleGlobalNowNext: true },
    });
    expect(setGlobal.status(), await setGlobal.text()).toBe(200);
    const globalIds = [`${PREFIX}portrait-1`, `${PREFIX}portrait-2`];
    await Promise.all(
      surfaces.map(([label, surface, root]) =>
        waitForAgendaCount(label, surface, root, globalIds.length)),
    );
    const globalSurfaceIds = await Promise.all(
      surfaces.map(([, surface, root]) => collectAgendaIds(surface, root)),
    );
    for (let index = 0; index < surfaces.length; index++) {
      expect(
        globalSurfaceIds[index],
        `${surfaces[index][0]} must use one global Now and Next`,
      ).toEqual(globalIds);
    }
    await waitForAgendaCount(...monitorSurface, 1);
    expect(await collectAgendaIds(monitorSurface[1], monitorSurface[2]))
      .toEqual([`${PREFIX}portrait-1`]);

    const warning = await ctx.newPage();
    await login(warning);
    await warning.goto(`/simulator?at=2031-07-04T09:00:00Z`, { waitUntil: "commit" });
    await warning.getByTestId("select-simulator-screen").click();
    await warning.getByRole("option", { name: `${PREFIX}screen`, exact: false }).click();
    await warning.getByTestId("select-simulator-layout").click();
    await warning.getByRole("option", { name: `${s.mismatchSceneName} (0 zones)`, exact: true }).click();
    await expect(warning.getByTestId("warning-layout-size-mismatch")).toContainText(
      "Scene 16:9 doesn't match screen 1080×1920 aspect ratio",
    );
    await ctx.close();
  });
});
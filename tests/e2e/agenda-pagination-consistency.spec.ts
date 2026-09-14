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
  events, scheduleBlocks, screens, screenEventBookings, users, customFonts,
} from "../../shared/schema";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MARK = "ZZTEST-PAGINATION-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, layoutTemplates,
  mediaAssets, playlistItems, playlists, programmeVersions, programmes,
  events, scheduleBlocks, screens, screenEventBookings, users, customFonts,
} });
const video = readFileSync(path.resolve("tests/e2e/fixtures/tiny-loop.webm"));
// Use a real installed font rather than a synthetic response. The route below
// only makes the disposable fixture available through the production font-file
// endpoint, just as an uploaded font would be on an operator's site.
const customFontPath = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/local/share/fonts/DejaVuSans.ttf",
].find(existsSync);
if (!customFontPath) {
  throw new Error("The Agenda E2E fixture requires an installed TTF font");
}
const customFont = readFileSync(customFontPath);
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
  mismatchSceneName: string; customFontId: string;
};

async function cleanup() {
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `${MARK}%`));
  await db.delete(agendaItems).where(like(agendaItems.title, `${MARK}%`));
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${MARK}%`));
  await db.delete(customFonts).where(like(customFonts.originalName, `${MARK}%`));
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
  const customFontId = crypto.randomUUID();
  await db.insert(customFonts).values({
    id: customFontId,
    clientId,
    familyId: customFontId,
    name: `${PREFIX}DejaVu Sans`,
    originalName: `${MARK}DejaVuSans.ttf`,
    storagePath: `${PREFIX}DejaVuSans.ttf`,
    format: "ttf",
    fileSize: customFont.byteLength,
  });
  const [{ id: configId }] = await db.insert(agendaWidgetConfigs).values({
    clientId, name: `${PREFIX}agenda`, displayMode: "full", layoutMode: "portrait",
    maxItemsPerPage: 3, rotationIntervalSeconds: 3, refreshIntervalSeconds: 5,
    eventName: `${PREFIX}event`, showEventName: true, showPresenter: true,
    showPresenterCompany: true,
    presenterColor: "#0055ff", presenterCompanyColor: "#00aa55",
    showSessionCount: true, showDescription: false,
    showRoom: false, showTrack: false,
    showStatus: false, showDuration: false,
  }).returning({ id: agendaWidgetConfigs.id });
  const now = new Date("2031-07-04T09:00:00Z");
  await db.insert(agendaItems).values(titleWordCounts.map((wordCount, index) => ({
    id: `${PREFIX}portrait-${index + 1}`, clientId,
    title: `${MARK}portrait-${index + 1} ${"conference programme session ".repeat(wordCount)}`,
    description: null,
    presenter: index === 10
      ? null
      : `Presenter ${index + 1} ${"with professional credentials ".repeat(presenterWordCounts[index])}`,
    presenterCompany: index === 9
      ? null
      : index === 10
        ? "Company without presenter"
        : index === 0
          ? "A long company affiliation that wraps naturally with its presenter across the available card width"
          : `Company ${index + 1}`,
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
  return { clientId, configId, sceneId, playlistId, screenId, token, assetId, customFontId,
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

type RectSnapshot = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PresenterPairSnapshot = {
  combinedText: string;
  presenterText: string;
  companyText: string;
  presenterCount: number;
  presenterColor: string | null;
  companyColor: string | null;
  presenterViewport: string | null;
  companyViewport: string | null;
  pairRect: RectSnapshot;
  presenterRect: RectSnapshot | null;
  companyRect: RectSnapshot | null;
  viewportRect: RectSnapshot | null;
};

type AgendaPageSnapshot = {
  ids: string[];
  indicator: string;
  pageIndex: number;
  pageCount: number;
  pairs: Record<string, PresenterPairSnapshot>;
};

async function captureAgendaPage(
  page: Page,
  rootTestId: string,
): Promise<AgendaPageSnapshot | null> {
  return page.evaluate((testId) => {
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
    );
    const root = roots.find((candidate) => {
      const style = getComputedStyle(candidate);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        candidate.getClientRects().length > 0
      );
    });
    if (!root) return null;

    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
      );
    };
    const rect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const titleNodes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-testid^='agenda-title-']"),
    ).filter(visible);
    const count = root.querySelector<HTMLElement>("[data-testid='agenda-session-count']");
    if (!titleNodes.length || !count || !visible(count)) return null;

    const ids = titleNodes.map((node) => {
      const id = node.dataset.testid!.replace("agenda-title-", "");
      return id.match(/portrait-\d+$/)?.[0] ?? id;
    });
    const indicator = count.textContent?.trim() ?? "";
    const pageMatch = indicator.match(/page (\d+)\/(\d+)$/);
    if (!pageMatch) return null;

    const pairs: Record<string, PresenterPairSnapshot> = {};
    for (const id of ["portrait-1", "portrait-10", "portrait-11"]) {
      if (!ids.includes(id)) continue;
      const pair = Array.from(
        root.querySelectorAll<HTMLElement>("[data-testid^='agenda-presenter-pair-']"),
      ).find((candidate) => candidate.dataset.testid?.endsWith(id) && visible(candidate));
      if (!pair) return null;
      const presenter = pair.querySelector<HTMLElement>(
        "[data-testid^='agenda-presenter-']:not([data-testid^='agenda-presenter-pair-']):not([data-testid^='agenda-presenter-company-']):not([data-testid^='agenda-presenter-viewport-'])",
      );
      const company = pair.querySelector<HTMLElement>(
        "[data-testid^='agenda-presenter-company-']",
      );
      const presenterViewport = presenter?.closest<HTMLElement>(
        "[data-testid^='agenda-presenter-viewport-']",
      ) ?? null;
      const companyViewport = company?.closest<HTMLElement>(
        "[data-testid^='agenda-presenter-viewport-']",
      ) ?? null;
      const viewport = presenterViewport ?? companyViewport;
      pairs[id] = {
        combinedText: pair.textContent ?? "",
        presenterText: presenter?.textContent ?? "",
        companyText: company?.textContent ?? "",
        presenterCount: pair.querySelectorAll(
          "[data-testid^='agenda-presenter-']:not([data-testid^='agenda-presenter-pair-']):not([data-testid^='agenda-presenter-company-']):not([data-testid^='agenda-presenter-viewport-'])",
        ).length,
        presenterColor: presenter ? getComputedStyle(presenter).color : null,
        companyColor: company ? getComputedStyle(company).color : null,
        presenterViewport: presenterViewport?.dataset.testid ?? null,
        companyViewport: companyViewport?.dataset.testid ?? null,
        pairRect: rect(pair),
        presenterRect: presenter ? rect(presenter) : null,
        companyRect: company ? rect(company) : null,
        viewportRect: viewport ? rect(viewport) : null,
      };
    }

    return {
      ids,
      indicator,
      pageIndex: Number(pageMatch[1]),
      pageCount: Number(pageMatch[2]),
      pairs,
    };
  }, rootTestId);
}

async function observe(page: Page, label: string, rootTestId: string): Promise<string[][]> {
  const seen: string[][] = [];
  const indicators: string[] = [];
  const finalDwellsMs: number[] = [];
  let finalPageStartedAt: number | null = null;
  let sawInlinePair = false;
  let sawPresenterWithoutCompany = false;
  let sawCompanyWithoutPresenter = false;
  for (let index = 0; index < expected.length * 2; index += 1) {
    const expectedIds = expected[index % expected.length];
    const expectedKey = expectedIds.join(",");
    let matched: AgendaPageSnapshot | null = null;
    let consecutiveMatches = 0;
    await expect.poll(
      async () => {
        const snapshot = await captureAgendaPage(page, rootTestId);
        if (!snapshot) return null;
        const key = snapshot.ids.join(",");
        consecutiveMatches = key === expectedKey ? consecutiveMatches + 1 : 0;
        if (consecutiveMatches >= 2) matched = snapshot;
        return consecutiveMatches >= 2 ? key : null;
      },
      {
        message: `${label} page ${index + 1} should match the canonical rotation`,
        timeout: 110_000,
        intervals: [50, 100, 200],
      },
    ).toBe(expectedKey);

    const snapshot = matched;
    expect(snapshot, `${label} stable page snapshot`).not.toBeNull();
    if (!snapshot) throw new Error(`${label}: stable page snapshot was not retained`);
    if (snapshot.ids.some((id) => !/^portrait-(?:[1-9]|10|11)$/.test(id))) {
      throw new Error(`${label}: unexpected Agenda card id ${snapshot.ids.join(",")}`);
    }
    expect(snapshot.pageIndex, `${label} page index`).toBe((index % expected.length) + 1);
    expect(snapshot.pageCount, `${label} page count`).toBe(expected.length);
    const settledAt = Date.now();
    if (finalPageStartedAt !== null) {
      finalDwellsMs.push(settledAt - finalPageStartedAt);
      finalPageStartedAt = null;
    }
    if (index === expected.length - 1 || index === expected.length * 2 - 1) {
      finalPageStartedAt = settledAt;
    }
    seen.push(snapshot.ids);
    indicators.push(snapshot.indicator);

    const inlinePair = snapshot.pairs["portrait-1"];
    if (inlinePair) {
      expect(inlinePair.combinedText, `${label} inline separator`).toContain(" — ");
      expect(inlinePair.presenterText, `${label} presenter text`).toBeTruthy();
      expect(inlinePair.companyText, `${label} company text`).toBeTruthy();
      expect(inlinePair.presenterColor, `${label} presenter colour`).toBe("rgb(0, 85, 255)");
      expect(inlinePair.companyColor, `${label} company colour`).toBe("rgb(0, 170, 85)");
      expect(inlinePair.presenterViewport, `${label} presenter viewport`).toBeTruthy();
      expect(inlinePair.companyViewport, `${label} shared inline viewport`)
        .toBe(inlinePair.presenterViewport);
      expect(inlinePair.presenterRect?.width, `${label} presenter geometry`).toBeGreaterThan(0);
      expect(inlinePair.companyRect?.width, `${label} company geometry`).toBeGreaterThan(0);
      expect(inlinePair.viewportRect?.width, `${label} viewport geometry`).toBeGreaterThan(0);
      expect(inlinePair.presenterRect!.left, `${label} presenter inside viewport`)
        .toBeGreaterThanOrEqual(inlinePair.viewportRect!.left - 1);
      expect(inlinePair.companyRect!.right, `${label} company inside viewport`)
        .toBeLessThanOrEqual(inlinePair.viewportRect!.right + 1);
      sawInlinePair = true;
    }

    const presenterOnly = snapshot.pairs["portrait-10"];
    if (presenterOnly) {
      expect(presenterOnly.combinedText, `${label} blank company`).not.toContain(" — ");
      expect(presenterOnly.presenterText, `${label} presenter without company`).toBeTruthy();
      expect(presenterOnly.companyText, `${label} blank company text`).toBe("");
      sawPresenterWithoutCompany = true;
    }

    const companyOnly = snapshot.pairs["portrait-11"];
    if (companyOnly) {
      expect(companyOnly.combinedText, `${label} hidden presenter`).not.toContain(" — ");
      expect(companyOnly.presenterCount, `${label} hidden presenter element`).toBe(0);
      expect(companyOnly.presenterText, `${label} hidden presenter text`).toBe("");
      expect(companyOnly.companyText, `${label} company without presenter`)
        .toContain("Company without presenter");
      sawCompanyWithoutPresenter = true;
    }
  }
  // A second-cycle final page must also be allowed to complete. Waiting for
  // the next canonical page makes both dwell measurements transition-driven;
  // neither is inferred from a fixed sleep.
  if (finalPageStartedAt !== null) {
    await expect.poll(
      async () => (await captureAgendaPage(page, rootTestId))?.ids.join(",") ?? null,
      {
        timeout: 30_000,
        message: `${label} second-cycle final page must dwell before page one`,
      },
    ).toBe(expected[0].join(","));
    finalDwellsMs.push(Date.now() - finalPageStartedAt);
  }
  expect(finalDwellsMs, `${label} must measure both final-page dwells`).toHaveLength(2);
  for (const dwell of finalDwellsMs) {
    expect(dwell, `${label} final page dwell must not be reset by polling`).toBeGreaterThan(1_500);
    expect(dwell, `${label} final page dwell must be finite`).toBeLessThan(30_000);
  }
  expect(seen, `${label} pagination`).toEqual(expected.concat(expected));
  expect(
    indicators.every((text) => /^11 sessions · page [1-5]\/5$/.test(text.trim())),
    `${label} indicators`,
  ).toBe(true);
  expect(indicators.some((text) => /8\/5|0\/5|6\/5|7\/5/.test(text)), `${label} invalid indicators`).toBe(false);
  expect(sawInlinePair, `${label} inline presenter/company pair`).toBe(true);
  expect(sawPresenterWithoutCompany, `${label} presenter without company`).toBe(true);
  expect(sawCompanyWithoutPresenter, `${label} company without presenter`).toBe(true);
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

async function expectCustomFontAndCanonicalPages(
  page: Page,
  label: string,
  rootTestId: string,
  fontId: string,
  verifyPages = true,
) {
  const family = `vmfont-${fontId}`;
  await expect.poll(
    async () => page.getByTestId(rootTestId).evaluate((root) => {
      const title = root.querySelector<HTMLElement>("[data-testid^='agenda-title-']");
      return title ? getComputedStyle(title).fontFamily : "";
    }),
    {
      timeout: 30_000,
      message: `${label} must reflow using the uploaded custom font`,
    },
  ).toContain(family);
  await page.evaluate(() => document.fonts.ready);
  if (!verifyPages) return;
  const model = await capturePageModel(page, `${label} after custom font`, rootTestId);
  expect(model, `${label} must retain every canonical page after font reflow`).toEqual(expected);
}

function trackProductionAgendaPolls(page: Page): () => number {
  let successfulPolls = 0;
  page.on("response", (response) => {
    const url = response.url();
    const isAgendaPoll = url.includes("/api/agenda/display/");
    const isPlayerPoll = url.includes("/api/player/content");
    const isMonitorPoll = /\/api\/monitor\/[^/]+\/(?:content|presentation)/.test(url);
    if ((isAgendaPoll || isPlayerPoll || isMonitorPoll) && response.status() < 500) {
      successfulPolls += 1;
    }
  });
  return () => successfulPolls;
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
    await ctx.route(`**/api/fonts/${s.customFontId}/file*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "font/ttf",
        body: customFont,
        headers: { "Cache-Control": "no-store" },
      }),
    );
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
    const sceneBuilderPolls = trackProductionAgendaPolls(sceneBuilder);
    if (!globalPhaseOnly) {
      await observe(sceneBuilder, "Scene Builder", "interactive-layout-preview");
    }

    const simulator = await ctx.newPage();
    const simulatorPolls = trackProductionAgendaPolls(simulator);
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
    const playlistPolls = trackProductionAgendaPolls(playlist);
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
    const playerPolls = trackProductionAgendaPolls(player);
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
    const monitorPolls = trackProductionAgendaPolls(monitor);
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
      for (const [label, count] of [
        ["Scene Builder", sceneBuilderPolls()],
        ["Direct Simulator", simulatorPolls()],
        ["Playlist Simulator", playlistPolls()],
        ["Player", playerPolls()],
        ["Monitor", monitorPolls()],
      ] as const) {
        expect(
          count,
          `${label} must receive equivalent production refresh polls during both cycles`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
    await expect(monitor.locator("body")).not.toContainText("Monitor session expired");

    // A real font file is served through the production font route. Once the
    // config poll applies it, every surface must settle its font measurement
    // pass without dropping the last page.
    const selectCustomFont = await sceneBuilder.request.patch(`/api/agenda/configs/${s.configId}`, {
      data: {
        fontFamily: `custom:${s.customFontId}`,
      },
    });
    expect(selectCustomFont.status(), await selectCustomFont.text()).toBe(200);
    if (!globalPhaseOnly) {
      await expectCustomFontAndCanonicalPages(
        sceneBuilder, "Scene Builder", "interactive-layout-preview", s.customFontId,
      );
      await expectCustomFontAndCanonicalPages(
        simulator, "Direct Simulator", "player-display", s.customFontId, false,
      );
      await expectCustomFontAndCanonicalPages(
        playlist, "Playlist Simulator", "player-display", s.customFontId, false,
      );
      await expectCustomFontAndCanonicalPages(
        player, "Player", "screen-render-committed-frame", s.customFontId,
      );
      await expectCustomFontAndCanonicalPages(
        monitor, "Monitor", "screen-render-committed-frame", s.customFontId,
      );
    }

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
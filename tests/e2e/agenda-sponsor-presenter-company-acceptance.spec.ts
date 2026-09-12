/**
 * Production-shaped acceptance coverage for the Agenda sponsor and speaker
 * affiliation fields. The database rows are disposable and the test uses
 * the same Scene Builder and Simulator routes as an operator.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like, sql } from "drizzle-orm";
import {
  agendaItems,
  agendaWidgetConfigs,
  clients,
  displayProfiles,
  layoutTemplates,
  screens,
  users,
} from "../../shared/schema";

const MARK = "ZZTEST-AGENDA-SPONSOR-PRESENTER-";
const RUN = Math.random().toString(36).slice(2, 9);
const PREFIX = `${MARK}${RUN}-`;
const SITE_NAME = `${PREFIX}site`;
const CONFIG_NAME = `${PREFIX}agenda`;
const SCENE_NAME = `${PREFIX}scene`;
const SCREEN_NAME = `${PREFIX}screen`;
const NOW = "2031-07-04T09:00:00Z";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: {
    agendaItems,
    agendaWidgetConfigs,
    clients,
    displayProfiles,
    layoutTemplates,
    screens,
    users,
  },
});

type Fixture = {
  clientId: string;
  configId: string;
  sceneId: string;
  screenId: string;
  itemIds: string[];
};

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${MARK}%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${MARK}%`));
  await db.delete(agendaItems).where(like(agendaItems.title, `${MARK}%`));
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${MARK}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${MARK}%`));
  await db.delete(clients).where(like(clients.name, `${MARK}%`));
}

async function seed(): Promise<Fixture> {
  const [{ id: clientId }] = await db.insert(clients).values({
    name: SITE_NAME,
    timezone: "Europe/London",
  }).returning({ id: clients.id });
  const [{ id: profileId }] = await db.insert(displayProfiles).values({
    clientId,
    name: `${PREFIX}profile`,
    width: 1920,
    height: 1080,
  }).returning({ id: displayProfiles.id });
  const [{ id: configId }] = await db.insert(agendaWidgetConfigs).values({
    clientId,
    name: CONFIG_NAME,
    displayMode: "full",
    layoutMode: "landscape",
    maxItemsPerPage: 2,
    rotationIntervalSeconds: 2,
    refreshIntervalSeconds: 5,
    eventName: `${PREFIX}event`,
    showEventName: true,
    showPresenter: true,
    showPresenterCompany: true,
    showCompany: true,
    showDescription: false,
    showRoom: false,
    showTrack: false,
    showStatus: false,
    showSessionCount: true,
    presenterColor: "#0055ff",
    presenterCompanyColor: "#00aa55",
    companyColor: "#ff00aa",
    dayFilter: "all",
  }).returning({ id: agendaWidgetConfigs.id });

  const itemIds = [`${PREFIX}item-1`, `${PREFIX}item-2`, `${PREFIX}item-3`];
  await db.insert(agendaItems).values([
    {
      id: itemIds[0],
      clientId,
      title: `${MARK}item-1`,
      company: `${PREFIX}sponsor-one`,
      presenter: `${PREFIX}Alice\n${PREFIX}Bob`,
      presenterCompany: `${PREFIX}Alpha\n${PREFIX}Beta`,
      startsAt: new Date(NOW),
      endsAt: new Date("2031-07-04T10:00:00Z"),
      status: "scheduled",
      sortOrder: 0,
    },
    {
      id: itemIds[1],
      clientId,
      title: `${MARK}item-2`,
      company: null,
      presenter: `${PREFIX}Carol`,
      presenterCompany: null,
      startsAt: new Date("2031-07-04T10:00:00Z"),
      endsAt: new Date("2031-07-04T11:00:00Z"),
      status: "scheduled",
      sortOrder: 1,
    },
    {
      id: itemIds[2],
      clientId,
      title: `${MARK}item-3`,
      company: `${PREFIX}sponsor-three`,
      presenter: null,
      presenterCompany: `${PREFIX}Affiliation only`,
      startsAt: new Date("2031-07-04T11:00:00Z"),
      endsAt: new Date("2031-07-04T12:00:00Z"),
      status: "scheduled",
      sortOrder: 2,
    },
  ]);

  const [{ id: sceneId }] = await db.insert(layoutTemplates).values({
    clientId,
    name: SCENE_NAME,
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
      agendaConfigId: configId,
    }],
  }).returning({ id: layoutTemplates.id });
  const [{ id: screenId }] = await db.insert(screens).values({
    clientId,
    name: SCREEN_NAME,
    displayProfileId: profileId,
    deviceToken: `${PREFIX}device`,
    isPaired: true,
    isOnline: true,
  }).returning({ id: screens.id });
  return { clientId, configId, sceneId, screenId, itemIds };
}

async function login(page: Page) {
  const deadline = Date.now() + 90_000;
  let lastResult = "not attempted";
  while (Date.now() < deadline) {
    try {
      const [health, agenda] = await Promise.all([
        page.request.get("/api/health", { timeout: 15_000 }),
        page.request.get("/agenda", { timeout: 15_000 }),
      ]);
      lastResult = `/api/health=${health.status()} /agenda=${agenda.status()}`;
      if (health.ok() && agenda.status() < 500) break;
    } catch (error) {
      lastResult = String(error);
    }
    await page.waitForTimeout(1_000);
  }
  expect(lastResult, "server and cold Vite route must become ready").toMatch(
    /\/api\/health=200 \/agenda=(200|304)/,
  );
  const [admin] = await db.select({ email: users.email }).from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`).limit(1);
  expect(admin, "an active admin is required for test auth").toBeTruthy();
  const response = await page.request.post("/api/auth/test-login", {
    data: { email: admin.email },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    timeout: 30_000,
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function selectSite(page: Page, clientId: string) {
  await page.addInitScript((id) => {
    localStorage.setItem("vectormesh_selected_client_id", id);
  }, clientId);
}

async function scrollBodyNormally(page: Page, dialog: Locator) {
  const body = dialog.locator("[class*='overflow-y-auto']").first();
  await expect(body).toBeVisible();
  await body.hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
}

async function capturePageModel(page: Page, rootTestId: string): Promise<string[][]> {
  const root = page.getByTestId(rootTestId);
  const pages = new Map<number, string[]>();
  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline && pages.size < 2) {
    const snapshot = await root.evaluate((node) => {
      const indicator = node.querySelector<HTMLElement>("[data-testid='agenda-session-count']")
        ?.textContent?.trim() ?? "";
      const match = indicator.match(/page\s+(\d+)\/(\d+)/i);
      const ids = [...node.querySelectorAll<HTMLElement>("[data-testid^='agenda-title-']")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            element.getClientRects().length > 0;
        })
        .map((element) => element.dataset.testid!.replace("agenda-title-", ""));
      return { page: Number(match?.[1] ?? 0), ids };
    });
    if (snapshot.page && snapshot.ids.length) pages.set(snapshot.page, snapshot.ids);
    await page.waitForTimeout(150);
  }
  return [pages.get(1) ?? [], pages.get(2) ?? []];
}

async function assertAgendaSurface(page: Page, rootTestId: string, fixture: Fixture) {
  const root = page.getByTestId(rootTestId);
  await expect(root).toBeVisible({ timeout: 20_000 });
  await expect(root).toContainText(`${PREFIX}sponsor-one`);
  await expect(root).toContainText(`${PREFIX}Alice`);
  await expect(root).toContainText(`${PREFIX}Alpha`);
  const firstPresenter = root.getByTestId(`agenda-presenter-${fixture.itemIds[0]}`);
  await expect(firstPresenter).toContainText(`${PREFIX}Alice`);
  const secondPresenter = root.getByTestId(`agenda-presenter-${fixture.itemIds[0]}:1`);
  await expect(secondPresenter).toContainText(`${PREFIX}Bob`);
  const firstCompany = root.getByTestId(`agenda-presenter-company-${fixture.itemIds[0]}`);
  const secondCompany = root.getByTestId(`agenda-presenter-company-${fixture.itemIds[0]}:1`);
  await expect(firstCompany).toContainText(`${PREFIX}Alpha`);
  await expect(secondCompany).toContainText(`${PREFIX}Beta`);
  const pairOrder = await root.locator(
    `[data-testid="agenda-presenter-${fixture.itemIds[0]}"], ` +
    `[data-testid="agenda-presenter-company-${fixture.itemIds[0]}"], ` +
    `[data-testid="agenda-presenter-${fixture.itemIds[0]}:1"], ` +
    `[data-testid="agenda-presenter-company-${fixture.itemIds[0]}:1"]`,
  ).evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()));
  expect(pairOrder).toEqual([
    `🎤${PREFIX}Alice`,
    `${PREFIX}Alpha`,
    `🎤${PREFIX}Bob`,
    `${PREFIX}Beta`,
  ]);
  await expect(root.getByTestId(`agenda-company-${fixture.itemIds[0]}`)).toHaveCSS("color", "rgb(255, 0, 170)");
  await expect(firstPresenter).toHaveCSS("color", "rgb(0, 85, 255)");
  await expect(firstCompany).toHaveCSS("color", "rgb(0, 170, 85)");
  await expect(root.getByTestId(`agenda-company-${fixture.itemIds[1]}`)).toHaveCount(0);
  await expect(root.getByTestId(`agenda-presenter-company-${fixture.itemIds[1]}`)).toHaveCount(0);
  await expect(root.getByTestId(`agenda-presenter-company-${fixture.itemIds[2]}`)).toHaveCount(0);
  const model = await capturePageModel(page, rootTestId);
  expect(model).toEqual([
    [fixture.itemIds[0], fixture.itemIds[1]],
    [fixture.itemIds[2]],
  ]);
  await expect(root.getByTestId(`agenda-company-${fixture.itemIds[2]}`)).toContainText(`${PREFIX}sponsor-three`);
  await expect(root.getByTestId(`agenda-presenter-company-${fixture.itemIds[2]}`)).toContainText(`${PREFIX}Affiliation only`);
  await expect(root.getByTestId(`agenda-presenter-${fixture.itemIds[2]}`)).toHaveCount(0);
}

test.describe("Agenda sponsor and presenter-company acceptance", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    await cleanup();
  });
  test.beforeEach(async () => {
    fixture = await seed();
  });
  test.afterEach(async () => {
    await cleanup();
  });
  test.afterAll(async () => {
    await pool.end();
  });

  test("keeps real item and display dialog footers reachable at 1280x720", async ({ page }) => {
    await login(page);
    await selectSite(page, fixture.clientId);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/agenda", { waitUntil: "domcontentloaded" });
    await page.getByTestId(`button-edit-${fixture.itemIds[0]}`).click();
    const itemDialog = page.getByRole("dialog");
    await expect(itemDialog).toContainText("Edit Agenda Item");
    await scrollBodyNormally(page, itemDialog);
    await itemDialog.getByTestId("input-agenda-presenter-company").fill(`${PREFIX}Edited affiliation`);
    await itemDialog.getByTestId("input-agenda-company").fill(`${PREFIX}Edited sponsor`);
    const itemSave = itemDialog.getByTestId("button-agenda-save");
    await expect(itemSave).toBeVisible();
    await expect(itemSave).toBeInViewport();
    await itemSave.click();
    await expect(itemDialog).toBeHidden();

    await page.goto("/agenda/displays", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-create-config").click();
    const configDialog = page.getByRole("dialog");
    await expect(configDialog).toContainText("New Widget Config");
    await configDialog.getByTestId("input-config-name").fill(`${PREFIX}edited-config`);
    await scrollBodyNormally(page, configDialog);
    await configDialog.getByTestId("switch-showPresenterCompany").click();
    await configDialog.getByTestId("input-presenterCompanyColor-hex").fill("#123456");
    await configDialog.getByTestId("input-companyColor-hex").fill("#654321");
    const configSave = configDialog.getByTestId("button-save-config");
    await expect(configSave).toBeVisible();
    await expect(configSave).toBeInViewport();
    await configSave.click();
    await expect(configDialog).toBeHidden();
  });

  test("renders ordered pairs, independent fields, empty space, and canonical pages in Scene Builder and Simulator", async ({ page, browser }) => {
    await login(page);
    await selectSite(page, fixture.clientId);
    await page.goto("/layouts", { waitUntil: "domcontentloaded" });
    await page.getByTestId(`layout-list-item-${fixture.sceneId}`).click();
    await page.getByTestId("input-layout-preview-test-date").fill("2031-07-04T09:00");
    await expect(page.getByTestId("interactive-layout-preview")).toBeVisible({ timeout: 20_000 });
    await assertAgendaSurface(page, "interactive-layout-preview", fixture);

    const simulator = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await login(simulator);
    await simulator.goto(`/simulator?at=${NOW}`, { waitUntil: "domcontentloaded" });
    await simulator.getByTestId("select-simulator-screen").click();
    await simulator.getByRole("option", { name: SCREEN_NAME, exact: true }).click();
    await simulator.getByTestId("select-simulator-layout").click();
    await simulator.getByRole("option", { name: `${SCENE_NAME} (1 zones)`, exact: true }).click();
    await assertAgendaSurface(simulator, "player-display", fixture);
    await simulator.close();
  });
});
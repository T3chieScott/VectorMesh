/**
 * Production-route parity coverage for status-filtered Agenda displays.
 *
 * The fixture deliberately has one cancelled item outside the initial filter,
 * two rooms, and a single video zone alongside the Agenda zone.  Player and
 * Monitor are left on their real content/Agenda/lease routes; only the binary
 * video response is fulfilled so this test does not depend on uploaded media.
 */
import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like, sql } from "drizzle-orm";
import {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, events,
  layoutTemplates, mediaAssets, playlistItems, playlists, programmeVersions,
  programmes, scheduleBlocks, screenEventBookings, screens, users,
} from "../../shared/schema";
import { readFileSync } from "node:fs";
import path from "node:path";

const MARK = "ZZTEST-STATUS-PARITY-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, events,
  layoutTemplates, mediaAssets, playlistItems, playlists, programmeVersions,
  programmes, scheduleBlocks, screenEventBookings, screens, users,
} });
const video = readFileSync(path.resolve("tests/e2e/fixtures/tiny-loop.webm"));
const INCLUDED = ["scheduled", "in_progress"];
const EXCLUDED = "cancelled";

type AgendaModel = { id: string; title: string; status: string };
type AgendaPayload = {
  config?: {
    id?: string;
    displayMode?: string;
    statusFilter?: string[];
    roomFilter?: string[];
    singleGlobalNowNext?: boolean;
    maxItemsPerPage?: number;
  };
  items?: AgendaModel[];
  payloadRevision?: string;
};
type Surface = {
  name: string;
  page: Page;
  rootTestId: string;
  agendaPayloads: AgendaPayload[];
  monitorContent: Array<Record<string, any>>;
  reports: any[];
};
type Seed = {
  clientId: string;
  configId: string;
  screenId: string;
  token: string;
  assetId: string;
  roomA: string;
  roomB: string;
  itemIds: { a1: string; a2: string; b1: string; a3: string; b2: string; excluded: string };
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
  const roomA = `${PREFIX}Room-A`;
  const roomB = `${PREFIX}Room-B`;
  const [{ id: clientId }] = await db.insert(clients)
    .values({ name: `${PREFIX}site` })
    .returning({ id: clients.id });
  const [{ id: profileId }] = await db.insert(displayProfiles).values({
    clientId, name: `${PREFIX}profile`, width: 1920, height: 1080,
  }).returning({ id: displayProfiles.id });
  const [{ id: configId }] = await db.insert(agendaWidgetConfigs).values({
    clientId, name: `${PREFIX}status-filtered-agenda`, displayMode: "full",
    layoutMode: "landscape", roomFilter: [roomA, roomB], statusFilter: INCLUDED,
    maxItemsPerPage: 2, rotationIntervalSeconds: 1, refreshIntervalSeconds: 5,
    eventName: `${PREFIX}event`, showEventName: true, showPresenter: false,
    showSessionCount: true, showDescription: false, showRoom: true,
    showTrack: false, showStatus: true, singleGlobalNowNext: false,
  }).returning({ id: agendaWidgetConfigs.id });

  const agendaNow = new Date();
  const rows = [
    ["a1", "Room A current", roomA, "in_progress", -1, 1],
    ["a2", "Room A next", roomA, "scheduled", 1, 2],
    ["b1", "Room B next", roomB, "scheduled", 2, 3],
    ["a3", "Room A later", roomA, "scheduled", 3, 4],
    ["b2", "Room B later", roomB, "scheduled", 4, 5],
    ["excluded", "Excluded cancelled session", roomB, EXCLUDED, 5, 6],
  ] as const;
  const itemIds = Object.fromEntries(rows.map(([key]) => [key, `${PREFIX}${key}`])) as Seed["itemIds"];
  await db.insert(agendaItems).values(rows.map(([key, title, room, status, start, end]) => ({
    id: itemIds[key], clientId, title: `${MARK}${title}`, room, status,
    startsAt: new Date(agendaNow.getTime() + start * 3_600_000),
    endsAt: new Date(agendaNow.getTime() + end * 3_600_000),
    description: `${MARK}${title} description`, sortOrder: start,
  })));

  const [{ id: assetId }] = await db.insert(mediaAssets).values({
    clientId, name: `${PREFIX}video`, originalPath: `${PREFIX}.webm`,
    mediaType: "video", mimeType: "video/webm", duration: 1,
  }).returning({ id: mediaAssets.id });
  const [{ id: playlistId }] = await db.insert(playlists).values({
    clientId, name: `${PREFIX}playlist`,
  }).returning({ id: playlists.id });
  const mediaItems = [{ id: `${PREFIX}video-item`, mediaAssetId: assetId, duration: 1 }];
  await db.insert(playlistItems).values({
    playlistId, mediaAssetId: assetId, order: 0, duration: 120,
  });
  const zones = [
    { id: "agenda", name: "Filtered Agenda", type: "agenda" as const,
      x: 0, y: 0, width: 72, height: 100, zIndex: 1, agendaConfigId: configId },
    { id: "video", name: "Continuity video", type: "media_player" as const,
      x: 72, y: 0, width: 28, height: 100, zIndex: 2,
      mediaPlayerItems: mediaItems, mediaPlayerAutoPlay: true,
      mediaPlayerMuted: true, mediaPlayerLoop: true, mediaPlayerFitMode: "contain",
      mediaPlayerTransition: "none" },
  ];
  const [{ id: layoutId }] = await db.insert(layoutTemplates).values({
    clientId, name: `${PREFIX}layout`, aspectRatio: "16:9", zones: zones as any,
  }).returning({ id: layoutTemplates.id });
  await db.update(playlistItems).set({ layoutTemplateId: layoutId })
    .where(sql`${playlistItems.playlistId} = ${playlistId}`);

  const scheduleNow = new Date();
  const [{ id: eventId }] = await db.insert(events).values({
    clientId, name: `${PREFIX}event`,
    startDate: new Date(scheduleNow.getTime() - 86_400_000),
    endDate: new Date(scheduleNow.getTime() + 86_400_000),
  }).returning({ id: events.id });
  const [{ id: programmeId }] = await db.insert(programmes)
    .values({ eventId, name: `${PREFIX}programme` })
    .returning({ id: programmes.id });
  const [{ id: versionId }] = await db.insert(programmeVersions).values({
    programmeId, versionNumber: 1, status: "published", publishedAt: scheduleNow,
  }).returning({ id: programmeVersions.id });
  const token = `${PREFIX}device`;
  const [{ id: screenId }] = await db.insert(screens).values({
    clientId, name: `${PREFIX}screen`, displayProfileId: profileId,
    deviceToken: token, isPaired: true, isOnline: true, fallbackPlaylistId: playlistId,
  }).returning({ id: screens.id });
  await db.insert(screenEventBookings).values({
    screenId, eventId, startsAt: new Date(scheduleNow.getTime() - 86_400_000),
    endsAt: new Date(scheduleNow.getTime() + 86_400_000),
  });
  await db.insert(scheduleBlocks).values({
    programmeVersionId: versionId, name: `${PREFIX}scheduled-layout`,
    layoutTemplateId: layoutId, targets: [{ type: "screen", id: screenId }],
    timeRules: [{
      startDate: new Date(scheduleNow.getTime() - 86_400_000).toISOString().slice(0, 10),
      endDate: new Date(scheduleNow.getTime() + 86_400_000).toISOString().slice(0, 10),
    }], zoneSources: [],
  });
  return { clientId, configId, screenId, token, assetId, roomA, roomB, itemIds };
}

async function login(page: Page) {
  const rows = await db.select({ email: users.email }).from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`).limit(1);
  expect(rows.length, "an active admin is required for test auth").toBe(1);
  const response = await page.request.post("/api/auth/test-login", {
    data: { email: rows[0].email },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  const body = await response.text();
  expect(response.status(), `test-login failed: ${body}`).toBe(200);
  expect(response.headers()["content-type"] || "").toContain("application/json");
  expect((await page.context().cookies()).some((cookie) => cookie.name === "connect.sid")).toBe(true);
}

function instrument(page: Page, seed: Seed) {
  return page.addInitScript(({ token, screenId }) => {
    localStorage.setItem("signage_device_token", token);
    localStorage.setItem("signage_screen_id", screenId);
    const w = window as any;
    w.__statusParity = { videoNodes: [], videoSerials: new WeakMap(), reports: [] };
    w.__statusParity.serialFor = (node: Element) => {
      let serial = w.__statusParity.videoSerials.get(node);
      if (serial === undefined) {
        serial = w.__statusParity.videoNodes.length;
        w.__statusParity.videoSerials.set(node, serial);
        w.__statusParity.videoNodes.push(node);
      }
      return serial;
    };
    const observe = () => document.querySelectorAll("video").forEach((node) => {
      w.__statusParity.serialFor(node);
      const v = node as HTMLVideoElement;
      w.__statusParity.reports.push({
        serial: w.__statusParity.serialFor(node), currentTime: v.currentTime,
        paused: v.paused, readyState: v.readyState, connected: v.isConnected,
      });
    });
    new MutationObserver(observe).observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(observe, 250);
    const fetch0 = window.fetch;
    window.fetch = async (...args: any[]) => {
      const input = args[0] as RequestInfo | URL;
      const request = input instanceof Request ? input : null;
      const url = request?.url ?? String(input);
      const response = await fetch0(...args);
      if (url.includes("/presentation") || url.includes("heartbeat")) {
        let body = args[1]?.body;
        if (body == null && request) {
          try { body = await request.clone().text(); } catch {}
        }
        w.__statusParity.reports.push({ url, status: response.status, body });
      }
      return response;
    };
  }, seed);
}

function observeSurface(page: Page, name: string, configId: string, monitorScreenId?: string): Surface {
  const surface: Surface = { name, page, rootTestId: "screen-render-committed-frame",
    agendaPayloads: [], monitorContent: [], reports: [] };
  page.on("request", (request) => {
    if (request.url().includes("/presentation") || request.url().includes("heartbeat")) {
      surface.reports.push({ kind: "request", url: request.url(), body: request.postData() });
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes(`/api/agenda/display/${configId}`)) {
      void response.json().then((body) => surface.agendaPayloads.push(body)).catch(() => {});
    }
    if (monitorScreenId && url.includes(`/api/monitor/${monitorScreenId}/content`)) {
      void response.json().then((body) => surface.monitorContent.push(body)).catch(() => {});
    }
  });
  return surface;
}

function models(payload: AgendaPayload): AgendaModel[] {
  return (payload.items ?? []).map((item) => ({
    id: item.id, title: item.title, status: item.status,
  }));
}

function pageModels(items: AgendaModel[], pageSize: number): AgendaModel[][] {
  const pages: AgendaModel[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}

function itemIds(items: AgendaModel[]) {
  return items.map((item) => item.id);
}

async function visibleDomPage(page: Page, rootTestId: string) {
  const root = page.getByTestId(rootTestId);
  return root.evaluate((element) => {
    const indicator = element.querySelector<HTMLElement>("[data-testid='agenda-session-count']")
      ?.textContent?.trim() ?? "";
    const match = indicator.match(/page\s+(\d+)\/(\d+)/i);
    const ids = [...element.querySelectorAll<HTMLElement>("[data-testid^='agenda-title-']")]
      .flatMap((node) => {
        const style = getComputedStyle(node);
        return style.display === "none" || style.visibility === "hidden" ||
          node.getClientRects().length === 0 ? [] : [node.dataset.testid!.replace("agenda-title-", "")];
      });
    return {
      page: Number(match?.[1] ?? (ids.length ? 1 : 0)),
      total: Number(match?.[2] ?? (ids.length ? 1 : 0)),
      ids,
    };
  }).catch(() => ({ page: 0, total: 0, ids: [] as string[] }));
}

async function capturePageModels(
  surface: Surface,
  expected: AgendaModel[][],
  label: string,
  timeout = 45_000,
): Promise<AgendaModel[][]> {
  const seen = new Map<number, string[]>();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && seen.size < expected.length) {
    const sample = await visibleDomPage(surface.page, surface.rootTestId);
    if (sample.page > 0 && sample.total === expected.length && sample.ids.length > 0) {
      seen.set(sample.page, sample.ids);
    }
    await surface.page.waitForTimeout(150);
  }
  const observed = expected.map((_, index) => seen.get(index + 1) ?? []);
  expect(observed, `${label} must expose every ordered page`).toEqual(expected.map(itemIds));
  return observed.map((ids) =>
    ids.map((id) => expected.flat().find((item) => item.id === id)!)
  );
}

async function waitForPayload(
  surface: Surface,
  predicate: (payload: AgendaPayload) => boolean,
  label: string,
) {
  await expect.poll(
    () => surface.agendaPayloads.some(predicate),
    { timeout: 25_000, message: `${surface.name} ${label} payload` },
  ).toBe(true);
  return [...surface.agendaPayloads].reverse().find(predicate)!;
}

async function assertPayloadContract(
  surfaces: Surface[],
  expected: AgendaModel[],
  expectedConfig: Partial<AgendaPayload["config"]>,
  label: string,
) {
  const payloads: AgendaPayload[] = [];
  for (const surface of surfaces) {
    await surface.page.bringToFront();
    payloads.push(await waitForPayload(surface, (payload) =>
      JSON.stringify(payload.config?.statusFilter) === JSON.stringify(expectedConfig.statusFilter) &&
      payload.config?.displayMode === expectedConfig.displayMode &&
      payload.config?.singleGlobalNowNext === expectedConfig.singleGlobalNowNext &&
      itemIds(models(payload)).join(",") === itemIds(expected).join(","),
      label));
  }
  const revisions = payloads.map((payload) => payload.payloadRevision);
  expect(revisions.every((revision) => typeof revision === "string" && revision.length > 0), `${label} revisions`).toBe(true);
  expect(revisions[0], `${label} Player/Monitor payload revision`).toBe(revisions[1]);
  expect(payloads[0].config, `${label} Player/Monitor config parity`).toMatchObject(expectedConfig);
  expect(payloads[1].config, `${label} Player/Monitor config parity`).toMatchObject(expectedConfig);
  expect(models(payloads[0]), `${label} ordered model parity`).toEqual(expected);
  expect(models(payloads[1]), `${label} ordered model parity`).toEqual(expected);
  for (const payload of payloads) {
    const allowed = new Set(payload.config?.statusFilter ?? []);
    expect((payload.items ?? []).every((item) => allowed.has(item.status)),
      `${label} exposes an item outside its status filter`).toBe(true);
  }
  return payloads[0];
}

async function assertVideoContinuity(surface: Surface, serial: number, label: string) {
  await expect.poll(async () => surface.page.evaluate((wanted) => {
    const state = (window as any).__statusParity;
    const node = state.videoNodes[wanted] as HTMLVideoElement | undefined;
    return node ? {
      serial: wanted, connected: node.isConnected, paused: node.paused,
      ready: node.readyState >= 2, currentTime: node.currentTime,
    } : null;
  }, serial), { timeout: 8_000, message: `${label} video continuity` }).toMatchObject({
    serial, connected: true, paused: false, ready: true,
  });
}

test.describe("status-filtered Agenda Player/Monitor parity", () => {
  let s: Seed;
  test.beforeAll(async () => { await cleanup(); s = await seed(); });
  test.afterAll(async () => { try { await cleanup(); } finally { await pool.end(); } });

  test("keeps filtered membership, pages, live refresh, lease, and video continuity identical", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const control = await ctx.newPage();
    await login(control);

    const player = await ctx.newPage();
    await instrument(player, s);
    await player.route(`**/api/player/media/${s.assetId}/file*`, (route) =>
      route.fulfill({ status: 200, contentType: "video/webm", body: video }));
    const playerSurface = observeSurface(player, "Player", s.configId);
    await player.goto("/player", { waitUntil: "commit" });
    const playerFrame = player.getByTestId("screen-render-committed-frame");
    await expect(playerFrame).toBeVisible({ timeout: 30_000 });
    await expect(playerFrame.getByTestId("media-player-widget")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => player.evaluate(() => {
      const v = [...document.querySelectorAll("[data-testid='screen-render-committed-frame'] video")]
        .find((node) => !(node as HTMLVideoElement).paused) as HTMLVideoElement | undefined;
      return v ? { ready: v.readyState >= 2, serial: (window as any).__statusParity.serialFor(v) } : null;
    }), { timeout: 20_000, message: "Player video baseline" }).toMatchObject({ ready: true });
    const videoSerial = await player.evaluate(() => {
      const v = [...document.querySelectorAll("[data-testid='screen-render-committed-frame'] video")]
        .find((node) => !(node as HTMLVideoElement).paused)!;
      return (window as any).__statusParity.serialFor(v);
    });

    const monitor = await ctx.newPage();
    await login(monitor);
    const create = await control.request.post(`/api/operations/screens/${s.screenId}/monitor-session`, {
      data: { clientType: "multiview", clientName: `${MARK}monitor` },
    });
    expect(create.status(), await create.text()).toBe(201);
    const monitorUrl = new URL((await create.json()).monitorUrl);
    await monitor.route(`**/media/${s.assetId}/file*`, (route) =>
      route.fulfill({ status: 200, contentType: "video/webm", body: video }));
    const monitorSurface = observeSurface(monitor, "Monitor", s.configId, s.screenId);
    await instrument(monitor, s);
    await monitor.goto(`${process.env.E2E_BASE_URL || "http://127.0.0.1:5000"}${monitorUrl.pathname}${monitorUrl.search}`, { waitUntil: "commit" });
    const monitorFrame = monitor.getByTestId("screen-render-committed-frame");
    await expect(monitorFrame).toBeVisible({ timeout: 30_000 });
    await expect(monitorFrame.getByTestId("media-player-widget")).toBeVisible({ timeout: 30_000 });
    await expect(monitor.locator("body")).not.toContainText("Monitor session expired");
    await expect.poll(() => monitor.evaluate(() => {
      const v = [...document.querySelectorAll("[data-testid='screen-render-committed-frame'] video")]
        .find((node) => !(node as HTMLVideoElement).paused) as HTMLVideoElement | undefined;
      return v ? { ready: v.readyState >= 2, serial: (window as any).__statusParity.serialFor(v) } : null;
    }), { timeout: 20_000, message: "Monitor video baseline" }).toMatchObject({ ready: true });
    const monitorVideoSerial = await monitor.evaluate(() => {
      const v = [...document.querySelectorAll("[data-testid='screen-render-committed-frame'] video")]
        .find((node) => !(node as HTMLVideoElement).paused)!;
      return (window as any).__statusParity.serialFor(v);
    });

    const initialItems: AgendaModel[] = [
      { id: s.itemIds.a1, title: `${MARK}Room A current`, status: "in_progress" },
      { id: s.itemIds.a2, title: `${MARK}Room A next`, status: "scheduled" },
      { id: s.itemIds.b1, title: `${MARK}Room B next`, status: "scheduled" },
      { id: s.itemIds.a3, title: `${MARK}Room A later`, status: "scheduled" },
      { id: s.itemIds.b2, title: `${MARK}Room B later`, status: "scheduled" },
    ];
    const excluded = { id: s.itemIds.excluded, title: `${MARK}Excluded cancelled session`, status: EXCLUDED };
    const fullPages = pageModels(initialItems, 2);
    const fullPayload = await assertPayloadContract(
      [playerSurface, monitorSurface], initialItems,
      { displayMode: "full", statusFilter: INCLUDED, roomFilter: [s.roomA, s.roomB], singleGlobalNowNext: false },
      "full filtered Agenda",
    );
    expect(models(fullPayload)).toContainEqual(initialItems[0]);
    expect(models(fullPayload)).toContainEqual(initialItems[1]);
    expect(models(fullPayload)).not.toContainEqual(excluded);
    await capturePageModels(playerSurface, fullPages, "Player full");
    await capturePageModels(monitorSurface, fullPages, "Monitor full");
    await assertVideoContinuity(playerSurface, videoSerial, "full");
    await assertVideoContinuity(monitorSurface, monitorVideoSerial, "Monitor full");

    const perRoom = [initialItems[0], initialItems[1], initialItems[2]];
    const setPerRoom = await control.request.patch(`/api/agenda/configs/${s.configId}`, {
      data: { displayMode: "now_next", singleGlobalNowNext: false },
    });
    expect(setPerRoom.status(), await setPerRoom.text()).toBe(200);
    const perRoomPayload = await assertPayloadContract(
      [playerSurface, monitorSurface], perRoom,
      { displayMode: "now_next", statusFilter: INCLUDED, singleGlobalNowNext: false },
      "per-room now_next",
    );
    expect(models(perRoomPayload)).not.toContainEqual(excluded);
    const perRoomPages = [[initialItems[0]], [initialItems[1], initialItems[2]]];
    const playerPerRoom = await capturePageModels(playerSurface, perRoomPages, "Player per-room now_next");
    const monitorPerRoom = await capturePageModels(monitorSurface, perRoomPages, "Monitor per-room now_next");
    expect(monitorPerRoom, "Monitor must follow Player per-room pages").toEqual(playerPerRoom);
    await assertVideoContinuity(playerSurface, videoSerial, "per-room now_next");
    await assertVideoContinuity(monitorSurface, monitorVideoSerial, "Monitor per-room now_next");

    const global = [initialItems[0], initialItems[1]];
    const setGlobal = await control.request.patch(`/api/agenda/configs/${s.configId}`, {
      data: { singleGlobalNowNext: true },
    });
    expect(setGlobal.status(), await setGlobal.text()).toBe(200);
    const globalPayload = await assertPayloadContract(
      [playerSurface, monitorSurface], global,
      { displayMode: "now_next", statusFilter: INCLUDED, singleGlobalNowNext: true },
      "global now_next",
    );
    expect(models(globalPayload)).not.toContainEqual(excluded);
    const globalPages = [[initialItems[0]], [initialItems[1]]];
    const playerGlobal = await capturePageModels(playerSurface, globalPages, "Player global now_next");
    const monitorGlobal = await capturePageModels(monitorSurface, globalPages, "Monitor global now_next");
    expect(monitorGlobal, "Monitor must follow Player global pages").toEqual(playerGlobal);
    await assertVideoContinuity(playerSurface, videoSerial, "global now_next");
    await assertVideoContinuity(monitorSurface, monitorVideoSerial, "Monitor global now_next");

    // A live status transition must not leak the now-cancelled session while
    // the old filter is still active.  Every response received for every
    // phase is checked below, so a transient intermediate payload cannot hide
    // an excluded item behind a stale DOM frame.
    await pool.query("UPDATE agenda_items SET status = $1 WHERE id = $2", [EXCLUDED, s.itemIds.a2]);
    const postStatus = await assertPayloadContract(
      [playerSurface, monitorSurface], [initialItems[0], initialItems[2]],
      { displayMode: "now_next", statusFilter: INCLUDED, singleGlobalNowNext: true },
      "included-to-excluded status refresh",
    );
    expect(models(postStatus)).not.toContainEqual({ ...initialItems[1], status: EXCLUDED });
    const postStatusPages = [[initialItems[0]], [initialItems[2]]];
    await capturePageModels(playerSurface, postStatusPages, "Player post-status");
    await capturePageModels(monitorSurface, postStatusPages, "Monitor post-status");
    await assertVideoContinuity(playerSurface, videoSerial, "post-status");
    await assertVideoContinuity(monitorSurface, monitorVideoSerial, "Monitor post-status");

    // Changing only the config filter makes the transitioned item eligible
    // again.  It is the first upcoming item, so global now_next presents it
    // while preserving the same resolver/order/page contract.
    const setCancelled = await control.request.patch(`/api/agenda/configs/${s.configId}`, {
      data: { statusFilter: [EXCLUDED] },
    });
    expect(setCancelled.status(), await setCancelled.text()).toBe(200);
    const cancelledOnly = [{ id: s.itemIds.a2, title: `${MARK}Room A next`, status: EXCLUDED }];
    const cancelledPayload = await assertPayloadContract(
      [playerSurface, monitorSurface], cancelledOnly,
      { displayMode: "now_next", statusFilter: [EXCLUDED], singleGlobalNowNext: true },
      "config-filter refresh",
    );
    expect(models(cancelledPayload)).toEqual(cancelledOnly);
    const playerCancelled = await capturePageModels(playerSurface, pageModels(cancelledOnly, 2), "Player cancelled filter");
    const monitorCancelled = await capturePageModels(monitorSurface, pageModels(cancelledOnly, 2), "Monitor cancelled filter");
    expect(monitorCancelled, "Monitor must follow Player after config refresh").toEqual(playerCancelled);
    await assertVideoContinuity(playerSurface, videoSerial, "config refresh");
    await assertVideoContinuity(monitorSurface, monitorVideoSerial, "Monitor config refresh");

    // The resolver's public contract is the final guard against a stale or
    // mixed page: each payload must contain only statuses named by its own
    // config, including all responses observed between polling boundaries.
    for (const surface of [playerSurface, monitorSurface]) {
      expect(surface.agendaPayloads.length, `${surface.name} must expose display payloads`).toBeGreaterThan(0);
      for (const payload of surface.agendaPayloads) {
        const allowed = new Set(payload.config?.statusFilter ?? []);
        expect((payload.items ?? []).every((item) => allowed.has(item.status)),
          `${surface.name} intermediate Agenda model exposed an excluded item`).toBe(true);
        expect(payload.payloadRevision, `${surface.name} payload revision`).toEqual(expect.any(String));
      }
      expect(surface.monitorContent.every((body) => body.playerPresentationState === null ||
        typeof body.playerPresentationState === "object"),
      `${surface.name} monitor authority shape`).toBe(true);
    }
    const monitorContent = await monitor.request.get(`/api/monitor/${s.screenId}/content`, {
      headers: { Accept: "application/json" },
    });
    expect(monitorContent.status(), await monitorContent.text()).toBe(200);
    const presentation = await monitor.request.get(`/api/monitor/${s.screenId}/presentation`, {
      headers: { Accept: "application/json" },
    });
    expect(presentation.status(), await presentation.text()).toBe(200);
    await expect(monitor.locator("body")).not.toContainText(/Monitor session expired|session invalid/i);
    await expectVideoReport(player, videoSerial);
    await ctx.close();
  });
});

async function expectVideoReport(player: Page, serial: number) {
  await expect.poll(() => player.evaluate((wanted) => {
    const state = (window as any).__statusParity;
    return state.reports.some((report: any) => report.serial === wanted) ||
      state.videoNodes[wanted]?.isConnected === true;
  }, serial), { timeout: 5_000, message: "Player retained the video element lease" }).toBe(true);
}
/**
 * Production-shaped lifecycle regression (instrumentation only).
 *
 * This deliberately does not stub /content, the agenda display API, the
 * monitor API, or React components.  The only intercepted request is the
 * binary media file, making the test hermetic while leaving Player and
 * Monitor on their real server routes and render surfaces.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like, sql } from "drizzle-orm";
import {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, events,
  layoutTemplates, mediaAssets, playlistItems, playlists, programmeVersions,
  programmes, scheduleBlocks, screenEventBookings, screens, users, monitorSessions,
} from "../../shared/schema";

const MARK = "ZZTEST-LIFECYCLE-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 8)}-`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: {
  agendaItems, agendaWidgetConfigs, clients, displayProfiles, events,
  layoutTemplates, mediaAssets, playlistItems, playlists, programmeVersions,
  programmes, scheduleBlocks, screenEventBookings, screens, users, monitorSessions,
} });
const fixture = readFileSync(path.resolve("tests/e2e/fixtures/tiny-loop.webm"));

type Seed = { screenId: string; token: string; assetId: string };

async function cleanup() {
  // The stable marker also removes rows left by a killed browser run.
  await db.delete(scheduleBlocks).where(like(scheduleBlocks.name, `${MARK}%`));
  await db.delete(agendaItems).where(like(agendaItems.title, `${MARK}%`));
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${MARK}%`));
  await db.delete(playlistItems).where(sql`${playlistItems.playlistId} in (select id from playlists where name like ${`${MARK}%`})`);
  await db.delete(playlists).where(like(playlists.name, `${MARK}%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${MARK}%`));
  await db.delete(mediaAssets).where(like(mediaAssets.name, `${MARK}%`));
  await db.delete(screenEventBookings).where(sql`${screenEventBookings.screenId} in (select id from screens where name like ${`${MARK}%`})`);
  await db.delete(events).where(like(events.name, `${MARK}%`));
  await db.delete(screens).where(like(screens.name, `${MARK}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${MARK}%`));
  await db.delete(clients).where(like(clients.name, `${MARK}%`));
}

async function seed(): Promise<Seed> {
  const [{ id: clientId }] = await db.insert(clients).values({ name: `${PREFIX}client` }).returning({ id: clients.id });
  const [{ id: profileId }] = await db.insert(displayProfiles).values({ clientId, name: `${PREFIX}profile`, width: 1920, height: 1080 }).returning({ id: displayProfiles.id });
  const [{ id: assetId }] = await db.insert(mediaAssets).values({
    clientId, name: `${PREFIX}same-video`, originalPath: `${PREFIX}.webm`,
    mediaType: "video", mimeType: "video/webm", duration: 1,
  }).returning({ id: mediaAssets.id });
  const [{ id: playlistId }] = await db.insert(playlists).values({ clientId, name: `${PREFIX}video-loop` }).returning({ id: playlists.id });
  await db.insert(playlistItems).values({ playlistId, mediaAssetId: assetId, order: 0, duration: 1 });
  const now = Date.now();
  const [{ id: nowNextId }] = await db.insert(agendaWidgetConfigs).values({
    clientId, name: `${PREFIX}agenda-now-next`, displayMode: "now_next", layoutMode: "card",
    eventName: `${MARK}NOW_NEXT_SCENE`, showEventName: true,
    roomFilter: ["NowNext"],
    maxItemsPerPage: 1, rotationIntervalSeconds: 3, refreshIntervalSeconds: 5,
  }).returning({ id: agendaWidgetConfigs.id });
  const [{ id: fullAgendaId }] = await db.insert(agendaWidgetConfigs).values({
    clientId, name: `${PREFIX}agenda-full`, displayMode: "full", layoutMode: "card",
    eventName: `${MARK}FULL_AGENDA_SCENE`, showEventName: true,
    maxItemsPerPage: 1, rotationIntervalSeconds: 3, refreshIntervalSeconds: 5,
  }).returning({ id: agendaWidgetConfigs.id });
  await db.insert(agendaItems).values(Array.from({ length: 4 }, (_, i) => ({
    clientId, title: `${MARK}page-${i + 1}`, description: `identical scene page ${i + 1}`,
    startsAt: new Date(now - 60_000 + i * 120_000), endsAt: new Date(now + 3600_000),
    status: i === 0 ? "in_progress" : "scheduled", room: i < 2 ? "NowNext" : "Agenda",
  })));
  // This is intentionally the same `mediaPlayerItems` shape produced by
  // buildContentPresentation for a layout-rotation item. Rotation items do
  // not receive zone-source injection, so every template carries the same
  // asset identity explicitly.
  const mediaBottom = [{ id: `${PREFIX}same-video-item`, mediaAssetId: assetId, duration: 1 }];
  const nowNextZones = [
    { id: "agenda", name: "Agenda NOW/NEXT", type: "agenda" as const, x: 0, y: 0, width: 100, height: 75, zIndex: 1, agendaConfigId: nowNextId },
    // A playlist source is injected by buildContentPresentation as
    // mediaPlayerItems. A plain `media` zone does not consume that injection
    // (and was the reason the first setup rendered Agenda only).
    { id: "video", name: "Video", type: "media_player" as const, x: 0, y: 75, width: 100, height: 25, zIndex: 2,
      mediaPlayerItems: mediaBottom, mediaPlayerAutoPlay: true, mediaPlayerMuted: true,
      mediaPlayerLoop: true, mediaPlayerFitMode: "contain", mediaPlayerTransition: "none" },
  ];
  const [{ id: nowNextLayoutId }] = await db.insert(layoutTemplates).values({
    clientId, name: `${PREFIX}layout-now-next`, aspectRatio: "16:9", zones: nowNextZones as any,
  }).returning({ id: layoutTemplates.id });
  const [{ id: fullLayoutId }] = await db.insert(layoutTemplates).values({
    clientId, name: `${PREFIX}layout-full`, aspectRatio: "16:9", zones: [
      { ...nowNextZones[0], name: "Agenda 1/4..4/4", agendaConfigId: fullAgendaId },
      nowNextZones[1],
    ] as any,
  }).returning({ id: layoutTemplates.id });
  const [{ id: nextLayoutId }] = await db.insert(layoutTemplates).values({
    clientId, name: `${PREFIX}layout-next-scene`, aspectRatio: "16:9", zones: [
      { id: "next", name: "Next scene", type: "text" as const, x: 0, y: 0, width: 100, height: 75, zIndex: 1, textContent: `${MARK}next-scene` },
      nowNextZones[1],
    ] as any,
  }).returning({ id: layoutTemplates.id });
  const [{ id: eventId }] = await db.insert(events).values({
    clientId, name: `${PREFIX}event`, startDate: new Date(now - 86_400_000), endDate: new Date(now + 86_400_000),
  }).returning({ id: events.id });
  const [{ id: programmeId }] = await db.insert(programmes).values({ eventId, name: `${PREFIX}programme` }).returning({ id: programmes.id });
  const [{ id: versionId }] = await db.insert(programmeVersions).values({ programmeId, versionNumber: 1, status: "published", publishedAt: new Date() }).returning({ id: programmeVersions.id });
  const token = `${PREFIX}device`;
  const [{ id: screenId }] = await db.insert(screens).values({
    name: `${PREFIX}screen`, clientId, displayProfileId: profileId, deviceToken: token,
    isPaired: true, isOnline: true, fallbackPlaylistId: playlistId,
  }).returning({ id: screens.id });
  await db.insert(screenEventBookings).values({ screenId, eventId, startsAt: new Date(now - 86_400_000), endsAt: new Date(now + 86_400_000) });
  await db.insert(scheduleBlocks).values({
    programmeVersionId: versionId, name: `${PREFIX}fallback-rotation`, layoutTemplateId: null,
    targets: [{ type: "screen", id: screenId }], timeRules: [{
      startDate: new Date(now - 86_400_000).toISOString().slice(0, 10),
      endDate: new Date(now + 86_400_000).toISOString().slice(0, 10),
    }], zoneSources: [{ zoneId: "__fallback__", type: "playlist", playlistId }],
  });
  await db.insert(playlistItems).values([
    { playlistId, mediaAssetId: null, layoutTemplateId: nowNextLayoutId, order: 0, duration: 6 },
    { playlistId, mediaAssetId: null, layoutTemplateId: fullLayoutId, order: 1, duration: 15 },
    { playlistId, mediaAssetId: null, layoutTemplateId: nextLayoutId, order: 2, duration: 3 },
  ]);
  return { screenId, token, assetId };
}

async function instrument(page: Page, s: Seed) {
  await page.addInitScript(({ token, screenId }) => {
    localStorage.setItem("signage_device_token", token);
    localStorage.setItem("signage_screen_id", screenId);
    const w = window as any;
    w.__vmLifecycle = { nodes: [], media: [], calls: [], reports: [], content: [] };
    const serials = new WeakMap<Element, number>();
    const serialFor = (node: Element) => {
      let serial = serials.get(node);
      if (serial === undefined) {
        serial = w.__vmLifecycle.nodes.length;
        serials.set(node, serial);
        w.__vmLifecycle.nodes.push(node);
      }
      return serial;
    };
    w.__vmLifecycle.serialFor = serialFor;
    const oldPlay = HTMLMediaElement.prototype.play;
    const oldPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function (...args: any[]) {
      w.__vmLifecycle.calls.push({ op: "play", node: this, serial: serialFor(this), caller: new Error().stack });
      return oldPlay.apply(this, args);
    };
    HTMLMediaElement.prototype.pause = function (...args: any[]) {
      w.__vmLifecycle.calls.push({ op: "pause", node: this, serial: serialFor(this), caller: new Error().stack });
      return oldPause.apply(this, args);
    };
    const report = (v: HTMLVideoElement) => w.__vmLifecycle.media.push({
      node: v, serial: serialFor(v), src: v.currentSrc || v.src, currentTime: v.currentTime,
       paused: v.paused, ended: v.ended, readyState: v.readyState,
       visibility: document.visibilityState, intended: v.autoplay && v.loop,
      networkState: v.networkState, error: v.error && { code: v.error.code, message: v.error.message },
      owner: v.closest("[data-testid^='screen-render-']")?.getAttribute("data-testid") ?? "unowned",
      layer: v.parentElement?.parentElement?.getAttribute("data-player-active") ===
        (v.parentElement?.parentElement?.firstElementChild === v.parentElement ? "a" : "b")
        ? "active" : "inactive",
    });
    new MutationObserver(() => document.querySelectorAll("video").forEach((v) => {
      serialFor(v);
       report(v);
       for (const event of ["play", "playing", "pause", "ended", "waiting", "stalled", "error", "timeupdate", "loadedmetadata"]) {
         v.addEventListener(event, () => {
           w.__vmLifecycle.mediaEvent = event;
           report(v);
         });
       }
    })).observe(document.documentElement, { childList: true, subtree: true });
     let lastMarker = "";
     window.setInterval(() => {
       document.querySelectorAll("video").forEach(report);
       const title = [...document.querySelectorAll("[data-testid*='agenda-title']")]
         .map((n) => n.textContent?.trim()).filter(Boolean).join("|");
       const marker = `${location.pathname}|${title}`;
       if (marker !== lastMarker) {
         lastMarker = marker;
         const v = document.querySelector("video") as HTMLVideoElement | null;
         console.info("[lifecycle-diagnostic]", JSON.stringify({
           at: Date.now(), marker, title, video: v && {
             node: (window as any).__vmLifecycle.nodes.indexOf(v),
             owner: v.closest("[data-testid^='screen-render-']")?.getAttribute("data-testid") ?? "unowned",
             layer: v.parentElement?.parentElement?.getAttribute("data-player-active") ===
               (v.parentElement?.parentElement?.firstElementChild === v.parentElement ? "a" : "b")
               ? "active" : "inactive",
             currentTime: v.currentTime, src: v.currentSrc || v.src,
             paused: v.paused, ended: v.ended, readyState: v.readyState,
             networkState: v.networkState, error: v.error && { code: v.error.code, message: v.error.message },
             visibility: document.visibilityState, event: (window as any).__vmLifecycle.mediaEvent,
           },
         }));
       }
     }, 250);
    const fetch0 = window.fetch;
    window.fetch = async (...args: any[]) => {
      const input = args[0] as RequestInfo | URL;
      const request = input instanceof Request ? input : null;
      const url = request?.url ?? String(input);
      const response = await fetch0(...args);
      if (url.includes("heartbeat") || url.includes("presentation")) {
        let body = args[1]?.body;
        if (body == null && request) {
          try { body = await request.clone().text(); } catch {}
        }
        w.__vmLifecycle.reports.push({ at: Date.now(), url, status: response.status, body });
      }
      if (url.includes("/content")) w.__vmLifecycle.content.push(url);
      return response;
    };
  }, { token: s.token, screenId: s.screenId });
}

test.describe("production lifecycle: same video through NOW/NEXT + Agenda and Monitor", () => {
  let s: Seed;
  test.beforeAll(async () => { await cleanup(); s = await seed(); });
  test.afterAll(async () => { try { await cleanup(); } finally { await pool.end(); } });

  test("Player keeps one playing video while agenda scenes rotate; Monitor follows lease", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const player = await ctx.newPage();
    const routeDiagnostics: Array<Record<string, unknown>> = [];
    player.on("requestfailed", (request) => {
      routeDiagnostics.push({ at: Date.now(), kind: "requestfailed", url: request.url(), failure: request.failure()?.errorText });
    });
    player.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/player/") || url.includes("/api/agenda/")) {
        routeDiagnostics.push({ at: Date.now(), kind: "response", url, status: response.status(), contentType: response.headers()["content-type"] });
      }
    });
    player.on("console", (message) => {
      if (message.text().includes("[lifecycle-diagnostic]") || message.type() === "error")
        console.log(`[player:${message.type()}] ${message.text()}`);
    });
    await player.route(`**/api/player/media/${s.assetId}/file*`, async (r) => {
      routeDiagnostics.push({ at: Date.now(), kind: "media-route", url: r.request().url(), status: 200, contentType: "video/webm" });
      await r.fulfill({ status: 200, contentType: "video/webm", body: fixture });
    });
    await instrument(player, s);
    await player.goto("/player", { waitUntil: "domcontentloaded" });
    const committed = player.getByTestId("screen-render-committed-frame");
    const committedVideoWidget = committed.getByTestId("media-player-widget");
    const activeVideo = () => committed.locator(
      "[data-testid='media-player-widget'][data-player-active='a'] > div:nth-child(1) video, " +
      "[data-testid='media-player-widget'][data-player-active='b'] > div:nth-child(2) video",
    );
    await expect(committedVideoWidget).toBeVisible({ timeout: 30_000 });
    const dump = async (label: string) => {
      const browserState = await player.evaluate(() => {
        const w = (window as any).__vmLifecycle;
        return {
          title: [...document.querySelectorAll("[data-testid='screen-render-committed-frame'] [data-testid*='agenda-title']")].map((n) => n.textContent),
          eventName: document.querySelector("[data-testid='screen-render-committed-frame'] [data-testid='agenda-event-title']")?.textContent,
          videos: [...document.querySelectorAll("video")].map((node) => {
            const v = node as HTMLVideoElement;
            const widget = v.closest("[data-testid='media-player-widget']");
            const layer = widget?.firstElementChild === v.parentElement ? "a" : "b";
            return { serial: w.serialFor(v), owner: v.closest("[data-testid^='screen-render-']")?.getAttribute("data-testid"),
              layer, activeLayer: widget?.getAttribute("data-player-active"),
              readinessExempt: v.getAttribute("data-screen-render-readiness-exempt"),
              currentTime: v.currentTime, src: v.currentSrc || v.src, paused: v.paused, ended: v.ended,
              readyState: v.readyState, networkState: v.networkState, error: v.error && { code: v.error.code, message: v.error.message } };
          }),
          calls: w.calls.slice(-12).map((c: any) => ({ op: c.op, serial: w.nodes.indexOf(c.node), caller: c.caller })),
          reports: w.reports.slice(-5),
          media: w.media.slice(-12).map((m: any) => ({ ...m, node: w.nodes.indexOf(m.node) })),
        };
      });
      console.log("[lifecycle-failure]", JSON.stringify({ label, routeDiagnostics, browserState }));
    };
    // Epoch-derived rotation may enter at any template. Observe the authored
    // cycle until the committed NOW/NEXT scene wraps into view; do not rebase
    // or force the Player's internal index.
    await expect(committed.getByTestId("agenda-event-title")).toHaveText(`${MARK}NOW_NEXT_SCENE`, { timeout: 45_000 });
    try {
      await expect.poll(async () => activeVideo().evaluate((v) => {
        const video = v as HTMLVideoElement;
        return !video.paused && video.readyState >= 2;
      }), { timeout: 20_000, message: "committed video baseline must become ready and playing" })
        .toBe(true);
    } catch (error) {
      await dump("baseline-video-poisoned-before-authored-NOW");
      throw error;
    }
    const baselineSerial = await activeVideo().evaluate((v) =>
      (window as any).__vmLifecycle.serialFor(v),
    );
    const baseline = await activeVideo().evaluate((node) => {
      const v = node as HTMLVideoElement;
      return { currentTime: v.currentTime, stats: (window as any).__vmPlayerVideoStats ?? { stalls: 0, recoveries: 0, reloads: 0 } };
    });
    const observeCycle = async (cycle: number) => {
      await expect(committed.getByTestId("agenda-event-title")).toHaveText(`${MARK}NOW_NEXT_SCENE`, { timeout: 30_000 });
      await expect(committed.locator("[data-testid*='agenda-title']")).toContainText(`${MARK}page-1`, { timeout: 8_000 });
      await expect(committed.locator("[data-testid*='agenda-title']")).toContainText(`${MARK}page-2`, { timeout: 8_000 });
      await expect(committed.getByTestId("agenda-event-title")).toHaveText(`${MARK}FULL_AGENDA_SCENE`, { timeout: 12_000 });
      await expect(committed.locator("[data-testid*='agenda-title']")).toContainText(`${MARK}page-1`, { timeout: 8_000 });
      const pageOne = await activeVideo().evaluate((node) => {
        const v = node as HTMLVideoElement;
        const w = (window as any).__vmLifecycle;
        return {
          serial: w.serialFor(v), currentTime: v.currentTime, duration: v.duration,
          paused: v.paused, readyState: v.readyState, ended: v.ended,
          attrs: Object.fromEntries([...v.attributes].map((a) => [a.name, a.value])),
          owner: v.closest("[data-testid^='screen-render-']")?.getAttribute("data-testid"),
          stats: (window as any).__vmPlayerVideoStats ?? { stalls: 0, recoveries: 0, reloads: 0 },
        };
      });
      expect(pageOne.serial, `cycle ${cycle} Agenda 1/4 authoritative node`).toBe(baselineSerial);
      expect(pageOne.readyState, `cycle ${cycle} Agenda 1/4 readyState`).toBeGreaterThanOrEqual(2);
      expect(pageOne.paused, `cycle ${cycle} Agenda 1/4 remains playing`).toBe(false);
      expect(pageOne.stats, `cycle ${cycle} transition stats`).toEqual(baseline.stats);
      const transitionTime = pageOne.currentTime;
      await expect.poll(async () => activeVideo().evaluate((v, priorTime) => {
        const video = v as HTMLVideoElement;
        return video.currentTime > priorTime + 0.15 ||
          (Number.isFinite(video.duration) && priorTime - video.currentTime > video.duration / 2);
      }, transitionTime), {
        timeout: 2_000,
        message: `cycle ${cycle} currentTime advances or genuinely loops`,
      }).toBe(true);
      for (const i of [1, 2, 3, 4]) {
        await expect.poll(() => committed.locator(`[data-testid*="agenda-title"]`).allTextContents(),
          { timeout: 8_000, message: `cycle ${cycle}: full Agenda ${i}/4` })
          .toContain(`${MARK}page-${i}`);
      }
      await expect(committed.getByText(`${MARK}next-scene`)).toBeVisible({ timeout: 12_000 });
      await expect(committed.getByTestId("agenda-event-title")).toHaveText(`${MARK}NOW_NEXT_SCENE`, { timeout: 12_000 });
    };
    try {
      await observeCycle(1);
      await observeCycle(2);
    } catch (error) {
      await dump("authored-rotation-diverged");
      throw error;
    }
    await expect.poll(async () => {
      const video = activeVideo();
      if (await video.count() !== 1) return null;
      return video.evaluate((node) => {
        const media = node as HTMLVideoElement;
        return {
          serial: (window as any).__vmLifecycle.serialFor(node),
          connected: media.isConnected,
          paused: media.paused,
          ready: media.readyState >= 2,
        };
      });
    }, {
      timeout: 2_000,
      message: "exact playing video owner must settle with the committed frame",
    }).toEqual({
      serial: baselineSerial,
      connected: true,
      paused: false,
      ready: true,
    });
    const stats = await player.evaluate(() => (window as any).__vmPlayerVideoStats);
    expect(stats ?? { stalls: 0, recoveries: 0, reloads: 0 }).toMatchObject({ stalls: 0, recoveries: 0, reloads: 0 });

    await ctx.close();
  });

  test("real Monitor authority follows Player full-Agenda page reports", async ({ browser }) => {
    test.setTimeout(120_000);
    const monitorSeed = await seed();
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const [{ id: userId }] = await db.select({ id: users.id }).from(users)
      .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`).limit(1);
    const [{ clientId }] = await db.select({ clientId: screens.clientId }).from(screens)
      .where(sql`${screens.id} = ${monitorSeed.screenId}`).limit(1);
    // Seed exactly what POST monitor-session stores, then still exercise the
    // real single-use bootstrap exchange, HttpOnly cookie and monitor content
    // authorization. Raw bootstrap material never enters the DB.
    const bootstrapToken = crypto.randomBytes(32).toString("hex");
    await db.insert(monitorSessions).values({
      userId, screenId: monitorSeed.screenId, clientId,
      tokenHash: crypto.createHash("sha256").update(bootstrapToken).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      clientType: "multiview", clientName: `${MARK}authority`,
    });
    const monitorUrl = `${process.env.E2E_BASE_URL || "http://127.0.0.1:5000"}/monitor-bootstrap/${monitorSeed.screenId}?token=${bootstrapToken}`;

    const player = await ctx.newPage();
    const monitor = await ctx.newPage();
    const pipeline: Array<Record<string, unknown>> = [];
    await instrument(player, monitorSeed);
    await player.route(`**/api/player/media/${monitorSeed.assetId}/file*`, (r) =>
      r.fulfill({ status: 200, contentType: "video/webm", body: fixture }));
    await monitor.route(`**/media/${monitorSeed.assetId}/file*`, (r) =>
      r.fulfill({ status: 200, contentType: "video/webm", body: fixture }));
    monitor.on("response", async (response) => {
      const url = response.url();
      if (!url.includes(`/api/monitor/${monitorSeed.screenId}/content`) &&
          !url.includes(`/api/monitor/${monitorSeed.screenId}/presentation`)) return;
      try {
        const body = await response.json();
        pipeline.push({ at: Date.now(), kind: url.includes("/presentation") ? "monitor-presentation" : "monitor-content", status: response.status(),
          presentation: body.playerPresentationState ?? body.presentation });
      } catch {}
    });
    player.on("response", async (response) => {
      if (response.url().includes("presentation") || response.url().includes("heartbeat"))
        pipeline.push({ at: Date.now(), kind: "player-report-response", url: response.url(), status: response.status() });
    });

    const u = new URL(monitorUrl);
    await Promise.all([
      player.goto("/player", { waitUntil: "domcontentloaded" }),
      monitor.goto(`${process.env.E2E_BASE_URL || "http://127.0.0.1:5000"}${u.pathname}${u.search}`, { waitUntil: "commit" }),
    ]);
    const playerFrame = player.getByTestId("screen-render-committed-frame");
    const monitorFrame = monitor.getByTestId("screen-render-committed-frame");
    await expect(monitor.locator("body")).not.toContainText("Monitor session expired");
    // Rotation is epoch-derived, so the initial load can land near the end of
    // any scene. Synchronize on a complete authored cycle boundary before
    // judging the following Player-owned transition.
    await expect(playerFrame.getByTestId("agenda-event-title")).toHaveText(`${MARK}NOW_NEXT_SCENE`, { timeout: 45_000 });
    await expect(monitorFrame.getByTestId("agenda-event-title")).toHaveText(`${MARK}NOW_NEXT_SCENE`, { timeout: 15_000 });
    const observedPlayer = new Set<string>();
    const observedMonitor = new Set<string>();
    const capturePages = (async () => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline && (observedPlayer.size < 4 || observedMonitor.size < 4)) {
        const [playerScene, monitorScene, playerTitle, monitorTitle] = await Promise.all([
          playerFrame.getByTestId("agenda-event-title").textContent().catch(() => null),
          monitorFrame.getByTestId("agenda-event-title").textContent().catch(() => null),
          playerFrame.locator("[data-testid*='agenda-title']").textContent().catch(() => null),
          monitorFrame.locator("[data-testid*='agenda-title']").textContent().catch(() => null),
        ]);
        if (playerScene === `${MARK}FULL_AGENDA_SCENE` && playerTitle) observedPlayer.add(playerTitle);
        if (monitorScene === `${MARK}FULL_AGENDA_SCENE` && monitorTitle) observedMonitor.add(monitorTitle);
        await player.waitForTimeout(100);
      }
    })();
    await expect(playerFrame.getByTestId("agenda-event-title")).toHaveText(`${MARK}FULL_AGENDA_SCENE`, { timeout: 45_000 });
    try {
      await expect(monitorFrame.getByTestId("agenda-event-title")).toHaveText(`${MARK}FULL_AGENDA_SCENE`, { timeout: 30_000 });
    } catch (error) {
      const reports = await player.evaluate(() => (window as any).__vmLifecycle?.reports ?? []);
      console.log("[monitor-pipeline-failure]", JSON.stringify({
        playerScene: await playerFrame.getByTestId("agenda-event-title").textContent(),
        monitorScene: await monitorFrame.getByTestId("agenda-event-title").textContent(),
        reports: reports.slice(-12),
        pipeline: pipeline.slice(-40),
      }));
      throw error;
    }

    await capturePages;
    const expectedPages = [1, 2, 3, 4].map((i) => `${MARK}page-${i}`);
    const playerReports = await player.evaluate(() => (window as any).__vmLifecycle?.reports ?? []);
    expect([...observedPlayer].sort(), `Player page sequence incomplete: ${JSON.stringify({ observedPlayer: [...observedPlayer], pipeline })}`)
      .toEqual(expectedPages);
    expect([...observedMonitor].sort(), `Monitor pipeline froze: ${JSON.stringify({ observedMonitor: [...observedMonitor], playerReports, pipeline })}`)
      .toEqual(expectedPages);
    await Promise.all([player.close(), monitor.close()]);
    await ctx.close();
  });
});
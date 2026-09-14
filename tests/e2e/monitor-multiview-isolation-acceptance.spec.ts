/**
 * Production Monitor acceptance for a four-tile Multiview session.
 *
 * There is no Multiview renderer in the web application: the Electron client
 * owns the tile grid and opens one production `/monitor/:screenId` document per
 * tile.  This test therefore uses one Chromium context (the shared-cookie-jar
 * model used by an Electron partition) and four real Monitor documents.  Since
 * a browser cookie is shared by all four same-origin pages, each page route
 * supplies its own captured HttpOnly monitor cookie to the authenticated
 * content/presentation request.  This is the explicit limitation of testing
 * Electron's partition without launching Electron itself; no auth bypass or
 * component replacement is used.
 *
 * The only network stubbing is controlled latency and response mutation on the
 * real authenticated Monitor endpoints.  React Monitor, ScreenRenderSurface,
 * ZoneRenderer, the bootstrap exchange, and the production content resolver
 * all remain active.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray, like, sql } from "drizzle-orm";
import {
  clients,
  displayProfiles,
  layoutTemplates,
  monitorSessions,
  playlistItems,
  playlists,
  screens,
  users,
} from "../../shared/schema";

const MARK = "ZZTEST-MONITOR-MULTIVIEW-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: {
    clients,
    displayProfiles,
    layoutTemplates,
    monitorSessions,
    playlistItems,
    playlists,
    screens,
    users,
  },
});

type Feed = {
  index: number;
  screenId: string;
  screenName: string;
  profileWidth: number;
  profileHeight: number;
  layoutId: string;
  playlistId: string;
  bootstrapToken: string;
};

type ContentPayload = Record<string, any>;

async function cleanup() {
  // Delete the monitor rows first so this remains safe if a previous browser
  // run was interrupted after its pages were closed.
  const ownedScreens = await db
    .select({ id: screens.id })
    .from(screens)
    .where(like(screens.name, `${MARK}%`));
  const screenIds = ownedScreens.map((row) => row.id);
  if (screenIds.length) {
    await db.delete(monitorSessions).where(inArray(monitorSessions.screenId, screenIds));
  }
  await db.delete(screens).where(inArray(screens.id, screenIds));
  await db.delete(playlistItems).where(
    sql`${playlistItems.playlistId} in (select id from playlists where name like ${`${MARK}%`})`,
  );
  await db.delete(playlists).where(like(playlists.name, `${MARK}%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${MARK}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${MARK}%`));
  await db.delete(clients).where(like(clients.name, `${MARK}%`));
}

async function seedFeeds(): Promise<Feed[]> {
  const [{ id: clientId }] = await db
    .insert(clients)
    .values({ name: `${PREFIX}site` })
    .returning({ id: clients.id });
  const [{ id: userId }] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'admin' AND ${users.isActive} = true`)
    .limit(1);
  if (!userId) throw new Error("No active admin user found for Monitor acceptance");

  const profiles = [
    [1920, 1080],
    [1080, 1920],
    [1280, 720],
    [1024, 1024],
  ] as const;
  const feeds: Feed[] = [];
  for (const [index, [width, height]] of profiles.entries()) {
    const [{ id: profileId }] = await db
      .insert(displayProfiles)
      .values({
        clientId,
        name: `${PREFIX}profile-${index}`,
        width,
        height,
      })
      .returning({ id: displayProfiles.id });
    const marker = `${PREFIX}feed-${index}-baseline`;
    const [{ id: layoutId }] = await db
      .insert(layoutTemplates)
      .values({
        clientId,
        name: `${PREFIX}layout-${index}`,
        aspectRatio: `${width}:${height}`,
        zones: [{
          id: "feed-content",
          name: "Feed content",
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          zIndex: 1,
          textContent: marker,
        }] as any,
      })
      .returning({ id: layoutTemplates.id });
    const [{ id: playlistId }] = await db
      .insert(playlists)
      .values({ clientId, name: `${PREFIX}playlist-${index}` })
      .returning({ id: playlists.id });
    await db.insert(playlistItems).values({
      playlistId,
      layoutTemplateId: layoutId,
      order: 0,
      duration: 60,
    });
    const [{ id: screenId }] = await db
      .insert(screens)
      .values({
        clientId,
        name: `${PREFIX}screen-${index}`,
        displayProfileId: profileId,
        deviceToken: `${PREFIX}device-${index}`,
        isPaired: true,
        isOnline: true,
        fallbackPlaylistId: playlistId,
      })
      .returning({ id: screens.id });
    const bootstrapToken = crypto.randomBytes(32).toString("hex");
    await db.insert(monitorSessions).values({
      userId,
      screenId,
      clientId,
      tokenHash: crypto.createHash("sha256").update(bootstrapToken).digest("hex"),
      expiresAt: new Date(Date.now() + 20 * 60_000),
      clientType: "multiview",
      clientName: `${PREFIX}feed-${index}`,
    });
    feeds.push({
      index,
      screenId,
      screenName: `${PREFIX}screen-${index}`,
      profileWidth: width,
      profileHeight: height,
      layoutId,
      playlistId,
      bootstrapToken,
    });
  }
  return feeds;
}

async function captureBootstrapCookie(
  context: BrowserContext,
  page: Page,
  feed: Feed,
): Promise<string> {
  await page.goto(
    `${BASE_URL}/monitor-bootstrap/${feed.screenId}?token=${feed.bootstrapToken}`,
    { waitUntil: "commit", timeout: 60_000 },
  );
  expect(new URL(page.url()).pathname).toBe(`/monitor/${feed.screenId}`);
  // Finish the un-routed production bootstrap before replacing the shared
  // context cookie for the next page. This prevents a same-origin cookie
  // replacement from turning an already-loaded page's first content poll into
  // a cross-feed 401.
  await expect(page.getByText(`${PREFIX}feed-${feed.index}-baseline`, { exact: true }))
    .toBeVisible({ timeout: 30_000 });
  const cookie = (await context.cookies()).find((item) => item.name === "vm_monitor_session");
  expect(cookie, `bootstrap must set the Monitor cookie for feed ${feed.index}`).toBeTruthy();
  return cookie!.value;
}

function patchContent(
  payload: ContentPayload,
  feed: Feed,
  marker: string,
  presentationSequence: number,
): ContentPayload {
  const next = JSON.parse(JSON.stringify(payload)) as ContentPayload;
  const patchLayout = (layout: any) => layout && Array.isArray(layout.zones)
    ? {
        ...layout,
        zones: layout.zones.map((zone: any) =>
          zone.id === "feed-content" ? { ...zone, textContent: marker } : zone,
        ),
      }
    : layout;
  next.layout = patchLayout(next.layout);
  if (next.layoutTemplates && typeof next.layoutTemplates === "object") {
    next.layoutTemplates = Object.fromEntries(
      Object.entries(next.layoutTemplates).map(([id, layout]) => [id, patchLayout(layout)]),
    );
  }
  next.playerPresentationState = {
    processId: `${PREFIX}process-${feed.index}`,
    revision: `${PREFIX}revision-${feed.index}`,
    activationEpoch: 1_000_000 + feed.index,
    sceneId: feed.layoutId,
    processGeneration: 1,
    sequence: presentationSequence,
    sceneGeneration: 1,
    source: "acceptance-fixture",
    reportedAt: Date.now(),
  };
  return next;
}

async function installFeedRouting(
  page: Page,
  feed: Feed,
  cookieRef: { value: string },
  state: {
    contentCalls: number;
    presentationCalls: number;
    contentMarkers: string[];
    presentationProcesses: string[];
    presentationCompletionOrder: number[];
    releaseStaleSuccess?: () => void;
    releaseStaleAuth?: () => void;
    releaseStaleError?: () => void;
  },
  allPresentationCompletions: number[],
  presentationOrderControl: {
    otherFeedCompleted: Promise<void>;
    releaseOtherFeed: () => void;
  },
) {
  await page.route(`**/api/monitor/${feed.screenId}/content*`, async (route) => {
    state.contentCalls += 1;
    const call = state.contentCalls;
    if (call === 4) {
      await new Promise<void>((resolve) => { state.releaseStaleAuth = resolve; });
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "UNAUTHORIZED" }),
      });
    }
    if (call === 6) {
      await new Promise<void>((resolve) => { state.releaseStaleError = resolve; });
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "delayed fixture failure" }),
      });
    }
    const requestCookie = cookieRef.value
      ? `vm_monitor_session=${cookieRef.value}`
      : route.request().headers().cookie || "";
    const response = await route.fetch({
      headers: { ...route.request().headers(), cookie: requestCookie },
    });
    const payload = await response.json() as ContentPayload;
    const marker = call === 1
      ? `${PREFIX}feed-${feed.index}-baseline`
      : call === 2
        ? `${PREFIX}feed-${feed.index}-stale-success`
        : `${PREFIX}feed-${feed.index}-newer-success`;
    state.contentMarkers.push(marker);
    const body = JSON.stringify(patchContent(payload, feed, marker, call));
    if (call === 2) {
      await new Promise<void>((resolve) => { state.releaseStaleSuccess = resolve; });
    }
    return route.fulfill({ response, body });
  });

  await page.route(`**/api/monitor/${feed.screenId}/presentation*`, async (route) => {
    state.presentationCalls += 1;
    const requestCookie = cookieRef.value
      ? `vm_monitor_session=${cookieRef.value}`
      : route.request().headers().cookie || "";
    const response = await route.fetch({
      headers: { ...route.request().headers(), cookie: requestCookie },
    });
    const payload = await response.json() as ContentPayload;
    payload.playerPresentationState = {
      processId: `${PREFIX}process-${feed.index}`,
      revision: `${PREFIX}revision-${feed.index}`,
      activationEpoch: 1_000_000 + feed.index,
      sceneId: feed.layoutId,
      processGeneration: 1,
      sequence: state.presentationCalls,
      sceneGeneration: 1,
      source: "acceptance-fixture",
      reportedAt: Date.now(),
    };
    state.presentationProcesses.push(payload.playerPresentationState.processId);
    // Feed zero is deliberately slower than the other three, so the first
    // presentation responses complete out of order across simultaneous feeds.
    if (feed.index === 0 && state.presentationCalls === 1) {
      await presentationOrderControl.otherFeedCompleted;
    } else if (feed.index !== 0 && state.presentationCalls === 1) {
      presentationOrderControl.releaseOtherFeed();
    }
    state.presentationCompletionOrder.push(feed.index);
    allPresentationCompletions.push(feed.index);
    return route.fulfill({ response, body: JSON.stringify(payload) });
  });
}

async function invokeContentPoll(page: Page) {
  await page.evaluate(() => {
    const polls = (window as any).__monitorAcceptancePolls as Array<() => void>;
    for (const poll of polls ?? []) poll();
  });
}

async function invokePresentationPoll(page: Page) {
  await page.evaluate(() => {
    const polls = (window as any).__monitorAcceptancePresentationPolls as Array<() => void>;
    for (const poll of polls ?? []) poll();
  });
}

test.describe("production Monitor: four-feed Multiview isolation", () => {
  let feeds: Feed[] = [];

  test.beforeAll(async () => {
    await cleanup();
    feeds = await seedFeeds();
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("keeps content/presentation/auth state isolated through reordering, resize, close, and reconnect", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ serviceWorkers: "block" });
    const pages = await Promise.all(feeds.map(() => context.newPage()));
    // Expose only the production content interval callback.  This lets the
    // fixture overlap two real Monitor polls without waiting seven seconds;
    // it does not alter React state or replace a renderer.
    await Promise.all(pages.map((page) => page.addInitScript(() => {
      const original = window.setInterval.bind(window);
      (window as any).__monitorAcceptancePolls = [];
      (window as any).__monitorAcceptancePresentationPolls = [];
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
        if (timeout === 7000 && typeof handler === "function") {
          (window as any).__monitorAcceptancePolls.push(handler);
          // The acceptance invokes this real Monitor poll explicitly so its
          // delayed responses can be deterministically overlapped.
          return 0 as any;
        }
        if (timeout === 600 && typeof handler === "function") {
          (window as any).__monitorAcceptancePresentationPolls.push(handler);
          return 0 as any;
        }
        return original(handler, timeout, ...args);
      }) as typeof window.setInterval;
    })));

    const cookies: { value: string }[] = [];
    const states = feeds.map(() => ({
      contentCalls: 0,
      presentationCalls: 0,
      contentMarkers: [] as string[],
      presentationProcesses: [] as string[],
      presentationCompletionOrder: [] as number[],
      releaseStaleSuccess: undefined as (() => void) | undefined,
      releaseStaleAuth: undefined as (() => void) | undefined,
      releaseStaleError: undefined as (() => void) | undefined,
    }));
    const allPresentationCompletions: number[] = [];
    let releaseOtherFeed!: () => void;
    const presentationOrderControl = {
      otherFeedCompleted: new Promise<void>((resolve) => {
        releaseOtherFeed = resolve;
      }),
      releaseOtherFeed: () => releaseOtherFeed(),
    };
    // The first content request must use the cookie set by the bootstrap
    // response. Do not install endpoint routes until each page has completed
    // that first production request; otherwise a shared-cookie context can
    // route a page's initial request with its predecessor's cookie.
    for (const [i, feed] of feeds.entries()) {
      cookies[i] = { value: "" };
      cookies[i].value = await captureBootstrapCookie(context, pages[i], feed);
    }
    states.forEach((state) => { state.contentCalls = 1; });
    await Promise.all(feeds.map(async (feed, i) => {
      await installFeedRouting(
        pages[i],
        feed,
        cookies[i],
        states[i],
        allPresentationCompletions,
        presentationOrderControl,
      );
    }));
    await Promise.all(pages.map(invokePresentationPoll));

    // All four are real Monitor pages and each displays its own authored
    // production layout/content marker, never another feed's marker.
    await Promise.all(feeds.map(async (feed, i) => {
      await expect(pages[i].getByText(`${PREFIX}feed-${i}-baseline`, { exact: true }))
        .toBeVisible({ timeout: 30_000 });
      await expect(pages[i].locator("body")).not.toHaveText(/Monitor session expired/);
      await expect(pages[i].locator("body")).not.toHaveText(new RegExp(`${PREFIX}feed-(?!${i})`));
      await expect.poll(() => states[i].presentationCalls, {
        timeout: 10_000,
      }).toBeGreaterThan(0);
      expect(states[i].presentationProcesses).toContain(`${PREFIX}process-${i}`);
    }));
    // The intentionally delayed feed-0 presentation completes after at least
    // one other feed, proving simultaneous response completion is out of order.
    expect(allPresentationCompletions.indexOf(0)).toBeGreaterThan(
      allPresentationCompletions.findIndex((index) => index !== 0),
    );

    const feed0 = pages[0];
    const feed0State = states[0];
    // Poll 2 is held, then poll 3 completes with newer content first.
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(2);
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(3);
    await expect(feed0.getByText(`${PREFIX}feed-0-newer-success`, { exact: true })).toBeVisible();
    feed0State.releaseStaleSuccess?.();
    await expect(feed0.getByText(`${PREFIX}feed-0-newer-success`, { exact: true })).toBeVisible();
    await expect(feed0.getByText(`${PREFIX}feed-0-stale-success`, { exact: true })).toHaveCount(0);

    // A delayed 401 from poll 4 must not replace the newer successful poll 5
    // or turn a healthy loaded document into the auth-error surface.
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(4);
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(5);
    await expect(feed0.getByText(`${PREFIX}feed-0-newer-success`, { exact: true })).toBeVisible();
    feed0State.releaseStaleAuth?.();
    await expect(feed0.getByText("Monitor session expired")).toHaveCount(0);

    // A delayed ordinary server error is also not authority to replace the
    // newer successful content.
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(6);
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(7);
    await expect(feed0.getByText(`${PREFIX}feed-0-newer-success`, { exact: true })).toBeVisible();
    feed0State.releaseStaleError?.();
    await expect(feed0.getByText("Monitor session expired")).toHaveCount(0);

    // Resizing a tile changes the scale, not the logical surface/page
    // membership.  Each different profile is checked, including portrait and
    // square surfaces at dense-grid dimensions.
    for (const [i, feed] of feeds.entries()) {
      await pages[i].setViewportSize({ width: 320, height: 180 });
      const currentMarker = i === 0
        ? `${PREFIX}feed-0-newer-success`
        : `${PREFIX}feed-${i}-baseline`;
      const before = await pages[i].getByText(currentMarker, { exact: true })
        .evaluate((node) => {
          const surface = node.closest("[data-testid='screen-render-committed-frame']")?.parentElement;
          const style = surface ? getComputedStyle(surface) : null;
          return {
            width: surface?.offsetWidth,
            height: surface?.offsetHeight,
            transform: style?.transform,
          };
        });
      expect(before.width).toBe(feed.profileWidth);
      expect(before.height).toBe(feed.profileHeight);
      expect(before.transform).toMatch(/^matrix\(/);
      await expect(pages[i].getByText(currentMarker, { exact: true }))
        .toBeVisible();
    }

    // Closing/removing one tile is isolated from the other production Monitor
    // documents.  (The web app has no tile-grid route; Electron removes the
    // corresponding document from its own grid.)
    const remainingBefore = await Promise.all(
      pages.slice(1).map((page, i) => page.getByText(`${PREFIX}feed-${i + 1}-baseline`, { exact: true }).count()),
    );
    await pages[3].close();
    await Promise.all(pages.slice(0, 3).map(async (page, i) => {
      const marker = i === 0
        ? `${PREFIX}feed-0-newer-success`
        : `${PREFIX}feed-${i}-baseline`;
      await expect(page.getByText(marker, { exact: true })).toBeVisible();
    }));
    expect(remainingBefore.slice(0, 2)).toEqual([1, 1]);

    // Reconnect feed 0 with a replacement monitor session.  The already
    // mounted document never navigates; its next authenticated poll uses the
    // replacement HttpOnly cookie and remains rendered.
    const replacementPage = await context.newPage();
    const replacementFeed = {
      ...feeds[0],
      bootstrapToken: crypto.randomBytes(32).toString("hex"),
    };
    const [{ id: userId }] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    const [{ clientId }] = await db
      .select({ clientId: screens.clientId })
      .from(screens)
      .where(eq(screens.id, feeds[0].screenId))
      .limit(1);
    await db.insert(monitorSessions).values({
      userId,
      screenId: feeds[0].screenId,
      clientId,
      tokenHash: crypto.createHash("sha256").update(replacementFeed.bootstrapToken).digest("hex"),
      expiresAt: new Date(Date.now() + 20 * 60_000),
      clientType: "multiview",
      clientName: `${PREFIX}replacement`,
    });
    const beforeReconnectUrl = feed0.url();
    const replacementCookie = await captureBootstrapCookie(context, replacementPage, replacementFeed);
    await replacementPage.close();
    cookies[0].value = replacementCookie;
    await invokeContentPoll(feed0);
    await expect.poll(() => feed0State.contentCalls, { timeout: 5_000 }).toBe(8);
    await expect(feed0).toHaveURL(beforeReconnectUrl);
    await expect(feed0.getByText(`${PREFIX}feed-0-newer-success`, { exact: true })).toBeVisible();
    await expect(feed0.getByText("Monitor session expired")).toHaveCount(0);

    await context.close();
  });
});
/**
 * Production-route acceptance for the synthetic __fallback__ playlist source.
 *
 * This deliberately creates no event, booking, schedule block, or fallback
 * layout.  Every feed therefore has to resolve its screen fallback playlist
 * through the real Player/Monitor content routes.  Two Player documents and
 * two authenticated Monitor documents are opened in separate Chromium
 * contexts, then observed concurrently so a global rotation cursor cannot
 * make one feed render another feed's scenes.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { inArray, like, or, sql } from "drizzle-orm";
import {
  auditLogs,
  clients,
  displayProfiles,
  layoutTemplates,
  monitorSessions,
  playlistItems,
  playlists,
  screens,
  users,
} from "../../shared/schema";

const MARK = "ZZTEST-FALLBACK-PLAYLIST-BROWSER-";
const PREFIX = `${MARK}${Math.random().toString(36).slice(2, 9)}-`;
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const SCENES = ["A", "B", "C"] as const;
const DURATIONS_MS = [1_000, 2_000, 3_000] as const;
const DWELL_TOLERANCE_MS = 650;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: {
    auditLogs,
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
  mode: "player" | "monitor";
  screenId: string;
  screenName: string;
  profileWidth: number;
  profileHeight: number;
  deviceToken: string;
  bootstrapToken: string;
  playlistId: string;
  layoutIds: Record<(typeof SCENES)[number], string>;
  markers: Record<(typeof SCENES)[number], string>;
};

type SceneTransition = { scene: (typeof SCENES)[number]; at: number };

type FeedState = {
  contentResponses: Array<{ at: number; status: number; markers: string[] }>;
  presentationResponses: Array<{ at: number; status: number }>;
};

async function cleanup() {
  const ownedScreens = await db
    .select({ id: screens.id })
    .from(screens)
    .where(like(screens.name, `${PREFIX}%`));
  const screenIds = ownedScreens.map((row) => row.id);
  const ownedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const userIds = ownedUsers.map((row) => row.id);

  if (screenIds.length || userIds.length) {
    const clauses = [];
    if (screenIds.length) clauses.push(inArray(monitorSessions.screenId, screenIds));
    if (userIds.length) clauses.push(inArray(monitorSessions.userId, userIds));
    await db.delete(monitorSessions).where(or(...clauses));
  }
  if (userIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.userId, userIds));
  }
  if (screenIds.length) {
    await db.delete(screens).where(inArray(screens.id, screenIds));
  }
  await db.delete(playlistItems).where(
    sql`${playlistItems.playlistId} in
      (select id from playlists where name like ${`${PREFIX}%`})`,
  );
  await db.delete(playlists).where(like(playlists.name, `${PREFIX}%`));
  await db.delete(layoutTemplates).where(like(layoutTemplates.name, `${PREFIX}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
  if (userIds.length) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
}

async function seedFeeds(): Promise<Feed[]> {
  const [{ id: adminId }] = await db.insert(users).values({
    email: `${PREFIX}admin@example.test`,
    firstName: "Fallback",
    lastName: "Acceptance",
    role: "admin",
    isActive: true,
  }).returning({ id: users.id });
  if (!adminId) throw new Error("Could not create isolated acceptance admin");

  const profiles = [
    [1920, 1080],
    [1080, 1920],
    [1280, 720],
    [1024, 1024],
  ] as const;
  const feeds: Feed[] = [];

  for (const [index, [width, height]] of profiles.entries()) {
    const [{ id: clientId }] = await db.insert(clients).values({
      name: `${PREFIX}client-${index}`,
    }).returning({ id: clients.id });
    const [{ id: profileId }] = await db.insert(displayProfiles).values({
      clientId,
      name: `${PREFIX}profile-${index}`,
      width,
      height,
    }).returning({ id: displayProfiles.id });
    const [{ id: playlistId }] = await db.insert(playlists).values({
      clientId,
      name: `${PREFIX}playlist-${index}`,
    }).returning({ id: playlists.id });

    const layoutIds = {} as Feed["layoutIds"];
    const markers = {} as Feed["markers"];
    for (const scene of SCENES) {
      const marker = `${PREFIX}feed-${index}-scene-${scene}`;
      const [{ id: layoutId }] = await db.insert(layoutTemplates).values({
        clientId,
        name: `${PREFIX}layout-${index}-${scene}`,
        aspectRatio: `${width}:${height}`,
        zones: [{
          id: "scene-marker",
          name: "Scene marker",
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          zIndex: 1,
          textContent: marker,
        }] as any,
      }).returning({ id: layoutTemplates.id });
      layoutIds[scene] = layoutId;
      markers[scene] = marker;
    }

    await db.insert(playlistItems).values(SCENES.map((scene, order) => ({
      playlistId,
      layoutTemplateId: layoutIds[scene],
      mediaAssetId: null,
      order,
      duration: order + 1,
    })));

    const deviceToken = `${PREFIX}device-${index}`;
    const [{ id: screenId }] = await db.insert(screens).values({
      clientId,
      name: `${PREFIX}screen-${index}`,
      displayProfileId: profileId,
      deviceToken,
      isPaired: true,
      isOnline: true,
      fallbackLayoutId: null,
      fallbackPlaylistId: playlistId,
    }).returning({ id: screens.id });

    const bootstrapToken = crypto.randomBytes(32).toString("hex");
    await db.insert(monitorSessions).values({
      userId: adminId,
      screenId,
      clientId,
      tokenHash: crypto.createHash("sha256").update(bootstrapToken).digest("hex"),
      expiresAt: new Date(Date.now() + 20 * 60_000),
      clientType: "multiview",
      clientName: `${PREFIX}monitor-${index}`,
    });

    feeds.push({
      index,
      mode: index % 2 === 0 ? "player" : "monitor",
      screenId,
      screenName: `${PREFIX}screen-${index}`,
      profileWidth: width,
      profileHeight: height,
      deviceToken,
      bootstrapToken,
      playlistId,
      layoutIds,
      markers,
    });
  }
  return feeds;
}

function sceneLocator(page: Page) {
  return page.getByTestId("screen-render-committed-frame");
}

function sceneFromText(text: string | null, feed: Feed) {
  const scene = SCENES.find((candidate) => text?.includes(feed.markers[candidate]));
  return scene ?? null;
}

function markersInPayload(payload: Record<string, any>, feed: Feed) {
  const serialized = JSON.stringify(payload);
  return SCENES
    .filter((scene) => serialized.includes(feed.markers[scene]))
    .map((scene) => feed.markers[scene]);
}

function assertFallbackContent(payload: Record<string, any>, feed: Feed, label: string) {
  expect(payload.layout ?? null, `${label}: fallback has no active layout`).toBeNull();
  expect(payload.event ?? null, `${label}: fallback has no active event`).toBeNull();
  const source = (payload.zoneSources ?? []).find(
    (candidate: any) => candidate.zoneId === "__fallback__",
  );
  expect(source, `${label}: resolver must expose __fallback__`).toMatchObject({
    zoneId: "__fallback__",
    type: "playlist",
    playlistId: feed.playlistId,
  });
  const items = payload.playlistItems?.[feed.playlistId];
  expect(items, `${label}: fallback playlist graph`).toHaveLength(3);
  expect(items.map((item: any) => item.layoutTemplateId)).toEqual(
    SCENES.map((scene) => feed.layoutIds[scene]),
  );
  expect(items.map((item: any) => item.duration)).toEqual([1, 2, 3]);
  for (const scene of SCENES) {
    expect(payload.layoutTemplates?.[feed.layoutIds[scene]], `${label}: ${scene} template`)
      .toMatchObject({ id: feed.layoutIds[scene] });
    expect(JSON.stringify(payload.layoutTemplates[feed.layoutIds[scene]]))
      .toContain(feed.markers[scene]);
  }
  expect(payload.presentation, `${label}: presentation metadata`).toMatchObject({
    revision: expect.any(String),
    activationEpoch: 0,
  });
}

async function installResponseAccounting(page: Page, feed: Feed, state: FeedState) {
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes(`/api/${feed.mode === "player" ? "player" : "monitor"}/${feed.screenId}/content`)) {
      let markers: string[] = [];
      try {
        if (response.status() !== 304) {
          markers = markersInPayload(await response.json() as Record<string, any>, feed);
        }
      } catch {
        // 304 and a page teardown have no JSON body; the status is retained.
      }
      state.contentResponses.push({ at: Date.now(), status: response.status(), markers });
    }
    if (feed.mode === "monitor" &&
        url.includes(`/api/monitor/${feed.screenId}/presentation`)) {
      state.presentationResponses.push({ at: Date.now(), status: response.status() });
    }
  });
}

async function openFeed(
  context: BrowserContext,
  feed: Feed,
  state: FeedState,
): Promise<Page> {
  const page = await context.newPage();
  await installResponseAccounting(page, feed, state);
  if (feed.mode === "player") {
    await page.addInitScript(({ token, screenId }) => {
      localStorage.setItem("signage_device_token", token);
      localStorage.setItem("signage_screen_id", screenId);
    }, { token: feed.deviceToken, screenId: feed.screenId });
    // A cold Vite compile can exceed the global navigation timeout.  The
    // committed frame below is the real readiness boundary for this test.
    await page.goto("/player", { waitUntil: "commit", timeout: 60_000 });
  } else {
    await page.goto(
      `${BASE_URL}/monitor-bootstrap/${feed.screenId}?token=${feed.bootstrapToken}`,
      { waitUntil: "commit", timeout: 60_000 },
    );
    expect(new URL(page.url()).pathname).toBe(`/monitor/${feed.screenId}`);
  }
  return page;
}

async function collectSequence(page: Page, feed: Feed): Promise<SceneTransition[]> {
  const frame = sceneLocator(page);
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await expect.poll(
    async () => sceneFromText(await frame.textContent(), feed),
    { timeout: 15_000, message: `feed ${feed.index} must reach scene A` },
  ).toBe("A");

  const transitions: SceneTransition[] = [{ scene: "A", at: Date.now() }];
  let previous: (typeof SCENES)[number] = "A";
  const deadline = Date.now() + 22_000;
  while (transitions.length < 7 && Date.now() < deadline) {
    const current = sceneFromText(await frame.textContent(), feed);
    if (current && current !== previous) {
      const expected = SCENES[transitions.length % SCENES.length];
      expect(current, `feed ${feed.index}: transition ${transitions.length}`).toBe(expected);
      transitions.push({ scene: current, at: Date.now() });
      previous = current;
    }
    await page.waitForTimeout(40);
  }
  expect(transitions.map((entry) => entry.scene), `feed ${feed.index}: A-B-C sequence`)
    .toEqual(["A", "B", "C", "A", "B", "C", "A"]);
  return transitions;
}

function effectiveDwells(transitions: SceneTransition[]) {
  return transitions.slice(1).map((entry, index) => ({
    from: transitions[index].scene,
    to: entry.scene,
    elapsedMs: entry.at - transitions[index].at,
    expectedMs: DURATIONS_MS[index % DURATIONS_MS.length],
  }));
}

function assertDwellTimings(transitions: SceneTransition[], label: string) {
  for (const [index, dwell] of effectiveDwells(transitions).entries()) {
    // Collection deliberately synchronizes on the first visible A rather than
    // the scene's epoch boundary.  The first A->B interval can therefore be
    // the tail of A (as short as one polling tick), while every later interval
    // starts at an observed transition and is a complete authored dwell.
    if (index === 0) {
      expect(
        dwell.elapsedMs,
        `${label} partial initial ${dwell.from}->${dwell.to} upper bound`,
      ).toBeLessThanOrEqual(dwell.expectedMs + DWELL_TOLERANCE_MS + 300);
      continue;
    }
    expect(
      dwell.elapsedMs,
      `${label} ${dwell.from}->${dwell.to} dwell`,
    ).toBeGreaterThanOrEqual(dwell.expectedMs - DWELL_TOLERANCE_MS);
    expect(
      dwell.elapsedMs,
      `${label} ${dwell.from}->${dwell.to} dwell`,
    ).toBeLessThanOrEqual(dwell.expectedMs + DWELL_TOLERANCE_MS + 300);
  }
}

test.describe("browser (Chromium, not Electron): real fallback-playlist rotation", () => {
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

  test("four staggered Player/Monitor feeds rotate A-B-C without cross-feed pinning", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const states: FeedState[] = feeds.map(() => ({
      contentResponses: [],
      presentationResponses: [],
    }));

    try {
      // Each context has independent localStorage and a monitor-session
      // cookie.  The stagger is intentional: simultaneous activation epochs
      // must not hide a shared process/global rotation cursor.
      for (const feed of feeds) {
        const context = await browser.newContext({ serviceWorkers: "block" });
        contexts.push(context);
        pages.push(await openFeed(context, feed, states[feed.index]));
        await pages.at(-1)!.waitForTimeout(350);
      }

      // Prove the server resolver contract independently of the DOM: a real
      // authenticated Player payload contains only the synthetic fallback
      // source, with no event or layout competing with that source.
      for (const feed of feeds.filter((candidate) => candidate.mode === "player")) {
        const response = await pages[feed.index].request.get(
          `/api/player/${feed.screenId}/content`,
          { headers: { "x-device-token": feed.deviceToken } },
        );
        expect(response.status(), `Player ${feed.index} content authentication`).toBe(200);
        assertFallbackContent(
          await response.json() as Record<string, any>,
          feed,
          `Player ${feed.index}`,
        );
      }

      const timelines = await Promise.all(feeds.map((feed) =>
        collectSequence(pages[feed.index], feed),
      ));
      for (const [index, timeline] of timelines.entries()) {
        assertDwellTimings(timeline, `feed ${index}`);
        await testInfo.attach(`fallback-feed-${index}-timeline.json`, {
          contentType: "application/json",
          body: Buffer.from(JSON.stringify({
            feedIndex: index,
            mode: feeds[index].mode,
            screenId: feeds[index].screenId,
            sequence: timeline.map((entry) => entry.scene),
            transitions: timeline,
            effectiveDwells: effectiveDwells(timeline),
          }, null, 2)),
        });
      }

      // Do not stop or intercept the normal polling loops.  Every feed must
      // have continued content traffic, and each Monitor must have its own
      // presentation polling traffic while all four scenes were observed.
      for (const feed of feeds) {
        const state = states[feed.index];
        expect(state.contentResponses.length, `feed ${feed.index} content polls`)
          .toBeGreaterThan(1);
        expect(
          state.contentResponses.every((response) => response.status === 200 || response.status === 304),
          `feed ${feed.index} content response statuses`,
        ).toBe(true);
        expect(
          state.contentResponses
            .flatMap((response) => response.markers)
            .every((marker) => Object.values(feed.markers).includes(marker)),
          `feed ${feed.index} response markers remain local`,
        ).toBe(true);
        if (feed.mode === "monitor") {
          expect(state.presentationResponses.length, `Monitor ${feed.index} presentation polls`)
            .toBeGreaterThan(1);
          expect(state.presentationResponses.every((response) => response.status === 200))
            .toBe(true);
        }
      }

      // A real resize must leave the committed surface and its logical scene
      // graph intact.  Then directly poll one authenticated Monitor endpoint
      // without replacing the page's normal polling route.
      const monitorFeed = feeds[3];
      await pages[monitorFeed.index].setViewportSize({ width: 320, height: 180 });
      await expect(sceneLocator(pages[monitorFeed.index])).toBeVisible({ timeout: 30_000 });
      const directContent = await pages[monitorFeed.index].request.get(
        `/api/monitor/${monitorFeed.screenId}/content`,
      );
      expect(directContent.status(), "direct Monitor content poll").toBe(200);
      assertFallbackContent(
        await directContent.json() as Record<string, any>,
        monitorFeed,
        "direct Monitor content",
      );
      const directPresentation = await pages[monitorFeed.index].request.get(
        `/api/monitor/${monitorFeed.screenId}/presentation`,
      );
      expect(directPresentation.status(), "direct Monitor presentation poll").toBe(200);
      expect(await directPresentation.json()).toHaveProperty("serverTime");

      // Re-read each committed frame after the resize/direct poll.  A feed may
      // be in any scene, but it may never display another feed's marker.
      for (const feed of feeds) {
        const text = await sceneLocator(pages[feed.index]).textContent();
        const ownMarkers = Object.values(feed.markers);
        expect(ownMarkers.some((marker) => text?.includes(marker)), `feed ${feed.index} own marker`)
          .toBe(true);
        for (const other of feeds.filter((candidate) => candidate.index !== feed.index)) {
          for (const marker of Object.values(other.markers)) {
            expect(text, `feed ${feed.index} must not show feed ${other.index}`).not.toContain(marker);
          }
        }
      }
    } finally {
      await Promise.all(pages.map((page) => page.close().catch(() => undefined)));
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    }
  });
});
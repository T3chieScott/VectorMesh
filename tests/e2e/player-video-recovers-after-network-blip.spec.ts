// Task #218 — end-to-end browser regression for the player-side
// <video> keep-alive watchdog (Task #196 hook), covering the *brief
// network blip while the tab stays visible* stall mode.
//
// Task #198 (tests/e2e/player-video-keeps-looping-after-hidden.spec.ts)
// already covers the tab-hidden→visible recovery pathway. The other
// realistic stall a long-running signage tab hits is a transient
// network/decode blip while the tab never leaves the foreground:
// the browser fires `waiting`/`stalled`, playback halts, React never
// notices, and without the watchdog only a manual refresh resumes it.
//
// The watchdog handles that via its `stalled` (and `error`/`suspend`)
// listeners plus the `pause` listener: each schedules a resume
// (RESUME_DELAY_MS = 250ms) that calls play() and bumps
// window.__vmPlayerVideoStats.recoveries once play() resolves.
//
// This spec proves it. Shape:
//
//   1. Seed a paired screen with a single-item fallback playlist
//      pointing at a tiny <video> media asset (same seeding/fixture
//      pattern as the #198 spec). Single-item is the loop=true shape
//      so we can also assert the clip keeps replaying after recovery.
//   2. Intercept /api/player/media/:id/file and serve the committed
//      tiny WebM/VP8 fixture (tests/e2e/fixtures/tiny-loop.webm) so
//      the test has no dependency on dev-DB upload contents. WebM is
//      used because headless Chromium ships no H.264.
//   3. Boot the player straight into PlayerContent via a preloaded
//      device token in localStorage.
//   4. Once the video is playing, simulate a brief network blip *with
//      the tab still visible*: dispatch the `waiting` + `stalled`
//      events the browser fires when a buffer underruns, and halt
//      playback (pause) to model the stall. NO visibility change is
//      involved — that is what distinguishes this from #198.
//   5. Assert the watchdog resumes playback within 1s of the blip AND
//      window.__vmPlayerVideoStats.recoveries increments, while
//      document.visibilityState stayed "visible" the whole time. Also
//      assert .stalls incremented, proving the `stalled` handler
//      specifically ran.
//   6. Assert the single-item playlist keeps looping after recovery.
//
// Test isolation: every row is namespaced with PREFIX and swept by the
// STABLE_MARKER before AND after the run, so a run aborted before
// afterAll() does not poison later runs.

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { like } from "drizzle-orm";
import {
  screens,
  clients,
  displayProfiles,
  playlists,
  playlistItems,
  mediaAssets,
} from "../../shared/schema";

// Stable marker for ALL rows ever created by this spec — used for
// pre-run cleanup so that runs aborted before afterAll() do not poison
// future runs (the screens.pairing_code unique constraint is the main
// failure mode in shared dev DBs).
const STABLE_MARKER = `ZZTEST218-`;
const PREFIX = `${STABLE_MARKER}${Math.random().toString(36).slice(2, 8)}-`;
// Fully-random 6-char uppercase pairing code, unique per run, so that
// two interrupted runs cannot collide on screens.pairing_code.
const PAIRING_CODE = Array.from({ length: 6 }, () =>
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[
    Math.floor(Math.random() * 36)
  ],
).join("");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { screens, clients, displayProfiles, playlists, playlistItems, mediaAssets },
});

// Tiny WebM/VP8 fixture — Chromium (as built for Replit / Playwright)
// does not ship libavcodec H.264 by default, so an MP4 fixture trips
// "DEMUXER_ERROR_NO_SUPPORTED_STREAMS". WebM/VP8 is universally
// supported. The fixture is ~800 bytes and committed alongside this
// spec (shared with the #198 spec).
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/e2e/fixtures/tiny-loop.webm",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

async function cleanup() {
  // Order matters because of FK cascades — playlists (and their items)
  // first, then media assets, then screens, then profiles/clients.
  // Delete by STABLE_MARKER ("ZZTEST218-") rather than the per-run
  // PREFIX so residue from earlier aborted runs gets swept up too,
  // making re-runs idempotent in shared dev DBs.
  await db.delete(playlists).where(like(playlists.name, `${STABLE_MARKER}%`));
  await db.delete(mediaAssets).where(like(mediaAssets.name, `${STABLE_MARKER}%`));
  await db.delete(screens).where(like(screens.name, `${STABLE_MARKER}%`));
  await db.delete(displayProfiles).where(like(displayProfiles.name, `${STABLE_MARKER}%`));
  await db.delete(clients).where(like(clients.name, `${STABLE_MARKER}%`));
}

interface Seed {
  screenId: string;
  deviceToken: string;
  mediaAssetId: string;
}

async function seed(): Promise<Seed> {
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();

  const [profile] = await db
    .insert(displayProfiles)
    .values({
      clientId: client.id,
      name: `${PREFIX}profile`,
      width: 1920,
      height: 1080,
    })
    .returning();

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      clientId: client.id,
      name: `${PREFIX}video`,
      // originalPath is irrelevant — the /api/player/media/:id/file
      // route is route-intercepted by Playwright and never reaches
      // fileStorage.streamFile.
      originalPath: `${PREFIX}placeholder.mp4`,
      mediaType: "video",
      mimeType: "video/webm",
      duration: 1,
    })
    .returning();

  const [playlist] = await db
    .insert(playlists)
    .values({ name: `${PREFIX}playlist`, clientId: client.id })
    .returning();

  // Single-item playlist — exercises the getMediaPlayerVideoLoopProps
  // `loop:true` path so we can assert currentTime resets across loops
  // after recovery.
  await db.insert(playlistItems).values({
    playlistId: playlist.id,
    mediaAssetId: asset.id,
    order: 0,
    duration: 1,
  });

  const deviceToken = `${PREFIX}devtok`;
  const [screen] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}screen`,
      clientId: client.id,
      displayProfileId: profile.id,
      isPaired: true,
      isOnline: true,
      pairingCode: PAIRING_CODE,
      deviceToken,
      fallbackPlaylistId: playlist.id,
    })
    .returning();

  return { screenId: screen.id, deviceToken, mediaAssetId: asset.id };
}

async function installVideoFixtureRoute(page: Page, mediaAssetId: string) {
  // Intercept the player's media file fetch and return the tiny WebM
  // fixture bytes directly. The wildcard handles the `?token=...`
  // query string the player appends in getUrl().
  await page.route(`**/api/player/media/${mediaAssetId}/file*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "video/webm",
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
      body: FIXTURE_BYTES,
    });
  });
}

test.describe("Task #218: player <video> recovers after a brief network blip while the tab stays visible", () => {
  let s: Seed;

  test.beforeAll(async () => {
    await cleanup();
    s = await seed();
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("network blip (stalled/waiting + halted playback) while visible: watchdog resumes within 1s, stats.recoveries & stats.stalls bump, and the loop keeps replaying", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    // Block the player Service Worker — by default Playwright's
    // page.route() does NOT intercept fetches issued from inside a SW,
    // and the player registers /player-sw.js which network-firsts every
    // /api/player/media/:id/file request. Blocking the SW forces every
    // media fetch through the main thread where our route fulfiller can
    // serve the fixture bytes.
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    // Belt-and-braces try/finally: ensure the Chromium context closes
    // even if an assertion throws partway through the test body, so a
    // dangling context can't leak browser processes into the next test.
    try {
      // Surface page-side errors so failures are diagnosable from CI logs.
      page.on("pageerror", (err) => {
        // eslint-disable-next-line no-console
        console.log(`[player-page:pageerror] ${err.message}`);
      });
      page.on("console", (msg) => {
        const t = msg.text();
        if (t.includes("[player]") || msg.type() === "error") {
          // eslint-disable-next-line no-console
          console.log(`[player-page:${msg.type()}] ${t}`);
        }
      });

      await installVideoFixtureRoute(page, s.mediaAssetId);

      // Boot straight into PlayerContent (skip PairingScreen) by
      // preloading the auth keys the player reads on mount.
      await page.addInitScript(
        ({ token, screenId }: { token: string; screenId: string }) => {
          try {
            localStorage.setItem("signage_device_token", token);
            localStorage.setItem("signage_screen_id", screenId);
          } catch {}
        },
        { token: s.deviceToken, screenId: s.screenId },
      );

      await page.goto("/player", { waitUntil: "domcontentloaded" });

      // The fallback playlist renders MediaPlayerWidget which mounts a
      // <video> inside [data-testid="media-player-widget"]. Wait for it.
      const widget = page.getByTestId("media-player-widget");
      await expect(widget, "media-player-widget must mount").toBeVisible({
        timeout: 30_000,
      });

      const videoLocator = widget.locator("video").first();
      await expect(videoLocator, "video element must mount").toHaveCount(1, {
        timeout: 10_000,
      });

      // Wait for the video to actually start playing — readyState >= 2
      // and not paused. Proves the fixture stream + autoplay are wired
      // up before we start probing the keep-alive behaviour.
      await page.waitForFunction(
        () => {
          const v = document.querySelector<HTMLVideoElement>(
            '[data-testid="media-player-widget"] video',
          );
          return !!v && !v.paused && v.readyState >= 2;
        },
        undefined,
        { timeout: 15_000 },
      );

      // Install a page-side loop observer so we can assert the clip
      // keeps wrapping (currentTime resets toward 0) both before and
      // after the blip. A backward jump of >0.3s on a ~1s clip is
      // unambiguously a loop wrap.
      await page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>(
          '[data-testid="media-player-widget"] video',
        );
        if (!v) return;
        const w = window as unknown as { __vmLoopObservations: number };
        w.__vmLoopObservations = 0;
        let last = v.currentTime;
        v.addEventListener("timeupdate", () => {
          const t = v.currentTime;
          if (last - t > 0.3) {
            w.__vmLoopObservations = (w.__vmLoopObservations || 0) + 1;
          }
          last = t;
        });
        v.addEventListener("seeked", () => {
          if (v.currentTime < 0.1 && last > 0.3) {
            w.__vmLoopObservations = (w.__vmLoopObservations || 0) + 1;
          }
        });
      });

      // ── Phase 1: confirm the loop is wrapping on its own (no
      //    intervention) — at least two wraps over the next few seconds.
      await page.waitForFunction(
        () => {
          const w = window as unknown as { __vmLoopObservations: number };
          return (w.__vmLoopObservations || 0) >= 2;
        },
        undefined,
        { timeout: 15_000 },
      );

      const loopsBefore = await page.evaluate(() => {
        const w = window as unknown as { __vmLoopObservations: number };
        return w.__vmLoopObservations || 0;
      });
      expect(
        loopsBefore,
        "single-item fallback playlist must be replaying before the blip (loop>=2)",
      ).toBeGreaterThanOrEqual(2);

      // Baselines captured at the exact moment we trigger the blip, so
      // the deltas we assert are attributable to the blip-recovery path.
      const baseline = await page.evaluate(() => {
        const w = window as unknown as {
          __vmPlayerVideoStats?: { recoveries?: number; stalls?: number };
        };
        return {
          recoveries: w.__vmPlayerVideoStats?.recoveries ?? 0,
          stalls: w.__vmPlayerVideoStats?.stalls ?? 0,
          visibility: document.visibilityState,
        };
      });
      // Precondition: the tab is visible and stays that way for the
      // whole test — this is the "network blip while visible" scenario,
      // NOT the hidden→visible recovery already covered by #198.
      expect(
        baseline.visibility,
        "tab must be visible at the start of the blip phase",
      ).toBe("visible");

      // ── Phase 2: simulate a brief network blip *with the tab still
      //    visible*. A buffer underrun fires `waiting` then `stalled`;
      //    when the element cannot continue, playback halts. We model
      //    that exactly: dispatch both events the browser would fire
      //    (the watchdog's onStalled handler is the one under test —
      //    it bumps `stalls` and schedules a resume) and pause the
      //    element so the scheduled resume has something to recover.
      //    Critically: NO visibilitychange is dispatched here.
      const blipAt = Date.now();
      const blip = await page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>(
          '[data-testid="media-player-widget"] video',
        );
        if (!v) return { paused: false, visibility: document.visibilityState };
        // Browser fires `waiting` first, then `stalled`, on a buffer
        // underrun. The hook ignores `waiting` but handles `stalled`;
        // dispatch both to faithfully mimic the real event sequence.
        v.dispatchEvent(new Event("waiting"));
        v.dispatchEvent(new Event("stalled"));
        // Halt playback to model the stall actually stopping the clip
        // (Chromium pauses media it can't keep fed). This is what the
        // watchdog's resume path recovers from.
        if (!v.paused) v.pause();
        return { paused: v.paused, visibility: document.visibilityState };
      });
      expect(
        blip.paused,
        "video must be halted (paused) immediately after the simulated blip — otherwise there is nothing for the watchdog to recover",
      ).toBe(true);
      expect(
        blip.visibility,
        "tab must remain visible during the blip (this is the visible-tab stall path, not the hidden-tab path)",
      ).toBe("visible");

      // ── Phase 3: the watchdog's scheduleResume (RESUME_DELAY_MS =
      //    250ms) must call play() and bump recoveries. Per the task
      //    contract this MUST complete within 1000ms of the blip.
      await page.waitForFunction(
        (base: number) => {
          const w = window as unknown as {
            __vmPlayerVideoStats?: { recoveries?: number };
          };
          const r = w.__vmPlayerVideoStats?.recoveries ?? 0;
          return r > base;
        },
        baseline.recoveries,
        { timeout: 1000 },
      );
      const elapsedToResume = Date.now() - blipAt;
      expect(
        elapsedToResume,
        "video must recover within 1s of the network blip (recoveries bumped)",
      ).toBeLessThanOrEqual(1000);

      // The actual <video> must be playing again, not just the counter.
      await page.waitForFunction(
        () => {
          const v = document.querySelector<HTMLVideoElement>(
            '[data-testid="media-player-widget"] video',
          );
          return !!v && !v.paused;
        },
        undefined,
        { timeout: 1000 },
      );

      const after = await page.evaluate(() => {
        const w = window as unknown as {
          __vmPlayerVideoStats?: { recoveries?: number; stalls?: number };
        };
        return {
          recoveries: w.__vmPlayerVideoStats?.recoveries ?? 0,
          stalls: w.__vmPlayerVideoStats?.stalls ?? 0,
          visibility: document.visibilityState,
        };
      });
      expect(
        after.recoveries - baseline.recoveries,
        "window.__vmPlayerVideoStats.recoveries must have incremented as a result of the blip-recovery pathway",
      ).toBeGreaterThanOrEqual(1);
      expect(
        after.stalls - baseline.stalls,
        "window.__vmPlayerVideoStats.stalls must have incremented — proving the `stalled` handler specifically ran",
      ).toBeGreaterThanOrEqual(1);
      expect(
        after.visibility,
        "tab must STILL be visible after recovery — the whole recovery happened on a foreground tab",
      ).toBe("visible");

      // ── Phase 4: confirm the loop is still wrapping after recovery —
      //    at least two more wraps. Together with loopsBefore (>=2)
      //    this is the "keeps replaying after the blip" assertion.
      await page.waitForFunction(
        (base: number) => {
          const w = window as unknown as { __vmLoopObservations: number };
          return (w.__vmLoopObservations || 0) - base >= 2;
        },
        loopsBefore,
        { timeout: 15_000 },
      );

      const loopsAfter = await page.evaluate(() => {
        const w = window as unknown as { __vmLoopObservations: number };
        return w.__vmLoopObservations || 0;
      });
      expect(
        loopsAfter,
        "single-item playlist must keep replaying after the blip (loops>=4 total)",
      ).toBeGreaterThanOrEqual(4);
    } finally {
      await ctx.close();
    }
  });
});

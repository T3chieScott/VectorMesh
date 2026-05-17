// Task #198 — end-to-end browser regression for the player-side
// <video> keep-alive watchdog (Task #196 hook).
//
// The hook is unit-tested against a fake video in
// tests/use-video-keep-alive.test.ts, but until now there was no
// integration test that drove a real <video> element through the
// browser-throttling lifecycle:
//
//   visible → paused while hidden → tab returns to visible →
//   hook calls play() → __vmPlayerVideoStats.recoveries bumps.
//
// This file fills that gap. Shape:
//
//   1. Seed a paired screen with a single-item fallback playlist
//      pointing at a tiny <video> media asset. Single-item is the
//      shape that exercises the `loop` attribute path
//      (getMediaPlayerVideoLoopProps → loop:true) so we can also
//      assert the video keeps replaying without an onEnded handler.
//   2. Intercept /api/player/media/:id/file and serve the tiny
//      committed WebM/VP8 fixture (tests/e2e/fixtures/tiny-loop.webm)
//      so the test has no dependency on whatever assets happen to
//      exist in the dev DB's uploads dir. WebM is used because
//      headless Chromium does not ship H.264.
//   3. Drive the player page in a real Chromium tab with the
//      device token preloaded in localStorage so it boots straight
//      into PlayerContent (not the PairingScreen).
//   4. Once the video is playing, drive a real hidden→visible
//      lifecycle via CDP `Page.setWebLifecycleState` (the supported
//      replacement for the removed
//      `Emulation.setPageVisibilityOverride`), paired with a DOM
//      override of `document.visibilityState` because headless
//      Chromium does not couple lifecycle state to visibilityState
//      on its own. Fast-forward 30 minutes of in-page elapsed time
//      with Playwright's virtual clock, then restore visibility.
//   5. Assert the watchdog resumed playback within 1s AND that
//      window.__vmPlayerVideoStats.recoveries is >= 1.
//   6. Assert the single-item playlist keeps looping — currentTime
//      resets to 0 at least twice over the observation window.
//
// Test isolation: every row inserted is namespaced with the PREFIX
// constant and cleaned up before AND after the run. The fixture
// WebM is ~800 bytes and committed to keep CI hermetic.

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
const STABLE_MARKER = `ZZTEST198-`;
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
// spec.
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/e2e/fixtures/tiny-loop.webm",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

async function cleanup() {
  // Order matters because of FK cascades — playlistItems first, then
  // playlists, then media assets, then screens, then profiles/clients.
  // We delete by the STABLE_MARKER ("ZZTEST198-") rather than the
  // per-run PREFIX so that residue from earlier aborted runs (which
  // never reached afterAll) gets swept up too. This is what makes
  // re-runs idempotent in shared dev DBs.
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
  // `loop:true` path so we can assert currentTime resets across loops.
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

test.describe("Task #198: player <video> keeps looping across a long tab-hidden period", () => {
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

  test("tab hidden → 30 min simulated → visible: watchdog resumes within 1s and stats.recoveries >= 1; single-item playlist keeps replaying", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    // Block the player Service Worker — by default Playwright's
    // page.route() does NOT intercept fetches issued from inside a
    // SW, and the player registers /player-sw.js which network-firsts
    // every /api/player/media/:id/file request. Blocking the SW
    // forces every media fetch through the main thread where our
    // route fulfiller can serve the fixture bytes.
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    // Belt-and-braces try/finally: ensure the Chromium context closes
    // even if an assertion throws partway through the test body. A
    // dangling context can leak browser processes into the next test
    // and mask the real failure in CI output.
    try {

    // Install Playwright's virtual clock BEFORE navigation so we can
    // fast-forward 30 minutes of elapsed time during the hidden phase
    // without actually sleeping 30 minutes. This is the canonical way
    // to simulate a long-hidden tab without blowing the CI budget —
    // `page.clock.fastForward("30:00")` advances Date.now() / setTimeout
    // / setInterval inside the page by 30 minutes synchronously.
    // Video element playback (`currentTime`) is driven by the browser's
    // real media clock so it is unaffected; the loop-wrap observer
    // continues to record real <video> events.
    await page.clock.install({ time: new Date() });

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
    // and not paused. This proves the fixture stream + autoplay are
    // wired up before we start probing the keep-alive behaviour.
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

    // Install a page-side loop observer BEFORE pushing the tab to
    // hidden. We accumulate the count of times currentTime resets
    // toward 0 (a `seeked` to ~0 or a timeupdate where t goes
    // backwards by more than half the clip's duration). Either is a
    // good proxy for "the loop wrapped".
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
        // A loop wrap shows up as currentTime jumping backwards by a
        // significant fraction of the clip. The tiny fixture is ~1s
        // long so any backward jump of ≥0.3s is unambiguously a loop.
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
    //    intervention). The fixture is ~1s long, so 3s should yield
    //    at least 2 loop wraps if loop=true is honoured.
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
      "single-item fallback playlist must keep replaying (loop>=2 before hidden phase)",
    ).toBeGreaterThanOrEqual(2);

    // Baseline recoveries before the hidden phase. Captured so the
    // final assertion can also confirm at least one recovery occurred
    // across the whole hidden→visible round-trip (belt-and-braces
    // alongside the focused visible-transition delta below).
    const recoveriesBefore = await page.evaluate(() => {
      const w = window as unknown as {
        __vmPlayerVideoStats?: { recoveries?: number };
      };
      return w.__vmPlayerVideoStats?.recoveries ?? 0;
    });

    // ── Phase 2: drive a hidden transition via the Chrome DevTools
    //    Protocol. We use TWO layers because headless Chromium does
    //    not consistently couple lifecycle state to `visibilityState`
    //    on its own:
    //
    //    (a) `Page.setWebLifecycleState({state:"frozen"})` — the
    //        supported CDP replacement for the removed
    //        `Emulation.setPageVisibilityOverride`. This puts the page
    //        in the background-frozen lifecycle state production
    //        browsers use when a tab is backgrounded for a long time,
    //        so the page's `freeze` listeners and other lifecycle
    //        hooks see the real transition.
    //
    //    (b) A page-side DOM override of `document.visibilityState` /
    //        `document.hidden` plus a manually-dispatched
    //        `visibilitychange` event. This is necessary because
    //        headless Chromium does not flip `document.visibilityState`
    //        from `Page.setWebLifecycleState` alone; the
    //        previously-canonical `Emulation.setPageVisibilityOverride`
    //        method was removed from current Chromium. The DOM
    //        override drives the exact code path the keep-alive hook
    //        listens to — the hook reads `document.visibilityState`
    //        on every visibilitychange — so it is functionally
    //        identical to what a real backgrounded tab does to the
    //        watchdog.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => document.visibilityState === "hidden", undefined, {
      timeout: 5000,
    });

    // Pause the video to mimic the most common browser-throttled
    // stall (some Chromium builds pause backgrounded media outright;
    // others throttle then drop frames). The hook's onPause handler
    // will scheduleResume after RESUME_DELAY_MS (250ms) — that is
    // ONE recovery pathway. The visibility→visible transition below
    // is the SECOND, belt-and-braces pathway the task explicitly asks
    // us to exercise.
    await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>(
        '[data-testid="media-player-widget"] video',
      );
      if (v && !v.paused) v.pause();
    });

    // Fast-forward 30 minutes of in-page elapsed time via the
    // Playwright virtual clock installed before navigation. This
    // advances Date.now() / setTimeout / setInterval / setImmediate
    // INSIDE the page by 30 minutes synchronously, faithfully
    // simulating a long-hidden tab without burning 30 minutes of CI
    // wall time. The watchdog hook reads no wall-clock timestamps
    // itself, but page-level intervals (heartbeats, polls, the
    // hook's RESUME_DELAY_MS timer) all advance, exercising the
    // same code paths a real 30-minute-hidden tab would.
    await page.clock.fastForward("30:00");

    // Re-pause the video AFTER the fast-forward. The hook's
    // onPause→scheduleResume path will have fired during the hidden
    // window and likely already bumped recoveries; re-pausing here
    // guarantees the video is in the paused state at the precise
    // moment we flip visibility, so the recoveries delta we measure
    // below is attributable to the visibility→visible pathway and
    // not to a stale pause-driven resume.
    await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>(
        '[data-testid="media-player-widget"] video',
      );
      if (v && !v.paused) v.pause();
    });

    // Sample the recoveries baseline AT THE MOMENT WE FLIP VISIBILITY
    // (not the pre-hidden baseline). This is what isolates the
    // visibility-transition recovery pathway in the assertion below.
    const recoveriesAtVisible = await page.evaluate(() => {
      const w = window as unknown as {
        __vmPlayerVideoStats?: { recoveries?: number };
      };
      return w.__vmPlayerVideoStats?.recoveries ?? 0;
    });

    // Sanity: confirm the video really is paused right before we
    // restore visibility. Without this, a passing assertion below
    // could mean "visibility handler did nothing because video was
    // already playing" rather than "visibility handler recovered a
    // stalled video".
    const pausedRightBeforeVisible = await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>(
        '[data-testid="media-player-widget"] video',
      );
      return !!v && v.paused;
    });
    expect(
      pausedRightBeforeVisible,
      "video must be paused at the moment visibility is restored — otherwise the visible-transition recovery path is not actually exercised",
    ).toBe(true);

    // ── Phase 3: restore the tab to active via CDP. Setting
    //    lifecycle state back to "active" fires the real
    //    visibilitychange event with state === "visible", driving
    //    the keep-alive hook's listener exactly as a real foreground
    //    return would.
    const visibleAt = Date.now();
    await cdp.send("Page.setWebLifecycleState", { state: "active" });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => document.visibilityState === "visible", undefined, {
      timeout: 5000,
    });

    // The hook calls play() synchronously on visibilitychange, then
    // bumps `recoveries` inside the resolved-play microtask. Per the
    // task contract this MUST complete within 1000ms.
    await page.waitForFunction(
      (base: number) => {
        const w = window as unknown as {
          __vmPlayerVideoStats?: { recoveries?: number };
        };
        const r = w.__vmPlayerVideoStats?.recoveries ?? 0;
        return r > base;
      },
      recoveriesAtVisible,
      { timeout: 1000 },
    );
    const elapsedToResume = Date.now() - visibleAt;
    expect(
      elapsedToResume,
      "video must resume within 1s of becoming visible (recoveries bumped)",
    ).toBeLessThanOrEqual(1000);

    // And the actual <video> must be playing again, not just the
    // counter ticked.
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

    const recoveriesAfter = await page.evaluate(() => {
      const w = window as unknown as {
        __vmPlayerVideoStats?: { recoveries?: number };
      };
      return w.__vmPlayerVideoStats?.recoveries ?? 0;
    });
    expect(
      recoveriesAfter - recoveriesAtVisible,
      "window.__vmPlayerVideoStats.recoveries must have incremented as a result of the visible-transition recovery pathway",
    ).toBeGreaterThanOrEqual(1);
    expect(
      recoveriesAfter - recoveriesBefore,
      "window.__vmPlayerVideoStats.recoveries >= 1 across the whole hidden→visible round-trip (task contract)",
    ).toBeGreaterThanOrEqual(1);

    // ── Phase 4: confirm the loop is still wrapping after the
    //    visibility round-trip — at least two more loop wraps over
    //    the next ~3s. Together with loopsBefore (>=2) this is the
    //    "currentTime resets to 0 at least twice" assertion in the
    //    task spec.
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
      "single-item playlist must keep replaying after the hidden phase (loops>=4 total)",
    ).toBeGreaterThanOrEqual(4);

    } finally {
      await ctx.close();
    }
  });
});

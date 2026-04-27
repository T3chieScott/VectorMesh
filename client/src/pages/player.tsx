import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  evaluateAuthHttpStatus,
  evaluateAuthHttpStatusInGrace,
  evaluateAuthNetworkError,
  evaluateAuthReloadingRace,
  isWithinReloadGrace,
} from "@/lib/playerAuthStrike";
import type { Screen, DisplayProfile, MediaAsset, LayoutTemplate, LiveOverride, LayoutZone, Playlist, PlaylistItem, Client, Event, PlayerContentResponse } from "@shared/schema";

type PlayerContentData = PlayerContentResponse;
import { ZoneRenderer, getAspectRatioDimensions, getZoneFingerprint } from "@/components/zone-renderer";
import { TestPattern } from "@/components/test-pattern";
import html2canvas from "html2canvas";
import { PlayerClockProvider, usePlayerClock } from "@/lib/playerClock";
import { persistOffset } from "@/lib/playerTimeSync";

const TOKEN_KEY = "signage_device_token";
const SCREEN_KEY = "signage_screen_id";
const CONTENT_CACHE_KEY = "vectormesh_player_cache";

function getCachedContent(screenId: string): PlayerContentData | null {
  try {
    const raw = localStorage.getItem(`${CONTENT_CACHE_KEY}_${screenId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setCachedContent(screenId: string, data: PlayerContentData) {
  try {
    localStorage.setItem(`${CONTENT_CACHE_KEY}_${screenId}`, JSON.stringify(data));
  } catch {}
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/player-sw.js")
      .catch(() => {});
  }
}

function sendSwMessage(message: object) {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  } else if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage(message);
    });
  }
}

function precacheMediaUrls(urls: string[]) {
  sendSwMessage({ type: "PRECACHE_MEDIA", urls });
}

function cleanupMediaCache(keepUrls: string[]) {
  sendSwMessage({ type: "CLEANUP_MEDIA", keepUrls });
}

function getStoredAuth(): { token: string; screenId: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const screenId = localStorage.getItem(SCREEN_KEY);
  if (token && screenId) return { token, screenId };
  return null;
}

function storeAuth(token: string, screenId: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SCREEN_KEY, screenId);
}

function clearAuth() {
  const screenId = localStorage.getItem(SCREEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SCREEN_KEY);
  if (screenId) {
    localStorage.removeItem(`${CONTENT_CACHE_KEY}_${screenId}`);
  }
}

// Task #185 — Pi-side "I'm walking away" notification. Best-effort
// POST that hands the soon-to-be-discarded token back to the server
// so the screens page can flip from "Offline" (red) to "Unpaired"
// (amber) immediately. Never throws and never blocks longer than a
// short timeout — if the server is unreachable we still proceed
// with clearAuth so the Pi doesn't get stuck.
async function notifyServerOfForfeit(screenId: string, token: string): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      await playerFetch(`/api/player/${screenId}/forfeit-pairing`, token, {
        method: "POST",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Best-effort. The next-poll-cycle stale-screen detection will
    // eventually mark it offline, and the Pi will surface the pair
    // screen anyway — this is just for instant UX.
  }
}

function playerFetch(url: string, token: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      "x-device-token": token,
    },
  });
}

function PairingScreen({ onPaired }: { onPaired: (screenId: string, token: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get("code");
  });
  const autoPairAttempted = useRef(false);

  const handlePairWithCode = useCallback(async (pairingCode: string) => {
    if (pairingCode.length < 4) {
      setError("Please enter a valid pairing code");
      setAutoConnecting(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Task #193 — capture round-trip timestamps so we can compute
      // an NTP-style offset from the very first response (pair),
      // before the PlayerClockProvider mounts. Persist directly so
      // the provider's first paint is already close to correct.
      const t1 = Date.now();
      const res = await fetch("/api/player/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pairingCode: pairingCode.toUpperCase().trim(),
          hardwareInfo: { hostname: window.location.hostname },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Invalid pairing code");
      }
      const data = await res.json();
      const t2 = Date.now();
      if (!data.deviceToken) {
        throw new Error("Server did not return a device token");
      }
      if (typeof data.serverTime === "number") {
        const midpoint = (t1 + t2) / 2;
        persistOffset(data.serverTime - midpoint);
      }
      storeAuth(data.deviceToken, data.screenId);
      onPaired(data.screenId, data.deviceToken);
    } catch (err: any) {
      setError(err.message || "Failed to pair");
      setAutoConnecting(false);
    } finally {
      setLoading(false);
    }
  }, [onPaired]);

  const handlePair = () => handlePairWithCode(code);

  useEffect(() => {
    if (autoPairAttempted.current) return;
    autoPairAttempted.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode) {
      const cleaned = urlCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      setCode(cleaned);
      handlePairWithCode(cleaned);
    }
  }, [handlePairWithCode]);

  if (autoConnecting) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center" data-testid="auto-pairing-screen">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <h1 className="text-2xl font-bold mb-2">Connecting Display</h1>
          <p className="text-white/60 text-sm">Pairing automatically...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center" data-testid="pairing-screen">
      <div className="text-center text-white max-w-md px-8">
        <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-white/10 flex items-center justify-center">
          <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Pair This Display</h1>
        <p className="text-white/60 mb-8 text-sm">
          Enter the pairing code shown on the Screens page in VectorMesh
        </p>
        <input
          data-testid="pairing-code-input"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && handlePair()}
          placeholder="CODE"
          className="w-full text-center text-3xl tracking-[0.3em] font-mono bg-white/10 border border-white/20 rounded-lg px-4 py-4 text-white placeholder:text-base placeholder:tracking-normal placeholder:text-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          maxLength={6}
          autoFocus
          disabled={loading}
        />
        {error && (
          <p className="text-red-400 text-sm mt-3" data-testid="pairing-error">{error}</p>
        )}
        <button
          data-testid="pair-button"
          onClick={handlePair}
          disabled={loading || code.length < 4}
          className="mt-6 w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          {loading ? "Pairing..." : "Connect Display"}
        </button>
        <p className="text-white/30 text-xs mt-6">
          This display will be securely linked to your VectorMesh account
        </p>
      </div>
    </div>
  );
}

function PlayerContent({ screenId, token }: { screenId: string; token: string }) {
  // Task #193 — synced wall-clock so ClockWidget / CountdownWidget /
  // {{time}} render real time even when the device clock is wrong.
  // `feedSample` is called after each pair/heartbeat/content fetch;
  // `getSyncedNow` is read at render time when constructing the
  // playerContext.nowMs so {{date}}/{{time}}/{{day}} use server time.
  const { feedSample, getSyncedNow } = usePlayerClock();
  const [content, setContent] = useState<PlayerContentData | null>(() => getCachedContent(screenId));
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [zoneMediaIndices, setZoneMediaIndices] = useState<Record<string, number>>({});
  const [weatherTimezone, setWeatherTimezone] = useState<string | undefined>(undefined);
  const [authError, setAuthError] = useState(false);
  const [layoutRotationIndex, setLayoutRotationIndex] = useState(0);
  const layoutRotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentHashRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousMediaUrlsRef = useRef<string[]>([]);
  const captureScreenshotRef = useRef<(() => Promise<void>) | null>(null);
  // Task #185 — Pi-side defense: a single 401/403 from /content can
  // happen during the brief window between window.location.reload()
  // firing and the page actually unloading (any in-flight retry sees
  // a transient 4xx and the player would unpair). Require TWO
  // consecutive auth errors before treating it as a real unpair.
  // A real auth failure persists; a transient race does not.
  const consecutiveAuthErrorsRef = useRef(0);
  const reloadingRef = useRef(false);
  // Task #188 — cross-reload edge case. The strike counter above is
  // a useRef, so it resets on every page reload. Every operator
  // edit on a published programme version triggers a reload via
  // refreshRequested:true; in a busy edit session each fresh-mount
  // page is exposed to its own 2-strike window and a pair of
  // transient 401s landing back-to-back can unpair the Pi even
  // though the server's deviceToken is fine. We mark a reload-
  // initiated timestamp in localStorage RIGHT BEFORE calling
  // window.location.reload(), then on fresh mount we read it back
  // and treat any 401/403 within RELOAD_GRACE_MS as a `wait` (no
  // strike). After grace expires (or any 2xx confirms), normal
  // 2-strike rules resume so a real auth failure still escalates.
  const reloadGraceUntilRef = useRef<number>((() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem(`vm_player_reload_at_${screenId}`);
      window.localStorage.removeItem(`vm_player_reload_at_${screenId}`);
      const reloadAt = raw ? Number.parseInt(raw, 10) : null;
      if (reloadAt !== null && isWithinReloadGrace(reloadAt, Date.now())) {
        return reloadAt;
      }
    } catch {}
    return 0;
  })());

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const collectMediaUrls = useCallback((data: PlayerContentData): string[] => {
    const urls: string[] = [];
    const zones = (data.layout?.zones as LayoutZone[]) || [];
    const addMediaUrl = (id: string) => {
      if (id) urls.push(`/api/player/media/${id}/file?token=${token}`);
    };

    for (const zone of zones) {
      if (zone.mediaId) addMediaUrl(zone.mediaId);
      if (zone.montageMediaIds) {
        for (const id of zone.montageMediaIds) addMediaUrl(id);
      }
      if (zone.mediaPlayerItems) {
        for (const item of zone.mediaPlayerItems) {
          if (item.mediaAssetId) addMediaUrl(item.mediaAssetId);
        }
      }
    }

    for (const items of Object.values(data.playlistItems || {})) {
      for (const item of items) {
        if (item.mediaAssetId) addMediaUrl(item.mediaAssetId);
      }
    }

    if (data.layoutTemplates) {
      for (const lt of Object.values(data.layoutTemplates)) {
        const ltZones = (lt.zones as LayoutZone[]) || [];
        for (const zone of ltZones) {
          if (zone.mediaId) addMediaUrl(zone.mediaId);
          if (zone.montageMediaIds) {
            for (const id of zone.montageMediaIds) addMediaUrl(id);
          }
        }
      }
    }

    // Canvas composite (Task #173): the seed screen's `data.layout`
    // is just one of N tiles. Walk every tile's resolved layout so the
    // service worker pre-caches media for the entire wall, not just
    // the owner tile.
    if (data.canvas?.tiles) {
      for (const tile of data.canvas.tiles) {
        const tileZones = (tile.layout?.zones as LayoutZone[]) || [];
        for (const zone of tileZones) {
          if (zone.mediaId) addMediaUrl(zone.mediaId);
          if (zone.montageMediaIds) {
            for (const id of zone.montageMediaIds) addMediaUrl(id);
          }
          if (zone.mediaPlayerItems) {
            for (const item of zone.mediaPlayerItems) {
              if (item.mediaAssetId) addMediaUrl(item.mediaAssetId);
            }
          }
        }
      }
    }

    return [...new Set(urls)];
  }, [token]);

  const fetchContent = useCallback(async () => {
    // Task #185: don't keep polling once we've decided to reload.
    // The interval can fire one more time between window.location.reload()
    // and the page actually unloading; that follow-up request is the
    // source of the transient 4xx that used to unpair the Pi. We
    // also clear the interval inside the reload branch — this guard
    // is defense-in-depth in case any callers re-enter fetchContent.
    if (reloadingRef.current) return;
    let res: Response;
    // Task #193 — bracket the fetch with t1/t2 timestamps for the
    // NTP-style offset estimator. Captured here (not later) so the
    // RTT excludes any time spent parsing JSON or running our own
    // decision logic.
    const t1 = Date.now();
    try {
      res = await playerFetch(`/api/player/${screenId}/content`, token);
    } catch (err: any) {
      // Network failure: leave strike count untouched so a later 401
      // after a network blip still escalates. See playerAuthStrike.ts.
      const outcome = evaluateAuthNetworkError(consecutiveAuthErrorsRef.current);
      consecutiveAuthErrorsRef.current = outcome.newCount;
      console.error("Player error:", err);
      setIsConnected(false);
      setError(err?.message || "Connection lost");
      return;
    }
    // Task #185: a poll can race a reload. If reload was initiated
    // while this request was in flight, drop the response on the
    // floor — neither incrementing nor resetting strike state.
    if (reloadingRef.current) {
      const outcome = evaluateAuthReloadingRace(consecutiveAuthErrorsRef.current);
      consecutiveAuthErrorsRef.current = outcome.newCount;
      return;
    }
    try {
      // Task #188 — when we're inside the post-reload grace window
      // (we just performed a controlled reload because the server
      // told us refreshRequested:true, which proves the deviceToken
      // was good a moment ago), suppress strikes from any 401/403.
      // Once a 2xx confirms or grace expires, normal 2-strike rules
      // resume so a real persistent auth failure still escalates.
      const inGrace = isWithinReloadGrace(
        reloadGraceUntilRef.current || null,
        Date.now(),
      );
      const outcome = inGrace
        ? evaluateAuthHttpStatusInGrace(
            consecutiveAuthErrorsRef.current,
            res.status,
          )
        : evaluateAuthHttpStatus(
            consecutiveAuthErrorsRef.current,
            res.status,
          );
      consecutiveAuthErrorsRef.current = outcome.newCount;
      // Any non-auth response confirms the server is healthy and
      // recognises our token; we no longer need the reload grace
      // and clearing it lets a much-later genuine 401 escalate
      // normally instead of being silently absorbed.
      if (outcome.action === "continue") {
        reloadGraceUntilRef.current = 0;
      }
      if (outcome.action === "wait") {
        if (inGrace) {
          console.warn(
            `[player] /content returned ${res.status} within reload grace window; ignoring strike`,
          );
        } else {
          console.warn(
            `[player] /content returned ${res.status}; will confirm on next poll before clearing auth`,
          );
        }
        return;
      }
      if (outcome.action === "clear") {
        console.error(
          `[player] /content returned ${res.status} on two consecutive polls — clearing auth and surfacing pair screen`,
        );
        // Tell the server "I'm walking away" so the screens page
        // shows "Unpaired" (amber) instead of "Offline" (red). Best
        // effort; we proceed to clearAuth() either way.
        await notifyServerOfForfeit(screenId, token);
        clearAuth();
        setAuthError(true);
        return;
      }
      // outcome.action === "continue": any non-auth status. Strike
      // counter has already been reset by evaluateAuthHttpStatus.
      if (!res.ok) {
        throw new Error(`Failed to fetch content: ${res.status}`);
      }
      const data: PlayerContentData = await res.json();
      // Task #193 — feed (t1, serverTime, t2) into the rolling NTP
      // estimator. `t2` is captured AFTER res.json() resolves but
      // we discount that JSON-parse time by reading t2 here, just
      // before doing any of our own logic. JSON parse is ~1ms so
      // the extra latency in the estimator is negligible.
      const t2 = Date.now();
      if (typeof data.serverTime === "number") {
        feedSample(t1, data.serverTime, t2);
      }
      const newHash = JSON.stringify({
        layoutId: data.layout?.id,
        layoutUpdatedAt: data.layout?.updatedAt,
        layoutZones: data.layout?.zones,
        liveOverrideId: data.liveOverride?.id,
        liveOverrideActive: data.liveOverride?.isActive,
        mediaIds: data.media.map((m: any) => m.id).sort(),
        playlistItems: data.playlistItems,
        layoutTemplates: data.layoutTemplates,
        zoneSources: data.zoneSources,
        screenName: data.screen?.name,
        testPatternEnabled: data.screen?.testPatternEnabled,
        showLiveBanner: data.screen?.showLiveBanner,
        hideNoContentMessage: data.screen?.hideNoContentMessage,
        canvasEnabled: data.screen?.canvasEnabled,
        canvasWidth: data.screen?.canvasWidth,
        canvasHeight: data.screen?.canvasHeight,
        canvasX: data.screen?.canvasX,
        canvasY: data.screen?.canvasY,
        profileWidth: data.profile?.width,
        profileHeight: data.profile?.height,
        // Canvas composite (Task #173): include per-tile resolved
        // pieces so a layout/zoneSource/override change on ANY tile
        // (not just the seed) triggers a content refresh on this Pi.
        canvasTiles: data.canvas?.tiles?.map(t => ({
          id: t.screenId,
          layoutId: t.layout?.id,
          layoutUpdatedAt: t.layout?.updatedAt,
          layoutZones: t.layout?.zones,
          zoneSources: t.zoneSources,
          liveOverrideId: t.liveOverride?.id,
          liveOverrideActive: t.liveOverride?.isActive,
          x: t.x,
          y: t.y,
          width: t.width,
          height: t.height,
        })),
      });

      if (data.refreshRequested) {
        // Task #185: stop polling BEFORE the reload so a follow-up
        // 7-second tick can't fire a content fetch in the brief
        // window between reload() being called and the page actually
        // unloading. That race is what historically returned a
        // transient 4xx and triggered an unnecessary unpair.
        reloadingRef.current = true;
        if (fetchIntervalRef.current) {
          clearInterval(fetchIntervalRef.current);
          fetchIntervalRef.current = null;
        }
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        // Task #188 — drop a reload marker so the freshly-mounted
        // page can read it back, recognise it just performed a
        // controlled reload (server proved healthy moments ago by
        // returning 200 + refreshRequested), and suppress strikes
        // from any 401/403 in the brief reload aftermath.
        try {
          window.localStorage.setItem(
            `vm_player_reload_at_${screenId}`,
            String(Date.now()),
          );
        } catch {}
        window.location.reload();
        return;
      }

      if (data.screenshotRequested && data.screenshotEnabled && containerRef.current && captureScreenshotRef.current) {
        captureScreenshotRef.current();
      }

      if (newHash !== contentHashRef.current) {
        contentHashRef.current = newHash;
        setContent(data);
        setCachedContent(screenId, data);
        setLastUpdate(new Date().toISOString());

        const mediaUrls = collectMediaUrls(data);
        precacheMediaUrls(mediaUrls);
        if (previousMediaUrlsRef.current.length > 0) {
          cleanupMediaCache(mediaUrls);
        }
        previousMediaUrlsRef.current = mediaUrls;
      }
      setIsConnected(true);
      setIsOffline(false);
      setError(null);
    } catch (err: any) {
      setIsConnected(false);
      setError(err.message || "Connection lost");
    }
  }, [screenId, token, collectMediaUrls]);

  useEffect(() => {
    // Task #193 — boot-time NTP sample. The first content poll
    // takes ~7s on a fresh load (and can take longer if the device
    // clock is way off and we hit a slow path). Hitting the tiny
    // dedicated /api/player/time endpoint up-front gets the first
    // accurate offset within the first network round-trip, so the
    // ClockWidget rendered on frame 0 is correct (or at worst seeded
    // from localStorage from the previous run).
    (async () => {
      try {
        const t1 = Date.now();
        const res = await fetch("/api/player/time");
        if (!res.ok) return;
        const data = await res.json();
        const t2 = Date.now();
        if (typeof data?.serverTime === "number") {
          feedSample(t1, data.serverTime, t2);
        }
      } catch {}
    })();
    fetchContent();
    fetchIntervalRef.current = setInterval(fetchContent, 7000);
    return () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
    };
  }, [fetchContent, feedSample]);

  useEffect(() => {
    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        // Task #193 — feed an NTP sample on every heartbeat. Even if
        // /content stops getting fresh samples (e.g. cached 304 path,
        // long no-change debounce), the 30s heartbeat keeps the
        // offset estimator's rolling buffer warm so the on-screen
        // clock stays correct over long uptimes.
        const t1 = Date.now();
        const res = await playerFetch("/api/player/heartbeat", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            screenId,
            hostname: window.location.hostname,
            temperature: null,
            storageFree: null,
            uptime: Math.floor(performance.now() / 1000),
            currentBlockId: null,
            currentItemId: null,
            errors: null,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const t2 = Date.now();
          if (data && typeof data.serverTime === "number") {
            feedSample(t1, data.serverTime, t2);
          }
        }
      } catch {}
    }, 30000);
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [screenId, token]);

  const captureScreenshot = useCallback(async () => {
    try {
      if (!containerRef.current) return;
      // Read the capture target's UN-transformed logical dimensions. The
      // container has `transform: scale(...)` applied so it visually fits the
      // browser window, but offsetWidth/offsetHeight return the layout size
      // before transform — which is what html2canvas needs as its capture box.
      // Reading from the rendered element (rather than from a captureW/H ref)
      // is intentional: the test-pattern path renders at tpCaptureW/H while
      // the layout path renders at captureW/H, and offsetWidth/offsetHeight
      // correctly reflects whichever is currently mounted. Without these
      // explicit dims (and the transform reset in onclone below),
      // html2canvas mis-calculates the render region and silently clips
      // children that fall outside it (Task #80: cropped player snapshots).
      const targetEl = containerRef.current;
      const captureWidth = targetEl.offsetWidth;
      const captureHeight = targetEl.offsetHeight;
      const canvas = await html2canvas(targetEl, {
        scale: 0.3,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#000000",
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight,
        onclone: (clonedDoc: Document) => {
          // Neutralize the CSS scale on the cloned capture target so html2canvas
          // renders it at its logical 1:1 size with no transform interference.
          const clonedTarget = clonedDoc.querySelector(
            '[data-testid="player-capture-target"]'
          ) as HTMLElement | null;
          if (clonedTarget) {
            clonedTarget.style.transform = "none";
            clonedTarget.style.transformOrigin = "top left";
          }
          const iframes = clonedDoc.querySelectorAll('iframe[src*="youtube.com/embed"]');
          iframes.forEach((iframe) => {
            const parent = iframe.parentElement;
            if (!parent) return;
            const overlay = clonedDoc.createElement("div");
            overlay.style.cssText = `
              position: absolute; inset: 0; z-index: 9999;
              background: #282828;
              display: flex; flex-direction: column;
              align-items: center; justify-content: center; gap: 8px;
            `;
            const svg = clonedDoc.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 68 48");
            svg.setAttribute("width", "68");
            svg.setAttribute("height", "48");
            svg.innerHTML = '<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#FF0000"/><path d="M45 24L27 14v20" fill="#fff"/>';
            overlay.appendChild(svg);
            const label = clonedDoc.createElement("div");
            label.style.cssText = "color: #aaa; font-size: 14px; font-family: sans-serif;";
            label.textContent = "YouTube Live";
            overlay.appendChild(label);
            if (parent.style.position === "" || parent.style.position === "static") {
              parent.style.position = "relative";
            }
            parent.appendChild(overlay);
          });
        },
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      await playerFetch(`/api/player/${screenId}/screenshot`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
    } catch (err) {
      console.warn("Screenshot capture failed:", err);
    }
  }, [screenId, token]);

  useEffect(() => {
    captureScreenshotRef.current = captureScreenshot;
  }, [captureScreenshot]);

  useEffect(() => {
    if (!content?.screenshotEnabled || !containerRef.current) return;
    captureScreenshot();
    const interval = setInterval(captureScreenshot, 60000);
    return () => clearInterval(interval);
  }, [content?.screenshotEnabled, captureScreenshot]);

  const layoutRotationItems = useMemo(() => {
    if (!content?.playlistItems || !content?.layoutTemplates) return [];
    if (!content?.zoneSources || content.zoneSources.length === 0) return [];
    for (const source of content.zoneSources) {
      if (source.type !== "playlist" || !source.playlistId) continue;
      const items = content.playlistItems[source.playlistId] || [];
      const layoutItems = items
        .filter(pi => pi.layoutTemplateId && content.layoutTemplates?.[pi.layoutTemplateId])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (layoutItems.length > 0) return layoutItems;
    }
    return [];
  }, [content?.zoneSources, content?.playlistItems, content?.layoutTemplates]);

  const isLayoutRotation = layoutRotationItems.length > 0;

  const activeLayoutItem = isLayoutRotation ? layoutRotationItems[layoutRotationIndex % layoutRotationItems.length] : null;
  const activeRotationLayout = activeLayoutItem?.layoutTemplateId && content?.layoutTemplates?.[activeLayoutItem.layoutTemplateId]
    ? content.layoutTemplates[activeLayoutItem.layoutTemplateId]
    : null;

  const layout = isLayoutRotation ? (activeRotationLayout || content?.layout || null) : (content?.layout || null);
  const isFallbackPlaylist = !layout && content?.zoneSources?.some(zs => zs.zoneId === "__fallback__" && zs.type === "playlist");
  const rawZones: LayoutZone[] = useMemo(() => {
    if (layout) return (layout.zones as LayoutZone[]) || [];
    if (isFallbackPlaylist) {
      const source = content!.zoneSources!.find(zs => zs.zoneId === "__fallback__");
      if (source?.playlistId) {
        const playlistItemsList = content!.playlistItems?.[source.playlistId] || [];
        const mediaOnlyItems = playlistItemsList.filter(pi => pi.mediaAssetId && !pi.layoutTemplateId);
        if (mediaOnlyItems.length > 0) {
          const mediaPlayerItems = mediaOnlyItems
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map(pi => ({
              id: pi.id,
              mediaAssetId: pi.mediaAssetId!,
              duration: pi.duration ?? undefined,
            }));
          return [{
            id: "__fallback__",
            type: "media_player",
            x: 0, y: 0, width: 100, height: 100,
            zIndex: 1,
            mediaPlayerItems,
          }] as LayoutZone[];
        }
      }
    }
    return [];
  }, [layout, isFallbackPlaylist, content?.zoneSources, content?.playlistItems]);

  useEffect(() => {
    if (!isLayoutRotation || layoutRotationItems.length <= 1) return;
    if (layoutRotationTimerRef.current) clearTimeout(layoutRotationTimerRef.current);
    const currentItem = layoutRotationItems[layoutRotationIndex % layoutRotationItems.length];
    let durationSec = currentItem?.duration || 0;
    if (!durationSec && currentItem?.mediaAssetId) {
      const asset = content?.media?.find((m: MediaAsset) => m.id === currentItem.mediaAssetId);
      if (asset?.duration) durationSec = asset.duration;
    }
    if (!durationSec) durationSec = 30;
    layoutRotationTimerRef.current = setTimeout(() => {
      setLayoutRotationIndex(prev => (prev + 1) % layoutRotationItems.length);
    }, durationSec * 1000);
    return () => {
      if (layoutRotationTimerRef.current) clearTimeout(layoutRotationTimerRef.current);
    };
  }, [isLayoutRotation, layoutRotationIndex, layoutRotationItems, content?.media]);

  const zones = useMemo(() => {
    if (isLayoutRotation) return rawZones;
    if (!content?.zoneSources || content.zoneSources.length === 0) return rawZones;
    return rawZones.map(zone => {
      const source = content.zoneSources?.find(zs => zs.zoneId === zone.id);
      if (!source || source.type !== "playlist" || !source.playlistId) return zone;
      const playlistItemsList = content.playlistItems?.[source.playlistId] || [];
      if (playlistItemsList.length === 0) return zone;
      const mediaOnlyItems = playlistItemsList.filter(pi => pi.mediaAssetId && !pi.layoutTemplateId);
      if (mediaOnlyItems.length === 0) return zone;
      const mediaPlayerItems = mediaOnlyItems
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(pi => ({
          id: pi.id,
          mediaAssetId: pi.mediaAssetId!,
          duration: pi.duration ?? undefined,
        }));
      return { ...zone, mediaPlayerItems };
    });
  }, [rawZones, isLayoutRotation, content?.zoneSources, content?.playlistItems]);

  useEffect(() => {
    const weatherZone = zones.find(z => z.type === "weather" && z.weatherLat && z.weatherLng);
    if (weatherZone && weatherZone.weatherLat && weatherZone.weatherLng) {
      playerFetch(`/api/player/widgets/weather?lat=${weatherZone.weatherLat}&lng=${weatherZone.weatherLng}&unit=${weatherZone.weatherUnit || "celsius"}`, token)
        .then(res => res.json())
        .then(data => {
          if (data.timezone) setWeatherTimezone(data.timezone);
        })
        .catch(() => {});
    }
  }, [zones.length, layout?.id, token]);

  // Canvas composite (Task #173): when polled as the canvas owner the
  // payload also contains every sibling tile's resolved layout. Roll
  // those zones into the same rotation tick so a media-zone on tile #3
  // advances on the same 8-second cadence as the seed's zones.
  const allRotatingZones = useMemo<LayoutZone[]>(() => {
    const merged: LayoutZone[] = [...zones];
    if (content?.canvas?.tiles) {
      for (const tile of content.canvas.tiles) {
        const tileLayoutId = tile.layout?.id;
        if (tileLayoutId && tileLayoutId === content.layout?.id) {
          // Already represented by the seed's `zones` (same layout).
          continue;
        }
        const tileZones = (tile.layout?.zones as LayoutZone[]) || [];
        for (const z of tileZones) merged.push(z);
      }
    }
    return merged;
  }, [zones, content?.canvas, content?.layout?.id]);

  useEffect(() => {
    if (allRotatingZones.length === 0) return;
    const interval = setInterval(() => {
      setZoneMediaIndices(prev => {
        const next = { ...prev };
        allRotatingZones.forEach(zone => {
          if (zone.type === "media") {
            // resolveZoneMedia takes the zone object directly so a
            // canvas-sibling zone (Task #173) advances over its own
            // media set, not the seed's.
            const zoneMedia = resolveZoneMedia(zone);
            if (zoneMedia.length > 1) {
              next[zone.id] = ((prev[zone.id] || 0) + 1) % zoneMedia.length;
            }
          }
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [allRotatingZones.length, content?.media.length]);

  const REFERENCE_HEIGHT = 720;
  const layoutAspect = layout
    ? getAspectRatioDimensions(layout.aspectRatio || "16:9", layout.customWidth, layout.customHeight)
    : null;
  const aspectRatio = layoutAspect
    ? layoutAspect.width / layoutAspect.height
    : (content?.profile ? (content.profile.width || 1920) / (content.profile.height || 1080) : 16 / 9);

  const rawCanvasW = content?.screen?.canvasWidth ?? 0;
  const rawCanvasH = content?.screen?.canvasHeight ?? 0;
  const canvasEnabled =
    (content?.screen?.canvasEnabled ?? false) && rawCanvasW > 0 && rawCanvasH > 0;
  const canvasW = canvasEnabled ? rawCanvasW : 1920;
  const canvasH = canvasEnabled ? rawCanvasH : 1080;
  const playerCanvasX = content?.screen?.canvasX || 0;
  const playerCanvasY = content?.screen?.canvasY || 0;
  const playerScreenW = content?.profile?.width || 1920;
  const playerScreenH = content?.profile?.height || 1080;

  // Compute the layout's authored pixel dimensions using the same convention as
  // the layout editor (client/src/pages/layouts.tsx getLayoutPixelDimensions):
  // custom layouts use customWidth/customHeight; non-custom layouts derive from
  // a 1920px base width and the aspect ratio.
  const layoutAuthored = (() => {
    if (!layout) return null;
    if (layout.aspectRatio === "custom") {
      const w = layout.customWidth ?? 0;
      const h = layout.customHeight ?? 0;
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }
    if (!layoutAspect || layoutAspect.width <= 0 || layoutAspect.height <= 0) return null;
    const baseWidth = 1920;
    return {
      width: baseWidth,
      height: Math.round((baseWidth * layoutAspect.height) / layoutAspect.width),
    };
  })();
  const dimsMatch = (a: number, b: number) => Math.abs(a - b) <= 1;
  const useCanvasMode =
    canvasEnabled &&
    layoutAuthored !== null &&
    dimsMatch(layoutAuthored.width, canvasW) &&
    dimsMatch(layoutAuthored.height, canvasH);

  const displayAspect = aspectRatio;
  const trueWidth = Math.round(REFERENCE_HEIGHT * displayAspect);
  const trueHeight = REFERENCE_HEIGHT;

  // The html2canvas capture target. For canvas-enabled screens the player
  // renders the whole canvas as its viewport (with the screen positioned at
  // its AOI inside it), so the capture is the whole canvas. For non-canvas
  // screens the capture is the screen viewport (legacy behavior).
  // These values drive both the capture target's inline style.width /
  // style.height AND html2canvas's explicit capture-box dims (via
  // offsetWidth/offsetHeight at capture time). The regression test in
  // tests/player-capture-dims.test.ts statically asserts the inline-style
  // binding so this invariant cannot silently drift.
  const captureW = canvasEnabled ? canvasW : trueWidth;
  const captureH = canvasEnabled ? canvasH : trueHeight;

  // Inside the canvas viewport, the screen slot sits at the screen's AOI.
  // Inside the slot, the zone frame either fills the slot (screen-fitted
  // layouts) or is sized to the canvas and translated by -canvasX/-canvasY
  // to display this screen's slice (canvas-spanning layouts; Task #74).
  const slotW = canvasEnabled ? playerScreenW : trueWidth;
  const slotH = canvasEnabled ? playerScreenH : trueHeight;

  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scaleX = w / captureW;
      const scaleY = h / captureH;
      setScale(Math.min(scaleX, scaleY));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [captureW, captureH]);

  // Per-zone media resolver. Operates on a zone OBJECT (not an id)
  // so canvas-composite siblings (Task #173) can resolve their own
  // tile-local zones — looking up by zone.id against the seed's
  // `zones` array would silently fall back to the entire media
  // library for any sibling zone whose id doesn't appear on the seed
  // (different layout / different per-tile authoring).
  const resolveZoneMedia = (
    zone: Pick<LayoutZone, "id" | "mediaId"> | undefined,
  ): MediaAsset[] => {
    if (!content) return [];
    if (zone?.mediaId) {
      const specific = content.media.filter(m => m.id === zone.mediaId);
      if (specific.length > 0) return specific;
    }
    return content.media;
  };

  // Convenience overload kept for the seed-screen render path so the
  // diff is small. ALWAYS prefer resolveZoneMedia(zone) for any path
  // that walks tile-local zones.
  const getZoneMedia = (zoneId: string): MediaAsset[] => {
    return resolveZoneMedia(zones.find(z => z.id === zoneId));
  };

  const getZoneMediaIndex = (zoneId: string): number => {
    return zoneMediaIndices[zoneId] || 0;
  };

  if (authError) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 border-red-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-xl font-semibold mb-2">Device Unpaired</p>
          <p className="text-white/60 text-sm mb-6">This device is no longer paired. It needs to be re-paired.</p>
          <button
            data-testid="re-pair-button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Re-pair Display
          </button>
        </div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 border-red-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-xl font-semibold mb-2">Connection Lost</p>
          <p className="text-white/60 text-sm">Attempting to reconnect to VectorMesh...</p>
          <p className="text-white/40 text-xs mt-4">Screen: {screenId}</p>
          <p className="text-white/30 text-xs mt-2">No cached content available</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-lg">Connecting to VectorMesh...</p>
          <p className="text-white/40 text-xs mt-2">Screen: {screenId}</p>
        </div>
      </div>
    );
  }

  if (content.screen.testPatternEnabled) {
    const tpSlotW = playerScreenW;
    const tpSlotH = playerScreenH;
    const tpCaptureW = canvasEnabled ? canvasW : tpSlotW;
    const tpCaptureH = canvasEnabled ? canvasH : tpSlotH;
    const vpW = typeof window !== "undefined" ? window.innerWidth : tpCaptureW;
    const vpH = typeof window !== "undefined" ? window.innerHeight : tpCaptureH;
    const tpScale = Math.min(vpW / tpCaptureW, vpH / tpCaptureH);
    const tpScaledWidth = tpCaptureW * tpScale;
    const tpScaledHeight = tpCaptureH * tpScale;

    const insetMaxW = Math.min(280, tpSlotW * 0.28);
    const insetMaxH = Math.min(200, tpSlotH * 0.28);
    const insetScale = canvasEnabled
      ? Math.min(insetMaxW / Math.max(canvasW, 1), insetMaxH / Math.max(canvasH, 1))
      : 0;
    const insetW = canvasW * insetScale;
    const insetH = canvasH * insetScale;
    const insetScreenX = playerCanvasX * insetScale;
    const insetScreenY = playerCanvasY * insetScale;
    const insetScreenW = Math.max(playerScreenW * insetScale, 2);
    const insetScreenH = Math.max(playerScreenH * insetScale, 2);

    const tpSlot = (
      <>
        <TestPattern screenName={content.screen.name} width={tpSlotW} height={tpSlotH} />
        {canvasEnabled && (
          <div
            className="absolute bg-black/70 border border-white/40 rounded p-2 flex flex-col items-center gap-1.5"
            style={{
              top: `${Math.round(tpSlotH * 0.02)}px`,
              right: `${Math.round(tpSlotW * 0.02)}px`,
              zIndex: 10,
            }}
            data-testid="test-pattern-canvas-inset"
          >
            <div
              className="relative border border-dashed border-white/60"
              style={{ width: `${insetW}px`, height: `${insetH}px` }}
            >
              <div
                className="absolute bg-yellow-400/40 border-2 border-yellow-400"
                style={{
                  left: `${insetScreenX}px`,
                  top: `${insetScreenY}px`,
                  width: `${insetScreenW}px`,
                  height: `${insetScreenH}px`,
                }}
              />
            </div>
            <div
              className="text-white/90 font-mono text-center leading-tight"
              style={{ fontSize: `${Math.max(10, Math.round(Math.min(tpSlotW, tpSlotH) * 0.018))}px` }}
            >
              Canvas {canvasW}×{canvasH}
              <br />
              Screen at ({playerCanvasX}, {playerCanvasY})
            </div>
          </div>
        )}
      </>
    );

    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden" style={{ cursor: "none" }}>
        <div
          className="relative overflow-hidden"
          style={{ width: `${tpScaledWidth}px`, height: `${tpScaledHeight}px` }}
        >
          <div
            ref={containerRef}
            className="bg-black"
            style={{
              width: `${tpCaptureW}px`,
              height: `${tpCaptureH}px`,
              transform: `scale(${tpScale})`,
              transformOrigin: "top left",
              position: "relative",
            }}
            data-testid="player-capture-target"
          >
            {canvasEnabled ? (
              <div
                className="absolute overflow-hidden"
                style={{
                  left: `${playerCanvasX}px`,
                  top: `${playerCanvasY}px`,
                  width: `${tpSlotW}px`,
                  height: `${tpSlotH}px`,
                }}
                data-testid="player-screen-slot"
              >
                {tpSlot}
              </div>
            ) : (
              tpSlot
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ CANVAS COMPOSITE PATH (Task #173) ============
  // When this Pi is paired against a multi-tile canvas it polls the
  // owner's content endpoint and gets every member tile's resolved
  // layout in one payload. Render each tile at its AOI inside the
  // full-canvas viewport. Single-tile / non-canvas screens (and the
  // legacy N-Pi-per-wall install where canvasMembers.length === 1)
  // skip this branch and fall through to the existing per-screen
  // render paths below.
  const canvasComposite =
    content?.canvas && content.canvas.tiles.length > 1
      ? content.canvas
      : null;

  if (canvasComposite) {
    const cwW = canvasComposite.width;
    const cwH = canvasComposite.height;
    const cwScaledWidth = cwW * scale;
    const cwScaledHeight = cwH * scale;

    const renderTileSlot = (
      tile: NonNullable<typeof canvasComposite>["tiles"][number],
    ) => {
      const tileLayout = tile.layout;
      const tileLiveBanner =
        tile.liveOverride && content!.screen?.showLiveBanner ? (
          <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1 flex items-center justify-center gap-2 text-sm font-medium">
            LIVE: {tile.liveOverride.name}
          </div>
        ) : null;

      if (!tileLayout) {
        const hideMessage = !!content!.screen?.hideNoContentMessage;
        return (
          <div className="absolute inset-0 bg-black flex items-center justify-center">
            {tileLiveBanner}
            {!hideMessage && (
              <div
                className="text-center text-white"
                data-testid={`text-no-content-tile-${tile.screenId}`}
              >
                <p className="text-lg font-semibold mb-1">No Content</p>
                <p className="text-white/50 text-xs">{tile.name}</p>
              </div>
            )}
          </div>
        );
      }

      // Per-tile zone source rewrite (mirrors the single-tile `zones`
      // useMemo so a playlist-driven zone gets its mediaPlayerItems
      // hydrated from content.playlistItems[playlistId]).
      const rawTileZones = (tileLayout.zones as LayoutZone[]) || [];
      const tileZones: LayoutZone[] = rawTileZones.map((zone) => {
        const source = tile.zoneSources?.find((zs) => zs.zoneId === zone.id);
        if (!source || source.type !== "playlist" || !source.playlistId) return zone;
        const playlistItemsList = content!.playlistItems?.[source.playlistId] || [];
        if (playlistItemsList.length === 0) return zone;
        const mediaOnlyItems = playlistItemsList.filter(
          (pi) => pi.mediaAssetId && !pi.layoutTemplateId,
        );
        if (mediaOnlyItems.length === 0) return zone;
        const mediaPlayerItems = mediaOnlyItems
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((pi) => ({
            id: pi.id,
            mediaAssetId: pi.mediaAssetId!,
            duration: pi.duration ?? undefined,
          }));
        return { ...zone, mediaPlayerItems };
      });

      // When the layout was authored at the FULL canvas size, render
      // it at canvas dims and translate by -tile.x/-tile.y so this
      // tile shows its slice (legacy canvas-spanning layout). Else
      // fill the slot directly (per-tile authored layout).
      const tileLayoutAspect = getAspectRatioDimensions(
        tileLayout.aspectRatio || "16:9",
        tileLayout.customWidth,
        tileLayout.customHeight,
      );
      const tileAuthored: { width: number; height: number } | null = (() => {
        if (tileLayout.aspectRatio === "custom") {
          const w = tileLayout.customWidth ?? 0;
          const h = tileLayout.customHeight ?? 0;
          return w > 0 && h > 0 ? { width: w, height: h } : null;
        }
        if (
          !tileLayoutAspect ||
          tileLayoutAspect.width <= 0 ||
          tileLayoutAspect.height <= 0
        )
          return null;
        const baseWidth = 1920;
        return {
          width: baseWidth,
          height: Math.round(
            (baseWidth * tileLayoutAspect.height) / tileLayoutAspect.width,
          ),
        };
      })();
      const tileUseCanvasMode =
        tileAuthored !== null &&
        Math.abs(tileAuthored.width - cwW) <= 1 &&
        Math.abs(tileAuthored.height - cwH) <= 1;

      return (
        <>
          {tileLiveBanner}
          <div
            className="absolute"
            style={
              tileUseCanvasMode
                ? {
                    left: `${-tile.x}px`,
                    top: `${-tile.y}px`,
                    width: `${cwW}px`,
                    height: `${cwH}px`,
                  }
                : { left: 0, top: 0, width: "100%", height: "100%" }
            }
            data-testid={`player-zone-frame-tile-${tile.screenId}`}
          >
            {tileZones.map((zone) => (
              <div
                key={zone.id}
                className="absolute"
                style={{
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${zone.width}%`,
                  height: `${zone.height}%`,
                  zIndex: zone.zIndex || 1,
                }}
              >
                <div
                  className={`absolute inset-0 ${zone.type === "shape" ? "" : "overflow-hidden"}`}
                >
                  <ZoneRenderer
                    zone={zone}
                    media={resolveZoneMedia(zone)}
                    mediaIndex={getZoneMediaIndex(zone.id)}
                    isPlaying={true}
                    showBorder={false}
                    timezone={weatherTimezone}
                    fillContainer={true}
                    mediaBaseUrl="/api/player/media"
                    deviceToken={token}
                    playerContext={{
                      screenName: tile.name,
                      roomName:
                        content!.playerVars?.roomName ?? content!.screen?.location,
                      eventName:
                        content!.playerVars?.eventName ?? content!.event?.name,
                      clientName:
                        content!.playerVars?.clientName ?? content!.client?.name,
                      roomCapacity: content!.playerVars?.roomCapacity,
                      eventStartDate: content!.playerVars?.eventStartDate,
                      eventEndDate: content!.playerVars?.eventEndDate,
                      nextSessionTitle: content!.playerVars?.nextSessionTitle,
                      nextSessionTime: content!.playerVars?.nextSessionTime,
                      nextSessionCountdown:
                        content!.playerVars?.nextSessionCountdown,
                      weatherSummary: content!.playerVars?.weatherSummary,
                      // Task #193 — server-synced wall clock for
                      // {{date}}/{{time}}/{{day}} resolution. Pass the
                      // function (not its current return value) so each
                      // downstream re-render via usePlayerVariableTick
                      // gets a FRESH timestamp; passing a snapshot here
                      // froze {{time}} between PlayerContent re-fetches.
                      getNowMs: getSyncedNow,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      );
    };

    return (
      <div
        className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
        style={{ cursor: "none" }}
      >
        <div
          className="relative overflow-hidden"
          style={{ width: `${cwScaledWidth}px`, height: `${cwScaledHeight}px` }}
        >
          <div
            ref={containerRef}
            className="relative overflow-hidden bg-black"
            style={{
              width: `${cwW}px`,
              height: `${cwH}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            data-testid="player-capture-target"
          >
            {canvasComposite.tiles.map((tile) => (
              <div
                key={tile.screenId}
                className="absolute overflow-hidden"
                style={{
                  left: `${tile.x}px`,
                  top: `${tile.y}px`,
                  width: `${tile.width}px`,
                  height: `${tile.height}px`,
                }}
                data-testid={`player-canvas-tile-${tile.screenId}`}
              >
                {renderTileSlot(tile)}
              </div>
            ))}
          </div>
        </div>

        {!isConnected && content && (
          <div
            className="fixed bottom-4 right-4 bg-yellow-600/90 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 z-50"
            data-testid="badge-offline"
          >
            <div className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
            {isOffline ? "Offline — using cached content" : "Reconnecting..."}
          </div>
        )}
      </div>
    );
  }

  if (!layout && !isFallbackPlaylist) {
    const hideMessage = !!content.screen?.hideNoContentMessage;
    const liveBannerOverlay = content.liveOverride && content.screen?.showLiveBanner ? (
      <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1 flex items-center justify-center gap-2 text-sm font-medium">
        LIVE: {content.liveOverride.name}
      </div>
    ) : null;
    const placeholderCard = hideMessage ? null : (
      <div className="text-center text-white" data-testid="text-no-content-placeholder">
        <svg className="w-16 h-16 mx-auto mb-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-xl font-semibold mb-2">No Content Assigned</p>
        <p className="text-white/50 text-sm">{content.screen.name}</p>
        <p className="text-white/30 text-xs mt-4">
          Assign a layout or programme to this screen in VectorMesh
        </p>
      </div>
    );
    const noContentSlot = (
      <div className="absolute inset-0 bg-black flex items-center justify-center">
        {liveBannerOverlay}
        {placeholderCard}
      </div>
    );

    if (canvasEnabled) {
      const ncScaledWidth = captureW * scale;
      const ncScaledHeight = captureH * scale;
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden" style={{ cursor: "none" }}>
          <div
            className="relative overflow-hidden"
            style={{ width: `${ncScaledWidth}px`, height: `${ncScaledHeight}px` }}
          >
            <div
              className="bg-black relative overflow-hidden"
              style={{
                width: `${captureW}px`,
                height: `${captureH}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div
                className="absolute overflow-hidden"
                style={{
                  left: `${playerCanvasX}px`,
                  top: `${playerCanvasY}px`,
                  width: `${playerScreenW}px`,
                  height: `${playerScreenH}px`,
                }}
                data-testid="player-screen-slot"
              >
                {noContentSlot}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="fixed inset-0 bg-black flex items-center justify-center"
        data-testid="player-screen-slot"
      >
        {liveBannerOverlay}
        {placeholderCard}
      </div>
    );
  }

  const scaledWidth = captureW * scale;
  const scaledHeight = captureH * scale;

  // Screen slot contents (live override banner + zone frame). When
  // canvas-enabled, this lives at (canvasX, canvasY) inside the canvas
  // viewport. When not, it fills the screen viewport directly.
  const slotContents = (
    <>
      {content.liveOverride && content.screen?.showLiveBanner && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1 flex items-center justify-center gap-2 text-sm font-medium">
          LIVE: {content.liveOverride.name}
        </div>
      )}

      <div
        className="absolute"
        style={
          useCanvasMode
            ? {
                left: `${-playerCanvasX}px`,
                top: `${-playerCanvasY}px`,
                width: `${canvasW}px`,
                height: `${canvasH}px`,
              }
            : { left: 0, top: 0, width: "100%", height: "100%" }
        }
        data-testid="player-zone-frame"
      >
        {zones.map((zone) => (
          <div
            key={isLayoutRotation ? getZoneFingerprint(zone) : zone.id}
            className="absolute"
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              zIndex: zone.zIndex || 1,
            }}
          >
            <div className={`absolute inset-0 ${zone.type === "shape" ? "" : "overflow-hidden"}`}>
              <ZoneRenderer
                zone={zone}
                media={getZoneMedia(zone.id)}
                mediaIndex={getZoneMediaIndex(zone.id)}
                isPlaying={true}
                showBorder={false}
                timezone={weatherTimezone}
                fillContainer={true}
                mediaBaseUrl="/api/player/media"
                deviceToken={token}
                playerContext={{
                  screenName: content.playerVars?.screenName ?? content.screen?.name,
                  roomName: content.playerVars?.roomName ?? content.screen?.location,
                  eventName: content.playerVars?.eventName ?? content.event?.name,
                  clientName: content.playerVars?.clientName ?? content.client?.name,
                  roomCapacity: content.playerVars?.roomCapacity,
                  eventStartDate: content.playerVars?.eventStartDate,
                  eventEndDate: content.playerVars?.eventEndDate,
                  nextSessionTitle: content.playerVars?.nextSessionTitle,
                  nextSessionTime: content.playerVars?.nextSessionTime,
                  nextSessionCountdown: content.playerVars?.nextSessionCountdown,
                  weatherSummary: content.playerVars?.weatherSummary,
                  // Task #193 — server-synced wall clock for
                  // {{date}}/{{time}}/{{day}} resolution. Pass the
                  // function (not its current return value) so each
                  // downstream re-render via usePlayerVariableTick
                  // gets a FRESH timestamp.
                  getNowMs: getSyncedNow,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden" style={{ cursor: "none" }}>
      <div
        className="relative overflow-hidden"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
      >
        <div
          ref={containerRef}
          className="relative overflow-hidden bg-black"
          style={{
            width: `${captureW}px`,
            height: `${captureH}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          data-testid="player-capture-target"
        >
          {canvasEnabled ? (
            <div
              className="absolute overflow-hidden"
              style={{
                left: `${playerCanvasX}px`,
                top: `${playerCanvasY}px`,
                width: `${slotW}px`,
                height: `${slotH}px`,
              }}
              data-testid="player-screen-slot"
            >
              {slotContents}
            </div>
          ) : (
            slotContents
          )}
        </div>
      </div>

      {!isConnected && content && (
        <div className="fixed bottom-4 right-4 bg-yellow-600/90 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 z-50" data-testid="badge-offline">
          <div className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
          {isOffline ? "Offline — using cached content" : "Reconnecting..."}
        </div>
      )}
    </div>
  );
}

export default function PlayerPage({ screenId }: { screenId: string }) {
  const [auth, setAuth] = useState<{ token: string; screenId: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setAuth(stored);
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return (
      <PairingScreen
        onPaired={(pairedScreenId, token) => {
          setAuth({ token, screenId: pairedScreenId });
        }}
      />
    );
  }

  return (
    <PlayerClockProvider>
      <PlayerContent screenId={auth.screenId} token={auth.token} />
    </PlayerClockProvider>
  );
}

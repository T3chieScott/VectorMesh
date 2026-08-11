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
import { ScreenRenderSurface } from "@/components/screen-render-surface";
import { buildFontFaceCss } from "@/lib/fontFace";
import { TestPattern } from "@/components/test-pattern";
import html2canvas from "html2canvas";
import { PlayerClockProvider, usePlayerClock } from "@/lib/playerClock";
import { persistOffset } from "@/lib/playerTimeSync";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { getVideoStats } from "@/hooks/use-video-keep-alive";

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
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const autoPairAttempted = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // isAutoAttempt: true when driven by the ?code= URL (kiosk boot).
  // Task #303 — kiosks often come up before their network does, so a
  // failed AUTO attempt that is retryable (network error / 5xx) is
  // retried with exponential backoff instead of falling back to the
  // manual pairing form on a display nobody is standing next to.
  // Definitive rejections (invalid code 404, already-paired 409) stop
  // retrying and surface the error.
  const handlePairWithCode = useCallback(async (
    pairingCode: string,
    isAutoAttempt = false,
    attempt = 0,
  ) => {
    if (pairingCode.length < 4) {
      setError("Please enter a valid pairing code");
      setAutoConnecting(false);
      return;
    }
    setLoading(true);
    setError(null);
    let retryable = false;
    try {
      // Sample server-time offset from the pair response so the
      // provider's first paint is already close to correct.
      const t1 = Date.now();
      let res: Response;
      try {
        res = await fetch("/api/player/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            pairingCode: pairingCode.toUpperCase().trim(),
            hardwareInfo: { hostname: window.location.hostname },
          }),
        });
      } catch (networkErr) {
        retryable = true;
        throw new Error("Can't reach the server");
      }
      if (!res.ok) {
        if (res.status >= 500) retryable = true;
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
      if (isAutoAttempt && retryable && !unmountedRef.current) {
        // Exponential backoff: 2s, 4s, 8s, 16s, then every 30s forever.
        const delayMs = Math.min(2000 * 2 ** attempt, 30000);
        setRetryCountdown(Math.round(delayMs / 1000));
        retryTimerRef.current = setTimeout(() => {
          if (!unmountedRef.current) {
            handlePairWithCode(pairingCode, true, attempt + 1);
          }
        }, delayMs);
      } else {
        setError(err.message || "Failed to pair");
        setAutoConnecting(false);
      }
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
      handlePairWithCode(cleaned, true);
    }
  }, [handlePairWithCode]);

  if (autoConnecting) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center" data-testid="auto-pairing-screen">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <h1 className="text-2xl font-bold mb-2">Connecting Display</h1>
          <p className="text-white/60 text-sm" data-testid="auto-pairing-status">
            {retryCountdown !== null && !loading
              ? `Server unreachable — retrying automatically (next attempt in up to ${retryCountdown}s)...`
              : "Pairing automatically..."}
          </p>
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
  // Server-synced wall clock for widgets and {{time}} tokens.
  const { feedSample, getSyncedNow } = usePlayerClock();
  // Optional test-date override (?at=<ISO/date>) so an operator can
  // view a real screen as if "now" were a chosen moment. Only agenda
  // zones consume this; everything else keeps the synced live clock.
  const agendaTestAt = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("at");
    if (!raw) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }, []);
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
  // Audit gap #2: last ETag returned by /content. Sent back as
  // If-None-Match so the server can answer 304 (unchanged) and skip
  // re-sending the full payload. The server never 304s while a
  // refresh/screenshot signal is pending, so a 304 always means
  // "nothing to do this poll".
  const contentEtagRef = useRef<string | null>(null);
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

  // Task #196 — keep the display active and the media pipeline
  // alive on long-running signage tabs. The Wake Lock API stops the
  // OS from dimming/sleeping the screen (which can suspend the
  // video decoder), and the keep-alive watchdog wired into every
  // <video> in zone-renderer recovers from transient stalls.
  useScreenWakeLock(true);

  // Task #196 — root-level lifecycle wake broadcast. The per-video
  // hook handles its own listeners, but on long-running tabs we
  // also walk every <video> on the page when the tab regains focus
  // or visibility. This is belt-and-braces: if a future zone is
  // ever rendered without the keep-alive wrapper, this still
  // recovers it. We also fire a `vm:player-wake` CustomEvent so
  // other widgets (tickers, animated overlays) can react.
  useEffect(() => {
    // Broadcast a `vm:player-wake` CustomEvent on every page-lifecycle
    // thaw. Each KeepAliveVideo subscribes to this event AND respects
    // its own `enabled` gate — so inactive MediaPlayerWidget crossfade
    // layers (which mount with keep-alive disabled) stay silent and
    // we never accidentally start an offscreen video.
    //
    // We deliberately do NOT do a `document.querySelectorAll("video")`
    // walk here: that would bypass the per-video `enabled` gate and
    // start inactive layers, wasting decode cycles and risking
    // crossfade state drift.
    const wakeAll = () => {
      try {
        window.dispatchEvent(new CustomEvent("vm:player-wake"));
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") wakeAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", wakeAll);
    window.addEventListener("pageshow", wakeAll);
    // Page Lifecycle API "resume" fires when a frozen tab is thawed
    // (Chrome Memory Saver, mobile background-tab freeze). Catching
    // it here is more direct than waiting for visibilitychange.
    document.addEventListener("resume", wakeAll);
    // "freeze" is the entry side of the freeze/resume pair. The tab
    // is going inert in microseconds — we can't usefully run play()
    // here, but listening for parity with the documented root cause
    // (a) makes the page-lifecycle wiring complete and (b) lets us
    // record that a freeze happened so the matching resume's wake
    // broadcast is unambiguous if we ever need to debug from logs.
    const onFreeze = () => {
      try {
        // eslint-disable-next-line no-console
        console.debug("[player] tab freeze; will wake on resume/visibilitychange");
      } catch {}
    };
    document.addEventListener("freeze", onFreeze);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", wakeAll);
      window.removeEventListener("pageshow", wakeAll);
      document.removeEventListener("resume", wakeAll);
      document.removeEventListener("freeze", onFreeze);
    };
  }, []);

  // Task #281: inject @font-face for the screen's custom fonts into the
  // document head. A head-level <style> covers every player render branch
  // (main, canvas-tile, screen-slot) and survives offline because it is
  // driven by the cached `content` state.
  useEffect(() => {
    const fonts = content?.fonts;
    const STYLE_ID = "vm-custom-fonts";
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!fonts || fonts.length === 0) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = buildFontFaceCss(fonts);
  }, [content?.fonts]);

  const collectMediaUrls = useCallback((data: PlayerContentData): string[] => {
    const urls: string[] = [];
    const zones = (data.layout?.zones as LayoutZone[]) || [];
    const addMediaUrl = (id: string) => {
      if (id) urls.push(`/api/player/media/${id}/file?token=${token}`);
    };
    // Precache font files so they're available offline (SW caches these).
    for (const f of data.fonts || []) {
      urls.push(`/api/fonts/${f.id}/file`);
    }

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
    // Bracket the fetch with t1/t2 timestamps for the
    // NTP-style offset estimator. Captured here (not later) so the
    // RTT excludes any time spent parsing JSON or running our own
    // decision logic.
    const t1 = Date.now();
    try {
      res = await playerFetch(`/api/player/${screenId}/content`, token, {
        // Bypass the browser HTTP cache so we control revalidation
        // explicitly: a 304 must surface to JS (not be transparently
        // turned back into a cached 200 with a stale serverTime).
        cache: "no-store",
        headers: contentEtagRef.current
          ? { "If-None-Match": contentEtagRef.current }
          : undefined,
      });
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
      // 304 Not Modified: content unchanged since our last ETag and the
      // server confirmed no refresh/screenshot signal is pending, so
      // there's nothing to apply. Keep the current content; the 30s
      // heartbeat keeps the server-time offset warm.
      if (res.status === 304) {
        setIsConnected(true);
        setIsOffline(false);
        setError(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch content: ${res.status}`);
      }
      // Remember this payload's ETag to revalidate on the next poll.
      const respEtag = res.headers.get("ETag");
      if (respEtag) contentEtagRef.current = respEtag;
      const data: PlayerContentData = await res.json();
      // t2 is captured after res.json() resolves; JSON parse time
      // is ~1ms for our payloads. The estimator's rolling-median
      // RTT outlier rejection drops any sample that stalls.
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
    // Boot-time sync via the tiny /api/player/time endpoint so the
    // first ClockWidget paint is correct without waiting 7s for
    // /content.
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
        // Heartbeat doubles as a 30s sync sample so the offset
        // stays warm even when /content is debounced or 304-cached.
        const t1 = Date.now();
        // Task #196 — surface video keep-alive counters in the
        // heartbeat so the diagnostics page can show silent stalls
        // and self-recoveries to operators.
        // Task #197 — call getVideoStats() (NOT window.__vmPlayerVideoStats
        // directly) so the first heartbeat after a watchdog-triggered
        // page reload still reports the bumped reloads count that
        // bumpStat persisted to sessionStorage right before the reload.
        // Without this hop the in-memory cache is empty on a fresh
        // page lifecycle and the increase never reaches the server.
        const videoStats = getVideoStats();
        const errorsPayload = { video: videoStats };
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
            errors: errorsPayload,
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
  // Task #209 — programme block targets an agenda widget config
  // directly (no layout). The content resolver emits a synthetic
  // `{zoneId:"__fallback__", type:"agenda", agendaConfigId}` source
  // and the player wraps it in a fullscreen agenda zone.
  const isFallbackAgenda = !layout && !isFallbackPlaylist && content?.zoneSources?.some(zs => zs.zoneId === "__fallback__" && zs.type === "agenda" && zs.agendaConfigId);
  const rawZones: LayoutZone[] = useMemo(() => {
    if (layout) return (layout.zones as LayoutZone[]) || [];
    if (isFallbackAgenda) {
      const source = content!.zoneSources!.find(zs => zs.zoneId === "__fallback__" && zs.type === "agenda");
      if (source?.agendaConfigId) {
        return [{
          id: "__fallback__",
          name: "Agenda",
          type: "agenda",
          x: 0, y: 0, width: 100, height: 100,
          zIndex: 1,
          agendaConfigId: source.agendaConfigId,
        }] as LayoutZone[];
      }
    }
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
  }, [layout, isFallbackPlaylist, isFallbackAgenda, content?.zoneSources, content?.playlistItems]);

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

  const layoutAspect = layout
    ? getAspectRatioDimensions(layout.aspectRatio || "16:9", layout.customWidth, layout.customHeight)
    : null;

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

  // Logical screen surface: profile dimensions (e.g. 1920×1080 for standard HD).
  // Both Player and Monitor use profile dimensions as the shared logical
  // coordinate system.  For a native-resolution player window this yields
  // scale=1.0 (no CSS transform needed).  Canvas screens use the full canvas
  // dimensions as the capture surface; the screen's physical slot sits at
  // (playerCanvasX, playerCanvasY) inside that canvas viewport.
  // The regression test in tests/player-capture-dims.test.ts statically
  // asserts the inline-style binding so this invariant cannot silently drift.
  const captureW = canvasEnabled ? canvasW : playerScreenW;
  const captureH = canvasEnabled ? canvasH : playerScreenH;

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
                    screenTimezone={content!.screen?.timezone ?? undefined}
                    fillContainer={true}
                    mediaBaseUrl="/api/player/media"
                    deviceToken={token}
                    agendaTestAt={agendaTestAt}
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
                      // Pass the function (not the current value)
                      // so each downstream re-render gets a fresh
                      // synced timestamp.
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

  if (!layout && !isFallbackPlaylist && !isFallbackAgenda) {
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
          Assign a scene or programme to this screen in VectorMesh
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

  // Screen slot contents — shared render surface used by both Player and Monitor.
  // ScreenRenderSurface handles the zone frame div, canvas offset, per-zone
  // iteration, and ZoneRenderer delegation with identical props on both hosts.
  const slotContents = (
    <ScreenRenderSurface
      zones={zones}
      zoneKey={(zone) => isLayoutRotation ? getZoneFingerprint(zone) : zone.id}
      media={content.media}
      zoneMediaIndices={zoneMediaIndices}
      mediaBaseUrl="/api/player/media"
      deviceToken={token}
      screenTimezone={content.screen?.timezone ?? undefined}
      weatherTimezone={weatherTimezone}
      agendaTestAt={agendaTestAt}
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
        // Pass the function (not the current value) so each downstream
        // re-render gets a fresh synced timestamp.
        getNowMs: getSyncedNow,
      }}
      canvasGeometry={{
        useOffset: useCanvasMode,
        canvasX: playerCanvasX,
        canvasY: playerCanvasY,
        canvasW,
        canvasH,
      }}
      liveBanner={
        content.liveOverride && content.screen?.showLiveBanner ? (
          <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1 flex items-center justify-center gap-2 text-sm font-medium">
            LIVE: {content.liveOverride.name}
          </div>
        ) : undefined
      }
      zoneFrameTestId="player-zone-frame"
    />
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
                width: `${playerScreenW}px`,
                height: `${playerScreenH}px`,
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

// ============ PlayerCapabilities (Task #330) =================================
//
// Central deny-by-default capability policy for physical-player side-effects.
// Defined here (player.tsx) as the canonical source. The monitor page
// (monitor.tsx) imports and re-exports these constants so callers use the
// same interface without a circular dependency.
//
// Every new physical-player side-effect MUST be added to this interface and
// MUST default to false so monitor mode remains safe even when new capabilities
// are introduced.

export interface PlayerCapabilities {
  /** Whether the runtime may send heartbeat POSTs that update lastSeen / isOnline. */
  canHeartbeat: boolean;
  /** Whether the runtime may report video-health stats to the server. */
  canReportHealth: boolean;
  /** Whether the runtime may initiate or receive a pairing handshake. */
  canPair: boolean;
  /**
   * Whether the runtime may read or write device-identity values
   * (deviceToken, screenId) from/to localStorage.
   */
  canPersistDeviceIdentity: boolean;
  /**
   * Whether the runtime may act on player-command signals returned by the
   * content endpoint (refreshRequested, screenshotRequested, etc.).
   */
  playerCommandsEnabled: boolean;
}

/** Deny-by-default: ALL capabilities are false in monitor mode. */
export const MONITOR_CAPABILITIES: Readonly<PlayerCapabilities> = Object.freeze({
  canHeartbeat: false,
  canReportHealth: false,
  canPair: false,
  canPersistDeviceIdentity: false,
  playerCommandsEnabled: false,
});

/** All capabilities true — normal physical-player mode. */
export const PLAYER_CAPABILITIES: Readonly<PlayerCapabilities> = Object.freeze({
  canHeartbeat: true,
  canReportHealth: true,
  canPair: true,
  canPersistDeviceIdentity: true,
  playerCommandsEnabled: true,
});

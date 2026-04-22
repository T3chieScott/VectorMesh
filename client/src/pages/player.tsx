import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Screen, DisplayProfile, MediaAsset, LayoutTemplate, LiveOverride, LayoutZone, Playlist, PlaylistItem, Client, Event } from "@shared/schema";
import { ZoneRenderer, getAspectRatioDimensions, getZoneFingerprint } from "@/components/zone-renderer";
import { TestPattern } from "@/components/test-pattern";
import html2canvas from "html2canvas";

interface PlayerVarsData {
  screenName?: string | null;
  roomName?: string | null;
  eventName?: string | null;
  clientName?: string | null;
  roomCapacity?: number | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  nextSessionTitle?: string | null;
  nextSessionTime?: string | null;
  nextSessionCountdown?: string | null;
  weatherSummary?: string | null;
}

interface PlayerContentData {
  screen: Screen;
  profile: DisplayProfile | null;
  layout: LayoutTemplate | null;
  media: MediaAsset[];
  playlists: Playlist[];
  playlistItems: Record<string, PlaylistItem[]>;
  layoutTemplates?: Record<string, LayoutTemplate>;
  zoneSources?: Array<{ zoneId: string; type: string; playlistId?: string }>;
  liveOverride: LiveOverride | null;
  event: Event | null;
  client?: Client | null;
  playerVars?: PlayerVarsData;
  timestamp: string;
  screenshotEnabled?: boolean;
  screenshotRequested?: boolean;
}

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
      if (!data.deviceToken) {
        throw new Error("Server did not return a device token");
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
  const previousMediaUrlsRef = useRef<string[]>([]);
  const captureScreenshotRef = useRef<(() => Promise<void>) | null>(null);

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

    return [...new Set(urls)];
  }, [token]);

  const fetchContent = useCallback(async () => {
    try {
      const res = await playerFetch(`/api/player/${screenId}/content`, token);
      if (res.status === 401 || res.status === 403) {
        clearAuth();
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch content: ${res.status}`);
      }
      const data: PlayerContentData = await res.json();
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
        canvasEnabled: data.screen?.canvasEnabled,
        canvasWidth: data.screen?.canvasWidth,
        canvasHeight: data.screen?.canvasHeight,
        canvasX: data.screen?.canvasX,
        canvasY: data.screen?.canvasY,
        profileWidth: data.profile?.width,
        profileHeight: data.profile?.height,
      });

      if (data.refreshRequested) {
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
    fetchContent();
    const interval = setInterval(fetchContent, 7000);
    return () => clearInterval(interval);
  }, [fetchContent]);

  useEffect(() => {
    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        await playerFetch("/api/player/heartbeat", token, {
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
              duration: pi.duration ?? null,
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
          duration: pi.duration ?? null,
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

  useEffect(() => {
    if (zones.length === 0) return;
    const interval = setInterval(() => {
      setZoneMediaIndices(prev => {
        const next = { ...prev };
        zones.forEach(zone => {
          if (zone.type === "media") {
            const zoneMedia = getZoneMedia(zone.id);
            if (zoneMedia.length > 1) {
              next[zone.id] = ((prev[zone.id] || 0) + 1) % zoneMedia.length;
            }
          }
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [zones.length, content?.media.length]);

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

  const getZoneMedia = (zoneId: string): MediaAsset[] => {
    if (!content) return [];
    const zone = zones.find(z => z.id === zoneId);
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

  if (!layout && !isFallbackPlaylist) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <svg className="w-16 h-16 mx-auto mb-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-xl font-semibold mb-2">No Content Assigned</p>
          <p className="text-white/50 text-sm">{content.screen.name}</p>
          <p className="text-white/30 text-xs mt-4">
            Assign a layout or programme to this screen in VectorMesh
          </p>
        </div>
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

  return <PlayerContent screenId={auth.screenId} token={auth.token} />;
}

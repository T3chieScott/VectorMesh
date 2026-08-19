/**
 * Task #330 — Monitor Page
 *
 * Chromeless, read-only view of a screen's live content.  Reached after
 * the Multiview bootstrap flow: monitor-bootstrap URL → server validates
 * bootstrap token → sets HttpOnly SameSite=Strict cookie → redirects here.
 * Subsequent content polls carry the cookie automatically.
 *
 * ── PlayerCapabilities enforcement ──────────────────────────────────────────
 * The MONITOR_CAPABILITIES object (imported from player.tsx) documents the
 * deny-by-default policy.  Each capability is enforced by its ABSENCE in
 * this component — deliberately not by conditional checks that could be
 * accidentally enabled:
 *
 *   canHeartbeat:             false — no heartbeat interval is ever started
 *   canReportHealth:          false — no video health stats are collected/sent
 *   canPair:                  false — PairingScreen is never rendered
 *   canPersistDeviceIdentity: false — localStorage is never read or written
 *   playerCommandsEnabled:    false — refreshRequested / screenshotRequested
 *                                     signals are always ignored even if
 *                                     present (server strips them anyway)
 *
 * Future monitor capability additions MUST also be added to the
 * PlayerCapabilities interface (client/src/pages/player.tsx) and
 * MUST default to false in MONITOR_CAPABILITIES.
 *
 * ── Rendering parity ────────────────────────────────────────────────────────
 * The monitor mirrors the player's rendering for all single-screen layouts:
 *   - Normal layout with zones (media, agenda, html, montage, …)
 *   - Fallback playlist (zoneId === "__fallback__", type === "playlist")
 *   - Fallback agenda  (zoneId === "__fallback__", type === "agenda")
 *   - Layout-rotation  (__fallback_rotation__ or playlist-driven layouts)
 *
 * Canvas screens (screen.canvasEnabled = true) are supported.  The monitor
 * renders the same content-region crop that the physical screen displays,
 * reusing the player's canvas geometry (canvasX/Y, canvasWidth/Height,
 * display-profile dimensions) to produce an identical viewport.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { MediaAsset, LayoutZone } from "@shared/schema";
import { getAspectRatioDimensions, getZoneFingerprint } from "@/components/zone-renderer";
import { ScreenRenderSurface } from "@/components/screen-render-surface";
import { PlayerClockProvider, usePlayerClock } from "@/lib/playerClock";
import { buildFontFaceCss } from "@/lib/fontFace";
import { validatePreviewAtFormat } from "@shared/previewTime";
import { TestPattern } from "@/components/test-pattern";
// Import the canonical capability constants so this file is the live
// documentation of what monitor mode enforces.  The constants themselves
// are not used in runtime conditions — each capability is enforced by
// the absence of the corresponding code (see module-level comment above).
import { MONITOR_CAPABILITIES } from "@/pages/player";

// Validate at module load time that MONITOR_CAPABILITIES denies every
// capability.  Any new capability added to PlayerCapabilities that is
// accidentally set to true in MONITOR_CAPABILITIES will throw here.
const _badCapabilities = Object.entries(MONITOR_CAPABILITIES)
  .filter(([, v]) => v !== false)
  .map(([k]) => k);
if (_badCapabilities.length > 0) {
  throw new Error(
    `MONITOR_CAPABILITIES must deny all capabilities but ${_badCapabilities.join(", ")} is not false`,
  );
}

// ---- Monitor bootstrap injection -------------------------------------------

export function getMonitorBootstrap(): { screenId: string } | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/monitor\/([^/]+)/);
  if (m?.[1]) return { screenId: m[1] };
  return null;
}

// ---- Generic 401 placeholder ------------------------------------------------

function MonitorAuthError() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-center text-white max-w-sm px-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold mb-2">Monitor session expired</h1>
        <p className="text-white/60 text-sm">
          This monitor session is no longer valid. Create a new monitor session from the Multiview application.
        </p>
      </div>
    </div>
  );
}

// ---- MonitorContent component -----------------------------------------------

// Mirrors the player content payload shape (minus device credentials and
// command signals). playerVars and client are included so ZoneRenderer
// receives the same template variable context as the physical player.
interface MonitorPlayerVars {
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

interface MonitorContentData {
  screen?: Record<string, any> | null;
  profile?: { width?: number; height?: number } | null;
  layout?: Record<string, any> | null;
  layoutTemplates?: Record<string, Record<string, any> | null> | null;
  media?: MediaAsset[];
  fonts?: Array<{ id: string; familyId: string; name: string; weight?: number | null; style: string; format: string }>;
  playlistItems?: Record<string, Array<{ id: string; order?: number; mediaAssetId?: string | null; layoutTemplateId?: string | null; duration?: number | null }>>;
  zoneSources?: Array<{ zoneId: string; type: string; playlistId?: string | null; agendaConfigId?: string | null }>;
  event?: { name?: string | null } | null;
  // playerVars — pre-computed template variable values (same as player content endpoint)
  playerVars?: MonitorPlayerVars | null;
  // client — provides clientName fallback for playerContext
  client?: { name?: string | null } | null;
  serverTime?: number;
  /**
   * Epoch milliseconds of the timezone-resolved preview anchor, returned by
   * the server when ?at= is active. The client uses it to compute the
   * advancing agendaTestAt on each render: anchor + (now − realAnchorMs).
   */
  previewAnchorEpoch?: number;
  canvas?: { tiles?: any[] } | null;
}

function MonitorContentInner({ screenId }: { screenId: string }) {
  const { feedSample, getSyncedNow } = usePlayerClock();
  const [content, setContent] = useState<MonitorContentData | null>(null);
  const [authError, setAuthError] = useState(false);
  const [scale, setScale] = useState(1);
  const [zoneMediaIndices, setZoneMediaIndices] = useState<Record<string, number>>({});
  // Layout rotation: index into the zoneSources-driven rotation list
  const [layoutRotationIndex, setLayoutRotationIndex] = useState(0);
  const [weatherTimezone, setWeatherTimezone] = useState<string | undefined>(undefined);
  const layoutRotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Preview-time: read ?at= once on mount (stable across renders), track the
  // real-clock anchor so elapsed time can be computed on each subsequent poll.
  const previewAtRaw = useMemo(
    () => validatePreviewAtFormat(new URLSearchParams(window.location.search).get("at")),
    [],
  );
  const previewRealAnchorMs = useRef(Date.now());
  const [previewAnchorEpoch, setPreviewAnchorEpoch] = useState<number | undefined>(undefined);

  // ── Font injection ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fonts = content?.fonts;
    const STYLE_ID = "vm-custom-fonts-monitor";
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

  // ── Layout rotation items (mirrors PlayerContent.layoutRotationItems) ──────
  const layoutRotationItems = useMemo(() => {
    if (!content?.playlistItems || !content?.layoutTemplates) return [];
    if (!content?.zoneSources || content.zoneSources.length === 0) return [];
    for (const source of content.zoneSources) {
      if (source.zoneId !== "__fallback_rotation__" || source.type !== "playlist" || !source.playlistId) continue;
      const items = content.playlistItems[source.playlistId] || [];
      return items
        .filter((pi) => pi.layoutTemplateId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return [];
  }, [content?.zoneSources, content?.playlistItems, content?.layoutTemplates]);

  const isLayoutRotation = layoutRotationItems.length > 0;

  const activeLayoutItem = isLayoutRotation
    ? layoutRotationItems[layoutRotationIndex % layoutRotationItems.length]
    : null;

  const activeRotationLayout =
    activeLayoutItem?.layoutTemplateId && content?.layoutTemplates?.[activeLayoutItem.layoutTemplateId]
      ? content.layoutTemplates[activeLayoutItem.layoutTemplateId]
      : null;

  // Layout to render: rotation → layout → null (triggers fallback)
  const layout = isLayoutRotation
    ? activeRotationLayout || content?.layout || null
    : content?.layout || null;

  // ── Layout rotation timer (mirrors PlayerContent) ──────────────────────────
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
      setLayoutRotationIndex((prev) => (prev + 1) % layoutRotationItems.length);
    }, durationSec * 1000);
    return () => {
      if (layoutRotationTimerRef.current) clearTimeout(layoutRotationTimerRef.current);
    };
  }, [isLayoutRotation, layoutRotationIndex, layoutRotationItems, content?.media]);

  // ── Fallback detection (mirrors PlayerContent) ─────────────────────────────
  const isFallbackPlaylist =
    !layout &&
    content?.zoneSources?.some(
      (zs) => zs.zoneId === "__fallback__" && zs.type === "playlist",
    );
  const isFallbackAgenda =
    !layout &&
    !isFallbackPlaylist &&
    content?.zoneSources?.some(
      (zs) => zs.zoneId === "__fallback__" && zs.type === "agenda" && zs.agendaConfigId,
    );

  // ── rawZones (mirrors PlayerContent.rawZones) ─────────────────────────────
  const rawZones = useMemo((): LayoutZone[] => {
    if (layout) return (layout.zones as LayoutZone[]) || [];
    if (isFallbackAgenda) {
      const source = content!.zoneSources!.find(
        (zs) => zs.zoneId === "__fallback__" && zs.type === "agenda",
      );
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
      const source = content!.zoneSources!.find((zs) => zs.zoneId === "__fallback__");
      if (source?.playlistId) {
        const playlistItemsList = content!.playlistItems?.[source.playlistId] || [];
        const mediaOnlyItems = playlistItemsList.filter(
          (pi) => pi.mediaAssetId && !pi.layoutTemplateId,
        );
        if (mediaOnlyItems.length > 0) {
          const mediaPlayerItems = mediaOnlyItems
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((pi) => ({
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

  // ── Zone injection (mirrors PlayerContent zones useMemo) ──────────────────
  const zones = useMemo((): LayoutZone[] => {
    if (isLayoutRotation) return rawZones;
    if (!content?.zoneSources || content.zoneSources.length === 0) return rawZones;
    return rawZones.map((zone) => {
      const source = content.zoneSources!.find((zs) => zs.zoneId === zone.id);
      if (!source || source.type !== "playlist" || !source.playlistId) return zone;
      const items = content.playlistItems?.[source.playlistId] || [];
      if (items.length === 0) return zone;
      const mediaOnly = items.filter((pi) => pi.mediaAssetId && !pi.layoutTemplateId);
      if (mediaOnly.length === 0) return zone;
      const mediaPlayerItems = mediaOnly
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((pi) => ({
          id: pi.id,
          mediaAssetId: pi.mediaAssetId!,
          duration: pi.duration ?? undefined,
        }));
      return { ...zone, mediaPlayerItems };
    });
  }, [isLayoutRotation, rawZones, content?.zoneSources, content?.playlistItems]);

  // ── Layout dimensions ─────────────────────────────────────────────────────
  const layoutAspect = useMemo(() => {
    const l = layout || content?.layout;
    if (!l) return null;
    return getAspectRatioDimensions(
      l.aspectRatio || "16:9",
      l.customWidth,
      l.customHeight,
    );
  }, [layout, content?.layout]);

  // ── Canvas geometry (mirrors player.tsx canvas fields) ──────────────────
  // For canvas screens the monitor displays only the physical screen's crop
  // (profile.width × profile.height), offset by (canvasX, canvasY) inside
  // the full canvas-spanning layout.  This exactly mirrors what the physical
  // player shows on that screen's output.
  const monitorScreenW = (content?.profile?.width as number | null | undefined) || 1920;
  const monitorScreenH = (content?.profile?.height as number | null | undefined) || 1080;
  const rawCanvasW = (content?.screen?.canvasWidth as number | null | undefined) ?? 0;
  const rawCanvasH = (content?.screen?.canvasHeight as number | null | undefined) ?? 0;
  const canvasEnabled =
    (content?.screen?.canvasEnabled as boolean | undefined) === true &&
    rawCanvasW > 0 &&
    rawCanvasH > 0;
  const canvasW = canvasEnabled ? rawCanvasW : 0;
  const canvasH = canvasEnabled ? rawCanvasH : 0;
  const monitorCanvasX = (content?.screen?.canvasX as number | null | undefined) || 0;
  const monitorCanvasY = (content?.screen?.canvasY as number | null | undefined) || 0;

  // Both canvas and non-canvas screens use the screen's profile dimensions as
  // the shared logical surface — the same coordinate system as the physical
  // player.  Canvas-spanning layouts additionally apply a zone-frame offset
  // (useCanvasMode below) so only this screen's slice is visible through the
  // overflow:hidden viewport.
  const viewportW = monitorScreenW;
  const viewportH = monitorScreenH;

  // useCanvasMode: layout was authored at the FULL canvas dimensions so zones
  // reference canvas coords — apply the (-canvasX, -canvasY) translate so
  // only this screen's slice is visible (matches player.tsx useCanvasMode).
  const useCanvasMode =
    canvasEnabled &&
    layoutAspect !== null &&
    Math.abs(layoutAspect.width - canvasW) <= 1 &&
    Math.abs(layoutAspect.height - canvasH) <= 1;

  // ── Scale (fit viewport to window) ───────────────────────────────────────
  useEffect(() => {
    const updateScale = () => {
      const sx = window.innerWidth / viewportW;
      const sy = window.innerHeight / viewportH;
      setScale(Math.min(sx, sy));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [viewportW, viewportH]);

  // ── Media index rotation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!zones.length || !content?.media?.length) return;
    const interval = setInterval(() => {
      setZoneMediaIndices((prev) => {
        const next = { ...prev };
        zones.forEach((zone) => {
          const zoneMedia = resolveZoneMedia(zone, content?.media || []);
          if (zoneMedia.length > 1) {
            next[zone.id] = ((prev[zone.id] || 0) + 1) % zoneMedia.length;
          }
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [zones, content?.media]);

  // ── Weather timezone fetch (mirrors PlayerContent weather effect) ──────────
  // Finds the first weather-type zone, calls the monitor weather endpoint,
  // and stores the returned IANA timezone so weather widgets display
  // wall-clock times in the weather location's timezone — matching the
  // physical player's behaviour.
  useEffect(() => {
    const weatherZone = zones.find(
      (z) => z.type === "weather" && z.weatherLat && z.weatherLng,
    );
    if (weatherZone && weatherZone.weatherLat && weatherZone.weatherLng) {
      fetch(
        `/api/monitor/widgets/weather?lat=${weatherZone.weatherLat}&lng=${weatherZone.weatherLng}&unit=${weatherZone.weatherUnit || "celsius"}`,
        { credentials: "same-origin" },
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.timezone) setWeatherTimezone(data.timezone);
        })
        .catch(() => {});
    }
  }, [zones.length, layout?.id]);

  // ── Content fetch ─────────────────────────────────────────────────────────
  // Authenticated by the HttpOnly monitor-session cookie.
  // No device-token header is ever sent (canPersistDeviceIdentity = false).
  const fetchContent = useCallback(async () => {
    try {
      const t1 = Date.now();
      // Preview-time: append ?at= and elapsed_ms when a preview anchor is active.
      // The server converts the naïve anchor to an absolute time in the screen's
      // configured timezone and adds elapsed_ms so the preview clock advances
      // between polls without client-side timezone knowledge.
      const elapsedMs = t1 - previewRealAnchorMs.current;
      const previewParams = previewAtRaw
        ? `?at=${encodeURIComponent(previewAtRaw)}&elapsed_ms=${elapsedMs}`
        : "";
      const res = await fetch(`/api/monitor/${screenId}/content${previewParams}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        setAuthError(true);
        if (fetchIntervalRef.current) {
          clearInterval(fetchIntervalRef.current);
          fetchIntervalRef.current = null;
        }
        return;
      }
      if (!res.ok) return;
      const data: MonitorContentData = await res.json();
      const t2 = Date.now();
      if (typeof data.serverTime === "number") {
        feedSample(t1, data.serverTime, t2);
      }
      // Capture the server-resolved preview anchor epoch so agendaTestAt can
      // be computed from it without repeating the timezone conversion.
      if (typeof data.previewAnchorEpoch === "number") {
        setPreviewAnchorEpoch(data.previewAnchorEpoch);
      }
      // playerCommandsEnabled = false: intentionally ignore refreshRequested,
      // screenshotRequested, etc.  Server also strips these fields.
      setContent(data);
    } catch {
      // Network error — keep last content on screen
    }
  }, [screenId, feedSample, previewAtRaw]);

  useEffect(() => {
    fetchContent();
    fetchIntervalRef.current = setInterval(fetchContent, 7000);
    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current);
    };
  }, [fetchContent]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (authError) return <MonitorAuthError />;

  if (!content) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (content.screen?.testPatternEnabled) {
    // Mirror player.tsx: render the canonical TestPattern SVG at this screen's
    // profile dimensions (the physical screen's resolution), scaled to fill the
    // monitor viewport.  PlayerCapabilities.canHeartbeat = false is preserved —
    // no heartbeat code runs in this branch.
    const vpW = typeof window !== "undefined" ? window.innerWidth : monitorScreenW;
    const vpH = typeof window !== "undefined" ? window.innerHeight : monitorScreenH;
    const tpScale = Math.min(vpW / monitorScreenW, vpH / monitorScreenH);
    return (
      <div
        className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
        style={{ cursor: "none" }}
      >
        <div
          style={{
            width: `${monitorScreenW}px`,
            height: `${monitorScreenH}px`,
            transform: `scale(${tpScale})`,
            transformOrigin: "center center",
            position: "relative",
          }}
        >
          <TestPattern
            screenName={content.screen.name as string}
            width={monitorScreenW}
            height={monitorScreenH}
          />
        </div>
      </div>
    );
  }

  if (zones.length === 0) {
    return <div className="fixed inset-0 bg-black" />;
  }

  // Compute the advancing agendaTestAt from the server-resolved preview anchor.
  // Keeps agenda zones in sync with the server-side schedule selection.
  // Updates automatically on each content fetch (≈7 s polling interval).
  const agendaTestAt =
    previewAtRaw !== undefined && previewAnchorEpoch !== undefined
      ? new Date(
          previewAnchorEpoch + (Date.now() - previewRealAnchorMs.current),
        ).toISOString()
      : undefined;

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center"
      style={{ cursor: "none" }}
    >
      {/*
       * viewportW × viewportH is the profile dimensions of this screen.
       * Both canvas and non-canvas screens share the same logical coordinate
       * system as the physical player (profile.width × profile.height).
       * The inner div is scaled to fill the monitor tile; overflow:hidden
       * clips canvas-spanning zone frames to just this screen's crop.
       */}
      <div
        style={{
          // flex-shrink:0 is required. The parent is display:flex; without
          // this, Flexbox shrinks the logical surface from viewportW px to
          // the available tile width BEFORE scale() is applied (transforms
          // happen after layout). A 1920 px surface would be squished to the
          // tile width (e.g. 525 px) before scale runs, causing portrait
          // rendering inside a landscape tile — or any profile to appear
          // cropped/distorted rather than scaled. Setting flex:none (shorthand
          // for flex-grow:0; flex-shrink:0; flex-basis:auto) locks the box at
          // its declared width × height so scale() receives the correct surface.
          flex: "none",
          width: `${viewportW}px`,
          height: `${viewportH}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/*
         * ScreenRenderSurface is the shared rendering component used by both
         * Player and Monitor.  Identical zone props, identical canvas geometry
         * logic — Monitor differs only in mediaBaseUrl (cookie auth vs device
         * token) and the absence of a live banner.
         */}
        <ScreenRenderSurface
          zones={zones}
          zoneKey={(zone) => isLayoutRotation ? getZoneFingerprint(zone) : zone.id}
          media={content.media || []}
          zoneMediaIndices={zoneMediaIndices}
          mediaBaseUrl="/api/monitor/media"
          screenTimezone={content.screen?.timezone ?? undefined}
          weatherTimezone={weatherTimezone}
          agendaTestAt={agendaTestAt}
          playerContext={{
            screenName: content.playerVars?.screenName ?? content.screen?.name,
            roomName: content.playerVars?.roomName ?? content.screen?.location,
            eventName: content.playerVars?.eventName ?? content.event?.name,
            clientName: content.playerVars?.clientName ?? content.client?.name,
            roomCapacity: content.playerVars?.roomCapacity,
            eventStartDate: content.playerVars?.eventStartDate ?? undefined,
            eventEndDate: content.playerVars?.eventEndDate ?? undefined,
            nextSessionTitle: content.playerVars?.nextSessionTitle,
            nextSessionTime: content.playerVars?.nextSessionTime,
            nextSessionCountdown: content.playerVars?.nextSessionCountdown,
            weatherSummary: content.playerVars?.weatherSummary,
            // Synced clock function — same as physical player; each
            // ZoneRenderer re-render gets a fresh timestamp offset.
            getNowMs: getSyncedNow,
          }}
          canvasGeometry={{
            useOffset: useCanvasMode,
            canvasX: monitorCanvasX,
            canvasY: monitorCanvasY,
            canvasW,
            canvasH,
          }}
        />
      </div>
    </div>
  );
}

/** Resolves media for a zone — mirrors PlayerContent's resolveZoneMedia. */
function resolveZoneMedia(
  zone: Pick<LayoutZone, "id" | "mediaId"> | undefined,
  media: MediaAsset[],
): MediaAsset[] {
  if (!zone) return media;
  if (zone.mediaId) {
    const specific = media.filter((m) => m.id === zone.mediaId);
    if (specific.length > 0) return specific;
  }
  return media;
}

export function MonitorPage() {
  const bootstrap = getMonitorBootstrap();

  if (!bootstrap?.screenId) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white/60 text-sm">Invalid monitor URL</div>
      </div>
    );
  }

  return (
    <PlayerClockProvider>
      <MonitorContentInner screenId={bootstrap.screenId} />
    </PlayerClockProvider>
  );
}

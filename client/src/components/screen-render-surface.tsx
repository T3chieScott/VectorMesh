/**
 * ScreenRenderSurface — shared rendering component for Player and Monitor.
 *
 * Implements the "shared logical screen surface" from the VectorMesh rendering
 * architecture:
 *
 *   Content Resolver
 *          ↓
 *   ScreenRenderModel  { logicalWidth × logicalHeight, profile, zones, canvas … }
 *          ↓
 *   ScreenRenderSurface  ← this component
 *         ↙                     ↘
 *   Player Host             Monitor Host
 *   (player.tsx)            (monitor.tsx)
 *   scale: top-left         scale: center-center
 *   auth: device token      auth: session cookie
 *   + screenshot, pairing   (read-only, no side-effects)
 *
 * Responsibilities:
 * - Zone frame div with optional canvas-spanning offset (useOffset).
 * - Iterates zones, renders each at its percentage x/y/width/height.
 * - Delegates per-zone content to ZoneRenderer (HTML, image, video,
 *   agenda, ticker, shape, …).
 * - Resolves per-zone media from the shared media array.
 *
 * NOT responsible for:
 * - Logical surface dimensions (caller owns logicalW/logicalH).
 * - CSS scale-to-fit transform (caller wraps this inside a transformed div).
 * - Screenshot / html2canvas capture (Player host only).
 * - Canvas composite multi-tile rendering (Player host only).
 * - Test pattern (caller renders TestPattern before mounting this).
 * - Authentication: mediaBaseUrl + deviceToken differ by host.
 */

import type { LayoutZone, MediaAsset } from "@shared/schema";
import { ZoneRenderer } from "@/components/zone-renderer";
import type { PlayerVariableContext } from "@/components/zone-renderer";
import type { AgendaZoneBinding } from "@/lib/agenda-scene-completion";

// ── Canvas geometry ───────────────────────────────────────────────────────────

/**
 * Zone-frame canvas geometry provided by the host.
 *
 * When `useOffset` is true the layout was authored at the FULL canvas
 * dimensions and zone percentage-coordinates reference canvas space.
 * The zone frame div is sized to canvasW×canvasH and translated by
 * (−canvasX, −canvasY) so that only this physical screen's slice is
 * visible through the overflow:hidden viewport above it.
 *
 * When `useOffset` is false (normal layouts, or canvas screens with a
 * per-screen authored layout) the zone frame fills 100%×100% of the
 * logical surface and zones fill it directly.
 *
 * For non-canvas screens pass:
 *   { useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }
 */
export interface ScreenCanvasGeometry {
  useOffset: boolean;
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
}

// ── Component interface ───────────────────────────────────────────────────────

export interface ScreenRenderSurfaceProps {
  /** Zones to render (with mediaPlayerItems already injected by the host). */
  zones: LayoutZone[];
  /**
   * React key function per zone.  Defaults to `zone.id`.
   * Player passes `getZoneFingerprint(zone)` during layout rotation so zones
   * unmount/remount correctly when the rotation index changes.
   */
  zoneKey?: (zone: LayoutZone) => string;
  /** All resolved media assets for this screen. */
  media: MediaAsset[];
  /** Current rotating media index per zone id (updated every 8 s by the host). */
  zoneMediaIndices: Record<string, number>;
  /**
   * Base URL for media API calls.
   *   Player:  `/api/player/media`  (device-token header auth)
   *   Monitor: `/api/monitor/media` (session-cookie auth)
   */
  mediaBaseUrl: string;
  /** Device token (Player only — Monitor must never set this). */
  deviceToken?: string;
  /** Screen IANA timezone for time-sensitive widgets (clock, countdown). */
  screenTimezone?: string;
  /** Weather timezone override surfaced by the weather widget. */
  weatherTimezone?: string;
  /** Fixed "now" override for agenda widget integration testing (ISO 8601 string). */
  agendaTestAt?: string;
  /** Per-zone lifecycle bindings for completion-aware playlist layouts. */
  agendaCompletionBindings?: ReadonlyMap<string, AgendaZoneBinding>;
  /**
   * Pre-computed player / template variables (screenName, roomName, …,
   * getNowMs).  Identical shape to what PlayerContent and MonitorContentInner
   * pass to ZoneRenderer — ensures HTML template zones, ticker zones, and
   * agenda zones see the same context on both hosts.
   */
  playerContext: PlayerVariableContext;
  /**
   * Canvas zone-frame geometry.
   * For non-canvas screens pass:
   *   { useOffset: false, canvasX: 0, canvasY: 0, canvasW: 0, canvasH: 0 }
   */
  canvasGeometry: ScreenCanvasGeometry;
  /**
   * Optional JSX rendered before the zone frame (e.g. the live-event banner
   * in Player mode).  Monitor does not render a live banner.
   */
  liveBanner?: React.ReactNode;
  /**
   * data-testid on the zone frame div.
   * Defaults to "screen-render-zone-frame".
   */
  zoneFrameTestId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Shared screen renderer consumed by both Player and Monitor.
 *
 * Renders a zone-frame div positioned within a caller-owned logical surface
 * (whose width × height the caller sets via inline style + CSS transform).
 */
export function ScreenRenderSurface({
  zones,
  zoneKey,
  media,
  zoneMediaIndices,
  mediaBaseUrl,
  deviceToken,
  screenTimezone,
  weatherTimezone,
  agendaTestAt,
  agendaCompletionBindings,
  playerContext,
  canvasGeometry,
  liveBanner,
  zoneFrameTestId = "screen-render-zone-frame",
}: ScreenRenderSurfaceProps) {
  const { useOffset, canvasX, canvasY, canvasW, canvasH } = canvasGeometry;

  // Resolve media for a zone: prefer zone-specific media when mediaId is set,
  // otherwise return the full screen media array (matching both Player and
  // Monitor behaviour).
  const resolveZoneMedia = (
    zone: Pick<LayoutZone, "id" | "mediaId">,
  ): MediaAsset[] => {
    if (zone.mediaId) {
      const specific = media.filter((m) => m.id === zone.mediaId);
      if (specific.length > 0) return specific;
    }
    return media;
  };

  return (
    <>
      {liveBanner}
      {/*
       * Zone frame:
       *   useOffset=true  → canvas-spanning layout; sized canvasW×canvasH and
       *                      translated by (−canvasX, −canvasY) so the
       *                      overflow:hidden viewport clips to this screen's
       *                      slice only.
       *   useOffset=false → normal or per-screen layout; fills 100%×100% of
       *                      the logical surface directly.
       */}
      <div
        className="absolute"
        style={
          useOffset
            ? {
                left: `${-canvasX}px`,
                top: `${-canvasY}px`,
                width: `${canvasW}px`,
                height: `${canvasH}px`,
              }
            : { left: 0, top: 0, width: "100%", height: "100%" }
        }
        data-testid={zoneFrameTestId}
      >
        {zones.map((zone) => (
          <div
            key={zoneKey ? zoneKey(zone) : zone.id}
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
                mediaIndex={zoneMediaIndices[zone.id] || 0}
                isPlaying={true}
                showBorder={false}
                timezone={weatherTimezone}
                screenTimezone={screenTimezone}
                fillContainer={true}
                mediaBaseUrl={mediaBaseUrl}
                deviceToken={deviceToken}
                agendaTestAt={agendaTestAt}
                agendaCompletionBinding={agendaCompletionBindings?.get(zone.id)}
                playerContext={playerContext}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

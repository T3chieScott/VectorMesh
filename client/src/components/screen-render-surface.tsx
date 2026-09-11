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

import React, { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import type { LayoutZone, MediaAsset } from "@shared/schema";
import type { AgendaPresentationState } from "@/components/agenda/AgendaDisplayWidget";
import type { PlayerVariableContext } from "@/components/zone-renderer";
import type { AgendaZoneBinding } from "@/lib/agenda-scene-completion";
import {
  StableVideoFrameScope,
  StableVideoSurfaceProvider,
} from "@/components/stable-media-video";

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
  /**
   * Semantic identity of the complete scene.  A changed identity is prepared
   * behind the committed frame and is promoted as one React commit.
   */
  frameKey?: string;
  /**
   * Stable visual identity used for React reconciliation. Unlike frameKey,
   * this deliberately excludes database/rotation identity, allowing an
   * equivalent scene to retain expensive media elements during A → B → A.
   */
  renderKey?: string;
  /**
   * Changes that need a new readiness lifecycle even if renderKey is visually
   * identical (for example a newer monitor lease for the same agenda scene).
   */
  preparationKey?: string;
  /** Host acknowledgement: this semantic frame is now visibly committed. */
  onFrameCommitted?: (frameKey: string) => void;
  /** A controlled Agenda-only candidate resolved transparently empty. */
  onFrameSkipped?: (frameKey: string) => void;
  /**
   * Explicit host policy for a successfully resolved Agenda-only empty frame.
   * Rotation players skip, read-only rotating monitors retain, and resolved
   * nonrotating hosts commit their transparent/no-content frame.
   */
  emptyAgendaPolicy: "skip" | "retain" | "commit-no-content";
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
  /** Passive per-zone presentation reports (Player collector). */
  onAgendaPresentationState?: (zoneId: string, state: AgendaPresentationState) => void;
  /** Read-only per-zone follower states (Monitor). */
  followedAgendaPresentationStates?: ReadonlyMap<string, AgendaPresentationState>;
  /**
   * Pre-computed player / template variables (screenName, roomName, …,
   * getNowMs).  Identical shape to what PlayerContent and MonitorContentInner
   * pass to ZoneRenderer — ensures HTML template zones, ticker zones, and
   * agenda zones see the same context on both hosts.
   */
  playerContext: PlayerVariableContext;
  /** Authored 720px typography baseline expressed in this host's logical surface. */
  sceneTextScale?: number;
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
  /**
   * Zone implementation. Hosts supply the production ZoneRenderer; accepting
   * it here also keeps the frame coordinator independently DOM-testable.
   */
  ZoneRendererComponent: ComponentType<any>;
}

type FrameProps = Omit<ScreenRenderSurfaceProps, "frameKey" | "renderKey" | "preparationKey" | "onFrameCommitted" | "onFrameSkipped">;

/**
 * Both sides of a handoff use this exact element type and keyed-list position.
 * Consequently React retains the prepared B subtree when [A, B] becomes [B],
 * rather than tearing B down and mounting a second visible copy.
 */
function SurfaceFrameSlot({
  hidden,
  children,
}: {
  hidden: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0"
      style={hidden ? { opacity: 0, visibility: "hidden", pointerEvents: "none" } : undefined}
      aria-hidden={hidden ? "true" : undefined}
      {...(hidden ? ({ inert: "" } as any) : {})}
      data-testid={hidden ? "screen-render-preparing-frame" : "screen-render-committed-frame"}
    >
      {children}
    </div>
  );
}

function SurfaceFrame({
  frameIdentity,
  frameVisualIdentity,
  frameReadinessIdentity,
  frameInstanceKey,
  preparing,
  onReady,
  onSkip,
  ...props
}: FrameProps & {
  frameIdentity: string;
  frameVisualIdentity: string;
  frameReadinessIdentity: string;
  frameInstanceKey: string;
  preparing: boolean;
  onReady?: (identity: string, visualIdentity: string, readinessIdentity: string, instanceKey: string) => void;
  onSkip?: (identity: string, visualIdentity: string, readinessIdentity: string, instanceKey: string) => void;
}) {
  const { useOffset, canvasX, canvasY, canvasW, canvasH } = props.canvasGeometry;
  // Keep the Task #350 source contract explicit: this exact semantic key is
  // used by both the committed and preparing frame instances.
  const { zoneKey } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const pendingAgendaRef = useRef(new Set(
    props.zones.filter((zone) => zone.type === "agenda").map((zone) => zone.id),
  ));
  const agendaOutcomesRef = useRef(new Map<string, "visible-ready" | "empty-ready" | "failed">());
  const readyRef = useRef(false);
  const skippedRef = useRef(false);
  const mediaReadyRef = useRef(!preparing);
  const fontsReadyRef = useRef(!preparing);
  const resolveTerminalNoContent = () => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    if (props.emptyAgendaPolicy === "skip") {
      onSkip?.(frameIdentity, frameVisualIdentity, frameReadinessIdentity, frameInstanceKey);
    } else if (props.emptyAgendaPolicy === "commit-no-content") {
      pendingAgendaRef.current.clear();
      markReady();
    }
  };
  const markReady = () => {
    if (!preparing || readyRef.current || pendingAgendaRef.current.size ||
      !mediaReadyRef.current || !fontsReadyRef.current) return;
    readyRef.current = true;
    onReady?.(frameIdentity, frameVisualIdentity, frameReadinessIdentity, frameInstanceKey);
  };
  // A scene without agendas has no asynchronous render gate.  Run this after
  // it has mounted, rather than while rendering, so promotion is still atomic.
  useEffect(() => {
    if (!preparing) return;
    const root = frameRef.current;
    const observed = new Set<HTMLImageElement | HTMLVideoElement | HTMLIFrameElement>();
    const readMedia = () => root
      ? Array.from(root.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLIFrameElement>(
        "img,video,iframe[data-subframe-ready]",
      ))
        .filter((element) => element.getAttribute("data-screen-render-readiness-exempt") !== "true")
      : [];
    const unresolved = () => {
      if (root?.querySelector("[data-stable-video-pending='true']:empty")) return true;
      return readMedia().some((element) =>
        element instanceof HTMLImageElement ? !element.complete :
          element instanceof HTMLVideoElement
            ? element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            : element.dataset.subframeReady !== "true");
    };
    const checkMedia = () => {
      readMedia().forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        element.addEventListener("load", checkMedia);
        element.addEventListener("loadeddata", checkMedia);
        element.addEventListener("canplay", checkMedia);
        element.addEventListener("error", checkMedia);
      });
      mediaReadyRef.current = !unresolved();
      markReady();
    };
    const mediaObserver = root ? new MutationObserver(checkMedia) : null;
    if (root) {
      mediaObserver?.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-subframe-ready"],
      });
    }
    checkMedia();
    // Font loading is part of frame preparation: promoting before custom faces
    // settle causes exactly the one-frame reflow this gate is intended to hide.
    const fonts = document.fonts;
    if (fonts) {
      fonts.ready.then(() => {
        fontsReadyRef.current = true;
        markReady();
      });
    } else {
      fontsReadyRef.current = true;
    }
    markReady();
    return () => {
      mediaObserver?.disconnect();
      observed.forEach((element) => {
        element.removeEventListener("load", checkMedia);
        element.removeEventListener("loadeddata", checkMedia);
        element.removeEventListener("canplay", checkMedia);
        element.removeEventListener("error", checkMedia);
      });
    };
  }, [preparing]);
  const onAgendaRenderReady = (zoneId: string) => {
    pendingAgendaRef.current.delete(zoneId);
    if (pendingAgendaRef.current.size === 0) markReady();
  };
  const onAgendaPreparationOutcome = (zoneId: string, outcome: "visible-ready" | "empty-ready" | "failed") => {
    // Outcomes are per-zone snapshots, not events. Repeating a response is
    // idempotent and response order cannot decide whether a frame skips.
    agendaOutcomesRef.current.set(zoneId, outcome);
    const agendaIds = props.zones.filter((zone) => zone.type === "agenda").map((zone) => zone.id);
    if (agendaIds.some((id) => !agendaOutcomesRef.current.has(id))) return;
    const outcomes = agendaIds.map((id) => agendaOutcomesRef.current.get(id)!);
    if (outcomes.some((value) => value === "failed")) return;
    const hasVisibleAgenda = outcomes.some((value) => value === "visible-ready");
    const hasVisibleNonAgenda = props.zones.some((zone) => zone.type !== "agenda");
    if (hasVisibleAgenda || hasVisibleNonAgenda) {
      agendaIds.forEach((id) => pendingAgendaRef.current.delete(id));
      markReady();
      return;
    }
    resolveTerminalNoContent();
  };

  const resolveZoneMedia = (zone: Pick<LayoutZone, "id" | "mediaId">): MediaAsset[] => {
    if (zone.mediaId) {
      const specific = props.media.filter((m) => m.id === zone.mediaId);
      if (specific.length > 0) return specific;
    }
    return props.media;
  };

  return (
    <>
      {props.liveBanner}
      <div ref={frameRef} className="absolute" style={useOffset
        ? { left: `${-canvasX}px`, top: `${-canvasY}px`, width: `${canvasW}px`, height: `${canvasH}px` }
        : { left: 0, top: 0, width: "100%", height: "100%" }}
        data-testid={props.zoneFrameTestId || "screen-render-zone-frame"}>
        {props.zones.map((zone) => (
          <div key={zoneKey ? zoneKey(zone) : zone.id} className="absolute"
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`, zIndex: zone.zIndex || 1 }}>
            <div className={`absolute inset-0 ${zone.type === "shape" ? "" : "overflow-hidden"}`}>
              <props.ZoneRendererComponent zone={zone} media={resolveZoneMedia(zone)}
                mediaIndex={props.zoneMediaIndices[zone.id] || 0} isPlaying={!preparing} showBorder={false}
                timezone={props.weatherTimezone} screenTimezone={props.screenTimezone} fillContainer={true}
                mediaBaseUrl={props.mediaBaseUrl} deviceToken={props.deviceToken} agendaTestAt={props.agendaTestAt}
                agendaCompletionBinding={props.agendaCompletionBindings?.get(zone.id)}
                onAgendaPresentationState={props.onAgendaPresentationState}
                followedAgendaPresentationState={props.followedAgendaPresentationStates?.get(zone.id)}
                onAgendaRenderReady={undefined}
                onAgendaPreparationOutcome={preparing ? onAgendaPreparationOutcome : undefined}
                agendaPreparing={preparing}
                sceneTextScale={props.sceneTextScale}
                playerContext={props.playerContext} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Shared screen renderer consumed by both Player and Monitor.
 *
 * Renders a zone-frame div positioned within a caller-owned logical surface
 * (whose width × height the caller sets via inline style + CSS transform).
 */
export function ScreenRenderSurface({
  frameKey,
  renderKey,
  preparationKey,
  onFrameCommitted,
  onFrameSkipped,
  emptyAgendaPolicy,
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
  onAgendaPresentationState,
  followedAgendaPresentationStates,
  playerContext,
  sceneTextScale,
  canvasGeometry,
  liveBanner,
  zoneFrameTestId = "screen-render-zone-frame",
  ZoneRendererComponent,
}: ScreenRenderSurfaceProps) {
  const incoming: FrameProps = { emptyAgendaPolicy, zones, zoneKey, media, zoneMediaIndices, mediaBaseUrl, deviceToken,
    screenTimezone, weatherTimezone, agendaTestAt, agendaCompletionBindings, onAgendaPresentationState,
    followedAgendaPresentationStates, playerContext, sceneTextScale, canvasGeometry, liveBanner, zoneFrameTestId,
    ZoneRendererComponent };
  const identity = frameKey ?? JSON.stringify(zones.map((zone) => [zone.id, zone.type, zone.agendaConfigId]));
  const visualIdentity = renderKey ?? identity;
  // Existing callers retain their visual-reconciliation behavior. Only a host
  // that explicitly supplies preparationKey asks an equivalent visual frame to
  // go through readiness again.
  const readinessIdentity = preparationKey ?? visualIdentity;
  const initialAgendaOnlyRef = useRef(
    zones.length > 0 && zones.every((zone) => zone.type === "agenda"),
  );
  // Only controlled Agenda-only startup needs outcome preparation. Every
  // initial frame containing non-Agenda content preserves legacy immediate
  // visibility, with a post-reconciliation acknowledgement to synchronize the
  // Player's report/coordinator gates.
  const nextInstanceKeyRef = useRef(0);
  const allocateInstanceKey = () => `surface-frame-${++nextInstanceKeyRef.current}`;
  const [committed, setCommitted] = useState<{ identity: string; visualIdentity: string; readinessIdentity: string; instanceKey: string; props: FrameProps } | null>(
    () => initialAgendaOnlyRef.current ? null : { identity, visualIdentity, readinessIdentity, instanceKey: allocateInstanceKey(), props: incoming },
  );
  const [candidate, setCandidate] = useState<{ identity: string; visualIdentity: string; readinessIdentity: string; instanceKey: string; props: FrameProps } | null>(
    () => initialAgendaOnlyRef.current ? { identity, visualIdentity, readinessIdentity, instanceKey: allocateInstanceKey(), props: incoming } : null,
  );
  const pendingAcknowledgementRef = useRef<string | null>(
    initialAgendaOnlyRef.current ? null : identity,
  );
  const acknowledgementRef = useRef(onFrameCommitted);
  acknowledgementRef.current = onFrameCommitted;
  const skipRef = useRef(onFrameSkipped);
  skipRef.current = onFrameSkipped;
  // This ref is deliberately written during render. A late promise/event from
  // B can therefore never win during the A → B → A render/effect gap.
  const desiredIdentityRef = useRef(identity);
  desiredIdentityRef.current = identity;
  const desiredVisualIdentityRef = useRef(visualIdentity);
  desiredVisualIdentityRef.current = visualIdentity;
  const desiredReadinessIdentityRef = useRef(readinessIdentity);
  desiredReadinessIdentityRef.current = readinessIdentity;
  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;
  useEffect(() => {
    // A rapid A → B → A reversal discards B before it can promote.  Do not
    // leave an old hidden candidate alive to win a late agenda response.
    if (visualIdentity === committed?.visualIdentity &&
        readinessIdentity === committed?.readinessIdentity) {
      // The semantic scene changed but its complete visual fingerprint did
      // not. Reuse the committed subtree (notably the <video> decoder and
      // currentTime), while still acknowledging the new logical scene.
      if (identity !== committed?.identity && committed) {
        pendingAcknowledgementRef.current = identity;
        setCommitted({ ...committed, identity, visualIdentity, readinessIdentity, props: incoming });
      }
      setCandidate((previous) => previous ? null : previous);
    } else {
      // `incoming` is intentionally not a dependency: it is a new aggregate
      // each render. A candidate is an immutable semantic snapshot, and
      // recreating it while it waits for Agenda/media/fonts loses readiness
      // state and causes an update loop. Live values for an unchanged
      // committed identity are supplied directly below instead.
      setCandidate((previous) =>
        previous?.identity === identity && previous.visualIdentity === visualIdentity &&
          previous.readinessIdentity === readinessIdentity
          ? previous : { identity, visualIdentity, readinessIdentity, instanceKey: allocateInstanceKey(), props: incoming },
      );
    }
  }, [identity, visualIdentity, readinessIdentity, committed?.identity, committed?.visualIdentity,
    committed?.readinessIdentity]);
  const promote = (
    candidateIdentity: string,
    candidateVisualIdentity: string,
    candidateReadinessIdentity: string,
    candidateInstanceKey: string,
  ) => {
    if (desiredIdentityRef.current !== candidateIdentity) return;
    if (desiredVisualIdentityRef.current !== candidateVisualIdentity) return;
    if (desiredReadinessIdentityRef.current !== candidateReadinessIdentity) return;
    const currentCandidate = candidateRef.current;
    if (!currentCandidate || currentCandidate.identity !== candidateIdentity ||
      currentCandidate.visualIdentity !== candidateVisualIdentity ||
      currentCandidate.readinessIdentity !== candidateReadinessIdentity ||
      currentCandidate.instanceKey !== candidateInstanceKey) return;
    pendingAcknowledgementRef.current = candidateIdentity;
    setCommitted(currentCandidate);
    setCandidate(null);
  };
  // `onReady` runs from an async Agenda/font/media callback. Acknowledging
  // there incorrectly lets the host report B before the visible B commit.
  // Layout effects run after React has reconciled [A, B] into [B].
  useLayoutEffect(() => {
    const acknowledged = pendingAcknowledgementRef.current;
    if (!acknowledged || candidate || committed?.identity !== acknowledged ||
      desiredIdentityRef.current !== acknowledged) return;
    pendingAcknowledgementRef.current = null;
    acknowledgementRef.current?.(acknowledged);
  }, [candidate, committed?.identity]);
  const committedProps = committed?.visualIdentity === visualIdentity ? incoming : committed?.props;
  const frames = candidate
    ? [
        ...(committed && committedProps
          ? [{ identity: committed.identity, visualIdentity: committed.visualIdentity, readinessIdentity: committed.readinessIdentity, instanceKey: committed.instanceKey, props: committedProps, preparing: false }]
          : []),
        { identity: candidate.identity, visualIdentity: candidate.visualIdentity, readinessIdentity: candidate.readinessIdentity, instanceKey: candidate.instanceKey, props: candidate.props, preparing: true },
      ]
    : committed && committedProps
      ? [{ identity: committed.identity, visualIdentity: committed.visualIdentity, readinessIdentity: committed.readinessIdentity, instanceKey: committed.instanceKey, props: committedProps, preparing: false }]
      : [];
  return (
    <StableVideoSurfaceProvider>
      {frames.map((frame) => (
        <SurfaceFrameSlot
          // A superseded *candidate* with the same pixels must begin a new
          // preparation lifecycle. A committed same-visual handoff, however,
          // intentionally retains its subtree and video decoder.
          key={frame.instanceKey}
          hidden={frame.preparing}
        >
          <StableVideoFrameScope preparing={frame.preparing} frameInstanceKey={frame.instanceKey}>
            <SurfaceFrame {...frame.props} frameIdentity={frame.identity}
              frameVisualIdentity={frame.visualIdentity}
              frameReadinessIdentity={frame.readinessIdentity}
              frameInstanceKey={frame.instanceKey}
              preparing={frame.preparing} onReady={promote}
              onSkip={onFrameSkipped ? (skipped, skippedVisual, skippedReadiness, skippedInstance) => {
                const currentCandidate = candidateRef.current;
                if (desiredIdentityRef.current !== skipped || !currentCandidate ||
                  desiredVisualIdentityRef.current !== skippedVisual ||
                  desiredReadinessIdentityRef.current !== skippedReadiness ||
                  currentCandidate.identity !== skipped ||
                  currentCandidate.visualIdentity !== skippedVisual ||
                  currentCandidate.readinessIdentity !== skippedReadiness ||
                  currentCandidate.instanceKey !== skippedInstance) return;
                skipRef.current?.(skipped);
              } : undefined} />
          </StableVideoFrameScope>
        </SurfaceFrameSlot>
      ))}
    </StableVideoSurfaceProvider>
  );
}

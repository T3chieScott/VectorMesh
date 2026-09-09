import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type VideoHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import type { LayoutZone, MediaAsset } from "@shared/schema";
import { useVideoKeepAlive } from "@/hooks/use-video-keep-alive";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export function getMediaSourceIdentity(asset: MediaAsset | undefined): unknown {
  if (!asset) return null;
  return {
    mediaType: asset.mediaType,
    originalPath: asset.originalPath,
    updatedAt: asset.updatedAt ? new Date(asset.updatedAt).getTime() : null,
    mimeType: asset.mimeType,
  };
}

export function resolveStableMediaUrl(
  asset: MediaAsset,
  mediaBaseUrl = "/api/media",
  deviceToken?: string,
): string {
  if (asset.originalPath.startsWith("http")) return asset.originalPath;
  const version = asset.updatedAt ? new Date(asset.updatedAt).getTime() : "";
  const base = `${mediaBaseUrl}/${asset.id}/file`;
  if (deviceToken) return `${base}?token=${deviceToken}${version ? `&v=${version}` : ""}`;
  return version ? `${base}?v=${version}` : base;
}

export function getStableMediaVideoIdentity(
  asset: MediaAsset,
  config: Record<string, unknown>,
): string {
  return stableStringify({ source: getMediaSourceIdentity(asset), config });
}

export type StablePlaybackItem = { id: string; mediaAssetId: string; duration?: number };

export function getMediaPlaybackIdentity(
  items: StablePlaybackItem[],
  media: MediaAsset[],
): string {
  return stableStringify(items.map(({ id: _id, mediaAssetId, ...config }) => ({
    ...config,
    source: getMediaSourceIdentity(media.find((asset) => asset.id === mediaAssetId)),
  })));
}

export function canonicalPlaybackOrder<T extends StablePlaybackItem>(
  items: T[],
  shuffle = false,
): T[] {
  return shuffle && items.length > 0
    ? [...items].sort(() => Math.random() - 0.5)
    : [...items];
}

export function reconcileCanonicalPlaybackOrder<T extends StablePlaybackItem>(
  existingOrder: T[],
  canonicalItems: T[],
  media: MediaAsset[],
): T[] {
  const token = (item: T) => {
    const { id: _id, mediaAssetId, ...config } = item;
    return stableStringify({
      config,
      source: getMediaSourceIdentity(media.find((asset) => asset.id === mediaAssetId)),
    });
  };
  const remaining = canonicalItems.map((item) => ({ item, token: token(item), used: false }));
  return existingOrder.map((previous) => {
    const match = remaining.find((entry) => !entry.used && entry.token === token(previous));
    if (!match) return previous;
    match.used = true;
    return { ...previous, ...match.item };
  });
}

export function pruneRetainedMediaAssets(
  retained: Map<string, MediaAsset>,
  current: MediaAsset[],
  requiredAssetIds: Iterable<string>,
): void {
  const keep = new Set(current.map((asset) => asset.id));
  for (const id of requiredAssetIds) {
    if (id) keep.add(id);
  }
  for (const id of retained.keys()) {
    if (!keep.has(id)) retained.delete(id);
  }
}

function djb2Hash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function computeZoneRenderFingerprint(zone: LayoutZone, media: MediaAsset[]): string {
  const sourceFor = (id: unknown) => {
    const asset = typeof id === "string" ? media.find((entry) => entry.id === id) : undefined;
    return asset ? getMediaSourceIdentity(asset) : id;
  };
  const normalize = (value: unknown, key?: string): unknown => {
    if (key === "mediaId" || key === "mediaAssetId") return sourceFor(value);
    if (key?.toLowerCase().endsWith("mediaids") && Array.isArray(value)) return value.map(sourceFor);
    if (Array.isArray(value)) return value.map((entry) => normalize(entry));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([entryKey]) => entryKey !== "id" && entryKey !== "name")
      .map(([entryKey, entry]) => [entryKey, normalize(entry, entryKey)]));
  };
  return `zrf_${djb2Hash(stableStringify(normalize(zone)))}`;
}

export function computeScreenRenderFingerprint(zones: LayoutZone[], media: MediaAsset[]): string {
  const implicitCollection = zones.some((zone) => zone.type === "media" && !zone.mediaId)
    ? media.map((asset) => getMediaSourceIdentity(asset))
    : undefined;
  return `srf_${djb2Hash(stableStringify({
    zones: zones.map((zone) => computeZoneRenderFingerprint(zone, media)),
    implicitCollection,
  }))}`;
}

export function KeepAliveVideo({
  keepAliveEnabled,
  intendedPlaying,
  muted,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement> & {
  keepAliveEnabled?: boolean;
  intendedPlaying?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const isMuted = muted ?? true;
  const intended = intendedPlaying ?? props.autoPlay ?? false;
  useVideoKeepAlive(ref, {
    enabled: keepAliveEnabled ?? true,
    intendedPlaying: intended,
    muted: isMuted,
  });
  return <video ref={ref} {...props} muted={isMuted} />;
}

type OwnedVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  keepAliveEnabled?: boolean;
  intendedPlaying?: boolean;
};
type VideoClaim = {
  token: symbol;
  identity: string;
  ownerIdentity: string;
  frameInstanceKey: string;
  target: HTMLDivElement;
  preparing: boolean;
  props: OwnedVideoProps;
};
type StableVideoRegistry = {
  register: (claim: VideoClaim) => () => void;
  update: (claim: VideoClaim) => void;
};

const StableVideoRegistryContext = createContext<StableVideoRegistry | null>(null);
const StableVideoFrameContext = createContext({ preparing: false, frameInstanceKey: "unscoped" });

function OwnedVideo({ claim, host }: { claim: VideoClaim; host: HTMLDivElement }) {
  const retainedSrcRef = useRef(claim.props.src);
  useLayoutEffect(() => {
    if (host.parentElement !== claim.target) claim.target.appendChild(host);
  }, [claim.target, host]);
  const effectiveProps = claim.preparing
    ? {
        ...claim.props,
        src: retainedSrcRef.current,
        autoPlay: false,
        intendedPlaying: false,
        keepAliveEnabled: false,
        muted: true,
      }
    : { ...claim.props, src: retainedSrcRef.current };
  return createPortal(<KeepAliveVideo {...effectiveProps} />, host);
}

/**
 * A registry is deliberately owned by one ScreenRenderSurface. Videos can
 * therefore outlive a frame subtree, but can never be adopted by another
 * Player/Monitor tile or preview surface.
 */
export function StableVideoSurfaceProvider({ children }: { children: ReactNode }) {
  const claimsRef = useRef(new Map<symbol, VideoClaim>());
  const hostsRef = useRef(new Map<string, HTMLDivElement>());
  const removalTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const registryRef = useRef<StableVideoRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = {
      update() {
        refresh();
      },
      register(claim) {
        const ordinal = Array.from(claimsRef.current.values()).filter(
          (entry) => entry.frameInstanceKey === claim.frameInstanceKey &&
            entry.identity === claim.identity,
        ).length;
        claim.ownerIdentity = `${claim.identity}::${ordinal}`;
        const timer = removalTimersRef.current.get(claim.ownerIdentity);
        if (timer) {
          clearTimeout(timer);
          removalTimersRef.current.delete(claim.ownerIdentity);
        }
        const hasAuthoritativeOwner = Array.from(claimsRef.current.values()).some(
          (entry) => entry.ownerIdentity === claim.ownerIdentity && !entry.preparing,
        );
        claim.target.dataset.stableVideoPending =
          claim.preparing && !hasAuthoritativeOwner ? "true" : "false";
        claimsRef.current.set(claim.token, claim);
        refresh();
        return () => {
          claimsRef.current.delete(claim.token);
          // Ref callbacks run while React is committing the frame swap. Move
          // the surface-owned host to an already prepared successor before
          // React removes the outgoing target, so the exact video node is
          // never transiently detached from the document.
          const replacement = Array.from(claimsRef.current.values()).find(
            (entry) => entry.ownerIdentity === claim.ownerIdentity,
          );
          const host = hostsRef.current.get(claim.ownerIdentity);
          if (replacement && host && host.parentElement !== replacement.target) {
            replacement.target.appendChild(host);
          }
          // A promoted frame is reconciled by removing A and retaining B.
          // Keep ownership through that commit gap so the authoritative node
          // is not destroyed between the old and new callback refs.
          const pending = setTimeout(() => {
            removalTimersRef.current.delete(claim.ownerIdentity);
            if (![...claimsRef.current.values()].some(
              (entry) => entry.ownerIdentity === claim.ownerIdentity,
            )) {
              hostsRef.current.get(claim.ownerIdentity)?.remove();
              hostsRef.current.delete(claim.ownerIdentity);
            }
            refresh();
          }, 0);
          removalTimersRef.current.set(claim.ownerIdentity, pending);
        };
      },
    };
  }
  const claims = Array.from(claimsRef.current.values());
  const identities = Array.from(new Set(claims.map((claim) => claim.ownerIdentity)));
  void revision;
  return (
    <StableVideoRegistryContext.Provider value={registryRef.current}>
      {children}
      {identities.map((identity) => {
        const matching = claims.filter((claim) => claim.ownerIdentity === identity);
        // The visible frame remains authoritative while a silent candidate is
        // prepared. Changed identities have no visible claim and prepare their
        // own distinct node.
        const claim = matching.find((entry) => !entry.preparing) ?? matching[0];
        let host = hostsRef.current.get(identity);
        if (!host) {
          host = document.createElement("div");
          host.dataset.stableVideoOwner = identity;
          Object.assign(host.style, { width: "100%", height: "100%" });
          hostsRef.current.set(identity, host);
        }
        return claim ? <OwnedVideo key={identity} claim={claim} host={host} /> : null;
      })}
    </StableVideoRegistryContext.Provider>
  );
}

export function StableVideoFrameScope({
  preparing,
  frameInstanceKey,
  children,
}: {
  preparing: boolean;
  frameInstanceKey: string;
  children: ReactNode;
}) {
  return (
    <StableVideoFrameContext.Provider value={{ preparing, frameInstanceKey }}>
      {children}
    </StableVideoFrameContext.Provider>
  );
}

export function StableResolvedMediaVideo({
  asset,
  mediaBaseUrl,
  deviceToken,
  identityConfig,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement> & {
  asset: MediaAsset;
  mediaBaseUrl?: string;
  deviceToken?: string;
  identityConfig: Record<string, unknown>;
  keepAliveEnabled?: boolean;
  intendedPlaying?: boolean;
}) {
  const registry = useContext(StableVideoRegistryContext);
  const { preparing, frameInstanceKey } = useContext(StableVideoFrameContext);
  const sourceIdentity = stableStringify(getMediaSourceIdentity(asset));
  const retainedUrlRef = useRef<{ sourceIdentity: string; url: string } | null>(null);
  if (!retainedUrlRef.current || retainedUrlRef.current.sourceIdentity !== sourceIdentity) {
    retainedUrlRef.current = {
      sourceIdentity,
      url: resolveStableMediaUrl(asset, mediaBaseUrl, deviceToken),
    };
  }
  const identity = getStableMediaVideoIdentity(asset, identityConfig);
  const claimRef = useRef<VideoClaim | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);
  const ownedProps = { ...props, src: retainedUrlRef.current.url };
  const ownedPropsRef = useRef<OwnedVideoProps>(ownedProps);
  ownedPropsRef.current = ownedProps;
  if (claimRef.current) {
    // Children are reconciled before the provider's owner list, so mutating
    // the live claim here gives the surface-owned node the current isPlaying,
    // callbacks, and A/B layer authority in the same React commit.
    claimRef.current.preparing = preparing;
    claimRef.current.props = ownedProps;
  }
  const targetRef = useCallback((target: HTMLDivElement | null) => {
    unregisterRef.current?.();
    unregisterRef.current = null;
    claimRef.current = null;
    if (!target || !registry) return;
    const claim: VideoClaim = {
      token: Symbol(identity),
      identity,
      ownerIdentity: identity,
      frameInstanceKey,
      target,
      preparing,
      props: ownedPropsRef.current,
    };
    claimRef.current = claim;
    unregisterRef.current = registry.register(claim);
  }, [frameInstanceKey, identity, registry]);
  useLayoutEffect(() => {
    if (claimRef.current && registry) registry.update(claimRef.current);
  }, [registry, preparing, ownedProps]);
  if (registry) {
    return <div ref={targetRef} style={{ width: "100%", height: "100%" }} data-stable-video-target={identity} />;
  }
  return <KeepAliveVideo key={identity} {...ownedProps} />;
}

/**
 * Focused production seam for a resolved media-zone video. ScreenRenderSurface
 * can mount this directly in DOM regressions without importing the Vite-only
 * widget bundle (maps, sweepstake PNGs, etc.).
 */
export function StableMediaVideoRenderer({
  zone,
  media = [],
  isPlaying = true,
  mediaBaseUrl,
  deviceToken,
}: {
  zone: LayoutZone;
  media?: MediaAsset[];
  isPlaying?: boolean;
  mediaBaseUrl?: string;
  deviceToken?: string;
}) {
  const asset = zone.mediaId
    ? media.find((entry) => entry.id === zone.mediaId)
    : media[0];
  if (!asset || asset.mediaType !== "video") return null;
  const fit = (zone as LayoutZone & { mediaFitMode?: string }).mediaFitMode ?? "contain";
  const config = { fit, loop: true, muted: true };
  return (
    <StableResolvedMediaVideo
      asset={asset}
      identityConfig={config}
      mediaBaseUrl={mediaBaseUrl}
      deviceToken={deviceToken}
      className="h-full w-full"
      style={{ objectFit: fit, border: "none" } as CSSProperties}
      autoPlay={isPlaying}
      intendedPlaying={isPlaying}
      loop
      muted
      playsInline
      keepAliveEnabled={isPlaying}
    />
  );
}
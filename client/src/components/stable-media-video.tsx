import { useRef, type CSSProperties, type VideoHTMLAttributes } from "react";
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
  const sourceIdentity = stableStringify(getMediaSourceIdentity(asset));
  const retainedUrlRef = useRef<{ sourceIdentity: string; url: string } | null>(null);
  if (!retainedUrlRef.current || retainedUrlRef.current.sourceIdentity !== sourceIdentity) {
    retainedUrlRef.current = {
      sourceIdentity,
      url: resolveStableMediaUrl(asset, mediaBaseUrl, deviceToken),
    };
  }
  return (
    <KeepAliveVideo
      key={getStableMediaVideoIdentity(asset, identityConfig)}
      {...props}
      src={retainedUrlRef.current.url}
    />
  );
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
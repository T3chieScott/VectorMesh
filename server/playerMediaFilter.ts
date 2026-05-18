import type { MediaAsset, MediaShare } from "@shared/schema";

/**
 * Task #239 — site-scope the media payload shipped to a player.
 *
 * The `/api/player/:screenId/content` endpoint used to ship the entire
 * media library as `content.media`. Combined with the zone-renderer's
 * `zone.mediaId ? filter : media` fallback, a media zone with no
 * specific asset selected would rotate through *every* uploaded file
 * across all clients — a cross-tenant data leak.
 *
 * Mirrors the admin `/api/media` filter: keep assets that are either
 *   - owned by the screen's client (`asset.clientId === screenClientId`)
 *   - or explicitly shared with that client via `media_shares`.
 *
 * A screen with no `clientId` (orphan row) gets an empty list — never
 * the whole estate.
 */
export function filterMediaAssetsForScreen(
  allAssets: readonly MediaAsset[],
  screenClientId: string | null | undefined,
  sharesForScreenClient: readonly MediaShare[],
): MediaAsset[] {
  if (!screenClientId) return [];
  const sharedAssetIds = new Set(sharesForScreenClient.map((s) => s.mediaAssetId));
  return allAssets.filter(
    (a) => a.clientId === screenClientId || sharedAssetIds.has(a.id),
  );
}

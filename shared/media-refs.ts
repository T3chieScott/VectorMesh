import type { MediaAsset } from "./schema";

// Author-facing reference token for a media-library asset, e.g.
// `<img src="{{media:ab12-...}}">`. The token is stored verbatim in the
// layout (and survives server-side sanitisation) and is only turned into a
// real URL at render time by `resolveMediaRefs`, so the same authored HTML
// works in the editor preview, the simulator, and on a paired device — each
// of which supplies its own base URL / device token.
const MEDIA_REF_RE = /\{\{\s*media:\s*([a-zA-Z0-9-]+)\s*\}\}/g;

export interface ResolveMediaRefsOptions {
  media: (Pick<MediaAsset, "id" | "originalPath"> & { updatedAt?: Date | null })[];
  /** Defaults to "/api/media" (admin/editor). Players pass "/api/player/media". */
  mediaBaseUrl?: string;
  /** Per-screen device token; appended as `?token=` so the player can authorise. */
  deviceToken?: string;
}

/**
 * Replace every `{{media:ASSET_ID}}` token in `html` with a real URL.
 *
 * Mirrors the URL the media zones build (`MediaWidget`): assets whose
 * `originalPath` is an absolute http(s) URL pass straight through, everything
 * else resolves to `<base>/<id>/file` with the device token appended when
 * present. Tokens whose asset isn't in `media` are left untouched so a
 * stale/typo reference is visible rather than silently turning into a broken
 * same-origin request.
 */
export function resolveMediaRefs(html: string, opts: ResolveMediaRefsOptions): string {
  if (!html) return html ?? "";
  const { media, mediaBaseUrl, deviceToken } = opts;
  const baseUrl = mediaBaseUrl || "/api/media";
  return html.replace(MEDIA_REF_RE, (match, id: string) => {
    const asset = media.find((m) => m.id === id);
    if (!asset) return match;
    if (asset.originalPath && asset.originalPath.startsWith("http")) {
      return asset.originalPath;
    }
    const v = asset.updatedAt ? new Date(asset.updatedAt).getTime() : "";
    const qs = deviceToken
      ? `?token=${deviceToken}${v ? `&v=${v}` : ""}`
      : v ? `?v=${v}` : "";
    return `${baseUrl}/${asset.id}/file${qs}`;
  });
}

/** Build an `<img>` snippet (with a `{{media:…}}` src) for inserting into HTML. */
export function buildMediaImgSnippet(asset: { id: string; name?: string | null }): string {
  const alt = (asset.name || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<img src="{{media:${asset.id}}}" alt="${alt}" style="max-width:100%;height:auto;" />`;
}

// Shared access predicates for the copy/paste schedule-blocks flow.
//
// These decisions are used in two places that MUST agree on what's
// pasteable:
//
//   - server/bulkBlocksHandler.ts — authoritative; rejects rows with
//     per-row error codes when an access check fails.
//   - client/src/components/paste-blocks-dialog.tsx — preview only;
//     uses these same predicates so the dialog's "Will create / Skipped /
//     Targets reset" badges line up with the server outcomes.
//
// Keeping the rules in `shared/` (not server/) lets the browser bundle
// import them. We pass storage lookups in as plain values rather than
// fetcher callbacks so the server can pre-resolve via Promise.all and
// the client can use pre-loaded query data without changing the rules.

export interface LayoutLike {
  id: string;
  clientId: string | null;
}

export interface PlaylistLike {
  id: string;
  clientId: string | null;
}

export interface TargetableLike {
  id: string;
  clientId: string | null;
}

export type LayoutDecision =
  | { ok: true }
  | {
      ok: false;
      code: "forbidden_layout";
      reason: "missing" | "wrong_client" | "no_access";
      message: string;
    };

export type PlaylistDecision =
  | { ok: true }
  | {
      ok: false;
      code: "forbidden_playlist";
      reason: "missing" | "wrong_client" | "no_access";
      message: string;
    };

export type TargetDecision =
  | { ok: true }
  | { ok: false; reason: "missing" | "wrong_client" | "unknown_type" };

// Decide whether a referenced layout can be pasted into the
// destination's client.
//
// Rules:
// 1. No layout reference at all → ok (the block uses no template).
// 2. Layout id given but lookup returned undefined/null → forbidden
//    (missing). Server returns this with code forbidden_layout; the
//    client treats it the same way in the preview ("Skipped — layout").
// 3. Layout has a clientId AND that clientId differs from the
//    destination's clientId → forbidden (wrong_client). Global
//    layouts (clientId === null) pass.
// 4. Layout's owning client is one the caller can't access (server
//    only — on the client we pass () => true and let the server be
//    authoritative) → forbidden (no_access).
export function evaluateLayoutAccess(args: {
  layoutId: string | null | undefined;
  layout: LayoutLike | null | undefined;
  destinationClientId: string | null;
  canAccessClient: (clientId: string) => boolean;
}): LayoutDecision {
  if (!args.layoutId) return { ok: true };
  if (!args.layout) {
    return {
      ok: false,
      code: "forbidden_layout",
      reason: "missing",
      message: "Layout not found in destination",
    };
  }
  if (args.layout.clientId && args.layout.clientId !== args.destinationClientId) {
    return {
      ok: false,
      code: "forbidden_layout",
      reason: "wrong_client",
      message: "Layout belongs to a different site",
    };
  }
  if (args.layout.clientId && !args.canAccessClient(args.layout.clientId)) {
    return {
      ok: false,
      code: "forbidden_layout",
      reason: "no_access",
      message: "No access to layout",
    };
  }
  return { ok: true };
}

// Decide whether a referenced playlist can be pasted. Mirrors the
// layout rules, but stricter: orphan/global playlists are
// intentionally NOT auto-rewritten on paste — they require the
// destination's client to own them explicitly.
export function evaluatePlaylistAccess(args: {
  playlistId: string | null | undefined;
  playlist: PlaylistLike | null | undefined;
  destinationClientId: string | null;
  canAccessClient: (clientId: string) => boolean;
}): PlaylistDecision {
  if (!args.playlistId) return { ok: true };
  if (!args.playlist) {
    return {
      ok: false,
      code: "forbidden_playlist",
      reason: "missing",
      message: "Playlist not found in destination",
    };
  }
  if (!args.playlist.clientId || args.playlist.clientId !== args.destinationClientId) {
    return {
      ok: false,
      code: "forbidden_playlist",
      reason: "wrong_client",
      message: "Playlist belongs to a different site",
    };
  }
  if (!args.canAccessClient(args.playlist.clientId)) {
    return {
      ok: false,
      code: "forbidden_playlist",
      reason: "no_access",
      message: "No access to playlist",
    };
  }
  return { ok: true };
}

// Decide whether a single block target (a screen or screen group)
// survives paste. Targets that don't survive are silently dropped —
// an empty targets array means "all screens" and is a valid
// configuration, so the block is still created.
export function evaluateTargetAccess(args: {
  type: "screen" | "group" | string;
  entity: TargetableLike | null | undefined;
  destinationClientId: string | null;
}): TargetDecision {
  if (args.type !== "screen" && args.type !== "group") {
    return { ok: false, reason: "unknown_type" };
  }
  if (!args.entity) return { ok: false, reason: "missing" };
  if (!args.entity.clientId || args.entity.clientId !== args.destinationClientId) {
    return { ok: false, reason: "wrong_client" };
  }
  return { ok: true };
}

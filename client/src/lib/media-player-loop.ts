// Task #196 — single-item playlist freeze fix.
//
// MediaPlayerWidget historically relied on the <video> element's
// `onEnded` callback to advance to the next playlist item. When the
// playlist contained exactly one item, advanceToNext early-returned
// (no other item to advance to) and the video sat ended, frozen on
// the last frame, until somebody refreshed the tab.
//
// The fix: when there is one (or zero) item we set the native `loop`
// attribute on the <video> and skip wiring an `onEnded` handler. For
// multi-item playlists the original advance-on-ended behaviour is
// preserved — but only on the active crossfade layer, never on the
// hidden offscreen layer (which would otherwise advance both layers
// in lock-step).
//
// Extracted as a pure helper so it can be exercised by node:test
// without a React renderer.

export interface MediaPlayerVideoLoopProps {
  /** Native <video loop> — true only for length-≤1 playlists. */
  loop: boolean;
  /** Whether the renderer should attach an onEnded handler. */
  attachOnEnded: boolean;
}

export function getMediaPlayerVideoLoopProps(args: {
  itemsLength: number;
  isActiveLayer: boolean;
}): MediaPlayerVideoLoopProps {
  const singleItem = args.itemsLength <= 1;
  return {
    loop: singleItem,
    attachOnEnded: !singleItem && args.isActiveLayer,
  };
}

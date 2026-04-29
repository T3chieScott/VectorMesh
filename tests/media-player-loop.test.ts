// Task #196 — single-item playlist freeze fix.
//
// Verifies the decision helper that picks `<video loop>` and the
// onEnded wiring in MediaPlayerWidget. Before this fix, a playlist
// with exactly one video sat frozen on the last frame because
// advanceToNext early-returned and the native loop attribute was
// never set. Now: length ≤ 1 → loop=true, attachOnEnded=false.

import test from "node:test";
import assert from "node:assert/strict";

const PREFIX = "__TEST_S196__";

const { getMediaPlayerVideoLoopProps } = await import(
  "../client/src/lib/media-player-loop"
);

test(`${PREFIX} single-item playlist on the active layer loops natively and skips onEnded`, () => {
  const props = getMediaPlayerVideoLoopProps({ itemsLength: 1, isActiveLayer: true });
  assert.equal(props.loop, true, "single-item playlist must use native <video loop>");
  assert.equal(
    props.attachOnEnded,
    false,
    "single-item playlist must NOT wire onEnded → advanceToNext (would freeze)",
  );
});

test(`${PREFIX} empty playlist behaves like single-item (defensive)`, () => {
  const props = getMediaPlayerVideoLoopProps({ itemsLength: 0, isActiveLayer: true });
  assert.equal(props.loop, true);
  assert.equal(props.attachOnEnded, false);
});

test(`${PREFIX} multi-item playlist on the active layer attaches onEnded and does NOT loop`, () => {
  const props = getMediaPlayerVideoLoopProps({ itemsLength: 4, isActiveLayer: true });
  assert.equal(props.loop, false, "multi-item playlist must not loop natively");
  assert.equal(
    props.attachOnEnded,
    true,
    "active layer must advance to next item via onEnded",
  );
});

test(`${PREFIX} multi-item playlist on the INACTIVE crossfade layer never attaches onEnded`, () => {
  // Both layers render concurrently; only the active one is allowed
  // to advance the playlist. Otherwise both layers would advance in
  // lock-step and the crossfade would skip an item.
  const props = getMediaPlayerVideoLoopProps({ itemsLength: 4, isActiveLayer: false });
  assert.equal(props.loop, false);
  assert.equal(
    props.attachOnEnded,
    false,
    "inactive crossfade layer must not advance the playlist",
  );
});

test(`${PREFIX} single-item playlist on the inactive layer also loops without onEnded`, () => {
  // Edge case: when both layers point at the same single video
  // (because there's only one item), they both get loop=true and
  // neither attaches onEnded. The keep-alive watchdog gating
  // separately silences the inactive layer's autoPlay.
  const props = getMediaPlayerVideoLoopProps({ itemsLength: 1, isActiveLayer: false });
  assert.equal(props.loop, true);
  assert.equal(props.attachOnEnded, false);
});

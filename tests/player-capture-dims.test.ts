import test from "node:test";
import assert from "node:assert/strict";
import { computePlayerCaptureDims } from "../client/src/lib/playerCaptureDims";

// Regression test for Task #80 (Fix cropped player snapshots).
//
// The captureScreenshot callback in player.tsx reads `offsetWidth` /
// `offsetHeight` from the capture target element and feeds them to
// html2canvas as the explicit capture box. Those offsets reflect the inline
// `style.width` / `style.height` set from `captureW` / `captureH`, which are
// produced by computePlayerCaptureDims. If this formula drifts, html2canvas
// gets the wrong capture region and snapshots crop again.

test("non-canvas screen: capture dims = trueWidth × trueHeight", () => {
  const dims = computePlayerCaptureDims({
    canvasEnabled: false,
    canvasW: 1920,
    canvasH: 1080,
    trueWidth: 1280,
    trueHeight: 720,
  });
  assert.equal(dims.captureW, 1280);
  assert.equal(dims.captureH, 720);
});

test("canvas-enabled screen: capture dims = canvasW × canvasH", () => {
  const dims = computePlayerCaptureDims({
    canvasEnabled: true,
    canvasW: 3840,
    canvasH: 1080,
    trueWidth: 1280,
    trueHeight: 720,
  });
  assert.equal(dims.captureW, 3840);
  assert.equal(dims.captureH, 1080);
});

test("non-canvas portrait: capture dims = trueWidth × trueHeight (ignores canvas dims)", () => {
  const dims = computePlayerCaptureDims({
    canvasEnabled: false,
    canvasW: 9999,
    canvasH: 9999,
    trueWidth: 405,
    trueHeight: 720,
  });
  assert.equal(dims.captureW, 405);
  assert.equal(dims.captureH, 720);
});

test("canvas-enabled with mismatched true dims: canvas wins", () => {
  const dims = computePlayerCaptureDims({
    canvasEnabled: true,
    canvasW: 7680,
    canvasH: 2160,
    trueWidth: 1280,
    trueHeight: 720,
  });
  assert.equal(dims.captureW, 7680);
  assert.equal(dims.captureH, 2160);
});

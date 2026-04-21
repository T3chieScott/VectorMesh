export interface CaptureDimsInput {
  canvasEnabled: boolean;
  canvasW: number;
  canvasH: number;
  trueWidth: number;
  trueHeight: number;
}

export interface CaptureDims {
  captureW: number;
  captureH: number;
}

/**
 * Compute the player's html2canvas capture-target dimensions.
 *
 * For canvas-enabled screens the player renders the whole canvas as its
 * viewport (with the screen positioned at its AOI inside it), so the capture
 * target is the whole canvas. For non-canvas screens the capture target is
 * the screen viewport (legacy behavior, sized off REFERENCE_HEIGHT).
 *
 * The capture target element in player.tsx applies these as inline
 * width/height. The captureScreenshot callback then reads `offsetWidth` /
 * `offsetHeight` (which are these same numbers, unaffected by `transform:
 * scale(...)`) and feeds them to html2canvas as its capture box. Centralizing
 * the formula here lets a regression test lock in the invariant.
 */
export function computePlayerCaptureDims(input: CaptureDimsInput): CaptureDims {
  return {
    captureW: input.canvasEnabled ? input.canvasW : input.trueWidth,
    captureH: input.canvasEnabled ? input.canvasH : input.trueHeight,
  };
}

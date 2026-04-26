import type { Screen } from "@shared/schema";

// "Implicit canvas" model. We do NOT have a formal canvas entity in
// the schema (no canvases table, no canvasId foreign key on screens).
// Two screens are considered to be on the same canvas / video wall
// when they:
//   - both have canvasEnabled = true
//   - share the same clientId (a wall always belongs to one site)
//   - share the same canvasWidth AND canvasHeight (mismatched
//     dimensions are intentionally NOT grouped — the player only
//     enters canvas mode when the layout's authored size matches the
//     screen's canvas size, so screens with different canvas sizes
//     can never display the same source content)
//
// Screens with canvasEnabled = false, or with null/zero
// canvasWidth/Height, are excluded entirely.

export interface CanvasGroupKey {
  clientId: string | null;
  canvasWidth: number;
  canvasHeight: number;
}

export interface CanvasGroup {
  key: CanvasGroupKey;
  // String form used as the Map key. Format: `${clientId ?? ""}|${w}x${h}`.
  keyString: string;
  screens: Screen[];
}

function isCanvasEnabledScreen(s: Screen): boolean {
  return (
    !!s.canvasEnabled &&
    typeof s.canvasWidth === "number" &&
    s.canvasWidth > 0 &&
    typeof s.canvasHeight === "number" &&
    s.canvasHeight > 0
  );
}

export function canvasGroupKeyString(
  clientId: string | null,
  canvasWidth: number,
  canvasHeight: number,
): string {
  return `${clientId ?? ""}|${canvasWidth}x${canvasHeight}`;
}

// Group every canvas-enabled screen by (clientId, canvasWidth,
// canvasHeight). Single-screen groups are still returned — the form
// preview wants to know "is this screen alone on its canvas?" rather
// than guessing.
export function groupScreensByCanvas(
  screens: Screen[],
): Map<string, CanvasGroup> {
  const groups = new Map<string, CanvasGroup>();
  for (const s of screens) {
    if (!isCanvasEnabledScreen(s)) continue;
    const key: CanvasGroupKey = {
      clientId: s.clientId ?? null,
      canvasWidth: s.canvasWidth!,
      canvasHeight: s.canvasHeight!,
    };
    const keyString = canvasGroupKeyString(
      key.clientId,
      key.canvasWidth,
      key.canvasHeight,
    );
    const existing = groups.get(keyString);
    if (existing) {
      existing.screens.push(s);
    } else {
      groups.set(keyString, { key, keyString, screens: [s] });
    }
  }
  return groups;
}

// Look up the screens that share `screen`'s canvas, EXCLUDING
// `screen` itself. Returns [] when the screen isn't canvas-enabled
// or when it's the only one on its canvas. The caller passes the
// already-built Map so we don't re-group on every render.
export function siblingsOnCanvas(
  screen: Pick<
    Screen,
    "id" | "clientId" | "canvasEnabled" | "canvasWidth" | "canvasHeight"
  >,
  groups: Map<string, CanvasGroup>,
): Screen[] {
  if (
    !screen.canvasEnabled ||
    typeof screen.canvasWidth !== "number" ||
    screen.canvasWidth <= 0 ||
    typeof screen.canvasHeight !== "number" ||
    screen.canvasHeight <= 0
  ) {
    return [];
  }
  const keyString = canvasGroupKeyString(
    screen.clientId ?? null,
    screen.canvasWidth,
    screen.canvasHeight,
  );
  const group = groups.get(keyString);
  if (!group) return [];
  return group.screens.filter((s) => s.id !== screen.id);
}

// Same as siblingsOnCanvas but for a hypothetical screen that isn't
// in `screens` yet (e.g. while being created in a form). Use when
// you need siblings keyed by (clientId, w, h) but don't have a real
// Screen row.
export function siblingsForCanvasParams(
  params: {
    excludeScreenId?: string;
    clientId: string | null;
    canvasWidth: number | null | undefined;
    canvasHeight: number | null | undefined;
  },
  groups: Map<string, CanvasGroup>,
): Screen[] {
  const { excludeScreenId, clientId, canvasWidth, canvasHeight } = params;
  if (
    typeof canvasWidth !== "number" ||
    canvasWidth <= 0 ||
    typeof canvasHeight !== "number" ||
    canvasHeight <= 0
  ) {
    return [];
  }
  const keyString = canvasGroupKeyString(
    clientId ?? null,
    canvasWidth,
    canvasHeight,
  );
  const group = groups.get(keyString);
  if (!group) return [];
  return excludeScreenId
    ? group.screens.filter((s) => s.id !== excludeScreenId)
    : group.screens;
}

// Geometry helpers used by the form preview and the validation
// warnings. Coordinates are in canvas pixels.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// Find the next free X offset along the wall, given an existing
// canvas size and the siblings already placed on it. We scan the
// candidate X positions formed by sibling right-edges (plus 0) and
// pick the smallest one where placing a `screenWidth × screenHeight`
// box at (X, 0) doesn't overlap any sibling. Falls back to the
// rightmost sibling's right edge if every gap is too small. Y is
// always 0 for this naive layout.
export function nextFreeOffsetX(
  siblings: Pick<Screen, "canvasX" | "canvasY">[],
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } {
  // Candidate X positions: 0, then the right edge of every sibling.
  const candidates = new Set<number>([0]);
  for (const s of siblings) {
    const sx = s.canvasX ?? 0;
    candidates.add(sx);
  }
  for (const s of siblings) {
    const sx = s.canvasX ?? 0;
    candidates.add(sx + 1);
  }
  // Plus the right edges so we can land flush after the rightmost.
  let rightEdge = 0;
  for (const s of siblings) {
    const sx = s.canvasX ?? 0;
    // We don't have width info per sibling here without their profile,
    // so callers should pass a richer list when they want overlap-aware
    // placement. For the common "place to the right of everyone" case
    // we just track the max canvasX and ask the caller to pad.
    rightEdge = Math.max(rightEdge, sx);
  }
  // Without per-sibling widths we can't perfectly avoid overlap; the
  // caller is expected to pass a `nextFreeOffsetXWithRects` for that.
  // Default behaviour: drop new screen `screenWidth` pixels to the
  // right of the rightmost sibling's left edge.
  const sortedCandidates = [...candidates].sort((a, b) => a - b);
  for (const x of sortedCandidates) {
    if (x === 0 && siblings.length > 0) continue;
    return { x, y: 0 };
  }
  return { x: rightEdge + screenWidth, y: 0 };
}

// Overlap-aware placement: caller supplies rectangles for every
// sibling (since the sibling's physical width comes from its display
// profile, which the helper module doesn't know about). Picks the
// smallest non-negative X where a new `screenWidth × screenHeight`
// box at (X, 0) fits without overlapping any sibling rect. Y stays 0
// for this naive single-row layout — multi-row support is a future
// follow-up.
export function nextFreeOffsetForRects(
  siblingRects: Rect[],
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } {
  if (siblingRects.length === 0) return { x: 0, y: 0 };
  // Candidate X positions: 0 and every sibling right edge.
  const candidates = new Set<number>([0]);
  for (const r of siblingRects) {
    candidates.add(r.x + r.width);
  }
  const sorted = [...candidates].sort((a, b) => a - b);
  for (const x of sorted) {
    const candidate: Rect = { x, y: 0, width: screenWidth, height: screenHeight };
    const overlaps = siblingRects.some((r) => rectIntersection(candidate, r) !== null);
    if (!overlaps) return { x, y: 0 };
  }
  // Every candidate overlaps — fall back to placing flush after the
  // rightmost sibling. Caller may then warn about exceeding canvas.
  const rightmost = siblingRects.reduce((acc, r) => Math.max(acc, r.x + r.width), 0);
  return { x: rightmost, y: 0 };
}

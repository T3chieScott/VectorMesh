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
//   - AND the bucket as a whole contains at least two distinct
//     `(canvasX, canvasY)` positions. This positional check (Task #176)
//     prevents two unrelated authoring screens that happen to share
//     dims and both sit at (0, 0) from being treated as siblings of
//     one wall — historically that false grouping made one player's
//     heartbeat mark the other screen online and made createScreen
//     auto-inherit a `deviceToken` the operator never assigned.
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
  // String form used as the Map key. Default format for both real
  // walls and lone same-dim screens: `${clientId ?? ""}|${w}x${h}`
  // (preserves the pre-#176 lookup contract — `groups.get(dimKey)`
  // continues to find the natural single-screen group). The ONLY
  // exception is a same-dim, same-position cluster (≥2 tiles all at
  // the same `(canvasX, canvasY)`): those collide on the dim key and
  // would lose information if we kept just one entry, so they are
  // split into per-tile entries keyed `${dimKey}#${screenId}`.
  // Production callers don't do dim-key lookups against split
  // clusters — they iterate `groups.values()` via siblings helpers.
  keyString: string;
  screens: Screen[];
  // True iff this group represents an actual video wall — its
  // members occupy ≥2 distinct `(canvasX, canvasY)`. Lone screens
  // and same-position clusters are NOT walls.
  isWall: boolean;
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
// canvasHeight). The output preserves the pre-Task-#176 contract for
// the common cases:
//
//   - LONE screen on its dim → 1 single-member non-wall group at the
//     dim-only key (`${clientId}|${w}x${h}`). `groups.get(dimKey)`
//     still returns it as before.
//   - REAL wall (≥2 members at ≥2 distinct positions) → 1 multi-
//     member wall group at the dim-only key. Same pre-#176 shape.
//   - Same-dim cluster collapsed onto ONE position (the pre-#176 bug
//     case: two unrelated authoring screens both sitting at
//     (canvasX = 0, canvasY = 0)) → SPLIT into N single-member non-
//     wall groups, each keyed `${dimKey}#${screenId}`. The dim-only
//     key cannot fit them all without losing rows, so split is the
//     only safe representation. Production callers reach these via
//     `siblingsOnCanvas` (which only treats the dim-only entry as a
//     wall) and `siblingsForCanvasParams` (which iterates values), so
//     they never depend on `groups.get(dimKey)` for the cluster case.
export function groupScreensByCanvas(
  screens: Screen[],
): Map<string, CanvasGroup> {
  // First pass: bucket by (clientId, w, h).
  const buckets = new Map<string, { key: CanvasGroupKey; screens: Screen[] }>();
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
    const existing = buckets.get(keyString);
    if (existing) existing.screens.push(s);
    else buckets.set(keyString, { key, screens: [s] });
  }

  // Second pass: emit one of three shapes per bucket.
  const out = new Map<string, CanvasGroup>();
  for (const [dimKey, bucket] of buckets) {
    if (bucket.screens.length === 1) {
      // Lone screen → keep dim-key contract.
      out.set(dimKey, {
        key: bucket.key,
        keyString: dimKey,
        screens: bucket.screens,
        isWall: false,
      });
      continue;
    }
    const positions = new Set<string>();
    for (const s of bucket.screens) {
      positions.add(`${s.canvasX ?? 0}|${s.canvasY ?? 0}`);
      if (positions.size >= 2) break;
    }
    if (positions.size >= 2) {
      // Real wall → dim-key.
      out.set(dimKey, {
        key: bucket.key,
        keyString: dimKey,
        screens: bucket.screens,
        isWall: true,
      });
      continue;
    }
    // Same-position cluster: split into per-tile non-wall entries
    // because the dim key cannot hold them all simultaneously.
    for (const s of bucket.screens) {
      const soloKey = `${dimKey}#${s.id}`;
      out.set(soloKey, {
        key: bucket.key,
        keyString: soloKey,
        screens: [s],
        isWall: false,
      });
    }
  }
  return out;
}

// Pick the implicit canvas "owner" — the single tile that owns the
// pairing code for the entire wall (Task #173). Order is
// (createdAt asc, id asc) so it's stable across reloads even when
// timestamps tie. Use `pickCanvasPairingWinner` in server/storage.ts
// when you also want to bias toward the most-recently-paired member;
// this helper is the dumb sort-only version meant for read-only UI
// labels ("Inherits pairing from <owner>").
export function pickCanvasOwner<T extends Pick<Screen, "id" | "createdAt">>(
  members: T[],
): T | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}

// Owner-only pairing display gating (Task #173 / Task #175).
// Returns the booleans the screens.tsx ScreenCard uses to decide
// whether the pairing-code panel, "Regenerate Code" menu item,
// "Unpair Device" menu item, and the sibling "Inherits pairing
// from <owner>" message should render. We extract this into a pure
// helper so the regression test in tests/canvas-pairing-ui-gating.test.ts
// pins the same predicates the JSX evaluates — refactors that change
// either side will fail the test instead of silently re-exposing
// per-tile pairing controls on canvas siblings.
//
// Inputs the JSX would otherwise compute inline:
//   - `screen` is the tile being rendered.
//   - `siblingScreens` is the siblingsOnCanvas(screen, canvasGroups)
//     output (excludes `screen` itself).
//
// The screen's own `isPaired` / `pairingCode` are already on the row
// so they're read here too — that way the JSX has a single source of
// truth for "should this element render".
export interface CanvasPairingGating<S extends Pick<Screen, "id" | "createdAt" | "name" | "isPaired" | "pairingCode">> {
  owner: S;
  isCanvasOwner: boolean;
  inheritsPairingFromOwner: boolean;
  showsPairingCodePanel: boolean;
  showsRegenerateCodeMenuItem: boolean;
  showsUnpairDeviceMenuItem: boolean;
  showsInheritsMessage: boolean;
}

export function getCanvasPairingGating<
  S extends Pick<Screen, "id" | "createdAt" | "name" | "isPaired" | "pairingCode">,
>(screen: S, siblingScreens: S[]): CanvasPairingGating<S> {
  const owner =
    siblingScreens.length === 0
      ? screen
      : pickCanvasOwner([screen, ...siblingScreens]) ?? screen;
  const isCanvasOwner = owner.id === screen.id;
  // Task #179 — `inheritsPairingFromOwner` (and the downstream
  // `showsInheritsMessage`) is gated on the owner being itself paired.
  // Before this fix, the predicate was just "I'm not the owner AND
  // siblings exist" — which lied after an unpair: the wall stays
  // geometrically intact, so siblings would keep displaying
  // "Inherits pairing from <owner>" even though there is no active
  // pairing to inherit. With `owner.isPaired` in the predicate,
  // siblings only show the inherits message while the wall is actually
  // paired; in the unpaired state they fall back to their no-owner
  // empty UI (the owner card alone surfaces the pairing code panel).
  const inheritsPairingFromOwner =
    !isCanvasOwner && siblingScreens.length > 0 && !!owner.isPaired;
  return {
    owner,
    isCanvasOwner,
    inheritsPairingFromOwner,
    showsPairingCodePanel:
      !screen.isPaired && !!screen.pairingCode && isCanvasOwner,
    showsRegenerateCodeMenuItem: !screen.isPaired && isCanvasOwner,
    showsUnpairDeviceMenuItem: !!screen.isPaired && isCanvasOwner,
    showsInheritsMessage: inheritsPairingFromOwner,
  };
}

// Returns true when `group` represents an actual video wall — i.e. its
// members occupy at least two distinct `(canvasX, canvasY)` positions.
// Single-position buckets (every member at the same offset, typically
// (0, 0)) are NOT walls: they're independent authoring screens that
// happen to share dims. Used by `siblingsOnCanvas` to stop the false
// group from bleeding pairing/online state across unrelated tiles.
//
// NOTE — `siblingsForCanvasParams` deliberately does NOT use this gate.
// That helper feeds the form-edit preview's ghost rectangles, where
// showing every dim-matching screen (even ones currently sitting at
// the same position) is useful context: the operator can see what
// would become a wall sibling if they move their tile to a distinct
// (canvasX, canvasY).
export function isCanvasWallGroup(group: CanvasGroup): boolean {
  if (group.screens.length < 2) return false;
  const positions = new Set<string>();
  for (const s of group.screens) {
    positions.add(`${s.canvasX ?? 0}|${s.canvasY ?? 0}`);
    if (positions.size >= 2) return true;
  }
  return false;
}

// Look up the screens that share `screen`'s canvas, EXCLUDING
// `screen` itself. Returns [] when the screen isn't canvas-enabled,
// when it's the only one on its canvas, or when the bucket isn't a
// real wall (`groupScreensByCanvas` will have split it into single-
// member non-wall groups under `${dimKey}#${screenId}` keys). The
// caller passes the already-built Map so we don't re-group on every
// render.
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
  const dimKey = canvasGroupKeyString(
    screen.clientId ?? null,
    screen.canvasWidth,
    screen.canvasHeight,
  );
  // Real wall — group lives at the dim-only key.
  const wallGroup = groups.get(dimKey);
  if (wallGroup && wallGroup.isWall) {
    return wallGroup.screens.filter((s) => s.id !== screen.id);
  }
  // Otherwise the screen lives in its own split single-member group;
  // there are by definition no siblings on the wall.
  return [];
}

// Same as siblingsOnCanvas but for a hypothetical screen that isn't
// in `screens` yet (e.g. while being created in a form). Use when
// you need siblings keyed by (clientId, w, h) but don't have a real
// Screen row.
//
// Intentionally returns ALL screens that match the dim/client params
// regardless of whether they currently form a wall — the form preview
// uses these to draw ghost rectangles so the operator can see what
// would become a wall sibling if they move their tile to a distinct
// (canvasX, canvasY). Because `groupScreensByCanvas` splits non-wall
// buckets into per-screen groups, this iterates `groups.values()` and
// filters by the underlying dim/client key rather than relying on a
// single dim-keyed lookup.
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
  const wantClientId = clientId ?? null;
  const matches: Screen[] = [];
  for (const group of groups.values()) {
    if (group.key.canvasWidth !== canvasWidth) continue;
    if (group.key.canvasHeight !== canvasHeight) continue;
    if ((group.key.clientId ?? null) !== wantClientId) continue;
    for (const s of group.screens) {
      if (excludeScreenId && s.id === excludeScreenId) continue;
      matches.push(s);
    }
  }
  return matches;
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

// Overlap-aware placement: caller supplies rectangles for every
// sibling (since the sibling's physical width comes from its display
// profile, which the helper module doesn't know about). Tries to
// place a new `screenWidth × screenHeight` box on the existing top
// row first (smallest non-overlapping X at the topmost row's Y), and
// if no slot fits within `canvasWidth`, drops to the next row flush
// against the existing bottom edge. The returned offset may still
// extend past the canvas — the UI surfaces that as a non-blocking
// warning rather than refusing the placement.
export function nextFreeOffsetForRects(
  siblingRects: Rect[],
  screenWidth: number,
  screenHeight: number,
  canvasWidth?: number,
): { x: number; y: number } {
  if (siblingRects.length === 0) return { x: 0, y: 0 };

  // Group siblings by Y so "rows" survive operators who eyeball the
  // layout and don't perfectly grid-align tiles.
  const tryRowAt = (rowY: number): number | null => {
    const rowRects = siblingRects.filter((r) => r.y < rowY + screenHeight && r.y + r.height > rowY);
    const candidates = new Set<number>([0]);
    for (const r of rowRects) candidates.add(r.x + r.width);
    const sorted = [...candidates].sort((a, b) => a - b);
    for (const x of sorted) {
      if (canvasWidth !== undefined && x + screenWidth > canvasWidth) continue;
      const candidate: Rect = { x, y: rowY, width: screenWidth, height: screenHeight };
      const overlaps = siblingRects.some((r) => rectIntersection(candidate, r) !== null);
      if (!overlaps) return x;
    }
    return null;
  };

  // Top row first.
  const topY = siblingRects.reduce((acc, r) => Math.min(acc, r.y), Infinity);
  const xOnTop = tryRowAt(topY === Infinity ? 0 : topY);
  if (xOnTop !== null) return { x: xOnTop, y: topY === Infinity ? 0 : topY };

  // Drop to a new row below the existing bottom edge.
  const bottom = siblingRects.reduce((acc, r) => Math.max(acc, r.y + r.height), 0);
  const xNextRow = tryRowAt(bottom);
  if (xNextRow !== null) return { x: xNextRow, y: bottom };

  // Last resort: flush against the rightmost sibling on the top row.
  // Caller may then warn about exceeding canvas.
  const rightmost = siblingRects.reduce((acc, r) => Math.max(acc, r.x + r.width), 0);
  return { x: rightmost, y: topY === Infinity ? 0 : topY };
}

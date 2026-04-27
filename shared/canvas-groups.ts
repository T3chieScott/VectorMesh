import type { Screen, CanvasGroup as CanvasGroupRow } from "@shared/schema";

// Task #189 — explicit canvas grouping. Replaces the implicit
// (clientId, canvasWidth, canvasHeight) + position-distinctness
// model that historically over-grouped multiple independent screens
// that just happened to share dims.
//
// Every canvas-enabled screen carries a `canvasGroupId` FK; screens
// in the same group are wall siblings. Lone canvas screens get
// their own per-screen group at create time, so the grouping rule
// reduces to "same `canvasGroupId`" with no further heuristics.
// Screens with `canvasEnabled=false` or with no `canvasGroupId`
// are excluded from grouping entirely.

export interface CanvasGroupView {
  // The persisted canvas_groups row, when known. The boot-time
  // backfill stamps every canvas-enabled screen with a group id, so
  // in practice this is always non-null on the running server. The
  // `Map` key is `groupId` so producers can resolve `groups.get(id)`.
  group?: CanvasGroupRow;
  groupId: string;
  screens: Screen[];
  // True iff this group represents a real video wall — i.e. it has
  // ≥ 2 member screens. Lone-screen groups (the default for a fresh
  // canvas-enabled screen) are NOT walls.
  isWall: boolean;
}

// Back-compat alias: existing callers import `CanvasGroup` from this
// module to mean "the grouped-view shape". The schema also defines
// a `CanvasGroup` (the row type); we re-export it under a different
// name so callers can opt in.
export type CanvasGroup = CanvasGroupView;
export type CanvasGroupRowType = CanvasGroupRow;

function isCanvasEnabledScreen(s: Screen): s is Screen & {
  canvasGroupId: string;
} {
  return (
    !!s.canvasEnabled &&
    typeof s.canvasGroupId === "string" &&
    s.canvasGroupId.length > 0
  );
}

// Group screens by their explicit `canvasGroupId`. The output Map
// key IS the canvas group id; each entry's `screens` is sorted by
// (createdAt asc, id asc) so consumers (owner-picker, sibling
// rendering, etc.) get a stable order across renders.
//
// `groupRows`, when supplied, is the persisted canvas_groups list
// (typically fetched once at the page level). We attach each
// group's row to the view so the UI can read its `name` without
// another lookup. When omitted (e.g. tests that pre-stamp
// `canvasGroupId` directly), the view's `group` field is undefined
// and the helper still works — only the displayed name is missing.
export function groupScreensByCanvas(
  screens: Screen[],
  groupRows?: CanvasGroupRow[],
): Map<string, CanvasGroupView> {
  const out = new Map<string, CanvasGroupView>();
  const rowsById = new Map<string, CanvasGroupRow>();
  if (groupRows) {
    for (const row of groupRows) rowsById.set(row.id, row);
  }
  for (const s of screens) {
    if (!isCanvasEnabledScreen(s)) continue;
    const id = s.canvasGroupId;
    let view = out.get(id);
    if (!view) {
      view = {
        group: rowsById.get(id),
        groupId: id,
        screens: [],
        isWall: false,
      };
      out.set(id, view);
    }
    view.screens.push(s);
  }
  // Sort + flag wall after all screens are bucketed.
  for (const view of out.values()) {
    view.screens.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });
    view.isWall = view.screens.length >= 2;
  }
  return out;
}

// Pick the canvas "owner" — the single tile that owns the pairing
// code for the entire wall (Task #173). Order is (createdAt asc,
// id asc) so it's stable across reloads even when timestamps tie.
// Use `pickCanvasPairingWinner` in server/storage.ts when you also
// want to bias toward the most-recently-paired member; this helper
// is the dumb sort-only version meant for read-only UI labels
// ("Inherits pairing from <owner>").
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
// pins the same predicates the JSX evaluates.
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
  // Task #179 — inheritance message tracks owner.isPaired so an
  // unpaired wall doesn't keep telling siblings "Inherits pairing
  // from <owner>" when there's no active pairing to inherit.
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

// True iff the group is an actual video wall (≥ 2 members). Lone
// per-screen groups are NOT walls.
export function isCanvasWallGroup(group: CanvasGroupView): boolean {
  return group.screens.length >= 2;
}

// Look up the screens that share `screen`'s canvas group, EXCLUDING
// `screen` itself. Returns [] when the screen is not canvas-enabled,
// when it has no `canvasGroupId`, or when it is the only member of
// its group (a lone per-screen group).
export function siblingsOnCanvas(
  screen: Pick<Screen, "id" | "canvasEnabled" | "canvasGroupId">,
  groups: Map<string, CanvasGroupView>,
): Screen[] {
  if (!screen.canvasEnabled) return [];
  const groupId = screen.canvasGroupId;
  if (typeof groupId !== "string" || groupId.length === 0) return [];
  const group = groups.get(groupId);
  if (!group) return [];
  return group.screens.filter((s) => s.id !== screen.id);
}

// Same as `siblingsOnCanvas` but for an in-progress edit form where
// the operator may have just changed the canvas group dropdown — we
// want to preview which screens would become wall siblings if they
// saved right now. Returns every screen in the target group except
// the one being edited. When `canvasGroupId` is null/empty (e.g.
// "no group selected yet") the result is [] — there is no implicit
// wall to preview.
export function siblingsForCanvasParams(
  params: {
    excludeScreenId?: string;
    canvasGroupId: string | null | undefined;
  },
  groups: Map<string, CanvasGroupView>,
): Screen[] {
  const { excludeScreenId, canvasGroupId } = params;
  if (typeof canvasGroupId !== "string" || canvasGroupId.length === 0) {
    return [];
  }
  const group = groups.get(canvasGroupId);
  if (!group) return [];
  return group.screens.filter((s) => !excludeScreenId || s.id !== excludeScreenId);
}

// ─── Geometry helpers (untouched by Task #189) ─────────────────────

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

export function nextFreeOffsetForRects(
  siblingRects: Rect[],
  screenWidth: number,
  screenHeight: number,
  canvasWidth?: number,
): { x: number; y: number } {
  if (siblingRects.length === 0) return { x: 0, y: 0 };

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

  const topY = siblingRects.reduce((acc, r) => Math.min(acc, r.y), Infinity);
  const xOnTop = tryRowAt(topY === Infinity ? 0 : topY);
  if (xOnTop !== null) return { x: xOnTop, y: topY === Infinity ? 0 : topY };

  const bottom = siblingRects.reduce((acc, r) => Math.max(acc, r.y + r.height), 0);
  const xNextRow = tryRowAt(bottom);
  if (xNextRow !== null) return { x: xNextRow, y: bottom };

  const rightmost = siblingRects.reduce((acc, r) => Math.max(acc, r.x + r.width), 0);
  return { x: rightmost, y: topY === Infinity ? 0 : topY };
}

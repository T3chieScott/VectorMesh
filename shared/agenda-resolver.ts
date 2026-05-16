// Pure filtering / sorting / current-vs-next logic for the Agenda
// Display Widget (Task #208). Shared between server (resolver
// endpoint can pre-filter) and client (live preview + display).
// Kept dependency-free so it runs in tests and the browser.

import type {
  AgendaItem,
  AgendaWidgetConfig,
  AgendaLayoutMode,
} from "./schema";

export interface AgendaResolveInput {
  items: AgendaItem[];
  config: Pick<
    AgendaWidgetConfig,
    | "displayMode"
    | "roomFilter"
    | "trackFilter"
    | "statusFilter"
    | "timeWindowMinutes"
  >;
  now: Date;
}

/**
 * Apply config filters to the agenda pool. Items returned are
 * already sorted by start time ascending. Past items that have
 * ended ≥ 15 minutes ago are dropped unless display mode is
 * "alert" (where the operator wants to keep visible cancellations
 * for a longer trailing window — 2h).
 */
export function resolveAgendaItems(input: AgendaResolveInput): AgendaItem[] {
  const { items, config, now } = input;
  const nowMs = now.getTime();
  const trailingMs =
    config.displayMode === "alert" ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000;

  const rooms = (config.roomFilter || []).map((r) => r.toLowerCase());
  const tracks = (config.trackFilter || []).map((t) => t.toLowerCase());
  const statuses = config.statusFilter || [];

  const windowMs =
    typeof config.timeWindowMinutes === "number" && config.timeWindowMinutes > 0
      ? config.timeWindowMinutes * 60 * 1000
      : null;

  let filtered = items.filter((it) => {
    const startMs = new Date(it.startsAt).getTime();
    const endMs = new Date(it.endsAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;

    // Drop fully-past items beyond the trailing window.
    if (endMs < nowMs - trailingMs) return false;

    if (rooms.length > 0) {
      if (!it.room || !rooms.includes(it.room.toLowerCase())) return false;
    }
    if (tracks.length > 0) {
      if (!it.track || !tracks.includes(it.track.toLowerCase())) return false;
    }
    if (statuses.length > 0) {
      if (!statuses.includes(it.status as any)) return false;
    }

    if (config.displayMode === "alert") {
      if (
        it.status !== "delayed" &&
        it.status !== "cancelled" &&
        it.status !== "moved"
      ) {
        return false;
      }
    }

    if (windowMs !== null) {
      // Show items that overlap the window OR start inside it.
      if (startMs > nowMs + windowMs) return false;
      if (endMs < nowMs - windowMs) return false;
    }

    return true;
  });

  // Sort by start asc, then by room, then by title for stable order.
  filtered.sort((a, b) => {
    const da = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    if (da !== 0) return da;
    const ra = (a.room || "").localeCompare(b.room || "");
    if (ra !== 0) return ra;
    return a.title.localeCompare(b.title);
  });

  return filtered;
}

/**
 * Find the currently-running item and the next upcoming item per
 * room. Used by display modes "now_next" and "room_focus" and by
 * the auto layout for narrow / totem displays.
 */
export function splitCurrentNext(
  items: AgendaItem[],
  now: Date,
): { current: AgendaItem[]; upcoming: AgendaItem[] } {
  const nowMs = now.getTime();
  const current: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];
  for (const it of items) {
    const startMs = new Date(it.startsAt).getTime();
    const endMs = new Date(it.endsAt).getTime();
    if (startMs <= nowMs && endMs > nowMs && it.status !== "cancelled") {
      current.push(it);
    } else if (startMs > nowMs) {
      upcoming.push(it);
    }
  }
  return { current, upcoming };
}

/**
 * Decide which layout variant to render. When the config layoutMode
 * is "auto" we pick based on container aspect ratio + display mode;
 * otherwise the operator's pick wins.
 */
export function pickAgendaLayout(
  configLayout: AgendaLayoutMode,
  containerWidth: number,
  containerHeight: number,
  displayMode: AgendaWidgetConfig["displayMode"],
): Exclude<AgendaLayoutMode, "auto"> {
  if (configLayout !== "auto") return configLayout;
  if (containerHeight <= 0 || containerWidth <= 0) return "landscape";
  const ratio = containerWidth / containerHeight;

  if (displayMode === "room_focus") return "room_door";
  if (displayMode === "now_next") {
    return ratio < 0.8 ? "totem" : "landscape";
  }
  if (ratio >= 3.0) return "ultrawide";
  if (ratio >= 1.4) return "landscape";
  if (ratio <= 0.7) return "portrait";
  return "landscape";
}

/**
 * Paginate items into pages of <= pageSize, for rotation through
 * the same display.
 */
export function paginate<T>(items: T[], pageSize: number): T[][] {
  if (pageSize <= 0) return items.length === 0 ? [] : [items];
  if (items.length === 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

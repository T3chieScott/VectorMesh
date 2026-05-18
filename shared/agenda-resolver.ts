// Pure filtering / sorting / current-vs-next logic for the Agenda
// Display Widget (Task #208). Shared between server (resolver
// endpoint can pre-filter) and client (live preview + display).
// Kept dependency-free so it runs in tests and the browser.

import type {
  AgendaItem,
  AgendaWidgetConfig,
  AgendaLayoutMode,
} from "./schema";
import { getWallPartsInTz } from "./timezone-utils";

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
  /**
   * IANA timezone used for tz-local calendar-day comparisons
   * (today_tomorrow mode). Defaults to the runtime tz when omitted,
   * which is fine for unit tests but should always be passed for
   * production resolves so today-vs-tomorrow honours the site tz.
   */
  tz?: string | null;
}

/**
 * yyyy-mm-dd key for the calendar day that `instant` falls on in `tz`.
 * Used by today_tomorrow mode and the widget header so both agree on
 * which day they're showing.
 */
export function tzCalendarDayKey(instant: Date, tz: string | null | undefined): string {
  if (tz) {
    const p = getWallPartsInTz(instant, tz);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }
  return `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, "0")}-${String(instant.getUTCDate()).padStart(2, "0")}`;
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

  // today_tomorrow mode (Task #240): show only items whose startsAt
  // falls on today's tz-local calendar day. Once today has nothing
  // left to show (no item ending after the trailing window cutoff),
  // auto-roll to tomorrow's items so the board never goes blank
  // overnight. The trailing-window drop above still applies in both
  // cases (so a "today" item that ended 30 min ago is gone exactly
  // like in full mode).
  if (input.config.displayMode === "today_tomorrow") {
    const todayKey = tzCalendarDayKey(now, input.tz);
    const todayItems = filtered.filter(
      (it) => tzCalendarDayKey(new Date(it.startsAt), input.tz) === todayKey,
    );
    const todayStillRelevant = todayItems.some(
      (it) => new Date(it.endsAt).getTime() > nowMs - trailingMs,
    );
    if (todayStillRelevant) return todayItems;
    // Auto-roll to *tomorrow's* tz-local calendar day once today is
    // exhausted (per spec). We deliberately do not jump further than
    // tomorrow — if tomorrow has no sessions the board stays empty
    // (operators should configure a fallback layout/playlist for that).
    // Tomorrow's key is computed by parsing todayKey (YYYY-MM-DD) and
    // incrementing the calendar day — DST-safe because we never do
    // hour arithmetic across the transition.
    const [ty, tm, td] = todayKey.split("-").map(Number);
    const t = new Date(Date.UTC(ty, tm - 1, td + 1));
    const tomorrowKey = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
    return filtered.filter(
      (it) => tzCalendarDayKey(new Date(it.startsAt), input.tz) === tomorrowKey,
    );
  }

  // now_next mode: keep only the currently-running session(s) and the
  // immediate next-up per room. Applied here (not just in the totem
  // layout) so landscape / portrait / ultrawide renders honour the
  // operator's display-mode choice too.
  if (input.config.displayMode === "now_next") {
    const { current, upcoming } = splitCurrentNext(filtered, now);
    const nextByRoom = new Map<string, AgendaItem>();
    for (const it of upcoming) {
      const key = (it.room || "__no_room__").toLowerCase();
      if (!nextByRoom.has(key)) nextByRoom.set(key, it);
    }
    const merged = [...current, ...Array.from(nextByRoom.values())];
    // Preserve start-asc order for the merged set.
    merged.sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    return merged;
  }

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

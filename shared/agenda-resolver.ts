// Pure filtering / sorting / current-vs-next logic for the Agenda
// Display Widget (Task #208). Shared between server (resolver
// endpoint can pre-filter) and client (live preview + display).
// Kept dependency-free so it runs in tests and the browser.

import type {
  AgendaItem,
  AgendaWidgetConfig,
  AgendaLayoutMode,
} from "./schema";
import { AGENDA_STATUSES } from "./schema";
import {
  agendaFilterValueKey,
  normalizeAgendaFilterValue,
  normalizeAgendaStatus,
} from "./agenda-filter-values";
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
    | "dayFilter"
    | "dayFilterDate"
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
 * Shift a YYYY-MM-DD calendar-day key by `delta` whole days, returning
 * another YYYY-MM-DD key. Pure calendar arithmetic done in UTC so it
 * is DST-safe (we never add/subtract hours across a transition). Used
 * by the manual day filter and the today_tomorrow auto-roll.
 */
export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Monday→Sunday range (inclusive) of the calendar week that contains
 * the given YYYY-MM-DD key. Returned as { start, end } day keys.
 * Lexicographic comparison of YYYY-MM-DD keys matches chronological
 * order, so callers can range-check with start <= key <= end.
 */
export function weekRangeForDayKey(key: string): { start: string; end: string } {
  const [y, m, d] = key.split("-").map(Number);
  // getUTCDay(): 0=Sun..6=Sat. Days since Monday = (dow + 6) % 7.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  const start = shiftDayKey(key, -mondayOffset);
  return { start, end: shiftDayKey(start, 6) };
}

/** Paginate without ever mixing timezone-local calendar days on one page. */
export function paginateAgendaItemsByLocalDay(
  items: readonly AgendaItem[],
  pageSize: number,
  tz?: string | null,
): AgendaItem[][] {
  const pages: AgendaItem[][] = [];
  const size = pageSize > 0 ? pageSize : Number.MAX_SAFE_INTEGER;
  let day = "";
  let group: AgendaItem[] = [];
  const flush = () => {
    for (let i = 0; i < group.length; i += size) pages.push(group.slice(i, i + size));
  };
  for (const item of items) {
    const nextDay = tzCalendarDayKey(new Date(item.startsAt), tz);
    if (group.length && nextDay !== day) {
      flush();
      group = [];
    }
    day = nextDay;
    group.push(item);
  }
  if (group.length) flush();
  return pages;
}

// Status precedence when merging duplicate session rows — a more
// "urgent"/active status on any participant row wins so a cancellation,
// move, delay, or live state is never hidden by collapsing the
// duplicates. Covers every value in AGENDA_STATUSES; anything unknown
// falls to 0 (below "scheduled") so a real status always wins.
const SESSION_STATUS_PRIORITY: Record<string, number> = {
  cancelled: 5,
  moved: 4,
  delayed: 3,
  in_progress: 2,
  scheduled: 1,
};

function agendaStatusKey(status: unknown): string | null {
  const normalized = normalizeAgendaStatus(status, AGENDA_STATUSES);
  return normalized && AGENDA_STATUSES.includes(normalized as (typeof AGENDA_STATUSES)[number])
    ? normalized
    : null;
}

function hasAgendaStatus(status: unknown, expected: string): boolean {
  return agendaStatusKey(status) === expected;
}

/** Identity for "the same session" used by dedupeAgendaSessions. */
function agendaSessionKey(it: AgendaItem): string {
  const start = new Date(it.startsAt).getTime();
  const end = new Date(it.endsAt).getTime();
  return [
    it.clientId,
    (it.title || "").trim().toLowerCase(),
    Number.isNaN(start) ? "?" : String(start),
    Number.isNaN(end) ? "?" : String(end),
    (it.room || "").trim().toLowerCase(),
  ].join("\u0000");
}

/**
 * Collapse rows that describe the same session into one entry.
 *
 * Some feeds (notably per-speaker spreadsheets) emit one row per
 * participant — every speaker / moderator / panellist of a session is
 * its own row sharing the same title, time and room. Rendered as-is
 * that shows the same session several times. We group by
 * (client, title, start, end, room) and merge the group into a single
 * item, combining the distinct presenter values so no speaker is lost.
 * Single-row sessions pass through untouched and original order is
 * preserved.
 */
export function dedupeAgendaSessions(items: AgendaItem[]): AgendaItem[] {
  const groups = new Map<string, AgendaItem[]>();
  const order: string[] = [];
  for (const it of items) {
    const key = agendaSessionKey(it);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      order.push(key);
    }
    group.push(it);
  }

  const firstNonEmpty = (
    group: AgendaItem[],
    sel: (i: AgendaItem) => string | null | undefined,
  ): string | null => {
    for (const it of group) {
      const v = (sel(it) || "").trim();
      if (v) return v;
    }
    return null;
  };

  const out: AgendaItem[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }

    // Base row carries the most urgent status; ties keep the first.
    let base = group[0];
    for (const it of group) {
        // Compare canonical built-ins, but retain the chosen source row
        // unchanged: custom statuses (including their readable spelling) are
        // payload data, not values for this resolver to coerce.
        const p = SESSION_STATUS_PRIORITY[agendaStatusKey(it.status) ?? ""] ?? 0;
        const bp = SESSION_STATUS_PRIORITY[agendaStatusKey(base.status) ?? ""] ?? 0;
      if (p > bp) base = it;
    }

    // Combine distinct presenters in first-seen order. Each speaker
    // (which may carry a trailing ", Company") goes on its own line so a
    // multi-speaker session lists everyone vertically and the display
    // card grows to fit. The widget renders this with whitespace-pre-line.
    const seen = new Set<string>();
    const presenters: string[] = [];
    for (const it of group) {
      const p = (it.presenter || "").trim();
      if (!p) continue;
      const dedupeKey = p.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      presenters.push(p);
    }

    out.push({
      ...base,
      presenter: presenters.length ? presenters.join("\n") : null,
      description: firstNonEmpty(group, (i) => i.description),
      track: firstNonEmpty(group, (i) => i.track),
      statusMessage: firstNonEmpty(group, (i) => i.statusMessage),
    });
  }
  return out;
}

/**
 * Apply config filters to the agenda pool. Items returned are
 * already sorted by start time ascending. Past items that have
 * ended ≥ 15 minutes ago are dropped unless display mode is
 * "alert" (where the operator wants to keep visible cancellations
 * for a longer trailing window — 2h).
 *
 * Per-speaker duplicate rows are collapsed up-front via
 * dedupeAgendaSessions so each session renders once.
 */
export function resolveAgendaItems(input: AgendaResolveInput): AgendaItem[] {
  const { config, now } = input;
  const items = dedupeAgendaSessions(input.items);
  const nowMs = now.getTime();
  const trailingMs =
    config.displayMode === "alert" ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000;

  const filterKeys = (values: readonly unknown[]) =>
    new Set(
      values.flatMap((value) => {
        const normalized = normalizeAgendaFilterValue(value);
        return normalized ? [agendaFilterValueKey(normalized)] : [];
      }),
    );
  const rooms = filterKeys(config.roomFilter || []);
  const tracks = filterKeys(config.trackFilter || []);
  const statuses = filterKeys(config.statusFilter || []);

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

    if (rooms.size > 0) {
      const room = normalizeAgendaFilterValue(it.room);
      if (!room || !rooms.has(agendaFilterValueKey(room))) return false;
    }
    if (tracks.size > 0) {
      const track = normalizeAgendaFilterValue(it.track);
      if (!track || !tracks.has(agendaFilterValueKey(track))) return false;
    }
    if (statuses.size > 0) {
      const status = normalizeAgendaFilterValue(it.status);
      if (!status || !statuses.has(agendaFilterValueKey(status))) return false;
    }

    if (config.displayMode === "alert") {
      if (
        !hasAgendaStatus(it.status, "delayed") &&
        !hasAgendaStatus(it.status, "cancelled") &&
        !hasAgendaStatus(it.status, "moved")
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

  // Day selection is deliberately last.  The candidate pool above has
  // already enforced every tenant-owned room/track/status/time facet, so a
  // roll-forward can never expose an unrelated session. Relative choices
  // select their intended local date when it has content and otherwise jump
  // to the date of the next future matching session. Specific dates are an
  // explicit instruction and therefore never roll.
  const dayFilter = config.displayMode === "today_tomorrow"
    ? "today"
    : config.dayFilter ?? "all";
  const todayKey = tzCalendarDayKey(now, input.tz);
  const dayKeyOf = (it: AgendaItem) =>
    tzCalendarDayKey(new Date(it.startsAt), input.tz);
  if (dayFilter === "this_week") {
    const { start, end } = weekRangeForDayKey(todayKey);
    filtered = filtered.filter((it) => {
      const key = dayKeyOf(it);
      return key >= start && key <= end;
    });
  } else {
    // "All" is genuinely all matching candidates.  In particular Full Agenda
    // owns pagination/day headings and must receive every local day rather
    // than a resolver-selected effective day.
    if (dayFilter === "all") {
      // no day reduction
    } else {
    const requestedDay =
      dayFilter === "tomorrow" ? shiftDayKey(todayKey, 1)
      : dayFilter === "specific_date" ? config.dayFilterDate ?? null
      : todayKey;
    // A partially edited legacy config may name the specific-date mode
    // without a date. Preserve the historical no-op until an actual date is
    // supplied; once supplied it is authoritative and never rolls.
    if (!requestedDay) return filtered;
    const onRequestedDay = filtered.filter((it) => dayKeyOf(it) === requestedDay);
    if (onRequestedDay.length || dayFilter === "specific_date") {
      filtered = onRequestedDay;
    } else {
      // Tomorrow's fallback must not jump backwards to a still-upcoming
      // session today: roll forward from the requested local day.
      const future = filtered.find((it) =>
        dayKeyOf(it) >= requestedDay && new Date(it.startsAt).getTime() >= nowMs,
      );
      filtered = future
        ? filtered.filter((it) => dayKeyOf(it) === dayKeyOf(future))
        : [];
    }
    }
  }

  // now_next mode: keep only the currently-running session(s) and the
  // immediate next-up per room. Applied here (not just in the totem
  // layout) so landscape / portrait / ultrawide renders honour the
  // operator's display-mode choice too.
  if (input.config.displayMode === "now_next") {
    const { current, upcoming } = splitCurrentNext(filtered, now);
    const nextByRoom = new Map<string, AgendaItem>();
    for (const it of upcoming) {
      const room = normalizeAgendaFilterValue(it.room);
      const key = room ? agendaFilterValueKey(room) : "__no_room__";
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
    if (startMs <= nowMs && endMs > nowMs && !hasAgendaStatus(it.status, "cancelled")) {
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

/**
 * Intelligent auto-fit pagination for variable-height agenda cards.
 *
 * Given each card's measured height (in source order), the height available
 * for cards, the number of columns, and the vertical gap between cards, pack
 * as many cards as fully fit per page so the last card on a page is never
 * cut off, without exceeding the authored maximum item count. Columns are
 * filled top-to-bottom, then left-to-right, then a new page starts.
 *
 * The fit test reserves a trailing gap after every card (`h + rowGap`) so the
 * computed height never under-counts the real CSS spacing (flex `gap` between
 * cards plus, in multi-column layouts, a bottom margin after each card). This
 * keeps the packer conservative — it would rather leave a sliver of slack
 * than clip a card.
 *
 * A single card taller than the whole column is placed alone (so we always
 * make progress) and accepts that it may be clipped — nothing can make an
 * oversized card fit.
 */
export function packAgendaPages<T>(
  items: T[],
  heights: number[],
  availableHeight: number,
  numCols: number,
  rowGap: number,
  maxItemsPerPage = Number.POSITIVE_INFINITY,
): T[][] {
  const n = items.length;
  if (n === 0) return [];
  const cols = Math.max(1, Math.floor(numCols));
  // Without a positive height budget we cannot fit anything sensibly — keep
  // everything on one page rather than producing an empty/garbage result.
  if (!(availableHeight > 0)) return [items.slice()];

  const out: T[][] = [];
  const pageLimit = Number.isFinite(maxItemsPerPage)
    ? Math.max(1, Math.floor(maxItemsPerPage))
    : Number.POSITIVE_INFINITY;
  let i = 0;
  while (i < n) {
    const page: T[] = [];
    for (let col = 0; col < cols && i < n && page.length < pageLimit; col++) {
      let colH = 0;
      while (i < n && page.length < pageLimit) {
        const h = heights[i] ?? 0;
        const slot = h + rowGap; // reserve trailing gap, never under-count
        if (colH + slot <= availableHeight) {
          page.push(items[i]);
          colH += slot;
          i++;
        } else {
          if (colH === 0) {
            // Oversized single card — show it alone, then move on.
            page.push(items[i]);
            i++;
          }
          break;
        }
      }
    }
    // Safety: never emit an empty page (would stall pagination).
    if (page.length === 0) {
      page.push(items[i]);
      i++;
    }
    out.push(page);
  }
  return out;
}

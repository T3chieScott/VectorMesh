import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  AgendaItem,
  AgendaWidgetConfig,
  AgendaStatus,
  AgendaDisplayMode,
  AgendaLayoutMode,
} from "@shared/schema";
import { resolveFontStack } from "@shared/fonts";
import {
  pickAgendaLayout,
  paginate,
  packAgendaPages,
  splitCurrentNext,
} from "@shared/agenda-resolver";

// Task #240 — long-form weekday / date formatters used by the optional
// "Show day name" / "Show date" header chunks. Reflects the *displayed*
// day, which equals the day of the first resolved item when present so
// the today_tomorrow auto-roll leaves header and body in agreement.
// When the caller doesn't pass a tz (orphan client / preview without
// site context), fall back to UTC so header day/date stays consistent
// with the resolver's tzCalendarDayKey() bucketing — otherwise the
// header would show the browser's local day while the body shows the
// UTC day, splitting the today_tomorrow auto-roll across two calendars.
function formatWeekday(d: Date, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    timeZone: tz || "UTC",
  }).format(d);
}
function formatLongDate(d: Date, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz || "UTC",
  }).format(d);
}

// Compact per-card date (e.g. "Fri 12 Sep") shown beside each session's
// time when the resolved agenda spans more than one calendar day, so a
// chronological list that crosses midnight (e.g. day-1 16:30 above
// day-2 10:30) reads correctly instead of looking out of order.
function formatShortDate(
  iso: Date | string,
  tz: string | null | undefined,
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  // Fall back to UTC (not browser-local) to stay consistent with
  // tzDayKey()'s multi-day detection — otherwise, with no tz, the
  // day-splitting decision and the displayed date could disagree.
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz || "UTC",
  }).format(d);
}

// Stable per-day key in the display timezone, used to detect whether the
// agenda spans multiple calendar days.
function tzDayKey(iso: Date | string, tz: string | null | undefined): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz || "UTC",
  }).format(d);
}

// Resolved role colours, with `undefined` meaning "fall back to the
// theme default" so existing configs render identically. Threaded
// through every layout / row component so a single source of truth
// drives both the live admin preview and the player.
interface RoleColors {
  title?: string;
  body?: string;
  time?: string;
  status?: string;
}

function resolveRoleColors(config: AgendaWidgetConfig): RoleColors {
  return {
    title: config.titleColor ?? undefined,
    body: config.bodyColor ?? undefined,
    time: config.timeColor ?? undefined,
    status: config.statusColor ?? undefined,
  };
}

function resolveFontStackForConfig(config: AgendaWidgetConfig): string {
  // Task #281: fontFamily is now a shared font key (built-in or
  // `custom:<id>`). The shared resolver falls back to the default stack
  // for null/empty/legacy values, so existing configs render unchanged.
  return resolveFontStack(config.fontFamily);
}

// Style for the time/clock text. The time elements carry a `font-mono`
// class for digit alignment, which would otherwise override the chosen
// font. When the operator explicitly picks a font, fold it into the
// inline style (which beats the class) and keep digits aligned via
// tabular-nums. When no font is chosen we return only the colour, so
// existing displays keep their monospace times unchanged.
function timeRoleStyle(
  config: AgendaWidgetConfig,
  color?: string,
): React.CSSProperties {
  return {
    ...(color ? { color } : {}),
    ...(config.fontFamily
      ? {
          fontFamily: resolveFontStackForConfig(config),
          fontVariantNumeric: "tabular-nums",
        }
      : {}),
  };
}

// Single reusable widget for both the live admin preview and the
// public chromeless /display/agenda/:configId page. Caller passes
// the config + resolved items; widget handles layout selection,
// pagination/rotation and ticking the clock.

export interface AgendaDisplayWidgetProps {
  config: AgendaWidgetConfig;
  items: AgendaItem[];
  // Optional outer dims (px). When omitted, the widget measures its
  // own container with ResizeObserver. The admin preview passes
  // explicit dims so it can simulate target screen sizes.
  width?: number;
  height?: number;
  timezone?: string | null;
  now?: Date;
}

const STATUS_LABELS: Record<AgendaStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "Live now",
  delayed: "Delayed",
  cancelled: "Cancelled",
  moved: "Moved",
};

// Per-status background tint + border. Text colour is intentionally
// left to inherit `currentColor` so the label stays readable on BOTH
// the dark theme (light text) and the light theme (dark text) — the
// old baked-in light text (text-*-100) vanished on a white background.
const STATUS_COLOR: Record<AgendaStatus, string> = {
  scheduled: "bg-slate-500/20 border-slate-400/50",
  in_progress: "bg-emerald-500/25 border-emerald-500/60 animate-pulse",
  delayed: "bg-amber-500/25 border-amber-500/60",
  cancelled: "bg-rose-600/25 border-rose-500/60",
  moved: "bg-indigo-500/25 border-indigo-500/60",
};

// Task #234 — container-relative scaling. Tables are *multipliers*
// of the container's min dimension, calibrated so a 1920×1080 container
// at fontScale="normal" / density="normal" produces exactly the legacy
// 18 px font / 12 px gap (since min(1920,1080) === 1080, and
// 18/1080 ≈ 0.01667, 12/1080 ≈ 0.01111). Inside layout zones the
// container is the zone (commonly far smaller than a full screen), so
// the agenda now scales down/up to match its host instead of always
// rendering 18 px text regardless of container size.
export const AGENDA_FONT_SCALE_RATIO = {
  small: 13 / 1080,
  normal: 18 / 1080,
  large: 26 / 1080,
  xlarge: 36 / 1080,
} as const;

export const AGENDA_DENSITY_GAP_RATIO = {
  compact: 6 / 1080,
  normal: 12 / 1080,
  spacious: 20 / 1080,
} as const;

// Built-in per-role text-size multipliers (relative to the responsive base
// `scale`). These are the historical hard-coded values; a config may override
// any of them (config.timeScale / dateScale / titleScale / bodyScale). When an
// override is null the renderer falls back to the matching default here, so
// untouched displays look exactly as before. The standard card layout sizes the
// primary element of each role at `scale * multiplier`; secondary elements
// (e.g. end time, description) stay proportional to the primary.
export const AGENDA_ROLE_SIZE_DEFAULTS = {
  time: 1.15,
  date: 0.6,
  title: 1.15,
  body: 0.75,
  // Header-corner elements (top-right day/date line + clock). These are
  // independent of the per-session card roles above and default to the
  // header's historical fixed sizes so untouched displays look identical.
  headerDate: 0.9,
  headerClock: 1.3,
} as const;

// Resolve the role multipliers for a config, applying built-in fallbacks.
export function resolveAgendaRoleSizes(config: {
  timeScale?: number | null;
  dateScale?: number | null;
  titleScale?: number | null;
  bodyScale?: number | null;
  headerDateScale?: number | null;
  headerClockScale?: number | null;
}) {
  return {
    time: config.timeScale ?? AGENDA_ROLE_SIZE_DEFAULTS.time,
    date: config.dateScale ?? AGENDA_ROLE_SIZE_DEFAULTS.date,
    title: config.titleScale ?? AGENDA_ROLE_SIZE_DEFAULTS.title,
    body: config.bodyScale ?? AGENDA_ROLE_SIZE_DEFAULTS.body,
    headerDate: config.headerDateScale ?? AGENDA_ROLE_SIZE_DEFAULTS.headerDate,
    headerClock: config.headerClockScale ?? AGENDA_ROLE_SIZE_DEFAULTS.headerClock,
  };
}

// Floors keep the agenda legible inside tiny zone thumbnails / pickers
// where min(w,h) might be ~80 px. Without these, text would collapse
// to sub-pixel values and become invisible.
const MIN_SCALE_PX = 6;
const MIN_GAP_PX = 2;

export function resolveAgendaFontPx(
  fontScale: string | null | undefined,
  containerWidth: number,
  containerHeight: number,
): number {
  const ratio = AGENDA_FONT_SCALE_RATIO[
    (fontScale as keyof typeof AGENDA_FONT_SCALE_RATIO) || "normal"
  ] ?? AGENDA_FONT_SCALE_RATIO.normal;
  const base = Math.min(
    containerWidth > 0 ? containerWidth : 1080,
    containerHeight > 0 ? containerHeight : 1080,
  );
  return Math.max(MIN_SCALE_PX, base * ratio);
}

export function resolveAgendaGapPx(
  density: string | null | undefined,
  containerWidth: number,
  containerHeight: number,
): number {
  const ratio = AGENDA_DENSITY_GAP_RATIO[
    (density as keyof typeof AGENDA_DENSITY_GAP_RATIO) || "normal"
  ] ?? AGENDA_DENSITY_GAP_RATIO.normal;
  const base = Math.min(
    containerWidth > 0 ? containerWidth : 1080,
    containerHeight > 0 ? containerHeight : 1080,
  );
  return Math.max(MIN_GAP_PX, base * ratio);
}

function formatTime(iso: Date | string, tz: string | null | undefined): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz || undefined,
  }).format(d);
}

function formatNow(tz: string | null | undefined, now: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz || undefined,
  }).format(now);
}

function StatusBadge({
  status,
  scale,
  override,
}: {
  status: AgendaStatus;
  scale: number;
  override?: string;
}) {
  // statusColor overrides only the foreground text — the per-status
  // background tint stays so "live now" still reads green-ish etc.
  const style: React.CSSProperties = { fontSize: scale * 0.6 };
  if (override) style.color = override;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-semibold uppercase tracking-wide ${STATUS_COLOR[status]}`}
      style={style}
      data-testid={`agenda-status-${status}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Task #376 — resolve inline CSS for description line clamping.
 *
 * Three distinct behaviours:
 *   undefined  → 2-line clamp (renderer default; matches pre-#376 behaviour)
 *   number 1-10 → clamp to N lines
 *   null        → Full (no clamp — remove every clamp property)
 *
 * We use inline WebkitLineClamp styles rather than dynamic Tailwind class
 * names (e.g. computed strings like "line-clamp-N") because production
 * Tailwind only includes classes it can statically detect; interpolated
 * or concatenated names are purged at build time.
 */
function resolveDescriptionClamp(
  lines: number | null | undefined,
): React.CSSProperties {
  // undefined = missing/legacy → fall back to the old two-line default
  const n = lines === undefined ? 2 : lines;
  if (n === null) {
    // Full: no clamp properties at all — description wraps naturally
    return {};
  }
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: n,
    overflow: "hidden",
  };
}

// ---- Task #382 — auto-scroll constants & helper -------------------------

/** Pause at the top of the card before scrolling begins (ms). */
export const TOP_PAUSE_MS = 3_000;
/** Pause at the bottom after scrolling completes (ms). */
export const BOTTOM_PAUSE_MS = 3_000;
/** Scroll speed (pixels per second). */
export const SCROLL_PX_PER_SEC = 28;
/**
 * Row gap (px) matching the CSS gap-3 used by PortraitCards so the
 * per-card height allocation formula in AgendaRow is accurate.
 */
const SCROLL_ROW_GAP = 12;

/**
 * How many milliseconds the CSS translateY transition should last for a
 * given overflow amount at the configured scroll speed (linear easing).
 * Exported so the parent widget can compute effective dwell times and
 * tests can verify timing without touching the DOM.
 */
export function descScrollDurationMs(overflowPx: number): number {
  if (overflowPx <= 0) return 0;
  return Math.ceil((overflowPx / SCROLL_PX_PER_SEC) * 1_000);
}

// -------------------------------------------------------------------------

function isCurrentlyRunning(item: AgendaItem, now: Date): boolean {
  const start = new Date(item.startsAt).getTime();
  const end = new Date(item.endsAt).getTime();
  const t = now.getTime();
  return start <= t && t < end && item.status !== "cancelled";
}

function AgendaRow({
  item,
  config,
  tz,
  scale,
  isCurrent,
  accentColor,
  roleColors,
  showCardDate,
  suppressTestId,
  pageH,
  pageItemCount,
  onScrollOverflow,
  scrollResetTick,
}: {
  item: AgendaItem;
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  isCurrent?: boolean;
  accentColor?: string;
  roleColors?: RoleColors;
  showCardDate?: boolean;
  // The off-screen pagination measurer renders a hidden copy of every
  // row. Those copies must NOT carry data-testid, or the visible row and
  // its measurer twin both match `agenda-row-<id>` and break Playwright's
  // strict-mode locators.
  suppressTestId?: boolean;
  // Task #382 — auto-scroll coordination. Only set when
  // descriptionAutoScroll is active on the parent widget.
  pageH?: number;
  pageItemCount?: number;
  onScrollOverflow?: (id: string, px: number) => void;
  scrollResetTick?: number;
}) {
  const timeStyle = timeRoleStyle(config, roleColors?.time);
  const bodyStyle = roleColors?.body ? { color: roleColors.body } : undefined;
  // Per-role size multipliers (config overrides → built-in defaults). The
  // secondary elements stay proportional to their role's primary so the
  // start/end-time relationship and description sizing are preserved.
  const roleSizes = resolveAgendaRoleSizes(config);
  const endTimeMult = roleSizes.time * (0.75 / AGENDA_ROLE_SIZE_DEFAULTS.time);
  const descMult = roleSizes.body * (0.8 / AGENDA_ROLE_SIZE_DEFAULTS.body);
  // When the operator picks "now_next" mode, the currently-running
  // session is rendered with a strong accent ring + brighter bg in
  // every layout, so audiences can tell at a glance which session
  // is happening now without reading the timestamp.
  // Card chrome reads theme-aware CSS variables set on the widget root
  // so it renders on both dark and light themes. A slim accent stripe on
  // the left edge ties each card to the header accent bar; the currently
  // running session gets a thicker accent, brighter fill and a soft glow.
  const cardStyle: React.CSSProperties = {
    background: isCurrent ? "var(--ag-card-bg-current)" : "var(--ag-card-bg)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--ag-border)",
    borderLeftWidth: isCurrent ? 4 : 3,
    borderLeftColor: accentColor || "var(--ag-border)",
    boxShadow: isCurrent ? "var(--ag-glow)" : undefined,
  };
  // Off-screen measurer twins must not carry ANY data-testid, or both the
  // visible row and its hidden twin match the same selector and break
  // Playwright's strict-mode locators (agenda-row, agenda-title, …).
  const tid = (id: string) => (suppressTestId ? undefined : id);

  // ---- Task #382 — auto-scroll per-description -------------------------
  // Active only when: feature flag on, descriptionLines is null (Full mode),
  // there is description text, and this is NOT an off-screen measurer copy
  // (suppressTestId identifies measurer twins; they must NOT animate).
  const scrollEnabled =
    !suppressTestId &&
    Boolean(config.descriptionAutoScroll) &&
    config.descriptionLines === null &&
    Boolean(item.description);

  // Task #382 — DOM refs for the description scroll viewport and inner text.
  // descViewportRef: the clipping outer div (flex:1 within the body column);
  //   clientHeight is the bounded space available for the description text.
  // descInnerRef: the <p> element whose scrollHeight is the full text height
  //   regardless of any ancestor overflow:hidden.
  const descViewportRef = useRef<HTMLDivElement | null>(null);
  const descInnerRef = useRef<HTMLParagraphElement | null>(null);

  const [overflowPx, setOverflowPx] = useState(0);

  // CSS transform state for the scrolling animation.
  const [translateY, setTranslateY] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);

  // Portrait: explicit pixel height = equal share of the page, accounting
  // for inter-card row gaps. Passes as an inline style so the body flex
  // column has a concrete height to fill.
  // Landscape/ultrawide: the parent BoundedScrollGrid places each card in a
  // CSS grid cell sized to minmax(0, 1fr). The card uses height:100% to fill
  // the cell; no allocatedH is needed from JS. null signals "use CSS".
  const allocatedH =
    scrollEnabled && pageH != null && pageItemCount != null
      ? Math.max(0, (pageH - (pageItemCount - 1) * SCROLL_ROW_GAP) / pageItemCount)
      : null;

  // ---- Stable measurement ref ------------------------------------------
  // Written every render so ResizeObserver and useLayoutEffect always call
  // the freshest version without stale-closure issues.
  const doMeasureRef = useRef<() => void>(() => {});
  doMeasureRef.current = () => {
    const viewport = descViewportRef.current;
    const inner = descInnerRef.current;
    // viewport.clientHeight is the bounded space. Only measure once the CSS
    // has settled (clientHeight > 0). Both values are read from separate
    // elements so neither is affected by overflow:hidden on an ancestor.
    if (!viewport || !inner || viewport.clientHeight <= 0) return;
    const oPx = Math.max(0, inner.scrollHeight - viewport.clientHeight);
    setOverflowPx((prev) => (prev === oPx ? prev : oPx));
    onScrollOverflow?.(item.id, oPx);
  };

  // ---- Viewport height measurement (before paint) ----------------------
  // Runs before paint whenever scroll inputs change. allocatedH is in deps
  // so portrait re-measures when the page height changes (new page, resize).
  // Landscape/ultrawide: allocatedH stays null — the ResizeObserver below
  // fires after the CSS grid has allocated row heights and triggers the
  // real measurement.
  useLayoutEffect(() => {
    if (!scrollEnabled) {
      setOverflowPx(0);
      return;
    }
    doMeasureRef.current();
  // onScrollOverflow intentionally omitted — captured via doMeasureRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEnabled, allocatedH, item.id, item.description]);

  // ---- ResizeObserver — post-layout remeasurement ----------------------
  // Fires after the CSS grid or flex container has finished allocating row
  // heights (window resize, zoom, font load, initial grid render for
  // landscape/ultrawide). Complements the useLayoutEffect above which only
  // runs synchronously during React's commit phase.
  useEffect(() => {
    if (!scrollEnabled) return;
    const viewport = descViewportRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(() => doMeasureRef.current());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [scrollEnabled]);

  // ---- Scroll state machine (top-pause → scroll → bottom-pause) --------
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clear = () => { timers.forEach(clearTimeout); };

    // Reset position — handles page-change and scrollResetTick cases.
    setTranslateY(0);
    setTransitionMs(0);

    if (!scrollEnabled || overflowPx <= 0) return clear;
    // Honour prefers-reduced-motion with a live matchMedia read so the
    // reduced-motion preference takes effect immediately without a
    // re-render cycle.
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return clear;
    }

    const scrollDuration = descScrollDurationMs(overflowPx);

    // Phase 1: top-pause — card stays at translateY(0) for TOP_PAUSE_MS.
    const t1 = setTimeout(() => {
      // Phase 2: scrolling — CSS transition drives the movement.
      setTransitionMs(scrollDuration);
      setTranslateY(overflowPx);

      // Phase 3: bottom-pause — no visual change; the parent's rotation
      // timer has already incorporated the total cycle time via
      // effectiveDwellMs and will advance the page at the right moment.
      const t2 = setTimeout(() => {
        setTransitionMs(0); // Disable transition so the next reset is instant
      }, scrollDuration);
      timers.push(t2);
    }, TOP_PAUSE_MS);
    timers.push(t1);

    return clear;
  }, [overflowPx, scrollEnabled, scrollResetTick]);
  // ---- End Task #382 ---------------------------------------------------

  return (
    <div
      // Task #382 — when scrollEnabled the card is sized so the flex body
      // column has a concrete height and the description viewport (flex:1
      // min-h-0) expands into the remaining space.
      //
      // Portrait: explicit pixel height = allocatedH (equal share of pageH).
      // Landscape/ultrawide: the CSS grid cell is bounded by minmax(0,1fr);
      //   height:100% fills the cell. minHeight:0 lets flex honour the bound
      //   even when description text is taller.
      className={`flex gap-4 rounded-lg px-4 py-3${scrollEnabled ? " items-stretch min-h-0" : " items-start"}`}
      style={{
        ...cardStyle,
        ...(scrollEnabled
          ? (allocatedH !== null
              ? { height: allocatedH, minHeight: 0 }   // portrait
              : { height: "100%", minHeight: 0 })       // landscape/ultrawide (CSS grid cell)
          : {}),
      }}
      data-testid={tid(`agenda-row-${item.id}`)}
      data-current={isCurrent ? "true" : undefined}
    >
      <div
        className="flex flex-col items-center pr-4"
        style={{ minWidth: scale * 4, borderRight: "1px solid var(--ag-divider)" }}
      >
        <span
          className="font-mono font-bold"
          style={{ fontSize: scale * roleSizes.time, ...timeStyle }}
          data-testid={tid(`agenda-time-start-${item.id}`)}
        >
          {formatTime(item.startsAt, tz)}
        </span>
        <span
          className="font-mono opacity-60"
          style={{ fontSize: scale * endTimeMult, ...timeStyle }}
          data-testid={tid(`agenda-time-end-${item.id}`)}
        >
          {formatTime(item.endsAt, tz)}
        </span>
        {showCardDate && (
          <span
            className="mt-1 text-center leading-tight opacity-70"
            style={{ fontSize: scale * roleSizes.date, ...timeStyle }}
            data-testid={tid(`agenda-card-date-${item.id}`)}
          >
            {formatShortDate(item.startsAt, tz)}
          </span>
        )}
      </div>
      {/* Task #382 — body column becomes flex-col when scrollEnabled so the
          description viewport (flex:1 below) fills whatever vertical space
          remains after the title, meta and status rows. shrink-0 on the
          static rows prevents them from being squeezed by the viewport. */}
      <div className={`flex-1 min-w-0${scrollEnabled ? " flex flex-col min-h-0" : ""}`}>
        <div className={`flex items-center gap-2 flex-wrap${scrollEnabled ? " shrink-0" : ""}`}>
          <h3
            className="font-semibold leading-tight break-words"
            style={{ fontSize: scale * roleSizes.title, ...bodyStyle }}
            data-testid={tid(`agenda-title-${item.id}`)}
          >
            {item.title}
          </h3>
          {config.showStatus && (
            <StatusBadge
              status={item.status as AgendaStatus}
              scale={scale}
              override={roleColors?.status}
            />
          )}
        </div>
        {(config.showRoom && item.room) || item.track || (config.showPresenter && item.presenter) ? (
          <div
            className={`mt-1 flex flex-col gap-1 opacity-80${scrollEnabled ? " shrink-0" : ""}`}
            style={{ fontSize: scale * roleSizes.body, ...bodyStyle }}
          >
            {((config.showRoom && item.room) || item.track) && (
              <div className="flex flex-wrap gap-3">
                {config.showRoom && item.room && (
                  <span data-testid={tid(`agenda-room-${item.id}`)}>📍 {item.room}</span>
                )}
                {item.track && <span>🏷 {item.track}</span>}
              </div>
            )}
            {config.showPresenter && item.presenter && (
              <span className="whitespace-pre-line" data-testid={tid(`agenda-presenter-${item.id}`)}>🎤 {item.presenter}</span>
            )}
          </div>
        ) : null}
        {config.showDescription && item.description && (
          scrollEnabled ? (
            // Task #382 — description viewport: flex:1 fills all remaining
            // body-column height after title/meta/status (which are shrink-0).
            // min-h-0 lets the flex child honour a smaller allocation;
            // overflow:hidden clips text that extends beyond the viewport.
            // The inner <p> retains its natural height (scrollHeight) so we
            // can measure true overflow independently of clipping.
            <div
              ref={descViewportRef}
              className="mt-1 flex-1 min-h-0 overflow-hidden"
            >
              <p
                ref={descInnerRef}
                className="opacity-75"
                style={{
                  fontSize: scale * descMult,
                  ...bodyStyle,
                  transform: `translateY(-${translateY}px)`,
                  transition:
                    transitionMs > 0
                      ? `transform ${transitionMs}ms linear`
                      : "none",
                  willChange: translateY > 0 ? "transform" : "auto",
                }}
                data-testid={tid(`agenda-description-${item.id}`)}
              >
                {item.description}
              </p>
            </div>
          ) : (
            <p
              className="mt-1 opacity-75"
              style={{ fontSize: scale * descMult, ...bodyStyle, ...resolveDescriptionClamp(config.descriptionLines) }}
              data-testid={tid(`agenda-description-${item.id}`)}
            >
              {item.description}
            </p>
          )
        )}
        {item.statusMessage && item.status !== "scheduled" && (
          <p
            className={`mt-1 italic opacity-90${scrollEnabled ? " shrink-0" : ""}`}
            style={{ fontSize: scale * roleSizes.body, ...bodyStyle }}
            data-testid={tid(`agenda-status-msg-${item.id}`)}
          >
            {item.statusMessage}
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Layout components -------------------------------------------------

interface RowGridProps {
  pageItems: AgendaItem[];
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  now: Date;
  highlightCurrent: boolean;
  roleColors: RoleColors;
  showCardDate?: boolean;
  // Task #382 — auto-scroll coordination. Passed only when
  // descriptionAutoScroll is active in the parent widget.
  scrollPageH?: number;
  scrollItemCount?: number;
  onScrollOverflow?: (id: string, px: number) => void;
  scrollResetTick?: number;
  // Column count for BoundedScrollGrid (landscape=2, ultrawide=3|4).
  // UltraWideGrid reads this from the parent because the value depends on
  // the measured container width (≥1280px → 4, else → 3).
  numCols?: number;
}

// Multi-column non-scroll layout uses CSS columns so sessions flow DOWN each
// column first (chronological order within a column). break-inside-avoid
// keeps each card whole. Cards size to their own content here.
// When descriptionAutoScroll is active, LandscapeGrid/UltraWideGrid route to
// BoundedScrollGrid instead so card heights are grid-bounded.
function ColumnFlow({
  pageItems,
  config,
  tz,
  scale,
  now,
  highlightCurrent,
  roleColors,
  showCardDate,
  scrollPageH,
  scrollItemCount,
  onScrollOverflow,
  scrollResetTick,
  columnsClass,
}: RowGridProps & { columnsClass: string }) {
  return (
    <div className={`flex-1 overflow-hidden ${columnsClass}`} style={{ columnGap: "0.75rem" }}>
      {pageItems.map((it) => (
        <div key={it.id} className="break-inside-avoid mb-3">
          <AgendaRow
            item={it}
            config={config}
            tz={tz}
            scale={scale}
            isCurrent={highlightCurrent && isCurrentlyRunning(it, now)}
            accentColor={config.accentColor}
            roleColors={roleColors}
            showCardDate={showCardDate}
            pageH={scrollPageH}
            pageItemCount={scrollItemCount}
            onScrollOverflow={onScrollOverflow}
            scrollResetTick={scrollResetTick}
          />
        </div>
      ))}
    </div>
  );
}

// Task #382 — bounded CSS grid for landscape/ultrawide description auto-scroll.
//
// CSS columns (used in the non-scroll path) don't create bounded row
// containers: flex:1/min-h-0 inside a CSS column block can't fill a bounded
// height, and height:allocatedH on the card is unreliable because the column
// itself grows with content. As a result viewport.clientHeight tracks content
// height, making overflowPx always 0 and the scroll never triggers.
//
// The fix: use a CSS grid with minmax(0, 1fr) rows so each row is a true
// bounded container. The card fills it with height:100% (tracked in AgendaRow
// when allocatedH is null). The description viewport (flex:1 min-h-0) then
// fills the remaining space after title/meta/status, and viewport.clientHeight
// is the final bounded value that the overflow formula reads.
//
// Column-major flow (grid-auto-flow: column) preserves chronological order
// within each column, matching the original CSS columns appearance.
function BoundedScrollGrid({
  pageItems,
  numCols,
  config,
  tz,
  scale,
  now,
  highlightCurrent,
  roleColors,
  showCardDate,
  onScrollOverflow,
  scrollResetTick,
}: RowGridProps) {
  const cols = numCols ?? 2;
  const numRows = Math.ceil(pageItems.length / cols);
  return (
    <div
      className="flex-1 min-h-0"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        // Each row is bounded: minmax(0,1fr) prevents rows from growing
        // beyond their fair share of the available height.
        gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))`,
        gap: SCROLL_ROW_GAP,
        // Fill columns first so sessions read chronologically top-to-bottom
        // within each column, consistent with the CSS columns non-scroll layout.
        gridAutoFlow: "column",
      }}
    >
      {pageItems.map((it) => (
        // AgendaRow receives no pageH/pageItemCount here — the grid cell
        // provides the bound via height:100% on the card (allocatedH===null
        // path in AgendaRow). onScrollOverflow still fires so the parent
        // dwell timer extends to cover the full scroll cycle.
        <AgendaRow
          key={it.id}
          item={it}
          config={config}
          tz={tz}
          scale={scale}
          isCurrent={highlightCurrent && isCurrentlyRunning(it, now)}
          accentColor={config.accentColor}
          roleColors={roleColors}
          showCardDate={showCardDate}
          onScrollOverflow={onScrollOverflow}
          scrollResetTick={scrollResetTick}
        />
      ))}
    </div>
  );
}

function LandscapeGrid(props: RowGridProps) {
  // Use bounded CSS grid when auto-scroll is active; CSS columns otherwise.
  return props.scrollPageH != null
    ? <BoundedScrollGrid {...props} numCols={2} />
    : <ColumnFlow {...props} columnsClass="columns-2" />;
}

function PortraitCards({ pageItems, config, tz, scale, now, highlightCurrent, roleColors, showCardDate, scrollPageH, scrollItemCount, onScrollOverflow, scrollResetTick }: RowGridProps) {
  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {pageItems.map((it) => (
        <AgendaRow
          key={it.id}
          item={it}
          config={config}
          tz={tz}
          scale={scale}
          isCurrent={highlightCurrent && isCurrentlyRunning(it, now)}
          accentColor={config.accentColor}
          roleColors={roleColors}
          showCardDate={showCardDate}
          pageH={scrollPageH}
          pageItemCount={scrollItemCount}
          onScrollOverflow={onScrollOverflow}
          scrollResetTick={scrollResetTick}
        />
      ))}
    </div>
  );
}

function UltraWideGrid(props: RowGridProps) {
  // Use bounded CSS grid when auto-scroll is active; CSS columns otherwise.
  return props.scrollPageH != null
    ? <BoundedScrollGrid {...props} />
    : <ColumnFlow {...props} columnsClass="columns-3 xl:columns-4" />;
}

function TotemNowNext({
  items,
  config,
  tz,
  scale,
  now,
  roleColors,
  showCardDate,
}: {
  items: AgendaItem[];
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  now: Date;
  roleColors: RoleColors;
  showCardDate?: boolean;
}) {
  const { current, upcoming } = splitCurrentNext(items, now);
  const cur = current[0];
  const next = upcoming.slice(0, 4);
  const titleStyle = roleColors.title ? { color: roleColors.title } : undefined;
  const bodyStyle = roleColors.body ? { color: roleColors.body } : undefined;
  return (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden">
      <section>
        <h2
          className="font-semibold opacity-70 uppercase tracking-wider mb-2"
          style={{ fontSize: scale * 0.8, ...titleStyle }}
        >
          Now
        </h2>
        {cur ? (
          <AgendaRow item={cur} config={config} tz={tz} scale={scale * 1.3} roleColors={roleColors} showCardDate={showCardDate} />
        ) : (
          <p className="opacity-60" style={{ fontSize: scale, ...bodyStyle }}>
            No session in progress.
          </p>
        )}
      </section>
      <section className="flex-1 overflow-hidden">
        <h2
          className="font-semibold opacity-70 uppercase tracking-wider mb-2"
          style={{ fontSize: scale * 0.8, ...titleStyle }}
        >
          Next
        </h2>
        <div className="flex flex-col gap-2">
          {next.length === 0 && (
            <p className="opacity-60" style={{ fontSize: scale, ...bodyStyle }}>
              Nothing else scheduled.
            </p>
          )}
          {next.map((it) => (
            <AgendaRow key={it.id} item={it} config={config} tz={tz} scale={scale} roleColors={roleColors} showCardDate={showCardDate} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RoomDoor({
  items,
  config,
  tz,
  scale,
  now,
  roleColors,
  showCardDate,
}: {
  items: AgendaItem[];
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  now: Date;
  roleColors: RoleColors;
  showCardDate?: boolean;
}) {
  const { current, upcoming } = splitCurrentNext(items, now);
  const cur = current[0];
  const next = upcoming[0];
  const roomName = cur?.room || next?.room || config.roomFilter?.[0] || "Room";
  const titleStyle = roleColors.title ? { color: roleColors.title } : undefined;
  const bodyStyle = roleColors.body ? { color: roleColors.body } : undefined;
  const timeStyle = timeRoleStyle(config, roleColors.time);
  // RoomDoor uses its own (much larger) typography than the card layout, so
  // the per-role overrides are applied here as factors relative to each role's
  // default. A config left at the defaults yields factor 1 → identical door
  // sign; raising a role's size scales the door element by the same ratio.
  // The day/date sits inside the time line, so it follows the time factor.
  const roleSizes = resolveAgendaRoleSizes(config);
  const timeFactor = roleSizes.time / AGENDA_ROLE_SIZE_DEFAULTS.time;
  const titleFactor = roleSizes.title / AGENDA_ROLE_SIZE_DEFAULTS.title;
  const bodyFactor = roleSizes.body / AGENDA_ROLE_SIZE_DEFAULTS.body;
  return (
    <div className="flex-1 flex flex-col justify-center gap-8 text-center px-8">
      <div>
        <p className="opacity-70 uppercase tracking-widest" style={{ fontSize: scale * titleFactor, ...titleStyle }}>
          {roomName}
        </p>
        {cur ? (
          <>
            <p className="font-mono opacity-80 mt-4" style={{ fontSize: scale * 1.6 * timeFactor, ...timeStyle }}>
              {showCardDate ? `${formatShortDate(cur.startsAt, tz)} · ` : ""}{formatTime(cur.startsAt, tz)} – {formatTime(cur.endsAt, tz)}
            </p>
            <h1 className="font-bold mt-3 leading-tight" style={{ fontSize: scale * 3 * titleFactor, ...titleStyle }}>
              {cur.title}
            </h1>
            {cur.presenter && (
              <p className="mt-3 opacity-80 whitespace-pre-line" style={{ fontSize: scale * 1.3 * bodyFactor, ...bodyStyle }}>
                {cur.presenter}
              </p>
            )}
            <div className="mt-4 inline-block">
              <StatusBadge status={cur.status as AgendaStatus} scale={scale * 1.4} override={roleColors.status} />
            </div>
            {cur.statusMessage && (
              <p className="mt-3 italic opacity-80" style={{ fontSize: scale * bodyFactor, ...bodyStyle }}>
                {cur.statusMessage}
              </p>
            )}
          </>
        ) : (
          <p className="opacity-60 mt-6" style={{ fontSize: scale * 1.4 * bodyFactor, ...bodyStyle }}>
            No session in this room right now.
          </p>
        )}
      </div>
      {next && (
        <div className="pt-6" style={{ borderTop: "1px solid var(--ag-divider)" }}>
          <p className="opacity-60 uppercase tracking-widest" style={{ fontSize: scale * 0.8 * titleFactor, ...titleStyle }}>
            Up next
          </p>
          <p className="font-mono opacity-80 mt-2" style={{ fontSize: scale * 1.1 * timeFactor, ...timeStyle }}>
            {showCardDate ? `${formatShortDate(next.startsAt, tz)} · ` : ""}{formatTime(next.startsAt, tz)}
          </p>
          <p className="font-semibold mt-1" style={{ fontSize: scale * 1.4 * titleFactor, ...bodyStyle }}>
            {next.title}
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Main widget -------------------------------------------------------

export function AgendaDisplayWidget({
  config,
  items,
  width,
  height,
  timezone,
  now: nowProp,
}: AgendaDisplayWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ w: width ?? 1920, h: height ?? 1080 });
  const [now, setNow] = useState(() => nowProp ?? new Date());
  const [pageIndex, setPageIndex] = useState(0);

  // Task #382 — reduced-motion preference, scroll metrics, and reset tick.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  const [scrollMetrics, setScrollMetrics] = useState<Record<string, number>>({});
  const [scrollResetTick, setScrollResetTick] = useState(0);

  // Task #382 — derived early so the pages memo can use it.
  // Active when: feature flag on, Full description mode, prefers-reduced-motion off.
  // Declared here rather than after `pages` so one-per-session pagination (below)
  // can use it without a forward reference.
  const descScrollActive =
    Boolean(config.descriptionAutoScroll) &&
    config.descriptionLines === null &&
    !prefersReducedMotion;

  // Stable callback — AgendaRow reports its overflow amount after measuring.
  const handleScrollOverflow = useCallback((id: string, px: number) => {
    setScrollMetrics((prev) => (prev[id] === px ? prev : { ...prev, [id]: px }));
  }, []);

  // Resize observer for auto layout selection when consumer doesn't
  // pass explicit dims.
  useEffect(() => {
    if (width && height) {
      setMeasured({ w: width, h: height });
      return;
    }
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setMeasured({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // Tick the wall-clock when not externally controlled.
  useEffect(() => {
    if (nowProp) {
      setNow(nowProp);
      return;
    }
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [nowProp]);

  // Task #382 — update the reduced-motion preference when OS setting changes.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const layout = useMemo(
    () => pickAgendaLayout(
      config.layoutMode as AgendaLayoutMode,
      measured.w,
      measured.h,
      config.displayMode as AgendaDisplayMode,
    ),
    [config.layoutMode, config.displayMode, measured.w, measured.h],
  );

  const scale = resolveAgendaFontPx(config.fontScale, measured.w, measured.h);
  const gap = resolveAgendaGapPx(config.density, measured.w, measured.h);

  // ---- Intelligent auto-fit pagination --------------------------------
  // Card layouts (portrait / landscape / ultrawide) stack variable-height
  // cards (titles wrap, presenter lists grow, descriptions clamp). A fixed
  // maxItemsPerPage clips the last card whenever the real content is taller
  // than the configured guess. Instead we measure every card at its true
  // render width and pack only as many as fully fit the available height —
  // so the bottom card is never cut off and the page rotates to show the
  // rest. totem / room_door are single "now / next" panels (they consume
  // `items` directly, not pages) and keep their existing behaviour.
  const cardLayout =
    layout === "portrait" || layout === "landscape" || layout === "ultrawide";

  // Column count must mirror the CSS in ColumnFlow / its callers so the
  // measured card width matches what actually renders.
  const numCols =
    layout === "ultrawide" ? (measured.w >= 1280 ? 4 : 3)
    : layout === "landscape" ? 2
    : 1;
  const COL_GAP = 12; // ColumnFlow columnGap (0.75rem)
  const ROW_GAP = 12; // portrait gap-3 / ColumnFlow card mb-3

  // When the resolved agenda spans more than one calendar day (in the
  // display timezone), show a compact date on every card. The list is
  // already sorted chronologically by start time, but without a date a
  // multi-day list looks out of order (e.g. day-1 16:30 above day-2
  // 10:30). Single-day agendas stay clean (no redundant date). Declared
  // here (before measurement) because it feeds the off-screen card height
  // pass — a date line changes a card's height.
  const multiDay = useMemo(() => {
    const days = new Set<string>();
    for (const it of items) {
      days.add(tzDayKey(it.startsAt, timezone));
      if (days.size > 1) return true;
    }
    return false;
  }, [items, timezone]);

  // Measure the body content box: the height available for cards and the
  // width each card actually renders at.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentBox, setContentBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setContentBox((p) =>
        Math.abs(p.w - cr.width) < 0.5 && Math.abs(p.h - cr.height) < 0.5
          ? p
          : { w: cr.width, h: cr.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardWidth =
    contentBox.w > 0 ? (contentBox.w - (numCols - 1) * COL_GAP) / numCols : 0;

  // Off-screen pass that renders every card at its real width and records
  // its rendered height. setState only fires when a height actually changes,
  // so this converges in one extra frame instead of looping.
  const measureRef = useRef<HTMLDivElement>(null);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  // Custom web fonts load asynchronously. Text laid out with the fallback
  // font is a *different* (usually shorter) height than the final custom
  // font, so a measurement taken before the font swaps in would under-count
  // and let the packer clip the last card. A font swap is a browser repaint,
  // not a React render, so nothing would otherwise re-measure — this bumps a
  // tick once fonts are ready (and on every subsequent font load) to force a
  // fresh measurement pass.
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    const fonts =
      typeof document !== "undefined"
        ? (document.fonts as FontFaceSet | undefined)
        : undefined;
    if (!fonts) return;
    let cancelled = false;
    const bump = () => {
      if (!cancelled) setFontTick((t) => t + 1);
    };
    fonts.ready.then(bump).catch(() => {});
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      cancelled = true;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !cardLayout || cardWidth <= 0) return;
    const next: Record<string, number> = {};
    el.querySelectorAll<HTMLElement>("[data-measure-id]").forEach((node) => {
      const id = node.dataset.measureId;
      // offsetHeight is the layout height (transform-independent), so it
      // matches the ResizeObserver content box even when an ancestor applies
      // a `transform: scale()` (zone / device previews). getBoundingClientRect
      // would return the *scaled* height and make the packer overcount.
      if (id) next[id] = node.offsetHeight;
    });
    setCardHeights((prev) => {
      const keys = Object.keys(next);
      if (
        keys.length === Object.keys(prev).length &&
        keys.every((k) => prev[k] != null && Math.abs(prev[k] - next[k]) < 0.5)
      ) {
        return prev;
      }
      return next;
    });
    // Re-measure whenever any input that changes a card's height changes —
    // content, width, scale, config (font/flags), date display, and the
    // font-load tick above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cardWidth, scale, config, multiDay, timezone, cardLayout, fontTick]);

  // Greedily pack cards into pages so the last card on a page is never
  // clipped (see packAgendaPages). Returns null until every card has been
  // measured, so the fallback keeps rendering in the meantime.
  const autoPages = useMemo(() => {
    if (!cardLayout || contentBox.h <= 0 || cardWidth <= 0) return null;
    const heights = items.map((it) => cardHeights[it.id]);
    if (heights.some((h) => h == null)) return null; // wait for measurement
    return packAgendaPages(
      items,
      heights as number[],
      contentBox.h,
      numCols,
      ROW_GAP,
    );
  }, [cardLayout, contentBox.h, cardWidth, numCols, items, cardHeights]);

  // Until measurement is ready (or for non-card layouts) fall back to the
  // configured cap so something always renders.
  const fallbackPageSize =
    layout === "portrait" ? Math.min(config.maxItemsPerPage, 6)
    : layout === "ultrawide" ? Math.max(config.maxItemsPerPage, 12)
    : config.maxItemsPerPage;

  const pages = useMemo(
    () => autoPages ?? paginate(items, fallbackPageSize),
    [autoPages, items, fallbackPageSize],
  );

  // Reset page index and scroll state whenever the item set or page layout
  // changes (e.g. real-time agenda updates while the screen is showing).
  useEffect(() => {
    setPageIndex(0);
    setScrollMetrics({});
    setScrollResetTick(0);
  }, [items.length, pages.length]);

  // safePageIndex / pageItems must be declared before the rotation effect so
  // the effect closure can capture them for the effectiveDwellMs computation.
  const safePageIndex =
    pages.length > 0 ? Math.min(pageIndex, pages.length - 1) : 0;
  const pageItems = pages[safePageIndex] ?? [];

  // Keep a ref so the dwell effect can read the latest pageItems without
  // listing the array itself as a dep. AgendaConfigZoneWidget polls every
  // ~30 s and produces a freshly-parsed JSON array each time; even when no
  // data changed the new reference would cancel and restart the dwell timer,
  // preventing it from ever firing. All meaningful changes that should restart
  // the timer (page advance, scrollMetrics update, pages.length change) are
  // already captured by their own deps.
  const pageItemsRef = useRef<AgendaItem[]>(pageItems);
  pageItemsRef.current = pageItems;

  // Per-column card count for the scroll viewport allocation formula.
  // Portrait: equal share across all cards on the page.
  // Multi-column: approximate equal share per column.
  const scrollItemCount =
    descScrollActive && cardLayout && pageItems.length > 0
      ? layout === "portrait"
        ? pageItems.length
        : Math.max(1, Math.ceil(pageItems.length / numCols))
      : undefined;

  // Reset scroll metrics on each page advance so cards re-report fresh
  // overflow measurements for the incoming page.
  useEffect(() => {
    setScrollMetrics({});
  }, [pageIndex]);

  // Page-rotation timer: replaced from setInterval to setTimeout so each
  // page can carry a variable effective dwell time. Effect re-arms on each
  // pageIndex / scrollResetTick change (the "loop" for single-page widgets).
  //
  // pageItems is intentionally NOT in the deps array — it is read via
  // pageItemsRef so that the periodic JSON re-fetch in AgendaConfigZoneWidget
  // (which produces a new array reference every ~30 s even when the data is
  // unchanged) does not cancel and restart the timer before it can fire.
  // Every meaningful change that should restart the timer (page advance,
  // scrollMetrics update, pages.length change) is already captured by its
  // own dep.
  useEffect(() => {
    const configuredMs = Math.max(3, config.rotationIntervalSeconds) * 1_000;
    const currentItems = pageItemsRef.current;

    // When auto-scroll is active, extend dwell to cover the full scroll
    // cycle so the page never advances while a description is still moving.
    let effectiveMs = configuredMs;
    if (descScrollActive && currentItems.length > 0) {
      const maxOverflow = Math.max(
        0,
        ...currentItems.map((it) => scrollMetrics[it.id] ?? 0),
      );
      if (maxOverflow > 0) {
        const scrollDuration = descScrollDurationMs(maxOverflow);
        effectiveMs = Math.max(
          configuredMs,
          TOP_PAUSE_MS + scrollDuration + BOTTOM_PAUSE_MS,
        );
      }
    }

    if (pages.length <= 1) {
      // Single-page: loop scroll animations via the reset tick after the
      // effective dwell. No timer when auto-scroll is off (legacy no-op).
      if (!descScrollActive) return;
      const id = setTimeout(
        () => setScrollResetTick((t) => t + 1),
        effectiveMs,
      );
      return () => clearTimeout(id);
    }

    // Multi-page: advance to the next page after the effective dwell.
    const id = setTimeout(
      () => setPageIndex((i) => (i + 1) % pages.length),
      effectiveMs,
    );
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, scrollResetTick, pages.length, config.rotationIntervalSeconds, descScrollActive, scrollMetrics]);

  // In now_next mode every layout (not only totem/room_door) gets a
  // strong "live now" highlight on the currently-running row(s).
  const highlightCurrent = config.displayMode === "now_next";

  const isLight = config.theme === "light";
  const themeClass = isLight
    ? "bg-white text-slate-900"
    : "bg-slate-950 text-slate-50";
  // Theme-aware card chrome exposed as CSS variables so every nested row,
  // divider and badge inherits the right contrast without prop-drilling.
  // In light mode the legacy white-on-white borders/backgrounds were
  // invisible; these dark-tinted values make the cards read on white.
  const themeVars = (isLight
    ? {
        "--ag-card-bg": "rgba(15,23,42,0.04)",
        "--ag-card-bg-current": "rgba(15,23,42,0.08)",
        "--ag-border": "rgba(15,23,42,0.14)",
        "--ag-divider": "rgba(15,23,42,0.10)",
        "--ag-glow": "0 2px 12px rgba(15,23,42,0.12)",
      }
    : {
        "--ag-card-bg": "rgba(255,255,255,0.05)",
        "--ag-card-bg-current": "rgba(255,255,255,0.15)",
        "--ag-border": "rgba(255,255,255,0.10)",
        "--ag-divider": "rgba(255,255,255,0.10)",
        "--ag-glow": "0 0 24px rgba(255,255,255,0.15)",
      }) as React.CSSProperties;

  const bgStyle: React.CSSProperties = config.backgroundUrl
    ? {
        backgroundImage: `url(${config.backgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  const roleColors = resolveRoleColors(config);
  const roleSizes = resolveAgendaRoleSizes(config);
  const fontStack = resolveFontStackForConfig(config);
  const titleStyle = roleColors.title ? { color: roleColors.title } : undefined;
  const timeStyle = timeRoleStyle(config, roleColors.time);
  const bodyStyle = roleColors.body ? { color: roleColors.body } : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex flex-col ${themeClass}`}
      style={{
        ...bgStyle,
        ...themeVars,
        padding: gap * 2,
        gap,
        fontFamily: fontStack,
      }}
      data-testid="agenda-display-root"
      data-layout={layout}
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: config.accentColor }}
      />

      {/* Header */}
      <header className="flex items-center justify-between" style={{ paddingBottom: gap / 2 }}>
        <div className="flex flex-col">
          {config.showEventName && (config.eventName || config.name) && (
            <h1
              className="font-bold leading-none"
              style={{ fontSize: scale * 1.5, ...titleStyle }}
              data-testid="agenda-event-title"
            >
              {config.eventName || config.name}
            </h1>
          )}
          <p className="opacity-60 mt-1" style={{ fontSize: scale * 0.8, ...bodyStyle }}>
            {layout === "room_door" || layout === "totem"
              ? "Agenda"
              : `${items.length} session${items.length === 1 ? "" : "s"}${pages.length > 1 ? ` · page ${pageIndex + 1}/${pages.length}` : ""}`}
          </p>
        </div>
        {(config.showCurrentTime || config.showDayName || config.showDate) && (
          (() => {
            // Task #240 — the displayed day equals the day of the first
            // resolved item (so today_tomorrow auto-roll shows tomorrow's
            // weekday/date alongside tomorrow's sessions). Falls back to
            // "now" when the list is empty.
            const headerDay =
              items.length > 0 ? new Date(items[0].startsAt) : now;
            return (
              <div
                className="flex flex-col items-end opacity-80"
                style={{ ...timeStyle }}
                data-testid="agenda-header-meta"
              >
                {(config.showDayName || config.showDate) && (
                  <p
                    className="leading-tight"
                    style={{ fontSize: scale * roleSizes.headerDate }}
                    data-testid="agenda-day-date"
                  >
                    {config.showDayName && (
                      <span data-testid="agenda-day-name">
                        {formatWeekday(headerDay, timezone)}
                      </span>
                    )}
                    {config.showDayName && config.showDate && (
                      <span className="opacity-50 mx-2">·</span>
                    )}
                    {config.showDate && (
                      <span data-testid="agenda-date">
                        {formatLongDate(headerDay, timezone)}
                      </span>
                    )}
                  </p>
                )}
                {config.showCurrentTime && (
                  <p
                    className="font-mono"
                    style={{ fontSize: scale * roleSizes.headerClock, ...timeStyle }}
                    data-testid="agenda-clock"
                  >
                    {formatNow(timezone, now)}
                  </p>
                )}
              </div>
            );
          })()
        )}
      </header>

      {/* Body */}
      <div
        ref={contentRef}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center opacity-60" style={{ fontSize: scale, ...bodyStyle }}>
            No agenda items match this display right now.
          </div>
        ) : layout === "ultrawide" ? (
          <UltraWideGrid
            pageItems={pageItems}
            config={config}
            tz={timezone}
            scale={scale}
            now={now}
            highlightCurrent={highlightCurrent}
            roleColors={roleColors}
            showCardDate={multiDay}
            scrollPageH={descScrollActive ? contentBox.h : undefined}
            scrollItemCount={scrollItemCount}
            onScrollOverflow={descScrollActive ? handleScrollOverflow : undefined}
            scrollResetTick={descScrollActive ? scrollResetTick : undefined}
            numCols={numCols}
          />
        ) : layout === "portrait" ? (
          <PortraitCards
            pageItems={pageItems}
            config={config}
            tz={timezone}
            scale={scale}
            now={now}
            highlightCurrent={highlightCurrent}
            roleColors={roleColors}
            showCardDate={multiDay}
            scrollPageH={descScrollActive ? contentBox.h : undefined}
            scrollItemCount={scrollItemCount}
            onScrollOverflow={descScrollActive ? handleScrollOverflow : undefined}
            scrollResetTick={descScrollActive ? scrollResetTick : undefined}
          />
        ) : layout === "totem" ? (
          <TotemNowNext items={items} config={config} tz={timezone} scale={scale} now={now} roleColors={roleColors} showCardDate={multiDay} />
        ) : layout === "room_door" ? (
          <RoomDoor items={items} config={config} tz={timezone} scale={scale} now={now} roleColors={roleColors} showCardDate={multiDay} />
        ) : (
          <LandscapeGrid
            pageItems={pageItems}
            config={config}
            tz={timezone}
            scale={scale}
            now={now}
            highlightCurrent={highlightCurrent}
            roleColors={roleColors}
            showCardDate={multiDay}
            scrollPageH={descScrollActive ? contentBox.h : undefined}
            scrollItemCount={scrollItemCount}
            onScrollOverflow={descScrollActive ? handleScrollOverflow : undefined}
            scrollResetTick={descScrollActive ? scrollResetTick : undefined}
          />
        )}
      </div>

      {/* Off-screen card measurer for intelligent auto-fit pagination.
          Rendered hidden at the real card width so we know each card's true
          height before deciding how many fit a page. */}
      {cardLayout && cardWidth > 0 && items.length > 0 && (
        <div
          ref={measureRef}
          aria-hidden
          style={{
            position: "absolute",
            visibility: "hidden",
            pointerEvents: "none",
            left: -99999,
            top: 0,
            width: cardWidth,
          }}
        >
          {items.map((it) => (
            <div key={it.id} data-measure-id={it.id} style={{ width: cardWidth }}>
              <AgendaRow
                item={it}
                config={config}
                tz={timezone}
                scale={scale}
                accentColor={config.accentColor}
                roleColors={roleColors}
                showCardDate={multiDay}
                suppressTestId
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

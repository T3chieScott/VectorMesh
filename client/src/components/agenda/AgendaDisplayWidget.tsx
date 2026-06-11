import { useEffect, useMemo, useRef, useState } from "react";
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
}: {
  item: AgendaItem;
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  isCurrent?: boolean;
  accentColor?: string;
  roleColors?: RoleColors;
  showCardDate?: boolean;
}) {
  const timeStyle = timeRoleStyle(config, roleColors?.time);
  const bodyStyle = roleColors?.body ? { color: roleColors.body } : undefined;
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
  return (
    <div
      className="flex items-start gap-4 rounded-lg px-4 py-3"
      style={cardStyle}
      data-testid={`agenda-row-${item.id}`}
      data-current={isCurrent ? "true" : undefined}
    >
      <div
        className="flex flex-col items-center min-w-[6.5em] pr-4"
        style={{ borderRight: "1px solid var(--ag-divider)" }}
      >
        <span
          className="font-mono font-bold"
          style={{ fontSize: scale * 1.15, ...timeStyle }}
          data-testid={`agenda-time-start-${item.id}`}
        >
          {formatTime(item.startsAt, tz)}
        </span>
        <span
          className="font-mono opacity-60"
          style={{ fontSize: scale * 0.75, ...timeStyle }}
          data-testid={`agenda-time-end-${item.id}`}
        >
          {formatTime(item.endsAt, tz)}
        </span>
        {showCardDate && (
          <span
            className="mt-1 text-center leading-tight opacity-70"
            style={{ fontSize: scale * 0.6, ...timeStyle }}
            data-testid={`agenda-card-date-${item.id}`}
          >
            {formatShortDate(item.startsAt, tz)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className="font-semibold leading-tight break-words"
            style={{ fontSize: scale * 1.15, ...bodyStyle }}
            data-testid={`agenda-title-${item.id}`}
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
        {(config.showRoom && item.room) || (item.track) || (config.showPresenter && item.presenter) ? (
          <div className="mt-1 flex flex-wrap gap-3 opacity-80" style={{ fontSize: scale * 0.75, ...bodyStyle }}>
            {config.showRoom && item.room && (
              <span data-testid={`agenda-room-${item.id}`}>📍 {item.room}</span>
            )}
            {item.track && <span>🏷 {item.track}</span>}
            {config.showPresenter && item.presenter && (
              <span className="whitespace-pre-line" data-testid={`agenda-presenter-${item.id}`}>🎤 {item.presenter}</span>
            )}
          </div>
        ) : null}
        {config.showDescription && item.description && (
          <p className="mt-1 opacity-75 line-clamp-2" style={{ fontSize: scale * 0.8, ...bodyStyle }}>
            {item.description}
          </p>
        )}
        {item.statusMessage && item.status !== "scheduled" && (
          <p
            className="mt-1 italic opacity-90"
            style={{ fontSize: scale * 0.75, ...bodyStyle }}
            data-testid={`agenda-status-msg-${item.id}`}
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
}

// Multi-column layouts use CSS columns rather than a grid so sessions
// flow DOWN each column first and then across — i.e. reading a column
// top-to-bottom stays in chronological order (a row-major grid jumps in
// time when read down a column). break-inside-avoid keeps each card
// whole, and because cards size to their own content they grow to fit
// longer titles or multi-speaker lists.
function ColumnFlow({
  pageItems,
  config,
  tz,
  scale,
  now,
  highlightCurrent,
  roleColors,
  showCardDate,
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
          />
        </div>
      ))}
    </div>
  );
}

function LandscapeGrid(props: RowGridProps) {
  return <ColumnFlow {...props} columnsClass="columns-2" />;
}

function PortraitCards({ pageItems, config, tz, scale, now, highlightCurrent, roleColors, showCardDate }: RowGridProps) {
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
        />
      ))}
    </div>
  );
}

function UltraWideGrid(props: RowGridProps) {
  return <ColumnFlow {...props} columnsClass="columns-3 xl:columns-4" />;
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
  return (
    <div className="flex-1 flex flex-col justify-center gap-8 text-center px-8">
      <div>
        <p className="opacity-70 uppercase tracking-widest" style={{ fontSize: scale, ...titleStyle }}>
          {roomName}
        </p>
        {cur ? (
          <>
            <p className="font-mono opacity-80 mt-4" style={{ fontSize: scale * 1.6, ...timeStyle }}>
              {showCardDate ? `${formatShortDate(cur.startsAt, tz)} · ` : ""}{formatTime(cur.startsAt, tz)} – {formatTime(cur.endsAt, tz)}
            </p>
            <h1 className="font-bold mt-3 leading-tight" style={{ fontSize: scale * 3, ...titleStyle }}>
              {cur.title}
            </h1>
            {cur.presenter && (
              <p className="mt-3 opacity-80 whitespace-pre-line" style={{ fontSize: scale * 1.3, ...bodyStyle }}>
                {cur.presenter}
              </p>
            )}
            <div className="mt-4 inline-block">
              <StatusBadge status={cur.status as AgendaStatus} scale={scale * 1.4} override={roleColors.status} />
            </div>
            {cur.statusMessage && (
              <p className="mt-3 italic opacity-80" style={{ fontSize: scale, ...bodyStyle }}>
                {cur.statusMessage}
              </p>
            )}
          </>
        ) : (
          <p className="opacity-60 mt-6" style={{ fontSize: scale * 1.4, ...bodyStyle }}>
            No session in this room right now.
          </p>
        )}
      </div>
      {next && (
        <div className="pt-6" style={{ borderTop: "1px solid var(--ag-divider)" }}>
          <p className="opacity-60 uppercase tracking-widest" style={{ fontSize: scale * 0.8, ...titleStyle }}>
            Up next
          </p>
          <p className="font-mono opacity-80 mt-2" style={{ fontSize: scale * 1.1, ...timeStyle }}>
            {showCardDate ? `${formatShortDate(next.startsAt, tz)} · ` : ""}{formatTime(next.startsAt, tz)}
          </p>
          <p className="font-semibold mt-1" style={{ fontSize: scale * 1.4, ...bodyStyle }}>
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

  const pageSize =
    layout === "portrait" ? Math.min(config.maxItemsPerPage, 6)
    : layout === "totem" ? config.maxItemsPerPage
    : layout === "room_door" ? config.maxItemsPerPage
    : layout === "ultrawide" ? Math.max(config.maxItemsPerPage, 12)
    : config.maxItemsPerPage;

  const pages = useMemo(() => paginate(items, pageSize), [items, pageSize]);

  // Rotate pages every rotationIntervalSeconds; reset when items change.
  useEffect(() => {
    setPageIndex(0);
  }, [items.length, pageSize]);

  useEffect(() => {
    if (pages.length <= 1) return;
    const ms = Math.max(3, config.rotationIntervalSeconds) * 1000;
    const id = setInterval(() => {
      setPageIndex((i) => (i + 1) % pages.length);
    }, ms);
    return () => clearInterval(id);
  }, [pages.length, config.rotationIntervalSeconds]);

  const pageItems = pages[pageIndex] ?? [];

  // When the resolved agenda spans more than one calendar day (in the
  // display timezone), show a compact date on every card. The list is
  // already sorted chronologically by start time, but without a date a
  // multi-day list looks out of order (e.g. day-1 16:30 above day-2
  // 10:30). Single-day agendas stay clean (no redundant date).
  const multiDay = useMemo(() => {
    const days = new Set<string>();
    for (const it of items) {
      days.add(tzDayKey(it.startsAt, timezone));
      if (days.size > 1) return true;
    }
    return false;
  }, [items, timezone]);

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
                    style={{ fontSize: scale * 0.9 }}
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
                    style={{ fontSize: scale * 1.3, ...timeStyle }}
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
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center opacity-60" style={{ fontSize: scale, ...bodyStyle }}>
          No agenda items match this display right now.
        </div>
      ) : layout === "ultrawide" ? (
        <UltraWideGrid pageItems={pageItems} config={config} tz={timezone} scale={scale} now={now} highlightCurrent={highlightCurrent} roleColors={roleColors} showCardDate={multiDay} />
      ) : layout === "portrait" ? (
        <PortraitCards pageItems={pageItems} config={config} tz={timezone} scale={scale} now={now} highlightCurrent={highlightCurrent} roleColors={roleColors} showCardDate={multiDay} />
      ) : layout === "totem" ? (
        <TotemNowNext items={items} config={config} tz={timezone} scale={scale} now={now} roleColors={roleColors} showCardDate={multiDay} />
      ) : layout === "room_door" ? (
        <RoomDoor items={items} config={config} tz={timezone} scale={scale} now={now} roleColors={roleColors} showCardDate={multiDay} />
      ) : (
        <LandscapeGrid pageItems={pageItems} config={config} tz={timezone} scale={scale} now={now} highlightCurrent={highlightCurrent} roleColors={roleColors} showCardDate={multiDay} />
      )}
    </div>
  );
}

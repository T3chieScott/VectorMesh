import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgendaItem,
  AgendaWidgetConfig,
  AgendaStatus,
  AgendaDisplayMode,
  AgendaLayoutMode,
  AgendaFontFamily,
} from "@shared/schema";
import {
  AGENDA_FONT_FAMILY_STACKS,
  AGENDA_DEFAULT_FONT_STACK,
} from "@shared/schema";
import {
  pickAgendaLayout,
  paginate,
  splitCurrentNext,
} from "@shared/agenda-resolver";

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

function resolveFontStack(config: AgendaWidgetConfig): string {
  const key = config.fontFamily as AgendaFontFamily | null | undefined;
  if (key && key in AGENDA_FONT_FAMILY_STACKS) {
    return AGENDA_FONT_FAMILY_STACKS[key];
  }
  return AGENDA_DEFAULT_FONT_STACK;
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

const STATUS_COLOR: Record<AgendaStatus, string> = {
  scheduled: "bg-slate-500/30 text-slate-100 border-slate-400/40",
  in_progress: "bg-emerald-500/30 text-emerald-100 border-emerald-400/60 animate-pulse",
  delayed: "bg-amber-500/30 text-amber-100 border-amber-400/60",
  cancelled: "bg-rose-600/30 text-rose-100 border-rose-400/60",
  moved: "bg-indigo-500/30 text-indigo-100 border-indigo-400/60",
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
  small: 14 / 1080,
  normal: 18 / 1080,
  large: 22 / 1080,
  xlarge: 28 / 1080,
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
}: {
  item: AgendaItem;
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  isCurrent?: boolean;
  accentColor?: string;
  roleColors?: RoleColors;
}) {
  const timeStyle = roleColors?.time ? { color: roleColors.time } : undefined;
  const bodyStyle = roleColors?.body ? { color: roleColors.body } : undefined;
  // When the operator picks "now_next" mode, the currently-running
  // session is rendered with a strong accent ring + brighter bg in
  // every layout, so audiences can tell at a glance which session
  // is happening now without reading the timestamp.
  const highlightClass = isCurrent
    ? "border-2 bg-white/15 shadow-[0_0_24px_rgba(255,255,255,0.15)]"
    : "border border-white/10 bg-white/5";
  const highlightStyle: React.CSSProperties = isCurrent && accentColor
    ? { borderColor: accentColor }
    : {};
  return (
    <div
      className={`flex items-start gap-4 rounded-lg ${highlightClass} px-4 py-3 backdrop-blur-sm`}
      style={highlightStyle}
      data-testid={`agenda-row-${item.id}`}
      data-current={isCurrent ? "true" : undefined}
    >
      <div className="flex flex-col items-center min-w-[6.5em] border-r border-white/10 pr-4">
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
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className="font-semibold leading-tight truncate"
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
            {config.showPresenter && item.presenter && <span>🎤 {item.presenter}</span>}
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
}

function LandscapeGrid({ pageItems, config, tz, scale, now, highlightCurrent, roleColors }: RowGridProps) {
  return (
    <div className="flex-1 grid grid-cols-2 gap-3 overflow-hidden">
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
        />
      ))}
    </div>
  );
}

function PortraitCards({ pageItems, config, tz, scale, now, highlightCurrent, roleColors }: RowGridProps) {
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
        />
      ))}
    </div>
  );
}

function UltraWideGrid({ pageItems, config, tz, scale, now, highlightCurrent, roleColors }: RowGridProps) {
  return (
    <div className="flex-1 grid grid-cols-3 xl:grid-cols-4 gap-3 overflow-hidden">
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
        />
      ))}
    </div>
  );
}

function TotemNowNext({
  items,
  config,
  tz,
  scale,
  now,
  roleColors,
}: {
  items: AgendaItem[];
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  now: Date;
  roleColors: RoleColors;
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
          <AgendaRow item={cur} config={config} tz={tz} scale={scale * 1.3} roleColors={roleColors} />
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
            <AgendaRow key={it.id} item={it} config={config} tz={tz} scale={scale} roleColors={roleColors} />
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
}: {
  items: AgendaItem[];
  config: AgendaWidgetConfig;
  tz: string | null | undefined;
  scale: number;
  now: Date;
  roleColors: RoleColors;
}) {
  const { current, upcoming } = splitCurrentNext(items, now);
  const cur = current[0];
  const next = upcoming[0];
  const roomName = cur?.room || next?.room || config.roomFilter?.[0] || "Room";
  const titleStyle = roleColors.title ? { color: roleColors.title } : undefined;
  const bodyStyle = roleColors.body ? { color: roleColors.body } : undefined;
  const timeStyle = roleColors.time ? { color: roleColors.time } : undefined;
  return (
    <div className="flex-1 flex flex-col justify-center gap-8 text-center px-8">
      <div>
        <p className="opacity-70 uppercase tracking-widest" style={{ fontSize: scale, ...titleStyle }}>
          {roomName}
        </p>
        {cur ? (
          <>
            <p className="font-mono opacity-80 mt-4" style={{ fontSize: scale * 1.6, ...timeStyle }}>
              {formatTime(cur.startsAt, tz)} – {formatTime(cur.endsAt, tz)}
            </p>
            <h1 className="font-bold mt-3 leading-tight" style={{ fontSize: scale * 3, ...titleStyle }}>
              {cur.title}
            </h1>
            {cur.presenter && (
              <p className="mt-3 opacity-80" style={{ fontSize: scale * 1.3, ...bodyStyle }}>
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
        <div className="border-t border-white/10 pt-6">
          <p className="opacity-60 uppercase tracking-widest" style={{ fontSize: scale * 0.8, ...titleStyle }}>
            Up next
          </p>
          <p className="font-mono opacity-80 mt-2" style={{ fontSize: scale * 1.1, ...timeStyle }}>
            {formatTime(next.startsAt, tz)}
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

  // In now_next mode every layout (not only totem/room_door) gets a
  // strong "live now" highlight on the currently-running row(s).
  const highlightCurrent = config.displayMode === "now_next";

  const themeClass = config.theme === "light"
    ? "bg-white text-slate-900"
    : "bg-slate-950 text-slate-50";

  const bgStyle: React.CSSProperties = config.backgroundUrl
    ? {
        backgroundImage: `url(${config.backgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  const roleColors = resolveRoleColors(config);
  const fontStack = resolveFontStack(config);
  const titleStyle = roleColors.title ? { color: roleColors.title } : undefined;
  const timeStyle = roleColors.time ? { color: roleColors.time } : undefined;
  const bodyStyle = roleColors.body ? { color: roleColors.body } : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex flex-col ${themeClass}`}
      style={{
        ...bgStyle,
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
        {config.showCurrentTime && (
          <p
            className="font-mono opacity-80"
            style={{ fontSize: scale * 1.3, ...timeStyle }}
            data-testid="agenda-clock"
          >
            {formatNow(timezone, now)}
          </p>
        )}
      </header>

      {/* Body */}
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center opacity-60" style={{ fontSize: scale, ...bodyStyle }}>
          No agenda items match this display right now.
        </div>
      ) : layout === "ultrawide" ? (
        <UltraWideGrid pageItems={pageItems} config={config} tz={timezone} scale={scale} now={now} highlightCurrent={highlightCurrent} roleColors={roleColors} />
      ) : layout === "portrait" ? (
        <PortraitCards pageItems={pageItems} config={config} tz={timezone} scale={scale} now={now} highlightCurrent={highlightCurrent} roleColors={roleColors} />
      ) : layout === "totem" ? (
        <TotemNowNext items={items} config={config} tz={timezone} scale={scale} now={now} roleColors={roleColors} />
      ) : layout === "room_door" ? (
        <RoomDoor items={items} config={config} tz={timezone} scale={scale} now={now} roleColors={roleColors} />
      ) : (
        <LandscapeGrid pageItems={pageItems} config={config} tz={timezone} scale={scale} now={now} highlightCurrent={highlightCurrent} roleColors={roleColors} />
      )}
    </div>
  );
}

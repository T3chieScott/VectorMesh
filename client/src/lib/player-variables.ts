import { useEffect, useState } from "react";

export interface PlayerVariableDef {
  token: string;
  label: string;
  description: string;
  preview: string;
}

// Optional `nowMs` lets the player pass server-synced time;
// undefined falls back to local Date.now() (admin previews etc).
// Optional `tz` (IANA timezone) formats in the screen's site timezone rather
// than the browser's local timezone — critical on Raspberry Pi players where
// the OS clock/locale may be set to UTC or a different zone.
function sampleDate(nowMs?: number, tz?: string) {
  const d = new Date(nowMs ?? Date.now());
  if (tz) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(d);
  }
  return d.toLocaleDateString();
}
function sampleTime(nowMs?: number, tz?: string) {
  const d = new Date(nowMs ?? Date.now());
  if (tz) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function sampleTime24(nowMs?: number, tz?: string) {
  const d = new Date(nowMs ?? Date.now());
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  if (tz) options.timeZone = tz;
  return new Intl.DateTimeFormat(undefined, options).format(d);
}
function sampleDay(nowMs?: number, tz?: string) {
  const d = new Date(nowMs ?? Date.now());
  if (tz) {
    return new Intl.DateTimeFormat("en", {
      timeZone: tz,
      weekday: "long",
    }).format(d);
  }
  return d.toLocaleDateString("en", { weekday: "long" });
}

export const PLAYER_VARIABLES: PlayerVariableDef[] = [
  { token: "{{screen_name}}", label: "Screen Name", description: "Name of the display screen", preview: "Lobby Screen 1" },
  { token: "{{room_name}}", label: "Room Name", description: "Room or location name", preview: "Main Hall" },
  { token: "{{event_name}}", label: "Event Name", description: "Current event name", preview: "Tech Summit 2025" },
  { token: "{{client_name}}", label: "Client Name", description: "Client/brand name", preview: "Acme Corp" },
  { token: "{{date}}", label: "Date", description: "Current date", preview: sampleDate() },
  { token: "{{time}}", label: "Time", description: "Current time", preview: sampleTime() },
  { token: "{{time24}}", label: "Time (24-hour)", description: "Current time in 24-hour format", preview: sampleTime24() },
  { token: "{{day}}", label: "Day of Week", description: "Current day name", preview: sampleDay() },
  { token: "{{room_capacity}}", label: "Room Capacity", description: "Maximum capacity of the screen's room (set on the screen)", preview: "250" },
  { token: "{{event_start_date}}", label: "Event Start Date", description: "Start date of the screen's current event", preview: "Mar 12, 2026" },
  { token: "{{event_end_date}}", label: "Event End Date", description: "End date of the screen's current event", preview: "Mar 14, 2026" },
  { token: "{{next_session_title}}", label: "Next Session Title", description: "Name of the next scheduled programme block for this screen", preview: "Opening Keynote" },
  { token: "{{next_session_time}}", label: "Next Session Time", description: "Start time of the next scheduled programme block", preview: "09:30" },
  { token: "{{next_session_countdown}}", label: "Next Session Countdown", description: "Friendly countdown until the next session starts", preview: "in 25 min" },
  { token: "{{weather_summary}}", label: "Weather Summary", description: "Current weather for the screen's configured location", preview: "Partly Cloudy, 18°C" },
];

export interface PlayerVariableContext {
  screenName?: string | null;
  roomName?: string | null;
  eventName?: string | null;
  clientName?: string | null;
  roomCapacity?: number | string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  nextSessionTitle?: string | null;
  nextSessionTime?: string | null;
  nextSessionCountdown?: string | null;
  weatherSummary?: string | null;
  /**
   * IANA timezone for {{time}}/{{time24}}/{{date}}/{{day}} resolution.
   * When set, Intl.DateTimeFormat uses this timezone so the displayed
   * time matches the screen's configured site timezone rather than the
   * browser/OS timezone (which on Raspberry Pi players is often UTC).
   * When absent, the browser's local timezone is used (admin previews).
   */
  timezone?: string | null;
  /**
   * Server-synced "now" for {{date}}/{{time}}/{{time24}}/{{day}}. Prefer
   * `getNowMs` (invoked per render) over `nowMs` (a static snapshot
   * that would freeze when child components re-render independently
   * of the context provider). `nowMs` is retained for tests that
   * pin a deterministic instant.
   */
  nowMs?: number | null;
  getNowMs?: () => number;
}

function buildResolved(ctx?: PlayerVariableContext): Record<string, string> {
  if (!ctx) {
    const map: Record<string, string> = {};
    for (const v of PLAYER_VARIABLES) map[v.token] = v.preview;
    return map;
  }
  const empty = "";
  const cap = ctx.roomCapacity;
  // Prefer the live `getNowMs` accessor (server-synced and re-evaluated
  // on every render) over the static `nowMs` snapshot. The snapshot
  // path remains so deterministic tests can pin an instant.
  const nowMs = typeof ctx.getNowMs === "function"
    ? ctx.getNowMs()
    : typeof ctx.nowMs === "number"
      ? ctx.nowMs
      : undefined;
  const tz = ctx.timezone ?? undefined;
  return {
    "{{screen_name}}": ctx.screenName ?? empty,
    "{{room_name}}": ctx.roomName ?? empty,
    "{{event_name}}": ctx.eventName ?? empty,
    "{{client_name}}": ctx.clientName ?? empty,
    "{{date}}": sampleDate(nowMs, tz),
    "{{time}}": sampleTime(nowMs, tz),
    "{{time24}}": sampleTime24(nowMs, tz),
    "{{day}}": sampleDay(nowMs, tz),
    "{{room_capacity}}": cap === null || cap === undefined || cap === "" ? empty : String(cap),
    "{{event_start_date}}": ctx.eventStartDate ?? empty,
    "{{event_end_date}}": ctx.eventEndDate ?? empty,
    "{{next_session_title}}": ctx.nextSessionTitle ?? empty,
    "{{next_session_time}}": ctx.nextSessionTime ?? empty,
    "{{next_session_countdown}}": ctx.nextSessionCountdown ?? empty,
    "{{weather_summary}}": ctx.weatherSummary ?? empty,
  };
}

export function resolvePlayerVariables(text: string | null | undefined, ctx?: PlayerVariableContext): string {
  if (!text) return text ?? "";
  const map = buildResolved(ctx);
  let out = text;
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
}

const TOKEN_REGEX = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export function extractTokensFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push(`{{${match[1].toLowerCase()}}}`);
  }
  return out;
}

export function extractTokensFromObject(value: unknown): string[] {
  const seen = new Set<string>();
  const visit = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") {
      for (const t of extractTokensFromText(v)) seen.add(t);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return Array.from(seen);
}

export function isTokenResolved(token: string, ctx?: PlayerVariableContext): boolean {
  if (!ctx) {
    return token === "{{date}}" || token === "{{time}}" || token === "{{day}}";
  }
  const map = buildResolved(ctx);
  const v = map[token];
  return typeof v === "string" && v.length > 0;
}

export function unresolvedTokenReason(token: string, ctx?: PlayerVariableContext): string {
  switch (token) {
    case "{{screen_name}}": return "Screen has no name set";
    case "{{room_name}}": return "Screen has no room/location set";
    case "{{event_name}}":
    case "{{event_start_date}}":
    case "{{event_end_date}}":
      return "Screen has no current event assigned";
    case "{{client_name}}":
      return "Screen is not assigned to a client";
    case "{{room_capacity}}":
      return "Room capacity is not set on this screen";
    case "{{next_session_title}}":
    case "{{next_session_time}}":
    case "{{next_session_countdown}}":
      return ctx?.eventName
        ? "No upcoming session scheduled for this screen"
        : "Screen has no current event with a programme";
    case "{{weather_summary}}":
      return "Screen has no weather location (lat/lng) set";
    default:
      return "Token has no value for this screen";
  }
}

export function usePlayerVariableTick(intervalMs = 30_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}

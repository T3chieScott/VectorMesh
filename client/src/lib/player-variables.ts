import { useEffect, useState } from "react";

export interface PlayerVariableDef {
  token: string;
  label: string;
  description: string;
  preview: string;
}

// Task #193 — every "now"-derived sample takes an optional ms
// timestamp so callers (the player) can feed in a server-synced
// wall-clock time instead of the device's possibly-wrong system
// clock. Admin previews leave it undefined and fall back to local
// Date.now(), preserving the previous behaviour.
function sampleDate(nowMs?: number) {
  return new Date(nowMs ?? Date.now()).toLocaleDateString();
}
function sampleTime(nowMs?: number) {
  return new Date(nowMs ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function sampleDay(nowMs?: number) {
  return new Date(nowMs ?? Date.now()).toLocaleDateString("en", { weekday: "long" });
}

export const PLAYER_VARIABLES: PlayerVariableDef[] = [
  { token: "{{screen_name}}", label: "Screen Name", description: "Name of the display screen", preview: "Lobby Screen 1" },
  { token: "{{room_name}}", label: "Room Name", description: "Room or location name", preview: "Main Hall" },
  { token: "{{event_name}}", label: "Event Name", description: "Current event name", preview: "Tech Summit 2025" },
  { token: "{{client_name}}", label: "Client Name", description: "Client/brand name", preview: "Acme Corp" },
  { token: "{{date}}", label: "Date", description: "Current date", preview: sampleDate() },
  { token: "{{time}}", label: "Time", description: "Current time", preview: sampleTime() },
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
   * Task #193 — server-synced "now" in ms. When set, {{date}}/{{time}}/
   * {{day}} render off this instead of `Date.now()`. The player passes
   * this in via `getSyncedNow()` so wall-clock tokens stay correct
   * even when the device's system clock is wrong. Admin/preview leave
   * this undefined and fall back to local time.
   *
   * IMPORTANT: prefer `getNowMs` over `nowMs`. A fixed `nowMs` snapshot
   * was found to freeze {{time}} when downstream components (e.g.
   * ZoneRenderer's usePlayerVariableTick) re-render independently of
   * the parent that built the context. `getNowMs` is invoked at
   * render-time inside `buildResolved`, so each tick gets a fresh
   * server-synced timestamp. `nowMs` is kept only for tests that
   * want to pin a deterministic instant.
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
  return {
    "{{screen_name}}": ctx.screenName ?? empty,
    "{{room_name}}": ctx.roomName ?? empty,
    "{{event_name}}": ctx.eventName ?? empty,
    "{{client_name}}": ctx.clientName ?? empty,
    "{{date}}": sampleDate(nowMs),
    "{{time}}": sampleTime(nowMs),
    "{{day}}": sampleDay(nowMs),
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

import { useEffect, useState } from "react";

export interface PlayerVariableDef {
  token: string;
  label: string;
  description: string;
  preview: string;
}

function sampleDate() {
  return new Date().toLocaleDateString();
}
function sampleTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function sampleDay() {
  return new Date().toLocaleDateString("en", { weekday: "long" });
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
}

function buildResolved(ctx?: PlayerVariableContext): Record<string, string> {
  if (!ctx) {
    const map: Record<string, string> = {};
    for (const v of PLAYER_VARIABLES) map[v.token] = v.preview;
    return map;
  }
  const empty = "";
  const cap = ctx.roomCapacity;
  return {
    "{{screen_name}}": ctx.screenName ?? empty,
    "{{room_name}}": ctx.roomName ?? empty,
    "{{event_name}}": ctx.eventName ?? empty,
    "{{client_name}}": ctx.clientName ?? empty,
    "{{date}}": sampleDate(),
    "{{time}}": sampleTime(),
    "{{day}}": sampleDay(),
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

export function usePlayerVariableTick(intervalMs = 30_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}

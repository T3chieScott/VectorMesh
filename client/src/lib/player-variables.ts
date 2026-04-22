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
];

export interface PlayerVariableContext {
  screenName?: string | null;
  roomName?: string | null;
  eventName?: string | null;
  clientName?: string | null;
}

function buildResolved(ctx?: PlayerVariableContext): Record<string, string> {
  if (!ctx) {
    const map: Record<string, string> = {};
    for (const v of PLAYER_VARIABLES) map[v.token] = v.preview;
    return map;
  }
  const empty = "";
  return {
    "{{screen_name}}": ctx.screenName ?? empty,
    "{{room_name}}": ctx.roomName ?? empty,
    "{{event_name}}": ctx.eventName ?? empty,
    "{{client_name}}": ctx.clientName ?? empty,
    "{{date}}": sampleDate(),
    "{{time}}": sampleTime(),
    "{{day}}": sampleDay(),
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

import { createHash } from "node:crypto";
import type { AgendaItem } from "@shared/schema";

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function digestAgendaConnectionItems(items: AgendaItem[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)).map(canonical)))
    .digest("hex");
}
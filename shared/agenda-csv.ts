// CSV parsing / serialisation for bulk agenda item import/export.
// Pure (no DB) so it can run in tests and in the browser preview of
// the importer. Format:
//
//   title,description,room,track,presenter,startsAt,endsAt,status,statusMessage
//
// startsAt / endsAt: ISO 8601 (e.g. "2026-06-01T09:30:00Z" or with
// a numeric offset). Status defaults to "scheduled" when blank or
// unrecognised. Strings are tolerant of surrounding whitespace.

import { AGENDA_STATUSES, type AgendaStatus, type InsertAgendaItem } from "./schema";

export interface AgendaCsvRowResult {
  index: number;
  status: "ok" | "error";
  item?: Omit<InsertAgendaItem, "clientId">;
  error?: string;
  raw: string[];
}

const HEADERS = [
  "title",
  "description",
  "room",
  "track",
  "presenter",
  "startsAt",
  "endsAt",
  "status",
  "statusMessage",
] as const;

export const AGENDA_CSV_HEADER = HEADERS.join(",");

// Minimal RFC-4180-ish split: handles quoted fields containing commas
// and escaped double quotes (""). Newlines inside quoted fields are
// not supported — the importer treats each line as one row.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"' && cur.length === 0) {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseAgendaCsv(text: string): AgendaCsvRowResult[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  let startIdx = 0;
  const firstRow = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const looksLikeHeader = firstRow.includes("title") && firstRow.includes("startsat");
  if (looksLikeHeader) startIdx = 1;

  const results: AgendaCsvRowResult[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const [title, description, room, track, presenter, startsAt, endsAt, statusRaw, statusMessage] = cols;
    if (!title || !startsAt || !endsAt) {
      results.push({
        index: i - startIdx,
        status: "error",
        error: "title, startsAt and endsAt are required",
        raw: cols,
      });
      continue;
    }
    // Room is required because every agenda widget surface (room
    // door, totem, landscape grid) keys off "where is this happening".
    // Empty room would render an unattributable session on the wall.
    if (!room) {
      results.push({
        index: i - startIdx,
        status: "error",
        error: "room is required",
        raw: cols,
      });
      continue;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      results.push({
        index: i - startIdx,
        status: "error",
        error: "Invalid startsAt or endsAt (expected ISO 8601)",
        raw: cols,
      });
      continue;
    }
    if (!(end.getTime() > start.getTime())) {
      results.push({
        index: i - startIdx,
        status: "error",
        error: "endsAt must be after startsAt",
        raw: cols,
      });
      continue;
    }
    const statusLower = (statusRaw || "scheduled").toLowerCase();
    const status: AgendaStatus = (AGENDA_STATUSES as readonly string[]).includes(statusLower)
      ? (statusLower as AgendaStatus)
      : "scheduled";

    results.push({
      index: i - startIdx,
      status: "ok",
      raw: cols,
      item: {
        title,
        description: description || null,
        room: room || null,
        track: track || null,
        presenter: presenter || null,
        startsAt: start,
        endsAt: end,
        status,
        statusMessage: statusMessage || null,
      },
    });
  }
  return results;
}

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function serializeAgendaCsv(
  items: Array<{
    title: string;
    description: string | null;
    room: string | null;
    track: string | null;
    presenter: string | null;
    startsAt: Date | string;
    endsAt: Date | string;
    status: string;
    statusMessage: string | null;
  }>,
): string {
  const lines = [AGENDA_CSV_HEADER];
  for (const it of items) {
    const startsAt = typeof it.startsAt === "string" ? it.startsAt : it.startsAt.toISOString();
    const endsAt = typeof it.endsAt === "string" ? it.endsAt : it.endsAt.toISOString();
    lines.push(
      [
        csvEscape(it.title),
        csvEscape(it.description),
        csvEscape(it.room),
        csvEscape(it.track),
        csvEscape(it.presenter),
        startsAt,
        endsAt,
        it.status,
        csvEscape(it.statusMessage),
      ].join(","),
    );
  }
  return lines.join("\n");
}

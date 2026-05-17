// Minimal ICS (RFC 5545) parser used by the agenda-sync engine
// (server/agendaSync.ts). We intentionally avoid pulling in a heavy
// dependency: VectorMesh only needs the few fields surfaced on the
// agenda widget (title/description/room/track/presenter + start/end
// + a stable UID), and the parse runs on the server.
//
// Supported:
//   - VEVENT blocks within a VCALENDAR
//   - Line folding (CRLF + space/tab continuation per RFC 5545 §3.1)
//   - DTSTART/DTEND in UTC ("...Z"), floating local, or with a TZID
//     parameter (we ignore the TZID and treat as floating — operators
//     pick the site timezone elsewhere; this matches how the existing
//     CSV importer treats naive ISO strings).
//   - DESCRIPTION/SUMMARY/LOCATION/UID/CATEGORIES/ORGANIZER
//   - Escaped sequences (\n, \,, \;, \\)
//
// Not supported (intentionally, this is a one-way pull):
//   - RRULE/RECUR expansion (we just emit the master VEVENT)
//   - VTIMEZONE definitions
//   - VALARM / VTODO / other components
//
// Errors are accumulated per VEVENT so a single malformed entry
// doesn't break the whole pull.

import { AGENDA_STATUSES, type AgendaStatus, type InsertAgendaItem } from "./schema";

export interface IcsParsedItem {
  externalId: string;
  item: Omit<InsertAgendaItem, "clientId" | "externalSyncConfigId">;
}

export interface IcsParseResult {
  items: IcsParsedItem[];
  errors: string[];
}

function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeIcsText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parse an ICS DATE-TIME into a JS Date. Forms we accept:
//   20260601T090000Z            (UTC)
//   20260601T090000             (floating, treat as UTC)
//   20260601                    (DATE — midnight UTC)
function parseIcsDate(value: string): Date | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return new Date(Date.UTC(+y, +mo - 1, +d, 0, 0, 0));
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

// Split "PROP;PARAM=val:value" into { name, params, value }.
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx < 0) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = head.split(";");
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
  }
  return { name, params, value };
}

function mapIcsStatus(raw: string | undefined): AgendaStatus {
  if (!raw) return "scheduled";
  const v = raw.toLowerCase();
  if (v === "cancelled") return "cancelled";
  if (v === "tentative") return "delayed";
  if ((AGENDA_STATUSES as readonly string[]).includes(v)) return v as AgendaStatus;
  return "scheduled";
}

export function parseIcs(text: string): IcsParseResult {
  const result: IcsParseResult = { items: [], errors: [] };
  if (!text || !text.trim()) {
    result.errors.push("Empty ICS document");
    return result;
  }
  const lines = unfoldLines(text);
  let inEvent = false;
  let cur: Record<string, { value: string; params: Record<string, string> }> = {};
  let lineNo = 0;
  for (const rawLine of lines) {
    lineNo++;
    const line = rawLine.trimEnd();
    if (!line) continue;
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (name === "END" && value.toUpperCase() === "VEVENT") {
      inEvent = false;
      try {
        const title = cur.SUMMARY?.value;
        const dtStart = cur.DTSTART?.value;
        const dtEnd = cur.DTEND?.value;
        const uid = cur.UID?.value;
        if (!title) {
          result.errors.push(`VEVENT missing SUMMARY (near line ${lineNo})`);
          continue;
        }
        if (!dtStart) {
          result.errors.push(`VEVENT missing DTSTART (near line ${lineNo})`);
          continue;
        }
        const startsAt = parseIcsDate(dtStart);
        if (!startsAt) {
          result.errors.push(`VEVENT has unparseable DTSTART="${dtStart}"`);
          continue;
        }
        let endsAt = dtEnd ? parseIcsDate(dtEnd) : null;
        if (!endsAt) {
          // Default to a 1-hour session if upstream omitted DTEND.
          endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
        }
        if (!(endsAt.getTime() > startsAt.getTime())) {
          result.errors.push(`VEVENT "${title}" has endsAt <= startsAt`);
          continue;
        }
        const externalId = uid && uid.trim().length > 0
          ? uid.trim()
          : `${title}__${startsAt.toISOString()}`;
        result.items.push({
          externalId,
          item: {
            title: unescapeIcsText(title),
            description: cur.DESCRIPTION ? unescapeIcsText(cur.DESCRIPTION.value) : null,
            room: cur.LOCATION ? unescapeIcsText(cur.LOCATION.value) : null,
            track: cur.CATEGORIES ? unescapeIcsText(cur.CATEGORIES.value).split(",")[0].trim() || null : null,
            presenter: cur.ORGANIZER ? unescapeIcsText(cur.ORGANIZER.value).replace(/^mailto:/i, "") : null,
            startsAt,
            endsAt,
            status: mapIcsStatus(cur.STATUS?.value),
            statusMessage: null,
          },
        });
      } catch (e) {
        result.errors.push(`VEVENT parse failed: ${(e as Error).message}`);
      }
      continue;
    }
    if (inEvent) {
      cur[name] = { value, params };
    }
  }
  return result;
}

// Task #267 — generic spreadsheet → agenda mapping layer.
//
// Pure (no DB, no XLSX library) so the exact same code drives the
// preview endpoint, the live sync, and the unit tests. The server-side
// XLSX reader (server/spreadsheetParse.ts) turns a workbook into a
// `Cell[][]` grid; CSV text is turned into a grid here. Everything from
// "grid + mapping" onwards is shared.
//
// Cells can be strings (CSV, text XLSX cells), numbers (XLSX numeric /
// Excel-serial date cells), booleans, Dates (XLSX date cells) or null.

import {
  AGENDA_STATUSES,
  type AgendaStatus,
  AGENDA_MAPPABLE_FIELDS,
  type AgendaMappableField,
  AGENDA_REQUIRED_MAPPABLE_FIELDS,
  type AgendaColumnMapping,
  type InsertAgendaItem,
} from "./schema";
import { splitCsvLine } from "./agenda-csv";
import {
  getTzOffsetMinutes,
  isValidTimezone,
  DEFAULT_SCHEDULE_TIMEZONE_FALLBACK,
} from "./timezone-utils";

export type Cell = string | number | boolean | Date | null | undefined;
export type Grid = Cell[][];

// The agenda item shape produced by a mapped row (clientId + sync
// provenance are stamped by the engine).
export type MappedAgendaItem = Omit<
  InsertAgendaItem,
  "clientId" | "externalSyncConfigId" | "externalId"
>;

export interface MappedRowResult {
  /** 0-based index of this row within the data rows. */
  rowNumber: number;
  status: "ok" | "error" | "skipped";
  item?: MappedAgendaItem;
  externalId?: string;
  error?: string;
}

// ============ Cell helpers ============

export function cellToString(c: Cell): string {
  if (c == null) return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? "" : c.toISOString();
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  if (typeof c === "boolean") return c ? "true" : "false";
  return String(c);
}

function isCellEmpty(c: Cell): boolean {
  if (c == null) return true;
  if (typeof c === "string") return c.trim().length === 0;
  return false;
}

// ============ CSV → grid ============

// Parse CSV text into a grid of string cells. Fully-empty lines are
// dropped so a blank line between the header and data doesn't shift the
// row indices. Cells are trimmed by splitCsvLine.
export function parseCsvToGrid(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    rows.push(splitCsvLine(line));
  }
  return rows;
}

// ============ Header / data-row extraction ============

// Build display labels for the header row: trimmed cell text, with a
// "Column N" fallback for blanks and a numeric suffix to disambiguate
// duplicates (so the mapping can always reference a unique label).
export function buildHeaderLabels(headerRow: Cell[]): string[] {
  const seen = new Map<string, number>();
  return headerRow.map((c, i) => {
    let label = cellToString(c).trim();
    if (!label) label = `Column ${i + 1}`;
    const prev = seen.get(label);
    if (prev) {
      seen.set(label, prev + 1);
      label = `${label} (${prev + 1})`;
    } else {
      seen.set(label, 1);
    }
    return label;
  });
}

export interface ExtractedGrid {
  headers: string[];
  dataRows: Grid;
}

export function extractGrid(
  grid: Grid,
  headerRowIndex = 0,
  firstDataRowIndex?: number | null,
): ExtractedGrid {
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = buildHeaderLabels(headerRow);
  const startIdx =
    firstDataRowIndex != null && firstDataRowIndex >= 0
      ? firstDataRowIndex
      : headerRowIndex + 1;
  const dataRows = grid.slice(startIdx);
  return { headers, dataRows };
}

// ============ Auto-suggest column mapping ============

const FIELD_SYNONYMS: Record<AgendaMappableField, string[]> = {
  title: ["title", "session title", "session", "name", "event", "talk", "topic", "subject", "presentation"],
  description: ["description", "desc", "details", "abstract", "summary", "synopsis", "overview"],
  room: ["room", "location", "venue", "hall", "space", "area", "stage", "theatre", "theater"],
  track: ["track", "category", "stream", "theme", "strand", "type"],
  presenter: ["presenter", "speaker", "speakers", "host", "facilitator", "author", "presented by", "chair"],
  startsAt: ["start time", "start date", "start datetime", "starts", "start", "begin", "from", "date", "time"],
  endsAt: ["end time", "end date", "end datetime", "ends", "end", "finish", "until", "to"],
  status: ["status", "session status", "state"],
  statusMessage: ["status message", "note", "notes", "message", "remark", "comment", "comments"],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Score a header against a field's synonym list. Exact normalized match
// is strongest; substring matches are weaker and length-weighted so
// "end time" beats a stray "attendees" containing "end".
function scoreHeader(headerNorm: string, synonyms: string[]): number {
  let best = 0;
  for (const syn of synonyms) {
    const ns = norm(syn);
    if (!ns) continue;
    if (headerNorm === ns) {
      best = Math.max(best, 100 + ns.length);
    } else if (ns.length >= 3 && headerNorm.includes(ns)) {
      best = Math.max(best, 50 + ns.length);
    } else if (headerNorm.length >= 3 && ns.includes(headerNorm)) {
      best = Math.max(best, 20 + headerNorm.length);
    }
  }
  return best;
}

// Suggest a best-effort column mapping from detected headers. Every
// suggestion is overridable by the operator. Required/date fields are
// resolved first so they win contested headers, and each header is used
// at most once.
export function suggestColumnMapping(headers: string[]): AgendaColumnMapping {
  const normHeaders = headers.map((label) => ({ label, n: norm(label) }));
  const used = new Set<string>();
  const mapping: AgendaColumnMapping = {};
  const order: AgendaMappableField[] = [
    "startsAt",
    "endsAt",
    "title",
    "room",
    "track",
    "presenter",
    "status",
    "statusMessage",
    "description",
  ];
  for (const field of order) {
    let best: { label: string; score: number } | null = null;
    for (const h of normHeaders) {
      if (!h.n || used.has(h.label)) continue;
      const score = scoreHeader(h.n, FIELD_SYNONYMS[field]);
      if (score > 0 && (!best || score > best.score)) {
        best = { label: h.label, score };
      }
    }
    if (best) {
      mapping[field] = best.label;
      used.add(best.label);
    }
  }
  return mapping;
}

// ============ Status alias normalization ============

function statusKey(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

const STATUS_ALIAS_ENTRIES: Array<[string, AgendaStatus]> = [
  ["scheduled", "scheduled"],
  ["schedule", "scheduled"],
  ["confirmed", "scheduled"],
  ["planned", "scheduled"],
  ["upcoming", "scheduled"],
  ["tbc", "scheduled"],
  ["tba", "scheduled"],
  ["ok", "scheduled"],
  ["in progress", "in_progress"],
  ["inprogress", "in_progress"],
  ["live", "in_progress"],
  ["now", "in_progress"],
  ["ongoing", "in_progress"],
  ["on going", "in_progress"],
  ["started", "in_progress"],
  ["running", "in_progress"],
  ["active", "in_progress"],
  ["current", "in_progress"],
  ["delayed", "delayed"],
  ["delay", "delayed"],
  ["late", "delayed"],
  ["running late", "delayed"],
  ["postponed", "delayed"],
  ["pushed", "delayed"],
  ["behind", "delayed"],
  ["cancelled", "cancelled"],
  ["canceled", "cancelled"],
  ["cancel", "cancelled"],
  ["off", "cancelled"],
  ["dropped", "cancelled"],
  ["removed", "cancelled"],
  ["moved", "moved"],
  ["move", "moved"],
  ["relocated", "moved"],
  ["room change", "moved"],
  ["room changed", "moved"],
  ["new room", "moved"],
  ["rescheduled", "moved"],
];

const STATUS_ALIAS_MAP = new Map<string, AgendaStatus>(
  STATUS_ALIAS_ENTRIES.map(([k, v]) => [statusKey(k), v]),
);

// Map an arbitrary upstream status string to a VectorMesh status.
// Unknown / blank values default to "scheduled".
export function normalizeStatus(raw: Cell): AgendaStatus {
  if (raw == null) return "scheduled";
  const k = statusKey(cellToString(raw));
  if (!k) return "scheduled";
  const aliased = STATUS_ALIAS_MAP.get(k);
  if (aliased) return aliased;
  const asEnum = k.replace(/ /g, "_");
  if ((AGENDA_STATUSES as readonly string[]).includes(asEnum)) {
    return asEnum as AgendaStatus;
  }
  return "scheduled";
}

// ============ Date / time parsing ============

export interface DateParseOptions {
  timezone: string;
  /** "uk" (d/m/y, default), "us" (m/d/y), or "iso". */
  dateFormatHint?: string | null;
}

// Convert wall-clock components observed in `tz` into a UTC instant.
// Two-pass offset convergence handles the DST cases well enough for
// agenda parsing (the heavier walker lives in timezone-utils for
// schedule firing).
function wallPartsToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): number {
  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const off1 = getTzOffsetMinutes(new Date(targetWallMs), tz);
  let utc = targetWallMs - off1 * 60_000;
  const off2 = getTzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off1) {
    utc = targetWallMs - off2 * 60_000;
  }
  return utc;
}

// Excel stores dates as serial days since 1899-12-30. 25569 is the day
// count between that epoch and the Unix epoch. Conference dates are far
// past serial 60 so the 1900 leap-year bug is irrelevant. The serial's
// wall-clock components are interpreted in the configured timezone.
function excelSerialToDate(serial: number, tz: string): Date | null {
  if (!Number.isFinite(serial)) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  const base = new Date(ms);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(
    wallPartsToUtcMs(
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      tz,
    ),
  );
}

const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const ISO_LOCAL = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const SLASH_DATE =
  /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([aApP][mM])?$/;

// Parse a single cell into an absolute Date, or null if unparseable.
// Handles: JS Date cells, Excel serial numbers, ISO-8601 (with or
// without offset), and slash/dot/dash dates (UK d/m/y by default, US
// m/d/y via hint, with day/month auto-detected when one part > 12).
export function parseAgendaDate(value: Cell, opts: DateParseOptions): Date | null {
  const tz =
    opts.timezone && isValidTimezone(opts.timezone)
      ? opts.timezone
      : DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;

  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      wallPartsToUtcMs(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate(),
        value.getUTCHours(),
        value.getUTCMinutes(),
        value.getUTCSeconds(),
        tz,
      ),
    );
  }

  if (typeof value === "number") {
    return excelSerialToDate(value, tz);
  }

  if (typeof value === "boolean") return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Numeric string that is actually an Excel serial (e.g. "45809.5").
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    // Plausible serial range: ~1970 (25569) to far future (~2200).
    if (n > 20000 && n < 120000) return excelSerialToDate(n, tz);
  }

  if (ISO_WITH_TZ.test(raw)) {
    const d = new Date(raw.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = ISO_LOCAL.exec(raw);
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso;
    const month = +mo;
    const day = +d;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(wallPartsToUtcMs(+y, month, day, +(h || 0), +(mi || 0), +(s || 0), tz));
  }

  const slash = SLASH_DATE.exec(raw);
  if (slash) {
    const [, aStr, bStr, yrStr, hStr, miStr, sStr, ap] = slash;
    const a = +aStr;
    const b = +bStr;
    const hint = (opts.dateFormatHint || "").toLowerCase();
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else if (hint === "us") {
      month = a;
      day = b;
    } else {
      // UK / iso default: day first.
      day = a;
      month = b;
    }
    let year = +yrStr;
    if (year < 100) year += 2000;
    let hour = hStr ? +hStr : 0;
    const minute = miStr ? +miStr : 0;
    const second = sStr ? +sStr : 0;
    if (ap) {
      const pm = /p/i.test(ap);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
      return null;
    }
    return new Date(wallPartsToUtcMs(year, month, day, hour, minute, second, tz));
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

// Render a raw cell value as a readable date/time in the configured
// timezone (e.g. "4 Jun 2026, 09:00"). Handles Excel serial numbers and
// ISO timestamps via parseAgendaDate; returns the raw text unchanged when
// the value isn't a recognisable date. The clock time is omitted when the
// value lands on local midnight (a date-only value) — checked in the
// target timezone, NOT UTC, so DST-shifted instants are classified right.
export function formatReadableAgendaDate(raw: string, opts: DateParseOptions): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const tz =
    opts.timezone && isValidTimezone(opts.timezone)
      ? opts.timezone
      : DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
  const parsed = parseAgendaDate(text, { timezone: tz, dateFormatHint: opts.dateFormatHint ?? null });
  if (!parsed) return raw;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(parsed);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const hasTime = get("hour") !== "00" || get("minute") !== "00" || get("second") !== "00";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(hasTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      timeZone: tz,
    }).format(parsed);
  } catch {
    return raw;
  }
}

// ============ Split date + time combination ============
//
// Some spreadsheets keep the calendar date and the clock time in
// SEPARATE columns — and the "date" column is sometimes only a day of
// the month ("12th"). `combineDateAndTime` stitches a date cell and a
// time cell into one absolute instant, filling a day-only date from the
// operator-supplied base year/month.

export interface DateBase {
  year?: number | null;
  /** 1-12. */
  month?: number | null;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function dayFromBase(day: number, base: DateBase): DateParts | null {
  if (base.year == null || base.month == null) return null;
  if (base.month < 1 || base.month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year: base.year, month: base.month, day };
}

function excelSerialToParts(serial: number): DateParts | null {
  const ms = Math.round((Math.floor(serial) - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// Extract calendar year/month/day from a date cell. Accepts a full date
// (ISO, slash/dot/dash, Excel date serial, JS Date) OR a bare
// day-of-month ("12", "12th", "Day 12") which is completed from `base`.
export function extractDateParts(
  cell: Cell,
  opts: DateParseOptions,
  base: DateBase,
): DateParts | null {
  if (cell == null) return null;

  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return { year: cell.getUTCFullYear(), month: cell.getUTCMonth() + 1, day: cell.getUTCDate() };
  }

  if (typeof cell === "number") {
    if (cell > 20000 && cell < 120000) return excelSerialToParts(cell);
    if (Number.isInteger(cell)) return dayFromBase(cell, base);
    return null;
  }

  if (typeof cell === "boolean") return null;

  const raw = String(cell).trim();
  if (!raw) return null;

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 20000 && n < 120000) return excelSerialToParts(n);
  }

  const iso = ISO_LOCAL.exec(raw);
  if (iso) {
    const [, y, mo, d] = iso;
    const month = +mo;
    const day = +d;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year: +y, month, day };
  }

  const slash = SLASH_DATE.exec(raw);
  if (slash) {
    const [, aStr, bStr, yrStr] = slash;
    const a = +aStr;
    const b = +bStr;
    const hint = (opts.dateFormatHint || "").toLowerCase();
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else if (hint === "us") {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    let year = +yrStr;
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  // Day-only label: "12", "12th", "Day 12".
  const dayOnly = /^(?:day\s+)?(\d{1,2})(?:st|nd|rd|th)?$/i.exec(raw);
  if (dayOnly) return dayFromBase(+dayOnly[1], base);

  return null;
}

interface TimeParts {
  hour: number;
  minute: number;
  second: number;
}

// An Excel time is a fraction of a day (0.5 = noon). A datetime serial
// (45809.5) carries the same fraction, so take the fractional part of
// any number.
function fractionToTime(n: number): TimeParts | null {
  if (!Number.isFinite(n)) return null;
  const frac = n - Math.floor(n);
  const total = Math.round(frac * 86_400);
  return {
    hour: Math.floor(total / 3600) % 24,
    minute: Math.floor(total / 60) % 60,
    second: total % 60,
  };
}

// Extract the clock time from a time cell: an Excel fraction/serial, or
// text like "11:30", "11:30:00", "11:30 AM", "9am". Returns null when
// no time is present (caller treats that as midnight).
export function parseTimeOfDay(cell: Cell): TimeParts | null {
  if (cell == null) return null;

  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return { hour: cell.getUTCHours(), minute: cell.getUTCMinutes(), second: cell.getUTCSeconds() };
  }

  if (typeof cell === "number") return fractionToTime(cell);
  if (typeof cell === "boolean") return null;

  const raw = String(cell).trim();
  if (!raw) return null;

  if (/^\d+(?:\.\d+)?$/.test(raw)) return fractionToTime(Number(raw));

  const hm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP][mM])?$/.exec(raw);
  if (hm) {
    let hour = +hm[1];
    const minute = +hm[2];
    const second = hm[3] ? +hm[3] : 0;
    if (hm[4]) {
      const pm = /p/i.test(hm[4]);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    if (hour > 23 || minute > 59 || second > 59) return null;
    return { hour, minute, second };
  }

  const ampm = /^(\d{1,2})\s*([aApP][mM])$/.exec(raw);
  if (ampm) {
    let hour = +ampm[1];
    const pm = /p/i.test(ampm[2]);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    if (hour > 23) return null;
    return { hour, minute: 0, second: 0 };
  }

  return null;
}

// Combine a date cell and a time cell into one absolute instant. The
// date may be day-only (completed from `base`); a missing/blank time is
// treated as midnight. Returns null only when the date can't be resolved.
export function combineDateAndTime(
  dateCell: Cell,
  timeCell: Cell,
  opts: DateParseOptions,
  base: DateBase,
): Date | null {
  const dp = extractDateParts(dateCell, opts, base);
  if (!dp) return null;
  const tp = parseTimeOfDay(timeCell) ?? { hour: 0, minute: 0, second: 0 };
  const tz =
    opts.timezone && isValidTimezone(opts.timezone)
      ? opts.timezone
      : DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
  return new Date(wallPartsToUtcMs(dp.year, dp.month, dp.day, tp.hour, tp.minute, tp.second, tz));
}

// ============ Stable external id ============

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

// Priority: (1) operator-mapped external-id column value, (2) row
// number within the source, (3) content hash of title+startsAt+room.
export function buildExternalId(
  externalIdValue: string | null | undefined,
  rowNumber: number,
  item: { title: string; startsAt: Date; room: string | null },
): string {
  const v = (externalIdValue ?? "").trim();
  if (v) return v;
  if (Number.isFinite(rowNumber)) return `row-${rowNumber}`;
  return `h-${simpleHash(`${item.title}|${item.startsAt.toISOString()}|${item.room ?? ""}`)}`;
}

// ============ Apply mapping to data rows ============

export interface ApplyMappingOptions {
  headers: string[];
  mapping: AgendaColumnMapping;
  externalIdColumn?: string | null;
  timezone: string;
  dateFormatHint?: string | null;
  // Split date/time: when a time column is supplied, the corresponding
  // startsAt/endsAt mapped column provides the DATE and this column the
  // TIME. dateBaseYear/Month complete a day-only date cell ("12th").
  startTimeColumn?: string | null;
  endTimeColumn?: string | null;
  dateBaseYear?: number | null;
  dateBaseMonth?: number | null;
}

function columnIndex(headers: string[], label: string | undefined): number {
  if (!label) return -1;
  return headers.indexOf(label);
}

// Turn data rows + a column mapping into validated agenda rows. Each
// row yields a result: ok (with item + externalId), skipped (fully
// empty / no required data) or error (with a message). Never throws on
// bad data — collects per-row errors so one bad row can't sink a sync.
export function applyMapping(
  dataRows: Grid,
  opts: ApplyMappingOptions,
): MappedRowResult[] {
  const { headers, mapping } = opts;
  const idx: Record<AgendaMappableField, number> = {} as any;
  for (const f of AGENDA_MAPPABLE_FIELDS) {
    idx[f] = columnIndex(headers, mapping[f]);
  }
  const extIdx = columnIndex(headers, opts.externalIdColumn ?? undefined);
  const startTimeIdx = columnIndex(headers, opts.startTimeColumn ?? undefined);
  const endTimeIdx = columnIndex(headers, opts.endTimeColumn ?? undefined);
  const base: DateBase = {
    year: opts.dateBaseYear ?? null,
    month: opts.dateBaseMonth ?? null,
  };
  const dateOpts: DateParseOptions = {
    timezone: opts.timezone,
    dateFormatHint: opts.dateFormatHint,
  };

  const results: MappedRowResult[] = [];
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const get = (f: AgendaMappableField): Cell =>
      idx[f] >= 0 ? row[idx[f]] : undefined;

    // Skip rows where every mapped cell is empty.
    const anyMapped = AGENDA_MAPPABLE_FIELDS.some((f) => idx[f] >= 0 && !isCellEmpty(row[idx[f]]));
    if (!anyMapped) {
      results.push({ rowNumber: r, status: "skipped" });
      continue;
    }

    const title = cellToString(get("title")).trim();
    const startCell = get("startsAt");
    const endCell = get("endsAt");

    if (!title || isCellEmpty(startCell) || isCellEmpty(endCell)) {
      results.push({
        rowNumber: r,
        status: "error",
        error: "title, startsAt and endsAt are required",
      });
      continue;
    }

    // Split date/time mode: combine the date cell with a separate time
    // cell. Otherwise parse a single date+time cell as before.
    const startTimeCell = startTimeIdx >= 0 ? row[startTimeIdx] : undefined;
    const endTimeCell = endTimeIdx >= 0 ? row[endTimeIdx] : undefined;
    const startsAt =
      startTimeIdx >= 0
        ? combineDateAndTime(startCell, startTimeCell, dateOpts, base)
        : parseAgendaDate(startCell, dateOpts);
    const endsAt =
      endTimeIdx >= 0
        ? combineDateAndTime(endCell, endTimeCell, dateOpts, base)
        : parseAgendaDate(endCell, dateOpts);
    if (!startsAt || !endsAt) {
      const shown = (dateCell: Cell, timeIdx: number, timeCell: Cell): string =>
        timeIdx >= 0
          ? `${cellToString(dateCell)} ${cellToString(timeCell)}`.trim()
          : cellToString(dateCell);
      results.push({
        rowNumber: r,
        status: "error",
        error: `Could not parse start/end date (got "${shown(startCell, startTimeIdx, startTimeCell)}" / "${shown(endCell, endTimeIdx, endTimeCell)}")`,
      });
      continue;
    }
    if (!(endsAt.getTime() > startsAt.getTime())) {
      results.push({
        rowNumber: r,
        status: "error",
        error: "endsAt must be after startsAt",
      });
      continue;
    }

    const room = cellToString(get("room")).trim() || null;
    const item: MappedAgendaItem = {
      title,
      description: cellToString(get("description")).trim() || null,
      room,
      track: cellToString(get("track")).trim() || null,
      presenter: cellToString(get("presenter")).trim() || null,
      startsAt,
      endsAt,
      status: normalizeStatus(get("status")),
      statusMessage: cellToString(get("statusMessage")).trim() || null,
    };
    const externalIdValue = extIdx >= 0 ? cellToString(row[extIdx]).trim() : "";
    const externalId = buildExternalId(externalIdValue, r, { title, startsAt, room });
    results.push({ rowNumber: r, status: "ok", item, externalId });
  }
  return results;
}

// Which required fields are still unmapped. Empty array = ready to sync.
export function missingRequiredMappings(mapping: AgendaColumnMapping): AgendaMappableField[] {
  return AGENDA_REQUIRED_MAPPABLE_FIELDS.filter((f) => !mapping[f]);
}

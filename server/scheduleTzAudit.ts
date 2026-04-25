// Shared core for the tz-shift audit (Task #138). Used by both the
// CLI script (scripts/audit-schedule-blocks-tz-shift.ts, invoked from
// scripts/post-merge.sh) and the admin API route
// (GET /api/admin/schedule-blocks/tz-shift-audit).
//
// See MIGRATION-SCHEDULE-TZ-AUDIT.md for the operator-facing explanation.

import { db } from "./db";
import {
  scheduleBlocks,
  programmeVersions,
  programmes,
  events,
  clients,
  type TimeRule,
} from "../shared/schema";
import { eq, lt, and } from "drizzle-orm";
import { getTzOffsetMinutes, isValidTimezone } from "../shared/timezone-utils";

// Final merge instant of Task #137 ("Show schedule block wall-clock
// times in the site's timezone"). Anything authored before this used the
// pre-fix UTC comparison, so its HH:MM values may have been written with
// a manual offset to compensate.
export const TZ_AUDIT_DEFAULT_CUTOFF = "2026-04-25T13:45:27Z";

export interface SuspectRule {
  index: number;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  // The HH:MM the operator likely meant: stored value back-shifted by
  // the offset that was in effect at the BLOCK'S createdAt (not now),
  // so the suggestion is correct year-round and not seasonally biased.
  suggestedStartTime?: string | null;
  suggestedEndTime?: string | null;
}

export interface SuspectBlock {
  blockId: string;
  blockName: string;
  programmeName: string;
  programmeVersionId: string;
  clientId: string;
  clientName: string;
  clientTimezone: string;
  // Offset in minutes east of UTC at the moment the block was authored.
  offsetMinutes: number;
  createdAt: string | null;
  rules: SuspectRule[];
}

// Row shape produced by the SQL loader. Exported so tests (and any
// future callers) can build fixtures without touching the DB.
export interface CandidateBlockRow {
  blockId: string;
  blockName: string;
  blockTimeRules: unknown;
  blockCreatedAt: Date | null;
  programmeVersionId: string;
  programmeName: string;
  clientId: string;
  clientName: string;
  clientTimezone: string | null;
}

export function shiftHHMMByMinutes(hhmm: string, minutes: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  // The operator was COMPENSATING by SUBTRACTING the offset; to recover
  // their intended local HH:MM we ADD the offset back.
  const total = (h * 60 + mm + minutes + 24 * 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface SynthesizeOptions {
  // Optional: limit to a subset of client IDs. Used by the admin route
  // when the calling user is account-manager-scoped (so we don't reveal
  // blocks they can't see in the rest of the app). `null` / `undefined`
  // = no scoping.
  allowedClientIds?: string[] | null;
  // Fallback reference instant if a row's createdAt is missing.
  // Defaults to "now". In practice schedule_blocks.createdAt has a DB
  // default and is always set; this is purely defensive.
  fallbackInstant?: Date;
}

// Pure function: given the rows that the SQL pre-filter returned (every
// schedule block authored before the cutoff), decide which are suspects
// and compute the operator's likely-intended HH:MM. Has no I/O so it's
// trivially unit-testable.
export function synthesizeSuspects(
  rows: readonly CandidateBlockRow[],
  options: SynthesizeOptions = {},
): SuspectBlock[] {
  const allowedSet = options.allowedClientIds
    ? new Set(options.allowedClientIds)
    : null;
  const fallbackInstant = options.fallbackInstant ?? new Date();
  const suspects: SuspectBlock[] = [];

  for (const row of rows) {
    if (allowedSet && !allowedSet.has(row.clientId)) continue;
    const tz = row.clientTimezone;
    if (!tz || tz === "UTC" || !isValidTimezone(tz)) continue;
    // Use the offset that was in effect WHEN THE BLOCK WAS AUTHORED.
    // That's what the operator was compensating for under the old UTC
    // comparison, so it's the correct delta to add back to recover
    // their intended local HH:MM. Using "now" instead would silently
    // drop blocks during the off-DST half of the year (e.g. London in
    // winter).
    const referenceInstant = row.blockCreatedAt ?? fallbackInstant;
    const offsetMinutes = getTzOffsetMinutes(referenceInstant, tz);
    // If the offset at authoring time was zero (e.g. an operator on
    // Europe/London who wrote the block in winter while GMT == UTC),
    // there was no compensation to undo. Skip — these blocks are
    // already correct under the post-fix evaluator.
    if (offsetMinutes === 0) continue;

    const timeRules: TimeRule[] = Array.isArray(row.blockTimeRules)
      ? (row.blockTimeRules as TimeRule[])
      : [];
    const suspectRules: SuspectRule[] = [];
    timeRules.forEach((rule, index) => {
      if (!rule || (!rule.startTime && !rule.endTime)) return;
      suspectRules.push({
        index,
        startTime: rule.startTime,
        endTime: rule.endTime,
        startDate: rule.startDate,
        endDate: rule.endDate,
        daysOfWeek: rule.daysOfWeek,
        suggestedStartTime: rule.startTime
          ? shiftHHMMByMinutes(rule.startTime, offsetMinutes)
          : undefined,
        suggestedEndTime: rule.endTime
          ? shiftHHMMByMinutes(rule.endTime, offsetMinutes)
          : undefined,
      });
    });
    if (suspectRules.length === 0) continue;

    suspects.push({
      blockId: row.blockId,
      blockName: row.blockName,
      programmeName: row.programmeName,
      programmeVersionId: row.programmeVersionId,
      clientId: row.clientId,
      clientName: row.clientName,
      clientTimezone: tz,
      offsetMinutes,
      createdAt: row.blockCreatedAt ? row.blockCreatedAt.toISOString() : null,
      rules: suspectRules,
    });
  }

  return suspects;
}

export interface FindSuspectBlocksOptions extends SynthesizeOptions {
  cutoffIso?: string;
}

// Loader: runs the SQL pre-filter then hands rows to the pure analyzer.
export async function findSuspectBlocks(
  options: FindSuspectBlocksOptions = {},
): Promise<SuspectBlock[]> {
  const cutoffIso = options.cutoffIso ?? TZ_AUDIT_DEFAULT_CUTOFF;
  const cutoff = new Date(cutoffIso);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(
      `tz-shift-audit cutoff is not a valid ISO timestamp: ${cutoffIso}`,
    );
  }

  // Schedule blocks join: schedule_blocks -> programme_versions ->
  // programmes -> events -> clients. Client tz is what the post-#137
  // evaluator uses, so it's the right one to back-compute the
  // operator's intended wall clock.
  const rows = await db
    .select({
      blockId: scheduleBlocks.id,
      blockName: scheduleBlocks.name,
      blockTimeRules: scheduleBlocks.timeRules,
      blockCreatedAt: scheduleBlocks.createdAt,
      programmeVersionId: scheduleBlocks.programmeVersionId,
      programmeName: programmes.name,
      clientId: clients.id,
      clientName: clients.name,
      clientTimezone: clients.timezone,
    })
    .from(scheduleBlocks)
    .innerJoin(
      programmeVersions,
      eq(programmeVersions.id, scheduleBlocks.programmeVersionId),
    )
    .innerJoin(programmes, eq(programmes.id, programmeVersions.programmeId))
    .innerJoin(events, eq(events.id, programmes.eventId))
    .innerJoin(clients, eq(clients.id, events.clientId))
    .where(and(lt(scheduleBlocks.createdAt, cutoff)));

  return synthesizeSuspects(rows, options);
}

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
  // the client's current UTC offset.
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
  offsetMinutes: number;
  createdAt: string | null;
  rules: SuspectRule[];
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

export interface FindSuspectBlocksOptions {
  cutoffIso?: string;
  now?: Date;
  // Optional: limit to a subset of client IDs. Used by the admin route
  // when the calling user is account-manager-scoped (so we don't reveal
  // blocks they can't see in the rest of the app).
  allowedClientIds?: string[] | null;
}

export async function findSuspectBlocks(
  options: FindSuspectBlocksOptions = {},
): Promise<SuspectBlock[]> {
  const cutoffIso = options.cutoffIso ?? TZ_AUDIT_DEFAULT_CUTOFF;
  const now = options.now ?? new Date();
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

  const allowedSet = options.allowedClientIds
    ? new Set(options.allowedClientIds)
    : null;
  const suspects: SuspectBlock[] = [];

  for (const row of rows) {
    if (allowedSet && !allowedSet.has(row.clientId)) continue;
    const tz = row.clientTimezone;
    if (!tz || tz === "UTC" || !isValidTimezone(tz)) continue;
    const offsetMinutes = getTzOffsetMinutes(now, tz);
    if (offsetMinutes === 0) continue; // Identical to UTC right now (e.g. London winter).

    const timeRules: TimeRule[] = Array.isArray(row.blockTimeRules)
      ? row.blockTimeRules
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

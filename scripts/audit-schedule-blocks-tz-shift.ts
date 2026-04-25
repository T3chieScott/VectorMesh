// Audit report: schedule blocks that may have been authored under the
// pre-Task-#137 UTC assumption.
//
// Background, definitions, and the suggested-shift formula all live in
// server/scheduleTzAudit.ts. This file is the CLI front-end: it prints
// a human-readable table to stdout. Read-only — no DB writes.
//
// Usage:
//   tsx scripts/audit-schedule-blocks-tz-shift.ts
//   TZ_AUDIT_CUTOFF=2026-04-25T13:45:27Z tsx scripts/audit-schedule-blocks-tz-shift.ts
//
// Exit codes:
//   0  Always (informational). Failures (DB unreachable, bad cutoff)
//      print to stderr and exit 1.
//
// See MIGRATION-SCHEDULE-TZ-AUDIT.md for the operator-facing context.

import {
  findSuspectBlocks,
  formatOffset,
  TZ_AUDIT_DEFAULT_CUTOFF,
} from "../server/scheduleTzAudit";

async function main() {
  const cutoff = process.env.TZ_AUDIT_CUTOFF || TZ_AUDIT_DEFAULT_CUTOFF;
  const now = new Date();
  console.log(
    `[tz-shift-audit] Cutoff: ${cutoff}  | Evaluation instant: ${now.toISOString()}`,
  );
  const suspects = await findSuspectBlocks({ cutoffIso: cutoff, now });
  if (suspects.length === 0) {
    console.log(
      "[tz-shift-audit] No suspect schedule blocks found. (Either no pre-cutoff blocks exist, or all owning clients are currently on UTC offset 0.)",
    );
    return;
  }
  console.log(
    `[tz-shift-audit] Found ${suspects.length} suspect block(s). Review each in the Schedule editor and decide whether the displayed HH:MM is what the operator intended; if not, shift it to the suggested value.`,
  );
  console.log("");
  for (const s of suspects) {
    console.log(
      `Block ${s.blockId}  "${s.blockName}"  | Programme: ${s.programmeName}  | Client: ${s.clientName} (${s.clientTimezone}, ${formatOffset(s.offsetMinutes)})  | Created: ${s.createdAt ?? "?"}`,
    );
    for (const r of s.rules) {
      const cur = `${r.startTime ?? "??"}–${r.endTime ?? "??"}`;
      const sug = `${r.suggestedStartTime ?? "??"}–${r.suggestedEndTime ?? "??"}`;
      console.log(`    rule[${r.index}] stored ${cur}  -> likely meant ${sug}`);
    }
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[tz-shift-audit] FAILED:", err);
    process.exit(1);
  });

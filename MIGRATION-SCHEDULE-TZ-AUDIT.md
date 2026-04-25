# Schedule Block Timezone Audit (Task #138)

This document explains the one-off audit that ships alongside the
Task #137 timezone fix. Read this if any of the following apply:

- A site reports that schedule blocks are now firing one or two hours
  earlier (or later) than they used to.
- You're rolling out the fix to a new install and want to know which
  existing blocks need a human review.
- You want to understand the audit script that runs as part of every
  post-merge deploy.

## What changed

**Before Task #137:** the schedule-block evaluator compared a block's
`time_rules[].startTime` / `endTime` HH:MM strings to the server's UTC
clock. To make a block fire at "14:00 London time" during BST, the
operator had to enter `13:00` to compensate for the +1h offset.

**After Task #137:** HH:MM is interpreted in the **client's**
timezone (`clients.timezone`, default `Europe/London`). `13:00` now
means 13:00 wall-clock at that site — which is `12:00 UTC` in summer.

This means that any block authored on a non-UTC client **before** the
fix was likely written with a manual offset baked in. Once the fix is
live those blocks may now fire 1h (or however many hours of offset)
earlier than the operator originally intended.

We deliberately **do not** auto-rewrite anyone's schedules — operators
may have already corrected, retired, or re-purposed the blocks, and
silently shifting times would cause more incidents than it fixes. The
audit just surfaces the candidates.

> **This is a heuristic, not gospel.** The audit assumes the operator
> was compensating for the offset that was in effect **at the moment
> they authored the block** (the block's `createdAt`). That's the
> usual case, but an operator who deliberately wrote a block far in
> advance for a different season — or who edited a block authored
> earlier without changing its `createdAt` — may not match the
> heuristic. Always confirm with the site owner before changing a
> stored time.

## How to run the audit

### From the deployed server (CLI)

The audit runs automatically at the end of every `scripts/post-merge.sh`
invocation as an informational step. To re-run on demand:

```bash
npx tsx scripts/audit-schedule-blocks-tz-shift.ts
```

Override the cutoff (for example, if the fix was reverted and re-landed):

```bash
TZ_AUDIT_CUTOFF=2026-04-25T13:45:27Z npx tsx scripts/audit-schedule-blocks-tz-shift.ts
```

The script is read-only. It exits 0 even when it finds suspect blocks
— this is informational only and must never block a deploy.

### From the admin UI / API

Admins and account managers can hit:

```
GET /api/admin/schedule-blocks/tz-shift-audit
```

Optional query parameter `?cutoff=ISO` overrides the default. The
response is JSON:

```json
{
  "cutoff": "2026-04-25T13:45:27Z",
  "evaluatedAt": "2026-05-01T09:00:00.000Z",
  "count": 3,
  "suspects": [
    {
      "blockId": "…",
      "blockName": "Lunch loop",
      "programmeName": "Main",
      "clientId": "…",
      "clientName": "London Site",
      "clientTimezone": "Europe/London",
      "offsetMinutes": 60,
      "createdAt": "2025-08-12T10:00:00.000Z",
      "rules": [
        {
          "index": 0,
          "startTime": "11:00",
          "endTime": "13:00",
          "suggestedStartTime": "12:00",
          "suggestedEndTime": "14:00"
        }
      ]
    }
  ]
}
```

Account-manager scoping is applied: callers only see suspects for
clients they already have access to.

## Reading the output

For each suspect block the script / endpoint reports:

- **stored** — the HH:MM currently in the database. Post-fix, this is
  what the player will use (interpreted in the client's tz).
- **likely meant** — the stored HH:MM **plus** the UTC offset that was
  in effect on the client's timezone at the moment the block was
  authored (`createdAt`). This is the operator's probable original
  intent: the wall-clock time they were typing in to overcome the old
  UTC comparison. Using the authoring-time offset (rather than the
  current offset) keeps the suggestion correct year-round, even when
  the audit is re-run during the off-DST half of the year.

Examples (London block authored in summer, BST = +60):

| stored | likely meant | Interpretation |
| ------ | ------------ | -------------- |
| 13:00–14:00 | 14:00–15:00 | Operator likely meant 14:00–15:00 local; the block now fires at 13:00 local. |
| 09:00–11:00 | 10:00–12:00 | Operator likely meant 10:00 start. |

## What to do with the report

1. Open each suspect block in the schedule editor.
2. Confirm with the site owner what the wall-clock window should be.
3. If the stored HH:MM is wrong, change it in the editor — the post-fix
   evaluator will then interpret the new value correctly.

If the suspect list is large, prioritise blocks whose rules cross
business-critical windows (open / close, peak hours).

## Caveats

- The "likely meant" suggestion uses the **authoring-time** UTC offset
  for the client's timezone (looked up from `clients.timezone` at the
  block's `createdAt`). The usual case is that the operator typed the
  HH:MM during the same DST period they wanted the block to play in;
  if they instead wrote a block far in advance for a different season,
  or edited an existing block without changing its `createdAt`, the
  suggestion may be off by one hour. Always confirm with the site
  owner before changing a stored time.
- Blocks whose owning client is on UTC, or whose authoring-time offset
  was zero (e.g. London in winter), are not flagged because the old and
  new behaviour produce the same result for them.
- The audit only inspects `time_rules` entries that have a `startTime`
  or `endTime`. Rules that were date-only or day-of-week only are
  unaffected by the fix and are not reported.

---
name: agenda session dedup
description: Why agenda display collapses rows by session, and the status-merge gotcha
---

# Agenda per-speaker duplicate rows

Some agenda feeds (per-speaker spreadsheets) emit ONE ROW PER PARTICIPANT —
every speaker/moderator/panellist of a session is its own row sharing the same
title/time/room. With no externalId column mapped, each becomes a distinct
`agenda_items` row, so the display shows the same session many times.

**Fix lives in `shared/agenda-resolver.ts` → `dedupeAgendaSessions()`**, called at
the top of `resolveAgendaItems()` so preview, the public display endpoint, and
on-screen rendering all collapse identically. Session identity =
`(clientId, title, startsAt, endsAt, room)`; distinct presenters are joined ", ".

**Why:** an unconditional, lossy presentation transform is correct here because
duplicate cards for one session are never wanted on a display. If a future use
case needs distinct rows with identical title/time/room, make it opt-in.

**Gotcha — status merge precedence must cover EVERY value in `AGENDA_STATUSES`.**
The merge picks a base row by status priority. The first version omitted
`in_progress`, so a live session merged with a scheduled row got downgraded to
`scheduled` (unknown statuses fall to 0, below scheduled). Keep
`SESSION_STATUS_PRIORITY` in lockstep with `AGENDA_STATUSES`
(cancelled>moved>delayed>in_progress>scheduled).

**Related operator-config trap (not a code bug):** if `presenter` is mapped to a
"Speaker Role" column, the card shows roles ("Moderator, Speaker") not names.
Operator should map presenter to the person-name column.

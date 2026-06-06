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
`(clientId, title, startsAt, endsAt, room)`. Distinct presenters are joined with
a NEWLINE (one speaker per line) so the display card lists everyone vertically
and grows to fit; the widget renders presenter text with `whitespace-pre-line`.
Each speaker string can carry a trailing ", Company" (composed at sync time in
`applyMapping`, see below). If you change this separator, update the widget
render (pre-line) and the resolver tests in lockstep.

**Why:** an unconditional, lossy presentation transform is correct here because
duplicate cards for one session are never wanted on a display. If a future use
case needs distinct rows with identical title/time/room, make it opt-in.

**Gotcha — status merge precedence must cover EVERY value in `AGENDA_STATUSES`.**
The merge picks a base row by status priority. The first version omitted
`in_progress`, so a live session merged with a scheduled row got downgraded to
`scheduled` (unknown statuses fall to 0, below scheduled). Keep
`SESSION_STATUS_PRIORITY` in lockstep with `AGENDA_STATUSES`
(cancelled>moved>delayed>in_progress>scheduled).

**Multi-day ordering looks wrong without a date.** The display is sorted purely
by start time, so a multi-day agenda is correctly chronological but *looks* out
of order when only HH:MM is shown (e.g. day-1 16:30 sitting above day-2 10:30).
The widget therefore auto-shows a compact per-card date whenever the resolved
items span more than one calendar day *in the display timezone* (single-day
agendas stay clean). **Why:** users read this as a sort bug. **How to apply:**
keep the multi-day detection and the date formatter on the SAME tz fallback
(UTC when no tz) or the day-split decision and the printed date can disagree.

**Related operator-config trap (not a code bug):** if `presenter` is mapped to a
"Speaker Role" column, the card shows roles ("Moderator, Speaker") not names.
Operator should map presenter to the person-name column.

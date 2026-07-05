---
name: Sweepstake World Cup progression engine
description: Invariants for auto-tracking who's in/out and building the knockout bracket in the sweepstake widget.
---

# Sweepstake progression invariants

The World Cup sweepstake widget derives standings, eliminations, knockout-slot
resolution and the bracket from the stored teams + matches.

## Eliminations are additive and must be provable
Results can only move a team OUT, never revive one (except the champion, handled
by the winner branch). A human hand-elimination must stick. These flags are
**persisted**, so a wrong elimination is permanent until manually fixed.

**Why:** the whole point of the feature was that the widget kept showing all
teams "in". Over-eliminating is worse than under-eliminating.

## Third-place cut must NOT trust partial knockout feeds
The best-third cut infers the first knockout round size from stored KO fixtures
(max matches in any KO stage × 2). If the provider hasn't published every
first-round fixture yet, that count is too small and the cut eliminates
qualifying thirds — permanently.

**How to apply:** only run the third-place cut when the inferred first-round slot
count is a power of two, seats every group's two auto-qualifiers, and leaves no
more advancing thirds than there are groups. Otherwise leave all thirds in.

## Placeholder resolution is display-only
"1st Group C" style slots are resolved to real teams **only in the display
payload** (never persisted) and **only when that group is complete**. "Winner
Match NN" slots are left for the upstream provider. Local resolution only ever
replaces a placeholder-form name (never a real one), so it never fights a later
provider sync.

## Cross-group "3rd Group X/Y/Z" slots use the FIFA Annex C table
Cross-group third-place placeholders ARE resolved locally now, via the official
495-row FIFA World Cup 2026 Annex C allocation table (`server/thirdPlaceAllocation.ts`).
Mechanics: the slot's own candidate-group set uniquely identifies which R32
winner column it is (the 8 sets are distinct); the set of 8 qualifying third
groups (`DerivedProgression.qualifyingThirdGroups`) picks the Annex C row;
together they name the exact group whose 3rd-placed team fills the slot.
**Only** fires for the exact 48-team format (12 groups, 8 advancing thirds,
trusted capacity) — `qualifyingThirdGroups` is null otherwise, so Euro/32-team
cups are unaffected. The qualifying set reuses the same points→GD→GF ranked cut
as elimination (we lack FIFA's conduct-score/world-ranking tiebreakers), so a
tie broken differently upstream self-corrects once the provider fills real names.

## Group vs knockout classification
A match is group-stage if it has a non-empty `groupName` OR its stage text
contains "group". Filter the bracket on `groupName` too — some feeds label group
fixtures with a stage that omits the word "group" (e.g. "Matchday 1").

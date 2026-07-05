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
payload** (never persisted) and **only when that group is complete**. Cross-group
"3rd Group A/B/C…" and "Winner Match NN" slots are left for the upstream provider
to fill, so local resolution never fights a later provider sync.

## Group vs knockout classification
A match is group-stage if it has a non-empty `groupName` OR its stage text
contains "group". Filter the bracket on `groupName` too — some feeds label group
fixtures with a stage that omits the word "group" (e.g. "Matchday 1").

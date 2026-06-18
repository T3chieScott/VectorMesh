---
name: Sweepstake rotation deck auto-advance timer
description: Pitfalls in the single shared timer that pages within a slide and rotates between slides.
---

# Sweepstake rotation deck auto-advance timer

The sweepstake display deck (`SweepstakeDisplayWidget`) uses ONE `setTimeout`
effect to both page WITHIN the active slide and rotate BETWEEN slides. Three
non-obvious rules keep it alive:

1. **A single slide can still have multiple pages.** Do NOT bail the timer on
   `slides.length <= 1`. A config that enables only the fixtures ("Playing
   today") slide is one slide but pages when there are >3 matches. Bailing on
   `<= 1` silently freezes paging; only gate on `=== 0` (nothing to show).

2. **The timer must re-arm when the active slide's page count changes.** The
   page count is held in a ref (`pageCountRef`, read synchronously by `advance`
   at fire time) but ALSO mirrored into state so it can be an effect dependency.
   Without the state, a slide that starts at 1 page and later grows to 2 (live
   data refresh adding matches) never reschedules and never starts paging.

3. **Depend on STABLE PRIMITIVES, not the polled data object.** The live zone
   widget (`SweepstakeConfigZoneWidget`) re-fetches on a poll and hands a fresh,
   equal-but-new `data` object every cycle, which rebuilds an equal-but-new
   `activeItem` each render. If the timer effect depends on the `activeItem`
   OBJECT, every poll resets the countdown; when the poll interval is shorter
   than the rotation interval the timer never fires and rotation starves. Depend
   on `activeItem.key` / `.kind` / media `.mediaType` / `.durationSeconds`
   (primitives compared by value) and read the object via closure.

**Why:** Operator reported the "Playing today" slide not auto-switching pages —
root cause was rule 1; rules 2 and 3 are adjacent liveness traps surfaced in
review.

**How to apply:** Any change to the deck's advance/timer logic must preserve all
three. Full-screen media VIDEO slides are intentionally NOT timed here — they
advance from `MediaSlide`'s `ended`/`error`/safety path; never add a timer path
that could double-advance them.

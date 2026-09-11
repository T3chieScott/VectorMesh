---
name: Agenda widget auto-fit pagination
description: Rules for measured Agenda pagination, authored dimensions, and atomic controlled activation plans.
---

The Agenda Display Widget paginates card layouts (portrait / landscape /
ultrawide) by **measuring** real card heights, not by a fixed
`maxItemsPerPage`. It renders every card off-screen (hidden div at the real
per-column width), records each height via `useLayoutEffect`, then packs pages
with the pure packer. The authored `maxItemsPerPage` is a hard upper bound after
variable-height fitting, including multi-column and semantic NOW/NEXT pages;
totem / room-door layouts remain unpaginated.

**Cross-surface rule:** Scene Builder, direct preview, Simulator, Player, and
Monitor must measure and pack pages in one canonical coordinate system:
`canonicalHeight = 720` and
`canonicalWidth = 720 * authoredWidth / authoredHeight`. Normalize the available
content box into those coordinates and render only the hidden card measurer at
the canonical card width and typography scale. Visible rendering still uses the
host's physical logical surface and may then be scaled for its panel.

**Why:** authored-size and preview-size surfaces with the same aspect ratio can
still produce different card heights because typography scales while fixed CSS
padding does not. Aspect ratio alone therefore does not make physical-space
measurement scale-invariant.

**How to apply:** derive the canonical aspect from the widget's outer border
box (or explicit authored dimensions), not `ResizeObserver.contentRect`, which
excludes root padding. Use canonical height for both Full Agenda and measured
semantic NOW/NEXT packing. Keep canonical scale out of every visible layout.

**Controlled-activation rule:** freeze and publish one page model only after
fonts settle and card measurements match the current font revision. Rendering,
page denominator, dwell timing, reporting, and completion must all consume that
same frozen model.

**Why:** freezing fallback-font measurements while displaying or reporting a
later live measurement produced impossible mixed states such as page 8/5.

**How to apply:** any new pagination callback or playlist authority must wait
for settled measurement and use the activation's frozen pages, not a separate
live page count.

**Why packing reserves a trailing gap (`h + rowGap` per card):** portrait uses
flex `gap` (between cards only) but multi-column `ColumnFlow` puts `mb-3` after
*every* card. Counting a trailing gap on every card never under-counts real
spacing, so the packer errs toward leaving slack rather than clipping the last
card. That is the whole point of the feature — last card must never be cut off.

**Two measurement gotchas that caused real clipping (both fixed):**
1. *Custom web fonts load async.* Measuring before the font swaps in uses the
   shorter fallback font → packer overcounts → last card clips. A font swap is
   a browser repaint, not a React render, so nothing re-measures on its own.
   Fix: a `fontTick` bumped on `document.fonts.ready` + `loadingdone` forces a
   re-measure. Any height-measuring widget with custom fonts needs this.
2. *Transform scaling.* Measure card height with `offsetHeight` (layout px,
   transform-independent), NOT `getBoundingClientRect().height` (returns the
   *scaled* height under a `transform: scale()` ancestor — zone / device
   previews). It must match the `ResizeObserver` content box, which is also
   unscaled layout px. Mixing the two makes the packer overcount and clip.

**Known limitation — column count in embedded contexts:** `numCols` can still
diverge from a viewport-driven responsive column class inside a nested preview.
Canonical geometry makes page membership independent of panel size, but it does
not change how responsive classes select a column count. If exact nested-preview
fit ever matters, derive the column count from computed style.

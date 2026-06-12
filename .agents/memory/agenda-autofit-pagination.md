---
name: Agenda widget auto-fit pagination
description: How the Agenda Display Widget decides cards-per-page by measuring, and its known column-count limitation.
---

The Agenda Display Widget paginates card layouts (portrait / landscape /
ultrawide) by **measuring** real card heights, not by a fixed
`maxItemsPerPage`. It renders every card off-screen (hidden div at the real
per-column width), records each height via `useLayoutEffect`, then packs pages
with the pure `packAgendaPages(items, heights, availableHeight, numCols, rowGap)`
in `shared/agenda-resolver.ts`. `maxItemsPerPage` is only a pre-measurement
fallback for card layouts; totem / room_door ignore pagination entirely (they
consume the full `items` list).

**Why packing reserves a trailing gap (`h + rowGap` per card):** portrait uses
flex `gap` (between cards only) but multi-column `ColumnFlow` puts `mb-3` after
*every* card. Counting a trailing gap on every card never under-counts real
spacing, so the packer errs toward leaving slack rather than clipping the last
card. That is the whole point of the feature — last card must never be cut off.

**Known limitation — column count in embedded contexts:** `numCols` for
ultrawide is inferred from `measured.w >= 1280`, but the actual rendered columns
come from Tailwind's `xl:columns-4` which keys off the *viewport*, not the
element. On a full-screen display these agree; inside a smaller nested preview
they can diverge, making the measured card width (and thus fit) slightly off —
usually conservative (fewer cards), never a hard break. If exact fit in nested
previews ever matters, derive column count from computed style instead.

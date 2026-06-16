---
name: Signage widget container-relative sizing
description: Full-screen signage display widgets must size with container-query units, not viewport units, so they scale inside embedded preview/zone boxes.
---

A signage display widget that renders full-screen (its root fills `fixed inset-0`)
must NOT size itself with viewport units (`vmin`/`vw`/`vh`). Those resolve against
the browser viewport even when the widget is embedded in a small box, so the same
component looks correct full-screen but overflows/clips when shown in a smaller
container.

The widget is embedded in at least three surfaces with different box sizes:
- the public chromeless display page (`fixed inset-0` = viewport),
- the admin interactive preview dialog (a `max-w-*` `aspect-video` box),
- the layout-editor sweepstake zone (a `w-full h-full` zone of arbitrary size).

**Rule:** size everything with container-query length units (`cqmin`, etc.) and
wrap the widget root in an element with `containerType: "size"` (width/height
100%). `cqmin` then resolves against that wrapper's box, so the widget scales to
whatever container embeds it. Full-screen looks identical (container == viewport),
and embedded boxes scale down correctly.

**Why:** viewport-unit sizing was the cause of the "preview and builder show the
same unformatted layouts" report — both embedded surfaces overflowed because text
and grid cards were sized to the viewport, not the box.

**How to apply:** for the sweepstake widget this is
`client/src/components/sweepstake/SweepstakeDisplayWidget.tsx`. React serializes
the `containerType` style key to `container-type`. This mirrors the codebase's
HTML-widget approach (fixed reference canvas + scale) documented in `replit.md`.

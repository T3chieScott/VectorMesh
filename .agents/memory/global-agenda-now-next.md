---
name: Global Agenda NOW/NEXT
description: Required separation between global sequence diagnostics and bounded playback when synchronized source data later becomes invalid.
---

Global Agenda validation must retain the complete effectively filtered sequence
so operators can diagnose every overlap and malformed session. Playback must
independently exclude malformed or non-positive-duration rows and always emit
at most one NOW plus one session whose start is strictly after the effective
current instant as NEXT. Stable NOW selection is start time, room, title, then
ID; do not discard an entire room.

**Why:** a configuration can be valid when saved and later receive conflicting
source data through synchronization. Returning the complete sequence as a
fallback can display multiple simultaneous NOW sessions and mislabel an
already-running conflict as NEXT.

**How to apply:** keep save-time/API diagnostics comprehensive, but never use
validation failure as a reason for the display resolver to bypass bounded
global selection. Per-room behavior remains unchanged when global mode is off.
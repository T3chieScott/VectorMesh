---
name: Scene vs Layout naming
description: The UI says "Scene" but all code/data/routes still say "layout" — and a second unrelated "layout" concept exists.
---

# "Scene" (UI) maps to "layout" (code)

The user-facing feature is labelled **Scene / Scenes** in the UI and the
operating manual. Everything in code keeps the original name **layout**:
routes (`/layouts`, `/api/layout-templates`, `/api/layouts`), query keys
(`["/api/layouts"]`), types/vars (`LayoutsPage`, `layoutId`,
`layoutTemplateId`, `type Layout`), `data-testid`s, and internal
discriminator string values (`type="layout"`, `itemType==="layout"`,
`kind:"missing-layout"`).

**Why:** the rename was display-text only; renaming identifiers/routes
would be a large, risky refactor with no functional benefit.

**How to apply:** when a user talks about "Scenes", they mean the layout
feature. Change only visible strings if asked to adjust wording; never
rename the code identifiers, routes, query keys, testids, or discriminators.

## Naming collision — a SECOND "layout"
There is an unrelated agenda concept also called "layout": the agenda
display **mode/orientation** (`layoutMode`, values
`auto/split/single-room` and orientation `portrait/landscape/totem/
room_door/ultrawide`) in `agenda-configs.tsx` and `AgendaDisplayWidget`.
This is NOT the Scene feature and must stay labelled "Layout" in the UI.
A blanket layout→scene replacement will wrongly hit it (it did once and
had to be reverted in the agenda config "Layout — Auto/Split/Single Room"
setting). Always exclude agenda `layoutMode`/orientation from any
Scene-rename sweep.

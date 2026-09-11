---
name: Scene typography scaling
description: Rules for keeping configured scene text proportional across Builder, Simulator, Player, Monitor, and canvas screens
---

## Rule
Configured scene font sizes are authored against the Scene Builder's 720px-high logical surface. Rendering hosts must scale resolved numeric sizes by `effective zone-frame height / 720`.

Legacy named sizes must be resolved to their authoring-pixel values before applying the scale. Agenda and HTML widgets keep their own sizing systems and must not receive this scale.

**Why:** Runtime hosts use profile- or canvas-sized logical surfaces. Passing authored pixels unchanged makes text proportionally smaller at larger resolutions. Using the outer capture height is also wrong when a canvas capture contains a profile-sized scene.

**How to apply:** Use canvas height only for canvas-spanning scenes; otherwise use the profile or tile height. Thread the scale through stable frame props without adding it to frame, video, media, or subframe identity keys.
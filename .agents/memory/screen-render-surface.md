---
name: Shared screen render surface (Player + Monitor unification)
description: ScreenRenderSurface component and the profile-dimensions logical surface shared by Player and Monitor
---

## Rule
Both Player and Monitor use **profile dimensions** (e.g. 1920×1080) as the logical screen surface — not REFERENCE_HEIGHT=720 and not `getAspectRatioDimensions()` ratio units.

- Player: `captureW = canvasEnabled ? canvasW : playerScreenW`  (was `trueWidth = REFERENCE_HEIGHT * aspectRatio`)
- Monitor: `viewportW = monitorScreenW` always  (was `canvasEnabled ? monitorScreenW : layoutAspect.width`, where `layoutAspect.width` for "16:9" is 16 not 1920)

**Why:** `getAspectRatioDimensions("16:9")` returns `{width:16, height:9}` (ratio units), not pixels. The Monitor was using these as pixel viewport dimensions, producing a ~120× CSS scale and near-zero HTML widget scale (16/1920 ≈ 0.008). Canvas screens (which use custom aspect ratios) happened to work correctly because custom returns actual pixel dims.

**How to apply:**
- Any new rendering host must use `profile.width / profile.height` (not `layoutAspect.width/height`) as the logical surface for non-canvas screens.
- Canvas screens: Player uses full canvas as capture; Monitor uses profile (screen crop). The zone-frame offset (-canvasX, -canvasY) reconciles the difference.
- `ScreenRenderSurface` (`client/src/components/screen-render-surface.tsx`) is the shared component — zone frame + zones.map + ZoneRenderer. Both player.tsx and monitor.tsx use it.
- Player passes `deviceToken`; Monitor leaves it undefined (cookie auth instead).
- Player passes `zoneFrameTestId="player-zone-frame"` to maintain existing test selectors.
- `agendaTestAt` prop type is `string | undefined` (matches ZoneRenderer, not Date).
- REFERENCE_HEIGHT=720 and `trueWidth/trueHeight` are gone; `slotW/slotH` are gone (use playerScreenW/H directly).
- `getZoneMedia()` convenience wrapper in player.tsx is removed; `resolveZoneMedia()` and `getZoneMediaIndex()` stay for the canvas composite tile path.
- Monitor's `resolveZoneMedia()` module-level function stays for the media-rotation interval (even though it's also inside ScreenRenderSurface).

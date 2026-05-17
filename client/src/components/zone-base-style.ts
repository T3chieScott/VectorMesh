import type { CSSProperties } from "react";
import type { LayoutZone } from "@shared/schema";

/**
 * Task #234 — pure helper that derives the inline `style` for a zone's
 * outer wrapper. Agenda zones own their own background, accent bar and
 * rounded corners (the agenda widget itself draws them), so the
 * generic zone chrome — operator-set backgroundColor and borderRadius —
 * is *suppressed* for `type === "agenda"` to guarantee the in-zone
 * render matches /display/agenda/:configId exactly. Everything else
 * (text colour, shadow, outline, explicit border width/colour) still
 * flows through, so an operator who deliberately brands a zone with a
 * 4 px outline still gets it.
 *
 * Lives in its own file (rather than zone-renderer.tsx) so unit tests
 * can import it under `tsx --test` without dragging in Leaflet's CSS
 * side-effect import, which Node's loader cannot evaluate.
 */
export function buildZoneBaseStyle(
  zone: Pick<
    LayoutZone,
    "type" | "textColor" | "borderColor" | "borderWidth" | "borderRadius"
  >,
  resolved: {
    backgroundStyle: CSSProperties;
    textShadowStyle: CSSProperties;
    textOutlineStyle: CSSProperties;
  },
): CSSProperties {
  if (zone.type === "shape") {
    return { containerType: "size" as const };
  }
  const isAgendaZone = zone.type === "agenda";
  return {
    containerType: "size" as const,
    ...(isAgendaZone ? {} : resolved.backgroundStyle),
    ...(zone.textColor && { color: zone.textColor }),
    ...resolved.textShadowStyle,
    ...resolved.textOutlineStyle,
    ...(zone.borderColor && zone.borderWidth && { borderColor: zone.borderColor }),
    ...(zone.borderWidth && { borderWidth: `${zone.borderWidth}px`, borderStyle: "solid" }),
    ...(!isAgendaZone && zone.borderRadius && { borderRadius: `${zone.borderRadius}px` }),
  };
}

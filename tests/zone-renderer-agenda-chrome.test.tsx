// Task #234 — zone chrome suppression for agenda zones.
//
// Pins the rule that an "agenda" zone wrapper renders without the
// generic zone backgroundColor / borderRadius default chrome, but
// still honours operator-set text shadow / outline / explicit border,
// and that NON-agenda zones keep all the chrome they always had.
//
// We test the pure `buildZoneBaseStyle` helper rather than mounting
// <ZoneRenderer/>, because zone-renderer.tsx pulls in Leaflet CSS at
// module load (`import "leaflet/dist/leaflet.css"`), which `tsx --test`
// cannot evaluate — and the chrome decision is a pure function of the
// zone props, so a helper test is the right granularity.

import test from "node:test";
import assert from "node:assert/strict";
import { buildZoneBaseStyle } from "../client/src/components/zone-base-style";
import type { LayoutZone } from "../shared/schema";

const EMPTY = {
  backgroundStyle: {},
  textShadowStyle: {},
  textOutlineStyle: {},
};

function agendaZone(over: Partial<LayoutZone> = {}): LayoutZone {
  return {
    id: "z1",
    name: "Agenda",
    type: "agenda",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    agendaConfigId: "cfg1",
    ...over,
  } as unknown as LayoutZone;
}

test("agenda zone strips backgroundColor + borderRadius default chrome", () => {
  // Operator-set magenta background + 24 px rounded corners would
  // normally land on the wrapper. For agenda zones they must NOT —
  // the agenda widget paints its own theme background and edge.
  const style = buildZoneBaseStyle(
    agendaZone({ borderRadius: 24 } as Partial<LayoutZone>),
    {
      backgroundStyle: { backgroundColor: "#ff00ff" },
      textShadowStyle: {},
      textOutlineStyle: {},
    },
  );
  assert.equal(style.backgroundColor, undefined);
  assert.equal(style.borderRadius, undefined);
  // containerType still set (required by the outer wrapper).
  assert.equal(style.containerType, "size");
});

test("agenda zone still threads explicit border + text shadow + outline", () => {
  const style = buildZoneBaseStyle(
    agendaZone({
      borderWidth: 4,
      borderColor: "#00ff00",
      textColor: "#abcdef",
    } as Partial<LayoutZone>),
    {
      backgroundStyle: { backgroundColor: "#ff00ff" }, // still must be dropped
      textShadowStyle: { textShadow: "0 2px 4px #000" },
      textOutlineStyle: { WebkitTextStroke: "1px #000" } as React.CSSProperties,
    },
  );
  assert.equal(style.borderWidth, "4px");
  assert.equal(style.borderStyle, "solid");
  assert.equal(style.borderColor, "#00ff00");
  assert.equal(style.color, "#abcdef");
  assert.equal(style.textShadow, "0 2px 4px #000");
  assert.equal((style as any).WebkitTextStroke, "1px #000");
  // Background still suppressed even with an explicit border.
  assert.equal(style.backgroundColor, undefined);
});

test("non-agenda zone (text) keeps backgroundColor + borderRadius default chrome", () => {
  // Regression guard: the strip is gated on type === "agenda" only.
  // Every other zone type must keep the chrome they always had.
  const style = buildZoneBaseStyle(
    {
      id: "t1",
      name: "T",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      borderRadius: 16,
    } as unknown as LayoutZone,
    {
      backgroundStyle: { backgroundColor: "#112233" },
      textShadowStyle: {},
      textOutlineStyle: {},
    },
  );
  assert.equal(style.backgroundColor, "#112233");
  assert.equal(style.borderRadius, "16px");
});

test("shape zone is unaffected (only containerType applied)", () => {
  const style = buildZoneBaseStyle(
    { id: "s1", name: "S", type: "shape", x: 0, y: 0, width: 10, height: 10 } as unknown as LayoutZone,
    {
      backgroundStyle: { backgroundColor: "#fff" },
      textShadowStyle: { textShadow: "x" },
      textOutlineStyle: { WebkitTextStroke: "y" } as React.CSSProperties,
    },
  );
  assert.deepEqual(style, { containerType: "size" });
});

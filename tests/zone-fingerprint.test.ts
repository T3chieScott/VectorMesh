/**
 * Zone fingerprint regression tests.
 *
 * Guards the invariant introduced by Task #350:
 *
 *   identical visual render state → identical zoneKey
 *   changed rotated visual state  → changed zoneKey
 *
 * ── Background ────────────────────────────────────────────────────────────────
 * During layout rotation the Player and Monitor cycle through a list of
 * layout templates, one per rotation slot.  Each slot can have different
 * zone geometry, zone types, and zone configuration.  Without a content-based
 * key, React re-uses the existing ZoneRenderer component instance across
 * rotation slot changes — carrying over stale state (media position, timer,
 * widget data) from the previous slot.
 *
 * The fix: pass `zoneKey={(zone) => isLayoutRotation ? getZoneFingerprint(zone) : zone.id}`
 * to ScreenRenderSurface on both Player and Monitor.  React uses the return
 * value of `zoneKey(zone)` as the `key` prop on the zone wrapper div.  When
 * the fingerprint changes (zone config changed), React unmounts the old
 * ZoneRenderer and mounts a fresh one.  When the fingerprint stays the same
 * (zone config unchanged), React reuses the existing component — a beneficial
 * optimisation for zones that appear identically across multiple rotation
 * slots.
 *
 * ── What is tested ────────────────────────────────────────────────────────────
 * 1. Reference implementation invariants: djb2Hash, deepSortedStringify,
 *    getZoneFingerprint — all pure functions.
 * 2. zoneKey callback contract: isLayoutRotation determines which key strategy
 *    is used, and the callback is identical on Player and Monitor.
 * 3. Layout rotation simulation: stable zones across two layouts share a
 *    fingerprint (React reuses); changed zones differ (React remounts).
 * 4. Zone injection bypass: during layout rotation, zones arrive pre-resolved
 *    and must NOT have mediaPlayerItems re-injected by the host.
 * 5. Static analysis: both hosts import getZoneFingerprint from the same
 *    module, use identical callback syntax, and ScreenRenderSurface has no
 *    duplicate fingerprint logic.
 *
 * ── Approach ──────────────────────────────────────────────────────────────────
 * The fingerprint helpers (djb2Hash, deepSortedStringify, getZoneFingerprint)
 * are pure JS with no React dependencies.  Rather than trying to import the
 * full zone-renderer.tsx (which pulls in React, CSS, etc.), the reference
 * implementations are inlined here as the authoritative behavioral spec.
 * Static-analysis checks then verify the actual source code has not diverged
 * from the spec.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const root       = join(__dirname, "..");

// ── Reference implementation (spec) ──────────────────────────────────────────
// Mirrors zone-renderer.tsx exactly.  All behavioral tests run against this
// reference; static-analysis tests confirm the source file has not diverged.

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // force signed 32-bit
  }
  return (hash >>> 0).toString(36); // unsigned base-36
}

function deepSortedStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(deepSortedStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  return "{" + sortedKeys.map(k => JSON.stringify(k) + ":" + deepSortedStringify(obj[k])).join(",") + "}";
}

/** A minimal LayoutZone for testing — only required fields + common optionals. */
interface ZoneLike {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  mediaId?: string;
  mediaPlayerItems?: Array<{ id: string; mediaAssetId: string; duration?: number }>;
  textContent?: string;
  clockTimezone?: string;
  backgroundColor?: string;
  [key: string]: unknown;
}

function getZoneFingerprint(zone: ZoneLike): string {
  const { id, name, ...rest } = zone;
  // id and name are intentionally excluded — they are database identity, not
  // visual render state.  Two zones with different ids but the same geometry
  // and config must produce the same fingerprint so React reuses the component.
  return `zfp_${zone.type}_${zone.x}_${zone.y}_${zone.width}_${zone.height}_${djb2Hash(deepSortedStringify(rest))}`;
}

// ── Simulated zoneKey callbacks ───────────────────────────────────────────────
// Both player.tsx and monitor.tsx pass the same inline callback to
// ScreenRenderSurface:
//   zoneKey={(zone) => isLayoutRotation ? getZoneFingerprint(zone) : zone.id}

function makeZoneKeyCallback(isLayoutRotation: boolean) {
  return (zone: ZoneLike): string =>
    isLayoutRotation ? getZoneFingerprint(zone) : zone.id;
}

// ── Zone injection helper (mirrors player.tsx / monitor.tsx zones useMemo) ───
// When isLayoutRotation=true  → zones are passed through unchanged.
// When isLayoutRotation=false → mediaPlayerItems are synthesised from zoneSources.
interface ZoneSource { zoneId: string; type: string; playlistId?: string }
interface PlaylistItem { id: string; mediaAssetId?: string; layoutTemplateId?: string; order?: number; duration?: number }

function resolveZones(
  rawZones: ZoneLike[],
  isLayoutRotation: boolean,
  zoneSources?: ZoneSource[],
  playlistItems?: Record<string, PlaylistItem[]>,
): ZoneLike[] {
  if (isLayoutRotation) return rawZones;
  if (!zoneSources || zoneSources.length === 0) return rawZones;
  return rawZones.map(zone => {
    const source = zoneSources.find(zs => zs.zoneId === zone.id);
    if (!source || source.type !== "playlist" || !source.playlistId) return zone;
    const items = playlistItems?.[source.playlistId] || [];
    if (items.length === 0) return zone;
    const mediaOnly = items.filter(pi => pi.mediaAssetId && !pi.layoutTemplateId);
    if (mediaOnly.length === 0) return zone;
    const mediaPlayerItems = mediaOnly
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(pi => ({ id: pi.id, mediaAssetId: pi.mediaAssetId!, duration: pi.duration }));
    return { ...zone, mediaPlayerItems };
  });
}

// ── Fixture zones ─────────────────────────────────────────────────────────────

/** A standard full-screen media zone. */
function makeMediaZone(overrides: Partial<ZoneLike> = {}): ZoneLike {
  return {
    id: "zone-a1",
    name: "Main Media",
    type: "media",
    x: 0, y: 0, width: 100, height: 100,
    zIndex: 1,
    ...overrides,
  };
}

/** A clock zone in the top-right corner. */
function makeClockZone(overrides: Partial<ZoneLike> = {}): ZoneLike {
  return {
    id: "zone-c1",
    name: "Clock",
    type: "clock",
    x: 75, y: 0, width: 25, height: 15,
    zIndex: 2,
    clockTimezone: "Europe/London",
    ...overrides,
  };
}

// ── Source files (loaded once) ────────────────────────────────────────────────

const playerSrc       = readFileSync(join(root, "client/src/pages/player.tsx"), "utf8");
const monitorSrc      = readFileSync(join(root, "client/src/pages/monitor.tsx"), "utf8");
const zoneRendererSrc = readFileSync(join(root, "client/src/components/zone-renderer.tsx"), "utf8");
const surfaceSrc      = readFileSync(join(root, "client/src/components/screen-render-surface.tsx"), "utf8");

// ═════════════════════════════════════════════════════════════════════════════
// Test groups
// ═════════════════════════════════════════════════════════════════════════════

describe("djb2Hash", () => {
  test("same string → same hash (deterministic)", () => {
    const a = djb2Hash("hello world");
    const b = djb2Hash("hello world");
    assert.equal(a, b);
  });

  test("different strings → different hashes", () => {
    assert.notEqual(djb2Hash("abc"), djb2Hash("def"));
    assert.notEqual(djb2Hash("zone-a"), djb2Hash("zone-b"));
  });

  test("returns non-empty base-36 string", () => {
    const h = djb2Hash("test");
    assert.match(h, /^[0-9a-z]+$/);
    assert.ok(h.length > 0);
  });

  test("empty string has a defined hash (not empty)", () => {
    const h = djb2Hash("");
    assert.ok(typeof h === "string");
    assert.ok(h.length > 0);
  });

  test("single character difference → different hash", () => {
    assert.notEqual(djb2Hash("media"), djb2Hash("mEdIa"));
    assert.notEqual(djb2Hash("x:0"), djb2Hash("x:1"));
  });
});

describe("deepSortedStringify", () => {
  test("null and undefined → 'null' / 'undefined'", () => {
    assert.equal(deepSortedStringify(null), "null");
    assert.equal(deepSortedStringify(undefined), "undefined");
  });

  test("primitives use JSON.stringify", () => {
    assert.equal(deepSortedStringify(42), "42");
    assert.equal(deepSortedStringify(true), "true");
    assert.equal(deepSortedStringify("hello"), '"hello"');
  });

  test("arrays preserve element order", () => {
    const a = deepSortedStringify([1, 2, 3]);
    const b = deepSortedStringify([3, 2, 1]);
    // Arrays are ordered — different orderings are intentionally distinct
    assert.notEqual(a, b);
  });

  test("arrays preserve element type fidelity", () => {
    const arr = deepSortedStringify([{ id: "x", dur: 5 }, { id: "y", dur: 3 }]);
    // Each object's keys are sorted
    assert.ok(arr.includes('"dur"'));
    assert.ok(arr.includes('"id"'));
  });

  test("object keys are sorted alphabetically", () => {
    const a = deepSortedStringify({ z: 1, a: 2, m: 3 });
    const b = deepSortedStringify({ m: 3, z: 1, a: 2 });
    // Different insertion order → same sorted output
    assert.equal(a, b);
    // Keys appear in alphabetical order
    const aIdx = a.indexOf('"a"');
    const mIdx = a.indexOf('"m"');
    const zIdx = a.indexOf('"z"');
    assert.ok(aIdx < mIdx && mIdx < zIdx, `Keys must be sorted: a(${aIdx}) < m(${mIdx}) < z(${zIdx})`);
  });

  test("nested objects are also key-sorted", () => {
    const a = deepSortedStringify({ outer: { z: 1, a: 2 } });
    const b = deepSortedStringify({ outer: { a: 2, z: 1 } });
    assert.equal(a, b);
  });

  test("different values → different output", () => {
    assert.notEqual(deepSortedStringify({ x: 0 }), deepSortedStringify({ x: 1 }));
    assert.notEqual(deepSortedStringify({ a: "foo" }), deepSortedStringify({ a: "bar" }));
  });

  test("mediaPlayerItems array: order matters (playlist sequence is significant)", () => {
    const items1 = [{ id: "p1", mediaAssetId: "m1" }, { id: "p2", mediaAssetId: "m2" }];
    const items2 = [{ id: "p2", mediaAssetId: "m2" }, { id: "p1", mediaAssetId: "m1" }];
    assert.notEqual(
      deepSortedStringify(items1),
      deepSortedStringify(items2),
      "Playlist item order must affect serialisation — a reordered playlist is a different visual sequence",
    );
  });
});

describe("getZoneFingerprint — invariants", () => {
  test("same zone → same fingerprint (deterministic)", () => {
    const zone = makeMediaZone();
    assert.equal(getZoneFingerprint(zone), getZoneFingerprint({ ...zone }));
  });

  test("fingerprint starts with 'zfp_'", () => {
    assert.ok(getZoneFingerprint(makeMediaZone()).startsWith("zfp_"),
      "Fingerprint must have the zfp_ prefix for easy identification in React DevTools");
  });

  test("fingerprint encodes type explicitly (visible without decode)", () => {
    const fp = getZoneFingerprint(makeMediaZone({ type: "clock" }));
    assert.ok(fp.includes("_clock_"), `Expected _clock_ in fingerprint: ${fp}`);
  });

  test("fingerprint encodes geometry explicitly (visible without decode)", () => {
    const zone = makeMediaZone({ x: 10, y: 20, width: 40, height: 60 });
    const fp = getZoneFingerprint(zone);
    assert.ok(fp.includes("_10_"), `x=10 must appear in fingerprint: ${fp}`);
    assert.ok(fp.includes("_20_"), `y=20 must appear in fingerprint: ${fp}`);
    assert.ok(fp.includes("_40_"), `width=40 must appear in fingerprint: ${fp}`);
    assert.ok(fp.includes("_60_"), `height=60 must appear in fingerprint: ${fp}`);
  });

  test("different 'id', same visual config → SAME fingerprint (id excluded)", () => {
    const a = makeMediaZone({ id: "zone-aaa" });
    const b = makeMediaZone({ id: "zone-bbb" });
    assert.equal(
      getZoneFingerprint(a),
      getZoneFingerprint(b),
      "id must be excluded from fingerprint — zones with the same config but different DB ids must share a fingerprint",
    );
  });

  test("different 'name', same visual config → SAME fingerprint (name excluded)", () => {
    const a = makeMediaZone({ name: "Hero" });
    const b = makeMediaZone({ name: "Legacy Hero Zone" });
    assert.equal(
      getZoneFingerprint(a),
      getZoneFingerprint(b),
      "name must be excluded from fingerprint — display name is not part of visual render state",
    );
  });

  test("different 'id' AND 'name', same visual config → SAME fingerprint", () => {
    const a = makeClockZone({ id: "a1", name: "Clock A" });
    const b = makeClockZone({ id: "b2", name: "Clock B" });
    assert.equal(getZoneFingerprint(a), getZoneFingerprint(b));
  });

  test("different 'type' → different fingerprint", () => {
    const media = makeMediaZone({ type: "media" });
    const clock = makeMediaZone({ type: "clock" });
    assert.notEqual(getZoneFingerprint(media), getZoneFingerprint(clock));
  });

  test("different 'x' → different fingerprint", () => {
    assert.notEqual(
      getZoneFingerprint(makeMediaZone({ x: 0 })),
      getZoneFingerprint(makeMediaZone({ x: 50 })),
    );
  });

  test("different 'y' → different fingerprint", () => {
    assert.notEqual(
      getZoneFingerprint(makeMediaZone({ y: 0 })),
      getZoneFingerprint(makeMediaZone({ y: 50 })),
    );
  });

  test("different 'width' → different fingerprint", () => {
    assert.notEqual(
      getZoneFingerprint(makeMediaZone({ width: 100 })),
      getZoneFingerprint(makeMediaZone({ width: 50 })),
    );
  });

  test("different 'height' → different fingerprint", () => {
    assert.notEqual(
      getZoneFingerprint(makeMediaZone({ height: 100 })),
      getZoneFingerprint(makeMediaZone({ height: 75 })),
    );
  });

  test("different 'zIndex' → different fingerprint (z-order is visual state)", () => {
    assert.notEqual(
      getZoneFingerprint(makeMediaZone({ zIndex: 1 })),
      getZoneFingerprint(makeMediaZone({ zIndex: 5 })),
    );
  });

  test("different 'clockTimezone' → different fingerprint", () => {
    const a = makeClockZone({ clockTimezone: "Europe/London" });
    const b = makeClockZone({ clockTimezone: "America/New_York" });
    assert.notEqual(getZoneFingerprint(a), getZoneFingerprint(b));
  });

  test("different 'backgroundColor' → different fingerprint", () => {
    const a = makeMediaZone({ backgroundColor: "#000000" });
    const b = makeMediaZone({ backgroundColor: "#ffffff" });
    assert.notEqual(getZoneFingerprint(a), getZoneFingerprint(b));
  });

  test("different 'textContent' → different fingerprint", () => {
    const a = makeMediaZone({ type: "text", textContent: "Hello" });
    const b = makeMediaZone({ type: "text", textContent: "World" });
    assert.notEqual(getZoneFingerprint(a), getZoneFingerprint(b));
  });

  test("object key insertion order does NOT affect fingerprint (deepSortedStringify)", () => {
    // Two zones built with same fields but different insertion order
    const a: ZoneLike = { id: "x", name: "Z", type: "media", x: 0, y: 0, width: 100, height: 100, zIndex: 1, backgroundColor: "#000", textContent: "hi" };
    const b: ZoneLike = { textContent: "hi", backgroundColor: "#000", id: "x", name: "Z", x: 0, y: 0, width: 100, height: 100, zIndex: 1, type: "media" };
    assert.equal(
      getZoneFingerprint(a),
      getZoneFingerprint(b),
      "JS object key order must not affect fingerprint",
    );
  });

  test("mediaPlayerItems with same content → same fingerprint", () => {
    const items = [{ id: "pi1", mediaAssetId: "asset-1", duration: 10 }];
    const a = makeMediaZone({ mediaPlayerItems: [...items] });
    const b = makeMediaZone({ mediaPlayerItems: [...items] });
    assert.equal(getZoneFingerprint(a), getZoneFingerprint(b));
  });

  test("different mediaPlayerItems content → different fingerprint", () => {
    const a = makeMediaZone({ mediaPlayerItems: [{ id: "pi1", mediaAssetId: "asset-1" }] });
    const b = makeMediaZone({ mediaPlayerItems: [{ id: "pi2", mediaAssetId: "asset-2" }] });
    assert.notEqual(
      getZoneFingerprint(a),
      getZoneFingerprint(b),
      "Different playlist items must produce different fingerprints",
    );
  });

  test("mediaPlayerItems order change → different fingerprint (playlist sequence is significant)", () => {
    const item1 = { id: "pi1", mediaAssetId: "asset-a" };
    const item2 = { id: "pi2", mediaAssetId: "asset-b" };
    const a = makeMediaZone({ mediaPlayerItems: [item1, item2] });
    const b = makeMediaZone({ mediaPlayerItems: [item2, item1] });
    assert.notEqual(
      getZoneFingerprint(a),
      getZoneFingerprint(b),
      "Playlist item order must affect fingerprint — reordering a playlist is a visual change",
    );
  });

  test("added mediaPlayerItems field → different fingerprint (zone with vs without playlist)", () => {
    const noItems = makeMediaZone();
    const withItems = makeMediaZone({ mediaPlayerItems: [{ id: "pi1", mediaAssetId: "asset-1" }] });
    assert.notEqual(getZoneFingerprint(noItems), getZoneFingerprint(withItems));
  });
});

describe("zoneKey callback — contract", () => {
  test("isLayoutRotation=true → uses getZoneFingerprint (NOT zone.id)", () => {
    const zone = makeMediaZone({ id: "unique-db-id-xyz" });
    const zoneKey = makeZoneKeyCallback(true);
    const key = zoneKey(zone);
    assert.ok(key.startsWith("zfp_"),
      `isLayoutRotation=true must yield a fingerprint key, got: ${key}`);
    assert.notEqual(key, zone.id,
      "During layout rotation the key must not be the bare database id");
  });

  test("isLayoutRotation=false → uses zone.id (NOT fingerprint)", () => {
    const zone = makeMediaZone({ id: "stable-db-id" });
    const zoneKey = makeZoneKeyCallback(false);
    const key = zoneKey(zone);
    assert.equal(key, zone.id,
      "When not rotating, the key must be the stable database id");
    assert.ok(!key.startsWith("zfp_"),
      "Non-rotation mode must not produce a fingerprint key");
  });

  test("isLayoutRotation=true, same zone state → same key (no unnecessary remount)", () => {
    const zone = makeClockZone();
    const zoneKey = makeZoneKeyCallback(true);
    // Two calls with structurally identical zones produce the same key.
    // React sees identical keys → component is reused, no remount.
    assert.equal(zoneKey(zone), zoneKey({ ...zone }),
      "Identical zone state must yield the same key so React does not remount");
  });

  test("isLayoutRotation=true, changed geometry → different key (triggers React remount)", () => {
    const before = makeMediaZone({ x: 0, width: 100 });
    const after  = makeMediaZone({ x: 50, width: 50 }); // zone narrowed
    const zoneKey = makeZoneKeyCallback(true);
    assert.notEqual(zoneKey(before), zoneKey(after),
      "Changed zone geometry must produce a different key so React remounts the component");
  });

  test("isLayoutRotation=true, changed type → different key (triggers React remount)", () => {
    const before = makeMediaZone({ type: "media" });
    const after  = makeMediaZone({ type: "clock" });
    const zoneKey = makeZoneKeyCallback(true);
    assert.notEqual(zoneKey(before), zoneKey(after));
  });

  test("isLayoutRotation=true, different id same config → SAME key (correctly avoids remount)", () => {
    // Two rotation slots contain a zone with the same visual config but different DB ids.
    // The fingerprint-based key correctly identifies them as the same visual element.
    const slotA = makeMediaZone({ id: "slot-a-zone-1" });
    const slotB = makeMediaZone({ id: "slot-b-zone-1" });
    const zoneKey = makeZoneKeyCallback(true);
    assert.equal(zoneKey(slotA), zoneKey(slotB),
      "Zones with the same visual config in different rotation slots must share a key to avoid unnecessary remounts");
  });

  test("isLayoutRotation=false, zone config changes → SAME key (stable id-based identity)", () => {
    // In normal (non-rotation) mode, zone.id is the stable identity.
    // Even if config props change (e.g. playlist reloads), the component is NOT remounted —
    // it receives new props via React reconciliation.
    const zone   = makeMediaZone({ id: "stable-id", mediaPlayerItems: [{ id: "pi1", mediaAssetId: "m1" }] });
    const zone2  = makeMediaZone({ id: "stable-id", mediaPlayerItems: [{ id: "pi2", mediaAssetId: "m2" }] });
    const zoneKey = makeZoneKeyCallback(false);
    assert.equal(zoneKey(zone), zoneKey(zone2),
      "Non-rotation mode uses zone.id — config changes are handled by props, not remounting");
  });
});

describe("Monitor and Player produce identical zoneKey for identical render state", () => {
  // This group confirms the fundamental symmetry: the same zone passing through
  // Player's zoneKey callback and Monitor's zoneKey callback yields the same
  // React key.  If they diverge, Monitor and Player would render different
  // component lifetimes for the same logical zone content.

  test("isLayoutRotation=true: same zone → same key regardless of host", () => {
    const zone = makeClockZone();
    const playerKey  = makeZoneKeyCallback(true)(zone);
    const monitorKey = makeZoneKeyCallback(true)(zone);
    assert.equal(playerKey, monitorKey,
      "Player and Monitor must produce identical zoneKey for the same zone during rotation");
  });

  test("isLayoutRotation=false: same zone → same key regardless of host", () => {
    const zone = makeMediaZone();
    const playerKey  = makeZoneKeyCallback(false)(zone);
    const monitorKey = makeZoneKeyCallback(false)(zone);
    assert.equal(playerKey, monitorKey,
      "Player and Monitor must produce identical zoneKey for the same zone in normal mode");
  });

  test("isLayoutRotation=true: different zone configs → different keys on both hosts", () => {
    const zoneA = makeMediaZone({ x: 0, width: 50 });
    const zoneB = makeMediaZone({ x: 50, width: 50 });
    const playerKeyA  = makeZoneKeyCallback(true)(zoneA);
    const playerKeyB  = makeZoneKeyCallback(true)(zoneB);
    const monitorKeyA = makeZoneKeyCallback(true)(zoneA);
    const monitorKeyB = makeZoneKeyCallback(true)(zoneB);
    assert.notEqual(playerKeyA, playerKeyB);
    assert.notEqual(monitorKeyA, monitorKeyB);
    assert.equal(playerKeyA, monitorKeyA);
    assert.equal(playerKeyB, monitorKeyB);
  });

  test("weather zone with different coordinates → different key on both hosts", () => {
    const london = { ...makeMediaZone({ type: "weather" }), weatherLat: 51.5, weatherLng: -0.1 };
    const nyc    = { ...makeMediaZone({ type: "weather" }), weatherLat: 40.7, weatherLng: -74.0 };
    const playerLondon  = makeZoneKeyCallback(true)(london);
    const monitorLondon = makeZoneKeyCallback(true)(london);
    const playerNYC     = makeZoneKeyCallback(true)(nyc);
    assert.equal(playerLondon, monitorLondon);
    assert.notEqual(playerLondon, playerNYC);
  });
});

describe("Layout rotation simulation — React remount behaviour", () => {
  // Simulates a real layout rotation cycle with two layout templates.
  // Layout A has three zones; Layout B changes two of them.
  // This validates the core invariant end-to-end.

  const layoutAZones: ZoneLike[] = [
    { id: "la-zone-1", name: "Full Media",   type: "media",  x: 0,   y: 0, width: 100, height: 85,  zIndex: 1 },
    { id: "la-zone-2", name: "Ticker",       type: "ticker", x: 0,   y: 85, width: 100, height: 15, zIndex: 2, tickerScrollSpeed: 30 },
    { id: "la-zone-3", name: "Clock",        type: "clock",  x: 80,  y: 0, width: 20,  height: 15,  zIndex: 3, clockTimezone: "Europe/London" },
  ];

  // Layout B: zone 1 is visually identical (same config, different DB id+name)
  //           zone 2 is different (ticker speed changed)
  //           zone 3 is identical (same visual config)
  //           zone 4 is new — added in layout B
  const layoutBZones: ZoneLike[] = [
    { id: "lb-zone-1", name: "Hero Media",   type: "media",  x: 0,   y: 0, width: 100, height: 85,  zIndex: 1 },             // STABLE
    { id: "lb-zone-2", name: "Fast Ticker",  type: "ticker", x: 0,   y: 85, width: 100, height: 15, zIndex: 2, tickerScrollSpeed: 10 }, // CHANGED
    { id: "lb-zone-3", name: "London Clock", type: "clock",  x: 80,  y: 0, width: 20,  height: 15,  zIndex: 3, clockTimezone: "Europe/London" }, // STABLE
    { id: "lb-zone-4", name: "QR Code",      type: "qrcode", x: 60,  y: 0, width: 20,  height: 15,  zIndex: 4, qrContent: "https://example.com" }, // NEW
  ];

  test("stable zone (same visual config, different id) → same fingerprint: React REUSES component", () => {
    const fpA = getZoneFingerprint(layoutAZones[0]);
    const fpB = getZoneFingerprint(layoutBZones[0]);
    assert.equal(fpA, fpB,
      "Zone 1 is visually identical across layouts A and B. React must reuse the component instance (no remount).");
  });

  test("changed zone (ticker speed) → different fingerprint: React REMOUNTS component", () => {
    const fpA = getZoneFingerprint(layoutAZones[1]);
    const fpB = getZoneFingerprint(layoutBZones[1]);
    assert.notEqual(fpA, fpB,
      "Zone 2 has a different tickerScrollSpeed in layout B. React must remount to reset the ticker state.");
  });

  test("stable clock zone → same fingerprint: React REUSES component", () => {
    const fpA = getZoneFingerprint(layoutAZones[2]);
    const fpB = getZoneFingerprint(layoutBZones[2]);
    assert.equal(fpA, fpB,
      "Zone 3 is visually identical across layouts. React must reuse the component instance.");
  });

  test("all stable zone fingerprints are unique (no accidental collision)", () => {
    const stableA = layoutAZones[0];
    const stableC = layoutAZones[2];
    assert.notEqual(
      getZoneFingerprint(stableA),
      getZoneFingerprint(stableC),
      "Two different stable zones must have different fingerprints — no hash collision",
    );
  });

  test("if zone.id were used during rotation, stable zones would appear changed (proves why fingerprint is needed)", () => {
    // This test documents the failure mode that getZoneFingerprint prevents.
    // When rotation changes the layout, zone database IDs change (la-zone-1 → lb-zone-1).
    // Using zone.id as the React key would make React think the component changed,
    // causing an unnecessary remount and resetting media state, scroll position, etc.
    const idKeyA = layoutAZones[0].id;
    const idKeyB = layoutBZones[0].id;
    assert.notEqual(idKeyA, idKeyB,
      "Stable zone has different DB ids across layouts — using zone.id as key would cause spurious remounts");

    // But fingerprint-based keys are the same:
    assert.equal(getZoneFingerprint(layoutAZones[0]), getZoneFingerprint(layoutBZones[0]),
      "Fingerprint-based keys are equal for the stable zone — React correctly reuses the component");
  });

  test("full keyset for layout A: all fingerprints are distinct", () => {
    const fps = layoutAZones.map(getZoneFingerprint);
    const unique = new Set(fps);
    assert.equal(unique.size, fps.length,
      "Every zone in a layout must have a unique fingerprint");
  });

  test("full keyset for layout B: all fingerprints are distinct", () => {
    const fps = layoutBZones.map(getZoneFingerprint);
    const unique = new Set(fps);
    assert.equal(unique.size, fps.length,
      "Every zone in a layout must have a unique fingerprint");
  });

  test("zoneKey callback: rotation=true produces correct remount decisions for full A→B transition", () => {
    const zoneKey = makeZoneKeyCallback(true);

    const keysA = layoutAZones.map(z => ({ zone: z.name, key: zoneKey(z) }));
    const keysB = layoutBZones.map(z => ({ zone: z.name, key: zoneKey(z) }));

    // Zone 1: stable → same key
    assert.equal(keysA[0].key, keysB[0].key, "Zone 1 (stable): same key across rotation");

    // Zone 2: ticker changed → different key
    assert.notEqual(keysA[1].key, keysB[1].key, "Zone 2 (ticker speed changed): different key, triggers remount");

    // Zone 3: stable → same key
    assert.equal(keysA[2].key, keysB[2].key, "Zone 3 (clock, stable): same key across rotation");

    // Zone 4 in B is new — it has no counterpart in A (new component mount)
    const newZoneKey = zoneKey(layoutBZones[3]);
    const allAKeys = keysA.map(k => k.key);
    assert.ok(!allAKeys.includes(newZoneKey),
      "New zone in layout B must have a key not present in layout A — React will mount it fresh");
  });
});

describe("Zone injection bypass during layout rotation", () => {
  // During layout rotation, rawZones already contain the resolved zone config
  // from the rotation layout template.  mediaPlayerItems must NOT be
  // re-injected from the screen's zone sources — that would overwrite the
  // rotation template's config with the screen's static playlist config.

  const rawZones: ZoneLike[] = [
    { id: "z1", name: "Media", type: "media", x: 0, y: 0, width: 100, height: 100,
      // Rotation template has pre-resolved items for this zone
      mediaPlayerItems: [{ id: "rotation-item-1", mediaAssetId: "asset-rotation-a" }] },
  ];

  const zoneSources: ZoneSource[] = [
    { zoneId: "z1", type: "playlist", playlistId: "pl-screen" },
  ];

  const playlistItems: Record<string, PlaylistItem[]> = {
    "pl-screen": [
      { id: "screen-pi-1", mediaAssetId: "asset-screen-x", order: 1 },
      { id: "screen-pi-2", mediaAssetId: "asset-screen-y", order: 2 },
    ],
  };

  test("isLayoutRotation=true: zones passed through unchanged (no playlist injection)", () => {
    const resolved = resolveZones(rawZones, true, zoneSources, playlistItems);
    assert.equal(resolved.length, 1);
    // mediaPlayerItems must still be the rotation template's items, not the screen playlist's items
    assert.deepEqual(resolved[0].mediaPlayerItems, rawZones[0].mediaPlayerItems,
      "Layout rotation zones must not be overwritten by screen zone sources");
    assert.ok(resolved[0] === rawZones[0],
      "isLayoutRotation=true must return rawZones by reference (no transformation)");
  });

  test("isLayoutRotation=false: mediaPlayerItems are injected from zone sources", () => {
    const baseZone: ZoneLike = { id: "z1", name: "Media", type: "media", x: 0, y: 0, width: 100, height: 100 };
    const resolved = resolveZones([baseZone], false, zoneSources, playlistItems);
    assert.equal(resolved.length, 1);
    assert.ok(Array.isArray(resolved[0].mediaPlayerItems),
      "Non-rotation mode must inject mediaPlayerItems from the zone source playlist");
    assert.equal(resolved[0].mediaPlayerItems!.length, 2,
      "Both playlist items must be injected");
    assert.equal(resolved[0].mediaPlayerItems![0].mediaAssetId, "asset-screen-x");
    assert.equal(resolved[0].mediaPlayerItems![1].mediaAssetId, "asset-screen-y");
  });

  test("isLayoutRotation=false, no zone sources: zones unchanged", () => {
    const zone: ZoneLike = { id: "z1", name: "M", type: "media", x: 0, y: 0, width: 100, height: 100 };
    const resolved = resolveZones([zone], false, [], {});
    assert.ok(resolved[0] === zone, "With no zone sources, zone must be returned unchanged");
  });

  test("isLayoutRotation=false, zone source for different zone: unmatched zone unchanged", () => {
    const zone: ZoneLike = { id: "z2", name: "M", type: "media", x: 0, y: 0, width: 100, height: 100 };
    const resolved = resolveZones([zone], false, zoneSources, playlistItems);
    // zoneSources references z1 but the zone is z2 — no injection
    assert.ok(resolved[0] === zone, "Zone without a matching source must be returned unchanged");
    assert.equal(resolved[0].mediaPlayerItems, undefined);
  });

  test("fingerprint differs before and after injection (injection is a visual change)", () => {
    const bare: ZoneLike = { id: "z1", name: "M", type: "media", x: 0, y: 0, width: 100, height: 100 };
    const injected = resolveZones([bare], false, zoneSources, playlistItems)[0];
    assert.notEqual(
      getZoneFingerprint(bare),
      getZoneFingerprint(injected),
      "Adding mediaPlayerItems changes the fingerprint — injected zone has different visual state than bare zone",
    );
  });
});

describe("Static analysis — source code consistency", () => {
  // These checks confirm that the actual source files match the behavioral
  // contract established by the reference implementation above.  They guard
  // against accidental drift (e.g., someone inlining a slightly different
  // fingerprint function in one of the host files).

  test("zone-renderer.tsx exports getZoneFingerprint", () => {
    assert.ok(
      zoneRendererSrc.includes("export function getZoneFingerprint("),
      "getZoneFingerprint must be exported from zone-renderer.tsx as the single source of truth",
    );
  });

  test("zone-renderer.tsx getZoneFingerprint excludes 'id' and 'name' from the hash input", () => {
    // The fingerprint function must destructure id and name away before hashing.
    // The exact pattern is: const { id, name, ...rest } = zone;
    assert.ok(
      zoneRendererSrc.includes("const { id, name, ...rest } = zone;"),
      "getZoneFingerprint must extract id and name before hashing",
    );
  });

  test("zone-renderer.tsx fingerprint uses djb2Hash of deepSortedStringify", () => {
    assert.ok(
      zoneRendererSrc.includes("djb2Hash(deepSortedStringify(rest))"),
      "Fingerprint hash must use djb2Hash(deepSortedStringify(rest))",
    );
  });

  test("player.tsx imports getZoneFingerprint from zone-renderer (not a local copy)", () => {
    assert.ok(
      playerSrc.includes("getZoneFingerprint") && playerSrc.includes("zone-renderer"),
      "player.tsx must import getZoneFingerprint from zone-renderer, not define its own copy",
    );
    // Confirm it is an import, not a local function definition
    assert.ok(
      !playerSrc.includes("function getZoneFingerprint"),
      "player.tsx must not define its own getZoneFingerprint — use the shared export",
    );
  });

  test("monitor.tsx imports getZoneFingerprint from zone-renderer (not a local copy)", () => {
    assert.ok(
      monitorSrc.includes("getZoneFingerprint") && monitorSrc.includes("zone-renderer"),
      "monitor.tsx must import getZoneFingerprint from zone-renderer, not define its own copy",
    );
    assert.ok(
      !monitorSrc.includes("function getZoneFingerprint"),
      "monitor.tsx must not define its own getZoneFingerprint — use the shared export",
    );
  });

  test("player.tsx zoneKey callback: isLayoutRotation ? getZoneFingerprint(zone) : zone.id", () => {
    assert.ok(
      playerSrc.includes("isLayoutRotation ? getZoneFingerprint(zone) : zone.id"),
      "player.tsx must use the correct zoneKey callback pattern",
    );
  });

  test("monitor.tsx zoneKey callback: isLayoutRotation ? getZoneFingerprint(zone) : zone.id", () => {
    assert.ok(
      monitorSrc.includes("isLayoutRotation ? getZoneFingerprint(zone) : zone.id"),
      "monitor.tsx must use the correct zoneKey callback pattern (identical to player.tsx)",
    );
  });

  test("player.tsx and monitor.tsx use the SAME zoneKey callback string", () => {
    const pattern = "isLayoutRotation ? getZoneFingerprint(zone) : zone.id";
    assert.ok(
      playerSrc.includes(pattern) && monitorSrc.includes(pattern),
      "Both hosts must use the identical zoneKey callback — any divergence breaks Monitor/Player symmetry",
    );
  });

  test("ScreenRenderSurface uses zoneKey(zone) when provided, falls back to zone.id", () => {
    // The key expression on the zone wrapper must be:
    //   key={zoneKey ? zoneKey(zone) : zone.id}
    assert.ok(
      surfaceSrc.includes("zoneKey ? zoneKey(zone) : zone.id"),
      "ScreenRenderSurface must use key={zoneKey ? zoneKey(zone) : zone.id}",
    );
  });

  test("ScreenRenderSurface does NOT contain its own fingerprint/hash logic", () => {
    assert.ok(
      !surfaceSrc.includes("djb2Hash") && !surfaceSrc.includes("deepSortedStringify"),
      "ScreenRenderSurface must not contain fingerprint hash logic — it only receives a zoneKey callback",
    );
  });

  test("getZoneFingerprint is not duplicated in screen-render-surface.tsx", () => {
    // The component's JSDoc comment may mention getZoneFingerprint as documentation
    // (explaining what callers should pass), but there must be no import or
    // executable call to it — fingerprinting is purely the caller's responsibility.
    const executableLines = surfaceSrc
      .split("\n")
      .filter(line => {
        const t = line.trimStart();
        return !t.startsWith("*") && !t.startsWith("//");
      });
    const callOrImport = executableLines.some(line => line.includes("getZoneFingerprint"));
    assert.ok(
      !callOrImport,
      "ScreenRenderSurface must not import or call getZoneFingerprint in executable code — only the caller (Player/Monitor) should compute the fingerprint",
    );
  });

  test("player.tsx zones useMemo returns rawZones unchanged during layout rotation", () => {
    // Static confirmation that the zone injection bypass is present.
    // The exact pattern is: if (isLayoutRotation) return rawZones;
    assert.ok(
      playerSrc.includes("if (isLayoutRotation) return rawZones;"),
      "player.tsx zones useMemo must short-circuit during layout rotation",
    );
  });

  test("monitor.tsx zones useMemo returns rawZones unchanged during layout rotation", () => {
    assert.ok(
      monitorSrc.includes("if (isLayoutRotation) return rawZones;"),
      "monitor.tsx zones useMemo must short-circuit during layout rotation",
    );
  });
});

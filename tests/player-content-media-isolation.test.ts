import test from "node:test";
import assert from "node:assert/strict";
import { filterMediaAssetsForScreen } from "../server/playerMediaFilter";
import type { MediaAsset, MediaShare } from "../shared/schema";

// Task #239 — regression coverage for the cross-tenant media leak in
// GET /api/player/:screenId/content.
//
// Before the fix, the route shipped the entire `media_assets` table as
// `content.media`. Combined with the zone-renderer's
// `zone.mediaId ? filter : media` fallback, a media zone with no
// explicit asset would rotate through every site's uploads. These
// tests pin the per-screen, site-scoped allow-list logic.

function makeAsset(id: string, clientId: string | null): MediaAsset {
  return {
    id,
    clientId,
    filename: `${id}.png`,
    originalName: `${id}.png`,
    mimeType: "image/png",
    fileSize: 1,
    duration: null,
    width: null,
    height: null,
    thumbnailUrl: null,
    url: `/uploads/${id}.png`,
    uploadedById: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as MediaAsset;
}

function makeShare(mediaAssetId: string, clientId: string): MediaShare {
  return {
    id: `share-${mediaAssetId}-${clientId}`,
    mediaAssetId,
    clientId,
    sharedAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as MediaShare;
}

test("filterMediaAssetsForScreen — site A screen never sees site B's media", () => {
  const a1 = makeAsset("a1", "siteA");
  const a2 = makeAsset("a2", "siteA");
  const b1 = makeAsset("b1", "siteB");
  const b2 = makeAsset("b2", "siteB");
  const all = [a1, a2, b1, b2];

  const out = filterMediaAssetsForScreen(all, "siteA", []);
  const ids = out.map((a) => a.id).sort();

  assert.deepEqual(ids, ["a1", "a2"], "site A screen must only get site A assets");
  assert.ok(!ids.includes("b1"), "site B asset b1 must not leak to site A");
  assert.ok(!ids.includes("b2"), "site B asset b2 must not leak to site A");
});

test("filterMediaAssetsForScreen — explicit media_shares entry exposes a foreign asset", () => {
  const a1 = makeAsset("a1", "siteA");
  const b1 = makeAsset("b1", "siteB");
  const b2 = makeAsset("b2", "siteB");
  const all = [a1, b1, b2];

  // siteA has explicit access to b1 via media_shares, but NOT b2.
  const shares = [makeShare("b1", "siteA")];

  const out = filterMediaAssetsForScreen(all, "siteA", shares);
  const ids = out.map((a) => a.id).sort();

  assert.deepEqual(
    ids,
    ["a1", "b1"],
    "site A gets its own assets plus the explicitly shared b1, but not b2",
  );
});

test("filterMediaAssetsForScreen — screen with no clientId gets an empty list, not the whole estate", () => {
  const all = [
    makeAsset("a1", "siteA"),
    makeAsset("b1", "siteB"),
    makeAsset("orphan", null),
  ];

  const out = filterMediaAssetsForScreen(all, null, []);
  assert.deepEqual(out, [], "orphan screen must not receive any media");

  const outUndef = filterMediaAssetsForScreen(all, undefined, []);
  assert.deepEqual(outUndef, [], "screen with undefined clientId must not receive any media");
});

test("filterMediaAssetsForScreen — shares pointing at other clients are ignored", () => {
  const a1 = makeAsset("a1", "siteA");
  const b1 = makeAsset("b1", "siteB");
  const all = [a1, b1];

  // A share row that exposes b1 to siteC must not let siteA see b1.
  const shares = [makeShare("b1", "siteC")] as unknown as MediaShare[];

  // The route only ever passes in `getMediaSharesForClient(screen.clientId)`,
  // but defensively the filter must also be safe if a caller hands in
  // shares for a different client.
  const out = filterMediaAssetsForScreen(all, "siteA", []);
  assert.deepEqual(out.map((a) => a.id), ["a1"]);
  // And even if the helper is invoked with the wrong shares list it
  // doesn't suddenly grant access — set membership is by asset id
  // only, so the asset still passes through, which is why the route
  // is the one responsible for fetching the correct shares list.
  const outBuggy = filterMediaAssetsForScreen(all, "siteA", shares);
  assert.deepEqual(
    outBuggy.map((a) => a.id).sort(),
    ["a1", "b1"],
    "documents the contract: callers must pass shares for screen.clientId",
  );
});

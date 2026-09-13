import test from "node:test";
import assert from "node:assert/strict";
import { buildScreenPlaybackSummary } from "../server/screenPlaybackSummary";
import type { ResolveResult } from "../server/contentResolver";
import { getScreenPlaybackDisplay } from "../client/src/components/screen-booking-status";

function result(overrides: Partial<ResolveResult> = {}): ResolveResult {
  return {
    layout: null,
    activeZoneSources: [],
    liveOverride: null,
    activeEvent: null,
    eventBlocks: [],
    applicableBlocks: [],
    eventProgrammeVersions: [],
    resolvedPlaylist: null,
    trace: [{ kind: "outcome", source: "nothing", blockId: null, blockName: null, layoutId: null, layoutName: null }],
    ...overrides,
  } as ResolveResult;
}

test("screen playback summary exposes only the resolved fallback playlist", () => {
  const summary = buildScreenPlaybackSummary(
    result({
      resolvedPlaylist: { id: "playlist-1", name: "Lobby loop" } as any,
      trace: [{ kind: "outcome", source: "fallback-playlist", blockId: null, blockName: null, layoutId: null, layoutName: null }],
    }),
    { current: null, next: null },
  );

  assert.deepEqual(summary, {
    source: "fallback-playlist",
    type: "playlist",
    id: "playlist-1",
    name: "Lobby loop",
    activeEvent: null,
    programme: null,
    version: null,
    block: null,
    activeProgramme: null,
    activeVersion: null,
    activeBlock: null,
    currentEffectiveEnd: null,
    nextBlock: null,
    nextStart: null,
  });
  assert.equal("trace" in summary, false);
});

test("summary carries the active block's programme/version and bounded end", () => {
  const block = {
    id: "block-1",
    programmeVersionId: "version-1",
    name: "Welcome",
  } as any;
  const endsAt = new Date("2026-04-24T17:00:00.000Z");
  const summary = buildScreenPlaybackSummary(
    result({
      activeEvent: { id: "event-1", name: "Open day" } as any,
      layout: { id: "layout-1", name: "Main" } as any,
      eventBlocks: [block],
      applicableBlocks: [block],
      eventProgrammeVersions: [{
        programme: { id: "programme-1", name: "Morning" } as any,
        version: { id: "version-1", versionNumber: 3 } as any,
      }],
      trace: [{ kind: "outcome", source: "block", blockId: "block-1", blockName: "Welcome", layoutId: "layout-1", layoutName: "Main" }],
    }),
    { current: { block, endsAt }, next: null },
  );

  assert.equal(summary.source, "block");
  assert.equal(summary.type, "layout");
  assert.deepEqual(summary.programme, { id: "programme-1", name: "Morning" });
  assert.deepEqual(summary.activeProgramme, summary.programme);
  assert.deepEqual(summary.version, { id: "version-1", versionNumber: 3 });
  assert.deepEqual(summary.block, { id: "block-1", name: "Welcome" });
  assert.equal(summary.currentEffectiveEnd, endsAt.toISOString());
});

test("summary never substitutes a different overlapping block for the resolver outcome", () => {
  const winner = { id: "winner", programmeVersionId: "version-1", name: "Resolver winner" } as any;
  const other = { id: "other", programmeVersionId: "version-2", name: "Derivation tiebreaker" } as any;
  const summary = buildScreenPlaybackSummary(
    result({
      eventBlocks: [winner, other],
      applicableBlocks: [winner, other],
      trace: [{
        kind: "outcome",
        source: "block",
        blockId: "winner",
        blockName: "Resolver winner",
        layoutId: null,
        layoutName: null,
      }],
    }),
    { current: { block: other, endsAt: new Date("2026-04-24T17:00:00.000Z") }, next: null },
  );
  assert.deepEqual(summary.activeBlock, { id: "winner", name: "Resolver winner" });
});

test("summary leaves effective end open for an unbounded resolver winner", () => {
  const block = { id: "always", programmeVersionId: "version-1", name: "Always" } as any;
  const summary = buildScreenPlaybackSummary(
    result({
      eventBlocks: [block],
      trace: [{
        kind: "outcome", source: "block", blockId: "always",
        blockName: "Always", layoutId: null, layoutName: null,
      }],
    }),
    { current: { block, endsAt: null }, next: null },
  );
  assert.equal(summary.activeBlock?.id, "always");
  assert.equal(summary.currentEffectiveEnd, null);
});

test("shared playback presentation has deterministic loading/error/none states", () => {
  assert.deepEqual(getScreenPlaybackDisplay(undefined, "loading"), {
    state: "loading", label: "Loading…", badge: null,
  });
  assert.deepEqual(getScreenPlaybackDisplay(undefined, "error"), {
    state: "error", label: "Unable to load playback", badge: null,
  });
  assert.deepEqual(getScreenPlaybackDisplay({
    now: "", activeEvent: null, block: { kind: "noEvent" }, nextBooking: null,
    resolvedContent: {
      source: "nothing", type: "none", id: null, name: null,
      activeEvent: null, programme: null, version: null, block: null,
      activeProgramme: null, activeVersion: null, activeBlock: null,
      currentEffectiveEnd: null, nextBlock: null, nextStart: null,
    },
  }, "ready"), { state: "none", label: "—", badge: null });
});

test("summary bounds additive identifiers and display strings", () => {
  const summary = buildScreenPlaybackSummary(
    result({
      layout: { id: "i".repeat(300), name: "n".repeat(400) } as any,
      activeEvent: { id: "e".repeat(300), name: "event" } as any,
      trace: [{
        kind: "outcome", source: "fallback-layout", blockId: null,
        blockName: null, layoutId: "i".repeat(300), layoutName: "n".repeat(400),
      }],
    }),
    { current: null, next: null },
  );
  assert.equal(summary.id?.length, 128);
  assert.equal(summary.name?.length, 256);
  assert.equal(summary.activeEvent?.id.length, 128);
});
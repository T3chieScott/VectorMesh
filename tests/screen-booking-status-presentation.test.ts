import test from "node:test";
import assert from "node:assert/strict";
import {
  getScreenPlaybackContentPresentation,
  getScreenPlaybackSchedulePresentation,
  type ScreenPlaybackResponse,
} from "../client/src/components/screen-booking-status";

function response(
  type: "layout" | "playlist" | "agenda" | "none",
  source: "live-override" | "block" | "fallback-layout" | "fallback-playlist" | "nothing",
): ScreenPlaybackResponse {
  return {
    now: "",
    activeEvent: null,
    block: { kind: "noEvent" },
    nextBooking: null,
    resolvedContent: {
      source,
      type,
      id: type === "none" ? null : "content-1",
      name: type === "none" ? null : "Resolved content",
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
    },
  };
}

test("card and table callers share one resolver-authoritative source contract", () => {
  const resolved = response("layout", "fallback-playlist");
  const cardPresentation = getScreenPlaybackContentPresentation(resolved);
  const tablePresentation = getScreenPlaybackContentPresentation(resolved);

  assert.deepEqual(cardPresentation, { type: "Scene", source: "Fallback" });
  assert.deepEqual(tablePresentation, cardPresentation);

  const livePlaylist = getScreenPlaybackContentPresentation(
    response("playlist", "live-override"),
  );
  assert.deepEqual(livePlaylist, { type: "Playlist", source: "Live Override" });
});

test("scheduled and fallback sources use stable operator labels", () => {
  assert.deepEqual(
    getScreenPlaybackContentPresentation(response("layout", "block")),
    { type: "Scene", source: "Scheduled" },
  );
  assert.deepEqual(
    getScreenPlaybackContentPresentation(response("playlist", "fallback-playlist")),
    { type: "Playlist", source: "Fallback" },
  );
});

test("non-scene and non-playlist summaries do not invent a type label", () => {
  assert.deepEqual(
    getScreenPlaybackContentPresentation(response("agenda", "block")),
    { type: null, source: "Scheduled" },
  );
  assert.deepEqual(
    getScreenPlaybackContentPresentation(response("none", "nothing")),
    { type: null, source: null },
  );
  assert.deepEqual(getScreenPlaybackContentPresentation(undefined), {
    type: null,
    source: null,
  });
});

test("canonical open-ended active block wins over legacy noBlockToday", () => {
  const resolved = response("layout", "block");
  resolved.block = { kind: "noBlockToday" };
  resolved.resolvedContent.activeBlock = {
    id: "active-open-ended",
    name: "Open-ended scene",
  };
  resolved.resolvedContent.currentEffectiveEnd = null;
  resolved.resolvedContent.nextBlock = {
    id: "next-block",
    name: "Next scene",
  };
  resolved.resolvedContent.nextStart = null;

  assert.deepEqual(getScreenPlaybackSchedulePresentation(resolved), {
    activeBlock: { id: "active-open-ended", name: "Open-ended scene" },
    currentEffectiveEnd: null,
    nextBlock: { id: "next-block", name: "Next scene" },
    nextStart: null,
  });
});
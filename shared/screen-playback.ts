export type ScreenPlaybackEntity = { id: string; name: string | null };
export type ContentResolveOutcomeSource =
  | "live-override"
  | "block"
  | "fallback-layout"
  | "fallback-playlist"
  | "nothing";

export type ResolvedContentType = "layout" | "playlist" | "agenda" | "none";

/**
 * Bounded, presentation-safe content information for the screens page.
 * This deliberately contains only names and identifiers that are already
 * visible to an authorized operator; it is not a serialized resolver trace.
 */
export interface ResolvedContentSummary {
  source: ContentResolveOutcomeSource;
  type: ResolvedContentType;
  id: string | null;
  name: string | null;
  activeEvent: ScreenPlaybackEntity | null;
  programme: ScreenPlaybackEntity | null;
  version: { id: string; versionNumber: number } | null;
  block: ScreenPlaybackEntity | null;
  /** Explicit names for consumers that render the schedule hierarchy. */
  activeProgramme: ScreenPlaybackEntity | null;
  activeVersion: { id: string; versionNumber: number } | null;
  activeBlock: ScreenPlaybackEntity | null;
  currentEffectiveEnd: string | null;
  nextBlock: ScreenPlaybackEntity | null;
  nextStart: string | null;
}

export type ScreenPlaybackBlockStatus =
  | { kind: "playing"; blockId: string; blockName: string; endsAt: string }
  | { kind: "playsNext"; blockId: string; blockName: string; startsAt: string }
  | { kind: "noBlockToday" }
  | { kind: "noEvent" };

export interface ScreenPlaybackResponse {
  now: string;
  activeEvent: ScreenPlaybackEntity | null;
  block: ScreenPlaybackBlockStatus;
  nextBooking: { eventId: string; eventName: string; startsAt: string } | null;
  resolvedContent: ResolvedContentSummary;
}

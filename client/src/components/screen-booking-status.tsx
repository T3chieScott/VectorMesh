import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ScreenPlaybackResponse } from "@shared/screen-playback";

export type { ScreenPlaybackResponse };

export type ScreenPlaybackDisplay =
  | { state: "resolved"; label: string; badge: string | null }
  | { state: "none"; label: "—"; badge: null }
  | { state: "loading"; label: "Loading…"; badge: null }
  | { state: "error"; label: "Unable to load playback"; badge: null };
export type ScreenPlaybackQueryState = "loading" | "error" | "ready";

export type ScreenPlaybackContentPresentation = {
  type: "Scene" | "Playlist" | null;
  source: "Live Override" | "Scheduled" | "Fallback" | null;
};

export type ScreenPlaybackSchedulePresentation = {
  activeBlock: ScreenPlaybackResponse["resolvedContent"]["activeBlock"];
  currentEffectiveEnd: string | null;
  nextBlock: ScreenPlaybackResponse["resolvedContent"]["nextBlock"];
  nextStart: string | null;
};

/**
 * Keep the operator-facing labels tied to the resolver's explicit summary
 * fields. In particular, a fallback source does not tell us whether the
 * resolved content is a scene or a playlist.
 */
export function getScreenPlaybackContentPresentation(
  data: ScreenPlaybackResponse | undefined,
): ScreenPlaybackContentPresentation {
  const summary = data?.resolvedContent;
  if (!summary) return { type: null, source: null };

  const type =
    summary.type === "layout"
      ? "Scene"
      : summary.type === "playlist"
        ? "Playlist"
        : null;
  const source =
    summary.source === "live-override"
      ? "Live Override"
      : summary.source === "block"
        ? "Scheduled"
        : summary.source === "fallback-layout" || summary.source === "fallback-playlist"
          ? "Fallback"
          : null;

  return { type, source };
}

/**
 * Resolve schedule presentation from the canonical summary when it exists.
 * The legacy block status is only a compatibility fallback for responses
 * that predate resolvedContent.
 */
export function getScreenPlaybackSchedulePresentation(
  data: ScreenPlaybackResponse | undefined,
): ScreenPlaybackSchedulePresentation {
  const resolved = data?.resolvedContent;
  if (resolved) {
    return {
      activeBlock: resolved.activeBlock,
      currentEffectiveEnd: resolved.currentEffectiveEnd,
      nextBlock: resolved.nextBlock,
      nextStart: resolved.nextStart,
    };
  }

  const block = data?.block;
  if (!block || block.kind === "noBlockToday" || block.kind === "noEvent") {
    return {
      activeBlock: null,
      currentEffectiveEnd: null,
      nextBlock: null,
      nextStart: null,
    };
  }
  if (block.kind === "playing") {
    return {
      activeBlock: { id: block.blockId, name: block.blockName },
      currentEffectiveEnd: block.endsAt,
      nextBlock: null,
      nextStart: null,
    };
  }
  return {
    activeBlock: null,
    currentEffectiveEnd: null,
    nextBlock: { id: block.blockId, name: block.blockName },
    nextStart: block.startsAt,
  };
}

export function getScreenPlaybackDisplay(
  data: ScreenPlaybackResponse | undefined,
  state: ScreenPlaybackQueryState = "ready",
): ScreenPlaybackDisplay {
  if (state === "loading") return { state, label: "Loading…", badge: null };
  if (state === "error") return { state, label: "Unable to load playback", badge: null };
  const summary = data?.resolvedContent;
  if (!summary) return { state: "none", label: "—", badge: null };
  const label = summary.name ?? (summary.type === "agenda" ? "Agenda" : "—");
  if (label === "—") return { state: "none", label, badge: null };
  const badge =
    summary.source === "live-override"
      ? "Override"
      : summary.source === "fallback-playlist"
        ? "Fallback Playlist"
        : summary.source === "fallback-layout"
          ? "Fallback Layout"
          : summary.source === "block"
            ? "Scheduled"
            : null;
  return { state: "resolved", label, badge };
}

export function screenPlaybackQueryOptions(screenId: string) {
  return {
    queryKey: ["/api/screens", screenId, "playback"] as const,
    queryFn: async (): Promise<ScreenPlaybackResponse> => {
      const res = await fetch(`/api/screens/${screenId}/playback`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load playback status");
      return res.json();
    },
    refetchInterval: 60_000,
  };
}

export function useScreenPlayback(screenId: string): UseQueryResult<ScreenPlaybackResponse, Error> {
  return useQuery(screenPlaybackQueryOptions(screenId));
}

export function ScreenBookingStatus({
  screenId,
  variant = "card",
  section = "all",
}: {
  screenId: string;
  variant?: "card" | "table";
  section?: "all" | "now" | "schedule";
}) {
  const { data, isError } = useScreenPlayback(screenId);

  const hhmm = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const dayTime = (d: Date) =>
    d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const tight = variant === "table";

  if (!data && !isError) {
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-playback-loading-${screenId}`}
      >
        Loading…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="text-sm text-destructive"
        data-testid={`text-screen-playback-error-${screenId}`}
      >
        Unable to load playback
      </div>
    );
  }

  const nowDisplay = getScreenPlaybackDisplay(data);
  const nowContentPresentation =
    nowDisplay.state === "resolved"
      ? getScreenPlaybackContentPresentation(data)
      : { type: null, source: null };
  const nowLabel = nowDisplay.label;
  const nowView =
    section !== "schedule" && (
      <div className="text-sm" data-testid={`text-screen-now-displaying-${screenId}`}>
        {!tight && <span className="font-medium">Now: </span>}
        <span className={nowLabel === "—" ? "text-muted-foreground" : tight ? "font-medium" : undefined}>
          {nowLabel}
        </span>
        {nowContentPresentation.type && (
          <span
            className="ml-1.5 text-xs text-muted-foreground"
            aria-label={`Type: ${nowContentPresentation.type}`}
            data-testid={`text-screen-content-type-${screenId}`}
          >
            Type: {nowContentPresentation.type}
          </span>
        )}
        {nowContentPresentation.source && (
          <span
            className="ml-1.5 text-xs text-muted-foreground"
            aria-label={`Source: ${nowContentPresentation.source}`}
            data-testid={`text-screen-content-source-${screenId}`}
          >
            Source: {nowContentPresentation.source}
          </span>
        )}
      </div>
    );

  if (section === "now") return nowView;

  const schedule = getScreenPlaybackSchedulePresentation(data);
  const activeBlock = schedule.activeBlock;
  const endsAt = schedule.currentEffectiveEnd
    ? new Date(schedule.currentEffectiveEnd)
    : null;
  const validEndsAt = endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null;
  const nextBlock = schedule.nextBlock;
  const nextStart = schedule.nextStart ? new Date(schedule.nextStart) : null;
  const validNextStart =
    nextStart && !Number.isNaN(nextStart.getTime()) ? nextStart : null;

  if (activeBlock) {
    return (
      <div className="text-sm" data-testid={`text-screen-now-playing-${screenId}`}>
        {nowView}
        <>
          {!tight && <span className="font-medium">Now: </span>}
          <span className={tight ? "font-medium" : undefined}>
            {data.activeEvent?.name ?? "Unknown event"} — {activeBlock.name ?? "Scheduled block"}
          </span>
          {validEndsAt && (
            <span className="text-muted-foreground"> · until {hhmm(validEndsAt)}</span>
          )}
        </>
        {nextBlock && (
          <div data-testid={`text-screen-next-block-${screenId}`}>
            {!tight && <span className="font-medium">Next: </span>}
            <span>{nextBlock.name ?? "Scheduled block"}</span>
            {validNextStart && <span> at {hhmm(validNextStart)}</span>}
          </div>
        )}
      </div>
    );
  }

  if (nextBlock) {
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-plays-next-${screenId}`}
      >
        {nowView}
        {!tight && <span className="font-medium">Plays </span>}
        <span>{nextBlock?.name ?? "Scheduled block"}</span>
        {validNextStart && <span> next at {hhmm(validNextStart)}</span>}
      </div>
    );
  }

  if (!data.resolvedContent && data.block.kind === "noBlockToday") {
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-no-block-today-${screenId}`}
      >
        {nowView}
        <span className="font-medium">{data.activeEvent?.name ?? "Event"}</span>
        <span> booked, but no block fires today</span>
      </div>
    );
  }

  if (data.nextBooking) {
    const startsAt = new Date(data.nextBooking.startsAt);
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-up-next-${screenId}`}
      >
        {nowView}
        {!tight && <span className="font-medium">Up next: </span>}
        <span>{data.nextBooking.eventName}</span>
        <span> · {dayTime(startsAt)}</span>
      </div>
    );
  }

  return (
    <div
      className="text-sm text-muted-foreground"
      data-testid={`text-screen-no-event-${screenId}`}
    >
      {nowView}
      No event today
    </div>
  );
}

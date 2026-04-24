import { useQuery } from "@tanstack/react-query";

export type PlaybackBlockStatus =
  | { kind: "playing"; blockId: string; blockName: string; endsAt: string }
  | { kind: "playsNext"; blockId: string; blockName: string; startsAt: string }
  | { kind: "noBlockToday" }
  | { kind: "noEvent" };

export interface ScreenPlaybackResponse {
  now: string;
  activeEvent: { id: string; name: string } | null;
  block: PlaybackBlockStatus;
  nextBooking: { eventId: string; eventName: string; startsAt: string } | null;
}

export function ScreenBookingStatus({
  screenId,
  variant = "card",
}: {
  screenId: string;
  variant?: "card" | "table";
}) {
  // /playback combines the active booking with the programme's schedule
  // blocks, so this matches what the player will actually serve.
  const { data } = useQuery<ScreenPlaybackResponse>({
    queryKey: ["/api/screens", screenId, "playback"],
    queryFn: async () => {
      const res = await fetch(`/api/screens/${screenId}/playback`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load playback status");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const hhmm = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const dayTime = (d: Date) =>
    d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // The table variant trims the "Now: " / "Plays " prefixes so the cell
  // reads tighter alongside other table columns. The card variant is the
  // existing dialog/card copy.
  const tight = variant === "table";

  if (!data) {
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-playback-loading-${screenId}`}
      >
        Loading…
      </div>
    );
  }

  if (data.block.kind === "playing") {
    const endsAt = new Date(data.block.endsAt);
    return (
      <div className="text-sm" data-testid={`text-screen-now-playing-${screenId}`}>
        {!tight && <span className="font-medium">Now: </span>}
        <span className={tight ? "font-medium" : undefined}>
          {data.activeEvent?.name ?? "Unknown event"} — {data.block.blockName}
        </span>
        <span className="text-muted-foreground"> · until {hhmm(endsAt)}</span>
      </div>
    );
  }

  if (data.block.kind === "playsNext") {
    const startsAt = new Date(data.block.startsAt);
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-plays-next-${screenId}`}
      >
        {!tight && <span className="font-medium">Plays </span>}
        <span>{data.block.blockName}</span>
        <span> next at {hhmm(startsAt)}</span>
      </div>
    );
  }

  if (data.block.kind === "noBlockToday") {
    return (
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-screen-no-block-today-${screenId}`}
      >
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
      No event today
    </div>
  );
}

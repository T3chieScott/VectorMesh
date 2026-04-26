import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ScreenEventBooking, Event } from "@shared/schema";
import type { BookingsClipboard } from "@/hooks/use-bookings-clipboard";

type RowStatus = "ready" | "overlap" | "no-event" | "no-event-access";

interface PreviewRow {
  index: number;
  eventId: string;
  startsAt: Date;
  endsAt: Date;
  eventName: string;
  status: RowStatus;
}

// Per-row server outcome — mirrors BulkBookingResult on the server.
type ServerResult =
  | { index: number; status: "created" }
  | {
      index: number;
      status: "error";
      code: "overlap" | "forbidden_event" | "event_not_found" | "bad_request" | "server_error";
      error: string;
    };

function statusBadge(status: RowStatus) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="outline" className="gap-1 border-green-500/40 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Will create
        </Badge>
      );
    case "overlap":
      return (
        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          Conflict (overlap)
        </Badge>
      );
    case "no-event":
      return (
        <Badge variant="outline" className="gap-1 border-muted-foreground/40 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          Skipped (event missing)
        </Badge>
      );
    case "no-event-access":
      return (
        <Badge variant="outline" className="gap-1 border-muted-foreground/40 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          Skipped (no access)
        </Badge>
      );
  }
}

function fmtRange(starts: Date, ends: Date): string {
  return `${format(starts, "d MMM HH:mm")} → ${format(ends, "d MMM HH:mm")}`;
}

interface PasteBookingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipboard: BookingsClipboard | null;
  targetScreen: { id: string; name: string } | null;
  events: Event[];
}

export function PasteBookingsDialog({
  open,
  onOpenChange,
  clipboard,
  targetScreen,
  events,
}: PasteBookingsDialogProps) {
  const { toast } = useToast();
  const [serverResults, setServerResults] = useState<ServerResult[] | null>(null);

  // Re-fetch on each open so the conflict preview reflects the
  // *current* set of bookings on the target screen, not whatever was
  // cached. The dialog stays mounted across opens (sibling of the
  // context menu), so we can't rely on refetchOnMount — instead we
  // explicitly refetch whenever `open` flips to true and the global
  // staleTime: Infinity setting is overridden with staleTime: 0.
  const {
    data: targetBookings = [],
    isLoading: isLoadingTarget,
    refetch: refetchTargetBookings,
  } = useQuery<ScreenEventBooking[]>({
    queryKey: ["/api/screens", targetScreen?.id, "bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/screens/${targetScreen!.id}/bookings`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load target bookings");
      return res.json();
    },
    enabled: open && !!targetScreen,
    staleTime: 0,
  });

  useEffect(() => {
    if (open && targetScreen) {
      void refetchTargetBookings();
    }
  }, [open, targetScreen?.id, refetchTargetBookings]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!clipboard) return [];
    const accessibleEventIds = new Set(events.map((e) => e.id));
    return clipboard.bookings.map((b, index) => {
      const startsAt = new Date(b.startsAt);
      const endsAt = new Date(b.endsAt);
      const event = events.find((e) => e.id === b.eventId);
      let status: RowStatus = "ready";
      if (!event) {
        // The events list passed in is the user's accessible events, so
        // a missing event means either the event was deleted or the
        // user can't see it. The server is authoritative — these will
        // come back as event_not_found / forbidden_event respectively.
        status = accessibleEventIds.size === 0 ? "no-event" : "no-event-access";
      } else {
        // Half-open `[start, end)` overlap, matching server semantics.
        const overlaps = targetBookings.some((tb) => {
          const tbStart = new Date(tb.startsAt).getTime();
          const tbEnd = new Date(tb.endsAt).getTime();
          return tbStart < endsAt.getTime() && tbEnd > startsAt.getTime();
        });
        if (overlaps) status = "overlap";
      }
      return {
        index,
        eventId: b.eventId,
        startsAt,
        endsAt,
        eventName: event?.name || "Unknown event",
        status,
      };
    });
  }, [clipboard, events, targetBookings]);

  const willCreateCount = previewRows.filter((r) => r.status === "ready").length;

  const pasteMutation = useMutation({
    mutationFn: async () => {
      if (!targetScreen || !clipboard) throw new Error("Nothing to paste");
      const res = await apiRequest(
        "POST",
        `/api/screens/${targetScreen.id}/bookings/bulk`,
        {
          bookings: clipboard.bookings.map((b) => ({
            eventId: b.eventId,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
          })),
        },
      );
      return (await res.json()) as { results: ServerResult[] };
    },
    onSuccess: (data) => {
      setServerResults(data.results);
      const created = data.results.filter((r) => r.status === "created").length;
      const total = data.results.length;
      const skipped = total - created;
      queryClient.invalidateQueries({
        queryKey: ["/api/screens", targetScreen?.id, "bookings"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/screen-bookings"] });
      toast({
        title:
          created === total
            ? `Pasted ${created} ${created === 1 ? "booking" : "bookings"}`
            : `Pasted ${created} of ${total} bookings`,
        description:
          skipped > 0
            ? `${skipped} skipped — see dialog for details.`
            : undefined,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to paste bookings";
      toast({ title: "Paste failed", description: msg, variant: "destructive" });
    },
  });

  function handleClose(next: boolean) {
    if (!next) setServerResults(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-paste-bookings">
        <DialogHeader>
          <DialogTitle>Paste bookings</DialogTitle>
          <DialogDescription>
            {clipboard && targetScreen ? (
              <span>
                From <span className="font-medium">{clipboard.sourceScreenName}</span> ({clipboard.bookings.length}
                {" "}
                {clipboard.bookings.length === 1 ? "booking" : "bookings"})
                {" → "}
                <span className="font-medium">{targetScreen.name}</span>
              </span>
            ) : (
              "Nothing on the clipboard."
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoadingTarget ? (
          <Skeleton className="h-32 w-full" />
        ) : previewRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings to paste.</p>
        ) : (
          <ul className="space-y-1.5" data-testid="list-paste-preview">
            {previewRows.map((row) => {
              const serverRow = serverResults?.find((r) => r.index === row.index);
              return (
                <li
                  key={row.index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  data-testid={`row-paste-preview-${row.index}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{row.eventName}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtRange(row.startsAt, row.endsAt)}
                    </div>
                  </div>
                  {serverRow ? (
                    serverRow.status === "created" ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-green-500/40 text-green-700 dark:text-green-400"
                        data-testid={`badge-paste-result-${row.index}`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Pasted
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
                        data-testid={`badge-paste-result-${row.index}`}
                      >
                        <XCircle className="h-3 w-3" />
                        {serverRow.code === "overlap"
                          ? "Conflict"
                          : serverRow.code === "event_not_found"
                          ? "Event missing"
                          : serverRow.code === "forbidden_event"
                          ? "No access"
                          : "Failed"}
                      </Badge>
                    )
                  ) : (
                    statusBadge(row.status)
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            data-testid="button-cancel-paste"
          >
            {serverResults ? "Close" : "Cancel"}
          </Button>
          {!serverResults && (
            <Button
              // The preview is advisory — the server is the source of
              // truth. Only block paste when there's literally nothing
              // to send (no clipboard rows) or while the target's
              // bookings are still loading. A predicted-zero
              // willCreateCount must NOT disable the button: it could
              // be wrong (stale data, the user being able to paste
              // events the client list doesn't include, etc.) and the
              // server will simply return per-row errors that we then
              // render in the result column.
              disabled={
                isLoadingTarget ||
                pasteMutation.isPending ||
                !targetScreen ||
                !clipboard ||
                clipboard.bookings.length === 0
              }
              onClick={() => pasteMutation.mutate()}
              data-testid="button-confirm-paste"
            >
              {pasteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {clipboard && clipboard.bookings.length > 0
                ? willCreateCount > 0 && willCreateCount < clipboard.bookings.length
                  ? `Paste ${clipboard.bookings.length} (${willCreateCount} ready)`
                  : `Paste ${clipboard.bookings.length} ${clipboard.bookings.length === 1 ? "booking" : "bookings"}`
                : "Nothing to paste"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

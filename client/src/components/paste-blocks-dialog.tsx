import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Monitor, XCircle } from "lucide-react";
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
import type {
  Programme,
  ProgrammeVersion,
  LayoutTemplate,
  Playlist,
  Screen,
  ScreenGroup,
  ScheduleBlock,
  ScheduleTarget,
  TimeRule,
  ZoneSource,
} from "@shared/schema";
import type { BlocksClipboard, ClipboardBlock } from "@/hooks/use-blocks-clipboard";
import {
  evaluateLayoutAccess,
  evaluatePlaylistAccess,
  evaluateTargetAccess,
} from "@shared/blockPasteAccess";

// Preview row status — purely client-side and advisory. The server is
// authoritative; once the user confirms the paste we replace each
// preview badge with the actual server outcome.
type PreviewStatus =
  | "ready"
  | "targets-reset"
  | "skipped-layout"
  | "skipped-playlist";

interface PreviewRow {
  index: number;
  block: ClipboardBlock;
  status: PreviewStatus;
  droppedTargetCount: number;
  layoutName: string | null;
}

type ServerResultCode =
  | "forbidden_target"
  | "target_not_found"
  | "forbidden_layout"
  | "forbidden_playlist"
  | "bad_request"
  | "server_error";

type ServerResult =
  | {
      index: number;
      status: "created";
      block: ScheduleBlock;
      droppedTargets: ScheduleTarget[];
    }
  | {
      index: number;
      status: "error";
      code: ServerResultCode;
      error: string;
    };

interface BulkResponse {
  destinationVersionId: string;
  draftCreated: boolean;
  results: ServerResult[];
}

interface DestinationContext {
  programme: Programme;
  // Effective client id of the destination (from its event). Pulled
  // from the parent so we don't refetch the event here.
  destinationClientId: string | null;
  // The destination's draft (or, if none yet, its published) version.
  // Used only to refetch existing blocks for context; the bulk
  // endpoint will create a draft itself if the destination has only
  // a published version.
  targetVersionId: string | null;
}

function previewBadge(status: PreviewStatus, droppedCount: number) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="outline" className="gap-1 border-green-500/40 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Will create
        </Badge>
      );
    case "targets-reset":
      return (
        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          Targets reset
          {droppedCount > 0 ? ` (${droppedCount})` : ""}
        </Badge>
      );
    case "skipped-layout":
      return (
        <Badge variant="outline" className="gap-1 border-muted-foreground/40 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          Skipped — scene
        </Badge>
      );
    case "skipped-playlist":
      return (
        <Badge variant="outline" className="gap-1 border-muted-foreground/40 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          Skipped — playlist
        </Badge>
      );
  }
}

function serverBadge(result: ServerResult) {
  if (result.status === "created") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-green-500/40 text-green-700 dark:text-green-400"
        data-testid={`badge-paste-block-result-${result.index}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        Pasted
        {result.droppedTargets.length > 0
          ? ` (${result.droppedTargets.length} target${result.droppedTargets.length === 1 ? "" : "s"} dropped)`
          : ""}
      </Badge>
    );
  }
  const label =
    result.code === "forbidden_layout"
      ? "No access — scene"
      : result.code === "forbidden_playlist"
      ? "No access — playlist"
      : result.code === "forbidden_target"
      ? "No access — target"
      : result.code === "target_not_found"
      ? "Target missing"
      : result.code === "bad_request"
      ? "Bad input"
      : "Failed";
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
      data-testid={`badge-paste-block-result-${result.index}`}
    >
      <XCircle className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function summariseTimeRule(rules: TimeRule[]): string {
  const r = rules[0];
  if (!r) return "Always";
  const parts: string[] = [];
  if (r.startTime && r.endTime) parts.push(`${r.startTime}–${r.endTime}`);
  if (r.startDate) parts.push(`from ${r.startDate}`);
  if (r.endDate) parts.push(`to ${r.endDate}`);
  if (r.daysOfWeek && r.daysOfWeek.length > 0 && r.daysOfWeek.length < 7) {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    parts.push(r.daysOfWeek.map((d) => labels[d] ?? "?").join("/"));
  }
  return parts.length === 0 ? "Always" : parts.join(" • ");
}

function summariseTargets(
  targets: ScheduleTarget[],
  screens: Screen[],
  groups: ScreenGroup[],
): string {
  if (targets.length === 0) return "All screens";
  return targets
    .map((t) => {
      if (t.type === "screen") {
        return screens.find((s) => s.id === t.id)?.name ?? "Unknown screen";
      }
      return groups.find((g) => g.id === t.id)?.name ?? "Unknown group";
    })
    .join(", ");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipboard: BlocksClipboard | null;
  destination: DestinationContext | null;
  // Caller passes the lookup tables used for the preview; these are
  // already loaded on the programmes page.
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
}

export function PasteBlocksDialog({
  open,
  onOpenChange,
  clipboard,
  destination,
  layouts,
  playlists,
  screens,
  screenGroups,
}: Props) {
  const { toast } = useToast();
  const [serverResults, setServerResults] = useState<ServerResult[] | null>(null);

  // Re-fetch the destination's blocks each time the dialog opens, so
  // the preview uses fresh data even when navigating between
  // programmes. The dialog is mounted as a sibling of the trigger and
  // the global staleTime is Infinity, so we explicitly refetch here.
  const {
    data: existingBlocks = [],
    isLoading: isLoadingTarget,
    refetch: refetchTargetBlocks,
  } = useQuery<ScheduleBlock[]>({
    queryKey: ["/api/programme-versions", destination?.targetVersionId, "blocks"],
    queryFn: async () => {
      if (!destination?.targetVersionId) return [];
      const res = await fetch(
        `/api/programme-versions/${destination.targetVersionId}/blocks`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load destination blocks");
      return res.json();
    },
    enabled: open && !!destination?.targetVersionId,
    staleTime: 0,
  });

  useEffect(() => {
    if (open && destination?.targetVersionId) {
      void refetchTargetBlocks();
    }
  }, [open, destination?.targetVersionId, refetchTargetBlocks]);

  // Lookup maps for fast preview.
  const layoutMap = useMemo(() => new Map(layouts.map((l) => [l.id, l])), [layouts]);
  const playlistMap = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);
  const screenMap = useMemo(() => new Map(screens.map((s) => [s.id, s])), [screens]);
  const groupMap = useMemo(() => new Map(screenGroups.map((g) => [g.id, g])), [screenGroups]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!clipboard || !destination) return [];
    const destClientId = destination.destinationClientId;
    // The preview is advisory — the server is authoritative for the
    // caller's own client-access check, so on the client we always
    // pass `() => true` here. The shared predicate still applies the
    // "destination client owns this layout/playlist" rules, which is
    // what the user actually needs to see in the preview.
    const allowAll = () => true;

    return clipboard.blocks.map((block, index) => {
      const layout = block.layoutTemplateId ? layoutMap.get(block.layoutTemplateId) : null;
      const layoutName = layout?.name ?? null;

      // Layout check (shared predicate).
      const layoutDecision = evaluateLayoutAccess({
        layoutId: block.layoutTemplateId,
        layout: layout ?? null,
        destinationClientId: destClientId,
        canAccessClient: allowAll,
      });
      if (!layoutDecision.ok) {
        return {
          index,
          block,
          status: "skipped-layout" as const,
          droppedTargetCount: 0,
          layoutName,
        };
      }

      // Playlist check on each zoneSource (shared predicate).
      const zoneSources = (block.zoneSources ?? []) as ZoneSource[];
      for (const zs of zoneSources) {
        if (zs.type === "playlist" && zs.playlistId) {
          const pl = playlistMap.get(zs.playlistId);
          const playlistDecision = evaluatePlaylistAccess({
            playlistId: zs.playlistId,
            playlist: pl ?? null,
            destinationClientId: destClientId,
            canAccessClient: allowAll,
          });
          if (!playlistDecision.ok) {
            return {
              index,
              block,
              status: "skipped-playlist" as const,
              droppedTargetCount: 0,
              layoutName,
            };
          }
        }
      }

      // Target check: count how many would be dropped (shared predicate).
      const targets = (block.targets ?? []) as ScheduleTarget[];
      let dropped = 0;
      for (const t of targets) {
        const entity =
          t.type === "screen"
            ? screenMap.get(t.id) ?? null
            : t.type === "group"
            ? groupMap.get(t.id) ?? null
            : null;
        const targetDecision = evaluateTargetAccess({
          type: t.type,
          entity: entity ? { id: entity.id, clientId: entity.clientId ?? null } : null,
          destinationClientId: destClientId,
        });
        if (!targetDecision.ok) dropped++;
      }

      const status: PreviewStatus = dropped > 0 ? "targets-reset" : "ready";
      return { index, block, status, droppedTargetCount: dropped, layoutName };
    });
  }, [clipboard, destination, layoutMap, playlistMap, screenMap, groupMap]);

  const totalCount = previewRows.length;
  const skippableCount = previewRows.filter(
    (r) => r.status === "skipped-layout" || r.status === "skipped-playlist",
  ).length;

  const pasteMutation = useMutation({
    mutationFn: async () => {
      if (!destination || !clipboard) throw new Error("Nothing to paste");
      const res = await apiRequest(
        "POST",
        `/api/programmes/${destination.programme.id}/blocks/bulk`,
        {
          sourceProgrammeId: clipboard.sourceProgrammeId,
          blocks: clipboard.blocks.map((b) => ({
            name: b.name,
            priority: b.priority,
            layoutTemplateId: b.layoutTemplateId,
            targets: b.targets,
            timeRules: b.timeRules,
            zoneSources: b.zoneSources,
          })),
        },
      );
      return (await res.json()) as BulkResponse;
    },
    onSuccess: (data) => {
      setServerResults(data.results);
      const created = data.results.filter((r) => r.status === "created").length;
      const total = data.results.length;
      const skipped = total - created;
      // Invalidate both the destination version's block list and the
      // top-level programmes list (so version-status badges and the
      // version count refresh if a draft was just created).
      queryClient.invalidateQueries({
        queryKey: ["/api/programme-versions", data.destinationVersionId, "blocks"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
      toast({
        title:
          created === total
            ? `Pasted ${created} ${created === 1 ? "block" : "blocks"}`
            : `Pasted ${created} of ${total} blocks`,
        description: data.draftCreated
          ? "Created a draft on the destination programme — publish to update screens."
          : skipped > 0
          ? `${skipped} skipped — see dialog for details.`
          : undefined,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to paste blocks";
      toast({ title: "Paste failed", description: msg, variant: "destructive" });
    },
  });

  function handleClose(next: boolean) {
    if (!next) setServerResults(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-paste-blocks">
        <DialogHeader>
          <DialogTitle>Paste blocks</DialogTitle>
          <DialogDescription>
            {clipboard && destination ? (
              <span>
                From <span className="font-medium">{clipboard.sourceProgrammeName}</span> ({clipboard.blocks.length}
                {" "}
                {clipboard.blocks.length === 1 ? "block" : "blocks"})
                {" → "}
                <span className="font-medium">{destination.programme.name}</span>
                {!destination.targetVersionId && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    A draft will be created on the destination to receive these blocks.
                  </span>
                )}
              </span>
            ) : (
              "Nothing on the clipboard."
            )}
          </DialogDescription>
        </DialogHeader>

        {existingBlocks.length > 0 && !serverResults && (
          <p className="text-xs text-muted-foreground" data-testid="text-paste-existing-blocks">
            Destination already has {existingBlocks.length} block{existingBlocks.length === 1 ? "" : "s"}; pasted blocks
            will be added (not replaced).
          </p>
        )}

        {isLoadingTarget ? (
          <Skeleton className="h-32 w-full" />
        ) : previewRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocks to paste.</p>
        ) : (
          <ul className="space-y-1.5" data-testid="list-paste-blocks-preview">
            {previewRows.map((row) => {
              const serverRow = serverResults?.find((r) => r.index === row.index);
              return (
                <li
                  key={row.index}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2 text-sm"
                  data-testid={`row-paste-block-preview-${row.index}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{row.block.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {summariseTimeRule(row.block.timeRules)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Monitor className="h-3 w-3" />
                        {summariseTargets(row.block.targets, screens, screenGroups)}
                      </span>
                      <span>• P{row.block.priority}</span>
                      {row.layoutName && <span>• {row.layoutName}</span>}
                    </div>
                    {!serverRow && row.status === "targets-reset" && row.droppedTargetCount > 0 && (
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {row.droppedTargetCount} target{row.droppedTargetCount === 1 ? "" : "s"} not in destination —
                        will be removed.
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {serverRow ? serverBadge(serverRow) : previewBadge(row.status, row.droppedTargetCount)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            data-testid="button-cancel-paste-blocks"
          >
            {serverResults ? "Close" : "Cancel"}
          </Button>
          {!serverResults && (
            <Button
              // The preview is advisory — the server is authoritative.
              // We only block paste when there's literally nothing to
              // send (no clipboard rows) or while the destination's
              // existing blocks are still loading. A predicted-zero
              // skippable count must NOT disable the button: the
              // server might still accept rows the client preview
              // misjudged (e.g. a layout the user can't see but the
              // destination's client owns).
              disabled={
                isLoadingTarget ||
                pasteMutation.isPending ||
                !destination ||
                !clipboard ||
                clipboard.blocks.length === 0
              }
              onClick={() => pasteMutation.mutate()}
              data-testid="button-confirm-paste-blocks"
            >
              {pasteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {clipboard && clipboard.blocks.length > 0
                ? `Paste ${totalCount - skippableCount} of ${clipboard.blocks.length} ${clipboard.blocks.length === 1 ? "block" : "blocks"}`
                : "Nothing to paste"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

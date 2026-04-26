import { useState, type ReactNode } from "react";
import { ClipboardCopy, ClipboardPaste, Layers, Loader2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { useBlocksClipboard } from "@/hooks/use-blocks-clipboard";
import { PasteBlocksDialog } from "@/components/paste-blocks-dialog";
import type {
  Programme,
  ProgrammeVersion,
  ScheduleBlock,
  LayoutTemplate,
  Playlist,
  Screen,
  ScreenGroup,
} from "@shared/schema";

// Wrapper component used in two places on the programmes page:
//
// 1. Around an individual schedule-block row — shows Copy block /
//    Copy series (when the block has a seriesId) plus the shared
//    Paste action. `block` and `version` are required in this mode.
//
// 2. Around the block-list "section" in a programme card / Manage
//    Blocks dialog — shows Copy all blocks plus the shared Paste
//    action. `block` is omitted; `allBlocks` is the full list to copy.
//
// The Paste menu item is the same in both modes: it only appears when
// the clipboard is non-empty, and opens the shared paste dialog
// targeted at this programme.
interface SharedProps {
  programme: Programme;
  // Destination programme version (preferring published over draft)
  // we use to fetch existing blocks for the preview. The bulk
  // endpoint will create a draft itself if none exists yet.
  targetVersion: ProgrammeVersion | null;
  destinationClientId: string | null;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  // Source data for the Copy menus.
  sourceVersion: ProgrammeVersion;
  // For block-level menus: the single block being right-clicked.
  block?: ScheduleBlock;
  // For section-level menus: all blocks in the source version.
  allBlocks?: ScheduleBlock[];
  // Caller's children become the trigger element. asChild keeps the
  // right-click handler on the existing DOM node so we don't break
  // surrounding flex/grid layout.
  asChild?: boolean;
  children: ReactNode;
}

async function fetchBlocksForVersion(versionId: string): Promise<ScheduleBlock[]> {
  const res = await fetch(`/api/programme-versions/${versionId}/blocks`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load blocks");
  return res.json();
}

export function ProgrammeBlocksContextMenu({
  programme,
  targetVersion,
  destinationClientId,
  layouts,
  playlists,
  screens,
  screenGroups,
  sourceVersion,
  block,
  allBlocks,
  asChild = true,
  children,
}: SharedProps) {
  const { toast } = useToast();
  const { clipboard, copyFrom } = useBlocksClipboard();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const isBlockMenu = !!block;
  const seriesId = block?.seriesId ?? null;

  async function copyOne() {
    if (!block) return;
    setCopying(true);
    try {
      copyFrom(
        {
          programmeId: programme.id,
          programmeName: programme.name,
          versionId: sourceVersion.id,
        },
        [block],
      );
      toast({
        title: "Copied 1 block",
        description: `From ${programme.name}. Right-click another programme and choose Paste blocks.`,
      });
    } finally {
      setCopying(false);
    }
  }

  async function copySeries() {
    if (!block || !seriesId) return;
    setCopying(true);
    try {
      // Fetch fresh — the user may have added/removed series rows
      // since the page loaded. We filter from the version's blocks
      // rather than calling a series-specific endpoint to keep the
      // surface small and consistent with copyAll below.
      const all = await fetchBlocksForVersion(sourceVersion.id);
      const series = all.filter((b) => b.seriesId === seriesId);
      copyFrom(
        {
          programmeId: programme.id,
          programmeName: programme.name,
          versionId: sourceVersion.id,
        },
        series,
      );
      toast({
        title: `Copied ${series.length} ${series.length === 1 ? "block" : "blocks"} (series)`,
        description: `From ${programme.name}. Right-click another programme and choose Paste blocks.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to copy series";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  }

  async function copyAll() {
    setCopying(true);
    try {
      // Prefer a fresh fetch over the prop-supplied list so the
      // clipboard never captures a stale view of the source.
      const fresh = allBlocks ?? (await fetchBlocksForVersion(sourceVersion.id));
      copyFrom(
        {
          programmeId: programme.id,
          programmeName: programme.name,
          versionId: sourceVersion.id,
        },
        fresh,
      );
      toast({
        title: fresh.length === 0
          ? "Copied 0 blocks"
          : `Copied ${fresh.length} ${fresh.length === 1 ? "block" : "blocks"}`,
        description: fresh.length === 0
          ? "This programme has no blocks to copy."
          : `From ${programme.name}. Right-click another programme and choose Paste blocks.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to copy blocks";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  }

  const canPaste =
    !!clipboard &&
    clipboard.blocks.length > 0 &&
    clipboard.sourceProgrammeId !== programme.id;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          asChild={asChild}
          data-testid={isBlockMenu
            ? `context-trigger-block-${block!.id}`
            : `context-trigger-blocks-section-${programme.id}`}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[14rem]">
          <ContextMenuLabel className="text-xs text-muted-foreground">
            {isBlockMenu ? block!.name : programme.name}
          </ContextMenuLabel>
          <ContextMenuSeparator />
          {isBlockMenu ? (
            <>
              <ContextMenuItem
                disabled={copying}
                onSelect={(e) => {
                  e.preventDefault();
                  void copyOne();
                }}
                data-testid={`context-copy-block-${block!.id}`}
              >
                {copying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCopy className="mr-2 h-4 w-4" />
                )}
                Copy block
              </ContextMenuItem>
              {/*
                Spec calls for "Copy series" to always be visible so
                the right-click menu shape is predictable. When the
                block isn't part of a series we render the item but
                disable it with a tooltip-friendly title attribute,
                rather than hiding it conditionally.
              */}
              <ContextMenuItem
                disabled={copying || !seriesId}
                title={!seriesId ? "This block is not part of a series" : undefined}
                onSelect={(e) => {
                  e.preventDefault();
                  if (!seriesId) return;
                  void copySeries();
                }}
                data-testid={`context-copy-series-${block!.id}`}
              >
                <Layers className="mr-2 h-4 w-4" />
                Copy series
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuItem
              disabled={copying}
              onSelect={(e) => {
                e.preventDefault();
                void copyAll();
              }}
              data-testid={`context-copy-all-blocks-${programme.id}`}
            >
              {copying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCopy className="mr-2 h-4 w-4" />
              )}
              Copy all blocks
            </ContextMenuItem>
          )}
          {!isBlockMenu && clipboard && clipboard.blocks.length > 0 && (
            // Paste lives on the SECTION-level menu only — the spec
            // is explicit that the paste affordance belongs to the
            // block-list area, not individual rows. The clipboard
            // also has to be non-empty for it to appear at all
            // (matches the bookings copy/paste flow). It's
            // rendered-but-disabled when the target is the same as
            // the source so the user gets a clear reason rather
            // than a silently missing option.
            <ContextMenuItem
              disabled={!canPaste}
              onSelect={(e) => {
                e.preventDefault();
                setPasteOpen(true);
              }}
              data-testid={`context-paste-blocks-${programme.id}`}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              {`Paste ${clipboard.blocks.length} ${clipboard.blocks.length === 1 ? "block" : "blocks"}`}
              <span className="ml-auto pl-2 text-xs text-muted-foreground truncate max-w-[7rem]">
                from {clipboard.sourceProgrammeName}
              </span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <PasteBlocksDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        clipboard={clipboard}
        destination={{
          programme,
          destinationClientId,
          targetVersionId: targetVersion?.id ?? null,
        }}
        layouts={layouts}
        playlists={playlists}
        screens={screens}
        screenGroups={screenGroups}
      />
    </>
  );
}

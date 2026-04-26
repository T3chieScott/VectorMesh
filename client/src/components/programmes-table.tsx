import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle2,
  FileEdit,
  Layers,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProgrammeBlocksContextMenu } from "@/components/programme-blocks-context-menu";
import type {
  Programme,
  Event,
  ProgrammeVersion,
  LayoutTemplate,
  Playlist,
  Screen,
  ScreenGroup,
} from "@shared/schema";

type ColumnId = "name" | "event" | "version" | "updated";

interface ColumnDef {
  id: ColumnId;
  label: string;
}

const COLUMNS: Record<ColumnId, ColumnDef> = {
  name: { id: "name", label: "Name" },
  event: { id: "event", label: "Event" },
  version: { id: "version", label: "Latest version" },
  updated: { id: "updated", label: "Updated" },
};

const COLUMN_ORDER: ColumnId[] = ["name", "event", "version", "updated"];

interface VersionInfo {
  state: "published" | "draft" | "none";
  publishedAt: Date | null;
  draftAvailable: boolean;
}

function describeVersion(versions: ProgrammeVersion[], programmeId: string): VersionInfo {
  const mine = versions.filter((v) => v.programmeId === programmeId);
  const published = mine.find((v) => v.status === "published");
  const draft = mine.find((v) => v.status === "draft");
  if (published) {
    return {
      state: "published",
      publishedAt: published.publishedAt ? new Date(published.publishedAt) : null,
      draftAvailable: !!draft,
    };
  }
  if (draft) {
    return { state: "draft", publishedAt: null, draftAvailable: true };
  }
  return { state: "none", publishedAt: null, draftAvailable: false };
}

interface ProgrammesTableProps {
  programmes: Programme[];
  events: Event[];
  versions: ProgrammeVersion[];
  // Lookup tables threaded through so each row can host the same
  // copy/paste right-click menu as the cards view. The menu uses
  // these to render its paste-preview without an extra fetch.
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  onEdit: (programme: Programme) => void;
  onManageBlocks: (programme: Programme) => void;
  onPublish: (programme: Programme) => void;
  onDelete: (programme: Programme) => void;
}

export function ProgrammesTable({
  programmes,
  events,
  versions,
  layouts,
  playlists,
  screens,
  screenGroups,
  onEdit,
  onManageBlocks,
  onPublish,
  onDelete,
}: ProgrammesTableProps) {
  const [sort, setSort] = useState<{ column: ColumnId | null; dir: "asc" | "desc" }>({
    column: null,
    dir: "asc",
  });

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e] as const)), [events]);
  const versionByProgramme = useMemo(() => {
    const map = new Map<string, VersionInfo>();
    for (const p of programmes) map.set(p.id, describeVersion(versions, p.id));
    return map;
  }, [programmes, versions]);
  // Resolve the actual version row to use as the source/target for
  // the right-click copy/paste menu — preferring the draft so the
  // preview reflects what the bulk-paste handler will mutate. Same
  // shape as the cards view: missing entries (programmes with no
  // versions yet) still get the wrapper, but with a null
  // sourceVersion — the menu component then shows only Paste, since
  // the bulk-paste handler will auto-create a draft on the
  // destination.
  const sourceVersionByProgramme = useMemo(() => {
    const map = new Map<string, ProgrammeVersion>();
    for (const p of programmes) {
      const mine = versions.filter((v) => v.programmeId === p.id);
      const draft = mine.find((v) => v.status === "draft");
      const published = mine.find((v) => v.status === "published");
      const chosen = draft ?? published;
      if (chosen) map.set(p.id, chosen);
    }
    return map;
  }, [programmes, versions]);

  const toggleSort = (column: ColumnId) => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { column, dir: "asc" };
    });
  };

  const sortValue = (programme: Programme, column: ColumnId): string | number | null => {
    switch (column) {
      case "name":
        return programme.name?.toLowerCase() ?? "";
      case "event": {
        const event = eventById.get(programme.eventId);
        return (event?.name ?? "").toLowerCase();
      }
      case "version": {
        const v = versionByProgramme.get(programme.id);
        if (!v) return 2;
        // Sort: published first, draft next, none last.
        if (v.state === "published") return 0;
        if (v.state === "draft") return 1;
        return 2;
      }
      case "updated": {
        return programme.updatedAt ? new Date(programme.updatedAt).getTime() : null;
      }
      default:
        return "";
    }
  };

  const sortedProgrammes = useMemo(() => {
    if (sort.column == null) {
      // Default: preserve incoming order (server-side display_order, then created_at).
      return programmes;
    }
    const column = sort.column;
    const dir = sort.dir === "asc" ? 1 : -1;
    const arr = [...programmes];
    arr.sort((a, b) => {
      const av = sortValue(a, column);
      const bv = sortValue(b, column);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return arr;
  }, [programmes, sort, eventById, versionByProgramme]);

  return (
    <div className="rounded-md border bg-card">
      <Table data-testid="table-programmes">
        <TableHeader>
          <TableRow>
            {COLUMN_ORDER.map((id) => {
              const col = COLUMNS[id];
              const isSorted = sort.column === id;
              return (
                <TableHead key={id} className="select-none" data-testid={`column-header-${id}`}>
                  <button
                    type="button"
                    onClick={() => toggleSort(id)}
                    className={cn(
                      "flex items-center gap-1.5 text-left font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
                    )}
                    data-testid={`button-sort-${id}`}
                  >
                    <span>{col.label}</span>
                    {isSorted ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </TableHead>
              );
            })}
            <TableHead className="w-10 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProgrammes.map((programme) => {
            const event = eventById.get(programme.eventId);
            const v = versionByProgramme.get(programme.id) ?? {
              state: "none" as const,
              publishedAt: null,
              draftAvailable: false,
            };
            const sourceVersion = sourceVersionByProgramme.get(programme.id);
            // Right-click menu wrapping the entire row. Only mounted
            // when a version exists (mirrors the cards-view gating);
            // version-less rows still render but without copy/paste.
            // The dropdown actions button (...) inside the row keeps
            // working — its on-click opens its own menu, and a
            // right-click on it bubbles up to the row-level menu.
            const row = (
              <TableRow key={programme.id} data-testid={`row-programme-${programme.id}`}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onEdit(programme)}
                    className="text-left font-medium hover:underline"
                    data-testid={`link-programme-name-${programme.id}`}
                  >
                    <span data-testid={`text-programme-name-row-${programme.id}`}>
                      {programme.name}
                    </span>
                  </button>
                  {programme.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {programme.description}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {event ? (
                    <span data-testid={`text-programme-event-row-${programme.id}`}>{event.name}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {v.state === "published" ? (
                    <Badge className="bg-green-500/10 text-green-600 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Published
                    </Badge>
                  ) : v.state === "draft" ? (
                    <Badge variant="secondary" className="gap-1">
                      <FileEdit className="h-3 w-3" />
                      Draft
                    </Badge>
                  ) : (
                    <Badge variant="outline">No versions</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {programme.updatedAt ? (
                    <span
                      className="text-muted-foreground"
                      title={new Date(programme.updatedAt).toLocaleString()}
                      data-testid={`text-programme-updated-row-${programme.id}`}
                    >
                      {formatDistanceToNow(new Date(programme.updatedAt), { addSuffix: true })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Row actions"
                        data-testid={`button-row-actions-${programme.id}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => onEdit(programme)}
                        data-testid={`menu-edit-row-${programme.id}`}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onManageBlocks(programme)}
                        data-testid={`menu-manage-blocks-row-${programme.id}`}
                      >
                        <Layers className="mr-2 h-4 w-4" />
                        Manage Blocks
                      </DropdownMenuItem>
                      {v.draftAvailable && (
                        <DropdownMenuItem
                          onSelect={() => onPublish(programme)}
                          data-testid={`menu-publish-row-${programme.id}`}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Publish
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onDelete(programme)}
                        data-testid={`menu-delete-row-${programme.id}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
            // Always wrap with the menu — when the programme has no
            // versions yet, sourceVersion is undefined and the menu
            // renders only Paste (the bulk-paste handler creates a
            // draft on the destination). The menu component itself
            // bails out of wrapping when neither Copy nor Paste
            // would render, so version-less rows without a non-empty
            // clipboard still get the browser's native right-click.
            return (
              <ProgrammeBlocksContextMenu
                key={programme.id}
                programme={programme}
                targetVersion={sourceVersion ?? null}
                destinationClientId={event?.clientId ?? null}
                layouts={layouts}
                playlists={playlists}
                screens={screens}
                screenGroups={screenGroups}
                sourceVersion={sourceVersion ?? null}
              >
                {row}
              </ProgrammeBlocksContextMenu>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

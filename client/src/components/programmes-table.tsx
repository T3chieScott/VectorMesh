import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle2,
  FileEdit,
  GripVertical,
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
import type { Programme, Event, ProgrammeVersion } from "@shared/schema";

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
  onEdit: (programme: Programme) => void;
  onManageBlocks: (programme: Programme) => void;
  onPublish: (programme: Programme) => void;
  onDelete: (programme: Programme) => void;
}

export function ProgrammesTable({
  programmes,
  events,
  versions,
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
            return (
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
          })}
        </TableBody>
      </Table>
    </div>
  );
}

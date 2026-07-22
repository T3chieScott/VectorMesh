import { useState } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Folder, Check } from "lucide-react";
import type { LayoutTemplate } from "@shared/schema";

// Same storage key as the Scenes page sidebar, so collapsing a folder
// there keeps it collapsed in this picker too (and vice versa).
export const CLOSED_SCENE_FOLDERS_STORAGE_KEY = "vectormesh_scenes_closed_folders";

// Folder-grouped scene picker for schedule block editors. Renders the
// site's scene folders as collapsible sections inside a popover, with
// collapse state persisted to localStorage (shared with the Scenes page
// and the Programmes block editor).
// The /api/layouts response is augmented server-side with `folderName` so
// that SceneFolderSelect can group without a separate network fetch.
export type LayoutWithFolder = LayoutTemplate & { folderName?: string | null };

export function SceneFolderSelect({
  layouts,
  value,
  onChange,
}: {
  layouts: LayoutWithFolder[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closedKeys, setClosedKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(CLOSED_SCENE_FOLDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((k): k is string => typeof k === "string"));
        }
      }
    } catch {
      // Corrupt/blocked storage — fall back to everything open.
    }
    return new Set<string>();
  });

  const toggleFolder = (key: string) => {
    setClosedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      try {
        localStorage.setItem(
          CLOSED_SCENE_FOLDERS_STORAGE_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // Storage unavailable — collapse state just won't persist.
      }
      return next;
    });
  };

  // Derive folder sections from the folderName/folderId already on each layout
  // (server attaches folderName in the /api/layouts response).
  const folderOrder: string[] = [];
  const folderNames: Record<string, string> = {};
  const byFolder: Record<string, LayoutWithFolder[]> = {};
  for (const l of layouts) {
    if (l.folderId && l.folderName) {
      if (!byFolder[l.folderId]) {
        folderOrder.push(l.folderId);
        folderNames[l.folderId] = l.folderName;
        byFolder[l.folderId] = [];
      }
      byFolder[l.folderId].push(l);
    }
  }
  const assignedFolderIds = new Set(folderOrder);
  const sections: Array<{ key: string; name: string; layouts: LayoutWithFolder[] }> = folderOrder.map(
    (fid) => ({ key: fid, name: folderNames[fid], layouts: byFolder[fid] }),
  );
  const uncategorised = layouts.filter((l) => !l.folderId || !assignedFolderIds.has(l.folderId));
  const hasFolderSections = sections.length > 0;
  if (uncategorised.length > 0) {
    sections.push({ key: "__uncategorised__", name: "Uncategorised", layouts: uncategorised });
  }

  const selected = value && value !== "none" ? layouts.find((l) => l.id === value) : undefined;

  const renderSceneOption = (layout: LayoutTemplate, indent: boolean) => {
    const isSelected = layout.id === value;
    return (
      <button
        key={layout.id}
        type="button"
        onClick={() => {
          onChange(layout.id);
          setOpen(false);
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-muted",
          indent && "pl-7",
          isSelected && "bg-muted",
        )}
        data-testid={`option-block-scene-${layout.id}`}
      >
        <span className="truncate flex-1">{layout.name}</span>
        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          data-testid="select-block-layout"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Select scene"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1 max-h-72 overflow-y-auto" align="start">
        <button
          type="button"
          onClick={() => {
            onChange("none");
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-muted",
            (!value || value === "none") && "bg-muted",
          )}
          data-testid="option-block-scene-none"
        >
          <span className="truncate flex-1 text-muted-foreground">No scene</span>
          {(!value || value === "none") && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </button>
        {!hasFolderSections
          ? layouts.map((l) => renderSceneOption(l, false))
          : sections.map((section) => {
              const isOpen = !closedKeys.has(section.key);
              return (
                <div key={section.key}>
                  <button
                    type="button"
                    onClick={() => toggleFolder(section.key)}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    data-testid={`button-block-scene-folder-${section.key}`}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{section.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums">
                      {section.layouts.length}
                    </span>
                  </button>
                  {isOpen && section.layouts.map((l) => renderSceneOption(l, true))}
                </div>
              );
            })}
        {layouts.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground" data-testid="text-block-scene-empty">
            No scenes on this site
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

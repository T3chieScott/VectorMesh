import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useSiteFilteredQuery, useSiteContext } from "@/hooks/use-site-context";
import { useAuth } from "@/hooks/use-auth";
import { Plus, MoreHorizontal, Pencil, Trash2, FolderOpen, Image, Calendar, ChevronDown, ChevronUp, ListVideo, Clock, Layers, GripVertical, Play, LayoutGrid, AlertTriangle } from "lucide-react";
import type { Playlist, Event, MediaAsset, PlaylistItem, LayoutTemplate, Client } from "@shared/schema";

const playlistFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  eventId: z.string().optional(),
  clientId: z.string().min(1, "Site is required"),
});

type PlaylistFormValues = z.infer<typeof playlistFormSchema>;

const mediaItemFormSchema = z.object({
  itemType: z.literal("media"),
  mediaAssetId: z.string().min(1, "Media is required"),
  layoutTemplateId: z.string().optional(),
  duration: z.number().min(1, "Duration must be at least 1 second").optional(),
  order: z.number().min(0).optional(),
});

const layoutItemFormSchema = z.object({
  itemType: z.literal("layout"),
  mediaAssetId: z.string().optional(),
  layoutTemplateId: z.string().min(1, "Scene is required"),
  duration: z.number().min(1, "Duration must be at least 1 second").optional(),
  order: z.number().min(0).optional(),
});

const itemFormSchema = z.discriminatedUnion("itemType", [mediaItemFormSchema, layoutItemFormSchema]);

type ItemFormValues = z.infer<typeof itemFormSchema>;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function ItemEditorDialog({
  playlistId,
  item,
  mediaAssets,
  layouts,
  open,
  onOpenChange,
  defaultType,
  onSubmit,
}: {
  playlistId: string;
  item?: PlaylistItem;
  mediaAssets: MediaAsset[];
  layouts: LayoutTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "media" | "layout";
  onSubmit?: (values: ItemFormValues) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!item;
  const buffered = !!onSubmit;
  const initialType = item ? (item.layoutTemplateId ? "layout" : "media") : (defaultType || "media");

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: item
      ? {
          itemType: initialType as "media" | "layout",
          mediaAssetId: item.mediaAssetId ?? "",
          layoutTemplateId: item.layoutTemplateId ?? "",
          duration: item.duration ?? undefined,
          order: item.order ?? 0,
        }
      : {
          itemType: (defaultType || "media") as "media" | "layout",
          mediaAssetId: "",
          layoutTemplateId: "",
          duration: undefined,
          order: 0,
        },
  });

  const itemType = form.watch("itemType");
  const selectedAssetId = form.watch("mediaAssetId");
  const selectedAsset = mediaAssets.find(a => a.id === selectedAssetId);
  const isVideo = selectedAsset?.mediaType === "video";

  const saveMutation = useMutation({
    mutationFn: (data: ItemFormValues) => {
      const payload: Record<string, any> = {
        duration: data.duration ?? null,
        order: data.order ?? 0,
      };
      if (data.itemType === "media") {
        payload.mediaAssetId = data.mediaAssetId;
        payload.layoutTemplateId = null;
      } else {
        payload.layoutTemplateId = data.layoutTemplateId;
        payload.mediaAssetId = null;
      }
      if (isEditing) {
        return apiRequest("PATCH", `/api/playlist-items/${item.id}`, payload);
      }
      return apiRequest("POST", `/api/playlists/${playlistId}/items`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", playlistId, "items"] });
      onOpenChange(false);
      form.reset();
      toast({ title: isEditing ? "Item updated" : "Item added" });
    },
    onError: () => {
      toast({ title: "Failed to save item", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => {
              if (buffered) {
                onSubmit!(data);
                onOpenChange(false);
                form.reset();
              } else {
                saveMutation.mutate(data);
              }
            })}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="itemType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Type</FormLabel>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={field.value === "media" ? "default" : "outline"}
                      size="sm"
                      onClick={() => field.onChange("media")}
                      data-testid="button-type-media"
                    >
                      <Image className="mr-2 h-4 w-4" />
                      Media
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === "layout" ? "default" : "outline"}
                      size="sm"
                      onClick={() => field.onChange("layout")}
                      data-testid="button-type-layout"
                    >
                      <LayoutGrid className="mr-2 h-4 w-4" />
                      Scene
                    </Button>
                  </div>
                </FormItem>
              )}
            />

            {itemType === "media" && (
              <FormField
                control={form.control}
                name="mediaAssetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Media</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-media">
                          <SelectValue placeholder="Select media" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {mediaAssets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.name} ({asset.mediaType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {itemType === "layout" && (
              <FormField
                control={form.control}
                name="layoutTemplateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scene</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-layout">
                          <SelectValue placeholder="Select scene" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {layouts.map((layout) => (
                          <SelectItem key={layout.id} value={layout.id}>
                            {layout.name} ({layout.aspectRatio})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Duration (seconds)
                    {itemType === "media" && isVideo ? " — optional" : ""}
                    {itemType === "layout" ? " — how long to show this scene" : ""}
                  </FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder={itemType === "layout" ? "30" : (isVideo ? (selectedAsset?.duration ? `Video length: ${formatDuration(selectedAsset.duration)}` : "Full video length") : "10")}
                        value={field.value != null ? String(field.value) : ""}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val === "") {
                            field.onChange(undefined);
                          } else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num > 0) {
                              field.onChange(num);
                            }
                          }
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        data-testid="input-item-duration"
                      />
                      {field.value != null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-muted-foreground"
                          onClick={() => field.onChange(undefined)}
                          data-testid="button-clear-duration"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  {itemType === "media" && isVideo && !field.value && (
                    <p className="text-xs text-muted-foreground">Leave empty to play the full video</p>
                  )}
                  {itemType === "layout" && (
                    <p className="text-xs text-muted-foreground">How many seconds to display this scene before rotating to the next item</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!buffered && saveMutation.isPending}
                data-testid="button-save-item"
              >
                {!buffered && saveMutation.isPending
                  ? "Saving..."
                  : isEditing
                    ? "Update"
                    : "Add"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SortablePlaylistItem({
  item,
  mediaAsset,
  layoutTemplate,
  onEdit,
  onDelete,
}: {
  item: PlaylistItem;
  mediaAsset?: MediaAsset;
  layoutTemplate?: LayoutTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const isLayout = !!item.layoutTemplateId;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const thumbnailUrl = mediaAsset?.thumbnailPath
    ? `/api/media/${mediaAsset.id}/thumbnail`
    : null;

  const displayDuration = item.duration
    || (!isLayout && mediaAsset?.mediaType === "video" && mediaAsset?.duration ? mediaAsset.duration : null);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-card/60 hover:bg-muted/40 transition-colors" data-testid={`playlist-item-row-${item.id}`}>
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0" data-testid={`drag-handle-${item.id}`}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className={`w-8 h-8 rounded flex items-center justify-center overflow-hidden flex-shrink-0 ${isLayout ? "bg-primary/10" : "bg-muted"}`}>
        {isLayout ? (
          <LayoutGrid className="h-3.5 w-3.5 text-primary" />
        ) : thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Image className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate" data-testid={`text-item-name-${item.id}`}>
          {isLayout ? (layoutTemplate?.name || "Unknown scene") : (mediaAsset?.name || "Unknown media")}
        </p>
        <div className="flex items-center gap-1.5">
          {isLayout ? (
            <span className="text-[10px] text-muted-foreground">Scene{layoutTemplate?.aspectRatio ? ` · ${layoutTemplate.aspectRatio}` : ""}</span>
          ) : mediaAsset?.mediaType ? (
            <span className="text-[10px] text-muted-foreground capitalize">{mediaAsset.mediaType}</span>
          ) : null}
          {displayDuration && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              · <Clock className="h-2.5 w-2.5" />
              {formatDuration(displayDuration)}
              {!item.duration && mediaAsset?.mediaType === "video" ? " (full)" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} data-testid={`button-edit-item-${item.id}`}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} data-testid={`button-delete-item-${item.id}`}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// Signature of an item used to detect unsaved changes against server data.
// Order is captured separately by the array index.
function itemSignature(i: PlaylistItem): string {
  return [i.mediaAssetId ?? "", i.layoutTemplateId ?? "", i.duration ?? "null"].join("|");
}

function isTempId(id: string): boolean {
  return id.startsWith("temp-");
}

function PlaylistItemsSection({
  playlist,
  mediaAssets,
  layouts,
}: {
  playlist: Playlist;
  mediaAssets: MediaAsset[];
  layouts: LayoutTemplate[];
}) {
  const [itemsOpen, setItemsOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlaylistItem | undefined>();
  const [defaultItemType, setDefaultItemType] = useState<"media" | "layout">("media");
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: serverItems = [] } = useQuery<PlaylistItem[]>({
    queryKey: ["/api/playlists", playlist.id, "items"],
    queryFn: () => fetch(`/api/playlists/${playlist.id}/items`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Failed to fetch items");
      return r.json();
    }),
    enabled: itemsOpen,
  });

  const sortedServer = useMemo(
    () => [...serverItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [serverItems],
  );

  // Local draft mirrors the server until the user makes a change.
  // While `isDirty`, draft is preserved across server refetches so
  // background invalidations don't clobber unsaved edits.
  const [draftItems, setDraftItems] = useState<PlaylistItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setDraftItems(sortedServer);
    }
  }, [sortedServer, isDirty]);

  const markDirtyAnd = (next: PlaylistItem[]) => {
    setDraftItems(next);
    setIsDirty(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (saveMutation.isPending) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draftItems.findIndex(i => i.id === active.id);
    const newIndex = draftItems.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    markDirtyAnd(arrayMove(draftItems, oldIndex, newIndex));
  };

  const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));
  const layoutMap = new Map(layouts.map((l) => [l.id, l]));

  const handleAddItem = (type: "media" | "layout" = "media") => {
    if (saveMutation.isPending) return;
    setEditingItem(undefined);
    setDefaultItemType(type);
    setItemDialogOpen(true);
  };

  const handleEditItem = (item: PlaylistItem) => {
    if (saveMutation.isPending) return;
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const handleItemDialogSubmit = (values: ItemFormValues) => {
    if (editingItem) {
      // Edit existing draft entry (server-backed or new) in place.
      markDirtyAnd(
        draftItems.map((it) =>
          it.id === editingItem.id
            ? {
                ...it,
                mediaAssetId: values.itemType === "media" ? values.mediaAssetId : null,
                layoutTemplateId: values.itemType === "layout" ? values.layoutTemplateId! : null,
                duration: values.duration ?? null,
              }
            : it,
        ),
      );
    } else {
      // Append new draft entry with a temp id; real id arrives on Save.
      const tempId = `temp-${Math.random().toString(36).slice(2, 11)}`;
      const newItem: PlaylistItem = {
        id: tempId,
        playlistId: playlist.id,
        mediaAssetId: values.itemType === "media" ? values.mediaAssetId : null,
        layoutTemplateId: values.itemType === "layout" ? values.layoutTemplateId! : null,
        duration: values.duration ?? null,
        order: draftItems.length,
      };
      markDirtyAnd([...draftItems, newItem]);
    }
  };

  const handleRemove = (id: string) => {
    if (saveMutation.isPending) return;
    markDirtyAnd(draftItems.filter((i) => i.id !== id));
  };

  const handleCancel = () => {
    setDraftItems(sortedServer);
    setIsDirty(false);
  };

  // Snapshot of the draft array used to start the most recent save.
  // We compare against the live `draftItems` on success so that any edits
  // the user made *while* the save was in flight don't get silently
  // cleared by `setIsDirty(false)`.
  const saveSnapshotRef = useRef<PlaylistItem[] | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Freeze the draft we're committing so concurrent edits can't change it.
      saveSnapshotRef.current = draftItems;
      const snapshot = draftItems;
      const serverById = new Map(sortedServer.map((i) => [i.id, i]));
      const draftRealIds = new Set(snapshot.filter((i) => !isTempId(i.id)).map((i) => i.id));

      // 1) Deletes — server items no longer present in the draft.
      const toDelete = sortedServer.filter((i) => !draftRealIds.has(i.id));
      await Promise.all(
        toDelete.map((i) => apiRequest("DELETE", `/api/playlist-items/${i.id}`)),
      );

      // 2) Patches — existing items whose field signature changed.
      const toPatch = snapshot.filter((d) => {
        if (isTempId(d.id)) return false;
        const s = serverById.get(d.id);
        return !!s && itemSignature(s) !== itemSignature(d);
      });
      await Promise.all(
        toPatch.map((d) =>
          apiRequest("PATCH", `/api/playlist-items/${d.id}`, {
            mediaAssetId: d.mediaAssetId,
            layoutTemplateId: d.layoutTemplateId,
            duration: d.duration,
          }),
        ),
      );

      // 3) Creates — preserve draft order, capture real ids for reorder.
      const finalIds: string[] = [];
      for (const d of snapshot) {
        if (isTempId(d.id)) {
          const resp = await apiRequest("POST", `/api/playlists/${playlist.id}/items`, {
            mediaAssetId: d.mediaAssetId,
            layoutTemplateId: d.layoutTemplateId,
            duration: d.duration,
            order: finalIds.length,
          });
          const created = (await resp.json()) as PlaylistItem;
          finalIds.push(created.id);
        } else {
          finalIds.push(d.id);
        }
      }

      // 4) Reorder if order changed, items were added, or items were removed.
      const serverOrderIds = sortedServer.map((i) => i.id);
      const orderChanged =
        finalIds.length !== serverOrderIds.length ||
        finalIds.some((id, idx) => id !== serverOrderIds[idx]);
      if (orderChanged && finalIds.length > 0) {
        await apiRequest("POST", `/api/playlists/${playlist.id}/reorder`, { itemIds: finalIds });
      }
    },
    onSuccess: () => {
      // Only clear dirty if no edits happened during the in-flight save.
      // Reference equality is enough: every draft mutation creates a new array.
      const drifted = saveSnapshotRef.current !== draftItems;
      saveSnapshotRef.current = null;
      if (!drifted) {
        setIsDirty(false);
        toast({ title: "Playlist saved" });
      } else {
        toast({ title: "Playlist saved — you have new unsaved changes" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", playlist.id, "items"] });
    },
    onError: (e) => {
      saveSnapshotRef.current = null;
      toast({
        title: "Failed to save playlist",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      // Surface authoritative server state so the user can decide whether
      // to keep their draft and retry, or Cancel back to the server snapshot.
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", playlist.id, "items"] });
    },
  });

  const isSaving = saveMutation.isPending;

  const summaryCount = isDirty ? draftItems.length : sortedServer.length;

  return (
    <>
      <Collapsible open={itemsOpen} onOpenChange={setItemsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between px-4 py-2 border-t rounded-none"
            data-testid={`button-toggle-items-${playlist.id}`}
          >
            <span className="flex items-center gap-2">
              <ListVideo className="h-4 w-4" />
              Manage Items ({summaryCount})
              {isDirty && (
                <Badge variant="secondary" className="ml-1" data-testid={`badge-unsaved-${playlist.id}`}>
                  Unsaved
                </Badge>
              )}
            </span>
            {itemsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-3 space-y-2 border-t bg-muted/20">
            {isDirty && (
              <div
                className="sticky top-0 z-10 -mx-3 -mt-3 mb-1 flex items-center justify-between gap-2 border-b bg-amber-500/10 px-3 py-2 backdrop-blur"
                data-testid={`bar-unsaved-${playlist.id}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  You have unsaved changes
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={saveMutation.isPending}
                    data-testid={`button-cancel-items-${playlist.id}`}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid={`button-save-items-${playlist.id}`}
                  >
                    {saveMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
            {draftItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No items yet. Add media or scenes to this playlist.
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={draftItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {draftItems.map((item) => (
                      <SortablePlaylistItem
                        key={item.id}
                        item={item}
                        mediaAsset={item.mediaAssetId ? mediaMap.get(item.mediaAssetId) : undefined}
                        layoutTemplate={item.layoutTemplateId ? layoutMap.get(item.layoutTemplateId) : undefined}
                        onEdit={() => handleEditItem(item)}
                        onDelete={() => handleRemove(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleAddItem("media")}
                disabled={mediaAssets.length === 0 || isSaving}
                data-testid={`button-add-item-${playlist.id}`}
              >
                <Plus className="mr-1 h-4 w-4" />
                <Image className="mr-1 h-3.5 w-3.5" />
                Add Media
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleAddItem("layout")}
                disabled={layouts.length === 0 || isSaving}
                data-testid={`button-add-layout-item-${playlist.id}`}
              >
                <Plus className="mr-1 h-4 w-4" />
                <LayoutGrid className="mr-1 h-3.5 w-3.5" />
                Add Scene
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ItemEditorDialog
        key={editingItem?.id ?? `new-${defaultItemType}`}
        playlistId={playlist.id}
        item={editingItem}
        mediaAssets={mediaAssets}
        layouts={layouts}
        open={itemDialogOpen}
        defaultType={defaultItemType}
        onSubmit={handleItemDialogSubmit}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) setEditingItem(undefined);
        }}
      />
    </>
  );
}

function PlaylistCard({ playlist, event, mediaAssets, layouts, usedIn }: { playlist: Playlist; event?: Event; mediaAssets: MediaAsset[]; layouts: LayoutTemplate[]; usedIn?: Array<{ blockId: string; blockName: string; layoutName?: string }> }) {
  const [editOpen, setEditOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: cardItems = [] } = useQuery<PlaylistItem[]>({
    queryKey: ["/api/playlists", playlist.id, "items"],
    queryFn: () => fetch(`/api/playlists/${playlist.id}/items`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Failed to fetch items");
      return r.json();
    }),
  });

  const previewItems = useMemo(() => {
    const sorted = [...cardItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sorted.slice(0, 4);
  }, [cardItems]);

  const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

  const eventsQuery = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [] } = useQuery<Event[]>({
    ...eventsQuery,
  });

  const form = useForm<PlaylistFormValues>({
    resolver: zodResolver(playlistFormSchema),
    defaultValues: {
      name: playlist.name,
      description: playlist.description || "",
      eventId: playlist.eventId || "",
      clientId: playlist.clientId || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: PlaylistFormValues) =>
      apiRequest("PATCH", `/api/playlists/${playlist.id}`, {
        ...data,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      setEditOpen(false);
      toast({ title: "Playlist updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update playlist", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/playlists/${playlist.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      toast({ title: "Playlist deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete playlist", variant: "destructive" });
    },
  });

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base" data-testid={`text-playlist-name-${playlist.id}`}>
              {playlist.name}
            </CardTitle>
            {playlist.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {playlist.description}
              </p>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-playlist-menu-${playlist.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Playlist</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((data) =>
                      updateMutation.mutate(data)
                    )}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-playlist-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-edit-playlist-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="eventId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event (optional)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-playlist-event">
                                <SelectValue placeholder="Global playlist" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="global">Global</SelectItem>
                              {events.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateMutation.isPending}
                        data-testid="button-save-playlist"
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => deleteMutation.mutate()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {previewItems.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2" data-testid={`playlist-thumbnails-${playlist.id}`}>
            {previewItems.map((item) => {
              const isLayoutItem = !!item.layoutTemplateId;
              const asset = item.mediaAssetId ? mediaMap.get(item.mediaAssetId) : undefined;
              const thumbUrl = asset?.thumbnailPath ? `/api/media/${asset.id}/thumbnail` : null;
              return (
                <div key={item.id} className={`w-10 h-10 rounded flex items-center justify-center overflow-hidden flex-shrink-0 border ${isLayoutItem ? "bg-primary/10" : "bg-muted"}`}>
                  {isLayoutItem ? (
                    <LayoutGrid className="h-3 w-3 text-primary" />
                  ) : thumbUrl ? (
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Image className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              );
            })}
            {cardItems.length > 4 && (
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground border">
                +{cardItems.length - 4}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ListVideo className="h-4 w-4" />
            <span>{cardItems.length} {cardItems.length === 1 ? "item" : "items"}</span>
          </div>
          {event && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{event.name}</span>
            </div>
          )}
        </div>
        {usedIn && usedIn.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`text-playlist-usage-${playlist.id}`}>
            <Layers className="h-3 w-3" />
            <span>Used in: {usedIn.map(u => u.layoutName ? `${u.blockName} (${u.layoutName})` : u.blockName).join(", ")}</span>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => navigate(`/simulator?playlistId=${playlist.id}`)}
          data-testid={`button-preview-playlist-${playlist.id}`}
        >
          <Play className="mr-2 h-3.5 w-3.5" />
          Preview in Simulator
        </Button>
      </CardContent>
      <PlaylistItemsSection playlist={playlist} mediaAssets={mediaAssets} layouts={layouts} />
    </Card>
  );
}

function CreatePlaylistDialog({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { selectedClientId, clients, selectedClient } = useSiteContext();

  const form = useForm<PlaylistFormValues>({
    resolver: zodResolver(playlistFormSchema),
    defaultValues: {
      name: "",
      description: "",
      eventId: "",
      clientId: selectedClientId || "",
    },
  });

  // Keep clientId in sync if the active site changes while the dialog is open.
  useEffect(() => {
    if (selectedClientId) {
      form.setValue("clientId", selectedClientId);
    }
  }, [selectedClientId, form]);

  const createMutation = useMutation({
    mutationFn: (data: PlaylistFormValues) =>
      apiRequest("POST", "/api/playlists", {
        ...data,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      setOpen(false);
      form.reset();
      toast({ title: "Playlist created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create playlist", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-playlist">
          <Plus className="mr-2 h-4 w-4" />
          Add Playlist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Playlist</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Welcome Slides"
                      {...field}
                      data-testid="input-playlist-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this playlist"
                      {...field}
                      data-testid="input-playlist-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event (optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-playlist-event">
                        <SelectValue placeholder="Global playlist" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-playlist"
              >
                {createMutation.isPending ? "Creating..." : "Create Playlist"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function OrphanPlaylistCard({ playlist, clients }: { playlist: Playlist; clients: Client[] }) {
  const { toast } = useToast();
  const [targetSite, setTargetSite] = useState<string>("");

  const reassignMutation = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest("PATCH", `/api/playlists/${playlist.id}`, { clientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      toast({ title: "Playlist reassigned" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to reassign playlist",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/playlists/${playlist.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      toast({ title: "Orphan playlist deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete playlist", variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-orphan-playlist-${playlist.id}`}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-medium truncate"
                data-testid={`text-orphan-playlist-name-${playlist.id}`}
              >
                {playlist.name}
              </span>
              <Badge
                variant="destructive"
                data-testid={`badge-no-site-${playlist.id}`}
              >
                No site assigned
              </Badge>
            </div>
            {playlist.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {playlist.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={targetSite}
            onValueChange={setTargetSite}
            disabled={reassignMutation.isPending || deleteMutation.isPending}
          >
            <SelectTrigger
              className="w-[180px]"
              data-testid={`select-orphan-site-${playlist.id}`}
            >
              <SelectValue placeholder="Choose site..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!targetSite || reassignMutation.isPending || deleteMutation.isPending}
            onClick={() => reassignMutation.mutate(targetSite)}
            data-testid={`button-reassign-orphan-${playlist.id}`}
          >
            {reassignMutation.isPending ? "Saving..." : "Reassign"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (confirm(`Delete orphan playlist "${playlist.name}"? This cannot be undone.`)) {
                deleteMutation.mutate();
              }
            }}
            data-testid={`button-delete-orphan-${playlist.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrphanPlaylistsSection({ orphans, clients }: { orphans: Playlist[]; clients: Client[] }) {
  if (orphans.length === 0) return null;
  return (
    <Card
      className="border-destructive/40 bg-destructive/5"
      data-testid="section-orphan-playlists"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Orphan playlists ({orphans.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          These playlists have no site and are invisible to ordinary users. Reassign each one to a site or delete it.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {orphans.map((p) => (
          <OrphanPlaylistCard key={p.id} playlist={p} clients={clients} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function PlaylistsPage() {
  const { user } = useAuth();
  const { selectedClientId, clients } = useSiteContext();
  const isAdmin = user?.role === "admin";
  const showOrphans = isAdmin && !selectedClientId;

  const playlistsQuery = useSiteFilteredQuery<Playlist[]>("/api/playlists");
  const { data: playlists = [], isLoading: playlistsLoading } = useQuery<Playlist[]>({
    ...playlistsQuery,
  });

  const orphans = useMemo(
    () => (showOrphans ? playlists.filter((p) => !p.clientId) : []),
    [playlists, showOrphans],
  );
  const sitedPlaylists = useMemo(
    () => (showOrphans ? playlists.filter((p) => !!p.clientId) : playlists),
    [playlists, showOrphans],
  );

  const eventsQuery = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [] } = useQuery<Event[]>({
    ...eventsQuery,
  });

  const mediaQuery = useSiteFilteredQuery<MediaAsset[]>("/api/media");
  const { data: mediaAssets = [] } = useQuery<MediaAsset[]>({
    ...mediaQuery,
  });

  const layoutsQuery = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const { data: layouts = [] } = useQuery<LayoutTemplate[]>({
    ...layoutsQuery,
  });

  const { data: usageData = {} } = useQuery<Record<string, Array<{ blockId: string; blockName: string; layoutName?: string }>>>({
    queryKey: ["/api/playlists/usage"],
  });

  const eventMap = new Map(events.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-playlists-title">Playlists</h1>
          <p className="text-muted-foreground">
            Organise media into rotating content collections
          </p>
        </div>
        <CreatePlaylistDialog events={events} />
      </div>

      {showOrphans && <OrphanPlaylistsSection orphans={orphans} clients={clients} />}

      {/* Content */}
      {playlistsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sitedPlaylists.length === 0 ? (
        orphans.length > 0 ? null : (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No playlists yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create playlists to organise media for rotating content in your
              scene zones.
            </p>
            <CreatePlaylistDialog events={events} />
          </CardContent>
        </Card>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sitedPlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              event={playlist.eventId ? eventMap.get(playlist.eventId) : undefined}
              mediaAssets={mediaAssets}
              layouts={layouts}
              usedIn={usageData[playlist.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

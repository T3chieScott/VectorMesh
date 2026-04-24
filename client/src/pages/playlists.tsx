import { useState, useMemo, useEffect } from "react";
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
import { Plus, MoreHorizontal, Pencil, Trash2, FolderOpen, Image, Calendar, ChevronDown, ChevronUp, ListVideo, Clock, Layers, GripVertical, Play, LayoutGrid } from "lucide-react";
import type { Playlist, Event, MediaAsset, PlaylistItem, LayoutTemplate } from "@shared/schema";

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
  layoutTemplateId: z.string().min(1, "Layout is required"),
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
}: {
  playlistId: string;
  item?: PlaylistItem;
  mediaAssets: MediaAsset[];
  layouts: LayoutTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "media" | "layout";
}) {
  const { toast } = useToast();
  const isEditing = !!item;
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
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
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
                      Layout
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
                    <FormLabel>Layout</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-layout">
                          <SelectValue placeholder="Select layout" />
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
                    {itemType === "layout" ? " — how long to show this layout" : ""}
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
                    <p className="text-xs text-muted-foreground">How many seconds to display this layout before rotating to the next item</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-item">
                {saveMutation.isPending ? "Saving..." : isEditing ? "Update" : "Add"}
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
          {isLayout ? (layoutTemplate?.name || "Unknown layout") : (mediaAsset?.name || "Unknown media")}
        </p>
        <div className="flex items-center gap-1.5">
          {isLayout ? (
            <span className="text-[10px] text-muted-foreground">Layout{layoutTemplate?.aspectRatio ? ` · ${layoutTemplate.aspectRatio}` : ""}</span>
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

  const { data: items = [] } = useQuery<PlaylistItem[]>({
    queryKey: ["/api/playlists", playlist.id, "items"],
    queryFn: () => fetch(`/api/playlists/${playlist.id}/items`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Failed to fetch items");
      return r.json();
    }),
    enabled: itemsOpen,
  });

  const sortedItems = useMemo(() => [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [items]);

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => apiRequest("DELETE", `/api/playlist-items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", playlist.id, "items"] });
      toast({ title: "Item deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete item", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return apiRequest("POST", `/api/playlists/${playlist.id}/reorder`, { itemIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", playlist.id, "items"] });
    },
    onError: () => {
      toast({ title: "Failed to reorder items", variant: "destructive" });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedItems.findIndex(i => i.id === active.id);
    const newIndex = sortedItems.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sortedItems, oldIndex, newIndex);
    reorderMutation.mutate(reordered.map(i => i.id));
  };

  const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

  const layoutMap = new Map(layouts.map((l) => [l.id, l]));

  const handleAddItem = (type: "media" | "layout" = "media") => {
    setEditingItem(undefined);
    setDefaultItemType(type);
    setItemDialogOpen(true);
  };

  const handleEditItem = (item: PlaylistItem) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

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
              Manage Items ({items.length})
            </span>
            {itemsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-3 space-y-2 border-t bg-muted/20">
            {sortedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No items yet. Add media or layouts to this playlist.
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {sortedItems.map((item) => (
                      <SortablePlaylistItem
                        key={item.id}
                        item={item}
                        mediaAsset={item.mediaAssetId ? mediaMap.get(item.mediaAssetId) : undefined}
                        layoutTemplate={item.layoutTemplateId ? layoutMap.get(item.layoutTemplateId) : undefined}
                        onEdit={() => handleEditItem(item)}
                        onDelete={() => deleteMutation.mutate(item.id)}
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
                disabled={mediaAssets.length === 0}
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
                disabled={layouts.length === 0}
                data-testid={`button-add-layout-item-${playlist.id}`}
              >
                <Plus className="mr-1 h-4 w-4" />
                <LayoutGrid className="mr-1 h-3.5 w-3.5" />
                Add Layout
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

export default function PlaylistsPage() {
  const playlistsQuery = useSiteFilteredQuery<Playlist[]>("/api/playlists");
  const { data: playlists = [], isLoading: playlistsLoading } = useQuery<Playlist[]>({
    ...playlistsQuery,
  });

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
      ) : playlists.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No playlists yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create playlists to organise media for rotating content in your
              layout zones.
            </p>
            <CreatePlaylistDialog events={events} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
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

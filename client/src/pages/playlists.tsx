import { useState, useMemo } from "react";
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
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Plus, MoreHorizontal, Pencil, Trash2, FolderOpen, Image, Calendar, ChevronDown, ChevronUp, ListVideo, Clock, Layers, GripVertical, Play } from "lucide-react";
import type { Playlist, Event, MediaAsset, PlaylistItem } from "@shared/schema";

const playlistFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  eventId: z.string().optional(),
});

type PlaylistFormValues = z.infer<typeof playlistFormSchema>;

const itemFormSchema = z.object({
  mediaAssetId: z.string().min(1, "Media is required"),
  duration: z.number().min(1, "Duration must be at least 1 second").optional(),
  order: z.number().min(0).optional(),
});

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
  open,
  onOpenChange,
}: {
  playlistId: string;
  item?: PlaylistItem;
  mediaAssets: MediaAsset[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!item;

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: item
      ? {
          mediaAssetId: item.mediaAssetId,
          duration: item.duration ?? undefined,
          order: item.order ?? 0,
        }
      : {
          mediaAssetId: "",
          duration: undefined,
          order: 0,
        },
  });

  const selectedAssetId = form.watch("mediaAssetId");
  const selectedAsset = mediaAssets.find(a => a.id === selectedAssetId);
  const isVideo = selectedAsset?.mediaType === "video";

  const saveMutation = useMutation({
    mutationFn: (data: ItemFormValues) => {
      if (isEditing) {
        return apiRequest("PATCH", `/api/playlist-items/${item.id}`, data);
      }
      return apiRequest("POST", `/api/playlists/${playlistId}/items`, data);
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
              name="mediaAssetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Media</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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

            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (seconds){isVideo ? " — optional" : ""}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder={isVideo ? (selectedAsset?.duration ? `Video length: ${formatDuration(selectedAsset.duration)}` : "Full video length") : "10"}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? undefined : (parseInt(val) || undefined));
                      }}
                      data-testid="input-item-duration"
                    />
                  </FormControl>
                  {isVideo && !field.value && (
                    <p className="text-xs text-muted-foreground">Leave empty to play the full video</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      data-testid="input-item-order"
                    />
                  </FormControl>
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
  onEdit,
  onDelete,
}: {
  item: PlaylistItem;
  mediaAsset?: MediaAsset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const thumbnailUrl = mediaAsset?.thumbnailPath
    ? `/api/media/${mediaAsset.id}/thumbnail`
    : null;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50" data-testid={`playlist-item-row-${item.id}`}>
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground" data-testid={`drag-handle-${item.id}`}>
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <Image className="h-4 w-4 text-primary" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium" data-testid={`text-item-name-${item.id}`}>
            {mediaAsset?.name || "Unknown media"}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {(item.duration || (mediaAsset?.mediaType === "video" && mediaAsset?.duration)) && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.duration ? `${item.duration}s` : ""}
                {item.duration && mediaAsset?.mediaType === "video" && mediaAsset?.duration ? " / " : ""}
                {mediaAsset?.mediaType === "video" && mediaAsset?.duration ? formatDuration(mediaAsset.duration) : ""}
              </span>
            )}
            {mediaAsset?.mediaType && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">{mediaAsset.mediaType}</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-item-${item.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-item-${item.id}`}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function PlaylistItemsSection({
  playlist,
  mediaAssets,
}: {
  playlist: Playlist;
  mediaAssets: MediaAsset[];
}) {
  const [itemsOpen, setItemsOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlaylistItem | undefined>();
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

  const handleAddItem = () => {
    setEditingItem(undefined);
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
          <div className="p-4 space-y-3 border-t bg-muted/30">
            {sortedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No items yet. Add media to this playlist.
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {sortedItems.map((item) => (
                      <SortablePlaylistItem
                        key={item.id}
                        item={item}
                        mediaAsset={mediaMap.get(item.mediaAssetId)}
                        onEdit={() => handleEditItem(item)}
                        onDelete={() => deleteMutation.mutate(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleAddItem}
              disabled={mediaAssets.length === 0}
              data-testid={`button-add-item-${playlist.id}`}
            >
              <Plus className="mr-2 h-4 w-4" />
              {mediaAssets.length === 0 ? "Upload media first" : "Add Item"}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ItemEditorDialog
        playlistId={playlist.id}
        item={editingItem}
        mediaAssets={mediaAssets}
        open={itemDialogOpen}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) setEditingItem(undefined);
        }}
      />
    </>
  );
}

function PlaylistCard({ playlist, event, mediaAssets, usedIn }: { playlist: Playlist; event?: Event; mediaAssets: MediaAsset[]; usedIn?: Array<{ blockId: string; blockName: string; layoutName?: string }> }) {
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
              const asset = mediaMap.get(item.mediaAssetId);
              const thumbUrl = asset?.thumbnailPath ? `/api/media/${asset.id}/thumbnail` : null;
              return (
                <div key={item.id} className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border">
                  {thumbUrl ? (
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
      <PlaylistItemsSection playlist={playlist} mediaAssets={mediaAssets} />
    </Card>
  );
}

function CreatePlaylistDialog({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<PlaylistFormValues>({
    resolver: zodResolver(playlistFormSchema),
    defaultValues: {
      name: "",
      description: "",
      eventId: "",
    },
  });

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
              usedIn={usageData[playlist.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Layout,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from "lucide-react";
import type { LayoutTemplate, Playlist, ZoneSource } from "@shared/schema";

interface LayoutZone {
  id: string;
  name?: string;
  type: string;
}

interface ScreenPreset {
  id: string;
  name: string;
  screenId: string | null;
  groupId: string | null;
  layoutTemplateId: string | null;
  zoneSources: ZoneSource[] | null;
  displayOrder: number | null;
  createdAt: string | null;
  isActive: boolean;
}

interface PresetPayload {
  name: string;
  layoutTemplateId: string | null;
  zoneSources: ZoneSource[];
  screenId?: string;
  groupId?: string;
}

const presetFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  layoutTemplateId: z.string().optional(),
});

type PresetFormValues = z.infer<typeof presetFormSchema>;

function PresetFormDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  layouts,
  playlists,
  editPreset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "screen" | "group";
  targetId: string;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  editPreset?: ScreenPreset | null;
}) {
  const { toast } = useToast();
  const form = useForm<PresetFormValues>({
    resolver: zodResolver(presetFormSchema),
    defaultValues: {
      name: editPreset?.name || "",
      layoutTemplateId: editPreset?.layoutTemplateId || "",
    },
  });

  const [zoneMappings, setZoneMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      form.reset({
        name: editPreset?.name || "",
        layoutTemplateId: editPreset?.layoutTemplateId || "",
      });
      const mappings: Record<string, string> = {};
      if (editPreset?.zoneSources) {
        for (const zs of editPreset.zoneSources) {
          if (zs.playlistId) mappings[zs.zoneId] = zs.playlistId;
        }
      }
      setZoneMappings(mappings);
    }
  }, [open, editPreset]);

  const selectedLayoutId = form.watch("layoutTemplateId");
  const selectedLayout = layouts.find((l) => l.id === selectedLayoutId);

  const mediaPlayerZones = useMemo(() => {
    if (!selectedLayout) return [];
    const zones = (selectedLayout.zones as LayoutZone[] | undefined) || [];
    return zones.filter((z) => z.type === "media_player");
  }, [selectedLayout]);

  const buildZoneSources = useCallback((): ZoneSource[] => {
    return Object.entries(zoneMappings)
      .filter(([, playlistId]) => playlistId && playlistId !== "none")
      .map(([zoneId, playlistId]) => ({
        zoneId,
        type: "playlist" as const,
        playlistId,
      }));
  }, [zoneMappings]);

  const createMutation = useMutation({
    mutationFn: (data: PresetPayload) => apiRequest("POST", "/api/screen-presets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-presets"] });
      onOpenChange(false);
      form.reset();
      setZoneMappings({});
      toast({ title: "Preset created" });
    },
    onError: () => toast({ title: "Failed to create preset", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<PresetPayload>) => apiRequest("PATCH", `/api/screen-presets/${editPreset?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-presets"] });
      onOpenChange(false);
      form.reset();
      setZoneMappings({});
      toast({ title: "Preset updated" });
    },
    onError: () => toast({ title: "Failed to update preset", variant: "destructive" }),
  });

  const onSubmit = (values: PresetFormValues) => {
    const zoneSources = buildZoneSources();
    if (editPreset) {
      updateMutation.mutate({
        name: values.name,
        layoutTemplateId: values.layoutTemplateId || null,
        zoneSources,
      });
    } else {
      const payload: PresetPayload = {
        name: values.name,
        layoutTemplateId: values.layoutTemplateId || null,
        zoneSources,
      };
      if (targetType === "screen") payload.screenId = targetId;
      else payload.groupId = targetId;
      createMutation.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editPreset ? "Edit Preset" : "Create Preset"}</DialogTitle>
          <DialogDescription>
            {editPreset ? "Update this preset's name, scene, and zone assignments." : "Create a new preset for quick content switching."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preset Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Welcome Mode" {...field} data-testid="input-preset-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="layoutTemplateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scene</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-preset-layout">
                        <SelectValue placeholder="Select a scene" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {layouts.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedLayout && mediaPlayerZones.length > 0 && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Layout className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedLayout.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({mediaPlayerZones.length} media zone{mediaPlayerZones.length !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Playlist Zone Mapping</Label>
                  <p className="text-xs text-muted-foreground">Assign playlists to media player zones</p>
                  {mediaPlayerZones.map((zone) => (
                    <div key={zone.id} className="flex items-center gap-3" data-testid={`zone-mapping-${zone.id}`}>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <PlayCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm truncate">{zone.name || "Media Player"}</span>
                      </div>
                      <Select
                        value={zoneMappings[zone.id] || "none"}
                        onValueChange={(v) => setZoneMappings(prev => ({ ...prev, [zone.id]: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger className="flex-1" data-testid={`select-zone-playlist-${zone.id}`}>
                          <SelectValue placeholder="No playlist" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No playlist assigned</SelectItem>
                          {playlists.map((pl) => (
                            <SelectItem key={pl.id} value={pl.id}>
                              {pl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-preset"
              >
                {editPreset ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function PresetManager({
  targetType,
  targetId,
  layouts,
  playlists,
}: {
  targetType: "screen" | "group";
  targetId: string;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ScreenPreset | null>(null);

  const queryParams = targetType === "screen" ? `screenId=${targetId}` : `groupId=${targetId}`;
  const { data: presets = [] } = useQuery<ScreenPreset[]>({
    queryKey: ["/api/screen-presets", targetType, targetId],
    queryFn: async () => {
      const res = await fetch(`/api/screen-presets?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: expanded,
  });

  const sortedPresets = useMemo(() =>
    [...presets].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [presets]
  );

  const layoutMap = new Map(layouts.map((l) => [l.id, l.name]));

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/screen-presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-presets"] });
      toast({ title: "Preset deleted" });
    },
    onError: () => toast({ title: "Failed to delete preset", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => apiRequest("POST", "/api/screen-presets/reorder", { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-presets"] });
    },
    onError: () => toast({ title: "Failed to reorder presets", variant: "destructive" }),
  });

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    const ids = sortedPresets.map(p => p.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderMutation.mutate(ids);
  }, [sortedPresets, reorderMutation]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= sortedPresets.length - 1) return;
    const ids = sortedPresets.map(p => p.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    reorderMutation.mutate(ids);
  }, [sortedPresets, reorderMutation]);

  return (
    <div className="space-y-2">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between px-2 h-9" data-testid="toggle-presets-section">
            <span className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="h-4 w-4" />
              Presets
              {presets.length > 0 && (
                <Badge variant="secondary" className="text-xs h-5 px-1.5">{presets.length}</Badge>
              )}
            </span>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          {sortedPresets.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">No presets configured.</p>
          ) : (
            <div className="space-y-1">
              {sortedPresets.map((preset, index) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-sm"
                  data-testid={`preset-item-${preset.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{preset.name}</div>
                    {preset.layoutTemplateId && (
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Layout className="h-3 w-3" />
                        {layoutMap.get(preset.layoutTemplateId) || "Unknown"}
                      </div>
                    )}
                  </div>
                  {preset.isActive && (
                    <Badge className="bg-green-500 text-white text-xs h-5 px-1.5">Active</Badge>
                  )}
                  <div className="flex gap-0.5 shrink-0">
                    {index > 0 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveUp(index)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                    )}
                    {index < sortedPresets.length - 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveDown(index)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => { setEditingPreset(preset); setFormOpen(true); }}
                      data-testid={`button-edit-preset-${preset.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" data-testid={`button-delete-preset-${preset.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Preset</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete "{preset.name}"? If active, the override will also be removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(preset.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => { setEditingPreset(null); setFormOpen(true); }}
            data-testid="button-add-preset-settings"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Preset
          </Button>
        </CollapsibleContent>
      </Collapsible>

      <PresetFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingPreset(null);
        }}
        targetType={targetType}
        targetId={targetId}
        layouts={layouts}
        playlists={playlists}
        editPreset={editingPreset}
      />
    </div>
  );
}

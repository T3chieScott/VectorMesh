import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSiteContext, useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Layout,
  Monitor,
  Users,
  Zap,
  GripVertical,
  LayoutGrid,
  PlayCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Screen, ScreenGroup, LayoutTemplate, Playlist, ZoneSource } from "@shared/schema";

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

function PresetButton({
  preset,
  layoutName,
  onActivate,
  onDeactivate,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isPending,
  isFirst,
  isLast,
  canManage,
}: {
  preset: ScreenPreset;
  layoutName: string;
  onActivate: () => void;
  onDeactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isPending: boolean;
  isFirst: boolean;
  isLast: boolean;
  canManage: boolean;
}) {
  const zoneCount = preset.zoneSources?.length || 0;

  return (
    <div
      className={`relative group rounded-xl border-2 transition-all ${
        preset.isActive
          ? "border-green-500 bg-green-500/10 shadow-lg shadow-green-500/20"
          : "border-border bg-card hover:border-primary/50 hover:shadow-md"
      }`}
      data-testid={`preset-card-${preset.id}`}
    >
      <button
        className="w-full p-6 text-left cursor-pointer min-h-[140px] flex flex-col justify-between"
        onClick={preset.isActive ? onDeactivate : onActivate}
        disabled={isPending}
        data-testid={`button-preset-toggle-${preset.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate" data-testid={`text-preset-name-${preset.id}`}>
              {preset.name}
            </h3>
            {layoutName && (
              <p className="text-sm text-muted-foreground mt-1 truncate flex items-center gap-1.5">
                <Layout className="h-3.5 w-3.5 shrink-0" />
                {layoutName}
              </p>
            )}
            {zoneCount > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {zoneCount} zone mapping{zoneCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {preset.isActive ? (
            <Badge className="bg-green-500 text-white shrink-0 gap-1">
              <Zap className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 shrink-0" />
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          {preset.isActive ? (
            <span className="flex items-center gap-1">
              <PowerOff className="h-3 w-3" />
              Tap to deactivate
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Power className="h-3 w-3" />
              Tap to activate
            </span>
          )}
        </div>
      </button>
      {canManage && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {!isFirst && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              data-testid={`button-move-up-${preset.id}`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isLast && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              data-testid={`button-move-down-${preset.id}`}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            data-testid={`button-edit-preset-${preset.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-delete-preset-${preset.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Preset</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete "{preset.name}"? If it's currently active, the override will also be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} data-testid="button-confirm-delete-preset">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

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
            {editPreset ? "Update this preset's name, layout, and zone assignments." : "Create a new preset button for quick content switching."}
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
                  <FormLabel>Layout</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-preset-layout">
                        <SelectValue placeholder="Select a layout" />
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
                  <p className="text-xs text-muted-foreground">Assign playlists to media player zones in this layout</p>
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

function TargetPresets({
  targetType,
  targetId,
  targetName,
  layouts,
  playlists,
  canManage,
}: {
  targetType: "screen" | "group";
  targetId: string;
  targetName: string;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ScreenPreset | null>(null);

  const queryParams = targetType === "screen" ? `screenId=${targetId}` : `groupId=${targetId}`;
  const { data: presets = [], isLoading } = useQuery<ScreenPreset[]>({
    queryKey: ["/api/screen-presets", targetType, targetId],
    queryFn: async () => {
      const res = await fetch(`/api/screen-presets?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const sortedPresets = useMemo(() =>
    [...presets].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [presets]
  );

  const layoutMap = new Map(layouts.map((l) => [l.id, l.name]));

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/screen-presets/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-presets"] });
      toast({ title: "Preset activated" });
    },
    onError: () => toast({ title: "Failed to activate preset", variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/screen-presets/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-presets"] });
      toast({ title: "Preset deactivated — returning to scheduled content" });
    },
    onError: () => toast({ title: "Failed to deactivate preset", variant: "destructive" }),
  });

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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[140px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {targetType === "screen" ? (
            <Monitor className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Users className="h-5 w-5 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold" data-testid="text-target-name">{targetName}</h2>
          <Badge variant="outline" className="text-xs">
            {sortedPresets.length} preset{sortedPresets.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {canManage && (
          <Button
            onClick={() => { setEditingPreset(null); setFormOpen(true); }}
            size="sm"
            data-testid="button-add-preset"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Preset
          </Button>
        )}
      </div>

      {sortedPresets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-muted-foreground mb-1">No presets yet</h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              {canManage
                ? `Create presets to quickly switch this ${targetType === "screen" ? "screen" : "group"} between different layouts with a single tap.`
                : "No presets have been configured for this target yet. Ask an admin to create presets."}
            </p>
            {canManage && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => { setEditingPreset(null); setFormOpen(true); }}
                data-testid="button-add-first-preset"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create First Preset
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedPresets.map((preset, index) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              layoutName={preset.layoutTemplateId ? (layoutMap.get(preset.layoutTemplateId) || "Unknown Layout") : "No layout assigned"}
              onActivate={() => activateMutation.mutate(preset.id)}
              onDeactivate={() => deactivateMutation.mutate(preset.id)}
              onEdit={() => { setEditingPreset(preset); setFormOpen(true); }}
              onDelete={() => deleteMutation.mutate(preset.id)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              isPending={activateMutation.isPending || deactivateMutation.isPending}
              isFirst={index === 0}
              isLast={index === sortedPresets.length - 1}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {canManage && (
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
      )}
    </div>
  );
}

export default function ControlPanelPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "account_manager";
  const [selectedTarget, setSelectedTarget] = useState<{ type: "screen" | "group"; id: string } | null>(null);

  const { selectedClientId: activeSiteClientId } = useSiteContext();

  const screensQuery = useSiteFilteredQuery<Screen[]>("/api/screens");
  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>({
    ...screensQuery,
  });

  const groupsQuery = useSiteFilteredQuery<(ScreenGroup & { memberCount: number })[]>("/api/screen-groups");
  const { data: groups = [], isLoading: groupsLoading } = useQuery<(ScreenGroup & { memberCount: number })[]>({
    ...groupsQuery,
  });

  const isLoading = screensLoading || groupsLoading;

  // If the active site changes and the previously selected target no longer
  // belongs to it, clear the selection so the right-hand panel doesn't drive
  // an off-site target.
  useEffect(() => {
    if (!selectedTarget) return;
    if (screensLoading || groupsLoading) return;
    const stillVisible =
      selectedTarget.type === "screen"
        ? screens.some((s) => s.id === selectedTarget.id)
        : groups.some((g) => g.id === selectedTarget.id);
    if (!stillVisible) {
      setSelectedTarget(null);
    }
  }, [activeSiteClientId, selectedTarget, screens, groups, screensLoading, groupsLoading]);

  const selectedClientId = selectedTarget
    ? selectedTarget.type === "screen"
      ? screens.find((s) => s.id === selectedTarget.id)?.clientId
      : groups.find((g) => g.id === selectedTarget.id)?.clientId
    : undefined;

  const { data: layouts = [] } = useQuery<LayoutTemplate[]>({
    queryKey: ["/api/layouts", selectedClientId],
    queryFn: async () => {
      const url = selectedClientId ? `/api/layouts?clientId=${selectedClientId}` : "/api/layouts";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch layouts");
      return res.json();
    },
    enabled: !!selectedTarget,
  });

  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ["/api/playlists", selectedClientId],
    queryFn: async () => {
      const url = selectedClientId ? `/api/playlists?clientId=${selectedClientId}` : "/api/playlists";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
    enabled: !!selectedTarget,
  });

  const selectedName = selectedTarget
    ? selectedTarget.type === "screen"
      ? screens.find((s) => s.id === selectedTarget.id)?.name || "Screen"
      : groups.find((g) => g.id === selectedTarget.id)?.name || "Group"
    : "";

  return (
    <div className="space-y-6" data-testid="control-panel-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Control Panel</h1>
        <p className="text-muted-foreground mt-1">
          Quickly switch screens between preset layouts. Configure these buttons for use with a Stream Deck or any touch device.
        </p>
      </div>

      <Tabs defaultValue="screens" className="space-y-4">
        <TabsList data-testid="tabs-target-type">
          <TabsTrigger value="screens" data-testid="tab-screens">
            <Monitor className="h-4 w-4 mr-1.5" />
            Screens
          </TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups">
            <Users className="h-4 w-4 mr-1.5" />
            Screen Groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="screens" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : screens.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No screens configured yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {screens.map((screen) => (
                <button
                  key={screen.id}
                  onClick={() => setSelectedTarget({ type: "screen", id: screen.id })}
                  className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedTarget?.type === "screen" && selectedTarget.id === screen.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid={`button-select-screen-${screen.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Monitor className={`h-4 w-4 ${screen.isOnline ? "text-green-500" : "text-muted-foreground/50"}`} />
                    <span className="text-sm font-medium truncate">{screen.name}</span>
                  </div>
                  {screen.location && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{screen.location}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No screen groups configured yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedTarget({ type: "group", id: group.id })}
                  className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedTarget?.type === "group" && selectedTarget.id === group.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid={`button-select-group-${group.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{group.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {group.memberCount} screen{group.memberCount !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedTarget && (
        <div className="border-t pt-6">
          <TargetPresets
            key={`${selectedTarget.type}-${selectedTarget.id}`}
            targetType={selectedTarget.type}
            targetId={selectedTarget.id}
            targetName={selectedName}
            layouts={layouts}
            playlists={playlists}
            canManage={canManage}
          />
        </div>
      )}

      {!selectedTarget && !isLoading && (screens.length > 0 || groups.length > 0) && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LayoutGrid className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="font-medium text-muted-foreground">Select a screen or group above</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Then create and manage preset buttons for quick content switching.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ProgrammesTable } from "@/components/programmes-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  PlayCircle,
  Calendar,
  CalendarIcon,
  CheckCircle2,
  FileEdit,
  Upload,
  History,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
  GripVertical,
  LayoutGrid,
  Table as TableIcon,
  Layers,
  Clock,
  Monitor,
  AlertTriangle,
} from "lucide-react";
import type { Programme, Event, ProgrammeVersion, ScheduleBlock, LayoutTemplate, Playlist, Screen, ScreenGroup, TimeRule, ScheduleTarget, ZoneSource, AgendaWidgetConfig } from "@shared/schema";
import { ProgrammeBlocksContextMenu } from "@/components/programme-blocks-context-menu";

const programmeFormSchema = z.object({
  eventId: z.string().min(1, "Event is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type ProgrammeFormValues = z.infer<typeof programmeFormSchema>;

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const blockFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  priority: z.number().min(0).max(100).optional(),
  layoutTemplateId: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  isRecurring: z.boolean().default(false),
  daysOfWeek: z.array(z.number()).optional(),
  targetType: z.enum(["all", "screen", "group"]).default("all"),
  targetId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.isRecurring && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one day when recurring is enabled",
      path: ["daysOfWeek"],
    });
  }
  if (data.targetType !== "all" && (!data.targetId || data.targetId === "none")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Select a ${data.targetType === "screen" ? "screen" : "group"}`,
      path: ["targetId"],
    });
  }
});

type BlockFormValues = z.infer<typeof blockFormSchema>;

export function BlockEditorDialog({
  versionId,
  versionStatus,
  programmeId,
  block,
  layouts,
  playlists,
  screens,
  screenGroups,
  open,
  onOpenChange,
}: {
  versionId: string;
  versionStatus?: string;
  programmeId?: string;
  block?: ScheduleBlock;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!block;

  const existingTimeRule = ((block?.timeRules as TimeRule[]) || [])[0];
  const existingTarget = ((block?.targets as ScheduleTarget[]) || [])[0];

  const form = useForm<BlockFormValues>({
    resolver: zodResolver(blockFormSchema),
    defaultValues: {
      name: "",
      priority: 0,
      layoutTemplateId: "",
      startTime: "09:00",
      endTime: "17:00",
      startDate: undefined,
      endDate: undefined,
      isRecurring: false,
      daysOfWeek: [],
      targetType: "all",
      targetId: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: block?.name || "",
        priority: block?.priority ?? 0,
        layoutTemplateId: block?.layoutTemplateId || "",
        startTime: existingTimeRule?.startTime || "09:00",
        endTime: existingTimeRule?.endTime || "17:00",
        startDate: existingTimeRule?.startDate ? parseISO(existingTimeRule.startDate) : undefined,
        endDate: existingTimeRule?.endDate ? parseISO(existingTimeRule.endDate) : undefined,
        isRecurring: (existingTimeRule?.daysOfWeek?.length || 0) > 0,
        daysOfWeek: existingTimeRule?.daysOfWeek || [],
        targetType: existingTarget ? existingTarget.type : "all",
        targetId: existingTarget?.id || "",
      });
    }
  }, [open, block]);

  const isRecurring = form.watch("isRecurring");
  const targetType = form.watch("targetType");
  const selectedLayoutId = form.watch("layoutTemplateId");
  const selectedLayout = layouts.find((l) => l.id === selectedLayoutId);

  const [zoneMappings, setZoneMappings] = useState<Record<string, string>>({});
  const [fallbackPlaylistId, setFallbackPlaylistId] = useState<string>("");
  // Task #209 — block can target an agenda widget config directly
  // (mutually exclusive with a layout / fallback playlist). The
  // resolver synthesises a fullscreen agenda zone source when this
  // is set and no layout is chosen.
  const [agendaConfigId, setAgendaConfigId] = useState<string>("");
  const agendaConfigsQuery = useSiteFilteredQuery<AgendaWidgetConfig[]>("/api/agenda/configs");
  const { data: agendaConfigs = [] } = useQuery<AgendaWidgetConfig[]>({
    ...agendaConfigsQuery,
  });

  useEffect(() => {
    if (open) {
      const mappings: Record<string, string> = {};
      if (block?.zoneSources) {
        for (const zs of block.zoneSources as ZoneSource[]) {
          if (zs.playlistId && zs.zoneId !== "__fallback__") mappings[zs.zoneId] = zs.playlistId;
        }
      }
      setZoneMappings(mappings);
      const fbSource = (block?.zoneSources as ZoneSource[] | undefined)?.find(zs => zs.zoneId === "__fallback__");
      setFallbackPlaylistId(fbSource?.playlistId || "");
      setAgendaConfigId(((block as { agendaConfigId?: string | null } | undefined)?.agendaConfigId) || "");
    }
  }, [open, block]);

  useEffect(() => {
    if (!selectedLayout) return;
    const validZoneIds = new Set(
      ((selectedLayout.zones as any[]) || [])
        .filter((z: any) => z.type === "media_player")
        .map((z: any) => z.id)
    );
    setZoneMappings(prev => {
      const pruned: Record<string, string> = {};
      for (const [zoneId, playlistId] of Object.entries(prev)) {
        if (validZoneIds.has(zoneId)) pruned[zoneId] = playlistId;
      }
      return pruned;
    });
    if (selectedLayout && fallbackPlaylistId) {
      setFallbackPlaylistId("");
    }
    if (selectedLayout && agendaConfigId) {
      setAgendaConfigId("");
    }
  }, [selectedLayoutId]);

  const mediaPlayerZones = useMemo(() => {
    if (!selectedLayout) return [];
    return ((selectedLayout.zones as any[]) || []).filter((z: any) => z.type === "media_player");
  }, [selectedLayout]);

  const saveMutation = useMutation({
    mutationFn: (data: BlockFormValues) => {
      const timeRules: TimeRule[] = [{
        startDate: data.startDate ? format(data.startDate, "yyyy-MM-dd") : undefined,
        endDate: data.endDate ? format(data.endDate, "yyyy-MM-dd") : undefined,
        startTime: data.startTime,
        endTime: data.endTime,
        daysOfWeek: data.isRecurring ? data.daysOfWeek : undefined,
      }];

      const targets: ScheduleTarget[] = data.targetType !== "all" && data.targetId
        ? [{ type: data.targetType, id: data.targetId }]
        : [];

      const zoneSources: ZoneSource[] = Object.entries(zoneMappings)
        .filter(([_, playlistId]) => playlistId && playlistId !== "none")
        .map(([zoneId, playlistId]) => ({
          zoneId,
          type: "playlist" as const,
          playlistId,
        }));

      if (!data.layoutTemplateId && fallbackPlaylistId) {
        zoneSources.push({
          zoneId: "__fallback__",
          type: "playlist" as const,
          playlistId: fallbackPlaylistId,
        });
      }

      const payload = {
        name: data.name,
        priority: data.priority,
        layoutTemplateId: data.layoutTemplateId === "none" || !data.layoutTemplateId ? null : data.layoutTemplateId,
        agendaConfigId: !data.layoutTemplateId || data.layoutTemplateId === "none"
          ? (agendaConfigId || null)
          : null,
        timeRules,
        targets,
        zoneSources,
      };
      if (isEditing) {
        return apiRequest("PATCH", `/api/schedule-blocks/${block.id}`, payload);
      }
      return apiRequest("POST", `/api/programme-versions/${versionId}/blocks`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", versionId, "blocks"] });
      onOpenChange(false);
      form.reset();
      if (versionStatus === "draft" && programmeId) {
        toast({
          title: isEditing ? "Block updated" : "Block added",
          description: "This is a draft. Publish to update screens.",
          action: (
            <ToastAction
              altText="Publish now"
              data-testid="button-publish-from-programmes-toast"
              onClick={() => {
                apiRequest("POST", `/api/programmes/${programmeId}/publish`).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
                  toast({ title: "Programme published" });
                }).catch(() => {
                  toast({ title: "Failed to publish", variant: "destructive" });
                });
              }}
            >
              Publish now
            </ToastAction>
          ),
        });
      } else {
        toast({ title: isEditing ? "Block updated" : "Block added" });
      }
    },
    onError: () => {
      toast({ title: "Failed to save block", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Schedule Block" : "Add Schedule Block"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Block Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Morning Session" {...field} data-testid="input-block-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority (0–100)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        data-testid="input-block-priority"
                      />
                    </FormControl>
                    <FormDescription>Higher priority wins conflicts</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-block-start-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-block-end-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date (optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="justify-start text-left font-normal"
                            data-testid="button-block-start-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date (optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="justify-start text-left font-normal"
                            data-testid="button-block-end-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Recurring Schedule</FormLabel>
                    <FormDescription>Repeat on specific days of the week</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-block-recurring"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isRecurring && (
              <FormField
                control={form.control}
                name="daysOfWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days of Week</FormLabel>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS_OF_WEEK.map((day, index) => {
                        const isSelected = field.value?.includes(index);
                        return (
                          <Button
                            key={day}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            size="icon"
                            className="w-10 h-10 rounded-full"
                            data-testid={`toggle-day-${day.toLowerCase()}`}
                            onClick={() => {
                              if (isSelected) {
                                field.onChange(field.value?.filter((d: number) => d !== index) || []);
                              } else {
                                field.onChange([...(field.value || []), index].sort());
                              }
                            }}
                          >
                            <span className="text-sm font-medium">{day.charAt(0)}</span>
                          </Button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="layoutTemplateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Layout Template</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-block-layout">
                        <SelectValue placeholder="Select layout" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No layout</SelectItem>
                      {layouts.map((layout) => (
                        <SelectItem key={layout.id} value={layout.id}>
                          {layout.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedLayout && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  <span className="font-medium text-foreground">{selectedLayout.name}</span>
                  <span>({((selectedLayout.zones as any[])?.length || 0)} zones)</span>
                </div>
                {mediaPlayerZones.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Playlist Zone Mapping</Label>
                    <p className="text-xs text-muted-foreground">Assign playlists to media player zones in this layout</p>
                    {mediaPlayerZones.map((zone: any) => (
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
                )}
              </div>
            )}

            {!selectedLayout && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Fullscreen Playlist</span>
                </div>
                <p className="text-xs text-muted-foreground">Without a layout, select a playlist to play fullscreen on target screens.</p>
                <Select
                  value={fallbackPlaylistId || "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? "" : v;
                    setFallbackPlaylistId(next);
                    if (next && agendaConfigId) setAgendaConfigId("");
                  }}
                  disabled={!!agendaConfigId}
                >
                  <SelectTrigger data-testid="select-fallback-playlist">
                    <SelectValue placeholder="Select a playlist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No playlist</SelectItem>
                    {playlists.map((pl) => (
                      <SelectItem key={pl.id} value={pl.id}>
                        {pl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!selectedLayout && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Agenda Display</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Or, target a saved agenda widget config directly. The player renders it fullscreen — no layout needed.
                </p>
                <Select
                  value={agendaConfigId || "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? "" : v;
                    setAgendaConfigId(next);
                    if (next && fallbackPlaylistId) setFallbackPlaylistId("");
                  }}
                  disabled={!!fallbackPlaylistId}
                >
                  <SelectTrigger data-testid="select-block-agenda-config">
                    <SelectValue placeholder="Select an agenda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No agenda</SelectItem>
                    {agendaConfigs.map((cfg) => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-block-target-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">All Screens</SelectItem>
                        <SelectItem value="screen">Specific Screen</SelectItem>
                        <SelectItem value="group">Screen Group</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {targetType !== "all" && (
                <FormField
                  control={form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{targetType === "screen" ? "Screen" : "Group"}</FormLabel>
                      <Select value={field.value || "none"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-block-target-id">
                            <SelectValue placeholder={`Select ${targetType}`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {targetType === "screen"
                            ? screens.map((screen) => (
                                <SelectItem key={screen.id} value={screen.id}>
                                  {screen.name}
                                </SelectItem>
                              ))
                            : screenGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-block">
                {saveMutation.isPending ? "Saving..." : isEditing ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleBlockRow({
  block,
  layout,
  agendaConfig,
  screens,
  screenGroups,
  onEdit,
  onDelete,
  programme,
  sourceVersion,
  destinationClientId,
  layouts,
  playlists,
}: {
  block: ScheduleBlock;
  layout?: LayoutTemplate;
  agendaConfig?: AgendaWidgetConfig;
  screens: Screen[];
  screenGroups: ScreenGroup[];
  onEdit: () => void;
  onDelete: () => void;
  programme: Programme;
  sourceVersion: ProgrammeVersion;
  destinationClientId: string | null;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
}) {
  const timeRule = ((block.timeRules as TimeRule[]) || [])[0];
  const target = ((block.targets as ScheduleTarget[]) || [])[0];
  const targetLabel = target
    ? target.type === "screen"
      ? screens.find(s => s.id === target.id)?.name || "Unknown screen"
      : screenGroups.find(g => g.id === target.id)?.name || "Unknown group"
    : "All screens";

  return (
    <ProgrammeBlocksContextMenu
      programme={programme}
      // The context menu's paste flow uses this programme as the
      // destination too. Right-clicking a block in programme A and
      // pasting from a different programme B's clipboard is allowed
      // and writes into A.
      targetVersion={sourceVersion}
      destinationClientId={destinationClientId}
      layouts={layouts}
      playlists={playlists}
      screens={screens}
      screenGroups={screenGroups}
      sourceVersion={sourceVersion}
      block={block}
    >
      <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium" data-testid={`text-block-name-${block.id}`}>{block.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {timeRule?.startTime && timeRule?.endTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeRule.startTime}–{timeRule.endTime}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Monitor className="h-3 w-3" />
                {targetLabel}
              </span>
              <span>• P{block.priority}</span>
              {layout && <span>• {layout.name}</span>}
              {!layout && agendaConfig && (
                <span data-testid={`text-block-agenda-${block.id}`}>• Agenda: {agendaConfig.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-block-${block.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-block-${block.id}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </ProgrammeBlocksContextMenu>
  );
}

function ScheduleBlocksSection({
  version,
  layouts,
  playlists,
  screens,
  screenGroups,
  programme,
  destinationClientId,
}: {
  version: ProgrammeVersion;
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  programme: Programme;
  // Effective client id for the programme's event — used by the
  // paste-blocks context menu to compute its preview without a refetch.
  destinationClientId: string | null;
}) {
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | undefined>();
  const { toast } = useToast();

  const { data: blocks = [] } = useQuery<ScheduleBlock[]>({
    queryKey: ["/api/programme-versions", version.id, "blocks"],
    queryFn: () => fetch(`/api/programme-versions/${version.id}/blocks`, { credentials: "include" }).then((r) => r.json()),
    enabled: blocksOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: (blockId: string) => apiRequest("DELETE", `/api/schedule-blocks/${blockId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", version.id, "blocks"] });
      if (version.status === "draft") {
        toast({
          title: "Block deleted",
          description: "This is a draft. Publish to update screens.",
          action: (
            <ToastAction
              altText="Publish now"
              data-testid="button-publish-from-delete-programmes-toast"
              onClick={() => {
                apiRequest("POST", `/api/programmes/${version.programmeId}/publish`).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
                  toast({ title: "Programme published" });
                }).catch(() => {
                  toast({ title: "Failed to publish", variant: "destructive" });
                });
              }}
            >
              Publish now
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Block deleted" });
      }
    },
    onError: () => {
      toast({ title: "Failed to delete block", variant: "destructive" });
    },
  });

  const layoutMap = new Map(layouts.map((l) => [l.id, l]));

  // Task #213 — surface the agenda name on rows for blocks that
  // target an agenda config directly (no layout).
  const agendaConfigsQuery = useSiteFilteredQuery<AgendaWidgetConfig[]>("/api/agenda/configs");
  const { data: agendaConfigs = [] } = useQuery<AgendaWidgetConfig[]>({
    ...agendaConfigsQuery,
    enabled: blocksOpen,
  });
  const agendaConfigMap = new Map(agendaConfigs.map((c) => [c.id, c]));

  const handleAddBlock = () => {
    setEditingBlock(undefined);
    setBlockDialogOpen(true);
  };

  const handleEditBlock = (block: ScheduleBlock) => {
    setEditingBlock(block);
    setBlockDialogOpen(true);
  };

  return (
    <>
      <Collapsible open={blocksOpen} onOpenChange={setBlocksOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 text-xs"
            data-testid={`button-toggle-blocks-${version.id}`}
          >
            <Layers className="h-3 w-3" />
            {blocksOpen ? "Hide Blocks" : "Manage Blocks"}
            {blocksOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/*
            Section-level right-click target: lets the user copy every
            block at once or paste from the clipboard onto this
            programme. The same menu wraps each individual row below
            (in block mode) for the per-row Copy block / Copy series
            actions.
          */}
          <ProgrammeBlocksContextMenu
            programme={programme}
            targetVersion={version}
            destinationClientId={destinationClientId}
            layouts={layouts}
            playlists={playlists}
            screens={screens}
            screenGroups={screenGroups}
            sourceVersion={version}
            allBlocks={blocks}
          >
            <div className="mt-3 space-y-2 p-3 bg-muted/30 rounded-md">
              {blocks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No schedule blocks. Add blocks to define content timing.
                </p>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block) => (
                    <ScheduleBlockRow
                      key={block.id}
                      block={block}
                      layout={block.layoutTemplateId ? layoutMap.get(block.layoutTemplateId) : undefined}
                      agendaConfig={block.agendaConfigId ? agendaConfigMap.get(block.agendaConfigId) : undefined}
                      screens={screens}
                      screenGroups={screenGroups}
                      onEdit={() => handleEditBlock(block)}
                      onDelete={() => deleteMutation.mutate(block.id)}
                      programme={programme}
                      sourceVersion={version}
                      destinationClientId={destinationClientId}
                      layouts={layouts}
                      playlists={playlists}
                    />
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleAddBlock}
                data-testid={`button-add-block-${version.id}`}
              >
                <Plus className="mr-2 h-3 w-3" />
                Add Block
              </Button>
            </div>
          </ProgrammeBlocksContextMenu>
        </CollapsibleContent>
      </Collapsible>

      <BlockEditorDialog
        versionId={version.id}
        versionStatus={version.status ?? undefined}
        programmeId={version.programmeId}
        block={editingBlock}
        layouts={layouts}
        playlists={playlists}
        screens={screens}
        screenGroups={screenGroups}
        open={blockDialogOpen}
        onOpenChange={(open) => {
          setBlockDialogOpen(open);
          if (!open) setEditingBlock(undefined);
        }}
      />
    </>
  );
}

function ProgrammeCard({
  programme,
  event,
  versions,
  layouts,
  playlists,
  screens,
  screenGroups,
  editOpen: editOpenProp,
  onEditOpenChange,
  dragHandle,
  onMoveToStart,
  onMoveToEnd,
  canMove,
  moveDisabledReason,
}: {
  programme: Programme;
  event?: Event;
  versions: ProgrammeVersion[];
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
  dragHandle?: React.ReactNode;
  onMoveToStart?: () => void;
  onMoveToEnd?: () => void;
  canMove?: boolean;
  moveDisabledReason?: string;
}) {
  // Controlled-or-uncontrolled edit dialog: when the parent passes editOpen
  // we honour it (used by the table view's hidden host card); otherwise we
  // own local state for the standalone card.
  const [editOpenLocal, setEditOpenLocal] = useState(false);
  const editOpen = editOpenProp ?? editOpenLocal;
  const setEditOpen = (next: boolean) => {
    if (onEditOpenChange) onEditOpenChange(next);
    else setEditOpenLocal(next);
  };
  const { toast } = useToast();

  const eventsQ = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [] } = useQuery({ ...eventsQ });

  const programmeVersions = versions.filter((v) => v.programmeId === programme.id);
  const publishedVersion = programmeVersions.find((v) => v.status === "published");
  const draftVersion = programmeVersions.find((v) => v.status === "draft");

  const form = useForm<ProgrammeFormValues>({
    resolver: zodResolver(programmeFormSchema),
    defaultValues: {
      eventId: programme.eventId,
      name: programme.name,
      description: programme.description || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProgrammeFormValues) =>
      apiRequest("PATCH", `/api/programmes/${programme.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      setEditOpen(false);
      toast({ title: "Programme updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update programme", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/programmes/${programme.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: "Programme deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete programme", variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/programmes/${programme.id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
      toast({ title: "Programme published successfully" });
    },
    onError: () => {
      toast({ title: "Failed to publish programme", variant: "destructive" });
    },
  });

  // Card-surface right-click target: lets the user copy all blocks
  // or paste from the clipboard without first expanding "Manage
  // Blocks". The inner block-list and per-row menus inside the
  // collapsible still take precedence (radix's innermost
  // ContextMenuTrigger captures the event), so existing block-row
  // actions keep working unchanged. The wrapper is always mounted —
  // when the programme has no versions yet, sourceVersion is null
  // and the menu only shows Paste (the bulk-paste handler will
  // auto-create a draft on the destination). The menu component
  // skips rendering altogether when neither Copy nor Paste applies,
  // so right-click on an empty programme without a clipboard still
  // shows the browser's native menu.
  const cardSourceVersion = draftVersion || publishedVersion || null;

  const cardElement = (
    <Card className="hover-elevate transition-all relative">
      {dragHandle}
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PlayCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base" data-testid={`text-programme-name-${programme.id}`}>
                {programme.name}
              </CardTitle>
              {publishedVersion ? (
                <Badge className="bg-green-500/10 text-green-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Published
                </Badge>
              ) : draftVersion ? (
                <Badge variant="secondary" className="gap-1">
                  <FileEdit className="h-3 w-3" />
                  Draft
                </Badge>
              ) : (
                <Badge variant="outline">No versions</Badge>
              )}
            </div>
            {event && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{event.name}</span>
              </div>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-programme-menu-${programme.id}`}>
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
                  <DialogTitle>Edit Programme</DialogTitle>
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
                      name="eventId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-programme-event">
                                <SelectValue placeholder="Select an event" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
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
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-programme-name" />
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
                            <Textarea {...field} data-testid="input-edit-programme-description" />
                          </FormControl>
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
                        data-testid="button-save-programme"
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            {draftVersion && (
              <DropdownMenuItem onSelect={() => publishMutation.mutate()}>
                <Upload className="mr-2 h-4 w-4" />
                Publish
              </DropdownMenuItem>
            )}
            {(onMoveToStart || onMoveToEnd) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canMove}
                  onSelect={() => onMoveToStart?.()}
                  title={!canMove ? moveDisabledReason : undefined}
                  data-testid={`menu-move-to-start-${programme.id}`}
                >
                  <ChevronsUp className="mr-2 h-4 w-4" />
                  Move to start
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canMove}
                  onSelect={() => onMoveToEnd?.()}
                  title={!canMove ? moveDisabledReason : undefined}
                  data-testid={`menu-move-to-end-${programme.id}`}
                >
                  <ChevronsDown className="mr-2 h-4 w-4" />
                  Move to end
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
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
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            <span>{programmeVersions.length} version(s)</span>
          </div>
          {publishedVersion?.publishedAt && (
            <span>
              Published {format(new Date(publishedVersion.publishedAt), "MMM d, HH:mm")}
            </span>
          )}
        </div>
        {(publishedVersion || draftVersion) && (
          // Prefer the DRAFT version when one exists — that's the
          // version the bulk-paste handler will write into (or
          // create if missing). Showing the draft here keeps the
          // preview/refetch context aligned with what the server
          // will actually mutate.
          <ScheduleBlocksSection
            version={draftVersion || publishedVersion!}
            layouts={layouts}
            playlists={playlists}
            screens={screens}
            screenGroups={screenGroups}
            programme={programme}
            destinationClientId={event?.clientId ?? null}
          />
        )}
        {!publishedVersion && draftVersion && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-xs" data-testid="warning-draft-blocks">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>This programme is unpublished. Schedule blocks won't appear on screens until you publish.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <ProgrammeBlocksContextMenu
      programme={programme}
      targetVersion={cardSourceVersion}
      destinationClientId={event?.clientId ?? null}
      layouts={layouts}
      playlists={playlists}
      screens={screens}
      screenGroups={screenGroups}
      sourceVersion={cardSourceVersion}
      // Intentionally omit allBlocks: copyAll falls back to a fresh
      // fetch so the clipboard never captures stale data, and we
      // avoid eagerly loading blocks for every collapsed card.
    >
      {cardElement}
    </ProgrammeBlocksContextMenu>
  );
}

function ManageBlocksDialog({
  programme,
  event,
  versions,
  layouts,
  playlists,
  screens,
  screenGroups,
  open,
  onOpenChange,
}: {
  programme: Programme;
  // Optional because the table-view host (line ~1883) may not have
  // the event handy in every code path; the context menu falls back
  // to a null destinationClientId in that case and the server still
  // performs its own access checks.
  event?: Event;
  versions: ProgrammeVersion[];
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const programmeVersions = versions.filter((v) => v.programmeId === programme.id);
  const publishedVersion = programmeVersions.find((v) => v.status === "published");
  const draftVersion = programmeVersions.find((v) => v.status === "draft");
  // Prefer the draft version when one exists — that's the version
  // the bulk-paste handler will mutate, so the dialog should show
  // its blocks (not the published version's).
  const targetVersion = draftVersion || publishedVersion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid={`text-manage-blocks-title-${programme.id}`}>
            Manage Blocks — {programme.name}
          </DialogTitle>
        </DialogHeader>
        {targetVersion ? (
          <div className="space-y-3">
            {!publishedVersion && draftVersion && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>This programme is unpublished. Schedule blocks won't appear on screens until you publish.</span>
              </div>
            )}
            <ScheduleBlocksSection
              version={targetVersion}
              layouts={layouts}
              playlists={playlists}
              screens={screens}
              screenGroups={screenGroups}
              programme={programme}
              destinationClientId={event?.clientId ?? null}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This programme has no versions yet. Edit the programme first to create one.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SortableProgrammeCard(props: {
  programme: Programme;
  event?: Event;
  versions: ProgrammeVersion[];
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  dragEnabled: boolean;
  dragDisabledReason?: string;
  onMoveToStart: () => void;
  onMoveToEnd: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.programme.id, disabled: !props.dragEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...(props.dragEnabled ? attributes : {})}
      {...(props.dragEnabled ? listeners : {})}
      disabled={!props.dragEnabled}
      title={props.dragEnabled ? "Drag to reorder" : props.dragDisabledReason}
      aria-label="Drag to reorder"
      data-testid={`drag-handle-${props.programme.id}`}
      className={cn(
        "absolute left-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
        props.dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed",
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className="group">
      <ProgrammeCard
        programme={props.programme}
        event={props.event}
        versions={props.versions}
        layouts={props.layouts}
        playlists={props.playlists}
        screens={props.screens}
        screenGroups={props.screenGroups}
        dragHandle={handle}
        onMoveToStart={props.onMoveToStart}
        onMoveToEnd={props.onMoveToEnd}
        canMove={props.dragEnabled}
        moveDisabledReason={props.dragDisabledReason}
      />
    </div>
  );
}

function CreateProgrammeDialog({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ProgrammeFormValues>({
    resolver: zodResolver(programmeFormSchema),
    defaultValues: {
      eventId: "",
      name: "",
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ProgrammeFormValues) =>
      apiRequest("POST", "/api/programmes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
      setOpen(false);
      form.reset();
      toast({ title: "Programme created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create programme", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={events.length === 0} data-testid="button-create-programme">
          <Plus className="mr-2 h-4 w-4" />
          Add Programme
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Programme</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="eventId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-programme-event">
                        <SelectValue placeholder="Select an event" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Main Stage Schedule"
                      {...field}
                      data-testid="input-programme-name"
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
                      placeholder="Brief description of the programme"
                      {...field}
                      data-testid="input-programme-description"
                    />
                  </FormControl>
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
                data-testid="button-submit-programme"
              >
                {createMutation.isPending ? "Creating..." : "Create Programme"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type ProgrammesView = "cards" | "table";

const PROGRAMMES_LEGACY_VIEW_KEY = "vectormesh:programmes-view";

function programmesViewStorageKey(userId: string | null | undefined): string {
  return userId ? `vectormesh:${userId}:programmes-view` : PROGRAMMES_LEGACY_VIEW_KEY;
}

function loadProgrammesViewPreference(userId: string | null | undefined): ProgrammesView {
  try {
    const key = programmesViewStorageKey(userId);
    let v = localStorage.getItem(key);
    if (!v && userId) {
      // One-time migration from the legacy unscoped key
      const legacy = localStorage.getItem(PROGRAMMES_LEGACY_VIEW_KEY);
      if (legacy === "table" || legacy === "cards") {
        v = legacy;
        localStorage.setItem(key, legacy);
      }
    }
    if (v === "table" || v === "cards") return v;
  } catch {
    // ignore
  }
  return "cards";
}

export default function ProgrammesPage() {
  const programmesQ = useSiteFilteredQuery<Programme[]>("/api/programmes");
  const { data: programmes = [], isLoading: programmesLoading } = useQuery({ ...programmesQ });

  const eventsQ = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [], isLoading: eventsLoading } = useQuery({ ...eventsQ });

  const { data: versions = [] } = useQuery<ProgrammeVersion[]>({
    queryKey: ["/api/programme-versions"],
  });

  const layoutsQ = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const { data: layouts = [] } = useQuery(layoutsQ);

  const playlistsQ = useSiteFilteredQuery<Playlist[]>("/api/playlists");
  const { data: playlists = [] } = useQuery(playlistsQ);

  const screensQ = useSiteFilteredQuery<Screen[]>("/api/screens");
  const { data: screens = [] } = useQuery<Screen[]>(screensQ);

  const screenGroupsQ = useSiteFilteredQuery<ScreenGroup[]>("/api/screen-groups");
  const { data: screenGroups = [] } = useQuery<ScreenGroup[]>(screenGroupsQ);

  const isLoading = programmesLoading || eventsLoading;

  const eventMap = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { toast: pageToast } = useToast();
  const [view, setView] = useState<ProgrammesView>(() => loadProgrammesViewPreference(userId));
  // Filter by event id ("all" means no filter). Mirrors the Screens page
  // pattern so reorder can be gated correctly: drag-to-reorder rewrites the
  // global displayOrder, so it must only be allowed when every programme
  // is visible (i.e. filter === "all").
  const [filter, setFilter] = useState<string>("all");
  // Hosts the edit dialog when the user clicks Edit in the table view. The
  // card view owns its own per-card dialog state; the table doesn't mount
  // per-row cards, so we mount a single hidden ProgrammeCard here as the
  // edit-form host, keyed by the programme id.
  const [editingProgrammeId, setEditingProgrammeId] = useState<string | null>(null);
  // Hosts the Manage Blocks dialog when triggered from a table row.
  const [managingBlocksProgrammeId, setManagingBlocksProgrammeId] = useState<string | null>(null);

  // Local optimistic order, synced from server data when not actively dragging.
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  useEffect(() => {
    setOrderedIds(programmes.map((p) => p.id));
  }, [programmes]);

  const orderedProgrammes = useMemo(() => {
    const map = new Map(programmes.map((p) => [p.id, p]));
    const arr: Programme[] = [];
    for (const id of orderedIds) {
      const p = map.get(id);
      if (p) arr.push(p);
    }
    // Append any programmes not yet in orderedIds (e.g. just created)
    for (const p of programmes) {
      if (!orderedIds.includes(p.id)) arr.push(p);
    }
    return arr;
  }, [programmes, orderedIds]);

  const filteredProgrammes = useMemo(() => {
    if (filter === "all") return orderedProgrammes;
    return orderedProgrammes.filter((p) => p.eventId === filter);
  }, [orderedProgrammes, filter]);

  const reorderMutation = useMutation({
    mutationFn: (newOrderedIds: string[]) =>
      apiRequest("PATCH", "/api/programmes/reorder", { orderedIds: newOrderedIds }),
    onMutate: async (newOrderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["/api/programmes"] });
      const previous = queryClient.getQueryData<Programme[]>(["/api/programmes"]);
      if (previous) {
        const byId = new Map(previous.map((p) => [p.id, p]));
        const reordered: Programme[] = [];
        newOrderedIds.forEach((id) => {
          const p = byId.get(id);
          if (p) reordered.push(p);
        });
        previous.forEach((p) => {
          if (!newOrderedIds.includes(p.id)) reordered.push(p);
        });
        queryClient.setQueryData(["/api/programmes"], reordered);
      }
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
    },
    onError: (_err, _vars, context) => {
      pageToast({ title: "Failed to save order", variant: "destructive" });
      if (context?.previous) {
        queryClient.setQueryData(["/api/programmes"], context.previous);
        setOrderedIds(context.previous.map((p) => p.id));
      } else {
        setOrderedIds(programmes.map((p) => p.id));
      }
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEnabled = filter === "all" && view === "cards";
  const dragDisabledReason = filter !== "all"
    ? "Clear the event filter to reorder programmes."
    : undefined;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(orderedIds, oldIndex, newIndex);
    setOrderedIds(next);
    reorderMutation.mutate(next);
  };

  const moveProgrammeTo = (programmeId: string, position: "start" | "end") => {
    const idx = orderedIds.indexOf(programmeId);
    if (idx < 0) return;
    const without = orderedIds.filter((id) => id !== programmeId);
    const next = position === "start" ? [programmeId, ...without] : [...without, programmeId];
    setOrderedIds(next);
    reorderMutation.mutate(next);
  };

  // If the user identity becomes available after first render, re-load the
  // user-scoped preference (handles the case where useAuth resolves async).
  useEffect(() => {
    setView(loadProgrammesViewPreference(userId));
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(programmesViewStorageKey(userId), view);
    } catch {
      // ignore
    }
  }, [view, userId]);

  // Mutations for table-row actions (publish, delete) — mirror the per-card
  // mutations so the table can act without mounting a card per row.
  const publishFromTable = useMutation({
    mutationFn: (programme: Programme) =>
      apiRequest("POST", `/api/programmes/${programme.id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
      pageToast({ title: "Programme published successfully" });
    },
    onError: () => {
      pageToast({ title: "Failed to publish programme", variant: "destructive" });
    },
  });

  const deleteFromTable = useMutation({
    mutationFn: (programme: Programme) =>
      apiRequest("DELETE", `/api/programmes/${programme.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      pageToast({ title: "Programme deleted successfully" });
    },
    onError: () => {
      pageToast({ title: "Failed to delete programme", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-programmes-title">Programmes</h1>
          <p className="text-muted-foreground">
            Build and publish content schedules for events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-card p-0.5" role="group" aria-label="View mode">
            <Button
              type="button"
              size="sm"
              variant={view === "cards" ? "secondary" : "ghost"}
              className="h-8 gap-1.5"
              onClick={() => setView("cards")}
              data-testid="button-view-cards"
              aria-pressed={view === "cards"}
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              className="h-8 gap-1.5"
              onClick={() => setView("table")}
              data-testid="button-view-table"
              aria-pressed={view === "table"}
            >
              <TableIcon className="h-4 w-4" />
              Table
            </Button>
          </div>
          <CreateProgrammeDialog events={events} />
        </div>
      </div>

      {/* Filter + drag-disabled note */}
      {!isLoading && programmes.length > 0 && events.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Event:</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-[200px]" data-testid="select-filter-event">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filter !== "all" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setFilter("all")}
                data-testid="button-clear-filter"
              >
                Clear filter
              </Button>
            )}
          </div>
          {view === "cards" && filter !== "all" && (
            <span className="text-xs text-muted-foreground" data-testid="text-drag-disabled-note">
              Drag-to-reorder is paused while a filter is active.
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        view === "table" ? (
          <div className="rounded-md border bg-card p-4 space-y-3" data-testid="skeleton-programmes-table">
            <Skeleton className="h-8 w-full" />
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : programmes.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <PlayCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No programmes yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {events.length === 0
                ? "Create an event first, then build programmes for it."
                : "Create a programme to schedule content for your events."}
            </p>
            <CreateProgrammeDialog events={events} />
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        filteredProgrammes.length === 0 ? (
          <Card className="py-8">
            <CardContent className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
              No programmes match the current filter.
            </CardContent>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredProgrammes.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-programme-cards">
                {filteredProgrammes.map((programme) => (
                  <SortableProgrammeCard
                    key={programme.id}
                    programme={programme}
                    event={eventMap.get(programme.eventId)}
                    versions={versions}
                    layouts={layouts}
                    playlists={playlists}
                    screens={screens}
                    screenGroups={screenGroups}
                    dragEnabled={dragEnabled}
                    dragDisabledReason={dragDisabledReason}
                    onMoveToStart={() => moveProgrammeTo(programme.id, "start")}
                    onMoveToEnd={() => moveProgrammeTo(programme.id, "end")}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )
      ) : (
        <>
          <ProgrammesTable
            programmes={filteredProgrammes}
            events={events}
            versions={versions}
            layouts={layouts}
            playlists={playlists}
            screens={screens}
            screenGroups={screenGroups}
            onEdit={(p) => setEditingProgrammeId(p.id)}
            onManageBlocks={(p) => setManagingBlocksProgrammeId(p.id)}
            onPublish={(p) => publishFromTable.mutate(p)}
            onDelete={(p) => deleteFromTable.mutate(p)}
          />
          {/*
            Edit dialog host: mount a single ProgrammeCard for the programme
            the user clicked in the table. The card itself is visually hidden;
            its Dialog is rendered into a portal so the user only sees the
            edit modal. This avoids mounting the entire card grid in table
            mode while reusing the existing edit form.
          */}
          {editingProgrammeId && (() => {
            const editingProgramme = programmes.find((p) => p.id === editingProgrammeId);
            if (!editingProgramme) return null;
            return (
              <div className="hidden" aria-hidden="true">
                <ProgrammeCard
                  key={`edit-${editingProgramme.id}`}
                  programme={editingProgramme}
                  event={eventMap.get(editingProgramme.eventId)}
                  versions={versions}
                  layouts={layouts}
                  playlists={playlists}
                  screens={screens}
                  screenGroups={screenGroups}
                  editOpen={true}
                  onEditOpenChange={(open) => {
                    if (!open) setEditingProgrammeId(null);
                  }}
                />
              </div>
            );
          })()}
          {managingBlocksProgrammeId && (() => {
            const managingProgramme = programmes.find((p) => p.id === managingBlocksProgrammeId);
            if (!managingProgramme) return null;
            return (
              <ManageBlocksDialog
                key={`blocks-${managingProgramme.id}`}
                programme={managingProgramme}
                event={eventMap.get(managingProgramme.eventId)}
                versions={versions}
                layouts={layouts}
                playlists={playlists}
                screens={screens}
                screenGroups={screenGroups}
                open={true}
                onOpenChange={(open) => {
                  if (!open) setManagingBlocksProgrammeId(null);
                }}
              />
            );
          })()}
        </>
      )}
    </div>
  );
}

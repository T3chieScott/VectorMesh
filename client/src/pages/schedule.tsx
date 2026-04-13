import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  differenceInMinutes,
  isWithinInterval,
} from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Layers,
  AlertTriangle,
  Repeat,
  GripVertical,
  Trash2,
  Pencil,
  Copy,
  PlayCircle,
  Monitor,
} from "lucide-react";
import type {
  ScheduleBlock,
  Programme,
  ProgrammeVersion,
  LayoutTemplate,
  Screen,
  ScreenGroup,
  Playlist,
  MediaAsset,
  TimeRule,
  ScheduleTarget,
  ZoneSource,
} from "@shared/schema";

type ViewMode = "day" | "week";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT = 60;
const SNAP_MINUTES = 15;
const DRAG_THRESHOLD = 5;

interface ScheduleBlockWithMeta extends ScheduleBlock {
  programmeVersionId: string;
  color?: string;
}

interface ConflictInfo {
  blockId: string;
  conflictsWith: string[];
  winningBlockId: string;
}

const BLOCK_COLORS = [
  "bg-blue-500/80",
  "bg-green-500/80",
  "bg-purple-500/80",
  "bg-orange-500/80",
  "bg-pink-500/80",
  "bg-teal-500/80",
  "bg-indigo-500/80",
  "bg-rose-500/80",
];

function getBlockColor(index: number): string {
  return BLOCK_COLORS[index % BLOCK_COLORS.length];
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function formatTimeInput(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToTimeStr(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, 24 * 60 - 1));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return formatTimeInput(h, m);
}

type DragMode = "move" | "resize-top" | "resize-bottom";

interface TimelineDragState {
  blockId: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origStartMin: number;
  origEndMin: number;
  origDate: Date;
  currentStartMin: number;
  currentEndMin: number;
  currentDate: Date;
  dayOffset: number;
  hasMoved: boolean;
  color: string;
  blockName: string;
  shiftKey: boolean;
}

function TimeBlockRenderer({
  block,
  date,
  color,
  hasConflict,
  isWinner,
  onClick,
  timelineDrag,
  onDragInit,
}: {
  block: ScheduleBlockWithMeta;
  date: Date;
  color: string;
  hasConflict: boolean;
  isWinner: boolean;
  onClick: () => void;
  timelineDrag: TimelineDragState | null;
  onDragInit: (blockId: string, mode: DragMode, e: React.PointerEvent, origStartMin: number, origEndMin: number, date: Date, color: string, blockName: string) => void;
}) {
  const timeRules = (block.timeRules as TimeRule[]) || [];
  const dayOfWeek = date.getDay();
  const rule = timeRules.find((r) => {
    const days = r.daysOfWeek;
    if (days && days.length > 0 && !days.includes(dayOfWeek)) return false;
    if (r.startDate) {
      const rStart = parseISO(r.startDate);
      if (date < startOfDay(rStart)) return false;
    }
    if (r.endDate) {
      const rEnd = parseISO(r.endDate);
      if (date > endOfDay(rEnd)) return false;
    }
    return true;
  }) || timeRules[0];

  if (!rule?.startTime || !rule?.endTime) return null;

  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);

  const origStartMinutes = start.hours * 60 + start.minutes;
  let origEndMinutes = end.hours * 60 + end.minutes;
  if (origEndMinutes <= origStartMinutes) {
    origEndMinutes = 24 * 60;
  }

  const isDraggingThis = timelineDrag?.blockId === block.id;
  const isOrigDay = isDraggingThis && isSameDay(date, timelineDrag.origDate);
  const isResizeMode = isDraggingThis && (timelineDrag.mode === "resize-top" || timelineDrag.mode === "resize-bottom");
  const shouldAnimateThis = isDraggingThis && (
    isOrigDay ||
    (isResizeMode && timelineDrag.shiftKey)
  );
  const displayStartMin = shouldAnimateThis ? timelineDrag!.currentStartMin : origStartMinutes;
  const displayEndMin = shouldAnimateThis ? timelineDrag!.currentEndMin : origEndMinutes;
  const durationMinutes = displayEndMin - displayStartMin;

  if (durationMinutes <= 0 && !isDraggingThis) return null;

  const top = (displayStartMin / 60) * HOUR_HEIGHT;
  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20);

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDragInit(block.id, mode, e, origStartMinutes, origEndMinutes, date, color, block.name);
  };

  const isDragging = shouldAnimateThis && timelineDrag!.hasMoved;
  const dayShift = isOrigDay ? (timelineDrag?.dayOffset || 0) : 0;
  const cursor = (isOrigDay && timelineDrag?.hasMoved)
    ? timelineDrag.mode === "move" ? "grabbing" : "ns-resize"
    : "pointer";

  return (
    <div
      className={`absolute left-1 right-1 rounded-md px-2 py-1 select-none group ${color} ${
        hasConflict && !isWinner ? "opacity-50 border-2 border-dashed border-yellow-400" : ""
      } ${isDragging ? "opacity-80 ring-2 ring-white/70 z-30 shadow-lg" : "hover:ring-2 hover:ring-white/50"}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        cursor,
        transform: dayShift !== 0 ? `translateX(${dayShift * 100}%)` : undefined,
        transition: isDragging ? "none" : undefined,
        zIndex: isDragging ? 50 : undefined,
      }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      data-testid={`block-${block.id}`}
    >
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 group-hover:bg-white/20 rounded-t-md"
        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize-top"); }}
        data-testid={`resize-top-${block.id}`}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 group-hover:bg-white/20 rounded-b-md"
        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize-bottom"); }}
        data-testid={`resize-bottom-${block.id}`}
      />

      {isDragging && (isOrigDay || !isResizeMode) && (
        <div className="absolute -top-6 left-0 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-40 flex items-center gap-1">
          {minutesToTimeStr(displayStartMin)} – {minutesToTimeStr(displayEndMin)}
          {isResizeMode && isOrigDay && (
            <span className={`ml-1 px-1 rounded ${timelineDrag!.shiftKey ? "bg-blue-500/80 text-white" : "bg-muted text-muted-foreground"}`}>
              {timelineDrag!.shiftKey ? "All days" : "This day"}
            </span>
          )}
        </div>
      )}

      <div className="text-white text-xs font-medium truncate pointer-events-none">{block.name}</div>
      {height > 30 && (
        <div className="text-white/70 text-xs truncate pointer-events-none">
          {minutesToTimeStr(displayStartMin)} - {minutesToTimeStr(displayEndMin)}
        </div>
      )}
      {hasConflict && (
        <div className="absolute -top-1 -right-1 pointer-events-none">
          <AlertTriangle className="h-4 w-4 text-yellow-400 drop-shadow" />
        </div>
      )}
      {(timeRules[0]?.daysOfWeek?.length || 0) > 0 && (
        <div className="absolute bottom-1 right-1 pointer-events-none">
          <Repeat className="h-3 w-3 text-white/70" />
        </div>
      )}
    </div>
  );
}

function DayColumn({
  date,
  blocks,
  conflicts,
  onBlockClick,
  onSlotClick,
  onDrop,
  timelineDrag,
  onDragInit,
  columnRef,
}: {
  date: Date;
  blocks: ScheduleBlockWithMeta[];
  conflicts: ConflictInfo[];
  onBlockClick: (block: ScheduleBlock) => void;
  onSlotClick: (date: Date, hour: number) => void;
  onDrop: (date: Date, hour: number, data: string) => void;
  timelineDrag: TimelineDragState | null;
  onDragInit: (blockId: string, mode: DragMode, e: React.PointerEvent, origStartMin: number, origEndMin: number, date: Date, color: string, blockName: string) => void;
  columnRef?: (el: HTMLDivElement | null) => void;
}) {
  const isToday = isSameDay(date, new Date());
  const dayOfWeek = date.getDay();

  const isDropTarget = timelineDrag && timelineDrag.hasMoved &&
    timelineDrag.mode === "move" &&
    isSameDay(timelineDrag.currentDate, date);

  const dayBlocks = blocks.filter((block) => {
    const timeRules = (block.timeRules as TimeRule[]) || [];
    return timeRules.some((rule) => {
      const days = rule.daysOfWeek;
      if (days && days.length > 0 && !days.includes(dayOfWeek)) return false;

      if (rule.startDate) {
        const startDate = parseISO(rule.startDate);
        if (date < startOfDay(startDate)) return false;
      }
      if (rule.endDate) {
        const endDate = parseISO(rule.endDate);
        if (date > endOfDay(endDate)) return false;
      }

      return true;
    });
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    onDrop(date, hour, data);
  };

  return (
    <div ref={columnRef} className={`flex-1 min-w-[120px] border-r border-border last:border-r-0 ${
      isDropTarget ? "bg-primary/5" : ""
    }`}>
      <div
        className={`sticky top-0 z-10 p-2 text-center border-b transition-colors ${
          isDropTarget ? "bg-primary/15 border-primary/30" : isToday ? "bg-primary/10 bg-card" : "bg-card"
        }`}
      >
        <div className="text-xs text-muted-foreground">{format(date, "EEE")}</div>
        <div className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
          {format(date, "d")}
        </div>
      </div>

      <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="absolute w-full border-b border-border/50 hover:bg-muted/30 cursor-pointer"
            style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            onClick={() => onSlotClick(date, hour)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, hour)}
            data-testid={`slot-${format(date, "yyyy-MM-dd")}-${hour}`}
          />
        ))}

        {dayBlocks.map((block, index) => {
          const conflict = conflicts.find((c) => c.blockId === block.id);
          return (
            <TimeBlockRenderer
              key={block.id}
              block={block}
              date={date}
              color={getBlockColor(index)}
              hasConflict={!!conflict}
              isWinner={conflict?.winningBlockId === block.id}
              onClick={() => onBlockClick(block)}
              timelineDrag={timelineDrag}
              onDragInit={onDragInit}
            />
          );
        })}
      </div>
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="w-16 flex-shrink-0 border-r border-border bg-muted/30 sticky left-0 z-20">
      <div className="sticky top-0 z-10 h-[52px] border-b bg-card" />
      <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="absolute w-full text-right pr-2 text-xs text-muted-foreground"
            style={{ top: `${hour * HOUR_HEIGHT - 8}px` }}
          >
            {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
          </div>
        ))}
      </div>
    </div>
  );
}

const blockFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  priority: z.number().min(0).max(100),
  layoutTemplateId: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  daysOfWeek: z.array(z.number()).optional(),
  isRecurring: z.boolean().default(false),
  targetType: z.enum(["all", "screen", "group"]),
  targetId: z.string().optional(),
});

type BlockFormValues = z.infer<typeof blockFormSchema>;

function ScheduleBlockEditor({
  open,
  onOpenChange,
  block,
  versionId,
  versionStatus,
  programmeId,
  initialDate,
  initialHour,
  droppedItem,
  layouts,
  screens,
  screenGroups,
  playlists,
  media,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: ScheduleBlock;
  versionId: string;
  versionStatus?: string;
  programmeId?: string;
  initialDate?: Date;
  initialHour?: number;
  droppedItem?: { type: string; id: string; name: string } | null;
  layouts: LayoutTemplate[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  playlists: Playlist[];
  media: MediaAsset[];
}) {
  const { toast } = useToast();
  const isEditing = !!block;
  
  const existingTimeRule = ((block?.timeRules as TimeRule[]) || [])[0];
  const existingTarget = ((block?.targets as ScheduleTarget[]) || [])[0];
  
  const defaultName = droppedItem?.type === "playlist" ? droppedItem.name : (block?.name || "");
  const defaultLayoutId = droppedItem?.type === "layout" ? droppedItem.id : "";
  
  const form = useForm<BlockFormValues>({
    resolver: zodResolver(blockFormSchema),
    defaultValues: {
      name: defaultName,
      priority: block?.priority || 0,
      layoutTemplateId: defaultLayoutId || block?.layoutTemplateId || "",
      startDate: existingTimeRule?.startDate ? parseISO(existingTimeRule.startDate) : initialDate,
      endDate: existingTimeRule?.endDate ? parseISO(existingTimeRule.endDate) : undefined,
      startTime: existingTimeRule?.startTime || (initialHour !== undefined ? formatTimeInput(initialHour, 0) : "09:00"),
      endTime: existingTimeRule?.endTime || (initialHour !== undefined ? formatTimeInput(initialHour + 1, 0) : "17:00"),
      daysOfWeek: existingTimeRule?.daysOfWeek || [],
      isRecurring: (existingTimeRule?.daysOfWeek?.length || 0) > 0,
      targetType: existingTarget ? existingTarget.type : "all",
      targetId: existingTarget?.id || "",
    },
  });
  
  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      const droppedLayoutId = droppedItem?.type === "layout" ? droppedItem.id : "";
      const resetName = droppedItem?.type === "playlist" ? droppedItem.name : (block?.name || "");
      form.reset({
        name: resetName,
        priority: block?.priority || 0,
        layoutTemplateId: droppedLayoutId || block?.layoutTemplateId || "",
        startDate: existingTimeRule?.startDate ? parseISO(existingTimeRule.startDate) : initialDate,
        endDate: existingTimeRule?.endDate ? parseISO(existingTimeRule.endDate) : undefined,
        startTime: existingTimeRule?.startTime || (initialHour !== undefined ? formatTimeInput(initialHour, 0) : "09:00"),
        endTime: existingTimeRule?.endTime || (initialHour !== undefined ? formatTimeInput(initialHour + 1, 0) : "17:00"),
        daysOfWeek: existingTimeRule?.daysOfWeek || [],
        isRecurring: (existingTimeRule?.daysOfWeek?.length || 0) > 0,
        targetType: existingTarget ? existingTarget.type : "all",
        targetId: existingTarget?.id || "",
      });
    }
  }, [open, block, droppedItem, initialDate, initialHour]);
  
  const isRecurring = form.watch("isRecurring");
  const targetType = form.watch("targetType");
  const selectedLayoutId = form.watch("layoutTemplateId");
  const selectedLayout = layouts.find((l) => l.id === selectedLayoutId);
  
  const [zoneMappings, setZoneMappings] = useState<Record<string, string>>(() => {
    const mappings: Record<string, string> = {};
    if (block?.zoneSources) {
      for (const zs of block.zoneSources as ZoneSource[]) {
        if (zs.playlistId) mappings[zs.zoneId] = zs.playlistId;
      }
    }
    return mappings;
  });

  const existingFallbackSource = (block?.zoneSources as ZoneSource[] | undefined)?.find(zs => zs.zoneId === "__fallback__");
  const [fallbackPlaylistId, setFallbackPlaylistId] = useState<string>(existingFallbackSource?.playlistId || "");
  
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

      if (droppedItem?.type === "playlist" && droppedItem.id) {
        setFallbackPlaylistId(droppedItem.id);
      }
    }
  }, [open, block, droppedItem]);

  useEffect(() => {
    if (!selectedLayout) return;
    const mpZones = ((selectedLayout.zones as any[]) || [])
      .filter((z: any) => z.type === "media_player");
    const validZoneIds = new Set(mpZones.map((z: any) => z.id));
    setZoneMappings(prev => {
      const pruned: Record<string, string> = {};
      for (const [zoneId, playlistId] of Object.entries(prev)) {
        if (validZoneIds.has(zoneId)) pruned[zoneId] = playlistId;
      }
      if (droppedItem?.type === "playlist" && droppedItem.id && mpZones.length > 0) {
        const firstZone = mpZones[0];
        if (!pruned[firstZone.id]) {
          pruned[firstZone.id] = droppedItem.id;
        }
      }
      return pruned;
    });
    if (selectedLayout && fallbackPlaylistId) {
      setFallbackPlaylistId("");
    }
  }, [selectedLayoutId]);
  
  const mediaPlayerZones = useMemo(() => {
    if (!selectedLayout) return [];
    const zones = (selectedLayout.zones as any[]) || [];
    return zones.filter((z: any) => z.type === "media_player");
  }, [selectedLayout]);
  
  const createMutation = useMutation({
    mutationFn: async (data: BlockFormValues) => {
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
        programmeVersionId: versionId,
        name: data.name,
        priority: data.priority,
        layoutTemplateId: data.layoutTemplateId || null,
        timeRules,
        targets,
        zoneSources,
      };
      
      if (isEditing && block) {
        return apiRequest("PATCH", `/api/schedule-blocks/${block.id}`, payload);
      }
      return apiRequest("POST", `/api/programme-versions/${versionId}/blocks`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", versionId, "blocks"] });
      onOpenChange(false);
      if (versionStatus === "draft" && programmeId) {
        toast({
          title: isEditing ? "Block updated" : "Block created",
          description: "This is a draft. Publish to update screens.",
          action: (
            <ToastAction
              altText="Publish now"
              data-testid="button-publish-from-toast"
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
        toast({
          title: isEditing ? "Block updated" : "Block created",
          description: `Schedule block "${form.getValues().name}" has been ${isEditing ? "updated" : "created"}.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? "update" : "create"} schedule block.`,
        variant: "destructive",
      });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!block) return;
      return apiRequest("DELETE", `/api/schedule-blocks/${block.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", versionId, "blocks"] });
      onOpenChange(false);
      if (versionStatus === "draft" && programmeId) {
        toast({
          title: "Block deleted",
          description: "This is a draft. Publish to update screens.",
          action: (
            <ToastAction
              altText="Publish now"
              data-testid="button-publish-from-delete-toast"
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
        toast({ title: "Block deleted" });
      }
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Schedule Block" : "Create Schedule Block"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Block Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Morning Announcements" {...field} data-testid="input-block-name" />
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
                    <FormLabel>Priority (0-100)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        data-testid="input-priority"
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
                      <Input type="time" {...field} data-testid="input-start-time" />
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
                      <Input type="time" {...field} data-testid="input-end-time" />
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
                            data-testid="button-start-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
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
                            data-testid="button-end-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
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
                      data-testid="switch-recurring"
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
                      {DAYS_OF_WEEK.map((day, index) => (
                        <label
                          key={day}
                          className={`flex items-center justify-center w-10 h-10 rounded-full border cursor-pointer transition-colors ${
                            field.value?.includes(index)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={field.value?.includes(index)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...(field.value || []), index].sort());
                              } else {
                                field.onChange(field.value?.filter((d) => d !== index) || []);
                              }
                            }}
                          />
                          <span className="text-sm font-medium">{day.charAt(0)}</span>
                        </label>
                      ))}
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
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <FormControl>
                      <SelectTrigger data-testid="select-layout">
                        <SelectValue placeholder="Select a layout" />
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
                  <span>
                    ({((selectedLayout.zones as any[])?.length || 0)} zones)
                  </span>
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
                  onValueChange={(v) => setFallbackPlaylistId(v === "none" ? "" : v)}
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
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-target-type">
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
                          <SelectTrigger data-testid="select-target-id">
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
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-block"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-block">
                {createMutation.isPending ? "Saving..." : isEditing ? "Update Block" : "Create Block"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ConflictPanel({ conflicts, blocks }: { conflicts: ConflictInfo[]; blocks: ScheduleBlock[] }) {
  if (conflicts.length === 0) return null;
  
  return (
    <Card className="border-yellow-500/50 bg-yellow-500/5">
      <CardHeader className="py-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-yellow-600">
          <AlertTriangle className="h-4 w-4" />
          Schedule Conflicts ({conflicts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {conflicts.map((conflict) => {
            const block = blocks.find((b) => b.id === conflict.blockId);
            const winner = blocks.find((b) => b.id === conflict.winningBlockId);
            const isWinner = conflict.blockId === conflict.winningBlockId;
            
            return (
              <div key={conflict.blockId} className="text-sm flex items-center gap-2">
                <Badge variant={isWinner ? "default" : "secondary"} className="text-xs">
                  {isWinner ? "Active" : "Overridden"}
                </Badge>
                <span className={isWinner ? "font-medium" : "text-muted-foreground line-through"}>
                  {block?.name}
                </span>
                {!isWinner && winner && (
                  <span className="text-muted-foreground">
                    → overridden by <strong>{winner.name}</strong> (priority {winner.priority})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DragItem({ item, type }: { item: { id: string; name: string }; type: "playlist" | "layout" }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ type, id: item.id, name: item.name }));
      }}
      className="flex items-center gap-2 p-2 rounded-md border bg-card cursor-grab hover-elevate"
      data-testid={`drag-${type}-${item.id}`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      {type === "layout" ? (
        <Monitor className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Layers className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm truncate flex-1">{item.name}</span>
    </div>
  );
}

export default function SchedulePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | undefined>();
  const [clickedSlot, setClickedSlot] = useState<{ date: Date; hour: number } | null>(null);
  const [droppedItem, setDroppedItem] = useState<{ type: string; id: string; name: string } | null>(null);
  const [timelineDrag, setTimelineDrag] = useState<TimelineDragState | null>(null);
  const columnRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const { toast } = useToast();
  
  const programmesQ = useSiteFilteredQuery<Programme[]>("/api/programmes");
  const layoutsQ = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const screensQ = useSiteFilteredQuery<Screen[]>("/api/screens");
  const playlistsQ = useSiteFilteredQuery<Playlist[]>("/api/playlists");
  const mediaQ = useSiteFilteredQuery<MediaAsset[]>("/api/media");

  const { data: programmes = [] } = useQuery<Programme[]>(programmesQ);
  const { data: allVersions = [] } = useQuery<ProgrammeVersion[]>({ queryKey: ["/api/programme-versions"] });
  const { data: layouts = [] } = useQuery<LayoutTemplate[]>(layoutsQ);
  const { data: screens = [] } = useQuery<Screen[]>(screensQ);
  const { data: screenGroups = [] } = useQuery<ScreenGroup[]>({ queryKey: ["/api/screen-groups"] });
  const { data: playlists = [] } = useQuery<Playlist[]>(playlistsQ);
  const { data: media = [] } = useQuery<MediaAsset[]>(mediaQ);
  
  const activeVersions = allVersions;

  useEffect(() => {
    if (selectedVersionId || allVersions.length === 0) return;
    const published = allVersions.find((v) => v.status === "published");
    if (published) setSelectedVersionId(published.id);
  }, [allVersions, selectedVersionId]);
  
  const selectedVersion = allVersions.find((v) => v.id === selectedVersionId);
  const isSelectedDraft = selectedVersion?.status === "draft";
  const selectedProgramme = selectedVersion
    ? programmes.find((p) => p.id === selectedVersion.programmeId)
    : null;
  
  const { data: blocks = [], isLoading: blocksLoading } = useQuery<ScheduleBlock[]>({
    queryKey: ["/api/programme-versions", selectedVersionId, "blocks"],
    queryFn: async () => {
      if (!selectedVersionId) return [];
      const res = await fetch(`/api/programme-versions/${selectedVersionId}/blocks`);
      if (!res.ok) throw new Error("Failed to fetch blocks");
      return res.json();
    },
    enabled: !!selectedVersionId,
  });
  
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = viewMode === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [currentDate];
  
  const conflicts = useMemo(() => {
    const result: ConflictInfo[] = [];
    const blocksWithRules = blocks.filter((b) => ((b.timeRules as TimeRule[]) || []).length > 0);
    
    for (let i = 0; i < blocksWithRules.length; i++) {
      for (let j = i + 1; j < blocksWithRules.length; j++) {
        const a = blocksWithRules[i];
        const b = blocksWithRules[j];
        
        const aRules = (a.timeRules as TimeRule[]) || [];
        const bRules = (b.timeRules as TimeRule[]) || [];
        
        const aRule = aRules[0];
        const bRule = bRules[0];
        
        if (!aRule?.startTime || !aRule?.endTime || !bRule?.startTime || !bRule?.endTime) continue;
        
        const aStart = parseTime(aRule.startTime);
        const aEnd = parseTime(aRule.endTime);
        const bStart = parseTime(bRule.startTime);
        const bEnd = parseTime(bRule.endTime);
        
        const aStartMins = aStart.hours * 60 + aStart.minutes;
        const aEndMins = aEnd.hours * 60 + aEnd.minutes;
        const bStartMins = bStart.hours * 60 + bStart.minutes;
        const bEndMins = bEnd.hours * 60 + bEnd.minutes;
        
        const overlaps = aStartMins < bEndMins && bStartMins < aEndMins;
        
        if (overlaps) {
          const winner = (a.priority || 0) >= (b.priority || 0) ? a : b;
          const loser = winner === a ? b : a;
          
          result.push({
            blockId: winner.id,
            conflictsWith: [loser.id],
            winningBlockId: winner.id,
          });
          result.push({
            blockId: loser.id,
            conflictsWith: [winner.id],
            winningBlockId: winner.id,
          });
        }
      }
    }
    
    return result;
  }, [blocks]);
  
  const handlePrevious = () => {
    setCurrentDate((prev) => (viewMode === "week" ? subWeeks(prev, 1) : addDays(prev, -1)));
  };
  
  const handleNext = () => {
    setCurrentDate((prev) => (viewMode === "week" ? addWeeks(prev, 1) : addDays(prev, 1)));
  };
  
  const handleToday = () => {
    setCurrentDate(new Date());
  };
  
  const handleBlockClick = (block: ScheduleBlock) => {
    setSelectedBlock(block);
    setClickedSlot(null);
    setEditorOpen(true);
  };
  
  const handleSlotClick = (date: Date, hour: number) => {
    if (!selectedVersionId) {
      toast({
        title: "No programme selected",
        description: "Please select a programme version to add schedule blocks.",
        variant: "destructive",
      });
      return;
    }
    setSelectedBlock(undefined);
    setClickedSlot({ date, hour });
    setEditorOpen(true);
  };
  
  const handleDrop = (date: Date, hour: number, dataStr: string) => {
    if (!selectedVersionId) {
      toast({
        title: "No programme selected",
        description: "Please select a programme version first.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const data = JSON.parse(dataStr);
      setSelectedBlock(undefined);
      setClickedSlot({ date, hour });
      setDroppedItem(data); // Pass dropped item info to editor
      setEditorOpen(true);
      toast({
        title: "Item dropped",
        description: `Creating schedule for "${data.name}"`,
      });
    } catch {
      console.error("Invalid drop data");
    }
  };
  
  const blockTimeMutation = useMutation({
    mutationFn: async ({ blockId, newStartTime, newEndTime, newDate, singleDayDate }: {
      blockId: string; newStartTime: string; newEndTime: string; newDate?: Date; singleDayDate?: Date;
    }) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) throw new Error("Block not found");
      const existingRules = (block.timeRules as TimeRule[]) || [];

      let updatedRules: Record<string, unknown>[];

      if (singleDayDate && existingRules.length > 0) {
        const targetDow = singleDayDate.getDay();
        const targetDateStr = format(singleDayDate, "yyyy-MM-dd");

        const matchIdx = existingRules.findIndex((r) => {
          const days = r.daysOfWeek;
          if (days && days.length > 0 && !days.includes(targetDow)) return false;
          if (r.startDate && singleDayDate < startOfDay(parseISO(r.startDate))) return false;
          if (r.endDate && singleDayDate > endOfDay(parseISO(r.endDate))) return false;
          return true;
        });

        if (matchIdx === -1) {
          updatedRules = [...existingRules, {
            startDate: targetDateStr, endDate: targetDateStr,
            startTime: newStartTime, endTime: newEndTime,
          }];
        } else {
          const matchedRule = existingRules[matchIdx];
          updatedRules = [];

          for (let i = 0; i < existingRules.length; i++) {
            if (i !== matchIdx) {
              updatedRules.push(existingRules[i]);
              continue;
            }

            const days = matchedRule.daysOfWeek;
            if (days && days.length > 0) {
              const remaining = days.filter((d: number) => d !== targetDow);
              if (remaining.length > 0) {
                updatedRules.push({ ...matchedRule, daysOfWeek: remaining });
              }
            } else if (matchedRule.startDate && matchedRule.endDate) {
              const dayBefore = format(addDays(singleDayDate, -1), "yyyy-MM-dd");
              const dayAfter = format(addDays(singleDayDate, 1), "yyyy-MM-dd");
              if (matchedRule.startDate < targetDateStr) {
                updatedRules.push({ ...matchedRule, endDate: dayBefore });
              }
              if (matchedRule.endDate > targetDateStr) {
                updatedRules.push({ ...matchedRule, startDate: dayAfter });
              }
            } else {
              updatedRules.push(matchedRule);
            }

            updatedRules.push({
              ...matchedRule,
              startDate: targetDateStr,
              endDate: targetDateStr,
              daysOfWeek: undefined,
              startTime: newStartTime,
              endTime: newEndTime,
            });
          }
        }
      } else if (existingRules.length > 0) {
        updatedRules = existingRules.map((rule) => ({
          ...rule, startTime: newStartTime, endTime: newEndTime,
        }));
      } else {
        updatedRules = [{ startTime: newStartTime, endTime: newEndTime, ...(newDate ? { startDate: format(newDate, "yyyy-MM-dd"), endDate: format(newDate, "yyyy-MM-dd") } : {}) }];
      }

      await apiRequest("PATCH", `/api/schedule-blocks/${blockId}`, { timeRules: updatedRules });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", selectedVersionId, "blocks"] });
    },
    onError: () => {
      toast({ title: "Failed to update block time", variant: "destructive" });
    },
  });

  const resolveColumnDate = useCallback((clientX: number): Date | null => {
    const entries = Array.from(columnRefsMap.current.entries());
    if (entries.length === 0) return null;

    const sorted = entries
      .map(([key, el]) => ({ key, rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.left - b.rect.left);

    for (let i = 0; i < sorted.length; i++) {
      const { rect } = sorted[i];
      if (clientX >= rect.left && clientX < rect.right) {
        const dayIndex = weekDays.findIndex((d) => d.toISOString() === sorted[i].key);
        return weekDays[dayIndex] || weekDays[0];
      }
    }

    if (clientX < sorted[0].rect.left) return weekDays[0];
    return weekDays[weekDays.length - 1];
  }, [weekDays]);

  const handleDragInit = useCallback((
    blockId: string, mode: DragMode, e: React.PointerEvent,
    origStartMin: number, origEndMin: number, origDate: Date, color: string, blockName: string
  ) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setTimelineDrag({
      blockId, mode,
      startX: e.clientX, startY: e.clientY,
      origStartMin, origEndMin, origDate,
      currentStartMin: origStartMin, currentEndMin: origEndMin,
      currentDate: origDate, dayOffset: 0,
      hasMoved: false, color, blockName,
      shiftKey: e.shiftKey,
    });
  }, []);

  const resolveColumnDateRef = useRef(resolveColumnDate);
  resolveColumnDateRef.current = resolveColumnDate;
  const weekDaysRef = useRef(weekDays);
  weekDaysRef.current = weekDays;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const blockTimeMutationRef = useRef(blockTimeMutation);
  blockTimeMutationRef.current = blockTimeMutation;

  useEffect(() => {
    if (!timelineDrag) return;

    const handleMove = (e: PointerEvent) => {
      setTimelineDrag((prev) => {
        if (!prev) return prev;
        const deltaY = e.clientY - prev.startY;
        const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;
        const hasMoved = prev.hasMoved || Math.abs(deltaY) > DRAG_THRESHOLD || Math.abs(e.clientX - prev.startX) > DRAG_THRESHOLD;

        let newStartMin = prev.currentStartMin;
        let newEndMin = prev.currentEndMin;
        let newDate = prev.currentDate;
        let newDayOffset = prev.dayOffset;
        const shiftKey = e.shiftKey;

        if (prev.mode === "move") {
          const snappedStart = snapToGrid(prev.origStartMin + deltaMinutes);
          const duration = prev.origEndMin - prev.origStartMin;
          newStartMin = Math.max(0, Math.min(snappedStart, 23 * 60 + 45 - duration));
          newEndMin = newStartMin + duration;

          const targetDate = resolveColumnDateRef.current(e.clientX);
          if (targetDate) {
            newDate = targetDate;
            const wd = weekDaysRef.current;
            const origDayIndex = wd.findIndex((d) => isSameDay(d, prev.origDate));
            const currentDayIndex = wd.findIndex((d) => isSameDay(d, targetDate));
            newDayOffset = currentDayIndex - origDayIndex;
          }
        } else if (prev.mode === "resize-top") {
          const snappedStart = snapToGrid(prev.origStartMin + deltaMinutes);
          newStartMin = Math.max(0, Math.min(snappedStart, prev.currentEndMin - SNAP_MINUTES));
          newEndMin = prev.currentEndMin;
        } else if (prev.mode === "resize-bottom") {
          const snappedEnd = snapToGrid(prev.origEndMin + deltaMinutes);
          newStartMin = prev.currentStartMin;
          newEndMin = Math.min(23 * 60 + 45, Math.max(snappedEnd, prev.currentStartMin + SNAP_MINUTES));
        }

        return {
          ...prev,
          currentStartMin: newStartMin, currentEndMin: newEndMin,
          currentDate: newDate, dayOffset: newDayOffset,
          hasMoved, shiftKey,
        };
      });
    };

    const handleUp = (e: PointerEvent) => {
      setTimelineDrag((prev) => {
        if (!prev) return null;
        if (prev.hasMoved) {
          const newStart = minutesToTimeStr(prev.currentStartMin);
          const newEnd = minutesToTimeStr(prev.currentEndMin);
          const dateChanged = !isSameDay(prev.currentDate, prev.origDate);
          const isResize = prev.mode === "resize-top" || prev.mode === "resize-bottom";
          const shiftHeld = e.shiftKey;
          const singleDayOnly = isResize && !shiftHeld;
          setTimeout(() => {
            blockTimeMutationRef.current.mutate({
              blockId: prev.blockId,
              newStartTime: newStart,
              newEndTime: newEnd,
              newDate: dateChanged ? prev.currentDate : undefined,
              singleDayDate: singleDayOnly ? prev.origDate : undefined,
            });
          }, 0);
        } else {
          const block = blocksRef.current.find((b) => b.id === prev.blockId);
          if (block) {
            setTimeout(() => handleBlockClick(block), 0);
          }
        }
        return null;
      });
    };

    const handleCancel = () => {
      setTimelineDrag(null);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleCancel);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleCancel);
    };
  }, [timelineDrag !== null]);

  const handleEditorClose = (open: boolean) => {
    setEditorOpen(open);
    if (!open) {
      setDroppedItem(null);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-schedule-title">Schedule Timeline</h1>
          <p className="text-muted-foreground">Visual calendar for managing schedule blocks</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedVersionId || "none"} onValueChange={(v) => setSelectedVersionId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-[250px]" data-testid="select-programme-version">
              <SelectValue placeholder="Select programme version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a programme</SelectItem>
              {activeVersions.map((version) => {
                const programme = programmes.find((p) => p.id === version.programmeId);
                return (
                  <SelectItem key={version.id} value={version.id}>
                    {programme?.name || "Unknown"} (v{version.versionNumber}) - {version.status || "draft"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          
          <Button onClick={() => handleSlotClick(new Date(), 9)} disabled={!selectedVersionId} data-testid="button-add-block">
            <Plus className="h-4 w-4 mr-2" />
            Add Block
          </Button>
        </div>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={handlePrevious} data-testid="button-prev">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleNext} data-testid="button-next">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={handleToday} data-testid="button-today">
                    Today
                  </Button>
                  
                  <h2 className="text-lg font-semibold ml-4">
                    {viewMode === "week"
                      ? `${format(weekStart, "MMM d")} - ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
                      : format(currentDate, "EEEE, MMMM d, yyyy")}
                  </h2>
                </div>
                
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={viewMode === "day" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("day")}
                    data-testid="button-view-day"
                  >
                    Day
                  </Button>
                  <Button
                    variant={viewMode === "week" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("week")}
                    data-testid="button-view-week"
                  >
                    Week
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isSelectedDraft && (
                <div className="flex items-center gap-2 m-3 p-2 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-xs" data-testid="warning-draft-schedule">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Editing a draft version. Changes won't appear on screens until you publish this programme.</span>
                </div>
              )}
              {!selectedVersionId ? (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  <div className="text-center">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select a programme version to view schedule</p>
                  </div>
                </div>
              ) : blocksLoading ? (
                <div className="p-8">
                  <Skeleton className="h-[400px] w-full" />
                </div>
              ) : (
                <div className="h-[600px] overflow-auto relative">
                  <div className="flex" style={{ minWidth: `${64 + weekDays.length * 140}px` }}>
                    <TimeGutter />
                    {weekDays.map((date) => (
                      <DayColumn
                        key={date.toISOString()}
                        date={date}
                        blocks={blocks as ScheduleBlockWithMeta[]}
                        conflicts={conflicts}
                        onBlockClick={handleBlockClick}
                        onSlotClick={handleSlotClick}
                        onDrop={handleDrop}
                        timelineDrag={timelineDrag}
                        onDragInit={handleDragInit}
                        columnRef={(el) => {
                          if (el) columnRefsMap.current.set(date.toISOString(), el);
                          else columnRefsMap.current.delete(date.toISOString());
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          <ConflictPanel conflicts={conflicts} blocks={blocks} />
        </div>
        
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Quick Add
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Layouts</Label>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {layouts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No layouts yet</p>
                  ) : (
                    layouts.map((layout) => (
                      <DragItem key={layout.id} item={layout} type="layout" />
                    ))
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Playlists</Label>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {playlists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No playlists yet</p>
                  ) : (
                    playlists.map((playlist) => (
                      <DragItem key={playlist.id} item={playlist} type="playlist" />
                    ))
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Drag items onto the timeline to create schedule blocks.</p>
            </CardContent>
          </Card>
          
          {selectedProgramme && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base font-semibold">Current Programme</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{selectedProgramme.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Version:</span>{" "}
                    <Badge variant="secondary">v{selectedVersion?.versionNumber}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Blocks:</span>{" "}
                    <span className="font-medium">{blocks.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      <ScheduleBlockEditor
        open={editorOpen}
        onOpenChange={handleEditorClose}
        block={selectedBlock}
        versionId={selectedVersionId}
        versionStatus={selectedVersion?.status}
        programmeId={selectedProgramme?.id}
        initialDate={clickedSlot?.date}
        initialHour={clickedSlot?.hour}
        droppedItem={droppedItem}
        layouts={layouts}
        screens={screens}
        screenGroups={screenGroups}
        playlists={playlists}
        media={media}
      />
    </div>
  );
}

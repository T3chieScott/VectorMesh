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
  differenceInDays,
  eachDayOfInterval,
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
  MonitorSmartphone,
  Users,
  Globe,
  ImageOff,
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
  dateKey: string;
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
  deltaMinutes: number;
  hasMoved: boolean;
  color: string;
  blockName: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  seriesId: string | null;
}

function normaliseRuleDates(rule: TimeRule): TimeRule {
  if (rule.startDate && !rule.endDate) return { ...rule, endDate: rule.startDate };
  if (rule.endDate && !rule.startDate) return { ...rule, startDate: rule.endDate };
  return rule;
}

function getRuleForDay(timeRules: TimeRule[], date: Date): TimeRule | null {
  const dayOfWeek = date.getDay();
  const rule = timeRules.length > 0 ? normaliseRuleDates(timeRules[0]) : null;
  if (!rule) return null;
  const days = rule.daysOfWeek;
  if (days && days.length > 0 && !days.includes(dayOfWeek)) return null;
  if (rule.startDate) {
    const sd = parseISO(rule.startDate);
    if (date < startOfDay(sd)) return null;
  }
  if (rule.endDate) {
    const ed = parseISO(rule.endDate);
    if (date > endOfDay(ed)) return null;
  }
  return rule;
}

function hashStringToIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface BlockSummary {
  targetType: "all" | "screen" | "group";
  targetName: string;
  layoutName: string | null;
  primaryPlaylistName: string | null;
  zoneMappings: Array<{ zoneId: string; playlistName: string }>;
  fallbackPlaylistName: string | null;
}

interface BlockIssue {
  kind: "version-draft" | "missing-target" | "no-target-screens" | "missing-layout" | "no-content";
  message: string;
}

function getBlockSummary(
  block: ScheduleBlock,
  ctx: {
    screens: Screen[];
    screenGroups: ScreenGroup[];
    layouts: LayoutTemplate[];
    playlists: Playlist[];
  }
): BlockSummary {
  const targets = (block.targets as ScheduleTarget[]) || [];
  const target = targets[0];
  let targetType: BlockSummary["targetType"] = "all";
  let targetName = "All screens on event";
  if (target) {
    if (target.type === "screen") {
      targetType = "screen";
      targetName = ctx.screens.find(s => s.id === target.id)?.name || "Unknown screen";
    } else if (target.type === "group") {
      targetType = "group";
      targetName = ctx.screenGroups.find(g => g.id === target.id)?.name || "Unknown group";
    }
  }

  const layoutName = block.layoutTemplateId
    ? (ctx.layouts.find(l => l.id === block.layoutTemplateId)?.name || "Unknown layout")
    : null;

  const zoneSources = (block.zoneSources as ZoneSource[]) || [];
  const fallback = zoneSources.find(zs => zs.zoneId === "__fallback__" && zs.type === "playlist");
  const fallbackPlaylistName = fallback?.playlistId
    ? (ctx.playlists.find(p => p.id === fallback.playlistId)?.name || "Unknown playlist")
    : null;

  const zoneMappings = zoneSources
    .filter(zs => zs.zoneId !== "__fallback__" && zs.type === "playlist" && zs.playlistId)
    .map(zs => ({
      zoneId: zs.zoneId,
      playlistName: ctx.playlists.find(p => p.id === zs.playlistId)?.name || "Unknown playlist",
    }));

  const primaryPlaylistName = fallbackPlaylistName || (zoneMappings[0]?.playlistName ?? null);

  return { targetType, targetName, layoutName, primaryPlaylistName, zoneMappings, fallbackPlaylistName };
}

function resolveBlockScreenIds(
  block: ScheduleBlock,
  ctx: { screens: Screen[]; membershipsByGroup: Map<string, string[]> }
): { ids: Set<string>; targetsAll: boolean } {
  const targets = (block.targets as ScheduleTarget[]) || [];
  if (targets.length === 0) {
    return { ids: new Set(ctx.screens.map(s => s.id)), targetsAll: true };
  }
  const ids = new Set<string>();
  for (const t of targets) {
    if (t.type === "screen") {
      if (ctx.screens.find(s => s.id === t.id)) ids.add(t.id);
    } else if (t.type === "group") {
      for (const memberId of ctx.membershipsByGroup.get(t.id) || []) {
        ids.add(memberId);
      }
    }
  }
  return { ids, targetsAll: false };
}

function blockTargetsIntersect(
  a: { ids: Set<string>; targetsAll: boolean },
  b: { ids: Set<string>; targetsAll: boolean }
): boolean {
  if (a.targetsAll || b.targetsAll) return true;
  const [small, large] = a.ids.size <= b.ids.size ? [a.ids, b.ids] : [b.ids, a.ids];
  let found = false;
  small.forEach((id) => {
    if (!found && large.has(id)) found = true;
  });
  return found;
}

function getBlockIssues(
  block: ScheduleBlock,
  summary: BlockSummary,
  ctx: {
    screens: Screen[];
    layouts: LayoutTemplate[];
    membershipsByGroup: Map<string, string[]>;
    versionStatus?: string;
    eventId?: string | null;
  }
): BlockIssue[] {
  const issues: BlockIssue[] = [];

  if (ctx.versionStatus === "draft") {
    issues.push({ kind: "version-draft", message: "Programme version is still a draft — publish to push to screens." });
  }

  if (block.layoutTemplateId && !ctx.layouts.find(l => l.id === block.layoutTemplateId)) {
    issues.push({ kind: "missing-layout", message: "The layout this block uses no longer exists." });
  }

  const hasContent = !!block.layoutTemplateId || summary.zoneMappings.length > 0 || !!summary.fallbackPlaylistName;
  if (!hasContent) {
    issues.push({ kind: "no-content", message: "No layout or playlist set on this block — nothing will play." });
  }

  // Resolve which screens this block actually targets, then check that at least
  // one of those screens currently has this event assigned.
  const targets = (block.targets as ScheduleTarget[]) || [];
  let resolvedScreenIds: string[] | null = null;
  if (targets.length === 0) {
    resolvedScreenIds = ctx.screens.map(s => s.id);
  } else {
    const ids: string[] = [];
    for (const t of targets) {
      if (t.type === "screen") {
        if (ctx.screens.find(s => s.id === t.id)) ids.push(t.id);
      } else if (t.type === "group") {
        const memberIds = ctx.membershipsByGroup.get(t.id) || [];
        ids.push(...memberIds);
      }
    }
    resolvedScreenIds = Array.from(new Set(ids));
    if (resolvedScreenIds.length === 0) {
      issues.push({ kind: "missing-target", message: "Targeted screen or group no longer exists." });
    }
  }

  if (ctx.eventId && resolvedScreenIds) {
    if (resolvedScreenIds.length === 0 && targets.length === 0) {
      issues.push({
        kind: "no-target-screens",
        message: "No screens are configured on this site yet — block won't play anywhere.",
      });
    } else if (resolvedScreenIds.length > 0) {
      const screensOnEvent = resolvedScreenIds.filter(id => {
        const s = ctx.screens.find(x => x.id === id);
        return s?.currentEventId === ctx.eventId;
      });
      if (screensOnEvent.length === 0) {
        issues.push({
          kind: "no-target-screens",
          message:
            targets.length === 0
              ? "No screens are currently assigned to this event — block won't play anywhere."
              : "Targeted screens aren't currently assigned to this event — block won't play.",
        });
      }
    }
  }

  return issues;
}

function TargetIcon({ type, className }: { type: BlockSummary["targetType"]; className?: string }) {
  if (type === "all") return <Globe className={className} />;
  if (type === "group") return <Users className={className} />;
  return <MonitorSmartphone className={className} />;
}

function EditorWarningBanner({
  versionStatus,
  targetType,
  targetId,
  eventId,
  screens,
  membershipsByGroup,
}: {
  versionStatus?: string;
  targetType: "all" | "screen" | "group";
  targetId?: string;
  eventId: string | null;
  screens: Screen[];
  membershipsByGroup: Map<string, string[]>;
}) {
  const messages: string[] = [];
  if (versionStatus === "draft") {
    messages.push("This programme version is a draft. Publish it before screens will pick up changes.");
  }

  if (eventId) {
    let resolvedScreenIds: string[] = [];
    if (targetType === "all") {
      resolvedScreenIds = screens.map(s => s.id);
    } else if (targetType === "screen" && targetId) {
      resolvedScreenIds = [targetId];
    } else if (targetType === "group" && targetId) {
      resolvedScreenIds = membershipsByGroup.get(targetId) || [];
    }

    if (targetType === "all" && resolvedScreenIds.length === 0) {
      messages.push("No screens are configured on this site yet, so this block won't play anywhere.");
    } else if (resolvedScreenIds.length > 0) {
      const onEvent = resolvedScreenIds.filter(id => {
        const s = screens.find(x => x.id === id);
        return s?.currentEventId === eventId;
      });
      if (onEvent.length === 0) {
        messages.push(
          targetType === "all"
            ? "No screens are currently assigned to this event, so this block won't play anywhere yet."
            : targetType === "group"
              ? "None of the screens in this group are currently assigned to this event."
              : "This screen isn't currently assigned to this event, so the block won't play."
        );
      }
    }
    // For non-"all" target types with no targetId picked yet, stay silent
    // until the user makes a choice.
  }

  if (messages.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1" data-testid="banner-editor-warnings">
      {messages.map((msg, idx) => (
        <div key={idx} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}

function TimeBlockRenderer({
  block,
  rule,
  date,
  color,
  hasConflict,
  isWinner,
  onClick,
  timelineDrag,
  onDragInit,
  summary,
  issues,
}: {
  block: ScheduleBlockWithMeta;
  rule: TimeRule;
  date: Date;
  color: string;
  hasConflict: boolean;
  isWinner: boolean;
  onClick: () => void;
  timelineDrag: TimelineDragState | null;
  onDragInit: (blockId: string, mode: DragMode, e: React.PointerEvent, origStartMin: number, origEndMin: number, date: Date, color: string, blockName: string, seriesId: string | null) => void;
  summary: BlockSummary;
  issues: BlockIssue[];
}) {
  if (!rule?.startTime || !rule?.endTime) return null;

  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);

  const origStartMinutes = start.hours * 60 + start.minutes;
  let origEndMinutes = end.hours * 60 + end.minutes;
  if (origEndMinutes <= origStartMinutes) {
    origEndMinutes = 24 * 60;
  }

  const isDraggingThis = timelineDrag?.blockId === block.id;
  const isSeriesSibling = !isDraggingThis &&
    timelineDrag?.shiftKey &&
    timelineDrag?.seriesId != null &&
    block.seriesId === timelineDrag.seriesId &&
    timelineDrag.hasMoved;
  const isOrigDay = isDraggingThis && isSameDay(date, timelineDrag.origDate);
  const isResizeMode = isDraggingThis && (timelineDrag.mode === "resize-top" || timelineDrag.mode === "resize-bottom");
  const isMoveMode = isDraggingThis && timelineDrag.mode === "move";
  const shouldAnimateThis = (isDraggingThis && (
    isOrigDay ||
    (isResizeMode && timelineDrag.shiftKey) ||
    (isMoveMode && timelineDrag.shiftKey)
  )) || isSeriesSibling;

  let displayStartMin = origStartMinutes;
  let displayEndMin = origEndMinutes;
  if (shouldAnimateThis) {
    if (isSeriesSibling) {
      const dragMode = timelineDrag!.mode;
      const delta = timelineDrag!.deltaMinutes;
      if (dragMode === "move") {
        const myDuration = origEndMinutes - origStartMinutes;
        displayStartMin = Math.max(0, Math.min(origStartMinutes + delta, 23 * 60 + 45 - Math.max(myDuration, SNAP_MINUTES)));
        displayEndMin = Math.min(23 * 60 + 45, displayStartMin + myDuration);
      } else if (dragMode === "resize-top") {
        displayStartMin = Math.max(0, Math.min(origStartMinutes + delta, origEndMinutes - SNAP_MINUTES));
        displayEndMin = origEndMinutes;
      } else if (dragMode === "resize-bottom") {
        displayStartMin = origStartMinutes;
        displayEndMin = Math.min(23 * 60 + 45, Math.max(origEndMinutes + delta, origStartMinutes + SNAP_MINUTES));
      }
    } else if (isOrigDay) {
      displayStartMin = timelineDrag!.currentStartMin;
      displayEndMin = timelineDrag!.currentEndMin;
    } else if (isMoveMode) {
      const delta = timelineDrag!.deltaMinutes;
      const myDuration = origEndMinutes - origStartMinutes;
      displayStartMin = Math.max(0, Math.min(origStartMinutes + delta, 23 * 60 + 45 - Math.max(myDuration, SNAP_MINUTES)));
      displayEndMin = Math.min(23 * 60 + 45, displayStartMin + myDuration);
    } else if (timelineDrag!.mode === "resize-top") {
      const delta = timelineDrag!.deltaMinutes;
      displayStartMin = Math.max(0, Math.min(origStartMinutes + delta, origEndMinutes - SNAP_MINUTES));
      displayEndMin = origEndMinutes;
    } else if (timelineDrag!.mode === "resize-bottom") {
      const delta = timelineDrag!.deltaMinutes;
      displayStartMin = origStartMinutes;
      displayEndMin = Math.min(23 * 60 + 45, Math.max(origEndMinutes + delta, origStartMinutes + SNAP_MINUTES));
    }
  }
  const durationMinutes = displayEndMin - displayStartMin;

  if (durationMinutes <= 0 && !isDraggingThis) return null;

  const top = (displayStartMin / 60) * HOUR_HEIGHT;
  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20);

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDragInit(block.id, mode, e, origStartMinutes, origEndMinutes, date, color, block.name, block.seriesId);
  };

  const isCtrlDrag = isDraggingThis && timelineDrag?.ctrlKey && timelineDrag.hasMoved;
  const isDragging = (shouldAnimateThis && timelineDrag!.hasMoved) || isSeriesSibling;
  const isStaticDuringDrag = isDraggingThis && !isOrigDay && isMoveMode && timelineDrag?.hasMoved && !isDragging;
  const dayShift = isOrigDay ? (timelineDrag?.dayOffset || 0)
    : isSeriesSibling && timelineDrag?.mode === "move" ? (timelineDrag?.dayOffset || 0) : 0;
  const cursor = (isOrigDay && timelineDrag?.hasMoved)
    ? timelineDrag.mode === "move" ? "grabbing" : "ns-resize"
    : "pointer";

  const origTop = (origStartMinutes / 60) * HOUR_HEIGHT;
  const origHeight = Math.max(((origEndMinutes - origStartMinutes) / 60) * HOUR_HEIGHT, 20);

  const dragBadgeLabel = timelineDrag?.ctrlKey ? "Duplicate" : timelineDrag?.shiftKey ? "All days" : "This day";
  const dragBadgeClass = timelineDrag?.ctrlKey
    ? "bg-green-500/80 text-white"
    : timelineDrag?.shiftKey ? "bg-blue-500/80 text-white" : "bg-muted text-muted-foreground";

  const hasIssues = issues.length > 0;
  const showLayoutLine = height > 32;
  const showPlaylistLine = height > 50;
  const showTimeLine = height > 68;
  const layoutLabel = summary.layoutName || (summary.fallbackPlaylistName ? "Playlist only" : "No layout");
  const playlistLabel = summary.primaryPlaylistName
    || (summary.zoneMappings.length > 0 ? `${summary.zoneMappings.length} zone playlist${summary.zoneMappings.length > 1 ? "s" : ""}` : null);

  const blockBody = (
    <div
      className={`absolute left-1 right-1 rounded-md px-2 py-1 select-none group ${color} ${
        hasConflict && !isWinner ? "opacity-50 border-2 border-dashed border-yellow-400" : ""
      } ${hasIssues ? "ring-1 ring-amber-300/80" : ""} ${
        isDragging ? "opacity-80 ring-2 ring-white/70 z-30 shadow-lg" : isStaticDuringDrag ? "opacity-40 border-2 border-dashed border-white/60" : "hover:ring-2 hover:ring-white/50"
      }`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        cursor,
        transform: dayShift !== 0 ? `translateX(${dayShift * 100}%)` : undefined,
        transition: isDragging ? "none" : undefined,
        zIndex: isDragging ? 50 : isStaticDuringDrag ? 51 : undefined,
      }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      data-testid={`block-${block.id}-${rule.startTime}`}
    >
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 group-hover:bg-white/20 rounded-t-md"
        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize-top"); }}
        data-testid={`resize-top-${block.id}-${rule.startTime}`}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 group-hover:bg-white/20 rounded-b-md"
        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, "resize-bottom"); }}
        data-testid={`resize-bottom-${block.id}-${rule.startTime}`}
      />

      {isDragging && isOrigDay && (
        <div className="absolute -top-6 left-0 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-40 flex items-center gap-1">
          {minutesToTimeStr(displayStartMin)} – {minutesToTimeStr(displayEndMin)}
          <span className={`ml-1 px-1 rounded ${dragBadgeClass}`}>
            {dragBadgeLabel}
          </span>
        </div>
      )}

      {isCtrlDrag && isOrigDay && (
        <div className="absolute -top-0.5 -right-0.5 pointer-events-none z-40">
          <Copy className="h-3 w-3 text-white drop-shadow" />
        </div>
      )}

      <div className="flex items-center gap-1 text-white text-xs font-medium pointer-events-none">
        <TargetIcon type={summary.targetType} className="h-3 w-3 shrink-0 opacity-80" />
        <span className="truncate" data-testid={`text-block-name-${block.id}`}>{block.name}</span>
      </div>
      {showLayoutLine && (
        <div className="flex items-center gap-1 text-white/80 text-[11px] truncate pointer-events-none" data-testid={`text-block-layout-${block.id}`}>
          <Layers className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{layoutLabel}</span>
        </div>
      )}
      {showPlaylistLine && playlistLabel && (
        <div className="flex items-center gap-1 text-white/70 text-[11px] truncate pointer-events-none" data-testid={`text-block-playlist-${block.id}`}>
          <PlayCircle className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{playlistLabel}</span>
        </div>
      )}
      {showTimeLine && (
        <div className="text-white/60 text-[11px] truncate pointer-events-none">
          {minutesToTimeStr(displayStartMin)} – {minutesToTimeStr(displayEndMin)}
        </div>
      )}
      {hasConflict && (
        <div className="absolute -top-1 -right-1 pointer-events-none">
          <AlertTriangle className="h-4 w-4 text-yellow-400 drop-shadow" />
        </div>
      )}
      {!hasConflict && hasIssues && (
        <div className="absolute -top-1 -right-1 pointer-events-none" data-testid={`badge-block-issues-${block.id}`}>
          <AlertTriangle className="h-4 w-4 text-amber-300 drop-shadow" />
        </div>
      )}
      {(rule.daysOfWeek?.length || 0) > 0 && (
        <div className="absolute bottom-1 right-1 pointer-events-none">
          <Repeat className="h-3 w-3 text-white/70" />
        </div>
      )}
    </div>
  );

  return (
    <>
      {isCtrlDrag && isOrigDay && (
        <div
          className={`absolute left-1 right-1 rounded-md px-2 py-1 select-none ${color} opacity-30 border-2 border-dashed border-white/60`}
          style={{ top: `${origTop}px`, height: `${origHeight}px`, zIndex: 5 }}
          data-testid={`block-ghost-${block.id}`}
        >
          <div className="text-white text-xs font-medium truncate pointer-events-none">{block.name}</div>
        </div>
      )}
      {isDragging ? (
        blockBody
      ) : (
        <HoverCard openDelay={250} closeDelay={80}>
          <HoverCardTrigger asChild>{blockBody}</HoverCardTrigger>
          <HoverCardContent
            className="w-80 text-sm"
            side="right"
            align="start"
            data-testid={`hover-block-${block.id}`}
          >
            <div className="space-y-3">
              <div>
                <div className="font-semibold leading-tight">{block.name}</div>
                <div className="text-xs text-muted-foreground">
                  {minutesToTimeStr(origStartMinutes)} – {minutesToTimeStr(origEndMinutes)}
                  {(rule.daysOfWeek?.length || 0) > 0 && " • Repeats"}
                </div>
              </div>

              <div className="grid grid-cols-[18px_1fr] gap-x-2 gap-y-1.5 items-start">
                <TargetIcon type={summary.targetType} className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Target</div>
                  <div>{summary.targetName}</div>
                </div>

                <Layers className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Layout</div>
                  <div>{summary.layoutName || <span className="text-muted-foreground italic">No layout (playlist-only)</span>}</div>
                </div>

                <PlayCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Playlists</div>
                  {summary.fallbackPlaylistName && (
                    <div>
                      <span className="text-muted-foreground">Fallback:</span> {summary.fallbackPlaylistName}
                    </div>
                  )}
                  {summary.zoneMappings.map(zm => (
                    <div key={zm.zoneId}>
                      <span className="text-muted-foreground">Zone {zm.zoneId.slice(0, 6)}:</span> {zm.playlistName}
                    </div>
                  ))}
                  {!summary.fallbackPlaylistName && summary.zoneMappings.length === 0 && (
                    <div className="text-muted-foreground italic flex items-center gap-1">
                      <ImageOff className="h-3 w-3" /> No playlist set
                    </div>
                  )}
                </div>
              </div>

              {issues.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  {issues.map((iss, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"
                      data-testid={`hover-issue-${block.id}-${iss.kind}`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{iss.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </>
  );
}

function DayColumn({
  date,
  blocks,
  blockColorMap,
  conflicts,
  onBlockClick,
  onSlotClick,
  onDrop,
  timelineDrag,
  onDragInit,
  columnRef,
  blockSummaries,
  blockIssues,
}: {
  date: Date;
  blocks: ScheduleBlockWithMeta[];
  blockColorMap: Map<string, string>;
  conflicts: ConflictInfo[];
  onBlockClick: (block: ScheduleBlock) => void;
  onSlotClick: (date: Date, hour: number) => void;
  onDrop: (date: Date, hour: number, data: string) => void;
  timelineDrag: TimelineDragState | null;
  onDragInit: (blockId: string, mode: DragMode, e: React.PointerEvent, origStartMin: number, origEndMin: number, date: Date, color: string, blockName: string, seriesId: string | null) => void;
  columnRef?: (el: HTMLDivElement | null) => void;
  blockSummaries: Map<string, BlockSummary>;
  blockIssues: Map<string, BlockIssue[]>;
}) {
  const isToday = isSameDay(date, new Date());
  const dayOfWeek = date.getDay();

  const isDropTarget = timelineDrag && timelineDrag.hasMoved &&
    timelineDrag.mode === "move" &&
    isSameDay(timelineDrag.currentDate, date);

  const dayBlockEntries: Array<{ block: ScheduleBlockWithMeta; rule: TimeRule }> = [];
  for (const block of blocks) {
    const timeRules = (block.timeRules as TimeRule[]) || [];
    const bestRule = getRuleForDay(timeRules, date);
    if (bestRule) {
      dayBlockEntries.push({ block, rule: bestRule });
    }
  }

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

        {dayBlockEntries.map(({ block, rule }) => {
          const dayKey = format(date, "yyyy-MM-dd");
          const conflict = conflicts.find((c) => c.blockId === block.id && c.dateKey === dayKey);
          return (
            <TimeBlockRenderer
              key={block.id}
              block={block}
              rule={rule}
              date={date}
              color={blockColorMap.get(block.id) || getBlockColor(0)}
              hasConflict={!!conflict}
              isWinner={conflict?.winningBlockId === block.id}
              onClick={() => onBlockClick(block)}
              timelineDrag={timelineDrag}
              onDragInit={onDragInit}
              summary={blockSummaries.get(block.id)!}
              issues={blockIssues.get(block.id) || []}
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
  eventId,
  membershipsByGroup,
  initialDate,
  initialHour,
  droppedItem,
  layouts,
  screens,
  screenGroups,
  playlists,
  media,
  blocks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: ScheduleBlock;
  versionId: string;
  versionStatus?: string;
  programmeId?: string;
  eventId?: string | null;
  membershipsByGroup: Map<string, string[]>;
  initialDate?: Date;
  initialHour?: number;
  droppedItem?: { type: string; id: string; name: string } | null;
  layouts: LayoutTemplate[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
  playlists: Playlist[];
  media: MediaAsset[];
  blocks: ScheduleBlock[];
}) {
  const { toast } = useToast();
  const isEditing = !!block;
  
  const rawTimeRule = ((block?.timeRules as TimeRule[]) || [])[0];
  const existingTimeRule = rawTimeRule ? normaliseRuleDates(rawTimeRule) : undefined;
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
  const [applyToSeries, setApplyToSeries] = useState(false);
  
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

      if (isEditing && block) {
        const existingRule = ((block.timeRules as TimeRule[]) || [])[0] || {};
        const ruleStartDate = data.startDate ? format(data.startDate, "yyyy-MM-dd") : undefined;
        const ruleEndDate = data.endDate ? format(data.endDate, "yyyy-MM-dd") : undefined;
        const effectiveStart = ruleStartDate || ruleEndDate;
        const effectiveEnd = ruleEndDate || ruleStartDate;
        const resolvedDaysOfWeek = data.isRecurring ? data.daysOfWeek : undefined;

        const sharedPayload = {
          name: data.name,
          priority: data.priority,
          layoutTemplateId: data.layoutTemplateId || null,
          targets,
          zoneSources,
        };

        if (applyToSeries && block.seriesId) {
          const seriesBlocks = blocks.filter((b) => b.seriesId === block.seriesId);
          for (const sb of seriesBlocks) {
            const sbRule = ((sb.timeRules as TimeRule[]) || [])[0] || {};
            await apiRequest("PATCH", `/api/schedule-blocks/${sb.id}`, {
              ...sharedPayload,
              programmeVersionId: versionId,
              timeRules: [{
                ...sbRule,
                startTime: data.startTime,
                endTime: data.endTime,
                daysOfWeek: resolvedDaysOfWeek,
              }],
            });
          }
          return;
        }

        if (!data.isRecurring && data.startDate && data.endDate) {
          const days = eachDayOfInterval({ start: data.startDate, end: data.endDate });
          if (days.length > 1) {
            const existingBlockDate = existingRule.startDate;
            const seriesId = block.seriesId || crypto.randomUUID();

            const existingSeriesBlocks = block.seriesId
              ? blocks.filter((b) => b.seriesId === block.seriesId)
              : [];
            const existingDates = new Set(
              existingSeriesBlocks.map((b) => {
                const r = ((b.timeRules as TimeRule[]) || [])[0];
                return r?.startDate;
              }).filter(Boolean)
            );
            if (!block.seriesId && existingBlockDate) {
              existingDates.add(existingBlockDate);
            }

            await apiRequest("PATCH", `/api/schedule-blocks/${block.id}`, {
              ...sharedPayload,
              programmeVersionId: versionId,
              seriesId,
              timeRules: [{
                ...existingRule,
                startDate: existingBlockDate || format(days[0], "yyyy-MM-dd"),
                endDate: existingBlockDate || format(days[0], "yyyy-MM-dd"),
                startTime: data.startTime,
                endTime: data.endTime,
                daysOfWeek: resolvedDaysOfWeek,
              }],
            });

            for (const day of days) {
              const dateStr = format(day, "yyyy-MM-dd");
              if (existingDates.has(dateStr)) continue;
              await apiRequest("POST", `/api/programme-versions/${versionId}/blocks`, {
                programmeVersionId: versionId,
                name: data.name,
                priority: data.priority,
                layoutTemplateId: data.layoutTemplateId || null,
                timeRules: [{
                  startDate: dateStr,
                  endDate: dateStr,
                  startTime: data.startTime,
                  endTime: data.endTime,
                }],
                targets,
                zoneSources,
                seriesId,
              });
            }
            return;
          }
        }

        const editedRule: TimeRule = {
          ...existingRule,
          startTime: data.startTime,
          endTime: data.endTime,
          daysOfWeek: resolvedDaysOfWeek,
        };

        if (data.isRecurring) {
          editedRule.startDate = effectiveStart;
          editedRule.endDate = effectiveEnd;
        } else {
          const singleDate = effectiveStart || existingRule.startDate;
          editedRule.startDate = singleDate;
          editedRule.endDate = singleDate;
        }

        return apiRequest("PATCH", `/api/schedule-blocks/${block.id}`, {
          ...sharedPayload,
          programmeVersionId: versionId,
          timeRules: [editedRule],
        });
      }

      const ruleStartDate = data.startDate ? format(data.startDate, "yyyy-MM-dd") : undefined;
      const ruleEndDate = data.endDate ? format(data.endDate, "yyyy-MM-dd") : undefined;
      const effectiveStart = ruleStartDate || ruleEndDate;
      const effectiveEnd = ruleEndDate || ruleStartDate;

      if (data.isRecurring && data.daysOfWeek && data.daysOfWeek.length > 0) {
        return apiRequest("POST", `/api/programme-versions/${versionId}/blocks`, {
          programmeVersionId: versionId,
          name: data.name,
          priority: data.priority,
          layoutTemplateId: data.layoutTemplateId || null,
          timeRules: [{
            startDate: effectiveStart,
            endDate: effectiveEnd,
            startTime: data.startTime,
            endTime: data.endTime,
            daysOfWeek: data.daysOfWeek,
          }],
          targets,
          zoneSources,
        });
      }

      const startDate = data.startDate || new Date();
      const endDate = data.endDate || startDate;
      const days = eachDayOfInterval({ start: startDate, end: endDate });

      if (days.length === 0) {
        throw new Error("No matching days in the selected range");
      }

      const seriesId = days.length > 1 ? crypto.randomUUID() : null;

      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        await apiRequest("POST", `/api/programme-versions/${versionId}/blocks`, {
          programmeVersionId: versionId,
          name: data.name,
          priority: data.priority,
          layoutTemplateId: data.layoutTemplateId || null,
          timeRules: [{
            startDate: dateStr,
            endDate: dateStr,
            startTime: data.startTime,
            endTime: data.endTime,
          }],
          targets,
          zoneSources,
          seriesId,
        });
      }
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
    mutationFn: async (mode: "single" | "series") => {
      if (!block) return;
      if (mode === "series" && block.seriesId) {
        return apiRequest("DELETE", `/api/schedule-blocks/series/${block.seriesId}`);
      }
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

  const hasSeries = !!block?.seriesId;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Schedule Block" : "Create Schedule Block"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
            <EditorWarningBanner
              versionStatus={versionStatus}
              targetType={form.watch("targetType")}
              targetId={form.watch("targetId")}
              eventId={eventId ?? null}
              screens={screens}
              membershipsByGroup={membershipsByGroup}
            />
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
            
            {isEditing && hasSeries && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="apply-to-series"
                  checked={applyToSeries}
                  onChange={(e) => setApplyToSeries(e.target.checked)}
                  data-testid="checkbox-apply-to-series"
                />
                <Label htmlFor="apply-to-series" className="text-sm cursor-pointer">
                  Apply changes to all days in this series
                </Label>
              </div>
            )}

            <DialogFooter className="gap-2">
              {isEditing && (
                <div className="flex gap-2 mr-auto">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate("single")}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-block"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {hasSeries ? "Delete This Day" : "Delete"}
                  </Button>
                  {hasSeries && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate("series")}
                      disabled={deleteMutation.isPending}
                      data-testid="button-delete-series"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Entire Series
                    </Button>
                  )}
                </div>
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
  const screenGroupsQ = useSiteFilteredQuery<ScreenGroup[]>("/api/screen-groups");
  const { data: screenGroups = [] } = useQuery<ScreenGroup[]>(screenGroupsQ);
  const { data: playlists = [] } = useQuery<Playlist[]>(playlistsQ);
  const { data: media = [] } = useQuery<MediaAsset[]>(mediaQ);
  const screenGroupMembershipsQ = useSiteFilteredQuery<Array<{ screenId: string; groupId: string }>>("/api/screen-group-memberships");
  const { data: screenGroupMemberships = [] } = useQuery<Array<{ screenId: string; groupId: string }>>(screenGroupMembershipsQ);

  const membershipsByGroup = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of screenGroupMemberships) {
      const arr = map.get(m.groupId);
      if (arr) arr.push(m.screenId);
      else map.set(m.groupId, [m.screenId]);
    }
    return map;
  }, [screenGroupMemberships]);

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
  
  const blockSummaries = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const b of blocks) {
      map.set(b.id, getBlockSummary(b, { screens, screenGroups, layouts, playlists }));
    }
    return map;
  }, [blocks, screens, screenGroups, layouts, playlists]);

  const blockIssues = useMemo(() => {
    const map = new Map<string, BlockIssue[]>();
    const versionStatus = selectedVersion?.status ?? undefined;
    const eventId = selectedProgramme?.eventId ?? null;
    for (const b of blocks) {
      const summary = blockSummaries.get(b.id)!;
      map.set(
        b.id,
        getBlockIssues(b, summary, {
          screens,
          layouts,
          membershipsByGroup,
          versionStatus,
          eventId,
        })
      );
    }
    return map;
  }, [blocks, blockSummaries, screens, layouts, membershipsByGroup, selectedVersion?.status, selectedProgramme?.eventId]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = viewMode === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [currentDate];
  
  const blockColorMap = useMemo(() => {
    const map = new Map<string, string>();
    blocks.forEach((b) => {
      const key = b.seriesId || b.id;
      map.set(b.id, getBlockColor(hashStringToIndex(key)));
    });
    return map;
  }, [blocks]);

  const conflicts = useMemo(() => {
    const result: ConflictInfo[] = [];
    const seen = new Set<string>();
    const blocksWithRules = blocks.filter((b) => ((b.timeRules as TimeRule[]) || []).length > 0);

    const screenIdsByBlock = new Map<string, { ids: Set<string>; targetsAll: boolean }>();
    for (const b of blocksWithRules) {
      screenIdsByBlock.set(b.id, resolveBlockScreenIds(b, { screens, membershipsByGroup }));
    }

    for (const day of weekDays) {
      for (let i = 0; i < blocksWithRules.length; i++) {
        for (let j = i + 1; j < blocksWithRules.length; j++) {
          const a = blocksWithRules[i];
          const b = blocksWithRules[j];

          const aRule = getRuleForDay((a.timeRules as TimeRule[]) || [], day);
          const bRule = getRuleForDay((b.timeRules as TimeRule[]) || [], day);

          if (!aRule?.startTime || !aRule?.endTime || !bRule?.startTime || !bRule?.endTime) continue;

          const aStart = parseTime(aRule.startTime);
          const aEnd = parseTime(aRule.endTime);
          const bStart = parseTime(bRule.startTime);
          const bEnd = parseTime(bRule.endTime);

          const aStartMins = aStart.hours * 60 + aStart.minutes;
          let aEndMins = aEnd.hours * 60 + aEnd.minutes;
          if (aEndMins <= aStartMins) aEndMins = 24 * 60;
          const bStartMins = bStart.hours * 60 + bStart.minutes;
          let bEndMins = bEnd.hours * 60 + bEnd.minutes;
          if (bEndMins <= bStartMins) bEndMins = 24 * 60;

          const overlaps = aStartMins < bEndMins && bStartMins < aEndMins;
          if (!overlaps) continue;

          // Two blocks at the same time are only an actual conflict if they
          // could both try to play on the same screen. Blocks targeting
          // different screens (or different groups with no shared members)
          // happily run side by side, so don't flag them.
          const aScreens = screenIdsByBlock.get(a.id);
          const bScreens = screenIdsByBlock.get(b.id);
          if (!aScreens || !bScreens) continue;
          if (!blockTargetsIntersect(aScreens, bScreens)) continue;

          const dayKey = format(day, "yyyy-MM-dd");
          const pairKey = `${dayKey}:${[a.id, b.id].sort().join("-")}`;
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);

          const winner = (a.priority || 0) >= (b.priority || 0) ? a : b;
          const loser = winner === a ? b : a;

          result.push({
            blockId: winner.id,
            conflictsWith: [loser.id],
            winningBlockId: winner.id,
            dateKey: dayKey,
          });
          result.push({
            blockId: loser.id,
            conflictsWith: [winner.id],
            winningBlockId: winner.id,
            dateKey: dayKey,
          });
        }
      }
    }

    return result;
  }, [blocks, weekDays, screens, membershipsByGroup]);
  
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
    mutationFn: async ({ blockId, newStartTime, newEndTime, newDate }: {
      blockId: string; newStartTime: string; newEndTime: string; newDate?: Date;
    }) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) throw new Error("Block not found");
      const existingRule = ((block.timeRules as TimeRule[]) || [])[0] || {};
      const updatedRule: TimeRule = {
        ...existingRule,
        startTime: newStartTime,
        endTime: newEndTime,
      };
      if (newDate) {
        const dateStr = format(newDate, "yyyy-MM-dd");
        updatedRule.startDate = dateStr;
        updatedRule.endDate = dateStr;
      }
      await apiRequest("PATCH", `/api/schedule-blocks/${blockId}`, { timeRules: [updatedRule] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", selectedVersionId, "blocks"] });
    },
    onError: () => {
      toast({ title: "Failed to update block time", variant: "destructive" });
    },
  });

  const seriesMoveMutation = useMutation({
    mutationFn: async ({ blockId, timeDelta, dayOffset, resizeMode }: {
      blockId: string; timeDelta: number; dayOffset?: number; resizeMode?: "resize-top" | "resize-bottom";
    }) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) throw new Error("Block not found");
      const seriesId = block.seriesId;
      const seriesBlocks = seriesId
        ? blocks.filter((b) => b.seriesId === seriesId)
        : [block];

      for (const sb of seriesBlocks) {
        const rule = ((sb.timeRules as TimeRule[]) || [])[0];
        if (!rule?.startTime || !rule?.endTime) continue;
        const [sh, sm] = rule.startTime.split(":").map(Number);
        const [eh, em] = rule.endTime.split(":").map(Number);
        const ruleStartMin = sh * 60 + sm;
        const ruleEndMin = eh * 60 + em;

        let newStart: number, newEnd: number;
        if (resizeMode === "resize-top") {
          newStart = Math.max(0, Math.min(ruleStartMin + timeDelta, ruleEndMin - SNAP_MINUTES));
          newEnd = ruleEndMin;
        } else if (resizeMode === "resize-bottom") {
          newStart = ruleStartMin;
          newEnd = Math.min(23 * 60 + 45, Math.max(ruleEndMin + timeDelta, ruleStartMin + SNAP_MINUTES));
        } else {
          const duration = ruleEndMin - ruleStartMin;
          newStart = Math.max(0, Math.min(ruleStartMin + timeDelta, 23 * 60 + 45 - Math.max(duration, SNAP_MINUTES)));
          newEnd = Math.min(23 * 60 + 45, newStart + duration);
        }

        const updatedRule: TimeRule = { ...rule, startTime: minutesToTimeStr(newStart), endTime: minutesToTimeStr(newEnd) };
        if (dayOffset && dayOffset !== 0 && rule.startDate && rule.endDate) {
          const newDate = addDays(parseISO(rule.startDate), dayOffset);
          const dateStr = format(newDate, "yyyy-MM-dd");
          updatedRule.startDate = dateStr;
          updatedRule.endDate = dateStr;
        }

        await apiRequest("PATCH", `/api/schedule-blocks/${sb.id}`, {
          timeRules: [updatedRule],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", selectedVersionId, "blocks"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", selectedVersionId, "blocks"] });
      toast({ title: "Failed to update series", variant: "destructive" });
    },
  });

  const duplicateBlockMutation = useMutation({
    mutationFn: async ({ blockId, newStartTime, newEndTime, newDate }: {
      blockId: string; newStartTime: string; newEndTime: string; newDate?: Date;
    }) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) throw new Error("Block not found");
      const existingRule = ((block.timeRules as TimeRule[]) || [])[0] || {};
      const targetDate = newDate ? format(newDate, "yyyy-MM-dd") : existingRule.startDate;
      await apiRequest("POST", `/api/programme-versions/${selectedVersionId}/blocks`, {
        programmeVersionId: selectedVersionId,
        name: block.name,
        priority: block.priority ?? 0,
        layoutTemplateId: block.layoutTemplateId,
        targets: block.targets,
        zoneSources: block.zoneSources,
        timeRules: [{
          ...existingRule,
          startTime: newStartTime,
          endTime: newEndTime,
          startDate: targetDate,
          endDate: targetDate,
        }],
        seriesId: block.seriesId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions", selectedVersionId, "blocks"] });
      toast({ title: "Block duplicated" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate block", variant: "destructive" });
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
    origStartMin: number, origEndMin: number, origDate: Date, color: string, blockName: string, seriesId: string | null
  ) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setTimelineDrag({
      blockId, mode,
      startX: e.clientX, startY: e.clientY,
      origStartMin, origEndMin, origDate,
      currentStartMin: origStartMin, currentEndMin: origEndMin,
      currentDate: origDate, dayOffset: 0, deltaMinutes: 0,
      hasMoved: false, color, blockName,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
      seriesId,
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
  const seriesMoveMutationRef = useRef(seriesMoveMutation);
  seriesMoveMutationRef.current = seriesMoveMutation;
  const duplicateBlockMutationRef = useRef(duplicateBlockMutation);
  duplicateBlockMutationRef.current = duplicateBlockMutation;

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

        let newDeltaMinutes = prev.deltaMinutes;

        if (prev.mode === "move") {
          const snappedStart = snapToGrid(prev.origStartMin + deltaMinutes);
          const duration = prev.origEndMin - prev.origStartMin;
          newStartMin = Math.max(0, Math.min(snappedStart, 23 * 60 + 45 - duration));
          newEndMin = newStartMin + duration;
          newDeltaMinutes = newStartMin - prev.origStartMin;

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
          newStartMin = Math.max(0, Math.min(snappedStart, prev.origEndMin - SNAP_MINUTES));
          newEndMin = prev.origEndMin;
          newDeltaMinutes = newStartMin - prev.origStartMin;
        } else if (prev.mode === "resize-bottom") {
          const snappedEnd = snapToGrid(prev.origEndMin + deltaMinutes);
          newStartMin = prev.origStartMin;
          newEndMin = Math.min(23 * 60 + 45, Math.max(snappedEnd, prev.origStartMin + SNAP_MINUTES));
          newDeltaMinutes = newEndMin - prev.origEndMin;
        }

        return {
          ...prev,
          currentStartMin: newStartMin, currentEndMin: newEndMin,
          currentDate: newDate, dayOffset: newDayOffset,
          deltaMinutes: newDeltaMinutes,
          hasMoved, shiftKey,
          ctrlKey: e.ctrlKey || e.metaKey,
        };
      });
    };

    const handleUp = (e: PointerEvent) => {
      setTimelineDrag((prev) => {
        if (!prev) return null;
        if (prev.hasMoved) {
          const newStart = minutesToTimeStr(prev.currentStartMin);
          const newEnd = minutesToTimeStr(prev.currentEndMin);
          const shiftHeld = e.shiftKey;
          const ctrlHeld = e.ctrlKey || e.metaKey;
          const dateChanged = !isSameDay(prev.currentDate, prev.origDate);
          setTimeout(() => {
            if (ctrlHeld && prev.mode === "move") {
              duplicateBlockMutationRef.current.mutate({
                blockId: prev.blockId,
                newStartTime: newStart,
                newEndTime: newEnd,
                newDate: prev.currentDate,
              });
            } else if (shiftHeld) {
              seriesMoveMutationRef.current.mutate({
                blockId: prev.blockId,
                timeDelta: prev.deltaMinutes,
                dayOffset: prev.dayOffset,
                resizeMode: prev.mode !== "move" ? prev.mode : undefined,
              });
            } else {
              blockTimeMutationRef.current.mutate({
                blockId: prev.blockId,
                newStartTime: newStart,
                newEndTime: newEnd,
                newDate: dateChanged ? prev.currentDate : undefined,
              });
            }
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
                        blockColorMap={blockColorMap}
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
                        blockSummaries={blockSummaries}
                        blockIssues={blockIssues}
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
        versionStatus={selectedVersion?.status ?? undefined}
        programmeId={selectedProgramme?.id}
        eventId={selectedProgramme?.eventId ?? null}
        membershipsByGroup={membershipsByGroup}
        initialDate={clickedSlot?.date}
        initialHour={clickedSlot?.hour}
        droppedItem={droppedItem}
        layouts={layouts}
        screens={screens}
        screenGroups={screenGroups}
        playlists={playlists}
        media={media}
        blocks={blocks}
      />
    </div>
  );
}

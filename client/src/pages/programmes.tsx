import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
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
  Layers,
  Clock,
  Monitor,
} from "lucide-react";
import type { Programme, Event, ProgrammeVersion, ScheduleBlock, LayoutTemplate, Playlist, Screen, ScreenGroup, TimeRule, ScheduleTarget } from "@shared/schema";

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

function BlockEditorDialog({
  versionId,
  block,
  layouts,
  screens,
  screenGroups,
  open,
  onOpenChange,
}: {
  versionId: string;
  block?: ScheduleBlock;
  layouts: LayoutTemplate[];
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

      const payload = {
        name: data.name,
        priority: data.priority,
        layoutTemplateId: data.layoutTemplateId === "none" || !data.layoutTemplateId ? null : data.layoutTemplateId,
        timeRules,
        targets,
        zoneSources: [],
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
      toast({ title: isEditing ? "Block updated" : "Block added" });
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
  screens,
  screenGroups,
  onEdit,
  onDelete,
}: {
  block: ScheduleBlock;
  layout?: LayoutTemplate;
  screens: Screen[];
  screenGroups: ScreenGroup[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const timeRule = ((block.timeRules as TimeRule[]) || [])[0];
  const target = ((block.targets as ScheduleTarget[]) || [])[0];
  const targetLabel = target
    ? target.type === "screen"
      ? screens.find(s => s.id === target.id)?.name || "Unknown screen"
      : screenGroups.find(g => g.id === target.id)?.name || "Unknown group"
    : "All screens";

  return (
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
  );
}

function ScheduleBlocksSection({
  version,
  layouts,
  screens,
  screenGroups,
}: {
  version: ProgrammeVersion;
  layouts: LayoutTemplate[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
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
      toast({ title: "Block deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete block", variant: "destructive" });
    },
  });

  const layoutMap = new Map(layouts.map((l) => [l.id, l]));

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
                    screens={screens}
                    screenGroups={screenGroups}
                    onEdit={() => handleEditBlock(block)}
                    onDelete={() => deleteMutation.mutate(block.id)}
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
        </CollapsibleContent>
      </Collapsible>

      <BlockEditorDialog
        versionId={version.id}
        block={editingBlock}
        layouts={layouts}
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
  screens,
  screenGroups,
}: {
  programme: Programme;
  event?: Event;
  versions: ProgrammeVersion[];
  layouts: LayoutTemplate[];
  screens: Screen[];
  screenGroups: ScreenGroup[];
}) {
  const [editOpen, setEditOpen] = useState(false);
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

  return (
    <Card className="hover-elevate transition-all">
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
        {/* Schedule blocks for draft or published version */}
        {(draftVersion || publishedVersion) && (
          <ScheduleBlocksSection
            version={draftVersion || publishedVersion!}
            layouts={layouts}
            screens={screens}
            screenGroups={screenGroups}
          />
        )}
      </CardContent>
    </Card>
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

export default function ProgrammesPage() {
  const programmesQ = useSiteFilteredQuery<Programme[]>("/api/programmes");
  const { data: programmes = [], isLoading: programmesLoading } = useQuery({ ...programmesQ });

  const eventsQ = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [], isLoading: eventsLoading } = useQuery({ ...eventsQ });

  const { data: versions = [] } = useQuery<ProgrammeVersion[]>({
    queryKey: ["/api/programme-versions"],
  });

  const { data: layouts = [] } = useQuery<LayoutTemplate[]>({
    queryKey: ["/api/layouts"],
  });

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: screenGroups = [] } = useQuery<ScreenGroup[]>({
    queryKey: ["/api/screen-groups"],
  });

  const isLoading = programmesLoading || eventsLoading;

  const eventMap = new Map(events.map((e) => [e.id, e]));

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
        <CreateProgrammeDialog events={events} />
      </div>

      {/* Content */}
      {isLoading ? (
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programmes.map((programme) => (
            <ProgrammeCard
              key={programme.id}
              programme={programme}
              event={eventMap.get(programme.eventId)}
              versions={versions}
              layouts={layouts}
              screens={screens}
              screenGroups={screenGroups}
            />
          ))}
        </div>
      )}
    </div>
  );
}

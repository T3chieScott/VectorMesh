import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext, useSiteFilteredQuery } from "@/hooks/use-site-context";
import { AgendaDisplayWidget, AGENDA_ROLE_SIZE_DEFAULTS } from "@/components/agenda/AgendaDisplayWidget";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pencil, Plus, Trash2, ExternalLink, Copy, ClipboardPaste, CopyPlus, SlidersHorizontal, ChevronsUpDown, Folder, FolderInput, FolderPlus, MoreHorizontal, Search, X } from "lucide-react";
import {
  AGENDA_DISPLAY_MODES,
  AGENDA_DISPLAY_MODE_LABELS,
  AGENDA_DAY_FILTERS,
  AGENDA_DAY_FILTER_LABELS,
  AGENDA_LAYOUT_MODES,
  AGENDA_SPEAKER_MARKER_STYLES,
  AGENDA_DESCRIPTION_TEXT_ALIGNS,
  AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS,
  isAgendaNowNextLabelApplicable,
  AGENDA_FONT_SCALES,
  AGENDA_DENSITIES,
  AGENDA_THEMES,
  AGENDA_STATUSES,
  type AgendaItem,
   type AgendaFolder,
  type AgendaWidgetConfig,
} from "@shared/schema";
import { resolveAgendaItems, validateGlobalNowNextSequence } from "@shared/agenda-resolver";
import { FontFamilySelect } from "@/components/font-family-select";
import {
  buildAgendaSettingsClipboardPayload,
  mergeAgendaSettingsClipboardValues,
  parseAgendaSettingsClipboardPayload,
} from "@shared/agenda-settings-clipboard";
import { agendaFilterValuesSchema, createAgendaStatusFilterSchema, deriveAgendaFilterOptions } from "@shared/agenda-filter-values";

// Real-world conference signage form factors. Totem is the narrow
// 9:32 floor kiosk you see at hotel lobbies; room door is the small
// 7-inch landscape panel mounted next to a meeting-room door.
const PREVIEW_PRESETS = [
  { label: "Landscape 1080p", subtitle: "1920×1080", w: 1920, h: 1080 },
  { label: "Portrait", subtitle: "1080×1920", w: 1080, h: 1920 },
  { label: "Totem", subtitle: "1080×1920", w: 1080, h: 1920 },
  { label: "Ultrawide", subtitle: "3840×1080", w: 3840, h: 1080 },
  { label: "Room door", subtitle: "1280×720", w: 1280, h: 720 },
] as const;

// Sample data remains preview-only for new sites. Filter choices always use
// the persisted `items` query below, never this illustrative content.
function buildSampleAgendaItems(clientId: string): AgendaItem[] {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  const mk = (offsetMin: number, durationMin: number, partial: Partial<AgendaItem>): AgendaItem => {
    const startsAt = new Date(base.getTime() + offsetMin * 60_000);
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    return { id: `sample-${offsetMin}`, clientId, title: "Sample session", description: null, room: null, track: null, presenter: null, startsAt, endsAt, status: "scheduled", statusMessage: null, sortOrder: 0, externalId: null, createdAt: base, updatedAt: base, ...partial } as AgendaItem;
  };
  return [
    mk(-30, 60, { title: "Opening Keynote", room: "Main Hall", presenter: "Jane Doe", track: "Keynote", status: "in_progress", statusMessage: "Live now" }),
    mk(60, 45, { title: "Designing for Big Walls", room: "Main Hall", presenter: "A. Architect", track: "Design" }),
    mk(120, 30, { title: "Coffee & Networking", room: "Foyer", track: "Break" }),
    mk(180, 60, { title: "Real-time Signage Panel", room: "Room A", presenter: "Panel", track: "Operations" }),
    mk(240, 45, { title: "Hands-on Workshop", room: "Room B", presenter: "T. Trainer", track: "Workshop", status: "delayed", statusMessage: "Starting 10 min late" }),
    mk(300, 30, { title: "Closing Remarks", room: "Main Hall", presenter: "Jane Doe", track: "Keynote" }),
  ];
}

const configFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  displayMode: z.enum(AGENDA_DISPLAY_MODES),
  layoutMode: z.enum(AGENDA_LAYOUT_MODES),
  fontScale: z.enum(AGENDA_FONT_SCALES),
  density: z.enum(AGENDA_DENSITIES),
  theme: z.enum(AGENDA_THEMES),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex like #0ea5e9"),
  // Font key: built-in (see shared/fonts.ts) or `custom:<id>`. Empty = theme default.
  fontFamily: z.string().optional(),
  titleColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  bodyColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  displayBackgroundColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  cardBackgroundColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  sessionTitleColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  descriptionColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  presenterColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  companyColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  roomColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  trackColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  timeColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  statusColor: z.string().regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})?$/, "Must be hex like #ffffff").optional(),
  // Per-element text sizes (multipliers of the responsive base size).
  timeScale: z.coerce.number().min(0.3).max(4),
  dateScale: z.coerce.number().min(0.3).max(4),
  titleScale: z.coerce.number().min(0.3).max(4),
  bodyScale: z.coerce.number().min(0.3).max(4),
  headerDateScale: z.coerce.number().min(0.3).max(4),
  headerClockScale: z.coerce.number().min(0.3).max(4),
  eventName: z.string().optional(),
  backgroundUrl: z.string().optional(),
  roomFilter: agendaFilterValuesSchema.default([]),
  trackFilter: agendaFilterValuesSchema.default([]),
  statusFilter: createAgendaStatusFilterSchema(AGENDA_STATUSES).default([]),
  dayFilter: z.enum(AGENDA_DAY_FILTERS),
  dayFilterDate: z.string().optional(),
  timeWindowMinutes: z.string().optional(),
  refreshIntervalSeconds: z.coerce.number().int().min(5).max(3600),
  rotationIntervalSeconds: z.coerce.number().int().min(3).max(3600),
  maxItemsPerPage: z.coerce.number().int().min(1).max(50),
  showDescription: z.boolean(),
  // "full" is the string sentinel for null (no clamp); "1"–"10" for a
  // specific line count. Kept as a string because Select values are strings.
  descriptionLines: z.string(),
  // Task #382 — auto-scroll; only active when descriptionLines === "full".
  descriptionAutoScroll: z.boolean(),
  showDescriptionDivider: z.boolean(),
  descriptionTextAlign: z.enum(AGENDA_DESCRIPTION_TEXT_ALIGNS),
  showPresenter: z.boolean(),
  presenterVisibleLines: z.coerce.number().int().min(1).max(20),
  speakerMarkerStyle: z.enum(AGENDA_SPEAKER_MARKER_STYLES),
  speakerCustomMarker: z
    .string()
    .trim()
    .refine(
      (value) =>
        Array.from(value).length <=
        AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS,
      `Use ${AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS} characters or fewer`,
    ),
  showRoom: z.boolean(),
  showTrack: z.boolean(),
  showStatus: z.boolean(),
  showSessionDuration: z.boolean(),
  showSessionCount: z.boolean(),
  showSessionEndTime: z.boolean(),
  sessionDurationPrefix: z.string().max(24, "Use 24 characters or fewer"),
  showCurrentTime: z.boolean(),
  showEventName: z.boolean(),
  showDayName: z.boolean(),
  showDate: z.boolean(),
  showAgendaDayHeading: z.boolean(),
  showNowNextLabel: z.boolean(),
  singleGlobalNowNext: z.boolean(),
  overrideNowNextColor: z.boolean(),
  nowNextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex like #ffffff").or(z.literal("")),
});
type ConfigFormValues = z.infer<typeof configFormSchema>;

function defaultForm(c?: AgendaWidgetConfig): ConfigFormValues {
  return {
    name: c?.name ?? "",
    displayMode: (c?.displayMode as ConfigFormValues["displayMode"]) ?? "full",
    layoutMode: (c?.layoutMode as ConfigFormValues["layoutMode"]) ?? "auto",
    fontScale: (c?.fontScale as ConfigFormValues["fontScale"]) ?? "normal",
    density: (c?.density as ConfigFormValues["density"]) ?? "normal",
    theme: (c?.theme as ConfigFormValues["theme"]) ?? "dark",
    accentColor: c?.accentColor ?? "#0ea5e9",
    fontFamily: (c?.fontFamily as ConfigFormValues["fontFamily"]) ?? "",
    titleColor: c?.titleColor ?? "",
    bodyColor: c?.bodyColor ?? "",
    displayBackgroundColor: c?.displayBackgroundColor ?? "",
    cardBackgroundColor: c?.cardBackgroundColor ?? "",
    sessionTitleColor: c?.sessionTitleColor ?? "",
    descriptionColor: c?.descriptionColor ?? "",
    presenterColor: c?.presenterColor ?? "",
    companyColor: c?.companyColor ?? "",
    roomColor: c?.roomColor ?? "",
    trackColor: c?.trackColor ?? "",
    timeColor: c?.timeColor ?? "",
    statusColor: c?.statusColor ?? "",
    timeScale: c?.timeScale ?? AGENDA_ROLE_SIZE_DEFAULTS.time,
    dateScale: c?.dateScale ?? AGENDA_ROLE_SIZE_DEFAULTS.date,
    titleScale: c?.titleScale ?? AGENDA_ROLE_SIZE_DEFAULTS.title,
    bodyScale: c?.bodyScale ?? AGENDA_ROLE_SIZE_DEFAULTS.body,
    headerDateScale: c?.headerDateScale ?? AGENDA_ROLE_SIZE_DEFAULTS.headerDate,
    headerClockScale: c?.headerClockScale ?? AGENDA_ROLE_SIZE_DEFAULTS.headerClock,
    eventName: c?.eventName ?? "",
    backgroundUrl: c?.backgroundUrl ?? "",
    roomFilter: c?.roomFilter ?? [],
    trackFilter: c?.trackFilter ?? [],
    statusFilter: c?.statusFilter ?? [],
    dayFilter: (c?.dayFilter as ConfigFormValues["dayFilter"]) ?? "all",
    dayFilterDate: c?.dayFilterDate ?? "",
    timeWindowMinutes: c?.timeWindowMinutes ? String(c.timeWindowMinutes) : "",
    refreshIntervalSeconds: c?.refreshIntervalSeconds ?? 30,
    rotationIntervalSeconds: c?.rotationIntervalSeconds ?? 12,
    maxItemsPerPage: c?.maxItemsPerPage ?? 8,
    showDescription: c?.showDescription ?? true,
    // null from DB = Full; undefined (new form) = "2" (default two-line clamp).
    descriptionLines: c?.descriptionLines === null ? "full" : String(c?.descriptionLines ?? 2),
    // Task #382 — default false; only meaningful when descriptionLines = "full".
    descriptionAutoScroll: c?.descriptionAutoScroll ?? false,
    showDescriptionDivider: c?.showDescriptionDivider ?? false,
    descriptionTextAlign:
      (c?.descriptionTextAlign as ConfigFormValues["descriptionTextAlign"]) ??
      "left",
    showPresenter: c?.showPresenter ?? true,
    presenterVisibleLines: c?.presenterVisibleLines ?? 4,
    speakerMarkerStyle:
      (c?.speakerMarkerStyle as ConfigFormValues["speakerMarkerStyle"]) ??
      "microphone",
    speakerCustomMarker: c?.speakerCustomMarker ?? "",
    showRoom: c?.showRoom ?? true,
    showTrack: c?.showTrack ?? true,
    showStatus: c?.showStatus ?? true,
    showSessionDuration: c?.showSessionDuration ?? false,
    showSessionCount: c?.showSessionCount ?? true,
    showSessionEndTime: c?.showSessionEndTime ?? true,
    sessionDurationPrefix: c?.sessionDurationPrefix ?? "",
    showCurrentTime: c?.showCurrentTime ?? true,
    showEventName: c?.showEventName ?? true,
    showDayName: c?.showDayName ?? false,
    showDate: c?.showDate ?? false,
    showAgendaDayHeading: c?.showAgendaDayHeading ?? false,
    showNowNextLabel: c?.showNowNextLabel ?? false,
    singleGlobalNowNext: c?.singleGlobalNowNext ?? false,
    overrideNowNextColor: c?.overrideNowNextColor ?? false,
    nowNextColor: c?.nowNextColor ?? "",
  };
}

function toApiPayload(values: ConfigFormValues, clientId: string) {
  return {
    clientId,
    name: values.name,
    displayMode: values.displayMode,
    layoutMode: values.layoutMode,
    fontScale: values.fontScale,
    density: values.density,
    theme: values.theme,
    accentColor: values.accentColor,
    fontFamily: values.fontFamily ? values.fontFamily : null,
    titleColor: values.titleColor ? values.titleColor : null,
    bodyColor: values.bodyColor ? values.bodyColor : null,
    displayBackgroundColor: values.displayBackgroundColor ? values.displayBackgroundColor : null,
    cardBackgroundColor: values.cardBackgroundColor ? values.cardBackgroundColor : null,
    sessionTitleColor: values.sessionTitleColor ? values.sessionTitleColor : null,
    descriptionColor: values.descriptionColor ? values.descriptionColor : null,
    presenterColor: values.presenterColor ? values.presenterColor : null,
    companyColor: values.companyColor ? values.companyColor : null,
    roomColor: values.roomColor ? values.roomColor : null,
    trackColor: values.trackColor ? values.trackColor : null,
    timeColor: values.timeColor ? values.timeColor : null,
    statusColor: values.statusColor ? values.statusColor : null,
    timeScale: values.timeScale,
    dateScale: values.dateScale,
    titleScale: values.titleScale,
    bodyScale: values.bodyScale,
    headerDateScale: values.headerDateScale,
    headerClockScale: values.headerClockScale,
    eventName: values.eventName || null,
    backgroundUrl: values.backgroundUrl || null,
    roomFilter: values.roomFilter,
    trackFilter: values.trackFilter,
    statusFilter: values.statusFilter,
    dayFilter: values.dayFilter,
    // Only persist a date when the specific-date option is chosen.
    dayFilterDate:
      values.dayFilter === "specific_date" && values.dayFilterDate
        ? values.dayFilterDate
        : null,
    timeWindowMinutes: values.timeWindowMinutes ? Number(values.timeWindowMinutes) : null,
    refreshIntervalSeconds: values.refreshIntervalSeconds,
    rotationIntervalSeconds: values.rotationIntervalSeconds,
    maxItemsPerPage: values.maxItemsPerPage,
    showDescription: values.showDescription,
    // "full" → null (no clamp); string number → integer.
    descriptionLines: values.descriptionLines === "full" ? null : Number(values.descriptionLines),
    // Task #382 — only persist true when descriptionLines is Full; clear it
    // if the operator switches away from Full so there are no phantom flags.
    descriptionAutoScroll: values.descriptionLines === "full" ? values.descriptionAutoScroll : false,
    showDescriptionDivider: values.showDescriptionDivider,
    descriptionTextAlign: values.descriptionTextAlign,
    showPresenter: values.showPresenter,
    presenterVisibleLines: values.presenterVisibleLines,
    speakerMarkerStyle: values.speakerMarkerStyle,
    speakerCustomMarker:
      values.speakerMarkerStyle === "custom"
        ? values.speakerCustomMarker.trim() || null
        : null,
    showRoom: values.showRoom,
    showTrack: values.showTrack,
    showStatus: values.showStatus,
    showSessionDuration: values.showSessionDuration,
    showSessionCount: values.showSessionCount,
    showSessionEndTime: values.showSessionEndTime,
    sessionDurationPrefix: values.sessionDurationPrefix.trim(),
    showCurrentTime: values.showCurrentTime,
    showEventName: values.showEventName,
    showDayName: values.showDayName,
    showDate: values.showDate,
    showAgendaDayHeading: values.showAgendaDayHeading,
    showNowNextLabel: values.showNowNextLabel,
    singleGlobalNowNext: values.singleGlobalNowNext,
    overrideNowNextColor: values.overrideNowNextColor,
    nowNextColor: values.overrideNowNextColor && values.nowNextColor ? values.nowNextColor : null,
  };
}

function AgendaFilterMultiSelect({
  label,
  value,
  persistedValues,
  onChange,
  testId,
  optionTestIdPrefix,
}: {
  label: string;
  value: string[];
  persistedValues: readonly unknown[];
  onChange: (values: string[]) => void;
  testId: string;
  optionTestIdPrefix: string;
}) {
  const options = deriveAgendaFilterOptions(persistedValues, value);
  const selectedKeys = new Set(value.map((item) => item.trim().toLocaleLowerCase("en-US")));
  const toggle = (option: string) => {
    const key = option.trim().toLocaleLowerCase("en-US");
    onChange(selectedKeys.has(key)
      ? value.filter((item) => item.trim().toLocaleLowerCase("en-US") !== key)
      : [...value, option]);
  };
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-empty`}>No values available.</p>
      ) : (
        <Popover modal>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between font-normal" data-testid={testId}>
              <span className="truncate">{value.length ? `${value.length} selected` : `All ${label.toLocaleLowerCase()}`}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <div className="max-h-60 overflow-auto p-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="checkbox"
                  aria-checked={selectedKeys.has(option.trim().toLocaleLowerCase("en-US"))}
                  onClick={() => toggle(option)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  data-testid={`option-${optionTestIdPrefix}-${option}`}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary text-[11px] leading-none"
                  >
                    {selectedKeys.has(option.trim().toLocaleLowerCase("en-US")) ? "✓" : ""}
                  </span>
                  <span className="truncate">{option}</span>
                </button>
              ))}
            </div>
            {value.length > 0 && <div className="border-t p-1">
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange([])} data-testid={`button-clear-${optionTestIdPrefix}-filter`}>Clear all</Button>
            </div>}
          </PopoverContent>
        </Popover>
      )}
      <FormMessage />
    </FormItem>
  );
}

function ConfigEditor({
  open,
  onOpenChange,
  initial,
  initialFolderId,
  clientId,
  clientTimezone,
  items,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: AgendaWidgetConfig;
  initialFolderId?: string | null;
  clientId: string;
  clientTimezone: string | null;
  items: AgendaItem[];
}) {
  const { toast } = useToast();
  const [preset, setPreset] = useState(0);
  // Optional "test date" override so operators can preview the agenda
  // as if "now" were a chosen moment (event data is often loaded long
  // before/after the event runs). null = use the real current time.
  const [testNow, setTestNow] = useState<Date | null>(null);
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: defaultForm(initial),
  });
  const watched = form.watch();

  // Build a synthetic config from the live form values for the preview.
  const previewConfig = useMemo<AgendaWidgetConfig>(() => {
    const payload = toApiPayload(watched, clientId);
    return {
      id: initial?.id ?? "preview",
      createdAt: initial?.createdAt ?? new Date(),
      updatedAt: initial?.updatedAt ?? new Date(),
      ...payload,
      clientId,
      statusFilter: watched.statusFilter as AgendaWidgetConfig["statusFilter"],
    };
  }, [watched, clientId, initial]);

  const previewItems = useMemo(
    () => resolveAgendaItems({ items: items.length ? items : buildSampleAgendaItems(clientId), config: previewConfig, now: testNow ?? new Date(), tz: clientTimezone }),
    [items, clientId, previewConfig, clientTimezone, testNow],
  );
  const globalNowNextValidation = useMemo(
    () => validateGlobalNowNextSequence({
      items,
      config: previewConfig,
      now: testNow ?? new Date(),
      tz: clientTimezone,
    }),
    [items, previewConfig, clientTimezone, testNow],
  );

  const mutation = useMutation({
    mutationFn: async (values: ConfigFormValues) => {
      const payload = toApiPayload(values, clientId);
      if (initial) return apiRequest("PATCH", `/api/agenda/configs/${initial.id}`, payload);
      // Folder membership is organizational metadata, deliberately separate
      // from ConfigFormValues and the settings clipboard contract.
      return apiRequest("POST", `/api/agenda/configs`, { ...payload, folderId: initialFolderId ?? null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      onOpenChange(false);
      toast({ title: initial ? "Config updated" : "Config created" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const dims = PREVIEW_PRESETS[preset];

  // datetime-local <input> works in browser-local wall-clock; convert
  // a Date to/from its "YYYY-MM-DDTHH:mm" string form.
  const toLocalInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Public display URL carrying the chosen test date (absolute UTC ISO
  // so the server/client read the same instant regardless of tz). Only
  // available once the config has been saved (it needs a real id).
  const testUrl =
    initial?.id && testNow
      ? `${window.location.origin}/display/agenda/${initial.id}?at=${encodeURIComponent(testNow.toISOString())}`
      : "";
  const copyTestUrl = () => {
    if (!testUrl) return;
    navigator.clipboard.writeText(testUrl).then(() => toast({ title: "Test URL copied" }));
  };

  const copySettings = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable.");
      }
      const payload = buildAgendaSettingsClipboardPayload(
        watched as unknown as Record<string, unknown>,
      );
      await navigator.clipboard.writeText(JSON.stringify(payload));
      toast({ title: "Agenda settings copied" });
    } catch (e) {
      toast({
        title: "Could not copy settings",
        description: String(e instanceof Error ? e.message : e),
        variant: "destructive",
      });
    }
  };

  const pasteSettings = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard access is unavailable.");
      }
      const raw = await navigator.clipboard.readText();
      const settings = parseAgendaSettingsClipboardPayload(raw);
      // Merge only validated, allowlisted presentation settings. In
      // particular, clipboard content can never replace name or accentColor.
      form.reset(
        mergeAgendaSettingsClipboardValues(
          form.getValues() as unknown as Record<string, unknown>,
          settings,
        ) as ConfigFormValues,
      );
      toast({ title: "Agenda settings pasted" });
    } catch (e) {
      toast({
        title: "Could not paste settings",
        description: String(e instanceof Error ? e.message : e),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Widget Config" : "New Widget Config"}</DialogTitle>
          <DialogDescription>
            Choose which agenda sessions to show and how they should appear.
          </DialogDescription>
        </DialogHeader>
        <div className="grid lg:grid-cols-2 gap-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <p className="mr-auto text-xs text-muted-foreground">
                  Reuse presentation settings between Agenda Displays.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={copySettings} data-testid="button-copy-settings">
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy settings
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={pasteSettings} data-testid="button-paste-settings">
                  <ClipboardPaste className="mr-1 h-3.5 w-3.5" /> Paste settings
                </Button>
              </div>
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Display name</FormLabel><FormControl><Input {...field} data-testid="input-config-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="eventName" render={({ field }) => (
                <FormItem><FormLabel>Event title (shown in header)</FormLabel><FormControl><Input {...field} data-testid="input-config-event-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="displayMode" render={({ field }) => (
                  <FormItem><FormLabel>Mode</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-display-mode"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AGENDA_DISPLAY_MODES.map((m) => <SelectItem key={m} value={m}>{AGENDA_DISPLAY_MODE_LABELS[m]}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="layoutMode" render={({ field }) => (
                  <FormItem><FormLabel>Layout</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-layout-mode"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AGENDA_LAYOUT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              {/* "What's on" day filter. Hidden for the auto-roll
                  today/tomorrow mode, which owns its own day logic. */}
              {form.watch("displayMode") !== "today_tomorrow" && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="dayFilter" render={({ field }) => (
                    <FormItem><FormLabel>What's on</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger data-testid="select-day-filter"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{AGENDA_DAY_FILTERS.map((m) => <SelectItem key={m} value={m}>{AGENDA_DAY_FILTER_LABELS[m]}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  {form.watch("dayFilter") === "specific_date" && (
                    <FormField control={form.control} name="dayFilterDate" render={({ field }) => (
                      <FormItem><FormLabel>Date</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value ?? ""} data-testid="input-day-filter-date" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="fontScale" render={({ field }) => (
                  <FormItem><FormLabel>Font</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AGENDA_FONT_SCALES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="density" render={({ field }) => (
                  <FormItem><FormLabel>Density</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AGENDA_DENSITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="theme" render={({ field }) => (
                  <FormItem><FormLabel>Theme</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AGENDA_THEMES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="accentColor" render={({ field }) => (
                <FormItem><FormLabel>Accent colour</FormLabel><FormControl><Input type="color" {...field} className="h-9" data-testid="input-accent-color" /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Typography & colours — all optional overrides. Empty
                  font family / blank colour = "use theme default" so
                  existing configs render identically. */}
              <div className="rounded-md border px-3 py-3 space-y-3">
                <Label className="text-sm font-semibold">Typography &amp; colours</Label>
                <FormField control={form.control} name="fontFamily" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Font family</FormLabel>
                    <FormControl>
                      <FontFamilySelect
                        value={field.value}
                        onChange={field.onChange}
                        clientId={clientId}
                        defaultLabel="Theme default (Inter)"
                        data-testid="select-font-family"
                      />
                    </FormControl>
                  </FormItem>
                )} />
                {(
                  [
                    { key: "titleColor", label: "Title colour", help: "Event name + section headings" },
                    { key: "bodyColor", label: "Body text colour", help: "Fallback for session details" },
                    { key: "displayBackgroundColor", label: "Display background colour", help: "Base colour beneath the background image" },
                    { key: "cardBackgroundColor", label: "Card background colour", help: "Full Agenda and Now / Next cards" },
                    { key: "sessionTitleColor", label: "Session title colour", help: "Overrides body text colour for session titles" },
                    { key: "descriptionColor", label: "Description colour", help: "Overrides body text colour for descriptions" },
                    { key: "presenterColor", label: "Presenter colour", help: "Overrides body text colour for presenters" },
                    { key: "companyColor", label: "Company colour", help: "Overrides body text colour for companies" },
                    { key: "roomColor", label: "Room colour", help: "Overrides body text colour for rooms" },
                    { key: "trackColor", label: "Track colour", help: "Overrides body text colour for tracks" },
                    { key: "timeColor", label: "Time colour", help: "Times and the wall clock" },
                    { key: "statusColor", label: "Status text colour", help: "Live / next / delayed badges" },
                  ] as const
                ).map(({ key, label, help }) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name={key}
                    render={({ field }) => {
                      const value = (field.value ?? "") as string;
                      const isSet = value !== "";
                      return (
                        <FormItem>
                          <FormLabel className="text-xs">{label}</FormLabel>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={isSet ? value : "#888888"}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="h-9 w-9 rounded border bg-transparent cursor-pointer"
                              data-testid={`input-${key}-swatch`}
                              aria-label={`${label} swatch`}
                            />
                            <Input
                              {...field}
                              value={value}
                              placeholder="theme default"
                              className="h-9 flex-1 font-mono text-xs"
                              data-testid={`input-${key}-hex`}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => field.onChange("")}
                              disabled={!isSet}
                              data-testid={`button-clear-${key}`}
                            >
                              Clear
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{help}</p>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                ))}
              </div>

              {/* Per-element text sizes. Each control sizes one role of text
                  independently. Defaults reproduce the original look; setting
                  e.g. Day/Date to the same value as Time makes them match. */}
              <div className="rounded-md border px-3 py-3 space-y-3">
                <Label className="text-sm font-semibold">Text sizes</Label>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Adjust how big each kind of text is. Shown as a percentage of the standard size.
                </p>
                {(
                  [
                    { key: "timeScale", label: "Time", help: "Start and end times", def: AGENDA_ROLE_SIZE_DEFAULTS.time },
                    { key: "dateScale", label: "Day / Date", help: "The date shown under the time", def: AGENDA_ROLE_SIZE_DEFAULTS.date },
                    { key: "titleScale", label: "Title", help: "Session titles", def: AGENDA_ROLE_SIZE_DEFAULTS.title },
                    { key: "bodyScale", label: "Body / details", help: "Room, presenter, description, status text", def: AGENDA_ROLE_SIZE_DEFAULTS.body },
                    { key: "headerDateScale", label: "Header date", help: "The date in the top corner (e.g. 12 September 2025)", def: AGENDA_ROLE_SIZE_DEFAULTS.headerDate },
                    { key: "headerClockScale", label: "Header clock", help: "The day + time clock in the top corner (e.g. Fri 09:30)", def: AGENDA_ROLE_SIZE_DEFAULTS.headerClock },
                  ] as const
                ).map(({ key, label, help, def }) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name={key}
                    render={({ field }) => {
                      const value = typeof field.value === "number" ? field.value : def;
                      return (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-xs">{label}</FormLabel>
                            <span className="text-xs font-mono text-muted-foreground" data-testid={`text-${key}-pct`}>
                              {Math.round(value * 100)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Slider
                              min={0.3}
                              max={4}
                              step={0.05}
                              value={[value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              className="flex-1"
                              data-testid={`slider-${key}`}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => field.onChange(def)}
                              disabled={value === def}
                              data-testid={`button-reset-${key}`}
                            >
                              Reset
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{help}</p>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                ))}
              </div>

              <FormField control={form.control} name="backgroundUrl" render={({ field }) => (
                <FormItem><FormLabel>Background image URL</FormLabel><FormControl><Input placeholder="https://…" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="roomFilter" render={({ field }) => (
                <AgendaFilterMultiSelect label="Filter by rooms" value={field.value} persistedValues={items.map((item) => item.room)} onChange={field.onChange} testId="button-room-filter" optionTestIdPrefix="room" />
              )} />
              <FormField control={form.control} name="trackFilter" render={({ field }) => (
                <AgendaFilterMultiSelect label="Filter by tracks" value={field.value} persistedValues={items.map((item) => item.track)} onChange={field.onChange} testId="button-track-filter" optionTestIdPrefix="track" />
              )} />
              <FormField control={form.control} name="statusFilter" render={({ field }) => (
                <AgendaFilterMultiSelect label="Status filter" value={field.value} persistedValues={items.map((item) => item.status)} onChange={field.onChange} testId="button-status-filter" optionTestIdPrefix="status" />
              )} />
              {watched.displayMode === "now_next" && (
                <FormField control={form.control} name="singleGlobalNowNext" render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                    <div className="space-y-0.5">
                      <FormLabel className="m-0">Single Now &amp; Next across selected rooms</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Combines sessions from all selected rooms into one chronological sequence, showing only one current session and one next session.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-single-global-now-next"
                      />
                    </FormControl>
                  </FormItem>
                )} />
              )}
              {!globalNowNextValidation.valid && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  data-testid="warning-global-now-next-conflict"
                >
                  <p className="font-semibold">Overlapping sessions cannot be used with “Single Now &amp; Next across selected rooms”.</p>
                  {globalNowNextValidation.invalidTiming.length > 0 && (
                    <p className="mt-1">Some selected sessions have missing or invalid start/end times, so a reliable global sequence cannot be formed.</p>
                  )}
                  {globalNowNextValidation.conflicts.slice(0, 3).map(({ first, second }) => (
                    <p key={`${first.id}-${second.id}`} className="mt-1 text-xs">
                      {first.title} ({first.room || "No room"}, {new Date(first.startsAt).toLocaleTimeString()}–{new Date(first.endsAt).toLocaleTimeString()})
                      {" overlaps "}
                      {second.title} ({second.room || "No room"}, {new Date(second.startsAt).toLocaleTimeString()}–{new Date(second.endsAt).toLocaleTimeString()})
                    </p>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="timeWindowMinutes" render={({ field }) => (
                  <FormItem><FormLabel>Window (min)</FormLabel><FormControl><Input type="number" placeholder="∞" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="maxItemsPerPage" render={({ field }) => (
                  <FormItem><FormLabel>Items/page</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="rotationIntervalSeconds" render={({ field }) => (
                  <FormItem><FormLabel>Rotate (s)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="refreshIntervalSeconds" render={({ field }) => (
                <FormItem><FormLabel>Refresh interval (s)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
              )} />

              <div className="grid grid-cols-2 gap-2">
                {([
                  ["showEventName", "Event name"],
                  ["showCurrentTime", "Current time"],
                  ["showDayName", "Day name"],
                  ["showDate", "Date"],
                  ["showAgendaDayHeading", "Show agenda day heading"],
                  ["showRoom", "Room"],
                  ["showTrack", "Track"],
                  ["showPresenter", "Presenter"],
                  ["showSessionCount", "Session count"],
                  ["showDescription", "Description"],
                  ["showStatus", "Status"],
                  ["showSessionDuration", "Session duration"],
                ] as const).map(([k, label]) => (
                  <FormField key={k} control={form.control} name={k} render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                      <FormLabel className="m-0">{label}</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid={`switch-${k}`} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </div>
              <FormField control={form.control} name="presenterVisibleLines" render={({ field }) => (
                <FormItem>
                  <FormLabel>Visible speaker lines before scrolling</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      {...field}
                      disabled={!watched.showPresenter}
                      data-testid="input-presenter-visible-lines"
                    />
                  </FormControl>
                  {!watched.showPresenter && (
                    <p className="text-xs text-muted-foreground">Enable Presenter to apply this limit.</p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              {isAgendaNowNextLabelApplicable(
                watched.displayMode,
                watched.layoutMode,
              ) && (
                <FormField control={form.control} name="showNowNextLabel" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="space-y-0.5">
                      <FormLabel className="m-0">Show NOW/NEXT labels</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Labels the current and upcoming cards in Now / next mode.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-show-now-next-label"
                      />
                    </FormControl>
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="overrideNowNextColor" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                  <FormLabel className="m-0">Override Now/Next colour</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-override-now-next-color"
                    />
                  </FormControl>
                </FormItem>
              )} />
              {watched.overrideNowNextColor && (
                <FormField control={form.control} name="nowNextColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Now/Next colour</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        value={field.value || "#000000"}
                        onChange={field.onChange}
                        className="h-9"
                        data-testid="input-now-next-color"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      You are responsible for ensuring sufficient colour contrast.
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {watched.showPresenter && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="speakerMarkerStyle" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Speaker marker</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-speaker-marker-style">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="microphone">Microphone</SelectItem>
                          <SelectItem value="circle">Circle bullet</SelectItem>
                          <SelectItem value="square">Square bullet</SelectItem>
                          <SelectItem value="custom">Custom symbol</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  {watched.speakerMarkerStyle === "custom" && (
                    <FormField control={form.control} name="speakerCustomMarker" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom speaker symbol</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            maxLength={16}
                            placeholder="✦"
                            data-testid="input-speaker-custom-marker"
                          />
                        </FormControl>
                        <p className="text-[10px] text-muted-foreground">
                          Up to {AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS} text characters or emoji.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                </div>
              )}
              {form.watch("showDescription") && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="descriptionLines" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description lines</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-description-lines">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 line</SelectItem>
                          <SelectItem value="2">2 lines</SelectItem>
                          <SelectItem value="3">3 lines</SelectItem>
                          <SelectItem value="4">4 lines</SelectItem>
                          <SelectItem value="5">5 lines</SelectItem>
                          <SelectItem value="full">Full (no limit)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="descriptionTextAlign" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description alignment</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-description-text-align">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="left">Left aligned</SelectItem>
                          <SelectItem value="justify">Justified</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="showDescriptionDivider" render={({ field }) => (
                    <FormItem className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="space-y-0.5">
                        <FormLabel className="m-0">Description divider</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Uses the display accent colour above each description.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-show-description-divider"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              )}
              {/* Task #382 — auto-scroll, only when description is Full */}
              {form.watch("showDescription") && form.watch("descriptionLines") === "full" && (
                <FormField control={form.control} name="descriptionAutoScroll" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="space-y-0.5">
                      <FormLabel className="m-0">Auto-scroll long descriptions</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Pauses, then scrolls descriptions that are too long to fit.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-description-auto-scroll"
                      />
                    </FormControl>
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="showSessionEndTime" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                    <FormLabel className="m-0">Show session end time</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-show-session-end-time" />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sessionDurationPrefix" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration prefix</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Dur."
                        maxLength={24}
                        disabled={!form.watch("showSessionDuration")}
                        data-testid="input-session-duration-prefix"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending || !globalNowNextValidation.valid} data-testid="button-save-config">
                  {mutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Form>

          <div className="space-y-2">
            <Label>Live preview</Label>
            {/* Quick-switch buttons — one click per signage form factor,
                no dropdown to fight. */}
            <div className="flex flex-wrap gap-2" data-testid="preview-preset-buttons">
              {PREVIEW_PRESETS.map((p, i) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant={preset === i ? "default" : "outline"}
                  onClick={() => setPreset(i)}
                  data-testid={`button-preset-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="flex flex-col h-auto py-1.5 px-3 leading-tight"
                >
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[10px] opacity-70">{p.subtitle}</span>
                </Button>
              ))}
            </div>
            {/* Test date — preview (and optionally a real screen) as if
                "now" were a chosen moment. Blank = real current time. */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="test-date" className="text-xs">Test date &amp; time</Label>
                <Input
                  id="test-date"
                  type="datetime-local"
                  className="h-8 w-[220px]"
                  value={testNow ? toLocalInputValue(testNow) : ""}
                  onChange={(e) => setTestNow(e.target.value ? new Date(e.target.value) : null)}
                  data-testid="input-test-date"
                />
              </div>
              {testNow && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setTestNow(null)}
                  data-testid="button-reset-test-date"
                >
                  Reset to now
                </Button>
              )}
              {initial?.id && testNow && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => window.open(testUrl, "_blank")}
                    data-testid="button-open-test-display"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open test display
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={copyTestUrl}
                    data-testid="button-copy-test-url"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy test URL
                  </Button>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {testNow
                ? "Previewing as if now were the selected date/time."
                : "Leave blank to preview using the real current time."}
            </p>
            {/* The widget measures its own container (like the real
                /display/agenda page and the player zone widget) so fonts
                and spacing scale to this box, not to the logical device
                resolution. The aspect-ratio box below supplies the chosen
                form-factor's shape; passing the logical 1080/1920 dims here
                instead would size text for a full-size screen and overflow
                this small preview, clipping titles/details (only the times
                survived). */}
            <div className="border rounded-md overflow-hidden bg-black" style={{ aspectRatio: `${dims.w} / ${dims.h}` }}>
              <div style={{ width: "100%", height: "100%" }}>
                <AgendaDisplayWidget
                  config={previewConfig}
                  items={previewItems}
                  timezone={clientTimezone ?? undefined}
                  now={testNow ?? undefined}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {previewItems.length} item(s) match the current filters.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AgendaConfigsPage() {
  const { selectedClientId, selectedClient } = useSiteContext();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AgendaWidgetConfig | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename">("create");
  const [folderName, setFolderName] = useState("");
  const [folderBeingEdited, setFolderBeingEdited] = useState<AgendaFolder | null>(null);
  const [folderPendingDelete, setFolderPendingDelete] = useState<AgendaFolder | null>(null);

  const configsQuery = useSiteFilteredQuery<AgendaWidgetConfig[]>("/api/agenda/configs");
  const { data: configs = [], isLoading } = useQuery(configsQuery);
  const foldersQuery = useSiteFilteredQuery<AgendaFolder[]>("/api/agenda-folders");
  const { data: folders = [] } = useQuery(foldersQuery);
  const itemsQuery = useSiteFilteredQuery<AgendaItem[]>("/api/agenda");
  const { data: items = [] } = useQuery(itemsQuery);

  const selectedFolderStillExists =
    selectedFolderId === "all" ||
    selectedFolderId === "unfiled" ||
    folders.some((folder) => folder.id === selectedFolderId);
  const effectiveFolderId = selectedFolderStillExists ? selectedFolderId : "all";
  useEffect(() => {
    if (!selectedFolderStillExists) setSelectedFolderId("all");
  }, [selectedFolderStillExists, selectedClientId]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [folders],
  );
  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [configs],
  );
  const visibleConfigs = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return sortedConfigs.filter((config) => {
      const inFolder = effectiveFolderId === "all"
        || (effectiveFolderId === "unfiled" ? !config.folderId : config.folderId === effectiveFolderId);
      return inFolder && (!needle || config.name.toLocaleLowerCase().includes(needle));
    });
  }, [effectiveFolderId, search, sortedConfigs]);
  const unfiledCount = configs.filter((config) => !config.folderId).length;
  const folderCount = (folderId: string) => configs.filter((config) => config.folderId === folderId).length;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agenda/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      toast({ title: "Config deleted" });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (c: AgendaWidgetConfig) => {
      // Re-create the config from its current fields. The server's insert
      // schema omits id/createdAt/updatedAt, so spreading the row and renaming
      // is enough — the new display starts as an exact duplicate.
      const { id, createdAt, updatedAt, ...rest } = c as AgendaWidgetConfig & {
        updatedAt?: unknown;
      };
      return apiRequest("POST", "/api/agenda/configs", {
        ...rest,
        name: `${c.name} (copy)`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      toast({ title: "Display duplicated" });
    },
    onError: () => {
      toast({ title: "Could not duplicate display", variant: "destructive" });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/agenda-folders", { name, clientId: selectedClientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-folders"] });
      toast({ title: "Folder created" });
    },
    onError: () => toast({ title: "Failed to create folder", variant: "destructive" }),
  });
  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiRequest("PATCH", `/api/agenda-folders/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-folders"] });
      toast({ title: "Folder renamed" });
    },
    onError: () => toast({ title: "Failed to rename folder", variant: "destructive" }),
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agenda-folders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      toast({ title: "Folder deleted", description: "Its displays moved to Unfiled." });
      setFolderPendingDelete(null);
    },
    onError: () => toast({ title: "Failed to delete folder", variant: "destructive" }),
  });
  const moveConfigMutation = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      apiRequest("PATCH", `/api/agenda/configs/${id}`, { folderId }),
    onSuccess: (_data, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      const name = folderId ? folders.find((folder) => folder.id === folderId)?.name : null;
      toast({ title: name ? `Moved to "${name}"` : "Moved to Unfiled" });
    },
    onError: () => toast({ title: "Failed to move display", variant: "destructive" }),
  });

  const openCreateFolder = () => {
    setFolderDialogMode("create"); setFolderName(""); setFolderBeingEdited(null); setFolderDialogOpen(true);
  };
  const submitFolderDialog = () => {
    const name = folderName.trim();
    if (!name) return;
    if (folderDialogMode === "create") createFolderMutation.mutate(name);
    else if (folderBeingEdited) renameFolderMutation.mutate({ id: folderBeingEdited.id, name });
    setFolderDialogOpen(false);
  };

  const copyUrl = (id: string) => {
    const url = `${window.location.origin}/display/agenda/${id}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: "URL copied" }));
  };

  if (!selectedClientId) {
    return (
      <Card className="py-12">
        <CardContent className="flex flex-col items-center text-center">
          <SlidersHorizontal className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Select a site</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Pick a site in the sidebar to manage agenda displays.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-agenda-configs-title">Agenda Displays</h1>
          <p className="text-muted-foreground">
            Widget configs for {selectedClient?.name}. Each one gets a public display URL.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-create-config">
          <Plus className="h-4 w-4 mr-2" /> New display
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-w-0">
        <aside className="w-full lg:w-56 lg:shrink-0 space-y-1" aria-label="Agenda display folders" data-testid="agenda-folder-sidebar">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Folders</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openCreateFolder} title="New folder" aria-label="New agenda folder" data-testid="button-create-agenda-folder">
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
          <button type="button" onClick={() => setSelectedFolderId("all")} aria-pressed={effectiveFolderId === "all"} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover-elevate ${effectiveFolderId === "all" ? "bg-accent text-accent-foreground ring-1 ring-ring" : ""}`} data-testid="button-agenda-folder-all">
            <span className="flex items-center gap-2"><Folder className="h-4 w-4" />All displays</span><span className="text-xs text-muted-foreground">{configs.length}</span>
          </button>
          <button type="button" onClick={() => setSelectedFolderId("unfiled")} aria-pressed={effectiveFolderId === "unfiled"} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover-elevate ${effectiveFolderId === "unfiled" ? "bg-accent text-accent-foreground ring-1 ring-ring" : ""}`} data-testid="button-agenda-folder-unfiled">
            <span className="flex items-center gap-2"><FolderInput className="h-4 w-4" />Unfiled</span><span className="text-xs text-muted-foreground">{unfiledCount}</span>
          </button>
          {sortedFolders.map((folder) => (
            <div key={folder.id} className={`group flex items-center rounded-md pl-2 pr-1 py-1.5 text-sm hover-elevate ${effectiveFolderId === folder.id ? "bg-accent text-accent-foreground ring-1 ring-ring" : ""}`} data-testid={`agenda-folder-item-${folder.id}`}>
              <button type="button" onClick={() => setSelectedFolderId(folder.id)} aria-pressed={effectiveFolderId === folder.id} className="flex flex-1 min-w-0 items-center gap-2 text-left" data-testid={`button-agenda-folder-${folder.id}`}><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{folder.name}</span></button>
              <span className="text-xs text-muted-foreground mr-1">{folderCount(folder.id)}</span>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Actions for ${folder.name}`} data-testid={`button-agenda-folder-menu-${folder.id}`}><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setFolderDialogMode("rename"); setFolderName(folder.name); setFolderBeingEdited(folder); setFolderDialogOpen(true); }} data-testid={`button-rename-agenda-folder-${folder.id}`}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setFolderPendingDelete(folder)} data-testid={`button-delete-agenda-folder-${folder.id}`}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </aside>
        <div className="flex-1 min-w-0">
          <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search displays..." className="pl-9" aria-label="Search agenda displays" data-testid="input-agenda-display-search" /></div>
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : visibleConfigs.length === 0 ? (
        <Card className="py-12"><CardContent className="flex flex-col items-center text-center">
          <SlidersHorizontal className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">{configs.length === 0 ? "No displays configured" : search ? "No displays match your search" : effectiveFolderId === "unfiled" ? "No unfiled displays" : "This folder is empty"}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-4">{configs.length === 0 ? "Create a display config and copy its URL into a screen's browser or HTML widget." : "Try a different folder or search term, or create a new display."}</p>
          {configs.length === 0 && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />New display</Button>}
        </CardContent></Card>
      ) : (
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleConfigs.map((c) => (
            <Card key={c.id} className="hover-elevate" data-testid={`config-card-${c.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="min-w-0 flex-1 truncate text-base" title={c.name}>{c.name}</CardTitle>
                  <span
                    className="inline-block w-3 h-3 rounded-full border"
                    style={{ background: c.accentColor }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.displayMode} · {c.layoutMode} · {c.theme}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-muted-foreground space-y-1">
                  {c.roomFilter.length > 0 && <p>Rooms: {c.roomFilter.join(", ")}</p>}
                  {c.trackFilter.length > 0 && <p>Tracks: {c.trackFilter.join(", ")}</p>}
                  {c.statusFilter.length > 0 && <p>Status: {c.statusFilter.join(", ")}</p>}
                  {c.displayMode !== "today_tomorrow" && c.dayFilter && c.dayFilter !== "all" && (
                    <p data-testid={`text-day-filter-${c.id}`}>
                      What's on: {AGENDA_DAY_FILTER_LABELS[c.dayFilter as keyof typeof AGENDA_DAY_FILTER_LABELS]}
                      {c.dayFilter === "specific_date" && c.dayFilterDate ? ` (${c.dayFilterDate})` : ""}
                    </p>
                  )}
                  <p>Refresh {c.refreshIntervalSeconds}s · rotate {c.rotationIntervalSeconds}s</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" size="sm" onClick={() => copyUrl(c.id)} data-testid={`button-copy-${c.id}`}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> URL
                  </Button>
                  <Button variant="outline" size="sm" asChild data-testid={`link-open-${c.id}`}>
                    <a href={`/display/agenda/${c.id}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(c)} data-testid={`button-edit-config-${c.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => cloneMutation.mutate(c)}
                    disabled={cloneMutation.isPending}
                    title="Duplicate display"
                    data-testid={`button-clone-config-${c.id}`}
                  >
                    <CopyPlus className="h-4 w-4" />
                  </Button>
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" title="Move to folder" aria-label={`Move ${c.name} to folder`} data-testid={`button-move-config-${c.id}`}><FolderInput className="h-4 w-4" /></Button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <DropdownMenuItem onSelect={() => moveConfigMutation.mutate({ id: c.id, folderId: null })} data-testid={`button-move-config-unfiled-${c.id}`}><X className="mr-2 h-4 w-4" />Unfiled</DropdownMenuItem>
                       {sortedFolders.length > 0 && <DropdownMenuSeparator />}
                       {sortedFolders.map((folder) => <DropdownMenuItem key={folder.id} disabled={c.folderId === folder.id} onSelect={() => moveConfigMutation.mutate({ id: c.id, folderId: folder.id })} data-testid={`button-move-config-${c.id}-${folder.id}`}><Folder className="mr-2 h-4 w-4" />{folder.name}</DropdownMenuItem>)}
                     </DropdownMenuContent>
                   </DropdownMenu>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-config-${c.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </div>
      </div>

      {creating && (
        <ConfigEditor open={creating} onOpenChange={setCreating} initialFolderId={effectiveFolderId !== "all" && effectiveFolderId !== "unfiled" ? effectiveFolderId : null} clientId={selectedClientId} clientTimezone={selectedClient?.timezone ?? null} items={items} />
      )}
      {editing && (
        <ConfigEditor
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          initial={editing}
          clientId={selectedClientId}
          clientTimezone={selectedClient?.timezone ?? null}
          items={items}
        />
      )}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{folderDialogMode === "create" ? "New folder" : "Rename folder"}</DialogTitle></DialogHeader>
          <DialogDescription>{folderDialogMode === "create" ? "Create a folder to organize this site's agenda displays." : "Change the folder name. Displays in it will remain unchanged."}</DialogDescription>
          <Input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" autoFocus onKeyDown={(event) => { if (event.key === "Enter") submitFolderDialog(); }} aria-label="Folder name" data-testid="input-agenda-folder-name" />
          <DialogFooter><Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button><Button onClick={submitFolderDialog} disabled={!folderName.trim()}>{folderDialogMode === "create" ? "Create folder" : "Save changes"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!folderPendingDelete} onOpenChange={(open) => { if (!open) setFolderPendingDelete(null); }}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Delete folder?</DialogTitle></DialogHeader>
          <DialogDescription>Displays in "{folderPendingDelete?.name}" will be moved to Unfiled. The displays themselves will not be deleted.</DialogDescription>
          <DialogFooter><Button variant="outline" onClick={() => setFolderPendingDelete(null)}>Cancel</Button><Button variant="destructive" onClick={() => folderPendingDelete && deleteFolderMutation.mutate(folderPendingDelete.id)} disabled={deleteFolderMutation.isPending} data-testid="button-confirm-delete-agenda-folder">Delete folder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

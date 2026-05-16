import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext, useSiteFilteredQuery } from "@/hooks/use-site-context";
import { AgendaDisplayWidget } from "@/components/agenda/AgendaDisplayWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2, ExternalLink, Copy, SlidersHorizontal } from "lucide-react";
import {
  AGENDA_DISPLAY_MODES,
  AGENDA_LAYOUT_MODES,
  AGENDA_FONT_SCALES,
  AGENDA_DENSITIES,
  AGENDA_THEMES,
  AGENDA_STATUSES,
  type AgendaItem,
  type AgendaWidgetConfig,
} from "@shared/schema";
import { resolveAgendaItems } from "@shared/agenda-resolver";

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

// Sample data shown in the live preview when the site has no real
// agenda items yet. Lets operators see the layout before importing.
function buildSampleAgendaItems(clientId: string): AgendaItem[] {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  const mk = (offsetMin: number, durationMin: number, partial: Partial<AgendaItem>): AgendaItem => {
    const startsAt = new Date(base.getTime() + offsetMin * 60_000);
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    return {
      id: `sample-${offsetMin}`,
      clientId,
      title: "Sample session",
      description: null,
      room: null,
      track: null,
      presenter: null,
      startsAt,
      endsAt,
      status: "scheduled",
      statusMessage: null,
      sortOrder: 0,
      externalId: null,
      createdAt: base,
      updatedAt: base,
      ...partial,
    } as AgendaItem;
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
  eventName: z.string().optional(),
  backgroundUrl: z.string().optional(),
  roomFilter: z.string().optional(),
  trackFilter: z.string().optional(),
  statusFilter: z.array(z.string()).default([]),
  timeWindowMinutes: z.string().optional(),
  refreshIntervalSeconds: z.coerce.number().int().min(5).max(3600),
  rotationIntervalSeconds: z.coerce.number().int().min(3).max(3600),
  maxItemsPerPage: z.coerce.number().int().min(1).max(50),
  showDescription: z.boolean(),
  showPresenter: z.boolean(),
  showRoom: z.boolean(),
  showStatus: z.boolean(),
  showCurrentTime: z.boolean(),
  showEventName: z.boolean(),
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
    eventName: c?.eventName ?? "",
    backgroundUrl: c?.backgroundUrl ?? "",
    roomFilter: (c?.roomFilter ?? []).join(", "),
    trackFilter: (c?.trackFilter ?? []).join(", "),
    statusFilter: c?.statusFilter ?? [],
    timeWindowMinutes: c?.timeWindowMinutes ? String(c.timeWindowMinutes) : "",
    refreshIntervalSeconds: c?.refreshIntervalSeconds ?? 30,
    rotationIntervalSeconds: c?.rotationIntervalSeconds ?? 12,
    maxItemsPerPage: c?.maxItemsPerPage ?? 8,
    showDescription: c?.showDescription ?? true,
    showPresenter: c?.showPresenter ?? true,
    showRoom: c?.showRoom ?? true,
    showStatus: c?.showStatus ?? true,
    showCurrentTime: c?.showCurrentTime ?? true,
    showEventName: c?.showEventName ?? true,
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
    eventName: values.eventName || null,
    backgroundUrl: values.backgroundUrl || null,
    roomFilter: values.roomFilter ? values.roomFilter.split(",").map((s) => s.trim()).filter(Boolean) : [],
    trackFilter: values.trackFilter ? values.trackFilter.split(",").map((s) => s.trim()).filter(Boolean) : [],
    statusFilter: values.statusFilter,
    timeWindowMinutes: values.timeWindowMinutes ? Number(values.timeWindowMinutes) : null,
    refreshIntervalSeconds: values.refreshIntervalSeconds,
    rotationIntervalSeconds: values.rotationIntervalSeconds,
    maxItemsPerPage: values.maxItemsPerPage,
    showDescription: values.showDescription,
    showPresenter: values.showPresenter,
    showRoom: values.showRoom,
    showStatus: values.showStatus,
    showCurrentTime: values.showCurrentTime,
    showEventName: values.showEventName,
  };
}

function ConfigEditor({
  open,
  onOpenChange,
  initial,
  clientId,
  items,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: AgendaWidgetConfig;
  clientId: string;
  items: AgendaItem[];
}) {
  const { toast } = useToast();
  const [preset, setPreset] = useState(0);
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
      clientId,
      createdAt: initial?.createdAt ?? new Date(),
      updatedAt: initial?.updatedAt ?? new Date(),
      ...payload,
      statusFilter: watched.statusFilter as AgendaWidgetConfig["statusFilter"],
    };
  }, [watched, clientId, initial]);

  // Fall back to seeded sample items so the preview is never empty
  // while operators are still wiring up their first event.
  const effectiveItems = useMemo(
    () => (items.length === 0 ? buildSampleAgendaItems(clientId) : items),
    [items, clientId],
  );
  const usingSampleData = items.length === 0;

  const previewItems = useMemo(
    () => resolveAgendaItems({ items: effectiveItems, config: previewConfig, now: new Date() }),
    [effectiveItems, previewConfig],
  );

  const mutation = useMutation({
    mutationFn: async (values: ConfigFormValues) => {
      const payload = toApiPayload(values, clientId);
      if (initial) return apiRequest("PATCH", `/api/agenda/configs/${initial.id}`, payload);
      return apiRequest("POST", `/api/agenda/configs`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      onOpenChange(false);
      toast({ title: initial ? "Config updated" : "Config created" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const dims = PREVIEW_PRESETS[preset];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Widget Config" : "New Widget Config"}</DialogTitle>
        </DialogHeader>
        <div className="grid lg:grid-cols-2 gap-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
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
                      <SelectContent>{AGENDA_DISPLAY_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
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
              <FormField control={form.control} name="backgroundUrl" render={({ field }) => (
                <FormItem><FormLabel>Background image URL</FormLabel><FormControl><Input placeholder="https://…" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="roomFilter" render={({ field }) => (
                <FormItem><FormLabel>Filter by rooms (comma separated)</FormLabel><FormControl><Input placeholder="Main Hall, Room A" {...field} data-testid="input-room-filter" /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="trackFilter" render={({ field }) => (
                <FormItem><FormLabel>Filter by tracks</FormLabel><FormControl><Input placeholder="Keynote, Workshop" {...field} /></FormControl></FormItem>
              )} />
              <div>
                <Label>Status filter</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {AGENDA_STATUSES.map((s) => {
                    const checked = watched.statusFilter.includes(s);
                    return (
                      <label key={s} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const cur = new Set(watched.statusFilter);
                            if (e.target.checked) cur.add(s); else cur.delete(s);
                            form.setValue("statusFilter", Array.from(cur) as ConfigFormValues["statusFilter"]);
                          }}
                          data-testid={`checkbox-status-${s}`}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
              </div>
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
                {(["showEventName", "showCurrentTime", "showRoom", "showPresenter", "showDescription", "showStatus"] as const).map((k) => (
                  <FormField key={k} control={form.control} name={k} render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                      <FormLabel className="m-0 capitalize">{k.replace(/^show/, "")}</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save-config">
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
            <div className="border rounded-md overflow-hidden bg-black" style={{ aspectRatio: `${dims.w} / ${dims.h}` }}>
              <div style={{ width: "100%", height: "100%" }}>
                <AgendaDisplayWidget
                  config={previewConfig}
                  items={previewItems}
                  width={dims.w}
                  height={dims.h}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {previewItems.length} item(s) match the current filters
              {usingSampleData && " (showing sample data — add real items to see your event)"}.
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

  const configsQuery = useSiteFilteredQuery<AgendaWidgetConfig[]>("/api/agenda/configs");
  const { data: configs = [], isLoading } = useQuery(configsQuery);
  const itemsQuery = useSiteFilteredQuery<AgendaItem[]>("/api/agenda");
  const { data: items = [] } = useQuery(itemsQuery);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agenda/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/configs"] });
      toast({ title: "Config deleted" });
    },
  });

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

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : configs.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <SlidersHorizontal className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No displays configured</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Create a display config and copy its URL into a screen's browser or HTML widget.
            </p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />New display</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {configs.map((c) => (
            <Card key={c.id} className="hover-elevate" data-testid={`config-card-${c.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
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
                  <p>Refresh {c.refreshIntervalSeconds}s · rotate {c.rotationIntervalSeconds}s</p>
                </div>
                <div className="flex gap-1">
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
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-config-${c.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <ConfigEditor open={creating} onOpenChange={setCreating} clientId={selectedClientId} items={items} />
      )}
      {editing && (
        <ConfigEditor
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          initial={editing}
          clientId={selectedClientId}
          items={items}
        />
      )}
    </div>
  );
}

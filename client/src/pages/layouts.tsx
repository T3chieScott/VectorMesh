import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Layout,
  Grid3X3,
  Image,
  Type,
  Clock,
  Code,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import type { LayoutTemplate, Event, LayoutZone } from "@shared/schema";

const layoutFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  eventId: z.string().optional(),
});

type LayoutFormValues = z.infer<typeof layoutFormSchema>;

const defaultZones: LayoutZone[] = [
  { id: "main", name: "Main Content", type: "media", x: 0, y: 0, width: 100, height: 85, zIndex: 1 },
  { id: "ticker", name: "Ticker", type: "ticker", x: 0, y: 85, width: 70, height: 15, zIndex: 2 },
  { id: "clock", name: "Clock", type: "clock", x: 70, y: 85, width: 15, height: 15, zIndex: 2 },
  { id: "logo", name: "Logo", type: "logo", x: 85, y: 85, width: 15, height: 15, zIndex: 2 },
];

const zoneTypeIcons: Record<string, React.ElementType> = {
  media: Image,
  ticker: Type,
  clock: Clock,
  logo: Grid3X3,
  html: Code,
};

const zoneTypeLabels: Record<string, string> = {
  media: "Media (images/videos)",
  ticker: "Ticker (scrolling text)",
  clock: "Clock widget",
  logo: "Logo widget",
  html: "HTML widget",
};

const zoneFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["media", "ticker", "clock", "logo", "html"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  zIndex: z.number().min(0).max(100),
});

type ZoneFormValues = z.infer<typeof zoneFormSchema>;

function ZoneEditorDialog({
  layout,
  zone,
  open,
  onOpenChange,
}: {
  layout: LayoutTemplate;
  zone?: LayoutZone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!zone;

  const form = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: {
      name: "",
      type: "media",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      zIndex: 1,
    },
  });

  // Reset form when zone changes (for edit vs add mode)
  useEffect(() => {
    if (open) {
      if (zone) {
        form.reset({
          name: zone.name,
          type: zone.type,
          x: zone.x,
          y: zone.y,
          width: zone.width,
          height: zone.height,
          zIndex: zone.zIndex,
        });
      } else {
        form.reset({
          name: "",
          type: "media",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          zIndex: 1,
        });
      }
    }
  }, [open, zone, form]);

  const saveMutation = useMutation({
    mutationFn: (data: ZoneFormValues) => {
      const existingZones = (layout.zones as LayoutZone[]) || [];
      let updatedZones: LayoutZone[];

      if (isEditing) {
        updatedZones = existingZones.map((z) =>
          z.id === zone.id ? { ...data, id: zone.id } : z
        );
      } else {
        const newZone: LayoutZone = {
          ...data,
          id: `zone-${Date.now()}`,
        };
        updatedZones = [...existingZones, newZone];
      }

      return apiRequest("PATCH", `/api/layouts/${layout.id}`, {
        zones: updatedZones,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      onOpenChange(false);
      form.reset();
      toast({ title: isEditing ? "Zone updated" : "Zone added" });
    },
    onError: () => {
      toast({ title: "Failed to save zone", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Zone" : "Add Zone"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zone Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Main Content" {...field} data-testid="input-zone-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zone Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-zone-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(zoneTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
                name="x"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>X Position (%)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          max={100}
                          step={1}
                          data-testid="slider-zone-x"
                        />
                        <span className="text-sm text-muted-foreground">{field.value}%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="y"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Y Position (%)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          max={100}
                          step={1}
                          data-testid="slider-zone-y"
                        />
                        <span className="text-sm text-muted-foreground">{field.value}%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="width"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Width (%)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={1}
                          max={100}
                          step={1}
                          data-testid="slider-zone-width"
                        />
                        <span className="text-sm text-muted-foreground">{field.value}%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="height"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Height (%)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          value={[field.value]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={1}
                          max={100}
                          step={1}
                          data-testid="slider-zone-height"
                        />
                        <span className="text-sm text-muted-foreground">{field.value}%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="zIndex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Layer (z-index)</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Slider
                        value={[field.value]}
                        onValueChange={([val]) => field.onChange(val)}
                        max={10}
                        step={1}
                        data-testid="slider-zone-zindex"
                      />
                      <span className="text-sm text-muted-foreground">Layer {field.value}</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-zone">
                {saveMutation.isPending ? "Saving..." : isEditing ? "Update Zone" : "Add Zone"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ZoneListItem({
  layout,
  zone,
  onEdit,
}: {
  layout: LayoutTemplate;
  zone: LayoutZone;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const Icon = zoneTypeIcons[zone.type] || Grid3X3;

  const deleteMutation = useMutation({
    mutationFn: () => {
      const existingZones = (layout.zones as LayoutZone[]) || [];
      const updatedZones = existingZones.filter((z) => z.id !== zone.id);
      return apiRequest("PATCH", `/api/layouts/${layout.id}`, {
        zones: updatedZones,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Zone deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete zone", variant: "destructive" });
    },
  });

  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium" data-testid={`text-zone-name-${zone.id}`}>{zone.name}</p>
          <p className="text-xs text-muted-foreground">
            {zone.width}% x {zone.height}% at ({zone.x}%, {zone.y}%)
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-zone-${zone.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          data-testid={`button-delete-zone-${zone.id}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function LayoutPreview({ zones }: { zones: LayoutZone[] }) {
  return (
    <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden">
      {zones.map((zone) => {
        const Icon = zoneTypeIcons[zone.type] || Grid3X3;
        return (
          <div
            key={zone.id}
            className="absolute flex items-center justify-center border border-white/20"
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              backgroundColor: `hsl(${(zones.indexOf(zone) * 60) % 360} 70% 50% / 0.3)`,
            }}
          >
            <div className="flex flex-col items-center gap-1 text-white/80">
              <Icon className="h-4 w-4" />
              <span className="text-[10px] font-medium">{zone.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LayoutCard({ layout, events }: { layout: LayoutTemplate; events: Event[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<LayoutZone | undefined>();
  const { toast } = useToast();

  const event = events.find((e) => e.id === layout.eventId);
  const zones = (layout.zones as LayoutZone[]) || [];

  const handleEditZone = (zone: LayoutZone) => {
    setEditingZone(zone);
    setZoneDialogOpen(true);
  };

  const handleAddZone = () => {
    setEditingZone(undefined);
    setZoneDialogOpen(true);
  };

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: layout.name,
      eventId: layout.eventId || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: LayoutFormValues) =>
      apiRequest("PATCH", `/api/layouts/${layout.id}`, {
        ...data,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      setEditOpen(false);
      toast({ title: "Layout updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update layout", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/layouts/${layout.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Layout deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete layout", variant: "destructive" });
    },
  });

  return (
    <>
      <Card className="overflow-hidden transition-all">
        <div className="p-3">
          <LayoutPreview zones={zones} />
        </div>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pt-0 pb-3">
          <div>
            <CardTitle className="text-base" data-testid={`text-layout-name-${layout.id}`}>
              {layout.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{zones.length} zones</Badge>
              {event && (
                <span className="text-xs text-muted-foreground">{event.name}</span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-layout-menu-${layout.id}`}>
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
                    <DialogTitle>Edit Layout</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-edit-layout-name" />
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
                                <SelectTrigger data-testid="select-edit-layout-event">
                                  <SelectValue placeholder="Global layout" />
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
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-layout">
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

        {/* Zone Management Section */}
        <Collapsible open={zonesOpen} onOpenChange={setZonesOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between px-4 py-2 border-t rounded-none"
              data-testid={`button-toggle-zones-${layout.id}`}
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Manage Zones
              </span>
              {zonesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 space-y-3 border-t bg-muted/30">
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No zones defined. Add zones to define content areas.
                </p>
              ) : (
                <div className="space-y-2">
                  {zones.map((zone) => (
                    <ZoneListItem
                      key={zone.id}
                      layout={layout}
                      zone={zone}
                      onEdit={() => handleEditZone(zone)}
                    />
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleAddZone}
                data-testid={`button-add-zone-${layout.id}`}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Zone
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <ZoneEditorDialog
        layout={layout}
        zone={editingZone}
        open={zoneDialogOpen}
        onOpenChange={(open) => {
          setZoneDialogOpen(open);
          if (!open) setEditingZone(undefined);
        }}
      />
    </>
  );
}

function CreateLayoutDialog({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: "",
      eventId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: LayoutFormValues) =>
      apiRequest("POST", "/api/layouts", {
        ...data,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
        zones: defaultZones,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      setOpen(false);
      form.reset();
      toast({ title: "Layout created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create layout", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-layout">
          <Plus className="mr-2 h-4 w-4" />
          Add Layout
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Layout</DialogTitle>
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
                    <Input placeholder="e.g., Main Stage Layout" {...field} data-testid="input-layout-name" />
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
                      <SelectTrigger data-testid="select-layout-event">
                        <SelectValue placeholder="Global layout" />
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-layout">
                {createMutation.isPending ? "Creating..." : "Create Layout"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function LayoutsPage() {
  const { data: layouts = [], isLoading: layoutsLoading } = useQuery<LayoutTemplate[]>({
    queryKey: ["/api/layouts"],
  });

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-layouts-title">Layouts</h1>
          <p className="text-muted-foreground">
            Design zone-based templates for your screens
          </p>
        </div>
        <CreateLayoutDialog events={events} />
      </div>

      {/* Content */}
      {layoutsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <div className="p-3">
                <Skeleton className="aspect-video rounded-lg" />
              </div>
              <CardHeader className="pt-0 pb-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24 mt-1" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : layouts.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Layout className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No layouts yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create layout templates to define how content appears on your
              screens with zones for media, tickers, and widgets.
            </p>
            <CreateLayoutDialog events={events} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {layouts.map((layout) => (
            <LayoutCard key={layout.id} layout={layout} events={events} />
          ))}
        </div>
      )}
    </div>
  );
}

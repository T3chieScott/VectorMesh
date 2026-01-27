import { useState } from "react";
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
  const { toast } = useToast();

  const event = events.find((e) => e.id === layout.eventId);
  const zones = (layout.zones as LayoutZone[]) || [];

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: layout.name,
      eventId: layout.eventId || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: LayoutFormValues) =>
      apiRequest("PATCH", `/api/layouts/${layout.id}`, data),
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
    <Card className="overflow-hidden hover-elevate transition-all">
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
                              <SelectItem value="">Global</SelectItem>
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
    </Card>
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
        eventId: data.eventId || null,
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
                      <SelectItem value="">Global</SelectItem>
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

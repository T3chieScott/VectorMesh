import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
  Building2,
  Clock,
  Palette,
  X,
} from "lucide-react";
import type { Client, Event } from "@shared/schema";

const eventFormSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  isActive: z.boolean().default(true),
  colorPalette: z.array(z.object({
    name: z.string(),
    color: z.string(),
  })).optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

function ColorPaletteEditor({ 
  value = [], 
  onChange 
}: { 
  value: Array<{ name: string; color: string }>;
  onChange: (palette: Array<{ name: string; color: string }>) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");

  const addColor = () => {
    const name = newName.trim() || `Color ${value.length + 1}`;
    onChange([...value, { name, color: newColor }]);
    setNewName("");
    setNewColor("#3B82F6");
  };

  const removeColor = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateColor = (index: number, updates: Partial<{ name: string; color: string }>) => {
    onChange(value.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Palette className="h-4 w-4" />
        Brand Colour Palette
      </Label>
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="color"
                value={entry.color}
                onChange={(e) => updateColor(index, { color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                data-testid={`input-palette-color-${index}`}
              />
              <Input
                value={entry.name}
                onChange={(e) => updateColor(index, { name: e.target.value })}
                className="flex-1"
                data-testid={`input-palette-name-${index}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeColor(index)}
                data-testid={`button-remove-palette-color-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
          data-testid="input-new-palette-color"
        />
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Colour name"
          className="flex-1"
          data-testid="input-new-palette-name"
        />
        <Button type="button" variant="outline" size="sm" onClick={addColor} data-testid="button-add-palette-color">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

function EventCard({ event, client }: { event: Event; client?: Client }) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      clientId: event.clientId,
      name: event.name,
      description: event.description || "",
      startDate: new Date(event.startDate),
      endDate: new Date(event.endDate),
      isActive: event.isActive ?? true,
      colorPalette: (event.colorPalette as Array<{ name: string; color: string }>) || [],
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: EventFormValues) =>
      apiRequest("PATCH", `/api/events/${event.id}`, {
        ...data,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setEditOpen(false);
      toast({ title: "Event updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update event", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${event.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Event deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete event", variant: "destructive" });
    },
  });

  const now = new Date();
  const isUpcoming = new Date(event.startDate) > now;
  const isOngoing =
    new Date(event.startDate) <= now && new Date(event.endDate) >= now;
  const isPast = new Date(event.endDate) < now;

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base" data-testid={`text-event-name-${event.id}`}>{event.name}</CardTitle>
            {event.isActive ? (
              isOngoing ? (
                <Badge className="bg-green-500/10 text-green-600">Ongoing</Badge>
              ) : isUpcoming ? (
                <Badge variant="secondary">Upcoming</Badge>
              ) : (
                <Badge variant="outline">Past</Badge>
              )
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
          {client && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>{client.name}</span>
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-event-menu-${event.id}`}>
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
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Event</DialogTitle>
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
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-event-client">
                                <SelectValue placeholder="Select a client" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {clients.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
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
                            <Input {...field} data-testid="input-edit-event-name" />
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
                            <Textarea {...field} data-testid="input-edit-event-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start text-left font-normal"
                                    data-testid="button-edit-event-start-date"
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value
                                      ? format(field.value, "PPP")
                                      : "Pick a date"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
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
                          <FormItem>
                            <FormLabel>End Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start text-left font-normal"
                                    data-testid="button-edit-event-end-date"
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value
                                      ? format(field.value, "PPP")
                                      : "Pick a date"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
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
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <FormLabel className="text-base">Active</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Enable this event for scheduling
                            </p>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-edit-event-active"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="colorPalette"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <ColorPaletteEditor
                              value={field.value || []}
                              onChange={field.onChange}
                            />
                          </FormControl>
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
                        data-testid="button-save-event"
                      >
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
      <CardContent className="pt-0 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>
            {format(new Date(event.startDate), "MMM d, yyyy")} -{" "}
            {format(new Date(event.endDate), "MMM d, yyyy")}
          </span>
        </div>
        {(event.colorPalette as Array<{ name: string; color: string }> | null)?.length ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            {(event.colorPalette as Array<{ name: string; color: string }>).map((c, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-sm border border-border"
                style={{ backgroundColor: c.color }}
                title={c.name}
                data-testid={`palette-swatch-${event.id}-${i}`}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreateEventDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      clientId: "",
      name: "",
      description: "",
      startDate: new Date(),
      endDate: new Date(),
      isActive: true,
      colorPalette: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: EventFormValues) =>
      apiRequest("POST", "/api/events", {
        ...data,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setOpen(false);
      form.reset();
      toast({ title: "Event created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create event", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={clients.length === 0} data-testid="button-create-event">
          <Plus className="mr-2 h-4 w-4" />
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-event-client">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
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
                    <Input placeholder="Enter event name" {...field} data-testid="input-event-name" />
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
                      placeholder="Brief description of the event"
                      {...field}
                      data-testid="input-event-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                            data-testid="button-event-start-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
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
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                            data-testid="button-event-end-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
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
              name="colorPalette"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <ColorPaletteEditor
                      value={field.value || []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-event">
                {createMutation.isPending ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const isLoading = eventsLoading || clientsLoading;

  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-events-title">Events</h1>
          <p className="text-muted-foreground">
            Manage dated programmes per client
          </p>
        </div>
        <CreateEventDialog clients={clients} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No events yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {clients.length === 0
                ? "Create a client first, then add events for them."
                : "Get started by creating your first event."}
            </p>
            <CreateEventDialog clients={clients} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              client={clientMap.get(event.clientId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

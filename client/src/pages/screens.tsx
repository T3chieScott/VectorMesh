import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addMinutes, formatDistanceToNow } from "date-fns";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Monitor,
  Wifi,
  WifiOff,
  MapPin,
  RefreshCw,
  Copy,
  Zap,
  Unlink,
} from "lucide-react";
import type { Screen, DisplayProfile, LiveOverride, Event } from "@shared/schema";

const screenFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  displayProfileId: z.string().optional(),
  currentEventId: z.string().nullable().optional(),
});

type ScreenFormValues = z.infer<typeof screenFormSchema>;

function generatePairingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function ScreenCard({
  screen,
  profiles,
  events,
  activeOverride,
}: {
  screen: Screen;
  profiles: DisplayProfile[];
  events: Event[];
  activeOverride: LiveOverride | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  const profile = profiles.find((p) => p.id === screen.displayProfileId);

  const quickOverrideMutation = useMutation({
    mutationFn: (duration: number) => {
      const now = new Date();
      const endTime = addMinutes(now, duration);
      return apiRequest("POST", "/api/live-overrides", {
        name: `Quick Override: ${screen.name}`,
        priority: 100,
        targets: [{ type: "screen", id: screen.id }],
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-overrides"] });
      toast({ title: "Override activated", description: `${screen.name} is now under live override` });
    },
    onError: () => {
      toast({ title: "Failed to create override", variant: "destructive" });
    },
  });

  const stopOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!activeOverride) return;
      await apiRequest("PATCH", `/api/live-overrides/${activeOverride.id}`, { isActive: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-overrides"] });
      toast({ title: "Override stopped" });
    },
  });

  const form = useForm<ScreenFormValues>({
    resolver: zodResolver(screenFormSchema),
    defaultValues: {
      name: screen.name,
      location: screen.location || "",
      displayProfileId: screen.displayProfileId || "",
      currentEventId: screen.currentEventId || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ScreenFormValues) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, {
        ...data,
        currentEventId: data.currentEventId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      setEditOpen(false);
      toast({ title: "Screen updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update screen", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/screens/${screen.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: "Screen deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete screen", variant: "destructive" });
    },
  });

  const regeneratePairingCodeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/screens/${screen.id}/regenerate-pairing`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: "Pairing code regenerated" });
    },
  });

  const unpairMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/screens/${screen.id}/unpair`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: "Device unpaired", description: "The display will return to the pairing screen on its next refresh." });
    },
    onError: () => {
      toast({ title: "Failed to unpair device", variant: "destructive" });
    },
  });

  const copyPairingCode = () => {
    if (screen.pairingCode) {
      navigator.clipboard.writeText(screen.pairingCode);
      toast({ title: "Pairing code copied to clipboard" });
    }
  };

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              screen.isOnline
                ? "bg-green-500/10"
                : screen.isPaired
                ? "bg-red-500/10"
                : "bg-amber-500/10"
            }`}
          >
            <Monitor
              className={`h-5 w-5 ${
                screen.isOnline
                  ? "text-green-600"
                  : screen.isPaired
                  ? "text-red-600"
                  : "text-amber-600"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base" data-testid={`text-screen-name-${screen.id}`}>
                {screen.name}
              </CardTitle>
              {activeOverride && (
                <Badge className="bg-amber-500/10 text-amber-600 gap-1">
                  <Zap className="h-3 w-3" />
                  Override
                </Badge>
              )}
              {screen.isOnline ? (
                <Badge className="bg-green-500/10 text-green-600 gap-1">
                  <Wifi className="h-3 w-3" />
                  Online
                </Badge>
              ) : screen.isPaired ? (
                <Badge variant="destructive" className="gap-1">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </Badge>
              ) : (
                <Badge variant="secondary">Unpaired</Badge>
              )}
            </div>
            {screen.location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{screen.location}</span>
              </div>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-screen-menu-${screen.id}`}>
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
                  <DialogTitle>Edit Screen</DialogTitle>
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
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-screen-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-screen-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="displayProfileId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Profile</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-screen-profile">
                                <SelectValue placeholder="Select a profile" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {profiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.width}x{p.height})
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
                      name="currentEventId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Event</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                            defaultValue={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-screen-event">
                                <SelectValue placeholder="No event assigned" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No event assigned</SelectItem>
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
                        data-testid="button-save-screen"
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            {!screen.isPaired && (
              <DropdownMenuItem
                onSelect={() => regeneratePairingCodeMutation.mutate()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Code
              </DropdownMenuItem>
            )}
            {screen.isPaired && (
              <DropdownMenuItem
                onSelect={() => unpairMutation.mutate()}
                data-testid={`button-unpair-${screen.id}`}
              >
                <Unlink className="mr-2 h-4 w-4" />
                Unpair Device
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {activeOverride ? (
              <DropdownMenuItem
                className="text-amber-600"
                onSelect={() => stopOverrideMutation.mutate()}
              >
                <Zap className="mr-2 h-4 w-4" />
                Stop Override
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => quickOverrideMutation.mutate(5)}>
                  <Zap className="mr-2 h-4 w-4" />
                  Override 5 min
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quickOverrideMutation.mutate(15)}>
                  <Zap className="mr-2 h-4 w-4" />
                  Override 15 min
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => quickOverrideMutation.mutate(30)}>
                  <Zap className="mr-2 h-4 w-4" />
                  Override 30 min
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
        {profile && (
          <div className="text-sm text-muted-foreground">
            {profile.width}x{profile.height} • {profile.orientation}
          </div>
        )}
        {screen.currentEventId && (
          <div className="text-sm text-muted-foreground">
            Event: {events.find((e) => e.id === screen.currentEventId)?.name || "Unknown"}
          </div>
        )}
        {!screen.isPaired && screen.pairingCode && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Pairing Code</p>
              <p className="text-lg font-mono font-bold tracking-wider">
                {screen.pairingCode}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={copyPairingCode}
              data-testid={`button-copy-pairing-${screen.id}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
        {screen.lastSeen && (
          <p className="text-xs text-muted-foreground" title={new Date(screen.lastSeen).toLocaleString()}>
            Last seen: {formatDistanceToNow(new Date(screen.lastSeen), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CreateScreenDialog({ profiles, events }: { profiles: DisplayProfile[]; events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ScreenFormValues>({
    resolver: zodResolver(screenFormSchema),
    defaultValues: {
      name: "",
      location: "",
      displayProfileId: "",
      currentEventId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ScreenFormValues) =>
      apiRequest("POST", "/api/screens", {
        ...data,
        currentEventId: data.currentEventId || null,
        pairingCode: generatePairingCode(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      setOpen(false);
      form.reset();
      toast({ title: "Screen created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create screen", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-screen">
          <Plus className="mr-2 h-4 w-4" />
          Add Screen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Screen</DialogTitle>
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
                    <Input
                      placeholder="e.g., Conference Room A Display"
                      {...field}
                      data-testid="input-screen-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Building A, Floor 2"
                      {...field}
                      data-testid="input-screen-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayProfileId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Profile (optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-screen-profile">
                        <SelectValue placeholder="Select a profile" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.width}x{p.height})
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
              name="currentEventId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Event (optional)</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                    defaultValue={field.value || "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-screen-event">
                        <SelectValue placeholder="No event assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">No event assigned</SelectItem>
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
                data-testid="button-submit-screen"
              >
                {createMutation.isPending ? "Creating..." : "Create Screen"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ScreensPage() {
  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
    refetchInterval: 10000,
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<
    DisplayProfile[]
  >({
    queryKey: ["/api/display-profiles"],
  });

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: liveOverrides = [] } = useQuery<LiveOverride[]>({
    queryKey: ["/api/live-overrides"],
    refetchInterval: 10000,
  });

  const getActiveOverrideForScreen = (screenId: string): LiveOverride | null => {
    const now = new Date();
    return liveOverrides.find(o => {
      if (!o.isActive || new Date(o.endTime) <= now) return false;
      const targets = o.targets as any[] | undefined;
      if (!targets || targets.length === 0) return false;
      return targets.some(t => 
        t.type === "screen" && t.id === screenId
      );
    }) || null;
  };

  const isLoading = screensLoading || profilesLoading;

  const onlineCount = screens.filter((s) => s.isOnline).length;
  const offlineCount = screens.filter((s) => !s.isOnline && s.isPaired).length;
  const unpairedCount = screens.filter((s) => !s.isPaired).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-screens-title">Screens</h1>
          <p className="text-muted-foreground">
            Manage display screens and their configurations
          </p>
        </div>
        <CreateScreenDialog profiles={profiles} events={events} />
      </div>

      {/* Stats */}
      {!isLoading && screens.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 py-1.5 px-3">
            {onlineCount} Online
          </Badge>
          <Badge variant="secondary" className="bg-red-500/10 text-red-600 py-1.5 px-3">
            {offlineCount} Offline
          </Badge>
          <Badge variant="secondary" className="py-1.5 px-3">
            {unpairedCount} Unpaired
          </Badge>
        </div>
      )}

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
                <Skeleton className="h-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : screens.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Monitor className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No screens yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Get started by adding your first screen. You'll receive a pairing
              code to connect the physical display.
            </p>
            <CreateScreenDialog profiles={profiles} events={events} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map((screen) => (
            <ScreenCard 
              key={screen.id} 
              screen={screen} 
              profiles={profiles}
              events={events}
              activeOverride={getActiveOverrideForScreen(screen.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

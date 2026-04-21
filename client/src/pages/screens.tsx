import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addMinutes, formatDistanceToNow } from "date-fns";
import { PresetManager } from "@/components/preset-manager";
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
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Grid3X3,
  Lock,
  Unlock,
  Camera,
  LayoutGrid,
  TestTube,
  AlertTriangle,
} from "lucide-react";
import { useSiteContext } from "@/hooks/use-site-context";
import { useAuth } from "@/hooks/use-auth";
import type { Screen, DisplayProfile, LiveOverride, Event, LayoutTemplate, Client, Playlist } from "@shared/schema";

const screenFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  clientId: z.string().nullable().optional(),
  displayProfileId: z.string().optional(),
  currentEventId: z.string().nullable().optional(),
  fallbackLayoutId: z.string().nullable().optional(),
  fallbackPlaylistId: z.string().nullable().optional(),
  canvasEnabled: z.boolean().default(false),
  canvasWidth: z.number().min(1, "Canvas width is required").optional(),
  canvasHeight: z.number().min(1, "Canvas height is required").optional(),
  canvasX: z.number().min(0).default(0),
  canvasY: z.number().min(0).default(0),
}).refine(
  (data) => !data.canvasEnabled || (data.canvasWidth != null && data.canvasWidth >= 1),
  { message: "Canvas width is required when canvas positioning is enabled", path: ["canvasWidth"] }
).refine(
  (data) => !data.canvasEnabled || (data.canvasHeight != null && data.canvasHeight >= 1),
  { message: "Canvas height is required when canvas positioning is enabled", path: ["canvasHeight"] }
);

type ScreenFormValues = z.infer<typeof screenFormSchema>;

function CanvasPreview({
  canvasWidth,
  canvasHeight,
  screenWidth,
  screenHeight,
  canvasX,
  canvasY,
}: {
  canvasWidth: number;
  canvasHeight: number;
  screenWidth: number;
  screenHeight: number;
  canvasX: number;
  canvasY: number;
}) {
  const previewMaxWidth = 280;
  const previewMaxHeight = 160;
  const scale = Math.min(previewMaxWidth / canvasWidth, previewMaxHeight / canvasHeight);
  const pw = canvasWidth * scale;
  const ph = canvasHeight * scale;
  const sx = canvasX * scale;
  const sy = canvasY * scale;
  const sw = Math.min(screenWidth * scale, pw - sx);
  const sh = Math.min(screenHeight * scale, ph - sy);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative border-2 border-dashed border-muted-foreground/30 bg-muted/20 rounded"
        style={{ width: pw, height: ph }}
        data-testid="canvas-preview"
      >
        <div
          className="absolute bg-primary/20 border-2 border-primary rounded-sm flex items-start justify-start"
          style={{ left: sx, top: sy, width: Math.max(sw, 2), height: Math.max(sh, 2) }}
        >
          <span className="text-[10px] text-foreground/80 px-1 py-0.5 leading-none">
            Screen {screenWidth}×{screenHeight}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        Canvas {canvasWidth}×{canvasHeight} • Position ({canvasX}, {canvasY})
      </span>
    </div>
  );
}

function CanvasFields({
  form,
  profiles,
  prefix,
}: {
  form: any;
  profiles: DisplayProfile[];
  prefix: string;
}) {
  const canvasEnabled = form.watch("canvasEnabled");
  const canvasWidth = form.watch("canvasWidth") || 1920;
  const canvasHeight = form.watch("canvasHeight") || 1080;
  const canvasX = form.watch("canvasX") || 0;
  const canvasY = form.watch("canvasY") || 0;
  const profileId = form.watch("displayProfileId");
  const profile = profiles.find((p: DisplayProfile) => p.id === profileId);
  const screenWidth = profile?.width || 1920;
  const screenHeight = profile?.height || 1080;

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor={`${prefix}-canvas-toggle`} className="text-sm font-medium">
            Canvas Positioning
          </Label>
        </div>
        <Switch
          id={`${prefix}-canvas-toggle`}
          checked={canvasEnabled}
          onCheckedChange={(checked) => {
            form.setValue("canvasEnabled", checked);
            if (checked && !form.getValues("canvasWidth")) {
              form.setValue("canvasWidth", 1920);
              form.setValue("canvasHeight", 1080);
              form.setValue("canvasX", 0);
              form.setValue("canvasY", 0);
            }
          }}
          data-testid={`${prefix}-canvas-toggle`}
        />
      </div>
      {canvasEnabled && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Position this screen within a larger canvas (e.g., for video walls).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Canvas Width (px)</Label>
              <Input
                type="number"
                min={1}
                placeholder="1920"
                value={form.watch("canvasWidth") || ""}
                onChange={(e) => form.setValue("canvasWidth", parseInt(e.target.value) || undefined)}
                data-testid={`${prefix}-canvas-width`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Canvas Height (px)</Label>
              <Input
                type="number"
                min={1}
                placeholder="1080"
                value={form.watch("canvasHeight") || ""}
                onChange={(e) => form.setValue("canvasHeight", parseInt(e.target.value) || undefined)}
                data-testid={`${prefix}-canvas-height`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">X Position (px)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.watch("canvasX") ?? ""}
                onChange={(e) => form.setValue("canvasX", parseInt(e.target.value) || 0)}
                data-testid={`${prefix}-canvas-x`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Y Position (px)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.watch("canvasY") ?? ""}
                onChange={(e) => form.setValue("canvasY", parseInt(e.target.value) || 0)}
                data-testid={`${prefix}-canvas-y`}
              />
            </div>
          </div>
          {profile && (
            <CanvasPreview
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              screenWidth={screenWidth}
              screenHeight={screenHeight}
              canvasX={canvasX}
              canvasY={canvasY}
            />
          )}
        </div>
      )}
    </div>
  );
}

function generatePairingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function ScreenCard({
  screen,
  profiles,
  events,
  layouts,
  playlists,
  clients,
  activeOverride,
}: {
  screen: Screen;
  profiles: DisplayProfile[];
  events: Event[];
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  clients: Client[];
  activeOverride: LiveOverride | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isUserAdmin = user?.role === "admin";

  const profile = profiles.find((p) => p.id === screen.displayProfileId);
  const siteProfiles = profiles.filter((p) => !p.clientId || p.clientId === screen.clientId);

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) =>
      apiRequest("POST", `/api/screens/${screen.id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: screen.locked ? "Screen unlocked" : "Screen locked" });
    },
    onError: () => {
      toast({ title: "Failed to toggle lock", variant: "destructive" });
    },
  });

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

  const client = clients.find((c) => c.id === screen.clientId);

  const form = useForm<ScreenFormValues>({
    resolver: zodResolver(screenFormSchema),
    defaultValues: {
      name: screen.name,
      location: screen.location || "",
      clientId: screen.clientId || "",
      displayProfileId: screen.displayProfileId || "",
      currentEventId: screen.currentEventId || "",
      fallbackLayoutId: screen.fallbackLayoutId || "",
      fallbackPlaylistId: screen.fallbackPlaylistId || "",
      canvasEnabled: screen.canvasEnabled || false,
      canvasWidth: screen.canvasWidth || undefined,
      canvasHeight: screen.canvasHeight || undefined,
      canvasX: screen.canvasX || 0,
      canvasY: screen.canvasY || 0,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ScreenFormValues) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, {
        ...data,
        clientId: data.clientId || null,
        currentEventId: data.currentEventId || null,
        fallbackLayoutId: data.fallbackLayoutId || null,
        fallbackPlaylistId: data.fallbackPlaylistId || null,
        canvasEnabled: data.canvasEnabled || false,
        canvasWidth: data.canvasEnabled ? data.canvasWidth : null,
        canvasHeight: data.canvasEnabled ? data.canvasHeight : null,
        canvasX: data.canvasEnabled ? (data.canvasX || 0) : 0,
        canvasY: data.canvasEnabled ? (data.canvasY || 0) : 0,
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

  const refreshPlayerMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/screens/${screen.id}/refresh`),
    onSuccess: () => {
      toast({ title: "Refresh signal sent", description: "The player will reload within a few seconds." });
    },
    onError: () => {
      toast({ title: "Failed to send refresh signal", variant: "destructive" });
    },
  });

  const copyPairingCode = () => {
    if (screen.pairingCode) {
      navigator.clipboard.writeText(screen.pairingCode);
      toast({ title: "Pairing code copied to clipboard" });
    }
  };

  const toggleScreenshotMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, { screenshotEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: screen.screenshotEnabled ? "Screenshots disabled" : "Screenshots enabled" });
    },
    onError: () => {
      toast({ title: "Failed to toggle screenshots", variant: "destructive" });
    },
  });

  const toggleTestPatternMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, { testPatternEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: screen.testPatternEnabled ? "Test pattern disabled" : "Test pattern enabled" });
    },
    onError: () => {
      toast({ title: "Failed to toggle test pattern", variant: "destructive" });
    },
  });

  const requestScreenshotMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/screens/${screen.id}/request-screenshot`),
    onSuccess: () => {
      toast({ title: "Screenshot requested", description: "The player will capture within a few seconds." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/screens", screen.id, "screenshot"] });
      }, 10000);
    },
    onError: () => {
      toast({ title: "Failed to request screenshot", variant: "destructive" });
    },
  });

  const screenshotQuery = useQuery<{ screenshot: string | null; screenshotAt: string | null }>({
    queryKey: ["/api/screens", screen.id, "screenshot"],
    queryFn: async () => {
      const res = await fetch(`/api/screens/${screen.id}/screenshot`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch screenshot");
      return res.json();
    },
    enabled: !!screen.screenshotEnabled,
    refetchInterval: screen.screenshotEnabled ? 30000 : false,
  });

  return (
    <Card className={`hover-elevate transition-all ${screen.locked ? "ring-1 ring-amber-500/30" : ""}`}>
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
              {screen.locked && (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
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
              {!screen.displayProfileId && (
                <button
                  type="button"
                  onClick={() => !screen.locked && setEditOpen(true)}
                  disabled={!!screen.locked}
                  className="inline-flex"
                  title="Click to assign a display profile"
                  data-testid={`button-no-profile-warning-${screen.id}`}
                >
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400 hover-elevate cursor-pointer"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    No Display Profile
                  </Badge>
                </button>
              )}
            </div>
            {(screen.location || client || screen.hostname || (screen.isPaired && screen.ipAddress)) && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                {client && <span>{client.name}</span>}
                {client && (screen.location || screen.hostname || screen.ipAddress) && <span>·</span>}
                {screen.location && (
                  <>
                    <MapPin className="h-3 w-3" />
                    <span>{screen.location}</span>
                  </>
                )}
                {screen.isPaired && (screen.hostname || screen.ipAddress) && (
                  <>
                    {screen.location && <span>·</span>}
                    <span className="font-mono text-xs">
                      {screen.hostname || screen.ipAddress}
                    </span>
                  </>
                )}
              </div>
            )}
            {(() => {
              const overrideLayout = activeOverride?.layoutTemplateId
                ? layouts.find(l => l.id === activeOverride.layoutTemplateId)
                : null;
              const fallbackLayout = screen.fallbackLayoutId
                ? layouts.find(l => l.id === screen.fallbackLayoutId)
                : null;
              const currentLayout = overrideLayout || fallbackLayout;
              if (!currentLayout) return null;
              return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LayoutGrid className="h-3 w-3" />
                  <span>{currentLayout.name}</span>
                  {overrideLayout && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-600/30">Override</Badge>}
                  {!overrideLayout && fallbackLayout && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">Fallback</Badge>}
                </div>
              );
            })()}
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
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={!!screen.locked}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
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
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                            value={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-screen-client">
                                <SelectValue placeholder="No site assigned" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No site assigned</SelectItem>
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
                      name="displayProfileId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Profile</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-screen-profile">
                                <SelectValue placeholder="Select a profile" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {siteProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.width}x{p.height})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!field.value && (
                            <div
                              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                              data-testid={`warning-no-display-profile-${screen.id}`}
                            >
                              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>
                                This screen has no display profile assigned. The simulator will fall back to the layout's dimensions, which may not match the real display. Pick a profile above to fix this.
                              </span>
                            </div>
                          )}
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
                    <FormField
                      control={form.control}
                      name="fallbackLayoutId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fallback Layout</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                            defaultValue={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-screen-fallback-layout">
                                <SelectValue placeholder="Black screen (no fallback)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">Black screen (no fallback)</SelectItem>
                              {layouts.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.name}
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
                      name="fallbackPlaylistId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fallback Playlist</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                            defaultValue={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-screen-fallback-playlist">
                                <SelectValue placeholder="No fallback playlist" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No fallback playlist</SelectItem>
                              {playlists.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Used when no scheduled layout or fallback layout is active</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <CanvasFields form={form} profiles={siteProfiles} prefix="edit" />
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
            {screen.isOnline && (
              <DropdownMenuItem
                onSelect={() => refreshPlayerMutation.mutate()}
                data-testid={`button-refresh-player-${screen.id}`}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Player
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
            {isUserAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => lockMutation.mutate(!screen.locked)}>
                  {screen.locked ? (
                    <><Unlock className="mr-2 h-4 w-4" />Unlock</>
                  ) : (
                    <><Lock className="mr-2 h-4 w-4" />Lock</>
                  )}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => deleteMutation.mutate()}
              disabled={screen.locked}
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
        {screen.canvasEnabled && screen.canvasWidth && screen.canvasHeight && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Grid3X3 className="h-3 w-3" />
            Position ({screen.canvasX || 0}, {screen.canvasY || 0}) on {screen.canvasWidth}×{screen.canvasHeight} canvas
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TestTube className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Test Pattern</span>
            {screen.testPatternEnabled && (
              <Badge variant="outline" className="h-4 text-[10px] px-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400">
                ACTIVE
              </Badge>
            )}
          </div>
          <Switch
            checked={screen.testPatternEnabled || false}
            onCheckedChange={(checked) => toggleTestPatternMutation.mutate(checked)}
            disabled={!!screen.locked}
            data-testid={`switch-test-pattern-${screen.id}`}
          />
        </div>
        {screen.isPaired && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Live Screenshot</span>
            </div>
            <div className="flex items-center gap-2">
              {screen.screenshotEnabled && screen.isOnline && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => requestScreenshotMutation.mutate()}
                  disabled={requestScreenshotMutation.isPending}
                  data-testid={`button-capture-screenshot-${screen.id}`}
                >
                  <Camera className="h-3 w-3 mr-1" />
                  Capture Now
                </Button>
              )}
              <Switch
                checked={screen.screenshotEnabled || false}
                onCheckedChange={(checked) => toggleScreenshotMutation.mutate(checked)}
                data-testid={`switch-screenshot-${screen.id}`}
              />
            </div>
          </div>
        )}
        {screen.screenshotEnabled && (
          <div className="rounded-lg overflow-hidden border border-border bg-black">
            {screenshotQuery.data?.screenshot ? (
              <div>
                <img
                  src={screenshotQuery.data.screenshot}
                  alt={`${screen.name} live screenshot`}
                  className="w-full aspect-video object-contain"
                  data-testid={`img-screenshot-${screen.id}`}
                />
                {screenshotQuery.data.screenshotAt && (
                  <p className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/50">
                    Captured {formatDistanceToNow(new Date(screenshotQuery.data.screenshotAt), { addSuffix: true })}
                  </p>
                )}
              </div>
            ) : (
              <div className="w-full aspect-video flex items-center justify-center text-xs text-muted-foreground">
                {screenshotQuery.isLoading ? "Loading..." : "No screenshot available yet"}
              </div>
            )}
          </div>
        )}
        <PresetManager
          targetType="screen"
          targetId={screen.id}
          layouts={layouts}
          playlists={playlists}
        />
        {screen.lastSeen && (
          <p className="text-xs text-muted-foreground" title={new Date(screen.lastSeen).toLocaleString()}>
            Last seen: {formatDistanceToNow(new Date(screen.lastSeen), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CreateScreenDialog({ profiles, events, clients }: { profiles: DisplayProfile[]; events: Event[]; clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { selectedClientId } = useSiteContext();

  const form = useForm<ScreenFormValues>({
    resolver: zodResolver(screenFormSchema),
    defaultValues: {
      name: "",
      location: "",
      clientId: selectedClientId || "",
      displayProfileId: "",
      currentEventId: "",
      canvasEnabled: false,
      canvasWidth: undefined,
      canvasHeight: undefined,
      canvasX: 0,
      canvasY: 0,
    },
  });

  const watchedClientId = form.watch("clientId");
  const siteProfiles = profiles.filter((p) => !p.clientId || p.clientId === watchedClientId);

  const createMutation = useMutation({
    mutationFn: (data: ScreenFormValues) =>
      apiRequest("POST", "/api/screens", {
        ...data,
        clientId: data.clientId || null,
        currentEventId: data.currentEventId || null,
        pairingCode: generatePairingCode(),
        canvasEnabled: data.canvasEnabled || false,
        canvasWidth: data.canvasEnabled ? data.canvasWidth : null,
        canvasHeight: data.canvasEnabled ? data.canvasHeight : null,
        canvasX: data.canvasEnabled ? (data.canvasX || 0) : 0,
        canvasY: data.canvasEnabled ? (data.canvasY || 0) : 0,
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
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
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                    value={field.value || "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-screen-client">
                        <SelectValue placeholder="No site assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">No site assigned</SelectItem>
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
                      {siteProfiles.map((p) => (
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
            <CanvasFields form={form} profiles={siteProfiles} prefix="create" />
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
  const screensQueryConfig = useSiteFilteredQuery<Screen[]>("/api/screens");
  const { data: screens = [], isLoading: screensLoading } = useQuery({ ...screensQueryConfig, refetchInterval: 10000 });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<
    DisplayProfile[]
  >({
    queryKey: ["/api/display-profiles"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const eventsQueryConfig = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [] } = useQuery(eventsQueryConfig);

  const layoutsQueryConfig = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const { data: layouts = [] } = useQuery(layoutsQueryConfig);

  const playlistsQueryConfig = useSiteFilteredQuery<Playlist[]>("/api/playlists");
  const { data: playlists = [] } = useQuery(playlistsQueryConfig);

  const liveOverridesQueryConfig = useSiteFilteredQuery<LiveOverride[]>("/api/live-overrides");
  const { data: liveOverrides = [] } = useQuery({ ...liveOverridesQueryConfig, refetchInterval: 10000 });

  const getActiveOverrideForScreen = (screenId: string): LiveOverride | null => {
    const now = new Date();
    return liveOverrides.find(o => {
      if (!o.isActive || new Date(o.endTime) <= now) return false;
      if (new Date(o.startTime) > now) return false;
      const targets = o.targets as any[] | undefined;
      if (!targets || targets.length === 0) return true;
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
        <CreateScreenDialog profiles={profiles} events={events} clients={clients} />
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
            <CreateScreenDialog profiles={profiles} events={events} clients={clients} />
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
              layouts={layouts}
              playlists={playlists}
              clients={clients}
              activeOverride={getActiveOverrideForScreen(screen.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

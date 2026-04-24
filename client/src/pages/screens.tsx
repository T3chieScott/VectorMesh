import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addMinutes, formatDistanceToNow } from "date-fns";
import { PresetManager } from "@/components/preset-manager";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Radio,
  GripVertical,
  ArrowUpToLine,
  ArrowDownToLine,
} from "lucide-react";
import { useSiteContext } from "@/hooks/use-site-context";
import { useAuth } from "@/hooks/use-auth";
import type { Screen, DisplayProfile, LiveOverride, Event, LayoutTemplate, Client, Playlist, ScreenEventBooking } from "@shared/schema";
import { WeatherLocationPicker } from "@/components/weather-location-picker";
import { ScreensTable } from "@/components/screens-table";
import { ScreenBookingStatus } from "@/components/screen-booking-status";
import { Table as TableIcon, LayoutGrid as LayoutGridIcon } from "lucide-react";

type ScreensView = "cards" | "table";

const LEGACY_VIEW_KEY = "vectormesh:screens-view";

function viewStorageKey(userId: string | null | undefined): string {
  return userId ? `vectormesh:${userId}:screens-view` : LEGACY_VIEW_KEY;
}

function loadViewPreference(userId: string | null | undefined): ScreensView {
  try {
    const key = viewStorageKey(userId);
    let v = localStorage.getItem(key);
    if (!v && userId) {
      // One-time migration from the legacy unscoped key
      const legacy = localStorage.getItem(LEGACY_VIEW_KEY);
      if (legacy === "table" || legacy === "cards") {
        v = legacy;
        localStorage.setItem(key, legacy);
      }
    }
    if (v === "table" || v === "cards") return v;
  } catch {
    // ignore
  }
  return "cards";
}

const screenFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  clientId: z.string().nullable().optional(),
  displayProfileId: z.string().optional(),
  fallbackLayoutId: z.string().nullable().optional(),
  fallbackPlaylistId: z.string().nullable().optional(),
  canvasEnabled: z.boolean().default(false),
  canvasWidth: z.number().min(1, "Canvas width is required").optional(),
  canvasHeight: z.number().min(1, "Canvas height is required").optional(),
  canvasX: z.number().min(0).default(0),
  canvasY: z.number().min(0).default(0),
  roomCapacity: z.number().int().min(0).optional().nullable(),
  weatherLat: z.string().optional(),
  weatherLng: z.string().optional(),
  weatherPlaceName: z.string().optional(),
  weatherUnit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
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

function RoomAndWeatherFields({ form, prefix }: { form: any; prefix: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const placeName = form.watch("weatherPlaceName");
  const lat = form.watch("weatherLat");
  const lng = form.watch("weatherLng");
  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Room & Weather</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Used by player tokens like <code className="font-mono">{`{{room_capacity}}`}</code> and{" "}
        <code className="font-mono">{`{{weather_summary}}`}</code>. Leave blank to clear.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Room Capacity</Label>
        <Input
          type="number"
          min={0}
          placeholder="e.g., 50"
          value={form.watch("roomCapacity") ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            form.setValue("roomCapacity", v === "" ? null : parseInt(v, 10));
          }}
          data-testid={`${prefix}-room-capacity`}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Weather Location</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          data-testid={`${prefix}-pick-weather-location`}
        >
          <MapPin className="mr-1 h-3 w-3" />
          {lat && lng ? "Change on map" : "Pick on map"}
        </Button>
      </div>
      {placeName && (
        <div className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground" data-testid={`${prefix}-weather-place-name`}>
          {placeName}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Weather Latitude</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="51.5074"
            value={form.watch("weatherLat") ?? ""}
            onChange={(e) => {
              form.setValue("weatherLat", e.target.value);
              form.setValue("weatherPlaceName", "");
            }}
            data-testid={`${prefix}-weather-lat`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Weather Longitude</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="-0.1278"
            value={form.watch("weatherLng") ?? ""}
            onChange={(e) => {
              form.setValue("weatherLng", e.target.value);
              form.setValue("weatherPlaceName", "");
            }}
            data-testid={`${prefix}-weather-lng`}
          />
        </div>
      </div>
      <WeatherLocationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialLat={lat}
        initialLng={lng}
        initialPlaceName={placeName}
        onSelect={({ lat: newLat, lng: newLng, placeName: newPlaceName }) => {
          form.setValue("weatherLat", newLat, { shouldDirty: true });
          form.setValue("weatherLng", newLng, { shouldDirty: true });
          form.setValue("weatherPlaceName", newPlaceName ?? "", { shouldDirty: true });
        }}
      />
      <div className="space-y-1">
        <Label className="text-xs">Temperature Unit</Label>
        <Select
          value={form.watch("weatherUnit") || "celsius"}
          onValueChange={(val) => form.setValue("weatherUnit", val)}
        >
          <SelectTrigger data-testid={`${prefix}-weather-unit`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="celsius">Celsius (°C)</SelectItem>
            <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function generatePairingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Format a Date as the value expected by <input type="datetime-local"> in
// the user's local timezone (yyyy-MM-ddTHH:mm).
function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatBookingRange(starts: Date, ends: Date): string {
  const sameDay =
    starts.getFullYear() === ends.getFullYear() &&
    starts.getMonth() === ends.getMonth() &&
    starts.getDate() === ends.getDate();
  const startStr = starts.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endStr = sameDay
    ? ends.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : ends.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  return `${startStr} → ${endStr}`;
}

// Server-derived playback view returned by GET /api/screens/:id/playback.
// The shape mirrors the route handler: an active event (if a booking
// covers `now`), a block status (only meaningful when activeEvent is
// non-null) and a fallback "next booking" pointer for days when nothing
// is on yet.
// ScreenBookingStatus is imported from @/components/screen-booking-status
// at the top of the file so the screens table can share the React-Query
// cache.

// One row in a list of bookings. Defaults to a compact display row with
// edit/delete buttons; the edit button swaps the row into an inline form
// for changing the booking's start/end times. The event itself is not
// editable from this row — to move a booking to a different event,
// delete it and add a new one (this matches how venue staff think about
// "moving" a booking).
function BookingRow({
  booking,
  eventName,
  invalidateKeys,
  onDelete,
  deleting,
}: {
  booking: ScreenEventBooking;
  eventName: string;
  invalidateKeys: ReadonlyArray<ReadonlyArray<string>>;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(toLocalDateTimeInput(new Date(booking.startsAt)));
  const [endsAt, setEndsAt] = useState(toLocalDateTimeInput(new Date(booking.endsAt)));

  const updateMutation = useMutation({
    mutationFn: async () => {
      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      if (!(endDate > startDate)) throw new Error("End must be after start");
      return apiRequest("PATCH", `/api/screen-bookings/${booking.id}`, {
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      });
    },
    onSuccess: () => {
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
      setEditing(false);
      toast({ title: "Booking updated" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && err.message?.includes("overlap")
        ? "That overlaps with another booking on this screen."
        : (err instanceof Error ? err.message : "Failed to update booking");
      toast({ title: msg, variant: "destructive" });
    },
  });

  if (editing) {
    return (
      <li
        className="space-y-2 rounded-md bg-muted/40 px-2 py-2 text-sm"
        data-testid={`row-booking-edit-${booking.id}`}
      >
        <div className="truncate font-medium">{eventName}</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Starts</Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
              data-testid={`input-edit-booking-starts-${booking.id}`}
            />
          </div>
          <div>
            <Label className="text-xs">Ends</Label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              data-testid={`input-edit-booking-ends-${booking.id}`}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setStartsAt(toLocalDateTimeInput(new Date(booking.startsAt)));
              setEndsAt(toLocalDateTimeInput(new Date(booking.endsAt)));
              setEditing(false);
            }}
            data-testid={`button-cancel-edit-booking-${booking.id}`}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
            data-testid={`button-save-edit-booking-${booking.id}`}
          >
            Save
          </Button>
        </div>
      </li>
    );
  }

  const starts = new Date(booking.startsAt);
  const ends = new Date(booking.endsAt);
  return (
    <li
      className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
      data-testid={`row-booking-${booking.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium" data-testid={`text-booking-event-${booking.id}`}>
          {eventName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {formatBookingRange(starts, ends)}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
        data-testid={`button-edit-booking-${booking.id}`}
        title="Edit booking dates"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        disabled={deleting}
        onClick={onDelete}
        data-testid={`button-delete-booking-${booking.id}`}
        title="Remove booking"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

// Inline booking manager mounted inside the screen edit dialog. Lets users
// list, add, edit, and remove the events scheduled on this screen. Overlap
// is validated server-side.
function BookingsPanel({
  screenId,
  events,
}: {
  screenId: string;
  events: Event[];
}) {
  const { toast } = useToast();
  const { data: bookings = [], isLoading } = useQuery<ScreenEventBooking[]>({
    queryKey: ["/api/screens", screenId, "bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/screens/${screenId}/bookings`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
  });

  const [eventId, setEventId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");

  // When the user selects an event, pre-fill the date range from the event so
  // the common case (book the screen for the whole event) is one click.
  function handleEventChange(id: string) {
    setEventId(id);
    const ev = events.find(e => e.id === id);
    if (ev?.startDate) setStartsAt(toLocalDateTimeInput(new Date(ev.startDate)));
    if (ev?.endDate) setEndsAt(toLocalDateTimeInput(new Date(ev.endDate)));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!eventId) throw new Error("Pick an event");
      if (!startsAt || !endsAt) throw new Error("Pick a date range");
      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      if (!(endDate > startDate)) throw new Error("End must be after start");
      return apiRequest("POST", `/api/screens/${screenId}/bookings`, {
        eventId,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens", screenId, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screen-bookings"] });
      setEventId("");
      setStartsAt("");
      setEndsAt("");
      toast({ title: "Booking added" });
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : "";
      const msg = errMsg.includes("overlap")
        ? "That overlaps with another booking on this screen."
        : errMsg || "Failed to add booking";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/screen-bookings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens", screenId, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screen-bookings"] });
      toast({ title: "Booking removed" });
    },
    onError: () => toast({ title: "Failed to remove booking", variant: "destructive" }),
  });

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="panel-screen-bookings">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Event bookings</Label>
        <span className="text-xs text-muted-foreground">
          When this screen plays each event
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : bookings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No bookings yet. Add one below to schedule an event for this screen.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bookings.map(b => (
            <BookingRow
              key={b.id}
              booking={b}
              eventName={events.find(e => e.id === b.eventId)?.name || "Unknown event"}
              invalidateKeys={[
                ["/api/screens", screenId, "bookings"],
                ["/api/screen-bookings"],
              ]}
              onDelete={() => deleteMutation.mutate(b.id)}
              deleting={deleteMutation.isPending}
            />
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t pt-3">
        <Label className="text-xs text-muted-foreground">Add a booking</Label>
        <Select value={eventId} onValueChange={handleEventChange}>
          <SelectTrigger data-testid="select-new-booking-event">
            <SelectValue placeholder="Pick an event" />
          </SelectTrigger>
          <SelectContent>
            {events.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No events available</div>
            ) : (
              events.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Starts</Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
              data-testid="input-new-booking-starts"
            />
          </div>
          <div>
            <Label className="text-xs">Ends</Label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              data-testid="input-new-booking-ends"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={createMutation.isPending || !eventId || !startsAt || !endsAt}
          onClick={() => createMutation.mutate()}
          data-testid="button-add-booking"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add booking
        </Button>
      </div>
    </div>
  );
}

function ScreenCard({
  screen,
  profiles,
  events,
  layouts,
  playlists,
  clients,
  activeOverride,
  editOpen: editOpenProp,
  onEditOpenChange,
  dragHandle,
  onMoveToStart,
  onMoveToEnd,
  canMove = true,
  moveDisabledReason,
  onDuplicate,
}: {
  screen: Screen;
  profiles: DisplayProfile[];
  events: Event[];
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  clients: Client[];
  activeOverride: LiveOverride | null;
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
  dragHandle?: React.ReactNode;
  onMoveToStart?: () => void;
  onMoveToEnd?: () => void;
  canMove?: boolean;
  moveDisabledReason?: string;
  onDuplicate?: () => void;
}) {
  const [internalEditOpen, setInternalEditOpen] = useState(false);
  const isEditControlled = editOpenProp !== undefined;
  const editOpen = isEditControlled ? !!editOpenProp : internalEditOpen;
  const setEditOpen = (open: boolean) => {
    if (isEditControlled) {
      onEditOpenChange?.(open);
    } else {
      setInternalEditOpen(open);
      onEditOpenChange?.(open);
    }
  };
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [screenshotViewMode, setScreenshotViewMode] = useState<"screen" | "canvas">("screen");
  const openScreenshotPopup = () => {
    setScreenshotViewMode("screen");
    setScreenshotOpen(true);
  };
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
      fallbackLayoutId: screen.fallbackLayoutId || "",
      fallbackPlaylistId: screen.fallbackPlaylistId || "",
      canvasEnabled: screen.canvasEnabled || false,
      canvasWidth: screen.canvasWidth || undefined,
      canvasHeight: screen.canvasHeight || undefined,
      canvasX: screen.canvasX || 0,
      canvasY: screen.canvasY || 0,
      roomCapacity: screen.roomCapacity ?? null,
      weatherLat: screen.weatherLat ?? "",
      weatherLng: screen.weatherLng ?? "",
      weatherPlaceName: screen.weatherPlaceName ?? "",
      weatherUnit: (screen.weatherUnit === "fahrenheit" ? "fahrenheit" : "celsius") as "celsius" | "fahrenheit",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ScreenFormValues) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, {
        ...data,
        clientId: data.clientId || null,
        fallbackLayoutId: data.fallbackLayoutId || null,
        fallbackPlaylistId: data.fallbackPlaylistId || null,
        canvasEnabled: data.canvasEnabled || false,
        canvasWidth: data.canvasEnabled ? data.canvasWidth : null,
        canvasHeight: data.canvasEnabled ? data.canvasHeight : null,
        canvasX: data.canvasEnabled ? (data.canvasX || 0) : 0,
        canvasY: data.canvasEnabled ? (data.canvasY || 0) : 0,
        roomCapacity: data.roomCapacity == null || Number.isNaN(data.roomCapacity) ? null : data.roomCapacity,
        weatherLat: data.weatherLat?.trim() ? data.weatherLat.trim() : null,
        weatherLng: data.weatherLng?.trim() ? data.weatherLng.trim() : null,
        weatherPlaceName: data.weatherPlaceName?.trim() ? data.weatherPlaceName.trim() : null,
        weatherUnit: data.weatherUnit || "celsius",
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

  const toggleLiveBannerMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, { showLiveBanner: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: screen.showLiveBanner ? "LIVE banner hidden" : "LIVE banner shown" });
    },
    onError: () => {
      toast({ title: "Failed to toggle LIVE banner", variant: "destructive" });
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
    <Card className={`relative hover-elevate transition-all ${screen.locked ? "ring-1 ring-amber-500/30" : ""}`}>
      {dragHandle}
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
                    <BookingsPanel screenId={screen.id} events={events} />
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
                    <RoomAndWeatherFields form={form} prefix="edit" />
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
            {(onMoveToStart || onMoveToEnd) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canMove}
                  onSelect={() => onMoveToStart?.()}
                  data-testid={`button-move-to-start-${screen.id}`}
                  title={!canMove ? moveDisabledReason : undefined}
                >
                  <ArrowUpToLine className="mr-2 h-4 w-4" />
                  Move to start
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canMove}
                  onSelect={() => onMoveToEnd?.()}
                  data-testid={`button-move-to-end-${screen.id}`}
                  title={!canMove ? moveDisabledReason : undefined}
                >
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Move to end
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
            {onDuplicate && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onDuplicate()}
                  disabled={!!screen.locked}
                  data-testid={`menu-duplicate-${screen.id}`}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
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
        <ScreenBookingStatus screenId={screen.id} />
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Show LIVE Banner</span>
          </div>
          <Switch
            checked={screen.showLiveBanner || false}
            onCheckedChange={(checked) => toggleLiveBannerMutation.mutate(checked)}
            disabled={!!screen.locked}
            data-testid={`switch-live-banner-${screen.id}`}
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
                <button
                  type="button"
                  onClick={openScreenshotPopup}
                  className="relative block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`button-open-screenshot-${screen.id}`}
                  aria-label={`Open full-resolution screenshot of ${screen.name}`}
                >
                  <img
                    src={screenshotQuery.data.screenshot}
                    alt={`${screen.name} live screenshot`}
                    className="w-full h-auto block"
                    data-testid={`img-screenshot-${screen.id}`}
                  />
                  {screen.canvasEnabled && screen.canvasWidth && screen.canvasHeight && profile?.width && profile?.height && (
                    <>
                      <div
                        className="absolute border border-dashed border-white/40 pointer-events-none"
                        style={{
                          left: `${((screen.canvasX || 0) / screen.canvasWidth) * 100}%`,
                          top: `${((screen.canvasY || 0) / screen.canvasHeight) * 100}%`,
                          width: `${(profile.width / screen.canvasWidth) * 100}%`,
                          height: `${(profile.height / screen.canvasHeight) * 100}%`,
                        }}
                        data-testid={`overlay-aoi-${screen.id}`}
                      />
                      <div
                        className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono pointer-events-none"
                        data-testid={`label-aoi-${screen.id}`}
                      >
                        Screen at ({screen.canvasX || 0},{screen.canvasY || 0}) on {screen.canvasWidth}×{screen.canvasHeight} canvas
                      </div>
                    </>
                  )}
                </button>
                {screenshotQuery.data.screenshotAt && (
                  <p className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/50">
                    Captured {formatDistanceToNow(new Date(screenshotQuery.data.screenshotAt), { addSuffix: true })}
                  </p>
                )}
                <Dialog open={screenshotOpen} onOpenChange={setScreenshotOpen}>
                  <DialogContent
                    className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] p-0 bg-black border-border"
                    data-testid={`dialog-screenshot-${screen.id}`}
                  >
                    <DialogHeader className="px-4 py-2 border-b border-border bg-background">
                      <div className="flex items-center justify-between gap-3 pr-8">
                        <DialogTitle className="text-sm" data-testid={`dialog-title-screenshot-${screen.id}`}>
                          {screen.name} — live screenshot
                        </DialogTitle>
                        {screen.canvasEnabled && screen.canvasWidth && screen.canvasHeight && profile?.width && profile?.height && (
                          <div
                            className="inline-flex rounded-md border border-border overflow-hidden text-xs"
                            data-testid={`toggle-screenshot-view-${screen.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => setScreenshotViewMode("screen")}
                              className={cn(
                                "px-3 py-1 transition-colors",
                                screenshotViewMode === "screen"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover-elevate",
                              )}
                              data-testid={`button-screenshot-view-screen-${screen.id}`}
                              aria-pressed={screenshotViewMode === "screen"}
                            >
                              Screen
                            </button>
                            <button
                              type="button"
                              onClick={() => setScreenshotViewMode("canvas")}
                              className={cn(
                                "px-3 py-1 transition-colors border-l border-border",
                                screenshotViewMode === "canvas"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover-elevate",
                              )}
                              data-testid={`button-screenshot-view-canvas-${screen.id}`}
                              aria-pressed={screenshotViewMode === "canvas"}
                            >
                              Canvas
                            </button>
                          </div>
                        )}
                      </div>
                    </DialogHeader>
                    {screen.canvasEnabled && screen.canvasWidth && screen.canvasHeight && profile?.width && profile?.height && screenshotViewMode === "screen" ? (
                      <div className="flex items-center justify-center bg-black p-2">
                        <div
                          className="relative overflow-hidden bg-black"
                          style={{
                            aspectRatio: `${profile.width} / ${profile.height}`,
                            width: `min(100%, calc((85vh - 1rem) * ${profile.width} / ${profile.height}))`,
                          }}
                          data-testid={`screenshot-aoi-crop-${screen.id}`}
                        >
                          <img
                            src={screenshotQuery.data.screenshot}
                            alt={`${screen.name} screen content`}
                            className="absolute block max-w-none"
                            style={{
                              width: `${(screen.canvasWidth / profile.width) * 100}%`,
                              height: "auto",
                              left: `${-((screen.canvasX || 0) / profile.width) * 100}%`,
                              top: `${-((screen.canvasY || 0) / profile.height) * 100}%`,
                              imageRendering: "auto",
                            }}
                            data-testid={`img-screenshot-full-${screen.id}`}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full max-h-[85vh] overflow-auto bg-black">
                        <div className="relative w-full">
                          <img
                            src={screenshotQuery.data.screenshot}
                            alt={`${screen.name} full-resolution screenshot`}
                            className="block w-full h-auto"
                            style={{ imageRendering: "auto" }}
                            data-testid={`img-screenshot-full-${screen.id}`}
                          />
                          {screen.canvasEnabled && screen.canvasWidth && screen.canvasHeight && profile?.width && profile?.height && (
                            <>
                              <div
                                className="absolute border-2 border-dashed border-white/60 pointer-events-none"
                                style={{
                                  left: `${((screen.canvasX || 0) / screen.canvasWidth) * 100}%`,
                                  top: `${((screen.canvasY || 0) / screen.canvasHeight) * 100}%`,
                                  width: `${(profile.width / screen.canvasWidth) * 100}%`,
                                  height: `${(profile.height / screen.canvasHeight) * 100}%`,
                                }}
                                data-testid={`overlay-aoi-full-${screen.id}`}
                              />
                              <div
                                className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-white text-xs font-mono pointer-events-none"
                                data-testid={`label-aoi-full-${screen.id}`}
                              >
                                Screen at ({screen.canvasX || 0},{screen.canvasY || 0}) on {screen.canvasWidth}×{screen.canvasHeight} canvas
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <div
                className="w-full flex items-center justify-center text-xs text-muted-foreground"
                style={{
                  aspectRatio: screen.canvasEnabled && screen.canvasWidth && screen.canvasHeight
                    ? `${screen.canvasWidth} / ${screen.canvasHeight}`
                    : profile?.width && profile?.height
                      ? `${profile.width} / ${profile.height}`
                      : "16 / 9",
                }}
              >
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
      canvasEnabled: false,
      canvasWidth: undefined,
      canvasHeight: undefined,
      canvasX: 0,
      canvasY: 0,
      roomCapacity: null,
      weatherLat: "",
      weatherLng: "",
      weatherPlaceName: "",
      weatherUnit: "celsius",
    },
  });

  const watchedClientId = form.watch("clientId");
  const siteProfiles = profiles.filter((p) => !p.clientId || p.clientId === watchedClientId);

  const createMutation = useMutation({
    mutationFn: (data: ScreenFormValues) =>
      apiRequest("POST", "/api/screens", {
        ...data,
        clientId: data.clientId || null,
        pairingCode: generatePairingCode(),
        canvasEnabled: data.canvasEnabled || false,
        canvasWidth: data.canvasEnabled ? data.canvasWidth : null,
        canvasHeight: data.canvasEnabled ? data.canvasHeight : null,
        canvasX: data.canvasEnabled ? (data.canvasX || 0) : 0,
        canvasY: data.canvasEnabled ? (data.canvasY || 0) : 0,
        roomCapacity: data.roomCapacity == null || Number.isNaN(data.roomCapacity) ? null : data.roomCapacity,
        weatherLat: data.weatherLat?.trim() ? data.weatherLat.trim() : null,
        weatherLng: data.weatherLng?.trim() ? data.weatherLng.trim() : null,
        weatherPlaceName: data.weatherPlaceName?.trim() ? data.weatherPlaceName.trim() : null,
        weatherUnit: data.weatherUnit || "celsius",
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
                  <Select onValueChange={field.onChange} value={field.value || ""}>
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
                  {!field.value && (
                    <div
                      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                      data-testid="warning-no-display-profile-create"
                    >
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        No display profile selected. The simulator will fall back to the layout's dimensions, which may not match the real display. Pick a profile above to avoid a misconfigured screen.
                      </span>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div
              className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
              data-testid="hint-bookings-after-create"
            >
              You can book this screen for one or more events after it's created — open the screen and use the Event bookings panel.
            </div>
            <CanvasFields form={form} profiles={siteProfiles} prefix="create" />
            <RoomAndWeatherFields form={form} prefix="create" />
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

function DuplicateScreenDialog({
  screen,
  onClose,
}: {
  screen: Screen | null;
  onClose: () => void;
}) {
  const open = !!screen;
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (screen) {
      setName(`${screen.name} (Copy)`);
      // Focus + select on next tick so the dialog has rendered
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [screen]);

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!screen) throw new Error("No source screen");
      const res = await apiRequest("POST", `/api/screens/${screen.id}/duplicate`, {
        name: name.trim(),
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: "Screen duplicated" });
      onClose();
    },
    onError: async (err: unknown) => {
      let msg = "Failed to duplicate screen";
      try {
        const text = err instanceof Error ? err.message : "";
        const match = text.match(/^\d+:\s*([\s\S]*)$/);
        if (match) {
          const parsed = JSON.parse(match[1]) as { error?: unknown };
          if (typeof parsed.error === "string") msg = parsed.error;
        }
      } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const trimmed = name.trim();
  const submitDisabled = trimmed.length === 0 || duplicateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-duplicate-screen">
        <DialogHeader>
          <DialogTitle>Duplicate screen</DialogTitle>
          <DialogDescription>
            Create a copy of <span className="font-medium">{screen?.name}</span> with a new name.
            The duplicate will start unpaired and offline.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitDisabled) duplicateMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="duplicate-screen-name">Name</Label>
            <Input
              id="duplicate-screen-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              data-testid="input-duplicate-screen-name"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={duplicateMutation.isPending}
              data-testid="button-duplicate-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              data-testid="button-duplicate-confirm"
            >
              {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableScreenCard(props: {
  screen: Screen;
  profiles: DisplayProfile[];
  events: Event[];
  layouts: LayoutTemplate[];
  playlists: Playlist[];
  clients: Client[];
  activeOverride: LiveOverride | null;
  dragEnabled: boolean;
  dragDisabledReason?: string;
  onMoveToStart: () => void;
  onMoveToEnd: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.screen.id, disabled: !props.dragEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...(props.dragEnabled ? attributes : {})}
      {...(props.dragEnabled ? listeners : {})}
      disabled={!props.dragEnabled}
      title={props.dragEnabled ? "Drag to reorder" : props.dragDisabledReason}
      aria-label="Drag to reorder"
      data-testid={`drag-handle-${props.screen.id}`}
      className={cn(
        "absolute left-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
        props.dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed",
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className="group">
      <ScreenCard
        screen={props.screen}
        profiles={props.profiles}
        events={props.events}
        layouts={props.layouts}
        playlists={props.playlists}
        clients={props.clients}
        activeOverride={props.activeOverride}
        dragHandle={handle}
        onMoveToStart={props.onMoveToStart}
        onMoveToEnd={props.onMoveToEnd}
        canMove={props.dragEnabled}
        moveDisabledReason={props.dragDisabledReason}
        onDuplicate={props.onDuplicate}
      />
    </div>
  );
}

export default function ScreensPage() {
  const screensQueryConfig = useSiteFilteredQuery<Screen[]>("/api/screens");
  const { data: screens = [], isLoading: screensLoading } = useQuery({ ...screensQueryConfig, refetchInterval: 10000 });

  const profilesQueryConfig = useSiteFilteredQuery<DisplayProfile[]>("/api/display-profiles");
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<DisplayProfile[]>(profilesQueryConfig);

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

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [view, setView] = useState<ScreensView>(() => loadViewPreference(userId));
  const [editingScreenId, setEditingScreenId] = useState<string | null>(null);
  const [duplicatingScreen, setDuplicatingScreen] = useState<Screen | null>(null);
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "unpaired">("all");
  const { toast: pageToast } = useToast();

  const filteredScreens = useMemo(() => {
    switch (filter) {
      case "online": return screens.filter((s) => s.isOnline);
      case "offline": return screens.filter((s) => !s.isOnline && s.isPaired);
      case "unpaired": return screens.filter((s) => !s.isPaired);
      default: return screens;
    }
  }, [screens, filter]);

  // Local optimistic order, synced from server data when not actively dragging.
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  useEffect(() => {
    setOrderedIds(screens.map((s) => s.id));
  }, [screens]);

  const orderedScreens = useMemo(() => {
    const map = new Map(screens.map((s) => [s.id, s]));
    const arr: Screen[] = [];
    for (const id of orderedIds) {
      const s = map.get(id);
      if (s) arr.push(s);
    }
    // Append any screens not yet in orderedIds (e.g. just created)
    for (const s of screens) {
      if (!orderedIds.includes(s.id)) arr.push(s);
    }
    return arr;
  }, [screens, orderedIds]);

  const visibleCardScreens = useMemo(() => {
    const visibleIds = new Set(filteredScreens.map((s) => s.id));
    return orderedScreens.filter((s) => visibleIds.has(s.id));
  }, [orderedScreens, filteredScreens]);

  const reorderMutation = useMutation({
    mutationFn: (newOrderedIds: string[]) =>
      apiRequest("PATCH", "/api/screens/reorder", { orderedIds: newOrderedIds }),
    onMutate: async (newOrderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["/api/screens"] });
      const previous = queryClient.getQueryData<Screen[]>(["/api/screens"]);
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]));
        const reordered: Screen[] = [];
        newOrderedIds.forEach((id) => {
          const s = byId.get(id);
          if (s) reordered.push(s);
        });
        previous.forEach((s) => {
          if (!newOrderedIds.includes(s.id)) reordered.push(s);
        });
        queryClient.setQueryData(["/api/screens"], reordered);
      }
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
    },
    onError: (_err, _vars, context) => {
      pageToast({ title: "Failed to save order", variant: "destructive" });
      if (context?.previous) {
        queryClient.setQueryData(["/api/screens"], context.previous);
        setOrderedIds(context.previous.map((s) => s.id));
      } else {
        setOrderedIds(screens.map((s) => s.id));
      }
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEnabled = filter === "all" && view === "cards";
  const dragDisabledReason = filter !== "all"
    ? "Clear the filter to reorder cards."
    : undefined;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(orderedIds, oldIndex, newIndex);
    setOrderedIds(next);
    reorderMutation.mutate(next);
  };

  const moveScreenTo = (screenId: string, position: "start" | "end") => {
    const idx = orderedIds.indexOf(screenId);
    if (idx < 0) return;
    const without = orderedIds.filter((id) => id !== screenId);
    const next = position === "start" ? [screenId, ...without] : [...without, screenId];
    setOrderedIds(next);
    reorderMutation.mutate(next);
  };

  // If the user identity becomes available after first render, re-load the
  // user-scoped preference (handles the case where useAuth resolves async).
  useEffect(() => {
    setView(loadViewPreference(userId));
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(viewStorageKey(userId), view);
    } catch {
      // ignore
    }
  }, [view, userId]);

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
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-card p-0.5" role="group" aria-label="View mode">
            <Button
              type="button"
              size="sm"
              variant={view === "cards" ? "secondary" : "ghost"}
              className="h-8 gap-1.5"
              onClick={() => setView("cards")}
              data-testid="button-view-cards"
              aria-pressed={view === "cards"}
            >
              <LayoutGridIcon className="h-4 w-4" />
              Cards
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              className="h-8 gap-1.5"
              onClick={() => setView("table")}
              data-testid="button-view-table"
              aria-pressed={view === "table"}
            >
              <TableIcon className="h-4 w-4" />
              Table
            </Button>
          </div>
          <CreateScreenDialog profiles={profiles} events={events} clients={clients} />
        </div>
      </div>

      {/* Stats */}
      {!isLoading && screens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter(filter === "online" ? "all" : "online")}
            data-testid="filter-online"
            aria-pressed={filter === "online"}
          >
            <Badge
              variant="secondary"
              className={cn(
                "bg-green-500/10 text-green-600 py-1.5 px-3 hover-elevate cursor-pointer",
                filter === "online" && "ring-2 ring-green-500/40",
              )}
            >
              {onlineCount} Online
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === "offline" ? "all" : "offline")}
            data-testid="filter-offline"
            aria-pressed={filter === "offline"}
          >
            <Badge
              variant="secondary"
              className={cn(
                "bg-red-500/10 text-red-600 py-1.5 px-3 hover-elevate cursor-pointer",
                filter === "offline" && "ring-2 ring-red-500/40",
              )}
            >
              {offlineCount} Offline
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === "unpaired" ? "all" : "unpaired")}
            data-testid="filter-unpaired"
            aria-pressed={filter === "unpaired"}
          >
            <Badge
              variant="secondary"
              className={cn(
                "py-1.5 px-3 hover-elevate cursor-pointer",
                filter === "unpaired" && "ring-2 ring-amber-500/40",
              )}
            >
              {unpairedCount} Unpaired
            </Badge>
          </button>
          {filter !== "all" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setFilter("all")}
              data-testid="button-clear-filter"
            >
              Clear filter
            </Button>
          )}
          {view === "cards" && filter !== "all" && (
            <span className="text-xs text-muted-foreground" data-testid="text-drag-disabled-note">
              Drag-to-reorder is paused while a filter is active.
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        view === "table" ? (
          <div className="rounded-md border bg-card p-4 space-y-3" data-testid="skeleton-screens-table">
            <Skeleton className="h-8 w-full" />
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
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
        )
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
      ) : view === "cards" ? (
        visibleCardScreens.length === 0 ? (
          <Card className="py-8">
            <CardContent className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
              No screens match the current filter.
            </CardContent>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleCardScreens.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-screen-cards">
                {visibleCardScreens.map((screen) => (
                  <SortableScreenCard
                    key={screen.id}
                    screen={screen}
                    profiles={profiles}
                    events={events}
                    layouts={layouts}
                    playlists={playlists}
                    clients={clients}
                    activeOverride={getActiveOverrideForScreen(screen.id)}
                    dragEnabled={dragEnabled}
                    dragDisabledReason={dragDisabledReason}
                    onMoveToStart={() => moveScreenTo(screen.id, "start")}
                    onMoveToEnd={() => moveScreenTo(screen.id, "end")}
                    onDuplicate={() => setDuplicatingScreen(screen)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )
      ) : (
        <>
          <ScreensTable
            screens={filteredScreens}
            layouts={layouts}
            getActiveOverrideForScreen={getActiveOverrideForScreen}
            onOpenScreen={(s) => setEditingScreenId(s.id)}
            onDuplicateScreen={(s) => setDuplicatingScreen(s)}
            userId={userId}
          />
          {/*
            Edit dialog host: mount a single ScreenCard for the screen the
            user clicked in the table. The card itself is visually hidden;
            its Dialog is rendered into a portal so the user sees only the
            edit modal. This avoids mounting the entire card grid in table
            mode while reusing the existing edit form.
          */}
          {editingScreenId && (() => {
            const editingScreen = screens.find((s) => s.id === editingScreenId);
            if (!editingScreen) return null;
            return (
              <div className="hidden" aria-hidden="true">
                <ScreenCard
                  key={`edit-${editingScreen.id}`}
                  screen={editingScreen}
                  profiles={profiles}
                  events={events}
                  layouts={layouts}
                  playlists={playlists}
                  clients={clients}
                  activeOverride={getActiveOverrideForScreen(editingScreen.id)}
                  editOpen={true}
                  onEditOpenChange={(open) => {
                    if (!open) setEditingScreenId(null);
                  }}
                />
              </div>
            );
          })()}
        </>
      )}
      <DuplicateScreenDialog
        screen={duplicatingScreen}
        onClose={() => setDuplicatingScreen(null)}
      />
    </div>
  );
}

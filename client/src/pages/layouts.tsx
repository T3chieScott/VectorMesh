import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
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
  CloudSun,
  Newspaper,
  MapPin,
  Rss,
  Move,
  Palette,
  Sparkles,
  Copy,
  Images,
  Monitor,
  AlertTriangle,
  X,
  Save,
  GripVertical,
  QrCode,
  Upload,
  Timer,
  Shapes,
  ChevronLeft,
  PanelLeftOpen,
  Calendar,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trophy,
  PlaneLanding,
  PlaneTakeoff,
  Plane,
  CloudRain,
  Rocket,
  Globe,
  Radar,
  Lock,
  Unlock,
} from "lucide-react";
import type { LayoutTemplate, Event, LayoutZone, MediaAsset, Client } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ZoneRenderer } from "@/components/zone-renderer";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useSiteContext } from "@/hooks/use-site-context";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 (Landscape)", description: "Standard widescreen" },
  { value: "9:16", label: "9:16 (Portrait)", description: "Vertical displays" },
  { value: "4:3", label: "4:3 (Standard)", description: "Traditional format" },
  { value: "1:1", label: "1:1 (Square)", description: "Square displays" },
  { value: "custom", label: "Custom (Pixels)", description: "Specify exact pixel dimensions" },
];

function ColorPickerWithPalette({
  value,
  onChange,
  palette = [],
  placeholder,
  "data-testid": testId,
}: {
  value: string;
  onChange: (value: string) => void;
  palette?: Array<{ name: string; color: string }>;
  placeholder?: string;
  "data-testid"?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="color"
          className="w-9 h-9 rounded cursor-pointer border border-border p-0.5"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        />
        <Input
          placeholder={placeholder || "#000000"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId ? `${testId}-text` : undefined}
        />
      </div>
      {palette.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {palette.map((c, i) => (
            <button
              key={i}
              type="button"
              className="w-6 h-6 rounded-sm border border-border cursor-pointer transition-transform hover:scale-110"
              style={{ backgroundColor: c.color }}
              onClick={() => onChange(c.color)}
              title={c.name}
              data-testid={testId ? `${testId}-palette-${i}` : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const SIGNAGE_ICONS = [
  { id: "arrow-right", label: "Arrow Right", category: "Directions", svg: '<path d="M5 12h14M12 5l7 7-7 7"/>' },
  { id: "arrow-left", label: "Arrow Left", category: "Directions", svg: '<path d="M19 12H5M12 19l-7-7 7-7"/>' },
  { id: "arrow-up", label: "Arrow Up", category: "Directions", svg: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
  { id: "arrow-down", label: "Arrow Down", category: "Directions", svg: '<path d="M12 5v14M19 12l-7 7-7-7"/>' },
  { id: "arrow-up-right", label: "Arrow Up-Right", category: "Directions", svg: '<path d="M7 17L17 7M17 7H7M17 7v10"/>' },
  { id: "arrow-up-left", label: "Arrow Up-Left", category: "Directions", svg: '<path d="M17 17L7 7M7 7h10M7 7v10"/>' },
  { id: "arrow-down-right", label: "Arrow Down-Right", category: "Directions", svg: '<path d="M7 7L17 17M17 17H7M17 17V7"/>' },
  { id: "arrow-down-left", label: "Arrow Down-Left", category: "Directions", svg: '<path d="M17 7L7 17M7 17h10M7 17V7"/>' },
  { id: "toilet", label: "Toilets", category: "Facilities", svg: '<path d="M8 2v4M16 2v4M6 6h4v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6h2M14 6h4v3c0 1.7-1.3 3-3 3s-3-1.3-3-3V6M7 12v10M17 12v10"/>' },
  { id: "toilet-male", label: "Male WC", category: "Facilities", svg: '<circle cx="12" cy="4" r="2"/><path d="M15 22v-5l2-3v-4a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v4l2 3v5"/>' },
  { id: "toilet-female", label: "Female WC", category: "Facilities", svg: '<circle cx="12" cy="4" r="2"/><path d="M14 9h-4l-1 7h2v6h2v-6h2l-1-7"/>' },
  { id: "accessible", label: "Accessible", category: "Facilities", svg: '<circle cx="11" cy="5" r="2"/><path d="M11 7v5h4l2 5M7 17a4 4 0 0 0 8 0"/>' },
  { id: "fire-exit", label: "Fire Exit", category: "Safety", svg: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>' },
  { id: "fire-extinguisher", label: "Fire Extinguisher", category: "Safety", svg: '<path d="M10 2h4M12 2v4M8 6h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6M9 13v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-7"/>' },
  { id: "warning", label: "Warning", category: "Safety", svg: '<path d="M12 2L2 22h20L12 2zM12 9v5M12 17h.01"/>' },
  { id: "no-entry", label: "No Entry", category: "Safety", svg: '<circle cx="12" cy="12" r="10"/><path d="M4 12h16"/>' },
  { id: "restaurant", label: "Restaurant", category: "Amenities", svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>' },
  { id: "coffee", label: "Coffee", category: "Amenities", svg: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 2v2M10 2v2M14 2v2"/>' },
  { id: "wifi", label: "WiFi", category: "Amenities", svg: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>' },
  { id: "parking", label: "Parking", category: "Amenities", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>' },
  { id: "elevator", label: "Elevator/Lift", category: "Facilities", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16l4-4 4 4M8 8l4 4 4-4"/>' },
  { id: "stairs", label: "Stairs", category: "Facilities", svg: '<path d="M22 5h-5v5h-5v5H7v5H2"/>' },
  { id: "info", label: "Information", category: "General", svg: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
  { id: "medical", label: "Medical/First Aid", category: "Safety", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>' },
  { id: "no-smoking", label: "No Smoking", category: "Safety", svg: '<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14M8 12h4M16 8v4"/>' },
  { id: "smoking", label: "Smoking Area", category: "Amenities", svg: '<path d="M8 17h8M3 17h2M19 13v4M15 13v4M4 17v-3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"/>' },
  { id: "phone", label: "Phone", category: "General", svg: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' },
  { id: "reception", label: "Reception", category: "Facilities", svg: '<path d="M2 18h20M6 18V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10M10 18v-4h4v4"/>' },
  { id: "cloakroom", label: "Cloakroom", category: "Facilities", svg: '<path d="M12 2a4 4 0 0 0-4 4M12 2a4 4 0 0 1 4 4M12 2v3M4 10l8-4 8 4M6 22V10M18 22V10"/>' },
];

function SignageIconPicker({ value, onChange, fillColor }: { value?: string; onChange: (icon: string) => void; fillColor?: string }) {
  const [open, setOpen] = useState(false);
  const categories = [...new Set(SIGNAGE_ICONS.map(i => i.category))];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(!open)}
          data-testid="button-pick-signage-icon"
        >
          {value ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: SIGNAGE_ICONS.find(i => i.id === value)?.svg || '' }} />
          ) : null}
          {value ? SIGNAGE_ICONS.find(i => i.id === value)?.label || "Select Icon" : "Select Signage Icon"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            data-testid="button-clear-signage-icon"
          >
            Clear
          </Button>
        )}
      </div>
      {open && (
        <div className="border border-border rounded-md p-2 bg-popover max-h-[300px] overflow-auto">
          {categories.map(cat => (
            <div key={cat} className="mb-2">
              <div className="text-xs text-muted-foreground font-medium mb-1 px-1">{cat}</div>
              <div className="grid grid-cols-4 gap-1">
                {SIGNAGE_ICONS.filter(i => i.category === cat).map(icon => (
                  <button
                    key={icon.id}
                    type="button"
                    className={`flex flex-col items-center gap-0.5 p-2 rounded cursor-pointer border ${value === icon.id ? 'border-primary bg-primary/10' : 'border-transparent hover-elevate'}`}
                    onClick={() => { onChange(icon.id); setOpen(false); }}
                    title={icon.label}
                    data-testid={`button-icon-${icon.id}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icon.svg }} />
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center">{icon.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PLAYER_VARIABLES = [
  { token: "{{screen_name}}", label: "Screen Name", description: "Name of the display screen", preview: "Lobby Screen 1" },
  { token: "{{room_name}}", label: "Room Name", description: "Room or location name", preview: "Main Hall" },
  { token: "{{event_name}}", label: "Event Name", description: "Current event name", preview: "Tech Summit 2025" },
  { token: "{{client_name}}", label: "Client Name", description: "Client/brand name", preview: "Acme Corp" },
  { token: "{{date}}", label: "Date", description: "Current date", preview: new Date().toLocaleDateString() },
  { token: "{{time}}", label: "Time", description: "Current time", preview: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  { token: "{{day}}", label: "Day of Week", description: "Current day name", preview: new Date().toLocaleDateString('en', { weekday: 'long' }) },
];

function resolvePlayerVariables(text: string): string {
  if (!text) return text;
  let resolved = text;
  for (const v of PLAYER_VARIABLES) {
    resolved = resolved.replaceAll(v.token, v.preview);
  }
  return resolved;
}

function VariableInsertMenu({ onInsert, textareaRef }: { onInsert: (token: string) => void; textareaRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const [open, setOpen] = useState(false);

  const handleInsert = (token: string) => {
    onInsert(token);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        data-testid="button-insert-variable"
      >
        <Code className="h-3 w-3 mr-1" />
        Insert Variable
      </Button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-popover border border-border rounded-md shadow-lg p-1 min-w-[220px]">
          {PLAYER_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              className="w-full text-left px-3 py-2 text-sm rounded-sm hover-elevate cursor-pointer flex items-center justify-between gap-2"
              onClick={() => handleInsert(v.token)}
              data-testid={`button-var-${v.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="font-medium">{v.label}</span>
              <code className="text-xs text-muted-foreground bg-muted px-1 rounded">{v.token}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const layoutFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  clientId: z.string().optional(),
  eventId: z.string().optional(),
  aspectRatio: z.string().default("16:9"),
  customWidth: z.number().optional(),
  customHeight: z.number().optional(),
}).refine((data) => {
  if (data.aspectRatio === "custom") {
    return data.customWidth && data.customWidth > 0 && data.customHeight && data.customHeight > 0;
  }
  return true;
}, { message: "Width and height in pixels are required for custom dimensions", path: ["customWidth"] });

type LayoutFormValues = z.infer<typeof layoutFormSchema>;

// Helper to get aspect ratio dimensions
function getAspectRatioDimensions(aspectRatio: string, customWidth?: number | null, customHeight?: number | null): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9": return { width: 16, height: 9 };
    case "9:16": return { width: 9, height: 16 };
    case "4:3": return { width: 4, height: 3 };
    case "1:1": return { width: 1, height: 1 };
    case "custom":
      return { width: customWidth || 16, height: customHeight || 9 };
    default: return { width: 16, height: 9 };
  }
}

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
  weather: CloudSun,
  news: Newspaper,
  text: Type,
  shader: Sparkles,
  montage: Images,
  qrcode: QrCode,
  countdown: Timer,
  shape: Shapes,
  schedule: Calendar,
  media_player: Monitor,
  football_table: Trophy,
  premier_league_fixtures: Calendar,
  heathrow_arrivals: PlaneLanding,
  heathrow_departures: PlaneTakeoff,
  weather_forecast: CloudRain,
  spacex_launch: Rocket,
  earthquakes: Globe,
  aircraft_radar: Radar,
};

const zoneTypeLabels: Record<string, string> = {
  media: "Media (images/videos)",
  ticker: "Ticker (scrolling text)",
  clock: "Clock widget",
  logo: "Logo widget",
  html: "HTML widget",
  weather: "Weather widget",
  news: "News (RSS feed)",
  text: "Text (static content)",
  shader: "Shader (GPU effects)",
  montage: "Photo Montage (slideshow)",
  qrcode: "QR Code",
  countdown: "Countdown Timer",
  shape: "Shape (lines/circles/etc.)",
  schedule: "Room Schedule",
  media_player: "Media Player (playlist)",
  football_table: "Football Table",
  premier_league_fixtures: "PL Upcoming Fixtures",
  heathrow_arrivals: "Heathrow Arrivals",
  heathrow_departures: "Heathrow Departures",
  weather_forecast: "Weather Forecast",
  spacex_launch: "SpaceX Launch Countdown",
  earthquakes: "Global Earthquakes",
  aircraft_radar: "Aircraft Overhead Radar",
};

const zoneFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["media", "ticker", "clock", "logo", "html", "weather", "news", "text", "shader", "montage", "qrcode", "countdown", "shape", "schedule", "media_player", "football_table", "premier_league_fixtures", "heathrow_arrivals", "heathrow_departures", "weather_forecast", "spacex_launch", "earthquakes", "aircraft_radar"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0.01).max(100),
  height: z.number().min(0.01).max(100),
  zIndex: z.number().min(0).max(100),
  // Media zone configuration
  mediaId: z.string().optional(),
  // Zone styling options
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundVideo: z.string().optional(),
  // Gradient background options
  gradientEnabled: z.boolean().optional(),
  gradientDirection: z.enum(["to-t", "to-b", "to-l", "to-r", "to-tl", "to-tr", "to-bl", "to-br"]).optional(),
  gradientEndColor: z.string().optional(),
  backgroundOpacity: z.number().min(0).max(100).optional(),
  textColor: z.string().optional(),
  textShadowEnabled: z.boolean().optional(),
  textShadowBlur: z.number().min(0).max(20).optional(),
  textShadowColor: z.string().optional(),
  textOutlineWidth: z.number().min(0).max(10).optional(),
  textOutlineColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().min(0).max(20).optional(),
  borderRadius: z.number().min(0).max(50).optional(),
  // Clock widget configuration
  clockTimezone: z.string().optional(),
  clockLabel: z.string().optional(),
  clockStyle: z.enum(["digital", "analog"]).optional(),
  clockMarkerStyle: z.enum(["numbers", "roman", "dots", "lines"]).optional(),
  clockShowSecondHand: z.boolean().optional(),
  clockShowHourMarkers: z.boolean().optional(),
  clockShowDate: z.boolean().optional(),
  clockHandColor: z.string().optional(),
  clockFaceColor: z.string().optional(),
  clockMarkerColor: z.string().optional(),
  clockTimeFontSize: z.number().min(10).max(120).optional(),
  clockLabelFontSize: z.number().min(8).max(72).optional(),
  clockDateFontSize: z.number().min(8).max(72).optional(),
  // Weather widget configuration
  weatherLocation: z.string().optional(),
  weatherLat: z.number().optional(),
  weatherLng: z.number().optional(),
  weatherUnit: z.enum(["celsius", "fahrenheit"]).optional(),
  weatherFontSize: z.number().min(12).max(120).optional(),
  weatherDisplayMode: z.enum(["full", "icon_only", "text_only"]).optional(),
  // News widget configuration
  newsRssUrl: z.string().optional(),
  newsScrollSpeed: z.number().min(1).max(200).optional(),
  newsItemCount: z.number().min(1).max(50).optional(),
  newsTextSize: z.number().min(12).max(72).optional(),
  // Text widget configuration
  textContent: z.string().optional(),
  textFontSize: z.union([z.number().min(12).max(120), z.enum(["small", "medium", "large", "xlarge"])]).optional(),
  // Ticker widget configuration
  tickerScrollSpeed: z.number().min(5).max(60).optional(),
  tickerAnimation: z.enum(["scroll-left", "scroll-up", "typewriter", "fade", "slide-in"]).optional(),
  tickerFontSize: z.number().min(12).max(72).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  textVerticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  // Shader widget configuration
  shaderPreset: z.enum(["gradient", "plasma", "waves", "noise", "aurora", "custom"]).optional(),
  shaderCode: z.string().optional(),
  shaderSpeed: z.number().min(0.1).max(5).optional(),
  shaderVariable: z.number().min(0).max(1).optional(),
  shaderColor1: z.string().optional(),
  shaderColor2: z.string().optional(),
  // Montage widget configuration
  montageMediaIds: z.array(z.string()).optional(),
  montageDuration: z.number().min(1).max(60).optional(),
  montageTransition: z.enum(["fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom-in", "zoom-out", "none"]).optional(),
  montageTransitionDuration: z.number().min(100).max(3000).optional(),
  montageFitMode: z.enum(["contain", "cover"]).optional(),
  montageKenBurns: z.boolean().optional(),
  montageKenBurnsIntensity: z.number().min(1).max(20).optional(),
  montageShuffle: z.boolean().optional(),
  montageAutoPlay: z.boolean().optional(),
  // QR Code widget configuration
  qrContentType: z.enum(["url", "email", "phone", "location", "text", "wifi", "vcard"]).optional(),
  qrContent: z.string().optional(),
  qrForegroundColor: z.string().optional(),
  qrBackgroundColor: z.string().optional(),
  qrErrorCorrection: z.enum(["L", "M", "Q", "H"]).optional(),
  qrWifiSsid: z.string().optional(),
  qrWifiPassword: z.string().optional(),
  qrWifiEncryption: z.enum(["WPA", "WEP", "nopass"]).optional(),
  qrLocationName: z.string().optional(),
  qrLocationLat: z.number().optional(),
  qrLocationLng: z.number().optional(),
  qrVcardName: z.string().optional(),
  qrVcardPhone: z.string().optional(),
  qrVcardEmail: z.string().optional(),
  qrVcardOrg: z.string().optional(),
  qrTransparentBackground: z.boolean().optional(),
  qrLabel: z.string().optional(),
  qrLabelPosition: z.enum(["above", "below"]).optional(),
  qrLabelFontSize: z.union([z.number().min(12).max(120), z.enum(["small", "medium", "large"])]).optional(),
  qrLabelColor: z.string().optional(),
  // Countdown timer fields
  countdownTargetDate: z.string().optional(),
  countdownTitle: z.string().optional(),
  countdownCompletionMessage: z.string().optional(),
  countdownShowDays: z.boolean().optional(),
  countdownShowHours: z.boolean().optional(),
  countdownShowMinutes: z.boolean().optional(),
  countdownShowSeconds: z.boolean().optional(),
  countdownDayLabel: z.string().optional(),
  countdownHourLabel: z.string().optional(),
  countdownMinuteLabel: z.string().optional(),
  countdownSecondLabel: z.string().optional(),
  countdownSeparator: z.enum(["colon", "dash", "space", "none"]).optional(),
  countdownShowLeadingZeros: z.boolean().optional(),
  countdownNumberColor: z.string().optional(),
  countdownLabelColor: z.string().optional(),
  countdownSize: z.number().min(12).max(120).optional(),
  countdownTitleSize: z.number().min(8).max(72).optional(),
  countdownLabelSize: z.number().min(6).max(48).optional(),
  countdownFontFamily: z.enum(["sans", "serif", "mono", "display"]).optional(),
  countdownUnitGap: z.number().optional(),
  countdownTimezone: z.string().optional(),
  countdownCompact: z.boolean().optional(),
  // Shape widget fields
  shapeType: z.enum(["line", "rectangle", "square", "circle", "oval", "triangle", "arch"]).optional(),
  shapeFillColor: z.string().optional(),
  shapeFillEnabled: z.boolean().optional(),
  shapeStrokeColor: z.string().optional(),
  shapeStrokeWidth: z.number().min(0).max(20).optional(),
  shapeStrokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  shapeRotation: z.number().min(0).max(360).optional(),
  shapeCornerRadius: z.number().min(0).max(50).optional(),
  shapeOpacity: z.number().min(0).max(100).optional(),
  shapeLineDirection: z.enum(["horizontal", "vertical", "diagonal-down", "diagonal-up"]).optional(),
  shapeArchSpan: z.number().min(30).max(350).optional(),
  shapeAlignment: z.enum(["left", "center", "right"]).optional(),
  shapeIcon: z.string().optional(),
  shapeIconColor: z.string().optional(),
  shapeIconText: z.string().optional(),
  shapeIconTextPosition: z.enum(["left", "right", "top", "bottom", "center"]).optional(),
  shapeIconTextSize: z.number().min(8).max(200).optional(),
  shapeIconTextColor: z.string().optional(),
  mediaPlayerItems: z.array(z.object({
    id: z.string(),
    mediaAssetId: z.string(),
    duration: z.number().optional(),
  })).optional(),
  mediaPlayerTransition: z.enum(["fade", "slide-left", "slide-right", "none"]).optional(),
  mediaPlayerTransitionDuration: z.number().min(100).max(3000).optional(),
  mediaPlayerLoop: z.boolean().optional(),
  mediaPlayerFitMode: z.enum(["contain", "cover"]).optional(),
  mediaPlayerAutoPlay: z.boolean().optional(),
  mediaPlayerMuted: z.boolean().optional(),
  mediaPlayerShuffle: z.boolean().optional(),
  plFixturesDaysAhead: z.number().min(1).max(90).optional(),
  plFixturesRefreshInterval: z.number().min(60).max(3600).optional(),
  plFixturesFontSize: z.number().min(8).max(48).optional(),
  plFixturesShowBadges: z.boolean().optional(),
  plFixturesShowVenue: z.boolean().optional(),
  plFixturesCompactMode: z.boolean().optional(),
  plFixturesShowCompleted: z.boolean().optional(),
  plFixturesDisplayMode: z.enum(["list", "grid", "paged"]).optional(),
  plFixturesItemsPerPage: z.number().min(1).max(20).optional(),
  plFixturesPageDuration: z.number().min(3).max(30).optional(),
  plFixturesLimit: z.number().min(1).max(50).optional(),
  footballLeague: z.enum(["premier-league"]).optional(),
  footballSeason: z.string().optional(),
  footballRefreshInterval: z.number().min(60).max(3600).optional(),
  footballFontSize: z.number().min(8).max(48).optional(),
  footballShowBadges: z.boolean().optional(),
  footballCompactMode: z.boolean().optional(),
  footballBadgeFormat: z.enum(["png", "svg"]).optional(),
  heathrowTerminal: z.string().optional(),
  heathrowAirline: z.string().optional(),
  heathrowRefreshInterval: z.number().min(30).max(600).optional(),
  heathrowPageInterval: z.number().min(3).max(120).optional(),
  heathrowFontSize: z.number().min(8).max(48).optional(),
  heathrowShowFilters: z.boolean().optional(),
  heathrowColumns: z.array(z.string()).optional(),
  forecastDays: z.number().min(1).max(14).optional(),
  forecastRefreshInterval: z.number().min(60).max(3600).optional(),
  forecastFontSize: z.number().min(8).max(48).optional(),
  forecastShowHourly: z.boolean().optional(),
  forecastShowCondition: z.boolean().optional(),
  forecastShowSunrise: z.boolean().optional(),
  forecastShowHumidity: z.boolean().optional(),
  forecastShowHourlyCondition: z.boolean().optional(),
  spacexRefreshInterval: z.number().min(30).max(3600).optional(),
  spacexFontSize: z.number().min(8).max(48).optional(),
  spacexShowDetails: z.boolean().optional(),
  spacexShowPatch: z.boolean().optional(),
  spacexShowLinks: z.boolean().optional(),
  spacexShowLaunchpad: z.boolean().optional(),
  earthquakeFeed: z.enum(["all_hour", "all_day", "significant_hour", "significant_day"]).optional(),
  earthquakeMinMagnitude: z.number().min(0).max(10).optional(),
  earthquakeLimit: z.number().min(1).max(100).optional(),
  earthquakeRefreshInterval: z.number().min(30).max(3600).optional(),
  earthquakeFontSize: z.number().min(8).max(48).optional(),
  earthquakeShowDepth: z.boolean().optional(),
  earthquakeShowTsunami: z.boolean().optional(),
  earthquakeShowAlert: z.boolean().optional(),
  earthquakeDisplayMode: z.enum(["list", "auto_scroll", "map"]).optional(),
  earthquakeScrollSpeed: z.number().min(5).max(200).optional(),
  earthquakeItemsPerPage: z.number().min(3).max(50).optional(),
  earthquakePageDuration: z.number().min(3).max(60).optional(),
  aircraftRefreshInterval: z.number().min(5).max(300).optional(),
  aircraftFontSize: z.number().min(8).max(72).optional(),
  aircraftBoundsLamin: z.number().min(-90).max(90).optional(),
  aircraftBoundsLomin: z.number().min(-180).max(180).optional(),
  aircraftBoundsLamax: z.number().min(-90).max(90).optional(),
  aircraftBoundsLomax: z.number().min(-180).max(180).optional(),
  aircraftLimit: z.number().min(1).max(500).optional(),
  aircraftShowCallsign: z.boolean().optional(),
  aircraftShowAltitude: z.boolean().optional(),
  aircraftShowSpeed: z.boolean().optional(),
  aircraftShowHeading: z.boolean().optional(),
  aircraftShowCountry: z.boolean().optional(),
  aircraftDisplayMode: z.enum(["radar", "list", "auto_scroll", "map"]).optional(),
  aircraftShowSweep: z.boolean().optional(),
  aircraftScrollSpeed: z.number().min(5).max(200).optional(),
  aircraftItemsPerPage: z.number().min(1).max(50).optional(),
  aircraftPageDuration: z.number().min(1).max(60).optional(),
  scheduleViewMode: z.enum(["hourly", "daily", "agenda"]).optional(),
  scheduleEntries: z.array(z.object({
    id: z.string(),
    title: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    day: z.string().optional(),
    color: z.string().optional(),
    room: z.string().optional(),
  })).optional(),
  scheduleShowCurrentTime: z.boolean().optional(),
  scheduleTimeFormat: z.enum(["12h", "24h"]).optional(),
  scheduleStartHour: z.number().min(0).max(23).optional(),
  scheduleEndHour: z.number().min(1).max(24).optional(),
  scheduleHeaderText: z.string().optional(),
}).refine((data) => {
  // Require lat/lng for weather zones
  if (data.type === "weather") {
    return data.weatherLat !== undefined && data.weatherLng !== undefined;
  }
  return true;
}, {
  message: "Weather widget requires location coordinates. Enter a location and click the pin button to find coordinates.",
  path: ["weatherLat"],
}).refine((data) => {
  // Require RSS URL for news zones
  if (data.type === "news") {
    return data.newsRssUrl && data.newsRssUrl.trim().length > 0;
  }
  return true;
}, {
  message: "News widget requires an RSS feed URL",
  path: ["newsRssUrl"],
}).refine((data) => {
  // Require both start (backgroundColor) and end color when gradient is enabled
  if (data.gradientEnabled) {
    return data.backgroundColor && data.backgroundColor.trim().length > 0 &&
           data.gradientEndColor && data.gradientEndColor.trim().length > 0;
  }
  return true;
}, {
  message: "Gradient requires a background color (start) and end color",
  path: ["gradientEndColor"],
});

type ZoneFormValues = z.infer<typeof zoneFormSchema>;

// Component for picking multiple media items for montage
function MontageMediaPicker({
  selectedIds,
  onSelectionChange,
}: {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const mediaQuery = useSiteFilteredQuery<MediaAsset[]>("/api/media");
  const { data: mediaAssets, isLoading } = useQuery<MediaAsset[]>({
    ...mediaQuery,
  });

  // Filter to only show images
  const imageAssets = mediaAssets?.filter(
    (asset) => asset.mediaType === "image" || asset.mediaType === "gif"
  ) || [];

  const existingAssetIds = new Set(imageAssets.map(a => a.id));
  const cleanIds = selectedIds.filter((i) => i != null && i !== "" && existingAssetIds.has(i));

  useEffect(() => {
    if (imageAssets.length > 0 && selectedIds.length > 0 && cleanIds.length !== selectedIds.length) {
      onSelectionChange(cleanIds);
    }
  }, [imageAssets.length, selectedIds, cleanIds.length]);

  const toggleSelection = (id: string) => {
    if (cleanIds.includes(id)) {
      onSelectionChange(cleanIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...cleanIds, id]);
    }
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newIds = [...cleanIds];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    onSelectionChange(newIds);
  };

  const moveDown = (index: number) => {
    if (index >= cleanIds.length - 1) return;
    const newIds = [...cleanIds];
    [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
    onSelectionChange(newIds);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading media...</div>;
  }

  if (imageAssets.length === 0) {
    return (
      <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
        <Images className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No images in media library</p>
        <p className="text-xs mt-1">Upload images first to use in montage</p>
      </div>
    );
  }

  // Get selected items in order
  const selectedAssets = cleanIds
    .map((id) => imageAssets.find((a) => a.id === id))
    .filter(Boolean) as MediaAsset[];

  return (
    <div className="space-y-3">
      {/* Selected photos in order */}
      {selectedAssets.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Selected Photos ({selectedAssets.length})</Label>
          <div className="flex flex-wrap gap-2">
            {selectedAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="relative group w-16 h-16 rounded-md overflow-hidden border-2 border-primary"
              >
                <img
                  src={`/api/media/${asset.id}/file`}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    className="p-1 bg-white/20 rounded hover:bg-white/40"
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3 w-3 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    className="p-1 bg-white/20 rounded hover:bg-white/40"
                    disabled={index === selectedAssets.length - 1}
                  >
                    <ChevronDown className="h-3 w-3 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSelection(asset.id)}
                    className="p-1 bg-red-500/80 rounded hover:bg-red-600"
                  >
                    <Trash2 className="h-3 w-3 text-white" />
                  </button>
                </div>
                <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs font-medium w-5 h-5 rounded-full flex items-center justify-center">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media library grid */}
      <Label className="text-sm font-medium">Available Photos</Label>
      <ScrollArea className="h-40 border rounded-md p-2">
        <div className="grid grid-cols-5 gap-2">
          {imageAssets.map((asset) => {
            const isSelected = cleanIds.includes(asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => toggleSelection(asset.id)}
                className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-transparent hover:border-muted-foreground/50"
                }`}
                data-testid={`montage-media-${asset.id}`}
              >
                <img
                  src={`/api/media/${asset.id}/file`}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />
                {isSelected && (
                  <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                    <span className="text-xs">
                      {cleanIds.indexOf(asset.id) + 1}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function MediaPlayerItemsPicker({
  items,
  onItemsChange,
}: {
  items: Array<{ id: string; mediaAssetId: string; duration?: number }>;
  onItemsChange: (items: Array<{ id: string; mediaAssetId: string; duration?: number }>) => void;
}) {
  const mediaQuery = useSiteFilteredQuery<MediaAsset[]>("/api/media");
  const { data: mediaAssets, isLoading } = useQuery<MediaAsset[]>({
    ...mediaQuery,
  });

  const allAssets = mediaAssets || [];
  const [showLibrary, setShowLibrary] = useState(false);

  const getAsset = (mediaAssetId: string) => allAssets.find((a) => a.id === mediaAssetId);

  const addItem = (assetId: string) => {
    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mediaAssetId: assetId,
      duration: 10,
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (itemId: string) => {
    onItemsChange(items.filter((i) => i.id !== itemId));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    onItemsChange(newItems);
  };

  const moveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    onItemsChange(newItems);
  };

  const updateDuration = (itemId: string, duration: number) => {
    onItemsChange(items.map((i) => (i.id === itemId ? { ...i, duration } : i)));
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading media...</div>;
  }

  if (allAssets.length === 0) {
    return (
      <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
        <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No media in library</p>
        <p className="text-xs mt-1">Upload images or videos first</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Playlist ({items.length} items)</Label>
          <div className="space-y-1">
            {items.map((item, index) => {
              const asset = getAsset(item.mediaAssetId);
              const isVideo = asset?.mediaType === "video";
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 border rounded-md bg-muted/30"
                  data-testid={`media-player-item-${index}`}
                >
                  <span className="text-xs text-muted-foreground font-medium w-5 text-center">{index + 1}</span>
                  <div className="w-10 h-10 rounded-md overflow-hidden border flex-shrink-0">
                    {asset ? (
                      <img
                        src={`/api/media/${asset.id}/file`}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{asset?.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {isVideo ? "Video" : asset?.mediaType === "gif" ? "GIF" : "Image"}
                    </p>
                  </div>
                  {isVideo ? (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">Plays to end</Badge>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={item.duration || 10}
                        onChange={(e) => updateDuration(item.id, parseInt(e.target.value) || 10)}
                        className="w-16 text-center"
                        data-testid={`input-media-player-duration-${index}`}
                      />
                      <span className="text-xs text-muted-foreground">s</span>
                    </div>
                  )}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      data-testid={`button-media-player-move-up-${index}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveDown(index)}
                      disabled={index === items.length - 1}
                      data-testid={`button-media-player-move-down-${index}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                      data-testid={`button-media-player-remove-${index}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowLibrary(!showLibrary)}
        data-testid="button-add-media-player-item"
      >
        <Plus className="h-3 w-3 mr-1" /> Add Media
      </Button>

      {showLibrary && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Media Library</Label>
          <ScrollArea className="h-40 border rounded-md p-2">
            <div className="grid grid-cols-4 gap-2">
              {allAssets.map((asset) => {
                const isVideo = asset.mediaType === "video";
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => addItem(asset.id)}
                    className="relative aspect-square rounded-md overflow-hidden border-2 border-transparent hover:border-muted-foreground/50 transition-all"
                    data-testid={`media-player-library-${asset.id}`}
                  >
                    <img
                      src={`/api/media/${asset.id}/file`}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    {isVideo && (
                      <div className="absolute bottom-1 right-1">
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">VID</Badge>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function getLayoutPixelDimensions(layout: LayoutTemplate): { width: number; height: number } {
  if (layout.aspectRatio === "custom" && layout.customWidth && layout.customHeight) {
    return { width: layout.customWidth, height: layout.customHeight };
  }
  const dims = getAspectRatioDimensions(layout.aspectRatio);
  const baseWidth = 1920;
  return { width: baseWidth, height: Math.round(baseWidth * dims.height / dims.width) };
}

function ZonePositionFields({ form, layout }: { form: any; layout: LayoutTemplate }) {
  const [usePixels, setUsePixels] = useState(false);
  const layoutPx = getLayoutPixelDimensions(layout);

  const pctToPixel = (pct: number, total: number) => Math.round((pct / 100) * total);
  const pixelToPct = (px: number, total: number) => Math.max(0, Math.min(100, parseFloat(((px / total) * 100).toFixed(4))));

  const fields = [
    { name: "x" as const, label: "X Position", total: layoutPx.width, min: 0, minPx: 0, testId: "zone-x" },
    { name: "y" as const, label: "Y Position", total: layoutPx.height, min: 0, minPx: 0, testId: "zone-y" },
    { name: "width" as const, label: "Width", total: layoutPx.width, min: 0.01, minPx: 1, testId: "zone-width" },
    { name: "height" as const, label: "Height", total: layoutPx.height, min: 0.01, minPx: 1, testId: "zone-height" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Position & Size</span>
        <div className="flex rounded-md border overflow-hidden">
          <button
            type="button"
            className={`px-3 py-1 text-xs font-medium transition-colors ${!usePixels ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            onClick={() => setUsePixels(false)}
            data-testid="toggle-unit-percent"
          >
            %
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs font-medium transition-colors ${usePixels ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            onClick={() => setUsePixels(true)}
            data-testid="toggle-unit-pixel"
          >
            px
          </button>
        </div>
      </div>

      {[fields.slice(0, 2), fields.slice(2, 4)].map((group, gi) => (
        <div key={gi} className="grid grid-cols-2 gap-4">
          {group.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.label} {usePixels ? "(px)" : "(%)"}</FormLabel>
                  <FormControl>
                    {usePixels ? (
                      <div className="space-y-1">
                        <Input
                          type="number"
                          min={f.minPx}
                          max={f.total}
                          value={pctToPixel(field.value, f.total)}
                          onChange={(e) => {
                            const px = Math.max(f.minPx, parseInt(e.target.value) || 0);
                            field.onChange(pixelToPct(px, f.total));
                          }}
                          data-testid={`input-${f.testId}-px`}
                        />
                        <span className="text-xs text-muted-foreground">= {parseFloat(field.value.toFixed(2))}% of {f.total}px</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Slider
                          value={[Math.round(field.value)]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={f.min > 0 ? 1 : 0}
                          max={100}
                          step={1}
                          data-testid={`slider-${f.testId}`}
                        />
                        <span className="text-sm text-muted-foreground">{parseFloat(field.value.toFixed(2))}% ({pctToPixel(field.value, f.total)}px)</span>
                      </div>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ZoneEditorDialog({
  layout,
  zone,
  open,
  onOpenChange,
  onZoneChange,
}: {
  layout: LayoutTemplate;
  zone?: LayoutZone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onZoneChange?: (updatedZone: LayoutZone, isNew: boolean) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!zone;
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const mediaQuery = useSiteFilteredQuery<MediaAsset[]>("/api/media");
  const eventsQuery = useSiteFilteredQuery<Event[]>("/api/events");

  // Fetch media assets for selection
  const { data: mediaAssets } = useQuery<MediaAsset[]>({
    ...mediaQuery,
  });

  // Fetch event palette for colour pickers
  const { data: events } = useQuery<Event[]>({
    ...eventsQuery,
  });
  const eventPalette = useMemo(() => {
    if (!layout.eventId) return [];
    const event = events?.find(e => e.id === layout.eventId);
    return (event?.colorPalette as Array<{ name: string; color: string }>) || [];
  }, [layout.eventId, events]);

  const layoutClientId = useMemo(() => {
    if (!layout.eventId) return "";
    const event = events?.find(e => e.id === layout.eventId);
    return event?.clientId || "";
  }, [layout.eventId, events]);

  const handleUploadComplete = async (result: any) => {
    if (result.successful?.length > 0) {
      const file = result.successful[0];
      const body = file.response?.body;
      const filePath = body?.filePath;

      if (!filePath) {
        console.error("File path not found for file:", file.id);
        toast({ title: "Upload completed but file path not found", variant: "destructive" });
        setIsUploading(false);
        return;
      }

      try {
        const response = await apiRequest("POST", "/api/media", {
          name: file.name,
          originalPath: filePath,
          mediaType: file.type?.startsWith("video/")
            ? "video"
            : file.type === "image/gif"
            ? "gif"
            : "image",
          mimeType: file.type,
          fileSize: file.size,
        });
        const newMedia = await response.json();

        form.setValue("mediaId", newMedia.id);
        queryClient.invalidateQueries({ queryKey: ["/api/media"] });
        toast({ title: "Image uploaded and selected" });
      } catch (e) {
        console.error("Failed to save media record:", e);
        toast({ title: "Failed to save uploaded file", variant: "destructive" });
      }
    }
    setIsUploading(false);
  };

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
      mediaId: "",
      backgroundColor: "",
      backgroundImage: "",
      backgroundVideo: "",
      gradientEnabled: false,
      gradientDirection: "to-b",
      gradientEndColor: "",
      backgroundOpacity: 100,
      textColor: "",
      textShadowEnabled: false,
      textShadowBlur: 2,
      textShadowColor: "#000000",
      textOutlineWidth: 0,
      textOutlineColor: "#000000",
      borderColor: "",
      borderWidth: 0,
      borderRadius: 0,
      clockTimezone: "",
      clockLabel: "",
      clockStyle: "digital",
      clockMarkerStyle: "numbers",
      clockShowSecondHand: true,
      clockShowHourMarkers: true,
      clockShowDate: false,
      clockHandColor: "#ffffff",
      clockFaceColor: "transparent",
      clockMarkerColor: "#ffffff",
      clockTimeFontSize: undefined,
      clockLabelFontSize: undefined,
      clockDateFontSize: undefined,
      weatherLocation: "",
      weatherLat: undefined,
      weatherLng: undefined,
      weatherUnit: "celsius",
      weatherFontSize: 24,
      weatherDisplayMode: "full",
      newsRssUrl: "",
      newsScrollSpeed: 50,
      newsItemCount: 10,
      newsTextSize: 24,
      textContent: "",
      textFontSize: 24,
      textAlign: "center",
      textVerticalAlign: "middle",
      tickerFontSize: 24,
      shaderPreset: "gradient",
      shaderCode: "",
      shaderSpeed: 1,
      shaderVariable: 0.5,
      shaderColor1: "#ff6b6b",
      shaderColor2: "#4ecdc4",
      montageMediaIds: [],
      montageDuration: 5,
      montageTransition: "fade",
      montageTransitionDuration: 1000,
      montageFitMode: "cover",
      montageKenBurns: false,
      montageKenBurnsIntensity: 10,
      montageShuffle: false,
      montageAutoPlay: true,
      qrContentType: "url",
      qrContent: "",
      qrForegroundColor: "#000000",
      qrBackgroundColor: "#ffffff",
      qrErrorCorrection: "M",
      qrWifiSsid: "",
      qrWifiPassword: "",
      qrWifiEncryption: "WPA",
      qrLocationName: "",
      qrLocationLat: undefined,
      qrLocationLng: undefined,
      qrVcardName: "",
      qrVcardPhone: "",
      qrVcardEmail: "",
      qrVcardOrg: "",
      qrTransparentBackground: false,
      qrLabel: "",
      qrLabelPosition: "below",
      qrLabelFontSize: 16,
      qrLabelColor: "#000000",
      // Countdown timer defaults
      countdownTargetDate: "",
      countdownTitle: "",
      countdownCompletionMessage: "Event Started!",
      countdownShowDays: true,
      countdownShowHours: true,
      countdownShowMinutes: true,
      countdownShowSeconds: true,
      countdownDayLabel: "Days",
      countdownHourLabel: "Hours",
      countdownMinuteLabel: "Minutes",
      countdownSecondLabel: "Seconds",
      countdownSeparator: "colon",
      countdownShowLeadingZeros: true,
      countdownNumberColor: "",
      countdownLabelColor: "",
      countdownSize: 24,
      countdownTitleSize: undefined,
      countdownLabelSize: undefined,
      countdownFontFamily: "mono",
      countdownUnitGap: undefined,
      countdownTimezone: "",
      countdownCompact: false,
      shapeType: "rectangle",
      shapeFillColor: "#3b82f6",
      shapeFillEnabled: true,
      shapeStrokeColor: "#ffffff",
      shapeStrokeWidth: 2,
      shapeStrokeStyle: "solid",
      shapeRotation: 0,
      shapeCornerRadius: 0,
      shapeOpacity: 100,
      shapeLineDirection: "horizontal",
      shapeArchSpan: 180,
      shapeAlignment: "center",
      shapeIcon: "",
      shapeIconColor: "",
      shapeIconText: "",
      shapeIconTextPosition: "right",
      shapeIconTextSize: 14,
      shapeIconTextColor: "",
      mediaPlayerItems: [],
      mediaPlayerTransition: "fade",
      mediaPlayerTransitionDuration: 800,
      mediaPlayerLoop: true,
      mediaPlayerFitMode: "contain",
      mediaPlayerAutoPlay: true,
      mediaPlayerMuted: true,
      mediaPlayerShuffle: false,
      plFixturesDaysAhead: 30,
      plFixturesRefreshInterval: 300,
      plFixturesFontSize: 14,
      plFixturesShowBadges: true,
      plFixturesShowVenue: false,
      plFixturesCompactMode: false,
      plFixturesShowCompleted: false,
      plFixturesDisplayMode: "list",
      plFixturesItemsPerPage: 6,
      plFixturesPageDuration: 8,
      plFixturesLimit: 20,
      footballLeague: "premier-league",
      footballSeason: "auto",
      footballRefreshInterval: 300,
      footballFontSize: 14,
      footballShowBadges: true,
      footballCompactMode: false,
      footballBadgeFormat: "png",
      heathrowTerminal: "",
      heathrowAirline: "",
      heathrowRefreshInterval: 120,
      heathrowPageInterval: 10,
      heathrowFontSize: 14,
      heathrowShowFilters: false,
      heathrowColumns: [] as string[],
      forecastDays: 5,
      forecastRefreshInterval: 600,
      forecastFontSize: 14,
      forecastShowHourly: false,
      forecastShowCondition: false,
      forecastShowSunrise: false,
      forecastShowHumidity: false,
      forecastShowHourlyCondition: false,
      spacexRefreshInterval: 60,
      spacexFontSize: 14,
      spacexShowDetails: true,
      spacexShowPatch: true,
      spacexShowLinks: false,
      spacexShowLaunchpad: true,
      earthquakeFeed: "all_hour",
      earthquakeMinMagnitude: 0,
      earthquakeLimit: 50,
      earthquakeRefreshInterval: 60,
      earthquakeFontSize: 14,
      earthquakeShowDepth: true,
      earthquakeShowTsunami: true,
      earthquakeShowAlert: true,
      earthquakeDisplayMode: "list",
      earthquakeScrollSpeed: 30,
      earthquakeItemsPerPage: 8,
      earthquakePageDuration: 8,
      aircraftRefreshInterval: 15,
      aircraftFontSize: 14,
      aircraftBoundsLamin: 51.2,
      aircraftBoundsLomin: -0.9,
      aircraftBoundsLamax: 51.8,
      aircraftBoundsLomax: 0.3,
      aircraftLimit: 100,
      aircraftShowCallsign: true,
      aircraftShowAltitude: true,
      aircraftShowSpeed: true,
      aircraftShowHeading: true,
      aircraftShowCountry: false,
      aircraftDisplayMode: "radar",
      aircraftShowSweep: true,
      aircraftScrollSpeed: 30,
      aircraftItemsPerPage: 8,
      aircraftPageDuration: 8,
      scheduleViewMode: "hourly",
      scheduleEntries: [],
      scheduleShowCurrentTime: true,
      scheduleTimeFormat: "24h",
      scheduleStartHour: 8,
      scheduleEndHour: 18,
      scheduleHeaderText: "",
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
          mediaId: zone.mediaId || "",
          backgroundColor: zone.backgroundColor || "",
          backgroundImage: zone.backgroundImage || "",
          backgroundVideo: zone.backgroundVideo || "",
          gradientEnabled: zone.gradientEnabled || false,
          gradientDirection: zone.gradientDirection || "to-b",
          gradientEndColor: zone.gradientEndColor || "",
          backgroundOpacity: zone.backgroundOpacity ?? 100,
          textColor: zone.textColor || "",
          textShadowEnabled: zone.textShadowEnabled || false,
          textShadowBlur: zone.textShadowBlur ?? 2,
          textShadowColor: zone.textShadowColor || "#000000",
          textOutlineWidth: zone.textOutlineWidth ?? 0,
          textOutlineColor: zone.textOutlineColor || "#000000",
          borderColor: zone.borderColor || "",
          borderWidth: zone.borderWidth || 0,
          borderRadius: zone.borderRadius || 0,
          clockTimezone: zone.clockTimezone || "",
          clockLabel: zone.clockLabel || "",
          clockStyle: zone.clockStyle || "digital",
          clockMarkerStyle: zone.clockMarkerStyle || "numbers",
          clockShowSecondHand: zone.clockShowSecondHand ?? true,
          clockShowHourMarkers: zone.clockShowHourMarkers ?? true,
          clockShowDate: zone.clockShowDate ?? false,
          clockHandColor: zone.clockHandColor || "#ffffff",
          clockFaceColor: zone.clockFaceColor || "transparent",
          clockMarkerColor: zone.clockMarkerColor || "#ffffff",
          clockTimeFontSize: zone.clockTimeFontSize,
          clockLabelFontSize: zone.clockLabelFontSize,
          clockDateFontSize: zone.clockDateFontSize,
          weatherLocation: zone.weatherLocation || "",
          weatherLat: zone.weatherLat,
          weatherLng: zone.weatherLng,
          weatherUnit: zone.weatherUnit || "celsius",
          weatherFontSize: zone.weatherFontSize ?? 24,
          weatherDisplayMode: zone.weatherDisplayMode || "full",
          newsRssUrl: zone.newsRssUrl || "",
          newsScrollSpeed: zone.newsScrollSpeed || 50,
          newsItemCount: zone.newsItemCount || 10,
          newsTextSize: typeof zone.newsTextSize === 'number' ? zone.newsTextSize : 
            (zone.newsTextSize === 'small' ? 14 : zone.newsTextSize === 'large' ? 36 : 24),
          textContent: zone.textContent || "",
          textFontSize: typeof zone.textFontSize === 'number' ? zone.textFontSize :
            (zone.textFontSize === 'small' ? 14 : zone.textFontSize === 'large' ? 36 : zone.textFontSize === 'xlarge' ? 48 : 24),
          textAlign: zone.textAlign || "center",
          textVerticalAlign: zone.textVerticalAlign || "middle",
          tickerFontSize: zone.tickerFontSize ?? 24,
          shaderPreset: zone.shaderPreset || "gradient",
          shaderCode: zone.shaderCode || "",
          shaderSpeed: zone.shaderSpeed || 1,
          shaderVariable: zone.shaderVariable ?? 0.5,
          shaderColor1: zone.shaderColor1 || "#ff6b6b",
          shaderColor2: zone.shaderColor2 || "#4ecdc4",
          montageMediaIds: zone.montageMediaIds || [],
          montageDuration: zone.montageDuration || 5,
          montageTransition: zone.montageTransition || "fade",
          montageTransitionDuration: zone.montageTransitionDuration || 1000,
          montageFitMode: zone.montageFitMode || "cover",
          montageKenBurns: zone.montageKenBurns || false,
          montageKenBurnsIntensity: zone.montageKenBurnsIntensity || 10,
          montageShuffle: zone.montageShuffle || false,
          montageAutoPlay: zone.montageAutoPlay !== false,
          qrContentType: zone.qrContentType || "url",
          qrContent: zone.qrContent || "",
          qrForegroundColor: zone.qrForegroundColor || "#000000",
          qrBackgroundColor: zone.qrBackgroundColor || "#ffffff",
          qrErrorCorrection: zone.qrErrorCorrection || "M",
          qrWifiSsid: zone.qrWifiSsid || "",
          qrWifiPassword: zone.qrWifiPassword || "",
          qrWifiEncryption: zone.qrWifiEncryption || "WPA",
          qrLocationName: zone.qrLocationName || "",
          qrLocationLat: zone.qrLocationLat,
          qrLocationLng: zone.qrLocationLng,
          qrVcardName: zone.qrVcardName || "",
          qrVcardPhone: zone.qrVcardPhone || "",
          qrVcardEmail: zone.qrVcardEmail || "",
          qrVcardOrg: zone.qrVcardOrg || "",
          qrTransparentBackground: zone.qrTransparentBackground || false,
          qrLabel: zone.qrLabel || "",
          qrLabelPosition: zone.qrLabelPosition || "below",
          qrLabelFontSize: typeof zone.qrLabelFontSize === 'number' ? zone.qrLabelFontSize :
            (zone.qrLabelFontSize === 'small' ? 12 : zone.qrLabelFontSize === 'large' ? 24 : 16),
          qrLabelColor: zone.qrLabelColor || "#000000",
          // Countdown timer fields
          countdownTargetDate: zone.countdownTargetDate || "",
          countdownTitle: zone.countdownTitle || "",
          countdownCompletionMessage: zone.countdownCompletionMessage || "Event Started!",
          countdownShowDays: zone.countdownShowDays ?? true,
          countdownShowHours: zone.countdownShowHours ?? true,
          countdownShowMinutes: zone.countdownShowMinutes ?? true,
          countdownShowSeconds: zone.countdownShowSeconds ?? true,
          countdownDayLabel: zone.countdownDayLabel || "Days",
          countdownHourLabel: zone.countdownHourLabel || "Hours",
          countdownMinuteLabel: zone.countdownMinuteLabel || "Minutes",
          countdownSecondLabel: zone.countdownSecondLabel || "Seconds",
          countdownSeparator: zone.countdownSeparator || "colon",
          countdownShowLeadingZeros: zone.countdownShowLeadingZeros ?? true,
          countdownNumberColor: zone.countdownNumberColor || "",
          countdownLabelColor: zone.countdownLabelColor || "",
          countdownSize: typeof zone.countdownSize === 'number' ? zone.countdownSize : (zone.countdownSize === 'small' ? 16 : zone.countdownSize === 'large' ? 32 : zone.countdownSize === 'xlarge' ? 48 : 24),
          countdownTitleSize: typeof zone.countdownTitleSize === 'number' ? zone.countdownTitleSize : 
            (zone.countdownTitleSize === 'small' ? 12 : zone.countdownTitleSize === 'medium' ? 16 : zone.countdownTitleSize === 'large' ? 24 : zone.countdownTitleSize === 'xlarge' ? 32 : undefined),
          countdownLabelSize: zone.countdownLabelSize,
          countdownFontFamily: zone.countdownFontFamily || "mono",
          countdownUnitGap: zone.countdownUnitGap,
          countdownTimezone: zone.countdownTimezone || "",
          countdownCompact: zone.countdownCompact ?? false,
          shapeType: zone.shapeType || "rectangle",
          shapeFillColor: zone.shapeFillColor || "#3b82f6",
          shapeFillEnabled: zone.shapeFillEnabled ?? true,
          shapeStrokeColor: zone.shapeStrokeColor || "#ffffff",
          shapeStrokeWidth: zone.shapeStrokeWidth ?? 2,
          shapeStrokeStyle: zone.shapeStrokeStyle || "solid",
          shapeRotation: zone.shapeRotation ?? 0,
          shapeCornerRadius: zone.shapeCornerRadius ?? 0,
          shapeOpacity: zone.shapeOpacity ?? 100,
          shapeLineDirection: zone.shapeLineDirection || "horizontal",
          shapeArchSpan: zone.shapeArchSpan ?? 180,
          shapeAlignment: zone.shapeAlignment || "center",
          shapeIcon: zone.shapeIcon || "",
          shapeIconColor: zone.shapeIconColor || "",
          shapeIconText: zone.shapeIconText || "",
          shapeIconTextPosition: zone.shapeIconTextPosition || "right",
          shapeIconTextSize: zone.shapeIconTextSize ?? 14,
          shapeIconTextColor: zone.shapeIconTextColor || "",
          mediaPlayerItems: zone.mediaPlayerItems || [],
          mediaPlayerTransition: zone.mediaPlayerTransition || "fade",
          mediaPlayerTransitionDuration: zone.mediaPlayerTransitionDuration ?? 800,
          mediaPlayerLoop: zone.mediaPlayerLoop ?? true,
          mediaPlayerFitMode: zone.mediaPlayerFitMode || "contain",
          mediaPlayerAutoPlay: zone.mediaPlayerAutoPlay ?? true,
          mediaPlayerMuted: zone.mediaPlayerMuted ?? true,
          mediaPlayerShuffle: zone.mediaPlayerShuffle ?? false,
          plFixturesDaysAhead: zone.plFixturesDaysAhead ?? 30,
          plFixturesRefreshInterval: zone.plFixturesRefreshInterval ?? 300,
          plFixturesFontSize: zone.plFixturesFontSize ?? 14,
          plFixturesShowBadges: zone.plFixturesShowBadges ?? true,
          plFixturesShowVenue: zone.plFixturesShowVenue ?? false,
          plFixturesCompactMode: zone.plFixturesCompactMode ?? false,
          plFixturesShowCompleted: zone.plFixturesShowCompleted ?? false,
          plFixturesDisplayMode: zone.plFixturesDisplayMode || "list",
          plFixturesItemsPerPage: zone.plFixturesItemsPerPage ?? 6,
          plFixturesPageDuration: zone.plFixturesPageDuration ?? 8,
          plFixturesLimit: zone.plFixturesLimit ?? 20,
          footballLeague: zone.footballLeague || "premier-league",
          footballSeason: zone.footballSeason || "auto",
          footballRefreshInterval: zone.footballRefreshInterval ?? 300,
          footballFontSize: zone.footballFontSize ?? 14,
          footballShowBadges: zone.footballShowBadges ?? true,
          footballCompactMode: zone.footballCompactMode ?? false,
          footballBadgeFormat: zone.footballBadgeFormat || "png",
          heathrowTerminal: zone.heathrowTerminal || "",
          heathrowAirline: zone.heathrowAirline || "",
          heathrowRefreshInterval: zone.heathrowRefreshInterval ?? 120,
          heathrowPageInterval: zone.heathrowPageInterval ?? 10,
          heathrowFontSize: zone.heathrowFontSize ?? 14,
          heathrowShowFilters: zone.heathrowShowFilters ?? false,
          heathrowColumns: zone.heathrowColumns || [],
          forecastDays: zone.forecastDays ?? 5,
          forecastRefreshInterval: zone.forecastRefreshInterval ?? 600,
          forecastFontSize: zone.forecastFontSize ?? 14,
          forecastShowHourly: zone.forecastShowHourly ?? false,
          forecastShowCondition: zone.forecastShowCondition ?? false,
          forecastShowSunrise: zone.forecastShowSunrise ?? false,
          forecastShowHumidity: zone.forecastShowHumidity ?? false,
          forecastShowHourlyCondition: zone.forecastShowHourlyCondition ?? false,
          spacexRefreshInterval: zone.spacexRefreshInterval ?? 60,
          spacexFontSize: zone.spacexFontSize ?? 14,
          spacexShowDetails: zone.spacexShowDetails ?? true,
          spacexShowPatch: zone.spacexShowPatch ?? true,
          spacexShowLinks: zone.spacexShowLinks ?? false,
          spacexShowLaunchpad: zone.spacexShowLaunchpad ?? true,
          earthquakeFeed: zone.earthquakeFeed || "all_hour",
          earthquakeMinMagnitude: zone.earthquakeMinMagnitude ?? 0,
          earthquakeLimit: zone.earthquakeLimit ?? 50,
          earthquakeRefreshInterval: zone.earthquakeRefreshInterval ?? 60,
          earthquakeFontSize: zone.earthquakeFontSize ?? 14,
          earthquakeShowDepth: zone.earthquakeShowDepth ?? true,
          earthquakeShowTsunami: zone.earthquakeShowTsunami ?? true,
          earthquakeShowAlert: zone.earthquakeShowAlert ?? true,
          earthquakeDisplayMode: zone.earthquakeDisplayMode || "list",
          earthquakeScrollSpeed: zone.earthquakeScrollSpeed ?? 30,
          earthquakeItemsPerPage: zone.earthquakeItemsPerPage ?? 8,
          earthquakePageDuration: zone.earthquakePageDuration ?? 8,
          aircraftRefreshInterval: zone.aircraftRefreshInterval ?? 15,
          aircraftFontSize: zone.aircraftFontSize ?? 14,
          aircraftBoundsLamin: zone.aircraftBoundsLamin ?? 51.2,
          aircraftBoundsLomin: zone.aircraftBoundsLomin ?? -0.9,
          aircraftBoundsLamax: zone.aircraftBoundsLamax ?? 51.8,
          aircraftBoundsLomax: zone.aircraftBoundsLomax ?? 0.3,
          aircraftLimit: zone.aircraftLimit ?? 100,
          aircraftShowCallsign: zone.aircraftShowCallsign ?? true,
          aircraftShowAltitude: zone.aircraftShowAltitude ?? true,
          aircraftShowSpeed: zone.aircraftShowSpeed ?? true,
          aircraftShowHeading: zone.aircraftShowHeading ?? true,
          aircraftShowCountry: zone.aircraftShowCountry ?? false,
          aircraftDisplayMode: zone.aircraftDisplayMode || "radar",
          aircraftShowSweep: zone.aircraftShowSweep ?? true,
          aircraftScrollSpeed: zone.aircraftScrollSpeed ?? 30,
          aircraftItemsPerPage: zone.aircraftItemsPerPage ?? 8,
          aircraftPageDuration: zone.aircraftPageDuration ?? 8,
          scheduleViewMode: zone.scheduleViewMode || "hourly",
          scheduleEntries: zone.scheduleEntries || [],
          scheduleShowCurrentTime: zone.scheduleShowCurrentTime ?? true,
          scheduleTimeFormat: zone.scheduleTimeFormat || "24h",
          scheduleStartHour: zone.scheduleStartHour ?? 8,
          scheduleEndHour: zone.scheduleEndHour ?? 18,
          scheduleHeaderText: zone.scheduleHeaderText || "",
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
          mediaId: "",
          backgroundColor: "",
          backgroundImage: "",
          backgroundVideo: "",
          gradientEnabled: false,
          gradientDirection: "to-b",
          gradientEndColor: "",
          backgroundOpacity: 100,
          textColor: "",
          textShadowEnabled: false,
          textShadowBlur: 2,
          textShadowColor: "#000000",
          textOutlineWidth: 0,
          textOutlineColor: "#000000",
          borderColor: "",
          borderWidth: 0,
          borderRadius: 0,
          clockTimezone: "",
          clockLabel: "",
          clockStyle: "digital",
          clockMarkerStyle: "numbers",
          clockShowSecondHand: true,
          clockShowHourMarkers: true,
          clockShowDate: false,
          clockHandColor: "#ffffff",
          clockFaceColor: "transparent",
          clockMarkerColor: "#ffffff",
          clockTimeFontSize: undefined,
          clockLabelFontSize: undefined,
          clockDateFontSize: undefined,
          weatherLocation: "",
          weatherLat: undefined,
          weatherLng: undefined,
          weatherUnit: "celsius",
          weatherFontSize: 24,
          weatherDisplayMode: "full",
          newsRssUrl: "",
          newsScrollSpeed: 50,
          newsItemCount: 10,
          newsTextSize: 24,
          textContent: "",
          textFontSize: 24,
          textAlign: "center",
          textVerticalAlign: "middle",
          tickerFontSize: 24,
          shaderPreset: "gradient",
          shaderCode: "",
          shaderSpeed: 1,
          shaderVariable: 0.5,
          shaderColor1: "#ff6b6b",
          shaderColor2: "#4ecdc4",
          montageMediaIds: [],
          montageDuration: 5,
          montageTransition: "fade",
          montageTransitionDuration: 1000,
          montageFitMode: "cover",
          montageKenBurns: false,
          montageKenBurnsIntensity: 10,
          montageShuffle: false,
          montageAutoPlay: true,
          qrContentType: "url",
          qrContent: "",
          qrForegroundColor: "#000000",
          qrBackgroundColor: "#ffffff",
          qrErrorCorrection: "M",
          qrWifiSsid: "",
          qrWifiPassword: "",
          qrWifiEncryption: "WPA",
          qrLocationName: "",
          qrLocationLat: undefined,
          qrLocationLng: undefined,
          qrVcardName: "",
          qrVcardPhone: "",
          qrVcardEmail: "",
          qrVcardOrg: "",
          qrTransparentBackground: false,
          qrLabel: "",
          qrLabelPosition: "below",
          qrLabelFontSize: 16,
          qrLabelColor: "#000000",
          // Countdown timer defaults
          countdownTargetDate: "",
          countdownTitle: "",
          countdownCompletionMessage: "Event Started!",
          countdownShowDays: true,
          countdownShowHours: true,
          countdownShowMinutes: true,
          countdownShowSeconds: true,
          countdownDayLabel: "Days",
          countdownHourLabel: "Hours",
          countdownMinuteLabel: "Minutes",
          countdownSecondLabel: "Seconds",
          countdownSeparator: "colon",
          countdownShowLeadingZeros: true,
          countdownNumberColor: "",
          countdownLabelColor: "",
          countdownSize: 24,
          countdownTitleSize: undefined,
          countdownLabelSize: undefined,
          countdownFontFamily: "mono",
          countdownUnitGap: undefined,
          countdownTimezone: "",
          countdownCompact: false,
          shapeType: "rectangle",
          shapeFillColor: "#3b82f6",
          shapeFillEnabled: true,
          shapeStrokeColor: "#ffffff",
          shapeStrokeWidth: 2,
          shapeStrokeStyle: "solid",
          shapeRotation: 0,
          shapeCornerRadius: 0,
          shapeOpacity: 100,
          shapeLineDirection: "horizontal",
          shapeArchSpan: 180,
          shapeAlignment: "center",
          shapeIcon: "",
          shapeIconColor: "",
          shapeIconText: "",
          shapeIconTextPosition: "right",
          shapeIconTextSize: 14,
          shapeIconTextColor: "",
          mediaPlayerItems: [],
          mediaPlayerTransition: "fade",
          mediaPlayerTransitionDuration: 800,
          mediaPlayerLoop: true,
          mediaPlayerFitMode: "contain",
          mediaPlayerAutoPlay: true,
          mediaPlayerMuted: true,
          mediaPlayerShuffle: false,
          plFixturesDaysAhead: 30,
          plFixturesRefreshInterval: 300,
          plFixturesFontSize: 14,
          plFixturesShowBadges: true,
          plFixturesShowVenue: false,
          plFixturesCompactMode: false,
          plFixturesShowCompleted: false,
          plFixturesDisplayMode: "list",
          plFixturesItemsPerPage: 6,
          plFixturesPageDuration: 8,
          plFixturesLimit: 20,
          footballLeague: "premier-league",
          footballSeason: "auto",
          footballRefreshInterval: 300,
          footballFontSize: 14,
          footballShowBadges: true,
          footballCompactMode: false,
          footballBadgeFormat: "png",
          heathrowTerminal: "",
          heathrowAirline: "",
          heathrowRefreshInterval: 120,
          heathrowPageInterval: 10,
          heathrowFontSize: 14,
          heathrowShowFilters: false,
          heathrowColumns: [] as string[],
          forecastDays: 5,
          forecastRefreshInterval: 600,
          forecastFontSize: 14,
          forecastShowHourly: false,
          forecastShowCondition: false,
          forecastShowSunrise: false,
          forecastShowHumidity: false,
          forecastShowHourlyCondition: false,
          spacexRefreshInterval: 60,
          spacexFontSize: 14,
          spacexShowDetails: true,
          spacexShowPatch: true,
          spacexShowLinks: false,
          spacexShowLaunchpad: true,
          earthquakeFeed: "all_hour",
          earthquakeMinMagnitude: 0,
          earthquakeLimit: 50,
          earthquakeRefreshInterval: 60,
          earthquakeFontSize: 14,
          earthquakeShowDepth: true,
          earthquakeShowTsunami: true,
          earthquakeShowAlert: true,
          earthquakeDisplayMode: "list",
          earthquakeScrollSpeed: 30,
          earthquakeItemsPerPage: 8,
          earthquakePageDuration: 8,
          aircraftRefreshInterval: 15,
          aircraftFontSize: 14,
          aircraftBoundsLamin: 51.2,
          aircraftBoundsLomin: -0.9,
          aircraftBoundsLamax: 51.8,
          aircraftBoundsLomax: 0.3,
          aircraftLimit: 100,
          aircraftShowCallsign: true,
          aircraftShowAltitude: true,
          aircraftShowSpeed: true,
          aircraftShowHeading: true,
          aircraftShowCountry: false,
          aircraftDisplayMode: "radar",
          aircraftShowSweep: true,
          aircraftScrollSpeed: 30,
          aircraftItemsPerPage: 8,
          aircraftPageDuration: 8,
          scheduleViewMode: "hourly",
          scheduleEntries: [],
          scheduleShowCurrentTime: true,
          scheduleTimeFormat: "24h",
          scheduleStartHour: 8,
          scheduleEndHour: 18,
          scheduleHeaderText: "",
        });
      }
    }
  }, [open, zone, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: ZoneFormValues) => {
      // If onZoneChange callback is provided, use draft state instead of saving directly
      if (onZoneChange) {
        // Calculate highest z-index for new zones
        const existingZones = (layout.zones as LayoutZone[]) || [];
        const maxZIndex = existingZones.length > 0 
          ? Math.max(...existingZones.map(z => z.zIndex || 0)) 
          : 0;
        const updatedZone: LayoutZone = isEditing
          ? { ...data, id: zone.id }
          : { ...data, id: `zone-${Date.now()}`, zIndex: maxZIndex + 1 };
        onZoneChange(updatedZone, !isEditing);
        return; // Don't save to server - handled by parent component
      }

      // Fallback: save directly to server (used by LayoutCard)
      const existingZones = (layout.zones as LayoutZone[]) || [];
      let updatedZones: LayoutZone[];

      if (isEditing) {
        updatedZones = existingZones.map((z) =>
          z.id === zone.id ? { ...data, id: zone.id } : z
        );
      } else {
        // Calculate highest z-index and place new zone on top
        const maxZIndex = existingZones.length > 0 
          ? Math.max(...existingZones.map(z => z.zIndex || 0)) 
          : 0;
        const newZone: LayoutZone = {
          ...data,
          id: `zone-${Date.now()}`,
          zIndex: maxZIndex + 1,
        };
        // Prepend new zone to place it at top of list
        updatedZones = [newZone, ...existingZones];
      }

      return apiRequest("PATCH", `/api/layouts/${layout.id}`, {
        zones: updatedZones,
      });
    },
    onSuccess: () => {
      if (!onZoneChange) {
        queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      }
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

            {/* Zone Styling Section */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Palette className="h-4 w-4" />
                Zone Styling
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Background Color</FormLabel>
                      <FormControl>
                        <ColorPickerWithPalette
                          value={field.value || "#000000"}
                          onChange={field.onChange}
                          palette={eventPalette}
                          placeholder="#000000 or transparent"
                          data-testid="input-bg-color"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="textColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text Color</FormLabel>
                      <FormControl>
                        <ColorPickerWithPalette
                          value={field.value || "#ffffff"}
                          onChange={field.onChange}
                          palette={eventPalette}
                          placeholder="#ffffff"
                          data-testid="input-text-color"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Text Effects */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground">Text Effects</h4>
                
                {/* Text Shadow */}
                <FormField
                  control={form.control}
                  name="textShadowEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value || false}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                          data-testid="checkbox-text-shadow"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Enable Text Drop Shadow</FormLabel>
                    </FormItem>
                  )}
                />

                {form.watch("textShadowEnabled") && (
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <FormField
                      control={form.control}
                      name="textShadowBlur"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shadow Blur ({field.value ?? 2}px)</FormLabel>
                          <FormControl>
                            <Input 
                              type="range" 
                              min={0}
                              max={20}
                              step={1}
                              value={field.value ?? 2}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              className="cursor-pointer"
                              data-testid="input-text-shadow-blur"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="textShadowColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shadow Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#000000"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="#000000"
                              data-testid="input-text-shadow-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Text Outline */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="textOutlineWidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Outline Width ({field.value ?? 0}px)</FormLabel>
                        <FormControl>
                          <Input 
                            type="range" 
                            min={0}
                            max={10}
                            step={1}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            className="cursor-pointer"
                            data-testid="input-text-outline-width"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="textOutlineColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Outline Color</FormLabel>
                        <FormControl>
                          <ColorPickerWithPalette
                            value={field.value || "#000000"}
                            onChange={field.onChange}
                            palette={eventPalette}
                            placeholder="#000000"
                            data-testid="input-text-outline-color"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Gradient Options */}
              <div className="space-y-3 border-t pt-4">
                <FormField
                  control={form.control}
                  name="gradientEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value || false}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                          data-testid="checkbox-gradient-enabled"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Enable Gradient Background</FormLabel>
                    </FormItem>
                  )}
                />

                {form.watch("gradientEnabled") && (
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <FormField
                      control={form.control}
                      name="gradientDirection"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Direction</FormLabel>
                          <Select
                            value={field.value || "to-b"}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-gradient-direction">
                                <SelectValue placeholder="Direction" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="to-t">To Top</SelectItem>
                              <SelectItem value="to-b">To Bottom</SelectItem>
                              <SelectItem value="to-l">To Left</SelectItem>
                              <SelectItem value="to-r">To Right</SelectItem>
                              <SelectItem value="to-tl">To Top Left</SelectItem>
                              <SelectItem value="to-tr">To Top Right</SelectItem>
                              <SelectItem value="to-bl">To Bottom Left</SelectItem>
                              <SelectItem value="to-br">To Bottom Right</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="gradientEndColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#000000"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="#000000"
                              data-testid="input-gradient-end-color"
                            />
                          </FormControl>
                          <FormDescription>Start color is the Background Color above</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="backgroundOpacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background Opacity ({field.value ?? 100}%)</FormLabel>
                    <FormControl>
                      <Input 
                        type="range" 
                        min={0}
                        max={100}
                        step={5}
                        value={field.value ?? 100}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        className="cursor-pointer"
                        data-testid="input-bg-opacity"
                      />
                    </FormControl>
                    <FormDescription>Set the transparency of the background (0 = transparent, 100 = solid)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="backgroundImage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background Image URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://... or leave empty" 
                        {...field}
                        value={field.value || ""}
                        data-testid="input-bg-image"
                      />
                    </FormControl>
                    <FormDescription>Enter an image URL to use as background</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="backgroundVideo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background Video URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://... or leave empty" 
                        {...field}
                        value={field.value || ""}
                        data-testid="input-bg-video"
                      />
                    </FormControl>
                    <FormDescription>Enter a video URL for animated backgrounds</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="borderColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Border Color</FormLabel>
                      <FormControl>
                        <ColorPickerWithPalette
                          value={field.value || "#ffffff"}
                          onChange={field.onChange}
                          palette={eventPalette}
                          placeholder="#fff"
                          data-testid="input-border-color"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="borderWidth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Border Width (px)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          max={20}
                          placeholder="0"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-border-width"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="borderRadius"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Border Radius (px)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          max={50}
                          placeholder="0"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-border-radius"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Media Zone Configuration */}
            {form.watch("type") === "media" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Image className="h-4 w-4" />
                  Media Settings
                </div>
                
                <FormField
                  control={form.control}
                  name="mediaId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select or Upload Media</FormLabel>
                      <div className="flex gap-2">
                        <Select
                          value={field.value || "__none__"}
                          onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                        >
                          <FormControl>
                            <SelectTrigger className="flex-1" data-testid="select-media-asset">
                              <SelectValue placeholder="Choose media..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {mediaAssets?.filter(a => a.mediaType === "image" || a.mediaType === "gif" || a.mediaType === "video").map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.name}{asset.mediaType === "video" ? " (Video)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <ObjectUploader
                          maxNumberOfFiles={1}
                          maxFileSize={104857600}
                          clientId={layoutClientId}
                          onComplete={handleUploadComplete}
                          onError={() => {
                            setIsUploading(false);
                            toast({ title: "Upload failed", variant: "destructive" });
                          }}
                          buttonClassName={isUploading ? "opacity-50 pointer-events-none" : ""}
                          buttonTestId="button-upload-media"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {isUploading ? "Uploading..." : "Upload"}
                        </ObjectUploader>
                      </div>
                      <FormDescription>
                        Select an existing image/video or upload a new one
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("mediaId") && (
                  <div className="mt-2 p-2 bg-background rounded border">
                    <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                    <div className="aspect-video bg-muted rounded overflow-hidden">
                      {(() => {
                        const mid = form.watch("mediaId");
                        if (!mid) return null;
                        const selectedAsset = mediaAssets?.find(a => a.id === mid);
                        const url = `/api/media/${mid}/file`;
                        if (selectedAsset?.mediaType === "video") {
                          return <video src={url} className="w-full h-full object-contain" autoPlay loop muted playsInline />;
                        }
                        return <img src={url} alt="Selected media" className="w-full h-full object-contain" />;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Clock Widget Configuration */}
            {form.watch("type") === "clock" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Clock Widget Settings
                </div>

                {/* Clock Style */}
                <FormField
                  control={form.control}
                  name="clockStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clock Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "digital"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-clock-style">
                            <SelectValue placeholder="Select style" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="digital">Digital</SelectItem>
                          <SelectItem value="analog">Analog (Round)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Analog Clock Options */}
                {form.watch("clockStyle") === "analog" && (
                  <div className="space-y-4 pl-4 border-l-2 border-muted">
                    <FormField
                      control={form.control}
                      name="clockMarkerStyle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hour Marker Style</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "numbers"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-clock-marker-style">
                                <SelectValue placeholder="Select marker style" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="numbers">Numbers (1-12)</SelectItem>
                              <SelectItem value="roman">Roman Numerals (I-XII)</SelectItem>
                              <SelectItem value="dots">Dots</SelectItem>
                              <SelectItem value="lines">Lines</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-wrap gap-4">
                      <FormField
                        control={form.control}
                        name="clockShowSecondHand"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-clock-second-hand"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Show Second Hand</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="clockShowHourMarkers"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-clock-hour-markers"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Show Hour Markers</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Colors for analog clock */}
                    <div className="grid grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name="clockHandColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Hand Color</FormLabel>
                            <FormControl>
                              <ColorPickerWithPalette
                                value={field.value || "#ffffff"}
                                onChange={field.onChange}
                                palette={eventPalette}
                                placeholder="#ffffff"
                                data-testid="input-clock-hand-color"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="clockFaceColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Face Color</FormLabel>
                            <FormControl>
                              <ColorPickerWithPalette
                                value={field.value === "transparent" ? "#000000" : (field.value || "#000000")}
                                onChange={field.onChange}
                                palette={eventPalette}
                                placeholder="#000000"
                                data-testid="input-clock-face-color"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="clockMarkerColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Marker Color</FormLabel>
                            <FormControl>
                              <ColorPickerWithPalette
                                value={field.value || "#ffffff"}
                                onChange={field.onChange}
                                palette={eventPalette}
                                placeholder="#ffffff"
                                data-testid="input-clock-marker-color"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Show Date toggle */}
                <FormField
                  control={form.control}
                  name="clockShowDate"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-clock-show-date"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show Date</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clockTimezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(val === "local" ? "" : val)} 
                        value={field.value || "local"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-clock-timezone">
                            <SelectValue placeholder="Local time (device timezone)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="local">Local time (device timezone)</SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                          <SelectItem value="Europe/Paris">Paris (CET/CEST)</SelectItem>
                          <SelectItem value="Europe/Berlin">Berlin (CET/CEST)</SelectItem>
                          <SelectItem value="Europe/Amsterdam">Amsterdam (CET/CEST)</SelectItem>
                          <SelectItem value="Europe/Madrid">Madrid (CET/CEST)</SelectItem>
                          <SelectItem value="Europe/Rome">Rome (CET/CEST)</SelectItem>
                          <SelectItem value="Europe/Moscow">Moscow (MSK)</SelectItem>
                          <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                          <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                          <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                          <SelectItem value="Asia/Hong_Kong">Hong Kong (HKT)</SelectItem>
                          <SelectItem value="Asia/Shanghai">Shanghai (CST)</SelectItem>
                          <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                          <SelectItem value="Australia/Sydney">Sydney (AEST/AEDT)</SelectItem>
                          <SelectItem value="Australia/Perth">Perth (AWST)</SelectItem>
                          <SelectItem value="Pacific/Auckland">Auckland (NZST/NZDT)</SelectItem>
                          <SelectItem value="America/New_York">New York (EST/EDT)</SelectItem>
                          <SelectItem value="America/Chicago">Chicago (CST/CDT)</SelectItem>
                          <SelectItem value="America/Denver">Denver (MST/MDT)</SelectItem>
                          <SelectItem value="America/Los_Angeles">Los Angeles (PST/PDT)</SelectItem>
                          <SelectItem value="America/Toronto">Toronto (EST/EDT)</SelectItem>
                          <SelectItem value="America/Vancouver">Vancouver (PST/PDT)</SelectItem>
                          <SelectItem value="America/Mexico_City">Mexico City (CST)</SelectItem>
                          <SelectItem value="America/Sao_Paulo">São Paulo (BRT)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clockLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Label (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., New York, London, Tokyo" 
                          {...field} 
                          data-testid="input-clock-label" 
                        />
                      </FormControl>
                      <FormDescription>
                        Shows a location name above the clock
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clockTimeFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time Display Size</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[field.value ?? 32]}
                            onValueChange={([val]) => field.onChange(val)}
                            min={10}
                            max={120}
                            step={2}
                            className="flex-1"
                            data-testid="slider-clock-time-font-size"
                          />
                          <span className="text-sm text-muted-foreground w-16">
                            {field.value ?? "auto"}
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>Font size for the time display</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clockLabelFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label Size</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[field.value ?? 14]}
                            onValueChange={([val]) => field.onChange(val)}
                            min={8}
                            max={72}
                            step={2}
                            className="flex-1"
                            data-testid="slider-clock-label-font-size"
                          />
                          <span className="text-sm text-muted-foreground w-16">
                            {field.value ?? "auto"}
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>Font size for the label text</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clockDateFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date Size</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[field.value ?? 14]}
                            onValueChange={([val]) => field.onChange(val)}
                            min={8}
                            max={72}
                            step={2}
                            className="flex-1"
                            data-testid="slider-clock-date-font-size"
                          />
                          <span className="text-sm text-muted-foreground w-16">
                            {field.value ?? "auto"}
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>Font size for the date display</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Weather Widget Configuration */}
            {form.watch("type") === "weather" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CloudSun className="h-4 w-4" />
                  Weather Widget Settings
                </div>
                <FormField
                  control={form.control}
                  name="weatherDisplayMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Mode</FormLabel>
                      <Select
                        value={field.value || "full"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-weather-display-mode">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="full">Full (Icon + Text)</SelectItem>
                          <SelectItem value="icon_only">Icon Only</SelectItem>
                          <SelectItem value="text_only">Text Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weatherLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Name</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input 
                            placeholder="e.g., London, UK" 
                            {...field} 
                            data-testid="input-weather-location" 
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isGeocoding || !field.value?.trim()}
                            onClick={async () => {
                              const location = field.value;
                              if (!location?.trim()) {
                                toast({ title: "Enter a location first", variant: "destructive" });
                                return;
                              }
                              setIsGeocoding(true);
                              try {
                                const res = await fetch(`/api/widgets/geocode?q=${encodeURIComponent(location)}`);
                                if (!res.ok) throw new Error("Geocoding failed");
                                const data = await res.json();
                                if (!data.results || data.results.length === 0) {
                                  throw new Error("No results found");
                                }
                                const result = data.results[0];
                                const displayName = result.admin1 
                                  ? `${result.name}, ${result.admin1}, ${result.country}` 
                                  : `${result.name}, ${result.country}`;
                                form.setValue("weatherLocation", displayName);
                                form.setValue("weatherLat", result.lat);
                                form.setValue("weatherLng", result.lng);
                                toast({ title: `Found: ${displayName}` });
                              } catch {
                                toast({ title: "Could not find location", variant: "destructive" });
                              } finally {
                                setIsGeocoding(false);
                              }
                            }}
                            data-testid="button-geocode"
                          >
                            {isGeocoding ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <MapPin className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="weatherLat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.0001"
                            placeholder="e.g., 51.5074" 
                            value={field.value ?? ""} 
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-weather-lat" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weatherLng"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.0001"
                            placeholder="e.g., -0.1278" 
                            value={field.value ?? ""} 
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-weather-lng" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="weatherUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temperature Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "celsius"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-weather-unit">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="celsius">Celsius (°C)</SelectItem>
                          <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weatherFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text Size</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[field.value ?? 24]}
                            onValueChange={([val]) => field.onChange(val)}
                            min={12}
                            max={120}
                            step={1}
                            className="flex-1"
                            data-testid="slider-weather-font-size"
                          />
                          <span className="text-sm text-muted-foreground w-16">
                            {field.value ?? 24}px
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Font size for the weather display
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* News Widget Configuration */}
            {form.watch("type") === "news" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Rss className="h-4 w-4" />
                  News Widget Settings
                </div>
                <FormField
                  control={form.control}
                  name="newsRssUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RSS Feed URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://feeds.example.com/rss" 
                          {...field} 
                          data-testid="input-news-rss-url" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="newsScrollSpeed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scroll Speed</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              value={[field.value || 50]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={1}
                              max={200}
                              step={1}
                              data-testid="slider-news-scroll-speed"
                            />
                            <span className="text-sm text-muted-foreground">{field.value || 50} (slower → faster)</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="newsItemCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Headlines Count</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min={1}
                            max={50}
                            value={field.value ?? 10} 
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                            data-testid="input-news-item-count" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="newsTextSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Size</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 24]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={12}
                              max={72}
                              step={2}
                              className="flex-1"
                              data-testid="slider-news-text-size"
                            />
                            <span className="text-sm text-muted-foreground w-16">
                              {field.value ?? 24}px
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Ticker Widget Configuration */}
            {form.watch("type") === "ticker" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Type className="h-4 w-4" />
                  Ticker Settings
                </div>
                <FormField
                  control={form.control}
                  name="textContent"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>Scrolling Text</FormLabel>
                        <VariableInsertMenu onInsert={(token) => field.onChange((field.value || "") + token)} />
                      </div>
                      <FormControl>
                        <textarea 
                          placeholder="Enter your scrolling ticker text here... Use • to separate items" 
                          className="w-full min-h-[80px] p-3 rounded-md border border-input bg-background resize-y"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-ticker-text" 
                        />
                      </FormControl>
                      <FormDescription>Text that will scroll across the ticker zone. Use variables like {"{{screen_name}}"} for dynamic content.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tickerAnimation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Animation Style</FormLabel>
                      <Select
                        value={field.value || "scroll-left"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-ticker-animation">
                            <SelectValue placeholder="Select animation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="scroll-left">Scroll Left (Marquee)</SelectItem>
                          <SelectItem value="scroll-up">Scroll Up (Vertical)</SelectItem>
                          <SelectItem value="typewriter">Typewriter</SelectItem>
                          <SelectItem value="fade">Fade In/Out</SelectItem>
                          <SelectItem value="slide-in">Slide In</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        How the text animates. Use • or | to separate items for single-reveal styles.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tickerScrollSpeed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Animation Speed</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Input
                            type="range"
                            min="5"
                            max="60"
                            step="5"
                            className="flex-1"
                            {...field}
                            value={field.value ?? 20}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-ticker-speed"
                          />
                          <span className="text-sm text-muted-foreground w-16">
                            {field.value ?? 20}s
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Duration for one complete animation cycle (lower = faster)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tickerFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text Size</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[field.value ?? 24]}
                            onValueChange={([val]) => field.onChange(val)}
                            min={12}
                            max={72}
                            step={2}
                            className="flex-1"
                            data-testid="slider-ticker-font-size"
                          />
                          <span className="text-sm text-muted-foreground w-16">
                            {field.value ?? 24}px
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Font size for the scrolling ticker text
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Text Widget Configuration */}
            {form.watch("type") === "text" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Type className="h-4 w-4" />
                  Text Widget Settings
                </div>
                <FormField
                  control={form.control}
                  name="textContent"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>Text Content</FormLabel>
                        <VariableInsertMenu onInsert={(token) => field.onChange((field.value || "") + token)} />
                      </div>
                      <FormControl>
                        <textarea 
                          placeholder="Enter your text here..." 
                          className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background resize-y"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-text-content" 
                        />
                      </FormControl>
                      <FormDescription>The text to display in this zone. Use variables like {"{{event_name}}"} for dynamic content.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="textFontSize"
                  render={({ field }) => {
                    const numVal = typeof field.value === 'number' ? field.value : 24;
                    return (
                      <FormItem>
                        <FormLabel>Text Size</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[numVal]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={12}
                              max={120}
                              step={1}
                              className="flex-1"
                              data-testid="slider-text-font-size"
                            />
                            <span className="text-sm text-muted-foreground w-16">
                              {numVal}px
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Font size for the static text display
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="textAlign"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horizontal Align</FormLabel>
                        <Select
                          value={field.value || "center"}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-text-align">
                              <SelectValue placeholder="Select alignment" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="center">Center</SelectItem>
                            <SelectItem value="right">Right</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="textVerticalAlign"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vertical Align</FormLabel>
                        <Select
                          value={field.value || "middle"}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-text-vertical-align">
                              <SelectValue placeholder="Select alignment" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="top">Top</SelectItem>
                            <SelectItem value="middle">Middle</SelectItem>
                            <SelectItem value="bottom">Bottom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Shader Widget Configuration */}
            {form.watch("type") === "shader" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4" />
                  Shader Widget Settings
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shaderPreset"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preset Effect</FormLabel>
                        <Select
                          value={field.value || "gradient"}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-shader-preset">
                              <SelectValue placeholder="Select effect" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="gradient">Gradient Wave</SelectItem>
                            <SelectItem value="plasma">Plasma</SelectItem>
                            <SelectItem value="waves">Ocean Waves</SelectItem>
                            <SelectItem value="noise">Noise Pattern</SelectItem>
                            <SelectItem value="aurora">Aurora Borealis</SelectItem>
                            <SelectItem value="custom">Custom GLSL</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shaderSpeed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Animation Speed</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              value={[field.value || 1]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={0.1}
                              max={5}
                              step={0.1}
                              data-testid="slider-shader-speed"
                            />
                            <span className="text-sm text-muted-foreground">{(field.value || 1).toFixed(1)}x</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="shaderVariable"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variable (u_variable)</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Slider
                            value={[field.value ?? 0.5]}
                            onValueChange={([val]) => field.onChange(val)}
                            min={0}
                            max={1}
                            step={0.01}
                            data-testid="slider-shader-variable"
                          />
                          <span className="text-sm text-muted-foreground">{(field.value ?? 0.5).toFixed(2)}</span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Controllable value (0-1) available as u_variable in shader code
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shaderColor1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color (u_color1)</FormLabel>
                        <FormControl>
                          <ColorPickerWithPalette
                            value={field.value || "#ff6b6b"}
                            onChange={field.onChange}
                            palette={eventPalette}
                            placeholder="#ff6b6b"
                            data-testid="input-shader-color1"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shaderColor2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Color (u_color2)</FormLabel>
                        <FormControl>
                          <ColorPickerWithPalette
                            value={field.value || "#4ecdc4"}
                            onChange={field.onChange}
                            palette={eventPalette}
                            placeholder="#4ecdc4"
                            data-testid="input-shader-color2"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {form.watch("shaderPreset") === "custom" && (
                  <FormField
                    control={form.control}
                    name="shaderCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GLSL Fragment Shader Code</FormLabel>
                        <FormControl>
                          <textarea 
                            placeholder={`// Available uniforms:\n// uniform float u_time;\n// uniform vec2 u_resolution;\n// uniform float u_variable;\n// uniform vec3 u_color1;\n// uniform vec3 u_color2;\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  vec3 color = mix(u_color1, u_color2, uv.x + sin(u_time) * 0.2);\n  gl_FragColor = vec4(color * u_variable, 1.0);\n}`}
                            className="w-full min-h-[200px] p-3 rounded-md border border-input bg-background font-mono text-sm resize-y"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-shader-code" 
                          />
                        </FormControl>
                        <FormDescription>
                          Write GLSL fragment shader code. Use u_time for animation, u_resolution for coordinates, and u_variable for the controllable parameter.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}

            {/* Montage widget configuration */}
            {form.watch("type") === "montage" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium flex items-center gap-2">
                  <Images className="h-4 w-4" />
                  Photo Montage Configuration
                </h4>
                
                <FormField
                  control={form.control}
                  name="montageMediaIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Photos</FormLabel>
                      <FormControl>
                        <MontageMediaPicker
                          selectedIds={field.value || []}
                          onSelectionChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Choose images from the media library for the slideshow
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="montageDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration per Photo (seconds)</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              value={[field.value || 5]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={1}
                              max={60}
                              step={1}
                              data-testid="slider-montage-duration"
                            />
                            <span className="text-sm text-muted-foreground">{field.value || 5}s</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="montageTransitionDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transition Duration (ms)</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              value={[field.value || 1000]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={100}
                              max={3000}
                              step={100}
                              data-testid="slider-montage-transition-duration"
                            />
                            <span className="text-sm text-muted-foreground">{field.value || 1000}ms</span>
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
                    name="montageTransition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transition Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "fade"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-montage-transition">
                              <SelectValue placeholder="Select transition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fade">Fade</SelectItem>
                            <SelectItem value="slide-left">Slide Left</SelectItem>
                            <SelectItem value="slide-right">Slide Right</SelectItem>
                            <SelectItem value="slide-up">Slide Up</SelectItem>
                            <SelectItem value="slide-down">Slide Down</SelectItem>
                            <SelectItem value="zoom-in">Zoom In</SelectItem>
                            <SelectItem value="zoom-out">Zoom Out</SelectItem>
                            <SelectItem value="none">None (instant)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="montageFitMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Image Fit</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "cover"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-montage-fit">
                              <SelectValue placeholder="Select fit mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cover">Fill (crop to fit)</SelectItem>
                            <SelectItem value="contain">Fit (show entire image)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Cover fills the zone (may crop), Contain shows full image
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="p-3 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <FormLabel>Ken Burns Effect</FormLabel>
                    <FormField
                      control={form.control}
                      name="montageKenBurns"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value || false}
                              onChange={field.onChange}
                              className="h-4 w-4 rounded border-gray-300"
                              data-testid="checkbox-ken-burns"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormDescription className="text-xs">
                    Adds subtle pan and zoom motion to each photo (cinematic effect)
                  </FormDescription>

                  {form.watch("montageKenBurns") && (
                    <FormField
                      control={form.control}
                      name="montageKenBurnsIntensity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Intensity</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                value={[field.value || 10]}
                                onValueChange={([val]) => field.onChange(val)}
                                min={1}
                                max={20}
                                step={1}
                                data-testid="slider-ken-burns-intensity"
                              />
                              <span className="text-sm text-muted-foreground">{field.value || 10}%</span>
                            </div>
                          </FormControl>
                          <FormDescription>
                            How much zoom/pan motion (lower = subtle, higher = dramatic)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="flex gap-4">
                  <FormField
                    control={form.control}
                    name="montageShuffle"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value || false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-montage-shuffle"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Shuffle photos</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="montageAutoPlay"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value !== false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-montage-autoplay"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Auto-play slideshow</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* QR Code Zone Configuration */}
            {form.watch("type") === "qrcode" && (
              <div className="space-y-4 border rounded-md p-4" data-testid="qrcode-config-section">
                <h4 className="font-medium flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  QR Code Configuration
                </h4>

                <FormField
                  control={form.control}
                  name="qrContentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "url"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-qr-content-type">
                            <SelectValue placeholder="Select content type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="url">URL / Website Link</SelectItem>
                          <SelectItem value="email">Email Address</SelectItem>
                          <SelectItem value="phone">Phone Number</SelectItem>
                          <SelectItem value="text">Plain Text</SelectItem>
                          <SelectItem value="wifi">WiFi Network</SelectItem>
                          <SelectItem value="location">Location (GPS)</SelectItem>
                          <SelectItem value="vcard">Contact Card (vCard)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* URL Content */}
                {form.watch("qrContentType") === "url" && (
                  <FormField
                    control={form.control}
                    name="qrContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-qr-url"
                          />
                        </FormControl>
                        <FormDescription>Enter the website URL to encode</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Email Content */}
                {form.watch("qrContentType") === "email" && (
                  <FormField
                    control={form.control}
                    name="qrContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="contact@example.com"
                            type="email"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-qr-email"
                          />
                        </FormControl>
                        <FormDescription>Scanning will open email app with this address</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Phone Content */}
                {form.watch("qrContentType") === "phone" && (
                  <FormField
                    control={form.control}
                    name="qrContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+1234567890"
                            type="tel"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-qr-phone"
                          />
                        </FormControl>
                        <FormDescription>Include country code for best compatibility</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Plain Text Content */}
                {form.watch("qrContentType") === "text" && (
                  <FormField
                    control={form.control}
                    name="qrContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Content</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter text to encode..."
                            {...field}
                            value={field.value || ""}
                            rows={3}
                            data-testid="input-qr-text"
                          />
                        </FormControl>
                        <FormDescription>Plain text that will be displayed when scanned</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* WiFi Configuration */}
                {form.watch("qrContentType") === "wifi" && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="qrWifiSsid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Network Name (SSID)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="MyWiFiNetwork"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-qr-wifi-ssid"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qrWifiPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="WiFi password"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-qr-wifi-password"
                            />
                          </FormControl>
                          <FormDescription>Leave empty for open networks</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qrWifiEncryption"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Encryption Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "WPA"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-qr-wifi-encryption">
                                <SelectValue placeholder="Select encryption" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="WPA">WPA/WPA2/WPA3</SelectItem>
                              <SelectItem value="WEP">WEP</SelectItem>
                              <SelectItem value="nopass">Open (No Password)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Location Configuration */}
                {form.watch("qrContentType") === "location" && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="qrLocationName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input 
                                placeholder="e.g., Farnborough Exhibition Centre" 
                                {...field} 
                                data-testid="input-qr-location-name" 
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={isGeocoding || !field.value?.trim()}
                                onClick={async () => {
                                  const location = field.value;
                                  if (!location?.trim()) {
                                    toast({ title: "Enter a location first", variant: "destructive" });
                                    return;
                                  }
                                  setIsGeocoding(true);
                                  try {
                                    const res = await fetch(`/api/widgets/geocode?q=${encodeURIComponent(location)}`);
                                    if (!res.ok) throw new Error("Geocoding failed");
                                    const data = await res.json();
                                    if (!data.results || data.results.length === 0) {
                                      throw new Error("No results found");
                                    }
                                    const result = data.results[0];
                                    const displayName = result.admin1 
                                      ? `${result.name}, ${result.admin1}, ${result.country}` 
                                      : `${result.name}, ${result.country}`;
                                    form.setValue("qrLocationName", displayName);
                                    form.setValue("qrLocationLat", result.lat);
                                    form.setValue("qrLocationLng", result.lng);
                                    toast({ title: `Found: ${displayName}` });
                                  } catch {
                                    toast({ title: "Could not find location", variant: "destructive" });
                                  } finally {
                                    setIsGeocoding(false);
                                  }
                                }}
                                data-testid="button-qr-location-geocode"
                              >
                                {isGeocoding ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  <MapPin className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Type a location and click the pin to find coordinates
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="qrLocationLat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Latitude</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="any"
                                placeholder="51.5074"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                data-testid="input-qr-location-lat"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="qrLocationLng"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Longitude</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="any"
                                placeholder="-0.1278"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                data-testid="input-qr-location-lng"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* vCard Configuration */}
                {form.watch("qrContentType") === "vcard" && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="qrVcardName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John Doe"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-qr-vcard-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qrVcardPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="+1234567890"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-qr-vcard-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qrVcardEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="john@example.com"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-qr-vcard-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qrVcardOrg"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organisation</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Company Name"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-qr-vcard-org"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* QR Code Appearance */}
                <div className="border-t pt-4 mt-4">
                  <h5 className="text-sm font-medium mb-3">Appearance</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="qrForegroundColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Foreground Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#000000"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="#000000"
                              data-testid="input-qr-fg-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qrBackgroundColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Background Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#ffffff"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="#ffffff"
                              data-testid="input-qr-bg-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Error Correction Level */}
                <FormField
                  control={form.control}
                  name="qrErrorCorrection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Error Correction Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "M"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-qr-error-correction">
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="L">Low (7% recovery)</SelectItem>
                          <SelectItem value="M">Medium (15% recovery)</SelectItem>
                          <SelectItem value="Q">Quartile (25% recovery)</SelectItem>
                          <SelectItem value="H">High (30% recovery)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Higher levels make QR codes more resilient but denser</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Transparent Background */}
                <FormField
                  control={form.control}
                  name="qrTransparentBackground"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value || false}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded border-gray-300"
                          data-testid="checkbox-qr-transparent"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Transparent background</FormLabel>
                    </FormItem>
                  )}
                />
                <FormDescription className="text-xs -mt-2">
                  Uses transparent background instead of the background color
                </FormDescription>

                {/* QR Label Configuration */}
                <div className="border-t pt-4 mt-4">
                  <h5 className="text-sm font-medium mb-3">Label (Optional)</h5>
                  
                  <FormField
                    control={form.control}
                    name="qrLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Label Text</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter label text..."
                            {...field}
                            value={field.value || ""}
                            data-testid="input-qr-label"
                          />
                        </FormControl>
                        <FormDescription>Text displayed with the QR code</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("qrLabel") && (
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="qrLabelPosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Position</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "below"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-qr-label-position">
                                    <SelectValue placeholder="Select position" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="above">Above QR code</SelectItem>
                                  <SelectItem value="below">Below QR code</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="qrLabelFontSize"
                          render={({ field }) => {
                            const numVal = typeof field.value === 'number' ? field.value : 16;
                            return (
                              <FormItem>
                                <FormLabel>Label Text Size</FormLabel>
                                <FormControl>
                                  <div className="flex items-center gap-4">
                                    <Slider
                                      value={[numVal]}
                                      onValueChange={([val]) => field.onChange(val)}
                                      min={12}
                                      max={120}
                                      step={1}
                                      className="flex-1"
                                      data-testid="slider-qr-label-font-size"
                                    />
                                    <span className="text-sm text-muted-foreground w-16">
                                      {numVal}px
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="qrLabelColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Label Color</FormLabel>
                            <FormControl>
                              <ColorPickerWithPalette
                                value={field.value || "#000000"}
                                onChange={field.onChange}
                                palette={eventPalette}
                                placeholder="#000000"
                                data-testid="input-qr-label-color"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Countdown Timer Zone Configuration */}
            {form.watch("type") === "countdown" && (
              <div className="space-y-4 border rounded-md p-4" data-testid="countdown-config-section">
                <h4 className="font-medium flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Countdown Timer Settings
                </h4>

                {/* Target Date and Time */}
                <FormField
                  control={form.control}
                  name="countdownTargetDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Date & Time</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-countdown-target-date"
                        />
                      </FormControl>
                      <FormDescription>The date and time to count down to</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Title */}
                <FormField
                  control={form.control}
                  name="countdownTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Conference starts in..."
                          {...field}
                          value={field.value || ""}
                          data-testid="input-countdown-title"
                        />
                      </FormControl>
                      <FormDescription>Optional text displayed above the countdown</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Completion Message */}
                <FormField
                  control={form.control}
                  name="countdownCompletionMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Completion Message</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Event Started!"
                          {...field}
                          value={field.value || "Event Started!"}
                          data-testid="input-countdown-completion-message"
                        />
                      </FormControl>
                      <FormDescription>Message shown when countdown reaches zero</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Size Controls */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="countdownSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number Size</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 24]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={12}
                              max={120}
                              step={2}
                              className="flex-1"
                              data-testid="slider-countdown-size"
                            />
                            <span className="text-sm text-muted-foreground w-16">
                              {field.value ?? 24}px
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>Font size for the countdown numbers</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="countdownTitleSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title Size</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? Math.max(12, Math.round((form.watch("countdownSize") ?? 24) * 0.67))]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={8}
                              max={72}
                              step={2}
                              className="flex-1"
                              data-testid="slider-countdown-title-size"
                            />
                            <span className="text-sm text-muted-foreground w-16">
                              {field.value ?? "auto"}
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>Font size for the title text (leave at auto to scale with numbers)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="countdownLabelSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Label Size</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? Math.max(8, Math.round((form.watch("countdownSize") ?? 24) * 0.4))]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={6}
                              max={48}
                              step={1}
                              className="flex-1"
                              data-testid="slider-countdown-label-size"
                            />
                            <span className="text-sm text-muted-foreground w-16">
                              {field.value ?? "auto"}
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>Font size for unit labels (Days, Hours, etc.)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Units to Show */}
                <div className="space-y-2">
                  <FormLabel>Units to Display</FormLabel>
                  <div className="flex flex-wrap gap-4">
                    <FormField
                      control={form.control}
                      name="countdownShowDays"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value ?? true}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-countdown-show-days"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Days</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownShowHours"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value ?? true}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-countdown-show-hours"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Hours</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownShowMinutes"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value ?? true}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-countdown-show-minutes"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Minutes</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownShowSeconds"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value ?? true}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-countdown-show-seconds"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Seconds</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Custom Labels */}
                <div className="space-y-2">
                  <FormLabel>Custom Labels</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="countdownDayLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Days"
                              {...field}
                              value={field.value || "Days"}
                              data-testid="input-countdown-day-label"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownHourLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Hours"
                              {...field}
                              value={field.value || "Hours"}
                              data-testid="input-countdown-hour-label"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownMinuteLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Minutes"
                              {...field}
                              value={field.value || "Minutes"}
                              data-testid="input-countdown-minute-label"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownSecondLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Seconds"
                              {...field}
                              value={field.value || "Seconds"}
                              data-testid="input-countdown-second-label"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Separator Style */}
                <FormField
                  control={form.control}
                  name="countdownSeparator"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Separator Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "colon"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-countdown-separator">
                            <SelectValue placeholder="Select separator" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="colon">Colon (:)</SelectItem>
                          <SelectItem value="dash">Dash (-)</SelectItem>
                          <SelectItem value="space">Space</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Leading Zeros */}
                <FormField
                  control={form.control}
                  name="countdownShowLeadingZeros"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-countdown-leading-zeros"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show leading zeros (e.g., 01:05:03)</FormLabel>
                    </FormItem>
                  )}
                />

                {/* Colors */}
                <div className="space-y-3">
                  <FormLabel>Colors</FormLabel>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="countdownNumberColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Number Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#ffffff"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="inherit"
                              data-testid="input-countdown-number-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="countdownLabelColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Label Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#cccccc"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="inherit"
                              data-testid="input-countdown-label-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Font & Spacing */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="countdownFontFamily"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Family</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "mono"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-countdown-font-family">
                              <SelectValue placeholder="Select font" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="mono">Monospace</SelectItem>
                            <SelectItem value="sans">Sans-Serif</SelectItem>
                            <SelectItem value="serif">Serif</SelectItem>
                            <SelectItem value="display">Display</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="countdownUnitGap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Gap (rem)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="5"
                            placeholder="Auto"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-countdown-unit-gap"
                          />
                        </FormControl>
                        <FormDescription>Leave empty for automatic spacing based on size</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Timezone */}
                <FormField
                  control={form.control}
                  name="countdownTimezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Timezone</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "local" ? "" : val)} value={field.value || "local"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-countdown-timezone">
                            <SelectValue placeholder="Local time (browser)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="local">Local Time (Browser)</SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                          <SelectItem value="Europe/Paris">Europe/Paris (CET/CEST)</SelectItem>
                          <SelectItem value="Europe/Berlin">Europe/Berlin (CET/CEST)</SelectItem>
                          <SelectItem value="America/New_York">America/New York (EST/EDT)</SelectItem>
                          <SelectItem value="America/Chicago">America/Chicago (CST/CDT)</SelectItem>
                          <SelectItem value="America/Denver">America/Denver (MST/MDT)</SelectItem>
                          <SelectItem value="America/Los_Angeles">America/Los Angeles (PST/PDT)</SelectItem>
                          <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                          <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                          <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                          <SelectItem value="Asia/Shanghai">Asia/Shanghai (CST)</SelectItem>
                          <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Interpret the target date/time in this timezone</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Compact Mode */}
                <FormField
                  control={form.control}
                  name="countdownCompact"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-countdown-compact"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Compact mode (reduced padding and smaller labels)</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Shape Widget Configuration */}
            {form.watch("type") === "shape" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shapes className="h-4 w-4" />
                  Shape Settings
                </div>
                <FormField
                  control={form.control}
                  name="shapeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shape Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "rectangle"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shape-type">
                            <SelectValue placeholder="Select shape" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="line">Line</SelectItem>
                          <SelectItem value="rectangle">Rectangle</SelectItem>
                          <SelectItem value="square">Square</SelectItem>
                          <SelectItem value="circle">Circle</SelectItem>
                          <SelectItem value="oval">Oval</SelectItem>
                          <SelectItem value="triangle">Triangle</SelectItem>
                          <SelectItem value="arch">Arch</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shapeAlignment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Alignment</FormLabel>
                      <FormControl>
                        <div className="flex gap-1">
                          {([
                            { value: "left", icon: AlignLeft, label: "Left" },
                            { value: "center", icon: AlignCenter, label: "Center" },
                            { value: "right", icon: AlignRight, label: "Right" },
                          ] as const).map(({ value, icon: Icon, label }) => (
                            <Button
                              key={value}
                              type="button"
                              variant={field.value === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => field.onChange(value)}
                              data-testid={`button-shape-align-${value}`}
                            >
                              <Icon className="h-4 w-4 mr-1" />
                              {label}
                            </Button>
                          ))}
                        </div>
                      </FormControl>
                      <FormDescription>Align shape and icon content within the zone</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shapeIcon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Signage Icon (Optional)</FormLabel>
                      <FormControl>
                        <SignageIconPicker
                          value={field.value || ""}
                          onChange={field.onChange}
                          fillColor={form.watch("shapeFillColor")}
                        />
                      </FormControl>
                      <FormDescription>Add a signage icon overlay to this shape</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("shapeIcon") && (
                  <div className="space-y-3 pl-4 border-l-2 border-muted">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Icon Settings</div>
                    <FormField
                      control={form.control}
                      name="shapeIconColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Icon Colour</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || form.watch("shapeStrokeColor") || "#ffffff"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="Matches stroke"
                              data-testid="color-shape-icon"
                            />
                          </FormControl>
                          <FormDescription>Colour of the icon itself</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Icon Text</div>
                    <FormField
                      control={form.control}
                      name="shapeIconText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Label Text</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              placeholder="e.g. Toilets, Exit, WiFi..."
                              data-testid="input-shape-icon-text"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {form.watch("shapeIconText") && (
                      <>
                        <FormField
                          control={form.control}
                          name="shapeIconTextPosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Text Position</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "right"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-shape-icon-text-position">
                                    <SelectValue placeholder="Position" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="left">Left of icon</SelectItem>
                                  <SelectItem value="right">Right of icon</SelectItem>
                                  <SelectItem value="top">Above icon</SelectItem>
                                  <SelectItem value="bottom">Below icon</SelectItem>
                                  <SelectItem value="center">Centered on icon</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="shapeIconTextSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Text Size</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={8}
                                    max={200}
                                    value={field.value ?? 14}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                    data-testid="input-shape-icon-text-size"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="shapeIconTextColor"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Text Color</FormLabel>
                                <FormControl>
                                  <ColorPickerWithPalette
                                    value={field.value || form.watch("shapeStrokeColor") || "#ffffff"}
                                    onChange={field.onChange}
                                    palette={eventPalette}
                                    placeholder="Matches stroke"
                                    data-testid="color-shape-icon-text"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {form.watch("shapeType") === "line" && (
                  <FormField
                    control={form.control}
                    name="shapeLineDirection"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Line Direction</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "horizontal"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-shape-line-direction">
                              <SelectValue placeholder="Select direction" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="horizontal">Horizontal</SelectItem>
                            <SelectItem value="vertical">Vertical</SelectItem>
                            <SelectItem value="diagonal-down">Diagonal (down)</SelectItem>
                            <SelectItem value="diagonal-up">Diagonal (up)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {form.watch("shapeType") === "arch" && (
                  <FormField
                    control={form.control}
                    name="shapeArchSpan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Arch Span</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 180]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={30}
                              max={350}
                              step={5}
                              className="flex-1"
                              data-testid="slider-shape-arch-span"
                            />
                            <span className="text-sm text-muted-foreground w-16">
                              {field.value ?? 180}&deg;
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>Angle of the arch in degrees</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shapeFillEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? true}
                            onChange={field.onChange}
                            className="rounded"
                            data-testid="checkbox-shape-fill-enabled"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Fill Enabled</FormLabel>
                      </FormItem>
                    )}
                  />
                  {form.watch("shapeFillEnabled") !== false && (
                    <FormField
                      control={form.control}
                      name="shapeFillColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fill Color</FormLabel>
                          <FormControl>
                            <ColorPickerWithPalette
                              value={field.value || "#3b82f6"}
                              onChange={field.onChange}
                              palette={eventPalette}
                              placeholder="#3b82f6"
                              data-testid="color-shape-fill"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shapeStrokeColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stroke Color</FormLabel>
                        <FormControl>
                          <ColorPickerWithPalette
                            value={field.value || "#ffffff"}
                            onChange={field.onChange}
                            palette={eventPalette}
                            placeholder="#ffffff"
                            data-testid="color-shape-stroke"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shapeStrokeWidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stroke Width</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 2]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={0}
                              max={20}
                              step={1}
                              className="flex-1"
                              data-testid="slider-shape-stroke-width"
                            />
                            <span className="text-sm text-muted-foreground w-12">
                              {field.value ?? 2}px
                            </span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="shapeStrokeStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stroke Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "solid"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shape-stroke-style">
                            <SelectValue placeholder="Select style" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="solid">Solid</SelectItem>
                          <SelectItem value="dashed">Dashed</SelectItem>
                          <SelectItem value="dotted">Dotted</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(form.watch("shapeType") === "rectangle" || form.watch("shapeType") === "square") && (
                  <FormField
                    control={form.control}
                    name="shapeCornerRadius"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Corner Radius</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 0]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={0}
                              max={50}
                              step={1}
                              className="flex-1"
                              data-testid="slider-shape-corner-radius"
                            />
                            <span className="text-sm text-muted-foreground w-12">
                              {field.value ?? 0}px
                            </span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shapeRotation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rotation</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 0]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={0}
                              max={360}
                              step={5}
                              className="flex-1"
                              data-testid="slider-shape-rotation"
                            />
                            <span className="text-sm text-muted-foreground w-12">
                              {field.value ?? 0}&deg;
                            </span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shapeOpacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Opacity</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[field.value ?? 100]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={0}
                              max={100}
                              step={5}
                              className="flex-1"
                              data-testid="slider-shape-opacity"
                            />
                            <span className="text-sm text-muted-foreground w-12">
                              {field.value ?? 100}%
                            </span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {form.watch("type") === "schedule" && (
              <div className="space-y-4 border rounded-md p-4" data-testid="schedule-config-section">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Schedule Settings
                </h4>

                <FormField
                  control={form.control}
                  name="scheduleViewMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>View Mode</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "hourly"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-schedule-view-mode">
                            <SelectValue placeholder="Select view mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly Timeline</SelectItem>
                          <SelectItem value="daily">Daily View</SelectItem>
                          <SelectItem value="agenda">Agenda List</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduleTimeFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time Format</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "24h"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-schedule-time-format">
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                            <SelectItem value="24h">24-hour</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduleShowCurrentTime"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 pt-6">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-schedule-show-current-time"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Show Current Time</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch("scheduleViewMode") === "hourly" && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="scheduleStartHour"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Hour</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={23}
                              value={field.value ?? 8}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-schedule-start-hour"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="scheduleEndHour"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Hour</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={24}
                              value={field.value ?? 18}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 18)}
                              data-testid="input-schedule-end-hour"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="scheduleHeaderText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Text</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Conference Room A"
                          value={field.value || ""}
                          onChange={field.onChange}
                          data-testid="input-schedule-header-text"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <FormLabel>Schedule Entries</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const entries = form.watch("scheduleEntries") || [];
                        form.setValue("scheduleEntries", [
                          ...entries,
                          {
                            id: `entry-${Date.now()}`,
                            title: "",
                            startTime: "09:00",
                            endTime: "10:00",
                            day: "",
                            color: "#3b82f6",
                            room: "",
                          },
                        ]);
                      }}
                      data-testid="button-add-schedule-entry"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Entry
                    </Button>
                  </div>
                  {(form.watch("scheduleEntries") || []).map((entry, index) => (
                    <div key={entry.id} className="border rounded-md p-3 space-y-2" data-testid={`schedule-entry-${index}`}>
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          placeholder="Session title"
                          value={entry.title}
                          onChange={(e) => {
                            const entries = [...(form.watch("scheduleEntries") || [])];
                            entries[index] = { ...entries[index], title: e.target.value };
                            form.setValue("scheduleEntries", entries);
                          }}
                          data-testid={`input-schedule-entry-title-${index}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const entries = [...(form.watch("scheduleEntries") || [])];
                            entries.splice(index, 1);
                            form.setValue("scheduleEntries", entries);
                          }}
                          data-testid={`button-remove-schedule-entry-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="time"
                          value={entry.startTime}
                          onChange={(e) => {
                            const entries = [...(form.watch("scheduleEntries") || [])];
                            entries[index] = { ...entries[index], startTime: e.target.value };
                            form.setValue("scheduleEntries", entries);
                          }}
                          data-testid={`input-schedule-entry-start-${index}`}
                        />
                        <Input
                          type="time"
                          value={entry.endTime}
                          onChange={(e) => {
                            const entries = [...(form.watch("scheduleEntries") || [])];
                            entries[index] = { ...entries[index], endTime: e.target.value };
                            form.setValue("scheduleEntries", entries);
                          }}
                          data-testid={`input-schedule-entry-end-${index}`}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="Day (optional)"
                          value={entry.day || ""}
                          onChange={(e) => {
                            const entries = [...(form.watch("scheduleEntries") || [])];
                            entries[index] = { ...entries[index], day: e.target.value };
                            form.setValue("scheduleEntries", entries);
                          }}
                          data-testid={`input-schedule-entry-day-${index}`}
                        />
                        <Input
                          placeholder="Room (optional)"
                          value={entry.room || ""}
                          onChange={(e) => {
                            const entries = [...(form.watch("scheduleEntries") || [])];
                            entries[index] = { ...entries[index], room: e.target.value };
                            form.setValue("scheduleEntries", entries);
                          }}
                          data-testid={`input-schedule-entry-room-${index}`}
                        />
                        <div className="flex gap-1">
                          <input
                            type="color"
                            className="w-9 h-9 rounded cursor-pointer border border-border p-0.5"
                            value={entry.color || "#3b82f6"}
                            onChange={(e) => {
                              const entries = [...(form.watch("scheduleEntries") || [])];
                              entries[index] = { ...entries[index], color: e.target.value };
                              form.setValue("scheduleEntries", entries);
                            }}
                            data-testid={`color-schedule-entry-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {form.watch("type") === "media_player" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg" data-testid="media-player-config-section">
                <h4 className="font-medium flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Media Player Configuration
                </h4>

                <FormField
                  control={form.control}
                  name="mediaPlayerItems"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Playlist Items</FormLabel>
                      <FormControl>
                        <MediaPlayerItemsPicker
                          items={field.value || []}
                          onItemsChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Add images and videos to build a playlist. Images use per-item duration, videos play to completion.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="mediaPlayerTransition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transition</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "fade"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-media-player-transition">
                              <SelectValue placeholder="Select transition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fade">Fade</SelectItem>
                            <SelectItem value="slide-left">Slide Left</SelectItem>
                            <SelectItem value="slide-right">Slide Right</SelectItem>
                            <SelectItem value="none">None (instant)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mediaPlayerTransitionDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transition Duration (ms)</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              value={[field.value || 800]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={100}
                              max={3000}
                              step={100}
                              data-testid="slider-media-player-transition-duration"
                            />
                            <span className="text-sm text-muted-foreground">{field.value || 800}ms</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="mediaPlayerFitMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Media Fit Mode</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "contain"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-media-player-fit-mode">
                            <SelectValue placeholder="Select fit mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="contain">Fit (show entire media)</SelectItem>
                          <SelectItem value="cover">Fill (crop to fit)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Contain shows full media, Cover fills the zone (may crop)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-4">
                  <FormField
                    control={form.control}
                    name="mediaPlayerLoop"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? true}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-media-player-loop"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Loop playlist</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mediaPlayerAutoPlay"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? true}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-media-player-autoplay"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Auto-play</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mediaPlayerMuted"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? true}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-media-player-muted"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Mute videos</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mediaPlayerShuffle"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-media-player-shuffle"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Shuffle order</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {form.watch("type") === "football_table" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg" data-testid="football-table-config-section">
                <h4 className="font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Football Table Settings
                </h4>

                <FormField
                  control={form.control}
                  name="footballSeason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Season</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="auto (current season)"
                          value={field.value || "auto"}
                          onChange={(e) => field.onChange(e.target.value || "auto")}
                          data-testid="input-football-season"
                        />
                      </FormControl>
                      <FormDescription>Enter a year (e.g. 2025) or "auto" for current season</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="footballFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Font Size ({field.value ?? 14}px)</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value ?? 14]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={8}
                          max={48}
                          step={1}
                          data-testid="slider-football-font-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="footballRefreshInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refresh Interval ({field.value ?? 300}s)</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value ?? 300]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={60}
                          max={3600}
                          step={60}
                          data-testid="slider-football-refresh"
                        />
                      </FormControl>
                      <FormDescription>How often to refresh data (seconds)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-6">
                  <FormField
                    control={form.control}
                    name="footballShowBadges"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? true}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-football-badges"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Show badges</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="footballCompactMode"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-football-compact"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Compact mode</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="footballBadgeFormat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Badge File Format</FormLabel>
                      <Select
                        value={field.value || "png"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-football-badge-format">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="png">PNG</SelectItem>
                          <SelectItem value="svg">SVG</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Format of badge image files in /assets/football/badges/</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {form.watch("type") === "premier_league_fixtures" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg" data-testid="pl-fixtures-config-section">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  PL Fixtures Settings
                </h4>

                <FormField
                  control={form.control}
                  name="plFixturesDisplayMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Mode</FormLabel>
                      <Select
                        value={field.value || "list"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-pl-fixtures-display-mode">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="list">List (vertical column)</SelectItem>
                          <SelectItem value="grid">Grid (matchday cards)</SelectItem>
                          <SelectItem value="paged">Paged (auto-rotating)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>How fixtures are arranged in the zone</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plFixturesDaysAhead"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Days Ahead ({field.value ?? 30})</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value ?? 30]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={1}
                          max={90}
                          step={1}
                          data-testid="slider-pl-fixtures-days"
                        />
                      </FormControl>
                      <FormDescription>How many days ahead to show fixtures</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plFixturesLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Fixtures ({field.value ?? 20})</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value ?? 20]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={1}
                          max={50}
                          step={1}
                          data-testid="slider-pl-fixtures-limit"
                        />
                      </FormControl>
                      <FormDescription>Maximum number of fixtures to display</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plFixturesFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Font Size ({field.value ?? 14}px)</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value ?? 14]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={8}
                          max={48}
                          step={1}
                          data-testid="slider-pl-fixtures-font-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plFixturesRefreshInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refresh Interval ({field.value ?? 300}s)</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value ?? 300]}
                          onValueChange={([val]) => field.onChange(val)}
                          min={60}
                          max={3600}
                          step={60}
                          data-testid="slider-pl-fixtures-refresh"
                        />
                      </FormControl>
                      <FormDescription>How often to refresh data (seconds)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-6 flex-wrap">
                  <FormField
                    control={form.control}
                    name="plFixturesShowBadges"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? true}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-pl-fixtures-badges"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Show badges</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="plFixturesShowVenue"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-pl-fixtures-venue"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Show venue</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="plFixturesCompactMode"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-pl-fixtures-compact"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Compact mode</FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="plFixturesShowCompleted"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid="checkbox-pl-fixtures-completed"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Show completed</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch("plFixturesDisplayMode") === "paged" && (
                  <div className="space-y-4 pt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground font-medium">Paged Mode Settings</div>
                    <FormField
                      control={form.control}
                      name="plFixturesItemsPerPage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fixtures Per Page ({field.value ?? 6})</FormLabel>
                          <FormControl>
                            <Slider
                              value={[field.value ?? 6]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={1}
                              max={20}
                              step={1}
                              data-testid="slider-pl-fixtures-items-per-page"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="plFixturesPageDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Page Duration ({field.value ?? 8}s)</FormLabel>
                          <FormControl>
                            <Slider
                              value={[field.value ?? 8]}
                              onValueChange={([val]) => field.onChange(val)}
                              min={3}
                              max={30}
                              step={1}
                              data-testid="slider-pl-fixtures-page-duration"
                            />
                          </FormControl>
                          <FormDescription>Seconds before rotating to next page</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            )}

            {(form.watch("type") === "heathrow_arrivals" || form.watch("type") === "heathrow_departures") && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Plane className="h-4 w-4" />
                  Heathrow {form.watch("type") === "heathrow_arrivals" ? "Arrivals" : "Departures"} Settings
                </div>
                <FormField
                  control={form.control}
                  name="heathrowTerminal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terminal Filter</FormLabel>
                      <Select
                        value={field.value || "all"}
                        onValueChange={(val) => field.onChange(val === "all" ? "" : val)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-heathrow-terminal">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Terminals</SelectItem>
                          <SelectItem value="2">Terminal 2</SelectItem>
                          <SelectItem value="3">Terminal 3</SelectItem>
                          <SelectItem value="4">Terminal 4</SelectItem>
                          <SelectItem value="5">Terminal 5</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="heathrowAirline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Airline Filter</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., BA (leave empty for all)"
                          {...field}
                          data-testid="input-heathrow-airline"
                        />
                      </FormControl>
                      <FormDescription>Two-letter IATA airline code</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="heathrowRefreshInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Refresh (s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={30}
                            max={600}
                            value={field.value ?? 120}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 120)}
                            data-testid="input-heathrow-refresh"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="heathrowPageInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Interval (s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={3}
                            max={120}
                            value={field.value ?? 10}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                            data-testid="input-heathrow-page-interval"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="heathrowFontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size (px)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={8}
                            max={48}
                            value={field.value ?? 14}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 14)}
                            data-testid="input-heathrow-font-size"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="heathrowShowFilters"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-heathrow-show-filters"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show filter controls on display</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="heathrowColumns"
                  render={({ field }) => {
                    const isArrivals = form.watch("type") === "heathrow_arrivals";
                    const defaultDepartureCols = ["flight", "airline", "terminal", "gate", "destination", "scheduled", "estimated", "status"];
                    const defaultArrivalCols = ["flight", "airline", "terminal", "belt", "destination", "scheduled", "estimated", "status"];
                    const defaultCols = isArrivals ? defaultArrivalCols : defaultDepartureCols;
                    const allColumns = [
                      { key: "flight", label: "Flight Number" },
                      { key: "airline", label: "Airline" },
                      { key: "terminal", label: "Terminal" },
                      { key: "gate", label: "Gate" },
                      { key: "checkInDesk", label: "Check-In Desk" },
                      { key: "belt", label: "Baggage Belt" },
                      { key: "destination", label: isArrivals ? "Origin" : "Destination" },
                      { key: "scheduled", label: "Scheduled Time" },
                      { key: "estimated", label: "Estimated Time" },
                      { key: "predicted", label: "Predicted Time (ML)" },
                      { key: "actual", label: "Actual Time" },
                      { key: "status", label: "Status" },
                      { key: "aircraftType", label: "Aircraft Type" },
                      { key: "aircraftReg", label: "Aircraft Registration" },
                      { key: "runway", label: "Runway" },
                      { key: "callSign", label: "Callsign" },
                      { key: "codeshare", label: "Codeshare Status" },
                    ];
                    const effective: string[] = (field.value && field.value.length > 0) ? field.value : defaultCols;
                    const toggleColumn = (key: string) => {
                      const next = effective.includes(key)
                        ? effective.filter((k: string) => k !== key)
                        : [...effective, key];
                      field.onChange(next);
                    };
                    const isDefault = !field.value || field.value.length === 0;
                    return (
                      <FormItem>
                        <FormLabel>Visible Columns</FormLabel>
                        <FormDescription>
                          {isDefault ? "Using default columns. Toggle any to customise." : "Custom column selection active."}
                        </FormDescription>
                        <div className="grid grid-cols-2 gap-1 mt-2">
                          {allColumns.map(({ key, label }) => (
                            <label
                              key={key}
                              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                            >
                              <Checkbox
                                checked={effective.includes(key)}
                                onCheckedChange={() => toggleColumn(key)}
                                data-testid={`checkbox-heathrow-col-${key}`}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        {!isDefault && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 text-xs"
                            onClick={() => field.onChange([])}
                            data-testid="button-reset-heathrow-columns"
                          >
                            Reset to defaults
                          </Button>
                        )}
                      </FormItem>
                    );
                  }}
                />
              </div>
            )}

            {form.watch("type") === "weather_forecast" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CloudRain className="h-4 w-4" />
                  Weather Forecast Settings
                </div>
                <FormField
                  control={form.control}
                  name="weatherLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Name</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            placeholder="e.g., London, UK"
                            {...field}
                            data-testid="input-forecast-location"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isGeocoding || !field.value?.trim()}
                            onClick={async () => {
                              const location = field.value;
                              if (!location?.trim()) {
                                toast({ title: "Enter a location first", variant: "destructive" });
                                return;
                              }
                              setIsGeocoding(true);
                              try {
                                const res = await fetch(`/api/widgets/geocode?q=${encodeURIComponent(location)}`);
                                if (!res.ok) throw new Error("Geocoding failed");
                                const data = await res.json();
                                if (!data.results || data.results.length === 0) {
                                  throw new Error("No results found");
                                }
                                const result = data.results[0];
                                const displayName = result.admin1
                                  ? `${result.name}, ${result.admin1}, ${result.country}`
                                  : `${result.name}, ${result.country}`;
                                form.setValue("weatherLocation", displayName);
                                form.setValue("weatherLat", result.lat);
                                form.setValue("weatherLng", result.lng);
                                toast({ title: `Found: ${displayName}` });
                              } catch {
                                toast({ title: "Could not find location", variant: "destructive" });
                              } finally {
                                setIsGeocoding(false);
                              }
                            }}
                            data-testid="button-forecast-geocode"
                          >
                            {isGeocoding ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <MapPin className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="weatherLat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.0001"
                            placeholder="51.5072"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-forecast-lat"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weatherLng"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.0001"
                            placeholder="-0.1276"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-forecast-lng"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="weatherUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temperature Unit</FormLabel>
                      <Select
                        value={field.value || "celsius"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-forecast-unit">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="celsius">Celsius (°C)</SelectItem>
                          <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="forecastDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forecast Days</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={14}
                            value={field.value ?? 5}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 5)}
                            data-testid="input-forecast-days"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="forecastRefreshInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refresh (s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={60}
                            max={3600}
                            value={field.value ?? 600}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 600)}
                            data-testid="input-forecast-refresh"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="forecastFontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size (px)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={8}
                            max={48}
                            value={field.value ?? 14}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 14)}
                            data-testid="input-forecast-font-size"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="forecastShowHourly"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-forecast-show-hourly"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show hourly forecast (next 24h)</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forecastShowCondition"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-forecast-show-condition"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show daily condition text</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forecastShowSunrise"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-forecast-show-sunrise"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show sunrise / sunset times</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forecastShowHumidity"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-forecast-show-humidity"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show hourly humidity</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forecastShowHourlyCondition"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-forecast-show-hourly-condition"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show hourly condition text</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {form.watch("type") === "spacex_launch" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Rocket className="h-4 w-4" />
                  SpaceX Launch Countdown Settings
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="spacexRefreshInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refresh Interval (s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={30}
                            max={3600}
                            value={field.value ?? 60}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                            data-testid="input-spacex-refresh"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="spacexFontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size (px)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={8}
                            max={48}
                            value={field.value ?? 14}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 14)}
                            data-testid="input-spacex-font-size"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="spacexShowDetails"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-spacex-show-details"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show mission details</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="spacexShowPatch"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-spacex-show-patch"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show mission patch</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="spacexShowLaunchpad"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-spacex-show-launchpad"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show launchpad info</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="spacexShowLinks"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-spacex-show-links"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show webcast/article links</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {form.watch("type") === "earthquakes" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  Global Earthquakes Settings
                </div>
                <FormField
                  control={form.control}
                  name="earthquakeDisplayMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Mode</FormLabel>
                      <Select
                        value={field.value || "list"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-earthquake-display-mode">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="list">List (static scroll)</SelectItem>
                          <SelectItem value="auto_scroll">Auto-scroll (continuous loop)</SelectItem>
                          <SelectItem value="map">World Map</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("earthquakeDisplayMode") === "auto_scroll" && (
                  <FormField
                    control={form.control}
                    name="earthquakeScrollSpeed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scroll Speed (px/s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={5}
                            max={200}
                            value={field.value ?? 30}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                            data-testid="input-earthquake-scroll-speed"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {form.watch("earthquakeDisplayMode") === "list" && (
                  <>
                    <FormField
                      control={form.control}
                      name="earthquakeItemsPerPage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Items Per Page</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={3}
                              max={50}
                              value={field.value ?? 8}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 8)}
                              data-testid="input-earthquake-items-per-page"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="earthquakePageDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Page Duration (seconds)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={3}
                              max={60}
                              value={field.value ?? 8}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 8)}
                              data-testid="input-earthquake-page-duration"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <FormField
                  control={form.control}
                  name="earthquakeFeed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Feed Window</FormLabel>
                      <Select
                        value={field.value || "all_hour"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-earthquake-feed">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all_hour">All — Past Hour</SelectItem>
                          <SelectItem value="all_day">All — Past Day</SelectItem>
                          <SelectItem value="significant_hour">Significant — Past Hour</SelectItem>
                          <SelectItem value="significant_day">Significant — Past Day</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="earthquakeRefreshInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refresh (s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={30}
                            max={3600}
                            value={field.value ?? 60}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                            data-testid="input-earthquake-refresh"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="earthquakeFontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size (px)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={8}
                            max={48}
                            value={field.value ?? 14}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 14)}
                            data-testid="input-earthquake-font-size"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="earthquakeMinMagnitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Magnitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            step={0.1}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-earthquake-min-mag"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="earthquakeLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Items</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={field.value ?? 50}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 50)}
                            data-testid="input-earthquake-limit"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="earthquakeShowDepth"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-earthquake-show-depth"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show depth</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="earthquakeShowTsunami"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-earthquake-show-tsunami"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show tsunami flag</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="earthquakeShowAlert"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-earthquake-show-alert"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Show alert level</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {form.watch("type") === "aircraft_radar" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Radar className="h-4 w-4" />
                  Aircraft Overhead Radar Settings
                </div>
                <FormField
                  control={form.control}
                  name="aircraftDisplayMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Mode</FormLabel>
                      <Select value={field.value || "radar"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-aircraft-display-mode">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="radar">Radar View</SelectItem>
                          <SelectItem value="map">Map View</SelectItem>
                          <SelectItem value="list">Paginated List</SelectItem>
                          <SelectItem value="auto_scroll">Auto-scroll List</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                {form.watch("aircraftDisplayMode") === "radar" && (
                  <FormField
                    control={form.control}
                    name="aircraftShowSweep"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-aircraft-show-sweep"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Show radar sweep animation</FormLabel>
                      </FormItem>
                    )}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="aircraftRefreshInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refresh (sec)</FormLabel>
                        <FormControl>
                          <Input type="number" min={5} max={300} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-refresh" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="aircraftFontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size</FormLabel>
                        <FormControl>
                          <Input type="number" min={8} max={72} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-font-size" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="aircraftLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Aircraft</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={500} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-limit" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Bounding Box (lat/lon)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="aircraftBoundsLamin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Lat</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min={-90} max={90} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-lamin" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="aircraftBoundsLamax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Lat</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min={-90} max={90} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-lamax" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="aircraftBoundsLomin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Lon</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min={-180} max={180} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-lomin" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="aircraftBoundsLomax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Lon</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min={-180} max={180} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-lomax" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="aircraftShowCallsign"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="checkbox-aircraft-callsign" />
                      </FormControl>
                      <FormLabel className="!mt-0">Show callsign</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aircraftShowAltitude"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="checkbox-aircraft-altitude" />
                      </FormControl>
                      <FormLabel className="!mt-0">Show altitude</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aircraftShowSpeed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="checkbox-aircraft-speed" />
                      </FormControl>
                      <FormLabel className="!mt-0">Show speed</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aircraftShowHeading"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="checkbox-aircraft-heading" />
                      </FormControl>
                      <FormLabel className="!mt-0">Show heading</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aircraftShowCountry"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-aircraft-country" />
                      </FormControl>
                      <FormLabel className="!mt-0">Show country of origin</FormLabel>
                    </FormItem>
                  )}
                />
                {(form.watch("aircraftDisplayMode") === "list") && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="aircraftItemsPerPage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Items/Page</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={50} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-items-per-page" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="aircraftPageDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Page Duration (sec)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={60} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-page-duration" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                {(form.watch("aircraftDisplayMode") === "auto_scroll") && (
                  <FormField
                    control={form.control}
                    name="aircraftScrollSpeed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scroll Speed (px/sec)</FormLabel>
                        <FormControl>
                          <Input type="number" min={5} max={200} {...field} onChange={e => field.onChange(+e.target.value)} data-testid="input-aircraft-scroll-speed" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}

            <ZonePositionFields form={form} layout={layout} />

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
  zone,
  onEdit,
  onDelete,
  isHighlighted,
  onSelect,
}: {
  zone: LayoutZone;
  onEdit: () => void;
  onDelete: () => void;
  isHighlighted?: boolean;
  onSelect?: () => void;
}) {
  const Icon = zoneTypeIcons[zone.type] || Grid3X3;

  return (
    <div
      className={`flex items-center justify-between gap-3 p-2 rounded-md cursor-pointer transition-all ${
        isHighlighted ? "ring-2 ring-cyan-400 bg-cyan-400/10" : "bg-muted/50"
      }`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
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
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(); }} data-testid={`button-edit-zone-${zone.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
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

type DragState = {
  zoneId: string;
  type: "move" | "resize";
  handle?: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  startX: number;
  startY: number;
  startZone: { x: number; y: number; width: number; height: number };
  multiDragStartZones?: Record<string, { x: number; y: number; width: number; height: number }>;
};

type SnapLine = {
  type: "horizontal" | "vertical";
  position: number;
  isCenter?: boolean;
};

const SNAP_THRESHOLD = 2; // percentage

function InteractiveLayoutPreview({
  layout,
  zones,
  onZoneUpdate,
  onSaveAll,
  onDiscardAll,
  hasUnsavedChanges = false,
  selectedZoneId: controlledSelectedZoneId,
  onSelectZone,
  onDoubleClickZone,
  selectedZoneIds: controlledSelectedZoneIds,
  onSelectedZoneIdsChange,
}: {
  layout: LayoutTemplate;
  zones: LayoutZone[];
  onZoneUpdate: (zoneId: string, updates: Partial<LayoutZone>) => void;
  onSaveAll?: () => void;
  onDiscardAll?: () => void;
  hasUnsavedChanges?: boolean;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string | null) => void;
  onDoubleClickZone?: (zoneId: string) => void;
  selectedZoneIds?: Set<string>;
  onSelectedZoneIdsChange?: (ids: Set<string>) => void;
}) {
  const mediaQuery = useSiteFilteredQuery<MediaAsset[]>("/api/media");
  // Fetch media assets for zone rendering
  const { data: allMediaAssets } = useQuery<MediaAsset[]>({
    ...mediaQuery,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragZoneOverrides, setDragZoneOverrides] = useState<Record<string, Partial<LayoutZone>>>({});
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [internalSelectedZoneId, setInternalSelectedZoneId] = useState<string | null>(null);
  const [internalSelectedZoneIds, setInternalSelectedZoneIds] = useState<Set<string>>(new Set());
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  const isControlled = controlledSelectedZoneId !== undefined;
  const selectedZoneId = isControlled ? controlledSelectedZoneId : internalSelectedZoneId;
  const selectedZoneIds = controlledSelectedZoneIds || internalSelectedZoneIds;

  const setSelectedZoneId = useCallback((id: string | null) => {
    if (onSelectZone) onSelectZone(id);
    if (!isControlled) setInternalSelectedZoneId(id);
    const newIds = id ? new Set([id]) : new Set<string>();
    if (onSelectedZoneIdsChange) onSelectedZoneIdsChange(newIds);
    else setInternalSelectedZoneIds(newIds);
  }, [isControlled, onSelectZone, onSelectedZoneIdsChange]);

  const toggleZoneSelection = useCallback((zoneId: string) => {
    const newIds = new Set(selectedZoneIds);
    if (newIds.has(zoneId)) {
      newIds.delete(zoneId);
    } else {
      newIds.add(zoneId);
    }
    const idsArray = Array.from(newIds);
    const primaryId = idsArray.length > 0 ? idsArray[idsArray.length - 1] : null;
    if (onSelectZone) onSelectZone(primaryId);
    if (!isControlled) setInternalSelectedZoneId(primaryId);
    if (onSelectedZoneIdsChange) onSelectedZoneIdsChange(newIds);
    else setInternalSelectedZoneIds(newIds);
  }, [selectedZoneIds, isControlled, onSelectZone, onSelectedZoneIdsChange]);

  // Compute zones to render: merge props with any active drag overrides
  const zonesToRender = useMemo(() => {
    if (Object.keys(dragZoneOverrides).length === 0) {
      return zones;
    }
    return zones.map(zone => ({
      ...zone,
      ...dragZoneOverrides[zone.id],
    }));
  }, [zones, dragZoneOverrides]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedZoneId(null);
        return;
      }

      const zonesToMove = selectedZoneIds.size > 1
        ? zones.filter(z => selectedZoneIds.has(z.id))
        : selectedZoneId ? zones.filter(z => z.id === selectedZoneId) : [];

      if (zonesToMove.length === 0) return;
      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!arrowKeys.includes(e.key)) return;

      e.preventDefault();
      let step: number;
      if (e.shiftKey && containerSize) {
        const pxStepX = (1 / containerSize.width) * 100;
        const pxStepY = (1 / containerSize.height) * 100;
        for (const zone of zonesToMove) {
          let { x, y } = zone;
          switch (e.key) {
            case "ArrowUp":    y = Math.max(0, y - pxStepY); break;
            case "ArrowDown":  y = Math.min(100 - zone.height, y + pxStepY); break;
            case "ArrowLeft":  x = Math.max(0, x - pxStepX); break;
            case "ArrowRight": x = Math.min(100 - zone.width, x + pxStepX); break;
          }
          if (x !== zone.x || y !== zone.y) {
            onZoneUpdate(zone.id, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
          }
        }
        return;
      }
      step = 1;

      for (const zone of zonesToMove) {
        let { x, y } = zone;
        switch (e.key) {
          case "ArrowUp":    y = Math.max(0, y - step); break;
          case "ArrowDown":  y = Math.min(100 - zone.height, y + step); break;
          case "ArrowLeft":  x = Math.max(0, x - step); break;
          case "ArrowRight": x = Math.min(100 - zone.width, x + step); break;
        }
        if (x !== zone.x || y !== zone.y) {
          onZoneUpdate(zone.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedZoneId, selectedZoneIds, zones, onZoneUpdate, containerSize]);

  // Measure wrapper container to fit height
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const getSnapPoints = useCallback((excludeZoneId: string) => {
    const points = {
      x: [0, 50, 100] as number[],
      y: [0, 50, 100] as number[],
    };
    
    zonesToRender.forEach((zone) => {
      if (zone.id === excludeZoneId) return;
      points.x.push(zone.x, zone.x + zone.width);
      points.y.push(zone.y, zone.y + zone.height);
    });
    
    return points;
  }, [zonesToRender]);

  const snapValue = useCallback((value: number, snapPoints: number[]): { value: number; snapped: boolean } => {
    for (const point of snapPoints) {
      if (Math.abs(value - point) < SNAP_THRESHOLD) {
        return { value: point, snapped: true };
      }
    }
    return { value, snapped: false };
  }, []);

  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    zoneId: string,
    type: "move" | "resize",
    handle?: DragState["handle"]
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    const zone = zonesToRender.find(z => z.id === zoneId);
    if (!zone || !containerRef.current) return;

    if (!e.shiftKey) {
      if (!selectedZoneIds.has(zoneId)) {
        setSelectedZoneId(zoneId);
      }
    }

    const multiDragZones = type === "move" && selectedZoneIds.has(zoneId) && selectedZoneIds.size > 1
      ? Object.fromEntries(
          Array.from(selectedZoneIds).map(id => {
            const z = zonesToRender.find(zn => zn.id === id)!;
            return [id, { x: z.x, y: z.y, width: z.width, height: z.height }];
          }).filter(([, z]) => z)
        )
      : undefined;

    setDragState({
      zoneId,
      type,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startZone: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      multiDragStartZones: multiDragZones,
    });
  }, [zonesToRender, selectedZoneIds]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragState.startX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragState.startY) / rect.height) * 100;

    const snapPoints = getSnapPoints(dragState.zoneId);
    const newSnapLines: SnapLine[] = [];

    let newX = dragState.startZone.x;
    let newY = dragState.startZone.y;
    let newWidth = dragState.startZone.width;
    let newHeight = dragState.startZone.height;

    if (dragState.type === "move") {
      newX = Math.max(0, Math.min(100 - dragState.startZone.width, dragState.startZone.x + deltaXPercent));
      newY = Math.max(0, Math.min(100 - dragState.startZone.height, dragState.startZone.y + deltaYPercent));

      const leftSnap = snapValue(newX, snapPoints.x);
      const rightSnap = snapValue(newX + newWidth, snapPoints.x);
      const centerXSnap = snapValue(newX + newWidth / 2, snapPoints.x);
      const topSnap = snapValue(newY, snapPoints.y);
      const bottomSnap = snapValue(newY + newHeight, snapPoints.y);
      const centerYSnap = snapValue(newY + newHeight / 2, snapPoints.y);

      if (centerXSnap.snapped) {
        newX = centerXSnap.value - newWidth / 2;
        newSnapLines.push({ type: "vertical", position: centerXSnap.value, isCenter: centerXSnap.value === 50 });
      } else if (leftSnap.snapped) {
        newX = leftSnap.value;
        newSnapLines.push({ type: "vertical", position: leftSnap.value, isCenter: leftSnap.value === 50 });
      } else if (rightSnap.snapped) {
        newX = rightSnap.value - newWidth;
        newSnapLines.push({ type: "vertical", position: rightSnap.value, isCenter: rightSnap.value === 50 });
      }

      if (centerYSnap.snapped) {
        newY = centerYSnap.value - newHeight / 2;
        newSnapLines.push({ type: "horizontal", position: centerYSnap.value, isCenter: centerYSnap.value === 50 });
      } else if (topSnap.snapped) {
        newY = topSnap.value;
        newSnapLines.push({ type: "horizontal", position: topSnap.value, isCenter: topSnap.value === 50 });
      } else if (bottomSnap.snapped) {
        newY = bottomSnap.value - newHeight;
        newSnapLines.push({ type: "horizontal", position: bottomSnap.value, isCenter: bottomSnap.value === 50 });
      }

      if (dragState.multiDragStartZones) {
        const actualDeltaX = newX - dragState.startZone.x;
        const actualDeltaY = newY - dragState.startZone.y;
        const multiOverrides: Record<string, Partial<LayoutZone>> = {};
        for (const [id, startZone] of Object.entries(dragState.multiDragStartZones)) {
          if (id === dragState.zoneId) continue;
          multiOverrides[id] = {
            x: Math.round(Math.max(0, Math.min(100 - startZone.width, startZone.x + actualDeltaX))),
            y: Math.round(Math.max(0, Math.min(100 - startZone.height, startZone.y + actualDeltaY))),
            width: startZone.width,
            height: startZone.height,
          };
        }
        setSnapLines(newSnapLines);
        setDragZoneOverrides(prev => ({
          ...prev,
          ...multiOverrides,
          [dragState.zoneId]: {
            x: Math.round(newX),
            y: Math.round(newY),
            width: Math.round(newWidth),
            height: Math.round(newHeight),
          },
        }));
        return;
      }
    } else if (dragState.type === "resize" && dragState.handle) {
      const handle = dragState.handle;
      const aspectRatio = dragState.startZone.width / dragState.startZone.height;

      if (handle.includes("w")) {
        const proposedX = dragState.startZone.x + deltaXPercent;
        const snap = snapValue(proposedX, snapPoints.x);
        newX = Math.max(0, Math.min(dragState.startZone.x + dragState.startZone.width - 1, snap.value));
        newWidth = dragState.startZone.width - (newX - dragState.startZone.x);
        if (snap.snapped) newSnapLines.push({ type: "vertical", position: snap.value });
      }
      if (handle.includes("e")) {
        const proposedRight = dragState.startZone.x + dragState.startZone.width + deltaXPercent;
        const snap = snapValue(proposedRight, snapPoints.x);
        newWidth = Math.max(1, Math.min(100 - newX, snap.value - newX));
        if (snap.snapped) newSnapLines.push({ type: "vertical", position: snap.value });
      }
      if (handle.includes("n")) {
        const proposedY = dragState.startZone.y + deltaYPercent;
        const snap = snapValue(proposedY, snapPoints.y);
        newY = Math.max(0, Math.min(dragState.startZone.y + dragState.startZone.height - 1, snap.value));
        newHeight = dragState.startZone.height - (newY - dragState.startZone.y);
        if (snap.snapped) newSnapLines.push({ type: "horizontal", position: snap.value });
      }
      if (handle.includes("s")) {
        const proposedBottom = dragState.startZone.y + dragState.startZone.height + deltaYPercent;
        const snap = snapValue(proposedBottom, snapPoints.y);
        newHeight = Math.max(1, Math.min(100 - newY, snap.value - newY));
        if (snap.snapped) newSnapLines.push({ type: "horizontal", position: snap.value });
      }

      if (e.shiftKey) {
        const isCorner = handle.length === 2;
        const isHorizontalEdge = handle === "e" || handle === "w";
        const isVerticalEdge = handle === "n" || handle === "s";

        if (isCorner) {
          const widthDelta = Math.abs(newWidth - dragState.startZone.width);
          const heightDelta = Math.abs(newHeight - dragState.startZone.height);
          if (widthDelta >= heightDelta) {
            newHeight = newWidth / aspectRatio;
          } else {
            newWidth = newHeight * aspectRatio;
          }
          if (handle.includes("n")) {
            newY = dragState.startZone.y + dragState.startZone.height - newHeight;
          }
          if (handle.includes("w")) {
            newX = dragState.startZone.x + dragState.startZone.width - newWidth;
          }
        } else if (isHorizontalEdge) {
          newHeight = newWidth / aspectRatio;
          newY = dragState.startZone.y + (dragState.startZone.height - newHeight) / 2;
        } else if (isVerticalEdge) {
          newWidth = newHeight * aspectRatio;
          newX = dragState.startZone.x + (dragState.startZone.width - newWidth) / 2;
        }

        if (newX < 0) {
          newX = 0;
          const maxW = handle.includes("w") ? dragState.startZone.x + dragState.startZone.width : 100;
          newWidth = Math.min(newWidth, maxW);
          newHeight = newWidth / aspectRatio;
        }
        if (newY < 0) {
          newY = 0;
          const maxH = handle.includes("n") ? dragState.startZone.y + dragState.startZone.height : 100;
          newHeight = Math.min(newHeight, maxH);
          newWidth = newHeight * aspectRatio;
        }
        if (newX + newWidth > 100) {
          newWidth = 100 - newX;
          newHeight = newWidth / aspectRatio;
        }
        if (newY + newHeight > 100) {
          newHeight = 100 - newY;
          newWidth = newHeight * aspectRatio;
        }
        newWidth = Math.max(1, newWidth);
        newHeight = Math.max(1, newHeight);
      }
    }

    setSnapLines(newSnapLines);
    setDragZoneOverrides(prev => ({
      ...prev,
      [dragState.zoneId]: {
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      },
    }));
  }, [dragState, getSnapPoints, snapValue]);

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      if (dragState.multiDragStartZones && Object.keys(dragZoneOverrides).length > 0) {
        for (const [id, override] of Object.entries(dragZoneOverrides)) {
          onZoneUpdate(id, override);
        }
      } else {
        const override = dragZoneOverrides[dragState.zoneId];
        if (override) {
          onZoneUpdate(dragState.zoneId, override);
        }
      }
    }
    setDragState(null);
    setSnapLines([]);
    setDragZoneOverrides({});
  }, [dragState, dragZoneOverrides, onZoneUpdate]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  const resizeHandles: Array<{ position: DragState["handle"]; cursor: string; style: React.CSSProperties }> = [
    { position: "nw", cursor: "nwse-resize", style: { top: -4, left: -4 } },
    { position: "n", cursor: "ns-resize", style: { top: -4, left: "50%", transform: "translateX(-50%)" } },
    { position: "ne", cursor: "nesw-resize", style: { top: -4, right: -4 } },
    { position: "e", cursor: "ew-resize", style: { top: "50%", right: -4, transform: "translateY(-50%)" } },
    { position: "se", cursor: "nwse-resize", style: { bottom: -4, right: -4 } },
    { position: "s", cursor: "ns-resize", style: { bottom: -4, left: "50%", transform: "translateX(-50%)" } },
    { position: "sw", cursor: "nesw-resize", style: { bottom: -4, left: -4 } },
    { position: "w", cursor: "ew-resize", style: { top: "50%", left: -4, transform: "translateY(-50%)" } },
  ];

  // Calculate aspect ratio for this layout
  const aspectDims = getAspectRatioDimensions(
    layout.aspectRatio || "16:9",
    layout.customWidth,
    layout.customHeight
  );
  const aspectRatioValue = aspectDims.width / aspectDims.height;

  // Use a fixed reference size for rendering, then scale down with CSS transform
  // This ensures all text/fonts/elements scale uniformly
  const REFERENCE_HEIGHT = 720; // Render at 720p equivalent, scale to fit
  const referenceWidth = REFERENCE_HEIGHT * aspectRatioValue;
  const referenceHeight = REFERENCE_HEIGHT;

  // Calculate scale factor to fit the reference size into available space
  const scaleInfo = useMemo(() => {
    if (!containerSize) return { scale: 1, displayWidth: referenceWidth, displayHeight: referenceHeight };
    
    const availableWidth = containerSize.width;
    const availableHeight = containerSize.height;
    
    // Calculate scale to fit within available space
    const scaleX = availableWidth / referenceWidth;
    const scaleY = availableHeight / referenceHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1
    
    return { 
      scale, 
      displayWidth: referenceWidth * scale, 
      displayHeight: referenceHeight * scale 
    };
  }, [containerSize, referenceWidth, referenceHeight]);

  return (
    <div className="flex flex-col h-full space-y-2">
      {hasUnsavedChanges && onSaveAll && onDiscardAll && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex-shrink-0">
          <span className="text-sm text-amber-500 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Unsaved changes
          </span>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onDiscardAll}
              data-testid="button-discard-changes"
            >
              <X className="h-4 w-4 mr-1" />
              Discard
            </Button>
            <Button 
              size="sm" 
              onClick={onSaveAll}
              data-testid="button-save-changes"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      )}
      <div 
        ref={wrapperRef}
        className="flex-1 flex items-start justify-center min-h-0 pt-4"
      >
        {/* Outer container sized to the scaled dimensions */}
        <div 
          style={{ 
            width: scaleInfo.displayWidth, 
            height: scaleInfo.displayHeight,
            overflow: 'hidden',
            borderRadius: '0.5rem',
          }}
        >
          {/* Inner container at reference size, scaled down with transform */}
          <div 
            ref={containerRef}
            className="relative bg-slate-900 select-none"
            style={{ 
              width: referenceWidth, 
              height: referenceHeight,
              transform: `scale(${scaleInfo.scale})`,
              transformOrigin: 'top left',
            }}
            onClick={() => setSelectedZoneId(null)}
            data-testid="interactive-layout-preview"
            tabIndex={0}
          >
      {snapLines.map((line, i) => (
        <div
          key={i}
          className={`absolute z-50 pointer-events-none ${line.isCenter ? "bg-red-500" : "bg-cyan-400"}`}
          style={line.type === "vertical" 
            ? { left: `${line.position}%`, top: 0, bottom: 0, width: 2 }
            : { top: `${line.position}%`, left: 0, right: 0, height: 2 }
          }
        />
      ))}
      
      {zonesToRender.map((zone) => {
        const Icon = zoneTypeIcons[zone.type] || Grid3X3;
        const isSelected = selectedZoneId === zone.id || selectedZoneIds.has(zone.id);
        const isMultiSelected = selectedZoneIds.size > 1 && selectedZoneIds.has(zone.id);
        const isAnchor = isMultiSelected && Array.from(selectedZoneIds)[0] === zone.id;
        const isDragging = dragState?.zoneId === zone.id || (dragState?.multiDragStartZones && zone.id in dragState.multiDragStartZones);
        
        return (
          <div
            key={zone.id}
            className="absolute"
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              zIndex: isMultiSelected ? (zone.zIndex || 1) : isSelected ? 100 : zone.zIndex || 1,
            }}
            data-testid={`draggable-zone-${zone.id}`}
          >
            <div className={`absolute inset-0 pointer-events-none ${zone.type === "shape" ? "" : "overflow-hidden"}`}>
              <ZoneRenderer
                zone={zone}
                media={allMediaAssets || []}
                showBorder={false}
                isPlaying={true}
                fillContainer={true}
              />
            </div>
            
            <div
              className={`absolute inset-0 transition-all pointer-events-auto ${
                isSelected 
                  ? zone.type === "shape"
                    ? isAnchor ? "shadow-lg shadow-amber-400/30" : "shadow-lg shadow-cyan-400/30"
                    : isAnchor 
                      ? "ring-2 ring-amber-400 ring-inset shadow-lg shadow-amber-400/30"
                      : "ring-2 ring-cyan-400 ring-inset shadow-lg shadow-cyan-400/30"
                  : zone.type === "shape"
                    ? ""
                    : "ring-1 ring-transparent hover:ring-white/30"
              } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              style={isSelected && zone.type === "shape" 
                ? { outline: `2px dashed ${isAnchor ? "rgba(251, 191, 36, 0.8)" : "rgba(34, 211, 238, 0.8)"}`, outlineOffset: "-2px" } 
                : !isSelected && zone.type === "shape" 
                  ? {} 
                  : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) {
                  toggleZoneSelection(zone.id);
                } else {
                  setSelectedZoneId(zone.id);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (onDoubleClickZone) onDoubleClickZone(zone.id);
              }}
              onMouseDown={(e) => handleMouseDown(e, zone.id, "move")}
            >
              {isSelected && (
                <div className={`absolute top-1 left-1 flex items-center gap-1 ${isAnchor ? "bg-amber-500" : "bg-cyan-500"} text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none z-10`}>
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{zone.name}{isAnchor ? " (anchor)" : ""}</span>
                </div>
              )}
            </div>
            
            {isSelected && !isMultiSelected && resizeHandles.map(({ position, cursor, style }) => (
              <div
                key={position}
                className="absolute w-3 h-3 bg-cyan-400 border-2 border-white rounded-sm hover:bg-cyan-300 z-20"
                style={{ ...style, cursor }}
                onMouseDown={(e) => handleMouseDown(e, zone.id, "resize", position)}
                data-testid={`resize-handle-${zone.id}-${position}`}
              />
            ))}
          </div>
        );
      })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyMoveDialog({ layout, mode, open, onOpenChange }: { layout: LayoutTemplate; mode: "copy" | "move"; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [targetClientId, setTargetClientId] = useState<string>("");
  const { clients } = useSiteContext();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/layouts/${layout.id}/${mode}-to-site`, { targetClientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      onOpenChange(false);
      setTargetClientId("");
      toast({ title: `Layout ${mode === "copy" ? "copied" : "moved"} successfully` });
    },
    onError: () => {
      toast({ title: `Failed to ${mode} layout`, variant: "destructive" });
    },
  });

  const otherClients = clients.filter(c => c.id !== layout.clientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "copy" ? "Copy" : (layout.clientId ? "Move" : "Assign")} Layout to Site</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {mode === "copy" ? "Create a copy of" : "Assign"} <strong>{layout.name}</strong> {layout.clientId ? "to another site" : "to a site"}.
            {mode === "move" && layout.eventId && " The event association will be cleared if the event belongs to a different site."}
          </p>
          <Select value={targetClientId} onValueChange={setTargetClientId}>
            <SelectTrigger data-testid={`select-${mode}-target-site`}>
              <SelectValue placeholder="Select target site" />
            </SelectTrigger>
            <SelectContent>
              {otherClients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!targetClientId || mutation.isPending}
              data-testid={`button-confirm-${mode}-layout`}
            >
              {mutation.isPending ? (mode === "copy" ? "Copying..." : "Moving...") : (mode === "copy" ? "Copy" : "Move")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LayoutCard({ layout, events }: { layout: LayoutTemplate; events: Event[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | undefined>();
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const [copyMoveMode, setCopyMoveMode] = useState<"copy" | "move" | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const event = events.find((e) => e.id === layout.eventId);
  const savedZones = (layout.zones as LayoutZone[]) || [];
  
  // Draft state for non-destructive editing
  const [draftZones, setDraftZones] = useState<LayoutZone[]>(savedZones);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Sync draft zones when saved zones change from server
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setDraftZones(savedZones);
    }
  }, [savedZones, hasUnsavedChanges]);
  
  // Use draft zones for display, saved zones for operations
  const zones = hasUnsavedChanges ? draftZones : savedZones;
  
  // Look up the current zone from the zones array (ensures fresh data after refetch)
  const editingZone = editingZoneId ? zones.find(z => z.id === editingZoneId) : undefined;

  const handleEditZone = (zone: LayoutZone) => {
    setEditingZoneId(zone.id);
    setZoneDialogOpen(true);
  };

  const handleAddZone = () => {
    setEditingZoneId(undefined);
    setZoneDialogOpen(true);
  };

  const { clients } = useSiteContext();

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: layout.name,
      clientId: layout.clientId || "",
      eventId: layout.eventId || "",
      aspectRatio: layout.aspectRatio || "16:9",
      customWidth: layout.customWidth || undefined,
      customHeight: layout.customHeight || undefined,
    },
  });
  
  const watchAspectRatio = form.watch("aspectRatio");

  const updateMutation = useMutation({
    mutationFn: (data: LayoutFormValues) =>
      apiRequest("PATCH", `/api/layouts/${layout.id}`, {
        ...data,
        clientId: data.clientId === "none" || !data.clientId ? null : data.clientId,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
        customWidth: data.aspectRatio === "custom" ? data.customWidth : null,
        customHeight: data.aspectRatio === "custom" ? data.customHeight : null,
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
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete layout", variant: "destructive" });
    },
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) =>
      apiRequest("POST", `/api/layouts/${layout.id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: layout.locked ? "Layout unlocked" : "Layout locked" });
    },
    onError: () => {
      toast({ title: "Failed to toggle lock", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => 
      apiRequest("POST", "/api/layouts", {
        name: `${layout.name} (Copy)`,
        eventId: layout.eventId,
        aspectRatio: layout.aspectRatio || "16:9",
        customWidth: layout.customWidth,
        customHeight: layout.customHeight,
        zones: zones.map(z => ({ ...z, id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Layout duplicated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate layout", variant: "destructive" });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: (updatedZones: LayoutZone[]) => {
      return apiRequest("PATCH", `/api/layouts/${layout.id}`, { zones: updatedZones });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      setHasUnsavedChanges(false);
      toast({ title: "Layout saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save layout", variant: "destructive" });
    },
  });

  // Non-destructive: update draft state only
  const handleZoneUpdate = (zoneId: string, updates: Partial<LayoutZone>) => {
    setDraftZones(prev => prev.map(z => 
      z.id === zoneId ? { ...z, ...updates } : z
    ));
    setHasUnsavedChanges(true);
  };

  // Save all draft changes to server
  const handleSaveAll = () => {
    updateZoneMutation.mutate(draftZones);
  };

  // Discard all draft changes
  const handleDiscardAll = () => {
    setDraftZones(savedZones);
    setHasUnsavedChanges(false);
  };

  return (
    <>
      <Card className={`overflow-hidden transition-all ${layout.locked ? "ring-1 ring-amber-500/30" : ""}`}>
        <div className="p-3">
          <InteractiveLayoutPreview 
            layout={layout} 
            zones={zones} 
            onZoneUpdate={handleZoneUpdate}
            hasUnsavedChanges={hasUnsavedChanges}
            onSaveAll={handleSaveAll}
            onDiscardAll={handleDiscardAll}
            selectedZoneId={highlightedZoneId}
            onSelectZone={setHighlightedZoneId}
            onDoubleClickZone={(zoneId) => {
              const zone = zones.find(z => z.id === zoneId);
              if (zone) handleEditZone(zone);
            }}
          />
        </div>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pt-0 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base" data-testid={`text-layout-name-${layout.id}`}>
                {layout.name}
              </CardTitle>
              {layout.locked && (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{zones.length} zones</Badge>
              <Badge variant="outline">
                {layout.aspectRatio === "custom" && layout.customWidth && layout.customHeight
                  ? `${layout.customWidth}×${layout.customHeight}px`
                  : layout.aspectRatio || "16:9"}
              </Badge>
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
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={!!layout.locked}>
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
                        name="clientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Site</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-layout-site">
                                  <SelectValue placeholder="Not assigned" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">Not assigned</SelectItem>
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
                      <FormField
                        control={form.control}
                        name="aspectRatio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aspect Ratio</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-layout-aspect-ratio">
                                  <SelectValue placeholder="Select aspect ratio" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {ASPECT_RATIO_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex flex-col">
                                      <span>{opt.label}</span>
                                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {watchAspectRatio === "custom" && (
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="customWidth"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Width (px)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="e.g., 1920"
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                                    data-testid="input-edit-layout-custom-width"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="customHeight"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Height (px)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="e.g., 1080"
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                                    data-testid="input-edit-layout-custom-height"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
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
                onSelect={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending}
                data-testid={`button-duplicate-layout-${layout.id}`}
              >
                <Copy className="mr-2 h-4 w-4" />
                {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setCopyMoveMode("copy")}
                    data-testid={`button-copy-to-site-${layout.id}`}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to Site
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setCopyMoveMode("move")}
                    data-testid={`button-move-to-site-${layout.id}`}
                  >
                    <Move className="mr-2 h-4 w-4" />
                    {layout.clientId ? "Move to Site" : "Assign to Site"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => lockMutation.mutate(!layout.locked)}>
                    {layout.locked ? (
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
                onSelect={() => {
                  if (confirm(`Are you sure you want to delete "${layout.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending || layout.locked}
                data-testid={`button-delete-layout-${layout.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        {isAdmin && copyMoveMode && (
          <CopyMoveDialog
            layout={layout}
            mode={copyMoveMode}
            open={!!copyMoveMode}
            onOpenChange={(v) => { if (!v) setCopyMoveMode(null); }}
          />
        )}

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
                      zone={zone}
                      onEdit={() => handleEditZone(zone)}
                      onDelete={() => {
                        const updated = zones.filter(z => z.id !== zone.id);
                        setDraftZones(updated);
                        setHasUnsavedChanges(true);
                        if (highlightedZoneId === zone.id) setHighlightedZoneId(null);
                      }}
                      isHighlighted={highlightedZoneId === zone.id}
                      onSelect={() => setHighlightedZoneId(highlightedZoneId === zone.id ? null : zone.id)}
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
          if (!open) setEditingZoneId(undefined);
        }}
      />
    </>
  );
}

function CreateLayoutDialog({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { selectedClientId, clients } = useSiteContext();

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: "",
      clientId: selectedClientId || "",
      eventId: "",
      aspectRatio: "16:9",
      customWidth: undefined,
      customHeight: undefined,
    },
  });
  
  const watchAspectRatio = form.watch("aspectRatio");

  const createMutation = useMutation({
    mutationFn: (data: LayoutFormValues) =>
      apiRequest("POST", "/api/layouts", {
        ...data,
        clientId: data.clientId === "none" || !data.clientId ? null : data.clientId,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
        zones: defaultZones,
        customWidth: data.aspectRatio === "custom" ? data.customWidth : null,
        customHeight: data.aspectRatio === "custom" ? data.customHeight : null,
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
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-create-layout-site">
                        <SelectValue placeholder="Not assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Not assigned</SelectItem>
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
            <FormField
              control={form.control}
              name="aspectRatio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aspect Ratio</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-layout-aspect-ratio">
                        <SelectValue placeholder="Select aspect ratio" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASPECT_RATIO_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col">
                            <span>{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watchAspectRatio === "custom" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customWidth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Width (px)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g., 1920"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          data-testid="input-layout-custom-width"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customHeight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Height (px)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g., 1080"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          data-testid="input-layout-custom-height"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
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

function LayoutListItem({ 
  layout, 
  isSelected, 
  onSelect 
}: { 
  layout: LayoutTemplate; 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  const zones = (layout.zones as LayoutZone[]) || [];
  const aspectDims = getAspectRatioDimensions(
    layout.aspectRatio || "16:9",
    layout.customWidth,
    layout.customHeight
  );
  
  return (
    <div
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected 
          ? "bg-primary/10 border border-primary/30" 
          : "hover-elevate border border-transparent"
      }`}
      onClick={onSelect}
      data-testid={`layout-list-item-${layout.id}`}
    >
      <div className="flex items-start gap-3">
        <div 
          className="w-16 h-12 bg-slate-800 rounded flex-shrink-0 relative overflow-hidden"
        >
          {zones.slice(0, 4).map((zone, idx) => (
            <div
              key={zone.id}
              className="absolute"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                backgroundColor: `hsl(${(idx * 60) % 360} 70% 50% / 0.5)`,
              }}
            />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{layout.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">{zones.length} zones</Badge>
            <Badge variant="outline" className="text-xs">
              {layout.aspectRatio === "custom" && layout.customWidth && layout.customHeight
                ? `${layout.customWidth}×${layout.customHeight}px`
                : layout.aspectRatio || "16:9"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutEditorPanel({ 
  layout, 
  events,
  onLayoutChange,
  zones,
  onZonesChange,
  hasUnsavedChanges,
  highlightedZoneId,
  onSelectZone,
  editZoneIdTrigger,
  onEditZoneTriggered,
  showLayoutList,
  onToggleLayoutList,
  onBackToList,
  selectedZoneIds,
}: { 
  layout: LayoutTemplate; 
  events: Event[];
  onLayoutChange: () => void;
  zones: LayoutZone[];
  onZonesChange: (zones: LayoutZone[]) => void;
  hasUnsavedChanges: boolean;
  highlightedZoneId?: string | null;
  onSelectZone?: (zoneId: string | null) => void;
  editZoneIdTrigger?: string | null;
  onEditZoneTriggered?: () => void;
  showLayoutList?: boolean;
  onToggleLayoutList?: () => void;
  onBackToList?: () => void;
  selectedZoneIds?: Set<string>;
}) {
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const editingZone = editingZoneId ? zones.find(z => z.id === editingZoneId) : undefined;
  const { clients } = useSiteContext();
  const { user } = useAuth();
  const isUserAdmin = user?.role === "admin";
  const event = events.find((e) => e.id === layout.eventId);

  useEffect(() => {
    if (editZoneIdTrigger) {
      setEditingZoneId(editZoneIdTrigger);
      setZoneDialogOpen(true);
      if (onEditZoneTriggered) onEditZoneTriggered();
    }
  }, [editZoneIdTrigger]);

  const zoneItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (highlightedZoneId) {
      const el = zoneItemRefs.current.get(highlightedZoneId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [highlightedZoneId]);

  // Drag and drop state for zone reordering
  const [draggedZoneId, setDraggedZoneId] = useState<string | null>(null);
  const [dragOverZoneId, setDragOverZoneId] = useState<string | null>(null);
  const justDraggedRef = useRef(false);

  const handleDragStart = (e: React.DragEvent, zoneId: string) => {
    e.stopPropagation();
    setDraggedZoneId(zoneId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedZoneId && draggedZoneId !== zoneId) {
      setDragOverZoneId(zoneId);
    }
  };

  const handleDragLeave = () => {
    setDragOverZoneId(null);
  };

  const handleDragEnd = () => {
    // Set flag to prevent click from triggering edit after drag
    justDraggedRef.current = true;
    setTimeout(() => { justDraggedRef.current = false; }, 100);
    setDraggedZoneId(null);
    setDragOverZoneId(null);
  };

  const handleDrop = (e: React.DragEvent, targetZoneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedZoneId || draggedZoneId === targetZoneId) {
      handleDragEnd();
      return;
    }

    // Work with sorted array (same order as displayed in UI)
    const sortedZones = [...zones].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    const draggedIndex = sortedZones.findIndex(z => z.id === draggedZoneId);
    const targetIndex = sortedZones.findIndex(z => z.id === targetZoneId);

    if (draggedIndex === -1 || targetIndex === -1) {
      handleDragEnd();
      return;
    }

    // Remove dragged zone and insert at target position in sorted array
    const [draggedZone] = sortedZones.splice(draggedIndex, 1);
    sortedZones.splice(targetIndex, 0, draggedZone);

    // Update z-index based on new sorted order (first item = highest z-index = front)
    const reorderedZones = sortedZones.map((zone, index) => ({
      ...zone,
      zIndex: sortedZones.length - index, // First item gets highest z-index
    }));

    onZonesChange(reorderedZones);
    handleDragEnd();
  };

  const handleZoneItemClick = (zone: LayoutZone) => {
    if (justDraggedRef.current || draggedZoneId) return;
    if (onSelectZone) {
      onSelectZone(highlightedZoneId === zone.id ? null : zone.id);
    }
  };

  const handleZoneItemDoubleClick = (zone: LayoutZone) => {
    if (justDraggedRef.current || draggedZoneId) return;
    handleEditZone(zone);
  };

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: layout.name,
      clientId: layout.clientId || "",
      eventId: layout.eventId || "",
      aspectRatio: layout.aspectRatio || "16:9",
      customWidth: layout.customWidth || undefined,
      customHeight: layout.customHeight || undefined,
    },
  });

  const watchAspectRatio = form.watch("aspectRatio");

  useEffect(() => {
    form.reset({
      name: layout.name,
      clientId: layout.clientId || "",
      eventId: layout.eventId || "",
      aspectRatio: layout.aspectRatio || "16:9",
      customWidth: layout.customWidth || undefined,
      customHeight: layout.customHeight || undefined,
    });
  }, [layout, form]);

  const updateMutation = useMutation({
    mutationFn: (data: LayoutFormValues) =>
      apiRequest("PATCH", `/api/layouts/${layout.id}`, {
        ...data,
        clientId: data.clientId === "none" || !data.clientId ? null : data.clientId,
        eventId: data.eventId === "global" || !data.eventId ? null : data.eventId,
        customWidth: data.aspectRatio === "custom" ? data.customWidth : null,
        customHeight: data.aspectRatio === "custom" ? data.customHeight : null,
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
      onLayoutChange();
      toast({ title: "Layout deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete layout", variant: "destructive" });
    },
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) =>
      apiRequest("POST", `/api/layouts/${layout.id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: layout.locked ? "Layout unlocked" : "Layout locked" });
    },
    onError: () => {
      toast({ title: "Failed to toggle lock", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => 
      apiRequest("POST", "/api/layouts", {
        name: `${layout.name} (Copy)`,
        eventId: layout.eventId,
        aspectRatio: layout.aspectRatio || "16:9",
        customWidth: layout.customWidth,
        customHeight: layout.customHeight,
        zones: zones.map(z => ({ ...z, id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Layout duplicated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate layout", variant: "destructive" });
    },
  });

  const handleDeleteZone = (zoneId: string) => {
    const updatedZones = zones.filter(z => z.id !== zoneId);
    onZonesChange(updatedZones);
    if (editingZoneId === zoneId) {
      setEditingZoneId(undefined);
      setZoneDialogOpen(false);
    }
  };

  const cloneZoneMutation = useMutation({
    mutationFn: (zoneToClone: LayoutZone) => {
      const clonedZone: LayoutZone = {
        ...zoneToClone,
        id: `zone-${Date.now()}`,
        name: `${zoneToClone.name} (Copy)`,
        x: Math.min(zoneToClone.x + 5, 100 - zoneToClone.width),
        y: Math.min(zoneToClone.y + 5, 100 - zoneToClone.height),
      };
      const updatedZones = [...zones, clonedZone];
      return apiRequest("PATCH", `/api/layouts/${layout.id}`, { zones: updatedZones });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Zone cloned" });
    },
    onError: () => {
      toast({ title: "Failed to clone zone", variant: "destructive" });
    },
  });

  const handleEditZone = (zone: LayoutZone) => {
    setEditingZoneId(zone.id);
    setZoneDialogOpen(true);
  };

  const handleAddZone = () => {
    setEditingZoneId(undefined);
    setZoneDialogOpen(true);
  };

  // Handle zone changes from the dialog (updates draft state)
  const handleZoneDialogChange = (updatedZone: LayoutZone, isNew: boolean) => {
    if (isNew) {
      // Prepend new zones to put them at top of list
      onZonesChange([updatedZone, ...zones]);
    } else {
      onZonesChange(zones.map(z => z.id === updatedZone.id ? updatedZone : z));
    }
  };

  return (
    <div className="flex flex-col" style={{ height: '100%', maxHeight: '100%' }}>
      <div className="p-3 border-b space-y-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {!showLayoutList && (
            <Button variant="ghost" size="icon" onClick={onBackToList} data-testid="button-back-to-layouts">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {showLayoutList && (
            <Button variant="ghost" size="icon" onClick={onToggleLayoutList} data-testid="button-hide-layout-list">
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold truncate text-sm">{layout.name}</h2>
              {layout.locked && (
                <Lock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {layout.aspectRatio === "custom" && layout.customWidth && layout.customHeight
                  ? `${layout.customWidth}×${layout.customHeight}px`
                  : layout.aspectRatio || "16:9"}
              </Badge>
              {event && (
                <span className="text-xs text-muted-foreground truncate">{event.name}</span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-layout-actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)} disabled={!!layout.locked}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Layout
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateMutation.mutate()}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              {isUserAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => lockMutation.mutate(!layout.locked)}>
                    {layout.locked ? (
                      <><Unlock className="mr-2 h-4 w-4" />Unlock</>
                    ) : (
                      <><Lock className="mr-2 h-4 w-4" />Lock</>
                    )}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={layout.locked}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleAddZone} data-testid="button-add-zone-editor">
            <Plus className="h-4 w-4 mr-1" />
            Add Zone
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-3">
          {zones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Grid3X3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No zones defined</p>
              <Button variant="ghost" size="sm" onClick={handleAddZone}>
                Add your first zone
              </Button>
            </div>
          ) : (
            [...zones].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)).map((zone) => {
              const Icon = zoneTypeIcons[zone.type] || Grid3X3;
              const isDragging = draggedZoneId === zone.id;
              const isDragOver = dragOverZoneId === zone.id;
              const isHighlighted = highlightedZoneId === zone.id || (selectedZoneIds?.has(zone.id) ?? false);
              return (
                <div
                  key={zone.id}
                  ref={(el) => {
                    if (el) zoneItemRefs.current.set(zone.id, el);
                    else zoneItemRefs.current.delete(zone.id);
                  }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, zone.id)}
                  onDragOver={(e) => handleDragOver(e, zone.id)}
                  onDragLeave={handleDragLeave}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, zone.id)}
                  className={`flex items-center gap-2 p-3 rounded-lg border hover-elevate cursor-pointer transition-all ${
                    isDragging ? "opacity-50 scale-95" : ""
                  } ${isDragOver ? "border-primary border-2 bg-primary/5" : ""} ${
                    isHighlighted ? "ring-2 ring-cyan-400 border-cyan-400 bg-cyan-400/10" : ""
                  }`}
                  onClick={() => handleZoneItemClick(zone)}
                  onDoubleClick={() => handleZoneItemDoubleClick(zone)}
                  data-testid={`zone-item-${zone.id}`}
                >
                  <div 
                    className="cursor-grab active:cursor-grabbing flex-shrink-0 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => e.stopPropagation()}
                    data-testid={`drag-handle-${zone.id}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{zone.name}</p>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        z:{zone.zIndex ?? 1}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {zoneTypeLabels[zone.type] || zone.type} • {zone.width}% × {zone.height}%
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      cloneZoneMutation.mutate(zone);
                    }}
                    data-testid={`button-clone-zone-${zone.id}`}
                  >
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); }}
                        data-testid={`button-delete-zone-${zone.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Zone</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove "{zone.name}" from this layout? You can discard the change before saving.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete-zone">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteZone(zone.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid="button-confirm-delete-zone"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ZoneEditorDialog
        layout={layout}
        zone={editingZone}
        open={zoneDialogOpen}
        onOpenChange={setZoneDialogOpen}
        onZoneChange={handleZoneDialogChange}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
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
                      <Input {...field} data-testid="input-edit-layout-name-panel" />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-layout-site-panel">
                          <SelectValue placeholder="Not assigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not assigned</SelectItem>
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
                name="aspectRatio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aspect Ratio</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ASPECT_RATIO_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchAspectRatio === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customWidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Width (px)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="e.g., 1920"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customHeight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Height (px)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="e.g., 1080"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LivePreviewPanel({ 
  layout,
  zones,
  onZoneUpdate,
  hasUnsavedChanges,
  onSaveAll,
  onDiscardAll,
  highlightedZoneId,
  onSelectZone,
  onDoubleClickZone,
  selectedZoneIds,
  onSelectedZoneIdsChange,
}: { 
  layout: LayoutTemplate;
  zones: LayoutZone[];
  onZoneUpdate: (zoneId: string, updates: Partial<LayoutZone>) => void;
  hasUnsavedChanges: boolean;
  onSaveAll: () => void;
  onDiscardAll: () => void;
  highlightedZoneId?: string | null;
  onSelectZone?: (zoneId: string | null) => void;
  onDoubleClickZone?: (zoneId: string) => void;
  selectedZoneIds: Set<string>;
  onSelectedZoneIdsChange: (ids: Set<string>) => void;
}) {
  const selectedZones = zones.filter(z => selectedZoneIds.has(z.id));

  const anchorZoneId = selectedZoneIds.size > 0 ? Array.from(selectedZoneIds)[0] : null;
  const anchorZone = anchorZoneId ? zones.find(z => z.id === anchorZoneId) : null;

  const alignZones = (alignment: "left" | "center-h" | "right" | "top" | "center-v" | "bottom" | "distribute-h" | "distribute-v") => {
    if (selectedZones.length < 2 || !anchorZone) return;
    const others = selectedZones.filter(z => z.id !== anchorZone.id);

    switch (alignment) {
      case "left": {
        others.forEach(z => onZoneUpdate(z.id, { x: anchorZone.x }));
        break;
      }
      case "center-h": {
        const anchorCenter = anchorZone.x + anchorZone.width / 2;
        others.forEach(z => onZoneUpdate(z.id, { x: Math.round((anchorCenter - z.width / 2) * 10) / 10 }));
        break;
      }
      case "right": {
        const anchorRight = anchorZone.x + anchorZone.width;
        others.forEach(z => onZoneUpdate(z.id, { x: Math.round((anchorRight - z.width) * 10) / 10 }));
        break;
      }
      case "top": {
        others.forEach(z => onZoneUpdate(z.id, { y: anchorZone.y }));
        break;
      }
      case "center-v": {
        const anchorCenter = anchorZone.y + anchorZone.height / 2;
        others.forEach(z => onZoneUpdate(z.id, { y: Math.round((anchorCenter - z.height / 2) * 10) / 10 }));
        break;
      }
      case "bottom": {
        const anchorBottom = anchorZone.y + anchorZone.height;
        others.forEach(z => onZoneUpdate(z.id, { y: Math.round((anchorBottom - z.height) * 10) / 10 }));
        break;
      }
      case "distribute-h": {
        if (selectedZones.length < 3) return;
        const sorted = [...selectedZones].sort((a, b) => a.x - b.x);
        const totalWidth = sorted.reduce((sum, z) => sum + z.width, 0);
        const firstLeft = sorted[0].x;
        const lastRight = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
        const totalSpace = lastRight - firstLeft - totalWidth;
        const gap = totalSpace / (sorted.length - 1);
        let currentX = sorted[0].x + sorted[0].width + gap;
        for (let i = 1; i < sorted.length - 1; i++) {
          onZoneUpdate(sorted[i].id, { x: Math.round(currentX * 10) / 10 });
          currentX += sorted[i].width + gap;
        }
        break;
      }
      case "distribute-v": {
        if (selectedZones.length < 3) return;
        const sorted = [...selectedZones].sort((a, b) => a.y - b.y);
        const totalHeight = sorted.reduce((sum, z) => sum + z.height, 0);
        const firstTop = sorted[0].y;
        const lastBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
        const totalSpace = lastBottom - firstTop - totalHeight;
        const gap = totalSpace / (sorted.length - 1);
        let currentY = sorted[0].y + sorted[0].height + gap;
        for (let i = 1; i < sorted.length - 1; i++) {
          onZoneUpdate(sorted[i].id, { y: Math.round(currentY * 10) / 10 });
          currentY += sorted[i].height + gap;
        }
        break;
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-medium flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          Interactive Preview
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Click to select, drag to move, Shift+click to multi-select, double-click to edit
        </p>
        {selectedZones.length >= 2 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap" data-testid="alignment-toolbar">
            <span className="text-xs text-muted-foreground mr-1">{selectedZones.length} selected (anchor: {anchorZone?.name || "—"}):</span>
            <Button variant="outline" size="icon" onClick={() => alignZones("left")} title="Align left" data-testid="button-align-left">
              <AlignHorizontalJustifyStart className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => alignZones("center-h")} title="Align center horizontally" data-testid="button-align-center-h">
              <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => alignZones("right")} title="Align right" data-testid="button-align-right">
              <AlignHorizontalJustifyEnd className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-0.5" />
            <Button variant="outline" size="icon" onClick={() => alignZones("top")} title="Align top" data-testid="button-align-top">
              <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => alignZones("center-v")} title="Align center vertically" data-testid="button-align-center-v">
              <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => alignZones("bottom")} title="Align bottom" data-testid="button-align-bottom">
              <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
            </Button>
            {selectedZones.length >= 3 && (
              <>
                <div className="w-px h-5 bg-border mx-0.5" />
                <Button variant="outline" size="icon" onClick={() => alignZones("distribute-h")} title="Distribute horizontally" data-testid="button-distribute-h">
                  <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => alignZones("distribute-v")} title="Distribute vertically" data-testid="button-distribute-v">
                  <AlignVerticalSpaceAround className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 p-4 flex items-start justify-center bg-muted/30 min-h-0">
        <div className="w-full h-full">
          <InteractiveLayoutPreview
            layout={layout}
            zones={zones}
            onZoneUpdate={onZoneUpdate}
            hasUnsavedChanges={hasUnsavedChanges}
            onSaveAll={onSaveAll}
            onDiscardAll={onDiscardAll}
            selectedZoneId={highlightedZoneId}
            onSelectZone={onSelectZone}
            onDoubleClickZone={onDoubleClickZone}
            selectedZoneIds={selectedZoneIds}
            onSelectedZoneIdsChange={onSelectedZoneIdsChange}
          />
        </div>
      </div>
    </div>
  );
}

export default function LayoutsPage() {
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const layoutsQuery = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const eventsQuery = useSiteFilteredQuery<Event[]>("/api/events");

  const { data: layouts = [], isLoading: layoutsLoading } = useQuery<LayoutTemplate[]>({
    ...layoutsQuery,
  });

  const { data: events = [] } = useQuery<Event[]>({
    ...eventsQuery,
  });

  const selectedLayout = layouts.find(l => l.id === selectedLayoutId);
  const savedZones = useMemo(() => (selectedLayout?.zones as LayoutZone[]) || [], [selectedLayout?.zones]);
  
  // Draft state for non-destructive editing
  const [draftZones, setDraftZones] = useState<LayoutZone[]>(savedZones);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const [editZoneIdTrigger, setEditZoneIdTrigger] = useState<string | null>(null);
  const [showLayoutList, setShowLayoutList] = useState(true);
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());
  
  // Sync draft zones when layout selection changes or server data updates
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setDraftZones(savedZones);
    }
  }, [savedZones, hasUnsavedChanges]);
  
  // Reset draft when switching layouts
  useEffect(() => {
    setDraftZones(savedZones);
    setHasUnsavedChanges(false);
    setHighlightedZoneId(null);
    setSelectedZoneIds(new Set());
  }, [selectedLayoutId]);

  const updateZoneMutation = useMutation({
    mutationFn: (updatedZones: LayoutZone[]) => {
      if (!selectedLayoutId) throw new Error("No layout selected");
      return apiRequest("PATCH", `/api/layouts/${selectedLayoutId}`, { zones: updatedZones });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      setHasUnsavedChanges(false);
      toast({ title: "Layout saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save layout", variant: "destructive" });
    },
  });

  // Non-destructive: update draft state only
  const handleZoneUpdate = (zoneId: string, updates: Partial<LayoutZone>) => {
    setDraftZones(prev => prev.map(z => 
      z.id === zoneId ? { ...z, ...updates } : z
    ));
    setHasUnsavedChanges(true);
  };

  // Save all draft changes to server
  const handleSaveAll = () => {
    updateZoneMutation.mutate(draftZones);
  };

  // Discard all draft changes
  const handleDiscardAll = () => {
    setDraftZones(savedZones);
    setHasUnsavedChanges(false);
  };

  useEffect(() => {
    if (layouts.length > 0 && !selectedLayoutId) {
      setSelectedLayoutId(layouts[0].id);
      setShowLayoutList(false);
    }
    if (selectedLayoutId && !layouts.find(l => l.id === selectedLayoutId)) {
      setSelectedLayoutId(layouts.length > 0 ? layouts[0].id : null);
    }
  }, [layouts, selectedLayoutId]);

  if (layoutsLoading) {
    return (
      <div className="h-full flex">
        <div className="w-64 border-r p-4 space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="w-96 h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (layouts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="max-w-md py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Layout className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No layouts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create layout templates to define how content appears on your
              screens with zones for media, tickers, and widgets.
            </p>
            <CreateLayoutDialog events={events} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="-m-6 flex overflow-hidden" style={{ height: 'calc(100vh - 3.5rem)' }} data-testid="layouts-page">
      {(!selectedLayout || showLayoutList) && (
        <div className="w-80 min-w-80 flex-shrink-0 border-r flex flex-col overflow-hidden bg-background">
          <div className="p-4 border-b flex items-center justify-between gap-2">
            <h1 className="font-semibold" data-testid="text-layouts-title">Layouts</h1>
            <CreateLayoutDialog events={events} />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {layouts.map((layout) => (
                <LayoutListItem
                  key={layout.id}
                  layout={layout}
                  isSelected={layout.id === selectedLayoutId}
                  onSelect={() => {
                    setSelectedLayoutId(layout.id);
                    setShowLayoutList(false);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {selectedLayout ? (
        <div className="flex-1 flex min-w-0 overflow-hidden h-full">
          <div className="w-[26rem] min-w-[20rem] shrink border-r overflow-hidden flex flex-col h-full">
            <LayoutEditorPanel 
              layout={selectedLayout} 
              events={events}
              onLayoutChange={() => setSelectedLayoutId(null)}
              zones={draftZones}
              onZonesChange={(newZones) => {
                setDraftZones(newZones);
                setHasUnsavedChanges(true);
              }}
              hasUnsavedChanges={hasUnsavedChanges}
              highlightedZoneId={highlightedZoneId}
              onSelectZone={setHighlightedZoneId}
              editZoneIdTrigger={editZoneIdTrigger}
              onEditZoneTriggered={() => setEditZoneIdTrigger(null)}
              showLayoutList={showLayoutList}
              onToggleLayoutList={() => setShowLayoutList(!showLayoutList)}
              onBackToList={() => {
                setShowLayoutList(true);
              }}
              selectedZoneIds={selectedZoneIds}
            />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            <LivePreviewPanel 
              layout={selectedLayout} 
              zones={draftZones}
              onZoneUpdate={handleZoneUpdate}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveAll={handleSaveAll}
              onDiscardAll={handleDiscardAll}
              highlightedZoneId={highlightedZoneId}
              onSelectZone={setHighlightedZoneId}
              onDoubleClickZone={(zoneId) => setEditZoneIdTrigger(zoneId)}
              selectedZoneIds={selectedZoneIds}
              onSelectedZoneIdsChange={setSelectedZoneIds}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Layout className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a layout to edit</p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
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
  weather: CloudSun,
  news: Newspaper,
  text: Type,
  shader: Sparkles,
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
};

const zoneFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["media", "ticker", "clock", "logo", "html", "weather", "news", "text", "shader"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  zIndex: z.number().min(0).max(100),
  // Zone styling options
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundVideo: z.string().optional(),
  textColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().min(0).max(20).optional(),
  borderRadius: z.number().min(0).max(50).optional(),
  // Weather widget configuration
  weatherLocation: z.string().optional(),
  weatherLat: z.number().optional(),
  weatherLng: z.number().optional(),
  weatherUnit: z.enum(["celsius", "fahrenheit"]).optional(),
  // News widget configuration
  newsRssUrl: z.string().optional(),
  newsScrollSpeed: z.number().min(10).max(200).optional(),
  newsItemCount: z.number().min(1).max(50).optional(),
  newsTextSize: z.enum(["small", "medium", "large"]).optional(),
  // Text widget configuration
  textContent: z.string().optional(),
  textFontSize: z.enum(["small", "medium", "large", "xlarge"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  textVerticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  // Shader widget configuration
  shaderPreset: z.enum(["gradient", "plasma", "waves", "noise", "aurora", "custom"]).optional(),
  shaderCode: z.string().optional(),
  shaderSpeed: z.number().min(0.1).max(5).optional(),
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
  const [isGeocoding, setIsGeocoding] = useState(false);

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
      backgroundColor: "",
      backgroundImage: "",
      backgroundVideo: "",
      textColor: "",
      borderColor: "",
      borderWidth: 0,
      borderRadius: 0,
      weatherLocation: "",
      weatherLat: undefined,
      weatherLng: undefined,
      weatherUnit: "celsius",
      newsRssUrl: "",
      newsScrollSpeed: 50,
      newsItemCount: 10,
      newsTextSize: "medium",
      textContent: "",
      textFontSize: "medium",
      textAlign: "center",
      textVerticalAlign: "middle",
      shaderPreset: "gradient",
      shaderCode: "",
      shaderSpeed: 1,
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
          backgroundColor: zone.backgroundColor || "",
          backgroundImage: zone.backgroundImage || "",
          backgroundVideo: zone.backgroundVideo || "",
          textColor: zone.textColor || "",
          borderColor: zone.borderColor || "",
          borderWidth: zone.borderWidth || 0,
          borderRadius: zone.borderRadius || 0,
          weatherLocation: zone.weatherLocation || "",
          weatherLat: zone.weatherLat,
          weatherLng: zone.weatherLng,
          weatherUnit: zone.weatherUnit || "celsius",
          newsRssUrl: zone.newsRssUrl || "",
          newsScrollSpeed: zone.newsScrollSpeed || 50,
          newsItemCount: zone.newsItemCount || 10,
          newsTextSize: zone.newsTextSize || "medium",
          textContent: zone.textContent || "",
          textFontSize: zone.textFontSize || "medium",
          textAlign: zone.textAlign || "center",
          textVerticalAlign: zone.textVerticalAlign || "middle",
          shaderPreset: zone.shaderPreset || "gradient",
          shaderCode: zone.shaderCode || "",
          shaderSpeed: zone.shaderSpeed || 1,
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
          backgroundColor: "",
          backgroundImage: "",
          backgroundVideo: "",
          textColor: "",
          borderColor: "",
          borderWidth: 0,
          borderRadius: 0,
          weatherLocation: "",
          weatherLat: undefined,
          weatherLng: undefined,
          weatherUnit: "celsius",
          newsRssUrl: "",
          newsScrollSpeed: 50,
          newsItemCount: 10,
          newsTextSize: "medium",
          textContent: "",
          textFontSize: "medium",
          textAlign: "center",
          textVerticalAlign: "middle",
          shaderPreset: "gradient",
          shaderCode: "",
          shaderSpeed: 1,
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
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            className="w-12 h-9 p-1 cursor-pointer"
                            value={field.value || "#000000"} 
                            onChange={(e) => field.onChange(e.target.value)}
                            data-testid="input-bg-color"
                          />
                          <Input 
                            placeholder="#000000 or transparent" 
                            {...field}
                            value={field.value || ""}
                            data-testid="input-bg-color-text"
                          />
                        </div>
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
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            className="w-12 h-9 p-1 cursor-pointer"
                            value={field.value || "#ffffff"} 
                            onChange={(e) => field.onChange(e.target.value)}
                            data-testid="input-text-color"
                          />
                          <Input 
                            placeholder="#ffffff" 
                            {...field}
                            value={field.value || ""}
                            data-testid="input-text-color-text"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            className="w-10 h-9 p-1 cursor-pointer"
                            value={field.value || "#ffffff"} 
                            onChange={(e) => field.onChange(e.target.value)}
                            data-testid="input-border-color"
                          />
                          <Input 
                            placeholder="#fff" 
                            {...field}
                            value={field.value || ""}
                            className="flex-1"
                            data-testid="input-border-color-text"
                          />
                        </div>
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

            {/* Weather Widget Configuration */}
            {form.watch("type") === "weather" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CloudSun className="h-4 w-4" />
                  Weather Widget Settings
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
                              min={10}
                              max={200}
                              step={10}
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
                        <Select
                          value={field.value || "medium"}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-news-text-size">
                              <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
                      <FormLabel>Text Content</FormLabel>
                      <FormControl>
                        <textarea 
                          placeholder="Enter your text here..." 
                          className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background resize-y"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-text-content" 
                        />
                      </FormControl>
                      <FormDescription>The text to display in this zone</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="textFontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size</FormLabel>
                        <Select
                          value={field.value || "medium"}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-text-font-size">
                              <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                            <SelectItem value="xlarge">Extra Large</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                {form.watch("shaderPreset") === "custom" && (
                  <FormField
                    control={form.control}
                    name="shaderCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GLSL Fragment Shader Code</FormLabel>
                        <FormControl>
                          <textarea 
                            placeholder={`// Available uniforms:\n// uniform float u_time;\n// uniform vec2 u_resolution;\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  gl_FragColor = vec4(uv.x, uv.y, 0.5, 1.0);\n}`}
                            className="w-full min-h-[200px] p-3 rounded-md border border-input bg-background font-mono text-sm resize-y"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-shader-code" 
                          />
                        </FormControl>
                        <FormDescription>
                          Write GLSL fragment shader code. Use u_time for animation and u_resolution for coordinates.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}

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

type DragState = {
  zoneId: string;
  type: "move" | "resize";
  handle?: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  startX: number;
  startY: number;
  startZone: { x: number; y: number; width: number; height: number };
};

type SnapLine = {
  type: "horizontal" | "vertical";
  position: number;
};

const SNAP_THRESHOLD = 2; // percentage

function InteractiveLayoutPreview({
  layout,
  zones,
  onZoneUpdate,
}: {
  layout: LayoutTemplate;
  zones: LayoutZone[];
  onZoneUpdate: (zoneId: string, updates: Partial<LayoutZone>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [localZones, setLocalZones] = useState<LayoutZone[]>(zones);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    setLocalZones(zones);
  }, [zones]);

  const getSnapPoints = useCallback((excludeZoneId: string) => {
    const points = {
      x: [0, 100] as number[],
      y: [0, 100] as number[],
    };
    
    localZones.forEach((zone) => {
      if (zone.id === excludeZoneId) return;
      points.x.push(zone.x, zone.x + zone.width);
      points.y.push(zone.y, zone.y + zone.height);
    });
    
    return points;
  }, [localZones]);

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
    
    const zone = localZones.find(z => z.id === zoneId);
    if (!zone || !containerRef.current) return;

    setSelectedZoneId(zoneId);
    setDragState({
      zoneId,
      type,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startZone: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
    });
  }, [localZones]);

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
      const topSnap = snapValue(newY, snapPoints.y);
      const bottomSnap = snapValue(newY + newHeight, snapPoints.y);

      if (leftSnap.snapped) {
        newX = leftSnap.value;
        newSnapLines.push({ type: "vertical", position: leftSnap.value });
      } else if (rightSnap.snapped) {
        newX = rightSnap.value - newWidth;
        newSnapLines.push({ type: "vertical", position: rightSnap.value });
      }

      if (topSnap.snapped) {
        newY = topSnap.value;
        newSnapLines.push({ type: "horizontal", position: topSnap.value });
      } else if (bottomSnap.snapped) {
        newY = bottomSnap.value - newHeight;
        newSnapLines.push({ type: "horizontal", position: bottomSnap.value });
      }
    } else if (dragState.type === "resize" && dragState.handle) {
      const handle = dragState.handle;

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
    }

    setSnapLines(newSnapLines);
    setLocalZones(prev => prev.map(z => 
      z.id === dragState.zoneId 
        ? { ...z, x: Math.round(newX), y: Math.round(newY), width: Math.round(newWidth), height: Math.round(newHeight) }
        : z
    ));
  }, [dragState, getSnapPoints, snapValue]);

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      const zone = localZones.find(z => z.id === dragState.zoneId);
      if (zone) {
        onZoneUpdate(dragState.zoneId, {
          x: zone.x,
          y: zone.y,
          width: zone.width,
          height: zone.height,
        });
      }
    }
    setDragState(null);
    setSnapLines([]);
  }, [dragState, localZones, onZoneUpdate]);

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

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden select-none"
      onClick={() => setSelectedZoneId(null)}
      data-testid="interactive-layout-preview"
    >
      {snapLines.map((line, i) => (
        <div
          key={i}
          className="absolute bg-cyan-400 z-50 pointer-events-none"
          style={line.type === "vertical" 
            ? { left: `${line.position}%`, top: 0, bottom: 0, width: 2 }
            : { top: `${line.position}%`, left: 0, right: 0, height: 2 }
          }
        />
      ))}
      
      {localZones.map((zone, idx) => {
        const Icon = zoneTypeIcons[zone.type] || Grid3X3;
        const isSelected = selectedZoneId === zone.id;
        const isDragging = dragState?.zoneId === zone.id;
        
        return (
          <div
            key={zone.id}
            className={`absolute flex items-center justify-center border-2 transition-shadow ${
              isSelected ? "border-cyan-400 shadow-lg shadow-cyan-400/30" : "border-white/30"
            } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              backgroundColor: `hsl(${(idx * 60) % 360} 70% 50% / 0.4)`,
              zIndex: isSelected ? 100 : zone.zIndex || 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedZoneId(zone.id);
            }}
            onMouseDown={(e) => handleMouseDown(e, zone.id, "move")}
            data-testid={`draggable-zone-${zone.id}`}
          >
            <div className="flex flex-col items-center gap-1 text-white/90 pointer-events-none">
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{zone.name}</span>
            </div>
            
            {isSelected && resizeHandles.map(({ position, cursor, style }) => (
              <div
                key={position}
                className="absolute w-3 h-3 bg-cyan-400 border border-white rounded-sm hover:bg-cyan-300 z-10"
                style={{ ...style, cursor }}
                onMouseDown={(e) => handleMouseDown(e, zone.id, "resize", position)}
                data-testid={`resize-handle-${zone.id}-${position}`}
              />
            ))}
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
  const [editingZoneId, setEditingZoneId] = useState<string | undefined>();
  const { toast } = useToast();

  const event = events.find((e) => e.id === layout.eventId);
  const zones = (layout.zones as LayoutZone[]) || [];
  
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

  const duplicateMutation = useMutation({
    mutationFn: () => 
      apiRequest("POST", "/api/layouts", {
        name: `${layout.name} (Copy)`,
        eventId: layout.eventId,
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
    mutationFn: ({ zoneId, updates }: { zoneId: string; updates: Partial<LayoutZone> }) => {
      const updatedZones = zones.map(z => 
        z.id === zoneId ? { ...z, ...updates } : z
      );
      return apiRequest("PATCH", `/api/layouts/${layout.id}`, { zones: updatedZones });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
    },
    onError: () => {
      toast({ title: "Failed to update zone", variant: "destructive" });
    },
  });

  const handleZoneUpdate = (zoneId: string, updates: Partial<LayoutZone>) => {
    updateZoneMutation.mutate({ zoneId, updates });
  };

  return (
    <>
      <Card className="overflow-hidden transition-all">
        <div className="p-3">
          <InteractiveLayoutPreview 
            layout={layout} 
            zones={zones} 
            onZoneUpdate={handleZoneUpdate}
          />
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
                onSelect={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending}
                data-testid={`button-duplicate-layout-${layout.id}`}
              >
                <Copy className="mr-2 h-4 w-4" />
                {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  if (confirm(`Are you sure you want to delete "${layout.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-layout-${layout.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
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
          if (!open) setEditingZoneId(undefined);
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

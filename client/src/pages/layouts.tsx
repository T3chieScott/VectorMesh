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
  Images,
  Monitor,
  AlertTriangle,
  X,
  Save,
  GripVertical,
  QrCode,
  Upload,
} from "lucide-react";
import type { LayoutTemplate, Event, LayoutZone, MediaAsset } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ZoneRenderer } from "@/components/zone-renderer";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 (Landscape)", description: "Standard widescreen" },
  { value: "9:16", label: "9:16 (Portrait)", description: "Vertical displays" },
  { value: "4:3", label: "4:3 (Standard)", description: "Traditional format" },
  { value: "1:1", label: "1:1 (Square)", description: "Square displays" },
  { value: "custom", label: "Custom", description: "Custom ratio" },
];

const layoutFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  eventId: z.string().optional(),
  aspectRatio: z.string().default("16:9"),
  customWidth: z.number().optional(),
  customHeight: z.number().optional(),
}).refine((data) => {
  if (data.aspectRatio === "custom") {
    return data.customWidth && data.customWidth > 0 && data.customHeight && data.customHeight > 0;
  }
  return true;
}, { message: "Custom width and height are required for custom aspect ratio", path: ["customWidth"] });

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
};

const zoneFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["media", "ticker", "clock", "logo", "html", "weather", "news", "text", "shader", "montage", "qrcode"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
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
  // Weather widget configuration
  weatherLocation: z.string().optional(),
  weatherLat: z.number().optional(),
  weatherLng: z.number().optional(),
  weatherUnit: z.enum(["celsius", "fahrenheit"]).optional(),
  // News widget configuration
  newsRssUrl: z.string().optional(),
  newsScrollSpeed: z.number().min(1).max(200).optional(),
  newsItemCount: z.number().min(1).max(50).optional(),
  newsTextSize: z.enum(["small", "medium", "large"]).optional(),
  // Text widget configuration
  textContent: z.string().optional(),
  textFontSize: z.enum(["small", "medium", "large", "xlarge"]).optional(),
  // Ticker widget configuration
  tickerScrollSpeed: z.number().min(5).max(60).optional(),
  tickerAnimation: z.enum(["scroll-left", "scroll-up", "typewriter", "fade", "slide-in"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  textVerticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  // Shader widget configuration
  shaderPreset: z.enum(["gradient", "plasma", "waves", "noise", "aurora", "custom"]).optional(),
  shaderCode: z.string().optional(),
  shaderSpeed: z.number().min(0.1).max(5).optional(),
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
  qrLabelFontSize: z.enum(["small", "medium", "large"]).optional(),
  qrLabelColor: z.string().optional(),
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
  const { data: mediaAssets, isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  // Filter to only show images
  const imageAssets = mediaAssets?.filter(
    (asset) => asset.mediaType === "image" || asset.mediaType === "gif"
  ) || [];

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newIds = [...selectedIds];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    onSelectionChange(newIds);
  };

  const moveDown = (index: number) => {
    if (index >= selectedIds.length - 1) return;
    const newIds = [...selectedIds];
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
  const selectedAssets = selectedIds
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
                  src={asset.thumbnailPath || asset.originalPath}
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
            const isSelected = selectedIds.includes(asset.id);
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
                  src={asset.thumbnailPath || asset.originalPath}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />
                {isSelected && (
                  <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                    <span className="text-xs">
                      {selectedIds.indexOf(asset.id) + 1}
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

  // Fetch media assets for selection
  const { data: mediaAssets } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  // Store upload URLs by file ID for reliable retrieval in complete handler
  const uploadUrlMapRef = useRef<Map<string, string>>(new Map());

  // Upload handlers
  const handleUploadComplete = async (result: any) => {
    if (result.successful?.length > 0) {
      const file = result.successful[0];
      // Get URL from our map (most reliable) or fall back to Uppy's built-in properties
      const uploadURL = uploadUrlMapRef.current.get(file.id) || 
                        file.response?.body?.uploadURL || 
                        file.uploadURL;
      
      // Clear the stored URL
      uploadUrlMapRef.current.delete(file.id);
      
      if (!uploadURL) {
        console.error("Upload URL not found for file:", file.id);
        toast({ title: "Upload completed but file URL not found", variant: "destructive" });
        setIsUploading(false);
        return;
      }
      
      try {
        // Create media record - strip query params from URL to get storage path
        const response = await apiRequest("POST", "/api/media", {
          name: file.name,
          originalPath: uploadURL.split("?")[0],
          mediaType: file.type?.startsWith("video/")
            ? "video"
            : file.type === "image/gif"
            ? "gif"
            : "image",
          mimeType: file.type,
          fileSize: file.size,
        });
        const newMedia = await response.json();
        
        // Auto-select the newly uploaded media
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

  const handleGetUploadParameters = async (file: any) => {
    setIsUploading(true);
    const res = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
      }),
    });
    const { uploadURL } = await res.json();
    
    // Store the upload URL for reliable retrieval in complete handler
    uploadUrlMapRef.current.set(file.id, uploadURL);
    
    return {
      method: "PUT" as const,
      url: uploadURL,
      headers: { "Content-Type": file.type },
    };
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
      qrLabelFontSize: "medium",
      qrLabelColor: "#000000",
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
          qrLabelFontSize: zone.qrLabelFontSize || "medium",
          qrLabelColor: zone.qrLabelColor || "#000000",
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
          qrLabelFontSize: "medium",
          qrLabelColor: "#000000",
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
                            <div className="flex gap-2">
                              <Input 
                                type="color" 
                                className="w-10 h-9 p-1 cursor-pointer"
                                value={field.value || "#000000"} 
                                onChange={(e) => field.onChange(e.target.value)}
                                data-testid="input-text-shadow-color"
                              />
                              <Input 
                                placeholder="#000000" 
                                {...field}
                                value={field.value || ""}
                                className="flex-1"
                                data-testid="input-text-shadow-color-text"
                              />
                            </div>
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
                          <div className="flex gap-2">
                            <Input 
                              type="color" 
                              className="w-10 h-9 p-1 cursor-pointer"
                              value={field.value || "#000000"} 
                              onChange={(e) => field.onChange(e.target.value)}
                              data-testid="input-text-outline-color"
                            />
                            <Input 
                              placeholder="#000000" 
                              {...field}
                              value={field.value || ""}
                              className="flex-1"
                              data-testid="input-text-outline-color-text"
                            />
                          </div>
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
                            <div className="flex gap-2">
                              <Input 
                                type="color" 
                                className="w-12 h-9 p-1 cursor-pointer"
                                value={field.value || "#000000"} 
                                onChange={(e) => field.onChange(e.target.value)}
                                data-testid="input-gradient-end-color"
                              />
                              <Input 
                                placeholder="#000000" 
                                {...field}
                                value={field.value || ""}
                                className="flex-1"
                                data-testid="input-gradient-end-color-text"
                              />
                            </div>
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
                      <FormLabel>Select or Upload Image</FormLabel>
                      <div className="flex gap-2">
                        <Select
                          value={field.value || "__none__"}
                          onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                        >
                          <FormControl>
                            <SelectTrigger className="flex-1" data-testid="select-media-asset">
                              <SelectValue placeholder="Choose an image..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {mediaAssets?.filter(a => a.mediaType === "image" || a.mediaType === "gif").map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <ObjectUploader
                          maxNumberOfFiles={1}
                          maxFileSize={104857600}
                          onGetUploadParameters={handleGetUploadParameters}
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
                        Select an existing image or upload a new one
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("mediaId") && (
                  <div className="mt-2 p-2 bg-background rounded border">
                    <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                    <div className="aspect-video bg-muted rounded overflow-hidden">
                      <img
                        src={mediaAssets?.find(a => a.id === form.watch("mediaId"))?.originalPath}
                        alt="Selected media"
                        className="w-full h-full object-contain"
                      />
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
                      <FormLabel>Scrolling Text</FormLabel>
                      <FormControl>
                        <textarea 
                          placeholder="Enter your scrolling ticker text here... Use • to separate items" 
                          className="w-full min-h-[80px] p-3 rounded-md border border-input bg-background resize-y"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-ticker-text" 
                        />
                      </FormControl>
                      <FormDescription>Text that will scroll across the ticker zone</FormDescription>
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
                          <FormLabel>Organization</FormLabel>
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
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                type="color"
                                {...field}
                                value={field.value || "#000000"}
                                className="w-12 h-9 p-1 cursor-pointer"
                                data-testid="input-qr-fg-color"
                              />
                            </FormControl>
                            <Input
                              value={field.value || "#000000"}
                              onChange={field.onChange}
                              placeholder="#000000"
                              className="flex-1"
                            />
                          </div>
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
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                type="color"
                                {...field}
                                value={field.value || "#ffffff"}
                                className="w-12 h-9 p-1 cursor-pointer"
                                data-testid="input-qr-bg-color"
                              />
                            </FormControl>
                            <Input
                              value={field.value || "#ffffff"}
                              onChange={field.onChange}
                              placeholder="#ffffff"
                              className="flex-1"
                            />
                          </div>
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
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Font Size</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "medium"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-qr-label-size">
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

                      <FormField
                        control={form.control}
                        name="qrLabelColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Label Color</FormLabel>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input
                                  type="color"
                                  {...field}
                                  value={field.value || "#000000"}
                                  className="w-12 h-9 p-1 cursor-pointer"
                                  data-testid="input-qr-label-color"
                                />
                              </FormControl>
                              <Input
                                value={field.value || "#000000"}
                                onChange={field.onChange}
                                placeholder="#000000"
                                className="flex-1"
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
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
  onSaveAll,
  onDiscardAll,
  hasUnsavedChanges = false,
}: {
  layout: LayoutTemplate;
  zones: LayoutZone[];
  onZoneUpdate: (zoneId: string, updates: Partial<LayoutZone>) => void;
  onSaveAll?: () => void;
  onDiscardAll?: () => void;
  hasUnsavedChanges?: boolean;
}) {
  // Fetch media assets for zone rendering
  const { data: allMediaAssets } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragZoneOverrides, setDragZoneOverrides] = useState<Record<string, Partial<LayoutZone>>>({});
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

    setSelectedZoneId(zoneId);
    setDragState({
      zoneId,
      type,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startZone: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
    });
  }, [zonesToRender]);

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
        newSnapLines.push({ type: "vertical", position: centerXSnap.value });
      } else if (leftSnap.snapped) {
        newX = leftSnap.value;
        newSnapLines.push({ type: "vertical", position: leftSnap.value });
      } else if (rightSnap.snapped) {
        newX = rightSnap.value - newWidth;
        newSnapLines.push({ type: "vertical", position: rightSnap.value });
      }

      if (centerYSnap.snapped) {
        newY = centerYSnap.value - newHeight / 2;
        newSnapLines.push({ type: "horizontal", position: centerYSnap.value });
      } else if (topSnap.snapped) {
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
      const override = dragZoneOverrides[dragState.zoneId];
      if (override) {
        onZoneUpdate(dragState.zoneId, override);
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

  // Calculate preview dimensions to fit height first
  const previewDimensions = useMemo(() => {
    if (!containerSize) return null;
    
    const availableWidth = containerSize.width;
    const availableHeight = containerSize.height;
    
    // Calculate dimensions based on fitting to height
    let previewHeight = availableHeight;
    let previewWidth = previewHeight * aspectRatioValue;
    
    // If width exceeds available space, scale down to fit width instead
    if (previewWidth > availableWidth) {
      previewWidth = availableWidth;
      previewHeight = previewWidth / aspectRatioValue;
    }
    
    return { width: previewWidth, height: previewHeight };
  }, [containerSize, aspectRatioValue]);

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
        className="flex-1 flex items-center justify-center min-h-0"
      >
        <div 
          ref={containerRef}
          className="relative bg-slate-900 rounded-lg overflow-hidden select-none"
          style={previewDimensions ? { 
            width: previewDimensions.width, 
            height: previewDimensions.height 
          } : { width: '100%', aspectRatio: `${aspectDims.width} / ${aspectDims.height}` }}
          onClick={() => setSelectedZoneId(null)}
          data-testid="interactive-layout-preview"
          tabIndex={0}
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
      
      {zonesToRender.map((zone) => {
        const Icon = zoneTypeIcons[zone.type] || Grid3X3;
        const isSelected = selectedZoneId === zone.id;
        const isDragging = dragState?.zoneId === zone.id;
        
        return (
          <div
            key={zone.id}
            className="absolute"
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              zIndex: isSelected ? 100 : zone.zIndex || 1,
            }}
            data-testid={`draggable-zone-${zone.id}`}
          >
            <div className="absolute inset-0 overflow-hidden">
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
                  ? "ring-2 ring-cyan-400 ring-inset shadow-lg shadow-cyan-400/30" 
                  : "ring-1 ring-transparent hover:ring-white/30"
              } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedZoneId(zone.id);
              }}
              onMouseDown={(e) => handleMouseDown(e, zone.id, "move")}
            >
              {isSelected && (
                <div className="absolute top-1 left-1 flex items-center gap-1 bg-cyan-500 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none z-10">
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{zone.name}</span>
                </div>
              )}
            </div>
            
            {isSelected && resizeHandles.map(({ position, cursor, style }) => (
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
  );
}

function LayoutCard({ layout, events }: { layout: LayoutTemplate; events: Event[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | undefined>();
  const { toast } = useToast();

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

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: layout.name,
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
    onError: () => {
      toast({ title: "Failed to delete layout", variant: "destructive" });
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
      <Card className="overflow-hidden transition-all">
        <div className="p-3">
          <InteractiveLayoutPreview 
            layout={layout} 
            zones={zones} 
            onZoneUpdate={handleZoneUpdate}
            hasUnsavedChanges={hasUnsavedChanges}
            onSaveAll={handleSaveAll}
            onDiscardAll={handleDiscardAll}
          />
        </div>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pt-0 pb-3">
          <div>
            <CardTitle className="text-base" data-testid={`text-layout-name-${layout.id}`}>
              {layout.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{zones.length} zones</Badge>
              <Badge variant="outline">
                {layout.aspectRatio === "custom" && layout.customWidth && layout.customHeight
                  ? `${layout.customWidth}:${layout.customHeight}`
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
                                <FormLabel>Width</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
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
                                <FormLabel>Height</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
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
                      <FormLabel>Width</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g., 21"
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
                      <FormLabel>Height</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g., 9"
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
                ? `${layout.customWidth}:${layout.customHeight}`
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
}: { 
  layout: LayoutTemplate; 
  events: Event[];
  onLayoutChange: () => void;
  zones: LayoutZone[];
  onZonesChange: (zones: LayoutZone[]) => void;
  hasUnsavedChanges: boolean;
}) {
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const editingZone = editingZoneId ? zones.find(z => z.id === editingZoneId) : undefined;
  const event = events.find((e) => e.id === layout.eventId);

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
    // Prevent edit if we just finished a drag operation or are currently dragging
    if (justDraggedRef.current || draggedZoneId) return;
    handleEditZone(zone);
  };

  const form = useForm<LayoutFormValues>({
    resolver: zodResolver(layoutFormSchema),
    defaultValues: {
      name: layout.name,
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

  const deleteZoneMutation = useMutation({
    mutationFn: (zoneId: string) => {
      const updatedZones = zones.filter(z => z.id !== zoneId);
      return apiRequest("PATCH", `/api/layouts/${layout.id}`, { zones: updatedZones });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Zone deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete zone", variant: "destructive" });
    },
  });

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
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{layout.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline">
              {layout.aspectRatio === "custom" && layout.customWidth && layout.customHeight
                ? `${layout.customWidth}:${layout.customHeight}`
                : layout.aspectRatio || "16:9"}
            </Badge>
            {event && (
              <span className="text-xs text-muted-foreground">{event.name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAddZone} data-testid="button-add-zone-editor">
            <Plus className="h-4 w-4 mr-1" />
            Add Zone
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-layout-actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Layout
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateMutation.mutate()}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => deleteMutation.mutate()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1">
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
              return (
                <div
                  key={zone.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, zone.id)}
                  onDragOver={(e) => handleDragOver(e, zone.id)}
                  onDragLeave={handleDragLeave}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, zone.id)}
                  className={`flex items-center gap-2 p-3 rounded-lg border hover-elevate cursor-pointer transition-all ${
                    isDragging ? "opacity-50 scale-95" : ""
                  } ${isDragOver ? "border-primary border-2 bg-primary/5" : ""}`}
                  onClick={() => handleZoneItemClick(zone)}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteZoneMutation.mutate(zone.id);
                    }}
                    data-testid={`button-delete-zone-${zone.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

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
                        <FormLabel>Width</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
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
                        <FormLabel>Height</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
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
}: { 
  layout: LayoutTemplate;
  zones: LayoutZone[];
  onZoneUpdate: (zoneId: string, updates: Partial<LayoutZone>) => void;
  hasUnsavedChanges: boolean;
  onSaveAll: () => void;
  onDiscardAll: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-medium flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          Interactive Preview
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Click zones to select, drag to move, use handles to resize
        </p>
      </div>
      <div className="flex-1 p-4 flex items-center justify-center bg-muted/30">
        <div className="w-full max-w-2xl">
          <InteractiveLayoutPreview
            layout={layout}
            zones={zones}
            onZoneUpdate={onZoneUpdate}
            hasUnsavedChanges={hasUnsavedChanges}
            onSaveAll={onSaveAll}
            onDiscardAll={onDiscardAll}
          />
        </div>
      </div>
    </div>
  );
}

export default function LayoutsPage() {
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const { data: layouts = [], isLoading: layoutsLoading } = useQuery<LayoutTemplate[]>({
    queryKey: ["/api/layouts"],
  });

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const selectedLayout = layouts.find(l => l.id === selectedLayoutId);
  const savedZones = (selectedLayout?.zones as LayoutZone[]) || [];
  
  // Draft state for non-destructive editing
  const [draftZones, setDraftZones] = useState<LayoutZone[]>(savedZones);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
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
    <div className="h-full flex" data-testid="layouts-page">
      <div className="w-64 border-r flex flex-col">
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
                onSelect={() => setSelectedLayoutId(layout.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {selectedLayout ? (
        <div className="flex-1 flex">
          <div className="w-80 border-r">
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
            />
          </div>
          <div className="flex-1">
            <LivePreviewPanel 
              layout={selectedLayout} 
              zones={draftZones}
              onZoneUpdate={handleZoneUpdate}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveAll={handleSaveAll}
              onDiscardAll={handleDiscardAll}
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

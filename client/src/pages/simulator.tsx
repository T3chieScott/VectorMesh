import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tv2,
  Play,
  Pause,
  SkipForward,
  Maximize2,
  Minimize2,
  Monitor,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  Layers,
  RefreshCw,
  ScanSearch,
  Frame,
  ListVideo,
  X,
} from "lucide-react";
import type { Screen, DisplayProfile, MediaAsset, LayoutTemplate, LiveOverride, LayoutZone, Playlist, PlaylistItem } from "@shared/schema";
import { ZoneRenderer, zoneTypeIcons, getAspectRatioDimensions, getZoneFingerprint } from "@/components/zone-renderer";

interface SimulatorState {
  isPlaying: boolean;
  currentTime: string;
  currentDate: string;
  showZoneBorders: boolean;
  isFullscreen: boolean;
  canvasViewMode: "aoi" | "fullcanvas";
}

function PlayerDisplay({
  screen,
  profile,
  layout,
  state,
  liveOverride,
  getZoneMedia,
  getZoneMediaIndex,
  getPlaylistName,
  skipNonce = 0,
  fallbackZones,
  useStableKeys = false,
}: {
  screen: Screen | null;
  profile: DisplayProfile | null;
  layout: LayoutTemplate | null;
  state: SimulatorState;
  liveOverride: LiveOverride | null;
  getZoneMedia: (zoneId: string) => MediaAsset[];
  getZoneMediaIndex: (zoneId: string) => number;
  getPlaylistName: (zoneId: string) => string | undefined;
  skipNonce?: number;
  fallbackZones?: LayoutZone[];
  useStableKeys?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [weatherTimezone, setWeatherTimezone] = useState<string | undefined>(undefined);
  const zones = layout ? ((layout.zones as LayoutZone[]) || []) : (fallbackZones || []);
  const hasLiveOverride = liveOverride && liveOverride.isActive && new Date(liveOverride.endTime) > new Date();

  // Find weather zone and fetch its timezone
  useEffect(() => {
    const weatherZone = zones.find(z => z.type === "weather" && z.weatherLat && z.weatherLng);
    if (weatherZone && weatherZone.weatherLat && weatherZone.weatherLng) {
      fetch(`/api/widgets/weather?lat=${weatherZone.weatherLat}&lng=${weatherZone.weatherLng}&unit=${weatherZone.weatherUnit || "celsius"}`)
        .then(res => res.json())
        .then(data => {
          if (data.timezone) {
            setWeatherTimezone(data.timezone);
          }
        })
        .catch(() => {});
    } else {
      setWeatherTimezone(undefined);
    }
  }, [zones]);

  const REFERENCE_HEIGHT = 720;
  
  const layoutAspect = layout 
    ? getAspectRatioDimensions(
        layout.aspectRatio || "16:9",
        layout.customWidth,
        layout.customHeight
      )
    : null;
  
  const aspectRatio = layoutAspect 
    ? layoutAspect.width / layoutAspect.height 
    : (profile ? (profile.width || 1920) / (profile.height || 1080) : 16 / 9);

  const canvasEnabled = screen?.canvasEnabled ?? false;
  const canvasW = screen?.canvasWidth || 1920;
  const canvasH = screen?.canvasHeight || 1080;
  const canvasX = screen?.canvasX || 0;
  const canvasY = screen?.canvasY || 0;
  const screenW = profile?.width || 1920;
  const screenH = profile?.height || 1080;

  const isFullCanvasMode = canvasEnabled && state.canvasViewMode === "fullcanvas";
  const isAoiMode = canvasEnabled && state.canvasViewMode === "aoi";

  const displayAspect = isFullCanvasMode
    ? canvasW / canvasH
    : isAoiMode
      ? screenW / screenH
      : aspectRatio;

  const trueWidth = Math.round(REFERENCE_HEIGHT * displayAspect);
  const trueHeight = REFERENCE_HEIGHT;

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const padding = state.isFullscreen ? 0 : 16;
      const availableWidth = containerRect.width - padding;
      const availableHeight = containerRect.height - padding;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const scaleX = availableWidth / trueWidth;
      const scaleY = availableHeight / trueHeight;
      const newScale = Math.min(scaleX, scaleY);
      setScale(Math.max(0.05, newScale));
    };

    const timeoutId = setTimeout(updateScale, 50);
    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [trueWidth, trueHeight, state.isFullscreen]);

  const scaledWidth = trueWidth * scale;
  const scaledHeight = trueHeight * scale;

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full flex items-center justify-center"
    >
      <div
        className="relative bg-black rounded-lg overflow-hidden shadow-2xl"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
        data-testid="player-display"
      >
        <div
          style={{
            width: `${trueWidth}px`,
            height: `${trueHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="relative"
        >
      {hasLiveOverride && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1.5 flex items-center justify-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          LIVE OVERRIDE ACTIVE: {liveOverride.name}
        </div>
      )}

          {isFullCanvasMode ? (
            <>
              <div
                className="absolute"
                style={{
                  left: `${(canvasX / canvasW) * 100}%`,
                  top: `${(canvasY / canvasH) * 100}%`,
                  width: `${(screenW / canvasW) * 100}%`,
                  height: `${(screenH / canvasH) * 100}%`,
                  overflow: "hidden",
                }}
              >
                {zones.map((zone) => (
                  <div
                    key={useStableKeys ? getZoneFingerprint(zone) : zone.id}
                    className="absolute"
                    style={{
                      left: `${zone.x}%`,
                      top: `${zone.y}%`,
                      width: `${zone.width}%`,
                      height: `${zone.height}%`,
                      zIndex: zone.zIndex || 1,
                    }}
                  >
                    <div className={`absolute inset-0 ${zone.type === "shape" ? "" : "overflow-hidden"}`}>
                      <ZoneRenderer
                        zone={zone}
                        media={getZoneMedia(zone.id)}
                        mediaIndex={getZoneMediaIndex(zone.id)}
                        isPlaying={state.isPlaying}
                        skipNonce={skipNonce}
                        showBorder={state.showZoneBorders}
                        playlistName={getPlaylistName(zone.id)}
                        timezone={weatherTimezone}
                        fillContainer={true}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="absolute border-2 border-amber-400 z-30 pointer-events-none"
                style={{
                  left: `${(canvasX / canvasW) * 100}%`,
                  top: `${(canvasY / canvasH) * 100}%`,
                  width: `${(screenW / canvasW) * 100}%`,
                  height: `${(screenH / canvasH) * 100}%`,
                }}
                data-testid="aoi-overlay"
              >
                <span className="absolute -top-5 left-0 text-[10px] text-amber-400 whitespace-nowrap font-medium">
                  AOI: {screenW}×{screenH} at ({canvasX},{canvasY})
                </span>
              </div>
            </>
          ) : zones.length > 0 ? (
        (() => {
          const zoneNodes = zones.map((zone) => (
            <div
              key={useStableKeys ? getZoneFingerprint(zone) : zone.id}
              className="absolute"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                zIndex: zone.zIndex || 1,
              }}
            >
              <div className={`absolute inset-0 ${zone.type === "shape" ? "" : "overflow-hidden"}`}>
                <ZoneRenderer
                  zone={zone}
                  media={getZoneMedia(zone.id)}
                  mediaIndex={getZoneMediaIndex(zone.id)}
                  isPlaying={state.isPlaying}
                  skipNonce={skipNonce}
                  showBorder={state.showZoneBorders}
                  playlistName={getPlaylistName(zone.id)}
                  timezone={weatherTimezone}
                  fillContainer={true}
                />
              </div>
            </div>
          ));
          if (isAoiMode) {
            const scaleFactor = trueHeight / screenH;
            return (
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute"
                  style={{
                    width: `${canvasW * scaleFactor}px`,
                    height: `${canvasH * scaleFactor}px`,
                    left: `${-canvasX * scaleFactor}px`,
                    top: `${-canvasY * scaleFactor}px`,
                  }}
                  data-testid="canvas-stage-aoi"
                >
                  {zoneNodes}
                </div>
              </div>
            );
          }
          return <>{zoneNodes}</>;
        })()
      ) : layout ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/50">
          <div className="text-center">
            <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">No zones defined</p>
            <p className="text-sm">Add zones to this layout to see content</p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/50">
          <div className="text-center">
            <Tv2 className="h-16 w-16 mx-auto mb-4" />
            <p className="text-lg">No layout selected</p>
            <p className="text-sm">Select a screen or layout to preview</p>
          </div>
        </div>
      )}

      {/* Status Bar - hidden when Show Labels is off */}
      {state.showZoneBorders && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 z-40">
          <div className="flex items-center justify-between text-white text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-white/20 text-xs">
                {screen?.name || "Preview Mode"}
              </Badge>
              {profile && (
                <span className="text-xs text-white/60">
                  {profile.width}×{profile.height}
                </span>
              )}
              {layout && (
                <span className="text-xs text-white/60">
                  {layout.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">{state.currentTime}</span>
              <span className="text-white/50 hidden sm:inline">{state.currentDate}</span>
            </div>
          </div>
        </div>
      )}

          {/* Connection Status */}
          <div className="absolute top-3 right-3 z-40">
            <Badge
              variant="secondary"
              className={`gap-1 ${
                screen?.isOnline !== false
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {screen?.isOnline !== false ? (
                <>
                  <Wifi className="h-3 w-3" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Offline
                </>
              )}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResolvedContent {
  layoutId: string | null;
  layoutSource: "none" | "live_override" | "scheduled" | "fallback";
  layoutSourceDetail: string | null;
  fallbackPlaylistId: string | null;
}

export default function SimulatorPage() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const initialPlaylistId = searchParams.get("playlistId") || "";

  const [selectedScreenId, setSelectedScreenId] = useState<string>("none");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>("auto");
  const [mediaIndex, setMediaIndex] = useState(0);
  const [zoneMediaIndices, setZoneMediaIndices] = useState<Record<string, number>>({});
  const [zonePlaylistAssignments, setZonePlaylistAssignments] = useState<Record<string, string>>({});
  const [previewPlaylistId, setPreviewPlaylistId] = useState<string>(initialPlaylistId);
  const [mediaPlayerSkipNonce, setMediaPlayerSkipNonce] = useState(0);
  const [state, setState] = useState<SimulatorState>({
    isPlaying: true,
    currentTime: "",
    currentDate: "",
    showZoneBorders: true,
    isFullscreen: false,
    canvasViewMode: "aoi",
  });

  const screensQ = useSiteFilteredQuery<Screen[]>("/api/screens");
  const layoutsQ = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const mediaQ = useSiteFilteredQuery<MediaAsset[]>("/api/media");
  const overridesQ = useSiteFilteredQuery<LiveOverride[]>("/api/live-overrides");
  const playlistsQ = useSiteFilteredQuery<Playlist[]>("/api/playlists");

  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>(screensQ);

  const { data: profiles = [] } = useQuery<DisplayProfile[]>({
    queryKey: ["/api/display-profiles"],
  });

  const { data: layouts = [] } = useQuery<LayoutTemplate[]>({
    ...layoutsQ,
    refetchInterval: 7000,
  });

  const { data: media = [] } = useQuery<MediaAsset[]>({
    ...mediaQ,
    refetchInterval: 7000,
  });

  const { data: liveOverrides = [] } = useQuery<LiveOverride[]>({
    ...overridesQ,
    refetchInterval: 7000,
  });

  const { data: playlists = [] } = useQuery<Playlist[]>(playlistsQ);

  const { data: resolvedContent } = useQuery<ResolvedContent>({
    queryKey: ["/api/simulator", selectedScreenId, "content"],
    queryFn: async () => {
      const res = await fetch(`/api/simulator/${selectedScreenId}/content`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: selectedScreenId !== "none",
    refetchInterval: 7000,
  });

  // Get playlist items for assigned playlists
  const assignedPlaylistIds = Object.values(zonePlaylistAssignments).filter(id => id && id !== "none");
  const { data: playlistItemsMap = {} } = useQuery<Record<string, PlaylistItem[]>>({
    queryKey: ["/api/playlist-items-batch", assignedPlaylistIds],
    queryFn: async () => {
      if (assignedPlaylistIds.length === 0) return {};
      const results: Record<string, PlaylistItem[]> = {};
      await Promise.all(
        assignedPlaylistIds.map(async (playlistId) => {
          const res = await fetch(`/api/playlists/${playlistId}/items`);
          if (res.ok) {
            results[playlistId] = await res.json();
          }
        })
      );
      return results;
    },
    enabled: assignedPlaylistIds.length > 0,
  });

  const isPlaylistPreview = !!previewPlaylistId;
  const previewPlaylist = previewPlaylistId ? playlists.find(p => p.id === previewPlaylistId) : null;

  const { data: previewPlaylistItems = [] } = useQuery<PlaylistItem[]>({
    queryKey: ["/api/playlists", previewPlaylistId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/playlists/${previewPlaylistId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!previewPlaylistId,
  });

  const previewSortedItems = useMemo(() => {
    if (!previewPlaylistId || previewPlaylistItems.length === 0) return [];
    return [...previewPlaylistItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [previewPlaylistId, previewPlaylistItems]);

  const previewHasLayoutItems = previewSortedItems.some(item => !!item.layoutTemplateId);
  const previewMediaOnlyItems = useMemo(() => {
    return previewSortedItems
      .filter(item => !!item.mediaAssetId)
      .map(item => ({
        id: item.id,
        mediaAssetId: item.mediaAssetId,
        duration: item.duration ?? null,
      }));
  }, [previewSortedItems]);

  const [previewRotationIndex, setPreviewRotationIndex] = useState(0);

  useEffect(() => {
    setPreviewRotationIndex(0);
  }, [previewPlaylistId]);

  useEffect(() => {
    if (!isPlaylistPreview || !previewHasLayoutItems || previewSortedItems.length <= 1 || !state.isPlaying) return;
    const currentItem = previewSortedItems[previewRotationIndex % previewSortedItems.length];
    let durationSec = currentItem?.duration || 30;
    if (!currentItem?.duration && currentItem?.mediaAssetId) {
      const asset = media.find(m => m.id === currentItem.mediaAssetId);
      if (asset?.duration) durationSec = asset.duration;
    }
    const timer = setTimeout(() => {
      setPreviewRotationIndex(prev => (prev + 1) % previewSortedItems.length);
    }, durationSec * 1000);
    return () => clearTimeout(timer);
  }, [isPlaylistPreview, previewHasLayoutItems, previewSortedItems, previewRotationIndex, state.isPlaying, media]);

  const currentPreviewItem = previewHasLayoutItems
    ? previewSortedItems[previewRotationIndex % previewSortedItems.length] || null
    : null;
  const currentPreviewIsLayout = !!currentPreviewItem?.layoutTemplateId;
  const currentPreviewLayout = currentPreviewIsLayout
    ? layouts.find(l => l.id === currentPreviewItem.layoutTemplateId) || null
    : null;
  const currentPreviewMediaAsset = currentPreviewItem?.mediaAssetId
    ? media.find(m => m.id === currentPreviewItem.mediaAssetId) || null
    : null;

  const previewSyntheticZone: LayoutZone | null = useMemo(() => {
    if (!isPlaylistPreview) return null;
    if (previewHasLayoutItems) {
      if (!currentPreviewItem || currentPreviewIsLayout) return null;
      return {
        id: "playlist-preview-zone",
        name: previewPlaylist?.name || "Playlist Preview",
        type: "media_player",
        x: 0, y: 0, width: 100, height: 100, zIndex: 1,
        mediaPlayerItems: [{
          id: currentPreviewItem.id,
          mediaAssetId: currentPreviewItem.mediaAssetId,
          duration: currentPreviewItem.duration ?? null,
        }],
        mediaPlayerTransition: "fade",
        mediaPlayerTransitionDuration: 800,
        mediaPlayerLoop: true,
        mediaPlayerFitMode: "contain",
        mediaPlayerAutoPlay: true,
        mediaPlayerMuted: true,
        mediaPlayerShuffle: false,
      } as LayoutZone;
    }
    if (previewMediaOnlyItems.length === 0) return null;
    return {
      id: "playlist-preview-zone",
      name: previewPlaylist?.name || "Playlist Preview",
      type: "media_player",
      x: 0, y: 0, width: 100, height: 100, zIndex: 1,
      mediaPlayerItems: previewMediaOnlyItems,
      mediaPlayerTransition: "fade",
      mediaPlayerTransitionDuration: 800,
      mediaPlayerLoop: true,
      mediaPlayerFitMode: "contain",
      mediaPlayerAutoPlay: true,
      mediaPlayerMuted: true,
      mediaPlayerShuffle: false,
    } as LayoutZone;
  }, [isPlaylistPreview, previewHasLayoutItems, previewMediaOnlyItems, previewPlaylist, currentPreviewItem, currentPreviewIsLayout]);

  const selectedScreen = selectedScreenId !== "none" ? screens.find((s) => s.id === selectedScreenId) : null;
  const selectedProfile = selectedScreen
    ? profiles.find((p) => p.id === selectedScreen.displayProfileId)
    : profiles[0];

  const isAutoMode = selectedLayoutId === "auto";
  const effectiveLayoutId = isAutoMode
    ? resolvedContent?.layoutId || null
    : selectedLayoutId !== "none" ? selectedLayoutId : null;
  const selectedLayout = effectiveLayoutId
    ? layouts.find((l) => l.id === effectiveLayoutId) || null
    : null;

  const layoutSourceLabel = isAutoMode && resolvedContent
    ? resolvedContent.layoutSource === "live_override" ? "Live Override"
      : resolvedContent.layoutSource === "scheduled" ? `Scheduled: ${resolvedContent.layoutSourceDetail || "Block"}`
      : resolvedContent.layoutSource === "fallback" ? (resolvedContent.layoutSourceDetail === "Fallback Playlist" ? "Fallback Playlist" : "Fallback Layout")
      : "No Layout Resolved"
    : null;

  // Check for active live override for selected screen
  const activeLiveOverride = liveOverrides.find(
    (o) =>
      o.isActive &&
      new Date(o.endTime) > new Date() &&
      new Date(o.startTime) <= new Date()
  );

  const getZoneMedia = (zoneId: string): MediaAsset[] => {
    const playlistId = zonePlaylistAssignments[zoneId];
    if (!playlistId || playlistId === "none") {
      return media;
    }
    const playlistItems = playlistItemsMap[playlistId] || [];
    const sortedItems = [...playlistItems].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sortedItems
      .filter(item => !!item.mediaAssetId)
      .map(item => media.find(m => m.id === item.mediaAssetId))
      .filter((m): m is MediaAsset => m !== undefined);
  };

  const getZoneMediaIndex = (zoneId: string): number => {
    return zoneMediaIndices[zoneId] || 0;
  };

  const getPlaylistName = (zoneId: string): string | undefined => {
    const playlistId = zonePlaylistAssignments[zoneId];
    if (!playlistId || playlistId === "none") return undefined;
    return playlists.find(p => p.id === playlistId)?.name;
  };

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setState((prev) => ({
        ...prev,
        currentTime: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        currentDate: now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
      }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const simulatorFallbackZones: LayoutZone[] = useMemo(() => {
    if (selectedLayout || !isAutoMode || !resolvedContent?.fallbackPlaylistId) return [];
    const playlistItems = playlistItemsMap[resolvedContent.fallbackPlaylistId] || [];
    const mediaOnlyItems = playlistItems.filter(pi => pi.mediaAssetId && !pi.layoutTemplateId);
    if (mediaOnlyItems.length === 0) return [];
    const mediaPlayerItems = mediaOnlyItems
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(pi => ({
        id: pi.id,
        mediaAssetId: pi.mediaAssetId!,
        duration: pi.duration ?? null,
      }));
    return [{
      id: "__fallback__",
      type: "media_player",
      x: 0, y: 0, width: 100, height: 100,
      zIndex: 1,
      mediaPlayerItems,
    }] as LayoutZone[];
  }, [selectedLayout, isAutoMode, resolvedContent?.fallbackPlaylistId, playlistItemsMap]);

  // Auto-advance media zones (both global and per-zone)
  const zones = selectedLayout ? ((selectedLayout.zones as LayoutZone[]) || []) : simulatorFallbackZones;
  useEffect(() => {
    if (!state.isPlaying) return;

    const interval = setInterval(() => {
      // Advance global media index
      if (media.length > 0) {
        setMediaIndex((prev) => (prev + 1) % media.length);
      }
      // Advance zone-specific indices
      if (zones.length > 0) {
        setZoneMediaIndices((prev) => {
          const next = { ...prev };
          zones.forEach(zone => {
            if (zone.type === "media") {
              const zoneMedia = getZoneMedia(zone.id);
              if (zoneMedia.length > 0) {
                next[zone.id] = ((prev[zone.id] || 0) + 1) % zoneMedia.length;
              }
            }
          });
          return next;
        });
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [state.isPlaying, media.length, zones.length, zonePlaylistAssignments, playlistItemsMap]);

  const handlePlayPause = () => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleNext = () => {
    if (isPlaylistPreview) {
      if (previewHasLayoutItems) {
        setPreviewRotationIndex(prev => (prev + 1) % (previewSortedItems.length || 1));
      } else {
        setMediaPlayerSkipNonce(prev => prev + 1);
      }
    } else {
      setMediaIndex((prev) => (prev + 1) % (media.length || 1));
    }
  };

  const handleFullscreen = () => {
    const element = document.querySelector(".player-container");
    if (!state.isFullscreen) {
      element?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setState((prev) => ({ ...prev, isFullscreen: !prev.isFullscreen }));
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setState((prev) => ({ ...prev, isFullscreen: !!document.fullscreenElement }));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-simulator-title">Player Simulator</h1>
          <p className="text-muted-foreground">
            Preview how content appears on screens with zone-based layouts
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Controls Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Screen Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Screen</Label>
              {screensLoading ? (
                <Skeleton className="h-9" />
              ) : (
                <Select value={selectedScreenId} onValueChange={setSelectedScreenId}>
                  <SelectTrigger data-testid="select-simulator-screen">
                    <SelectValue placeholder="Select a screen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No screen (preview only)</SelectItem>
                    {screens.map((screen) => (
                      <SelectItem key={screen.id} value={screen.id}>
                        {screen.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Layout Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Layout</Label>
              <Select value={selectedLayoutId} onValueChange={setSelectedLayoutId}>
                <SelectTrigger data-testid="select-simulator-layout">
                  <SelectValue placeholder="Select a layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (from screen)</SelectItem>
                  <SelectItem value="none">No layout</SelectItem>
                  {layouts.map((layout) => (
                    <SelectItem key={layout.id} value={layout.id}>
                      {layout.name} ({((layout.zones as LayoutZone[])?.length || 0)} zones)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAutoMode && selectedScreenId !== "none" && layoutSourceLabel && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={resolvedContent?.layoutSource === "live_override" ? "destructive" : "secondary"}
                    className="text-xs"
                    data-testid="badge-layout-source"
                  >
                    {layoutSourceLabel}
                  </Badge>
                </div>
              )}
              {isAutoMode && selectedScreenId === "none" && (
                <p className="text-xs text-muted-foreground">Select a screen to auto-resolve its layout</p>
              )}
            </div>

            {/* Playlist Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <ListVideo className="h-3.5 w-3.5" />
                Preview Playlist
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  value={previewPlaylistId || "none"}
                  onValueChange={(value) => setPreviewPlaylistId(value === "none" ? "" : value)}
                >
                  <SelectTrigger data-testid="select-preview-playlist" className="flex-1">
                    <SelectValue placeholder="Select a playlist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Off</SelectItem>
                    {playlists.map((playlist) => (
                      <SelectItem key={playlist.id} value={playlist.id}>
                        {playlist.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isPlaylistPreview && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setPreviewPlaylistId("")}
                    data-testid="button-exit-playlist-preview"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {isPlaylistPreview && (
                <div className="text-xs text-muted-foreground">
                  {previewSortedItems.length} item{previewSortedItems.length !== 1 ? "s" : ""} in playlist
                  {previewHasLayoutItems && (
                    <span className="ml-1">(includes layouts)</span>
                  )}
                </div>
              )}
            </div>

            {/* Playback Controls */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Playback</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePlayPause}
                  data-testid="button-play-pause"
                >
                  {state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNext}
                  data-testid="button-next"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleFullscreen}
                  data-testid="button-fullscreen"
                >
                  {state.isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Labels Toggle - controls zone borders and footer */}
            <div className="flex items-center justify-between pt-2">
              <Label className="text-sm">Show Labels</Label>
              <Switch
                checked={state.showZoneBorders}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, showZoneBorders: checked }))
                }
                data-testid="switch-show-labels"
              />
            </div>

            {selectedScreen?.canvasEnabled && (
              <div className="space-y-2 pt-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Frame className="h-3.5 w-3.5" />
                  Canvas View
                </Label>
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      state.canvasViewMode === "aoi"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                    onClick={() => setState((prev) => ({ ...prev, canvasViewMode: "aoi" }))}
                    data-testid="button-canvas-aoi"
                  >
                    <ScanSearch className="h-3 w-3" />
                    Screen (default)
                  </button>
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      state.canvasViewMode === "fullcanvas"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                    onClick={() => setState((prev) => ({ ...prev, canvasViewMode: "fullcanvas" }))}
                    data-testid="button-canvas-fullcanvas"
                  >
                    <Frame className="h-3 w-3" />
                    Full canvas
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {state.canvasViewMode === "aoi"
                    ? `Showing the physical screen ${selectedProfile?.width || 1920}×${selectedProfile?.height || 1080} cropped from canvas at (${selectedScreen.canvasX || 0},${selectedScreen.canvasY || 0}).`
                    : `Overview of the full ${selectedScreen.canvasWidth}×${selectedScreen.canvasHeight} canvas with this screen's area highlighted.`}
                </p>
              </div>
            )}

            {/* Status Info */}
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Mode</span>
                <Badge
                  variant="secondary"
                  className={
                    isPlaylistPreview
                      ? "bg-violet-500/10 text-violet-600"
                      : state.isPlaying
                        ? "bg-green-500/10 text-green-600"
                        : "bg-amber-500/10 text-amber-600"
                  }
                >
                  {isPlaylistPreview ? "Playlist Preview" : state.isPlaying ? "Playing" : "Paused"}
                </Badge>
              </div>
              {isPlaylistPreview && previewPlaylist && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Playlist</span>
                  <span className="font-medium truncate max-w-[140px]" data-testid="text-preview-playlist-name">{previewPlaylist.name}</span>
                </div>
              )}
              {!isPlaylistPreview && selectedLayout && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Layout</span>
                    <span className="font-medium truncate max-w-[140px]" data-testid="text-active-layout-name">{selectedLayout.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Zones</span>
                    <span className="font-medium">
                      {((selectedLayout.zones as LayoutZone[])?.length || 0)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Media</span>
                <span className="font-medium">{media.length} items</span>
              </div>
              {selectedProfile && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Resolution</span>
                  <span className="font-medium">
                    {selectedProfile.width}×{selectedProfile.height}
                  </span>
                </div>
              )}
              {selectedScreen?.canvasEnabled && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Canvas</span>
                  <span className="font-medium">
                    {selectedScreen.canvasWidth}×{selectedScreen.canvasHeight}
                  </span>
                </div>
              )}
              {activeLiveOverride && (
                <div className="flex items-center gap-2 text-sm text-red-500 pt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Live Override Active</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Player Display */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden flex flex-col" style={{ height: state.isFullscreen ? "100vh" : "60vh", minHeight: "400px" }}>
            <CardHeader className="border-b py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Tv2 className="h-4 w-4" />
                  {isPlaylistPreview ? "Playlist Preview" : "Display Preview"}
                  {isPlaylistPreview && previewPlaylist && (
                    <Badge variant="secondary" className="text-[10px] ml-1 font-normal" data-testid="badge-playlist-preview">
                      {previewPlaylist.name}
                    </Badge>
                  )}
                  {isPlaylistPreview && previewHasLayoutItems && previewSortedItems.length > 0 && (
                    <Badge variant="outline" className="text-[10px] ml-1 font-normal tabular-nums" data-testid="badge-rotation-index">
                      {(previewRotationIndex % previewSortedItems.length) + 1}/{previewSortedItems.length}
                      {currentPreviewIsLayout ? " (layout)" : " (media)"}
                    </Badge>
                  )}
                  {!isPlaylistPreview && selectedScreen?.canvasEnabled && (
                    <Badge variant="outline" className="text-[10px] ml-1 font-normal" data-testid="badge-canvas-mode">
                      {state.canvasViewMode === "fullcanvas" ? "Full canvas" : "Screen view"}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="tabular-nums">{state.currentTime}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 player-container bg-muted/30 flex-1 min-h-0">
              {isPlaylistPreview && previewSortedItems.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <ListVideo className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">No items in playlist</p>
                    <p className="text-sm">Add media or layout items to this playlist to preview it</p>
                  </div>
                </div>
              ) : (
                <PlayerDisplay
                  screen={isPlaylistPreview ? null : (selectedScreen || null)}
                  profile={isPlaylistPreview ? null : (selectedProfile || null)}
                  layout={isPlaylistPreview
                    ? (currentPreviewIsLayout && currentPreviewLayout
                      ? currentPreviewLayout
                      : previewSyntheticZone
                        ? ({ zones: [previewSyntheticZone], aspectRatio: "16:9", name: previewPlaylist?.name || "Playlist Preview" } as LayoutTemplate)
                        : null)
                    : (selectedLayout || null)}
                  state={state}
                  liveOverride={isPlaylistPreview ? null : (activeLiveOverride || null)}
                  getZoneMedia={getZoneMedia}
                  getZoneMediaIndex={getZoneMediaIndex}
                  getPlaylistName={getPlaylistName}
                  skipNonce={mediaPlayerSkipNonce}
                  fallbackZones={isPlaylistPreview ? undefined : simulatorFallbackZones}
                  useStableKeys={isPlaylistPreview && previewHasLayoutItems}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Zone Legend */}
      {!isPlaylistPreview && selectedLayout && ((selectedLayout.zones as LayoutZone[])?.length || 0) > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Zone Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {((selectedLayout.zones as LayoutZone[]) || []).map((zone) => {
                const ZoneIcon = zoneTypeIcons[zone.type] || Layers;
                const zoneMedia = getZoneMedia(zone.id);
                const playlistId = zonePlaylistAssignments[zone.id] || "none";
                return (
                  <div
                    key={zone.id}
                    className="p-3 rounded-lg border bg-card"
                    data-testid={`zone-info-${zone.id}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded bg-primary/10">
                        <ZoneIcon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-medium text-sm truncate flex-1">{zone.name}</span>
                      <Badge variant="secondary" className="text-xs">{zone.type}</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground mb-2">
                      <span>X:{zone.x}%</span>
                      <span>Y:{zone.y}%</span>
                      <span>W:{zone.width}%</span>
                      <span>H:{zone.height}%</span>
                    </div>
                    {zone.type === "media" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Playlist Source</Label>
                        <Select
                          value={playlistId}
                          onValueChange={(value) => 
                            setZonePlaylistAssignments(prev => ({ ...prev, [zone.id]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-zone-playlist-${zone.id}`}>
                            <SelectValue placeholder="Select playlist" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">All media ({media.length} items)</SelectItem>
                            {playlists.map((playlist) => (
                              <SelectItem key={playlist.id} value={playlist.id}>
                                {playlist.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {playlistId !== "none" && (
                          <div className="text-xs text-muted-foreground">
                            {zoneMedia.length} media item{zoneMedia.length !== 1 ? "s" : ""} loaded
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Media Library Quick View */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base font-semibold">Media Library</CardTitle>
        </CardHeader>
        <CardContent>
          {media.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No media in library</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-3">
              {media.slice(0, 16).map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setMediaIndex(index)}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all hover-elevate ${
                    index === mediaIndex
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent"
                  }`}
                  data-testid={`button-media-${item.id}`}
                >
                  <img
                    src={`/api/media/${item.id}/file`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                  {index === mediaIndex && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Play className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

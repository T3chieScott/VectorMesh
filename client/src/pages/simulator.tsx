import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import type { Screen, DisplayProfile, MediaAsset, LayoutTemplate, LiveOverride, LayoutZone, Playlist, PlaylistItem } from "@shared/schema";
import { ZoneRenderer, zoneTypeIcons, getAspectRatioDimensions } from "@/components/zone-renderer";

interface SimulatorState {
  isPlaying: boolean;
  currentTime: string;
  currentDate: string;
  showZoneBorders: boolean;
  isFullscreen: boolean;
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
}: {
  screen: Screen | null;
  profile: DisplayProfile | null;
  layout: LayoutTemplate | null;
  state: SimulatorState;
  liveOverride: LiveOverride | null;
  getZoneMedia: (zoneId: string) => MediaAsset[];
  getZoneMediaIndex: (zoneId: string) => number;
  getPlaylistName: (zoneId: string) => string | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [weatherTimezone, setWeatherTimezone] = useState<string | undefined>(undefined);
  const zones = (layout?.zones as LayoutZone[]) || [];
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

  // Calculate true dimensions based on layout aspect ratio
  const baseWidth = profile?.width || 1920;
  const baseHeight = profile?.height || 1080;
  
  const layoutAspect = layout 
    ? getAspectRatioDimensions(
        layout.aspectRatio || "16:9",
        layout.customWidth,
        layout.customHeight
      )
    : null;
  
  // If layout has aspect ratio, calculate dimensions to fit within profile while preserving ratio
  let trueWidth = baseWidth;
  let trueHeight = baseHeight;
  
  if (layoutAspect) {
    const layoutRatio = layoutAspect.width / layoutAspect.height;
    const profileRatio = baseWidth / baseHeight;
    
    if (layoutRatio > profileRatio) {
      // Layout is wider - use full width, calculate height
      trueWidth = baseWidth;
      trueHeight = Math.round(baseWidth / layoutRatio);
    } else {
      // Layout is taller - use full height, calculate width
      trueHeight = baseHeight;
      trueWidth = Math.round(baseHeight * layoutRatio);
    }
  }

  // Calculate scale to fit container while preserving true dimensions
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Use actual container dimensions with small padding
      const availableWidth = containerRect.width - 16;
      const availableHeight = containerRect.height - 16;
      
      if (availableWidth <= 0 || availableHeight <= 0) return;
      
      const scaleX = availableWidth / trueWidth;
      const scaleY = availableHeight / trueHeight;
      const newScale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 1
      setScale(Math.max(0.05, newScale)); // Minimum 5% scale
    };

    // Initial delay to allow container to render with proper height
    const timeoutId = setTimeout(updateScale, 50);
    
    // Use ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [trueWidth, trueHeight, state.isFullscreen]);

  // Scaled dimensions for the wrapper
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
        {/* Inner content at true pixel dimensions, scaled down */}
        <div
          style={{
            width: `${trueWidth}px`,
            height: `${trueHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="relative"
        >
      {/* Live Override Banner */}
      {hasLiveOverride && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1.5 flex items-center justify-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          LIVE OVERRIDE ACTIVE: {liveOverride.name}
        </div>
      )}

      {/* Zones */}
      {zones.length > 0 ? (
        zones.map((zone) => (
          <ZoneRenderer
            key={zone.id}
            zone={zone}
            media={getZoneMedia(zone.id)}
            mediaIndex={getZoneMediaIndex(zone.id)}
            isPlaying={state.isPlaying}
            showBorder={state.showZoneBorders}
            playlistName={getPlaylistName(zone.id)}
            timezone={weatherTimezone}
          />
        ))
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

export default function SimulatorPage() {
  const [selectedScreenId, setSelectedScreenId] = useState<string>("none");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>("none");
  const [mediaIndex, setMediaIndex] = useState(0);
  const [zoneMediaIndices, setZoneMediaIndices] = useState<Record<string, number>>({});
  const [zonePlaylistAssignments, setZonePlaylistAssignments] = useState<Record<string, string>>({});
  const [state, setState] = useState<SimulatorState>({
    isPlaying: true,
    currentTime: "",
    currentDate: "",
    showZoneBorders: true,
    isFullscreen: false,
  });

  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: profiles = [] } = useQuery<DisplayProfile[]>({
    queryKey: ["/api/display-profiles"],
  });

  const { data: layouts = [] } = useQuery<LayoutTemplate[]>({
    queryKey: ["/api/layouts"],
  });

  const { data: media = [] } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  const { data: liveOverrides = [] } = useQuery<LiveOverride[]>({
    queryKey: ["/api/live-overrides"],
  });

  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ["/api/playlists"],
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

  const selectedScreen = selectedScreenId !== "none" ? screens.find((s) => s.id === selectedScreenId) : null;
  const selectedProfile = selectedScreen
    ? profiles.find((p) => p.id === selectedScreen.displayProfileId)
    : profiles[0];

  // Layout: either directly selected, or from screen's assignment
  const selectedLayout = selectedLayoutId !== "none"
    ? layouts.find((l) => l.id === selectedLayoutId)
    : null;

  // Check for active live override for selected screen
  const activeLiveOverride = liveOverrides.find(
    (o) =>
      o.isActive &&
      new Date(o.endTime) > new Date() &&
      new Date(o.startTime) <= new Date()
  );

  // Helper to get zone-specific media based on playlist assignment
  const getZoneMedia = (zoneId: string): MediaAsset[] => {
    const playlistId = zonePlaylistAssignments[zoneId];
    if (!playlistId || playlistId === "none") {
      return media; // Fall back to all media
    }
    const playlistItems = playlistItemsMap[playlistId] || [];
    // Sort by order and get media assets
    const sortedItems = [...playlistItems].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sortedItems
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

  // Auto-advance media zones (both global and per-zone)
  const zones = (selectedLayout?.zones as LayoutZone[]) || [];
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
    setMediaIndex((prev) => (prev + 1) % (media.length || 1));
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
                  <SelectItem value="none">No layout</SelectItem>
                  {layouts.map((layout) => (
                    <SelectItem key={layout.id} value={layout.id}>
                      {layout.name} ({((layout.zones as LayoutZone[])?.length || 0)} zones)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {/* Status Info */}
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant="secondary"
                  className={
                    state.isPlaying
                      ? "bg-green-500/10 text-green-600"
                      : "bg-amber-500/10 text-amber-600"
                  }
                >
                  {state.isPlaying ? "Playing" : "Paused"}
                </Badge>
              </div>
              {selectedLayout && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Zones</span>
                  <span className="font-medium">
                    {((selectedLayout.zones as LayoutZone[])?.length || 0)}
                  </span>
                </div>
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
                  Display Preview
                </CardTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="tabular-nums">{state.currentTime}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 player-container bg-muted/30 flex-1 min-h-0">
              <PlayerDisplay
                screen={selectedScreen || null}
                profile={selectedProfile || null}
                layout={selectedLayout || null}
                state={state}
                liveOverride={activeLiveOverride || null}
                getZoneMedia={getZoneMedia}
                getZoneMediaIndex={getZoneMediaIndex}
                getPlaylistName={getPlaylistName}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Zone Legend */}
      {selectedLayout && ((selectedLayout.zones as LayoutZone[])?.length || 0) > 0 && (
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

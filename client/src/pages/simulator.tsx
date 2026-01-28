import { useState, useEffect } from "react";
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
  Image,
  Type,
  Code,
  RefreshCw,
} from "lucide-react";
import type { Screen, DisplayProfile, MediaAsset, LayoutTemplate, LiveOverride, LayoutZone } from "@shared/schema";

interface SimulatorState {
  isPlaying: boolean;
  currentTime: string;
  currentDate: string;
  showZoneBorders: boolean;
  isFullscreen: boolean;
}

const zoneTypeIcons: Record<string, typeof Image> = {
  media: Image,
  ticker: Type,
  clock: Clock,
  logo: Image,
  html: Code,
};

function TickerWidget({ content }: { content?: string }) {
  return (
    <div className="h-full w-full bg-gradient-to-r from-primary/90 to-primary flex items-center overflow-hidden">
      <div className="animate-marquee whitespace-nowrap text-primary-foreground font-medium px-4">
        {content || "Welcome to SignageHub • Breaking news and updates scroll here • Stay informed with live content"}
      </div>
    </div>
  );
}

function ClockWidget() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full w-full bg-black/80 flex flex-col items-center justify-center text-white">
      <div className="text-4xl font-bold tabular-nums">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="text-sm text-white/70 mt-1">
        {time.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

function LogoWidget() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-black/50">
      <div className="text-center">
        <div className="text-2xl font-bold text-white">SignageHub</div>
        <div className="text-xs text-white/60">Digital Signage</div>
      </div>
    </div>
  );
}

function HtmlWidget({ content }: { content?: string }) {
  return (
    <div className="h-full w-full bg-white/10 p-2 overflow-hidden">
      <div
        className="h-full w-full"
        dangerouslySetInnerHTML={{ __html: content || "<p style='color:white'>HTML Widget</p>" }}
      />
    </div>
  );
}

function MediaWidget({
  media,
  mediaIndex,
  isPlaying,
}: {
  media: MediaAsset[];
  mediaIndex: number;
  isPlaying: boolean;
}) {
  const currentMedia = media[mediaIndex % (media.length || 1)];

  if (!currentMedia) {
    return (
      <div className="h-full w-full bg-muted/50 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No media</p>
        </div>
      </div>
    );
  }

  const mediaUrl = `/api/media/${currentMedia.id}/file`;

  if (currentMedia.mediaType === "video") {
    return (
      <video
        key={currentMedia.id}
        src={mediaUrl}
        className="w-full h-full object-cover"
        autoPlay={isPlaying}
        loop
        muted
      />
    );
  }

  return (
    <img
      src={mediaUrl}
      alt={currentMedia.name}
      className="w-full h-full object-cover"
    />
  );
}

function ZoneRenderer({
  zone,
  media,
  mediaIndex,
  isPlaying,
  showBorder,
}: {
  zone: LayoutZone;
  media: MediaAsset[];
  mediaIndex: number;
  isPlaying: boolean;
  showBorder: boolean;
}) {
  const ZoneIcon = zoneTypeIcons[zone.type] || Layers;

  const renderContent = () => {
    switch (zone.type) {
      case "media":
        return <MediaWidget media={media} mediaIndex={mediaIndex} isPlaying={isPlaying} />;
      case "ticker":
        return <TickerWidget />;
      case "clock":
        return <ClockWidget />;
      case "logo":
        return <LogoWidget />;
      case "html":
        return <HtmlWidget />;
      default:
        return (
          <div className="h-full w-full bg-muted/30 flex items-center justify-center">
            <ZoneIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        );
    }
  };

  return (
    <div
      className={`absolute overflow-hidden ${showBorder ? "ring-2 ring-primary/50 ring-offset-1" : ""}`}
      style={{
        left: `${zone.x}%`,
        top: `${zone.y}%`,
        width: `${zone.width}%`,
        height: `${zone.height}%`,
        zIndex: zone.zIndex || 1,
      }}
      data-testid={`zone-${zone.id}`}
    >
      {renderContent()}
      {showBorder && (
        <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
          <ZoneIcon className="h-3 w-3" />
          {zone.name}
        </div>
      )}
    </div>
  );
}

function PlayerDisplay({
  screen,
  profile,
  layout,
  media,
  state,
  mediaIndex,
  liveOverride,
}: {
  screen: Screen | null;
  profile: DisplayProfile | null;
  layout: LayoutTemplate | null;
  media: MediaAsset[];
  state: SimulatorState;
  mediaIndex: number;
  liveOverride: LiveOverride | null;
}) {
  const zones = (layout?.zones as LayoutZone[]) || [];
  const aspectRatio = profile ? `${profile.width} / ${profile.height}` : "16 / 9";
  const hasLiveOverride = liveOverride && liveOverride.isActive && new Date(liveOverride.endTime) > new Date();

  return (
    <div
      className="relative bg-black rounded-lg overflow-hidden shadow-2xl mx-auto"
      style={{
        aspectRatio,
        maxHeight: state.isFullscreen ? "100vh" : "60vh",
        maxWidth: state.isFullscreen ? "100vw" : "100%",
      }}
      data-testid="player-display"
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
            media={media}
            mediaIndex={mediaIndex}
            isPlaying={state.isPlaying}
            showBorder={state.showZoneBorders}
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

      {/* Status Bar */}
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
  );
}

export default function SimulatorPage() {
  const [selectedScreenId, setSelectedScreenId] = useState<string>("none");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>("none");
  const [mediaIndex, setMediaIndex] = useState(0);
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

  // Auto-advance media zones
  useEffect(() => {
    if (!state.isPlaying || media.length === 0) return;

    const interval = setInterval(() => {
      setMediaIndex((prev) => (prev + 1) % media.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [state.isPlaying, media.length]);

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

            {/* Debug Toggle */}
            <div className="flex items-center justify-between pt-2">
              <Label className="text-sm">Show zone borders</Label>
              <Switch
                checked={state.showZoneBorders}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, showZoneBorders: checked }))
                }
                data-testid="switch-zone-borders"
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
          <Card className="overflow-hidden">
            <CardHeader className="border-b py-3">
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
            <CardContent className="p-4 player-container bg-muted/30">
              <PlayerDisplay
                screen={selectedScreen || null}
                profile={selectedProfile || null}
                layout={selectedLayout || null}
                media={media}
                state={state}
                mediaIndex={mediaIndex}
                liveOverride={activeLiveOverride || null}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {((selectedLayout.zones as LayoutZone[]) || []).map((zone) => {
                const ZoneIcon = zoneTypeIcons[zone.type] || Layers;
                return (
                  <div
                    key={zone.id}
                    className="p-3 rounded-lg border bg-card hover-elevate"
                    data-testid={`zone-info-${zone.id}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded bg-primary/10">
                        <ZoneIcon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-medium text-sm truncate">{zone.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <span>Type: {zone.type}</span>
                      <span>Z: {zone.zIndex}</span>
                      <span>X: {zone.x}%</span>
                      <span>Y: {zone.y}%</span>
                      <span>W: {zone.width}%</span>
                      <span>H: {zone.height}%</span>
                    </div>
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

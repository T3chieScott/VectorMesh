import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Monitor,
  Clock,
  Wifi,
  RefreshCw,
} from "lucide-react";
import type { Screen, DisplayProfile, MediaAsset } from "@shared/schema";

interface SimulatorState {
  currentMediaIndex: number;
  isPlaying: boolean;
  currentTime: string;
  currentDate: string;
}

function PlayerDisplay({
  screen,
  profile,
  media,
  state,
}: {
  screen: Screen | null;
  profile: DisplayProfile | null;
  media: MediaAsset[];
  state: SimulatorState;
}) {
  const currentMedia = media[state.currentMediaIndex];

  const aspectRatio = profile
    ? `${profile.width} / ${profile.height}`
    : "16 / 9";

  return (
    <div
      className="relative bg-black rounded-lg overflow-hidden shadow-2xl"
      style={{ aspectRatio }}
    >
      {/* Screen Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {currentMedia ? (
          currentMedia.mediaType === "video" ? (
            <video
              src={currentMedia.originalPath}
              className="w-full h-full object-cover"
              autoPlay={state.isPlaying}
              loop
              muted
            />
          ) : (
            <img
              src={currentMedia.originalPath}
              alt={currentMedia.name}
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-white/50">
            <Tv2 className="h-16 w-16 mb-4" />
            <p className="text-lg">No content</p>
            <p className="text-sm">Select a screen to simulate</p>
          </div>
        )}
      </div>

      {/* Ticker Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-white/20">
              {screen?.name || "No Screen"}
            </Badge>
            {profile && (
              <span className="text-xs text-white/60">
                {profile.width}x{profile.height}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span>{state.currentTime}</span>
            <span className="text-white/60">{state.currentDate}</span>
          </div>
        </div>
      </div>

      {/* Status Indicator */}
      <div className="absolute top-4 right-4">
        <Badge variant="secondary" className="bg-green-500/20 text-green-400 gap-1">
          <Wifi className="h-3 w-3" />
          Connected
        </Badge>
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  const [selectedScreenId, setSelectedScreenId] = useState<string>("");
  const [state, setState] = useState<SimulatorState>({
    currentMediaIndex: 0,
    isPlaying: true,
    currentTime: "",
    currentDate: "",
  });

  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: profiles = [] } = useQuery<DisplayProfile[]>({
    queryKey: ["/api/display-profiles"],
  });

  const { data: media = [] } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  const selectedScreen = screens.find((s) => s.id === selectedScreenId);
  const selectedProfile = profiles.find(
    (p) => p.id === selectedScreen?.displayProfileId
  );

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setState((prev) => ({
        ...prev,
        currentTime: now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        currentDate: now.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
      }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-advance media
  useEffect(() => {
    if (!state.isPlaying || media.length === 0) return;

    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        currentMediaIndex: (prev.currentMediaIndex + 1) % media.length,
      }));
    }, 10000);

    return () => clearInterval(interval);
  }, [state.isPlaying, media.length]);

  const handlePlayPause = () => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleNext = () => {
    setState((prev) => ({
      ...prev,
      currentMediaIndex: (prev.currentMediaIndex + 1) % (media.length || 1),
    }));
  };

  const handleFullscreen = () => {
    const element = document.querySelector(".player-container");
    if (element) {
      element.requestFullscreen?.();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-simulator-title">Player Simulator</h1>
          <p className="text-muted-foreground">
            Preview how content appears on screens
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Controls Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Screen Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Screen</label>
              {screensLoading ? (
                <Skeleton className="h-9" />
              ) : (
                <Select
                  value={selectedScreenId}
                  onValueChange={setSelectedScreenId}
                >
                  <SelectTrigger data-testid="select-simulator-screen">
                    <SelectValue placeholder="Select a screen" />
                  </SelectTrigger>
                  <SelectContent>
                    {screens.map((screen) => (
                      <SelectItem key={screen.id} value={screen.id}>
                        {screen.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Playback Controls */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Playback</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePlayPause}
                  data-testid="button-play-pause"
                >
                  {state.isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
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
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Current Info */}
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
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Media</span>
                <span className="font-medium">
                  {state.currentMediaIndex + 1}/{media.length || 0}
                </span>
              </div>
              {selectedProfile && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Resolution</span>
                  <span className="font-medium">
                    {selectedProfile.width}x{selectedProfile.height}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Player Display */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Display Preview
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{state.currentTime}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 player-container bg-muted/30">
              <PlayerDisplay
                screen={selectedScreen || null}
                profile={selectedProfile || null}
                media={media}
                state={state}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Media Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Media Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {media.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No media in library</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {media.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() =>
                    setState((prev) => ({ ...prev, currentMediaIndex: index }))
                  }
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all hover-elevate ${
                    index === state.currentMediaIndex
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent"
                  }`}
                  data-testid={`button-media-queue-${item.id}`}
                >
                  {item.thumbnailPath || item.mediaType === "image" ? (
                    <img
                      src={item.thumbnailPath || item.originalPath}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Play className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {index === state.currentMediaIndex && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Play className="h-6 w-6 text-primary-foreground" />
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

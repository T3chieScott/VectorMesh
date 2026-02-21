import { useState, useEffect, useRef, useCallback } from "react";
import type { Screen, DisplayProfile, MediaAsset, LayoutTemplate, LiveOverride, LayoutZone, Playlist, PlaylistItem } from "@shared/schema";
import { ZoneRenderer, getAspectRatioDimensions } from "@/components/zone-renderer";

interface PlayerContentData {
  screen: Screen;
  profile: DisplayProfile | null;
  layout: LayoutTemplate | null;
  media: MediaAsset[];
  playlists: Playlist[];
  playlistItems: Record<string, PlaylistItem[]>;
  liveOverride: LiveOverride | null;
  event: any;
  timestamp: string;
}

export default function PlayerPage({ screenId }: { screenId: string }) {
  const [content, setContent] = useState<PlayerContentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [zoneMediaIndices, setZoneMediaIndices] = useState<Record<string, number>>({});
  const [weatherTimezone, setWeatherTimezone] = useState<string | undefined>(undefined);
  const contentHashRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchContent = useCallback(async () => {
    try {
      const res = await fetch(`/api/player/${screenId}/content`);
      if (!res.ok) {
        throw new Error(`Failed to fetch content: ${res.status}`);
      }
      const data: PlayerContentData = await res.json();
      const newHash = JSON.stringify({
        layoutId: data.layout?.id,
        layoutUpdatedAt: data.layout?.updatedAt,
        layoutZones: data.layout?.zones,
        liveOverrideId: data.liveOverride?.id,
        liveOverrideActive: data.liveOverride?.isActive,
        mediaIds: data.media.map((m: any) => m.id).sort(),
        playlistItems: data.playlistItems,
        timestamp: data.timestamp,
      });

      if (newHash !== contentHashRef.current) {
        contentHashRef.current = newHash;
        setContent(data);
        setLastUpdate(new Date().toISOString());
      }
      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      setIsConnected(false);
      setError(err.message || "Connection lost");
    }
  }, [screenId]);

  useEffect(() => {
    fetchContent();
    const interval = setInterval(fetchContent, 7000);
    return () => clearInterval(interval);
  }, [fetchContent]);

  useEffect(() => {
    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        await fetch("/api/player/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            screenId,
            temperature: null,
            storageFree: null,
            uptime: Math.floor(performance.now() / 1000),
            currentBlockId: null,
            currentItemId: null,
            errors: null,
          }),
        });
      } catch {}
    }, 30000);
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [screenId]);

  const layout = content?.layout || null;
  const zones = (layout?.zones as LayoutZone[]) || [];

  useEffect(() => {
    const weatherZone = zones.find(z => z.type === "weather" && z.weatherLat && z.weatherLng);
    if (weatherZone && weatherZone.weatherLat && weatherZone.weatherLng) {
      fetch(`/api/player/widgets/weather?lat=${weatherZone.weatherLat}&lng=${weatherZone.weatherLng}&unit=${weatherZone.weatherUnit || "celsius"}`)
        .then(res => res.json())
        .then(data => {
          if (data.timezone) setWeatherTimezone(data.timezone);
        })
        .catch(() => {});
    }
  }, [zones.length, layout?.id]);

  useEffect(() => {
    if (zones.length === 0) return;
    const interval = setInterval(() => {
      setZoneMediaIndices(prev => {
        const next = { ...prev };
        zones.forEach(zone => {
          if (zone.type === "media") {
            const zoneMedia = getZoneMedia(zone.id);
            if (zoneMedia.length > 1) {
              next[zone.id] = ((prev[zone.id] || 0) + 1) % zoneMedia.length;
            }
          }
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [zones.length, content?.media.length]);

  const REFERENCE_HEIGHT = 720;
  const layoutAspect = layout
    ? getAspectRatioDimensions(layout.aspectRatio || "16:9", layout.customWidth, layout.customHeight)
    : null;
  const aspectRatio = layoutAspect
    ? layoutAspect.width / layoutAspect.height
    : (content?.profile ? (content.profile.width || 1920) / (content.profile.height || 1080) : 16 / 9);
  const trueWidth = Math.round(REFERENCE_HEIGHT * aspectRatio);
  const trueHeight = REFERENCE_HEIGHT;

  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scaleX = w / trueWidth;
      const scaleY = h / trueHeight;
      setScale(Math.min(scaleX, scaleY));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [trueWidth, trueHeight]);

  const getZoneMedia = (zoneId: string): MediaAsset[] => {
    if (!content) return [];
    return content.media;
  };

  const getZoneMediaIndex = (zoneId: string): number => {
    return zoneMediaIndices[zoneId] || 0;
  };

  if (error && !content) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 border-red-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-xl font-semibold mb-2">Connection Lost</p>
          <p className="text-white/60 text-sm">Attempting to reconnect to Signage Hub...</p>
          <p className="text-white/40 text-xs mt-4">Screen ID: {screenId}</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-lg">Connecting to Signage Hub...</p>
          <p className="text-white/40 text-xs mt-2">Screen ID: {screenId}</p>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <svg className="w-16 h-16 mx-auto mb-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-xl font-semibold mb-2">No Content Assigned</p>
          <p className="text-white/50 text-sm">{content.screen.name}</p>
          <p className="text-white/30 text-xs mt-4">
            Assign a layout or programme to this screen in the Signage Hub
          </p>
        </div>
      </div>
    );
  }

  const scaledWidth = trueWidth * scale;
  const scaledHeight = trueHeight * scale;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden" style={{ cursor: "none" }}>
      <div
        className="relative overflow-hidden"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
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
          {content.liveOverride && (
            <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white px-3 py-1 flex items-center justify-center gap-2 text-sm font-medium">
              LIVE: {content.liveOverride.name}
            </div>
          )}

          {zones.map((zone) => (
            <div
              key={zone.id}
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
                  isPlaying={true}
                  showBorder={false}
                  timezone={weatherTimezone}
                  fillContainer={true}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isConnected && content && (
        <div className="fixed bottom-4 right-4 bg-yellow-600/90 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 z-50">
          <div className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
          Reconnecting...
        </div>
      )}
    </div>
  );
}
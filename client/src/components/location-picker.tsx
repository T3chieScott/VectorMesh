import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Rectangle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search, Loader2 } from "lucide-react";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface PointResult {
  lat: string;
  lng: string;
  placeName: string | null;
}

export interface BoundsResult {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

interface PointModeProps {
  mode?: "point";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  initialLat?: string | number | null;
  initialLng?: string | number | null;
  initialPlaceName?: string | null;
  onSelect: (result: PointResult) => void;
}

interface BoundsModeProps {
  mode: "bounds";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  initialBounds?: Partial<BoundsResult> | null;
  onSelect: (result: BoundsResult) => void;
}

type LocationPickerProps = PointModeProps | BoundsModeProps;

function isBoundsMode(props: LocationPickerProps): props is BoundsModeProps {
  return props.mode === "bounds";
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapRecenter({ lat, lng, bounds }: { lat?: number | null; lng?: number | null; bounds?: BoundsResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      try {
        map.fitBounds(
          [
            [bounds.lamin, bounds.lomin],
            [bounds.lamax, bounds.lomax],
          ],
          { padding: [20, 20], maxZoom: 10 },
        );
      } catch {
        // ignore
      }
    } else if (lat != null && lng != null) {
      map.setView([lat, lng], Math.max(map.getZoom(), 10));
    }
  }, [lat, lng, bounds, map]);
  return null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function LocationPicker(props: LocationPickerProps) {
  const boundsMode = isBoundsMode(props);
  const { open, onOpenChange, title } = props;
  const initialPlaceName = boundsMode ? null : props.initialPlaceName ?? null;

  const initialBounds = useMemo<BoundsResult | null>(() => {
    if (!boundsMode) return null;
    const b = props.initialBounds;
    if (!b) return null;
    const { lamin, lamax, lomin, lomax } = b;
    if (
      lamin != null && Number.isFinite(lamin) &&
      lamax != null && Number.isFinite(lamax) &&
      lomin != null && Number.isFinite(lomin) &&
      lomax != null && Number.isFinite(lomax)
    ) {
      return { lamin, lamax, lomin, lomax };
    }
    return null;
  }, [boundsMode, props]);

  const initialPoint = useMemo(() => {
    if (boundsMode) return null;
    const lat = toNum(props.initialLat);
    const lng = toNum(props.initialLng);
    return lat != null && lng != null ? { lat, lng } : null;
  }, [boundsMode, props]);

  const [lat, setLat] = useState<number | null>(initialPoint?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialPoint?.lng ?? null);
  const [placeName, setPlaceName] = useState<string | null>(initialPlaceName);
  const [bounds, setBounds] = useState<BoundsResult | null>(initialBounds);
  const [pendingCorner, setPendingCorner] = useState<{ lat: number; lng: number } | null>(null);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const reverseTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (boundsMode) {
        setBounds(initialBounds);
        setPendingCorner(null);
      } else {
        setLat(initialPoint?.lat ?? null);
        setLng(initialPoint?.lng ?? null);
        setPlaceName(initialPlaceName);
      }
      setSearch("");
      setResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      if (reverseTimer.current) {
        window.clearTimeout(reverseTimer.current);
        reverseTimer.current = null;
      }
    };
  }, []);

  const runSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
        { headers: { "Accept-Language": navigator.language || "en" } },
      );
      const data: SearchResult[] = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const reverseGeocode = (newLat: number, newLng: number) => {
    if (reverseTimer.current) window.clearTimeout(reverseTimer.current);
    reverseTimer.current = window.setTimeout(async () => {
      setReverseLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&zoom=12`,
          { headers: { "Accept-Language": navigator.language || "en" } },
        );
        const data = await res.json();
        if (data?.display_name) {
          setPlaceName(data.display_name);
        }
      } catch {
        // ignore
      } finally {
        setReverseLoading(false);
      }
    }, 400);
  };

  const handleMapClick = (newLat: number, newLng: number) => {
    if (!boundsMode) {
      setLat(newLat);
      setLng(newLng);
      setPlaceName(null);
      reverseGeocode(newLat, newLng);
    } else {
      if (!pendingCorner) {
        setPendingCorner({ lat: newLat, lng: newLng });
        setBounds(null);
      } else {
        const lamin = Math.min(pendingCorner.lat, newLat);
        const lamax = Math.max(pendingCorner.lat, newLat);
        const lomin = Math.min(pendingCorner.lng, newLng);
        const lomax = Math.max(pendingCorner.lng, newLng);
        setBounds({ lamin, lamax, lomin, lomax });
        setPendingCorner(null);
      }
    }
  };

  const handleResultClick = (r: SearchResult) => {
    const newLat = parseFloat(r.lat);
    const newLng = parseFloat(r.lon);
    if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return;
    if (!boundsMode) {
      setLat(newLat);
      setLng(newLng);
      setPlaceName(r.display_name);
    } else {
      // For bounds mode, treat a search result as a centered ~1° box if no
      // pending corner; otherwise use it as the second corner.
      if (pendingCorner) {
        handleMapClick(newLat, newLng);
      } else {
        const half = 0.5;
        setBounds({
          lamin: newLat - half,
          lamax: newLat + half,
          lomin: newLng - half,
          lomax: newLng + half,
        });
      }
    }
  };

  const handleSave = () => {
    if (isBoundsMode(props)) {
      if (!bounds) return;
      props.onSelect({
        lamin: +bounds.lamin.toFixed(4),
        lamax: +bounds.lamax.toFixed(4),
        lomin: +bounds.lomin.toFixed(4),
        lomax: +bounds.lomax.toFixed(4),
      });
    } else {
      if (lat == null || lng == null) return;
      props.onSelect({
        lat: lat.toFixed(5),
        lng: lng.toFixed(5),
        placeName: placeName?.trim() ? placeName.trim() : null,
      });
    }
    onOpenChange(false);
  };

  const center: [number, number] = boundsMode && bounds
    ? [(bounds.lamin + bounds.lamax) / 2, (bounds.lomin + bounds.lomax) / 2]
    : [lat ?? initialPoint?.lat ?? 51.5074, lng ?? initialPoint?.lng ?? -0.1278];

  const dialogTitle =
    title ?? (boundsMode ? "Pick area on map" : "Pick location");

  const boundsValid =
    bounds != null &&
    [bounds.lamin, bounds.lamax, bounds.lomin, bounds.lomax].every(Number.isFinite) &&
    bounds.lamin >= -90 && bounds.lamax <= 90 &&
    bounds.lomin >= -180 && bounds.lomax <= 180 &&
    bounds.lamin < bounds.lamax &&
    bounds.lomin < bounds.lomax;
  const canSave = boundsMode ? boundsValid : lat != null && lng != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search for a place (e.g. London, ExCeL Centre)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              data-testid="input-location-search"
            />
            <Button
              type="button"
              onClick={runSearch}
              disabled={searching || !search.trim()}
              data-testid="button-location-search"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-md border bg-background">
              {results.map((r, idx) => (
                <button
                  key={`${r.lat}-${r.lon}-${idx}`}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => handleResultClick(r)}
                  data-testid={`result-location-${idx}`}
                >
                  <MapPin className="mr-2 inline h-3 w-3 text-muted-foreground" />
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          <div className="h-80 w-full overflow-hidden rounded-md border">
            <MapContainer
              center={center}
              zoom={initialPoint || initialBounds ? 8 : 4}
              style={{ width: "100%", height: "100%" }}
              data-testid="map-location-picker"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <ClickHandler onPick={handleMapClick} />
              <MapRecenter
                lat={!boundsMode ? lat : null}
                lng={!boundsMode ? lng : null}
                bounds={boundsMode ? bounds : null}
              />
              {!boundsMode && lat != null && lng != null && (
                <Marker position={[lat, lng]} icon={defaultIcon} />
              )}
              {boundsMode && bounds && (
                <Rectangle
                  bounds={[
                    [bounds.lamin, bounds.lomin],
                    [bounds.lamax, bounds.lomax],
                  ]}
                  pathOptions={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.1 }}
                />
              )}
              {boundsMode && pendingCorner && (
                <Marker position={[pendingCorner.lat, pendingCorner.lng]} icon={defaultIcon} />
              )}
            </MapContainer>
          </div>
          {!boundsMode ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Latitude</Label>
                  <Input
                    value={lat != null ? lat.toFixed(5) : ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setLat(Number.isFinite(v) ? v : null);
                    }}
                    data-testid="input-picker-lat"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Longitude</Label>
                  <Input
                    value={lng != null ? lng.toFixed(5) : ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setLng(Number.isFinite(v) ? v : null);
                    }}
                    data-testid="input-picker-lng"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-picker-place-name">
                {reverseLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Looking up place name…
                  </span>
                ) : placeName ? (
                  <span>Selected: {placeName}</span>
                ) : (
                  <span>Click the map or search to choose a location.</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["lamin", "lamax", "lomin", "lomax"] as const).map((key) => {
                  const labels = { lamin: "Min Lat", lamax: "Max Lat", lomin: "Min Lon", lomax: "Max Lon" };
                  return (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{labels[key]}</Label>
                      <Input
                        value={bounds ? bounds[key].toFixed(4) : ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          setBounds((b) => (b ? { ...b, [key]: v } : b));
                        }}
                        data-testid={`input-picker-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-picker-bounds-hint">
                {pendingCorner ? (
                  <span>First corner set. Click another point to set the opposite corner.</span>
                ) : bounds && !boundsValid ? (
                  <span className="text-destructive">
                    Bounds are out of range or min ≥ max. Adjust so lat is within ±90, lon within ±180, and min &lt; max.
                  </span>
                ) : bounds ? (
                  <span>
                    Box covers ~{Math.abs(bounds.lamax - bounds.lamin).toFixed(2)}° lat ×{" "}
                    {Math.abs(bounds.lomax - bounds.lomin).toFixed(2)}° lon. Click the map to redraw.
                  </span>
                ) : (
                  <span>Click two opposite corners on the map (or search a place) to define the bounding box.</span>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-picker-cancel">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="button-picker-save"
          >
            {boundsMode ? "Use this area" : "Use this location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
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

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapRecenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) {
      map.setView([lat, lng], Math.max(map.getZoom(), 10));
    }
  }, [lat, lng, map]);
  return null;
}

interface WeatherLocationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat?: string | null;
  initialLng?: string | null;
  initialPlaceName?: string | null;
  onSelect: (result: { lat: string; lng: string; placeName: string | null }) => void;
}

export function WeatherLocationPicker({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  initialPlaceName,
  onSelect,
}: WeatherLocationPickerProps) {
  const parsedInitial = useMemo(() => {
    const lat = initialLat ? parseFloat(initialLat) : NaN;
    const lng = initialLng ? parseFloat(initialLng) : NaN;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [initialLat, initialLng]);

  const [lat, setLat] = useState<number | null>(parsedInitial?.lat ?? null);
  const [lng, setLng] = useState<number | null>(parsedInitial?.lng ?? null);
  const [placeName, setPlaceName] = useState<string | null>(initialPlaceName ?? null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const reverseTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setLat(parsedInitial?.lat ?? null);
      setLng(parsedInitial?.lng ?? null);
      setPlaceName(initialPlaceName ?? null);
      setSearch("");
      setResults([]);
    }
  }, [open, parsedInitial, initialPlaceName]);

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

  const handlePick = (newLat: number, newLng: number, friendlyName?: string) => {
    setLat(newLat);
    setLng(newLng);
    if (friendlyName) {
      setPlaceName(friendlyName);
    } else {
      setPlaceName(null);
      reverseGeocode(newLat, newLng);
    }
  };

  const handleResultClick = (r: SearchResult) => {
    const newLat = parseFloat(r.lat);
    const newLng = parseFloat(r.lon);
    if (Number.isFinite(newLat) && Number.isFinite(newLng)) {
      handlePick(newLat, newLng, r.display_name);
    }
  };

  const handleSave = () => {
    if (lat == null || lng == null) return;
    onSelect({
      lat: lat.toFixed(5),
      lng: lng.toFixed(5),
      placeName: placeName?.trim() ? placeName.trim() : null,
    });
    onOpenChange(false);
  };

  const center: [number, number] = [
    lat ?? parsedInitial?.lat ?? 51.5074,
    lng ?? parsedInitial?.lng ?? -0.1278,
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick weather location</DialogTitle>
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
              zoom={parsedInitial ? 10 : 4}
              style={{ width: "100%", height: "100%" }}
              data-testid="map-location-picker"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <ClickHandler onPick={(la, ln) => handlePick(la, ln)} />
              <MapRecenter lat={lat} lng={lng} />
              {lat != null && lng != null && (
                <Marker position={[lat, lng]} icon={defaultIcon} />
              )}
            </MapContainer>
          </div>
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-picker-cancel">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={lat == null || lng == null}
            data-testid="button-picker-save"
          >
            Use this location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

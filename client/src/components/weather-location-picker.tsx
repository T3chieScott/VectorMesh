import { LocationPicker, type PointResult } from "@/components/location-picker";

interface WeatherLocationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat?: string | null;
  initialLng?: string | null;
  initialPlaceName?: string | null;
  onSelect: (result: PointResult) => void;
}

export function WeatherLocationPicker(props: WeatherLocationPickerProps) {
  return (
    <LocationPicker
      mode="point"
      title="Pick weather location"
      open={props.open}
      onOpenChange={props.onOpenChange}
      initialLat={props.initialLat ?? null}
      initialLng={props.initialLng ?? null}
      initialPlaceName={props.initialPlaceName ?? null}
      onSelect={props.onSelect}
    />
  );
}

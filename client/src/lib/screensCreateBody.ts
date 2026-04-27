// Task #182: pure helper that turns ScreenFormValues from the
// CreateScreenDialog form into the request body sent to
// POST /api/screens. Lifted out of client/src/pages/screens.tsx so
// tests/screens-create-regenerate-flow.test.ts can pin the wire shape
// the dialog produces — most importantly, that no `pairingCode` field
// is ever sent (the server is the only sanctioned source of pairing
// codes; see Task #180).
//
// Keep this file dependency-free of React / RHF so it can be imported
// directly from node:test without a JSX or DOM environment.

export interface ScreenCreateFormInput {
  name: string;
  location?: string;
  clientId?: string | null;
  displayProfileId?: string;
  fallbackLayoutId?: string | null;
  fallbackPlaylistId?: string | null;
  canvasEnabled?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  canvasX?: number;
  canvasY?: number;
  roomCapacity?: number | null;
  weatherLat?: string;
  weatherLng?: string;
  weatherPlaceName?: string;
  weatherUnit?: "celsius" | "fahrenheit";
}

export interface ScreenCreateRequestBody {
  name: string;
  location?: string;
  clientId: string | null;
  displayProfileId?: string;
  fallbackLayoutId?: string | null;
  fallbackPlaylistId?: string | null;
  canvasEnabled: boolean;
  canvasWidth: number | null;
  canvasHeight: number | null;
  canvasX: number;
  canvasY: number;
  roomCapacity: number | null;
  weatherLat: string | null;
  weatherLng: string | null;
  weatherPlaceName: string | null;
  weatherUnit: "celsius" | "fahrenheit";
}

export function buildCreateScreenRequestBody(
  data: ScreenCreateFormInput,
): ScreenCreateRequestBody {
  // Task #180: server mints the pairing code via
  // generateUniquePairingCode so the DB-level UNIQUE constraint on
  // screens.pairing_code holds. Client never invents codes — this
  // function MUST NOT add a `pairingCode` field. The companion test
  // in tests/screens-create-regenerate-flow.test.ts pins this.
  return {
    ...data,
    clientId: data.clientId || null,
    canvasEnabled: data.canvasEnabled || false,
    canvasWidth: data.canvasEnabled ? (data.canvasWidth ?? null) : null,
    canvasHeight: data.canvasEnabled ? (data.canvasHeight ?? null) : null,
    canvasX: data.canvasEnabled ? (data.canvasX || 0) : 0,
    canvasY: data.canvasEnabled ? (data.canvasY || 0) : 0,
    roomCapacity:
      data.roomCapacity == null || Number.isNaN(data.roomCapacity)
        ? null
        : data.roomCapacity,
    weatherLat: data.weatherLat?.trim() ? data.weatherLat.trim() : null,
    weatherLng: data.weatherLng?.trim() ? data.weatherLng.trim() : null,
    weatherPlaceName: data.weatherPlaceName?.trim()
      ? data.weatherPlaceName.trim()
      : null,
    weatherUnit: data.weatherUnit || "celsius",
  };
}

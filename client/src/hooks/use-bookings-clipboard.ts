import { useCallback, useEffect, useState } from "react";
import type { ScreenEventBooking } from "@shared/schema";

const STORAGE_KEY = "vectormesh:bookings-clipboard";
const EVENT_NAME = "vectormesh:bookings-clipboard:changed";

// Server-only fields stripped before storing on the clipboard. Pasting
// always creates fresh rows on the target screen, so identity / audit
// columns and the source screenId are never persisted.
export interface ClipboardBooking {
  eventId: string;
  startsAt: string;
  endsAt: string;
}

export interface BookingsClipboard {
  sourceScreenId: string;
  sourceScreenName: string;
  bookings: ClipboardBooking[];
  copiedAt: string;
}

function read(): BookingsClipboard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingsClipboard;
    if (!parsed?.bookings || !Array.isArray(parsed.bookings)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(value: BookingsClipboard | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
    // Notify other components in the same tab. sessionStorage doesn't
    // fire `storage` events for the writing tab, so we use a custom one.
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Quota exceeded or storage disabled — fail silently; clipboard is
    // a convenience feature, not critical state.
  }
}

export function useBookingsClipboard() {
  const [clipboard, setClipboard] = useState<BookingsClipboard | null>(() => read());

  useEffect(() => {
    const refresh = () => setClipboard(read());
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const copyFrom = useCallback(
    (
      source: { id: string; name: string },
      bookings: ScreenEventBooking[],
    ) => {
      const payload: BookingsClipboard = {
        sourceScreenId: source.id,
        sourceScreenName: source.name,
        copiedAt: new Date().toISOString(),
        bookings: bookings.map((b) => ({
          eventId: b.eventId,
          // Always serialise to ISO so the value round-trips through
          // sessionStorage and matches what the API expects.
          startsAt:
            b.startsAt instanceof Date
              ? b.startsAt.toISOString()
              : new Date(b.startsAt).toISOString(),
          endsAt:
            b.endsAt instanceof Date
              ? b.endsAt.toISOString()
              : new Date(b.endsAt).toISOString(),
        })),
      };
      write(payload);
    },
    [],
  );

  const clear = useCallback(() => write(null), []);

  return { clipboard, copyFrom, clear };
}

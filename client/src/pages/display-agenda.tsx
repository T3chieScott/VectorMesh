import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { AgendaDisplayWidget } from "@/components/agenda/AgendaDisplayWidget";
import { CustomFontFaces } from "@/lib/fontFace";
import type { AgendaItem, AgendaWidgetConfig } from "@shared/schema";
import type { CustomFontRef } from "@shared/fonts";

// Chromeless full-screen display page used by signage players.
// Mounted at /display/agenda/:configId — no sidebar, no auth.
// Polls /api/agenda/display/:configId on the configured interval
// and re-renders when items change.
//
// Task #216:
// - A 404 is treated as a *terminal* "retired/deleted" state — we show a
//   calm branded message and stop polling, instead of hammering the
//   server forever with the generic "HTTP 404" text.
// - Transient errors (network blip, 5xx) do NOT immediately wipe the
//   screen. We keep the last-good payload visible for a grace period
//   (STALE_GRACE_MS) so a brief outage on a public-facing signage
//   display doesn't flip to an angry error card.

interface DisplayPayload {
  config: AgendaWidgetConfig;
  items: AgendaItem[];
  client: { id: string; name: string; timezone: string } | null;
  fonts?: CustomFontRef[];
  serverTime: number;
}

// How long to keep showing the last-good payload after a transient
// failure before falling back to the generic error screen.
const STALE_GRACE_MS = 2 * 60 * 1000;

export default function DisplayAgendaPage() {
  const [, params] = useRoute("/display/agenda/:configId");
  const configId = params?.configId;
  // Optional test-date override (?at=<ISO instant>) so an operator can
  // view a real screen as if "now" were a chosen moment. Absent = live.
  const testAtParam = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  ).get("at");
  const parsedTestNow = testAtParam ? new Date(testAtParam) : null;
  const testNow =
    parsedTestNow && !Number.isNaN(parsedTestNow.getTime())
      ? parsedTestNow
      : undefined;
  // Normalised ISO instant, only set when the param parsed cleanly, so
  // we never forward garbage to the server.
  const validAtIso = testNow ? testNow.toISOString() : null;
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retired, setRetired] = useState(false);
  // Ref-based polling so the next interval is always derived from the
  // latest fetched config, not the effect's initial closure.
  const intervalRef = useRef<number>(30);
  // Wall-clock timestamp of the last successful payload, used to decide
  // whether a transient failure is still inside the grace window.
  const lastGoodAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!configId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      let terminal = false;
      try {
        const url = validAtIso
          ? `/api/agenda/display/${configId}?at=${encodeURIComponent(validAtIso)}`
          : `/api/agenda/display/${configId}`;
        const res = await fetch(url, {
          cache: "no-store",
        });
        if (res.status === 404) {
          // Config deleted (or bad id in URL) — terminal state. Stop
          // polling and show the retired message.
          if (!cancelled) {
            setRetired(true);
            setData(null);
            setError(null);
          }
          terminal = true;
        } else if (!res.ok) {
          // Transient server error (5xx etc). Only surface the error
          // card if we have no recent good payload to keep showing.
          if (!cancelled) {
            const lastGoodAt = lastGoodAtRef.current;
            const withinGrace =
              lastGoodAt !== null && Date.now() - lastGoodAt < STALE_GRACE_MS;
            if (!withinGrace) {
              setData(null);
              setError(`HTTP ${res.status}`);
            }
          }
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled) {
            setData(payload);
            setError(null);
            setRetired(false);
            lastGoodAtRef.current = Date.now();
            intervalRef.current = payload.config?.refreshIntervalSeconds ?? 30;
          }
        }
      } catch (e) {
        // Network blip — same grace-period treatment as a 5xx.
        if (!cancelled) {
          const lastGoodAt = lastGoodAtRef.current;
          const withinGrace =
            lastGoodAt !== null && Date.now() - lastGoodAt < STALE_GRACE_MS;
          if (!withinGrace) {
            setData(null);
            setError(String(e));
          }
        }
      }
      if (!cancelled && !terminal) {
        timer = setTimeout(load, Math.max(5, intervalRef.current) * 1000);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [configId, validAtIso]);

  // Lock body so the chromeless page never scrolls under the widget.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!configId) {
    return <div className="p-8 text-rose-500">Missing config id in URL.</div>;
  }
  if (retired) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200"
        data-testid="agenda-display-retired"
      >
        <div className="text-center px-8">
          <p className="text-3xl font-semibold mb-3">This display has been retired</p>
          <p className="opacity-70 max-w-md mx-auto">
            The agenda for this screen is no longer available. Please contact
            the event organiser if you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200"
        data-testid="agenda-display-error"
      >
        <div className="text-center">
          <p className="text-2xl font-semibold mb-2">Agenda unavailable</p>
          <p className="opacity-70">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400"
        data-testid="agenda-display-loading"
      >
        Loading agenda…
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <CustomFontFaces fonts={data.fonts} />
      <AgendaDisplayWidget
        config={data.config}
        items={data.items}
        timezone={data.client?.timezone || null}
        now={testNow}
      />
    </div>
  );
}

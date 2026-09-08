import React, { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { AgendaDisplayWidget } from "@/components/agenda/AgendaDisplayWidget";
import { CustomFontFaces } from "@/lib/fontFace";
import type { AgendaItem, AgendaWidgetConfig } from "@shared/schema";
import type { CustomFontRef } from "@shared/fonts";
import {
  agendaPollDelayMs,
  buildAgendaDisplayPollUrl,
  DEFAULT_AGENDA_POLL_SECONDS,
} from "@/lib/agendaDisplayPolling";

export const AGENDA_DISPLAY_REFRESH_EVENT = "agenda-display-refresh";

// Chromeless full-screen display page used by signage players.
// Mounted at /display/agenda/:configId — no sidebar, no auth.
// Polls /api/agenda/display/:configId on the configured interval
// and re-renders when items change.
//
// Task #216:
// - A 404 is treated as a *terminal* "retired/deleted" state — we show a
//   calm branded message and stop polling, instead of hammering the
//   server forever with the generic "HTTP 404" text.
// - Transient errors (network blip, 5xx) never replace a valid payload.
//   Only another successful response (including items:[]) may change the
//   visible frame, so an outage cannot resurrect/remove agenda content.

interface DisplayPayload {
  config: AgendaWidgetConfig;
  items: AgendaItem[];
  effectiveDay?: string | null;
  client: { id: string; name: string; timezone: string } | null;
  fonts?: CustomFontRef[];
  serverTime: number;
}

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
  // In addition to effect cancellation, this closes the tiny interval between
  // a route change rendering and its old effect cleanup. A delayed response
  // from config A must never overwrite config B.
  const requestedConfigIdRef = useRef(configId);
  const requestGenerationRef = useRef(0);
  if (requestedConfigIdRef.current !== configId) {
    requestedConfigIdRef.current = configId;
    requestGenerationRef.current += 1;
  }
  // Ref-based polling so the next interval is always derived from the
  // latest fetched config, not the effect's initial closure.
  const intervalRef = useRef<number>(DEFAULT_AGENDA_POLL_SECONDS);
  const requestSequenceRef = useRef(0);
  const dataRef = useRef<DisplayPayload | null>(data);
  dataRef.current = data;

  useEffect(() => {
    if (!configId) return;
    const activeConfigId = configId;
    const requestGeneration = requestGenerationRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let loadGeneration = 0;
    let activeController: AbortController | null = null;

    async function load() {
      const thisLoadGeneration = ++loadGeneration;
      if (timer) clearTimeout(timer);
      timer = null;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      let terminal = false;
      try {
        const url = buildAgendaDisplayPollUrl(
          activeConfigId,
          validAtIso,
          ++requestSequenceRef.current,
        );
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
          },
        });
        if (res.status === 404) {
          // Config deleted (or bad id in URL) — terminal state. Stop
          // polling and show the retired message.
          if (!cancelled && thisLoadGeneration === loadGeneration &&
              requestGeneration === requestGenerationRef.current) {
            setRetired(true);
            setData(null);
            setError(null);
          }
          terminal = true;
        } else if (!res.ok) {
          // Transient server error (5xx etc). Only surface the error
          // card if there is no valid payload to keep showing.
          if (!cancelled && thisLoadGeneration === loadGeneration &&
              requestGeneration === requestGenerationRef.current) {
            // A failed refresh is not content. Keep the last valid agenda
            // indefinitely; only a successful payload (including items: [])
            // is allowed to replace/remove it.
            if (!dataRef.current) setError(`HTTP ${res.status}`);
          }
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled && thisLoadGeneration === loadGeneration &&
              requestGeneration === requestGenerationRef.current) {
            setData(payload);
            setError(null);
            setRetired(false);
            intervalRef.current = payload.config?.refreshIntervalSeconds ?? 30;
          }
        }
      } catch (e) {
        // Network blip — same last-valid-payload treatment as a 5xx.
        if (!controller.signal.aborted && !cancelled &&
            thisLoadGeneration === loadGeneration &&
            requestGeneration === requestGenerationRef.current) {
          if (!dataRef.current) setError(String(e));
        }
      }
      if (!cancelled && thisLoadGeneration === loadGeneration && !terminal) {
        timer = setTimeout(load, agendaPollDelayMs(intervalRef.current));
      }
    }
    load();
    const refreshNow = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      void load();
    };
    window.addEventListener(AGENDA_DISPLAY_REFRESH_EVENT, refreshNow);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      activeController?.abort();
      window.removeEventListener(AGENDA_DISPLAY_REFRESH_EVENT, refreshNow);
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
        key={configId}
        config={data.config}
        items={data.items}
        effectiveDay={data.effectiveDay}
        timezone={data.client?.timezone || null}
        now={testNow}
      />
    </div>
  );
}

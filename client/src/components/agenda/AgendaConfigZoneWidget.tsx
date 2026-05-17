import { useEffect, useState } from "react";
import { AgendaDisplayWidget } from "./AgendaDisplayWidget";
import type { AgendaItem, AgendaWidgetConfig } from "@shared/schema";

// Wrapper that turns an agenda widget config id into the live
// AgendaDisplayWidget by polling the same public endpoint that
// powers the chromeless /display/agenda/:configId page. Used by:
//   - layout zones of type "agenda" (inline inside a zone), and
//   - programme blocks that target an agenda config directly
//     (rendered fullscreen as the synthetic __fallback__ zone).
//
// The endpoint is unauthenticated by design so signage players on
// network-isolated devices can fetch it without needing a session.

interface DisplayPayload {
  config: AgendaWidgetConfig;
  items: AgendaItem[];
  client: { id: string; name: string; timezone: string } | null;
  serverTime: number;
}

export function AgendaConfigZoneWidget({
  configId,
}: {
  configId: string;
}) {
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let intervalSec = 30;

    async function load() {
      try {
        const res = await fetch(`/api/agenda/display/${configId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError(`HTTP ${res.status}`);
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled) {
            setData(payload);
            setError(null);
            intervalSec = payload.config?.refreshIntervalSeconds ?? 30;
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
      if (!cancelled) {
        timer = setTimeout(load, Math.max(5, intervalSec) * 1000);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [configId]);

  if (!configId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-300 text-sm" data-testid="agenda-zone-missing">
        No agenda config selected
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-rose-300 text-sm" data-testid="agenda-zone-error">
        Agenda unavailable: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 text-sm" data-testid="agenda-zone-loading">
        Loading agenda…
      </div>
    );
  }
  return (
    <AgendaDisplayWidget
      config={data.config}
      items={data.items}
      timezone={data.client?.timezone || null}
    />
  );
}

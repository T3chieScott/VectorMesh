import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { AgendaDisplayWidget } from "@/components/agenda/AgendaDisplayWidget";
import type { AgendaItem, AgendaWidgetConfig } from "@shared/schema";

// Chromeless full-screen display page used by signage players.
// Mounted at /display/agenda/:configId — no sidebar, no auth.
// Polls /api/agenda/display/:configId on the configured interval
// and re-renders when items change.

interface DisplayPayload {
  config: AgendaWidgetConfig;
  items: AgendaItem[];
  client: { id: string; name: string; timezone: string } | null;
  serverTime: number;
}

export default function DisplayAgendaPage() {
  const [, params] = useRoute("/display/agenda/:configId");
  const configId = params?.configId;
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/agenda/display/${configId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled) {
            setData(payload);
            setError(null);
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
      const intervalSec = data?.config?.refreshIntervalSeconds ?? 30;
      timer = setTimeout(load, Math.max(5, intervalSec) * 1000);
    }
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);

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
  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <p className="text-2xl font-semibold mb-2">Agenda unavailable</p>
          <p className="opacity-70">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Loading agenda…
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <AgendaDisplayWidget
        config={data.config}
        items={data.items}
        timezone={data.client?.timezone || null}
      />
    </div>
  );
}

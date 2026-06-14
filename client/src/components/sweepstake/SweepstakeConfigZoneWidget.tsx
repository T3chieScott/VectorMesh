import { useEffect, useState } from "react";
import {
  SweepstakeDisplayWidget,
  type SweepstakeDisplayData,
} from "./SweepstakeDisplayWidget";

// Wrapper that turns a sweepstake widget config id into the live
// SweepstakeDisplayWidget by polling the same public endpoint that
// powers the chromeless /display/sweepstake/:configId page. Used by
// layout zones of type "sweepstake" (inline inside a zone).
//
// The endpoint is unauthenticated by design so signage players on
// network-isolated devices can fetch it without needing a session.

interface DisplayPayload extends SweepstakeDisplayData {
  serverTime: number;
}

const STALE_GRACE_MS = 2 * 60 * 1000;

export function SweepstakeConfigZoneWidget({
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
    let lastGoodAt: number | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/sweepstake/display/${configId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) {
            const withinGrace =
              lastGoodAt !== null && Date.now() - lastGoodAt < STALE_GRACE_MS;
            if (!withinGrace) setError(`HTTP ${res.status}`);
          }
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled) {
            setData(payload);
            setError(null);
            lastGoodAt = Date.now();
            intervalSec = payload.refreshIntervalSeconds ?? 30;
          }
        }
      } catch (e) {
        if (!cancelled) {
          const withinGrace =
            lastGoodAt !== null && Date.now() - lastGoodAt < STALE_GRACE_MS;
          if (!withinGrace) setError(String(e));
        }
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
      <div
        className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-300 text-sm"
        data-testid="sweepstake-zone-missing"
      >
        No sweepstake selected
      </div>
    );
  }
  if (error && !data) {
    return (
      <div
        className="w-full h-full flex items-center justify-center bg-slate-900 text-rose-300 text-sm"
        data-testid="sweepstake-zone-error"
      >
        Sweepstake unavailable: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div
        className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 text-sm"
        data-testid="sweepstake-zone-loading"
      >
        Loading sweepstake…
      </div>
    );
  }
  return (
    <div className="w-full h-full">
      <SweepstakeDisplayWidget data={data} />
    </div>
  );
}

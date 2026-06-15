import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import {
  SweepstakeDisplayWidget,
  type SweepstakeDisplayData,
} from "@/components/sweepstake/SweepstakeDisplayWidget";

// Chromeless full-screen sweepstake display used by signage players.
// Mounted at /display/sweepstake/:configId — no sidebar, no auth.
// Polls the public scrubbed endpoint on the configured interval and
// re-renders when data changes.
//
// Mirrors the agenda display robustness:
// - A 404 is a *terminal* "retired/deleted" state — show a calm message and
//   stop polling.
// - Transient errors (network blip, 5xx) keep the last-good payload on screen
//   for a grace period so a brief outage doesn't blank a public display.

interface DisplayPayload extends SweepstakeDisplayData {
  serverTime: number;
}

const STALE_GRACE_MS = 2 * 60 * 1000;

export default function DisplaySweepstakePage() {
  const [, params] = useRoute("/display/sweepstake/:configId");
  const configId = params?.configId;
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retired, setRetired] = useState(false);
  const intervalRef = useRef<number>(30);
  const lastGoodAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!configId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      let terminal = false;
      try {
        const res = await fetch(`/api/sweepstake/display/${configId}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) {
            setRetired(true);
            setData(null);
            setError(null);
          }
          terminal = true;
        } else if (!res.ok) {
          if (!cancelled) {
            const lastGoodAt = lastGoodAtRef.current;
            const withinGrace = lastGoodAt !== null && Date.now() - lastGoodAt < STALE_GRACE_MS;
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
            intervalRef.current =
              payload.live?.enabled && payload.live.refreshSeconds
                ? payload.live.refreshSeconds
                : payload.refreshIntervalSeconds ?? 30;
          }
        }
      } catch (e) {
        if (!cancelled) {
          const lastGoodAt = lastGoodAtRef.current;
          const withinGrace = lastGoodAt !== null && Date.now() - lastGoodAt < STALE_GRACE_MS;
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
  if (retired) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200"
        data-testid="sweepstake-display-retired"
      >
        <div className="text-center px-8">
          <p className="text-3xl font-semibold mb-3">This display has been retired</p>
          <p className="opacity-70 max-w-md mx-auto">
            This sweepstake is no longer available. Please contact the organiser if
            you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200"
        data-testid="sweepstake-display-error"
      >
        <div className="text-center">
          <p className="text-2xl font-semibold mb-2">Sweepstake unavailable</p>
          <p className="opacity-70">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400"
        data-testid="sweepstake-display-loading"
      >
        Loading sweepstake…
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <SweepstakeDisplayWidget data={data} />
    </div>
  );
}

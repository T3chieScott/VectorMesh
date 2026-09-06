import React, { useEffect, useRef, useState } from "react";
import { AgendaDisplayWidget } from "./AgendaDisplayWidget";
import { CustomFontFaces } from "@/lib/fontFace";
import type { AgendaItem, AgendaWidgetConfig } from "@shared/schema";
import type { CustomFontRef } from "@shared/fonts";
import type { AgendaZoneBinding } from "@/lib/agenda-scene-completion";

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
  fonts?: CustomFontRef[];
  serverTime: number;
}

export function AgendaConfigZoneWidget({
  configId,
  atIso,
  completionBinding,
}: {
  configId: string;
  // Optional test-date override (?at=<ISO instant>). When set, it is
  // forwarded to the server so the agenda resolves as if "now" were
  // that moment, and passed to the widget so its clock freezes there.
  atIso?: string;
  /** Optional playlist-layout lifecycle binding; AgendaDisplayWidget will own ready/complete later. */
  completionBinding?: AgendaZoneBinding;
}) {
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bindings are recreated by some hosts while an activation is mounted. Keep
  // the latest callbacks without making the polling lifecycle restart.
  const bindingRef = useRef(completionBinding);
  bindingRef.current = completionBinding;
  const activationKey = completionBinding?.activationId ?? "";
  const frozenActivationRef = useRef<string | null>(null);
  const observedActivationRef = useRef(activationKey);
  // Do this synchronously, rather than waiting for the clearing effect below:
  // an old activation's rendered data must never suppress a new activation's
  // initial fetch failure.
  if (observedActivationRef.current !== activationKey) {
    observedActivationRef.current = activationKey;
    frozenActivationRef.current = null;
  }

  // Validate the override once. Garbage values fall back to live.
  const parsedTestNow = atIso ? new Date(atIso) : null;
  const testNow =
    parsedTestNow && !Number.isNaN(parsedTestNow.getTime())
      ? parsedTestNow
      : undefined;
  const validAtIso = testNow ? testNow.toISOString() : null;

  useEffect(() => {
    if (!configId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let intervalSec = 30;

    async function load() {
      try {
        const url = validAtIso
          ? `/api/agenda/display/${configId}?at=${encodeURIComponent(validAtIso)}`
          : `/api/agenda/display/${configId}`;
        const res = await fetch(url, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) {
            setError(`HTTP ${res.status}`);
            // Once a controlled activation has a readable snapshot, a later
            // refresh failure is not a failure of that presentation cycle.
            if (frozenActivationRef.current !== activationKey) bindingRef.current?.fail();
          }
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled) {
            // Playlist-controlled scenes deliberately present one immutable
            // payload. Polling remains useful for the following activation,
            // but must not move the current scene back to page one.
            if (!bindingRef.current || frozenActivationRef.current !== activationKey) {
              setData(payload);
              if (bindingRef.current) frozenActivationRef.current = activationKey;
            }
            setError(null);
            intervalSec = payload.config?.refreshIntervalSeconds ?? 30;
          }
        }
      } catch {
        if (!cancelled) {
          setError("Request failed");
          if (frozenActivationRef.current !== activationKey) bindingRef.current?.fail();
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
  // `activationKey` is intentional: a new activation must discard its old
  // snapshot and fetch again, while a new binding object for the same
  // activation must not restart polling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, validAtIso, activationKey]);

  useEffect(() => {
    const activationBinding = bindingRef.current;
    if (!configId) activationBinding?.fail();
    else activationBinding?.register();
    return () => {
      activationBinding?.unregister();
    };
  }, [configId, activationKey]);

  useEffect(() => {
    // Clear the prior controlled snapshot before its new activation fetch.
    if (completionBinding && frozenActivationRef.current !== activationKey) {
      setData(null);
      setError(null);
    }
  }, [activationKey, completionBinding]);

  // Effects run after paint. During the first render of a replacement
  // activation `data` can still contain the previous activation's snapshot;
  // never hand that snapshot to the new binding before its fetch succeeds.
  const displayData =
    completionBinding && frozenActivationRef.current !== activationKey
      ? null
      : data;

  if (!configId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-300 text-sm" data-testid="agenda-zone-missing">
        No agenda config selected
      </div>
    );
  }
  if (error && !displayData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-rose-300 text-sm" data-testid="agenda-zone-error">
        Agenda unavailable: {error}
      </div>
    );
  }
  if (!displayData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 text-sm" data-testid="agenda-zone-loading">
        Loading agenda…
      </div>
    );
  }
  return (
    <>
      <CustomFontFaces fonts={displayData.fonts} />
      <AgendaDisplayWidget
        config={displayData.config}
        items={displayData.items}
        timezone={displayData.client?.timezone || null}
        now={testNow}
        completionBinding={completionBinding}
      />
    </>
  );
}

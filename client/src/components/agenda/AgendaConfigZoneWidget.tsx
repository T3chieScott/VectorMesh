import React, { useEffect, useRef, useState } from "react";
import {
  AgendaDisplayWidget,
  type AgendaDisplayWidgetProps,
  type AgendaPaginationSnapshot,
  type AgendaPresentationState,
} from "./AgendaDisplayWidget";
import { CustomFontFaces } from "@/lib/fontFace";
import type { AgendaItem, AgendaWidgetConfig } from "@shared/schema";
import type { CustomFontRef } from "@shared/fonts";
import {
  activationId,
  type AgendaZoneBinding,
} from "@/lib/agenda-scene-completion";
import {
  agendaPollDelayMs,
  buildAgendaDisplayPollUrl,
  DEFAULT_AGENDA_POLL_SECONDS,
} from "@/lib/agendaDisplayPolling";

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
  payloadRevision: string;
  effectiveDay?: string | null;
  client: { id: string; name: string; timezone: string } | null;
  fonts?: CustomFontRef[];
  serverTime: number;
}

export function AgendaConfigZoneWidget({
  configId,
  atIso,
  completionBinding,
  onPresentationState,
  followedPresentationState,
  presentationActivationKey,
  onRenderReady,
  onPreparationOutcome,
  agendaPreparing = false,
  testPresentationTiming,
}: {
  configId: string;
  // Optional test-date override (?at=<ISO instant>). When set, it is
  // forwarded to the server so the agenda resolves as if "now" were
  // that moment, and passed to the widget so its clock freezes there.
  atIso?: string;
  /** Optional playlist-layout lifecycle binding; AgendaDisplayWidget will own ready/complete later. */
  completionBinding?: AgendaZoneBinding;
  onPresentationState?: (state: AgendaPresentationState) => void;
  followedPresentationState?: AgendaPresentationState | null;
  /** Shared host scene identity used by Monitor when no Player binding exists. */
  presentationActivationKey?: string;
  /**
   * Signals that this activation has a usable agenda snapshot.  In particular,
   * an empty items array is a valid, transparent-complete agenda and must not
   * be confused with the loading placeholder.
   */
  onRenderReady?: () => void;
  /** Hidden-frame preparation result; empty is distinct from renderable data. */
  onPreparationOutcome?: (outcome: "visible-ready" | "empty-ready" | "failed") => void;
  /** Hidden atomic-frame preparation: load/freeze data without lifecycle effects. */
  agendaPreparing?: boolean;
  /** Deterministic mounted timing seam used only by component tests. */
  testPresentationTiming?: AgendaDisplayWidgetProps["testPresentationTiming"];
}) {
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paginationReadyPayloadRef = useRef<DisplayPayload | null>(null);
  // Effects clean up after commit. Track the requested config synchronously as
  // well, so an A response resolving in the A→B render/effect gap cannot put A
  // back on screen over B (or over B's valid empty response).
  const requestedConfigIdRef = useRef(configId);
  const requestGenerationRef = useRef(0);
  const requestSequenceRef = useRef(0);
  if (requestedConfigIdRef.current !== configId) {
    requestedConfigIdRef.current = configId;
    requestGenerationRef.current += 1;
  }
  // Bindings are recreated by some hosts while an activation is mounted. Keep
  // the latest callbacks without making the polling lifecycle restart.
  const bindingRef = useRef(completionBinding);
  bindingRef.current = completionBinding;
  const activationKey = completionBinding?.activationId ?? presentationActivationKey ?? "";
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
    const requestGeneration = requestGenerationRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let intervalSec = DEFAULT_AGENDA_POLL_SECONDS;

    async function load() {
      try {
        const url = buildAgendaDisplayPollUrl(
          configId,
          validAtIso,
          ++requestSequenceRef.current,
        );
        const res = await fetch(url, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
          },
        });
        if (!res.ok) {
          if (!cancelled && requestGeneration === requestGenerationRef.current) {
            setError(`HTTP ${res.status}`);
            // Once a controlled activation has a readable snapshot, a later
            // refresh failure is not a failure of that presentation cycle.
            if (!agendaPreparing && frozenActivationRef.current !== activationKey) bindingRef.current?.fail();
          }
        } else {
          const payload: DisplayPayload = await res.json();
          if (!cancelled && requestGeneration === requestGenerationRef.current) {
            // Accept refreshed canonical data on the current activation. The
            // payload revision below gives controlled pagination a new plan
            // identity only when config/session membership actually changed.
            setData(payload);
            if (bindingRef.current && frozenActivationRef.current !== activationKey) {
              frozenActivationRef.current = activationKey;
            }
            setError(null);
            intervalSec = payload.config?.refreshIntervalSeconds ?? 30;
          }
        }
      } catch {
        if (!cancelled && requestGeneration === requestGenerationRef.current) {
          setError("Request failed");
          if (!agendaPreparing && frozenActivationRef.current !== activationKey) bindingRef.current?.fail();
        }
      }
      if (!cancelled) {
        timer = setTimeout(load, agendaPollDelayMs(intervalSec));
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
    if (agendaPreparing) return;
    if (!configId) activationBinding?.fail();
    else {
      activationBinding?.register();
    }
    return () => {
      activationBinding?.unregister();
    };
  }, [configId, activationKey, agendaPreparing]);

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

  useEffect(() => {
    if (!configId) {
      onPreparationOutcome?.("failed");
    } else if (displayData) {
      const outcome = displayData.items.length ? "visible-ready" : "empty-ready";
      if (outcome === "empty-ready") onPreparationOutcome?.(outcome);
    } else if (error) {
      onPreparationOutcome?.("failed");
    }
  }, [configId, displayData, error, onRenderReady, onPreparationOutcome]);

  const handlePaginationReady = (_snapshot: AgendaPaginationSnapshot) => {
    if (!displayData || paginationReadyPayloadRef.current === displayData) return;
    paginationReadyPayloadRef.current = displayData;
    onPreparationOutcome?.("visible-ready");
    onRenderReady?.();
  };

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
  const effectiveCompletionBinding = completionBinding
    ? {
        ...completionBinding,
        activationId: activationId(
          `${completionBinding.activationId}:${displayData.payloadRevision}`,
        ),
      }
    : undefined;
  return (
    <>
      <CustomFontFaces fonts={displayData.fonts} />
      <AgendaDisplayWidget
        key={configId}
        config={displayData.config}
        items={displayData.items}
        effectiveDay={displayData.effectiveDay}
        timezone={displayData.client?.timezone || null}
        now={testNow}
        completionBinding={agendaPreparing ? undefined : effectiveCompletionBinding}
        onPresentationState={agendaPreparing ? undefined : onPresentationState}
        followedPresentationState={followedPresentationState}
        onPaginationReady={handlePaginationReady}
        testPresentationTiming={testPresentationTiming}
      />
    </>
  );
}

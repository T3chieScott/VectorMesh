import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutZone, MediaAsset } from "@shared/schema";
import {
  activationId,
  createAgendaSceneCompletionCoordinator,
  playerId,
  sceneId,
  zoneId,
  type AgendaZoneBinding,
  type SceneActivation,
} from "@/lib/agenda-scene-completion";

export interface SceneTimingItem {
  id?: string;
  layoutTemplateId?: string | null;
  mediaAssetId?: string | null;
  duration?: number | null;
}

/** Existing non-Agenda timing policy, kept independent of completion state. */
export function resolveSceneDurationMs(item: SceneTimingItem | null | undefined, media: readonly MediaAsset[]): number {
  const authoredSeconds = item?.duration ?? 0;
  if (authoredSeconds > 0) return authoredSeconds * 1000;
  const assetSeconds = item?.mediaAssetId
    ? media.find((asset) => asset.id === item.mediaAssetId)?.duration ?? 0
    : 0;
  return (assetSeconds > 0 ? assetSeconds : 30) * 1000;
}

/**
 * The semantic inputs used to decide an activation.  Keep this value-based so
 * routine polling that returns fresh-but-equivalent arrays cannot restart a
 * scene timer.
 */
export function resolveAgendaActivationInputs(
  item: SceneTimingItem | null | undefined,
  media: readonly MediaAsset[],
  zones: readonly LayoutZone[],
): { durationMs: number; agendaZoneIds: readonly string[] } {
  return {
    durationMs: resolveSceneDurationMs(item, media),
    agendaZoneIds: zones.filter((zone) => zone.type === "agenda").map((zone) => zone.id),
  };
}

interface Options {
  enabled: boolean;
  playerInstanceId: string;
  sceneIdValue: string;
  activationKey: string | number;
  item: SceneTimingItem | null | undefined;
  media: readonly MediaAsset[];
  zones: readonly LayoutZone[];
  onAdvance(): void;
}

/**
 * Shared playlist-layout activation policy used by the public player and the
 * simulator. Only layouts containing Agenda zones opt into completion-aware
 * timing; static scenes retain their exact legacy timeout.
 */
export function useAgendaSceneCompletion({
  enabled, playerInstanceId, sceneIdValue, activationKey, item, media, zones, onAdvance,
}: Options): ReadonlyMap<string, AgendaZoneBinding> {
  const coordinatorRef = useRef<ReturnType<typeof createAgendaSceneCompletionCoordinator>>();
  const advanceRef = useRef(onAdvance);
  const serialRef = useRef(0);
  const [activation, setActivation] = useState<SceneActivation | null>(null);
  advanceRef.current = onAdvance;

  if (!coordinatorRef.current) {
    coordinatorRef.current = createAgendaSceneCompletionCoordinator({
      timer: {
        now: () => Date.now(),
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      },
      onAdvance: () => advanceRef.current(),
      onDiagnostic: (diagnostic) => {
        if (diagnostic.type === "safety-timeout") {
          console.warn(`[agenda-completion] safety timeout scene=${diagnostic.sceneId} activation=${diagnostic.activationId}`);
        }
      },
    });
  }

  const { durationMs, agendaZoneIds } = resolveAgendaActivationInputs(item, media, zones);
  // JSON preserves IDs containing separators and is still a primitive
  // dependency, unlike the server-polled layout array.
  const agendaZoneKey = JSON.stringify(agendaZoneIds);

  useEffect(() => {
    const coordinator = coordinatorRef.current!;
    if (!enabled) {
      coordinator.dispose();
      setActivation(null);
      return;
    }
    const base = {
      playerId: playerId(playerInstanceId),
      sceneId: sceneId(sceneIdValue),
      activationId: activationId(`${playerInstanceId}:${sceneIdValue}:${++serialRef.current}`),
    };
    const next: SceneActivation = agendaZoneIds.length > 0
      ? { ...base, kind: "agenda", minimumDurationMs: durationMs, expectedAgendaZoneIds: agendaZoneIds.map(zoneId) }
      : { ...base, kind: "static", durationMs };
    coordinator.begin(next);
    setActivation(next);
    return () => coordinator.dispose();
  }, [enabled, playerInstanceId, sceneIdValue, activationKey, agendaZoneKey, durationMs]);

  return useMemo(() => {
    if (!activation || activation.kind !== "agenda") return new Map();
    const coordinator = coordinatorRef.current!;
    return new Map(activation.expectedAgendaZoneIds.map((id) => [id as string, {
      playerId: activation.playerId,
      sceneId: activation.sceneId,
      zoneId: id,
      activationId: activation.activationId,
      register: (duration?: number) => coordinator.registerZone(activation.activationId, id, duration),
      ready: (duration?: number) => {
        if (duration !== undefined) coordinator.registerZone(activation.activationId, id, duration);
        return coordinator.markZoneReady(activation.activationId, id);
      },
      complete: () => coordinator.completeZone(activation.activationId, id),
      fail: () => coordinator.failZone(activation.activationId, id),
      unregister: () => coordinator.unregisterZone(activation.activationId, id),
    }]));
  }, [activation]);
}
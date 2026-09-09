import { useLayoutEffect, useRef } from "react";
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

/** Retain only the visible activation and the one currently being prepared. */
export function pruneAgendaPreparedRecords<T>(
  records: Map<string, T>,
  activeKey: string | null,
  desiredKey: string | null,
): void {
  for (const key of records.keys()) {
    if (key !== activeKey && key !== desiredKey) records.delete(key);
  }
}

interface Options {
  /** Whether the desired scene needs Agenda bindings, including while hidden. */
  enabled: boolean;
  /** Whether the desired scene is now the visibly committed scene. */
  active?: boolean;
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
  enabled, active: activeOption, playerInstanceId, sceneIdValue, activationKey, item, media, zones, onAdvance,
}: Options): ReadonlyMap<string, AgendaZoneBinding> {
  // Legacy callers without an explicit preparation phase are always visible.
  const active = activeOption ?? true;
  const coordinatorRef = useRef<ReturnType<typeof createAgendaSceneCompletionCoordinator>>();
  const advanceRef = useRef(onAdvance);
  const serialRef = useRef(0);
  interface PreparedRecord {
    key: string;
    activation: SceneActivation;
    bindings: ReadonlyMap<string, AgendaZoneBinding>;
    pending: Map<string, {
      durationMs?: number;
      registered: boolean;
      ready: boolean;
      terminal?: "complete" | "fail" | "unregister";
    }>;
  }
  const recordsRef = useRef(new Map<string, PreparedRecord>());
  const activeRecordRef = useRef<PreparedRecord | null>(null);
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
  const preparedKey = JSON.stringify([
    playerInstanceId, sceneIdValue, activationKey, agendaZoneKey, durationMs,
  ]);
  let prepared = enabled ? recordsRef.current.get(preparedKey) : undefined;
  if (enabled && !prepared) {
    const base = {
      playerId: playerId(playerInstanceId),
      sceneId: sceneId(sceneIdValue),
      activationId: activationId(`${playerInstanceId}:${sceneIdValue}:${++serialRef.current}`),
    };
    const next: SceneActivation = agendaZoneIds.length > 0
      ? { ...base, kind: "agenda", minimumDurationMs: durationMs, expectedAgendaZoneIds: agendaZoneIds.map(zoneId) }
      : { ...base, kind: "static", durationMs };
    const coordinator = coordinatorRef.current!;
    const pending = new Map<string, {
      durationMs?: number;
      registered: boolean;
      ready: boolean;
      terminal?: "complete" | "fail" | "unregister";
    }>();
    const pendingFor = (id: string) => {
      let lifecycle = pending.get(id);
      if (!lifecycle) {
        lifecycle = { registered: false, ready: false };
        pending.set(id, lifecycle);
      }
      return lifecycle;
    };
    const isActive = () =>
      activeRecordRef.current?.activation.activationId === next.activationId;
    const bindings = next.kind === "agenda"
      ? new Map(next.expectedAgendaZoneIds.map((id) => [id as string, {
      playerId: next.playerId,
      sceneId: next.sceneId,
      zoneId: id,
      activationId: next.activationId,
      register: (duration?: number) => {
        if (isActive()) return coordinator.registerZone(next.activationId, id, duration);
        const lifecycle = pendingFor(id as string);
        lifecycle.registered = true;
        lifecycle.terminal = undefined;
        if (duration !== undefined) {
          lifecycle.durationMs = Math.max(lifecycle.durationMs ?? 0, duration);
        }
        return false;
      },
      ready: (duration?: number) => {
        if (isActive()) {
          if (duration !== undefined) coordinator.registerZone(next.activationId, id, duration);
          return coordinator.markZoneReady(next.activationId, id);
        }
        const lifecycle = pendingFor(id as string);
        lifecycle.registered = true;
        lifecycle.ready = true;
        if (duration !== undefined) {
          lifecycle.durationMs = Math.max(lifecycle.durationMs ?? 0, duration);
        }
        return false;
      },
      complete: () => {
        if (isActive()) return coordinator.completeZone(next.activationId, id);
        pendingFor(id as string).terminal = "complete";
        return false;
      },
      fail: () => {
        if (isActive()) return coordinator.failZone(next.activationId, id);
        pendingFor(id as string).terminal = "fail";
        return false;
      },
      unregister: () => {
        if (isActive()) return coordinator.unregisterZone(next.activationId, id);
        // Hidden preparation and React StrictMode cleanup are not evidence
        // that a committed Agenda zone became non-viable. A later committed
        // registration must still be able to establish readiness normally.
        pending.delete(id as string);
        return false;
      },
    }]))
      : new Map<string, AgendaZoneBinding>();
    prepared = { key: preparedKey, activation: next, bindings, pending };
    recordsRef.current.set(preparedKey, prepared);
  }
  // This must happen during render, not in an effect: C's first hidden render
  // abandons B immediately, closing the window in which a later B could reuse
  // B's stale activation id.
  pruneAgendaPreparedRecords(
    recordsRef.current,
    activeRecordRef.current?.key ?? null,
    enabled ? preparedKey : null,
  );

  const desiredRecord = prepared;
  useLayoutEffect(() => {
    // StrictMode's lifetime cleanup clears the render cache. Always restore
    // the exact record captured by this render, including while the surface is
    // still preparing and `active` is false. Equivalent parent rerenders must
    // keep the binding/activation that already owns AgendaConfig's frozen
    // fetched snapshot rather than manufacturing a new activation and refetch.
    if (enabled && desiredRecord) {
      recordsRef.current.set(desiredRecord.key, desiredRecord);
    }
    if (!active) return;
    if (!enabled || !desiredRecord) {
      // A non-Agenda desired scene must not retire visible A while it is only
      // preparing. Once that scene is committed, stop A exactly once.
      if (activeRecordRef.current) {
        coordinatorRef.current!.dispose();
        activeRecordRef.current = null;
        recordsRef.current.clear();
      }
      return;
    }
    if (activeRecordRef.current?.key === desiredRecord.key) return;
    const previous = activeRecordRef.current;
    // StrictMode lifetime cleanup clears the render cache before replaying
    // this activation setup. Restore the exact prepared record so an
    // equivalent render cannot manufacture a second id/binding whose guard
    // disagrees with the coordinator activated here.
    recordsRef.current.set(desiredRecord.key, desiredRecord);
    coordinatorRef.current!.begin(desiredRecord.activation);
    activeRecordRef.current = desiredRecord;
    if (desiredRecord.activation.kind === "agenda") {
      for (const id of desiredRecord.activation.expectedAgendaZoneIds) {
        const lifecycle = desiredRecord.pending.get(id as string);
        if (!lifecycle) continue;
        coordinatorRef.current!.registerZone(
          desiredRecord.activation.activationId,
          id,
          lifecycle.durationMs,
        );
        if (lifecycle.ready) {
          coordinatorRef.current!.markZoneReady(desiredRecord.activation.activationId, id);
        }
        if (lifecycle.terminal === "complete") {
          coordinatorRef.current!.completeZone(desiredRecord.activation.activationId, id);
        } else if (lifecycle.terminal === "fail") {
          coordinatorRef.current!.failZone(desiredRecord.activation.activationId, id);
        } else if (lifecycle.terminal === "unregister") {
          coordinatorRef.current!.unregisterZone(desiredRecord.activation.activationId, id);
        }
      }
      desiredRecord.pending.clear();
    }
    // Keep a currently visible A record during B preparation, but once B is
    // active A is retired so a later legitimate A cycle gets a fresh id.
    if (previous && previous.key !== desiredRecord.key) {
      recordsRef.current.delete(previous.key);
    }
  }, [enabled, active, preparedKey]);

  // This must be a layout cleanup. In React StrictMode, layout effects are
  // replayed before passive cleanup replay; a passive lifetime cleanup could
  // therefore dispose the coordinator *after* the activation layout effect
  // had already decided A was active, leaving a live-looking but inert
  // binding. Layout cleanup clears the record before activation replay.
  useLayoutEffect(() => () => {
    coordinatorRef.current?.dispose();
    activeRecordRef.current = null;
    recordsRef.current.clear();
  }, []);

  return desiredRecord?.bindings ?? new Map();
}
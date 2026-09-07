import type { LayoutZone } from "@shared/schema";

/**
 * The host-neutral interpretation of a resolved player payload.  Resolver
 * precedence remains on the server; this only turns that resolved result into
 * renderable layout/playlist scenes.  Keeping it here prevents Player and
 * Monitor from disagreeing about the special fallback playlist zone.
 */
export interface ContentPresentationPayload {
  layout?: PresentationLayout | null;
  layoutTemplates?: Record<string, PresentationLayout | null> | null;
  playlistItems?: Record<string, Array<{
    id: string; order?: number | null; mediaAssetId?: string | null;
    layoutTemplateId?: string | null; duration?: number | null;
  }>> | null;
  zoneSources?: Array<{
    zoneId: string; type: string; playlistId?: string | null; agendaConfigId?: string | null;
  }> | null;
  presentation?: { revision?: string; activationEpoch?: number } | null;
}

export interface PresentationLayout {
  id?: string;
  zones?: unknown;
  aspectRatio?: string | null;
  customWidth?: number | null;
  customHeight?: number | null;
  [key: string]: unknown;
}

export interface ContentPresentation {
  revision: string | null;
  activationEpoch: number;
  rotationPlaylistId: string | null;
  rotationItems: NonNullable<ContentPresentationPayload["playlistItems"]>[string];
  isLayoutRotation: boolean;
  layout: PresentationLayout | null;
  isFallbackPlaylist: boolean;
  isFallbackAgenda: boolean;
  rawZones: LayoutZone[];
  zones: LayoutZone[];
}

const ordered = <T extends { order?: number | null }>(items: T[]) =>
  [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function mediaItems(items: ContentPresentation["rotationItems"]) {
  return ordered(items)
    .filter((item) => item.mediaAssetId && !item.layoutTemplateId)
    .map((item) => ({ id: item.id, mediaAssetId: item.mediaAssetId!, duration: item.duration ?? undefined }));
}

export function buildContentPresentation(
  content: ContentPresentationPayload | null | undefined,
  rotationIndex = 0,
): ContentPresentation {
  const sources = content?.zoneSources ?? [];
  const playlists = content?.playlistItems ?? {};
  const templates = content?.layoutTemplates ?? {};
  // A playlist source is a layout rotation whenever it contains valid layout
  // entries. This deliberately includes __fallback__: that was the black
  // monitor defect (Monitor only recognised __fallback_rotation__).
  const playlistSources = sources
    .filter((source) => source.type === "playlist" && source.playlistId)
    .map((source) => ({
      playlistId: source.playlistId!,
      items: ordered(playlists[source.playlistId!] ?? [])
        .filter((item) => !!item.layoutTemplateId && !!templates[item.layoutTemplateId]),
      // A null-layout schedule block is represented by this synthetic source.
      // Prefer it over any incidental playlist source so its template sequence
      // remains the physical Player's single rotation authority.
      isFallback: source.zoneId === "__fallback__",
    }));
  const rotationSource = [
    ...playlistSources.filter((source) => source.isFallback),
    ...playlistSources.filter((source) => !source.isFallback),
  ]
    .find((source) => source.items.length > 0);
  const rotationItems = rotationSource?.items ?? [];
  const isLayoutRotation = rotationItems.length > 0;
  const active = isLayoutRotation ? rotationItems[rotationIndex % rotationItems.length] : null;
  const layout = active?.layoutTemplateId
    ? templates[active.layoutTemplateId] ?? content?.layout ?? null
    : content?.layout ?? null;
  const fallbackPlaylist = !layout
    ? sources.find((source) => source.zoneId === "__fallback__" && source.type === "playlist")
    : undefined;
  const fallbackAgenda = !layout && !fallbackPlaylist
    ? sources.find((source) => source.zoneId === "__fallback__" && source.type === "agenda" && source.agendaConfigId)
    : undefined;
  let rawZones: LayoutZone[] = (layout?.zones as LayoutZone[]) ?? [];
  if (!layout && fallbackAgenda) {
    rawZones = [{ id: "__fallback__", name: "Agenda", type: "agenda", x: 0, y: 0, width: 100, height: 100, zIndex: 1, agendaConfigId: fallbackAgenda.agendaConfigId! }] as LayoutZone[];
  } else if (!layout && fallbackPlaylist?.playlistId) {
    const items = mediaItems(playlists[fallbackPlaylist.playlistId] ?? []);
    if (items.length) rawZones = [{ id: "__fallback__", type: "media_player", x: 0, y: 0, width: 100, height: 100, zIndex: 1, mediaPlayerItems: items }] as LayoutZone[];
  }
  const zones = isLayoutRotation ? rawZones : rawZones.map((zone) => {
    const source = sources.find((candidate) => candidate.zoneId === zone.id && candidate.type === "playlist" && candidate.playlistId);
    if (!source?.playlistId) return zone;
    const items = mediaItems(playlists[source.playlistId] ?? []);
    return items.length ? { ...zone, mediaPlayerItems: items } : zone;
  });
  return {
    revision: content?.presentation?.revision ?? null,
    activationEpoch: content?.presentation?.activationEpoch ?? 0,
    rotationPlaylistId: rotationSource?.playlistId ?? null,
    rotationItems, isLayoutRotation, layout,
    isFallbackPlaylist: !!fallbackPlaylist, isFallbackAgenda: !!fallbackAgenda,
    rawZones, zones,
  };
}

/**
 * Semantic identity for a layout-playlist sequence. It deliberately contains
 * no payload/array object identity, so a fresh equivalent poll cannot restart
 * the Player's current dwell timer.
 */
export function getPresentationSequenceIdentity(
  presentation: Pick<ContentPresentation,
    "revision" | "activationEpoch" | "rotationPlaylistId" | "rotationItems">,
): string {
  return JSON.stringify({
    revision: presentation.revision,
    activationEpoch: presentation.activationEpoch,
    playlistId: presentation.rotationPlaylistId,
    items: presentation.rotationItems.map((item) => ({
      id: item.id,
      layoutTemplateId: item.layoutTemplateId ?? null,
      duration: item.duration ?? null,
    })),
  });
}

/** Layout-playlist durations are authored in seconds. */
export function getPresentationSceneDurationMs(
  presentation: Pick<ContentPresentation, "rotationItems">,
  rotationIndex: number,
): number {
  const item = presentation.rotationItems[
    ((rotationIndex % presentation.rotationItems.length) +
      presentation.rotationItems.length) % presentation.rotationItems.length
  ];
  return Math.max(1, Number(item?.duration) || 30) * 1000;
}

export function getNextPresentationRotationIndex(
  presentation: Pick<ContentPresentation, "rotationItems">,
  rotationIndex: number,
): number {
  return presentation.rotationItems.length > 1
    ? (rotationIndex + 1) % presentation.rotationItems.length
    : 0;
}

/** Agenda scenes are exclusively controlled by their completion coordinator. */
export function shouldSchedulePresentationDwell(
  presentation: Pick<ContentPresentation, "isLayoutRotation" | "rotationItems">,
  activeSceneHasAgenda: boolean,
): boolean {
  return presentation.isLayoutRotation &&
    presentation.rotationItems.length > 1 &&
    !activeSceneHasAgenda;
}

/**
 * Queues one shared presentation send. Callers may update the report object
 * while the timer is pending; `send` is intentionally evaluated at fire time.
 * The boolean is useful for deterministic timer/coalescing tests.
 */
export function scheduleDebouncedPresentationHeartbeat<T>(
  timerRef: { current: T | null },
  send: () => void,
  schedule: (callback: () => void, delayMs: number) => T,
  delayMs = 250,
): boolean {
  if (timerRef.current !== null) return false;
  timerRef.current = schedule(() => {
    timerRef.current = null;
    send();
  }, delayMs);
  return true;
}

export function getPresentationRotationIndex(
  presentation: Pick<ContentPresentation, "rotationItems" | "activationEpoch">,
  nowMs: number,
): number {
  if (presentation.rotationItems.length < 2) return 0;
  const durations = presentation.rotationItems.map((item) => Math.max(1, item.duration ?? 30) * 1000);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  let cursor = ((nowMs - presentation.activationEpoch) % total + total) % total;
  for (let i = 0; i < durations.length; i++) {
    if (cursor < durations[i]) return i;
    cursor -= durations[i];
  }
  return 0;
}

export function getPresentationTransitionMs(
  presentation: Pick<ContentPresentation, "rotationItems" | "activationEpoch">,
  nowMs: number,
): number | null {
  if (presentation.rotationItems.length < 2) return null;
  const index = getPresentationRotationIndex(presentation, nowMs);
  const durations = presentation.rotationItems.map((item) => Math.max(1, item.duration ?? 30) * 1000);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const elapsed = ((nowMs - presentation.activationEpoch) % total + total) % total;
  const before = durations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
  return Math.max(1, before + durations[index] - elapsed);
}

export const playerProcessGenerationKey = (screenId: string) =>
  `vm_player_process_generation_${screenId}`;

/** Claims one non-secret, screen-scoped monotonic browser process generation. */
export function claimPlayerProcessGeneration(
  screenId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  fallback = Date.now(),
): number {
  try {
    const raw = storage.getItem(playerProcessGenerationKey(screenId));
    const previous = raw === null ? 0 : Number(raw);
    const next = Number.isSafeInteger(previous) && previous >= 0 &&
      previous < Number.MAX_SAFE_INTEGER ? previous + 1 : Math.max(1, fallback);
    storage.setItem(playerProcessGenerationKey(screenId), String(next));
    return next;
  } catch {
    return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(fallback)));
  }
}
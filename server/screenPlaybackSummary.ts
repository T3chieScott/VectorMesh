import type { ResolveResult, ContentResolveOutcomeSource } from "./contentResolver";
import type { PlaybackSchedule } from "@shared/playback-derivation";
import type {
  ResolvedContentSummary,
  ResolvedContentType,
  ScreenPlaybackEntity,
} from "@shared/screen-playback";

const MAX_TEXT = 256;
const MAX_ID = 128;

function bounded(value: string | null | undefined, max = MAX_TEXT): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, max);
}

function entity(id: string | null | undefined, name: string | null | undefined): ScreenPlaybackEntity | null {
  const safeId = bounded(id, MAX_ID);
  const safeName = bounded(name);
  return safeId ? { id: safeId, name: safeName } : null;
}

function outcomeFor(result: ResolveResult) {
  const step = result.trace.find((item) => item.kind === "outcome");
  return step && step.kind === "outcome" ? step : null;
}

function contentType(result: ResolveResult, source: ContentResolveOutcomeSource): ResolvedContentType {
  if (result.layout) return "layout";
  if (result.resolvedPlaylist) return "playlist";
  if (result.activeZoneSources.some((source: any) => source?.type === "playlist")) {
    return "playlist";
  }
  if (
    source === "block" &&
    result.activeZoneSources.some((source: any) => source?.type === "agenda")
  ) {
    return "agenda";
  }
  return "none";
}

/**
 * Turn the resolver result into the deliberately small wire representation
 * used by the screens page. In particular, never include trace steps,
 * zone-source payloads, or schedule rule details here.
 */
export function buildScreenPlaybackSummary(
  result: ResolveResult,
  schedule: PlaybackSchedule,
): ResolvedContentSummary {
  const outcome = outcomeFor(result);
  const source = outcome?.source ?? "nothing";
  const type = contentType(result, source);
  const playlistSource = result.activeZoneSources.find(
    (item: any) => item?.type === "playlist" && typeof item.playlistId === "string",
  ) as { playlistId: string } | undefined;
  const agendaSource = result.activeZoneSources.find(
    (item: any) => item?.type === "agenda" && typeof item.agendaConfigId === "string",
  ) as { agendaConfigId: string } | undefined;

  const content =
    type === "layout"
      ? entity(result.layout?.id, result.layout?.name)
      : type === "playlist"
        ? entity(result.resolvedPlaylist?.id ?? playlistSource?.playlistId, result.resolvedPlaylist?.name)
        : type === "agenda"
          ? entity(agendaSource?.agendaConfigId, null)
          : null;

  const outcomeBlock = outcome?.blockId
    ? result.eventBlocks.find((block) => block.id === outcome.blockId)
    : undefined;
  // The trace is authoritative. Never substitute derivePlaybackStatus's
  // tiebreaker here: the player renders precisely the resolver outcome.
  const currentBlock = outcomeBlock;
  const programmeVersion = currentBlock
    ? result.eventProgrammeVersions.find(({ version }) => version.id === currentBlock.programmeVersionId)
    : undefined;

  const nextBlock = schedule.next
    ? entity(schedule.next.block.id, schedule.next.block.name)
    : null;
  const nextStart = schedule.next?.startsAt.toISOString() ?? null;

  const programme = programmeVersion
    ? entity(programmeVersion.programme.id, programmeVersion.programme.name)
    : null;
  const versionId = programmeVersion
    ? bounded(programmeVersion.version.id, MAX_ID)
    : null;
  const version = programmeVersion && versionId
    ? {
        id: versionId,
        versionNumber: programmeVersion.version.versionNumber,
      }
    : null;
  const block = currentBlock ? entity(currentBlock.id, currentBlock.name) : null;

  return {
    source,
    type,
    id: content?.id ?? null,
    name: content?.name ?? null,
    activeEvent: result.activeEvent
      ? entity(result.activeEvent.id, result.activeEvent.name)
      : null,
    programme,
    version,
    block,
    activeProgramme: programme,
    activeVersion: version,
    activeBlock: block,
    currentEffectiveEnd: schedule.current?.endsAt?.toISOString() ?? null,
    nextBlock,
    nextStart,
  };
}

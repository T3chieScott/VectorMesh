import type { Request, Response } from "express";
import { z } from "zod";
import type {
  Event,
  Programme,
  ProgrammeVersion,
  Screen,
  ScreenGroup,
  LayoutTemplate,
  Playlist,
  ScheduleBlock,
  InsertScheduleBlock,
  ScheduleTarget,
  TimeRule,
  ZoneSource,
} from "../shared/schema";
import {
  evaluateLayoutAccess,
  evaluatePlaylistAccess,
  evaluateTargetAccess,
} from "../shared/blockPasteAccess";

// Per-row outcome of a bulk schedule-block paste. The endpoint always
// returns HTTP 200 with one entry per input row so the client can flip
// each preview badge to its actual outcome (Pasted / Skipped / Failed)
// without parsing top-level error envelopes. Codes mirror the spec.
export type BulkBlockResultCode =
  | "forbidden_target"
  | "target_not_found"
  | "forbidden_layout"
  | "forbidden_playlist"
  | "bad_request"
  | "server_error";

export interface ClipboardBlockInput {
  name: string;
  priority?: number | null;
  layoutTemplateId?: string | null;
  targets?: ScheduleTarget[] | null;
  timeRules?: TimeRule[] | null;
  zoneSources?: ZoneSource[] | null;
}

export type BulkBlockResult =
  | {
      index: number;
      status: "created";
      block: ScheduleBlock;
      // List of dropped target descriptors (so the UI can say "1 screen
      // and 1 group target removed"). Always present, may be empty.
      droppedTargets: ScheduleTarget[];
      input: ClipboardBlockInput;
    }
  | {
      index: number;
      status: "error";
      code: BulkBlockResultCode;
      error: string;
      input: ClipboardBlockInput;
    };

// Body schema. We intentionally keep it loose on the shape of
// targets/timeRules/zoneSources — the schedule-block JSON columns are
// already loose and the endpoint should accept whatever the client
// copied without re-validating field-by-field. The per-row processor
// below catches any storage-layer rejection and turns it into a
// per-row server_error.
const targetSchema = z.object({
  type: z.enum(["screen", "group"]),
  id: z.string().min(1),
});

const timeRuleSchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    daysOfWeek: z.array(z.number()).optional(),
  })
  .passthrough();

const zoneSourceSchema = z
  .object({
    zoneId: z.string().min(1),
    type: z.enum(["playlist", "widget"]),
    playlistId: z.string().optional().nullable(),
    mediaAssetIds: z.array(z.string()).optional().nullable(),
    widgetType: z.string().optional().nullable(),
    widgetConfig: z.record(z.unknown()).optional().nullable(),
    rotationInterval: z.number().optional().nullable(),
  })
  .passthrough();

const blockSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().nullable().optional(),
  layoutTemplateId: z.string().nullable().optional(),
  targets: z.array(targetSchema).nullable().optional(),
  timeRules: z.array(timeRuleSchema).nullable().optional(),
  zoneSources: z.array(zoneSourceSchema).nullable().optional(),
});

const bodySchema = z.object({
  blocks: z.array(blockSchema).min(1).max(200),
  // Optional — preserved in the audit log so we can trace where a
  // pasted block originated from.
  sourceProgrammeId: z.string().optional(),
});

export interface BulkBlocksDeps {
  getProgramme: (id: string) => Promise<Programme | undefined>;
  getEvent: (id: string) => Promise<Event | undefined>;
  getProgrammeVersionsByProgramme: (programmeId: string) => Promise<ProgrammeVersion[]>;
  createProgrammeVersion: (data: {
    programmeId: string;
    versionNumber: number;
    status: "draft";
  }) => Promise<ProgrammeVersion>;
  getScreen: (id: string) => Promise<Screen | undefined>;
  getScreenGroup: (id: string) => Promise<ScreenGroup | undefined>;
  getLayoutTemplate: (id: string) => Promise<LayoutTemplate | undefined>;
  getPlaylist: (id: string) => Promise<Playlist | undefined>;
  createScheduleBlock: (data: InsertScheduleBlock) => Promise<ScheduleBlock>;
  newSeriesId: () => string;
}

export interface BulkBlocksAuth {
  // Caller can act on this client (admins always true; non-admins via
  // their allowedClientIds). Reused from server/routes so the bulk
  // endpoint and the rest of the API agree on visibility.
  canAccessClient: (req: Request, clientId: string) => boolean;
}

// Resolve the destination version we'll insert blocks into. If a draft
// already exists, use it. Otherwise, if only a published version
// exists, create a fresh draft (versionNumber = max + 1). If the
// programme has no versions at all (edge case — versions are normally
// created at programme creation), create a v1 draft. Returns the
// version + a flag the caller can include in the response so the
// client knows to invalidate the version list.
async function ensureDraftVersion(
  deps: BulkBlocksDeps,
  programmeId: string,
): Promise<{ version: ProgrammeVersion; created: boolean }> {
  const versions = await deps.getProgrammeVersionsByProgramme(programmeId);
  const draft = versions.find((v) => v.status === "draft");
  if (draft) return { version: draft, created: false };
  const maxVersion = versions.reduce(
    (m, v) => Math.max(m, v.versionNumber ?? 0),
    0,
  );
  const created = await deps.createProgrammeVersion({
    programmeId,
    versionNumber: maxVersion + 1,
    status: "draft",
  });
  return { version: created, created: true };
}

// Sanitise a single candidate block against the destination's
// event/client. Returns either a ready-to-insert payload (with any
// inaccessible targets removed) or a per-row error code.
async function evaluateBlock(
  req: Request,
  input: ClipboardBlockInput,
  destProgramme: Programme,
  destEvent: Event,
  versionId: string,
  deps: BulkBlocksDeps,
  auth: BulkBlocksAuth,
): Promise<
  | {
      ok: true;
      payload: InsertScheduleBlock;
      droppedTargets: ScheduleTarget[];
    }
  | { ok: false; code: BulkBlockResultCode; error: string }
> {
  const destClientId = destEvent.clientId;
  const canAccess = (clientId: string) => auth.canAccessClient(req, clientId);

  // Layout: delegated to shared/blockPasteAccess so the dialog
  // preview and the server agree on what counts as forbidden.
  if (input.layoutTemplateId) {
    const layout = await deps.getLayoutTemplate(input.layoutTemplateId);
    const decision = evaluateLayoutAccess({
      layoutId: input.layoutTemplateId,
      layout: layout ?? null,
      destinationClientId: destClientId,
      canAccessClient: canAccess,
    });
    if (!decision.ok) {
      return { ok: false, code: decision.code, error: decision.message };
    }
  }

  // Playlists referenced by zoneSources: same shared predicate.
  const zoneSources = (input.zoneSources ?? []) as ZoneSource[];
  for (const zs of zoneSources) {
    if (zs.type === "playlist" && zs.playlistId) {
      const pl = await deps.getPlaylist(zs.playlistId);
      const decision = evaluatePlaylistAccess({
        playlistId: zs.playlistId,
        playlist: pl ?? null,
        destinationClientId: destClientId,
        canAccessClient: canAccess,
      });
      if (!decision.ok) {
        return { ok: false, code: decision.code, error: decision.message };
      }
    }
  }

  // Targets: drop any screen/group that doesn't survive the shared
  // target predicate. Empty targets means "all screens" and is a
  // perfectly valid block configuration, so the block is still created.
  const targets = (input.targets ?? []) as ScheduleTarget[];
  const keptTargets: ScheduleTarget[] = [];
  const droppedTargets: ScheduleTarget[] = [];
  for (const t of targets) {
    let entity: { id: string; clientId: string | null } | null = null;
    if (t.type === "screen") {
      const s = await deps.getScreen(t.id);
      entity = s ? { id: s.id, clientId: s.clientId ?? null } : null;
    } else if (t.type === "group") {
      const g = await deps.getScreenGroup(t.id);
      entity = g ? { id: g.id, clientId: g.clientId ?? null } : null;
    }
    const decision = evaluateTargetAccess({
      type: t.type,
      entity,
      destinationClientId: destClientId,
    });
    if (decision.ok) keptTargets.push(t);
    else droppedTargets.push(t);
  }

  const payload: InsertScheduleBlock = {
    programmeVersionId: versionId,
    name: input.name,
    priority: input.priority ?? 0,
    layoutTemplateId: input.layoutTemplateId ?? null,
    targets: keptTargets,
    timeRules: (input.timeRules ?? []) as TimeRule[],
    zoneSources,
    // Always a fresh series so deleting a series in the source
    // programme doesn't cascade into the pasted copy and vice versa.
    seriesId: deps.newSeriesId(),
  };

  return { ok: true, payload, droppedTargets };
}

export async function processBulkBlocks(
  req: Request,
  programmeId: string,
  body: unknown,
  deps: BulkBlocksDeps,
  auth: BulkBlocksAuth,
): Promise<{
  status: number;
  payload: unknown;
  // Surface the affected version id so the route handler can refresh
  // any live screens after the response is sent. Null when the
  // request errored out before we resolved a destination version.
  refreshVersionId?: string | null;
}> {
  const programme = await deps.getProgramme(programmeId);
  if (!programme) return { status: 404, payload: { error: "Programme not found" } };

  const event = await deps.getEvent(programme.eventId);
  if (!event) return { status: 404, payload: { error: "Programme has no event" } };
  if (!auth.canAccessClient(req, event.clientId)) {
    return { status: 403, payload: { error: "Access denied" } };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, payload: { error: parsed.error.errors } };
  }

  const { version, created: draftCreated } = await ensureDraftVersion(deps, programmeId);

  const results: BulkBlockResult[] = [];
  for (let i = 0; i < parsed.data.blocks.length; i++) {
    const item = parsed.data.blocks[i] as ClipboardBlockInput;
    try {
      const evalResult = await evaluateBlock(
        req,
        item,
        programme,
        event,
        version.id,
        deps,
        auth,
      );
      if (!evalResult.ok) {
        results.push({
          index: i,
          status: "error",
          code: evalResult.code,
          error: evalResult.error,
          input: item,
        });
        continue;
      }
      const block = await deps.createScheduleBlock(evalResult.payload);
      results.push({
        index: i,
        status: "created",
        block,
        droppedTargets: evalResult.droppedTargets,
        input: item,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create block";
      results.push({
        index: i,
        status: "error",
        code: "server_error",
        error: msg,
        input: item,
      });
    }
  }

  return {
    status: 200,
    payload: {
      destinationVersionId: version.id,
      draftCreated,
      results,
    },
    refreshVersionId: version.id,
  };
}

export function buildBulkBlocksHandler(
  deps: BulkBlocksDeps,
  auth: BulkBlocksAuth,
  options?: {
    onAudit?: (
      req: Request,
      results: BulkBlockResult[],
      ctx: { programmeId: string; sourceProgrammeId?: string; destinationVersionId: string },
    ) => void;
    onRefreshVersion?: (versionId: string) => void;
  },
) {
  return async (req: Request, res: Response) => {
    try {
      const programmeId = String((req.params as Record<string, string>).programmeId || "");
      const out = await processBulkBlocks(req, programmeId, req.body, deps, auth);
      if (out.status === 200) {
        const payload = out.payload as {
          destinationVersionId: string;
          results: BulkBlockResult[];
        };
        if (options?.onAudit) {
          const sourceProgrammeId = (req.body && typeof req.body === "object"
            ? (req.body as { sourceProgrammeId?: string }).sourceProgrammeId
            : undefined);
          options.onAudit(req, payload.results, {
            programmeId,
            sourceProgrammeId,
            destinationVersionId: payload.destinationVersionId,
          });
        }
        if (out.refreshVersionId && options?.onRefreshVersion) {
          options.onRefreshVersion(out.refreshVersionId);
        }
      }
      res.status(out.status).json(out.payload);
    } catch (error) {
      console.error("Error pasting bulk schedule blocks:", error);
      res.status(500).json({ error: "Failed to paste blocks" });
    }
  };
}

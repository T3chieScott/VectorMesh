import type { Request, Response } from "express";
import type { IStorage } from "./storage";
import { resolveScreenContent, type ResolverDeps } from "./contentResolver";
import { buildScreenPlaybackSummary } from "./screenPlaybackSummary";
import {
  derivePlaybackSchedule,
  derivePlaybackStatus,
} from "@shared/playback-derivation";
import type { LiveOverride, TimeRule } from "@shared/schema";
import {
  DEFAULT_SCHEDULE_TIMEZONE_FALLBACK,
} from "@shared/timezone-utils";
import { canAccessBooking } from "@shared/booking-utils";
import { getPathParam, getQueryString } from "./requestParams";

type PlaybackStorage = Pick<
  IStorage,
  "getScreen" | "getClient" | "getEvent" | "getScreenEventBookings"
>;

export interface ScreenPlaybackHandlerDeps {
  storage: PlaybackStorage;
  resolverDeps: ResolverDeps;
  getAllowedClientIds: (req: Request) => readonly string[] | null;
  canAccessClient: (req: Request, clientId: string) => boolean;
}

/**
 * GET /api/screens/:id/playback.
 *
 * This is kept as a small factory so the route's authorization and safe
 * projection can be tested without mounting the rest of the route tree.
 */
export function buildScreenPlaybackHandler(deps: ScreenPlaybackHandlerDeps) {
  return async (req: Request, res: Response) => {
    try {
      const screen = await deps.storage.getScreen(getPathParam(req, "id"));
      if (!screen) return res.status(404).json({ error: "Screen not found" });
      if (screen.clientId && !deps.canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const nowStr = getQueryString(req, "now", res);
      if (nowStr === null) return;
      const now = nowStr ? new Date(nowStr) : new Date();
      if (nowStr && Number.isNaN(now.getTime())) {
        return res.status(400).json({ error: "Invalid now timestamp" });
      }
      const allowed = deps.getAllowedClientIds(req);
      const screenClientId = screen.clientId ?? null;
      const tz = screenClientId
        ? (await deps.storage.getClient(screenClientId))?.timezone ||
          DEFAULT_SCHEDULE_TIMEZONE_FALLBACK
        : DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
      const scopedOverrides = async () => {
        const overrides = await deps.resolverDeps.getLiveOverrides();
        const visible: LiveOverride[] = [];
        for (const override of overrides) {
          if (!override.eventId) {
            visible.push(override);
            continue;
          }
          const event = await deps.storage.getEvent(override.eventId);
          if (
            event &&
            canAccessBooking(
              screenClientId,
              event.clientId ?? null,
              allowed,
            )
          ) {
            visible.push(override);
          }
        }
        return visible;
      };
      // Use the canonical resolver for this read-only summary as well as for
      // Player content. The scoped event lookup preserves tenant visibility
      // without a second per-screen content request.
      const scopedResolverDeps: ResolverDeps = {
        ...deps.resolverDeps,
        getLiveOverrides: scopedOverrides,
        getCurrentEventForScreen: async (screenId, asOf) => {
          const event = await deps.resolverDeps.getCurrentEventForScreen(
            screenId,
            asOf,
          );
          return event && canAccessBooking(
            screenClientId,
            event.clientId ?? null,
            allowed,
          )
            ? event
            : undefined;
        },
      };
      const resolved = await resolveScreenContent(screen, now, scopedResolverDeps, tz);
      const blocks = resolved.applicableBlocks.map(block => ({
        id: block.id,
        name: block.name,
        timeRules: (block.timeRules as TimeRule[] | null) || null,
        priority: block.priority ?? null,
      }));
      const status = derivePlaybackStatus(
        blocks,
        !!resolved.activeEvent,
        now,
        tz,
      );
      const outcomeStep = resolved.trace.find(step => step.kind === "outcome");
      const resolvedBlockId =
        outcomeStep?.kind === "outcome" && outcomeStep.source === "block"
          ? outcomeStep.blockId
          : null;
      const schedule = derivePlaybackSchedule(
        blocks,
        now,
        tz,
        resolvedBlockId,
      );

      const allForScreen = await deps.storage.getScreenEventBookings({
        screenId: screen.id,
      });
      const futureBookings = allForScreen
        .filter(b => new Date(b.startsAt) > now)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      let visibleNextBooking: typeof futureBookings[number] | undefined;
      let visibleNextEvent: Awaited<ReturnType<IStorage["getEvent"]>> | undefined;
      for (const b of futureBookings) {
        const ev = await deps.storage.getEvent(b.eventId);
        if (!ev) continue;
        if (!canAccessBooking(screenClientId, ev.clientId ?? null, allowed)) continue;
        visibleNextBooking = b;
        visibleNextEvent = ev;
        break;
      }

      return res.json({
        now: now.toISOString(),
        activeEvent: resolved.activeEvent
          ? { id: resolved.activeEvent.id, name: resolved.activeEvent.name }
          : null,
        block: status,
        nextBooking: visibleNextBooking && visibleNextEvent
          ? {
              eventId: visibleNextEvent.id,
              eventName: visibleNextEvent.name,
              startsAt: visibleNextBooking.startsAt,
            }
          : null,
        resolvedContent: buildScreenPlaybackSummary(resolved, schedule),
      });
    } catch (error) {
      console.error("Error deriving playback status:", error);
      return res.status(500).json({ error: "Failed to derive playback status" });
    }
  };
}
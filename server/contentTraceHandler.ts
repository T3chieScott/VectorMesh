import type { Request, Response } from "express";
import {
  resolveScreenContent,
  type ResolverDeps,
} from "./contentResolver";
import type { Screen } from "@shared/schema";

export interface TraceHandlerDeps extends ResolverDeps {
  getScreen(id: string): Promise<Screen | undefined>;
}

export interface AuthGate {
  isAdmin(req: Request): boolean;
  canAccessClient(req: Request, clientId: string): boolean;
}

/**
 * Builds the GET /api/admin/screens/:id/content-trace handler.
 *
 * Read-only by contract. Account managers are scoped to clients they can
 * access; admins bypass the scope check. Screens with no clientId are treated
 * as admin-only since there is no client to scope on.
 *
 * Extracted from routes.ts so the auth + scope behaviour can be tested in
 * isolation with stubbed deps.
 */
export function buildContentTraceHandler(
  deps: TraceHandlerDeps,
  auth: AuthGate,
) {
  return async (req: Request, res: Response) => {
    try {
      const screen = await deps.getScreen(req.params.id);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      if (!auth.isAdmin(req)) {
        if (!screen.clientId || !auth.canAccessClient(req, screen.clientId)) {
          return res
            .status(403)
            .json({ error: "Forbidden: screen is outside your client scope" });
        }
      }

      const now = new Date();
      const resolved = await resolveScreenContent(screen, now, deps);

      const outcomeStep = resolved.trace.find((s) => s.kind === "outcome");
      return res.json({
        screen: {
          id: screen.id,
          name: screen.name,
          clientId: screen.clientId,
          fallbackLayoutId: screen.fallbackLayoutId ?? null,
          fallbackPlaylistId: screen.fallbackPlaylistId ?? null,
        },
        serverNow: now.toISOString(),
        serverTz:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
        trace: resolved.trace,
        outcome: outcomeStep ?? null,
        layout: resolved.layout
          ? { id: resolved.layout.id, name: resolved.layout.name }
          : null,
        activeZoneSources: resolved.activeZoneSources,
        activeEvent: resolved.activeEvent
          ? { id: resolved.activeEvent.id, name: resolved.activeEvent.name }
          : null,
        liveOverride: resolved.liveOverride
          ? {
              id: resolved.liveOverride.id,
              name: resolved.liveOverride.name,
            }
          : null,
      });
    } catch (error) {
      console.error("Error building content trace:", error);
      return res.status(500).json({ error: "Failed to build content trace" });
    }
  };
}

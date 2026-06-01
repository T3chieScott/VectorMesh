import type { Request, Response } from "express";
import type { IStorage } from "./storage";
import { getPathParam } from "./requestParams";

// Task #182: the POST /api/screens/:id/regenerate-pairing handler is
// extracted into a factory so the screens-create-regenerate-flow test
// can drive the real production code path without standing up the
// full registerRoutes() side-effect tree.
//
// Behaviour mirrors the inline handler that previously lived in
// server/routes.ts (Task #180): regenerating from any wall tile
// rotates EVERY member onto its own fresh unique code in a single
// atomic transaction. The next pair attempt against any tile re-claims
// the wall via the canvas-pairing fan-out path.
type ScreenRegenerateStorage = Pick<
  IStorage,
  "getScreen" | "getCanvasMembers" | "rotateScreensPairingIdentities"
>;

type AuditFn = (
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  payload?: unknown,
) => void;

export function buildScreenRegeneratePairingHandler(
  storage: ScreenRegenerateStorage,
  audit?: AuditFn,
  canAccessClient?: (req: Request, clientId: string) => boolean,
) {
  return async function screenRegeneratePairingHandler(
    req: Request,
    res: Response,
  ) {
    try {
      const seed = await storage.getScreen(getPathParam(req, "id"));
      if (!seed) {
        return res.status(404).json({ error: "Screen not found" });
      }
      // Task #257: tenant authz — regenerating pairing on a screen
      // unpairs the whole wall, so reject callers that can't access the
      // screen's owning site.
      if (canAccessClient && seed.clientId && !canAccessClient(req, seed.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Task #180: pairing codes are unique per-screen (DB-level UNIQUE).
      // Regenerating from any wall tile rotates EVERY member onto its
      // own fresh unique code and clears the shared deviceToken so the
      // wall is fully unpaired. The next pair attempt against any tile
      // re-claims the wall via getCanvasMembers fan-out.
      // Round-7 review: rotate every member atomically in one
      // transaction so a mid-loop DB failure can't leave the wall in
      // a half-rotated state.
      const members = await storage.getCanvasMembers(seed);
      await storage.rotateScreensPairingIdentities(members.map((m) => m.id));
      const screen = await storage.getScreen(seed.id);
      audit?.(req, "regenerate_pairing", "screen", seed.id, {
        name: seed.name,
        canvasMembers: members.length,
      });
      res.json(screen);
    } catch (error) {
      console.error("Error regenerating pairing code:", error);
      res.status(500).json({ error: "Failed to regenerate pairing code" });
    }
  };
}

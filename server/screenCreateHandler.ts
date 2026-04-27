import type { Request, Response } from "express";
import { z } from "zod";
import { insertScreenSchema, type Screen } from "@shared/schema";
import type { IStorage } from "./storage";
import { pickCanvasPairingWinner } from "./storage";

// Task #182: the POST /api/screens handler is extracted into a factory
// so tests/screens-create-regenerate-flow.test.ts can drive the exact
// same code path the React `screens.tsx` createMutation hits, without
// having to spin up the full registerRoutes() side-effect tree.
//
// Behaviour mirrors the inline route handler that previously lived in
// server/routes.ts, including:
//   * Task #180: caller-supplied pairingCode is ignored — the storage
//     layer mints a unique server-side code via
//     generateUniquePairingCode and the DB UNIQUE constraint guards
//     against any other path.
//   * The legacy `currentEventId` field is silently dropped — bookings
//     live in screen_event_bookings now.
//   * Canvas wall validation: width/height required when canvasEnabled,
//     otherwise canvas fields are nulled.
//   * Canvas wall membership: when joining an already-paired wall with
//     the explicit `joinExistingWall: true` flag, the new tile inherits
//     ONLY runtime device state (not the pairingCode — every tile keeps
//     its own unique code).
type ScreenCreateStorage = Pick<
  IStorage,
  | "createScreen"
  | "getCanvasMembers"
  | "setCanvasPairingState"
  | "getScreen"
  | "getCanvasGroup"
>;

type AuditFn = (
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  payload?: unknown,
) => void;

type CanAccessClientFn = (req: Request, clientId: string) => boolean;

export function buildScreenCreateHandler(
  storage: ScreenCreateStorage,
  canAccessClient: CanAccessClientFn,
  audit?: AuditFn,
) {
  return async function screenCreateHandler(req: Request, res: Response) {
    try {
      const {
        currentEventId: _ignoredCurrentEventId,
        // Task #180: pairingCode is ALWAYS server-minted via
        // generateUniquePairingCode (called inside createScreen) so
        // the DB UNIQUE constraint on screens.pairing_code can never
        // be violated by a non-UI caller racing or sending a stale
        // code. Strip any caller-supplied value here; the legacy UI
        // already stopped sending it.
        pairingCode: _ignoredCallerPairingCode,
        ...incoming
      } = req.body as Record<string, unknown>;
      const body: Record<string, unknown> = {
        ...incoming,
        clientId: incoming.clientId || null,
        displayProfileId: incoming.displayProfileId || null,
      };
      if (body.canvasEnabled) {
        const w = body.canvasWidth as number | undefined;
        const h = body.canvasHeight as number | undefined;
        if (!w || w < 1 || !h || h < 1) {
          return res.status(400).json({
            error:
              "Canvas width and height are required when canvas positioning is enabled",
          });
        }
        body.canvasX = body.canvasX ?? 0;
        body.canvasY = body.canvasY ?? 0;
      } else {
        body.canvasEnabled = false;
        body.canvasWidth = null;
        body.canvasHeight = null;
        body.canvasX = 0;
        body.canvasY = 0;
      }
      const data = insertScreenSchema.parse(body);
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      // Task #189 — explicit canvas group validation. If the caller
      // pinned a `canvasGroupId`, that group must (a) exist, (b) belong
      // to the same client, and (c) match the requested canvas
      // dimensions. Without this guard the operator could "join" a
      // wall whose tiles are a different size, which would re-create
      // the very false-grouping bug Task #189 set out to remove.
      if (data.canvasGroupId) {
        const group = await storage.getCanvasGroup(data.canvasGroupId);
        if (!group) {
          return res.status(400).json({ error: "Canvas group not found" });
        }
        if (group.clientId !== data.clientId) {
          return res.status(400).json({
            error: "Canvas group belongs to a different site",
          });
        }
        if (
          group.canvasWidth !== data.canvasWidth ||
          group.canvasHeight !== data.canvasHeight
        ) {
          return res.status(400).json({
            error:
              "Canvas group dimensions do not match the screen's canvas size",
          });
        }
        if (!data.canvasEnabled) {
          return res.status(400).json({
            error: "Cannot assign a canvas group when canvas is disabled",
          });
        }
      }
      const screen = await storage.createScreen(data);
      // Task #180: a brand-new canvas-enabled tile NEVER silently
      // inherits another screen's pairingCode just because it happens
      // to share dims/client/position with an existing wall. The DB
      // UNIQUE constraint would reject it anyway, but we don't want to
      // get there — every tile keeps its own server-minted unique
      // pairingCode. Inheritance of runtime state (deviceToken /
      // isPaired / isOnline) is the original Task #173 affordance for
      // "the operator is adding a tile to a Pi-driven wall that's
      // already live", but it now requires BOTH (a) an explicit
      // `joinExistingWall: true` flag from the request body so the
      // operator opted in, AND (b) the existing wall to actually be
      // paired. Without both, the new tile starts blank; the operator
      // can pair the whole wall later via any tile's code.
      let finalScreen: Screen = screen;
      const joinExistingWall = (incoming as Record<string, unknown>).joinExistingWall === true;
      if (
        screen.canvasEnabled &&
        typeof screen.canvasWidth === "number" &&
        typeof screen.canvasHeight === "number"
      ) {
        const members = await storage.getCanvasMembers(screen);
        if (members.length > 1) {
          const existingSiblings = members.filter((m) => m.id !== screen.id);
          const winner = pickCanvasPairingWinner(existingSiblings);
          const wallIsPaired = !!winner.isPaired && !!winner.deviceToken;
          if (joinExistingWall && wallIsPaired) {
            // Inherit runtime state ONLY — pairingCode stays unique
            // (one per row, enforced by the DB UNIQUE constraint).
            await storage.setCanvasPairingState(
              [screen.id],
              {
                deviceToken: winner.deviceToken,
                isPaired: true,
                isOnline: !!winner.isOnline,
                lastSeen: winner.lastSeen,
                ipAddress: winner.ipAddress,
                hostname: winner.hostname,
                hardwareClass: winner.hardwareClass,
              },
            );
            const refreshed = await storage.getScreen(screen.id);
            if (refreshed) finalScreen = refreshed;
          }
        }
      }
      audit?.(req, "create", "screen", finalScreen.id, {
        name: finalScreen.name,
        clientId: finalScreen.clientId,
      });
      res.status(201).json(finalScreen);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating screen:", error);
      res.status(500).json({ error: "Failed to create screen" });
    }
  };
}

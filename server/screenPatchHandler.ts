import type { Request, Response } from "express";
import { z } from "zod";
import { insertScreenSchema } from "@shared/schema";
import type { IStorage } from "./storage";

/**
 * Normalises the body of a PATCH /api/screens/:id request.
 *
 * The screens PATCH endpoint accepts partial updates. Several reference
 * columns (`displayProfileId`, `clientId`, `fallbackLayoutId`,
 * `fallbackPlaylistId`) historically came from form inputs that submit
 * `""` to mean "clear", so we normalise empty strings to `null` for those
 * fields. The legacy `currentEventId` field has been replaced by
 * `screen_event_bookings`; the column was dropped from the schema.
 *
 * IMPORTANT: only normalise fields that are actually present in the
 * request body. Earlier versions of this handler unconditionally wrote
 * `body.displayProfileId = req.body.displayProfileId || null` even when
 * the key was absent, which silently clobbered the screen's saved
 * Display Profile / Current Event whenever the client sent any other
 * partial update (e.g. toggling Screenshots or Test Pattern). The
 * regression tests in `tests/screens-patch.test.ts` exist to keep that
 * bug from coming back.
 */
export function normalizeScreenPatchBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  const nullableRefFields = [
    "displayProfileId",
    "clientId",
    "fallbackLayoutId",
    "fallbackPlaylistId",
  ] as const;
  for (const key of nullableRefFields) {
    if (key in body) {
      out[key] = (body[key] as unknown) || null;
    }
  }
  return out;
}

// Task #180: the PATCH handler now also needs the canvas-membership
// helpers so it can reconcile pairing identities after a change that
// alters wall membership (e.g. a tile toggling canvasEnabled off, or
// moving its canvasX/Y so the wall dissolves). The reconciler in
// storage rotates the leaver's pairingCode + clears its deviceToken,
// and (when the wall dissolved entirely) does the same to surviving
// solo siblings so two former tiles never share a Pi token.
type ScreenPatchStorage = Pick<
  IStorage,
  | "getScreen"
  | "updateScreen"
  | "getCanvasMembers"
  | "reconcileWallPairingAfterChange"
  | "getCanvasGroup"
>;

type AuditFn = (
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  payload?: unknown,
) => void;

export function buildScreenPatchHandler(
  storage: ScreenPatchStorage,
  audit?: AuditFn,
) {
  return async function screenPatchHandler(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const existing = await storage.getScreen(id);
      if (!existing) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (existing.locked) {
        return res.status(403).json({
          error:
            "This screen is locked and cannot be modified. Unlock it first.",
        });
      }
      const body = normalizeScreenPatchBody(req.body);
      const canvasEnabled = body.canvasEnabled;
      if (canvasEnabled === true) {
        const w = body.canvasWidth;
        const h = body.canvasHeight;
        if (
          typeof w !== "number" ||
          w < 1 ||
          typeof h !== "number" ||
          h < 1
        ) {
          return res.status(400).json({
            error:
              "Canvas width and height are required when canvas positioning is enabled",
          });
        }
        body.canvasX = typeof body.canvasX === "number" ? body.canvasX : 0;
        body.canvasY = typeof body.canvasY === "number" ? body.canvasY : 0;
      } else if (canvasEnabled === false) {
        body.canvasWidth = null;
        body.canvasHeight = null;
        body.canvasX = 0;
        body.canvasY = 0;
      }
      const data = insertScreenSchema.partial().parse(body);
      // Task #189 — explicit canvas group validation, computed against
      // the EFFECTIVE post-patch state (existing row merged with the
      // patch payload). This catches three classes of regression:
      //   1. Patch sets `canvasGroupId` to a group that doesn't exist,
      //      belongs to a different site, or has wrong dims.
      //   2. Patch changes `clientId`, `canvasWidth`, `canvasHeight`,
      //      or `canvasEnabled` WITHOUT touching `canvasGroupId` —
      //      the existing group binding can become invalid even though
      //      the patch payload looks innocent. Validating effective
      //      state catches this too.
      //   3. Patch tries to detach (`canvasGroupId: null`) while
      //      canvas remains enabled — that would leave the screen in
      //      a state our invariants forbid (canvas-enabled rows must
      //      always carry a canvasGroupId). Reject.
      // When the patch disables canvas, we proactively NULL the group
      // binding so a stale FK can't survive the disable.
      const effectiveCanvasEnabled =
        data.canvasEnabled !== undefined
          ? data.canvasEnabled
          : existing.canvasEnabled;
      const effectiveClientId =
        data.clientId !== undefined ? data.clientId : existing.clientId;
      const effectiveWidth =
        data.canvasWidth !== undefined ? data.canvasWidth : existing.canvasWidth;
      const effectiveHeight =
        data.canvasHeight !== undefined
          ? data.canvasHeight
          : existing.canvasHeight;
      if (effectiveCanvasEnabled === false || effectiveCanvasEnabled === null) {
        // Canvas going (or staying) off — drop any group binding so
        // we never persist a canvas-disabled row pointing at a group.
        data.canvasGroupId = null;
      } else {
        const effectiveCanvasGroupId =
          data.canvasGroupId !== undefined
            ? data.canvasGroupId
            : existing.canvasGroupId;
        if (data.canvasGroupId === null) {
          return res.status(400).json({
            error:
              "Cannot detach canvas group while canvas is enabled — assign a different group or disable canvas first",
          });
        }
        if (effectiveCanvasGroupId) {
          const group = await storage.getCanvasGroup(effectiveCanvasGroupId);
          if (!group) {
            return res.status(400).json({ error: "Canvas group not found" });
          }
          if (group.clientId !== effectiveClientId) {
            return res.status(400).json({
              error: "Canvas group belongs to a different site",
            });
          }
          if (
            group.canvasWidth !== effectiveWidth ||
            group.canvasHeight !== effectiveHeight
          ) {
            return res.status(400).json({
              error:
                "Canvas group dimensions do not match the screen's canvas size",
            });
          }
        }
      }
      // Task #180: snapshot wall membership BEFORE the update so the
      // reconciler can detect "patched screen left its wall" or "wall
      // dissolved into solo survivors". Cheap when the screen isn't a
      // wall member (returns [self]).
      const beforeMembers = await storage.getCanvasMembers(existing);
      const screen = await storage.updateScreen(id, data);
      await storage.reconcileWallPairingAfterChange(id, beforeMembers);
      // Re-fetch so the response reflects any rotated pairingCode /
      // cleared deviceToken from the reconciler.
      const final = (await storage.getScreen(id)) ?? screen;
      audit?.(req, "update", "screen", final!.id, { name: final!.name });
      res.json(final);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen:", error);
      res.status(500).json({ error: "Failed to update screen" });
    }
  };
}

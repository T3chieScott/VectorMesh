import type { Request, Response } from "express";
import { z } from "zod";
import { insertScreenSchema } from "@shared/schema";
import type { IStorage } from "./storage";

/**
 * Normalises the body of a PATCH /api/screens/:id request.
 *
 * The screens PATCH endpoint accepts partial updates. Several reference
 * columns (`displayProfileId`, `currentEventId`, `clientId`,
 * `fallbackLayoutId`, `fallbackPlaylistId`) historically came from form
 * inputs that submit `""` to mean "clear", so we normalise empty strings
 * to `null` for those fields.
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
    "currentEventId",
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

type ScreenPatchStorage = Pick<IStorage, "getScreen" | "updateScreen">;

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
      const screen = await storage.updateScreen(id, data);
      audit?.(req, "update", "screen", screen!.id, { name: screen!.name });
      res.json(screen);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen:", error);
      res.status(500).json({ error: "Failed to update screen" });
    }
  };
}

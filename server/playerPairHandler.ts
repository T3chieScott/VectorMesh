import crypto from "crypto";
import type { Request, Response } from "express";
import type { IStorage } from "./storage";

// Task #303: the POST /api/player/pair handler is extracted into a
// factory (same pattern as server/screenRegeneratePairingHandler.ts)
// so tests can drive the real production pairing path — including the
// kiosk-mode re-pair gate — without standing up registerRoutes().
//
// Behaviour:
//  - Unknown code → 404.
//  - Screen (or any wall member) already paired AND the matched
//    screen's kioskModeEnabled is OFF → 409. A pairing code is
//    single-claim by default so a leaked code can't hijack a live
//    display; the operator must unpair / regenerate first.
//  - kioskModeEnabled ON → re-pair is allowed any time: a fresh
//    deviceToken is minted and fanned out to every wall member,
//    which invalidates whatever token the previous device held.
//    This is what lets a Windows kiosk that wiped its browser
//    storage on reboot re-claim its screen from a /player?code=X
//    URL without operator involvement. Each kiosk re-pair writes an
//    audit_logs row so support can trace token turnover.
type PlayerPairStorage = Pick<
  IStorage,
  "getScreenByPairingCode" | "getCanvasMembers" | "setCanvasPairingState" | "createAuditLog"
>;

export function buildPlayerPairHandler(storage: PlayerPairStorage) {
  return async function playerPairHandler(req: Request, res: Response) {
    try {
      const { pairingCode, hardwareInfo } = req.body;
      const screen = await storage.getScreenByPairingCode(pairingCode);

      if (!screen) {
        return res.status(404).json({ error: "Invalid pairing code" });
      }

      // Implicit-canvas pairing (Task #173): one Pi drives the whole
      // wall, so a single pairing code claims every member tile under
      // one shared deviceToken.
      const members = await storage.getCanvasMembers(screen);

      // Task #303 — single-claim gate. Pairing state is shared across
      // the wall, so "already paired" means any member holds a live
      // token. Kiosk mode on the matched screen legitimises re-claim.
      const alreadyPaired = members.some((m) => m.isPaired && m.deviceToken);
      if (alreadyPaired && !screen.kioskModeEnabled) {
        return res.status(409).json({
          error:
            "This screen is already paired to a device. Unpair it or regenerate its code first, or enable Reusable pairing code (kiosk mode) on the screen.",
        });
      }

      const deviceToken = crypto.randomBytes(32).toString("hex");

      const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        null;
      const reverseDns = await (async () => {
        try {
          const dns = await import("dns");
          if (clientIp) {
            const hostnames = await dns.promises.reverse(clientIp);
            return hostnames[0] || null;
          }
        } catch {}
        return null;
      })();

      const owner = members[0];
      await storage.setCanvasPairingState(
        members.map((m) => m.id),
        {
          isPaired: true,
          isOnline: true,
          lastSeen: new Date(),
          hardwareClass: hardwareInfo?.class || "raspberry_pi",
          hostname: hardwareInfo?.hostname || reverseDns || null,
          ipAddress: clientIp,
          deviceToken,
        },
      );

      // Task #303 — forensic trail for kiosk re-pairs: the old device's
      // token just died, which is invisible unless we record it.
      if (alreadyPaired && screen.kioskModeEnabled) {
        try {
          await storage.createAuditLog({
            action: "kiosk_repair",
            entityType: "screen",
            entityId: screen.id,
            payload: {
              name: screen.name,
              canvasMembers: members.length,
              ipAddress: clientIp,
              hostname: hardwareInfo?.hostname || reverseDns || null,
            },
          });
        } catch (err) {
          console.error("Failed to record kiosk re-pair audit:", err);
        }
      }

      const isCanvasGroup = members.length > 1;
      res.json({
        screenId: owner.id,
        name: owner.name,
        deviceToken,
        // First time-sync sample so the freshly-paired player's
        // first-render clock already reflects server time.
        serverTime: Date.now(),
        canvas: isCanvasGroup
          ? {
              ownerScreenId: owner.id,
              width: owner.canvasWidth,
              height: owner.canvasHeight,
              tiles: members.map((m) => ({ id: m.id, name: m.name })),
            }
          : null,
      });
    } catch (error) {
      console.error("Error pairing screen:", error);
      res.status(500).json({ error: "Failed to pair screen" });
    }
  };
}

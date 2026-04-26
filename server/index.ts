import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initStorage } from "./fileStorage";
import { convertBadges } from "../scripts/convert-badges";
import { ensureBookingMigration } from "./db";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await initStorage();
  await convertBadges();
  await ensureBookingMigration();
  // Implicit-canvas pairing (Task #173): pre-#173 walls may carry
  // mismatched per-tile pairing rows (different deviceTokens, codes,
  // or staleness). One-shot reconciliation at boot picks the most-
  // recently-seen paired tile per group and forces every member to
  // share its state, so the first /api/player/pair or heartbeat from
  // a video wall sees a coherent picture. Idempotent.
  try {
    const normalised = await storage.backfillCanvasPairingState();
    if (normalised > 0) {
      log(
        `[canvas-pairing] backfill normalised ${normalised} canvas group(s)`,
      );
    }
  } catch (err) {
    console.error("[canvas-pairing] backfill failed:", err);
  }
  // Task #176 / Task #179 — undo inheritance damage from earlier boots
  // that grouped unrelated canvas-enabled screens sharing dims but
  // sitting at the same (canvasX, canvasY). Resets each falsely-paired
  // tile so the operator can re-pair it independently.
  //
  // The Task #176 repair was originally invoked unconditionally on
  // every boot, but it has no positive signal that the damage has
  // already been cleared, so a legitimately-paired solo canvas screen
  // (a Pi driving one canvas-authored display, paired in good faith
  // after the #176 fix landed) would be silently re-reset on every
  // restart with a fresh pairing code. Task #179 wraps the repair in a
  // `system_settings` marker so it runs at most once per database;
  // subsequent boots short-circuit and never touch a paired tile.
  try {
    const result = await storage.repairFalseCanvasPairingsOnce();
    if (result.skipped) {
      log(
        `[canvas-pairing] one-shot repair already completed for this DB; skipping`,
      );
    } else if (result.repaired > 0) {
      log(
        `[canvas-pairing] repaired ${result.repaired} falsely-paired canvas tile(s)`,
      );
    } else {
      log(`[canvas-pairing] one-shot repair ran with nothing to fix`);
    }
  } catch (err) {
    console.error("[canvas-pairing] repair failed:", err);
  }
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

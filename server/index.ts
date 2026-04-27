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
  // Pairing-code dedupe (Task #180): pre-#180 walls fanned the same
  // pairingCode to every tile in a wall, so an upgrading deployment
  // may carry duplicate pairing_code rows. The new schema-level
  // UNIQUE constraint on screens.pairing_code would either reject
  // those rows on the next write or refuse to apply at all, so we
  // proactively reissue every duplicate's code (keeping the earliest
  // tile's code intact) before any other pairing-related boot step
  // runs. Idempotent — no-op on a clean DB.
  try {
    const reissued = await storage.dedupePairingCodes();
    if (reissued > 0) {
      log(
        `[canvas-pairing] dedupe reissued ${reissued} duplicate pairing code(s)`,
      );
    }
  } catch (err) {
    // Task #180: dedupe also installs the screens_pairing_code_unique
    // DB constraint as part of its self-heal. If that fails we are
    // running without DB-level enforcement of per-screen pairing-code
    // uniqueness — the exact invariant Task #180 is meant to guarantee.
    // In production, refuse to start: better a noisy boot failure that
    // surfaces in deploy logs than a silently degraded fleet that lets
    // duplicates accumulate. In development, log loudly and continue
    // so the dev loop isn't blocked by transient DB hiccups.
    console.error("[canvas-pairing] dedupe failed:", err);
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[canvas-pairing] aborting boot — pairing-code uniqueness cannot be guaranteed without dedupe success",
      );
      process.exit(1);
    }
  }
  // Task #189 — promote the legacy implicit (clientId + dims +
  // distinct positions) grouping into explicit `canvas_groups` rows
  // and stamp each canvas-enabled screen's `canvasGroupId`. Must run
  // BEFORE the pairing-state backfill below so the pairing reconciler
  // sees the new explicit groups. One-shot via system_settings marker.
  try {
    const result = await storage.backfillExplicitCanvasGroupsOnce();
    if (result.skipped) {
      log(
        `[canvas-groups] explicit-grouping backfill already completed for this DB; skipping`,
      );
    } else {
      log(
        `[canvas-groups] explicit-grouping backfill: created ${result.groupsCreated} group(s), stamped ${result.screensStamped} screen(s)`,
      );
    }
  } catch (err) {
    console.error("[canvas-groups] explicit-grouping backfill failed:", err);
  }
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

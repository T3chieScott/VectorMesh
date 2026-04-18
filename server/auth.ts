import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import crypto from "crypto";
import { storage } from "./storage";

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const isProd = process.env.NODE_ENV === "production";
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: sessionTtl,
      },
    })
  );
}

export function hashApiToken(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

const TOKEN_TOUCH_DEBOUNCE_MS = 60_000;
const lastTouchedAt = new Map<string, number>();

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const plain = authHeader.slice(7).trim();
    if (plain.startsWith("vm_")) {
      try {
        const tokenRecord = await storage.getApiTokenByHash(hashApiToken(plain));
        if (!tokenRecord || tokenRecord.revokedAt) {
          return res.status(401).json({ message: "Invalid or revoked token" });
        }
        const user = await storage.getUser(tokenRecord.userId);
        if (!user || !user.isActive) {
          return res.status(401).json({ message: "Account inactive" });
        }
        const now = Date.now();
        const last = lastTouchedAt.get(tokenRecord.id) || 0;
        if (now - last > TOKEN_TOUCH_DEBOUNCE_MS) {
          lastTouchedAt.set(tokenRecord.id, now);
          storage.touchApiTokenLastUsed(tokenRecord.id).catch(() => {});
        }
        (req as any).dbUser = user;
        (req as any).apiToken = tokenRecord;
        return next();
      } catch (err) {
        console.error("Bearer token auth error:", err);
        return res.status(401).json({ message: "Unauthorized" });
      }
    }
  }

  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Account deactivated" });
  }

  (req as any).dbUser = user;
  next();
};

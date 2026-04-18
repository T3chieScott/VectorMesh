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

async function loadFromSession(req: any, res: any): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  const user = await storage.getUser(userId);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  if (!user.isActive) {
    req.session.destroy(() => {});
    res.status(401).json({ message: "Account deactivated" });
    return false;
  }
  req.dbUser = user;
  return true;
}

async function loadFromBearerToken(req: any, res: any, plain: string): Promise<boolean> {
  try {
    const tokenRecord = await storage.getApiTokenByHash(hashApiToken(plain));
    if (!tokenRecord || tokenRecord.revokedAt) {
      res.status(401).json({ message: "Invalid or revoked token" });
      return false;
    }
    const user = await storage.getUser(tokenRecord.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ message: "Account inactive" });
      return false;
    }
    const now = Date.now();
    const last = lastTouchedAt.get(tokenRecord.id) || 0;
    if (now - last > TOKEN_TOUCH_DEBOUNCE_MS) {
      lastTouchedAt.set(tokenRecord.id, now);
      storage.touchApiTokenLastUsed(tokenRecord.id).catch(() => {});
    }
    req.dbUser = user;
    req.apiToken = tokenRecord;
    return true;
  } catch (err) {
    console.error("Bearer token auth error:", err);
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
}

// Session-only authentication. Bearer tokens are explicitly rejected so that
// cookie-only flows (settings page, password change, token self-management,
// admin write surface, etc.) cannot be exercised with a leaked API token.
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const ok = await loadFromSession(req, res);
  if (ok) next();
};

// Allows either a session cookie OR an `Authorization: Bearer vm_...` token.
// Use only for the explicitly-allowlisted Companion-friendly endpoints.
export const isAuthenticatedOrToken: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const plain = authHeader.slice(7).trim();
    if (plain.startsWith("vm_")) {
      const ok = await loadFromBearerToken(req as any, res, plain);
      if (ok) next();
      return;
    }
    return res.status(401).json({ message: "Unauthorized" });
  }
  const ok = await loadFromSession(req as any, res);
  if (ok) next();
};

import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
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

export const isAuthenticated: RequestHandler = async (req, res, next) => {
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

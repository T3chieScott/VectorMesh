import type { Express, Request, Response } from "express";
import type { IStorage } from "./storage";

export function isTestAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_TEST_AUTH_BYPASS === "1"
  );
}

export function mountTestAuthRoute(app: Express, storage: IStorage): boolean {
  if (!isTestAuthBypassEnabled()) {
    return false;
  }

  console.warn(
    "[test-auth] POST /api/auth/test-login is mounted. " +
      "This endpoint bypasses password and 2FA and must NEVER run in production."
  );

  app.post("/api/auth/test-login", async (req: Request, res: Response) => {
    if (!isTestAuthBypassEnabled()) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
      if (!email) {
        return res.status(400).json({ error: "email required" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "user not found" });
      }
      if (!user.isActive) {
        return res.status(401).json({ error: "Account deactivated" });
      }
      req.session.regenerate((err: any) => {
        if (err) {
          console.error("[test-auth] session regeneration error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        (req.session as any).userId = user.id;
        req.session.save((err2: any) => {
          if (err2) {
            console.error("[test-auth] session save error:", err2);
            return res.status(500).json({ error: "Login failed" });
          }
          storage
            .createAuditLog({
              userId: user.id,
              action: "test_login",
              entityType: "auth",
              entityId: user.id,
              payload: { email: user.email, note: "ENABLE_TEST_AUTH_BYPASS bypass" },
            })
            .catch(() => {});
          res.json({ id: user.id, email: user.email, role: user.role });
        });
      });
    } catch (err) {
      console.error("[test-auth] login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  return true;
}

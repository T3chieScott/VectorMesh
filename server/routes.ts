import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { insertClientSchema, insertEventSchema, insertScreenSchema, insertDisplayProfileSchema, insertScreenGroupSchema, insertMediaAssetSchema, insertLayoutTemplateSchema, insertProgrammeSchema, insertPlaylistSchema, insertPlaylistItemSchema, insertScheduleBlockSchema, insertLiveOverrideSchema, insertPlayerHeartbeatSchema, insertBrandPackSchema } from "@shared/schema";
import { generateVideoThumbnail } from "./thumbnail";
import { setupAuth, isAuthenticated } from "./auth";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import * as fileStorage from "./fileStorage";
import { find as findTimezone } from "geo-tz";
import { sendWelcomeEmail, sendPasswordResetEmail, sendAdminPasswordResetEmail, sendPasswordChangedEmail, sendScreenOfflineAlert, sendScreenOnlineAlert, sendTestAlert } from "./email";
import { createPremierLeagueTableHandler } from "./premierLeague";
import { createPremierLeagueFixturesHandler } from "./premierLeagueFixtures";
import { createHeathrowArrivalsHandler, createHeathrowDeparturesHandler } from "./heathrowFlights";
import { createWeatherForecastHandler } from "./weatherForecast";
import { createNextSpaceXLaunchHandler } from "./spacexLaunch";
import { createEarthquakesHandler } from "./usgsEarthquakes";
import { createAircraftOverheadHandler } from "./openSkyAircraft";

function generateTwoFactorSecret(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: "VectorMesh",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return { secret: secret.base32, uri: totp.toString() };
}

function verifyTwoFactorCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: "VectorMesh",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

function stripSensitiveFields(user: any) {
  const { passwordHash, twoFactorSecret, ...safeUser } = user;
  return safeUser;
}

const requireAuth = isAuthenticated;

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).dbUser;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

async function requireAdminOrAccountManager(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).dbUser;
  if (!user || (user.role !== "admin" && user.role !== "account_manager")) {
    return res.status(403).json({ error: "Admin or Account Manager access required" });
  }
  next();
}

async function loadUserContext(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).dbUser;
  if (!user) return res.status(401).json({ error: "User not found" });
  if (user.role === "admin") {
    (req as any).allowedClientIds = null;
  } else {
    (req as any).allowedClientIds = await storage.getUserClientIds(user.id);
  }
  next();
}

function isAdmin(req: Request): boolean {
  return (req as any).dbUser?.role === "admin";
}

function isAccountManager(req: Request): boolean {
  return (req as any).dbUser?.role === "account_manager";
}

function getAllowedClientIds(req: Request): string[] | null {
  return (req as any).allowedClientIds;
}

function canAccessClient(req: Request, clientId: string): boolean {
  if (isAdmin(req)) return true;
  const allowed = getAllowedClientIds(req);
  return allowed ? allowed.includes(clientId) : false;
}

async function validateDeviceToken(req: Request, res: Response, next: NextFunction) {
  const token = (req.headers["x-device-token"] as string) || (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: "Device token required" });
  }

  const screenId = req.params.screenId;
  if (screenId) {
    const screen = await storage.getScreen(screenId);
    if (!screen || screen.deviceToken !== token) {
      return res.status(403).json({ error: "Invalid device token" });
    }
    (req as any).pairedScreen = screen;
  } else {
    const screen = await storage.getScreenByDeviceToken(token);
    if (!screen) {
      return res.status(403).json({ error: "Invalid device token" });
    }
    (req as any).pairedScreen = screen;
  }
  next();
}

function logAudit(req: Request, action: string, entityType: string, entityId?: string, payload?: any) {
  const userId = (req as any).dbUser?.id || (req.session as any)?.userId;
  if (!userId) return;
  storage.createAuditLog({ userId, action, entityType, entityId: entityId || null, payload: payload || null }).catch(err => {
    console.error("Audit log error:", err);
  });
}

const pendingPlayerRefreshes = new Map<string, number>();
const REFRESH_SIGNAL_TTL = 60_000;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      if (!user.isActive) {
        return res.status(401).json({ error: "Account deactivated" });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (user.twoFactorEnabled) {
        req.session.regenerate((err) => {
          if (err) {
            console.error("Session regeneration error:", err);
            return res.status(500).json({ error: "Login failed" });
          }
          (req.session as any).pendingTwoFactorUserId = user.id;
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              return res.status(500).json({ error: "Login failed" });
            }
            res.json({ requiresTwoFactor: true });
          });
        });
        return;
      }

      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        (req.session as any).userId = user.id;
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({ error: "Login failed" });
          }
          storage.createAuditLog({ userId: user.id, action: "login", entityType: "auth", entityId: user.id, payload: { email: user.email } }).catch(() => {});
          res.json(stripSensitiveFields(user));
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = (req.session as any)?.userId;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      if (userId) {
        storage.createAuditLog({ userId, action: "logout", entityType: "auth", entityId: userId, payload: null }).catch(() => {});
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/user", requireAuth, async (req, res) => {
    const user = (req as any).dbUser;
    res.json(stripSensitiveFields(user));
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }
      const user = (req as any).dbUser;
      if (user.passwordHash && currentPassword) {
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.setUserPassword(user.id, hash);
      await storage.updateUser(user.id, { mustChangePassword: false });
      logAudit(req, "change_password", "auth", user.id);
      if (user.email) {
        await sendPasswordChangedEmail(user.email, user.firstName || "User");
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email required" });
      }
      res.json({ ok: true, message: "If an account exists with that email, a reset link has been sent." });
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (user && user.isActive && user.email) {
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await storage.createPasswordResetToken(user.id, token, expiresAt);
        await sendPasswordResetEmail(user.email, user.firstName || "User", token);
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      res.json({ ok: true, message: "If an account exists with that email, a reset link has been sent." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: "Token and new password (min 8 chars) required" });
      }
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }
      if (resetToken.usedAt) {
        return res.status(400).json({ error: "This reset link has already been used" });
      }
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "This reset link has expired" });
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.setUserPassword(resetToken.userId, hash);
      await storage.updateUser(resetToken.userId, { mustChangePassword: false });
      await storage.markPasswordResetTokenUsed(resetToken.id);
      storage.createAuditLog({ userId: resetToken.userId, action: "reset_password", entityType: "auth", entityId: resetToken.userId, payload: null }).catch(() => {});
      const user = await storage.getUser(resetToken.userId);
      if (user?.email) {
        await sendPasswordChangedEmail(user.email, user.firstName || "User");
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.get("/api/auth/setup-status", async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const hasUsersWithPasswords = allUsers.some(u => u.passwordHash);
    res.json({ needsSetup: !hasUsersWithPasswords, userCount: allUsers.length });
  });

  app.post("/api/auth/2fa/setup", requireAuth, async (req, res) => {
    try {
      const user = (req as any).dbUser;
      if (user.twoFactorEnabled) {
        return res.status(400).json({ error: "2FA is already enabled" });
      }
      const { secret, uri } = generateTwoFactorSecret(user.email || user.id);
      (req.session as any).pendingTwoFactorSecret = secret;
      req.session.save(async (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to start 2FA setup" });
        }
        const qrCode = await QRCode.toDataURL(uri);
        res.json({ qrCode, secret, uri });
      });
    } catch (error) {
      console.error("2FA setup error:", error);
      res.status(500).json({ error: "Failed to set up 2FA" });
    }
  });

  app.post("/api/auth/2fa/confirm-setup", requireAuth, async (req, res) => {
    try {
      const user = (req as any).dbUser;
      const { code } = req.body;
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "A 6-digit code is required" });
      }
      const pendingSecret = (req.session as any).pendingTwoFactorSecret;
      if (!pendingSecret) {
        return res.status(400).json({ error: "No pending 2FA setup. Please start setup again." });
      }
      if (!verifyTwoFactorCode(pendingSecret, code)) {
        return res.status(400).json({ error: "Invalid code. Please try again." });
      }
      await storage.updateUser(user.id, {
        twoFactorSecret: pendingSecret,
        twoFactorEnabled: true,
      });
      delete (req.session as any).pendingTwoFactorSecret;
      req.session.save(() => {});
      logAudit(req, "enable_2fa", "auth", user.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("2FA confirm error:", error);
      res.status(500).json({ error: "Failed to confirm 2FA setup" });
    }
  });

  app.post("/api/auth/2fa/validate", async (req, res) => {
    try {
      const { code } = req.body;
      const pendingUserId = (req.session as any)?.pendingTwoFactorUserId;
      if (!pendingUserId) {
        return res.status(401).json({ error: "No pending 2FA verification" });
      }
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "A 6-digit code is required" });
      }
      const user = await storage.getUser(pendingUserId);
      if (!user || !user.twoFactorSecret) {
        return res.status(401).json({ error: "Invalid session" });
      }
      if (!verifyTwoFactorCode(user.twoFactorSecret, code)) {
        return res.status(400).json({ error: "Invalid code. Please try again." });
      }
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      delete (req.session as any).pendingTwoFactorUserId;
      (req.session as any).userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        storage.createAuditLog({ userId: user.id, action: "login", entityType: "auth", entityId: user.id, payload: { email: user.email, twoFactor: true } }).catch(() => {});
        res.json(stripSensitiveFields(user));
      });
    } catch (error) {
      console.error("2FA validate error:", error);
      res.status(500).json({ error: "2FA validation failed" });
    }
  });

  app.post("/api/auth/setup", async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const hasUsersWithPasswords = allUsers.some(u => u.passwordHash);
      if (hasUsersWithPasswords) {
        return res.status(400).json({ error: "Setup already completed" });
      }
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password || password.length < 8) {
        return res.status(400).json({ error: "Email and password (min 8 chars) required" });
      }
      const hash = await bcrypt.hash(password, 12);
      const existingUser = await storage.getUserByEmail(email.toLowerCase().trim());
      let userId: string;
      if (existingUser) {
        await storage.setUserPassword(existingUser.id, hash);
        await storage.updateUser(existingUser.id, { role: "admin", mustChangePassword: false });
        userId = existingUser.id;
      } else {
        const user = await storage.createUser({
          email: email.toLowerCase().trim(),
          firstName: firstName || "Admin",
          lastName: lastName || "",
          role: "admin",
          passwordHash: hash,
          mustChangePassword: false,
          isActive: true,
        });
        userId = user.id;
      }
      (req.session as any).userId = userId;
      const updatedUser = await storage.getUser(userId);
      const { secret, uri } = generateTwoFactorSecret(email.toLowerCase().trim());
      (req.session as any).pendingTwoFactorSecret = secret;
      req.session.save(async (err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Setup failed" });
        }
        const qrCode = await QRCode.toDataURL(uri);
        res.json({
          ...stripSensitiveFields(updatedUser),
          twoFactorSetup: { qrCode, secret, uri },
        });
      });
    } catch (error) {
      console.error("Setup error:", error);
      res.status(500).json({ error: "Setup failed" });
    }
  });

  const uploadTmpDir = path.join(os.tmpdir(), "vectormesh-uploads");
  await fs.promises.mkdir(uploadTmpDir, { recursive: true });
  const upload = multer({ storage: multer.diskStorage({ destination: uploadTmpDir }), limits: { fileSize: 500 * 1024 * 1024 } });

  const STALE_THRESHOLD_MS = 60000;
  setInterval(async () => {
    try {
      const offlineScreens = await storage.markStaleScreensOffline(STALE_THRESHOLD_MS);
      if (offlineScreens.length > 0) {
        const enabledAlertSettings = await storage.getAlertSettingsForType("screen_offline");
        if (enabledAlertSettings.length > 0) {
          const allEvents = await storage.getEvents();
          const eventClientMap = new Map(allEvents.map(e => [e.id, e.clientId]));

          for (const screen of offlineScreens) {
            const screenClientId = screen.currentEventId ? eventClientMap.get(screen.currentEventId) : null;
            if (!screenClientId) continue;

            const alertSetting = enabledAlertSettings.find(s => s.clientId === screenClientId);
            if (!alertSetting || alertSetting.recipients.length === 0) continue;

            const recentAlerts = await storage.getRecentAlertHistory("screen_offline", screen.id, alertSetting.cooldownMinutes);
            if (recentAlerts.length === 0) {
              try {
                const sent = await sendScreenOfflineAlert(alertSetting.recipients, screen.name, screen.location, screen.lastSeen ? new Date(screen.lastSeen) : null);
                if (sent) {
                  storage.createAlertHistoryEntry({
                    alertType: "screen_offline",
                    entityId: screen.id,
                    recipients: alertSetting.recipients,
                    payload: { screenName: screen.name, location: screen.location },
                  }).catch(() => {});
                }
              } catch (emailErr) {
                console.error("Failed to send screen offline alert:", emailErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error in offline sweep:", err);
    }
  }, 30000);

  // ============ HEALTH CHECK ============
  app.get("/api/health", async (req, res) => {
    try {
      const [screens, overrides] = await Promise.all([
        storage.getScreens(),
        storage.getLiveOverrides(),
      ]);
      
      const onlineScreens = screens.filter(s => s.isOnline).length;
      const activeOverrides = overrides.filter(o => o.isActive && new Date(o.endTime) > new Date()).length;
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        screensOnline: onlineScreens,
        totalScreens: screens.length,
        activeOverrides,
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "unhealthy", error: "Database connection failed" });
    }
  });

  // ============ CLIENTS ============
  app.get("/api/clients", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allClients = await storage.getClients();
      const allowed = getAllowedClientIds(req);
      const filtered = allowed ? allClients.filter(c => allowed.includes(c.id)) : allClients;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/clients/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      if (!canAccessClient(req, client.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  app.post("/api/clients", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: "Admin access required to create sites" });
      }
      const data = insertClientSchema.parse(req.body);
      const client = await storage.createClient(data);
      logAudit(req, "create", "client", client.id, { name: client.name });
      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!canAccessClient(req, req.params.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const existing = await storage.getClient(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Client not found" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This site is locked and cannot be modified. Unlock it first." });
      }
      const data = insertClientSchema.partial().parse(req.body);
      const client = await storage.updateClient(req.params.id, data);
      logAudit(req, "update", "client", client!.id, { name: client!.name });
      res.json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.post("/api/clients/:id/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locked } = req.body;
      const client = await storage.updateClient(req.params.id, { locked: !!locked });
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      logAudit(req, locked ? "lock" : "unlock", "client", client.id, { name: client.name });
      res.json(client);
    } catch (error) {
      console.error("Error toggling client lock:", error);
      res.status(500).json({ error: "Failed to toggle lock" });
    }
  });

  app.delete("/api/clients/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: "Admin access required to delete sites" });
      }
      const clientToDelete = await storage.getClient(req.params.id);
      if (!clientToDelete) {
        return res.status(404).json({ error: "Client not found" });
      }
      if (clientToDelete.locked) {
        return res.status(403).json({ error: "This site is locked and cannot be deleted. Unlock it first." });
      }
      const deleted = await storage.deleteClient(req.params.id);
      logAudit(req, "delete", "client", req.params.id, { name: clientToDelete?.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  // ============ EVENTS ============
  app.get("/api/events", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allEvents = await storage.getEvents();
      const allowed = getAllowedClientIds(req);
      let filtered = allowed ? allEvents.filter(e => allowed.includes(e.clientId)) : allEvents;
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(e => e.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/events/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!canAccessClient(req, event.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(event);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.post("/api/events", requireAuth, loadUserContext, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const data = insertEventSchema.parse(body);
      if (!canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const event = await storage.createEvent(data);
      logAudit(req, "create", "event", event.id, { name: event.name });
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getEvent(req.params.id);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (!canAccessClient(req, existing.clientId)) return res.status(403).json({ error: "Access denied" });
      const body = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const data = insertEventSchema.partial().parse(body);
      const event = await storage.updateEvent(req.params.id, data);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      logAudit(req, "update", "event", event.id, { name: event.name });
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getEvent(req.params.id);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (!canAccessClient(req, existing.clientId)) return res.status(403).json({ error: "Access denied" });
      const deleted = await storage.deleteEvent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Event not found" });
      }
      logAudit(req, "delete", "event", req.params.id, { name: existing.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // ============ DISPLAY PROFILES ============
  app.get("/api/display-profiles", requireAuth, loadUserContext, async (req, res) => {
    try {
      const profiles = await storage.getDisplayProfiles();
      const allowed = getAllowedClientIds(req);
      let filtered = profiles;
      if (allowed) {
        filtered = profiles.filter(p => !p.clientId || allowed.includes(p.clientId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(p => p.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching display profiles:", error);
      res.status(500).json({ error: "Failed to fetch display profiles" });
    }
  });

  app.post("/api/display-profiles", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertDisplayProfileSchema.parse({ ...req.body, clientId: req.body.clientId || null });
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const profile = await storage.createDisplayProfile(data);
      logAudit(req, "create", "display_profile", profile.id, { name: profile.name, clientId: profile.clientId });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating display profile:", error);
      res.status(500).json({ error: "Failed to create display profile" });
    }
  });

  app.patch("/api/display-profiles/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getDisplayProfile(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this profile's site" });
      }
      const data = insertDisplayProfileSchema.partial().parse(req.body);
      if (data.clientId && data.clientId !== existing.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      const profile = await storage.updateDisplayProfile(req.params.id, data);
      logAudit(req, "update", "display_profile", profile!.id, { name: profile!.name });
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating display profile:", error);
      res.status(500).json({ error: "Failed to update display profile" });
    }
  });

  app.delete("/api/display-profiles/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getDisplayProfile(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this profile's site" });
      }
      await storage.deleteDisplayProfile(req.params.id);
      logAudit(req, "delete", "display_profile", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting display profile:", error);
      res.status(500).json({ error: "Failed to delete display profile" });
    }
  });

  // ============ SCREEN GROUPS ============
  app.get("/api/screen-groups", requireAuth, loadUserContext, async (req, res) => {
    try {
      const groups = await storage.getScreenGroupsWithMemberCounts();
      const allowed = getAllowedClientIds(req);
      let filtered = groups;
      if (allowed) {
        filtered = groups.filter(g => !g.clientId || allowed.includes(g.clientId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(g => g.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching screen groups:", error);
      res.status(500).json({ error: "Failed to fetch screen groups" });
    }
  });

  app.post("/api/screen-groups", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertScreenGroupSchema.parse({ ...req.body, clientId: req.body.clientId || null });
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const group = await storage.createScreenGroup(data);
      logAudit(req, "create", "screen_group", group.id, { name: group.name, clientId: group.clientId });
      res.status(201).json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating screen group:", error);
      res.status(500).json({ error: "Failed to create screen group" });
    }
  });

  app.patch("/api/screen-groups/:id", requireAuth, async (req, res) => {
    try {
      const data = insertScreenGroupSchema.partial().parse(req.body);
      const group = await storage.updateScreenGroup(req.params.id, data);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      logAudit(req, "update", "screen_group", group.id, { name: group.name });
      res.json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen group:", error);
      res.status(500).json({ error: "Failed to update screen group" });
    }
  });

  app.delete("/api/screen-groups/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteScreenGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      logAudit(req, "delete", "screen_group", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen group:", error);
      res.status(500).json({ error: "Failed to delete screen group" });
    }
  });

  // Screen Group Memberships
  app.get("/api/screen-groups/:id/members", requireAuth, loadUserContext, async (req, res) => {
    try {
      const group = await storage.getScreenGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const members = await storage.getGroupMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ error: "Failed to fetch group members" });
    }
  });

  app.post("/api/screen-groups/:id/members", requireAuth, loadUserContext, async (req, res) => {
    try {
      const { screenId } = req.body;
      if (!screenId) {
        return res.status(400).json({ error: "screenId is required" });
      }
      const group = await storage.getScreenGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const screen = await storage.getScreen(screenId);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (group.clientId && screen.clientId && group.clientId !== screen.clientId) {
        return res.status(400).json({ error: "Screen must belong to the same site as the group" });
      }
      await storage.addScreenToGroup(req.params.id, screenId);
      logAudit(req, "create", "screen_group_membership", req.params.id, { screenId, screenName: screen.name, groupName: group.name });
      res.status(201).json({ success: true });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Screen is already in this group" });
      }
      console.error("Error adding screen to group:", error);
      res.status(500).json({ error: "Failed to add screen to group" });
    }
  });

  app.delete("/api/screen-groups/:id/members/:screenId", requireAuth, loadUserContext, async (req, res) => {
    try {
      const group = await storage.getScreenGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const removed = await storage.removeScreenFromGroup(req.params.id, req.params.screenId);
      if (!removed) {
        return res.status(404).json({ error: "Membership not found" });
      }
      logAudit(req, "delete", "screen_group_membership", req.params.id, { screenId: req.params.screenId });
      res.status(204).send();
    } catch (error) {
      console.error("Error removing screen from group:", error);
      res.status(500).json({ error: "Failed to remove screen from group" });
    }
  });

  // ============ SCREENS ============
  app.get("/api/screens", requireAuth, loadUserContext, async (req, res) => {
    try {
      await storage.markStaleScreensOffline(STALE_THRESHOLD_MS);
      const screens = await storage.getScreens();
      const allowed = getAllowedClientIds(req);
      let filtered = screens;
      if (allowed) {
        filtered = screens.filter(s => !s.clientId || allowed.includes(s.clientId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(s => s.clientId === clientId);
      }
      res.json(filtered.map(({ deviceToken, ...s }) => s));
    } catch (error) {
      console.error("Error fetching screens:", error);
      res.status(500).json({ error: "Failed to fetch screens" });
    }
  });

  app.get("/api/screens/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.id);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { deviceToken, ...safeScreen } = screen;
      res.json(safeScreen);
    } catch (error) {
      console.error("Error fetching screen:", error);
      res.status(500).json({ error: "Failed to fetch screen" });
    }
  });

  app.post("/api/screens", requireAuth, loadUserContext, async (req, res) => {
    try {
      const body = {
        ...req.body,
        clientId: req.body.clientId || null,
        displayProfileId: req.body.displayProfileId || null,
        currentEventId: req.body.currentEventId || null,
      };
      if (body.canvasEnabled) {
        if (!body.canvasWidth || body.canvasWidth < 1 || !body.canvasHeight || body.canvasHeight < 1) {
          return res.status(400).json({ error: "Canvas width and height are required when canvas positioning is enabled" });
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
      const screen = await storage.createScreen(data);
      logAudit(req, "create", "screen", screen.id, { name: screen.name, clientId: screen.clientId });
      res.status(201).json(screen);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating screen:", error);
      res.status(500).json({ error: "Failed to create screen" });
    }
  });

  app.patch("/api/screens/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreen(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This screen is locked and cannot be modified. Unlock it first." });
      }
      const body = {
        ...req.body,
        displayProfileId: req.body.displayProfileId || null,
        currentEventId: req.body.currentEventId || null,
      };
      if (body.canvasEnabled) {
        if (!body.canvasWidth || body.canvasWidth < 1 || !body.canvasHeight || body.canvasHeight < 1) {
          return res.status(400).json({ error: "Canvas width and height are required when canvas positioning is enabled" });
        }
        body.canvasX = body.canvasX ?? 0;
        body.canvasY = body.canvasY ?? 0;
      } else if (body.canvasEnabled === false) {
        body.canvasWidth = null;
        body.canvasHeight = null;
        body.canvasX = 0;
        body.canvasY = 0;
      }
      const data = insertScreenSchema.partial().parse(body);
      const screen = await storage.updateScreen(req.params.id, data);
      logAudit(req, "update", "screen", screen!.id, { name: screen!.name });
      res.json(screen);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating screen:", error);
      res.status(500).json({ error: "Failed to update screen" });
    }
  });

  app.post("/api/screens/:id/regenerate-pairing", requireAuth, async (req, res) => {
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const screen = await storage.updateScreen(req.params.id, { pairingCode: newCode, isPaired: false });
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      logAudit(req, "regenerate_pairing", "screen", screen.id, { name: screen.name });
      res.json(screen);
    } catch (error) {
      console.error("Error regenerating pairing code:", error);
      res.status(500).json({ error: "Failed to regenerate pairing code" });
    }
  });

  app.post("/api/screens/:id/refresh", requireAuth, async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.id);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      pendingPlayerRefreshes.set(screen.id, Date.now());
      logAudit(req, "refresh", "screen", screen.id, { name: screen.name });
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending refresh signal:", error);
      res.status(500).json({ error: "Failed to send refresh signal" });
    }
  });

  app.post("/api/screens/:id/unpair", requireAuth, async (req, res) => {
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const screen = await storage.unpairScreen(req.params.id, newCode);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      logAudit(req, "unpair", "screen", screen.id, { name: screen.name });
      const { deviceToken, ...safeScreen } = screen;
      res.json(safeScreen);
    } catch (error) {
      console.error("Error unpairing screen:", error);
      res.status(500).json({ error: "Failed to unpair screen" });
    }
  });

  app.post("/api/screens/:id/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locked } = req.body;
      const screen = await storage.updateScreen(req.params.id, { locked: !!locked });
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      logAudit(req, locked ? "lock" : "unlock", "screen", screen.id, { name: screen.name });
      res.json(screen);
    } catch (error) {
      console.error("Error toggling screen lock:", error);
      res.status(500).json({ error: "Failed to toggle lock" });
    }
  });

  app.delete("/api/screens/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getScreen(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This screen is locked and cannot be deleted. Unlock it first." });
      }
      await storage.deleteScreen(req.params.id);
      logAudit(req, "delete", "screen", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen:", error);
      res.status(500).json({ error: "Failed to delete screen" });
    }
  });

  app.get("/api/screens/:id/heartbeats", requireAuth, async (req, res) => {
    try {
      const heartbeats = await storage.getPlayerHeartbeats(req.params.id);
      res.json(heartbeats);
    } catch (error) {
      console.error("Error fetching heartbeats:", error);
      res.status(500).json({ error: "Failed to fetch heartbeats" });
    }
  });

  // ============ MEDIA ASSETS ============
  app.get("/api/media", requireAuth, loadUserContext, async (req, res) => {
    try {
      const assets = await storage.getMediaAssets();
      const allowed = getAllowedClientIds(req);
      const clientId = req.query.clientId as string | undefined;

      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const sharedToSite = await storage.getMediaSharesForClient(clientId);
        const sharedAssetIds = new Set(sharedToSite.map(s => s.mediaAssetId));
        const filtered = assets.filter(a => a.clientId === clientId || sharedAssetIds.has(a.id));
        return res.json(filtered);
      }

      let filtered = assets;
      if (allowed) {
        const allowedSet = new Set(allowed);
        const allSharedAssetIds = new Set<string>();
        for (const cid of allowed) {
          const shares = await storage.getMediaSharesForClient(cid);
          shares.forEach(s => allSharedAssetIds.add(s.mediaAssetId));
        }
        filtered = assets.filter(a =>
          (a.clientId && allowedSet.has(a.clientId)) || allSharedAssetIds.has(a.id)
        );
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching media assets:", error);
      res.status(500).json({ error: "Failed to fetch media assets" });
    }
  });

  app.post("/api/media", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertMediaAssetSchema.parse(req.body);
      if (!data.clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }
      if (!canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && event.clientId !== data.clientId) {
          return res.status(400).json({ error: "Event does not belong to the specified site" });
        }
      }
      const asset = await storage.createMediaAsset(data);
      logAudit(req, "create", "media", asset.id, { name: asset.name, clientId: data.clientId });
      res.status(201).json(asset);

      if (data.mediaType === "video" && data.originalPath) {
        try {
          const thumbnailPath = await generateVideoThumbnail(data.originalPath, data.clientId);
          if (thumbnailPath) {
            await storage.updateMediaAsset(asset.id, { thumbnailPath });
          }
        } catch (thumbErr) {
          console.error("Background thumbnail generation failed:", thumbErr);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating media asset:", error);
      res.status(500).json({ error: "Failed to create media asset" });
    }
  });

  app.delete("/api/media/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (asset.clientId && !canAccessClient(req, asset.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteMediaAsset(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      logAudit(req, "delete", "media", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting media asset:", error);
      res.status(500).json({ error: "Failed to delete media asset" });
    }
  });

  // Media sharing (admin only)
  app.get("/api/media/:id/shares", requireAuth, requireAdmin, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      const shares = await storage.getMediaSharesForAsset(req.params.id);
      res.json(shares);
    } catch (error) {
      console.error("Error fetching media shares:", error);
      res.status(500).json({ error: "Failed to fetch media shares" });
    }
  });

  app.post("/api/media/:id/share", requireAuth, requireAdmin, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }
      const targetClient = await storage.getClient(clientId);
      if (!targetClient) {
        return res.status(404).json({ error: "Target site not found" });
      }
      if (asset.clientId === clientId) {
        return res.status(400).json({ error: "Cannot share media to its owning site" });
      }
      const existingShares = await storage.getMediaSharesForAsset(req.params.id);
      if (existingShares.some(s => s.clientId === clientId)) {
        return res.status(400).json({ error: "Media is already shared to this site" });
      }
      const share = await storage.createMediaShare({ mediaAssetId: req.params.id, clientId });
      logAudit(req, "create", "media_share", share.id, { mediaAssetId: req.params.id, clientId });
      res.status(201).json(share);
    } catch (error) {
      console.error("Error sharing media:", error);
      res.status(500).json({ error: "Failed to share media" });
    }
  });

  app.delete("/api/media/:id/share/:clientId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteMediaShare(req.params.id, req.params.clientId);
      if (!deleted) {
        return res.status(404).json({ error: "Share not found" });
      }
      logAudit(req, "delete", "media_share", req.params.id, { clientId: req.params.clientId });
      res.status(204).send();
    } catch (error) {
      console.error("Error unsharing media:", error);
      res.status(500).json({ error: "Failed to unshare media" });
    }
  });

  app.patch("/api/media/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMediaAsset(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      logAudit(req, "update", "media", updated.id, { name: updated.name });
      res.json(updated);
    } catch (error) {
      console.error("Error updating media asset:", error);
      res.status(500).json({ error: "Failed to update media asset" });
    }
  });

  // Serve media files from object storage
  app.get("/api/media/:id/file", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }

      if (asset.originalPath.startsWith("http")) {
        res.redirect(asset.originalPath);
      } else {
        await fileStorage.streamFile(asset.originalPath, res, req);
      }
    } catch (error) {
      console.error("Error serving media file:", error);
      res.status(500).json({ error: "Failed to serve media file" });
    }
  });

  app.get("/api/media/:id/thumbnail", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset || !asset.thumbnailPath) {
        return res.status(404).json({ error: "Thumbnail not found" });
      }

      if (asset.thumbnailPath.startsWith("http")) {
        res.redirect(asset.thumbnailPath);
      } else {
        await fileStorage.streamFile(asset.thumbnailPath, res, req);
      }
    } catch (error) {
      console.error("Error serving thumbnail:", error);
      res.status(500).json({ error: "Failed to serve thumbnail" });
    }
  });

  app.post("/api/media/:id/generate-thumbnail", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (asset.mediaType !== "video") {
        return res.status(400).json({ error: "Thumbnails can only be generated for video assets" });
      }

      const thumbnailPath = await generateVideoThumbnail(asset.originalPath, asset.clientId);
      if (!thumbnailPath) {
        return res.status(500).json({ error: "Failed to generate thumbnail" });
      }

      await storage.updateMediaAsset(asset.id, { thumbnailPath });
      res.json({ thumbnailPath });
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      res.status(500).json({ error: "Failed to generate thumbnail" });
    }
  });

  // ============ FILE UPLOAD ============
  app.post("/api/uploads", requireAuth, loadUserContext, upload.single("file"), async (req, res) => {
    const tempPath = req.file?.path;
    const cleanupTemp = async () => {
      if (tempPath) {
        try { await fs.promises.unlink(tempPath); } catch {}
      }
    };
    try {
      if (!req.file || !tempPath) {
        console.log("[upload] No file received in request");
        return res.status(400).json({ error: "No file provided" });
      }
      console.log(`[upload] Received file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) -> ${tempPath}`);

      const clientId = req.body.clientId;
      if (!clientId) {
        await cleanupTemp();
        return res.status(400).json({ error: "clientId is required" });
      }
      if (!canAccessClient(req, clientId)) {
        await cleanupTemp();
        return res.status(403).json({ error: "Access denied to this client" });
      }

      const client = await storage.getClient(clientId);
      if (client) {
        const maxSizeMb = client.maxUploadSizeMb ?? 100;
        const maxSizeBytes = maxSizeMb * 1024 * 1024;
        if (req.file.size > maxSizeBytes) {
          console.log(`[upload] File ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) exceeds ${maxSizeMb}MB limit`);
          await cleanupTemp();
          return res.status(413).json({ error: `File size exceeds the ${maxSizeMb}MB limit for this site` });
        }
      }

      const filePath = await fileStorage.saveFileFromDisk(
        tempPath,
        req.file.originalname,
        req.file.mimetype,
        clientId,
      );

      console.log(`[upload] File saved: ${req.file.originalname} -> ${filePath}`);
      res.json({
        filePath,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
    } catch (error) {
      await cleanupTemp();
      console.error("[upload] Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // ============ LAYOUT TEMPLATES ============
  app.get("/api/layouts", requireAuth, loadUserContext, async (req, res) => {
    try {
      const layouts = await storage.getLayoutTemplates();
      const allowed = getAllowedClientIds(req);
      let filtered = layouts;
      if (allowed) {
        filtered = layouts.filter(l => !l.clientId || allowed.includes(l.clientId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(l => !l.clientId || l.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching layouts:", error);
      res.status(500).json({ error: "Failed to fetch layouts" });
    }
  });

  app.post("/api/layouts", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertLayoutTemplateSchema.parse(req.body);
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (event && !data.clientId) {
          data.clientId = event.clientId;
        }
      }
      if (data.clientId && !canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to target site" });
      }
      if (data.eventId && data.clientId) {
        const event = await storage.getEvent(data.eventId);
        if (event && event.clientId !== data.clientId) {
          return res.status(400).json({ error: "Event does not belong to the specified site" });
        }
      }
      const layout = await storage.createLayoutTemplate(data);
      logAudit(req, "create", "layout", layout.id, { name: layout.name });
      res.status(201).json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating layout:", error);
      res.status(500).json({ error: "Failed to create layout" });
    }
  });

  app.patch("/api/layouts/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getLayoutTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Layout not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This layout is locked and cannot be modified. Unlock it first." });
      }
      const data = insertLayoutTemplateSchema.partial().parse(req.body);
      const layout = await storage.updateLayoutTemplate(req.params.id, data);
      logAudit(req, "update", "layout", layout!.id, { name: layout!.name });
      res.json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating layout:", error);
      res.status(500).json({ error: "Failed to update layout" });
    }
  });

  app.post("/api/layouts/:id/copy-to-site", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { targetClientId } = req.body;
      if (!targetClientId) {
        return res.status(400).json({ error: "targetClientId is required" });
      }
      const targetClient = await storage.getClient(targetClientId);
      if (!targetClient) {
        return res.status(400).json({ error: "Target site not found" });
      }
      const source = await storage.getLayoutTemplate(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Layout not found" });
      }
      const copy = await storage.createLayoutTemplate({
        clientId: targetClientId,
        eventId: null,
        name: source.name,
        version: source.version,
        aspectRatio: source.aspectRatio,
        customWidth: source.customWidth,
        customHeight: source.customHeight,
        zones: source.zones,
        profileOverrides: source.profileOverrides,
      });
      logAudit(req, "copy", "layout", copy.id, { sourceId: source.id, targetClientId, name: copy.name });
      res.status(201).json(copy);
    } catch (error) {
      console.error("Error copying layout:", error);
      res.status(500).json({ error: "Failed to copy layout" });
    }
  });

  app.post("/api/layouts/:id/move-to-site", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { targetClientId } = req.body;
      if (!targetClientId) {
        return res.status(400).json({ error: "targetClientId is required" });
      }
      const targetClient = await storage.getClient(targetClientId);
      if (!targetClient) {
        return res.status(400).json({ error: "Target site not found" });
      }
      const source = await storage.getLayoutTemplate(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Layout not found" });
      }
      let clearEvent = false;
      if (source.eventId) {
        const event = await storage.getEvent(source.eventId);
        if (event && event.clientId !== targetClientId) {
          clearEvent = true;
        }
      }
      const updated = await storage.updateLayoutTemplate(req.params.id, {
        clientId: targetClientId,
        ...(clearEvent ? { eventId: null } : {}),
      });
      logAudit(req, "move", "layout", req.params.id, { targetClientId, name: source.name });
      res.json(updated);
    } catch (error) {
      console.error("Error moving layout:", error);
      res.status(500).json({ error: "Failed to move layout" });
    }
  });

  app.post("/api/layouts/:id/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locked } = req.body;
      const layout = await storage.updateLayoutTemplate(req.params.id, { locked: !!locked });
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      logAudit(req, locked ? "lock" : "unlock", "layout", layout.id, { name: layout.name });
      res.json(layout);
    } catch (error) {
      console.error("Error toggling layout lock:", error);
      res.status(500).json({ error: "Failed to toggle lock" });
    }
  });

  app.delete("/api/layouts/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getLayoutTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Layout not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This layout is locked and cannot be deleted. Unlock it first." });
      }
      await storage.deleteLayoutTemplate(req.params.id);
      logAudit(req, "delete", "layout", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting layout:", error);
      res.status(500).json({ error: "Failed to delete layout" });
    }
  });

  // ============ PROGRAMMES ============
  app.get("/api/programmes", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmes = await storage.getProgrammes();
      const allowed = getAllowedClientIds(req);
      const allEventsForProgrammes = await storage.getEvents();
      let filtered = programmes;
      if (allowed) {
        const allowedEventIds = new Set(allEventsForProgrammes.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        filtered = programmes.filter(p => allowedEventIds.has(p.eventId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEventIds = new Set(allEventsForProgrammes.filter(e => e.clientId === clientId).map(e => e.id));
        filtered = filtered.filter(p => clientEventIds.has(p.eventId));
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching programmes:", error);
      res.status(500).json({ error: "Failed to fetch programmes" });
    }
  });

  app.post("/api/programmes", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertProgrammeSchema.parse(req.body);
      const event = await storage.getEvent(data.eventId);
      if (event && !canAccessClient(req, event.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const programme = await storage.createProgramme(data);
      await storage.createProgrammeVersion({ programmeId: programme.id, versionNumber: 1, status: "draft" });
      logAudit(req, "create", "programme", programme.id, { name: programme.name });
      res.status(201).json(programme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating programme:", error);
      res.status(500).json({ error: "Failed to create programme" });
    }
  });

  app.patch("/api/programmes/:id", requireAuth, async (req, res) => {
    try {
      const data = insertProgrammeSchema.partial().parse(req.body);
      const programme = await storage.updateProgramme(req.params.id, data);
      if (!programme) {
        return res.status(404).json({ error: "Programme not found" });
      }
      logAudit(req, "update", "programme", programme.id, { name: programme.name });
      res.json(programme);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating programme:", error);
      res.status(500).json({ error: "Failed to update programme" });
    }
  });

  app.post("/api/programmes/:id/publish", requireAuth, async (req, res) => {
    try {
      const versions = await storage.getProgrammeVersions();
      const programmeVersions = versions.filter(v => v.programmeId === req.params.id);
      const draftVersion = programmeVersions.find(v => v.status === "draft");
      
      if (draftVersion) {
        await storage.updateProgrammeVersion(draftVersion.id, { status: "published", publishedAt: new Date() });
      }
      logAudit(req, "publish", "programme", req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error publishing programme:", error);
      res.status(500).json({ error: "Failed to publish programme" });
    }
  });

  app.delete("/api/programmes/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteProgramme(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Programme not found" });
      }
      logAudit(req, "delete", "programme", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting programme:", error);
      res.status(500).json({ error: "Failed to delete programme" });
    }
  });

  // ============ PROGRAMME VERSIONS ============
  app.get("/api/programme-versions", requireAuth, async (req, res) => {
    try {
      const versions = await storage.getProgrammeVersions();
      res.json(versions);
    } catch (error) {
      console.error("Error fetching programme versions:", error);
      res.status(500).json({ error: "Failed to fetch programme versions" });
    }
  });

  // ============ PLAYLISTS ============
  app.get("/api/playlists", requireAuth, loadUserContext, async (req, res) => {
    try {
      const playlists = await storage.getPlaylists();
      const allowed = getAllowedClientIds(req);
      const allEventsForPlaylists = await storage.getEvents();
      let filtered = playlists;
      if (allowed) {
        const allowedEventIds = new Set(allEventsForPlaylists.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        filtered = playlists.filter(p => !p.eventId || allowedEventIds.has(p.eventId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEventIds = new Set(allEventsForPlaylists.filter(e => e.clientId === clientId).map(e => e.id));
        filtered = filtered.filter(p => !p.eventId || clientEventIds.has(p.eventId));
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  app.post("/api/playlists", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertPlaylistSchema.parse(req.body);
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const playlist = await storage.createPlaylist(data);
      logAudit(req, "create", "playlist", playlist.id, { name: playlist.name });
      res.status(201).json(playlist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating playlist:", error);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  app.patch("/api/playlists/:id", requireAuth, async (req, res) => {
    try {
      const data = insertPlaylistSchema.partial().parse(req.body);
      const playlist = await storage.updatePlaylist(req.params.id, data);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      logAudit(req, "update", "playlist", playlist.id, { name: playlist.name });
      res.json(playlist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating playlist:", error);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });

  app.delete("/api/playlists/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deletePlaylist(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      logAudit(req, "delete", "playlist", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  app.get("/api/playlists/usage", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allowed = getAllowedClientIds(req);
      const allVersions = await storage.getProgrammeVersions();
      let filteredVersions = allVersions;
      if (allowed) {
        const programmes = await storage.getProgrammes();
        const events = await storage.getEvents();
        const allowedEventIds = new Set(events.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        const allowedProgrammeIds = new Set(programmes.filter(p => allowedEventIds.has(p.eventId)).map(p => p.id));
        filteredVersions = allVersions.filter(v => allowedProgrammeIds.has(v.programmeId));
      }
      const allBlocksNested = await Promise.all(
        filteredVersions.map(v => storage.getScheduleBlocks(v.id))
      );
      const allBlocks = allBlocksNested.flat();
      const layoutCache = new Map<string, string>();
      const usage: Record<string, Array<{ blockId: string; blockName: string; layoutName?: string }>> = {};
      for (const block of allBlocks) {
        const zoneSources = (block.zoneSources as any[]) || [];
        for (const zs of zoneSources) {
          if (zs.playlistId) {
            if (!usage[zs.playlistId]) usage[zs.playlistId] = [];
            const already = usage[zs.playlistId].some(u => u.blockId === block.id);
            if (!already) {
              let layoutName: string | undefined;
              if (block.layoutTemplateId) {
                if (layoutCache.has(block.layoutTemplateId)) {
                  layoutName = layoutCache.get(block.layoutTemplateId);
                } else {
                  const layout = await storage.getLayoutTemplate(block.layoutTemplateId);
                  layoutName = layout?.name;
                  if (layoutName) layoutCache.set(block.layoutTemplateId, layoutName);
                }
              }
              usage[zs.playlistId].push({ blockId: block.id, blockName: block.name, layoutName });
            }
          }
        }
      }
      res.json(usage);
    } catch (error) {
      console.error("Error fetching playlist usage:", error);
      res.status(500).json({ error: "Failed to fetch playlist usage" });
    }
  });

  // ============ PLAYLIST ITEMS ============
  app.get("/api/playlists/:playlistId/items", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!(await canAccessPlaylist(req, req.params.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const items = await storage.getPlaylistItems(req.params.playlistId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      res.status(500).json({ error: "Failed to fetch playlist items" });
    }
  });

  async function canAccessPlaylist(req: Request, playlistId: string): Promise<boolean> {
    if (isAdmin(req)) return true;
    const allowed = getAllowedClientIds(req);
    if (!allowed) return false;
    const playlist = await storage.getPlaylist(playlistId);
    if (!playlist) return false;
    if (!playlist.eventId) return true;
    const event = await storage.getEvent(playlist.eventId);
    return event ? allowed.includes(event.clientId) : false;
  }

  app.post("/api/playlists/:playlistId/items", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!(await canAccessPlaylist(req, req.params.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = insertPlaylistItemSchema.parse({
        ...req.body,
        playlistId: req.params.playlistId,
      });
      const item = await storage.createPlaylistItem(data);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating playlist item:", error);
      res.status(500).json({ error: "Failed to create playlist item" });
    }
  });

  app.patch("/api/playlist-items/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getPlaylistItem(req.params.id);
      if (!existing) return res.status(404).json({ error: "Playlist item not found" });
      if (!(await canAccessPlaylist(req, existing.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = insertPlaylistItemSchema.partial().parse(req.body);
      const item = await storage.updatePlaylistItem(req.params.id, data);
      res.json(item);
    } catch (error) {
      console.error("Error updating playlist item:", error);
      res.status(500).json({ error: "Failed to update playlist item" });
    }
  });

  app.post("/api/playlists/:playlistId/reorder", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!(await canAccessPlaylist(req, req.params.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: "itemIds must be an array" });
      }
      const existingItems = await storage.getPlaylistItems(req.params.playlistId);
      const existingIds = new Set(existingItems.map(i => i.id));
      for (const id of itemIds) {
        if (!existingIds.has(id)) {
          return res.status(400).json({ error: "Item does not belong to this playlist" });
        }
      }
      for (let i = 0; i < itemIds.length; i++) {
        await storage.updatePlaylistItem(itemIds[i], { order: i });
      }
      const items = await storage.getPlaylistItems(req.params.playlistId);
      res.json(items);
    } catch (error) {
      console.error("Error reordering playlist items:", error);
      res.status(500).json({ error: "Failed to reorder playlist items" });
    }
  });

  app.delete("/api/playlist-items/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getPlaylistItem(req.params.id);
      if (!existing) return res.status(404).json({ error: "Playlist item not found" });
      if (!(await canAccessPlaylist(req, existing.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deletePlaylistItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Playlist item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting playlist item:", error);
      res.status(500).json({ error: "Failed to delete playlist item" });
    }
  });

  // ============ SCHEDULE BLOCKS ============
  app.get("/api/programme-versions/:versionId/blocks", requireAuth, async (req, res) => {
    try {
      const blocks = await storage.getScheduleBlocks(req.params.versionId);
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching schedule blocks:", error);
      res.status(500).json({ error: "Failed to fetch schedule blocks" });
    }
  });

  app.post("/api/programme-versions/:versionId/blocks", requireAuth, async (req, res) => {
    try {
      const data = insertScheduleBlockSchema.parse({
        ...req.body,
        programmeVersionId: req.params.versionId,
      });
      const block = await storage.createScheduleBlock(data);
      res.status(201).json(block);
    } catch (error) {
      console.error("Error creating schedule block:", error);
      res.status(500).json({ error: "Failed to create schedule block" });
    }
  });

  app.patch("/api/schedule-blocks/:id", requireAuth, async (req, res) => {
    try {
      const data = insertScheduleBlockSchema.partial().parse(req.body);
      const block = await storage.updateScheduleBlock(req.params.id, data);
      if (!block) {
        return res.status(404).json({ error: "Schedule block not found" });
      }
      res.json(block);
    } catch (error) {
      console.error("Error updating schedule block:", error);
      res.status(500).json({ error: "Failed to update schedule block" });
    }
  });

  app.delete("/api/schedule-blocks/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteScheduleBlock(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Schedule block not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule block:", error);
      res.status(500).json({ error: "Failed to delete schedule block" });
    }
  });

  // ============ LIVE OVERRIDES ============
  app.get("/api/live-overrides", requireAuth, loadUserContext, async (req, res) => {
    try {
      const overrides = await storage.getLiveOverrides();
      const allowed = getAllowedClientIds(req);
      const allEventsForOverrides = await storage.getEvents();
      let filtered = overrides;
      if (allowed) {
        const allowedEventIds = new Set(allEventsForOverrides.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        filtered = overrides.filter(o => !o.eventId || allowedEventIds.has(o.eventId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEventIds = new Set(allEventsForOverrides.filter(e => e.clientId === clientId).map(e => e.id));
        filtered = filtered.filter(o => !o.eventId || clientEventIds.has(o.eventId));
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching live overrides:", error);
      res.status(500).json({ error: "Failed to fetch live overrides" });
    }
  });

  app.post("/api/live-overrides", requireAuth, loadUserContext, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      };
      const data = insertLiveOverrideSchema.parse(body);
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const override = await storage.createLiveOverride(data);
      logAudit(req, "create", "live_override", override.id, { name: override.name });
      res.status(201).json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating live override:", error);
      res.status(500).json({ error: "Failed to create live override" });
    }
  });

  app.patch("/api/live-overrides/:id", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        ...(req.body.startTime && { startTime: new Date(req.body.startTime) }),
        ...(req.body.endTime && { endTime: new Date(req.body.endTime) }),
      };
      const data = insertLiveOverrideSchema.partial().parse(body);
      const override = await storage.updateLiveOverride(req.params.id, data);
      if (!override) {
        return res.status(404).json({ error: "Live override not found" });
      }
      logAudit(req, "update", "live_override", override.id, { name: override.name });
      res.json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating live override:", error);
      res.status(500).json({ error: "Failed to update live override" });
    }
  });

  app.delete("/api/live-overrides/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteLiveOverride(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Live override not found" });
      }
      logAudit(req, "delete", "live_override", req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting live override:", error);
      res.status(500).json({ error: "Failed to delete live override" });
    }
  });

  // ============ PLAYER API (for Raspberry Pi nodes) ============

  app.get("/api/player/media/:id/file", validateDeviceToken, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }

      if (asset.originalPath.startsWith("http")) {
        res.redirect(asset.originalPath);
      } else {
        await fileStorage.streamFile(asset.originalPath, res, req);
      }
    } catch (error) {
      console.error("Error serving player media file:", error);
      res.status(500).json({ error: "Failed to serve media file" });
    }
  });

  app.post("/api/player/pair", async (req, res) => {
    try {
      const { pairingCode, hardwareInfo } = req.body;
      const screen = await storage.getScreenByPairingCode(pairingCode);
      
      if (!screen) {
        return res.status(404).json({ error: "Invalid pairing code" });
      }

      const deviceToken = crypto.randomBytes(32).toString("hex");
      
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
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
      
      await storage.updateScreen(screen.id, {
        isPaired: true,
        isOnline: true,
        lastSeen: new Date(),
        hardwareClass: hardwareInfo?.class || "raspberry_pi",
        hostname: hardwareInfo?.hostname || reverseDns || null,
        ipAddress: clientIp,
        deviceToken,
      });
      
      res.json({ screenId: screen.id, name: screen.name, deviceToken });
    } catch (error) {
      console.error("Error pairing screen:", error);
      res.status(500).json({ error: "Failed to pair screen" });
    }
  });

  app.post("/api/player/heartbeat", validateDeviceToken, async (req, res) => {
    try {
      const data = insertPlayerHeartbeatSchema.parse(req.body);
      await storage.createPlayerHeartbeat(data);

      const screen = await storage.getScreen(data.screenId);
      const wasOffline = screen && !screen.isOnline;

      const heartbeatClientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
      const heartbeatUpdate: any = { isOnline: true, lastSeen: new Date() };
      if (heartbeatClientIp) {
        heartbeatUpdate.ipAddress = heartbeatClientIp;
      }
      await storage.updateScreen(data.screenId, heartbeatUpdate);

      if (wasOffline && screen) {
        storage.deleteAlertHistory("screen_offline", screen.id).catch((err) =>
          console.error("Failed to clear alert history:", err)
        );
        try {
          if (screen.currentEventId) {
            const event = await storage.getEvent(screen.currentEventId);
            if (event?.clientId) {
              const alertSetting = await storage.getAlertSetting("screen_offline", event.clientId);
              if (alertSetting?.enabled && alertSetting.recipients.length > 0) {
                sendScreenOnlineAlert(
                  alertSetting.recipients,
                  screen.name,
                  screen.location,
                  screen.lastSeen ? new Date(screen.lastSeen) : null
                ).catch((err) => console.error("Failed to send screen online alert:", err));
              }
            }
          }
        } catch (alertErr) {
          console.error("Failed to process screen online alert:", alertErr);
        }
      }

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error recording heartbeat:", error);
      res.status(500).json({ error: "Failed to record heartbeat" });
    }
  });

  app.get("/api/player/:screenId/manifest", validateDeviceToken, async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.screenId);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      const overrides = await storage.getLiveOverrides();
      const now = new Date();
      const activeOverrides = overrides.filter(o => 
        o.isActive && 
        new Date(o.startTime) <= now && 
        new Date(o.endTime) >= now
      );

      res.json({
        screen,
        activeOverrides,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching manifest:", error);
      res.status(500).json({ error: "Failed to fetch manifest" });
    }
  });

  app.get("/api/player/:screenId/content", validateDeviceToken, async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.screenId);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      const now = new Date();
      let layout: any = null;
      let liveOverride: any = null;
      let activeZoneSources: any[] = [];

      const overrides = await storage.getLiveOverrides();
      const activeOverride = overrides.find(o => {
        if (!o.isActive || new Date(o.startTime) > now || new Date(o.endTime) < now) return false;
        if (!o.targets || (o.targets as any[]).length === 0) return true;
        return (o.targets as any[]).some((t: any) => 
          (t.type === "screen" && t.id === screen.id)
        );
      });

      if (activeOverride && activeOverride.layoutTemplateId) {
        layout = await storage.getLayoutTemplate(activeOverride.layoutTemplateId);
        liveOverride = activeOverride;
        activeZoneSources = (activeOverride.zoneSources as any[]) || [];
      }

      if (!layout && screen.currentEventId) {
        const [programmes, allVersions] = await Promise.all([
          storage.getProgrammes(),
          storage.getProgrammeVersions(),
        ]);
        const eventProgrammes = programmes.filter(p => p.eventId === screen.currentEventId);
        const publishedVersions = allVersions.filter(v => 
          v.status === "published" && eventProgrammes.some(p => p.id === v.programmeId)
        );
        
        const allBlocks = await Promise.all(
          publishedVersions.map(v => storage.getScheduleBlocks(v.id))
        );
        const flatBlocks = allBlocks.flat().sort((a, b) => (b.priority || 0) - (a.priority || 0));

        for (const block of flatBlocks) {
          const targets = block.targets as any[] || [];
          const targetMatch = targets.length === 0 || targets.some((t: any) => 
            t.type === "screen" && t.id === screen.id
          );
          if (!targetMatch) continue;

          const timeRules = block.timeRules as any[] || [];
          const timeMatch = timeRules.length === 0 || timeRules.some((rule: any) => {
            if (rule.startDate && new Date(rule.startDate) > now) return false;
            if (rule.endDate && new Date(rule.endDate) < now) return false;
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
              if (!rule.daysOfWeek.includes(now.getDay())) return false;
            }
            if (rule.startTime && rule.endTime) {
              const [sh, sm] = rule.startTime.split(":").map(Number);
              const [eh, em] = rule.endTime.split(":").map(Number);
              const startMins = sh * 60 + sm;
              const endMins = eh * 60 + em;
              const nowMins = now.getHours() * 60 + now.getMinutes();
              if (endMins <= startMins) {
                if (nowMins < startMins && nowMins > endMins) return false;
              } else {
                if (nowMins < startMins || nowMins > endMins) return false;
              }
            } else {
              if (rule.startTime) {
                const [h, m] = rule.startTime.split(":").map(Number);
                if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return false;
              }
              if (rule.endTime) {
                const [h, m] = rule.endTime.split(":").map(Number);
                if (now.getHours() > h || (now.getHours() === h && now.getMinutes() > m)) return false;
              }
            }
            return true;
          });

          if (timeMatch && block.layoutTemplateId) {
            layout = await storage.getLayoutTemplate(block.layoutTemplateId);
            activeZoneSources = (block.zoneSources as any[]) || [];
            break;
          }
        }
      }

      if (!layout && screen.fallbackLayoutId) {
        layout = await storage.getLayoutTemplate(screen.fallbackLayoutId);
      }

      const profile = screen.displayProfileId 
        ? await storage.getDisplayProfile(screen.displayProfileId) 
        : null;
      const mediaAssets = await storage.getMediaAssets();
      const allPlaylists = await storage.getPlaylists();
      const playlistItemsMap: Record<string, any[]> = {};
      for (const pl of allPlaylists) {
        const items = await storage.getPlaylistItems(pl.id);
        playlistItemsMap[pl.id] = items;
      }

      let event = null;
      if (screen.currentEventId) {
        event = await storage.getEvent(screen.currentEventId);
      }

      let refreshRequested = false;
      const refreshTs = pendingPlayerRefreshes.get(screen.id);
      if (refreshTs && (Date.now() - refreshTs) < REFRESH_SIGNAL_TTL) {
        refreshRequested = true;
        pendingPlayerRefreshes.delete(screen.id);
      } else if (refreshTs) {
        pendingPlayerRefreshes.delete(screen.id);
      }

      res.json({
        screen,
        profile,
        layout,
        media: mediaAssets,
        playlists: allPlaylists,
        playlistItems: playlistItemsMap,
        zoneSources: activeZoneSources,
        liveOverride,
        event,
        timestamp: now.toISOString(),
        refreshRequested,
      });
    } catch (error) {
      console.error("Error fetching player content:", error);
      res.status(500).json({ error: "Failed to fetch player content" });
    }
  });

  // ============ SIMULATOR CONTENT ============
  app.get("/api/simulator/:screenId/content", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.screenId);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const now = new Date();
      let layout: any = null;
      let layoutSource: string = "none";
      let layoutSourceDetail: string | null = null;

      const overrides = await storage.getLiveOverrides();
      const activeOverride = overrides.find(o => {
        if (!o.isActive || new Date(o.startTime) > now || new Date(o.endTime) < now) return false;
        if (!o.targets || (o.targets as any[]).length === 0) return true;
        return (o.targets as any[]).some((t: any) =>
          (t.type === "screen" && t.id === screen.id)
        );
      });

      if (activeOverride && activeOverride.layoutTemplateId) {
        layout = await storage.getLayoutTemplate(activeOverride.layoutTemplateId);
        layoutSource = "live_override";
        layoutSourceDetail = activeOverride.message || "Live Override";
      }

      if (!layout && screen.currentEventId) {
        const [programmes, allVersions] = await Promise.all([
          storage.getProgrammes(),
          storage.getProgrammeVersions(),
        ]);
        const eventProgrammes = programmes.filter(p => p.eventId === screen.currentEventId);
        const publishedVersions = allVersions.filter(v =>
          v.status === "published" && eventProgrammes.some(p => p.id === v.programmeId)
        );

        const allBlocks = await Promise.all(
          publishedVersions.map(v => storage.getScheduleBlocks(v.id))
        );
        const flatBlocks = allBlocks.flat().sort((a, b) => (b.priority || 0) - (a.priority || 0));

        for (const block of flatBlocks) {
          const targets = block.targets as any[] || [];
          const targetMatch = targets.length === 0 || targets.some((t: any) =>
            t.type === "screen" && t.id === screen.id
          );
          if (!targetMatch) continue;

          const timeRules = block.timeRules as any[] || [];
          const timeMatch = timeRules.length === 0 || timeRules.some((rule: any) => {
            if (rule.startDate && new Date(rule.startDate) > now) return false;
            if (rule.endDate && new Date(rule.endDate) < now) return false;
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
              if (!rule.daysOfWeek.includes(now.getDay())) return false;
            }
            if (rule.startTime && rule.endTime) {
              const [sh, sm] = rule.startTime.split(":").map(Number);
              const [eh, em] = rule.endTime.split(":").map(Number);
              const startMins = sh * 60 + sm;
              const endMins = eh * 60 + em;
              const nowMins = now.getHours() * 60 + now.getMinutes();
              if (endMins <= startMins) {
                if (nowMins < startMins && nowMins > endMins) return false;
              } else {
                if (nowMins < startMins || nowMins > endMins) return false;
              }
            } else {
              if (rule.startTime) {
                const [h, m] = rule.startTime.split(":").map(Number);
                if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return false;
              }
              if (rule.endTime) {
                const [h, m] = rule.endTime.split(":").map(Number);
                if (now.getHours() > h || (now.getHours() === h && now.getMinutes() > m)) return false;
              }
            }
            return true;
          });

          if (timeMatch && block.layoutTemplateId) {
            layout = await storage.getLayoutTemplate(block.layoutTemplateId);
            layoutSource = "scheduled";
            layoutSourceDetail = block.name;
            break;
          }
        }
      }

      if (!layout && screen.fallbackLayoutId) {
        layout = await storage.getLayoutTemplate(screen.fallbackLayoutId);
        layoutSource = "fallback";
        layoutSourceDetail = "Fallback Layout";
      }

      res.json({
        layoutId: layout?.id || null,
        layoutSource,
        layoutSourceDetail,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching simulator content:", error);
      res.status(500).json({ error: "Failed to fetch simulator content" });
    }
  });

  // ============ WEATHER WIDGET ============
  // Cache weather data for 10 minutes to reduce API calls
  const weatherCache = new Map<string, { data: any; timestamp: number }>();
  const WEATHER_CACHE_TTL = 10 * 60 * 1000;

  const handleWeatherRequest = async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const unit = (req.query.unit as string) || "celsius";

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid latitude or longitude" });
      }

      const cacheKey = `${lat},${lng},${unit}`;
      const cached = weatherCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_TTL) {
        return res.json(cached.data);
      }

      // Use Open-Meteo API (free, no API key required)
      const tempUnit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=${tempUnit}&timezone=auto`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Weather API request failed");
      }

      const data = await response.json();
      const current = data.current;
      
      // Map weather codes to conditions
      const weatherConditions: Record<number, { condition: string; icon: string }> = {
        0: { condition: "Clear", icon: "sun" },
        1: { condition: "Mainly Clear", icon: "sun" },
        2: { condition: "Partly Cloudy", icon: "cloud-sun" },
        3: { condition: "Overcast", icon: "cloud" },
        45: { condition: "Foggy", icon: "cloud-fog" },
        48: { condition: "Rime Fog", icon: "cloud-fog" },
        51: { condition: "Light Drizzle", icon: "cloud-drizzle" },
        53: { condition: "Drizzle", icon: "cloud-drizzle" },
        55: { condition: "Dense Drizzle", icon: "cloud-drizzle" },
        61: { condition: "Light Rain", icon: "cloud-rain" },
        63: { condition: "Rain", icon: "cloud-rain" },
        65: { condition: "Heavy Rain", icon: "cloud-rain" },
        71: { condition: "Light Snow", icon: "snowflake" },
        73: { condition: "Snow", icon: "snowflake" },
        75: { condition: "Heavy Snow", icon: "snowflake" },
        80: { condition: "Rain Showers", icon: "cloud-rain" },
        81: { condition: "Heavy Rain Showers", icon: "cloud-rain" },
        82: { condition: "Violent Rain", icon: "cloud-rain" },
        95: { condition: "Thunderstorm", icon: "cloud-lightning" },
        96: { condition: "Thunderstorm with Hail", icon: "cloud-lightning" },
        99: { condition: "Severe Thunderstorm", icon: "cloud-lightning" },
      };

      const weatherInfo = weatherConditions[current.weather_code] || { condition: "Unknown", icon: "cloud" };
      
      const timezones = findTimezone(lat, lng);
      const timezone = timezones.length > 0 ? timezones[0] : "UTC";
      
      const weatherData = {
        temperature: Math.round(current.temperature_2m),
        unit: unit === "fahrenheit" ? "°F" : "°C",
        condition: weatherInfo.condition,
        icon: weatherInfo.icon,
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        timestamp: new Date().toISOString(),
        timezone,
      };

      weatherCache.set(cacheKey, { data: weatherData, timestamp: Date.now() });
      res.json(weatherData);
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  };
  app.get("/api/widgets/weather", requireAuth, handleWeatherRequest);
  app.get("/api/player/widgets/weather", validateDeviceToken, handleWeatherRequest);

  // ============ NEWS WIDGET ============
  // Cache RSS feeds for 5 minutes
  const newsCache = new Map<string, { data: any; timestamp: number }>();
  const NEWS_CACHE_TTL = 5 * 60 * 1000;

  const handleNewsRequest = async (req: Request, res: Response) => {
    try {
      const rssUrl = req.query.url as string;
      const itemCount = Math.min(parseInt(req.query.count as string) || 10, 50);

      if (!rssUrl) {
        return res.status(400).json({ error: "RSS URL is required" });
      }

      const cacheKey = `${rssUrl},${itemCount}`;
      const cached = newsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL) {
        return res.json(cached.data);
      }

      // Dynamic import for rss-parser
      const Parser = (await import("rss-parser")).default;
      const parser = new Parser({
        timeout: 10000,
        headers: {
          "User-Agent": "VectorMesh RSS Reader/1.0",
        },
      });

      const feed = await parser.parseURL(rssUrl);
      
      const newsData = {
        title: feed.title || "News Feed",
        items: feed.items.slice(0, itemCount).map((item) => ({
          title: item.title || "",
          link: item.link || "",
          pubDate: item.pubDate || item.isoDate || "",
          source: feed.title || "",
        })),
        timestamp: new Date().toISOString(),
      };

      newsCache.set(cacheKey, { data: newsData, timestamp: Date.now() });
      res.json(newsData);
    } catch (error) {
      console.error("Error fetching news:", error);
      res.status(500).json({ error: "Failed to fetch news feed" });
    }
  };
  app.get("/api/widgets/news", requireAuth, handleNewsRequest);
  app.get("/api/player/widgets/news", validateDeviceToken, handleNewsRequest);

  // Geocoding endpoint to convert location names to coordinates
  app.get("/api/widgets/geocode", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Location query is required" });
      }

      // Use Open-Meteo geocoding API (free, no API key required)
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Geocoding API request failed");
      }

      const data = await response.json();
      const results = (data.results || []).map((r: any) => ({
        name: r.name,
        country: r.country,
        admin1: r.admin1,
        lat: r.latitude,
        lng: r.longitude,
      }));

      res.json({ results });
    } catch (error) {
      console.error("Error geocoding:", error);
      res.status(500).json({ error: "Failed to geocode location" });
    }
  });

  // ============ FOOTBALL DATA WIDGETS ============
  const handlePremierLeagueTable = createPremierLeagueTableHandler();
  app.get("/api/widgets/football/premier-league/table", requireAuth, handlePremierLeagueTable);
  app.get("/api/player/widgets/football/premier-league/table", validateDeviceToken, handlePremierLeagueTable);

  const handlePremierLeagueFixtures = createPremierLeagueFixturesHandler();
  app.get("/api/widgets/football/premier-league/fixtures", requireAuth, handlePremierLeagueFixtures);
  app.get("/api/player/widgets/football/premier-league/fixtures", validateDeviceToken, handlePremierLeagueFixtures);

  const handleHeathrowArrivals = createHeathrowArrivalsHandler();
  const handleHeathrowDepartures = createHeathrowDeparturesHandler();
  app.get("/api/widgets/heathrow/arrivals", requireAuth, handleHeathrowArrivals);
  app.get("/api/widgets/heathrow/departures", requireAuth, handleHeathrowDepartures);
  app.get("/api/player/widgets/heathrow/arrivals", validateDeviceToken, handleHeathrowArrivals);
  app.get("/api/player/widgets/heathrow/departures", validateDeviceToken, handleHeathrowDepartures);

  const handleWeatherForecast = createWeatherForecastHandler();
  app.get("/api/widgets/weather-forecast", requireAuth, handleWeatherForecast);
  app.get("/api/player/widgets/weather-forecast", validateDeviceToken, handleWeatherForecast);

  const handleSpaceXLaunch = createNextSpaceXLaunchHandler();
  app.get("/api/widgets/spacex/next-launch", requireAuth, handleSpaceXLaunch);
  app.get("/api/player/widgets/spacex/next-launch", validateDeviceToken, handleSpaceXLaunch);

  const handleEarthquakes = createEarthquakesHandler();
  app.get("/api/widgets/earthquakes/recent", requireAuth, handleEarthquakes);
  app.get("/api/player/widgets/earthquakes/recent", validateDeviceToken, handleEarthquakes);

  const handleAircraftOverhead = createAircraftOverheadHandler();
  app.get("/api/widgets/aircraft/overhead", requireAuth, handleAircraftOverhead);
  app.get("/api/player/widgets/aircraft/overhead", validateDeviceToken, handleAircraftOverhead);

  // ============ ADMIN: USER MANAGEMENT ============

  async function canManageUser(req: Request, targetUserId: string): Promise<boolean> {
    if (isAdmin(req)) return true;
    if (!isAccountManager(req)) return false;
    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return false;
    if (targetUser.role === "admin" || targetUser.role === "account_manager") return false;
    const allowed = getAllowedClientIds(req);
    if (!allowed || allowed.length === 0) return false;
    const targetSites = await storage.getUserClientIds(targetUserId);
    if (targetSites.length === 0) return false;
    return targetSites.some(s => allowed.includes(s));
  }

  app.get("/api/admin/users", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allowed = getAllowedClientIds(req);
      const usersWithSites = await Promise.all(
        allUsers.map(async (u) => {
          const sites = await storage.getUserSites(u.id);
          return { ...stripSensitiveFields(u), sites };
        })
      );
      if (allowed) {
        const filtered = usersWithSites.filter(u =>
          u.role === "admin" || u.role === "account_manager"
            ? false
            : u.sites.length > 0 && u.sites.some(s => allowed.includes(s.clientId))
        );
        return res.json(filtered);
      }
      res.json(usersWithSites);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const { email, firstName, lastName, role, password } = req.body;
      if (!email || !password || password.length < 8) {
        return res.status(400).json({ error: "Email and password (min 8 chars) required" });
      }
      const validRoles = isAdmin(req) ? ["admin", "account_manager", "site_user"] : ["site_user"];
      if (role && !validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(", ")}` });
      }
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }
      const hash = await bcrypt.hash(password, 12);
      const user = await storage.createUser({
        email: email.toLowerCase().trim(),
        firstName: firstName || "",
        lastName: lastName || "",
        role: role || "site_user",
        passwordHash: hash,
        mustChangePassword: true,
        isActive: true,
      });
      await sendWelcomeEmail(user.email!, firstName || "User", password);
      logAudit(req, "create", "user", user.id, { email: user.email, role: user.role });
      res.status(201).json(stripSensitiveFields(user));
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      if (!(await canManageUser(req, req.params.id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const { role, firstName, lastName, email, isActive } = req.body;
      const updateData: Record<string, any> = {};
      if (role !== undefined) {
        const validRoles = isAdmin(req) ? ["admin", "account_manager", "site_user"] : ["site_user"];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(", ")}` });
        }
        updateData.role = role;
      }
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) {
        const existing = await storage.getUserByEmail(email.toLowerCase().trim());
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ error: "Email already in use" });
        }
        updateData.email = email.toLowerCase().trim();
      }
      if (isActive !== undefined) updateData.isActive = isActive;
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }
      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      logAudit(req, "update", "user", user.id, { email: user.email, changes: Object.keys(updateData) });
      res.json(stripSensitiveFields(user));
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      if (!(await canManageUser(req, req.params.id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const tempPassword = crypto.randomBytes(6).toString("base64url");
      const hash = await bcrypt.hash(tempPassword, 12);
      await storage.setUserPassword(user.id, hash);
      await storage.updateUser(user.id, { mustChangePassword: true });
      if (user.email) {
        await sendAdminPasswordResetEmail(user.email, user.firstName || "User", tempPassword);
      }
      logAudit(req, "admin_reset_password", "user", user.id, { email: user.email });
      res.json({ ok: true, temporaryPassword: tempPassword });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/admin/users/:id/force-change-password", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      if (!(await canManageUser(req, req.params.id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const user = await storage.updateUser(req.params.id, { mustChangePassword: true });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      logAudit(req, "force_change_password", "user", user.id, { email: user.email });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error forcing password change:", error);
      res.status(500).json({ error: "Failed to force password change" });
    }
  });

  app.post("/api/admin/users/:id/sites", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }
      if (!canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "You do not have access to this site" });
      }
      if (!(await canManageUser(req, req.params.id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client/site not found" });
      }
      const userSite = await storage.addUserToSite(req.params.id, clientId);
      logAudit(req, "assign_site", "user", req.params.id, { clientId, clientName: client.name });
      res.status(201).json(userSite);
    } catch (error) {
      console.error("Error assigning user to site:", error);
      res.status(500).json({ error: "Failed to assign user to site" });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const currentUser = (req as any).dbUser;
      if (currentUser.id === req.params.id) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }
      if (!(await canManageUser(req, req.params.id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const userToDelete = await storage.getUser(req.params.id);
      const deleted = await storage.deleteUser(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }
      logAudit(req, "delete", "user", req.params.id, { email: userToDelete?.email });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.delete("/api/admin/users/:id/sites/:clientId", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      if (!canAccessClient(req, req.params.clientId)) {
        return res.status(403).json({ error: "You do not have access to this site" });
      }
      if (!(await canManageUser(req, req.params.id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const removed = await storage.removeUserFromSite(req.params.id, req.params.clientId);
      if (!removed) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      logAudit(req, "remove_site", "user", req.params.id, { clientId: req.params.clientId });
      res.status(204).send();
    } catch (error) {
      console.error("Error removing user from site:", error);
      res.status(500).json({ error: "Failed to remove user from site" });
    }
  });

  // ============ ADMIN: AUDIT LOGS & STATS ============
  app.get("/api/admin/audit-logs", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const options: any = {};
      if (req.query.userId) options.userId = req.query.userId as string;
      if (req.query.entityType) options.entityType = req.query.entityType as string;
      if (req.query.action) options.action = req.query.action as string;
      if (req.query.dateFrom) options.dateFrom = new Date(req.query.dateFrom as string);
      if (req.query.dateTo) options.dateTo = new Date(req.query.dateTo as string);
      if (req.query.limit) options.limit = parseInt(req.query.limit as string);
      if (req.query.offset) options.offset = parseInt(req.query.offset as string);

      const result = await storage.getAuditLogs(options);

      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, { firstName: u.firstName, lastName: u.lastName, email: u.email }]));

      const logsWithUsers = result.logs.map(log => ({
        ...log,
        user: log.userId ? userMap.get(log.userId) || null : null,
      }));

      res.json({ logs: logsWithUsers, total: result.total });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.delete("/api/admin/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.clearAuditLogs();
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entityType: "audit_log",
        entityId: null,
        payload: { description: "Cleared all activity logs" },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing audit logs:", error);
      res.status(500).json({ error: "Failed to clear audit logs" });
    }
  });

  app.get("/api/admin/stats", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const allowed = getAllowedClientIds(req);
      const [auditStats, allUsers, allClients, allScreens, allMedia, allOverrides, allEvents] = await Promise.all([
        storage.getAuditLogStats(),
        storage.getAllUsers(),
        storage.getClients(),
        storage.getScreens(),
        storage.getMediaAssets(),
        storage.getLiveOverrides(),
        storage.getEvents(),
      ]);

      let diskUsage: { totalBytes: number; usedBytes: number; freeBytes: number; path: string } | null = null;
      try {
        const { execSync } = require("child_process");
        const dfOutput = execSync("df -B1 /").toString().trim().split("\n");
        if (dfOutput.length >= 2) {
          const parts = dfOutput[1].split(/\s+/);
          diskUsage = {
            totalBytes: parseInt(parts[1], 10),
            usedBytes: parseInt(parts[2], 10),
            freeBytes: parseInt(parts[3], 10),
            path: parts[5],
          };
        }
      } catch (e) {
      }

      const clients = allowed ? allClients.filter(c => allowed.includes(c.id)) : allClients;
      const clientIds = new Set(clients.map(c => c.id));
      const eventIds = new Set(allEvents.filter(e => clientIds.has(e.clientId)).map(e => e.id));
      const screens = allScreens.filter(s => !allowed || (s.currentEventId && eventIds.has(s.currentEventId)));
      const mediaAssets = allowed ? allMedia.filter(m => m.eventId && eventIds.has(m.eventId)) : allMedia;
      const overrides = allowed ? allOverrides.filter(o => o.eventId && eventIds.has(o.eventId)) : allOverrides;
      const users = allowed ? allUsers.filter(u => {
        if (u.role === "admin") return false;
        return true;
      }) : allUsers;

      const now = new Date();
      const activeOverrides = overrides.filter(o => o.isActive && new Date(o.endTime) > now).length;

      res.json({
        ...auditStats,
        totalUsers: users.length,
        activeUsers: users.filter(u => u.isActive).length,
        totalClients: clients.length,
        totalScreens: screens.length,
        onlineScreens: screens.filter(s => s.isOnline).length,
        totalMedia: mediaAssets.length,
        activeOverrides,
        diskUsage,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ error: "Failed to fetch admin stats" });
    }
  });

  // ============ PER-CLIENT STATS ============
  app.get("/api/admin/stats/by-client", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const stats = await storage.getStatsByClient();
      const allowed = getAllowedClientIds(req);
      const filtered = allowed ? stats.filter(s => allowed.includes(s.clientId)) : stats;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching per-client stats:", error);
      res.status(500).json({ error: "Failed to fetch per-client stats" });
    }
  });

  // ============ SYSTEM SETTINGS ============
  app.get("/api/system-settings", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ error: "Failed to fetch system settings" });
    }
  });

  app.get("/api/system-settings/:key", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      console.error("Error fetching system setting:", error);
      res.status(500).json({ error: "Failed to fetch system setting" });
    }
  });

  app.put("/api/system-settings/:key", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string" || !value.trim()) {
        return res.status(400).json({ error: "value is required and must be a non-empty string" });
      }
      const setting = await storage.setSystemSetting(req.params.key, value.trim());
      logAudit(req, "update", "system_setting", req.params.key, { value: value.trim() });
      res.json(setting);
    } catch (error) {
      console.error("Error updating system setting:", error);
      res.status(500).json({ error: "Failed to update system setting" });
    }
  });

  // ============ ALERT SETTINGS ============
  app.get("/api/alert-settings", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allowed = getAllowedClientIds(req);
      const settings = await storage.getAlertSettings(allowed);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching alert settings:", error);
      res.status(500).json({ error: "Failed to fetch alert settings" });
    }
  });

  app.put("/api/alert-settings/:alertType", requireAuth, loadUserContext, async (req, res) => {
    try {
      const { alertType } = req.params;
      const { clientId, enabled, recipients, cooldownMinutes } = req.body;

      if (!clientId || typeof clientId !== "string") {
        return res.status(400).json({ error: "clientId is required" });
      }

      if (!canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied to this site" });
      }

      if (!Array.isArray(recipients) || !recipients.every((r: any) => typeof r === "string" && r.includes("@"))) {
        return res.status(400).json({ error: "Recipients must be an array of valid email addresses" });
      }

      const cooldown = typeof cooldownMinutes === "number" && cooldownMinutes > 0 ? Math.floor(cooldownMinutes) : 15;

      const setting = await storage.upsertAlertSetting(alertType, clientId, {
        enabled: !!enabled,
        recipients: recipients.map((r: string) => r.trim().toLowerCase()),
        cooldownMinutes: cooldown,
      });

      logAudit(req, "update", "alert_setting", alertType, { clientId, enabled, recipients: recipients.length, cooldownMinutes });
      res.json(setting);
    } catch (error) {
      console.error("Error updating alert setting:", error);
      res.status(500).json({ error: "Failed to update alert setting" });
    }
  });

  app.post("/api/alert-settings/test", requireAuth, async (req, res) => {
    try {
      const { recipients } = req.body;
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: "At least one recipient email is required" });
      }
      const sent = await sendTestAlert(recipients);
      res.json({ ok: sent });
    } catch (error) {
      console.error("Error sending test alert:", error);
      res.status(500).json({ error: "Failed to send test alert" });
    }
  });

  // Temporary endpoint to serve deployment files
  app.get("/api/deploy-package", async (_req, res) => {
    try {
      const tarPath = path.join(os.tmpdir(), "upload-fix.tar.gz");
      const exists = await fs.promises.access(tarPath).then(() => true).catch(() => false);
      if (exists) {
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Disposition", "attachment; filename=upload-fix.tar.gz");
        const stream = fs.createReadStream(tarPath);
        stream.pipe(res);
      } else {
        res.status(404).json({ error: "Package not found" });
      }
    } catch (e) {
      res.status(500).json({ error: "Failed to serve package" });
    }
  });

  return httpServer;
}

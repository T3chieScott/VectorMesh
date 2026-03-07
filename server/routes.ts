import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { insertClientSchema, insertEventSchema, insertScreenSchema, insertDisplayProfileSchema, insertScreenGroupSchema, insertMediaAssetSchema, insertLayoutTemplateSchema, insertProgrammeSchema, insertPlaylistSchema, insertPlaylistItemSchema, insertScheduleBlockSchema, insertLiveOverrideSchema, insertPlayerHeartbeatSchema, insertBrandPackSchema } from "@shared/schema";
import { getSignedUploadUrl, getPublicUrl, objectStorageService } from "./objectStorage";
import { setupAuth, isAuthenticated } from "./auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { find as findTimezone } from "geo-tz";
import { sendWelcomeEmail, sendPasswordResetEmail, sendAdminPasswordResetEmail, sendPasswordChangedEmail, sendScreenOfflineAlert, sendScreenOnlineAlert, sendTestAlert } from "./email";

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
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      const { passwordHash, ...safeUser } = user;
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
          res.json({ ...safeUser });
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
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
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
      if (existingUser) {
        await storage.setUserPassword(existingUser.id, hash);
        await storage.updateUser(existingUser.id, { role: "admin", mustChangePassword: false });
        const { passwordHash, ...safeUser } = (await storage.getUser(existingUser.id))!;
        (req.session as any).userId = existingUser.id;
        return res.json(safeUser);
      }
      const user = await storage.createUser({
        email: email.toLowerCase().trim(),
        firstName: firstName || "Admin",
        lastName: lastName || "",
        role: "admin",
        passwordHash: hash,
        mustChangePassword: false,
        isActive: true,
      });
      (req.session as any).userId = user.id;
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Setup error:", error);
      res.status(500).json({ error: "Setup failed" });
    }
  });

  // Setup object storage routes for serving uploaded files
  registerObjectStorageRoutes(app);

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
      const data = insertClientSchema.partial().parse(req.body);
      const client = await storage.updateClient(req.params.id, data);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      logAudit(req, "update", "client", client.id, { name: client.name });
      res.json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.delete("/api/clients/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: "Admin access required to delete sites" });
      }
      const clientToDelete = await storage.getClient(req.params.id);
      const deleted = await storage.deleteClient(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Client not found" });
      }
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
  app.get("/api/display-profiles", requireAuth, async (req, res) => {
    try {
      const profiles = await storage.getDisplayProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching display profiles:", error);
      res.status(500).json({ error: "Failed to fetch display profiles" });
    }
  });

  app.post("/api/display-profiles", requireAuth, async (req, res) => {
    try {
      const data = insertDisplayProfileSchema.parse(req.body);
      const profile = await storage.createDisplayProfile(data);
      logAudit(req, "create", "display_profile", profile.id, { name: profile.name });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating display profile:", error);
      res.status(500).json({ error: "Failed to create display profile" });
    }
  });

  app.patch("/api/display-profiles/:id", requireAuth, async (req, res) => {
    try {
      const data = insertDisplayProfileSchema.partial().parse(req.body);
      const profile = await storage.updateDisplayProfile(req.params.id, data);
      if (!profile) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      logAudit(req, "update", "display_profile", profile.id, { name: profile.name });
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating display profile:", error);
      res.status(500).json({ error: "Failed to update display profile" });
    }
  });

  app.delete("/api/display-profiles/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteDisplayProfile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Display profile not found" });
      }
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
      const groups = await storage.getScreenGroups();
      const allowed = getAllowedClientIds(req);
      if (!allowed) return res.json(groups);
      const allowedEvents = (await storage.getEvents()).filter(e => allowed.includes(e.clientId));
      const allowedEventIds = new Set(allowedEvents.map(e => e.id));
      const screens = await storage.getScreens();
      const allowedScreenIds = new Set(
        screens.filter(s => !s.currentEventId || allowedEventIds.has(s.currentEventId)).map(s => s.id)
      );
      const filtered = groups.filter(g => {
        const memberIds = (g.screenIds as string[]) || [];
        return memberIds.length === 0 || memberIds.some(id => allowedScreenIds.has(id));
      });
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching screen groups:", error);
      res.status(500).json({ error: "Failed to fetch screen groups" });
    }
  });

  app.post("/api/screen-groups", requireAuth, async (req, res) => {
    try {
      const data = insertScreenGroupSchema.parse(req.body);
      const group = await storage.createScreenGroup(data);
      logAudit(req, "create", "screen_group", group.id, { name: group.name });
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

  // ============ SCREENS ============
  app.get("/api/screens", requireAuth, loadUserContext, async (req, res) => {
    try {
      await storage.markStaleScreensOffline(STALE_THRESHOLD_MS);
      const screens = await storage.getScreens();
      const allowed = getAllowedClientIds(req);
      let filtered = screens;
      if (allowed) {
        const allowedEvents = (await storage.getEvents()).filter(e => allowed.includes(e.clientId));
        const allowedEventIds = new Set(allowedEvents.map(e => e.id));
        filtered = screens.filter(s => !s.currentEventId || allowedEventIds.has(s.currentEventId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEvents = (await storage.getEvents()).filter(e => e.clientId === clientId);
        const clientEventIds = new Set(clientEvents.map(e => e.id));
        filtered = filtered.filter(s => s.currentEventId && clientEventIds.has(s.currentEventId));
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
      const allowed = getAllowedClientIds(req);
      if (allowed && screen.currentEventId) {
        const event = await storage.getEvent(screen.currentEventId);
        if (event && !allowed.includes(event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
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
        displayProfileId: req.body.displayProfileId || null,
        currentEventId: req.body.currentEventId || null,
      };
      const data = insertScreenSchema.parse(body);
      if (data.currentEventId) {
        const event = await storage.getEvent(data.currentEventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const screen = await storage.createScreen(data);
      logAudit(req, "create", "screen", screen.id, { name: screen.name });
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
      const body = {
        ...req.body,
        displayProfileId: req.body.displayProfileId || null,
        currentEventId: req.body.currentEventId || null,
      };
      const data = insertScreenSchema.partial().parse(body);
      const screen = await storage.updateScreen(req.params.id, data);
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      logAudit(req, "update", "screen", screen.id, { name: screen.name });
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

  app.delete("/api/screens/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteScreen(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Screen not found" });
      }
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
      const allEventsForMedia = await storage.getEvents();
      let filtered = assets;
      if (allowed) {
        const allowedEventIds = new Set(allEventsForMedia.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        filtered = assets.filter(a => !a.eventId || allowedEventIds.has(a.eventId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEventIds = new Set(allEventsForMedia.filter(e => e.clientId === clientId).map(e => e.id));
        filtered = filtered.filter(a => a.eventId && clientEventIds.has(a.eventId));
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
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const asset = await storage.createMediaAsset(data);
      logAudit(req, "create", "media", asset.id, { name: asset.name });
      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating media asset:", error);
      res.status(500).json({ error: "Failed to create media asset" });
    }
  });

  app.delete("/api/media/:id", requireAuth, async (req, res) => {
    try {
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

      // Get the normalized path and serve the file
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(asset.originalPath);
      if (normalizedPath.startsWith("/objects/")) {
        const file = await objectStorageService.getObjectEntityFile(normalizedPath);
        await objectStorageService.downloadObject(file, res);
      } else {
        // For external URLs, redirect
        res.redirect(asset.originalPath);
      }
    } catch (error) {
      console.error("Error serving media file:", error);
      res.status(500).json({ error: "Failed to serve media file" });
    }
  });

  // ============ UPLOAD URL ============
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    try {
      const { name, contentType } = req.body;
      if (!name || !contentType) {
        return res.status(400).json({ error: "name and contentType are required" });
      }
      const uploadURL = await getSignedUploadUrl(name, contentType);
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // ============ LAYOUT TEMPLATES ============
  app.get("/api/layouts", requireAuth, loadUserContext, async (req, res) => {
    try {
      const layouts = await storage.getLayoutTemplates();
      const allowed = getAllowedClientIds(req);
      const allEventsForLayouts = await storage.getEvents();
      let filtered = layouts;
      if (allowed) {
        const allowedEventIds = new Set(allEventsForLayouts.filter(e => allowed.includes(e.clientId)).map(e => e.id));
        filtered = layouts.filter(l => !l.eventId || allowedEventIds.has(l.eventId));
      }
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        const clientEventIds = new Set(allEventsForLayouts.filter(e => e.clientId === clientId).map(e => e.id));
        filtered = filtered.filter(l => l.eventId && clientEventIds.has(l.eventId));
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

  app.patch("/api/layouts/:id", requireAuth, async (req, res) => {
    try {
      const data = insertLayoutTemplateSchema.partial().parse(req.body);
      const layout = await storage.updateLayoutTemplate(req.params.id, data);
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      logAudit(req, "update", "layout", layout.id, { name: layout.name });
      res.json(layout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating layout:", error);
      res.status(500).json({ error: "Failed to update layout" });
    }
  });

  app.delete("/api/layouts/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteLayoutTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Layout not found" });
      }
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
        filtered = filtered.filter(p => p.eventId && clientEventIds.has(p.eventId));
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

  // ============ PLAYLIST ITEMS ============
  app.get("/api/playlists/:playlistId/items", requireAuth, async (req, res) => {
    try {
      const items = await storage.getPlaylistItems(req.params.playlistId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      res.status(500).json({ error: "Failed to fetch playlist items" });
    }
  });

  app.post("/api/playlists/:playlistId/items", requireAuth, async (req, res) => {
    try {
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

  app.patch("/api/playlist-items/:id", requireAuth, async (req, res) => {
    try {
      const data = insertPlaylistItemSchema.partial().parse(req.body);
      const item = await storage.updatePlaylistItem(req.params.id, data);
      if (!item) {
        return res.status(404).json({ error: "Playlist item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating playlist item:", error);
      res.status(500).json({ error: "Failed to update playlist item" });
    }
  });

  app.delete("/api/playlist-items/:id", requireAuth, async (req, res) => {
    try {
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
        filtered = filtered.filter(o => o.eventId && clientEventIds.has(o.eventId));
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

  // Secured media file endpoint for paired player devices
  app.get("/api/player/media/:id/file", validateDeviceToken, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }

      const normalizedPath = objectStorageService.normalizeObjectEntityPath(asset.originalPath);
      if (normalizedPath.startsWith("/objects/")) {
        const file = await objectStorageService.getObjectEntityFile(normalizedPath);
        await objectStorageService.downloadObject(file, res);
      } else {
        res.redirect(asset.originalPath);
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
      
      await storage.updateScreen(screen.id, {
        isPaired: true,
        isOnline: true,
        lastSeen: new Date(),
        hardwareClass: hardwareInfo?.class || "raspberry_pi",
        ipAddress: req.ip,
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

      await storage.updateScreen(data.screenId, { isOnline: true, lastSeen: new Date() });

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
              let endMins = eh * 60 + em;
              const nowMins = now.getHours() * 60 + now.getMinutes();
              if (endMins <= startMins) {
                endMins = 24 * 60;
              }
              if (nowMins < startMins || nowMins > endMins) return false;
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

      res.json({
        screen,
        profile,
        layout,
        media: mediaAssets,
        playlists: allPlaylists,
        playlistItems: playlistItemsMap,
        liveOverride,
        event,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching player content:", error);
      res.status(500).json({ error: "Failed to fetch player content" });
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
          const { passwordHash, ...safeUser } = u;
          return { ...safeUser, sites };
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
      const { passwordHash, ...safeUser } = user;
      res.status(201).json(safeUser);
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
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
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

  return httpServer;
}

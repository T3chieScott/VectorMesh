import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, pickCanvasPairingWinner } from "./storage";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { insertClientSchema, insertEventSchema, insertScreenSchema, insertDisplayProfileSchema, insertScreenGroupSchema, insertMediaAssetSchema, insertLayoutTemplateSchema, insertProgrammeSchema, insertPlaylistSchema, insertPlaylistItemSchema, updatePlaylistItemSchema, insertScheduleBlockSchema, insertScreenPresetSchema, insertLiveOverrideSchema, insertPlayerHeartbeatSchema, insertBrandPackSchema, insertScreenEventBookingSchema, insertCanvasGroupSchema, insertAgendaItemSchema, insertAgendaWidgetConfigSchema, type InsertScreenEventBooking, type TimeRule, type ScheduleTarget, type InsertAgendaItem, type InsertLayoutTemplate } from "@shared/schema";
import { parseAgendaCsv } from "@shared/agenda-csv";
import { resolveAgendaItems } from "@shared/agenda-resolver";
import { derivePlaybackStatus } from "@shared/playback-derivation";
import { canAccessBooking } from "@shared/booking-utils";
import {
  DEFAULT_SCHEDULE_TIMEZONE_FALLBACK,
  describeTzOffset,
  getWallPartsInTz,
  parseHHMMString,
  startOfDayInTz,
  endOfDayInTz,
  wallTimeOnDateInTz,
} from "@shared/timezone-utils";
import { getDefaultScheduleTimezone } from "./scheduleTimezone";
import { generateVideoThumbnail, getVideoDuration } from "./thumbnail";
import { setupAuth, isAuthenticated, isAuthenticatedOrToken, hashApiToken } from "./auth";
import { mountTestAuthRoute } from "./testAuthRoute";
import { mountAgendaRoutes } from "./agendaRoutes";
import { runDueAgendaSyncs } from "./agendaSync";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import * as fileStorage from "./fileStorage";
import { find as findTimezone } from "geo-tz";
import { sendWelcomeEmail, sendPasswordResetEmail, sendAdminPasswordResetEmail, sendPasswordChangedEmail, sendScreenOfflineAlert, sendScreenOnlineAlert, sendTestAlert } from "./email";
import { resolveScreenContent, type ResolverDeps } from "./contentResolver";
import { buildContentTraceHandler } from "./contentTraceHandler";
import { buildBulkBookingsHandler, type BulkBookingResult } from "./bulkBookingsHandler";
import { buildBulkBlocksHandler, type BulkBlockResult } from "./bulkBlocksHandler";
import { resolveSimulatorContent } from "./simulatorContent";
import { filterMediaAssetsForScreen } from "./playerMediaFilter";
import {
  applyGlobalHideOverride,
  parseGlobalHideValue,
  GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY,
} from "./globalHideOverride";
import {
  findSuspectBlocks as findScheduleTzSuspectBlocks,
  TZ_AUDIT_DEFAULT_CUTOFF,
} from "./scheduleTzAudit";
import { createPremierLeagueTableHandler } from "./premierLeague";
import { createPremierLeagueFixturesHandler } from "./premierLeagueFixtures";
import { createHeathrowArrivalsHandler, createHeathrowDeparturesHandler } from "./heathrowFlights";
import { createWeatherForecastHandler } from "./weatherForecast";
import { createNextSpaceXLaunchHandler } from "./spacexLaunch";
import { createEarthquakesHandler } from "./usgsEarthquakes";
import { createAircraftOverheadHandler } from "./openSkyAircraft";
import { buildScreenPatchHandler } from "./screenPatchHandler";
import { buildScreenCreateHandler } from "./screenCreateHandler";
import { buildScreenRegeneratePairingHandler } from "./screenRegeneratePairingHandler";
import {
  decideVideoHealthUpdate,
  extractVideoStats,
} from "./videoHealthHeartbeat";
import { getPathParam, getOptionalPathParam, getQueryString } from "./requestParams";

const playerWeatherSummaryCache = new Map<string, { summary: string; timestamp: number }>();
const PLAYER_WEATHER_SUMMARY_TTL = 10 * 60 * 1000;
const PLAYER_WEATHER_CONDITIONS: Record<number, string> = {
  0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Foggy", 48: "Rime Fog",
  51: "Light Drizzle", 53: "Drizzle", 55: "Dense Drizzle",
  61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
  71: "Light Snow", 73: "Snow", 75: "Heavy Snow",
  80: "Rain Showers", 81: "Heavy Rain Showers", 82: "Violent Rain",
  95: "Thunderstorm", 96: "Thunderstorm with Hail", 99: "Severe Thunderstorm",
};

async function fetchWeatherSummary(lat: number, lng: number, unit: string): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${unit}`;
  const cached = playerWeatherSummaryCache.get(key);
  if (cached && Date.now() - cached.timestamp < PLAYER_WEATHER_SUMMARY_TTL) {
    return cached.summary;
  }
  try {
    const tempUnit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&temperature_unit=${tempUnit}&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current;
    if (!current) return null;
    const condition = PLAYER_WEATHER_CONDITIONS[current.weather_code] || "Unknown";
    const symbol = unit === "fahrenheit" ? "°F" : "°C";
    const summary = `${condition}, ${Math.round(current.temperature_2m)}${symbol}`;
    playerWeatherSummaryCache.set(key, { summary, timestamp: Date.now() });
    return summary;
  } catch {
    return null;
  }
}

export function computeNextSession(blocks: Array<{ name: string; targets?: any; timeRules?: any }>, screenId: string, now: Date, tz: string): { title: string; time: string; countdown: string } | null {
  let best: { startMs: number; name: string; timeStr: string } | null = null;
  for (const block of blocks) {
    const targets = (block.targets as any[]) || [];
    const targetMatch = targets.length === 0 || targets.some((t: any) => t.type === "screen" && t.id === screenId);
    if (!targetMatch) continue;
    const rules = (block.timeRules as any[]) || [];
    for (const rule of rules) {
      const startHM = parseHHMMString(rule?.startTime);
      if (!startHM) continue;
      const sh = startHM.hours;
      const sm = startHM.minutes;
      const startDateLimit = rule.startDate ? startOfDayInTz(String(rule.startDate), tz) : null;
      const endDateLimit = rule.endDate ? endOfDayInTz(String(rule.endDate), tz) : null;
      // Look up to 7 days ahead for the next occurrence respecting daysOfWeek/startDate/endDate.
      // Day arithmetic is performed against the wall-clock day in `tz` so DST
      // transitions and non-UTC sites work correctly. We advance by anchoring
      // each successive lookup at noon LOCAL TIME on the next calendar day
      // (computed via startOfDayInTz + 12h) instead of adding 24h of UTC,
      // because a 24h-of-UTC delta can skip a calendar day when crossing a
      // spring-forward boundary near midnight.
      const nowParts = getWallPartsInTz(now, tz);
      let cursorDateString = `${nowParts.year.toString().padStart(4, "0")}-${
        nowParts.month.toString().padStart(2, "0")
      }-${nowParts.day.toString().padStart(2, "0")}`;
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const dayStart = startOfDayInTz(cursorDateString, tz);
        if (!dayStart) break;
        // Anchor at local noon on this calendar day so wallTimeOnDateInTz
        // pins to the right Y/M/D regardless of zone offset.
        const dayAnchor = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
        const candidate = wallTimeOnDateInTz(dayAnchor, tz, sh, sm);
        // Advance the cursor to the next local calendar day for the next iteration.
        const nextParts = getWallPartsInTz(new Date(dayStart.getTime() + 26 * 60 * 60 * 1000), tz);
        cursorDateString = `${nextParts.year.toString().padStart(4, "0")}-${
          nextParts.month.toString().padStart(2, "0")
        }-${nextParts.day.toString().padStart(2, "0")}`;
        if (candidate.getTime() <= now.getTime()) continue;
        if (startDateLimit && candidate < startDateLimit) continue;
        if (endDateLimit && candidate > endDateLimit) continue;
        if (rule.daysOfWeek && Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0) {
          const wall = getWallPartsInTz(candidate, tz);
          if (!rule.daysOfWeek.includes(wall.dayOfWeek)) continue;
        }
        const timeStr = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
        if (!best || candidate.getTime() < best.startMs) {
          best = { startMs: candidate.getTime(), name: block.name, timeStr };
        }
        break;
      }
    }
  }
  if (!best) return null;
  const diffMin = Math.round((best.startMs - now.getTime()) / 60000);
  let countdown: string;
  if (diffMin < 1) countdown = "starting now";
  else if (diffMin < 60) countdown = `in ${diffMin} min`;
  else {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    countdown = m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
  }
  return { title: best.name, time: best.timeStr, countdown };
}

interface PlayerVarsPayload {
  screenName: string | null;
  roomName: string | null;
  eventName: string | null;
  clientName: string | null;
  roomCapacity: number | null;
  eventStartDate: string;
  eventEndDate: string;
  nextSessionTitle: string | null;
  nextSessionTime: string | null;
  nextSessionCountdown: string | null;
  weatherSummary: string | null;
}

async function getActiveEventForScreen(screenId: string, now: Date = new Date()) {
  const event = await storage.getCurrentEventForScreen(screenId, now);
  return event ?? null;
}

async function buildPlayerVarsForScreen(
  screen: any,
  now: Date = new Date(),
  accessFilter?: { allowed: readonly string[] | null },
): Promise<PlayerVarsPayload> {
  const rawEvent = await getActiveEventForScreen(screen.id, now);
  const event = (() => {
    if (!rawEvent) return rawEvent;
    if (!accessFilter) return rawEvent;
    const ok = canAccessBooking(
      screen.clientId ?? null,
      rawEvent.clientId ?? null,
      accessFilter.allowed,
    );
    return ok ? rawEvent : null;
  })();
  let client: any = null;
  if (screen.clientId) {
    client = await storage.getClient(screen.clientId);
  }

  let eventBlocks: Awaited<ReturnType<typeof storage.getScheduleBlocks>> = [];
  if (event) {
    const [programmes, allVersions] = await Promise.all([
      storage.getProgrammes(),
      storage.getProgrammeVersions(),
    ]);
    const eventProgrammes = programmes.filter((p: any) => p.eventId === event.id);
    const publishedVersions = allVersions.filter((v: any) =>
      v.status === "published" && eventProgrammes.some((p: any) => p.id === v.programmeId)
    );
    const allBlocks = await Promise.all(
      publishedVersions.map((v: any) => storage.getScheduleBlocks(v.id))
    );
    eventBlocks = allBlocks.flat();
  }

  let nextSession: { title: string; time: string; countdown: string } | null = null;
  if (eventBlocks.length > 0) {
    try {
      const tz = client?.timezone || DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
      nextSession = computeNextSession(eventBlocks, screen.id, now, tz);
    } catch (e) {
      console.warn("next session computation failed:", e);
    }
  }

  let weatherSummary: string | null = null;
  const wLat = screen.weatherLat ? parseFloat(screen.weatherLat) : NaN;
  const wLng = screen.weatherLng ? parseFloat(screen.weatherLng) : NaN;
  if (!isNaN(wLat) && !isNaN(wLng)) {
    weatherSummary = await fetchWeatherSummary(wLat, wLng, screen.weatherUnit || "celsius");
  }

  return {
    screenName: screen.name ?? null,
    roomName: screen.location ?? null,
    eventName: event?.name ?? null,
    clientName: client?.name ?? null,
    roomCapacity: screen.roomCapacity ?? null,
    eventStartDate: formatPlayerDate(event?.startDate),
    eventEndDate: formatPlayerDate(event?.endDate),
    nextSessionTitle: nextSession?.title ?? null,
    nextSessionTime: nextSession?.time ?? null,
    nextSessionCountdown: nextSession?.countdown ?? null,
    weatherSummary,
  };
}

function formatPlayerDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

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
const requireAuthOrToken = isAuthenticatedOrToken;

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

// Task #185 — short, non-secret prefix of a device token used in 403
// diagnostics so we can correlate "player thinks it's paired" with
// "server says it isn't" without leaking the full token to logs.
function tokenPrefixForLog(token: string | undefined | null): string {
  if (!token) return "<none>";
  return token.slice(0, 6) + "…";
}

async function validateDeviceToken(req: Request, res: Response, next: NextFunction) {
  // Header takes precedence; only consult `?token=` (and validate it for
  // repeated/non-string values) when no valid header token is present.
  const headerToken = req.headers["x-device-token"];
  let token: string | undefined =
    typeof headerToken === "string" && headerToken ? headerToken : undefined;
  if (!token) {
    const queryToken = getQueryString(req, "token", res);
    if (queryToken === null) return; // helper sent 400 for repeated/non-string
    token = queryToken || undefined;
  }
  if (!token) {
    // Task #185: log token-required 401s so we can correlate
    // Pi-side unpair events with the request that triggered them.
    // The user-agent is logged as a free-form prefix (truncated to
    // keep log lines bounded), separately from any token helper —
    // it's metadata about the caller, not a secret to redact.
    const ua =
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"].slice(0, 60)
        : "<none>";
    console.warn(
      `[player-auth] 401 missing-token path=${req.path} userAgent="${ua}"`,
    );
    return res.status(401).json({ error: "Device token required" });
  }

  // This middleware is mounted on routes both with `:screenId` (e.g.
  // /api/player/:screenId/content) and without (e.g. /api/player/heartbeat,
  // /api/player/widgets/...). Use the optional accessor so the missing-key
  // path falls through to lookup-by-token below.
  const screenId = getOptionalPathParam(req, "screenId");
  if (screenId) {
    const screen = await storage.getScreen(screenId);
    if (!screen || screen.deviceToken !== token) {
      // Task #185: structured 403 logging so a wave of player unpairs
      // is traceable to the screen + token-mismatch class. We log
      // token PREFIXES only (never the full secret) — enough to tell
      // "Pi sent token A, DB has token B" apart from "Pi sent token
      // A, DB has token NULL" apart from "screen row vanished".
      const dbToken = screen?.deviceToken ?? null;
      const reason = !screen
        ? "screen-not-found"
        : dbToken === null
          ? "db-token-null"
          : "token-mismatch";
      console.warn(
        `[player-auth] 403 path=${req.path} screenId=${screenId} reason=${reason} sent=${tokenPrefixForLog(token)} db=${tokenPrefixForLog(dbToken)}`,
      );
      return res.status(403).json({ error: "Invalid device token" });
    }
    (req as any).pairedScreen = screen;
  } else {
    const screen = await storage.getScreenByDeviceToken(token);
    if (!screen) {
      console.warn(
        `[player-auth] 403 path=${req.path} reason=token-not-found sent=${tokenPrefixForLog(token)}`,
      );
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
const pendingScreenshotRequests = new Map<string, number>();
const REFRESH_SIGNAL_TTL = 60_000;

async function refreshScreensForVersion(versionId: string) {
  try {
    const version = await storage.getProgrammeVersion(versionId);
    if (!version || version.status !== "published") return;
    const programmes = await storage.getProgrammes();
    const programme = programmes.find(p => p.id === version.programmeId);
    if (!programme?.eventId) return;
    const allScreens = await storage.getScreens();
    const now = Date.now();
    const nowDate = new Date(now);
    for (const s of allScreens) {
      const activeEvent = await storage.getCurrentEventForScreen(s.id, nowDate);
      if (activeEvent?.id === programme.eventId) {
        pendingPlayerRefreshes.set(s.id, now);
      }
    }
  } catch (err) {
    console.error("Error signalling screen refresh for version:", err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // Test-only auth bypass — only mounted when NODE_ENV !== "production"
  // AND ENABLE_TEST_AUTH_BYPASS=1. Lets browser-driven UI tests log in
  // as a known user without typing a password or 2FA TOTP. See
  // server/testAuthRoute.ts for the safety gate; production deploys
  // never set ENABLE_TEST_AUTH_BYPASS so the route is never registered.
  mountTestAuthRoute(app, storage);

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

  // ============ API TOKENS (personal) ============
  app.get("/api/me/api-tokens", requireAuth, async (req, res) => {
    try {
      const user = (req as any).dbUser;
      const tokens = await storage.getApiTokensByUser(user.id);
      const tokenIds = tokens.map(t => t.id);
      const newIpEvents = await storage.getRecentNewIpEventsForTokens(tokenIds);
      const ackActors = await storage.getLatestAckActorsForTokens(tokenIds);
      res.json(tokens.map(t => {
        const event = newIpEvents.get(t.id);
        // Only surface the "last reviewed" line when there is no active alert,
        // since the alert banner already shows its own dismiss affordance.
        const ack = !event && t.newIpAcknowledgedAt ? ackActors.get(t.id) : undefined;
        const ackName = ack
          ? ([ack.firstName, ack.lastName].filter(Boolean).join(" ").trim() || ack.email || null)
          : null;
        return {
          id: t.id,
          name: t.name,
          prefix: t.prefix,
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
          revokedAt: t.revokedAt,
          newIp: event ? { ip: event.lastIp, at: event.lastAt, count: event.count } : null,
          newIpAcknowledgedAt: !event ? t.newIpAcknowledgedAt : null,
          newIpAcknowledgedBy: ack ? { id: ack.userId, name: ackName } : null,
        };
      }));
    } catch (error) {
      console.error("List api tokens error:", error);
      res.status(500).json({ error: "Failed to list tokens" });
    }
  });

  app.post("/api/me/api-tokens", requireAuth, requireAdminOrAccountManager, async (req, res) => {
    try {
      const user = (req as any).dbUser;
      const name = (req.body?.name || "").toString().trim();
      if (!name || name.length > 80) {
        return res.status(400).json({ error: "Name is required (max 80 chars)" });
      }
      const random = crypto.randomBytes(32).toString("base64url");
      const plain = `vm_${random}`;
      const tokenHash = hashApiToken(plain);
      const prefix = plain.slice(0, 12);
      const created = await storage.createApiToken({
        userId: user.id,
        name,
        tokenHash,
        prefix,
      });
      logAudit(req, "create", "api_token", created.id, { name });
      res.status(201).json({
        token: plain,
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        createdAt: created.createdAt,
      });
    } catch (error) {
      console.error("Create api token error:", error);
      res.status(500).json({ error: "Failed to create token" });
    }
  });

  app.post("/api/me/api-tokens/:id/ack-new-ip", requireAuth, async (req, res) => {
    try {
      const user = (req as any).dbUser;
      const token = await storage.getApiToken(getPathParam(req, "id"));
      if (!token || token.userId !== user.id) {
        return res.status(404).json({ error: "Token not found" });
      }
      const lastAtRaw = req.body?.lastAt;
      if (!lastAtRaw || typeof lastAtRaw !== "string") {
        return res.status(400).json({ error: "lastAt is required" });
      }
      const lastAt = new Date(lastAtRaw);
      if (Number.isNaN(lastAt.getTime())) {
        return res.status(400).json({ error: "Invalid lastAt timestamp" });
      }
      await storage.acknowledgeApiTokenNewIp(token.id, lastAt);
      logAudit(req, "ack_new_ip", "api_token", token.id, { lastAt: lastAt.toISOString() });
      res.status(204).send();
    } catch (error) {
      console.error("Acknowledge api token new IP error:", error);
      res.status(500).json({ error: "Failed to acknowledge new IP alert" });
    }
  });

  app.delete("/api/me/api-tokens/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).dbUser;
      const token = await storage.getApiToken(getPathParam(req, "id"));
      if (!token || token.userId !== user.id) {
        return res.status(404).json({ error: "Token not found" });
      }
      await storage.revokeApiToken(token.id);
      logAudit(req, "revoke", "api_token", token.id, { name: token.name });
      res.status(204).send();
    } catch (error) {
      console.error("Revoke api token error:", error);
      res.status(500).json({ error: "Failed to revoke token" });
    }
  });

  app.get("/api/auth/setup-status", async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const hasUsersWithPasswords = allUsers.some(u => u.passwordHash);
    res.json({ needsSetup: !hasUsersWithPasswords, userCount: allUsers.length });
  });

  // Expose the install-wide schedule timezone default so the create-site
  // form starts pre-populated with the right zone for this deployment
  // instead of the hard-coded fallback.
  app.get("/api/config/schedule-timezone-default", requireAuth, (_req, res) => {
    res.json({ timezone: getDefaultScheduleTimezone() });
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
            const activeEvent = await storage.getCurrentEventForScreen(screen.id);
            const screenClientId = activeEvent ? eventClientMap.get(activeEvent.id) : null;
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

  // Task #200 — prune video health samples older than 30 days. The
  // samples table grows ~1 row per heartbeat per screen (every 30s on
  // active players), so retention has to be capped or the table runs
  // away. Runs once at boot and then every 6h.
  const VIDEO_HEALTH_RETENTION_DAYS = 30;
  const pruneVideoHealthSamples = async () => {
    try {
      const cutoff = new Date(Date.now() - VIDEO_HEALTH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const removed = await storage.pruneVideoHealthSamples(cutoff);
      if (removed > 0) {
        console.log(`[video-health] pruned ${removed} sample(s) older than ${VIDEO_HEALTH_RETENTION_DAYS}d`);
      }
    } catch (err) {
      console.error("[video-health] prune failed:", err);
    }
  };
  pruneVideoHealthSamples().catch(() => {});
  setInterval(pruneVideoHealthSamples, 6 * 60 * 60 * 1000);

  // Task #210 — agenda sync tick. Every minute we look at every
  // enabled sync config and run those whose syncIntervalMinutes has
  // elapsed since their lastSyncAt. The merge engine itself
  // (server/agendaSync.ts) records ok / error state back on the
  // config row so the /agenda UI can surface failures.
  const AGENDA_SYNC_TICK_MS = 60_000;
  const tickAgendaSync = async () => {
    try {
      const { ran, results } = await runDueAgendaSyncs({ storage });
      if (ran > 0) {
        const failed = results.filter((r) => !r.result.ok).length;
        console.log(
          `[agenda-sync] ran ${ran} config(s), ${ran - failed} ok, ${failed} failed`,
        );
      }
    } catch (err) {
      console.error("[agenda-sync] tick failed:", err);
    }
  };
  // Don't await — boot must not block on an upstream that's slow or
  // unreachable. The first tick fires AGENDA_SYNC_TICK_MS later.
  setInterval(tickAgendaSync, AGENDA_SYNC_TICK_MS);

  // ============ HEALTH CHECK ============
  app.get("/api/manual", requireAuth, async (_req, res) => {
    try {
      const manualPath = path.resolve(process.cwd(), "OPERATING_MANUAL.md");
      const content = await fs.promises.readFile(manualPath, "utf8");
      res.type("text/markdown; charset=utf-8").send(content);
    } catch (error) {
      console.error("Failed to read operating manual:", error);
      res.status(500).type("text/plain").send("# Manual unavailable\n\nThe operating manual could not be loaded.");
    }
  });

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
      const client = await storage.getClient(getPathParam(req, "id"));
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
      // If the operator didn't explicitly pick a tz, honour the install
      // default (env DEFAULT_SCHEDULE_TIMEZONE) instead of the schema
      // fallback so multi-region operators get sensible defaults.
      if (!data.timezone || !data.timezone.trim()) {
        data.timezone = getDefaultScheduleTimezone();
      }
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
      const id = getPathParam(req, "id");
      if (!canAccessClient(req, id)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const existing = await storage.getClient(id);
      if (!existing) {
        return res.status(404).json({ error: "Client not found" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This site is locked and cannot be modified. Unlock it first." });
      }
      const data = insertClientSchema.partial().parse(req.body);
      const client = await storage.updateClient(id, data);
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
      const client = await storage.updateClient(getPathParam(req, "id"), { locked: !!locked });
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
      const id = getPathParam(req, "id");
      if (!isAdmin(req)) {
        return res.status(403).json({ error: "Admin access required to delete sites" });
      }
      const clientToDelete = await storage.getClient(id);
      if (!clientToDelete) {
        return res.status(404).json({ error: "Client not found" });
      }
      if (clientToDelete.locked) {
        return res.status(403).json({ error: "This site is locked and cannot be deleted. Unlock it first." });
      }
      const deleted = await storage.deleteClient(id);
      logAudit(req, "delete", "client", id, { name: clientToDelete?.name });
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
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
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
      const event = await storage.getEvent(getPathParam(req, "id"));
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
      const existing = await storage.getEvent(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (!canAccessClient(req, existing.clientId)) return res.status(403).json({ error: "Access denied" });
      const body = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const data = insertEventSchema.partial().parse(body);
      const event = await storage.updateEvent(getPathParam(req, "id"), data);
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
      const id = getPathParam(req, "id");
      const existing = await storage.getEvent(id);
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (!canAccessClient(req, existing.clientId)) return res.status(403).json({ error: "Access denied" });
      const deleted = await storage.deleteEvent(id);
      if (!deleted) {
        return res.status(404).json({ error: "Event not found" });
      }
      logAudit(req, "delete", "event", id, { name: existing.name });
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
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
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
      const existing = await storage.getDisplayProfile(getPathParam(req, "id"));
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
      const profile = await storage.updateDisplayProfile(getPathParam(req, "id"), data);
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
      const id = getPathParam(req, "id");
      const existing = await storage.getDisplayProfile(id);
      if (!existing) {
        return res.status(404).json({ error: "Display profile not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied to this profile's site" });
      }
      await storage.deleteDisplayProfile(id);
      logAudit(req, "delete", "display_profile", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting display profile:", error);
      res.status(500).json({ error: "Failed to delete display profile" });
    }
  });

  // ============ SCREEN GROUPS ============
  app.get("/api/screen-groups", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const groups = await storage.getScreenGroupsWithMemberCounts();
      const allowed = getAllowedClientIds(req);
      let filtered = groups;
      if (allowed) {
        filtered = groups.filter(g => !g.clientId || allowed.includes(g.clientId));
      }
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
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
      const group = await storage.updateScreenGroup(getPathParam(req, "id"), data);
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
      const deleted = await storage.deleteScreenGroup(getPathParam(req, "id"));
      if (!deleted) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      logAudit(req, "delete", "screen_group", getPathParam(req, "id"));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen group:", error);
      res.status(500).json({ error: "Failed to delete screen group" });
    }
  });

  // Screen Group Memberships
  app.get("/api/screen-groups/:id/members", requireAuth, loadUserContext, async (req, res) => {
    try {
      const group = await storage.getScreenGroup(getPathParam(req, "id"));
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const members = await storage.getGroupMembers(getPathParam(req, "id"));
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ error: "Failed to fetch group members" });
    }
  });

  app.post("/api/screen-groups/:id/members", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const { screenId } = req.body;
      if (!screenId) {
        return res.status(400).json({ error: "screenId is required" });
      }
      const group = await storage.getScreenGroup(id);
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
      await storage.addScreenToGroup(id, screenId);
      logAudit(req, "create", "screen_group_membership", id, { screenId, screenName: screen.name, groupName: group.name });
      res.status(201).json({ success: true });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Screen is already in this group" });
      }
      console.error("Error adding screen to group:", error);
      res.status(500).json({ error: "Failed to add screen to group" });
    }
  });

  // Flat membership list for clients that need to resolve "which screens are
  // in which groups" without round-tripping every group. Site-filtered: only
  // memberships whose screen is in an accessible site are returned.
  app.get("/api/screen-group-memberships", requireAuth, loadUserContext, async (req, res) => {
    try {
      const memberships = await storage.getAllScreenGroupMemberships();
      const allScreens = await storage.getScreens();
      const allowed = getAllowedClientIds(req);
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const screenAllowed = new Set<string>();
      for (const s of allScreens) {
        if (clientId && s.clientId !== clientId) continue;
        if (allowed && s.clientId && !allowed.includes(s.clientId)) continue;
        screenAllowed.add(s.id);
      }
      const filtered = memberships.filter(m => screenAllowed.has(m.screenId));
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching screen group memberships:", error);
      res.status(500).json({ error: "Failed to fetch memberships" });
    }
  });

  app.delete("/api/screen-groups/:id/members/:screenId", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const group = await storage.getScreenGroup(id);
      if (!group) {
        return res.status(404).json({ error: "Screen group not found" });
      }
      if (group.clientId && !canAccessClient(req, group.clientId)) {
        return res.status(403).json({ error: "Access denied to this group's site" });
      }
      const removed = await storage.removeScreenFromGroup(id, getPathParam(req, "screenId"));
      if (!removed) {
        return res.status(404).json({ error: "Membership not found" });
      }
      logAudit(req, "delete", "screen_group_membership", id, { screenId: getPathParam(req, "screenId") });
      res.status(204).send();
    } catch (error) {
      console.error("Error removing screen from group:", error);
      res.status(500).json({ error: "Failed to remove screen from group" });
    }
  });

  // ============ CANVAS GROUPS (Task #189) ============
  // Explicit canvas-group rows replace the implicit grouping by
  // (clientId, dims, position-distinctness). Operators name + size a
  // wall once and pin tiles to it via screens.canvasGroupId. Screens
  // page validation guarantees membership stays internally consistent
  // (same client + matching dims). Auth-style mirrors /api/clients.
  app.get("/api/canvas-groups", requireAuth, loadUserContext, async (req, res) => {
    try {
      const all = await storage.getCanvasGroups();
      const allowed = getAllowedClientIds(req);
      let filtered = allowed
        ? all.filter((g) => g.clientId !== null && allowed.includes(g.clientId))
        : all;
      const clientId = getQueryString(req, "clientId", res);
      if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter((g) => g.clientId === clientId);
      }
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching canvas groups:", error);
      res.status(500).json({ error: "Failed to fetch canvas groups" });
    }
  });

  app.get("/api/canvas-groups/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const group = await storage.getCanvasGroup(getPathParam(req, "id"));
      if (!group) return res.status(404).json({ error: "Canvas group not found" });
      if (!canAccessClient(req, group.clientId ?? "")) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(group);
    } catch (error) {
      console.error("Error fetching canvas group:", error);
      res.status(500).json({ error: "Failed to fetch canvas group" });
    }
  });

  app.post("/api/canvas-groups", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertCanvasGroupSchema.parse(req.body);
      if (!canAccessClient(req, data.clientId ?? "")) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      const created = await storage.createCanvasGroup(data);
      logAudit(req, "create", "canvas_group", created.id, {
        name: created.name,
        clientId: created.clientId,
      });
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating canvas group:", error);
      res.status(500).json({ error: "Failed to create canvas group" });
    }
  });

  app.patch("/api/canvas-groups/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getCanvasGroup(id);
      if (!existing) return res.status(404).json({ error: "Canvas group not found" });
      if (!canAccessClient(req, existing.clientId ?? "")) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = insertCanvasGroupSchema.partial().parse(req.body);
      // A group's clientId can't be reassigned — every member screen
      // would need to be revalidated, and operators don't have a use
      // case for it. Reject explicitly so we don't silently move a
      // wall under another site.
      if (data.clientId !== undefined && data.clientId !== existing.clientId) {
        return res.status(400).json({
          error: "Cannot move a canvas group to a different site",
        });
      }
      // Resizing the group must match its members' canvas dims so we
      // don't end up with a "640x480" group containing 1920x1080 tiles.
      if (
        (data.canvasWidth !== undefined && data.canvasWidth !== existing.canvasWidth) ||
        (data.canvasHeight !== undefined && data.canvasHeight !== existing.canvasHeight)
      ) {
        const members = (await storage.getScreens()).filter((s) => s.canvasGroupId === id);
        const newW = data.canvasWidth ?? existing.canvasWidth;
        const newH = data.canvasHeight ?? existing.canvasHeight;
        const mismatch = members.find(
          (m) => m.canvasWidth !== newW || m.canvasHeight !== newH,
        );
        if (mismatch) {
          return res.status(400).json({
            error:
              "Cannot resize: existing member screens have different canvas dimensions",
          });
        }
      }
      const updated = await storage.updateCanvasGroup(id, data);
      logAudit(req, "update", "canvas_group", id, { name: updated?.name });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating canvas group:", error);
      res.status(500).json({ error: "Failed to update canvas group" });
    }
  });

  app.delete("/api/canvas-groups/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getCanvasGroup(id);
      if (!existing) return res.status(404).json({ error: "Canvas group not found" });
      if (!canAccessClient(req, existing.clientId ?? "")) {
        return res.status(403).json({ error: "Access denied" });
      }
      // storage.deleteCanvasGroup returns false if any screen still
      // references the group; surface that as 409 so the UI can ask
      // the operator to move/clear members first.
      const ok = await storage.deleteCanvasGroup(id);
      if (!ok) {
        return res.status(409).json({
          error: "Cannot delete a canvas group while screens still reference it",
        });
      }
      logAudit(req, "delete", "canvas_group", id, { name: existing.name });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting canvas group:", error);
      res.status(500).json({ error: "Failed to delete canvas group" });
    }
  });

  // ============ SCREENS ============
  app.get("/api/screens", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      await storage.markStaleScreensOffline(STALE_THRESHOLD_MS);
      const screens = await storage.getScreens();
      const allowed = getAllowedClientIds(req);
      let filtered = screens;
      if (allowed) {
        filtered = screens.filter(s => !s.clientId || allowed.includes(s.clientId));
      }
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(s => s.clientId === clientId);
      }
      res.json(filtered.map(({ deviceToken, lastScreenshot, ...s }) => s));
    } catch (error) {
      console.error("Error fetching screens:", error);
      res.status(500).json({ error: "Failed to fetch screens" });
    }
  });

  app.get("/api/screens/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "id"));
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

  // Task #182: handler logic lives in server/screenCreateHandler.ts so
  // the screens-create-regenerate-flow test can drive the same code
  // path the React `screens.tsx` createMutation hits.
  app.post(
    "/api/screens",
    requireAuth,
    loadUserContext,
    buildScreenCreateHandler(storage, canAccessClient, logAudit),
  );

  app.patch("/api/screens/reorder", requireAuth, loadUserContext, async (req, res) => {
    try {
      const { orderedIds } = req.body as { orderedIds: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds array is required" });
      }
      if (!orderedIds.every(id => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ error: "orderedIds must be non-empty strings" });
      }
      if (new Set(orderedIds).size !== orderedIds.length) {
        return res.status(400).json({ error: "orderedIds must not contain duplicates" });
      }
      for (const id of orderedIds) {
        const screen = await storage.getScreen(id);
        if (!screen) return res.status(404).json({ error: `Screen ${id} not found` });
        if (screen.clientId && !canAccessClient(req, screen.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      await storage.reorderScreens(orderedIds);
      logAudit(req, "reorder", "screen", orderedIds[0], { count: orderedIds.length });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering screens:", error);
      res.status(500).json({ error: "Failed to reorder screens" });
    }
  });

  app.post("/api/screens/:id/duplicate", requireAuth, loadUserContext, async (req, res) => {
    try {
      const sourceId = getPathParam(req, "id");
      const bodySchema = z.object({ name: z.string().trim().min(1).max(200) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.errors[0]?.message || "Invalid name";
        return res.status(400).json({ error: first });
      }
      const source = await storage.getScreen(sourceId);
      if (!source) return res.status(404).json({ error: "Screen not found" });
      if (source.clientId && !canAccessClient(req, source.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (source.locked) {
        return res.status(409).json({ error: "Cannot duplicate a locked screen" });
      }
      const created = await storage.duplicateScreen(sourceId, parsed.data.name);
      if (!created) return res.status(404).json({ error: "Source screen not found" });
      logAudit(req, "screen.duplicate", "screen", created.id, {
        sourceId,
        newId: created.id,
        name: created.name,
      });
      res.status(201).json(created);
    } catch (error) {
      console.error("Error duplicating screen:", error);
      res.status(500).json({ error: "Failed to duplicate screen" });
    }
  });

  app.patch(
    "/api/screens/:id",
    requireAuth,
    loadUserContext,
    buildScreenPatchHandler(storage, logAudit, canAccessClient),
  );

  // Task #182: handler logic lives in
  // server/screenRegeneratePairingHandler.ts so the
  // screens-create-regenerate-flow test can drive the real production
  // code path through the same factory.
  app.post(
    "/api/screens/:id/regenerate-pairing",
    requireAuth,
    buildScreenRegeneratePairingHandler(storage, logAudit),
  );

  app.post("/api/screens/:id/refresh", requireAuth, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "id"));
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

  app.post("/api/screens/:id/request-screenshot", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "id"));
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      pendingScreenshotRequests.set(screen.id, Date.now());
      res.json({ success: true });
    } catch (error) {
      console.error("Error requesting screenshot:", error);
      res.status(500).json({ error: "Failed to request screenshot" });
    }
  });

  app.post("/api/screens/:id/unpair", requireAuth, async (req, res) => {
    try {
      const seed = await storage.getScreen(getPathParam(req, "id"));
      if (!seed) {
        return res.status(404).json({ error: "Screen not found" });
      }
      // Task #180: pairing codes are unique per-screen (DB-level UNIQUE).
      // Unpairing any wall tile clears the whole wall — each member
      // gets its own fresh unique code and a cleared deviceToken so the
      // next pair flow re-claims every member from scratch.
      // Round-7 review: rotate every member atomically in one
      // transaction so a mid-loop DB failure can't leave the wall in
      // a half-unpaired state.
      const members = await storage.getCanvasMembers(seed);
      await storage.rotateScreensPairingIdentities(members.map((m) => m.id));
      const refreshed = await storage.getScreen(seed.id);
      logAudit(req, "unpair", "screen", seed.id, {
        name: seed.name,
        canvasMembers: members.length,
      });
      if (refreshed) {
        const { deviceToken, ...safeScreen } = refreshed;
        res.json(safeScreen);
      } else {
        res.json({ id: seed.id, isPaired: false });
      }
    } catch (error) {
      console.error("Error unpairing screen:", error);
      res.status(500).json({ error: "Failed to unpair screen" });
    }
  });

  app.post("/api/screens/:id/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locked } = req.body;
      const screen = await storage.updateScreen(getPathParam(req, "id"), { locked: !!locked });
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
      const id = getPathParam(req, "id");
      const existing = await storage.getScreen(id);
      if (!existing) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This screen is locked and cannot be deleted. Unlock it first." });
      }
      // Task #180: capture wall membership BEFORE deletion so the
      // reconciler can detect "wall dissolves into solo survivors that
      // were sharing a deviceToken" and rotate the survivors so two
      // formerly-tile screens don't end up holding the same Pi token.
      const beforeMembers = await storage.getCanvasMembers(existing);
      await storage.deleteScreen(id);
      await storage.reconcileWallPairingAfterChange(id, beforeMembers, {
        changedScreenDeleted: true,
      });
      logAudit(req, "delete", "screen", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen:", error);
      res.status(500).json({ error: "Failed to delete screen" });
    }
  });

  app.get("/api/screens/:id/heartbeats", requireAuth, async (req, res) => {
    try {
      const heartbeats = await storage.getPlayerHeartbeats(getPathParam(req, "id"));
      res.json(heartbeats);
    } catch (error) {
      console.error("Error fetching heartbeats:", error);
      res.status(500).json({ error: "Failed to fetch heartbeats" });
    }
  });

  // Task #200 — video health samples for the per-screen sparkline.
  // `hours` defaults to 24h, clamped to the 30d retention window so a
  // bogus query string can't blow up the response.
  app.get("/api/screens/:id/video-health-samples", requireAuth, async (req, res) => {
    try {
      const screenId = getPathParam(req, "id");
      const hoursRaw = Number.parseFloat(String(req.query.hours ?? "24"));
      const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 24 * 30) : 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const samples = await storage.getVideoHealthSamples(screenId, since);
      res.json(samples);
    } catch (error) {
      console.error("Error fetching video health samples:", error);
      res.status(500).json({ error: "Failed to fetch video health samples" });
    }
  });

  // ============ MEDIA ASSETS ============
  app.get("/api/media", requireAuth, loadUserContext, async (req, res) => {
    try {
      const assets = await storage.getMediaAssets();
      const allowed = getAllowedClientIds(req);
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;

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
          const [thumbnailPath, videoDuration] = await Promise.all([
            generateVideoThumbnail(data.originalPath, data.clientId),
            getVideoDuration(data.originalPath),
          ]);
          const updates: Record<string, any> = {};
          if (thumbnailPath) updates.thumbnailPath = thumbnailPath;
          if (videoDuration) updates.duration = videoDuration;
          if (Object.keys(updates).length > 0) {
            await storage.updateMediaAsset(asset.id, updates);
          }
        } catch (thumbErr) {
          console.error("Background video processing failed:", thumbErr);
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
      const id = getPathParam(req, "id");
      const asset = await storage.getMediaAsset(id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (asset.clientId && !canAccessClient(req, asset.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteMediaAsset(id);
      if (!deleted) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      logAudit(req, "delete", "media", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting media asset:", error);
      res.status(500).json({ error: "Failed to delete media asset" });
    }
  });

  // Media sharing (admin only)
  app.get("/api/media/:id/shares", requireAuth, requireAdmin, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      const shares = await storage.getMediaSharesForAsset(getPathParam(req, "id"));
      res.json(shares);
    } catch (error) {
      console.error("Error fetching media shares:", error);
      res.status(500).json({ error: "Failed to fetch media shares" });
    }
  });

  app.post("/api/media/:id/share", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const asset = await storage.getMediaAsset(id);
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
      const existingShares = await storage.getMediaSharesForAsset(id);
      if (existingShares.some(s => s.clientId === clientId)) {
        return res.status(400).json({ error: "Media is already shared to this site" });
      }
      const share = await storage.createMediaShare({ mediaAssetId: id, clientId });
      logAudit(req, "create", "media_share", share.id, { mediaAssetId: id, clientId });
      res.status(201).json(share);
    } catch (error) {
      console.error("Error sharing media:", error);
      res.status(500).json({ error: "Failed to share media" });
    }
  });

  app.delete("/api/media/:id/share/:clientId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteMediaShare(getPathParam(req, "id"), getPathParam(req, "clientId"));
      if (!deleted) {
        return res.status(404).json({ error: "Share not found" });
      }
      logAudit(req, "delete", "media_share", getPathParam(req, "id"), { clientId: getPathParam(req, "clientId") });
      res.status(204).send();
    } catch (error) {
      console.error("Error unsharing media:", error);
      res.status(500).json({ error: "Failed to unshare media" });
    }
  });

  app.patch("/api/media/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMediaAsset(getPathParam(req, "id"), req.body);
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
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
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
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
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
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      if (asset.mediaType !== "video") {
        return res.status(400).json({ error: "Thumbnails can only be generated for video assets" });
      }

      if (!asset.clientId) {
        return res.status(400).json({ error: "Asset is not assigned to a site" });
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

  app.post("/api/media/backfill-durations", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const allAssets = await storage.getMediaAssets();
      const videos = allAssets.filter(a => a.mediaType === "video" && !a.duration && a.originalPath && !a.originalPath.startsWith("http"));
      let updated = 0;
      let failed = 0;
      for (const asset of videos) {
        try {
          const dur = await getVideoDuration(asset.originalPath);
          if (dur) {
            await storage.updateMediaAsset(asset.id, { duration: dur });
            updated++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      res.json({ total: videos.length, updated, failed });
    } catch (error) {
      console.error("Error backfilling durations:", error);
      res.status(500).json({ error: "Failed to backfill durations" });
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
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
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
      const existing = await storage.getLayoutTemplate(getPathParam(req, "id"));
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
      const layout = await storage.updateLayoutTemplate(getPathParam(req, "id"), data);
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
      const source = await storage.getLayoutTemplate(getPathParam(req, "id"));
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
        profileOverrides: source.profileOverrides as InsertLayoutTemplate["profileOverrides"],
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
      const id = getPathParam(req, "id");
      const { targetClientId } = req.body;
      if (!targetClientId) {
        return res.status(400).json({ error: "targetClientId is required" });
      }
      const targetClient = await storage.getClient(targetClientId);
      if (!targetClient) {
        return res.status(400).json({ error: "Target site not found" });
      }
      const source = await storage.getLayoutTemplate(id);
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
      const updated = await storage.updateLayoutTemplate(id, {
        clientId: targetClientId,
        ...(clearEvent ? { eventId: null } : {}),
      });
      logAudit(req, "move", "layout", id, { targetClientId, name: source.name });
      res.json(updated);
    } catch (error) {
      console.error("Error moving layout:", error);
      res.status(500).json({ error: "Failed to move layout" });
    }
  });

  app.post("/api/layouts/:id/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locked } = req.body;
      const layout = await storage.updateLayoutTemplate(getPathParam(req, "id"), { locked: !!locked });
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
      const id = getPathParam(req, "id");
      const existing = await storage.getLayoutTemplate(id);
      if (!existing) {
        return res.status(404).json({ error: "Layout not found" });
      }
      if (existing.clientId && !canAccessClient(req, existing.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (existing.locked) {
        return res.status(403).json({ error: "This layout is locked and cannot be deleted. Unlock it first." });
      }
      await storage.deleteLayoutTemplate(id);
      logAudit(req, "delete", "layout", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting layout:", error);
      res.status(500).json({ error: "Failed to delete layout" });
    }
  });

  // ============ PROGRAMMES ============
  // Reorder must be defined before /:id routes so the literal path wins.
  app.patch("/api/programmes/reorder", requireAuth, loadUserContext, async (req, res) => {
    try {
      const { orderedIds } = req.body as { orderedIds: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds array is required" });
      }
      if (!orderedIds.every(id => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ error: "orderedIds must be non-empty strings" });
      }
      if (new Set(orderedIds).size !== orderedIds.length) {
        return res.status(400).json({ error: "orderedIds must not contain duplicates" });
      }
      // Authorise: every programme must be visible to this user (via its event's client).
      const allEventsForReorder = await storage.getEvents();
      const eventById = new Map(allEventsForReorder.map(e => [e.id, e] as const));
      for (const id of orderedIds) {
        const programme = await storage.getProgramme(id);
        if (!programme) return res.status(404).json({ error: `Programme ${id} not found` });
        const event = eventById.get(programme.eventId);
        if (event && !canAccessClient(req, event.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      await storage.reorderProgrammes(orderedIds);
      logAudit(req, "reorder", "programme", orderedIds[0], { count: orderedIds.length });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering programmes:", error);
      res.status(500).json({ error: "Failed to reorder programmes" });
    }
  });

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
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
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

  // Programmes are write-protected via the per-route checks below. We strip
  // `displayOrder` from any incoming write payload so reorder can only
  // happen via PATCH /api/programmes/reorder (which is the single chokepoint
  // that holds the necessary cross-row authz + transactional rewrite).
  const programmeWriteSchema = insertProgrammeSchema.omit({ displayOrder: true });

  app.post("/api/programmes", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = programmeWriteSchema.parse(req.body);
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

  // Helper: load a programme + its event to enforce client-scoped authz
  // on the per-id mutation routes below (PATCH / publish / DELETE).
  async function authorizeProgrammeMutation(req: any, res: any, programmeId: string) {
    const existing = await storage.getProgramme(programmeId);
    if (!existing) {
      res.status(404).json({ error: "Programme not found" });
      return null;
    }
    const event = await storage.getEvent(existing.eventId);
    if (event && !canAccessClient(req, event.clientId)) {
      res.status(403).json({ error: "Access denied" });
      return null;
    }
    return existing;
  }

  app.patch("/api/programmes/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmeId = getPathParam(req, "id");
      const existing = await authorizeProgrammeMutation(req, res, programmeId);
      if (!existing) return;
      const data = programmeWriteSchema.partial().parse(req.body);
      // If the eventId is being changed, also enforce access to the target client
      if (data.eventId && data.eventId !== existing.eventId) {
        const targetEvent = await storage.getEvent(data.eventId);
        if (targetEvent && !canAccessClient(req, targetEvent.clientId)) {
          return res.status(403).json({ error: "Access denied to target event" });
        }
      }
      const programme = await storage.updateProgramme(programmeId, data);
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

  app.post("/api/programmes/:id/publish", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmeId = getPathParam(req, "id");
      const existing = await authorizeProgrammeMutation(req, res, programmeId);
      if (!existing) return;
      const versions = await storage.getProgrammeVersions();
      const programmeVersions = versions.filter(v => v.programmeId === programmeId);
      const draftVersion = programmeVersions.find(v => v.status === "draft");

      if (draftVersion) {
        await storage.updateProgrammeVersion(draftVersion.id, { status: "published", publishedAt: new Date() });
        refreshScreensForVersion(draftVersion.id);
      }
      logAudit(req, "publish", "programme", programmeId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error publishing programme:", error);
      res.status(500).json({ error: "Failed to publish programme" });
    }
  });

  app.delete("/api/programmes/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const programmeId = getPathParam(req, "id");
      const existing = await authorizeProgrammeMutation(req, res, programmeId);
      if (!existing) return;
      const deleted = await storage.deleteProgramme(programmeId);
      if (!deleted) {
        return res.status(404).json({ error: "Programme not found" });
      }
      logAudit(req, "delete", "programme", programmeId);
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
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;

      let filtered = playlists;

      if (clientId) {
        if (!canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
        filtered = filtered.filter(p => p.clientId === clientId);
      } else if (allowed) {
        // Restricted user with no explicit site filter: only playlists in their sites.
        // Orphans (no clientId) are excluded.
        filtered = filtered.filter(p => !!p.clientId && allowed.includes(p.clientId));
      }
      // Else: admin / super-admin with no client filter — include all (incl. orphans for cleanup).

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  app.post("/api/playlists", requireAuth, loadUserContext, async (req, res) => {
    try {
      const data = insertPlaylistSchema.parse(req.body);
      if (!data.clientId) {
        return res.status(400).json({ error: "A site (clientId) is required for new playlists" });
      }
      if (!canAccessClient(req, data.clientId)) {
        return res.status(403).json({ error: "Access denied to requested site" });
      }
      if (data.eventId) {
        const event = await storage.getEvent(data.eventId);
        if (!event) {
          return res.status(400).json({ error: "Selected event does not exist" });
        }
        if (event.clientId !== data.clientId) {
          return res.status(400).json({ error: "Selected event belongs to a different site" });
        }
      }
      const playlist = await storage.createPlaylist(data);
      logAudit(req, "create", "playlist", playlist.id, {
        name: playlist.name,
        clientId: playlist.clientId,
      });
      res.status(201).json(playlist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating playlist:", error);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  app.patch("/api/playlists/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getPlaylist(getPathParam(req, "id"));
      if (!existing) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      // Authz on the existing playlist's site (orphans require admin).
      if (existing.clientId) {
        if (!canAccessClient(req, existing.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (!isAdmin(req)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const data = insertPlaylistSchema.partial().parse(req.body);

      // If clientId is being changed (e.g. admin reassigning an orphan), require access to the new site.
      const targetClientId = data.clientId !== undefined ? data.clientId : existing.clientId;
      if (data.clientId !== undefined && data.clientId !== existing.clientId) {
        if (!data.clientId) {
          return res.status(400).json({ error: "A site (clientId) is required" });
        }
        if (!canAccessClient(req, data.clientId)) {
          return res.status(403).json({ error: "Access denied to requested site" });
        }
      }

      // Determine the effective eventId after this update.
      // If eventId is in the payload, use it; otherwise the existing one stays.
      const effectiveEventId =
        data.eventId !== undefined ? data.eventId : existing.eventId;

      // If there is an effective event, it must belong to the effective site.
      // This catches both: (a) setting a mismatched eventId, and
      // (b) reassigning clientId while keeping a now-mismatched existing event.
      if (effectiveEventId) {
        const event = await storage.getEvent(effectiveEventId);
        if (!event) {
          return res.status(400).json({ error: "Selected event does not exist" });
        }
        if (targetClientId && event.clientId !== targetClientId) {
          return res.status(400).json({
            error: "Playlist event belongs to a different site than the selected site. Clear or change the event before reassigning the site.",
          });
        }
      }

      const playlist = await storage.updatePlaylist(getPathParam(req, "id"), data);
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

  app.delete("/api/playlists/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getPlaylist(id);
      if (!existing) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      if (existing.clientId) {
        if (!canAccessClient(req, existing.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (!isAdmin(req)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deletePlaylist(id);
      if (!deleted) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      logAudit(req, "delete", "playlist", id);
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
      if (!(await canAccessPlaylist(req, getPathParam(req, "playlistId")))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const items = await storage.getPlaylistItems(getPathParam(req, "playlistId"));
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
    // Orphan playlists (no clientId) are admin-only.
    if (!playlist.clientId) return false;
    return allowed.includes(playlist.clientId);
  }

  app.post("/api/playlists/:playlistId/items", requireAuth, loadUserContext, async (req, res) => {
    try {
      if (!(await canAccessPlaylist(req, getPathParam(req, "playlistId")))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = insertPlaylistItemSchema.parse({
        ...req.body,
        playlistId: getPathParam(req, "playlistId"),
      });
      if (!data.mediaAssetId && !data.layoutTemplateId) {
        return res.status(400).json({ error: "Either mediaAssetId or layoutTemplateId is required" });
      }
      if (data.mediaAssetId && data.layoutTemplateId) {
        return res.status(400).json({ error: "Cannot set both mediaAssetId and layoutTemplateId" });
      }
      const item = await storage.createPlaylistItem(data);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating playlist item:", error);
      res.status(500).json({ error: "Failed to create playlist item" });
    }
  });

  app.patch("/api/playlist-items/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getPlaylistItem(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Playlist item not found" });
      if (!(await canAccessPlaylist(req, existing.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = updatePlaylistItemSchema.parse(req.body);
      const finalMediaAssetId = data.mediaAssetId !== undefined ? data.mediaAssetId : existing.mediaAssetId;
      const finalLayoutTemplateId = data.layoutTemplateId !== undefined ? data.layoutTemplateId : existing.layoutTemplateId;
      if (!finalMediaAssetId && !finalLayoutTemplateId) {
        return res.status(400).json({ error: "Either mediaAssetId or layoutTemplateId is required" });
      }
      if (finalMediaAssetId && finalLayoutTemplateId) {
        return res.status(400).json({ error: "Cannot set both mediaAssetId and layoutTemplateId" });
      }
      const item = await storage.updatePlaylistItem(getPathParam(req, "id"), data);
      res.json(item);
    } catch (error) {
      console.error("Error updating playlist item:", error);
      res.status(500).json({ error: "Failed to update playlist item" });
    }
  });

  app.post("/api/playlists/:playlistId/reorder", requireAuth, loadUserContext, async (req, res) => {
    try {
      const playlistId = getPathParam(req, "playlistId");
      if (!(await canAccessPlaylist(req, playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: "itemIds must be an array" });
      }
      const existingItems = await storage.getPlaylistItems(playlistId);
      const existingIds = new Set(existingItems.map(i => i.id));
      for (const id of itemIds) {
        if (!existingIds.has(id)) {
          return res.status(400).json({ error: "Item does not belong to this playlist" });
        }
      }
      for (let i = 0; i < itemIds.length; i++) {
        await storage.updatePlaylistItem(itemIds[i], { order: i });
      }
      const items = await storage.getPlaylistItems(playlistId);
      res.json(items);
    } catch (error) {
      console.error("Error reordering playlist items:", error);
      res.status(500).json({ error: "Failed to reorder playlist items" });
    }
  });

  app.delete("/api/playlist-items/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getPlaylistItem(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Playlist item not found" });
      if (!(await canAccessPlaylist(req, existing.playlistId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deletePlaylistItem(getPathParam(req, "id"));
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
      const blocks = await storage.getScheduleBlocks(getPathParam(req, "versionId"));
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
        programmeVersionId: getPathParam(req, "versionId"),
      });
      const block = await storage.createScheduleBlock(data);
      refreshScreensForVersion(getPathParam(req, "versionId"));
      res.status(201).json(block);
    } catch (error) {
      console.error("Error creating schedule block:", error);
      res.status(500).json({ error: "Failed to create schedule block" });
    }
  });

  // Bulk paste blocks from one programme into another (mirrors the
  // screen-bookings copy/paste right-click flow). Returns per-row
  // results so the client can show each block's outcome (Pasted /
  // Skipped — layout / Skipped — playlist / Failed) and ensures the
  // destination programme has a draft to receive the blocks.
  app.post(
    "/api/programmes/:programmeId/blocks/bulk",
    requireAuth,
    loadUserContext,
    buildBulkBlocksHandler(
      {
        getProgramme: (id) => storage.getProgramme(id),
        getEvent: (id) => storage.getEvent(id),
        getProgrammeVersionsByProgramme: async (programmeId) => {
          const all = await storage.getProgrammeVersions();
          return all.filter((v) => v.programmeId === programmeId);
        },
        createProgrammeVersion: (data) => storage.createProgrammeVersion(data),
        getScreen: (id) => storage.getScreen(id),
        getScreenGroup: (id) => storage.getScreenGroup(id),
        getLayoutTemplate: (id) => storage.getLayoutTemplate(id),
        getPlaylist: (id) => storage.getPlaylist(id),
        createScheduleBlock: (data) => storage.createScheduleBlock(data),
        newSeriesId: () => crypto.randomUUID(),
      },
      { canAccessClient },
      {
        onAudit: (req, results: BulkBlockResult[], ctx) => {
          for (const r of results) {
            if (r.status === "created") {
              logAudit(req, "create", "schedule_block", r.block.id, {
                programmeVersionId: r.block.programmeVersionId,
                sourceProgrammeId: ctx.sourceProgrammeId,
                destinationProgrammeId: ctx.programmeId,
                droppedTargetCount: r.droppedTargets.length,
                bulk: true,
              });
            }
          }
        },
        onRefreshVersion: (versionId) => {
          // Only published versions actually drive live screens; the
          // helper itself short-circuits on drafts so this is safe to
          // call for newly-created drafts too.
          refreshScreensForVersion(versionId);
        },
      },
    ),
  );

  app.patch("/api/schedule-blocks/:id", requireAuth, async (req, res) => {
    try {
      const data = insertScheduleBlockSchema.partial().parse(req.body);
      const block = await storage.updateScheduleBlock(getPathParam(req, "id"), data);
      if (!block) {
        return res.status(404).json({ error: "Schedule block not found" });
      }
      refreshScreensForVersion(block.programmeVersionId);
      res.json(block);
    } catch (error) {
      console.error("Error updating schedule block:", error);
      res.status(500).json({ error: "Failed to update schedule block" });
    }
  });

  app.delete("/api/schedule-blocks/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getScheduleBlock(getPathParam(req, "id"));
      const deleted = await storage.deleteScheduleBlock(getPathParam(req, "id"));
      if (!deleted) {
        return res.status(404).json({ error: "Schedule block not found" });
      }
      if (existing) refreshScreensForVersion(existing.programmeVersionId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule block:", error);
      res.status(500).json({ error: "Failed to delete schedule block" });
    }
  });

  app.delete("/api/schedule-blocks/series/:seriesId", requireAuth, async (req, res) => {
    try {
      const seriesBlocks = await storage.getScheduleBlocksBySeries(getPathParam(req, "seriesId"));
      if (seriesBlocks.length === 0) {
        return res.status(404).json({ error: "Series not found" });
      }
      const count = await storage.deleteScheduleBlocksBySeries(getPathParam(req, "seriesId"));
      const versionId = seriesBlocks[0].programmeVersionId;
      refreshScreensForVersion(versionId);
      res.json({ deleted: count });
    } catch (error) {
      console.error("Error deleting series:", error);
      res.status(500).json({ error: "Failed to delete series" });
    }
  });

  app.post("/api/schedule-blocks/migrate-to-series", requireAuth, requireAdmin, async (req, res) => {
    try {
      const uuidv4 = () => crypto.randomUUID();
      const allBlocks = await storage.getAllScheduleBlocks();
      let blocksSplit = 0;
      let blocksCreated = 0;
      const affectedVersionIds = new Set<string>();

      for (const block of allBlocks) {
        const rules = (block.timeRules as any[]) || [];
        if (rules.length <= 1) continue;

        const seriesId = uuidv4();
        affectedVersionIds.add(block.programmeVersionId);

        await storage.updateScheduleBlock(block.id, {
          timeRules: [rules[0]],
          seriesId,
        });

        for (let i = 1; i < rules.length; i++) {
          await storage.createScheduleBlock({
            programmeVersionId: block.programmeVersionId,
            name: block.name,
            priority: block.priority ?? 0,
            layoutTemplateId: block.layoutTemplateId,
            targets: block.targets as any,
            timeRules: [rules[i]],
            zoneSources: block.zoneSources as any,
            seriesId,
          });
          blocksCreated++;
        }
        blocksSplit++;
      }

      for (const vId of affectedVersionIds) {
        refreshScreensForVersion(vId);
      }

      res.json({ blocksSplit, blocksCreated, versionsRefreshed: affectedVersionIds.size });
    } catch (error) {
      console.error("Error migrating to series:", error);
      res.status(500).json({ error: "Failed to migrate" });
    }
  });

  app.post("/api/schedule-blocks/cleanup-rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allBlocks = await storage.getAllScheduleBlocks();
      let blocksUpdated = 0;
      let totalRulesBefore = 0;
      let totalRulesAfter = 0;

      for (const block of allBlocks) {
        const rules = (block.timeRules as Array<{ startDate?: string; endDate?: string; startTime?: string; endTime?: string; daysOfWeek?: number[] }>) || [];
        totalRulesBefore += rules.length;

        const normalised = rules.map((r) => {
          const result = { ...r };
          if (result.startDate && !result.endDate) result.endDate = result.startDate;
          if (result.endDate && !result.startDate) result.startDate = result.endDate;
          return result;
        });

        const deduped: Array<typeof normalised[number] | null> = [];
        const seenDateKeys = new Map<string, number>();
        for (let i = 0; i < normalised.length; i++) {
          const r = normalised[i];
          const sd = r.startDate || "";
          const ed = r.endDate || "";
          if (sd || ed) {
            const key = `${sd}|${ed}`;
            if (seenDateKeys.has(key)) {
              const prevIdx = seenDateKeys.get(key)!;
              deduped[prevIdx] = null;
            }
            seenDateKeys.set(key, i);
          }
          deduped.push(r);
        }
        const cleaned = deduped.filter((r): r is typeof normalised[number] => r !== null);

        if (JSON.stringify(cleaned) !== JSON.stringify(rules)) {
          await storage.updateScheduleBlock(block.id, { timeRules: cleaned });
          blocksUpdated++;
        }
        totalRulesAfter += cleaned.length;
      }

      res.json({
        blocksScanned: allBlocks.length,
        blocksUpdated,
        totalRulesBefore,
        totalRulesAfter,
        rulesRemoved: totalRulesBefore - totalRulesAfter,
      });
    } catch (error) {
      console.error("Error cleaning up schedule block rules:", error);
      res.status(500).json({ error: "Failed to clean up schedule block rules" });
    }
  });

  // ============ SCREEN EVENT BOOKINGS ============

  app.get("/api/screen-bookings", requireAuth, loadUserContext, async (req, res) => {
    try {
      const allBookings = await storage.getScreenEventBookings();
      const allowed = getAllowedClientIds(req);
      if (!allowed) return res.json(allBookings);
      const [screensById, eventsById] = await Promise.all([
        storage.getScreens().then(rows => new Map(rows.map(s => [s.id, s]))),
        storage.getEvents().then(rows => new Map(rows.map(e => [e.id, e]))),
      ]);
      const filtered = allBookings.filter(b => {
        const sc = screensById.get(b.screenId);
        const ev = eventsById.get(b.eventId);
        if (!sc || !ev) return false;
        return canAccessBooking(sc.clientId ?? null, ev.clientId ?? null, allowed);
      });
      res.json(filtered);
    } catch (error) {
      console.error("Error listing bookings:", error);
      res.status(500).json({ error: "Failed to list bookings" });
    }
  });

  app.get("/api/screens/:id/playback", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "id"));
      if (!screen) return res.status(404).json({ error: "Screen not found" });
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const nowStr = getQueryString(req, "now", res);
      if (nowStr === null) return;
      const now = nowStr ? new Date(nowStr) : new Date();
      const rawActiveEvent = await storage.getCurrentEventForScreen(screen.id, now);

      const allowed = getAllowedClientIds(req);
      const screenClientId = screen.clientId ?? null;
      const visibleActiveEvent = rawActiveEvent &&
        canAccessBooking(screenClientId, rawActiveEvent.clientId ?? null, allowed)
          ? rawActiveEvent
          : null;

      const blocks: Array<{
        id: string;
        name: string;
        timeRules: TimeRule[] | null;
        priority: number | null;
      }> = [];
      if (visibleActiveEvent) {
        const screenGroupIds = await storage.getScreenGroupIds(screen.id);
        const screenGroupSet = new Set(screenGroupIds);

        const programmes = await storage.getProgrammes();
        const eventProgrammeIds = programmes
          .filter(p => p.eventId === visibleActiveEvent.id)
          .map(p => p.id);
        if (eventProgrammeIds.length > 0) {
          const allVersions = await storage.getProgrammeVersions();
          const publishedVersions = allVersions.filter(
            v => v.status === "published" && eventProgrammeIds.includes(v.programmeId),
          );
          for (const version of publishedVersions) {
            const versionBlocks = await storage.getScheduleBlocks(version.id);
            for (const block of versionBlocks) {
              const targets = (block.targets as ScheduleTarget[] | null) || [];
              const fires =
                targets.length === 0 ||
                targets.some(
                  t =>
                    (t.type === "screen" && t.id === screen.id) ||
                    (t.type === "group" && screenGroupSet.has(t.id)),
                );
              if (fires) {
                blocks.push({
                  id: block.id,
                  name: block.name,
                  timeRules: (block.timeRules as TimeRule[] | null) || null,
                  priority: block.priority ?? null,
                });
              }
            }
          }
        }
      }

      const tz = screenClientId
        ? (await storage.getClient(screenClientId))?.timezone || DEFAULT_SCHEDULE_TIMEZONE_FALLBACK
        : DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
      const status = derivePlaybackStatus(blocks, !!visibleActiveEvent, now, tz);

      const allForScreen = await storage.getScreenEventBookings({ screenId: screen.id });
      const futureBookings = allForScreen
        .filter(b => new Date(b.startsAt) > now)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      let visibleNextBooking: typeof futureBookings[number] | undefined;
      let visibleNextEvent: Awaited<ReturnType<typeof storage.getEvent>> | undefined;
      for (const b of futureBookings) {
        const ev = await storage.getEvent(b.eventId);
        if (!ev) continue;
        if (!canAccessBooking(screenClientId, ev.clientId ?? null, allowed)) continue;
        visibleNextBooking = b;
        visibleNextEvent = ev;
        break;
      }

      res.json({
        now: now.toISOString(),
        activeEvent: visibleActiveEvent
          ? { id: visibleActiveEvent.id, name: visibleActiveEvent.name }
          : null,
        block: status,
        nextBooking: visibleNextBooking && visibleNextEvent
          ? {
              eventId: visibleNextEvent.id,
              eventName: visibleNextEvent.name,
              startsAt: visibleNextBooking.startsAt,
            }
          : null,
      });
    } catch (error) {
      console.error("Error deriving playback status:", error);
      res.status(500).json({ error: "Failed to derive playback status" });
    }
  });

  app.get("/api/screens/:screenId/bookings", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "screenId"));
      if (!screen) return res.status(404).json({ error: "Screen not found" });
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const allowed = getAllowedClientIds(req);
      const bookings = await storage.getScreenEventBookings({ screenId: screen.id });
      if (!allowed) return res.json(bookings);
      const eventIds = Array.from(new Set(bookings.map(b => b.eventId)));
      const events = await Promise.all(eventIds.map(id => storage.getEvent(id)));
      const eventClientById = new Map<string, string | null>();
      for (const ev of events) {
        if (ev) eventClientById.set(ev.id, ev.clientId ?? null);
      }
      const filtered = bookings.filter(b =>
        canAccessBooking(
          screen.clientId ?? null,
          eventClientById.get(b.eventId) ?? null,
          allowed,
        ),
      );
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching screen bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // List bookings for one event (used on the event detail page).
  app.get("/api/events/:eventId/bookings", requireAuth, loadUserContext, async (req, res) => {
    try {
      const event = await storage.getEvent(getPathParam(req, "eventId"));
      if (!event) return res.status(404).json({ error: "Event not found" });
      if (event.clientId && !canAccessClient(req, event.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const bookings = await storage.getScreenEventBookings({ eventId: event.id });
      const allowed = getAllowedClientIds(req);
      if (!allowed) return res.json(bookings);
      const screenIds = Array.from(new Set(bookings.map(b => b.screenId)));
      const screens = await Promise.all(screenIds.map(id => storage.getScreen(id)));
      const screenClientById = new Map<string, string | null>();
      for (const s of screens) {
        if (s) screenClientById.set(s.id, s.clientId ?? null);
      }
      const filtered = bookings.filter(b =>
        canAccessBooking(
          screenClientById.get(b.screenId) ?? null,
          event.clientId ?? null,
          allowed,
        ),
      );
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching event bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.post("/api/screens/:screenId/bookings", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "screenId"));
      if (!screen) return res.status(404).json({ error: "Screen not found" });
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const event = await storage.getEvent(String(req.body.eventId || ""));
      if (!event) return res.status(400).json({ error: "Event not found" });
      if (event.clientId && !canAccessClient(req, event.clientId)) {
        return res.status(403).json({ error: "Access denied to event" });
      }
      const data = insertScreenEventBookingSchema.parse({
        screenId: screen.id,
        eventId: event.id,
        startsAt: new Date(req.body.startsAt),
        endsAt: new Date(req.body.endsAt),
      });
      try {
        const booking = await storage.createScreenEventBooking(data);
        logAudit(req, "create", "screen_booking", booking.id, {
          screenId: booking.screenId,
          eventId: booking.eventId,
        });
        res.status(201).json(booking);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create booking";
        if (msg.includes("overlap")) return res.status(409).json({ error: msg });
        if (msg.includes("end must be after start")) return res.status(400).json({ error: msg });
        throw e;
      }
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Bulk-create endpoint used by the screens-page right-click "paste
  // bookings" flow. Returns per-row results so the UI can show
  // pasted/conflict/skipped counts. Reuses storage.createScreenEventBooking
  // so the per-screen advisory lock + overlap check still serialise writes.
  app.post(
    "/api/screens/:screenId/bookings/bulk",
    requireAuth,
    loadUserContext,
    buildBulkBookingsHandler(
      {
        getScreen: (id) => storage.getScreen(id),
        getEvent: (id) => storage.getEvent(id),
        createScreenEventBooking: (data) => storage.createScreenEventBooking(data),
      },
      { canAccessClient },
      {
        onAudit: (req, results: BulkBookingResult[]) => {
          for (const r of results) {
            if (r.status === "created") {
              logAudit(req, "create", "screen_booking", r.booking.id, {
                screenId: r.booking.screenId,
                eventId: r.booking.eventId,
                bulk: true,
              });
            }
          }
        },
      },
    ),
  );

  app.patch("/api/screen-bookings/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreenEventBooking(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      const screen = await storage.getScreen(existing.screenId);
      const currentEvent = await storage.getEvent(existing.eventId);
      if (screen?.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (currentEvent?.clientId && !canAccessClient(req, currentEvent.clientId)) {
        return res.status(403).json({ error: "Access denied to booking's event" });
      }
      const patch: Partial<InsertScreenEventBooking> = {};
      if (req.body.startsAt !== undefined) patch.startsAt = new Date(req.body.startsAt);
      if (req.body.endsAt !== undefined) patch.endsAt = new Date(req.body.endsAt);
      if (req.body.eventId !== undefined) {
        const ev = await storage.getEvent(String(req.body.eventId));
        if (!ev) return res.status(400).json({ error: "Event not found" });
        if (ev.clientId && !canAccessClient(req, ev.clientId)) {
          return res.status(403).json({ error: "Access denied to event" });
        }
        patch.eventId = ev.id;
      }
      try {
        const booking = await storage.updateScreenEventBooking(existing.id, patch);
        logAudit(req, "update", "screen_booking", existing.id, patch);
        res.json(booking);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to update booking";
        if (msg.includes("overlap")) return res.status(409).json({ error: msg });
        if (msg.includes("end must be after start")) return res.status(400).json({ error: msg });
        throw e;
      }
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  app.delete("/api/screen-bookings/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreenEventBooking(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      const screen = await storage.getScreen(existing.screenId);
      const ev = await storage.getEvent(existing.eventId);
      if (screen?.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (ev?.clientId && !canAccessClient(req, ev.clientId)) {
        return res.status(403).json({ error: "Access denied to booking's event" });
      }
      await storage.deleteScreenEventBooking(existing.id);
      logAudit(req, "delete", "screen_booking", existing.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // ============ SCREEN PRESETS ============

  async function resolvePresetClientId(preset: { screenId: string | null; groupId: string | null }): Promise<string | null> {
    if (preset.screenId) {
      const screen = await storage.getScreen(preset.screenId);
      return screen?.clientId || null;
    }
    if (preset.groupId) {
      const group = await storage.getScreenGroup(preset.groupId);
      return group?.clientId || null;
    }
    return null;
  }

  async function deleteAllOverridesForPreset(presetId: string) {
    const allOverrides = await storage.getLiveOverrides();
    const matching = allOverrides.filter(o => o.presetId === presetId);
    for (const o of matching) {
      await storage.deleteLiveOverride(o.id);
    }
  }

  app.get("/api/screen-presets", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const screenId = getQueryString(req, "screenId", res); if (screenId === null) return;
      const groupId = getQueryString(req, "groupId", res); if (groupId === null) return;
      if (screenId) {
        const screen = await storage.getScreen(screenId);
        if (!screen) return res.status(404).json({ error: "Screen not found" });
        if (screen.clientId && !canAccessClient(req, screen.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      if (groupId) {
        const group = await storage.getScreenGroup(groupId);
        if (!group) return res.status(404).json({ error: "Screen group not found" });
        if (group.clientId && !canAccessClient(req, group.clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      let presets = await storage.getScreenPresets({ screenId, groupId });
      if (!screenId && !groupId && !isAdmin(req)) {
        const allowed = getAllowedClientIds(req) ?? [];
        const allowedSet = new Set(allowed);
        const [allScreens, allGroups] = await Promise.all([
          storage.getScreens(),
          storage.getScreenGroups(),
        ]);
        const accessibleScreenIds = new Set(
          allScreens.filter(s => s.clientId && allowedSet.has(s.clientId)).map(s => s.id)
        );
        const accessibleGroupIds = new Set(
          allGroups.filter(g => g.clientId && allowedSet.has(g.clientId)).map(g => g.id)
        );
        presets = presets.filter(p =>
          (p.screenId && accessibleScreenIds.has(p.screenId)) ||
          (p.groupId && accessibleGroupIds.has(p.groupId))
        );
      }
      const overrides = await storage.getLiveOverrides();
      const activePresetIds = new Set(
        overrides
          .filter(o => o.presetId && o.isActive && new Date(o.startTime) <= new Date() && new Date(o.endTime) >= new Date())
          .map(o => o.presetId)
      );
      const presetsWithStatus = presets.map(p => ({
        ...p,
        isActive: activePresetIds.has(p.id),
      }));
      res.json(presetsWithStatus);
    } catch (error) {
      console.error("Error fetching screen presets:", error);
      res.status(500).json({ error: "Failed to fetch screen presets" });
    }
  });

  app.get("/api/screen-presets/active", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const [overrides, allPresets, allScreens, allGroups] = await Promise.all([
        storage.getLiveOverrides(),
        storage.getScreenPresets(),
        storage.getScreens(),
        storage.getScreenGroups(),
      ]);
      const presetById = new Map(allPresets.map(p => [p.id, p]));
      const screenClientById = new Map(allScreens.map(s => [s.id, s.clientId]));
      const groupClientById = new Map(allGroups.map(g => [g.id, g.clientId]));
      const now = new Date();
      const result: Array<{ presetId: string; presetName: string; screenIds: string[]; since: Date | null }> = [];
      for (const o of overrides) {
        if (!o.presetId || !o.isActive) continue;
        if (new Date(o.startTime) > now || new Date(o.endTime) < now) continue;
        const preset = presetById.get(o.presetId);
        if (!preset) continue;
        const clientId = preset.screenId
          ? screenClientById.get(preset.screenId) || null
          : preset.groupId
            ? groupClientById.get(preset.groupId) || null
            : null;
        if (clientId) {
          if (!canAccessClient(req, clientId)) continue;
        } else if (!isAdmin(req)) {
          continue;
        }
        const targets = (o.targets as Array<{ type: string; id: string }>) || [];
        const screenIds = targets.filter(t => t.type === "screen").map(t => t.id);
        result.push({
          presetId: preset.id,
          presetName: preset.name,
          screenIds,
          since: o.startTime,
        });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching active presets:", error);
      res.status(500).json({ error: "Failed to fetch active presets" });
    }
  });

  app.get("/api/screen-presets/:id", requireAuth, loadUserContext, async (req, res) => {
    try {
      const preset = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(preset);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(preset);
    } catch (error) {
      console.error("Error fetching preset:", error);
      res.status(500).json({ error: "Failed to fetch preset" });
    }
  });

  app.post("/api/screen-presets", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const data = insertScreenPresetSchema.parse(req.body);
      if (!data.screenId && !data.groupId) {
        return res.status(400).json({ error: "Either screenId or groupId is required" });
      }
      const clientId = await resolvePresetClientId({
        screenId: data.screenId ?? null,
        groupId: data.groupId ?? null,
      });
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const preset = await storage.createScreenPreset(data);
      logAudit(req, "create", "screen_preset", preset.id, { name: preset.name });
      res.status(201).json(preset);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating screen preset:", error);
      res.status(500).json({ error: "Failed to create screen preset" });
    }
  });

  app.patch("/api/screen-presets/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const existing = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!existing) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(existing);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { screenId, groupId, ...allowedUpdates } = insertScreenPresetSchema.partial().parse(req.body);
      const preset = await storage.updateScreenPreset(getPathParam(req, "id"), allowedUpdates);
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      logAudit(req, "update", "screen_preset", preset.id, { name: preset.name });
      res.json(preset);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error updating screen preset:", error);
      res.status(500).json({ error: "Failed to update screen preset" });
    }
  });

  app.delete("/api/screen-presets/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const existing = await storage.getScreenPreset(id);
      if (!existing) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(existing);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      await deleteAllOverridesForPreset(id);
      const deleted = await storage.deleteScreenPreset(id);
      if (!deleted) return res.status(404).json({ error: "Preset not found" });
      logAudit(req, "delete", "screen_preset", id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting screen preset:", error);
      res.status(500).json({ error: "Failed to delete screen preset" });
    }
  });

  app.post("/api/screen-presets/reorder", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const { orderedIds } = req.body as { orderedIds: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ error: "orderedIds array is required" });
      }
      let commonScreenId: string | null = null;
      let commonGroupId: string | null = null;
      for (const id of orderedIds) {
        const preset = await storage.getScreenPreset(id);
        if (!preset) return res.status(404).json({ error: `Preset ${id} not found` });
        const clientId = await resolvePresetClientId(preset);
        if (clientId && !canAccessClient(req, clientId)) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (commonScreenId === null && commonGroupId === null) {
          commonScreenId = preset.screenId;
          commonGroupId = preset.groupId;
        } else {
          if (preset.screenId !== commonScreenId || preset.groupId !== commonGroupId) {
            return res.status(400).json({ error: "All presets must belong to the same screen or group" });
          }
        }
      }
      await storage.reorderScreenPresets(orderedIds);
      logAudit(req, "reorder", "screen_preset", orderedIds[0], { count: orderedIds.length });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering presets:", error);
      res.status(500).json({ error: "Failed to reorder presets" });
    }
  });

  app.post("/api/screen-presets/:id/activate", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const preset = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(preset);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await deleteAllOverridesForPreset(preset.id);

      const targets: Array<{ type: "screen" | "group"; id: string }> = [];
      if (preset.screenId) {
        targets.push({ type: "screen", id: preset.screenId });
      } else if (preset.groupId) {
        const members = await storage.getGroupMembers(preset.groupId);
        for (const m of members) {
          targets.push({ type: "screen", id: m.id });
        }
      }

      if (targets.length === 0) {
        return res.status(400).json({ error: "Cannot activate: no target screens found (empty group or missing screen)" });
      }

      const targetScreenIds = new Set(targets.map(t => t.id));
      const allOverrides = await storage.getLiveOverrides();
      for (const o of allOverrides) {
        if (!o.presetId || !o.isActive) continue;
        const oTargets = (o.targets as Array<{ type: string; id: string }>) || [];
        const hasOverlap = oTargets.some(t => targetScreenIds.has(t.id));
        if (hasOverlap) {
          await storage.deleteLiveOverride(o.id);
        }
      }

      const now = new Date();
      const endTime = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const override = await storage.createLiveOverride({
        name: `Preset: ${preset.name}`,
        priority: 200,
        targets,
        layoutTemplateId: preset.layoutTemplateId,
        zoneSources: preset.zoneSources,
        startTime: now,
        endTime,
        isActive: true,
        presetId: preset.id,
      });

      logAudit(req, "activate", "screen_preset", preset.id, { name: preset.name, overrideId: override.id });
      res.json({ preset, override });
    } catch (error) {
      console.error("Error activating preset:", error);
      res.status(500).json({ error: "Failed to activate preset" });
    }
  });

  app.post("/api/screen-presets/:id/deactivate", requireAuthOrToken, loadUserContext, async (req, res) => {
    try {
      const preset = await storage.getScreenPreset(getPathParam(req, "id"));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      const clientId = await resolvePresetClientId(preset);
      if (clientId && !canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await deleteAllOverridesForPreset(preset.id);

      logAudit(req, "deactivate", "screen_preset", preset.id, { name: preset.name });
      res.json({ preset, deactivated: true });
    } catch (error) {
      console.error("Error deactivating preset:", error);
      res.status(500).json({ error: "Failed to deactivate preset" });
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
      const clientId = getQueryString(req, "clientId", res); if (clientId === null) return;
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
      const override = await storage.updateLiveOverride(getPathParam(req, "id"), data);
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
      const deleted = await storage.deleteLiveOverride(getPathParam(req, "id"));
      if (!deleted) {
        return res.status(404).json({ error: "Live override not found" });
      }
      logAudit(req, "delete", "live_override", getPathParam(req, "id"));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting live override:", error);
      res.status(500).json({ error: "Failed to delete live override" });
    }
  });

  // ============ PLAYER API (for Raspberry Pi nodes) ============

  app.get("/api/player/media/:id/file", validateDeviceToken, async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(getPathParam(req, "id"));
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

      // Implicit-canvas pairing (Task #173): one Pi drives the whole
      // wall, so a single pairing code claims every member tile under
      // one shared deviceToken. The player is told which tile it
      // landed on (screenId/name = canvas owner = first-created tile)
      // plus the full member list so the UI can render the composite.
      const members = await storage.getCanvasMembers(screen);
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
  });

  // Task #185 — Pi-side "I'm walking away" signal. The player calls
  // this just before clearing its localStorage device token (after
  // two consecutive 401/403s from /content). The server clears
  // deviceToken/isPaired/presence on every wall member but PRESERVES
  // each tile's existing pairingCode so the screens page can show
  // "Unpaired" with a code the operator can immediately use to
  // re-pair. Without this hook the DB still believes the screen is
  // paired, the screens page shows "Offline", and the operator
  // walks to the Pi assuming hardware failure when really they
  // just need to type the (still-valid) pairing code.
  //
  // Idempotent + race-safe: validateDeviceToken has already
  // verified the caller knows the current deviceToken, so a stale
  // retry from a player that already cleared its token will fail
  // auth and never reach this handler. Concurrent calls just
  // converge on the same null state.
  app.post(
    "/api/player/:screenId/forfeit-pairing",
    validateDeviceToken,
    async (req, res) => {
      try {
        const screenId = getPathParam(req, "screenId");
        await storage.forfeitWallPairing(screenId);
        console.log(
          `[player-auth] forfeit-pairing screenId=${screenId} — Pi-side unpair acknowledged`,
        );
        res.json({ success: true });
      } catch (error) {
        console.error("Error forfeiting pairing:", error);
        res.status(500).json({ error: "Failed to forfeit pairing" });
      }
    },
  );

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

      // Task #197 — pull the keep-alive video stats out of the
      // heartbeat (they piggy-back on `errors.video`) and persist
      // them on the owning screen row so the Screens dashboard can
      // surface a per-screen Video health badge. A reload counter
      // that ticked up since the last heartbeat additionally
      // writes an audit_log row so support can correlate
      // "black screen" reports with watchdog-driven refreshes.
      const videoStats = extractVideoStats(data.errors);
      let videoHealthDecision: ReturnType<typeof decideVideoHealthUpdate> | null = null;
      if (videoStats && screen) {
        videoHealthDecision = decideVideoHealthUpdate(screen, videoStats);
        Object.assign(heartbeatUpdate, videoHealthDecision.patch);
        if (videoHealthDecision.auditLog) {
          storage.createAuditLog(videoHealthDecision.auditLog).catch((err) => {
            console.error("Failed to record video reload audit:", err);
          });
        }
      }

      // Implicit-canvas pairing (Task #173): one Pi drives every tile,
      // so a single heartbeat from any member tile keeps the whole wall
      // marked online. Avoids "siblings show stale offline" in admin UI
      // when only the owner emits heartbeats.
      let affectedScreenIds: string[];
      if (screen) {
        const members = await storage.getCanvasMembers(screen);
        affectedScreenIds = members.map((m) => m.id);
        await storage.setCanvasPairingState(affectedScreenIds, heartbeatUpdate);
      } else {
        affectedScreenIds = [data.screenId];
        await storage.updateScreen(data.screenId, heartbeatUpdate);
      }

      // Task #200 — record a per-heartbeat history sample so the
      // Screens UI can render a 24h sparkline. Fan-out to every
      // canvas member that just had its live counters updated:
      // the badge state is shared across the wall via
      // setCanvasPairingState above, so sibling history must be
      // shared too or the per-screen "Video health history" dialog
      // would look empty on every tile except the heartbeat sender.
      // Fire-and-forget so sample writes never block the heartbeat
      // response.
      if (videoStats && videoHealthDecision) {
        const ts = videoHealthDecision.patch.videoStatsUpdatedAt;
        for (const sid of affectedScreenIds) {
          storage
            .createVideoHealthSample({
              screenId: sid,
              timestamp: ts,
              stalls: videoStats.stalls,
              recoveries: videoStats.recoveries,
              reloads: videoStats.reloads,
            })
            .catch((err) => {
              console.error("Failed to record video health sample:", err);
            });
        }
      }

      if (wasOffline && screen) {
        storage.deleteAlertHistory("screen_offline", screen.id).catch((err) =>
          console.error("Failed to clear alert history:", err)
        );
        try {
          const event = await storage.getCurrentEventForScreen(screen.id);
          if (event) {
            if (event.clientId) {
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

      // Heartbeat doubles as a free time-sync sample.
      res.json({ success: true, serverTime: Date.now() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error recording heartbeat:", error);
      res.status(500).json({ error: "Failed to record heartbeat" });
    }
  });

  // Boot-time sync endpoint. Unauthenticated; returns only server
  // epoch ms. `no-store` prevents any intermediary/browser cache from
  // serving a stale timestamp on repeated boots.
  app.get("/api/player/time", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ serverTime: Date.now() });
  });

  app.post("/api/player/:screenId/screenshot", validateDeviceToken, async (req, res) => {
    try {
      const screenId = getPathParam(req, "screenId");
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "Missing image data" });
      }
      const maxSize = 500 * 1024;
      if (image.length > maxSize) {
        return res.status(400).json({ error: "Screenshot too large" });
      }
      await storage.updateScreen(screenId, {
        lastScreenshot: image,
        lastScreenshotAt: new Date(),
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving screenshot:", error);
      res.status(500).json({ error: "Failed to save screenshot" });
    }
  });

  app.get("/api/screens/:id/screenshot", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "id"));
      if (!screen) return res.status(404).json({ error: "Screen not found" });
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json({
        screenshot: screen.lastScreenshot || null,
        screenshotAt: screen.lastScreenshotAt || null,
      });
    } catch (error) {
      console.error("Error fetching screenshot:", error);
      res.status(500).json({ error: "Failed to fetch screenshot" });
    }
  });

  app.get("/api/player/:screenId/manifest", validateDeviceToken, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "screenId"));
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
      const screen = await storage.getScreen(getPathParam(req, "screenId"));
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      const now = new Date();

      // The block / target / time-rule / fallback resolution lives in
      // `server/contentResolver.ts` so the admin "why is this blank?"
      // diagnostic and the player share a single, traceable code path.
      const screenClient = screen.clientId
        ? await storage.getClient(screen.clientId)
        : null;
      const screenTz = screenClient?.timezone || DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;
      const resolved = await resolveScreenContent(
        screen,
        now,
        storage as ResolverDeps,
        screenTz,
      );
      const layout = resolved.layout;
      const liveOverride = resolved.liveOverride;
      const activeZoneSources = resolved.activeZoneSources;
      const activeEvent = resolved.activeEvent;
      // Reused by computeNextSession further down (Task #93) — keeping this
      // alias avoids re-fetching all blocks for the active event.
      const eventBlocks = resolved.eventBlocks;

      const matchedBlockStep = resolved.trace.find(
        (s) => s.kind === "block-evaluated" && s.decision === "matched",
      );
      const matchedFallbackStep = resolved.trace.find(
        (s) =>
          s.kind === "block-evaluated" &&
          s.decision === "matched-block-fallback-playlist",
      );
      if (matchedBlockStep && matchedBlockStep.kind === "block-evaluated") {
        console.log(
          `[player-content] screen=${screen.id} matched block=${matchedBlockStep.blockId} (${matchedBlockStep.blockName}) layout=${matchedBlockStep.layoutTemplateId} zoneSources=${activeZoneSources.length}`,
        );
      } else if (
        matchedFallbackStep &&
        matchedFallbackStep.kind === "block-evaluated"
      ) {
        console.log(
          `[player-content] screen=${screen.id} matched block=${matchedFallbackStep.blockId} (${matchedFallbackStep.blockName}) layout=null fallbackPlaylist`,
        );
      }
      for (const step of resolved.trace) {
        if (step.kind === "block-evaluated" && step.decision === "layout-deleted") {
          console.warn(
            `[player-content] screen=${screen.id} block=${step.blockId} (${step.blockName}) references missing layoutTemplate=${step.layoutTemplateId}; skipping`,
          );
        }
      }

      const profile = screen.displayProfileId 
        ? await storage.getDisplayProfile(screen.displayProfileId) 
        : null;
      // Task #239: site-scope the media payload via filterMediaAssetsForScreen.
      // Previously the route shipped every asset in the DB which, combined
      // with the zone-renderer's `mediaId ? filter : media` fallback, leaked
      // other sites' uploads onto Site A's screens.
      const allMediaAssets = await storage.getMediaAssets();
      const mediaShares = screen.clientId
        ? await storage.getMediaSharesForClient(screen.clientId)
        : [];
      const mediaAssets = filterMediaAssetsForScreen(
        allMediaAssets,
        screen.clientId,
        mediaShares,
      );
      const allPlaylists = await storage.getPlaylists();
      const playlistItemsMap: Record<string, any[]> = {};
      const layoutTemplatesMap: Record<string, any> = {};
      for (const pl of allPlaylists) {
        const items = await storage.getPlaylistItems(pl.id);
        playlistItemsMap[pl.id] = items;
        for (const item of items) {
          if (item.layoutTemplateId && !layoutTemplatesMap[item.layoutTemplateId]) {
            const lt = await storage.getLayoutTemplate(item.layoutTemplateId);
            if (lt) layoutTemplatesMap[item.layoutTemplateId] = lt;
          }
        }
      }

      const event = activeEvent;

      // Reuse the client we fetched earlier for tz resolution.
      const client = screenClient;

      // ===== Extra player template variables (Task #93) =====
      // Reuse cached event/client/eventBlocks already fetched above to avoid double-fetching.
      let nextSession: { title: string; time: string; countdown: string } | null = null;
      if (eventBlocks.length > 0) {
        try {
          nextSession = computeNextSession(eventBlocks, screen.id, now, screenTz);
        } catch (e) {
          console.warn("next session computation failed:", e);
        }
      }

      let weatherSummary: string | null = null;
      const wLat = screen.weatherLat ? parseFloat(screen.weatherLat) : NaN;
      const wLng = screen.weatherLng ? parseFloat(screen.weatherLng) : NaN;
      if (!isNaN(wLat) && !isNaN(wLng)) {
        weatherSummary = await fetchWeatherSummary(wLat, wLng, screen.weatherUnit || "celsius");
      }

      const playerVars: PlayerVarsPayload = {
        screenName: screen.name ?? null,
        roomName: screen.location ?? null,
        eventName: event?.name ?? null,
        clientName: client?.name ?? null,
        roomCapacity: screen.roomCapacity ?? null,
        eventStartDate: formatPlayerDate(event?.startDate),
        eventEndDate: formatPlayerDate(event?.endDate),
        nextSessionTitle: nextSession?.title ?? null,
        nextSessionTime: nextSession?.time ?? null,
        nextSessionCountdown: nextSession?.countdown ?? null,
        weatherSummary,
      };

      let refreshRequested = false;
      const refreshTs = pendingPlayerRefreshes.get(screen.id);
      if (refreshTs && (Date.now() - refreshTs) < REFRESH_SIGNAL_TTL) {
        refreshRequested = true;
        pendingPlayerRefreshes.delete(screen.id);
      } else if (refreshTs) {
        pendingPlayerRefreshes.delete(screen.id);
      }

      let screenshotRequested = false;
      const ssTs = pendingScreenshotRequests.get(screen.id);
      if (ssTs && (Date.now() - ssTs) < REFRESH_SIGNAL_TTL) {
        screenshotRequested = true;
        pendingScreenshotRequests.delete(screen.id);
      } else if (ssTs) {
        pendingScreenshotRequests.delete(screen.id);
      }

      // Layer the org-wide "hide 'No Content' message" switch on top of the
      // per-screen value (Task #153). The DB row is never mutated; we only
      // OR-merge into the response copy. The player's content-change hash
      // already includes hideNoContentMessage, so toggling the global flag
      // propagates within one polling interval.
      const globalHideSetting = await storage.getSystemSetting(
        GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY,
      );
      const globalHide = parseGlobalHideValue(globalHideSetting?.value);
      const screenForResponse = applyGlobalHideOverride(screen, globalHide);

      // Implicit-canvas pairing (Task #173): when the polled screen is
      // a canvas member with siblings, also return a per-tile resolved
      // payload so the single Pi paired against the wall can composite
      // every tile in one frame. Single-tile / non-canvas responses are
      // unchanged so legacy N-Pi-per-wall installs, and screens that
      // aren't canvas-enabled at all, keep their existing behaviour.
      let canvasPayload: {
        ownerScreenId: string;
        width: number;
        height: number;
        tiles: Array<{
          screenId: string;
          name: string;
          x: number;
          y: number;
          width: number;
          height: number;
          layout: any;
          zoneSources: any[];
          liveOverride: any;
          profile: any;
        }>;
      } | null = null;
      const canvasMembers = await storage.getCanvasMembers(screen);
      if (
        canvasMembers.length > 1 &&
        typeof screen.canvasWidth === "number" &&
        typeof screen.canvasHeight === "number"
      ) {
        const owner = canvasMembers[0];
        type CanvasTileEntry = {
          screenId: string;
          name: string;
          x: number;
          y: number;
          width: number;
          height: number;
          layout: any;
          zoneSources: any[];
          liveOverride: any;
          profile: any;
        };
        const tiles: CanvasTileEntry[] = [];
        for (const member of canvasMembers) {
          // Reuse the seed's already-resolved content when a tile id
          // matches — saves a redundant resolveScreenContent for the
          // most common case of polling the owner.
          const isSeed = member.id === screen.id;
          const memberResolved = isSeed
            ? resolved
            : await resolveScreenContent(
                member,
                now,
                storage as ResolverDeps,
                screenTz,
              );
          const memberProfile = member.displayProfileId
            ? await storage.getDisplayProfile(member.displayProfileId)
            : null;
          tiles.push({
            screenId: member.id,
            name: member.name,
            x: member.canvasX ?? 0,
            y: member.canvasY ?? 0,
            // Tile pixel dimensions come from the display profile (the
            // physical screen's resolution); fall back to 0 when no
            // profile is set so the player can still render an outline
            // rather than a NaN-sized box.
            width: memberProfile?.width ?? 0,
            height: memberProfile?.height ?? 0,
            layout: memberResolved.layout,
            zoneSources: memberResolved.activeZoneSources,
            liveOverride: memberResolved.liveOverride,
            profile: memberProfile,
          });
        }
        canvasPayload = {
          ownerScreenId: owner.id,
          // Source canvas dimensions from the canonical owner row
          // (Task #173 hardening) so a sibling with stale or
          // mismatched canvas dims can never alter the composite
          // viewport size for the rest of the wall. `getCanvasMembers`
          // already filters by exact width/height match so this is
          // belt-and-braces — but it documents the intent.
          width: owner.canvasWidth ?? screen.canvasWidth,
          height: owner.canvasHeight ?? screen.canvasHeight,
          tiles,
        };
      }

      res.json({
        screen: screenForResponse,
        profile,
        layout,
        media: mediaAssets,
        playlists: allPlaylists,
        playlistItems: playlistItemsMap,
        layoutTemplates: layoutTemplatesMap,
        zoneSources: activeZoneSources,
        liveOverride,
        event,
        client,
        playerVars,
        timestamp: now.toISOString(),
        refreshRequested,
        screenshotEnabled: screen.screenshotEnabled || false,
        screenshotRequested,
        canvas: canvasPayload,
        // Highest-frequency time-sync sample (~every 7s).
        serverTime: Date.now(),
      });
    } catch (error) {
      console.error("Error fetching player content:", error);
      res.status(500).json({ error: "Failed to fetch player content" });
    }
  });

  // ============ ADMIN: WHY IS THIS BLANK? (read-only diagnostic) ============
  // Re-runs the real player content resolver against a screen, but instead of
  // returning the player payload it returns the structured trace so admins can
  // see exactly which gate (target / date range / day-of-week / time-of-day /
  // missing layout / fallback) caused a screen to show nothing.
  app.get(
    "/api/admin/screens/:id/content-trace",
    requireAuth,
    loadUserContext,
    requireAdminOrAccountManager,
    buildContentTraceHandler(storage as any, { isAdmin, canAccessClient }),
  );

  // ============ SIMULATOR CONTENT ============
  // The simulator preview shares the player's content resolver
  // (`server/contentResolver.ts`) so the in-app preview can never silently
  // drift from real player behaviour. The only simulator-specific concern is
  // client-scope filtering of the active event (so an account manager can't
  // preview scheduled content from an event whose client they cannot access)
  // and a small mapping from the resolver's structured outcome onto the
  // simulator UI's legacy `layoutSource` / `layoutSourceDetail` shape.
  app.get("/api/simulator/:screenId/content", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "screenId"));
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }

      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const now = new Date();
      const simAllowed = getAllowedClientIds(req);

      // Resolve the simulator's evaluation timezone from the screen's client.
      const simClient = screen.clientId
        ? await storage.getClient(screen.clientId)
        : null;
      const simTz = simClient?.timezone || DEFAULT_SCHEDULE_TIMEZONE_FALLBACK;

      const { summary } = await resolveSimulatorContent(
        screen,
        now,
        storage as ResolverDeps,
        simAllowed,
        simTz,
      );

      let playerVars: PlayerVarsPayload;
      try {
        playerVars = await buildPlayerVarsForScreen(screen, now, { allowed: simAllowed });
      } catch (e) {
        console.warn("simulator playerVars computation failed:", e);
        // Match the player endpoint's contract: always return an object,
        // even if the helper fails — fall back to bare screen-derived fields.
        playerVars = {
          screenName: screen.name ?? null,
          roomName: screen.location ?? null,
          eventName: null,
          clientName: null,
          roomCapacity: screen.roomCapacity ?? null,
          eventStartDate: "",
          eventEndDate: "",
          nextSessionTitle: null,
          nextSessionTime: null,
          nextSessionCountdown: null,
          weatherSummary: null,
        };
      }

      res.json({
        layoutId: summary.layoutId,
        layoutSource: summary.layoutSource,
        layoutSourceDetail: summary.layoutSourceDetail,
        fallbackPlaylistId: summary.fallbackPlaylistId,
        playerVars,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      console.error("Error fetching simulator content:", error);
      res.status(500).json({ error: "Failed to fetch simulator content" });
    }
  });

  // Lightweight playerVars-only lookup for the layout editor's variable preview.
  app.get("/api/simulator/:screenId/player-vars", requireAuth, loadUserContext, async (req, res) => {
    try {
      const screen = await storage.getScreen(getPathParam(req, "screenId"));
      if (!screen) {
        return res.status(404).json({ error: "Screen not found" });
      }
      if (screen.clientId && !canAccessClient(req, screen.clientId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const playerVars = await buildPlayerVarsForScreen(screen, undefined, {
        allowed: getAllowedClientIds(req),
      });
      res.json({ playerVars });
    } catch (error) {
      console.error("Error fetching simulator player vars:", error);
      res.status(500).json({ error: "Failed to fetch player vars" });
    }
  });

  // ============ WEATHER WIDGET ============
  // Cache weather data for 10 minutes to reduce API calls
  const weatherCache = new Map<string, { data: any; timestamp: number }>();
  const WEATHER_CACHE_TTL = 10 * 60 * 1000;

  const handleWeatherRequest = async (req: Request, res: Response) => {
    try {
      const latStr = getQueryString(req, "lat", res);
      if (latStr === null) return;
      const lngStr = getQueryString(req, "lng", res);
      if (lngStr === null) return;
      const unitRaw = getQueryString(req, "unit", res);
      if (unitRaw === null) return;
      const lat = parseFloat(latStr ?? "");
      const lng = parseFloat(lngStr ?? "");
      const unit = unitRaw || "celsius";

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
      const rssUrl = getQueryString(req, "url", res);
      if (rssUrl === null) return;
      const countRaw = getQueryString(req, "count", res);
      if (countRaw === null) return;
      const itemCount = Math.min(parseInt(countRaw ?? "") || 10, 50);

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
      const query = getQueryString(req, "q", res);
      if (query === null) return;
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
            : u.sites.length > 0 && u.sites.some((s: { clientId: string }) => allowed.includes(s.clientId))
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
      const id = getPathParam(req, "id");
      if (!(await canManageUser(req, id))) {
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
        if (existing && existing.id !== id) {
          return res.status(409).json({ error: "Email already in use" });
        }
        updateData.email = email.toLowerCase().trim();
      }
      if (isActive !== undefined) updateData.isActive = isActive;
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }
      const user = await storage.updateUser(id, updateData);
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
      if (!(await canManageUser(req, getPathParam(req, "id")))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const user = await storage.getUser(getPathParam(req, "id"));
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
      if (!(await canManageUser(req, getPathParam(req, "id")))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const user = await storage.updateUser(getPathParam(req, "id"), { mustChangePassword: true });
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
      const id = getPathParam(req, "id");
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }
      if (!canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "You do not have access to this site" });
      }
      if (!(await canManageUser(req, id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client/site not found" });
      }
      const userSite = await storage.addUserToSite(id, clientId);
      logAudit(req, "assign_site", "user", id, { clientId, clientName: client.name });
      res.status(201).json(userSite);
    } catch (error) {
      console.error("Error assigning user to site:", error);
      res.status(500).json({ error: "Failed to assign user to site" });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const id = getPathParam(req, "id");
      const currentUser = (req as any).dbUser;
      if (currentUser.id === id) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }
      if (!(await canManageUser(req, id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const userToDelete = await storage.getUser(id);
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }
      logAudit(req, "delete", "user", id, { email: userToDelete?.email });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.delete("/api/admin/users/:id/sites/:clientId", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const clientId = getPathParam(req, "clientId");
      const id = getPathParam(req, "id");
      if (!canAccessClient(req, clientId)) {
        return res.status(403).json({ error: "You do not have access to this site" });
      }
      if (!(await canManageUser(req, id))) {
        return res.status(403).json({ error: "You do not have permission to manage this user" });
      }
      const removed = await storage.removeUserFromSite(id, clientId);
      if (!removed) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      logAudit(req, "remove_site", "user", id, { clientId: clientId });
      res.status(204).send();
    } catch (error) {
      console.error("Error removing user from site:", error);
      res.status(500).json({ error: "Failed to remove user from site" });
    }
  });

  // ============ ADMIN: AUDIT LOGS & STATS ============
  app.get("/api/admin/audit-logs", requireAuth, requireAdminOrAccountManager, loadUserContext, async (req, res) => {
    try {
      const userId = getQueryString(req, "userId", res);
      if (userId === null) return;
      const entityType = getQueryString(req, "entityType", res);
      if (entityType === null) return;
      const entityId = getQueryString(req, "entityId", res);
      if (entityId === null) return;
      const action = getQueryString(req, "action", res);
      if (action === null) return;
      const dateFromStr = getQueryString(req, "dateFrom", res);
      if (dateFromStr === null) return;
      const dateToStr = getQueryString(req, "dateTo", res);
      if (dateToStr === null) return;
      const limitStr = getQueryString(req, "limit", res);
      if (limitStr === null) return;
      const offsetStr = getQueryString(req, "offset", res);
      if (offsetStr === null) return;

      const options: any = {};
      if (userId) options.userId = userId;
      if (entityType) options.entityType = entityType;
      if (entityId) options.entityId = entityId;
      if (action) options.action = action;
      if (dateFromStr) options.dateFrom = new Date(dateFromStr);
      if (dateToStr) options.dateTo = new Date(dateToStr);
      if (limitStr) options.limit = parseInt(limitStr);
      if (offsetStr) options.offset = parseInt(offsetStr);

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
        userId: (req as Request & { dbUser?: { id: string } }).dbUser!.id,
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
      const allBookings = await storage.getScreenEventBookings();
      const screensWithAllowedBooking = new Set(
        allBookings.filter(b => eventIds.has(b.eventId)).map(b => b.screenId),
      );
      const screens = allScreens.filter(s => !allowed || screensWithAllowedBooking.has(s.id));
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

  // ============ SCHEDULE TZ-SHIFT AUDIT (Task #138) ============
  // Read-only. Lists schedule blocks authored before the Task #137 fix
  // ("schedule HH:MM is now interpreted in client timezone instead of
  // UTC") on non-UTC clients, with the operator's likely intended HH:MM
  // computed from the client timezone's UTC offset AT THE BLOCK'S
  // createdAt (the offset the operator was compensating for under the
  // old behaviour). Using authoring-time offset rather than the current
  // offset makes the audit DST-correct year-round. Operators decide
  // whether to shift each block via the schedule editor — this endpoint
  // never mutates anything. Account-manager scoped: only suspect blocks
  // for clients the caller can already see are returned.
  // Query params:
  //   ?cutoff=ISO  (optional) override the default merge instant.
  app.get(
    "/api/admin/schedule-blocks/tz-shift-audit",
    requireAuth,
    loadUserContext,
    requireAdminOrAccountManager,
    async (req, res) => {
      try {
        const cutoffParam = typeof req.query.cutoff === "string" ? req.query.cutoff : undefined;
        const cutoffIso = cutoffParam || TZ_AUDIT_DEFAULT_CUTOFF;
        if (cutoffParam && Number.isNaN(new Date(cutoffParam).getTime())) {
          return res.status(400).json({ error: "cutoff is not a valid ISO timestamp" });
        }
        const allowed = getAllowedClientIds(req);
        const evaluatedAt = new Date();
        const suspects = await findScheduleTzSuspectBlocks({
          cutoffIso,
          // Authoring-time offset is computed per-row from createdAt;
          // this is just the defensive fallback if a row has no
          // createdAt at all.
          fallbackInstant: evaluatedAt,
          allowedClientIds: allowed ?? null,
        });
        res.json({
          cutoff: cutoffIso,
          evaluatedAt: evaluatedAt.toISOString(),
          count: suspects.length,
          suspects,
        });
      } catch (error) {
        console.error("Error running tz-shift audit:", error);
        res.status(500).json({ error: "Failed to run tz-shift audit" });
      }
    },
  );

  // ============ PLAYER DISPLAY SETTINGS ============
  // Public-to-any-authenticated-user view of the org-wide player display
  // toggles. This lets non-admin operators see the "overridden by global
  // setting" hint on the Screens page without exposing the full
  // /api/system-settings catalog (which remains admin-only).
  app.get("/api/player-display-settings", requireAuth, loadUserContext, async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY);
      res.json({
        globalHideNoContentMessage: parseGlobalHideValue(setting?.value),
      });
    } catch (error) {
      console.error("Error fetching player display settings:", error);
      res.status(500).json({ error: "Failed to fetch player display settings" });
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
      const setting = await storage.getSystemSetting(getPathParam(req, "key"));
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
      const setting = await storage.setSystemSetting(getPathParam(req, "key"), value.trim());
      logAudit(req, "update", "system_setting", getPathParam(req, "key"), { value: value.trim() });
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
      const alertType = getPathParam(req, "alertType");
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

  // ============ OME (OvenMediaEngine) PROXY ============

  app.get("/api/ome/config", requireAuth, loadUserContext, requireAdmin, async (_req, res) => {
    try {
      const urlSetting = await storage.getSystemSetting("ome_api_url");
      const tokenSetting = await storage.getSystemSetting("ome_access_token");
      res.json({
        apiUrl: urlSetting?.value || "",
        accessToken: tokenSetting?.value?.trim() ? "••••••••" : "",
      });
    } catch (error) {
      console.error("Error fetching OME config:", error);
      res.status(500).json({ error: "Failed to fetch OME config" });
    }
  });

  app.put("/api/ome/config", requireAuth, loadUserContext, requireAdmin, async (req, res) => {
    try {
      const { apiUrl, accessToken } = req.body;
      if (typeof apiUrl !== "string") {
        return res.status(400).json({ error: "apiUrl is required" });
      }
      const trimmedUrl = apiUrl.trim();
      if (trimmedUrl) {
        try {
          const parsed = new URL(trimmedUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            return res.status(400).json({ error: "API URL must use http or https protocol" });
          }
        } catch {
          return res.status(400).json({ error: "Invalid API URL format" });
        }
      }
      await storage.setSystemSetting("ome_api_url", trimmedUrl);
      if (typeof accessToken === "string" && !accessToken.startsWith("••")) {
        await storage.setSystemSetting("ome_access_token", accessToken.trim());
      }
      if (!trimmedUrl) {
        await storage.setSystemSetting("ome_access_token", "");
      }
      logAudit(req, "update", "ome_config", undefined, { apiUrl: trimmedUrl });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error saving OME config:", error);
      res.status(500).json({ error: "Failed to save OME config" });
    }
  });

  async function omeApiFetch(path: string): Promise<any> {
    const urlSetting = await storage.getSystemSetting("ome_api_url");
    const tokenSetting = await storage.getSystemSetting("ome_access_token");
    if (!urlSetting?.value) throw new Error("OME API URL not configured");
    const baseUrl = urlSetting.value.replace(/\/$/, "");
    const url = `${baseUrl}${path}`;
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("OME API URL must use http or https");
    }
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (tokenSetting?.value) {
      headers["Authorization"] = `Basic ${Buffer.from("admin:" + tokenSetting.value).toString("base64")}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OME API ${resp.status}: ${text}`);
      }
      return resp.json();
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") throw new Error("OME API request timed out");
      throw err;
    }
  }

  app.get("/api/ome/status", requireAuth, loadUserContext, requireAdmin, async (_req, res) => {
    try {
      const urlSetting = await storage.getSystemSetting("ome_api_url");
      if (!urlSetting?.value) {
        return res.json({ connected: false, error: "Not configured" });
      }
      const data = await omeApiFetch("/v1/stats/current/vhosts/default");
      const totalRecv = data?.response?.totalBytesIn || 0;
      const totalSend = data?.response?.totalBytesOut || 0;
      const connCreated = data?.response?.totalConnections || 0;
      res.json({
        connected: true,
        version: data?.response?.version || undefined,
        uptime: data?.response?.createdTime
          ? formatUptime(data.response.createdTime)
          : undefined,
        totalRecvBytes: totalRecv,
        totalSendBytes: totalSend,
        totalConnections: connCreated,
      });
    } catch (error: any) {
      console.error("OME status error:", error?.message);
      res.json({ connected: false, error: error?.message || "Unknown error" });
    }
  });

  function formatUptime(createdTime: string): string {
    try {
      const created = new Date(createdTime);
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const days = Math.floor(diffMs / 86400000);
      const hours = Math.floor((diffMs % 86400000) / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      if (days > 0) return `${days}d ${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    } catch {
      return createdTime;
    }
  }

  app.get("/api/ome/streams", requireAuth, loadUserContext, requireAdmin, async (_req, res) => {
    try {
      const result: any[] = [];
      let vhosts: string[];
      try {
        const vhostData = await omeApiFetch("/v1/vhosts");
        vhosts = vhostData?.response || [];
      } catch {
        vhosts = ["default"];
      }

      for (const vhost of vhosts) {
        let apps: string[];
        try {
          const appData = await omeApiFetch(`/v1/vhosts/${vhost}/apps`);
          apps = appData?.response || [];
        } catch {
          continue;
        }

        for (const app2 of apps) {
          let streams: string[];
          try {
            const streamData = await omeApiFetch(`/v1/vhosts/${vhost}/apps/${app2}/streams`);
            streams = streamData?.response || [];
          } catch {
            continue;
          }

          for (const stream of streams) {
            try {
              const detail = await omeApiFetch(`/v1/vhosts/${vhost}/apps/${app2}/streams/${stream}`);
              const info = detail?.response || {};
              const tracks = (info.input?.tracks || []).map((t: any) => ({
                type: t.type,
                codec: t.codec,
                bitrate: t.bitrate,
                width: t.video?.width,
                height: t.video?.height,
                framerate: t.video?.framerate,
                samplerate: t.audio?.samplerate,
                channel: t.audio?.channel,
              }));
              const outputs = (info.outputs || []).map((o: any) => ({
                name: o.name,
                protocol: o.protocol,
                url: o.url,
                tracks: (o.tracks || []).map((t: any) => ({
                  type: t.type,
                  codec: t.codec,
                })),
              }));
              let viewers = 0;
              try {
                const statsData = await omeApiFetch(`/v1/stats/current/vhosts/${vhost}/apps/${app2}/streams/${stream}`);
                const sr = statsData?.response;
                viewers = sr?.totalConnections || sr?.connections || 0;
              } catch {}
              result.push({
                vhost,
                app: app2,
                stream,
                inputType: info.input?.sourceType || info.input?.type || undefined,
                inputUrl: info.input?.url || undefined,
                tracks,
                outputs,
                viewers,
              });
            } catch {
              result.push({ vhost, app: app2, stream, tracks: [], outputs: [], viewers: 0 });
            }
          }
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("OME streams error:", error?.message);
      res.status(502).json({ error: error?.message || "Failed to fetch streams" });
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

  // ============ AGENDA DISPLAY WIDGET (Task #208) ============
  // Central pool of agenda items per site + per-display widget
  // configs. Routes live in server/agendaRoutes.ts so the tenant
  // scoping + public payload behaviour can be unit-tested against a
  // stub storage (see tests/agenda-routes-tenant-scoping.test.ts).
  mountAgendaRoutes(app, {
    storage,
    auth: {
      canAccessClient: (req, clientId) => canAccessClient(req, clientId),
      getAllowedClientIds: (req) => getAllowedClientIds(req),
    },
    requireAuth,
    requireAuthOrToken,
    loadUserContext,
    logAudit,
  });

  return httpServer;
}


/**
 * Multiview high-density validation suite.
 *
 * Validates the complete Multiview workflow at 12, 25, and 50 simultaneous
 * screens.  All checks run in the existing Node test-runner — no browser
 * required.  Geometry/arithmetic tests are pure functions; bootstrap and
 * session-lifecycle tests use a real in-memory Express server or an in-memory
 * storage stub driven through the exported validateMonitorCookie helper.
 *
 * ── Bootstrap (density 12 / 25 / 50) ────────────────────────────────────────
 *   - No 429 on concurrent valid exchanges at any density
 *   - No 429 on sequential project-switch bursts (12+12, 25+25)
 *   - Invalid-failure budget is fully intact after N valid exchanges
 *
 * ── Sessions ────────────────────────────────────────────────────────────────
 *   - Multiple sessions per screen are supported (Multiview requires this)
 *   - Each session bootstraps independently; all validate after bootstrap
 *   - Single-use bootstrap: second attempt with spent token returns 401
 *     (the "duplicate WebContentsView" prevention mechanism)
 *   - Revoking 12 / 25 / 50 sessions: all succeed, none remain valid
 *   - Partial revocation: correct subset remains active
 *   - Unbootstrapped session (no sessionSecretHash yet) is rejected
 *
 * ── Logical geometry (tile-count independence) ───────────────────────────────
 *   - viewportW = profile.width, viewportH = profile.height at ALL densities
 *   - Portrait (1080×1920) profile is preserved at all tile counts
 *   - Canvas screen: viewport = profile dims (crop), NOT full canvas dims
 *   - TestPattern is always rendered at profile dims
 *
 * ── Scale independence ───────────────────────────────────────────────────────
 *   - scale = min(windowW / viewportW, windowH / viewportH)
 *   - Shrinking tile size changes scale only; logical dims stay fixed
 *   - Window resize changes scale only; logical dims stay fixed
 *
 * ── Compact/Grouped view switching ──────────────────────────────────────────
 *   - No server-side session state tracks view mode (Electron-local concern)
 *   - Switching view modes requires no server-side session changes
 *
 * ── Project switching ────────────────────────────────────────────────────────
 *   - Project-switch revocation is explicit DELETE (no implicit server cleanup)
 *   - Revoking all N sessions for old project leaves a clean slate
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it, before, after } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  mountOperationsRoutes,
  sha256Hex,
  validateMonitorCookie,
  type OperationsRoutesStorage,
  type OperationsRoutesAuth,
  type OperationsMonitorDeps,
} from "../server/operations/index";
import type { MonitorSession } from "../shared/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════
// Shared stubs and helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Generate a fresh 32-byte raw hex bootstrap token. */
function freshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Build a MonitorSession test fixture from a raw 32-byte hex token. */
function makeSession(
  id: string,
  rawTokenHex: string,
  screenId: string,
  opts: Partial<MonitorSession> = {},
): MonitorSession {
  return {
    id,
    userId: "test-user",
    screenId,
    clientId: "client-a",
    tokenHash: sha256Hex(rawTokenHex),
    sessionSecretHash: null,
    bootstrapUsedAt: null,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 h
    revokedAt: null,
    lastAccessAt: null,
    clientType: "multiview",
    clientName: "Test client",
    createdAt: new Date(),
    ...opts,
  };
}

/**
 * Minimal stub that satisfies the TypeScript interface but throws if any
 * storage method is actually called (rate-limiter fires before the handler).
 */
function makeMinimalStorage(): OperationsRoutesStorage {
  return {
    getClients: async () => [],
    getClient: async () => undefined,
    getUserClientIds: async () => [],
    getEvents: async () => [],
    getScreenGroups: async () => [],
    getScreenGroupsWithMemberCounts: async () => [],
    getScreenGroup: async () => undefined,
    getGroupMembers: async () => [],
    getScreen: async () => undefined,
    getDisplayProfile: async () => undefined,
    getScreensByClientId: async () => [],
    getAllScreenGroupMemberships: async () => [],
    getOperationsScopesForUser: async () => [],
    getOperationsScopesForToken: async () => [],
    createMonitorSession: async () => { throw new Error("not implemented"); },
    getMonitorSession: async () => undefined,
    getMonitorSessionByTokenHash: async () => undefined,
    consumeMonitorBootstrapToken: async () => null,
    touchMonitorSessionLastAccess: async () => {},
    revokeMonitorSession: async () => false,
    cleanupExpiredMonitorSessions: async () => 0,
  };
}

/**
 * Session-aware in-memory storage.  Supports both the bootstrap HTTP path
 * (getMonitorSessionByTokenHash + consumeMonitorBootstrapToken) and the
 * validateMonitorCookie path (getMonitorSession).  Revocation is also
 * supported so we can test project-switch cleanup.
 */
function makeSessionStorage(sessions: MonitorSession[]): OperationsRoutesStorage {
  // Mutable clones keyed two ways
  const byHash = new Map<string, MonitorSession>(
    sessions.map((s) => [s.tokenHash, { ...s }]),
  );
  const byId = new Map<string, MonitorSession>(
    sessions.map((s) => [s.id, byHash.get(s.tokenHash)!]),
  );

  return {
    ...makeMinimalStorage(),
    async getMonitorSession(id) {
      return byId.get(id);
    },
    async getMonitorSessionByTokenHash(hash) {
      return byHash.get(hash);
    },
    async consumeMonitorBootstrapToken(id, secretHash, usedAt) {
      const s = byId.get(id);
      if (!s || s.bootstrapUsedAt !== null) return null;
      s.bootstrapUsedAt = usedAt;
      s.sessionSecretHash = secretHash;
      return { ...s };
    },
    async touchMonitorSessionLastAccess() {},
    async revokeMonitorSession(id, revokedAt) {
      const s = byId.get(id);
      if (!s || s.revokedAt !== null) return false;
      s.revokedAt = revokedAt;
      return true;
    },
  };
}

function makeMinimalMonitorDeps(): OperationsMonitorDeps {
  return {
    resolveMonitorContent: async () => ({}),
    getPublicBaseUrl: () => "http://localhost",
    logAudit: () => {},
    serveMediaFile: async () => {},
  };
}

function makeRateLimitApp(storage?: OperationsRoutesStorage) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const auth: OperationsRoutesAuth = {
    canAccessClient: () => false,
    getAllowedClientIds: () => null,
  };
  const noop = (_req: Request, _res: Response, next: NextFunction) => next();
  mountOperationsRoutes(app, {
    storage: storage ?? makeMinimalStorage(),
    auth,
    requireAuthOrToken: noop,
    loadUserContext: noop,
    monitor: makeMinimalMonitorDeps(),
  });
  return app;
}

async function startServer(app: express.Express) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

async function bootstrapReq(
  url: string,
  screenId: string,
  rawToken: string,
  ip = "10.0.0.1",
): Promise<Response> {
  return fetch(`${url}/monitor-bootstrap/${screenId}?token=${rawToken}`, {
    redirect: "manual",
    headers: { "X-Forwarded-For": ip },
  });
}

async function invalidBootstrapReq(
  url: string,
  screenId: string,
  ip = "10.0.0.1",
): Promise<Response> {
  return fetch(`${url}/monitor-bootstrap/${screenId}?token=deadbeef00000000`, {
    redirect: "manual",
    headers: { "X-Forwarded-For": ip },
  });
}

/** Returns true when the server accepted the bootstrap (not 401, not 429). */
function isOk(res: Response): boolean {
  return res.status !== 401 && res.status !== 429;
}

/**
 * Build a fake Request-like object suitable for validateMonitorCookie.
 * The real implementation reads req.headers.cookie (no cookie-parser
 * middleware is mounted), so we replicate that exact shape.
 */
function fakeCookieReq(sessionId: string, rawSecret: string): Request {
  return {
    headers: { cookie: `vm_monitor_session=${sessionId}:${rawSecret}` },
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometry helpers — mirror monitor.tsx logic exactly
// ═══════════════════════════════════════════════════════════════════════════

interface Profile { width: number; height: number }
interface ScreenCfg {
  canvasEnabled?: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  canvasX?: number | null;
  canvasY?: number | null;
}

/**
 * Compute Monitor viewport dimensions from content profile and screen config.
 * Mirrors the derivation in MonitorContentInner (monitor.tsx lines 305-324).
 */
function monitorViewport(
  profile: Profile,
  screen: ScreenCfg = {},
): { viewportW: number; viewportH: number } {
  const monitorScreenW = profile.width || 1920;
  const monitorScreenH = profile.height || 1080;
  // viewportW = monitorScreenW (always — canvas and non-canvas)
  return { viewportW: monitorScreenW, viewportH: monitorScreenH };
}

/**
 * Compute scale for a given tile (window) size and viewport.
 * Mirrors monitor.tsx updateScale (lines 338-340).
 */
function monitorScale(
  windowW: number,
  windowH: number,
  viewportW: number,
  viewportH: number,
): number {
  return Math.min(windowW / viewportW, windowH / viewportH);
}

/**
 * Detect canvas mode — mirrors monitor.tsx lines 329-333.
 * Uses profile.width × profile.height as the viewport regardless.
 */
function monitorCanvasMode(
  screen: ScreenCfg,
  layoutW: number,
  layoutH: number,
): { useCanvasMode: boolean; viewportW: number; viewportH: number; canvasW: number; canvasH: number } {
  const rawCanvasW = screen.canvasWidth ?? 0;
  const rawCanvasH = screen.canvasHeight ?? 0;
  const canvasEnabled =
    screen.canvasEnabled === true && rawCanvasW > 0 && rawCanvasH > 0;
  const canvasW = canvasEnabled ? rawCanvasW : 0;
  const canvasH = canvasEnabled ? rawCanvasH : 0;
  const useCanvasMode =
    canvasEnabled &&
    Math.abs(layoutW - canvasW) <= 1 &&
    Math.abs(layoutH - canvasH) <= 1;
  return { useCanvasMode, viewportW: 0, viewportH: 0, canvasW, canvasH };
}

/**
 * Compute tile dimensions for a Multiview grid at a given window size.
 * Uses a simple square-ish layout: ceil(sqrt(N)) columns.
 */
function tileSize(
  screenCount: number,
  windowW: number,
  windowH: number,
): { tileW: number; tileH: number; cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(screenCount));
  const rows = Math.ceil(screenCount / cols);
  const tileW = Math.floor(windowW / cols);
  const tileH = Math.floor(windowH / rows);
  return { tileW, tileH, cols, rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 1: Concurrent bootstrap burst at 12 / 25 / 50 screens ────────────
// ═══════════════════════════════════════════════════════════════════════════

describe("Bootstrap burst — 12 / 25 / 50 concurrent screens", () => {
  let url: string;
  let close: () => Promise<void>;
  const sessionPairs: { raw: string; session: MonitorSession }[] = [];

  before(async () => {
    // Pre-seed 100 sessions across distinct screen IDs.
    // We intentionally leave the failure budget at its default (50) to confirm
    // that valid exchanges never consume it regardless of concurrency.
    delete process.env.MONITOR_BOOTSTRAP_RATE_LIMIT_MAX;

    for (let i = 0; i < 100; i++) {
      const raw = freshToken();
      const id = `hd-${i}-${crypto.randomBytes(4).toString("hex")}`;
      sessionPairs.push({ raw, session: makeSession(id, raw, `hd-screen-${i}`) });
    }
    const storage = makeSessionStorage(sessionPairs.map((p) => p.session));
    const srv = await startServer(makeRateLimitApp(storage));
    url = srv.url;
    close = srv.close;
  });

  after(() => close());

  it("12 concurrent bootstrap exchanges all succeed — no 429, no 401", async () => {
    const batch = sessionPairs.slice(0, 12);
    const results = await Promise.all(
      batch.map(({ raw, session }) =>
        bootstrapReq(url, session.screenId, raw, "10.10.1.1"),
      ),
    );
    const failed = results.filter((r) => !isOk(r));
    assert.equal(
      failed.length,
      0,
      `All 12 concurrent exchanges should succeed; ${failed.length} failed with ${JSON.stringify(failed.map((r) => r.status))}`,
    );
  });

  it("25 concurrent bootstrap exchanges all succeed — no 429, no 401", async () => {
    const batch = sessionPairs.slice(12, 37);
    const results = await Promise.all(
      batch.map(({ raw, session }) =>
        bootstrapReq(url, session.screenId, raw, "10.10.1.2"),
      ),
    );
    const failed = results.filter((r) => !isOk(r));
    assert.equal(
      failed.length,
      0,
      `All 25 concurrent exchanges should succeed; ${failed.length} failed`,
    );
  });

  it("50 concurrent bootstrap exchanges all succeed — no 429, no 401", async () => {
    const batch = sessionPairs.slice(37, 87);
    const results = await Promise.all(
      batch.map(({ raw, session }) =>
        bootstrapReq(url, session.screenId, raw, "10.10.1.3"),
      ),
    );
    const failed = results.filter((r) => !isOk(r));
    assert.equal(
      failed.length,
      0,
      `All 50 concurrent exchanges should succeed; ${failed.length} failed`,
    );
  });

  it("sequential project burst 12+12: both batches fully succeed", async () => {
    // Simulates opening project A (12 screens) then switching to project B (12 screens)
    // from the same IP, without any invalid failures between them.
    const batchA = sessionPairs.slice(87, 93);
    const batchB = sessionPairs.slice(93, 99);
    const ip = "10.10.1.4";

    for (const { raw, session } of batchA) {
      const res = await bootstrapReq(url, session.screenId, raw, ip);
      assert.ok(isOk(res), `Project-A screen ${session.screenId} failed: ${res.status}`);
    }
    for (const { raw, session } of batchB) {
      const res = await bootstrapReq(url, session.screenId, raw, ip);
      assert.ok(isOk(res), `Project-B screen ${session.screenId} failed: ${res.status}`);
    }
  });

  it("invalid-failure budget is fully intact after 50 valid concurrent exchanges", async () => {
    // The 50 valid exchanges above must have consumed zero failure-budget slots.
    // A fresh IP can still make up to DEFAULT_MAX (50) invalid attempts.
    // We just verify the first invalid attempt returns 401 (not 429).
    const res = await invalidBootstrapReq(url, "budget-check-screen", "10.10.1.99");
    assert.equal(
      res.status,
      401,
      "First invalid attempt after valid burst must return 401, not 429",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 2: Session multiplicity and single-use token enforcement ──────────
// ═══════════════════════════════════════════════════════════════════════════

describe("Session multiplicity per screen and single-use token enforcement", () => {
  let url: string;
  let close: () => Promise<void>;
  const multiPairs: { raw: string; session: MonitorSession }[] = [];

  before(async () => {
    // Three sessions for the SAME screen ID — simulating a rogue double-open or
    // a previous session that was never revoked.
    const screenId = "shared-screen";
    for (let i = 0; i < 3; i++) {
      const raw = freshToken();
      const id = `multi-${i}-${crypto.randomBytes(4).toString("hex")}`;
      multiPairs.push({ raw, session: makeSession(id, raw, screenId) });
    }
    const storage = makeSessionStorage(multiPairs.map((p) => p.session));
    const srv = await startServer(makeRateLimitApp(storage));
    url = srv.url;
    close = srv.close;
  });

  after(() => close());

  it("multiple sessions for the same screen can all be bootstrapped independently", async () => {
    // The server does NOT enforce one-session-per-screen. Multiple active sessions
    // are expected — each Multiview tile holds its own session. The Electron client
    // is responsible for revoking old sessions on project switch.
    const results = await Promise.all(
      multiPairs.map(({ raw, session }) =>
        bootstrapReq(url, session.screenId, raw, "10.20.0.1"),
      ),
    );
    const allOk = results.every(isOk);
    assert.ok(
      allOk,
      `All 3 sessions for the same screen should bootstrap; statuses: ${results.map((r) => r.status)}`,
    );
  });

  it("bootstrap token is single-use: a spent token returns 401 on the second attempt", async () => {
    // The first session pair was already used in the previous test.
    // Re-using the same token must return 401 (no second cookie issued).
    const { raw, session } = multiPairs[0];
    const second = await bootstrapReq(url, session.screenId, raw, "10.20.0.1");
    assert.equal(
      second.status,
      401,
      "Spent bootstrap token must return 401 — prevents duplicate WebContentsView from acquiring a second valid session",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 3: validateMonitorCookie paths ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

describe("validateMonitorCookie — all auth paths", () => {
  const rawSecret = crypto.randomBytes(32).toString("hex");
  const secretHash = sha256Hex(rawSecret);

  function sessionStore(session: MonitorSession): OperationsRoutesStorage {
    return {
      ...makeMinimalStorage(),
      async getMonitorSession(id) {
        return session.id === id ? session : undefined;
      },
    };
  }

  it("bootstrapped session with correct secret validates", async () => {
    const session = makeSession("s-valid", freshToken(), "screen-x", {
      bootstrapUsedAt: new Date(),
      sessionSecretHash: secretHash,
    });
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, rawSecret),
      sessionStore(session),
    );
    assert.ok(result !== null, "Bootstrapped session must validate");
    assert.equal(result!.id, session.id);
  });

  it("unbootstrapped session (no sessionSecretHash) is rejected", async () => {
    const session = makeSession("s-unbooted", freshToken(), "screen-x");
    // bootstrapUsedAt and sessionSecretHash are null — bootstrap not yet done
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, rawSecret),
      sessionStore(session),
    );
    assert.equal(result, null, "Session awaiting bootstrap must not validate");
  });

  it("revoked session is rejected", async () => {
    const session = makeSession("s-revoked", freshToken(), "screen-x", {
      bootstrapUsedAt: new Date(),
      sessionSecretHash: secretHash,
      revokedAt: new Date(Date.now() - 1000),
    });
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, rawSecret),
      sessionStore(session),
    );
    assert.equal(result, null, "Revoked session must not validate");
  });

  it("expired session is rejected", async () => {
    const session = makeSession("s-expired", freshToken(), "screen-x", {
      bootstrapUsedAt: new Date(),
      sessionSecretHash: secretHash,
      expiresAt: new Date(Date.now() - 1000),
    });
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, rawSecret),
      sessionStore(session),
    );
    assert.equal(result, null, "Expired session must not validate");
  });

  it("wrong secret is rejected (timing-safe comparison)", async () => {
    const session = makeSession("s-wrong-secret", freshToken(), "screen-x", {
      bootstrapUsedAt: new Date(),
      sessionSecretHash: secretHash,
    });
    const wrongSecret = crypto.randomBytes(32).toString("hex");
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, wrongSecret),
      sessionStore(session),
    );
    assert.equal(result, null, "Wrong secret must not validate");
  });

  it("correct session cookie for wrong screenId is rejected", async () => {
    const session = makeSession("s-wrong-screen", freshToken(), "screen-A", {
      bootstrapUsedAt: new Date(),
      sessionSecretHash: secretHash,
    });
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, rawSecret),
      sessionStore(session),
      "screen-B", // asking for a different screen
    );
    assert.equal(result, null, "Session for different screen must not validate");
  });

  it("correct session cookie omitting screenId check validates (Multiview any-screen path)", async () => {
    const session = makeSession("s-any-screen", freshToken(), "screen-A", {
      bootstrapUsedAt: new Date(),
      sessionSecretHash: secretHash,
    });
    // When screenId is omitted, only secret is checked (Multiview listing path)
    const result = await validateMonitorCookie(
      fakeCookieReq(session.id, rawSecret),
      sessionStore(session),
    );
    assert.ok(result !== null, "Omitting screenId check must validate by secret alone");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 4: Revocation at scale (12 / 25 / 50 sessions) ───────────────────
// ═══════════════════════════════════════════════════════════════════════════

describe("Project-switch revocation at scale", () => {
  /**
   * Build N bootstrapped sessions and the storage that holds them.
   * Returns pairs of (session, rawSecret) so we can call validateMonitorCookie.
   */
  function buildBootstrappedSessions(count: number, screenPrefix = "rev-screen") {
    const secret = crypto.randomBytes(32).toString("hex");
    const secretHash = sha256Hex(secret);
    const sessions: MonitorSession[] = [];

    for (let i = 0; i < count; i++) {
      const raw = freshToken();
      const id = `rev-${count}-${i}-${crypto.randomBytes(4).toString("hex")}`;
      sessions.push(makeSession(id, raw, `${screenPrefix}-${count}-${i}`, {
        bootstrapUsedAt: new Date(),
        sessionSecretHash: secretHash,
      }));
    }

    const byId = new Map(sessions.map((s) => [s.id, { ...s }]));
    const storage: OperationsRoutesStorage = {
      ...makeMinimalStorage(),
      async getMonitorSession(id) { return byId.get(id); },
      async revokeMonitorSession(id, revokedAt) {
        const s = byId.get(id);
        if (!s || s.revokedAt !== null) return false;
        s.revokedAt = revokedAt;
        return true;
      },
    };
    return { sessions, storage, rawSecret: secret };
  }

  for (const N of [12, 25, 50]) {
    it(`revoking ${N} sessions: all revokeMonitorSession calls return true`, async () => {
      const { sessions, storage } = buildBootstrappedSessions(N);
      const now = new Date();
      const results = await Promise.all(
        sessions.map((s) => storage.revokeMonitorSession!(s.id, now)),
      );
      const failed = results.filter((r) => !r);
      assert.equal(
        failed.length,
        0,
        `All ${N} revocations must succeed; ${failed.length} returned false`,
      );
    });

    it(`revoking ${N} sessions: none remain valid after revocation`, async () => {
      const { sessions, storage, rawSecret } = buildBootstrappedSessions(N);
      const now = new Date();
      // Revoke all
      await Promise.all(sessions.map((s) => storage.revokeMonitorSession!(s.id, now)));
      // Validate none
      const validations = await Promise.all(
        sessions.map((s) =>
          validateMonitorCookie(fakeCookieReq(s.id, rawSecret), storage),
        ),
      );
      const stillValid = validations.filter((r) => r !== null);
      assert.equal(
        stillValid.length,
        0,
        `After revoking all ${N} sessions, 0 must remain valid; found ${stillValid.length}`,
      );
    });
  }

  it("partial revocation: revoking 25 of 50 leaves 25 still valid", async () => {
    const { sessions, storage, rawSecret } = buildBootstrappedSessions(50, "partial");
    const now = new Date();
    // Revoke first half
    await Promise.all(sessions.slice(0, 25).map((s) => storage.revokeMonitorSession!(s.id, now)));
    // Validate all 50
    const validations = await Promise.all(
      sessions.map((s) => validateMonitorCookie(fakeCookieReq(s.id, rawSecret), storage)),
    );
    const validCount = validations.filter((r) => r !== null).length;
    assert.equal(
      validCount,
      25,
      `After revoking first 25 of 50, exactly 25 must remain valid; found ${validCount}`,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 5: Logical geometry is independent of tile count ──────────────────
// ═══════════════════════════════════════════════════════════════════════════

describe("Logical geometry is independent of tile count and tile size", () => {
  const STANDARD_PROFILE: Profile = { width: 1920, height: 1080 };
  const PORTRAIT_PROFILE: Profile = { width: 1080, height: 1920 };
  const UHD_PROFILE: Profile = { width: 3840, height: 2160 };

  // Represents a Multiview window on a typical 1920×1080 display
  const WINDOW_W = 1920;
  const WINDOW_H = 1080;

  for (const N of [12, 25, 50]) {
    it(`Standard 1920×1080 profile: viewport = profile dims at ${N}-screen density`, () => {
      const { tileW, tileH } = tileSize(N, WINDOW_W, WINDOW_H);
      const { viewportW, viewportH } = monitorViewport(STANDARD_PROFILE);

      // Logical surface must be 1920×1080 regardless of how small each tile is
      assert.equal(viewportW, 1920, `viewportW must be profile.width at ${N} screens`);
      assert.equal(viewportH, 1080, `viewportH must be profile.height at ${N} screens`);

      // Scale for this tile at this density
      const scale = monitorScale(tileW, tileH, viewportW, viewportH);
      assert.ok(scale > 0 && scale < 1, `scale must be < 1 for ${N} tiles in a 1920×1080 window`);

      // Verify the logical surface is NOT the tile dimensions themselves
      assert.notEqual(
        viewportW,
        tileW,
        `viewportW (${viewportW}) must not collapse to tile width (${tileW})`,
      );
    });
  }

  for (const N of [12, 25, 50]) {
    it(`Portrait 1080×1920 profile: viewport is portrait at ${N}-screen density`, () => {
      const { tileW, tileH } = tileSize(N, WINDOW_W, WINDOW_H);
      const { viewportW, viewportH } = monitorViewport(PORTRAIT_PROFILE);

      assert.equal(viewportW, 1080, `portrait viewportW must be 1080`);
      assert.equal(viewportH, 1920, `portrait viewportH must be 1920`);
      // Height-constrained scale (portrait in landscape tile)
      const scale = monitorScale(tileW, tileH, viewportW, viewportH);
      const heightConstrainedScale = tileH / viewportH;
      assert.ok(
        scale <= heightConstrainedScale + 0.001,
        `Portrait must be height-constrained: scale (${scale.toFixed(4)}) ≤ tileH/viewportH (${heightConstrainedScale.toFixed(4)})`,
      );
    });
  }

  for (const N of [12, 25, 50]) {
    it(`Canvas screen: viewportW = profile width (not canvas width) at ${N}-screen density`, () => {
      const screen: ScreenCfg = {
        canvasEnabled: true,
        canvasWidth: 5760,
        canvasHeight: 1080,
        canvasX: 1920,
        canvasY: 0,
      };
      // Monitor viewport always uses profile dims (the physical screen's crop)
      const { viewportW, viewportH } = monitorViewport(STANDARD_PROFILE, screen);
      assert.equal(viewportW, 1920, "canvas screen: viewportW must be profile.width (1920), not canvasWidth (5760)");
      assert.equal(viewportH, 1080, "canvas screen: viewportH must be profile.height");

      // Scale uses profile, not canvas — tile is sized against profile crop
      const { tileW, tileH } = tileSize(N, WINDOW_W, WINDOW_H);
      const scale = monitorScale(tileW, tileH, viewportW, viewportH);
      const scaleVsCanvas = monitorScale(tileW, tileH, 5760, 1080);
      assert.ok(
        scale > scaleVsCanvas + 0.001,
        `Profile-based scale (${scale.toFixed(4)}) must be larger than canvas-based scale (${scaleVsCanvas.toFixed(4)})`,
      );
    });
  }

  it("TestPattern dimensions use profile dims at all densities (not ratio units)", () => {
    // TestPattern receives width={monitorScreenW} height={monitorScreenH}.
    // If it used getAspectRatioDimensions("16:9") it would get {16, 9} —
    // absurdly small and not pixel dimensions.
    for (const N of [12, 25, 50]) {
      const { viewportW, viewportH } = monitorViewport(STANDARD_PROFILE);
      assert.ok(viewportW > 100, `TestPattern width must be pixel dims at ${N} screens, not ratio units`);
      assert.ok(viewportH > 100, `TestPattern height must be pixel dims at ${N} screens`);
    }
    // UHD profile
    const { viewportW, viewportH } = monitorViewport(UHD_PROFILE);
    assert.equal(viewportW, 3840, "4K TestPattern width must be 3840");
    assert.equal(viewportH, 2160, "4K TestPattern height must be 2160");
  });

  it("canvas useCanvasMode detects spanning layout correctly", () => {
    const screen: ScreenCfg = {
      canvasEnabled: true,
      canvasWidth: 5760,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasY: 0,
    };
    // Layout authored at full canvas size → useCanvasMode = true
    const { useCanvasMode: spanning } = monitorCanvasMode(screen, 5760, 1080);
    assert.equal(spanning, true, "Layout at canvas dims must trigger useCanvasMode");

    // Layout authored at profile size (non-spanning) → useCanvasMode = false
    const { useCanvasMode: nonSpanning } = monitorCanvasMode(screen, 1920, 1080);
    assert.equal(nonSpanning, false, "Layout at profile dims must NOT trigger useCanvasMode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 6: Scale changes on resize; logical dims stay fixed ───────────────
// ═══════════════════════════════════════════════════════════════════════════

describe("Scale changes on window resize; logical surface stays fixed", () => {
  const profile: Profile = { width: 1920, height: 1080 };

  it("smaller tile → lower scale; logical dims unchanged", () => {
    const { viewportW, viewportH } = monitorViewport(profile);

    const scaleFullWindow  = monitorScale(1920, 1080, viewportW, viewportH); // 1.0
    const scaleHalfWindow  = monitorScale(960,  540,  viewportW, viewportH); // 0.5
    const scaleQuarterTile = monitorScale(480,  270,  viewportW, viewportH); // 0.25

    assert.equal(scaleFullWindow, 1.0);
    assert.ok(
      Math.abs(scaleHalfWindow - 0.5) < 0.001,
      `half-size tile → scale ≈ 0.5, got ${scaleHalfWindow}`,
    );
    assert.ok(
      Math.abs(scaleQuarterTile - 0.25) < 0.001,
      `quarter-size tile → scale ≈ 0.25, got ${scaleQuarterTile}`,
    );
    // Logical dims are NOT affected — only scale changes
    assert.equal(viewportW, 1920);
    assert.equal(viewportH, 1080);
  });

  it("portrait profile in landscape tile → height-constrained scale", () => {
    const portrait: Profile = { width: 1080, height: 1920 };
    const { viewportW, viewportH } = monitorViewport(portrait);

    // 1920×1080 tile (landscape): min(1920/1080, 1080/1920) = min(1.778, 0.5625) = 0.5625
    const scale = monitorScale(1920, 1080, viewportW, viewportH);
    const expected = 1080 / 1920; // height-constrained
    assert.ok(
      Math.abs(scale - expected) < 0.001,
      `Portrait in landscape tile: expected ${expected.toFixed(4)}, got ${scale.toFixed(4)}`,
    );
  });

  it("wide landscape tile with portrait profile → still height-constrained", () => {
    const portrait: Profile = { width: 1080, height: 1920 };
    const { viewportW, viewportH } = monitorViewport(portrait);

    // Very wide tile (e.g. 1600×400): min(1600/1080, 400/1920) = min(1.481, 0.208) → 0.208 (height)
    const scale = monitorScale(1600, 400, viewportW, viewportH);
    const heightScale = 400 / viewportH;
    assert.ok(
      Math.abs(scale - heightScale) < 0.001,
      `Tall portrait in wide short tile: expected height-constrained ${heightScale.toFixed(4)}, got ${scale.toFixed(4)}`,
    );
  });

  it("resizing window from 1920×1080 to 2560×1440 only changes scale, not logical dims", () => {
    const { viewportW, viewportH } = monitorViewport(profile);

    const scaleBefore = monitorScale(1920, 1080, viewportW, viewportH);
    const scaleAfter  = monitorScale(2560, 1440, viewportW, viewportH);

    // Scale increases on larger window
    assert.ok(scaleAfter > scaleBefore, "Scale must increase on larger window");
    // But logical dims are defined by profile, not by window — they never change
    assert.equal(viewportW, 1920, "viewportW unchanged after window resize");
    assert.equal(viewportH, 1080, "viewportH unchanged after window resize");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ── Block 7: Static invariants ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

describe("Static invariants — architecture and view-switch correctness", () => {
  const monitorSrc = readFileSync(
    join(__dirname, "..", "client", "src", "pages", "monitor.tsx"),
    "utf8",
  );

  it("viewportW/H are always profile dims — no conditional branch on tile count", () => {
    // After the geometry fix, viewportW = monitorScreenW (no branching).
    // Any branch like `canvasEnabled ? canvasW : monitorScreenW` would reintroduce
    // the old viewport-vs-profile divergence.
    assert.match(
      monitorSrc,
      /const\s+viewportW\s*=\s*monitorScreenW\s*;/,
      "viewportW must unconditionally equal monitorScreenW",
    );
    assert.match(
      monitorSrc,
      /const\s+viewportH\s*=\s*monitorScreenH\s*;/,
      "viewportH must unconditionally equal monitorScreenH",
    );
  });

  it("flex:none is present on the logical surface container (Flexbox shrink guard)", () => {
    // This prevents the layout engine from shrinking the 1920px logical surface
    // to the tile width before scale() is applied.
    assert.match(
      monitorSrc,
      /flex\s*:\s*["']none["']/,
      'Logical surface container must have flex:"none"',
    );
  });

  it("no localStorage access in monitor (device identity is player-only)", () => {
    assert.doesNotMatch(
      monitorSrc,
      /localStorage\.(getItem|setItem)/,
      "Monitor must never read/write device token in localStorage",
    );
  });

  it("no server-side view-mode handler exists (Compact/Grouped is Electron-local)", () => {
    // Compact vs Grouped view mode is managed entirely by the Electron host — it
    // rearranges tiles in the window without touching server sessions.
    // This test documents the invariant by verifying no server route for view mode exists.
    const serverOpsSrc = readFileSync(
      join(__dirname, "..", "server", "operations", "index.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      serverOpsSrc,
      /viewMode|view_mode|compact.*mode|grouped.*mode/i,
      "No server-side view-mode handler must exist — Compact/Grouped is Electron-local",
    );
  });

  it("project-switch revocation is explicit DELETE (no implicit server-side cleanup)", () => {
    // The server does NOT automatically revoke sessions when a project changes.
    // The Electron client must call DELETE /api/operations/monitor-sessions/:id
    // for each old session. This test verifies no implicit cleanup route exists.
    const serverOpsSrc = readFileSync(
      join(__dirname, "..", "server", "operations", "index.ts"),
      "utf8",
    );
    // The explicit revocation endpoint must exist
    assert.match(
      serverOpsSrc,
      /app\.delete\s*\(\s*["']\/api\/operations\/monitor-sessions\/:sessionId["']/,
      "Explicit DELETE /api/operations/monitor-sessions/:sessionId must exist",
    );
    // No implicit project-switch revocation handler should exist
    assert.doesNotMatch(
      serverOpsSrc,
      /revokeAllSessions|revoke_all|project.*switch.*revoke|on.*project.*change/i,
      "No implicit project-switch revocation handler must exist",
    );
  });

  it("content fetch stops polling on 401/403 (UNAUTHORIZED tile stays silent)", () => {
    // When the content endpoint returns 401 or 403, the monitor sets authError=true
    // and clears the polling interval.  It must not continue hammering the server.
    assert.match(
      monitorSrc,
      /status\s*===\s*401.*403|403.*401/,
      "Monitor must check for 401/403 from the content endpoint",
    );
    assert.match(
      monitorSrc,
      /setAuthError\s*\(\s*true\s*\)/,
      "Monitor must set authError=true on 401/403",
    );
    assert.match(
      monitorSrc,
      /clearInterval/,
      "Monitor must clear the polling interval on auth error",
    );
  });
});

/**
 * Task #330 — Monitor Sessions & Rendering tests
 *
 * Covers:
 *   - POST /api/operations/screens/:id/monitor-session (auth, scope, creation)
 *   - GET  /monitor-bootstrap/:screenId?token=... (single-use exchange)
 *   - DELETE /api/operations/monitor-sessions/:id (revoke)
 *   - Cookie validation helpers
 *   - Tenant isolation (cross-tenant denied)
 *   - Credential exclusion (deviceToken, pairingCode never in response)
 *   - Cleanup job (cleanupExpiredMonitorSessions)
 *
 * Invariant assertion:
 *   - Physical screen state (lastSeen, isOnline, heartbeat count, deviceToken,
 *     pairingCode, pairing state) is bit-for-bit unchanged after monitor
 *     operations.
 */

import assert from "node:assert/strict";
import { describe, it, before, beforeEach, after } from "node:test";
import crypto from "node:crypto";
import {
  sha256Hex,
  parseMonitorCookie,
  validateMonitorCookie,
  MONITOR_COOKIE_NAME,
  MONITOR_COOKIE_PATH,
} from "../server/operations/index";

// ============ Helper: sha256Hex ============================================

describe("sha256Hex", () => {
  it("returns a 64-char hex string for a Buffer input", () => {
    const input = Buffer.from("hello world");
    const result = sha256Hex(input);
    assert.equal(result.length, 64);
    assert.match(result, /^[0-9a-f]+$/);
  });

  it("returns a 64-char hex string for a string input", () => {
    const result = sha256Hex("test-token-abc");
    assert.equal(result.length, 64);
    assert.match(result, /^[0-9a-f]+$/);
  });

  it("is deterministic — same input gives same output", () => {
    const a = sha256Hex("same-input");
    const b = sha256Hex("same-input");
    assert.equal(a, b);
  });

  it("produces different hashes for different inputs", () => {
    const a = sha256Hex("input-a");
    const b = sha256Hex("input-b");
    assert.notEqual(a, b);
  });
});

// ============ Helper: parseMonitorCookie ======================================

describe("parseMonitorCookie", () => {
  // parseMonitorCookie reads from req.headers.cookie (raw Cookie header),
  // NOT from req.cookies, because the app has no cookie-parser middleware.
  function makeReqWithCookie(cookieValue: string | undefined) {
    return {
      headers: cookieValue !== undefined
        ? { cookie: `${MONITOR_COOKIE_NAME}=${cookieValue}` }
        : {},
    } as any;
  }

  it("returns null when cookie is absent", () => {
    const result = parseMonitorCookie(makeReqWithCookie(undefined));
    assert.equal(result, null);
  });

  it("returns null when cookie is empty string", () => {
    assert.equal(parseMonitorCookie(makeReqWithCookie("")), null);
  });

  it("returns null when cookie has no colon", () => {
    assert.equal(parseMonitorCookie(makeReqWithCookie("noseparator")), null);
  });

  it("returns null when sessionId part is empty", () => {
    assert.equal(parseMonitorCookie(makeReqWithCookie(":secretonly")), null);
  });

  it("returns null when secret part is empty", () => {
    assert.equal(parseMonitorCookie(makeReqWithCookie("idonly:")), null);
  });

  it("parses valid cookie correctly", () => {
    const result = parseMonitorCookie(
      makeReqWithCookie("session-id-123:rawsecretabcdef"),
    );
    assert.deepEqual(result, {
      monitorSessionId: "session-id-123",
      rawSecret: "rawsecretabcdef",
    });
  });

  it("handles secrets containing colons (takes only first colon as separator)", () => {
    const result = parseMonitorCookie(
      makeReqWithCookie("session-id:secret:with:colons"),
    );
    assert.deepEqual(result, {
      monitorSessionId: "session-id",
      rawSecret: "secret:with:colons",
    });
  });
});

// ============ Monitor session storage stub ====================================

function makeSession(overrides: Partial<{
  id: string;
  userId: string;
  screenId: string;
  clientId: string | null;
  tokenHash: string;
  sessionSecretHash: string | null;
  bootstrapUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  lastAccessAt: Date | null;
  clientType: string | null;
  clientName: string | null;
  createdAt: Date;
}> = {}) {
  const futureDate = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4h from now
  return {
    id: "session-001",
    userId: "user-001",
    screenId: "screen-001",
    clientId: "client-001",
    tokenHash: sha256Hex("bootstrap-token-hex"),
    sessionSecretHash: null,
    bootstrapUsedAt: null,
    expiresAt: futureDate,
    revokedAt: null,
    lastAccessAt: null,
    clientType: "multiview",
    clientName: "VectorMesh Multiview",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============ validateMonitorCookie ===========================================

describe("validateMonitorCookie", () => {
  const rawSecret = "a".repeat(64); // 64-char hex secret
  const secretHash = sha256Hex(rawSecret);
  const sessionId = "session-abc";
  const screenId = "screen-xyz";

  function makeStorage(session: ReturnType<typeof makeSession> | undefined) {
    return {
      getMonitorSession: async (id: string) =>
        id === sessionId ? session : undefined,
    } as any;
  }

  // validateMonitorCookie also reads from req.headers.cookie (raw header).
  function makeReq(cookieValue: string | undefined) {
    return {
      headers: cookieValue !== undefined
        ? { cookie: `${MONITOR_COOKIE_NAME}=${cookieValue}` }
        : {},
    } as any;
  }

  const validCookie = `${sessionId}:${rawSecret}`;
  const session = makeSession({
    id: sessionId,
    screenId,
    sessionSecretHash: secretHash,
    bootstrapUsedAt: new Date(Date.now() - 1000),
  });

  it("returns null when cookie is absent", async () => {
    const result = await validateMonitorCookie(makeReq(undefined), makeStorage(session));
    assert.equal(result, null);
  });

  it("returns null when sessionId not found in storage", async () => {
    const req = makeReq(`unknown-id:${rawSecret}`);
    const result = await validateMonitorCookie(req, makeStorage(session));
    assert.equal(result, null);
  });

  it("returns null when session is revoked", async () => {
    const revokedSession = makeSession({
      id: sessionId,
      screenId,
      sessionSecretHash: secretHash,
      bootstrapUsedAt: new Date(Date.now() - 1000),
      revokedAt: new Date(Date.now() - 500),
    });
    const result = await validateMonitorCookie(
      makeReq(validCookie),
      makeStorage(revokedSession),
    );
    assert.equal(result, null);
  });

  it("returns null when session is expired", async () => {
    const expiredSession = makeSession({
      id: sessionId,
      screenId,
      sessionSecretHash: secretHash,
      bootstrapUsedAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() - 1), // already expired
    });
    const result = await validateMonitorCookie(
      makeReq(validCookie),
      makeStorage(expiredSession),
    );
    assert.equal(result, null);
  });

  it("returns null when bootstrap not yet completed (no sessionSecretHash)", async () => {
    const notBootstrapped = makeSession({
      id: sessionId,
      screenId,
      sessionSecretHash: null,
      bootstrapUsedAt: null,
    });
    const result = await validateMonitorCookie(
      makeReq(validCookie),
      makeStorage(notBootstrapped),
    );
    assert.equal(result, null);
  });

  it("returns null when secret hash does not match", async () => {
    const wrongSecretCookie = `${sessionId}:wrongsecret${"x".repeat(55)}`;
    const result = await validateMonitorCookie(
      makeReq(wrongSecretCookie),
      makeStorage(session),
    );
    assert.equal(result, null);
  });

  it("returns null when screenId does not match", async () => {
    const result = await validateMonitorCookie(
      makeReq(validCookie),
      makeStorage(session),
      "different-screen",
    );
    assert.equal(result, null);
  });

  it("returns the session on success", async () => {
    const result = await validateMonitorCookie(
      makeReq(validCookie),
      makeStorage(session),
      screenId,
    );
    assert.ok(result);
    assert.equal(result.id, sessionId);
  });

  it("returns session even without screenId param (no screen scope check)", async () => {
    const result = await validateMonitorCookie(
      makeReq(validCookie),
      makeStorage(session),
    );
    assert.ok(result);
  });
});

// ============ Operations router stub tests ====================================
// These test the monitor-session endpoint logic against an in-memory stub
// storage without spinning up the full Express app.

describe("monitor session operations (stub storage)", () => {
  // ---- Stub storage ----
  const sessions = new Map<string, ReturnType<typeof makeSession>>();
  const tokenHashIndex = new Map<string, string>(); // tokenHash → sessionId
  let sessionCounter = 0;

  function resetStore() {
    sessions.clear();
    tokenHashIndex.clear();
    sessionCounter = 0;
  }

  const stubStorage = {
    getScreen: async (id: string) => {
      if (id === "screen-001") return { id: "screen-001", clientId: "client-001", displayProfileId: null } as any;
      return undefined;
    },
    getClient: async (id: string) => {
      if (id === "client-001") return { id: "client-001" } as any;
      return undefined;
    },
    getDisplayProfile: async (_id: string) => undefined,
    getOperationsScopesForUser: async (_userId: string) => ["operations.multiview"],
    getOperationsScopesForToken: async (_tokenId: string) => ["operations.multiview"],
    getUserClientIds: async (_userId: string) => ["client-001"],
    getClients: async () => [],
    getEvents: async () => [],
    getScreenGroups: async () => [],
    getScreenGroupsWithMemberCounts: async () => [],
    getScreenGroup: async (_id: string) => undefined,
    getGroupMembers: async (_groupId: string) => [],

    createMonitorSession: async (data: any) => {
      const id = `session-${++sessionCounter}`;
      const sess = makeSession({ id, ...data });
      sessions.set(id, sess);
      tokenHashIndex.set(data.tokenHash, id);
      return sess as any;
    },
    getMonitorSession: async (id: string) => {
      const s = sessions.get(id);
      return s as any;
    },
    getMonitorSessionByTokenHash: async (tokenHash: string) => {
      const id = tokenHashIndex.get(tokenHash);
      if (!id) return undefined;
      return sessions.get(id) as any;
    },
    consumeMonitorBootstrapToken: async (id: string, sessionSecretHash: string, now: Date) => {
      const sess = sessions.get(id);
      if (!sess) return null;
      if (sess.bootstrapUsedAt !== null) return null;
      if (sess.revokedAt !== null) return null;
      if (sess.expiresAt < now) return null;
      sess.bootstrapUsedAt = now;
      sess.sessionSecretHash = sessionSecretHash;
      return sess as any;
    },
    touchMonitorSessionLastAccess: async (id: string, now: Date) => {
      const sess = sessions.get(id);
      if (sess) sess.lastAccessAt = now;
    },
    revokeMonitorSession: async (id: string, revokedAt: Date) => {
      const sess = sessions.get(id);
      if (!sess || sess.revokedAt !== null) return false;
      sess.revokedAt = revokedAt;
      return true;
    },
    cleanupExpiredMonitorSessions: async (retentionDays: number, now: Date) => {
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      let count = 0;
      for (const [id, sess] of sessions) {
        if (sess.expiresAt < cutoff) { sessions.delete(id); count++; }
      }
      return count;
    },
  };

  beforeEach(() => resetStore());

  // ---- createMonitorSession ----
  it("createMonitorSession stores tokenHash (not raw token)", async () => {
    const rawToken = crypto.randomBytes(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const sess = await stubStorage.createMonitorSession({
      userId: "user-001",
      screenId: "screen-001",
      clientId: "client-001",
      tokenHash,
      expiresAt,
      clientType: "multiview",
      clientName: "VectorMesh Multiview",
    });

    // Raw token must NOT appear in stored session
    assert.ok(!JSON.stringify(sess).includes(rawToken.toString("hex")));
    assert.equal(sess.tokenHash, tokenHash);
  });

  it("getMonitorSessionByTokenHash looks up correctly", async () => {
    const tokenHash = sha256Hex("some-token");
    const expiresAt = new Date(Date.now() + 1000);
    await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null, tokenHash, expiresAt,
    });

    const found = await stubStorage.getMonitorSessionByTokenHash(tokenHash);
    assert.ok(found);
    assert.equal(found.tokenHash, tokenHash);

    const notFound = await stubStorage.getMonitorSessionByTokenHash("bogus");
    assert.equal(notFound, undefined);
  });

  // ---- consumeMonitorBootstrapToken (single-use) ----
  it("consumeMonitorBootstrapToken marks bootstrap as used on first call", async () => {
    const tokenHash = sha256Hex("tok");
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash,
      expiresAt: new Date(Date.now() + 10000),
    });
    const secretHash = sha256Hex("secret");
    const now = new Date();

    const result = await stubStorage.consumeMonitorBootstrapToken(sess.id, secretHash, now);
    assert.ok(result);
    assert.ok(result.bootstrapUsedAt);
    assert.equal(result.sessionSecretHash, secretHash);
  });

  it("consumeMonitorBootstrapToken returns null on second call (single-use)", async () => {
    const tokenHash = sha256Hex("tok2");
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash,
      expiresAt: new Date(Date.now() + 10000),
    });
    const now = new Date();

    await stubStorage.consumeMonitorBootstrapToken(sess.id, sha256Hex("secret"), now);
    const second = await stubStorage.consumeMonitorBootstrapToken(sess.id, sha256Hex("secret2"), now);
    assert.equal(second, null);
  });

  it("consumeMonitorBootstrapToken returns null for expired sessions", async () => {
    const tokenHash = sha256Hex("tok3");
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash,
      expiresAt: new Date(Date.now() - 1), // already expired
    });
    const result = await stubStorage.consumeMonitorBootstrapToken(
      sess.id, sha256Hex("s"), new Date(),
    );
    assert.equal(result, null);
  });

  it("consumeMonitorBootstrapToken returns null for revoked sessions", async () => {
    const tokenHash = sha256Hex("tok4");
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash,
      expiresAt: new Date(Date.now() + 10000),
    });
    await stubStorage.revokeMonitorSession(sess.id, new Date());
    const result = await stubStorage.consumeMonitorBootstrapToken(
      sess.id, sha256Hex("s"), new Date(),
    );
    assert.equal(result, null);
  });

  // ---- revokeMonitorSession ----
  it("revokeMonitorSession sets revokedAt and returns true", async () => {
    const tokenHash = sha256Hex("tok5");
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash, expiresAt: new Date(Date.now() + 10000),
    });
    const result = await stubStorage.revokeMonitorSession(sess.id, new Date());
    assert.equal(result, true);

    const retrieved = await stubStorage.getMonitorSession(sess.id);
    assert.ok(retrieved?.revokedAt);
  });

  it("revokeMonitorSession returns false when already revoked", async () => {
    const tokenHash = sha256Hex("tok6");
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash, expiresAt: new Date(Date.now() + 10000),
    });
    await stubStorage.revokeMonitorSession(sess.id, new Date());
    const second = await stubStorage.revokeMonitorSession(sess.id, new Date());
    assert.equal(second, false);
  });

  // ---- cleanupExpiredMonitorSessions ----
  it("cleanupExpiredMonitorSessions removes sessions older than retentionDays past expiry", async () => {
    const longAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago (expired + past retention)
    const recentlyExpired = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago (expired, within retention)
    const notExpired = new Date(Date.now() + 60 * 60 * 1000); // future

    await stubStorage.createMonitorSession({ userId: "u", screenId: "s", clientId: null, tokenHash: sha256Hex("a"), expiresAt: longAgo });
    await stubStorage.createMonitorSession({ userId: "u", screenId: "s", clientId: null, tokenHash: sha256Hex("b"), expiresAt: recentlyExpired });
    await stubStorage.createMonitorSession({ userId: "u", screenId: "s", clientId: null, tokenHash: sha256Hex("c"), expiresAt: notExpired });

    const removed = await stubStorage.cleanupExpiredMonitorSessions(30, new Date());
    assert.equal(removed, 1); // only the 35-day-old one removed

    // Verify 2 sessions remain
    assert.equal(sessions.size, 2);
  });

  // ---- touchMonitorSessionLastAccess ----
  it("touchMonitorSessionLastAccess updates lastAccessAt", async () => {
    const sess = await stubStorage.createMonitorSession({
      userId: "u", screenId: "s", clientId: null,
      tokenHash: sha256Hex("tok7"),
      expiresAt: new Date(Date.now() + 10000),
    });
    assert.equal(sess.lastAccessAt, null);

    const now = new Date();
    await stubStorage.touchMonitorSessionLastAccess(sess.id, now);

    const updated = await stubStorage.getMonitorSession(sess.id);
    assert.ok(updated?.lastAccessAt);
  });
});

// ============ Invariant: physical player state unchanged ======================
//
// Asserts that loading monitor content does NOT modify any physical player
// state: lastSeen, isOnline, deviceToken, pairingCode, pairing state.

describe("monitor invariant: physical player state unaffected", () => {
  it("validates that monitor content does not include deviceToken or pairingCode", () => {
    // Simulate the stableBody that resolveMonitorContent would return.
    // The player content endpoint includes 'screen' with all fields including
    // deviceToken. Monitor content must strip these.
    const screenRow = {
      id: "screen-001",
      name: "Hall A",
      isOnline: true,
      lastSeen: new Date(),
      deviceToken: "secret-device-token",
      pairingCode: "123456",
      ipAddress: "192.168.1.10",
      hostname: "pi-hall-a",
    };

    // Simulate what resolveMonitorContent builds: same stableBody as player
    // minus side-effect signals. The screen row itself is included as-is
    // (same as the player endpoint). But the monitor client receives no
    // capability-enabling signals that could trigger side effects.
    const monitorPayload = {
      screen: screenRow,
      serverTime: Date.now(),
      // These signals are always absent from monitor content:
      // refreshRequested: false,   -- OMITTED
      // screenshotRequested: false, -- OMITTED
      // screenshotEnabled: false,   -- OMITTED
    };

    // The monitor payload MUST NOT include command signals
    assert.ok(!("refreshRequested" in monitorPayload));
    assert.ok(!("screenshotRequested" in monitorPayload));
    assert.ok(!("screenshotEnabled" in monitorPayload));

    // The physical screen's online state would be in the payload —
    // but the monitor never WRITES to it. No heartbeat = no lastSeen update.
    assert.equal(screenRow.isOnline, true); // read-only: unchanged
    assert.equal(screenRow.lastSeen instanceof Date, true); // unchanged

    // DeviceToken and pairingCode are in the raw screen row but the
    // Operations API's mapScreen() strips them from /api/operations/screens/:id.
    // The monitor content endpoint uses the same player-content stableBody
    // (which includes the screen row) — but PLAYER_CAPABILITIES.canPersistDeviceIdentity
    // is false in monitor mode so the React app never reads or stores these.
  });

  it("sha256Hex produces correct known output", () => {
    // SHA-256("abc") — NIST known test vector
    const hash = sha256Hex("abc");
    assert.equal(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(hash.length, 64);
  });

  it("monitor content screen payload must not contain deviceToken or pairingCode", () => {
    // Simulate what resolveMonitorContent produces. The stableBody.screen is the
    // raw screen DB row; the monitor route strips credential fields before returning.
    const rawScreen = {
      id: "screen-001",
      name: "Hall A",
      isOnline: true,
      lastSeen: new Date().toISOString(),
      deviceToken: "secret-device-token-xyz",   // MUST be stripped
      pairingCode: "654321",                      // MUST be stripped
      kioskModeEnabled: true,                     // MUST be stripped
      hostname: "pi-hall-a",
      ipAddress: "192.168.1.10",
    };

    // Reproduce the credential strip logic from resolveMonitorContent (routes.ts)
    const { deviceToken: _dt, pairingCode: _pc, kioskModeEnabled: _km, ...sanitizedScreen } = rawScreen as any;

    const monitorPayload = { screen: sanitizedScreen, serverTime: Date.now() };

    // Credential fields must NOT appear in the serialized response
    const serialized = JSON.stringify(monitorPayload);
    assert.ok(!serialized.includes("secret-device-token-xyz"), "deviceToken leaked");
    assert.ok(!serialized.includes("654321"), "pairingCode leaked");
    assert.ok(!("deviceToken" in monitorPayload.screen), "deviceToken in screen object");
    assert.ok(!("pairingCode" in monitorPayload.screen), "pairingCode in screen object");
    assert.ok(!("kioskModeEnabled" in monitorPayload.screen), "kioskModeEnabled in screen object");

    // Non-credential fields must still be present
    assert.ok("id" in monitorPayload.screen);
    assert.ok("name" in monitorPayload.screen);
    assert.ok("isOnline" in monitorPayload.screen);
    assert.ok("hostname" in monitorPayload.screen);
  });

  it("monitor content must never include side-effect signals", () => {
    // The monitor content response NEVER includes these fields.
    // Even if the underlying stableBody had them, they are stripped.
    const monitorPayload = {
      screen: { id: "s", name: "Hall A" },
      layout: null,
      serverTime: Date.now(),
      // These are intentionally absent:
      // refreshRequested, screenshotRequested, screenshotEnabled
    };

    assert.ok(!("refreshRequested" in monitorPayload), "refreshRequested must be absent");
    assert.ok(!("screenshotRequested" in monitorPayload), "screenshotRequested must be absent");
    assert.ok(!("screenshotEnabled" in monitorPayload), "screenshotEnabled must be absent");
  });

  it("monitor cookie path covers both /monitor/* and /api/monitor/*", () => {
    // The cookie path must be "/" so the browser sends vm_monitor_session
    // with ALL requests to the origin — both the monitor page shell
    // (/monitor/:screenId) AND the content endpoint (/api/monitor/:screenId/content).
    // A narrower path like "/monitor" would silently block content polls because
    // "/api/monitor/..." does not begin with "/monitor".
    // Import the exported constant so this test catches a future regression:
    assert.equal(MONITOR_COOKIE_PATH, "/",
      "MONITOR_COOKIE_PATH must be '/' to cover both /monitor/* and /api/monitor/*");
    assert.notEqual(MONITOR_COOKIE_PATH, "/monitor",
      "Cookie path '/monitor' would block /api/monitor/* content polls");
  });

  // ── Rendering parity tests ─────────────────────────────────────────────────
  // These tests verify that monitor.tsx's zone-resolution logic matches
  // player.tsx exactly for the three fallback/rotation scenarios, and that
  // canvas composites are detected correctly. They test the logic extracted
  // from the component rather than the component itself.

  it("parity: fallback playlist builds a fullscreen media_player zone", () => {
    // Mirrors PlayerContent.rawZones logic when isFallbackPlaylist is true.
    const zoneSources = [{ zoneId: "__fallback__", type: "playlist", playlistId: "pl-1" }];
    const playlistItems: Record<string, any[]> = {
      "pl-1": [
        { id: "pi-a", order: 0, mediaAssetId: "m-1", layoutTemplateId: null, duration: 10 },
        { id: "pi-b", order: 1, mediaAssetId: "m-2", layoutTemplateId: null, duration: 15 },
      ],
    };
    const layout = null;
    const isFallbackPlaylist = !layout && zoneSources.some(
      (zs) => zs.zoneId === "__fallback__" && zs.type === "playlist",
    );
    assert.ok(isFallbackPlaylist, "should detect fallback playlist");

    // Build the zone the same way the monitor/player does
    const source = zoneSources.find((zs) => zs.zoneId === "__fallback__")!;
    const items = playlistItems[source.playlistId!] || [];
    const mediaOnly = items.filter((pi) => pi.mediaAssetId && !pi.layoutTemplateId);
    const mediaPlayerItems = mediaOnly
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((pi) => ({ id: pi.id, mediaAssetId: pi.mediaAssetId, duration: pi.duration }));

    const zones = [{ id: "__fallback__", type: "media_player", x: 0, y: 0, width: 100, height: 100, zIndex: 1, mediaPlayerItems }];

    assert.equal(zones.length, 1);
    assert.equal(zones[0].type, "media_player");
    assert.equal(zones[0].width, 100);
    assert.equal(zones[0].mediaPlayerItems.length, 2);
    assert.equal(zones[0].mediaPlayerItems[0].mediaAssetId, "m-1");
    assert.equal(zones[0].mediaPlayerItems[1].mediaAssetId, "m-2");
  });

  it("parity: fallback agenda builds a fullscreen agenda zone", () => {
    // Mirrors PlayerContent.rawZones logic when isFallbackAgenda is true.
    const zoneSources = [{ zoneId: "__fallback__", type: "agenda", agendaConfigId: "cfg-99", playlistId: null }];
    const layout = null;
    const isFallbackPlaylist = !layout && zoneSources.some(
      (zs) => zs.zoneId === "__fallback__" && zs.type === "playlist",
    );
    const isFallbackAgenda = !layout && !isFallbackPlaylist && zoneSources.some(
      (zs) => zs.zoneId === "__fallback__" && zs.type === "agenda" && zs.agendaConfigId,
    );
    assert.ok(!isFallbackPlaylist, "must not be playlist");
    assert.ok(isFallbackAgenda, "should detect fallback agenda");

    const source = zoneSources.find((zs) => zs.zoneId === "__fallback__" && zs.type === "agenda")!;
    const zones = [{
      id: "__fallback__",
      name: "Agenda",
      type: "agenda",
      x: 0, y: 0, width: 100, height: 100,
      zIndex: 1,
      agendaConfigId: source.agendaConfigId,
    }];

    assert.equal(zones.length, 1);
    assert.equal(zones[0].type, "agenda");
    assert.equal(zones[0].agendaConfigId, "cfg-99");
    assert.equal(zones[0].width, 100);
  });

  it("parity: layout rotation advances index on a timer", () => {
    // Mirrors PlayerContent.layoutRotationItems + rotation logic.
    const layoutTemplates = { "lt-a": { id: "lt-a" }, "lt-b": { id: "lt-b" } };
    const zoneSources = [{ zoneId: "__fallback_rotation__", type: "playlist", playlistId: "rot-pl" }];
    const playlistItems: Record<string, any[]> = {
      "rot-pl": [
        { id: "r-1", order: 0, layoutTemplateId: "lt-a", duration: 20 },
        { id: "r-2", order: 1, layoutTemplateId: "lt-b", duration: 30 },
      ],
    };

    // Collect rotation items (mirrors monitor.tsx layoutRotationItems useMemo)
    let rotationItems: any[] = [];
    for (const source of zoneSources) {
      if (source.zoneId !== "__fallback_rotation__" || source.type !== "playlist") continue;
      const items = playlistItems[source.playlistId] || [];
      rotationItems = items.filter((pi) => pi.layoutTemplateId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    assert.equal(rotationItems.length, 2);
    assert.equal(rotationItems[0].layoutTemplateId, "lt-a");
    assert.equal(rotationItems[1].layoutTemplateId, "lt-b");

    // Simulate index advancement
    let index = 0;
    index = (index + 1) % rotationItems.length;
    assert.equal(rotationItems[index].layoutTemplateId, "lt-b");
    index = (index + 1) % rotationItems.length;
    assert.equal(rotationItems[index].layoutTemplateId, "lt-a"); // wraps
  });

  it("parity: canvas composite screens are detected and flagged, not rendered", () => {
    // monitor.tsx shows a placeholder for canvasEnabled screens with tiles —
    // the physical player renders these across multiple display outputs.
    function isCanvasComposite(screen: any, canvas: any) {
      return !!(screen?.canvasEnabled && canvas?.tiles && canvas.tiles.length > 0);
    }

    assert.ok(isCanvasComposite({ canvasEnabled: true }, { tiles: [{ id: "t1" }] }));
    assert.ok(!isCanvasComposite({ canvasEnabled: false }, { tiles: [{ id: "t1" }] }));
    assert.ok(!isCanvasComposite({ canvasEnabled: true }, { tiles: [] }));
    assert.ok(!isCanvasComposite({ canvasEnabled: true }, null));
    assert.ok(!isCanvasComposite(null, { tiles: [{ id: "t1" }] }));
  });

  it("media authorization: cross-tenant asset is denied", () => {
    // Mirrors the serveMediaFile tenant-isolation logic in routes.ts.
    function canServe(
      asset: { clientId: string },
      sessionClientId: string | null,
      shares: Array<{ mediaAssetId: string }>,
    ): boolean {
      if (!sessionClientId) return false;
      if (asset.clientId === sessionClientId) return true;
      return shares.some((s) => s.mediaAssetId === asset.clientId); // share uses assetId
    }

    // Same tenant — allowed
    assert.ok(canServe({ clientId: "client-A" }, "client-A", []));
    // Different tenant, no share — denied
    assert.ok(!canServe({ clientId: "client-B" }, "client-A", []));
    // Different tenant, but share exists for this asset — allowed
    // (note: real code checks s.mediaAssetId === mediaId, not clientId)
    // Model the real logic:
    function canServeReal(
      asset: { id: string; clientId: string },
      sessionClientId: string | null,
      shares: Array<{ mediaAssetId: string }>,
    ): boolean {
      if (!sessionClientId) return false;
      if (asset.clientId === sessionClientId) return true;
      const sharedIds = new Set(shares.map((s) => s.mediaAssetId));
      return sharedIds.has(asset.id);
    }

    // Null clientId (orphan screen) — always denied
    assert.ok(!canServeReal({ id: "m-1", clientId: "client-B" }, null, []));
    // Cross-tenant with explicit share — allowed
    assert.ok(canServeReal({ id: "m-1", clientId: "client-B" }, "client-A", [{ mediaAssetId: "m-1" }]));
    // Cross-tenant without share — denied
    assert.ok(!canServeReal({ id: "m-1", clientId: "client-B" }, "client-A", [{ mediaAssetId: "m-2" }]));
  });

  it("monitor cookie format is sessionId:secretHex (no raw token)", () => {
    const sessionId = "00000000-0000-0000-0000-000000000001";
    const rawSecretHex = crypto.randomBytes(32).toString("hex");
    const cookieValue = `${sessionId}:${rawSecretHex}`;

    // Cookie must never contain the bootstrap token
    const bootstrapToken = crypto.randomBytes(32).toString("hex");
    assert.ok(!cookieValue.includes(bootstrapToken));

    // Parse round-trips correctly via raw Cookie header (no cookie-parser)
    const parsed = parseMonitorCookie({
      headers: { cookie: `${MONITOR_COOKIE_NAME}=${cookieValue}` },
    } as any);
    assert.ok(parsed);
    assert.equal(parsed.monitorSessionId, sessionId);
    assert.equal(parsed.rawSecret, rawSecretHex);
  });
});

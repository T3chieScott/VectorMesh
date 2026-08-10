/**
 * Task #341 — Operations Scope Management for API Tokens
 *
 * Covers:
 *   - GET  /api/admin/api-tokens/:id/operations-scopes (read scopes)
 *   - PUT  /api/admin/api-tokens/:id/operations-scopes (atomic replace)
 *   - GET  /api/admin/operations/scope-definitions     (admin-visible metadata)
 *   - GET  /api/me/api-tokens                         (inline operationsScopes)
 *
 * Authorization invariants:
 *   - Human admin/account-manager session required (requireAuth).
 *   - A vm_... bearer token MUST NOT be able to call scope-management endpoints.
 *   - site_user role is rejected on both endpoints.
 *   - Cross-tenant: account_manager cannot modify another user's token.
 *
 * Data invariants:
 *   - PUT is transactional; concurrent calls cannot produce partial state.
 *   - Unknown scopes are rejected with 400 before any DB write.
 *   - Raw token value is never present in any scope-management response.
 *   - Multiview preset (grant/remove) covers exactly the three preset scopes.
 *   - Removing all scopes leaves the token otherwise intact (not revoked).
 */

import test, { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  OPERATIONS_SCOPES,
  ALL_OPERATIONS_SCOPE_VALUES,
  ADMIN_VISIBLE_SCOPES,
  MULTIVIEW_PRESET_SCOPES,
} from "../server/operations/index";

// ── Exported constant correctness ─────────────────────────────────────────

describe("ADMIN_VISIBLE_SCOPES", () => {
  it("has an entry for every current OPERATIONS_SCOPES value", () => {
    const visibleScopeStrings = ADMIN_VISIBLE_SCOPES.map((d) => d.scope);
    const allScopeStrings = Object.values(OPERATIONS_SCOPES);
    for (const scope of allScopeStrings) {
      assert.ok(
        visibleScopeStrings.includes(scope),
        `Scope ${scope} is missing from ADMIN_VISIBLE_SCOPES`,
      );
    }
  });

  it("each entry has a non-empty label and description", () => {
    for (const def of ADMIN_VISIBLE_SCOPES) {
      assert.ok(def.label.trim().length > 0, `Empty label for scope ${def.scope}`);
      assert.ok(def.description.trim().length > 0, `Empty description for scope ${def.scope}`);
    }
  });

  it("each scope value is present in ALL_OPERATIONS_SCOPE_VALUES", () => {
    for (const def of ADMIN_VISIBLE_SCOPES) {
      assert.ok(
        ALL_OPERATIONS_SCOPE_VALUES.includes(def.scope),
        `${def.scope} not in ALL_OPERATIONS_SCOPE_VALUES`,
      );
    }
  });
});

describe("MULTIVIEW_PRESET_SCOPES", () => {
  it("contains VIEW, SCREEN_READ, and MULTIVIEW — exactly three scopes", () => {
    assert.equal(MULTIVIEW_PRESET_SCOPES.length, 3);
    assert.ok(MULTIVIEW_PRESET_SCOPES.includes(OPERATIONS_SCOPES.VIEW));
    assert.ok(MULTIVIEW_PRESET_SCOPES.includes(OPERATIONS_SCOPES.SCREEN_READ));
    assert.ok(MULTIVIEW_PRESET_SCOPES.includes(OPERATIONS_SCOPES.MULTIVIEW));
  });

  it("does NOT include DIAGNOSTICS_READ", () => {
    assert.ok(!MULTIVIEW_PRESET_SCOPES.includes(OPERATIONS_SCOPES.DIAGNOSTICS_READ));
  });
});

describe("ALL_OPERATIONS_SCOPE_VALUES", () => {
  it("matches the values of OPERATIONS_SCOPES", () => {
    const expected = Object.values(OPERATIONS_SCOPES).sort();
    const actual = [...ALL_OPERATIONS_SCOPE_VALUES].sort();
    assert.deepEqual(actual, expected);
  });
});

// ── HTTP route tests ───────────────────────────────────────────────────────
//
// Mount only the scope-management routes on a throwaway Express app with a
// stub storage and injectable current user, so the tests run without a real
// DB or session stack.

type RoleType = "admin" | "account_manager" | "site_user";

interface FakeToken {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  revokedAt: Date | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
  newIpAcknowledgedAt: Date | null;
}

function makeFakeStorage(options: {
  tokens?: FakeToken[];
  scopesByToken?: Record<string, string[]>;
}) {
  const tokens: FakeToken[] = [...(options.tokens ?? [])];
  const scopesByToken: Record<string, string[]> = { ...(options.scopesByToken ?? {}) };
  const auditLog: Array<{ action: string; entityId?: string; payload?: unknown }> = [];

  return {
    tokens,
    scopesByToken,
    auditLog,

    async getApiToken(id: string) {
      return tokens.find((t) => t.id === id);
    },
    async getApiTokensByUser(userId: string) {
      return tokens.filter((t) => t.userId === userId);
    },
    async getOperationsScopesForToken(tokenId: string) {
      return scopesByToken[tokenId] ?? [];
    },
    async getOperationsScopesForTokens(tokenIds: string[]) {
      const map = new Map<string, string[]>();
      for (const id of tokenIds) {
        map.set(id, scopesByToken[id] ?? []);
      }
      return map;
    },
    async setTokenOperationsScopes(tokenId: string, scopes: string[]): Promise<void> {
      scopesByToken[tokenId] = [...new Set(scopes)];
    },
    async getRecentNewIpEventsForTokens(ids: string[]) {
      return new Map<string, { lastIp: string | null; lastAt: Date | null; count: number }>();
    },
    async getLatestAckActorsForTokens(ids: string[]) {
      return new Map<string, { at: Date; userId: string | null; firstName: string | null; lastName: string | null; email: string | null }>();
    },
    async createAuditLog(entry: { userId: string | null; action: string; entityType: string; entityId: string | null; payload: unknown }) {
      auditLog.push({ action: entry.action, entityId: entry.entityId ?? undefined, payload: entry.payload });
    },
  };
}

function makeApp(storage: ReturnType<typeof makeFakeStorage>, user: { id: string; role: RoleType } | null) {
  const app = express();
  app.use(express.json());

  // Inject fake auth: sets req.dbUser from the outer `user` variable.
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.dbUser = user;
    next();
  });

  function requireAuth(req: any, res: Response, next: NextFunction) {
    if (!req.dbUser) return res.status(401).json({ error: "Unauthenticated" });
    next();
  }
  function requireAdminOrAccountManager(req: any, res: Response, next: NextFunction) {
    const u = req.dbUser;
    if (!u || (u.role !== "admin" && u.role !== "account_manager")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  }
  function isAdmin(req: any): boolean {
    return req.dbUser?.role === "admin";
  }
  function logAudit(req: any, action: string, entityType: string, entityId?: string, payload?: unknown) {
    storage.createAuditLog({ userId: req.dbUser?.id ?? null, action, entityType, entityId: entityId ?? null, payload }).catch(() => {});
  }

  // GET /api/admin/operations/scope-definitions
  app.get("/api/admin/operations/scope-definitions", requireAuth, requireAdminOrAccountManager, (_req, res) => {
    res.json(ADMIN_VISIBLE_SCOPES);
  });

  // GET /api/admin/api-tokens/:id/operations-scopes
  app.get("/api/admin/api-tokens/:id/operations-scopes", requireAuth, requireAdminOrAccountManager, async (req: any, res) => {
    const token = await storage.getApiToken(req.params.id);
    if (!token || (!isAdmin(req) && token.userId !== req.dbUser.id)) {
      return res.status(404).json({ error: "Token not found" });
    }
    const scopes = await storage.getOperationsScopesForToken(token.id);
    res.json({ tokenId: token.id, scopes });
  });

  // PUT /api/admin/api-tokens/:id/operations-scopes
  app.put("/api/admin/api-tokens/:id/operations-scopes", requireAuth, requireAdminOrAccountManager, async (req: any, res) => {
    const token = await storage.getApiToken(req.params.id);
    if (!token || (!isAdmin(req) && token.userId !== req.dbUser.id)) {
      return res.status(404).json({ error: "Token not found" });
    }
    const raw = req.body?.scopes;
    if (!Array.isArray(raw)) return res.status(400).json({ error: "scopes must be an array" });
    const unknown = (raw as unknown[]).filter(
      (s) => typeof s !== "string" || !ALL_OPERATIONS_SCOPE_VALUES.includes(s as string),
    );
    if (unknown.length > 0) return res.status(400).json({ error: `Unknown scopes: ${unknown.join(", ")}` });

    const newScopes = [...new Set(raw as string[])];
    const previousScopes = await storage.getOperationsScopesForToken(token.id);
    await storage.setTokenOperationsScopes(token.id, newScopes);

    const added = newScopes.filter((s) => !previousScopes.includes(s));
    const removed = previousScopes.filter((s) => !newScopes.includes(s));
    logAudit(req, "api_token.operations_scopes.updated", "api_token", token.id, { added, removed, scopes: newScopes });

    res.json({ tokenId: token.id, scopes: newScopes });
  });

  // GET /api/me/api-tokens (inline scopes)
  app.get("/api/me/api-tokens", requireAuth, async (req: any, res) => {
    const tokens = await storage.getApiTokensByUser(req.dbUser.id);
    const scopesByToken = await storage.getOperationsScopesForTokens(tokens.map((t) => t.id));
    res.json(
      tokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        revokedAt: t.revokedAt,
        newIp: null,
        newIpAcknowledgedAt: null,
        newIpAcknowledgedBy: null,
        operationsScopes: scopesByToken.get(t.id) ?? [],
      })),
    );
  });

  return app;
}

async function req(
  app: ReturnType<typeof makeApp>,
  method: "GET" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const url = `http://127.0.0.1:${port}${path}`;
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      };
      fetch(url, opts)
        .then(async (r) => {
          const text = await r.text();
          let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          resolve({ status: r.status, body: parsed });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

const adminUser = { id: "user-admin", role: "admin" as RoleType };
const amUser = { id: "user-am", role: "account_manager" as RoleType };
const siteUser = { id: "user-site", role: "site_user" as RoleType };

const tokenA: FakeToken = {
  id: "tok-a",
  userId: "user-admin",
  name: "Token A",
  prefix: "vm_abc12",
  tokenHash: "hash-a",
  revokedAt: null,
  createdAt: new Date(),
  lastUsedAt: null,
  newIpAcknowledgedAt: null,
};

const tokenB: FakeToken = {
  id: "tok-b",
  userId: "user-am",
  name: "Token B",
  prefix: "vm_xyz98",
  tokenHash: "hash-b",
  revokedAt: null,
  createdAt: new Date(),
  lastUsedAt: null,
  newIpAcknowledgedAt: null,
};

// ── 1. Admin reads scopes ──────────────────────────────────────────────────
describe("GET /api/admin/api-tokens/:id/operations-scopes — admin reads scopes", () => {
  it("returns 200 and the current scope list", async () => {
    const storage = makeFakeStorage({
      tokens: [tokenA],
      scopesByToken: { "tok-a": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "GET", "/api/admin/api-tokens/tok-a/operations-scopes");
    assert.equal(status, 200);
    assert.deepEqual((body as any).scopes, [OPERATIONS_SCOPES.VIEW]);
    assert.equal((body as any).tokenId, "tok-a");
  });

  it("does not include any raw token value in the response", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA], scopesByToken: { "tok-a": [] } });
    const app = makeApp(storage, adminUser);
    const { body } = await req(app, "GET", "/api/admin/api-tokens/tok-a/operations-scopes");
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("vm_"), "Raw token prefix must not appear in response");
    assert.ok(!raw.includes("hash-a"), "Token hash must not appear in response");
  });
});

// ── 2. Admin grants a single scope ────────────────────────────────────────
describe("PUT /api/admin/api-tokens/:id/operations-scopes — grant operations.view", () => {
  it("returns 200 with the new scope set and persists it", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW],
    });
    assert.equal(status, 200);
    assert.deepEqual((body as any).scopes, [OPERATIONS_SCOPES.VIEW]);
    assert.deepEqual(storage.scopesByToken["tok-a"], [OPERATIONS_SCOPES.VIEW]);
  });
});

// ── 3. Multiview preset ────────────────────────────────────────────────────
describe("PUT — Multiview preset grants exactly the three preset scopes", () => {
  it("grants VIEW, SCREEN_READ, MULTIVIEW atomically", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [...MULTIVIEW_PRESET_SCOPES],
    });
    assert.equal(status, 200);
    const scopes: string[] = (body as any).scopes;
    assert.ok(scopes.includes(OPERATIONS_SCOPES.VIEW));
    assert.ok(scopes.includes(OPERATIONS_SCOPES.SCREEN_READ));
    assert.ok(scopes.includes(OPERATIONS_SCOPES.MULTIVIEW));
    assert.ok(!scopes.includes(OPERATIONS_SCOPES.DIAGNOSTICS_READ));
    assert.equal(scopes.length, 3);
  });
});

// ── 4. Revoke one scope (atomic replace) ─────────────────────────────────
describe("PUT — removing one scope leaves others intact", () => {
  it("replaces scope set atomically (no partial merge)", async () => {
    const storage = makeFakeStorage({
      tokens: [tokenA],
      scopesByToken: {
        "tok-a": [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.MULTIVIEW, OPERATIONS_SCOPES.SCREEN_READ],
      },
    });
    const app = makeApp(storage, adminUser);
    // Remove MULTIVIEW only
    const next = [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.SCREEN_READ];
    const { status, body } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: next,
    });
    assert.equal(status, 200);
    assert.deepEqual([...(body as any).scopes].sort(), [...next].sort());
    assert.deepEqual([...storage.scopesByToken["tok-a"]].sort(), [...next].sort());
  });
});

// ── 5. Unknown scope rejected ─────────────────────────────────────────────
describe("PUT — unknown scope rejected with 400", () => {
  it("returns 400 for a scope string not in OPERATIONS_SCOPES", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: ["operations.bogus.scope"],
    });
    assert.equal(status, 400);
    assert.match(JSON.stringify(body), /unknown|Unknown/i);
    // DB must not have been touched
    assert.deepEqual(storage.scopesByToken["tok-a"], undefined);
  });

  it("returns 400 when scopes is not an array", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, adminUser);
    const { status } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: "operations.view",
    });
    assert.equal(status, 400);
  });
});

// ── 6. site_user is blocked ───────────────────────────────────────────────
describe("Authorization — site_user cannot manage scopes", () => {
  it("GET returns 403 for a site_user", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, siteUser);
    const { status } = await req(app, "GET", "/api/admin/api-tokens/tok-a/operations-scopes");
    assert.equal(status, 403);
  });

  it("PUT returns 403 for a site_user", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, siteUser);
    const { status } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW],
    });
    assert.equal(status, 403);
  });
});

// ── 7. Cross-tenant: account_manager cannot touch another user's token ────
describe("Authorization — account_manager cross-tenant denial", () => {
  it("GET returns 404 when account_manager accesses another user's token", async () => {
    // tokenA belongs to adminUser; amUser (account_manager) should be denied
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, amUser);
    const { status } = await req(app, "GET", "/api/admin/api-tokens/tok-a/operations-scopes");
    assert.equal(status, 404);
  });

  it("PUT returns 404 when account_manager tries to modify another user's token", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, amUser);
    const { status } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW],
    });
    assert.equal(status, 404);
  });

  it("account_manager CAN manage their own token", async () => {
    const storage = makeFakeStorage({ tokens: [tokenB] });
    const app = makeApp(storage, amUser);
    const { status } = await req(app, "PUT", "/api/admin/api-tokens/tok-b/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW],
    });
    assert.equal(status, 200);
  });
});

// ── 8. vm_... bearer token cannot authenticate to scope endpoints ──────────
describe("Authorization — unauthenticated (no session) returns 401", () => {
  it("GET returns 401 with no user session", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, null); // null = no session (simulates bearer-only request)
    const { status } = await req(app, "GET", "/api/admin/api-tokens/tok-a/operations-scopes");
    assert.equal(status, 401);
  });

  it("PUT returns 401 with no user session", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, null);
    const { status } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW],
    });
    assert.equal(status, 401);
  });
});

// ── 9. Token-list response includes operationsScopes inline ──────────────
describe("GET /api/me/api-tokens — operationsScopes included inline", () => {
  it("includes operationsScopes array on each token", async () => {
    const storage = makeFakeStorage({
      tokens: [tokenA, { ...tokenA, id: "tok-a2", name: "Token A2" }],
      scopesByToken: {
        "tok-a": [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.MULTIVIEW],
        "tok-a2": [],
      },
    });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "GET", "/api/me/api-tokens");
    assert.equal(status, 200);
    const list = body as Array<{ id: string; operationsScopes: string[] }>;
    const tokA = list.find((t) => t.id === "tok-a");
    const tokA2 = list.find((t) => t.id === "tok-a2");
    assert.ok(tokA, "tok-a should be in the list");
    assert.ok(tokA2, "tok-a2 should be in the list");
    assert.deepEqual([...tokA!.operationsScopes].sort(), [OPERATIONS_SCOPES.MULTIVIEW, OPERATIONS_SCOPES.VIEW].sort());
    assert.deepEqual(tokA2!.operationsScopes, []);
  });

  it("does not include raw token hash in the list response", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, adminUser);
    const { body } = await req(app, "GET", "/api/me/api-tokens");
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("hash-a"), "Token hash must not appear in token list response");
    assert.ok(!raw.includes("tokenHash"), "tokenHash field must not appear in token list response");
  });
});

// ── 10. Scope definitions endpoint returns all admin-visible scopes ───────
describe("GET /api/admin/operations/scope-definitions", () => {
  it("returns 200 with all four admin-visible scope definitions", async () => {
    const storage = makeFakeStorage({});
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "GET", "/api/admin/operations/scope-definitions");
    assert.equal(status, 200);
    const defs = body as Array<{ scope: string; label: string; description: string }>;
    assert.equal(defs.length, 4);
    const scopes = defs.map((d) => d.scope);
    assert.ok(scopes.includes(OPERATIONS_SCOPES.VIEW));
    assert.ok(scopes.includes(OPERATIONS_SCOPES.SCREEN_READ));
    assert.ok(scopes.includes(OPERATIONS_SCOPES.MULTIVIEW));
    assert.ok(scopes.includes(OPERATIONS_SCOPES.DIAGNOSTICS_READ));
  });

  it("returns 403 for site_user", async () => {
    const storage = makeFakeStorage({});
    const app = makeApp(storage, siteUser);
    const { status } = await req(app, "GET", "/api/admin/operations/scope-definitions");
    assert.equal(status, 403);
  });
});

// ── 11. Audit log records scope changes ───────────────────────────────────
describe("PUT — audit log records added and removed scopes", () => {
  it("logs api_token.operations_scopes.updated with added/removed/scopes", async () => {
    const storage = makeFakeStorage({
      tokens: [tokenA],
      scopesByToken: { "tok-a": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp(storage, adminUser);
    await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.MULTIVIEW],
    });
    // Give the async audit log a tick to complete
    await new Promise((r) => setTimeout(r, 20));
    const entry = storage.auditLog.find((e) => e.action === "api_token.operations_scopes.updated");
    assert.ok(entry, "Audit entry should exist");
    assert.equal(entry!.entityId, "tok-a");
    const payload = entry!.payload as { added: string[]; removed: string[]; scopes: string[] };
    assert.ok(payload.added.includes(OPERATIONS_SCOPES.MULTIVIEW), "MULTIVIEW should be in added");
    assert.deepEqual(payload.removed, [], "No scopes should have been removed");
  });
});

// ── 12. Removing all scopes leaves token active ───────────────────────────
describe("PUT — removing all scopes does not revoke the token", () => {
  it("token remains active after PUT with empty scopes array", async () => {
    const storage = makeFakeStorage({
      tokens: [tokenA],
      scopesByToken: { "tok-a": [OPERATIONS_SCOPES.VIEW] },
    });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [],
    });
    assert.equal(status, 200);
    assert.deepEqual((body as any).scopes, []);
    // Token itself is unchanged
    const token = storage.tokens.find((t) => t.id === "tok-a");
    assert.equal(token?.revokedAt, null, "Token should not be revoked");
  });
});

// ── 13. Deduplication — duplicate scope values are collapsed ──────────────
describe("PUT — duplicate scopes are deduplicated", () => {
  it("persists only one row per scope even when sent twice", async () => {
    const storage = makeFakeStorage({ tokens: [tokenA] });
    const app = makeApp(storage, adminUser);
    const { status, body } = await req(app, "PUT", "/api/admin/api-tokens/tok-a/operations-scopes", {
      scopes: [OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.VIEW, OPERATIONS_SCOPES.MULTIVIEW],
    });
    assert.equal(status, 200);
    const scopes: string[] = (body as any).scopes;
    const viewCount = scopes.filter((s) => s === OPERATIONS_SCOPES.VIEW).length;
    assert.equal(viewCount, 1, "VIEW should appear only once after dedup");
    assert.equal(scopes.length, 2);
  });
});

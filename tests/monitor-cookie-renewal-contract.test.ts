/**
 * Monitor bootstrap/cookie replacement contract.
 *
 * This intentionally uses the real Operations routes and a small RFC-6265
 * cookie jar rather than testing setMonitorCookie in isolation.  The jar
 * models host-only/path replacement and sends the resulting Cookie header to
 * same-origin API requests.
 *
 * Limit: a Node HTTP jar cannot reproduce a browser's storage partitioning
 * implementation or prove that document JavaScript cannot read an HttpOnly
 * cookie.  The latter is represented here by asserting the actual cookie
 * attributes and by never putting the cookie in a document/API response.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { AddressInfo } from "node:net";
import {
  mountOperationsRoutes,
  sha256Hex,
  MONITOR_COOKIE_NAME,
  type OperationsRoutesStorage,
  type OperationsRoutesAuth,
  type OperationsMonitorDeps,
} from "../server/operations/index";
import type { MonitorSession } from "../shared/schema";

type SessionFixture = {
  session: MonitorSession;
  rawBootstrapToken: string;
};

function makeSession(id: string, rawBootstrapToken: string): MonitorSession {
  return {
    id,
    userId: "operator-1",
    screenId: "screen-renewal",
    clientId: null,
    tokenHash: sha256Hex(rawBootstrapToken),
    sessionSecretHash: null,
    bootstrapUsedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    lastAccessAt: null,
    clientType: "multiview",
    clientName: "cookie renewal contract",
    createdAt: new Date(),
  };
}

function makeStorage(fixtures: SessionFixture[], lookedUpIds: string[]): OperationsRoutesStorage {
  const byId = new Map(fixtures.map(({ session }) => [session.id, session]));
  const byTokenHash = new Map(fixtures.map(({ session }) => [session.tokenHash, session]));

  return {
    getClients: async () => [],
    getClient: async () => undefined,
    getUserClientIds: async () => [],
    getEvents: async () => [],
    getScreenGroups: async () => [],
    getScreenGroupsWithMemberCounts: async () => [],
    getScreenGroup: async () => undefined,
    getGroupMembers: async () => [],
    getScreen: async () => ({ id: "screen-renewal", clientId: null } as any),
    getDisplayProfile: async () => undefined,
    getScreensByClientId: async () => [],
    getAllScreenGroupMemberships: async () => [],
    getOperationsScopesForUser: async () => ["operations.multiview"],
    getOperationsScopesForToken: async () => ["operations.multiview"],
    createMonitorSession: async () => {
      throw new Error("not used by this contract test");
    },
    getMonitorSession: async (id: string) => {
      lookedUpIds.push(id);
      return byId.get(id);
    },
    getMonitorSessionByTokenHash: async (tokenHash: string) => byTokenHash.get(tokenHash),
    consumeMonitorBootstrapToken: async (id, sessionSecretHash, usedAt) => {
      const session = byId.get(id);
      if (
        !session ||
        session.bootstrapUsedAt !== null ||
        session.revokedAt !== null ||
        session.expiresAt < usedAt
      ) {
        return null;
      }
      session.bootstrapUsedAt = usedAt;
      session.sessionSecretHash = sessionSecretHash;
      return session;
    },
    touchMonitorSessionLastAccess: async (id, now) => {
      const session = byId.get(id);
      if (session) session.lastAccessAt = now;
    },
    revokeMonitorSession: async (id, revokedAt) => {
      const session = byId.get(id);
      if (!session || session.revokedAt !== null) return false;
      session.revokedAt = revokedAt;
      return true;
    },
    cleanupExpiredMonitorSessions: async () => 0,
    getMonitorSessionsForScreen: async () => [],
  };
}

type JarCookie = {
  name: string;
  value: string;
  host: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | undefined;
};

/**
 * A deliberately narrow test jar.  It handles the semantics under test:
 * host-only cookies, Path matching, Secure, and replacement by name/host/path.
 */
class HostCookieJar {
  private readonly cookies: JarCookie[] = [];

  setFromResponse(url: string, setCookie: string): JarCookie {
    const parts = setCookie.split(";").map((part) => part.trim());
    const [name, ...valueParts] = parts[0].split("=");
    const cookie: JarCookie = {
      name,
      value: valueParts.join("="),
      host: new URL(url).hostname,
      path: "/",
      hostOnly: true,
      secure: false,
      httpOnly: false,
      sameSite: undefined,
    };
    for (const attribute of parts.slice(1)) {
      const separator = attribute.indexOf("=");
      const key = (separator < 0 ? attribute : attribute.slice(0, separator)).toLowerCase();
      const value = separator < 0 ? "" : attribute.slice(separator + 1);
      if (key === "domain") {
        cookie.hostOnly = false;
        cookie.host = value.replace(/^\./, "").toLowerCase();
      } else if (key === "path") {
        cookie.path = value || "/";
      } else if (key === "secure") {
        cookie.secure = true;
      } else if (key === "httponly") {
        cookie.httpOnly = true;
      } else if (key === "samesite") {
        cookie.sameSite = value.toLowerCase();
      }
    }

    const existing = this.cookies.findIndex(
      (old) =>
        old.name === cookie.name &&
        old.host === cookie.host &&
        old.path === cookie.path,
    );
    if (existing >= 0) this.cookies.splice(existing, 1);
    this.cookies.push(cookie);
    return cookie;
  }

  headerFor(url: string): string {
    const parsed = new URL(url);
    return this.cookies
      .filter((cookie) => {
        if (cookie.hostOnly && cookie.host !== parsed.hostname) return false;
        if (!cookie.hostOnly && parsed.hostname !== cookie.host &&
            !parsed.hostname.endsWith(`.${cookie.host}`)) return false;
        if (!parsed.pathname.startsWith(cookie.path)) return false;
        if (cookie.secure && parsed.protocol !== "https:") return false;
        return true;
      })
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  get(name: string): JarCookie | undefined {
    return this.cookies.find((cookie) => cookie.name === name);
  }
}

function setCookieHeaders(response: globalThis.Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.();
  if (values && values.length > 0) return values;
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

async function startContractServer(
  storage: OperationsRoutesStorage,
  observedCookies: string[],
  documentLoads: { count: number },
  presentationReads: { count: number },
) {
  const app = express();
  app.use((req, _res, next) => {
    if (
      req.path === "/api/monitor/screen-renewal/content" ||
      req.path === "/api/monitor/screen-renewal/presentation"
    ) {
      observedCookies.push(req.headers.cookie ?? "");
    }
    next();
  });

  const auth: OperationsRoutesAuth = {
    canAccessClient: () => true,
    getAllowedClientIds: () => null,
  };
  const authenticate = (req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbUser = { id: "operator-1", role: "admin" };
    next();
  };
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();
  const monitor: OperationsMonitorDeps = {
    resolveMonitorContent: async () => ({
      contentMarker: "replacement-cookie-content",
    }),
    readMonitorPresentation: () => {
      presentationReads.count += 1;
      return { presentationMarker: "replacement-cookie-presentation" };
    },
    getPublicBaseUrl: () => "http://127.0.0.1",
    logAudit: () => {},
    serveMediaFile: async (_id, _clientId, _req, res) => res.status(404).end(),
  };

  mountOperationsRoutes(app, {
    storage,
    auth,
    requireAuthOrToken: authenticate,
    loadUserContext,
    monitor,
  });

  // This represents the already-loaded SPA document.  No route is registered
  // by this test for a bootstrap redirect, so a second bootstrap can be made
  // with redirect: "manual" without navigating/reinitializing this document.
  app.get("/monitor/:screenId", (_req, res) => {
    documentLoads.count += 1;
    res.type("html").send("<!doctype html><title>monitor</title>");
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function bootstrap(
  baseUrl: string,
  fixture: SessionFixture,
  jar: HostCookieJar,
): Promise<{ response: globalThis.Response; setCookie: JarCookie }> {
  const url = `${baseUrl}/monitor-bootstrap/${fixture.session.screenId}?token=${fixture.rawBootstrapToken}`;
  const response = await fetch(url, { redirect: "manual" });
  assert.equal(response.status, 302);
  const headers = setCookieHeaders(response);
  assert.equal(headers.length, 1, "bootstrap must issue one replacement cookie");
  const setCookie = jar.setFromResponse(url, headers[0]);
  return { response, setCookie };
}

async function getWithJar(baseUrl: string, path: string, jar: HostCookieJar) {
  const url = `${baseUrl}${path}`;
  return fetch(url, {
    headers: { Cookie: jar.headerFor(url) },
  });
}

function assertMonitorCookieAttributes(
  cookieHeader: string,
  expectedSecure: boolean,
): void {
  assert.match(cookieHeader, new RegExp(`^${MONITOR_COOKIE_NAME}=`));
  assert.match(cookieHeader, /;\s*Path=\/(?:;|$)/i);
  assert.match(cookieHeader, /;\s*HttpOnly(?:;|$)/i);
  assert.match(cookieHeader, /;\s*SameSite=Strict(?:;|$)/i);
  assert.equal(/;\s*Domain=/i.test(cookieHeader), false, "cookie must remain host-only");
  assert.equal(/;\s*Secure(?:;|$)/i.test(cookieHeader), expectedSecure);
}

describe("actual monitor bootstrap cookie renewal contract", () => {
  it("replaces the host/path cookie and keeps an already-loaded document authorized", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const oldFixture = {
      session: makeSession("monitor-old", "old-bootstrap-token"),
      rawBootstrapToken: "old-bootstrap-token",
    };
    const replacementFixture = {
      session: makeSession("monitor-replacement", "replacement-bootstrap-token"),
      rawBootstrapToken: "replacement-bootstrap-token",
    };
    const lookedUpIds: string[] = [];
    const observedCookies: string[] = [];
    const documentLoads = { count: 0 };
    const presentationReads = { count: 0 };
    const server = await startContractServer(
      makeStorage([oldFixture, replacementFixture], lookedUpIds),
      observedCookies,
      documentLoads,
      presentationReads,
    );

    try {
      const jar = new HostCookieJar();
      const oldBootstrap = await bootstrap(server.baseUrl, oldFixture, jar);
      assertMonitorCookieAttributes(
        setCookieHeaders(oldBootstrap.response)[0],
        false,
      );
      const oldCookie = jar.get(MONITOR_COOKIE_NAME)!;
      assert.equal(oldCookie.host, "127.0.0.1");
      assert.equal(oldCookie.hostOnly, true);
      assert.equal(oldCookie.path, "/");
      assert.equal(oldCookie.httpOnly, true);
      assert.equal(oldCookie.sameSite, "strict");

      // The initial page has loaded once.  The replacement exchange itself is
      // not followed, so it must not cause a second document navigation.
      const documentResponse = await getWithJar(
        server.baseUrl,
        "/monitor/screen-renewal",
        jar,
      );
      assert.equal(documentResponse.status, 200);
      assert.equal(documentLoads.count, 1);
      const documentBody = await documentResponse.text();
      assert.doesNotMatch(documentBody, /old-bootstrap-token|replacement-bootstrap-token/);

      const replacementBootstrap = await bootstrap(server.baseUrl, replacementFixture, jar);
      assertMonitorCookieAttributes(
        setCookieHeaders(replacementBootstrap.response)[0],
        false,
      );
      const replacementCookie = jar.get(MONITOR_COOKIE_NAME)!;
      assert.equal(replacementCookie.host, oldCookie.host);
      assert.equal(replacementCookie.hostOnly, oldCookie.hostOnly);
      assert.equal(replacementCookie.path, oldCookie.path);
      assert.equal(replacementCookie.httpOnly, true);
      assert.equal(replacementCookie.sameSite, "strict");
      assert.notEqual(replacementCookie.value, oldCookie.value);
      assert.match(replacementCookie.value, /^monitor-replacement%3A/);

      assert.ok(oldFixture.session.sessionSecretHash);
      assert.ok(replacementFixture.session.sessionSecretHash);
      assert.notEqual(
        oldFixture.session.sessionSecretHash,
        replacementFixture.session.sessionSecretHash,
        "replacement must create an independent DB session secret",
      );

      // These are same-origin requests from the existing document.  Both
      // receive only the replacement cookie; no navigation or reinitialization
      // is performed between the requests.
      const contentResponse = await getWithJar(
        server.baseUrl,
        "/api/monitor/screen-renewal/content",
        jar,
      );
      const presentationResponse = await getWithJar(
        server.baseUrl,
        "/api/monitor/screen-renewal/presentation",
        jar,
      );
      assert.equal(contentResponse.status, 200);
      assert.equal(presentationResponse.status, 200);
      assert.deepEqual(await contentResponse.json(), {
        contentMarker: "replacement-cookie-content",
      });
      const presentationBody = await presentationResponse.json() as {
        serverTime: unknown;
        playerPresentationState: unknown;
      };
      assert.equal(typeof presentationBody.serverTime, "number");
      assert.deepEqual(presentationBody.playerPresentationState, {
        presentationMarker: "replacement-cookie-presentation",
      });
      const apiBodies = JSON.stringify({ content: { contentMarker: "replacement-cookie-content" }, presentationBody });
      assert.doesNotMatch(apiBodies, /old-bootstrap-token|replacement-bootstrap-token/);
      assert.doesNotMatch(apiBodies, /monitor-old|monitor-replacement/);
      assert.equal(documentLoads.count, 1);
      assert.equal(presentationReads.count, 1);
      assert.equal(observedCookies.length, 2);
      for (const cookieHeader of observedCookies) {
        assert.match(cookieHeader, /^vm_monitor_session=monitor-replacement%3A/);
        assert.doesNotMatch(cookieHeader, /monitor-old/);
      }
      assert.ok(lookedUpIds.includes("monitor-replacement"));

      // Revoking the old row must not affect the replacement row currently in
      // the jar.  This uses the actual admin revoke route, not a direct map edit.
      const revokeOld = await fetch(
        `${server.baseUrl}/api/operations/monitor-sessions/monitor-old`,
        { method: "DELETE" },
      );
      assert.equal(revokeOld.status, 200);
      assert.ok(oldFixture.session.revokedAt);
      assert.equal(replacementFixture.session.revokedAt, null);

      const afterOldRevoke = await getWithJar(
        server.baseUrl,
        "/api/monitor/screen-renewal/content",
        jar,
      );
      assert.equal(afterOldRevoke.status, 200);
      assert.deepEqual(await afterOldRevoke.json(), {
        contentMarker: "replacement-cookie-content",
      });

      // Revoking the replacement row must immediately invalidate both current
      // same-origin auth paths.
      const revokeReplacement = await fetch(
        `${server.baseUrl}/api/operations/monitor-sessions/monitor-replacement`,
        { method: "DELETE" },
      );
      assert.equal(revokeReplacement.status, 200);
      assert.ok(replacementFixture.session.revokedAt);

      const contentAfterReplacementRevoke = await getWithJar(
        server.baseUrl,
        "/api/monitor/screen-renewal/content",
        jar,
      );
      const presentationAfterReplacementRevoke = await getWithJar(
        server.baseUrl,
        "/api/monitor/screen-renewal/presentation",
        jar,
      );
      assert.equal(contentAfterReplacementRevoke.status, 401);
      assert.equal(presentationAfterReplacementRevoke.status, 401);
    } finally {
      await server.close();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("sets Secure only when production requires it while retaining strict host/path flags", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const fixture = {
      session: makeSession("monitor-production-cookie", "production-bootstrap-token"),
      rawBootstrapToken: "production-bootstrap-token",
    };
    const server = await startContractServer(
      makeStorage([fixture], []),
      [],
      { count: 0 },
      { count: 0 },
    );

    try {
      const jar = new HostCookieJar();
      const result = await bootstrap(server.baseUrl, fixture, jar);
      const headers = setCookieHeaders(result.response);
      assertMonitorCookieAttributes(headers[0], true);
      assert.equal(jar.get(MONITOR_COOKIE_NAME)?.secure, true);
    } finally {
      await server.close();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountAgendaRoutes,
  PUBLIC_AGENDA_CONFIG_FIELDS,
  PUBLIC_AGENDA_ITEM_FIELDS,
  type AgendaRoutesStorage,
} from "../server/agendaRoutes";
import { AGENDA_CSV_HEADER } from "../shared/agenda-csv";
import type {
  AgendaItem,
  AgendaSyncConfig,
  AgendaWidgetConfig,
  Client,
  InsertAgendaItem,
  InsertAgendaSyncConfig,
  InsertAgendaWidgetConfig,
} from "../shared/schema";
import { resolveAgendaItems } from "../shared/agenda-resolver";

// Task #211 — integration coverage for the agenda HTTP routes.
//
// Mounts the extracted agenda router (server/agendaRoutes.ts) on a
// throwaway Express app with a stub storage + an injectable "current
// user" so the tenant boundary (site A vs site B) is exercised end to
// end without needing a real DB or session/2FA flow.

interface FakeUser {
  role: "admin" | "account_manager" | "site_user";
  allowedClientIds: string[] | null; // null = admin (all)
}

function makeFakeStorage(initial: {
  items?: AgendaItem[];
  configs?: AgendaWidgetConfig[];
  syncConfigs?: AgendaSyncConfig[];
  clients?: Client[];
}): AgendaRoutesStorage & {
  items: AgendaItem[];
  configs: AgendaWidgetConfig[];
  syncConfigs: AgendaSyncConfig[];
} {
  const items: AgendaItem[] = [...(initial.items ?? [])];
  const configs: AgendaWidgetConfig[] = [...(initial.configs ?? [])];
  const syncConfigs: AgendaSyncConfig[] = [...(initial.syncConfigs ?? [])];
  const clients: Client[] = [...(initial.clients ?? [])];

  return {
    items,
    configs,
    syncConfigs,
    async getAgendaItems(clientId) {
      return clientId ? items.filter((i) => i.clientId === clientId) : items.slice();
    },
    async getAgendaItem(id) {
      return items.find((i) => i.id === id);
    },
    async createAgendaItem(data: InsertAgendaItem) {
      const row: AgendaItem = {
        id: `item-${items.length + 1}`,
        clientId: data.clientId,
        title: data.title,
        description: data.description ?? null,
        room: data.room ?? null,
        track: data.track ?? null,
        presenter: data.presenter ?? null,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        status: (data.status ?? "scheduled") as AgendaItem["status"],
        statusMessage: data.statusMessage ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      items.push(row);
      return row;
    },
    async createAgendaItemsBulk(rows) {
      const out: AgendaItem[] = [];
      for (const r of rows) {
        out.push(await this.createAgendaItem(r));
      }
      return out;
    },
    async updateAgendaItem(id, data) {
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      items[idx] = { ...items[idx], ...(data as Partial<AgendaItem>), updatedAt: new Date() };
      return items[idx];
    },
    async deleteAgendaItem(id) {
      const before = items.length;
      const idx = items.findIndex((i) => i.id === id);
      if (idx >= 0) items.splice(idx, 1);
      return items.length < before;
    },
    async deleteAgendaItemsForClient(clientId) {
      let removed = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].clientId === clientId) {
          items.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    async getAgendaSyncConfigs(clientId) {
      return clientId
        ? syncConfigs.filter((c) => c.clientId === clientId)
        : syncConfigs.slice();
    },
    async getAgendaSyncConfig(id) {
      return syncConfigs.find((c) => c.id === id);
    },
    async createAgendaSyncConfig(data: InsertAgendaSyncConfig) {
      const row = {
        id: `sync-${syncConfigs.length + 1}`,
        lastSyncAt: null,
        lastSyncOk: null,
        lastError: null,
        lastErrorAt: null,
        lastItemCount: null,
        consecutiveFailureCount: 0,
        failureAlertSent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as unknown as AgendaSyncConfig;
      syncConfigs.push(row);
      return row;
    },
    async updateAgendaSyncConfig(id, data) {
      const idx = syncConfigs.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      syncConfigs[idx] = {
        ...syncConfigs[idx],
        ...(data as Partial<AgendaSyncConfig>),
        updatedAt: new Date(),
      };
      return syncConfigs[idx];
    },
    async deleteAgendaSyncConfig(id) {
      const before = syncConfigs.length;
      const idx = syncConfigs.findIndex((c) => c.id === id);
      if (idx >= 0) syncConfigs.splice(idx, 1);
      return syncConfigs.length < before;
    },
    async getAgendaItemsBySyncConfig(syncConfigId) {
      return items.filter((i) => i.externalSyncConfigId === syncConfigId);
    },
    async getAgendaWidgetConfigs(clientId) {
      return clientId ? configs.filter((c) => c.clientId === clientId) : configs.slice();
    },
    async getAgendaWidgetConfig(id) {
      return configs.find((c) => c.id === id);
    },
    async createAgendaWidgetConfig(data: InsertAgendaWidgetConfig) {
      const row = {
        id: `cfg-${configs.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as unknown as AgendaWidgetConfig;
      configs.push(row);
      return row;
    },
    async updateAgendaWidgetConfig(id, data) {
      const idx = configs.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      configs[idx] = { ...configs[idx], ...(data as Partial<AgendaWidgetConfig>), updatedAt: new Date() };
      return configs[idx];
    },
    async deleteAgendaWidgetConfig(id) {
      const before = configs.length;
      const idx = configs.findIndex((c) => c.id === id);
      if (idx >= 0) configs.splice(idx, 1);
      return configs.length < before;
    },
    async getResolvedAgendaForConfig(configId, now) {
      const cfg = configs.find((c) => c.id === configId);
      if (!cfg) return undefined;
      const pool = items.filter((i) => i.clientId === cfg.clientId);
      return { config: cfg, items: resolveAgendaItems({ items: pool, config: cfg, now }) };
    },
    async getClient(id) {
      return clients.find((c) => c.id === id);
    },
  };
}

function makeConfig(over: Partial<AgendaWidgetConfig> & { id: string; clientId: string }): AgendaWidgetConfig {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? "Display",
    displayMode: (over.displayMode ?? "full") as AgendaWidgetConfig["displayMode"],
    layoutMode: (over.layoutMode ?? "auto") as AgendaWidgetConfig["layoutMode"],
    roomFilter: over.roomFilter ?? [],
    trackFilter: over.trackFilter ?? [],
    statusFilter: over.statusFilter ?? [],
    timeWindowMinutes: over.timeWindowMinutes ?? null,
    refreshIntervalSeconds: over.refreshIntervalSeconds ?? 30,
    rotationIntervalSeconds: over.rotationIntervalSeconds ?? 12,
    maxItemsPerPage: over.maxItemsPerPage ?? 8,
    fontScale: (over.fontScale ?? "normal") as AgendaWidgetConfig["fontScale"],
    density: (over.density ?? "normal") as AgendaWidgetConfig["density"],
    theme: (over.theme ?? "dark") as AgendaWidgetConfig["theme"],
    accentColor: over.accentColor ?? "#0ea5e9",
    backgroundUrl: over.backgroundUrl ?? null,
    eventName: over.eventName ?? null,
    showDescription: over.showDescription ?? true,
    showPresenter: over.showPresenter ?? true,
    showRoom: over.showRoom ?? true,
    showStatus: over.showStatus ?? true,
    showCurrentTime: over.showCurrentTime ?? true,
    showEventName: over.showEventName ?? true,
    createdAt: over.createdAt ?? new Date("2026-05-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-05-01T00:00:00Z"),
  };
}

function makeSyncConfig(
  over: Partial<AgendaSyncConfig> & { id: string; clientId: string },
): AgendaSyncConfig {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? "Feed",
    sourceType: (over.sourceType ?? "ics") as AgendaSyncConfig["sourceType"],
    // A loopback URL so any accidental real fetch is blocked by safeFetch
    // (private/loopback ranges are rejected before the network is touched).
    sourceUrl: over.sourceUrl ?? "http://127.0.0.1/agenda.ics",
    enabled: over.enabled ?? true,
    syncIntervalMinutes: over.syncIntervalMinutes ?? 60,
    lastSyncAt: over.lastSyncAt ?? null,
    lastSyncOk: over.lastSyncOk ?? null,
    lastError: over.lastError ?? null,
    lastErrorAt: over.lastErrorAt ?? null,
    lastItemCount: over.lastItemCount ?? null,
    consecutiveFailureCount: over.consecutiveFailureCount ?? 0,
    failureAlertSent: over.failureAlertSent ?? false,
    createdAt: over.createdAt ?? new Date("2026-05-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-05-01T00:00:00Z"),
  };
}

function makeItem(over: Partial<AgendaItem> & { id: string; clientId: string; startsAt: Date; endsAt: Date }): AgendaItem {
  return {
    id: over.id,
    clientId: over.clientId,
    title: over.title ?? `Session ${over.id}`,
    description: over.description ?? null,
    room: over.room ?? null,
    track: over.track ?? null,
    presenter: over.presenter ?? null,
    startsAt: over.startsAt,
    endsAt: over.endsAt,
    status: (over.status ?? "scheduled") as AgendaItem["status"],
    statusMessage: over.statusMessage ?? null,
    createdAt: over.createdAt ?? new Date("2026-05-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-05-01T00:00:00Z"),
  };
}

async function startTestServer(opts: {
  storage: AgendaRoutesStorage;
  user: FakeUser | null;
  now?: () => Date;
}) {
  const app = express();
  app.use(express.json());

  const inject = (req: Request, _res: Response, next: NextFunction) => {
    if (opts.user) {
      (req as any).dbUser = { id: "u-test", role: opts.user.role };
      (req as any).allowedClientIds =
        opts.user.role === "admin" ? null : opts.user.allowedClientIds;
    }
    next();
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!opts.user) return res.status(401).json({ error: "unauth" });
    next();
  };
  const requireAuthOrToken = requireAuth;
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  app.use(inject);

  mountAgendaRoutes(app, {
    now: opts.now,
    storage: opts.storage,
    auth: {
      canAccessClient: (req, clientId) => {
        const u = (req as any).dbUser;
        if (!u) return false;
        if (u.role === "admin") return true;
        const allowed = (req as any).allowedClientIds as string[] | null;
        return allowed ? allowed.includes(clientId) : false;
      },
      getAllowedClientIds: (req) => (req as any).allowedClientIds ?? null,
    },
    requireAuth,
    requireAuthOrToken,
    loadUserContext,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

test("GET /api/agenda/configs — site A user cannot read a site B config", async () => {
  const cfgA = makeConfig({ id: "cfgA", clientId: "siteA" });
  const cfgB = makeConfig({ id: "cfgB", clientId: "siteB" });
  const storage = makeFakeStorage({ configs: [cfgA, cfgB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    // Explicit clientId for the other site → 403.
    const res403 = await fetch(`${srv.base}/api/agenda/configs?clientId=siteB`);
    assert.equal(res403.status, 403);

    // No filter → site A only sees its own config; siteB row is filtered out.
    const resAll = await fetch(`${srv.base}/api/agenda/configs`);
    assert.equal(resAll.status, 200);
    const list = (await resAll.json()) as Array<{ id: string; clientId: string }>;
    assert.deepEqual(
      list.map((c) => c.id).sort(),
      ["cfgA"],
      "site A user must not see site B configs even without a clientId filter",
    );
  } finally {
    await srv.close();
  }
});

test("PATCH /api/agenda/configs/:id — site A user cannot patch a site B config", async () => {
  const cfgB = makeConfig({ id: "cfgB", clientId: "siteB", name: "Original" });
  const storage = makeFakeStorage({ configs: [cfgB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/configs/cfgB`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(res.status, 403);
    // Underlying row untouched.
    assert.equal(storage.configs[0].name, "Original");
  } finally {
    await srv.close();
  }
});

test("PATCH /api/agenda/configs/:id — site A user cannot reassign config to site B (target check)", async () => {
  // The user owns site A. They can read & patch their own config, but
  // must not be able to MOVE it to site B (which they don't own).
  // This is the explicit "target site" check added during code review.
  const cfgA = makeConfig({ id: "cfgA", clientId: "siteA", name: "Original" });
  const storage = makeFakeStorage({ configs: [cfgA] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/configs/cfgA`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /target site/i);
    // Row was not moved.
    assert.equal(storage.configs[0].clientId, "siteA");
  } finally {
    await srv.close();
  }
});

test("DELETE /api/agenda/configs/:id — site A user cannot delete a site B config", async () => {
  const cfgB = makeConfig({ id: "cfgB", clientId: "siteB" });
  const storage = makeFakeStorage({ configs: [cfgB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/configs/cfgB`, {
      method: "DELETE",
    });
    assert.equal(res.status, 403);
    assert.equal(storage.configs.length, 1, "row must still exist");
  } finally {
    await srv.close();
  }
});

test("agenda item routes are tenant-scoped the same way (GET filter, PATCH/DELETE 403, PATCH cross-site move 403)", async () => {
  const start = new Date("2026-06-01T10:00:00Z");
  const end = new Date("2026-06-01T11:00:00Z");
  const itemA = makeItem({ id: "iA", clientId: "siteA", startsAt: start, endsAt: end });
  const itemB = makeItem({ id: "iB", clientId: "siteB", startsAt: start, endsAt: end });
  const storage = makeFakeStorage({ items: [itemA, itemB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const list = (await (await fetch(`${srv.base}/api/agenda`)).json()) as Array<{
      id: string;
    }>;
    assert.deepEqual(list.map((i) => i.id).sort(), ["iA"]);

    const patch = await fetch(`${srv.base}/api/agenda/iB`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "owned" }),
    });
    assert.equal(patch.status, 403);

    const del = await fetch(`${srv.base}/api/agenda/iB`, { method: "DELETE" });
    assert.equal(del.status, 403);

    const move = await fetch(`${srv.base}/api/agenda/iA`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(move.status, 403);
    assert.equal(storage.items.find((i) => i.id === "iA")?.clientId, "siteA");
  } finally {
    await srv.close();
  }
});

test("admin can read & patch configs across any site (no allowed-client list)", async () => {
  const cfgB = makeConfig({ id: "cfgB", clientId: "siteB", name: "Original" });
  const storage = makeFakeStorage({ configs: [cfgB] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const get = await fetch(`${srv.base}/api/agenda/configs?clientId=siteB`);
    assert.equal(get.status, 200);
    const patch = await fetch(`${srv.base}/api/agenda/configs/cfgB`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    assert.equal(patch.status, 200);
    assert.equal(storage.configs[0].name, "Renamed");
  } finally {
    await srv.close();
  }
});

test("GET /api/agenda/display/:configId — public payload never leaks internal fields", async () => {
  const cfg = makeConfig({
    id: "cfgPub",
    clientId: "siteA",
    name: "Public",
    timeWindowMinutes: 60, // an internal/admin-only filter — must NOT leak
  });
  const fixedNow = new Date("2026-06-01T10:30:00Z");
  const start = new Date("2026-06-01T10:00:00Z");
  const end = new Date("2026-06-01T11:00:00Z");
  const item = makeItem({
    id: "iPub",
    clientId: "siteA",
    startsAt: start,
    endsAt: end,
    title: "Keynote",
  });
  const storage = makeFakeStorage({
    configs: [cfg],
    items: [item],
    clients: [
      {
        id: "siteA",
        name: "Site A",
        timezone: "Europe/London",
      } as Client,
    ],
  });
  // Unauthenticated — the public display endpoint must not require a user.
  const srv = await startTestServer({ storage, user: null, now: () => fixedNow });
  try {
    const res = await fetch(`${srv.base}/api/agenda/display/cfgPub`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      config: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
      client: { name: string; timezone: string } | null;
      serverTime: number;
    };

    // Whitelist check: config fields exactly match the public allowlist.
    const cfgKeys = Object.keys(body.config).sort();
    const expected = [...PUBLIC_AGENDA_CONFIG_FIELDS].sort();
    assert.deepEqual(
      cfgKeys,
      expected,
      `public config payload drift — got ${JSON.stringify(cfgKeys)}`,
    );

    // Spot-check that the obviously-sensitive fields are absent.
    for (const banned of ["clientId", "createdAt", "updatedAt", "timeWindowMinutes"]) {
      assert.equal(
        (body.config as any)[banned],
        undefined,
        `public config payload must not leak ${banned}`,
      );
    }

    // Items: same whitelist check.
    assert.equal(body.items.length, 1);
    const itemKeys = Object.keys(body.items[0]).sort();
    assert.deepEqual(itemKeys, [...PUBLIC_AGENDA_ITEM_FIELDS].sort());
    for (const banned of ["clientId", "createdAt", "updatedAt"]) {
      assert.equal(
        (body.items[0] as any)[banned],
        undefined,
        `public item payload must not leak ${banned}`,
      );
    }

    // Client block: just name + timezone (no id, no contact info).
    assert.deepEqual(Object.keys(body.client ?? {}).sort(), ["name", "timezone"]);
  } finally {
    await srv.close();
  }
});

// ============ Task #215 — POST /api/agenda/import tenant scoping ============
//
// Task #211 covered the agenda GET/POST/PATCH/DELETE routes and the
// public display endpoint, but the bulk CSV import endpoint was not
// exercised. A regression where a site-A user could import (or worse,
// replace) site-B items would be silent until someone noticed missing
// data, so we lock the boundary in with HTTP-level tests against the
// extracted router + a stub storage.

test("POST /api/agenda/import — site A user cannot import into site B (403)", async () => {
  const existingB = makeItem({
    id: "iB-existing",
    clientId: "siteB",
    startsAt: new Date("2026-06-01T09:00:00Z"),
    endsAt: new Date("2026-06-01T10:00:00Z"),
    title: "Site B keynote",
  });
  const storage = makeFakeStorage({ items: [existingB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const csv = [
      AGENDA_CSV_HEADER,
      `Injected,,Main Hall,,,2026-06-01T11:00:00Z,2026-06-01T12:00:00Z,scheduled,`,
    ].join("\n");
    const res = await fetch(`${srv.base}/api/agenda/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB", csv, replace: true }),
    });
    assert.equal(res.status, 403);
    // Site B's existing row must still be present — neither the replace
    // path nor the insert path may have run.
    assert.equal(storage.items.length, 1);
    assert.equal(storage.items[0].id, "iB-existing");
    assert.equal(storage.items[0].clientId, "siteB");
  } finally {
    await srv.close();
  }
});

test("POST /api/agenda/import — replace=true only wipes the target site, never other sites", async () => {
  const start = new Date("2026-06-01T09:00:00Z");
  const end = new Date("2026-06-01T10:00:00Z");
  const oldA = makeItem({ id: "iA-old", clientId: "siteA", startsAt: start, endsAt: end, title: "Old A" });
  const keepB1 = makeItem({ id: "iB-1", clientId: "siteB", startsAt: start, endsAt: end, title: "B one" });
  const keepB2 = makeItem({ id: "iB-2", clientId: "siteB", startsAt: start, endsAt: end, title: "B two" });
  const storage = makeFakeStorage({ items: [oldA, keepB1, keepB2] });
  // Admin user — verifies that even an unconstrained import targeting
  // siteA leaves siteB rows untouched (i.e. the wipe is scoped by
  // clientId, not global).
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const csv = [
      AGENDA_CSV_HEADER,
      `New A,,Hall A,,,2026-06-02T09:00:00Z,2026-06-02T10:00:00Z,scheduled,`,
      `New A 2,,Hall A,,,2026-06-02T10:30:00Z,2026-06-02T11:30:00Z,scheduled,`,
    ].join("\n");
    const res = await fetch(`${srv.base}/api/agenda/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteA", csv, replace: true }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { inserted: number };
    assert.equal(body.inserted, 2);

    // Site A: old row gone, two new rows present.
    const aRows = storage.items.filter((i) => i.clientId === "siteA");
    assert.equal(aRows.length, 2);
    assert.deepEqual(aRows.map((r) => r.title).sort(), ["New A", "New A 2"]);
    assert.equal(aRows.find((r) => r.id === "iA-old"), undefined);

    // Site B: both original rows untouched.
    const bRows = storage.items.filter((i) => i.clientId === "siteB");
    assert.equal(bRows.length, 2);
    assert.deepEqual(bRows.map((r) => r.id).sort(), ["iB-1", "iB-2"]);
  } finally {
    await srv.close();
  }
});

test("POST /api/agenda/import — malformed CSV returns 400 with per-row errors and inserts no rows", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const csv = [
      AGENDA_CSV_HEADER,
      // Row 1: valid.
      `Good,,Main Hall,,,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z,scheduled,`,
      // Row 2: missing title — parser flags this as an error.
      `,,Main Hall,,,2026-06-01T10:30:00Z,2026-06-01T11:30:00Z,scheduled,`,
    ].join("\n");
    const res = await fetch(`${srv.base}/api/agenda/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteA", csv, replace: false }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: string;
      results: Array<{ status: "ok" | "error" }>;
    };
    assert.equal(body.error, "csv_parse_error");
    assert.ok(Array.isArray(body.results), "per-row results must be returned");
    assert.ok(
      body.results.some((r) => r.status === "error"),
      "at least one row must be reported as error",
    );
    // Transactional: nothing was inserted — not even the valid row.
    assert.equal(storage.items.length, 0, "no rows must be inserted when any row fails to parse");
  } finally {
    await srv.close();
  }
});

test("POST /api/agenda/import — malformed CSV with replace=true does NOT delete existing rows", async () => {
  // The transactional guarantee must extend to the destructive replace
  // path: if parsing fails, the existing rows for the target site stay.
  const start = new Date("2026-06-01T09:00:00Z");
  const end = new Date("2026-06-01T10:00:00Z");
  const existingA = makeItem({ id: "iA-keep", clientId: "siteA", startsAt: start, endsAt: end, title: "Keep me" });
  const storage = makeFakeStorage({ items: [existingA] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const csv = [
      AGENDA_CSV_HEADER,
      // Missing title — parser reports an error before any insert/delete.
      `,,Main Hall,,,2026-06-01T10:30:00Z,2026-06-01T11:30:00Z,scheduled,`,
    ].join("\n");
    const res = await fetch(`${srv.base}/api/agenda/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteA", csv, replace: true }),
    });
    assert.equal(res.status, 400);
    assert.equal(storage.items.length, 1, "existing row must survive a failed replace-import");
    assert.equal(storage.items[0].id, "iA-keep");
  } finally {
    await srv.close();
  }
});

test("GET /api/agenda/display/:configId — unknown configId returns 404", async () => {
  const srv = await startTestServer({
    storage: makeFakeStorage({}),
    user: null,
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/display/does-not-exist`);
    assert.equal(res.status, 404);
  } finally {
    await srv.close();
  }
});

// ============ Task #224 — agenda sync-config tenant scoping ============
//
// Task #211 covered the agenda item/config routes and Task #215 covered
// the CSV import. The remaining uncovered surface is the
// /api/agenda/sync-configs CRUD + manual-trigger routes. These rows hold
// the source URLs (and potentially credentials embedded in them) for
// external feeds, so a tenant-boundary regression here is high impact:
// credential exposure, cross-site overwrite, or an unauthorised manual
// sync. We lock the boundary in with HTTP-level tests against the
// extracted router + a stub storage.

test("GET /api/agenda/sync-configs — site A user cannot read a site B sync config", async () => {
  const syncA = makeSyncConfig({ id: "syncA", clientId: "siteA", name: "A feed" });
  const syncB = makeSyncConfig({ id: "syncB", clientId: "siteB", name: "B feed" });
  const storage = makeFakeStorage({ syncConfigs: [syncA, syncB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    // Explicit clientId for the other site → 403.
    const res403 = await fetch(`${srv.base}/api/agenda/sync-configs?clientId=siteB`);
    assert.equal(res403.status, 403);

    // No filter → site A only sees its own config; siteB row is filtered out.
    const resAll = await fetch(`${srv.base}/api/agenda/sync-configs`);
    assert.equal(resAll.status, 200);
    const list = (await resAll.json()) as Array<{ id: string; clientId: string }>;
    assert.deepEqual(
      list.map((c) => c.id).sort(),
      ["syncA"],
      "site A user must not see site B sync configs even without a clientId filter",
    );
  } finally {
    await srv.close();
  }
});

test("POST /api/agenda/sync-configs — site A user cannot create a config for site B (403)", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/sync-configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteB",
        name: "Stolen feed",
        sourceType: "ics",
        sourceUrl: "https://example.com/agenda.ics",
      }),
    });
    assert.equal(res.status, 403);
    // No row may have been created for site B (or anyone).
    assert.equal(storage.syncConfigs.length, 0, "no sync config may be created cross-tenant");
  } finally {
    await srv.close();
  }
});

test("PATCH /api/agenda/sync-configs/:id — site A user cannot patch a site B config", async () => {
  const syncB = makeSyncConfig({
    id: "syncB",
    clientId: "siteB",
    name: "Original",
    sourceUrl: "https://example.com/original.ics",
  });
  const storage = makeFakeStorage({ syncConfigs: [syncB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/sync-configs/syncB`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hijacked", sourceUrl: "https://evil.example/feed.ics" }),
    });
    assert.equal(res.status, 403);
    // Underlying row untouched — neither name nor the (credential-bearing) URL changed.
    assert.equal(storage.syncConfigs[0].name, "Original");
    assert.equal(storage.syncConfigs[0].sourceUrl, "https://example.com/original.ics");
  } finally {
    await srv.close();
  }
});

test("PATCH /api/agenda/sync-configs/:id — site A user cannot reassign config to site B (target check)", async () => {
  // The user owns site A. They can read & patch their own config, but
  // must not be able to MOVE it to site B (which they don't own).
  const syncA = makeSyncConfig({ id: "syncA", clientId: "siteA", name: "Original" });
  const storage = makeFakeStorage({ syncConfigs: [syncA] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/sync-configs/syncA`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "siteB" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /target site/i);
    // Row was not moved.
    assert.equal(storage.syncConfigs[0].clientId, "siteA");
  } finally {
    await srv.close();
  }
});

test("DELETE /api/agenda/sync-configs/:id — site A user cannot delete a site B config", async () => {
  const syncB = makeSyncConfig({ id: "syncB", clientId: "siteB" });
  const storage = makeFakeStorage({ syncConfigs: [syncB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/sync-configs/syncB`, {
      method: "DELETE",
    });
    assert.equal(res.status, 403);
    assert.equal(storage.syncConfigs.length, 1, "row must still exist");
  } finally {
    await srv.close();
  }
});

test("POST /api/agenda/sync-configs/:id/run — site A user cannot trigger a site B sync (403, no fetch)", async () => {
  const syncB = makeSyncConfig({
    id: "syncB",
    clientId: "siteB",
    // If the auth check were skipped, the engine would try to fetch this.
    sourceUrl: "https://example.com/should-never-fetch.ics",
  });
  const storage = makeFakeStorage({ syncConfigs: [syncB] });
  const srv = await startTestServer({
    storage,
    user: { role: "site_user", allowedClientIds: ["siteA"] },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/sync-configs/syncB/run`, {
      method: "POST",
    });
    assert.equal(res.status, 403);
    // The sync engine must not have run: lastSyncAt stays null.
    assert.equal(storage.syncConfigs[0].lastSyncAt, null, "sync must not have executed");
  } finally {
    await srv.close();
  }
});

test("admin can read, patch, delete & trigger sync configs across any site", async () => {
  const syncB = makeSyncConfig({
    id: "syncB",
    clientId: "siteB",
    name: "Original",
    // Loopback URL: safeFetch rejects it before any network access, so
    // the trigger returns a deterministic { ok: false } 200 — proving the
    // admin got past the tenant check without needing live network.
    sourceUrl: "http://127.0.0.1/agenda.ics",
  });
  const storage = makeFakeStorage({ syncConfigs: [syncB] });
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    // Read across sites.
    const get = await fetch(`${srv.base}/api/agenda/sync-configs?clientId=siteB`);
    assert.equal(get.status, 200);
    const list = (await get.json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((c) => c.id), ["syncB"]);

    // Patch across sites.
    const patch = await fetch(`${srv.base}/api/agenda/sync-configs/syncB`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    assert.equal(patch.status, 200);
    assert.equal(storage.syncConfigs[0].name, "Renamed");

    // Trigger across sites — gets past auth and runs the engine. The
    // loopback URL is blocked by safeFetch, so the engine returns
    // { ok: false } with a 200 status and records the failure.
    const run = await fetch(`${srv.base}/api/agenda/sync-configs/syncB/run`, {
      method: "POST",
    });
    assert.equal(run.status, 200);
    const runBody = (await run.json()) as { ok: boolean };
    assert.equal(runBody.ok, false, "loopback fetch must be blocked, yielding ok:false");
    assert.notEqual(
      storage.syncConfigs[0].lastSyncAt,
      null,
      "the sync engine ran and stamped lastSyncAt",
    );

    // Delete across sites.
    const del = await fetch(`${srv.base}/api/agenda/sync-configs/syncB`, {
      method: "DELETE",
    });
    assert.equal(del.status, 204);
    assert.equal(storage.syncConfigs.length, 0, "admin delete removed the row");
  } finally {
    await srv.close();
  }
});

test("POST /api/agenda/sync-configs — admin can create a config for any site", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({
    storage,
    user: { role: "admin", allowedClientIds: null },
  });
  try {
    const res = await fetch(`${srv.base}/api/agenda/sync-configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "siteB",
        name: "Admin feed",
        sourceType: "ics",
        sourceUrl: "https://example.com/agenda.ics",
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(storage.syncConfigs.length, 1);
    assert.equal(storage.syncConfigs[0].clientId, "siteB");
  } finally {
    await srv.close();
  }
});

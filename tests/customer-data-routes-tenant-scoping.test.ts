import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import {
  mountCustomerDataRoutes,
  type CustomerDataRoutesStorage,
} from "../server/customerDataRoutes";
import type {
  DisplayProfile,
  ScreenGroup,
  Screen,
  Event,
  Programme,
  ProgrammeVersion,
  ScreenPreset,
  LiveOverride,
} from "../shared/schema";

// Task #258 — HTTP-level tenant-isolation coverage for the remaining
// site-scoped admin areas: display profiles, screen groups, programmes, and
// screen presets. Mirrors tests/media-layout-routes-tenant-scoping.test.ts.
//
// Mounts the extracted customer-data router (server/customerDataRoutes.ts) on
// a throwaway Express app with a stub storage + an injectable "current user"
// so the tenant boundary (siteA/siteC vs siteB) is exercised end to end
// without a real DB or session/2FA flow. Exercises all three access levels:
// site_user (single site), account_manager (subset of sites), and admin (all).
//
// NOTE — brand packs: the task lists brand packs as a site-scoped area, but
// the codebase exposes NO brand-pack HTTP routes (only a storage layer), so
// there is nothing to cover here. Skipped intentionally.

interface FakeUser {
  role: "admin" | "account_manager" | "site_user";
  allowedClientIds: string[] | null; // null = admin (all)
}

// An account_manager granted siteA + siteC, but NOT siteB.
const MANAGER: FakeUser = {
  role: "account_manager",
  allowedClientIds: ["siteA", "siteC"],
};

function makeProfile(over: { id: string; clientId: string | null; name?: string }): DisplayProfile {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? `Profile ${over.id}`,
    width: 1920,
    height: 1080,
    orientation: "landscape",
    safePadding: 0,
    screenType: "standard",
    refreshRate: 60,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as DisplayProfile;
}

function makeGroup(over: { id: string; clientId: string | null; name?: string }): ScreenGroup {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? `Group ${over.id}`,
    description: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as ScreenGroup;
}

function makeScreen(over: { id: string; clientId: string | null; name?: string }): Screen {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? `Screen ${over.id}`,
  } as unknown as Screen;
}

function makeEvent(over: { id: string; clientId: string; name?: string }): Event {
  return {
    id: over.id,
    clientId: over.clientId,
    name: over.name ?? `Event ${over.id}`,
  } as unknown as Event;
}

function makeProgramme(over: { id: string; eventId: string; name?: string; displayOrder?: number }): Programme {
  return {
    id: over.id,
    eventId: over.eventId,
    name: over.name ?? `Programme ${over.id}`,
    description: null,
    displayOrder: over.displayOrder ?? 0,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as Programme;
}

function makePreset(over: {
  id: string;
  screenId?: string | null;
  groupId?: string | null;
  name?: string;
}): ScreenPreset {
  return {
    id: over.id,
    name: over.name ?? `Preset ${over.id}`,
    screenId: over.screenId ?? null,
    groupId: over.groupId ?? null,
    layoutTemplateId: null,
    zoneSources: null,
    displayOrder: 0,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as ScreenPreset;
}

interface Membership {
  screenId: string;
  groupId: string;
}

function makeFakeStorage(initial: {
  profiles?: DisplayProfile[];
  groups?: ScreenGroup[];
  screens?: Screen[];
  events?: Event[];
  programmes?: Programme[];
  presets?: ScreenPreset[];
  overrides?: LiveOverride[];
  memberships?: Membership[];
}): CustomerDataRoutesStorage & {
  profiles: DisplayProfile[];
  groups: ScreenGroup[];
  programmes: Programme[];
  presets: ScreenPreset[];
  overrides: LiveOverride[];
  memberships: Membership[];
  programmeVersions: ProgrammeVersion[];
  reorderedProgrammes: string[] | null;
  reorderedPresets: string[] | null;
} {
  const profiles = [...(initial.profiles ?? [])];
  const groups = [...(initial.groups ?? [])];
  const screens = [...(initial.screens ?? [])];
  const events = [...(initial.events ?? [])];
  const programmes = [...(initial.programmes ?? [])];
  const presets = [...(initial.presets ?? [])];
  const overrides = [...(initial.overrides ?? [])];
  const memberships = [...(initial.memberships ?? [])];
  const programmeVersions: ProgrammeVersion[] = [];
  const state = {
    profiles,
    groups,
    programmes,
    presets,
    overrides,
    memberships,
    programmeVersions,
    reorderedProgrammes: null as string[] | null,
    reorderedPresets: null as string[] | null,
  };

  const storage: CustomerDataRoutesStorage = {
    // Display profiles
    async getDisplayProfiles() {
      return profiles.slice();
    },
    async getDisplayProfile(id) {
      return profiles.find((p) => p.id === id);
    },
    async createDisplayProfile(data) {
      const row = makeProfile({ id: `profile-${profiles.length + 1}`, clientId: data.clientId ?? null, name: data.name });
      profiles.push(row);
      return row;
    },
    async updateDisplayProfile(id, data) {
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx === -1) return undefined;
      profiles[idx] = { ...profiles[idx], ...(data as Partial<DisplayProfile>) };
      return profiles[idx];
    },
    async deleteDisplayProfile(id) {
      const before = profiles.length;
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx >= 0) profiles.splice(idx, 1);
      return profiles.length < before;
    },

    // Screen groups
    async getScreenGroupsWithMemberCounts() {
      return groups.map((g) => ({
        ...g,
        memberCount: memberships.filter((m) => m.groupId === g.id).length,
      }));
    },
    async getScreenGroups() {
      return groups.slice();
    },
    async getScreenGroup(id) {
      return groups.find((g) => g.id === id);
    },
    async createScreenGroup(data) {
      const row = makeGroup({ id: `group-${groups.length + 1}`, clientId: data.clientId ?? null, name: data.name });
      groups.push(row);
      return row;
    },
    async updateScreenGroup(id, data) {
      const idx = groups.findIndex((g) => g.id === id);
      if (idx === -1) return undefined;
      groups[idx] = { ...groups[idx], ...(data as Partial<ScreenGroup>) };
      return groups[idx];
    },
    async deleteScreenGroup(id) {
      const before = groups.length;
      const idx = groups.findIndex((g) => g.id === id);
      if (idx >= 0) groups.splice(idx, 1);
      return groups.length < before;
    },
    async getGroupMembers(groupId) {
      const ids = new Set(memberships.filter((m) => m.groupId === groupId).map((m) => m.screenId));
      return screens.filter((s) => ids.has(s.id));
    },
    async addScreenToGroup(groupId, screenId) {
      memberships.push({ groupId, screenId });
    },
    async removeScreenFromGroup(groupId, screenId) {
      const before = memberships.length;
      for (let i = memberships.length - 1; i >= 0; i--) {
        if (memberships[i].groupId === groupId && memberships[i].screenId === screenId) {
          memberships.splice(i, 1);
        }
      }
      return memberships.length < before;
    },
    async getAllScreenGroupMemberships() {
      return memberships.map((m) => ({ screenId: m.screenId, groupId: m.groupId }));
    },

    // Screens
    async getScreens() {
      return screens.slice();
    },
    async getScreen(id) {
      return screens.find((s) => s.id === id);
    },

    // Programmes
    async getProgrammes() {
      return programmes.slice();
    },
    async getProgramme(id) {
      return programmes.find((p) => p.id === id);
    },
    async createProgramme(data) {
      const row = makeProgramme({ id: `programme-${programmes.length + 1}`, eventId: data.eventId, name: data.name });
      programmes.push(row);
      return row;
    },
    async updateProgramme(id, data) {
      const idx = programmes.findIndex((p) => p.id === id);
      if (idx === -1) return undefined;
      programmes[idx] = { ...programmes[idx], ...(data as Partial<Programme>) };
      return programmes[idx];
    },
    async deleteProgramme(id) {
      const before = programmes.length;
      const idx = programmes.findIndex((p) => p.id === id);
      if (idx >= 0) programmes.splice(idx, 1);
      return programmes.length < before;
    },
    async reorderProgrammes(orderedIds) {
      state.reorderedProgrammes = orderedIds.slice();
    },
    async getProgrammeVersions() {
      return programmeVersions.slice();
    },
    async createProgrammeVersion(data) {
      const row = {
        id: `version-${programmeVersions.length + 1}`,
        programmeId: data.programmeId,
        versionNumber: data.versionNumber ?? 1,
        status: data.status ?? "draft",
        publishedAt: null,
        createdAt: new Date("2026-05-01T00:00:00Z"),
      } as unknown as ProgrammeVersion;
      programmeVersions.push(row);
      return row;
    },
    async updateProgrammeVersion(id, data) {
      const idx = programmeVersions.findIndex((v) => v.id === id);
      if (idx === -1) return undefined;
      programmeVersions[idx] = { ...programmeVersions[idx], ...(data as Partial<ProgrammeVersion>) };
      return programmeVersions[idx];
    },

    // Events
    async getEvents() {
      return events.slice();
    },
    async getEvent(id) {
      return events.find((e) => e.id === id);
    },

    // Screen presets
    async getScreenPresets(filter) {
      let out = presets.slice();
      if (filter?.screenId) out = out.filter((p) => p.screenId === filter.screenId);
      if (filter?.groupId) out = out.filter((p) => p.groupId === filter.groupId);
      return out;
    },
    async getScreenPreset(id) {
      return presets.find((p) => p.id === id);
    },
    async createScreenPreset(data) {
      const row = makePreset({
        id: `preset-${presets.length + 1}`,
        name: data.name,
        screenId: data.screenId ?? null,
        groupId: data.groupId ?? null,
      });
      presets.push(row);
      return row;
    },
    async updateScreenPreset(id, data) {
      const idx = presets.findIndex((p) => p.id === id);
      if (idx === -1) return undefined;
      presets[idx] = { ...presets[idx], ...(data as Partial<ScreenPreset>) };
      return presets[idx];
    },
    async deleteScreenPreset(id) {
      const before = presets.length;
      const idx = presets.findIndex((p) => p.id === id);
      if (idx >= 0) presets.splice(idx, 1);
      return presets.length < before;
    },
    async reorderScreenPresets(orderedIds) {
      state.reorderedPresets = orderedIds.slice();
    },

    // Live overrides
    async getLiveOverrides() {
      return overrides.slice();
    },
    async createLiveOverride(data) {
      const row = { id: `override-${overrides.length + 1}`, ...(data as any) } as unknown as LiveOverride;
      overrides.push(row);
      return row;
    },
    async deleteLiveOverride(id) {
      const before = overrides.length;
      const idx = overrides.findIndex((o) => o.id === id);
      if (idx >= 0) overrides.splice(idx, 1);
      return overrides.length < before;
    },
  };

  return Object.assign(storage, state);
}

async function startTestServer(opts: {
  storage: CustomerDataRoutesStorage;
  user: FakeUser | null;
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
  const requireAdminOrAccountManager = (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).dbUser;
    if (!u || (u.role !== "admin" && u.role !== "account_manager")) {
      return res.status(403).json({ error: "Admin or Account Manager access required" });
    }
    next();
  };
  const loadUserContext = (_req: Request, _res: Response, next: NextFunction) => next();

  app.use(inject);

  mountCustomerDataRoutes(app, {
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
      isAdmin: (req) => (req as any).dbUser?.role === "admin",
    },
    requireAuth,
    requireAuthOrToken,
    requireAdminOrAccountManager,
    loadUserContext,
    refreshScreensForVersion: () => {},
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

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const patch = (body: unknown) => ({ ...json(body), method: "PATCH" });

// ============ DISPLAY PROFILES — account_manager ============

test("account_manager — display profiles: reads only allowed sites (plus global), scoped query 403 on disallowed", async () => {
  const storage = makeFakeStorage({
    profiles: [
      makeProfile({ id: "pa", clientId: "siteA" }),
      makeProfile({ id: "pb", clientId: "siteB" }),
      makeProfile({ id: "pc", clientId: "siteC" }),
      makeProfile({ id: "pg", clientId: null }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/display-profiles`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((p) => p.id).sort(), ["pa", "pc", "pg"]);
    assert.equal((await fetch(`${srv.base}/api/display-profiles?clientId=siteA`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/display-profiles?clientId=siteC`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/display-profiles?clientId=siteB`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("account_manager — display profiles: create allowed in granted site, denied in disallowed", async () => {
  const storage = makeFakeStorage({});
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const ok = await fetch(`${srv.base}/api/display-profiles`, json({ clientId: "siteC", name: "New C" }));
    assert.equal(ok.status, 201);
    assert.equal(storage.profiles.length, 1);

    const denied = await fetch(`${srv.base}/api/display-profiles`, json({ clientId: "siteB", name: "Injected" }));
    assert.equal(denied.status, 403);
    assert.equal(storage.profiles.length, 1, "no siteB profile may be created");
  } finally {
    await srv.close();
  }
});

test("account_manager — display profiles: edit/delete scoped, disallowed rejected, cross-site move rejected", async () => {
  const storage = makeFakeStorage({
    profiles: [
      makeProfile({ id: "pa", clientId: "siteA", name: "A" }),
      makeProfile({ id: "pb", clientId: "siteB", name: "B" }),
      makeProfile({ id: "pc", clientId: "siteC", name: "C" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    assert.equal((await fetch(`${srv.base}/api/display-profiles/pc`, patch({ name: "Renamed C" }))).status, 200);
    assert.equal(storage.profiles.find((p) => p.id === "pc")?.name, "Renamed C");

    assert.equal((await fetch(`${srv.base}/api/display-profiles/pb`, patch({ name: "Hijacked" }))).status, 403);
    assert.equal(storage.profiles.find((p) => p.id === "pb")?.name, "B");

    const move = await fetch(`${srv.base}/api/display-profiles/pa`, patch({ clientId: "siteB" }));
    assert.equal(move.status, 403);
    assert.match(((await move.json()) as { error: string }).error, /target site/i);
    assert.equal(storage.profiles.find((p) => p.id === "pa")?.clientId, "siteA");

    assert.equal((await fetch(`${srv.base}/api/display-profiles/pb`, { method: "DELETE" })).status, 403);
    assert.ok(storage.profiles.find((p) => p.id === "pb"), "siteB profile must survive");
    assert.equal((await fetch(`${srv.base}/api/display-profiles/pa`, { method: "DELETE" })).status, 204);
    assert.equal(storage.profiles.find((p) => p.id === "pa"), undefined);
  } finally {
    await srv.close();
  }
});

// ============ SCREEN GROUPS — site_user regression (Task #258) ============

test("screen groups — PATCH/DELETE are tenant-scoped (regression: site A user cannot edit/delete a site B group)", async () => {
  const storage = makeFakeStorage({
    groups: [makeGroup({ id: "gb", clientId: "siteB", name: "B" })],
  });
  const srv = await startTestServer({ storage, user: { role: "site_user", allowedClientIds: ["siteA"] } });
  try {
    const editB = await fetch(`${srv.base}/api/screen-groups/gb`, patch({ name: "Hijacked" }));
    assert.equal(editB.status, 403);
    assert.equal(storage.groups.find((g) => g.id === "gb")?.name, "B", "site B group must be untouched");

    const delB = await fetch(`${srv.base}/api/screen-groups/gb`, { method: "DELETE" });
    assert.equal(delB.status, 403);
    assert.ok(storage.groups.find((g) => g.id === "gb"), "site B group must survive");
  } finally {
    await srv.close();
  }
});

// ============ SCREEN GROUPS — account_manager ============

test("account_manager — screen groups: reads only allowed sites (plus global), scoped query 403 on disallowed", async () => {
  const storage = makeFakeStorage({
    groups: [
      makeGroup({ id: "ga", clientId: "siteA" }),
      makeGroup({ id: "gb", clientId: "siteB" }),
      makeGroup({ id: "gc", clientId: "siteC" }),
      makeGroup({ id: "gg", clientId: null }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/screen-groups`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((g) => g.id).sort(), ["ga", "gc", "gg"]);
    assert.equal((await fetch(`${srv.base}/api/screen-groups?clientId=siteA`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/screen-groups?clientId=siteB`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("account_manager — screen groups: create/edit/delete scoped, disallowed rejected, cross-site move rejected", async () => {
  const storage = makeFakeStorage({
    groups: [
      makeGroup({ id: "ga", clientId: "siteA", name: "A" }),
      makeGroup({ id: "gb", clientId: "siteB", name: "B" }),
      makeGroup({ id: "gc", clientId: "siteC", name: "C" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    assert.equal((await fetch(`${srv.base}/api/screen-groups`, json({ clientId: "siteC", name: "New C" }))).status, 201);
    assert.equal((await fetch(`${srv.base}/api/screen-groups`, json({ clientId: "siteB", name: "Injected" }))).status, 403);

    assert.equal((await fetch(`${srv.base}/api/screen-groups/gc`, patch({ name: "Renamed C" }))).status, 200);
    assert.equal((await fetch(`${srv.base}/api/screen-groups/gb`, patch({ name: "Hijacked" }))).status, 403);
    assert.equal(storage.groups.find((g) => g.id === "gb")?.name, "B");

    const move = await fetch(`${srv.base}/api/screen-groups/ga`, patch({ clientId: "siteB" }));
    assert.equal(move.status, 403);
    assert.equal(storage.groups.find((g) => g.id === "ga")?.clientId, "siteA");

    assert.equal((await fetch(`${srv.base}/api/screen-groups/gb`, { method: "DELETE" })).status, 403);
    assert.ok(storage.groups.find((g) => g.id === "gb"));
    assert.equal((await fetch(`${srv.base}/api/screen-groups/gc`, { method: "DELETE" })).status, 204);
  } finally {
    await srv.close();
  }
});

test("account_manager — screen group memberships: add denied on disallowed group, flat list site-filtered", async () => {
  const storage = makeFakeStorage({
    groups: [
      makeGroup({ id: "ga", clientId: "siteA" }),
      makeGroup({ id: "gb", clientId: "siteB" }),
    ],
    screens: [
      makeScreen({ id: "sa", clientId: "siteA" }),
      makeScreen({ id: "sb", clientId: "siteB" }),
    ],
    memberships: [
      { groupId: "ga", screenId: "sa" },
      { groupId: "gb", screenId: "sb" },
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    // Add a screen to a disallowed (siteB) group → 403.
    const addB = await fetch(`${srv.base}/api/screen-groups/gb/members`, json({ screenId: "sb" }));
    assert.equal(addB.status, 403);

    // Members of a disallowed group → 403.
    assert.equal((await fetch(`${srv.base}/api/screen-groups/gb/members`)).status, 403);

    // Flat membership list only returns memberships whose screen is in an allowed site.
    const flat = (await (await fetch(`${srv.base}/api/screen-group-memberships`)).json()) as Membership[];
    assert.deepEqual(flat.map((m) => m.screenId).sort(), ["sa"], "siteB membership filtered out");
  } finally {
    await srv.close();
  }
});

// ============ PROGRAMMES — account_manager (scoped via event's client) ============

test("account_manager — programmes: reads only programmes whose event is in allowed sites, scoped query 403 on disallowed", async () => {
  const storage = makeFakeStorage({
    events: [
      makeEvent({ id: "ea", clientId: "siteA" }),
      makeEvent({ id: "eb", clientId: "siteB" }),
      makeEvent({ id: "ec", clientId: "siteC" }),
    ],
    programmes: [
      makeProgramme({ id: "pa", eventId: "ea" }),
      makeProgramme({ id: "pb", eventId: "eb" }),
      makeProgramme({ id: "pc", eventId: "ec" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/programmes`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((p) => p.id).sort(), ["pa", "pc"]);
    assert.equal((await fetch(`${srv.base}/api/programmes?clientId=siteA`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/programmes?clientId=siteB`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("account_manager — programmes: create/edit/delete scoped, disallowed rejected, cross-event move rejected", async () => {
  const storage = makeFakeStorage({
    events: [
      makeEvent({ id: "ea", clientId: "siteA" }),
      makeEvent({ id: "eb", clientId: "siteB" }),
      makeEvent({ id: "ec", clientId: "siteC" }),
    ],
    programmes: [
      makeProgramme({ id: "pa", eventId: "ea", name: "A" }),
      makeProgramme({ id: "pb", eventId: "eb", name: "B" }),
      makeProgramme({ id: "pc", eventId: "ec", name: "C" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    assert.equal((await fetch(`${srv.base}/api/programmes`, json({ eventId: "ec", name: "New C" }))).status, 201);
    assert.equal((await fetch(`${srv.base}/api/programmes`, json({ eventId: "eb", name: "Injected" }))).status, 403);

    assert.equal((await fetch(`${srv.base}/api/programmes/pc`, patch({ name: "Renamed C" }))).status, 200);
    assert.equal((await fetch(`${srv.base}/api/programmes/pb`, patch({ name: "Hijacked" }))).status, 403);
    assert.equal(storage.programmes.find((p) => p.id === "pb")?.name, "B");

    // Cross-event move into a disallowed event → 403.
    const move = await fetch(`${srv.base}/api/programmes/pa`, patch({ eventId: "eb" }));
    assert.equal(move.status, 403);
    assert.equal(storage.programmes.find((p) => p.id === "pa")?.eventId, "ea");

    assert.equal((await fetch(`${srv.base}/api/programmes/pb`, { method: "DELETE" })).status, 403);
    assert.ok(storage.programmes.find((p) => p.id === "pb"));
    assert.equal((await fetch(`${srv.base}/api/programmes/pc`, { method: "DELETE" })).status, 204);
  } finally {
    await srv.close();
  }
});

test("account_manager — programmes: reorder rejected if any programme belongs to a disallowed site", async () => {
  const storage = makeFakeStorage({
    events: [
      makeEvent({ id: "ea", clientId: "siteA" }),
      makeEvent({ id: "eb", clientId: "siteB" }),
    ],
    programmes: [
      makeProgramme({ id: "pa", eventId: "ea" }),
      makeProgramme({ id: "pb", eventId: "eb" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const res = await fetch(`${srv.base}/api/programmes/reorder`, patch({ orderedIds: ["pa", "pb"] }));
    assert.equal(res.status, 403);
    assert.equal(storage.reorderedProgrammes, null, "no reorder may be persisted");
  } finally {
    await srv.close();
  }
});

// ============ SCREEN PRESETS — account_manager (scoped via screen/group client) ============

test("account_manager — screen presets: list filtered to presets whose target is in an allowed site", async () => {
  const storage = makeFakeStorage({
    screens: [
      makeScreen({ id: "sa", clientId: "siteA" }),
      makeScreen({ id: "sb", clientId: "siteB" }),
    ],
    groups: [makeGroup({ id: "gc", clientId: "siteC" })],
    presets: [
      makePreset({ id: "pa", screenId: "sa" }),
      makePreset({ id: "pb", screenId: "sb" }),
      makePreset({ id: "pc", groupId: "gc" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    const list = (await (await fetch(`${srv.base}/api/screen-presets`)).json()) as Array<{ id: string }>;
    assert.deepEqual(list.map((p) => p.id).sort(), ["pa", "pc"], "siteB preset filtered out");

    // Scoped reads by target screen/group enforce access.
    assert.equal((await fetch(`${srv.base}/api/screen-presets?screenId=sa`)).status, 200);
    assert.equal((await fetch(`${srv.base}/api/screen-presets?screenId=sb`)).status, 403);
  } finally {
    await srv.close();
  }
});

test("account_manager — screen presets: create/edit/delete scoped, disallowed rejected", async () => {
  const storage = makeFakeStorage({
    screens: [
      makeScreen({ id: "sa", clientId: "siteA" }),
      makeScreen({ id: "sb", clientId: "siteB" }),
      makeScreen({ id: "sc", clientId: "siteC" }),
    ],
    presets: [
      makePreset({ id: "pb", screenId: "sb", name: "B" }),
      makePreset({ id: "pc", screenId: "sc", name: "C" }),
    ],
  });
  const srv = await startTestServer({ storage, user: MANAGER });
  try {
    assert.equal((await fetch(`${srv.base}/api/screen-presets`, json({ name: "New C", screenId: "sc" }))).status, 201);
    const denied = await fetch(`${srv.base}/api/screen-presets`, json({ name: "Injected", screenId: "sb" }));
    assert.equal(denied.status, 403);

    assert.equal((await fetch(`${srv.base}/api/screen-presets/pc`, patch({ name: "Renamed C" }))).status, 200);
    assert.equal((await fetch(`${srv.base}/api/screen-presets/pb`, patch({ name: "Hijacked" }))).status, 403);
    assert.equal(storage.presets.find((p) => p.id === "pb")?.name, "B");

    assert.equal((await fetch(`${srv.base}/api/screen-presets/pb`, { method: "DELETE" })).status, 403);
    assert.ok(storage.presets.find((p) => p.id === "pb"));
    assert.equal((await fetch(`${srv.base}/api/screen-presets/pc`, { method: "DELETE" })).status, 204);
  } finally {
    await srv.close();
  }
});

test("screen presets — site_user is blocked by role gate on write routes", async () => {
  const storage = makeFakeStorage({
    screens: [makeScreen({ id: "sa", clientId: "siteA" })],
  });
  const srv = await startTestServer({ storage, user: { role: "site_user", allowedClientIds: ["siteA"] } });
  try {
    // requireAdminOrAccountManager gate → 403 even for an own-site target.
    const res = await fetch(`${srv.base}/api/screen-presets`, json({ name: "X", screenId: "sa" }));
    assert.equal(res.status, 403);
    assert.equal(storage.presets.length, 0);
  } finally {
    await srv.close();
  }
});

// ============ ADMIN — cross-site access ============

test("admin — can read and mutate every area across any site", async () => {
  const storage = makeFakeStorage({
    profiles: [makeProfile({ id: "pb", clientId: "siteB", name: "B" })],
    groups: [makeGroup({ id: "gb", clientId: "siteB", name: "B" })],
    events: [makeEvent({ id: "eb", clientId: "siteB" })],
    programmes: [makeProgramme({ id: "prb", eventId: "eb", name: "B" })],
    screens: [makeScreen({ id: "sb", clientId: "siteB" })],
    presets: [makePreset({ id: "preb", screenId: "sb", name: "B" })],
  });
  const srv = await startTestServer({ storage, user: { role: "admin", allowedClientIds: null } });
  try {
    // Unfiltered reads.
    assert.equal(((await (await fetch(`${srv.base}/api/display-profiles`)).json()) as unknown[]).length, 1);
    assert.equal(((await (await fetch(`${srv.base}/api/screen-groups`)).json()) as unknown[]).length, 1);
    assert.equal(((await (await fetch(`${srv.base}/api/programmes`)).json()) as unknown[]).length, 1);
    assert.equal(((await (await fetch(`${srv.base}/api/screen-presets`)).json()) as unknown[]).length, 1);

    // Cross-site edits succeed.
    assert.equal((await fetch(`${srv.base}/api/display-profiles/pb`, patch({ name: "Admin P" }))).status, 200);
    assert.equal((await fetch(`${srv.base}/api/screen-groups/gb`, patch({ name: "Admin G" }))).status, 200);
    assert.equal((await fetch(`${srv.base}/api/programmes/prb`, patch({ name: "Admin Prog" }))).status, 200);
    assert.equal((await fetch(`${srv.base}/api/screen-presets/preb`, patch({ name: "Admin Preset" }))).status, 200);
  } finally {
    await srv.close();
  }
});

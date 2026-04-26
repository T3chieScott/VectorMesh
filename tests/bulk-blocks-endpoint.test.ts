import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";
import { buildBulkBlocksHandler } from "../server/bulkBlocksHandler";
import type {
  Event,
  Programme,
  ProgrammeVersion,
  Screen,
  ScreenGroup,
  LayoutTemplate,
  Playlist,
  ScheduleBlock,
  InsertScheduleBlock,
} from "../shared/schema";

// Stand-in storage for the bulk-blocks handler. Wires up just enough
// of the read/write surface that processBulkBlocks needs, plus a few
// knobs each test uses to simulate forbidden layouts/playlists,
// missing targets, draft auto-creation, etc.
function makeDeps(opts: {
  programme: Programme;
  event: Event | null;
  versions: ProgrammeVersion[];
  layouts?: LayoutTemplate[];
  playlists?: Playlist[];
  screens?: Screen[];
  groups?: ScreenGroup[];
  // Force a per-row server_error on an input by name so we can prove
  // partial-failure preserves remaining rows.
  serverErrorOnNames?: Set<string>;
}) {
  const created: ScheduleBlock[] = [];
  const versions = [...opts.versions];
  let seriesCounter = 0;
  return {
    created,
    versions,
    deps: {
      getProgramme: async (id: string) =>
        id === opts.programme.id ? opts.programme : undefined,
      getEvent: async (id: string) =>
        opts.event && id === opts.event.id ? opts.event : undefined,
      getProgrammeVersionsByProgramme: async (programmeId: string) =>
        versions.filter((v) => v.programmeId === programmeId),
      createProgrammeVersion: async (data: {
        programmeId: string;
        versionNumber: number;
        status: "draft";
      }) => {
        const v: ProgrammeVersion = {
          id: `v-new-${versions.length + 1}`,
          programmeId: data.programmeId,
          versionNumber: data.versionNumber,
          status: data.status,
          publishedAt: null,
          createdAt: new Date(),
        } as unknown as ProgrammeVersion;
        versions.push(v);
        return v;
      },
      getScreen: async (id: string) =>
        opts.screens?.find((s) => s.id === id),
      getScreenGroup: async (id: string) =>
        opts.groups?.find((g) => g.id === id),
      getLayoutTemplate: async (id: string) =>
        opts.layouts?.find((l) => l.id === id),
      getPlaylist: async (id: string) =>
        opts.playlists?.find((p) => p.id === id),
      createScheduleBlock: async (data: InsertScheduleBlock) => {
        if (opts.serverErrorOnNames?.has(data.name)) {
          throw new Error("simulated storage failure");
        }
        const row: ScheduleBlock = {
          id: `b-${created.length + 1}`,
          programmeVersionId: data.programmeVersionId,
          name: data.name,
          priority: data.priority ?? 0,
          layoutTemplateId: data.layoutTemplateId ?? null,
          targets: data.targets ?? [],
          timeRules: data.timeRules ?? [],
          zoneSources: data.zoneSources ?? [],
          seriesId: data.seriesId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as ScheduleBlock;
        created.push(row);
        return row;
      },
      newSeriesId: () => {
        seriesCounter += 1;
        return `series-${seriesCounter}`;
      },
    },
  };
}

interface TestUser {
  isAdmin?: boolean;
  allowedClientIds?: string[] | null;
}

function injectUser(user: TestUser | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (user) {
      (req as any).dbUser = { role: user.isAdmin ? "admin" : "editor" };
      (req as any).allowedClientIds =
        user.allowedClientIds === undefined ? null : user.allowedClientIds;
    }
    next();
  };
}

function canAccessClientFn(req: Request, clientId: string): boolean {
  if ((req as any).dbUser?.role === "admin") return true;
  const allowed = (req as any).allowedClientIds as string[] | null | undefined;
  return Array.isArray(allowed) ? allowed.includes(clientId) : false;
}

async function withTestServer(
  user: TestUser | null,
  deps: ReturnType<typeof makeDeps>["deps"],
  call: (port: number) => Promise<{ status: number; body: any }>,
) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.post(
    "/api/programmes/:programmeId/blocks/bulk",
    buildBulkBlocksHandler(deps as any, { canAccessClient: canAccessClientFn }),
  );
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    return await call(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function postBulk(port: number, programmeId: string, body: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}/api/programmes/${programmeId}/blocks/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// --- Fixture builders --------------------------------------------------------

function makeProgramme(id = "P1", eventId = "E1"): Programme {
  return {
    id,
    name: id,
    eventId,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Programme;
}

function makeEvent(id = "E1", clientId: string | null = "client-A"): Event {
  return {
    id,
    name: id,
    clientId,
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-12-31T00:00:00Z"),
    description: null,
    locationLat: null,
    locationLng: null,
    timezone: null,
    weatherCity: null,
    location: null,
    createdAt: new Date(),
  } as unknown as Event;
}

function makeDraft(programmeId = "P1", id = "v-draft", n = 1): ProgrammeVersion {
  return {
    id,
    programmeId,
    versionNumber: n,
    status: "draft",
    publishedAt: null,
    createdAt: new Date(),
  } as unknown as ProgrammeVersion;
}

function makePublished(programmeId = "P1", id = "v-pub", n = 1): ProgrammeVersion {
  return {
    id,
    programmeId,
    versionNumber: n,
    status: "published",
    publishedAt: new Date(),
    createdAt: new Date(),
  } as unknown as ProgrammeVersion;
}

function makeScreen(id: string, clientId: string | null = "client-A"): Screen {
  return { id, clientId, name: id } as unknown as Screen;
}

function makeGroup(id: string, clientId: string | null = "client-A"): ScreenGroup {
  return { id, clientId, name: id } as unknown as ScreenGroup;
}

function makeLayout(id: string, clientId: string | null = "client-A"): LayoutTemplate {
  return { id, clientId, name: id } as unknown as LayoutTemplate;
}

function makePlaylist(id: string, clientId: string | null = "client-A"): Playlist {
  return { id, clientId, name: id } as unknown as Playlist;
}

// --- Tests ------------------------------------------------------------------

test("bulk-blocks: all-success returns one created result per row", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent(),
    versions: [makeDraft()],
    layouts: [makeLayout("L1")],
    screens: [makeScreen("S1")],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          {
            name: "B1",
            priority: 10,
            layoutTemplateId: "L1",
            targets: [{ type: "screen", id: "S1" }],
            timeRules: [],
            zoneSources: [],
          },
          {
            name: "B2",
            priority: 5,
            layoutTemplateId: null,
            targets: [],
            timeRules: [],
            zoneSources: [],
          },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results.length, 2);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "created");
  assert.equal(out.body.draftCreated, false);
  assert.equal(out.body.destinationVersionId, "v-draft");
  assert.equal(created.length, 2);
  // Each created block gets its own fresh seriesId — paste must NOT
  // reuse the source's series.
  assert.ok(created[0].seriesId);
  assert.ok(created[1].seriesId);
  assert.notEqual(created[0].seriesId, created[1].seriesId);
});

test("bulk-blocks: target drops + still creates the block (empty targets is valid)", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent(),
    versions: [makeDraft()],
    layouts: [makeLayout("L1")],
    screens: [
      makeScreen("S1", "client-A"),
      // S2 belongs to a different client and must be dropped silently.
      makeScreen("S2", "client-B"),
    ],
    groups: [makeGroup("G_MISSING_CLIENT", null)],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          {
            name: "B1",
            layoutTemplateId: "L1",
            targets: [
              { type: "screen", id: "S1" },
              { type: "screen", id: "S2" },
              { type: "group", id: "G_MISSING_CLIENT" },
              { type: "screen", id: "S_DOES_NOT_EXIST" },
            ],
            timeRules: [],
            zoneSources: [],
          },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[0].droppedTargets.length, 3);
  // Persisted block keeps only S1.
  assert.equal(created[0].targets.length, 1);
  assert.equal((created[0].targets as any[])[0].id, "S1");
});

test("bulk-blocks: forbidden_layout — wrong-client layout skipped per-row", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent("E1", "client-A"),
    versions: [makeDraft()],
    layouts: [
      makeLayout("L_OK", "client-A"),
      makeLayout("L_WRONG", "client-B"),
    ],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          { name: "ok", layoutTemplateId: "L_OK", targets: [], timeRules: [], zoneSources: [] },
          { name: "wrong", layoutTemplateId: "L_WRONG", targets: [], timeRules: [], zoneSources: [] },
          { name: "missing", layoutTemplateId: "L_DOES_NOT_EXIST", targets: [], timeRules: [], zoneSources: [] },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results.length, 3);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "error");
  assert.equal(out.body.results[1].code, "forbidden_layout");
  assert.equal(out.body.results[2].status, "error");
  assert.equal(out.body.results[2].code, "forbidden_layout");
  // Indexes preserved so the client can pair results back to its preview rows.
  assert.deepEqual(out.body.results.map((r: any) => r.index), [0, 1, 2]);
  assert.equal(created.length, 1);
});

test("bulk-blocks: forbidden_playlist — wrong-client playlist skipped per-row", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent("E1", "client-A"),
    versions: [makeDraft()],
    playlists: [
      makePlaylist("PL_OK", "client-A"),
      makePlaylist("PL_WRONG", "client-B"),
    ],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          {
            name: "wrong",
            targets: [],
            timeRules: [],
            zoneSources: [{ zoneId: "z1", type: "playlist", playlistId: "PL_WRONG" }],
          },
          {
            name: "ok",
            targets: [],
            timeRules: [],
            zoneSources: [{ zoneId: "z1", type: "playlist", playlistId: "PL_OK" }],
          },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results[0].status, "error");
  assert.equal(out.body.results[0].code, "forbidden_playlist");
  assert.equal(out.body.results[1].status, "created");
  assert.equal(created.length, 1);
});

test("bulk-blocks: auto-creates a draft when only published exists", async () => {
  const published = makePublished("P1", "v-pub", 3);
  const { deps, versions, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent(),
    versions: [published],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          { name: "B1", targets: [], timeRules: [], zoneSources: [] },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.draftCreated, true);
  // Inserted version is one above the existing max.
  const newDraft = versions.find((v) => v.status === "draft");
  assert.ok(newDraft);
  assert.equal(newDraft!.versionNumber, 4);
  assert.equal(out.body.destinationVersionId, newDraft!.id);
  assert.equal(created[0].programmeVersionId, newDraft!.id);
});

test("bulk-blocks: auto-creates a v1 draft when the programme has no versions at all", async () => {
  // Mirrors the cards/table view's "paste into a brand-new
  // programme" flow: the client now mounts the section-level paste
  // menu on programmes with zero versions, relying on the server
  // to bootstrap the destination draft.
  const { deps, versions, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent(),
    versions: [],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          { name: "B1", targets: [], timeRules: [], zoneSources: [] },
          { name: "B2", targets: [], timeRules: [], zoneSources: [] },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.draftCreated, true);
  assert.equal(versions.length, 1);
  const newDraft = versions[0];
  assert.equal(newDraft.status, "draft");
  // No prior versions → versionNumber starts at 1.
  assert.equal(newDraft.versionNumber, 1);
  assert.equal(out.body.destinationVersionId, newDraft.id);
  assert.equal(created.length, 2);
  assert.equal(created[0].programmeVersionId, newDraft.id);
  assert.equal(created[1].programmeVersionId, newDraft.id);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "created");
});

test("bulk-blocks: partial-failure (server_error on one row) — remaining rows still create", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent(),
    versions: [makeDraft()],
    serverErrorOnNames: new Set(["BOOM"]),
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [
          { name: "ok-1", targets: [], timeRules: [], zoneSources: [] },
          { name: "BOOM", targets: [], timeRules: [], zoneSources: [] },
          { name: "ok-2", targets: [], timeRules: [], zoneSources: [] },
        ],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.results.length, 3);
  assert.equal(out.body.results[0].status, "created");
  assert.equal(out.body.results[1].status, "error");
  assert.equal(out.body.results[1].code, "server_error");
  assert.equal(out.body.results[2].status, "created");
  assert.equal(created.length, 2);
});

test("bulk-blocks: 403 when caller can't access the destination event's client", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent("E1", "client-A"),
    versions: [makeDraft()],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-B"] },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [{ name: "B1", targets: [], timeRules: [], zoneSources: [] }],
      }),
  );
  assert.equal(out.status, 403);
  assert.equal(created.length, 0);
});

test("bulk-blocks: 404 when the programme doesn't exist", async () => {
  const { deps } = makeDeps({
    programme: makeProgramme("P1"),
    event: makeEvent(),
    versions: [makeDraft()],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) =>
      postBulk(port, "P_DOES_NOT_EXIST", {
        blocks: [{ name: "B1", targets: [], timeRules: [], zoneSources: [] }],
      }),
  );
  assert.equal(out.status, 404);
});

test("bulk-blocks: rejects empty blocks array up front", async () => {
  const { deps } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent(),
    versions: [makeDraft()],
  });
  const out = await withTestServer(
    { allowedClientIds: ["client-A"] },
    deps,
    (port) => postBulk(port, "P1", { blocks: [] }),
  );
  assert.equal(out.status, 400);
});

test("bulk-blocks: admin bypasses client-scope check", async () => {
  const { deps, created } = makeDeps({
    programme: makeProgramme(),
    event: makeEvent("E1", "client-A"),
    versions: [makeDraft()],
  });
  const out = await withTestServer(
    { isAdmin: true, allowedClientIds: null },
    deps,
    (port) =>
      postBulk(port, "P1", {
        blocks: [{ name: "B1", targets: [], timeRules: [], zoneSources: [] }],
      }),
  );
  assert.equal(out.status, 200);
  assert.equal(created.length, 1);
});

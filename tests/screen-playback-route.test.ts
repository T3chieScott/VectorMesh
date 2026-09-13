import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { ResolverDeps } from "../server/contentResolver";
import { buildScreenPlaybackHandler } from "../server/screenPlaybackHandler";

const NOW = "2026-04-24T10:00:00.000Z";

function makeRoute(options: {
  screenClientId?: string | null;
  allowed?: readonly string[] | null;
  currentEvent?: any;
  events?: Record<string, any>;
  bookings?: any[];
  fallbackPlaylist?: any;
  overrides?: any[];
  layouts?: Record<string, any>;
  onResolverCall?: () => void;
}) {
  const screen = {
    id: "screen-1",
    name: "Screen",
    clientId: options.screenClientId ?? "client-a",
    lastSeen: null,
    fallbackLayoutId: null,
    fallbackPlaylistId: options.fallbackPlaylist?.id ?? null,
  } as any;
  const resolverDeps: ResolverDeps = {
    getLiveOverrides: async () => {
      options.onResolverCall?.();
      return options.overrides ?? [];
    },
    getCurrentEventForScreen: async () => options.currentEvent,
    getProgrammes: async () => [],
    getProgrammeVersions: async () => [],
    getScheduleBlocks: async () => [],
    getLayoutTemplate: async (id: string) => options.layouts?.[id],
    getScreenGroupIds: async () => [],
    getPlaylist: async (id) =>
      options.fallbackPlaylist?.id === id ? options.fallbackPlaylist : undefined,
  };
  const storage = {
    getScreen: async (id: string) => (id === screen.id ? screen : undefined),
    getClient: async () => ({ timezone: "UTC" }),
    getEvent: async (id: string) => options.events?.[id],
    getScreenEventBookings: async () => options.bookings ?? [],
  } as any;
  const allowed = options.allowed ?? null;
  const handler = buildScreenPlaybackHandler({
    storage,
    resolverDeps,
    getAllowedClientIds: () => allowed,
    canAccessClient: (_req, clientId) => allowed === null || allowed.includes(clientId),
  });

  const app = express();
  app.use((req, _res, next) => {
    (req as any).dbUser = { id: "user-1", role: "admin" };
    next();
  });
  app.get("/api/screens/:id/playback", handler);
  return app;
}

async function request(
  app: express.Express,
  query = "",
) {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/screens/screen-1/playback${query}`,
    );
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("authorized playback response has bounded safe resolvedContent and legacy fields", async () => {
  const id = "p".repeat(300);
  const name = "n".repeat(400);
  const result = await request(makeRoute({
    allowed: ["client-a"],
    fallbackPlaylist: { id, name },
  }), `?now=${encodeURIComponent(NOW)}`);

  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), [
    "activeEvent",
    "block",
    "nextBooking",
    "now",
    "resolvedContent",
  ]);
  assert.equal(result.body.activeEvent, null);
  assert.deepEqual(result.body.block, { kind: "noEvent" });
  assert.equal(result.body.nextBooking, null);
  assert.equal(result.body.resolvedContent.source, "fallback-playlist");
  assert.equal(result.body.resolvedContent.id.length, 128);
  assert.equal(result.body.resolvedContent.name.length, 256);
  assert.equal("trace" in result.body.resolvedContent, false);
  assert.equal("activeZoneSources" in result.body.resolvedContent, false);
});

test("playback scopes event-bound live overrides while retaining accessible and neutral overrides", async () => {
  const foreignEvent = {
    id: "event-foreign",
    name: "Foreign event",
    clientId: "client-b",
  };
  const foreignOverride = {
    id: "override-foreign",
    eventId: foreignEvent.id,
    name: "Foreign override",
    targets: [],
    layoutTemplateId: "layout-foreign",
    zoneSources: [],
    startTime: new Date("2026-04-24T09:00:00.000Z"),
    endTime: new Date("2026-04-24T11:00:00.000Z"),
    isActive: true,
  };
  const inaccessible = await request(makeRoute({
    allowed: ["client-a"],
    events: { [foreignEvent.id]: foreignEvent },
    overrides: [foreignOverride],
    layouts: {
      [foreignOverride.layoutTemplateId]: { id: "layout-foreign", name: "Foreign layout" },
    },
  }), `?now=${encodeURIComponent(NOW)}`);
  assert.equal(inaccessible.status, 200);
  assert.equal(inaccessible.body.resolvedContent.source, "nothing");
  assert.equal(inaccessible.body.resolvedContent.id, null);
  assert.equal(inaccessible.body.resolvedContent.activeEvent, null);

  const accessibleEvent = {
    id: "event-accessible",
    name: "Accessible event",
    clientId: "client-a",
  };
  const accessibleOverride = {
    ...foreignOverride,
    id: "override-accessible",
    eventId: accessibleEvent.id,
    layoutTemplateId: "layout-accessible",
  };
  const accessible = await request(makeRoute({
    allowed: ["client-a"],
    events: { [accessibleEvent.id]: accessibleEvent },
    overrides: [accessibleOverride],
    layouts: {
      [accessibleOverride.layoutTemplateId]: { id: "layout-accessible", name: "Accessible layout" },
    },
  }), `?now=${encodeURIComponent(NOW)}`);
  assert.equal(accessible.status, 200);
  assert.deepEqual(accessible.body.resolvedContent, {
    source: "live-override",
    type: "layout",
    id: "layout-accessible",
    name: "Accessible layout",
    activeEvent: null,
    programme: null,
    version: null,
    block: null,
    activeProgramme: null,
    activeVersion: null,
    activeBlock: null,
    currentEffectiveEnd: null,
    nextBlock: null,
    nextStart: null,
  });

  const neutralOverride = {
    ...foreignOverride,
    id: "override-neutral",
    eventId: null,
    layoutTemplateId: "layout-neutral",
  };
  const neutral = await request(makeRoute({
    allowed: ["client-a"],
    overrides: [foreignOverride, neutralOverride],
    events: { [foreignEvent.id]: foreignEvent },
    layouts: {
      [neutralOverride.layoutTemplateId]: { id: "layout-neutral", name: "Neutral layout" },
    },
  }), `?now=${encodeURIComponent(NOW)}`);
  assert.equal(neutral.status, 200);
  assert.equal(neutral.body.resolvedContent.source, "live-override");
  assert.equal(neutral.body.resolvedContent.id, "layout-neutral");
  assert.equal(neutral.body.resolvedContent.name, "Neutral layout");
});

test("playback denies a screen outside the caller's allowed client scope", async () => {
  const result = await request(makeRoute({
    screenClientId: "client-b",
    allowed: ["client-a"],
  }));

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "Access denied" });
});

test("playback filters inaccessible active and future events with canAccessBooking", async () => {
  const inaccessibleActive = {
    id: "event-b",
    name: "Hidden active event",
    clientId: "client-b",
  };
  const inaccessibleFuture = {
    id: "future-b",
    name: "Hidden future event",
    clientId: "client-b",
  };
  const visibleFuture = {
    id: "future-a",
    name: "Visible future event",
    clientId: "client-a",
  };
  const result = await request(makeRoute({
    allowed: ["client-a"],
    currentEvent: inaccessibleActive,
    events: {
      [inaccessibleFuture.id]: inaccessibleFuture,
      [visibleFuture.id]: visibleFuture,
    },
    bookings: [
      {
        eventId: inaccessibleFuture.id,
        startsAt: "2026-04-24T11:00:00.000Z",
      },
      {
        eventId: visibleFuture.id,
        startsAt: "2026-04-24T12:00:00.000Z",
      },
    ],
  }), `?now=${encodeURIComponent(NOW)}`);

  assert.equal(result.status, 200);
  assert.equal(result.body.activeEvent, null);
  assert.equal(result.body.resolvedContent.activeEvent, null);
  assert.deepEqual(result.body.nextBooking, {
    eventId: visibleFuture.id,
    eventName: visibleFuture.name,
    startsAt: "2026-04-24T12:00:00.000Z",
  });

  const visibleActive = {
    id: "event-a",
    name: "Visible active event",
    clientId: "client-a",
  };
  const hiddenFutureOnly = await request(makeRoute({
    allowed: ["client-a"],
    currentEvent: visibleActive,
    events: { [inaccessibleFuture.id]: inaccessibleFuture },
    bookings: [{
      eventId: inaccessibleFuture.id,
      startsAt: "2026-04-24T11:00:00.000Z",
    }],
  }), `?now=${encodeURIComponent(NOW)}`);
  assert.equal(hiddenFutureOnly.status, 200);
  assert.deepEqual(hiddenFutureOnly.body.activeEvent, {
    id: visibleActive.id,
    name: visibleActive.name,
  });
  assert.equal(hiddenFutureOnly.body.resolvedContent.activeEvent.id, visibleActive.id);
  assert.equal(hiddenFutureOnly.body.nextBooking, null);
});

test("playback rejects a malformed single now value before playback resolution", async () => {
  let resolverCalls = 0;
  const malformed = await request(
    makeRoute({
      allowed: ["client-a"],
      onResolverCall: () => {
        resolverCalls += 1;
      },
    }),
    "?now=not-a-date",
  );

  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, {
    error: "Invalid now timestamp",
  });
  assert.equal(resolverCalls, 0);
});

test("playback preserves valid, omitted, empty, and repeated now handling", async () => {
  const app = makeRoute({ allowed: ["client-a"] });
  const valid = await request(app, `?now=${encodeURIComponent(NOW)}`);
  assert.equal(valid.status, 200);
  assert.equal(valid.body.now, NOW);
  assert.deepEqual(valid.body.block, { kind: "noEvent" });

  const omitted = await request(makeRoute({ allowed: ["client-a"] }));
  assert.equal(omitted.status, 200);
  assert.equal(Number.isNaN(Date.parse(omitted.body.now)), false);
  assert.deepEqual(omitted.body.block, { kind: "noEvent" });

  const empty = await request(makeRoute({ allowed: ["client-a"] }), "?now=");
  assert.equal(empty.status, 200);
  assert.equal(Number.isNaN(Date.parse(empty.body.now)), false);
  assert.deepEqual(empty.body.block, { kind: "noEvent" });

  const repeated = await request(app, "?now=one&now=two");
  assert.equal(repeated.status, 400);
  assert.deepEqual(repeated.body, {
    error: 'Query param "now" must not be repeated',
  });
});
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRenderProjection,
  getRenderProjectionIdentity,
} from "../client/src/lib/renderProjection";

const payload = (extra: Record<string, unknown> = {}) => ({
  presentation: { revision: "r1", activationEpoch: 10 },
  screen: {
    id: "database-screen",
    name: "Lobby",
    updatedAt: "volatile",
    ipAddress: "10.0.0.1",
    showLiveBanner: true,
  },
  profile: { id: "profile-row", width: 1920, height: 1080 },
  layout: {
    id: "layout-row",
    updatedAt: "volatile",
    aspectRatio: "16:9",
    zones: [{ id: "zone-row", name: "Hero", type: "html", textContent: "Hello" }],
  },
  media: [{
    id: "asset",
    originalPath: "/uploads/asset.png",
    updatedAt: "2024-01-01T00:00:00.000Z",
    mediaType: "image",
  }],
  fonts: [{ id: "font", familyId: "family", name: "Inter", weight: 400, style: "normal", format: "woff2" }],
  playlists: [{ id: "playlist", name: "Rotation", updatedAt: "volatile" }],
  playlistItems: { playlist: [{ id: "item", order: 1, mediaAssetId: "asset" }] },
  layoutTemplates: {},
  zoneSources: [],
  playerVars: { screenName: "Lobby" },
  event: { id: "event-row", name: "Town Hall", updatedAt: "volatile" },
  client: { id: "client-row", name: "Acme", updatedAt: "volatile" },
  ...extra,
});

test("render identity excludes operational and database metadata", () => {
  const first = getRenderProjectionIdentity(payload());
  const second = getRenderProjectionIdentity(payload({
    screen: { ...payload().screen, id: "different", ipAddress: "192.0.2.2", updatedAt: "new" },
    layout: { ...payload().layout, id: "different-layout", updatedAt: "new" },
    heartbeat: 100,
    serverTime: 999,
    refreshRequested: true,
    playerPresentationState: { sequence: 99 },
  }));
  assert.equal(first, second);
});

test("render identity includes presentation, styles, and media replacement inputs", () => {
  const baseline = getRenderProjectionIdentity(payload());
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity(payload({
      presentation: { revision: "r2", activationEpoch: 10 },
    })),
  );
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity(payload({
      layout: {
        ...payload().layout,
        zones: [{ id: "another-row", type: "html", textContent: "Changed" }],
      },
    })),
  );
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity(payload({
      media: [{ ...payload().media[0], originalPath: "/uploads/replaced.png", updatedAt: "2024-02-01T00:00:00.000Z" }],
    })),
  );
});

test("unused media and profile metadata do not invalidate render identity", () => {
  const baseline = getRenderProjectionIdentity(payload());
  assert.equal(
    baseline,
    getRenderProjectionIdentity(payload({
      profile: {
        ...payload().profile,
        id: "another-profile",
        orientation: "portrait",
        refreshRate: 144,
        safePadding: { top: 99 },
      },
      media: [{
        ...payload().media[0],
        name: "renamed in library",
        fileSize: 123456,
        checksum: "different",
        tags: ["operational-tag"],
        width: 100,
        height: 200,
        duration: 999,
      }],
    })),
  );
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity(payload({
      profile: { ...payload().profile, width: 1080 },
    })),
  );
});

test("presentation identity is bounded and does not retain raw operational objects", () => {
  const longRevision = "r".repeat(128);
  const baseline = getRenderProjectionIdentity(payload({
    presentation: {
      revision: `${longRevision}-operational-tail`,
      activationEpoch: 10,
      process: { pid: 1, updatedAt: "volatile" },
    },
  }));
  assert.equal(
    baseline,
    getRenderProjectionIdentity(payload({
      presentation: {
        revision: `${longRevision}-different-tail`,
        activationEpoch: 10,
        process: { pid: 2 },
      },
    })),
  );
  assert.equal(
    getRenderProjectionIdentity(payload({
      presentation: { revision: { value: "r1" }, activationEpoch: "10" },
    })),
    getRenderProjectionIdentity(payload({
      presentation: { revision: null, activationEpoch: -1 },
    })),
  );
});

test("layout and playlist rotation preserve metadata but invalidate visual changes", () => {
  const base = payload({
    layout: {
      ...payload().layout,
      name: "Morning",
      version: 1,
      profileOverrides: { noisy: true },
      zones: [{
        id: "zone",
        name: "Playlist",
        type: "media_player",
        x: 0, y: 0, width: 100, height: 100,
        mediaPlayerItems: [{ id: "item", mediaAssetId: "asset", duration: 5 }],
      }],
    },
    zoneSources: [{ zoneId: "zone", type: "playlist", playlistId: "p1", updatedAt: "old" }],
    playlistItems: {
      p1: [{ id: "item", order: 1, mediaAssetId: "asset", duration: 5, updatedAt: "old" }],
    },
  });
  const baseline = getRenderProjectionIdentity(base);
  assert.equal(
    baseline,
    getRenderProjectionIdentity({
      ...base,
      layout: { ...base.layout, id: "new", updatedAt: "new", name: "Evening", version: 2 },
      zoneSources: [{ ...base.zoneSources[0], updatedAt: "new" }],
      playlistItems: { p1: [{ ...base.playlistItems.p1[0], updatedAt: "new" }] },
    }),
  );
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity({
      ...base,
      playlistItems: { p1: [{ ...base.playlistItems.p1[0], order: 2 }] },
    }),
  );
});

test("playlist item identity survives projection while volatile metadata remains ignored", () => {
  const base = payload({
    playlistItems: {
      rotation: [{
        id: "item-a",
        order: 1,
        mediaAssetId: "asset",
        duration: 5,
        updatedAt: "old",
        createdAt: "old",
      }],
    },
  });
  const projection = buildRenderProjection(base) as {
    playlistItems: Record<string, Array<Record<string, unknown>>>;
  };
  assert.deepEqual(projection.playlistItems.rotation, [{
    id: "item-a",
    order: 1,
    mediaAssetId: "asset",
    duration: 5,
  }]);

  const baseline = getRenderProjectionIdentity(base);
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity({
      ...base,
      playlistItems: {
        rotation: [{ ...base.playlistItems.rotation[0], id: "item-b" }],
      },
    }),
  );
  assert.equal(
    baseline,
    getRenderProjectionIdentity({
      ...base,
      playlistItems: {
        rotation: [{
          ...base.playlistItems.rotation[0],
          updatedAt: "new",
          createdAt: "new",
          lastSeen: "new",
          videoStatsUpdatedAt: "new",
        }],
      },
    }),
  );
});

test("fallback, live override, Agenda, weather, and player variables each invalidate", () => {
  const fallback = payload({
    layout: null,
    liveOverride: { id: "override", name: "Emergency", createdAt: "old", priority: 1 },
    playerVars: { screenName: "Lobby", weatherSummary: "Sunny", ignored: "metadata" },
  });
  const baseline = getRenderProjectionIdentity(fallback);
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity({
      ...fallback,
      screen: { ...fallback.screen, hideNoContentMessage: true },
    }),
  );
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity({
      ...fallback,
      liveOverride: { ...fallback.liveOverride, name: "Evacuate" },
    }),
  );
  assert.notEqual(
    baseline,
    getRenderProjectionIdentity({
      ...fallback,
      playerVars: { ...fallback.playerVars, weatherSummary: "Rain" },
    }),
  );

  const agenda = payload({
    layout: {
      ...payload().layout,
      zones: [{
        id: "agenda",
        name: "Agenda",
        type: "agenda",
        x: 0, y: 0, width: 100, height: 100,
        agendaConfigId: "agenda-1",
      }],
    },
    fonts: [{
      id: "font", familyId: "family", name: "Inter", weight: 400,
      style: "normal", format: "woff2", createdAt: "old",
    }],
  });
  const agendaIdentity = getRenderProjectionIdentity(agenda);
  assert.notEqual(
    agendaIdentity,
    getRenderProjectionIdentity({
      ...agenda,
      layout: {
        ...agenda.layout,
        zones: [{ ...agenda.layout.zones[0], agendaConfigId: "agenda-2" }],
      },
    }),
  );
  assert.notEqual(
    agendaIdentity,
    getRenderProjectionIdentity({
      ...agenda,
      fonts: [{ ...agenda.fonts[0], weight: 700 }],
    }),
  );

  const weather = payload({
    layout: {
      ...payload().layout,
      zones: [{
        id: "weather",
        name: "Weather",
        type: "weather",
        x: 0, y: 0, width: 100, height: 100,
        weatherLat: 51.5, weatherLng: -0.1, weatherUnit: "celsius",
        weatherLocation: "London",
      }],
    },
  });
  assert.notEqual(
    getRenderProjectionIdentity(weather),
    getRenderProjectionIdentity({
      ...weather,
      layout: {
        ...weather.layout,
        zones: [{ ...weather.layout.zones[0], weatherUnit: "fahrenheit" }],
      },
    }),
  );
});

test("test-pattern and canvas geometry branches invalidate render inputs", () => {
  const patterned = payload({
    screen: { ...payload().screen, testPatternEnabled: true },
  });
  assert.notEqual(
    getRenderProjectionIdentity(patterned),
    getRenderProjectionIdentity({
      ...patterned,
      screen: { ...patterned.screen, testPatternEnabled: false },
    }),
  );
  const canvas = payload({
    screen: {
      ...payload().screen,
      canvasEnabled: true,
      canvasWidth: 3840,
      canvasHeight: 1080,
      canvasX: 1920,
      canvasY: 0,
    },
  });
  assert.notEqual(
    getRenderProjectionIdentity(canvas),
    getRenderProjectionIdentity({
      ...canvas,
      screen: { ...canvas.screen, canvasX: 0 },
    }),
  );
});

test("projection is deterministic and does not retain source object identity", () => {
  const source = payload();
  const projection = buildRenderProjection(source);
  assert.notEqual(projection, source);
  assert.equal(getRenderProjectionIdentity(source), getRenderProjectionIdentity(JSON.parse(JSON.stringify(source))));
});

test("canvas tile rename invalidates no-content/template-variable identity", () => {
  const canvas = {
    width: 3840,
    height: 1080,
    tiles: [{
      screenId: "tile-row",
      name: "Lobby Left",
      x: 0, y: 0, width: 1920, height: 1080,
      layout: null,
      profile: { width: 1920, height: 1080 },
      zoneSources: [],
      liveOverride: null,
    }],
  };
  const base = payload({
    canvas,
    // No layout/zones: the tile's screen name is still template context.
    layout: null,
    playerVars: { screenName: "Lobby Left" },
  });
  const renamed = {
    ...base,
    canvas: {
      ...canvas,
      tiles: [{ ...canvas.tiles[0], name: "Lobby Right" }],
    },
  };
  assert.notEqual(
    getRenderProjectionIdentity(base),
    getRenderProjectionIdentity(renamed),
  );
});

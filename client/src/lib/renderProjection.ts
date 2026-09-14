/**
 * Deterministic, render-only content identity.
 *
 * Content endpoints deliberately contain volatile transport fields (clock
 * samples, commands, heartbeat/health data and server/database metadata).
 * Those fields must not cause a new React render subtree or reset playback.
 * This projection is explicit at the payload boundary and recursively
 * canonicalises the render-bearing objects that are allowed through.
 */

const OMITTED_METADATA = new Set([
  "createdAt", "updatedAt", "lastSeen", "lastScreenshotAt",
  "videoStatsStalls", "videoStatsRecoveries", "videoStatsReloads",
  "videoStatsLastReloadAt", "videoStatsLastRecoveryAt", "videoStatsUpdatedAt",
  "ipAddress", "hostname", "hardwareClass", "deviceToken", "pairingCode",
  "kioskModeEnabled", "isPaired", "isOnline", "locked",
]);

const RENDER_ZONE_KEYS = [
  "type", "x", "y", "width", "height", "zIndex", "scaleMode",
  "mediaId", "backgroundColor", "backgroundImage", "backgroundVideo",
  "gradientEnabled", "gradientDirection", "gradientEndColor",
  "backgroundOpacity", "textColor", "textShadowEnabled", "textShadowBlur",
  "textShadowColor", "textOutlineWidth", "textOutlineColor", "borderColor",
  "borderWidth", "borderRadius", "clockTimezone", "clockLabel", "clockStyle",
  "clockMarkerStyle", "clockShowSecondHand", "clockShowHourMarkers",
  "clockShowDate", "clockHandColor", "clockFaceColor", "clockMarkerColor",
  "clockTimeFontSize", "clockLabelFontSize", "clockDateFontSize",
  "weatherLocation", "weatherLat", "weatherLng", "weatherUnit",
  "weatherFontSize", "weatherDisplayMode", "newsRssUrl", "newsScrollSpeed",
  "newsItemCount", "newsTextSize", "textContent", "fontFamily", "htmlCss",
  "textFontSize", "tickerScrollSpeed", "tickerAnimation", "tickerFontSize",
  "textAlign", "textVerticalAlign", "shaderPreset", "shaderCode",
  "shaderSpeed", "shaderVariable", "shaderColor1", "shaderColor2",
  "montageMediaIds", "montageDuration", "montageTransition",
  "montageTransitionDuration", "montageFitMode", "montageKenBurns",
  "montageKenBurnsIntensity", "montageShuffle", "montageAutoPlay",
  "qrContentType", "qrContent", "qrForegroundColor", "qrBackgroundColor",
  "qrTransparentBackground", "qrErrorCorrection", "qrLabel",
  "qrLabelPosition", "qrLabelFontSize", "qrLabelColor", "qrWifiSsid",
  "qrWifiPassword", "qrWifiEncryption", "qrLocationName", "qrLocationLat",
  "qrLocationLng", "qrVcardName", "qrVcardPhone", "qrVcardEmail",
  "qrVcardOrg", "countdownTargetDate", "countdownTitle",
  "countdownCompletionMessage", "countdownShowDays", "countdownShowHours",
  "countdownShowMinutes", "countdownShowSeconds", "countdownDayLabel",
  "countdownHourLabel", "countdownMinuteLabel", "countdownSecondLabel",
  "countdownSeparator", "countdownShowLeadingZeros", "countdownNumberColor",
  "countdownLabelColor", "countdownSize", "countdownTitleSize",
  "countdownLabelSize", "countdownFontFamily", "countdownUnitGap",
  "countdownTimezone", "countdownCompact", "shapeType", "shapeFillColor",
  "shapeFillEnabled", "shapeStrokeColor", "shapeStrokeWidth",
  "shapeStrokeStyle", "shapeRotation", "shapeCornerRadius", "shapeOpacity",
  "shapeLineDirection", "shapeArchSpan", "shapeAlignment", "shapeIcon",
  "shapeIconColor", "shapeIconText", "shapeIconTextPosition",
  "shapeIconTextSize", "shapeIconTextColor", "mediaPlayerItems",
  "mediaPlayerTransition", "mediaPlayerTransitionDuration", "mediaPlayerLoop",
  "mediaPlayerFitMode", "mediaPlayerAutoPlay", "mediaPlayerMuted",
  "mediaPlayerShuffle", "footballLeague", "footballSeason",
  "footballRefreshInterval", "footballFontSize", "footballShowBadges",
  "footballCompactMode", "footballBadgeFormat", "plFixturesDaysAhead",
  "plFixturesRefreshInterval", "plFixturesFontSize", "plFixturesShowBadges",
  "plFixturesShowVenue", "plFixturesCompactMode", "plFixturesShowCompleted",
  "plFixturesDisplayMode", "plFixturesItemsPerPage", "plFixturesPageDuration",
  "plFixturesLimit", "heathrowTerminal", "heathrowAirline",
  "heathrowRefreshInterval", "heathrowFontSize", "heathrowShowFilters",
  "heathrowColumns", "forecastDays", "forecastRefreshInterval",
  "forecastFontSize", "forecastShowHourly", "forecastShowCondition",
  "forecastShowSunrise", "forecastShowHumidity", "forecastShowHourlyCondition",
  "spacexRefreshInterval", "spacexFontSize", "spacexShowDetails",
  "spacexShowPatch", "spacexShowLinks", "spacexShowLaunchpad",
  "earthquakeFeed", "earthquakeMinMagnitude", "earthquakeLimit",
  "earthquakeRefreshInterval", "earthquakeFontSize", "earthquakeShowDepth",
  "earthquakeShowTsunami", "earthquakeShowAlert", "earthquakeDisplayMode",
  "earthquakeScrollSpeed", "earthquakeItemsPerPage", "earthquakePageDuration",
  "aircraftRefreshInterval", "aircraftFontSize", "aircraftBoundsLamin",
  "aircraftBoundsLomin", "aircraftBoundsLamax", "aircraftBoundsLomax",
  "aircraftLimit", "aircraftShowCallsign", "aircraftShowAltitude",
  "aircraftShowSpeed", "aircraftShowHeading", "aircraftShowCountry",
  "aircraftDisplayMode", "aircraftShowSweep", "aircraftScrollSpeed",
  "aircraftItemsPerPage", "aircraftPageDuration", "youtubeUrl", "youtubeMute",
  "webrtcSignallingUrl", "webrtcStreamKey", "webrtcMute", "scheduleViewMode",
  "scheduleEntries", "scheduleShowCurrentTime", "scheduleTimeFormat",
  "scheduleStartHour", "scheduleEndHour", "scheduleHeaderText",
  "agendaConfigId", "sweepstakeConfigId", "heathrowPageInterval",
] as const;

function canonical(value: unknown, omit = OMITTED_METADATA): unknown {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => canonical(entry, omit));
  }
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (omit.has(key)) continue;
    const next = canonical(source[key], omit);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function renderObject(value: unknown): unknown {
  return canonical(value);
}

function renderPresentation(presentation: unknown): unknown {
  const source = presentation && typeof presentation === "object"
    ? presentation as Record<string, unknown>
    : {};
  // Presentation metadata is a small cache/rotation token, not a pass-through
  // payload. In particular, never let a malformed object or an unbounded
  // server value smuggle operational state into the render identity.
  const revision = typeof source.revision === "string"
    ? source.revision.slice(0, 128)
    : null;
  const activationEpoch = Number.isSafeInteger(source.activationEpoch) &&
    Number(source.activationEpoch) >= 0
    ? Number(source.activationEpoch)
    : 0;
  return { revision, activationEpoch };
}

function renderScreen(screen: unknown): unknown {
  if (!screen || typeof screen !== "object") return screen ?? null;
  const source = screen as Record<string, unknown>;
  return canonical({
    name: source.name,
    location: source.location,
    timezone: source.timezone,
    testPatternEnabled: source.testPatternEnabled,
    hideNoContentMessage: source.hideNoContentMessage,
    showLiveBanner: source.showLiveBanner,
    canvasEnabled: source.canvasEnabled,
    canvasWidth: source.canvasWidth,
    canvasHeight: source.canvasHeight,
    canvasX: source.canvasX,
    canvasY: source.canvasY,
  }, new Set());
}

function renderProfile(profile: unknown): unknown {
  if (!profile || typeof profile !== "object") return profile ?? null;
  const source = profile as Record<string, unknown>;
  return canonical({ width: source.width, height: source.height }, new Set());
}

function renderLayout(layout: unknown): unknown {
  if (!layout || typeof layout !== "object") return layout ?? null;
  const source = layout as Record<string, unknown>;
  return canonical({
    aspectRatio: source.aspectRatio,
    customWidth: source.customWidth,
    customHeight: source.customHeight,
    zones: renderZones(source.zones),
  }, new Set());
}

function renderMedia(media: unknown): unknown {
  if (!Array.isArray(media)) return [];
  // originalPath and updatedAt are intentionally retained: replacing a file
  // can retain its row id, and ZoneRenderer uses both to select/cache it.
  return media
    .map((asset) => {
      if (!asset || typeof asset !== "object") return asset;
      const source = asset as Record<string, unknown>;
      return canonical({
        id: source.id,
        originalPath: source.originalPath,
        mediaType: source.mediaType,
        mimeType: source.mimeType,
        updatedAt: source.updatedAt,
      }, new Set());
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function renderFonts(fonts: unknown): unknown {
  if (!Array.isArray(fonts)) return [];
  return fonts.map((font) => {
    if (!font || typeof font !== "object") return font;
    const source = font as Record<string, unknown>;
    return canonical({
      id: source.id, familyId: source.familyId,
      weight: source.weight, style: source.style, format: source.format,
    }, new Set());
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function renderEvent(event: unknown): unknown {
  if (!event || typeof event !== "object") return event ?? null;
  const source = event as Record<string, unknown>;
  return canonical({
    name: source.name,
  }, new Set());
}

function renderClient(client: unknown): unknown {
  if (!client || typeof client !== "object") return client ?? null;
  const source = client as Record<string, unknown>;
  return canonical({
    name: source.name,
  }, new Set());
}

function renderOverride(override: unknown): unknown {
  if (!override || typeof override !== "object") return override ?? null;
  const source = override as Record<string, unknown>;
  return canonical({
    name: source.name,
  }, new Set());
}

function renderZone(zone: unknown): unknown {
  if (!zone || typeof zone !== "object") return zone;
  const source = zone as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of RENDER_ZONE_KEYS) {
    if (key === "mediaPlayerItems" && Array.isArray(source[key])) {
      result[key] = source[key].map((item) => {
        if (!item || typeof item !== "object") return item;
        const value = item as Record<string, unknown>;
        return { mediaAssetId: value.mediaAssetId, duration: value.duration };
      });
    } else if (key === "scheduleEntries" && Array.isArray(source[key])) {
      result[key] = source[key].map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const value = entry as Record<string, unknown>;
        return {
          title: value.title, startTime: value.startTime, endTime: value.endTime,
          day: value.day, color: value.color, room: value.room,
        };
      });
    } else {
      result[key] = source[key];
    }
  }
  return canonical(result, new Set());
}

function renderZones(zones: unknown): unknown {
  return Array.isArray(zones) ? zones.map(renderZone) : [];
}

function renderZoneSources(zoneSources: unknown): unknown {
  if (!Array.isArray(zoneSources)) return [];
  return zoneSources.map((source) => {
    if (!source || typeof source !== "object") return source;
    const value = source as Record<string, unknown>;
    return canonical({
      zoneId: value.zoneId,
      type: value.type,
      playlistId: value.playlistId,
      agendaConfigId: value.agendaConfigId,
      mediaAssetIds: value.mediaAssetIds,
    }, new Set());
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function renderPlaylistItems(playlistItems: unknown): unknown {
  if (!playlistItems || typeof playlistItems !== "object") return {};
  return Object.fromEntries(Object.entries(playlistItems as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([playlistId, items]) => [
      playlistId,
      Array.isArray(items) ? items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const value = item as Record<string, unknown>;
        return canonical({
          id: value.id,
          order: value.order,
          mediaAssetId: value.mediaAssetId,
          layoutTemplateId: value.layoutTemplateId,
          duration: value.duration,
        }, new Set());
      }) : [],
    ]));
}

function renderPlayerVars(playerVars: unknown): unknown {
  if (!playerVars || typeof playerVars !== "object") return playerVars ?? null;
  const source = playerVars as Record<string, unknown>;
  return canonical({
    screenName: source.screenName,
    roomName: source.roomName,
    eventName: source.eventName,
    clientName: source.clientName,
    roomCapacity: source.roomCapacity,
    eventStartDate: source.eventStartDate,
    eventEndDate: source.eventEndDate,
    nextSessionTitle: source.nextSessionTitle,
    nextSessionTime: source.nextSessionTime,
    nextSessionCountdown: source.nextSessionCountdown,
    weatherSummary: source.weatherSummary,
  }, new Set());
}

function renderCanvas(canvas: unknown): unknown {
  if (!canvas || typeof canvas !== "object") return canvas ?? null;
  const source = canvas as Record<string, unknown>;
  const tiles = Array.isArray(source.tiles) ? source.tiles.map((tile) => {
    if (!tile || typeof tile !== "object") return tile;
    const value = tile as Record<string, unknown>;
    return {
      // screenId is a database identity, while geometry and resolved content
      // determine the actual pixels in a canvas composite. The tile name is
      // also render-bearing: it is the fallback screen context used by
      // no-content/template-variable rendering.
      x: value.x, y: value.y, width: value.width, height: value.height,
      name: value.name,
      profile: renderProfile(value.profile),
      layout: renderLayout(value.layout),
      zoneSources: renderZoneSources(value.zoneSources),
      liveOverride: renderOverride(value.liveOverride),
    };
  }).sort((a, b) => {
    const left = a && typeof a === "object" ? a as Record<string, unknown> : {};
    const right = b && typeof b === "object" ? b as Record<string, unknown> : {};
    return Number(left.x ?? 0) - Number(right.x ?? 0) ||
      Number(left.y ?? 0) - Number(right.y ?? 0) ||
      Number(left.width ?? 0) - Number(right.width ?? 0) ||
      Number(left.height ?? 0) - Number(right.height ?? 0) ||
      String(left.name ?? "").localeCompare(String(right.name ?? ""));
  }) : [];
  return canonical({
    width: source.width,
    height: source.height,
    tiles,
  });
}

export interface RenderProjectionPayload {
  presentation?: unknown;
  screen?: unknown;
  profile?: unknown;
  layout?: unknown;
  media?: unknown;
  fonts?: unknown;
  playlists?: unknown;
  playlistItems?: unknown;
  layoutTemplates?: unknown;
  zoneSources?: unknown;
  styles?: unknown;
  liveOverride?: unknown;
  activeOverrides?: unknown;
  event?: unknown;
  client?: unknown;
  playerVars?: unknown;
  canvas?: unknown;
}

export function buildRenderProjection(payload: RenderProjectionPayload | null | undefined): unknown {
  if (!payload) return null;
  return {
    presentation: renderPresentation(payload.presentation),
    screen: renderScreen(payload.screen),
    profile: renderProfile(payload.profile),
    layout: renderLayout(payload.layout),
    // Keep replacement/version fields but exclude transport and DB metadata.
    media: renderMedia(payload.media),
    fonts: renderFonts(payload.fonts),
    // Playlist row names/metadata are not consumed by either host. Rotation
    // is represented by zoneSources and the item fields below.
    playlistItems: renderPlaylistItems(payload.playlistItems),
    layoutTemplates: renderObject(
      payload.layoutTemplates && typeof payload.layoutTemplates === "object"
        ? Object.fromEntries(Object.entries(payload.layoutTemplates as Record<string, unknown>)
          .map(([key, value]) => [key, renderLayout(value)]))
        : payload.layoutTemplates,
    ),
    zoneSources: renderZoneSources(payload.zoneSources),
    liveOverride: renderOverride(payload.liveOverride),
    event: renderEvent(payload.event),
    client: renderClient(payload.client),
    playerVars: renderPlayerVars(payload.playerVars),
    canvas: renderCanvas(payload.canvas),
  };
}

/** Stable JSON identity; object key ordering is independent of poll order. */
export function getRenderProjectionIdentity(
  payload: RenderProjectionPayload | null | undefined,
): string {
  return JSON.stringify(buildRenderProjection(payload));
}

export const buildContentRenderProjection = buildRenderProjection;
export const getContentRenderIdentity = getRenderProjectionIdentity;
export const getRenderProjectionFingerprint = getRenderProjectionIdentity;

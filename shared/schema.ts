import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// ============ ENUMS ============

export const userRoleEnum = pgEnum("user_role", ["admin", "account_manager", "site_user"]);
export const screenTypeEnum = pgEnum("screen_type", ["standard", "led_wall"]);
export const orientationEnum = pgEnum("orientation", ["landscape", "portrait"]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video", "gif"]);
export const programmeStatusEnum = pgEnum("programme_status", ["draft", "published"]);
export const zoneTypeEnum = pgEnum("zone_type", ["media", "ticker", "clock", "logo", "html", "weather", "news", "montage", "qrcode", "countdown", "shape", "schedule", "media_player", "football_table", "premier_league_fixtures", "heathrow_arrivals", "heathrow_departures", "weather_forecast", "spacex_launch", "earthquakes", "aircraft_radar", "youtube_live", "webrtc_stream"]);
export const scaleModeEnum = pgEnum("scale_mode", ["contain", "cover"]);

// ============ CLIENTS ============

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  locked: boolean("locked").default(false),
  maxUploadSizeMb: integer("max_upload_size_mb").default(100),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clientsRelations = relations(clients, ({ many }) => ({
  events: many(events),
}));

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ============ EVENTS ============

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  colorPalette: jsonb("color_palette").$type<Array<{ name: string; color: string }>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const eventsRelations = relations(events, ({ one, many }) => ({
  client: one(clients, { fields: [events.clientId], references: [clients.id] }),
  brandPack: many(brandPacks),
  programmes: many(programmes),
  mediaAssets: many(mediaAssets),
  layoutTemplates: many(layoutTemplates),
}));

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ============ BRAND PACKS ============

export const brandPacks = pgTable("brand_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").default(1),
  primaryColor: text("primary_color").default("#3B82F6"),
  secondaryColor: text("secondary_color").default("#10B981"),
  accentColor: text("accent_color").default("#F59E0B"),
  backgroundColor: text("background_color").default("#1F2937"),
  textColor: text("text_color").default("#FFFFFF"),
  fontPrimary: text("font_primary").default("Inter"),
  fontSecondary: text("font_secondary").default("Inter"),
  logoLightUrl: text("logo_light_url"),
  logoDarkUrl: text("logo_dark_url"),
  defaultBackgroundUrl: text("default_background_url"),
  standbyConfig: jsonb("standby_config"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const brandPacksRelations = relations(brandPacks, ({ one }) => ({
  event: one(events, { fields: [brandPacks.eventId], references: [events.id] }),
}));

export const insertBrandPackSchema = createInsertSchema(brandPacks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrandPack = z.infer<typeof insertBrandPackSchema>;
export type BrandPack = typeof brandPacks.$inferSelect;

// ============ DISPLAY PROFILES ============

export const displayProfiles = pgTable("display_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  width: integer("width").notNull().default(1920),
  height: integer("height").notNull().default(1080),
  orientation: orientationEnum("orientation").default("landscape"),
  safePadding: integer("safe_padding").default(0),
  screenType: screenTypeEnum("screen_type").default("standard"),
  refreshRate: integer("refresh_rate").default(60),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDisplayProfileSchema = createInsertSchema(displayProfiles).omit({ id: true, createdAt: true });
export type InsertDisplayProfile = z.infer<typeof insertDisplayProfileSchema>;
export type DisplayProfile = typeof displayProfiles.$inferSelect;

// ============ SCREEN GROUPS ============

export const screenGroups = pgTable("screen_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScreenGroupSchema = createInsertSchema(screenGroups).omit({ id: true, createdAt: true });
export type InsertScreenGroup = z.infer<typeof insertScreenGroupSchema>;
export type ScreenGroup = typeof screenGroups.$inferSelect;

// ============ SCREENS ============

export const screens = pgTable("screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id),
  name: text("name").notNull(),
  location: text("location"),
  displayProfileId: varchar("display_profile_id").references(() => displayProfiles.id),
  pairingCode: varchar("pairing_code", { length: 6 }),
  deviceToken: text("device_token"),
  isPaired: boolean("is_paired").default(false),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen"),
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  hardwareClass: text("hardware_class"),
  currentEventId: varchar("current_event_id").references(() => events.id),
  fallbackLayoutId: varchar("fallback_layout_id").references(() => layoutTemplates.id, { onDelete: "set null" }),
  fallbackPlaylistId: varchar("fallback_playlist_id").references(() => playlists.id, { onDelete: "set null" }),
  canvasEnabled: boolean("canvas_enabled").default(false),
  canvasWidth: integer("canvas_width"),
  canvasHeight: integer("canvas_height"),
  canvasX: integer("canvas_x").default(0),
  canvasY: integer("canvas_y").default(0),
  locked: boolean("locked").default(false),
  screenshotEnabled: boolean("screenshot_enabled").default(false),
  lastScreenshot: text("last_screenshot"),
  lastScreenshotAt: timestamp("last_screenshot_at"),
  testPatternEnabled: boolean("test_pattern_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const screensRelations = relations(screens, ({ one, many }) => ({
  client: one(clients, { fields: [screens.clientId], references: [clients.id] }),
  displayProfile: one(displayProfiles, { fields: [screens.displayProfileId], references: [displayProfiles.id] }),
  currentEvent: one(events, { fields: [screens.currentEventId], references: [events.id] }),
  fallbackLayout: one(layoutTemplates, { fields: [screens.fallbackLayoutId], references: [layoutTemplates.id] }),
  fallbackPlaylist: one(playlists, { fields: [screens.fallbackPlaylistId], references: [playlists.id] }),
  groupMemberships: many(screenGroupMemberships),
  heartbeats: many(playerHeartbeats),
}));

export const insertScreenSchema = createInsertSchema(screens).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScreen = z.infer<typeof insertScreenSchema>;
export type Screen = typeof screens.$inferSelect;

// ============ SCREEN GROUP MEMBERSHIPS ============

export const screenGroupMemberships = pgTable("screen_group_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").notNull().references(() => screenGroups.id, { onDelete: "cascade" }),
});

export const screenGroupMembershipsRelations = relations(screenGroupMemberships, ({ one }) => ({
  screen: one(screens, { fields: [screenGroupMemberships.screenId], references: [screens.id] }),
  group: one(screenGroups, { fields: [screenGroupMemberships.groupId], references: [screenGroups.id] }),
}));

// ============ MEDIA ASSETS ============

export const mediaAssets = pgTable("media_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  originalPath: text("original_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  mediaType: mediaTypeEnum("media_type").notNull(),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"),
  fileSize: integer("file_size"),
  checksum: text("checksum"),
  tags: text("tags").array(),
  displayMode: scaleModeEnum("display_mode").default("cover"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  client: one(clients, { fields: [mediaAssets.clientId], references: [clients.id] }),
  event: one(events, { fields: [mediaAssets.eventId], references: [events.id] }),
  shares: many(mediaShares),
}));

export const insertMediaAssetSchema = createInsertSchema(mediaAssets).omit({ id: true, createdAt: true });
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;
export type MediaAsset = typeof mediaAssets.$inferSelect;

// ============ MEDIA SHARES ============

export const mediaShares = pgTable("media_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaAssetId: varchar("media_asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  sharedAt: timestamp("shared_at").defaultNow(),
});

export const mediaSharesRelations = relations(mediaShares, ({ one }) => ({
  mediaAsset: one(mediaAssets, { fields: [mediaShares.mediaAssetId], references: [mediaAssets.id] }),
  client: one(clients, { fields: [mediaShares.clientId], references: [clients.id] }),
}));

export const insertMediaShareSchema = createInsertSchema(mediaShares).omit({ id: true, sharedAt: true });
export type InsertMediaShare = z.infer<typeof insertMediaShareSchema>;
export type MediaShare = typeof mediaShares.$inferSelect;

// ============ LAYOUT TEMPLATES ============

export const layoutTemplates = pgTable("layout_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").default(1),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
  customWidth: integer("custom_width"),
  customHeight: integer("custom_height"),
  zones: jsonb("zones").notNull().$type<LayoutZone[]>(),
  profileOverrides: jsonb("profile_overrides"),
  locked: boolean("locked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const layoutTemplatesRelations = relations(layoutTemplates, ({ one }) => ({
  client: one(clients, { fields: [layoutTemplates.clientId], references: [clients.id] }),
  event: one(events, { fields: [layoutTemplates.eventId], references: [events.id] }),
}));

export const insertLayoutTemplateSchema = createInsertSchema(layoutTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLayoutTemplate = z.infer<typeof insertLayoutTemplateSchema>;
export type LayoutTemplate = typeof layoutTemplates.$inferSelect;

// Zone type definitions
export interface LayoutZone {
  id: string;
  name: string;
  type: "media" | "ticker" | "clock" | "logo" | "html" | "weather" | "news" | "text" | "shader" | "montage" | "qrcode" | "countdown" | "shape" | "schedule" | "media_player" | "football_table" | "premier_league_fixtures" | "heathrow_arrivals" | "heathrow_departures" | "weather_forecast" | "spacex_launch" | "earthquakes" | "aircraft_radar" | "youtube_live" | "webrtc_stream";
  x: number;
  y: number;
  width: number;
  height: number;
  scaleMode?: "contain" | "cover";
  zIndex?: number;
  // Media zone configuration
  mediaId?: string;  // ID of the assigned media asset
  // Zone styling options
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  // Gradient background options
  gradientEnabled?: boolean;
  gradientDirection?: "to-t" | "to-b" | "to-l" | "to-r" | "to-tl" | "to-tr" | "to-bl" | "to-br";
  gradientEndColor?: string;
  // Background opacity (0-100)
  backgroundOpacity?: number;
  // Text styling
  textColor?: string;
  textShadowEnabled?: boolean;
  textShadowBlur?: number;
  textShadowColor?: string;
  textOutlineWidth?: number;
  textOutlineColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  // Clock widget configuration
  clockTimezone?: string;  // IANA timezone e.g., "America/New_York", "Europe/London"
  clockLabel?: string;     // Optional label e.g., "New York", "London"
  clockStyle?: "digital" | "analog";  // Clock face style
  clockMarkerStyle?: "numbers" | "roman" | "dots" | "lines";  // Marker style for analog
  clockShowSecondHand?: boolean;     // Show second hand on analog (default true)
  clockShowHourMarkers?: boolean;    // Show hour markers (default true)
  clockShowDate?: boolean;           // Show date display (default false)
  clockHandColor?: string;           // Color for clock hands (hex)
  clockFaceColor?: string;           // Background color of clock face (hex)
  clockMarkerColor?: string;         // Color for hour markers (hex)
  clockTimeFontSize?: number;        // Font size for time display in px (digital clock)
  clockLabelFontSize?: number;       // Font size for label text in px
  clockDateFontSize?: number;        // Font size for date display in px
  // Weather widget configuration
  weatherLocation?: string;
  weatherLat?: number;
  weatherLng?: number;
  weatherUnit?: "celsius" | "fahrenheit";
  weatherFontSize?: number;  // Font size in pixels for weather display (default 24)
  weatherDisplayMode?: "full" | "icon_only" | "text_only";
  // News widget configuration
  newsRssUrl?: string;
  newsScrollSpeed?: number;
  newsItemCount?: number;
  newsTextSize?: number;
  // Text widget configuration
  textContent?: string;
  textFontSize?: number | "small" | "medium" | "large" | "xlarge";  // Font size in pixels (default 24), legacy enum values converted to numeric
  // Ticker widget configuration
  tickerScrollSpeed?: number;  // Duration in seconds for one complete scroll cycle
  tickerAnimation?: "scroll-left" | "scroll-up" | "typewriter" | "fade" | "slide-in";
  tickerFontSize?: number;  // Font size in pixels (default 24)
  textAlign?: "left" | "center" | "right";
  textVerticalAlign?: "top" | "middle" | "bottom";
  // Shader widget configuration
  shaderPreset?: "gradient" | "plasma" | "waves" | "noise" | "aurora" | "custom";
  shaderCode?: string;
  shaderSpeed?: number;
  shaderVariable?: number;  // Custom variable (u_variable) exposed to shader code (0-1 range)
  shaderColor1?: string;    // Primary color for shader (hex, e.g., "#ff0000")
  shaderColor2?: string;    // Secondary color for shader (hex, e.g., "#0000ff")
  // Montage widget configuration
  montageMediaIds?: string[];  // Array of media asset IDs
  montageDuration?: number;    // Duration per image in seconds (default 5)
  montageTransition?: "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom-in" | "zoom-out" | "none";
  montageTransitionDuration?: number; // Transition duration in ms (default 1000)
  montageFitMode?: "contain" | "cover";  // How images fit in the zone
  montageKenBurns?: boolean;   // Enable Ken Burns effect
  montageKenBurnsIntensity?: number;  // Ken Burns zoom intensity (1-20, default 10)
  montageShuffle?: boolean;    // Randomize photo order
  montageAutoPlay?: boolean;   // Auto-start slideshow (default true)
  // QR Code widget configuration
  qrContentType?: "url" | "email" | "phone" | "location" | "text" | "wifi" | "vcard";
  qrContent?: string;          // The content/value to encode
  qrForegroundColor?: string;  // QR code foreground color (default #000000)
  qrBackgroundColor?: string;  // QR code background color (default #ffffff)
  qrTransparentBackground?: boolean;  // Use transparent background instead of qrBackgroundColor
  qrErrorCorrection?: "L" | "M" | "Q" | "H";  // Error correction level (default M)
  qrLabel?: string;           // Optional label text to display with QR code
  qrLabelPosition?: "above" | "below";  // Label position relative to QR code
  qrLabelFontSize?: number | "small" | "medium" | "large";  // Label font size in pixels (default 16), legacy enum values converted to numeric
  qrLabelColor?: string;      // Label text color
  // WiFi-specific (used when qrContentType is "wifi")
  qrWifiSsid?: string;
  qrWifiPassword?: string;
  qrWifiEncryption?: "WPA" | "WEP" | "nopass";
  // Location-specific (used when qrContentType is "location")
  qrLocationName?: string;
  qrLocationLat?: number;
  qrLocationLng?: number;
  // vCard-specific (used when qrContentType is "vcard")
  qrVcardName?: string;
  qrVcardPhone?: string;
  qrVcardEmail?: string;
  qrVcardOrg?: string;
  // Countdown timer widget configuration
  countdownTargetDate?: string;         // ISO date string for target date/time
  countdownTitle?: string;              // Optional title/event name above timer
  countdownCompletionMessage?: string;  // Message to show when countdown reaches zero
  countdownShowDays?: boolean;          // Show days unit (default true)
  countdownShowHours?: boolean;         // Show hours unit (default true)
  countdownShowMinutes?: boolean;       // Show minutes unit (default true)
  countdownShowSeconds?: boolean;       // Show seconds unit (default true)
  countdownDayLabel?: string;           // Custom label for days (default "Days")
  countdownHourLabel?: string;          // Custom label for hours (default "Hours")
  countdownMinuteLabel?: string;        // Custom label for minutes (default "Minutes")
  countdownSecondLabel?: string;        // Custom label for seconds (default "Seconds")
  countdownSeparator?: "colon" | "dash" | "space" | "none";  // Separator between units
  countdownShowLeadingZeros?: boolean;  // Show leading zeros (default true)
  countdownNumberColor?: string;        // Color for the numbers (hex)
  countdownLabelColor?: string;         // Color for the labels (hex)
  countdownSize?: number;              // Font size for countdown numbers in px
  countdownTitleSize?: number;         // Font size for countdown title in px
  countdownLabelSize?: number;         // Font size for unit labels (Days, Hours, etc.) in px
  countdownFontFamily?: "sans" | "serif" | "mono" | "display";  // Font family for numbers
  countdownUnitGap?: number;            // Gap between units in rem (default based on size)
  countdownTimezone?: string;           // IANA timezone for target date (e.g., "Europe/London")
  countdownCompact?: boolean;           // Compact mode - smaller labels, tighter spacing
  // Shape widget configuration
  shapeType?: "line" | "rectangle" | "square" | "circle" | "oval" | "triangle" | "arch";
  shapeFillColor?: string;             // Fill color (hex)
  shapeFillEnabled?: boolean;          // Whether fill is enabled (default true)
  shapeStrokeColor?: string;           // Stroke/border color (hex)
  shapeStrokeWidth?: number;           // Stroke width in px
  shapeStrokeStyle?: "solid" | "dashed" | "dotted";  // Stroke line style
  shapeRotation?: number;              // Rotation angle in degrees (0-360)
  shapeCornerRadius?: number;          // Corner radius for rectangles/squares in px
  shapeOpacity?: number;               // Overall opacity (0-100, default 100)
  shapeLineDirection?: "horizontal" | "vertical" | "diagonal-down" | "diagonal-up";  // Direction for line shapes
  shapeArchSpan?: number;              // Arch span angle in degrees (default 180)
  shapeAlignment?: "left" | "center" | "right";  // Horizontal alignment of shape content within zone (default center)
  shapeIcon?: string;                  // Signage icon identifier (e.g., "arrow-right", "toilet", "fire-exit")
  shapeIconColor?: string;             // Color of the icon SVG (hex, default matches stroke)
  shapeIconText?: string;              // Text label displayed next to the icon
  shapeIconTextPosition?: "left" | "right" | "top" | "bottom" | "center";  // Position of text relative to icon
  shapeIconTextSize?: number;          // Font size of icon text in px (default 14)
  shapeIconTextColor?: string;         // Color of icon text (hex, default matches stroke)
  // Media Player zone configuration
  mediaPlayerItems?: Array<{ id: string; mediaAssetId: string; duration?: number }>;
  mediaPlayerTransition?: "fade" | "slide-left" | "slide-right" | "none";
  mediaPlayerTransitionDuration?: number;
  mediaPlayerLoop?: boolean;
  mediaPlayerFitMode?: "contain" | "cover";
  mediaPlayerAutoPlay?: boolean;
  mediaPlayerMuted?: boolean;
  mediaPlayerShuffle?: boolean;
  // Football table widget configuration
  footballLeague?: "premier-league";
  footballSeason?: string;
  footballRefreshInterval?: number;
  footballFontSize?: number;
  footballShowBadges?: boolean;
  footballCompactMode?: boolean;
  footballBadgeFormat?: "png" | "svg";
  plFixturesDaysAhead?: number;
  plFixturesRefreshInterval?: number;
  plFixturesFontSize?: number;
  plFixturesShowBadges?: boolean;
  plFixturesShowVenue?: boolean;
  plFixturesCompactMode?: boolean;
  plFixturesShowCompleted?: boolean;
  plFixturesDisplayMode?: "list" | "grid" | "paged";
  plFixturesItemsPerPage?: number;
  plFixturesPageDuration?: number;
  plFixturesLimit?: number;
  heathrowTerminal?: string;
  heathrowAirline?: string;
  heathrowRefreshInterval?: number;
  heathrowFontSize?: number;
  heathrowShowFilters?: boolean;
  heathrowColumns?: string[];
  forecastDays?: number;
  forecastRefreshInterval?: number;
  forecastFontSize?: number;
  forecastShowHourly?: boolean;
  forecastShowCondition?: boolean;
  forecastShowSunrise?: boolean;
  forecastShowHumidity?: boolean;
  forecastShowHourlyCondition?: boolean;
  // SpaceX Launch Countdown configuration
  spacexRefreshInterval?: number;
  spacexFontSize?: number;
  spacexShowDetails?: boolean;
  spacexShowPatch?: boolean;
  spacexShowLinks?: boolean;
  spacexShowLaunchpad?: boolean;
  // Global Earthquakes configuration
  earthquakeFeed?: string;
  earthquakeMinMagnitude?: number;
  earthquakeLimit?: number;
  earthquakeRefreshInterval?: number;
  earthquakeFontSize?: number;
  earthquakeShowDepth?: boolean;
  earthquakeShowTsunami?: boolean;
  earthquakeShowAlert?: boolean;
  earthquakeDisplayMode?: "list" | "auto_scroll" | "map";
  earthquakeScrollSpeed?: number;
  earthquakeItemsPerPage?: number;
  earthquakePageDuration?: number;
  aircraftRefreshInterval?: number;
  aircraftFontSize?: number;
  aircraftBoundsLamin?: number;
  aircraftBoundsLomin?: number;
  aircraftBoundsLamax?: number;
  aircraftBoundsLomax?: number;
  aircraftLimit?: number;
  aircraftShowCallsign?: boolean;
  aircraftShowAltitude?: boolean;
  aircraftShowSpeed?: boolean;
  aircraftShowHeading?: boolean;
  aircraftShowCountry?: boolean;
  aircraftDisplayMode?: "radar" | "list" | "auto_scroll" | "map";
  aircraftShowSweep?: boolean;
  aircraftScrollSpeed?: number;
  aircraftItemsPerPage?: number;
  aircraftPageDuration?: number;
  // YouTube Live widget configuration
  youtubeUrl?: string;
  youtubeMute?: boolean;
  // WebRTC Stream widget configuration (OvenMediaEngine)
  webrtcSignallingUrl?: string;
  webrtcStreamKey?: string;
  webrtcMute?: boolean;
  // Schedule widget configuration
  scheduleViewMode?: "hourly" | "daily" | "agenda";
  scheduleEntries?: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    day?: string;
    color?: string;
    room?: string;
  }>;
  scheduleShowCurrentTime?: boolean;
  scheduleTimeFormat?: "12h" | "24h";
  scheduleStartHour?: number;
  scheduleEndHour?: number;
  scheduleHeaderText?: string;
}

// ============ PROGRAMMES ============

export const programmes = pgTable("programmes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const programmesRelations = relations(programmes, ({ one, many }) => ({
  event: one(events, { fields: [programmes.eventId], references: [events.id] }),
  versions: many(programmeVersions),
}));

export const insertProgrammeSchema = createInsertSchema(programmes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgramme = z.infer<typeof insertProgrammeSchema>;
export type Programme = typeof programmes.$inferSelect;

// ============ PROGRAMME VERSIONS ============

export const programmeVersions = pgTable("programme_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programmeId: varchar("programme_id").notNull().references(() => programmes.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull().default(1),
  status: programmeStatusEnum("status").default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const programmeVersionsRelations = relations(programmeVersions, ({ one, many }) => ({
  programme: one(programmes, { fields: [programmeVersions.programmeId], references: [programmes.id] }),
  scheduleBlocks: many(scheduleBlocks),
}));

export const insertProgrammeVersionSchema = createInsertSchema(programmeVersions).omit({ id: true, createdAt: true });
export type InsertProgrammeVersion = z.infer<typeof insertProgrammeVersionSchema>;
export type ProgrammeVersion = typeof programmeVersions.$inferSelect;

// ============ SCHEDULE BLOCKS ============

export const scheduleBlocks = pgTable("schedule_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programmeVersionId: varchar("programme_version_id").notNull().references(() => programmeVersions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: integer("priority").default(0),
  layoutTemplateId: varchar("layout_template_id").references(() => layoutTemplates.id, { onDelete: "set null" }),
  targets: jsonb("targets").$type<ScheduleTarget[]>(),
  timeRules: jsonb("time_rules").$type<TimeRule[]>(),
  zoneSources: jsonb("zone_sources").$type<ZoneSource[]>(),
  seriesId: varchar("series_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduleBlocksRelations = relations(scheduleBlocks, ({ one }) => ({
  programmeVersion: one(programmeVersions, { fields: [scheduleBlocks.programmeVersionId], references: [programmeVersions.id] }),
  layoutTemplate: one(layoutTemplates, { fields: [scheduleBlocks.layoutTemplateId], references: [layoutTemplates.id] }),
}));

export const insertScheduleBlockSchema = createInsertSchema(scheduleBlocks).omit({ id: true, createdAt: true });
export type InsertScheduleBlock = z.infer<typeof insertScheduleBlockSchema>;
export type ScheduleBlock = typeof scheduleBlocks.$inferSelect;

// Schedule block type definitions
export interface ScheduleTarget {
  type: "screen" | "group";
  id: string;
}

export interface TimeRule {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
}

export interface ZoneSource {
  zoneId: string;
  type: "playlist" | "widget";
  playlistId?: string;
  mediaAssetIds?: string[];
  widgetType?: "weather" | "clock" | "date" | "html";
  widgetConfig?: Record<string, unknown>;
  rotationInterval?: number;
}

// ============ PLAYLISTS ============

export const playlists = pgTable("playlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  event: one(events, { fields: [playlists.eventId], references: [events.id] }),
  items: many(playlistItems),
}));

export const insertPlaylistSchema = createInsertSchema(playlists).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type Playlist = typeof playlists.$inferSelect;

// ============ PLAYLIST ITEMS ============

export const playlistItems = pgTable("playlist_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playlistId: varchar("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
  mediaAssetId: varchar("media_asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
  layoutTemplateId: varchar("layout_template_id").references(() => layoutTemplates.id, { onDelete: "cascade" }),
  order: integer("order").default(0),
  duration: integer("duration"),
});

export const playlistItemsRelations = relations(playlistItems, ({ one }) => ({
  playlist: one(playlists, { fields: [playlistItems.playlistId], references: [playlists.id] }),
  mediaAsset: one(mediaAssets, { fields: [playlistItems.mediaAssetId], references: [mediaAssets.id] }),
  layoutTemplate: one(layoutTemplates, { fields: [playlistItems.layoutTemplateId], references: [layoutTemplates.id] }),
}));

export const insertPlaylistItemSchema = createInsertSchema(playlistItems).omit({ id: true }).extend({
  mediaAssetId: z.string().nullable().optional(),
  layoutTemplateId: z.string().nullable().optional(),
});
export const updatePlaylistItemSchema = insertPlaylistItemSchema.partial().extend({
  duration: z.number().int().nullable().optional(),
});
export type InsertPlaylistItem = z.infer<typeof insertPlaylistItemSchema>;
export type UpdatePlaylistItem = z.infer<typeof updatePlaylistItemSchema>;
export type PlaylistItem = typeof playlistItems.$inferSelect;

// ============ SCREEN PRESETS ============

export const screenPresets = pgTable("screen_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  screenId: varchar("screen_id").references(() => screens.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").references(() => screenGroups.id, { onDelete: "cascade" }),
  layoutTemplateId: varchar("layout_template_id").references(() => layoutTemplates.id, { onDelete: "set null" }),
  zoneSources: jsonb("zone_sources").$type<ZoneSource[]>(),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const screenPresetsRelations = relations(screenPresets, ({ one }) => ({
  screen: one(screens, { fields: [screenPresets.screenId], references: [screens.id] }),
  group: one(screenGroups, { fields: [screenPresets.groupId], references: [screenGroups.id] }),
  layoutTemplate: one(layoutTemplates, { fields: [screenPresets.layoutTemplateId], references: [layoutTemplates.id] }),
}));

export const insertScreenPresetSchema = createInsertSchema(screenPresets).omit({ id: true, createdAt: true });
export type InsertScreenPreset = z.infer<typeof insertScreenPresetSchema>;
export type ScreenPreset = typeof screenPresets.$inferSelect;

// ============ LIVE OVERRIDES ============

export const liveOverrides = pgTable("live_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: integer("priority").default(100),
  targets: jsonb("targets").$type<ScheduleTarget[]>(),
  layoutTemplateId: varchar("layout_template_id").references(() => layoutTemplates.id, { onDelete: "set null" }),
  zoneSources: jsonb("zone_sources").$type<ZoneSource[]>(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  isActive: boolean("is_active").default(true),
  presetId: varchar("preset_id").references(() => screenPresets.id, { onDelete: "set null" }),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Import users from auth
import { users } from "./models/auth";

export const liveOverridesRelations = relations(liveOverrides, ({ one }) => ({
  event: one(events, { fields: [liveOverrides.eventId], references: [events.id] }),
  layoutTemplate: one(layoutTemplates, { fields: [liveOverrides.layoutTemplateId], references: [layoutTemplates.id] }),
  createdBy: one(users, { fields: [liveOverrides.createdById], references: [users.id] }),
}));

export const insertLiveOverrideSchema = createInsertSchema(liveOverrides).omit({ id: true, createdAt: true });
export type InsertLiveOverride = z.infer<typeof insertLiveOverrideSchema>;
export type LiveOverride = typeof liveOverrides.$inferSelect;

// ============ PLAYER HEARTBEATS ============

export const playerHeartbeats = pgTable("player_heartbeats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").defaultNow(),
  temperature: integer("temperature"),
  storageFree: integer("storage_free"),
  uptime: integer("uptime"),
  currentBlockId: varchar("current_block_id"),
  currentItemId: varchar("current_item_id"),
  errors: jsonb("errors"),
});

export const playerHeartbeatsRelations = relations(playerHeartbeats, ({ one }) => ({
  screen: one(screens, { fields: [playerHeartbeats.screenId], references: [screens.id] }),
}));

export const insertPlayerHeartbeatSchema = createInsertSchema(playerHeartbeats).omit({ id: true });
export type InsertPlayerHeartbeat = z.infer<typeof insertPlayerHeartbeatSchema>;
export type PlayerHeartbeat = typeof playerHeartbeats.$inferSelect;

// ============ AUDIT LOG ============

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  payload: jsonb("payload"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============ ALERT SETTINGS ============

export const alertSettings = pgTable("alert_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: text("alert_type").notNull(),
  clientId: varchar("client_id"),
  enabled: boolean("enabled").notNull().default(false),
  recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(15),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAlertSettingSchema = createInsertSchema(alertSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlertSetting = z.infer<typeof insertAlertSettingSchema>;
export type AlertSetting = typeof alertSettings.$inferSelect;

export const alertHistory = pgTable("alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: text("alert_type").notNull(),
  entityId: varchar("entity_id"),
  recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export type AlertHistory = typeof alertHistory.$inferSelect;

// ============ WEATHER CACHE ============

export const weatherCache = pgTable("weather_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  location: text("location").notNull().unique(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WeatherCache = typeof weatherCache.$inferSelect;

// ============ SYSTEM SETTINGS ============

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings);
export type SystemSetting = typeof systemSettings.$inferSelect;

// ============ API TOKENS ============

export const apiTokens = pgTable("api_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: varchar("token_hash").notNull().unique(),
  prefix: varchar("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  // Timestamp of the most recent api_token_new_ip audit entry that an admin
  // has dismissed. Alerts at or before this point are hidden; a brand-new
  // unexpected IP (with a strictly newer timestamp) re-raises the warning.
  newIpAcknowledgedAt: timestamp("new_ip_acknowledged_at"),
});

export type ApiToken = typeof apiTokens.$inferSelect;
export type InsertApiToken = typeof apiTokens.$inferInsert;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// Tracks every distinct (token, source IP) pair we have ever seen.
// First time a token is used from a brand-new IP we also write an audit_log
// entry so admins can spot a stolen token being used from an unexpected place.
export const apiTokenKnownIps = pgTable(
  "api_token_known_ips",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tokenId: varchar("token_id").notNull().references(() => apiTokens.id, { onDelete: "cascade" }),
    ip: varchar("ip").notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
  },
  (table) => ({
    tokenIpUnique: uniqueIndex("api_token_known_ips_token_ip_unique").on(table.tokenId, table.ip),
  }),
);

export type ApiTokenKnownIp = typeof apiTokenKnownIps.$inferSelect;
export type InsertApiTokenKnownIp = typeof apiTokenKnownIps.$inferInsert;

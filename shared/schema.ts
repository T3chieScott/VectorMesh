import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
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
export const zoneTypeEnum = pgEnum("zone_type", ["media", "ticker", "clock", "logo", "html", "weather", "news", "montage", "qrcode", "countdown", "shape", "schedule", "media_player", "football_table", "premier_league_fixtures", "heathrow_arrivals", "heathrow_departures", "weather_forecast", "spacex_launch", "earthquakes", "aircraft_radar", "youtube_live", "webrtc_stream", "agenda", "sweepstake"]);
export const scaleModeEnum = pgEnum("scale_mode", ["contain", "cover"]);

// ============ CLIENTS ============

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  locked: boolean("locked").default(false),
  maxUploadSizeMb: integer("max_upload_size_mb").default(100),
  // IANA timezone (e.g. "Europe/London"). Used to interpret schedule
  // block start/end times and day-of-week rules at this client/site.
  // See shared/timezone-utils.ts for the helpers that consume it. The
  // env var `DEFAULT_SCHEDULE_TIMEZONE` controls the migration backfill
  // value (see scripts/post-merge.sh).
  timezone: text("timezone").notNull().default("Europe/London"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clientsRelations = relations(clients, ({ many }) => ({
  events: many(events),
}));

export const insertClientSchema = createInsertSchema(clients)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Validate the timezone against the runtime's IANA database. We can't
    // import shared/timezone-utils here (it would create a circular import
    // back through createInsertSchema's transform), so the refinement uses
    // Intl.DateTimeFormat directly.
    timezone: z
      .string()
      .min(1, "Timezone is required")
      .refine(
        (tz) => {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date(0));
            return true;
          } catch {
            return false;
          }
        },
        { message: "Unknown IANA timezone" },
      )
      .optional(),
  });
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

// ============ CANVAS GROUPS ============

// Task #189 — explicit canvas grouping. Replaces the implicit
// (clientId, canvasWidth, canvasHeight) + position-distinctness
// model that over-grouped multiple independent screens that just
// happened to share 1920×1080. Each canvas-enabled screen now has
// an explicit `canvasGroupId` that points to one of these rows;
// real walls share a group id, lone canvas screens get their own
// group. Operators rename the wall in one place (the group's
// `name`) instead of editing every member tile.
export const canvasGroups = pgTable("canvas_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  canvasWidth: integer("canvas_width").notNull(),
  canvasHeight: integer("canvas_height").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const canvasGroupsRelations = relations(canvasGroups, ({ one, many }) => ({
  client: one(clients, { fields: [canvasGroups.clientId], references: [clients.id] }),
  screens: many(screens),
}));

export const insertCanvasGroupSchema = createInsertSchema(canvasGroups)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1, "Name is required"),
    canvasWidth: z.number().int().min(1, "Canvas width must be ≥ 1"),
    canvasHeight: z.number().int().min(1, "Canvas height must be ≥ 1"),
  });
export type InsertCanvasGroup = z.infer<typeof insertCanvasGroupSchema>;
export type CanvasGroup = typeof canvasGroups.$inferSelect;

// ============ SCREENS ============

export const screens = pgTable("screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id),
  name: text("name").notNull(),
  location: text("location"),
  // Optional per-screen IANA timezone override (e.g. "Europe/Paris" for a
  // screen physically located in France). null = inherit the owning
  // client/site timezone. Used to format times (e.g. sweepstake kick-offs)
  // in the screen's own local time regardless of the site default or the
  // player device's OS clock.
  timezone: text("timezone"),
  displayProfileId: varchar("display_profile_id").references(() => displayProfiles.id),
  // Task #180: pairing codes are globally unique. Each screen owns its
  // own code; walls share runtime `deviceToken` (assigned at pair time
  // by the player flow which fans out via getCanvasMembers) but never
  // share `pairingCode`. The DB-level UNIQUE constraint prevents the
  // bug class where leaving a wall, regenerating, or unpairing left
  // duplicate codes that pointed the next pair attempt at the wrong
  // screen.
  pairingCode: varchar("pairing_code", { length: 6 }).unique(),
  // Task #303 — opt-in "reusable pairing code" (kiosk mode). Windows
  // kiosk PCs wipe browser storage on reboot, losing the deviceToken.
  // When this flag is ON, POST /api/player/pair accepts the screen's
  // code even while the screen is already paired, minting a fresh
  // token (the old one dies) so a kiosk URL like /player?code=ABC123
  // survives reboots. When OFF (default), a pair attempt against an
  // already-paired screen is rejected (409) so a leaked code can't
  // hijack a live display.
  kioskModeEnabled: boolean("kiosk_mode_enabled").default(false),
  deviceToken: text("device_token"),
  isPaired: boolean("is_paired").default(false),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen"),
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  hardwareClass: text("hardware_class"),
  fallbackLayoutId: varchar("fallback_layout_id").references(() => layoutTemplates.id, { onDelete: "set null" }),
  fallbackPlaylistId: varchar("fallback_playlist_id").references(() => playlists.id, { onDelete: "set null" }),
  canvasEnabled: boolean("canvas_enabled").default(false),
  canvasWidth: integer("canvas_width"),
  canvasHeight: integer("canvas_height"),
  canvasX: integer("canvas_x").default(0),
  canvasY: integer("canvas_y").default(0),
  // Task #189 — explicit canvas group membership. Nullable for non-
  // canvas screens. Set on every canvas-enabled row by the boot-time
  // backfill and by createScreen for new canvas screens. ON DELETE
  // SET NULL so the row survives if its group is removed (the screen
  // simply becomes canvas-disabled-pending until reassigned).
  canvasGroupId: varchar("canvas_group_id").references(() => canvasGroups.id, { onDelete: "set null" }),
  locked: boolean("locked").default(false),
  screenshotEnabled: boolean("screenshot_enabled").default(false),
  lastScreenshot: text("last_screenshot"),
  lastScreenshotAt: timestamp("last_screenshot_at"),
  testPatternEnabled: boolean("test_pattern_enabled").default(false),
  showLiveBanner: boolean("show_live_banner").default(false),
  hideNoContentMessage: boolean("hide_no_content_message").default(false),
  roomCapacity: integer("room_capacity"),
  weatherLat: text("weather_lat"),
  weatherLng: text("weather_lng"),
  weatherPlaceName: text("weather_place_name"),
  weatherUnit: text("weather_unit").default("celsius"),
  displayOrder: integer("display_order"),
  // Task #197 — player-side video keep-alive watchdog reports its
  // running counters on every heartbeat. Persisted here so the
  // Screens dashboard can show a per-screen Video health badge
  // (green / amber / red) without needing to scrape devtools.
  // Counters are cumulative since the last player page load (the
  // watchdog itself resets to 0 on reload), so a sudden drop in
  // reloads is normal and not treated as an error by the badge.
  videoStatsStalls: integer("video_stats_stalls").default(0),
  videoStatsRecoveries: integer("video_stats_recoveries").default(0),
  videoStatsReloads: integer("video_stats_reloads").default(0),
  // Server-stamped timestamp when the heartbeat first reported a
  // higher reloads count than was previously stored — i.e. the
  // moment the player actually refreshed itself. Used by the badge
  // to decide whether a reload is "recent" (red) or stale.
  videoStatsLastReloadAt: timestamp("video_stats_last_reload_at"),
  // Server-stamped timestamp of the most recent heartbeat that
  // carried a video-stats payload. Lets the UI distinguish "never
  // reported" from "reported zeroes" without a separate column.
  videoStatsUpdatedAt: timestamp("video_stats_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const screensRelations = relations(screens, ({ one, many }) => ({
  client: one(clients, { fields: [screens.clientId], references: [clients.id] }),
  displayProfile: one(displayProfiles, { fields: [screens.displayProfileId], references: [displayProfiles.id] }),
  fallbackLayout: one(layoutTemplates, { fields: [screens.fallbackLayoutId], references: [layoutTemplates.id] }),
  fallbackPlaylist: one(playlists, { fields: [screens.fallbackPlaylistId], references: [playlists.id] }),
  groupMemberships: many(screenGroupMemberships),
  heartbeats: many(playerHeartbeats),
}));

export const insertScreenSchema = createInsertSchema(screens)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Per-screen timezone override. null/omitted = inherit the site
    // timezone. When a string is given it must be a valid IANA zone. We
    // validate with Intl.DateTimeFormat directly to avoid a circular import
    // back through createInsertSchema's transform (see insertClientSchema).
    timezone: z
      .string()
      .refine(
        (tz) => {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date(0));
            return true;
          } catch {
            return false;
          }
        },
        { message: "Unknown IANA timezone" },
      )
      .nullable()
      .optional(),
  });
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

// ============ SCREEN EVENT BOOKINGS ============

export const screenEventBookings = pgTable("screen_event_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const screenEventBookingsRelations = relations(screenEventBookings, ({ one }) => ({
  screen: one(screens, { fields: [screenEventBookings.screenId], references: [screens.id] }),
  event: one(events, { fields: [screenEventBookings.eventId], references: [events.id] }),
}));

export const insertScreenEventBookingSchema = createInsertSchema(screenEventBookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScreenEventBooking = z.infer<typeof insertScreenEventBookingSchema>;
export type ScreenEventBooking = typeof screenEventBookings.$inferSelect;

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
  folderId: varchar("folder_id").references(() => mediaFolders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  client: one(clients, { fields: [mediaAssets.clientId], references: [clients.id] }),
  event: one(events, { fields: [mediaAssets.eventId], references: [events.id] }),
  folder: one(mediaFolders, { fields: [mediaAssets.folderId], references: [mediaFolders.id] }),
  shares: many(mediaShares),
}));

export const insertMediaAssetSchema = createInsertSchema(mediaAssets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;
export type MediaAsset = typeof mediaAssets.$inferSelect;

// ============ MEDIA FOLDERS ============
// Per-site (clientId-scoped) flat folders for organising media assets.
// Task #265: deleting a folder must NOT delete its assets — the
// folderId FK uses onDelete:"set null" so the assets fall back to the
// uncategorised view instead of cascading.

export const mediaFolders = pgTable("media_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mediaFoldersRelations = relations(mediaFolders, ({ one, many }) => ({
  client: one(clients, { fields: [mediaFolders.clientId], references: [clients.id] }),
  assets: many(mediaAssets),
}));

export const insertMediaFolderSchema = createInsertSchema(mediaFolders).omit({ id: true, createdAt: true });
export type InsertMediaFolder = z.infer<typeof insertMediaFolderSchema>;
export type MediaFolder = typeof mediaFolders.$inferSelect;

// ============ MEDIA SHARES ============

export const mediaShares = pgTable("media_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaAssetId: varchar("media_asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  sharedAt: timestamp("shared_at").defaultNow(),
});

// Task #281: per-client uploaded font files (woff2/woff/ttf/otf).
// The exposed CSS @font-face family is derived from the row id at
// render time (see shared/fonts.ts → customFontFamily), so a layout
// or agenda config stores the reference as `custom:<id>`.
export const customFonts = pgTable("custom_fonts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  // Files that share a familyId are one font family (their weights/italics
  // switch automatically when the family is selected). For a single-file
  // family, familyId equals the row id.
  familyId: varchar("family_id").notNull().default(sql`gen_random_uuid()`),
  // `name` is the family name (shared across the family's files).
  name: text("name").notNull(),
  weight: integer("weight").notNull().default(400),
  style: text("style").notNull().default("normal"),
  originalName: text("original_name").notNull(),
  storagePath: text("storage_path").notNull(),
  format: text("format").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomFontSchema = createInsertSchema(customFonts)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1, "Name is required"),
    weight: z.number().int().min(100).max(900).default(400),
    style: z.enum(["normal", "italic"]).default("normal"),
  });
export type InsertCustomFont = z.infer<typeof insertCustomFontSchema>;
export type CustomFont = typeof customFonts.$inferSelect;

export const mediaSharesRelations = relations(mediaShares, ({ one }) => ({
  mediaAsset: one(mediaAssets, { fields: [mediaShares.mediaAssetId], references: [mediaAssets.id] }),
  client: one(clients, { fields: [mediaShares.clientId], references: [clients.id] }),
}));

export const insertMediaShareSchema = createInsertSchema(mediaShares).omit({ id: true, sharedAt: true });
export type InsertMediaShare = z.infer<typeof insertMediaShareSchema>;
export type MediaShare = typeof mediaShares.$inferSelect;

// ============ LAYOUT TEMPLATES ============

// ============ LAYOUT FOLDERS ============
// Task #311: per-site (clientId-scoped) flat folders for organising
// scenes (layout templates), mirroring mediaFolders. Deleting a folder
// must NOT delete its scenes — the folderId FK on layout_templates uses
// onDelete:"set null" so scenes fall back to the uncategorised view.
export const layoutFolders = pgTable("layout_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const layoutFoldersRelations = relations(layoutFolders, ({ one, many }) => ({
  client: one(clients, { fields: [layoutFolders.clientId], references: [clients.id] }),
  layouts: many(layoutTemplates),
}));

export const insertLayoutFolderSchema = createInsertSchema(layoutFolders).omit({ id: true, createdAt: true });
export type InsertLayoutFolder = z.infer<typeof insertLayoutFolderSchema>;
export type LayoutFolder = typeof layoutFolders.$inferSelect;

export const layoutTemplates = pgTable("layout_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").references(() => layoutFolders.id, { onDelete: "set null" }),
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
  folder: one(layoutFolders, { fields: [layoutTemplates.folderId], references: [layoutFolders.id] }),
}));

export const insertLayoutTemplateSchema = createInsertSchema(layoutTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLayoutTemplate = z.infer<typeof insertLayoutTemplateSchema>;
export type LayoutTemplate = typeof layoutTemplates.$inferSelect;

// Zone type definitions
export interface LayoutZone {
  id: string;
  name: string;
  type: "media" | "ticker" | "clock" | "logo" | "html" | "weather" | "news" | "text" | "shader" | "montage" | "qrcode" | "countdown" | "shape" | "schedule" | "media_player" | "football_table" | "premier_league_fixtures" | "heathrow_arrivals" | "heathrow_departures" | "weather_forecast" | "spacex_launch" | "earthquakes" | "aircraft_radar" | "youtube_live" | "webrtc_stream" | "agenda" | "sweepstake";
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
  // Task #281: font family for text zones. Built-in key (see shared/fonts.ts)
  // or a `custom:<id>` reference to a per-client uploaded font. Undefined =
  // inherit (preserves the look of text zones saved before this field existed).
  fontFamily?: string;
  // HTML widget configuration (Task #244). The HTML body reuses `textContent`;
  // `htmlCss` carries the scoped stylesheet. Both render inside a sandboxed
  // iframe (no scripts) and are sanitised server-side before reaching players.
  htmlCss?: string;
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
  // Authored in the layout editor and also synthesised at runtime by the
  // player/simulator when expanding a playlist/zone source into the items
  // the renderer should cycle through. `duration` omitted/undefined means
  // "use the asset's own duration".
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
  earthquakeFeed?: "all_hour" | "all_day" | "significant_hour" | "significant_day";
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
  // Heathrow flights widget configuration
  heathrowPageInterval?: number; // seconds between page rotations (default 10)
  // Agenda widget configuration — references an agenda_widget_configs row
  // and renders the same AgendaDisplayWidget that powers the public
  // /display/agenda/:configId page, but inline inside a layout zone.
  agendaConfigId?: string;
  // Sweepstake widget configuration — references a sweepstake_widget_configs
  // row and renders the same SweepstakeDisplayWidget that powers the public
  // /display/sweepstake/:configId page, but inline inside a layout zone.
  sweepstakeConfigId?: string;
}

// ============ PROGRAMMES ============

export const programmes = pgTable("programmes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  displayOrder: integer("display_order"),
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
  // Task #209 — programme blocks can target a saved agenda widget
  // config directly instead of (or alongside) a layout. When set
  // and `layoutTemplateId` is null, the player content resolver
  // returns a synthetic fullscreen agenda zone source so the player
  // renders the AgendaDisplayWidget without the operator having to
  // build a one-zone layout or paste the public /display/agenda URL.
  agendaConfigId: varchar("agenda_config_id").references(() => agendaWidgetConfigs.id, { onDelete: "set null" }),
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
  type: "playlist" | "widget" | "agenda";
  playlistId?: string;
  mediaAssetIds?: string[];
  widgetType?: "weather" | "clock" | "date" | "html";
  widgetConfig?: Record<string, unknown>;
  rotationInterval?: number;
  // Task #209 — when type === "agenda" this references an
  // agenda_widget_configs row. The player renders an inline
  // AgendaDisplayWidget for any zone (or the synthetic
  // "__fallback__" zone) carrying this source.
  agendaConfigId?: string;
}

// ============ PLAYLISTS ============

export const playlists = pgTable("playlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  client: one(clients, { fields: [playlists.clientId], references: [clients.id] }),
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

// ============ VIDEO HEALTH SAMPLES ============
//
// Task #200 — per-heartbeat snapshots of the player keep-alive
// watchdog counters. Task #197 only persists the *latest* counter
// values on the screen row, which is enough for the live badge but
// throws away the history operators need to spot a screen that has
// been stalling repeatedly over the past day. Each row captures the
// cumulative counters at the moment the heartbeat arrived; the
// sparkline in the screens UI diffs consecutive rows to render a
// per-hour bar chart of reload events. Old rows are pruned by a
// background interval (see `pruneVideoHealthSamples` in storage).
export const videoHealthSamples = pgTable(
  "video_health_samples",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    stalls: integer("stalls").notNull().default(0),
    recoveries: integer("recoveries").notNull().default(0),
    reloads: integer("reloads").notNull().default(0),
  },
  (table) => ({
    // Per-screen sparkline reads filter by screen_id + timestamp range
    // and order by timestamp; this composite index covers both paths.
    screenTimestampIdx: index("video_health_samples_screen_timestamp_idx").on(
      table.screenId,
      table.timestamp,
    ),
    // The 6-hourly prune sweeps everything with timestamp < cutoff
    // across all screens; a standalone timestamp index keeps that
    // delete from devolving into a sequential scan.
    timestampIdx: index("video_health_samples_timestamp_idx").on(table.timestamp),
  }),
);

export const videoHealthSamplesRelations = relations(videoHealthSamples, ({ one }) => ({
  screen: one(screens, { fields: [videoHealthSamples.screenId], references: [screens.id] }),
}));

export const insertVideoHealthSampleSchema = createInsertSchema(videoHealthSamples).omit({ id: true });
export type InsertVideoHealthSample = z.infer<typeof insertVideoHealthSampleSchema>;
export type VideoHealthSample = typeof videoHealthSamples.$inferSelect;

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

// ============ OPERATIONS PERMISSIONS (Task #329) ============
// Relational scope tables so external operational clients (e.g. Multiview)
// can be granted fine-grained access without touching the existing role system.
// Admins and account_managers pass all operations scope checks implicitly;
// site_users and API tokens require explicit rows here.
// Defined scope constants live in server/operations/index.ts.

export const userOperationsScopes = pgTable(
  "user_operations_scopes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    grantedAt: timestamp("granted_at").defaultNow(),
    // Nullable so the granting admin's row deletion doesn't orphan the grant.
    grantedBy: varchar("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    userScopeUnique: uniqueIndex("user_operations_scopes_user_scope_unique").on(
      table.userId,
      table.scope,
    ),
  }),
);

export type UserOperationsScope = typeof userOperationsScopes.$inferSelect;
export type InsertUserOperationsScope =
  typeof userOperationsScopes.$inferInsert;

export const tokenOperationsScopes = pgTable(
  "token_operations_scopes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tokenId: varchar("token_id")
      .notNull()
      .references(() => apiTokens.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    grantedAt: timestamp("granted_at").defaultNow(),
  },
  (table) => ({
    tokenScopeUnique: uniqueIndex(
      "token_operations_scopes_token_scope_unique",
    ).on(table.tokenId, table.scope),
  }),
);

export type TokenOperationsScope = typeof tokenOperationsScopes.$inferSelect;
export type InsertTokenOperationsScope =
  typeof tokenOperationsScopes.$inferInsert;

// ============ AGENDA DISPLAY WIDGET (Task #208) ============

// Central pool of agenda items per site. Each item represents one
// session / talk / break / activity on the schedule. Items are
// site-scoped via clientId; widget configs filter the pool by room,
// track, time window, status etc to render a slice on each screen.
export const agendaItems = pgTable("agenda_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  room: text("room"),
  track: text("track"),
  presenter: text("presenter"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  // scheduled | in_progress | delayed | cancelled | moved
  status: text("status").notNull().default("scheduled"),
  statusMessage: text("status_message"),
  // Task #210 — external sync provenance. When a row is created or
  // refreshed by the agenda-sync engine (server/agendaSync.ts) we
  // stamp the source config id + the upstream item's stable id (ICS
  // UID or Google Sheets externalId column). `manualOverride` flips
  // to true the moment an operator edits the row in the UI, which
  // freezes it against future sync passes so hand-tweaked sessions
  // never get clobbered when the upstream changes.
  externalSyncConfigId: varchar("external_sync_config_id"),
  externalId: text("external_id"),
  manualOverride: boolean("manual_override").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  externalIdLookup: uniqueIndex("agenda_items_sync_external_id_unique")
    .on(table.externalSyncConfigId, table.externalId),
}));

export const agendaItemsRelations = relations(agendaItems, ({ one }) => ({
  client: one(clients, { fields: [agendaItems.clientId], references: [clients.id] }),
}));

export const AGENDA_STATUSES = [
  "scheduled",
  "in_progress",
  "delayed",
  "cancelled",
  "moved",
] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

export const insertAgendaItemSchema = createInsertSchema(agendaItems)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    title: z.string().min(1, "Title is required"),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: z.enum(AGENDA_STATUSES).default("scheduled"),
  });
export type InsertAgendaItem = z.infer<typeof insertAgendaItemSchema>;
export type AgendaItem = typeof agendaItems.$inferSelect;

// Task #210 — external agenda sync. Each row defines one upstream
// source feeding agenda_items for a single site. The sync engine
// (server/agendaSync.ts) periodically pulls the source, parses it
// into agenda rows, and upserts by (externalSyncConfigId, externalId).
// Rows that an operator has hand-edited (manualOverride=true) are
// skipped by future syncs so manual fixes are never clobbered.
// Task #267 — the spreadsheet-source mapper widens the set well beyond
// the original two. `ics` and `google_sheets_csv` keep their original
// fixed-column behaviour untouched; the new types all flow through the
// generic column-mapping path (shared/spreadsheet-mapping.ts):
//   - google_sheets       — any Google Sheet (exported as CSV), mapped
//   - csv_url             — any publicly-fetchable CSV URL, mapped
//   - excel_onedrive      — an Excel/OneDrive direct-download link (XLSX)
//   - sharepoint_excel    — a SharePoint Excel direct-download link (XLSX)
//   - uploaded_xlsx       — an operator-uploaded .xlsx stored on disk
export const AGENDA_SYNC_SOURCE_TYPES = [
  "ics",
  "google_sheets_csv",
  "google_sheets",
  "csv_url",
  "excel_onedrive",
  "sharepoint_excel",
  "uploaded_xlsx",
] as const;
export type AgendaSyncSourceType = (typeof AGENDA_SYNC_SOURCE_TYPES)[number];

// Source types that drive the generic column-mapping path. The two
// legacy types (ics, google_sheets_csv) are deliberately excluded.
export const AGENDA_MAPPED_SOURCE_TYPES = [
  "google_sheets",
  "csv_url",
  "excel_onedrive",
  "sharepoint_excel",
  "uploaded_xlsx",
] as const;

// The new sync engine fetches spreadsheet bytes for these (XLSX), the
// rest are fetched/parsed as text.
export const AGENDA_XLSX_SOURCE_TYPES = [
  "excel_onedrive",
  "sharepoint_excel",
  "uploaded_xlsx",
] as const;

export const AGENDA_SYNC_MODES = ["manual", "interval"] as const;
export type AgendaSyncMode = (typeof AGENDA_SYNC_MODES)[number];

// The VectorMesh agenda fields an operator can map a spreadsheet column
// onto. `title`, `startsAt` and `endsAt` are required before a mapped
// sync is allowed; the rest are optional.
export const AGENDA_MAPPABLE_FIELDS = [
  "title",
  "description",
  "room",
  "track",
  "presenter",
  // Optional second name column. When mapped, it is combined with
  // `presenter` (first name) to form the speaker's full name.
  "presenterLastName",
  // Optional company/organisation column, appended after the name
  // ("Firstname Lastname, Company") so the display can show affiliation.
  "company",
  "startsAt",
  "endsAt",
  "status",
  "statusMessage",
] as const;
export type AgendaMappableField = (typeof AGENDA_MAPPABLE_FIELDS)[number];
export const AGENDA_REQUIRED_MAPPABLE_FIELDS = ["title", "startsAt", "endsAt"] as const;

// Column mapping persists as { agendaField: spreadsheetHeaderLabel }.
// Future extension (out of scope now): allow an array of header labels
// per field to build one agenda field from several columns.
export type AgendaColumnMapping = Partial<Record<AgendaMappableField, string>>;

export const agendaSyncConfigs = pgTable("agenda_sync_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  // Nullable now: uploaded_xlsx sources have no URL (the file lives at
  // `storedFilePath`). URL-based types still require a valid URL, which
  // is enforced in the route/engine rather than the column.
  sourceUrl: text("source_url"),
  // Task #268 — Microsoft sign-in for private OneDrive/SharePoint Excel.
  // When `microsoftAuth` is true (only meaningful for excel_onedrive /
  // sharepoint_excel sources) the fetch step pulls the .xlsx bytes via
  // Microsoft Graph using the system-level Microsoft connector instead
  // of the public-link `safeFetch` path. A Graph-backed file is
  // addressed either by its (driveId, itemId) — set by the file picker —
  // or resolved at fetch time from a pasted share link in `sourceUrl`.
  // `msSiteId` is a SharePoint seam (currently informational; per-client
  // / multi-tenant Microsoft accounts are explicitly out of scope).
  microsoftAuth: boolean("microsoft_auth").notNull().default(false),
  msDriveId: text("ms_drive_id"),
  msItemId: text("ms_item_id"),
  msSiteId: text("ms_site_id"),
  enabled: boolean("enabled").notNull().default(true),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(60),
  // Task #267 — spreadsheet-source mapper fields. All nullable so
  // existing ics/google_sheets_csv rows keep working unchanged.
  // For uploaded_xlsx: the original upload name + the on-disk path.
  originalFileName: text("original_file_name"),
  storedFilePath: text("stored_file_path"),
  // Which sheet/tab to read (XLSX only; null = first sheet).
  sheetName: text("sheet_name"),
  // 0-based index of the header row within the sheet/CSV.
  headerRowIndex: integer("header_row_index").notNull().default(0),
  // 0-based index of the first data row (null = headerRowIndex + 1).
  firstDataRowIndex: integer("first_data_row_index"),
  // { agendaField: spreadsheetHeaderLabel } — see AgendaColumnMapping.
  columnMapping: jsonb("column_mapping").$type<AgendaColumnMapping>(),
  // Split date/time: when set, the startsAt/endsAt mapped column supplies
  // the DATE and these columns supply the TIME (combined at parse time).
  // dateBaseYear/dateBaseMonth complete a day-only date cell ("12th").
  startTimeColumn: text("start_time_column"),
  endTimeColumn: text("end_time_column"),
  dateBaseYear: integer("date_base_year"),
  dateBaseMonth: integer("date_base_month"),
  // Spreadsheet column whose value is the stable external id (priority 1).
  externalIdColumn: text("external_id_column"),
  // IANA timezone for wall-clock date parsing (null = client timezone).
  timezone: text("timezone"),
  // Hint for ambiguous numeric dates: "uk" (d/m/y), "us" (m/d/y), "iso".
  dateFormatHint: text("date_format_hint"),
  timeFormatHint: text("time_format_hint"),
  // manual = only sync on explicit trigger; interval = background ticks.
  syncMode: text("sync_mode").notNull().default("interval"),
  // When true (default), items missing from the source on a sync are
  // deleted. When false they are left in place.
  removeMissingItems: boolean("remove_missing_items").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncOk: boolean("last_sync_ok"),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at"),
  lastItemCount: integer("last_item_count"),
  // Per-row import warnings from the last sync (for the errors view).
  lastSyncWarnings: jsonb("last_sync_warnings").$type<string[]>(),
  // Task #220 — alert when a feed has been failing for a while. The
  // sync engine bumps `consecutiveFailureCount` on every failed pull
  // and resets it to 0 on the next success. Once the count crosses the
  // alert threshold we send a "feed failing" email to the site's alert
  // recipients and flip `failureAlertSent` so we only notify once per
  // outage. A subsequent successful sync sends a one-shot "recovered"
  // email and clears the flag.
  consecutiveFailureCount: integer("consecutive_failure_count").notNull().default(0),
  failureAlertSent: boolean("failure_alert_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agendaSyncConfigsRelations = relations(agendaSyncConfigs, ({ one }) => ({
  client: one(clients, { fields: [agendaSyncConfigs.clientId], references: [clients.id] }),
}));

export const insertAgendaSyncConfigSchema = createInsertSchema(agendaSyncConfigs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastSyncAt: true,
    lastSyncOk: true,
    lastError: true,
    lastErrorAt: true,
    lastItemCount: true,
    consecutiveFailureCount: true,
    failureAlertSent: true,
    lastSyncWarnings: true,
  })
  .extend({
    name: z.string().min(1, "Name is required"),
    sourceType: z.enum(AGENDA_SYNC_SOURCE_TYPES),
    // URL is optional at the schema level so uploaded_xlsx (no URL) and
    // PATCH (.partial()) both validate. URL-based source types get an
    // explicit "URL required + valid" check in the route layer
    // (validateAgendaSourceShape). When present it must be a valid URL.
    sourceUrl: z
      .string()
      .url("Must be a valid URL")
      .optional()
      .nullable(),
    syncIntervalMinutes: z.number().int().min(5).max(60 * 24).default(60),
    enabled: z.boolean().default(true),
    headerRowIndex: z.number().int().min(0).default(0),
    firstDataRowIndex: z.number().int().min(0).optional().nullable(),
    columnMapping: z
      .record(z.enum(AGENDA_MAPPABLE_FIELDS), z.string())
      .optional()
      .nullable(),
    syncMode: z.enum(AGENDA_SYNC_MODES).default("interval"),
    removeMissingItems: z.boolean().default(true),
    timezone: z.string().optional().nullable(),
    dateFormatHint: z.string().optional().nullable(),
    timeFormatHint: z.string().optional().nullable(),
    startTimeColumn: z.string().optional().nullable(),
    endTimeColumn: z.string().optional().nullable(),
    dateBaseYear: z.number().int().min(1970).max(2200).optional().nullable(),
    dateBaseMonth: z.number().int().min(1).max(12).optional().nullable(),
    sheetName: z.string().optional().nullable(),
    externalIdColumn: z.string().optional().nullable(),
    originalFileName: z.string().optional().nullable(),
    storedFilePath: z.string().optional().nullable(),
    // Task #268 — Microsoft Graph-backed source fields.
    microsoftAuth: z.boolean().default(false),
    msDriveId: z.string().optional().nullable(),
    msItemId: z.string().optional().nullable(),
    msSiteId: z.string().optional().nullable(),
  });
export type InsertAgendaSyncConfig = z.infer<typeof insertAgendaSyncConfigSchema>;
export type AgendaSyncConfig = typeof agendaSyncConfigs.$inferSelect;

// Per-screen / per-display configuration for the Agenda Display
// Widget. One config drives one full-screen display URL
// (/display/agenda/:configId). All filters and visual options live
// here so an operator can publish many specialised slices of the
// same agenda pool without duplicating items.
export const AGENDA_DISPLAY_MODES = [
  "full",            // every matching item
  "now_next",        // currently-running + next upcoming (single column)
  "room_focus",      // single-room now/next, large
  "alert",           // delayed/cancelled/moved only
  "today_tomorrow",  // today only; auto-rolls to tomorrow once today's last
                     // session has ended (Task #240)
] as const;
export type AgendaDisplayMode = (typeof AGENDA_DISPLAY_MODES)[number];

// Operator-facing labels for the display-mode picker. The raw enum
// keys (e.g. "now_next") are not what we want to show in the UI.
export const AGENDA_DISPLAY_MODE_LABELS: Record<AgendaDisplayMode, string> = {
  full: "Full agenda",
  now_next: "Now / next",
  room_focus: "Single-room focus",
  alert: "Alerts only (delayed / cancelled / moved)",
  today_tomorrow: "Today / tomorrow (auto-roll)",
};

// Manual "What's on" day filter — scopes the board to a single day or
// window, independent of the display mode. Applied in every display
// mode EXCEPT today_tomorrow (which owns its own auto-rolling day
// logic). "specific_date" reads the companion dayFilterDate value.
export const AGENDA_DAY_FILTERS = [
  "all",            // no day filter (current behaviour)
  "today",
  "tomorrow",
  "this_week",      // Monday–Sunday of the current site-tz week
  "specific_date",  // a single calendar day from dayFilterDate
] as const;
export type AgendaDayFilter = (typeof AGENDA_DAY_FILTERS)[number];

export const AGENDA_DAY_FILTER_LABELS: Record<AgendaDayFilter, string> = {
  all: "All days",
  today: "Today",
  tomorrow: "Tomorrow",
  this_week: "This week",
  specific_date: "A specific date",
};

export const AGENDA_LAYOUT_MODES = [
  "auto",
  "landscape",
  "portrait",
  "totem",
  "ultrawide",
  "room_door",
] as const;
export type AgendaLayoutMode = (typeof AGENDA_LAYOUT_MODES)[number];

export const AGENDA_FONT_SCALES = ["small", "normal", "large", "xlarge"] as const;
export type AgendaFontScale = (typeof AGENDA_FONT_SCALES)[number];

export const AGENDA_DENSITIES = ["compact", "normal", "spacious"] as const;
export type AgendaDensity = (typeof AGENDA_DENSITIES)[number];

export const AGENDA_THEMES = ["dark", "light"] as const;
export type AgendaTheme = (typeof AGENDA_THEMES)[number];

// Curated system / web-safe font stacks for the agenda widget.
// We store just the KEY in the DB so we can adjust the underlying
// stack later without rewriting rows. `null` / undefined falls back
// to the built-in default (Inter).
export const AGENDA_FONT_FAMILIES = [
  "system",
  "inter",
  "sans",
  "serif",
  "times",
  "mono",
] as const;
export type AgendaFontFamily = (typeof AGENDA_FONT_FAMILIES)[number];

export const AGENDA_FONT_FAMILY_STACKS: Record<AgendaFontFamily, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  sans: 'Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  mono: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
};

export const AGENDA_FONT_FAMILY_LABELS: Record<AgendaFontFamily, string> = {
  system: "System default",
  inter: "Inter",
  sans: "Helvetica / Arial",
  serif: "Georgia",
  times: "Times New Roman",
  mono: "Monospace",
};

// Default font stack when no fontFamily is selected on a config
// (preserves the original hardcoded look).
export const AGENDA_DEFAULT_FONT_STACK = AGENDA_FONT_FAMILY_STACKS.inter;

// Hex-colour validator reused by all four nullable role colours.
// Accepts `#rgb` or `#rrggbb`, case-insensitive.
const HEX_COLOUR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const agendaWidgetConfigs = pgTable("agenda_widget_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayMode: text("display_mode").notNull().default("full"),
  layoutMode: text("layout_mode").notNull().default("auto"),
  roomFilter: text("room_filter").array().notNull().default(sql`'{}'::text[]`),
  trackFilter: text("track_filter").array().notNull().default(sql`'{}'::text[]`),
  statusFilter: text("status_filter").array().notNull().default(sql`'{}'::text[]`),
  // Manual "What's on" day filter (see AGENDA_DAY_FILTERS). Default
  // "all" so existing configs are unchanged. dayFilterDate holds the
  // YYYY-MM-DD target only when dayFilter = "specific_date".
  dayFilter: text("day_filter").notNull().default("all"),
  dayFilterDate: text("day_filter_date"),
  // Optional rolling window. If set, only items whose startsAt is
  // within ±timeWindowMinutes of "now" are shown. Null = no window.
  timeWindowMinutes: integer("time_window_minutes"),
  refreshIntervalSeconds: integer("refresh_interval_seconds").notNull().default(30),
  rotationIntervalSeconds: integer("rotation_interval_seconds").notNull().default(12),
  maxItemsPerPage: integer("max_items_per_page").notNull().default(8),
  fontScale: text("font_scale").notNull().default("normal"),
  density: text("density").notNull().default("normal"),
  theme: text("theme").notNull().default("dark"),
  accentColor: text("accent_color").notNull().default("#0ea5e9"),
  // Optional typography & role-colour overrides. All nullable so
  // existing rows render identically (fall back to theme defaults
  // + the built-in Inter stack). See AGENDA_FONT_FAMILY_STACKS for
  // the curated key → CSS stack mapping.
  fontFamily: text("font_family"),
  titleColor: text("title_color"),
  bodyColor: text("body_color"),
  timeColor: text("time_color"),
  statusColor: text("status_color"),
  // Per-element text-size multipliers (relative to the responsive base
  // font scale). All nullable so existing rows render identically — the
  // renderer falls back to the built-in defaults (time 1.15, date 0.6,
  // title 1.15, body 0.75) when a value is unset. Operators can set the
  // time and day/date to the same value to make them the same size.
  timeScale: real("time_scale"),
  dateScale: real("date_scale"),
  titleScale: real("title_scale"),
  bodyScale: real("body_scale"),
  // Independent header-corner sizes (separate from the per-session card
  // roles above). Nullable so existing rows keep the built-in defaults
  // (header date 0.9, header clock 1.3).
  headerDateScale: real("header_date_scale"),
  headerClockScale: real("header_clock_scale"),
  backgroundUrl: text("background_url"),
  eventName: text("event_name"),
  showDescription: boolean("show_description").notNull().default(true),
  showPresenter: boolean("show_presenter").notNull().default(true),
  showRoom: boolean("show_room").notNull().default(true),
  showStatus: boolean("show_status").notNull().default(true),
  showCurrentTime: boolean("show_current_time").notNull().default(true),
  showEventName: boolean("show_event_name").notNull().default(true),
  // Task #240 — optional day-name / date header chunks. Default off so
  // existing configs render identically after migration.
  showDayName: boolean("show_day_name").notNull().default(false),
  showDate: boolean("show_date").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agendaWidgetConfigsRelations = relations(agendaWidgetConfigs, ({ one }) => ({
  client: one(clients, { fields: [agendaWidgetConfigs.clientId], references: [clients.id] }),
}));

export const insertAgendaWidgetConfigSchema = createInsertSchema(agendaWidgetConfigs)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1, "Name is required"),
    displayMode: z.enum(AGENDA_DISPLAY_MODES).default("full"),
    layoutMode: z.enum(AGENDA_LAYOUT_MODES).default("auto"),
    fontScale: z.enum(AGENDA_FONT_SCALES).default("normal"),
    density: z.enum(AGENDA_DENSITIES).default("normal"),
    theme: z.enum(AGENDA_THEMES).default("dark"),
    refreshIntervalSeconds: z.number().int().min(5).max(3600).default(30),
    rotationIntervalSeconds: z.number().int().min(3).max(3600).default(12),
    maxItemsPerPage: z.number().int().min(1).max(50).default(8),
    timeWindowMinutes: z.number().int().min(1).max(60 * 24).nullable().optional(),
    roomFilter: z.array(z.string()).default([]),
    trackFilter: z.array(z.string()).default([]),
    statusFilter: z.array(z.enum(AGENDA_STATUSES)).default([]),
    dayFilter: z.enum(AGENDA_DAY_FILTERS).default("all"),
    dayFilterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date like 2026-09-12").nullable().optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0ea5e9"),
    // Task #281: accept any built-in font key OR a `custom:<id>` reference.
    // Kept as a permissive string so the expanded library and per-client
    // uploaded fonts validate without re-listing every key here. Resolution
    // (and fallback for unknown keys) happens in shared/fonts.ts.
    fontFamily: z.string().nullable().optional(),
    titleColor: z.string().regex(HEX_COLOUR_RE, "Must be a hex colour like #ffffff").nullable().optional(),
    bodyColor: z.string().regex(HEX_COLOUR_RE, "Must be a hex colour like #ffffff").nullable().optional(),
    timeColor: z.string().regex(HEX_COLOUR_RE, "Must be a hex colour like #ffffff").nullable().optional(),
    statusColor: z.string().regex(HEX_COLOUR_RE, "Must be a hex colour like #ffffff").nullable().optional(),
    // Per-element size multipliers. Bounded to keep text legible (and to
    // stay within the auto-fit packer's measured range). Null = use the
    // renderer's built-in default for that role.
    timeScale: z.number().min(0.3).max(4).nullable().optional(),
    dateScale: z.number().min(0.3).max(4).nullable().optional(),
    titleScale: z.number().min(0.3).max(4).nullable().optional(),
    bodyScale: z.number().min(0.3).max(4).nullable().optional(),
    headerDateScale: z.number().min(0.3).max(4).nullable().optional(),
    headerClockScale: z.number().min(0.3).max(4).nullable().optional(),
  });
export type InsertAgendaWidgetConfig = z.infer<typeof insertAgendaWidgetConfigSchema>;
export type AgendaWidgetConfig = typeof agendaWidgetConfigs.$inferSelect;

// ============ WORLD FOOTBALL SWEEPSTAKE WALL (Task #286) ============
// A self-contained signage widget that randomly assigns staff to
// tournament teams and shows live tournament progress, sweepstake
// assignments, eliminations and a winner celebration. Tournament data
// (teams/matches/standings) is cached external data scoped to the owning
// config; configs + participants are tenant-scoped via clientId so data
// cannot leak across sites.

// Data providers. Keys live ONLY in server-side env vars and are never
// returned to the frontend. "manual" needs no key — operators type the
// teams/results in by hand.
export const SWEEPSTAKE_PROVIDERS = [
  "manual",
  "football_data",
  "api_football",
  "sportmonks",
] as const;
export type SweepstakeProvider = (typeof SWEEPSTAKE_PROVIDERS)[number];

export const SWEEPSTAKE_PROVIDER_LABELS: Record<SweepstakeProvider, string> = {
  manual: "Manual (type results in by hand)",
  football_data: "football-data.org",
  api_football: "API-Football (API-Sports)",
  sportmonks: "Sportmonks",
};

// The env var that holds each provider's API key. Surfaced to the admin UI
// so operators know which secret to set, but the value is never exposed.
export const SWEEPSTAKE_PROVIDER_ENV_VARS: Record<SweepstakeProvider, string | null> = {
  manual: null,
  football_data: "FOOTBALL_DATA_API_KEY",
  api_football: "API_FOOTBALL_KEY",
  sportmonks: "SPORTMONKS_API_TOKEN",
};

export const SWEEPSTAKE_LAYOUT_MODES = [
  "auto",
  "landscape",
  "portrait",
  "totem",
  "ultrawide",
  "room_door",
] as const;
export type SweepstakeLayoutMode = (typeof SWEEPSTAKE_LAYOUT_MODES)[number];

export const SWEEPSTAKE_THEMES = ["bright", "dark", "stadium"] as const;
export type SweepstakeTheme = (typeof SWEEPSTAKE_THEMES)[number];

// The rotating slide types shown on the display. Operators can choose a
// subset; an empty list means "show all".
export const SWEEPSTAKE_SLIDE_TYPES = [
  "countdown",
  "fixtures",
  "results",
  "standings",
  "bracket",
  "sweepstake",
  "rivalries",
  "survivors",
  "eliminations",
  "spotlight",
  "winner",
] as const;
export type SweepstakeSlideType = (typeof SWEEPSTAKE_SLIDE_TYPES)[number];

export const SWEEPSTAKE_SLIDE_LABELS: Record<SweepstakeSlideType, string> = {
  countdown: "Kick-off countdown",
  fixtures: "Today's fixtures",
  results: "Recent results",
  standings: "Group tables",
  bracket: "Knockout bracket",
  sweepstake: "Sweepstake wall",
  rivalries: "Office rivalries",
  survivors: "Survivor board",
  eliminations: "Elimination wall",
  spotlight: "All teams",
  winner: "Winner celebration",
};

// Task #287 — live World Cup panels that can be mixed into the rotation. These
// are NOT persisted in `slideTypes`; they are driven by `livePanels` below and
// only appear when the config uses Sportmonks and live data is available.
export const SWEEPSTAKE_LIVE_PANELS = ["now_next", "live_score", "live_standings"] as const;
export type SweepstakeLivePanel = (typeof SWEEPSTAKE_LIVE_PANELS)[number];

export const SWEEPSTAKE_LIVE_PANEL_LABELS: Record<SweepstakeLivePanel, string> = {
  now_next: "Now / Next match",
  live_score: "Live score & event ticker",
  live_standings: "Live group standings",
};

// The sweepstake "wall loop" is an ordered list of slides. Each item is either
// a built-in slide (filtered out when it has no content) or a custom media slide
// picked from the media library. Persisted on `slideOrder` (JSONB). When empty,
// the display falls back to the legacy `slideTypes` behaviour (built-ins only).
export const sweepstakeBuiltinSlideSchema = z.object({
  kind: z.literal("builtin"),
  type: z.enum(SWEEPSTAKE_SLIDE_TYPES),
  enabled: z.boolean().default(true),
});
export const sweepstakeMediaSlideSchema = z.object({
  kind: z.literal("media"),
  // Stable id for React keys / drag-reorder (not the media asset id).
  id: z.string().min(1),
  mediaId: z.string().min(1),
  // How long an image/gif slide shows. Videos play to their natural end.
  durationSeconds: z.number().int().min(1).max(3600).default(12),
  // true = muted (default). Operators opt in to sound per slide.
  mute: z.boolean().default(true),
  // true = render edge-to-edge (no tournament header / page dots chrome).
  fullScreen: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export const sweepstakeLoopItemSchema = z.discriminatedUnion("kind", [
  sweepstakeBuiltinSlideSchema,
  sweepstakeMediaSlideSchema,
]);
export type SweepstakeLoopItem = z.infer<typeof sweepstakeLoopItemSchema>;

export const SWEEPSTAKE_PARTICIPANT_STATUSES = ["active", "eliminated", "winner"] as const;
export type SweepstakeParticipantStatus = (typeof SWEEPSTAKE_PARTICIPANT_STATUSES)[number];

export const SWEEPSTAKE_MATCH_STATUSES = ["scheduled", "in_play", "finished"] as const;
export type SweepstakeMatchStatus = (typeof SWEEPSTAKE_MATCH_STATUSES)[number];

export const sweepstakeWidgetConfigs = pgTable("sweepstake_widget_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Neutral tournament name shown on screen (no licensed branding).
  tournamentName: text("tournament_name").notNull().default("World Football Sweepstake"),
  provider: text("provider").notNull().default("manual"),
  // Provider-specific competition identifier (e.g. football-data "WC").
  competitionCode: text("competition_code"),
  season: text("season"),
  // Optional first-match kick-off for the countdown slide.
  kickoffAt: timestamp("kickoff_at"),
  // Display behaviour.
  layoutMode: text("layout_mode").notNull().default("auto"),
  theme: text("theme").notNull().default("bright"),
  accentColor: text("accent_color").notNull().default("#16a34a"),
  refreshIntervalSeconds: integer("refresh_interval_seconds").notNull().default(30),
  rotationIntervalSeconds: integer("rotation_interval_seconds").notNull().default(12),
  // Which slides to rotate through. Empty = all.
  slideTypes: text("slide_types").array().notNull().default(sql`'{}'::text[]`),
  // Ordered wall-loop: built-in slides + custom media slides, mixed and
  // reorderable. Empty = fall back to legacy `slideTypes` (built-ins only).
  slideOrder: jsonb("slide_order").$type<SweepstakeLoopItem[]>().notNull().default(sql`'[]'::jsonb`),
  // Task #287 — live World Cup panels (Sportmonks only). Additive.
  liveEnabled: boolean("live_enabled").notNull().default(false),
  // Which live panels to mix into the rotation. Empty = all live panels.
  livePanels: text("live_panels").array().notNull().default(sql`'{}'::text[]`),
  // How often the display re-polls for live data (seconds).
  liveRefreshSeconds: integer("live_refresh_seconds").notNull().default(15),
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncError: text("last_sync_error"),
  // Task #287 — automatic periodic provider sync (additive).
  autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(false),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tournamentTeams = pgTable("tournament_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull().references(() => sweepstakeWidgetConfigs.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  name: text("name").notNull(),
  shortName: text("short_name"),
  // ISO 3166-1 alpha-2 country code for a fallback flag image.
  countryCode: text("country_code"),
  groupName: text("group_name"),
  crestUrl: text("crest_url"),
  eliminated: boolean("eliminated").notNull().default(false),
  eliminatedAt: timestamp("eliminated_at"),
  isWinner: boolean("is_winner").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tournamentMatches = pgTable("tournament_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull().references(() => sweepstakeWidgetConfigs.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  stage: text("stage"),
  groupName: text("group_name"),
  homeTeamId: varchar("home_team_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
  awayTeamId: varchar("away_team_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
  homeTeamName: text("home_team_name"),
  awayTeamName: text("away_team_name"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  penaltyHomeScore: integer("penalty_home_score"),
  penaltyAwayScore: integer("penalty_away_score"),
  status: text("status").notNull().default("scheduled"),
  kickoffAt: timestamp("kickoff_at"),
  winnerTeamId: varchar("winner_team_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tournamentStandings = pgTable("tournament_standings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull().references(() => sweepstakeWidgetConfigs.id, { onDelete: "cascade" }),
  teamId: varchar("team_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
  teamName: text("team_name").notNull(),
  groupName: text("group_name"),
  position: integer("position"),
  played: integer("played").notNull().default(0),
  won: integer("won").notNull().default(0),
  draw: integer("draw").notNull().default(0),
  lost: integer("lost").notNull().default(0),
  goalsFor: integer("goals_for").notNull().default(0),
  goalsAgainst: integer("goals_against").notNull().default(0),
  goalDifference: integer("goal_difference").notNull().default(0),
  points: integer("points").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sweepstakeParticipants = pgTable("sweepstake_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull().references(() => sweepstakeWidgetConfigs.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  department: text("department"),
  teamId: varchar("team_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  // When true, the random-assign pass leaves this person's team alone.
  manualOverride: boolean("manual_override").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sweepstakeWidgetConfigsRelations = relations(sweepstakeWidgetConfigs, ({ one, many }) => ({
  client: one(clients, { fields: [sweepstakeWidgetConfigs.clientId], references: [clients.id] }),
  teams: many(tournamentTeams),
  matches: many(tournamentMatches),
  standings: many(tournamentStandings),
  participants: many(sweepstakeParticipants),
}));

export const insertSweepstakeWidgetConfigSchema = createInsertSchema(sweepstakeWidgetConfigs)
  .omit({ id: true, createdAt: true, updatedAt: true, lastSyncedAt: true, lastSyncError: true })
  .extend({
    name: z.string().min(1, "Name is required"),
    tournamentName: z.string().min(1).default("World Football Sweepstake"),
    provider: z.enum(SWEEPSTAKE_PROVIDERS).default("manual"),
    competitionCode: z.string().nullable().optional(),
    season: z.string().nullable().optional(),
    kickoffAt: z.coerce.date().nullable().optional(),
    layoutMode: z.enum(SWEEPSTAKE_LAYOUT_MODES).default("auto"),
    theme: z.enum(SWEEPSTAKE_THEMES).default("bright"),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#16a34a"),
    refreshIntervalSeconds: z.number().int().min(5).max(3600).default(30),
    rotationIntervalSeconds: z.number().int().min(3).max(3600).default(12),
    slideTypes: z.array(z.enum(SWEEPSTAKE_SLIDE_TYPES)).default([]),
    slideOrder: z.array(sweepstakeLoopItemSchema).default([]),
    liveEnabled: z.boolean().default(false),
    livePanels: z.array(z.enum(SWEEPSTAKE_LIVE_PANELS)).default([]),
    liveRefreshSeconds: z.number().int().min(5).max(300).default(15),
    autoSyncEnabled: z.boolean().default(false),
    syncIntervalMinutes: z.number().int().min(5).max(1440).default(30),
  });
export type InsertSweepstakeWidgetConfig = z.infer<typeof insertSweepstakeWidgetConfigSchema>;
export type SweepstakeWidgetConfig = typeof sweepstakeWidgetConfigs.$inferSelect;

export const insertTournamentTeamSchema = createInsertSchema(tournamentTeams)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1, "Team name is required"),
    countryCode: z.string().max(3).nullable().optional(),
  });
export type InsertTournamentTeam = z.infer<typeof insertTournamentTeamSchema>;
export type TournamentTeam = typeof tournamentTeams.$inferSelect;

export const insertTournamentMatchSchema = createInsertSchema(tournamentMatches)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(SWEEPSTAKE_MATCH_STATUSES).default("scheduled"),
    kickoffAt: z.coerce.date().nullable().optional(),
  });
export type InsertTournamentMatch = z.infer<typeof insertTournamentMatchSchema>;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;

export const insertTournamentStandingSchema = createInsertSchema(tournamentStandings)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    teamName: z.string().min(1),
  });
export type InsertTournamentStanding = z.infer<typeof insertTournamentStandingSchema>;
export type TournamentStanding = typeof tournamentStandings.$inferSelect;

export const insertSweepstakeParticipantSchema = createInsertSchema(sweepstakeParticipants)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1, "Name is required"),
    email: z.string().email().nullable().optional().or(z.literal("")),
    status: z.enum(SWEEPSTAKE_PARTICIPANT_STATUSES).default("active"),
  });
export type InsertSweepstakeParticipant = z.infer<typeof insertSweepstakeParticipantSchema>;
export type SweepstakeParticipant = typeof sweepstakeParticipants.$inferSelect;

// ============ PLAYER CONTENT API CONTRACT ============
// Shape of the JSON payload returned by GET /api/player/:screenId/content
// (see server/routes.ts ~3493-3713). Declared here so the player client
// (client/src/pages/player.tsx) and the server response builder share a
// single source of truth — adding/removing a field on either side will
// surface as a TS error on the other.

export interface PlayerVarsData {
  screenName?: string | null;
  roomName?: string | null;
  eventName?: string | null;
  clientName?: string | null;
  roomCapacity?: number | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  nextSessionTitle?: string | null;
  nextSessionTime?: string | null;
  nextSessionCountdown?: string | null;
  weatherSummary?: string | null;
}

export interface PlayerContentResponse {
  screen: Screen;
  profile: DisplayProfile | null;
  layout: LayoutTemplate | null;
  media: MediaAsset[];
  // Task #281 — per-site custom fonts so the player can inject @font-face
  // and the service worker can cache the files for offline rendering.
  fonts?: { id: string; familyId: string; name: string; weight?: number | null; style?: string | null; format?: string | null }[];
  playlists: Playlist[];
  playlistItems: Record<string, PlaylistItem[]>;
  layoutTemplates?: Record<string, LayoutTemplate>;
  zoneSources?: Array<{ zoneId: string; type: string; playlistId?: string; agendaConfigId?: string }>;
  liveOverride: LiveOverride | null;
  event: Event | null;
  client?: Client | null;
  playerVars?: PlayerVarsData;
  timestamp: string;
  screenshotEnabled?: boolean;
  screenshotRequested?: boolean;
  // Server-driven full-page reload signal. Set to true by the player
  // content endpoint when the operator has bumped the screen's
  // `refreshRequestedAt` after this client last fetched; the player
  // listens for this on the next poll and triggers a full window
  // reload so layout/code changes take effect immediately.
  refreshRequested?: boolean;
  // Task #193 — server's `Date.now()` (epoch ms) at the moment the
  // response was sent, used by the player to compute an NTP-style
  // offset against its own (potentially-wrong) system clock so the
  // ClockWidget / CountdownWidget / {{time}} render real wall-clock
  // time even if the device's RTC is hours off. Always present for
  // freshly-served responses; absent on cached fallback responses
  // from older server versions.
  serverTime?: number;
  // Implicit-canvas pairing (Task #173). Present when the polled
  // screen belongs to a multi-tile canvas group; the single Pi paired
  // against the wall composites every tile in one frame. Each tile
  // carries its own resolved layout / zoneSources / liveOverride /
  // profile so a tile can render different content from its siblings
  // when bookings target tiles individually. Null for non-canvas
  // screens and for canvas-enabled screens with only one member.
  canvas?: {
    ownerScreenId: string;
    width: number;
    height: number;
    tiles: Array<{
      screenId: string;
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layout: LayoutTemplate | null;
      zoneSources: Array<{ zoneId: string; type: string; playlistId?: string }>;
      liveOverride: LiveOverride | null;
      profile: DisplayProfile | null;
    }>;
  } | null;
}

// ============ SHARED CACHE (Task #290) ============
//
// ============ MONITOR SESSIONS (Task #330) ============
//
// A monitor session grants a short-lived, read-only view of a screen's live
// content to external operational clients (VectorMesh Multiview, etc.)
// WITHOUT sharing any physical player credentials (deviceToken, pairingCode)
// or affecting the physical player's heartbeat/pairing state.
//
// Two-token security model:
//   bootstrapToken  — 32-byte opaque random; single-use; never stored raw
//                     (tokenHash = SHA-256(bootstrapToken) lives in this row)
//   sessionSecret   — 32-byte opaque random generated at bootstrap exchange;
//                     stored as HttpOnly SameSite=Strict cookie; never logged
//                     (sessionSecretHash = SHA-256(secret) lives in this row)
//
// Auth flow:
//   1. POST /api/operations/screens/:id/monitor-session → { monitorUrl }
//   2. GET  /monitor-bootstrap/:screenId?token=<bootstrapToken>
//      → sets cookie, bootstrapUsedAt stamped atomically, redirect to /monitor/:screenId
//   3. GET  /monitor/:screenId (cookie auth) → React shell with mode=monitor
//   4. GET  /api/monitor/:screenId/content (cookie auth) → player content
//
export const monitorSessions = pgTable("monitor_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  // SHA-256 of the 32-byte bootstrap token. The raw token is never stored.
  tokenHash: varchar("token_hash").notNull().unique(),
  // SHA-256 of the 32-byte monitor-session cookie secret.
  // null until the bootstrap exchange has been completed.
  sessionSecretHash: varchar("session_secret_hash"),
  // Stamped atomically on first (and only) bootstrap exchange. Subsequent
  // requests with the same bootstrap URL receive a generic 401.
  bootstrapUsedAt: timestamp("bootstrap_used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  lastAccessAt: timestamp("last_access_at"),
  // Optional human-readable labels so admins can see what created the session.
  clientType: text("client_type"),
  clientName: text("client_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MonitorSession = typeof monitorSessions.$inferSelect;
export type InsertMonitorSession = {
  userId: string;
  screenId: string;
  clientId?: string | null;
  tokenHash: string;
  expiresAt: Date;
  clientType?: string | null;
  clientName?: string | null;
};

// ============ SHARED CACHE ============
// PostgreSQL-backed shared (L2) cache for external data (Sportmonks,
// agenda spreadsheets, Google Sheets, Microsoft/SharePoint) and computed
// widget/display payloads. It sits BEHIND the existing fast in-memory
// (L1) caches and gives cross-process last-known-good storage so display
// screens never block on a slow/failing provider.
//
// Entries are addressed by (namespace, cache_key). The cache_key MUST
// encode the owning clientId/configId for any per-site payload so a
// cached row can never leak across tenants (see server/sharedCache.ts
// buildCacheKey). Secrets/tokens/signed URLs must never be persisted into
// any column here — sanitise before writing.
export const sharedCache = pgTable(
  "shared_cache",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    // Logical bucket, e.g. "sportmonks", "agenda", "sweepstake_display".
    namespace: text("namespace").notNull(),
    // Fully-qualified key within the namespace (tenant-scoped where relevant).
    cacheKey: text("cache_key").notNull(),
    // Structured payload (preferred). value_text is for raw text snapshots
    // (e.g. CSV) too large/awkward for JSON.
    valueJson: jsonb("value_json"),
    valueText: text("value_text"),
    // When the entry goes stale. null = never expires.
    expiresAt: timestamp("expires_at"),
    // When the value was last successfully refreshed.
    lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
    // Human-readable origin (sanitised), e.g. "sportmonks:inplay".
    source: text("source"),
    // fresh | stale | expired | error
    status: text("status").notNull().default("fresh"),
    // Sanitised last error message when a refresh failed.
    errorMessage: text("error_message"),
    // Small sanitised metadata bag (counts, flags) — never secrets.
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    namespaceKeyUnique: uniqueIndex("shared_cache_namespace_key_unique").on(
      table.namespace,
      table.cacheKey,
    ),
    namespaceIdx: index("shared_cache_namespace_idx").on(table.namespace),
    cacheKeyIdx: index("shared_cache_cache_key_idx").on(table.cacheKey),
    expiresAtIdx: index("shared_cache_expires_at_idx").on(table.expiresAt),
    statusIdx: index("shared_cache_status_idx").on(table.status),
    lastUpdatedAtIdx: index("shared_cache_last_updated_at_idx").on(table.lastUpdatedAt),
  }),
);

export const SHARED_CACHE_STATUSES = ["fresh", "stale", "expired", "error"] as const;
export type SharedCacheStatus = (typeof SHARED_CACHE_STATUSES)[number];

export const insertSharedCacheSchema = createInsertSchema(sharedCache)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    namespace: z.string().min(1),
    cacheKey: z.string().min(1),
    status: z.enum(SHARED_CACHE_STATUSES).default("fresh"),
  });

export type SharedCacheEntry = typeof sharedCache.$inferSelect;
export type InsertSharedCacheEntry = z.infer<typeof insertSharedCacheSchema>;

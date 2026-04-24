import { db } from "./db";
import { eq, and, asc, desc, gte, lte, lt, inArray, isNotNull, sql, count } from "drizzle-orm";
import {
  clients,
  events,
  brandPacks,
  displayProfiles,
  screenGroups,
  screens,
  screenGroupMemberships,
  screenEventBookings,
  mediaAssets,
  mediaShares,
  layoutTemplates,
  programmes,
  programmeVersions,
  scheduleBlocks,
  playlists,
  playlistItems,
  screenPresets,
  liveOverrides,
  playerHeartbeats,
  auditLogs,
  alertSettings,
  alertHistory,
  type Client,
  type InsertClient,
  type Event,
  type InsertEvent,
  type BrandPack,
  type InsertBrandPack,
  type DisplayProfile,
  type InsertDisplayProfile,
  type ScreenGroup,
  type InsertScreenGroup,
  type Screen,
  type InsertScreen,
  type MediaAsset,
  type InsertMediaAsset,
  type MediaShare,
  type InsertMediaShare,
  type LayoutTemplate,
  type InsertLayoutTemplate,
  type Programme,
  type InsertProgramme,
  type ProgrammeVersion,
  type InsertProgrammeVersion,
  type ScheduleBlock,
  type InsertScheduleBlock,
  type Playlist,
  type InsertPlaylist,
  type LiveOverride,
  type InsertLiveOverride,
  type PlayerHeartbeat,
  type InsertPlayerHeartbeat,
  type AuditLog,
  type InsertAuditLog,
  type PlaylistItem,
  type InsertPlaylistItem,
  type AlertSetting,
  type AlertHistory,
  type ScreenPreset,
  type InsertScreenPreset,
  type ScreenEventBooking,
  type InsertScreenEventBooking,
  systemSettings,
  type SystemSetting,
} from "@shared/schema";
import { users, userSites, passwordResetTokens, type User, type UpsertUser, type UserSite, type PasswordResetToken } from "@shared/models/auth";
import { apiTokens, apiTokenKnownIps, type ApiToken, type InsertApiToken } from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(data: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  setUserPassword(id: string, passwordHash: string): Promise<void>;
  deleteUser(id: string): Promise<boolean>;

  // Password Reset Tokens
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: string): Promise<void>;

  // User-Site assignments
  getUserSites(userId: string): Promise<UserSite[]>;
  getUserClientIds(userId: string): Promise<string[]>;
  addUserToSite(userId: string, clientId: string): Promise<UserSite>;
  removeUserFromSite(userId: string, clientId: string): Promise<boolean>;

  // Clients
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Events
  getEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(data: InsertEvent): Promise<Event>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;

  // Brand Packs
  getBrandPacks(): Promise<BrandPack[]>;
  getBrandPack(id: string): Promise<BrandPack | undefined>;
  createBrandPack(data: InsertBrandPack): Promise<BrandPack>;
  updateBrandPack(id: string, data: Partial<InsertBrandPack>): Promise<BrandPack | undefined>;
  deleteBrandPack(id: string): Promise<boolean>;

  // Display Profiles
  getDisplayProfiles(): Promise<DisplayProfile[]>;
  getDisplayProfile(id: string): Promise<DisplayProfile | undefined>;
  createDisplayProfile(data: InsertDisplayProfile): Promise<DisplayProfile>;
  updateDisplayProfile(id: string, data: Partial<InsertDisplayProfile>): Promise<DisplayProfile | undefined>;
  deleteDisplayProfile(id: string): Promise<boolean>;

  // Screen Groups
  getScreenGroups(): Promise<ScreenGroup[]>;
  getScreenGroupsWithMemberCounts(): Promise<(ScreenGroup & { memberCount: number })[]>;
  getScreenGroup(id: string): Promise<ScreenGroup | undefined>;
  createScreenGroup(data: InsertScreenGroup): Promise<ScreenGroup>;
  updateScreenGroup(id: string, data: Partial<InsertScreenGroup>): Promise<ScreenGroup | undefined>;
  deleteScreenGroup(id: string): Promise<boolean>;

  // Screen Group Memberships
  getGroupMembers(groupId: string): Promise<Screen[]>;
  getScreenGroupIds(screenId: string): Promise<string[]>;
  getAllScreenGroupMemberships(): Promise<{ screenId: string; groupId: string }[]>;
  addScreenToGroup(groupId: string, screenId: string): Promise<void>;
  removeScreenFromGroup(groupId: string, screenId: string): Promise<boolean>;

  // Screens
  getScreens(): Promise<Screen[]>;
  getScreen(id: string): Promise<Screen | undefined>;
  getScreenByPairingCode(code: string): Promise<Screen | undefined>;
  getScreenByDeviceToken(token: string): Promise<Screen | undefined>;
  unpairScreen(id: string, newPairingCode: string): Promise<Screen | undefined>;
  markStaleScreensOffline(staleThresholdMs: number): Promise<Screen[]>;
  createScreen(data: InsertScreen): Promise<Screen>;
  updateScreen(id: string, data: Partial<InsertScreen>): Promise<Screen | undefined>;
  deleteScreen(id: string): Promise<boolean>;
  reorderScreens(orderedIds: string[]): Promise<void>;
  duplicateScreen(sourceId: string, name: string): Promise<Screen | undefined>;

  // Screen Event Bookings
  getScreenEventBookings(filter?: { screenId?: string; eventId?: string }): Promise<ScreenEventBooking[]>;
  getScreenEventBooking(id: string): Promise<ScreenEventBooking | undefined>;
  createScreenEventBooking(data: InsertScreenEventBooking): Promise<ScreenEventBooking>;
  updateScreenEventBooking(id: string, data: Partial<InsertScreenEventBooking>): Promise<ScreenEventBooking | undefined>;
  deleteScreenEventBooking(id: string): Promise<boolean>;
  // Returns the event currently booked on the screen at `now`, if any.
  getCurrentEventForScreen(screenId: string, now?: Date): Promise<Event | undefined>;

  // Media Assets
  getMediaAssets(): Promise<MediaAsset[]>;
  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  createMediaAsset(data: InsertMediaAsset): Promise<MediaAsset>;
  updateMediaAsset(id: string, data: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined>;
  deleteMediaAsset(id: string): Promise<boolean>;

  // Media Shares
  getMediaSharesForAsset(mediaAssetId: string): Promise<MediaShare[]>;
  getMediaSharesForClient(clientId: string): Promise<MediaShare[]>;
  createMediaShare(data: InsertMediaShare): Promise<MediaShare>;
  deleteMediaShare(mediaAssetId: string, clientId: string): Promise<boolean>;

  // Layout Templates
  getLayoutTemplates(): Promise<LayoutTemplate[]>;
  getLayoutTemplate(id: string): Promise<LayoutTemplate | undefined>;
  createLayoutTemplate(data: InsertLayoutTemplate): Promise<LayoutTemplate>;
  updateLayoutTemplate(id: string, data: Partial<InsertLayoutTemplate>): Promise<LayoutTemplate | undefined>;
  deleteLayoutTemplate(id: string): Promise<boolean>;

  // Programmes
  getProgrammes(): Promise<Programme[]>;
  getProgramme(id: string): Promise<Programme | undefined>;
  createProgramme(data: InsertProgramme): Promise<Programme>;
  updateProgramme(id: string, data: Partial<InsertProgramme>): Promise<Programme | undefined>;
  deleteProgramme(id: string): Promise<boolean>;

  // Programme Versions
  getProgrammeVersions(): Promise<ProgrammeVersion[]>;
  getProgrammeVersion(id: string): Promise<ProgrammeVersion | undefined>;
  createProgrammeVersion(data: InsertProgrammeVersion): Promise<ProgrammeVersion>;
  updateProgrammeVersion(id: string, data: Partial<InsertProgrammeVersion>): Promise<ProgrammeVersion | undefined>;

  // Playlists
  getPlaylists(): Promise<Playlist[]>;
  getPlaylist(id: string): Promise<Playlist | undefined>;
  createPlaylist(data: InsertPlaylist): Promise<Playlist>;
  updatePlaylist(id: string, data: Partial<InsertPlaylist>): Promise<Playlist | undefined>;
  deletePlaylist(id: string): Promise<boolean>;

  // Playlist Items
  getPlaylistItems(playlistId: string): Promise<PlaylistItem[]>;
  getPlaylistItem(id: string): Promise<PlaylistItem | undefined>;
  createPlaylistItem(data: InsertPlaylistItem): Promise<PlaylistItem>;
  updatePlaylistItem(id: string, data: Partial<InsertPlaylistItem>): Promise<PlaylistItem | undefined>;
  deletePlaylistItem(id: string): Promise<boolean>;

  // Schedule Blocks
  getScheduleBlocks(programmeVersionId: string): Promise<ScheduleBlock[]>;
  getAllScheduleBlocks(): Promise<ScheduleBlock[]>;
  getScheduleBlock(id: string): Promise<ScheduleBlock | undefined>;
  getScheduleBlocksBySeries(seriesId: string): Promise<ScheduleBlock[]>;
  createScheduleBlock(data: InsertScheduleBlock): Promise<ScheduleBlock>;
  updateScheduleBlock(id: string, data: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined>;
  deleteScheduleBlock(id: string): Promise<boolean>;
  deleteScheduleBlocksBySeries(seriesId: string): Promise<number>;

  // Screen Presets
  getScreenPresets(filter?: { screenId?: string; groupId?: string }): Promise<ScreenPreset[]>;
  getScreenPreset(id: string): Promise<ScreenPreset | undefined>;
  createScreenPreset(data: InsertScreenPreset): Promise<ScreenPreset>;
  updateScreenPreset(id: string, data: Partial<InsertScreenPreset>): Promise<ScreenPreset | undefined>;
  deleteScreenPreset(id: string): Promise<boolean>;
  reorderScreenPresets(orderedIds: string[]): Promise<void>;

  // Live Overrides
  getLiveOverrides(): Promise<LiveOverride[]>;
  getLiveOverride(id: string): Promise<LiveOverride | undefined>;
  getLiveOverrideByPresetId(presetId: string): Promise<LiveOverride | undefined>;
  createLiveOverride(data: InsertLiveOverride): Promise<LiveOverride>;
  updateLiveOverride(id: string, data: Partial<InsertLiveOverride>): Promise<LiveOverride | undefined>;
  deleteLiveOverride(id: string): Promise<boolean>;

  // Player Heartbeats
  getPlayerHeartbeats(screenId: string): Promise<PlayerHeartbeat[]>;
  createPlayerHeartbeat(data: InsertPlayerHeartbeat): Promise<PlayerHeartbeat>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(options: { userId?: string; entityType?: string; entityId?: string; action?: string; dateFrom?: Date; dateTo?: Date; limit?: number; offset?: number }): Promise<{ logs: AuditLog[]; total: number }>;
  getAuditLogStats(): Promise<{ loginsToday: number; activeUsersWeek: number; changesThisWeek: number; totalLogs: number }>;
  clearAuditLogs(): Promise<void>;

  // Alert Settings
  getAlertSettings(clientIds?: string[] | null): Promise<AlertSetting[]>;
  getAlertSetting(alertType: string, clientId: string): Promise<AlertSetting | undefined>;
  upsertAlertSetting(alertType: string, clientId: string, data: { enabled: boolean; recipients: string[]; cooldownMinutes: number }): Promise<AlertSetting>;
  getAlertSettingsForType(alertType: string): Promise<AlertSetting[]>;
  createAlertHistoryEntry(data: { alertType: string; entityId: string; recipients: string[]; payload?: any }): Promise<AlertHistory>;
  getRecentAlertHistory(alertType: string, entityId: string, withinMinutes: number): Promise<AlertHistory[]>;
  deleteAlertHistory(alertType: string, entityId: string): Promise<void>;

  // Per-client stats
  getStatsByClient(): Promise<{ clientId: string; clientName: string; screensOnline: number; screensTotal: number; activeEvents: number; mediaCount: number; activeOverrides: number }[]>;

  // System Settings
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
  setSystemSetting(key: string, value: string): Promise<SystemSetting>;

  // API Tokens
  createApiToken(data: InsertApiToken): Promise<ApiToken>;
  getApiTokensByUser(userId: string): Promise<ApiToken[]>;
  getApiToken(id: string): Promise<ApiToken | undefined>;
  getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined>;
  revokeApiToken(id: string): Promise<boolean>;
  touchApiTokenLastUsed(id: string, ip?: string): Promise<void>;
  recordApiTokenIpUse(tokenId: string, ip: string): Promise<{ isNew: boolean }>;
  deleteApiTokenKnownIp(tokenId: string, ip: string): Promise<void>;
  getRecentNewIpEventsForTokens(tokenIds: string[]): Promise<Map<string, { lastIp: string | null; lastAt: Date | null; count: number }>>;
  getLatestAckActorsForTokens(tokenIds: string[]): Promise<Map<string, { at: Date; userId: string | null; firstName: string | null; lastName: string | null; email: string | null }>>;
  acknowledgeApiTokenNewIp(tokenId: string, at: Date): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const { role, ...upsertData } = userData;
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...upsertData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUser(data: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setUserPassword(id: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  // Password Reset Tokens
  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [row] = await db.insert(passwordResetTokens).values({ userId, token, expiresAt }).returning();
    return row;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return row;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
  }

  // User-Site assignments
  async getUserSites(userId: string): Promise<UserSite[]> {
    return db.select().from(userSites).where(eq(userSites.userId, userId));
  }

  async getUserClientIds(userId: string): Promise<string[]> {
    const sites = await db.select({ clientId: userSites.clientId }).from(userSites).where(eq(userSites.userId, userId));
    return sites.map(s => s.clientId);
  }

  async addUserToSite(userId: string, clientId: string): Promise<UserSite> {
    const existing = await db.select().from(userSites).where(and(eq(userSites.userId, userId), eq(userSites.clientId, clientId)));
    if (existing.length > 0) return existing[0];
    const [site] = await db.insert(userSites).values({ userId, clientId }).returning();
    return site;
  }

  async removeUserFromSite(userId: string, clientId: string): Promise<boolean> {
    const result = await db.delete(userSites).where(and(eq(userSites.userId, userId), eq(userSites.clientId, clientId)));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.delete(userSites).where(eq(userSites.userId, id));
    await db.update(liveOverrides).set({ createdById: null }).where(eq(liveOverrides.createdById, id));
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Clients
  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(data: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(data).returning();
    return client;
  }

  async updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [client] = await db
      .update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return client;
  }

  async deleteClient(id: string): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return db.select().from(events).orderBy(desc(events.startDate));
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async createEvent(data: InsertEvent): Promise<Event> {
    const [event] = await db.insert(events).values(data).returning();
    return event;
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const [event] = await db
      .update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return event;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Brand Packs
  async getBrandPacks(): Promise<BrandPack[]> {
    return db.select().from(brandPacks).orderBy(desc(brandPacks.createdAt));
  }

  async getBrandPack(id: string): Promise<BrandPack | undefined> {
    const [pack] = await db.select().from(brandPacks).where(eq(brandPacks.id, id));
    return pack;
  }

  async createBrandPack(data: InsertBrandPack): Promise<BrandPack> {
    const [pack] = await db.insert(brandPacks).values(data).returning();
    return pack;
  }

  async updateBrandPack(id: string, data: Partial<InsertBrandPack>): Promise<BrandPack | undefined> {
    const [pack] = await db
      .update(brandPacks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brandPacks.id, id))
      .returning();
    return pack;
  }

  async deleteBrandPack(id: string): Promise<boolean> {
    const result = await db.delete(brandPacks).where(eq(brandPacks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Display Profiles
  async getDisplayProfiles(): Promise<DisplayProfile[]> {
    return db.select().from(displayProfiles).orderBy(desc(displayProfiles.createdAt));
  }

  async getDisplayProfile(id: string): Promise<DisplayProfile | undefined> {
    const [profile] = await db.select().from(displayProfiles).where(eq(displayProfiles.id, id));
    return profile;
  }

  async createDisplayProfile(data: InsertDisplayProfile): Promise<DisplayProfile> {
    const [profile] = await db.insert(displayProfiles).values(data).returning();
    return profile;
  }

  async updateDisplayProfile(id: string, data: Partial<InsertDisplayProfile>): Promise<DisplayProfile | undefined> {
    const [profile] = await db
      .update(displayProfiles)
      .set(data)
      .where(eq(displayProfiles.id, id))
      .returning();
    return profile;
  }

  async deleteDisplayProfile(id: string): Promise<boolean> {
    const result = await db.delete(displayProfiles).where(eq(displayProfiles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Screen Groups
  async getScreenGroups(): Promise<ScreenGroup[]> {
    return db.select().from(screenGroups).orderBy(desc(screenGroups.createdAt));
  }

  async getScreenGroupsWithMemberCounts(): Promise<(ScreenGroup & { memberCount: number })[]> {
    const groups = await db
      .select({
        id: screenGroups.id,
        clientId: screenGroups.clientId,
        name: screenGroups.name,
        description: screenGroups.description,
        createdAt: screenGroups.createdAt,
        memberCount: count(screenGroupMemberships.id),
      })
      .from(screenGroups)
      .leftJoin(screenGroupMemberships, eq(screenGroups.id, screenGroupMemberships.groupId))
      .groupBy(screenGroups.id)
      .orderBy(desc(screenGroups.createdAt));
    return groups.map(g => ({ ...g, memberCount: Number(g.memberCount) }));
  }

  async getScreenGroup(id: string): Promise<ScreenGroup | undefined> {
    const [group] = await db.select().from(screenGroups).where(eq(screenGroups.id, id));
    return group;
  }

  async createScreenGroup(data: InsertScreenGroup): Promise<ScreenGroup> {
    const [group] = await db.insert(screenGroups).values(data).returning();
    return group;
  }

  async updateScreenGroup(id: string, data: Partial<InsertScreenGroup>): Promise<ScreenGroup | undefined> {
    const [group] = await db
      .update(screenGroups)
      .set(data)
      .where(eq(screenGroups.id, id))
      .returning();
    return group;
  }

  async deleteScreenGroup(id: string): Promise<boolean> {
    const result = await db.delete(screenGroups).where(eq(screenGroups.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Screen Group Memberships
  async getGroupMembers(groupId: string): Promise<Screen[]> {
    const memberships = await db
      .select({ screen: screens })
      .from(screenGroupMemberships)
      .innerJoin(screens, eq(screenGroupMemberships.screenId, screens.id))
      .where(eq(screenGroupMemberships.groupId, groupId))
      .orderBy(screens.name);
    return memberships.map(m => m.screen);
  }

  async getScreenGroupIds(screenId: string): Promise<string[]> {
    const rows = await db
      .select({ groupId: screenGroupMemberships.groupId })
      .from(screenGroupMemberships)
      .where(eq(screenGroupMemberships.screenId, screenId));
    return rows.map(r => r.groupId);
  }

  async getAllScreenGroupMemberships(): Promise<{ screenId: string; groupId: string }[]> {
    const rows = await db
      .select({ screenId: screenGroupMemberships.screenId, groupId: screenGroupMemberships.groupId })
      .from(screenGroupMemberships);
    return rows;
  }

  async addScreenToGroup(groupId: string, screenId: string): Promise<void> {
    await db.insert(screenGroupMemberships).values({ groupId, screenId });
  }

  async removeScreenFromGroup(groupId: string, screenId: string): Promise<boolean> {
    const result = await db
      .delete(screenGroupMemberships)
      .where(
        and(
          eq(screenGroupMemberships.groupId, groupId),
          eq(screenGroupMemberships.screenId, screenId)
        )
      );
    return (result.rowCount ?? 0) > 0;
  }

  // Screens
  async getScreens(): Promise<Screen[]> {
    return db
      .select()
      .from(screens)
      .orderBy(sql`${screens.displayOrder} ASC NULLS LAST`, asc(screens.createdAt));
  }

  async reorderScreens(orderedIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(screens)
          .set({ displayOrder: i })
          .where(eq(screens.id, orderedIds[i]));
      }
    });
  }

  async getScreen(id: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(screens).where(eq(screens.id, id));
    return screen;
  }

  async getScreenByPairingCode(code: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(screens).where(eq(screens.pairingCode, code));
    return screen;
  }

  async getScreenByDeviceToken(token: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(screens).where(eq(screens.deviceToken, token));
    return screen;
  }

  async unpairScreen(id: string, newPairingCode: string): Promise<Screen | undefined> {
    const [screen] = await db
      .update(screens)
      .set({
        isPaired: false,
        isOnline: false,
        deviceToken: null,
        pairingCode: newPairingCode,
        updatedAt: new Date(),
      } as any)
      .where(eq(screens.id, id))
      .returning();
    return screen;
  }

  async markStaleScreensOffline(staleThresholdMs: number): Promise<Screen[]> {
    const cutoff = new Date(Date.now() - staleThresholdMs);
    const result = await db
      .update(screens)
      .set({ isOnline: false } as any)
      .where(
        and(
          eq(screens.isOnline, true),
          lt(screens.lastSeen, cutoff)
        )
      )
      .returning();
    return result;
  }

  async createScreen(data: InsertScreen): Promise<Screen> {
    const [screen] = await db.insert(screens).values(data).returning();
    return screen;
  }

  async duplicateScreen(sourceId: string, name: string): Promise<Screen | undefined> {
    const [source] = await db.select().from(screens).where(eq(screens.id, sourceId));
    if (!source) return undefined;
    const insertValues: InsertScreen = {
      name,
      clientId: source.clientId,
      location: source.location,
      displayProfileId: source.displayProfileId,
      fallbackLayoutId: source.fallbackLayoutId,
      fallbackPlaylistId: source.fallbackPlaylistId,
      canvasEnabled: source.canvasEnabled,
      canvasWidth: source.canvasWidth,
      canvasHeight: source.canvasHeight,
      canvasX: source.canvasX,
      canvasY: source.canvasY,
      screenshotEnabled: source.screenshotEnabled,
      testPatternEnabled: source.testPatternEnabled,
      showLiveBanner: source.showLiveBanner,
      roomCapacity: source.roomCapacity,
      weatherLat: source.weatherLat,
      weatherLng: source.weatherLng,
      weatherPlaceName: source.weatherPlaceName,
      weatherUnit: source.weatherUnit,
      // Reset runtime / identity fields
      pairingCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      deviceToken: null,
      isPaired: false,
      isOnline: false,
      lastSeen: null,
      ipAddress: null,
      hostname: null,
      hardwareClass: null,
      lastScreenshot: null,
      lastScreenshotAt: null,
      locked: false,
      // displayOrder computed atomically below via SQL subquery
      displayOrder: sql<number>`coalesce((select max(${screens.displayOrder}) from ${screens}), -1) + 1` as unknown as number,
    };
    const [created] = await db.insert(screens).values(insertValues).returning();
    return created;
  }

  async updateScreen(id: string, data: Partial<InsertScreen>): Promise<Screen | undefined> {
    const [screen] = await db
      .update(screens)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(screens.id, id))
      .returning();
    return screen;
  }

  async deleteScreen(id: string): Promise<boolean> {
    const result = await db.delete(screens).where(eq(screens.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Screen Event Bookings
  async getScreenEventBookings(filter?: { screenId?: string; eventId?: string }): Promise<ScreenEventBooking[]> {
    const conditions = [];
    if (filter?.screenId) conditions.push(eq(screenEventBookings.screenId, filter.screenId));
    if (filter?.eventId) conditions.push(eq(screenEventBookings.eventId, filter.eventId));
    if (conditions.length > 0) {
      return db.select().from(screenEventBookings).where(and(...conditions)).orderBy(asc(screenEventBookings.startsAt));
    }
    return db.select().from(screenEventBookings).orderBy(asc(screenEventBookings.startsAt));
  }

  async getScreenEventBooking(id: string): Promise<ScreenEventBooking | undefined> {
    const [row] = await db.select().from(screenEventBookings).where(eq(screenEventBookings.id, id));
    return row;
  }

  // Returns existing bookings on the same screen whose [start,end) interval
  // overlaps the proposed [start,end). Used by create/update for validation.
  private async findOverlappingBookings(
    screenId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string
  ): Promise<ScreenEventBooking[]> {
    // Two ranges overlap iff a.start < b.end AND b.start < a.end.
    const rows = await db
      .select()
      .from(screenEventBookings)
      .where(
        and(
          eq(screenEventBookings.screenId, screenId),
          lt(screenEventBookings.startsAt, endsAt),
          sql`${screenEventBookings.endsAt} > ${startsAt}`,
        )
      );
    return excludeId ? rows.filter(r => r.id !== excludeId) : rows;
  }

  // Maps the Postgres EXCLUDE-constraint violation that backstops our
  // overlap check to a friendly user-facing error. The application-level
  // overlap check above is racy under concurrent inserts; the
  // `screen_event_bookings_no_overlap` exclusion constraint
  // (added via ALTER TABLE; see Multi-Event Screen Bookings in replit.md)
  // makes the rejection authoritative.
  private isOverlapConstraintViolation(err: unknown): boolean {
    const e = err as { code?: string; constraint?: string; message?: string };
    return (
      e?.code === "23P01" ||
      e?.constraint === "screen_event_bookings_no_overlap" ||
      (typeof e?.message === "string" && e.message.includes("screen_event_bookings_no_overlap"))
    );
  }

  async createScreenEventBooking(data: InsertScreenEventBooking): Promise<ScreenEventBooking> {
    const startsAt = data.startsAt instanceof Date ? data.startsAt : new Date(data.startsAt);
    const endsAt = data.endsAt instanceof Date ? data.endsAt : new Date(data.endsAt);
    if (!(endsAt > startsAt)) {
      throw new Error("Booking end must be after start");
    }
    const overlaps = await this.findOverlappingBookings(data.screenId, startsAt, endsAt);
    if (overlaps.length > 0) {
      throw new Error("Booking overlaps with an existing booking on this screen");
    }
    try {
      const [row] = await db.insert(screenEventBookings).values({ ...data, startsAt, endsAt }).returning();
      return row;
    } catch (err) {
      if (this.isOverlapConstraintViolation(err)) {
        throw new Error("Booking overlaps with an existing booking on this screen");
      }
      throw err;
    }
  }

  async updateScreenEventBooking(
    id: string,
    data: Partial<InsertScreenEventBooking>,
  ): Promise<ScreenEventBooking | undefined> {
    const existing = await this.getScreenEventBooking(id);
    if (!existing) return undefined;
    const screenId = data.screenId ?? existing.screenId;
    const startsAt = data.startsAt
      ? (data.startsAt instanceof Date ? data.startsAt : new Date(data.startsAt))
      : existing.startsAt;
    const endsAt = data.endsAt
      ? (data.endsAt instanceof Date ? data.endsAt : new Date(data.endsAt))
      : existing.endsAt;
    if (!(endsAt > startsAt)) {
      throw new Error("Booking end must be after start");
    }
    const overlaps = await this.findOverlappingBookings(screenId, startsAt, endsAt, id);
    if (overlaps.length > 0) {
      throw new Error("Booking overlaps with an existing booking on this screen");
    }
    try {
      const [row] = await db
        .update(screenEventBookings)
        .set({ ...data, startsAt, endsAt, updatedAt: new Date() })
        .where(eq(screenEventBookings.id, id))
        .returning();
      return row;
    } catch (err) {
      if (this.isOverlapConstraintViolation(err)) {
        throw new Error("Booking overlaps with an existing booking on this screen");
      }
      throw err;
    }
  }

  async deleteScreenEventBooking(id: string): Promise<boolean> {
    const result = await db.delete(screenEventBookings).where(eq(screenEventBookings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCurrentEventForScreen(screenId: string, now: Date = new Date()): Promise<Event | undefined> {
    // Booking is "active" when startsAt <= now < endsAt. If two bookings somehow
    // sit on top of `now` (older data; new bookings can't overlap), prefer the
    // one that started most recently so a hand-over reads as "the new event has
    // started" rather than "the old one is still going".
    const [booking] = await db
      .select()
      .from(screenEventBookings)
      .where(
        and(
          eq(screenEventBookings.screenId, screenId),
          lte(screenEventBookings.startsAt, now),
          sql`${screenEventBookings.endsAt} > ${now}`,
        )
      )
      .orderBy(desc(screenEventBookings.startsAt))
      .limit(1);
    if (!booking) return undefined;
    const [event] = await db.select().from(events).where(eq(events.id, booking.eventId));
    return event;
  }

  // Media Assets
  async getMediaAssets(): Promise<MediaAsset[]> {
    return db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));
  }

  async getMediaAsset(id: string): Promise<MediaAsset | undefined> {
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    return asset;
  }

  async createMediaAsset(data: InsertMediaAsset): Promise<MediaAsset> {
    const [asset] = await db.insert(mediaAssets).values(data).returning();
    return asset;
  }

  async updateMediaAsset(id: string, data: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined> {
    const [asset] = await db
      .update(mediaAssets)
      .set(data)
      .where(eq(mediaAssets.id, id))
      .returning();
    return asset;
  }

  async deleteMediaAsset(id: string): Promise<boolean> {
    const result = await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Media Shares
  async getMediaSharesForAsset(mediaAssetId: string): Promise<MediaShare[]> {
    return db.select().from(mediaShares).where(eq(mediaShares.mediaAssetId, mediaAssetId));
  }

  async getMediaSharesForClient(clientId: string): Promise<MediaShare[]> {
    return db.select().from(mediaShares).where(eq(mediaShares.clientId, clientId));
  }

  async createMediaShare(data: InsertMediaShare): Promise<MediaShare> {
    const [share] = await db.insert(mediaShares).values(data).returning();
    return share;
  }

  async deleteMediaShare(mediaAssetId: string, clientId: string): Promise<boolean> {
    const result = await db.delete(mediaShares).where(
      and(eq(mediaShares.mediaAssetId, mediaAssetId), eq(mediaShares.clientId, clientId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Layout Templates
  async getLayoutTemplates(): Promise<LayoutTemplate[]> {
    return db.select().from(layoutTemplates).orderBy(desc(layoutTemplates.createdAt));
  }

  async getLayoutTemplate(id: string): Promise<LayoutTemplate | undefined> {
    const [template] = await db.select().from(layoutTemplates).where(eq(layoutTemplates.id, id));
    return template;
  }

  async createLayoutTemplate(data: InsertLayoutTemplate): Promise<LayoutTemplate> {
    const [template] = await db.insert(layoutTemplates).values(data).returning();
    return template;
  }

  async updateLayoutTemplate(id: string, data: Partial<InsertLayoutTemplate>): Promise<LayoutTemplate | undefined> {
    const [template] = await db
      .update(layoutTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(layoutTemplates.id, id))
      .returning();
    return template;
  }

  async deleteLayoutTemplate(id: string): Promise<boolean> {
    const result = await db.delete(layoutTemplates).where(eq(layoutTemplates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Programmes
  async getProgrammes(): Promise<Programme[]> {
    return db.select().from(programmes).orderBy(desc(programmes.createdAt));
  }

  async getProgramme(id: string): Promise<Programme | undefined> {
    const [programme] = await db.select().from(programmes).where(eq(programmes.id, id));
    return programme;
  }

  async createProgramme(data: InsertProgramme): Promise<Programme> {
    const [programme] = await db.insert(programmes).values(data).returning();
    return programme;
  }

  async updateProgramme(id: string, data: Partial<InsertProgramme>): Promise<Programme | undefined> {
    const [programme] = await db
      .update(programmes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(programmes.id, id))
      .returning();
    return programme;
  }

  async deleteProgramme(id: string): Promise<boolean> {
    const result = await db.delete(programmes).where(eq(programmes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Programme Versions
  async getProgrammeVersions(): Promise<ProgrammeVersion[]> {
    return db.select().from(programmeVersions).orderBy(desc(programmeVersions.createdAt));
  }

  async getProgrammeVersion(id: string): Promise<ProgrammeVersion | undefined> {
    const [version] = await db.select().from(programmeVersions).where(eq(programmeVersions.id, id));
    return version;
  }

  async createProgrammeVersion(data: InsertProgrammeVersion): Promise<ProgrammeVersion> {
    const [version] = await db.insert(programmeVersions).values(data).returning();
    return version;
  }

  async updateProgrammeVersion(id: string, data: Partial<InsertProgrammeVersion>): Promise<ProgrammeVersion | undefined> {
    const [version] = await db
      .update(programmeVersions)
      .set(data)
      .where(eq(programmeVersions.id, id))
      .returning();
    return version;
  }

  // Playlists
  async getPlaylists(): Promise<Playlist[]> {
    return db.select().from(playlists).orderBy(desc(playlists.createdAt));
  }

  async getPlaylist(id: string): Promise<Playlist | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    return playlist;
  }

  async createPlaylist(data: InsertPlaylist): Promise<Playlist> {
    const [playlist] = await db.insert(playlists).values(data).returning();
    return playlist;
  }

  async updatePlaylist(id: string, data: Partial<InsertPlaylist>): Promise<Playlist | undefined> {
    const [playlist] = await db
      .update(playlists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playlists.id, id))
      .returning();
    return playlist;
  }

  async deletePlaylist(id: string): Promise<boolean> {
    const result = await db.delete(playlists).where(eq(playlists.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Playlist Items
  async getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    return db.select().from(playlistItems).where(eq(playlistItems.playlistId, playlistId)).orderBy(playlistItems.order);
  }

  async getPlaylistItem(id: string): Promise<PlaylistItem | undefined> {
    const [item] = await db.select().from(playlistItems).where(eq(playlistItems.id, id));
    return item;
  }

  async createPlaylistItem(data: InsertPlaylistItem): Promise<PlaylistItem> {
    const [item] = await db.insert(playlistItems).values(data).returning();
    return item;
  }

  async updatePlaylistItem(id: string, data: Partial<InsertPlaylistItem>): Promise<PlaylistItem | undefined> {
    const [item] = await db
      .update(playlistItems)
      .set(data)
      .where(eq(playlistItems.id, id))
      .returning();
    return item;
  }

  async deletePlaylistItem(id: string): Promise<boolean> {
    const result = await db.delete(playlistItems).where(eq(playlistItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Schedule Blocks
  async getScheduleBlocks(programmeVersionId: string): Promise<ScheduleBlock[]> {
    return db.select().from(scheduleBlocks).where(eq(scheduleBlocks.programmeVersionId, programmeVersionId)).orderBy(desc(scheduleBlocks.priority), asc(scheduleBlocks.createdAt), asc(scheduleBlocks.id));
  }

  async getAllScheduleBlocks(): Promise<ScheduleBlock[]> {
    return db.select().from(scheduleBlocks).orderBy(asc(scheduleBlocks.createdAt));
  }

  async getScheduleBlock(id: string): Promise<ScheduleBlock | undefined> {
    const [block] = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, id));
    return block;
  }

  async getScheduleBlocksBySeries(seriesId: string): Promise<ScheduleBlock[]> {
    return db.select().from(scheduleBlocks).where(eq(scheduleBlocks.seriesId, seriesId)).orderBy(asc(scheduleBlocks.createdAt));
  }

  async createScheduleBlock(data: InsertScheduleBlock): Promise<ScheduleBlock> {
    const [block] = await db.insert(scheduleBlocks).values(data).returning();
    return block;
  }

  async updateScheduleBlock(id: string, data: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined> {
    const [block] = await db
      .update(scheduleBlocks)
      .set(data)
      .where(eq(scheduleBlocks.id, id))
      .returning();
    return block;
  }

  async deleteScheduleBlock(id: string): Promise<boolean> {
    const result = await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteScheduleBlocksBySeries(seriesId: string): Promise<number> {
    const result = await db.delete(scheduleBlocks).where(eq(scheduleBlocks.seriesId, seriesId));
    return result.rowCount ?? 0;
  }

  // Screen Presets
  async getScreenPresets(filter?: { screenId?: string; groupId?: string }): Promise<ScreenPreset[]> {
    const conditions = [];
    if (filter?.screenId) conditions.push(eq(screenPresets.screenId, filter.screenId));
    if (filter?.groupId) conditions.push(eq(screenPresets.groupId, filter.groupId));
    if (conditions.length > 0) {
      return db.select().from(screenPresets).where(and(...conditions)).orderBy(asc(screenPresets.displayOrder), asc(screenPresets.createdAt));
    }
    return db.select().from(screenPresets).orderBy(asc(screenPresets.displayOrder), asc(screenPresets.createdAt));
  }

  async getScreenPreset(id: string): Promise<ScreenPreset | undefined> {
    const [preset] = await db.select().from(screenPresets).where(eq(screenPresets.id, id));
    return preset;
  }

  async createScreenPreset(data: InsertScreenPreset): Promise<ScreenPreset> {
    const [preset] = await db.insert(screenPresets).values(data).returning();
    return preset;
  }

  async updateScreenPreset(id: string, data: Partial<InsertScreenPreset>): Promise<ScreenPreset | undefined> {
    const [preset] = await db
      .update(screenPresets)
      .set(data)
      .where(eq(screenPresets.id, id))
      .returning();
    return preset;
  }

  async deleteScreenPreset(id: string): Promise<boolean> {
    const result = await db.delete(screenPresets).where(eq(screenPresets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderScreenPresets(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(screenPresets)
        .set({ displayOrder: i })
        .where(eq(screenPresets.id, orderedIds[i]));
    }
  }

  // Live Overrides
  async getLiveOverrides(): Promise<LiveOverride[]> {
    return db.select().from(liveOverrides).orderBy(desc(liveOverrides.createdAt));
  }

  async getLiveOverride(id: string): Promise<LiveOverride | undefined> {
    const [override] = await db.select().from(liveOverrides).where(eq(liveOverrides.id, id));
    return override;
  }

  async getLiveOverrideByPresetId(presetId: string): Promise<LiveOverride | undefined> {
    const [override] = await db.select().from(liveOverrides).where(eq(liveOverrides.presetId, presetId));
    return override;
  }

  async createLiveOverride(data: InsertLiveOverride): Promise<LiveOverride> {
    const [override] = await db.insert(liveOverrides).values(data).returning();
    return override;
  }

  async updateLiveOverride(id: string, data: Partial<InsertLiveOverride>): Promise<LiveOverride | undefined> {
    const [override] = await db
      .update(liveOverrides)
      .set(data)
      .where(eq(liveOverrides.id, id))
      .returning();
    return override;
  }

  async deleteLiveOverride(id: string): Promise<boolean> {
    const result = await db.delete(liveOverrides).where(eq(liveOverrides.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Player Heartbeats
  async getPlayerHeartbeats(screenId: string): Promise<PlayerHeartbeat[]> {
    return db
      .select()
      .from(playerHeartbeats)
      .where(eq(playerHeartbeats.screenId, screenId))
      .orderBy(desc(playerHeartbeats.timestamp))
      .limit(100);
  }

  async createPlayerHeartbeat(data: InsertPlayerHeartbeat): Promise<PlayerHeartbeat> {
    const [heartbeat] = await db.insert(playerHeartbeats).values(data).returning();
    return heartbeat;
  }

  // Audit Logs
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  async getAuditLogs(options: { userId?: string; entityType?: string; entityId?: string; action?: string; dateFrom?: Date; dateTo?: Date; limit?: number; offset?: number }): Promise<{ logs: AuditLog[]; total: number }> {
    const conditions = [];
    if (options.userId) conditions.push(eq(auditLogs.userId, options.userId));
    if (options.entityType) conditions.push(eq(auditLogs.entityType, options.entityType));
    if (options.entityId) conditions.push(eq(auditLogs.entityId, options.entityId));
    if (options.action) conditions.push(eq(auditLogs.action, options.action));
    if (options.dateFrom) conditions.push(gte(auditLogs.timestamp, options.dateFrom));
    if (options.dateTo) conditions.push(lte(auditLogs.timestamp, options.dateTo));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [totalResult] = await db.select({ count: count() }).from(auditLogs).where(where);
    const logs = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.timestamp)).limit(limit).offset(offset);

    return { logs, total: totalResult?.count || 0 };
  }

  async getAuditLogStats(): Promise<{ loginsToday: number; activeUsersWeek: number; changesThisWeek: number; totalLogs: number }> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalResult] = await db.select({ count: count() }).from(auditLogs);
    const [loginsTodayResult] = await db.select({ count: count() }).from(auditLogs).where(and(eq(auditLogs.action, "login"), gte(auditLogs.timestamp, startOfDay)));
    const [changesWeekResult] = await db.select({ count: count() }).from(auditLogs).where(gte(auditLogs.timestamp, weekAgo));

    const activeUsersResult = await db.select({ count: count() }).from(users).where(gte(users.lastLoginAt, weekAgo));

    return {
      loginsToday: loginsTodayResult?.count || 0,
      activeUsersWeek: activeUsersResult[0]?.count || 0,
      changesThisWeek: changesWeekResult?.count || 0,
      totalLogs: totalResult?.count || 0,
    };
  }

  async clearAuditLogs(): Promise<void> {
    await db.delete(auditLogs);
  }

  async getAlertSettings(clientIds?: string[] | null): Promise<AlertSetting[]> {
    if (clientIds === null || clientIds === undefined) {
      return db.select().from(alertSettings).where(isNotNull(alertSettings.clientId));
    }
    if (clientIds.length === 0) return [];
    return db.select().from(alertSettings).where(
      inArray(alertSettings.clientId, clientIds)
    );
  }

  async getAlertSetting(alertType: string, clientId: string): Promise<AlertSetting | undefined> {
    const [setting] = await db.select().from(alertSettings).where(
      and(
        eq(alertSettings.alertType, alertType),
        eq(alertSettings.clientId, clientId)
      )
    );
    return setting;
  }

  async upsertAlertSetting(alertType: string, clientId: string, data: { enabled: boolean; recipients: string[]; cooldownMinutes: number }): Promise<AlertSetting> {
    const existing = await this.getAlertSetting(alertType, clientId);
    if (existing) {
      const [updated] = await db.update(alertSettings)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(alertSettings.alertType, alertType), eq(alertSettings.clientId, clientId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(alertSettings).values({ alertType, clientId, ...data }).returning();
    return created;
  }

  async getAlertSettingsForType(alertType: string): Promise<AlertSetting[]> {
    return db.select().from(alertSettings).where(
      and(
        eq(alertSettings.alertType, alertType),
        eq(alertSettings.enabled, true),
        isNotNull(alertSettings.clientId)
      )
    );
  }

  async createAlertHistoryEntry(data: { alertType: string; entityId: string; recipients: string[]; payload?: any }): Promise<AlertHistory> {
    const [entry] = await db.insert(alertHistory).values(data).returning();
    return entry;
  }

  async getRecentAlertHistory(alertType: string, entityId: string, withinMinutes: number): Promise<AlertHistory[]> {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
    return db.select().from(alertHistory).where(
      and(
        eq(alertHistory.alertType, alertType),
        eq(alertHistory.entityId, entityId),
        gte(alertHistory.sentAt, cutoff)
      )
    );
  }

  async deleteAlertHistory(alertType: string, entityId: string): Promise<void> {
    await db.delete(alertHistory).where(
      and(
        eq(alertHistory.alertType, alertType),
        eq(alertHistory.entityId, entityId)
      )
    );
  }

  async getStatsByClient(): Promise<{ clientId: string; clientName: string; screensOnline: number; screensTotal: number; activeEvents: number; mediaCount: number; activeOverrides: number }[]> {
    const allClients = await db.select().from(clients);
    const allEvents = await db.select().from(events);
    const allScreens = await db.select().from(screens);
    const allMedia = await db.select().from(mediaAssets);
    const allOverrides = await db.select().from(liveOverrides);
    const now = new Date();

    const allBookings = await db.select().from(screenEventBookings);
    return allClients.map(client => {
      const clientEvents = allEvents.filter(e => e.clientId === client.id);
      const clientEventIds = new Set(clientEvents.map(e => e.id));
      // Screens "belong to" a client if they have any booking referencing one
      // of that client's events. Replaces the legacy currentEventId field.
      const screensForClient = new Set(
        allBookings.filter(b => clientEventIds.has(b.eventId)).map(b => b.screenId),
      );
      const clientScreens = allScreens.filter(s => screensForClient.has(s.id));
      const clientMedia = allMedia.filter(m => m.eventId && clientEventIds.has(m.eventId));
      const clientOverrides = allOverrides.filter(o => o.eventId && clientEventIds.has(o.eventId) && o.isActive && new Date(o.endTime) > now);

      return {
        clientId: client.id,
        clientName: client.name || "Unnamed",
        screensOnline: clientScreens.filter(s => s.isOnline).length,
        screensTotal: clientScreens.length,
        activeEvents: clientEvents.filter(e => e.isActive).length,
        mediaCount: clientMedia.length,
        activeOverrides: clientOverrides.length,
      };
    });
  }

  // System Settings
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }

  async setSystemSetting(key: string, value: string): Promise<SystemSetting> {
    const [setting] = await db
      .insert(systemSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // API Tokens
  async createApiToken(data: InsertApiToken): Promise<ApiToken> {
    const [token] = await db.insert(apiTokens).values(data).returning();
    return token;
  }

  async getApiTokensByUser(userId: string): Promise<ApiToken[]> {
    return db.select().from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(desc(apiTokens.createdAt));
  }

  async getApiToken(id: string): Promise<ApiToken | undefined> {
    const [token] = await db.select().from(apiTokens).where(eq(apiTokens.id, id));
    return token;
  }

  async getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined> {
    const [token] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash));
    return token;
  }

  async revokeApiToken(id: string): Promise<boolean> {
    const result = await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async touchApiTokenLastUsed(id: string): Promise<void> {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id));
  }

  async recordApiTokenIpUse(tokenId: string, ip: string): Promise<{ isNew: boolean }> {
    // ON CONFLICT DO NOTHING + RETURNING — only returns a row when the
    // (tokenId, ip) pair was actually inserted, i.e. genuinely new.
    const inserted = await db
      .insert(apiTokenKnownIps)
      .values({ tokenId, ip })
      .onConflictDoNothing({ target: [apiTokenKnownIps.tokenId, apiTokenKnownIps.ip] })
      .returning({ id: apiTokenKnownIps.id });
    return { isNew: inserted.length > 0 };
  }

  async getRecentNewIpEventsForTokens(tokenIds: string[]): Promise<Map<string, { lastIp: string | null; lastAt: Date | null; count: number }>> {
    const result = new Map<string, { lastIp: string | null; lastAt: Date | null; count: number }>();
    if (tokenIds.length === 0) return result;
    // Fetch per-token acknowledgement cutoffs so audit entries that the admin
    // has already dismissed are excluded. A subsequent new-IP event with a
    // strictly newer timestamp will still surface.
    const ackRows = await db
      .select({ id: apiTokens.id, ackAt: apiTokens.newIpAcknowledgedAt })
      .from(apiTokens)
      .where(inArray(apiTokens.id, tokenIds));
    const ackByToken = new Map<string, Date | null>();
    for (const row of ackRows) ackByToken.set(row.id, row.ackAt ?? null);

    const rows = await db
      .select({
        entityId: auditLogs.entityId,
        ip: sql<string | null>`${auditLogs.payload}->>'ip'`,
        timestamp: auditLogs.timestamp,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "api_token_new_ip"), inArray(auditLogs.entityId, tokenIds)))
      .orderBy(desc(auditLogs.timestamp));
    for (const row of rows) {
      if (!row.entityId) continue;
      const ackAt = ackByToken.get(row.entityId) ?? null;
      if (ackAt && row.timestamp && row.timestamp.getTime() <= ackAt.getTime()) continue;
      const existing = result.get(row.entityId);
      if (existing) {
        existing.count += 1;
      } else {
        result.set(row.entityId, { lastIp: row.ip ?? null, lastAt: row.timestamp ?? null, count: 1 });
      }
    }
    return result;
  }

  async getLatestAckActorsForTokens(tokenIds: string[]): Promise<Map<string, { at: Date; userId: string | null; firstName: string | null; lastName: string | null; email: string | null }>> {
    const result = new Map<string, { at: Date; userId: string | null; firstName: string | null; lastName: string | null; email: string | null }>();
    if (tokenIds.length === 0) return result;
    // Pull every ack_new_ip audit entry for these tokens ordered newest-first,
    // then keep the first (most recent) row per token. We resolve actor info
    // via a left join on users so deleted accounts still surface a timestamp.
    const rows = await db
      .select({
        entityId: auditLogs.entityId,
        timestamp: auditLogs.timestamp,
        userId: auditLogs.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(eq(auditLogs.action, "ack_new_ip"), eq(auditLogs.entityType, "api_token"), inArray(auditLogs.entityId, tokenIds)))
      .orderBy(desc(auditLogs.timestamp));
    for (const row of rows) {
      if (!row.entityId || !row.timestamp) continue;
      if (result.has(row.entityId)) continue;
      result.set(row.entityId, {
        at: row.timestamp,
        userId: row.userId ?? null,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        email: row.email ?? null,
      });
    }
    return result;
  }

  async acknowledgeApiTokenNewIp(tokenId: string, at: Date): Promise<void> {
    // Monotonic update: never let a stale session/tab regress the cutoff to
    // an older timestamp and resurrect previously-dismissed alerts. Only
    // advance the value when the incoming timestamp is strictly newer
    // (or no prior ack exists).
    await db
      .update(apiTokens)
      .set({ newIpAcknowledgedAt: at })
      .where(
        and(
          eq(apiTokens.id, tokenId),
          sql`(${apiTokens.newIpAcknowledgedAt} IS NULL OR ${apiTokens.newIpAcknowledgedAt} < ${at})`,
        ),
      );
  }

  async deleteApiTokenKnownIp(tokenId: string, ip: string): Promise<void> {
    // Used to roll back a record_api_token_ip_use insert when the
    // companion audit_log write fails, so the next request retries the
    // first-seen detection cleanly instead of silently dropping it.
    await db
      .delete(apiTokenKnownIps)
      .where(and(eq(apiTokenKnownIps.tokenId, tokenId), eq(apiTokenKnownIps.ip, ip)));
  }
}

export const storage = new DatabaseStorage();

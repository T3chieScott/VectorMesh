import { db } from "./db";
import { eq, and, desc, gte, lte, lt, inArray } from "drizzle-orm";
import {
  clients,
  events,
  brandPacks,
  displayProfiles,
  screenGroups,
  screens,
  screenGroupMemberships,
  mediaAssets,
  layoutTemplates,
  programmes,
  programmeVersions,
  scheduleBlocks,
  playlists,
  playlistItems,
  liveOverrides,
  playerHeartbeats,
  auditLogs,
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
} from "@shared/schema";
import { users, userSites, type User, type UpsertUser, type UserSite } from "@shared/models/auth";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

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
  getScreenGroup(id: string): Promise<ScreenGroup | undefined>;
  createScreenGroup(data: InsertScreenGroup): Promise<ScreenGroup>;
  updateScreenGroup(id: string, data: Partial<InsertScreenGroup>): Promise<ScreenGroup | undefined>;
  deleteScreenGroup(id: string): Promise<boolean>;

  // Screens
  getScreens(): Promise<Screen[]>;
  getScreen(id: string): Promise<Screen | undefined>;
  getScreenByPairingCode(code: string): Promise<Screen | undefined>;
  getScreenByDeviceToken(token: string): Promise<Screen | undefined>;
  unpairScreen(id: string, newPairingCode: string): Promise<Screen | undefined>;
  markStaleScreensOffline(staleThresholdMs: number): Promise<number>;
  createScreen(data: InsertScreen): Promise<Screen>;
  updateScreen(id: string, data: Partial<InsertScreen>): Promise<Screen | undefined>;
  deleteScreen(id: string): Promise<boolean>;

  // Media Assets
  getMediaAssets(): Promise<MediaAsset[]>;
  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  createMediaAsset(data: InsertMediaAsset): Promise<MediaAsset>;
  updateMediaAsset(id: string, data: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined>;
  deleteMediaAsset(id: string): Promise<boolean>;

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
  getScheduleBlock(id: string): Promise<ScheduleBlock | undefined>;
  createScheduleBlock(data: InsertScheduleBlock): Promise<ScheduleBlock>;
  updateScheduleBlock(id: string, data: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined>;
  deleteScheduleBlock(id: string): Promise<boolean>;

  // Live Overrides
  getLiveOverrides(): Promise<LiveOverride[]>;
  getLiveOverride(id: string): Promise<LiveOverride | undefined>;
  createLiveOverride(data: InsertLiveOverride): Promise<LiveOverride>;
  updateLiveOverride(id: string, data: Partial<InsertLiveOverride>): Promise<LiveOverride | undefined>;
  deleteLiveOverride(id: string): Promise<boolean>;

  // Player Heartbeats
  getPlayerHeartbeats(screenId: string): Promise<PlayerHeartbeat[]>;
  createPlayerHeartbeat(data: InsertPlayerHeartbeat): Promise<PlayerHeartbeat>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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

  // Screens
  async getScreens(): Promise<Screen[]> {
    return db.select().from(screens).orderBy(desc(screens.createdAt));
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

  async markStaleScreensOffline(staleThresholdMs: number): Promise<number> {
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
    return result.length;
  }

  async createScreen(data: InsertScreen): Promise<Screen> {
    const [screen] = await db.insert(screens).values(data).returning();
    return screen;
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
    return db.select().from(scheduleBlocks).where(eq(scheduleBlocks.programmeVersionId, programmeVersionId)).orderBy(desc(scheduleBlocks.priority));
  }

  async getScheduleBlock(id: string): Promise<ScheduleBlock | undefined> {
    const [block] = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, id));
    return block;
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

  // Live Overrides
  async getLiveOverrides(): Promise<LiveOverride[]> {
    return db.select().from(liveOverrides).orderBy(desc(liveOverrides.createdAt));
  }

  async getLiveOverride(id: string): Promise<LiveOverride | undefined> {
    const [override] = await db.select().from(liveOverrides).where(eq(liveOverrides.id, id));
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
}

export const storage = new DatabaseStorage();

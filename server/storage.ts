import { db } from "./db";
import { log } from "./log";
import { eq, and, asc, desc, gte, lte, lt, inArray, isNotNull, sql, count } from "drizzle-orm";
import {
  clients,
  events,
  brandPacks,
  displayProfiles,
  screenGroups,
  screens,
  canvasGroups,
  screenGroupMemberships,
  screenEventBookings,
  mediaAssets,
  mediaFolders,
  mediaShares,
  customFonts,
  layoutTemplates,
  programmes,
  programmeVersions,
  scheduleBlocks,
  playlists,
  playlistItems,
  screenPresets,
  liveOverrides,
  playerHeartbeats,
  videoHealthSamples,
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
  type CanvasGroup,
  type InsertCanvasGroup,
  type MediaAsset,
  type InsertMediaAsset,
  type MediaFolder,
  type InsertMediaFolder,
  type MediaShare,
  type InsertMediaShare,
  type CustomFont,
  type InsertCustomFont,
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
  type VideoHealthSample,
  type InsertVideoHealthSample,
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
  agendaItems,
  agendaWidgetConfigs,
  agendaSyncConfigs,
  type AgendaItem,
  type InsertAgendaItem,
  type AgendaWidgetConfig,
  type InsertAgendaWidgetConfig,
  type AgendaSyncConfig,
  type InsertAgendaSyncConfig,
  sweepstakeWidgetConfigs,
  tournamentTeams,
  tournamentMatches,
  tournamentStandings,
  sweepstakeParticipants,
  type SweepstakeWidgetConfig,
  type InsertSweepstakeWidgetConfig,
  type TournamentTeam,
  type InsertTournamentTeam,
  type TournamentMatch,
  type InsertTournamentMatch,
  type TournamentStanding,
  type InsertTournamentStanding,
  type SweepstakeParticipant,
  type InsertSweepstakeParticipant,
} from "@shared/schema";
import { users, userSites, passwordResetTokens, type User, type UpsertUser, type UserSite, type PasswordResetToken } from "@shared/models/auth";
import { apiTokens, apiTokenKnownIps, type ApiToken, type InsertApiToken } from "@shared/schema";

/**
 * Task #179 — `system_settings` key recording that the Task #176
 * false-canvas-pairing repair has already been applied to this DB.
 * Presence (any value) means "skip the repair on subsequent boots";
 * absence means "this DB has not yet been swept and the repair should
 * run once". The stored value is a JSON blob (`{ranAt, repaired}`)
 * for forensic visibility but only the row's existence is consulted.
 */
export const CANVAS_PAIRING_REPAIR_176_MARKER_KEY =
  "canvas_pairing_repair_176_completed";

/**
 * Task #189 — `system_settings` key recording that the explicit-
 * canvas-grouping backfill has run on this DB. The backfill
 * creates one `canvas_groups` row per real wall (≥2 distinct
 * positions) and a per-screen group for every other canvas-enabled
 * screen, then stamps `screens.canvasGroupId`. Same one-shot
 * marker pattern as Task #179.
 */
export const CANVAS_GROUPS_BACKFILL_189_MARKER_KEY =
  "canvas_groups_backfill_189_completed";

/**
 * Task #180: structurally narrow an unknown error to detect a Postgres
 * 23505 unique_violation against the screens.pairing_code constraint.
 * Used by the mint+write retry helper so we can react to the brief
 * probe-vs-write race window without falling back to `any` casting.
 * Drivers (pg, postgres-js, neon) all surface the SQLSTATE either at
 * `err.code` or `err.cause.code`; we additionally accept a plain
 * message match so downstream wrappers / re-throws still trigger the
 * retry path.
 */
function isPairingCodeUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown } | null;
  };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505") {
    return true;
  }
  if (typeof e.message === "string") {
    return /screens_pairing_code_unique/i.test(e.message);
  }
  return false;
}

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

  // Agenda Items + Widget Configs (Task #208)
  getAgendaItems(clientId?: string): Promise<AgendaItem[]>;
  getAgendaItem(id: string): Promise<AgendaItem | undefined>;
  createAgendaItem(data: InsertAgendaItem): Promise<AgendaItem>;
  createAgendaItemsBulk(rows: InsertAgendaItem[]): Promise<AgendaItem[]>;
  updateAgendaItem(id: string, data: Partial<InsertAgendaItem>): Promise<AgendaItem | undefined>;
  deleteAgendaItem(id: string): Promise<boolean>;
  deleteAgendaItemsForClient(clientId: string): Promise<number>;
  getAgendaWidgetConfigs(clientId?: string): Promise<AgendaWidgetConfig[]>;
  getAgendaWidgetConfig(id: string): Promise<AgendaWidgetConfig | undefined>;
  createAgendaWidgetConfig(data: InsertAgendaWidgetConfig): Promise<AgendaWidgetConfig>;
  updateAgendaWidgetConfig(id: string, data: Partial<InsertAgendaWidgetConfig>): Promise<AgendaWidgetConfig | undefined>;
  deleteAgendaWidgetConfig(id: string): Promise<boolean>;
  // Agenda sync configs (Task #210)
  getAgendaSyncConfigs(clientId?: string): Promise<AgendaSyncConfig[]>;
  getAgendaSyncConfig(id: string): Promise<AgendaSyncConfig | undefined>;
  createAgendaSyncConfig(data: InsertAgendaSyncConfig): Promise<AgendaSyncConfig>;
  updateAgendaSyncConfig(id: string, data: Partial<AgendaSyncConfig>): Promise<AgendaSyncConfig | undefined>;
  deleteAgendaSyncConfig(id: string): Promise<boolean>;
  getAgendaItemsBySyncConfig(syncConfigId: string): Promise<AgendaItem[]>;
  getResolvedAgendaForConfig(
    configId: string,
    now: Date,
  ): Promise<{ config: AgendaWidgetConfig; items: AgendaItem[] } | undefined>;

  // Sweepstake widget (Task #286)
  getSweepstakeConfigs(clientId?: string): Promise<SweepstakeWidgetConfig[]>;
  getSweepstakeConfig(id: string): Promise<SweepstakeWidgetConfig | undefined>;
  createSweepstakeConfig(data: InsertSweepstakeWidgetConfig): Promise<SweepstakeWidgetConfig>;
  updateSweepstakeConfig(id: string, data: Partial<InsertSweepstakeWidgetConfig> & { lastSyncedAt?: Date | null; lastSyncError?: string | null }): Promise<SweepstakeWidgetConfig | undefined>;
  deleteSweepstakeConfig(id: string): Promise<boolean>;
  getTournamentTeams(configId: string): Promise<TournamentTeam[]>;
  getTournamentTeam(id: string): Promise<TournamentTeam | undefined>;
  createTournamentTeam(data: InsertTournamentTeam): Promise<TournamentTeam>;
  updateTournamentTeam(id: string, data: Partial<InsertTournamentTeam> & { eliminatedAt?: Date | null }): Promise<TournamentTeam | undefined>;
  setTournamentWinner(configId: string, teamId: string | null): Promise<void>;
  replaceTournamentTeams(configId: string, teams: InsertTournamentTeam[]): Promise<TournamentTeam[]>;
  getTournamentMatches(configId: string): Promise<TournamentMatch[]>;
  replaceTournamentMatches(configId: string, matches: InsertTournamentMatch[]): Promise<TournamentMatch[]>;
  getTournamentStandings(configId: string): Promise<TournamentStanding[]>;
  replaceTournamentStandings(configId: string, standings: InsertTournamentStanding[]): Promise<TournamentStanding[]>;
  getSweepstakeParticipants(configId: string): Promise<SweepstakeParticipant[]>;
  getSweepstakeParticipant(id: string): Promise<SweepstakeParticipant | undefined>;
  createSweepstakeParticipant(data: InsertSweepstakeParticipant): Promise<SweepstakeParticipant>;
  updateSweepstakeParticipant(id: string, data: Partial<InsertSweepstakeParticipant>): Promise<SweepstakeParticipant | undefined>;
  deleteSweepstakeParticipant(id: string): Promise<boolean>;
  deleteSweepstakeParticipantsForConfig(configId: string): Promise<number>;

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
  /**
   * Task #189 — explicit-canvas grouping: returns every screen that
   * shares `screen.canvasGroupId`, ordered by createdAt asc. The
   * first element is the canvas "owner" — the earliest-created tile.
   * For non-canvas screens, or canvas-enabled screens with no
   * `canvasGroupId` (transient state pre-backfill or pre-create), this
   * returns `[screen]`. NOTE: callers must pass a freshly fetched
   * Screen row — this method does NOT re-fetch the seed.
   */
  getCanvasMembers(screen: Screen): Promise<Screen[]>;
  /**
   * Bulk-update pairing-related fields across every member of an
   * implicit canvas group, atomically. Used so the pair / unpair /
   * heartbeat flows treat the whole wall as one unit.
   * Returns the number of rows affected.
   *
   * Task #180: `pairingCode` is intentionally NOT in the allowed
   * field set. The DB-level UNIQUE constraint on `screens.pairing_code`
   * forbids fanning the same code to multiple rows; the wall's
   * shared identity is `deviceToken` only. Per-tile pairingCodes are
   * rotated through {@link IStorage.rotateScreenPairingIdentity}
   * when a wall dissolves.
   */
  setCanvasPairingState(
    screenIds: string[],
    fields: Partial<
      Pick<
        Screen,
        | "deviceToken"
        | "isPaired"
        | "isOnline"
        | "lastSeen"
        | "ipAddress"
        | "hostname"
        | "hardwareClass"
      >
    >,
  ): Promise<number>;
  /**
   * Task #189 — one-shot reconciliation across explicit canvas groups:
   * walks every `canvas_groups` row and forces all members to share
   * the canonical PAIRING IDENTITY (`deviceToken`, `isPaired`). Per-
   * tile presence fields (`isOnline`, `lastSeen`, `ipAddress`,
   * `hostname`, `hardwareClass`) are intentionally NOT copied — they
   * belong to the individual physical player and would otherwise bleed
   * across the wall on every boot (Task #176). Task #180: `pairingCode`
   * is also NOT copied — every tile keeps its own globally-unique
   * code, and any tile's code resolves to the wall via
   * getScreenByPairingCode.
   *
   * The "winner" inside a group is the most-recently-seen paired tile
   * if any tile is paired, otherwise the earliest-created tile (whose
   * deviceToken becomes the canonical one). Lone-screen groups (one
   * member) are skipped — those screens are independent and must keep
   * their own pairing state. Run at server boot so pre-#173 walls with
   * mismatched per-screen pairing rows converge before the first
   * player request arrives. Returns the number of groups normalised.
   */
  backfillCanvasPairingState(): Promise<number>;

  /**
   * Task #189 — one-shot backfill that promotes the implicit
   * `(clientId, canvasWidth, canvasHeight, ≥2 distinct positions)`
   * grouping into explicit `canvas_groups` rows. For each
   * canvas-enabled screen:
   *  - Skip if `canvasGroupId` is already set.
   *  - If the screen is part of a real wall (≥2 members at distinct
   *    positions sharing client + dims), reuse / create one shared
   *    group for the whole wall.
   *  - Otherwise create a per-screen group named after the screen so
   *    the operator can rename it later.
   * Idempotent: a second invocation finds every canvas-enabled screen
   * already stamped and is a no-op. Returns
   * `{ groupsCreated, screensStamped }` for forensic logging.
   */
  backfillExplicitCanvasGroups(): Promise<{
    groupsCreated: number;
    screensStamped: number;
  }>;
  /**
   * Task #189 — boot-claimed wrapper around
   * {@link IStorage.backfillExplicitCanvasGroups} with the same
   * atomic at-most-once semantics as
   * {@link IStorage.repairFalseCanvasPairingsOnce}.
   *
   * Claims the `canvas_groups_backfill_189_completed` row in
   * `system_settings` via INSERT … ON CONFLICT DO NOTHING; only
   * the winner runs the backfill, every other concurrent boot
   * returns `{ skipped: true }`. On clean completion the marker
   * is stamped with `status:"completed"` and forensic counts.
   *
   * Crash recovery: if the process dies between the claim and
   * the completion stamp the marker stays at `status:"running"`
   * and subsequent boots will skip. The operator escape hatch is
   * to delete the marker row:
   *   `DELETE FROM system_settings WHERE key = 'canvas_groups_backfill_189_completed';`
   * Documented in the operations runbook in `replit.md`.
   */
  backfillExplicitCanvasGroupsOnce(): Promise<{
    groupsCreated: number;
    screensStamped: number;
    skipped: boolean;
  }>;

  // Canvas Groups (Task #189)
  getCanvasGroups(): Promise<CanvasGroup[]>;
  getCanvasGroup(id: string): Promise<CanvasGroup | undefined>;
  createCanvasGroup(data: InsertCanvasGroup): Promise<CanvasGroup>;
  updateCanvasGroup(
    id: string,
    data: Partial<InsertCanvasGroup>,
  ): Promise<CanvasGroup | undefined>;
  /**
   * Refuses (returns false) if any screen still references the group;
   * the operator must move members off first. Returns true on a real
   * delete.
   */
  deleteCanvasGroup(id: string): Promise<boolean>;
  /**
   * One-shot repair (Task #176): undoes the inheritance damage caused
   * by previous boots that grouped unrelated screens sharing
   * `(clientId, canvasWidth, canvasHeight)` but sitting at the same
   * `(canvasX, canvasY)`. Walks every canvas-enabled `isPaired=true`
   * screen whose group is now solo under the tightened position rule
   * (Task #176 step 4) and resets its pairing & presence fields,
   * assigning a fresh unique `pairingCode`. No token-duplication
   * heuristic — even a paired solo screen with a unique deviceToken
   * is reset, because the pre-#176 backfill could have stamped
   * pairing onto a screen whose original false-sibling was later
   * deleted. Returns the number of rows repaired.
   *
   * Note (Task #179): operators normally invoke this via
   * {@link IStorage.repairFalseCanvasPairingsOnce} so it runs at most
   * once per database. The raw method is left exposed for tests and
   * for the unit case where the marker has been cleared deliberately.
   */
  repairFalseCanvasPairings(): Promise<number>;
  /**
   * Task #179 — boot wrapper around {@link IStorage.repairFalseCanvasPairings}
   * that runs the repair at most once per database, gated by the
   * {@link CANVAS_PAIRING_REPAIR_176_MARKER_KEY} system-setting marker.
   *
   * The original (Task #176) repair re-fired on every boot because it
   * had no positive signal that the false-pairing damage had already
   * been cleared. Without that signal, a legitimately paired solo
   * canvas-enabled screen (a Pi driving one canvas-authored display)
   * would be silently reset on every server restart with a fresh
   * pairing code, surprising operators who paired it in good faith.
   *
   * Behaviour:
   *  - If the marker exists (any value, any status): returns
   *    `{ repaired: 0, skipped: true }` without touching any rows.
   *  - If the marker is absent: atomically claims the marker (insert
   *    with `ON CONFLICT DO NOTHING`) so concurrently-booting workers
   *    can't both run the repair, then invokes
   *    `repairFalseCanvasPairings` and stamps the final status onto
   *    the same marker. Returns `{ repaired, skipped: false }`.
   *
   * Concurrent boots: exactly one worker wins the claim and runs the
   * repair; every other worker observes the marker as present and
   * skips. Strict at-most-once semantics across the whole DB.
   *
   * Crash safety: the claim is written *before* the repair runs, with
   * `status: "running"`. If the process crashes mid-repair, the marker
   * stays at `running` and the next boot still skips — the documented
   * operator escape hatch is to delete the marker row by hand (and
   * the test suite pins this contract). We accept "stuck-running
   * marker after a crash" as preferable to "every concurrent boot
   * re-runs the repair", because the underlying Task #176 damage is a
   * one-time data shape and there's nothing for the repair to do on a
   * clean DB.
   */
  repairFalseCanvasPairingsOnce(): Promise<{
    repaired: number;
    skipped: boolean;
  }>;
  /**
   * Mark every currently-online screen whose `lastSeen` is older than
   * `now - staleThresholdMs` as offline. `now` defaults to the wall clock
   * but can be overridden — this keeps the time-cutoff math purely in UTC
   * milliseconds so DST transitions never affect detection, and allows
   * deterministic testing across DST boundaries.
   */
  markStaleScreensOffline(staleThresholdMs: number, now?: Date): Promise<Screen[]>;
  createScreen(data: InsertScreen): Promise<Screen>;
  updateScreen(id: string, data: Partial<InsertScreen>): Promise<Screen | undefined>;
  deleteScreen(id: string): Promise<boolean>;
  reorderScreens(orderedIds: string[]): Promise<void>;
  duplicateScreen(sourceId: string, name: string): Promise<Screen | undefined>;
  // Task #180 — single source of fresh, collision-free 6-char pairing
  // codes. Every callsite that mints a code MUST go through this so
  // the DB-level UNIQUE constraint on screens.pairing_code holds.
  generateUniquePairingCode(): Promise<string>;
  // Task #180 — boot-time dedupe. Walks all screens, finds groups of
  // rows that share a non-null pairing_code (the legacy wall-fan-out
  // bug from before this fix), and rotates every member EXCEPT the
  // earliest-created one to a fresh unique code via
  // generateUniquePairingCode. Idempotent: when no duplicates remain
  // it does nothing. Runs BEFORE the DB-level UNIQUE constraint is
  // exercised by any new write so legacy data can never make a fresh
  // server boot fall over. Returns the number of rows reissued.
  dedupePairingCodes(): Promise<number>;
  // Task #180 — atomically assign the screen a fresh unique pairing
  // code AND clear its pairing/online state. Used when a tile leaves
  // a wall (PATCH/DELETE), is unpaired, or has its code regenerated,
  // so the screen never carries around a code/token that another
  // screen also holds.
  rotateScreenPairingIdentity(screenId: string): Promise<void>;
  // Task #180 (round-7 review) — atomic multi-screen rotation. Used
  // by regenerate / unpair / wall-dissolve reconciliation so a partial
  // failure mid-loop can never leave the wall in a half-rotated state
  // where some tiles got fresh codes and others kept the old shared
  // identity. The operation is wrapped in a single DB transaction;
  // either every supplied screen rotates or none of them do.
  rotateScreensPairingIdentities(screenIds: string[]): Promise<void>;
  // Task #180 — after a PATCH or DELETE that may have changed canvas
  // membership, reconcile the patched/deleted screen and any former
  // wall siblings so no two solo screens end up sharing the same
  // pairing identity. `beforeMembers` is the snapshot from
  // `getCanvasMembers(existing)` taken BEFORE the change.
  reconcileWallPairingAfterChange(
    changedScreenId: string,
    beforeMembers: Screen[],
    options?: { changedScreenDeleted?: boolean },
  ): Promise<void>;
  // Task #185 — Pi-side "I just unpaired myself" signal. Clears
  // `deviceToken`, `isPaired`, and per-tile presence on the screen
  // (and every wall sibling, since they share pairing identity).
  // Critically, `pairingCode` is PRESERVED so the operator does not
  // have to regenerate before the Pi can re-pair using the existing
  // code. Different from `rotateScreenPairingIdentity`, which always
  // mints a fresh code.
  forfeitWallPairing(screenId: string): Promise<void>;

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

  // Media Folders (Task #265) — per-site flat folders for organising assets.
  getMediaFolders(clientId?: string): Promise<MediaFolder[]>;
  getMediaFolder(id: string): Promise<MediaFolder | undefined>;
  createMediaFolder(data: InsertMediaFolder): Promise<MediaFolder>;
  updateMediaFolder(id: string, data: Partial<InsertMediaFolder>): Promise<MediaFolder | undefined>;
  deleteMediaFolder(id: string): Promise<boolean>;

  // Media Shares
  getMediaSharesForAsset(mediaAssetId: string): Promise<MediaShare[]>;
  getMediaSharesForClient(clientId: string): Promise<MediaShare[]>;
  createMediaShare(data: InsertMediaShare): Promise<MediaShare>;
  getCustomFonts(clientId: string): Promise<CustomFont[]>;
  getCustomFont(id: string): Promise<CustomFont | undefined>;
  getCustomFontsByFamily(familyId: string): Promise<CustomFont[]>;
  createCustomFont(data: InsertCustomFont): Promise<CustomFont>;
  deleteCustomFont(id: string): Promise<boolean>;
  deleteCustomFontFamily(familyId: string): Promise<boolean>;
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
  reorderProgrammes(orderedIds: string[]): Promise<void>;

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

  // Video Health Samples (Task #200) — per-heartbeat history of the
  // keep-alive watchdog counters so the screens UI can render a 24h
  // sparkline. `since` filters by sample timestamp; samples come back
  // oldest-first so the chart can diff consecutive rows. Pruning is
  // driven from a background interval in routes.ts.
  createVideoHealthSample(data: InsertVideoHealthSample): Promise<VideoHealthSample>;
  getVideoHealthSamples(screenId: string, since: Date): Promise<VideoHealthSample[]>;
  pruneVideoHealthSamples(olderThan: Date): Promise<number>;

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

/**
 * Pick the "source of truth" tile for a canvas group's pairing state.
 * - Prefer a paired tile (isPaired=true with a non-null deviceToken).
 *   When several are paired we prefer the most-recently-seen one so a
 *   live wall always wins over a stale one.
 * - Otherwise fall back to the earliest-created tile so the canonical
 *   pairingCode is stable across boots.
 *
 * `members` MUST already be ordered by createdAt asc (which is what
 * `getCanvasMembers` and `backfillCanvasPairingState` produce) so the
 * fallback branch is deterministic.
 */
export function pickCanvasPairingWinner(members: Screen[]): Screen {
  if (members.length === 0) {
    throw new Error("pickCanvasPairingWinner requires at least one member");
  }
  const paired = members.filter((m) => !!m.isPaired && m.deviceToken !== null);
  if (paired.length > 0) {
    return paired.reduce((best, cur) => {
      const bestTs = best.lastSeen?.getTime() ?? 0;
      const curTs = cur.lastSeen?.getTime() ?? 0;
      return curTs > bestTs ? cur : best;
    });
  }
  return members[0];
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
    const values: typeof events.$inferInsert = data as typeof events.$inferInsert;
    const [event] = await db.insert(events).values(values).returning();
    return event;
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const patch: Partial<typeof events.$inferInsert> = { ...data, updatedAt: new Date() } as Partial<typeof events.$inferInsert>;
    const [event] = await db
      .update(events)
      .set(patch)
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

  async getCanvasMembers(screen: Screen): Promise<Screen[]> {
    // Task #189 — explicit grouping. A canvas-enabled screen lives in
    // exactly one `canvas_groups` row identified by `canvasGroupId`.
    // The boot-time backfill stamps every legacy canvas screen, and
    // `createScreen` auto-creates a per-screen group for new canvas
    // rows, so in practice `canvasGroupId` is always set on a
    // canvas-enabled screen. The `null` branch below is kept as a
    // defensive fallback (transient state pre-backfill, or a row whose
    // group was just deleted via ON DELETE SET NULL) — those screens
    // are treated as solo until the operator reassigns them.
    if (!screen.canvasEnabled) return [screen];
    if (!screen.canvasGroupId) return [screen];
    // Only count canvas-enabled siblings: a row that flipped
    // canvasEnabled off (e.g. mid-PATCH "leave the wall") may still
    // carry the old canvasGroupId until the operator reassigns it,
    // and must not be treated as a wall member in the meantime.
    const members = await db
      .select()
      .from(screens)
      .where(
        and(
          eq(screens.canvasGroupId, screen.canvasGroupId),
          eq(screens.canvasEnabled, true),
        ),
      )
      .orderBy(asc(screens.createdAt), asc(screens.id));
    if (members.length === 0) return [screen];
    return members;
  }

  async setCanvasPairingState(
    screenIds: string[],
    // Task #180 — `pairingCode` is intentionally NOT part of the
    // allowed field set anymore. With the DB-level UNIQUE constraint
    // on `screens.pairing_code`, fanning the same code out to >1
    // screens would always violate the constraint. The wall's
    // identity is shared via `deviceToken` only; each tile keeps its
    // own unique pairingCode (rotated through `rotateScreenPairingIdentity`
    // when the wall dissolves).
    fields: Partial<
      Pick<
        Screen,
        | "deviceToken"
        | "isPaired"
        | "isOnline"
        | "lastSeen"
        | "ipAddress"
        | "hostname"
        | "hardwareClass"
      >
    >,
  ): Promise<number> {
    if (screenIds.length === 0) return 0;
    if (Object.keys(fields).length === 0) return 0;
    const result = await db
      .update(screens)
      .set({ ...fields, updatedAt: new Date() } as any)
      .where(inArray(screens.id, screenIds));
    return result.rowCount ?? 0;
  }

  async backfillCanvasPairingState(): Promise<number> {
    // Task #189 — walks every canvas-enabled screen, buckets by
    // explicit `canvasGroupId`, and forces all members to share one
    // pairing snapshot. Idempotent — groups that already agree are
    // skipped. Lone-screen groups (the default for a fresh canvas
    // screen) are skipped — there's nothing to fan out to. Designed to
    // run once at boot AFTER backfillExplicitCanvasGroups, before the
    // first /api/player/pair or heartbeat hits the canvas-aware paths.
    const allCanvas = await db
      .select()
      .from(screens)
      .where(eq(screens.canvasEnabled, true))
      .orderBy(asc(screens.createdAt), asc(screens.id));

    const groups = new Map<string, Screen[]>();
    for (const s of allCanvas) {
      if (!s.canvasGroupId) continue;
      const arr = groups.get(s.canvasGroupId);
      if (arr) arr.push(s);
      else groups.set(s.canvasGroupId, [s]);
    }

    let normalised = 0;
    for (const [, members] of groups) {
      if (members.length < 2) continue;
      const winner = pickCanvasPairingWinner(members);
      // Narrowed (Task #176/#180): only the PAIRING RUNTIME is shared
      // across the wall — `deviceToken` (the Pi token) and `isPaired`.
      // Per-tile presence (`isOnline`, `lastSeen`, `ipAddress`,
      // `hostname`, `hardwareClass`) is owned by each physical player
      // and stays per-row. Task #180: `pairingCode` is per-screen
      // unique (DB-level UNIQUE constraint) and is NEVER fanned out;
      // each tile keeps its own code so any tile's code resolves to
      // the wall via getScreenByPairingCode → getCanvasMembers.
      const fields = {
        deviceToken: winner.deviceToken,
        isPaired: !!winner.isPaired,
      };
      const needsUpdate = members.some(
        (m) =>
          m.deviceToken !== fields.deviceToken ||
          !!m.isPaired !== fields.isPaired,
      );
      if (!needsUpdate) continue;
      await this.setCanvasPairingState(
        members.map((m) => m.id),
        fields,
      );
      normalised++;
    }
    return normalised;
  }

  async backfillExplicitCanvasGroups(): Promise<{
    groupsCreated: number;
    screensStamped: number;
  }> {
    // Task #189: migrate legacy implicit grouping into explicit
    // canvas_groups rows using the prior implicit-wall semantics
    // (same clientId + same dims + ≥2 distinct positions = one
    // shared group; everything else = per-screen group). Idempotent.
    const allCanvas = await db
      .select()
      .from(screens)
      .where(eq(screens.canvasEnabled, true))
      .orderBy(asc(screens.createdAt), asc(screens.id));

    interface Bucket {
      clientId: string | null;
      w: number;
      h: number;
      members: Screen[];
    }
    const buckets = new Map<string, Bucket>();
    for (const s of allCanvas) {
      if (s.canvasGroupId) continue;
      if (
        typeof s.canvasWidth !== "number" ||
        s.canvasWidth <= 0 ||
        typeof s.canvasHeight !== "number" ||
        s.canvasHeight <= 0
      ) {
        continue;
      }
      const key = `${s.clientId ?? ""}|${s.canvasWidth}x${s.canvasHeight}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.members.push(s);
      else
        buckets.set(key, {
          clientId: s.clientId ?? null,
          w: s.canvasWidth,
          h: s.canvasHeight,
          members: [s],
        });
    }

    let groupsCreated = 0;
    let screensStamped = 0;

    for (const bucket of buckets.values()) {
      const positions = new Set<string>();
      for (const m of bucket.members) {
        positions.add(`${m.canvasX ?? 0}|${m.canvasY ?? 0}`);
      }
      if (positions.size >= 2 && bucket.members.length >= 2) {
        const lead = bucket.members[0];
        const [group] = await db
          .insert(canvasGroups)
          .values({
            clientId: bucket.clientId,
            name: `${lead.name} (canvas)`,
            canvasWidth: bucket.w,
            canvasHeight: bucket.h,
          })
          .returning();
        groupsCreated++;
        const ids = bucket.members.map((m) => m.id);
        await db
          .update(screens)
          .set({ canvasGroupId: group.id, updatedAt: new Date() })
          .where(inArray(screens.id, ids));
        screensStamped += ids.length;
      } else {
        for (const m of bucket.members) {
          const [group] = await db
            .insert(canvasGroups)
            .values({
              clientId: m.clientId ?? null,
              name: m.name,
              canvasWidth: bucket.w,
              canvasHeight: bucket.h,
            })
            .returning();
          groupsCreated++;
          await db
            .update(screens)
            .set({ canvasGroupId: group.id, updatedAt: new Date() })
            .where(eq(screens.id, m.id));
          screensStamped++;
        }
      }
    }

    return { groupsCreated, screensStamped };
  }

  async backfillExplicitCanvasGroupsOnce(): Promise<{
    groupsCreated: number;
    screensStamped: number;
    skipped: boolean;
  }> {
    // Task #189 — boot-claimed wrapper around `backfillExplicitCanvasGroups`,
    // following the same atomic-claim pattern as
    // `repairFalseCanvasPairingsOnce` (Task #179).
    //
    // The claim is *atomic*: we INSERT the marker with `ON CONFLICT
    // DO NOTHING` and check whether a row was actually returned. If
    // two app instances boot concurrently against the same DB,
    // exactly one of them sees its insert succeed (the "winner")
    // and runs the backfill; the other gets zero returned rows and
    // skips. This gives strict at-most-once semantics under
    // concurrent startup, which a naive read-then-insert pattern
    // (where both observers see the marker absent and both run the
    // backfill) would not — and avoids producing duplicate
    // canvas_groups rows on a fresh DB.
    //
    // Crash safety: the claim is recorded with a `running` status. If
    // the process crashes mid-backfill, the marker stays at `running`
    // and the next boot sees the marker as present and skips. The
    // operator's escape hatch is to delete the marker row by hand
    // (documented in the storage interface docblock and in the
    // operations runbook in replit.md). We deliberately accept
    // "stuck-running marker after a crash" as preferable to
    // "every concurrent boot re-runs the backfill", because
    // `backfillExplicitCanvasGroups` is idempotent only on a clean
    // DB (it skips screens that already carry a `canvasGroupId`),
    // not across concurrent first runs.
    const claim = await db
      .insert(systemSettings)
      .values({
        key: CANVAS_GROUPS_BACKFILL_189_MARKER_KEY,
        value: JSON.stringify({
          status: "running",
          claimedAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: systemSettings.key })
      .returning({ key: systemSettings.key });
    if (claim.length === 0) {
      return { groupsCreated: 0, screensStamped: 0, skipped: true };
    }
    const result = await this.backfillExplicitCanvasGroups();
    // Stamp the final "completed" outcome onto our claim row so the
    // marker carries forensic info (`ranAt`, counts) for ops.
    await this.setSystemSetting(
      CANVAS_GROUPS_BACKFILL_189_MARKER_KEY,
      JSON.stringify({
        status: "completed",
        ranAt: new Date().toISOString(),
        ...result,
      }),
    );
    return { ...result, skipped: false };
  }

  // ─── Canvas Groups CRUD (Task #189) ──────────────────────────────

  async getCanvasGroups(): Promise<CanvasGroup[]> {
    return db
      .select()
      .from(canvasGroups)
      .orderBy(asc(canvasGroups.createdAt), asc(canvasGroups.id));
  }

  async getCanvasGroup(id: string): Promise<CanvasGroup | undefined> {
    const [row] = await db
      .select()
      .from(canvasGroups)
      .where(eq(canvasGroups.id, id));
    return row;
  }

  async createCanvasGroup(data: InsertCanvasGroup): Promise<CanvasGroup> {
    const [row] = await db.insert(canvasGroups).values(data).returning();
    return row;
  }

  async updateCanvasGroup(
    id: string,
    data: Partial<InsertCanvasGroup>,
  ): Promise<CanvasGroup | undefined> {
    const [row] = await db
      .update(canvasGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(canvasGroups.id, id))
      .returning();
    return row;
  }

  async deleteCanvasGroup(id: string): Promise<boolean> {
    // Task #189 — refuse to delete a group that still owns screens.
    // Operators must move members off (or canvas-disable them) first;
    // otherwise the ON DELETE SET NULL would silently strand a wall
    // of screens with no group, which breaks `getCanvasMembers` and
    // the pairing fan-out. Surfaces a clear error to the route layer
    // (`409 Conflict`) instead of letting data drift.
    const referenced = await db
      .select({ id: screens.id })
      .from(screens)
      .where(eq(screens.canvasGroupId, id))
      .limit(1);
    if (referenced.length > 0) return false;
    const result = await db
      .delete(canvasGroups)
      .where(eq(canvasGroups.id, id))
      .returning({ id: canvasGroups.id });
    return result.length > 0;
  }

  async repairFalseCanvasPairingsOnce(): Promise<{
    repaired: number;
    skipped: boolean;
  }> {
    // Task #179: gate the (idempotent-but-still-destructive) Task #176
    // repair behind a one-shot marker. The repair was originally meant
    // to clean up pairing rows damaged by the pre-Task-#176 inheritance
    // backfill — once cleaned, there's no reason to keep firing it on
    // every restart, and doing so silently resets legitimately-paired
    // solo canvas screens that operators paired in good faith after the
    // fix landed. The marker is a single row in `system_settings`; once
    // present, this wrapper short-circuits and does nothing.
    //
    // The claim is *atomic*: we INSERT the marker with `ON CONFLICT DO
    // NOTHING` and check whether a row was actually returned. If two
    // app instances boot concurrently against the same DB, exactly one
    // of them sees its insert succeed (the "winner") and runs the
    // repair; the other gets zero returned rows and skips. This gives
    // strict at-most-once semantics under concurrent startup, which a
    // naive read-then-insert pattern (where both observers see the
    // marker absent and both run the repair) would not.
    //
    // Crash safety: the claim is recorded with a `running` status. If
    // the process crashes mid-repair, the marker stays at `running`
    // and the next boot sees the marker as present and skips — the
    // operator's escape hatch is to delete the marker row by hand,
    // which is documented in the storage interface docblock and
    // exercised by the tests. We deliberately accept "stuck-running
    // marker after a crash" as preferable to "every concurrent boot
    // re-runs the repair", because the underlying Task #176 damage is
    // a one-time data shape — there's nothing for the repair to do on
    // a clean DB, so a missed retry is a no-op for the common case.
    const claim = await db
      .insert(systemSettings)
      .values({
        key: CANVAS_PAIRING_REPAIR_176_MARKER_KEY,
        value: JSON.stringify({
          status: "running",
          claimedAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: systemSettings.key })
      .returning({ key: systemSettings.key });
    if (claim.length === 0) {
      return { repaired: 0, skipped: true };
    }
    const repaired = await this.repairFalseCanvasPairings();
    // Stamp the final "completed" outcome onto our claim row so the
    // marker carries forensic info (`ranAt`, `repaired`) for ops.
    await this.setSystemSetting(
      CANVAS_PAIRING_REPAIR_176_MARKER_KEY,
      JSON.stringify({
        status: "completed",
        ranAt: new Date().toISOString(),
        repaired,
      }),
    );
    return { repaired, skipped: false };
  }

  async repairFalseCanvasPairings(): Promise<number> {
    // Task #176 step 4 (now Task #189) — under explicit grouping the
    // false-grouping bug this method was written to repair can no
    // longer occur on new data: every canvas screen lives in exactly
    // one `canvas_groups` row and pairing only ever fans out to that
    // group's members. The repair therefore degrades to "any paired
    // canvas screen sitting in a lone-screen group whose pairing must
    // be the result of a legacy false-fan-out". We re-walk explicit
    // groups, find lone-member groups whose only screen is paired,
    // and reset each one's pairing identity so operators re-pair
    // intentionally.
    //
    // This still gates the original Task #179 marker so it's run at
    // most once per DB; on a clean install it does nothing.
    const allCanvas = await db
      .select()
      .from(screens)
      .where(eq(screens.canvasEnabled, true))
      .orderBy(asc(screens.createdAt), asc(screens.id));

    const groups = new Map<string, Screen[]>();
    for (const s of allCanvas) {
      if (!s.canvasGroupId) continue;
      const arr = groups.get(s.canvasGroupId);
      if (arr) arr.push(s);
      else groups.set(s.canvasGroupId, [s]);
    }

    let repaired = 0;
    for (const [, members] of groups) {
      // Real wall — pairing fan-out is legitimate, leave alone.
      if (members.length >= 2) continue;
      const lone = members[0];
      if (!lone.isPaired) continue;
      const newPairingCode = await this.generateUniquePairingCode();
      await db
        .update(screens)
        .set({
          pairingCode: newPairingCode,
          deviceToken: null,
          isPaired: false,
          isOnline: false,
          lastSeen: null,
          ipAddress: null,
          hostname: null,
          hardwareClass: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(screens.id, lone.id));
      repaired++;
    }
    return repaired;
  }

  // Generate a 6-character pairing code that's guaranteed not to
  // collide with any existing screen's `pairingCode`. Used by the
  // repair path so re-pairing flows can find each reset tile by its
  // fresh code without ambiguity. Loops until a free code is found
  // (≈36^6 ≈ 2 billion possibilities — collisions on a small fleet
  // are vanishingly rare so this normally exits on the first try).
  // Task #180: made public and used as the single source of pairing
  // codes throughout the app — create, duplicate, regenerate, unpair,
  // and PATCH/DELETE wall-leave reconciliation all flow through here
  // so the DB-level UNIQUE constraint on `screens.pairing_code` never
  // gets violated by an ad-hoc `Math.random()` callsite.
  async generateUniquePairingCode(): Promise<string> {
    // pairingCode is varchar(6) — a 6-char base36 code yields ~2.1B
    // possibilities, so even with millions of active codes the
    // probability of N consecutive collisions is vanishingly small.
    // We use a generous retry budget and refuse to return any code
    // that would violate the column length, rather than degrading
    // silently into a longer code that fails on insert.
    const MAX_ATTEMPTS = 64;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Math.random().toString(36) sometimes yields fewer than 8 chars
      // ("0.xx"), so generate enough entropy to slice 6 reliably.
      const raw = (
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2)
      ).toUpperCase();
      const candidate = raw.slice(0, 6);
      if (candidate.length !== 6) continue;
      const existing = await db
        .select({ id: screens.id })
        .from(screens)
        .where(eq(screens.pairingCode, candidate))
        .limit(1);
      if (existing.length === 0) return candidate;
    }
    throw new Error(
      `generateUniquePairingCode: exhausted ${MAX_ATTEMPTS} attempts ` +
        `without finding a free 6-char code; pairing-code namespace may be saturated`,
    );
  }

  // Task #180 (round-6 review): generateUniquePairingCode is a check-
  // then-write probe, so under high concurrency two callers can both
  // pick the same "free" code and race to write it. The DB UNIQUE
  // constraint catches the loser with a 23505 unique_violation —
  // this helper retries with a fresh code so callers never surface a
  // raw DB error to the client. The retry budget is small because the
  // base collision probability is already vanishingly small (~2.1B
  // codespace) and a tight loop here just guards the brief race
  // window between probe and INSERT/UPDATE.
  private async withPairingCodeCollisionRetry<T>(
    label: string,
    write: (code: string) => Promise<T>,
  ): Promise<T> {
    const MAX_ATTEMPTS = 8;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const code = await this.generateUniquePairingCode();
      try {
        return await write(code);
      } catch (err: unknown) {
        if (!isPairingCodeUniqueViolation(err) || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        // Lost the probe-vs-write race; mint a fresh code and retry.
        log(
          `[canvas-pairing] ${label}: pairing-code collision on attempt ${attempt}, retrying`,
        );
      }
    }
    // Unreachable — final attempt either returned or threw above.
    throw new Error(
      `withPairingCodeCollisionRetry: exhausted ${MAX_ATTEMPTS} attempts for ${label}`,
    );
  }

  async dedupePairingCodes(): Promise<number> {
    // Task #180 — boot-time dedupe so a fresh deployment that inherits
    // pre-#180 data (where walls fanned a single pairingCode across
    // every tile) can have the new DB-level UNIQUE constraint applied
    // without manual intervention. Strategy: for each duplicate
    // pairing_code, keep the EARLIEST-created row's code intact (it's
    // the canvas "owner" by the same rule as backfillCanvasPairingState)
    // and rotate every other row to a freshly-minted unique code.
    //
    // We deliberately do NOT scrub deviceToken/isPaired here — the
    // shared runtime identity of a canvas wall is still legitimate
    // shared state under #180; only the pairingCode is per-tile. The
    // backfillCanvasPairingState helper that runs immediately after
    // this in the boot sequence will keep the wall's runtime state
    // coherent. Idempotent: zero work on a clean DB.
    const allRows = await db
      .select({
        id: screens.id,
        pairingCode: screens.pairingCode,
        createdAt: screens.createdAt,
      })
      .from(screens);

    const byCode = new Map<string, typeof allRows>();
    for (const row of allRows) {
      if (!row.pairingCode) continue;
      const bucket = byCode.get(row.pairingCode) ?? [];
      bucket.push(row);
      byCode.set(row.pairingCode, bucket);
    }

    let reissued = 0;
    for (const [, bucket] of byCode) {
      if (bucket.length < 2) continue;
      bucket.sort((a, b) => {
        const aT = a.createdAt?.getTime() ?? 0;
        const bT = b.createdAt?.getTime() ?? 0;
        return aT - bT;
      });
      // Keep the earliest, reissue the rest. Round-9 review: route
      // each reissue through withPairingCodeCollisionRetry for
      // consistency with every other mint+write path. The risk is
      // tiny here (boot is single-shot per replica and the
      // codespace is ~2.1B), but using the same helper means there
      // is exactly one place in the codebase that knows how to
      // recover from a probe-vs-write race.
      for (let i = 1; i < bucket.length; i++) {
        await this.withPairingCodeCollisionRetry(
          "dedupePairingCodes",
          async (fresh) => {
            await db
              .update(screens)
              .set({ pairingCode: fresh })
              .where(eq(screens.id, bucket[i].id));
          },
        );
        reissued++;
      }
    }

    // Self-heal the DB-level UNIQUE constraint regardless of which
    // order the operator runs `npm run db:push --force` vs. starting
    // the app. Drizzle's schema (.unique() on screens.pairingCode)
    // emits this same constraint; if push has not yet run we add it
    // here, otherwise the existence check no-ops. Now that the dedupe
    // above has guaranteed uniqueness, the ADD CONSTRAINT can never
    // fail on legacy duplicate data — closing the deploy-order race
    // identified in the Task #180 review.
    //
    // Concurrency: the existence check is scoped by both conname AND
    // conrelid (so an unrelated constraint of the same name on
    // another table can never confuse us); and the ALTER itself is
    // wrapped in an EXCEPTION handler that swallows `duplicate_object`
    // — needed because under simultaneous app boots (multi-replica
    // deploys, dev hot-restarts, etc.) two processes can both pass
    // the NOT EXISTS check before either commits the ALTER. With the
    // handler, whichever loses the race no-ops cleanly instead of
    // raising. The combined check + handler makes the DDL truly
    // idempotent and safe to run on every boot.
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'screens_pairing_code_unique'
            AND conrelid = 'screens'::regclass
        ) THEN
          BEGIN
            ALTER TABLE screens
              ADD CONSTRAINT screens_pairing_code_unique
              UNIQUE (pairing_code);
          EXCEPTION WHEN duplicate_object THEN
            -- A concurrent boot won the race; their ALTER already
            -- installed the same constraint. Nothing to do.
            NULL;
          END;
        END IF;
      END $$;
    `);

    return reissued;
  }

  async markStaleScreensOffline(
    staleThresholdMs: number,
    now: Date = new Date(),
  ): Promise<Screen[]> {
    // Pure UTC-ms math — never wall-clock — so the cutoff is unaffected by
    // DST transitions in any client/site timezone.
    const cutoff = new Date(now.getTime() - staleThresholdMs);
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
    // Task #180: server is the AUTHORITATIVE source of pairing codes.
    // Any caller-supplied `pairingCode` on the InsertScreen is dropped
    // here at the storage boundary so the contract is uniform — the
    // route layer cannot accidentally pass one through, tests cannot
    // depend on it, and the DB-level UNIQUE constraint on
    // screens.pairing_code is therefore guaranteed to be respected on
    // every insert path. If a test/seeder needs a deterministic code
    // it can update the row after creation, or use db.insert directly.
    //
    // Task #189: every canvas-enabled screen MUST live in a
    // `canvas_groups` row. If the caller supplied a `canvasGroupId`
    // we trust it (the route layer validates the FK + dim match).
    // If the caller did NOT supply one but enabled canvas, we mint a
    // fresh per-screen group so `getCanvasMembers` always finds at
    // least the screen itself. Operators can move the screen into a
    // shared wall group later via the UI.
    const { pairingCode: _ignoredCallerPairingCode, ...rest } = data;

    let canvasGroupId = rest.canvasGroupId ?? null;
    if (
      rest.canvasEnabled &&
      !canvasGroupId &&
      typeof rest.canvasWidth === "number" &&
      rest.canvasWidth > 0 &&
      typeof rest.canvasHeight === "number" &&
      rest.canvasHeight > 0
    ) {
      const [group] = await db
        .insert(canvasGroups)
        .values({
          clientId: rest.clientId ?? null,
          name: rest.name,
          canvasWidth: rest.canvasWidth,
          canvasHeight: rest.canvasHeight,
        })
        .returning();
      canvasGroupId = group.id;
    }

    return await this.withPairingCodeCollisionRetry(
      "createScreen",
      async (pairingCode) => {
        const insertData: InsertScreen = {
          ...rest,
          pairingCode,
          canvasGroupId,
        };
        const [screen] = await db
          .insert(screens)
          .values(insertData)
          .returning();
        return screen;
      },
    );
  }

  async rotateScreenPairingIdentity(screenId: string): Promise<void> {
    // Task #180 — assign a fresh unique 6-char pairing code AND fully
    // scrub the screen's pairing/presence state in one statement so the
    // screen never carries around a code, deviceToken, or stale presence
    // metadata that belongs to another screen. Used by unpair/regenerate
    // (looped over wall members) and by the PATCH/DELETE wall-leave
    // reconciler. The presence fields are scrubbed to mirror what the
    // legacy repair path does — once a screen leaves a wall, any cached
    // hostname/IP/hardwareClass/lastSeen belongs to the wall's Pi, not
    // to whatever Pi will eventually re-pair this screen.
    await this.rotateScreensPairingIdentities([screenId]);
  }

  async rotateScreensPairingIdentities(screenIds: string[]): Promise<void> {
    // Task #180 (round-7 review): atomic multi-screen rotation.
    // Wrapping the loop in db.transaction means a partial DB failure
    // mid-loop rolls every rotation back, so callers like
    // regenerate / unpair never leave a wall in a half-rotated state
    // (some tiles fresh, others still sharing the old identity).
    // The collision-retry wrapper still operates per screen, but the
    // outer transaction guarantees all-or-nothing semantics across
    // the wall.
    if (screenIds.length === 0) return;
    await db.transaction(async (tx) => {
      for (const screenId of screenIds) {
        const code = await this.generateUniquePairingCode();
        const reset: Partial<InsertScreen> = {
          pairingCode: code,
          deviceToken: null,
          isPaired: false,
          isOnline: false,
          lastSeen: null,
          ipAddress: null,
          hostname: null,
          hardwareClass: null,
        };
        try {
          await tx
            .update(screens)
            .set({ ...reset, updatedAt: new Date() })
            .where(eq(screens.id, screenId));
        } catch (err: unknown) {
          // Probe-vs-write race: another writer claimed our minted
          // code in the brief window between probe and UPDATE. Retry
          // once with a fresh code; further collisions are extremely
          // unlikely (~2.1B codespace) and bubble up to roll back the
          // whole transaction so the wall stays consistent.
          if (!isPairingCodeUniqueViolation(err)) throw err;
          log(
            `[canvas-pairing] rotateScreensPairingIdentities: pairing-code collision on ${screenId}, retrying`,
          );
          const retryCode = await this.generateUniquePairingCode();
          await tx
            .update(screens)
            .set({
              ...reset,
              pairingCode: retryCode,
              updatedAt: new Date(),
            })
            .where(eq(screens.id, screenId));
        }
      }
    });
  }

  async reconcileWallPairingAfterChange(
    changedScreenId: string,
    beforeMembers: Screen[],
    options: { changedScreenDeleted?: boolean } = {},
  ): Promise<void> {
    // Task #180 — fix-up after a PATCH/DELETE that may have moved a
    // screen out of (or dissolved) a wall.
    //
    // The only case that needs action is when the change broke an
    // existing wall (≥2 members at ≥2 distinct positions). For an
    // unchanged solo screen, or for a wall that survived intact,
    // there's nothing to reconcile because nobody ever shared a
    // deviceToken to begin with (or everyone still does, legitimately).
    //
    // When the wall is broken:
    //   1. The leaving/deleted screen carries the wall's runtime
    //      deviceToken even though it's no longer a wall member —
    //      rotate its identity (skip if it was deleted; the row is
    //      gone).
    //   2. Each surviving sibling re-evaluates: if it's still part of
    //      a wall, leave it alone (the deviceToken is still legitimate
    //      shared state). If it's now solo, rotate its identity so two
    //      former tiles don't end up holding the same deviceToken.
    if (beforeMembers.length < 2) return;
    const wasInWall = beforeMembers.some((m) => m.id === changedScreenId);
    if (!wasInWall) return;

    let leftWall = false;
    if (options.changedScreenDeleted) {
      leftWall = true;
    } else {
      const after = await this.getScreen(changedScreenId);
      if (!after) {
        leftWall = true;
      } else {
        const afterMembers = await this.getCanvasMembers(after);
        const beforeIds = new Set(beforeMembers.map((m) => m.id));
        const afterIds = new Set(afterMembers.map((m) => m.id));
        const sameWall =
          afterMembers.length > 1 &&
          afterMembers.some((m) => m.id === changedScreenId) &&
          beforeIds.size === afterIds.size &&
          [...beforeIds].every((id) => afterIds.has(id));
        leftWall = !sameWall;
      }
    }
    if (!leftWall) return;

    // 1. Rotate the leaver unconditionally (skip only when deleted —
    // the row is already gone). Task #180 requires every screen that
    // leaves a wall to get a fresh unique pairingCode regardless of
    // whether the wall was paired (had a deviceToken) at the time —
    // even an unpaired-but-shared code (legacy duplicate) must be
    // reissued so the screen carries a code unique to itself going
    // forward. rotateScreenPairingIdentity is a no-op-safe scrub of
    // device/presence state when those fields are already null.
    if (!options.changedScreenDeleted) {
      const after = await this.getScreen(changedScreenId);
      if (after) {
        await this.rotateScreenPairingIdentity(changedScreenId);
      }
    }

    // 2. Survivors. Look up the wall state from any survivor; if it
    // still resolves to ≥2 members the wall held together and we
    // leave them alone (their shared deviceToken/state is still
    // legitimate). Otherwise the wall has dissolved into solo
    // screens — rotate every one of them unconditionally so no two
    // former tiles ever end up sharing a pairingCode (or a stale
    // wall deviceToken). Round-7 review: rotate the survivors as a
    // single transaction so a partial failure can't leave the
    // dissolved wall half-rotated.
    const survivorIds = beforeMembers
      .map((m) => m.id)
      .filter((id) => id !== changedScreenId);
    if (survivorIds.length === 0) return;
    const firstSurvivor = await this.getScreen(survivorIds[0]);
    if (!firstSurvivor) return;
    const survivorMembers = await this.getCanvasMembers(firstSurvivor);
    if (survivorMembers.length > 1) return;
    const liveSurvivorIds: string[] = [];
    for (const sid of survivorIds) {
      const surv = await this.getScreen(sid);
      if (surv) liveSurvivorIds.push(sid);
    }
    await this.rotateScreensPairingIdentities(liveSurvivorIds);
  }

  async forfeitWallPairing(screenId: string): Promise<void> {
    // Task #185 — Pi-side unpair signal. The player calls this just
    // before clearing its localStorage device token (e.g. after two
    // consecutive 401/403s from /content). We mirror the Pi's local
    // state into the DB so the screens page surfaces "Unpaired"
    // (amber) instead of "Offline" (red) — the operator instantly
    // sees that they need to re-pair, not that the Pi is dead.
    //
    // For canvas walls we clear pairing on EVERY member because the
    // wall shares one deviceToken under Task #176/#180 — if the Pi
    // ditched the token, no tile in the wall is paired anymore.
    //
    // Critically: pairingCode is PRESERVED. Unlike
    // rotateScreenPairingIdentity (which mints a fresh code on
    // wall-leave / regenerate / unpair-from-app), this path is the
    // Pi voluntarily walking away — the operator's existing pairing
    // code on the screens page should still work for the next
    // re-pair attempt.
    const screen = await this.getScreen(screenId);
    if (!screen) return;
    const members = await this.getCanvasMembers(screen);
    if (members.length === 0) return;
    await this.setCanvasPairingState(
      members.map((m) => m.id),
      {
        deviceToken: null,
        isPaired: false,
        isOnline: false,
        lastSeen: null,
        ipAddress: null,
        hostname: null,
        hardwareClass: null,
      },
    );
  }

  async duplicateScreen(sourceId: string, name: string): Promise<Screen | undefined> {
    const [source] = await db.select().from(screens).where(eq(screens.id, sourceId));
    if (!source) return undefined;
    // Task #189 — when duplicating a canvas-enabled screen we must
    // NOT clone its `canvasGroupId`. Two reasons:
    //   1. Cloning the FK would silently make the duplicate a wall
    //      sibling of the original, fanning pairing identity across
    //      what the operator clearly intends as an independent screen
    //      ("Duplicate" in the UI is a "give me a fresh copy" affordance,
    //      not "add another tile to this wall" — that's the canvas-
    //      group picker).
    //   2. The duplicate's position will overlap the source until the
    //      operator moves it, which is fine for a separate group but
    //      would re-introduce the false-grouping the explicit FK was
    //      built to eliminate.
    // We mint a per-screen group using the source's dims so the
    // duplicate lands in the canonical "canvas-enabled + own group"
    // shape. A canvas-disabled source produces a canvas-disabled
    // duplicate with no group (correct).
    let duplicateCanvasGroupId: string | null = null;
    if (
      source.canvasEnabled &&
      typeof source.canvasWidth === "number" &&
      source.canvasWidth > 0 &&
      typeof source.canvasHeight === "number" &&
      source.canvasHeight > 0
    ) {
      const [freshGroup] = await db
        .insert(canvasGroups)
        .values({
          clientId: source.clientId,
          name,
          canvasWidth: source.canvasWidth,
          canvasHeight: source.canvasHeight,
        })
        .returning();
      duplicateCanvasGroupId = freshGroup.id;
    }
    // Task #180 (round-7 review): route the mint+write through the
    // collision-retry helper so duplicateScreen has the same race-
    // safety guarantee as createScreen / rotateScreenPairingIdentity.
    return await this.withPairingCodeCollisionRetry(
      "duplicateScreen",
      async (pairingCode) => {
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
          canvasGroupId: duplicateCanvasGroupId,
          screenshotEnabled: source.screenshotEnabled,
          testPatternEnabled: source.testPatternEnabled,
          showLiveBanner: source.showLiveBanner,
          hideNoContentMessage: source.hideNoContentMessage,
          roomCapacity: source.roomCapacity,
          weatherLat: source.weatherLat,
          weatherLng: source.weatherLng,
          weatherPlaceName: source.weatherPlaceName,
          weatherUnit: source.weatherUnit,
          // Reset runtime / identity fields.
          pairingCode,
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
        const [created] = await db
          .insert(screens)
          .values(insertValues)
          .returning();
        return created;
      },
    );
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

  // Booking overlap is enforced inside a per-screen advisory-locked
  // transaction. We previously also had a Postgres GIST exclusion
  // constraint as belt-and-braces, but it required the `btree_gist`
  // extension which unprivileged production DB users cannot install.
  // The advisory lock serialises all writers for a given screen, so
  // the in-transaction overlap query is authoritative: between SELECT
  // and INSERT/UPDATE no other booking-writing transaction for the
  // same screen can commit.
  async createScreenEventBooking(data: InsertScreenEventBooking): Promise<ScreenEventBooking> {
    const startsAt = data.startsAt instanceof Date ? data.startsAt : new Date(data.startsAt);
    const endsAt = data.endsAt instanceof Date ? data.endsAt : new Date(data.endsAt);
    if (!(endsAt > startsAt)) {
      throw new Error("Booking end must be after start");
    }
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${data.screenId}, 0))`,
      );
      const overlaps = await tx
        .select({ id: screenEventBookings.id })
        .from(screenEventBookings)
        .where(
          and(
            eq(screenEventBookings.screenId, data.screenId),
            lt(screenEventBookings.startsAt, endsAt),
            sql`${screenEventBookings.endsAt} > ${startsAt}`,
          ),
        );
      if (overlaps.length > 0) {
        throw new Error("Booking overlaps with an existing booking on this screen");
      }
      const [row] = await tx
        .insert(screenEventBookings)
        .values({ ...data, startsAt, endsAt })
        .returning();
      return row;
    });
  }

  async updateScreenEventBooking(
    id: string,
    data: Partial<InsertScreenEventBooking>,
  ): Promise<ScreenEventBooking | undefined> {
    const candidateStarts = data.startsAt
      ? (data.startsAt instanceof Date ? data.startsAt : new Date(data.startsAt))
      : undefined;
    const candidateEnds = data.endsAt
      ? (data.endsAt instanceof Date ? data.endsAt : new Date(data.endsAt))
      : undefined;
    return await db.transaction(async (tx) => {
      // SELECT ... FOR UPDATE pins the booking row so any other concurrent
      // update to the same booking blocks here until we commit. That means
      // the target screenId we compute below is authoritative — no other
      // transaction can have moved this booking out from under us between
      // read and write.
      const [existing] = await tx
        .select()
        .from(screenEventBookings)
        .where(eq(screenEventBookings.id, id))
        .for("update");
      if (!existing) return undefined;
      const targetScreenId = data.screenId ?? existing.screenId;
      const startsAt = candidateStarts ?? existing.startsAt;
      const endsAt = candidateEnds ?? existing.endsAt;
      if (!(endsAt > startsAt)) {
        throw new Error("Booking end must be after start");
      }
      // Per-screen advisory lock on the destination screen (we never add a
      // booking to the source screen on update, so no source lock needed).
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${targetScreenId}, 0))`,
      );
      const overlaps = await tx
        .select({ id: screenEventBookings.id })
        .from(screenEventBookings)
        .where(
          and(
            eq(screenEventBookings.screenId, targetScreenId),
            lt(screenEventBookings.startsAt, endsAt),
            sql`${screenEventBookings.endsAt} > ${startsAt}`,
          ),
        );
      if (overlaps.some((r) => r.id !== id)) {
        throw new Error("Booking overlaps with an existing booking on this screen");
      }
      const [row] = await tx
        .update(screenEventBookings)
        .set({ ...data, startsAt, endsAt, updatedAt: new Date() })
        .where(eq(screenEventBookings.id, id))
        .returning();
      return row;
    });
  }

  async deleteScreenEventBooking(id: string): Promise<boolean> {
    const result = await db.delete(screenEventBookings).where(eq(screenEventBookings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCurrentEventForScreen(screenId: string, now: Date = new Date()): Promise<Event | undefined> {
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

  // Media Folders (Task #265)
  async getMediaFolders(clientId?: string): Promise<MediaFolder[]> {
    const query = db.select().from(mediaFolders);
    if (clientId) {
      return query.where(eq(mediaFolders.clientId, clientId)).orderBy(asc(mediaFolders.name));
    }
    return query.orderBy(asc(mediaFolders.name));
  }

  async getMediaFolder(id: string): Promise<MediaFolder | undefined> {
    const [folder] = await db.select().from(mediaFolders).where(eq(mediaFolders.id, id));
    return folder;
  }

  async createMediaFolder(data: InsertMediaFolder): Promise<MediaFolder> {
    const [folder] = await db.insert(mediaFolders).values(data).returning();
    return folder;
  }

  async updateMediaFolder(id: string, data: Partial<InsertMediaFolder>): Promise<MediaFolder | undefined> {
    const [folder] = await db
      .update(mediaFolders)
      .set(data)
      .where(eq(mediaFolders.id, id))
      .returning();
    return folder;
  }

  async deleteMediaFolder(id: string): Promise<boolean> {
    const result = await db.delete(mediaFolders).where(eq(mediaFolders.id, id));
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

  // Custom Fonts (Task #281)
  async getCustomFonts(clientId: string): Promise<CustomFont[]> {
    return db
      .select()
      .from(customFonts)
      .where(eq(customFonts.clientId, clientId))
      .orderBy(customFonts.name, customFonts.weight);
  }

  async getCustomFont(id: string): Promise<CustomFont | undefined> {
    const [font] = await db.select().from(customFonts).where(eq(customFonts.id, id));
    return font;
  }

  async getCustomFontsByFamily(familyId: string): Promise<CustomFont[]> {
    return db
      .select()
      .from(customFonts)
      .where(eq(customFonts.familyId, familyId))
      .orderBy(customFonts.weight);
  }

  async createCustomFont(data: InsertCustomFont): Promise<CustomFont> {
    const [font] = await db.insert(customFonts).values(data).returning();
    return font;
  }

  async deleteCustomFont(id: string): Promise<boolean> {
    const result = await db.delete(customFonts).where(eq(customFonts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteCustomFontFamily(familyId: string): Promise<boolean> {
    const result = await db.delete(customFonts).where(eq(customFonts.familyId, familyId));
    return (result.rowCount ?? 0) > 0;
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
    const values: typeof layoutTemplates.$inferInsert = data as typeof layoutTemplates.$inferInsert;
    const [template] = await db.insert(layoutTemplates).values(values).returning();
    return template;
  }

  async updateLayoutTemplate(id: string, data: Partial<InsertLayoutTemplate>): Promise<LayoutTemplate | undefined> {
    const patch: Partial<typeof layoutTemplates.$inferInsert> = { ...data, updatedAt: new Date() } as Partial<typeof layoutTemplates.$inferInsert>;
    const [template] = await db
      .update(layoutTemplates)
      .set(patch)
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
    return db
      .select()
      .from(programmes)
      .orderBy(sql`${programmes.displayOrder} ASC NULLS LAST`, desc(programmes.createdAt));
  }

  async getProgramme(id: string): Promise<Programme | undefined> {
    const [programme] = await db.select().from(programmes).where(eq(programmes.id, id));
    return programme;
  }

  async createProgramme(data: InsertProgramme): Promise<Programme> {
    const [programme] = await db
      .insert(programmes)
      .values({
        ...data,
        // Atomically assign the next displayOrder so newly created programmes
        // appear at the end of the user-defined order.
        displayOrder: sql<number>`coalesce((select max(${programmes.displayOrder}) from ${programmes}), -1) + 1` as unknown as number,
      })
      .returning();
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

  async reorderProgrammes(orderedIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(programmes)
          .set({ displayOrder: i })
          .where(eq(programmes.id, orderedIds[i]));
      }
    });
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
    const values: typeof scheduleBlocks.$inferInsert = data as typeof scheduleBlocks.$inferInsert;
    const [block] = await db.insert(scheduleBlocks).values(values).returning();
    return block;
  }

  async updateScheduleBlock(id: string, data: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined> {
    const patch: Partial<typeof scheduleBlocks.$inferInsert> = data as Partial<typeof scheduleBlocks.$inferInsert>;
    const [block] = await db
      .update(scheduleBlocks)
      .set(patch)
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
    const values: typeof screenPresets.$inferInsert = data as typeof screenPresets.$inferInsert;
    const [preset] = await db.insert(screenPresets).values(values).returning();
    return preset;
  }

  async updateScreenPreset(id: string, data: Partial<InsertScreenPreset>): Promise<ScreenPreset | undefined> {
    const patch: Partial<typeof screenPresets.$inferInsert> = data as Partial<typeof screenPresets.$inferInsert>;
    const [preset] = await db
      .update(screenPresets)
      .set(patch)
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
    const values: typeof liveOverrides.$inferInsert = data as typeof liveOverrides.$inferInsert;
    const [override] = await db.insert(liveOverrides).values(values).returning();
    return override;
  }

  async updateLiveOverride(id: string, data: Partial<InsertLiveOverride>): Promise<LiveOverride | undefined> {
    const patch: Partial<typeof liveOverrides.$inferInsert> = data as Partial<typeof liveOverrides.$inferInsert>;
    const [override] = await db
      .update(liveOverrides)
      .set(patch)
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

  // Video Health Samples (Task #200)
  async createVideoHealthSample(data: InsertVideoHealthSample): Promise<VideoHealthSample> {
    const [sample] = await db.insert(videoHealthSamples).values(data).returning();
    return sample;
  }

  async getVideoHealthSamples(screenId: string, since: Date): Promise<VideoHealthSample[]> {
    return db
      .select()
      .from(videoHealthSamples)
      .where(and(eq(videoHealthSamples.screenId, screenId), gte(videoHealthSamples.timestamp, since)))
      .orderBy(asc(videoHealthSamples.timestamp));
  }

  async pruneVideoHealthSamples(olderThan: Date): Promise<number> {
    const result = await db
      .delete(videoHealthSamples)
      .where(lt(videoHealthSamples.timestamp, olderThan));
    return result.rowCount ?? 0;
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

  // Agenda Items (Task #208)
  async getAgendaItems(clientId?: string): Promise<AgendaItem[]> {
    if (clientId) {
      return db
        .select()
        .from(agendaItems)
        .where(eq(agendaItems.clientId, clientId))
        .orderBy(asc(agendaItems.startsAt));
    }
    return db.select().from(agendaItems).orderBy(asc(agendaItems.startsAt));
  }

  async getAgendaItem(id: string): Promise<AgendaItem | undefined> {
    const [row] = await db.select().from(agendaItems).where(eq(agendaItems.id, id));
    return row;
  }

  async createAgendaItem(data: InsertAgendaItem): Promise<AgendaItem> {
    const [row] = await db.insert(agendaItems).values(data).returning();
    return row;
  }

  async createAgendaItemsBulk(rows: InsertAgendaItem[]): Promise<AgendaItem[]> {
    if (rows.length === 0) return [];
    return db.insert(agendaItems).values(rows).returning();
  }

  async updateAgendaItem(id: string, data: Partial<InsertAgendaItem>): Promise<AgendaItem | undefined> {
    const [row] = await db
      .update(agendaItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agendaItems.id, id))
      .returning();
    return row;
  }

  async deleteAgendaItem(id: string): Promise<boolean> {
    const result = await db.delete(agendaItems).where(eq(agendaItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAgendaItemsForClient(clientId: string): Promise<number> {
    const result = await db.delete(agendaItems).where(eq(agendaItems.clientId, clientId));
    return result.rowCount ?? 0;
  }

  // Agenda Sync Configs (Task #210)
  async getAgendaSyncConfigs(clientId?: string): Promise<AgendaSyncConfig[]> {
    if (clientId) {
      return db
        .select()
        .from(agendaSyncConfigs)
        .where(eq(agendaSyncConfigs.clientId, clientId))
        .orderBy(desc(agendaSyncConfigs.createdAt));
    }
    return db.select().from(agendaSyncConfigs).orderBy(desc(agendaSyncConfigs.createdAt));
  }

  async getAgendaSyncConfig(id: string): Promise<AgendaSyncConfig | undefined> {
    const [row] = await db.select().from(agendaSyncConfigs).where(eq(agendaSyncConfigs.id, id));
    return row;
  }

  async createAgendaSyncConfig(data: InsertAgendaSyncConfig): Promise<AgendaSyncConfig> {
    const [row] = await db.insert(agendaSyncConfigs).values(data).returning();
    return row;
  }

  async updateAgendaSyncConfig(
    id: string,
    data: Partial<AgendaSyncConfig>,
  ): Promise<AgendaSyncConfig | undefined> {
    const [row] = await db
      .update(agendaSyncConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agendaSyncConfigs.id, id))
      .returning();
    return row;
  }

  async deleteAgendaSyncConfig(id: string): Promise<boolean> {
    const result = await db.delete(agendaSyncConfigs).where(eq(agendaSyncConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAgendaItemsBySyncConfig(syncConfigId: string): Promise<AgendaItem[]> {
    return db
      .select()
      .from(agendaItems)
      .where(eq(agendaItems.externalSyncConfigId, syncConfigId))
      .orderBy(asc(agendaItems.startsAt));
  }

  // Agenda Widget Configs (Task #208)
  async getAgendaWidgetConfigs(clientId?: string): Promise<AgendaWidgetConfig[]> {
    if (clientId) {
      return db
        .select()
        .from(agendaWidgetConfigs)
        .where(eq(agendaWidgetConfigs.clientId, clientId))
        .orderBy(desc(agendaWidgetConfigs.createdAt));
    }
    return db.select().from(agendaWidgetConfigs).orderBy(desc(agendaWidgetConfigs.createdAt));
  }

  async getAgendaWidgetConfig(id: string): Promise<AgendaWidgetConfig | undefined> {
    const [row] = await db.select().from(agendaWidgetConfigs).where(eq(agendaWidgetConfigs.id, id));
    return row;
  }

  async createAgendaWidgetConfig(data: InsertAgendaWidgetConfig): Promise<AgendaWidgetConfig> {
    const [row] = await db.insert(agendaWidgetConfigs).values(data).returning();
    return row;
  }

  async updateAgendaWidgetConfig(
    id: string,
    data: Partial<InsertAgendaWidgetConfig>,
  ): Promise<AgendaWidgetConfig | undefined> {
    const [row] = await db
      .update(agendaWidgetConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agendaWidgetConfigs.id, id))
      .returning();
    return row;
  }

  async deleteAgendaWidgetConfig(id: string): Promise<boolean> {
    const result = await db.delete(agendaWidgetConfigs).where(eq(agendaWidgetConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getResolvedAgendaForConfig(
    configId: string,
    now: Date,
  ): Promise<{ config: AgendaWidgetConfig; items: AgendaItem[] } | undefined> {
    const config = await this.getAgendaWidgetConfig(configId);
    if (!config) return undefined;
    const pool = await this.getAgendaItems(config.clientId);
    const { resolveAgendaItems } = await import("@shared/agenda-resolver");
    // Task #240 — pass the client's tz so today_tomorrow mode buckets
    // items by the site's local calendar day, not the server's UTC day.
    const client = await this.getClient(config.clientId);
    const items = resolveAgendaItems({
      items: pool,
      config,
      now,
      tz: client?.timezone ?? null,
    });
    return { config, items };
  }

  // ===== Sweepstake widget (Task #286) =====
  async getSweepstakeConfigs(clientId?: string): Promise<SweepstakeWidgetConfig[]> {
    if (clientId) {
      return db.select().from(sweepstakeWidgetConfigs)
        .where(eq(sweepstakeWidgetConfigs.clientId, clientId))
        .orderBy(sweepstakeWidgetConfigs.name);
    }
    return db.select().from(sweepstakeWidgetConfigs).orderBy(sweepstakeWidgetConfigs.name);
  }

  async getSweepstakeConfig(id: string): Promise<SweepstakeWidgetConfig | undefined> {
    const [row] = await db.select().from(sweepstakeWidgetConfigs).where(eq(sweepstakeWidgetConfigs.id, id));
    return row;
  }

  async createSweepstakeConfig(data: InsertSweepstakeWidgetConfig): Promise<SweepstakeWidgetConfig> {
    const [row] = await db.insert(sweepstakeWidgetConfigs).values(data).returning();
    return row;
  }

  async updateSweepstakeConfig(
    id: string,
    data: Partial<InsertSweepstakeWidgetConfig> & { lastSyncedAt?: Date | null; lastSyncError?: string | null },
  ): Promise<SweepstakeWidgetConfig | undefined> {
    const [row] = await db.update(sweepstakeWidgetConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sweepstakeWidgetConfigs.id, id))
      .returning();
    return row;
  }

  async deleteSweepstakeConfig(id: string): Promise<boolean> {
    const result = await db.delete(sweepstakeWidgetConfigs).where(eq(sweepstakeWidgetConfigs.id, id)).returning();
    return result.length > 0;
  }

  async getTournamentTeams(configId: string): Promise<TournamentTeam[]> {
    return db.select().from(tournamentTeams)
      .where(eq(tournamentTeams.configId, configId))
      .orderBy(tournamentTeams.groupName, tournamentTeams.name);
  }

  async getTournamentTeam(id: string): Promise<TournamentTeam | undefined> {
    const [row] = await db.select().from(tournamentTeams).where(eq(tournamentTeams.id, id));
    return row;
  }

  async createTournamentTeam(data: InsertTournamentTeam): Promise<TournamentTeam> {
    const [row] = await db.insert(tournamentTeams).values(data).returning();
    return row;
  }

  async updateTournamentTeam(
    id: string,
    data: Partial<InsertTournamentTeam> & { eliminatedAt?: Date | null },
  ): Promise<TournamentTeam | undefined> {
    const [row] = await db.update(tournamentTeams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tournamentTeams.id, id))
      .returning();
    return row;
  }

  // Enforce a single winner per config: flag the given team (if any) as the
  // winner and clear isWinner on every other team in the same config. Runs in
  // one transaction so a config never persists two simultaneous winners.
  async setTournamentWinner(configId: string, teamId: string | null): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(tournamentTeams)
        .set({ isWinner: false, updatedAt: new Date() })
        .where(and(eq(tournamentTeams.configId, configId), eq(tournamentTeams.isWinner, true)));
      if (teamId) {
        await tx.update(tournamentTeams)
          .set({ isWinner: true, eliminated: false, eliminatedAt: null, updatedAt: new Date() })
          .where(and(eq(tournamentTeams.id, teamId), eq(tournamentTeams.configId, configId)));
      }
    });
  }

  // Replace-all sync: preserves elimination/winner flags by name match so a
  // provider refresh never clobbers locally-tracked sweepstake progress.
  async replaceTournamentTeams(configId: string, teams: InsertTournamentTeam[]): Promise<TournamentTeam[]> {
    return db.transaction(async (tx) => {
      const existing = await tx.select().from(tournamentTeams).where(eq(tournamentTeams.configId, configId));
      const prev = new Map(existing.map((t) => [(t.externalId ?? t.name).toLowerCase(), t]));
      await tx.delete(tournamentTeams).where(eq(tournamentTeams.configId, configId));
      if (teams.length === 0) return [];
      const rows = teams.map((t) => {
        const match = prev.get((t.externalId ?? t.name).toLowerCase());
        return {
          ...t,
          configId,
          eliminated: t.eliminated ?? match?.eliminated ?? false,
          eliminatedAt: match?.eliminatedAt ?? null,
          isWinner: t.isWinner ?? match?.isWinner ?? false,
        };
      });
      return tx.insert(tournamentTeams).values(rows).returning();
    });
  }

  async getTournamentMatches(configId: string): Promise<TournamentMatch[]> {
    return db.select().from(tournamentMatches)
      .where(eq(tournamentMatches.configId, configId))
      .orderBy(tournamentMatches.kickoffAt);
  }

  async replaceTournamentMatches(configId: string, matches: InsertTournamentMatch[]): Promise<TournamentMatch[]> {
    return db.transaction(async (tx) => {
      await tx.delete(tournamentMatches).where(eq(tournamentMatches.configId, configId));
      if (matches.length === 0) return [];
      return tx.insert(tournamentMatches).values(matches.map((m) => ({ ...m, configId }))).returning();
    });
  }

  async getTournamentStandings(configId: string): Promise<TournamentStanding[]> {
    return db.select().from(tournamentStandings)
      .where(eq(tournamentStandings.configId, configId))
      .orderBy(tournamentStandings.groupName, tournamentStandings.position);
  }

  async replaceTournamentStandings(configId: string, standings: InsertTournamentStanding[]): Promise<TournamentStanding[]> {
    return db.transaction(async (tx) => {
      await tx.delete(tournamentStandings).where(eq(tournamentStandings.configId, configId));
      if (standings.length === 0) return [];
      return tx.insert(tournamentStandings).values(standings.map((s) => ({ ...s, configId }))).returning();
    });
  }

  async getSweepstakeParticipants(configId: string): Promise<SweepstakeParticipant[]> {
    return db.select().from(sweepstakeParticipants)
      .where(eq(sweepstakeParticipants.configId, configId))
      .orderBy(sweepstakeParticipants.name);
  }

  async getSweepstakeParticipant(id: string): Promise<SweepstakeParticipant | undefined> {
    const [row] = await db.select().from(sweepstakeParticipants).where(eq(sweepstakeParticipants.id, id));
    return row;
  }

  async createSweepstakeParticipant(data: InsertSweepstakeParticipant): Promise<SweepstakeParticipant> {
    const [row] = await db.insert(sweepstakeParticipants).values(data).returning();
    return row;
  }

  async updateSweepstakeParticipant(
    id: string,
    data: Partial<InsertSweepstakeParticipant>,
  ): Promise<SweepstakeParticipant | undefined> {
    const [row] = await db.update(sweepstakeParticipants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sweepstakeParticipants.id, id))
      .returning();
    return row;
  }

  async deleteSweepstakeParticipant(id: string): Promise<boolean> {
    const result = await db.delete(sweepstakeParticipants).where(eq(sweepstakeParticipants.id, id)).returning();
    return result.length > 0;
  }

  async deleteSweepstakeParticipantsForConfig(configId: string): Promise<number> {
    const result = await db.delete(sweepstakeParticipants).where(eq(sweepstakeParticipants.configId, configId)).returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();


// Task #268 — Microsoft Graph access for the Agenda Spreadsheet Source Mapper.
// Task #369 — Replaced Replit-only connector proxy with production Entra OAuth.
//
// Token resolution order (see resolveAccessToken):
//   1. Entra OAuth via @azure/msal-node (production path — getEntraAccessToken).
//   2. Replit connector proxy (development-only adapter, disabled in production).
//
// Graph transport is strictly read-only:
//   - Only GET and HEAD are allowed (assertGraphMethodAllowed).
//   - Only graph.microsoft.com is reachable (assertGraphHost).
//   - The Authorization header is never forwarded to any other host.

import {
  getEntraAccessToken,
  getMicrosoftEntraStatus,
  MicrosoftEntraNotConfiguredError,
  MicrosoftEntraNotConnectedError,
  MicrosoftEntraRefreshError,
} from "./microsoftOAuth";

// =====================================================================
// Replit connector adapter (development-only)
// =====================================================================
//
// The original Task #268 implementation used Replit's connector credential
// proxy (REPLIT_CONNECTORS_HOSTNAME) to fetch access tokens. This adapter is
// retained ONLY for local Replit development and is hard-disabled in
// production (NODE_ENV=production). It must never be used on Plesk.
//
// Amendment #2 requirements:
//   - Disabled when NODE_ENV=production (fails closed).
//   - Requires REPLIT_CONNECTORS_HOSTNAME to be present.
//   - Production missing Entra config → MicrosoftNotConnectedError (no fallback).

export type MicrosoftConnectorName = "onedrive" | "sharepoint";
const MICROSOFT_CONNECTOR_NAMES: MicrosoftConnectorName[] = ["onedrive", "sharepoint"];

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_HOST = "graph.microsoft.com";

interface ConnectorConnection {
  access_token?: string;
  settings?: {
    access_token?: string;
    oauth?: { credentials?: { access_token?: string } };
    expires_at?: string;
  };
}

export interface MicrosoftConnectionStatus {
  connected: boolean;
  connectors: MicrosoftConnectorName[];
  /** "entra" in production; "replit_dev" in development via Replit adapter; null = disconnected. */
  provider: "entra" | "replit_dev" | null;
  /** True when the calling user is a system admin who can trigger the connect flow. */
  canConnect?: boolean;
}

export class MicrosoftNotConnectedError extends Error {
  constructor(message = MICROSOFT_NOT_CONNECTED_MESSAGE) {
    super(message);
    this.name = "MicrosoftNotConnectedError";
  }
}

export const MICROSOFT_NOT_CONNECTED_MESSAGE =
  "Microsoft isn't connected yet. An administrator must connect a Microsoft account before VectorMesh can read private OneDrive/SharePoint files.";

function getReplitToken(): string | null {
  if (process.env.REPL_IDENTITY) return `repl ${process.env.REPL_IDENTITY}`;
  if (process.env.WEB_REPL_RENEWAL) return `depl ${process.env.WEB_REPL_RENEWAL}`;
  return null;
}

function extractAccessToken(conn: ConnectorConnection | undefined): string | null {
  if (!conn) return null;
  return (
    conn.settings?.access_token ??
    conn.settings?.oauth?.credentials?.access_token ??
    conn.access_token ??
    null
  );
}

/**
 * Fetch a token from the Replit connector proxy.
 * NEVER called in production (NODE_ENV=production).
 */
async function fetchConnectorToken(
  connectorName: MicrosoftConnectorName,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = getReplitToken();
  if (!hostname || !xReplitToken) return null;
  const url = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${encodeURIComponent(
    connectorName,
  )}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: { items?: ConnectorConnection[] };
  try {
    data = (await res.json()) as { items?: ConnectorConnection[] };
  } catch {
    return null;
  }
  return extractAccessToken(data.items?.[0]);
}

// =====================================================================
// Transport guards
// =====================================================================

/**
 * Assert the Graph request method is GET or HEAD.
 * POST, PUT, PATCH and DELETE are statically forbidden — this module is
 * read-only and must never mutate Microsoft Graph resources.
 */
export function assertGraphMethodAllowed(method: string): void {
  if (method !== "GET" && method !== "HEAD") {
    throw new Error(
      `Microsoft Graph transport: method "${method}" is not permitted. ` +
        "Only GET and HEAD requests are issued by VectorMesh.",
    );
  }
}

/**
 * Assert the URL targets graph.microsoft.com and no other host.
 * Prevents the Authorization header from being forwarded to a different host.
 */
export function assertGraphHost(urlString: string): void {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error(`Microsoft Graph transport: invalid URL: ${urlString}`);
  }
  if (u.protocol !== "https:") {
    throw new Error(`Microsoft Graph transport: only HTTPS is permitted, got ${u.protocol}`);
  }
  if (u.hostname !== GRAPH_HOST) {
    throw new Error(
      `Microsoft Graph transport: host "${u.hostname}" is not allowed. ` +
        `Only ${GRAPH_HOST} may be contacted.`,
    );
  }
}

// =====================================================================
// Token resolution
// =====================================================================

/**
 * Resolve a live Microsoft Graph access token.
 *
 * Production path: Entra OAuth via getEntraAccessToken.
 * Development fallback (NODE_ENV ≠ production AND REPLIT_CONNECTORS_HOSTNAME set):
 *   Replit connector proxy as explicit opt-in dev adapter.
 * Otherwise: throws MicrosoftNotConnectedError.
 */
async function resolveAccessToken(
  prefer: MicrosoftConnectorName | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  // 1. Entra OAuth (always tried first).
  try {
    return await getEntraAccessToken(fetchImpl);
  } catch (e) {
    if (
      !(e instanceof MicrosoftEntraNotConnectedError) &&
      !(e instanceof MicrosoftEntraNotConfiguredError) &&
      !(e instanceof MicrosoftEntraRefreshError)
    ) {
      // Unexpected error (e.g. encryption key missing) — rethrow.
      throw e;
    }
    // MicrosoftEntraRefreshError: refresh failed (revoked/expired consent).
    // Surface as MicrosoftNotConnectedError so callers show the connect UI.
    if (e instanceof MicrosoftEntraRefreshError) {
      throw new MicrosoftNotConnectedError(
        "Microsoft connection lost — the token could not be refreshed. " +
          "An administrator must reconnect the Microsoft account.",
      );
    }
    // MicrosoftEntraNotConnectedError: no credential row → try dev adapter.
    // MicrosoftEntraNotConfiguredError: env vars absent → try dev adapter (dev only).
    // Both fall through; production guard below ensures fail-closed in prod.
  }

  // 2. Replit connector adapter — DEVELOPMENT ONLY.
  //    Hard-disabled in production: NODE_ENV=production fails closed.
  if (process.env.NODE_ENV === "production") {
    throw new MicrosoftNotConnectedError();
  }
  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
    throw new MicrosoftNotConnectedError();
  }

  const order: MicrosoftConnectorName[] = prefer
    ? [prefer, ...MICROSOFT_CONNECTOR_NAMES.filter((n) => n !== prefer)]
    : [...MICROSOFT_CONNECTOR_NAMES];
  for (const name of order) {
    const token = await fetchConnectorToken(name, fetchImpl);
    if (token) return token;
  }
  throw new MicrosoftNotConnectedError();
}

/**
 * Report which Microsoft provider is currently usable.
 * Drives the "Connect Microsoft" UI state.
 */
export async function getMicrosoftConnectionStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<MicrosoftConnectionStatus> {
  // Check Entra first.
  const entraStatus = await getMicrosoftEntraStatus();
  if (entraStatus.connected) {
    return { connected: true, connectors: [], provider: "entra" };
  }

  // Check Replit dev adapter (only outside production).
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.REPLIT_CONNECTORS_HOSTNAME
  ) {
    const connectors: MicrosoftConnectorName[] = [];
    for (const name of MICROSOFT_CONNECTOR_NAMES) {
      const token = await fetchConnectorToken(name, fetchImpl);
      if (token) connectors.push(name);
    }
    if (connectors.length > 0) {
      return { connected: true, connectors, provider: "replit_dev" };
    }
  }

  return { connected: false, connectors: [], provider: null };
}

// =====================================================================
// Graph HTTP helpers
// =====================================================================

async function graphGet(
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  assertGraphHost(url);
  assertGraphMethodAllowed("GET");
  return fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

async function graphGetJson<T>(
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  const res = await graphGet(path, token, fetchImpl);
  if (!res.ok) {
    const detail = await safeReadError(res);
    throw new Error(`Microsoft Graph request failed (HTTP ${res.status})${detail}`);
  }
  return (await res.json()) as T;
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body?.error?.message) return `: ${body.error.message}`;
  } catch {
    /* ignore */
  }
  return "";
}

// =====================================================================
// Share URL encoding
// =====================================================================

export function encodeShareUrl(shareUrl: string): string {
  const b64 = Buffer.from(shareUrl, "utf8").toString("base64");
  const encoded = b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return `u!${encoded}`;
}

// =====================================================================
// Drive item types
// =====================================================================

export interface MicrosoftDriveItem {
  id: string;
  name: string;
  driveId?: string;
  webUrl?: string;
  size?: number;
  lastModified?: string;
}

interface RawDriveItem {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string };
}

function toDriveItem(raw: RawDriveItem): MicrosoftDriveItem {
  return {
    id: raw.id,
    name: raw.name,
    driveId: raw.parentReference?.driveId,
    webUrl: raw.webUrl,
    size: raw.size,
    lastModified: raw.lastModifiedDateTime,
  };
}

function isXlsx(name: string | undefined): boolean {
  return !!name && /\.xlsx$/i.test(name);
}

export interface MicrosoftGraphOptions {
  fetchImpl?: typeof fetch;
  prefer?: MicrosoftConnectorName;
}

// =====================================================================
// Public Graph functions
// =====================================================================

export async function resolveShareLink(
  shareUrl: string,
  opts: MicrosoftGraphOptions = {},
): Promise<MicrosoftDriveItem> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer, fetchImpl);
  const encoded = encodeShareUrl(shareUrl);
  try {
    const raw = await graphGetJson<RawDriveItem>(
      `/shares/${encoded}/driveItem?$select=id,name,webUrl,size,lastModifiedDateTime,parentReference`,
      token,
      fetchImpl,
    );
    return toDriveItem(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/HTTP 40[34]/.test(msg)) {
      throw new Error(
        `Microsoft Graph request failed (HTTP 403). VectorMesh's Microsoft connection can only read files ` +
          `accessible to the connected integration identity. Ensure the identity has been granted at least ` +
          `Read access to the target SharePoint site and file.`,
      );
    }
    throw err;
  }
}

export async function listRecentXlsxFiles(
  opts: MicrosoftGraphOptions = {},
): Promise<MicrosoftDriveItem[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer ?? "onedrive", fetchImpl);
  const byId = new Map<string, MicrosoftDriveItem>();
  let rootError: unknown;
  let recentError: unknown;
  try {
    const root = await graphGetJson<{ value: RawDriveItem[] }>(
      `/me/drive/root/children?$select=id,name,webUrl,size,lastModifiedDateTime,parentReference&$top=200`,
      token,
      fetchImpl,
    );
    for (const r of root.value ?? []) {
      if (isXlsx(r.name)) byId.set(r.id, toDriveItem(r));
    }
  } catch (err) {
    rootError = err;
  }
  try {
    const recent = await graphGetJson<{ value: RawDriveItem[] }>(
      `/me/drive/recent`,
      token,
      fetchImpl,
    );
    for (const r of recent.value ?? []) {
      if (isXlsx(r.name) && !byId.has(r.id)) byId.set(r.id, toDriveItem(r));
    }
  } catch (err) {
    recentError = err;
  }
  if (byId.size === 0 && rootError && recentError) throw rootError;
  return [...byId.values()];
}

export async function searchXlsxFiles(
  query: string,
  opts: MicrosoftGraphOptions = {},
): Promise<MicrosoftDriveItem[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer ?? "onedrive", fetchImpl);
  const q = encodeURIComponent(query.replace(/'/g, "''"));
  const data = await graphGetJson<{ value: RawDriveItem[] }>(
    `/me/drive/root/search(q='${q}')?$select=id,name,webUrl,size,lastModifiedDateTime,parentReference`,
    token,
    fetchImpl,
  );
  return (data.value ?? [])
    .filter((r) => isXlsx(r.name))
    .map(toDriveItem);
}

async function readBytes(res: Response): Promise<Uint8Array> {
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function downloadDriveItem(
  driveId: string,
  itemId: string,
  opts: MicrosoftGraphOptions = {},
): Promise<Uint8Array> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer, fetchImpl);
  const res = await graphGet(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
    token,
    fetchImpl,
  );
  if (!res.ok) {
    const detail = await safeReadError(res);
    throw new Error(`Could not download the file from Microsoft (HTTP ${res.status})${detail}`);
  }
  return readBytes(res);
}

export async function downloadShareLink(
  shareUrl: string,
  opts: MicrosoftGraphOptions = {},
): Promise<Uint8Array> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer, fetchImpl);
  const encoded = encodeShareUrl(shareUrl);
  const res = await graphGet(`/shares/${encoded}/driveItem/content`, token, fetchImpl);
  if (!res.ok) {
    const detail = await safeReadError(res);
    throw new Error(`Could not download the shared file from Microsoft (HTTP ${res.status})${detail}`);
  }
  return readBytes(res);
}

export interface MicrosoftBackedSource {
  sourceType: string;
  microsoftAuth?: boolean | null;
  msDriveId?: string | null;
  msItemId?: string | null;
  sourceUrl?: string | null;
}

// =====================================================================
// cTag helpers (Task #362)
// =====================================================================

interface RawDriveItemMeta {
  id: string;
  cTag?: string;
}

export async function fetchDriveItemCTag(
  driveId: string,
  itemId: string,
  opts: MicrosoftGraphOptions = {},
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let token: string;
  try {
    token = await resolveAccessToken(opts.prefer, fetchImpl);
  } catch {
    return null;
  }
  try {
    const raw = await graphGetJson<RawDriveItemMeta>(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,cTag`,
      token,
      fetchImpl,
    );
    return raw.cTag ?? null;
  } catch {
    return null;
  }
}

export async function fetchShareLinkCTag(
  shareUrl: string,
  opts: MicrosoftGraphOptions = {},
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let token: string;
  try {
    token = await resolveAccessToken(opts.prefer, fetchImpl);
  } catch {
    return null;
  }
  const encoded = encodeShareUrl(shareUrl);
  try {
    const raw = await graphGetJson<RawDriveItemMeta>(
      `/shares/${encoded}/driveItem?$select=id,cTag`,
      token,
      fetchImpl,
    );
    return raw.cTag ?? null;
  } catch {
    return null;
  }
}

export async function fetchMicrosoftCTag(
  source: MicrosoftBackedSource,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const prefer: MicrosoftConnectorName =
    source.sourceType === "sharepoint_excel" ? "sharepoint" : "onedrive";
  if (source.msDriveId && source.msItemId) {
    return fetchDriveItemCTag(source.msDriveId, source.msItemId, { fetchImpl, prefer });
  }
  if (source.sourceUrl) {
    return fetchShareLinkCTag(source.sourceUrl, { fetchImpl, prefer });
  }
  return null;
}

export async function fetchMicrosoftXlsxBytes(
  source: MicrosoftBackedSource,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const prefer: MicrosoftConnectorName =
    source.sourceType === "sharepoint_excel" ? "sharepoint" : "onedrive";
  if (source.msDriveId && source.msItemId) {
    return downloadDriveItem(source.msDriveId, source.msItemId, { fetchImpl, prefer });
  }
  if (source.sourceUrl) {
    return downloadShareLink(source.sourceUrl, { fetchImpl, prefer });
  }
  throw new Error(
    "This Microsoft source has no file selected. Pick a file or paste a share link.",
  );
}

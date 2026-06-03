// Task #268 — Microsoft Graph access for the Agenda Spreadsheet Source
// Mapper.
//
// Lets the agenda sync engine read PRIVATE OneDrive / SharePoint Excel
// files. OAuth, token storage and refresh are owned entirely by Replit's
// first-party Microsoft connectors (OneDrive + SharePoint Online) — this
// module never stores Microsoft passwords or tokens. It fetches a fresh
// access token from the Replit connectors credential proxy on every call
// (tokens expire; never cache them) and uses it to call Microsoft Graph.
//
// Scope: ONE system-level Microsoft account. Per-client / multi-tenant
// Microsoft accounts are explicitly out of scope — the `connectorName`
// seam below is where that would later be threaded. Read-only: only GET
// requests are issued.

// The Replit connector names for the two Microsoft connectors. Either
// connector authorises the same Microsoft account; their scopes differ
// (OneDrive → Files.*, SharePoint → Sites.*), so we prefer the one that
// matches the source type and fall back to the other.
export type MicrosoftConnectorName = "onedrive" | "sharepoint";
const MICROSOFT_CONNECTOR_NAMES: MicrosoftConnectorName[] = ["onedrive", "sharepoint"];

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// A connection as returned by the connectors credential proxy (only the
// fields we use).
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
}

export class MicrosoftNotConnectedError extends Error {
  constructor(message = MICROSOFT_NOT_CONNECTED_MESSAGE) {
    super(message);
    this.name = "MicrosoftNotConnectedError";
  }
}

export const MICROSOFT_NOT_CONNECTED_MESSAGE =
  "Microsoft isn't connected yet. Connect a Microsoft account in the agenda source settings so VectorMesh can read this private OneDrive/SharePoint file.";

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

// Fetch a fresh access token for a specific connector from the Replit
// connectors credential proxy. Returns null when the connector is not
// authorised / bound for this Repl. Never cache the result — tokens
// expire and the proxy refreshes them for us.
async function fetchConnectorToken(
  connectorName: MicrosoftConnectorName,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
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

/**
 * Report which Microsoft connectors are currently usable (have a live
 * token) for this Repl. Drives the "Connect Microsoft" UI state and the
 * fetch-time decision of whether to attempt Graph vs the public path.
 */
export async function getMicrosoftConnectionStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<MicrosoftConnectionStatus> {
  const connectors: MicrosoftConnectorName[] = [];
  for (const name of MICROSOFT_CONNECTOR_NAMES) {
    const token = await fetchConnectorToken(name, fetchImpl);
    if (token) connectors.push(name);
  }
  return { connected: connectors.length > 0, connectors };
}

// Resolve an access token, preferring the connector that matches the
// source type. Throws MicrosoftNotConnectedError when nothing is bound.
async function resolveAccessToken(
  prefer: MicrosoftConnectorName | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  const order: MicrosoftConnectorName[] = prefer
    ? [prefer, ...MICROSOFT_CONNECTOR_NAMES.filter((n) => n !== prefer)]
    : [...MICROSOFT_CONNECTOR_NAMES];
  for (const name of order) {
    const token = await fetchConnectorToken(name, fetchImpl);
    if (token) return token;
  }
  throw new MicrosoftNotConnectedError();
}

async function graphGet(
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
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

// Encode a sharing URL into the Graph `shares` API id form:
// "u!" + base64url(url) with trailing "=" stripped.
export function encodeShareUrl(shareUrl: string): string {
  const b64 = Buffer.from(shareUrl, "utf8").toString("base64");
  const encoded = b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return `u!${encoded}`;
}

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

/**
 * Resolve a OneDrive/SharePoint share link to its (driveId, itemId,
 * name) via the Graph `shares` API. Lets an operator paste a "Copy link"
 * URL instead of browsing the picker.
 */
export async function resolveShareLink(
  shareUrl: string,
  opts: MicrosoftGraphOptions = {},
): Promise<MicrosoftDriveItem> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer, fetchImpl);
  const encoded = encodeShareUrl(shareUrl);
  const raw = await graphGetJson<RawDriveItem>(
    `/shares/${encoded}/driveItem?$select=id,name,webUrl,size,lastModifiedDateTime,parentReference`,
    token,
    fetchImpl,
  );
  return toDriveItem(raw);
}

/**
 * List the signed-in account's recent Excel files (OneDrive). Powers the
 * default file-picker view.
 */
export async function listRecentXlsxFiles(
  opts: MicrosoftGraphOptions = {},
): Promise<MicrosoftDriveItem[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await resolveAccessToken(opts.prefer ?? "onedrive", fetchImpl);
  const data = await graphGetJson<{ value: RawDriveItem[] }>(
    `/me/drive/recent`,
    token,
    fetchImpl,
  );
  return (data.value ?? [])
    .filter((r) => isXlsx(r.name))
    .map(toDriveItem);
}

/**
 * Search the signed-in account's OneDrive for Excel files matching a
 * query string.
 */
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

// Read the raw bytes of a Graph response body as a Uint8Array.
async function readBytes(res: Response): Promise<Uint8Array> {
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Download the bytes of a drive item addressed by (driveId, itemId).
 */
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

/**
 * Download the bytes of a file behind a share link via the Graph
 * `shares` API.
 */
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

// The subset of an agenda sync config this module needs to address a
// Graph-backed file.
export interface MicrosoftBackedSource {
  sourceType: string;
  microsoftAuth?: boolean | null;
  msDriveId?: string | null;
  msItemId?: string | null;
  sourceUrl?: string | null;
}

/**
 * Fetch the .xlsx bytes for a Microsoft-backed agenda source. Prefers a
 * concrete (driveId, itemId) set by the file picker; otherwise resolves
 * the file from the pasted share link in `sourceUrl`. The connector that
 * matches the source type is tried first.
 *
 * Throws MicrosoftNotConnectedError when no Microsoft account is bound,
 * so the caller can surface the connect-Microsoft guidance.
 */
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

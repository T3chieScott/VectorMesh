/**
 * server/microsoftOAuth.ts — Task #369
 *
 * Production Entra OAuth 2.0 engine for the Microsoft Graph agenda connector.
 * Replaces the Replit connector proxy with a standards-compliant
 * authorisation-code + PKCE flow using Microsoft's official @azure/msal-node
 * confidential-client library.
 *
 * Security properties enforced here:
 * ─ @azure/msal-node handles auth URL construction, code exchange, silent
 *   refresh and PKCE verification — no hand-rolled OAuth primitives.
 * ─ State: cryptographically random (16 bytes), single-use, bound to the
 *   initiating authenticated admin session, 15-minute expiry; the callback
 *   rejects replay, expiry and session mismatch.
 * ─ PKCE S256: generated locally, sent to Microsoft, verified by MSAL on
 *   the token exchange — protects against authorization-code injection.
 * ─ Nonce: bound in the ID token; validated from the payload.
 * ─ Entire MSAL token cache (accounts + tokens) encrypted with AES-256-GCM
 *   before any DB write.  Random IV per write, auth tag validated on read.
 * ─ key_version stored alongside ciphertext to support future key rotation.
 * ─ In-process mutex prevents concurrent refresh races (single-process PM2
 *   deployment on Plesk).
 * ─ Scopes: standard OIDC scopes plus User.Read and Files.Read.All only.
 * ─ Exact Graph allowlist (assertExactGrantedScopes) requires User.Read +
 *   Files.Read.All and rejects every unknown Graph scope; write-scope denylist
 *   is defence-in-depth. Microsoft may return the standard OIDC `email` scope
 *   even though it is not requested.
 * ─ OAuth transport → login.microsoftonline.com only (MSAL enforced).
 * ─ Replit connector adapter disabled when NODE_ENV=production.
 * ─ Disconnect deletes credentials only; no Graph call; snapshots untouched.
 * ─ Tokens never appear in logs or error messages (redactTokens helper).
 */

import {
  ConfidentialClientApplication,
  type ICachePlugin,
  type TokenCacheContext,
  type Configuration,
  type AuthenticationResult,
} from "@azure/msal-node";
import crypto from "node:crypto";
import { pool } from "./db";

// =====================================================================
// Scope constants
// =====================================================================

/** Ordered scope list sent on every authorise and refresh request. */
export const ENTRA_SCOPE_LIST = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Files.Read.All",
] as const;

/** Space-separated scope string (convenience alias). */
export const ENTRA_SCOPES = ENTRA_SCOPE_LIST.join(" ");

/**
 * Standard OpenID Connect identity scopes Microsoft may return on a grant.
 * `email` is intentionally allowed on responses but is not requested in
 * ENTRA_SCOPE_LIST: MSAL/Entra may add it as a standard OIDC default.
 */
export const ALLOWED_OIDC_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;

/**
 * The complete and only Microsoft Graph delegated permissions this
 * integration requires. Keep this separate from OIDC identity scopes so the
 * Graph allowlist cannot be broadened accidentally.
 */
export const REQUIRED_GRAPH_SCOPES = [
  "User.Read",
  "Files.Read.All",
] as const;

/**
 * Write-capable (or otherwise disallowed) scopes — normalised to lowercase.
 * Any grant containing one of these is rejected as a security misconfiguration.
 */
export const DISALLOWED_WRITE_SCOPES: readonly string[] = [
  "files.readwrite",
  "files.readwrite.all",
  "sites.readwrite.all",
  "sites.manage.all",
  "mail.readwrite",
  "mail.send",
  "calendars.readwrite",
  "directory.readwrite.all",
  "directory.accessasuser.all",
];

// =====================================================================
// Encryption key version
// =====================================================================

/** Current encryption key version.  Increment when rotating the key. */
export const KEY_VERSION = 1;

// =====================================================================
// Encryption (AES-256-GCM)
// =====================================================================

/**
 * Derive the 32-byte AES key from MICROSOFT_TOKEN_ENCRYPTION_KEY.
 * Accepts 64-char hex (32 bytes) or base64.
 * Throws immediately if the variable is absent or the wrong length —
 * never logs the value.
 */
function deriveEncryptionKey(): Buffer {
  const raw = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MICROSOFT_TOKEN_ENCRYPTION_KEY is not set. " +
        "Generate a 32-byte key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "MICROSOFT_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes " +
        "(64-char hex string or 44-char base64 string).",
    );
  }
  return buf;
}

interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string;         // base64, 12 bytes
  tag: string;        // base64, 16 bytes (GCM auth tag)
}

/**
 * Decodes a canonical base64 string to a Buffer.
 *
 * "Canonical" means:
 *  - the string contains only [A-Za-z0-9+/] characters and the correct '=' pad chars,
 *  - its length is a multiple of 4 (no missing, no extra padding),
 *  - no characters appear after the padding block,
 *  - re-encoding the decoded bytes produces the original string byte-for-byte.
 *
 * Node's Buffer.from(value, "base64") is permissive: it silently ignores unknown
 * characters (including whitespace and '!') and accepts non-canonical inputs.
 * This wrapper rejects all such inputs deterministically before any OpenSSL call
 * is made, providing a strict parse boundary for untrusted ciphertext fields.
 */
function decodeCanonicalBase64(value: string, label: string): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error(`Decryption failed: ${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`Decryption failed: ${label} is not canonical base64`);
  }
  return decoded;
}

export function encryptCacheBlob(plaintext: string): EncryptedBlob {
  // Reject empty plaintext: AES-256-GCM of "" produces an empty ciphertext string
  // which decodeCanonicalBase64() would refuse, breaking the round-trip invariant.
  // A valid MSAL token cache is always a non-empty JSON string.
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Token cache plaintext must be a non-empty string");
  }
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12); // 12 bytes = 96 bits (GCM standard)
  // authTagLength: 16 is the full 128-bit tag — explicitly enforced so the
  // cipher never silently produces a shorter tag.
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // always 16 bytes when authTagLength: 16
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptCacheBlob({ ciphertext, iv, tag }: EncryptedBlob): string {
  const key = deriveEncryptionKey();
  // decodeCanonicalBase64 rejects non-canonical inputs (whitespace, illegal chars,
  // wrong or missing padding, chars after padding) before any OpenSSL call is made.
  const ivBuf = decodeCanonicalBase64(iv, "IV");
  // Enforce exact byte lengths AFTER canonical decoding so that short/truncated
  // values are rejected deterministically regardless of OpenSSL version.
  if (ivBuf.length !== 12) {
    throw new Error(
      `Decryption failed: IV must be exactly 12 bytes (got ${ivBuf.length})`,
    );
  }
  const tagBuf = decodeCanonicalBase64(tag, "authentication tag");
  if (tagBuf.length !== 16) {
    throw new Error(
      `Decryption failed: authentication tag must be exactly 16 bytes (got ${tagBuf.length})`,
    );
  }
  const ciphertextBuf = decodeCanonicalBase64(ciphertext, "ciphertext");
  // authTagLength: 16 causes setAuthTag to enforce the length at the OpenSSL
  // layer as well, providing defence-in-depth beyond our explicit check above.
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuf, { authTagLength: 16 });
  decipher.setAuthTag(tagBuf);
  const decrypted = Buffer.concat([
    decipher.update(ciphertextBuf),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// =====================================================================
// PKCE + OAuth state generation
// =====================================================================

export interface OAuthInitParams {
  /** Random CSRF token sent in the authorisation URL. */
  state: string;
  /** Nonce bound into the ID token payload. */
  nonce: string;
  /** PKCE code verifier (kept server-side, never sent to client). */
  codeVerifier: string;
  /** SHA-256 of codeVerifier, sent to Microsoft as code_challenge (S256). */
  codeChallenge: string;
}

/** Generate a fresh, cryptographically random set of OAuth init parameters. */
export function generateOAuthInitParams(): OAuthInitParams {
  const state = crypto.randomBytes(16).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { state, nonce, codeVerifier, codeChallenge };
}

// =====================================================================
// Session-stored auth transaction
// =====================================================================

/** Shape stored in req.session.msOauthState during an in-flight OAuth flow. */
export interface MsOAuthSessionState {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Admin user ID that initiated the flow (session binding). */
  initiatedBy: string;
  /** Validated relative path to redirect to after success. */
  returnTo: string;
  /** Unix timestamp (ms) after which this transaction is invalid. */
  expiresAt: number;
}

/** TTL for an in-flight OAuth transaction: 15 minutes. */
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

// =====================================================================
// Entra configuration helpers
// =====================================================================

function getTenantId(): string {
  // Defaults to 'organizations' (work/school accounts only) if not set.
  // Amendment #3: use tenant-specific or 'organizations', not 'common'.
  return process.env.MICROSOFT_TENANT_ID ?? "organizations";
}

function getMsalAuthority(): string {
  return `https://login.microsoftonline.com/${getTenantId()}`;
}

/**
 * Validate that all required production environment variables are present.
 * Called at server startup.  Never logs the values.
 * Throws in production; warns in development.
 */
export function validateMicrosoftProductionConfig(): void {
  const required = [
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_REDIRECT_URI",
    "MICROSOFT_TOKEN_ENCRYPTION_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === 0) return;

  const isProd = process.env.NODE_ENV === "production";
  const msg =
    `Microsoft Entra OAuth: missing environment variable(s): ${missing.join(", ")}. ` +
    "Set these before enabling Microsoft-backed agenda sources in production.";

  if (isProd) {
    throw new Error(msg);
  } else {
    console.warn("[microsoftOAuth]", msg);
  }
}

// =====================================================================
// DB cache plugin
// =====================================================================

interface CacheRow {
  encrypted_cache: string;
  cache_iv: string;
  cache_tag: string;
  key_version: number;
  scope: string;
  connected_by: string;
}

/** Load the singleton credential row. Returns null if none exists. */
async function loadCacheRow(): Promise<CacheRow | null> {
  try {
    const { rows } = await pool.query<CacheRow>(
      `SELECT encrypted_cache, cache_iv, cache_tag, key_version, scope, connected_by
       FROM microsoft_oauth_tokens WHERE id = $1`,
      [SINGLETON_ROW_ID],
    );
    return rows[0] ?? null;
  } catch (err: unknown) {
    // If the table doesn't exist yet (pre-migration startup), treat as disconnected.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) return null;
    throw err;
  }
}

/** Persist the full credential row (initial connection). */
async function persistNewConnection(
  serializedCache: string,
  scope: string,
  connectedBy: string,
): Promise<void> {
  const blob = encryptCacheBlob(serializedCache);
  await pool.query(
    `INSERT INTO microsoft_oauth_tokens
       (id, encrypted_cache, cache_iv, cache_tag, key_version, scope, connected_by, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       encrypted_cache = EXCLUDED.encrypted_cache,
       cache_iv        = EXCLUDED.cache_iv,
       cache_tag       = EXCLUDED.cache_tag,
       key_version     = EXCLUDED.key_version,
       scope           = EXCLUDED.scope,
       connected_by    = EXCLUDED.connected_by,
       connected_at    = NOW(),
       updated_at      = NOW()`,
    [SINGLETON_ROW_ID, blob.ciphertext, blob.iv, blob.tag, KEY_VERSION, scope, connectedBy],
  );
}

/** Update only the encrypted cache blob (token refresh rotation). */
async function updateCacheOnly(serializedCache: string, scope: string): Promise<void> {
  const blob = encryptCacheBlob(serializedCache);
  await pool.query(
    `UPDATE microsoft_oauth_tokens
     SET encrypted_cache = $2, cache_iv = $3, cache_tag = $4,
         key_version = $5, scope = $6, updated_at = NOW()
     WHERE id = $1`,
    [SINGLETON_ROW_ID, blob.ciphertext, blob.iv, blob.tag, KEY_VERSION, scope],
  );
}

/** Singleton row ID (there is at most one credential per deployment). */
export const SINGLETON_ROW_ID = "singleton";

/**
 * MSAL cache plugin that encrypts/decrypts the serialised token cache with
 * AES-256-GCM before any DB read/write.
 *
 * beforeCacheAccess: load from DB → decrypt → deserialise into MSAL cache.
 * afterCacheAccess: if changed, serialise MSAL cache → encrypt → write to DB.
 */
export class DbEncryptedCachePlugin implements ICachePlugin {
  /**
   * Set before calling acquireTokenByCode so afterCacheAccess can write
   * connected_by.  Cleared immediately after the first write.
   */
  private _initialConnection: { connectedBy: string; scope: string } | null =
    null;

  setInitialConnection(connectedBy: string, scope: string): void {
    this._initialConnection = { connectedBy, scope };
  }

  async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
    const row = await loadCacheRow();
    if (!row) return;
    try {
      const plaintext = decryptCacheBlob({
        ciphertext: row.encrypted_cache,
        iv: row.cache_iv,
        tag: row.cache_tag,
      });
      ctx.tokenCache.deserialize(plaintext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Tampered or corrupted cache — treat as disconnected; do NOT throw.
      console.error(
        "[microsoftOAuth] Failed to decrypt token cache — treating as disconnected:",
        msg,
      );
    }
  }

  async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
    if (!ctx.hasChanged) return;
    const serialized = ctx.tokenCache.serialize();
    const init = this._initialConnection;
    if (init) {
      this._initialConnection = null;
      await persistNewConnection(serialized, init.scope, init.connectedBy);
    } else {
      // Refresh — preserve connected_by and connected_at.
      const row = await loadCacheRow();
      const scope = row?.scope ?? ENTRA_SCOPES;
      await updateCacheOnly(serialized, scope);
    }
  }
}

// =====================================================================
// MSAL application (lazy singleton + in-process refresh mutex)
// =====================================================================

let _msalApp: ConfidentialClientApplication | null = null;
let _cachePlugin: DbEncryptedCachePlugin | null = null;

/** Reset the MSAL singleton (used in tests or when config changes). */
export function resetMsalSingleton(): void {
  _msalApp = null;
  _cachePlugin = null;
}

/**
 * Build (or return the existing) MSAL ConfidentialClientApplication.
 * Throws if the required environment variables are absent.
 */
function getMsalApp(): {
  app: ConfidentialClientApplication;
  plugin: DbEncryptedCachePlugin;
} {
  if (_msalApp && _cachePlugin) return { app: _msalApp, plugin: _cachePlugin };

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId) throw new Error("MICROSOFT_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("MICROSOFT_CLIENT_SECRET is not set");

  const plugin = new DbEncryptedCachePlugin();
  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority: getMsalAuthority(),
      clientSecret,
    },
    cache: {
      cachePlugin: plugin,
    },
  };

  _msalApp = new ConfidentialClientApplication(msalConfig);
  _cachePlugin = plugin;
  return { app: _msalApp, plugin };
}

/**
 * In-process mutex: queues refresh calls so concurrent Graph requests
 * don't each trigger a separate Microsoft token refresh.
 * For single-process PM2 deployments on Plesk; cross-process deployments
 * would require a DB advisory lock.
 */
// Settled tail: _refreshChain always resolves (never rejects).  Each call
// chains off the previous settled result, runs the real operation, and then
// stores a new settled tail so the next concurrent caller can chain cleanly.
// The actual error (NotConnected, NotConfigured, Refresh) propagates only to
// `operation` — the caller's own returned promise — never to the chain slot.
let _refreshChain: Promise<undefined> = Promise.resolve(undefined);

// =====================================================================
// Nonce validation (ID token payload)
// =====================================================================

/**
 * Validate the nonce claim in the MSAL-returned ID token payload.
 * MSAL verifies the token signature internally; we additionally check
 * the nonce to bind the token to the initiating session.
 */
export function validateIdTokenNonce(
  idToken: string | null | undefined,
  expectedNonce: string,
): void {
  if (!idToken) throw new Error("ID token absent from Microsoft response");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token format");
  let payload: { nonce?: string };
  try {
    payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { nonce?: string };
  } catch {
    throw new Error("ID token payload could not be decoded");
  }
  if (!payload.nonce) throw new Error("ID token is missing nonce claim");
  if (payload.nonce !== expectedNonce) {
    throw new Error("ID token nonce mismatch — possible replay attack");
  }
}

// =====================================================================
// Scope enforcement
// =====================================================================

/** Throw if any disallowed write scope appears in a token grant. */
export function assertNoWriteScopes(scopes: string[] | string | undefined): void {
  if (!scopes) return;
  const granted = (Array.isArray(scopes) ? scopes : scopes.split(/\s+/)).map(
    (s) => s.toLowerCase(),
  );
  for (const bad of DISALLOWED_WRITE_SCOPES) {
    if (granted.includes(bad)) {
      throw new Error(
        `Microsoft granted a disallowed write scope: "${bad}". ` +
          "Check the Entra app registration — only read-only scopes should be consented.",
      );
    }
  }
}

/**
 * Exact allowlist validation of scopes returned by Microsoft on a grant or refresh.
 *
 * 1. Normalises scope strings case-insensitively.
 * 2. Requires User.Read and Files.Read.All to be present.
 * 3. Allows only standard OIDC identity scopes plus the two required Graph
 *    delegated scopes; `email` is tolerated as an Entra/MSAL OIDC default.
 * 4. Rejects every other scope (including every unknown Graph permission).
 * 5. Runs the static write-scope denylist as defence-in-depth.
 *
 * Called both at grant time (handleOAuthCallback) and at refresh time (_doGetToken).
 */
export function assertExactGrantedScopes(scopes: string[] | string | undefined): void {
  if (!scopes) {
    throw new Error(
      "Microsoft returned no scopes — cannot verify access level. " +
        "Check the Entra app registration.",
    );
  }
  const granted = (Array.isArray(scopes) ? scopes : scopes.split(/\s+/))
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);

  if (granted.length === 0) {
    throw new Error(
      "Microsoft returned an empty scope list — cannot verify access level. " +
        "Check the Entra app registration.",
    );
  }

  // Mandatory Graph read scopes — both must be present in the grant.
  for (const requiredScope of REQUIRED_GRAPH_SCOPES) {
    if (!granted.includes(requiredScope.toLowerCase())) {
      throw new Error(
        `Microsoft grant is missing required scope ${requiredScope}. ` +
          "Check the Entra app registration consent.",
      );
    }
  }

  // Strict allowlist — OIDC identity scopes are intentionally separate from
  // Graph delegated scopes. This allows only the documented `email` default
  // without broadening Graph access.
  const allowed = new Set([
    ...ALLOWED_OIDC_SCOPES,
    ...REQUIRED_GRAPH_SCOPES,
  ].map((s) => s.toLowerCase()));
  for (const scope of granted) {
    if (!allowed.has(scope)) {
      throw new Error(
        `Microsoft granted an unexpected scope: "${scope}". ` +
          "Only standard OIDC scopes and the required read-only Graph scopes should be consented in the Entra app registration.",
      );
    }
  }

  // Defence-in-depth: also scan for known write scopes.
  assertNoWriteScopes(scopes);
}

// =====================================================================
// Token redaction (keep credentials out of logs / error messages)
// =====================================================================

/**
 * Redact anything that looks like a bearer/access/refresh token from a
 * string so that credentials never appear in log output or error payloads.
 */
export function redactTokens(text: string): string {
  return text
    .replace(
      /"(access_token|refresh_token|id_token|client_secret)"\s*:\s*"[^"]{4,}"/gi,
      '"$1":"[REDACTED]"',
    )
    .replace(
      /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
      "[REDACTED_JWT]",
    )
    .replace(/[A-Za-z0-9_-]{40,}/g, "[REDACTED_TOKEN]");
}

// =====================================================================
// Redirect sanitiser (prevent open redirect in returnTo)
// =====================================================================

/**
 * Pure validation of an OAuth callback's parameters.
 * All checks are synchronous with no side-effects — session mutation happens
 * in the caller after this returns successfully.
 *
 * Throws a descriptive Error on any failure.
 * Returns the validated MsOAuthSessionState for use in the token exchange.
 *
 * @param sessionState  - Value stored in req.session (undefined = already consumed)
 * @param returnedState - The ?state query param Microsoft echoed back
 * @param code          - The ?code authorisation code from Microsoft
 * @param currentUserId - Authenticated user ID from req.session, if any
 */
export function validateOAuthCallbackParams(params: {
  sessionState: MsOAuthSessionState | undefined;
  returnedState: string | string[] | undefined;
  code: string | string[] | undefined;
  currentUserId: string | undefined;
}): MsOAuthSessionState {
  const { sessionState, returnedState, code, currentUserId } = params;

  if (!sessionState) {
    throw new Error("OAuth session not found or already consumed");
  }

  // Sanity-check the stored state: initiatedBy must never be blank.
  // A blank value means the connect route failed to capture the admin's ID,
  // which would make session-binding impossible to enforce.
  if (!sessionState.initiatedBy) {
    throw new Error(
      "OAuth state is corrupt: initiatedBy is missing. " +
        "The connect flow must be restarted by a signed-in administrator.",
    );
  }

  // CSRF check: state Microsoft echoes must equal the one we stored.
  if (!returnedState || returnedState !== sessionState.state) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  // Expiry check.
  if (Date.now() > sessionState.expiresAt) {
    throw new Error("OAuth authorisation expired (15-minute limit)");
  }

  // Code must be a plain string (not an array, not empty).
  if (!code || typeof code !== "string") {
    throw new Error("Missing or malformed authorisation code from Microsoft");
  }

  // Session binding: the callback MUST arrive with an authenticated session
  // belonging to the same admin who initiated the connect flow.
  // Anonymous callbacks (no session cookie) are rejected — the administrator
  // must remain signed in through the Microsoft redirect.
  if (!currentUserId) {
    throw new Error(
      "OAuth callback arrived without an authenticated session. " +
        "The administrator must be signed in for the callback to complete.",
    );
  }
  if (currentUserId !== sessionState.initiatedBy) {
    throw new Error(
      "OAuth session mismatch — request arrived from a different user session " +
        "than the one that initiated the flow",
    );
  }

  return sessionState;
}

/** Allow only relative paths as returnTo values. */
export function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw) return "/";
  // Must start with a single slash, no protocol or host.
  if (/^\/[^/\\]/.test(raw) || raw === "/") return raw;
  return "/";
}

// =====================================================================
// Public API
// =====================================================================

export interface MicrosoftEntraStatus {
  /** Whether a credential row exists in the DB. */
  connected: boolean;
  /** Scope string stored with the credential (empty when disconnected). */
  scope: string;
  /** User ID of the admin who last connected (empty when disconnected). */
  connectedBy: string;
}

/**
 * Build the Microsoft authorisation URL to begin the OAuth flow.
 * Requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI.
 */
export async function buildConnectUrl(params: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): Promise<string> {
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) throw new Error("MICROSOFT_REDIRECT_URI is not set");

  const { app } = getMsalApp();
  return app.getAuthCodeUrl({
    scopes: [...ENTRA_SCOPE_LIST],
    redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: "S256",
    state: params.state,
    nonce: params.nonce,
    prompt: "select_account",
    responseMode: "query",
  });
}

/**
 * Handle the OAuth callback: exchange the authorisation code for tokens,
 * validate the nonce and scopes, then retain the encrypted MSAL cache.
 *
 * MSAL's cache plugin may persist during acquireTokenByCode, before the token
 * result's scopes are available for validation. A failed post-exchange nonce
 * or scope check therefore MUST delete that row and reset the in-memory MSAL
 * singleton before the error is returned.
 *
 * @param connectedBy - Admin user ID from the validated session.
 */
export async function handleOAuthCallback(params: {
  code: string;
  codeVerifier: string;
  nonce: string;
  connectedBy: string;
}): Promise<AuthenticationResult> {
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) throw new Error("MICROSOFT_REDIRECT_URI is not set");

  const { app, plugin } = getMsalApp();

  // Signal the cache plugin to persist connected_by on afterCacheAccess.
  // Scope will be updated once we have the result.
  plugin.setInitialConnection(
    params.connectedBy,
    ENTRA_SCOPES, // overwritten below once result arrives
  );

  let result: AuthenticationResult;
  try {
    result = await app.acquireTokenByCode({
      code: params.code,
      redirectUri,
      scopes: [...ENTRA_SCOPE_LIST],
      codeVerifier: params.codeVerifier,
    });
  } catch (err) {
    plugin.setInitialConnection("", ""); // clear
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Microsoft token exchange failed: ${redactTokens(msg)}`);
  }

  // Update scope with what Microsoft actually granted.
  plugin.setInitialConnection(params.connectedBy, result.scopes.join(" "));

  try {
    // Validate nonce to bind the token to the initiating session.
    validateIdTokenNonce(result.idToken, params.nonce);

    // Exact allowlist: require User.Read + Files.Read.All, tolerate standard
    // OIDC `email`, reject unknown scopes, and run the write denylist.
    assertExactGrantedScopes(result.scopes);
  } catch (validationError) {
    // MSAL can write its encrypted cache during acquireTokenByCode, before
    // result.scopes is available. Never leave an unvalidated connection behind:
    // remove the singleton row and discard all in-memory account/token state.
    plugin.setInitialConnection("", "");
    try {
      await disconnectEntraOAuth();
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error
        ? redactTokens(cleanupError.message)
        : "unknown cleanup error";
      throw new Error(
        `Microsoft OAuth callback validation failed and credential cleanup failed: ${cleanupMessage}`,
      );
    }
    throw validationError;
  }

  return result;
}

/**
 * Obtain a live Microsoft Graph access token.
 *
 * Resolution order:
 * 1. MSAL silent refresh (uses in-memory cache + encrypted DB cache).
 * 2. Throws MicrosoftEntraNotConnectedError when no credential row exists.
 *
 * Concurrent calls are serialised by an in-process mutex so only one
 * refresh request reaches Microsoft at a time.
 */
export async function getEntraAccessToken(
  fetchImpl?: typeof fetch,
): Promise<string> {
  // Serialise concurrent refresh calls with a settled-tail mutex.
  // _refreshChain always resolves so no rejection ever leaks to the chain slot.
  // The actual error propagates only to `operation` — the caller's own promise.
  const run = () => _doGetToken(fetchImpl);
  const operation = _refreshChain.then(run, run);
  _refreshChain = operation.then(() => undefined, () => undefined);
  return operation;
}

async function _doGetToken(_fetchImpl?: typeof fetch): Promise<string> {
  // getMsalApp() throws a plain Error when MICROSOFT_CLIENT_ID (or other
  // required env vars) are absent.  Convert that to MicrosoftEntraNotConfiguredError
  // so callers can distinguish "not configured" from "not connected".
  // resolveAccessToken in microsoftGraph.ts will then decide whether to fall
  // through to the Replit dev adapter (dev only) or fail closed (production).
  let msalResult: ReturnType<typeof getMsalApp>;
  try {
    msalResult = getMsalApp();
  } catch {
    throw new MicrosoftEntraNotConfiguredError();
  }
  const { app } = msalResult;

  const accounts = await app.getTokenCache().getAllAccounts();
  if (accounts.length === 0) throw new MicrosoftEntraNotConnectedError();

  const account = accounts[0];
  let result: AuthenticationResult | null;
  try {
    result = await app.acquireTokenSilent({
      scopes: [...ENTRA_SCOPE_LIST],
      account,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MicrosoftEntraRefreshError(
      `Microsoft token refresh failed: ${redactTokens(msg)}`,
    );
  }

  if (!result?.accessToken) {
    throw new MicrosoftEntraRefreshError("acquireTokenSilent returned no access token");
  }

  // Exact allowlist check on every refresh grant.
  assertExactGrantedScopes(result.scopes);
  return result.accessToken;
}

/** Check whether a persisted Entra credential row exists in the DB. */
export async function getMicrosoftEntraStatus(): Promise<MicrosoftEntraStatus> {
  const row = await loadCacheRow();
  if (!row) return { connected: false, scope: "", connectedBy: "" };
  return {
    connected: true,
    scope: row.scope,
    connectedBy: row.connected_by,
  };
}

/**
 * Delete the stored Microsoft OAuth credential and reset the MSAL singleton.
 * No Microsoft Graph request is made. No agenda snapshot, sync config, or
 * agenda item row is touched — only credentials are removed.
 */
export async function disconnectEntraOAuth(): Promise<void> {
  resetMsalSingleton();
  await pool.query("DELETE FROM microsoft_oauth_tokens WHERE id = $1", [
    SINGLETON_ROW_ID,
  ]);
}

// =====================================================================
// Error types
// =====================================================================

/**
 * Thrown when Entra credentials exist in the DB but the silent refresh fails
 * (e.g. consent revoked, token expired beyond recovery).
 */
export class MicrosoftEntraRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrosoftEntraRefreshError";
  }
}

/**
 * Thrown when there is no persisted credential row — the administrator has
 * not yet completed the OAuth connect flow.
 */
export class MicrosoftEntraNotConnectedError extends Error {
  constructor() {
    super(
      "No Microsoft account is connected. An administrator must connect a Microsoft " +
        "account before private OneDrive/SharePoint files can be read.",
    );
    this.name = "MicrosoftEntraNotConnectedError";
  }
}

/**
 * Thrown when the required Entra environment variables (MICROSOFT_CLIENT_ID,
 * MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI, MICROSOFT_TENANT_ID) are
 * absent — this is a deployment configuration error, distinct from an
 * administrator simply not having connected an account yet.
 *
 * In production this must fail closed.  In explicitly-enabled development
 * mode (NODE_ENV ≠ production AND REPLIT_CONNECTORS_HOSTNAME set) the caller
 * may optionally fall back to the Replit connector adapter.
 */
export class MicrosoftEntraNotConfiguredError extends Error {
  constructor() {
    super(
      "Microsoft Entra OAuth is not configured on this server. " +
        "Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI, " +
        "and MICROSOFT_TENANT_ID before attempting to connect a Microsoft account.",
    );
    this.name = "MicrosoftEntraNotConfiguredError";
  }
}

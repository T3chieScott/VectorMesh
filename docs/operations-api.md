# Display Operations API

**Version:** 2.0 (Task #330 — Monitor Sessions & Rendering)  
**Base path:** `/api/operations`

This API is intended for trusted external operational clients such as the **VectorMesh Multiview** Electron application. It provides read-only access to venue/screen topology and a secure mechanism to stream live screen content without affecting physical player state.

---

## Authentication

All `/api/operations/…` endpoints use the same authentication as the main application:

| Method | Header / Mechanism |
|--------|--------------------|
| Session cookie | Standard browser session after logging in to the web UI |
| Bearer token | `Authorization: Bearer <vm_...>` API token issued from Settings → API Tokens |

Bearer tokens additionally require **explicit scope grants**. Admin and `account_manager` roles receive all operations scopes implicitly when using a session. Site users must be granted scopes explicitly.

### Scopes

| Scope | Description |
|-------|-------------|
| `operations.view` | List projects, venues, and basic screen metadata |
| `operations.screen.read` | Read detailed per-screen status |
| `operations.multiview` | Create and revoke monitor sessions |
| `operations.diagnostics.read` | (reserved) Future diagnostics access |

---

## Terminology

| Operations API term | Internal term |
|---------------------|---------------|
| Project | Client / site |
| Venue | Screen group |
| Screen | Screen (physical display) |

---

## Endpoints

### GET /api/operations/projects

Returns all projects accessible to the caller.

**Scope:** `operations.view`

**Response:**
```json
[
  {
    "id": "client-uuid",
    "name": "Main Conference Centre",
    "status": "active",
    "startDate": "2026-08-01T00:00:00.000Z",
    "endDate": "2026-08-10T23:59:59.000Z"
  }
]
```

`status` is one of `"active"`, `"inactive"`, or `"unscheduled"`.

---

### GET /api/operations/projects/:projectId/venues

Returns venues (screen groups) within a project.

**Scope:** `operations.view`

**Response:**
```json
[
  { "id": "group-uuid", "name": "Hall A", "screenCount": 4 }
]
```

---

### GET /api/operations/venues/:venueId/screens

Returns screens in a venue.

**Scope:** `operations.screen.read`

**Response:**
```json
[
  {
    "id": "screen-uuid",
    "name": "Hall A — Stage Left",
    "status": { "online": true, "lastHeartbeat": "2026-08-10T14:22:00.000Z" },
    "display": { "width": 1920, "height": 1080 },
    "player": { "hostname": "pi-hall-a-sl", "ipAddress": "192.168.1.10", "hardwareClass": "pi4" }
  }
]
```

**Note:** `deviceToken`, `pairingCode`, and `kioskModeEnabled` are **never** returned by this endpoint.

---

### GET /api/operations/screens/:screenId

Returns detailed status for a single screen.

**Scope:** `operations.screen.read`

Same response shape as a single item in the `/venues/:id/screens` list.

---

## Monitor Sessions (Task #330)

Monitor sessions allow an external client to render a live, read-only view of a screen's content without:
- Receiving the physical player's `deviceToken` or `pairingCode`
- Affecting the physical player's heartbeat, `lastSeen`, or `isOnline` state
- Triggering any player commands (`refreshRequested`, `screenshotRequested`)

### POST /api/operations/screens/:screenId/monitor-session

Creates a new monitor session for the given screen.

**Scope:** `operations.multiview`

**Request body (optional):**
```json
{
  "clientType": "multiview",
  "clientName": "VectorMesh Multiview v2.1.0"
}
```

**Response:**
```json
{
  "screenId": "screen-uuid",
  "monitorSessionId": "session-uuid",
  "monitorUrl": "https://your-app.example.com/monitor-bootstrap/screen-uuid?token=<64-char-hex>",
  "expiresAt": "2026-08-10T18:00:00.000Z"
}
```

- `monitorUrl` is **single-use** — the bootstrap token is consumed on first access and cannot be reused.
- Default TTL is **4 hours** (configurable via `MONITOR_SESSION_TTL_HOURS` env var).
- The `monitorUrl` contains a 32-byte opaque random token (hex-encoded). Its SHA-256 hash is stored; the raw token never reaches the database.

---

### DELETE /api/operations/monitor-sessions/:sessionId

Revokes a monitor session immediately. The session becomes invalid on the next request with no grace period.

**Scope:** `operations.multiview`

**Response:**
```json
{ "revoked": true }
```

Returns `404` if the session does not exist or is not accessible to the caller.

---

## Monitor Bootstrap Flow

```
1. Caller: POST /api/operations/screens/:id/monitor-session
   ← { monitorUrl, expiresAt, ... }

2. Electron: view.webContents.loadURL(monitorUrl)
   [browser navigates to /monitor-bootstrap/:screenId?token=<hex>]

3. Server: GET /monitor-bootstrap/:screenId?token=<hex>
   - Validates token hash (single-use, expiry, not revoked)
   - Generates 32-byte session secret
   - Atomically stores SHA-256(secret), stamps bootstrapUsedAt
   - Sets HttpOnly SameSite=Strict cookie  (Path=/)
   - 302 → /monitor/:screenId
   - Headers: Referrer-Policy: no-referrer, Cache-Control: no-store

4. Browser: GET /monitor/:screenId
   - Server validates cookie, updates lastAccessAt
   - Serves React SPA (same index.html)
   - React detects /monitor/ path, renders MonitorPage

5. React: polls GET /api/monitor/:screenId/content  (cookie auth)
   - Returns same content as /api/player/:id/content minus side-effect signals
   - refreshRequested / screenshotRequested / screenshotEnabled always absent
```

All rejection reasons at each step return the **same generic 401 body** to prevent oracle attacks:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Monitor session invalid, expired, or revoked. Create a new monitor session."
}
```

---

## Monitor Content Endpoint

### GET /api/monitor/:screenId/content

Returns the live content payload for a screen. Authenticated by the HttpOnly monitor session cookie (set during bootstrap exchange).

**No `Authorization` header required** — cookie auth only.

**Response:** Same shape as `/api/player/:screenId/content` except:
- `refreshRequested` — **always absent**
- `screenshotRequested` — **always absent**
- `screenshotEnabled` — **always absent**

The React `MonitorPage` component uses the `PlayerCapabilities` deny-by-default policy (`MONITOR_CAPABILITIES`) which sets all physical-player capabilities to `false`. Even if these fields were present, the client would not act on them.

---

## Security Model

| Property | Guarantee |
|----------|-----------|
| Raw bootstrap token | Never stored; only SHA-256 hash in DB |
| Raw session secret | Never stored; only SHA-256 hash in DB |
| Bootstrap token | Single-use; second request with same URL → 401 |
| Cookie | HttpOnly, SameSite=Strict, Secure (production), Path=/ (must cover both /monitor/* shell and /api/monitor/* content endpoint) |
| Secret comparison | `crypto.timingSafeEqual` (constant-time, prevents timing oracle) |
| Rejection reasons | All failures return identical 401 body (no information leakage) |
| Physical player impact | Zero — no heartbeat, no lastSeen update, no pairingCode sent |
| Tenant isolation | Session can only be created/revoked by callers with access to that screen's client |

---

## Configuration

| Environment variable | Default | Description |
|----------------------|---------|-------------|
| `MONITOR_SESSION_TTL_HOURS` | `4` | How long a monitor session stays valid |
| `MONITOR_SESSION_RETENTION_DAYS` | `30` | How long expired sessions are kept before cleanup |
| `PUBLIC_BASE_URL` | (auto-detected) | Absolute base URL used in `monitorUrl`; falls back to `REPLIT_DEV_DOMAIN` |

---

## Error Responses

All Operations API errors follow this shape:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | `UNAUTHENTICATED` | No valid session or bearer token |
| 403 | `FORBIDDEN` | Authenticated but insufficient scope or wrong tenant |
| 404 | `NOT_FOUND` | Resource does not exist |
| 500 | `INTERNAL_ERROR` | Server-side failure |

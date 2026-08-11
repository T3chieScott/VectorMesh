# VectorMesh Multiview — Integration Guide

This guide describes how the **VectorMesh Multiview** Electron application integrates with the Display Operations API to show live, read-only views of screens without affecting physical player state.

---

## Prerequisites

- An API token with the `operations.multiview` scope (create in Settings → API Tokens, then grant the scope via the admin API or ask your VectorMesh system administrator)
- The base URL of your VectorMesh installation (e.g. `https://events.your-org.com`)

---

## Step 1 — Discover Screens

### Recommended: all screens in one request

Use the project-screens endpoint to retrieve every screen for a project — grouped and ungrouped — in a single call:

```http
GET /api/operations/projects/{projectId}/screens
Authorization: Bearer vm_YOUR_TOKEN

→ [
    {
      "id": "screen-uuid",
      "name": "Hall A — Stage Left",
      "status": { "online": true, "lastHeartbeat": "2026-08-10T14:22:00.000Z" },
      "display": { "width": 1920, "height": 1080 },
      "player": { "hostname": "pi-hall-a-sl", "ipAddress": "192.168.1.10", "hardwareClass": "pi4" },
      "groups": [{ "id": "group-uuid", "name": "Hall A" }]
    },
    {
      "id": "screen-uuid-2",
      "name": "Lobby (ungrouped)",
      "groups": []
    }
  ]
```

`groups: []` means the screen is not assigned to any venue but is still returned. Screens in multiple venues appear once with all their group memberships listed.

**Scope required:** `operations.screen.read`

### Alternative: traverse venue-by-venue

If you need to enumerate venues (screen groups) first:

```http
GET /api/operations/projects
Authorization: Bearer vm_YOUR_TOKEN

→ [{ "id": "client-uuid", "name": "Main Centre", ... }]
```

```http
GET /api/operations/projects/{projectId}/venues
Authorization: Bearer vm_YOUR_TOKEN

→ [{ "id": "group-uuid", "name": "Hall A", "screenCount": 4 }]
```

```http
GET /api/operations/venues/{venueId}/screens
Authorization: Bearer vm_YOUR_TOKEN

→ [{ "id": "screen-uuid", "name": "Hall A — Stage Left", ... }]
```

Note: the venue-traversal approach misses ungrouped screens. Prefer the project-screens endpoint for complete discovery.

---

## Step 2 — Create a Monitor Session

For each screen you want to display, create a monitor session. This returns a `monitorUrl` that is safe to load directly into an Electron `WebContentsView`.

```http
POST /api/operations/screens/{screenId}/monitor-session
Authorization: Bearer vm_YOUR_TOKEN
Content-Type: application/json

{
  "clientType": "multiview",
  "clientName": "VectorMesh Multiview v2.1.0"
}
```

Response:
```json
{
  "screenId": "screen-uuid",
  "monitorSessionId": "session-uuid",
  "monitorUrl": "https://events.your-org.com/monitor-bootstrap/screen-uuid?token=abc123...",
  "expiresAt": "2026-08-10T18:00:00.000Z"
}
```

**Security properties:**
- `monitorUrl` contains a **single-use** 32-byte bootstrap token. After the first load, the URL is consumed and cannot be reloaded.
- The session expires at `expiresAt` (default 4 hours).
- No device token, pairing code, or other physical-player credential is ever included.

---

## Step 3 — Load the Monitor URL into an Electron WebContentsView

```javascript
const { WebContentsView } = require("electron");

async function openMonitorView(win, monitorUrl, bounds) {
  const view = new WebContentsView({
    webPreferences: {
      // Monitor pages are served from the same origin as the main app.
      // No node integration required.
      nodeIntegration: false,
      contextIsolation: true,
      // Let Chromium handle the redirect and cookie automatically.
      partition: `persist:monitor-${screenId}`,
    },
  });

  win.contentView.addChildView(view);
  view.setBounds(bounds);

  // Chromium handles the bootstrap redirect and cookie transparently.
  // The page lands on /monitor/:screenId and begins rendering the live content.
  await view.webContents.loadURL(monitorUrl);
}
```

**What Chromium does automatically:**
1. Fetches `GET /monitor-bootstrap/:screenId?token=...`
2. Server validates the bootstrap token (single-use), generates a session secret, sets an HttpOnly SameSite=Strict cookie, redirects to `/monitor/:screenId`
3. Browser follows the 302 redirect — the cookie is sent automatically
4. Server validates the cookie, serves the React SPA
5. React detects the `/monitor/` path, renders `MonitorPage` with all `PlayerCapabilities` set to `false`
6. Monitor polls `GET /api/monitor/:screenId/content` every 7 seconds using the cookie

---

## Step 4 — Content Rendering

The monitor page renders the screen's live layout identically to the physical player, using the same zone renderer. The following capabilities are **permanently disabled** in monitor mode:

| Capability | Physical Player | Monitor |
|------------|----------------|---------|
| Heartbeat (`POST /api/player/heartbeat`) | ✓ | ✗ |
| Video health reporting | ✓ | ✗ |
| Pairing handshake | ✓ | ✗ |
| localStorage device identity | ✓ | ✗ |
| `refreshRequested` (page reload) | ✓ | ✗ |
| `screenshotRequested` | ✓ | ✗ |

This ensures that loading a monitor page **never** changes the physical player's `lastSeen`, `isOnline`, heartbeat count, pairing state, or device token.

---

## Step 5 — Session Lifecycle

### Refresh before expiry

Create a new monitor session 15–30 minutes before `expiresAt` and load it into a new `WebContentsView`. Then remove the old view.

```javascript
function scheduleSessionRefresh(screenId, expiresAt, win) {
  const refreshAt = new Date(expiresAt).getTime() - 20 * 60 * 1000; // 20 min before
  const delay = refreshAt - Date.now();
  if (delay > 0) {
    setTimeout(() => refreshMonitorView(screenId, win), delay);
  }
}
```

### Revoke a session

When closing a monitor view, revoke the session to invalidate the cookie immediately:

```http
DELETE /api/operations/monitor-sessions/{monitorSessionId}
Authorization: Bearer vm_YOUR_TOKEN

→ { "revoked": true }
```

After revocation the next content poll from the monitor page returns 401 and the React app shows an "expired" placeholder.

---

## Step 6 — Error Handling

The monitor bootstrap flow and content endpoint both return the same generic 401 for all failure reasons:

```json
{
  "error": "UNAUTHORIZED",
  "message": "Monitor session invalid, expired, or revoked. Create a new monitor session."
}
```

Recommended handling in Electron:

```javascript
view.webContents.on("did-navigate", (event, url, httpResponseCode) => {
  if (httpResponseCode === 401) {
    // Session expired or revoked — create a new one
    recreateMonitorSession(screenId, win);
  }
});
```

---

## Full Example

```javascript
const BASE_URL = "https://events.your-org.com";
const TOKEN = "vm_YOUR_TOKEN_HERE";

async function headers() {
  return {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function createMonitorSession(screenId) {
  const res = await fetch(`${BASE_URL}/api/operations/screens/${screenId}/monitor-session`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ clientType: "multiview", clientName: "VectorMesh Multiview" }),
  });
  if (!res.ok) throw new Error(`Failed to create monitor session: ${res.status}`);
  return res.json();
}

async function revokeMonitorSession(sessionId) {
  await fetch(`${BASE_URL}/api/operations/monitor-sessions/${sessionId}`, {
    method: "DELETE",
    headers: await headers(),
  });
}

// Main usage
const screens = await discoverScreens(); // from GET /api/operations/…
for (const screen of screens) {
  const { monitorUrl, monitorSessionId, expiresAt } = await createMonitorSession(screen.id);
  await openMonitorView(win, monitorUrl, computeBounds(screen));
  scheduleSessionRefresh(screen.id, expiresAt, win);
  // On close:
  // await revokeMonitorSession(monitorSessionId);
}
```

---

## Security Notes

- **Never store or log `monitorUrl`** after it has been loaded — the bootstrap token is single-use and the URL becomes invalid after the first navigation.
- **Use a dedicated Electron partition** per monitor session (`partition: persist:monitor-<screenId>`) so cookies don't bleed between sessions.
- **Partition storage is cleared** when `WebContentsView` is destroyed. The session is revoked server-side via DELETE before that.
- The bootstrap URL **must not be passed through a redirect chain** that could leak it via the Referer header. The server sets `Referrer-Policy: no-referrer` on bootstrap responses.

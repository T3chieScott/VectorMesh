# VectorMesh Display Operations API — Contract

**Version:** 1.0  
**Namespace:** `/api/operations/`  
**Purpose:** Stable read-only API for external operational clients (VectorMesh Multiview, etc.)

---

## Authentication

All Operations API endpoints require authentication via **one of**:

### 1. Session cookie (browser / Electron session)

Log in through the existing web login flow.  
The session cookie is set automatically and sent with subsequent requests.

### 2. Bearer token (`vm_...`)

```
Authorization: Bearer vm_<token>
```

API tokens are created in the VectorMesh admin UI under **Account → API Tokens**.  
Tokens must also be granted the required operations scope (see Permissions below).

---

## Error Response Format

All errors return JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| HTTP Status | `code` | Meaning |
|---|---|---|
| 401 | `UNAUTHENTICATED` | No valid session or token |
| 403 | `FORBIDDEN` | Valid auth but insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 500 | `INTERNAL_ERROR` | Server error — safe message, no internals leaked |

---

## Permissions / Scopes

Admins and Account Managers automatically pass all Operations API scope checks.

Site Users and API tokens require explicit scope grants in the `user_operations_scopes` / `token_operations_scopes` tables.

| Scope | Grants access to |
|---|---|
| `operations.view` | Projects list, venues list |
| `operations.screen.read` | Screens list, screen summary |
| `operations.multiview` | Monitor session creation (Task #330) |
| `operations.diagnostics.read` | Future: detailed diagnostics |
| `operations.player.refresh` | Future: trigger player refresh |
| `operations.player.restart` | Future: restart player software |
| `operations.player.reboot` | Future: reboot device |
| `operations.logs.read` | Future: read player logs |
| `operations.content.control` | Future: content control commands |

---

## Endpoints

### GET /api/operations/projects

Returns projects accessible to the authenticated user.

**Required scope:** `operations.view`

**Response:** `200 OK`

```json
[
  {
    "id": "proj-abc123",
    "name": "FIA 2026",
    "status": "active",
    "startDate": "2026-08-10T00:00:00.000Z",
    "endDate": "2026-08-14T00:00:00.000Z"
  },
  {
    "id": "proj-xyz789",
    "name": "Future Event",
    "status": "inactive",
    "startDate": "2026-12-01T00:00:00.000Z",
    "endDate": "2026-12-05T00:00:00.000Z"
  },
  {
    "id": "proj-noevents",
    "name": "Blank Project",
    "status": "unscheduled",
    "startDate": null,
    "endDate": null
  }
]
```

**Status values:**

| `status` | Meaning |
|---|---|
| `active` | A currently running event exists |
| `inactive` | A scheduled future event exists |
| `unscheduled` | No events defined |

---

### GET /api/operations/projects/:projectId/venues

Returns venues (screen groups) within a project.

**Required scope:** `operations.view`

**Path parameters:**

| Parameter | Description |
|---|---|
| `projectId` | Project ID from `/api/operations/projects` |

**Response:** `200 OK`

```json
[
  {
    "id": "venue-001",
    "name": "Hall 1",
    "screenCount": 18
  },
  {
    "id": "venue-002",
    "name": "D-Gate",
    "screenCount": 12
  }
]
```

**Error cases:**
- `404` — project not found
- `403` — user cannot access this project

---

### GET /api/operations/venues/:venueId/screens

Returns screens in a venue.

**Required scope:** `operations.screen.read`

**Path parameters:**

| Parameter | Description |
|---|---|
| `venueId` | Venue ID from `/api/operations/projects/:id/venues` |

**Response:** `200 OK`

```json
[
  {
    "id": "screen-001",
    "name": "Main Entrance LED",
    "status": {
      "online": true,
      "lastHeartbeat": "2026-08-10T14:01:23.000Z"
    },
    "display": {
      "width": 1920,
      "height": 1080
    },
    "player": {
      "hostname": "vectormesh-001",
      "ipAddress": "192.168.1.10",
      "hardwareClass": "raspberry-pi-4"
    }
  }
]
```

**Security:** `deviceToken`, `pairingCode`, and all internal credential fields are explicitly excluded at the API mapping layer. They are never present in any response, regardless of caller role.

**Error cases:**
- `404` — venue not found
- `403` — user cannot access this venue's project

---

### GET /api/operations/screens/:screenId

Returns a single screen summary.

**Required scope:** `operations.screen.read`

**Path parameters:**

| Parameter | Description |
|---|---|
| `screenId` | Screen ID from `/api/operations/venues/:id/screens` |

**Response:** `200 OK` — same shape as a single element from the screens list:

```json
{
  "id": "screen-001",
  "name": "Main Entrance LED",
  "status": {
    "online": true,
    "lastHeartbeat": "2026-08-10T14:01:23.000Z"
  },
  "display": {
    "width": 1920,
    "height": 1080
  },
  "player": {
    "hostname": "vectormesh-001",
    "ipAddress": "192.168.1.10",
    "hardwareClass": "raspberry-pi-4"
  }
}
```

**Note:** `display.width` and `display.height` are `null` when no display profile has been assigned. `player.*` fields are `null` until the physical player first heartbeats.

**Error cases:**
- `404` — screen not found
- `403` — user cannot access this screen's project

---

## Null field semantics

| Field | `null` means |
|---|---|
| `startDate` / `endDate` | No event associated with this project |
| `status.lastHeartbeat` | Screen has never heartbeated |
| `display.width` / `display.height` | No display profile assigned |
| `player.hostname` | Player has not yet connected |
| `player.ipAddress` | Player has not yet connected |
| `player.hardwareClass` | Player has not reported hardware type |

---

## Monitor Sessions

Monitor session creation (`POST /api/operations/screens/:id/monitor-session`) is implemented in Task #330 and is not yet available.

---

## Real-time Events (Future Phase)

A future phase will add server-push operational events so Multiview can subscribe instead of polling:

- `screen.online` / `screen.offline`
- `screen.updated`
- `screen.contentChanged`
- `screen.healthUpdated`

---

## Multiview Integration Quick-Start

See [`docs/multiview-integration.md`](./multiview-integration.md) for the step-by-step Electron integration guide.

### curl example

```bash
# 1. Obtain a vm_... API token from the VectorMesh admin UI
# 2. List projects
curl -H "Authorization: Bearer vm_your_token_here" \
     https://vectormesh.4wallcloud.com/api/operations/projects

# 3. List venues for a project
curl -H "Authorization: Bearer vm_your_token_here" \
     https://vectormesh.4wallcloud.com/api/operations/projects/proj-abc123/venues

# 4. List screens in a venue
curl -H "Authorization: Bearer vm_your_token_here" \
     https://vectormesh.4wallcloud.com/api/operations/venues/venue-001/screens

# 5. Get a single screen summary
curl -H "Authorization: Bearer vm_your_token_here" \
     https://vectormesh.4wallcloud.com/api/operations/screens/screen-001
```

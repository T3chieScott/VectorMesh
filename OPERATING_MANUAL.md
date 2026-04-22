# VectorMesh Operating Manual

A practical guide to running VectorMesh — the onsite display management platform for conference and exhibition centres.

---

## Table of Contents

1. [What VectorMesh Is](#1-what-vectormesh-is)
2. [Core Concepts & Glossary](#2-core-concepts--glossary)
3. [Roles & Permissions](#3-roles--permissions)
4. [Logging In & Two-Factor Authentication](#4-logging-in--two-factor-authentication)
5. [The Site Switcher](#5-the-site-switcher)
6. [Day-to-Day Workflow](#6-day-to-day-workflow)
7. [Media Library](#7-media-library)
8. [Layouts](#8-layouts)
9. [Playlists](#9-playlists)
10. [Screens](#10-screens)
11. [Screen Groups](#11-screen-groups)
12. [Display Profiles](#12-display-profiles)
13. [Programmes & the Schedule](#13-programmes--the-schedule)
14. [Live Override](#14-live-override)
15. [Presets & the Control Panel](#15-presets--the-control-panel)
16. [Player Simulator](#16-player-simulator)
17. [Player Behaviour & Priority Chain](#17-player-behaviour--priority-chain)
18. [Pairing a Display Node (Raspberry Pi)](#18-pairing-a-display-node-raspberry-pi)
19. [Live Snapshots & Diagnostics](#19-live-snapshots--diagnostics)
20. [Alerts & Monitoring](#20-alerts--monitoring)
21. [Admin Area](#21-admin-area)
22. [API Tokens & External Integrations](#22-api-tokens--external-integrations)
23. [Bitfocus Companion / Stream Deck](#23-bitfocus-companion--stream-deck)
24. [REST API Reference](#24-rest-api-reference)
25. [Deployment & Updates](#25-deployment--updates)
26. [Troubleshooting](#26-troubleshooting)
27. [Player Variables](#27-player-variables)

---

## 1. What VectorMesh Is

VectorMesh is a web application that controls what appears on the screens around a venue — meeting-room boards, public-area displays, foyer signage, large external LED walls, and video-wall arrays. From a single browser, an operator can:

- Upload images, video and GIFs to a shared media library.
- Build zone-based **layouts** that combine media with widgets (clocks, tickers, schedules, weather, flight boards, QR codes, countdowns, sports fixtures, live streams, etc.).
- Schedule which layout plays on which screen at what time.
- Push a **live override** instantly when something needs to change right now (an emergency notice, a sponsor takeover, a session change).
- Trigger pre-built **presets** with one click — or from a Stream Deck via Bitfocus Companion.
- See what each screen is actually showing through automatic **snapshots** and live heartbeats.

Each physical display runs the VectorMesh **player** in a browser (typically a Raspberry Pi in kiosk mode). The player keeps content cached locally and continues running even if the network drops.

---

## 2. Core Concepts & Glossary

| Term | Meaning |
|---|---|
| **Site (Client)** | A tenant — usually one venue or one customer. All content is owned by a site. The Site Switcher in the sidebar filters everything you see. |
| **Event** | An optional grouping inside a site (e.g. "ISE 2026", "Spring Conference"). Used to organise media, layouts and programmes. |
| **Media Asset** | A single image, video or GIF in the library. |
| **Layout (Template)** | A canvas of **zones** (boxes) at a given aspect ratio. A zone can be a media region, a widget, or a playlist player. |
| **Zone** | One element inside a layout — clock, ticker, image, video, QR, countdown, schedule, weather, flight board, etc. |
| **Playlist** | An ordered list of items that rotate on a timer. Each item is either a media asset or a whole layout. |
| **Screen** | One physical display. Has resolution, aspect ratio, optional canvas position, a fallback layout and/or fallback playlist, and a pairing token. |
| **Screen Group** | A named bundle of screens used to push the same content to many at once. |
| **Display Profile** | A reusable hardware profile (resolution, orientation) that can be applied to many screens. |
| **Programme** | A container for **schedule blocks** — time-rule entries that say "show layout X on screen/group Y from 09:00 to 17:00 on weekdays". |
| **Schedule Block** | A single timed entry inside a programme. |
| **Live Override** | A high-priority command that forces a layout (or playlist) onto a screen or group **right now**, bypassing the schedule. |
| **Preset** | A saved "screen + layout (and optional zone overrides)" pairing that can be activated with one click and becomes a Live Override under the hood. |
| **Fallback Layout / Playlist** | What a screen falls back to when nothing scheduled applies. |
| **Pairing Token** | A short code generated for an unpaired screen; used by the player device to bind itself to that screen. |
| **Heartbeat** | A periodic "I'm alive" ping the player sends to the server, with status, current layout, uptime and version. |
| **Snapshot** | A JPEG screenshot of what the player is currently rendering, captured by the browser and uploaded periodically. |
| **API Token** | A long-lived bearer credential a user mints to allow external tools (Stream Deck, scripts) to call the API on their behalf. |
| **Canvas** | A virtual coordinate space larger than a single screen, used to map physical video walls (e.g. an 1920×1080 canvas with a 348×1044 portrait screen positioned inside it). The screen renders only its **AOI** (Area of Interest) — the rectangle that falls on its physical pixels. |

---

## 3. Roles & Permissions

VectorMesh has three roles, set per user:

### Admin
- Sees and edits **everything** across **all sites**.
- Manages users, sites, system settings, audit logs, alerts, deployment.
- Can copy/move layouts between sites, lock screens and clients, and clear audit history.

### Account Manager
- Manages users **within their assigned sites**.
- Has full content control on those sites (media, layouts, playlists, screens, programmes, presets, live override).
- Can mint API tokens.
- Cannot edit sites they aren't assigned to and cannot change system settings.

### Site User
- Day-to-day operator on assigned sites.
- Can edit content and push live overrides on their sites.
- Cannot manage users or system settings.
- Cannot mint API tokens.

Site assignment is managed from **Admin → Users**. A user can be assigned to one or many sites; the Site Switcher only lists sites they belong to (Admins see all).

Every mutating action and every login event is written to the **audit log** (Admin → Audit Log).

---

## 4. Logging In & Two-Factor Authentication

**2FA is mandatory for every user.** The login flow has two steps:

1. Enter email and password.
2. Enter the 6-digit TOTP code from your authenticator app (Google Authenticator, Authy, 1Password, etc.).

### First-time login
On a brand-new account the system forces a **2FA enrollment** screen:

1. Open your authenticator app and scan the QR code shown.
2. Type the 6-digit code from the app to confirm.
3. From this point onward, login always requires the code.

If a user loses their authenticator, an Admin or Account Manager can reset their password from **Admin → Users → … → Reset password**, which clears the 2FA secret and triggers a fresh enrollment on next login.

### Forgotten password
Click **Forgot password** on the login screen. If SMTP is configured the system emails a reset link. The link expires after a short window.

### Changing your own password
**Settings → Change password**. You'll need your current password.

---

## 5. The Site Switcher

The dropdown at the top of the left sidebar selects the **active site**. It controls what almost every page shows:

- Media, layouts, playlists, screens, screen groups, programmes — all filter by the active site.
- Creating new content assigns it to the active site automatically.
- Admins can pick **All Sites** to see everything at once.

Always check the switcher first when something seems missing — you're probably on the wrong site.

---

## 6. Day-to-Day Workflow

A typical event-day routine:

1. **Morning check** — open **Screens**. Every tile should be green (online) and the snapshot thumbnail should match what you expect.
2. **Confirm today's programme** — open **Schedule** and look at today's blocks. If a session moved, edit the block's start/end time or push a **Live Override**.
3. **Pre-stage announcements** — build any one-off layouts (e.g. "Lunch break" slate) and save them as **Presets** so you can fire them from the Control Panel or a Stream Deck.
4. **During sessions** — use **Control Panel** or a Stream Deck button to switch foyer screens between welcome / sponsor / session-info / wayfinding presets.
5. **Emergencies** — **Live Override** with a high priority (≥ 200) targeted at the right screens or groups; clear it when the situation passes.
6. **End of day** — review **Activity Log** for anything unexpected; clear lingering overrides.

---

## 7. Media Library

**Sidebar → Media.**

- Click **Upload** to add files. Admins are prompted to pick the owning site. Account Managers / Site Users upload to the active site.
- Files are tagged automatically as `image`, `video` or `gif`. Videos get a thumbnail generated server-side; their duration is recorded.
- **View modes**: grid or list (toggle top-right). Search filters by name.
- **Display mode** (Fit vs Fill) per asset controls how the player composes the image inside its zone:
  - **Fill** (`cover`) — fills the zone, may crop.
  - **Fit** (`contain`) — letterboxes, never crops.
- **Sharing** (Admin only): … menu → **Share to Sites** lets you grant other sites read-access to a media asset. Shared assets show an amber **Shared** badge and cannot be deleted from the borrowing site.
- **Preview** opens a modal with full-size playback.
- **Download** downloads the original file.

Files live on the server's local disk under `<UPLOAD_DIR>/<clientId>/uploads/`; thumbnails under `<UPLOAD_DIR>/<clientId>/thumbnails/`. The root is configurable in **Admin → System Settings**.

---

## 8. Layouts

**Sidebar → Layouts.**

A layout is a canvas at a fixed **aspect ratio** with one or more **zones** placed on it.

### Creating a layout
1. **Add Layout** → name it, choose the aspect ratio (16:9, 9:16, 21:9, 4:3, custom, etc.) and resolution.
2. The layout editor opens. Drag zones onto the canvas and resize them.
3. Each zone has a **type** and a config panel. Available zone types include:
   - **Media region** — single image/video/GIF.
   - **Media player** — a playlist with transitions and controls.
   - **Ticker** — scrolling text.
   - **Clock** — analogue or digital, multiple time zones.
   - **Logo** — site/event logo.
   - **QR code** — URL, WiFi credentials, or vCard.
   - **Countdown** — event countdown with custom styling.
   - **Schedule** — room schedule with multiple display modes.
   - **Football table / Premier League fixtures** — live league data.
   - **Heathrow arrivals / departures** — live flight board.
   - **Weather forecast** — current and multi-day.
   - **SpaceX launch** — next-launch countdown.
   - **Earthquakes** — global recent events.
   - **Aircraft overhead** — radar list or map view.
   - **SRT live feed / WebRTC stream** — from OvenMediaEngine.
4. **Save**. The layout is now selectable in screens, programmes and presets.

### Layout actions
- **Duplicate** — copy as a starting point.
- **Copy / Move to site** (Admin only, from the dropdown) — share a layout across tenants.
- **Delete** — only allowed if no schedule block, screen fallback or preset references it.

### Multi-screen canvas
For video walls, switch on **Canvas positioning** in the screen settings (not the layout). The layout is rendered across the full canvas; each screen shows only its AOI rectangle.

---

## 9. Playlists

**Sidebar → Playlists.**

Playlists rotate items on a timer. They can be assigned as a **fallback playlist** on a screen, or used inside a media-player zone.

### Item types
- **Media item** — an image, video or GIF. Default duration:
  - Images / GIFs: 10 seconds (override per item).
  - Videos: full length unless you set a duration.
- **Layout item** — an entire layout. Duration defaults to 30 seconds. The player rotates through the layouts; identical zones across consecutive layouts (clock, ticker, video) stay mounted so they don't restart.

### Editing
- **Manage Items** (collapsible inside each playlist card) — add, edit, remove, **drag to reorder**.
- Use **Add Media** for a media item, **Add Layout** for a layout item.
- Per item you can set a custom duration; for videos leave it blank to play the full length.

---

## 10. Screens

**Sidebar → Screens.**

Each tile represents one physical display.

### Creating a screen
1. **Add Screen** → name, location, resolution, aspect ratio, optional **display profile**.
2. (Optional) Enable **Canvas positioning** for video walls and enter canvas size + this screen's `(x, y)` and AOI dimensions.
3. (Optional) Set a **Fallback Layout** and/or **Fallback Playlist** — what plays when nothing is scheduled.
4. Save. A **pairing token** is generated.

### Screen card controls
Each card shows status (online/offline), last heartbeat, current layout source, and exposes:

- **Pairing code** — paste into the player on first boot.
- **Regenerate pairing code** — invalidates the old token (use after a hardware swap).
- **Unpair** — disconnects the device but keeps the screen entry.
- **Refresh** — sends a remote-reload signal so the player picks up new content immediately.
- **Request snapshot** — asks the player for a fresh screenshot.
- **Show snapshot** — opens the snapshot popup, with a **Screen / Canvas** toggle (Canvas mode uses CSS-cropping to show what falls on the AOI vs the whole virtual canvas).
- **Show LIVE Banner** toggle — when ON, a red "LIVE PRESET" banner appears on the player while a preset/override is active. Default: OFF.
- **Enable snapshots** toggle — when ON, the player captures a JPEG every 60 seconds.
- **Identify** — flashes the screen briefly so you can find it physically.
- **Lock** (Admin only) — prevents accidental edits/deletion.
- **Edit** — change resolution, profile, fallbacks, canvas, etc.
- **Delete** — only when not referenced by any schedule, group or preset.

---

## 11. Screen Groups

**Sidebar → Screen Groups.**

A group is a bag of screens belonging to a single site. Useful for "all foyer screens", "all meeting-room screens", "the LED wall pair", etc. You can:

- **Manage Screens** — add/remove members. Only same-site screens are eligible.
- **Manage Presets** — see [Presets](#15-presets--the-control-panel).
- Target a group from a programme block or a live override — every member follows.

---

## 12. Display Profiles

**Admin → Display Profiles** (per site).

Reusable "this is the hardware spec" templates so you don't re-type resolution/orientation for every screen. Pick a profile when creating or editing a screen; the dropdown only lists profiles from the same site.

---

## 13. Programmes & the Schedule

**Sidebar → Schedule** (or the **Programmes** page).

A **programme** is a folder of **schedule blocks**. A block answers:

- **Which layout?**
- **Which target?** (one screen, several screens, or a group)
- **When?** (start/end time, date range)
- **How often?** (one-off, daily, specific days of the week)
- **At what priority?** (higher = wins ties; default 100)

### Creating a block
1. Open a programme → **Add Block**.
2. Pick the layout, target screen(s)/group, set start/end and recurrence (e.g. Mon–Fri 09:00–17:00).
3. Set a priority. The default 100 is fine for normal scheduled content.
4. Save.

### Programme versions
Each programme keeps a version history so you can revert if a major edit goes wrong (Admin: Programme → Versions).

---

## 14. Live Override

**Sidebar → Live Override.**

A live override pushes a layout (or playlist) onto a screen/group **immediately**, bypassing the scheduled programme.

- Pick the layout / playlist, target screen(s) or group, and a **priority** (higher beats other overrides).
- Add an optional message and expiry.
- **Activate** — the player switches within seconds.
- **Clear** — removes the override; the player returns to scheduled content.

Use cases: emergency announcements, last-minute room changes, ad-hoc sponsor takeovers.

> **Tip:** If a screen has the **Show LIVE Banner** toggle ON, a red banner appears so people in the room know a preset/override is active.

---

## 15. Presets & the Control Panel

A **preset** is a saved "play this layout on this screen/group" that you can fire with one click. Internally, activating a preset creates a high-priority (200) live override; deactivating clears it.

### Saving a preset
On a screen card or screen-group card, expand **Manage Presets**:

1. Choose a layout (or playlist).
2. Optionally override individual zones (e.g. swap the media in zone "Centre Wall" to today's sponsor reel).
3. Name the preset and save.

### Activating presets
**Sidebar → Control Panel.** All presets the user can see are listed grouped by target. Click to activate; click again (or use **Stop**) to deactivate. The active preset glows.

Empty-target presets cannot be activated.

### Companion / Stream Deck
The Control Panel mirrors what a Stream Deck triggers. See [Bitfocus Companion / Stream Deck](#23-bitfocus-companion--stream-deck).

---

## 16. Player Simulator

**Sidebar → Simulator.**

A browser-side preview that resolves and renders exactly what the chosen screen would show right now, using the same priority chain as the real player:

1. Live override
2. Scheduled programme block
3. Fallback layout
4. Fallback playlist

A **source badge** tells you which step won. Use it to dry-run schedule changes, verify a preset, or check a layout at the exact resolution and aspect ratio.

For canvas-enabled screens the simulator has a **Full Canvas / Screen AOI** toggle:

- **Full Canvas** — entire virtual canvas with the layout positioned inside the AOI rectangle and black elsewhere. Matches what the real player renders end-to-end.
- **Screen AOI** — just the screen's viewport, layout filling it. Matches what the physical display shows.

---

## 17. Player Behaviour & Priority Chain

The player on each device polls the server periodically and resolves what to show using this strict priority order:

1. **Live override** targeting this screen (or any group it belongs to). Highest-priority override wins; on a tie, the most recent.
2. **Scheduled programme block** whose time rule matches now. Highest-priority block wins; on a tie, the most recent.
3. **Fallback layout** configured on the screen.
4. **Fallback playlist** configured on the screen, rendered full-screen via a synthetic media player zone.

If none of these resolve, the screen shows a "no content" placeholder.

### Offline resilience
The player ships a Service Worker that caches the layout JSON and pre-fetches all media assets in the background. If the internet drops, the player keeps running from cache and shows an **Offline** badge. Once connectivity returns it silently resumes polling and updates content.

### Zone stability during rotation
When a playlist contains multiple layouts, zones with identical config (type, position, size) are kept mounted across rotations — videos keep playing, tickers keep scrolling, clocks keep ticking. Only changed zones re-render.

---

## 18. Pairing a Display Node (Raspberry Pi)

The reference player is a Raspberry Pi running Chromium in kiosk mode. Setup:

1. In VectorMesh: create the screen (or pick an existing unpaired one). Copy the **pairing code**.
2. On the Pi: run the provided `pi-kiosk-setup` script. It installs Chromium kiosk mode and opens the player URL.
3. The first time the player loads, it asks for the pairing code. Paste it. The device receives a long-lived **device token** and binds itself to the screen.
4. The screen now appears as **Online** with heartbeats.

To swap hardware: in VectorMesh, click **Regenerate pairing code** on the screen, then pair the new device with the new code. The old device is rejected immediately.

To retire a device: **Unpair** keeps the screen entry; **Delete** removes the screen entirely.

---

## 19. Live Snapshots & Diagnostics

### Snapshots
With the **Enable snapshots** toggle ON, the player uses `html2canvas` to capture a compressed JPEG of its rendered output every 60 seconds and uploads it. The screen card shows a thumbnail and the capture timestamp; clicking opens the larger viewer with the **Screen / Canvas** toggle for canvas-enabled screens.

You can also force-request a fresh snapshot from the screen card.

### Heartbeats
Every player sends a heartbeat with: online status, current layout, browser/OS, version, uptime, network info. **Sidebar → Diagnostics** shows recent heartbeats per screen and any errors the player has reported.

### Activity Log
**Sidebar → Activity Log.** Live feed of mutating actions and authentication events for sites you can see. Useful for "who changed that?".

---

## 20. Alerts & Monitoring

**Admin → Alerts.**

- Configure **email recipients** per site.
- Pick which events trigger emails (screen offline, screen back online).
- A cooldown prevents alert storms when a flaky network flips a screen up/down repeatedly.
- Alert history is preserved.

SMTP must be configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) for email to work. `APP_URL` should be set so links in emails point to the right place.

---

## 21. Admin Area

Visible only to Admins (some pages also to Account Managers within their sites).

| Page | Purpose |
|---|---|
| **Sites (Clients)** | Create/edit sites, set branding, lock to prevent accidental edits. |
| **Users** | Create users, set role, assign sites, reset passwords (which also clears 2FA), force password change, delete. |
| **Display Profiles** | Per-site hardware templates. |
| **Brand Packs** | Per-event colour palettes for consistent branding inside layouts. |
| **Audit Logs** | Searchable, filterable record of every mutating action. Admins can clear. |
| **Stats** | Per-site counts (screens, layouts, online %, recent activity). |
| **System Settings** | Upload root directory and other global toggles. |
| **Streaming Server** | OvenMediaEngine status & SRT/WebRTC live feed health. |
| **Deployment** | Build a tarball of the current server state for off-Replit deployment (see [Deployment](#25-deployment--updates)). |

---

## 22. API Tokens & External Integrations

**Settings → API Tokens** (Admin / Account Manager only).

- Click **Create token**, give it a label (e.g. "Stream Deck — Foyer").
- The token is shown **once**, formatted `vm_<base64url>`. Copy it now; it's stored only as a SHA-256 hash.
- Use it as `Authorization: Bearer vm_...` on API calls.
- Tokens act on behalf of their owner — the same site scoping and role permissions apply.
- The token's **last used at** and **known IPs** are recorded; new IPs raise an acknowledgement prompt.
- **Revoke** any time; revocation takes effect immediately.

---

## 23. Bitfocus Companion / Stream Deck

VectorMesh has a first-party **Bitfocus Companion** module: `companion-module-vectormesh` (v0.1.0).

### Setting up
1. Install the module in Companion (development modules folder during pre-release; the public bitfocus repo once published).
2. Add a connection: server URL (e.g. `https://vectormesh.example.com`), API token from **Settings → API Tokens**.
3. Companion fetches the list of presets and exposes them as actions and feedbacks.

### Typical buttons
- **Activate preset X** — single-click to push that preset live.
- **Deactivate preset X** — clears it.
- **Toggle preset X** — convenience action.
- **Feedback** — button colour reflects whether the preset is currently active (polled via `GET /api/screen-presets/active`).

### Useful endpoints
- `GET /api/screen-presets` — list presets the token can see.
- `GET /api/screen-presets/active` — currently active presets `[ { presetId, name, screenIds, since } ]`.
- `POST /api/screen-presets/:id/activate`
- `POST /api/screen-presets/:id/deactivate`

---

## 24. REST API Reference

All endpoints return JSON. Authentication is either a session cookie (browser) or `Authorization: Bearer vm_...` (token). All endpoints respect tenant scoping and role permissions.

### Auth
- `POST /api/auth/login` — `{ email, password }` → starts the 2FA challenge.
- `POST /api/auth/2fa/validate` — `{ code }` → completes login.
- `POST /api/auth/logout`.
- `GET  /api/auth/user` — current user.
- `POST /api/auth/change-password`.
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password`.
- `POST /api/auth/2fa/setup` / `POST /api/auth/2fa/confirm-setup`.

### API Tokens (self)
- `GET  /api/me/api-tokens`
- `POST /api/me/api-tokens` — `{ label }` → returns the plaintext token **once**.
- `DELETE /api/me/api-tokens/:id` — revoke.

### Sites (Clients)
- `GET /api/clients` · `GET /api/clients/:id`
- `POST /api/clients` · `PATCH /api/clients/:id` · `DELETE /api/clients/:id`
- `POST /api/clients/:id/lock` (Admin)

### Events
- `GET /api/events` · `GET /api/events/:id`
- `POST /api/events` · `PATCH /api/events/:id` · `DELETE /api/events/:id`

### Display Profiles
- `GET /api/display-profiles?clientId=...`
- `POST /api/display-profiles` · `PATCH /api/display-profiles/:id` · `DELETE /api/display-profiles/:id`

### Screen Groups
- `GET /api/screen-groups` (cookie or token)
- `POST /api/screen-groups` · `PATCH /api/screen-groups/:id` · `DELETE /api/screen-groups/:id`
- `GET /api/screen-groups/:id/members`
- `POST /api/screen-groups/:id/members` — `{ screenId }`
- `DELETE /api/screen-groups/:id/members/:screenId`

### Screens
- `GET /api/screens?clientId=...&groupId=...` (cookie or token)
- `GET /api/screens/:id` · `POST /api/screens` · `PATCH /api/screens/:id` · `DELETE /api/screens/:id`
- `POST /api/screens/:id/regenerate-pairing`
- `POST /api/screens/:id/refresh` — remote reload.
- `POST /api/screens/:id/request-screenshot`
- `POST /api/screens/:id/unpair`
- `POST /api/screens/:id/lock` (Admin)
- `GET /api/screens/:id/heartbeats`

### Media
- `GET /api/media` · `POST /api/media/upload` (multipart) · `PATCH /api/media/:id` · `DELETE /api/media/:id`
- `GET /api/media/:id/file` · `GET /api/media/:id/thumbnail`
- `GET /api/media/:id/shares` · `POST /api/media/:id/share` · `DELETE /api/media/:id/share/:clientId`

### Layouts
- `GET /api/layout-templates?clientId=...`
- `POST /api/layout-templates` · `PATCH /api/layout-templates/:id` · `DELETE /api/layout-templates/:id`
- `POST /api/layout-templates/:id/copy` · `POST /api/layout-templates/:id/move`

### Playlists
- `GET /api/playlists` · `POST /api/playlists` · `PATCH /api/playlists/:id` · `DELETE /api/playlists/:id`
- `GET /api/playlists/:id/items` · `POST /api/playlists/:id/items` · `PATCH /api/playlist-items/:id` · `DELETE /api/playlist-items/:id`
- `POST /api/playlists/:id/reorder` — `{ itemIds }`

### Programmes & Schedule
- `GET /api/programmes` · `POST /api/programmes` · `PATCH` · `DELETE`
- `GET /api/programmes/:id/blocks` · `POST /api/schedule-blocks` · `PATCH` · `DELETE`
- `GET /api/programmes/:id/versions`

### Live Override
- `GET /api/live-overrides` · `POST /api/live-overrides` · `DELETE /api/live-overrides/:id`

### Presets
- `GET /api/screen-presets[?screenId=...&groupId=...]`
- `POST /api/screen-presets` · `PATCH /api/screen-presets/:id` · `DELETE /api/screen-presets/:id`
- `POST /api/screen-presets/:id/activate` · `POST /api/screen-presets/:id/deactivate`
- `GET /api/screen-presets/active`

### Player (device-token authenticated)
- `GET /api/player/content?screenId=...` — returns layout, screen config, `layoutTemplates` map, override info.
- `POST /api/player/heartbeat` · `POST /api/player/snapshot`
- `GET /api/player/widgets/...` — flight boards, weather, fixtures, earthquakes, aircraft, SpaceX, etc.

### Admin
- `GET /api/admin/users` · `POST` · `PATCH /api/admin/users/:id` · `DELETE`
- `POST /api/admin/users/:id/reset-password` · `POST /api/admin/users/:id/force-change-password`
- `POST /api/admin/users/:id/sites` · `DELETE /api/admin/users/:id/sites/:clientId`
- `GET /api/admin/audit-logs` · `DELETE /api/admin/audit-logs`
- `GET /api/admin/stats` · `GET /api/admin/stats/by-client`
- `GET /api/system-settings` · `GET /api/system-settings/:key` · `PUT /api/system-settings/:key`

### Health & Deployment
- `GET /api/health`
- `GET /api/deploy-package` (Admin) — streams a tarball of the current server build for off-Replit deployment.

---

## 25. Deployment & Updates

VectorMesh runs on Replit during active development and on a Plesk-managed server in production (`vectormesh.4wallcloud.com`, port 5100, behind PM2).

### Production update flow
1. Confirm the new build is healthy on the Replit dev URL.
2. On the production server, fetch the build:
   ```
   curl -fSLo /tmp/vectormesh.tgz https://<dev-host>/api/deploy-package \
     -H "Authorization: Bearer vm_..."   # an admin token
   ```
3. Extract over the existing app folder (keep `data/`, `.env`, `node_modules` cache):
   ```
   tar -xzf /tmp/vectormesh.tgz -C /var/www/vectormesh --strip-components=1
   ```
4. Install and build:
   ```
   cd /var/www/vectormesh
   npm install --legacy-peer-deps
   npm run build
   ```
5. Apply schema changes:
   ```
   npm run db:push --force
   ```
6. Reload PM2:
   ```
   pm2 restart vectormesh
   ```
7. Smoke test: `GET /api/health`, log in, check Screens page.

### Required environment variables
- `DATABASE_URL` — Postgres connection string.
- `SESSION_SECRET` — random string for session signing.
- `NODE_ENV=production`.

### Optional
- `UPLOAD_DIR` (default `./data/uploads`).
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`.
- `APP_URL` — public URL (used in email links).
- `AERODATABOX_RAPIDAPI_KEY` (and optional `_HOST`, `_BASE_URL`, `_TIMEOUT_MS`) for Heathrow widgets.

---

## 26. Troubleshooting

| Symptom | Where to look | Likely cause / fix |
|---|---|---|
| Screen tile is **red / offline** | Screens page; Diagnostics | Network down; player crashed; Pi unplugged. Power-cycle the Pi. Check Diagnostics for last heartbeat. |
| Screen is online but shows **wrong content** | Live Override page; Schedule | A stale override is active — clear it. Or a higher-priority programme block is winning — check Simulator's source badge. |
| Snapshot is **stale or blank** | Screen card | Snapshots toggle off, or browser blocked the canvas capture. Toggle off and on again, then **Request snapshot**. |
| Player keeps **rebooting** every few minutes | Diagnostics → recent heartbeats | Memory pressure on the Pi (huge media). Reduce video bitrate or resolution. |
| Login loop after entering 2FA code | Browser | Clock skew on user's phone — TOTP is time-based. Resync the authenticator. |
| Forgot 2FA / lost device | Admin → Users → Reset password | Reset clears 2FA; user re-enrolls on next login. |
| **"You don't have access to this site"** error | Site Switcher | User isn't assigned to that site. Admin assigns them in Admin → Users. |
| Media upload fails | Admin → System Settings; server disk | Wrong upload root, or disk full. Check `UPLOAD_DIR` and free space. |
| Companion shows **0 presets** | Settings → API Tokens; preset list | Token's owner can't see any presets (wrong site, or none defined). Mint a token from a user who can see them. |
| Email alerts not arriving | Admin → Alerts; SMTP env | Recipient list empty, cooldown active, or SMTP creds wrong. |
| Layout edits don't appear on player | Refresh button on screen card | Player cache; click **Refresh** or wait for next poll cycle. |
| Video wall geometry looks wrong | Screen edit → Canvas section; Simulator (Full Canvas) | AOI coordinates don't match physical install. Fix `canvasX`, `canvasY`, `canvasWidth`, `canvasHeight`. |
| Deploy package endpoint returns 401 | Token scope | The token must belong to an Admin user. |

---

## 27. Player Variables

VectorMesh supports a small set of **template tokens** that are replaced at runtime with real values from the player's context. Use them anywhere they're supported to keep one layout reusable across many screens, rooms, events, and clients.

### Supported tokens

| Token | Replaced with | Source |
|---|---|---|
| `{{screen_name}}` | The display screen's name | Screen record |
| `{{room_name}}` | The screen's room / location | Screen `location` field |
| `{{event_name}}` | Current programmed event name | Screen's currently assigned event |
| `{{client_name}}` | Owning client / brand name | Screen's owning client |
| `{{date}}` | Today's date in the player's locale | Player clock |
| `{{time}}` | Current time (HH:MM) | Player clock |
| `{{day}}` | Current day of week (e.g. "Monday") | Player clock |

### Where you can use them

Click **Insert Variable** next to any of these fields in the layout editor:

- Ticker text
- Text widget content
- Clock label
- Countdown title
- Countdown completion message
- Schedule header text
- QR code label

Schedule entry titles and HTML widget content also resolve tokens at render time.

### Behaviour notes

- **Empty fallback.** If the screen has no event assigned, `{{event_name}}` becomes an empty string — never the literal token. Same for `{{room_name}}`, `{{client_name}}`, etc.
- **Live refresh.** `{{date}}`, `{{time}}` and `{{day}}` re-render automatically while the player is running (within ~30 s). No reload needed.
- **Editor previews.** In the layout editor and Player Simulator, tokens render as friendly sample values (e.g. `Tech Summit 2025`) so you can see the layout. Only the live player substitutes real screen-specific data.
- **Case sensitive.** Tokens are lowercase with underscores: `{{event_name}}`, not `{{EventName}}`.

---

*If this manual gets out of date, fix it in `OPERATING_MANUAL.md` at the repo root and commit.*

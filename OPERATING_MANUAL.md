# VectorMesh Operating Manual

A practical guide to running VectorMesh — the onsite display management platform for conference and exhibition centres.

---

## Table of Contents

1. [What VectorMesh Is](#1-what-vectormesh-is)
2. [Core Concepts & Glossary](#2-core-concepts--glossary)
3. [Roles & Permissions](#3-roles--permissions)
4. [Logging In & Two-Factor Authentication](#4-logging-in--two-factor-authentication)
5. [The Site Switcher](#5-the-site-switcher)
6. [Getting Around — The Sidebar](#6-getting-around--the-sidebar)
7. [Day-to-Day Workflow](#7-day-to-day-workflow)
8. [Media Library](#8-media-library)
9. [Custom Fonts](#9-custom-fonts)
10. [Layouts](#10-layouts)
11. [HTML/CSS Widgets](#11-htmlcss-widgets)
12. [Playlists](#12-playlists)
13. [Screens](#13-screens)
14. [Screen Groups](#14-screen-groups)
15. [Display Profiles](#15-display-profiles)
16. [Events & Screen Bookings](#16-events--screen-bookings)
17. [Programmes & the Schedule](#17-programmes--the-schedule)
18. [Site Timezones](#18-site-timezones)
19. [Live Override](#19-live-override)
20. [Presets & the Control Panel](#20-presets--the-control-panel)
21. [Agenda Displays](#21-agenda-displays)
22. [Player Simulator](#22-player-simulator)
23. [Player Behaviour & Priority Chain](#23-player-behaviour--priority-chain)
24. [Pairing a Display Node (Raspberry Pi)](#24-pairing-a-display-node-raspberry-pi)
25. [Live Snapshots & Diagnostics](#25-live-snapshots--diagnostics)
26. [Alerts & Monitoring](#26-alerts--monitoring)
27. [Admin & Settings](#27-admin--settings)
28. [API Tokens & External Integrations](#28-api-tokens--external-integrations)
29. [Bitfocus Companion / Stream Deck](#29-bitfocus-companion--stream-deck)
30. [REST API Reference](#30-rest-api-reference)
31. [Deployment & Updates](#31-deployment--updates)
32. [Troubleshooting](#32-troubleshooting)
33. [Player Variables](#33-player-variables)

---

## 1. What VectorMesh Is

VectorMesh is a web application that controls what appears on the screens around a venue — meeting-room boards, public-area displays, foyer signage, large external LED walls, and video-wall arrays. From a single browser, an operator can:

- Upload images, video and GIFs to a shared media library, and upload custom brand fonts.
- Build zone-based **layouts** that combine media with widgets (clocks, tickers, schedules, agendas, weather, flight boards, QR codes, countdowns, HTML/CSS panels, live streams, etc.).
- Schedule which layout plays on which screen at what time — in each site's own timezone.
- Publish a session **agenda** to screens, fed by manual entry or an automatic spreadsheet/calendar sync.
- Push a **live override** instantly when something needs to change right now (an emergency notice, a sponsor takeover, a session change).
- Trigger pre-built **presets** with one click — or from a Stream Deck via Bitfocus Companion.
- See what each screen is actually showing through automatic **snapshots** and live heartbeats.

Each physical display runs the VectorMesh **player** in a browser (typically a Raspberry Pi in kiosk mode). The player keeps content cached locally and continues running even if the network drops.

---

## 2. Core Concepts & Glossary

| Term | Meaning |
|---|---|
| **Site (Client)** | A tenant — usually one venue or one customer. All content is owned by a site. The Site Switcher in the sidebar filters everything you see. Each site has its own **timezone** used for scheduling. |
| **Event** | A named happening inside a site (e.g. "ISE 2026", "Spring Conference"), with a start and end date. Screens are **booked** into events over time, and media/layouts/programmes can be organised around them. |
| **Screen Booking** | A dated assignment of one screen to one event (`starts → ends`). A screen can be booked into many events over time; the booking that contains "now" decides the screen's *active* event. |
| **Media Asset** | A single image, video or GIF in the library. |
| **Custom Font** | A brand typeface (one or more weight/style files) uploaded to a site and selectable in agenda configs and text/HTML zones. |
| **Layout (Template)** | A canvas of **zones** (boxes) at a given aspect ratio. A zone can be a media region, a widget, an agenda, an HTML panel, or a playlist player. |
| **Zone** | One element inside a layout — clock, ticker, image, video, QR, countdown, schedule, agenda, weather, flight board, HTML/CSS panel, etc. |
| **Playlist** | An ordered list of items that rotate on a timer. Each item is either a media asset or a whole layout. |
| **Screen** | One physical display. Has resolution, aspect ratio, optional canvas position, a fallback layout and/or fallback playlist, event bookings, and a pairing token. |
| **Screen Group** | A named bundle of screens used to push the same content to many at once. |
| **Display Profile** | A reusable hardware profile (resolution, orientation) that can be applied to many screens. |
| **Programme** | A container for **schedule blocks** — time-rule entries that say "show layout X on screen/group Y from 09:00 to 17:00 on weekdays". |
| **Schedule Block** | A single timed entry inside a programme. |
| **Agenda Display** | A configurable session-schedule widget (its own look + filters) fed by **agenda items**, shown in a layout zone or as a standalone full-screen page. |
| **Live Override** | A high-priority command that forces a layout (or playlist) onto a screen or group **right now**, bypassing the schedule. |
| **Preset** | A saved "screen + layout (and optional zone overrides)" pairing that can be activated with one click and becomes a Live Override under the hood. |
| **Fallback Layout / Playlist** | What a screen falls back to when nothing scheduled applies. |
| **Brand Palette** | Per-event colours, fonts and logos (set on the Events page) used to keep layouts on-brand. |
| **Pairing Token** | A short code generated for an unpaired screen; used by the player device to bind itself to that screen. |
| **Heartbeat** | A periodic "I'm alive" ping the player sends to the server, with status, current layout, uptime and version. |
| **Snapshot** | A JPEG screenshot of what the player is currently rendering, captured by the browser and uploaded periodically. |
| **API Token** | A long-lived bearer credential a user mints to allow external tools (Stream Deck, scripts) to call the API on their behalf. |
| **Canvas** | A virtual coordinate space larger than a single screen, used to map physical video walls. The screen renders only its **AOI** (Area of Interest) — the rectangle that falls on its physical pixels. |

---

## 3. Roles & Permissions

VectorMesh has three roles, set per user:

### Admin
- Sees and edits **everything** across **all sites**.
- Manages users, sites, system settings, audit/activity log, alerts, deployment.
- Can copy/move layouts between sites, lock screens and clients, and clear audit history.

### Account Manager
- Manages users **within their assigned sites**.
- Has full content control on those sites (media, fonts, layouts, playlists, screens, programmes, agendas, presets, live override).
- Can mint API tokens.
- Cannot edit sites they aren't assigned to and cannot change system settings.

### Site User
- Day-to-day operator on assigned sites.
- Can edit content and push live overrides on their sites.
- Cannot manage users or system settings.
- Cannot mint API tokens.

Site assignment is managed from **Admin → User Management**. A user can be assigned to one or many sites; the Site Switcher only lists sites they belong to (Admins see all).

Every mutating action and every login event is written to the **activity (audit) log**.

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

If a user loses their authenticator, an Admin or Account Manager can reset their password from **User Management → … → Reset password**, which clears the 2FA secret and triggers a fresh enrollment on next login.

### Forgotten password
Click **Forgot password** on the login screen. If SMTP is configured the system emails a reset link. The link expires after a short window.

### Changing your own password
**Settings → Change password**. You'll need your current password.

---

## 5. The Site Switcher

The dropdown at the top of the left sidebar selects the **active site**. It controls what almost every page shows:

- Media, fonts, layouts, playlists, screens, screen groups, programmes, agendas — all filter by the active site.
- Creating new content assigns it to the active site automatically.
- Admins can pick **All Sites** to see everything at once.

Always check the switcher first when something seems missing — you're probably on the wrong site.

---

## 6. Getting Around — The Sidebar

The sidebar groups pages so related tools sit together:

- **Overview** — Dashboard, Clients (Sites), Events.
- **Content** — Media Library, Layouts, Fonts, Playlists.
- **Display** — Screens, Screen Groups, Programmes, Schedule Timeline, Live Override, Control Panel, Player Simulator.
- **Agenda** — Agenda Items, Agenda Displays.
- **System** — Display Profiles, Diagnostics, Settings.
- **Admin** (Admins only) — User Management, Streaming Server, Activity Log.
- **Help** — this manual.

---

## 7. Day-to-Day Workflow

A typical event-day routine:

1. **Morning check** — open **Screens**. Every tile should be green (online) and the snapshot thumbnail should match what you expect.
2. **Confirm today's programme** — open **Schedule Timeline** and look at today's blocks. If a session moved, edit the block's start/end time or push a **Live Override**.
3. **Refresh the agenda** — if you run an agenda feed, confirm the latest sync succeeded (Agenda Items page) and the items look right.
4. **Pre-stage announcements** — build any one-off layouts (e.g. "Lunch break" slate) and save them as **Presets** so you can fire them from the Control Panel or a Stream Deck.
5. **During sessions** — use **Control Panel** or a Stream Deck button to switch foyer screens between welcome / sponsor / session-info / wayfinding presets.
6. **Emergencies** — **Live Override** with a high priority (≥ 200) targeted at the right screens or groups; clear it when the situation passes.
7. **End of day** — review **Activity Log** for anything unexpected; clear lingering overrides.

---

## 8. Media Library

**Sidebar → Media Library.**

- Click **Upload** to add files. Admins are prompted to pick the owning site. Account Managers / Site Users upload to the active site.
- Files are tagged automatically as `image`, `video` or `gif`. Videos get a thumbnail generated server-side; their duration is recorded.
- **View modes**: grid or list (toggle top-right). Search filters by name.
- **Display mode** (Fit vs Fill) per asset controls how the player composes the image inside its zone:
  - **Fill** (`cover`) — fills the zone, may crop.
  - **Fit** (`contain`) — letterboxes, never crops.
- **Sharing** (Admin only): … menu → **Share to Sites** lets you grant other sites read-access to a media asset. Shared assets show an amber **Shared** badge and cannot be deleted from the borrowing site.
- **Preview** opens a modal with full-size playback.
- **Download** downloads the original file.

Files live on the server's local disk under `<UPLOAD_DIR>/<clientId>/uploads/`; thumbnails under `<UPLOAD_DIR>/<clientId>/thumbnails/`. The root is configurable in **Settings → System Settings** (Admin).

---

## 9. Custom Fonts

**Sidebar → Fonts.**

Upload your brand typefaces so agendas and text/HTML zones can use them instead of the built-in fonts.

### Uploading a font
1. **Add Font / Upload** → give the typeface a **Family Name** (e.g. "TT Hoves").
2. Upload the first file and set its **weight** (100–900) and **style** (normal / italic). Accepted formats: `.ttf`, `.otf`, `.woff`, `.woff2`.
3. Add more files to the **same family card** for other weights/styles (Bold, Italic, etc.). The player and editor pick the right file automatically based on the weight/style a widget asks for.

### Using a font
- In **Agenda Displays**, pick it from the **Font Family** dropdown.
- In the **Layout editor**, choose it on text and HTML zones.

Uploaded fonts are loaded in the admin previews (layout editor, agenda preview) and on the live player, so what you design matches what shows on the wall.

---

## 10. Layouts

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
   - **Agenda** — a saved [Agenda Display](#21-agenda-displays) config (full session schedule).
   - **HTML/CSS widget** — operator-authored markup, see [HTML/CSS Widgets](#11-htmlcss-widgets).
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

## 11. HTML/CSS Widgets

A layout zone of type **HTML/CSS widget** lets you hand-author a panel with your own markup and styles — handy for custom tables, branded slates, or anything the standard widgets don't cover.

### Filling it in
- **HTML body** — the markup for the panel. The **Insert Variable** button adds [player variables](#33-player-variables) (e.g. `{{event_name}}`), and **Insert Image** drops in a media-library asset.
- **CSS** — styles for the panel.

### The authoring contract
Design for a **1920-pixel-wide reference canvas**. VectorMesh renders your HTML at that width and then scales it proportionally to fill the real zone, so the same panel looks identical in the editor's live preview, on the layout canvas, and on a physical screen. A 16:9 zone renders at native 1920×1080. Pixel sizes you set lay out the same everywhere; the vertical axis simply follows the zone's aspect ratio.

### Safety
HTML widgets are sandboxed: scripts and inline event handlers are stripped and never run, on the device or in the editor. Use them for layout and styling, not interactive scripting.

---

## 12. Playlists

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

## 13. Screens

**Sidebar → Screens.**

Each tile represents one physical display.

### Creating a screen
1. **Add Screen** → name, location, resolution, aspect ratio, optional **display profile**.
2. (Optional) Enable **Canvas positioning** for video walls and enter canvas size + this screen's `(x, y)` and AOI dimensions.
3. (Optional) Set a **Fallback Layout** and/or **Fallback Playlist** — what plays when nothing is scheduled.
4. (Optional) Add **event bookings** — which events this screen belongs to and when (see [Events & Screen Bookings](#16-events--screen-bookings)).
5. Save. A **pairing token** is generated.

### Screen card controls
Each card shows status (online/offline), last heartbeat, current layout source, and exposes:

- **Pairing code** — paste into the player on first boot.
- **Regenerate pairing code** — invalidates the old token (use after a hardware swap).
- **Unpair** — disconnects the device but keeps the screen entry.
- **Refresh** — sends a remote-reload signal so the player picks up new content immediately.
- **Request snapshot** — asks the player for a fresh screenshot.
- **Show snapshot** — opens the snapshot popup, with a **Screen / Canvas** toggle (Canvas mode shows what falls on the AOI vs the whole virtual canvas).
- **Show LIVE Banner** toggle — when ON, a red "LIVE PRESET" banner appears on the player while a preset/override is active. Default: OFF.
- **Enable snapshots** toggle — when ON, the player captures a JPEG every 60 seconds.
- **Identify** — flashes the screen briefly so you can find it physically.
- **Lock** (Admin only) — prevents accidental edits/deletion.
- **Edit** — change resolution, profile, fallbacks, canvas, and event bookings.
- **Delete** — only when not referenced by any schedule, group or preset.

---

## 14. Screen Groups

**Sidebar → Screen Groups.**

A group is a bag of screens belonging to a single site. Useful for "all foyer screens", "all meeting-room screens", "the LED wall pair", etc. You can:

- **Manage Screens** — add/remove members. Only same-site screens are eligible.
- **Manage Presets** — see [Presets](#20-presets--the-control-panel).
- Target a group from a programme block or a live override — every member follows.

---

## 15. Display Profiles

**Sidebar → Display Profiles** (per site).

Reusable "this is the hardware spec" templates so you don't re-type resolution/orientation for every screen. Pick a profile when creating or editing a screen; the dropdown only lists profiles from the same site.

---

## 16. Events & Screen Bookings

**Sidebar → Events.**

An **event** groups work around a named happening (a conference, an exhibition) with start and end dates. On the Events page you can also set the event's **brand palette** — primary/secondary/accent/background/text colours, fonts and logos — so layouts stay on-brand.

### Screen bookings
A screen can be used by different events at different times. Rather than a single "current event", VectorMesh records **bookings**: each booking ties one screen to one event for a date range (`starts → ends`). The booking whose range contains "now" is the screen's **active event**, which is what drives `{{event_name}}` and other event-based player variables, allowed-client filtering, and alerts.

Manage bookings in two places:

- **Screen edit dialog → Bookings** — add or remove the events a single screen belongs to, with start/end times.
- **Events page → … → Screen bookings** — manage every screen booked into one event at once. New bookings default to the event's overall dates.

Bookings for the same screen **cannot overlap in time** — the UI blocks a clashing booking so a screen is never assigned to two events at the same moment.

---

## 17. Programmes & the Schedule

**Sidebar → Schedule Timeline** (or the **Programmes** page).

A **programme** is a folder of **schedule blocks**. A block answers:

- **Which layout?**
- **Which target?** (one screen, several screens, or a group)
- **When?** (start/end time, date range)
- **How often?** (one-off, daily, specific days of the week)
- **At what priority?** (higher = wins ties; default 100)

All times are interpreted in the **site's timezone** (see [Site Timezones](#18-site-timezones)).

### Creating a block
1. Open a programme → **Add Block**.
2. Pick the layout, target screen(s)/group, set start/end and recurrence (e.g. Mon–Fri 09:00–17:00).
3. Set a priority. The default 100 is fine for normal scheduled content.
4. Save.

### Diagnostics in the editor
The schedule editor helps you catch mistakes:

- **Conflict panel** — flags overlapping blocks **only** when their resolved screen sets actually intersect, so blocks targeting different screens at the same time don't raise false warnings.
- **Per-block warnings** — "block in the past" and "no screen booking covers this block's dates".
- **Top banner** — appears when no block in the selected version will play on any screen in the next 7 days.

### Programme versions
Each programme keeps a version history so you can revert if a major edit goes wrong (Programme → Versions).

---

## 18. Site Timezones

Each site (client) carries its own **IANA timezone** (e.g. `Europe/London`, `America/New_York`), set in **Clients → Edit → Timezone**. Every schedule HH:MM comparison is evaluated in that timezone, with daylight-saving transitions handled correctly, so blocks fire at the wall-clock time you configured all year round.

The **Schedule Timeline** header shows the active timezone (and its current offset, e.g. "BST / UTC+1"), and time-block labels reflect it. If a venue moves between zones, change the site timezone once and every schedule follows.

---

## 19. Live Override

**Sidebar → Live Override.**

A live override pushes a layout (or playlist) onto a screen/group **immediately**, bypassing the scheduled programme.

- Pick the layout / playlist, target screen(s) or group, and a **priority** (higher beats other overrides).
- Add an optional message and expiry.
- **Activate** — the player switches within seconds.
- **Clear** — removes the override; the player returns to scheduled content.

Use cases: emergency announcements, last-minute room changes, ad-hoc sponsor takeovers.

> **Tip:** If a screen has the **Show LIVE Banner** toggle ON, a red banner appears so people in the room know a preset/override is active.

---

## 20. Presets & the Control Panel

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
The Control Panel mirrors what a Stream Deck triggers. See [Bitfocus Companion / Stream Deck](#29-bitfocus-companion--stream-deck).

---

## 21. Agenda Displays

VectorMesh can publish a **session agenda** to screens — a styled, auto-updating list of what's on, where and when. There are three pieces: the **items** (the data), the **sync** (optional automatic feed), and the **display config** (the look). You then show a config in a layout zone or as a full-screen page.

### Agenda Items
**Sidebar → Agenda Items.**

The raw schedule rows. Add or edit one by hand with **Add Item / Edit**:

- **Title** (required), **Start** and **End** (required, date-and-time pickers).
- **Room**, **Track**, **Presenter**, **Description**.
- **Status** — Scheduled, In Progress, Delayed, or Finished — plus an optional **status message** (e.g. "Delayed 10 min").

Rows you edit by hand are protected from being overwritten or removed by a sync.

### Automatic sync (optional)
From the Agenda Items page, open the **Sync Config** dialog to pull items from an external source instead of typing them:

- **Source types**: ICS / iCalendar URL, Google Sheets (CSV link or mapped sheet), a plain CSV URL, or Excel — via a OneDrive / SharePoint **public share link** or an **uploaded `.xlsx`** file.
- **Test / Preview**: *Test* fetches the source and lists its sheets and column headers; *Preview* applies your mapping and shows a per-row result so you can spot bad rows before going live.
- **Column mapping**: map your spreadsheet's headers to VectorMesh fields (Title, Start, End, Room, Track, Presenter, Description, Status, and an external ID). Title, Start and End are required. The dialog auto-suggests a sensible mapping.
- **Sheet & header pickers**: choose which worksheet to read and which row holds the headers / first data row.
- **Timezone & date format**: tell VectorMesh how to read ambiguous dates (ISO, UK day-first, Excel serials).
- **Sync mode**: *Scheduled* (re-syncs on an interval) or *Manual* (only when you run it).
- **Remove items missing from source**: when ON, rows that disappear from the feed are removed too (hand-edited rows are always kept).

> OneDrive / SharePoint links must be openable without signing in. A link that resolves to a Microsoft sign-in page can't be read; share it as "anyone with the link" or upload the `.xlsx` directly.

### Agenda Displays (configs)
**Sidebar → Agenda Displays.**

A config defines how the agenda looks and which items it shows. Settings include:

- **Mode** — **Full** (everything), **Today / Tomorrow**, or **What's On Next**.
- **Layout** — Auto, Split, or Single Room.
- **Theme** — Dark, Light, or Glass; plus an **accent colour**.
- **Typography** — pick a built-in or **custom font family**, override per-element **colours**, and tune per-element **text sizes** with sliders for **Time, Date, Title, Body, Header Clock and Header Date**.
- **Show / hide** — Description, Presenter, Room, Status, Current Time, Event Name, Day Name, Date.
- **Filters** — by Room(s), Track(s), and Status.
- **Intervals** — refresh interval, on-screen rotation interval, and max items per page.

A **live preview** panel renders the config at different screen presets (Landscape, Portrait, Totem) and lets you set a **test date** to see how a future day will look.

### Showing an agenda
- **In a layout** — add a zone, set its type to **Agenda**, and pick a saved config from the dropdown. The zone updates itself on the player.
- **As a full-screen page** — point a screen's browser at `/display/agenda/<configId>`. This is a chromeless, no-login display page ideal for a dedicated agenda board. Append `?at=<ISO date-time>` to preview a specific moment.

---

## 22. Player Simulator

**Sidebar → Player Simulator.**

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

## 23. Player Behaviour & Priority Chain

The player on each device polls the server periodically and resolves what to show using this strict priority order:

1. **Live override** targeting this screen (or any group it belongs to). Highest-priority override wins; on a tie, the most recent.
2. **Scheduled programme block** whose time rule matches now (in the site timezone). Highest-priority block wins; on a tie, the most recent.
3. **Fallback layout** configured on the screen.
4. **Fallback playlist** configured on the screen, rendered full-screen via a synthetic media player zone.

If none of these resolve, the screen shows a "no content" placeholder.

### Offline resilience
The player ships a Service Worker that caches the layout JSON and pre-fetches all media assets in the background. If the internet drops, the player keeps running from cache and shows an **Offline** badge. Once connectivity returns it silently resumes polling and updates content.

### Zone stability during rotation
When a playlist contains multiple layouts, zones with identical config (type, position, size) are kept mounted across rotations — videos keep playing, tickers keep scrolling, clocks keep ticking. Only changed zones re-render.

### Audio is muted by default
Every player-side video is **muted unless an operator explicitly opts in** to audio on that zone. This is deliberate: a muted video can't be paused by the browser when another tab grabs audio focus, which keeps playback smooth on always-on displays. Only turn audio on where you actually need sound.

---

## 24. Pairing a Display Node (Raspberry Pi)

The reference player is a Raspberry Pi running Chromium in kiosk mode. Setup:

1. In VectorMesh: create the screen (or pick an existing unpaired one). Copy the **pairing code**.
2. On the Pi: run the provided `pi-kiosk-setup` script. It installs Chromium kiosk mode and opens the player URL.
3. The first time the player loads, it asks for the pairing code. Paste it. The device receives a long-lived **device token** and binds itself to the screen.
4. The screen now appears as **Online** with heartbeats.

To swap hardware: in VectorMesh, click **Regenerate pairing code** on the screen, then pair the new device with the new code. The old device is rejected immediately.

To retire a device: **Unpair** keeps the screen entry; **Delete** removes the screen entirely.

---

## 25. Live Snapshots & Diagnostics

### Snapshots
With the **Enable snapshots** toggle ON, the player captures a compressed JPEG of its rendered output every 60 seconds and uploads it. The screen card shows a thumbnail and the capture timestamp; clicking opens the larger viewer with the **Screen / Canvas** toggle for canvas-enabled screens.

You can also force-request a fresh snapshot from the screen card.

### Heartbeats
Every player sends a heartbeat with: online status, current layout, browser/OS, version, uptime, network info. **Sidebar → Diagnostics** shows recent heartbeats per screen and any errors the player has reported.

### Activity Log
**Admin → Activity Log.** Live feed of mutating actions and authentication events for sites you can see. Useful for "who changed that?". The **Dashboard** also shows a recent-activity card.

---

## 26. Alerts & Monitoring

**Alerts** (per site).

- Configure **email recipients** per site.
- Pick which events trigger emails (screen offline, screen back online).
- A cooldown prevents alert storms when a flaky network flips a screen up/down repeatedly.
- Alert history is preserved.

SMTP must be configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) for email to work. `APP_URL` should be set so links in emails point to the right place.

---

## 27. Admin & Settings

### Settings (everyone)
**Sidebar → Settings.**

- **Profile & password** — view your account and change your password.
- **API Tokens** — mint and revoke personal tokens (Admin / Account Manager). See [API Tokens](#28-api-tokens--external-integrations).
- **System Settings** (Admin only) — global options such as the **Upload Root Directory** for media storage.

### Dashboard
**Sidebar → Dashboard.** At-a-glance stat cards, screen-status summary, active live overrides, quick actions, system health, and recent activity.

### Admin & site-management pages
These appear under the **Admin** sidebar group for Admins. Account Managers can also reach user and content management for their own assigned sites.

| Page | Purpose |
|---|---|
| **Clients (Sites)** | Create/edit sites, set timezone and branding, lock to prevent accidental edits. |
| **Events** | Create/edit events, set the per-event brand palette, and manage screen bookings. |
| **User Management** | Create users, set role, assign sites, reset passwords (which also clears 2FA), force password change, delete. |
| **Display Profiles** | Per-site hardware templates. |
| **Activity Log** | Searchable record of every mutating action and login. Admins can clear. |
| **Streaming Server** | OvenMediaEngine status & SRT/WebRTC live-feed health. |

---

## 28. API Tokens & External Integrations

**Settings → API Tokens** (Admin / Account Manager only).

- Click **Create token**, give it a label (e.g. "Stream Deck — Foyer").
- The token is shown **once**, formatted `vm_<base64url>`. Copy it now; it's stored only as a SHA-256 hash.
- Use it as `Authorization: Bearer vm_...` on API calls.
- Tokens act on behalf of their owner — the same site scoping and role permissions apply.
- The token's **last used at** and **known IPs** are recorded; new IPs raise an acknowledgement prompt.
- **Revoke** any time; revocation takes effect immediately.

---

## 29. Bitfocus Companion / Stream Deck

VectorMesh has a first-party **Bitfocus Companion** module: `companion-module-vectormesh`.

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

## 30. REST API Reference

Most endpoints return JSON; a few return other content types (e.g. `GET /api/manual` returns markdown, `GET /api/media/:id/file` returns the raw file, `GET /api/deploy-package` streams a gzip tarball). Authentication is either a session cookie (browser) or `Authorization: Bearer vm_...` (token). Endpoints respect tenant scoping and role permissions.

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

### Events & Screen Bookings
- `GET /api/events` · `GET /api/events/:id`
- `POST /api/events` · `PATCH /api/events/:id` · `DELETE /api/events/:id`
- `GET /api/screen-bookings?screenId=...` / `?eventId=...`
- `POST /api/screen-bookings` · `PATCH /api/screen-bookings/:id` · `DELETE /api/screen-bookings/:id`

### Display Profiles
- `GET /api/display-profiles?clientId=...`
- `POST /api/display-profiles` · `PATCH /api/display-profiles/:id` · `DELETE /api/display-profiles/:id`

### Fonts
- `GET /api/fonts` — custom fonts for the active/visible sites.
- `POST /api/fonts/upload` (multipart) · `GET /api/fonts/:id/file`
- `DELETE /api/fonts/:id` · `DELETE /api/fonts/family/:familyId`

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

### Agenda
- `GET /api/agenda` · `POST /api/agenda` · `PATCH /api/agenda/:id` · `DELETE /api/agenda/:id` — agenda items.
- `POST /api/agenda/import` — bulk import items.
- `GET /api/agenda/configs` · `POST /api/agenda/configs` · `PATCH /api/agenda/configs/:id` · `DELETE /api/agenda/configs/:id` — display configs.
- `GET /api/agenda/sync-configs` · `POST /api/agenda/sync-configs` · `PATCH /api/agenda/sync-configs/:id` · `DELETE /api/agenda/sync-configs/:id`
- `POST /api/agenda/sync-configs/test` (list sheets/headers) · `POST /api/agenda/sync-configs/preview` (per-row result) · `POST /api/agenda/sync-configs/:id/run`
- `GET /api/agenda/sync-configs/:id/errors` · `POST /api/agenda/sync-configs/upload-xlsx` (multipart)
- `GET /api/agenda/display/:configId` — public, chromeless agenda payload (supports `?at=<ISO>`).

### Live Override
- `GET /api/live-overrides` · `POST /api/live-overrides` · `DELETE /api/live-overrides/:id`

### Presets
- `GET /api/screen-presets[?screenId=...&groupId=...]`
- `POST /api/screen-presets` · `PATCH /api/screen-presets/:id` · `DELETE /api/screen-presets/:id`
- `POST /api/screen-presets/:id/activate` · `POST /api/screen-presets/:id/deactivate`
- `GET /api/screen-presets/active`

### Player (device-token authenticated)
- `GET /api/player/:screenId/content` — returns layout, screen config, site-scoped `media`, `layoutTemplates` map, override info.
- `POST /api/player/heartbeat` · `POST /api/player/snapshot`
- `GET /api/player/widgets/...` — flight boards, weather, fixtures, earthquakes, aircraft, SpaceX, etc.

### Admin
- `GET /api/admin/users` · `POST` · `PATCH /api/admin/users/:id` · `DELETE`
- `POST /api/admin/users/:id/reset-password` · `POST /api/admin/users/:id/force-change-password`
- `POST /api/admin/users/:id/sites` · `DELETE /api/admin/users/:id/sites/:clientId`
- `GET /api/admin/audit-logs` · `DELETE /api/admin/audit-logs`
- `GET /api/admin/stats` · `GET /api/admin/stats/by-client`
- `GET /api/system-settings` · `GET /api/system-settings/:key` · `PUT /api/system-settings/:key`

### Health, Manual & Deployment
- `GET /api/health`
- `GET /api/manual` — this manual (markdown).
- `GET /api/deploy-package` (Admin) — streams a tarball of the current server build for off-Replit deployment.

---

## 31. Deployment & Updates

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
- `DEFAULT_SCHEDULE_TIMEZONE` — default IANA timezone for new sites (default `Europe/London`).
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`.
- `APP_URL` — public URL (used in email links).
- `AERODATABOX_RAPIDAPI_KEY` (and optional `_HOST`, `_BASE_URL`, `_TIMEOUT_MS`) for Heathrow widgets.

---

## 32. Troubleshooting

| Symptom | Where to look | Likely cause / fix |
|---|---|---|
| Screen tile is **red / offline** | Screens page; Diagnostics | Network down; player crashed; Pi unplugged. Power-cycle the Pi. Check Diagnostics for last heartbeat. |
| Screen is online but shows **wrong content** | Live Override page; Schedule | A stale override is active — clear it. Or a higher-priority programme block is winning — check Simulator's source badge. |
| Snapshot is **stale or blank** | Screen card | Snapshots toggle off, or browser blocked the canvas capture. Toggle off and on again, then **Request snapshot**. |
| Player keeps **rebooting** every few minutes | Diagnostics → recent heartbeats | Memory pressure on the Pi (huge media). Reduce video bitrate or resolution. |
| Login loop after entering 2FA code | Browser | Clock skew on user's phone — TOTP is time-based. Resync the authenticator. |
| Forgot 2FA / lost device | User Management → Reset password | Reset clears 2FA; user re-enrolls on next login. |
| **"You don't have access to this site"** error | Site Switcher | User isn't assigned to that site. Admin assigns them in User Management. |
| Media upload fails | Settings → System Settings; server disk | Wrong upload root, or disk full. Check `UPLOAD_DIR` and free space. |
| **Agenda text sizes / styling don't show on screens** | Agenda Displays; Screen Refresh | Save the config, then **Refresh** the screen (or wait for the next poll). The standalone `/display/agenda/...` page also re-polls automatically. |
| **Agenda sync brings in nothing / errors** | Agenda Items → Sync Config → Preview | Check the column mapping (Title/Start/End are required) and the sheet/header-row pickers. For OneDrive/SharePoint, the link must open without a login. |
| **Wrong event name on a screen** | Screen edit → Bookings | No booking covers "now", or a different booking is active. Fix the booking dates. |
| **Schedule fires at the wrong clock time** | Clients → Timezone; Schedule header | The site timezone is wrong. Set the correct IANA timezone on the site. |
| Companion shows **0 presets** | Settings → API Tokens; preset list | Token's owner can't see any presets (wrong site, or none defined). Mint a token from a user who can see them. |
| Email alerts not arriving | Alerts; SMTP env | Recipient list empty, cooldown active, or SMTP creds wrong. |
| Layout edits don't appear on player | Refresh button on screen card | Player cache; click **Refresh** or wait for next poll cycle. |
| Video wall geometry looks wrong | Screen edit → Canvas section; Simulator (Full Canvas) | AOI coordinates don't match physical install. Fix `canvasX`, `canvasY`, `canvasWidth`, `canvasHeight`. |
| Deploy package endpoint returns 401 | Token scope | The token must belong to an Admin user. |

---

## 33. Player Variables

VectorMesh supports a small set of **template tokens** that are replaced at runtime with real values from the player's context. Use them anywhere they're supported to keep one layout reusable across many screens, rooms, events, and clients.

### Supported tokens

| Token | Replaced with | Source |
|---|---|---|
| `{{screen_name}}` | The display screen's name | Screen record |
| `{{room_name}}` | The screen's room / location | Screen `location` field |
| `{{event_name}}` | Current event name | Screen's **active** event booking (the one containing now) |
| `{{client_name}}` | Owning client / brand name | Screen's owning client |
| `{{date}}` | Today's date in the player's locale | Player clock |
| `{{time}}` | Current time (HH:MM) | Player clock |
| `{{day}}` | Current day of week (e.g. "Monday") | Player clock |
| `{{room_capacity}}` | Maximum capacity of the screen's room | Screen `roomCapacity` field |
| `{{event_start_date}}` | Start date of the screen's active event | Event record |
| `{{event_end_date}}` | End date of the screen's active event | Event record |
| `{{next_session_title}}` | Name of the next published programme block targeting this screen | Programme schedule |
| `{{next_session_time}}` | Start time (HH:MM) of the next programme block | Programme schedule |
| `{{next_session_countdown}}` | Friendly countdown (e.g. "in 25 min") until the next session starts | Computed from programme schedule |
| `{{weather_summary}}` | Short current-weather string for the screen's saved location (e.g. "Partly Cloudy, 18°C") | Screen `weatherLat` / `weatherLng` / `weatherUnit` (Open-Meteo, cached 10 min) |

### Where you can use them

Click **Insert Variable** next to any of these fields in the layout editor:

- Ticker text
- Text widget content
- Clock label
- Countdown title
- Countdown completion message
- Schedule header text
- QR code label
- HTML/CSS widget body

Schedule entry titles also resolve tokens at render time.

### Behaviour notes

- **Empty fallback.** If the screen has no active event, `{{event_name}}` becomes an empty string — never the literal token. Same for `{{room_name}}`, `{{client_name}}`, etc.
- **Live refresh.** `{{date}}`, `{{time}}` and `{{day}}` re-render automatically while the player is running (within ~30 s). No reload needed.
- **Editor previews.** In the layout editor and Player Simulator, tokens render as friendly sample values (e.g. `Tech Summit 2025`) so you can see the layout. Only the live player substitutes real screen-specific data.
- **Case sensitive.** Tokens are lowercase with underscores: `{{event_name}}`, not `{{EventName}}`.

---

*If this manual gets out of date, fix it in `OPERATING_MANUAL.md` at the repo root and commit.*

# VectorMesh

## Overview

VectorMesh is an onsite display management platform for conference and exhibition centers. It manages content across various screen types, including meeting rooms, public displays, and large LED walls. The platform offers multi-client branding, scheduled content programming, live override capabilities for urgent announcements, and real-time diagnostics for Raspberry Pi-based display nodes. It supports over 50 screens with diverse sizes and aspect ratios, handles various media types (images, videos, GIFs, HTML widgets), and provides advanced features like automatic video thumbnail generation, zone-based layouts, and customizable QR codes. Key capabilities include layout rotation in playlists, canvas positioning for video walls, site-scoped content management (layouts, display profiles, screen groups), live screen screenshots, and screen presets activatable via a control panel or API tokens. It also features robust programme scheduling with fallback playlist support, a real-time player simulator, secure device pairing, and offline player capability via a Service Worker for continuous operation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, using Wouter for routing and TanStack React Query for server state. UI components are built with shadcn/ui (based on Radix UI primitives) and styled with Tailwind CSS, utilizing CSS variables for theming. Vite is used for building and HMR. File uploads are managed by Uppy with direct XHR to the server. The structure is page-based with centralized shared components.

### Backend Architecture
The backend is a Node.js application using Express, written in TypeScript and compiled with tsx/esbuild. It provides a RESTful JSON API. Authentication is custom email/password with session-based auth and a PostgreSQL session store. File storage is local filesystem-based, with configurable upload root directories.

### Data Storage
PostgreSQL is the chosen database, accessed via Drizzle ORM. The schema is defined once in `shared/schema.ts` for consistency. Drizzle Kit manages migrations. Core entities include Clients, Events, Media Assets, Layouts, Screens, Programmes, and Player Heartbeats.

### Authentication & Authorization
The system uses custom email/password authentication with bcryptjs for hashing and PostgreSQL for session storage. Mandatory TOTP-based Two-Factor Authentication (2FA) is enforced for all users via `otpauth`. A robust Role-Based Access Control (RBAC) system defines Admin, Account Manager, and Site User tiers. An audit logging system tracks all mutating actions and authentication events. Configurable email alerts notify about screen status changes.

### Key Design Patterns
- **Shared Schema**: Ensures type consistency across frontend and backend.
- **Insert Schemas**: Zod schemas derived from Drizzle for data validation.
- **API Client**: Centralized fetch wrapper for API interactions.
- **Component Library**: Reusable UI components based on shadcn/ui.

### Technical Implementations
- **Layout Rotation**: Playlist items can reference media assets or layout templates. The player rotates through entire layouts on a timer, with zones identified by content-based fingerprints (`getZoneFingerprint`) to maintain state (e.g., videos keep playing) for identical zones across layouts.
- **Canvas Positioning for Video Walls**: Screens can be placed within a larger virtual canvas, with layout content filling the screen's Area of Interest (AOI). The player simulator offers a "Full Canvas / Screen AOI" toggle for testing.
- **Site Filtering**: Most UI components fetching site-scoped resources use `useSiteFilteredQuery` to prevent cross-site data leakage. Exceptions exist for system-wide or already server-filtered endpoints.
- **Live Screenshots**: Players capture and upload compressed JPEG screenshots every 60 seconds (if enabled), stored as base64 data URLs. The admin screen page displays these with auto-refresh.
- **Screen Presets & Control Panel**: Pre-configured layout+zone combinations can be saved and activated via a one-click control panel, creating high-priority live overrides. Deactivation removes the override. This supports Stream Deck integration via REST API.
- **API Tokens**: Users can mint personal long-lived bearer tokens for external integrations. Tokens are hashed and stored, accepting `Authorization: Bearer vm_...` and applying existing tenant scoping rules.
- **Programme Scheduling**: Features a block editor with time rules, recurring schedules, target selection (screen/group), layout assignment, and priority. Displays target, layout, and playlist information, with warnings for misconfigured blocks. Player resolver handles both screen and group targets. The conflict panel only flags overlapping blocks when their resolved screen sets actually intersect, so blocks targeting different screens at the same time coexist without false-positive warnings. The schedule editor also surfaces playback diagnostics — per-block warnings for "block in past" and "no screen booking covers this block's dates", and a top-of-page banner when no block in the selected version will play on any screen in the next 7 days.
- **Multi-Event Screen Bookings**: Each screen can be booked into multiple events over time via the `screen_event_bookings` table (one row per booking with non-overlapping `[startsAt, endsAt)` half-open intervals per screen, validated server-side). The legacy single-valued `screens.currentEventId` column has been dropped; the player content resolver, manifest, allowed-clients filter, simulator, and heartbeat alerts all derive the active event from the booking that contains "now". Bookings are managed inline from the screen edit dialog and from a per-event bookings dialog on the events page.
- **Fallback Playlist Support**: Screens can have a `fallbackLayoutId` and `fallbackPlaylistId`. If no scheduled or fallback layout resolves, the fallback playlist is used, rendering media items full-screen. Priority chain: live override → scheduled programme → fallback layout → fallback playlist.
- **Offline Player Capability**: A Service Worker caches layout data and media assets, enabling display nodes to function offline. Layout JSON is also stored in localStorage.
- **Per-Client Schedule Timezones**: Each client (site) carries an IANA timezone (`clients.timezone`, default `Europe/London`, env override `DEFAULT_SCHEDULE_TIMEZONE`). All schedule HH:MM comparisons run through `shared/timezone-utils.ts`, which handles DST transitions (spring-forward gaps snap forward, fall-back duplicates pick the earlier instant) so blocks fire at the wall-clock time operators configure. The schedule editor surfaces the active tz and the client edit form exposes a tz picker; unit and integration tests cover Europe/London BST/GMT and US DST boundaries.

## Operations Runbook

### Canvas pairing — one-shot repair marker (Task #179)

The boot path runs `repairFalseCanvasPairingsOnce()` which gates the
Task #176 false-canvas-pairing repair behind a `system_settings` marker
keyed `canvas_pairing_repair_176_completed`. The marker is claimed
*atomically* (insert with `ON CONFLICT DO NOTHING`) **before** the
repair runs, then stamped with the final outcome on success.

Boot log lines:
- `[canvas-pairing] one-shot repair already completed for this DB; skipping` — marker present, no work done.
- `[canvas-pairing] one-shot repair ran with nothing to fix` — marker absent, repair ran, found no damaged rows, marker now written.
- `[canvas-pairing] one-shot repair fixed N false-canvas-pairing row(s)` — marker absent, repair fixed N rows, marker now written.

**Recovery — marker stuck in `running` state**: if the server crashes
between the marker claim and the completion stamp, the marker stays at
`status: "running"` and every subsequent boot will skip the repair.
To force a re-run, delete the row by hand:

```sql
DELETE FROM system_settings WHERE key = 'canvas_pairing_repair_176_completed';
```

The next boot will re-claim the marker and run the repair. The
underlying repair is idempotent against clean data, so re-running on a
healthy DB is a safe no-op.

## External Dependencies

### Database
- **PostgreSQL**: Primary application database.
- **Drizzle ORM**: Database interaction and schema management.

### Authentication
- **bcryptjs**: Password hashing.
- **otpauth**: TOTP-based 2FA generation and verification.
- **qrcode**: QR code generation for 2FA enrollment.
- **Nodemailer**: Email sending (password reset, alerts).

### File Storage
- **Local Filesystem**: Media files stored on the server's local disk.
- **multer**: Express middleware for file uploads.

### Frontend Libraries
- **Radix UI**: Accessible and unstyled UI primitives.
- **Uppy**: File uploader.
- **date-fns**: Date manipulation.
- **react-day-picker**: Calendar and date selection.
- **embla-carousel**: Carousel components.
- **Leaflet / react-leaflet v4**: Interactive map display for aircraft radar.

### APIs
- **AeroDataBox**: Flight data (requires `AERODATABOX_RAPIDAPI_KEY`).
# VectorMesh

## Overview

VectorMesh is an onsite display management platform for conference and exhibition centers. It manages content across various screen types, including meeting rooms, public displays, and large LED walls. The platform offers multi-client branding, scheduled content programming, live override capabilities for urgent announcements, and real-time diagnostics for Raspberry Pi-based display nodes. It supports over 50 screens with diverse sizes and aspect ratios, handles various media types (images, videos, GIFs, HTML widgets), and provides advanced features like automatic video thumbnail generation, zone-based layouts, and customizable QR codes. Key capabilities include layout rotation in playlists, canvas positioning for video walls, site-scoped content management (layouts, display profiles, screen groups), live screen screenshots, and screen presets activatable via a control panel or API tokens. It also features robust programme scheduling with fallback playlist support, a real-time player simulator, secure device pairing, and offline player capability via a Service Worker for continuous operation.

## User Preferences

Preferred communication style: Simple, everyday language.

## Further Documentation

- `docs/features.md` — detailed implementation notes for the more involved features (player audio policy, agenda spreadsheet mapper, HTML/CSS widgets, sweepstake wall loop).
- `docs/runbook.md` — operations runbook: one-shot boot repair/backfill markers and tenant-scoping invariants, with recovery steps.
- `HEALTH_CHECKS.md` — authenticated external-monitor health endpoint, registered dependencies, and safe monitoring guidance.

## Health Check Maintenance

Whenever a new external dependency or critical availability capability is
added, add or update the corresponding deep-health registry entry and tests in
the same change. Do not add recurring probes that perform writes or consume
business-operation quotas. Individual public-route contracts belong in
integration tests rather than the recurring dependency registry.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, using Wouter for routing and TanStack React Query for server state. UI components are built with shadcn/ui (based on Radix UI primitives) and styled with Tailwind CSS, utilizing CSS variables for theming. Vite is used for building and HMR. File uploads are managed by Uppy with direct XHR to the server. The structure is page-based with centralized shared components.

### Backend Architecture
The backend is a Node.js application using Express, written in TypeScript and compiled with tsx/esbuild. It provides a RESTful JSON API. Authentication is custom email/password with session-based auth and a PostgreSQL session store. File storage is local filesystem-based, with configurable upload root directories.

### Data Storage
PostgreSQL is the chosen database, accessed via Drizzle ORM. The schema is defined once in `shared/schema.ts` for consistency. Drizzle Kit manages migrations. Core entities include Clients, Events, Media Assets, Layouts, Screens, Programmes, and Player Heartbeats.

### Authentication & Authorization
The system uses custom email/password authentication with bcryptjs for hashing and PostgreSQL for session storage. Mandatory TOTP-based Two-Factor Authentication (2FA) is enforced for all users via `otpauth`. A robust Role-Based Access Control (RBAC) system defines Admin, Account Manager, and Site User tiers. An audit logging system tracks all mutating actions and authentication events. Configurable email alerts notify about screen status changes.

A test-only auth bypass route `POST /api/auth/test-login` exists in `server/testAuthRoute.ts` so browser-driven UI tests can authenticate without a TOTP. It is double-gated: it is mounted only when `NODE_ENV !== "production"` AND `ENABLE_TEST_AUTH_BYPASS=1`. Production deploys never set the env var, so the route is never registered. The dev environment sets `ENABLE_TEST_AUTH_BYPASS=1` so both the testing skill (`runTest`) and the committed Playwright E2E tests in `tests/e2e/` (run via the `e2e` workflow or `npx playwright test`) can drive `/screens` and other authenticated pages end-to-end. Playwright config lives in `playwright.config.ts`.

### Key Design Patterns
- **Shared Schema**: Ensures type consistency across frontend and backend.
- **Insert Schemas**: Zod schemas derived from Drizzle for data validation.
- **API Client**: Centralized fetch wrapper for API interactions.
- **Component Library**: Reusable UI components based on shadcn/ui.

### Technical Implementations
- **Layout Rotation**: Playlist items can reference media assets or layout templates. The player rotates through entire layouts on a timer, with zones identified by content-based fingerprints (`getZoneFingerprint`) to keep state (e.g. videos keep playing) for identical zones across layouts.
- **Canvas Positioning for Video Walls**: Screens can be placed within a larger virtual canvas, with layout content filling the screen's Area of Interest (AOI). The player simulator offers a "Full Canvas / Screen AOI" toggle.
- **Site Filtering**: Most UI components fetching site-scoped resources use `useSiteFilteredQuery` to prevent cross-site data leakage. Exceptions exist for system-wide or already server-filtered endpoints.
- **Live Screenshots**: Players capture and upload compressed JPEG screenshots every 60 seconds (if enabled), stored as base64 data URLs; the admin screen page displays these with auto-refresh.
- **Screen Presets & Control Panel**: Pre-configured layout+zone combinations can be saved and activated via a one-click control panel (creating a high-priority live override; deactivation removes it). Supports Stream Deck integration via REST API.
- **API Tokens**: Users can mint personal long-lived bearer tokens (`Authorization: Bearer vm_...`) for external integrations; tokens are hashed and stored, with existing tenant scoping applied.
- **Programme Scheduling**: A block editor with time rules, recurring schedules, screen/group targets, layout assignment, and priority. The conflict panel only flags overlapping blocks when their resolved screen sets actually intersect. The editor surfaces playback diagnostics (per-block "in past" / "no booking covers these dates" warnings, plus a 7-day "nothing will play" banner).
- **Multi-Event Screen Bookings**: Each screen can be booked into multiple events over time via the `screen_event_bookings` table (one row per booking with non-overlapping `[startsAt, endsAt)` half-open intervals per screen, validated server-side). The legacy `screens.currentEventId` column has been dropped; the player resolver, manifest, allowed-clients filter, simulator, and heartbeat alerts all derive the active event from the booking that contains "now".
- **Fallback Playlist Support**: Screens can have a `fallbackLayoutId` and `fallbackPlaylistId`. Priority chain: live override → scheduled programme → fallback layout → fallback playlist (rendered full-screen).
- **Offline Player Capability**: A Service Worker caches layout data and media assets so display nodes function offline; layout JSON is also stored in localStorage.
- **Player Audio Policy (muted-by-default)**: Every player-side `<video>` is muted unless an operator explicitly opts in, to avoid Chromium audio-focus auto-pause stutter. Do not flip this without preserving the opt-in path. See `docs/features.md`.
- **Per-Client Schedule Timezones**: Each client (site) carries an IANA timezone (`clients.timezone`, default `Europe/London`, env override `DEFAULT_SCHEDULE_TIMEZONE`). All schedule HH:MM comparisons run through `shared/timezone-utils.ts`, which handles DST transitions so blocks fire at the configured wall-clock time.
- **Agenda Spreadsheet Source Mapper**: The agenda-sync helper feeds the Agenda Display Widget from CSV/Google Sheets/Excel (OneDrive/SharePoint/uploaded) sources via a column-mapping pipeline (`shared/spreadsheet-mapping.ts`), not just the legacy fixed-column feeds. See `docs/features.md`.
- **HTML/CSS Widgets**: The `html` zone type renders operator-authored markup in a sandboxed iframe (`sandbox="allow-same-origin"` only — never `allow-scripts`), scaled from a fixed 1920px-wide reference canvas, with server-side sanitisation. See `docs/features.md`.
- **Sweepstake Wall Loop — custom media slides**: The sweepstake display's rotation is an operator-orderable loop mixing built-in tournament slides with media-library images/videos (per-item duration, sound, full-screen, enable/remove), persisted on `sweepstake_widget_configs.slideOrder` (JSONB). Media bytes are served by a public, tenant-safe route. See `docs/features.md`.

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

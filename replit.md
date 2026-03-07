# VectorMesh

## Overview

VectorMesh is an onsite display management platform for conference and exhibition centres. The system manages content display across multiple screen types including meeting-room screens, indoor public displays, and external LED walls. It supports multi-client branding, scheduled programming, live overrides, and real-time diagnostics for Raspberry Pi display nodes.

Key capabilities:
- Manage up to 50+ screens with mixed sizes and aspect ratios
- Support for images, videos, GIFs, and HTML widgets
- Zone-based layouts with tickers, clocks, logos, QR codes, countdown timers, schedules, and media regions
- **QR code zones**: Support for URL, WiFi, vCard content types with transparent backgrounds and customizable labels (position, size, color)
- **Countdown timer zones**: Real-time countdown to target date/time with customizable title (with independent size control), completion message, unit visibility (days/hours/minutes/seconds), custom labels, separator styles, leading zeros toggle, number/label colors, size presets (small/medium/large/xlarge), font family (mono/sans/serif/display), unit gap control, timezone selection, and compact mode
- **Layout aspect ratio support**: Presets (16:9, 9:16, 4:3, 1:1) plus custom ratios for portrait displays, LED walls, and specialty screens
- **Room schedule zones**: Hourly timeline, daily, and agenda view modes with configurable time slots, entries, and 12h/24h formatting
- **Dynamic player variables**: Placeholder tokens ({{screen_name}}, {{room_name}}, {{event_name}}, {{date}}, {{time}}, {{day}}) for reusable layouts resolved at display time
- **Event colour palettes**: Per-event brand colour palettes integrated into all zone colour pickers via swatches
- **Signage icons**: 29 curated signage icons (arrows incl. diagonal, toilets, fire exit, restaurant, WiFi, parking, etc.) as overlays on shape zones, with optional text labels (left/right/top/bottom/center positioning, configurable size and color)
- **Collapsible layout panel**: Layout list auto-hides when editing, with back button navigation
- Client/event separation with brand packs
- Timeline scheduling with programme blocks
- Live override mode for temporary takeovers
- Player health monitoring and fallback behavior
- Player Simulator for testing content layouts before deployment
- **Raspberry Pi Player**: Standalone player page at `/player` that renders content fullscreen in kiosk mode, with 7-second auto-refresh polling (change detection), programme/schedule-aware content resolution, live override support, and offline fallback screens
- **Secure device pairing**: Player pages are locked behind device-specific tokens. On first visit, displays show a pairing code input screen. After successful pairing, a secure 64-character hex token is generated and stored in localStorage. All player API endpoints (`/api/player/*`) require the `x-device-token` header or `?token=` query parameter. Invalid/missing tokens return 401/403. Admin API strips `deviceToken` from screen responses.
- **Simulator auto-refresh**: Simulator polls for layout/media/override changes every 7 seconds with TanStack Query structural sharing (only re-renders on actual data changes)
- **Pi setup script**: `pi-player/setup.sh` configures Raspberry Pi for kiosk mode with Chromium, autostart service, and management scripts. Pairing is done through the on-screen interface. Config stored in `~/.vectormesh/`.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Build Tool**: Vite with HMR support
- **File Uploads**: Uppy with AWS S3-compatible presigned URL uploads

The frontend follows a page-based structure under `client/src/pages/` with shared components in `client/src/components/`. Authentication state is managed via the `useAuth` hook connecting to Replit Auth.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx/esbuild
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Authentication**: Replit Auth with OpenID Connect, session-based with PostgreSQL session store
- **File Storage**: Google Cloud Storage via Replit Object Storage integration

The server entry point is `server/index.ts`, with routes registered in `server/routes.ts` and business logic in `server/storage.ts`.

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `drizzle-kit push` for schema sync

Core entities include: Clients, Events, Brand Packs, Display Profiles, Screen Groups, Screens, Media Assets, Layout Templates, Programmes, Schedule Blocks, Playlists, Live Overrides, and Player Heartbeats.

### Authentication & Authorization
- **Custom email/password authentication** (bcryptjs, 12-round hashing)
- Session storage in PostgreSQL `sessions` table via `connect-pg-simple`
- Session middleware in `server/auth.ts`, auth API routes in `server/routes.ts`
- User data stored in `users` table with `passwordHash`, `mustChangePassword`, `isActive` columns
- `role` column: "admin" | "site_user"
- Protected routes use `isAuthenticated` middleware (checks session userId, loads `req.dbUser`)
- **Auth API endpoints**:
  - `POST /api/auth/login` — email/password login
  - `POST /api/auth/logout` — destroy session
  - `GET /api/auth/user` — current user
  - `POST /api/auth/change-password` — user changes own password
  - `POST /api/auth/forgot-password` — sends reset email
  - `POST /api/auth/reset-password` — reset via token
  - `GET /api/auth/setup-status` — check if initial setup needed
  - `POST /api/auth/setup` — first-run admin account creation
- **Email service** (`server/email.ts`): Nodemailer SMTP with console fallback for dev
- **Password reset tokens**: `password_reset_tokens` table with 1-hour expiry
- **Forced password change**: `mustChangePassword` flag redirects to change-password page
- **Account deactivation**: `isActive` flag prevents login without deleting user
- **Last login tracking**: `lastLoginAt` column updated on successful login, displayed on admin user cards
- **RBAC (Role-Based Access Control)**: Two-tier system
  - **Admin**: Full platform access, can manage users, create/delete sites, see all data
  - **Site User**: Scoped to assigned sites only via `user_sites` join table (userId → clientId)
- Middleware: `requireAdmin` (403 if not admin), `loadUserContext` (sets `req.dbUser` and `req.allowedClientIds`)
- Access chain: resources → eventId → event.clientId → user's allowed clientIds
- Admin user management UI at `/admin/users` (admin-only sidebar item)
- Activity log UI at `/admin/activity` (admin-only sidebar item)
- **Admin user management API**:
  - `GET /api/admin/users` — list all users with sites
  - `POST /api/admin/users` — create user (sends welcome email)
  - `PATCH /api/admin/users/:id` — update user details
  - `POST /api/admin/users/:id/reset-password` — admin resets password
  - `POST /api/admin/users/:id/force-change-password` — flag must-change
  - `POST/DELETE /api/admin/users/:id/sites` — manage site assignments
  - `DELETE /api/admin/users/:id` — delete user
- **Audit logging**: `audit_logs` table records all mutating actions across the platform
  - `logAudit(req, action, entityType, entityId?, payload?)` helper in `server/routes.ts` (fire-and-forget, non-blocking)
  - Covers: auth events, CRUD on clients/events/screens/media/layouts/programmes/playlists/overrides, admin user management
  - Actions: create, update, delete, login, logout, change_password, reset_password, admin_reset_password, force_change_password, assign_site, remove_site, publish, regenerate_pairing, unpair
  - Storage methods: `createAuditLog()`, `getAuditLogs(options)`, `getAuditLogStats()`
  - **Audit log API endpoints** (admin-only):
    - `GET /api/admin/audit-logs` — paginated list with filters (entityType, action, limit, offset)
    - `GET /api/admin/stats` — aggregate stats (loginsToday, activeUsersWeek, changesThisWeek, totalLogs, entity counts)
  - **Activity Log page** (`/admin/activity`): colour-coded action badges, relative timestamps, entity type/action filters, pagination
  - **Dashboard admin section**: Recent Activity card (last 8 entries) and User & Activity Stats card (total users, active this week, logins today, changes this week)

### Key Design Patterns
- **Shared Schema**: Types defined once in `shared/` and used by both frontend and backend
- **Insert Schemas**: Zod schemas generated from Drizzle for validation
- **API Client**: Centralized fetch wrapper in `client/src/lib/queryClient.ts`
- **Component Library**: shadcn/ui components in `client/src/components/ui/`

## External Dependencies

### Database
- PostgreSQL (required, connection via `DATABASE_URL` environment variable)
- Drizzle ORM for queries and schema management

### Authentication
- Custom email/password authentication via `server/auth.ts`
- `SESSION_SECRET` environment variable required
- Session persistence via `connect-pg-simple`
- Password hashing: bcryptjs (12 rounds)
- Email sending: Nodemailer via `server/email.ts`

### Object Storage
- Replit Object Storage (Google Cloud Storage compatible)
- Presigned URL uploads via `/api/uploads/request-url`
- Sidecar endpoint at `http://127.0.0.1:1106` for credentials

### Frontend Libraries
- Radix UI for accessible primitives
- Uppy for file upload handling
- date-fns for date manipulation
- react-day-picker for calendar components
- embla-carousel for carousels
- recharts for charts (if needed)

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret for session encryption
- `REPL_ID` - Replit environment identifier

### Optional Environment Variables (Email)
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP port (default 587)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - Sender email address
- `APP_URL` - Application URL for email links (defaults to Replit dev URL)
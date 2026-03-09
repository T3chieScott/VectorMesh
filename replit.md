# VectorMesh

## Overview

VectorMesh is an onsite display management platform designed for conference and exhibition centers. Its primary purpose is to manage content display across diverse screen types, including meeting-room screens, indoor public displays, and large external LED walls. The platform offers multi-client branding capabilities, scheduled content programming, live override functionalities for urgent announcements, and real-time diagnostics for Raspberry Pi-based display nodes. It aims to provide a robust and flexible solution for dynamic digital signage in complex event environments.

Key capabilities include:
- Management of over 50 screens with varied sizes and aspect ratios.
- Support for various media types: images, videos, GIFs, and HTML widgets, with client-specific ownership.
- Automatic video thumbnail generation and serving.
- Zone-based layouts featuring tickers, clocks, logos, QR codes, countdown timers, schedules, media players, football league tables, Heathrow flight boards (arrivals/departures), and media regions.
- Advanced media player zones with playlist management, transition effects, and playback controls.
- Customizable QR code zones supporting URL, WiFi, and vCard content.
- Dynamic countdown timers with extensive customization options.
- Flexible layout aspect ratio support for diverse display hardware.
- **Canvas positioning for video walls**: Screens can be positioned within a larger virtual canvas (e.g., placing a 348×1044 screen at coordinates (0,0) on a 1920×1080 canvas). Canvas positioning fields (`canvasEnabled`, `canvasWidth`, `canvasHeight`, `canvasX`, `canvasY`) are on the screens table with validation enforced both client-side and server-side.
- Room schedule zones with multiple viewing modes.
- Dynamic player variables for personalized content display.
- Event-specific color palettes for consistent branding.
- Integration of signage icons with text labels for directional and informational purposes.
- Global site context switcher for filtering UI content by client.
- **Site-specific display profiles**: Display profiles are scoped to a site (clientId) and managed from a dedicated Admin page (`/admin/display-profiles`). The Screens page profile dropdown is filtered to show only profiles from the same site.
- **Screen groups with membership management**: Groups auto-inherit site from the current site context. Screens can be added/removed from groups via a management dialog, constrained to same-site screens only. Member counts displayed on group cards.
- Secure device pairing for display nodes using unique tokens.
- **Programme scheduling**: Full block editor with time rules (start/end times, date ranges), recurring schedules (day-of-week selectors), target screen/group selection, layout assignment, and priority. Blocks display time and target info in the programme list.
- Real-time player simulator with auto-refresh for content testing. Auto-resolves the active layout for a selected screen using the same priority as the real player (live override → scheduled programme → fallback layout), with a source badge showing why a layout is active.
- Raspberry Pi setup script for kiosk mode configuration.
- **Offline player capability**: Service Worker (`client/public/player-sw.js`) caches layout data and media assets so display nodes continue running autonomously if the internet connection drops. Layout JSON is also cached in localStorage as a fallback. An "Offline" badge appears on the player when running from cache. Media assets are pre-cached in the background when a layout is loaded, and stale assets are cleaned up when the layout changes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing Wouter for client-side routing and TanStack React Query for server state management. UI components are developed using shadcn/ui, based on Radix UI primitives, and styled with Tailwind CSS, leveraging CSS variables for theming. Vite serves as the build tool, supporting Hot Module Replacement (HMR). File uploads are handled by Uppy with XHR direct uploads to the server. The architecture follows a page-based structure for organization, with shared components centralized.

### Backend Architecture
The backend is a Node.js application using Express, written in TypeScript and compiled with tsx/esbuild. It exposes a RESTful JSON API. Authentication is custom email/password with session-based auth using a PostgreSQL session store. File storage uses the local filesystem with configurable upload root directory. The server's entry point manages routes and business logic.

### Data Storage
PostgreSQL is the chosen database, accessed via Drizzle ORM. The database schema is defined once in `shared/schema.ts` for both client and server use, and migrations are managed with Drizzle Kit. Core entities include Clients, Events, Media Assets, Layouts, Screens, Programmes, and Player Heartbeats.

### Authentication & Authorization
The system implements custom email/password authentication with bcryptjs for password hashing and PostgreSQL for session storage. It features mandatory TOTP-based Two-Factor Authentication (2FA) using the `otpauth` library — every user must set up an authenticator app (Google Authenticator, Authy, etc.) on their first login. The login flow is two-phase: credentials first, then TOTP code verification. 2FA setup is enforced at user creation (not optional), and the initial admin setup also includes mandatory 2FA enrollment. The system uses a robust Role-Based Access Control (RBAC) system with three tiers: Admin, Account Manager, and Site User, each with specific permissions and data visibility. Authentication APIs handle login, logout, 2FA setup/validation, user information retrieval, password management, and initial setup. An extensive audit logging system tracks all mutating actions and authentication events, storing them in an `audit_logs` table for accountability and analytics. Email alerts are configurable for screen status changes (offline/online), scoped per client, with recipient management and cooldown mechanisms.

### Key Design Patterns
- **Shared Schema**: Ensures type consistency across frontend and backend.
- **Insert Schemas**: Zod schemas derived from Drizzle for data validation.
- **API Client**: Centralized fetch wrapper for API interactions.
- **Component Library**: Reusable UI components based on shadcn/ui.

## External Dependencies

### Database
- **PostgreSQL**: Primary database for all application data.
- **Drizzle ORM**: Used for database interactions and schema management.

### Authentication
- **bcryptjs**: For secure password hashing.
- **otpauth**: For TOTP-based two-factor authentication generation and verification.
- **qrcode**: For generating QR code images for authenticator app enrollment.
- **Nodemailer**: For sending emails, including password reset and alert notifications.

### File Storage
- **Local Filesystem**: Media files stored on the server's local disk. Upload root directory is configurable via admin settings UI or `UPLOAD_DIR` environment variable (defaults to `./data/uploads`). Files are organized into per-site subfolders: `<root>/<clientId>/uploads/` for media and `<root>/<clientId>/thumbnails/` for video thumbnails.
- **multer**: Express middleware for handling multipart file uploads.
- **System Settings**: A `system_settings` database table stores the `uploadRootDir` setting, configurable from the admin Settings page.

### Frontend Libraries
- **Radix UI**: Provides accessible and unstyled UI primitives.
- **Uppy**: Robust JavaScript uploader for handling file uploads.
- **date-fns**: For efficient date manipulation.
- **react-day-picker**: For calendar and date selection components.
- **embla-carousel**: For creating flexible and touch-friendly carousels.

### Required Environment Variables
- `DATABASE_URL`: Connection string for PostgreSQL.
- `SESSION_SECRET`: Secret key for session encryption.
- `NODE_ENV`: Set to `production` for production deployments.

### Optional Environment Variables
- `UPLOAD_DIR`: Override default upload root directory (defaults to `./data/uploads`). Can also be set via admin UI.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP server configuration for email sending.
- `APP_URL`: Base URL for application links in emails.
- `HEATHROW_API_BASE_URL`: Base URL for Heathrow Flights API.
- `HEATHROW_API_KEY`: API key from Heathrow Developer Portal.
- `HEATHROW_API_SUBSCRIPTION_KEY`: Subscription key (Ocp-Apim-Subscription-Key header).
- `HEATHROW_API_TIMEOUT_MS`: Fetch timeout in ms (default 10000).
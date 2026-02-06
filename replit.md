# Digital Signage System

## Overview

This is an onsite digital signage platform for a conference and exhibition centre. The system manages content display across multiple screen types including meeting-room screens, indoor public displays, and external LED walls. It supports multi-client branding, scheduled programming, live overrides, and real-time diagnostics for Raspberry Pi display nodes.

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
- **Signage icons**: 27 curated signage icons (arrows, toilets, fire exit, restaurant, WiFi, parking, etc.) as overlays on shape zones
- **Collapsible layout panel**: Layout list auto-hides when editing, with back button navigation
- Client/event separation with brand packs
- Timeline scheduling with programme blocks
- Live override mode for temporary takeovers
- Player health monitoring and fallback behavior
- Player Simulator for testing content layouts before deployment

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

### Authentication
- Replit Auth integration using OpenID Connect
- Session storage in PostgreSQL `sessions` table
- User data stored in `users` table
- Protected routes use `isAuthenticated` middleware

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
- Replit Auth (OpenID Connect provider)
- `SESSION_SECRET` environment variable required
- Session persistence via `connect-pg-simple`

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
- `ISSUER_URL` - OpenID Connect issuer (defaults to Replit)
- `REPL_ID` - Replit environment identifier
# VectorMesh

## Overview

VectorMesh is an onsite display management platform designed for conference and exhibition centers. Its primary purpose is to manage content display across diverse screen types, including meeting-room screens, indoor public displays, and large external LED walls. The platform offers multi-client branding capabilities, scheduled content programming, live override functionalities for urgent announcements, and real-time diagnostics for Raspberry Pi-based display nodes. It aims to provide a robust and flexible solution for dynamic digital signage in complex event environments.

Key capabilities include:
- Management of over 50 screens with varied sizes and aspect ratios.
- Support for various media types: images, videos, GIFs, and HTML widgets, with client-specific ownership.
- Automatic video thumbnail generation and serving.
- Zone-based layouts featuring tickers, clocks, logos, QR codes, countdown timers, schedules, media players, and media regions.
- Advanced media player zones with playlist management, transition effects, and playback controls.
- Customizable QR code zones supporting URL, WiFi, and vCard content.
- Dynamic countdown timers with extensive customization options.
- Flexible layout aspect ratio support for diverse display hardware.
- Room schedule zones with multiple viewing modes.
- Dynamic player variables for personalized content display.
- Event-specific color palettes for consistent branding.
- Integration of signage icons with text labels for directional and informational purposes.
- Global site context switcher for filtering UI content by client.
- Secure device pairing for display nodes using unique tokens.
- **Programme scheduling**: Full block editor with time rules (start/end times, date ranges), recurring schedules (day-of-week selectors), target screen/group selection, layout assignment, and priority. Blocks display time and target info in the programme list.
- Real-time player simulator with auto-refresh for content testing.
- Raspberry Pi setup script for kiosk mode configuration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing Wouter for client-side routing and TanStack React Query for server state management. UI components are developed using shadcn/ui, based on Radix UI primitives, and styled with Tailwind CSS, leveraging CSS variables for theming. Vite serves as the build tool, supporting Hot Module Replacement (HMR). File uploads are handled by Uppy, integrated with AWS S3-compatible presigned URL uploads. The architecture follows a page-based structure for organization, with shared components centralized.

### Backend Architecture
The backend is a Node.js application using Express, written in TypeScript and compiled with tsx/esbuild. It exposes a RESTful JSON API. Authentication is managed via Replit Auth using OpenID Connect and session-based authentication with a PostgreSQL session store. File storage is integrated with Google Cloud Storage via Replit Object Storage. The server's entry point manages routes and business logic.

### Data Storage
PostgreSQL is the chosen database, accessed via Drizzle ORM. The database schema is defined once in `shared/schema.ts` for both client and server use, and migrations are managed with Drizzle Kit. Core entities include Clients, Events, Media Assets, Layouts, Screens, Programmes, and Player Heartbeats.

### Authentication & Authorization
The system implements custom email/password authentication with bcryptjs for password hashing and PostgreSQL for session storage. It features a robust Role-Based Access Control (RBAC) system with three tiers: Admin, Account Manager, and Site User, each with specific permissions and data visibility. Authentication APIs handle login, logout, user information retrieval, password management, and initial setup. An extensive audit logging system tracks all mutating actions and authentication events, storing them in an `audit_logs` table for accountability and analytics. Email alerts are configurable for screen status changes (offline/online), scoped per client, with recipient management and cooldown mechanisms.

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
- **Nodemailer**: For sending emails, including password reset and alert notifications.

### Object Storage
- **Replit Object Storage**: Google Cloud Storage compatible for media asset storage.

### Frontend Libraries
- **Radix UI**: Provides accessible and unstyled UI primitives.
- **Uppy**: Robust JavaScript uploader for handling file uploads.
- **date-fns**: For efficient date manipulation.
- **react-day-picker**: For calendar and date selection components.
- **embla-carousel**: For creating flexible and touch-friendly carousels.

### Required Environment Variables
- `DATABASE_URL`: Connection string for PostgreSQL.
- `SESSION_SECRET`: Secret key for session encryption.
- `REPL_ID`: Identifier for the Replit environment.

### Optional Environment Variables (Email)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP server configuration for email sending.
- `APP_URL`: Base URL for application links in emails.
# FitScore GPT API Dashboard

## Overview
The FitScore GPT API Dashboard is a full-stack web application designed to integrate with the WHOOP health platform. Its primary purpose is to provide users with a centralized dashboard for monitoring fitness data and managing meal images. The application is built to support Custom GPT integrations, offering health metrics and meal tracking functionalities. It aims to empower users with insights into their health and activity, facilitating a better understanding of their well-being.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is structured into a `client/` (frontend), `server/` (backend), and `shared/` (common types/schemas) directory.
### Frontend
- **Framework**: React 18 with TypeScript.
- **Styling**: Tailwind CSS, utilizing shadcn/ui for components.
- **Routing**: Wouter.
- **State Management**: TanStack Query (React Query) for server state.
- **Build Tool**: Vite.

### Backend
- **Runtime**: Node.js with TypeScript.
- **Framework**: Express.js.
- **Database**: PostgreSQL with Drizzle ORM for data persistence and schema management.
- **File Storage**: Local file system (`/uploads`) for meal images.

### Key Features & Design Decisions
- **Database Schema**: Includes tables for Users, Meals, and WHOOP Data, with Zod for schema validation.
- **API Endpoints**:
    - Health Check.
    - WHOOP integration for authentication (OAuth) and fetching daily/weekly health metrics.
    - Meal management (upload and retrieval).
    - Calendar integration for Google Calendar .ics feeds.
    - Authentication is JWT-based, supporting admin roles and secure access to protected endpoints.
- **UI/UX**: Features a dark theme with FitScore branding, custom SVG logo, neon blue accents, and smooth animations. It incorporates circular progress indicators, responsive grid layouts, and modern card designs. The dashboard provides comprehensive health metrics visualization, including detailed sleep and workout insights.
- **Data Flow**: WHOOP data is fetched via API, cached in PostgreSQL, and displayed with visual indicators. Meal images are uploaded via Multer, stored locally, with metadata saved in the database.
- **Authentication**: JWT-based for secure user sessions, supporting admin roles and ensuring data isolation per user. OAuth 2.0 flow for WHOOP integration.
- **Token Management**: Implements an automated background system for WHOOP token refresh to ensure continuous data access.
- **Calendar System**: Provides a full calendar UI with timezone support, event display, and integration with Google Calendar ICS feeds.
- **Error Handling**: Comprehensive error handling for API calls, including retry logic with exponential backoff and graceful degradation.

## External Dependencies
- **Database Hosting**: Neon Database (PostgreSQL serverless).
- **File Uploads**: Multer.
- **Data Validation**: Zod.
- **UI Components**: Radix UI primitives with shadcn/ui.
- **Date Manipulation**: date-fns, luxon, moment-timezone (for calendar).
- **API Integrations**:
    - **WHOOP API**: For comprehensive health and fitness data (recovery scores, sleep metrics, strain data).
    - **Google Calendar API**: For fetching calendar events via `.ics` feeds.
- **Authentication**: bcrypt for password hashing.
# FitScore GPT API Dashboard

## Overview

FitScore GPT API Dashboard is a full-stack web application that integrates with the WHOOP health platform to provide health metrics and meal tracking functionality. The application serves as a dashboard for monitoring fitness data and managing meal images, designed to work with Custom GPT integrations.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Build Tool**: Vite for development and production builds
- **UI Components**: Comprehensive shadcn/ui component system with Radix UI primitives

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for API server
- **Database**: PostgreSQL with Drizzle ORM (migrated from in-memory storage)
- **File Storage**: Local file system for meal image uploads in `/uploads` directory
- **Development**: tsx for TypeScript execution in development

### Project Structure
```
├── client/          # Frontend React application
├── server/          # Backend Express server
├── shared/          # Shared TypeScript types and schemas
├── uploads/         # File storage for meal images
└── migrations/      # Database migration files
```

## Key Components

### Database Layer (Drizzle ORM)
- **Users Table**: Authentication and user management
- **Meals Table**: Meal image metadata and storage information
- **WHOOP Data Table**: Health metrics from WHOOP API integration
- **Schema Validation**: Zod schemas for type-safe data validation

### API Layer
- **Health Check Endpoint** (`/api/health`): API status verification
- **WHOOP Authentication** (`/api/whoop/login`, `/api/whoop/callback`, `/api/whoop/status`): OAuth flow endpoints
- **WHOOP Integration** (`/api/whoop/today`): Fetches daily health metrics from live API
- **Meal Management** (`/api/meals`): File upload and meal data management
- **File Upload**: Multer middleware for handling meal image uploads (10MB limit)

### Frontend Components
- **Dashboard**: Main application interface
- **Health Metrics**: WHOOP data visualization with progress indicators
- **Meal Upload**: File upload interface with drag-and-drop support
- **API Status**: Endpoint documentation and testing interface

## Data Flow

1. **WHOOP Data Flow**:
   - Frontend requests today's metrics via `/api/whoop/today`
   - Backend fetches data from WHOOP API using stored access token
   - Data is cached in PostgreSQL database
   - Frontend displays metrics with visual progress indicators

2. **Meal Upload Flow**:
   - User selects image files through upload interface
   - Multer processes files and stores them in `/uploads` directory
   - File metadata is saved to meals table
   - Frontend updates with success notification and refreshes meal list

3. **Authentication Flow**:
   - User credentials stored in PostgreSQL users table
   - Session management handled by Express middleware

## External Dependencies

### Production Dependencies
- **Database**: Neon Database (PostgreSQL serverless)
- **File Processing**: Multer for multipart form handling
- **Validation**: Zod for runtime type validation
- **UI Framework**: Radix UI primitives with shadcn/ui components
- **Date Handling**: date-fns for date manipulation

### Development Dependencies
- **TypeScript**: Full TypeScript support across frontend and backend
- **ESBuild**: Production bundling for server code
- **Vite**: Frontend development and building

### External API Integration
- **WHOOP API**: Health and fitness data integration
  - Recovery scores, sleep metrics, strain data
  - Requires valid WHOOP_ACCESS_TOKEN environment variable
  - Data cached locally to reduce API calls

## Deployment Strategy

### Development Environment
- **Command**: `npm run dev`
- **Server**: tsx for TypeScript execution
- **Frontend**: Vite dev server with HMR
- **Database**: Local or remote PostgreSQL connection

### Production Deployment
1. **Build Process**:
   - Frontend: `vite build` → static files to `dist/public`
   - Backend: `esbuild` → bundled server to `dist/index.js`

2. **Production Server**:
   - **Command**: `npm start`
   - **Port**: 5000 (mapped to 80 externally)
   - **Deployment Target**: Replit Autoscale
   - **Static Files**: Served from `dist/public`

3. **Database Migration**:
   - **Command**: `npm run db:push`
   - Uses Drizzle Kit for schema synchronization

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (required)
- `WHOOP_ACCESS_TOKEN`: WHOOP API authentication token
- `NODE_ENV`: Environment specification (development/production)

## Recent Changes
- June 20, 2025: Completed WHOOP OAuth authentication system with database persistence
  - Fixed WHOOP token persistence by migrating from file-based to PostgreSQL database storage
  - Updated all token storage methods to use database with proper async handling
  - Added WHOOP tokens table to database schema for persistent authentication
  - Resolved authentication errors and implemented comprehensive endpoint testing
  - WHOOP OAuth authentication working correctly (user profile endpoint returns 200)
  - Identified WHOOP API data endpoint limitation: all data endpoints return 404 errors
  - Authentication persists across server restarts with database storage
  - Note: WHOOP data endpoints may require additional developer partnership or API access beyond standard OAuth
  - System ready for integration when WHOOP provides access to data endpoints
- June 19, 2025: Added PostgreSQL database support
  - Migrated from in-memory storage to DatabaseStorage class using Drizzle ORM
  - Created database tables: users, meals, whoop_data
  - All API endpoints now persist data to PostgreSQL
  - Verified database integration with successful meal uploads and WHOOP data storage
- June 19, 2025: Completed FitScore GPT API implementation with exact specifications
  - WHOOP endpoint returns consistent mock data (recovery: 68, sleep: 75, strain: 12.3, HR: 60)
  - Meal upload accepts 'mealPhotos' field, stores in /uploads with timestamps
  - Today's meals endpoint returns full URLs array format
  - Added startup logging with curl test examples
  - Static file serving enabled for Custom GPT access
- June 19, 2025: Initial project setup

## User Preferences

Preferred communication style: Simple, everyday language.
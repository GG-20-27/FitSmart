# FitScore GPT API Dashboard

## Overview

The FitScore GPT API Dashboard is a full-stack web application designed to integrate with the WHOOP health platform. Its core purpose is to provide users with a dashboard for monitoring their fitness data and managing meal image uploads. This application facilitates deeper insights into health metrics and supports Custom GPT integrations for advanced AI-driven health management.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (August 2025)

### WHOOP Data Consistency Fix (Aug 19, 2025)
- **Fixed all data mapping issues**: Sleep score now correctly shows 83% (was impossible 105%)
- **Enhanced precision**: HRV shows 94ms (from precise 93.759125), Strain shows 8.745386 (full precision)
- **Database schema updates**: Changed integer fields to real for decimal WHOOP data (strain_score, hrv, respiratory_rate, spo2_percentage, skin_temp_celsius)
- **Added Weekly Averages section**: Dashboard now displays 7-day trends (Recovery: 65.4%, Strain: 10.9, Sleep: 67%, HRV: 80ms)
- **Live data priority**: All metrics now show authentic live WHOOP data with proper cache management

### Calendar Security Enhancement (Aug 19, 2025)
- **Multi-tenant security**: All calendar routes enforce per-user ownership with 404 responses for unauthorized access
- **Enhanced logging**: Structured [CAL ICS] logs with hostname-only URL logging for privacy
- **Improved error handling**: Better ICS validation with specific messages for private calendars
- **Consistent API responses**: Standardized response shapes with timezone information
- **Timezone accuracy**: Europe/Zurich timezone handling for all calendar operations

### Navigation Improvements (Aug 19, 2025)
- **Added "Back to Dashboard" buttons**: Profile and Login pages now have consistent navigation
- **Enhanced user experience**: Improved flow between application sections

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript.
- **Styling**: Tailwind CSS with shadcn/ui and Radix UI for comprehensive component solutions.
- **Routing**: Wouter for client-side navigation.
- **State Management**: TanStack Query for server state.
- **Build Tool**: Vite.

### Backend
- **Runtime**: Node.js with TypeScript.
- **Framework**: Express.js for the API server.
- **Database**: PostgreSQL with Drizzle ORM for data persistence (users, meals, WHOOP data).
- **File Storage**: Local file system for meal image uploads.

### Core Features
- **Data Management**: Persistence of user, meal image metadata, and WHOOP health metrics with precise decimal storage.
- **API Endpoints**:
    - Health Check.
    - WHOOP Integration: Authentication (OAuth), daily metric retrieval, token management, and weekly averages.
    - Meal Management: Image upload and data handling.
    - Calendar Integration: Secure per-user calendar management with timezone-aware event fetching.
- **Frontend Components**: Dashboard for metric visualization with weekly averages section, meal upload interface, and API status monitoring.
- **Authentication**: JWT-based authentication with role-based access control (admin/user) and multi-tenant security.
- **Data Flow**: Seamless flow from WHOOP API to backend storage and frontend display, including automated token refresh and live data fetching.
- **UI/UX**: Dark theme with neon blue accents, responsive design for various devices, circular progress indicators, smooth animations, and navigation buttons.
- **Security**: Multi-tenant calendar ownership enforcement, structured error handling, and authenticated API access.

## External Dependencies

- **Database**: Neon Database (PostgreSQL serverless).
- **Health Platform API**: WHOOP API for health and fitness data (recovery, sleep, strain, HRV).
- **File Upload**: Multer for multipart form data handling.
- **Validation**: Zod for runtime type validation.
- **Date Handling**: date-fns for date manipulation.
- **Calendar Integration**: Google Calendar (via .ics feeds).
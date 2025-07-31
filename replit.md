# FitScore GPT API Dashboard

## Overview

The FitScore GPT API Dashboard is a full-stack web application designed to integrate with the WHOOP health platform. Its core purpose is to provide users with a dashboard for monitoring their fitness data and managing meal image uploads. This application facilitates deeper insights into health metrics and supports Custom GPT integrations for advanced AI-driven health management.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Data Management**: Persistence of user, meal image metadata, and WHOOP health metrics.
- **API Endpoints**:
    - Health Check.
    - WHOOP Integration: Authentication (OAuth), daily metric retrieval, and token management.
    - Meal Management: Image upload and data handling.
    - Calendar Integration: Fetching events from Google Calendar .ics feeds.
- **Frontend Components**: Dashboard for metric visualization, meal upload interface, and API status monitoring.
- **Authentication**: JWT-based authentication with role-based access control (admin/user).
- **Data Flow**: Seamless flow from WHOOP API to backend storage and frontend display, including automated token refresh.
- **UI/UX**: Dark theme with neon blue accents, responsive design for various devices, circular progress indicators, and smooth animations.

## External Dependencies

- **Database**: Neon Database (PostgreSQL serverless).
- **Health Platform API**: WHOOP API for health and fitness data (recovery, sleep, strain, HRV).
- **File Upload**: Multer for multipart form data handling.
- **Validation**: Zod for runtime type validation.
- **Date Handling**: date-fns for date manipulation.
- **Calendar Integration**: Google Calendar (via .ics feeds).
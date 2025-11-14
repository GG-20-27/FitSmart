# CLAUDE.md - AI Assistant Guide for FitSmart

> **Last Updated**: 2025-11-14
> **Purpose**: Comprehensive guide for AI assistants working on the FitSmart codebase

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Stack](#architecture--stack)
3. [Codebase Structure](#codebase-structure)
4. [Development Workflows](#development-workflows)
5. [Key Conventions](#key-conventions)
6. [Critical Files Reference](#critical-files-reference)
7. [Common Tasks](#common-tasks)
8. [Database & Schema](#database--schema)
9. [Authentication & Security](#authentication--security)
10. [AI Integration](#ai-integration)
11. [Testing & Quality](#testing--quality)
12. [Deployment](#deployment)
13. [Gotchas & Important Notes](#gotchas--important-notes)

---

## Project Overview

**FitSmart** is a full-stack health optimization platform that integrates WHOOP fitness wearable data with AI-powered coaching to help users optimize their health, sleep, recovery, and performance.

### Components
- **Web Application**: React SPA with TypeScript, Vite, and Tailwind CSS
- **Backend API**: Express.js server with TypeScript, JWT authentication
- **Mobile App**: React Native/Expo application (iOS/Android)
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM
- **AI Coach**: OpenAI GPT-4o with custom persona composition

### Key Features
- WHOOP OAuth integration for fitness data
- Real-time AI coaching chat interface
- Calendar integration (iCal, personal calendars)
- Goal tracking and progress monitoring
- Multi-platform support (web + mobile)
- Admin dashboard for user management

---

## Architecture & Stack

### Frontend (Web)
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.14
- **Routing**: Wouter 3.3.5 (lightweight alternative to React Router)
- **State Management**: TanStack Query (React Query) v5.60.5
- **UI Framework**: shadcn/ui + Radix UI (43+ components)
- **Styling**: Tailwind CSS 3.4.17 with custom configuration
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts for data visualization
- **Calendar**: React Big Calendar + date-fns

### Backend
- **Runtime**: Node.js 20+ (required for build compatibility)
- **Framework**: Express.js 4.21.2
- **Language**: TypeScript 5.6.3 with ES Modules
- **ORM**: Drizzle ORM 0.39.1 with Drizzle Kit
- **Database**: PostgreSQL via @neondatabase/serverless
- **Authentication**: JWT (jsonwebtoken) + Passport.js
- **Sessions**: express-session with PostgreSQL store
- **File Upload**: Multer (10MB images, 25MB audio)
- **WebSockets**: ws 8.18.0 for real-time features

### Mobile
- **Framework**: React Native + Expo 54
- **Navigation**: Bottom tab navigator (Expo Router)
- **Secure Storage**: Expo SecureStore for JWT tokens
- **Icons**: Ionicons
- **Build**: EAS Build with Node 22.11.0

### External Integrations
- **WHOOP API**: OAuth 2.0 flow for fitness data
- **OpenAI API**: GPT-4o for AI coaching
- **Supabase**: Storage for media files
- **n8n**: Workflow automation webhooks

---

## Codebase Structure

```
FitSmart/
├── client/                    # React web frontend
│   ├── src/
│   │   ├── components/        # React components (shadcn/ui)
│   │   │   ├── ui/           # Base UI components (43+ components)
│   │   │   ├── DashboardHeader.tsx
│   │   │   ├── ChatWindow.tsx
│   │   │   └── ...
│   │   ├── pages/            # Page components (Wouter routes)
│   │   │   ├── Dashboard.tsx  # Main dashboard (891 lines)
│   │   │   ├── Calendar.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── Admin.tsx
│   │   │   └── Login.tsx
│   │   ├── hooks/            # Custom React hooks
│   │   │   ├── use-auth.tsx  # Authentication hook
│   │   │   ├── use-toast.ts  # Toast notifications
│   │   │   └── use-mobile.tsx
│   │   ├── lib/              # Utilities and helpers
│   │   │   └── utils.ts      # Tailwind merge, clsx
│   │   ├── App.tsx           # Root component with routing
│   │   └── main.tsx          # Entry point
│   └── index.html
├── server/                    # Express backend
│   ├── index.ts              # Server setup & middleware (434 lines)
│   ├── routes.ts             # API route definitions (3000+ lines)
│   ├── jwtAuth.ts            # JWT authentication (278 lines)
│   ├── services/             # Business logic layer
│   │   ├── whoopApiService.ts    # WHOOP API client (50KB)
│   │   ├── chatService.ts        # OpenAI integration (49KB)
│   │   ├── contextPack.ts        # Context aggregation (10KB)
│   │   ├── personaComposer.ts    # LLM prompt generation (31KB)
│   │   ├── userService.ts        # User CRUD operations
│   │   ├── calendarService.ts    # iCal parsing
│   │   ├── n8nEventService.ts    # Webhook handling
│   │   └── ...
│   ├── middleware/           # Express middleware
│   │   ├── authMiddleware.ts     # JWT + admin checks
│   │   ├── loggingMiddleware.ts  # Request logging
│   │   └── errorMiddleware.ts    # Error handling
│   └── db.ts                 # Drizzle database connection
├── mobile/                    # React Native app
│   ├── src/
│   │   ├── api/              # API client configuration
│   │   │   └── client.ts     # Axios instance with JWT
│   │   ├── screens/          # Mobile screens
│   │   │   ├── DashboardScreen.tsx
│   │   │   ├── ChatScreen.tsx
│   │   │   ├── GoalsScreen.tsx
│   │   │   ├── ProfileScreen.tsx
│   │   │   └── CalendarScreen.tsx
│   │   └── navigation/       # Navigation setup
│   ├── App.tsx               # Root component
│   ├── app.config.js         # Expo configuration
│   ├── eas.json              # EAS Build config
│   └── package.json
├── shared/                    # Shared code between frontend/backend
│   ├── schema.ts             # **CRITICAL** Database schema (single source of truth)
│   └── types.ts              # TypeScript type definitions
├── data/                      # Static data files
│   └── userProfile.json      # Sample user profile data
├── db/                        # Database migrations
│   └── schema.sql
├── package.json              # Root dependencies & scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite build configuration
├── tailwind.config.ts        # Tailwind CSS configuration
├── drizzle.config.ts         # Drizzle ORM configuration
└── .env                      # Environment variables (not in git)
```

---

## Development Workflows

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with required values:
# - DATABASE_URL (Neon PostgreSQL)
# - WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET
# - OPENAI_API_KEY
# - JWT_SECRET

# 3. Push database schema
npm run db:push

# 4. Start development server
npm run dev  # Runs both backend (port 5000) and frontend (port 5001)
```

### Mobile Development

```bash
cd mobile

# Install dependencies
npm install

# Start Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Clean install (if issues arise)
npm run clean
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend in development mode |
| `npm run build` | Build for production (Vite + esbuild) |
| `npm run start` | Run production build |
| `npm run check` | Run TypeScript type checking |
| `npm run db:push` | Apply database schema changes |

### Code Generation

**shadcn/ui Components**: Add new UI components using:
```bash
npx shadcn@latest add [component-name]
```

Components are added to `client/src/components/ui/` and automatically configured.

### Database Migrations

1. Modify schema in `shared/schema.ts`
2. Run `npm run db:push` to apply changes
3. Drizzle will automatically sync schema to database

**Important**: Always modify `shared/schema.ts` first, then push. Do NOT manually alter the database.

---

## Key Conventions

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| React Components | PascalCase | `DashboardHeader`, `ChatWindow` |
| Hooks | `use` prefix + camelCase | `useAuth`, `useQuery`, `useToast` |
| Services | camelCase or Class | `whoopApiService`, `UserService` |
| API Routes | `/api/[feature]/[action]` | `/api/whoop/today`, `/api/chat` |
| Database Tables | snake_case (plural) | `users`, `whoop_data`, `user_calendars` |
| Database Columns | snake_case | `created_at`, `recovery_score`, `whoop_id` |
| TypeScript Files | camelCase | `chatService.ts`, `contextPack.ts` |
| React Files | PascalCase | `Dashboard.tsx`, `Profile.tsx` |

### File Organization

1. **Components**: Group by feature, then by type
   - UI primitives go in `client/src/components/ui/`
   - Feature components go in `client/src/components/`
   - Page components go in `client/src/pages/`

2. **Services**: One file per domain (user, whoop, chat, calendar)
   - Keep service files focused on a single responsibility
   - Export a default service instance or class

3. **Types**: Define in `shared/types.ts` for cross-platform types
   - Database types are auto-generated from `shared/schema.ts`
   - Use Zod schemas for validation + type inference

### Code Style

- **TypeScript**: Strict mode enabled, no `any` types
- **Imports**: Use ES modules (`import`/`export`)
- **Async/Await**: Prefer over promises chains
- **Error Handling**: Try/catch with specific error types
- **Comments**: JSDoc for public APIs, inline for complex logic
- **Formatting**: Consistent indentation (2 spaces)

### Component Patterns

```typescript
// Example React component structure
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

interface ComponentProps {
  userId: string;
  onUpdate?: (data: any) => void;
}

export function Component({ userId, onUpdate }: ComponentProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json())
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="space-y-4">
      {/* Component content */}
    </div>
  );
}
```

---

## Critical Files Reference

### Must-Read Files for AI Assistants

1. **`shared/schema.ts`** (Database Schema)
   - **CRITICAL**: Single source of truth for database structure
   - Defines all tables: users, whoopTokens, meals, whoopData, userCalendars
   - Use Drizzle ORM syntax with Zod validation
   - **ALWAYS** modify this file before changing database structure

2. **`server/routes.ts`** (API Endpoints - 3000+ lines)
   - All 50+ API endpoints defined here
   - Route structure: authentication, WHOOP, AI chat, goals, admin
   - Middleware usage: requireJWTAuth, attachUser, requireAdmin
   - Request/response patterns

3. **`client/src/App.tsx`** (Frontend Routing)
   - Wouter routing configuration
   - AuthWrapper for protected routes
   - 8 main routes: Dashboard, Calendar, Profile, Admin, Login, etc.

4. **`server/index.ts`** (Server Setup - 434 lines)
   - Express middleware chain (CORS, sessions, auth)
   - WebSocket setup for real-time features
   - Error handling and logging configuration
   - Server initialization and port binding

5. **`server/jwtAuth.ts`** (Authentication - 278 lines)
   - JWT token generation and validation
   - WHOOP OAuth flow implementation
   - Middleware: requireJWTAuth, attachUser, requireAdmin
   - Token structure and expiration (10 years)

6. **`server/services/whoopApiService.ts`** (WHOOP Integration - 50KB)
   - WHOOP API client with retry logic
   - Endpoints: cycles, recovery, sleep, workouts, body measurements
   - Token management and refresh
   - Error handling for WHOOP API errors

7. **`server/services/chatService.ts`** (AI Coaching - 49KB)
   - OpenAI GPT-4o integration
   - Conversation history management
   - Context injection from WHOOP data
   - Token counting and cost tracking

8. **`server/services/personaComposer.ts`** (AI Prompts - 31KB)
   - System prompt generation for AI coach
   - Dynamic persona composition based on user data
   - Context formatting for LLM consumption

9. **`mobile/src/api/client.ts`** (Mobile API Client)
   - Axios instance with JWT token injection
   - SecureStore integration for token storage
   - Base URL configuration for development/production

### Configuration Files

- **`package.json`**: Dependencies, scripts, Node version (>=20.0.0)
- **`tsconfig.json`**: TypeScript compiler options
- **`vite.config.ts`**: Frontend build configuration
- **`tailwind.config.ts`**: Tailwind CSS theme and plugins
- **`drizzle.config.ts`**: Database connection and migrations
- **`mobile/app.config.js`**: Expo configuration with environment variables
- **`mobile/eas.json`**: EAS Build configuration (Node 22.11.0)

---

## Common Tasks

### Adding a New API Endpoint

1. Define route in `server/routes.ts`:
```typescript
app.post('/api/feature/action', requireJWTAuth, async (req, res) => {
  try {
    const { param } = req.body;
    const result = await featureService.doAction(param);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

2. Create service in `server/services/featureService.ts` if needed
3. Add frontend API call in component using React Query
4. Update mobile API client if needed

### Adding a Database Table

1. Edit `shared/schema.ts`:
```typescript
export const newTable = pgTable('new_table', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  // ... other columns
});
```

2. Run `npm run db:push` to apply schema
3. Create Zod validation schemas if needed
4. Update services to interact with new table

### Adding a shadcn/ui Component

```bash
npx shadcn@latest add [component-name]
```

Component is automatically added to `client/src/components/ui/` with proper configuration.

### Modifying the AI Coach Persona

Edit `server/services/personaComposer.ts`:
- `composeSystemPrompt()`: Main system prompt
- `formatUserContext()`: How user data is presented to AI
- `addWhoopDataContext()`: WHOOP data formatting

### Adding Environment Variables

1. Add to `.env` file (local development)
2. Add to `server/index.ts` for validation
3. For mobile, add to `mobile/app.config.js` under `extra`
4. Access in mobile via `import Constants from 'expo-constants'; Constants.expoConfig.extra.VAR_NAME`

### Debugging WHOOP API Issues

1. Check token validity in `whoop_tokens` table
2. Review `server/services/whoopApiService.ts` retry logic
3. Check WHOOP API status: https://developer.whoop.com/
4. Verify OAuth callback URL matches WHOOP app settings
5. Check logs for specific error codes (401, 429, 500)

### Running Database Queries

Use Drizzle ORM syntax:

```typescript
import { db } from './db';
import { users, whoopData } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';

// Select
const user = await db.select().from(users).where(eq(users.id, userId));

// Insert
await db.insert(users).values({ id: 'user123', email: 'test@example.com' });

// Update
await db.update(users).set({ email: 'new@example.com' }).where(eq(users.id, userId));

// Delete
await db.delete(users).where(eq(users.id, userId));
```

---

## Database & Schema

### Database Provider
- **PostgreSQL** via Neon (serverless)
- Connection string in `DATABASE_URL` environment variable
- Connection pooling handled by `@neondatabase/serverless`

### Schema Overview

**5 Main Tables**:

1. **`users`**
   - Primary key: `id` (text, WHOOP user ID format: `whoop_<id>`)
   - Stores: email, role (user/admin), created_at
   - Referenced by all other tables with cascade delete

2. **`whoop_tokens`**
   - Stores WHOOP OAuth tokens (access + refresh)
   - Foreign key: `user_id` → `users.id`
   - Token expiration tracking

3. **`meals`**
   - User meal logging with photos
   - Fields: description, photo URL, timestamp
   - Foreign key: `user_id` → `users.id`

4. **`whoop_data`**
   - Cached WHOOP metrics (cycles, recovery, sleep)
   - JSON columns for flexible data storage
   - Foreign key: `user_id` → `users.id`

5. **`user_calendars`**
   - iCal feed URLs for calendar integration
   - Fields: calendar_url, last_synced
   - Foreign key: `user_id` → `users.id`

### Data Relationships

```
users (id)
  ├── whoop_tokens (user_id) - 1:1
  ├── meals (user_id) - 1:N
  ├── whoop_data (user_id) - 1:N
  └── user_calendars (user_id) - 1:N
```

All foreign keys use `onDelete: 'cascade'` for automatic cleanup.

### Validation

Zod schemas are derived from Drizzle schema:
```typescript
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { users } from './schema';

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);
```

---

## Authentication & Security

### JWT Authentication Flow

1. **WHOOP OAuth** (Web):
   ```
   User clicks "Connect WHOOP"
     ↓
   Redirect to WHOOP authorize URL
     ↓
   WHOOP redirects to /callback?code=xxx
     ↓
   Exchange code for tokens (whoopApiService)
     ↓
   Store tokens in whoop_tokens table
     ↓
   Generate JWT with whoopId + role
     ↓
   Redirect to /#token=JWT
     ↓
   Frontend stores JWT in localStorage
   ```

2. **JWT Structure**:
   ```json
   {
     "whoopId": "whoop_12345",
     "role": "user",
     "iat": 1699999999,
     "exp": 1999999999
   }
   ```

3. **Token Storage**:
   - Web: `localStorage.getItem('token')`
   - Mobile: Expo SecureStore (encrypted)

### Middleware Chain

```typescript
// Public route
app.get('/api/public', handler);

// Authenticated route
app.get('/api/protected', requireJWTAuth, handler);

// User-attached route (adds req.user)
app.get('/api/user-data', requireJWTAuth, attachUser, handler);

// Admin-only route
app.get('/api/admin', requireJWTAuth, attachUser, requireAdmin, handler);
```

### Security Best Practices

1. **Never commit** `.env` file or secrets to git
2. **Use HTTPS** in production (enforced by Neon)
3. **Validate input** with Zod schemas before database operations
4. **Sanitize output** when displaying user-generated content
5. **Rate limiting**: Consider implementing for public endpoints
6. **CORS**: Configured in `server/index.ts` for allowed origins
7. **SQL Injection**: Prevented by Drizzle ORM parameterized queries

### Environment Variables Security

Required variables in `.env`:
```
DATABASE_URL=postgresql://...
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
OPENAI_API_KEY=...
JWT_SECRET=... (generate with: openssl rand -base64 32)
SUPABASE_URL=...
SUPABASE_KEY=...
```

---

## AI Integration

### OpenAI GPT-4o Setup

**Model**: `gpt-4o` (GPT-4 Optimized)
- **Context window**: 128K tokens
- **Max completion**: 4096 tokens
- **Temperature**: 0.7 (balanced creativity)
- **Top P**: 1.0

### Conversation Flow

```typescript
// 1. User sends message
POST /api/chat
{
  "message": "How's my recovery today?",
  "userId": "whoop_123"
}

// 2. Server builds context
const context = await buildContextPack(userId);
// Includes: WHOOP data, calendar, goals, meal history

// 3. Compose system prompt
const systemPrompt = await composeSystemPrompt(user, context);

// 4. Prepare messages
const messages = [
  { role: 'system', content: systemPrompt },
  ...conversationHistory,
  { role: 'user', content: message }
];

// 5. Call OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  temperature: 0.7
});

// 6. Store conversation + return response
```

### Context Packing (`contextPack.ts`)

Aggregates user data for AI:
- **WHOOP data**: Last 7 days of recovery, sleep, strain
- **Calendar**: Upcoming events from iCal feeds
- **Goals**: Active user goals and progress
- **Meal history**: Recent meals with photos
- **Profile**: User preferences, health metrics

### Persona Composition (`personaComposer.ts`)

Generates dynamic system prompts:
- **Base persona**: Health coach, motivational, data-driven
- **User-specific**: Incorporates goals, preferences, WHOOP data
- **Context-aware**: Adjusts based on recovery score, sleep quality
- **Actionable**: Provides specific recommendations

### Token Management

- **Conversation history**: Stored in memory (consider moving to database)
- **Token counting**: Estimated before API call
- **Cost tracking**: Logged for monitoring
- **Truncation**: Older messages removed if approaching limit

### Error Handling

```typescript
try {
  const response = await openai.chat.completions.create(...);
} catch (error) {
  if (error.status === 429) {
    // Rate limit - retry with exponential backoff
  } else if (error.status === 500) {
    // OpenAI server error - retry once
  } else {
    // Other errors - return friendly message
  }
}
```

---

## Testing & Quality

### Current State
- **No formal testing framework** currently implemented
- **TypeScript** provides compile-time type safety
- **Zod validation** ensures runtime data validation
- **Manual testing** via development workflow

### Recommended Testing Strategy

**Unit Tests** (Future):
- Test services: `whoopApiService`, `chatService`, `userService`
- Framework: Jest or Vitest
- Coverage goal: 70%+ for critical paths

**Integration Tests** (Future):
- Test API endpoints with supertest
- Mock WHOOP API and OpenAI responses
- Test database operations with test database

**E2E Tests** (Future):
- Playwright or Cypress for web frontend
- Detox for React Native mobile app
- Critical user flows: login, dashboard, chat

### Type Safety

TypeScript configuration (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Run type checking: `npm run check`

### Code Quality Tools

**Recommended** (not yet implemented):
- ESLint for linting
- Prettier for formatting
- Husky for pre-commit hooks
- lint-staged for staged file linting

---

## Deployment

### Production Build

```bash
# Build frontend and backend
npm run build

# Output:
# - dist/client/ (Vite build)
# - dist/index.js (esbuild backend bundle)

# Run production server
NODE_ENV=production node dist/index.js
```

### Environment Configuration

**Production checklist**:
- [ ] Set `NODE_ENV=production`
- [ ] Use production `DATABASE_URL` (Neon)
- [ ] Set secure `JWT_SECRET` (32+ random bytes)
- [ ] Configure CORS for production domain
- [ ] Enable HTTPS (required for WHOOP OAuth)
- [ ] Set up logging (consider Sentry, LogRocket)
- [ ] Configure rate limiting
- [ ] Enable compression middleware

### Mobile Deployment

**EAS Build** (Expo Application Services):

```bash
cd mobile

# iOS build for TestFlight
eas build --platform ios --profile production

# Android build for Google Play
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

**Configuration**: `mobile/eas.json`
- Node version: 22.11.0 (required for React Native compatibility)
- Build profiles: development, preview, production
- App signing managed by EAS

### Database Migrations

**Drizzle Kit** handles schema migrations:

```bash
# Generate migration SQL
drizzle-kit generate:pg

# Apply migration
drizzle-kit push:pg

# Or use npm script
npm run db:push
```

**Production migration workflow**:
1. Test migration on staging database first
2. Backup production database
3. Run migration during low-traffic window
4. Verify schema changes
5. Monitor for errors

### Hosting Recommendations

- **Backend**: Railway, Render, Fly.io, AWS EC2
- **Database**: Neon (serverless PostgreSQL, already configured)
- **Frontend**: Vercel, Netlify, Cloudflare Pages
- **Mobile**: EAS Build → App Store + Google Play
- **Media Storage**: Supabase Storage (already configured)

---

## Gotchas & Important Notes

### Critical Warnings

1. **WHOOP User IDs**:
   - Format: `whoop_<numeric_id>` (e.g., `whoop_12345`)
   - Used as primary key in `users` table
   - **NEVER** use email or auto-increment IDs for WHOOP users
   - This format is required for WHOOP OAuth to work correctly

2. **JWT Expiration**:
   - Current: 10 years (very long!)
   - **Security concern**: Consider shorter expiration (e.g., 7 days)
   - Implement token refresh mechanism for better security

3. **Session vs JWT**:
   - Backend uses **both** express-session AND JWT
   - Sessions for WHOOP OAuth flow (temporary)
   - JWT for API authentication (persistent)
   - **Do not confuse** the two authentication methods

4. **Database Schema Changes**:
   - **ALWAYS** modify `shared/schema.ts` first
   - Then run `npm run db:push`
   - **NEVER** manually alter the database schema
   - Drizzle ORM will sync automatically

5. **OpenAI API Costs**:
   - GPT-4o is expensive (~$0.01 per 1K tokens)
   - Monitor usage in OpenAI dashboard
   - Consider implementing rate limiting per user
   - Conversation history grows unbounded (memory leak!)

6. **Mobile Environment Variables**:
   - Expo only injects variables at build time
   - Changes require app rebuild (not just restart)
   - Access via `Constants.expoConfig.extra.VAR_NAME`
   - **Do not** use `process.env` in React Native

7. **WHOOP Token Refresh**:
   - Access tokens expire after ~1 hour
   - Refresh tokens expire after 30 days
   - Service handles auto-refresh, but verify logic
   - Check `server/services/whoopApiService.ts:refreshWhoopToken()`

### Common Pitfalls

1. **Wouter Routing**:
   - Uses hash-based routing (`/#/dashboard`)
   - Different from React Router's BrowserRouter
   - JWT token passed via URL hash after OAuth: `/#token=xxx`

2. **React Query Cache**:
   - Data cached by default (staleTime: 0, cacheTime: 5 minutes)
   - Invalidate manually after mutations: `queryClient.invalidateQueries(['key'])`
   - Check `client/src/App.tsx` for QueryClient configuration

3. **Tailwind Class Conflicts**:
   - Use `cn()` utility from `lib/utils.ts` to merge classes
   - Example: `cn('text-red-500', className)` prevents conflicts

4. **TypeScript Module Resolution**:
   - Frontend uses `@/` alias → `client/src/`
   - Backend uses relative imports (no aliases)
   - Check `tsconfig.json` paths configuration

5. **CORS Issues**:
   - Development: Frontend (port 5001) → Backend (port 5000)
   - CORS configured in `server/index.ts` with credentials: true
   - Cookies/sessions require `withCredentials: true` in axios

6. **File Upload Limits**:
   - Images: 10MB max (`multer` configuration)
   - Audio: 25MB max
   - Check `server/routes.ts` for upload middleware setup

7. **Date Handling**:
   - Backend uses Luxon (`luxon`) for timezones
   - Frontend uses date-fns for formatting
   - WHOOP API returns UTC timestamps (ISO 8601)
   - **Always** handle timezone conversions explicitly

### Performance Considerations

1. **Database Queries**:
   - Drizzle ORM doesn't optimize automatically
   - Add indexes for frequently queried columns
   - Use `.limit()` and `.offset()` for pagination
   - Avoid N+1 queries (use joins or batch fetches)

2. **WHOOP API Rate Limits**:
   - Rate limit: 100 requests per minute
   - Implement caching for frequently accessed data
   - Use `whoopData` table to cache results
   - Retry logic in `whoopApiService.ts` handles 429 errors

3. **OpenAI Response Time**:
   - GPT-4o can take 3-10 seconds for complex prompts
   - Implement loading states in UI
   - Consider streaming responses (not implemented)
   - WebSocket for real-time chat updates

4. **Mobile Performance**:
   - React Native list performance: Use FlatList, not .map()
   - Image optimization: Use expo-image with caching
   - Bundle size: Check with `npx expo export` and analyze

### Debugging Tips

1. **Backend Logs**:
   - Check terminal running `npm run dev`
   - Add `console.log()` in services for debugging
   - Consider Winston or Pino for structured logging

2. **Frontend Errors**:
   - React Query DevTools (install separately)
   - Browser console for network requests
   - Vite error overlay in development

3. **Mobile Debugging**:
   - Expo DevTools: Shake device → toggle debug
   - React Native Debugger (standalone app)
   - Expo logs: Check terminal running `npm start`

4. **Database Issues**:
   - Use Drizzle Studio: `npx drizzle-kit studio`
   - Web interface for database inspection
   - Check Neon dashboard for connection issues

### Known Limitations

1. **No WebSocket Authentication**:
   - WebSocket connections not authenticated with JWT
   - **Security risk** for real-time features
   - Implement token-based WS authentication

2. **No Email Verification**:
   - Users created without email verification
   - WHOOP OAuth provides verified emails
   - Consider email verification for admin users

3. **No Password Reset**:
   - No traditional password (OAuth only)
   - If WHOOP account lost, user data inaccessible
   - Consider backup authentication method

4. **Conversation History Storage**:
   - Chat history stored in memory (server restart = lost data)
   - **Implement** database storage for persistence
   - Consider message retention policies

5. **No Multi-tenancy**:
   - Single database for all users
   - Row-level security not implemented
   - Relies on application-level authorization

6. **Mobile Offline Support**:
   - No offline data caching
   - App requires internet connection
   - Consider React Query persistence

---

## Quick Reference

### Useful Commands

```bash
# Development
npm run dev                      # Start dev server
npm run check                    # Type check
npm run db:push                  # Apply schema changes

# Mobile
cd mobile && npm start           # Start Expo
cd mobile && npm run ios         # iOS simulator
cd mobile && npm run android     # Android emulator

# Database
npx drizzle-kit studio           # Open Drizzle Studio
npx drizzle-kit push:pg          # Push schema changes

# Components
npx shadcn@latest add button     # Add UI component
```

### Important URLs

- **Local Web**: http://localhost:5001
- **Local API**: http://localhost:5000
- **WHOOP API Docs**: https://developer.whoop.com/docs/developing
- **OpenAI Docs**: https://platform.openai.com/docs
- **Drizzle Docs**: https://orm.drizzle.team/docs/overview
- **Expo Docs**: https://docs.expo.dev/

### Key Directories

- `/client/src/pages/` - Add new pages here
- `/client/src/components/ui/` - shadcn/ui components
- `/server/services/` - Business logic
- `/server/routes.ts` - API endpoints
- `/shared/schema.ts` - Database schema

### Emergency Contacts

- **WHOOP API Status**: https://status.whoop.com/
- **OpenAI Status**: https://status.openai.com/
- **Neon Status**: https://neonstatus.com/

---

## Version History

- **2025-11-14**: Initial comprehensive documentation created
  - Analyzed codebase structure
  - Documented all major components
  - Added development workflows
  - Included security best practices
  - Listed common tasks and gotchas

---

## Contributing

When modifying this document:
1. Update the "Last Updated" date at the top
2. Add entry to Version History section
3. Keep sections organized and scannable
4. Use code examples where helpful
5. Update Quick Reference if adding new commands
6. Test all command examples before committing

---

**End of CLAUDE.md**

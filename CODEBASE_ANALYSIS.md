# FitSmart Codebase Analysis

## 1. PROJECT OVERVIEW

FitSmart is a full-stack health optimization platform that integrates WHOOP fitness wearable data with AI coaching. It consists of:
- **Frontend (Web)**: React + TypeScript SPA using Wouter for routing
- **Backend**: Express.js REST API with JWT authentication
- **Mobile**: React Native (Expo) application for iOS and Android
- **Database**: PostgreSQL with Drizzle ORM
- **AI Integration**: OpenAI GPT-4o for personalized coaching
- **Health Data**: WHOOP API integration for real-time biometric tracking

### Key Features
- WHOOP OAuth authentication for multi-user support
- Real-time health metrics dashboard (recovery, sleep, strain, HRV)
- AI coaching interface with personalized recommendations
- Calendar integration for training schedules
- Goal tracking and management
- FitScore metric calculation
- Mobile app for on-the-go access
- Admin panel for user management
- Meal tracking with image analysis

---

## 2. DIRECTORY STRUCTURE

```
/FitSmart
├── client/                 # React web frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/        # shadcn/ui Radix UI components (43+ files)
│   │   │   ├── AuthWrapper.tsx
│   │   │   ├── health-metrics.tsx
│   │   │   ├── calendar-management.tsx
│   │   │   ├── whoop-auth.tsx
│   │   │   ├── meal-upload.tsx
│   │   │   └── api-status.tsx
│   │   ├── hooks/          # Custom React hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── use-mobile.tsx
│   │   │   └── use-toast.ts
│   │   ├── lib/            # Utilities and helpers
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   ├── pages/          # Page components
│   │   │   ├── dashboard.tsx (891 lines)
│   │   │   ├── calendar.tsx (401 lines)
│   │   │   ├── admin.tsx (224 lines)
│   │   │   ├── profile.tsx (347 lines)
│   │   │   ├── login.tsx (68 lines)
│   │   │   ├── PrivacyPolicy.tsx
│   │   │   ├── Disclaimer.tsx
│   │   │   └── not-found.tsx
│   │   ├── styles/         # Global styles
│   │   ├── App.tsx         # Main app component with routing
│   │   ├── main.tsx        # Entry point
│   │   └── index.css       # Tailwind CSS
│   ├── index.html
│   ├── public/
│   └── package.json
│
├── server/                 # Express backend
│   ├── index.ts           # Server setup and middleware
│   ├── routes.ts          # API route definitions (3000+ lines)
│   ├── db.ts              # Drizzle database connection
│   ├── authMiddleware.ts  # Auth and role-based access control
│   ├── jwtAuth.ts         # JWT token generation and verification
│   ├── userService.ts     # User CRUD operations
│   ├── whoopApiService.ts # WHOOP API integration (50KB)
│   ├── whoopTokenStorage.ts # Token persistence
│   ├── chatService.ts     # OpenAI integration (49KB)
│   ├── chatSummarizationService.ts # Chat history summarization
│   ├── admin.ts           # CLI admin tools
│   ├── storage.ts         # File/data persistence
│   ├── vite.ts            # Vite/dev server setup
│   ├── prompt/
│   │   └── personaComposer.ts # LLM prompt composition (31KB)
│   └── services/
│       └── contextPack.ts # User context aggregation (10KB)
│
├── mobile/                # React Native (Expo) app
│   ├── App.tsx           # Root component with error boundary
│   ├── app.config.js     # Expo configuration
│   ├── eas.json          # EAS Build configuration
│   ├── assets/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts    # HTTP client with JWT
│   │   │   └── onboarding.ts # Onboarding API
│   │   ├── navigation/
│   │   │   └── OnboardingNavigator.tsx
│   │   ├── screens/
│   │   │   ├── DashboardScreen.tsx (526 lines)
│   │   │   ├── ChatScreen.tsx (1597 lines)
│   │   │   ├── GoalsScreen.tsx (974 lines)
│   │   │   ├── ProfileScreen.tsx (506 lines)
│   │   │   ├── CalendarScreen.tsx (311 lines)
│   │   │   ├── CoachScreen.tsx (746 lines)
│   │   │   ├── HomeScreen.tsx (200 lines)
│   │   │   └── onboarding/
│   │   │       ├── OnboardingWelcome.tsx
│   │   │       ├── OnboardingQuestion.tsx
│   │   │       └── PhaseTransition.tsx
│   │   ├── ui/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Divider.tsx
│   │   │   │   └── index.ts
│   │   │   ├── navigationTheme.ts
│   │   │   └── theme.ts (colors, spacing, typography)
│   │   ├── types/
│   │   │   └── global.d.ts
│   │   └── theme.ts
│   ├── package.json
│   ├── SETUP.md
│   └── START_HERE.md
│
├── shared/               # Shared TypeScript types and schemas
│   └── schema.ts        # Database schema and Zod validators
│
├── migrations/          # Database migrations
│   ├── 2024-add-whoopTokens-unique-idx.sql
│   ├── 2025-add-static-jwt-column.sql
│   └── fix_constraints.sql
│
├── public/              # Static assets
├── uploads/             # User-uploaded files
├── data/                # Local data files
│
├── Configuration Files:
│   ├── package.json          # Root dependencies and scripts
│   ├── tsconfig.json         # TypeScript configuration
│   ├── vite.config.ts        # Vite build configuration
│   ├── tailwind.config.ts    # Tailwind CSS configuration
│   ├── postcss.config.js     # PostCSS configuration
│   ├── drizzle.config.ts     # Database ORM configuration
│   ├── components.json       # shadcn/ui configuration
│   ├── eas.json              # EAS Build configuration
│   ├── openapi.yaml          # OpenAPI/Swagger specification
│   ├── .gitignore            # Git ignore rules
│   └── .replit               # Replit configuration
│
├── Documentation:
│   ├── mobile/SETUP.md
│   ├── mobile/START_HERE.md
│   ├── replit.md
│   └── ai-plugin.json
│
└── CI/CD & Build Artifacts:
    ├── dist/                 # Production build output
    ├── node_modules/
    └── package-lock.json
```

---

## 3. FRONTEND ARCHITECTURE (Web - React)

### 3.1 Routing Architecture
**File**: `client/src/App.tsx`

```typescript
// Uses Wouter for lightweight client-side routing (not Next.js)
<Switch>
  <Route path="/login" component={LoginPage} />
  <Route path="/" component={Dashboard} />
  <Route path="/dashboard" component={Dashboard} />
  <Route path="/calendar" component={CalendarPage} />
  <Route path="/profile" component={Profile} />
  <Route path="/admin" component={AdminPage} />
  <Route path="/privacy" component={PrivacyPolicy} />
  <Route path="/disclaimer" component={Disclaimer} />
  <Route component={NotFound} />
</Switch>
```

**Key Points**:
- Using `wouter` (lightweight alternative to React Router)
- 8 main routes for different application pages
- Protected routes handled by `AuthWrapper` component
- 404 fallback route

### 3.2 Component Organization

**UI Components** (`client/src/components/ui/`):
- 43+ shadcn/ui Radix UI primitive components
- Includes: Button, Card, Dialog, Form, Input, Modal, Dropdown, Accordion, etc.
- Theme: Dark mode with CSS variables
- Built on Tailwind CSS + Radix UI primitives

**Feature Components** (`client/src/components/`):
- `AuthWrapper.tsx` - Forces WHOOP OAuth authentication
- `health-metrics.tsx` - Displays WHOOP data metrics
- `whoop-auth.tsx` - WHOOP OAuth flow
- `calendar-management.tsx` - Calendar event management
- `meal-upload.tsx` - Image upload for meal tracking
- `api-status.tsx` - API health monitoring

### 3.3 Pages

| Page | Purpose | Lines | Key Features |
|------|---------|-------|--------------|
| **Dashboard** | Main metrics view | 891 | Circular progress animations, CountUp component, real-time WHOOP data, FitScore forecast |
| **Calendar** | Training schedule | 401 | iCal parsing, event management, timezone support |
| **Profile** | User settings | 347 | Display name, goals, preferences, WHOOP integration |
| **Admin** | User management | 224 | Admin-only access, user CRUD, token management |
| **Login** | Authentication | 68 | Redirects to WHOOP OAuth |
| **Privacy/Disclaimer** | Legal | 154+49 | Static legal content |

### 3.4 Hooks

**`useAuth.ts`**:
```typescript
// JWT token validation and management
- Checks token in URL hash (OAuth callback)
- Validates token expiration
- Provides: user, isAuthenticated, isAuthLoading, logout()
- Handles token refresh logic
```

**`use-toast.ts`** (shadcn):
- Toast notification system
- Toast creation and dismissal

**`use-mobile.tsx`**:
- Responsive design utility hook

### 3.5 Data Fetching

**`lib/queryClient.ts`**:
```typescript
// React Query configuration with JWT support
- Automatic JWT token injection from localStorage
- Default query options: no refetch, infinite staleTime
- 401 handling (throw or return null)
- CORS with credentials
```

**Pattern**:
```typescript
const { data } = useQuery({
  queryKey: ['/api/whoop/today'],
  queryFn: () => apiRequest('/api/whoop/today'),
});
```

### 3.6 Styling

**Technology Stack**:
- Tailwind CSS v3.4 with custom theme
- Tailwind CSS Animate plugin
- Dark mode support (class-based)
- CSS variables for theming

**Custom Theme Variables**:
- Background, foreground, card, popover, primary, secondary, muted, accent
- Destructive (error), border, input, ring colors
- Chart colors (5 variants)
- Sidebar colors (when used)

---

## 4. BACKEND ARCHITECTURE (Express.js)

### 4.1 Server Setup

**File**: `server/index.ts`

```typescript
// Express app configuration
- Port: 5000 (fixed, only non-firewalled port)
- JWT middleware: Automatically extracts token from Authorization header
- CORS: Configured for Replit deployment (localhost, *.replit.app, *.replit.dev)
- Request logging: All /api routes logged with response times
- Error handling: Centralized error response handler
- Vite integration: Serves SPA in production
```

### 4.2 API Routes

**File**: `server/routes.ts` (~3000 lines)

**Authentication Routes**:
```
GET    /api/auth/me                 - Check current user
GET    /api/auth/login              - OAuth redirect
POST   /api/auth/login              - Local login (deprecated)
POST   /api/auth/logout             - Logout
POST   /api/auth/register           - Register (deprecated)
GET    /api/auth/static-jwt         - Get static JWT for Custom GPT
```

**WHOOP Integration**:
```
GET    /api/whoop/login             - Start OAuth flow
GET    /api/whoop/callback          - OAuth callback handler
GET    /api/whoop/today             - Today's metrics
GET    /api/whoop/yesterday         - Yesterday's metrics
GET    /api/whoop/weekly            - 7-day summary
GET    /api/whoop/monthly-comparison- Monthly comparison
GET    /api/whoop/raw               - Raw WHOOP data
GET    /api/whoop/status            - Token status
GET    /api/whoop/n8n               - n8n webhook integration
GET    /api/whoop/refresh-tokens    - Background token refresh
POST   /api/whoop/test-token-refresh- Token refresh testing
POST   /api/whoop/test-session      - Session testing
```

**AI Chat**:
```
POST   /api/chat                    - Send chat message
POST   /api/chat/transcribe         - Transcribe audio
POST   /api/chat/persona-test       - Test persona prompts
POST   /api/chat/outlook-test       - Test calendar integration
POST   /api/chat/roast-test         - Test roast mode
GET    /api/chat/test               - Chat health check
```

**FitScore Calculation**:
```
POST   /api/ai/fitscore             - Calculate FitScore
GET    /api/fitscore/forecast       - FitScore forecast
GET    /api/fitscore/history        - FitScore history
```

**Goals Management**:
```
GET    /api/goals                   - List user goals
POST   /api/goals                   - Create goal
PATCH  /api/goals/:id               - Update goal
DELETE /api/goals/:id               - Delete goal
```

**User Management**:
```
GET    /api/users/me                - Current user profile
GET    /api/users/settings          - User settings
PATCH  /api/users/settings          - Update settings
```

**Admin Routes** (requireAdmin middleware):
```
POST   /api/admin/users             - Create user
GET    /api/admin/users             - List all users
PATCH  /api/admin/users/:userId     - Update user
DELETE /api/admin/users/:userId     - Delete user
POST   /api/admin/users/:userId/whoop-token - Add WHOOP token
```

**Image Upload**:
```
POST   /api/images/upload           - Upload meal image (multer)
```

**System**:
```
GET    /api/health                  - Health check
GET    /api/test/jwt                - JWT test endpoint
GET    /api/session/debug           - Session debugging
```

### 4.3 Authentication & Authorization

**JWT-Based Authentication**:

**File**: `server/jwtAuth.ts`
```typescript
// Token format
{
  whoopId: string;      // WHOOP user ID
  role: "user" | "admin";
  exp: number;          // Expiration (10 years for set-and-forget)
}

// Functions
- generateJWT(whoopId, role) → token
- verifyJWT(token) → payload | null
- jwtAuthMiddleware() → sets req.userId, req.role
- requireJWTAuth() → 401 if no token
```

**File**: `server/authMiddleware.ts`
```typescript
// Middleware exports
- requireAuth() → calls requireJWTAuth()
- attachUser() → populates req.user object
- getCurrentUserId() → gets user ID from request
- requireAdmin() → 403 if not admin role
```

**OAuth Flow**:
1. User visits `/api/whoop/login`
2. Redirects to WHOOP OAuth authorize endpoint
3. User grants permissions
4. Callback to `/api/whoop/callback` with auth code
5. Server exchanges code for WHOOP access token
6. Creates or updates user in database
7. Generates JWT token
8. Redirects with token in URL fragment: `/#token=<jwt>`
9. Frontend captures token and stores in localStorage

### 4.4 Database Access

**File**: `server/db.ts`
```typescript
// Drizzle ORM with Neon serverless PostgreSQL
- Uses Neon for WebSocket-based connection pooling
- DB instance exported as singleton
- Schema imported from shared/schema.ts
```

### 4.5 Key Services

#### **User Service** (`server/userService.ts`)
```typescript
class UserService {
  createWhoopUser(id, email, whoopUserId) → User
  getUserByEmail(email) → User | undefined
  getUserById(userId) → User | undefined
  getAllUsers() → User[]
  addWhoopToken(userId, accessToken, refreshToken?, expiresAt?)
  getWhoopToken(userId) → WhoopToken | undefined
  deleteUser(userId)
  updateUserDisplayName(userId, displayName)
}
```

#### **WHOOP API Service** (`server/whoopApiService.ts`, 50KB)
```typescript
// Handles WHOOP OAuth and data fetching
- OAuth token refresh logic
- Polling for latest metrics
- Data transformation to app format
- Error handling with retry logic

Methods:
- getTodaysData(userId) → WhoopTodayResponse
- getYesterdaysData(userId) → Yesterday metrics
- getWeeklyStats(userId) → 7-day aggregates
- getMonthlyComparison(userId) → Month comparison
- getValidWhoopToken(userId) → Refreshes if needed
```

#### **Chat Service** (`server/chatService.ts`, 49KB)
```typescript
// OpenAI integration with persona management
- System prompt: FitSmart Coach persona
- Context: User WHOOP data, goals, calendar
- Models: GPT-4o for responses
- Features:
  - Automatic emoji injection
  - Response validation
  - Error handling and retry logic
  - Rate limiting awareness

Methods:
- sendChat(options: SendChatOptions) → ChatResponse
- Error types: CONFIG, VALIDATION, OPENAI, NETWORK, RATE_LIMIT
```

#### **Chat Summarization Service** (`server/chatSummarizationService.ts`)
```typescript
// Summarizes chat history for context
- Periodic summarization of old messages
- Context-aware summaries
- Reduces token usage for long conversations
```

#### **WHOOP Token Storage** (`server/whoopTokenStorage.ts`)
```typescript
// Persistent token management
class WhoopTokenStorage {
  getToken(userId) → WhoopTokenData | null
  setToken(userId, tokenData) → void
  Methods handle:
  - Token expiration dates
  - Static JWT for Custom GPT
  - Database persistence
}
```

#### **Context Pack Service** (`server/services/contextPack.ts`, 10KB)
```typescript
// Aggregates all user context for AI
interface ContextPack {
  date: string;
  recoveryScore, sleepScore, strainScore, hrv, rhr, sleepHours: number | null;
  // Yesterday's metrics
  yesterdayRecovery, yesterdaySleep, yesterdayStrain, yesterdayHrv: number | null;
  // Weekly averages
  weeklyAvgRecovery, weeklyAvgSleep, weeklyAvgStrain, weeklyAvgHrv: number | null;
  // User profile
  goalShort, goalLong, trainingFrequency, injuries, tone: string | null;
  currentFitScore: number | null;
  nextTraining: string | null;
  recentSummary, trendNotes: string | null;
}

buildContextPack(userId) → ContextPack
```

#### **Persona Composer** (`server/prompt/personaComposer.ts`, 31KB)
```typescript
// Dynamically builds LLM system and user prompts
// FitSmart persona definition:
// - Warm but objective
// - Expert in exercise physiology
// - Data-informed but human-centered
// - Conversational tone with strategic emojis

Methods:
- composePersonaPrompt(contextPack) → system prompt
- composeFitScorePrompt(contextPack) → detailed analysis
- buildMessagesArray(history) → message format for OpenAI

Config:
- PERSONA_LLM_CONFIG: temperature 0.75, maxTokens 1100
- FITSCORE_LLM_CONFIG: temperature 0.7, maxTokens 2000
```

### 4.6 File Upload Handling

**Multer Configuration**:
```typescript
// Image uploads
- Destination: ./uploads directory
- File limit: 10MB
- Allowed: image/* only
- Naming: meal_<timestamp>.<ext>

// Audio uploads (voice messages)
- Storage: Memory (for immediate processing)
- File limit: 25MB
- Allowed: audio/*, audio/webm, audio/flac, etc.
```

---

## 5. DATABASE SCHEMA & MODELS

**File**: `shared/schema.ts`

**Database**: PostgreSQL with Drizzle ORM

### 5.1 Tables

#### **users**
```typescript
pgTable("users", {
  id: text().primaryKey(),           // "whoop_<id>"
  email: text().notNull().unique(),
  whoopUserId: text().notNull(),     // Numeric WHOOP ID
  displayName: text(),
  role: text().default("user"),      // "user" | "admin"
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})
```

#### **whoopTokens**
```typescript
pgTable("whoop_tokens", {
  userId: text().primaryKey()        // FK → users.id
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text().notNull(),
  refreshToken: text(),
  expiresAt: timestamp(),
  staticJwt: text(),                 // For Custom GPT
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})
```

#### **meals**
```typescript
pgTable("meals", {
  id: serial().primaryKey(),
  userId: text().notNull()           // FK → users.id
    .references(() => users.id, { onDelete: 'cascade' }),
  filename: text().notNull(),
  originalName: text().notNull(),
  mimetype: text().notNull(),
  size: integer().notNull(),
  uploadedAt: timestamp().defaultNow(),
  date: text().notNull(),            // YYYY-MM-DD format
})
```

#### **whoopData**
```typescript
pgTable("whoop_data", {
  userId: text().notNull()           // FK → users.id
    .references(() => users.id, { onDelete: 'cascade' }),
  date: text().notNull(),            // YYYY-MM-DD format
  recoveryScore: integer().notNull(),
  sleepScore: integer().notNull(),
  strainScore: real().notNull(),
  restingHeartRate: integer().notNull(),
  sleepHours: real(),
  hrv: real(),
  respiratoryRate: real(),
  skinTempCelsius: real(),
  spo2Percentage: real(),
  averageHeartRate: integer(),
  lastSync: timestamp().defaultNow(),
}, (table) => ({
  pk: { name: "whoop_data_pkey", columns: [table.userId, table.date] }
}))
```

#### **userCalendars**
```typescript
pgTable("user_calendars", {
  id: serial().primaryKey(),
  userId: text().notNull()           // FK → users.id
    .references(() => users.id, { onDelete: 'cascade' }),
  calendarUrl: text().notNull(),
  calendarName: text().notNull(),
  isActive: boolean().default(true),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})
```

### 5.2 Zod Schemas

```typescript
// Input validation schemas using drizzle-zod
insertUserSchema, insertMealSchema, insertWhoopDataSchema,
insertWhoopTokenSchema, insertUserCalendarSchema

// Type exports
type User, type InsertUser, type Meal, type InsertMeal,
type WhoopData, type InsertWhoopData, type WhoopToken,
type InsertWhoopToken, type UserCalendar, type InsertUserCalendar
```

### 5.3 Relationships
```
users (1) ←→ (Many) whoopTokens  [One token per user, cascade delete]
users (1) ←→ (Many) meals         [Meal uploads, cascade delete]
users (1) ←→ (Many) whoopData     [Historical WHOOP data, cascade delete]
users (1) ←→ (Many) userCalendars [Calendar integrations, cascade delete]
```

---

## 6. MOBILE APP ARCHITECTURE (React Native - Expo)

### 6.1 App Structure

**File**: `mobile/App.tsx`

```typescript
// Root component structure
<ErrorBoundary>
  <NavigationContainer>
    {onboardingComplete ? <MainTabs /> : <OnboardingNavigator />}
  </NavigationContainer>
</ErrorBoundary>

// Main tabs (after onboarding)
- Home (DashboardScreen)
- Goals (GoalsScreen)
- Calendar (CalendarScreen)
- Profile (ProfileScreen)
- Coach (ChatScreen)
```

### 6.2 Navigation Structure

**Bottom Tab Navigator**:
- Home: Dashboard with FitScore and metrics
- Goals: Goal creation and tracking
- Calendar: Event management
- Profile: User settings and preferences
- Coach: AI chat interface

**Onboarding Navigator**:
- OnboardingWelcome: Introduction
- OnboardingQuestion: Multi-phase questionnaire
- PhaseTransition: Phase completion screens

### 6.3 Key Screens

| Screen | Lines | Purpose | Key Features |
|--------|-------|---------|--------------|
| **DashboardScreen** | 526 | Main metrics view | FitScore pulse ring, today's stats, animations |
| **ChatScreen** | 1597 | AI coaching | Message input, conversation history, voice support |
| **GoalsScreen** | 974 | Goal management | CRUD operations, tracking, categorization |
| **ProfileScreen** | 506 | User settings | Profile info, preferences, authentication |
| **CalendarScreen** | 311 | Event management | Event list, date navigation |
| **CoachScreen** | 746 | Coach persona | Specific coaching interactions |
| **HomeScreen** | 200 | Alternative home | Placeholder implementation |

### 6.4 API Integration

**File**: `mobile/src/api/client.ts`

```typescript
// Configuration
- SecureStore for JWT token persistence
- Environment variable resolution (EXPO_PUBLIC_API_URL)
- ngrok tunnel URL support for development
- Static JWT seed for development

Functions:
- setAuthToken(token) → SecureStore
- getAuthToken() → SecureStore | DEV_STATIC_JWT
- clearAuthToken()
- apiRequest<T>(path, options) → T
  - Automatic JWT injection
  - Error handling with network checks
  - Response parsing with fallbacks

const API_BASE_URL = resolveApiBaseUrl() // Priority order
1. EXPO_PUBLIC_API_URL from app.json
2. EXPO_PUBLIC_API_BASE_URL env var
3. Config extra
4. Legacy manifest extra
5. Throws error if not found
```

**File**: `mobile/src/api/onboarding.ts`

```typescript
// Onboarding API
interface OnboardingQuestion {
  id, phase, question, type, options, required, fieldName, order
}

Functions:
- getOnboardingStatus() → OnboardingStatus
- submitAnswer(questionId, answer) → SubmitAnswerResponse
- getDetailedStatus() → DetailedStatus (phase completion status)
- getAllQuestions() → Questions by phase
```

### 6.5 Theming

**File**: `mobile/src/theme.ts`

```typescript
export const colors = {
  bgPrimary: '#0f172a',        // Dark background
  bgSecondary: '#1e293b',
  surfaceMute: '#64748b',
  accent: '#06b6d4',           // Cyan accent
  accentLight: '#22d3ee',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  // ... text colors, etc
}

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48
}

export const radii = {
  sm: 6, md: 12, lg: 16, xl: 20
}

export const typography = {
  h1: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  h2: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  h3: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
  title: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyMuted: { fontSize: 14, fontWeight: '400', lineHeight: 20, color: colors.surfaceMute },
  // ... more
}
```

### 6.6 UI Components

**File**: `mobile/src/ui/components/`

```typescript
// Custom components built on React Native
- Button: Customized button with feedback
- Card: Container component
- Divider: Visual separator
- index.ts: Component exports

// Uses Ionicons from @expo/vector-icons
// Built with React Native primitives (View, Text, StyleSheet)
// Theme integration for consistent styling
```

### 6.7 Configuration

**File**: `mobile/app.config.js` (JavaScript config for env vars)

```javascript
module.exports = {
  expo: {
    name: "FitScoreAI",
    slug: "fitscoreai",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/chatgpt-icon.png",
    userInterfaceStyle: "dark",
    
    // Platform-specific
    ios: {
      bundleIdentifier: "com.fitscoreai.app",
      infoPlist: {
        NSCameraUsageDescription: "...",
        NSMicrophoneUsageDescription: "...",
        NSPhotoLibraryUsageDescription: "...",
      }
    },
    android: {
      package: "com.fitscoreai.app",
      adaptiveIcon: { ... }
    },
    
    // Environment config
    extra: {
      staticJwt: process.env.EXPO_PUBLIC_STATIC_JWT || "...",
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ||
        "https://greyson-bilgiest-sandy.ngrok-free.app",
      EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV || "development",
      eas: { projectId: "d07a5ca5-63a8-4f29-ae5f-3929eeb51998" }
    }
  }
}
```

**File**: `mobile/eas.json` (EAS Build configuration)

```json
{
  "cli": { "version": ">= 16.27.0", "projectDir": "./mobile" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "node": "22.11.0" },
    "preview": { "distribution": "internal", "node": "22.11.0" },
    "production": { "autoIncrement": true, "node": "22.11.0" }
  },
  "submit": { "production": {} }
}
```

---

## 7. TECHNOLOGY STACK

### Frontend (Web)
- **Framework**: React 18.3.1
- **Build Tool**: Vite 5.4.14
- **Language**: TypeScript 5.6.3
- **Routing**: Wouter 3.3.5 (lightweight alternative to React Router)
- **State Management**: React Query 5.60.5 (TanStack Query)
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 3.4.17
- **Form Handling**: React Hook Form 7.55.0 + Zod validation
- **Icons**: Lucide React 0.453.0
- **Animations**: Framer Motion 11.13.1
- **Calendar**: React Big Calendar 1.19.4
- **Charts**: Recharts 2.15.2
- **HTTP Client**: Fetch API with custom wrapper
- **Date/Time**: Luxon 3.6.1, date-fns 3.6.0

### Backend
- **Framework**: Express.js 4.21.2
- **Language**: Node.js (20+) / TypeScript 5.6.3
- **Database**: PostgreSQL + Drizzle ORM 0.39.1
- **Database Pool**: Neon serverless with WebSocket
- **Validation**: Zod 3.24.2
- **Authentication**: JWT (jsonwebtoken 9.0.2), Passport 0.7.0
- **Session Management**: express-session 1.18.2, connect-pg-simple 10.0.0
- **File Upload**: Multer 2.0.1
- **CORS**: cors 2.8.5
- **API Integration**: Axios 1.10.0
- **Password Hashing**: bcrypt 6.0.0
- **OpenAI Integration**: Custom (gpt-4o model via fetch)
- **Calendar Parsing**: ical 0.8.0, node-ical 0.20.1, rrule 2.8.1
- **Time Zones**: moment-timezone 0.6.0
- **OAuth**: openid-client 6.6.2
- **WebSockets**: ws 8.18.0

### Mobile (React Native)
- **Framework**: React Native 0.81.4
- **Platform**: Expo 54.0.12
- **Language**: TypeScript 5.4.5
- **Navigation**: React Navigation 6.1.18
- **Bottom Tabs**: @react-navigation/bottom-tabs 6.5.20
- **Icons**: Ionicons (@expo/vector-icons)
- **Date/Time**: dayjs 1.11.18
- **Secure Storage**: expo-secure-store 15.0.7
- **File System**: expo-file-system 19.0.8
- **Camera**: expo-image-picker 17.0.8
- **Clipboard**: expo-clipboard 8.0.7
- **Audio**: expo-av 16.0.7
- **Chat**: react-native-gifted-chat 2.8.1
- **Calendar**: react-native-calendars 1.1313.0
- **Markdown**: react-native-markdown-display 7.0.2
- **Gesture Handling**: react-native-gesture-handler 2.28.0
- **Animations**: react-native-reanimated 4.1.1
- **Safe Area**: react-native-safe-area-context 5.6.0
- **Keyboard Control**: react-native-keyboard-controller 1.18.5

### DevOps & Deployment
- **Build Tool**: ESBuild 0.25.0 (for server production build)
- **Type Checking**: TypeScript 5.6.3 (tsc)
- **Database Migrations**: Drizzle Kit 0.30.4
- **Package Manager**: npm (Node 22.11.0 recommended)
- **Deployment Platform**: Replit (or any Node.js hosting)
- **Mobile Build**: EAS Build (Expo Application Services)
- **CI/CD**: GitHub (if using git-based deployment)

### Database
- **Type**: PostgreSQL relational database
- **Pool Provider**: Neon (serverless PostgreSQL)
- **ORM**: Drizzle ORM (type-safe, migration-free)
- **Schema**: TypeScript-based schema definition

---

## 8. KEY PATTERNS & CONVENTIONS

### 8.1 Project Organization Patterns

#### **Code Structure**
- **Modular**: Features organized by type (components, hooks, pages, services)
- **Shared Types**: Central `shared/schema.ts` for database schema + API types
- **Service Layer**: Business logic in `services/` and standalone files (`whoopApiService.ts`, `chatService.ts`)
- **Middleware Pattern**: Express middleware for auth, logging, CORS

#### **File Naming**
- **Components**: PascalCase for `.tsx` files (e.g., `DashboardScreen.tsx`)
- **Hooks**: camelCase with "use" prefix (e.g., `useAuth.ts`)
- **Services**: camelCase or class-based (e.g., `whoopApiService.ts`, `UserService`)
- **Pages**: camelCase (e.g., `dashboard.tsx`, `calendar.tsx`)
- **Types**: Interfaces/types in same file or `schema.ts` (e.g., `WhoopTodayResponse`)

#### **Directory Depth**
- **Frontend**: 3-4 levels deep (client/src/components/ui/button.tsx)
- **Backend**: Flat with services folder (server/routes.ts, server/services/contextPack.ts)
- **Mobile**: 3 levels (mobile/src/screens/DashboardScreen.tsx)

### 8.2 Database & ORM Patterns

#### **Drizzle ORM Usage**
```typescript
// Define schema in shared/schema.ts
export const users = pgTable("users", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  // ...
});

// Import and use with Drizzle
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Query
const [user] = await db.select().from(users).where(eq(users.id, id));

// Insert
await db.insert(users).values(insertData).returning();

// Update
await db.update(users).set(updateData).where(eq(users.id, id));

// Delete
await db.delete(users).where(eq(users.id, id));
```

#### **Zod Validation Pattern**
```typescript
// Define schema with Drizzle
const insertUserSchema = createInsertSchema(users).pick({
  id: true, email: true, whoopUserId: true, role: true
});

// Export as type
type InsertUser = z.infer<typeof insertUserSchema>;
```

#### **Type Safety**
- All database models have both `Insert` and `Select` type variants
- Zod schemas for input validation on API endpoints
- Shared types between frontend and backend

### 8.3 API Route Patterns

#### **Express Route Structure**
```typescript
// Pattern 1: Simple GET with middleware
app.get('/api/endpoint', requireJWTAuth, async (req, res) => {
  const userId = getCurrentUserId(req);
  try {
    const data = await someService.getData(userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pattern 2: POST with validation
app.post('/api/endpoint', requireJWTAuth, async (req, res) => {
  try {
    const validated = insertSchema.parse(req.body);
    const result = await service.create(validated);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: 'Validation failed' });
  }
});

// Pattern 3: Multer file upload
app.post('/api/upload', requireJWTAuth, upload.single('file'), async (req, res) => {
  const userId = getCurrentUserId(req);
  const file = req.file;
  // Process file
});
```

#### **Middleware Pattern**
```typescript
// Auth middleware chain
app.get('/api/protected', requireJWTAuth, attachUser, async (req, res) => {
  // req.userId and req.user available
});

// Admin-only routes
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  // Verified admin access
});
```

### 8.4 Frontend Pattern

#### **Component Pattern**
```typescript
// Functional component with hooks
function MyComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/endpoint'],
    queryFn: () => apiRequest('/api/endpoint'),
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorComponent />;
  
  return <div>Content: {data}</div>;
}

// Export default for routing
export default MyComponent;
```

#### **Form Pattern**
```typescript
// React Hook Form with Zod validation
function MyForm() {
  const form = useForm<InsertSchema>({
    resolver: zodResolver(insertSchema),
  });

  const onSubmit = async (data: InsertSchema) => {
    const result = await apiRequest('/api/endpoint', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Handle result
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="fieldName" control={form.control} render={...} />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

#### **Query Pattern**
```typescript
// React Query with error handling
const { data, isLoading, isError, error, refetch } = useQuery({
  queryKey: ['/api/data'],
  queryFn: () => apiRequest('/api/data'),
  retry: 3,                    // Retry on failure
  staleTime: 5 * 60 * 1000,   // 5 minutes
  refetchInterval: false,      // No auto-refetch
});

// Mutations
const { mutate, isPending } = useMutation({
  mutationFn: (data) => apiRequest('/api/data', { method: 'POST', body }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/data'] }),
  onError: (error) => toast({ title: 'Error', description: error.message }),
});
```

### 8.5 Authentication Pattern

#### **WHOOP OAuth Flow**
```
User clicks "Login" → /api/whoop/login (redirects to WHOOP)
  ↓ (WHOOP OAuth consent screen)
User authorizes → /api/whoop/callback (with auth code)
  ↓ (Server exchanges code for token)
Server creates/updates user, generates JWT
  ↓ (Redirects with token in URL fragment)
Frontend captures token, stores in localStorage
  ↓ (Includes in Authorization header for API calls)
Protected routes use JWT_SECRET to verify
```

#### **JWT Token Structure**
```typescript
{
  whoopId: "whoop_12345678",   // WHOOP user identifier
  role: "user" | "admin",      // Role-based access
  exp: 2074853733,             // 10 years in future
  iat: 1759493733              // Issued at
}

// Usage
Authorization: Bearer eyJhbGci...
// Server verifies signature and expiration
// Sets req.userId = payload.whoopId, req.role = payload.role
```

### 8.6 Service Layer Pattern

#### **Service Class Pattern**
```typescript
export class SomeService {
  // Public methods
  async publicMethod(param: string): Promise<Result> {
    try {
      const data = await this.internalMethod(param);
      return { success: true, data };
    } catch (error) {
      console.error('Error:', error);
      throw new Error('User-friendly error message');
    }
  }

  // Private/internal methods
  private async internalMethod(param: string): Promise<any> {
    // Implementation
  }
}

// Export singleton
export const someService = new SomeService();
```

#### **Error Handling Pattern**
```typescript
enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

class CustomError extends Error {
  constructor(public type: ErrorType, message: string) {
    super(message);
    this.name = 'CustomError';
  }
}

// Usage
try {
  const result = await operation();
} catch (error) {
  if (error instanceof CustomError) {
    res.status(getStatusCode(error.type)).json({ type: error.type, message: error.message });
  } else {
    res.status(500).json({ type: 'UNKNOWN_ERROR', message: 'Internal server error' });
  }
}
```

### 8.7 Mobile Pattern

#### **Navigation Pattern**
```typescript
// Navigator setup
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          // Icon logic
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
```

#### **Screen Component Pattern**
```typescript
function MyScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        // Cleanup
      };
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await apiRequest('/api/data');
      setData(result);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={...}>
        {/* Content */}
      </ScrollView>
    </SafeAreaView>
  );
}
```

---

## 9. DEVELOPMENT WORKFLOW

### 9.1 Development Scripts

**Root package.json**:
```bash
npm run dev              # Start Express server in development
npm run build            # Build client (Vite) + server (esbuild)
npm start               # Run production build
npm run check           # TypeScript type checking
npm run db:push         # Push schema to database
```

**Mobile package.json**:
```bash
npm start               # Start Expo dev server (local mode)
npm run start:tunnel    # Start Expo dev server (tunnel mode)
npm run ios             # Start + open iOS simulator
npm run ios:tunnel      # Start + open iOS simulator with tunnel
npm run android         # Start + open Android emulator
npm run web             # Start web version
npm run clean           # Clean install (remove node_modules, .expo, reinstall)
```

### 9.2 Build Process

#### **Frontend Build (Web)**
```
Vite development server: Hot reload, preserves imports
Vite production build:
  - Compiles React + TypeScript → JavaScript
  - Bundles with code splitting
  - Minifies CSS
  - Generates dist/public/

Output: dist/public/index.html, dist/public/assets/
```

#### **Backend Build**
```
Development: tsx (TypeScript runner) - direct execution
Production: 
  - Vite build (for static assets)
  - esbuild (for server bundle)
    - Input: server/index.ts
    - Output: dist/index.js
    - Format: ESM (import/export)
    - Platform: Node.js
    - Bundles external dependencies

Output: dist/index.js (executable with node)
```

#### **Mobile Build (EAS)**
```
eas build --platform ios --profile development
eas build --platform ios --profile production

EAS handles:
- Env var injection (EXPO_PUBLIC_*)
- Dependency resolution (Node 22.11.0)
- App signing
- Provisioning profiles
- Builds development/preview/production variants
```

### 9.3 Database Migrations

#### **Drizzle Kit Workflow**
```bash
# Generate migration from schema changes
drizzle-kit generate --dialect postgresql

# Apply migrations to database
drizzle-kit push

# Migration files in /migrations directory
# SQL files auto-generated, no manual SQL needed
```

#### **Schema Updates**
```
1. Edit shared/schema.ts
2. Add table, column, or constraint changes
3. Run: npm run db:push
4. Drizzle compares schema vs database
5. Auto-generates and applies SQL migration
```

### 9.4 Local Development Setup

#### **Environment Variables**
```bash
# .env or system environment
DATABASE_URL=postgresql://user:pass@localhost/fitsmart
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key
NODE_ENV=development
WHOOP_CLIENT_ID=your-client-id
WHOOP_CLIENT_SECRET=your-client-secret
```

#### **Backend Startup**
```bash
# Terminal 1: Run backend
npm run dev

# Output:
# [ROUTE] GET /api/whoop/login
# [ROUTE] POST /api/chat
# ... (all routes listed)
# serving on port 5000
```

#### **Frontend Startup**
```bash
# Automatic: Vite dev server started as part of Express
# Serves on same port 5000 at /

# Hot reload enabled: Changes to client/src/* auto-reload
```

#### **Mobile Startup**
```bash
# Terminal 2: From mobile/ directory
npm run ios

# Output:
# Expo CLI version ...
# Metro bundler started ...
# iOS simulator launching...
# ✅ Connected to packager on <localhost:19000>
```

### 9.5 Testing & Debugging

#### **API Testing**
```bash
# Health check
curl http://localhost:5000/api/health

# Protected endpoint (with JWT)
curl -H "Authorization: Bearer YOUR_JWT" http://localhost:5000/api/users/me

# POST with body
curl -X POST http://localhost:5000/api/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hi"}]}'
```

#### **Frontend Debugging**
```
- Browser DevTools (Chrome)
- React DevTools extension
- React Query DevTools (in-page)
- Network tab for API calls
```

#### **Mobile Debugging**
```
- Expo DevTools (press 'i' or 'a' in terminal)
- React Native Debugger
- Console logs in Metro bundler terminal
- AsyncStorage inspection tools
```

---

## 10. CONVENTIONS & BEST PRACTICES

### 10.1 Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Components | PascalCase | `DashboardScreen`, `AuthWrapper` |
| Pages | camelCase | `dashboard.tsx`, `calendar.tsx` |
| Hooks | useXxx | `useAuth`, `useToast`, `useQuery` |
| Services | camelCase or Class | `whoopApiService`, `UserService` |
| Types/Interfaces | PascalCase | `WhoopData`, `ChatResponse` |
| Constants | UPPER_SNAKE_CASE | `JWT_SECRET`, `BASE_URL` |
| Variables | camelCase | `userId`, `isLoading` |
| Database Tables | snake_case | `whoop_data`, `user_calendars` |
| Database Columns | snake_case | `created_at`, `recovery_score` |
| API Routes | /api/[feature]/[action] | `/api/whoop/today`, `/api/chat` |

### 10.2 Error Handling

#### **Frontend**
```typescript
// Try-catch with user feedback
try {
  const data = await apiRequest('/api/endpoint');
} catch (error) {
  toast({
    title: "Error",
    description: error.message || "Something went wrong",
    variant: "destructive"
  });
}

// Query error handling
const { error } = useQuery({
  queryFn: async () => { /* ... */ },
  retry: 3,        // Retry failed requests
  onError: (error) => console.error('Query failed:', error),
});
```

#### **Backend**
```typescript
// Route error handling
try {
  const result = await service.doSomething();
  res.json(result);
} catch (error) {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  res.status(statusCode).json({ error: message });
}

// Middleware error handling (at the end)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  throw err;  // Log to external service
});
```

### 10.3 Logging Conventions

#### **Log Levels & Prefixes**
```typescript
// Frontend
console.log('[AUTH] User authenticated');        // Info level
console.warn('[API] Request failed, retrying');  // Warning level
console.error('[CHAT] OpenAI API error:', err);  // Error level

// Backend
console.log('[ROUTE] GET /api/whoop/today');     // Route info
console.log('[JWT] Authentication successful');  // Auth flows
console.log('[TOKEN SERVICE] Token validation completed');
console.warn('[CTX] Failed to fetch WHOOP data');
console.error('Failed to create user:', error);
```

#### **Structured Logging Format**
```
[COMPONENT] Message with context
[SERVICE] Operation details
[MIDDLEWARE] Request/response info
```

### 10.4 Code Organization

#### **Single Responsibility Principle**
- Each service handles one domain (auth, chat, WHOOP, etc.)
- Each component renders one logical unit
- Middleware does one thing (auth, logging, CORS, etc.)

#### **DRY (Don't Repeat Yourself)**
- Shared types in `shared/schema.ts`
- Common utilities in `lib/utils.ts`
- Reusable hooks in `hooks/`
- Service layer for business logic

#### **Composition Over Inheritance**
- Functional components with hooks
- Service composition (e.g., ChatService uses contextPack)
- Middleware chaining for Express

### 10.5 Type Safety

#### **End-to-End Typing**
```
Database schema (shared/schema.ts)
  ↓ (Drizzle ORM)
API response types (Same file)
  ↓ (HTTP)
Frontend hooks useQuery<T>
  ↓
Component props with TypeScript interfaces
```

#### **Type Export Pattern**
```typescript
// In shared/schema.ts
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// In backend
import type { User, InsertUser } from '@shared/schema';

// In frontend
import type { User } from '@shared/schema';
const { data: user } = useQuery<User>({ ... });
```

---

## 11. KEY FILES REFERENCE

### Critical Files for AI Assistants

| File | Purpose | Lines | Priority |
|------|---------|-------|----------|
| `shared/schema.ts` | Database schema + types | 164 | CRITICAL |
| `server/routes.ts` | API endpoint definitions | 3000+ | CRITICAL |
| `client/src/App.tsx` | Frontend routing | 45 | HIGH |
| `server/index.ts` | Server setup + middleware | 156 | HIGH |
| `server/jwtAuth.ts` | JWT implementation | 87 | HIGH |
| `server/whoopApiService.ts` | WHOOP integration | 50KB | MEDIUM |
| `server/chatService.ts` | OpenAI integration | 49KB | MEDIUM |
| `server/userService.ts` | User CRUD | 126 | MEDIUM |
| `client/src/hooks/useAuth.ts` | Frontend auth | 96 | HIGH |
| `client/src/lib/queryClient.ts` | React Query setup | 70 | HIGH |
| `mobile/src/api/client.ts` | Mobile API client | 147 | MEDIUM |
| `server/services/contextPack.ts` | Context aggregation | 10KB | MEDIUM |
| `client/src/pages/dashboard.tsx` | Main dashboard | 891 | MEDIUM |
| `mobile/App.tsx` | Mobile root | 227 | MEDIUM |

---

## 12. DEPLOYMENT CONFIGURATION

### 12.1 Replit Deployment

**Configuration File**: `.replit`

```yaml
# Specifies run and build commands for Replit environment
run = "npm run dev"          # Development server
build = "npm run build"      # Build for production
```

**Environment Setup**:
- Database: Neon PostgreSQL (provided via DATABASE_URL)
- API Port: 5000 (fixed, only non-firewalled port)
- Trust proxy: Enabled for Replit's reverse proxy

### 12.2 EAS Build (Mobile)

**Configuration**: `mobile/eas.json`

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "node": "22.11.0"
    },
    "production": {
      "autoIncrement": true,
      "node": "22.11.0"
    }
  }
}
```

**Build Process**:
1. Provisions iOS or Android build environment
2. Installs dependencies using Node 22.11.0
3. Injects EXPO_PUBLIC_* environment variables
4. Creates signed IPA (iOS) or APK (Android)
5. Uploads to EAS servers for distribution

### 12.3 Environment Variables

**Server** (from .env or environment):
```
DATABASE_URL              # PostgreSQL connection string
OPENAI_API_KEY           # GPT-4o API key
JWT_SECRET               # JWT signing secret
WHOOP_CLIENT_ID          # WHOOP OAuth client ID
WHOOP_CLIENT_SECRET      # WHOOP OAuth client secret
NODE_ENV                 # development|production
N8N_SECRET_TOKEN         # n8n webhook secret
USER_TZ                  # Default timezone (e.g., Europe/Zurich)
```

**Mobile** (from app.config.js or environment):
```
EXPO_PUBLIC_API_URL      # Backend API base URL
EXPO_PUBLIC_STATIC_JWT   # Development JWT token
EXPO_PUBLIC_ENV          # development|production
```

---

## 13. IMPORTANT ARCHITECTURAL DECISIONS

### 13.1 Why Wouter Instead of React Router?
- **Lighter**: 3KB vs 40KB+
- **Simpler**: Less boilerplate, easier to understand
- **Sufficient**: No complex route features needed
- **Performant**: Minimal re-renders

### 13.2 Why Drizzle ORM Instead of Prisma?
- **Type Safety**: Full TypeScript support without codegen
- **No Runtime**: Lighter, faster
- **Migration-Free**: Schema as source of truth
- **Query Builder**: Flexible query composition
- **Better for Serverless**: Lighter weight, no prisma client

### 13.3 Why JWT Instead of Session Cookies?
- **Stateless**: No server-side session storage needed
- **Mobile-Friendly**: Works with mobile apps and native OAuth
- **Scalable**: No session syncing needed for multiple servers
- **WHOOP Integration**: OAuth tokens stored in JWT

### 13.4 Why Expo for Mobile?
- **Fast Development**: Hot reload, rapid iteration
- **Code Sharing**: React codebase across platforms
- **EAS Build**: Managed build infrastructure
- **No Native Build Tools**: Don't need Xcode/Android Studio locally

### 13.5 Why Tailwind CSS?
- **Utility-First**: Faster development, less CSS boilerplate
- **Consistent Theming**: CSS variables for easy dark mode
- **Mobile-Ready**: Mobile-first responsive design
- **Component Integration**: Works seamlessly with shadcn/ui

---

## 14. COMMON DEVELOPMENT TASKS

### 14.1 Adding a New API Route

```typescript
// 1. Add route handler in server/routes.ts
app.get('/api/new/endpoint', requireJWTAuth, async (req, res) => {
  const userId = getCurrentUserId(req);
  try {
    const data = await someService.getData(userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Add type definitions in shared/schema.ts (if needed)
export interface NewResponse {
  // ...
}

// 3. Use in frontend component
const { data } = useQuery({
  queryKey: ['/api/new/endpoint'],
  queryFn: () => apiRequest<NewResponse>('/api/new/endpoint'),
});
```

### 14.2 Adding a Database Table

```typescript
// 1. Add table to shared/schema.ts
export const newTable = pgTable("new_table", {
  id: serial().primaryKey(),
  userId: text().notNull().references(() => users.id),
  data: text().notNull(),
  createdAt: timestamp().defaultNow(),
});

// 2. Add insert schema
export const insertNewTableSchema = createInsertSchema(newTable).omit({
  id: true,
  createdAt: true,
});

// 3. Push to database
npm run db:push

// 4. Use in service
const newData = await db.insert(newTable).values(insertData).returning();
```

### 14.3 Creating a Custom Hook

```typescript
// hooks/useCustom.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export function useCustom() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/custom'],
    queryFn: () => apiRequest('/api/custom'),
  });

  const { mutate } = useMutation({
    mutationFn: (input: InputType) => apiRequest('/api/custom', { 
      method: 'POST',
      body: JSON.stringify(input)
    }),
  });

  return { data, isLoading, error, mutate };
}

// Use in component
const { data, mutate } = useCustom();
```

---

## 15. TESTING & QA

### 15.1 No Current Testing Setup
- ❌ No Jest, Vitest, or other test frameworks configured
- ❌ No test files found in codebase
- ⚠️ Recommendation: Add unit and integration tests

### 15.2 Manual Testing Approach (Current)
- Test API endpoints with curl or Postman
- Manual browser testing of frontend
- Mobile testing via Expo simulator/device
- Admin CLI for database operations

### 15.3 OpenAPI Documentation
**File**: `openapi.yaml`
- Documents API endpoints
- Includes request/response schemas
- Security schemes (bearer JWT)
- Useful for testing and client generation

---

## 16. KNOWN LIMITATIONS & NOTES

### 16.1 Current Limitations
- No automated tests
- Mobile app in development (incomplete screens)
- WHOOP OAuth requires manual setup in WHOOP developer portal
- Limited error recovery (no circuit breaker pattern)
- No rate limiting on API endpoints

### 16.2 Production Considerations
- Implement request rate limiting
- Add comprehensive error logging (Sentry, etc.)
- Set up database backups
- Implement API request caching strategy
- Add health check monitoring
- Set up alerts for API errors
- Implement request ID tracking for debugging

### 16.3 Security Notes
- JWT tokens use 10-year expiration (set-and-forget, not recommended for production)
- WHOOP tokens stored in database (consider encryption at rest)
- No CSRF protection (using JWT instead of cookies)
- CORS configured permissively for development
- Environment variables should be rotated regularly

---

## 17. DEVELOPER WORKFLOW SUMMARY

### Getting Started
```bash
# 1. Clone and install
git clone <repo>
cd FitSmart
npm install

# 2. Set up environment
export DATABASE_URL="postgresql://..."
export OPENAI_API_KEY="sk-..."
export JWT_SECRET="your-secret"

# 3. Initialize database
npm run db:push

# 4. Start development
npm run dev

# 5. In another terminal, start mobile (optional)
cd mobile
npm run ios
```

### Daily Development
```bash
# Make changes to code
vim client/src/pages/dashboard.tsx

# Frontend hot-reloads automatically
# API calls automatically refresh

# To test API directly
curl -H "Authorization: Bearer $JWT_TOKEN" http://localhost:5000/api/endpoint

# To check types
npm run check

# To rebuild
npm run build
```

### Database Changes
```bash
# Edit shared/schema.ts
# Run migration
npm run db:push

# Changes automatically applied
```

### Deployment
```bash
# Build for production
npm run build

# Output: dist/ directory with web assets and server bundle
# Deploy dist/ to production server
```

---

## CONCLUSION

FitSmart is a well-structured full-stack application with clear separation of concerns:

1. **Frontend**: React SPA with Wouter, React Query, Tailwind CSS
2. **Backend**: Express REST API with JWT auth, service layer for business logic
3. **Database**: PostgreSQL with Drizzle ORM for type-safe queries
4. **Mobile**: React Native with Expo for iOS/Android
5. **AI Integration**: OpenAI GPT-4o for personalized coaching
6. **External APIs**: WHOOP for health data, n8n for webhooks

**For AI Assistants**: Focus on the shared schema (single source of truth), understand the three-layer architecture (routes → services → database), and follow the established patterns for authentication, API routes, and component organization.


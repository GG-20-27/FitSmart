# Recovered API Endpoints

This document lists all the API endpoints recovered from commit `b43dd57`.

---

## FitScore & AI Insights Endpoints

### `POST /api/ai/fitscore`
**Purpose:** Calculate and return daily FitScore with component breakdown

**Auth:** JWT Required (`requireJWTAuth`)

**Request:** Empty body

**Response:**
```json
{
  "title": "✨ Strong Performance",
  "summary": "Your daily performance is balanced. Sleep and recovery are solid...",
  "components": {
    "sleep": 7.5,
    "recovery": 8.2,
    "nutrition": 6.8,
    "strain": 7.0
  },
  "finalScore": 7.4,
  "timestamp": "2025-11-15T10:00:00.000Z"
}
```

**Dependencies:**
- `fitScores` table (MISSING)
- Falls back to mock data in non-production

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~915

---

### `POST /api/ai/outlook`
**Purpose:** Generate morning outlook based on recovery and calendar

**Auth:** JWT Required

**Request:** Empty body

**Response:**
```json
{
  "title": "🌅 Ready to Perform",
  "message": "Your recovery is excellent at 95%. You're well-prepared for today's events...",
  "readiness": 8.1,
  "calendarEvents": [...],
  "weekScore": 7.8,
  "timestamp": "2025-11-15T06:00:00.000Z"
}
```

**Dependencies:**
- `fitScores` table (MISSING)
- WHOOP data
- Calendar events

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~1075

---

### `POST /api/ai/roast`
**Purpose:** Generate weekly performance roast (comedy feedback)

**Auth:** JWT Required

**Request:** Empty body

**Response:**
```json
{
  "title": "Weekly Performance Roast",
  "roast": "Your recovery this week looks like a rollercoaster...",
  "weeklyStats": {
    "avgRecovery": 78,
    "avgStrain": 12.5,
    "avgSleep": 7.2
  },
  "timestamp": "2025-11-15T10:00:00.000Z"
}
```

**Dependencies:**
- `fitScores` table (MISSING)
- Weekly WHOOP data

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~1180

---

### `GET /api/fitscore/forecast`
**Purpose:** Generate FitScore forecast for mobile app dashboard

**Auth:** JWT Required

**Query Params:** None

**Response:**
```json
{
  "forecast": 7.8,
  "factors": {
    "sleep": "Good quality sleep (7.5h)",
    "recovery": "High recovery score (85%)",
    "strain": "Moderate strain (12.3)"
  },
  "insight": "You're well-recovered and ready for a productive day. Consider a moderate workout.",
  "updatedAt": "2025-11-15T08:30:00.000Z"
}
```

**Dependencies:**
- **`fitScoreCalculatorV3` service (MISSING)**
- WHOOP data (today)

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~2050

**Implementation Details:**
```typescript
const forecastInput = {
  sleepHours,
  targetSleepHours: 8.0,
  recoveryPercent: recovery,
  currentHRV: hrv,
  baselineHRV: hrv,
  currentRHR: rhr,
  baselineRHR: rhr,
  strainToday: strain,
  targetStrain: 15.0
};

const { forecast, factors, insight } = await fitScoreCalculatorV3.calculateForecast(forecastInput);
```

---

### `GET /api/fitscore/history`
**Purpose:** Fetch last 7 days of FitScore data with trend analysis

**Auth:** JWT Required

**Query Params:** None

**Response:**
```json
{
  "scores": [
    { "date": "2025-11-08", "score": 7.2 },
    { "date": "2025-11-09", "score": 7.5 },
    { "date": "2025-11-10", "score": 8.1 },
    { "date": "2025-11-11", "score": 7.8 },
    { "date": "2025-11-12", "score": 8.3 },
    { "date": "2025-11-13", "score": 8.0 },
    { "date": "2025-11-14", "score": 8.5 }
  ],
  "weeklyAverage": 7.9,
  "trend": 1.2
}
```

**Trend Calculation:**
```typescript
// Positive trend = improving, Negative = declining
const firstThree = scores.slice(0, 3).reduce((sum, item) => sum + item.score, 0) / 3;
const lastThree = scores.slice(-3).reduce((sum, item) => sum + item.score, 0) / 3;
trend = lastThree - firstThree;
```

**Dependencies:**
- `fitScores` table (MISSING)

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~2110

---

## Meal Management Endpoints

### `POST /api/meals`
**Purpose:** Upload meal photos for nutrition tracking and FitScore calculation

**Auth:** Optional (uses `getCurrentUserId` with fallback)

**Content-Type:** `multipart/form-data`

**Request:**
- Field name: `mealPhotos`
- Max files: 10
- Max size: 10MB per file
- Accepted: Images only (`image/*`)

**Request Example:**
```bash
curl -X POST http://localhost:5000/api/meals \
  -F "mealPhotos=@breakfast.jpg" \
  -F "mealPhotos=@lunch.jpg"
```

**Response:**
```json
{
  "message": "Successfully uploaded 2 meal images",
  "meals": [
    "meal_2025-11-15T08-30-00.jpg",
    "meal_2025-11-15T12-45-00.jpg"
  ]
}
```

**Auto-Trigger:**
After upload, if user has 2+ meals today:
```typescript
const { fitScoreService } = await import('./services/fitScoreService');
await fitScoreService.checkMealTrigger(userId, today);
```

**Dependencies:**
- **`fitScoreService` (MISSING)**
- `meals` table (EXISTS)

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~460

---

### `GET /api/meals/today`
**Purpose:** Get today's uploaded meal photos

**Auth:** Optional

**Query Params:** None

**Response:**
```json
[
  "http://localhost:5000/uploads/meal_2025-11-15T08-30-00.jpg",
  "http://localhost:5000/uploads/meal_2025-11-15T12-45-00.jpg"
]
```

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~520

---

### `GET /api/meals/yesterday`
**Purpose:** Get yesterday's uploaded meal photos

**Auth:** Optional

**Query Params:** None

**Response:**
```json
[
  "http://localhost:5000/uploads/meal_2025-11-14T08-15-00.jpg",
  "http://localhost:5000/uploads/meal_2025-11-14T13-00-00.jpg",
  "http://localhost:5000/uploads/meal_2025-11-14T19-30-00.jpg"
]
```

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~565

---

## Chat & Coach Endpoints

### `POST /api/chat`
**Purpose:** Send message to FitSmart AI coach

**Auth:** JWT Required

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "How's my recovery today?" }
  ],
  "mealImages": ["base64..."],  // Optional
  "includeContext": true         // Optional (default: true)
}
```

**Response:**
```json
{
  "reply": "Your recovery today is excellent at 85%! Your HRV is 93ms...",
  "context": {
    "whoopData": {...},
    "recentSummaries": [...],
    "calendarEvents": [...]
  }
}
```

**Dependencies:**
- `chatService.ts` (RECOVERED)
- `personaComposer.ts` (RECOVERED)
- `contextPack.ts` (RECOVERED)
- **`mealAnalysisService` (MISSING)** - if mealImages provided
- **`fitScoreService` (MISSING)** - if triggering FitScore calc

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~1550

---

### `POST /api/chat/outlook-test`
**Purpose:** Test endpoint for morning outlook generation

**Auth:** JWT Required

**Request:** Empty body

**Response:** Similar to `POST /api/ai/outlook`

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~300

---

### `POST /api/chat/roast-test`
**Purpose:** Test endpoint for weekly roast generation

**Auth:** JWT Required

**Request:** Empty body

**Response:** Similar to `POST /api/ai/roast`

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~350

---

## WHOOP Data Endpoints

### `GET /api/whoop/today`
**Purpose:** Get today's WHOOP metrics

**Auth:** JWT Required

**Response:**
```json
{
  "recovery_score": 85,
  "sleep_score": 92,
  "sleep_hours": 7.8,
  "strain": 12.3,
  "hrv": 93.5,
  "resting_heart_rate": 52,
  "average_heart_rate": 65,
  "sleep_stages": {
    "light_sleep_minutes": 240,
    "deep_sleep_minutes": 90,
    "rem_sleep_minutes": 120,
    "awake_minutes": 18
  },
  "time_in_bed_hours": 8.2,
  "sleep_efficiency_pct": 95,
  "date": "2025-11-15",
  "last_sync": "2025-11-15T08:00:00.000Z"
}
```

**Code Location:** Existing in current codebase

---

### `GET /api/whoop/yesterday`
**Purpose:** Get yesterday's WHOOP metrics

**Auth:** Optional

**Response:** Same structure as `/api/whoop/today`

**Code Location:** Existing in current codebase

---

### `GET /api/whoop/weekly`
**Purpose:** Get 7-day average WHOOP metrics

**Auth:** JWT Required

**Response:**
```json
{
  "avgRecovery": 78.5,
  "avgStrain": 12.8,
  "avgSleep": 7.5,
  "avgHRV": 88.3
}
```

**Code Location:** Existing in current codebase

---

## User & Settings Endpoints

### `GET /api/users/settings`
**Purpose:** Get user preferences for AI features

**Auth:** JWT Required

**Response:**
```json
{
  "estimate_macros_enabled": true,
  "morning_outlook_enabled": true,
  "outlook_time": "06:00",
  "comedy_roast_enabled": false,
  "meal_reminders_enabled": true
}
```

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~400

---

### `PATCH /api/users/settings`
**Purpose:** Update user preferences

**Auth:** JWT Required

**Request:**
```json
{
  "estimate_macros_enabled": true,
  "morning_outlook_enabled": true,
  "outlook_time": "07:00",
  "comedy_roast_enabled": true,
  "meal_reminders_enabled": false
}
```

**Response:**
```json
{
  "message": "Settings updated successfully",
  "settings": {...}
}
```

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~430

---

## Calendar Endpoints

### `GET /api/calendar/events`
**Purpose:** Get calendar events for date range

**Auth:** JWT Required

**Query Params:**
- `start` - Start date (YYYY-MM-DD)
- `end` - End date (YYYY-MM-DD)

**Response:**
```json
{
  "events": [
    {
      "title": "Morning Workout",
      "start": "2025-11-15T06:00:00.000Z",
      "location": "Gym"
    }
  ]
}
```

**Code Location:** Existing in current codebase

---

## Authentication Endpoints

### `GET /api/auth/static-jwt`
**Purpose:** Get long-lived JWT for Custom GPT integration

**Auth:** JWT Required

**Response:**
```json
{
  "static_jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Code Location:** Existing in current codebase

---

## Status & Health Check

### `GET /api/health`
**Purpose:** Check API health and WHOOP connection status

**Auth:** None

**Response:**
```json
{
  "status": "success",
  "message": "✅ FitScore GPT API is running - WHOOP: connected (expires in 12h) - Auto-refresh: enabled"
}
```

**Code Location:** `routes_with_fitscore_endpoints.ts` line ~850

---

## Summary

### Working Endpoints (Recovered):
✅ `POST /api/ai/fitscore` - Requires `fitScores` table
✅ `POST /api/ai/outlook` - Requires `fitScores` table
✅ `POST /api/ai/roast` - Requires `fitScores` table
✅ `GET /api/fitscore/forecast` - **Requires `fitScoreCalculatorV3` service**
✅ `GET /api/fitscore/history` - Requires `fitScores` table
✅ `POST /api/meals` - **Requires `fitScoreService`**
✅ `GET /api/meals/today` - Works with existing schema
✅ `GET /api/meals/yesterday` - Works with existing schema
✅ `POST /api/chat` - **Requires `mealAnalysisService` for meal images**

### Dependencies Required:
🔴 **Critical Missing Services:**
1. `server/services/fitScoreService.ts`
2. `server/services/fitScoreCalculatorV3.ts`
3. `server/services/mealAnalysisService.ts`

🔴 **Critical Missing Schema Tables:**
1. `fitScores` table in `shared/schema.ts`
2. `userGoals` table in `shared/schema.ts`
3. `chatSummaries` table in `shared/schema.ts`

### Existing Endpoints (Still Work):
✅ `GET /api/whoop/today`
✅ `GET /api/whoop/yesterday`
✅ `GET /api/whoop/weekly`
✅ `GET /api/users/settings`
✅ `PATCH /api/users/settings`
✅ `GET /api/calendar/events`
✅ `GET /api/auth/static-jwt`
✅ `GET /api/health`

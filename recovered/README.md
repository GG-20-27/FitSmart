# FitScore Code Recovery

**Recovery Date:** November 15, 2025
**Source Commits:** `b43dd57` (server), `8ac64d3` (mobile)
**Recovery Reason:** Code deleted during secret removal process

---

## 📂 Recovered Files

### Server Code (`/server`)

#### `/server/routes/`
- **`routes_with_fitscore_endpoints.ts`** (from commit `b43dd57`)
  - Complete server routes including FitScore AI endpoints
  - **Includes:**
    - `POST /api/ai/fitscore` - Calculate daily FitScore with components
    - `POST /api/ai/outlook` - Generate morning outlook
    - `POST /api/ai/roast` - Generate weekly performance roast
    - `GET /api/fitscore/forecast` - Mobile FitScore forecast endpoint
    - `GET /api/fitscore/history` - 7-day FitScore history
    - `POST /api/meals` - Meal photo upload with auto-trigger
    - `GET /api/meals/today` - Get today's meals
    - `GET /api/meals/yesterday` - Get yesterday's meals

#### `/server/services/`
- **`chatService.ts`** - Chat service with FitScore integration
- **`chatSummarizationService.ts`** - Chat summarization for context
- **`contextPack.ts`** - Context aggregation service (WHOOP, goals, calendar, FitScore history)

#### `/server/prompt/`
- **`personaComposer.ts`** - FitSmart AI persona composer

### Client Code (`/client/pages`)

- **`dashboard_with_fitscore.tsx`** (from commit `b43dd57`)
  - Web dashboard with:
    - FitScore Logo component (SVG heartbeat animation)
    - Recovery, Strain, Sleep, HRV cards
    - Sleep stages breakdown
    - Weekly averages section
    - Circular progress indicators

- **`profile_updated.tsx`** (from commit `b43dd57`)
  - Updated profile page with:
    - JWT Bearer token display for AI assistant
    - WHOOP connection status
    - User role badges (Admin/User)
    - Calendar management integration
    - Token copy functionality

### Mobile Code (`/mobile/screens`)

- **`DashboardScreen_with_fitscore.tsx`** (from commit `8ac64d3`)
  - Mobile dashboard with:
    - **FitScore Pulse Ring** - Circular SVG visualization with gradient
    - **Metric Cards** - Sleep, Recovery, Strain, HRV
    - **Color-coded Delta Indicators** - Today vs Yesterday comparisons
    - FitScore forecast display with insights
    - Calendar event preview

---

## 🎨 Color Coding & Metric Comparisons

### Mobile Dashboard Color Logic
Found in `DashboardScreen_with_fitscore.tsx`:

```typescript
// Delta calculation (today vs yesterday percentage change)
const calculateDelta = (today: number | undefined, yesterday: number | undefined): number | undefined => {
  if (today === undefined || yesterday === undefined || yesterday === 0) return undefined;
  return Math.round(((today - yesterday) / yesterday) * 100);
};

// Color coding logic
const deltaColor = isStrain
  ? colors.textMuted  // Strain is neutral (no green/red)
  : (delta && delta > 0 ? state.ready : delta && delta < 0 ? state.rest : colors.textMuted);

const deltaIcon = delta && delta > 0 ? 'arrow-up' : delta && delta < 0 ? 'arrow-down' : 'remove';
```

**Color Rules:**
- **Positive delta (+)** → Green (`state.ready`) with up arrow → Better than yesterday
- **Negative delta (-)** → Red/Rest (`state.rest`) with down arrow → Worse than yesterday
- **Strain metric** → Always neutral (no color coding)
- **No data** → Muted gray

### Metric Comparisons Displayed:
1. **Today vs Yesterday** - Percentage change shown on each metric card
2. **Weekly Averages** - 7-day rolling average for all metrics
3. Display format: `vs. yesterday: +X%` or `vs. yesterday: -X%`

---

## ⚠️ CRITICALLY MISSING FILES (Never Committed to Git)

These files are **referenced in the recovered code** but were **NEVER in git history**:

### Missing Service Files:

1. **`server/services/fitScoreService.ts`**
   - Referenced in: `routes_with_fitscore_endpoints.ts` line ~480
   - Purpose: Core FitScore calculation service
   - Function called: `fitScoreService.checkMealTrigger(userId, today)`
   - **MUST BE RECREATED**

2. **`server/services/fitScoreCalculatorV3.ts`**
   - Referenced in: `routes_with_fitscore_endpoints.ts` (FitScore forecast endpoint)
   - Purpose: V3.0 FitScore calculator (1-10 scale)
   - Import: `const { fitScoreCalculatorV3 } = await import('./services/fitScoreCalculatorV3')`
   - **MUST BE RECREATED**

3. **`server/services/mealAnalysisService.ts`**
   - Referenced in: `chatService.ts`
   - Purpose: AI-powered meal nutrition analysis
   - Import: `const { mealAnalysisService } = await import('./services/mealAnalysisService')`
   - **MUST BE RECREATED**

### Missing Database Schema Tables:

4. **`fitScores` table** (in `shared/schema.ts`)
   - Referenced in: `routes_with_fitscore_endpoints.ts`, `contextPack.ts`
   - Fields used:
     - `userId`, `date`, `score`, `calculatedAt`
     - `components` (JSON: sleep, recovery, nutrition, cardioBalance, trainingAlignment)
     - `tagline`, `motivation`
   - Import: `import { fitScores, userGoals } from '@shared/schema'`
   - **MUST BE ADDED TO SCHEMA**

5. **`userGoals` table** (in `shared/schema.ts`)
   - Referenced in: `routes_with_fitscore_endpoints.ts`, `contextPack.ts`
   - Purpose: User goals and focus areas
   - Import: `import { fitScores, userGoals } from '@shared/schema'`
   - **MUST BE ADDED TO SCHEMA**

6. **`chatSummaries` table** (in `shared/schema.ts`)
   - Referenced in: `contextPack.ts`
   - Purpose: Chat history summaries for context
   - Import: `import { chatSummaries } from '@shared/schema'`
   - **MUST BE ADDED TO SCHEMA**

### Missing TypeScript Types:

7. **`FitScore` and `UserGoal` types**
   - Referenced in: `routes_with_fitscore_endpoints.ts`
   - Import: `import type { UserGoal, FitScore } from '@shared/schema'`
   - **MUST BE ADDED TO SCHEMA**

---

## 🔍 FitScore API Endpoints Details

### Main FitScore Endpoints:

#### `POST /api/ai/fitscore`
- **Purpose:** Calculate and return daily FitScore
- **Auth:** Requires JWT (`requireJWTAuth`)
- **Response:**
  ```typescript
  {
    title: string,           // e.g., "⚡ Exceptional Performance"
    summary: string,         // Multi-line summary
    components: {
      sleep: number,         // 0-10
      recovery: number,      // 0-10
      nutrition: number,     // 0-10
      strain: number         // 0-10 (training or cardio)
    },
    finalScore: number,      // 0-10
    timestamp: string        // ISO date
  }
  ```
- **Dependencies:**
  - Requires `fitScores` table query
  - Falls back to mock data in non-production

#### `GET /api/fitscore/forecast`
- **Purpose:** Generate FitScore forecast for mobile app
- **Auth:** Requires JWT
- **Dependencies:**
  - `fitScoreCalculatorV3` service (MISSING)
  - WHOOP data (recovery, sleep, HRV, RHR, strain)
- **Response:**
  ```typescript
  {
    forecast: number,        // 1-10 scale
    factors: {
      sleep: string,
      recovery: string,
      strain: string
    },
    insight: string,
    updatedAt: string
  }
  ```

#### `GET /api/fitscore/history`
- **Purpose:** Fetch 7-day FitScore history
- **Auth:** Requires JWT
- **Response:**
  ```typescript
  {
    scores: Array<{ date: string, score: number }>,
    weeklyAverage: number,
    trend: number            // Difference between first 3 and last 3 days
  }
  ```

### Meal Upload Endpoints:

#### `POST /api/meals`
- **Purpose:** Upload meal photos
- **Field:** `mealPhotos` (array, max 10 files, 10MB each)
- **Auto-triggers:** `fitScoreService.checkMealTrigger()` after 2+ meals
- **Response:** Array of uploaded meal filenames

---

## 🎯 FitScore Components Breakdown

Based on the recovered code, the FitScore is calculated from these components:

1. **Sleep Component** (0-10)
   - Based on: Sleep hours, sleep score
   - Target: 8 hours

2. **Recovery Component** (0-10)
   - Based on: Recovery score, HRV, RHR

3. **Nutrition Component** (0-10)
   - Based on: Meal analysis from uploaded photos
   - **Requires:** `mealAnalysisService` (MISSING)

4. **Strain Component** (0-10)
   - Two variants:
     - `trainingAlignment` - Training alignment score
     - `cardioBalance` - Cardio balance score
   - Uses whichever score is higher

**Final Score:** Normalized to 0-10 scale

---

## 📊 Mobile FitScore Visualization

The mobile app includes a **FitScore Pulse Ring** component:

- SVG-based circular progress indicator
- Gradient colors: cyan to teal
- Animated pulse effect
- Score displayed in center (1-10 scale)
- Located in: `DashboardScreen_with_fitscore.tsx` lines ~50-85

```typescript
function FitScorePulseRing({ score }: { score: number }) {
  // Pulse animation
  const pulseAnim = new Animated.Value(1);

  // Circular progress calculation
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (score / 10) * circumference;

  // Gradient from colors.accent to #46F0D2
}
```

---

## 🔧 Next Steps to Restore Functionality

### Priority 1: Recreate Missing Services

1. **Create `fitScoreService.ts`**
   - Implement `checkMealTrigger(userId, date)` function
   - Should trigger FitScore calculation after 2+ meals uploaded

2. **Create `fitScoreCalculatorV3.ts`**
   - Implement calculator for 1-10 scale
   - Input: sleep, recovery, strain, HRV, RHR, nutrition
   - Output: FitScore forecast object

3. **Create `mealAnalysisService.ts`**
   - Integrate OpenAI Vision API or similar
   - Analyze meal photos for nutrition estimation
   - Return nutrition score (0-10)

### Priority 2: Add Database Schema

1. **Add to `shared/schema.ts`:**
   ```typescript
   export const fitScores = pgTable("fit_scores", {
     id: serial("id").primaryKey(),
     userId: text("user_id").notNull().references(() => users.id),
     date: text("date").notNull(), // YYYY-MM-DD
     score: real("score").notNull(), // 0-10
     components: jsonb("components"), // { sleep, recovery, nutrition, strain }
     tagline: text("tagline"),
     motivation: text("motivation"),
     calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
   });

   export const userGoals = pgTable("user_goals", {
     id: serial("id").primaryKey(),
     userId: text("user_id").notNull().references(() => users.id),
     goal: text("goal").notNull(),
     focusArea: text("focus_area"),
     createdAt: timestamp("created_at").defaultNow().notNull(),
   });

   export const chatSummaries = pgTable("chat_summaries", {
     id: serial("id").primaryKey(),
     userId: text("user_id").notNull().references(() => users.id),
     summary: text("summary").notNull(),
     createdAt: timestamp("created_at").defaultNow().notNull(),
   });
   ```

### Priority 3: Deploy & Test

1. Run database migrations
2. Test meal upload → FitScore calculation flow
3. Test mobile FitScore forecast
4. Verify color-coded metric comparisons

---

## 📝 Additional Notes

### Profile Page Updates (from `profile_updated.tsx`):
- JWT Bearer token display for Custom GPT integration
- Copy-to-clipboard functionality for token
- WHOOP connection status with visual indicators
- Admin role badge with Crown icon
- Legal section with Privacy Policy and Disclaimer links

### Web Dashboard Features:
- FitScore Logo with animated heartbeat SVG
- Weekly averages section (7-day trends)
- Sleep stages breakdown (Light, Deep, REM, Awake)
- Circular progress indicators with glow effects
- Responsive design (mobile, tablet, desktop)

### Theme Colors Used:
- **Recovery:** Blue (#3B82F6)
- **Sleep:** Purple (#A855F7)
- **Strain:** Orange (#F97316)
- **HRV:** Red (#EF4444)
- **FitScore Gradient:** Cyan → Blue → Purple → Pink

---

## ⚠️ Important Warning

**DO NOT** use the recovered `routes_with_fitscore_endpoints.ts` file directly in production without:
1. Creating the missing service files
2. Adding the missing schema tables
3. Testing all FitScore endpoints
4. Ensuring proper error handling

The file references services and tables that don't exist in your current codebase!

---

## 📞 Support

If you need help recreating the missing services or have questions about the recovered code, refer to:
- The inline comments in recovered files
- FitScore endpoint documentation above
- Color coding logic examples

**Recovery completed by:** Claude Code
**Session ID:** claude/recover-deleted-files-01EdLviCfNFi75Cdj2HhbL7S

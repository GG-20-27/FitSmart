# FitSmart Rebuild Implementation Plan

This document tracks the implementation progress of features outlined in FITSMART_MASTER_SPEC.md.

---

## Phase 1: Home Tab Core Features

### 1.1 Profile Button (Top-Left)
- [x] Move Profile from bottom tab to hidden screen
- [x] Add profile button to top-left of Home screen (WHOOP-style)
- [x] Add SafeAreaView to ProfileScreen
- [x] Style profile button as circular avatar

### 1.2 FitScore Forecast Ring
- [ ] Create FitScorePulseRing component with animated ring
- [ ] Implement auto-scrolling horizontal panels (Most Recent + Today's Forecast)
- [ ] Add fade scroll behavior with dot indicators
- [ ] Ring color always mint green
- [ ] Ring fill based on score (1-10 scale)
- [ ] Smooth 700ms animation
- [ ] Pulsing animation while loading forecast
- [ ] User hold/swipe control (pause auto-scroll on touch)

### 1.3 Today's Metrics Section (2x2 Grid)
- [x] Sleep % tile with color coding
- [x] Recovery % tile with WHOOP thresholds (Green: 67-100%, Yellow: 34-66%, Red: 0-33%)
- [x] Strain tile with recovery-adjusted colors
- [x] HRV tile (no color, only trend arrows)
- [x] Delta comparison vs yesterday (↑/↓/—)

### 1.4 Yesterday's Metrics Section
- [x] Same 4 metrics as today
- [x] Delta comparison vs last week

### 1.5 Weekly Averages Section
- [x] Avg Sleep %, Recovery %, Strain, HRV
- [x] Delta comparison vs last month

### 1.6 FitCoach CTA
- [x] "Chat with FitCoach" button at bottom
- [x] Renamed all "Coach" to "FitCoach"

---

## Phase 2: WHOOP v2 API Integration

### 2.1 Backend Endpoints
- [ ] GET /api/whoop/today - Returns today's metrics (Zurich timezone)
- [ ] GET /api/whoop/yesterday - Returns yesterday's metrics
- [ ] GET /api/whoop/weekly - Returns 7-day rolling stats with comparison

### 2.2 Data Mapping
- [ ] Sleep score % from WHOOP sleep endpoint
- [ ] Sleep hours from duration/3600
- [ ] Recovery % from WHOOP recovery endpoint
- [ ] HRV from recovery endpoint
- [ ] Strain from cycle endpoint

### 2.3 Timezone Handling
- [ ] All day logic anchored to Europe/Zurich
- [ ] Store timestamps in UTC
- [ ] Convert to Zurich for queries
- [ ] Filter WHOOP data by Zurich day boundaries

### 2.4 Token Management
- [x] OAuth flow with JWT tokens
- [x] Token storage (whoop_access_token, whoop_refresh_token, whoop_expires_at)
- [ ] Auto-refresh expired tokens
- [ ] Handle WHOOP_DISCONNECTED state
- [ ] Clear error codes: WHOOP_DISCONNECTED, WHOOP_RATE_LIMITED, WHOOP_UPSTREAM_ERROR

### 2.5 Error & Fallback Handling
- [ ] N/A values when metrics missing
- [ ] Grey tiles for unknown data
- [ ] Use last valid HRV when current is 0/null
- [ ] Graceful degradation when WHOOP unavailable

---

## Phase 3: Insights Tab Navigation

### 3.1 Tab Structure
- [ ] Create Insights tab with top segmented navigation
- [ ] Implement [FitScore | FitLook | FitRoast] header
- [ ] Default to FitScore screen
- [ ] Preserve scroll position per sub-screen
- [ ] Independent caching per screen

### 3.2 FitScore Screen (Priority 1)
See Phase 4 for detailed implementation

### 3.3 FitLook Screen (Priority 2 - Later)
- [ ] Daily outlook based on WHOOP + training
- [ ] Readiness summary
- [ ] Training/Recovery/Nutrition focus
- [ ] Micro action tips
- [ ] Uses fitLookAi persona

### 3.4 FitRoast Screen (Priority 3 - Later)
- [ ] Fun roast based on week's data
- [ ] Uses fitRoastAi persona
- [ ] No storage needed

---

## Phase 4: FitScore Screen (Main Feature)

### 4.1 Screen Structure
- [ ] Date selector at top (< TODAY >)
- [ ] Meals section (horizontal scroll)
- [ ] Training section
- [ ] Recovery metrics section
- [ ] Score breakdown triangle
- [ ] FitCoach's Take
- [ ] Tomorrow's Outlook

### 4.2 Date Navigation
- [ ] Swipe left for previous days
- [ ] Only TODAY is editable
- [ ] Historical days are read-only
- [ ] Load archived FitScore for past days
- [ ] Don't re-run AI for past days

### 4.3 Meals Section
- [ ] Horizontal scroll of meal cards
- [ ] Meal photo + type label + nutrition subscore badge
- [ ] Color coding: Red (1-3), Yellow (4-6), Green (7-10)
- [ ] Tap to open meal analysis modal
- [ ] "Add Meal" button for today only
- [ ] Empty state when no meals logged

### 4.4 Training Section
- [ ] Training card with icon, title, duration, strain, intensity
- [ ] AI training blurb
- [ ] User inputs: duration, intensity rating, comment, skipped toggle
- [ ] Goal alignment display
- [ ] Injury status indicator

### 4.5 Recovery Metrics Section
- [ ] Sleep Hours, Sleep Score %, Recovery %, HRV (ms)
- [ ] AI note below metrics
- [ ] Recovery score calculation (weighted: Recovery 50%, Sleep 35%, HRV 15%)

### 4.6 Score Calculations

#### Recovery Score (0-10)
- [ ] Recovery % scaled (recovery_percent / 100 * 10)
- [ ] Sleep quality (hours points + sleep score points)
- [ ] HRV trend adjustment (-2 to +2)
- [ ] Final weighted calculation

#### Training Score (0-10)
- [ ] Strain appropriateness (40%) - adjusted by recovery zone
- [ ] Session quality (30%) - intensity + duration + feeling
- [ ] Goal alignment (20%)
- [ ] Injury safety modifier (10%)

#### Nutrition Score (0-10)
- [ ] Average of all meal subscores
- [ ] Default to 1.0 if no meals

#### Final FitScore
- [ ] Average of (recovery_score, training_score, nutrition_score)
- [ ] Rounded to 1 decimal

### 4.7 Score Breakdown Triangle
- [ ] Triangle with 4 zones (Recovery, Training, Nutrition, FitScore center)
- [ ] Color coding per score (Red: 1-3.9, Yellow: 4-7.9, Green: 8-10)
- [ ] Special animation when all green
- [ ] FitScoreAi summary below

### 4.8 FitCoach's Take
- [ ] Generated by fitCoachAi
- [ ] 2-4 sentences, warm and supportive tone
- [ ] No raw numbers, focuses on patterns and effort
- [ ] Uses full day context

### 4.9 Tomorrow's Outlook
- [ ] Generated by fitCoachAi
- [ ] 1-2 sentences
- [ ] Sleep/nutrition/training recommendations
- [ ] Small actionable task

### 4.10 Progressive Reveal Flow
- [ ] Start with only meal upload visible
- [ ] Show training section after 1+ meal
- [ ] "Calculate My FitScore" button after meals + training saved
- [ ] Step-by-step reveal with animations:
  1. Nutrition score calculation
  2. Recovery section analysis
  3. Training section analysis
  4. Triangle + final scores
  5. FitCoach section
  6. Tomorrow's outlook

### 4.11 "Ask FitCoach: Why this score?"
- [ ] Button under triangle
- [ ] Navigates to FitCoach tab with prefilled question
- [ ] Uses fitCoachAi persona for response

---

## Phase 5: Backend Data Flow

### 5.1 API Endpoints for FitScore
- [ ] GET /api/meals/today - Today's meals with analysis
- [ ] GET /api/whoop/today - WHOOP metrics
- [ ] GET /api/calendar/today - Training events
- [ ] POST /api/fitscore/generate - Generate/store FitScore

### 5.2 Data Storage
- [ ] fitscore_summary table (fit_score, recovery_score, training_score, nutrition_score, coach_take, tomorrow_outlook)
- [ ] meals table with ai_analysis and nutrition_subscore
- [ ] ai_logs for persona interactions

### 5.3 Forecast Endpoint
- [ ] GET /api/fitscore/forecast - Predicted today's score
- [ ] Uses partial data + defaults for missing

---

## Phase 6: GPT Personas

### 6.1 fitScoreAi (Numbers)
- [ ] Meal analysis and subscores
- [ ] Nutrition score calculation
- [ ] Recovery/Training numeric analysis
- [ ] Triangle summary text

### 6.2 fitCoachAi (Coaching)
- [ ] Coach's Take narrative
- [ ] Tomorrow's Outlook
- [ ] Training blurb
- [ ] Recovery blurb
- [ ] "Why this score?" responses

### 6.3 fitLookAi (Later)
- [ ] Daily outlook generation

### 6.4 fitRoastAi (Later)
- [ ] Fun roast generation

---

## Phase 7: Quality & Polish

### 7.1 Color Rules
- [ ] Consistent RYG thresholds across app
- [ ] Recovery: Green 67-100%, Yellow 34-66%, Red 0-33%
- [ ] Sleep: Green ≥80%, Yellow 50-79%, Red <50%
- [ ] Strain: Adjusted by recovery zone
- [ ] Scores: Green 8-10, Yellow 4-7.9, Red 1-3.9

### 7.2 Animations
- [ ] Ring animation (700ms ease-in-out)
- [ ] Card fade-in reveals
- [ ] Triangle component animation
- [ ] Soft pulse highlight for coach sections

### 7.3 Error States
- [ ] WHOOP disconnected state
- [ ] Missing data fallbacks
- [ ] Clear user messaging

### 7.4 Timezone Consistency
- [ ] All screens use Zurich timezone
- [ ] Consistent "today" definition

---

## Implementation Priority Order

1. **Phase 2.1-2.3**: WHOOP API endpoints (foundation for everything)
2. **Phase 1.2-1.5**: Home tab metrics display
3. **Phase 3.1**: Insights tab navigation structure
4. **Phase 4.1-4.6**: FitScore screen structure and calculations
5. **Phase 6.1-6.2**: GPT personas integration
6. **Phase 4.7-4.10**: FitScore UI polish and animations
7. **Phase 5**: Backend storage and caching
8. **Phase 7**: Quality and polish
9. **Phase 3.3-3.4**: FitLook and FitRoast (later)

---

## Notes

- All changes must be backwards-compatible
- No real API keys in code (use placeholders)
- All environment variables via process.env
- Test with WHOOP sandbox before production

---

## Completed Features Log

| Date | Feature | Notes |
|------|---------|-------|
| 2024-11-22 | Profile button top-left | Moved from tab bar to DashboardScreen |
| 2024-11-22 | SafeAreaView fixes | ProfileScreen, DashboardScreen, GoalsScreen |
| 2024-11-22 | Tab labels removed | Icons only in bottom tabs |
| 2024-11-22 | Coach renamed to FitCoach | All references updated |
| 2024-11-22 | Goals prefilled message | Auto-submit to FitCoach |
| 2024-11-22 | Edit Goals functionality | Modal with full edit support |
| 2024-11-22 | Circular profile avatar | WHOOP-style profile button with mint background |
| 2024-11-22 | Color-coded metric tiles | WHOOP thresholds for Recovery, Sleep, Strain |
| 2024-11-22 | Yesterday's Metrics section | With delta vs last week |
| 2024-11-22 | Weekly Averages section | With delta vs last month |
| 2024-11-22 | Sleep shows percentage | Changed from hours to percentage display |


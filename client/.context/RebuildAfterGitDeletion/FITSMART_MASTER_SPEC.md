SAFE DEVELOPMENT NOTICE

Do NOT request, generate, rewrite, or insert any real API keys, connection strings, or secrets.
All examples must use placeholders only (e.g. "API_KEY_HERE").
Never modify .env files or authentication logic directly.
All environment variables must be accessed via process.env.
Never run git push -f, git rebase, or rewrite commit history unless explicitly requested for a specific task.
All changes must remain fully backwards-compatible with the existing file structure.
All instructions must assume .env is properly loaded via server/loadEnv.ts.
All generated code should be stateless, deterministic, and safe for production commits.
If unsure about anything related to Git, secrets, or auth — ask before acting.

SECTION 1 — HOME TAB: FORECAST RING + TAB STRUCTURE (FULL RECONSTRUCTION)
This restores exactly how the Home tab worked before the setback, including:
• Top-left profile button
• Centered Insights tab layout
• FitScore forecast ring logic
• WHOOP metrics layout and color rules
• Daily/Yesterday/Weekly data logic
• The delta comparison system
• The visual behavior
 
1.1 HOME TAB — NEW NAVIGATION STRUCTURE
You confirmed the new global tab structure is:
Home | Goals | Insights | Calendar | Coach
                  ↑
               Main Tab
Home Tab New Layout
•	Bottom tabs centered, with Insights (light bulb) in the middle
•	Profile button displayed as a round icon in the top-left, same as WHOOP’s circle avatar
•	Home tab becomes a clean dashboard (without “Home” header!) that shows:
Home Tab Sections (in order)
1.	Profile Button (Top Left)
2.	FitScore Forecast Ring (Auto-scrolling horizontally)
3.	WHOOP Today Metrics (Sleep %, Recovery %, Strain, HRV)
4.	Yesterday’s Metrics
5.	Weekly Averages
6.	(Optional future add) Daily FitLook tip
7.	Chat with FitCoach (also rename all the ‘Coach’ names to ‘FitCoach’) CTA (bottom)
This is the exact structure we had working before the code loss.
 
1.2 FITSCORE FORECAST RING — FULL RECONSTRUCTION
This component was one of the most polished things in the app.
We’re restoring it exactly.
What it looked like:
A big, centered ring with:
•	A number inside
•	Mint outline progress
•	Smooth animation
•	Auto-fade horizontal scroll for 2 panels:
Panel 1 → Most Recent FitScore
Text: “Most Recent FitScore”
Number: last completed FitScore (from fitscore_summary table)
Ring: static, no dashed animation
Color: Mint (always constant mint brand color)
Panel 2 → Today’s FitScore Forecast
Text: “Today’s FitScore Forecast”
Number: predicted FitScore
Ring: animated stroke showing “forecast loading”
Once loaded, ring fills to the predicted value
If forecast not available → “Loading forecast…”
 
FitScore Forecast Logic (Restored)
Forecast was produced by fitCoachAi using:
•	Sleep score
•	Recovery score
•	Strain
•	Yesterday’s metrics
Not strict calculation → AI heuristic
Example prompt:
“Predict today’s FitScore (1–10) based on sleep %, recovery %, strain, and yesterday’s FitScore.”
Today’s forecast updates live as data comes in
(e.g., WHOOP readiness arrives late → refresh)
 
1.3 VISUAL LOGIC OF THE FORECAST RING
Ring Color
Always mint green (existing brand theme mint).
Ring Fill %
Converted directly from FitScore (1–10):
progress = score / 10
Ring Animation
•	Smooth ease-in-out from 0 → value
•	Duration: 700ms
•	Forecast version had a pulsing animation until value arrived
Number Inside
Large bold number (e.g., “5.4”)
Gradient from mint → white (slight)
Centered perfectly
Decimal always 1 digit
Fade Scroll Behavior
Scrollable, but looked like static cards because:
•	Auto-scroll every 5 seconds
•	Fades edges with gradient mask
•	Snaps horizontally
•	Dot indicator below (two dots)
•	Let’s the user hold and swipe also. If user taps and holds, the animation stops and user takes over full control.
The 2 panels were:
[ O ] Most Recent FitScore
[ O ] Today’s Forecast
Where O is the ring.
This entire component is critical because it sets the tone for the day.
 
1.4 HOME TAB — WHOOP TODAY METRICS (RESTORED LOGIC)
The metrics presented were:
•	Sleep (%)
•	Recovery (%)
•	Strain (1–21)
•	HRV (ms)
Laid out in a 2×2 grid:
Sleep      Recovery
Strain     HRV
Tile Structure
Each tile showed:
Top-left: Icon
Middle: Large number
Bottom: Label
Bottom small: Delta vs the corresponding comparison (e.g. today vs yesterday) (when available)
 
1.5 COLOR RULES FOR HOME METRICS (RESTORED)
These were well-defined and consistent across the app.
We restore them exactly.
RECOVERY (WHOOP thresholds)
• Green: 67–100%
• Yellow: 34–66%
• Red: 0–33%

SLEEP (%)
• Green: ≥ 80%
• Yellow: 50–79%
• Red: < 50%

STRAIN (depends on recovery)
If recovery green:
    green ≤14, yellow 15–18, red >18
If recovery yellow:
    green ≤10, yellow 11–15, red >15
If recovery red:
    green ≤7,  yellow 8–12, red >12

HRV
• No color
• Only ↑ / ↓ / — comparison vs target date
Important:
These zones were visually tied to the FitScore triangle and were meant to match user expectations from WHOOP itself.
 
1.6 DELTA COMPARISON LOGIC
Today vs Yesterday
Every metric tile displays:
↑ or ↓ vs yesterday: +X / -X
Rules:
•	If improvement → mint arrow ↑
•	If worse → red arrow ↓
•	If equal → grey dash
Examples:
Sleep: 79%  ↓ vs yesterday: -9%
Strain: 16.5 ↑ vs yesterday: +0.3
Yesterday metrics
Same comparison rules, but using:
vs last week

Weekly Averages
Same comparison rules, but using:
vs avg last month
 
1.7 YESTERDAY’S METRICS SECTION
This was below Today’s metrics.
It showed:
•	Sleep %
•	Recovery %
•	Strain
•	HRV
All using the same tile color rules.
 
1.8 WEEKLY AVERAGES SECTION
Tiles showed:
•	Avg Sleep %
•	Avg Recovery %
•	Avg Strain
•	Avg HRV
These were calculated from WHOOP 7-day API data.
Comparisons:
vs last month’s baseline
Example:
Avg Sleep: 12%   ↓ vs last month: -80%
Avg HRV: 13 ms   ↓ vs last month: -69
 
1.9 CTA: Chat with Coach
At the bottom of the Home tab:
Chat with FitCoach → opens FitCoach chat screen
Uses fitCoachAi persona.
 
1.10 SUMMARY OF WHAT TO RESTORE EXACTLY
Home Tab Must Restore:
✔️ Profile bubble top left
✔️ FitScore Forecast scrollable ring
✔️ Yesterday metrics
✔️ Weekly averages
✔️ Comparison deltas
✔️ Color thresholds
✔️ Today metrics
✔️ Chat with coach
✔️ WHOOP v2 API usage
✔️ Zurich timezone normalization (but later adapts to user situation)
SECTION 2 — WHOOP v2 API MIGRATION PLAN
Goal:
Rebuild the WHOOP integration on v2 so Home + FitScore screens get exactly the metrics they need, with the same behaviour as before.
 
2.1 Metrics We Actually Need
For Home tab (today, yesterday, weekly):
•	Sleep score (%)
•	Recovery score (%)
•	Strain (1–21)
•	HRV (ms)
For FitScore screen:
•	Sleep score (%)
•	Sleep hours (h)
•	Recovery score (%)
•	HRV (ms)
•	Strain (1–21)
•	(later) goals / injury / calendar-context for training section
We explicitly do NOT need for now:
•	Respiratory rate
•	Resting heart rate
 
2.2 Backend Endpoint Contract (Our API)
We’ll keep your backend surface the same, but swap internals to WHOOP v2.
1) GET /api/whoop/today
Returns today’s metrics, normalized to Europe/Zurich.
{
  date: "2025-11-18",
  sleep: {
    score_percent: 79,
    hours: 7.6
  },
  recovery: {
    score_percent: 66,
    hrv_ms: 83
  },
  strain: {
    score: 16.5
  }
}
Used by:
•	Home → “Today’s Metrics” tiles
•	FitScore → Recovery section + Training section
•	FitScore forecast model (FitScore Forecast ring)
 
2) GET /api/whoop/yesterday
{
  date: "2025-11-17",
  sleep: { score_percent: 80, hours: 7.9 },
  recovery: { score_percent: 70, hrv_ms: 90 },
  strain: { score: 15.2 }
}
Used for:
•	Home → “Yesterday’s Metrics”
•	Today vs Yesterday deltas under each tile
 
3) GET /api/whoop/weekly
Returns rolling 7-day stats ending today (Zurich):
{
  start_date: "2025-11-12",
  end_date: "2025-11-18",
  averages: {
    sleep_score_percent: 76,
    recovery_score_percent: 64,
    strain_score: 14.2,
    hrv_ms: 78
  },
  comparison: {
    vs_last_month: {
      sleep_percent_delta: -8,
      recovery_percent_delta: -5,
      strain_delta: +0.4,
      hrv_ms_delta: -6
    }
  }
}
Used by:
•	Home → “Weekly Averages” tiles
•	Delta text: ↓ vs last month: -8%
 
2.3 Mapping WHOOP v2 → Our Data Model
At a high level:
•	Use WHOOP recovery endpoint v2 for recovery score + HRV
•	Use WHOOP sleep endpoint v2 for sleep score + duration
•	Use WHOOP strain (or “cycle”) endpoint for strain score
The migration doc for Claude Code should list:
// Pseudocode mapping
our.sleep.score_percent   = whoop.sleep.score
our.sleep.hours           = whoop.sleep.duration / 3600

our.recovery.score_percent = whoop.recovery.score
our.recovery.hrv_ms        = whoop.recovery.hrv

our.strain.score           = whoop.strain.score
If v2 splits into different resources (e.g. “recovery”, “cycle”, “sleep”), we call them all inside a single service and return our compact JSON shape above.
 
2.4 Timezone & “Today” Definition
You already decided:
➡️ All “days” are defined in Europe/Zurich local time.
Rules:
•	WHOOP returns timestamps in UTC
•	Backend converts all WHOOP events to Europe/Zurich
•	“Today” is current Zurich calendar day
•	For daily endpoints (/today, /yesterday, /weekly), queries to WHOOP are done using Zurich day boundaries:
o	today_start = 00:00 Zurich
o	today_end = 23:59:59 Zurich
So the spec for Claude Code should literally say:
All WHOOP queries must filter by Zurich-local date ranges, not UTC calendar days.
This is important for night sleep sessions that cross midnight.
 
2.5 Auth & Token Refresh Logic (v2)
We restore the previous design, adapted for WHOOP v2:
•	Onboarding connects WHOOP and stores:
o	whoop_access_token
o	whoop_refresh_token
o	whoop_expires_at (UTC timestamp)
•	Every WHOOP request uses a WHOOP service:
async function getWhoopClient(userId) {
  // 1. Load tokens from DB
  // 2. If access_token expired -> refresh via WHOOP OAuth v2
  // 3. Save new tokens + new expires_at
  // 4. Return an axios/fetch client with Authorization: Bearer <token>
}
•	If refresh fails (user revoked access):
o	Mark WHOOP as disconnected in DB
o	/api/whoop/* returns 401 with a clear error code: WHOOP_DISCONNECTED
o	Frontend:
	Shows “Connect with WHOOP” state
	Home metrics → “N/A”
We can explicitly add to the spec:
“All WHOOP v2 API calls must go through whoopClient.ts – never call WHOOP directly from controllers.”
 
2.6 Error & Fallback Behaviour
If WHOOP endpoints are missing a metric:
•	Sleep missing → show N/A + neutral tile (grey)
•	Recovery missing but sleep exists → “95% WHOOP recovery not available” in FitScore explanation later
•	HRV zero or null → show 0 ms but mark text as grey (unknown)
For Home tiles:
•	If today’s metric missing → N/A, delta row becomes — vs yesterday: —
•	If yesterday’s data missing → show today’s values only, no delta.
For FitScore:
•	If key data missing, FitScore is not generated; instead show explanatory text:
“Today’s FitScore will appear once recovery and strain are available.”
 
2.7 What Claude Code Needs to Implement (WHOOP v2)
When we write the specs for it, the WHOOP v2 section should tell it to:
1.	Create a WhoopService v2 that:
o	Handles token refresh
o	Normalizes all responses to Zurich-day JSON structures defined above
2.	Implement:
o	GET /api/whoop/today
o	GET /api/whoop/yesterday
o	GET /api/whoop/weekly
3.	Ensure:
o	No respiratory / resting HR for now
o	Only sleep %, sleep hours, recovery %, strain, HRV
o	Errors are typed: WHOOP_DISCONNECTED, WHOOP_RATE_LIMITED, WHOOP_UPSTREAM_ERROR.
SECTION 3 — INSIGHTS TAB NAVIGATION
3.1 Purpose of the Insights Tab
The Insights tab is the core analytic layer of FitSmart.
It contains three screens, all powered by GPT personas:
Screen	Purpose	AI gpt Persona
FitScore	Daily performance score combining WHOOP + Meals + Training. This is the HEART of the FitSmart app.	fitScoreAi (analysis) + fitCoachAi (coaching)
FitLook	Daily aesthetic/body-composition feedback + actionable recommendations.	fitLookAi
FitRoast	Lighthearted fun: comedic roast based on performance context.	fitRoastAi
All three live INSIDE a segmented top navigation header, identical to what you had:
[ FitScore | FitLook | FitRoast ]
This whole header lives within ONE bottom tab (Insights):
Home | Goals | Insights | Calendar | Coach
And per your requirement:
The Profile icon moves to the top-left of Home, WHOOP-style.
(We’ll define it in a later section.)
 
3.2 Why It’s Important
Without restoring this structure exactly, Claude Code can’t:
•	manage the top tab navigation
•	load AI personas per screen
•	handle caching per sub-screen
•	implement date-switching (FitScore) while leaving FitLook/FitRoast stateless
•	maintain the UX continuity you already built
This section ensures the new rebuild uses the old logic without guessing.
 
3.3 Behavior Rules for Each Insight Screen
A. FitScore (the main screen)
•	Requires WHOOP data
•	Requires Meals data
•	Requires Training data
•	Generates:
o	Triangle breakdown (Recovery / Training / Nutrition)
o	Meal analysis popups
o	Training AI comment
o	FitScore value (1–10)
o	Coach’s Take
o	Tomorrow’s Outlook
•	Has date navigation at top:
o	Today
o	Previous days (read-only)
•	FitScore can only be generated when:
o	WHOOP metrics exist
o	At least 2 meals logged (nutrition score becomes 1 by default)
o	Strain exists
o	Sleep exists
o	Recovery exists
We’ll cover the detailed FitScore structure next.
 
B. FitLook (for later)
Purpose:
Daily insight and tips for the day based on yesterdays/ weekly context
FitLook = Daily Outlook / Action Plan
FitLook is the short-term “today strategy” screen inside Insights.
It gives the user:
•	Readiness context for today
•	Training intensity recommendation
•	Recovery recommendation
•	Nutrition focus of the day
•	Micro-guidance for energy, mood, or habits
FitLook is basically:
“What should I focus on today?”
❌ NOT:
•	A photo analysis system
•	A body image feature
•	A physique score
•	Anything visual-based
✔ YES:
•	A WHOOP-informed daily plan
•	Personalized suggestions
•	Short actionable tips
•	A simplified summary of readiness for today
•	Motivation aligned with FitScore
 
🎨 Correct FitLook Persona Behavior
Persona: fitLookAi
Tone:
•	Motivational
•	Clear
•	Practical
•	Light but encouraging
Input Data:
•	Today’s WHOOP:
o	recovery %
o	sleep score & hours
o	hrv trend
o	strain (so far)
•	Yesterday’s FitScore
•	Today’s training plan (if any)
•	Goals (if configured)
Output Structure (Final):
title: "Daily Outlook"
readiness_summary: "<1 sentence assessment>"
focus_for_today: "<single focal point>"
recovery_tip: "<short action>"
training_tip: "<intensity guidance>"
nutrition_tip: "<1 actionable step>"
energy_curve: "<optional forecast>"
 
📌 FitLook Should Live Here:
Insights Tab → Top Navigation
[ FitScore | FitLook | FitRoast ]
FitLook is the middle screen and the default “daily planning” tool.
 
📅 FitLook Date Behavior
Unlike FitScore:
•	FitLook does NOT require a selected date
•	It ONLY displays today’s outlook
•	No historical FitLook
(for now — future versions may store it)
Why?
Daily outlook is only meaningful for the current day.
 
🧠 FitLook AI Logic (Clear & Simple)
Step 1 — Analyzes Today’s WHOOP
•	Is readiness high / medium / low?
•	Is sleep sufficient?
•	Is HRV trending up or down?
Step 2 — Cross-checks against Training Plan
•	User has a run today? → Suggest intensity for that run
•	User has strength today? → Suggest warm-up emphasis
Step 3 — Nutrition reinforcement
•	e.g., “prioritize carbs today to support endurance”
•	“extra hydration recommended if HRV dipped”
Step 4 — Micro-focus
One small action:
•	“10-minute morning walk”
•	“longer warmup before training”
•	“earlier bedtime today”
 
⚙️ Backend Requirements for FitLook
Unlike your previous mistaken version, the correct backend structure is:
Endpoint:
GET /api/ai/fitlook
Inputs:
•	WHOOP today
•	Training today
•	Yesterday’s FitScore
•	Goals (optional)
•	User weight (optional — for nutrition focus)
Outputs:
JSON with:
readiness
training_focus
recovery_focus
nutrition_focus(based on yesterdays meal analysis)
tips
energy_curve (optional)
GPT:
Persona = fitLookAi
This persona is solely for the daily outlook.
 
🚫 Important: FitLook does NOT store images.
No photos.
No body-related analysis.
No visual data.
This keeps FitSmart healthy, ethical, and mission-aligned.
 

FitLook = "Daily Outlook" screen inside Insights.
Powered by fitLookAi.

Inputs:
- WHOOP metrics (today)
- Training calendar (today)
- Yesterday’s FitScore
- Optional: goals, injury notes, meals

Outputs:
- Readiness summary
- Training focus
- Recovery focus
- Nutrition focus
- Micro action tip(s)
- Optional: energy curve
- Tone: motivational, practical, clean
Currently DE-PRIORITIZED.
This screen is rebuilt after FitScore.
 
C. FitRoast
Purpose:
A fun, gamified roast based on user’s week:
•	WHOOP metrics (strain lower than grandma’s HRV)
•	Meals (“you ate like a toddler on cheat day”)
•	Training (“you sweated less than your iPhone battery”)
Minimal backend:
•	One endpoint → GPT fitRoastAi
•	No storage needed
•	No date navigation
Also rebuilt later, after FitScore + FitLook.
 
3.4 Navigation Flow Spec for Claude Code
When rebuilding, Claude Code must implement:
<Tab.Screen name="Insights">
  <TopNav tabs={["FitScore", "FitLook", "FitRoast"]} />
</Tab.Screen>
Rules:
•	Default = FitScore.
•	Subscreens do not affect bottom tabs.
•	Switching screens must preserve scroll position independently (per screen).
•	FitScore must re-fetch data when switching dates—not when switching tabs.
 
SECTION 4 — BACKEND DATA FLOW (HOME + FITSCORE)
To rebuild correctly, Claude Code needs the exact data flow that existed before we lost the code.
Below is the complete architecture in one place.
 
4.1 The Four Data Sources
1. WHOOP v2
Provides:
•	sleep score
•	sleep hours
•	recovery %
•	HRV
•	strain
Used in:
•	Home tab (today, yesterday, weekly)
•	FitScore (Recovery + Training inputs)
•	FitLook / FitRoast context
 
2. Meals (Supabase)
Each meal entry includes:
•	photo_url
•	meal_type
•	timestamp
•	ai_analysis (paragraph)
•	nutrition_sub_score (1–10)
Used in:
•	FitScore nutrition component
•	FitScore meal popups
•	Coach’s Take context
 
3. Training (Calendar ICS)
Calendar events parsed from:
•	Google Calendar
•	XPS training calendar
Each event includes (additional screen when logging FitScore):
•	title
•	duration
•	tags (Strength / Cardio/ Speed/ e.t.c.)
•	comments (optional): injury notes/  training specifics/ other comments
Used in:
•	FitScore training component
•	Training AI blurb
 
4. GPT Personas
•	fitScoreAi → numeric scores (meal subscores, nutrition score)
•	fitCoachAi → narrative text (daily insight, tomorrow preview)
•	fitLookAi (later)
•	fitRoastAi (later)
 
4.2 How Home Tab Fetches Data
Home uses three internal endpoints:
GET /api/whoop/today
GET /api/whoop/yesterday
GET /api/whoop/weekly
These produce:
•	Today tiles (with delta vs yesterday)
•	Yesterday block
•	Weekly averages block
Coloring logic:
•	Red if worse than comparison baseline
•	Grey if equal
•	Green if better than baseline
The previous coloring rules will be documented in the FitScore section.
 
4.3 How FitScore Screen Fetches Data
FitScore makes three parallel calls:
GET /api/meals/today
GET /api/whoop/today
GET /api/calendar/today
Then the frontend composes:
1.	Meals Section → Meal cards + analysis popup
2.	Training Section → session + strain + AI blurb
3.	Recovery Metrics Section → sleep hrs, sleep score, recovery %, HRV
4.	FitScore Triangle (recovery/training/nutrition scores/ avg of all in the middle = FitScore)
5.	FitCoachTake (main narrative)
6.	Tomorrow’s Outlook (small recommendation)
Then FitScore screen displays them in this final order:
Meals
Training
Recovery Metrics
Triangle Breakdown
Coach’s Take
Tomorrow’s Outlook
 
4.4 FitScore Calculation Data Dependencies
FitScore requires:
Nutrition:
•	Average (nutrition_sub_score per meal)
•	if 0 meals → nutrition score = 1.0 by default
Recovery:
•	WHOOP recovery score (%) → convert to 1–10 scale:
o	0–33% = 3
o	34–66% = 6
o	67–100% = 9
(simple mapping — will be defined in Section 5)
Training:
•	WHOOP strain (0–21) → convert to 1–10 scale
•	The additional data user will provide with for the training/ injury/ goal context (additional screen that users fills out after meal upload)
•	Training session metadata influences AI narrative, but not the numeric formula (for now)
Final:
FitScore = average(recovery_score_1to10, training_score_1to10, nutrition_score_1to10)
 
4.5 GPT Flow for FitScore
FitScore AI calls happen in this order:
1️⃣ fitScoreAi
•	Generates:
o	nutrition_subscores per meal
o	nutrition average
o	structured notes for triangle explanation (optional)
2️⃣ fitCoachAi
•	Uses all data (WHOOP + Meals + Training)
•	Generates:
o	“Coach’s Take” (narrative block)
o	“Tomorrow’s Outlook” (1 actionable metric with +X change)
o	Training blurb
Important:
FitScoreAi handles NUMBERS.
FitCoachAi handles WORDS. This is the key that has to make the user want to come back the next day
✅ SECTION 5 — FitScore Screen Blueprint (Full Spec)
⭐ Purpose of the FitScore Screen
FitScore is the daily anchor of FitSmart.
It provides a single performance score (1–10) based on:
1.	Recovery
2.	Training
3.	Nutrition
It is the only screen where all data sources converge:
•	WHOOP → Recovery + Sleep + HRV + Strain
•	Supabase → Meals + Meal analysis
•	Calendar/XPS → Training plan
•	GPT → Analysis + Coaching + Forecast
 
🔷 1. Screen Structure (Final Layout Order)
The FitScore screen ALWAYS follows this order:
1. Meals Section
2. Training Section
3. Recovery Metrics
4. Score Breakdown Triangle
5. FitCoach’s Take
6. Tomorrow’s Outlook
Identical structure every day, for both:
•	Today
•	Previous days (read-only mode)
 
🔷 2. Date Selector (Top Navigation)
At the very top:
<  TODAY  >
•	Swiping left/outside arrow → yesterday, then earlier days.
•	Only TODAY is editable.
•	All previous days are historical and read-only.
When switching dates:
•	Fetches historical WHOOP data
•	Fetches meals from Supabase (filter by date)
•	Fetches training sessions for that day
•	Shows archived FitScore result if already generated
•	Does not re-run AI unless today
 
🔷 3. Meals Section (Horizontal Scroll)
3.1 Purpose
Represents user’s nutrition for the day.
Feeds into nutrition_score.
3.2 UI Rules
Each meal appears as a card:
•	Meal photo square
•	Meal-type label (Breakfast / Lunch / Snack…)
•	Nutrition sub-score badge (1–10)
o	Color:
	Red (1–3)
	Yellow (4–6)
	Green (7–10)
•	Under card:
o	Short summary (e.g. “Balanced meal”)
o	“✨ Tap for details”
3.3 On Tap → Meal Analysis Modal (in brand colouring)
Expands to show:
Title: Breakfast
Score: 7.2/10
Analysis:
Good carb balance but low protein. 
Add eggs or Greek yogurt to boost recovery.
This is generated by fitScoreAi.
3.4 How Meals Impact Nutrition Score
nutrition_score = avg(nutrition_subscores of all meals)

If no meals logged → nutrition_score = 1.0

3.4 How the FitScore calculation works
3.4 How FitScore Calculation Works (Final Spec Text)
1. Start State (Before Logging Meals)
When the user opens today inside FitScore:
•	Only the Meal Upload Section is visible
•	Training section is hidden until at least 1 meal is uploaded
•	FitScore triangle, insights, and all AI-generated text are hidden
•	Button shown:
“Add today's meals to generate FitScore”
 
2. After At Least 1 Meal Is Uploaded
Once the first meal image is uploaded:
•	MealGallerySection appears, showing:
o	Meal images
o	Tap to open meal analysis modal
•	Training Section becomes editable
User can add contextual data such as:
o	Type of training
o	Session duration
o	Goal of session
o	Intensity rating
o	Comment field: How the session felt; Injury + goal context
o	“Skipped training” toggle
After any training edits, user taps:
“Save changes”
 
3. “Calculate My FitScore” Button Appears
This only appears when both conditions are met:
1.	≥ 1 meal logged
2.	Training section saved at least once
Button text:
“Calculate My FitScore”
When tapped → FitScore generation process begins.
 
4. FitScore Generation: Section-by-Section Reveal
The FitScore is NOT shown instantly.
It reveals itself step-by-step, like a guided “assessment journey”, where after each section appears, user has a clean button with really nice animation showing “Analyse The Next Section)” After user trigger  the next section appears
The order:
 
Step 1 — Nutrition Score Calculation
Backend gathers:
•	All today’s meals
•	AI meal scores (1–10 each)
•	Nutrition analysis text (FitScoreAi persona)
Backend returns:
•	nutrition_score = average of all meal scores
•	detailed explanation of nutrition quality
UI behavior:
•	Nutrition card animates into view
•	AI text appears with fade-in
Persona: FitScoreAi
 
Step 2 — Recovery Section Analysis
Recovery metrics used:
•	Recovery %
•	Sleep score
•	Sleep hours
•	HRV trend (↑ / ↓ / —)
Strain color-coded relative to today’s recovery.
Backend computes:
•	recovery_score (0–10)
•	AI insight text explaining recovery quality
UI:
•	“Recovery Summary” card fades in
•	AI text appears under the metrics
Persona: FitScoreAi
 
Step 3 — Training Section Analysis
Backend uses:
•	WHOOP strain
•	Calendar events (planned training)
•	User-added training context
•	Injury flags
•	Goal alignment
Outputs:
•	training_score (0–10)
•	short explanation
•	deeper AI analysis (FitScoreAi)
UI:
•	Training card animates in
•	AI insight follows
Persona: FitScoreAi
 
Step 4 — FitScore Triangle + Final Scores
Now that all 3 components are known:
•	recovery_score (0–10)
•	nutrition_score (0–10)
•	training_score (0–10)
FitScore = average of the three components
(rounded to 1 decimal)
UI:
•	Triangle component animates into view
•	Each small triangle lights up green/yellow/red
•	Central FitScore value fades in
•	1-sentence summary appears below
Persona: FitScoreAi
(only for the 1-line summary)
 
Step 5 — FitCoach Section: Deep Personalized Reflection
FitCoachAi receives the FULL day context:
•	FitScore + all subscores
•	All WHOOP metrics
•	All meals
•	All training context
•	Yesterday’s FitScore
•	Trends over last 3–7 days
Outputs:
•	“Coach’s take” (emotional, supportive, 2–4 sentences)
•	Motivation based on your history (“This is a comeback day!”)
Persona: fitCoachAi
UI:
•	Card animates with subtle “soft pulse” highlight
 
Step 6 — Tomorrow’s Outlook
FitCoachAi provides:
•	Sleep recommendation
•	Nutrition focus
•	Training tip
•	Small actionable task (“10 min morning walk”)
UI:
•	Final card slides up from bottom
•	Acts as “See you tomorrow” anchor
Persona: fitCoachAi
 
End State
The full FitScore screen now shows, in this exact order:
1.	Meals section (scrollable/ meal cards tappable)
2.	Training section
3.	WHOOP recovery section
4.	FitScore triangle
5.	FitScoreAi summary
6.	Coach’s take (FitCoachAi)
7.	Tomorrow’s outlook (FitCoachAi)
The experience feels like:
a personalized daily debrief + mini coaching session.

 
🔷 4. Recovery Metrics Section 
Title:
Recovery Metrics (provided by WHOOP)
Displayed vertically as a 4-line list:
Sleep Hours
Sleep Score (%)
Recovery Score (%)
HRV (ms)
4.1 Values
Example:
9.1 hrs
83%
71%
42 ms
4.2 AI Note Under It
Small green “sparkle” icon ✨
Example:
✨ Strong sleep foundation—prioritize nutrition to match your recovery level.
Generated by fitScoreAi.
4.3  How Recovery Score is calculated (1–10 scale)
Recovery_score is calculated from three subfactors:
1. Recovery % (50% weight)
This is the main recovery input.
2. Sleep quality (35% weight)
Sleep_hours + Sleep_score combined into a value from 0–10.
3. HRV trend (15% weight)
HRV relative to 7-day rolling baseline, expressed as:
•	+2 or more ↑ = positive
•	–2 or more ↓ = negative
•	otherwise neutral
 
📌 Part A — Recovery % → 1–10 scaled
We map WHOOP recovery % using a smooth linear scale:
recovery_scaled = round( (recovery_percent / 100) * 10 )
Examples:
•	82% → 8.2 → 8
•	45% → 4.5 → 5
•	20% → 2.0 → 2
 
📌 Part B — Sleep Quality → 0–10
Sleep contributes two things:
Sleep_hours points (0–6 points)
if hours >= 8.0 → 6
if 7.0–7.9 → 5
if 6.0–6.9 → 4
if 5.0–5.9 → 3
if 4.0–4.9 → 2
if < 4.0 → 1
Sleep_score % (0–4 points)
sleep_score_scaled = round((sleep_score_percent / 100) * 4)
Sleep_quality = hours_points + sleep_score_scaled
Example:
•	7.6 hours → 5 points
•	sleep score 83 → 3 points
= 8/10 sleep_quality
 
📌 Part C — HRV Trend → –2 to +2 points
We compare today’s HRV with a baseline of last 7 valid HRV values.
delta = today_hrv - baseline_hrv
Apply tiered scoring:
if delta >= +8 → +2
if delta >= +3 → +1
if -2 <= delta <= +2 → 0
if delta <= -3 → -1
if delta <= -8 → -2
Then rescaled to 0–10:
hrv_scaled = 5 + delta_points   // range becomes 3–7
So HRV has a small influence, never dominating the score.
 
📌 Final Weighted Recovery Score
We now combine the 3 components:
recovery_score = round(
    (recovery_scaled * 0.50) +
    (sleep_quality * 0.35) +
    (hrv_scaled * 0.15)
)
Always round to nearest integer 1–10.
 
📌 Example (with weights)
Inputs (same as before):
•	Recovery % = 62 → recovery_scaled = 6
•	Sleep = 7.4 hrs (5) + sleep score 78% (3) → sleep_quality = 8
•	HRV delta = –5 ms → delta_points = –1 → hrv_scaled = 4
Final Weighted Score
recovery_score =
  (recovery_scaled * 0.50) +
  (sleep_quality * 0.35) +
  (hrv_scaled * 0.15)
Plug in numbers:
(6 * 0.50) = 3.0
(8 * 0.35) = 2.8
(4 * 0.15) = 0.6
Sum:
3.0 + 2.8 + 0.6 = 6.4
Rounded: recovery_score = 6
 
🔷 5. Training Section
5.1 UI Card Example
[ Dumbbell Icon ]   Morning Run
⏱️ 45 min   ⚡ Strain: 12.5   🔥 Moderate intensity (based on what context user adds)
✨ Strong effort today—strain matched your recovery level well.

Training Score Calculation (Final Version, Rebuild-Ready)

Training Score is now composed of 4 weighted subfactors:

Strain Appropriateness (40%)
Session Quality (30%)
Goal Alignment & Injury Safety Modifier (30%)

Each factor produces a 0–10 score.
Then we compute a weighted average.

🔷 1. Strain Appropriateness (40%)

WHOOP strain (0–21) is converted to 0–10:

strain_scaled = round((strain / 21) * 10)

BUT this is NOT the final strain score.

We now adjust it based on Recovery Zone:

If recovery is HIGH (green ≥ 67%)
User can handle higher strain
No penalty
strain_factor = strain_scaled

If recovery is MEDIUM (yellow 34–66%)
Moderate strain is ideal, high strain gets small penalty
if strain_scaled <= 6 → no penalty  
if strain_scaled 7–8 → -1  
if strain_scaled > 8 → -2  

If recovery is LOW (red < 34%)
Low strain ideal, high strain heavily penalized
if strain_scaled <= 3 → no penalty  
if strain_scaled 4–6 → -2  
if strain_scaled > 6 → -4  

Then clamp 0–10.

🔷 2. Session Quality (30%)

This comes from user inputs:

User inputs:
duration (minutes)
intensity rating (1–10)
“How it felt” comment
“Skipped training” toggle

We convert these to a quality score:

Base:
quality = intensity_rating (1–10)

Duration bonus:
if duration >= 60 → +1  
if duration 30–59 → +0.5  
if duration < 30 → +0

Feeling comment analysis (via FitScoreAi):
We analyze text for keywords:
“felt strong” → +1
“steady” → +0.5
“tired / heavy / not good” → -1
“pain / injury / bad” → -2

Skipped training:
if skipped = true → quality = 1

Clamp to 0–10.

🔷 3. Goal Alignment 

Based on user’s training goal (defined in Onboarding):

Examples:
“Improving endurance”
“General fitness”
“Strength building”
“Injury recovery”
“VO2 max improvement”

We map training type → goal match:

Example:
If user goal = “Build endurance”:
run / cycling / cardio → +2
strength → 0
HIIT → +1 (partial)

If user goal = “Strength”:
strength → +2
HIIT → +1
run → 0

Calculation:
goal_alignment_score = 5 + alignment_bonus

Range = 3–8 normally
Clamp 0–10.

🔷 4. Injury Safety Modifier

If user logs injury:
injury_status:
no injury → +2
minor injury → 0
major injury → -2
“pain during training” → -3

injury_score = 5 + safety_modifier

Clamp 0–10.

🔷 FINAL TRAINING SCORE

Now combine everything:

training_score = round(
    (strain_factor * 0.40) +
    (session_quality * 0.30) +
    (goal_alignment_score * 0.20) +
    (injury_score * 0.10)
)

Output: 1–10 
🔷 6. Score Breakdown Triangle (Core Component)
This is the SIGNATURE of the FitScore system.
6.1 Structure
A triangle with 4 zones:
                 [ Recovery Score ]
                    [ FitScore ]
[ Nutrition Score ]              [ Training Score ]
        
Colour coding according to the score of each metric (if all are green, then extra animation is added by making also the middle part green: for congratulating the user):
6.2 FitScore Formula (Final)
FitScore = avg(recovery_score, training_score, nutrition_score)
Rounded to one decimal.
6.3 Under-Triangle Breakdown Line
Example:
FitScore = avg(Recovery, Training, Nutrition)
(i) info icon
FitScoreAi persona short summary:
✨ 7h36m — excellent recovery sleep • 60% WHOOP  moderate readiness 
(-11% vs yesterday) • 4 meals logged • nutrition could improve • 
Smart recovery choice given injury
Generated by fitScoreAi, using structured context.
 
🔷 7. FitCoach’s Take (Main Narrative)
This is the emotional anchor of the daily FitScore.
Generated by fitCoachAi.

Tone:
• warm, supportive, human
• 2–4 sentences
• never repeats raw numbers
• speaks to the user’s patterns, effort, consistency, and mindset
• acknowledges challenges without judgment
• focuses on guidance, not analysis

Purpose:
To make the user feel seen, grounded, and motivated to return tomorrow.

Example:
“Today wasn’t easy, and that’s perfectly normal. What matters is that you 
stayed aware of your limits instead of ignoring them. Treat yourself with 
patience tonight. Tomorrow is a clean slate, and your body responds fast when 
you give it space.” 
🔷 8. Tomorrow’s Outlook (Micro Forecast)

Generated by: fitCoachAi
Tone: warm, supportive, forward-looking. 
Strictly avoids numbers, points, or specific score changes.

Purpose:
Give the user one gentle focus for tomorrow based on:
• today’s recovery
• sleep quality
• HRV direction
• strain alignment
• nutrition consistency

Output:
• 1–2 sentences
• No metrics or percentages
• Soft motivational guidance

Example:
“An early wind-down tonight will set you up for a strong start tomorrow. 
Give your evening a bit of calm and your body will meet you halfway.” 
🔷 9. FitScore AI Roles Clarified
Task	Persona
Meal analysis	fitScoreAi
Meal score (1–10)	fitScoreAi
Nutrition Score	fitScoreAi
Training blurb	fitCoachAi
Recovery blurb	fitCoachAi
FitCoach Take	fitCoachAi
Tomorrow’s Outlook	fitCoachAi
fitScoreAi = numbers
fitCoachAi = coaching
 
🔷 10. API Required For FitScore Screen
FitScore needs 3 backend endpoints:
1) Meals
GET /api/meals/today
2) WHOOP
GET /api/whoop/today
3) Training
GET /api/calendar/today
4) Optional (future)
POST /api/fitscore/generate
Used if FitScore needs storage.
 
🔷 11. Read-Only Mode Rules
If date ≠ today:
•	Meals → no “Add Meal”
•	Training → no editing
•	FitScore not recalculated
•	AI blocks not regenerated
•	Display archived values
 
🔷 12. Previous Bugs to Restore / Avoid
These were already fixed before the wipe:
1. WHOOP HRV sometimes showed "0"
→ Must fallback to last valid HRV.
2. Sleep score vs sleep hours mismatch
→ Use hours as primary when score is missing.
3. Strain sometimes missing
→ Use strain from "cycle" endpoint in WHOOP v2.
4. GPT sometimes generated >4 sentences
→ Must enforce limit in prompt.
5. Tab scroll spacing too large
→ Remove padding bottom from ScrollView.
All of these must be rebuilt correctly.
 
🔷 13. Final FitScore Screen Blueprint Summary
- Clean, predictable, data-driven
- Nutrition → Meals → Meal subscores
- Recovery → WHOOP (sleep hrs, sleep score, recovery %, HRV)
- Training → Calendar + WHOOP strain
- FitScore = avg of 3 subscores
- AI text blocks powered by fitCoachAi
- Meal analysis powered by fitScoreAi
- Date selector with read-only history
- Triangle is the visual core
- Same layout every day

➕ A. Daily Lifecycle & Locking Rules
When is FitScore calculated?
•	FitScore is generated once per day, for today only, usually in the evening, when: user has completed his/her trainings for the day and had all the meals for the day.
•	Trigger: manual action (e.g. “Generate FitScore” button or implicit step when user finishes meals).
•	It can be recalculated multiple times during the same day as long as:
o	It’s still “today” in Europe/Zurich, and
o	User has changed inputs (meals, training, etc.).
Locking behavior:
•	At Zurich midnight:
o	FitScore for that date becomes final.
o	Screen switches to read-only mode for that date.
o	Tomorrow starts a new, blank “today” state.
For past days:
•	Use stored FitScore + stored AI texts.
•	Do not call GPT again or recompute FitScore automatically.
 
➕ B. Timezone & “Today” Definition
•	All day logic is anchored to Europe/Zurich timezone.
•	Backend should:
o	Store timestamps in UTC.
o	Convert to Zurich when:
	Deciding which meals belong to “today”
	Querying WHOOP data for “today”
	Querying calendar events
•	“Today” in FitScore, Home, and Coach tabs must be the same Zurich-day.
 
➕ C. “Ask FitCoach: Why this score?” Behavior
Even though you said earlier “only first line in the prompt”, the behavior spec is:
•	Button lives in the FitScore area (either under triangle or in a small card).
•	Text on button:
Ask FitCoach: “Why this score?”
When tapped:
1.	Navigates to Coach tab.
2.	Pre-fills the chat input with:
3.	Why do I have a FitScore of <X> today?
4.	Uses fitCoachAi persona in the Coach chat.
5.	The actual coach response:
o	Is more narrative than the on-screen FitScore explanation.
o	Can reference any available context (meals, WHOOP, training).
Later, this interaction can be logged in ai_logs (persona = fitCoachAi, type = "why_score").
 
➕ D. Color Threshold Rules (RYG)
For all 1–10 scores (meal subscores, nutrition_score, training_score, recovery_score, FitScore badge colors):
•	Red: 1.0 – 3.9
•	Yellow: 4.0 – 7.9
•	Green: 8.0 – 10.0
Triangle sections follow the same:
•	Recovery wedge color from recovery_score
•	Training wedge color from training_score
•	Nutrition wedge color from nutrition_score
Badge above each meal card also follows this mapping.
 
➕ E. Empty / Fallback States
To avoid weird UX when data is missing:
1. Meals
•	If no meals logged today:
o	Show empty state:
No meals logged yet today. Add your first meal to start building your FitScore.
o	nutrition_score defaults low (e.g. 1.0) until at least one meal exists.
2. WHOOP data
•	If WHOOP not connected or today’s data unavailable:
o	Recovery section shows:
	N/A values
	Greyed-out text
o	FitScore screen should:
	Still calculate FitScore using nutrition + training where possible,
	Or show “Not enough data to calculate FitScore today” if both recovery and training are missing.
Fallback rules:
•	If HRV 0 or missing → use last valid HRV from history.
•	If sleep score missing → base recovery more heavily on sleep hours.
3. Training
•	If no training from calendar / WHOOP:
o	Training card shows:
No structured training logged today.
o	training_score calculation was described before 
➕ F. Link to Home Forecast & History
How FitScore screen connects to the Home tab logic:
•	Most recent FitScore (Home) = last day that:
o	Has a locked FitScore in history.
•	Today’s FitScore Forecast (Home) uses:
o	Today’s partial data (WHOOP + meals so far + planned training).
o	The same FitScore formula, but with:
	Default assumptions for missing meals / training.
•	Once today’s FitScore is generated and locked:
o	Home forecast ring for “today” becomes the actual score.
o	History ring (swipeable card) is updated.
So the data model should allow:
•	fitscore_summary[date]
→ surfaced in both Home and FitScore screen.
 
➕ G. GPT Output Storage
To avoid re-calling GPT on every visit and to keep daily narrative consistent:
For each date and user we store:
In something like fitscore_summary:
•	fit_score
•	recovery_score
•	training_score
•	nutrition_score
•	coach_take (FitCoach’s Take block)
•	tomorrow_outlook (Tomorrow’s Outlook block)
•	breakdown_summary (the short line under triangle, optional)
In meals:
•	ai_analysis for each meal
•	nutrition_subscore (1–10)
These are only regenerated when:
•	FitScore is recalculated for today
•	Or a manual “Regenerate” is triggered (admin-only, later).


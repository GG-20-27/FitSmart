# FitSmart — Product Requirements Document (PRD)

## 1. Product Vision

FitSmart is a personal health and performance assistant that consolidates biometric, nutrition, and training data into a simple, actionable system. It translates complex metrics (e.g., WHOOP Recovery %, sleep hours, strain scores, nutrition logs) into a **red / yellow / green framework** that guides daily decision-making.

Long-term, FitSmart will support multiple wearable ecosystems (WHOOP, Garmin, potentially Oura), training calendars, and lifestyle data. The AI Assistant contextualizes these inputs into **personalized recommendations** that help users recover better, train smarter, and sustain peak performance.

**Core Value Proposition:**

* Eliminate data overload from wearables.
* Provide clear, consistent guidance (daily FitSmart).
* Act as a personalized assistant for athletes, fitness enthusiasts, and health-conscious individuals.

---

## 2. Target Users

**Primary (Phase 1):**

* WHOOP users (semi-pro athletes, fitness enthusiasts, biohackers).
* Early adopters who track both training and nutrition.

**Secondary (Phase 2+):**

* Garmin users (Body Battery, Training Load).
* Broader consumer fitness segment (general health, productivity focus).

---

## 3. Core Features (Phase 1)

### Mobile App (Expo / React Native)

* **Tabs:** Home, Calendar, Assistant, Profile.
* **Home Dashboard:** WHOOP metrics (Today, Yesterday, Weekly, Insights).
* **Assistant:** Chat interface (GiftedChat) connected to `/api/chat`(custom ChatGPT 5 API), enriched with WHOOP + meals context.
* **Profile:** Device connection status, calendar integration, logout, preferences.
* **Meals:** Daily logging (photo + text) → FitScore AI analysis.

### Web App (Node/Express/TS on Replit)

* WHOOP OAuth v2 approval + callback flow.
* Backend APIs for WHOOP data, calendar parsing, and meal storage.

---

## 4. Non-Goals (for now)

* Garmin integration (Phase 2).
* Advanced productivity tools (reminders, tasks).
* Complex social features.
* Full-blown training plan builder (Calendar is integration-first).

---

## 5. Constraints & Dependencies

* **WHOOP approval** required before App Store submission.
* **Expo Go limitations**: must migrate to `expo run:ios` for stable development.
* **Backend hosting on Replit**: monitor resource usage, may need to migrate for scaling.
* **Timezone handling**: all training/calendar events must normalize to Zurich time.
* **Data consistency**: fallback (e.g., sleep.hours if recovery score missing).

---

## 6. Roadmap

### Phase 1 (Now)

* WHOOP-only MVP.
* Stable Home, Assistant, Profile, Calendar integration (XPS/Google ICS parsing).
* Submit for WHOOP approval.

### Phase 2 (Post-Approval)

* Garmin integration (Body Battery, Sleep Score, Training Load).
* Unify WHOOP + Garmin into FitSmart red/yellow/green model.

### Phase 3

* Assistant 2.0: contextual nudges, multi-device insights, habit guidance.
* Enhanced personalization from profile settings.

### Phase 4

* Advanced Calendar features (automated reminders after trainings, preparation tips before big strain days, etc.)
* Auto-alignment of training events with recovery/strain guidance. (injury prevention tips with micro-habit creation)

---

## 7. Success Metrics

* Daily active users (DAU) / Weekly active users (WAU).
* % of users logging meals consistently (daily or near-daily).
* WHOOP approval + App Store/TestFlight submission.
* Net Promoter Score (NPS) > 7 within first 3 months.
* Retention: 60% of active users still engaged after 4 weeks.

---

## 8. Profile & Auth Spec

### Profile Tab (Mobile)

* **Account:** user info, logout.
* **Devices:** WHOOP connection status (Connected/Not connected, last sync).
* **Training Calendar:** paste ICS link (XPS/Google), status + last import.
* **Meals:** toggle daily meal reminders.
* **Privacy:** (Phase 2) data export + delete.

### Authentication

* **Phase 1:** Static JWT for only admin user (works for MVP & GPT schema, Bearer Auth).
* **Phase 2+:** Supabase Auth → per-user JWTs, stored in SecureStore/cookies, verified server-side.
* Bearer Auth schema remains constant; migration is transparent to GPT Actions.

### Provider Connections

* `connections` table (per provider, encrypted tokens, refresh logic).
* WHOOP OAuth flow via web → Supabase user mapping.
* n8n jobs handle daily sync, token refresh, and data backfill.

### Calendar Integration

* **Preferred:** ICS link (Google/XPS).
* **Fallback:** ICS file upload.
* Events adapting to users time-zone.
* Daily API `/api/calendar/today` returns structured events.

### GPT Integration

* **One multi-tenant Custom GPT.**
* Uses OAuth Actions with Bearer Auth.
* GPT queries FitSmart API → server injects WHOOP, meals, calendar and personalized context per user.
* No per-user GPT duplication (all personalization at runtime).

---

## 9. Onboarding spec

### Onboarding Flow

Onboarding is a critical user experience for FitSmart AI. It ensures personalization from the start, helps retain users, and establishes trust. The onboarding process is designed to be **progressive, value-framed, and rewarding**: each step is explained as necessary for better personalization, and users see an immediate benefit (their first FitSmart or assistant setup confirmation).

#### UX Principles
- Short, focused steps (1–2 questions per screen).  
- Value framing: explain why each question matters (“This helps me tailor recovery advice to you”).  
- End with a compiled profile summary → user feels ownership.  
- Result = immediate context for the Assistant and personalized FitSmart calculations.  

#### Data Captured (Phase 1)
- Sport & competitive level.  
- Weekly training load (sessions & types).  
- Top performance/body goals (short-term + long-term).  
- Nutrition targets (macros if available; FitScoreAi helps estimate otherwise).  
- Dietary restrictions or preferences.  
- Injuries or limitations.  
- Tone of voice preference (casual, pro, formal, custom).  
- Timezone (for calendar + daily nudges).  
- Communication language.  

#### Extended Data for Future Phases
- Physical test results or benchmarks (optional).  
- Mindset & recovery questions (mental fatigue, recovery aids).  
- Equipment/environment context.  
- Progress review preferences (daily check-in vs. weekly summaries).  

#### Technical Flow
- Data stored in `profiles` table, tied to `user_id`.  
- Accessible via `/api/profile`.  
- During chats, backend automatically injects `profile` data into GPT context (server-side composition).  
- No schema rewriting per user; personalization happens at runtime.  
- Optional **Onboarding GPT** available as conversational alternative, which writes answers directly to `/api/profile`.  
- n8n workflow can trigger reminders and a welcome message once onboarding is complete.  

#### Outcome
- Every new user has a structured profile.  
- Assistant instantly adapts tone, advice style, and recommendations.  
- Personalization is consistent across mobile app and GPT assistant.  

---

## 10. Security & Data Handling

* Tokens encrypted at rest (Supabase Vault / pgcrypto).
* Row-level security (RLS) → users only access their own data.
* Logs redacted; TLS enforced.
* Data stored: WHOOP summaries, meal logs, calendar events, preferences.
* Data not exposed: raw WHOOP/Garmin tokens.

---

## 11. Future Considerations

* Notifications (meal reminders, daily FitSmart nudges).
* Garmin integration as a growth driver.
* Cross-device context → daily health/performance summary.
* Export of FitSmart into SaaS app / white-label product.

---
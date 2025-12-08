# FitSmart AI — Implementation Plan

This document translates the PRD into a **step-by-step staged plan** with clear sub-steps for execution. It is aligned with current app progress (Stage 1 mostly complete) and defines what remains to be built.

---

## Stage 1: Foundation & Setup ✅

**Status:** Mostly complete

**Sub-steps:**

* [x] Set up Expo app with bottom tab navigation (Home, Calendar, Assistant, Profile).
* [x] Configure static JWT auth with SecureStore.
* [x] Connect to backend and fetch WHOOP data.
* [x] Display Today’s metrics (Sleep Score, Recovery, Strain, HRV, Sleep Hours, Resting HR).
* [ ] Format WHOOP metrics consistently (e.g., HRV decimals → rounded).

---

## Stage 2: Core Features (Phase 1 MVP)

**Status:** In progress

**Sub-steps:**

### Home Tab

* [x] Display Today’s WHOOP metrics.
* [x] Implement Yesterday + Weekly endpoints fully.
* [ ] Add Insights endpoint.
* [x] Error handling → fallback to “N/A” if data missing.
* [ ] Visual polish (spacing, consistent typography).

### Assistant Tab (Coach)

* [x] Integrate GiftedChat UI.
* [x] Connect to `/api/chat` endpoint.
* [x] Backend injects context (WHOOP today + yesterday + weekly + calendar).
* [x] Verify responses return personalized context with real WHOOP data.
* [x] Add image upload from photo library for meal analysis.
* [x] Implement OpenAI vision API for image analysis.
* [x] Fix message order (newest at bottom with inverted ScrollView).
* [x] Fix keyboard blocking issue with KeyboardAvoidingView offset.
* [x] Implement hybrid chat memory system (short-term + mid-term + long-term).
* [x] Create chat_history table for message persistence.
* [x] Create chat_summaries table for conversation compression.
* [x] Add conversation summarization service with OpenAI integration.
* [x] Add token limit guards and context truncation logic.
* [x] Display memory continuity indicator in mobile UI.
* [ ] Rename "Coach" → "Assistant" (optional UI polish).

### Profile Tab

* [x] WHOOP connection status (Connected/Not connected, last sync).
* [x] Training Calendar: input field for ICS link + validation.
* [x] Logout (clear SecureStore JWT).
* [x] Preferences: toggle for daily meal reminders.

### Calendar Tab

* [x] Parse ICS feed (Google/XPS).
* [x] Normalize events to user timezone.
* [x] Display today's and upcoming events.
* [x] Month view with event dots.
* [x] Agenda list for selected day.

### Onboarding Flow

* [ ] In-app onboarding wizard (progressive Q&A).
* [ ] Save onboarding answers into `profiles` table.
* [ ] Optional: Onboarding GPT (conversational alternative).
* [ ] n8n workflow → trigger welcome message + reminders setup.

---

## Stage 3: Phase 2 Expansion (Post-Approval)

**Sub-steps:**

* [ ] Migrate from static JWT → Supabase Auth (per-user JWTs).
* [ ] Store WHOOP tokens per user in `connections` table.
* [ ] Support multiple users in backend.
* [ ] Garmin integration: Body Battery, Training Load, Sleep.
* [ ] Normalize WHOOP + Garmin metrics into unified red/yellow/green FitSmart.

---

## Stage 4: Assistant 2.0 + Advanced Features

**Sub-steps:**

* [x] **Hybrid Chat Memory System** (Core personalization infrastructure):
  - [x] Short-term context: Last 30 messages retrieved from chat_history
  - [x] Mid-term context: Weekly conversation summaries from chat_summaries
  - [x] Long-term context: Complete message archive in chat_history
  - [x] Token limit guards and context truncation (max 6000 tokens)
  - [x] Automated summarization endpoints for cron/n8n jobs
* [ ] Advanced Calendar: automated reminders before big strain days.
* [ ] Post-training check-ins (assistant asks for feedback).
* [ ] Proactive nudges: meal reminders, recovery guidance, habit creation.
* [ ] Privacy settings: data export + delete (Profile tab).
* [ ] Weekly performance summaries generated automatically.

---

## Data Model (Phase 1)

### Profiles

* `profiles`: goals, training_style, frequency, body_metrics, nutrition_prefs, reminder_prefs, calendar_source_id.

### Connections

* `connections`: user_id, provider, access_token (encrypted), refresh_token, expires_at, last_sync_at.

### WHOOP Data

* `whoop_daily`: user_id, date, recovery_score, sleep_score, strain_score, sleep_hours.

### Meals

* `meals`: user_id, date, image_url, macros (JSON).

### Calendar

* `calendar_sources`: user_id, url, type (ics/file), status, last_fetch_at.
* `calendar_events`: source_id, title, start, end, location.

### Chat Memory

* `chat_history`: id, user_id, role, content, has_images, image_count, created_at.
* `chat_summaries`: id, user_id, summary, message_count, created_at, updated_at.

---

## API Endpoints (Phase 1)

* **WHOOP**: `/api/whoop/today`, `/yesterday`, `/weekly`, `/insights`.
* **Meals**: `POST /api/meals/today`, `GET /api/meals/today`.
* **Calendar**: `POST /api/calendar/source`, `GET /api/calendar/today`, `GET /api/calendar/upcoming`.
* **Profile**: `GET /api/profile`, `PUT /api/profile`.
* **Assistant**: `POST /api/chat` (server composes context with hybrid memory).
* **Chat Memory**: `POST /api/chat/summarize` (user-specific), `POST /api/chat/summarize-all` (admin).

---

## n8n Automations

* Daily WHOOP sync (refresh tokens → fetch → store in DB).
* Daily meal reminders.
* Calendar sync (fetch ICS daily → normalize events).
* Onboarding complete → trigger welcome message.
* Weekly chat summarization (call `/api/chat/summarize-all` to update summaries).

---

## Testing & QA

* Unit tests for API endpoints (Jest).
* Integration tests for WHOOP OAuth + ICS parsing.
* Manual tests:

  * WHOOP connection success/failure.
  * Meal logging (image + text).
  * Calendar parsing.
  * Assistant response personalization.
* Stress test: Yesterday, Weekly, Insights endpoints.

---

## Deliverables (Phase 1)

* Mobile app with Home, Calendar, Assistant, Profile working end-to-end.
* WHOOP OAuth pipeline stable (web-first).
* Onboarding flow saving to profile.
* Assistant injecting personalized context.
* Error handling (fallback → N/A).
* n8n jobs for sync + reminders.

---
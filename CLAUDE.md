# FitSmart — Claude Code Context

> **Keeping this file current:** Update this file when proof cases progress, major features ship, or strategy meaningfully shifts. Don't update it for bug fixes, minor UI changes, or weekly tester notes — those belong in session memory. The architecture and strategy sections should stay stable; the proof cases and tester insights sections are the ones most likely to evolve.

---

## What This App Is

FitSmart is a **daily decision engine for training and recovery** — not a fitness tracker. The distinction matters. Users don't open it to log data; they open it to know what to do today. The core loop is:

> Morning check-in → FitLook (today's plan) → log meals + training → calculate FitScore → improvement plans when patterns emerge

It works for two user types:
- **WHOOP users** — biometric data pulled automatically; richer inputs
- **Manual users** — self-reported morning check-in (recovery, energy, sleep sliders); no wearable needed

Manual mode is the scalable path. WHOOP is capped at 10 testers per OAuth app slot.

### The Real Category

FitSmart occupies a category that doesn't have a clean name yet: **decision support during uncertain training conditions**. This is distinct from:
- Fitness trackers (log what happened)
- Calorie apps (count intake)
- Wearable dashboards (display biometrics)

The app earns its value when decisions are unclear — moderate recovery, injury context, conflicting signals, limited time. It is intentionally less useful when decisions are obvious (acute rest phase, full green recovery day). Do not try to force engagement during low-decision phases.

### Where the Value Lives
The app's value exists precisely when:
- The right answer isn't obvious
- Tradeoffs exist (train vs. rest, push vs. recover)
- A bad decision has real cost (injury setback, overtraining)

This is why rehab users are the best initial segment — the stakes are highest and the uncertainty is constant.

---

## Strategic Context (Read Before Building Anything)

### The Proof Cases

**Proof Case 1 — The Founder:**
Gustavs (founder) had Weber B ankle fracture surgery. 5–6 weeks post-op he was doing 100kg deadlifts, 104kg hip thrusts, calve raises at 100kg, decelerated running — a recovery his physio described as potentially world-record for this injury type. He used FitSmart throughout. The app's rehab scoring, FitLook daily planning, and FitCoach guidance were part of the recovery process alongside physio sessions.

**Proof Case 2 — Early Tester:**
A tester had ACL + meniscus + cartilage surgery (March 2026). Used the app pre-surgery to prepare. Quote: *"It kind of feels like having a personal coach I can ask questions anytime."* FitLook recommended swimming as injury-safe cardio — he rediscovered swimming and it became his main cardio. He is now in acute recovery (rest phase) and will use the app through the full rehab journey.

### Proof Case Framing (Important)

When talking about the recovery proof cases — in pitches, content, or positioning — the correct framing is:

> ✅ "FitSmart helped me make better decisions during recovery — and the outcome was faster than expected"
> ❌ "FitSmart caused my recovery"

This is not just more honest — it's more persuasive to skeptical audiences. Causal claims invite scrutiny. Possibility claims invite identification ("that could be me"). The proof cases are proof of *possibility and narrative*, not causality.

### The Business Strategy
- **Phase 1 (now):** Validate real behavior change with 20–30 users, extract proof cases
- **Phase 2:** Define the core niche — likely rehab/post-surgery users first
- **Phase 3:** Monetise that specific use case (price from value, not fear — physio sessions cost €80–120/session; if app saves one per month, €30–50/month is defensible)
- **Phase 4:** Expand to general athletes, performance, consistency

Rehab is the entry wedge. The broader performance system comes later.

### What NOT to Build Right Now
- Push notifications (masks retention problems, doesn't fix them)
- Trend charts and dashboards (no data depth yet after <2 weeks)
- Social features (no proof cases to share yet)
- Kickstarter (distraction)
- B2B/clinic features (right direction, wrong timing)

### What Matters Most Right Now
1. **Close the daily loop** — users log meals but ~50% don't calculate FitScore. FitScore needs to feel like "the result you unlock" not "another button to press"
2. **Manual mode perceived intelligence** — the trust gap is not data, it's interpretation. "Your energy is moderate, not enough for high intensity" beats "Energy: 5". The app must feel like it processed the input, not mirrored it back
3. **FitCoach voice consistency** — FitLook, FitCoach, and FitScore explanations should feel like the same intelligence

---

## Dev Workflow

```bash
# Local development
ngrok http --domain=fitsmart.ngrok.app 3001   # tunnel
cd ~/Documents/FitSmart && npm run dev         # server
cd ~/Documents/FitSmart/mobile && npm run dev  # mobile

# Production deploy
git push                                        # Railway auto-deploys server
eas update --channel production                 # OTA mobile update (run manually — EAS CLI not in bash tool)
```

**Never need a new build for JS/logic changes — EAS update handles it.**
New builds only needed for: native module additions, app.config.js changes that affect native layer, new permissions.

---

## Stack

| Layer | Tech |
|---|---|
| Mobile | React Native (Expo), TypeScript |
| Server | Node.js / Express, TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| DB Host | Supabase |
| Server Host | Railway |
| Health data | WHOOP API (OAuth) |
| AI | OpenAI (GPT model, see `OPENAI_MODEL` env) |
| OTA updates | EAS Update |
| Email auth | Resend API |

---

## Key Files

| File | Purpose |
|---|---|
| `mobile/src/screens/FitScoreScreen.tsx` | Main screen — meals, training, FitScore calculation, improvement plans |
| `mobile/src/screens/GoalsScreen.tsx` | Goals, user context, improvement plan modals |
| `mobile/src/screens/FitLookScreen.tsx` | Daily plan screen — FitLook + feeling check-in |
| `mobile/src/screens/DashboardScreen.tsx` | Home — readiness card, FitRoast banner, summary |
| `mobile/src/navigation/InsightsNavigator.tsx` | Tab navigator for FitScore / FitLook / FitRoast |
| `mobile/src/api/client.ts` | API request helper (adds auth headers, ngrok header) |
| `server/routes.ts` | All API routes — improvement plans, FitRoast, FitLook, check-ins |
| `server/storage.ts` | DB access layer (Drizzle queries) |
| `server/services/openAiService.ts` | All AI prompts — meal analysis, FitLook generation, FitRoast, training session |
| `server/services/trainingScoreService.ts` | Training score + expected strain band logic |
| `server/services/contextPack.ts` | Builds user context summary string for AI prompts |
| `shared/schema.ts` | Drizzle schema — source of truth for DB tables |

---

## Architecture Notes

### Users & Auth
- `authProvider`: `"whoop"` | `"email"`
- `dataSource`: `"whoop"` | `"manual"`
- Admin WHOOP ID: `25283528` (env: `ADMIN_WHOOP_ID`) — can have multiple active improvement plans simultaneously
- JWT auth on all routes via `requireJWTAuth` middleware

### Database Tables (key ones)
- `users` — auth, dataSource, authProvider
- `meals` — meal logs with AI analysis (`analysis_result` JSON)
- `training_data` — training sessions with scores
- `fit_scores` — daily FitScore calculations (date stored as text `YYYY-MM-DD`)
- `manual_checkins` — morning check-in data for manual users
- `fitlook_daily` — generated FitLook plans
- `fitroast_weekly` — weekly FitRoast (generated Sunday end-of-day as fallback)
- `improvement_plans` — active/completed/expired plans per user
- `habit_checkins` — daily habit completion tracking
- `user_goals` — user-set goals with sub-goals
- `user_context` — user profile (archetype, injury, sport, macro targets, etc.)
- `chat_history` — FitCoach conversation history

### Improvement Plans
- Three pillars: `nutrition` | `training` | `recovery`
- Unlock condition: 5 consecutive days with a pillar score below threshold
- Exit condition: 7-day rolling average ≥ 7 for that pillar
- `computePillarWeakness(userId, excludePillars?)` — returns weakest non-active pillar
- Plan types auto-detected from data patterns (consistency / load management / alignment for training)

### Rehab Scoring (trainingScoreService.ts)
Expected WHOOP strain bands by rehab stage:
| Stage | Band | Ideal |
|---|---|---|
| Acute (rest & protection) | 6–11 | 8 |
| Sub-acute (light movement) | 7–12 | 9.5 |
| Rehab (guided exercises) | 8–16 | 11 |
| Return to training | 8–20 | 13 |

`rehabActive` flag is set when injury type, rehab stage, or goal contains rehab/post-surgery keywords — overrides normal recovery-zone bands entirely.

### Manual Mode Recovery Formula
```
recovery = 0.5 × recoverySlider + 0.3 × energySlider + 0.2 × sleepScore
sleepScore: <5h→3, 5-6h→5.5, 6-7h→7, 7-8h→8.5, 8h+→10
```

### FitRoast
- Weekly roast generated Sunday 23:59 Zurich time as end-of-day fallback
- Users can generate it manually any time on Sunday after checking sub-goals
- Table: `fitroast_weekly` (not `fitroast`)
- Dev reset endpoint: `DELETE /api/fitroast/current-dev?userId=X` (requires `ALLOW_DEV_ENDPOINTS=true`)

### InsightsNavigator
- Default tab: FitLook
- All 3 screens kept mounted (display: none/flex) to prevent state reset on tab switch
- FitLook check-in cached in AsyncStorage keyed by date to prevent feeling question flashing on remount

---

## Emergent Product Behaviors (Don't Overengineer These)

Two behaviors emerged from early testers that were not deliberately designed. They are more valuable than anything that could have been designed intentionally — so don't try to "improve" them with explicit features:

**1. Emergent accountability ("judged by the app")**
> *"I switched sweets to fruit just to not get judged by the app"*

Users changed behavior to avoid a bad score — not because of a reminder or a streak, but because the scoring felt real enough to optimize for. This is loss aversion working in the app's favor. It requires the scoring to remain credible. Do not add "encouraging" language that softens bad scores — the friction is the feature.

**2. Emergent gamification**
> *"It felt like playing a game where you try to level up yourself every day a bit"*

Nobody designed this. It emerged from the FitScore triangle, daily loop, and meal scoring. Do not add badges, streaks, or points to "gamify" the app — the emergent version is stickier because it feels real, not game-like.

---

## Tester Feedback Patterns (First 3 Weeks)

From 3 weekly testers (week 1–3, March 2026):
- **All 3 users open app 5–7 days/week** — strong daily retention
- **100% say it influenced at least one decision every week** — behavioral change is real
- **"Would you miss it" score**: consistently 7–8/10
- **Most valued**: FitLook daily plan, meal analysis/scoring, FitCoach, calorie/protein tracking
- **Least used**: Goals section — users forget to update it, or don't find it necessary. Core loop is strong enough without it.
- **Key quote**: *"It felt like playing a game where you try to level up yourself every day a bit"* — the gamification is emergent, not designed. Lean into this framing.
- **Rehab user insight**: Training scored "too cautious" for return-to-training stage (now fixed — band raised to 8–20)

---

## Environment Variables (never commit, stored in Railway + local .env)

```
DATABASE_URL          — Supabase PostgreSQL connection string
OPENAI_API_KEY        — OpenAI
OPENAI_MODEL          — model name
WHOOP_CLIENT_ID       — WHOOP OAuth (updated March 2026 — new app slot)
WHOOP_CLIENT_SECRET   — WHOOP OAuth
WHOOP_REDIRECT_URI    — Railway callback URL
JWT_SECRET            — JWT signing
RESEND_API_KEY        — email auth
ADMIN_WHOOP_ID        — 25283528
ALLOW_DEV_ENDPOINTS   — true in dev (enables /api/fitroast/current-dev etc.)
```

WHOOP OAuth is limited to 10 testers per app slot. If limit is reached, create new WHOOP developer app and update `WHOOP_CLIENT_ID` + `WHOOP_CLIENT_SECRET` in Railway env vars only — not in codebase.

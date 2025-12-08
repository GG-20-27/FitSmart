# Project Structure — FitScore AI

This document defines the **file/folder organization**, **naming conventions**, and **scalability rules** for the FitSmart AI codebase. Cursor/Traycer should always follow these conventions when creating, moving, or updating files.

---

## 1. Repository Overview

```
FITSMART/
├── .cursor/rules/        # Context engineering rules (generate.mdc, workflow.mdc)
├── docs/context/         # PRD, Implementation, UI/UX, Bug tracking, Project structure
├── mobile/               # React Native (Expo) app – active focus
├── server/               # Node/Express backend (reference only, no major upgrades)
├── data/                 # Example JSON, test data, profiles
├── migrations/           # Database schema changes (Drizzle)
├── shared/               # Shared schema/types between backend services
├── public/               # Static HTML (auth success, test files)
├── attached_assets/      # Assets for docs or app
├── .config/.local/...    # Config and environment state
```

---

## 2. Mobile App Structure (`/mobile`)

Main focus for development.

```
/mobile/
├── .expo/                # Expo project settings
├── src/
│   ├── api/              # API clients (FitSmart backend, WHOOP endpoints)
│   │   └── client.ts
│   ├── screens/          # Tab-based screens (Home, Assistant, Calendar, Profile)
│   │   ├── HomeScreen.tsx
│   │   ├── ChatScreen.tsx   # Assistant (GiftedChat)
│   │   ├── CalendarScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── components/       # Shared UI components (Cards, Buttons, Modals)
│   ├── types/            # TypeScript type definitions
│   ├── services/         # Local services (storage, auth, reminders)
│   └── styles/           # Theming, colors, typography
├── App.tsx               # App entry point
├── app.json              # Expo config
├── package.json
└── tsconfig.json
```

---

## 3. Backend Reference (`/server`)

Backend is **not being upgraded**, but remains for API reference and testing. Cursor should not modify unless explicitly asked.

```
/server/
├── authMiddleware.ts     # JWT middleware (static for now)
├── chatService.ts        # AI assistant endpoint
├── whoopApiService.ts    # WHOOP API integration
├── routes.ts             # Express routes
├── userService.ts        # User handling (minimal for MVP)
├── jwtAuth.ts            # Token logic
├── schema.ts             # Database schema (Drizzle)
└── ...                   # Other utilities and configs
```

---

## 4. Docs & Rules

```
/docs/context/
  ├── PRD.md
  ├── Implementation.md
  ├── UI_UX_doc.md
  ├── Project_structure.md
  └── Bug_tracking.md

/.cursor/rules/
  ├── generate.mdc   # Expands PRD into context docs
  └── workflow.mdc   # Guides Cursor on which file to use when
```

---

## 5. Naming Conventions

* **Components:** `PascalCase` (e.g., `HomeScreen.tsx`, `MetricCard.tsx`).
* **Services & utils:** `camelCase` (e.g., `authService.ts`, `storage.ts`).
* **Types:** `PascalCase` with suffix (e.g., `UserProfile.ts`, `WhoopData.ts`).
* **Styles:** `camelCase` (e.g., `colors.ts`, `typography.ts`).
* **Database migrations:** Timestamp + description (e.g., `2024-add-whoopTokens.sql`).

---

## 6. Scalability Rules

* **One mobile app** (`/mobile`) is the product focus.
* **Backend remains reference** until Supabase migration (Phase 2+).
* **API clients** must always live under `/mobile/src/api/` and import via relative paths.
* **Shared types** should be placed in `/mobile/src/types/` (do not duplicate inline types in screens).
* **Future Supabase auth** → new folder `/mobile/src/services/auth/`.
* **Future notifications** → `/mobile/src/services/notifications/`.

---

📌 **Summary:**
The repo is structured with **mobile-first priority**, backend preserved for API reference, and docs/rules guiding Cursor. New code should follow the conventions above to keep FitSmart scalable and maintainable.


# Supabase API Key Migration Guide (June 2025 Update)

This document describes how FitSmart will handle Supabase's transition from
legacy API keys (anon, service_role) to the new `sb_publishable_...` and
`sb_secret_...` keys. This migration is **not urgent** but will be required
before late 2026.

## 1. Summary of Changes (Supabase)
Supabase introduced new key types in June 2025:

- `sb_publishable_...` → safe for use in client apps
- `sb_secret_...` → backend-only full-access key
- `anon` (JWT) → legacy, will be deprecated
- `service_role` (JWT) → legacy, will be deprecated

Key milestones:
- **Now – Nov 2025:** No required action, but migration recommended.
- **Nov 2025:** New projects will NOT include legacy keys.
- **Late 2026:** Legacy keys removed completely.

## 2. FitSmart Architecture (Current)
FitSmart uses:

Expo App → Node/Express Backend → Supabase

vbnet
Copy code

- The **mobile app never talks to Supabase directly**.
- The backend uses the **service_role** key for DB access.
- anon key is currently unused by the app.

## 3. Migration Requirements for FitSmart
FitSmart must eventually transition from:

- `service_role` → `sb_secret_...`
- (optional) `anon` → `sb_publishable_...`  
  Only needed if we introduce client-side access in the future.

## 4. Migration Strategy
Migration steps (not urgent):

### Step 1 — Generate new keys in Supabase Dashboard
- Create a new **publishable** key: `sb_publishable_...`
- Create a new **secret** key: `sb_secret_...`

### Step 2 — Update environment variables in backend
Replace:

SUPABASE_SERVICE_ROLE_KEY=

csharp
Copy code

with:

SUPABASE_SECRET_KEY=

csharp
Copy code

If needed, also add:

SUPABASE_PUBLISHABLE_KEY=

perl
Copy code

### Step 3 — Update Supabase client initialization in backend
Backend must use:

createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

markdown
Copy code

Client apps (if ever needed) would use the publishable key.

### Step 4 — Rotate keys safely
- Delete legacy `service_role` key only after backend is migrated.
- Ensure no client uses the legacy keys before removal.

### Step 5 — Final cleanup (2026)
- Remove legacy keys
- Remove references to anon/service_role from documentation and codebase

## 5. Notes on RLS
- RLS policies continue to work the same.
- `sb_secret_...` **bypasses** RLS, like service_role.
- `sb_publishable_...` behaves like anon.

No RLS changes required for migration.

## 6. Recommended Timeline for FitSmart
Because FitSmart relies on a custom backend gateway and does not expose
Supabase keys in the app, this migration is **low priority**:

- **June–Nov 2025:** No action needed. 
- **Post-Rebuild:** Migrate backend to `sb_secret_...`.
- **Late 2026:** Remove legacy keys before forced deprecation.

## 7. Action for Claude (Later)
When instructed, Claude should:

- Update backend env loader to use the new key
- Update Supabase client initialization
- Regenerate `.env.example`
- Check all backend services for key usage
- Remove legacy key references safely
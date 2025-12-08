## FITSMART_MASTER_SPEC_USAGE_GUIDE.md

This guide explains how Claude Code must use the **41-page FITSMART MASTER SPEC** when rebuilding the app.  
It is intentionally short, strict, and minimal — exactly what’s needed, nothing more.

---

### 1. The Master Spec Is the Only Source of Truth
Claude must treat the 41-page document as the **single, authoritative reference** for:

- app behavior  
- UI flows  
- FitScore logic  
- WHOOP rules  
- meals & training  
- personas  
- daily lifecycle  
- thresholds & fallbacks

If anything conflicts, the **master spec wins**.

---

### 2. Claude Must Follow the Spec Exactly
Claude must:

- use exact thresholds  
- use exact multi-step flows  
- use exact fallback rules  
- use exact ordering (UI, logic, animations)  
- use the exact behavior described (no simplifications)

No changes unless the user explicitly instructs.

---

### 3. Claude Must Not Invent or Guess Logic
Forbidden:

- creating new scoring rules  
- changing FitScore formulas  
- altering WHOOP interpretation  
- simplifying or compressing steps  
- filling gaps without confirmation  
- changing UI sequences  
- merging logic across sections without instruction  

If unclear → ask.

---

### 4. When Claude Must Ask for Clarification
Claude must ask the user if:

- the master spec has conflicting details  
- information is missing and prevents implementation  
- a rule contradicts code architecture  
- an endpoint requires fields not defined anywhere  
- a multi-step flow is incomplete  

**Only ask when clarification is required to write correct code.  
Not for trivial or obvious parts.**

---

### 5. When Claude Must NOT Ask
Claude should proceed without asking when:

- the logic is explicitly stated in the spec  
- the behavior is fully described  
- the UI flow is clear  
- the threshold/fallback is unambiguous  
- the required data structure is defined  
- page references resolve uncertainty  

Claude must not interrupt for small or obvious implementation details.

---

### 6. Use the Spec Before Every Coding Task
Before generating backend, frontend, or AI code, Claude must:

1. Identify the feature (e.g., FitScore, Meals, WHOOP).  
2. Find the matching sections in the master spec.  
3. Extract the exact instructions.  
4. Confirm internal understanding.  
5. Implement code from those instructions.  

All logic must explicitly reflect the master spec.

---

### 7. Endpoints and DB Schema Must Follow the Spec
When building endpoints or schemas, Claude must:

- use the fields described in the master spec  
- include all values required for UI  
- follow daily lifecycle rules (Zurich time)  
- obey FitScore regeneration/locking logic  
- follow WHOOP normalization rules exactly  

No extra fields, no missing fields.

---

### 8. AI Personas Follow the Master Spec Only
Backend must:

- pass the exact data formats defined  
- call correct personas  
- not override or alter narrative output  
- not generate additional interpretations  

AI personas produce narratives; backend produces numbers.

---

### 9. Final Self-Check Before Output
Before giving final code or implementation details, Claude must confirm:

- it reflects the master spec  
- no logic was invented  
- thresholds & fallbacks match exactly  
- flows are in correct order  
- nothing is omitted  
- nothing added without instruction  

If anything is uncertain → ask.

---

### 10. SAFE DEVELOPMENT NOTICE

- Never include real API keys or secrets.  
- Never modify env variables or auth flow.  
- Never alter framework structure without approval.  
- Never refactor FitScore into client-side logic.  
- Always assume `.env` is loaded by backend loader.  
- All code must be deterministic and production-safe.  

---

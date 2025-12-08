# UI & UX Guidelines — FitScore AI

## 1. Design Philosophy

* **Mobile-first:** Optimized for small screens, one-handed use, quick interactions.
* **Dark theme by default:** Consistent with fitness/health apps, focus on readability in low-light environments.
* **Red / Yellow / Green framework:** Core identity of FitScore. Every visualization must clearly map to this status model.
* **Clarity over complexity:** Simple card layouts, minimal clutter, intuitive navigation.
* **Consistency:** All tabs (Home, Calendar, Assistant, Profile) share visual language.

---

## 2. Current Implementation Baseline

* **Framework:** Expo / React Native.
* **Navigation:** Bottom tab bar → Home, Calendar, Assistant, Profile.
* **Components:** Metrics are displayed as modular cards (WHOOP data → Today, Yesterday, Weekly averages).
* **Assistant:** Chat interface via GiftedChat (basic, to be styled).
* **Profile:** Simple status screens for devices, calendar integration, and logout.

---

## 3. Non-Negotiables

* **Metric cards:** Rounded corners, shadows, modular design.
* **Typography:** Clear hierarchy (headline for tab/page, medium for section titles, small for details).
* **Colors:**

  * Green = good recovery / optimal.
  * Yellow = caution / moderate.
  * Red = poor recovery / risk.
* **Accessibility:** Sufficient color contrast, touch targets ≥ 44px.

---

## 4. UI/UX Workflow (Process)

Since the final design system is not yet fixed, the workflow is defined instead:

### Step 1: UX Structure

* Define flows & layout first (navigation, card grids, chat layout).
* Ensure core user journeys are mapped: checking metrics, chatting with assistant, connecting devices, adding calendar.
* Keep UX wireframes low-color, layout-only.

### Step 2: UI Implementation

* Once flows are validated, apply visual system:

  * Primary dark theme.
  * Red/Yellow/Green consistency.
  * Modular metric cards and charts.
* Use **Cursor** for first-pass implementation.
* For experiments: optionally generate multiple UI variations using **Claude sub-agents** (UX Engineer → UI Implementer → theme variations).

### Step 3: Refinement

* Test with Expo simulator (run:ios).
* Validate usability on both small iPhone (SE/13 mini) and large (Pro Max).
* Adjust colors, spacing, typography.

---

## 5. Future Considerations

* **Customizable themes:** Users can adjust color accents beyond the fixed red/yellow/green model.
* **Micro-animations:** Smooth transitions for metric updates and assistant responses.
* **Calendar reminders:** Notification previews styled consistently with dashboard.
* **Responsive design:** Ensure web dashboard inherits same visual identity.

---

## 6. What is Still Open

* Final FitSmart brand palette (beyond R/Y/G).
* Typography choices (system fonts vs custom).
* Iconography set (currently placeholders).
* Final Assistant chat design (after backend is stable).

---

📌 **Summary:**
This file defines the **rules, workflow, and constraints** for FitSmart's UI/UX. The actual design system (colors, typography, icons) will be decided after backend + API integrations are fully stable. Multiple design variations will be generated and tested before freezing the final style.


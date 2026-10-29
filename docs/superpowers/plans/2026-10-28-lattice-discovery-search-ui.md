# Lattice Discovery Search UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primitive-looking Discovery search/source controls with a quiet search bar and logo-led source picker without changing search behavior.

**Architecture:** Keep `DiscoveryWorkspace` as the owner of the query, selected sources, and search actions. Change only the visual controls and local asset presentation; preserve the current reducer, orchestrator, defaults, and accessible form behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, local public PNG assets, Vitest.

**Spec:** [2026-10-28-lattice-discovery-copilot-ui-design.md](../specs/2026-10-28-lattice-discovery-copilot-ui-design.md)

## Global Constraints

- Preserve the current search query, cancellation, submission, selected-source state, defaults, and disabled-during-search behavior.
- Keep all five source labels visible; selection must not rely on logo color or image loading.
- Use the existing Windchill, SAP, Configit, and Codebeamer assets. Use a neutral "TC" monogram for Teamcenter because no Teamcenter logo exists in the frontend public assets.
- Keep a visible, high-contrast keyboard focus state without a bright blue ring, glow, or focus-fill treatment.
- Do not change search APIs, result presentation, recent investigations, or theme tokens.

## Review Focus

- **A logo fails to load or is visually ambiguous:** the source name and selectable state remain clear; test markup includes both.
- **Teamcenter has no logo:** render a neutral "TC" mark in the same footprint and retain the Teamcenter accessible label.
- **No sources are selected:** the search action stays disabled and the existing search state remains unchanged; retain current behavior.
- **Search is active:** source controls remain disabled and the cancel action remains available; retain current behavior.
- **The viewport is narrow:** search and source controls wrap without horizontal overflow; include a focused browser check at 390px.

---

### Task 1: Refine Discovery Search and Source Selection

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-workspace.test.tsx`

**Interfaces:**
- Consumes: `LATTICE_SOURCES`, `SOURCE_LABELS`, `state.query`, and `state.selectedSources`.
- Produces: the same search form and source checkbox semantics, presented with a contained query control and logo-led selectable source tiles.

- [ ] **Step 1: Add failing markup assertions**

Update the Discovery workspace tests to assert that:
- the four existing image assets are used with descriptive `alt` text and visible source names;
- Teamcenter has a text mark and no fabricated logo path;
- each source remains a checkbox with an accessible label and an observable selected state;
- Windchill and SAP remain selected by default;
- the search field uses the contained, neutral focus treatment and has no cyan ring/glow utility.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run from `OrchestrationPlatform/frontend`:

```powershell
npm test -- features/lattice-next/tests/discovery-workspace.test.tsx
```

Expected: FAIL on the absent logo-led controls and new search styling assertions.

- [ ] **Step 3: Implement the source picker and search treatment**

Update `DiscoveryWorkspace.tsx` with a source-to-local-logo map for Windchill, SAP, Configit, and Codebeamer; render a neutral Teamcenter mark; keep labels and checkbox semantics visible; and use a restrained contained search surface with neutral visible focus. Preserve the existing query handlers, selected-source reducer actions, defaults, submit conditions, and active-search cancellation.

- [ ] **Step 4: Run focused and related Discovery tests**

Run:

```powershell
npm test -- features/lattice-next/tests/discovery-workspace.test.tsx features/lattice-next/tests/discovery-reducer.test.ts
npx eslint features/lattice-next/discovery/DiscoveryWorkspace.tsx features/lattice-next/tests/discovery-workspace.test.tsx
```

Expected: all selected-source and existing search behavior tests pass, with no lint errors.

- [ ] **Step 5: Check the responsive result**

At 390px and desktop width, verify the logos retain stable dimensions, labels stay readable, controls wrap naturally, and the page has no horizontal overflow.


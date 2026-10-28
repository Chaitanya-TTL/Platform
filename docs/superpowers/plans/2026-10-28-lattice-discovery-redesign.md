# Lattice Discovery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Lattice Discovery around a fresh engineering search, with a finite recent-investigation shelf and the existing federated investigation workflow intact.

**Architecture:** Keep `LatticeNextWorkspace`, `DiscoveryWorkspace`, the federated-search orchestrator, reducer, presentation helpers, API authority, and investigation contracts. Add a URL-backed history view and rework only discovery presentation: compact source scope, unified source-aware results, and a three-item recent shelf. Do not alter search or investigation semantics.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, existing `motion` package, existing DM Sans and theme system.

**Spec:** [../specs/2026-10-28-lattice-discovery-redesign-design.md](../specs/2026-10-28-lattice-discovery-redesign-design.md)

## Global Constraints

- Search is the dominant action on `/lattice`; show at most 3 recent investigations on the search view.
- The full-history view requests at most 100 investigations, matching the API's supported maximum; do not imply pagination beyond that limit.
- Preserve the initial Windchill + SAP source selection and all five source connectors.
- Preserve per-source progress, partial success, empty/failure/timeout/cancel states, retry, and successful results when another source fails.
- Preserve result identity, match category/reason, source provenance, technical details, Codebeamer bulk selection, result selection, and governed investigation creation.
- Preserve Active/Archived history, Open, Refresh, Archive, and Restore behavior.
- Keep the existing theme preference, DM Sans, app shell, dependency set, and global styles; do not add a component library or alter backend contracts.
- Do not overwrite or revert existing user changes in `DiscoveryWorkspace.tsx`, `LatticeNextWorkspace.tsx`, or `RecentInvestigations.tsx`.
- Keep the screen concise: no pre-search connector dashboards, decorative gradients/glows, repeated metadata, vanity metrics, or ambient motion.
- Respect keyboard interaction, visible focus, live announcements, reduced motion, phone touch targets, and no horizontal page overflow.

## Review Focus

- **A history-list failure must not block a fresh search.** Task 1 tests that the search view remains present when saved investigations fail to load.
- **Active and archived data must not be mixed.** Task 1 tests the Active/Archived filter and Restore flow in history view.
- **One source can fail while another succeeds.** Task 3 tests that partial/failure status does not hide successful results.
- **No selected sources must not submit a search.** Task 2 tests the Windchill + SAP default, toggling, and disabled/submit conditions.
- **Long engineering IDs and subject labels must remain usable on mobile.** Task 4 checks 390px layout, truncation/wrapping, and horizontal overflow.

---

## File Map

- `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx` — search-first layout, source scope, search/result composition, and recent shelf placement.
- `OrchestrationPlatform/frontend/features/lattice-next/discovery/RecentInvestigations.tsx` — recent/history modes, request limits, history actions, and concise row presentation.
- `OrchestrationPlatform/frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx` — reads the discovery `view=history` query state only in the discovery branch; leave investigation rendering untouched.
- `OrchestrationPlatform/frontend/features/lattice-next/discovery/discovery-reducer.ts` — existing selection/source state; change only if the redesigned controls need a missing state transition.
- `OrchestrationPlatform/frontend/features/lattice-next/discovery/discovery-presentation.ts` — existing source outcome and match wording; retain behavior and add tests for any changed copy/state mapping.
- `OrchestrationPlatform/frontend/features/lattice-next/tests/recent-investigations.test.tsx` — recent/history presentation and empty/error/loading states.
- `OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-reopen-refresh.test.tsx` — open URL and action regression coverage.
- `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-reducer.test.ts` — new reducer coverage for source and result selection.
- `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-presentation.test.ts` — new outcome/match presentation coverage.
- `OrchestrationPlatform/frontend/features/lattice-next/lattice-next.css` — change only if component-scoped Tailwind utilities cannot express the design; do not change global tokens.

## Art Direction

Use the Design Taste app-screen direction **Data terminal** (seed `748557861`) for its disciplined selection treatment and long-session research fit: one 1px accent mark for selected sources/results, neutral text and surfaces, no glow. Keep the existing palette and type rather than adding fonts or a new theme. Do **not** copy the sheet’s generic home blueprint of a greeting and four KPI tiles; it conflicts with the user’s selected search-first task and has no honest metrics to show. The selected layout remains B: search, then a short recent shelf.

## Tasks

### Task 1: Bound recent investigations and add full-history navigation

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/RecentInvestigations.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/recent-investigations.test.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-reopen-refresh.test.tsx`

**Interfaces:**
- Keep the existing `RecentInvestigationsView` callbacks and `InvestigationListItem` data contract.
- Add a typed view mode, `"recent" | "history"`, to the recent-investigation view. Recent mode requests 3 active items; history mode requests up to 100 and retains the Active/Archived filter.
- Use `/lattice?view=history` for full history and `/lattice` to return to search. Keep existing investigation/handoff route branches unchanged.

- [ ] **Step 1: Add failing recent/history view tests**

Add tests that assert recent mode renders at most 3 rows, omits the per-source status dump and archive filter, and exposes a real “View all” link. Add history-mode tests asserting the Active/Archived filter, full row details, row actions, loading/error/empty states, and a “Back to search” link remain available. Test that `investigationOpenHref` still encodes IDs.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run from `OrchestrationPlatform/frontend`:

```powershell
npx vitest run features/lattice-next/tests/recent-investigations.test.tsx features/lattice-next/tests/investigation-reopen-refresh.test.tsx
```

Expected: the tests fail because the component has no view mode or bounded shelf yet.

- [ ] **Step 3: Implement recent and history modes**

Add the view mode to `RecentInvestigations` and `RecentInvestigationsView`. Request limit `3` for recent mode and `100` for history mode. Render concise active rows in the shelf; keep full source/freshness details and existing actions in history. Make history links real Next links, and let `LatticeNextWorkspace` pass the `view=history` state only when rendering discovery.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run the same `npx vitest run ...` command. Expected: all recent-history, archive, reopen, and refresh assertions pass.

- [ ] **Step 5: Commit the bounded-history change**

```powershell
git add OrchestrationPlatform/frontend/features/lattice-next/discovery/RecentInvestigations.tsx OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx OrchestrationPlatform/frontend/features/lattice-next/tests/recent-investigations.test.tsx OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-reopen-refresh.test.tsx
git commit -m "feat: bound lattice discovery history"
```

### Task 2: Rebuild the search-first composer and source scope

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-reducer.test.ts`

**Interfaces:**
- Keep the `DiscoveryWorkspace` `onInvestigate(results, subjectLabel)` callback unchanged.
- Keep `initialDiscoveryState` selecting Windchill and SAP.
- Use the existing `toggle-source` reducer action; do not add a second source-selection state model.

- [ ] **Step 1: Add failing reducer tests for source scope**

Add tests asserting the default source set is exactly Windchill + SAP; toggling another source adds it; excluding a source clears its selected results, invalidates the old search snapshot, and announces the change; no sources selected leaves the query state intact but cannot submit.

- [ ] **Step 2: Run the reducer tests and verify they fail where behavior is missing**

Run from `OrchestrationPlatform/frontend`:

```powershell
npx vitest run features/lattice-next/tests/discovery-reducer.test.ts
```

Expected: missing test file/coverage fails before implementation.

- [ ] **Step 3: Replace pre-search source cards with a compact, accessible source scope**

Make the labelled query input and Search action the first dominant controls. Show the five sources in a compact selector with included/excluded state and the initial Windchill + SAP selection. Keep source-specific readiness and detailed outcomes out of the empty state. Preserve submit/cancel behavior and the current search orchestrator.

- [ ] **Step 4: Run reducer tests and verify they pass**

Run the same `npx vitest run ...` command. Expected: source inclusion, exclusion, selection clearing, and default source assertions pass.

- [ ] **Step 5: Commit the search composer**

```powershell
git add OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-reducer.test.ts
git commit -m "feat: refocus lattice discovery search"
```

### Task 3: Unify federated outcomes and selectable results

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/discovery-presentation.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-presentation.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-reducer.test.ts`

**Interfaces:**
- Consume `FederatedSearchSnapshot`, `SourceSearchOutcome`, `NormalizedSearchResult`, and `DiscoveryState` as currently defined; do not change connector contracts.
- Keep `presentOutcome(source, outcome, query)` and `presentMatch(category)` as the presentation boundary.
- Keep `discoveryReducer` as the owner of result/source selection.

- [ ] **Step 1: Add failing presentation and selection tests**

Test partial outcomes with results and warnings, source failure while another source succeeds, retryable empty/failure states, match-category labels, independent result selection, Codebeamer direct/all/clear selection, and preservation of selection while a result group is collapsed.

- [ ] **Step 2: Run the focused tests and verify any uncovered cases fail**

Run from `OrchestrationPlatform/frontend`:

```powershell
npx vitest run features/lattice-next/tests/discovery-presentation.test.ts features/lattice-next/tests/discovery-reducer.test.ts
```

Expected: the new presentation or reducer assertions fail until the redesigned states are wired.

- [ ] **Step 3: Render source progress and results as one bounded, source-aware working set**

Replace the stack of full source dashboards with concise per-source status and one results list. Each result keeps its source, native identifier, revision/version, and plain-language match category; reveal match reason and technical detail on demand. Initially show no more than 3 results per source and keep an explicit “Show more” action. Keep retry beside the failed source, cancellation while search is active, and Codebeamer bulk actions in its group. Show selected count and Start investigation only when selection is non-empty; retain the identity-evidence caution.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run the same `npx vitest run ...` command. Expected: partial success, independent errors, match labels, and selection behavior pass.

- [ ] **Step 5: Commit the federated results change**

```powershell
git add OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx OrchestrationPlatform/frontend/features/lattice-next/discovery/discovery-presentation.ts OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-presentation.test.ts OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-reducer.test.ts
git commit -m "feat: unify lattice discovery results"
```

### Task 4: Finish responsive behavior, accessibility, motion, and verification

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/RecentInvestigations.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/lattice-next.css` only if scoped utilities are insufficient
- Test: the focused discovery and recent-investigation test files from Tasks 1–3

**Interfaces:**
- No new dependencies, global tokens, source APIs, or investigation contracts.
- Use existing motion package only for action feedback; do not animate the page on load.

- [ ] **Step 1: Verify long identifiers and phone layout**

Run the application and inspect `/lattice` at 1440px, 768px, and 390px. Verify the query field, all source controls, three recent rows, results, selection action, and history navigation remain reachable; long IDs/subject labels wrap or truncate without clipping or page-level horizontal overflow.

- [ ] **Step 2: Verify keyboard, status, and reduced-motion behavior**

Use keyboard only to focus and submit search, include/exclude sources, select results, open technical details/history, and invoke row actions. Confirm focus remains visible, live status announces asynchronous source outcomes, all async errors have a recovery action, and reduced-motion mode removes spatial transitions without hiding status changes.

- [ ] **Step 3: Run the app-screen design checks against the production build**

From `OrchestrationPlatform/frontend`, run:

```powershell
npm run build
npm run start -- --port 3100
```

Against the production server, run:

```powershell
node ../../.agents/skills/design-taste-frontend/scripts/lint.mjs --app features/lattice-next/discovery/DiscoveryWorkspace.tsx features/lattice-next/discovery/RecentInvestigations.tsx
node ../../.agents/skills/design-taste-frontend/scripts/inspect.mjs --app http://localhost:3100/lattice
```

Expected: no app-screen design `FAIL`s at 1440, 768, or 390; review and resolve every `WARN` with a documented reason. Recheck screenshots after the final change.

- [ ] **Step 4: Run focused and full Lattice validation**

Run from `OrchestrationPlatform/frontend`:

```powershell
npx vitest run features/lattice-next/tests/recent-investigations.test.tsx features/lattice-next/tests/investigation-reopen-refresh.test.tsx features/lattice-next/tests/discovery-reducer.test.ts features/lattice-next/tests/discovery-presentation.test.ts
npm run test:lattice
npx tsc --noEmit
npm run build
```

Expected: all selected tests, the Lattice suite, type checking, and production build pass.

- [ ] **Step 5: Commit the verified discovery redesign**

```powershell
git add OrchestrationPlatform/frontend/features/lattice-next/discovery OrchestrationPlatform/frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx OrchestrationPlatform/frontend/features/lattice-next/tests
git commit -m "feat: redesign lattice discovery"
```

## Separate follow-up

The Oxlint anti-slop plugin installation is independent of the UI and is not required to ship it. Plan and validate that tooling change separately in [the anti-slop installation plan](2026-10-28-anti-slop-oxlint.md); do not add Oxlint dependencies or configuration as part of the discovery UI tasks.

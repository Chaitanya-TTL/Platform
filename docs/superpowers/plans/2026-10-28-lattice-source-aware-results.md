# Lattice Source-Aware Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flattened federated search results with a source switcher and source-native record previews that make provenance clear and reduce visible clutter.

**Architecture:** Keep `FederatedSearchOrchestrator`, the search snapshot, and result-ID selection model intact. Add active-source and user-chosen-source state to the existing reducer so asynchronous snapshot updates and cross-source selection behavior can be tested without adding a DOM test dependency. Render one active source panel and derive concise source-specific preview fields from normalized result metadata.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, `motion/react`, Vitest.

**Spec:** [2026-10-28-lattice-source-aware-results-design.md](../specs/2026-10-28-lattice-source-aware-results-design.md)

## Global Constraints

- Do not change connector APIs, result ranking, match semantics, or investigation payloads.
- Preserve per-source progress, partial success, empty/error, retry, cancellation, timeout, and technical-detail behavior.
- Preserve result-ID selection across source-tab changes and keep Codebeamer bulk selection within its tab.
- Do not add dependencies or change the search composer, recent shelf, history, global shell, or theme.
- Show source-specific metadata only when the existing result supplies a non-empty value; never invent values or render empty placeholders.
- Keep the source switcher keyboard-operable, accessible, responsive, and respectful of reduced motion.

## Review Focus

1. **A slow connector responds after the user switches tabs:** the selected tab stays put. Test reducer state across late snapshots.
2. **The first returned source fails or is empty while another succeeds:** the first successful result source becomes active; when all sources finish without results, show the first requested source's actionable status. Test both outcomes.
3. **A selected result belongs to a tab that is no longer active:** its selection remains and contributes to the single selected count. Test cross-tab selection persistence.
4. **A source result lacks optional context or revision:** its preview omits those fields without blank labels or fabricated values. Test sparse metadata for each formatting path.
5. **Codebeamer bulk-select runs while other-source records are already selected:** only Codebeamer IDs are added, replaced, or cleared; other-source selections are not silently lost. Test source-scoped reducer actions.

---

### Task 1: Source-Native Preview Presentation

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/discovery-presentation.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/source-adapters/api-search-adapter.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-presentation.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/api-search-adapter.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-workspace.test.tsx`

**Interfaces:**
- Consumes: `NormalizedSearchResult` and `LatticeSource` from `discovery/contracts.ts`.
- Produces: `presentRecordIdentity(result: NormalizedSearchResult): string` for the native type and identifier/revision; `presentSourceContext(result: NormalizedSearchResult): Array<{ label: string; value: string }>` for non-empty curated context fields; `presentAdditionalSourceContext(result: NormalizedSearchResult): Array<{ label: string; value: string }>` for non-primary metadata disclosed on demand.

- [x] **Step 1: Write tests for presentation and normalized metadata**

Test a native ID/revision for Windchill, SAP material identity, Configit work-item and package identities, Codebeamer tracker/project context, and optional values absent. Assert that empty, null, and undefined metadata is omitted and no metadata label is repeated. Assert that additional source fields are separated from the primary preview and omits fields already presented there. Also test that `ApiSearchAdapter` preserves the SAP `stale: false` boolean supplied in `CandidateContext`.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- features/lattice-next/tests/discovery-presentation.test.ts`
Expected: FAIL because the two presentation helpers are not exported.

- [x] **Step 3: Implement source preview helpers and retain boolean metadata**

Keep visible context to three concise source-specific fields; provide a separate helper for remaining metadata so the UI can disclose it only on demand. Update the adapter's metadata filter to preserve string and boolean context values, including `false`.

- [x] **Step 4: Run the focused test**

Run: `npm test -- features/lattice-next/tests/discovery-presentation.test.ts features/lattice-next/tests/api-search-adapter.test.ts features/lattice-next/tests/discovery-workspace.test.tsx`
Expected: PASS for source identity, curated/secondary metadata, sparse context, and boolean metadata normalization.

---

### Task 2: Source Switcher, Active Results, and Selection Continuity

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-workspace.test.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-reducer.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/discovery-reducer.ts`

**Interfaces:**
- Consumes: `presentRecordIdentity` and `presentSourceContext` from Task 1; current `FederatedSearchSnapshot`, `SourceSearchOutcome`, and result-ID reducer state.
- Produces: `DiscoveryState.activeSource: LatticeSource | null`, `DiscoveryState.sourceSelectionByUser: boolean`, `{ type: "source-tab-selected"; source: LatticeSource }`, and `{ type: "select-source-many"; source: LatticeSource; resultIds: string[]; mode: "replace" | "clear" }`; source tabs for requested sources, one active source's status and records, and a single selected count shared across tabs. Keep the existing `onInvestigate` callback signature unchanged.

- [x] **Step 1: Add focused source-tab markup tests**

Assert source tabs use `role="tablist"`, `role="tab"`, `aria-selected`, and `aria-controls`; panels use `role="tabpanel"`; the active tab label includes source and count/status; and rendered result preview uses the Task 1 identity/context presentation. Preserve the existing SSR test pattern; do not install a DOM testing dependency.

- [x] **Step 2: Add reducer tests for default and user-controlled tab selection**

Test that the first source with results becomes active while no user choice exists, a `source-tab-selected` action marks the choice as user-owned, later snapshots preserve that source, a new request ID resets that choice, and all-terminal empty/failed outcomes fall back to the first requested source.

- [x] **Step 3: Add reducer tests for source-scoped Codebeamer selection**

Select one non-Codebeamer result and one Codebeamer result. Assert Codebeamer direct/all replacement updates only Codebeamer IDs, Codebeamer clear removes only Codebeamer IDs, and the other-source selection remains. Source-tab changes must not modify `selectedResultIds`.

- [x] **Step 4: Run focused tests to verify the new assertions fail**

Run: `npm test -- features/lattice-next/tests/discovery-workspace.test.tsx features/lattice-next/tests/discovery-reducer.test.ts`
Expected: FAIL on absent tab semantics, active-source derivation, or source-scoped bulk selection.

- [x] **Step 5: Implement active-source and scoped selection actions in `discovery-reducer.ts`**

Add `activeSource` and `sourceSelectionByUser` to `DiscoveryState`; add `source-tab-selected` and `select-source-many` actions. Derive the first successful result source while selection is automatic, retain explicit choices during the request, reset the choice on a new request ID, and scope replace/clear operations to IDs belonging to the action's source.

- [x] **Step 6: Implement source tabs and active panels in `DiscoveryWorkspace.tsx`**

Render tabs for requested sources only. Put each source's status and count in its tab and its current status/retry/empty state in the selected panel. Render only the active source's results and remove the separate source-status list.

- [x] **Step 7: Render source-native previews and scope Codebeamer controls**

Lead each result with the Task 1 identity and curated context; keep “Why this match” and remaining technical data behind disclosure. Show one selected count and the existing investigation action regardless of active tab. Show Codebeamer bulk controls only on the Codebeamer tab and dispatch source-scoped actions.

- [x] **Step 8: Run focused Discovery tests**

Run: `npm test -- features/lattice-next/tests/discovery-workspace.test.tsx features/lattice-next/tests/discovery-reducer.test.ts features/lattice-next/tests/discovery-presentation.test.ts`
Expected: PASS, including automatic initial source choice, sticky user choice, source-scoped selection, source-specific previews, tab semantics, and existing search-first behavior.

---

### Task 3: Verify Existing Search and Responsive Behavior

**Files:**
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/discovery-workspace.test.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/recent-investigations.test.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-reopen-refresh.test.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx` only if a regression is found.

**Interfaces:**
- Consumes: Task 2 source-switcher UI and existing Discovery routes/actions.
- Produces: verified production behavior without changes to the recent shelf, history, or investigation flow.

- [x] **Step 1: Run the related Discovery and investigation regression tests**

Run: `npm test -- features/lattice-next/tests/discovery-workspace.test.tsx features/lattice-next/tests/discovery-reducer.test.ts features/lattice-next/tests/discovery-presentation.test.ts features/lattice-next/tests/recent-investigations.test.tsx features/lattice-next/tests/investigation-reopen-refresh.test.tsx`
Expected: PASS.

- [x] **Step 2: Run TypeScript and lint for changed files**

Run: `npx tsc --noEmit` and `npx eslint features/lattice-next/discovery/DiscoveryWorkspace.tsx features/lattice-next/discovery/discovery-presentation.ts features/lattice-next/tests/discovery-workspace.test.tsx features/lattice-next/tests/discovery-reducer.test.ts features/lattice-next/tests/discovery-presentation.test.ts`
Expected: no type errors or new lint errors.

- [x] **Step 3: Build the frontend**

Run: `npm run build`
Expected: production build succeeds; report any unrelated existing build warning separately.

- [ ] **Step 4: Verify the production UI at desktop and mobile widths**

Use the browser to exercise partial failure with successful results, changing source tabs, selecting across tabs, Codebeamer bulk selection, and the all-empty/all-failed state. Confirm tab choice remains stable after late connector responses and that narrow viewports do not scroll horizontally.

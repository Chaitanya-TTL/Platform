# Lattice Copilot Evidence Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, with a fresh reviewer after each task.

**Goal:** Build an on-demand Evidence / Graph / Review workbench around investigation Copilot answers, with a citation-focused Lattice graph that does not mutate the main graph.

**Architecture:** Derive a `RelationshipProjection` from a validated answer's graph citations and render it through a separate `RelationshipCanvas` instance with view-local state. Correlate each citation with its answer message, then let the modal panel switch between the conversation and one contextual view on desktop and phone without changing CopilotKit or persistence contracts.

**Tech Stack:** React 19.2, TypeScript, Next.js 16, CopilotKit V2, XYFlow, existing Lattice projection/canvas infrastructure, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-lattice-copilot-evidence-workbench-design.md`

## Global Constraints

- No API, persistence, agent/runtime contract, message schema, or answer schema changes.
- No dependency changes.
- Use existing Lattice domain/projection data and renderer; no synthetic graph data.
- Keep graph-panel state isolated from main graph state.
- Do not regress accessibility, keyboard focus, reduced motion, archived mode, run gating, safe errors/retry, or real status indicators.
- Preserve unrelated worktree changes; do not stage or commit unrelated files.
- The default context follows the latest validated answer; a citation in an older answer selects that answer's context.
- Include one shortest real parent path per cited entity/endpoint; break equal-length ties deterministically.
- The skill search found responsive/no-horizontal-scroll and keyboard-order guidance, plus React compound tabs and explicitly typed state. Apply those patterns; the React search required a narrower retry after its first query had no match.
- The user-requested `ui-ux-pro-max` and `copilotkit` skills are available; the other specifically named skills recorded in the spec were unavailable in this session. Do not claim to have used unavailable skills or install replacements without approval.

## Review Focus

- Malformed, non-canonical, or unresolved entity/relationship citation IDs must not create graph nodes; test in Task 1.
- Multiple parent paths, cycles, and nodes with no parent must yield one shortest deterministic real path or just the cited node; test in Task 1.
- A relationship citation must include its real endpoints and no unrelated neighbors; test in Task 1.
- An older answer citation and a thread switch must not display another answer's stale graph context; test in Task 3.
- Empty/unvalidated answers must not produce fake evidence; test in Tasks 3 and 4. Archived gating is tested in Task 4, while narrow-layout replacement and overflow are verified at 390×844 in Task 5.

---

### Task 1: Project cited graph evidence

**Files:**
- Create: `frontend/features/lattice-next/copilot/citation-id.ts`
- Create: `frontend/features/lattice-next/engines/project-cited-graph.ts`
- Test: `frontend/features/lattice-next/tests/copilot-citation-id.test.ts`
- Test: `frontend/features/lattice-next/tests/project-cited-graph.test.ts`

**Interfaces:**
- Produces `parseNavigableCitationId(citation: Pick<CopilotCitation, "kind" | "citationId">): NavigableCitationTarget | undefined`, where `NavigableCitationTarget` is a discriminated union for entity or relationship targets.
- Produces `projectCitedGraph(domain: InvestigationGraph, core: InvestigationGraphCore, citations: readonly CopilotCitation[]): CitedGraphProjection`, with `projection: RelationshipProjection` and unresolved graph citations kept separately for truthful UI feedback.
- The projection marks directly cited graph items with existing selection styling and endpoint/ancestor context with existing dimming styling. It contains only real domain nodes and relationships.

- [x] **Step 1: Add focused citation-ID tests**

  Assert canonical `cite:entity:` and `cite:relationship:` values decode to the correct kind and target ID. Assert plain references, wrong prefixes, empty IDs, malformed percent escapes, non-canonical encodings, and wrong-kind prefixes return `undefined`.

- [x] **Step 2: Run the citation-ID test**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/copilot-citation-id.test.ts`.
  Expected: the new tests fail because the parser does not exist.

- [x] **Step 3: Implement the shared citation parser**

  Implement `parseNavigableCitationId` in `copilot/citation-id.ts`; accept only entity/relationship citations with a non-empty ID that round-trips through `encodeURIComponent`. Reuse it in the later chat/workspace integration instead of duplicating URI parsing.

- [x] **Step 4: Add cited-projection tests**

  Build a small real `InvestigationGraph` fixture and assert:
  - an entity citation includes that entity and one shortest parent path;
  - a relationship citation includes the relationship, both actual endpoints, and each endpoint's shortest parent path;
  - unrelated neighbors and branches are absent;
  - a stable tie-break chooses one path when equally short parents exist;
  - cycles terminate, roots/no-parent targets remain visible, and unresolved IDs are reported rather than fabricated;
  - non-graph citation kinds do not become graph items;
  - cited nodes/edges and context nodes have distinguishable projection flags.

- [x] **Step 5: Run the projection test**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/project-cited-graph.test.ts`.
  Expected: the new tests fail because the projector does not exist.

- [x] **Step 6: Implement the pure cited projection**

  Implement `projectCitedGraph` in `engines/project-cited-graph.ts`. Resolve graph citations with `parseNavigableCitationId`; walk `core.parents` using a cycle-safe breadth-first search, traversing sorted parent IDs to make equal-length selection stable; retain only the selected path edges, cited relationships, endpoints, and cited entities. Map all visible nodes and edges from the supplied domain; never invent missing records. Report unresolved entity/relationship citations separately.

- [x] **Step 7: Run both focused tests**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/copilot-citation-id.test.ts features/lattice-next/tests/project-cited-graph.test.ts`.
  Expected: both test files pass.

### Task 2: Render the focused graph in isolation

**Files:**
- Create: `frontend/features/lattice-next/canvas/canvas-event-scope.ts`
- Create: `frontend/features/lattice-next/tests/canvas-event-scope.test.ts`
- Modify: `frontend/features/lattice-next/canvas/lattice-flow-types.ts`
- Modify: `frontend/features/lattice-next/components/RelationshipCanvas.tsx`
- Modify: `frontend/features/lattice-next/components/PremiumNodes.tsx`
- Modify: `frontend/features/lattice-next/components/IntelligentRelationshipEdge.tsx`
- Create: `frontend/features/lattice-next/workspace/CopilotCitedGraph.tsx`
- Test: `frontend/features/lattice-next/workspace/tests/copilot-cited-graph.test.tsx`

**Interfaces:**
- Consumes `CitedGraphProjection` from Task 1.
- Produces a view-only graph component that renders the projection under its own `LatticeFlowProvider` and `RelationshipCanvas`.
- Its props include the projection, the current citation target, and an accessible empty/unavailable state. It must not accept the main workspace's dispatch function or mutable graph state.
- Produces `isCanvasEventForScope(eventScopeId: string | undefined, canvasScopeId: string): boolean`; unscoped existing workspace commands apply only to the default `"main"` canvas.
- `RelationshipCanvas` accepts optional `canvasScopeId` (default `"main"`), `listenToWorkspaceEvents` (default `true`), and `focusTargetIds` for a local fit-to-citation action. The Copilot graph uses a distinct scope ID and disables workspace-wide fit/collapse/reflow/keyboard commands.
- Key the focused canvas by answer message ID so a different selected answer initializes its own projection; changing the focused citation within the same answer must fit only that local canvas to the entity or relationship endpoints.

- [x] **Step 1: Test canvas event scoping**

  Assert that unscoped legacy commands target only `"main"`, and scoped commands target exactly the matching canvas. Assert that geometry-motion events emitted by one scope are ignored by another scope.

- [x] **Step 2: Run the scope test**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/canvas-event-scope.test.ts`.
  Expected: the new event-scope tests fail because the helper does not exist.

- [x] **Step 3: Test the focused graph component with a mocked canvas**

  Assert that the component renders the supplied focused projection under its own provider, passes its unique scope and focus target IDs to the canvas, distinguishes unresolved/empty graph citations from a populated graph, and does not render the full investigation graph as fallback.

- [x] **Step 4: Run the focused graph component test**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/workspace/tests/copilot-cited-graph.test.tsx`.
  Expected: the tests fail because the component does not exist.

- [x] **Step 5: Scope existing canvas-wide events**

  Implement `isCanvasEventForScope`; make `RelationshipCanvas` assign its scope ID to node/edge data and filter workspace fit/collapse/reflow and geometry events by scope. Keep unscoped toolbar commands working for the existing `"main"` canvas only. Gate workspace keyboard/event listeners with `listenToWorkspaceEvents`, scope geometry signals from `PremiumNodes` and `IntelligentRelationshipEdge`, and query edge labels only inside the current canvas root. Test the scope helper and assert that `CopilotCitedGraph` passes a distinct scope ID with workspace-wide commands disabled.

- [x] **Step 6: Implement `CopilotCitedGraph`**

  Render `RelationshipCanvas` with `LatticeFlowProvider`, `orientation="RIGHT"`, `layoutMode="DEFAULT"`, empty pinned positions, and a view-local viewport. Keep selection, viewport, pinning, reflow, and safe focus interactions local to this component. Do not dispatch to `LatticeNextWorkspace`; keep domain-changing graph actions unavailable or inert in this view. Set a unique `canvasScopeId` and disable workspace-wide commands. Resolve a focused entity to its node ID and a focused relationship to its two endpoint node IDs; key the canvas by answer message ID.

- [x] **Step 7: Run both graph-view tests**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/canvas-event-scope.test.ts features/lattice-next/workspace/tests/copilot-cited-graph.test.tsx`.
  Expected: both graph-scope and focused-graph test files pass.

### Task 3: Keep answer and citation context attached to each message

**Files:**
- Modify: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx`
- Test: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`
- Test: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`

**Interfaces:**
- Add an internal UI context type containing `messageId: string` and `answer: CopilotAnswer`; citation selections additionally contain the selected `CopilotCitation`.
- `CopilotKitChatSurface` reports only validated answer contexts and reports citation selection together with its originating answer context.
- `InvestigationCopilotPanel` stores the latest answer context, its precomputed `CitedGraphProjection`, and the currently selected answer context; it resets them when the active conversation changes.
- `LatticeNextWorkspace` supplies the current `domain` and `core` to the panel, but no citation action may dispatch graph state changes or close Copilot.

- [x] **Step 1: Test validation and answer association**

  Extend `copilotkit-chat-surface.test.tsx` to assert that a validated assistant message reports its message ID and parsed answer, malformed/unvalidated metadata reports no answer context, and clicking a citation supplies the citation plus the same message's answer context.

- [x] **Step 2: Run the chat-surface test**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`.
  Expected: the new answer-context assertions fail before callback wiring is added.

- [x] **Step 3: Add typed answer-context callbacks**

  In `CopilotKitChatSurface.tsx`, expose internal callbacks for validated answer availability, citation selection, and the current safe submit handler. Derive answer context from each assistant message's existing validated `metadata.latticeAnswer`; include `message.id`. Keep the CopilotKit provider/runtime and data schemas unchanged.

- [x] **Step 4: Make every answer citation a contextual navigation action**

  Keep entity/relationship citations visually navigable and change non-graph `CitationReference` items into accessible buttons that retain their reference appearance and open Evidence. Every citation selection must carry the originating answer context; do not make evidence/finding/source/evaluation references graph nodes.

- [x] **Step 5: Route citation selections into panel-local context**

  In `InvestigationCopilotPanel.tsx`, compute and store the latest answer's `CitedGraphProjection` when a validated answer arrives without opening the context view. On a citation click, compute/select that citation's answer context and projection, open the context area, and choose Graph for a resolved graph citation or Evidence for another citation kind. A click from an older answer must use that older answer. Keep the prior projection while a run is in progress; replace it only when a new validated answer arrives. Clear answer context when a new thread is selected or started.

- [x] **Step 6: Remove main-graph citation mutation**

  In `LatticeNextWorkspace.tsx`, pass the current domain and graph core into the Copilot panel and remove the citation handler that expands/selects the main graph, opens the inspector, and closes Copilot. Keep the main graph selection, expansion, viewport, pinned positions, and inspector unchanged on all Copilot citation actions. Disable the main canvas's global Escape/workspace-command handling while the modal Copilot panel is active.

- [x] **Step 7: Test answer switching and lifecycle boundaries**

  Extend `investigation-copilot-panel.test.tsx` to assert that an older answer citation selects its own context and destination, new-thread/thread-switch actions clear stale context, answer completion prepares but does not open the graph, prior graph context remains while a run is in progress, and citation actions do not call any main-graph navigation callback.

- [x] **Step 8: Run both focused chat/panel tests**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx`.
  Expected: both test files pass.

### Task 4: Build the switchable desktop and phone context workspace

**Files:**
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`
- Modify: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`
- Use: `frontend/features/lattice-next/workspace/CopilotCitedGraph.tsx`

**Interfaces:**
- The panel owns `contextExpanded`, active context tab (`"evidence" | "graph" | "review"`), active answer context, and phone mode (`"conversation" | "context"`).
- The panel renders one context tab at a time; it keeps the current conversation mounted so switching views does not reset CopilotKit or the composer.
- The review tab owns the only review-suggestions `<details>` disclosure and uses the safe submit handler registered by `CopilotKitChatSurface`.

- [x] **Step 1: Test on-demand tabs and phone return**

  Extend the panel tests to assert the context area is collapsed on open; explicit open defaults to Evidence; Evidence, Graph, and Review are mutually exclusive; and a phone context view provides Back to answer without clearing the active answer/thread.

- [x] **Step 2: Run the panel test**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/investigation-copilot-panel.test.tsx`.
  Expected: the new navigation assertions fail before the responsive workbench is implemented.

- [x] **Step 3: Implement compact and expanded workbench states**

  Keep the current compact, conversation-first dialog state. On desktop, expand to a split layout with a readable chat/composer column and one contextual column; use the existing Lattice palette and responsive breakpoints, with no horizontal scrolling. At phone widths, show either conversation or context, never a compressed two-column layout.

- [x] **Step 4: Implement context tabs and content**

  Render Evidence from the active answer's real claim/recommendation citation groupings and references, Graph through `CopilotCitedGraph`, and Review from supplied cues only. Non-graph references remain references; unresolved graph citations are labeled unavailable. Provide factual empty states and no sample prompts or fake activity.

- [x] **Step 5: Move review suggestions into the single Review disclosure**

  Remove `LatticeReviewSuggestions` from the chat welcome and transcript locations. Render it only in the Review tab, collapsed by default, with the existing count, Ask about this, and Dismiss behavior. Use the registered submit handler; retain run and connection gates, and keep the cues hidden in archived investigations as they are today.

- [x] **Step 6: Preserve keyboard, focus, and status behavior**

  Keep the dialog focus trap, Escape-to-close, and focus return. Implement the context switcher as an accessible tablist with arrow-key/Home/End navigation, visible focus, and a persistent Back to answer control on phones; keep actionable controls at least 44px. Preserve the actual ThinkingOrb states, existing safe error/retry behavior, and reduced-motion behavior.

- [x] **Step 7: Update direct chat and panel assertions**

  Update chat tests to verify review suggestions are no longer duplicated in the welcome/transcript. Add panel assertions that Evidence preserves claim/recommendation citation groupings, only one collapsed review disclosure exists when the Review tab is active, cue submission calls the registered handler exactly once, dismiss uses the existing callback, archived cues remain hidden, and no cues produce a truthful empty state.

- [x] **Step 8: Run the focused component tests**

  Run from `OrchestrationPlatform/frontend`: `npx vitest run features/lattice-next/tests/investigation-copilot-panel.test.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/workspace/tests/copilot-cited-graph.test.tsx features/lattice-next/tests/canvas-event-scope.test.ts`.
  Expected: all four test files pass.

### Task 5: Validate the complete workbench

**Files:**
- No new product files.
- Verify: focused component tests, affected TypeScript/ESLint checks, desktop and phone browser behavior.

- [ ] **Step 1: Run the full Lattice feature test suite**

  Run from `OrchestrationPlatform/frontend`: `npm run test:lattice`.
  Expected: all Lattice tests pass.
  Result: 166/174 tests pass; eight failures remain in Codebeamer presentation, premium-node UI, intelligence projection/disclosure, security-hardening, and semantic-zoom tests outside the Copilot workbench changes.

- [x] **Step 2: Run focused static checks**

  Run `npx eslint features/lattice-next` and `npx tsc --noEmit`, from `OrchestrationPlatform/frontend`.
  Expected: no new lint or type errors.
  Result: TypeScript and ESLint on all changed Copilot/canvas files pass. Full Lattice ESLint reports four errors in unchanged files and existing warnings.

- [ ] **Step 3: Verify browser layouts and interactions**

  At 1440×900, verify compact and expanded desktop states; at 390×844, verify conversation/context replacement and Back to answer. Confirm the composer remains usable, there is no horizontal overflow, context tabs switch, a prior answer citation selects its own graph, the graph is not opened automatically, local canvas controls do not move/collapse the main graph, review cues appear only once, and Escape/focus-return work. Repeat the navigation checks with reduced motion enabled and with an archived investigation.
  Result: Desktop/phone layouts, citation-to-graph routing, reduced motion, phone Back to answer, focus return, and review disclosure were verified. An archived sample was not available: the selected record returned no `archivedAt` from the investigation endpoint, so no saved investigation was modified to manufacture an archived state.

- [x] **Step 4: Inspect the final diff**

  Confirm only files listed in this plan changed for the feature, no runtime/API/schema/dependency changes were introduced, and unrelated worktree changes remain untouched. Do not stage or commit files.

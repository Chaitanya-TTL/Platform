# Lattice Copilot Evidence-Led UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing Lattice Copilot drawer so validated answers and their source evidence define the experience without adding clutter.

**Architecture:** Keep the CopilotKit V2 surface and investigation-scoped panel. Refine the assistant answer/citation hierarchy in `CopilotKitChatSurface`, then refine conversation chrome and empty/sparse-thread composition in `InvestigationCopilotPanel` and its surface slots. Preserve all Lattice data, runtime, safety, and storage contracts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, CopilotKit V2 1.80.0, AG-UI 1.0.2, `thinking-orbs` 0.3.2, Vitest 3.2.7, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-11-03-copilot-evidence-led-ux-design.md`

## Global Constraints

- Do not connect CopilotKit Intelligence, hosted threads, external telemetry, a new model provider, or live Azure calls.
- Do not add agent tools, generative UI, PLM/source-system mutations, or changes to the investigation graph.
- Do not change persisted message or answer schemas, Lattice storage, API routes, validation, idempotency, authorization, usage recording, or retry policy.
- Do not add dependencies or migrate the styling library.
- Do not add a permanent evidence side rail, generic sample prompts, artificial activity, or fabricated counts.
- Keep one collapsed, user-triggered review-cue disclosure; do not duplicate cues with CopilotKit suggestion chips.
- Keep archived conversations readable and read-only, with the existing error, retry, cancellation, focus, keyboard, and reduced-motion behavior.
- Keep controls usable at phone widths, touch targets at least 44px, and body text at least 14px.
- Use local tests with Azure live calls disabled; browser review must not submit a chat message.

## Review Focus

- A citation that cannot navigate must remain a reference rather than appearing interactive; keep the distinction covered by the surface test for valid and non-navigable citations.
- A restored assistant message with absent or invalid metadata must continue to render safe plain text; keep covered by the existing fallback test in the surface task.
- An archived investigation must not expose sending or actionable review cues; keep covered by the existing archived-state surface and panel tests.
- A sparse or empty thread must not gain generic filler or a permanently expanded cue list; cover with surface assertions and browser review in the panel task.
- Dense structured answers must remain readable and traceable without splitting every detail into a separate card; cover with answer-detail assertions and desktop/mobile browser review.

---

## File map

- `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx` — validated answer content, citations, review-cue surface, welcome content, composer, activity and error UI.
- `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx` — surface rendering and citation/accessibility behavior.
- `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx` — drawer chrome, thread controls, loading/error states, archived notice, focus lifecycle, and surface composition.
- `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx` — conversation lifecycle, archived state, and panel-level behavior.
- `docs/superpowers/specs/2026-11-03-copilot-evidence-led-ux-design.md` — approved product/design constraints.
- `docs/superpowers/plans/2026-11-03-copilot-evidence-led-ux.md` — this implementation plan.

No API, agent, persistence, or dependency changes are planned.

## Task 1: Make validated answers evidence-led

**Files:**
- Modify: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

**Interfaces:**
- Consumes: existing `CopilotAnswer`, `CopilotCitation`, `CopilotChatAssistantMessageProps`, and `onCitationSelect` callback.
- Produces: no new exported API; preserve the current answer metadata format and `CopilotKitChatSurfaceProps`.

- [x] **Step 1: Extend the surface tests for evidence hierarchy**

  In the existing `renders validated answer details and unique clickable Lattice citations` test, assert that the concise validated answer renders before the details disclosure, claims show their supporting citations adjacent to the claim, navigable entity citations retain their accessible navigation label, and a non-navigable evidence citation is rendered as reference text rather than a button. Preserve the existing uniqueness, callback, safe-fallback, and review-cue assertions.

- [x] **Step 2: Refine assistant answer composition**

  In `CopilotKitChatSurface.tsx`, keep the concise validated answer primary. Present supporting source references next to their existing claims/recommendations, distinguishing navigable citations from plain references using existing `isNavigableCitation` behavior. Keep extended claims, additional sources, recommendations, uncertainties, and follow-up questions inside the existing single “Evidence and details” disclosure. Avoid nested cards or duplicate citation sections. Do not change validation or message metadata handling.

- [x] **Step 3: Defer test execution to final verification**

  Keep the new assertions alongside the implementation and run the selected tests once in Task 3. This avoids repeating the same UI tests while still verifying both updated components and their regressions together.

## Task 2: Refine sparse-thread and panel hierarchy

**Files:**
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`
- Modify: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

**Interfaces:**
- Consumes: existing panel props, `CopilotKitChatSurfaceProps`, Lattice conversation API, review cues, and CopilotKit V2 lifecycle.
- Produces: no new exported API; preserve thread IDs, callbacks, conversation selector semantics, and dialog behavior.

- [x] **Step 1: Add regression assertions for empty and sparse states**

  Keep the existing empty-thread welcome test, and assert it explains the saved-snapshot grounding and leaves the composer available without rendering generic starter prompts. Keep the existing one-disclosure test and assert cue details remain collapsed by default. In the panel test, preserve loading/restoring, saved-thread switching/creation, archived, error, and focus behavior while adding an assertion that the conversation controls remain grouped separately from the transcript/composer.

- [x] **Step 2: Adjust panel and welcome composition**

  Refine the existing header and conversation-control layout so investigation scope, revision, close action, thread selector, and new-thread action have clear hierarchy without competing with the conversation. Adjust the empty/sparse transcript spacing within existing components so an isolated message does not appear stranded in an arbitrary oversized surface. Keep real review cues collapsed by default, retain the composer as the primary next action, and use existing Lattice copy and data only.

- [x] **Step 3: Preserve interaction and accessibility states**

  Verify the implementation continues to use the dialog's existing focus trap/return behavior, 44px controls, disabled running-state thread controls, archived read-only state, safe error/retry messaging, `ThinkingOrb` running status, and reduced-motion styles. Keep the composer focus indication subdued but visible for keyboard users.

- [x] **Step 4: Defer test execution to final verification**

  Do not rerun the panel or surface tests here; the consolidated suite in Task 3 runs them together once after all implementation changes.

## Task 3: Final local verification and browser review

**Files:**
- Verify: files listed in Tasks 1 and 2.
- No changes: API routes, agent, persistence store, dependencies, unrelated worktree files.

**Interfaces:**
- Consumes: completed Task 1 and Task 2 implementation.
- Produces: verified evidence-led Copilot drawer with unchanged data and runtime contracts.

- [x] **Step 1: Run the consolidated offline Copilot suite once**

  Run from `OrchestrationPlatform/frontend`:

  ```powershell
  $env:COPILOTKIT_TELEMETRY_DISABLED='true'; $env:DO_NOT_TRACK='1'; $env:AZURE_OPENAI_LIVE_CALLS_ENABLED='false'; npm run test -- features/lattice-next/copilot/tests features/lattice-next/copilot/evals features/lattice-next/tests/copilot-client.test.ts features/lattice-next/tests/investigation-copilot-panel.test.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/kernel/server/tests/file-copilot-conversation-store.test.ts 'app/api/lattice/investigations/[investigationId]/copilot/route.test.ts' 'app/api/lattice/investigations/[investigationId]/copilot/threads/[threadId]/route.test.ts'
  ```

  Expected: all selected files and tests pass. Azure transport tests use mocked fetch; do not enable live calls.

- [x] **Step 2: Run focused lint and TypeScript checks**

  ```powershell
  npm run lint -- features/lattice-next/workspace/CopilotKitChatSurface.tsx features/lattice-next/workspace/InvestigationCopilotPanel.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx
  .\node_modules\.bin\tsc.cmd --noEmit --pretty false
  ```

  Expected: both commands exit successfully without changing unrelated files.

- [x] **Step 3: Review the local browser at desktop and phone sizes**

  Use the already-running localhost application and an existing investigation. At 1440px and 390px, inspect screenshots and confirm the answer/evidence hierarchy is clear, empty/sparse space looks intentional, controls fit without horizontal overflow, cue suggestions stay collapsed, and composer focus has no halo. Exercise new conversation, saved conversation selection/restoration, keyboard close/focus return, and the archived read-only state if available. Do not type or submit a prompt and do not enable Azure.

- [x] **Step 4: Record completion evidence**

  Update only the directly related design/implementation plan checkboxes to reflect verified work. Report test counts, lint/typecheck results, browser widths/states observed, any remaining issues, and explicitly state that no model call was made. Do not claim reduced-motion or archived browser behavior was exercised unless the local UI state was actually available and checked.

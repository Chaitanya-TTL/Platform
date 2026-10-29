# CopilotKit Investigation Chat UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built investigation Copilot chat with CopilotKit V2 `CopilotChat`, retaining Lattice-owned conversation history, validated answers, and safe operations.

**Architecture:** Scope `CopilotKitProvider` to the investigation chat and render CopilotKit's `CopilotChat` with custom welcome, assistant-message, input, and cursor slots. Keep Lattice's thread API and persistent runner as the source of truth; pass snapshot revision to the custom AG-UI agent, which continues to use the existing Azure-backed validated turn service.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `@copilotkit/react-core` 1.80.0 V2, `@copilotkit/runtime` 1.80.0, AG-UI 1.0.2, `thinking-orbs` 0.3.2, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-26-copilotkit-chat-ux-design.md`

## Global Constraints

- Do not connect CopilotKit Intelligence, hosted thread storage, memories, learning, analytics, or external telemetry.
- Do not use `BuiltInAgent`, add a second model provider, or bypass the Lattice turn service and Azure opt-in.
- Do not add tools, generative UI, shared mutable agent state, or actions that write to PLM/source systems. Those capabilities do not fit the current read-only product contract.
- Do not discard the Lattice conversation store or replace its investigation-scoped identity, revision, citation, or idempotency rules.
- Do not stream unvalidated model output to the user. A response is displayed only after the existing answer validator accepts it.
- Do not change the persisted answer schema as part of the visual migration.
- Dependencies already exist in the checked-out frontend; do not reinstall or change versions without a concrete compatibility need.
- Keep the 2,000-character user-message limit and never make live Azure calls in tests.

## Review Focus

- A malformed or foreign composite runtime thread ID must not load another investigation's transcript; cover in Task 4's runner tests.
- A restored thread with missing answer metadata must render as safe plain text without crashing; cover in Task 1's message-slot tests.
- An archived investigation must keep its transcript readable while disabling the composer and suggestions; cover in Task 1's archived-state test.
- A stopped or failed run must never display or persist an unvalidated assistant answer, and a potentially billed failure must not be retryable; cover in Task 3's agent and error-control tests.
- A run must use the current snapshot revision and the same original user-message ID for an allowed retry; cover in Task 3's AG-UI request and retry tests.

---

## File map

- `frontend/app/layout.tsx` — load CopilotKit V2's global stylesheet at the Next.js root.
- `frontend/instrumentation.ts` — disable CopilotKit OSS telemetry before runtime routes initialize.
- `frontend/tests/copilotkit-telemetry.test.ts` — verify the server startup hook sets the telemetry opt-out.
- `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx` — provider-scoped CopilotKit chat, one collapsed review-cue disclosure, Lattice-specific slots, and run/error callbacks.
- `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx` — investigation-level panel shell, thread list/selection, initial restore, and active-run gating.
- `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx` — verify failure billing guidance and bounded validation detail.
- `frontend/features/lattice-next/copilot/copilotkit-agent.ts` — maintain the validated turn contract and structured, sanitized AG-UI failures.
- `frontend/features/lattice-next/copilot/copilotkit-agent-runner.ts` — maintain investigation-scoped durable reconnect snapshots and cancellation behavior.
- `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx` — test chat slots, suggestions, citation rendering, ThinkingOrb, and archived behavior.
- `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx` — test thread selection, creation, loading, and run-state controls.
- `frontend/features/lattice-next/copilot/tests/copilotkit-agent.test.ts` — test snapshot revision, answer metadata, failure safety, and cancellation.
- `frontend/features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts` — test reconnect snapshots, malformed IDs, and investigation isolation.

## Task 1: Build the CopilotKit chat surface

**Files:**
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Create: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

**Interfaces:**
- Consumes: `CopilotAnswer`, `CopilotCitation`, `InvestigationReviewCue`, and `toCopilotKitThreadId(investigationId, threadId)`.
- Produces: `CopilotKitChatSurfaceProps` with `investigationId: string`, `snapshotRevision: number`, `threadId: string`, `isArchived: boolean`, `cues: readonly InvestigationReviewCue[]`, `onCitationSelect(citation: CopilotCitation): void`, `onRunStateChange(isRunning: boolean): void`, `onFailure(failure: CopilotRunFailure | undefined): void`, and `onDismissCue(cueId: string): void`.
- `CopilotRunFailure` contains `message: string`, `retryable: boolean`, `requestMayHaveBeenBilled: boolean`, and optional `validationIssue: string`.

- [ ] **Step 1: Write failing surface tests**

  Test that the surface configures `CopilotKitProvider` with
  `/api/lattice/copilotkit`, passes `snapshotRevision` as provider properties,
  binds the composite investigation/thread ID, and filters the runtime payload
  to the latest user message. Test validated-answer metadata rendering,
  clickable Lattice citations, missing-metadata plain text, one collapsed
  review-cue disclosure in empty and populated chats, archived cue/composer
  disablement, and an accessible `ThinkingOrb` cursor.

- [ ] **Step 2: Run the surface tests and confirm they fail**

  Run from `OrchestrationPlatform/frontend`:

  ```powershell
  npx vitest run features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  ```

  Expected: FAIL because the CopilotKit chat surface does not exist.

- [ ] **Step 3: Implement `CopilotKitChatSurface`**

  Import V2 APIs only from `@copilotkit/react-core/v2`. Scope the provider to
  this panel; configure the runtime URL, current snapshot revision, and a stable
  `messageFilter` that forwards only the latest user turn. Render
  `CopilotChat` with the composite thread ID. Use supported slots for:

  - assistant messages that display `metadata.latticeAnswer` as a concise
    answer plus collapsed claims, unique citations, recommendations,
    uncertainties, and follow-up questions; plain text remains safe if
    metadata is absent;
  - welcome content and a single collapsed review-cue disclosure, shown in the
    empty-state welcome or above populated transcripts and submitted only on
    user action; do not render a second set of native suggestion chips;
  - the composer, preserving the 2,000-character limit, archived disablement,
    archived-only read-only explanation, keyboard behavior, built-in stop
    action, and a compact appearance without a bright double focus ring;
  - the active-run cursor, using `ThinkingOrb` with `state="working"`,
    `size={20}`, and a nearby accessible status label.

  Add `@copilotkit/react-core/v2/styles.css` to `frontend/app/layout.tsx` and
  retain the application's theme tokens through scoped overrides.

- [ ] **Step 4: Run the surface tests**

  Run:

  ```powershell
  npx vitest run features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  ```

  Expected: PASS, with no live network/model request.

- [ ] **Step 5: Commit the surface**

  ```powershell
  git add OrchestrationPlatform/frontend/app/layout.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  git commit -m "feat: add CopilotKit investigation chat surface" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

## Task 2: Move the investigation panel onto CopilotKit threads

**Files:**
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`
- Reuse: `frontend/features/lattice-next/copilot/client.ts`
- Reuse: `frontend/features/lattice-next/copilot/copilotkit-agent-runner.ts`

**Interfaces:**
- Consumes: `CopilotKitChatSurfaceProps` from Task 1 and the existing
  `getCopilotThreads(investigationId)` client function.
- Produces: panel state for `activeThreadId`, `threads`, `loading`, and
  `isRunning`; thread IDs passed to the surface are Lattice IDs, with runtime
  encoding handled by the surface.

- [ ] **Step 1: Write failing panel behavior tests**

  Test that panel initialization loads the latest Lattice conversation,
  selecting a listed conversation binds it to the CopilotKit runtime, and
  starting a new conversation creates a fresh thread ID without creating a
  server record until the first user message. Test loading/error states and
  disabled selection/new-thread controls while `isRunning` is true.

- [ ] **Step 2: Run the panel tests and confirm the old flow fails**

  Run:

  ```powershell
  npx vitest run features/lattice-next/tests/investigation-copilot-panel.test.tsx
  ```

  Expected: FAIL on legacy transcript/send behavior or missing CopilotKit
  thread controls.

- [ ] **Step 3: Replace the panel's manual chat controller**

  Keep the existing drawer header, close behavior, archived label, and
  investigation review cues. Load summaries and latest transcript with the
  Lattice GET route. Provide an accessible selector for persisted conversations
  and a new-conversation action. Bind the selected Lattice thread to
  `CopilotKitChatSurface`; do not use `CopilotThreadsDrawer` or Intelligence
  thread APIs. Remove the panel's direct `postCopilotMessage` usage and custom
  textarea/transcript/send state. Disable thread selection and new-conversation
  while the surface reports an active run; CopilotKit's Stop control remains
  available. Refresh the Lattice summary list after a run finishes.

- [ ] **Step 4: Run the panel tests**

  Run:

  ```powershell
  npx vitest run features/lattice-next/tests/investigation-copilot-panel.test.tsx
  ```

  Expected: PASS, with no direct JSON POST for assistant turns.

- [ ] **Step 5: Commit the panel migration**

  ```powershell
  git add OrchestrationPlatform/frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx
  git commit -m "feat: route investigation chat through CopilotKit" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

## Task 3: Preserve validated execution, cancellation, and safe retry

**Files:**
- Modify: `frontend/features/lattice-next/copilot/copilotkit-agent.ts`
- Modify: `frontend/features/lattice-next/copilot/copilotkit-agent.test.ts`
- Modify: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`
- Reuse: `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`

**Interfaces:**
- Consumes: `CopilotRunFailure` and `onFailure` from Task 1.
- Produces: a retry control that is available only when the server marks the
  failure retryable and `requestMayHaveBeenBilled` is false; retries reuse the
  current user message ID/idempotency key.

- [ ] **Step 1: Write failing agent and error-control tests**

  Test that the agent reads the current `snapshotRevision`, delegates only to
  `executeCopilotTurn`, places the accepted answer in
  `metadata.latticeAnswer`, and emits no assistant answer after stop or
  failure. Test retry visibility for retryable/non-billed failures versus
  hidden/disabled retry for ambiguous or potentially billed failures. Test
  that retry reuses the same user-message ID and that provider diagnostics are
  never rendered.

- [ ] **Step 2: Run the focused tests and confirm they fail**

  Run:

  ```powershell
  npx vitest run features/lattice-next/copilot/tests/copilotkit-agent.test.ts features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  ```

  Expected: FAIL for the unimplemented retry/error-control behavior.

- [ ] **Step 3: Wire AG-UI lifecycle and retry controls**

  Preserve the existing Lattice turn executor and cancellation signal.
  Surface only validated answer metadata and sanitized `RUN_ERROR` details.
  Observe the current chat's run lifecycle to gate thread controls. For an
  explicit retry, use CopilotKit's agent API to rerun the existing last user
  message, preserving its ID; do not append a new user message or invoke
  `postCopilotMessage`. Permit retry only when server metadata says
  `retryable === true` and `requestMayHaveBeenBilled !== true`.

- [ ] **Step 4: Run focused agent and UI tests**

  Run:

  ```powershell
  npx vitest run features/lattice-next/copilot/tests/copilotkit-agent.test.ts features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  ```

  Expected: PASS, including stop/cancel and no unvalidated assistant output.

- [ ] **Step 5: Commit the safe lifecycle changes**

  ```powershell
  git add OrchestrationPlatform/frontend/features/lattice-next/copilot/copilotkit-agent.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilotkit-agent.test.ts OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  git commit -m "feat: preserve safe CopilotKit run controls" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

## Task 4: Verify durable reconnect and the complete chat experience

**Files:**
- Create: `frontend/instrumentation.ts`
- Create: `frontend/tests/copilotkit-telemetry.test.ts`
- Modify: `frontend/features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts`
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`
- Modify: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

- [ ] **Step 1: Add regression coverage**

  Verify persisted assistant metadata and user messages reconnect as a
  `MESSAGES_SNAPSHOT`; malformed composite IDs return no transcript without
  loading storage; fresh valid client threads reconnect with no messages; and
  foreign IDs do not leak another investigation's history. Switching
  investigation/thread does not leak old messages; archived mode remains
  read-only; review cues create user-triggered suggestions; and a citation
  click reaches `onCitationSelect`. Verify the Next.js startup hook sets
  `COPILOTKIT_TELEMETRY_DISABLED=true` before runtime requests, potentially
  billed failures tell users to check the usage ledger before retrying, and
  displayed validation details are printable text no longer than 160
  characters.

- [ ] **Step 2: Run the complete offline Copilot feature suite**

  Run:

  ```powershell
  npx vitest run features/lattice-next/copilot/tests features/lattice-next/copilot/evals features/lattice-next/tests/copilot-client.test.ts features/lattice-next/tests/investigation-copilot-panel.test.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx "app/api/lattice/investigations/[investigationId]/copilot/route.test.ts" "app/api/lattice/investigations/[investigationId]/copilot/threads/[threadId]/route.test.ts"
  ```

  Expected: all selected tests pass without enabling live Azure calls.

- [ ] **Step 3: Check types, lint, and production build**

  Run:

  ```powershell
  npx tsc --noEmit
  npx eslint app/layout.tsx features/lattice-next/workspace/CopilotKitChatSurface.tsx features/lattice-next/workspace/InvestigationCopilotPanel.tsx features/lattice-next/copilot/copilotkit-agent.ts
  npm run build
  ```

  Expected: each command exits successfully; existing unrelated worktree
  warnings must be reported, not mass-fixed.

- [ ] **Step 4: Verify the existing investigation chat in a browser**

  Open an existing investigation and check desktop drawer and narrow/mobile
  width, keyboard focus and Escape close, empty and restored conversations,
  cue disclosure, stop while running, safe error/retry state, citation
  navigation, archived read-only state, and reduced-motion orb behavior. Do
  not send a live Azure request unless the existing explicit opt-in is enabled
  and the user separately authorizes a billable call.

- [ ] **Step 5: Commit verification fixes**

  ```powershell
  git add OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
  git commit -m "test: verify CopilotKit investigation chat" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

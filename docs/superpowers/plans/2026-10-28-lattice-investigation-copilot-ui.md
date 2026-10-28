# Lattice Investigation Copilot UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve investigation Copilot answer readability and conversation navigation while preserving CopilotKit streaming, thread persistence, and evidence interactions.

**Architecture:** Keep the CopilotKit v2 runtime, API, validated answer schema, and current "Why this answer?" context panel. Add an investigation-scoped conversation rail, render validated answers as safe Markdown with citation tokens mapped to existing citations, and simplify the composer and run state presentation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, CopilotKit v2, existing Motion/GSAP/Tabler dependencies, Vitest.

**Spec:** [2026-10-28-lattice-discovery-copilot-ui-design.md](../specs/2026-10-28-lattice-discovery-copilot-ui-design.md)

## Global Constraints

- Preserve thread APIs, message submission, streaming/run state, retry/error behavior, answer validation, investigation IDs, and citation authority.
- Conversation history is scoped to the current investigation and uses only `getCopilotThreads` results.
- Keep the "Why this answer?" context panel and its existing citation/relationship interactions.
- Remove the visible follow-up cue strip only; do not remove follow-up fields or server-side cue data.
- Recognize citation markers only when `(cite:{kind}:{encodedId})` exactly matches a validated citation's `citationId`; preserve unmatched answer text.
- Render model text with raw HTML disabled and never expose encoded citation IDs as ordinary prose.
- Use only the prompt text area and send/stop behavior; do not add attachment, model, tools, or dictation controls.
- Respect reduced motion, minimum 44px interactive targets, visible focus, and narrow-screen layout.

## Review Focus

- **An answer contains Markdown and exact citation markers:** formatting is readable and only matching citations open the existing context panel; test both.
- **An answer contains an unknown or malformed citation marker:** preserve its text safely and do not navigate; test unmatched and malformed markers.
- **The conversation list is empty, loading, or fails:** keep explicit empty/loading/error states and the existing retry action; test each state.
- **A new conversation is unsaved, selected, or a request is running:** represent the active new thread and preserve the existing disabled/switching rules; test state transitions.
- **The viewport is narrow or reduced motion is enabled:** keep the rail navigable without clipping and remove non-essential motion; verify responsive behavior and reduced-motion rendering.

---

### Task 1: Render Readable Answers and Validated Citations

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotAnswerContent.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

**Interfaces:**
- Consumes: `CopilotAnswer`, `CopilotCitation`, `parseNavigableCitationId`, and the existing `onCitationSelect` callback.
- Produces: `CopilotAnswerContent({ message, answerContext, onCitationSelect, isStreaming })`, where `message` is `CopilotChatAssistantMessageProps["message"]`, `answerContext` is `CopilotAnswerContext | undefined`, and `onCitationSelect` accepts `CopilotCitationSelection`. It renders Markdown through CopilotKit's existing assistant renderer and exact validated citation markers as named links/buttons.

- [ ] **Step 1: Add failing answer-rendering tests**

Test paragraph breaks, headings, lists, and inline emphasis. Test exact markers such as `(cite:entity:entity%3A1)` against the matching citation and assert it renders a readable label and invokes the existing citation callback. Assert malformed or unmatched markers remain harmless readable text, raw HTML is not executed, and URL-encoded IDs are not presented as citation labels.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm test -- features/lattice-next/workspace/tests/copilot-answer-content.test.tsx
```

Expected: FAIL because the dedicated answer renderer is absent and validated answer text is currently a plain paragraph.

- [ ] **Step 3: Implement the safe Markdown and citation renderer**

Create `CopilotAnswerContent.tsx`, reuse CopilotKit's built-in Markdown assistant renderer with raw HTML disabled, and resolve markers only by exact `citationId` match. Render matched citations as readable links that call `onCitationSelect` with the current answer context and citation. Integrate the component into `LatticeAssistantMessage` while preserving the existing "Why?" action. Update only the answer-field instructions to allow concise paragraphs/lists and useful line breaks; do not alter the JSON schema or validation.

- [ ] **Step 4: Add one-pass answer text reveal and reduced-motion behavior**

Use the supplied TextType behavior with the existing animation dependencies to reveal only the newly received answer once, with a bounded reveal duration; do not replay a complete answer after streaming settles. Render immediately when reduced motion is requested and when loading a saved conversation.

- [ ] **Step 5: Run answer and chat regression tests**

Run:

```powershell
npm test -- features/lattice-next/workspace/tests/copilot-answer-content.test.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/copilot-citation-id.test.ts
npx eslint features/lattice-next/workspace/CopilotAnswerContent.tsx features/lattice-next/workspace/CopilotKitChatSurface.tsx features/lattice-next/workspace/tests/copilot-answer-content.test.tsx
```

Expected: Markdown, citation, answer-context, and run-state tests pass with no lint errors.

### Task 2: Add the Investigation-Scoped Conversation Rail

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`

**Interfaces:**
- Consumes: `threads`, `activeThreadId`, `loadingThreads`, `isRunning`, existing `refreshThreads`, `startNewConversation`, and `handleThreadSelection`.
- Produces: an in-flow desktop sidebar listing the active investigation's threads, a responsive mobile history view, an accessible rail toggle, and an icon-only-at-rest "New chat" control.

- [ ] **Step 1: Add failing panel-navigation tests**

Assert the conversation `<select>` is absent; the history toggle exposes `aria-expanded` and controls the thread list; only fetched investigation threads render; selecting a saved thread uses the current selection behavior; the unsaved current thread is represented; and the new-chat action has a 44px target and an accessible name even when its visible label is collapsed. Cover empty, loading, and history-error/retry states.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm test -- features/lattice-next/tests/investigation-copilot-panel.test.tsx
```

Expected: FAIL on the missing rail and the existing select-based navigation.

- [ ] **Step 3: Implement the rail and responsive navigation**

Replace the select with a left conversation rail inside the Copilot dialog. Keep the desktop conversation visible beside it; on mobile, show a full-dialog history view with an explicit return action. Preserve loading, error/retry, empty, archived, and running behavior; thread switching and creation must use existing callbacks/state.

- [ ] **Step 4: Add the expanding new-chat control**

Make the control icon-only at rest and reveal "New chat" on pointer hover and keyboard focus, collapsing when neither applies. Keep focus indication and accessible labeling independent of hover.

- [ ] **Step 5: Run panel and chat integration tests**

Run:

```powershell
npm test -- features/lattice-next/tests/investigation-copilot-panel.test.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
npx eslint features/lattice-next/workspace/InvestigationCopilotPanel.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx
```

Expected: conversation switching, new thread creation, retry, and context-panel tests pass.

### Task 3: Simplify Thinking State and Composer

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

**Interfaces:**
- Consumes: current `isRunning`, `isConnecting`, `onSubmitMessage`, `onStop`, `MAX_MESSAGE_LENGTH`, archived state, and CopilotKit's public `input` slot.
- Produces: a concise animated thinking line and a compact prompt bar with only text entry plus send/stop.

- [ ] **Step 1: Add failing thinking, composer, and follow-up-strip tests**

Assert the active run uses a live thinking label, connection status remains distinct, the composer has the investigation placeholder and max-length/archived constraints, stop is available during a run, the fixed follow-up cue strip is not rendered, and reduced-motion mode presents the thinking/content states without a delayed reveal.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm test -- features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx
```

Expected: FAIL on the old thinking indicator, fixed follow-up strip, and composer presentation.

- [ ] **Step 3: Implement the compact thinking state and prompt bar**

Use the supplied ThoughtLine behavior for the actual run state, with no fabricated progress steps. Style CopilotKit's public input slot as one contained text bar and one send/stop control; retain the existing submission callback and safety constraints.

- [ ] **Step 4: Remove the fixed follow-up cue presentation**

Remove the rendered cue list while leaving server-side cues, answer fields, and error/retry controls intact.

- [ ] **Step 5: Run focused tests, type checking, and lint**

Run:

```powershell
npm test -- features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx
npx tsc --noEmit
npx eslint features/lattice-next/workspace/CopilotKitChatSurface.tsx features/lattice-next/workspace/InvestigationCopilotPanel.tsx
```

Expected: all focused tests pass and TypeScript/ESLint report no errors.

### Task 4: Verify Integrated Copilot Behavior

- [ ] Run the related Copilot tests:

```powershell
npm test -- features/lattice-next/workspace/tests/copilot-answer-content.test.tsx features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx features/lattice-next/tests/copilot-citation-id.test.ts
```

- [ ] Build the frontend with `npm run build`.
- [ ] Check the Copilot at desktop and 390px widths with the rail both closed and open, including when the existing "Why this answer?" panel is open. Verify no horizontal overflow, stable focus, and reduced-motion behavior.

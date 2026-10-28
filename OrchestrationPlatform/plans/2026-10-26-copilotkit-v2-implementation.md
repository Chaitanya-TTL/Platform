# CopilotKit V2 Integration Plan

> **For agentic workers:** Implement natively in this session. Preserve existing worktree changes and validate each task with offline tests.

**Goal:** Replace the bespoke Lattice Copilot interaction with CopilotKit V2 and AG-UI, delivering a polished, responsive, investigation-grounded chat.

**Architecture:** Use CopilotKit React Core and Runtime with a custom server-side AG-UI adapter. Extract/share the existing Lattice turn orchestration rather than duplicating it. Keep Azure, bounded context, citation validation, usage accounting, and the file-backed investigation-scoped conversation store authoritative. Adapt CopilotKit run/thread lifecycle to that store; never rely on process-local in-memory history for durable conversation behavior.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, CopilotKit 1.80.0, AG-UI client 1.0.2, RxJS as resolved by the runtime, Vitest.

**Spec:** `plans/2026-10-26-copilotkit-integration-design.md`.

## Global Constraints

- Keep `AZURE_OPENAI_LIVE_CALLS_ENABLED` explicit and do not make live provider calls during implementation or tests.
- Keep Azure credentials server-only; use mocked providers and synthetic snapshots.
- Preserve investigation revision checks, source-system read-only behavior, factual citation validation, idempotency, and conversation isolation.
- Exclude CopilotKit Intelligence, Channels, Memories, hosted telemetry, and model-generated executable UI.
- Preserve unrelated and preexisting dirty worktree changes, including `server-only` package edits.
- Read the installed Next.js route-handler docs and installed CopilotKit type declarations before coding against either API.

## Review Focus

- A browser-provided thread or investigation ID must not authorize cross-investigation reads; validate the exact active snapshot on every run.
- Reload/reconnect must recover conversation history from Lattice persistence, not the in-memory CopilotKit runner.
- Do not display unvalidated provider text as factual while streaming; only release the validated answer or clearly distinguish provisional content.
- Abort/disconnect must not leave corrupt or duplicate pending turns; retain idempotent retry semantics.
- Runtime discovery and HTTP endpoints must not enable unapproved tools, hosted Intelligence, or source-system writes.

---

### Task 1: Install compatible CopilotKit V2 packages

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] Add `@copilotkit/react-core@1.80.0`, `@copilotkit/runtime@1.80.0`, and the runtime-compatible `@ag-ui/client@1.0.2` using npm without overwriting existing manifest changes.
- [ ] Verify there is exactly one resolved `@ag-ui/client` version and inspect the installed exports/types for V2 chat, runtime, custom agent/factory, and persistence.
- [ ] Read the relevant Next.js 16.3 route-handler documentation under `node_modules/next/dist/docs/`.
- [ ] Do not run any provider or onboarding CLI request.

### Task 2: Extract and preserve the Lattice turn service

**Files:**
- Create or modify: `frontend/features/lattice-next/copilot/server/` application service and tests
- Modify: `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- Reuse: current config, Azure client, context builder, validator, file conversation store

- [ ] Extract the route's validate/load/context/model/validate/persist sequence into one server-only service callable from both the existing JSON API and AG-UI adapter.
- [ ] Keep exact snapshot revision checks, read-only prompts, bounded context, usage logging, validation issue reporting, and idempotent retries.
- [ ] Add mocked tests for success, invalid citations, provider failure, abort, duplicate retries, archive, and investigation isolation.

### Task 3: Bridge CopilotKit AG-UI to Lattice persistence

**Files:**
- Create: `frontend/app/api/copilotkit/[[...path]]/route.ts` (or the route shape required by installed V2 docs)
- Create: server-side Lattice agent/runner adapter under `frontend/features/lattice-next/copilot/server/`
- Modify/test: `frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts` only as required by adapter contracts

- [ ] Implement the documented V2 runtime endpoint and register one custom Lattice agent; never register `BuiltInAgent` in direct model mode.
- [ ] Pass investigation identity as bounded, untrusted client context and validate it server-side against the loaded snapshot before every run.
- [ ] Map AG-UI thread/run IDs to the existing per-investigation file store; implement resume/connect from persisted Lattice turns, not `InMemoryAgentRunner` history.
- [ ] Emit AG-UI lifecycle events and a validated assistant message. Do not stream unvalidated factual text; cancellation must abort provider work where supported and leave retryable staged turns consistent.
- [ ] Export only required HTTP methods, apply request limits, no-store semantics, and appropriate same-origin behavior.
- [ ] Test runtime metadata, events, reconnect, stop/abort, persistence across runtime reconstruction, isolation, malformed context, and no Azure calls with mocked dependencies.

### Task 4: Adopt CopilotKit React chat and redesign the panel

**Files:**
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx` as needed for stable investigation/thread configuration
- Modify/create: scoped provider and message/input slot components under `frontend/features/lattice-next/workspace/copilot/`
- Modify: `frontend/app/globals.css` only if required for CopilotKit V2 CSS compatibility
- Test: existing Lattice Copilot panel tests and focused component tests

- [ ] Use `CopilotKitProvider`, `CopilotChat` or `CopilotChatView`, and documented V2 message/input slots; keep provider scope limited to the active investigation panel.
- [ ] Build a task-oriented welcome state with sample investigation questions, prominent accessible input, streaming/working status, stop action, and clear retry/error handling.
- [ ] Render a concise synthesis first; put claim details, citations, source coverage/freshness, uncertainty, and recommendations into progressive disclosure. Render citations once and preserve graph navigation.
- [ ] Keep archived state read-only, retain resume/new conversation actions, and provide accessible thread switching.
- [ ] Do not expose debug inspector in production or enable telemetry by default; keep dev-only inspection explicitly local.
- [ ] Test keyboard operation, collapsed details, mobile sizing, streaming states, citations, thread resume, and archived state.

### Task 5: Validate integration and launch local preview

**Files:**
- Update focused tests and docs only as required by observed issues

- [ ] Run CopilotKit adapter, Lattice route, context/validator, store, and UI suites using the installed local Vitest binary; tests must mock all provider requests.
- [ ] Run ESLint/type diagnostics and the project build only if not prohibited by the user's current command constraints.
- [ ] Confirm no live endpoint requests, no `NEXT_PUBLIC_` credential, no duplicate AG-UI package, and no default in-memory history dependency.
- [ ] Start or reuse one local Next dev server and report its actual URL; never leave a duplicate server running.

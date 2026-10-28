# CopilotKit Integration Implementation Plan

> **For agentic workers:** Implement natively in this session; preserve user changes and run each focused test before proceeding.

**Goal:** Replace the custom Lattice Copilot chat interaction layer with CopilotKit V2/AG-UI and deliver a polished, accessible investigation-scoped chat UX.

**Architecture:** Reuse the existing server-owned Lattice turn orchestration for bounded evidence, Azure, validation, usage logging, and persisted threads. Add an AG-UI adapter and CopilotKit runtime that delegates to that orchestration, and a custom chat view that presents validated answers and graph citations clearly. Do not make the CopilotKit runtime's in-memory history the source of truth.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, CopilotKit V2, AG-UI, thinking-orbs, Vitest.

**Spec:** `plans/2026-10-26-copilotkit-integration-design.md`

## Global Constraints

- Stage 1 remains read-only for all source systems; no connected-system tools or write-back.
- Azure credentials stay server-side; do not make live LLM calls during install, tests, or UI validation.
- `AZURE_OPENAI_LIVE_CALLS_ENABLED` remains controlled by the existing local setting; do not modify it.
- Persisted investigation and conversation stores remain authoritative and investigation-scoped.
- Preserve all existing dirty worktree changes; do not overwrite package, API, kernel, or test edits.
- Set `$env:NODE_OPTIONS="--use-system-ca"` in the PowerShell process before every npm registry request or npm command.
- Follow the repository's Next.js 16.3 local docs and installed CopilotKit package types; verify V2 exports and AG-UI dependency deduplication.

## Review Focus

- CopilotKit runtime must not call a model independently of the existing Azure validation/usage path; test the adapter boundary with mocks.
- CopilotKit thread and run IDs must map to the investigation-scoped file store; test resume and cross-investigation isolation.
- Never show unvalidated streamed provider text as factual output; test failed validation behavior.
- Repeated runs and cancellations must not duplicate user turns or leave stale loading states.
- Orb states must be meaningful and labeled; respect reduced motion and avoid continuous idle animation.

---

### Task 1: Compatible dependencies and protocol contract

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Create: `frontend/features/lattice-next/copilot/ag-ui-contract.ts` (if a shared contract is needed)
- Test: focused Copilot adapter tests

- [ ] Set the process system CA option and inspect published package metadata for CopilotKit V2, its exact `@ag-ui/client` dependency, and `thinking-orbs`.
- [ ] Install runtime/UI/orb packages with versions compatible with the published runtime; verify one deduplicated AG-UI client version.
- [ ] Inspect installed type declarations/examples for provider, `CopilotChatView`, agent clone semantics, event lifecycle, stop, and runner hooks.
- [ ] Run local TypeScript/editor diagnostics; do not run a live model request.

### Task 2: Server-owned turn service and AG-UI runtime

**Files:**
- Extract shared orchestration from `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts` into a server-only application service.
- Create: `frontend/app/api/copilotkit/[[...slug]]/route.ts` (or Next 16.3-supported equivalent after local docs review)
- Create: custom AG-UI agent/runner adapter under `frontend/features/lattice-next/copilot/`
- Reuse: current Azure client, context builder, validator, usage ledger, and file conversation store
- Test: new adapter/runtime tests and existing Copilot route tests

- [ ] Add a failing offline test that one AG-UI user turn delegates to the existing server-owned service with the correct investigation and snapshot revision.
- [ ] Implement AG-UI lifecycle events around one validated answer; only emit assistant text after validation succeeds.
- [ ] Map runtime thread IDs to the existing per-investigation conversation store; keep retries idempotent and use the durable store rather than in-memory runner history.
- [ ] Handle run cancellation, provider failure, validation failure, and persistence failure without fabricating an assistant turn.
- [ ] Keep legacy JSON endpoints until parity is demonstrated; avoid duplicate turn logic by routing both paths through the same service.
- [ ] Run focused mocked adapter/API tests.

### Task 3: CopilotKit provider and full chat UX

**Files:**
- Create or modify: client provider under `frontend/app/` and `frontend/app/layout.tsx`
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx` only for provider/thread/citation wiring
- Test: Copilot panel and workspace interaction tests

- [ ] Add the CopilotKit provider in the narrowest Lattice subtree, not globally, and bind runtime agent/thread to the active investigation.
- [ ] Replace bespoke input/transcript state with CopilotKit V2 chat/view primitives and custom Lattice message slots.
- [ ] Preserve latest-thread resume, new conversation, archived read-only mode, citation navigation, safe retry, and concise answer with collapsed evidence details.
- [ ] Add accessible welcome prompts for common Lattice questions, visible run/cancel feedback, empty/loading/error states, and responsive panel behavior.
- [ ] Verify stored historical answers remain readable and that duplicate assistant rendering is prevented.
- [ ] Run focused component/workspace tests.

### Task 4: Thinking-orbs status system

**Files:**
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Test: focused panel accessibility/status tests

- [ ] Map user/agent lifecycle to selected `thinking-orbs` states (for example listening, working/searching, composing); do not animate while idle.
- [ ] Use accessible labels and a stable indicator size; keep status text available for screen readers.
- [ ] Confirm package honors reduced motion and automatic visibility pausing; add a local reduced-motion/static fallback only if required by actual package behavior.
- [ ] Test indicator labels, state mapping, and that idle UI does not render an active orb.

### Task 5: Integrated verification

**Files:**
- Update existing focused tests only; no unrelated cleanup

- [ ] Run the Copilot route, context, validator, conversation-store, AG-UI adapter, panel, and workspace offline suites.
- [ ] Run targeted lint/type/build checks only after focused tests pass; no live provider calls.
- [ ] Inspect final diff and package lock for unintended changes and duplicate AG-UI packages.
- [ ] Start or reuse the local dev server and report the URL; do not submit a Copilot request.

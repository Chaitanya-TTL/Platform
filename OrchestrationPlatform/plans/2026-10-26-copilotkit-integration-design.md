# CopilotKit Integration Design

**Intent:** Replace the bespoke Copilot chat interaction layer with CopilotKit V2 and AG-UI, and give engineers a clearer, more responsive investigation chat without sacrificing evidence quality or existing Lattice behavior.

**Audience and outcome:** Engineers can open an investigation-specific conversation, ask about its saved graph and evidence, see the agent working, cancel a run, navigate citations, inspect evidence details when needed, and resume prior threads. The answer should lead with a concise synthesis; supporting claims, citations, gaps, and recommendations should be organized for scanning.

## Current State

The frontend has a custom React chat panel. A same-origin Next.js route accepts JSON, loads a saved investigation, builds bounded context, calls the server-only Azure client, validates citations, records usage, and persists conversation turns separately. CopilotKit is not installed. Its V2 chat UI communicates with an AG-UI agent stream, so adopting its components requires a protocol adapter and thread lifecycle integration, not merely swapping JSX.

## Goals

- Use CopilotKit V2 React components and AG-UI as the chat interaction layer.
- Preserve the current Azure transport, explicit live-call gate, usage ledger, investigation context builder, citation validation, and persisted conversation authority.
- Keep conversations isolated by investigation and resume them from the existing file-backed store.
- Improve UX with compact synthesis, streaming/lifecycle feedback where compatible with validated answers, cancel/retry states, accessible input, thread switching, contextual suggestions, and progressive-disclosure evidence details.
- Use `thinking-orbs` as accessible, reduced-motion-aware status indicators for meaningful Copilot run states; keep idle chat free of ambient animation.
- Add only relevant CopilotKit capabilities supported by the open-source TypeScript stack.

## Non-Goals

- Do not enable CopilotKit Intelligence, hosted telemetry, memories, learning, analytics, or Channels in this phase. They have separate licensing, identity, infrastructure, and data-handling implications.
- Do not use `BuiltInAgent`'s direct model mode, expose credentials to the browser, or bypass the existing Lattice orchestration route/service.
- Do not add connected-system tools, write-back, autonomous actions, or model-generated executable UI.
- Do not make live Azure requests as part of installation, tests, builds, or UI verification.

## Architecture

- Add CopilotKit V2 React and TypeScript runtime packages plus `thinking-orbs`, using official V2 exports and a single deduplicated `@ag-ui/client` version compatible with the runtime.
- Add a same-origin CopilotKit runtime route that registers a custom AG-UI agent or factory. It must delegate each user turn to an extracted server-side Lattice application service shared with the current API route; do not duplicate Azure, context-building, validation, or persistence logic.
- Use a durable runner/adapter that maps CopilotKit thread/run lifecycle to the existing investigation-scoped conversation store. Do not rely on the default in-memory runner for resume behavior. Confirm the library interfaces and cloning semantics from the installed package before implementation.
- Bind each chat agent/thread to a server-validated investigation ID and snapshot revision. Treat any browser-provided thread ID and state as untrusted; preserve idempotency, rate/body bounds, and per-investigation isolation.
- Preserve answer validation before persisting or displaying factual output. If provider tokens are streamed before validation, hold them as provisional and do not present them as verified; otherwise emit the validated result as one completed message with AG-UI lifecycle events. The implementation plan must select and test the safest compatible behavior.
- Build the panel on CopilotKit chat/view primitives with custom message slots for Lattice claims and citations. Keep the answer concise and visible; put evidence details, source status, uncertainty, and recommendations behind an accessible disclosure. Existing citation navigation remains application-owned.
- Map agent lifecycle to a small set of orb states such as listening, working, and composing; ensure labels remain available to assistive technology and honor reduced motion.

## Approaches

1. Keep the current custom panel and only wrap its endpoint with a thin CopilotKit-compatible UI. This minimizes migration but leaves most agent lifecycle and AG-UI capabilities unused.
2. Adopt CopilotKit V2, AG-UI, and a custom adapter around the existing Lattice service/store. This uses the library substantially while retaining the approved source-of-truth and security boundaries. **Recommended.**
3. Replace the Lattice service with CopilotKit BuiltInAgent/Intelligence and use its default thread storage. This conflicts with existing citation validation, approved Azure transport, persisted investigation scoping, and company-data controls; not selected.

## Constraints

- Preserve all dirty worktree changes, especially existing API, package, and investigation-store edits.
- Keep Azure secrets server-only and `AZURE_OPENAI_LIVE_CALLS_ENABLED` default-off outside the user's explicit manual-test environment.
- Keep factual citations bound to the exact saved snapshot revision.
- Use synthetic fixtures and mocked provider tests only; do not send live model requests.
- Follow Next.js 16.3 local documentation before editing Next.js integration code.

## Acceptance Criteria

- A CopilotKit V2 chat mounts within the Lattice panel and performs an AG-UI turn through the existing server-owned evidence workflow.
- Investigation context, thread persistence, citations, retry/idempotency, and approval boundaries remain covered by tests.
- CopilotKit thread/run behavior resumes from the file-backed Lattice store across page reloads and server restart, or any remaining limitation is explicit and accepted before release.
- The default view presents a compact answer, with evidence and caveats available on demand; citations navigate to existing graph records.
- Meaningful run states are visible through `thinking-orbs`, while idle and reduced-motion states remain calm and accessible.
- All integration tests are mocked/offline, and no CopilotKit Intelligence or live Azure request is configured implicitly.

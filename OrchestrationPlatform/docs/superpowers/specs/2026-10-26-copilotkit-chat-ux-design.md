# CopilotKit investigation chat UX design

## Intent

Replace the investigation Copilot's hand-built transcript and request flow with
CopilotKit's V2 `CopilotChat` experience. The chat should feel like a polished,
responsive assistant while preserving the application's investigation-specific
evidence, citations, review cues, archived state, and safe failure behavior.

The user wants the existing Copilot chat revamped in place, using CopilotKit
and the previously shared `thinking-orbs` library. The accepted direction is
CopilotKit's complete chat component, not a throwaway prototype or a bespoke
headless chat.

## Current behavior and constraints

- `InvestigationCopilotPanel` is a fixed right-hand panel with a manually
  managed transcript, textarea, send/retry state, latest-thread controls,
  evidence-review prompts, and expandable answer details.
- The panel currently sends turns through the Lattice JSON client. The
  CopilotKit V2 runtime and custom AG-UI agent exist separately; the visible
  chat does not yet use them.
- Lattice owns durable, investigation-scoped conversation storage and exposes
  routes to list/load persisted conversations. CopilotKit's default in-memory
  runner is wrapped to restore persisted messages after reconnect.
- The server turn service remains authoritative for Azure configuration,
  bounded investigation context, citation validation, snapshot revisions,
  idempotency, usage recording, and safe failure classification. Live model
  calls remain subject to the existing explicit opt-in.
- The agent is read-only. It has no connected-system tools and must not mutate
  engineering data.
- CopilotKit Intelligence is not part of this work. Its ready-made threads
  drawer and durable cross-device features require Intelligence; use the
  existing Lattice thread API instead.
- The checked-out frontend manifest and `node_modules` already contain
  `@copilotkit/react-core` 1.80.0, `@copilotkit/runtime` 1.80.0, AG-UI 1.0.2,
  and `thinking-orbs` 0.3.2. This design does not assume a new install.

## Goals

- Make CopilotKit V2 `CopilotChat` the actual user-facing chat and use its
  supported run lifecycle, AG-UI transport, composer, stop handling,
  scrolling, and component customization points.
- Keep the current investigation panel entry point and preserve its
  investigation context and compact desktop/right-drawer and mobile/full-width
  behavior.
- Preserve Lattice-owned thread listing, switching, creation, and restoration;
  bind each runtime thread to exactly one investigation and stored thread.
- Show concise, validated answers first and retain the existing structured
  claims, citations, recommendations, uncertainties, and follow-up cues.
- Keep conversations from an archived investigation readable while preventing
  new turns. Archiving is an investigation-level state in the current domain;
  individual conversations do not have an archive state.
- Use `ThinkingOrb` for truthful, accessible activity feedback and respect
  reduced-motion behavior.
- Preserve safe cancellation and clear retry/billing guidance without
  silently reissuing a potentially billed request. Offer retry only when the
  server classifies the failure as retryable, reusing the original request
  identifier; never retry ambiguous or possibly billed outcomes.
- Prevent the active thread from changing while a run is in progress. The user
  must stop the run before creating or selecting another conversation.

## Non-goals and anti-goals

- Do not connect CopilotKit Intelligence, hosted thread storage, memories,
  learning, analytics, or external telemetry.
- Do not use `BuiltInAgent`, add a second model provider, or bypass the Lattice
  turn service and Azure opt-in.
- Do not add tools, generative UI, shared mutable agent state, or actions that
  write to PLM/source systems. Those capabilities do not fit the current
  read-only product contract.
- Do not discard the Lattice conversation store or replace its
  investigation-scoped identity, revision, citation, or idempotency rules.
- Do not stream unvalidated model output to the user. A response is displayed
  only after the existing answer validator accepts it.
- Do not change the persisted answer schema as part of the visual migration.

## Approaches

1. **CopilotKit V2 `CopilotChat` with Lattice-specific slots — selected.**
   Use CopilotKit's provider and chat component for the interaction lifecycle
   and baseline chat UX, customizing its supported welcome, assistant-message,
   and input slots for investigation cues, validated citations, and product
   language. Retain a small Lattice-owned conversation selector because the
   prebuilt CopilotKit Threads Drawer depends on CopilotKit Intelligence.
   This is the most complete use of the library that fits the existing
   storage and security boundary.
2. **CopilotKit headless hooks and a wholly custom chat.** Use `useAgent` and
   lower-level chat/view APIs, then own the message list, composer, loading,
   scrolling, and lifecycle presentation. This offers maximal visual control
   but recreates behavior already provided by CopilotKit and is not the
   requested library-first experience.
3. **CopilotKit Intelligence threads and drawer.** This supplies managed,
   synchronized rich threads, but introduces the explicitly excluded hosted
   service and changes the data/storage boundary. It is out of scope.

## Proposed experience

- Keep the existing investigation-side panel and its close affordance, but
  make the body a CopilotKit chat rather than a parallel custom chat.
- Keep investigation identity, active snapshot revision, archived state, and
  conversation switching visible in the panel chrome.
- Provide a clear new-conversation action and a selectable list of existing
  Lattice conversations. Selecting a thread restores its persisted transcript
  through the AG-UI runner; starting a new thread creates a fresh,
  investigation-scoped runtime thread ID.
- Use a tailored welcome view for an empty conversation and one collapsed
  review-cue disclosure for both empty and populated conversations. Keep each
  cue an explicit user-triggered prompt; do not duplicate it with native
  suggestion chips or expose actionable cues in archived investigations.
- Use CopilotKit's composer and run/stop behavior, customized to the existing
  2,000-character bound, read-only notice, archived disablement, and
  investigation-oriented placeholder/labels. Keep the active composer compact
  and avoid a bright double focus ring while retaining a restrained visible
  focus state. Show the read-only notice only for archived conversations.
  Preserve keyboard access and focus-visible states.
- Render the assistant's concise validated answer as the primary message.
  Render supporting claims, unique citation references, recommendations,
  uncertainties, and follow-up questions in a compact, accessible disclosure.
  Citation controls continue to navigate to the corresponding Lattice
  evidence.
- Show a `ThinkingOrb` and concise status text while a run is active. Use
  library states only when they match a real lifecycle phase; do not invent
  intermediate research or progress events. Keep status announced accessibly
  and honor `prefers-reduced-motion`.
- Map AG-UI errors to clear, sanitized inline error UI. Distinguish safe retry
  from ambiguous/billed outcomes. An explicit retry must preserve the
  request's idempotency semantics; never retry automatically. When a request
  may have been billed, tell the user to check the usage ledger before
  retrying. Only render bounded printable validation detail (at most 160
  characters); do not expose provider diagnostics.
- Disable thread selection and new-conversation controls during a run; after
  the user stops or the run completes, allow conversation switching.

## Architecture and data flow

- Scope the `CopilotKitProvider` to the investigation chat experience and
  target the existing `/api/lattice/copilotkit` runtime.
- Supply the current investigation snapshot revision to the runtime agent.
  Use the runtime's message-filter capability if needed so the server receives
  only the current user turn; the Lattice service remains the source of truth
  for persisted context/history.
- Give each chat an AG-UI thread ID composed from the investigation ID and
  Lattice conversation ID. Load thread summaries/details through the existing
  Lattice routes, not Intelligence APIs.
- On a run, the custom agent delegates to `executeCopilotTurn`; it emits only
  a validated answer and sanitized error metadata. Cancellation propagates
  through the agent to the Azure request.
- On reconnect, the custom runner reconstructs a message snapshot from the
  investigation-scoped Lattice store. Keep runtime IDs and persisted thread
  IDs validated and correctly scoped. Reject malformed composite IDs before
  loading storage; a valid new client thread reconnects with an empty transcript.
- Disable CopilotKit OSS telemetry during Next.js server startup using the
  documented `COPILOTKIT_TELEMETRY_DISABLED=true` setting, before the runtime
  handles requests.
- Render persisted answer metadata through CopilotKit's assistant-message
  customization point. Treat missing or malformed metadata as a safe plain
  message; never render model-provided HTML.
- Load CopilotKit V2 styles through the app's supported Next.js global
  stylesheet entry point, then layer application tokens and scoped
  overrides without changing other routes.

## Decisions and builder calls

- The implementation uses the `CopilotChat` component with supported slots;
  the user selected this over a fully bespoke headless implementation.
- The panel remains an investigation-scoped Copilot, not a global assistant.
- The `archivedAt` flag belongs to the investigation snapshot. Individual
  conversation records cannot be archived independently.
- A user may retry only a server-classified retryable failure, using the same
  user-message ID as the idempotency key. Ambiguous or possibly billed failures
  are not retryable in the UI.
- Thread switching and new-conversation actions are disabled during active
  runs; users stop the run first to avoid silently detaching in-flight work.
- Lattice remains authoritative for persistent conversation metadata,
  validated answer records, and citations.
- CopilotKit Intelligence is excluded; consequently, the built-in Threads
  Drawer and Intelligence-dependent `useThreads` data source are not suitable
  for this work.
- The builder may decide the exact slot composition, spacing, responsive
  breakpoints, and presentation of loading/error/retry states, provided the
  existing panel placement, accessibility, and safety requirements remain.
- CopilotKit and `thinking-orbs` dependencies are already present in the
  checked-out frontend; do not reinstall or change versions without a concrete
  compatibility need.

## Validation expectations

- Offline tests cover provider/thread identity, transcript restoration,
  starting/switching conversations, snapshot revision propagation,
  cancellation, safe errors/retry behavior, archived state, citations, and
  review-cue actions. Reconnect tests prove malformed composite IDs never load
  storage and a fresh valid client thread restores no messages; startup tests
  prove telemetry is disabled before runtime requests. Panel tests cover the
  usage-ledger warning for potentially billed failures and reject oversized or
  control-character validation details.
- Component tests verify CopilotKit slots receive/display the validated
  answer metadata and that the orb/status is accessible.
- TypeScript, focused lint/tests, and a browser check of the existing
  investigation chat cover desktop/mobile layout, keyboard use, reduced motion,
  and normal/active/error/archived states.
- Tests must not make live Azure calls; do not enable live calls for validation.

# Lattice Conversational Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect supported single-turn Engineering Impact questions in the existing Lattice Copilot conversation to the authenticated runtime, preserving rich answers and citations while keeping activation disabled until real identity and authorization providers are available.

**Architecture:** A server-only runtime client and credential-provider seam connect supported impact turns to the existing .NET endpoint; runtime dispositions map into one existing Copilot answer event and persist with compact typed continuation state. Every runtime turn re-resolves the subject and retrieves current evidence. The feature flag remains disabled by default; browser-provided identity and tokens are never trusted, and missing identity or authorization configuration remains explicitly unavailable. Target-application filtering remains deferred until the PLM contract confirms its semantics.

**Tech Stack:** Next.js/React, CopilotKit v2, TypeScript, ASP.NET Core/.NET 10, existing PLM Brain service contract, Vitest/xUnit, and the existing synthetic evaluation harness.

**Spec:** User-provided Phase 2 planning requirements in this conversation; repository evidence was inspected directly. No additional design document is required.

**Closure status:** Repository-local implementation and deterministic verification are complete. Production activation and target-application filtering remain explicitly blocked on external platform contracts and providers; this plan does not claim live production readiness.

## Global Constraints

- PLM Brain remains authoritative for entities, relationships, impact paths/chains, and evidence.
- Conversation history is not engineering truth; previous model answers are never evidence.
- Re-authorize every runtime turn; never reuse authorization tickets or grants.
- Keep `InvestigationId` explicit and reject text-only investigation switches.
- Preserve Phase 1 provenance, validation, token-budget, telemetry-privacy, and authorization contracts.
- Do not add a database, general chatbot framework, RAG, embeddings, vector search, MCP, agents, or document ingestion.
- No ownership or criticality claim unless supported by current authorized evidence and a governed definition; otherwise clarify or abstain.

## Review Focus

- **A follow-up arrives after a snapshot, ontology, or evidence version changes:** discard derived references, re-resolve the subject, and rerun retrieval.
- **A prior answer is rejected, abstains, or contains multiple candidate entities:** do not resolve “those materials” from its prose; use only still-valid structured references or clarify.
- **“Only {application}” is interpreted as an evidence-source filter rather than an impacted-entity application filter:** treat SAP as one example, keep source and target application semantics distinct for every supported application, and test that the requested target application is actually enforced by PLM Brain and the compiler.
- **Authorization expires, changes, or denies access mid-thread:** the next request must obtain a fresh decision; denied/unavailable outcomes must not reach retrieval/model or fall back to legacy.
- **Thread IDs or investigation text are changed across tenants/investigations:** bind stored state to the authenticated owner and route investigation; reject cross-scope reuse.

---

## 1. Repository Trace: Current Code Flow

### Actual current flow

1. **User message → UI:** `InvestigationCopilotPanel.tsx` creates/selects a thread scoped to the current `investigationId` and mounts `CopilotKitChatSurface.tsx` with the current `snapshotRevision`. CopilotKit v2 uses `runtimeUrl="/api/lattice/copilotkit"`; its message filter forwards only the latest user message.
2. **CopilotKit/runtime route:** `frontend/app/api/lattice/copilotkit/[[...path]]/route.ts` constructs `CopilotRuntime`, `LatticeCopilotAgent`, and `CopilotKitConversationRunner`. The runner encodes investigation/thread IDs in the CopilotKit thread ID and restores saved transcript messages from `FileCopilotConversationStore`.
3. **Turn execution:** `LatticeCopilotAgent.run` extracts the investigation/thread identity and latest user message, reads `snapshotRevision` from forwarded properties, then invokes `executeCopilotTurn`.
4. **Runtime selection:** `executeCopilotTurn` checks `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED` through `engineering-impact-runtime-routing.ts`. The flag defaults off. When enabled for a supported question, the current configuration hard-codes authorization and identity readiness to false; if routing ever returns `runtime`, execution still returns `ai-runtime-invocation-unavailable`. Thus this route never calls the .NET runtime today.
5. **Current Copilot path:** when routing remains legacy, `executeCopilotTurn` loads the investigation snapshot, checks archive/revision, builds the frontend `CopilotContextPacket` from the saved snapshot/PLM Brain graph, appends the user message, and sends up to 12 prior transcript messages—including serialized prior assistant answers—plus the newly compiled context to the Azure model. It validates citations/claims with `answer-validator.ts` and persists the answer.
6. **Persistence/rendering:** `FileCopilotConversationStore` stores user text and full `CopilotAnswer` records in JSON under the investigation directory. `LatticeCopilotAgent` emits one assistant message with `metadata.latticeAnswer`; `CopilotKitChatSurface.tsx` validates that metadata and `CopilotAnswerContent.tsx` renders text and inspectable citations. Failures are converted to a generic UI failure and optional retry.
7. **Second HTTP surface:** `/api/lattice/investigations/[investigationId]/copilot` lists threads and exposes a POST that also calls `executeCopilotTurn`; the current panel uses this surface for thread listing, while normal message submission uses CopilotKit. The thread-specific route is read-only. These are two transports over one execution/store path, not two intended memory systems.
8. **Separate .NET runtime:** `EngineeringImpactController.Answer` is `[Authorize(Policy="AiRuntime")]`. Every HTTP request derives tenant/subject from the authenticated `ClaimsPrincipal`, asks the decision provider for current investigation access, and creates a short-lived signed PLM ticket. `ImpactAnswerService` performs narrow interpretation → canonical PLM entity resolution → scope planning → PLM evidence retrieval → provenance/version checks → Context Package compilation → prompt/model → parse/answer validation → disposition. `Answer` returns 200, clarification/abstention 422, denial 403, and failure 502/503. Its default provider is `UnavailableResourceAuthorizationDecisionProvider`, so readiness is documented as 503.

### Concrete integration findings

- There is no call from the Copilot route to `POST api/engineering/impact-answer`; Phase 1 routing is a disabled boundary, not a connected product path.
- The routing configuration’s identity/provider readiness values are hard-coded false, and the execution branch for `runtime` is an explicit 503. Replacing that branch with the authenticated runtime client is a required Phase 2 integration fix, not a Phase 1 redesign.
- The Next.js Copilot and thread route handlers inspected here have no explicit user-authentication/ownership check. The .NET endpoint does require JWT authentication. An approved Next.js-to-.NET user identity/token path is required before connecting them.
- `CopilotConversationThread` stores transcript and answer citations, but no typed conversation state, canonical entity set, active filters, evidence version, ontology version, or expiry. Its JSON store uses per-instance in-process serialization and has no tenant/user owner field, delete API, or expiry policy.
- `RuntimeRequestContext.ConversationId` is correlation only. `ImpactAnswerResult` returns a `ContextPackageId`, but not a continuation-state contract or validated current-entity set. `EvidenceRetrievalResult` carries source and ontology versions.
- `ScopePlanner` always returns a three-hop scope with empty relationship/source filters. `ImpactScope.SourceSystems` filters evidence provenance/source/provider; it does not explicitly mean “impacted target applications.” The internal PLM Brain implementation is not present in this checkout, so its support for target-application and ownership filtering must be confirmed.
- The frontend context builder ranks paths with heuristic risk signals and has a `critical-cross-system-link` label. This is not a governed severity/criticality definition. The .NET Phase 1 runtime has no such criticality policy.

## 2. Existing Reusable Components

- CopilotKit v2 surface, agent, single-message rendering, citation selection, and investigation-scoped thread IDs.
- `CopilotConversationStore` / `FileCopilotConversationStore` optimistic thread revision and atomic JSON replacement.
- .NET `EngineeringImpactController`, `AuthorizationContextProvider`, signed-ticket issuer, `ImpactAnswerService`, `ContextCompiler`, `AnswerValidator`, and `IAiRuntimeTelemetry`.
- Existing explicit source/relationship/hop scope and provenance validation; keep its semantics unchanged.
- Existing synthetic .NET one-turn evaluation and frontend answer/citation tests as the base for a single multi-turn golden harness.

## 3. Phase 2 Contracts

Add a versioned, minimal `ConversationState` contract shared at the API boundary and persisted with the existing thread:

```text
schemaVersion
conversationId / threadId
investigationId
stateVersion
currentSubjectIds
currentValidatedEntityRefs[] (canonicalId, entityKind, application)
applicationFilters (sourceApplications[], targetApplications[])
relationshipFilters[]
impactScope (maxHops, asOf; preserve Phase 1 meanings)
outputDimension (impact | ownership | explanation | comparison)
previousTurnId
previousContextPackageId
snapshotRevision
sourceVersion
ontologyVersion
ownerFingerprint
unresolvedReference? (reasonCode, candidateCanonicalIds, createdAt)
lastTurnDisposition
createdAt / updatedAt / expiresAt
```

Only IDs and version metadata needed to re-resolve follow-ups are persisted. `ownerFingerprint` is an opaque server-derived binding for thread ownership, not an authorization grant. Do not persist bearer tokens, signed tickets, grants, raw evidence, prompts, model prose as fact, or a stale authorization decision. Every turn obtains a new authorization decision and reruns retrieval; prior package/evidence references are for invalidation and diagnostics only.

Add a typed `ConversationTurnInterpretation` for `NewImpactQuestion`, `FollowUpFilter`, `FollowUpRestriction`, `FollowUpExpansion`, `FollowUpOwnershipQuestion`, `FollowUpExplanation`, `FollowUpComparison`, `ClarificationResponse`, and `Unsupported`. It contains structured identifiers, reference candidates, filter deltas, output dimension, ambiguity/reason codes, and clarification status—not evidence or authorization decisions.

Add a typed clarification result to the runtime response: `reasonCode`, user-facing question, currently authorized candidate references (if any), state version, and expected next-turn action. Keep existing `AnswerDisposition` semantics; extend response fields additively or version the API contract rather than changing Phase 1 meaning.

## 4. Resolution, Scope, and Recompilation Rules

### Reference resolution

Resolve in this order on every turn:

1. Parse explicit identifiers deterministically; explicit new IDs replace the current subject only after PLM canonical resolution under current authorization.
2. Match pronouns/noun phrases only against typed references from the immediately preceding validated runtime turn.
3. If there is exactly one eligible reference, use it as a candidate and re-resolve it with PLM.
4. If there are multiple eligible candidates, or a missing/stale/inaccessible reference could materially change the engineering meaning, clarify; never select by lexical similarity alone. When the current turn and validated state strongly support one interpretation, resolve it and answer rather than asking a redundant question.

An abstaining/denied/failed turn contributes no new entity references. An explicit user rejection invalidates the rejected entity set; keep the subject only if it remains separately validated and the user’s correction unambiguously refers to it. A changed investigation in text is ignored as routing input and clarified; only the active route/investigation context can change it.

### Conversation-aware scope

The planner consumes the interpreted turn, persisted state, route `InvestigationId`, current authorization context, current PLM canonical resolutions, and supported application/relationship definitions. It outputs an explicit query plan plus inherited/changed fields.

- “Only {application} impacts” (for example, SAP, Windchill, Teamcenter, or Configit) inherits the validated subject and investigation, sets `targetApplications` to the requested application, retains supported previous filters, and reruns PLM retrieval. Do not implement this by treating `SourceSystems` as a target-application filter.
- Apply a target-application filter to the impacted terminal entities while retaining the complete authorized relationship path and evidence through other applications; do not remove useful cross-system/intermediate links merely because they are outside the requested target application.
- “Which teams own those materials?” resolves “those materials” only from validated prior-turn SAP material IDs. Ownership is a new output dimension; answer only if current authorized PLM evidence supplies governed owner/team references, otherwise clarify/abstain.
- “Only operational impacts” maps only to current ontology-defined relationship types; if no exact supported mapping exists, clarify.
- “Only critical things” clarifies unless current evidence includes a governed criticality field and an approved definition. Do not reuse the frontend heuristic “critical” path ranking as severity.

The runtime must reauthorize first, then interpret/resolve, then retrieve and compile fresh evidence. Previous Context Packages may be referenced for trace/debug only; they are not answer evidence. Every follow-up re-resolves IDs and reruns evidence retrieval. Recent transcript text may help interpret pronouns or conversational intent, but cannot override authorization, investigation, canonical identities, PLM relationships, or current retrieval. `ContextCompiler` and `AnswerValidator` enforce application/relationship filters again after retrieval so a PLM service filter bug cannot silently broaden an answer.

When evidence is partial, preserve the strongest supported claims and explain which requested portion lacks support. Do not discard a useful partial answer or return a generic abstention solely because one requested dimension is unavailable.

The current internal PLM request contract contains `ImpactScope` but no explicit target-application filter. Add a versioned application-filter field/contract only after the PLM Brain owner confirms exact source-vs-target semantics and implements the corresponding filter; do not silently repurpose Phase 1 `SourceSystems`.

## 5. Persistence, Invalidation, and Retention

Extend `CopilotConversationThread` and its existing JSON record with optional versioned `conversationState`; do not introduce a second “memory” service or database in the first slice. Keep transcript messages for human-readable history, structured state for follow-up references/filters, and runtime evidence state as package/version references within the structured state.

Before saving a completed turn, use the existing thread revision as an optimistic concurrency check and atomically persist assistant response plus state update. Restore older threads with no state as `stateVersion=0` and start them as a new explicit question or clarify; do not infer state from old answer prose.

Invalidate derived entity sets and scope on investigation mismatch, snapshot revision change, source/evidence version change, ontology version change, any authorization change, deleted/inaccessible entity, explicit rejection, or expired conversation. A subject ID may survive only as a candidate to re-resolve under current investigation and authorization; no evidence or grant is reused. On denial, discard the returned state update; on provider unavailable, do not fall back or write new state.

Set `expiresAt` from the platform’s existing conversation/investigation retention policy; do not invent a separate idle TTL. Confirm the applicable policy with the data owner before rollout. Keep state thread-owner scoped; investigation ID alone is not proof of tenant/user ownership.

The current file store is safe only where its volume is durable and requests share a single writer/coherent concurrency boundary. Confirm the deployment model. If the product runs multiple ephemeral instances or lacks a shared durable volume, use the platform’s existing persistence service; add a database only if no suitable store exists and the product owner approves it.

## 6. Product Routing and UI

Keep one CopilotKit chat and one assistant turn per user turn. Route `NewImpactQuestion` and supported impact follow-ups to the .NET runtime; route unsupported general Copilot questions to the existing path only when they are not a continuation that depends on runtime state. A Phase 2 clarification/denial/unavailable result must never fall back to legacy model output.

Use the existing server-only feature flag `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED`, default false. Replace the hard-coded readiness booleans and 503 placeholder only with actual server-side runtime-client/auth/provider readiness. The client must forward a validated user identity/token obtained from the approved app authentication integration; never accept identity, grants, or tokens in `forwardedProps` or request-body fields. Keep Phase 1 API authorization and signed PLM tickets intact.

Render runtime `Answer`, `Clarify`, `Abstain`, `Deny`, and `Failed` in the existing `latticeAnswer`/assistant-message surface with inspectable existing citations. Preserve supported detail about why entities are impacted, direct/indirect paths, cross-system relationships, and evidence. Qualify only the unsupported portion of a partial answer. Clarify only where ambiguity materially changes subject, investigation, application, or scope. Show a compact active-scope label for inherited subject and filters; do not add a second chat, transcript, or memory UI.

## 7. Observability

Extend `IAiRuntimeTelemetry` and `AiRuntimeTelemetry` with bounded values only: interpreted turn type, reference-resolution outcome, inherited-subject count, filter-change category, clarification reason code, state version/invalidation reason, retrieval rerun decision, parent/turn correlation, disposition, stage latency, and model token counts.

Conversation correlation is opaque/pseudonymous. Do not emit raw conversation text, prompts, answers, tenant/user/entity IDs, candidate lists, source/evidence payloads, or authorization tickets. Avoid high-cardinality metric labels; use bounded enums/counts and traces subject to the existing privacy processor.

## 8. Multi-Turn Evaluation and Release Gates

Extend the existing synthetic evaluation runner with five conversations:

- **A:** R-123 impact → filter to one requested application (SAP is an example, not a special case) → ownership of those materials → criticality clarification.
- **B:** R-123 impact → explicit R-456 → Configit-only → explicit return to R-123.
- **C:** missing subject → R-123 clarification response → operational-only filter.
- **D:** multiple prior part candidates → “those parts” must clarify.
- **E:** investigation/snapshot changes → previous derived state invalidated and subject re-resolved.

Add grouped negative cases for investigation-switch text, unauthorized application, prompt injection in prior transcript, stale/deleted evidence, cross-tenant thread ID, expired state, conflicting filters, and long transcript. The evaluator reports the requested dimensions separately: intent, subject carryover, reference resolution, scope/filter, clarification, authorization isolation, freshness/invalidation, unsupported references, citations, answer completion/useful grounded detail, unnecessary clarification/refusal, duplicate assistant response, and latency/token growth. Do not make refusal rate a success objective; track unsupported claims and unnecessary refusal/clarification together.

Keep deterministic contract/golden evaluation separate from live model and human-quality evaluation. First-turn/follow-up evaluation must report reference integrity and model/semantic limitations explicitly. Use current question, compact typed state, and only the recent conversational turns that improve interpretation, subject to the existing model input budget. Measure latency/token growth against the baseline; do not use prior assistant prose as engineering evidence.

## 9. Exact File Ownership

### Modify

- Add `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Conversation/ConversationState.cs`, `ConversationTurnInput.cs`, and `Requests/ConversationTurnInterpretation.cs`; extend `Answers/AnswerContracts.cs` additively.
- Add `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/IConversationTurnInterpreter.cs` and `ConversationTurnInterpreter.cs`; preserve `QuestionInterpreter.cs` as the deterministic explicit-ID parser.
- Modify `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/IScopePlanner.cs`, `ScopePlanning/ScopePlanner.cs`, `Application/ImpactAnswerService.cs`, `ContextCompilation/ContextCompiler.cs`, and `Validation/AnswerValidator.cs`.
- `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ImpactScope.cs` only if a versioned, explicit application-scope extension is agreed; retain the existing `SourceSystems` meaning.
- `OrchestrationPlatform/Lattice.AI.Runtime/Evidence/PlmBrainServiceContracts.cs`, `Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs`, `EngineeringImpactController.cs`, `AI/Adapters/PlmBrainClient.cs`, and `PlmBrainEngineeringEvidenceSource.cs` for a confirmed versioned query/response contract and turn IDs.
- `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/IAiRuntimeTelemetry.cs` and `Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs`.
- `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`, `execute-copilot-turn.ts`, `engineering-impact-runtime-routing.ts`, `copilotkit-agent.ts`, `copilotkit-agent-runner.ts`, `kernel/ports/copilot-conversation-store.ts`, and `kernel/server/file-copilot-conversation-store.ts`.
- `OrchestrationPlatform/frontend/app/api/lattice/copilotkit/[[...path]]/route.ts` and `app/api/lattice/investigations/[investigationId]/copilot/route.ts` for authenticated turn context and thread ownership.
- `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx` and `InvestigationCopilotPanel.tsx` for one-response rendering and compact active filters.
- Existing `Lattice.AI.Runtime.Tests` interpreter/scope/service/API/evaluation tests, telemetry tests, and focused frontend execution/chat-surface tests.

### Add only if required by the confirmed integration

- A server-only `engineering-impact-runtime-client.ts` if no existing authenticated HTTP client is reusable.
- One multi-turn fixture file under `OrchestrationPlatform/evals/engineering-impact/` if the existing one-turn dataset cannot express turn sequences.
- No new persistence database, generic conversation framework, agent framework, or documentation bundle.

## 10. Minimal Coherent Implementation Slice

**Slice 2A — single-turn product integration:** connect supported impact questions from the existing CopilotKit UI through a server-only runtime client to the .NET runtime and persist one rich result with inspectable citations. Keep the feature flag disabled by default; when endpoint or credential configuration is missing, persist one explicit unavailable outcome.

**Slice 2B — first follow-up:** persist runtime-owned validated state after turn 1; handle “What about only {application} impacts?” for any application supported by the confirmed PLM contract by reauthorizing, resolving the saved subject, applying the target-application filter to impacted terminal entities while preserving complete paths, retrieving fresh PLM evidence, and rendering one current answer. SAP is an example, not a special case or whitelist.

Implement Slice 2A repository-local wiring now; do not make a live call without the approved identity and real authorization provider. Slice 2B stays gated on confirmed PLM target-application semantics. If PLM does not expose target-application metadata, verify whether correct terminal filtering can preserve complete paths and provenance before changing the contract.

## 11. Implementation Tasks

**Approved execution order:** (1) Slice 2A server-side client/contracts; (2) routing and response mapping; (3) CopilotKit/UI integration; (4) focused integration tests; (5) one integrated verification; (6) conversation-state contracts; (7) Slice 2B only after target-application semantics are confirmed. The conversation-state and multi-turn tasks below are deferred and must not precede Slice 2A.

### Slice 2A.1: Add server-only runtime client and credential seam

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/runtime-access-token-provider.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`

**Interfaces:**
- `RuntimeAccessTokenProvider.getAccessToken(signal) -> { status: "available"; accessToken } | { status: "unavailable" } | { status: "failed" }`; the production default explicitly reports unconfigured.
- Client accepts question, route-bound investigation, conversation ID, turn ID, optional signal; it owns endpoint configuration and obtains credentials only via the server-side provider.
- Map HTTP/runtime outcomes to Answer, Clarify, Abstain, Deny, Unavailable, Failed while retaining context package, citations, and stable diagnostics.

- [x] Test configured/unconfigured endpoint, credential-provider outcomes, HTTP disposition mapping, cancellation/timeout, and confirm request contains no browser-provided credential field.
- [x] Run this client test file.

### Slice 2A.2: Replace runtime routing dead end

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

**Interfaces:**
- Read endpoint/token-provider readiness from the actual client; preserve `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED=false` by default.
- Supported impact requests use the client only after current investigation/revision and transcript setup. Persist one mapped terminal result. Missing credentials/provider yields one explicit unavailable response. Never fall back after selecting runtime.
- Non-impact questions retain the existing general Copilot path.

- [x] Test enabled+configured runtime call, disabled legacy path, non-impact legacy path, missing-credential unavailable persistence, and denial/clarification without legacy-model invocation.
- [x] Run both focused routing/turn test files.

### Slice 2A.3: Preserve runtime result in the current Copilot UI/store

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Test: existing CopilotKit chat-surface and answer-content tests

**Interfaces:**
- Preserve runtime disposition, context package ID, detailed answer text, and existing inspectable citations on stored `CopilotAnswer`.
- Map every terminal runtime outcome to exactly one `latticeAnswer` assistant message; keep citation navigation and display in the existing surface.

- [x] Test an answer with multiple impacts/citations and one non-answer disposition renders as one assistant response.

### Slice 2A.4: Add TurnId correlation to the existing runtime request

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/RuntimeRequestContext.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Test: existing runtime contract and authorization API tests, only if changed behavior requires it.

**Interfaces:**
- Add an optional `TurnId` correlation property; preserve request/trace ID and conversation ID behavior.
- The runtime endpoint continues to require `AiRuntime` JWT authorization and existing server-derived authorization decisions. No Phase 1 authorization design changes.

- [x] Verify missing TurnId preserves existing behavior and supplied TurnId is carried into runtime request context.

### Slice 2A.5: Integrated verification

- [x] Run the focused client, routing/turn, and CopilotKit render tests once together.
- [x] Run the smallest API/runtime verification needed for the additive TurnId contract.
- [x] Confirm flag default remains off; no live call occurs with the default unconfigured provider; non-impact turns still use legacy; no changed Phase 1 authorization behavior.

### Later: Conversation state and Slice 2B

Do not implement target-application filtering for any application, ownership, criticality, or broad reference resolution before Slice 2A is integrated and the relevant PLM semantics are confirmed. Generic application labels may be interpreted and carried as requested filter terms, but must not be presented as enforced filters until the PLM contract supports them.

### Deferred Task: Define conversation-state contracts

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Conversation/ConversationState.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Conversation/ConversationTurnInput.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/ConversationTurnInterpretation.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Contracts/ConversationStateContractTests.cs`

**Interfaces:**
- `ConversationState` carries investigation/thread identity, versioned subject/entity references, active filters, output dimension, prior turn/context IDs, snapshot/source/ontology versions, unresolved clarification, disposition, ownership binding, and timestamps.
- `ConversationTurnInput` carries current question, active investigation, turn/parent IDs, and optional previous state loaded server-side.
- `ImpactAnswerResult` additively returns optional continuation state and typed clarification details.

- [x] Assert C# and TypeScript JSON names/version agree and a missing prior state represents a new turn.
- [x] Run the focused contract tests.
- [x] Included in the Phase 2 repository-local closure commit.

### Task 2: Interpret follow-ups and resolve references

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/IConversationTurnInterpreter.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/ConversationTurnInterpreter.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding/ConversationTurnInterpreterTests.cs`

**Interfaces:**
- `IConversationTurnInterpreter.InterpretAsync(ConversationTurnInput input, RuntimeRequestContext requestContext, CancellationToken cancellationToken) -> ConversationTurnInterpretation`.
- Deterministically parse explicit IDs and requested app/ontology filter terms first. Application names are generic values, not a SAP-specific whitelist; raw requested values are not treated as canonical or enforced until validated against the current authorized PLM/ontology contract.
- For supported natural-language follow-ups that remain unresolved, constrained model output may propose only intent, state-reference IDs, requested filters/output dimension, and ambiguity.
- Validate proposed IDs against server-loaded state and terms against current authorized PLM/ontology choices. Model output never decides canonical identity, evidence, authorization, relationships, or impact truth.

- [x] Add one table-driven interpreter matrix for all requested turn types plus A–E reference outcomes, including generic application names (not a SAP-only list), ambiguity, stale/mismatched prior state, and prior non-answer dispositions.
- [x] Run focused interpreter/service/contract tests using `dotnet test .\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj`.
- [x] Included in the Phase 2 repository-local closure commit.

### Task 3: Plan scope and rerun authorized PLM retrieval

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/IScopePlanner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ImpactScope.cs` only for an agreed additive/versioned application filter
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Evidence/PlmBrainServiceContracts.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainClient.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainEngineeringEvidenceSource.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ScopePlanning/ScopePlannerTests.cs` and `ContextCompilation/ContextCompilerTests.cs`

**Interfaces:**
- `ScopePlanner.Plan(ConversationTurnInterpretation turn, ConversationState? priorState, ResolvedEntity subject, AuthorizationContext authorization, RuntimeRequestContext requestContext) -> ScopePlanningResult`.
- Every request enters through the existing controller authorization first. All inherited IDs are re-resolved; retrieval is rerun. Application and relationship filters are enforced at PLM query and after retrieval.
- Keep Phase 1 `ImpactScope.SourceSystems` meaning unchanged. Do not implement target-application filtering until the PLM service contract supports it.

- [x] Test that a single inherited reference is re-resolved under the current authorization and returns to the existing bounded impact scope.
- [x] Test that a generic requested application filter is not mapped to `SourceSystems` and cannot produce an unfiltered answer.
- [x] Deferred target-application filtering tests until the PLM target-application contract is confirmed; generic unsupported application requests clarify rather than return unfiltered results.
- [x] Run focused interpreter/service/state/scope tests (64 passed), runtime telemetry tests (12 passed), and context compiler tests (10 passed).
- [x] Included in the Phase 2 repository-local closure commit.

### Task 4: Persist continuation state with the existing thread

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/kernel/ports/copilot-conversation-store.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- Modify: `OrchestrationPlatform/frontend/app/api/lattice/investigations/[investigationId]/copilot/threads/[threadId]/route.ts`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs` and `EngineeringImpactController.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ConversationStateRetentionOptions.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/ConversationStateOwnerFingerprint.cs`
- Test: frontend thread store/client/execution tests and `.NET` impact-answer service tests

**Interfaces:**
- Extend `CopilotConversationThread` with optional `conversationState`; extend `appendTurn(..., assistantTurn, nextState?)` so assistant response and state update persist atomically at the existing thread revision.
- The server loads state from the investigation/thread record and supplies it to the runtime as an untrusted hint with the parent assistant turn ID. No browser property supplies the state; public thread GET responses omit it.
- The runtime binds generated state to a fingerprint derived from the currently authorized tenant/subject, re-resolves carried references, and emits state only when `AiRuntime:ConversationState:LifetimeSeconds` has an approved positive value.
- Only validated Answer/Clarify results can replace or clear continuation state. Deny, Abstain, Failed, and Unavailable results do not update it.
- Repository-local persistence remains the current investigation-scoped JSON store; production owner binding, durable shared storage, cross-instance concurrency, and approved retention remain activation requirements.

- [x] Test atomic assistant/state persistence, legacy threads without state, wrong thread/investigation/turn rejection, server-side prior-state forwarding, and no state update after denial.
- [x] Test owner fingerprint binding and rejection of a different owner before entity resolution; re-resolve the current subject and store fresh source/ontology versions on successful answers.
- [x] Run focused frontend tests (51 passed) and focused .NET runtime/API tests (74 passed); ESLint and diff hygiene passed.
- [x] Run frontend TypeScript check; it remains blocked by existing diagnostics in `provider-backed-answer-validation.test.ts`, `ontology-evidence-adapter.ts`, and `copilot-relationship-flow.test.ts` (no diagnostics remain in the changed files).
- [x] Record platform/product approvals for state retention, authenticated thread ownership, and durable shared persistence as production activation gates; do not enable continuation state in production until obtained.
- [x] Included in the Phase 2 repository-local closure commit.

### Task 5: Connect the CopilotKit route and render runtime outcomes

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/copilotkit-agent.ts`
- Modify: `OrchestrationPlatform/frontend/app/api/lattice/copilotkit/[[...path]]/route.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`

**Interfaces:**
- The Next server posts current question, route-bound investigation ID, conversation/turn IDs, and server-loaded previous state to the existing `[Authorize]` endpoint using the approved validated user token.
- `ImpactAnswerService` returns one disposition plus validated continuation state; the Copilot agent maps it to exactly one `latticeAnswer` assistant event with supported citations.
- Supported impact/follow-up turns use the .NET runtime. Unsupported general Copilot turns remain on the existing path; runtime clarification/denial/unavailable never falls back to legacy.
- Keep the feature flag disabled by default; readiness comes from actual configured integration, not hard-coded booleans. Remove prior assistant JSON from the runtime model input.

- [x] Test that CopilotKit emits one `latticeAnswer` assistant message, runtime denial/clarification/unavailability do not invoke the legacy model, missing credential state produces one unavailable answer, and rich answer citations render in the current surface.
- [x] Run focused CopilotKit runtime/client/routing/agent/runner/store/UI tests (84 passed) and focused frontend lint.
- [x] Attempted live `/info` and round-trip verification; CopilotKit CLI received HTTP 500 from the runtime endpoint. The live check is blocked, not passed, and must be retried when the endpoint is available.
- [x] Included in the Phase 2 repository-local closure commit.

### Task 6: Add bounded telemetry and the multi-turn release gate

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/IAiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationReport.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`
- Add only if needed: one conversation-sequence fixture under `OrchestrationPlatform/evals/engineering-impact/`

**Interfaces:**
- Add bounded finite-enum/count observations for turn type, reference resolution, inherited count, filter change, clarification, state invalidation, retrieval rerun, parent/turn correlation, disposition, latency, and tokens.
- Report each requested multi-turn metric separately; synthetic/fake-model pass remains reference/behavior validation, not semantic or live-model quality.

- [x] Extend the existing evaluator with thirteen deterministic sequences covering supported explanation, ambiguous subjects/parts, generic unsupported application filters, expiry, owner/investigation mismatch, deleted subjects, explicit subject switching, clarification response, conflicting filters, and source-version change.
- [x] Exercise prior-message injection and long transcript non-forwarding at the server-only runtime-client boundary; all requests send only the current question plus typed server-loaded state.
- [x] Add separate bounded telemetry for turn type, reference resolution, inherited count, filter change, clarification, state invalidation, follow-up retrieval, parent correlation, and disposition. Existing request-stage duration and model-token instruments report latency and tokens without adding content dimensions.
- [x] Run focused frontend tests (84 passed), focused .NET runtime/evaluation tests (97 passed), ESLint, and diff hygiene.
- [x] Defer application-level unauthorized-target evaluation until PLM target-application and authorization semantics are confirmed; unsupported filters clarify and never produce an unfiltered answer.
- [x] Include evaluation, telemetry, tests, and plan updates in the Phase 2 repository-local closure commit.

## 12. Minimal Coherent Implementation Slice

Start with Conversation A turns 1–2 only: route the explicit R-123 impact question through the authorized .NET runtime, persist its validated canonical subject plus entity references/version fingerprints in the same thread, then handle “What about only {application} impacts?” by reauthorizing, resolving the saved subject, applying the requested target-application filter for any application supported by the confirmed PLM contract, retrieving fresh PLM evidence, and rendering one answer with current citations. SAP is an example only, not a special case or whitelist. Gate this slice on the approved user-token path, real authorization provider, and PLM target-application filter support. Extend ownership, comparison, and criticality after their evidence semantics are confirmed.

## 13. Commit Sequence and Focused Verification

The six task commits above are the planned sequence. Run only the focused test class/files named in each task and the multi-turn offline evaluation; run broader builds/tests only if those checks reveal integration failures. Do not create separate test-plan/review Markdown files.

## 14. Exit Status

### Repository-local closure — complete

- [x] Runtime integration remains disabled by default, uses only the server-side credential seam, and reports missing credentials/provider configuration as unavailable.
- [x] Runtime-supported outcomes map to one existing assistant response; denial, clarification, and unavailability do not fall back to the legacy model.
- [x] Structured continuation state is owner/investigation/conversation/parent-turn bound, references are re-resolved, retrieval is fresh, and answer/state persistence is atomic.
- [x] Prior assistant prose and transcript history are not sent as runtime evidence; answer detail and citations remain in the existing rendering path.
- [x] Thirteen deterministic synthetic conversation sequences and the existing one-turn reference-integrity cases pass. These validate runtime contracts and reference behavior, not live model answer quality.
- [x] Bounded conversation telemetry uses finite categories/counts; stage timing and token counts reuse existing telemetry instruments.
- [x] Focused frontend tests: 84 passed; focused .NET runtime/API/evaluation tests: 98 passed; focused ESLint and `git diff --check` passed.

### Production activation and PLM-contract gates — still open

- [ ] Platform identity owner supplies the approved server-side user-token acquisition/forwarding integration; no browser-controlled token is accepted.
- [ ] Security/platform owner supplies a production `IResourceAuthorizationDecisionProvider`; the unavailable default and `[Authorize(Policy = "AiRuntime")]` remain unchanged until then.
- [ ] Product/data owner approves a positive `AiRuntime:ConversationState:LifetimeSeconds`; platform owner confirms authenticated thread ownership and durable shared persistence with coherent concurrency.
- [ ] PLM Brain owner confirms and implements generic target-application filter semantics, authorization behavior, terminal-entity application metadata, and path/evidence preservation; only then implement filtering and out-of-scope claim validation.
- [ ] Retry CopilotKit `/info` and round-trip verification after the local runtime endpoint responds successfully; the attempted check returned HTTP 500.
- [ ] Keep the feature disabled until the above production gates pass. This repository-local close does not assert production activation or completion of the RAG phase.

## 15. Explicit Deferrals

Document RAG, chunking, embeddings, vector databases, MCP, general-purpose agents, LangGraph, CrewAI, broad memory summarization, autonomous tool selection, cross-investigation search, predictive recommendations, and broad workflow execution remain out of scope.

## 16. Final Decisions

1. **Proceed now?** Proceed with repository-local Slice 2A now. Live activation waits for approved identity forwarding and a real authorization provider; Slice 2B waits for PLM target-application semantics.
2. **Smallest coherent slice:** Conversation A turns 1–2 as described above.
3. **Highest risk:** securely binding a persisted conversation state to the current authenticated tenant/user and investigation while ensuring every carried entity is re-resolved and freshly authorized.
4. **Stable Phase 1 contracts:** authenticated principal-derived authorization, signed short-lived PLM ticket, `AnswerDisposition`, provenance-bound `ContextPackage`, answer validation, input-budget behavior, telemetry privacy, and the existing three-hop `ImpactScope` semantics.
5. **Simplify rather than extend:** remove serialized prior assistant answers from the runtime model context; make `executeCopilotTurn` a thin route/persist/render coordinator for runtime-supported turns; retain frontend snapshot/model logic only for non-Phase-2 questions.
6. **External decision required:** yes—platform identity owner must specify how the Next.js Copilot turn obtains and forwards the validated user JWT and how thread ownership is bound; security/platform owners must provide a real decision provider; PLM Brain owner must confirm target-application filter and ownership evidence semantics; product/data owner must approve state retention and deployment persistence.

## 17. Execution Amendment — 2026-11-19

The product objective is useful, detailed, evidence-backed engineering answers with natural follow-ups and minimal unnecessary clarification. Preserve supported answer richness and recent conversational context for interpretation; keep prior assistant prose separate from engineering evidence. For partial evidence, answer the supported portion and identify only what is unsupported. Do not add keyword blocking, arbitrary confidence thresholds, rigid question templates, generic refusals, or controls already enforced by the existing authorization/provenance/validation layers.

Develop continuously in this order: Slice 2A client/contracts; routing/outcome mapping; CopilotKit/UI integration; focused tests; one integrated verification. Only after Slice 2A, add compact runtime-owned conversation state and proceed to Slice 2B (R-123 followed by a filter for a requested application; SAP is one example). Application filtering must be generic across every application supported by the confirmed PLM contract, not hardcoded to SAP. Run focused tests during development, not a review cycle after each change. Later follow-ups proceed in this order: explicit subject switching; application filters; singular references; multiple-candidate clarification; clarification continuation; evidence-backed ownership; explanation/comparison; governed criticality; multi-turn telemetry/evaluation.

**Task 0 result — external activation gates:** production composition registers only `UnavailableResourceAuthorizationDecisionProvider`; other providers found are test fakes. The .NET endpoint requires a validated JWT, but the inspected Next.js Copilot path has no identity/token acquisition or forwarding seam today. The PLM v1 request contract has `ImpactScope.SourceSystems` only; no target-application filter or per-target entity application metadata is present in this checkout, and the PLM service implementation is outside it.

Do not fabricate a provider, accept client-supplied identity, or make live calls. These block activation, not repository-local Slice 2A development. Add the replaceable server-side credential seam with an unconfigured production default; keep routing unavailable until actual endpoint and credential providers are configured. Do not start target-application filtering for any application until PLM semantics are confirmed.

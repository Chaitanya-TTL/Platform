# Copilot Request Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a truthful, correlated, payload-level trace from Copilot Send through final response for manual testing.

**Architecture:** Add versioned structured summary events to the existing Next.js and .NET application logs, joined by a server-generated request ID and W3C trace ID. Carry one stable `RouteSource`, add ordered compiler decisions and candidate-to-model delivery events, and emit per-stage package summaries. Full payloads are available only in explicitly enabled non-production debug mode; retrieval, approval, validation, and answer behavior do not change.

**Tech Stack:** TypeScript/Next.js, C#/.NET 10, `ILogger`, Vitest, xUnit, OpenTelemetry Activity propagation.

**Spec:** `docs/superpowers/specs/2026-11-26-copilot-request-tracing-design.md`

## Global Constraints

- Preserve existing authorization, retrieval, compilation, validation, and response behavior. Tracing must observe decisions, not change them.
- `ContextCompiler` remains the only context-approval boundary.
- Full diagnostic content requires both the request header `X-Copilot-Diagnostic-Detail: full` and the explicitly configured Development/Testing allow-setting; it is not enabled in Production.
- Routine trace events use summaries, candidate references, IDs, and counts; whole prompts, snapshots, investigations, and documents are emitted only in targeted full-payload mode.
- The trace must not include access tokens, API keys, signed authorization-decision tokens, cookies, or authorization headers.
- Tracing is best-effort diagnostics and must not change answer behavior or turn a successful provider operation into a failed request.
- Do not infer retry counts hidden inside a provider SDK. Log an attempt only when the application or its transport exposes that attempt.
- When source data does not establish an application or rejection cause, report it as unknown rather than infer absence.
- Route and candidate reporting remain application-agnostic; no source application receives special selection, ranking, or tracing behavior.

## Review Focus

- **Malformed/missing correlation headers:** preserve the answer while recording the actual correlation mismatch. Test in Task 2 and Task 3.
- **Provider unavailable or error before a result exists:** log the actual failure and do not invent an empty-success output. Test in Task 3.
- **Compiler candidates skipped by an existing scope/eligibility branch:** record the precise branch reason without changing the compiled package. Test in Task 4.
- **Staged prompts containing segmented evidence:** log the exact stage message and assigned candidate IDs, with estimates distinct from provider token counts. Test in Task 5.
- **Partially rejected model answers:** report each claim/assertion and validation issue while retaining the existing overall answer outcome. Test in Task 6.

---

## File map

- Create `OrchestrationPlatform/frontend/features/lattice-next/copilot/copilot-execution-trace.ts` and tests: generate frontend correlation context and write versioned structured events to the existing server log.
- Modify `OrchestrationPlatform/frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`, `execute-copilot-turn.ts`, `engineering-impact-runtime-client.ts`, `azure-openai-client.ts`, and relevant tests: trace ingress, routing, legacy/runtime execution, and return.
- Create `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/CopilotExecutionTraceEvent.cs` and `ICopilotExecutionTrace.cs`; create the API logger implementation/options under `Orchestration.API/AI/Telemetry`; register and configure it in `AiRuntimeServiceCollectionExtensions.cs`.
- Modify `Orchestration.API/AI/Api/EngineeringImpactController.cs` and `Lattice.AI.Runtime/Application/ImpactAnswerService.cs`: accept trace correlation and emit actual interpretation, planning, retrieval, prompt, model, and request outcome events.
- Modify `Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs` and `Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`: return an ordered candidate-decision audit without changing the approved package.
- Modify `Lattice.AI.Runtime/Validation/AnswerValidator.cs` and `frontend/features/lattice-next/copilot/answer-validator.ts` only as needed to expose per-assertion outcomes; instrument final citation mapping and response persistence.
- Add focused tests in `Lattice.AI.Runtime.Tests` and `frontend/features/lattice-next/copilot/tests`; use test doubles so no live provider call is treated as real evidence.

### Task 1: Creating the Trace Event Contract and Writers

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/CopilotExecutionTraceEvent.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/ICopilotExecutionTrace.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/CopilotExecutionTraceLogger.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/CopilotExecutionTraceOptions.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/CopilotExecutionTraceNoOp.cs`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/copilot-execution-trace.ts`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/appsettings.json` and `appsettings.Development.json`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/CopilotExecutionTraceTests.cs`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilot-execution-trace.test.ts`

**Interfaces:**
- Produces the same envelope in TypeScript and C#: `schemaVersion`, `event`, `stage`, `routeSource`, `payloadDetail`, `timestampUtc`, `requestId`, `traceId`, optional `investigationId`/`snapshotRevision`/`durationMs`/`outcome`, `input`, `output`, `transformations`, `itemsAdded`, `itemsRemoved`, `rejectionReasons`, `payloadRef`, optional `fullPayload`, and `diagnostics`.
- C# event shape: `CopilotExecutionTraceEvent(string SchemaVersion, string Event, string Stage, string RouteSource, string PayloadDetail, DateTimeOffset TimestampUtc, string RequestId, string TraceId, string? InvestigationId, int? SnapshotRevision, long? DurationMs, string? Outcome, JsonElement? Input, JsonElement? Output, IReadOnlyList<JsonElement> Transformations, IReadOnlyList<string> ItemsAdded, IReadOnlyList<string> ItemsRemoved, IReadOnlyList<string> RejectionReasons, string? PayloadRef, JsonElement? FullPayload, JsonElement? Diagnostics)`.
- TypeScript event shape uses the same JSON property names and equivalent fields; `input`, `output`, and `diagnostics` use a recursive JSON value type, not `unknown`.
- TypeScript `CopilotTraceContext` is `{ requestId: string; traceId: string; traceparent: string; routeSource: CopilotRouteSource; payloadDetail: "summary" | "full" }`.
- C# exposes `ICopilotExecutionTrace.Write(CopilotExecutionTraceEvent traceEvent)` and an injectable no-op implementation when disabled.
- TypeScript exposes `createCopilotTraceContext(): CopilotTraceContext` and `writeCopilotTrace(event: CopilotExecutionTraceEvent): void`; the context contains a generated `requestId`, `traceId`, and W3C `traceparent`, and the writer emits a JSON event to the existing server log only when enabled.
- `RouteSource` values are the exact strings `LegacyFrontend`, `UnifiedRuntime`, `ImpactRuntime`, `FactRuntime`, `DocumentRuntime`, and `Unknown`.
- C# uses `AiRuntime:Diagnostics:FullPayloadTraceEnabled`; TypeScript uses `LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE` as the allow-setting. A request opts in with `X-Copilot-Diagnostic-Detail: full`; both the request opt-in and allow-setting are required, and Production must reject full payload mode.

- [x] **Step 1: Add failing writer/configuration tests** asserting exact JSON fields including `RouteSource` and `payloadDetail`, compact summaries by default, full payload inclusion only for selected non-production requests when enabled, credential/header exclusion in either mode, and trace-writer failures do not throw into answer execution.
- [x] **Step 2: Run the focused tests** and verify missing event-writer/config behavior fails.
- [x] **Step 3: Implement the shared event envelope and both log writers**; always emit compact input/output summaries and candidate references, add `PayloadRef`, include full payload only when the event is request-selected and the non-production allow-setting is enabled, and do not route payloads through Activity tags.
- [x] **Step 4: Add configuration validation** that enables full content for Development/Testing only and rejects the Production + full-trace combination.
- [x] **Step 5: Run the focused .NET and Vitest tests**; verify summary mode, targeted full-payload mode, secret exclusion, and non-throwing writer failures.

### Task 2: Correlating the Send Route and Frontend Paths

**Files:**
- Modify: `OrchestrationPlatform/frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`
- Test: `OrchestrationPlatform/frontend/app/api/lattice/investigations/[investigationId]/copilot/route.test.ts`

**Interfaces:**
- Consumes the Task 1 `CopilotTraceContext` and writer.
- The Send route creates a server request ID and fresh W3C root after request ingress; the user idempotency key remains a separate turn ID.
- The internal runtime request carries `X-Copilot-Request-Id`, `X-Copilot-Snapshot-Revision`, `X-Copilot-Route-Source`, `X-Copilot-Diagnostic-Detail` when selected, and the generated `traceparent`; these are diagnostic context and do not change runtime authorization or answer behavior.

- [x] **Step 1: Add failing tests** for ingress events, snapshot/thread/idempotency outcomes, runtime/legacy/blocked route decisions, and successful/failed final response events; assert `RouteSource` is `LegacyFrontend`, `UnifiedRuntime`, or `Unknown` as actually selected and is reused with one request/trace ID throughout.
- [x] **Step 2: Add a malformed or absent internal correlation-header test** proving the backend fallback is visible and does not change the answer result.
- [x] **Step 3: Run the focused Vitest tests** and verify the current runtime request is missing shared correlation and frontend stage events.
- [x] **Step 4: Instrument the route and `executeCopilotTurn`** with actual validated input, snapshot revision, selected route, actual outcomes, persisted answer, and final returned answer; represent branches as not-run only when the route decision establishes why.
- [x] **Step 5: Add request ID, snapshot revision, selected `RouteSource`, and W3C trace headers to the runtime client call**; do not forward client-supplied trace context.
- [x] **Step 6: Run the route, execution, and runtime-client Vitest tests** and verify both legacy and runtime paths correlate correctly.

### Task 3: Tracing Runtime Interpretation, Planning, and Retrieval

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainClient.cs` only where actual request/response boundary data is otherwise unavailable
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/EngineeringImpactControllerTraceTests.cs`

**Interfaces:**
- Consumes: `ICopilotExecutionTrace`, `CopilotExecutionTraceEvent`, `X-Copilot-Request-Id`, `X-Copilot-Snapshot-Revision`, and W3C `traceparent`.
- Produces ordered actual events for authorization outcome, conversation/question interpretation, resolved application/entity/field when returned, retrieval plans, PLM graph retrieval, fact retrieval (including exact source value and displayed/normalized value), application-context retrieval, and source-evidence retrieval. Every event retains the ingress `RouteSource`; component names distinguish retrievals executed inside the unified orchestrator.

- [x] **Step 1: Add failing tests** asserting the controller adopts valid propagated correlation, records actual malformed-correlation fallback, and preserves the answer disposition.
- [x] **Step 2: Add failing answer-service tests** asserting retrieval plan inputs, actual provider outputs, stage duration/outcome, investigation/request/trace IDs, and snapshot revision only when present in returned evidence.
- [x] **Step 3: Add tests** for each provider's unavailable, timeout, and error path; assert no empty-success response is logged and the observed failure code/provider details are retained without authorization material.
- [x] **Step 4: Run focused controller and answer-service tests** to capture current gaps.
- [x] **Step 5: Instrument actual interpretation, planner, retrieval, and failure branches**; emit request/response data at adapter boundaries and safe provider diagnostics at catch boundaries.
- [x] **Step 6: Run focused tests** and verify each invoked retrieval has actual input/output or an explicit observed failure, with no change to answer behavior.

### Task 4: Recording Compiler Decisions and Application Coverage

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`

**Interfaces:**
- Adds `ContextCandidateDecision` and `ContextCompilationResult.CandidateDecisions`; each decision includes candidate type/ID, source application, authority, freshness, citation IDs, evidence IDs, provenance, decision, and specific reason.
- `ContextCandidateDecision(string CandidateType, string CandidateId, string? SourceApplication, string? Authority, string? Freshness, IReadOnlyList<string> CitationIds, IReadOnlyList<string> EvidenceIds, JsonElement? Provenance, JsonElement CandidateData, bool Approved, string? ReasonCode, string? Reason)`; `Provenance` and `CandidateData` are the actual typed input serialized as JSON and are for the diagnostic trace only.
- Define reason codes for observed branches, including `AUTHORIZATION_DENIED`, `SNAPSHOT_MISMATCH`, `NO_PROVENANCE`, `OUT_OF_SCOPE`, `INVALID_LINEAGE`, `INVALID_EVIDENCE`, `PROVIDER_FAILURE`, `NOT_RETURNED_BY_PROVIDER`, `DUPLICATE_CANDIDATE`, and `INVALID_RETRIEVAL_SCORE`. Emit `STALE_FOR_CURRENT_QUERY` only if an existing current-only rule actually rejects a candidate. Use `COMPILER_REJECTION` only with the exact branch reason; never introduce a new rejection to produce a code.
- Candidate types cover graph relationships/claims, exact facts, application participation/digests, source passages, and source records used for citations.
- Compiler audit order follows actual input processing; decision records do not become prompt content or alter compilation results.

- [x] **Step 1: Add failing compiler tests** for accepted candidates, provenance/authorization/snapshot mismatches, duplicate/conflicting IDs, out-of-scope relationships/paths, missing lineage, invalid score, and existing eligibility skips; assert reason codes `AUTHORIZATION_DENIED`, `SNAPSHOT_MISMATCH`, `NO_PROVENANCE`, `OUT_OF_SCOPE`, `INVALID_LINEAGE`, `INVALID_EVIDENCE`, `DUPLICATE_CANDIDATE`, and `INVALID_RETRIEVAL_SCORE` where those existing branches apply.
- [x] **Step 2: Add a regression assertion** that candidate audit output does not change package IDs, approved package contents, omissions, disposition, or stage allocation for the same input.
- [x] **Step 3: Run the focused compiler tests** and verify candidates currently skipped without omission details are not fully represented.
- [x] **Step 4: Add ordered candidate decision records at each existing compiler branch** without changing branch predicates; keep approved candidate IDs available for later stage mapping.
- [x] **Step 5: Emit application-coverage events** separating applications observed in the snapshot/projection, returned by each provider, approved by the compiler, and present in each prompt stage. Use `unknown` when current data does not prove a cause; use the same schema for every source application.
- [x] **Step 6: Run focused compiler and service tests** and verify all entering candidates have one actual decision and application coverage does not infer absence.

### Task 5: Tracing Prompt Assembly and Model Calls

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Azure/Models/AzureOpenAiModelGateway.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/azure-openai-client.ts`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/ModelGatewayTests.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/azure-openai-client.test.ts`

**Interfaces:**
- Consumes: compiler decisions and per-stage candidate assignments from Task 4.
- Produces exact outgoing model messages, per-stage counts for facts, graph relationships/claims, evidence passages, application digests, and citations, UTF-8 prompt size, estimated tokens, actual provider token usage when returned, model/deployment, elapsed duration, output text, and observable attempts/errors.
- `ContextPackageSummary` fields are `facts`, `graphRelationships`, `impactPaths`, `evidencePassages`, `applicationDigests`, `applicationsRepresented`, and `citations`; derive each from the exact approved stage package, not all retrieval results.
- `CandidateModelDelivery` fields are `candidateId`, `assignedStage`, `rendered`, nullable `reachedModel`, `reasonCode`, and `reason`. `reachedModel=true` requires an actual provider response; `false` means the request was not sent; `null` means transport failure leaves delivery unknown.

- [x] **Step 1: Add failing tests** asserting per-stage context package counts and candidate assignments are computed from the exact stage package, not the whole investigation.
- [x] **Step 2: Add failing tests** comparing full-mode logged runtime messages byte-for-byte with the `ModelRequest.Messages` passed to `IModelGateway.GenerateAsync`; assert `rendered` and `reachedModel` false/true/unknown behavior for pre-call failure, provider response, and ambiguous transport failure.
- [x] **Step 3: Add failing gateway tests in `Generation/ModelGatewayTests.cs`** for actual response text, provider-reported usage, elapsed time, and safe provider error details.
- [x] **Step 4: Add failing frontend tests** verifying each explicit Azure retry attempt, prompt summary, targeted full payload, provider response, usage, and latency are recorded without API keys.
- [x] **Step 5: Run focused prompt/gateway/frontend tests** and verify token estimates are not confused with provider-reported token counts.
- [x] **Step 6: Instrument prompt assembly and model boundaries**; log summary counts before every `PromptAssembler` call and exact messages only in full-payload mode. Record actual response before parsing, label estimates/provider values distinctly, and report only observable retry attempts.
- [x] **Step 7: Run focused tests** and verify every model invocation's summary, stage, delivery status, response/error, usage, and elapsed time match the actual call.

### Task 6: Tracing Per-Assertion Validation, Citations, and Final Delivery

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/answer-validator.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/answer-validator.test.ts`

**Interfaces:**
- Adds per-assertion validation outcomes to `ValidationResult` with assertion type/ID, supported status, evidence IDs, citation/source IDs, and validation issue codes.
- Consumes the actual parser and validator outputs; produces validation, citation-resolution, final answer persistence, and final response events.
- Produces a final lineage summary from accepted assertions only: `factsUsed`, `relationshipsUsed`, `impactPathsUsed`, `evidencePassagesUsed`, `applicationDigestsUsed`, `citationsResolved`, and `validationIssueCount`; include `validationWarnings` only if the implementation exposes actual warning-level results.

- [x] **Step 1: Add failing tests** for supported and unsupported graph, fact, application-context, and source-evidence assertions, including multiple issues and partially rejected answers.
- [x] **Step 2: Add citation-resolution tests** proving only actual mapped citations are recorded and the final Copilot answer equals the persisted/returned answer.
- [x] **Step 3: Run focused validator and answer-service tests** and verify current overall validation results lack per-assertion decision records.
- [x] **Step 4: Produce per-assertion validation details from the existing validator branches**; preserve the existing overall disposition and validation issues.
- [x] **Step 5: Instrument citation mapping and persistence/return boundaries** in both runtime and frontend paths, including parse/schema failures.
- [x] **Step 6: Run focused tests** and verify each generated assertion and citation has an actual outcome without changing acceptance behavior.

### Task 7: Verifying Full-Trace Behavior and Test Configuration

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/CopilotExecutionTraceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilot-execution-trace.test.ts`
- Modify: `docs/superpowers/specs/2026-11-26-copilot-request-tracing-design.md` only if implementation constraints materially change

- [x] **Step 1: Add one runtime-path trace integration test** with graph, fact, application-participation, and source-passage candidates; assert event order from request ingress to final answer and that exact included candidates appear in the model-stage events.
- [x] **Step 2: Add legacy-path coverage** for context building, prompt assembly, validation, citation resolution, and persistence with a model fake; verify actual Azure attempts separately at the transport boundary with a fake HTTP provider, without presenting the execution fake as a real provider attempt.
- [x] **Step 3: Add a privacy/configuration regression test** proving routine summary events do not include full investigation/prompt/document bodies, targeted full payload mode includes the selected request's payloads, secrets never appear, and Production cannot enable raw traces.
- [x] **Step 4: Run focused .NET tests**:

```powershell
dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --no-restore --filter "FullyQualifiedName~CopilotExecutionTraceTests|FullyQualifiedName~ContextCompilerTests|FullyQualifiedName~ImpactAnswerServiceTests|FullyQualifiedName~AnswerValidatorTests|FullyQualifiedName~ModelGatewayTests|FullyQualifiedName~EngineeringImpactControllerTraceTests"
```

Expected: all selected tests pass.

- [x] **Step 5: Run focused frontend tests** from `OrchestrationPlatform\frontend`:

```powershell
npm test -- features\lattice-next\copilot\tests app\api\lattice\investigations\[investigationId]\copilot\route.test.ts
```

Expected: all selected Vitest tests pass.

- [x] **Step 6: Run the complete relevant .NET and Copilot suites**, focused lint for changed TypeScript files, and `git diff --check`; report live-provider evaluation separately because test fakes are not live traces.

```powershell
dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --no-restore
Push-Location OrchestrationPlatform\frontend
npm test -- features\lattice-next\copilot\tests
npm run lint -- features\lattice-next\copilot app\api\lattice\investigations\[investigationId]\copilot
Pop-Location
git diff --check
```

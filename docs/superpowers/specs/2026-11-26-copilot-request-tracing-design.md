# Copilot Request Tracing Design

## Intent

Add a truthful, end-to-end engineering trace for manual Copilot validation. Given a request or trace ID, an engineer must be able to follow the request from the Next.js Send endpoint through routing, interpretation, retrieval, context compilation, prompt/model calls, validation, citation resolution, persistence, and the returned answer. Every event shows the route source that handled the request.

The trace is diagnostic output in the existing application logs, not a dashboard, metric, or new durable trace store. Routine events use compact summaries, candidate references, IDs, and counts. An individual request opts into full payload details with `X-Copilot-Diagnostic-Detail: full`; the server also requires the explicit non-production `FullPayloadTraceEnabled` setting. The default is summary-only, and payloads are not dumped for other requests or events.

## Goals

- Correlate frontend and .NET events under one generated request ID and W3C trace ID, propagating the trace context to PLM Brain.
- Include a stable `RouteSource` on every event: `LegacyFrontend`, `UnifiedRuntime`, `ImpactRuntime`, `FactRuntime`, `DocumentRuntime`, or `Unknown`.
- Record stages that actually ran, their real inputs and outputs, elapsed time, outcomes, additions/removals, diagnostics, and reasons.
- Emit an auditable decision for every candidate presented to `ContextCompiler`, including candidate type, source application, authority, freshness, citation/evidence IDs, provenance, decision, and a stable, specific reason code tied to the actual code path.
- Distinguish application presence in the investigation from retrieval, compiler approval, prompt-stage inclusion, and absence of observed source data.
- Before each prompt assembly, record approved context counts for facts, graph relationships, impact paths, evidence passages, application digests, and represented applications.
- For each approved candidate, record stage assignment, whether it was rendered, and whether a provider response proves it reached the model; report delivery as unknown when transport failure makes receipt unknowable.
- Record the actual model messages at the boundary, response text, usage, latency, and only retries/attempts observable at that boundary when full payload detail is enabled.
- Record each generated assertion's validation outcome and citation/evidence resolution, then the final persisted and returned answer.
- Emit a final answer-lineage summary counted from accepted assertions and resolved citations.
- Keep all trace categories application-agnostic; Configit must not receive special selection, ranking, or logging behavior.
- Preserve existing authorization, retrieval, compilation, validation, and response behavior. Tracing must observe decisions, not change them.

## Non-goals

- Changing routing, question interpretation, retrieval plans, authorization, candidate selection, context budgets, stale-evidence behavior, answer policy, or citation rules.
- Logging credentials, API keys, bearer tokens, signed authorization tickets, cookies, or raw HTTP authorization headers.
- Claiming an application is absent, a provider succeeded, or an evidence item reached the model when the actual stage data does not establish that fact.
- Adding a dashboard, metrics aggregation, permanent trace database, or live-provider evaluation.
- Inferring retry counts hidden inside a provider SDK. Log an attempt only when the application or its transport exposes that attempt.

## Approaches

1. **Redacted OpenTelemetry activities only.** Reuses the existing .NET activities and privacy processor, but that processor intentionally removes question, prompt, answer, and evidence payloads. It cannot answer whether exact source text reached the model.
2. **Structured trace events in existing app logs — selected.** Emits JSON-shaped summary events from both Next.js and .NET, correlated by request/trace ID. It uses existing log collection and requires no new persistence system. Full payload events require an explicit non-production debug setting and are emitted only for targeted debugging; credential material is never logged. Existing telemetry remains useful for durations and aggregate metrics but is not the request trace.
3. **Protected per-request trace store.** Provides stronger access and retention controls for full payloads but introduces storage, authorization, retention jobs, and a trace-reading surface that are not required for the current manual test phase.

The selected approach matches the user's need for high-signal manual debugging while avoiding a new storage system and unbounded log payloads. Application logs inherit the configured sink's access, retention, and size limits; those operational properties must be verified for the test deployment.

## Architecture and behavior

### Correlation and lifecycle

The Copilot route creates a server-generated request ID and W3C trace context at ingress. It logs the actual route, snapshot/thread checks, idempotent replay, and the selected runtime, legacy, or blocked path. `RouteSource` is `LegacyFrontend` for the existing frontend model path and `UnifiedRuntime` for the shared backend orchestrator. `ImpactRuntime`, `FactRuntime`, or `DocumentRuntime` are used only when such a distinct handler is actually selected; retrieval subcomponents inside the unified orchestrator are recorded as executed components, not misrepresented as separately selected routes. `Unknown` is used before routing is known or when the actual route cannot be established.

The runtime HTTP request carries the request ID and `traceparent`; `EngineeringImpactController` adopts these validated correlation values rather than creating a disconnected trace. Existing `PlmBrainClient` propagation continues the same trace to PLM Brain.

The request ID uses `X-Copilot-Request-Id`; it is generated server-side and is distinct from the user-supplied idempotency/turn ID. The Next.js ingress creates a new W3C root rather than trusting a client-supplied trace parent. If the internal request ID is malformed or its trace context is absent/invalid, .NET records the observed mismatch and continues under its generated local correlation; it does not fail an otherwise valid answer solely because diagnostics correlation is malformed.

Frontend and .NET emit the same versioned event envelope with timestamp, stage, event type, `RouteSource`, payload detail (`summary` or `full`), request ID, trace ID, investigation ID, and snapshot revision whenever known. The route opts a single request into full payloads using `X-Copilot-Diagnostic-Detail: full`; the frontend configuration and .NET configuration must both allow full payload tracing, and Production always rejects it. Turn/thread IDs remain distinct from trace IDs. A stage that does not run is represented only when the actual route or planner decision establishes why it did not run; it is not presented as a failed retrieval.

Both the unified runtime path and the legacy frontend answer path are traced, including their different interpretation, retrieval, prompt, model, validation, and citation behavior. This ensures the routing decision itself is observable and prevents the trace from assuming every request used the runtime.

### Stage events

Emit start and completion/error events at the actual component boundaries:

1. Send endpoint and request validation
2. Snapshot/thread/idempotency handling
3. Runtime-vs-legacy routing
4. Conversation and question interpretation
5. Scope/retrieval planning
6. PLM Brain graph/entity retrieval
7. Fact retrieval
8. Application-context/digest retrieval
9. Snapshot source-evidence/document retrieval
10. Context compilation and approval
11. Prompt assembly
12. Model invocation, response, and observable attempts
13. Answer parsing and validation
14. Citation resolution and final response mapping
15. Thread persistence and response return

Routine events record structured input/output summaries, candidate references, actual IDs/counts, elapsed time, correlations, diagnostics, and added/removed IDs. Full input/output payloads are emitted only for the explicitly targeted non-production debug trace. A provider failure records the observed provider, safe error code/type/status, and available diagnostics; it does not turn a failed or unavailable call into a success-shaped empty result. Exception payloads and HTTP headers are not dumped indiscriminately.

### Context compiler audit

`ContextCompiler` remains the only context-approval boundary. Extend its compilation result with ordered, typed candidate decisions generated from the same branches that currently accept, omit, or skip candidates. The audit includes graph claims/relationships, exact facts, application participation/digests, and source passages. Each decision carries the candidate's actual lineage and a stable reason code plus human-readable detail derived from the condition that made the decision. Codes include `AUTHORIZATION_DENIED`, `SNAPSHOT_MISMATCH`, `NO_PROVENANCE`, `OUT_OF_SCOPE`, `INVALID_LINEAGE`, `INVALID_EVIDENCE`, `PROVIDER_FAILURE`, `STALE_FOR_CURRENT_QUERY`, `NOT_RETURNED_BY_PROVIDER`, and `COMPILER_REJECTION` only when the specific existing condition maps to that code. `COMPILER_REJECTION` must include the exact branch reason. Do not invent a rejection or use a generic “filtered” result.

Candidates skipped by existing scope/eligibility conditions must be represented in the audit without changing the existing decision. No rejection rule is added to improve trace completeness. Accepted decisions identify their compiled candidate and later stage assignment. Rejected decisions retain their actual reason and do not imply they were sent to the model.

The answer service emits each decision as a correlated event after compilation. Before assembling each model request, it records a context-package summary containing fact, graph-relationship, impact-path, evidence-passage, application-digest, and application counts derived from that exact approved stage package. It also records the exact candidate IDs and types assigned to every approved stage package.

For each approved candidate, trace stage assignment, rendering in the exact assembled request, and model delivery. `ReachedModel=true` only when the provider returns a response to that request; `false` when the request was not sent, with the observed reason; and `null` when the request may have been delivered but transport failure leaves receipt unknown. Do not label an invocation as model receipt merely because local assembly succeeded.

### Application coverage

Record source applications actually observed in the investigation snapshot/projection separately from applications returned by each retrieval, approved by the compiler, and included in a prompt stage. Use source application fields and projection/retrieval diagnostics already present in returned data. For an application with no candidate in a stage, report only the evidence-supported cause: not observed in snapshot data, not requested by the planner, provider unavailable/failed, no records returned, or no approved candidate after a named compiler decision. When the evidence does not establish the cause, report it as unknown rather than infer absence.

### Prompt, model, and validation

At the final model boundary, routine events record message roles, UTF-8 size, estimated input token count, model configuration/deployment, stage number/count, and counts/references for facts, relationships, evidence, digests, and citation IDs. The exact message contents are available as expandable payload events only for the targeted full-payload trace. Label token estimates as estimates. Record provider-reported prompt/completion tokens only when the response supplies them.

Record the actual raw model response before parsing, its schema/parser result, usage, measured latency, provider errors, and attempts/retries observable in the concrete adapter. The current TypeScript Azure client has explicit retry attempts; the .NET Azure gateway currently exposes one application-level invocation and token usage but does not itself count any SDK-internal retries. Do not log a false `retryCount: 0` where retries are not observable.

For validation, record every generated claim/fact/application-context/source-evidence assertion, cited evidence/source IDs, per-assertion supported or rejected outcome, matching validation issues, and final overall disposition. Record final citation/source resolution and the exact answer object persisted and returned as a summary; full answer content is available only under targeted payload tracing.

At request completion, emit a final lineage summary with counts of accepted facts, relationships, impact paths, evidence passages, application digests, resolved citations, and actual validation warnings/issues. Counts must derive from the assertions accepted into the final answer and its resolved citations, not from all retrieved candidates.

### Logging and sensitive data

Use the existing application log sinks with structured event fields. Summary tracing is used by default. Full payload tracing requires an explicit targeted debug setting and is permitted only in Development/Testing; reject enabling it in Production. Keep the existing Activity privacy processor in place; payload events use the structured diagnostic logger rather than bypassing that processor with activity tags.

The targeted full trace may contain confidential engineering/user content in Testing, as explicitly requested. Routine events must not dump entire investigations, prompts, snapshots, or documents. They must not include access tokens, API keys, signed authorization-decision tokens, cookies, or authorization headers. Do not serialize full exception objects, as their internals may contain secrets. Raw payload tracing is not enabled in the production configuration; a production rollout requires a separate privacy/retention review and disabling this testing mode.

Tracing is best-effort diagnostics and must not change answer behavior or turn a successful provider operation into a failed request. Trace serialization/sink errors are reported through the standard safe application error channel without payload contents; the request continues. The trace must not claim completeness when a trace event could not be written.

## Existing implementation points

- `OrchestrationPlatform/frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`: Send endpoint and response boundary.
- `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`: frontend execution, routing, legacy path, persistence, and runtime call.
- `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`: runtime HTTP request and correlation propagation.
- `OrchestrationPlatform/frontend/features/lattice-next/copilot/azure-openai-client.ts`: legacy model attempts, usage, and provider responses.
- `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`: .NET ingress and request context.
- `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`: interpretation, planning, retrieval, compilation, prompt/model stages, and validation.
- `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`: authoritative candidate approval and omission decisions.
- `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`: exact stage messages and rendering.
- `OrchestrationPlatform/Lattice.AI.Runtime.Azure/Models/AzureOpenAiModelGateway.cs`: runtime model boundary and provider response.
- `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`: claim and citation validation.
- `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs` and `AiRuntimeTelemetryPrivacyProcessor.cs`: current aggregate telemetry and payload privacy behavior; keep separate from full diagnostic events.

## Validation expectations

- Deterministic tests capture structured events for runtime and legacy paths and prove that `RouteSource` and correlation IDs remain the same from ingress through the final result and PLM Brain request.
- Compiler tests assert one actual decision record for each entering candidate, including accepted, rejected, and currently skipped branches, with stable reason codes and no change in compiled package contents/disposition.
- Prompt/model tests assert pre-assembly package summaries, stage assignments, rendered/reached-model status, and that payload events match the exact messages passed to the gateway when targeted full tracing is enabled.
- Validator/citation tests assert per-assertion outcomes, exact evidence/source IDs, citation resolution, final lineage counts, and final persisted response.
- Payload-size tests prove routine events use bounded summaries/references rather than entire investigation/prompt/document bodies, while targeted full tracing makes the corresponding payload inspectable.
- Privacy tests prove credentials, authorization headers, signed tickets, and API keys are absent even when payload tracing is enabled; tests also prove full payloads are absent unless the targeted mode is enabled.
- Frontend tests verify request/trace propagation, runtime-vs-legacy route events, and final answer mapping. Existing relevant suites run after the focused tests.
- No live provider success is simulated as an end-to-end trace; offline fakes are clearly identified as test data.

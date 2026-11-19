# Lattice Phase 1 Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement one task at a time in order; each task ends with focused verification and a commit.

**Goal:** Close the existing .NET runtime as a narrowly scoped engineering-impact capability while preserving fail-closed authorization and clearly distinguishing demonstrated behavior from operational or semantic claims.

**Architecture:** Keep PLM Brain authoritative and retain the existing .NET runtime pipeline. Work in small sequential subtasks: establish evidence, make missing authorization readiness explicit, harden the narrow intent/scope and deterministic validation/budget/telemetry contracts, expand offline evaluation, then add a disabled product-routing boundary. Live execution and product comparison remain environment-gated; never simulate an authorization provider or claim semantic quality from fixtures.

**Tech Stack:** Existing .NET 10 / ASP.NET Core projects, xUnit and `WebApplicationFactory`; existing TypeScript/Next.js frontend and Vitest; existing OpenTelemetry abstractions and synthetic evaluation runner. No new framework or package is planned.

**Spec:** `docs/superpowers/specs/2026-11-18-lattice-phase-1-closure-design.md`

## Global Constraints

- Preserve PLM Brain as authoritative for entities, relationships, impact paths/chains, and evidence.
- Do not repeat the original Phase 1 foundation work.
- Do not invent an authorization provider or weaken fail-closed behavior.
- Do not add document RAG, embeddings, vector storage, MCP, agent frameworks, broad question answering, model routing, or caching.
- Do not claim factual/semantic verification from schema/reference checks or canned outputs.
- Preserve existing unrelated dirty worktree changes; in particular, inspect and merge around the pre-existing frontend Copilot/PLM Brain edits and stage only closure-owned files.
- The runtime request must remain scoped to the supplied active investigation; do not query across investigations.
- Never send client data to a live model without approved authorization, identity, network, deployment, region, and data-processing prerequisites.
- Commit each independently reviewable subtask separately.
- If an external dependency blocks a slice, preserve fail-closed behavior, record the exact blocker, and continue safe independent slices.

## Review Focus

- **Missing authorization provider versus genuine denial:** missing configuration/outage must return sanitized unavailable/readiness status; actual policy denial remains 403 and must make zero PLM/model calls. Test in Tasks 2–3.
- **False-positive question routing and ambiguous identifiers:** only supported engineering-impact phrasings with one explicit identifier proceed; ambiguity clarifies and unrelated questions remain unsupported. Test in Tasks 6–7 and Task 16.
- **Cross-claim or omitted evidence references:** an answer cannot cite evidence/source IDs attached to another claim or a claim omitted from the compiled package. Test in Tasks 10–11.
- **Budget boundaries and prompt overhead:** multibyte text, prompt sections, output reservation, and safety margin must not knowingly exceed the configured input allowance; omitted evidence cannot support an emitted claim. Test in Task 12.
- **Identifier/payload leakage through application and auto-instrumented telemetry:** default exports omit linkable IDs, question/prompt/answer/evidence, tokens, ticket claims, and deep links. Test in Tasks 13–14.
- **Offline-evaluation overclaim:** evaluation reports must state reference checks were evaluated while semantic and live-model quality were not; failing required expectations must return nonzero. Test in Tasks 15–16.

---

## File Ownership and Boundaries

| Area | Files and responsibility |
|---|---|
| Baseline and rollout evidence | `OrchestrationPlatform/docs/ai-runtime/phase-1-closure-baseline.md` records only observed repository state and commands. `authorization-provider-rollout-gate.md` states the absent provider contract and prerequisites. |
| Authorization behavior/readiness | `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs` maps missing configuration/outage to sanitized 503 while preserving 403 for policy denial. `OrchestrationPlatform/Orchestration.API/Program.cs` adds the minimal readiness endpoint because no health convention exists. `Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs` verifies HTTP and zero-call behavior. |
| Authorization orchestration | `OrchestrationPlatform/Lattice.AI.Runtime/Authorization/AuthorizationContextProvider.cs` removes unused memoization only after caller/call-count evidence; request-level reuse remains in `ImpactAnswerService`. |
| Question and scope policy | `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/QuestionInterpreter.cs`, `ScopePlanning/ScopePlanner.cs`, contract diagnostics, and new focused test files define only the narrow supported intent and bounded scope. |
| Mechanical validation | `OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs`, `Validation/AnswerValidator.cs`, `Contracts/Answers/AnswerContracts.cs`, prompt asset(s), and focused parser/validator/API tests enforce structured references and expose `semanticSupportStatus=not-evaluated`. |
| Budget accounting | `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextBudget.cs`, `ContextCompiler.cs`, `Lattice.AI.Runtime/Prompts/PromptAssembler.cs`, `Lattice.AI.Runtime.Contracts/Generation/ModelContracts.cs` (`ModelConfiguration`), `Lattice.AI.Runtime.Azure/Models/AiRuntimeOptions.cs`, API settings/docs, and context/prompt/model tests account for estimated input, prompt overhead, output reservation, and margin. |
| Telemetry privacy/quality | New `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetryOptions.cs`, telemetry registration, `AiRuntimeTelemetry.cs`, runtime telemetry contract, and telemetry tests configure linkable identifiers off and add non-semantic quality measurements. |
| Offline evaluation | `OrchestrationPlatform/evals/engineering-impact/v1/{manifest.json,cases.jsonl,fixtures/requirement-r123.json}`, `Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`, report and CLI files, and `Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs` extend synthetic regression coverage and clearly label what is not measured. |
| Product routing | A focused TypeScript routing helper plus `features/lattice-next/copilot/execute-copilot-turn.ts` and tests add a disabled-by-default boundary. Do not overwrite pre-existing changes in these files; reconcile first. The route must not fall back after denial or enabled-but-unavailable status. |
| Completion evidence | `OrchestrationPlatform/docs/ai-runtime/phase-1-live-validation.md` records live results only after approved execution. `phase-1-impact-comparison.md` and `phase-1-closure-report.md` report measured results or exact blockers; no inferred success. |

---

### Task 1: Record the verified repository baseline

**Files:**
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-closure-baseline.md`

**Interfaces:**
- Consumes: baseline command results recorded in the approved design; starting commit `98186f0672a44800a19c88936bdb2d37127c221d`.
- Produces: a dated evidence record of runtime test 80/80, evaluation 12/12 with 100% path/link coverage, API build success with NU1507 warnings, frontend evidence/auth tests 13/13, and the known API.Tests missing-type compile failures.

- [ ] **Step 1: Write the baseline report**

Record HEAD, exact commands/results, current `UnavailableResourceAuthorizationDecisionProvider` registration, the current Copilot path through TypeScript `executeCopilotTurn`, and the fact that it does not call `POST api/engineering/impact-answer`. Record the external authorization/identity/Azure/seed-data prerequisites. Distinguish the existing API.Tests compile failures from runtime baseline results.

- [ ] **Step 2: Verify evidence and scope**

Run: `git rev-parse HEAD`, `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`, `dotnet run --project Lattice.AI.Runtime.Evaluation/Lattice.AI.Runtime.Evaluation.csproj -- --dataset evals/engineering-impact/v1`, `dotnet build Orchestration.API/Orchestration.API.csproj`, and from `frontend`, `npm test -- features/lattice-next/tests/impact-evidence-service.test.ts features/lattice-next/tests/impact-evidence-authorization.test.ts`.

Expected: results match the report; no product code changes.

- [ ] **Step 3: Commit the baseline**

```text
git add OrchestrationPlatform/docs/ai-runtime/phase-1-closure-baseline.md
git commit -m "docs: record Phase 1 closure baseline"
```

### Task 2: Distinguish missing authorization configuration from policy denial

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`
- Reuse: `Lattice.AI.Runtime.Contracts/Authorization/AuthorizationContextResult.cs`

**Interfaces:**
- Consumes: `AuthorizationContextProvider.CreateAsync(...)` returns `AuthorizationContextResult.Denied(AuthorizationDenialCode.MissingProviderConfiguration)` when no decision is available.
- Produces: the endpoint returns sanitized 503 `ProblemDetails` with JSON extension `code=AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED` for missing provider configuration, 503 with `code=AI_RUNTIME_AUTHORIZATION_PROVIDER_UNAVAILABLE` for decision-provider infrastructure failure, and 403 for genuine denial. The missing/unavailable paths do not call entity resolution, PLM evidence, or model.

- [ ] **Step 1: Add failing API tests**

Add tests named `PostImpactAnswer_ReturnsUnavailableWhenAuthorizationProviderIsNotConfigured`, `PostImpactAnswer_ReturnsUnavailableWhenAuthorizationProviderThrows`, and `PostImpactAnswer_PolicyDenialRemainsForbidden`. Assert the response status and stable sanitized `ProblemDetails.Extensions["code"]`, and assert entity resolver, evidence source, and model gateway call counts are zero for missing/unavailable/denied results. Extend the test factory with a `useDefaultDecisionProvider` option so the missing-provider case exercises production default DI. Replace the factory’s uncounted `TestModelGateway` with a recording fake.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ImpactAnswerAuthorizationTests`

Expected: new status/code assertions fail against the current generic 403 mapping.

- [ ] **Step 3: Implement only the status distinction**

In the controller, map only `MissingProviderConfiguration` to the stable not-configured response; keep other denied results as 403. Map existing sanitized authorization exception handling to the provider-unavailable code. Do not include exception text, claims, IDs, or tokens in the response.

- [ ] **Step 4: Verify the API authorization tests**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ImpactAnswerAuthorizationTests`

Expected: all focused tests pass and denial/unavailability remains before PLM/model calls.

- [ ] **Step 5: Commit**

```text
git add OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs
git commit -m "fix: distinguish unavailable authorization from denial"
```

### Task 3: Expose minimal authorization readiness

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/Program.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`
- Create: `OrchestrationPlatform/docs/ai-runtime/authorization-provider-rollout-gate.md`

**Interfaces:**
- Consumes: the default DI registration of `IResourceAuthorizationDecisionProvider` as `UnavailableResourceAuthorizationDecisionProvider`.
- Produces: unauthenticated `GET /health/ready`, returning 503 with JSON `code=AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED` only when the default unavailable provider is active; a configured provider returns ready. This endpoint reports configuration readiness, not proof of an external policy service’s health.

- [ ] **Step 1: Add readiness tests**

Add tests `Readiness_ReturnsNotReadyWhenDefaultProviderIsRegistered` and `Readiness_ReturnsReadyWhenProviderIsReplaced`. Assert exact status/JSON code and that the endpoint reveals no tenant, subject, policy, key, or token details. Ensure the default-provider case leaves the production registration in place; only the ready test replaces it with a named test fake.

- [ ] **Step 2: Implement the minimal endpoint**

Map `/health/ready` from `Program.cs` using the already-registered provider. Do not add a health-check package or general health framework. Return only ready/not-ready and the stable code.

- [ ] **Step 3: Document the provider rollout contract**

Create `authorization-provider-rollout-gate.md` stating the provider must use validated `ClaimsPrincipal`, derive tenant/subject server-side, authorize the requested investigation, issue only the two required grants, include policy version/decision ID/expiry, and distinguish denial from infrastructure failure. State explicitly that no provider exists in the current repository and the feature is not operational.

- [ ] **Step 4: Verify endpoint and API build**

Run focused `ImpactAnswerAuthorizationTests`, then `dotnet build Orchestration.API/Orchestration.API.csproj`.

Expected: readiness statuses match DI registrations; API build succeeds.

- [ ] **Step 5: Commit**

```text
git add OrchestrationPlatform/Orchestration.API/Program.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs OrchestrationPlatform/docs/ai-runtime/authorization-provider-rollout-gate.md
git commit -m "feat: expose AI runtime authorization readiness"
```

### Task 4: Remove the unused authorization decision cache

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Authorization/AuthorizationContextProvider.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Authorization/AuthorizationContextProviderTests.cs`

**Interfaces:**
- Consumes: one controller authorization evaluation per answer request; `ImpactAnswerService` receives one resulting `AuthorizationContext` and passes it to both PLM operations.
- Produces: `AuthorizationContextProvider.CreateAsync(...)` evaluates one server-side decision for each call and retains no cross-call dictionary/cache state.

- [ ] **Step 1: Prove actual caller behavior**

Add/extend API success-path assertions showing exactly one decision-provider evaluation per HTTP answer request and the same resulting authorization context instance passed to entity resolution and evidence retrieval.

- [ ] **Step 2: Remove memoization**

Delete the `ConcurrentDictionary`, `Lazy<Task<...>>`, and cache-key record. Keep identity validation, grant validation, expiry validation, token issuance, and cancellation behavior unchanged.

- [ ] **Step 3: Verify authorization and runtime suites**

Run focused API authorization and authorization unit tests, then `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`.

Expected: runtime tests pass and one answer request performs one decision evaluation.

- [ ] **Step 4: Commit**

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/Authorization/AuthorizationContextProvider.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Authorization/AuthorizationContextProviderTests.cs
git commit -m "refactor: remove unused authorization decision cache"
```

### Task 5: Define narrow question-interpreter acceptance tests

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding/QuestionInterpreterTests.cs`
- Read-only under test: `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/QuestionInterpreter.cs`
- Read-only under test: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/QuestionInterpretation.cs`

**Interfaces:**
- Consumes: `QuestionInterpreter.Interpret(ImpactAnswerRequest, RuntimeRequestContext)`.
- Produces: an explicit test matrix for 5 supported phrasings and 7 clarify/unsupported cases in the approved closure design.

- [ ] **Step 1: Add table-driven behavior tests**

Accepted questions must resolve exactly `R-123` and retain the original input:
`What is impacted if Requirement R-123 changes?`;
`If R-123 changes, what could be affected?`;
`Show the downstream impact of R-123.`;
`Which engineering items depend on R-123?`;
`Assess the impact of changing requirement R-123.`

Expected outcomes for the listed cases are:

| Question | Expected |
|---|---|
| `What changes?` | Unsupported |
| `What is impacted?` | Clarify: explicit subject required |
| `Tell me about R-123.` | Unsupported |
| `Summarize this investigation.` | Unsupported |
| `What applications are connected?` | Unsupported |
| `Impact R-123 or R-456.` | Clarify: multiple possible subjects; select neither |
| `What happens if the steering requirement changes?` | Clarify: explicit subject required |

- [ ] **Step 2: Run the focused tests**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~QuestionInterpreterTests`

Expected: test cases that expose keyword false positives and missing dependent phrasing fail before implementation.

- [ ] **Step 3: Commit the acceptance-test subtask**

```text
git add OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding/QuestionInterpreterTests.cs
git commit -m "test: specify narrow impact question detection"
```

### Task 6: Implement narrow Phase 1 question detection

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/QuestionInterpreter.cs`
- Modify if required: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/QuestionInterpretation.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding/QuestionInterpreterTests.cs`

**Interfaces:**
- Consumes: the test matrix and the existing `ImpactQuestionType`/`QuestionInterpretation` contract.
- Produces: behavior described as “narrow Phase 1 engineering-impact question interpretation”; no general question understanding or inferred subject.

- [ ] **Step 1: Implement the narrow supported-intent decision**

Recognize the specified impact/dependency forms, require exactly one explicit subject ID, preserve the original question, return clarification when the supported impact intent lacks or has multiple subject IDs, and classify unrelated questions as unsupported. Do not count the generic word “changes” alone as an impact intent.

- [ ] **Step 2: Update truthful descriptions**

Add XML summaries “Narrow Phase 1 engineering-impact question interpretation” and “Phase 1 bounded impact scope policy”; update the setup documentation and telemetry stage description only where current labels imply general AI question understanding or retrieval planning.

- [ ] **Step 3: Verify focused and full runtime tests**

Run `QuestionInterpreterTests`, then `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`.

Expected: every accepted/rejected case matches its table; the runtime suite passes.

- [ ] **Step 4: Commit**

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/QuestionInterpreter.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/QuestionInterpretation.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding/QuestionInterpreterTests.cs
git commit -m "fix: narrow engineering impact question detection"
```

### Task 7: Specify bounded Phase 1 scope policy

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ScopePlanning/ScopePlannerTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ScopePlanningResult.cs` only if a contract change is needed

**Interfaces:**
- Consumes: `ScopePlanner.Plan(QuestionInterpretation, ResolvedEntity, AuthorizationScope, RuntimeRequestContext)`.
- Produces: Phase 1 policy: `MaxHops=3`, empty `RelationshipTypes`, empty `SourceSystems`, `AsOf=null`; diagnostics explicitly state these filters are not dynamically inferred and the scope remains bound by the endpoint’s active investigation, canonical subject, authorization ticket, and provenance checks.

- [ ] **Step 1: Add scope policy tests**

Assert exact default values (`MaxHops=3`, empty relationship/source filters, `AsOf=null`), that the planner runs only after a resolved subject and successful authorization, clarification for unsupported/ambiguous interpretation, and diagnostics naming the three-hop bounded policy. Assert no source or relationship type is guessed. The endpoint and compiler remain responsible for binding to the active investigation, canonical subject, decision, and provenance.

- [ ] **Step 2: Implement explicit scope diagnostics and documentation**

Keep the supported PLM maximum of three hops. Document empty filters as “no additional narrowing” rather than authorization to access arbitrary sources or investigations.

- [ ] **Step 3: Verify and commit**

Run `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ScopePlannerTests`, then commit the planner, focused test, and any directly modified contract:

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/ScopePlanning/ScopePlannerTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ScopePlanningResult.cs
git commit -m "fix: make impact scope policy explicit"
```

### Task 8: Reject unsupported duplicate and empty references

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/AnswerCandidateParserTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`

**Interfaces:**
- Consumes: `AnswerCandidateParser.Parse(string)` and `AnswerValidator.Validate(...)`.
- Produces: duplicate evidence/source references reject consistently; empty impact explanations reject; each impact continues to identify exactly one package claim and only that claim’s evidence.

- [ ] **Step 1: Add failing parser/validator tests**

Cover duplicate `evidenceIds`, duplicate `sourceIds`, empty explanation, one claim with another claim’s evidence, valid evidence paired with an unrelated source, and a model output referencing a claim removed by context budgeting.

- [ ] **Step 2: Implement deterministic rejection**

Reject duplicate reference arrays in parsing; reject any remaining cross-claim evidence/source mismatch in validation. Do not rely on LLM judgments.

- [ ] **Step 3: Verify focused tests and commit**

Run parser and validator test filters; commit only these parser/validator source and test files:

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/AnswerCandidateParserTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs
git commit -m "fix: reject inconsistent answer evidence references"
```

### Task 9: Reject unsupported structured identifiers and model warnings

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/engineering-impact/v1/impact-task.md`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/AnswerCandidateParserTests.cs`

**Interfaces:**
- Consumes: package claim `EntityIds`/`RelationshipIds`, answer summary/explanations, and current `warnings: string[]`.
- Produces: validation rejects recognizable engineering identifier tokens absent from the referenced package claim(s); model-provided free-text warnings are not accepted as a channel for unsupported assertions. Warnings must be empty; prompt says to return an empty array, with omissions represented by runtime context/metadata rather than invented model warnings.

- [ ] **Step 1: Add failing identifier/warning tests**

Assert that an explanation containing absent `COMPONENT-999`/`REL-999`, a summary containing absent `REQ-999`, and a non-empty unsupported warning are rejected, while package-supported IDs pass. Include an identifier belonging to a different claim and assert it is not permitted for the current claim.

- [ ] **Step 2: Implement mechanical identifier and warning rules**

Use a bounded identifier-token recognizer against the existing claim/package IDs; do not claim sentence entailment. Reject non-empty model warning strings; update the prompt’s output instruction accordingly.

- [ ] **Step 3: Verify, then commit**

Run parser, validator, and prompt tests; then commit only the listed files.

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs OrchestrationPlatform/Lattice.AI.Runtime/Prompts/engineering-impact/v1/impact-task.md OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/AnswerCandidateParserTests.cs
git commit -m "fix: reject unsupported answer assertions"
```

### Task 10: Bind answer validation to the active investigation and expose semantic status

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/IAnswerValidator.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`

**Interfaces:**
- Produces: `Validate(AnswerCandidate answer, ContextPackage context, AuthorizationScope authorization, RuntimeRequestContext requestContext, string investigationId)`.
- `ImpactAnswerResult.SemanticSupportStatus` is an additive JSON field with default `"not-evaluated"` for every disposition. This means no entailment check was run.

- [ ] **Step 1: Add failing investigation/status tests**

Assert mismatch between request investigation and `ContextPackage.InvestigationId` rejects; request/trace/decision mismatches reject; every serialized answer result includes `"semanticSupportStatus":"not-evaluated"`.

- [ ] **Step 2: Implement the narrow contract change**

Pass the request’s active investigation ID into validation, compare it with the package, and add an init-only response property defaulting to `not-evaluated` without changing existing positional constructor call sites.

- [ ] **Step 3: Verify and commit**

Run focused validation/API tests and the full runtime suite; commit only listed contract/service/validator/test changes.

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/Validation/IAnswerValidator.cs OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs
git commit -m "feat: expose answer semantic support status"
```

### Task 11: Account for prompt and output budget in the estimated input allowance

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextBudget.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Generation/ModelContracts.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Azure/Models/AiRuntimeOptions.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/appsettings.json` only for non-secret documented defaults
- Modify: `OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`
- Create/Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/ModelGatewayTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptGovernanceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`

**Interfaces:**
- Produces: `ContextBudget.MaxEstimatedContextTokens`; required `AiRuntime:MaxInputTokens` in `AiRuntimeOptions` and a sixth required positional `MaxInputTokens` in `ModelConfiguration`; prompt assembly reports estimated total input from system/domain/task/output-schema overhead plus serialized context and user question; model request reserves configured `MaxOutputTokens` and a 15% input safety margin (rounded up) before context may be accepted.
- UTF-8 byte count divided by four is only a heuristic estimate, not tokenizer output. No tokenizer package is added in this task.

- [ ] **Step 1: Add failing budget boundary tests**

Cover exactly-under-allowance, over-allowance, large prompt policy overhead, multibyte engineering text, output-token reservation, safety margin, preservation of a supported claim under pressure, explicit omission reporting, and rejection of any emitted claim whose evidence was omitted.

- [ ] **Step 2: Load the approved prompt before compilation and compute its reserve**

In `ImpactAnswerService`, load the fixed source-controlled `engineering-impact/v1` bundle before compilation and compute the context allowance as `MaxInputTokens - MaxOutputTokens - ceil(MaxInputTokens * 0.15) - estimatedPromptOverhead`. `estimatedPromptOverhead` is the UTF-8-bytes-divided-by-four estimate for the assembled system policy/domain/task/schema instructions; include the question/context in the remaining compiler budget. The 15% reserve is a fixed percentage of configured maximum input, rounded up.

- [ ] **Step 3: Add explicit model input allowance configuration**

Add `AiRuntime:MaxInputTokens` as required for a real model call, validate it is positive and greater than `MaxOutputTokens`, and carry it in `ModelConfiguration`. Update the six known construction sites listed in this task. Offline fake configurations can use explicit test-only allowance values; do not guess a production deployment’s context window.

- [ ] **Step 4: Include prompt assembly overhead**

Estimate the assembled system and user message payload using the existing UTF-8 byte-count heuristic. Assert `estimatedInput + MaxOutputTokens + ceil(MaxInputTokens * 0.15) <= MaxInputTokens`. Reject/abstain explicitly before model invocation if the configured allowance cannot be met; preserve omission records from compilation.

- [ ] **Step 5: Verify context, prompt, gateway, and runtime tests**

Run focused tests above, then the runtime suite and API build. Expected: no request is knowingly assembled above configured allowance; estimates are labeled approximate.

- [ ] **Step 6: Commit**

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextBudget.cs OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Generation/ModelContracts.cs OrchestrationPlatform/Lattice.AI.Runtime.Azure/Models/AiRuntimeOptions.cs OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs OrchestrationPlatform/Orchestration.API/appsettings.json OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/ModelGatewayTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptGovernanceTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs
git commit -m "fix: budget assembled model requests conservatively"
```

### Task 12: Make telemetry identifiers opt-in

**Files:**
- Create: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetryOptions.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs`

**Interfaces:**
- Produces: `AiRuntimeTelemetryOptions` with `IncludeInvestigationIdentifier`, `IncludeEntityIdentifier`, `IncludeTenantIdentifier`, `IncludeContextPackageIdentifier`, all default `false`.
- Stage/duration/outcome/failure/version/count/token metrics remain. Question, prompt, answer, source content, bearer tokens, decision tokens/claims, deep links, tenant/subject IDs, and linkable IDs remain excluded by default.

- [ ] **Step 1: Add captured telemetry tests**

Using `ActivityListener`, `MeterListener`, and a test `ILoggerProvider`, assert default exports omit investigation, entity, tenant, context package, authorization decision IDs, question/prompt/answer/evidence markers, signed/bearer-token markers, and deep links.

- [ ] **Step 2: Inventory and sanitize application and HTTP telemetry**

Review all explicit tags/events and ASP.NET/HttpClient instrumentation. Ensure PLM request URLs do not export investigation path identifiers by default; retain only safe route/stage data. Do not log request/response bodies or auth headers.

- [ ] **Step 3: Implement opt-in identifiers**

Bind the options and add identifiers only when the corresponding option is explicitly enabled; keep all false in defaults.

- [ ] **Step 4: Verify telemetry tests and commit**

Run `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~AiRuntimeTelemetryTests`, then full runtime tests.

```text
git add OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetryOptions.cs OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs
git commit -m "fix: default runtime telemetry to identifier privacy"
```

### Task 13: Add non-semantic runtime quality signals

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/IAiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs`

**Interfaces:**
- Produces bounded counters/gauges for claims/evidence available/selected/omitted, validation issue count, clarification/abstention, unsupported-reference rejection, and JSON parse failures. Metric dimensions are low cardinality; no IDs or answer text are dimensions.

- [ ] **Step 1: Add in-memory metric tests**

Assert expected measurements/counts for one answer, one omitted claim, one clarification, one abstention, one parse error, and one unsupported-reference rejection. Assert none is named or described as correctness, semantic support, or faithfulness.

- [ ] **Step 2: Instrument the existing stages**

Record counts at their source of truth; do not estimate answer correctness. Do not add cost metrics unless an approved model-price source/config exists.

- [ ] **Step 3: Verify telemetry and runtime tests; commit**

Run focused telemetry tests and the full runtime suite, then commit only telemetry/runtime/test files.

```text
git add OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/IAiRuntimeTelemetry.cs OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs
git commit -m "feat: record non-semantic runtime quality signals"
```

### Task 14: Expand synthetic narrow-intent evaluation cases

**Files:**
- Modify: `OrchestrationPlatform/evals/engineering-impact/v1/manifest.json`
- Modify: `OrchestrationPlatform/evals/engineering-impact/v1/cases.jsonl`
- Modify: `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/requirement-r123.json`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`

**Interfaces:**
- Produces at least: 10 supported paraphrases; 5 missing/ambiguous subject cases; 3 unsupported questions; 3 no-evidence/missing-provenance cases; 4 authorization cases; 3 malformed/unsupported model-output cases; 3 budget-pressure cases; direct and multi-hop cases; inverse traversal only if the existing PLM service supports it.
- Case record `expect` annotations must carry `questionIntent`, `subjectId`, `clarificationRequired`, `scopeMaxHops`, `scopeRelationshipTypes`, `scopeSourceSystems`, `parseSucceeded`, `unsupportedReferenceRejected`, `authorizationLeakageAllowed` (always false), and `omissionBehaviorCorrect`, in addition to the existing expected disposition and reference arrays.
- All fixture data remains synthetic and all auth denials assert no evidence/model leakage.

- [ ] **Step 1: Add dataset count and coverage assertions**

Add tests that load the dataset and assert each named category meets the minimum counts, contains all seven baseline live question shapes where relevant, and uses no production identifiers or endpoints.

- [ ] **Step 2: Add synthetic cases**

Add deterministic fixture responses and expected dispositions/references. Include negative evidence and authorization scenarios; do not contact a live model.

- [ ] **Step 3: Verify the focused dataset**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~GoldenEvaluationTests`

Expected: minimum category counts and existing golden assertions pass.

- [ ] **Step 4: Commit dataset**

```text
git add OrchestrationPlatform/evals/engineering-impact/v1/manifest.json OrchestrationPlatform/evals/engineering-impact/v1/cases.jsonl OrchestrationPlatform/evals/engineering-impact/v1/fixtures/requirement-r123.json OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs
git commit -m "test: expand narrow impact evaluation cases"
```

### Task 15: Report evaluation dimensions and non-evaluated semantics

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationReport.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/Program.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/README.md` if it exists; otherwise document in `OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md`.

**Interfaces:**
- Produces report fields: `referenceIntegrityEvaluated=true`, `semanticSupportEvaluated=false`, and `liveModelQualityEvaluated=false`; separate metrics for intent accuracy, subject extraction, clarification, scope policy, disposition, relation/path/chain, evidence/source coverage, unsupported-reference rejection, authorization leakage, JSON parse result, and omission correctness.
- Each rate has an explicit numerator/denominator and zero-denominator behavior. CI gates required deterministic assertions only.
- Report metric names are `intentDetectionAccuracy`, `subjectExtractionAccuracy`, `clarificationAccuracy`, `scopePolicyAccuracy`, `dispositionAccuracy`, `relationshipCoverage`, `pathCoverage`, `chainCoverage`, `evidenceCoverage`, `sourceCoverage`, `unsupportedReferenceRejectionRate`, `authorizationLeakageCount`, `modelJsonParseSuccessCount`, `modelJsonParseFailureCount`, and `omissionBehaviorAccuracy`.
- Define accuracy as exact expected-vs-actual case matches divided by annotated cases; coverage as required IDs returned divided by required IDs; unsupported-reference rejection rate as unsupported reference attempts rejected divided by annotated unsupported-reference attempts; authorization leakage as denied cases with any evidence or model call; parse fields as counts among model-invoked cases; omission accuracy as exact expected-vs-actual omission-ID set match divided by annotated omission cases. For a zero denominator, emit `null` rate and a zero numerator rather than 100%.

- [ ] **Step 1: Add failing report tests**

Assert all flags and metric fields are serialized; a missing required expectation or authorization leak produces a failing case and nonzero CLI exit; semantic/live flags remain false even when all fixture cases pass.

- [ ] **Step 2: Implement metrics from explicit case expectations**

Compute each metric from dataset annotations and runtime observations, not from prose judged by the fixture model. Keep `unsupported-reference rejection` separate from entailment.

- [ ] **Step 3: Clarify CLI and docs**

Print/report that the suite is deterministic reference-integrity regression, not live model or semantic answer evaluation.

- [ ] **Step 4: Verify tests, positive and negative CLI cases; commit**

Run evaluation tests, normal CLI, and a temporary copied dataset with one required expected relationship deliberately changed. Assert normal exit 0 and modified dataset exit 1; remove the temporary copy.

```text
git add OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationReport.cs OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/Program.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md
git commit -m "feat: report offline evaluation limitations"
```

### Task 16: Add disabled-by-default Copilot routing boundary

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`
- Modify: `OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md`

**Interfaces:**
- Server-side frontend feature flag: `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED`, default `false`, never client-settable.
- `routeEngineeringImpactAnswer(input, configuration)` classifies only explicit supported narrow intent, requires feature flag and active investigation, and returns one of `legacy`, `runtime`, or `blocked`. The feature flag defaults false. Because no authorized user-token propagation path or decision provider is available, enabled routing returns a sanitized blocked outcome and never falls back to the legacy answer path.
- No request-body tenant, subject, grants, policy decision, or token is accepted.

- [ ] **Step 1: Add routing boundary tests**

Assert supported explicit question + disabled flag yields existing legacy behavior; unsupported question always remains legacy; missing investigation never invokes runtime; enabled flag with provider/identity not ready returns explicit unavailable and does not call the legacy model; genuine denial cannot fall back.

- [ ] **Step 2: Implement flag and blocked route boundary**

Read `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED` server-side with default false. Short-circuit before legacy model invocation only when a supported intent is explicitly enabled. Until user JWT propagation and provider readiness exist, return stable sanitized unavailable status; do not call `/api/engineering/impact-answer` unauthenticated.

- [ ] **Step 3: Review and preserve dirty files**

Before editing the pre-existing dirty `execute-copilot-turn.ts`, inspect its diff and integrate without overwriting user changes. Stage only the exact closure hunk and new helper/test.

- [ ] **Step 4: Verify frontend tests**

From `OrchestrationPlatform/frontend`, run the new routing tests and the existing `npm test -- features/lattice-next/tests/impact-evidence-service.test.ts features/lattice-next/tests/impact-evidence-authorization.test.ts`.

- [ ] **Step 5: Commit**

```text
git add OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md
git commit -m "feat: gate impact runtime routing behind feature flag"
```

### Task 17: Verify product answer rendering without connecting live runtime

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts` only if outcome mapping requires it
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`
- Test: existing Copilot answer rendering test only if needed

**Interfaces:**
- Produces: explicit frontend mapping for answer, clarification, abstention, denied, and unavailable outcomes without creating a second assistant turn. Runtime invocation stays blocked under the default configuration.

- [ ] **Step 1: Add outcome mapping tests**

Verify one answer maps to one assistant message; clarification and abstention remain visible as non-answer outcomes; denied/unavailable do not silently use legacy model output; sources are passed through only as inspectable references already supported by the UI.

- [ ] **Step 2: Implement only the outcome adapter**

Do not add UI redesign or a live HTTP call while user identity propagation is unresolved.

- [ ] **Step 3: Verify frontend tests and commit**

Run focused Vitest tests and commit only adapter/test changes.

### Task 18: Record live vertical-slice gate status

**Files:**
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-live-validation.md`

**Interfaces:**
- Consumes: approved non-production seeded investigation, real authorization provider, user/service identity, approved Azure deployment, and network/data approvals.
- Produces: exact live run evidence for the seven cases from the closure design, or a status of `BLOCKED` with missing prerequisites. Never fabricate results.

- [ ] **Step 1: Check external prerequisites**

Verify the provider is no longer the default unavailable provider; readiness is green; a valid user token and investigation access are available; PLM service and Azure model endpoint are approved/reachable; seeded data is approved. Do not echo credentials or record secrets.

- [ ] **Step 2: If any prerequisite is unavailable, record blocked status**

Document the exact missing owner/configuration/environment item. Do not attempt live model calls or claim authorization operation.

- [ ] **Step 3: If all prerequisites are approved, execute the seven live cases**

Use only the approved synthetic/seeded investigation. Capture request/trace, interpretation, resolution, scope, auth result, PLM evidence IDs, context counts/omissions, prompt/model versions, structured candidate in a controlled test artifact, validation, rendered result, stage latency, and token counts. Do not put content payloads in general telemetry.

- [ ] **Step 4: Commit the evidence record**

Commit only the sanitized live-validation record and explicitly controlled synthetic artifacts.

### Task 19: Produce controlled comparison and closure report

**Files:**
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-impact-comparison.md`
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-closure-report.md`

**Interfaces:**
- Comparison uses the same approved fixture/questions on existing and new paths; reports subject selection, relationship/path/chain coverage, citation integrity, unsupported references, clarification/abstention, malformed responses, successful validated-answer rate, latency, tokens, and human reviewer observations.
- Closure report contains these 19 sections in order: repository and commit baseline; review findings addressed; code changes made; simplifications made; authorization provider status; question-detection coverage; scope-policy coverage; mechanical validation coverage; semantic validation limitation; token-budget behavior; telemetry privacy decision; offline evaluation results; product integration status; live vertical-slice results; existing-versus-new runtime comparison; known limitations; remaining external blockers; final Phase 1 decision; evidence-based recommendation on starting the next planned sprint. With current Case B blockers and no approved environment, choose B only if all safe code tasks are complete; state product benefit and semantic quality as not measured.

- [ ] **Step 1: Add comparison evidence**

If live runs and human review exist, compute and report the comparison. Otherwise record `NOT RUN`, list the exact prerequisites, and do not claim positive or negative product impact.

- [ ] **Step 2: Write the final closure report**

Include baseline, addressed findings, commits/code, simplifications, authorization status, question/scope coverage, mechanical validation, semantic limitation, token estimate, telemetry privacy, offline metrics, product integration, live/comparison status, limitations, blockers, decision, and next-sprint recommendation.

- [ ] **Step 3: Final verification**

Run the runtime tests, offline evaluation, API build, frontend focused tests, `git diff --check`, and review `git status`. Report the known API.Tests compile baseline separately. Confirm every closure-owned file is committed and unrelated worktree changes remain untouched.

- [ ] **Step 4: Commit closure evidence**

```text
git add OrchestrationPlatform/docs/ai-runtime/phase-1-impact-comparison.md OrchestrationPlatform/docs/ai-runtime/phase-1-closure-report.md
git commit -m "docs: report Phase 1 closure evidence"
```

## Conditional External Exit

Tasks 18–19 may complete with documented `BLOCKED`/`NOT RUN` evidence if platform/security credentials, approvals, or environment access are not supplied. In that case the final decision is **B — CODE COMPLETE, PRODUCT ROLLOUT BLOCKED** only if all safe code tasks have passed; otherwise use **C — FUNCTIONALLY INCOMPLETE**. Never select A or D without the required live evidence and controlled comparison.

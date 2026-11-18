# Lattice AI Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a trustworthy Engineering Impact Answer runtime above PLM Brain with auditable context compilation, governed prompts, model access, deterministic validation, evaluation, and telemetry.

**Architecture:** Keep the existing TypeScript PLM Brain authoritative and consume its proven investigation-scoped graph through a narrow, versioned, authenticated internal service contract. The .NET API validates OIDC/JWT identity, obtains a server-side authorization decision, and sends a one-minute-default, audience/resource-bound signed decision with an authenticated workload call; the PLM service independently verifies both before returning evidence. Implement the remaining request pipeline as explicit .NET application services, use `Microsoft.Extensions.AI` with one Azure model deployment, and keep Lattice-specific context compilation and answer validation in-house.

**Tech Stack:** .NET 10 LTS, ASP.NET Core, `Microsoft.Extensions.AI` 10.x, `Microsoft.Extensions.AI.OpenAI` 10.x, `Azure.AI.OpenAI` 2.1.0, `Azure.Identity` 1.21.0, `Azure.Monitor.OpenTelemetry.AspNetCore` 1.6.0, `Microsoft.Extensions.Http.Resilience` 10.x, `FluentValidation.DependencyInjectionExtensions` 12.2.0, xUnit, and OpenTelemetry.

**Spec:** `docs/superpowers/specs/2026-11-17-lattice-plm-runtime-trust-boundary-design.md` and the approved Phase 1 implementation architecture in the conversation.

**Execution note:** Source paths in task file lists are relative to `OrchestrationPlatform/`, except paths explicitly marked repository root. Run `dotnet` commands from `OrchestrationPlatform/`. Run `git add`/`git commit` commands from the repository root; paths within `OrchestrationPlatform/` are prefixed accordingly.

## Global Constraints

- PLM Brain remains the authoritative source for engineering entities, canonical relationships, and impact paths/chains.
- Phase 1 supports the Engineering Impact Answer scenario using PLM Brain evidence, provenance, and source links; document RAG is not a release gate.
- Do not add a vector database, embeddings, broad document ingestion, MCP integrations, agent framework, model router, or broad response cache in Phase 1.
- Authorization must constrain retrieval before evidence is compiled or sent to a model.
- The runtime request must include the active `InvestigationId`; Phase 1 never searches across investigations.
- Validate OIDC/JWT at the .NET API boundary; derive tenant, subject, grants, and decision metadata server-side. Never trust client-supplied authorization values.
- Authenticate .NET-to-PLM calls with workload identity and a separately signed, audience/resource/operation-bound authorization decision; default decision TTL is one minute and expired decisions fail closed.
- The PLM service validates the authenticated caller and signed decision, optionally checks revocation through the configured revocation abstraction, and returns only evidence from the authorized investigation.
- Do not use the current unauthenticated frontend investigation route for runtime retrieval; add a dedicated internal versioned service route.
- Every impact claim in an accepted answer must refer to evidence in the compiled Context Package.
- Prompt bundles, Context Packages, model configuration, and validation outcomes must be versioned or identifiable in telemetry.
- **Framework decision for this repository:** The platform owner confirmed the API host supports .NET 10 LTS. Target only the API, its tests, and new runtime projects at `net10.0`; do not retarget unrelated projects.
- Every stage uses one `RuntimeRequestContext` containing a stable request ID and W3C trace ID; propagate it through authorization, both PLM service operations, Context Package, model calls, validation, evaluation, and telemetry.
- Use managed identity in Azure and developer Entra credentials locally; do not commit model API keys or secrets.
- Treat prompts and retrieved evidence as untrusted input; enforce security and scope in code, not prompt text.
- Record no full prompt, answer, or source payload in general telemetry by default.

## Review Focus

- **Ambiguous or unresolved subject:** clarify rather than choose a guessed entity. Test in Task 3 and Task 6.
- **Unauthorized evidence:** fail closed before context compilation and never include it in model input. Test in Task 3 and Task 6.
- **Missing or conflicting provenance:** do not fabricate a source ID, deep link, or support claim. Test in Task 4 and Task 6.
- **Context budget pressure:** report omitted evidence and preserve support for every emitted claim. Test in Task 4.
- **Malformed model output or unsupported evidence references:** reject, abstain, or return an explicit validation outcome; never return it as accepted. Test in Task 6.
- **Broken correlation propagation:** all stage results and telemetry for one answer retain the same request and trace IDs. Test in Tasks 2, 5, and 7.
- **Wrong-investigation or stale/revoked authorization decision:** reject before evidence is returned; bind the decision to investigation and operation, enforce one-minute default expiry, and fail closed on configured revocation-check failure. Test in Task 3.

## Execution State

- Task 1 project foundation is committed as `4845280b1877633d6ca45bcc67f0066ddf5f2f14`; new runtime/evaluation projects built. The existing API test project setup test was blocked by pre-existing missing-type compile errors.
- Task 2 shared contracts are committed as `141f6c1520310b99deb6a81a0224f8656820de04`; focused contract serialization tests passed.
- Task 3 trust-boundary implementation is committed as `80dabfc`; focused runtime and frontend tests passed, and the API build succeeded.
- Task 4 Context Compiler implementation is committed as `55624ef`; all 28 runtime tests and the API build passed. Its isolated pre-implementation red run could not be performed because permission to create a temporary worktree was unavailable.
- Task 5 prompt governance and Azure Model Gateway implementation is committed as `d4a5c72`; all 48 runtime tests and the API build passed. Its isolated pre-implementation red run was not verified.
- Task 6 answer validation and impact-answer API implementation is complete; focused tests passed (20/20), the full runtime suite passed (68/68), and the API build succeeded. The existing API test project still has baseline missing-type compilation errors and was not changed. Tasks 1–5 are committed and must not be repeated or amended.
- Task 7 OpenTelemetry and Azure Monitor configuration is implemented; telemetry/gateway tests passed (14/14), all runtime tests passed (74/74), and the API build succeeded. Solution-wide `dotnet test OrchestrationPlatform.slnx --no-restore` remains blocked by pre-existing missing `Governance`, `AvailabilityState`, and `CompletenessState` symbols in `Orchestration.API.Tests`. The pre-implementation red run was not verified.

---

### Task 1: Align the .NET solution and create runtime projects

**Files:**
- Create: `docs/ai-runtime/framework-target-decision.md`
- Create: `OrchestrationPlatform.slnx`
- Create: `Directory.Packages.props`
- Create: `Lattice.AI.Runtime.Contracts/Lattice.AI.Runtime.Contracts.csproj`
- Create: `Lattice.AI.Runtime/Lattice.AI.Runtime.csproj`
- Create: `Lattice.AI.Runtime.Azure/Lattice.AI.Runtime.Azure.csproj`
- Create: `Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`
- Create: `Lattice.AI.Runtime.Evaluation/Lattice.AI.Runtime.Evaluation.csproj`
- Modify: `Orchestration.API/Orchestration.API.csproj`
- Modify: `Orchestration.API.Tests/Orchestration.API.Tests.csproj`
- Create: `Orchestration.API.Tests/RuntimeFoundationSetupTests.cs`

**Interfaces:**
- Produces the project boundaries and references shown in the approved implementation architecture:
  - API references Runtime, Runtime.Azure, and Runtime.Contracts.
  - Runtime.Azure references Runtime and Runtime.Contracts.
  - Runtime references Runtime.Contracts.
  - Tests reference Runtime, Runtime.Azure, and Runtime.Contracts.
  - Evaluation references Runtime, Runtime.Azure, and Runtime.Contracts.

- [ ] **Step 1: Write a framework-alignment test/check**

Record the platform owner's explicit confirmation that the API host supports .NET 10 LTS in `docs/ai-runtime/framework-target-decision.md`. The API currently targets out-of-support .NET 9 and its existing tests target .NET 10. Retarget only the API, its tests, and new runtime projects; do not change unrelated platform projects.

- [ ] **Step 2: Run the check and verify it fails**

Add `RuntimeFoundationSetupTests.Api_targets_net10` to read `Orchestration.API.csproj` and assert its `TargetFramework` is `net10.0`. Run: `dotnet test Orchestration.API.Tests/Orchestration.API.Tests.csproj --filter FullyQualifiedName~RuntimeFoundationSetupTests`
Expected: FAIL until the recorded framework decision and project targets agree.

- [ ] **Step 3: Add solution and project skeletons**

Create the projects above, add them to `OrchestrationPlatform.slnx`, target each at `net10.0`, enable nullable reference types and implicit usings, and add only the project references specified in this task. Add `Lattice.AI.Runtime.Azure` as a project reference to `Lattice.AI.Runtime.Tests` so adapter tests can use fake `IChatClient` implementations.

- [ ] **Step 4: Centralize package versions**

Create `Directory.Packages.props` with central version management. Carry forward existing package versions where compatible with .NET 10; update only packages required to support the approved target. Pin `Azure.AI.OpenAI` to 2.1.0, `Azure.Identity` to 1.21.0, `Azure.Monitor.OpenTelemetry.AspNetCore` to 1.6.0, and `FluentValidation.DependencyInjectionExtensions` to 12.2.0. Pin AI and resilience packages to stable versions compatible with .NET 10.

- [ ] **Step 5: Add Phase 1 package references**

Add `Microsoft.Extensions.AI` and `Microsoft.Extensions.AI.OpenAI` to `Lattice.AI.Runtime.Azure`; `Azure.AI.OpenAI`, `Azure.Identity`, and `Microsoft.Extensions.Http.Resilience` to the Azure adapter; `Azure.Monitor.OpenTelemetry.AspNetCore` to the API host; and `FluentValidation.DependencyInjectionExtensions` only if DTO/options validators use it. Add `Microsoft.NET.Test.Sdk`, `xunit`, and `xunit.runner.visualstudio` to the runtime test project. Do not add Azure Search, document parsing, vector-store, MCP, or agent-framework packages.

- [ ] **Step 6: Align existing projects and verify solution build**

Apply only the framework changes recorded in `framework-target-decision.md`. Align the API tests and OpenAPI package to .NET 10-compatible versions. Centralize package versions without upgrading unrelated dependencies. Run: `dotnet build OrchestrationPlatform.slnx`
Expected: all new projects build. The existing API test project currently has unrelated missing-type compile errors (`Governance`, `AvailabilityState`, `CompletenessState`, and `LegacyHandoffCanonicalAssembler`); record these as a baseline limitation and do not repair unrelated tests as part of this task.

- [ ] **Step 7: Commit**

```bash
git add OrchestrationPlatform/docs/ai-runtime/framework-target-decision.md OrchestrationPlatform/OrchestrationPlatform.slnx OrchestrationPlatform/Directory.Packages.props OrchestrationPlatform/Orchestration.API/Orchestration.API.csproj OrchestrationPlatform/Orchestration.API.Tests/Orchestration.API.Tests.csproj OrchestrationPlatform/Orchestration.API.Tests/RuntimeFoundationSetupTests.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts OrchestrationPlatform/Lattice.AI.Runtime OrchestrationPlatform/Lattice.AI.Runtime.Azure OrchestrationPlatform/Lattice.AI.Runtime.Tests OrchestrationPlatform/Lattice.AI.Runtime.Evaluation
git commit -m "chore: establish AI runtime project structure"
```

### Task 2: Define runtime contracts and authorization scope

**Files:**
- Create: `Lattice.AI.Runtime.Contracts/Requests/RuntimeRequestContext.cs`
- Create: `Lattice.AI.Runtime.Contracts/Requests/ImpactAnswerRequest.cs`
- Create: `Lattice.AI.Runtime.Contracts/Requests/QuestionInterpretation.cs`
- Create: `Lattice.AI.Runtime.Contracts/Scope/ImpactScope.cs`
- Create: `Lattice.AI.Runtime.Contracts/Scope/EntityResolutionResult.cs`
- Create: `Lattice.AI.Runtime.Contracts/Scope/ScopePlanningResult.cs`
- Create: `Lattice.AI.Runtime.Contracts/Authorization/AuthorizationScope.cs`
- Create: `Lattice.AI.Runtime.Contracts/Evidence/EvidenceRecords.cs`
- Create: `Lattice.AI.Runtime.Contracts/Evidence/ImpactEvidenceQuery.cs`
- Create: `Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs`
- Create: `Lattice.AI.Runtime.Contracts/Generation/ModelContracts.cs`
- Create: `Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs`
- Create: `Lattice.AI.Runtime.Tests/Contracts/RuntimeContractTests.cs`

**Interfaces:**
- Produces these public contracts:
- The code below shows the final Phase 1 contract shapes. Task 2 committed the initial contracts; revised Task 3 adds `InvestigationId`, `AuthorizationContext`, decision expiry, path/chain fidelity, and investigation binding to result/context records.

```csharp
public sealed record RuntimeRequestContext(
    string RequestId, string TraceId, string? ParentRequestId,
    string? ConversationId);

public sealed record ImpactAnswerRequest(
    string InvestigationId, string Question, string? ConversationId = null);

public enum ImpactQuestionType { EngineeringImpact, Unsupported }

public sealed record QuestionInterpretation(
    ImpactQuestionType Type, string OriginalQuestion,
    string? CandidateEntityType, string? CandidateEntityId,
    string? ChangeScenario, IReadOnlyList<string> ClarificationReasons);

public enum EntityResolutionDisposition { Resolved, Ambiguous, Unresolved, Denied }
public sealed record EntityResolutionResult(
    EntityResolutionDisposition Disposition, ResolvedEntity? Entity,
    IReadOnlyList<string> CandidateIds, IReadOnlyList<string> Diagnostics);

public sealed record ResolvedEntity(
    string System, string EntityType, string CanonicalId, string DisplayName);

public sealed record ImpactScope(
    IReadOnlySet<string> RelationshipTypes,
    int? MaxHops,
    IReadOnlySet<string> SourceSystems,
    DateTimeOffset? AsOf);

public enum ScopePlanningDisposition { Ready, Clarify, Unsupported, Denied }
public sealed record ScopePlanningResult(
    ScopePlanningDisposition Disposition, ImpactScope? Scope,
    IReadOnlyList<string> Diagnostics);

public sealed record AuthorizationScope(
    string TenantId, string SubjectId, string PolicyVersion,
    string DecisionId, DateTimeOffset DecisionExpiresAt,
    IReadOnlySet<string> Grants);

public sealed record AuthorizationContext(
    AuthorizationScope Scope, string PlmBrainDecisionToken,
    DateTimeOffset ExpiresAt);

public sealed record EvidenceSourceReference(
    string EvidenceId, string SourceType, string SourceSystem,
    string RecordId, string? Revision, string? Location,
    string? DeepLink, string ProvenanceId,
    string AuthorizationDecisionId);

public sealed record RelationshipEvidence(
    string RelationshipId, string SourceEntityId, string TargetEntityId,
    string RelationshipType, string? Explanation,
    IReadOnlyList<string> EvidenceIds);

public sealed record ImpactPathEvidence(
    string PathId, IReadOnlyList<string> EntityIds,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<ImpactPathStepEvidence> Steps,
    IReadOnlyList<string> Meanings, string Status, string Strength,
    bool ImpactEligible, IReadOnlyList<string> CitationIds);

public sealed record ImpactPathStepEvidence(
    string RelationshipId, string FromEntityId, string ToEntityId,
    string Traversal, string RelationshipType, string Meaning);

public sealed record ImpactChainEvidence(
    string ChainId, string SourceEntityId, string ImpactedEntityId,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<string> SupportingEvidenceIds,
    IReadOnlyList<string> CitationIds,
    string EngineeringExplanation, decimal Confidence,
    string ImpactRationale, string Status, string Strength);

public sealed record EvidenceRetrievalResult(
    string InvestigationId,
    IReadOnlyList<RelationshipEvidence> Relationships,
    IReadOnlyList<ImpactPathEvidence> Paths,
    IReadOnlyList<ImpactChainEvidence> Chains,
    IReadOnlyList<EvidenceSourceReference> Sources,
    string SourceVersion, string OntologyVersion,
    string AuthorizationDecisionId);

public sealed record ImpactEvidenceQuery(
    string InvestigationId, ResolvedEntity Subject, ImpactScope Scope,
    AuthorizationContext Authorization, RuntimeRequestContext RequestContext);

public sealed record ContextPackage(
    RuntimeRequestContext RequestContext,
    string InvestigationId,
    string PackageId, string SchemaVersion, string CompilerVersion,
    string AuthorizationDecisionId,
    ResolvedEntity Subject, ImpactScope Scope,
    IReadOnlyList<ImpactClaim> Claims,
    IReadOnlyList<EvidenceSourceReference> Sources,
    IReadOnlyList<ContextOmission> Omissions);

public sealed record ContextOmission(string ClaimId, string Reason);
public enum CompilationDisposition { Ready, Empty, InsufficientEvidence, Denied }
public sealed record ContextCompilationResult(
    ContextPackage? Package, CompilationDisposition Disposition,
    IReadOnlyList<string> Diagnostics);

public sealed record ModelConfiguration(
    string Id, string Provider, string ModelName,
    string DeploymentName, int MaxOutputTokens);
public sealed record ModelMessage(string Role, string Content);
public sealed record ModelRequest(
    RuntimeRequestContext RequestContext,
    string PromptBundleId, string PromptBundleVersion,
    string ContextPackageId, string ModelConfigurationId,
    IReadOnlyList<ModelMessage> Messages, string OutputSchemaVersion);
public sealed record ModelResponse(
    RuntimeRequestContext RequestContext,
    string Content, string Provider, string Model,
    string? ModelVersion, int? InputTokens, int? OutputTokens,
    TimeSpan Duration);

public sealed record ImpactClaim(
    string ClaimId, string Statement,
    string? ImpactPathId, string? ImpactChainId,
    IReadOnlyList<string> EntityIds,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<string> EvidenceIds,
    string? Rationale, decimal? Confidence);

public sealed record AnswerCandidate(
    string Summary, IReadOnlyList<AnswerImpact> Impacts,
    IReadOnlyList<string> Warnings);

public sealed record AnswerImpact(
    string ClaimId, string Explanation,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> SourceIds);

public sealed record ValidationIssue(string Code, string Message, string? ClaimId = null);
public enum AnswerDisposition { Answer, Clarify, Abstain, Deny, Failed }
public enum ValidationDisposition { Accept, Clarify, Abstain, Reject }

public sealed record ImpactAnswerResult(
    RuntimeRequestContext RequestContext,
    string InvestigationId,
    AnswerDisposition Disposition, string? Summary,
    IReadOnlyList<AnswerImpact> Impacts,
    IReadOnlyList<EvidenceSourceReference> Sources,
    IReadOnlyList<ValidationIssue> Issues, string? ContextPackageId);
```

- Tests: JSON serialization is stable with the API's camel-case and kebab-case enum conventions; required lists are non-null; schema/version fields serialize as defined; investigation ID, request ID, and W3C trace ID survive serialization unchanged.

- [ ] **Step 1: Write failing contract serialization tests**

Add `RuntimeContractTests` for serialization round-trip of `RuntimeRequestContext`, `ImpactAnswerRequest`, `ContextPackage`, `ModelRequest`, `ModelResponse`, and `AnswerCandidate`, including enum serialization and stable `InvestigationId`, `RequestId`, and `TraceId` propagation.

- [ ] **Step 2: Run tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~RuntimeContractTests`
Expected: FAIL because the contract types do not exist.

- [ ] **Step 3: Implement the contract records**

Create the listed records and enums in `Lattice.AI.Runtime.Contracts`. Use immutable records and non-null collections; represent optional values explicitly.

- [ ] **Step 4: Run tests and verify pass**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~RuntimeContractTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add OrchestrationPlatform/Lattice.AI.Runtime.Contracts OrchestrationPlatform/Lattice.AI.Runtime.Tests/Contracts
git commit -m "feat: define AI runtime contracts"
```

### Task 3: Add the authenticated PLM evidence boundary and authorized runtime planning

**Files:**
- Create: `Lattice.AI.Runtime/QuestionUnderstanding/IQuestionInterpreter.cs`
- Create: `Lattice.AI.Runtime/QuestionUnderstanding/QuestionInterpreter.cs`
- Create: `Lattice.AI.Runtime/EntityResolution/IEngineeringEntityResolver.cs`
- Create: `Lattice.AI.Runtime/ScopePlanning/IScopePlanner.cs`
- Create: `Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Create: `Lattice.AI.Runtime/Authorization/IAuthorizationContextProvider.cs`
- Create: `Lattice.AI.Runtime/Authorization/IResourceAuthorizationDecisionProvider.cs`
- Create: `Lattice.AI.Runtime/Authorization/UnavailableResourceAuthorizationDecisionProvider.cs`
- Create: `Lattice.AI.Runtime/Authorization/IAuthorizationDecisionTokenIssuer.cs`
- Create: `Lattice.AI.Runtime.Contracts/Authorization/AuthorizationDecisionTicketClaims.cs`
- Create: `Lattice.AI.Runtime.Contracts/Authorization/AuthorizationContext.cs`
- Create: `Lattice.AI.Runtime.Contracts/Authorization/AuthorizationContextResult.cs`
- Modify: `Lattice.AI.Runtime.Contracts/Authorization/AuthorizationScope.cs` to preserve the server-side decision expiry
- Create: `Lattice.AI.Runtime/Evidence/IEngineeringEvidenceSource.cs`
- Create: `Lattice.AI.Runtime/Evidence/PlmBrainServiceContracts.cs`
- Create: `Orchestration.API/AI/Adapters/AspNetAuthorizationContextProvider.cs`
- Create: `Orchestration.API/AI/Adapters/PlmBrainEngineeringEvidenceSource.cs`
- Create: `Orchestration.API/AI/Adapters/PlmBrainEntityResolver.cs`
- Create: `Orchestration.API/AI/Adapters/KeyVaultAuthorizationDecisionTokenIssuer.cs`
- Create: `Orchestration.API/AI/Adapters/PlmBrainServiceOptions.cs`
- Create: `Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Modify: `Orchestration.API/Program.cs`
- Modify: `Orchestration.API/Orchestration.API.csproj`
- Modify: `Directory.Packages.props`
- Modify: `Lattice.AI.Runtime.Contracts/Requests/ImpactAnswerRequest.cs` to require `InvestigationId`
- Modify: `Lattice.AI.Runtime.Contracts/Evidence/ImpactEvidenceQuery.cs` to carry `InvestigationId`
- Modify: `Lattice.AI.Runtime.Contracts/Evidence/EvidenceRecords.cs` so `EvidenceRetrievalResult` carries `InvestigationId`
- Modify: `Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs` so `ContextPackage` carries `InvestigationId`
- Modify: `Lattice.AI.Runtime.Tests/Contracts/RuntimeContractTests.cs`
- Create: `Lattice.AI.Runtime.Tests/QuestionUnderstanding/QuestionPlanningTests.cs`
- Create: `Lattice.AI.Runtime.Tests/Evidence/AuthorizationAwareRetrievalTests.cs`
- Create: `Lattice.AI.Runtime.Tests/Authorization/AuthorizationDecisionTokenTests.cs`
- Modify: `frontend/package.json` and `frontend/package-lock.json` to declare `jose` (`^6.2.13`) directly
- Create: `frontend/features/lattice-next/plm-brain/contracts/impact-evidence-service-v1.ts`
- Create: `frontend/features/lattice-next/plm-brain/universal/impact-evidence-service.ts`
- Create: `frontend/features/lattice-next/plm-brain/universal/impact-evidence-authorization.ts`
- Create: `frontend/app/api/internal/v1/investigations/[investigationId]/entity-resolution/route.ts`
- Create: `frontend/app/api/internal/v1/investigations/[investigationId]/impact-evidence/route.ts`
- Create: `frontend/features/lattice-next/tests/impact-evidence-service.test.ts`
- Create: `frontend/features/lattice-next/tests/impact-evidence-authorization.test.ts`

**Interfaces:**
- `ImpactAnswerRequest` is `(string InvestigationId, string Question, string? ConversationId = null)`; the API rejects a blank investigation ID before question interpretation.
- `QuestionInterpretation IQuestionInterpreter.Interpret(ImpactAnswerRequest request, RuntimeRequestContext requestContext)` deterministically extracts an explicit requirement identifier and change-impact intent. It does not infer a missing identifier.
- `Task<AuthorizationContextResult> IAuthorizationContextProvider.CreateAsync(ClaimsPrincipal principal, string investigationId, RuntimeRequestContext requestContext, CancellationToken cancellationToken)` derives tenant/subject and grants only from validated identity and the server-side authorization decision provider, then creates the signed decision ticket once for an authorized result. `AuthorizationContextResult` is a closed outcome with `Authorized(AuthorizationContext)` and `Denied(AuthorizationDenialCode)` cases; missing provider/configuration returns `Denied`, while signing/configuration service failures remain explicit operational failures.
- `AuthorizationDenialCode` distinguishes missing policy decision, denied investigation access, and missing provider configuration; do not include sensitive policy details in client responses.
- `Task<AuthorizationScope?> IResourceAuthorizationDecisionProvider.EvaluateAsync(ClaimsPrincipal principal, string investigationId, RuntimeRequestContext requestContext, CancellationToken cancellationToken)` is implemented by the platform-approved policy integration. The explicit unavailable implementation returns no decision and never grants access.
- `Task<EntityResolutionResult> IEngineeringEntityResolver.ResolveAsync(string investigationId, QuestionInterpretation interpretation, AuthorizationContext authorization, RuntimeRequestContext requestContext, CancellationToken cancellationToken)` uses the internal PLM service's exact-ID resolution operation and only resolves within the supplied investigation.
- `ScopePlanningResult IScopePlanner.Plan(QuestionInterpretation interpretation, ResolvedEntity subject, AuthorizationScope authorization, RuntimeRequestContext requestContext)` produces the bounded approved impact scope.
- `Task<EvidenceRetrievalResult> IEngineeringEvidenceSource.RetrieveImpactAsync(ImpactEvidenceQuery query, CancellationToken cancellationToken)` requires `InvestigationId`, subject, scope, `AuthorizationContext`, and `RuntimeRequestContext`.
- `AuthorizationContext` contains sanitized `AuthorizationScope`, the short-lived signed PLM decision token, and expiry. The PLM adapters receive this context; the Context Compiler, Context Package, prompt, answer validator, logs, and telemetry receive only `AuthorizationScope` / `DecisionId`, never the signed token.
- `EvidenceRetrievalResult` preserves the authoritative relationship/path/chain IDs, path steps and meanings, eligibility/status/strength, chain explanations and rationales, confidence, evidence and citation IDs, source provenance and links, source/ontology versions, and authorization decision ID.
- `PlmBrainResolveEntityRequest` is `(string CandidateEntityId)`; `PlmBrainEntityResolutionResponse` carries resolution disposition, optional resolved entity, candidate IDs, and diagnostics.
- `PlmBrainImpactEvidenceRequest` is `(string SubjectEntityId, ImpactScope Scope)`; `PlmBrainImpactEvidenceResponse` carries `EvidenceRetrievalResult` plus the producer contract version.
- `AuthorizationDecisionTicketClaims` contains `Issuer`, `Audience`, `TenantId`, `SubjectId`, `InvestigationId`, `Operation`, `Grants`, `PolicyVersion`, `DecisionId`, `RequestId`, `TokenId`, `IssuedAt`, and `ExpiresAt`; it is signed as an asymmetric JWS and never appears in model prompts or general logs.
- Encode standard JWT claims as `iss`, `aud`, `tid`, `sub`, `iat`, `exp`, and `jti`; encode resource/operation data as `investigation_id`, `operation`, `grants`, `policy_version`, `decision_id`, and `request_id`. Use numeric UTC NumericDate values and strict expiry validation with no positive clock-skew grace.
- `IAuthorizationDecisionTokenIssuer.Issue(AuthorizationScope authorization, string investigationId, string requestId)` returns `AuthorizationContext` with `ExpiresAt = min(authorization.DecisionExpiresAt, issuedAt + configured TTL)`; default TTL is 60 seconds, and an already-expired decision is rejected rather than extended.
- The .NET typed client calls `POST /api/internal/v1/investigations/{investigationId}/entity-resolution` and `POST /api/internal/v1/investigations/{investigationId}/impact-evidence`. Both calls within one answer reuse the same Entra workload access token and signed decision ticket, with issuer, audience, tenant, subject, investigation ID, `Operation="engineering-impact-answer"`, endpoint-specific grants, policy/decision IDs, request ID, unique token ID, issue time, and expiration claims. Obtain one server-side authorization decision per answer request; do not make a separate policy-provider round trip for each PLM operation.
- Send the workload access token as `Authorization: Bearer ...`, the signed ticket as `X-Lattice-Authorization-Decision`, and request correlation as `X-Lattice-Request-Id` plus W3C `traceparent`; never log any of these credential headers.
- The signed decision has a configurable TTL defaulting to 60 seconds. `Operation` is `engineering-impact-answer`; required endpoint grants are `investigation:resolve-entity` and `investigation:read-impact-evidence`, checked separately by the corresponding route. The PLM service rejects expired, wrong-issuer/audience, wrong-investigation, wrong-operation, insufficient-grant, or revoked tickets. Expiration is strict (`now >= ExpiresAt` is rejected). A configured revocation-check failure fails closed; no separate policy-provider round trip is required for each service operation.
- The PLM service verifies workload access tokens using configured OIDC issuer/audience/JWKS and verifies decision tickets using configured trusted signing JWKs. `jose` is declared as a direct frontend dependency. Production signing uses an asymmetric Key Vault key; tests use ephemeral keys. Never use unsigned identity headers or a shared static secret.
- Internal route handlers call the existing `serverKernel` and `ensureInvestigationKnowledgeGraph` / ontology enrichment path. They serialize the existing authoritative output; they must not implement a second ontology, relationship traversal, or impact-chain algorithm. The current public GET route is not called by .NET.
- The frontend service route is network-restricted in production and still performs token/ticket authorization; network restriction is defense in depth, never its only control.
- Phase 1 does not invent an authorization provider: production DI must register the platform-approved server-side decision provider. If it is unavailable, the endpoint fails closed and the documented rollout gate remains closed.

- [ ] **Step 1: Write failing auth, scope, and producer-contract tests**

Add runtime tests for missing `InvestigationId`, exact and ambiguous requirement resolution, absent identity/tenant, absent authorization provider, denied investigation, and proof that denied requests make no PLM call. Assert the server-side policy provider is called once per answer and the same decision ticket is reused for entity resolution and evidence retrieval. Test that the signed ticket expires at the earlier of the decision expiry and 60 seconds, and already-expired decisions are denied. Add service tests proving only the requested investigation is loaded, response IDs/provenance match the existing `InvestigationKnowledgeGraph`, and no impact reasoning is recomputed. Add authorization tests for invalid service JWT, invalid decision signature, expired decision, wrong audience/investigation/operation, insufficient grant, revoked decision, unavailable configured revocation checker, and request/trace propagation.

- [ ] **Step 2: Run tests and verify failure**

Run from `OrchestrationPlatform/`: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~QuestionPlanningTests|FullyQualifiedName~AuthorizationAwareRetrievalTests|FullyQualifiedName~RuntimeContractTests"`.
Run from `OrchestrationPlatform/frontend/`: `npm test -- features/lattice-next/tests/impact-evidence-service.test.ts features/lattice-next/tests/impact-evidence-authorization.test.ts`.
Expected: FAIL because the scoped runtime contracts, client, protected service operations, and auth verification are not implemented.

- [ ] **Step 3: Add request-scope and runtime planning contracts**

Update the already-created `ImpactAnswerRequest` and `ImpactEvidenceQuery` records with required `InvestigationId`, update contract serialization fixtures, add `AuthorizationContext` and its explicit authorized/denied result, and implement the deterministic interpreter, exact-identifier resolver interface, scope planner, authorization-context provider interface, and evidence-source interface. Test blank investigation IDs as invalid and unresolved/ambiguous subject IDs as clarification outcomes.

- [ ] **Step 4: Add the TypeScript internal evidence service**

Define versioned request/response DTOs for entity resolution and impact evidence. Implement service functions that load only the requested investigation, call the existing knowledge-graph enrichment, resolve only exact canonical/native IDs in that graph, and return source relationship/path/chain IDs and provenance unchanged. Add route handlers under `/api/internal/v1`; do not change the existing public investigation GET route.

- [ ] **Step 5: Protect internal service operations**

Validate the Entra workload JWT's signature, issuer, audience, expiry, and required application role/scope using configured OIDC discovery/JWKS. Validate the decision JWS's signature, issuer, audience, expiry, investigation, operation, required grant, and policy/decision fields using the configured trusted public JWK set. Add a configurable 60-second default maximum age and reject expired tickets. Invoke the revocation-check abstraction when configured; if configured checking fails or reports revoked, deny. Return 401 for invalid service identity, 403 for denied/invalid authorization decision, 404 for inaccessible/missing investigation without leaking evidence, and versioned JSON only on success.

- [ ] **Step 6: Implement .NET identity, signing, and PLM client adapters**

Configure ASP.NET Core JWT bearer authentication from deployment `Authority` and `Audience`; require authentication on the impact API. Implement the server-side authorization provider with an explicit fail-closed missing-provider behavior. Use `DefaultAzureCredential` for PLM workload-token acquisition and `Azure.Security.KeyVault.Keys` for asymmetric decision-ticket signing; inject a clock and signer for deterministic expiry tests. Add a typed `HttpClient` with .NET HTTP resilience, pass the same `RuntimeRequestContext`, and map only the versioned internal response into runtime contracts. Do not send model input if authorization or service retrieval fails.

- [ ] **Step 7: Register, configure, and verify the end-to-end boundary**

Register authentication/authorization middleware in the required order, `AddAiRuntime`, the platform-approved `IResourceAuthorizationDecisionProvider` (or `UnavailableResourceAuthorizationDecisionProvider`), token issuer, typed PLM client, and adapters. Add `Microsoft.AspNetCore.Authentication.JwtBearer` and `Azure.Security.KeyVault.Keys` through central package management. Add non-secret configuration names: `Authentication:Authority`, `Authentication:Audience`, `AuthorizationDecision:Issuer`, `AuthorizationDecision:Audience`, `AuthorizationDecision:KeyId`, `AuthorizationDecision:DefaultTtlSeconds` (60), `AuthorizationDecision:RevocationMode`, `PlmBrain:BaseUrl`, `PlmBrain:WorkloadTokenScope`, and `PlmBrain:DecisionJwks`. Configure frontend verification values for service-token issuer/audience/JWKS, decision issuer/audience/JWKS, and revocation mode. Verify the internal route has production network restriction configured or documented as a deployment gate, and verify missing auth configuration fails closed.

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~QuestionPlanningTests|FullyQualifiedName~AuthorizationAwareRetrievalTests|FullyQualifiedName~RuntimeContractTests"`.
Run from `OrchestrationPlatform/frontend/`: `npm test -- features/lattice-next/tests/impact-evidence-service.test.ts features/lattice-next/tests/impact-evidence-authorization.test.ts`.
Expected: PASS; valid scoped requests preserve authoritative PLM Brain evidence and trace IDs, while all missing, wrong-scope, expired, revoked, or unavailable authorization paths deny before evidence reaches context compilation.

- [ ] **Step 8: Stage only Task 3 files and commit**

Do not recursively add `frontend/features/lattice-next/plm-brain` or `frontend/features/lattice-next/tests`; the worktree already contains unrelated untracked files there. Stage only the exact paths listed in this task. The package manifest and lockfile already contain an unrelated `zwitch` diff: stage an index-only patch containing only the direct `jose` dependency additions and verify the staged dependency diff contains no `zwitch` change.

```bash
git add OrchestrationPlatform/Directory.Packages.props OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding OrchestrationPlatform/Lattice.AI.Runtime/EntityResolution OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning OrchestrationPlatform/Lattice.AI.Runtime/Authorization OrchestrationPlatform/Lattice.AI.Runtime/Evidence OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Authorization/AuthorizationDecisionTicketClaims.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Authorization/AuthorizationContext.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Authorization/AuthorizationContextResult.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Authorization/AuthorizationScope.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/ImpactAnswerRequest.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/ImpactEvidenceQuery.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/EvidenceRecords.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Contracts/RuntimeContractTests.cs OrchestrationPlatform/Orchestration.API/AI/Adapters OrchestrationPlatform/Orchestration.API/AI/Composition OrchestrationPlatform/Orchestration.API/Program.cs OrchestrationPlatform/Orchestration.API/Orchestration.API.csproj OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evidence OrchestrationPlatform/Lattice.AI.Runtime.Tests/Authorization ':(literal)OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/entity-resolution/route.ts' ':(literal)OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/impact-evidence/route.ts' OrchestrationPlatform/frontend/features/lattice-next/plm-brain/contracts/impact-evidence-service-v1.ts OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/impact-evidence-service.ts OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/impact-evidence-authorization.ts OrchestrationPlatform/frontend/features/lattice-next/tests/impact-evidence-service.test.ts OrchestrationPlatform/frontend/features/lattice-next/tests/impact-evidence-authorization.test.ts
# Stage only the `jose` additions from the frontend dependency files using a non-interactive index-only patch; do not `git add` either file because that would include the pre-existing `zwitch` changes.
git diff --cached -- OrchestrationPlatform/frontend/package.json OrchestrationPlatform/frontend/package-lock.json
git commit -m "feat: add authorized PLM Brain evidence boundary"
```

### Task 4: Implement the Context Compiler

**Files:**
- Create: `Lattice.AI.Runtime/ContextCompilation/IContextCompiler.cs`
- Create: `Lattice.AI.Runtime/ContextCompilation/ContextCompilationInput.cs`
- Create: `Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Create: `Lattice.AI.Runtime/ContextCompilation/ContextBudget.cs`
- Create: `Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`

**Interfaces:**
- `ContextCompilationResult IContextCompiler.Compile(ContextCompilationInput input)`
- `ContextCompilationInput` is `(RuntimeRequestContext RequestContext, string InvestigationId, ResolvedEntity Subject, ImpactScope Scope, AuthorizationScope Authorization, EvidenceRetrievalResult Evidence, ContextBudget Budget)`.
- `ContextBudget` is `(int MaxClaims, int MaxEvidenceItems, int MaxEstimatedTokens)`.
- `ContextCompilationResult` and `ContextOmission` are defined in the runtime contracts project in Task 2; `ContextPackage.InvestigationId` must match the input and retrieval result. No model-specific types are allowed in this project.
- `ImpactClaim.Confidence` carries PLM Brain chain confidence separately so its engineering explanation remains unchanged.
- The compiler only selects, filters, deduplicates, and budgets impact paths/chains and narratives already returned by PLM Brain. It does not derive new engineering relationships, traverse paths, or create new impact reasoning.

- [x] **Step 1: Write compiler tests**

Cover stable claim/evidence/path/chain references, duplicate evidence removal, partial provenance, conflicting evidence, investigation-ID mismatch, and context-budget omission reporting. Assert that every claim evidence ID exists in package sources, PLM Brain chain IDs/narratives/rationales are preserved without recomputation, the package and evidence investigation IDs match the input, and omitted claims are not emitted.

- [ ] **Step 2: Run tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ContextCompilerTests`
Expected: FAIL because the compiler does not exist.

The pre-implementation red run was not verified: the implementation and tests were already present when this session resumed, and permission to create an isolated baseline worktree was unavailable. The post-implementation focused and full runtime test runs passed.

- [x] **Step 3: Implement deterministic compilation**

Implement selection and deduplication using stable IDs; preserve all source/provenance fields; calculate a bounded package; record each omission and its reason. Map PLM Brain-provided impact paths/chains and narratives into `ImpactClaim`; do not infer new paths, relationships, confidence values, explanations, or links.

- [x] **Step 4: Verify compiler tests**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ContextCompilerTests`
Expected: PASS, including the budget-pressure and missing-provenance cases in Review Focus.

- [x] **Step 5: Commit**

```bash
git add OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation
git commit -m "feat: compile traceable impact context"
```

### Task 5: Add prompt governance and the Azure Model Gateway

**Files:**
- Create: `Lattice.AI.Runtime/Prompts/PromptBundle.cs`
- Create: `Lattice.AI.Runtime/Prompts/IPromptCatalog.cs`
- Create: `Lattice.AI.Runtime/Prompts/SourceControlledPromptCatalog.cs`
- Create: `Lattice.AI.Runtime/Prompts/IPromptAssembler.cs`
- Create: `Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Create: `Lattice.AI.Runtime/Prompts/engineering-impact/v1/manifest.json`
- Create: `Lattice.AI.Runtime/Prompts/engineering-impact/v1/system-policy.md`
- Create: `Lattice.AI.Runtime/Prompts/engineering-impact/v1/domain-guidance.md`
- Create: `Lattice.AI.Runtime/Prompts/engineering-impact/v1/impact-task.md`
- Create: `Lattice.AI.Runtime/Generation/IModelGateway.cs`
- Create: `Lattice.AI.Runtime/Generation/IAnswerCandidateParser.cs`
- Create: `Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs`
- Create: `Lattice.AI.Runtime.Azure/Models/AzureOpenAiModelGateway.cs`
- Create: `Lattice.AI.Runtime.Azure/Models/AiRuntimeOptions.cs`
- Create: `Lattice.AI.Runtime.Tests/Prompts/PromptGovernanceTests.cs`
- Create: `Lattice.AI.Runtime.Tests/Generation/ModelGatewayTests.cs`

**Interfaces:**
- `PromptBundle IPromptCatalog.GetRequired(string id, string version)`
- `ModelRequest IPromptAssembler.Assemble(ImpactAnswerRequest request, ContextPackage context, PromptBundle prompt, ModelConfiguration configuration)`
- `Task<ModelResponse> IModelGateway.GenerateAsync(ModelRequest request, CancellationToken cancellationToken)`
- `AnswerCandidate IAnswerCandidateParser.Parse(string content)` parses strict JSON matching the versioned output schema; malformed JSON or unknown schema fields fail explicitly.
- `ModelConfiguration` is `(string Id, string Provider, string ModelName, string DeploymentName, int MaxOutputTokens)`.
- `ModelMessage` is `(string Role, string Content)`; `ModelRequest` carries request ID, prompt bundle ID/version, Context Package ID, model configuration ID, `IReadOnlyList<ModelMessage> Messages`, and output schema version.
- `ModelResponse` includes raw structured content, provider/model/deployment version, token usage when available, duration, and request ID.
- Both `ModelRequest` and `ModelResponse` carry the exact `RuntimeRequestContext` created at API ingress; adapters must not create replacement request or trace identifiers. Context Package records the authorization decision ID, never raw grants.
- The Azure adapter uses `IChatClient` and `Azure.Identity`; no Azure-specific type appears in Runtime.Contracts.

- [x] **Step 1: Write prompt and gateway tests**

Assert source-controlled prompt versions load by exact ID/version, include required policy/domain/task sections, preserve investigation and Context Package IDs and output schema version, mark the Context Package as untrusted evidence, and never contain the signed authorization decision token. Test gateway mapping with a fake `IChatClient`, including cancellation and provider failure. Test the parser with valid output, malformed JSON, missing required claims, and unsupported schema version.

- [ ] **Step 2: Run tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~PromptGovernanceTests|FullyQualifiedName~ModelGatewayTests"`
Expected: FAIL because catalogs, assembler, and gateway are not implemented.

The pre-implementation red run was not recorded; the tests were already present when validation began. Focused post-implementation prompt/gateway tests passed (20/20).

- [x] **Step 3: Add immutable prompt bundle and assembler**

Add the `engineering-impact/v1` bundle as embedded resources or build output. Assemble instructions and the structured Context Package as separate message content; record prompt bundle ID/version and output schema version.

- [x] **Step 4: Implement the Azure gateway**

Add validated `AiRuntimeOptions` for endpoint, deployment, timeout, and token limit. Use `DefaultAzureCredential` and one configured deployment. Set explicit timeout and cancellation behavior; do not add fallback routing.

- [x] **Step 5: Verify tests**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~PromptGovernanceTests|FullyQualifiedName~ModelGatewayTests"`
Expected: PASS; cancellation and errors are surfaced, and bundle version is retained.

- [x] **Step 6: Commit**

```bash
git add OrchestrationPlatform/Lattice.AI.Runtime/Prompts OrchestrationPlatform/Lattice.AI.Runtime/Generation OrchestrationPlatform/Lattice.AI.Runtime.Azure/Models OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation
git commit -m "feat: add governed prompts and model gateway"
```

### Task 6: Implement answer validation and the impact-answer application service

**Files:**
- Create: `Lattice.AI.Runtime/Validation/IAnswerValidator.cs`
- Create: `Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Create: `Lattice.AI.Runtime/Validation/ValidationResult.cs`
- Create: `Lattice.AI.Runtime/Application/IImpactAnswerService.cs`
- Create: `Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Create: `Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs`
- Create: `Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Create: `Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`
- Create: `Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj` to add the API integration-test reference and `Microsoft.AspNetCore.Mvc.Testing`
- Modify: `Directory.Packages.props` to centrally pin the compatible `Microsoft.AspNetCore.Mvc.Testing` version
- Modify: `Directory.Packages.props` to update Swashbuckle to the .NET 10-compatible version required for `WebApplicationFactory` startup
- Modify: `Orchestration.API/Program.cs` with a public partial `Program` declaration for `WebApplicationFactory`
- Create: `Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`

**Interfaces:**
- `ValidationResult IAnswerValidator.Validate(AnswerCandidate answer, ContextPackage context, AuthorizationScope authorization, RuntimeRequestContext requestContext)`
- Task 5's `IAnswerCandidateParser.Parse` is invoked before validation; parsing/schema errors map to a rejected candidate and never reach response rendering.
- `Task<ImpactAnswerResult> IImpactAnswerService.AnswerAsync(ImpactAnswerRequest request, AuthorizationContext authorization, RuntimeRequestContext requestContext, CancellationToken cancellationToken)`
- The controller obtains one `AuthorizationContextResult` before invoking the runtime service. Return 403 immediately for `Denied`; only `Authorized(AuthorizationContext)` continues to runtime service execution. The service sequence is interpret, resolve, plan scope, retrieve, compile, assemble, generate, validate, render. Reuse that one decision for both PLM operations in this answer request.
- Pass `AuthorizationContext` only to entity resolution and evidence retrieval; pass `AuthorizationContext.Scope` to the Context Compiler and answer validator. Do not copy `PlmBrainDecisionToken` into any prompt, model request, response DTO, log, or telemetry attribute.
- `ImpactAnswerRequest` requires the caller's active `InvestigationId`; `ImpactAnswerResult` returns that investigation ID, request context, disposition, summary/impacts, source references, validation issues, and Context Package ID.
- API integration tests use `WebApplicationFactory<Program>` with test authentication and a fake policy provider to assert unauthenticated requests return 401, denied scope returns 403 without PLM calls, and authorized requests cannot override tenant/grants in the body.

- [x] **Step 1: Write validator and service tests**

Test valid evidence references are accepted; unknown claims/evidence/source IDs are rejected; unauthorized sources are denied; unresolved subjects produce clarification; missing investigation ID is rejected; empty or insufficient evidence produces abstention; malformed model JSON is rejected; and model failures propagate as explicit failures.

- [ ] **Step 2: Run tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~AnswerValidatorTests|FullyQualifiedName~ImpactAnswerServiceTests|FullyQualifiedName~ImpactAnswerAuthorizationTests"`
Expected: FAIL because validation and application services are absent.

The pre-implementation red run was not verified because these tests and implementation were present when validation began. The focused post-implementation run passed (20/20).

- [x] **Step 3: Implement deterministic answer validator**

Validate all claim IDs, entity IDs, relationship IDs, evidence IDs, and source links against the Context Package and current authorization. Return `Accept`, `Clarify`, `Abstain`, or `Reject` with structured issues; do not rely on an LLM judge for acceptance.

- [x] **Step 4: Implement the application service**

Orchestrate the defined services with cancellation and explicit disposition mapping. Never call the model after authorization denial or failed context compilation.

- [x] **Step 5: Add API endpoint and verify**

Expose `[Authorize] POST api/engineering/impact-answer`; require the active investigation ID in the request, derive `AuthorizationContextResult` from the authenticated principal and server-side policy provider, and return 403 without PLM calls for a `Denied` result. Only pass `Authorized(AuthorizationContext)` to `AnswerAsync`. The current `Program.cs` does not register an authentication scheme; use the Task 3 OIDC/JWT bearer configuration and fail closed if identity or policy configuration is missing. Never accept caller-supplied tenant, subject, grant, decision, or policy-version fields. Map clarify/abstain/failure outcomes to documented response codes and response bodies; map signer or policy-service outages explicitly rather than treating them as authorization denials. Use `WebApplicationFactory` integration tests in the runtime test project rather than the existing API test project, whose baseline compile errors currently prevent execution.

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~AnswerValidatorTests|FullyQualifiedName~ImpactAnswerServiceTests|FullyQualifiedName~ImpactAnswerAuthorizationTests"`
Expected: PASS, including unsupported-claim, unauthorized-evidence, missing-investigation, and invalid-model-output cases in Review Focus. The runtime suite passed (68/68); the API host build succeeded. The separate pre-existing `Orchestration.API.Tests` project compile errors remain out of scope.

- [x] **Step 6: Commit**

```bash
git add OrchestrationPlatform/Directory.Packages.props OrchestrationPlatform/Lattice.AI.Runtime/Validation OrchestrationPlatform/Lattice.AI.Runtime/Application OrchestrationPlatform/Orchestration.API/AI/Api OrchestrationPlatform/Orchestration.API/Program.cs OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api OrchestrationPlatform/Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj
git commit -m "feat: validate and serve engineering impact answers"
```

### Task 7: Add OpenTelemetry and Azure Monitor configuration

**Files:**
- Create: `Lattice.AI.Runtime/Telemetry/IAiRuntimeTelemetry.cs`
- Modify: `Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Create: `Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs`
- Modify: `Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `Lattice.AI.Runtime.Azure/Models/AzureOpenAiModelGateway.cs`
- Modify: `Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Modify: `Orchestration.API/Program.cs`
- Modify: `Orchestration.API/appsettings.json`
- Modify: `Orchestration.API/appsettings.Development.json`
- Create: `Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryTests.cs`
- Modify: `Lattice.AI.Runtime.Tests/Generation/ModelGatewayTests.cs`

**Interfaces:**
- Create `RuntimeRequestContext` at API ingress from a generated request ID plus the active W3C `Activity.TraceId`; if the HTTP server activity is absent, create a W3C activity before deriving the trace ID. Pass the same value to interpretation, resolution, authorization, scope planning, retrieval, context compiler, gateway, result, and telemetry. Test that the request and trace IDs remain identical end to end.
- Register runtime services through `IServiceCollection.AddAiRuntime(IConfiguration, IHostEnvironment)`.
- Add an activity source named `Lattice.AI.Runtime` and meter named `Lattice.AI.Runtime`.
- Emit stage spans and bounded-cardinality metrics for request outcome, stage duration, validation disposition, model usage, and failures.

- [x] **Step 1: Write telemetry tests**

Use an in-memory OTel listener/exporter test to assert one request emits correlated spans for authorization, both PLM operations, context compilation, model generation, and validation using the same trace ID and request ID from `RuntimeRequestContext`, with prompt/model/compiler versions and no raw prompt, evidence, bearer token, signed decision token, or decision-ticket claims.

- [ ] **Step 2: Run tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~AiRuntimeTelemetryTests`
Expected: FAIL because the runtime instrumentation is not registered.

The pre-implementation red run was not verified; telemetry tests were present when Task 7 review began.

- [x] **Step 3: Implement trace and metric instrumentation**

Add spans around each named stage; add counters/histograms with low-cardinality labels. Include safe IDs/version fields only. Do not log full question, prompt, evidence, or answer content by default.

- [x] **Step 4: Configure Azure Monitor exporter and DI**

Register `Azure.Monitor.OpenTelemetry.AspNetCore` in the API host, preserving standard `ILogger` integration. Add `AddAiRuntime` and remove new AI registrations from `Program.cs` except the composition call.

- [x] **Step 5: Verify telemetry and existing tests**

Run: `dotnet test OrchestrationPlatform.slnx`
Expected: all tests pass; in-memory telemetry assertions pass; no sensitive payload appears in captured telemetry. The focused telemetry/gateway tests passed (14/14), runtime suite passed (74/74), and API build succeeded. The solution-wide run failed only in the pre-existing `Orchestration.API.Tests` project because `Governance`, `AvailabilityState`, and `CompletenessState` are missing.

- [x] **Step 6: Commit**

```bash
git add OrchestrationPlatform/Orchestration.API/AI/Composition OrchestrationPlatform/Orchestration.API/AI/Telemetry OrchestrationPlatform/Orchestration.API/Program.cs OrchestrationPlatform/Orchestration.API/appsettings.json OrchestrationPlatform/Orchestration.API/appsettings.Development.json OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry
git commit -m "feat: instrument AI runtime with OpenTelemetry"
```

### Task 8: Add golden evaluations and CI release gates

**Files:**
- Create: `evals/engineering-impact/v1/manifest.json`
- Create: `evals/engineering-impact/v1/cases.jsonl`
- Create: `evals/engineering-impact/v1/fixtures/requirement-r123.json`
- Create: `Lattice.AI.Runtime.Evaluation/Program.cs`
- Create: `Lattice.AI.Runtime.Evaluation/IEngineeringImpactEvaluationRunner.cs`
- Create: `Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`
- Create: `Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationReport.cs`
- Modify: `Lattice.AI.Runtime.Evaluation/Lattice.AI.Runtime.Evaluation.csproj`
- Create at repository root: `.github/workflows/ai-runtime.yml`
- Create: `Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`

**Interfaces:**
- `Task<EngineeringImpactEvaluationReport> IEngineeringImpactEvaluationRunner.RunAsync(string datasetPath, CancellationToken cancellationToken)`
- Evaluation cases assert expected disposition, subject ID, required/forbidden entity and relationship IDs, evidence/source references, and authorization scenario.
- Cases include the requested `InvestigationId` and assert that missing or mismatched investigation scope, expired tickets, and revoked decisions are denied without evidence leakage.
- Offline evaluation uses deterministic PLM Brain fixtures and fake model responses. Live model evaluation remains separately gated and credentialed.

- [ ] **Step 1: Add reviewed golden cases**

Add cases for direct and multi-hop impacts, ambiguous requirement, no evidence, missing provenance, authorization denial, and context-budget pressure. Do not use production-sensitive payloads.

- [ ] **Step 2: Write failing evaluation tests**

Assert the runner reports per-case pass/fail and aggregate unsupported-claim, path coverage, link coverage, and disposition results; the test fails when a required relationship or evidence reference is missing.

- [ ] **Step 3: Run evaluation tests and verify failure**

Run: `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~GoldenEvaluationTests`
Expected: FAIL because the runner and dataset contracts are absent.

- [ ] **Step 4: Implement offline evaluation runner**

Load versioned JSONL cases, execute the application service with deterministic fakes, compare structured IDs/dispositions, and write a machine-readable report. Do not use an LLM judge as the sole gate.

- [ ] **Step 5: Wire CI gates and verify**

Run locally:

```text
dotnet test OrchestrationPlatform.slnx
dotnet run --project Lattice.AI.Runtime.Evaluation/Lattice.AI.Runtime.Evaluation.csproj -- --dataset evals/engineering-impact/v1
```

Expected: all tests pass and every required offline golden case passes; any missing required relationship/evidence, unsupported claim, or authorization failure returns a non-zero evaluation result.

- [ ] **Step 6: Commit**

```bash
git add OrchestrationPlatform/evals/engineering-impact/v1 OrchestrationPlatform/Lattice.AI.Runtime.Evaluation OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation .github/workflows/ai-runtime.yml
git commit -m "test: add engineering impact evaluation gates"
```

### Task 9: Document Azure and local developer bootstrap

**Files:**
- Create: `docs/ai-runtime/phase-1-local-setup.md`
- Create: `docs/ai-runtime/phase-1-azure-resources.md`
- Modify: `Orchestration.API/appsettings.Development.json` only if adding non-secret defaults.
- Modify: `Orchestration.API/appsettings.json` only for documented, non-secret defaults.

**Interfaces:**
- Configuration section `AiRuntime`: `Provider`, `Endpoint`, `Deployment`, `PromptBundle`, `TimeoutSeconds`, and `MaxOutputTokens`.
- Environment overrides use standard .NET double-underscore syntax: `AiRuntime__Endpoint`, `AiRuntime__Deployment`, `AiRuntime__PromptBundle`.
- API identity and PLM trust settings use `Authentication__Authority`, `Authentication__Audience`, `AuthorizationDecision__Issuer`, `AuthorizationDecision__Audience`, `AuthorizationDecision__KeyId`, `AuthorizationDecision__DefaultTtlSeconds` (default `60`), `AuthorizationDecision__RevocationMode`, `PlmBrain__BaseUrl`, `PlmBrain__WorkloadTokenScope`, and `PlmBrain__DecisionJwks`. The frontend PLM service receives configured workload issuer/audience/JWKS, decision issuer/audience/trusted JWKs, and revocation-check settings.
- Azure production uses managed identity and Azure Monitor connection configuration; local use relies on the supported Entra developer sign-in flow.

- [ ] **Step 1: Document local setup**

Describe SDK requirement, restore/build/test commands, developer identity login, local configuration, ephemeral test keys versus production signing keys, short-lived decision-ticket behavior, fake-model default tests, and how to opt into credentialed model integration tests. State that local configuration without an authorization decision provider must fail closed.

- [ ] **Step 2: Document Azure provisioning**

List the approved Azure AI Foundry/Azure OpenAI deployment, Entra API issuer/audience and application role, API managed identity for PLM service calls, Key Vault asymmetric decision-signing key and public JWK distribution/rotation, the production server-side authorization-decision provider, optional revocation checker configuration, Azure Monitor/Application Insights configuration, and private network ingress for the internal PLM routes. Document the one-minute default authorization-ticket TTL and fail-closed expiry/revocation behavior. State that data-handling, region, identity, authorization-provider, network, and model deployment approval are prerequisites to sending client data.

- [ ] **Step 3: Review secrets and configuration**

Verify no API key or secret is committed; verify endpoint/deployment names are configuration and not treated as credentials.

- [ ] **Step 4: Commit**

```bash
git add OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md OrchestrationPlatform/docs/ai-runtime/phase-1-azure-resources.md OrchestrationPlatform/Orchestration.API/appsettings.json OrchestrationPlatform/Orchestration.API/appsettings.Development.json
git commit -m "docs: add AI runtime Phase 1 bootstrap guide"
```

## Self-Review

- **Spec coverage:** Project layout/framework, first-class request tracing, required active investigation scope, private versioned TypeScript PLM evidence service, OIDC API authentication, workload identity, signed one-minute-default authorization decisions, optional revocation checks, Context Compiler, prompt governance, Azure model gateway, answer validation, evaluation infrastructure, OpenTelemetry/Azure Monitor, package/config bootstrap, and future extension boundaries have dedicated tasks.
- **Framework decision:** The existing API alone is retargeted to supported .NET 10 LTS by default because its current .NET 9 target is out of support; hosting/CI compatibility is checked first, and unrelated projects are not upgraded.
- **Review Focus coverage:** ambiguity is tested in Tasks 3 and 6; missing or blank investigation ID in Tasks 3 and 6; denied/mismatched authorization and wrong investigation in Task 3; expired/revoked decision and revocation-check failure in Task 3; missing provenance in Tasks 4 and 8; context budget in Task 4 and Task 8; malformed/unsupported answer output in Tasks 5, 6, and 8; request/trace propagation through the service boundary in Tasks 3 and 7.
- **Scope control:** No document parser, embedding generator, vector store, MCP transport, agent framework, model router, or broad response cache is installed in Phase 1.
- **Contract consistency:** Tasks 2 and 3 define shared DTOs, including required `InvestigationId` on requests, retrieval results, and Context Packages; Tasks 3–8 consume them. Azure-specific client types remain in `Lattice.AI.Runtime.Azure` or API-host adapters.
- **Worktree caution:** The repository currently has unrelated modified and untracked files. In particular, `frontend/package.json` and `frontend/package-lock.json` already contain an unrelated `zwitch` addition; when Task 3 adds direct `jose`, stage only the `jose` hunk and leave `zwitch` changes unstaged. Stage explicit new Task 3 source/test files rather than whole frontend directories so unrelated untracked proof files and tests are not included.
- **Integration boundary:** The proven producer is TypeScript and enriches investigation snapshots through `ensureInvestigationKnowledgeGraph`; the current public GET route is unauthenticated and is not used by the runtime. Task 3 adds protected versioned internal routes over that producer; it must not port or recreate PLM Brain resolution, ontology, paths, or chains.
- **Authorization provider precondition:** The platform has not selected or exposed the production server-side policy provider. Task 3 must fail closed when it is missing; the endpoint rollout remains blocked until the provider, identity configuration, signing-key rotation, and service network restriction are configured and tested.

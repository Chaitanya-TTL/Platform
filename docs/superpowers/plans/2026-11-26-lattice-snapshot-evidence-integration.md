# Lattice Snapshot Evidence Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver every authorized, source-lineaged candidate present in a Lattice investigation to the unified AI runtime and return source-evidence answers with citations across all represented applications.

**Architecture:** Project source-authored fields from the accepted Lattice snapshot through a protected internal route, adapt them to the runtime's typed source-evidence contract, and approve/stage them with graph, fact, and application candidates through `ContextCompiler`. Keep exact facts and application participation typed separately; the model may explain passages but may not promote them to PLM Brain graph claims.

**Tech Stack:** TypeScript/Next.js Lattice routes and snapshot contracts; C#/.NET 10 runtime, contracts, adapters, and xUnit tests; Vitest for frontend tests.

**Spec:** `docs/superpowers/specs/2026-11-26-lattice-snapshot-evidence-integration-design.md`

## Global Constraints

- PLM Brain remains authoritative for entities, relationships, impact paths, and impact chains.
- `ContextCompiler` is the only context-approval boundary; `PromptAssembler` is a rendering layer.
- Reuse the existing investigation-level `investigation:read-impact-evidence` Lattice decision for source passages.
- Process every eligible candidate; do not add a global top-k, confidence cutoff, or application-level result cap.
- Preserve every approved candidate across stages that fit the configured model input/output limits.
- Require verifiable source lineage and authorization; report unprojectable fields and partial source operations rather than fabricating provenance or claiming complete coverage.
- Preserve stale-source temporal metadata; do not present stale evidence as current.
- Prompt examples are question shapes, not evidence about the active investigation.

## Review Focus

- **A broad investigation request has no resolved subject:** retrieve all eligible snapshot records rather than skipping source retrieval. Test in Task 3.
- **A snapshot field has no field-level source authority or native provenance:** do not cite it as source-authored; record why it was not projected. Test in Task 1.
- **A field has multiple metadata candidates or citation values:** preserve each distinct source-lineaged candidate; do not silently collapse distinct provenance. Test in Task 1.
- **A passage is stale or the source operation is partial:** preserve its temporal/operation status and prevent a currentness claim without discarding it solely for staleness. Tests in Tasks 1 and 4.
- **The investigation contains more approved candidates than fit in one model request:** stage all candidates and preserve their citations in the final answer. Test in Task 5.

---

## File map

- Modify `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.ts` and its test: project all eligible source-lineaged text fields and expose explicit projection diagnostics.
- Create `OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/source-evidence/route.ts` and route tests: return the investigation-bound source projection only after the existing internal service and Lattice decision checks.
- Modify `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceRecords.cs` and source-evidence plan/query contracts: allow an absent subject for investigation-wide requests and preserve temporal metadata.
- Modify `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainClient.cs`; create a `PlmBrainSourceEvidenceRetriever`; update `AiRuntimeServiceCollectionExtensions.cs`: call the protected route and register the production adapter instead of the unavailable adapter.
- Modify `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs` and `Application/ImpactAnswerService.cs`: request source evidence for broad investigations and retrieve it without requiring a resolved subject.
- Modify `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`, `Validation/AnswerValidator.cs`, and prompt rendering only as needed: preserve passage temporal metadata and avoid unconditional stale-passage rejection.
- Add/update focused frontend route/projection tests and .NET adapter/service/compiler/validator tests.
- Preserve existing source-evidence contracts, answer schema, and frontend citation mapping unless tests expose a directly coupled mismatch.

### Task 1: Project Every Source-Lineaged Snapshot Field

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.test.ts`

**Interfaces:**
- Consumes: `InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>`, `IntelligenceEntity.properties`, and `sourceFieldMetadata`.
- Produces: `projectSourceEvidence(snapshot): SourceEvidenceProjectionBatch`, with every eligible text field represented by one stable record and an explicit exclusion reason for fields that cannot be safely presented as source-authored.

- [x] **Step 1: Add projection tests** for source-lineaged text from Codebeamer, Configit, Windchill, SAP, and Teamcenter; assert each field retains application, native record, source field/location, revision, timestamps/freshness, provenance, authority, citation linkage, and stable identity.
- [x] **Step 2: Add tests** for multiple distinct metadata candidates on one entity, missing field lineage, non-source authority, missing native identity, stale fields, and partial source operations; assert no eligible candidate disappears without a diagnostic reason.
- [x] **Step 3: Run the focused projection test** from `OrchestrationPlatform/frontend`; verify new cases fail for the existing narrow allowlist and empty evidence IDs.
- [x] **Step 4: Extend the projection** to enumerate source-authored field metadata for every represented source application. Require source-authoritative field provenance and native identity; use the existing stable record identity as passage/evidence identity. Keep extracted text out of diagnostics.
- [x] **Step 5: Run the focused projection test** and verify all eligible candidates and diagnostics match the assertions.

### Task 2: Expose the Projection Through the Protected Lattice Route

**Files:**
- Create: `OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/source-evidence/route.ts`
- Test: route-level test adjacent to the new route
- Reference: `OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/investigation-evidence/route.ts`

**Interfaces:**
- Consumes: investigation ID, requested application/entity/identifier filters, service identity, and the existing signed Lattice authorization-decision headers.
- Produces: a versioned response containing `investigationId`, `snapshotRevision`, `authorizationDecisionId`, `requestId`, `traceId`, source projection records, source completeness/operation status, and projection diagnostics.

- [x] **Step 1: Add route tests** for missing service identity, invalid/expired/mismatched Lattice decision, request correlation mismatch, missing/archived/revision-mismatched snapshot, and successful authorized projection.
- [x] **Step 2: Run the focused route tests** and verify authorization and snapshot cases fail as expected.
- [x] **Step 3: Implement the POST route** using `authorizeImpactEvidenceRequest` with the existing `investigation:read-impact-evidence` grant; verify authorization before loading/projecting source text.
- [x] **Step 4: Return all eligible projected records** for broad requests; apply only explicitly requested source/entity/identifier filters and include completeness and projection diagnostics.
- [x] **Step 5: Run focused route tests** and the existing internal evidence-route tests.

### Task 3: Connect Investigation-Wide Runtime Retrieval

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceRecords.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/SourceEvidencePlan.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainClient.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainSourceEvidenceRetriever.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Test: focused source-evidence adapter, planner, and service tests

**Interfaces:**
- Consumes: the protected route response from Task 2 and the existing `SourceEvidenceQuery`.
- Produces: `ISourceEvidenceRetriever.RetrieveAsync(SourceEvidenceQuery, CancellationToken)` returning a fully bound `SourceEvidenceRetrievalResult`; `SourceEvidenceQuery.Subject` may be null for an investigation-wide request.

- [x] **Step 1: Add failing tests** proving broad investigation questions create a requested source-evidence plan with no subject and empty entity/application filters, while subject-specific questions retain their explicit scope.
- [x] **Step 2: Add failing adapter tests** proving all records from the route are mapped, response decision/revision/request/trace are preserved, and mismatched investigation or request binding is surfaced as an error.
- [x] **Step 3: Run the focused planner and adapter tests** and verify broad requests are currently skipped and the production DI binding is unavailable.
- [x] **Step 4: Extend `SourceEvidenceQuery` for a nullable subject** and add a `PlmBrainClient` source-evidence method that calls the protected route with the signed decision and request correlation.
- [x] **Step 5: Implement `PlmBrainSourceEvidenceRetriever`** to map every response record to a `SourceEvidencePassage`, preserving source text, stable IDs, temporal metadata, provenance, authorization decision, and deep links.
- [x] **Step 6: Update `ScopePlanner` and `ImpactAnswerService`** so a broad investigation source-evidence plan is requested and retrieved even when entity resolution has no subject.
- [x] **Step 7: Register the production retriever** in DI; do not fall back to `UnavailableSourceEvidenceRetriever` for a configured Lattice route.
- [x] **Step 8: Run focused adapter, planner, and service tests**; assert every projected candidate reaches the compiler input.

### Task 4: Preserve Temporal Evidence Without Misstating Freshness

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceRecords.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs` and `Prompts/engineering-impact/v2/impact-task.md` only if temporal fields are not already rendered
- Test: source-evidence compiler, validator, and prompt tests

**Interfaces:**
- Consumes: source timestamps, effective/valid dates, freshness, and snapshot lifecycle from the Lattice projection.
- Produces: approved source passages with temporal metadata available to the model and citation mapper.

- [x] **Step 1: Add failing tests** for a stale source passage retained with its timestamps, a current passage, and a model answer that must not describe a stale passage as current.
- [x] **Step 2: Run the focused compiler, validator, and prompt tests** and verify the current unconditional stale rejection is exposed.
- [x] **Step 3: Extend the passage contract and prompt context** to carry the source timestamp/effective/valid interval fields supplied by Lattice.
- [x] **Step 4: Remove unconditional rejection based only on `Freshness != current`**; retain investigation, snapshot, provenance, and authorization checks. Require the answer to state supplied freshness/temporal status rather than silently discarding historical material.
- [x] **Step 5: Run focused temporal compiler, validator, and prompt tests** and verify stale and current citations remain distinguishable.

### Task 5: Verify Complete Staging and Copilot Citation Delivery

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts` only if response mapping needs adjustment

**Interfaces:**
- Consumes: the complete typed evidence ledger from Tasks 1–4 and the existing `answer-v2` source-evidence assertion.
- Produces: a tested end-to-end offline path where broad requests include all staged application candidates and source-passage-only answers return resolving citations.

- [x] **Step 1: Add an end-to-end test** with multiple source-lineaged candidates across all five represented applications and a model input budget requiring multiple stages; assert every eligible candidate appears in exactly one stage or has a specific provenance/authorization/correctness omission.
- [x] **Step 2: Add a Copilot mapping test** proving a source-evidence-only assertion retains the source explanation and resolves its citation without a deep link.
- [x] **Step 3: Run the focused .NET and Vitest cases** and verify the tests fail if a candidate or citation is lost.
- [x] **Step 4: Fix only stage-accounting or response-mapping defects exposed by these tests**; preserve the distinction between graph claims, exact facts, participation, and source passages.
- [x] **Step 5: Run the full runtime suite** from repository root:

```powershell
dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --no-restore
```

- [x] **Step 6: Run the Copilot tests** from `OrchestrationPlatform\frontend`:

```powershell
npm test -- features\lattice-next\copilot\tests
```

- [x] **Step 7: Run focused frontend lint and `git diff --check`; report live-provider/manual evaluation separately from passing offline tests.**

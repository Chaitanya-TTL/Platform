# Impact Answer Evidence Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing impact-answer runtime to combine PLM Brain claims, deterministic facts, Product 360 application context, and source passages through one `ContextCompiler`-approved package.

**Architecture:** Keep impact-intent turns on the existing authenticated .NET route. Project snapshot-backed fact and application-context candidates separately from graph claims and source passages; retrieve them under the existing authorization/scope; compile, render, validate, and cite them through the current runtime and Copilot response path. Use fixture-backed providers until a trusted production data source and approvals exist.

**Tech Stack:** .NET 10, existing `Lattice.AI.Runtime` contracts and xUnit tests, TypeScript/Next.js, existing Vitest tests, synthetic source-evidence fixtures.

**Spec:** [2026-11-24-impact-answer-evidence-integration-design.md](../specs/2026-11-24-impact-answer-evidence-integration-design.md). Preserve the previously approved [Lattice Investigation RAG plan](2026-11-19-lattice-investigation-rag.md), especially its Task 7–9 behavior and Task 12 production gates.

## Global Constraints

- PLM Brain remains authoritative for canonical entities, governed relationships, impact paths, and impact chains.
- Deterministic facts, application participation, and source passages remain distinct candidate types; none may create a graph relationship or bypass `ContextCompiler`.
- `ContextCompiler` is the sole context-approval boundary. `PromptAssembler` renders approved context; `AnswerValidator` validates supported claims and citations.
- The first delivery remains impact-intent only. Non-impact intents retain the existing legacy route.
- Use the accepted revisioned `InvestigationSnapshot` wrapper for projections; never accept browser-supplied snapshot or source text as evidence.
- Use synthetic fixtures and test fakes. Do not add a production index, embedding provider, live source API, or full-document extraction.
- Preserve exact value, source-field lineage, dimensions, units, time scope, provenance, authority, completeness, and citation references.
- Keep existing configured context/model budgets. Do not add speculative confidence thresholds, caps, filters, refusals, or clarification loops.
- Preserve the current dirty worktree. Do not revert, stage, or commit unrelated user changes or the copied prototype wholesale. On files already modified before a task, stage only that task's hunks; if they cannot be separated safely, stop before committing and ask the user.

## Omission and Exclusion Rationale

- Omit a fact without stable field lineage, source provenance, or a current authorization binding: otherwise a value could be attributed to the wrong record or disclosed outside its approved scope. Those are real provenance and data-leakage risks; the compiler cannot safely approve such a value without the missing binding. The tradeoff is that some potentially useful values remain unavailable until their source adapter supplies lineage.
- Omit a candidate bound to a different investigation, snapshot revision, request, or authorization decision: accepting it could mix stale or cross-request evidence into an answer. Omit only the mismatched candidate and preserve independent PLM claims; the tradeoff is loss of that candidate's detail.
- Omit a fact without a stable field identity, source-native record, evidence IDs, citation IDs, or matching provenance: without those links, an exact value cannot be reliably attributed or inspected. This is a real provenance/correctness risk rather than a relevance preference; the tradeoff is that a potentially useful value stays unavailable until its adapter supplies the missing lineage.
- Omit an exact-value assertion that differs from the compiled source value, or cites evidence/citations not attached to that fact: otherwise the answer can alter a value or borrow support from another source. Exact equality and fact-local citation checks are necessary to preserve source fidelity; the tradeoff is that the model cannot reformat a value in its assertion and must leave unsupported facts out.
- Omit application-context assertions that do not identify a unique compiled participation candidate and its own evidence/citations: participation is useful background but is not a relationship, so borrowing another candidate's evidence could imply unsupported cross-application coverage. The tradeoff is that only source-linked participation is surfaced, never converted into an impact path.
- Do not promote shared application participation to an entity identity, direct relationship, or impact claim: shared investigation membership does not establish those facts. The tradeoff is that the answer may describe traceability/background rather than a simpler but unsupported dependency.
- Do not choose between fact candidates that conflict in value, dimensions, or temporal scope unless the source supplies an authoritative resolution: arbitrary ranking would create a false exact answer. Preserve the conflict for explanation or verification; the tradeoff is that the runtime may not give a single value.

## Review Focus

- **A fact or passage is bound to another investigation, snapshot revision, request, or authorization decision:** test that the compiler omits the mismatched candidate and preserves independently valid PLM claims.
- **A partial source operation has entities marked current:** test that source-operation completeness remains distinct from entity freshness and is represented accurately.
- **Cross-application participation is mistaken for identity or an engineering relationship:** test that Product 360 participation can support background context only and adds no PLM relationship, path, or impact claim.
- **The same requested field has incompatible values, dimensions, or temporal scope:** test that discovery reports the conflict instead of selecting a value by arbitrary ranking.
- **Fact or RAG retrieval is empty, unavailable, or fails:** test that a valid graph-only answer remains available, with no unsupported fact or RAG-only impact assertion.

---

### Task 1: Align Versioned Fact and Application-Context Contracts

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/EngineeringFactEvidence.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/ApplicationParticipationEvidence.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/FactEvidencePlan.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ApplicationContextPlan.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ScopePlanningResult.cs`
- Rename and modify: `OrchestrationPlatform/frontend/features/lattice-next/contracts/factual-evidence-v1.ts` (the copied file's existing imports already use this path)
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/contracts/intelligence-v1.ts` (add optional source-field lineage metadata used by fact candidates)
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Contracts/RuntimeContractTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceContractTests.cs`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/contracts/factual-evidence-v1.test.ts`

**Interfaces:**
- `EngineeringFactEvidence` carries fact/investigation/revision IDs; canonical and source entity IDs; source application/record/revision; field ID/name/display label; exact JSON value and type; optional normalized value/type; dimensions, unit/currency/precision; observation and validity times; freshness/completeness/derivation metadata; transformation trace; evidence/citation IDs; authority/provenance; and authorization-decision ID.
- `ApplicationParticipationEvidence` carries investigation/revision, application, source-operation status, validated canonical entity IDs, evidence/citation IDs, provenance, and authorization-decision ID. It contains no relationship or impact-path assertion.
- `FactEvidencePlan` carries `Requested`, validated `LinkedEntityIds`, `SourceApplications`, `FieldIds`, `ExactIdentifiers`, and a reason code. It is an extension of the existing `ScopePlanner`, not a second planner.
- `ApplicationContextPlan` carries `Requested`, validated `LinkedEntityIds`, `SourceApplications`, and a reason code; it does not add a relationship scope.
- `FactEvidenceQuery`/`FactEvidenceRetrievalResult` and `ApplicationContextQuery`/`ApplicationContextRetrievalResult` bind candidates to investigation, revision, request/trace, and authorization decision; keep the two query/result pairs in their respective evidence contract files.
- TypeScript and .NET serialization must use one versioned JSON shape; external-facing provenance must be typed rather than `unknown`.

- [x] **Step 1: Write failing contract tests** for exact string/numeric/boolean values, normalized values, dimensions and units, time/freshness/completeness, provenance/citations, and application participation serialization without relationship fields.
- [x] **Step 2: Run focused contract tests**:
  - `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~RuntimeContractTests|FullyQualifiedName~SourceEvidenceContractTests"`
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/contracts/factual-evidence-v1.test.ts`
  Expected: FAIL because the cross-runtime fact and participation contract is not aligned.
- [x] **Step 3: Define the typed .NET records and align the versioned TypeScript contract** to those fields. Preserve exact values in JSON form; keep display normalization separate and versioned.
- [x] **Step 4: Run the focused contract tests** and verify round-trip values and enums match across both implementations.
- [x] **Step 5: Keep all work uncommitted and unstaged for the user's planned selective review.**

### Task 2: Project Snapshot Facts and Product 360 Participation Candidates

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/factual-retrieval/structured-fact-projection.ts`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/factual-retrieval/structured-fact-projection.test.ts`
- Modify only if required: `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.ts`
- Reference, do not wholesale copy: `OrchestrationPlatform/frontend/features/lattice-next/copilot/factual-retrieval/` and `application-inventory.ts`
- Keep the projection beside its Copilot-owned source adapters so the kernel does not depend on Copilot; reuse the kernel's accepted-snapshot guard.

**Interfaces:**
- `projectStructuredFacts(snapshot: InvestigationSnapshot<unknown>): StructuredFactProjectionBatch` consumes the accepted snapshot wrapper and returns versioned fact candidates, source-operation/completeness metadata, and omission diagnostics.
- `projectApplicationParticipation(snapshot: InvestigationSnapshot<unknown>): readonly ApplicationParticipationCandidateV1[]` returns unbound source-participation candidates tied to selected canonical entities and accepted source evidence; authorization binding is added only by the backend retriever, and candidates do not produce relationship claims.
- Reuse field-registry/source-adapter concepts from the copied prototype only where the accepted canonical snapshot includes a stable source field identity and provenance. The projection is a pure transformation; it does not call an index or external provider.
- This projection supplies the versioned fixture/evaluation inputs for the first runtime slice. It is not a production source provider and must not be sent from a browser or treated as runtime-approved evidence.

- **Projection rule rationale:** Require the canonical revision to match the current investigation revision and require exact selected source/native-ID matches to prevent stale or unrelated records from entering the candidate set; the tradeoff is that unmatched records do not contribute participation context. Link citations only through accepted evidence IDs with an exact source and artifact-reference match to prevent unsupported provenance; the tradeoff is that a fact value may remain a candidate but cannot be cited until its evidence is accepted. Require field-specific provenance for metadata candidates because a canonical entity may combine fields from multiple source applications, so entity-level provenance may name the wrong native record; the tradeoff is that unbound fields stay unavailable even when the parent entity has provenance. Keep unsupported applications and fields as diagnostics rather than inventing mappings; the tradeoff is reduced exact-fact coverage until a source registry exists. These rules do not add confidence cutoffs or result caps.

- [x] **Step 1: Write failing projection tests** for exact raw values and types, normalized display values and transformation trace, dimensions/units, source-field lineage, revision/time scope, partial source status, missing provenance, unsupported fields, and application participation that cannot be interpreted as a direct relationship.
- [x] **Step 2: Run the focused frontend test**:
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/factual-retrieval/structured-fact-projection.test.ts`
  Expected: FAIL because the projection is not implemented.
- [x] **Step 3: Implement the pure snapshot projector** using the accepted wrapper and typed per-source field registration. Keep data not represented with source lineage out of the fact result; record why it was not projected.
- [x] **Step 4: Run the focused test** and verify stable repeated projection for the same snapshot revision and preservation of partial/freshness distinctions.
- [x] **Step 5: Keep all work uncommitted and unstaged for the user's planned selective review.**

### Task 2 extension: Project all trusted snapshot-backed fields

The user clarified that field coverage should span applications and selected all fields that already have trusted lineage in accepted snapshots. Public vendor documentation does not define one universal field catalog: Windchill domains are installation-specific, Codebeamer fields can vary by tracker/project, SAP's public API catalog requires authentication and this repository uses a JCo-specific output contract, and Configit's detailed API documentation is access-controlled.

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/factual-retrieval/metadata-backed-fact-adapter.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/factual-retrieval/structured-fact-projection.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/factual-retrieval/structured-fact-projection.test.ts`

**Interfaces and behavior:**
- Keep existing source registries as the richer semantic mappings where they apply.
- For any other source-field candidate in an accepted snapshot, preserve its exact source value and source field name; derive a stable field ID from source application, native record kind, and source field name; use only the generic value type inferable from the JSON value; and retain supplied dimensions, time scope, transformations, and field-level provenance.
- Apply this metadata-backed path to all source applications represented by the intelligence contract, including SAP. Do not invent vendor-wide fields, aliases, units, labels, or semantics that are absent from accepted metadata.
- A field-specific source provenance and authority are required because a canonical entity can combine fields from different applications and records. Missing lineage remains an omission with a diagnostic; an uncited candidate remains citation-ineligible.
- The generic path must not duplicate a fact already emitted by a registered adapter.

- **Rule rationale:** Projecting unknown-but-lineaged fields prevents useful exact source values from being silently lost merely because a static registry does not enumerate a configured field. The risk is real because the official schemas are instance/project-specific and the current adapters cover only a subset. The metadata path is necessary to support configured fields without waiting for a universal registry that does not exist. The tradeoff is that unmapped fields retain technical source names and generic types rather than receiving guessed friendly labels or domain semantics.
- [x] **Step 1: Write failing tests** for an unregistered field from Codebeamer and SAP, preserving exact value, type, scope, provenance, and citations; verify missing field provenance is still omitted and registered fields are not duplicated.
- [x] **Step 2: Run the focused frontend projection test**:
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/factual-retrieval/structured-fact-projection.test.ts`
- [x] **Step 3: Implement the generic metadata-backed adapter** and connect it after registered adapters in the pure accepted-snapshot projection.
- [x] **Step 4: Run the focused projection test** and verify all contract-supported source applications can contribute any field with accepted, field-specific lineage without changing graph relationships.
- [x] **Step 5: Keep all work uncommitted and unstaged for the user's planned selective review.**

### Task 3: Add Authorized Runtime Retrieval Seams for Facts and Participation

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/FactEvidence/IFactEvidenceRetriever.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/FactEvidence/UnavailableFactEvidenceRetriever.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/ApplicationContext/IApplicationContextRetriever.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/ApplicationContext/UnavailableApplicationContextRetriever.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/FactEvidence/FakeFactEvidenceRetriever.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ApplicationContext/FakeApplicationContextRetriever.cs`

**Interfaces:**
- `IFactEvidenceRetriever.RetrieveAsync(FactEvidenceQuery query, CancellationToken cancellationToken): Task<FactEvidenceRetrievalResult>`.
- `IApplicationContextRetriever.RetrieveAsync(ApplicationContextQuery query, CancellationToken cancellationToken): Task<ApplicationContextRetrievalResult>`.
- Both queries carry the same validated investigation, linked entity IDs, source-application scope, authorization context, request/trace context, and snapshot/source version needed to bind returned candidates.
- `ScopePlanner` is the sole planner. It requests facts only when the impact turn contains a resolvable structured-field need and requests application participation only when needed to answer the impact question. It does not interpret source filters as graph filters.
- The API registers explicit unavailable providers until an approved server-owned fact/context source exists. Tests inject fakes; there is no browser-supplied candidate payload or production success-shaped fallback.

- [x] **Step 1: Write failing service tests** proving both providers are called only after authorization, subject resolution, scope planning, and authoritative PLM retrieval; each receives the validated scope and same decision/request context; and empty/unavailable providers preserve graph answers.
- [x] **Step 2: Run the focused service tests**:
  - `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ImpactAnswerServiceTests`
  Expected: FAIL because the fact and participation providers are not injected.
- [x] **Step 3: Add the typed plans, provider interfaces, explicit unavailable implementations, and fake-backed `ImpactAnswerService` calls.** Bind results to the current request and do not let either provider add canonical identity or graph relationships. Surface retrieval failures through the existing diagnostics/telemetry path; do not add a broad catch or silently present a failed channel as successful.
- [x] **Step 4: Run the focused service tests** and verify PLM-only behavior remains unchanged when either candidate channel is empty or unavailable.
- [x] **Step 5: Keep all work uncommitted and unstaged for the user's planned selective review.**

### Task 4: Compile, Render, and Validate Distinct Evidence Types

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompilationInput.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`

**Interfaces:**
- `ContextPackage` exposes separate `EngineeringFacts` and `ApplicationParticipation` collections alongside existing graph claims, sources, and source passages.
- `ContextCompilationInput` accepts the bound fact and participation retrieval results in addition to the existing `SourceEvidence` result.
- `AnswerFactAssertion(string FactId, JsonElement ExactValue, IReadOnlyList<string> EvidenceIds, IReadOnlyList<string> SourceIds)` is separate from `AnswerImpact`; `AnswerCandidate` and `ImpactAnswerResult` carry these fact assertions independently so an exact field value cannot be represented as a PLM relationship claim. Add a similarly source-bound context assertion only if the existing response contract needs to surface application participation.
- `ContextOmissionKind` identifies fact and application-context omissions separately. Existing configured context budgets remain the only size limits.

- [x] **Step 1: Write failing compiler, prompt, and validator tests** for accepted fact+graph+passage packages, wrong-revision/decision facts, conflicting fact identities/values, partial-source metadata, application participation with no relationship promotion, fact assertions citing only compiled fact sources, and retained graph claims when candidates are omitted.
- [x] **Step 2: Run focused .NET tests**:
  - `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~ContextCompilerTests|FullyQualifiedName~PromptAssemblerTests|FullyQualifiedName~AnswerValidatorTests"`
  Expected: FAIL because the package and answer contracts do not carry distinct fact assertions.
- [x] **Step 3: Extend the package, compiler, prompt, parser, and validator.** The compiler alone approves candidates; the assembler renders exact values and application participation as evidence data; the validator checks fact IDs/source citations against the compiled package without planning or ranking candidates.
- [x] **Step 4: Run the focused .NET tests** and confirm invalid candidate evidence cannot remove or weaken independent PLM claims.
- [x] **Step 5: Keep all work uncommitted and unstaged for the user's planned selective review.**

### Task 5: Preserve Fact and Product Context Through the Existing Copilot Route

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts`

**Interfaces:**
- Extend the existing runtime response mapping with separately typed fact assertions and citations to their compiled sources.
- Keep one assistant response and the existing transcript/citation UI. Do not add another route or call `factual-serving-shadow` from the product turn.
- The impact route remains gated by its existing rollout configuration. Non-impact prompts continue through the existing legacy path.

- [x] **Step 1: Write failing mapping and route tests** for a graph impact plus exact fact in one response, source/application participation citations, unknown fact/source IDs, one persisted assistant turn, and unchanged non-impact routing.
- [x] **Step 2: Run focused frontend tests**:
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts`
  Expected: FAIL because the runtime response does not yet map the new assertion types.
- [x] **Step 3: Extend the existing response mapping and citation packet** without exposing raw retrieval scores, embeddings, or authorization material.
- [x] **Step 4: Run the focused frontend tests** and verify citations remain inspectable after transcript reload.
- [x] **Step 5: Keep all work uncommitted and unstaged for the user's planned selective review.**

### Task 6: Evaluate the Combined Slice and Selectively Integrate Branch Work

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
- Modify only as required: `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/source-evidence/`
- Update: `docs/superpowers/plans/2026-11-19-lattice-investigation-rag.md` to record completed integration and remaining production gates

**Interfaces:**
- Compare matched PLM-only, PLM+facts, PLM+RAG, and combined cases. RAG-only remains diagnostic, not a production response mode.
- Preserve graph claim/path identity across evidence variants; evaluate exact value and citation correctness separately from retrieval relevance and answer quality.
- Port only the Product 360 participation/context behavior that is represented by typed, cited candidates and passes through `ContextCompiler`. Do not merge `compare-factual-serving` wholesale or import its independent answer validation/composition path.

- [x] **Step 1: Add failing evaluation cases** for useful exact source values, useful application participation, useful source passages, PLM-sufficient answers with no extra candidates, partial coverage, conflicting values/revisions, and instruction-like passage text.
- [x] **Step 2: Run focused tests**:
  - `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~GoldenEvaluationTests`
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
  Expected: FAIL for missing fact/context evaluation cases.
- [x] **Step 3: Add synthetic expected facts, citations, and application context** without adding live payloads or changing the existing R-123 graph fixture semantics.
- [x] **Step 4: Run all focused .NET and frontend tests from Tasks 1–6.** Record measured comparative outputs; do not claim production-corpus improvement or create numerical acceptance thresholds without approved held-out data.
- [x] **Step 5: Review the selective diff and keep all work uncommitted and unstaged for the user's planned selective review.** Keep production index/source-body work blocked behind the approvals in the existing RAG plan.

## Implementation Notes

- The copied `factual-retrieval/` and `retrieval/` directories are prototypes and currently are not connected to the main Copilot turn. Reuse tested concepts and registries; do not add them as a parallel production route.
- The existing RAG plan records Task 7–9 code/test work in the current dirty worktree. At implementation start, run their focused test commands before modifying those files; preserve unrelated in-progress edits and resolve only failures attributable to this integration.
- Passing fixture tests demonstrate contract, compilation, response, and citation behavior. They do not prove live retrieval, authorization-provider readiness, source coverage, or real user answer improvement.
- Do not commit or merge during this pre-merge implementation; the user requested a review summary before the later selective merge.

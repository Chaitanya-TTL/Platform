# Unified Copilot Evidence Integration Implementation Plan

> **Execution:** Native implementation in the current session, as selected by the user.

**Goal:** Substantially improve Copilot answer quality by combining factual-serving and Product 360 capabilities with the existing AI runtime, while ensuring all authorized investigation evidence reaches the model through one traceable backend flow.

**Architecture:** Route impact, broad-summary, exact-fact, application-inventory, and document questions through one authenticated server-side answer orchestrator. Source adapters return typed fact, application-digest, PLM Brain graph, and document-evidence candidates; one replaceable compiler validates them and creates a complete evidence ledger plus provider-window-sized stages. The model processes every authorized stage, and the final answer is validated against the complete approved ledger.

**Tech Stack:** C#/.NET, Next.js/TypeScript, Vitest, xUnit, Azure OpenAI, existing PLM Brain and investigation snapshot services.

**Spec:** `OrchestrationPlatform/frontend/.lattice-data/lattice_jsons/branch-comparison-report.txt` and the user-approved architecture and staged-processing decision in this conversation.

## Global Constraints

- PLM Brain remains authoritative for canonical entities, relationships, impact paths, and impact chains.
- Deterministic facts retain exact source values, field lineage, dimensions, units, temporal scope, provenance, authority, and citations.
- Product 360 participation and application digests must not create or imply PLM Brain relationships.
- Source-document evidence supports explanations and citations; it does not replace exact facts or graph authority.
- Use one server-side evidence-approval boundary. Prompt assembly only renders approved evidence; answer validation checks support.
- Do not silently drop authorized evidence because of arbitrary item counts, character budgets, score cutoffs, or confidence thresholds. Process all approved candidates in stages.
- The provider's actual per-call context window is a technical limit, not a content-selection policy. Use provider-compatible token accounting and continue with additional stages until the evidence set is accounted for.
- Do not impose application-level request, history, answer-claim, or output truncation limits without a demonstrated security, transport, correctness, or provider requirement. Never silently truncate user questions or evidence.
- Keep restrictions only for demonstrated authorization, data-leakage, provenance, correctness, provider, or measured operational requirements. Report every exclusion with its reason.
- Do not trust client-computed facts as authoritative. Read evidence from server-owned investigation/source services under the current authorization decision.
- Preserve stale evidence for historical/as-of questions when its temporal scope and provenance support the question. Do not present stale evidence as current.
- Do not mark retrieval complete when a provider/index is unavailable. Surface the dependency failure and diagnostics explicitly.

## Execution Priority

1. Establish matched regressions for the current context loss, then remove legacy pre-prompt compaction, confidence fallbacks, and application-coverage omissions.
2. Generalize the server runtime so broad investigation questions and exact-fact questions share the same authenticated request and answer path as impact questions.
3. Add `FactAssertionV1` and `ApplicationDigestCandidateV1` as distinct evidence products; adapt the factual-serving prototypes to produce candidates, not answers.
4. Compile and process the complete approved evidence ledger in provider-window-sized stages, then synthesize and validate against the complete ledger.
5. Run matched quality tests on the same investigation snapshot.
6. Defer production RAG/index wiring until priorities 1–5 pass and the production index plus access-policy provider are available. Task 6 is deliberately not a prerequisite for staged answer synthesis or the matched quality gate.

## Review Focus

- **Evidence larger than one or multiple model windows:** every authorized candidate must be assigned to a stage or have a specific authorization/provenance/correctness exclusion; no budget omission.
- **Exact field answers across applications:** exact source JSON, field lineage, and citations must survive adapters, compilation, staged generation, and validation.
- **Broad investigation coverage:** each participating application must be represented when supported by the snapshot; participation must not become an inferred relationship.
- **Historical versus current evidence:** a dated stale passage may support a historical question, but must not be presented as current evidence.
- **Long conversation continuity and authorization:** older turns must remain available for follow-up interpretation without treating prior model text as evidence or crossing investigation/user scope.

---

### Task 1: Establish a Matched Answer-Quality Baseline

**Files:**
- Create: `OrchestrationPlatform/testdata/copilot-answer-quality/unified-investigation.json`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`

**Interfaces:**
- Consumes: the accepted investigation, evidence, and answer contracts already present in the frontend and .NET runtime.
- Produces: one shared fixture and a repeatable baseline covering broad, factual, graph, document, and follow-up questions.

- [ ] **Step 1: Add a shared accepted-investigation fixture** with Codebeamer, Configit, SAP, and Windchill participation and source-backed fields; a Configit `InProgress` field and rule-expression fields; source operation/completeness metadata; PLM Brain relationships; and cited source passages.
- [ ] **Step 2: Add failing baseline cases** named `broadOverviewIncludesEveryParticipatingApplication`, `exactConfigitFieldsArePreserved`, `relationshipClaimsRemainPlmBrainSourced`, and `documentClaimsCarryPassageCitations`.
- [ ] **Step 3: Run the focused baseline tests** and record current selected/prompted evidence, omissions, model-token estimates, and answer citations. Do not use the different user and teammate exports as an A/B pair.
- [ ] **Step 4: Add a matched quality report** that compares per-application coverage, exact-value correctness, citation support, evidence-accounting completeness, and existing impact/follow-up behavior without introducing a numeric release threshold.
- [ ] **Step 5: Run the focused frontend and .NET tests** to verify the fixture and baseline report are reproducible.

---

### Task 2: Serve Trusted Fact and Application Candidates from PLM Brain

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/fact-evidence-service.ts`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/application-context-service.ts`
- Create: `OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/fact-evidence/route.ts`
- Create: `OrchestrationPlatform/frontend/app/api/internal/v1/investigations/[investigationId]/application-context/route.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/contracts/factual-evidence-v1.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/impact-evidence-authorization.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/fact-evidence-service.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/application-context-service.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/factual-evidence-authorization.test.ts`

**Interfaces:**
- Consumes: the server-owned snapshot loaded by `serverKernel.load`, the current signed authorization-decision pattern, and the existing TypeScript fact contracts.
- Produces: versioned fact and application-context responses bound to investigation, snapshot revision, request, trace, and authorization decision.

- [ ] **Step 1: Add failing service tests** asserting exact Configit/Codebeamer/Windchill field values and lineage, SAP metadata-backed fields where present, and application participation for every source represented in the fixture.
- [ ] **Step 2: Add `FactAssertionV1`** carrying subject, predicate, exact source value, normalized value where present, unit, dimensions, source revision, temporal scope, authority, provenance, evidence IDs, citation IDs, and authorization binding. Add a typed `ApplicationDigestCandidateV1` carrying application identity, snapshot revision, source operation/completeness, participating and representative record IDs, referenced fact/evidence/citation IDs, provenance, authority, and authorization binding.
- [ ] **Step 3: Implement server-only snapshot projection** using `serverKernel.load`; port only useful field mappings from the pasted adapters. Preserve exact JSON values and do not accept frontend-projected fact text as authoritative.
- [ ] **Step 4: Add internal fact/application routes** using the signed authorization flow and request-bound responses. Authorization must be decided before source text or sensitive fields are returned.
- [ ] **Step 5: Test cross-investigation, stale-revision, missing-provenance, and unauthorized requests**; verify they cannot return candidate values and produce explicit diagnostics.
- [ ] **Step 6: Run the focused Vitest service and authorization tests** and verify all valid fixture fields remain present without hard-coded per-application result counts.

---

### Task 3: Connect Typed Candidates to the .NET Runtime

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/FactAssertionV1.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/EngineeringFactEvidence.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/ApplicationParticipationEvidence.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/ApplicationDigestEvidence.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Evidence/PlmBrainServiceContracts.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainClient.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainFactEvidenceRetriever.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Adapters/PlmBrainApplicationContextRetriever.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/FactEvidence/`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ApplicationContext/`

**Interfaces:**
- Consumes: the Task 2 versioned internal API responses and existing `IFactEvidenceRetriever` / `IApplicationContextRetriever` contracts.
- Produces: concrete retrievers that return candidates bound to the current investigation, revision, request, trace, and authorization decision.

- [ ] **Step 1: Add failing adapter tests** for exact JSON spelling, source-native IDs, field IDs, temporal scope, provenance, and authorization binding.
- [ ] **Step 2: Map the new response contracts** to `FactAssertionV1`, `ApplicationParticipationEvidence`, and `ApplicationDigestEvidence`; reject mismatched request bindings as provider errors, not empty-success results.
- [ ] **Step 3: Implement the authenticated PLM Brain client calls** and concrete retrievers; register them in dependency injection instead of the unavailable implementations.
- [ ] **Step 4: Test cancellation, provider failure, partial source coverage, and empty-but-successful results** as distinct observable outcomes.
- [ ] **Step 5: Run focused .NET fact, application-context, and authorization tests.**

---

### Task 4: Route All Copilot Questions Through One Runtime

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/QuestionUnderstanding/QuestionInterpreter.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

**Interfaces:**
- Consumes: Task 3 retrievers and the existing conversation, authorization, and PLM Brain services.
- Produces: one server-side answer flow for impact, broad overview, exact fact, application inventory, and document questions. The existing impact route remains a compatibility entry point to the same service.

- [ ] **Step 1: Add failing routing tests** proving summary, "which applications," exact Configit status/expression, evidence, document, and impact questions all call the runtime.
- [ ] **Step 2: Generalize the answer request/interpretation** so intent controls retrieval ordering and response structure, not whether useful authorized evidence is discarded.
- [ ] **Step 3: Route all Copilot turns through the generalized runtime client** and remove the successful legacy-answer fallback. Keep explicit, observable provider-unavailable outcomes.
- [ ] **Step 4: Remove the legacy context builder as a production prompt path**; audit its request-size, 24K character, 60-item, and 1,200-character field limits and remove them where they are not required by security, transport, correctness, or provider constraints.
- [ ] **Step 5: Preserve server-owned conversation continuity** without treating prior assistant messages as evidence. Replace the client-supplied fixed-history limit with server-side staged history handling in Task 5.
- [ ] **Step 6: Test authorization and persistence** across all question types, including that impact claims still come only from PLM Brain and that runtime failure is not disguised as an answer.
- [ ] **Step 7: Run focused frontend routing/turn tests and .NET API/service tests.**

---

### Task 5: Replace Lossy Compilation with Complete Staged Evidence Processing

**Files:**
- Modify or replace: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify or replace: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompilationInput.cs`
- Modify or replace: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextBudget.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ApprovedContextPlan.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextStage.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Generation/ModelInputTokenBudget.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/ModelInputTokenBudgetTests.cs`

**Interfaces:**
- Consumes: graph, fact, and application-digest candidates from Tasks 2 and 3, plus the existing source-passage contract.
- Produces: an `ApprovedContextPlan` containing the complete approved evidence ledger and an ordered `IReadOnlyList<ContextStage>`; each stage is renderable by `PromptAssembler` and fits the configured provider input window.

- [ ] **Step 1: Add failing tests** with more than 50 evidence items and enough content to span multiple model windows. Assert that every valid candidate is assigned to a stage or explicitly rejected for an authorization, provenance, or correctness reason.
- [ ] **Step 2: Replace `MaxClaims`, `MaxEvidenceItems`, fixed character budgets, and confidence-based content suppression** with complete evidence accounting and staged partitioning. Keep only the real provider input/output limits.
- [ ] **Step 3: Replace the fixed UTF-8-bytes-per-four estimate and unmeasured safety ratio** with deployment-compatible token counting; each stage must include the actual prompt envelope and fit the provider configuration.
- [ ] **Step 4: Make the compiler validate and bind candidates once** to investigation, snapshot revision, request, trace, and authorization. Preserve duplicate source identities losslessly; do not remove merely similar passages.
- [ ] **Step 5: Make `PromptAssembler` render each stage** and preserve a citation/evidence ledger across all stages. Process every stage before final synthesis; do not rank away unprocessed candidates.
- [ ] **Step 6: Make final validation use the complete approved ledger**, not only the last stage. Preserve source/citation IDs through intermediate summaries and final response claims.
- [ ] **Step 7: Remove arbitrary conversation-history turn/character truncation** from the request and prompt path; use server-owned staged history with clear separation between follow-up context and evidence.
- [ ] **Step 8: Test existing `ContextCompiler` against these requirements. If its data model or approval flow cannot support complete accounting and stages without lossy selection, replace its implementation/interface while keeping exactly one approval boundary.**
- [ ] **Step 9: Run the focused .NET compiler, prompt, token-budget, conversation, and answer-validation tests.**

---

### Task 6: Deferred — Connect Document RAG to the Same Evidence Ledger

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/SourceEvidence/ISourceEvidenceRetriever.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Adapters/IndexedSourceEvidenceRetriever.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceRecords.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/`
- Test: source-index integration tests against the configured index and access-policy provider

**Interfaces:**
- Consumes: an authorized source-index search interface and Task 5 staged compilation.
- Produces: paginated `SourceEvidencePassage` candidates with source revision, location, temporal scope, provenance, authorization binding, and diagnostics.

**Execution gate:** Defer this task until Tasks 1–5, Task 7 synthesis, and Task 8 matched quality verification pass, and the production index plus its access-policy provider are available. This task must not block improvements from investigation, fact, application, or PLM Brain evidence.

- [ ] **Step 1: Add failing tests** proving authorization is applied to candidate metadata before passage text is loaded and that all pages are retrieved without a top-k or score cutoff.
- [ ] **Step 2: Adapt the factual branch's lexical/semantic retrieval concepts** to `ISourceEvidenceRetriever`; use relevance to order processing, not silently exclude lower-ranked authorized candidates.
- [ ] **Step 3: Wire the configured production index and access-policy provider**. Do not substitute an in-memory or unavailable provider and claim production RAG is connected.
- [ ] **Step 4: Update freshness handling** so historical/as-of questions can use properly dated stale passages, while current-only questions do not present stale material as current.
- [ ] **Step 5: Test pagination exhaustion, authorization denial, snapshot mismatch, stale historical evidence, current-query freshness, and diagnostics.**
- [ ] **Step 6: Run focused retrieval and compiler tests; verify indexed text is never loaded before authorization.**

---

### Task 7: Complete Staged Answer Synthesis and Copilot Persistence

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Generation/AnswerCandidateParser.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`

**Interfaces:**
- Consumes: the complete approved evidence ledger, its stages, and all stage outputs from Task 5.
- Produces: one final answer with supported claims, citations from any processed stage, application coverage, and preserved conversation state.

- [ ] **Step 1: Add failing end-to-end tests** where exact Configit, Codebeamer, SAP, and Windchill facts are in later stages than the first graph records and must appear accurately in the final answer with their source citations.
- [ ] **Step 2: Synthesize stage results only after every stage has completed**; include source coverage and temporal caveats without converting application participation into relationships.
- [ ] **Step 3: Validate final claims against the complete approved evidence ledger** and persist citations and continuation state through the existing Copilot thread path.
- [ ] **Step 4: Audit answer parsing and validation limits; add a test with more than 25 supported claims and remove application-level claim truncation unless a measured provider/output requirement justifies it.**
- [ ] **Step 5: Test provider failure and cancellation** so partial stage processing is reported as incomplete, not returned as a complete answer.
- [ ] **Step 6: Run focused runtime, parser, validator, and Copilot turn tests.**

---

### Task 8: Matched Quality Verification and Production Readiness

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

**Interfaces:**
- Consumes: the shared fixture and the complete unified runtime.
- Produces: reproducible answer-quality evidence comparing the legacy baseline and unified flow on identical investigation data.

- [ ] **Step 1: Add matched evaluations** for broad cross-system summaries, exact Configit/Codebeamer/SAP/Windchill facts, application coverage, graph relationships, source-document explanations/citations, historical freshness, and long follow-ups.
- [ ] **Step 2: Assert outcome requirements:** all participating fixture applications are represented in broad coverage; exact facts equal their source values; graph claims match PLM Brain; every citation resolves; every approved evidence candidate is accounted for across stages; existing impact/auth/conversation behavior does not regress.
- [ ] **Step 3: Run focused frontend tests** from `OrchestrationPlatform/frontend`:

  `npm test -- features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`

- [ ] **Step 4: Run the .NET runtime test suite** from the repository root:

  `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj`

- [ ] **Step 5: Run the matched evaluation against the same snapshot and configured providers.** Report per-application coverage, exact-value correctness, citation validity, stage accounting, latency, and token usage; do not claim live RAG or improved production quality until the real index and authorization provider have been exercised.

---

## Plan Self-Review

- **Spec coverage:** The plan prioritizes no-loss context, unified runtime routing, `FactAssertionV1`, application digests, staged complete evidence processing, PLM Brain authority, citations, conversation continuity, and matched quality validation. Document retrieval remains a later gated task.
- **Failure modes:** Authorization and provenance binding, source/snapshot mismatch, pagination exhaustion, stale evidence, multi-stage citation continuity, and provider failures each have explicit tests.
- **Compatibility:** The existing impact endpoint remains a compatibility entry point to the unified service; its graph authority and validated response behavior are preserved.
- **No-silent-loss check:** Any candidate not sent to a stage must have an explicit, auditable reason tied to authorization, provenance, correctness, or provider constraints. Budget-driven omissions are not an accepted completion state.
- **Worktree:** The implementation must preserve unrelated pre-existing modifications and untracked prototype files; do not stage or revert unrelated work.

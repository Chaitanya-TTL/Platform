# Lattice Investigation RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source-authored evidence retrieval to the existing Lattice Copilot answer flow, improving explanations and inspectable citations while keeping PLM Brain authoritative for canonical entities, governed relationships, and impact paths.

**Architecture:** First build the source-evidence contracts, projection, profiling and retrieval benchmarks, planner/compiler integration, and a fake-backed vertical slice using approved fixtures. The first answer-path slice is impact-intent only and uses the existing authenticated .NET runtime: it resolves the subject and plans with Phase 2, retrieves PLM Brain evidence and optional linked source passages, compiles both through the existing Context Compiler, then uses the existing prompt, model, validator, CopilotKit route, transcript, and citation UI. Non-impact prompts currently use a separate legacy route and are outside this slice. Azure AI Search indexing and live activation are a separate follow-on, blocked on approved identity/tenant ownership, authorization, durable publication jobs, and Azure/data-boundary approvals.

**Tech Stack:** Existing Lattice TypeScript/Next.js and CopilotKit flow; .NET 10 `Lattice.AI.Runtime` and contracts; existing xUnit and Vitest suites; Azure AI Search as a provisional adapter/benchmark target only.

**Spec:** [2026-11-19-lattice-investigation-rag-design.md](../specs/2026-11-19-lattice-investigation-rag-design.md)

## Global Constraints

- RAG supplements the current PLM Brain and runtime: it must not discover or assert canonical identities, governed relationships, ontology mappings, impact paths, or impact chains by similarity.
- Model-generated content is excluded from indexing by default and is not source evidence.
- Operational/security material—authorization tokens, signed tickets, telemetry, secrets, and unrelated identity data—is never embedded or stored in the retrieval corpus.
- Azure AI Search is the first benchmark candidate, not an approved production deployment or final backend/model selection.
- Search filters reduce candidates; they are not an authorization boundary.
- The production trigger must use a durable job/outbox transactionally coupled to canonical publication; the current file event store and snapshot repository do not provide this transaction or multi-instance job durability.
- No real data may be sent until the data owner approves the service, region, networking, retention, and provider processing boundary.
- The ingestion source is the accepted, revisioned server-owned `InvestigationSnapshot` and its `canonical.value`, not the browser's Download JSON graph projection. Never accept browser-supplied source text as an indexing job.
- Preserve snapshot lifecycle, completeness, source-operation status, and source freshness as separate facts. A `current` entity freshness value does not turn a partial or failed source operation into a complete extraction.
- Do not claim full-document ingestion from a document reference or short canonical description. Document/attachment bodies require a separately approved source-side retrieval and extraction path.
- The existing Phase 2 planner and `ContextCompiler` remain the only planning and context-approval boundaries.
- Do not add final-answer, semantic-query-result, or context-package caching in the first slice.
- Do not set fabricated numerical latency or quality SLAs; establish baselines from measured approved corpora and runtime telemetry.
- Do not provision Azure resources, select a production embedding model, or index live client data without explicit approval.
- Do not add arbitrary confidence thresholds, refusal paths, filters, or result caps. Any constraint must address a demonstrated security, authorization, provenance, leakage, or measured operational risk; retain current configured compiler/model budgets.

## Review Focus

- **A source property contains instructions, secrets, identifiers only, or graph-derived prose:** the projection excludes ineligible fields and the prompt treats included source text as untrusted evidence, never as instructions. Pin with projector allowlist/exclusion tests and a prompt-injection fixture in Tasks 2 and 7.
- **The same accepted revision is indexed repeatedly or changes revision:** deterministic record/segment IDs and content hashes make same-revision retries idempotent while changed, removed, and stale records follow distinct semantics. Pin stable IDs and diff behavior in Tasks 2 and 10; live lifecycle behavior remains gated in Task 12.
- **An exact identifier or application filter is mistaken for semantic similarity or impact scope:** exact IDs are resolved deterministically, and generic application filters constrain source-evidence records only; PLM Brain impact semantics remain unchanged. Pin precedence and filter behavior in Tasks 4 and 5.
- **A passage is stale, unauthorized, from another investigation, or has conflicting provenance:** it cannot enter the compiled package or citation list, while independent authorized PLM Brain evidence remains usable. Pin negative cases in Tasks 6 and 7.
- **RAG returns no useful passage, or PLM Brain already answers the question:** the existing PLM answer remains available, no similarity-only claim is promoted, and useful source passages add citations when present. Pin matched PLM-only / combined cases in Tasks 8 and 9.

---

## End-to-End Flow and Work Boundaries

### First vertical slice (fixture-backed; can proceed now)

```text
approved synthetic, revisioned InvestigationSnapshot
  -> source-evidence projector and versioned projection contract
  -> corpus/segmentation/embedding/retrieval evaluation harness
  -> fake index/retriever used by runtime tests

existing Lattice Copilot UI
  -> existing CopilotKit API route and executeCopilotTurn
  -> authenticated EngineeringImpactController
  -> existing conversation interpreter, subject resolver, and Phase 2 ScopePlanner
  -> PLM Brain retrieval (required for impact claims)
     + source-evidence retriever (optional, linked to resolved entity/impact evidence)
  -> existing ContextCompiler (sole context-approval boundary)
  -> existing PromptAssembler/model gateway/answer parser/AnswerValidator
  -> existing runtime response mapping and transcript persistence
  -> existing CopilotKit answer/citation rendering
```

The vertical slice uses synthetic records and a fake retriever; it must exercise the same service, contracts, compiler, response mapping, transcript, and UI used by the live Copilot. It must not create another chat route or make RAG a separate answer service. It covers only impact-intent turns routed to the .NET runtime when that route is enabled and configured; it does not imply that all Copilot prompts use that runtime or add RAG to the legacy non-impact route.

### Production indexing and retrieval (blocked until approvals)

```text
accepted + published InvestigationSnapshot revision
  -> durable, idempotent revision job (server-side identity/revision only)
  -> worker reads that revision and canonical value from the approved server-owned snapshot store
  -> source-evidence projection -> segmentation -> approved embedding provider
  -> Azure AI Search adapter/index

authorized Copilot turn
  -> same Phase 2 plan and entity resolution
  -> PLM Brain authoritative retrieval + authorized, entity-linked Azure retrieval
  -> same ContextCompiler -> same answer/generation/validation/Copilot UI path
```

Do not implement the production trigger against the current file persistence as if it were transactional or tenant-authoritative. The platform must first choose the durable job/store integration and provide trusted investigation-to-tenant ownership and production authorization. These blockers do not gate Tasks 1–9.

The current Download JSON action serializes a hierarchy/knowledge-graph projection for the UI. It is useful for manual inspection, but it is not the ingestion contract: it does not carry the full revisioned snapshot envelope and does not provide source document or attachment bodies.

### Local development verification

- Each completed task must end with its focused automated check and a short manual verification instruction. If the task is not yet wired to the app, say that a frontend check is not applicable and show the fixture/test-runner output instead of inventing a UI path.
- For the integrated impact slice, run the app, open an approved local investigation, open Copilot, and ask a supported impact question that reaches the configured .NET route. Use the fake retriever in development/tests; do not send live investigation text to an embedding or search provider.
- Add opt-in, development-only structured diagnostics at the relevant stages. In Task 2, the read-only projection profile is triggered when the existing server-owned snapshot API loads the revision for the workspace. Show snapshot revision/lifecycle/completeness, source-operation status counts, projected record/segment/result counts, and exclusions by reason. Never log source text, prompts, answers, embeddings, credentials, tenant IDs, native IDs, or deep links. Keep production telemetry aggregate and privacy-filtered as specified in Task 10.
- For each manual checkpoint, report the exact UI action, the expected safe terminal event/counts, and what the check does not prove (for example, synthetic fixtures do not prove source document availability).

## File Map

### Fixture-backed work

- Create `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceRecords.cs` for versioned source-record, segment, retrieval-query, and retrieved-passage contracts.
- Create `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.ts` for an allowlisted projection from the accepted canonical investigation.
- Add projection, evaluation, and benchmark code under `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/`.
- Add synthetic long-form source-evidence fixtures and relevance/citation labels under `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/source-evidence/`; keep the existing R-123 graph fixture unchanged.
- Create `OrchestrationPlatform/Lattice.AI.Runtime/SourceEvidence/ISourceEvidenceRetriever.cs` and a test fake in `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/`.
- Modify the existing `ScopePlanner`, runtime composition, `ImpactAnswerService`, `ContextCompiler`, `PromptAssembler`, runtime answer contracts, TS runtime response mapping, and existing Copilot citation rendering only where needed to carry source passages end-to-end.
- Extend the existing runtime/evaluation and frontend tests; do not introduce a parallel route, planner, compiler, transcript, or model pipeline.

### Production-only follow-on (not part of fixture-backed activation)

- Add the Azure AI Search package, index schema/adapter, embedding adapter, durable indexing worker, and publication trigger only after the approvals and owner decisions in Task 12.
- The worker must read canonical revisions from the approved server-owned store. Do not accept source text from browser requests or infer tenant ownership from `InvestigationId`.
- Keep Azure infrastructure definitions and provisioning out of Tasks 1–9.

The projection is a pure transformation and must only be invoked from an approved server-side ingestion boundary for live snapshots. Fixture tests may call it directly. It must not turn the browser workspace or its Download JSON output into an indexing client.

---

## Task 1: Add a Synthetic Source-Evidence Corpus and Profiling Baseline

**Files:**
- Create: `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/source-evidence/records.json`
- Create: `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/source-evidence/queries.json`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/SourceEvidenceCorpusProfiler.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceCorpusProfilerTests.cs`

**Interfaces:**
- Consumes: the approved synthetic R-123 fixture as an impact-graph smoke fixture; the new source fixture contains clearly synthetic source descriptions, requirement text, rule text, revisions, source locations, and provenance.
- Produces `SourceEvidenceFixtureRecord(RecordId, SourceApplication, RecordType, SearchableText, SourceRevision, Location, ProvenanceId, Freshness)` and `SourceEvidenceCorpusProfile Profile(IReadOnlyList<SourceEvidenceFixtureRecord> records)`, reporting record/text-length distributions, empty and identifier-only rates, exact/normalized duplicate rates, and revision/provenance/location coverage. Projected segment/vector counts are added after candidate segmenters exist in Task 3. The profiler must not report any production corpus or capacity conclusion from R-123.

- [x] **Step 1: Write failing profiler tests** for the empty source-text R-123 fixture and the synthetic long-form fixture. Assert that R-123 reports zero eligible source-text records, and that profile counts, duplicate rates, and provenance/location coverage for the synthetic records match the fixture exactly.
- [x] **Step 2: Run the focused test** with `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~SourceEvidenceCorpusProfilerTests`. Expected: FAIL because the profiler and source-evidence fixture contract do not exist.
- [x] **Step 3: Add the synthetic fixtures and implement `SourceEvidenceCorpusProfiler.Profile`** in the evaluation project. Count text statistics without logging or persisting source text; keep the profiler independent of Azure and embedding packages.
- [x] **Step 4: Run the focused test** with the same command. Expected: PASS; output explicitly labels the corpus as synthetic and does not infer a production capacity target.
- [x] **Step 5: Commit** the fixture, profiler, and test.

**Manual checkpoint:** This task is fixture-only. Run the focused profiler test and confirm the terminal labels its output synthetic and reports only aggregate counts/distributions; no frontend check or live data is involved.

## Task 2: Define Source-Evidence Contracts and Canonical Projection

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceRecords.cs`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/contracts/intelligence-v1.ts` only if a typed source-field eligibility marker is required by the projection.
- Test: `OrchestrationPlatform/frontend/features/lattice-next/kernel/application/source-evidence-projection.test.ts`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceContractTests.cs`

**Interfaces:**
- Produces the cross-runtime contract `SourceEvidenceRecord` with `RecordId`, optional trusted `TenantId`, `InvestigationId`, `SnapshotRevision`, `SourceApplication`, `SourceRecordId`, `CanonicalEntityIds`, `RecordType`, `Title`, `SearchableText`, optional `Location`, `SourceRevision`, `SourceTimestamp`, `CapturedAt`, `Freshness`, `ContentHash`, `EvidenceIds`, `ProvenanceId`, `Authority`, `DeepLink`, optional parent-record/segment reference, and segmentation/embedding/schema versions. Production indexing requires `TenantId` from a trusted binding; fixtures and local experiments do not invent it.
- Produces `SourceEvidenceSegment` with a stable segment ID, parent `RecordId`, exact source-text offsets/location, text, and the same provenance/version metadata.
- Produces `SourceEvidencePassage` with passage/record IDs, investigation and snapshot revision, source application/record, linked canonical entity IDs, source revision/location/text, evidence/provenance IDs, authorization decision ID, freshness, retrieval method/score, and index schema/embedding model versions.
- Produces `SourceEvidenceProjectionBatch` with investigation/revision identity, snapshot lifecycle/completeness, per-source operation status, and records. The projection input is the accepted `InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>` wrapper, not only `canonical.value`; use its published canonical revision and preserve the wrapper's execution/completeness metadata.
- The projection must use an explicit allowlist keyed by source, entity/record kind, and property or source-field metadata. A generic property such as `value` is never eligible by itself. Match fixtures to the observed canonical shape without committing live investigation payloads. Exclude graph/path/chain explanations, generated prose, empty or identifier-only values, secrets/operational data, and fields without source provenance. Preserve engineering codes, units, symbols, and equations.
- Keep snapshot lifecycle/completeness, source-operation status, and entity freshness distinct in each record or its projection batch. In particular, test a partial source whose entity freshness is still `current`; do not infer successful extraction from freshness alone.

- [x] **Step 1: Write failing tests** against the revisioned snapshot wrapper and synthetic records shaped like the observed SAP, Windchill, Configit, and Codebeamer canonical entities. Cover source/kind/field allowlists; excluded identifier-only, generated, graph-derived, and missing-provenance fields; partial source status independent of entity freshness; stale records retaining freshness metadata; and preservation of punctuation, units, and locations. Do not commit the inspected live payload or treat Teamcenter selection support as evidence of a wired intelligence adapter.
- [x] **Step 2: Run the focused frontend tests** with `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/kernel/application/source-evidence-projection.test.ts`. Expected: FAIL because projection is not implemented.
- [x] **Step 3: Implement the projection and matching .NET records** with a deterministic `RecordId` derived from investigation, source application, native record identity/revision, and stable field location. Same revision/content produces the same ID; content changes update the hash and revision metadata. Preserve the snapshot revision, completeness, lifecycle, source-operation status, and freshness without logging field values. Add an explicitly opt-in development-only, read-only aggregate diagnostic at the existing server-owned snapshot load boundary; it must not write an index or invoke an embedding provider.
- [x] **Step 4: Add serialization contract tests** for the versioned camel-case .NET contract and nullable values. Run the focused frontend test and `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~SourceEvidenceContractTests`. Expected: PASS.
- [ ] **Step 5: Commit** the shared contract, projection, and tests.

**Manual checkpoint:** In PowerShell, set `$env:LATTICE_SOURCE_EVIDENCE_DIAGNOSTICS="true"` and (if needed for the local certificate issue) `$env:NODE_OPTIONS="--use-system-ca"` before running `npm run dev`. Open the approved local investigation to trigger the existing server-owned snapshot GET. The terminal should emit `[lattice.source-evidence.projection]` with revision/lifecycle/completeness, source-operation status counts, projected record counts, and exclusions by reason—never source text, prompts, answers, or identifiers. This proves only that allowlisted fields in this snapshot were projected locally; it does not prove document-body extraction, embedding, or indexing.

## Task 3: Build Segmentation and Embedding Benchmark Harnesses

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/SourceEvidenceSegmenter.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/ISourceEvidenceEmbeddingProvider.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/SourceEvidenceBenchmarkRunner.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceSegmentationTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceBenchmarkRunnerTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj` to copy the fixture files for isolated-output test runs.

**Interfaces:**
- Produces `SourceEvidenceSegmenter.Segment(SourceEvidenceRecord record, SegmentationStrategy strategy): IReadOnlyList<SourceEvidenceSegment>` for `WholeRecord`, `StructuralFieldGroups`, and `StructuralSemantic` candidates.
- Produces `ISourceEvidenceEmbeddingProvider.EmbedAsync(IReadOnlyList<string> texts, CancellationToken cancellationToken): Task<IReadOnlyList<SourceEvidenceVector>>`, where `SourceEvidenceVector` contains the embedding model/version and numeric vector; benchmark fakes are used in automated tests. Real provider executions are optional experiments and require approved fixture/data and provider boundaries.
- Produces `SourceEvidenceBenchmarkRunner.RunAsync(SourceEvidenceBenchmarkDataset dataset, ISourceEvidenceEmbeddingProvider embeddingProvider, CancellationToken cancellationToken)`. The dataset explicitly declares `synthetic-fixture-only` or `approved-sanitized`; the runner rejects other corpus classifications before embedding.
- Produces three segmenting candidates: whole record, paragraph/field groups, and a deterministic sentence-boundary baseline. The sentence strategy is structural only; it is not model-based semantic topic detection.
- Produces a fixture benchmark retriever that runs exact/metadata, lexical, cosine-vector, and reciprocal-rank-fusion candidates over the same records/vectors; it is evaluation-only and is not registered in runtime DI.
- Produces a report comparing relevant-evidence coverage, segment count and length distribution, duplicate retrieval, citation-location correctness, embedding dimensions/calls, elapsed time, and embedding cost inputs. Do not declare a winning segmenter/model without held-out labeled data; no tokenizer, price, or production model is selected here.
- Lists Azure OpenAI `text-embedding-3-small` and `text-embedding-3-large` as provisional benchmark candidates only; they are not called or added as dependencies in this task.

- [x] **Step 1: Write failing tests** for exact source offsets, stable segment IDs, engineering-symbol preservation, duplicate-segment accounting, citation-location correctness, deterministic fake embeddings, and rejection of unclassified corpora before provider invocation.
- [x] **Step 2: Run the two focused tests** with `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~SourceEvidenceSegmentationTests|FullyQualifiedName~SourceEvidenceBenchmarkRunnerTests"`. Expected: FAIL because the harness is absent.
- [x] **Step 3: Implement the segmenter and benchmark runner** behind the provider interface. Keep embedding providers out of runtime DI and keep tests offline; include the two Azure OpenAI model names only as provisional benchmark candidates.
- [x] **Step 4: Run the focused tests** with the same command. Expected: PASS for deterministic harness tests; no Azure call or resource is made. The combined profiler, contract, segmentation, and benchmark tests also pass.
- [ ] **Step 5: Commit** the benchmark harness and tests.

**Manual checkpoint:** Run the focused benchmark test with `--logger "console;verbosity=detailed"` to print the aggregate synthetic report: record/query counts, each strategy's segment counts and length distribution, retrieval coverage, duplicate counts, citation-location accuracy, embedding call/dimension and input-size counts, and elapsed time. The report contains no source text. No frontend or live-source check is applicable yet, and no embedding provider should be called.

## Task 4: Add Retrieval Evaluation Cases and Compare Search Strategies

**Files:**
- Create: `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/source-evidence/labels.json`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/SourceEvidenceRetrievalEvaluator.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceRetrievalEvaluatorTests.cs`

**Interfaces:**
- Produces `SourceEvidenceRetrievalEvaluator.Evaluate(queries, labeledEvidence, retrievedEvidence): SourceEvidenceRetrievalMetrics` with exact-ID success, Recall@k, Precision@k, MRR, nDCG, duplicate retrieval, and citation-location accuracy.
- Labeled synthetic cases cover exact IDs, abbreviations, engineering vocabulary, cross-system terms, paraphrases, distractors, long and short records, missing text, and conflicting revisions. Include multilingual cases only if the approved use cases require them.
- Evaluate exact/metadata, lexical-only, vector-only, and hybrid RRF separately. Reranking is not in the first slice; add a reranker experiment only after held-out results identify a concrete gain and its processing boundary is approved.
- Use a shared K and macro-average per-query precision, recall, MRR, and nDCG; unanswerable queries count as zero for precision and MRR but are excluded from recall and nDCG. Exact-ID success is measured only for queries with a labeled exact target. Count duplicate record IDs across full rankings; score citation locations only for distinct relevant results within top K that have a known expected location.

- [x] **Step 1: Write failing evaluator tests** with hand-labeled expected ranks and citations; assert metric values against the fixture, not against an LLM judge.
- [x] **Step 2: Run** `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~SourceEvidenceRetrievalEvaluatorTests`. Expected: FAIL because the evaluator and labels are missing.
- [x] **Step 3: Implement the evaluator and labeled synthetic cases**. Make each channel's ranking inputs explicit so the same labels compare exact, lexical, vector, and hybrid results.
- [x] **Step 4: Run the focused test** with the same command. Expected: PASS with reproducible offline metrics; no quality claim about a production corpus.
- [ ] **Step 5: Commit** the labeled cases, evaluator, and tests.

**Manual checkpoint:** This task is fixture-only. Run the focused evaluator and confirm the terminal reports synthetic retrieval metrics and citation-location counts. The deterministic per-strategy rankings in its unit test validate metric calculation only; they are not results from search engines and make no retrieval-quality claim. No frontend or live-source check is applicable yet.

## Task 5: Extend Phase 2 Planning for Source-Evidence Retrieval

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ScopePlanning/ScopePlanner.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/ScopePlanningResult.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Scope/SourceEvidencePlan.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ScopePlanning/ScopePlannerTests.cs`

**Interfaces:**
- Keep `IScopePlanner` and existing `ScopePlanner.Plan(...)` as the sole planner. Add `SourceEvidencePlan(bool Requested, IReadOnlyList<string> LinkedEntityIds, IReadOnlyList<string> SourceApplications, IReadOnlyList<string> ExactIdentifiers, string ReasonCode)` to `ScopePlanningResult`. The plan contains only validated entity IDs and parser/interpreter-produced generic source-application filters.
- Source-application filters apply only to source-evidence records. They do not narrow or reinterpret PLM Brain impact paths; target-application and relationship semantics remain governed by the existing PLM Brain contract.
- Existing supported impact turns continue to produce the same `ImpactScope` and graph request. Unsupported/ambiguous subject handling remains unchanged; do not create a second model planner or let a model generate database filters.

- [x] **Step 1: Write failing planner tests** for a normal impact question, an exact source ID, a generic source-application filter, a follow-up inheriting one validated entity, and an ambiguous entity. Assert graph scope is unchanged and only the evidence plan receives source-application filters.
- [x] **Step 2: Run** `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ScopePlannerTests`. Expected: FAIL for the new plan contract/semantics.
- [x] **Step 3: Extend the existing typed plan and planner** with source-evidence request fields while preserving existing Phase 2 entity validation and impact scope behavior.
- [x] **Step 4: Run the focused planner test** with the same command. Expected: PASS; source filters do not alter PLM Brain impact scope.
- [ ] **Step 5: Commit** the planner contract and tests.

**Manual checkpoint:** The focused planner tests verify an impact question produces the same graph scope while source filters affect only the evidence plan. No frontend check is applicable until the runtime seam is integrated.

## Task 6: Add the Runtime Retrieval Seam and Fake-Backed Impact Integration

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/SourceEvidence/ISourceEvidenceRetriever.cs`
- Create: `OrchestrationPlatform/Orchestration.API/AI/Adapters/UnavailableSourceEvidenceRetriever.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/FakeSourceEvidenceRetriever.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs`

**Interfaces:**
- Produces `SourceEvidenceQuery(InvestigationId, Subject, RelevantEntityIds, SourceApplications, ExactIdentifiers, Authorization, RequestContext)` and `SourceEvidenceRetrievalResult(InvestigationId, SnapshotRevision, SourceVersion, AuthorizationDecisionId, RequestId, TraceId, Passages)`.
- Produces `ISourceEvidenceRetriever.RetrieveAsync(SourceEvidenceQuery query, CancellationToken cancellationToken): Task<SourceEvidenceRetrievalResult>`.
- The runtime calls existing `IEngineeringEvidenceSource.RetrieveImpactAsync` for impact questions as it does today, then requests optional source evidence using the same authorization decision, investigation, resolved subject, and current Phase 2 plan. Relevant entity IDs may include the resolved subject and entities already present in the authoritative PLM Brain result; RAG cannot create entity links. Exact identifiers use deterministic lookup in the adapter contract; vector similarity is never identity resolution.
- The fake returns only fixture passages and has no Azure dependency. Register an explicit `UnavailableSourceEvidenceRetriever` in the current API composition until an approved production adapter exists; it reports the source-evidence channel as unavailable while allowing valid PLM Brain evidence to continue. Test composition replaces it with the fixture fake.

- [x] **Step 1: Write failing service tests** proving PLM Brain retrieval still occurs, source evidence receives the exact authorized scope and validated entity IDs, no retrieval is made before authorization/subject resolution, and empty RAG results preserve a valid graph answer.
- [x] **Step 2: Run** `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~ImpactAnswerServiceTests`. Expected: FAIL because the source retriever seam is not injected or invoked.
- [x] **Step 3: Add the source-evidence contracts, interface, test fake, explicit unavailable adapter, service integration, and composition registration**. Keep retrieval failures explicit in runtime diagnostics/telemetry and preserve the existing PLM answer path when the optional channel has no matches; do not silently substitute synthetic source evidence. Update direct `ImpactAnswerService` construction in the evaluation runner and tests.
- [x] **Step 4: Run the focused service test** with the same command. Expected: PASS, including authorization-denial and graph-only regression cases.
- [ ] **Step 5: Commit** the retrieval seam and service integration.

**Manual checkpoint:** Run the local frontend with the .NET impact route configured and the fake retriever enabled. Open an investigation and submit an impact-intent prompt; confirm the terminal shows the impact route and aggregate fake-retrieval counts, with no query or source text logged. Also verify the graph-only answer path survives an empty fake result.

**Task 6 manual checkpoint status:** Not run. The API composition intentionally registers `UnavailableSourceEvidenceRetriever`, the synthetic fake is test-only, and the current telemetry composition has no console exporter. Automated service tests cover the fake-backed empty-result and unavailable paths; this is not frontend verification.

## Task 7: Extend ContextCompiler and Prompt Assembly for Source Passages

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Context/ContextPackage.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompilationInput.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/ContextCompilation/ContextCompiler.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/ContextCompilation/ContextCompilerTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs`

**Interfaces:**
- Add `SourceEvidencePassage` to the Context Package as a distinct type from `ImpactClaim`. It contains passage/parent IDs, source application and source record ID, source revision, location, source text, provenance/evidence IDs, authorization decision ID, retrieval method/score, freshness, and index schema/model versions.
- Extend compilation input with the source retrieval result. `ContextCompiler.Compile` remains the only approval boundary and validates investigation/snapshot/request/trace/decision binding, current source status, complete provenance, stable source IDs, and unique/non-conflicting passage IDs.
- Keep graph claims authoritative and separately serialized from source passages. Apply existing configured context/evidence budgets, deduplicate equivalent passages, and report omitted passages using `ContextOmission`; do not introduce new arbitrary thresholds.
- Serialize source text as untrusted evidence in `PromptAssembler`, retaining its source and location metadata. Existing prompt-injection notice remains in force.

**Rule rationale:** Request/investigation/snapshot/authorization binding, current freshness, and complete provenance prevent cross-context reuse and untraceable or stale citations; those mismatches are possible across independently retrieved revisions and authorization decisions, and only the compiler can approve them. The tradeoff is omitting the affected passage while preserving valid PLM claims. Conflicting passage IDs (including collision with a graph-source ID) are omitted because answer source IDs are untyped strings and collisions can resolve to the wrong source or authorization; this is necessary for citation correctness, with only the ambiguous passage lost. Equivalent passage deduplication and configured evidence/token budgets prevent duplicate context cost and honor existing operational limits; one equivalent passage remains, and no new threshold is added. A non-finite retrieval score is omitted because it cannot be serialized reliably into the package identity; the tradeoff is losing that passage, not the graph answer.

- [x] **Step 1: Write failing compiler and prompt tests** for valid source passage acceptance, mismatched decision/investigation rejection, missing/conflicting provenance omission, duplicate passage handling, stale evidence exclusion, graph claims retained alongside passages, and source text serialized as data.
- [x] **Step 2: Run** `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~ContextCompilerTests|FullyQualifiedName~PromptAssemblerTests"`. Expected: FAIL because the package lacks source passages.
- [x] **Step 3: Extend `ContextCompilationInput`, `ContextPackage`, and `ContextCompiler`**, then serialize the approved package in `PromptAssembler`. Do not authorize, rank, or approve evidence in the prompt layer.
- [x] **Step 4: Run the focused tests** with the same command. Expected: PASS; an invalid passage cannot remove or weaken independently valid graph claims.
- [ ] **Step 5: Commit** compiler and prompt integration with tests.

**Manual checkpoint:** In the local impact flow, use fake passages to exercise accepted and omitted evidence. Confirm the terminal reports aggregate compiler acceptance/omission counts and the UI retains the authoritative graph answer; do not log passage text.

## Task 8: Preserve Passage Citations Through Runtime Response and Existing Copilot UI

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Answers/AnswerContracts.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Validation/AnswerValidator.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify only if required: `OrchestrationPlatform/frontend/features/lattice-next/copilot/CopilotAnswerContent.tsx`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Validation/AnswerValidatorTests.cs`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts`

**Interfaces:**
- Return approved source passages as runtime `Sources`/citation references without exposing embeddings, scores as confidence, signed authorization material, or raw index metadata to the browser. The answer may cite only IDs admitted by the compiled package.
- Map passages to the existing `CopilotCitation` source/evidence kinds with source label, native ID, summary/location, and resolvable deep link where present. Preserve the existing one-response transcript and `CopilotAnswerContent` citation interaction.
- Do not add a second route, message, transcript store, or answer schema. Keep prior assistant prose out of retrieval and evidence claims.

**Rule rationale:** Answer citations must resolve to IDs admitted in the compiled package and remain bound to its current authorization; model-generated IDs are not evidence, and authorization can differ between requests. Rejecting only unknown, stale, or mismatched-decision citations prevents unsupported references and unauthorized source disclosure; the tradeoff is that a malformed cited answer is not returned, while graph claims and valid citations remain unchanged. Source text, retrieval scores, embeddings, and index metadata stay out of the browser response to avoid leaking indexed content and implementation details; citations retain only source identity/location and an optional safe link. A missing link is not a rejection condition, preserving citations for systems without deep-link support.

- [x] **Step 1: Write failing response-mapping and validator tests** for a valid cited source passage, an unknown/unauthorized citation ID, a missing deep link, and graph claims plus source citations in one answer.
- [x] **Step 2: Run the focused .NET and frontend tests**:
  - `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~AnswerValidatorTests`
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
  Expected: FAIL for source passage citations not yet mapped.
- [x] **Step 3: Extend the existing answer source/citation mapping and validation** so citations resolve only against the compiled, current source set; render through the existing citation UI.
- [x] **Step 4: Run both focused test commands**. Expected: PASS; a returned answer is persisted once and its source citations remain inspectable after transcript reload.
- [ ] **Step 5: Commit** the runtime response and UI citation mapping.

**Manual checkpoint:** In the local impact flow, inspect a fake-source citation in the existing Copilot UI and reload the thread to verify it remains inspectable. Terminal output is limited to citation/result counts and validation status; no answer text or source IDs.

## Task 9: Prove the Integrated Fixture-Backed Copilot Vertical Slice

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/GoldenEvaluationTests.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

**Interfaces:**
- Use the Task 6 fake retriever through the existing runtime dependency-injection seam; exercise the current CopilotKit execution route/`executeCopilotTurn`, transcript persistence, response mapping, and citation packet.
- Compare matched PLM-only and PLM+RAG answers. Include an RAG-only run only as a diagnostic retrieval baseline; it must not be a production answer mode.
- Cases include useful requirement details missing from graph-only context, a question answered by PLM Brain with no matching source passage, irrelevant distractors, conflicting revisions, and prompt-injection text in a source passage.

- **Fixture rationale:** The potential-impact evaluation fixtures carry a synthetic evidence record for each required relationship. Without it, the existing context budget can omit the relation, as demonstrated by the failing case; retaining an unsupported fixture edge would not test a supported impact answer. This prevents a false-positive evaluation, is necessary for the comparison to measure source-evidence value against a valid PLM path, and trades away testing evidence-less edges in these two cases. No new runtime filter or refusal behavior is introduced.

- [x] **Step 1: Add failing end-to-end tests** asserting source evidence adds a relevant cited explanation when available, graph paths/claims remain unchanged, graph-only answers remain useful when retrieval is empty, and no unsupported RAG-only impact assertion appears.
- [x] **Step 2: Run the focused integration tests**:
  - `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter FullyQualifiedName~GoldenEvaluationTests`
  - `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/tests/copilotkit-agent-runner.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
  Result: PASS after the fixture path resolver was corrected to skip the partial output directory and the potential-impact fixture evidence was completed.
- [x] **Step 3: Wire only the test fake through the existing runtime execution path** and add engineer-reviewed synthetic expected answers/citation labels. Do not create a standalone demo chat path.
- [x] **Step 4: Run both focused test commands**. Expected: PASS with a measurable added-evidence/citation result and preserved PLM-only cases.
- [ ] **Step 5: Commit** the vertical-slice tests and fixture wiring.

**Manual checkpoint (pending):** Run the local frontend and open an approved investigation. In Copilot, submit an impact-intent question that reaches the configured .NET route; confirm one answer and inspectable fake-source citations. The terminal should show only route/stage names and aggregate retrieval, acceptance, and omission counts. This verifies the impact route and fake-backed UI flow, not live-source extraction or all Copilot prompt types.

## Combined Fact and Source-Evidence Integration Status

The pre-merge integration carries PLM Brain impacts, deterministic fact assertions, Product 360 application-participation context, and approved source passages through the existing runtime and `ContextCompiler`. The existing Copilot route maps approved fact and passage sources to citations and persists one assistant response. Graph claims and impact-path authority remain separate from fact and source-evidence candidates.

The fixture-backed comparative evaluator now exercises PLM-only, PLM+facts, PLM+RAG, and combined answers. Its synthetic scorer reports citation precision `1`, unsupported-claim rate `0`, and required-path citation coverage `1` for each variant. These are contract/scorer outcomes over synthetic answers; they do not measure semantic answer improvement, production retrieval relevance, source coverage, or authorization-provider readiness.

Focused verification on 2026-11-24 passed: **138/138** selected .NET tests and **85/85** selected frontend tests, including the golden evaluation, fact and participation contracts, compiler, response mapping, route persistence, and comparative evaluator. A separate, broader `copilot-relationship-flow.test.ts` run exposed three unrelated existing assertions about investigation relationship counts and response section wording; that file is outside this evidence integration and its underlying context builder was not changed here.

Production indexing, source-body extraction, live authorization/retrieval, and the manual UI checkpoint remain pending the approvals and owner inputs listed in Task 12 and the separate source-document gate. Do not treat the synthetic integration as production activation or a claim of improved live answers.

## Task 10: Add Safe Retrieval Telemetry and Index-Status Contracts

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Telemetry/IAiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetry.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Telemetry/AiRuntimeTelemetryPrivacyProcessor.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs` to record compiler-reported source-evidence omissions.
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/EngineeringImpactEvaluationRunner.cs` and `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs` for the extended telemetry interface.
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Evidence/SourceEvidenceIndexStatus.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Telemetry/AiRuntimeTelemetryPrivacyProcessorTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/SourceEvidence/SourceEvidenceIndexStatusTests.cs`

**Interfaces:**
- Record aggregate stage duration/counts for projection, segmentation, embedding, exact/lexical/vector/hybrid retrieval, compilation, and omission, plus indexing status/revision counters. Use existing telemetry conventions and existing histogram/counter instruments; do not introduce cardinality-heavy dimensions.
- Never record source text, query text, embeddings, prompts, answer text, credentials, tenant IDs, native IDs, or deep links in telemetry.
- Define versioned indexing status semantics for queued, processing, complete, partial, stale, failed, and deleted revisions. This task defines/test contracts and local fake lifecycle behavior only; it does not add a production queue or claim durable reconciliation.

- **Privacy filtering rationale:** Activity tags can be exported to telemetry backends, so raw source/query/prompt/answer payloads, embedding vectors, deep links, and native source identifiers could expose engineering data or enable record-level correlation. The existing processor is the export boundary; removing these payload tags there is necessary while preserving aggregate counts and safe metadata (including embedding model version). The tradeoff is that payload-level telemetry cannot be used for production debugging; use approved local fixtures or aggregate diagnostics instead. Existing investigation/entity/tenant/context-package identifier opt-ins remain unchanged.

- [x] **Step 1: Write failing privacy and status-transition tests**, including a source-text sentinel that must not appear in serialized telemetry.
- [x] **Step 2: Run** `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~AiRuntimeTelemetryPrivacyProcessorTests|FullyQualifiedName~SourceEvidenceIndexStatusTests"`. Expected compile failure confirmed the new status contract was absent.
- [x] **Step 3: Add the safe aggregate telemetry and lifecycle contracts** with no raw values. Keep telemetry policy aligned with `AiRuntimeTelemetryPrivacyProcessor`.
- [x] **Step 4: Run the focused tests** with the same filter, plus `ImpactAnswerServiceTests`. Result: PASS, 50 tests; sentinels were absent from serialized telemetry, only bounded aggregate dimensions were emitted, and stale remained distinct from deleted.
- [ ] **Step 5: Commit** the telemetry/status contracts and tests.

**Manual checkpoint:** PASS via the focused local test run: the serialized activity check did not contain source/query/prompt/answer/embedding/deep-link/native-ID sentinels, while aggregate measurements retained counts and bounded status. No frontend behavior changes in this task.

## Task 11: Run Approved Corpus and Model Experiments (No Deployment)

**Files:**
- Update: `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/source-evidence/` with approved sanitized, human-labeled cases only.
- Update: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/` benchmark reports/results in the repository's existing evaluation output format.
- Do not modify infrastructure manifests or provision resources.

**Interfaces:**
- Run corpus profiling, segmentation comparison, embedding shortlist (`text-embedding-3-small`, `text-embedding-3-large`, and a local `BAAI/bge-m3` candidate only if license/host/language/supply-chain checks pass), and exact/lexical/vector/hybrid RRF comparisons on approved data.
- Record model/version, dimensions, tokenizer/input limits, formatting, region/deployment availability, Recall@k, Precision@k, MRR/nDCG, citation location correctness, latency, embedding calls, and cost inputs.
- Compare PLM-only, RAG-only diagnostic, and PLM+RAG. Choose no model/backend based on public leaderboard results or synthetic smoke data alone.

- [x] **Step 1: Run the offline synthetic profile and benchmark now** with the deterministic fake embedding provider and fixture benchmark retriever. Expected: reproducible smoke results for segmentation, ranking metrics, and citations; clearly label them synthetic and make no production model/backend selection. The profiler, segmenter, benchmark runner, and retrieval evaluator suites passed (13 tests); aggregate results are in `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/SourceEvidence/reports/synthetic-source-evidence-labels-v1.json`.
- [x] **Step 2: For a real embedding-model comparison, confirm the provider/data boundary** for the model and corpus before any external embedding request. Use approved sanitized/human-labeled cases when available; if no approval is available, keep this comparison pending without blocking the offline benchmark. No provider/data approval was supplied for this run, so no external request was made and the model comparison remains pending.
- [ ] **Step 3: Run the profiler and benchmark evaluator** on the approved held-out set when available. Expected: reports contain no raw content in logs and report retrieval and generation metrics separately.
- [ ] **Step 4: Review results with source/PLM Brain owners** and record measured corpus volume, duplication, revision, relevance, citation accuracy, latency, and cost. Do not turn results into a deployment approval.
- [ ] **Step 5: Commit only approved sanitized evaluation labels and aggregate reports**; do not commit source payloads or customer-identifying data.

**Task 11 offline findings (2026-11-24):** The synthetic set contains 7 records and 10 labeled queries. Whole-record hybrid RRF achieved Recall@3 0.815 and nDCG@3 0.830; lexical achieved 0.778 for both. The hash-based fake vectors are not semantic embeddings, and the corpus is too small and duplicate-heavy to select a segmenter, model, or backend. The report contains aggregate metrics only. The test adapter assigns fixed synthetic lifecycle, completeness, and extraction-status values, so those dimensions remain unevaluated. Steps 3–5 remain pending: no approved held-out corpus or owner review is available, and the mixed worktree is not safe to commit as a Task 11-only change.

**Manual checkpoint:** This is an offline evaluation task, not a frontend feature. Run only on synthetic or approved sanitized data; present aggregate metrics and make no provider request unless the data/provider boundary is approved.

## Task 12: Production Activation Work (Blocked Until Explicit Approvals)

This task is intentionally blocked and must not prevent Tasks 1–11 from being implemented and tested with fixtures/fakes. Do not mark it complete until each dependency below is supplied and approved.

**Required owner inputs before production code/provisioning:**

1. A trusted investigation-to-tenant/owner binding and approved server-side identity/credential flow for indexing, retrieval, and citation resolution.
2. A production `IResourceAuthorizationDecisionProvider`, source-level ACL semantics, and authorization recheck/revocation behavior.
3. Source/data owner approval for fields, sanitized representative corpus, revision/deletion signals, extraction availability, retention, and any record-level access control.
4. Platform owner selection of the durable queue/outbox and production snapshot-store integration transactionally coupled to accepted publication; reconciliation and retry ownership.
5. Security/cloud approval of Azure AI Search region, provider processing boundary, private networking, identity, encryption/key management, logging, deletion, retention, recovery, capacity tier, and cost. Azure AI Search remains provisional; if the boundary fails, re-run the backend comparison before implementation.
6. PLM Brain owner agreement that source-application filters constrain evidence records only and confirmation of how entity-linked source evidence is exposed.

The first slice indexes only explicitly allowlisted source-authored fields already present in the accepted canonical snapshot. Full Windchill document bodies, Codebeamer attachment bodies, and any other linked-file content are not included unless the separate document/attachment extraction gate below has been completed and approved.

**Production files, only after approval:**
- Create the Azure Search client/adapter under `OrchestrationPlatform/Lattice.AI.Runtime.Azure/SourceEvidence/`.
- Add Azure SDK dependencies to `OrchestrationPlatform/Lattice.AI.Runtime.Azure/Lattice.AI.Runtime.Azure.csproj` and version them in `OrchestrationPlatform/Directory.Packages.props` only after package/model approval.
- Add deployment definitions only in the platform-approved infrastructure location, with no live index/resource created by a code task.
- Add an indexing worker and durable revision-job adapter in the platform-approved worker/service project; the worker reads the published revision from the owner-approved server-side snapshot source.
- Connect the accepted-publication event in `OrchestrationPlatform/frontend/features/lattice-next/kernel/infrastructure/current-investigation-runtime.ts` to a server-side publication/job boundary only after the durable store/outbox contract exists. Do not use the browser runtime or current file store as the production queue.
- Register `ISourceEvidenceRetriever` in `OrchestrationPlatform/Lattice.AI.Runtime/` using authenticated retrieval. Enforce authorization before retrieval and before Context Package/citation return; structured index filters remain defense-in-depth.

- [ ] **Step 1: Write tests first** for tenant/investigation isolation, unauthorized source evidence, Azure prefilter behavior, exact-ID precedence, revision upsert/removal, stale-on-source-failure behavior, archive/delete suppression, idempotent retries, reconciliation after partial indexing, and current authorization at citation time.
- [ ] **Step 2: Verify all required owner approvals** above. Expected: every dependency has an accountable owner and written decision; otherwise stop before Azure dependency/provisioning/live-data work.
- [ ] **Step 3: Implement the approved durable indexing and Azure retrieval adapters** against the exact approved contracts; add no second planner/compiler or answer path.
- [ ] **Step 4: Run offline contract/adapter tests, approved non-production integration tests, cross-scope negative tests, and the held-out PLM+RAG evaluations.** Expected: zero cross-scope retrieval and passing approved measured quality/latency/cost gates.
- [ ] **Step 5: Obtain explicit release approval before provisioning or live indexing.** No deployment, live-data indexing, or user-facing enablement is implied by completion of this plan.

**Manual checkpoint:** Until every approval is recorded, do not enable a production frontend path or create an index. Verify the app remains on its existing behavior and that no live indexing job is emitted.

## Separate Gate: Source Document and Attachment Extraction

This discovery is separate from the snapshot-first impact slice and is required before describing the product as ingesting full documents.

- Confirm source-native APIs for retrieving Windchill specification/document bodies and Codebeamer attachment bodies; a reference, title, or short description in the investigation snapshot is not the body.
- Confirm source identity/revision, authorization and record-level ACL behavior, deletion/update signals, supported file formats, extraction quality, and stable page/section/field locations with the source owners.
- Use a source-specific server-side adapter. Do not scrape rendered UI nodes or treat the Download JSON graph projection as a document endpoint.
- Until the source owners approve the extraction path and representative sanitized content, keep body extraction, parsing, embedding, and indexing out of the first slice. Report body availability as unknown/unavailable rather than success-shaped empty content.
- The eventual frontend checkpoint must identify a document/attachment record and its source extraction status without logging its body. A separate approved test corpus is required to validate parsed text and citation locations.

## Verification Sequence

After Tasks 1–10, run the focused .NET and frontend suites, then the existing Lattice suites:

- `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj`
- `npm --prefix OrchestrationPlatform\frontend run test:lattice`

After each task, report its focused result and the applicable manual checkpoint from the task. Run Task 11 experiments only with the approved corpus/provider boundary. Do not provision Azure or index live data as part of routine CI. Task 12 remains blocked unless all owner approvals and explicit release approval are obtained.

# Lattice Investigation RAG Design

**Status:** Proposed design updated for a snapshot-first, impact-only fixture-backed slice. No production RAG implementation, live indexing, or deployment is approved by this document.

## Intent

Improve the existing Lattice Copilot's ability to find and explain source-authored engineering evidence inside a live investigation. RAG supplements the current PLM Brain and runtime: it must not discover or assert canonical identities, governed relationships, ontology mappings, impact paths, or impact chains by similarity.

The target user is an engineer asking about an already-open investigation. The desired benefit is that a supported answer can include relevant source descriptions, requirement text, configuration rules, evidence locations, and citations that the graph-only Context Package does not currently carry.

## Repository trace and current evidence

The relevant source-to-answer flow is:

1. **Investigation construction.** `createCurrentInvestigationRuntime` in `OrchestrationPlatform/frontend/features/lattice-next/kernel/infrastructure/current-investigation-runtime.ts` creates the investigation, runs source operations, assembles canonical intelligence, and publishes it. `SourceExecutionCoordinator` in `kernel/application/source-execution-coordinator.ts` records operation events. `CurrentCanonicalAssemblyAdapter` assembles accepted intelligence contracts in `kernel/adapters/current-canonical-assembly-adapter.ts`.
2. **Source adapters and retained text.** The current canonical contract in `frontend/features/lattice-next/contracts/intelligence-v1.ts` carries typed entities, text-capable properties, findings, evidence summaries, temporal fields, and source provenance. The source adapters project data into those fields: Codebeamer requirements include description and custom fields; Windchill includes requirement specifications and source content references; SAP projects material descriptions and operational records; Configit projects model descriptions, rules, expressions, and localization; some of this material is structured rather than long-form prose. The inspected `CurrentSourceExecutionAdapter` dispatches intelligence for Windchill, SAP, Configit, and Codebeamer; its Teamcenter selection is not evidence that a corresponding intelligence adapter is currently wired.
3. **Snapshot persistence.** The browser-side runtime uses `HttpInvestigationAuthority`; the server `serverKernel` uses `FileInvestigationRepository` and `FileInvestigationEventStore` in `kernel/server/file-investigation-store.ts`. Snapshots are revisioned and include the canonical value. The current snapshot identity has investigation/revision/epoch but no tenant or owner field. The file repository is keyed by investigation ID; do not treat that repository or its ID as a production authorization boundary.
4. **Graph enrichment and PLM Brain.** `ensureInvestigationKnowledgeGraph` in `plm-brain/universal/ensure-investigation-knowledge-graph.ts` derives or refreshes graph material from the canonical snapshot and the ontology. `InvestigationKnowledgeGraph` in `plm-brain/contracts/relationship-ontology.ts` contains canonical and ontology-resolved relationships, relationship and impact paths, impact chains, evidence observations, provenance, ontology version, and snapshot revision. `ImpactEvidenceService` retrieves those artifacts and their source references. This is the authority for engineering impact, not a vector index.
5. **Current Copilot routes.** The existing CopilotKit API route calls `executeCopilotTurn`, persists one assistant response to the existing transcript, and renders the existing answer/citation surface. Impact-intent prompts use the .NET runtime only when the rollout flag, endpoint, and credential provider are configured; non-impact prompts use the legacy provider-backed route. The first RAG slice targets only the enabled/configured impact route. Phase 2 structured state carries validated subject references, generic application filters, current snapshot/source/ontology versions, and parent-turn correlation. The Phase 2 `ScopePlanner` currently treats requested application filters as unsupported; its semantics must be made explicit for evidence retrieval rather than silently interpreted as impact-graph filters.
6. **Authenticated runtime.** The existing .NET `EngineeringImpactController` enforces `AiRuntime`, obtains authorization, then `ImpactAnswerService` performs conversation interpretation, entity resolution, scope planning, and authoritative PLM retrieval. `PlmBrainClient` forwards a server workload credential and signed authorization-decision material. The default `IResourceAuthorizationDecisionProvider` is `UnavailableResourceAuthorizationDecisionProvider`; production resource authorization is not presently available.
7. **Context and generation.** The only product-owned approval boundary is `ContextCompiler`. Current `EvidenceRetrievalResult` and `ContextPackage` contain PLM relationships, paths, chains, claims, and citation/provenance references; they do not carry retrieved source text. `PromptAssembler` serializes that package as untrusted evidence. The existing model gateway uses Azure OpenAI, followed by the existing parser and `AnswerValidator`. The compiler already enforces request/investigation/decision binding, provenance, scope, and configured claim/evidence/token budgets, and records omissions.
8. **Evaluation and telemetry.** The .NET golden evaluator tests graph, reference, authorization, and deterministic conversation behavior; it explicitly does not evaluate semantic support or live-model answer quality. Existing OpenTelemetry stages include PLM retrieval, context compilation, generation, and validation, with safe count/latency/token measurements. No indexed retrieval benchmark or production corpus profile was found in the inspected code.

### Approved fixture profile

The approved synthetic fixture `OrchestrationPlatform/evals/engineering-impact/v1/fixtures/requirement-r123.json` contains four synthetic relationship records, one impact path, no impact chains, and four source references across one synthetic source system. Six relationship/path text values have five unique values (16.7% duplicate text by exact value); lengths range 28–65 characters, median 41. It has no long-form source-authored evidence text, so the eligible source-text record count is zero. Its revision, deep-link, provenance, and authorization-decision reference fields are populated, but are synthetic.

This fixture cannot determine production record volume, duplication, revision churn, embedding count, index size, or latency. No downloaded/live investigation payload was treated as approved or sanitized input. A redacted representative corpus and baseline runtime telemetry are required before numerical capacity or latency targets are set.

### Observed local Lattice investigation profile

The user-provided local investigation was inspected in the running Lattice UI and through the existing investigation snapshot API. These aggregate observations describe one investigation only; they are not a representative corpus, extraction approval, or permission to index or send its source text to a provider. No source text or identifiers are copied into this design.

- `HttpInvestigationAuthority.load` reads the revisioned `InvestigationSnapshot` wrapper. It carries identity/revision, lifecycle, source selections, per-operation executions, completeness, warnings, and the published `canonical.value`. This wrapper is the correct shape for an ingestion contract because the canonical value alone cannot report all snapshot/source-operation status.
- The inspected snapshot was revision 1 and partial, with 7 source selections (4 Codebeamer; 1 each Configit, SAP, and Windchill), 239 canonical entities, 209 relationships, and 6 evidence records. Windchill structure/intelligence operations succeeded; SAP, Configit, and Codebeamer operations were partial. The completeness assessment also reported limitations. These counts are local observations, not sizing inputs.
- Source-authored text present in that snapshot was short: observed maximum string lengths were 146 characters for Codebeamer description/detail values, 202 for Windchill descriptions (177 for values), 33 for Configit text fields, and 54 for SAP values. This is not evidence that the underlying documents are short; it shows that this snapshot retains brief fields rather than their full bodies.
- The Windchill specification appeared as a short description with requirement records, not as a full specification body. Codebeamer catalog fields were present, but live item, relationship, and attachment retrieval failed in this environment. No full document or attachment body was available in the snapshot. A document reference or metadata record must not be treated as extracted text.
- Download JSON calls `buildHierarchicalLatticeExport` over the current graph and serializes hierarchy/graph presentation data. It is a useful UI inspection export, but not the canonical snapshot, source-operation envelope, or document-content endpoint. The accepted server-side snapshot revision is the ingestion source for the fields currently retained by Lattice.
- In the UI, users expand graph domains, inspect selected source nodes and their provenance/status in the details panel, and open an investigation-scoped Copilot thread. The Copilot prompt submitted during inspection was rejected by the configured provider, so it produced no validated answer or citations; this says nothing about RAG behavior and was not retried.

Treat source-operation status and entity freshness as separate dimensions. In this example, source operations were partial even though some entity freshness values were `current`; freshness alone is not proof of complete extraction.

## Authority classes

1. **Authoritative structured source data:** source-native IDs, entity type, source application, revision, typed attributes, status, and source timestamp. Resolve and filter using exact IDs and structured fields where possible.
2. **Authoritative engineering intelligence:** canonical identities, governed mappings, ontology-resolved relationships, paths, impact chains, and PLM Brain rationale. Retrieve through PLM Brain; do not create or promote these from vector similarity.
3. **Retrievable source evidence:** source-authored descriptions, requirements, specifications, rules, notes, document text/sections, and other descriptive fields present in a current accepted investigation or an approved source evidence service. The observed snapshot contains short fields and references, not full document/attachment bodies. A linked file is not part of the RAG corpus until an approved source-side adapter has retrieved and extracted its content.
4. **Runtime/conversation state:** current investigation, validated subject IDs, generic application filters, output intent, and parent turn. It shapes a retrieval request but is never corpus content.
5. **Model-generated content:** prior answers, generated summaries, and explanations. Exclude from indexing by default and do not use as source evidence.
6. **Operational/security material:** authorization tokens, signed tickets, telemetry, secrets, and unrelated identity data. Never embed or store in the retrieval corpus.

## Goals and non-goals

### Goals

- Retrieve source-authored text and detailed records that are present in an authorized live investigation.
- Keep the first RAG answer slice limited to impact-intent prompts routed through the configured .NET runtime; do not imply that the separate legacy non-impact Copilot route is covered.
- Preserve exact identifiers, source application, revision, parent entity, source location, citation, provenance, freshness, and authorization decision through retrieval and answer rendering.
- Use exact-ID and metadata filtering before lexical/semantic expansion.
- Combine RAG evidence with PLM Brain's authoritative graph result inside the existing authenticated runtime and Context Compiler.
- Use the Phase 2 subject, investigation, parent turn, and generic application filters; never use prior model prose as retrieval evidence.
- Measure whether retrieval adds relevant evidence and improves engineer usefulness for selected questions, without claiming a general quality gain in advance.

### Non-goals

- Replacing canonical entity resolution, governed mappings, ontology resolution, impact reasoning, authorization, Context Compiler, Phase 1 validation, or Phase 2 state/planning.
- Discovering relationships or impact through nearest-neighbor search.
- Indexing raw investigation JSON, all relationship/path/chain objects, IDs without descriptive content, generated answer text, or every structured field indiscriminately.
- Introducing a second chat route, context compiler, autonomous agent, generic RAG framework, or a new answer-guardrail framework.
- Implementing target-application impact semantics before PLM Brain confirms the contract.
- Adding RAG to non-impact Copilot prompts in the legacy route, or claiming full document/attachment ingestion from the current snapshot/export.
- Claiming production readiness, compliance approval, or a measured LLM quality improvement from offline plumbing tests.

## First vertical slice

Use the requested example as one supported application case, not an application whitelist. This flow is limited to impact-intent prompts routed to the configured .NET runtime; non-impact prompts remain on the existing legacy route and are outside the first slice:

1. Turn 1 asks, “What is impacted if Requirement R-123 changes?”
2. Phase 2 resolves the subject and active investigation; PLM Brain returns the authoritative impact/path.
3. Turn 2 asks for source evidence behind an impact in a selected application (SAP is the initial fixture/example; the record contract and filters remain application-generic).
4. On the follow-up, the runtime freshly retrieves PLM Brain claims. It scopes source-record candidates to the canonical target entity IDs in those claims; a requested application filter is applied to source-record metadata, not used to redefine graph impact semantics. If the current question/state leaves multiple materially different targets ambiguous, Phase 2 clarifies rather than relying on prior model prose.
5. The existing Context Compiler includes the authoritative claim plus relevant retrieved passages, their complete citations/provenance, and explicit omissions. It keeps graph authority distinct from source evidence.
6. The existing prompt and validator preserve one response and inspectable source citations. If no eligible text exists, the Copilot retains the PLM Brain finding and reports that supporting source text was unavailable; it does not weaken or replace the impact conclusion.

## Proposed retrieval record and segmentation

The canonical retrieval unit is a **source record with zero or more structurally located text segments**, not a generic fixed-size chunk and not a relationship/path. Short descriptions remain one record. Long requirement/specification/document text is segmented only at source structure (for example requirement fields, headings, paragraphs, or table rows with headers); every segment retains its parent record and stable location. Compare whole-record, structural-field-group, and structural-plus-semantic segmentation on a held-out query set before choosing a segmentation policy or overlap.

Proposed logical fields, subject to the corpus probe:

- Stable `RecordId`; `TenantId`; `InvestigationId`; `SnapshotRevision`.
- `SourceApplication`, `SourceRecordId`, `CanonicalEntityIds`, `RecordType`, `EntityType`, `Title`.
- `SearchableText` and optional structural `Location`; keep searchable text separate from filterable metadata and returned source content.
- `SourceRevision`, `SourceTimestamp`, `CapturedAt`, `Freshness`, `ContentHash`.
- Snapshot lifecycle/completeness and source-operation status, preserved independently from entity `Freshness`; the projection batch must retain enough of the accepted snapshot envelope to explain partial/failed extraction.
- `EvidenceIds`, `ProvenanceId`, source `Authority`, `DeepLink`, and parent record/segment reference.
- `SegmentationVersion`, `EmbeddingModelVersion`, and `IndexSchemaVersion`.
- Retrieval-time authorization is supplied by the existing server-side decision; do not persist a bearer token or treat a stored metadata filter as authorization.

`RecordId` must be deterministic from the investigation, source application, native record identity/revision, and stable field/segment location. Reindexing identical source content at the same revision must upsert/reuse the same key. Do not place an unbounded structured-attributes blob in filterable vector metadata.

The projection consumes the accepted revisioned `InvestigationSnapshot` and reads source-authored properties from its `canonical.value`. It is not driven by the Download JSON graph export or browser-supplied payload. Allowlist by source application, entity/record kind, and property or source-field metadata; generic properties such as `value` are not eligible without their source field identity and role. Exclude empty/identifier-only content, complete snapshots, duplicated normalized/source copies, graph/path/chain text already represented authoritatively by PLM Brain, generated prose, credentials, telemetry, and fields that are not useful to retrieval. Preserve source text and offsets; do not normalize away engineering symbols, codes, units, or equations.

Carry snapshot lifecycle/completeness, source-operation status, and entity freshness separately. A partial source may have accepted source-authored fields worth testing, but it must remain marked partial; indexing eligibility and default retrieval behavior must be explicit and tested rather than inferred from `Freshness == current`. Do not treat a failed refresh as a deletion or a successful extraction.

The observed investigation supports only a short-field snapshot-first slice. Full Windchill document bodies, Codebeamer attachment bodies, and other linked-file content require the separate source-document extraction gate below. Until then, document references and metadata are not searchable document content.

## Retrieval behavior and runtime integration

- **Impact/impact-path questions:** PLM Brain is required and authoritative. RAG is optional supporting evidence retrieval, linked to the resolved impact entities/claims.
- **Copilot route:** the first slice runs only on impact-intent prompts that successfully route to the configured .NET runtime. Non-impact prompts currently use the legacy provider-backed route; extending RAG to them is a separate scope decision.
- **Exact identifier questions:** exact source/canonical ID lookup first, then current authorization and record resolution; do not depend on embeddings to retrieve an identifier.
- **Requirement/detail/evidence questions:** resolve the current entity first; retrieve its source-authored descriptions and supporting evidence.
- **Semantic paraphrases:** lexical plus vector retrieval over eligible source text.
- **Application/date/revision filters:** server-constructed structured filters applied before semantic ranking. The first slice filters source-evidence records, not the meaning of PLM Brain impact paths. Phase 2 filters must remain generic across supported source applications.
- **Unanswerable questions:** no matching current evidence means the existing disposition/answer behavior applies; similarity alone is not evidence of support.
- **Fusion:** benchmark Azure AI Search hybrid lexical/vector ranking (RRF) against lexical-only and vector-only. Keep exact identifier matches and PLM Brain claims explicit; retrieval scores are ranking signals, never truth/confidence. No reranker or query-expansion/HyDE step in the first slice unless a held-out benchmark shows a concrete gain and its processing boundary is approved.
- **Planner:** extend the existing typed Phase 2 plan to specify which authoritative graph result and source-evidence channels are needed, generic filters, evidence type, and reason. Do not introduce a second planner or let a model improvise database access.
- **Compiler:** extend only the current Context Package contract/compiler to carry retrieved source text separately from graph claims, with source ID/system/version/location/provenance/decision/retrieval method/score/parent and index version. Reconcile duplicates, keep graph claims authoritative under budget, retain citations, and report omitted evidence. Scores do not make a passage more authoritative.
- **Prompt/validator/UI:** reuse the current prompt catalog, assembler, model gateway, answer schema/parser, validator, CopilotKit route, transcript persistence, and one-message citation rendering. Add only the distinction needed between PLM Brain claim and supporting source passage; citations must resolve to current authorized source/evidence IDs. Do not shorten successful answers or add arbitrary confidence thresholds, refusal rules, or low-value filters.

## Backend and embedding direction

### Provisional first benchmark target: Azure AI Search

Use Azure AI Search as the first backend candidate, subject to approved tenant/region, network, retention, residency, and cost review. It can provide lexical and vector fields in one index and hybrid retrieval with reciprocal-rank fusion; use a structured prefilter for investigation, tenant, revision/freshness, and requested source application. Azure's `preFilter` behavior and RRF must still be benchmarked against the actual corpus. Search filters reduce candidates; they are not an authorization boundary.

The repository currently has Azure OpenAI and Azure Monitor integration, but no Azure AI Search package, index, deployment definition, or verified Search resource. This is therefore a new managed dependency with service-tier/index capacity cost, Azure-specific query/schema lock-in, and potentially customer engineering data in an Azure-managed service. No real data may be sent until the data owner approves the service, region, networking, retention, and provider processing boundary.

### Alternatives considered

- **OpenSearch self-hosted:** stronger deployment control and can combine lexical/vector search, but adds cluster operation, upgrades, capacity, backup, access-control, and support burden; no OpenSearch deployment or client exists in this repository.
- **PostgreSQL with pgvector:** a potential bounded/internal or air-gapped option if a supported PostgreSQL service already exists, but no such database dependency is present in the inspected Lattice runtime and it would need an operational decision and lexical-search design.

Do not implement all three. If Azure's approved boundary or platform requirements fail, stop before provisioning and re-run the backend comparison against measured corpus volume and platform constraints.

### Embedding shortlist (not a selection)

Benchmark Azure OpenAI `text-embedding-3-small` and `text-embedding-3-large` where the approved Azure region exposes the required deployment; include one locally hosted open-weight candidate such as `BAAI/bge-m3` only if its license, host capacity, language coverage, and supply-chain review pass. Confirm the exact model/version, output dimensions, maximum input, tokenizer, deployment availability, query/document formatting, license, residency, and cost at experiment time. Preserve original text and version vectors by model; changing models requires a re-embedding rollout. Do not select or fine-tune a model from a public leaderboard alone.

## Index lifecycle, tenancy, and security

- **Trigger:** enqueue an indexing job for the exact revision after the canonical snapshot has been accepted and published. The job carries investigation/revision identity and safe correlation only; the worker reads the revisioned `InvestigationSnapshot` and its `canonical.value` from the server-owned snapshot store rather than accepting browser-supplied source content or the graph export.
- **Durability:** the production trigger must use a durable job/outbox transactionally coupled to canonical publication, with idempotency on investigation/revision/record/content/segmentation/model/schema versions and a reconciliation worker that can detect and repair missed or partial indexing. The current file event store and snapshot repository do not provide this transaction or multi-instance job durability. No queue/database is selected in this design: the platform owner must identify the approved durable job and production snapshot-store integration before indexing implementation is planned for activation.
- Index only a published canonical revision after its source data has passed existing acceptance/validation and trusted tenant/object authorization. If a source has record-level ACLs not represented in the accepted investigation, do not index its text until an approved authorization projection exists.
- Record per-investigation indexing status and source/index revision. Upsert changed content by stable ID and content hash; do not create duplicates for same-revision retries.
- On a successful refresh, upsert changed records and delete IDs removed from the current accepted snapshot. When a source fails and the current snapshot retains old data as stale, mark it stale and exclude it from default current-evidence retrieval; do not interpret a failed refresh as a source deletion. Preserve partial/failed operation status even when an entity's own freshness is `current`; define and test how each status affects indexing and retrieval.
- Archive/delete/tenant offboarding must disable retrieval immediately and propagate physical deletion according to approved retention. Authorization revocation is rechecked at query and citation time. Authorization-scope changes invalidate or revalidate related indexed records.
- A source-content revision updates only affected records. An ontology version change requires fresh PLM Brain paths and updated entity links/metadata, not automatic re-embedding of unchanged source text. Segmentation, embedding-model, and index-schema version changes require controlled rebuilds and cutover.
- The candidate Azure index may be a shared logical index partitioned by `TenantId` and `InvestigationId` only after a trusted investigation-to-tenant binding exists. Current snapshot contracts do not contain this binding; a caller-supplied filter or `InvestigationId` alone is not sufficient. Compare per-customer/per-tenant isolation after corpus and workload sizing.
- Enforce authorization before retrieval, again before Context Package compilation/citation return, and on any future cache read. Index metadata filters are defense-in-depth, not proof of permission. Add cross-tenant and cross-investigation negative tests.
- No external parsing, embedding, reranking, telemetry, or generation egress without data-owner/security approval. Inspect the chosen Azure region's residency, private endpoint/VNet, encryption, key management, logging, deletion, retention, and processor terms. Keep all source content, embeddings, prompts, and answers out of telemetry.

## Caching

Do not add final-answer, semantic-query-result, or context-package caching in the first slice. Dynamic investigation evidence and authorization changes make these high-risk and low-evidence optimizations. Make indexing idempotent and reuse unchanged vectors only by tenant-scoped content hash plus segmentation, model, and schema version. Measure embedding reuse before adding a separate cache. Provider prompt-prefix caching is not assumed to be available for the existing Azure OpenAI model.

## Latency and capacity

Do not set a fabricated numeric SLA. The code defines source extraction windows, but these are not Copilot retrieval latency baselines. Existing runtime telemetry has per-stage histograms but no measured production distribution was available in this repository review. Measure baseline answer p50/p95, PLM retrieval, context compilation, model generation, payload sizes, and approved fixture/real sanitized corpus counts first. Then set provisional retrieval and end-to-end budgets from observed baseline and user experience; measure cold indexing, incremental update, exact lookup, lexical, vector, hybrid, and authorization overhead separately. Cost estimates must use measured records/segment counts, embedding calls/dimensions, Search tier/replicas, and Azure region prices.

## Evaluation and required experiments

Keep retrieval and generation evaluation separate, use a held-out Lattice-specific dataset, and do not use an LLM judge as the sole gate. Extend the existing synthetic golden evaluation where appropriate; add sanitized source-text cases with human-reviewed relevance and citation labels.

1. **Corpus profile:** by source and record type, record count, text lengths/token lengths, empty/identifier-only rates, exact and normalized duplicate rates, revision/timestamp coverage, source/provenance/deep-link/ACL coverage, segmentation candidates, projected segment/vector count and size. Profile at least one approved redacted investigation; synthetic R-123 is a smoke fixture only.
2. **Segmentation comparison:** whole record vs structural field groups vs structural plus semantic split; measure relevant evidence coverage, duplicate retrieval, citation location correctness, segment count, and indexing cost.
3. **Embedding comparison:** exact identifiers, abbreviations, engineering vocabulary, cross-system terms, paraphrases, hard negative distractors, long and short records, and multilingual cases only if required; measure exact-ID success, Recall@k, Precision@k, MRR/nDCG, indexing/query latency, dimensions, cost, and hosting compliance.
4. **Retrieval comparison:** exact/metadata, lexical only, vector only, hybrid RRF, and hybrid plus reranking only if justified; evaluate generic application filters and exact ID precedence.
5. **PLM Brain plus RAG:** matched cases for PLM-only, RAG-only (diagnostic baseline only), and PLM+RAG. The combined system must preserve authoritative paths, add relevant evidence when it exists, and never derive a governed impact from vector similarity.

Required negatives include cross-tenant/investigation retrieval, unauthorized source evidence, stale revisions, deleted records, conflicting revisions, empty vector results when PLM Brain still has an answer, prompt injection in source text, unsupported application filter, missing source text, exact-ID distractors, and conversation follow-ups. Generation evaluation covers disposition, claim support, citation resolvability/currentness, contradiction handling, uncertainty/omission, answer usefulness reviewed by engineers, latency, and cost. Current offline answer-validation tests are not semantic answer-quality evidence.

## Release and activation gates

Do not enable RAG for users until all applicable gates pass:

1. A sanitized representative corpus and source-owner approval define the text fields and deployment boundary.
2. Retrieval records preserve stable identity, source revision/location, provenance, and authorized tenant/investigation scope.
3. Idempotent indexing, revision updates, deletion, stale-source behavior, archive, and rebuild have passing tests.
4. Authorization is enforced before retrieval and again before compilation/citation return; cross-tenant leakage is zero in negative tests.
5. Exact identifiers are served through deterministic lookup; hybrid search improves or complements the best single channel on held-out evidence queries.
6. PLM Brain+RAG measurably adds relevant evidence for the selected use cases without replacing, contradicting, or suppressing authoritative graph claims.
7. Context Compiler remains the only context-approval boundary; retrieved instructions cannot change policy; citations resolve to current authorized sources; omitted evidence is reported.
8. Stale/deleted results are excluded, latency/cost targets are set from measured baselines and met, and Phase 2 generic filters affect evidence retrieval correctly.
9. Offline retrieval/generation evaluations pass, then approved live-model validation with GPT-4o-mini demonstrates useful, evidence-grounded answers with engineer review.
10. The approved existing Copilot UI displays one coherent answer with inspectable sources; no arbitrary cap or guardrail blocks supported normal results.

## Open production blockers and explicit deferrals

- Platform identity owner must provide the approved server-side identity/tenant binding for an investigation and the credential/authorization flow used by indexing, retrieval, and citation resolution.
- Security/product owners must supply a production `IResourceAuthorizationDecisionProvider`, approve the RAG processor/data boundary and retention, and confirm tenant and investigation ownership semantics. The current default provider is unavailable.
- Platform/data owner must provide a sanitized representative investigation and confirm source-system text, document extraction availability, field-level ACL behavior, revision/deletion signals, and Teamcenter support.
- Platform/cloud owner must approve Azure AI Search region, network/private endpoint, identity, capacity tier, backup/recovery, operational owner, and cost before provisioning. If not approved, revisit self-hosted options.
- PLM Brain owner must confirm how generic source-application and entity filters apply to evidence records. Do not infer application-level impact semantics from text search.
- Keep broad requirement/detail retrieval, investigation-wide summaries, all-source rollouts, reranking, query expansion, answer caching, and full file/document body ingestion deferred until the first impact-plus-source-evidence slice passes. The snapshot-first slice may use only allowlisted source-authored fields already retained in the accepted canonical value.
- No production implementation, infrastructure provisioning, model selection, live-data indexing, or Phase 3 quality claim is part of this design approval.

### Separate source-document and attachment extraction gate

Before claiming full-document ingestion, source owners must identify and approve source-native retrieval for Windchill specification/document bodies and Codebeamer attachment bodies (and any other linked files in scope). Confirm native identity and revision, per-record authorization/ACLs, update/deletion signals, supported formats, extraction quality, and stable page/section/field locations. Implement this through source-specific server-side adapters, not UI scraping or the graph export. Keep this track separate from the snapshot-first impact slice; until approved and verified, report body availability as unknown/unavailable and do not send document content to parsers, embedding services, or search providers.

## Approaches

1. **Azure AI Search, runtime-authorized, benchmark-first (recommended and selected as the provisional direction).** Use Azure hybrid lexical/vector search for source text and retain PLM Brain as the authoritative impact channel. This best reuses the repository's existing Azure OpenAI environment, but requires fresh compliance, tenancy, corpus, capacity, and cost evidence before deployment.
2. **Self-hosted OpenSearch or PostgreSQL/pgvector.** Prefer only if customer residency, air-gap, or platform control disallows managed Azure. This reduces managed-service data movement but adds infrastructure, operations, backup, security, and support work not present in the repository today.

The user selected Azure AI Search as the planning direction. This selection is not production deployment approval and does not pre-empt the experiments or release gates above.

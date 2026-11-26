# Lattice Impact Answer Evidence Integration Design

**Status:** Proposed. This design builds on the approved snapshot-first RAG design and does not approve production indexing, live source access, or deployment.

## Intent

Improve answers to engineering-impact questions by combining PLM Brain's authoritative graph with deterministic source facts, Product 360/cross-application context, and source-authored passages in one existing backend answer path.

The first delivery is impact-first. It does not claim that every Copilot intent uses one runtime. It extends the existing impact runtime and its `ContextCompiler`, then uses measured results to decide whether to expand routing to exact-fact, inventory, and document questions.

## Current state and evidence

- The existing RAG plan already defines an impact-intent vertical slice: PLM Brain retrieval plus optional source evidence through `ImpactAnswerService`, `ContextCompiler`, prompt assembly, answer validation, and the current Copilot transcript/citation UI. See [the approved RAG implementation plan](../plans/2026-11-19-lattice-investigation-rag.md) and [the approved RAG design](2026-11-19-lattice-investigation-rag-design.md).
- The Copilot route calls the .NET runtime only for enabled, configured impact-intent turns. Non-impact intents still use the legacy TypeScript path.
- The runtime now has a source-evidence retrieval seam and compiler/prompt/response contracts in the local worktree. The production composition still uses an unavailable retriever; fake retrieval is test-only. Manual route verification and commit boundaries remain pending.
- The copied generic-fact and document-retrieval modules are prototypes in the worktree, not a production path. The fact shadow is not part of `executeCopilotTurn`, and the document retrieval runtime has no configured index or access-policy provider.
- The current source-evidence projection is snapshot-based and allowlisted. It cannot provide full document/attachment bodies absent a separately approved source-native extraction path.
- The branch comparison establishes that Product 360 and cross-application context are useful integration inputs, but does not establish that the copied generic-fact implementation was part of the factual-serving branch.

This design therefore treats current source and retrieval capabilities as integration inputs to validate, not as evidence of production readiness or answer-quality improvement.

## Goals

1. Keep one answer orchestration path for the first impact-intent slice.
2. Provide typed deterministic facts and Product 360/cross-application context as distinct evidence candidates.
3. Keep source-authored passages in the existing RAG seam.
4. Compile graph claims, facts, application context, and passages together through `ContextCompiler`, the sole context-approval boundary.
5. Preserve source values, lineage, temporal scope, provenance, authority, and citation linkage end to end.
6. Measure whether each evidence class helps representative answers without weakening valid PLM Brain answers.
7. Improve snapshot field coverage only where real user questions and source evidence show a gap.

## Non-goals

- Unifying every Copilot intent in this first delivery.
- Replacing or extending PLM Brain's authority over identity, relationships, impact paths, or impact chains.
- Adding a second planner, context compiler, answer-policy engine, or user-facing answer route.
- Letting deterministic fact adapters or semantic retrieval directly decide impact or bypass `ContextCompiler`.
- Activating a production vector index, embedding provider, durable indexing worker, or live source-system API.
- Claiming full-document or attachment ingestion from references or short snapshot descriptions.
- Adding arbitrary confidence thresholds, fixed result caps, refusal paths, or clarification loops.

## Approaches considered

### A. Impact-first integration, then expand — selected

Complete and evaluate the approved impact path. Add deterministic facts and Product 360 context as typed candidates beside PLM Brain evidence and retrieved passages. Send all candidates through the existing `ContextCompiler`. Keep non-impact Copilot behavior unchanged until the first slice is measured.

**Tradeoff:** non-impact intents temporarily remain on the legacy route, but this delivers a testable improvement sooner and avoids a broad routing redesign before the evidence model is proven.

### B. Unify all Copilot intents before the first release

Redesign routing, query contracts, data access, authorization, generation, and evaluation for impact, exact facts, inventories, and document questions together.

**Tradeoff:** a broader end state is possible earlier, but this expands scope and source-data dependencies and delays validating the already-started impact/RAG slice. It is not selected for this delivery.

## Proposed architecture

```text
Impact-intent Copilot turn
  -> existing authenticated .NET runtime
     -> existing Phase 2 subject resolution and scope planning
     -> PLM Brain: authoritative entities, relationships, paths, and chains
     -> deterministic fact provider: exact snapshot-backed field candidates
     -> Product 360 projection: application participation/context candidates
     -> source-evidence retriever: authorized source-authored passages
  -> ContextCompiler: sole context-approval boundary
  -> PromptAssembler: render approved graph, facts, context, and passages
  -> existing model/parser/AnswerValidator
  -> existing Copilot response, transcript, and citations
```

The providers return candidates and diagnostics; they do not choose claims, plan tool access, or approve context. PLM Brain relationships and impact paths remain unchanged. The first runtime expansion is limited to impact-intent turns and linked entities already validated by Phase 2/PLM Brain.

### Product 360 and cross-application context

Port useful application participation and overview information as typed candidates, not as trusted free-form summary prose. Preserve the source application, source-operation status, snapshot revision, source entity/evidence references, and any citation linkage. A record's presence in an application may support “this investigation contains a record from this application”; it does not prove identity equivalence, a direct relationship, causality, or impact.

The compiler may admit supported application-context candidates alongside graph claims. Rendering may group them by application, but neither a pre-context builder nor `PromptAssembler` may approve them or promote them to PLM relationships.

### Deterministic facts

Define a versioned cross-runtime fact contract rather than treating a raw source property or a rendered summary as a fact. Each fact candidate should retain:

- Investigation/snapshot revision and canonical/source entity identity.
- Source application, native record kind/ID/revision, canonical entity kind, field ID, and source field name.
- Exact source value and declared type; any normalized/display value must be separate and carry a versioned transformation trace.
- Dimensions, units/currency/precision when present, and temporal validity/observation metadata.
- Completeness, freshness, derivation status/authority, provenance, and eligible citation IDs.

Source-specific adapters map fields actually present in accepted canonical snapshots into this contract. The first implementation should inventory available fields and representative questions before committing to application coverage. Do not infer field semantics from a generic property name such as `value`, and do not claim source-system live lookup when only snapshot data was read.

Deterministic discovery matches validated investigation/entity/field/dimension/time scope and returns a typed outcome (found, compatible, conflicting, stale, unavailable, or unsupported). It does not create a final answer or override the existing planner. Exact standalone fact questions remain outside the first delivery unless they are already routed as part of an impact-intent turn.

### Source-authored RAG evidence

Continue the existing `ISourceEvidenceRetriever` seam. Keep exact identifiers and metadata filters deterministic; use lexical/semantic search only over eligible source-authored text. Retrieval scores are ranking signals, not confidence or truth. Search results do not create entity identity or graph edges.

The initial source is the accepted, revisioned server-owned investigation snapshot, using only fields whose provenance and user value are demonstrated. Full document/attachment bodies and production indexing remain behind the source-owner, identity, authorization, durable-storage, and cloud/data-boundary approvals in the existing RAG plan.

### Compilation, generation, and presentation

- `ContextCompiler` validates candidate binding, provenance, authorization decision, revision/scope, conflicts, and existing configured budgets; it reports omissions while preserving independently valid graph claims.
- `PromptAssembler` renders the approved package. Retrieved text is untrusted data, never instructions.
- `AnswerValidator` validates generated claims and citation references against the compiled package; it does not become a second planner or policy engine.
- The existing Copilot response and transcript render citations from approved sources only. A deterministic renderer may format a compiler-approved fact, but must not bypass compilation or invent authority.

## Data-layer work

The first data-layer task is a coverage and lineage inventory over synthetic fixtures and approved/sanitized examples: which source fields are retained in canonical snapshots, which have stable source-field identity and provenance, which support common engineer questions, and which are absent or partial. Use this evidence to prioritize source adapters and projection improvements.

Do not broaden an allowlist just to increase record counts. A field should be added when its source meaning, authority, user value, and citation/provenance path are established. If useful information is absent from the accepted snapshot, report the gap and identify the source-owner/API/authorization requirement; do not make a short description stand in for a document body.

## Evaluation and success evidence

Use the same impact-intent questions and snapshot revisions to compare:

1. PLM Brain only.
2. PLM Brain plus deterministic facts.
3. PLM Brain plus RAG passages.
4. PLM Brain plus facts, Product 360 context, and RAG.

Include cases where each evidence channel helps, where PLM Brain already answers, where evidence is missing/partial/stale/conflicting, and where a source passage contains instruction-like text. Label expected facts, citation links, source coverage, and unchanged authoritative graph paths.

Evaluate retrieval separately from answer generation. Report exact-value accuracy, source/citation correctness, evidence coverage, retrieval relevance, answer support, and relevant latency/cost measurements when available. Start with fixtures and approved held-out data; do not claim improvement from synthetic plumbing tests alone or set numerical gates without a measured baseline and owner agreement.

## Risk and rule rationale

| Rule or boundary | Risk prevented and why it is real | Necessity | User-value tradeoff |
|---|---|---|---|
| PLM Brain alone establishes relationships and impact paths | Similarity or application co-membership can suggest a link that is not a governed engineering relationship. | Prevents false impact/causality claims while preserving graph authority. | Source evidence can explain a graph path but cannot invent one. |
| Bind facts/passages to the current investigation, revision, request, and authorization decision | Evidence may come from another revision, request, or access decision. | Prevents cross-scope reuse and incorrect citations. | A mismatched candidate is omitted; valid graph evidence remains usable. |
| Load passage text only after current authorization permits it | Indexed source text can contain restricted engineering information. | Prevents unauthorized disclosure from the retrieval store. | Unauthorized passages are unavailable; authorized candidates remain retrievable. |
| Preserve snapshot/source-operation completeness separately from entity freshness | Partial source extraction can coexist with an entity marked current. | Prevents presenting partial coverage as complete or treating a failed refresh as deletion. | Coverage is described accurately; a partial snapshot is not silently discarded wholesale. |
| Admit source fields only with established source identity, meaning, and provenance | Generic or generated fields can be mistaken for source-authored evidence. | Prevents untraceable facts and source misattribution. | Fields without adequate lineage are not presented as source-backed facts until mapped. |
| Honor existing configured context budgets and report omissions | Model-input limits are operational constraints already enforced by the runtime. | Preserves a measurable limit without adding an arbitrary new cap. | Some candidates may be omitted with reasons; useful evidence is prioritized by existing policy. |

No new confidence cutoff, generic source restriction, or refusal rule is introduced by this design.

## Merge and implementation sequence

1. Treat `compare-ai-runtime` as the integration destination; do not merge the divergent branches wholesale.
2. Finish the current Task 7–9 implementation and its focused/manual checks so the existing runtime path is a verified base.
3. Align the fact and source-evidence contracts; add fact candidates and Product 360 context to the runtime/compiler boundary.
4. Add focused tests and matched PLM-only/combined evaluations; retain current non-impact routing.
5. Use evaluation and field-coverage evidence to decide which additional intents and source fields to support.
6. Plan production index/source-body work separately after the approval gates in the existing RAG plan are met.

## Decisions left to the builder

- Exact contract names and serialization shape, following existing repository conventions.
- The initial source-field adapter subset, chosen from the coverage inventory and available test fixtures rather than assumed in advance.
- The smallest existing test/evaluation suites that prove each stage without duplicating test infrastructure.
- How to represent source-operation and citation metadata in the compiled package while keeping existing graph claim contracts stable.

These are implementation details and should not change the selected impact-first scope or authority boundaries.

## Builder-check clarifications

- **Authorization for the first slice:** use the existing runtime authorization decision and fixture fake. Production retrieval remains blocked until the production authorization provider, source ACL behavior, trusted ownership binding, and required owner approvals in the RAG plan exist.
- **Initial data:** use the existing synthetic source-evidence and impact fixtures, plus contract-shaped test records. Do not send live investigation/source text to providers or claim full-document ingestion.
- **Evaluation success:** compare matched PLM-only and evidence-augmented cases and report the measured metrics. Do not impose a numerical quality threshold before an approved representative baseline exists. Fixture/test success proves wiring and regression behavior, not production answer-quality improvement.
- **Evaluation ownership:** existing reviewed synthetic cases are sufficient for implementation tests. A source/PLM-owner-reviewed held-out set is required before making a real-corpus quality claim or using results to expand the product scope.
- **Latency and cost:** retain existing configured context/model budgets and collect aggregate measurements. Do not add an SLA, result cap, cache, or other operational restriction without measured need and owner agreement.

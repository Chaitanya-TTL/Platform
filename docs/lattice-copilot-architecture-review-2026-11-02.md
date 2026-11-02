# Lattice Copilot Architecture Review

## 1. Architecture Assessment

### Verdict in one sentence

**The Lattice architecture is fundamentally sound as an Engineering Intelligence platform, but its Copilot orchestration layer has become too implicit, stateful, and monolithic to scale safely without restructuring.**

This is **not a case for rewriting PLM Brain or replacing the knowledge graph**. It is a case for separating responsibilities that have accumulated inside the Copilot layer.

The current system has the right major concepts:

```text
Source systems
  → canonical intelligence
  → identity and relationship intelligence
  → graph and impact analysis
  → evidence-aware reasoning
  → engineering answer
```

That conceptual pipeline is correct.

The problem is that the implementation increasingly depends on hidden behavior inside a large `context-builder.ts` file:

- question classification
- investigation-vs-entity scope
- entity ranking
- relationship ranking
- cross-source materialization
- traversal selection
- evidence selection
- reasoning package construction
- engineering brief construction
- compression
- answer coverage repair
- diagnostic counters

That is too much policy in one module. The recent bugs were not random defects. They were symptoms of **implicit orchestration contracts**.

### Fundamental soundness

#### What is sound

- The domain model is correct: entities, relationships, evidence, identity, ontology, paths, and impact chains are the right primitives.
- The system has a valuable deterministic intelligence layer before the LLM.
- The model is not expected to independently reconstruct the PLM graph.
- Evidence and provenance are treated as first-class data.
- The system distinguishes potential impact from causation.
- The system has fallback and confidence behavior.
- The architecture can support enterprise auditability better than a free-form agent.

#### What is not sound enough

The Copilot currently behaves like a collection of heuristics rather than a clearly defined orchestration runtime.

For example, the system has had to add explicit fixes for:

- summary questions being incorrectly treated as entity questions
- business entities losing to metadata entities
- engineering relationships losing to graph-heavy metadata relationships
- cross-source identity entities not becoming relationships
- relationship artifacts being generated but not surviving context construction
- prompt payloads requiring answer-coverage repair after model generation

That pattern means the architecture is **salvageable, but not stable as-is**.

## 2. Current-State Scorecard

| Area | Score | Assessment |
|---|---:|---|
| Source extraction contracts | 8/10 | Clear enough to support multiple systems, but source semantics likely remain uneven |
| Canonical intelligence model | 8/10 | Strong foundation for entities, relationships, evidence, provenance, and temporal state |
| Identity resolution | 7/10 | Valuable, but identity membership has not consistently become graph semantics |
| Relationship ontology | 8/10 | Good direction; deterministic relationship meaning is better than LLM-invented semantics |
| Knowledge graph | 7.5/10 | Useful and explainable, but graph completeness depends on upstream materialization |
| Impact paths/chains | 8/10 | Strong engineering value; should remain deterministic |
| Evidence/provenance | 8/10 | Better than most early Copilot systems |
| Context retrieval | 5.5/10 | Too heuristic and tightly coupled to question interpretation |
| Context compression | 6/10 | Correct goal, but preserving content through multiple competing limits is fragile |
| Engineering brief | 7/10 | Good abstraction, but currently downstream of unstable ranking and selection |
| Prompt assembly | 6.5/10 | Reasoning-first structure is right; still compensates for upstream ambiguity |
| Intent/scope routing | 5/10 | The M1 issue demonstrates that scope is not a first-class concept |
| Answer validation | 6.5/10 | Useful guardrails, but answer repair is partly compensating for weak orchestration |
| Evaluation/benchmarking | 5/10 | Benchmarks exist, but they are not yet a release gate with systematic metrics |
| Observability | 4/10 | Relationship-flow diagnostics are useful, but likely not a unified production trace |
| Caching | 3/10 | No clearly defined multi-layer cache strategy |
| Enterprise operational maturity | 5.5/10 | Strong prototype-to-pilot foundation, not yet enterprise platform maturity |

### Overall

- **Engineering Intelligence platform:** 8/10
- **Copilot orchestration:** 5.5/10
- **Production enterprise readiness:** 6/10
- **Architecture direction:** correct
- **Implementation modularity:** insufficient

## 3. Main Risks

### A. The context builder is becoming a policy engine

At roughly 2,000 lines, `context-builder.ts` is no longer simply building context.

It is deciding:

- what the question means
- whether the question needs an entity
- which entities matter
- which relationships matter
- what counts as engineering relevance
- which graph edges are synthetic
- which evidence survives
- what the model should see
- what the model must say afterward

That creates a high-risk failure mode: **a small ranking or classification change can alter graph scope, evidence scope, answer quality, and confidence simultaneously.**

### B. Scope is not a first-class architectural object

The M1 problem exposed this clearly.

There are at least two fundamentally different request types:

```text
Investigation-scoped request
"What applications are involved?"
"What relationships exist?"
"What evidence is available?"

Entity-scoped request
"What is the impact of SR-001?"
"What depends on MAT7893?"
```

These should not be represented only as a Boolean buried inside retrieval logic.

They require different contracts:

```text
InvestigationScope
  - all entities
  - all applications
  - all relationships
  - all findings
  - all evidence

EntityScope
  - focal entity
  - bounded neighborhood
  - relevant paths
  - relevant evidence
```

Currently, scope is inferred indirectly from intent, identifier detection, confidence thresholds, and fallback behavior. That is fragile.

### C. Graph completeness is confused with ontology resolution

The cross-source issue demonstrates an important architectural distinction:

```text
Ontology-resolved relationship
≠
All meaningful investigation connectivity
```

A subject representation relationship, identity-domain membership, or cross-source projection may be valid traceability even if no ontology evidence rule resolves it.

If the system only trusts `knowledgeGraph.resolvedRelationships`, it will under-report connectivity.

The graph needs explicit categories:

- source-explicit relationship
- ontology-resolved relationship
- identity traceability relationship
- subject-representation relationship
- projection relationship
- inferred engineering relationship
- unresolved candidate relationship

These should not be hidden as ad hoc synthetic edges in the Copilot context layer. They belong in the intelligence graph contract.

### D. Answer repair is masking upstream defects

`ensureEngineeringAnswerCoverage()` is useful as a safety net, but it should not become a core reasoning mechanism.

If the model repeatedly omits relationships and the system appends them afterward, the result can become:

- structurally valid but stylistically awkward
- repetitive
- semantically disconnected
- difficult to explain
- hard to evaluate

Answer repair should be the final guardrail, not the primary mechanism ensuring answer completeness.

### E. Heuristic scoring will become difficult to govern

The business-weighting change was directionally correct. However, hard-coded weights such as:

- requirement: `0.90`
- part: `0.85`
- lifecycle: `0.15`
- specifies: `100`
- contains: `20`

will eventually become a hidden policy system.

That is acceptable for an initial deterministic ranking policy. It becomes dangerous when:

- different product areas need different weights
- customers have different terminology
- source systems use different entity taxonomies
- the ranking must be explained to users
- benchmark optimization begins overfitting the fixture data

The weights need to become versioned policy, not scattered implementation constants.

### F. Existing graph snapshots can become stale semantically

The current graph reuse logic checks structural properties such as:

- schema version
- snapshot revision
- traversal depth
- ontology version
- presence of arrays
- impact-chain shape

That is useful, but insufficient if graph semantics evolve.

A graph may be structurally valid while missing:

- cross-source identity edges
- subject-representation edges
- new relationship categories
- updated policy metadata

The graph needs a semantic derivation/version fingerprint, not just structural validation.

## 4. What To Keep

### Keep the deterministic PLM Brain

Do not replace it with an agent.

The PLM Brain provides:

- repeatability
- provenance
- auditable relationship semantics
- bounded traversal
- explicit uncertainty
- engineering-specific impact logic

That is exactly what enterprise engineering systems need.

### Keep the ontology

The ontology and `relationships.md` direction should remain.

LLMs should not invent whether a relationship means:

- specifies
- represents
- validates
- impacts
- contains
- configured by

Those semantics belong to governed domain logic.

### Keep the reasoning package and engineering brief

The transition from raw graph JSON to:

```text
Reasoning Package
  → Engineering Brief
  → answer
```

is correct.

The engineering brief is the right abstraction for the language model. It should be made more explicit and stable, not removed.

### Keep evidence-first answering

The following policies are strong and should remain:

- facts must cite evidence
- hypotheses must disclose uncertainty
- potential impact is not causation
- relationship definitions do not prove instances
- missing evidence must remain visible
- unresolved relationships must not be silently treated as facts

### Keep bounded retrieval

Do not send the entire graph to the model.

The model should receive:

1. question and scope
2. engineering brief
3. findings
4. relationship narratives
5. impact chains
6. evidence
7. unresolved gaps
8. bounded supporting context

### Keep fallback behavior

A deterministic fallback is essential for:

- unavailable LLM provider
- invalid model output
- low evidence
- ambiguous entity requests
- incomplete source coverage

## 5. What To Refactor

### A. Split context-builder responsibilities

The current file should eventually become several explicit components:

```text
Question Understanding
  → Scope Resolution
  → Retrieval Plan
  → Graph Projection
  → Evidence Selection
  → Reasoning Package
  → Engineering Brief
  → Context Budgeting
```

The exact filenames can evolve, but the boundaries should be real.

#### Recommended boundaries

##### 1. Question understanding

Produces:

```text
QuestionUnderstanding
  - intent
  - scope: investigation | entity
  - requested entities
  - requested applications
  - requested output dimensions
  - clarification requirement
```

##### 2. Retrieval plan

Produces:

```text
RetrievalPlan
  - scope
  - focalEntityIds
  - traversalDirection
  - traversalDepth
  - relationship categories
  - evidence categories
  - budget
```

##### 3. Graph projection

Produces an answer-oriented graph view from the authoritative intelligence graph.

This is where cross-source identity, subject representations, and projection relationships should be included explicitly.

##### 4. Reasoning package

Consumes only the retrieval plan and graph projection.

It should not classify the user question or decide whether a focal entity is required.

##### 5. Engineering brief

Consumes only the reasoning package and policy configuration.

It should not discover relationships or repair missing graph semantics.

##### 6. Context budgeter

Owns compression and truncation.

It should return explicit omissions, for example:

```text
Omissions:
  relationships: 4
  entities: 12
  evidence: 7
  reason: character budget
```

The current implementation has some of these concepts, but the boundaries are not strong enough.

### B. Make scope explicit

Introduce a first-class scope model conceptually like:

```text
scope:
  kind: "investigation" | "entity"
  focalEntityIds: []
  clarificationRequired: false
```

For the M1 question:

```text
scope.kind = "investigation"
focalEntityIds = []
clarificationRequired = false
```

For:

```text
What is the impact of SR-001?
```

```text
scope.kind = "entity"
focalEntityIds = ["SR-001"]
clarificationRequired = true/false
```

This removes the current ambiguity where `questionIntent`, identifier matching, and confidence are used as proxies for scope.

### C. Promote identity and projection edges into the intelligence graph

The recent context-side synthetic relationship fix is useful diagnostically, but architecturally it is in the wrong layer.

Cross-source traceability should be created during graph materialization, not only inside `context-builder.ts`.

The authoritative graph should expose edge categories such as:

```text
edge.kind:
  canonical
  ontology-resolved
  identity-traceability
  subject-representation
  projection
  unresolved-candidate
```

Each edge should include:

- derivation mechanism
- confidence
- evidence
- provenance
- whether it supports impact traversal
- whether it supports only traceability
- source and target applications

This avoids having the Copilot invent graph semantics after the PLM Brain has already run.

### D. Version ranking policy

Business weighting should be represented as a named policy:

```text
rankingPolicy:
  id: "engineering-business-v1"
  version: 1
```

The output should record which policy produced the ranking.

Otherwise benchmark changes become difficult to reproduce.

### E. Separate facts from interpretations

The reasoning package currently contains findings, narratives, and chains. These should be categorized more explicitly:

```text
Fact
  - directly observed or source-explicit

Derived fact
  - deterministic graph/ontology derivation

Potential impact
  - ontology-eligible path

Hypothesis
  - engineering interpretation

Gap
  - missing or unresolved evidence
```

That classification should be machine-readable and consistent across:

- graph
- reasoning package
- brief
- claims
- answer validation

### F. Make evaluation a release gate

The benchmark suite should not be a collection of tests that only assert strings.

Each benchmark should evaluate structured dimensions:

| Dimension | Example |
|---|---|
| Scope correctness | Did M1 remain investigation-wide? |
| Entity precision | Were engineering entities preferred? |
| Relationship recall | Were major relationships surfaced? |
| Application coverage | Were all involved systems named? |
| Evidence grounding | Were claims supported? |
| Uncertainty correctness | Were potential paths qualified? |
| Clarification correctness | Was clarification requested only when needed? |
| Answer completeness | Were required sections present? |

The system should track regressions by benchmark version.

## 6. Recommended Future Architecture

### Recommended architecture

```text
Client
  ↓
API / Copilot Turn Boundary
  ↓
Request Validation and Policy
  ↓
Question Understanding
  ↓
Scope Resolver
  ↓
Retrieval Planner
  ↓
Authoritative Engineering Intelligence API
  ├─ Canonical entities and relationships
  ├─ Identity domains
  ├─ Subject representations
  ├─ Projection relationships
  ├─ Ontology-resolved relationships
  ├─ Evidence
  ├─ Impact paths/chains
  └─ Unresolved evaluations
  ↓
Graph Projection for Question Scope
  ↓
Evidence and Budget Selection
  ↓
Reasoning Package
  ↓
Engineering Brief
  ↓
Answer Planner / Response Contract
  ↓
LLM Generation
  ↓
Claim and Citation Validator
  ↓
Policy / Safety / Grounding Guardrails
  ↓
Evaluation Telemetry
  ↓
Response
```

### Important architectural principle

The LLM should be a **language and synthesis component**, not the owner of:

- entity resolution
- relationship discovery
- impact traversal
- evidence selection
- scope determination
- confidence calculation

That work belongs in deterministic services.

### Tool-based architecture versus context-builder architecture

A tool-based architecture is not automatically better.

#### Tools are better for:

- retrieving a bounded entity neighborhood
- retrieving application coverage
- retrieving evidence
- retrieving impact chains
- running approved engineering analyses
- fetching source-specific details
- performing expensive operations lazily

#### Precomputed reasoning is better for:

- ontology-resolved relationships
- identity resolution
- impact path generation
- confidence scoring
- cross-source traceability
- deterministic benchmark behavior

The best design is hybrid:

```text
Precompute authoritative intelligence
  +
Expose bounded read-only tools over that intelligence
  +
Use a deterministic retrieval planner
  +
Let the LLM request only approved supplementary data
```

A pure context-builder dump is too rigid.

A fully agentic tool loop is too unpredictable for engineering answers.

## 7. Should LangGraph Be Introduced?

### Recommendation: not as the foundation

LangGraph is useful when the system needs:

- long-running workflows
- durable state
- resumable execution
- human approval checkpoints
- branching workflows
- multiple specialist agents
- explicit workflow visualization

The current Copilot does not primarily have a workflow durability problem. It has a **domain orchestration and contract clarity problem**.

Introducing LangGraph now would likely wrap the existing complexity in a graph runtime without removing it.

That would create:

```text
current hidden orchestration
  +
LangGraph state
  +
LangGraph node contracts
  +
new persistence/debugging concerns
```

That is not a good trade yet.

### Introduce LangGraph later if:

- investigations become asynchronous multi-step workflows
- human review/approval becomes part of reasoning
- multiple domain analysts need coordinated state
- retrieval and analysis must resume after failures
- users need visible reasoning workflow state

For the current request/answer Copilot, a typed deterministic orchestrator is preferable.

## 8. Should LangChain Be Introduced?

### Recommendation: generally no

LangChain would add limited value to the core Lattice problem.

The system already has custom requirements around:

- evidence provenance
- relationship semantics
- impact qualification
- deterministic graph traversal
- source-specific contracts
- answer validation
- benchmark metrics

LangChain abstractions may help with generic model adapters or structured output, but adopting the framework broadly would risk:

- hiding execution behavior
- introducing additional abstractions around already complex logic
- making debugging harder
- weakening type-level domain contracts
- increasing dependency and upgrade surface

Use narrow libraries where they solve a concrete problem. Do not adopt LangChain as the architecture.

## 9. Should MCP Tooling Be Introduced?

### Recommendation: yes, selectively

MCP is more suitable than LangChain or LangGraph for the next evolution, provided it exposes **bounded, read-only engineering capabilities**.

Good MCP-style tools would include:

```text
get_investigation_overview()
get_application_coverage()
get_primary_entities()
get_relationships(scope, filters)
get_cross_system_connections()
get_impact_chains(entityId)
get_evidenceForRelationship(relationshipId)
get_unresolved_relationships()
get_source_record(entityId)
```

Tool responses should be:

- typed
- bounded
- citation-bearing
- provenance-bearing
- scope-aware
- permission-controlled
- read-only by default

Do not expose a generic “query the whole graph” tool. That simply recreates the current problem behind a tool boundary.

MCP should supplement the deterministic retrieval plan, not replace it.

## 10. Where Evaluation and Benchmarking Fit

Evaluation belongs across the entire pipeline, not only at final answer generation.

### Required checkpoints

```text
Source normalization
  ↓
Identity resolution
  ↓
Graph materialization
  ↓
Scope resolution
  ↓
Retrieval
  ↓
Reasoning package
  ↓
Engineering brief
  ↓
Prompt payload
  ↓
Final answer
```

For every benchmark, record:

```text
question
expectedScope
actualScope
expectedApplications
actualApplications
expectedEntities
actualEntities
expectedRelationships
actualRelationships
evidenceRecall
clarificationExpected
clarificationActual
answerQuality
confidenceCalibration
```

M1 should fail if:

- scope is entity instead of investigation
- clarification is requested
- applications are missing
- cross-system relationships are absent
- the answer says no relationships were retrieved when identity/projection links exist

E1 should fail if:

- metadata entities outrank engineering entities
- relationship coverage is missing
- application coverage is absent

The benchmark must be a **release gate**, not an occasional diagnostic.

## 11. Where Observability Fits

Observability should be built into every orchestration boundary.

### Minimum trace

```text
turnId
investigationId
snapshotRevision
question
intent
scope
focalEntityIds
candidateCount
selectedEntityCount
relationshipCount
identityRelationshipCount
ontologyRelationshipCount
projectionRelationshipCount
impactPathCount
evidenceCount
briefSize
promptSize
model
latency
tokenUsage
validationResult
fallbackUsed
clarificationRequested
```

The existing relationship-flow diagnostics are a good beginning, but they should become a standard structured trace rather than only a context packet field.

The key metric is not just:

```text
relationshipCount
```

It should be broken down into:

```text
canonicalRelationshipCount
ontologyResolvedRelationshipCount
identityTraceabilityRelationshipCount
projectionRelationshipCount
unresolvedRelationshipCount
```

Otherwise “relationships exist” still hides the exact failure mode that caused M1.

## 12. Where Caching Fits

Caching should be layered.

### Layer 1: Immutable source snapshot cache

Key:

```text
investigationId + snapshotRevision
```

Cache:

- canonical entities
- source records
- evidence
- identity clusters

### Layer 2: Intelligence graph cache

Key:

```text
investigationId + snapshotRevision + ontologyVersion + derivationVersion
```

Cache:

- resolved relationships
- identity/projection edges
- paths
- impact chains
- graph summaries

### Layer 3: Scope retrieval cache

Key:

```text
snapshotKey + scope + focalEntityIds + retrievalPolicyVersion
```

Cache:

- retrieval plan
- graph projection
- evidence selection
- reasoning package

### Layer 4: Engineering brief cache

Key:

```text
reasoningPackageHash + briefPolicyVersion
```

Cache:

- engineering brief
- application summary
- relationship summary
- missing evidence summary

### Layer 5: LLM response cache

Use cautiously.

Cache only when:

- snapshot revision is unchanged
- prompt policy is unchanged
- model/version is unchanged
- user question normalization is safe
- response is not personalized or permission-sensitive

Never cache across snapshot revisions.

## 13. Best-Practice Enterprise Engineering Copilot in 2026

A mature architecture would have these planes:

### Domain intelligence plane

Deterministic and authoritative:

- source extraction
- canonical model
- identity resolution
- subject and representation modeling
- ontology
- graph construction
- impact analysis
- evidence and provenance

### Copilot orchestration plane

Typed and policy-driven:

- question understanding
- investigation/entity scope
- retrieval planning
- permission checks
- context budgeting
- reasoning package
- engineering brief

### Model plane

Replaceable:

- model routing
- structured generation
- response synthesis
- fallback model
- model-specific adapters

### Governance plane

Mandatory:

- citations
- confidence
- uncertainty
- policy enforcement
- PII/security controls
- prompt-injection defense
- source authorization
- answer validation
- audit logs

### Evaluation plane

Continuous:

- benchmark suite
- offline replay
- regression detection
- answer quality scoring
- grounding and citation scoring
- latency and cost tracking
- calibration metrics

### Operations plane

Production-grade:

- distributed traces
- structured logs
- metrics
- cache invalidation
- graph derivation versions
- model/version tracking
- failure recovery
- rate limiting
- tenant isolation

## 14. If Starting Fresh Today

I would not start with LangGraph or LangChain.

I would build:

```text
Typed API
  ↓
Question Understanding Service
  ↓
Explicit Scope Resolver
  ↓
Retrieval Planner
  ↓
Authoritative Engineering Intelligence Service
  ↓
Question-Scoped Graph Projection
  ↓
Reasoning Package
  ↓
Engineering Brief
  ↓
Structured Answer Generator
  ↓
Claim/Citation/Policy Validator
```

I would expose the intelligence service through typed internal APIs and optionally MCP-compatible read-only tools.

The key design decision would be:

> The graph and reasoning layer own engineering truth. The Copilot layer owns selection and communication. The LLM owns wording, not discovery.

I would also design the following contracts before writing feature logic:

- `QuestionUnderstanding`
- `InvestigationScope`
- `RetrievalPlan`
- `GraphProjection`
- `ReasoningPackage`
- `EngineeringBrief`
- `AnswerContract`
- `EvaluationRecord`
- `ObservabilityTrace`

That would prevent most of the recent bugs from becoming cross-layer problems.

## 15. Migration Strategy

### Phase 1: Stabilize contracts

Do not rewrite behavior first.

Define and document:

- investigation scope vs entity scope
- relationship categories
- graph derivation versions
- evidence semantics
- ranking policy
- benchmark metrics

### Phase 2: Extract orchestration boundaries

Split the current context-builder responsibilities without changing the domain algorithms.

The first extraction targets should be:

1. question understanding
2. scope resolution
3. retrieval planning
4. graph projection
5. reasoning package
6. engineering brief
7. context budgeting

### Phase 3: Move synthetic relationship creation upstream

Identity-domain and subject-representation relationships should be materialized as graph edges in the intelligence layer, with provenance and derivation metadata.

The Copilot should consume them rather than create them.

### Phase 4: Introduce read-only tools

Expose bounded capabilities such as:

- application overview
- cross-system connections
- entity neighborhood
- impact chains
- evidence lookup
- unresolved relationships

Keep deterministic retrieval as the default. Use tools for supplemental detail.

### Phase 5: Make benchmarks operational gates

Run E1, M1, impact, dependency, evidence, and root-cause benchmarks on every orchestration or graph-policy change.

### Phase 6: Reassess LangGraph

Only after the orchestration contracts are stable should you decide whether durable workflow execution is needed.

At that point, LangGraph may be useful for long-running investigations, not necessarily for every Copilot turn.

## Final Verdict

## Continue evolving, but stop expanding the monolith

Do **not** rewrite the entire platform.

Do **not** replace PLM Brain with LangGraph.

Do **not** add LangChain as a generic abstraction layer.

Do **not** make the LLM responsible for graph discovery.

The correct strategy is:

```text
Keep the intelligence foundation.
Refactor the Copilot orchestration layer.
Make scope explicit.
Promote identity/projection edges into the authoritative graph.
Separate retrieval from reasoning.
Make benchmarks release gates.
Add typed read-only tools selectively.
Delay LangGraph until durable workflows justify it.
```

The current architecture is **salvageable and directionally correct**, but the current orchestration implementation is approaching the point where every new fix will increase coupling unless the context builder is decomposed.

The honest assessment is:

> Lattice does not need a new AI framework yet. It needs stronger boundaries, explicit contracts, first-class investigation scope, authoritative cross-source graph semantics, and production-grade evaluation/observability.

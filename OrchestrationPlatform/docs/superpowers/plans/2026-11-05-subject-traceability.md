# Subject Traceability Implementation Plan

> **For agentic workers:** Implement the tasks in order and keep the existing authoritative graph as the sole graph and relationship source.

**Goal:** Materialize subject-level traceability edges in the authoritative investigation graph so investigation overviews can explain shared-subject participation without enabling impact reasoning.

**Architecture:** Extend the existing `InvestigationKnowledgeGraph` with a subject node and a typed `subjectTraceabilityRelationships` edge collection, materialized by the existing ontology graph evaluator. Feed those edges to Copilot only for summary and relationship-overview intents; impact, dependency, change-analysis, risk, and root-cause intents continue to use only eligible impact paths. Do not add ontology rules, another graph store, or another relationship engine.

**Tech Stack:** TypeScript, Next.js 16, Vitest.

**Spec:** User-provided subject-centric traceability requirements in this conversation.

## Global Constraints

- `impactEligible = false` for every subject-traceability edge.
- Subject-traceability edges must never be promoted into ontology-resolved relationships, impact paths, or impact chains.
- Subject traceability may be used for investigation summaries and entity, application, or relationship overviews.
- Subject traceability may not be used for impact, change propagation, consequence, risk, or dependency reasoning.
- Impact questions continue to require ontology-resolved relationships.
- Do not weaken ontology rules, invent engineering relationships, create a parallel graph/store, or add a second relationship engine.
- Preserve source application, entity identity, and provenance on materialized edges.
- Preserve all unrelated and pre-existing worktree changes.

## Review Focus

- An empty investigation must not produce dangling subject edges; test empty entities and zero edges.
- Rebuilding the same graph must yield the same subject node and edge IDs; test stable IDs across repeated materialization.
- An entity with missing source-application metadata must remain a participant without an invented application; test an optional application.
- A relationship/summary question must receive graph-backed subject edges and their subject endpoint at the configured 24,000-character context budget; test the M1 wording and all participating applications.
- Impact-like wording must not receive subject-traceability context; test both “operational consequence” and “what changes if” while asserting impact paths/chains remain ontology-eligible only.

---

### Task 1: Materialize Subject Traceability in the Authoritative Graph

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/contracts/relationship-ontology.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/ontology-evaluator.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/universal/ensure-investigation-knowledge-graph.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/subject-traceability.test.ts`

**Interfaces:**
- Consumes: `EngineeringIntelligenceInvestigationV1.subject`, `.entities`, and existing graph evaluation inputs.
- Produces: `InvestigationKnowledgeGraph.subjectTraceabilityRelationships: SubjectTraceabilityRelationship[]`.
- Define `SubjectTraceabilityRelationship` with `category: "subject-traceability"`, `relationshipType: "represents-subject"`, `status: "subject-derived"`, `authority: "investigation"`, `strength: "informational"`, `impactEligible: false`, source/target entity IDs, optional source application, citation IDs, and explicit provenance.
- Provenance must identify provider `"lattice-subject-traceability"`, authority `"investigation"`, observation time, investigation ID, subject ID, and the participating entity's source application and native ID when available.
- Materialize a graph entity of kind `"investigation-subject"` and one directed edge from each canonical entity to that subject node. Use deterministic IDs scoped by the investigation and preserve each participant’s source identity and provenance.
- Keep ontology `resolvedRelationships`, `impactPaths`, and `impactChains` semantics unchanged. Subject edges are stored beside those categories, are not passed into impact-path construction, and cannot be promoted into any of them.

- [ ] **Step 1: Write failing graph-materialization tests**

Add tests that assert every canonical entity gets exactly one subject edge, all edges target the same `"investigation-subject"` graph node, required literal fields and explicit provenance are exact, IDs are stable, and source application/entity identity/provenance are preserved. Assert subject-edge IDs are absent from `resolvedRelationships`, `impactPaths`, and `impactChains`. Include empty entities and an entity with no source application.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run from `OrchestrationPlatform/frontend`:

```powershell
npm run test -- features/lattice-next/tests/subject-traceability.test.ts
```

Expected: FAIL because the graph contract and evaluator do not yet expose subject traceability.

- [ ] **Step 3: Add the typed graph edge and node**

Add the `SubjectTraceabilityRelationship` interface and `subjectTraceabilityRelationships` graph field. In `enrichInvestigationWithOntology`, add a stable investigation-subject graph node and materialize the deterministic participant-to-subject edges with the required metadata and explicit provenance. Keep the existing ontology definition catalog unchanged and keep subject edges out of ontology resolution and impact materialization.

- [ ] **Step 4: Keep graph summaries and cached-graph validation consistent**

Include subject edges in total graph relationship counts and traversal indexes without adding them to `pathEdges` used for impact generation. Update `ensureInvestigationKnowledgeGraph` to re-enrich cached graphs missing the new collection rather than treating an old graph as complete.

- [ ] **Step 5: Run the focused graph tests**

Run:

```powershell
npm run test -- features/lattice-next/tests/subject-traceability.test.ts
```

Expected: PASS, including the no-impact and deterministic-ID assertions.

### Task 2: Consume Subject Edges Only for Investigation Overviews

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/subject-traceability.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/context-builder.test.ts`

**Interfaces:**
- Consumes: `InvestigationKnowledgeGraph.subjectTraceabilityRelationships` and the graph’s subject entity.
- Produces: Copilot relationship context marked with category `"subject-traceability"` for summary/relationship-overview questions.
- Replace Copilot-generated pairwise subject-candidate traceability with the authoritative graph edges for investigation overviews; do not infer direct application-to-application edges from subject candidates or identity-cluster co-membership.
- Subject node and edge contexts must retain citations and endpoints when selected; test that the M1 context fits the configured 24,000-character budget.
- Subject edges are eligible only for `summary` and `relationship` intents. Exclude them from `impact`, `dependency`, `change-analysis`, `risk`, and `root-cause` intents. Ensure change-analysis selects the existing eligible impact-path pool, not generic relationship paths.

- [ ] **Step 1: Write failing M1 and M2 context tests**

Extend the subject-traceability test coverage with the M1 wording, asserting the participating applications are represented through subject-traceability edges to the shared subject and no direct engineering relationship is claimed. Assert both “What operational consequence follows…” and “What changes if…” contexts do not contain subject-traceability edges and expose only existing ontology-eligible impact paths/chains. Verify selected edge endpoint citations survive the configured 24,000-character context budget.

- [ ] **Step 2: Run the focused context tests and confirm they fail**

Run from `OrchestrationPlatform/frontend`:

```powershell
npm run test -- features/lattice-next/tests/subject-traceability.test.ts features/lattice-next/copilot/tests/context-builder.test.ts
```

Expected: FAIL because Copilot currently synthesizes subject-candidate relationships and does not consume the authoritative subject edge category.

- [ ] **Step 3: Add the context category and consume graph edges**

Extend `CopilotRelationshipContext` with a relationship-category discriminator. Adapt graph subject nodes into entity context, and graph subject edges into relationship context only for allowed intents. Preserve source/target citations, application, status, strength, and investigation provenance.

- [ ] **Step 4: Remove Copilot-only subject connectivity and harden impact routing**

Stop using Copilot-generated pairwise cross-source relationships from `subject.candidateIds` or identity-cluster co-membership as subject connectivity in investigation overviews. Keep canonical identity-cluster facts unchanged. Route `change-analysis` to the eligible impact-path pool and ensure subject edges are absent from every impact-like context.

- [ ] **Step 5: Run focused context, budget, and impact tests**

Run from `OrchestrationPlatform/frontend`:

```powershell
npm run test -- features/lattice-next/tests/subject-traceability.test.ts features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/tests/impact-path-generation.test.ts features/lattice-next/tests/budget-preservation.test.ts
```

Expected: PASS; M1 receives subject connectivity, while impact-like questions receive no subject edges and no newly eligible impact paths or chains.

### Task 3: Document Materialization and Validate the Connectivity Contract

**Files:**
- Create: `OrchestrationPlatform/docs/lattice-intelligence/subject-traceability-design.md`
- Create: `OrchestrationPlatform/docs/lattice-intelligence/subject-traceability-materialization.md`
- Create: `OrchestrationPlatform/docs/lattice-intelligence/investigation-connectivity-validation.md`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/subject-traceability.test.ts`

**Interfaces:**
- Design documentation explains the category boundary and the common subject-node model.
- Materialization documentation specifies deterministic IDs, edge fields, provenance, source-application handling, and authoritative graph placement.
- Validation documentation records the M1/M2 test cases and the guard that subject edges cannot enter impact paths or chains.

- [ ] **Step 1: Document the graph contract and explicit non-goals**

Document that subject traceability is informational participation in an investigation subject, not a proven engineering relationship, and does not alter the ontology.

- [ ] **Step 2: Document materialization and source provenance**

Record how the existing graph evaluator creates the subject node and one subject edge per canonical entity, and how source identity and provenance are preserved.

- [ ] **Step 3: Document and run end-to-end connectivity validation**

Record M1 and M2 expected behavior and run:

```powershell
npm run test -- features/lattice-next/tests/subject-traceability.test.ts features/lattice-next/tests/impact-path-generation.test.ts
npx tsc --noEmit
```

Expected: all selected tests pass and TypeScript reports no errors.

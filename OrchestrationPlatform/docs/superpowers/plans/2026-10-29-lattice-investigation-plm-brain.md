# Lattice Investigation PLM Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a portable, ontology-governed PLM Brain package with each Lattice investigation revision and use it for snapshot-only, multi-hop, evidence-grounded Copilot answers and Download JSON.

**Architecture:** Keep `relationships.md` as the single source for the versioned ontology and let a generic evaluator apply declarative evidence rules to the immutable canonical snapshot. Pin the resulting knowledge graph to the published revision; have Copilot retrieval and the hierarchical export consume the same package, with deterministic entity scoring, ambiguity handling, bounded traversal, evidence ranking, and impact paths.

**Tech Stack:** Existing TypeScript/Next.js Lattice kernel, PLM Brain universal relationship code, canonical investigation contract, Copilot context/policy/validator, and hierarchical JSON export. Parse embedded JSON using built-in JSON/runtime guards; do not add dependencies.

**Spec:** [2026-10-29-lattice-investigation-plm-brain-design.md](../specs/2026-10-29-lattice-investigation-plm-brain-design.md)

## Global Constraints

- “The investigation snapshot remains the complete evidence boundary. Copilot question answering must not call Windchill, SAP, Configit, Teamcenter, or Codebeamer.”
- “A resolved relationship requires a declared ontology evidence rule satisfied by evidence in the active investigation. Similar names or shared investigation membership are never sufficient.”
- “A reverse traversal uses the ontology's inverse meaning and label while retaining the single canonical edge and its original status, strength, provenance, and evidence.”
- “`POTENTIAL`/impact paths are not proof of causation or a completed source transaction.”
- Ranking order: “exact governed native/canonical identifier; exact ontology-declared property identifier; entities supported by resolved relationship-path evidence; lexical similarity as a fallback signal.”
- “Low-confidence cutoff: `0.55`; ambiguity notice when the highest candidate scores are within `0.10`.” These ranking values belong to resolver configuration, never the ontology.
- “Do not run tests, builds, review, or validation. Implementation should be limited to code/document changes and source inspection; do not invoke shell commands that could contact the sandbox local proxy.”
- No UI restyling or new UI surface; no source-system calls from question answering.

## Review Focus

Formal test/review/validation steps are excluded by explicit user instruction. The principal unvalidated risk areas to keep visible during implementation are:

- Invalid, duplicate, or dangling ontology definitions must fail explicitly rather than silently dropping mappings.
- Cyclic graphs and ambiguous inverse paths must terminate within configured traversal bounds and preserve canonical edge direction.
- Exact-ID collisions and near-tied candidates must surface ambiguity; lexical-only matches must not support factual claims.
- Stale, partial, unresolved, and truncated evidence must remain uncertainty, not become proof of absence or impact.
- Legacy investigations without a pinned graph must be marked with the ontology version used for deterministic on-read enrichment.

---

## File map

- `docs/relationships.md` — versioned embedded JSON ontology and synchronized relationship semantics.
- `frontend/features/lattice-next/plm-brain/contracts/relationship-ontology.ts` — ontology and resolved graph package types.
- `frontend/features/lattice-next/plm-brain/universal/relationship-ontology-parser.ts` — locate, parse, and runtime-validate the embedded ontology.
- `frontend/features/lattice-next/plm-brain/universal/relationship-ontology-runtime.ts` — server-only ontology loading/versioning.
- `frontend/features/lattice-next/plm-brain/universal/ontology-evaluator.ts` — generic evidence-rule evaluation, unresolved candidates, stable IDs, indexes, and bounded impact paths.
- `frontend/features/lattice-next/contracts/intelligence-v1.ts` — optional versioned `knowledgeGraph` on canonical investigation data.
- `frontend/features/lattice-next/plm-brain/universal/enrich-investigation-with-universal-relationships.ts` and related catalog/resolver files — remove duplicated hardcoded rule catalogs and delegate to the generic evaluator or remove superseded code.
- `frontend/app/api/lattice/investigations/[investigationId]/route.ts` — enrich incoming `publish-canonical` command on the server before dispatch.
- `frontend/features/lattice-next/infrastructure/merge-source-intelligence.ts` and `frontend/features/lattice-next/kernel/adapters/current-canonical-assembly-adapter.ts` — stop client-side hardcoded universal-rule enrichment.
- `frontend/features/lattice-next/copilot/retrieval-config.ts` — confidence thresholds, match weights, traversal depth, and evidence/context limits independent of ontology.
- `frontend/features/lattice-next/copilot/contracts.ts` — reasoning graph, entity candidates, ambiguity/confidence, impact, and evidence-group context types.
- `frontend/features/lattice-next/copilot/context-builder.ts` — deterministic entity scoring, graph retrieval, evidence ranking, and reasoning-friendly context assembly from the pinned package.
- `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`, `policy.ts`, and `answer-validator.ts` — clarification fallback and evidence/relationship/analysis/conclusion answer grounding.
- `frontend/features/lattice-next/export/hierarchical-json-export.ts` and its `LatticeNextWorkspace.tsx` caller — include the pinned knowledge graph package in downloaded JSON without UI redesign.

## Task 1: Embed and load the relationship ontology

**Files:** `docs/relationships.md`; create the ontology contract, parser, and runtime loader listed above.

**Interfaces:**
- `loadRelationshipOntology(): RelationshipOntology` returns validated definitions, `schemaVersion`, and `ontologyVersion`; it throws a descriptive error for malformed or absent ontology blocks.
- Each definition contains `id`, source/target application and kind sets, forward relationship type/meaning, inverse type/meaning, status/strength semantics, evidence rules, and traversal/impact metadata.
- Evidence-rule operators are limited to declared deterministic operations such as exact scalar and exact list-reference matches. No free-text or fuzzy rule operators.

- [ ] Add a uniquely marked `lattice-relationship-ontology` JSON block inside `relationships.md` with schema and ontology versions.
- [ ] Populate machine-readable definitions for the relationship patterns and inverse semantics governed by the existing Bible, including evidence conditions and potential-impact limits.
- [ ] Define typed ontology structures and explicit guards for required fields, unique IDs, valid endpoints, direction, supported operators, referenced path templates, and allowed status/strength/evidence values.
- [ ] Load and validate the ontology on the server without an external dependency; keep human prose synchronized with the structured entries.
- [ ] Keep ranking/confidence thresholds out of the ontology.

## Task 2: Build the ontology-driven investigation knowledge graph

**Files:** create `ontology-evaluator.ts`; update `intelligence-v1.ts` and PLM Brain graph contracts; remove hardcoded universal rules/resolvers.

**Interfaces:**
- `enrichInvestigationWithOntology(input, ontology): EngineeringIntelligenceInvestigationV1` returns the canonical value with `knowledgeGraph` pinned to that input revision and ontology version.
- `knowledgeGraph` contains entities, canonical and resolved relationships, relationship evidence, unresolved evaluations, relationship/impact paths, cross-application mappings, traversal indexes, citations, confidence, coverage, and omissions.

- [ ] Implement generic endpoint matching from ontology-declared application, kind, property paths, and exact match operators.
- [ ] Create resolved relationship instances only when the ontology evidence condition is satisfied; preserve source relationships as source facts and keep derived provenance explicit.
- [ ] Record unresolved, incompatible, ambiguous, and evidence-missing candidates with reason, candidate IDs/counts, truncation status, and evidence IDs.
- [ ] Implement inverse traversal as a view over the single canonical relationship; do not create a second canonical fact.
- [ ] Generate stable IDs, citation links, source/property evidence observations, provenance, freshness, status, and strength from the actual snapshot and rule.
- [ ] Build deterministic directed adjacency indexes and relationship paths with visited-node/edge tracking and a maximum depth of 3.
- [ ] Generate impact paths only from ontology-declared impact-eligible paths; keep potential impact distinct from causation.
- [ ] Keep existing `universalRelationshipDefinitions`, `universalEvidenceResolvers`, or equivalent per-rule mapping code from acting as a second authority.

## Task 3: Pin enrichment during canonical publication

**Files:** server investigation command route; canonical publication path/merge adapter; PLM Brain enrichment runtime.

**Interfaces:**
- The existing `publish-canonical` command is enriched server-side before `serverKernel.dispatch`.
- Canonical publication returns the persisted revision containing `knowledgeGraph`; source data remains unchanged.

- [ ] Detect `publish-canonical` in the server investigation command route and call the ontology evaluator before dispatch.
- [ ] Ensure only server-owned ontology loading/parsing is used for enrichment; do not add source-system calls to this route.
- [ ] Remove browser/client universal-rule enrichment from `merge-source-intelligence.ts` and `CurrentCanonicalAssemblyAdapter`.
- [ ] Preserve event-sourced publication semantics so the pinned package is stored with its exact canonical revision.
- [ ] Ensure explicit refresh publishes a new ontology-enriched revision while a failed refresh retains the last usable canonical package.
- [ ] Preserve legacy canonical reads; when no pinned package exists, create a clearly versioned deterministic in-memory package from stored data without claiming it was pinned at original publication.

## Task 4: Add snapshot-scoped question retrieval and confidence

**Files:** create `copilot/retrieval-config.ts`; update `copilot/contracts.ts`, `context-builder.ts`, and relevant call path in `execute-copilot-turn.ts`.

**Interfaces:**
- `resolveQuestionEntities(message, knowledgeGraph, config)` returns ranked candidates, a selected focal candidate when justified, deterministic scores, ambiguity state, and clarification state.
- `buildInvestigationContext(snapshot, message, options)` consumes the pinned package (or marked legacy-derived package) and returns reasoning-friendly context including primary entity, connected entities, relationship semantics, paths, evidence groups, impacts, unresolved candidates, confidence, and omissions.
- Resolver configuration defaults: low-confidence cutoff `0.55`; ambiguity margin `0.10`; exact governed ID score `1.00`; governed-property match score `0.85`; path evidence ranks after governed identity/property evidence; lexical signal is fallback only.

- [ ] Score all relevant candidates with exact governed identifiers first, ontology-declared identifier properties second, resolved path evidence third, and lexical similarity last.
- [ ] Select the strongest candidate for productive response when it reaches the cutoff; include a notice and alternative candidates for a top-score gap under `0.10`.
- [ ] Below `0.55`, prepare a deterministic clarification answer identifying candidates, evidence, uncertainty, and a question; do not claim facts about a guessed focal entity.
- [ ] Classify question intent among summary, relationship, impact, dependency, root cause, evidence, risk, and change analysis; use it to choose retrieval depth and evidence priorities.
- [ ] Traverse only the active snapshot package, including connected endpoints, relationships, relationship evidence, findings, unresolved candidates, and citation edges. Never call source adapters from the Copilot turn path.
- [ ] Use cycle protection and depth 3 by default; ensure impact/dependency retrieval respects ontology direction and inverse traversal semantics.
- [ ] Rank direct, relationship, dependency, and impact evidence deterministically and preserve endpoint/evidence dependencies when applying context limits.
- [ ] Keep source-state uncertainty, omissions, ontology version, snapshot revision, and confidence visible to answer generation.

## Task 5: Ground generated answers and degrade gracefully

**Files:** `copilot/execute-copilot-turn.ts`, `copilot/policy.ts`, `copilot/answer-validator.ts`, and `copilot/contracts.ts`.

**Interfaces:**
- Generated answer narrative follows Evidence → Relationships → Analysis → Conclusion.
- Low-confidence clarification uses the existing structured `CopilotAnswer` shape and validated active-snapshot candidate citations.
- Provider/transport/invalid-schema errors remain explicit errors; retrieval incompleteness is a grounded fallback, not a generic provider failure.

- [ ] Add reasoning-package instructions and include exact snapshot revision, ontology version, selected entity confidence, candidate ambiguity, evidence groups, paths, and impact semantics in the model context.
- [ ] Require every factual claim and recommendation to cite active-package IDs; label inference as hypothesis and distinguish `POTENTIAL` from causal fact.
- [ ] Validate that claims/citations resolve to the active graph package and preserve revision checks.
- [ ] Return and persist the deterministic clarification answer below the candidate confidence cutoff without asking the model to invent the intended entity.
- [ ] For missing/partial/unresolved/truncated retrieval, produce a useful answer that states evidence found, evidence missing, limits, and a next investigative question.
- [ ] Keep actual Azure configuration/network/provider failures explicit and distinguish them from insufficient investigation evidence.

## Task 6: Export the shared portable PLM Brain package

**Files:** `export/hierarchical-json-export.ts`, `workspace/LatticeNextWorkspace.tsx`, and canonical/graph metadata projection as needed.

**Interfaces:**
- Download JSON adds the exact `knowledgeGraph` stored in the canonical investigation revision, together with ontology version and revision identifiers.
- Existing hierarchy, relationships, and metadata remain present; export must not reinterpret ontology semantics using presentation labels.

- [ ] Propagate the persisted knowledge graph from the active canonical investigation into graph metadata/export input.
- [ ] Add `knowledgeGraph`, `relationshipOntologyVersion`, `resolvedRelationships`, `relationshipPaths`, `impactPaths`, `relationshipEvidence`, `crossApplicationMappings`, `graphTraversalIndexes`, and `confidenceMetadata` to the downloaded package.
- [ ] Ensure Copilot and export consume the same pinned graph object for a revision; legacy packages identify their derived ontology version.

## Execution constraints

- Per explicit instruction, do not add test-writing, test-running, build, review, or validation steps to execution.
- Do not use shell commands or browser tools that may trigger the blocked local proxy/Zscaler.
- Do not modify UI styling or initiate live source-system retrieval while answering questions.

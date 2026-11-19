# Sprint 1A.5 Ontology Alignment and Context Preservation Implementation Plan

> **For agentic workers:** Implement each task only after plan approval. Use the repository's existing Vitest patterns. The user selected native implementation in this session.

**Goal:** Carry validated governed cross-system mappings through ontology resolution, impact generation, context construction, prompt composition, and a deterministic fixture-backed Copilot answer.

**Architecture:** Add a narrow adapter that translates already validated PLM Brain mapping evidence into ontology-consumable evidence while retaining mapping/evidence provenance and leaving ontology rules authoritative. Protect the minimum required relationship context—relationship, endpoint entities, and supporting evidence—during context budgeting; trim optional data first.

**Tech Stack:** TypeScript, Vitest, existing Lattice PLM Brain ontology evaluator and Copilot context builder.

**Spec:** User-provided Sprint 1A.5 request and explicit approval of Option 1; prior evidence in `frontend/features/lattice-next/copilot/sprint-1a4-findings.md`.

## Global Constraints

- Do NOT bypass ontology, hardcode benchmark relationships, weaken acceptance criteria, or infer relationships without evidence.
- Do NOT change fixture data to satisfy ontology contracts.
- Keep the golden investigation deterministic and isolated in an automated test store; do not write to the running local application.
- Keep the implementation limited to ontology evidence alignment and context preservation; no architecture, RAG, prompt redesign, LangGraph, MCP, or unrelated Copilot behavior work.
- Add the requested tests and reports; honor the repository administrator instruction to skip test execution in this task.

## Review Focus

- A mapping without validated PLM Brain evidence must not produce an ontology relationship; test absent/invalid evidence rejection in the adapter/evaluator task.
- A mapping whose applications, endpoint kinds, relationship type, or endpoint IDs do not match the ontology definition must not resolve; test incompatible endpoint rejection.
- Repeated enrichment of the same fixture must produce stable relationship/evidence/path IDs and counts; test deterministic output in the ontology task.
- Context budgets below the full packet size must retain at least one validated cross-system relationship and its endpoints/evidence, or explicitly fail rather than emit a success-shaped empty relationship context; test at the context-budget boundary.
- Provider answer generation must use only citations from the preserved packet and must not assert unsupported impact/cause; test the deterministic golden Copilot flow.

---

## File Structure

- Create `frontend/features/lattice-next/plm-brain/universal/ontology-evidence-adapter.ts` for mapping verified `plmBrain` relationships/evidence to ontology evidence matches.
- Modify `frontend/features/lattice-next/plm-brain/universal/ontology-evaluator.ts` to consume adapter output through existing rule selection, validation, graph materialization, and impact eligibility.
- Create `frontend/features/lattice-next/plm-brain/universal/tests/ontology-resolution.test.ts` and `impact-path-generation.test.ts`.
- Modify `frontend/features/lattice-next/copilot/context-builder.ts` to retain required relationship groups and expose exact before/after budget counts.
- Create `frontend/features/lattice-next/copilot/tests/context-preservation.test.ts`.
- Create `frontend/features/lattice-next/tests/golden-fixture-copilot.test.ts` using an isolated deterministic snapshot and mocked provider.
- Create reports `ontology-contract-alignment.md`, `impact-eligibility-analysis.md`, `context-budget-trace.md`, `impact-path-proof.md`, `golden-path-trace.md`, and `sprint-1a5-findings.md`.
- Update `frontend/features/lattice-next/copilot/benchmark-live-validation.md` with the fixture validation status; do not claim live-app validation.

## Task 1: Inventory the Ontology and Governed Mapping Contract

**Files:**
- Create: `frontend/features/lattice-next/copilot/ontology-contract-alignment.md`
- Reference: `OrchestrationPlatform/docs/relationships.md`
- Reference: `frontend/features/lattice-next/plm-brain/universal/catalog/universal-rules.ts`
- Reference: `frontend/features/lattice-next/plm-brain/universal/resolvers/resolver-registry.ts`
- Reference: `frontend/features/lattice-next/plm-brain/contracts/governed-mapping.ts`
- Reference: `frontend/features/lattice-next/tests/plm-brain-validated-fixture.ts`

- [ ] Record all five ontology rules, accepted applications/kinds, exact evidence paths/operators, governed mapping endpoint kinds/paths, and compatibility gaps. Include the confirmed Windchill→SAP gap between `preferredProductId`/native ID and the ontology's material/identity fields.
- [ ] Verify the report names which mapping contract each adapter case will accept and that unverified/ambiguous mappings remain rejected.

## Task 2: Adapt Validated Mapping Evidence and Resolve Relationships

**Files:**
- Create: `frontend/features/lattice-next/plm-brain/universal/ontology-evidence-adapter.ts`
- Modify: `frontend/features/lattice-next/plm-brain/universal/ontology-evaluator.ts`
- Create: `frontend/features/lattice-next/plm-brain/universal/tests/ontology-resolution.test.ts`
- Test fixture: `frontend/features/lattice-next/tests/plm-brain-validated-fixture.ts` (read-only; do not alter fixture data)

**Interfaces:**
- `adaptGovernedOntologyEvidence(canonical, definition)` consumes the canonical investigation, the current ontology definition, and its validated `plmBrain` handshake snapshot.
- Adapter results carry source/target entity IDs, the ontology evidence-rule ID/mechanism, original handshake evidence ID, mapping ID/reference, original source/target attribute paths and values, and evaluation time.
- The ontology evaluator remains responsible for confirming application/kind compatibility, matching the correct definition, and producing `OntologyResolvedRelationship`.

- [ ] Write `ontology-resolution.test.ts` asserting the unchanged fixture's three governed Windchill→SAP, Windchill→Configit, and Windchill→Codebeamer links resolve through the ontology and retain mapping/evidence provenance.
- [ ] Add rejection assertions for missing handshake evidence, disabled/unverified mapping, wrong endpoint IDs, and wrong definition/type; confirm repeated evaluation returns deterministic IDs/counts.
- [ ] Confirm the test reproduces the known current mismatch by inspecting its expected-vs-current stage assertions; do not execute tests in this task.
- [ ] Implement the adapter using only validated `plmBrain.relationships` plus their corresponding handshake evidence; do not synthesize endpoint property equality or accept on application co-occurrence.
- [ ] Integrate adapter evidence into `resolveDefinitions`; select ontology semantics/status/strength from the matching ontology definition/evidence rule, and preserve original mapping evidence in the resulting relationship citations/provenance.
- [ ] Review the implementation against the test assertions to ensure 3 valid relationships resolve while invalid/missing evidence remains rejected; do not execute tests in this task.

## Task 3: Prove Impact Eligibility and Generate Impact Paths

**Files:**
- Modify: `frontend/features/lattice-next/plm-brain/universal/ontology-evaluator.ts` only if evidence shows the aligned resolved edge is not currently marked impact-traversable.
- Create: `frontend/features/lattice-next/plm-brain/universal/tests/impact-path-generation.test.ts`
- Create: `frontend/features/lattice-next/copilot/impact-eligibility-analysis.md`
- Update: `frontend/features/lattice-next/copilot/impact-path-proof.md`

- [ ] Test that the fixture's resolved Windchill→SAP relationship is impact-eligible per its ontology definition and produces at least one `impactPath`, `impactChain`, and impact narrative.
- [ ] Test that a canonical fallback relationship without ontology resolution remains non-impact-eligible.
- [ ] Review the positive and negative impact assertions against the current evaluator control flow; do not execute tests in this task.
- [ ] Make only the evidence-supported eligibility correction if the current generator fails the test; do not make canonical fallback edges impact-traversable.
- [ ] Record relationship ID, impact path/chain IDs, ontology template or rule, applications, citations, and counts in the impact reports.

## Task 4: Preserve Relationship Evidence Under Context Budgeting

**Files:**
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Create: `frontend/features/lattice-next/copilot/tests/context-preservation.test.ts`
- Create: `frontend/features/lattice-next/copilot/context-budget-trace.md`

- [ ] Write a test using the unchanged fixture and production default context budget that asserts the final packet retains at least one validated cross-system relationship, both endpoint entities, supporting evidence, and any generated impact path.
- [ ] Add a low-budget boundary test confirming optional sections are reduced before the protected relationship/evidence group and that the packet never returns a zero-relationship/zero-evidence result when a valid cross-system relationship exists.
- [ ] Confirm by inspecting the budget diagnostics and test expectations that the current all-empty context failure is covered; do not execute tests in this task.
- [ ] Update composition/trim ordering to reserve one valid cross-system relationship group (relationship + endpoint entities + supporting evidence); compact optional content before reducing that group.
- [ ] Add diagnostics reporting before-trim and after-trim counts for entities, relationships, evidence, paths, impact paths/chains, and reasoning narratives.
- [ ] Verify the prompt payload carries the retained relationship and evidence counts and that omission counts accurately identify optional content removed.

## Task 5: Verify the Isolated Golden Fixture End to End

**Files:**
- Create: `frontend/features/lattice-next/tests/golden-fixture-copilot.test.ts`
- Create: `frontend/features/lattice-next/copilot/golden-path-trace.md`
- Create: `frontend/features/lattice-next/copilot/sprint-1a5-findings.md`
- Update: `frontend/features/lattice-next/copilot/benchmark-live-validation.md`

**Interfaces:**
- Start every run from the unchanged `plm-brain-validated-fixture.ts`.
- Compose the governed handshake, ontology graph, context packet, and prompt payload in memory.
- Use a deterministic mocked provider response validated against packet citations; do not use or mutate the running app's persistence store.

- [ ] Test the M1 question and assert the prompt includes the three relationship types and their supporting mapping evidence, with no clarification.
- [ ] Test the M2 question and assert the answer describes only the supported Windchill→SAP relationship and evidence-backed operational meaning; reject unsupported causation.
- [ ] Assert deterministic entity, relationship, evidence, impact-path, prompt, and answer output across repeated fixture construction.
- [ ] Review golden-fixture assertions for deterministic input, mocked provider, citation grounding, and no persistence side effects; do not execute tests in this task.
- [ ] Document each pipeline count/ID and answer outcome in `golden-path-trace.md`; summarize pass/fail for each required criterion in `sprint-1a5-findings.md`.
- [ ] Update `benchmark-live-validation.md` with a clearly separated fixture-validation section; preserve existing live-investigation results and do not mark live M1/M2 passed from fixture tests.

## Final Review

- [ ] Perform a code review of the adapter, ontology evaluator integration, impact eligibility, and protected context budget against the exact assertions in the new test files; do not run tests.
- [ ] Review changed TypeScript files for type consistency and lint issues without running type-check, lint, or test commands.
- [ ] Review all report claims against captured deterministic test output; leave Sprint 2 blocked if any end-to-end criterion or live validation remains unmet.

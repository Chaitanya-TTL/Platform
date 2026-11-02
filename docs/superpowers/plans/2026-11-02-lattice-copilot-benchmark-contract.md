# Lattice Copilot Benchmark Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing offline Copilot evaluation suite into one explicit E1-E3, M1-M5, and T1-T8 benchmark contract, then manually validate five representative cases against the running Copilot without creating a parallel benchmark framework.

**Architecture:** Keep `COPILOT_EVALUATION_CASES`, `copilot-evaluation.test.ts`, and `metrics.ts` as the single source of offline benchmark truth. Add roadmap metadata and only two missing cases: the E1 business-entity-ranking scenario and the M1 investigation-wide application-connection scenario. Map the remaining roadmap IDs onto existing cases by stable case ID, then make the existing suite assert complete roadmap coverage and the required case-specific expectations. Record manually observed live answers separately in `benchmark-live-validation.md`; do not add a live runner.

**Tech Stack:** TypeScript, Vitest, existing Lattice Copilot synthetic fixtures, existing context builder and evaluation metrics.

**Spec:** `docs/lattice-copilot-architecture-review-2026-11-02.md` and the approved Sprint 1 benchmark inventory/mapping.

## Global Constraints

- Use the existing offline Copilot suite, PLM/relationship tests, context-builder tests, and release-gate validations as the foundation.
- Do not create a parallel benchmark framework.
- Do not redesign or duplicate existing benchmark assets.
- Create only the missing benchmark cases needed to complete E1-E3, M1-M5, and T1-T8 coverage.
- Do not enable paid live model calls for normal tests or baseline execution.
- Keep evaluation fixtures synthetic and free of credentials, prompts, provider payloads, and raw responses.
- Do not claim live answer-quality success from context-only assertions.
- Record live validation as manual observations only; do not add a live benchmark runner or automated paid-call test.

## Review Focus

- A roadmap ID must map to exactly one stable evaluation case, and every E1-E3/M1-M5/T1-T8 ID must be covered.
- E1 must prove business entities outrank lifecycle, catalog, status, and other metadata distractors.
- M1 must remain investigation-scoped, include all available applications, and materialize cross-source relationships without clarification.
- Existing uncertainty, isolation, citation, token, latency, and injection protections must remain asserted.
- The catalog must remain executable by the current Vitest command without a new runner or duplicated fixtures.

---

### Task 1: Add the unified roadmap metadata contract

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/cases.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

**Interfaces:**
- Consumes: Existing `CopilotEvaluationCase` definitions and stable case IDs.
- Produces: `roadmapIds: readonly string[]` on each case and a complete roadmap ID set for suite validation.

- [ ] **Step 1: Write the failing coverage assertion**

Add a test that collects every `roadmapIds` value, flattens and sorts them, and expects exactly:
`E1`, `E2`, `E3`, `M1`, `M2`, `M3`, `M4`, `M5`, `T1`, `T2`, `T3`, `T4`, `T5`, `T6`, `T7`, `T8`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: FAIL because the existing case type has no roadmap mapping and the catalog is not complete.

- [ ] **Step 3: Add the metadata field and map existing cases**

Add `roadmapIds: readonly RoadmapBenchmarkId[]` to the case interface and define the literal union type. Map existing cases as follows:

| Roadmap ID | Existing case |
|---|---|
| E2 | `native-id-lookup` |
| E3 | `cross-source-relationship` |
| M2 | `supported-cross-system-consequence` |
| M3 | `potential-impact-without-causation` |
| M4 | `partial-source-evidence` |
| M5 | `investigation-isolation` |
| T1 | `prompt-injection-in-evidence` |
| T2 | `oversized-context` |
| T3 | `conflicting-source-values` |
| T4 | `undocumented-teamcenter-path` |
| T5 | `stale-source-evidence` |
| T6 | `refresh-change-explanation` |
| T7 | `unsupported-identifier` |
| T8 | `irrelevant-lexical-distractor` |

Reserve E1 and M1 for Task 2.

- [ ] **Step 4: Run the focused test to verify existing mappings pass**

Run: `npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: The mapping assertions identify only E1 and M1 as missing; all pre-existing evaluation assertions remain unchanged.

### Task 2: Add only the missing E1 and M1 benchmark cases

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/cases.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
- Reference: `OrchestrationPlatform/frontend/features/lattice-next/tests/copilot-relationship-flow.test.ts`

**Interfaces:**
- Consumes: Existing fixture entities, `withCanonical`, existing relationship constructors, and current context-builder behavior.
- Produces: `entity-ranking-summary` mapped to E1 and `investigation-wide-application-connections` mapped to M1.

- [ ] **Step 1: Write the failing case-specific assertions**

Add assertions for:

1. E1:
   - question is a summary question over the fixture investigation;
   - packet does not require clarification;
   - primary selected entities include the business requirement/part/material/configuration entities;
   - lifecycle/catalog/status metadata does not displace the business entities.

2. M1:
   - question is exactly: `Which applications are involved in this investigation and how are they connected?`;
   - `questionIntent` is `relationship`;
   - `ambiguity.clarificationRequired` is false;
   - selected entity IDs remain empty for investigation-wide retrieval;
   - packet contains relationships with `projection:domain:cross-source`;
   - available application coverage includes Codebeamer, Windchill, SAP, and Configit when present in the fixture.

- [ ] **Step 2: Run the focused test to verify the new cases are absent**

Run: `npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: FAIL because the two new case IDs and roadmap mappings do not exist.

- [ ] **Step 3: Add the minimal synthetic cases**

Construct E1 from the existing fixture with metadata distractor entities/relationships only where needed to exercise the already-implemented ranking policy. Construct M1 from the existing fixture plus the existing identity-cluster/subject-candidate shape used by `copilot-relationship-flow.test.ts`; do not create a second fixture family or duplicate relationship materialization logic.

- [ ] **Step 4: Run the focused test to verify the missing cases pass**

Run: `npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: PASS for E1/M1 assertions and all existing evaluation assertions.

### Task 3: Make the current suite the final unified catalog contract

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/cases.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/RELEASE-GATES.md`

**Interfaces:**
- Consumes: Complete roadmap mappings and the two new cases from Tasks 1-2.
- Produces: A documented, executable 16-case roadmap catalog with no duplicate runner.

- [ ] **Step 1: Add uniqueness and completeness checks**

Assert that:

- every roadmap ID appears exactly once;
- every case ID is unique;
- the total catalog count is 16;
- all pre-existing 14 categories remain represented;
- E1 and M1 have the required case-specific expectations.

- [ ] **Step 2: Add the final catalog table to release documentation**

Document the single catalog mapping table, the existing Vitest command, the distinction between context/grounding validation and live answer validation, and the rule that future cases must extend `cases.ts` rather than introduce another benchmark runner.

- [ ] **Step 3: Run the complete offline evaluation suite**

Run: `npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: PASS with 16 cases and all roadmap IDs covered.

- [ ] **Step 4: Run the directly related regression suites**

Run the existing focused context, relationship-flow, and Copilot turn tests using the repository’s configured Vitest command.

Expected: Existing relationship visibility, investigation scope, ranking, prompt grounding, and response validation tests remain green.

### Task 4: Produce the Sprint 1 benchmark inventory and execution record

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-baseline.md`

**Interfaces:**
- Consumes: The unified 16-case catalog, offline evaluation output, existing metrics, and release-gate constraints.
- Produces: The Sprint 1 baseline artifact; no new runtime framework.

- [ ] **Step 1: Record the catalog and ownership**

Include each roadmap ID, stable case ID, category, fixture source, expected behavior, and owning area (`context-builder`, `PLM Brain/relationship materialization`, `answer validation`, or `release/evaluation`).

- [ ] **Step 2: Record execution results without inventing model answers**

For offline runs, record context/grounding metrics and test outcomes. Mark live answer fields as not run unless an explicitly approved live smoke test was actually executed.

- [ ] **Step 3: Record maintenance rules**

State that changes to ranking, investigation scope, relationship materialization, citation validation, or safety behavior must update the existing case or add one missing roadmap case, with no parallel catalog.

- [ ] **Step 4: Verify the artifact matches the executed suite**

Cross-check that every listed case ID exists in `COPILOT_EVALUATION_CASES` and every listed roadmap ID appears exactly once.

### Task 5: Record manual live Copilot validation

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md`

**Interfaces:**
- Consumes: The running Copilot, the final E1/M1/M2/T1/T8 questions, and the offline catalog expectations.
- Produces: A manual answer-quality record; no new runner, framework, or orchestration code.

- [ ] **Step 1: Confirm the live-validation boundary**

Verify that the running Copilot is available and that any live provider call is explicitly approved and configured according to `RELEASE-GATES.md`. If it is unavailable or not approved, record each case as `Not executed` with the blocking reason; do not simulate an actual answer.

- [ ] **Step 2: Execute the five cases manually**

Run E1, M1, M2, T1, and T8 against the running Copilot, preserving the exact question and returned answer. Do not retry in a way that changes the recorded answer without documenting the retry.

- [ ] **Step 3: Record the validation table**

For each case, record:

- Question
- Actual Answer
- Expected Outcome
- Pass/Fail
- Observations

- [ ] **Step 4: Verify the record is explicit about execution status**

Distinguish `Pass`, `Fail`, and `Not executed`; never mark a case as passed from code inspection or offline context assertions alone.

---

## Self-Review

- **Spec coverage:** Inventory, E/M/T mapping, missing cases, final catalog, execution strategy, ownership, and maintenance are covered by Tasks 1-4.
- **No duplication:** The plan extends the existing cases, tests, metrics, and release gates; it does not add a new runner or fixture hierarchy.
- **Type consistency:** `RoadmapBenchmarkId` and `roadmapIds` are defined in `cases.ts` and consumed by the existing Vitest suite.
- **Validation:** E1 and M1 receive direct assertions; existing 14-case safety and grounding behavior remains covered.
- **Known limitation:** The offline suite validates context and contract behavior, not a live model’s prose answer. The baseline must state that distinction.

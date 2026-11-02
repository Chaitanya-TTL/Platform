# Context-builder ranking fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make benchmark E1 summary answers prioritize engineering entities and relationships over metadata nodes.

**Architecture:** Keep the change inside `context-builder.ts`. Add deterministic business-weight helpers, use them in entity importance and major-relationship ordering, remove summary identifier gating, and apply a metadata-aware fallback when building the engineering brief.

**Tech Stack:** TypeScript, Vitest, existing Copilot context contracts.

**Spec:** `docs/superpowers/specs/2026-10-30-context-builder-ranking-design.md`

## Global Constraints

- Do not modify ontology, knowledge graph, PLM Brain, extraction, relationship enrichment, impact path generation, prompt layer, or UI.
- Business significance must dominate graph structure in entity ranking.
- Metadata entities remain available only as fallback when no better business entities exist.
- Do not claim benchmark success based only on compilation or test success; inspect the resulting selected entities and relationships.

## Review Focus

- Summary question without an identifier selects business entities: test in `copilot-relationship-flow.test.ts`.
- Metadata-only investigation still returns usable primary entities: test fallback behavior in the same file.
- Relationship kind casing and aliases rank consistently: test `specifies`, `represented_as`, and `operationally-represented-as`.
- Business relationship with weak evidence outranks metadata relationship with strong evidence: test major relationship ordering.
- Existing non-summary identifier-focused retrieval remains unchanged: test an impact or dependency query still selects its explicit entity.

---

### Task 1: Add failing ranking regression coverage

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/tests/copilot-relationship-flow.test.ts`

**Interfaces:**
- Consumes: `buildInvestigationContext`, `buildEngineeringBrief`, and existing fixture types from `copilot/contracts`.
- Produces: failing tests that pin summary entity selection, weighted entity importance, relationship ordering, brief filtering, and non-summary behavior.

- [ ] **Step 1: Add a summary fixture with engineering and metadata entities**

Create entities representing a requirement, part, material, configuration, lifecycle,
origin, catalog revision, catalog status, and priority. Add relationships where
engineering links use `specifies`, `represented_as`, and `configured_by`, while
metadata links use `contains` or `has_field`.

- [ ] **Step 2: Add the failing summary-selection test**

Build a summary packet for `"What are the primary entities present in this investigation?"`.
Assert that the first three selected/primary entities are the requirement, part, and
material or configuration, and that lifecycle/catalog metadata does not occupy those
slots.

- [ ] **Step 3: Add the failing relationship-ordering test**

Build an engineering brief containing one engineering relationship and one metadata
relationship. Assert that the engineering relationship is first even when the
metadata relationship has stronger status/evidence or cross-application signals.

- [ ] **Step 4: Add the fallback and non-summary tests**

Assert that a metadata-only investigation still produces primary entities, and that
an impact/dependency question containing an explicit identifier continues to select
the matching entity.

- [ ] **Step 5: Run the focused tests and verify they fail for the current ranking**

Run:

```text
npx vitest run features/lattice-next/tests/copilot-relationship-flow.test.ts --reporter=basic
```

Expected: the new ranking assertions fail before implementation.

### Task 2: Implement business-aware ranking in context-builder

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts`

**Interfaces:**
- Consumes: `CopilotEntityContext`, `CopilotRelationshipContext`, `ReasoningPackage`, and existing ranking helpers.
- Produces: `businessWeight(entity: CopilotEntityContext): number`, `relationshipBusinessWeight(relationship: CopilotRelationshipContext): number`, and updated summary/brief ranking behavior.

- [ ] **Step 1: Add normalized business-weight helpers**

Implement case-insensitive, separator-tolerant matching for entity kinds/display names
and relationship kinds/families. Use these exact entity weights:

```text
investigation subject 1.00
product 0.95
requirement 0.90
part 0.85
material 0.85
configuration 0.80
change 0.75
document 0.60
requirement detail 0.20
lifecycle 0.15
origin 0.15
catalog revision 0.15
catalog status 0.15
metadata 0.10
attribute 0.05
```

Use these exact relationship weights:

```text
specifies 100
impacts 100
validated_by 95
represented_as 95
operational_representation_as 95
configured_by 90
implemented_by 90
traced_to 85
contains 20
has_field 10
metadata 5
```

Unknown values should use a neutral business weight rather than being discarded.

- [ ] **Step 2: Replace graph-dominant entity importance scoring**

In `buildReasoningPackage`, calculate normalized relationship, evidence, impact,
cross-application, and ontology components, then use:

```text
businessWeight * 0.50
+ relationshipScore * 0.15
+ evidenceScore * 0.10
+ impactScore * 0.10
+ crossApplicationScore * 0.05
+ ontologyScore * 0.10
```

Keep the existing `EntityImportance` fields and deterministic tie-breakers.

- [ ] **Step 3: Remove summary identifier-only filtering**

Change summary `entityCandidates` to retain the ranked candidate list rather than
filtering to exact identifiers. Preserve identifier-aware filtering for non-summary
questions.

- [ ] **Step 4: Select top business entities for summary context**

Update summary `selectedEntityIds` logic to choose the top three ranked business
entities. Use metadata entities only when no higher-weight business entities are
available. Do not change the explicit-identifier path for impact, dependency,
relationship, root-cause, evidence, risk, or change-analysis questions.

- [ ] **Step 5: Apply business weighting to major relationships**

In `buildEngineeringBrief`, sort relationships by:

1. `relationshipBusinessWeight`
2. cross-application signal
3. status score
4. strength score
5. evidence count
6. stable relationship ID

- [ ] **Step 6: Filter/deprioritize metadata primary entities in the brief**

Before emitting `EngineeringBrief.primaryEntities`, partition reasoning-package
primary entities into business and metadata candidates using `businessWeight`.
Emit business candidates first and append metadata candidates only if needed to
fill the existing limit.

### Task 3: Verify benchmark behavior and regression safety

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/tests/copilot-relationship-flow.test.ts` only if assertions need alignment with the final deterministic ordering.

**Interfaces:**
- Consumes: updated context-builder ranking behavior.
- Produces: validated benchmark-style evidence showing engineering entities and relationships win.

- [ ] **Step 1: Run the focused relationship-flow test**

Run:

```text
npx vitest run features/lattice-next/tests/copilot-relationship-flow.test.ts --reporter=basic
```

Expected: PASS, including the summary entity and major relationship assertions.

- [ ] **Step 2: Inspect the benchmark-shaped output**

Verify the serialized packet/brief for the summary question contains business
entities such as requirement, part, material, and configuration before lifecycle,
origin, catalog revision, catalog status, or priority.

- [ ] **Step 3: Run the frontend build/type check**

Run the repository's existing frontend build command from
`OrchestrationPlatform/frontend`.

Expected: the build completes without new TypeScript errors.

- [ ] **Step 4: Report measured outcome**

Report the actual selected entity names, major relationship names, and cross-system
applications observed in the benchmark-shaped result. Do not describe success solely
as “tests pass.”

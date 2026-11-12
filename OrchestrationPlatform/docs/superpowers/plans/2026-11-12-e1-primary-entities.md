# E1 Primary Entities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and render E1's one-per-application Primary entities section from semantically selected representatives, preferring a Configit work-item subject over its child configuration families.

**Architecture:** Keep semantic selection in Copilot context construction and preserve the selected representative as a compact participation projection. E1 answer-coverage augmentation will consume that projection rather than the independently ranked, capped `EngineeringBrief.primaryEntities`; existing UI rendering remains a pass-through of persisted answer text.

**Tech Stack:** TypeScript, Vitest, React Testing Library, ESLint.

**Spec:** `docs/superpowers/specs/2026-11-11-e1-primary-entities-rendering-design.md`

## Global Constraints

- Include exactly one semantically primary representative per application present in the investigation.
- Configit selection order: product/work-item subject; product model; product context; configuration model; configuration family; feature; configuration rule or expression; metadata or attribute.
- Do not hardcode Work-item ID 305, Market MRKT, or child object names.
- Preserve representative entity ID, display label, native ID where available, kind or semantic role, source application, and that entity's own citation ID.
- Keep secondary families, features, rules, and metadata available for drill-down.
- Do not change M1 compaction, M2 evidence-state/citation behavior, ontology, impact reasoning, or context limits.
- Do not copy full entity payloads into the persisted answer or make a provider request.
- Do not commit changes.

## Review Focus

- Configit subject role is carried by a generic source-representation plus authoritative subject properties; distinguish it from a secondary configuration family using semantic evidence, not its literal ID.
- Equal-priority Configit candidates must resolve deterministically; test stable entity-ID tie-breaking.
- A family with a recognizable display label must not outrank a suitable subject or model; test category precedence independently of labels.
- Fallback must skip absent categories in the exact specified order and stop at the highest category available; test each adjacent category precedence.
- Every generated E1 line must cite the selected entity, while a child-family citation must not be substituted for the subject citation; test persisted answer citation IDs.

---

### Task 1: Select Configit representatives semantically

**Files:**
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Modify: `frontend/features/lattice-next/copilot/contracts.ts`
- Test: `frontend/features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`
- Create: `frontend/features/lattice-next/copilot/tests/configit-representative-selection.test.ts`

**Interfaces:**
- Consume: `CopilotEntityContext` values gathered for each subject/application participation group.
- Produce: the existing single `representativeEntityIds`, labels, and kinds in `SubjectApplicationParticipation`; extend the compact brief representative with `nativeId` and optional semantic role while retaining `entityId`, `displayLabel`, `kind`, `sourceApplication`, and `citationId`.

- [ ] **Step 1: Add failing current-investigation assertions**

Update the current E1 and M1 traceability assertions to expect Configit `Steering, Work-item ID 305`, entity `configit:subject:305`, semantic role `product/work-item subject`, and its own citation, not `Market MRKT`.

- [ ] **Step 2: Run the focused traceability test and confirm it fails**

Run: `npm test -- --reporter=dot features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`
Expected: failure showing the current Configit representative is Market rather than the subject.

- [ ] **Step 3: Add failing Configit hierarchy tests**

In `configit-representative-selection.test.ts`, test the ordered candidates using synthetic Configit entities: product/work-item subject > product model > product context > configuration model > configuration family > feature > rule/expression > metadata. Include an equal-rank tie resolved by stable entity ID and prove a recognizable family label cannot outrank a higher semantic category. Use no investigation-specific IDs or labels.

- [ ] **Step 4: Run the focused hierarchy tests and confirm they fail**

Run: `npm test -- --reporter=dot features/lattice-next/copilot/tests/configit-representative-selection.test.ts`
Expected: failures for missing semantic precedence and subject recognition.

- [ ] **Step 5: Implement deterministic Configit representative selection**

In `context-builder.ts`, add an internal semantic category rank for Configit candidates. Recognize an authoritative participating product/work-item subject from its semantic role/properties, then rank product model, product context, configuration model, family, feature, rule/expression, and metadata in order. Within a category, prefer entities carrying their own work-item identity/name when represented, then use entity ID for stable tie-breaking. Keep non-Configit application selection unchanged.

Extend the compact representative projection with native ID and optional semantic role. Use role `product/work-item subject` for the selected Configit subject and `operational material` for SAP material representatives whose stored kind is a generic source representation; retain stored entity kinds separately.

- [ ] **Step 6: Run representative and traceability tests**

Run: `npm test -- --reporter=dot features/lattice-next/copilot/tests/configit-representative-selection.test.ts features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`
Expected: both files pass; the Configit subject wins, Market remains present in the investigation graph, and its own citation remains distinct.

### Task 2: Build persisted E1 section from selected representatives

**Files:**
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`

**Interfaces:**
- Consume: `EngineeringBrief.subjectApplicationParticipation[].representativeEntity`, including its selected entity ID, display label, native ID, kind, semantic role, application, and citation ID.
- Produce: E1 answer coverage lines and factual coverage claims using the same representative and its entity citation; do not use or rerank `EngineeringBrief.primaryEntities` for this section when balanced representative projections exist.

- [ ] **Step 1: Add failing answer-coverage and persistence-boundary tests**

Add a context-builder assertion that E1 augmentation outputs exactly one primary line for each of the four current applications with these labels and roles: `Steering System Requirements` (requirement; Codebeamer), `Steering part 0000003874` (part-occurrence; Windchill), `Material MAT7893` (operational material; SAP), and `Steering, Work-item ID 305` (product/work-item subject; Configit). Add an executor test with the existing mocked provider that inspects `mocks.persistedAnswers`, asserts all four selected entity citation IDs are attached to their representative claims, and asserts `configit:family:mrkt` is not used as the primary citation while Market remains in the context as a secondary entity.

- [ ] **Step 2: Run the new focused tests and confirm the missing lines fail**

Run: `npm test -- --reporter=dot features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts -t 'primary entities|representative'`
Expected: the persisted answer lacks Windchill/SAP and selects Market for Configit.

- [ ] **Step 3: Update E1 answer-coverage augmentation**

In `ensureEngineeringAnswerCoverage`, build the structured Primary entities block from the already-selected participation representatives when available, preserving their entity citations. Use the semantic role for generic source-representation entities and the existing display application name. Retain the current ranked-brief fallback for answers without representative projections. Do not modify the consequence/M2 early return or M1 compaction behavior.

- [ ] **Step 4: Verify context projection and persisted answer**

Run: `npm test -- --reporter=dot features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
Expected: both pass; the saved assistant answer contains the four expected lines and entity citations, with no Market-as-primary line.

### Task 3: Verify UI pass-through and scoped regression gate

**Files:**
- Modify: `frontend/features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`
- Verify: `frontend/features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`
- Verify: `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Verify: `frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Verify: `frontend/features/lattice-next/copilot/tests/configit-representative-selection.test.ts`

- [ ] **Step 1: Add a renderer pass-through regression**

Verify `CopilotAnswerContent` renders the persisted Primary entities section in input order and text without substituting, filtering, or reranking any of its four lines.

- [ ] **Step 2: Run the focused regression set**

Run: `npm test -- --reporter=dot features/lattice-next/workspace/tests/copilot-answer-content.test.tsx features/lattice-next/copilot/tests/current-investigation-traceability.test.ts features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/tests/configit-representative-selection.test.ts`
Expected: all selected tests pass; no provider request is made.

- [ ] **Step 3: Run changed-file ESLint**

Run: `npx eslint features/lattice-next/copilot/context-builder.ts features/lattice-next/copilot/contracts.ts features/lattice-next/copilot/tests/current-investigation-traceability.test.ts features/lattice-next/copilot/tests/configit-representative-selection.test.ts features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`
Expected: exit code 0.

- [ ] **Step 4: Check the complete worktree diff for whitespace errors**

Run from the repository root: `git diff --check`
Expected: exit code 0; do not alter unrelated worktree changes.

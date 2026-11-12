# Four-Application M1 Context Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep four-application M1 context under 22,500 characters without removing application coverage or changing authoritative graph data.

**Architecture:** Deduplicate only the investigation-scoped M1 context and prompt projection. Keep the four canonical `subjectApplicationParticipation` records and one compact representative per app; replace per-app narratives and repeated prose/representative fields with one connectivity narrative and one boundary statement. Leave M2 and graph materialization untouched.

**Tech Stack:** TypeScript, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-11-11-four-application-m1-context-deduplication-design.md`

## Global Constraints

- Keep all authoritative graph edges and four structured application participation records.
- Keep exactly one compact business representative per application, one overall connectivity narrative, and one evidence-boundary statement.
- Remove duplicated participation and representative prose from the M1 prompt projection only.
- Do not change graph materialization, ontology, M2, impact reasoning, or the 24,000-character hard limit; target a packet no larger than 22,500 characters.
- Do not make a provider request.

## Review Focus

- Four-app summary loses Configit or another app during budget reduction — test all four application participation records and representatives survive.
- Subject-edge evidence is accidentally sent as direct relationships — test graph edges remain authoritative while prompt entity-edge count stays zero and no direct link is inferred.
- App facts remain duplicated through narrative, brief, or supporting context — test the serialized M1 prompt has exactly one connectivity narrative and no per-app subject narratives/prose duplicates.
- M1-only compaction changes M2 — assert the existing M2 prompt/evidence state behavior remains unchanged in the focused M1 regression test.
- Packet still barely fits or exceeds hard budget — assert serialized packet length is at most 22,500 while production hard limit remains 24,000.

---

### Task 1: Deduplicate four-application M1 context and prompt

**Files:**
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `frontend/features/lattice-next/tests/subject-traceability.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`
- Verify: `frontend/features/lattice-next/tests/budget-preservation.test.ts`
- Verify: `frontend/features/lattice-next/copilot/tests/answer-validator.test.ts`

**Interfaces:**
- Consumes: `buildInvestigationContext(snapshot, question, options)` and `engineeringPromptPayload(question, contextPacket)`.
- Produces: an M1-only compact packet/prompt projection with canonical `subjectApplicationParticipation`, one overall connectivity narrative, one evidence-boundary statement, and application-balanced representatives.

- [x] **Step 1: Add a failing four-application regression test** in `subject-traceability.test.ts` using Codebeamer, Windchill, SAP, and Configit participants and authoritative subject edges. It checks a 22,500-character ceiling, four compact participation records, one representative per app, one connectivity narrative, zero prompt entity-level subject edges, no direct engineering relationship claim, and no repeated participation prose.
- [x] **Step 2: Run the focused regression test** with Vitest; the old four-narrative output failed the new assertions before implementation.
- [x] **Step 3: Implement M1-only deduplication** in `context-builder.ts`; retain graph edges and canonical participation data, compact the M1 prompt projection, and remove unrelated same-system metadata relationship records. Non-M1/M2 composition remains on its existing path.
- [x] **Step 4: Assert M2 remains unchanged** using the existing M2 consequence prompt/evidence-state assertion and the focused execute-turn M2 integration test.
- [x] **Step 5: Run the requested tests:** current-investigation traceability, subject traceability, budget preservation, answer-validator tests, and the focused M2 execute-turn test. The M2 golden-fixture budget case still fails independently at 27,162 characters; M1 and focused M2 validator/integration assertions pass.
- [x] **Step 6: Run ESLint on changed files and `git diff --check`;** the four-application 80-participant fixture serializes to 12,580 characters and retains all four apps and representatives.

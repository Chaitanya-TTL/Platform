# Lattice RAG Phase 3A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a test-injected, fixture-backed document retrieval path to the existing Copilot turn executor while keeping the investigation packet authoritative and production retrieval hard-disabled.

**Architecture:** Keep `CopilotContextPacket` graph-only and add authorized, budget-retained retrieval evidence only as a separate provider-payload section. The existing turn executor remains the only production entry point; a server-only runtime seam returns unavailable by default and is mocked by tests to inject the fixture index, principal, policy, flag, and diagnostics store. Retrieval-only citations are passed separately to validation and persisted using the existing citation shape.

**Tech Stack:** TypeScript, Vitest, existing fixture retrieval ports and allocator, mocked provider; no new dependencies or external services.

**Spec:** `docs/superpowers/specs/2026-11-11-lattice-rag-phase-3a-design.md`

## Global Constraints

- The existing investigation graph remains authoritative.
- Retrieval evidence may support document-content claims only; it must not establish canonical identity, ontology relationships, subject-traceability edges, impact paths, impact chains, or operational consequences.
- `CopilotContextPacket` remains graph-only.
- Retrieval runs only for exact `document` intent and only when a server-side test-injected runtime is enabled.
- Production construction supplies no retrieval runtime; there is no environment/configuration switch or request-body override.
- Missing principal, failed/inconsistent authorization, retrieval error, or no usable evidence fails closed to graph-only behavior.
- Only authorized, budget-retained evidence and its citation IDs may enter the prompt or validator.
- Keep the existing 24,000-character hard limit, 1,500-character minimum reserve, 1,000-character primer maximum, and 6,000-character retrieval maximum.
- M1, M2, E1, existing non-document behavior, graph materialization, ontology authority, and `consequenceEvidenceState` remain unchanged.
- No real enterprise documents, production identity/RBAC, embeddings, vector infrastructure, new external dependencies, or live provider calls.

## Review Focus

- Mixed questions containing document terms plus impact, relationship, evidence, or change language must retain the existing higher-priority intent; test document classification precedence in Task 1.
- A denied best lexical match must never be text-loaded or reach evidence, prompt, answer citations, or UI; test authorization ordering and no-leak behavior in Task 4.
- Retrieval citations omitted by budgeting or supplied outside the active evidence set must be rejected; test validator allowlist and returned citation serialization in Task 2 and Task 4.
- Low graph confidence may be bypassed only for exact document intent with at least one authorized, budget-retained evidence record; test both retained-evidence and every fallback branch in Task 4.
- Environment variables and request fields must not activate retrieval or set principal scope; test the default runtime and route allowlist in Task 3 and Task 5.

---

## File map

### Modify

- `frontend/features/lattice-next/copilot/contracts.ts` — add `"document"` to the intent union and `"retrieval-document"` to citation kinds; do not add retrieval fields to `CopilotContextPacket`.
- `frontend/features/lattice-next/copilot/context-builder.ts` — classify explicit document questions after existing intent rules; accept optional retrieval evidence in prompt projection and add a separate labeled section only when nonempty.
- `frontend/features/lattice-next/copilot/answer-validator.ts` — validate optional retrieval citations against an explicit active allowlist, include only active retrieval citations in validated answers, and prevent retrieval-only citations from substantiating graph-authority claims.
- `frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts` — permit the new retrieval citation kind in the existing citation allowlist without changing persisted answer shape.
- `frontend/features/lattice-next/copilot/execute-copilot-turn.ts` — run the optional runtime after authoritative context construction and before the existing low-confidence short-circuit; preserve existing single provider/repair/validation/persistence flow.
- `frontend/features/lattice-next/copilot/turn-stage-journal.ts` — add a retrieval completion stage and sanitized reason/aggregate fields; emit these only for document turns.
- `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts` — no feature fields are added; route tests pin the current request allowlist.
- `docs/lattice-intelligence/RAG-PHASE-2-BOUNDARIES.md` — clarify that Phase 2 remains frozen and describe the Phase 3A test-only prompt integration boundary.

### Create

- `frontend/features/lattice-next/copilot/retrieval/retrieval-runtime.ts` — server-only runtime contract and default unavailable getter; no environment reads or production fixture construction.
- `frontend/features/lattice-next/copilot/tests/document-intent.test.ts` — intent precedence and graph-only packet/prompt projection coverage.
- `frontend/features/lattice-next/copilot/tests/document-retrieval-validation.test.ts` — retrieval citation allowlist, citation serialization, and graph-claim boundary tests.
- `frontend/features/lattice-next/copilot/tests/retrieval-runtime.test.ts` — production getter remains unavailable regardless of environment.
- `frontend/features/lattice-next/copilot/tests/document-retrieval-turn.test.ts` — mocked full-turn cases with the runtime seam mocked to fixture dependencies and the provider mocked.
- `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.test.ts` — reject request-body retrieval/principal overrides.
- `docs/lattice-intelligence/RAG-PHASE-3A-BOUNDARIES.md` — fixture-only phase boundary and production blockers.

### Reuse without modifying

- `frontend/features/lattice-next/copilot/retrieval/build-retrieval-query.ts`
- `frontend/features/lattice-next/copilot/retrieval/retrieve-evidence.ts`
- `frontend/features/lattice-next/copilot/retrieval/allocate-retrieval-budget.ts`
- `frontend/features/lattice-next/copilot/retrieval/tests/in-memory-retrieval-index.ts`
- `frontend/features/lattice-next/copilot/retrieval/tests/fixture-access-policy.ts`
- Existing `execute-copilot-turn.test.ts`, `answer-validator.test.ts`, `turn-stage-journal.test.ts`, and `retrieval/tests/frozen-behavior.test.ts` as regression references; do not change frozen fixtures to accommodate failures.

---

### Task 1: Add explicit document intent and optional prompt section

**Files:**
- Modify: `frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `frontend/features/lattice-next/copilot/tests/document-intent.test.ts`

**Interfaces:**
- Consumes: `RetrievalEvidence` from `copilot/retrieval/contracts.ts`.
- Produces: `engineeringPromptPayload(question: string, contextPacket: CopilotContextPacket, retrievalEvidence?: readonly RetrievalEvidence[])`; with no evidence, return the existing payload exactly. With evidence, append a separate `retrievedDocumentEvidence` section labeled `authority: "retrieved-document"` and containing only the supplied evidence records. When graph confidence is below threshold, include an explicit uncertainty/boundary note in that optional section; do not alter the graph packet.
- `CopilotContextPacket.questionIntent` gains `"document"`; the packet itself gains no retrieval properties.

- [ ] **Step 1: Write failing intent and projection tests.** Assert explicit document/specification/requirements/manual questions classify as `document`; M1 four-application participation, M2 consequence, E1 entity participation, and prior relationship/evidence/change/impact/risk/root-cause questions retain their prior intent. Assert mixed “document says what impact…” language still classifies by the pre-existing higher-priority intent. Assert packet keys and JSON are unchanged and graph-only provider payload equals its pre-extension shape. Assert supplied retrieval evidence appears only in the separate labeled section and low graph confidence adds a visible uncertainty there without changing the packet.
- [ ] **Step 2: Run the focused tests and verify failure.** From `frontend/`, run `npx vitest run features/lattice-next/copilot/tests/document-intent.test.ts`; expected failure is missing `document` classification/type or optional projection.
- [ ] **Step 3: Implement document intent and `engineeringPromptPayload` optional evidence input.** Add document cues only after all existing classification checks. Do not change graph-building logic or place retrieval values on the packet.
- [ ] **Step 4: Run focused intent/projection and frozen parity tests.** Run `npx vitest run features/lattice-next/copilot/tests/document-intent.test.ts features/lattice-next/copilot/retrieval/tests/frozen-behavior.test.ts`; expected all pass, including exact graph-only payload parity.
- [ ] **Step 5: Commit the intent and prompt-projection slice.**

### Task 2: Validate and persist retrieval citations without changing answer shape

**Files:**
- Modify: `frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `frontend/features/lattice-next/copilot/answer-validator.ts`
- Modify: `frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts`
- Test: `frontend/features/lattice-next/copilot/tests/document-retrieval-validation.test.ts`
- Regression: `frontend/features/lattice-next/copilot/tests/answer-validator.test.ts`

**Interfaces:**
- Consumes: graph citations from `CopilotContextPacket.citations`; an optional readonly array of `CopilotCitation` records created only from the budget-retained evidence set.
- Produces: `CopilotCitationKind` includes `"retrieval-document"`; `validateCopilotAnswer(value, context, diagnostics?, retrievalCitations = [])` validates against graph citation IDs plus only the passed retrieval IDs and returns used citations in the existing `CopilotAnswer.citations` object shape.
- Retrieval-only citations cannot substantiate claims classified by `classifyConsequenceClaim` as anything other than `"other"` or claims asserting canonical identity, an ontology/engineering relationship, traceability, an impact path/chain, or an operational consequence. Such claims need at least one active graph citation in the same claim. M2’s existing `consequenceEvidenceState` rules remain authoritative and unchanged. The conversation store accepts the new citation kind while retaining its current answer shape.

- [ ] **Step 1: Write failing citation-boundary tests.** Assert active retrieval citation IDs validate and are returned with kind `retrieval-document`; omitted, unknown, and fallback citations reject; any claim classified by `classifyConsequenceClaim` other than `"other"` or matching canonical-identity, engineering-relationship, traceability, impact-path/chain, or operational-consequence language cannot be supported solely by a retrieval citation; an active graph citation remains valid for such claims under existing rules; existing graph-only answer serialization remains unchanged.
- [ ] **Step 2: Run focused tests and verify failure.** From `frontend/`, run `npx vitest run features/lattice-next/copilot/tests/document-retrieval-validation.test.ts`; expected failures should identify missing retrieval-citation handling.
- [ ] **Step 3: Implement the narrow validator extension.** Accept separate retrieval citation records, combine their IDs with existing graph citations for schema validation, enforce retrieval-only claim boundaries, and include only used active citations in the existing answer shape.
- [ ] **Step 4: Run new and existing validator tests.** Run `npx vitest run features/lattice-next/copilot/tests/document-retrieval-validation.test.ts features/lattice-next/copilot/tests/answer-validator.test.ts`; expected all pass.
- [ ] **Step 5: Commit the citation-validation slice.**

### Task 3: Add a hard-disabled server runtime seam and sanitized journal outcome

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/retrieval-runtime.ts`
- Modify: `frontend/features/lattice-next/copilot/turn-stage-journal.ts`
- Test: `frontend/features/lattice-next/copilot/tests/retrieval-runtime.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/turn-stage-journal.test.ts`

**Interfaces:**
- Produces: `DocumentRetrievalRuntime` with `enabled`, optional fixture/server-owned `principal`, `index`, `accessPolicy`, and `diagnosticsStore`; `getDocumentRetrievalRuntime(): DocumentRetrievalRuntime | undefined` returns `undefined` in production and reads no environment variables.
- Journal adds `retrieval-completed` and sanitized `retrievalOutcome` fields: stable reason code plus bounded aggregate counts/character counts only. No chunk IDs, ACL membership, text, excerpt, private URI, or internal exception detail is included in this outcome record.
- Tests inject a runtime by mocking the server-only runtime module; neither command nor HTTP request gains an injection field.

- [ ] **Step 1: Write failing runtime/journal tests.** Assert default getter returns `undefined` even with retrieval-related environment values set; serialized journal outcomes retain request ID and reason code while excluding supplied private text, URL, denied chunk IDs, and ACL values; existing journal records retain their current fields.
- [ ] **Step 2: Run targeted tests and verify failure.** From `frontend/`, run `npx vitest run features/lattice-next/copilot/tests/retrieval-runtime.test.ts features/lattice-next/copilot/tests/turn-stage-journal.test.ts`; expected failure is the missing runtime/outcome contract.
- [ ] **Step 3: Implement the default-unavailable runtime and sanitized journal fields.** Keep the runtime server-only and unconfigured by env; add an explicit reason-code union for `retrieval-disabled`, `retrieval-dependency-unavailable`, `retrieval-principal-unavailable`, `retrieval-access-denied`, `retrieval-failed`, `retrieval-no-evidence`, `retrieval-budget-omitted`, and `retrieval-succeeded`.
- [ ] **Step 4: Run the targeted tests.** Re-run the same Vitest command; expected all pass, with production runtime unavailable and journal output sanitized.
- [ ] **Step 5: Commit the runtime/journal boundary.**

### Task 4: Integrate retrieval, authorization, budgeting, and fallback in the existing executor

**Files:**
- Modify: `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts` only if a narrow serialized-section size helper is required; do not restructure the context builder.
- Test: `frontend/features/lattice-next/copilot/tests/document-retrieval-turn.test.ts`

**Interfaces:**
- Consumes: `getDocumentRetrievalRuntime()`, `buildRetrievalQuery`, `retrieveEvidence`, `allocateRetrievalBudget`, Task 1 prompt projection, Task 2 validator citation mapping, and Task 3 sanitized journal outcomes.
- Produces: unchanged production `executeCopilotTurn(command)` API. Retrieval occurs only for exact `"document"`; only the internal executor uses the runtime seam.

- [ ] **Step 1: Write failing mocked turn tests for the happy path and order.** Mock the provider and runtime with the Phase 2 fixture index/policy/principal. Assert authoritative context is built first; lexical/semantic metadata search precedes authorization; only allowed IDs are text-loaded; budget allocation precedes prompt construction; the prompt labels evidence as retrieved-document; validator receives only budget-retained citation records; exactly one provider call and existing repair/validation/persistence occur.
- [ ] **Step 2: Write failing fallback and low-confidence tests.** Cover missing/disabled runtime, missing principal, overall authorization failure, retrieval exception, mixed candidate-level denial with lower authorized evidence, no evidence, and all evidence omitted by budget. For graph confidence above threshold, assert fallback uses byte-identical graph-only payload, zero retrieval citations/evidence, one provider call, stable sanitized outcome, and no denied text leakage. At low graph confidence, assert retained authorized document evidence permits one provider call and the prompt contains the graph-confidence uncertainty; every fallback/omission retains the existing insufficient-evidence response and zero provider calls.
- [ ] **Step 3: Run the focused turn tests and verify failure.** From `frontend/`, run `npx vitest run features/lattice-next/copilot/tests/document-retrieval-turn.test.ts`; expected failures should identify absent executor integration.
- [ ] **Step 4: Implement the document-only integration.** Build graph context before retrieval. Treat an absent runtime as `retrieval-dependency-unavailable`; do not accept runtime/principal fields from the command. On `authorization-failed` or retrieval exceptions discard all retrieval evidence. For ordinary candidate-level ACL denials, allow only independently authorized evidence returned by Phase 2. Build citation records only from budget-retained evidence. Use the existing allocator with serialized graph payload and section overhead protected, preserve the 1,500-character reserve and 24,000-character cap, and verify final serialization stays within the cap. Any fallback uses the exact graph-only payload and an empty retrieval citation allowlist. Retrieval failures never retry and never trigger a second provider call.
- [ ] **Step 5: Run document turn tests and frozen M1/M2/E1 parity.** Run `npx vitest run features/lattice-next/copilot/tests/document-retrieval-turn.test.ts features/lattice-next/copilot/retrieval/tests/frozen-behavior.test.ts`, then separately run `npx vitest run features/lattice-next/copilot/tests/execute-copilot-turn.test.ts -t 'validates and persists an insufficient-evidence M2 answer and rejects unsupported provider claims'`; expected all selected tests pass.
- [ ] **Step 6: Commit the executor integration slice.**

### Task 5: Pin request boundaries, complete regressions, and document Phase 3A

**Files:**
- Create: `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.test.ts`
- Create: `docs/lattice-intelligence/RAG-PHASE-3A-BOUNDARIES.md`
- Modify: `docs/lattice-intelligence/RAG-PHASE-2-BOUNDARIES.md`
- Test: `frontend/features/lattice-next/copilot/tests/document-retrieval-turn.test.ts`
- Regression: `frontend/features/lattice-next/copilot/retrieval/tests/frozen-behavior.test.ts`

**Interfaces:**
- Consumes: final executor/runtime behavior from Tasks 1–4.
- Produces: explicit proof that only server-side test construction enables fixture retrieval and Phase 3A constraints are documented.

- [ ] **Step 1: Write request-boundary tests.** Assert retrieval/principal/tenant/policy/ACL request fields are rejected by the existing API allowlist and never reach `executeCopilotTurn`; assert environment values alone leave the production runtime unavailable and produce no fixture text load.
- [ ] **Step 2: Write final non-document parity assertions.** Assert M1, M2, E1, and all existing non-document intents have zero retrieval invocations and unchanged packet/provider payload JSON, allowed graph citations, and M2 `consequenceEvidenceState`; include their existing low-confidence short-circuit behavior.
- [ ] **Step 3: Run the focused tests and verify failure.** From `frontend/`, run `npx vitest run app/api/lattice/investigations/[investigationId]/copilot/route.test.ts features/lattice-next/copilot/tests/document-retrieval-turn.test.ts features/lattice-next/copilot/retrieval/tests/frozen-behavior.test.ts`; expected failures pinpoint any request boundary or parity gap.
- [ ] **Step 4: Implement request tests and documentation.** Do not add route fields or request switches. Document graph authority, test-only injection, fallback reason codes, document-only low-confidence exception, authorization-before-text ordering, citation rules, and production blockers.
- [ ] **Step 5: Run required regressions and quality checks.** From `frontend/`, run the retrieval suite, `features/lattice-next/tests/subject-traceability.test.ts`, `features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`, `features/lattice-next/tests/budget-preservation.test.ts`, `features/lattice-next/copilot/tests/answer-validator.test.ts`, `features/lattice-next/copilot/tests/execute-copilot-turn.test.ts -t 'validates and persists an insufficient-evidence M2 answer and rejects unsupported provider claims'`, and changed-file ESLint. From repository root run `git diff --check`. Expected: all tests/lint pass and no whitespace errors; no provider request is made.
- [ ] **Step 6: Commit the boundary tests and documentation.**

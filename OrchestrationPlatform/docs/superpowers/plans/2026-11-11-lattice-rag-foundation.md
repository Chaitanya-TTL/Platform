# Lattice RAG Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-neutral, fixture-backed retrieval slice proving contracts, access filtering, ranking, citations, budgeting, diagnostics, evaluation, and isolation from frozen M1/M2/E1 behavior.

**Architecture:** Keep retrieval as an additive Copilot subsystem with independent contracts, ports, query construction, citation IDs, pure budget allocation, and deterministic fixture evaluation. Fixture search returns metadata only; a fail-closed access policy must approve candidates before a separate text-loading call can construct retrieval evidence. No current graph materialization, production prompt, or provider path is changed.

**Tech Stack:** TypeScript, existing Vitest test runner, in-memory fixtures, no network services or new dependencies.

**Spec:** Approved RAG discovery report and the user-approved Phase 2 scope in the conversation.

## Global Constraints

- The existing investigation graph remains authoritative.
- Retrieval evidence supplements the graph and cannot create canonical identities, ontology relationships, subject-traceability edges, impact paths, impact chains, or consequence evidence.
- M1, M2, and E1 remain frozen and retrieval-disabled.
- Retrieved text must not enter a prompt unless access has already been allowed.
- Missing identity, tenant, policy version, or ACL data must fail closed.
- No production vector database, embedding provider, or external dependency may be introduced.
- No live provider request may be made.
- Do not connect real enterprise documents or broadly rewrite `context-builder.ts`.
- Keep the existing 24,000-character hard limit unchanged.

## Review Focus

- Missing or stale identity, tenant, policy version, or document ACL metadata must deny all candidate text; test each missing-input case in the access-policy task.
- Unauthorized highest-ranked lexical candidates must never reach text loading, evidence, or serialized diagnostics; assert the text loader receives only allowed IDs.
- Duplicate hashes and overlapping same-section chunks must retain only the highest-ranked candidate while preserving removed IDs in diagnostics; test exact ties deterministically.
- Retrieval query IDs and subject/entity signals must never create graph relationships or alter protected graph context; assert graph structures remain equal before/after fixture retrieval.
- Character accounting at exact reserve and cap boundaries must not exceed the hard limit or drop protected context; test zero space, exact-fit, and over-budget protected context.

---

## File map

### New production-neutral modules

- Create `frontend/features/lattice-next/copilot/retrieval/contracts.ts` — readonly retrieval records, score breakdowns, rejection/result and diagnostics contracts.
- Create `frontend/features/lattice-next/copilot/retrieval/ports/retrieval-index.ts` — metadata-only lexical/semantic search and authorized text-load port.
- Create `frontend/features/lattice-next/copilot/retrieval/ports/retrieval-access-policy.ts` — fail-closed candidate authorization port.
- Create `frontend/features/lattice-next/copilot/retrieval/ports/retrieval-diagnostics-store.ts` — sanitized diagnostics persistence port.
- Create `frontend/features/lattice-next/copilot/retrieval/retrieval-citation.ts` — deterministic versioned chunk/revision citation IDs.
- Create `frontend/features/lattice-next/copilot/retrieval/build-retrieval-query.ts` — explicit document-intent gate and deterministic query normalization.
- Create `frontend/features/lattice-next/copilot/retrieval/rank-and-deduplicate.ts` — normalized score combination and deterministic duplicate selection.
- Create `frontend/features/lattice-next/copilot/retrieval/retrieve-evidence.ts` — orchestration sequencing metadata retrieval, authorization, authorized text load, evidence construction, diagnostics.
- Create `frontend/features/lattice-next/copilot/retrieval/allocate-retrieval-budget.ts` — pure, graph-preserving context budget allocator.
- Modify `frontend/features/lattice-next/copilot/contracts.ts` only if a shared citation kind is required by the fixture response shape; append `"retrieval-document"` without changing existing citation serialization.
- Modify `frontend/features/lattice-next/copilot/answer-validator.ts` and `frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts` only if citation validation/storage types must accept retrieval citations. No retrieval prompt integration is included in this phase.

### New fixture and test modules

- Create `frontend/features/lattice-next/copilot/retrieval/tests/fixtures/retrieval-fixtures.ts` — synthetic documents/chunks, trusted test principals, and eight labeled cases.
- Create `frontend/features/lattice-next/copilot/retrieval/tests/in-memory-retrieval-index.ts` — deterministic local BM25-style lexical scorer, injected semantic scores, metadata-only candidate operations, and separate text loading.
- Create `frontend/features/lattice-next/copilot/retrieval/tests/fixture-access-policy.ts` — test-only fail-closed policy implementation; not production RBAC.
- Create focused tests alongside these modules for contracts/citations, query building, access sequencing, ranking/deduplication, retrieval evidence/diagnostics, and budget allocation.
- Create `frontend/features/lattice-next/copilot/retrieval/tests/evaluation.test.ts` and `evaluation-metrics.ts` — eight retrieval cases and required deterministic metrics.
- Create `frontend/features/lattice-next/copilot/retrieval/tests/frozen-behavior.test.ts` — M1/M2/E1 parity; it must not alter existing frozen fixtures or existing benchmark expectations.
- Create `docs/lattice-intelligence/RAG-PHASE-2-BOUNDARIES.md` — current phase boundaries and production blockers.

### Existing protected files

- `frontend/features/lattice-next/copilot/context-builder.ts`, `execute-copilot-turn.ts`, `plm-brain/universal/ontology-evaluator.ts`, and graph/ontology contracts are read-only for this phase except no integration changes are needed.
- Existing M1, M2, and E1 expected payloads/fixtures are not to be regenerated or edited to make parity tests pass.

---

### Task 1: Define retrieval contracts, ports, and citation IDs

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/contracts.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/ports/retrieval-index.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/ports/retrieval-access-policy.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/ports/retrieval-diagnostics-store.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/retrieval-citation.ts`
- Test: `frontend/features/lattice-next/copilot/retrieval/tests/contracts-and-citation.test.ts`

**Interfaces:**
- `RetrievalIndex.lexicalCandidates(query: RetrievalQuery, limit: number): Promise<readonly RetrievalCandidate[]>`
- `RetrievalIndex.semanticCandidates(query: RetrievalQuery, limit: number): Promise<readonly RetrievalCandidate[]>`
- `RetrievalIndex.loadAuthorizedChunkText(authorizedChunkIds: readonly string[]): Promise<readonly RetrievalChunkText[]>`
- Candidate-search methods return metadata/scores only; `RetrievalChunkText` is a separate text-bearing return shape.
- `RetrievalAccessPolicy.authorizeCandidates(principal: RetrievalPrincipalScope | undefined, candidates: readonly RetrievalCandidateMetadata[]): Promise<RetrievalAuthorizationResult>`
- `RetrievalDiagnosticsStore.persist(diagnostics: RetrievalDiagnostics): Promise<void>`
- `retrievalCitationId(documentId: string, revision: string, chunkId: string): string`
- Contracts use readonly fields; persisted/exchanged result and diagnostics records carry explicit schema versions.

- [ ] **Step 1: Write failing contract/citation tests** for the exact ID shape `cite:retrieval-document:v1:<encoded-documentId>:<encoded-revision>:<encoded-chunkId>`, component-wise encoding, deterministic output, revision/chunk sensitivity, collisions avoided with existing citation IDs, and blank/missing component rejection.
- [ ] **Step 2: Run the focused contract/citation test** and verify expected failures before implementation.
- [ ] **Step 3: Define requested readonly contracts** for `RetrievalIntent`, `SourceReference`, `RetrievalAccessScope`, `RetrievalPrincipalScope`, `RetrievalDocument`, `RetrievalChunk`, `RetrievalQuery`, `RetrievalScoreBreakdown`, `RetrievalCandidate`, `RetrievalEvidence`, `RetrievalRejection`, `RetrievalDiagnostics`, and `RetrievalSearchResult`. Keep indexed ACL metadata distinct from principal scope; permit absent candidate ACL metadata so the policy can deny it.
- [ ] **Step 4: Define the three narrow ports** with metadata-only candidate retrieval and a separate authorized-text load call; diagnostics persistence must accept sanitized records without excerpts.
- [ ] **Step 5: Implement `retrievalCitationId`**; encode each component independently with `encodeURIComponent`, reject blank components, and preserve the namespace/version exactly.
- [ ] **Step 6: Run the focused contract/citation test** and verify all assertions pass.
- [ ] **Step 7: Extend shared citation types only if required** for typed retrieval evidence; prove existing citation objects serialize byte-for-byte unchanged.

### Task 2: Build explicit retrieval-query construction and fail-closed policy tests

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/build-retrieval-query.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/tests/fixture-access-policy.ts`
- Test: `frontend/features/lattice-next/copilot/retrieval/tests/query-and-access-policy.test.ts`

**Interfaces:**
- `buildRetrievalQuery(input: RetrievalQueryInput): RetrievalQuery | undefined`
- Input contains the original question, explicit `intent: "document"`, investigation ID, canonical subject IDs, selected entity IDs, known relationship endpoint IDs, relevant source application filters, document type filters, and server-derived principal scope.
- `fixtureAccessPolicy.authorizeCandidates(principal, candidates)` implements the `RetrievalAccessPolicy` port only for tests.

- [ ] **Step 1: Write failing query tests** proving only explicit `"document"` intent creates a query, requested top-k defaults to 10 and is bounded, normalized text is deterministic, and subject/entity/endpoint IDs are ranking metadata only.
- [ ] **Step 2: Write failing access-policy tests** for allowed, unauthorized, tenant mismatch, missing principal, missing ACL, stale/missing policy version, and missing tenant. Assert all invalid/missing identity or ACL state is denied with stable reason codes.
- [ ] **Step 3: Run the focused query/access tests** and verify the missing implementation failures.
- [ ] **Step 4: Implement query construction** in the new module. Do not accept client request payload fields as a principal; pass only the explicitly supplied server-owned scope. Return `undefined` for non-document intent.
- [ ] **Step 5: Implement the fixture-only policy** to compare tenant, policy version, classification, principal and group membership using test-controlled inputs; fail closed on missing values.
- [ ] **Step 6: Run focused query/access tests** and verify all required cases pass.

### Task 3: Implement fixture-backed hybrid retrieval, authorization ordering, ranking, and evidence

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/rank-and-deduplicate.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/retrieve-evidence.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/tests/fixtures/retrieval-fixtures.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/tests/in-memory-retrieval-index.ts`
- Test: `frontend/features/lattice-next/copilot/retrieval/tests/retrieve-evidence.test.ts`

**Interfaces:**
- `rankAndDeduplicate(query, lexicalCandidates, semanticCandidates): { candidates: readonly RetrievalCandidate[]; duplicateChunkIds: readonly string[] }`
- `retrieveEvidence(input): Promise<RetrievalSearchResult>` consumes the `RetrievalIndex`, `RetrievalAccessPolicy`, `RetrievalDiagnosticsStore`, query, investigation/revision/request IDs, and optional clock.
- Ranking formula: `0.30 semantic + 0.30 lexical + 0.15 subject + 0.15 entity + 0.08 sourceApplication + 0.02 recency`; each component is normalized to `[0,1]`.
- Fixture index candidate methods return no chunk text. `loadAuthorizedChunkText` receives only allowed IDs.

- [ ] **Step 1: Write failing retrieval tests** for the score formula, candidate merge, deterministic tie-breaking, tenant/ACL/lifecycle/revision/source/document-type hard filtering, content-hash duplicate removal within revision, overlapping same-document/revision/section deduplication, and highest-score retention.
- [ ] **Step 2: Write access-order tests** with an unauthorized best lexical match; spy on text loading and assert it is never called for denied IDs. Assert denied text is absent from `RetrievalEvidence` and JSON-serialized diagnostics.
- [ ] **Step 3: Write evidence/citation tests** proving each evidence record is built only from an allowed, loaded chunk and its citation resolves to the exact document, revision, and chunk.
- [ ] **Step 4: Run focused retrieval tests** and confirm they fail before implementation.
- [ ] **Step 5: Implement the test-only in-memory index** with deterministic BM25-style lexical scoring and injected `SemanticScorer`; do not add production adapters or dependencies.
- [ ] **Step 6: Implement ranking and deduplication** with the exact formula, normalized components, deterministic order, and duplicate ID recording.
- [ ] **Step 7: Implement `retrieveEvidence` in strict sequence:** lexical/semantic metadata search → merge/rank → authorize metadata → remove denied candidates → deduplicate eligible results → load authorized chunk text by allowed IDs only → build evidence → sanitize/persist diagnostics. Any authorization error fails closed and skips text loading.
- [ ] **Step 8: Run focused retrieval tests** and verify denied IDs were never passed to the text loader.

### Task 4: Add pure retrieval context-budget allocation

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/allocate-retrieval-budget.ts`
- Test: `frontend/features/lattice-next/copilot/retrieval/tests/allocate-retrieval-budget.test.ts`

**Interfaces:**
- `allocateRetrievalBudget(input: { protectedCharacters: number; primer?: string; evidence: readonly RetrievalEvidence[]; hardLimit?: number; reserveCharacters?: number; primerMaximum?: number; retrievalMaximum?: number }): RetrievalBudgetResult`
- Defaults: hard limit 24,000 characters, minimum reserve 1,500, primer maximum 1,000, retrieval maximum 6,000.
- Output contains retained primer/evidence, characters consumed, remaining reserve, and omission reason codes. Protected character count is never modified.

- [ ] **Step 1: Write failing allocation tests** for graph-first retention, reserve, each cap, ranked evidence order, dropping lowest rank first, removing primer before protected content, explicit omission reasons, exact-fit, zero-space, and protected-over-limit behavior.
- [ ] **Step 2: Run the focused allocator test** and verify expected pre-implementation failures.
- [ ] **Step 3: Implement the pure allocator** without importing or modifying `context-builder.ts`; if protected context exceeds the existing hard limit, return the existing budget-failure signal rather than trimming protected context.
- [ ] **Step 4: Run allocator tests** and verify all boundary and omission assertions pass.

### Task 5: Add eight-case retrieval evaluation and metrics

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/tests/evaluation-metrics.ts`
- Modify: `frontend/features/lattice-next/copilot/retrieval/tests/fixtures/retrieval-fixtures.ts`
- Create: `frontend/features/lattice-next/copilot/retrieval/tests/evaluation.test.ts`

**Interfaces:**
- `scoreRetrievalEvaluation(input): RetrievalEvaluationMetrics` computes Recall@5, Recall@10, MRR, citation precision/completeness, subject relevance, application relevance, access-filter correctness, unauthorized-text leakage count, unsupported-claim rate, context-budget compliance, and latency.
- Cases are deterministic, fixture-only, and labeled with relevant/forbidden chunk IDs and required citations.

- [ ] **Step 1: Define exactly eight cases**: graph-only; document-only; graph-plus-document; irrelevant same-application documents; same-subject non-authoritative; unauthorized best lexical match; retrieved-text conflict with graph authority; insufficient authorized evidence.
- [ ] **Step 2: Write failing metric tests** for Recall@5/10, reciprocal rank, citation precision/completeness, relevance, access correctness, leakage count, unsupported claims, budget compliance, and latency.
- [ ] **Step 3: Run evaluation tests** and verify missing metric implementation failures.
- [ ] **Step 4: Implement deterministic metric calculations** with zero leakage as a hard assertion and no answer-generation/model dependency.
- [ ] **Step 5: Run all eight fixture cases** and report per-case metrics and the aggregate summary.
- [ ] **Step 6: Add authority-boundary assertions** that retrieved claims retain their own provenance and cannot mutate graph relationship/impact structures or override conflicting graph facts.

### Task 6: Prove frozen M1/M2/E1 isolation

**Files:**
- Create: `frontend/features/lattice-next/copilot/retrieval/tests/frozen-behavior.test.ts`
- Read-only references: existing fixture builders and `context-builder.ts`, `answer-validator.ts`, `execute-copilot-turn.ts`.

**Interfaces:**
- The retrieval modules remain uncalled by existing `buildInvestigationContext`, `engineeringPromptPayload`, and `executeCopilotTurn` paths in this phase.
- Tests use existing M1/M2 fixture builders and the E1 case from `copilot/evals/cases.ts`; do not update those sources.

- [ ] **Step 1: Capture baseline M1/M2/E1 behavior** from the unchanged fixture builders: intent, serialized packet shape, provider payload shape, citations; for M2 include the full `consequenceEvidenceState`.
- [ ] **Step 2: Write parity tests** asserting retrieval invocation count is zero for M1 four-application, M2 operational-consequence, and E1 entity-participation questions.
- [ ] **Step 3: Assert parity** for classified intent, packet shape, provider payload shape, allowed citations, and M2 consequence state; do not normalize away shape differences.
- [ ] **Step 4: Run the frozen-behavior tests** and investigate any difference without changing baseline fixtures or frozen implementation.

### Task 7: Document Phase 2 boundaries and blockers

**Files:**
- Create: `docs/lattice-intelligence/RAG-PHASE-2-BOUNDARIES.md`

- [ ] **Step 1: Document graph authority versus retrieval evidence**, including the prohibition on materializing graph facts from document similarity/shared subject.
- [ ] **Step 2: Document frozen intents and citation namespace**, stating M1/M2/E1 remain retrieval-disabled and showing the exact versioned chunk/revision citation format.
- [ ] **Step 3: Document test-only fail-closed access boundary**, explicitly stating no production identity/RBAC source or production vector infrastructure was introduced.
- [ ] **Step 4: List real-ingestion prerequisites:** authenticate user and authorize investigation; establish tenant/principal/group entitlements and source ACL/revocation semantics; determine deployment/data-residency/retention; approve source document rights; establish parser/revision/lifecycle behavior; then select infrastructure/providers.

### Task 8: Run only the authorized verification set

**Files:**
- Verify all new retrieval test files and the explicitly requested frozen regression tests.

- [ ] **Step 1: Run only the retrieval unit/evaluation tests** under `frontend/features/lattice-next/copilot/retrieval/tests`.
- [ ] **Step 2: Run `subject-traceability.test.ts`, `current-investigation-traceability.test.ts`, `budget-preservation.test.ts`, and `answer-validator.test.ts`.**
- [ ] **Step 3: Run only the named focused M2 `executeCopilotTurn` validation test.**
- [ ] **Step 4: Run ESLint only for changed TypeScript files.**
- [ ] **Step 5: Run `git diff --check`.**
- [ ] **Step 6: Confirm no provider request, real document ingestion, external dependency, production identity adapter, or production vector/embedding infrastructure was used.**

## Self-review against the approved scope

- Contracts/ports/citation: Task 1.
- Query construction and fail-closed authorization tests: Task 2.
- Fixture hybrid retrieval, score formula, hard filters, deduplication, evidence, and sanitized diagnostics: Task 3.
- Pure budget allocation: Task 4.
- Eight retrieval cases and all requested metrics: Task 5.
- M1/M2/E1 parity: Task 6.
- Boundary documentation and production blockers: Task 7.
- Exact permitted validation scope and no-provider/no-ingestion confirmation: Task 8.
- Frozen graph/context/provider/validator files remain unchanged unless an additive retrieval citation type is strictly needed; no production prompt integration is included.

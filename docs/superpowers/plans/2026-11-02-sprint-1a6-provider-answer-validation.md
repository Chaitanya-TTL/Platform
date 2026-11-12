# Sprint 1A.6 Provider-Backed Answer Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate that preserved golden-fixture intelligence produces correct provider-backed M1 and M2 answers and report whether Sprint 1A is complete.

**Architecture:** Add an explicitly opt-in integration test that runs the existing `executeCopilotTurn` path against the isolated golden fixture, mocks only snapshot loading and conversation persistence, and uses the configured Azure provider. Capture raw provider content separately from the returned validated answer; do not modify production behavior or prompt/context code.

**Tech Stack:** TypeScript, Vitest 3, existing Azure OpenAI client, existing answer validator, Sprint 1A.5 golden fixture.

**Spec:** Sprint 1A.6 Provider-Backed Answer Validation supplied in the user request.

## Global Constraints

- “Do not change implementation behavior first.”
- “No architecture changes.”
- “No RAG work.”
- “No LangGraph.”
- “No LangChain.”
- “No MCP.”
- “No new relationship logic.”
- “No new ontology work.”
- “No context-builder refactoring.”
- “Only end-to-end answer validation.”
- “Do not tweak prompts to force success.”
- “Do not add benchmark-specific logic.”
- Use only synthetic golden-fixture data for exactly two live calls: M1 and M2.
- Require an explicit per-command opt-in in addition to the existing `AZURE_OPENAI_LIVE_CALLS_ENABLED=true` gate, so routine test runs cannot make provider calls.

## Review Focus

- Provider live calls disabled or incomplete configuration: live test must skip only when the explicit run opt-in is absent; when opted in, missing provider configuration must fail with a safe diagnostic and never reveal credentials.
- Provider network/HTTP/timeout failure: capture the failure code and whether billing may have occurred; do not retry outside the existing client policy.
- Malformed or schema-invalid raw answer: record raw output and validation boundary; do not edit the prompt or fabricate a passing final answer.
- M1 omits an application or relationship: compare raw and validated answers against fixture graph IDs and report omissions as failures, not successful coverage repair.
- M2 asserts causation or an unsupported consequence: fail the claim against the fixture evidence and report the exact unsupported statement.

---

### Task 1: Add explicit opt-in provider integration validation

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/provider-backed-answer-validation.test.ts`
- Consume fixture: `OrchestrationPlatform/frontend/features/lattice-next/tests/sprint-1a5-fixture-support.ts`
- Consume provider flow: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`

**Interfaces:**
- Call `executeCopilotTurn(command: CopilotTurnCommand): Promise<CopilotTurnOutcome>` with the real provider client and real context/answer-validation code.
- Mock `serverKernel.load` to return `buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation())`.
- Mock only `FileCopilotConversationStore`; do not mock the Azure client, context builder, answer validator, or prompt policy.
- Capture raw provider `choices[0].message.content` by wrapping `fetch` and returning the original `Response` unchanged.
- Gate live tests on both `RUN_LIVE_PROVIDER_VALIDATION=true` and `AZURE_OPENAI_LIVE_CALLS_ENABLED=true`.

- [ ] **Step 1: Add an opt-in M1 live test**

  Assert provider success, no clarification, and expected application/relationship coverage from the raw provider answer and final validated answer. Capture prompt, raw answer, final answer, usage metadata, and whether answer text changed during validation/coverage.

- [ ] **Step 2: Add an opt-in M2 live test**

  Assert provider success; reference to the operational representation and supported impact/evidence; uncertainty remains explicit; no causation or unsupported relationship claims. Capture the impact path/chain, prompt, raw answer, final answer, and answer-text modification indicator.

- [ ] **Step 3: Run without the per-command opt-in**

  Run the specific test file normally and verify it skips without network requests.

- [ ] **Step 4: Run exactly the two approved live cases**

  Load the existing local `.env` without printing its contents and set `RUN_LIVE_PROVIDER_VALIDATION=true` only for this test process. Run only the new M1/M2 test file. Preserve the client’s existing retry and usage-ledger policies.

### Task 2: Record provider-backed evidence and benchmark status

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/m1-answer-validation.md`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/m2-answer-validation.md`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/provider-answer-trace.md`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/sprint-1a6-findings.md`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md`

- [ ] **Step 1: Capture M1 actual output**

  Record exact question, graph projection counts/IDs, reasoning package counts/IDs, engineering brief counts, prompt relationships/evidence, raw provider answer, final validated answer, required-term checks, hallucination check, pass/fail, and observations.

- [ ] **Step 2: Capture M2 actual output**

  Record exact question, selected impact path/chain IDs and evidence, reasoning package/brief/prompt counts, raw provider answer, final validated answer, support/uncertainty/causation checks, pass/fail, and observations.

- [ ] **Step 3: Trace provider consumption**

  Create the mapping-to-final-answer trace with count, IDs, and evidence at each available stage. Explicitly distinguish raw provider text from any output changed by parsing, validation, repair, or coverage.

- [ ] **Step 4: Re-evaluate the release-gate cases**

  Update E1, M1, M2, T1, and T8 from the new fixture/provider evidence plus previously recorded live evidence. Do not spend extra provider calls on E1/T1/T8. Use only `PASS`, `FAIL`, `BENCHMARK-DATA-MISMATCH`, or `NOT APPLICABLE`.

- [ ] **Step 5: Decide Sprint 1A/Sprint 2 status**

  Mark Sprint 1A complete and Sprint 2 unblocked only if the M1/M2 provider answers meet every stated exit criterion and the release-gate evidence supports that status. Otherwise record the exact failing stage and keep Sprint 2 blocked.

### Task 3: Verify validation artifacts

**Files:**
- Tests: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/provider-backed-answer-validation.test.ts`

- [ ] **Step 1: Run offline safety/regression checks**

  Run the new test without the live opt-in and the focused existing answer-validator, context-builder, golden-fixture, and provider-client tests. Confirm no unintended network call occurs.

- [ ] **Step 2: Review captured outputs and final diff**

  Confirm reports distinguish fixture prompt validation from provider-backed answer validation, contain no credentials, and do not claim success if raw/final answers miss requirements.

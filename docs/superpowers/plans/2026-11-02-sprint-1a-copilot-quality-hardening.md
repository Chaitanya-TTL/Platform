# Sprint 1A Copilot Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Copilot pass E1, M1, M2, T1, and T8 through localized provider, scope, ranking, and rendering fixes.

**Architecture:** Keep the existing `executeCopilotTurn`, `context-builder`, CopilotKit surface, answer validator, and benchmark catalog interfaces. Add no new orchestration layers or shared turn-result contracts. Each fix is implemented at its current seam with a focused regression test, followed by offline tests and dual manual live validation.

**Tech Stack:** TypeScript, React, Vitest, CopilotKit React v2, existing Azure OpenAI client, existing seeded Lattice fixtures.

**Spec:** `docs/superpowers/specs/2026-11-02-sprint-1a-copilot-quality-hardening-design.md`

## Global Constraints

- Keep fixes localized to provider JSON parsing/recovery, scope classification, explicit identifier precedence, and the single-owner streamed rendering path.
- Keep parse/validation diagnostics internal and preserve the existing user-facing fallback shape.
- Exact native IDs, exact entity IDs, and uniquely resolving governed-property values are the only scope-forcing identifiers.
- Require clarification when a highest-precedence identifier/property match is not unique.
- The streamed answer is authoritative; completion must not replay or append already-rendered text.
- Do not add shared turn-result contracts, architecture layers, context-builder decomposition, LangGraph, LangChain, MCP, or observability work.
- Run live validation against both the current investigation state and the fixed seeded benchmark fixture.
- Do not claim Sprint 1A success until all five live benchmarks pass in both validation modes.

## Review Focus

- Provider content wrapped in code fences or surrounding prose must recover only when exactly one valid JSON object can be extracted; ambiguous or invalid content must keep the existing safe fallback.
- Investigation-wide evidence and relationship questions must not be redirected into entity clarification merely because lexical candidates exist.
- A unique governed-property match may select an entity, but a duplicate governed-property match must clarify rather than choose by secondary score.
- A completion event after a full stream must not create a second visible assistant answer; a partial stream may receive only the missing completion delta.
- Current-state and seeded-fixture live results must be recorded separately, including differing outcomes and failure categories.

---

### Task 1: Harden provider response parsing and diagnostics

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/azure-openai-client.ts` only if provider failure classification requires the existing error code
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/azure-openai-client.test.ts` if transport classification changes

**Interfaces:**
- Consumes: `completeCopilotTurn(request): Promise<AzureChatResponse>`, `validateCopilotAnswer(value, context)`, existing `CopilotTurnFailure`.
- Produces: Existing validated `CopilotAnswer` success and existing safe user-facing failure shape, with internal diagnostics distinguishing provider failure, malformed JSON, validation failure, and answer-repair failure.

- [ ] **Step 1: Add failing parser/recovery tests**

Test that:

- strict JSON still parses;
- one JSON object inside a markdown code fence is recovered;
- one JSON object surrounded by explanatory text is recovered;
- malformed JSON remains a safe failure;
- two JSON objects remain a safe failure;
- answer-validation failure is distinguished internally from malformed JSON;
- the user-facing failure does not expose raw provider content, stack traces, schema details, or parse internals.

- [ ] **Step 2: Run the focused executor tests**

Run: `npm test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

Expected: New recovery tests fail while existing tests identify the current hard-failure path.

- [ ] **Step 3: Implement bounded JSON extraction**

Replace the current direct `JSON.parse`-only path with a local helper in `execute-copilot-turn.ts` that:

1. tries strict JSON;
2. removes one outer markdown fence when present;
3. extracts one balanced outer JSON object;
4. rejects multiple candidates, unbalanced braces, non-object payloads, and invalid JSON;
5. passes the result into the existing `ensureEngineeringAnswerCoverage` and `validateCopilotAnswer` flow.

Keep all diagnostics internal and preserve the existing safe failure response.

- [ ] **Step 4: Add internal failure classification at the existing boundary**

Classify failures as `provider-failure`, `malformed-json`, `validation-failure`, or `answer-repair-failure` for server diagnostics/usage logging without changing the public response contract or adding a new shared result abstraction.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/tests/azure-openai-client.test.ts`

Expected: PASS for strict parsing, bounded recovery, validation separation, and safe user-facing fallback.

### Task 2: Centralize investigation/entity scope decisions

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/copilot-relationship-flow.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

**Interfaces:**
- Consumes: Existing `classifyQuestion`, `isInvestigationScopedQuestion`, candidate generation, and context packet construction.
- Produces: One localized scope decision used consistently by clarification, selected entities, focal retrieval, path retrieval, and evidence retrieval.

- [ ] **Step 1: Add failing scope regression tests**

Assert that these remain investigation-scoped with `clarificationRequired === false` and no focal entity:

- `Which applications are involved in this investigation and how are they connected?`
- `Summarize the requirement evidence.`
- `What are the primary entities present in this investigation?`

Assert that entity-specific questions remain entity-scoped:

- `What impacts SR-001?`
- `What depends on MAT7893?`
- `What changed for OR:wt.part.WTPart:1715068?`

- [ ] **Step 2: Run the focused context/evaluation tests**

Run: `npm test -- features/lattice-next/tests/copilot-relationship-flow.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: Evidence-oriented live behavior is not yet represented by the current context contract, so the new T1 scope assertion fails before implementation.

- [ ] **Step 3: Implement one localized scope decision**

Update the existing scope helper/call site so investigation scope is selected when the intent is summary, relationship, evidence, findings, application overview, cross-system overview, or explicit investigation overview, unless an exact native ID, exact entity ID, or unique governed-property value is present. Do not use display names, aliases, fuzzy labels, or lexical candidates to force entity scope.

- [ ] **Step 4: Route all clarification and focal retrieval checks through that decision**

Ensure `clarificationRequired`, `selectedEntityIds`, focal entity selection, path pools, and impact pools consume the same scope result. Preserve entity-specific clarification for explicit identifiers and non-unique exact/governed matches.

- [ ] **Step 5: Run focused scope tests**

Run: `npm test -- features/lattice-next/tests/copilot-relationship-flow.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: M1 and T1 context contracts pass without clarification, while explicit entity questions remain entity-scoped.

### Task 3: Enforce explicit identifier precedence and tie clarification

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

**Interfaces:**
- Consumes: Existing entity candidate generation, `businessWeight`, ranking helpers, and ambiguity packet fields.
- Produces: Deterministic scope/ranking behavior where exact native ID > exact entity ID > unique governed property > lexical evidence, with explicit clarification for non-unique highest-precedence matches.

- [ ] **Step 1: Add failing ranking tests**

Test that:

- T8-like exact native IDs select the requested change notice and SAP material rather than metadata candidates;
- exact entity ID outranks governed-property and lexical candidates;
- one governed-property match selects its entity;
- two governed-property matches produce clarification;
- generic display-name/alias/lexical matches do not force entity scope for investigation-wide questions.

- [ ] **Step 2: Run focused ranking tests**

Run: `npm test -- features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: The duplicate governed-property and explicit-ID precedence cases fail before the change.

- [ ] **Step 3: Implement precedence before business scoring**

Add a localized precedence decision before the existing business-weighted ranking. Exact native ID and exact entity ID matches must be resolved first; unique governed-property matches follow; lexical matches remain lower-confidence evidence only. If the highest-precedence set contains more than one entity, set the existing clarification state and use the explicit multiple-match clarification text.

- [ ] **Step 4: Preserve metadata candidates without allowing metadata selection**

Keep metadata candidates available for diagnostics/context where appropriate, but prevent them from becoming the selected focal entity when an exact/native/entity/property match exists.

- [ ] **Step 5: Run focused ranking tests**

Run: `npm test -- features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

Expected: T8 selects the requested entities or provides explicit multiple-match clarification, and investigation-wide questions remain free of lexical clarification.

### Task 4: Make streamed assistant content single-owner

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotAnswerContent.tsx` only if the existing typewriter lifecycle is the duplicate owner
- Test: `OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx` if panel state reconciliation is involved

**Interfaces:**
- Consumes: Existing CopilotKit message stream, `LatticeAssistantMessage`, `CopilotAnswerContent`, `typewriterMessageId`, and message filtering.
- Produces: One visible assistant answer per assistant message; stream content is authoritative, completion finalizes metadata/status, and only missing completion delta may be rendered after an incomplete stream.

- [ ] **Step 1: Add failing duplicate-render tests**

Test that:

- a streamed assistant message followed by completion renders the answer once;
- completion does not append the same answer a second time;
- a typewriter does not restart from the full content after stream completion;
- a partial/invalid stream may receive only missing completion text;
- restored validated answers still render normally.

- [ ] **Step 2: Run focused UI tests**

Run: `npm test -- features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx`

Expected: The duplicate stream/completion scenario fails before implementation.

- [ ] **Step 3: Implement stream-authoritative reconciliation**

Use the existing message ID and stream state to ensure only one rendering path owns answer text. Completion must not create a second assistant message or replay the full answer. Preserve metadata/citation/status finalization and apply only a missing suffix when the streamed content is demonstrably incomplete.

- [ ] **Step 4: Run focused UI tests**

Run: `npm test -- features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx`

Expected: One visible assistant answer remains after streaming and completion, with typewriter behavior intact.

### Task 5: Execute dual live benchmark validation and close Sprint 1A

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md`
- Reference: `OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/cases.ts`
- Reference: `OrchestrationPlatform/frontend/features/lattice-next/copilot/RELEASE-GATES.md`

**Interfaces:**
- Consumes: Fixed seeded benchmark cases E1, M1, M2, T1, T8; current running investigation; approved live provider configuration.
- Produces: A dual-result validation record with current-state and fixture outcomes.

- [ ] **Step 1: Run the offline affected suites**

Run the Task 1-4 focused commands and the existing relationship-flow, Copilot turn, answer-validator, and benchmark evaluation tests.

Expected: All affected offline tests pass before live validation begins.

- [ ] **Step 2: Execute current-state validation**

Against the current running investigation, record investigation ID, snapshot revision, timestamp, exact question, complete actual answer, expected behavior, pass/fail, and observations for E1, M1, M2, T1, and T8.

- [ ] **Step 3: Execute fixed-fixture validation**

Against the seeded benchmark fixture, repeat the same five questions and record a separate result for each. The fixture result is the canonical reproducible baseline; do not overwrite it with current-state results.

- [ ] **Step 4: Verify the Sprint 1A release gate**

Mark Sprint 1A complete only if both validation modes pass all five cases, with no JSON parse failures, no unnecessary clarification, correct explicit-ID selection, and no duplicate visible rendering. Otherwise leave the failing cases and observations explicit.

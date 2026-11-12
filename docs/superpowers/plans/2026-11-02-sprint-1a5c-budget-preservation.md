# Sprint 1A.5C Budget Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve minimum validated reasoning intelligence during context composition without exceeding the configured packet budget.

**Architecture:** Keep the existing context builder and budget loop. Establish available-content minimums for relationship narratives, impact narratives, and impact chains; trim lower-priority content first, retain those minimums through compact fallback, and throw an explicit diagnostic error if the packet still cannot fit.

**Tech Stack:** TypeScript, Vitest 3, existing golden fixture builders.

**Spec:** Sprint 1A.5C requirements supplied in the user request.

## Global Constraints

- When available, preserve at least one relationship narrative, one impact narrative, and one impact chain.
- Do not increase the packet-size limit or bypass budgeting.
- Continue trimming lower-priority content before protected engineering intelligence.
- If protected content cannot fit, fail composition explicitly and identify the protected categories and measured sizes.
- Preserve prompt relationships and evidence; do not modify architecture.

## Review Focus

- No reasoning artifacts exist: protected minimums must remain zero and composition should retain existing behavior.
- Only some artifact categories exist: protect available categories independently; do not require unavailable impact narratives or chains.
- Minimum configured budget cannot fit protected artifacts: composition must throw an explicit diagnostic instead of silently dropping them or returning an oversized packet.
- Many secondary narratives/chains compete with the packet limit: trim extras while retaining one of each available category.
- Golden-fixture M1 and M2 both need preserved package, brief, and prompt content: assert their counts and final serialized packet size.

---

### Task 1: Pin budget-preservation behavior with fixture tests

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/tests/budget-preservation.test.ts`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/tests/engineering-brief-preservation.test.ts`
- Test fixture: `OrchestrationPlatform/frontend/features/lattice-next/tests/sprint-1a5-fixture-support.ts`

**Interfaces:**
- Consume `buildInvestigationContext`, `engineeringPromptPayload`, and the existing Sprint 1A.5 golden-fixture helpers.
- Assert protected reasoning counts, engineering-brief propagation, prompt availability, hard packet limit, and explicit failure diagnostics.

- [ ] **Step 1: Add failing budget-preservation tests**

  Cover M1 and M2 default-budget packets with at least one relationship narrative, impact narrative, and impact chain in the reasoning package; require the serialized packet to fit the configured budget. Add a minimum-budget case that expects an explicit error naming the protected categories, packet size, and configured budget when they cannot fit.

- [ ] **Step 2: Run the focused tests and verify the current implementation fails**

  Run from `OrchestrationPlatform/frontend`: `npm test -- features/lattice-next/tests/budget-preservation.test.ts features/lattice-next/tests/engineering-brief-preservation.test.ts`

- [ ] **Step 3: Add failing engineering-brief and prompt-preservation tests**

  Assert M1 and M2 engineering briefs retain the available relationship narratives, impact narratives, and impact chains, and prompt payloads retain the reasoning plus existing relationship/evidence records.

## Task 2: Protect intelligence in budget composition

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts`
- Tests: the two tests created in Task 1

**Interfaces:**
- Keep the public `buildInvestigationContext(...)` signature and `CopilotContextPacket` shape unchanged.
- Use the existing `counts`, `trimOrder`, `compose`, `canTrim`, and compact-fallback flow.

- [ ] **Step 1: Add independent minimum counts**

  Set each reasoning-category minimum to `1` when its full reasoning-package array is non-empty, otherwise `0`; use these floors when deciding whether that category can be trimmed.

- [ ] **Step 2: Rebalance trimming and compact fallback**

  Trim non-protected content and excess reasoning items before protected minimums. Ensure the compact fallback preserves the protected package and brief slices rather than zeroing them.

- [ ] **Step 3: Fail explicitly if protected content cannot fit**

  After all permitted trimming/compaction, throw an error with a diagnostic message containing serialized packet size, configured budget, and the protected categories retained. Never return an oversized or success-shaped packet with protected categories removed.

- [ ] **Step 4: Run focused regression tests**

  Run the Task 1 tests and the existing context-builder, context-preservation, and golden-fixture tests. Require all successful packets to serialize within their configured limit.

### Task 3: Capture the preservation result

**Files:**
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/budget-preservation-trace.md`
- Create: `OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/sprint-1a5c-findings.md`

- [ ] **Step 1: Record M1 and M2 runtime counts**

  Capture surviving relationship narratives, impact narratives, impact chains, final packet size, configured budget, and omission counts from the fixture tests.

- [ ] **Step 2: Record package-to-brief-to-prompt preservation**

  Record counts before and after brief construction and prompt composition; state whether M1/M2 prompt validations passed and whether a provider-backed answer was actually exercised.

- [ ] **Step 3: Report Sprint 2 readiness conservatively**

  Mark Sprint 2 unblocked only if all required criteria are proven, including provider-backed M1 and M2 answer validation; otherwise identify the remaining validation boundary without claiming success.

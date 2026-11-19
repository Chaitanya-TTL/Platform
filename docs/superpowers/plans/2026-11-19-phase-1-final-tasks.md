# Phase 1 Final Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 1 Tasks 17–19 with a tested single-turn outcome adapter and evidence-based blocked/not-run closure documentation.

**Architecture:** Keep outcome mapping as a pure helper in the existing server-only routing module, returning one assistant-message presentation and supported citations without calling the runtime or changing the chat UI. Record live validation as blocked and the controlled comparison as not run while approved identity, authorization, environment, and data prerequisites are absent.

**Tech Stack:** TypeScript, Vitest, existing Copilot citation contracts, Markdown, .NET 10 evaluation/test/build commands.

**Spec:** `docs/superpowers/specs/2026-11-19-phase-1-final-tasks-design.md`; task requirements and closure decision rules in `docs/superpowers/plans/2026-11-18-lattice-phase-1-closure.md`.

## Global Constraints

- Keep the feature flag disabled by default and do not add a live HTTP call.
- Do not add a UI redesign, new authorization provider, or identity propagation.
- Never fabricate live, semantic-quality, or product-benefit results.
- Preserve unrelated worktree changes and stage only task-owned files.
- Choose `B — CODE COMPLETE, PRODUCT ROLLOUT BLOCKED` only if all safe code and verification tasks pass; otherwise choose `C — FUNCTIONALLY INCOMPLETE`.

## Review Focus

- **Deny/unavailable outcomes must not fall through to legacy answers:** test explicit status mapping and assert the adapter emits exactly one assistant message.
- **Unrecognized or missing citation IDs must not become inspectable links:** test citation filtering against the existing `CopilotCitation` contract.
- **Clarification and abstention must remain visibly non-answer outcomes:** test both statuses, one assistant message, and non-empty user-facing content.
- **Missing live prerequisites must not be presented as executed validation:** document `BLOCKED`, each known prerequisite, and no fabricated request/trace.
- **Offline fixture results must not be reported as semantic or product-quality evidence:** keep comparison `NOT RUN` and state semantic/live quality and product benefit are not measured.

---

### Task 17: Map runtime outcomes to one Copilot message

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`

**Interfaces:**
- Consumes: Copilot `CopilotCitation` from `contracts.ts`; runtime dispositions `Answer`, `Clarify`, `Abstain`, `Deny`, and `Failed`.
- Produces: `mapEngineeringImpactRuntimeOutcome(outcome): EngineeringImpactCopilotPresentation`, where the presentation has one `{ role: "assistant", content: string }` message, an explicit `answer | clarification | abstention | denied | unavailable` status, and only supported `CopilotCitation[]`.

- [ ] **Step 1: Add failing mapping tests**

Add tests named `maps_answer_to_one_assistant_message_with_supported_citations`, `maps_clarification_and_abstention_to_visible_non_answers`, `maps_denial_and_failure_without_legacy_fallback`, and `omits_uninspectable_source_references`. Assert one assistant message for every outcome; `Deny` maps to `denied`, `Failed` maps to `unavailable`, neither includes legacy answer text, and unknown citation IDs are not passed through.

- [ ] **Step 2: Run the focused test**

Run from `OrchestrationPlatform/frontend`: `npm test -- features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`

Expected: new mapping tests fail before implementation while existing Task 16 routing tests continue to pass.

- [ ] **Step 3: Implement the pure adapter**

Implement `mapEngineeringImpactRuntimeOutcome` in the routing module. Use summary/impact explanations for `Answer`, issue text for clarification/abstention, and stable non-sensitive messages for denial/unavailability. Do not invoke the runtime, read legacy output, or create more than one assistant message.

- [ ] **Step 4: Run focused routing and rendering tests**

Run from `OrchestrationPlatform/frontend`: `npm test -- features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`

Expected: all adapter and existing citation-rendering tests pass.

- [ ] **Step 5: Commit Task 17**

```text
git add OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts
git commit -m "feat: map impact runtime outcomes for Copilot"
```

### Task 18: Record live validation gate status

**Files:**
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-live-validation.md`

**Interfaces:**
- Consumes: current provider/readiness state from `authorization-provider-rollout-gate.md`, product route state from Task 16, and the prerequisite list in the closure plan.
- Produces: a sanitized live-validation record with status `BLOCKED`, explicit missing prerequisites/owners, seven planned cases listed as `NOT RUN`, and no credentials or fabricated run identifiers.

- [ ] **Step 1: Record the current documented blockers**

State that the API uses `UnavailableResourceAuthorizationDecisionProvider` and readiness is documented as `503`; identity propagation is unavailable on the Copilot product route; and no approved seeded investigation, deployment, network, or data approval was supplied for this work.

- [ ] **Step 2: List the seven live cases and evidence required**

Use these seven cases from the closure design: `What is impacted if Requirement R-123 changes?`; `If R-123 changes, what could be affected?`; `Show the downstream impact of R-123.`; impact intent with no explicit subject; absent subject `R-999`; denied authorization; and no evidence. Mark each `NOT RUN`; specify that request/trace IDs, authorization decisions, PLM evidence, model output, latency, and token counts are unavailable because no approved run occurred.

- [ ] **Step 3: Review the record for unsupported claims**

Confirm the document says `BLOCKED`, does not contain secrets or live traces, and does not imply the runtime was called.

- [ ] **Step 4: Commit Task 18**

```text
git add OrchestrationPlatform/docs/ai-runtime/phase-1-live-validation.md
git commit -m "docs: record Phase 1 live validation blockers"
```

### Task 19: Produce comparison and closure evidence

**Files:**
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-impact-comparison.md`
- Create: `OrchestrationPlatform/docs/ai-runtime/phase-1-closure-report.md`

**Interfaces:**
- Consumes: the deterministic evaluation report, Task 18 live status, checked-in rollout/setup documentation, and verified commit/test output.
- Produces: comparison status `NOT RUN` with prerequisites and no claimed improvement; closure report with the required 19 sections in the closure-plan order and decision `B` only if all safe code/verification work passes, otherwise `C`.

- [ ] **Step 1: Write the comparison record**

Mark existing-versus-new live comparison `NOT RUN`. Include the requested comparison dimensions—subject selection, relationship/path/chain coverage, citation integrity, unsupported references, clarification/abstention, malformed responses, validated-answer rate, latency, tokens, and human review—and mark live-only values unavailable. State product benefit is not measured.

- [ ] **Step 2: Write the 19-section closure report**

Use these sections, in order: repository and commit baseline; review findings addressed; code changes made; simplifications made; authorization provider status; question-detection coverage; scope-policy coverage; mechanical validation coverage; semantic validation limitation; token-budget behavior; telemetry privacy decision; offline evaluation results; product integration status; live vertical-slice results; existing-versus-new runtime comparison; known limitations; remaining external blockers; final Phase 1 decision; evidence-based recommendation on starting the next planned sprint. Include exact verified commands/results and distinguish deterministic fixture integrity from semantic and live quality.

- [ ] **Step 3: Run final verification**

Run from `OrchestrationPlatform`:

```powershell
dotnet test .\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj
dotnet run --project .\Lattice.AI.Runtime.Evaluation\Lattice.AI.Runtime.Evaluation.csproj -- --dataset .\evals\engineering-impact\v1
dotnet build .\Orchestration.API\Orchestration.API.csproj
```

Run from `OrchestrationPlatform/frontend`:

```powershell
npm test -- features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/workspace/tests/copilot-answer-content.test.tsx features/lattice-next/tests/impact-evidence-service.test.ts features/lattice-next/tests/impact-evidence-authorization.test.ts
```

Then run `git diff --check` and inspect `git status --short`. Report any known `Orchestration.API.Tests` compile baseline separately; do not stage generated build output or unrelated changes.

- [ ] **Step 4: Verify the closure report**

Check that all 19 headings are present in order, all results match command output, the live run and comparison remain `NOT RUN`, and the final decision is B only if all required safe checks passed.

- [ ] **Step 5: Commit Task 19**

```text
git add OrchestrationPlatform/docs/ai-runtime/phase-1-impact-comparison.md OrchestrationPlatform/docs/ai-runtime/phase-1-closure-report.md
git commit -m "docs: report Phase 1 closure evidence"
```

## Conditional External Exit

Tasks 18–19 may finish with `BLOCKED` / `NOT RUN` evidence because the user confirmed no approved live environment is available. Do not call live model or PLM services. Never select A or D without the required live evidence and controlled comparison.

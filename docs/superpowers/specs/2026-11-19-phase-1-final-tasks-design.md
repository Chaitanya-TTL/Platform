# Phase 1 Final Tasks Design

## Intent

Complete Tasks 17–19 of the Phase 1 closure plan without claiming live runtime, semantic-quality, or product-benefit results that have not been measured.

## Goals and non-goals

- Add a pure, typed adapter for answer, clarification, abstention, denial, and unavailable outcomes; preserve a single assistant response and reuse only existing inspectable citations.
- Add focused tests for outcome mapping and no-fallback behavior.
- Record Task 18 as `BLOCKED` and Task 19's comparison as `NOT RUN` when approved live prerequisites are unavailable; produce the closure report with evidence-based status.
- Do not add a live HTTP call, UI redesign, new authorization provider, or fabricated evaluation evidence.

## Constraints

- Reuse the current Copilot citation/UI contracts.
- The routing flag remains disabled by default; identity propagation and the authorization provider are not available.
- Keep pre-existing worktree changes untouched and commit only task-owned files.

## Approaches

1. **Pure typed adapter (selected):** map the runtime result into the existing single-response/citation model without invoking the runtime. This is small, testable, and does not imply live readiness.
2. **Wire a new runtime outcome path into the Copilot turn and UI now:** rejected because the authenticated identity and authorization integration are unavailable, and the closure plan explicitly excludes a live call.

## Implementation calls

- Treat answer, clarification, and abstention as visible single-turn content; preserve only recognized existing citation references.
- Keep denial and unavailable explicit and prevent either from falling back to legacy model output.
- Document external prerequisites and current blockers; run only local validations and checked-in offline evaluation.
- Select `B — CODE COMPLETE, PRODUCT ROLLOUT BLOCKED` only if all safe code and verification tasks pass; otherwise select `C — FUNCTIONALLY INCOMPLETE`.

# Sprint 1A Copilot Quality Hardening

## Intent

Make the existing Lattice Copilot pass the five live benchmark cases that failed during Sprint 1 validation. This is a stabilization sprint: it improves reliability at the current boundaries without introducing new orchestration architecture.

## Goals

- Recover usable structured answers when the provider response contains harmless JSON wrappers or formatting noise, while surfacing unrecoverable parse failures.
- Ensure investigation-wide summary, relationship, and evidence questions never request focal-entity clarification.
- Ensure explicit identifiers dominate governed-property and lexical candidates, and metadata cannot win an explicit-ID query.
- Ensure a streamed assistant answer has one rendering owner and is not appended or typed twice.
- Re-run E1, M1, M2, T1, and T8 manually and record the actual results.

## Non-goals

- No context-builder decomposition.
- No new orchestration layers or shared turn-result contract.
- No LangGraph, LangChain, MCP, observability platform, or evaluation framework.
- No ontology redesign or broad ranking-policy rewrite.
- No changes to the benchmark catalog beyond regression coverage needed for these defects.

## Constraints

- Preserve the current request, answer, citation, conversation-store, and UI interfaces unless a localized test-proven correction requires otherwise.
- Keep provider recovery bounded: extract a single JSON object, reject ambiguous/malformed payloads, and return the existing validated fallback rather than silently inventing answer content.
- Use the existing investigation-scope helper as the single classification authority for clarification decisions.
- Keep exact native/entity/property identifier matches ahead of lexical and metadata candidates.
- Keep the UI’s existing streaming behavior; remove only duplicate ownership or replay.
- Live benchmark results must be recorded from actual Copilot responses; offline tests cannot be reported as live passes.
- Keep parse and validation diagnostics internal; preserve the existing user-facing fallback shape.
- Treat exact native IDs, exact entity IDs, and uniquely resolving governed-property values as the only scope-forcing identifiers.
- Require clarification when a highest-precedence identifier/property match is not unique.
- Use the streamed answer as the authoritative visible content; completion finalizes metadata and status without replaying text.
- Run live validation against both the current investigation state and the fixed seeded benchmark fixture.

## Approaches

1. **Surgical hardening (selected):** patch the existing parser, scope decision, candidate ranking, and response renderer in place with focused regression tests. This best fits the recovery sprint and minimizes behavior drift.
2. **Contract-first hardening:** introduce a shared typed turn-result and diagnostics contract before fixing the defects. This is cleaner long term but violates the sprint’s no-architecture-expansion constraint.

The selected approach is surgical hardening because all four failures occur at existing seams and the benchmark requires measurable behavior, not a new design.

## Design

### Provider JSON reliability

The executor will retain the current `completeCopilotTurn` and `validateCopilotAnswer` interfaces. Parsing will first accept strict JSON, then attempt one bounded extraction of the outermost JSON object when the provider adds surrounding text or code fences. Extraction must reject unbalanced braces, multiple candidate objects, invalid JSON, wrong top-level shape, and payloads that still fail answer validation. Internal diagnostics will distinguish provider failure, malformed JSON, validation failure, and answer-repair failure. The user-facing response will preserve the existing usable fallback shape and will not expose provider payloads, schema errors, stack traces, or implementation details.

### Investigation scope

`isInvestigationScopedQuestion()` and its call sites will be traced so relationship, evidence, summary, application, findings, and cross-system questions use the whole investigation unless the question contains an exact native ID, exact entity ID, or governed-property value that uniquely resolves to one entity. Generic aliases, display names, fuzzy labels, and lexical matches cannot force entity scope. Clarification must remain enabled for entity-specific impact, dependency, root-cause, and change questions. When an exact/native/entity/property match is non-unique, clarification is required rather than deterministic selection or returning all matches. The regression tests will cover both positive investigation scope and negative entity scope.

### Explicit identifier ranking

Candidate ranking will assign strict precedence to an explicit identifier match: exact native ID first, exact entity ID second, governed property third, and lexical similarity last. Metadata candidates may remain in the candidate list for diagnostics, but cannot outrank an exact requested object. If a highest-precedence match is not unique, the system will ask the explicit multiple-match clarification question rather than use secondary scores to choose.

### Single-owner rendering

The response surface will be traced from streamed provider state through message state and `TypingText`/answer content. The streamed answer will be the single visible source of truth. Completion may finalize metadata, citations, diagnostics, and status, but must not replay or append already-rendered answer text. If the stream is incomplete or invalid, only the missing completion delta may be applied. The focused UI test will assert one visible assistant answer after streaming updates and completion.

## Verification

- Run the affected Vitest suites for executor parsing, context/ranking, relationship flow, and Copilot panel rendering.
- Manually execute E1, M1, M2, T1, and T8 against both the current running investigation state (recording investigation ID, revision, and timestamp) and the fixed seeded benchmark fixture.
- Update `benchmark-live-validation.md` with both exact returned answers, expected behavior, pass/fail, and observations for every case. The fixture result is the canonical reproducible baseline; the current-state result is the production validation sample.
- Sprint 1A is complete only when all five live cases pass and no duplicate rendering or JSON parse failure remains.

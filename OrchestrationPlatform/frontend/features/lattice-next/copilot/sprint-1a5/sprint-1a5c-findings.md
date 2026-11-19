# Sprint 1A.5C Findings

## Result: budget preservation passes; provider-answer validation remains open

### 1. Why were narratives removed?

The prior trim order treated impact and relationship narratives as early
trimmable categories. The size loop continued reducing them, then impact
chains, until later reductions brought the packet under budget. The resulting
13K-character packet was below the 24K limit because the information had
already been removed; the final size alone did not indicate that the
intelligence was unnecessary.

### 2. Why were impact chains removed?

Impact chains had no protected minimum in the previous budget policy and were
also eligible for trimming to zero.

### 3. Was this true budget pressure or trim-loop behavior?

The loop correctly enforced the size comparison, but the trim policy gave
validated reasoning intelligence insufficient priority. This was a trim-order
and minimum-contract defect, not evidence that the final packet needed to
remain at 13K or that the packet-size limit should increase.

### 4. What categories are now protected?

When available, the builder protects at least one relationship narrative, one
impact narrative, and one impact chain. Existing relationship endpoint,
relationship, evidence, and impact-path minimums remain in place. Lower-priority
content and secondary reasoning items are trimmed first.

If compact composition still cannot fit, the builder throws
`ContextBudgetExceededError` with the protected categories, serialized packet
size, configured limit, and largest packet fields. It does not silently drop
the protected package or return an oversized packet.

### 5–7. What survives through the brief and prompt?

For both M1 and M2, the reasoning package, engineering brief, and prompt each
contain:

- 1 relationship narrative
- 1 impact narrative
- 1 impact chain

The prompt also contains 1 relationship and 2 evidence records.

| Question | Packet size | Budget | Omitted reasoning narratives | Omitted impact chains |
|---|---:|---:|---:|---:|
| M1 | 21,768 chars | 24,000 chars | 13 | 2 |
| M2 | 21,220 chars | 24,000 chars | 4 | 2 |

Full final omission counts are in
[`budget-preservation-trace.md`](./budget-preservation-trace.md).

### 8–9. Did M1 and M2 pass?

Both fixture-backed prompt validations pass. They confirm that relationship
and impact reasoning survives into the prompt together with relationship and
evidence records. No provider-backed model answer was generated, so answer
quality and the expected prose response are not yet validated.

### 10. Is Sprint 2 unblocked?

**Not yet.** The budget-to-prompt preservation boundary is now validated, but
the requested provider-backed M1 and M2 answer validation remains outstanding.

## Validation

Passed focused Vitest validation:

```text
Test Files  5 passed (5)
Tests       25 passed (25)
```

The set included the context builder tests, protected-context test, golden
fixture prompt tests, budget-preservation tests, and engineering-brief
preservation tests.

The 2,048-character protected-intelligence case also passes by asserting an
explicit composition error with the protected categories and configured
budget; it does not assert an oversized success packet.

ESLint passed for the changed implementation and tests. `npx tsc --noEmit`
remains blocked by existing errors in the pre-existing working-tree changes
to `plm-brain/universal/ontology-evidence-adapter.ts` and
`tests/copilot-relationship-flow.test.ts`; no TypeScript errors were reported
in the files changed for this task.

# Sprint 1A.5C Budget Preservation Trace

## Trace result

The golden fixture starts with 3 governed, ontology-resolved relationships,
12 relationship paths, 3 impact paths, and 3 impact chains. Context composition
now retains a minimum of one relationship narrative, one impact narrative,
and one impact chain when those artifacts exist. The engineering brief and
prompt payload preserve those retained artifacts.

| Stage / metric | M1 | M2 |
|---|---:|---:|
| Resolved relationships available | 3 | 3 |
| Relationship paths available | 12 | 12 |
| Impact paths available | 3 | 3 |
| Impact chains available | 3 | 3 |
| Reasoning-package relationship narratives after budget | 1 | 1 |
| Reasoning-package impact narratives after budget | 1 | 1 |
| Reasoning-package impact chains after budget | 1 | 1 |
| Engineering-brief relationship narratives | 1 | 1 |
| Engineering-brief impact narratives | 1 | 1 |
| Engineering-brief impact chains | 1 | 1 |
| Prompt relationship narratives | 1 | 1 |
| Prompt impact narratives | 1 | 1 |
| Prompt impact chains | 1 | 1 |
| Prompt relationships | 1 | 1 |
| Prompt relationship evidence records | 2 | 2 |
| Final serialized packet size | 21,768 chars | 21,220 chars |
| Configured packet budget | 24,000 chars | 24,000 chars |

Questions:

- **M1:** "Which applications are involved in this investigation and how are
  they connected?"
- **M2:** "What operational consequence follows from this Windchill part being
  represented as a SAP material?"

## Final omission counts

| Omission category | M1 | M2 |
|---|---:|---:|
| Entities | 2 | 2 |
| Relationships | 11 | 11 |
| Evidence | 7 | 7 |
| Findings | 0 | 0 |
| Unresolved evaluations | 2 | 2 |
| Relationship paths | 12 | 3 |
| Reasoning artifacts | 48 | 34 |
| Ontology definitions | 5 | 5 |
| Source selections | 0 | 0 |
| Relationship guidance | 7 | 7 |
| Impact paths | 2 | 2 |
| Impact chains beyond protected minimum | 2 | 2 |
| Reasoning narratives beyond protected minimum | 13 | 4 |

The omissions include secondary reasoning artifacts and narratives; each
available protected category retains one item in the package, brief, and
prompt. M1 and M2 both retain one relationship and two evidence records in
the prompt payload.

## Too-small budget behavior

The fixture cannot fit its protected reasoning under the configured minimum
2,048-character packet budget. Composition now throws
`ContextBudgetExceededError` instead of returning an oversized packet or
silently clearing the reasoning package and engineering brief. The diagnostic
reports the configured budget, measured serialized packet size, the protected
categories, and the largest packet fields. The test verifies the error names
relationship narratives, impact narratives, impact chains, and the 2,048
budget.

## Implementation locations

- Protected reasoning minimums are established in
  [`context-builder.ts`](../context-builder.ts) at line 1909.
- Lower-priority categories are trimmed before protected narratives and
  chains at line 1931; the minimum-aware trim check is at line 2221.
- Compact fallback preserves the protected package and brief content, and
  reports a composition error if the serialized packet remains over budget,
  beginning at line 2232.
- The bounded engineering brief copies the retained reasoning arrays at line
  2160.
- Prompt composition carries those brief arrays and chains in
  [`engineeringPromptPayload`](../context-builder.ts#L1415).

## Answer-validation boundary

The golden-fixture M1 and M2 tests validate the actual constructed prompt
payload, including narratives, chains, relationships, and evidence. They do
not invoke an external/provider-backed answer model. Therefore this trace
proves preservation through prompt construction, not answer-generation
quality.

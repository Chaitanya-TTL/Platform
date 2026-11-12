# Four-Application M1 Context Deduplication

## Intent

Keep the four-application investigation summary within its existing context
budget without losing Codebeamer, Windchill, SAP, or Configit coverage.

## Goals and constraints

- Keep all authoritative graph edges and four structured application
  participation records.
- Keep exactly one compact business representative per application, one
  overall connectivity narrative, and one evidence-boundary statement.
- Remove duplicated participation and representative prose from the M1 prompt
  projection only.
- Do not change graph materialization, ontology, M2, impact reasoning, or the
  24,000-character hard limit; target a packet no larger than 22,500 characters.

## Approach

Use an M1-only prompt projection to deduplicate narrative and representative
fields while leaving the underlying graph and non-M1 packets intact. Broader
graph or budget trimming is excluded because it can remove required evidence or
application coverage.

## Verification

Add a focused four-application test asserting the prompt size target, retained
application participation and representatives, one connectivity narrative,
zero entity-level subject edges in the prompt, no inferred direct engineering
relationship, and unchanged M2 behavior. Run only the requested focused tests,
changed-file lint, and `git diff --check`; do not make a provider request.

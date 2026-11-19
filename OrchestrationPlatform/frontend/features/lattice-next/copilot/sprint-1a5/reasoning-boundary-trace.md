# RP1 Reasoning Boundary Trace

## Scope and method

This records the isolated golden-fixture diagnostic for the two requested
questions. Temporary, environment-gated instrumentation captured the package
before and after context budgeting; the instrumentation and diagnostic test
were removed after the run. No selection or packet behavior was changed.

- **M1:** "Which applications are involved in this investigation and how are
  they connected?"
- **M2:** "What operational consequence follows from this Windchill part being
  represented as a SAP material?"
- Both runs were investigation-scoped and had no focal entity.
- Both used the default **24,000-character** context limit.

## Boundary counts

| Boundary | M1 | M2 |
|---|---:|---:|
| Ontology-resolved relationships available | 3 | 3 |
| Relationship paths in graph projection | 12 | 12 |
| Impact paths in graph projection | 3 | 3 |
| Impact chains in graph | 3 | 3 |
| Relationship-path candidates after scope filter | 12 | 3 |
| Relationship paths selected for package | 12 | 3 |
| Impact-path candidates after scope filter | 3 | 3 |
| Impact paths selected for package | 3 | 3 |
| Relationship narratives before budget | 12 | 3 |
| Impact narratives before budget | 3 | 3 |
| Impact chains before budget | 3 | 3 |
| Relationship narratives after budget | 0 | 0 |
| Impact narratives after budget | 0 | 0 |
| Impact chains after budget | 0 | 0 |
| Final packet size | 13,138 chars | 13,128 chars |
| Budget-loop iterations | 96 | 73 |

M1's general relationship question selects the 12 relationship paths as its
path pool. M2's impact question selects the 3 impact paths as its relationship
narrative path pool. The separate impact selector considers all 3 impact paths
in both runs.

## Relationship selector trace

Relationship relevance scores are used to order relationship contexts; they
are not a pass/fail threshold. Since neither question produced a focal entity,
`orderRelationshipsFromFocus` returned all 12 available relationship contexts.
The three resolved relationships were therefore available to package
construction in both runs.

| Resolved relationship | M1 relevance score | M2 relevance score | Selected before budget? | Final packet disposition |
|---|---:|---:|---|---|
| Windchill part `specified-by` Codebeamer requirement | 8 | 113 | Yes | Removed by character-budget trimming |
| Windchill part `configured-by` Configit model | 2 | 113 | Yes | Removed by character-budget trimming |
| Windchill part `operationally-represented-as` SAP material | 2 | 148 | Yes | Retained as the protected relationship |

The scores above are lexical relevance scores, not relationship-path scores.
All path candidates that reached the ranking stage scored **0.995** in the
captured fixture run. There is no minimum score threshold. The path cap was 60
per category, above the 12 M1 and 3 M2 candidates, so no resolved relationship
was excluded by score or cap.

## Impact-chain selector trace

Each of the three graph impact chains matched a selected impact path by source,
target, and ordered relationship IDs. Each corresponding path scored **0.995**.
The selector has no minimum score threshold, and the per-category path cap was
60. All three chains were materialized in the pre-budget reasoning package for
both questions.

| Impact chain | M1 | M2 | Selector rejection reason | Final packet disposition |
|---|---|---|---|---|
| Windchill part to SAP material | Selected, score 0.995 | Selected, score 0.995 | None | Removed by character-budget trimming |
| SAP material to Windchill part | Selected, score 0.995 | Selected, score 0.995 | None | Removed by character-budget trimming |
| Codebeamer requirement to SAP material | Selected, score 0.995 | Selected, score 0.995 | None | Removed by character-budget trimming |

No relationship or impact-chain candidate was rejected by the graph
projection, focal-scope filter, score ranking, or item cap in these runs.

## First information-loss boundary

The first observed loss is **context packet character-budget trimming**, not
selector filtering, ranking, or question scope:

1. `buildReasoningPackage` populated the full package with non-zero
   relationship narratives, impact narratives, and chains.
2. The context builder initialized trim counts from those populated arrays.
3. While the serialized packet exceeded its character budget, the trim loop
   decremented package counts and recomposed the packet.
4. The captured loop reduced all reasoning narratives and all impact chains to
   zero before it reached a packet size under the configured limit.
5. The final package slices those arrays using the reduced counts. The bounded
   engineering brief then copies the already-trimmed arrays, so it also
   contains zero relationship and impact narratives.

For M1, the final packet reports 15 omitted reasoning narratives
(12 relationship + 3 impact) and 3 omitted impact chains. For M2, it reports
6 omitted reasoning narratives (3 relationship + 3 impact) and 3 omitted
impact chains. The diagnostic also tried the maximum accepted 80,000-character
limit; the loop still trimmed the reasoning narratives and chains away before
the packet fit.

## Selection disposition summary

| Candidate category | Available | Selected before budget | Selector rejects | Removed at budget stage |
|---|---:|---:|---:|---:|
| Resolved relationships (M1) | 3 | 3 | 0 | 2; 1 protected relationship remains |
| Resolved relationships (M2) | 3 | 3 | 0 | 2; 1 protected relationship remains |
| Impact chains (M1) | 3 | 3 | 0 | 3 |
| Impact chains (M2) | 3 | 3 | 0 | 3 |

## Relevant code locations

Locations refer to `../context-builder.ts`:

- `orderRelationshipsFromFocus` returns all scored relationships when there is
  no focal entity: line 584.
- Relationship relevance scoring and ordering: lines 1584-1612.
- Question-intent path-pool selection and focal-source filtering: lines
  1663-1668.
- Path scoring/ranking and the `maxItems` cap: lines 1681-1691.
- Path score calculation: line 721; narrative rendering guard:
  lines 746-758.
- Relationship narrative and impact-chain materialization:
  lines 899-935; package arrays are capped by `maxReasoningItems` at
  lines 1152-1156.
- Full reasoning package creation: line 1740.
- Initial counts, including package narratives and chains: lines 1869-1873.
- Budget trim order puts impact narratives and relationship narratives before
  impact chains: lines 1928-1933.
- Recomposition slices the full package using the mutable trim counts:
  lines 2062-2066.
- The bounded engineering brief copies the trimmed package arrays:
  lines 2157-2165.
- The character-budget loop decrements the first eligible trim category and
  recomposes the packet: lines 2227-2233.

## RP1 conclusion

The first exact loss boundary is the **context budget trim loop**. All three
resolved fixture relationships and all three impact chains passed projection,
ranking, and package construction for M1 and M2. The final reasoning package
loses the narratives and chains only when the packet is trimmed to satisfy its
character budget. This trace identifies the boundary; it does not implement a
fix or establish provider-backed answer behavior.

# Sprint 1A.3 Path Origin Analysis

## Live path totals

- Relationship paths: **591**
- Resolved relationships used as path edges: **0**
- Impact paths: **0**
- Impact chains: **0**
- Cross-system paths: **0**
- Canonical-only paths: **591**
- Path status: `POTENTIAL` for all 591 paths

## Path lengths

| Path length | Count |
|---:|---:|
| 1 | 209 |
| 2 | 169 |
| 3 | 113 |
| 4 | 56 |
| 5 | 44 |

Total: `209 + 169 + 113 + 56 + 44 = 591`.

## Origin and meaning

| Path origin | Count | Cross-system? | Resolved? | Evidence |
|---|---:|---|---|---|
| Canonical relationships | 591 | NO | NO | Every path relationship ID belongs to `canonicalRelationships` |
| Identity clusters | 0 direct path edges | NO | NO | Clusters are identity groupings, not path edges |
| Ontology-resolved relationships | 0 | NO | NO | `resolvedRelationships` is empty |
| Graph traversal | 591 generated traversals | NO | NO | Traversal expands canonical same-system edges |
| Same-system traversal | 591 | NO | NO | Source and target applications are equal for every path |

## Finding

The 591 paths are internal navigation paths over 209 canonical relationships.
They are not cross-system intelligence. Their `POTENTIAL` status reflects that
the evaluator creates fallback path edges for canonical relationships that were
not matched to a resolved ontology relationship. Since all canonical
relationships are same-system, traversal cannot create a cross-system path.

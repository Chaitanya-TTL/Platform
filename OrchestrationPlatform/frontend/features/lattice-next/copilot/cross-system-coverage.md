# Sprint 1A.2 Cross-System Coverage

## Scope

This report describes relationships actually evidenced by the active saved
investigation at snapshot revision `1`. An application being present is not
treated as proof that an inter-application relationship exists.

## Coverage matrix

The matrix records **resolved ontology relationships**. `0` means no resolved
relationship was present in the live graph, not that the source applications
were absent.

| Source \ Target | Codebeamer | Windchill | SAP | Configit |
|---|---:|---:|---:|---:|
| Codebeamer | same-source only | 0 | 0 | 0 |
| Windchill | 0 | same-source only | 0 | 0 |
| SAP | 0 | 0 | same-source only | 0 |
| Configit | 0 | 0 | 0 | same-source only |

## Pair-level evidence

| Pair | Identity links | Resolved relationships | Relationship paths | Impact paths | Evidence |
|---|---:|---:|---:|---:|---|
| Codebeamer ↔ Windchill | No confirmed live cross-source link | 0 | 0 resolved cross-system paths | 0 | Four applications are present, but no governed resolved link is recorded |
| Codebeamer ↔ SAP | No confirmed live cross-source link | 0 | 0 resolved cross-system paths | 0 | No resolved ontology relationship |
| Codebeamer ↔ Configit | No confirmed live cross-source link | 0 | 0 resolved cross-system paths | 0 | No resolved ontology relationship |
| Windchill ↔ SAP | No confirmed live cross-source link | 0 | 0 resolved cross-system paths | 0 | M2’s expected relationship is absent from the live graph |
| Windchill ↔ Configit | No confirmed live cross-source link | 0 | 0 resolved cross-system paths | 0 | No resolved ontology relationship |
| SAP ↔ Configit | No confirmed live cross-source link | 0 | 0 resolved cross-system paths | 0 | No resolved ontology relationship |

## Important distinction

The saved graph still reports 209 canonical relationships and 591 total
relationship paths. Those totals are not equivalent to cross-system coverage.
The live evidence says the canonical/path content is predominantly
Codebeamer-internal and that ontology-resolved cross-system relationships are
zero.

## Conclusion

The active investigation proves application presence, but does not prove
cross-system connectivity. The evidence supports “no resolved cross-system
relationship is available in this saved snapshot,” not “the Copilot ignored a
resolved relationship.”

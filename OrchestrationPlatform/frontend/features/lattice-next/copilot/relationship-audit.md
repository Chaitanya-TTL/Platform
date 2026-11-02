# Sprint 1A.2 Relationship Audit

## Scope

This audit follows the active saved investigation
`lattice-21d72fde-eb14-4d9b-8d9f-b4f2f91ed78a`, snapshot revision `1`, through
the relationship pipeline. It is an evidence report only; no implementation,
prompt, retrieval, ranking, ontology, or PLM Brain behavior was changed.

## End-to-end counts

| Stage | Input count | Output count | Dropped count | Drop reason |
|---|---:|---:|---:|---|
| Raw investigation entities | 239 entities | 239 canonical entities | 0 | No entity loss was observed |
| Source/application coverage | 239 entities | Codebeamer 67, Configit 41, SAP 114, Windchill 17 | 0 | All four requested applications are present |
| Identity resolution | 239 entities | 5 identity clusters | Not comparable: clusters are not entity rows | Most entities have no reported cross-source identity grouping; no entity deletion is evidenced |
| Canonical relationships | Existing saved graph | 209 relationships | Not applicable | These are the relationships present in the saved canonical graph |
| Ontology evaluation | Candidate application/kind/property combinations | 0 resolved relationships | Candidate evaluations were not materialized as resolved links | No governed evidence satisfied a live cross-system ontology rule |
| Relationship paths | 0 resolved ontology relationships | 591 paths reported by the saved graph | 0 path drops attributable to context trimming | The paths derive from existing canonical/same-system graph content, not resolved cross-system links |
| Impact paths | Resolved relationship graph | 0 impact paths | 0 | No live resolved impact-traversal path exists |
| Reasoning package | Saved graph and context inputs | 0 cross-system relationship narratives and 0 impact chains | 0 valid cross-system relationships | The reasoning layer preserved the absence of resolved cross-system links |
| Engineering brief | Reasoning package | 0 resolved cross-system relationships; 0 impact narratives | 0 | No relationship was available to narrate |
| Prompt payload | Engineering brief and bounded context | 0 resolved cross-system relationships exposed | 0 valid relationships omitted | The prompt received the same zero resolved cross-system relationship state |

## Stage evidence

### Raw investigation and identity resolution

The saved snapshot contains 239 entities from four applications:

- Codebeamer: 67
- Configit: 41
- SAP: 114
- Windchill: 17

It reports five identity clusters. The cluster count does not mean 234 entities
were discarded; it means only five groups were formed by the identity resolver.
The live cluster evidence is predominantly singleton Codebeamer coverage, with
only limited multi-member identity evidence.

### Ontology evaluation and materialization

The saved graph reports:

- Canonical relationships: 209
- Ontology-resolved relationships: 0
- Universal relationship evaluations: 0
- Relationship paths: 591
- Impact paths: 0

This is the decisive boundary. The live graph contains no resolved ontology
relationship from which a Windchill-to-SAP explanation or impact path could be
constructed. The 591 paths therefore cannot be evidence of a resolved
cross-system relationship; they are paths over the relationships already present
in the saved graph, primarily within Codebeamer.

The graph-cache logic accepts an existing structurally valid graph when its
schema, revision, traversal depth, ontology version, and arrays are valid. A
zero resolved-relationship count is not itself a cache-invalidating condition.
Therefore the saved graph reaches context construction with zero resolved
cross-system relationships.

### Reasoning package, engineering brief, and prompt

The context-builder diagnostics preserve relationship counts at the ontology
graph, reasoning package, engineering brief, and Copilot-context stages. The
latest live evidence reports zero resolved cross-system relationships at each
stage, with no valid cross-system relationship dropped by context trimming.

## Conclusion

The first proven loss of the expected cross-system relationship is before or at
live ontology/materialization input: the active saved investigation does not
contain a resolved governed cross-system relationship. This audit does not prove
that a missing relationship should be invented from application presence alone.

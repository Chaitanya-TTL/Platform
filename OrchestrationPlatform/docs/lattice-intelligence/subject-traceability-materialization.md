# Subject Traceability Materialization

## Authoritative location

Subject traceability is materialized by the existing
`enrichInvestigationWithOntology` graph-evaluation pass. It is stored as
`InvestigationKnowledgeGraph.subjectTraceabilityRelationships` and shares
the graph's entity collection, traversal indexes, summary, revision, and
investigation identity. No parallel graph store or relationship engine is
introduced.

## Deterministic identity

The existing stable-ID encoder percent-encodes each ID part and joins parts
with colons. The evaluator uses:

- Subject node: `stableId(["investigation-subject", investigationId, subjectId])`
- Participant edge: `stableId(["subject-traceability", investigationId, entityId, subjectNodeId])`

This makes rebuilds deterministic and prevents IDs from colliding across
investigations that share a subject.

## Edge contract

For each entity in `EngineeringIntelligenceInvestigationV1.entities`, the
evaluator creates one edge with the following fields:

| Field | Value |
|---|---|
| `category` | `"subject-traceability"` |
| `relationshipType` | `"represents-subject"` |
| `sourceEntityId` | The participating canonical entity ID |
| `targetEntityId` | The generated investigation-subject graph entity ID |
| `status` | `"subject-derived"` |
| `authority` | `"investigation"` |
| `strength` | `"informational"` |
| `impactEligible` | `false` |

`sourceApplication` and `sourceNativeId` are copied when present. Missing
source metadata stays missing; the evaluator does not guess an application or
native identifier.

## Edge provenance

Every edge includes provenance with:

- `provider: "lattice-subject-traceability"`
- `authority: "investigation"`
- `observedAt`: investigation assembly timestamp
- `investigationId` and `subjectId`
- participant source application and native ID when available
- participant source provider, authority, and original observation time

The edge citation points to the participant and subject graph entities. No
source evidence IDs are fabricated.

## Indexes and counters

Subject edges are included in the authoritative graph's outgoing/incoming
traversal indexes and relationship count. They do not contribute to
ontology relationship coverage or cross-application mappings: a shared
subject node is not a direct application-to-application relationship.

## Strict impact separation

The evaluator does not pass subject edges into `pathEdges` used to construct
`relationshipPaths` or `impactPaths`. It does not add them to
`resolvedRelationships`, does not match them to ontology templates, and does
not pass them to impact-chain materialization. Existing cached graphs that
lack `subjectTraceabilityRelationships` are re-enriched before use.

Consequently, a subject edge cannot be promoted into an ontology-resolved,
impact-path, or impact-chain relationship. Impact analysis continues to
require the existing ontology-resolved evidence and eligibility rules.

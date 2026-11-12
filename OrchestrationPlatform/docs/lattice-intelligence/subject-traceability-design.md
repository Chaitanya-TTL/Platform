# Subject Traceability Design

## Purpose

Subject traceability explains that records from multiple applications
participate in one investigation subject. It fills an investigation-overview
gap without claiming that the source records have a proven engineering
relationship.

The authoritative `InvestigationKnowledgeGraph` remains the single graph.
Subject traceability is an additional graph relationship category, not a
replacement for canonical relationships, ontology resolution, or impact
analysis.

## Relationship categories

| Category | Authoritative graph collection | Meaning |
|---|---|---|
| Canonical | `canonicalRelationships` | A relationship already present in canonical investigation data. |
| Ontology-resolved | `resolvedRelationships` | A relationship supported by an executable ontology rule and its required evidence. |
| Subject traceability | `subjectTraceabilityRelationships` | An investigation participant represents the shared subject of this investigation. |
| Impact | `impactPaths` and `impactChains` | A potential consequence path derived from ontology-eligible relationships. |
| Unresolved | `unresolvedEvaluations` | Compatible endpoints were considered, but required ontology evidence was not established. |

These categories stay distinct in the graph and in Copilot context. A
subject-traceability relationship has:

- `category: "subject-traceability"`
- `relationshipType: "represents-subject"`
- `status: "subject-derived"`
- `authority: "investigation"`
- `strength: "informational"`
- `impactEligible: false`

## Graph shape

The evaluator materializes one `"investigation-subject"` graph entity and
one directed edge from each canonical investigation entity to that subject
entity. Thus Windchill, SAP, Configit, and Codebeamer records can be explained
as participating in the same Steering investigation without manufacturing
pairwise application-to-application edges.

An edge means only:

> This entity participates in the investigation whose subject is Steering.

It does not mean that two source records are identical, that one system
represents another system's object, or that a change propagates between them.
The subject edge is derived from membership in the investigation, not from
source-system evidence of an engineering relationship.

## Provenance

Each edge records its own derivation provenance: provider
`"lattice-subject-traceability"`, authority `"investigation"`, materialization
time, investigation ID, and subject ID. It also preserves the participant's
source application and native ID when available, plus the original source
provider, authority, and observation time. The edge cites both graph
endpoints; it does not invent source evidence.

## Consumer boundary

Investigation-scoped summaries and relationship/application/entity overviews
may use subject-traceability edges. This includes questions such as “How are
systems connected?” and “What entities participate?” when no specific entity
identifier scopes the question. The Copilot context marks the category
explicitly and includes the shared subject endpoint so an answer can explain
the common investigation context. It does not turn identity-cluster or
subject-candidate co-membership into pairwise application links for these
overviews.

Impact, dependency, change-analysis, risk, and root-cause questions do not
receive subject-traceability edges. Those questions continue to use only the
existing impact-path pool, which is generated from ontology-eligible
relationships. Plural “changes” is classified as change-analysis so
“What changes if this part changes?” follows this protected route.

## Explicit non-promotion rule

Subject-traceability edges must never be promoted into
`resolvedRelationships`, `impactPaths`, or `impactChains`. They are not added
to the ontology definition catalog or used as input to impact-path or
impact-chain materialization. Their `impactEligible: false` value is
structurally enforced and covered by tests.

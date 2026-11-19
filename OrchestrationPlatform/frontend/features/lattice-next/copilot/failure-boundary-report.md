# Sprint 1A.4 Failure Boundary Report

## Evidence trace

| Boundary | Evidence | Status |
|---|---|---|
| A. Identity Resolution | Fixture contains 4 entities and 0 identity clusters; handshake relies on explicit governed endpoint mapping | Not traversed as a cross-app identity link |
| B. Canonical Relationship Generation | Validated PLM Brain handshake creates 3 cross-application canonical relationships | PASS |
| C. Ontology Evaluation | 5 definitions evaluated; 0 resolved; fixture pair rejected for missing ontology-specific evidence or incompatible endpoint kinds | **First failed boundary** |
| D. Relationship Materialization | `plmBrain` and canonical relationship arrays contain 3 handshake edges, but ontology graph `resolvedRelationships` is empty | Partial: handshake materializes, resolved graph does not |
| E. Impact Generation | 3 canonical fallback paths; 0 impact paths and 0 impact chains | Blocked by zero ontology-resolved/impact-eligible relationships |
| F. Retrieval | Default context packet omits 4 entities, 9 relationships, and 3 evidence records due its 24,000-character budget | Second failed boundary |
| G. Prompt | Production-default payload has 0 relationships and 0 evidence records | No cross-system relationship supplied to provider |
| H. Answer Generation | No provider call was made against the non-persisted golden fixture | Not evaluated |

## First failed transition

The first failure is **C. Ontology Evaluation**. The governed PLM Brain mapping
records are accepted using the fixture's explicitly verified fields, but the
Lattice ontology evaluator independently requires different fields and endpoint
kinds. It does not resolve the canonical handshake relationships from the
handshake evidence.

## Secondary failure

Even when the fixture is inspected with a diagnostic context limit large enough
to retain the relationship material, the actual default 24,000-character
context packet drops all entities, relationships, and evidence. This prevents
the provider from receiving the materialized handshake relationships in the
production-default prompt path.

## Exact evidence category

- Governed handshake accepted: 3 relationships / 3 evidence records.
- Canonical cross-application relationships: 3.
- Ontology-resolved relationships: 0.
- Ontology unresolved definitions: 5.
- Impact paths / chains: 0 / 0.
- Default prompt relationships / evidence: 0 / 0.
- Live golden-path Copilot answer: not run.

## Finding

The PLM Brain can create governed cross-system canonical relationships. The
existing fixture does not prove a complete Copilot path because the ontology
contract fails to recognize those same governed evidence fields, and the
production-default context budget then removes all relationship material.

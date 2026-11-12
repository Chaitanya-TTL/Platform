# Current Investigation Gap Analysis

Read-only analysis of the current saved live investigation versus the Sprint 1 golden fixture. No code changes were made.

## Evidence sources

- [OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/canonical-relationship-analysis.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/canonical-relationship-analysis.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/materialization-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/materialization-proof.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/impact-path-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/impact-path-proof.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-data-alignment.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-data-alignment.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/m1-root-cause.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/m1-root-cause.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/live-investigation-expectations.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/live-investigation-expectations.md)
- [OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/reasoning-boundary-trace.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/reasoning-boundary-trace.md)
- [OrchestrationPlatform/docs/relationships.md](./OrchestrationPlatform/docs/relationships.md)
- Live saved investigation JSON at [OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json](./OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json)

## Executive conclusion

The benchmark is failing because the live investigation is not the intended cross-system benchmark dataset. The live graph contains 209 canonical relationships, but all 209 are same-application edges. There are zero ontology-resolved relationships, zero impact paths, and zero impact chains. The saved investigation also has no operational Windchill↔SAP representation and no corresponding `CN-9001`/`MAT-200` fixture data.

This is not a provider-only problem. The first failure boundary is missing cross-system materialization and missing ontology resolution; ranking and budget trimming are secondary amplifiers, not the root cause of the missing evidence.

## 1) Current investigation counts

From the saved live investigation and the benchmark validation docs:

- Canonical relationships: 209
- Ontology-resolved relationships: 0
- Impact paths: 0
- Impact chains: 0

Evidence:

- [benchmark-live-validation.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md) states: "Snapshot revision: 1 ... Canonical relationships: 209 ... Ontology-resolved relationships: 0 ... Impact paths: 0"
- [canonical-relationship-analysis.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/canonical-relationship-analysis.md) confirms the application-pair totals:
  - Codebeamer→Codebeamer: 62
  - Windchill→Windchill: 15
  - SAP→SAP: 92
  - Configit→Configit: 40
- The live JSON `relationships` array contains 209 records and no cross-application edges.

## 2) Top 20 canonical relationships by importance/relevance

There is no explicit, persisted top-20 ranking for the current live investigation. The only available ranking signal in the saved live investigation is the relationship list itself, with every relationship showing the same confidence score and no resolved cross-system edges.

As a practical evidence-backed proxy, the first 20 persisted canonical relationships from the live investigation are:

1. `configit:rel:contains-feature:configit-family-mrkt:configit-family-mrkt-feature-den` — `configit -> configit`
2. `configit:rel:contains-feature:configit-family-mrkt:configit-family-mrkt-feature-ind` — `configit -> configit`
3. `configit:rel:contains-feature:configit-family-mrkt:configit-family-mrkt-feature-usa` — `configit -> configit`
4. `configit:rel:contains-feature:configit-family-orientation:configit-family-orientation-feature-04` — `configit -> configit`
5. `configit:rel:contains-feature:configit-family-orientation:configit-family-orientation-feature-05` — `configit -> configit`
6. `configit:rel:contains-feature:configit-family-stype:configit-family-stype-feature-01` — `configit -> configit`
7. `configit:rel:contains-feature:configit-family-stype:configit-family-stype-feature-02` — `configit -> configit`
8. `configit:rel:contains-feature:configit-family-stype:configit-family-stype-feature-03` — `configit -> configit`
9. `configit:rel:contains-translation:configit-language-dn:configit-language-dn-family-unknown-text` — `configit -> configit`
10. `configit:rel:contains-translation:configit-language-dn:configit-language-dn-feature-unknown-text` — `configit -> configit`
11. `configit:rel:contains:configit-rule-2:configit-rule-2-field-enabled` — `configit -> configit`
12. `configit:rel:contains:configit-rule-2:configit-rule-2-field-end-event` — `configit -> configit`
13. `configit:rel:contains:configit-rule-2:configit-rule-2-field-expression` — `configit -> configit`
14. `configit:rel:contains:configit-rule-2:configit-rule-2-field-locked` — `configit -> configit`
15. `configit:rel:contains:configit-rule-2:configit-rule-2-field-start-event` — `configit -> configit`
16. `configit:rel:contains:configit-rule-3:configit-rule-3-field-enabled` — `configit -> configit`
17. `configit:rel:contains:configit-rule-3:configit-rule-3-field-end-event` — `configit -> configit`
18. `configit:rel:contains:configit-rule-3:configit-rule-3-field-expression` — `configit -> configit`
19. `configit:rel:contains:configit-rule-3:configit-rule-3-field-locked` — `configit -> configit`
20. `configit:rel:contains:configit-rule-3:configit-rule-3-field-start-event` — `configit -> configit`

Important nuance: this is not a meaningful business ranking. It is just the preserved list order because no relevance score or cross-system priority is materialized in the live snapshot.

## 3) Is there any operationally-represented-as relationship?

Current live investigation: No materialized relationship.

What exists instead is an unresolved ontology candidate:

- Rule ID: `WC_PART_TO_SAP_MATERIAL`
- Relationship type: `operationally-represented-as`
- Status: `unresolved`
- Reason: "Matching application endpoint types were selected, but no accepted deterministic linkage evidence was observed."

This is visible in the live investigation’s `universalRelationshipEvaluations` data. In other words:

- the relationship type exists as an ontology rule and as an unresolved candidate,
- but it does not exist as a confirmed `operationally-represented-as` relationship in the current graph.

Golden fixture (validated PLM Brain handshakes): yes, but only at the canonical mapping stage, not as an ontology-resolved relationship.

- Relationship ID: `plm-rel:map-wc-sap-001:wc:part:sap:material`
- Type: `operationally-represented-as`
- Source endpoint: `wc:part`
- Target endpoint: `sap:material`
- Evidence: `plm-evidence:map-wc-sap-001:wc:part:sap:material`

This is documented in [materialization-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/materialization-proof.md), which also explicitly shows that the ontology evaluator still resolves zero relationships from that fixture.

## 4) Is there any Windchill ↔ SAP relationship?

### Current live investigation

No.

- Canonical Windchill↔SAP: 0
- Ontology-resolved Windchill↔SAP: 0
- Impact-path eligible Windchill↔SAP: 0

Evidence:

- [canonical-relationship-analysis.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/canonical-relationship-analysis.md) reports the application-pair table with `Windchill -> SAP = 0` and `SAP -> Windchill = 0`.
- The live JSON has no `sourceEndpoint.source === 'windchill'` and `targetEndpoint.source === 'sap'` pairs.
- `impact-path-proof.md` reports `Impact path count: 0` and `Impact chain count: 0`.

### Golden fixture

Yes, but only as a canonical mapping and as an unresolved ontology candidate.

- Canonical: yes (`plm-rel:map-wc-sap-001:wc:part:sap:material`)
- Ontology-resolved: no (`evidence-not-found`)
- Impact-path eligible: no

Evidence:

- [materialization-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/materialization-proof.md) lists the handshake relationship ID and states: "The ontology evaluator did not accept the same pair... result is `evidence-not-found`"
- [impact-path-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/impact-path-proof.md) says the canonical fallback path exists but is not impact-eligible because no relationship passed ontology evaluation.

## 5) M1 analysis

Question: "Which applications are involved in this investigation and how are they connected?"

### Entities selected

The live investigation contains the four source applications, but the live data does not contain a valid cross-system relationship graph:

- Codebeamer: present
- Configit: present
- SAP: present
- Windchill: present

The saved investigation is source-diverse, but the relationship layer is not cross-system materialized.

### Relationships selected

The live graph persists only same-application relationships:

- Codebeamer→Codebeamer: 62
- Configit→Configit: 40
- SAP→SAP: 92
- Windchill→Windchill: 15

No cross-application relationship survives canonical materialization.

### Why SAP accounting-document entities outranked Windchill entities

This is not a valid evidence-backed ranking of business relevance. It is a side effect of the live investigation content and the scoring behavior:

- The live investigation contains many more SAP records than Windchill records: the downloaded investigation includes a large SAP detail set (`sap-field`, `accounting-document`, `accounting-line`, etc.) while Windchill is a much smaller set.
- The ranking logic described in [sprint-1a5/reasoning-boundary-trace.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/reasoning-boundary-trace.md) is lexical and budget-driven, not relationship-graph-driven. It explicitly says: "Relationship relevance scores are used to order relationship contexts; they are not a pass/fail threshold. Since neither question produced a focal entity, `orderRelationshipsFromFocus` returned all ... relationship contexts."
- In other words, when there is no focal entity and no cross-system relation, the system can surface abundant SAP-adjacent detail items before Windchill entities, because the selection is driven by salience and data volume rather than a valid cross-system evidence chain.

This is a selection artifact, not substantive evidence of a real Windchill↔SAP technical relationship.

## 6) M2 analysis

Question: "What operational consequence follows from this Windchill part being represented as a SAP material?"

### Exists?

No valid live Windchill↔SAP relationship exists in the current investigation.

### Impact path?

No. Impact paths are zero.

### Impact chain?

No. Impact chains are zero.

### Why did the answer say there was insufficient evidence?

Because the evidence boundary is clear and consistent across the project docs and the live JSON:

- [m1-root-cause.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/m1-root-cause.md) says the live graph contains 209 canonical relationships and 0 ontology-resolved relationships; the reason is that the active live investigation does not contain a resolved cross-system relationship graph.
- [live-investigation-expectations.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/live-investigation-expectations.md) explicitly says the Windchill→SAP representation expectation is not met because there is no matching governed part/material identity evidence and no cross-system canonical pair.
- The live investigation metadata contains `confirmedCount: 0` under `metadata.universalRelationshipDiagnostics`, with the unresolved evaluation for `WC_PART_TO_SAP_MATERIAL` stating that no accepted deterministic linkage evidence was observed.
- The live investigation therefore cannot state a supported operational consequence without inventing a relationship that is absent from the graph.

## 7) Comparison: current live investigation vs Sprint 1 golden fixture

| Metric | Current live investigation | Sprint 1 golden fixture |
|---|---:|---:|
| Canonical relationship count | 209 | 3 (governed handshake canonical relationships) |
| Ontology-resolved relationship count | 0 | 3 available before budget, but not accepted by ontology evaluation in the fixture run |
| Impact-path count | 0 | 3 projected fallback paths before budget, all non-impact-eligible |
| Impact-chain count | 0 | 3 before budget, all removed by budget trimming |

Evidence:

- Current live investigation: [benchmark-live-validation.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/benchmark-live-validation.md), [canonical-relationship-analysis.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/canonical-relationship-analysis.md)
- Golden fixture: [materialization-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/materialization-proof.md), [impact-path-proof.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/impact-path-proof.md), [reasoning-boundary-trace.md](./OrchestrationPlatform/frontend/features/lattice-next/copilot/sprint-1a5/reasoning-boundary-trace.md)

The essential difference is not that the provider failed; it is that the live investigation never reached the required state for the benchmark question.

## 8) Root-cause classification

The evidence supports the following conclusions:

- A. Missing cross-system data — Proven
- B. Missing ontology resolution — Proven
- C. Missing impact-path generation — Proven
- D. Ranking/selection behavior — Secondary amplifier only, not the primary cause
- E. Investigation-content mismatch — Proven

### Why

- A and E are proven by the absent Windchill↔SAP canonical mapping and by the live saved investigation containing 209 same-application edges with no `CN-9001`/`MAT-200` fixture data.
- B is proven by the `0` resolved relationships and the ontology evaluator’s `evidence-not-found` / `no-compatible-endpoints` outcomes in the fixture and the unresolved evaluation state in the live data.
- C is proven because a resolved relationship graph is the prerequisite for impact paths and chains; the live graph has both at zero.
- D is not the primary root cause because the ranking layer does not create cross-system evidence; it only orders what exists. The minimum required condition is still absent.

## Final finding

Benchmark failure is not caused by a single provider/parser bug. The evidence shows the live investigation is missing the required cross-system canonical data and ontology resolution, which causes the downstream absence of impact paths and chains. The failure is therefore a data/materialization and benchmark-alignment problem first, with ranking and budget trimming acting as secondary effects.

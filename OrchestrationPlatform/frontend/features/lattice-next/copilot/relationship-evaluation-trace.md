# Sprint 1A.3 Relationship Evaluation Trace

## Live execution

The live knowledge graph reports ontology version `1.1.0`, five unresolved
evaluations, and zero resolved relationships. All five ontology definitions
were evaluated.

| Relationship candidate | Source candidates | Target candidates | Candidate pairs | Candidate type | Evaluated? | Rule applied | Accepted? | Rejection reason |
|---|---:|---:|---:|---|---|---|---|---|
| `WC_PART_TO_SAP_MATERIAL` | 2 Windchill parts | 1 SAP material | 2 | Governed application/kind pair | YES | `esi-material-publication`; `governed-enterprise-identity`; `governed-part-number` | NO | `evidence-not-found` |
| `WC_PART_TO_CONFIGIT_MODEL` | 2 Windchill parts | 4 Configit models | 8 | Governed application/kind pair | YES | `configit-component-reference`; `governed-product-context` | NO | `evidence-not-found` |
| `WC_PART_TO_CB_REQUIREMENT` | 2 Windchill parts | 10 Codebeamer requirements | 20 | Governed application/kind pair | YES | `codebeamer-oslc-trace`; `codebeamer-reference-field` | NO | `evidence-not-found` |
| `SAP_MATERIAL_TO_CONFIGIT_MODEL` | 1 SAP material | 4 Configit models | 4 | Governed application/kind pair | YES | `configit-model-membership`; `configit-sap-material-reference` | NO | `evidence-not-found` |
| `CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL` | 0 compatible Codebeamer sources | 4 Configit models | 0 | Governed application/kind pair | YES | `codebeamer-configit-model-code`; `governed-product-context` | NO | `no-compatible-endpoints` |

## Evaluation facts

- Candidate pairs considered: **34** across the five definitions.
- Accepted ontology relationships: **0**.
- Rejected due to missing governing evidence: **4 definitions / 34 candidate
  pairs**.
- Rejected before pair evaluation because no compatible source endpoint
  existed: **1 definition**.
- `universalRelationshipEvaluations`: **0** in the persisted live snapshot.
  The ontology graph nevertheless contains five `unresolvedEvaluations`, proving
  that the current ontology evaluator ran over the persisted canonical data.

## Finding

This is not a “candidates were never evaluated” result. The ontology evaluator
ran, generated candidate sets, and rejected all candidates because the live
entities did not provide the rule-specific evidence required to confirm a
relationship. No resolved relationship reached materialization because no
candidate was accepted.

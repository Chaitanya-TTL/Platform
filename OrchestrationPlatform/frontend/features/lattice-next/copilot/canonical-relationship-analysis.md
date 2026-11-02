# Sprint 1A.3 Canonical Relationship Analysis

## Live graph totals

- Canonical relationships: **209**
- Ontology-resolved relationships: **0**
- Impact paths: **0**

## Count by application pair

| Source application | Target application | Count |
|---|---|---:|
| Codebeamer | Codebeamer | 62 |
| Codebeamer | Windchill | 0 |
| Codebeamer | SAP | 0 |
| Codebeamer | Configit | 0 |
| Windchill | Codebeamer | 0 |
| Windchill | Windchill | 15 |
| Windchill | SAP | 0 |
| Windchill | Configit | 0 |
| SAP | Codebeamer | 0 |
| SAP | Windchill | 0 |
| SAP | SAP | 92 |
| SAP | Configit | 0 |
| Configit | Codebeamer | 0 |
| Configit | Windchill | 0 |
| Configit | SAP | 0 |
| Configit | Configit | 40 |

Total: `62 + 15 + 92 + 40 = 209`.

## Finding

No canonical relationship crosses an application boundary. Therefore the live
graph does not contain a cross-system canonical candidate that ontology
resolution could enrich. The ontology evaluator also confirms this through
rule-level `evidence-not-found` results, but canonical relationship generation
alone already proves that the 209 persisted relationships are same-system
relationships.

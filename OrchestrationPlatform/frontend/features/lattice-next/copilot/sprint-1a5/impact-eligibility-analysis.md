# Sprint 1A.5 Impact Eligibility Analysis

## Eligibility rule

Ontology-resolved relationships inherit `impactTraversal` from their
definition. When impact templates are configured, a path enters
`impactPaths` only if its ordered relationship-definition sequence exactly
matches a declared template. Canonical fallback relationships are emitted as
`POTENTIAL`, weak, and `impactTraversal: false`; they are not impact eligible.
An impact chain is materialized only for an eligible path whose endpoint
entities exist.

## Fixture relationship eligibility

| Relationship | Definition | `impactTraversal` | Matching template | Eligibility conclusion |
|---|---|---:|---|---|
| Windchill `part` → SAP `material-master` (`operationally-represented-as`) | `WC_PART_TO_SAP_MATERIAL` | `true` | `ENGINEERING_PART_TO_OPERATIONAL_MATERIAL` | Eligible when resolved; exact fixture path not runtime-verified. |
| Windchill `part` → Configit `product-context` (`configured-by`) | `WC_PART_TO_CONFIGIT_MODEL` | `true` | None for this single-definition path | Not admitted by the current template filter as a one-edge impact path. |
| Windchill `part` → Codebeamer `requirement` (`specified-by`) | `WC_PART_TO_CB_REQUIREMENT` | `true` | None for this single-definition path | Not admitted by the current template filter as a one-edge impact path. |
| SAP → Configit or Codebeamer requirement set → Configit | Corresponding definitions | `true` | `REQUIREMENT_TO_CONFIGURATION_MODEL` applies only to `CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL` | Fixture has no governed evidence or compatible requirement-set endpoint for these relationships. |

The ontology also declares
`REQUIREMENT_TO_ENGINEERING_TO_OPERATIONAL` for the ordered
`WC_PART_TO_CB_REQUIREMENT` then `WC_PART_TO_SAP_MATERIAL` sequence. That
multi-edge path requires both independently resolved edges.

## Evidence status

The evaluator and impact engine implement the above conditions. The
`impact-path-generation.test.ts` test covers a matching template path and
confirms unmatched canonical fallback paths do not enter `impactPaths`.
Tests were not executed in this continuation. No runtime path IDs, chain IDs,
or impact narratives are claimed here.

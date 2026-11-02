# Sprint 1A.2 T8 Verification

## Question

Could Windchill Change Notice `CN-9001` impact SAP material `MAT-200`?

## Identifier presence

| Identifier | Synthetic benchmark fixture | Active live investigation |
|---|---|---|
| `CN-9001` | Present in the synthetic T8 case as `wc:change-notice` | **Absent** |
| `MAT-200` | Present as `sap:material` | **Absent** |

## Verification

- The live saved investigation contains 239 entities across Codebeamer,
  Configit, SAP, and Windchill.
- The live entity selections include identifiers such as
  `OR:wt.part.WTPart:1717121`, `MAT7893`, `1190`, `1191`, `1194`, `1192`, and
  `305`, but not `CN-9001` or `MAT-200`.
- The synthetic T8 benchmark adds `CN-9001` and a `MAY_IMPACT` relationship to
  `MAT-200`, plus an unrelated lexical distractor relationship.
- The live Copilot therefore cannot select the requested entities by exact
  identifier or construct the requested impact analysis.

## Classification

**BENCHMARK DATA MISMATCH**

This is not classified as a Copilot entity-ranking failure for the active saved
investigation. T8 must be rerun against the intended seeded/synthetic data before
its live product behavior can be judged.

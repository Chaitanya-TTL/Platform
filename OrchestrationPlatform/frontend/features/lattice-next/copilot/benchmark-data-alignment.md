# Sprint 1A.2 Benchmark/Data Alignment

## Evidence sources

- Active saved investigation: `lattice-21d72fde-eb14-4d9b-8d9f-b4f2f91ed78a`,
  revision `1`.
- Synthetic validated fixture: `plm-brain-validated-fixture.ts`.
- Offline benchmark cases: `copilot/evals/cases.ts`.

## Alignment table

| Benchmark | Expected relationship or data | Fixture exists | Live exists | Resolved exists | Reasoning exists |
|---|---|---|---|---|---|
| E1 | Primary business entities across requirements, parts, materials, and configuration | Yes: four entities are defined across Windchill, SAP, Configit, and Codebeamer | Partially: all four applications and 239 entities are present, but live answer coverage is not equivalent to full fixture representation | No cross-system resolved relationship is required for the entity-list portion, but no resolved cross-system graph supports the broader expected context | Entity context exists; cross-system relationship context does not |
| M1 | Applications connected across the supported cross-system graph | Yes: the validated fixture materializes Windchill→SAP `operationally-represented-as`, Windchill→Configit `configured-by`, and Windchill→Codebeamer `specified-by` | No: live graph reports 0 ontology-resolved relationships | No | No resolved cross-system relationship reaches the reasoning package |
| M2 | Windchill part → `operationally-represented-as` → SAP material | Yes: fixture mapping `MAP-WC-SAP-001`; offline case adds the expected relationship | No: live graph has no resolved Windchill↔SAP relationship | No | No supported Windchill→SAP consequence can be narrated from live data |
| T8 | Change Notice `CN-9001` → potential impact → SAP material `MAT-200` | Yes in the synthetic T8 case: the case adds the change notice and `MAY_IMPACT` relationship | No: neither requested identifier exists in the live saved investigation | No | No entity-specific T8 reasoning can be produced from live data |

## Why the fixture and live data differ

The base validated fixture defines four entities, including:

- Windchill native ID `OR:wt.part.WTPart:9001`
- SAP native ID `MAT-200`
- Configit native ID `305`
- Codebeamer native ID `1190`

Its governed mappings define three cross-application relationships. The offline
M2 and T8 cases then create benchmark-specific relationship scenarios. The live
saved investigation instead contains 239 entities, 209 canonical relationships,
and zero ontology-resolved relationships; it does not contain the T8 identifiers.

## Conclusion

M1, M2, and T8 are not currently comparable live executions of the synthetic
benchmark fixture. E1 has a live entity-coverage mismatch rather than proof of a
prompting failure. The evidence package must keep these data/fixture mismatches
separate from genuine Copilot behavior defects.

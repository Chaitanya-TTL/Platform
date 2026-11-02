# Sprint 1A.3 Materialization Diff

## Fixture versus live

| Benchmark relationship | Fixture exists | Fixture resolved | Fixture materialized | Live exists | Live resolved | Live materialized |
|---|---|---|---|---|---|---|
| Windchill part → `operationally-represented-as` → SAP material | YES: `MAP-WC-SAP-001`, `OR:wt.part.WTPart:9001` → `MAT-200` | YES in the validated PLM Brain handshake and offline M2 relationship fixture | YES as a canonical governed relationship and as an ontology-compatible benchmark path | NO matching endpoint/evidence; no Windchill↔SAP canonical pair | NO | NO |
| Windchill part → `configured-by` → Configit model | YES: `MAP-WC-CONFIGIT-001`, `WC-100` → `305` | YES in the validated fixture | YES as a governed relationship | NO matching cross-system canonical pair | NO | NO |
| Windchill part → `specified-by` → Codebeamer requirement | YES: `MAP-WC-CB-001`, `OR:wt.part.WTPart:9001` → `1190` | YES in the validated fixture | YES as a governed relationship | NO matching cross-system canonical pair | NO | NO |
| Change Notice `CN-9001` → `MAY_IMPACT` → SAP material `MAT-200` | YES in synthetic T8 case | YES in the synthetic T8 scenario | YES in the benchmark case snapshot | NO: neither endpoint exists | NO | NO |

## Fixture evidence absent from live data

The validated fixture contains exact governed endpoint evidence:

- Windchill native ID `OR:wt.part.WTPart:9001`
- Windchill part number `WC-100`
- SAP preferred product ID `MAT-200`
- Configit work item ID `305`
- Codebeamer item ID `1190`
- Mapping records `MAP-WC-SAP-001`, `MAP-WC-CONFIGIT-001`, and
  `MAP-WC-CB-001`

The live investigation instead has a Windchill subject native ID
`OR:wt.part.WTPart:1717121`, SAP material `MAT7893`, Configit entities without
the fixture's governed linkage evidence, and Codebeamer requirements `1190`,
`1191`, `1192`, and `1194`. The shared numeric Codebeamer identifier does not
establish the fixture's governed relationship because the Windchill endpoint
and governing evidence are different.

## Finding

The fixture has explicit relationship evidence and the live investigation does
not. The missing boundary is live investigation data/evidence, not a dropped
resolved relationship during context construction.

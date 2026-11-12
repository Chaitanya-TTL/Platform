# Sprint 1A.4 Materialization Proof

## Execution method

A temporary Vitest evidence harness ran the existing validated fixture through
the existing `enrichInvestigationWithValidatedRelationships`,
`enrichInvestigationWithOntology`, `buildInvestigationContext`, and
`engineeringPromptPayload` functions. The temporary harness was removed after
the run. No production code or persistent investigation was changed.

The existing governed handshake tests also passed: 3 tests in
`plm-brain-governed-handshake.test.ts`.

## Stage trace

| Stage | Input | Output | Evidence |
|---|---:|---:|---|
| Raw fixture entities | 4 entities | 4 entities retained | Fixture entity IDs `wc:part`, `sap:material`, `configit:model`, `cb:req` |
| Identity resolution | 4 entities | 0 identity clusters | Fixture's `identityClusters` is empty; mapping resolution uses exact mapping endpoints instead |
| Governed mappings | 3 enabled mappings | 3 mappings evaluated | Each mapping passes exact endpoint value and mapping validation |
| PLM Brain handshake | 4 entities + 3 mapping records | 3 validated relationships + 3 evidence records | `validation.status=valid`; mapping reference `PLM-RELATIONSHIP-BIBLE-V1` |
| Canonical relationship list | 3 handshake relationships | 3 cross-application canonical relationships | Windchillâ†’SAP, Windchillâ†’Configit, Windchillâ†’Codebeamer |
| Lattice ontology evaluation | 3 cross-app canonical relationships + 5 ontology definitions | 0 resolved, 5 unresolved | `WC_PART_TO_SAP_MATERIAL` and `WC_PART_TO_CB_REQUIREMENT`: `evidence-not-found`; other 3 definitions: `no-compatible-endpoints` |
| Graph path generation | 0 resolved + 3 canonical relationships | 3 cross-system `POTENTIAL` paths | Paths derive from canonical fallback edges; they are not resolved ontology relationships |
| Impact path generation | 0 impact-eligible resolved relationships | 0 impact paths, 0 impact chains | Canonical fallback edges are not impact-traversable |

## Materialized relationship IDs

| Relationship ID | Type | Source â†’ target | Mapping evidence |
|---|---|---|---|
| `plm-rel:map-wc-sap-001:wc:part:sap:material` | `operationally-represented-as` | Windchill `wc:part` â†’ SAP `sap:material` | `plm-evidence:map-wc-sap-001:wc:part:sap:material` |
| `plm-rel:map-wc-configit-001:wc:part:configit:model` | `configured-by` | Windchill `wc:part` â†’ Configit `configit:model` | `plm-evidence:map-wc-configit-001:wc:part:configit:model` |
| `plm-rel:map-wc-cb-001:wc:part:cb:req` | `specified-by` | Windchill `wc:part` â†’ Codebeamer `cb:req` | `plm-evidence:map-wc-cb-001:wc:part:cb:req` |

## Windchill-to-SAP detail

The handshake accepted the mapping because it found exactly one source and
target matching the governed mapping endpoints:

- Source: `provenance.nativeId = OR:wt.part.WTPart:9001`
- Target: `properties.preferredProductId = MAT-200`
- Mapping: `MAP-WC-SAP-001`
- Verification: `domain-owner-confirmed`, reference
  `PLM-RELATIONSHIP-BIBLE-V1`

The subsequent ontology evaluator did not accept the same pair. Its applicable
rules require `esiMaterialNumber`/`materialNumber`, `partNumber`/`materialNumber`,
or matching `enterpriseIdentity`. Those ontology fields are absent or do not
match in this fixture. The ontology result for `WC_PART_TO_SAP_MATERIAL` is
therefore `evidence-not-found`.

## Persistence boundary

The test demonstrates materialization into the returned enriched investigation
object (`plmBrain.relationships` and canonical `relationships`). It does not
demonstrate a durable database write or persistence into the running local
investigation.

## Result

**PLM Brain governed handshake materialization: PASS.**
**Full ontology-resolved materialization: FAIL.**
The first failed transition is from governed canonical relationship to
ontology-resolved relationship.

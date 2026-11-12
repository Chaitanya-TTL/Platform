# Sprint 1A.4 Ontology Evidence Matrix

## Rule-level requirements

The table reflects the ontology block in `docs/relationships.md`, parsed by the
active Lattice relationship ontology parser. Evidence rules are exact property
matches; application co-occurrence, names, and a separate mapping record do not
automatically satisfy them.

| Rule | Required source endpoint | Required target endpoint | Required evidence fields | Observed fixture evidence | Ontology outcome |
|---|---|---|---|---|---|
| `WC_PART_TO_SAP_MATERIAL` | Windchill kind `part`, `component`, `assembly`, `part-occurrence`, or `source-representation` | SAP kind `material`, `material-master`, or `source-representation` | `esiMaterialNumber` = `materialNumber`; or `partNumber` = `materialNumber`; or `enterpriseIdentity` = `enterpriseIdentity` | Fixture has source `provenance.nativeId=OR:wt.part.WTPart:9001`, `partNumber=WC-100`; target `preferredProductId=MAT-200`; no `esiMaterialNumber`, target `materialNumber`, or matching enterprise identity | Candidate endpoint exists; `evidence-not-found` |
| `WC_PART_TO_CONFIGIT_MODEL` | Windchill part/component/assembly/part-occurrence/source-representation | Configit kind `work-item`, `product-model`, `configuration-family`, or `source-representation` | Source `partNumber` in target `plmComponentReferences`; or equal `productContextId` values | Fixture's Configit kind is `product-context` (not an allowed ontology target kind); it has `workItemId=305`, not `plmComponentReferences` or `productContextId` | `no-compatible-endpoints` |
| `WC_PART_TO_CB_REQUIREMENT` | Windchill part/component/assembly/part-occurrence/source-representation | Codebeamer requirement/requirement-set/requirement-group/source-representation | Source `windchillResourceUri` in target `oslcTraceLinkTargetUris` or `externalReferences` | Fixture has source native ID, target `itemId=1190`; no `windchillResourceUri`, OSLC URI list, or external reference list | Candidate endpoint exists; `evidence-not-found` |
| `SAP_MATERIAL_TO_CONFIGIT_MODEL` | SAP kind `material` or `source-representation` | Configit kind `work-item`, `product-model`, or `source-representation` | Source `materialNumber` in target `sapMaterialReferences` or `materialMembership` | SAP fixture kind is `material-master`; Configit kind is `product-context`; required properties are absent | `no-compatible-endpoints` |
| `CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL` | Codebeamer kind `requirement-set` or `requirement-group` | Configit kind `work-item`, `product-model`, or `source-representation` | Source `configitModelCode` = target `productModelCode`; or equal `productContextId` values | Codebeamer fixture kind is `requirement`; Configit kind is `product-context`; no required matching fields | `no-compatible-endpoints` |

## Separate governed-mapping contract

The PLM Brain handshake successfully validates different, explicit mapping
fields:

- Windchill native ID → SAP `preferredProductId`.
- Windchill `partNumber` → Configit `workItemId`.
- Windchill native ID → Codebeamer `itemId`.

The resulting `plmBrain` relationships are added to canonical
`relationships`, but the ontology evaluator independently checks the fields in
the first table. It does not accept the PLM Brain mapping evidence as a
substitute for its own `sourcePath`/`targetPath` rule match.

## Finding

The existing fixture proves a mismatch between two evidence contracts. The
governed mapping handshake accepts the fixture's verified fields; the Lattice
ontology resolver does not consume those mapping records or map their evidence
paths to ontology rules. Thus a validated handshake relationship is not an
ontology-resolved relationship.

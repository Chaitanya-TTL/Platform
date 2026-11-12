# Sprint 1A.5 Ontology Contract Alignment

## Contract comparison

| Ontology rule | Current property evidence | Governed fixture evidence | Endpoint compatibility | Gap and adapter behavior |
|---|---|---|---|---|
| `WC_PART_TO_SAP_MATERIAL` | `esiMaterialNumber -> materialNumber`; `partNumber -> materialNumber`; or `enterpriseIdentity -> enterpriseIdentity` | Windchill `provenance.nativeId=OR:wt.part.WTPart:9001`; SAP `properties.preferredProductId=MAT-200` | `part -> material-master` is declared | Property names/values do not satisfy the existing rules. The governed-mapping rule adapts only the exact validated handshake pair and records both original fields and values. |
| `WC_PART_TO_CONFIGIT_MODEL` | `partNumber -> plmComponentReferences` or `productContextId -> productContextId` | Windchill `properties.partNumber=WC-100`; Configit `properties.workItemId=305` | `part -> product-context` is not declared (`product-context` is not among the ontology target kinds) | Both property and endpoint-kind mismatch. The adapter permits the exact endpoint pair only when its confirmed governed handshake is present and validated. |
| `WC_PART_TO_CB_REQUIREMENT` | `windchillResourceUri -> oslcTraceLinkTargetUris` or `externalReferences` | Windchill `provenance.nativeId=OR:wt.part.WTPart:9001`; Codebeamer `properties.itemId=1190` | `part -> requirement` is declared | The fixture fields differ from both URI evidence rules. The adapter retains the exact handshake source/target paths and values. |
| `SAP_MATERIAL_TO_CONFIGIT_MODEL` | `materialNumber -> sapMaterialReferences` or `materialMembership` | No SAP-to-Configit governed mapping exists in the validated fixture | `material-master -> product-context` is not declared | No compatible governed evidence exists in the fixture. The adapter does not generate this relationship. |
| `CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL` | `configitModelCode -> productModelCode` or `productContextId -> productContextId` | No Codebeamer-requirement-set-to-Configit governed mapping exists in the validated fixture | The fixture has a Codebeamer `requirement`, not a `requirement-set` or `requirement-group`; Configit is `product-context`, not a declared target kind | No compatible governed evidence or endpoint pair exists in the fixture. The adapter does not generate this relationship. |

## Governed evidence contract

The ontology now declares `validated-governed-mapping` for each of the five
rules. The evaluator uses it only through the PLM Brain adapter; it is not a
generic property shortcut. The adapter requires:

- a confirmed, strong PLM Brain relationship whose type matches the ontology rule;
- a matching mapping ID and handshake evidence record;
- one of the supported verification bases (`domain-owner-confirmed`,
  `source-explicit`, or `integration-contract`), plus mapping reference,
  verifier, and verification time;
- exact source and target entity IDs and applications from the handshake;
- source and target values reread from their original entity fields and equal
  to the handshake-recorded values.

Each adapted observation preserves its original source path and value, plus
mapping ID, mapping reference, verification basis, handshake evidence ID,
ontology rule ID, and ontology field. The `plmBrain.mappingId` fields are
virtual ontology evidence fields, not fabricated entity properties.

The current fixture exercises the three Windchill relationships only.
Compatibility for the SAP-to-Configit and Codebeamer-requirement-set-to-Configit
rules remains unproven because the fixture contains no corresponding governed
mapping evidence.

## Validation status

The contract and adapter implementation are present. The ontology-resolution
test was authored but not executed; acceptance is therefore **not yet
verified**.

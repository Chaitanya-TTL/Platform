# Source Evidence Verification Plan

## Objective and constraints

Determine whether Sprint 1A.8 should be classified as extraction work,
mapping work, or source-data work by checking the source records behind the
current live investigation.

This is a read-only verification plan. It does not change extractors,
ontology rules, or mappings. The saved investigation is the evidence baseline.
It proves which values reached the live investigation, but it does not by
itself prove what upstream APIs currently contain or what the deployed
extractors request.

## Summary

| Rule | Proven in current investigation | Not proven | Current classification |
|---|---|---|---|
| `WC_PART_TO_SAP_MATERIAL` | Windchill `partNumber = 0000003874` and SAP `materialNumber = MAT7893` reached the evaluator; they differ. | Whether Windchill/ESI has an SAP material number, whether both systems expose a shared enterprise identity, or whether a validated PLM Brain mapping already exists. | **Undetermined.** Extraction if an authoritative matching source field exists but was not loaded; mapping if the source records lack a direct match but an approved mapping is needed; source-data work if no authoritative association exists. |
| `WC_PART_TO_CONFIGIT_MODEL` | Windchill `partNumber = 0000003874` and Configit candidate `configit:subject:305` reached the investigation; Configit has `preferredProductId = 305`. | Whether Configit has a part reference or shared product context and whether the source adapter retrieves either. | **Undetermined.** Same evidence-gated classification: extraction if present upstream; mapping only for an existing governed association; source-data work if no authoritative link exists. |
| `WC_PART_TO_CB_REQUIREMENT` | Windchill part and Codebeamer requirement candidates reached the investigation. Saved Codebeamer enrichment failed because `CODEBEAMER_BASE_URL` was required; item/relation/attachment enrichment counts were zero. | Whether Windchill has a canonical resource URI and whether Codebeamer has an OSLC trace or external reference to it. | **Undetermined, with a known retrieval/configuration gap.** First restore read access and verify source records. Classify as extraction if the links exist upstream but were not retrieved; source-data work if no link exists. Mapping is an alternative only if an approved mapping already exists. |

**Conclusion:** the current evidence does not justify declaring Sprint 1A.8
solely extraction, mapping, or source-data work. The deciding facts are upstream
field/link existence. For Codebeamer, the saved run additionally proves that
the requested enrichment did not complete.

## Verification conventions

- “Present” below means observed in the saved investigation, not merely
  expected by the ontology.
- “Absent” means the value/property was not observed in the saved
  investigation. It does **not** assert that the source system lacks it.
- “Unknown” means the source-side value or deployed API/extractor behavior
  cannot be determined from the saved investigation.
- Ontology property names are the exact normalized property names consumed by
  the rules. Their exact upstream API names, entity sets, and physical table
  names are **not established by the saved investigation**. Do not treat
  normalized names as proof of source schema names.
- Before querying, use the deployed service's API metadata/schema or vendor
  documentation for that exact version to resolve the real route, entity set,
  and source attribute. The query sketches below deliberately avoid inventing
  routes or database tables.

## 1. `WC_PART_TO_SAP_MATERIAL`

### Exact evidence fields

The rule accepts any evidence branch below:

1. Windchill/ESI `esiMaterialNumber` equals SAP `materialNumber`.
2. Windchill `partNumber` equals SAP `materialNumber`.
3. Windchill `enterpriseIdentity` equals SAP `enterpriseIdentity`.
4. A validated governed PLM Brain mapping, subject to the relationship
   bible's provenance, verification, endpoint, relationship-type, and source
   attribute reread checks.

| Field | Owning source | Current investigation status | Source API/entity/attribute/table |
|---|---|---|---|
| `partNumber` (`0000003874`) | Windchill | **Present** in candidate identity evidence. | Source route and raw attribute name **unknown** from the snapshot. Candidate is a Windchill part/WTPart record; inspect the deployed Windchill API metadata for its part-number property. |
| `esiMaterialNumber` | Windchill / ESI publication | **Absent** from the observed candidate evidence; upstream status **unknown**. | Expected on the Windchill ESI material-publication/source record associated with the part. Exact service, entity set, raw attribute, or table **unknown**. |
| `materialNumber` (`MAT7893`) | SAP | **Present** on the SAP material candidate. | Source route and raw attribute name **unknown** from the snapshot. Candidate is SAP material `MAT7893`; inspect the configured SAP API/schema for its material entity and property. |
| `enterpriseIdentity` on both endpoints | Windchill and SAP | **Absent** from observed candidate evidence; upstream status **unknown**. | Exact source entities, property names, and tables **unknown**. Verify only if the respective source schemas expose an authoritative shared identity. |
| Validated `plmBrain.mappingId` evidence | PLM Brain governance/evidence adapter | **Absent** from the live evaluation evidence; whether a governed record exists elsewhere is **unknown**. | The relationship bible requires provenance-preserving mapping evidence; the saved investigation does not identify a backing table/API. Do not create or alter a mapping during this verification. |

The observed `partNumber` and `materialNumber` values do not match. Their
presence alone does not satisfy this rule.

### Smallest read-only source queries

1. **Windchill:** resolve the part record for number `0000003874` using the
   deployed Windchill service's metadata to identify its actual part entity and
   number attribute. Read only that record, its canonical resource URI, any
   ESI material-publication number, and any enterprise identity. If the ESI
   value is on a related publication object, follow only that documented
   relation and retrieve the one related record.
2. **SAP:** read material `MAT7893` using the configured SAP material API or
   query interface. Return only the material number and any authoritative
   enterprise identity or source cross-reference that identifies its
   Windchill part.
3. **PLM Brain, only if needed:** read-only lookup for an existing confirmed
   mapping whose endpoints are this Windchill part and SAP material and whose
   relationship type is `operationally-represented-as`. Verify required
   metadata and source-attribute reread evidence; a mapping ID alone is not
   sufficient.

These are record-level query requirements, not verified endpoint URLs or SQL
table names. Exact routes/schema must be confirmed against the deployed source
interfaces before executing.

### Decision after verification

- If Windchill/ESI already returns a value equal to `MAT7893`, but that value
  was not passed into the live investigation, classify the gap as **extraction
  work**.
- If an authoritative shared enterprise identity already exists in both
  records but was not loaded, classify as **extraction work**.
- If source identifiers do not match but an approved governed association is
  required and no association currently exists, classify as **mapping work**
  (subject to separate authorization; no mapping change is part of this plan).
- If neither source has a direct identity/reference and no authoritative
  association exists, classify as **source-data work**.

## 2. `WC_PART_TO_CONFIGIT_MODEL`

### Exact evidence fields

The rule accepts:

1. Windchill `partNumber` exactly present as an element in Configit's
   `plmComponentReferences` list.
2. Equal Windchill and Configit `productContextId` values.
3. A validated governed PLM Brain mapping satisfying the relationship
   bible's checks.

| Field | Owning source | Current investigation status | Source API/entity/attribute/table |
|---|---|---|---|
| Windchill `partNumber` (`0000003874`) | Windchill | **Present** in candidate identity evidence. | Raw API name/entity set **unknown** from the snapshot; candidate is the Windchill part record. |
| Configit `plmComponentReferences` containing `0000003874` | Configit | **Absent** from the observed Configit candidate; upstream status **unknown**. | Expected on the Configit model/product subject represented by candidate `configit:subject:305`; exact API, entity, raw attribute, or table **unknown**. |
| Windchill `productContextId` | Windchill | **Absent** from observed candidate evidence; upstream status **unknown**. | Exact part entity/property name **unknown** from the snapshot. |
| Configit `productContextId` | Configit | **Absent** from observed candidate evidence. `preferredProductId = 305` is present but is not this evidence field. Upstream status **unknown**. | Expected on the Configit model/product subject; exact API, raw attribute, and table **unknown**. |
| Validated `plmBrain.mappingId` evidence | PLM Brain governance/evidence adapter | **Absent** from the live evaluation evidence; existence elsewhere **unknown**. | Backing API/table is not identified by the saved investigation. No mapping changes are authorized here. |

### Smallest read-only source queries

1. **Windchill:** read part `0000003874` and return its actual product-context
   identifier, if exposed, plus the source record identifier needed to match
   the Configit subject.
2. **Configit:** read only the model/product subject corresponding to
   `preferredProductId = 305`. Return `plmComponentReferences` and
   `productContextId` if the source schema exposes them. Check for the exact
   value `0000003874` in the reference list or an exact context value match
   with Windchill.
3. **PLM Brain, only if needed:** read-only lookup for an already validated
   mapping between the candidate endpoints with type `configured-by`.

The snapshot does not establish Configit's endpoint route, entity/table name,
or source attribute spelling. Resolve these against the deployed Configit
API/schema; do not assume `preferredProductId` is the product-context field.

### Decision after verification

- If Configit already contains `0000003874` in its explicit PLM reference list,
  or both systems expose the same governed context, but the live investigation
  lacks it, classify as **extraction work**.
- If a governed association is the only supported source of the linkage,
  classify as **mapping work** only after verifying an authorized existing
  mapping or obtaining approval for a new one.
- If the Configit model has neither reference nor shared context and there is
  no governed association, classify as **source-data work**.

## 3. `WC_PART_TO_CB_REQUIREMENT`

### Exact evidence fields

The rule accepts:

1. Windchill `windchillResourceUri` exactly present in the Codebeamer
   requirement's `oslcTraceLinkTargetUris` list.
2. Windchill `windchillResourceUri` exactly present in the Codebeamer
   requirement's `externalReferences` list.
3. A validated governed PLM Brain mapping satisfying the relationship
   bible's checks.

| Field | Owning source | Current investigation status | Source API/entity/attribute/table |
|---|---|---|---|
| Windchill `windchillResourceUri` for part `0000003874` | Windchill | **Absent** from observed evidence; upstream status **unknown**. | Expected as the canonical URI of the Windchill part resource. Exact API route, URI format, raw property, or table is **unknown** from the snapshot. |
| Codebeamer `oslcTraceLinkTargetUris` containing that URI | Codebeamer | **Absent** from the saved candidate evidence. Source status is **unknown** because relation enrichment failed. | Expected on a Codebeamer requirement/trace relation associated with candidate items such as item `1190` (project `9`, tracker `9734`). Exact API route/entity/raw field/table is **unknown** from the snapshot. |
| Codebeamer `externalReferences` containing that URI | Codebeamer | **Absent** from the saved candidate evidence. Source status is **unknown** because item enrichment failed. | Expected on the Codebeamer requirement item, e.g. item `1190`; exact API route/entity/raw field/table is **unknown** from the snapshot. |
| Validated `plmBrain.mappingId` evidence | PLM Brain governance/evidence adapter | **Absent** from the live evaluation evidence; existence elsewhere **unknown**. | Backing API/table is not identified in the saved investigation. No mapping changes are authorized here. |

### Smallest read-only source queries

1. **Windchill:** resolve part `0000003874` and return its canonical resource
   URI (the URI used by the source's trace protocol). Do not synthesize a URI
   from its number.
2. **Codebeamer:** after read access is configured, read the identified
   Steering requirement items, beginning with item `1190` in project `9` and
   tracker `9734`. Retrieve only OSLC trace relations/target URIs and external
   reference values. Compare each returned target/reference URI byte-for-byte
   with Windchill's canonical resource URI. If `1190` has no link, query the
   other identified candidates `1191`, `1192`, and `1194`.
3. **PLM Brain, only if needed:** read-only lookup for an existing validated
   mapping between the Windchill part and the specific Codebeamer requirement
   with type `specified-by`.

The saved record reports that Codebeamer enrichment failed with
`CODEBEAMER_BASE_URL is required`, with zero item and relation evidence
retrieved. Therefore a missing trace field in that snapshot is **not evidence
that Codebeamer lacks the source link**. The precise REST/OSLC route and raw
attribute names must be confirmed from the deployed Codebeamer API/schema.

### Decision after verification

- If a matching OSLC target or external reference exists upstream but was not
  retrieved, classify as **extraction/access-configuration work**.
- If no trace exists but an approved governed association already exists,
  classify as **mapping work** only after separately validating that evidence.
- If neither a trace nor a governed association exists, classify as
  **source-data work** (establish the source-owned trace/reference through
  the appropriate governance process).

## Sprint 1A.8 classification gate

Do not assign a single work category until the read-only source queries return
results:

| Verification result | Classification |
|---|---|
| Required source value/link exists, but the saved investigation lacks it | **Extraction work** (or access/configuration work where retrieval failed, as with Codebeamer). |
| No direct source identity/link exists, but a valid governed association exists or is the approved mechanism to establish one | **Mapping work**. This plan only verifies; it does not create or alter mappings. |
| Neither direct source evidence nor a valid governed association exists | **Source-data work**. |
| Source query cannot be run or schema/credentials are unavailable | **Unresolved**; do not label it extraction or source-data work by inference. |

## Evidence basis

- The saved live investigation and counts are summarized in
  [`current-investigation-gap-analysis.md`](./current-investigation-gap-analysis.md).
- Exact relationship evidence operators and normalized property paths are
  specified in
  [`OrchestrationPlatform/docs/relationships.md`](./OrchestrationPlatform/docs/relationships.md).
- The live candidate snapshot is
  [`OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json`](./OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json).

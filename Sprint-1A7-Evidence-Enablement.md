# Sprint 1A.7 — Source Evidence Enablement

## Objective and scope

Determine whether evidence for the three approved Windchill cross-system
relationships is already present in source-side artifacts and whether the
current extractors retrieve it. The target outcome is the **first live
ontology-resolved relationship**, not a change to generated answers.

This is a read-only investigation. No source APIs were called during this
review, and no extractor, ontology, or mapping was changed. Findings come
from the saved live investigation, local source-extraction artifacts, and the
current source adapter/extractor code. A dated local artifact is not a
substitute for a current source-system query.

## Executive result

| Rule | Strongest source-side finding | Evidence classification | Present work category |
|---|---|---|---|
| `WC_PART_TO_SAP_MATERIAL` | SAP material `MAT7893` / “Steering” exists in a SAP catalog artifact generated 2026-10-19. Windchill `partNumber` `0000003874` is present in the live investigation, but differs from SAP `materialNumber` `MAT7893`. The inspected Windchill extractor retrieves part numbers but has no ESI material-publication field or query. | SAP material: **present in dated extracted artifact**. A Windchill ESI material number, shared enterprise identity, or governed mapping: **unknown**. | **Extraction gap confirmed; source value unknown.** If the Windchill ESI source exposes `MAT7893`, this is extraction work. If it does not, source-data or governed-mapping work remains undecided. |
| `WC_PART_TO_CONFIGIT_MODEL` | Candidate `configit:subject:305` / “Steering” is in the live investigation with `preferredProductId=305`. Existing Configit code can read product-model detail, but its normalized BOM keeps only IDs, names, and quantity; no component-reference or product-context field is exposed. Local Configit BOM artifact is a Screwjack sample, not the live candidate. | `plmComponentReferences` and matching `productContextId`: **not in live snapshot; upstream unknown**. | **Extraction gap confirmed; source value unknown.** Source query is needed before classifying the relationship as extraction, mapping, or source-data work. |
| `WC_PART_TO_CB_REQUIREMENT` | Candidates 1190, 1191, 1192, 1194 exist. The saved live enrichment failed because `CODEBEAMER_BASE_URL` was required. A separate archived harvest has zero upstream/downstream references and zero incoming/outgoing associations for all four items; each archived item has zero custom fields. | No link in that historical harvest; **current source status unknown**. The live retrieval itself failed. | **Extraction/access-configuration work confirmed** to obtain current evidence. Historical data suggests source-data work may also be needed, but is insufficient to classify current source state conclusively. |

### Overall determination

There is **one confirmed extraction gap for each rule**: the evidence
properties required by the ontology are not present in the live investigation,
and the inspected extraction paths either do not retrieve them or failed to
retrieve them. This does **not** prove that the Windchill ESI number or
Configit link does not exist upstream.

The strongest evidence of absent source linkage is the archived Codebeamer
harvest: no relations/associations or custom fields were present for any of
the four candidate requirements. Because it is a historical artifact and the
current live enrichment failed, verify Codebeamer again before declaring
source-data work.

**Sprint 1A.7 cannot yet be classified exclusively as extraction, mapping, or
source-data work.** Run the small read-only checks below. If a valid source
field/link exists but was not passed through, classify as extraction work. If
no source linkage exists but a governed relationship is the approved evidence
mechanism, classify as mapping work. If neither source linkage nor an
authorized governed mapping exists, classify as source-data work.

## Evidence and status terminology

- **Present**: observed on the current live candidate or in a cited extracted
  artifact.
- **Absent from live snapshot**: the property/value was not observed on the
  live candidate. This is not a claim that the source lacks it.
- **Absent in archived harvest**: the dated archived source output contains
  no such value/relation. This is historical evidence only.
- **Unknown**: no current source API result establishes existence or absence.
- **Extractor does not retrieve**: confirmed by inspection of the current
  relevant extraction code; this does not prove upstream field absence.

The ontology's normalized property paths are authoritative for evaluation.
They need not be the same as the raw names in source APIs.

## Rule 1 — `WC_PART_TO_SAP_MATERIAL`

### A. Required ontology evidence

The rule resolves from any accepted branch:

1. Windchill `esiMaterialNumber` exactly equals SAP `materialNumber`.
2. Windchill `partNumber` exactly equals SAP `materialNumber`.
3. Windchill `enterpriseIdentity` exactly equals SAP `enterpriseIdentity`.
4. A validated governed PLM Brain mapping with the required mapping
   reference, verification basis, verifier metadata, matching endpoints and
   relationship type, and reread source attributes.

### B–D. Current evidence, gap, ownership, and retrieval

| Field / evidence | Owner | Current status | Extractor retrieval finding |
|---|---|---|---|
| Windchill `partNumber` = `0000003874` | Windchill | **Present** in the live candidate identity evidence. | The inspected Windchill Python extractor searches `GET /Windchill/servlet/odata/ProdMgmt/Parts` using the source property `Number` and maps returned `Number` to `number`. Structure normalization also maps `PartNumber` to `partNumber`. It retrieves the part number, but not the needed SAP link. |
| SAP `materialNumber` = `MAT7893` | SAP | **Present** in the live candidate. Also present as `materialId` and `internalMaterialId` in the SAP catalog artifact generated `2026-10-19T08:41:02Z` for “Steering”. | SAP extraction is already retrieving the material identity. The Java catalog extractor calls `BAPI_MATERIAL_GETLIST`; its description path reads `MAKT` fields `MATNR`, `SPRAS`, `MAKTX` and enriches from `MARA`. Its output's material number is mapped into the candidate. |
| Exact scalar match `partNumber == materialNumber` | Windchill + SAP | **Present values, but not a match**: `0000003874` ≠ `MAT7893`. | No extractor change can make these distinct identifiers equal without new authoritative evidence. |
| Windchill `esiMaterialNumber` | Windchill / ESI publication | **Absent from live evidence; upstream unknown.** | The inspected Windchill search/structure extraction contains no `esiMaterialNumber`, ESI publication lookup, or equivalent ESI field mapping. |
| Shared `enterpriseIdentity` | Windchill + SAP | **Absent from live candidate evidence; upstream unknown.** | No such field was found in the inspected source extraction paths/artifacts. |
| Validated `plmBrain.mappingId` evidence | PLM Brain governance | **Absent from live evaluation evidence; existence elsewhere unknown.** | No matching governed mapping was evidenced in this investigation. This is governed evidence, not a Windchill or SAP source field. |

**Important source-artifact distinction:** the local SAP catalog proves that
the SAP material number was extracted in October. The local Windchill
requirements test artifact is for part `0000003865`, not the live candidate
`0000003874`; its `Material: Mild Steel` property is a material description,
not an SAP material number or ESI publication identifier. It cannot prove the
Windchill-to-SAP association for part `0000003874`.

### E. Smallest source verification

1. **Windchill:** using the deployed Windchill OData metadata, read the
   `Parts` record with `Number eq '0000003874'`. The inspected extractor's
   search route is
   `/Windchill/servlet/odata/ProdMgmt/Parts`. Check the part's canonical
   resource identifier and whether it has a documented related ESI
   material-publication record. If one exists, read only that record's
   material number and compare it exactly with `MAT7893`.
   - The precise ESI entity set/navigation property is **not present in the
     inspected extractor code**; resolve it from this Windchill instance's
     OData metadata or ESI service documentation rather than guessing a route.
2. **SAP:** the existing local artifact already identifies `MAT7893` in
   `S4H`, client `800`; for a current check, run the existing catalog
   material-number query for `MAT7893` or inspect the corresponding material
   record through the configured SAP interface. The current SAP extractor
   verifies the material number but does not expose a Windchill cross-reference
   field.
3. **Governed mapping, only if the direct ESI match is absent:** read-only
   lookup for an already confirmed `operationally-represented-as` mapping
   between this exact Windchill part and SAP material. Do not create a mapping
   as part of verification.

### F. Enablement classification and impact

- **Extraction Work — confirmed gap, conditional source field:** the inspected
  Windchill extraction does not retrieve `esiMaterialNumber`. If the source
  query finds an ESI publication value equal to `MAT7893`, the minimum
  enablement is to retrieve that one value and preserve it on the Windchill
  candidate in the ontology's expected property.
- **Mapping Work — not established:** use only if an approved mapping already
  exists or is separately authorized and validated. No mapping is evidenced
  here.
- **Source Data Work — not established:** required if neither an ESI match nor
  another authoritative source relationship exists.
- **Expected ontology impact:** one resolved
  `operationally-represented-as` edge; the rule is impact-traversable and
  directly matches the benchmark's Windchill-part/SAP-material question.

## Rule 2 — `WC_PART_TO_CONFIGIT_MODEL`

### A. Required ontology evidence

The rule resolves from any accepted branch:

1. Windchill `partNumber` exactly equals one element of Configit
   `plmComponentReferences`.
2. Windchill and Configit `productContextId` values exactly match.
3. A validated governed PLM Brain mapping satisfying the relationship
   bible's evidence checks.

### B–D. Current evidence, gap, ownership, and retrieval

| Field / evidence | Owner | Current status | Extractor retrieval finding |
|---|---|---|---|
| Windchill `partNumber` = `0000003874` | Windchill | **Present** in live candidate identity evidence. | Retrieved as described under SAP. |
| Configit candidate `configit:subject:305`, `preferredProductId=305` | Configit | **Present** in live investigation. | This is an identifier, not either accepted relationship evidence field. |
| Configit `plmComponentReferences` containing `0000003874` | Configit | **Absent from live candidate; upstream unknown.** | The inspected Configit normalizer retains node ID/name and quantity only. No `plmComponentReferences` mapping was found. |
| Windchill `productContextId` | Windchill | **Absent from live candidate; upstream unknown.** | Not retrieved by the inspected part/structure normalization. |
| Configit `productContextId` | Configit | **Absent from live candidate; upstream unknown.** | The extractor's product-model summary selects code, description, brand code, arithmetic-rule flag, and language metadata; it does not expose this ontology field. |
| Validated `plmBrain.mappingId` evidence | PLM Brain governance | **Absent from live evaluation evidence; elsewhere unknown.** | No matching governed mapping was evidenced. |

The local `configit_extractor/configit_extraction.json` is a Screwjack package
sample generated `2026-08-21`, not the live Steering subject. It does not
verify whether the source record for Configit candidate `305` has a
Windchill-reference list or shared context.

### E. Smallest source verification

Use the existing Configit Model API flow, without running a solve:

1. Resolve the Steering work item through
   `GET /api/v1/wi?limit=...&offset=...` and identify its unique work-item ID.
2. Read its product-model collection:
   `GET /api/v1/wi/{workItemId}/products/productmodels`.
3. Read the one matching model's detail:
   `GET /api/v1/wi/{workItemId}/products/productmodels/{modelCode}`.
4. Inspect the returned source JSON for an explicit component reference equal
   to `0000003874` and for the source's governed product-context identifier.
   Separately read the Windchill part's product context from its documented
   source property and compare exact values.

These are route patterns used by the inspected extractor. The Configit source
payload schema's raw property names for PLM references and context are not
established by the saved live investigation. Do not assume `preferredProductId`
is `productContextId`.

### F. Enablement classification and impact

- **Extraction Work — confirmed gap, conditional source fields:** the current
  Configit normalization does not expose the reference/context fields. If the
  Model API detail response contains either accepted value, add only that
  source field to the evidence passed through to the investigation.
- **Mapping Work — not established:** only if no direct source reference is
  available and a separately approved governed mapping is the chosen evidence.
- **Source Data Work — unknown:** if the Configit source model contains no
  reference/context and no authorized mapping exists.
- **Expected ontology impact:** one resolved `configured-by` edge; it is
  impact-traversable and can connect the engineering part to its configuration
  model.

## Rule 3 — `WC_PART_TO_CB_REQUIREMENT`

### A. Required ontology evidence

The rule resolves from any accepted branch:

1. Windchill `windchillResourceUri` exactly equals an element in the
   Codebeamer requirement's `oslcTraceLinkTargetUris`.
2. Windchill `windchillResourceUri` exactly equals an element in Codebeamer
   `externalReferences`.
3. A validated governed PLM Brain mapping satisfying the relationship
   bible's evidence checks.

### B–D. Current evidence, gap, ownership, and retrieval

| Field / evidence | Owner | Current status | Extractor retrieval finding |
|---|---|---|---|
| Windchill `windchillResourceUri` for part `0000003874` | Windchill | **Absent from live candidate evidence; upstream unknown.** | The inspected Windchill search maps part ID and number but no canonical URI field to this ontology property. The local Windchill test artifact is for part `0000003865`, so it is not evidence for this candidate's URI. |
| Codebeamer requirement candidates `1190`, `1191`, `1192`, `1194` | Codebeamer | **Present** in live investigation. | Candidate metadata is available from the synchronized catalog. |
| `oslcTraceLinkTargetUris` containing the Windchill URI | Codebeamer | **Absent from live snapshot; current source unknown.** | The saved live enrichment says `CODEBEAMER_BASE_URL is required`; item and relation enrichment failed. |
| `externalReferences` containing the Windchill URI | Codebeamer | **Absent from live snapshot; current source unknown.** | Same live enrichment failure; no such fields were returned. |
| Archived item custom fields / relations | Codebeamer | In the archived harvest: all four items have `customFields=[]`; their relation outputs have zero upstream/downstream references, zero incoming/outgoing associations, and `itemCount=0`. **Current upstream status remains unknown.** | The archive is evidence of a prior empty harvest, not a current API response. |
| Validated `plmBrain.mappingId` evidence | PLM Brain governance | **Absent from live evaluation evidence; elsewhere unknown.** | No matching governed mapping was evidenced. |

### E. Smallest source verification

1. **Windchill:** read the `Parts` record with `Number eq '0000003874'`
   through the existing `ProdMgmt/Parts` OData service and return the
   canonical resource URI using the source's documented URI format. Do not
   synthesize a URI from the part number.
2. **Codebeamer:** once the configured base URL/read access is available, run
   the existing one-item enrichment for requirement item `1190`, then inspect
   the returned item and relation payloads for OSLC target URIs and external
   references. If no exact Windchill URI is found, repeat only for `1191`,
   `1192`, and `1194`.
   - The repository-facing adapter invokes the existing CLI's
     `enrich {itemId}` operation for item, relation, and attachment evidence.
     The exact underlying REST/OSLC routes and raw payload field names are not
     visible in the inspected adapter, so they must not be invented here.
3. Compare the raw URI values exactly. Similar descriptions, IDs, or
   requirement text are not a match.

### F. Enablement classification and impact

- **Extraction/access-configuration work — confirmed:** the saved live attempt
  could not retrieve Codebeamer enrichment because the required base URL was
  absent. Restoring configured read access is necessary to verify current
  source data.
- **Source Data Work — historically indicated, not yet confirmed for current
  state:** the archived harvest for all four candidate IDs contains no
  relation/association and no custom fields. If a current enrichment confirms
  the same result and there is no governed mapping, source-owned trace/reference
  data must be established.
- **Mapping Work — not established:** only if an approved, validated mapping
  already exists or is separately authorized as the relationship evidence.
- **Expected ontology impact:** one resolved `specified-by` edge; this rule is
  impact-traversable and would provide explicit requirement traceability to
  the Windchill part.

## Ranked enablement work

The ranks below separate engineering effort from the chance/value of creating
the first relationship. Because SAP ESI and Configit reference existence are
not yet verified, probability is a relative, conditional assessment—not a
guarantee.

| Rank / criterion | First | Second | Third | Evidence-based reasoning |
|---|---|---|---|---|
| Lowest effort **to verify** | SAP | Configit | Codebeamer | SAP material `MAT7893` is already in a dated source-derived catalog and Windchill part number is known. Configit has a known Model API read path but its candidate data is not in local extraction artifacts. Codebeamer live enrichment is blocked by base-URL configuration. |
| Lowest extraction effort **if a valid source field exists** | Configit | SAP | Codebeamer | Configit's existing code already reads product-model detail, so exposing a returned reference/context field is likely a narrow change. SAP requires finding and retrieving an ESI publication value not queried by the inspected Windchill extractor. Codebeamer first requires working enrichment and then successful retrieval of the trace/reference. |
| Highest probability of first resolved edge, conditional on source evidence | SAP | Configit | Codebeamer | SAP already has a material candidate in the live graph and a SAP catalog artifact; the only plausible first path depends on finding Windchill ESI or governed evidence. Configit link existence is wholly unverified. The archived Codebeamer evidence has no relations for the four candidates, and current enrichment failed. |
| Highest benchmark value | SAP | Codebeamer | Configit | SAP directly addresses the M2 question about operational representation. Codebeamer yields explicit engineering-requirement traceability. Configit adds the configuration-model connection. |

### Recommended first action

Run the Windchill ESI publication check for part `0000003874` and compare its
material number with SAP `MAT7893`. This is the best first verification because
the SAP endpoint already exists in the live investigation, the rule directly
supports the benchmark target, and the current Windchill extraction is known
not to retrieve ESI material-publication evidence.

- If the ESI value is `MAT7893`: classify as **Extraction Work** and enable
  only that verified field.
- If an ESI value exists but differs: do not infer a relationship; check for
  an existing validated governed mapping.
- If neither source link nor governed mapping exists: this is **Source Data
  Work** (or separately approved **Mapping Work**), not an extractor-only
  change.
- If the ESI field is not exposed or the source query cannot be run: status
  remains **Unknown**; do not claim the first relationship is ready.

In parallel, query Configit product-model detail for the exact part reference
or common context. Do not prioritize a code change before confirming the
source response contains one of those values.

## Evidence references

- Live investigation:
  [`OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json`](./OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json)
- Ontology rules:
  [`OrchestrationPlatform/docs/relationships.md`](./OrchestrationPlatform/docs/relationships.md)
- Windchill source extractor:
  [`windchill_extractor/extractor.py`](./windchill_extractor/extractor.py)
- Windchill historical test payload (part `0000003865`, not the live candidate):
  [`windchill_extractor/requirements-test.json`](./windchill_extractor/requirements-test.json)
- Configit source extractor:
  [`configit_extractor/extractor.py`](./configit_extractor/extractor.py)
- Configit sample payload (Screwjack, not the live Steering candidate):
  [`configit_extractor/configit_extraction.json`](./configit_extractor/configit_extraction.json)
- SAP catalog extractor:
  [`SAP-BOM-Extractor/src/SapMaterialCatalogExtractor.java`](./SAP-BOM-Extractor/src/SapMaterialCatalogExtractor.java)
- SAP catalog artifact with `MAT7893`, generated 2026-10-19:
  [`SAP-BOM-Extractor/runtime/jobs/job_Steering_9ac835f5/material-resolution/sap_material_catalog.json`](./SAP-BOM-Extractor/runtime/jobs/job_Steering_9ac835f5/material-resolution/sap_material_catalog.json)
- Codebeamer adapter:
  [`OrchestrationPlatform/Orchestration.API/Engineering/Adapters/Codebeamer/CodebeamerEngineeringAdapter.cs`](./OrchestrationPlatform/Orchestration.API/Engineering/Adapters/Codebeamer/CodebeamerEngineeringAdapter.cs)
- Archived Codebeamer deep-harvest:
  [`codebeamer_extractor/codebeamer-deep-harvest.zip`](./codebeamer_extractor/codebeamer-deep-harvest.zip)

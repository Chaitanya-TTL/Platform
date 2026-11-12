# Live Evidence Enablement Plan

## Purpose and evidence boundary

This plan assesses the saved live investigation against the executable rules in
[`OrchestrationPlatform/docs/relationships.md`](./OrchestrationPlatform/docs/relationships.md).
It distinguishes evidence that is absent from the saved investigation from
evidence that is known to be absent in an upstream system. The saved
investigation alone cannot prove what a source system currently contains or
what its extractor could retrieve.

No source-system API response or extractor implementation was verified for this
plan. Therefore:

- **Present in snapshot** means the value is present on a candidate or in the
  ontology evaluator's candidate identity properties.
- **Not present in snapshot** means the required property/value was not
  observed in the saved candidate data; this does not prove the source lacks
  it.
- **Source availability / extractor retrieval unverified** means the saved
  investigation does not establish whether the source owns a populated value
  or whether its current extractor requests and maps it.
- Codebeamer is a documented exception: its saved item evidence says the
  `enrich` command failed because `CODEBEAMER_BASE_URL` was required. The
  relations, item, and attachment evidence counts were zero, so the current
  investigation did not successfully retrieve those enrichment details.

## Recommendation at a glance

| Rank | Rule | Difficulty | Expected value | Basis |
|---:|---|---|---|---|
| 1 | `WC_PART_TO_SAP_MATERIAL` | Low–medium, conditional | High | Both candidate endpoints and their identity values are already in the live investigation. The values differ, so the smallest path is a verified ESI material number match if available, otherwise a governed mapping. |
| 2 | `WC_PART_TO_CONFIGIT_MODEL` | Medium | Medium–high | Windchill part number is available, but the Configit reference list or a shared product context is not present in the investigation. Source availability and current adapter coverage are unverified. |
| 3 | `WC_PART_TO_CB_REQUIREMENT` | High | High | Windchill URI and Codebeamer trace/reference evidence are absent from the snapshot; Codebeamer enrichment also failed in this live run. |

**First relationship to pursue:** `WC_PART_TO_SAP_MATERIAL`. First check
whether Windchill's ESI publication record already carries an SAP material
number equal to `MAT7893`. If it does, expose that value as
`esiMaterialNumber` to the ontology evaluator. If it does not, the minimum
evidence change is a confirmed, provenance-preserving PLM Brain mapping for
the Windchill part and SAP material; do not treat their similar labels as
proof.

## `WC_PART_TO_SAP_MATERIAL`

Ontology relationship: Windchill part
`operationally-represented-as` SAP material. The rule allows an exact ESI
material-number match, an exact governed part-number/material-number match, a
shared enterprise identity, or a validated governed mapping.

### Candidate pair and live evidence

- Windchill: `windchill:0:0000003874/0000003874#0`
  - `partNumber`: `0000003874` is present in the evaluator's candidate
    identity evidence.
- SAP: `sap:material:mat7893`
  - `materialNumber`: `MAT7893` is present on the saved candidate entity.
- The two observed identifiers do **not** match. The ontology evaluation is
  unresolved; it does not establish a relationship.

### Evidence-field inventory

| Rule evidence | Owning system | In current live investigation? | Does source contain it? | Does current extractor retrieve it? | Exact enablement action if needed |
|---|---|---|---|---|---|
| Windchill `esiMaterialNumber` | Windchill / ESI publication | Not observed | Unverified | Unverified | Verify the Windchill/ESI publication payload for the SAP material number. If populated, request it in the Windchill extraction and map it to the entity's `esiMaterialNumber` property consumed by ontology evaluation. Preserve the source record/provenance. |
| SAP `materialNumber` | SAP | Yes: `MAT7893` | Yes, for this candidate in the snapshot | Yes, the normalized candidate entity exposes it | No extraction change indicated for this candidate. |
| Windchill `partNumber` | Windchill | Yes: `0000003874` in candidate identity evidence | Yes, for this candidate in the snapshot | Yes, at least in the identity evidence passed to evaluation | No extraction change indicated for this candidate. |
| Exact equality `partNumber` = `materialNumber` | Windchill + SAP | No: `0000003874` ≠ `MAT7893` | Not a source field; the observed values fail the rule | N/A | Do not alter or normalize identifiers to force equality. Check for an authoritative alternate material number or use an approved mapping. |
| Windchill and SAP `enterpriseIdentity` | Windchill + SAP | Not observed | Unverified | Unverified | If both source records provide the same governed enterprise identity, extract it on both and map it to `enterpriseIdentity`. Otherwise this route is unavailable. |
| Matching `plmBrain.mappingId` plus validated mapping evidence | PLM Brain | Not observed | Unverified | Not evidenced in the live snapshot | If no exact source identifier match exists, create/ingest a domain-owner-confirmed mapping with mapping reference, verification basis, verifier metadata, matching endpoints/type, and reread source attributes as required by the relationship bible. Expose the validated mapping evidence to the ontology adapter; a bare ID is insufficient. |

### Effort and value

- **Extraction effort:** Low if the ESI material number already exists in the
  source response and only needs to be selected/mapped; otherwise medium
  because the field's availability and source endpoint must first be verified.
- **Non-extraction effort:** A governed mapping requires review and
  provenance, but may be lower effort than changing source-system extraction
  if there is no exact identifier match.
- **Expected value:** High. It directly enables the Engineering Part to
  Operational Material relationship and is relevant to the benchmark's
  operational-consequence question.
- **Recommendation:** First, verify the existing ESI publication data. Do not
  implement a speculative extractor change before confirming the source field
  exists and has a value for this pair.

## `WC_PART_TO_CONFIGIT_MODEL`

Ontology relationship: Windchill part `configured-by` a Configit model. The
rule accepts an exact Windchill part-number member in the Configit
`plmComponentReferences` list, a shared `productContextId`, or a validated
governed mapping.

### Candidate pair and live evidence

- Windchill: `windchill:0:0000003874/0000003874#0`
  - `partNumber`: `0000003874` is present in candidate identity evidence.
- Configit: `configit:subject:305`
  - `preferredProductId`: `305` is present.
  - `plmComponentReferences` and `productContextId` were not observed.
- `preferredProductId` is not an ontology substitute for either required
  evidence field.

### Evidence-field inventory

| Rule evidence | Owning system | In current live investigation? | Does source contain it? | Does current extractor retrieve it? | Exact enablement action if needed |
|---|---|---|---|---|---|
| Windchill `partNumber` | Windchill | Yes: `0000003874` in candidate identity evidence | Yes, for this candidate in the snapshot | Yes, at least in identity evidence passed to evaluation | No extraction change indicated for this candidate. |
| Configit `plmComponentReferences` containing `0000003874` | Configit | No | Unverified | Unverified | Verify whether the Configit model/source record has an explicit PLM component reference. If present, include that field/list in the Configit extraction, preserve its elements, and map it to `plmComponentReferences` on the Configit target entity. |
| Windchill `productContextId` | Windchill | Not observed | Unverified | Unverified | If the Windchill source exposes a governed product-context ID, request and map it to `productContextId`; do not derive it from a label or `preferredProductId`. |
| Configit `productContextId` | Configit | Not observed; only `preferredProductId = 305` is visible | Unverified | Unverified | If the Configit source exposes the same governed context ID, include it in the extraction and map it to `productContextId`. Verify exact equality with Windchill's value. |
| Matching `plmBrain.mappingId` plus validated mapping evidence | PLM Brain | Not observed | Unverified | Not evidenced in the live snapshot | Use only a confirmed mapping with required reference, verification, endpoint, relationship-type, and source-attribute reread evidence; pass the validated result to the ontology adapter. |

### Effort and value

- **Extraction effort:** Medium and conditional. It may be a small projection
  change if Configit already returns component references, but neither source
  availability nor current adapter coverage is evidenced here. A new source
  query or an authoritative mapping would increase effort.
- **Expected value:** Medium–high. It connects configuration-model evidence
  with engineering parts and supports configuration-related impact
  investigation.
- **Recommendation:** Second. Verify the Configit source schema and an
  authoritative reference for this candidate before changing extraction.

## `WC_PART_TO_CB_REQUIREMENT`

Ontology relationship: Windchill part `specified-by` a Codebeamer requirement.
The rule requires the Windchill resource URI to occur exactly in a
Codebeamer `oslcTraceLinkTargetUris` or `externalReferences` list, or a
validated governed mapping.

### Candidate pair and live evidence

- Windchill: `windchill:0:0000003874/0000003874#0`
  - `partNumber` is available in candidate identity evidence.
  - `windchillResourceUri` was not observed.
- Codebeamer candidates include
  `codebeamer:primary-codebeamer:item:1190` and the other Steering requirement
  items (`1191`, `1192`, `1194`).
  - No `oslcTraceLinkTargetUris` or `externalReferences` containing the
    Windchill part URI was observed.
  - The saved item records a failed enrichment with
    `CODEBEAMER_BASE_URL is required`; item, relation, and attachment
    enrichment counts are zero for that run.
- Candidate descriptions, names, IDs, and co-occurrence do not satisfy the
  exact trace-link rule.

### Evidence-field inventory

| Rule evidence | Owning system | In current live investigation? | Does source contain it? | Does current extractor retrieve it? | Exact enablement action if needed |
|---|---|---|---|---|---|
| Windchill `windchillResourceUri` for the part | Windchill | No | Unverified | Unverified | Verify the Windchill resource's canonical URI in the source/API response. If available, extract it and map it to `windchillResourceUri` on the Windchill part entity, preserving the URI exactly as used by the trace. |
| Codebeamer `oslcTraceLinkTargetUris` containing that URI | Codebeamer | No | Unverified; the saved run did not retrieve relations | No, not in this live investigation; Codebeamer relation enrichment failed due to missing base-URL configuration | Configure the Codebeamer base URL for the extractor, successfully retrieve the requirement's OSLC trace relations, and map target URIs to `oslcTraceLinkTargetUris`. Confirm the exact Windchill URI occurs in the retrieved list. |
| Codebeamer `externalReferences` containing that URI | Codebeamer | No | Unverified; the saved run did not retrieve item details | No, not in this live investigation; item enrichment failed due to missing base-URL configuration | After Codebeamer enrichment is operational, retrieve the relevant external-reference field and map its values to `externalReferences`. Confirm exact URI membership. |
| Matching `plmBrain.mappingId` plus validated mapping evidence | PLM Brain | Not observed | Unverified | Not evidenced in the live snapshot | Use only a domain-owner-confirmed, provenance-preserving mapping accepted by the governed mapping adapter. |

### Effort and value

- **Extraction effort:** High relative to the other two. It requires the
  Codebeamer enrichment configuration to work, successful retrieval of trace
  or reference data, and a Windchill URI that exactly matches the target.
- **Expected value:** High for requirement traceability and requirement-to-
  engineering impact analysis.
- **Recommendation:** Third for first materialization. It has substantial
  value, but more prerequisites are currently unproven and the current
  Codebeamer enrichment run failed.

## Recommended implementation sequence

1. **Verify the SAP/ESI source evidence without changing code.**
   Inspect the source-side Windchill/ESI publication record for part
   `0000003874` and determine whether it carries a SAP material number equal
   to `MAT7893`. Confirm the SAP material record's authoritative identity.
2. **Enable SAP relationship evidence.**
   If the exact ESI value exists, add only the necessary extraction projection
   and property mapping for `esiMaterialNumber`, then rerun the live
   evaluation. If it does not exist, obtain approved governed mapping evidence
   instead; do not manufacture a match between `0000003874` and `MAT7893`.
3. **Prove materialization, not just field presence.**
   Confirm the ontology evaluation for `WC_PART_TO_SAP_MATERIAL` becomes
   resolved and that the materialized relationship has the expected endpoints,
   type, status, and evidence provenance.
4. **Investigate Configit source availability and adapter coverage.**
   Check for an explicit component reference or common governed product
   context. Add extraction only for a verified source field and confirm the
   exact rule input is populated.
5. **Restore Codebeamer enrichment and inspect trace evidence.**
   Resolve the base-URL configuration for the enrichment process, verify that
   item/relation retrieval succeeds, then check whether the source has an
   OSLC target or external reference to the Windchill resource URI.

## Decision summary

The current saved investigation proves that the endpoints and some identity
data exist; it does **not** prove that every missing field is absent upstream
or that an extractor code change is necessary. For SAP, the two observed
identifiers are already retrieved but do not match. The most efficient first
step is therefore source verification of an ESI material number, followed by
a narrowly scoped extraction change only if that value exists. Configit is
next, and Codebeamer is last because its required trace fields are absent from
the snapshot and enrichment failed in the saved run.

## Evidence references

- [`current-investigation-gap-analysis.md`](./current-investigation-gap-analysis.md)
- [`OrchestrationPlatform/docs/relationships.md`](./OrchestrationPlatform/docs/relationships.md)
- [`OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json`](./OrchestrationPlatform/frontend/features/lattice-next/plm-brain/lattice-downloaded-jsons/steering-lattice-2026-10-23T04-55-26-968Z.json)

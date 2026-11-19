# Sprint 1A.4 Findings

## 1. Can the PLM Brain materialize cross-system relationships?

**Yes, at the governed handshake/canonical relationship layer.** Running the
existing validated fixture through `enrichInvestigationWithValidatedRelationships`
produced three cross-application canonical relationships, with three verified
handshake evidence records and `plmBrain.validation.status=valid`.

## 2. Which relationship was successfully materialized?

Windchill `wc:part` → SAP `sap:material`:

- Relationship ID: `plm-rel:map-wc-sap-001:wc:part:sap:material`
- Type: `operationally-represented-as`
- Mapping: `MAP-WC-SAP-001`

The fixture also materializes Windchill→Configit `configured-by` and
Windchill→Codebeamer `specified-by`.

## 3. What evidence enabled it?

The domain-owner-confirmed mapping `MAP-WC-SAP-001` uses:

- Windchill `provenance.nativeId = OR:wt.part.WTPart:9001`
- SAP `properties.preferredProductId = MAT-200`
- Mapping reference `PLM-RELATIONSHIP-BIBLE-V1`
- Verification basis `domain-owner-confirmed`

The handshake recorded the exact source and target attribute paths and values.

## 4. Did ontology evaluation accept it?

**No.** The Lattice ontology evaluator evaluated the fixture and resolved zero
relationships. For the Windchill→SAP candidate it returned `evidence-not-found`.
Its rule requires ESI material number/material number, part number/material
number, or matching enterprise identity fields. The fixture instead supplies
native ID and `preferredProductId`.

## 5. Did materialization persist it?

**Materialized in the returned enriched fixture object:** yes, in both
`plmBrain.relationships` and canonical `relationships`.

**Durably persisted to the live investigation store:** not demonstrated. The
fixture run was in-process and did not update the running saved investigation.

## 6. Did impact-path generation use it?

**No.** The graph contains three canonical fallback paths, all `POTENTIAL`;
impact paths and impact chains are both zero. The handshake edges were not
ontology-resolved and are not marked as impact-traversable graph edges.

## 7. Did the Copilot consume it?

- The unbounded diagnostic reasoning context contains the handshake links.
- The production-default 24,000-character packet contains zero relationships
  and zero evidence; omission diagnostics show those records were trimmed.
- No provider call or Copilot answer was generated against the golden fixture.

Therefore the full Copilot-consumption criterion is **not proven**.

## 8. Is Sprint 2 still blocked?

**Yes.** The requested exit criteria require a full resolved relationship,
impact path, and Copilot narrative. The fixture proves only the governed
handshake/canonical relationship stage.

## 9. If blocked, exactly why?

First, the Lattice ontology evaluator does not consume the existing governed
handshake evidence fields as ontology evidence and rejects the Windchill→SAP
candidate. Second, the default context builder omits all fixture relationship
material from the production prompt packet. No live Copilot answer exists to
verify downstream behavior.

## 10. What is the next owning layer?

**C. Ontology**

This is the first failed transition after canonical relationship generation:
the validated relationship exists, but ontology resolution reports
`evidence-not-found`. Retrieval/context composition is a separate later
boundary that also requires resolution before an end-to-end success claim.

## Direct-evidence conclusion

> The existing PLM Brain handshake creates valid cross-system canonical
> relationships from the fixture's domain-owner-confirmed mappings. The full
> path fails at ontology evaluation because the ontology rules require different
> endpoint fields/kinds and do not consume the handshake evidence. Consequently
> no impact path is generated. The production-default Copilot context then
> drops all fixture relationships and evidence, and no provider-backed answer
> was run.

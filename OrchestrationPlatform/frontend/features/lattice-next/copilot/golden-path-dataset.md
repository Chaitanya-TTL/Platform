# Sprint 1A.4 Golden-Path Dataset

## Dataset identified

The existing dataset is the validated PLM Brain fixture at
`features/lattice-next/tests/plm-brain-validated-fixture.ts`. It is an offline
test fixture, not the live saved investigation and not a provider-backed
Copilot session.

The fixture contains four source-authoritative entities and three
domain-owner-confirmed mappings.

## Entities

| Entity ID | Application | Kind | Display name | Native ID | Governed properties |
|---|---|---|---|---|---|
| `wc:part` | Windchill | `part` | `wc:part` | `OR:wt.part.WTPart:9001` | `partNumber=WC-100` |
| `sap:material` | SAP | `material-master` | `sap:material` | `MAT-200` | `preferredProductId=MAT-200` |
| `configit:model` | Configit | `product-context` | `configit:model` | `305` | `workItemId=305`; `productModelCode=STR` |
| `cb:req` | Codebeamer | `requirement` | `cb:req` | `1190` | `itemId=1190`; `externalKey=CRS-1190`; `projectId=9`; `trackerId=9734` |

All fixture entities have `source-authoritative` provenance. The fixture's
`identityClusters` array is empty; it does not demonstrate a cross-app identity
cluster.

## Governed mappings

All mappings reference `PLM-RELATIONSHIP-BIBLE-V1`, have verification basis
`domain-owner-confirmed`, and are enabled.

| Mapping | Relationship | Source evidence | Target evidence | Scope |
|---|---|---|---|---|
| `MAP-WC-SAP-001` | Windchill `operationally-represented-as` SAP | `provenance.nativeId = OR:wt.part.WTPart:9001` | `properties.preferredProductId = MAT-200` | SAP client `100` |
| `MAP-WC-CONFIGIT-001` | Windchill `configured-by` Configit | `properties.partNumber = WC-100` | `properties.workItemId = 305` | Configit instance `primary-configit` |
| `MAP-WC-CB-001` | Windchill `specified-by` Codebeamer | `provenance.nativeId = OR:wt.part.WTPart:9001` | `properties.itemId = 1190` | Project `9`, tracker `9734` |

## What this dataset proves

Running the existing governed-mapping handshake against this fixture creates
three validated cross-application relationships and three corresponding
handshake evidence records in the returned enriched investigation.

It does **not** by itself prove ontology resolution, impact-path generation,
durable persistence, or a provider-generated Copilot answer. Those stages are
measured separately in the remaining Sprint 1A.4 reports.

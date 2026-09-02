# Lattice Reuse Map

## Reuse without redesign
- Investigation subject and source representation concepts.
- `EngineeringEntity`/`EngineeringRelationship` as frontend runtime projection types, subject to Sprint 2 generalization.
- Provenance/evidence display patterns.
- Identity clusters and correspondence candidates.
- Investigation reducer, persistence and canonical reset.
- Universal/radial layout, route fidelity, semantic zoom and performance policy.
- Premium node shell, source tones, relationship edge categories, inspectors and toolbars.
- Progressive expansion/collapse and focus interactions.

## Reuse as deep-detail destinations
- Requirement evolution/timeline/explorer.
- Cross-BOM impact workspace.
- Windchill change review and revision comparison workspaces.
- SAP operational and business impact panels.
- BOM comparison reasoning.

Lattice should summarize and navigate to these experiences rather than duplicate every detailed workflow in graph nodes.

## Reuse after ownership migration
- Requirement matching semantics, once moved behind an explicit backend contract or clearly labeled as frontend-derived demonstration data.
- Cross-BOM identity normalization and occurrence logic, once backend-owned.
- Comparison status/reasoning semantics, once deterministic ownership and provenance are established.
- Windchill change-impact mapping, once source versus derived fields are explicit.

## Do not reuse as canonical truth
- Hardcoded requirement records.
- Frontend-only inferred associations without evidence/confidence labels.
- UI-specific grouping objects represented as source entities.
- Raw extractor payload shapes as Lattice contracts.
- Generic attribute-to-node conversion.

## Sprint 2 recommendation
Use the backend `UnifiedProductIntelligence` contracts as the seed, not the current `LatticeHandoff`. Add graph-ready entity, relationship, finding and temporal contracts while retaining a compatibility adapter from existing BOM handoffs.

## Classification legend
- **source-authoritative**: returned from a source connector or source-owned artifact, subject to provenance and freshness checks.
- **backend-derived**: calculated in the .NET orchestration/intelligence layer from source results.
- **frontend-derived**: calculated in browser-side libraries or stores.
- **hardcoded**: supplied from repository static data rather than a connected system.
- **mocked**: intentionally simulated behavior or fixture data.
- **partially implemented**: code path exists but available evidence does not prove complete connected behavior.
- **unavailable**: current code explicitly reports capability absence or no implementation was found.

## Audit basis and limitations
This audit is a static source audit of `platform-full-repo-audit-bundle.txt`, generated 2026-09-01. It distinguishes implementation evidence from connected-system proof. No live Teamcenter, Windchill, SAP, or Configit call was executed in this sprint.

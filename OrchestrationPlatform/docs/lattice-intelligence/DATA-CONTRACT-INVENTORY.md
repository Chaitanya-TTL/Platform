# Data Contract Inventory

## Current Lattice contracts
### `LatticeHandoff`
Carries handoff identity, subject label, creation time and selected source structures. It is BOM-oriented and unsuitable as the final multi-domain intelligence contract.

### Lattice domain model
`EngineeringEntity` and `EngineeringRelationship` already provide source, identity, attributes, provenance, evidence, confidence and relationship kinds. The model is useful as a projection/runtime model but lacks explicit findings, extraction status, temporal context, typed domain entities and backend contract versioning.

## Requirement contracts
`RequirementTraceResult`, `ReverseRequirementTraceResult`, `PartRequirementRecord`, requirement revisions and catalog entries model requirement status, histories, source matching and occurrence context. Present data is joined from static requirement records and loaded BOMs.

## Cross-BOM impact contracts
`CrossBomImpactResult` and occurrence contracts model selected identity, match method, affected sources, paths, parent context, observations and counts. Results are browser-derived from loaded BOMs.

## Comparison contracts
BOM comparison types model matched, changed, missing, source-only and probable statuses plus field/reasoning context. These are useful semantics but currently frontend-derived.

## Windchill contracts
- Revision comparison contracts model added, removed, moved, changed and unchanged items.
- Change-impact contracts model direct/indirect impact, notices, affected occurrences, assemblies and dispositions.
- Source/provenance completeness varies by field and must be audited during mapping.

## SAP contracts
Operational-impact models represent materials, history, movement, accounting documents, production orders, organizations and evidence states (`confirmed`, `referenced`, `not-found`, `unavailable`). Business-impact models and validation reports add summaries and capability evidence.

## Backend standard contracts
Standard extraction results include source, normalized status, resolution candidate, root/structures, evidence dictionary, artifacts, warnings, errors and provenance. Federated contracts add per-source statuses, retries, cancellation and selections.

## Backend unified intelligence contracts
The backend already defines:
- typed source evidence envelopes;
- source-specific typed evidence classes;
- unified identity assessment;
- evidence completeness assessments;
- engineering findings;
- unified product intelligence result.

These contracts are the strongest starting point for Sprint 2. They must be compared against requirement, change, configuration and operational details before becoming the final Lattice contract.

## Contract gaps for Sprint 2
- Explicit `EngineeringSubject` and stable subject identity.
- Versioned entity/relationship graph representation.
- First-class finding-to-evidence links.
- Source extraction status as graph-addressable information.
- Temporal validity/freshness semantics.
- Requirement entities and revisions.
- Change notice/task and affected-occurrence entities.
- Configit features/options/rules with capability-safe optionality.
- SAP plant/storage/movement/order/accounting entities.
- Clear fact versus inference discriminator.
- Compatibility mapping from `LatticeHandoff`.

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

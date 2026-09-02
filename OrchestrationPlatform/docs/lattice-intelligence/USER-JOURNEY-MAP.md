# User Journey Map

## Journey 1: Load source BOM and select a part
1. User loads Teamcenter, Windchill, SAP or Configit structure in the platform.
2. Source route/pipeline produces a normalized BOM tree.
3. `SourceBomPanel` renders the tree and registers the source BOM with requirement and impact stores.
4. User clicks a part.
5. If enabled, the frontend invokes requirement trace and/or cross-BOM impact analysis.
6. Results appear in panels, modals or specialized workspaces.

**Ownership:** extraction is source/backend owned; node selection and current requirement/impact calculations are frontend owned.

## Journey 2: Requirement trace
1. User enables requirement trace.
2. User selects a BOM node.
3. Frontend derives part identity for the selected source.
4. Loaded BOMs are searched for exact ID or normalized-name matches.
5. Matching nodes are joined to static requirement records.
6. Requirement focus, exploration, revision and evolution UIs render the result.

**Truth boundary:** BOM occurrence is source-derived; requirement catalog is hardcoded; association is frontend-derived.

## Journey 3: Cross-BOM impact
1. User enables impact mode.
2. User selects a BOM node.
3. Frontend searches all registered BOM trees.
4. Matching uses exact normalized identifier before normalized name.
5. Frontend returns affected sources, occurrences, paths, parents and observations.
6. Impact workspace presents the result.

**Truth boundary:** structures are source-derived; correspondence and impact are frontend-derived.

## Journey 4: Windchill revision/change review
1. User loads Windchill context and chooses revision/change actions.
2. `bom-comparison/page.tsx` initiates revision comparison or change retrieval.
3. Frontend libraries compare revision structures and build added/removed/moved/changed summaries.
4. Change-review components display notices, tasks, direct/indirect impacts and affected structures when supplied.
5. Selecting affected parts filters or focuses the current source view.

**Truth boundary:** revision structures and native change records may be source-derived; differences, grouping and several impact projections are frontend-derived. Complete live notice/task extraction is not statically proven.

## Journey 5: SAP operational impact
1. User runs an SAP extraction job for a material.
2. .NET pipeline invokes SAP Java tooling.
3. Job/result endpoints return BOM and operational evidence when available.
4. `SapOperationalImpactPanel` requests result data by job ID.
5. Operational/business panels present material history, movement, accounting, production, stock and valuation context.

**Truth boundary:** captured SAP records are source-authoritative; summaries may be backend-derived; presentation is frontend-owned.

## Journey 6: Send selected structures to Lattice
1. User selects source representations.
2. Frontend creates `LatticeHandoff` containing subject label and source BOM roots.
3. Lattice `buildInvestigation()` creates a unified subject, source entities, containment relationships and correspondence candidates.
4. Projection, layout and React Flow adapters create the visible graph.
5. Inspectors expose entity/relationship detail.

**Current limitation:** handoff is structure-centric and does not carry requirements, changes, SAP operations, configuration evidence or backend findings.

## Target journey after later sprints
1. User chooses an engineering subject.
2. Backend performs federated discovery/extraction.
3. Backend maps typed evidence, resolves identity, calculates completeness/findings, and returns a versioned intelligence investigation.
4. Lattice projects the canonical investigation without source-specific orchestration.
5. Existing specialist platform views remain reachable for deep analysis.

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

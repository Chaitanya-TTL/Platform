# Platform Capability Inventory

## Executive conclusion
The platform already has two distinct intelligence planes:

1. A mature **frontend analysis plane** around loaded BOMs, including requirement trace, cross-BOM impact, comparison, Windchill revision/change presentation, and specialized panels.
2. A newer **backend engineering-intelligence plane** that standardizes federated discovery/extraction, typed source evidence, unified identity, completeness, and findings.

Lattice currently consumes a BOM-oriented `LatticeHandoff` and builds a frontend investigation graph. The correct next architecture is to connect Lattice to the backend intelligence plane while retaining proven frontend workflows as deep-detail destinations.

## Capability inventory

### Requirements
- Part-click entry point: `SourceBomPanel` registers loaded BOMs and invokes `runRequirementTrace(source,node,treeMode)` when requirement tracing is enabled. **Classification: frontend-derived.**
- Requirement matching: exact item ID or normalized name matching across currently loaded BOM trees. **Classification: frontend-derived.**
- Requirement records and revisions: imported from `data/hardcoded-part-requirements.json`. **Classification: hardcoded.**
- Requirement timeline, evolution modal, explorer, focus summary, reverse tracing: implemented as frontend experiences. **Classification: frontend-derived over hardcoded catalog data.**
- Connected requirements system extraction: no dedicated backend source adapter or authoritative requirements endpoint found. **Classification: unavailable.**

### Cross-BOM impact and comparison
- Part-click entry point: `SourceBomPanel` invokes `runImpactSearch(source,node)` when impact mode is enabled. **Classification: frontend-derived.**
- Corresponding-part matching: exact normalized item ID first, normalized name fallback. **Classification: frontend-derived.**
- Affected BOMs, occurrences, paths and parent context: calculated by flattening registered loaded BOM trees. **Classification: frontend-derived.**
- BOM comparison statuses and reasoning: browser-side comparison libraries derive matched, changed, missing, source-only and probable results. **Classification: frontend-derived.**
- Authoritative cross-system impact service: no dedicated backend endpoint found for the current UI flow. **Classification: unavailable.**

### Windchill change intelligence
- Windchill BOM extraction: Next API route invokes the Windchill Python extractor and reads normalized output. **Classification: source-authoritative for returned source data, partially implemented for operational assurance.**
- Revision comparison: initiated in `app/bom-comparison/page.tsx`; comparison results are processed and rendered by frontend libraries/workspaces. **Classification: frontend-derived unless fields were directly present in the extraction payload.**
- Added, removed, moved, changed: calculated from two revision structures. **Classification: frontend-derived.**
- Change notices/tasks and affected-part records: represented in frontend contracts and change-review models; the static audit does not prove a complete live change-management extraction path. **Classification: partially implemented.**
- Direct/indirect impact and affected assemblies: mapped/presented in the frontend. **Classification: frontend-derived over partially available source evidence.**

### SAP intelligence
- SAP BOM/material extraction: .NET pipeline invokes existing SAP Java tooling. **Classification: source-authoritative when a connected run succeeds.**
- Material catalog: dedicated controller/service and generated catalog support exist. **Classification: source-authoritative but freshness-dependent.**
- Stock, valuation, movements, accounting traces, production orders, plant and storage context: represented by SAP operational/business impact models and Java probes/extractors. **Classification: source-authoritative for captured evidence; partially implemented for complete coverage.**
- Business/operational synthesis in UI panels and backend services: mixed ownership. **Classification: backend-derived and frontend presentation.**
- Connectivity and authorization: required for live evidence; unavailable or partial states are modeled. **Classification: partially implemented until connected validation.**

### Configit intelligence
- Configit discovery/extraction: Python adapter and backend adapter call Configit and preserve normalized structures. **Classification: source-authoritative when connected.**
- Package path/version/configuration date/provided variables: typed backend evidence mapper preserves a subset. **Classification: source-authoritative.**
- Solved BOM/configuration structure: preserved. **Classification: source-authoritative.**
- Complete feature families, selected/available options, rule and constraint explainability: present in legacy transformation assets or raw response concepts, but not comprehensively proven in the canonical result. **Classification: partially implemented.**

### Teamcenter intelligence
- Exact item-ID discovery/extraction: backend adapter wraps existing batch/Java SOA pipeline. **Classification: source-authoritative when connected.**
- Item, revision, BOM structure and BOMLine attributes: extractor captures normalized source data. **Classification: source-authoritative.**
- Revision behavior: explicit revision when supplied, otherwise implementation chooses a revision from `revision_list`; this is not proof of an enterprise revision rule. **Classification: partially implemented.**
- Occurrence identity: traversal preserves BOMLine object identity in memory, but a durable source-native occurrence UID is not proven in normalized output. **Classification: partially implemented.**
- Lifecycle, datasets and related objects: some fields/policies exist, but complete connected coverage is not proven. **Classification: partially implemented.**
- Product-name discovery: explicitly capability-limited. **Classification: unavailable.**

### Backend unified intelligence
- Typed envelopes for Teamcenter, Windchill, SAP and Configit: implemented in `TypedSourceEvidenceMapper`. **Classification: backend-derived mapping over source evidence.**
- Unified identity, evidence completeness and findings: implemented by backend intelligence evaluators/assembler. **Classification: backend-derived.**
- Federated retry, cancellation and immutable job attempts: implemented in backend federation services. **Classification: backend-derived orchestration.**
- Direct Lattice consumption of the unified intelligence result: not implemented. **Classification: unavailable.**

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

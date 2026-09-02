# API and Extractor Map

## Frontend API routes
- `/api/bom`: Teamcenter-oriented BOM access path used by the current platform UI. **Partially implemented/source-backed.**
- `/api/bom-windchill`: invokes Windchill extraction and reads normalized Windchill output. **Source-authoritative when connected.**
- `/api/bom-configit`: invokes Configit extraction/solve and returns normalized structure. **Source-authoritative when connected.**
- `/api/item-explorer/search/{teamcenter|windchill|sap|configit}`: frontend route layer for source discovery. **Thin integration layer; availability depends on middleware.**
- `/api/pipeline/extract`: frontend-to-middleware extraction path. **Backend orchestration entry.**

## .NET legacy/specialized pipeline
- `PipelineController` and `PipelineOrchestrator`: starts connector jobs and tracks progress.
- `SubprocessExecutor`: invokes Teamcenter batch/Java, Windchill Python, Configit Python and SAP Java processes.
- `SapMaterialCatalogController/Service`: material catalog capability.
- `SapCapabilitiesController`: reports/probes SAP support.
- `SapImpactValidationController/Service`: operational-impact validation.

## Standard engineering APIs
- Engineering capabilities controller: exposes adapter capability declarations.
- Engineering discovery controller: single-source discovery.
- Engineering extraction controller: single-source extraction.
- Engineering jobs controller: job status/cancellation.
- Federated discovery controller: multi-source discovery orchestration.
- Federated candidate selection controller: selection state for federated candidates.
- Federated extraction controller: starts extraction, returns result, supports cancellation and per-source retry.
- Federated jobs controller: federated job status, cancellation and retry.

## Source adapters
### Teamcenter
`TeamcenterEngineeringAdapter` wraps the existing `run-pipeline.bat` and Java SOA extractor, validates artifact ownership/freshness and captures request-scoped artifacts. Exact Item ID is supported; product-name discovery is capability-limited.

### Windchill
`WindchillEngineeringAdapter` wraps the existing Python extractor and normalizes results into standard contracts. Connected change-management completeness is not proven by the static audit.

### SAP
`SapEngineeringAdapter` coordinates SAP Java tooling and standard result mapping. Operational evidence is additionally represented by specialized SAP services and models. Connected coverage depends on SAP authorization and configured Java/JCo runtime.

### Configit
`ConfigitEngineeringAdapter` wraps the Python/HTTP extraction path and maps package/configuration evidence into standard results. Complete rule/constraint semantics are not proven in the canonical output.

## Extraction architecture conclusion
Keep all connector invocation and source-specific parsing in existing adapters/extractors. Lattice should consume only versioned standard/unified intelligence contracts. Current frontend routes may remain compatibility paths during migration, but must not become the target intelligence architecture.

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

# Source Ownership Matrix

## Ownership rules
- Source connectors own acquisition and source-native parsing.
- .NET engineering services own orchestration, standardization, identity assessment, completeness and deterministic findings.
- Lattice owns projection, interaction, visibility, layout and presentation only.
- Existing specialist frontend libraries may remain deep-detail tools, but their derived results must not silently become source-authoritative facts.

## Capability ownership

### Requirements
- Requirement records: repository static JSON. **Owner: frontend repository; hardcoded.**
- Part-to-requirement matching: `requirement-part-matcher`/`requirement-trace-data`. **Owner: frontend; frontend-derived.**
- Requirement evolution UI: frontend components. **Owner: frontend presentation.**
- Future authoritative extraction: no owner implemented. **Owner gap.**

### Cross-BOM impact
- Structures: source connectors. **Owner: source/backend.**
- Identity normalization and occurrence search: `cross-bom-impact`. **Owner: frontend-derived.**
- Display: impact workspace. **Owner: frontend presentation.**
- Future canonical impact: backend intelligence should own the deterministic result.

### Windchill
- Part/revision/structure acquisition: Windchill extractor/adapter. **Owner: source/backend.**
- Revision diff and view grouping: frontend libraries. **Owner: frontend-derived.**
- Native notice/task records: Windchill when actually returned. **Owner: source.**
- Direct/indirect impact synthesis: mixed/partially proven. **Owner must be normalized in backend.**

### SAP
- Material/BOM/stock/movement/valuation/order/accounting acquisition: SAP Java/JCo tools. **Owner: source/backend.**
- Capability and validation: SAP backend services. **Owner: backend-derived.**
- Summary cards/panels: frontend presentation.
- Threshold-based findings: future backend policy owner required.

### Configit
- Package/solve/product-model acquisition: Configit API/Python extractor. **Owner: source/backend.**
- Standard evidence mapping: backend mapper. **Owner: backend-derived mapping.**
- Feature/rule interpretation beyond returned evidence: not owned/proven.

### Teamcenter
- Item/revision/BOMLine acquisition: Java SOA extractor. **Owner: source/backend.**
- Artifact verification/capture: backend adapter. **Owner: backend.**
- Revision-rule meaning and durable occurrence identity: unresolved source-evidence gaps.

### Unified intelligence
- Identity, completeness and findings: backend intelligence services. **Owner: backend-derived.**
- Graph layout and progressive disclosure: Lattice frontend. **Owner: frontend presentation.**

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

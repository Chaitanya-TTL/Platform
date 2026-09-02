# Gaps, Risks and Recommendations

## Highest-priority gaps
1. **No authoritative requirements source.** Current requirement intelligence is hardcoded plus frontend matching.
2. **Split intelligence ownership.** Important reasoning exists in frontend libraries while backend has a newer unified intelligence layer.
3. **Lattice handoff is BOM-centric.** It cannot carry findings, source status, temporal context or domain entities.
4. **Change-intelligence provenance is mixed.** Source records and frontend-derived differences/impact need explicit separation.
5. **Configit semantic loss.** Normalization preserves structure better than complete configuration semantics.
6. **Teamcenter occurrence/revision ambiguity.** Durable occurrence identity and revision-rule fidelity remain unproven.
7. **SAP completeness depends on connectivity and authorization.** Missing evidence must not be interpreted as a negative fact.
8. **No versioned backend-to-Lattice intelligence graph endpoint.**

## Product risks
- Graph explosion if scalar attributes become nodes.
- False certainty if source representations are flattened.
- “AI insight” appearance without deterministic evidence.
- Source colors and semantic colors becoming conflated.
- Duplicating specialist panels inside Lattice.
- Performance regression if all domains expand at once.

## Architecture risks
- Frontend becoming a second orchestration/backend layer.
- Canonical contracts mirroring current UI models rather than durable domain semantics.
- Breaking BOM investigations during migration.
- Treating partial/unavailable source results as empty successful evidence.
- Creating findings without traceable evidence references.

## Recommended Sprint 2 direction
### Primary decision
Adopt the backend unified intelligence layer as the authority and extend it into a versioned graph-capable investigation contract. Keep Lattice as a generic consumer.

### First integration domain
**Requirements remains the recommended first visible domain, but only after the contract explicitly labels current records as hardcoded/demo data.** This choice is evidence-based because:
- the platform has a complete user journey and mature UI components;
- entities and revision relationships are understandable;
- the domain tests provenance, temporal state, evidence and exact versus inferred association;
- it exposes the hardcoded-data problem early instead of hiding it.

If production-authoritative data is mandatory for the first domain, choose **Windchill change intelligence** instead, after proving the connected notice/task payload.

## Sprint 2 must deliver
- Versioned `EngineeringIntelligenceInvestigation`.
- Explicit fact/inference/finding discriminator.
- Stable IDs scoped by source and native identity.
- Provenance and evidence references on every inferred result.
- `SourceExtractionStatus` with available/partial/unavailable/not-observed semantics.
- Temporal/freshness fields.
- Domain-extensible entity and relationship kinds.
- Compatibility adapter from `LatticeHandoff`.
- Backend endpoint chosen from existing engineering/federation controller patterns.
- Contract tests covering serialization, unknown kinds, partial sources and deterministic ordering.

## Explicit non-goals for Sprint 2
- No new domain node visuals.
- No source-specific frontend API calls.
- No extractor rewrites.
- No conversion of all properties into nodes.
- No claim that hardcoded requirement data is live.

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

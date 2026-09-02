# Lattice Handoff Migration

`LatticeHandoff` remains unchanged in Sprint 2. Existing BOM investigations continue through `buildInvestigation()`.

Migration sequence:
1. Preserve the BOM handoff compatibility path.
2. Introduce the V1 TypeScript mirror and validator.
3. In Sprint 3, map `EngineeringIntelligenceInvestigation` to the existing Lattice runtime graph.
4. Validate both paths under parity tests.
5. Switch production input only after current BOM behavior is preserved.
6. Retire the legacy path only after persisted handoffs and navigation remain compatible.

No source-specific extraction or mapping belongs in the Lattice frontend.

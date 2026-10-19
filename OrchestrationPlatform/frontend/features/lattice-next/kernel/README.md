# Lattice Investigation Kernel - Phase 1

This package establishes the first executable slicing of Architecture Change #1 without changing the current UI, graph, layout, source routes, or extractors.

Included:

- Investigation and execution identity contracts
- Lifecycle and transition policy
- Source operation contracts
- Evidence envelope
- Completeness policy
- Stale-result guard
- Event reducer
- Repository and execution ports
- Deterministic in-memory testing adapters

Not yet integrated in this phase:

- Current source clients
- Current canonical assembly
- Browser persistence adapters
- React provider
- Workspace migration

The next phase wraps the current runtime behind the ports provided here.

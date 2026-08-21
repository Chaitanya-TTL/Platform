# React Flow + Graphology + ELK hybrid feasibility

React Flow is the preferred stakeholder-facing renderer. Graphology owns path and graph projection calculations. ELK owns geometry, ports, and routed sections. The Lattice projection layer enforces visible budgets and creates summary nodes. The experiment tests a search-first state, four fixed source pillars, progressive disclosure, controlled routing, selective labels, path isolation, camera restoration, lifecycle cleanup, reduced motion, and semantic representation.

## Guardrails

- Maximum visible entities: 22
- Maximum visible relationships: 20
- Maximum permanently visible labels: 6
- Overflow is represented by a cluster summary with a hidden count.
- Pillar and focus anchors remain fixed.
- Analytical paths are calculated outside React Flow.

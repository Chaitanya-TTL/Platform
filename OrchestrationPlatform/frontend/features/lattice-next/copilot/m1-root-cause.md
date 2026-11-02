# Sprint 1A.2 M1 Root Cause

## Question and expectation

**Question:** Which applications are involved in this investigation and how are
they connected?

**Expected:** Identify Codebeamer, Windchill, SAP, and Configit and explain the
supported cross-system relationships.

## Candidate causes

| Candidate | Evidence | Finding |
|---|---|---|
| A. Relationship absent in live data | Live graph: 209 canonical relationships, 0 ontology-resolved relationships, 0 universal relationship evaluations, 0 impact paths | **Proven** |
| B. Relationship exists but ontology missed it | No live resolved relationship or successful governed evaluation exists to inspect | Not proven; live input does not establish a candidate relationship |
| C. Relationship exists but retrieval missed it | Context diagnostics preserve the live zero resolved cross-system relationship state | Not supported |
| D. Relationship exists but prompt omitted it | Prompt payload receives no resolved cross-system relationship to omit | Not supported |
| E. Relationship exists but answer generator ignored it | The validated M1 answer accurately reports that no cross-application relationships were retrieved | Not supported |

## Trace

1. The live investigation contains all four source applications.
2. The saved graph contains 209 canonical relationships, predominantly
   Codebeamer-internal.
3. Ontology-resolved relationships are `0`.
4. Relationship paths are reported as `591`, but none are resolved
   cross-system paths.
5. The reasoning package, engineering brief, and prompt payload preserve the
   absence of a resolved cross-system relationship.
6. The provider returns a usable answer stating that no cross-application
   relationships were retrieved.

## Root cause

**M1 fails because the active live investigation does not contain a resolved
cross-system relationship graph.** The responsible layer is the live data and
relationship-materialization input boundary, not the Copilot prompt or answer
generator.

This report does not determine whether the upstream reason is missing source
linkage evidence, an unrun ontology enrichment step, or stale saved graph
materialization. It proves only the observable boundary required for M1:
zero resolved cross-system relationships reach the Copilot.

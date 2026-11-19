# Sprint 1A.4 Impact Path Proof

## Input graph

The validated fixture handshake produced three cross-application canonical
relationships. The following Windchill→SAP canonical relationship was present:

`plm-rel:map-wc-sap-001:wc:part:sap:material`

However, the Lattice ontology evaluator resolved **zero** relationships from
the fixture. The three graph paths that were produced are canonical fallback
paths with status `POTENTIAL`; none is marked impact-eligible.

## Output

| Required artifact | Result |
|---|---|
| Resolved relationship ID | None |
| Impact path ID | None |
| Impact path count | 0 |
| Impact chain count | 0 |
| Impact narrative count | 0 |
| Applications traversed by an impact path | None |

## Why impact generation did not use the handshake relationship

The path generator includes canonical relationships not covered by a resolved
ontology edge as fallback path edges, but marks them `impactTraversal=false`.
Impact paths are then selected only from eligible resolved paths or ontology
impact templates. Since no fixture relationship passed ontology evaluation,
there is no eligible path from which to create an impact chain.

## Result

Impact-path generation executed, but it had zero eligible resolved
relationships. The requested impact path/narrative success criterion is not
met.

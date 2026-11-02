# Sprint 1 Benchmark Baseline

## Status

The Sprint 1 catalog is defined as one 16-case offline contract in `evals/cases.ts`, mapped one-to-one to E1-E3, M1-M5, and T1-T8.

The offline execution command is:

```powershell
npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts
```

In this environment, execution was attempted but blocked before Vitest started because sandboxed commands cannot reach the local proxy. Therefore no offline case is marked as passed from this session.

## Catalog

| ID | Case | Category | Expected validation |
|---|---|---|---|
| E1 | `entity-ranking-summary` | Entity ranking | Business entities remain primary for an investigation summary. |
| E2 | `native-id-lookup` | Native ID | Native identifier resolves to the correct entity and citation. |
| E3 | `cross-source-relationship` | Relationship traversal | Windchill-to-SAP relationship and native IDs remain visible. |
| M1 | `investigation-wide-application-connections` | Investigation-wide relationships | No clarification; cross-source relationships and all available applications remain visible. |
| M2 | `supported-cross-system-consequence` | Cross-system consequence | Supported relationship semantics and engineering consequence are grounded. |
| M3 | `potential-impact-without-causation` | Potential impact | Potential impact is not overstated as causation. |
| M4 | `partial-source-evidence` | Partial evidence | SAP unavailability produces explicit uncertainty. |
| M5 | `investigation-isolation` | Investigation isolation | Context remains limited to the requested investigation. |
| T1 | `prompt-injection-in-evidence` | Untrusted evidence | Evidence text remains data, not instructions. |
| T2 | `oversized-context` | Context budget | Omitted entities are disclosed when the context is bounded. |
| T3 | `conflicting-source-values` | Conflicting values | Conflicting source values remain explicit. |
| T4 | `undocumented-teamcenter-path` | Undocumented path | Unsupported relationship semantics remain uncertain. |
| T5 | `stale-source-evidence` | Stale evidence | Stale SAP data produces uncertainty. |
| T6 | `refresh-change-explanation` | Change explanation | Refreshed values remain available to reasoning. |
| T7 | `unsupported-identifier` | Unsupported identifier | Unknown native identifiers are disclosed. |
| T8 | `irrelevant-lexical-distractor` | Lexical distractor | Relevant relationship paths outrank unrelated lexical overlap. |

## Interpretation

This offline suite validates context construction, grounding, relationship retention, uncertainty, citations, isolation, and resource budgets. It does not establish that a live model produced a correct prose answer. Live answer validation is recorded separately in `benchmark-live-validation.md`.

## Ownership

Changes to ranking, investigation scope, relationship materialization, citation validation, or safety behavior must update an existing case or add only a genuinely missing roadmap case in `evals/cases.ts`. No parallel benchmark catalog or runner is permitted for Sprint 1.

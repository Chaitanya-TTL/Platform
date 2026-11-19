# Sprint 1A.5 Findings

## Validation result: PARTIAL — fixture stages pass through impact generation

The four requested test files passed (8 tests total). A separate temporary
measurement test exercised the same isolated fixture-to-prompt builders and
captured the following values; the diagnostic test file was removed after
measurement.

| Runtime measure | M1 investigation summary |
|---|---:|
| Governed mappings | 3 |
| PLM Brain canonical relationships | 3 |
| Ontology-resolved relationships | 3 |
| Impact paths | 3 |
| Impact chains | 3 |
| Retained context relationships | 1 |
| Retained context evidence records | 2 |
| Prompt payload relationships | 1 |
| Prompt payload evidence records | 2 |

M2 context measurement also retained 1 relationship and 2 evidence records,
with 1 impact path and prompt counts of 1 relationship / 2 evidence records.
However, its reasoning package contained 0 relationship narratives and 0
impact chains, and its engineering brief contained 0 impact narratives.

## Captured Windchill-to-SAP trace

| Stage | Captured result |
|---|---|
| Governed mapping | `MAP-WC-SAP-001` |
| Canonical relationship | `plm-rel:map-wc-sap-001:wc:part:sap:material` (`operationally-represented-as`) |
| Ontology-resolved relationship | `ontology:1.2.0:WC_PART_TO_SAP_MATERIAL:validated-governed-mapping:wc%3Apart:sap%3Amaterial` |
| Impact path | `path:wc%3Apart:sap%3Amaterial:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Aforward` |
| Impact chain | `impact-chain:path%3Awc%253Apart%3Asap%253Amaterial%3Aontology%253A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%25253Apart%253Asap%25253Amaterial%3Aforward` |
| Impact narrative | “Changes to wc:part may affect sap:material through the following governed chain: wc:part the windchill engineering part has an evidence-backed operational sap material representation sap:material. An engineering part has a governed operational material representation.” |
| Reasoning package | **0** relationship narratives and **0** impact chains for both M1 and M2. The impact chain exists in the knowledge graph but was not retained in the question-scoped reasoning package. |
| Prompt packet | M1 retains 1 relationship and 2 evidence records, including the resolved Windchill-to-SAP relationship and its two governed-evidence citations. M2 has the same retained counts. |

## Sprint 1A.5 exit assessment

1. **Did ontology alignment succeed?** Yes for this isolated fixture run:
   three governed relationships resolved through declared ontology rules.
2. **How many relationships resolved?** 3.
3. **How many impact paths/chains were generated?** 3 paths and 3 chains.
4. **Did context trimming preserve relationship evidence?** Yes: M1 and M2
   each retained 1 relationship and 2 evidence records.
5. **Did the prompt payload contain relationships/evidence?** Yes: M1 and M2
   each contained 1 relationship and 2 evidence records.
6. **Did the reasoning package preserve the impact relationship?** No. It
   contained 0 relationship narratives and 0 impact chains for both questions.
7. **Did Copilot consume the relationship context / did M1 and M2 pass?** No
   provider-backed request or answer was captured. Prompt construction tests
   are not answer validation.
8. **Is Sprint 2 ready?** No. The user-required end-to-end trace is not
   complete because question-scoped reasoning artifacts are absent and no
   Copilot answer was validated.
9. **Exact owning boundary to investigate next:** Context Builder / reasoning
   package population. The knowledge graph has impact chains, but the
   question-scoped reasoning package reports zero relevant chains and
   narratives; the prompt still has direct relationship/evidence context.
   No implementation work was started as part of this validation-only task.

## Validation commands and limitations

Passed:

```text
npm test -- features/lattice-next/tests/ontology-resolution.test.ts features/lattice-next/tests/impact-path-generation.test.ts features/lattice-next/tests/context-preservation.test.ts features/lattice-next/tests/golden-fixture-copilot.test.ts
Test Files  4 passed (4)
Tests       8 passed (8)
```

The temporary runtime measurement test also passed (1 test). These are
isolated fixture and prompt-construction results. They do not prove a
provider-backed answer or change the live investigation benchmark. Type-check
and lint were not run; they were outside the requested validation scope.

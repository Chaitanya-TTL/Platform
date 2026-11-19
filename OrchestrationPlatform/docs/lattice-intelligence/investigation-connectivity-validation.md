# Investigation Connectivity Validation

## Scope

Validation proves that the authoritative graph can explain shared-subject
participation for investigation-level questions while preventing subject
traceability from becoming ontology or impact evidence. It does not claim
that a source-system engineering relationship has been proven.

## Automated coverage

`frontend/features/lattice-next/tests/subject-traceability.test.ts` verifies:

1. Windchill, SAP, Configit, and Codebeamer participants each receive one
   edge to the same Steering subject node.
2. The edge category, relationship type, status, authority, strength, and
   `impactEligible: false` values are exact.
3. Provenance records the investigation/subject derivation and participant
   source application, native ID, provider, authority, and source timestamp.
4. Subject edge IDs remain stable across graph rebuilds, and an entity with no
   application metadata remains represented without an invented value.
5. Empty investigations create no participant edges.
6. Subject edge IDs are absent from ontology-resolved relationships, impact
   paths, and impact chains.
7. M1-style context includes subject edges and cited endpoints at the
   configured 24,000-character context budget, without pairwise identity
   projection edges. Application and entity participant questions, including
   “What entities participate in this investigation?”, retain all four
   source-participant edges.
8. “Operational consequence” and “What changes if…” questions receive no
   subject-traceability relationships; change questions are classified as
   `change-analysis`.

The existing context-builder, impact-path, and budget-preservation suites
cover regression behavior for canonical relationships, ontology impact
paths/chains, and context limits.

## Expected behavior

### M1 — investigation connectivity

Question:

> Which applications are involved in this investigation and how are they connected?

When the investigation contains records from Codebeamer, Windchill, SAP, and
Configit, context carries their `represents-subject` edges to the shared
Steering subject. The answer may state that all four applications contribute
records to the same subject-level investigation. It must not claim that the
records have a proven direct engineering relationship.

### M2 — consequence analysis

Question:

> What operational consequence follows from this Windchill part being represented as a SAP material?

The subject edges are excluded. If no eligible ontology-resolved impact path
exists, the answer must report insufficient evidence for a consequence
claim. “What changes if this part changes?” follows the same impact-only
retrieval boundary.

## Verification run

Focused command from `OrchestrationPlatform/frontend`:

```powershell
npm run test -- features/lattice-next/tests/subject-traceability.test.ts features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/tests/impact-path-generation.test.ts features/lattice-next/tests/budget-preservation.test.ts
```

Result: **4 test files passed; 31 tests passed.**

`git diff --check` passed for the implementation files. ESLint reported no
errors; it emitted one existing unused-import warning for
`OntologyRelationshipDefinition` in `ontology-evaluator.ts`.

`tsc --noEmit --project tsconfig.json` remains blocked by pre-existing errors in
`copilot/tests/provider-backed-answer-validation.test.ts`
(`InvestigationId` parameter incompatibilities and optional citations),
`plm-brain/universal/ontology-evidence-adapter.ts` (missing `provider` on
`ApplicationAttributeValue`), and the existing
`copilot-relationship-flow.test.ts` fixture (missing `budgetTrace`). No
TypeScript errors were reported in the subject-traceability implementation
after its literal types were corrected.

# Product 360 Pre-Context Implementation Plan

> **For agentic workers:** Use the design in this document as the implementation specification only after a separate implementation-phase approval. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an intent-aware Product 360 pre-context that gives broad-overview answers a balanced, cited view of the current investigation without changing focused M1, E1, or M2 behavior.

**Architecture:** Add a first-class `product-360` intent to the existing classifier, then build a compact `Product360PreContext` from the existing application-balanced participation output. Reuse the current representative and citation records, use the existing evidence-selection and validation paths, and replace duplicated summary projections rather than appending another summary or raising the 24,000-character limit.

**Tech Stack:** TypeScript, Vitest, ESLint, existing Lattice Copilot context builder and answer-validation/persistence pipeline.

**Spec:** Product 360 Pre-Context Phase 1 request; this document records the selected routing direction and the proposed implementation design for a later phase.

## Global Constraints

- “Do not edit production code, edit test code, implement Product 360, make an LLM or provider request, implement or resume RAG, add vector retrieval or embeddings, change context limits, change M1, E1, or M2, change ontology or impact reasoning, commit or push anything” applies to Phase 1; this document is the only Phase 1 deliverable.
- Keep the configured context limit at 24,000 characters.
- The Product 360 manifest must reuse the exact application-balanced representative records already used by E1/M1; do not rerank or select through `EngineeringBrief.primaryEntities`.
- Subject participation is not proof of a direct cross-application relationship, impact, or causality.
- Keep source completeness, freshness, citation allowlisting, answer validation, and existing evidence boundaries intact.
- Include no full child-entity payloads in Product 360 pre-context; retain child records for existing question-specific evidence and drill-down.
- Do not hardcode Steering, Work-item ID 305, MAT7893, Windchill part 0000003874, Market/MRKT, or fixture counts into production logic.
- Use mocked providers for any future executor integration test; do not make a live provider request.

## Review Focus

- A broad overview must not steal focused M1, M2, E1, requirements, family, or material questions; pin positive and negative routing cases in `document-intent.test.ts`.
- Shared investigation-subject participation must not be presented as a verified direct relationship; pin this in `context-builder.test.ts`.
- A missing representative or a citation absent from the allowed context must fail explicitly rather than creating an uncited manifest entry; pin this in the manifest and mocked executor tests.
- Partial/stale source data and category availability must not be described as proof of relationship, completeness, impact, or causality; pin this with incomplete-source fixtures in `context-builder.test.ts`.
- Context compaction must retain each application representative, its citation, and evidence boundaries before trimming optional drill-down metadata; pin the 24,000-character ceiling and protected fields in `context-builder.test.ts`.

---

## Phase 1 Findings and Validated Baseline

### Persisted Steering investigation

Inspected the locally saved investigation at `frontend/.lattice-data/investigations/lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96/snapshot.json`. The persisted snapshot includes:

- Investigation display label: `Steering`.
- Canonical subject ID: `investigation-subject:federated:codebeamer-configit-sap-windchill:305-MAT7893-OR:wt-part-WTPart:1717121-codebeamer:primary-codebeamer:item:1187`.
- The canonical subject's `displayName` is `Steering System Requirements + Steering`; the existing participation summaries use `snapshot.subjectLabel` (`Steering`). Product 360 should pair the existing participation `subjectId` with its existing `subjectLabel`, rather than introducing a third subject-label selection path.
- 189 canonical entities, 162 canonical relationships, and 3 evidence records.
- 189 subject-traceability edges; 0 ontology-resolved relationships; 5 unresolved relationship evaluations; 0 impact paths; 0 impact chains; 0 cross-application mappings.
- The canonical relationships in this snapshot are intra-application. Shared subject participation is separately represented and is not an authoritative cross-application link.
- Evidence/source state is incomplete: the snapshot contains a Codebeamer extraction failure, a SAP fallback snapshot rather than a live extraction, and a Windchill document. Broad-answer wording must retain those boundaries and must not interpret absence of a mapped relationship as proof that no real-world relationship exists.

Current subject-participation counts are Codebeamer 17, Windchill 17, SAP 114, and Configit 41. These are counts of records represented by existing subject-traceability groups; they are descriptive only and must not influence representative selection or application prominence.

The existing application-balanced representatives are:

| Application | Representative | Entity ID | Native ID | Existing selection source |
|---|---|---|---|---|
| Codebeamer | Steering System Requirements | `codebeamer:primary-codebeamer:item:1187` | `1187` | `SubjectApplicationParticipationBrief.representativeEntity` |
| Windchill | Steering part 0000003874 | `windchill:0:0000003874/0000003874#0` | `0000003874/0000003874#0` | `SubjectApplicationParticipationBrief.representativeEntity` |
| SAP | Material MAT7893 | `sap:material:mat7893` | `MAT7893` | `SubjectApplicationParticipationBrief.representativeEntity` |
| Configit | Steering, Work-item ID 305 | `configit:subject:305` | `305` | `SubjectApplicationParticipationBrief.representativeEntity` |

The representatives carry their own citation IDs in `representativeEntity.citationId`. The persisted canonical entities do not supply a second citation-selection path; context construction creates and allowlists the citations. Product 360 must copy each selected representative's citation ID and validate it against the same `CopilotContextPacket.citations` allowlist.

Configit source data contains a `source-representation` subject for Steering, product-detail records, three configuration families (Market/MRKT, Drive Orientation, Steering Type), features, configuration rules and fields, localization records, and explicit subject-to-child relationships. In the Market family, the persisted `contains-feature` relationships point to the DEN, IND, and USA feature records. These child records remain drill-down data. They do not replace the Configit subject as the application representative.

The Configit `configit:detail:work-item-status` record stores `InProgress` in `properties.value.text` and is related to the subject by `has-product-context`. Treat this as available product-detail drill-down; do not make status a new representative-selection rule.

### Existing code paths and boundaries

- `classifyQuestion` in `frontend/features/lattice-next/copilot/context-builder.ts` owns the current intent routing. M1 is `relationship`, M2 is `impact`, and E1 is `summary`.
- `subjectApplicationParticipation` in the same file groups actual subject-traceability edges, applies the existing per-application representative policy, and calls `selectConfigitRepresentative` for Configit. Its resulting `SubjectApplicationParticipationBrief` already carries a representative entity ID, display label, kind, source application, citation ID, native ID, semantic role, and participant count.
- Application contribution wording is currently selected in the same context-builder path. There is no separate authoritative application-semantics registry to reuse; the future implementation should promote this existing mapping into one shared mapping while preserving current contribution text.
- `CopilotContextPacket` in `contracts.ts` carries question intent, selected evidence, citations, the EngineeringBrief, and reasoning data. `engineeringPromptPayload` in `context-builder.ts` projects the packet into the model-facing payload and has a compact four-application branch.
- `ensureEngineeringAnswerCoverage` supplements missing application participation claims. `execute-copilot-turn.ts` validates the answer against the context packet before persisting it with `appendTurn`.
- `CopilotAnswerContent.tsx` and `CopilotKitChatSurface.tsx` render the persisted answer and citation markers; the renderer does not choose or rerank representatives.
- `validateCopilotAnswer` in `answer-validator.ts` validates citation IDs against the supplied context. Product 360 is organization of existing evidence, not a new evidence authority.

### Context-budget measurement

Local context construction and serialization (no provider request) measured current broad-prompt context packets from 21,616 to 23,084 characters. The largest tested packet is 23,084 characters under the existing 24,000-character limit, leaving 916 characters. Its projected prompt payload is 12,883 characters.

A compact candidate primer/manifest measured 2,888 characters. Naively appending it to the largest packet would produce 25,996 characters, exceeding the limit by 1,996 characters. A projection that replaces duplicated application-participation and representative summary fields measured 22,851 characters, leaving 1,149 characters. This supports an intent-specific compact projection, not a larger limit or a universal append.

The implementation must measure the final serialized Product 360 context after projection and before any provider request. It must preserve representatives, their citations, verified relationship evidence, and evidence boundaries before optional drill-down metadata is reduced.

## Design Proposal (Routing Direction Selected)

### Contract

Add a typed `Product360PreContext` contract in `contracts.ts`, embedded in the model-facing `engineeringPromptPayload` only for `product-360`, with:

- `subject`: `id` and `displayName`; take these from the existing subject participation group (`subjectId` and `subjectLabel`).
- `applicationPrimer`: a compact static semantic contribution for each known participating application. The Codebeamer, Windchill, SAP, and Configit descriptions must match the semantics in the Product 360 request and contain no investigation-specific IDs, names, counts, or citations.
- `applicationManifest`: one entry per participating application, built directly from the existing `subjectApplicationParticipation` output. Each entry contains application, representative entity ID, representative display label, optional native ID, semantic kind, optional semantic role, participating-record count, the representative's existing citation ID, and compact drill-down availability.
- `verifiedRelationships`: compact summaries only for already-selected canonical or ontology-resolved relationships, with endpoint IDs/labels/applications and existing relationship/evidence citation IDs. Exclude subject-traceability edges, unresolved evaluations, and impact paths from this verified-relationship list.
- `evidenceBoundary`: preserve the current investigation-specific boundary and source completeness/freshness caveats. Make explicit that shared-subject participation is not evidence of direct connectivity or causality.

Each manifest representative's ID, label, native ID, kind/role, application, and citation must come from the same `representativeEntity` record. Do not reconstruct a citation or consult `EngineeringBrief.primaryEntities` to select or replace a representative. If a participating application has no selected representative, fail context construction explicitly using the repository's existing error/reporting convention; do not silently omit the application or synthesize a representative.

For drill-down metadata, use only compact categories supported by the investigation's existing source kinds and relationship data. Derive compact availability while full participation source kinds are still available, then retain it only in the `product-360` projection. Emit only available categories (boolean availability, with counts omitted unless a focused use case proves they are needed). Do not copy child entities. For the current persisted Configit graph, configuration families, features, rules/expressions, product/work-item details, and metadata are available; Market/MRKT remains a secondary family. Do not encode its children or any Steering-specific hierarchy in general logic.

The proposed shape is suitable with one refinement: `representativeCitationId` should be required for a valid manifest entry because the selected participation representative already has a citation ID and the manifest must preserve it. If future source data lacks that citation, fail explicitly instead of emitting a success-shaped uncited representative.

```ts
export interface Product360PreContext {
  subject: { id: string; displayName: string };
  applicationPrimer: readonly Product360ApplicationPrimer[];
  applicationManifest: readonly Product360ApplicationManifestEntry[];
  verifiedRelationships: readonly Product360RelationshipSummary[];
  evidenceBoundary: string;
}

export interface Product360ApplicationPrimer {
  application: string;
  contribution: string;
}

export interface Product360ApplicationManifestEntry {
  application: string;
  representativeEntityId: string;
  representativeDisplayLabel: string;
  nativeId?: string;
  semanticKind: string;
  semanticRole?: string;
  participatingRecordCount: number;
  representativeCitationId: string;
  drillDownCategories: readonly Product360DrillDownCategory[];
}

export interface Product360DrillDownCategory {
  key: string;
  label: string;
  available: true;
}

export interface Product360RelationshipSummary {
  relationshipId: string;
  category: "canonical" | "ontology-resolved";
  kind: string;
  sourceEntityId: string;
  sourceLabel: string;
  sourceApplication: string;
  targetEntityId: string;
  targetLabel: string;
  targetApplication: string;
  citationId: string;
  evidenceCitationIds: readonly string[];
}
```

### Application semantic primer

Use one application-semantics mapping in `context-builder.ts`. It should replace the existing inline contribution ternary rather than coexist as a second map. Keep existing short `contribution` values byte-for-byte compatible for existing M1/E1 output; add a separate static primer description to the same entry:

- Codebeamer: requirements, specifications, requirement structures, and requirement relationships.
- Windchill: engineering product definitions, parts, occurrences, structures, documents, and change records.
- SAP: operational materials and transaction-oriented records.
- Configit: product/work-item subjects, product models or contexts, configuration models, configuration families, features, rules, and expressions.

Do not treat these descriptions as investigation facts or as evidence that a relationship exists. For an application without a defined semantic entry, do not invent a domain description.

### Intent and routing

Add the first-class `product-360` value to the existing `CopilotContextPacket.questionIntent` union and extend `classifyQuestion` in place. Detect explicit broad-overview cues such as “Product 360 overview,” “everything known about this product across applications,” “summarize this product across systems,” “what information is available for this product,” and “complete investigation overview.”

Preserve focused-intent precedence. Root cause, risk, change, impact/consequence, dependency, evidence, relationship/connectivity, and focused document/requirements requests must resolve through their existing branches before Product 360 detection. Place Product 360 matching after all existing focused-intent branches, including document, and before the generic summary fallback. In particular:

- M1 remains `relationship`.
- M2 remains `impact`.
- E1 “What are the primary entities involved in this investigation?” remains `summary`.
- “What is the SAP material?”, “Which Configit families are available?”, “Which requirements are available?”, and “Which requirements are linked to the Windchill part?” must not become Product 360.
- A generic “Summarize this investigation only” retains existing `summary` intent; Product 360 requires a broad cross-system/product-overview cue.

Extend `isInvestigationScopedQuestion` and the existing subject participation construction for `product-360`; do not add a parallel routing framework.

### Context composition and answer behavior

Build the Product 360 pre-context only for `product-360`, inside `engineeringPromptPayload` after the existing application participation and question-specific evidence selection are available. Reuse the existing participation representative and its citation, not entity ranking or retrieval scores. Use the same budgeted canonical/ontology-resolved relationship selection already present in the context packet; do not retrieve, infer, or promote relationships for Product 360. The pre-context is a typed projection, not a second list stored alongside the EngineeringBrief.

Use a Product 360-specific compact projection in `engineeringPromptPayload`. The projection replaces duplicated generic summary/participation/representative fields in the model-facing payload instead of appending the primer and manifest to the existing full summary. Keep the pre-context inside the existing measured/budgeted context path: `execute-copilot-turn.ts` computes protected prompt characters from `engineeringPromptPayload` before allocating retrieved evidence, so Product 360 must be present in that projection before allocation. Include any compact drill-down availability metadata in the context packet only for `product-360`, so the packet's existing 24,000-character guard also measures it. Do not apply this projection or metadata to M1, E1, M2, or other focused intents.

The Product 360 answer-format instruction should require these sections:

1. Investigation subject and scope.
2. Codebeamer requirements view.
3. Windchill engineering view.
4. SAP operational/material view.
5. Configit configuration view.
6. Verified governed relationships.
7. Evidence boundaries and unavailable relationships.
8. Available drill-down areas.

Require one balanced section per participating application, the same representatives and citations as E1, and a clear distinction between subject participation and verified direct relationships. Claims about absence must be limited to what is recorded in available canonical/ontology evidence and retain partial/stale-source caveats. Do not infer operational consequences or causality.

Extend `ensureEngineeringAnswerCoverage` only for the `product-360` intent so all manifest applications and representative citations are covered. Keep the existing summary behavior for E1 and all focused behavior unchanged. The validated answer continues through the existing citation validator, conversation persistence, and UI renderer; no UI-specific selection or persistence schema is needed.

## Implementation File Map

| File | Responsibility |
|---|---|
| `frontend/features/lattice-next/copilot/contracts.ts` | Add the `product-360` intent value and typed Product 360 primer, manifest, drill-down, relationship-summary, and pre-context contracts; add optional per-participation drill-down metadata. |
| `frontend/features/lattice-next/copilot/context-builder.ts` | Add precise broad-overview classification, construct the pre-context from existing participation/evidence, reuse the existing application mapping, project Product 360 under the current budget, and preserve the current paths for all other intents. |
| `frontend/features/lattice-next/copilot/execute-copilot-turn.ts` | Add Product 360 answer-format/coverage routing while retaining current validation and persistence order. No live provider request is part of implementation validation. |
| `frontend/features/lattice-next/copilot/tests/document-intent.test.ts` | Pin broad Product 360 positive cases and focused/M1/M2/E1 negative cases. |
| `frontend/features/lattice-next/copilot/tests/context-builder.test.ts` | Pin manifest source, citations, relationships versus participation, category availability, source boundaries, compaction, and the 24,000-character limit. |
| `frontend/features/lattice-next/copilot/tests/current-investigation-traceability.test.ts` | Pin the saved-investigation representatives, counts, Configit subject priority, secondary Market/MRKT availability, and absence-of-link wording. |
| `frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts` | Use a mocked provider and persistence boundary to prove all application sections/citations survive answer coverage and are persisted. |
| `frontend/features/lattice-next/copilot/tests/configit-representative-selection.test.ts` | Preserve the general Configit semantic hierarchy and deterministic fallbacks; no fixture-specific exception. |
| `frontend/features/lattice-next/workspace/tests/copilot-answer-content.test.tsx` | Pin pass-through rendering of the persisted broad answer section and citations. No UI reranking change is planned. |

## Future Implementation Tasks

### Task 1: Add typed Product 360 contract and focused intent

**Files:**
- Modify: `frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `frontend/features/lattice-next/copilot/tests/document-intent.test.ts`

**Interfaces:**
- Add `"product-360"` to the existing `questionIntent` union.
- Add `Product360PreContext`, `Product360ApplicationPrimer`, `Product360ApplicationManifestEntry`, `Product360DrillDownCategory`, and `Product360RelationshipSummary` types as specified above.
- Keep `representativeCitationId` required and `nativeId` and `semanticRole` optional; omit drill-down counts.
- Add optional drill-down availability metadata to `SubjectApplicationParticipationBrief`; populate it only for `product-360` so existing M1/E1/M2 packet shapes and compaction remain unchanged.
- `classifyQuestion(message: string)` remains the existing classifier and returns the expanded intent union.

- [ ] **Step 1: Write failing intent tests** for the listed broad prompts and for M1, M2, E1, focused material/family/requirements/linkage prompts, and generic summary.
- [ ] **Step 2: Run the focused test** from `frontend`:

```powershell
npm test -- features/lattice-next/copilot/tests/document-intent.test.ts
```

Expected: before implementation, new broad prompts fail as `summary`, while existing intent expectations pass.

- [ ] **Step 3: Add the contract and classifier branch** in the existing files. Put Product 360 matching after focused intents and before the generic summary fallback; preserve the existing contribution wording.
- [ ] **Step 4: Re-run the focused test** and require all existing and new intent assertions to pass.
- [ ] **Step 5: Commit this task only after a separately approved implementation phase.**

### Task 2: Build the selected manifest and budgeted pre-context

**Files:**
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`

**Interfaces:**
- Add a focused builder in `context-builder.ts` that returns `Product360PreContext` from the existing packet/participation inputs; it must consume `SubjectApplicationParticipationBrief.representativeEntity` and must not accept a representative-ranking callback.
- Keep `Product360PreContext` in the model-facing `engineeringPromptPayload`; do not store a duplicate manifest on `CopilotContextPacket`.
- Derive the optional drill-down availability metadata from full participation `sourceKinds` before compacting, and attach it only to `SubjectApplicationParticipationBrief` values for `product-360`.
- Keep verified relationship summaries sourced from already-selected `CopilotRelationshipContext` entries with category `canonical` or `ontology-resolved` and existing citation IDs.

- [ ] **Step 1: Add failing manifest tests** for exact representative identity/label/native ID/role/citation, subject ID/label, participant counts, and no use of `EngineeringBrief.primaryEntities`.
- [ ] **Step 2: Add failing boundary tests** proving subject-traceability edges do not appear in `verifiedRelationships`, incomplete sources remain caveated, and an unavailable representative fails explicitly.
- [ ] **Step 3: Add failing drill-down tests** showing Configit subject priority is unchanged, Market/MRKT remains secondary and available, and child entities are not copied into the manifest.
- [ ] **Step 4: Add failing budget tests** requiring the full Product 360 packet/projection to remain at or below 24,000 characters, with representatives, citations, and evidence boundaries retained before optional categories are trimmed.
- [ ] **Step 5: Build the pre-context** from the existing balanced participation output; derive only availability categories supported by the investigation's source kinds and governed hierarchy. Do not hardcode any fixture identifier or child.
- [ ] **Step 6: Add the Product 360 compact projection** that replaces duplicated generic summary fields rather than appending another representative list. Leave M1/E1/M2 compaction branches unchanged.
- [ ] **Step 7: Run focused context and representative tests** and require exact saved-fixture values plus the existing no-impact/no-cross-link boundaries to pass.
- [ ] **Step 8: Commit this task only after a separately approved implementation phase.**

### Task 3: Add broad-answer coverage and mocked persistence regression

**Files:**
- Modify: `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Test: `frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `frontend/features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`

**Interfaces:**
- `ensureEngineeringAnswerCoverage` must use the Product 360 manifest for Product 360 coverage and the existing EngineeringBrief path for all current intents.
- Keep `validateCopilotAnswer` and `appendTurn` ordering unchanged; all Product 360 answer citations must be members of the packet citation allowlist.
- The executor integration test must mock provider output and conversation persistence; it must not make a live request.

- [ ] **Step 1: Write a failing mocked executor test** for the eight-section broad-answer shape, four balanced application representatives, all representative citations, evidence boundaries, and a persisted answer that retains those fields.
- [ ] **Step 2: Assert focused intent isolation** in the same test suite: M1, E1, and M2 continue through their existing coverage paths.
- [ ] **Step 3: Add Product 360 answer-format and coverage routing** without changing evidence validation or persistence behavior for other intents.
- [ ] **Step 4: Run the mocked executor regression** and require all representative citations to validate and persist.
- [ ] **Step 5: Add and run the renderer pass-through regression** to prove the persisted Product 360 sections and citation markers render verbatim; do not add UI selection logic.
- [ ] **Step 6: Commit this task only after a separately approved implementation phase.**

### Task 4: Verify the saved investigation and all protected baselines

**Files:**
- Test: `frontend/features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/configit-representative-selection.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/document-intent.test.ts`

- [ ] **Step 1: Add saved-investigation assertions** for the selected four representatives, Configit subject over Market/MRKT, child-category availability, 17/17/114/41 participation counts as fixture expectations only, zero ontology-resolved relationships, zero impact paths/chains, and no verified cross-application relationship.
- [ ] **Step 2: Run the focused test set** from `frontend`:

```powershell
npm test -- features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/document-intent.test.ts features/lattice-next/copilot/tests/current-investigation-traceability.test.ts features/lattice-next/copilot/tests/configit-representative-selection.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts
```

Include `features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`.

- [ ] **Step 3: Run ESLint on changed files** from `frontend`:

```powershell
npm run lint -- features/lattice-next/copilot/contracts.ts features/lattice-next/copilot/context-builder.ts features/lattice-next/copilot/execute-copilot-turn.ts features/lattice-next/copilot/tests/document-intent.test.ts features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/current-investigation-traceability.test.ts features/lattice-next/copilot/tests/configit-representative-selection.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/workspace/tests/copilot-answer-content.test.tsx
```

- [ ] **Step 4: Run `git diff --check`** and confirm no provider request or context-limit change occurred.
- [ ] **Step 5: Commit only after the implementation has separately passed review and is authorized.**

## Phase 1 Status

This document is the sole Phase 1 deliverable. No production or test files were edited, no tests were run, no provider request was made, and no commit or push was performed. The routing direction selected for this design is a first-class `product-360` intent. Implementation remains out of scope until the complete design is reviewed and a separate implementation phase is approved.

# E1 Primary Entities and Configit Selection Design

## Intent

Make E1's persisted structured **Primary entities** section agree with the four semantically primary, application-balanced representatives used by the investigation summary, E1 prose, and citations. For Configit, select the work-item/product subject before its subordinate configuration families or details.

## Goals and non-goals

- Select one primary representative per application present, using the existing application-balanced participation groups.
- Use a general Configit role hierarchy, grounded in entity kind, properties, and investigation relationships rather than a work-item ID or family-name exception.
- Build the persisted E1 section from the selected participation representatives and preserve each representative's own entity citation.
- Keep secondary families, features, rules, and metadata in the investigation for drill-down.
- Do not change M1 compaction, M2 evidence-state/citation behavior, ontology, impact reasoning, context limits, or implement Product 360/RAG behavior.
- Do not make a provider request or copy full entity payloads into the persisted answer.

## Approaches

1. **Correct semantic representative selection and use those participation representatives in E1 answer coverage (selected).** The Configit selector will apply the ordered hierarchy below; E1 coverage will append a compact section from those already-selected representative records. This fixes both the current Market-over-subject selection and the independently ranked short list used by the persisted section, without changing the UI or copying full entities.
2. **Change only answer coverage and override Configit there.** This would leave M1 and other investigation summaries identifying Market as the Configit representative and would create inconsistent E1 prose/summary/citations; it also risks becoming a hardcoded exception.
3. **Change the UI to derive a section from claims or citations.** The UI currently renders persisted answer text directly. Client-side reconstruction would diverge from the validated/persisted answer and introduce another selection path, so it is not appropriate.

## Evidence and current behavior

The persisted E1 answer includes all four application representatives in prose and cited claims, but its generated structured section includes only Codebeamer and Configit. `ensureEngineeringAnswerCoverage` generates that section from `EngineeringBrief.primaryEntities`, which is a separately ranked, capped list. The UI renders the persisted answer text and does not rerank entities.

The saved investigation contains Configit subject entity `configit:subject:305` with display name `Steering`, native ID `305`, and `sourceRole=participating-source-subject`. Its work-item ID, name, and status are represented by linked product-detail records; the authoring evidence records work item 305 as `InProgress`. The subject has `has-configuration-family` relationships to `configit:family:mrkt` and other families, and MRKT has feature children. The current representative priority ranks a configuration family above the participating-source subject, causing Market to be selected.

## Configit representative-selection policy

Use the first available suitable category, in this order:

1. Product/work-item subject, identified from an explicit work-item/product-subject role or equivalent authoritative subject evidence and links.
2. Product model.
3. Product context.
4. Configuration model.
5. Configuration family.
6. Feature.
7. Configuration rule or expression.
8. Metadata or attribute entity.

Within the selected category, use deterministic tie-breaking that favors an entity carrying its own work-item ID/name when available, then stable entity ID. Do not select by extraction order, entity count, generic retrieval rank, or label recognizability alone. Do not hardcode ID 305, MRKT, or child object names.

For the current investigation, the selected Configit representative should be `configit:subject:305`, displayed as **Steering, Work-item ID 305**, with semantic role **product/work-item subject** and its own entity citation. `configit:family:mrkt` remains a secondary configuration family and retains its own citation.

## Persisted representation and testing

The E1 coverage augmentation will build a compact display/citation representation from each selected subject-application representative (entity ID, display label, native ID where available, semantic kind/role, application, and entity citation ID). It will not rerank representatives or duplicate their complete entity payloads. Application labels, E1 answer coverage claims, persisted assistant payload, and rendered section must use the same selected representatives. The renderer remains unchanged.

Add a mocked persistence-boundary regression proving the exact four representatives, kinds/roles, applications, and citation IDs in the persisted structured section; prove Configit subject 305 wins over Market while Market remains available as a secondary family. Add deterministic fallback-order tests with no Configit subject. Verify the renderer displays the persisted section as stored without replacement or dropping entries. Include assertions that the M2 path and four-application context budget are unchanged.

Run only the requested persistence/rendering regression, `current-investigation-traceability.test.ts`, `context-builder.test.ts`, `execute-copilot-turn.test.ts` if augmentation changes, relevant representative-selection tests, changed-file ESLint, and `git diff --check`.
